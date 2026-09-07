/**
 * Load combinations + envelope (step 2d/2e).
 *
 * A LoadCombination is a weighted sum of LoadCases:
 *     u_combo = Σ_i  factor_i · u_case_i
 *
 * 1e-ORDE: linearity makes this trivial — because we solved each case in
 * isolation against the same K, we superpose displacements, reactions and
 * member end-forces.
 *
 * 2e-ORDE (P-Δ): superpositie is ONGELDIG — de vergroting hangt niet-lineair
 * van het totale lastniveau af. Wanneer de perCase-Map uit
 * solveAllCasesNonlinear komt (herkenbaar via getSecondOrderState), lost
 * combineResults de combinatie daarom ZELF geometrisch niet-lineair op:
 * gefactoreerde lasten samen het model in (solveCombinationSecondOrder),
 * met memoisatie per combinatie. computeEnvelope gebruikt combineResults en
 * envelopt dan automatisch over de échte per-combinatie-2e-orde-resultaten
 * (max/min over combinaties — geen superpositie).
 *
 * Then `computeEnvelope` sweeps all combinations and records per-element
 * min/max axial/shear/moment + per-node reaction extrema. Dat gebeurt over de
 * VOLLEDIGE stationsarrays van elke staaf, niet over de eindwaarden: het
 * veldmoment qL²/8 van een vrij opgelegde ligger zit tussen twee einden die
 * beide M = 0 dragen. The governing combination id (max |M| érgens op de
 * staaf) is captured so the UI can label the bar, mét de positie van dat
 * maximum (governingMPos_mm).
 *
 * Default combos are EN 1990 Eq. 6.10a/b (ULS) + 6.14a/6.15a/6.16a (SLS) for
 * a residential building — ψ-factors are simplified housing values used as
 * sensible v2 defaults (NOT a substitute for project-specific NA picks).
 */
import type {
  SolverResult, NodalDisp, NodalReaction, ElementForces,
  PlateResult, PlateElementStress,
} from "./types";
import { getSecondOrderState, solveCombinationSecondOrder } from "./engine";

// ── Public types ──────────────────────────────────────────────────────────

export interface LoadCombination {
  id: number;
  name: string;
  type: "uls" | "sls";
  /** Human-readable formula string for tooltips/labels. */
  formula: string;
  /** caseId → multiplicative factor. Cases not in the map contribute 0. */
  factors: Map<number, number>;
}

export interface EnvelopeElementSpan {
  N_min: number; N_max: number;
  V_min: number; V_max: number;
  M_min: number; M_max: number;
  /** Combination id producing the max |M| at this element. */
  governingCombinationId: number;
  /** The |M| value used for governing pick. */
  governingMAbs: number;
  /**
   * Positie van governingMAbs langs de staaf: mm vanaf de startknoop.
   * Het station met het grootste |M| binnen de maatgevende combinatie —
   * voor een vrij opgelegde ligger onder een gelijkmatig verdeelde last
   * dus het midden, niet een van de einden. Zonder stationsarrays
   * (terugvalpad) is dit 0 of L_mm, naargelang welk eindmoment wint.
   */
  governingMPos_mm: number;
}

export interface EnvelopeReaction {
  fx_min: number; fx_max: number;
  fz_min: number; fz_max: number;
}

export interface Envelope {
  elements: Map<number, EnvelopeElementSpan>;
  reactions: Map<number, EnvelopeReaction>;
  /** Largest |displacement| across all combinations (mm). */
  maxDisplacement: number;
  /** Combination id that produced the maxDisplacement. */
  maxDisplacementCombinationId: number | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────

// Conventional case-ID assignment used by the default model (see useFemStore).
const G = 1; // Permanent (dead)
const Q = 2; // Variabel (live)
const S = 3; // Sneeuw (snow)
const W = 4; // Wind

/**
 * EN 1990 default combinations for a residential building (Annex A1.1).
 * Simplified ψ values: ψ₀(Q)=0.7, ψ₀(S)=0.7, ψ₀(W)=0.6; ψ₁(Q)=0.5; ψ₂(Q)=0.3,
 * ψ₂(S)=0.2.  Combined γ·ψ values are baked into the factors below.
 */
export function defaultCombinations(): LoadCombination[] {
  return [
    {
      id: 1,
      name: "ULS 6.10a",
      type: "uls",
      formula: "1.35G + 1.5·ψ₀·Q + 1.5·ψ₀·S + 1.5·ψ₀·W",
      factors: new Map([[G, 1.35], [Q, 1.05], [S, 1.05], [W, 0.9]]),
    },
    {
      id: 2,
      name: "ULS 6.10b (Q leidend)",
      type: "uls",
      formula: "1.2G + 1.5Q + 1.5·ψ₀·S + 1.5·ψ₀·W",
      factors: new Map([[G, 1.2], [Q, 1.5], [S, 1.05], [W, 0.9]]),
    },
    {
      id: 3,
      name: "ULS 6.10b (S leidend)",
      type: "uls",
      formula: "1.2G + 1.5S + 1.5·ψ₀·Q + 1.5·ψ₀·W",
      factors: new Map([[G, 1.2], [S, 1.5], [Q, 1.05], [W, 0.9]]),
    },
    {
      id: 4,
      name: "ULS 6.10b (W leidend)",
      type: "uls",
      formula: "1.2G + 1.5W + 1.5·ψ₀·Q + 1.5·ψ₀·S",
      factors: new Map([[G, 1.2], [W, 1.5], [Q, 1.05], [S, 1.05]]),
    },
    {
      id: 5,
      name: "ULS uplift",
      type: "uls",
      formula: "0.9G + 1.5W",
      factors: new Map([[G, 0.9], [W, 1.5]]),
    },
    {
      id: 6,
      name: "SLS Karakteristiek",
      type: "sls",
      formula: "G + Q + ψ₀·S + ψ₀·W",
      factors: new Map([[G, 1.0], [Q, 1.0], [S, 0.7], [W, 0.6]]),
    },
    {
      id: 7,
      name: "SLS Frequent",
      type: "sls",
      formula: "G + ψ₁·Q + ψ₂·S",
      factors: new Map([[G, 1.0], [Q, 0.5], [S, 0.2]]),
    },
    {
      id: 8,
      name: "SLS Quasi-permanent",
      type: "sls",
      formula: "G + ψ₂·Q",
      factors: new Map([[G, 1.0], [Q, 0.3]]),
    },
  ];
}

// ── Combination helper ────────────────────────────────────────────────────

/**
 * Linear superposition of per-case SolverResults using combination factors.
 * Any node/element/reaction present in any of the contributing case results
 * shows up in the combined result. Missing values (case didn't touch that
 * node/element) contribute 0.
 */
export function combineResults(
  combo: LoadCombination,
  perCase: Map<number, SolverResult>,
): SolverResult {
  // ── 2e-orde-pad ─────────────────────────────────────────────────────────
  // perCase uit solveAllCasesNonlinear draagt de model-input mee: los deze
  // combinatie dan echt niet-lineair op (géén superpositie). Station-arrays
  // (N/V/M/w) komen daarmee rechtstreeks uit de niet-lineaire eindstand met
  // de gefactoreerde elementbelastingen. Gememoiseerd per combinatie zodat
  // App.tsx (per-combinatie) en computeEnvelope dezelfde solve delen.
  // Divergentie (last boven kritieke knikwaarde) gooit hier een duidelijke
  // NL-fout die via de bestaande engine-foutroute in de UI belandt.
  const so = getSecondOrderState(perCase);
  if (so) {
    const key = `${combo.id}|` + [...combo.factors.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([cid, f]) => `${cid}=${f}`)
      .join(",");
    let res = so.cache.get(key);
    if (res === undefined) {
      const solved = solveCombinationSecondOrder(so.input, combo);
      if (solved) {
        so.cache.set(key, solved);
        return solved;
      }
      // Combinatie activeert geen lasten → superpositie (triviaal ~nul).
    } else {
      return res;
    }
  }

  // ── 1e-orde-pad: lineaire superpositie ──────────────────────────────────
  // Union of all keys across the contributing cases.
  const nodeIds = new Set<number>();
  const beamIds = new Set<number>();
  const reactionIds = new Set<number>();

  for (const [caseId] of combo.factors) {
    const r = perCase.get(caseId);
    if (!r) continue;
    r.displacements.forEach((_, id) => nodeIds.add(id));
    r.elements.forEach((_, id) => beamIds.add(id));
    r.reactions.forEach((_, id) => reactionIds.add(id));
  }

  const displacements = new Map<number, NodalDisp>();
  let maxDisp = 0;
  for (const nid of nodeIds) {
    let ux = 0, uz = 0, ry = 0;
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(caseId);
      if (!r) continue;
      const d = r.displacements.get(nid);
      if (!d) continue;
      ux += factor * d.ux;
      uz += factor * d.uz;
      ry += factor * d.ry;
    }
    displacements.set(nid, { ux, uz, ry });
    const mag = Math.max(Math.abs(ux), Math.abs(uz));
    if (mag > maxDisp) maxDisp = mag;
  }

  const reactions = new Map<number, NodalReaction>();
  for (const rid of reactionIds) {
    let fx = 0, fz = 0, my = 0;
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(caseId);
      if (!r) continue;
      const rxn = r.reactions.get(rid);
      if (!rxn) continue;
      fx += factor * rxn.fx;
      fz += factor * rxn.fz;
      my += factor * rxn.my;
    }
    reactions.set(rid, { fx, fz, my });
  }

  const elements = new Map<number, ElementForces>();
  for (const bid of beamIds) {
    let N = 0, V = 0, Ms = 0, Me = 0;
    // For station arrays: take the largest set across active cases as
    // reference shape, and accumulate factor-weighted contributions per
    // station index. All cases for the same beam share identical stations[]
    // (the engine uses a fixed NUM_STATIONS=21 grid), so the index alignment
    // is safe.
    let L_mm = 0;
    let stations_mm: number[] = [];
    let normalForce: number[] = [];
    let shearForce: number[] = [];
    let bendingMoment: number[] = [];
    let deflection: number[] = [];
    let axialDisp: number[] = [];

    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(caseId);
      if (!r) continue;
      const ef = r.elements.get(bid);
      if (!ef) continue;
      N  += factor * ef.N;
      V  += factor * ef.V;
      Ms += factor * ef.M_start;
      Me += factor * ef.M_end;

      // Staaflengte overnemen van het eerste bijdragende geval, óók als dat
      // geval geen stationsarrays draagt: zonder L_mm kan het terugvalpad van
      // de omhullende de positie van het maatgevende eindmoment niet noemen.
      if (L_mm === 0) L_mm = ef.L_mm;

      // Lazily initialise / size the arrays from the first contributing case.
      if (stations_mm.length === 0 && ef.stations_mm.length > 0) {
        L_mm = ef.L_mm;
        stations_mm = ef.stations_mm.slice();
        normalForce   = new Array(ef.stations_mm.length).fill(0);
        shearForce    = new Array(ef.stations_mm.length).fill(0);
        bendingMoment = new Array(ef.stations_mm.length).fill(0);
        deflection    = new Array(ef.stations_mm.length).fill(0);
        axialDisp     = new Array(ef.stations_mm.length).fill(0);
      }
      for (let i = 0; i < ef.stations_mm.length && i < normalForce.length; i++) {
        normalForce[i]   += factor * (ef.normalForce[i]   ?? 0);
        shearForce[i]    += factor * (ef.shearForce[i]    ?? 0);
        bendingMoment[i] += factor * (ef.bendingMoment[i] ?? 0);
        // ?. — resultaten van vóór de veldzakking-uitbreiding missen deze arrays
        deflection[i]    += factor * (ef.deflection?.[i]  ?? 0);
        axialDisp[i]     += factor * (ef.axialDisp?.[i]   ?? 0);
      }
    }
    elements.set(bid, {
      N, V, M_start: Ms, M_end: Me,
      L_mm, stations_mm, normalForce, shearForce, bendingMoment,
      deflection, axialDisp,
    });
  }

  // ── Plaatspanningen superponeren ─────────────────────────────────────────
  // De componentspanningen (σx, σy, τxy) en membraankrachten (nx/ny/nxy)
  // zijn lineair in de last en superponeren dus exact; de AFGELEIDE
  // grootheden (von Mises, hoofdspanningen, hoek) zijn dat NIET en worden
  // ná combinatie opnieuw uit de gecombineerde componenten berekend.
  // Elementen matchen op index binnen dezelfde plaat: alle gevallen komen
  // uit dezelfde solve-run met identieke mesh (invalidatie wist alles bij
  // elke modelwijziging), dus de volgorde is stabiel.
  const plateIds = new Set<number>();
  for (const [caseId] of combo.factors) {
    perCase.get(caseId)?.plateElements?.forEach(p => plateIds.add(p.plateId));
  }
  let plateElements: PlateResult[] | undefined;
  if (plateIds.size > 0) {
    plateElements = [];
    for (const pid of plateIds) {
      // Referentiegeometrie: de eerste bijdrage levert corners/elementIds.
      let referentie: PlateResult | undefined;
      for (const [caseId] of combo.factors) {
        referentie = perCase.get(caseId)?.plateElements?.find(p => p.plateId === pid);
        if (referentie) break;
      }
      if (!referentie) continue;
      const n = referentie.elements.length;
      const gecombineerd: PlateElementStress[] = referentie.elements.map(el => ({
        elementId: el.elementId,
        corners: el.corners,
        sigmaX: 0, sigmaY: 0, tauXY: 0,
        vonMises: 0, sigma1: 0, sigma2: 0, angle: 0,
        nx: 0, ny: 0, nxy: 0,
      }));
      for (const [caseId, factor] of combo.factors) {
        const bron = perCase.get(caseId)?.plateElements?.find(p => p.plateId === pid);
        if (!bron) continue;
        for (let i = 0; i < n && i < bron.elements.length; i++) {
          const s = bron.elements[i];
          const d = gecombineerd[i];
          d.sigmaX += factor * s.sigmaX;
          d.sigmaY += factor * s.sigmaY;
          d.tauXY  += factor * s.tauXY;
          d.nx     += factor * s.nx;
          d.ny     += factor * s.ny;
          d.nxy    += factor * s.nxy;
        }
      }
      const ranges = {
        sigmaX: { min: Infinity, max: -Infinity },
        sigmaY: { min: Infinity, max: -Infinity },
        tauXY: { min: Infinity, max: -Infinity },
        vonMises: { min: Infinity, max: -Infinity },
        nx: { min: Infinity, max: -Infinity },
        ny: { min: Infinity, max: -Infinity },
        nxy: { min: Infinity, max: -Infinity },
      };
      for (const d of gecombineerd) {
        const { sigmaX: sx, sigmaY: sy, tauXY: t } = d;
        d.vonMises = Math.sqrt(sx * sx + sy * sy - sx * sy + 3 * t * t);
        const midden = (sx + sy) / 2;
        const straal = Math.hypot((sx - sy) / 2, t);
        d.sigma1 = midden + straal;
        d.sigma2 = midden - straal;
        d.angle = 0.5 * Math.atan2(2 * t, sx - sy);
        for (const [sleutel, waarde] of [
          ["sigmaX", d.sigmaX], ["sigmaY", d.sigmaY], ["tauXY", d.tauXY],
          ["vonMises", d.vonMises], ["nx", d.nx], ["ny", d.ny], ["nxy", d.nxy],
        ] as const) {
          const r = ranges[sleutel];
          if (waarde < r.min) r.min = waarde;
          if (waarde > r.max) r.max = waarde;
        }
      }
      plateElements.push({ plateId: pid, elements: gecombineerd, ranges });
    }
    if (plateElements.length === 0) plateElements = undefined;
  }

  return { displacements, reactions, elements, maxDisplacement: maxDisp, plateElements };
}

// ── Envelope ──────────────────────────────────────────────────────────────

/**
 * Extremen van ÉÉN staaf binnen ÉÉN combinatie, over de VOLLEDIGE staaf.
 *
 * Waarom niet op de eindwaarden: N/V/M van `ElementForces` zijn eindwaarden
 * (N/V aan het startuiteinde, M aan beide knopen). Een vrij opgelegde ligger
 * onder een gelijkmatig verdeelde last heeft M = 0 aan béíde einden; het
 * veldmoment qL²/8 zit ertussen. Hetzelfde geldt voor V (die van +qL/2 naar
 * −qL/2 loopt) en voor N zodra er axiale belasting over de staaf staat
 * (eigen gewicht van een kolom, een deellast). De stationsarrays dragen dat
 * verloop wél — 21 punten, dezelfde bron die de diagrammen en de
 * EN-toetsenvelop (`buildForcesEnvelope`) gebruiken.
 *
 * Terugval: zonder stationsarrays (oudere/gedegradeerde resultaten — zie de
 * `stations_mm.length === 0`-controle in de toetsbouwer) blijft alleen het
 * oude gedrag over: de eindwaarden. Dat is dan het beste dat er is.
 *
 * Tekenconventies ongemoeid: `normalForce`/`shearForce`/`bendingMoment`
 * dragen dezelfde conventie als N/V/M_start (trek-positief resp.
 * sagging-positief) — de adapter flipt beide op dezelfde plek.
 */
function staafExtremen(ef: ElementForces): {
  N_min: number; N_max: number;
  V_min: number; V_max: number;
  M_min: number; M_max: number;
  mAbs: number; mPos_mm: number;
} {
  const n = ef.stations_mm.length;
  if (n === 0) {
    const absStart = Math.abs(ef.M_start);
    const absEnd = Math.abs(ef.M_end);
    return {
      N_min: ef.N, N_max: ef.N,
      V_min: ef.V, V_max: ef.V,
      M_min: Math.min(ef.M_start, ef.M_end),
      M_max: Math.max(ef.M_start, ef.M_end),
      mAbs: Math.max(absStart, absEnd),
      mPos_mm: absEnd > absStart ? ef.L_mm : 0,
    };
  }
  let N_min = Infinity, N_max = -Infinity;
  let V_min = Infinity, V_max = -Infinity;
  let M_min = Infinity, M_max = -Infinity;
  let mAbs = -Infinity, mPos_mm = ef.stations_mm[0] ?? 0;
  for (let i = 0; i < n; i++) {
    const nx = ef.normalForce[i] ?? 0;
    const vx = ef.shearForce[i] ?? 0;
    const mx = ef.bendingMoment[i] ?? 0;
    if (nx < N_min) N_min = nx;
    if (nx > N_max) N_max = nx;
    if (vx < V_min) V_min = vx;
    if (vx > V_max) V_max = vx;
    if (mx < M_min) M_min = mx;
    if (mx > M_max) M_max = mx;
    // Strikt groter: bij gelijke |M| (symmetrisch verloop) wint het eerste
    // station, zodat de gemelde positie niet van afrondruis afhangt.
    const a = Math.abs(mx);
    if (a > mAbs) { mAbs = a; mPos_mm = ef.stations_mm[i] ?? 0; }
  }
  return { N_min, N_max, V_min, V_max, M_min, M_max, mAbs, mPos_mm };
}

/**
 * Sweep all combinations and record per-element min/max axial/shear/moment
 * over de VOLLEDIGE staaf (alle stations, niet alleen de eindwaarden — zie
 * staafExtremen), plus per-node reaction extrema and the largest
 * |displacement|. De maatgevende combinatie per staaf is die met het
 * grootste |M| érgens op de staaf; governingMPos_mm zegt wáár.
 */
export function computeEnvelope(
  combinations: LoadCombination[],
  perCase: Map<number, SolverResult>,
): Envelope {
  const elements = new Map<number, EnvelopeElementSpan>();
  const reactions = new Map<number, EnvelopeReaction>();
  let maxDisplacement = 0;
  let maxDisplacementCombinationId: number | null = null;

  // Pre-compute combined results once — we use each twice (once for elements,
  // once for reactions) and the maps are small.
  const combined: { combo: LoadCombination; res: SolverResult }[] = combinations.map(c => ({
    combo: c,
    res: combineResults(c, perCase),
  }));

  for (const { combo, res } of combined) {
    res.elements.forEach((ef, beamId) => {
      const e = staafExtremen(ef);
      const prev = elements.get(beamId);
      if (!prev) {
        elements.set(beamId, {
          N_min: e.N_min, N_max: e.N_max,
          V_min: e.V_min, V_max: e.V_max,
          M_min: e.M_min, M_max: e.M_max,
          governingCombinationId: combo.id,
          governingMAbs: e.mAbs,
          governingMPos_mm: e.mPos_mm,
        });
      } else {
        prev.N_min = Math.min(prev.N_min, e.N_min);
        prev.N_max = Math.max(prev.N_max, e.N_max);
        prev.V_min = Math.min(prev.V_min, e.V_min);
        prev.V_max = Math.max(prev.V_max, e.V_max);
        prev.M_min = Math.min(prev.M_min, e.M_min);
        prev.M_max = Math.max(prev.M_max, e.M_max);
        if (e.mAbs > prev.governingMAbs) {
          prev.governingCombinationId = combo.id;
          prev.governingMAbs = e.mAbs;
          prev.governingMPos_mm = e.mPos_mm;
        }
      }
    });

    res.reactions.forEach((r, nodeId) => {
      const prev = reactions.get(nodeId);
      if (!prev) {
        reactions.set(nodeId, {
          fx_min: r.fx, fx_max: r.fx,
          fz_min: r.fz, fz_max: r.fz,
        });
      } else {
        prev.fx_min = Math.min(prev.fx_min, r.fx);
        prev.fx_max = Math.max(prev.fx_max, r.fx);
        prev.fz_min = Math.min(prev.fz_min, r.fz);
        prev.fz_max = Math.max(prev.fz_max, r.fz);
      }
    });

    if (res.maxDisplacement > maxDisplacement) {
      maxDisplacement = res.maxDisplacement;
      maxDisplacementCombinationId = combo.id;
    }
  }

  return { elements, reactions, maxDisplacement, maxDisplacementCombinationId };
}
