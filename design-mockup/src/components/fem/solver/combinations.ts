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
 * De standaardcombinaties zijn NIET langer een vaste lijst: ze worden afgeleid
 * uit de belastinggevallen en de gevolgklasse volgens NEN-EN 1990 met de
 * Nederlandse nationale bijlage — zie `normcombinaties.ts` voor de tabellen,
 * de keuzes en de reden.
 */
import type {
  SolverResult, NodalDisp, NodalReaction, ElementForces,
  PlateResult, PlateElementStress,
} from "./types";
import {
  getScheefstandRichtingen,
  getSecondOrderState,
  solveCombinationSecondOrder,
} from "./engine";
import { STANDAARD_BIJLAGE, type NationaleBijlageCode } from "../../../lib/normAanduidingen";
import {
  genereerStandaardCombinaties,
  STANDAARD_BELASTINGGEVALLEN,
  STANDAARD_GEVOLGKLASSE,
  type CombinatieSoort,
  type GevalInvoer,
  type Gevolgklasse,
  type StandaardHerkomst,
} from "./normcombinaties";
import { materiaalasRanges, spanningInMateriaalassen } from "../../../lib/plaatMateriaal";

// ── Public types ──────────────────────────────────────────────────────────

export interface LoadCombination {
  id: number;
  name: string;
  type: "uls" | "sls";
  /** Human-readable formula string for tooltips/labels. */
  formula: string;
  /** caseId → multiplicative factor. Cases not in the map contribute 0. */
  factors: Map<number, number>;
  /**
   * Aanwezig = een standaardcombinatie, gemaakt door `normcombinaties.ts` en
   * door de store bijgehouden wanneer belastinggevallen of gevolgklasse
   * veranderen. Afwezig = een eigen combinatie (of een combinatie uit een
   * projectbestand van vóór september 2026); die raakt de app niet aan,
   * behalve dat de factor van een verwijderd belastinggeval eruit verdwijnt.
   */
  standaard?: StandaardHerkomst;
  /**
   * De richting van de initiële scheefstand in deze combinatie: +1 = +x,
   * −1 = −x. Gezet door `metScheefstandRichtingen`, dat elke combinatie in
   * twee varianten ontvouwt zodra er een scheefstand is; ontbreekt = de
   * richting van de solverinvoer. Wordt niet opgeslagen: het projectbestand
   * draagt de ononvouwen lijst.
   */
  scheefstandRichting?: 1 | -1;
  /**
   * Aanwezig = een EINDTOESTANDVARIANT van een UGT-combinatie: dezelfde
   * factoren, maar doorgerekend met de eindstijfheid van het hout
   * E_mean,fin = E_mean/(1 + ψ₂·k_def) (NEN-EN 1995-1-1 2.3.2.2(2)). Gezet door
   * `metEindtoestandVarianten` (lib/houtEindstijfheid.ts), alleen in een
   * statisch onbepaalde constructie met verschillend kruipgedrag. Wordt niet
   * opgeslagen, net als de scheefstandrichting.
   */
  eindtoestand?: { psi2: number };
}

/**
 * Verschuiving van het id van een eindtoestandvariant, per honderdste ψ₂:
 * id + EINDTOESTAND_COMBO_OFFSET · round(100·ψ₂). Zie `metEindtoestandVarianten`.
 */
export const EINDTOESTAND_COMBO_OFFSET = 10_000_000;

const EINDTOESTAND_KEY = "__femEindtoestand";

/**
 * Hang de gevallen van de eindtoestand voor één ψ₂ aan de perCase-Map van de
 * gewone doorrekening — hetzelfde patroon als de tweede-orde-status. Zo leest
 * `combineResults` (en daarmee `computeEnvelope`) voor een variant de juiste
 * set, zonder dat een aanroeper iets extra hoeft mee te geven.
 */
export function zetEindtoestandGevallen(
  perCase: Map<number, SolverResult>,
  psi2: number,
  gevallen: Map<number, SolverResult>,
): void {
  const p = perCase as unknown as Record<string, Map<number, Map<number, SolverResult>> | undefined>;
  (p[EINDTOESTAND_KEY] ??= new Map()).set(psi2, gevallen);
}

/** De gevallen van de eindtoestand voor ψ₂, of undefined als die niet is doorgerekend. */
export function getEindtoestandGevallen(
  perCase: Map<number, SolverResult>,
  psi2: number,
): Map<number, SolverResult> | undefined {
  const p = perCase as unknown as Record<string, Map<number, Map<number, SolverResult>> | undefined>;
  return p[EINDTOESTAND_KEY]?.get(psi2);
}

/**
 * Verschuiving van het combinatie-id van de variant met de tegengestelde
 * scheefstandrichting. De primaire variant houdt het oorspronkelijke id, zodat
 * alles wat op dat id zoekt (resultaatkiezer, rapport) blijft werken.
 */
export const SCHEEFSTAND_COMBO_OFFSET = 1_000_000;

/** Kort label van een scheefstandrichting, voor combinatienamen. */
export function scheefstandRichtingLabel(richting: 1 | -1): string {
  return richting === 1 ? "+x" : "−x";
}

/**
 * Elke combinatie in twee varianten: met de scheefstand in de primaire en in
 * de tegengestelde richting (EN 1993-1-1 5.3.2(2): "in de meest ongunstige
 * richting"; 5.3.2(8)). De omhullende en de toetsing nemen daarna per staaf
 * de ongunstigste van de twee; welke dat was, staat in de naam.
 *
 * `aan = false` (geen scheefstand) geeft de lijst ongewijzigd terug; een
 * combinatie die al een richting draagt wordt niet nog eens ontvouwd.
 */
export function metScheefstandRichtingen(
  combinations: LoadCombination[],
  aan: boolean,
  primair: 1 | -1 = 1,
): LoadCombination[] {
  if (!aan) return combinations;
  const uit: LoadCombination[] = [];
  for (const c of combinations) {
    if (c.scheefstandRichting !== undefined) {
      uit.push(c);
      continue;
    }
    const tegen = (-primair) as 1 | -1;
    uit.push({
      ...c,
      scheefstandRichting: primair,
      name: `${c.name} (scheefstand ${scheefstandRichtingLabel(primair)})`,
    });
    uit.push({
      ...c,
      id: c.id + SCHEEFSTAND_COMBO_OFFSET,
      scheefstandRichting: tegen,
      name: `${c.name} (scheefstand ${scheefstandRichtingLabel(tegen)})`,
    });
  }
  return uit;
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

/**
 * De soorten standaardcombinatie die GEEN ENKELE toets van een stalen staaf leest:
 * de frequente (6.15) en de quasi-blijvende (6.16) BGT-combinatie.
 *
 * NEN-EN 1990 6.5.3(1): de te beschouwen belastingscombinaties horen te passen
 * bij de bruikbaarheidseis die getoetst wordt. De norm merkt daarbij op
 * (6.5.3(2)) dat de frequente combinatie normaliter voor omkeerbare
 * grenstoestanden dient en de quasi-blijvende voor langetermijneffecten en het
 * uiterlijk van de constructie. In DEZE app is dat concreet:
 *
 *   6.14 karakteristiek  → de doorbuigingstoets van staal én hout
 *                          (steelCheckBuilder, timberCheckBuilder), en bij
 *                          een verticale stalen staaf de zijdelingse eis
 *                          van NEN-EN 1990 A1.4.3(7)
 *   6.15 frequent        → de SCHEURBEHEERSING van beton, §7.3
 *                          (betonCheckBuilder → `sls_frequent_envelope`).
 *                          Tot september 2026 las geen enkele toets deze
 *                          combinatie; sinds §7.3 er is, is zij de ENIGE
 *                          juiste voor de scheurwijdte. De nationale bijlage
 *                          bij 7.3.1(5) vervangt tabel 7.1N door een tabel
 *                          waarvan alle kolommen de frequente combinatie
 *                          noemen, waar de EN-tekst de quasi-blijvende noemt.
 *   6.16 quasi-blijvend  → de kruipvervorming van hout
 *                          (`deflection_quasi_perm_mm`) en, via de BGT-tak met
 *                          tension stiffening, de betonstijfheid
 *
 * MAAR OOK STAAL LEEST 6.15 EN 6.16 zodra een staaf de vloer- of dakeis
 * krijgt: A1.4.3(3) meet w₂ + w₃ van een vloer bij de frequente combinatie en
 * A1.4.3(4) w_max bij de quasi-blijvende, "bij zowel vloeren als daken" — los
 * van kruip. De staalbouwer weegt alle drie de uitdrukkingen. Tot september
 * 2026 (issue #10) stond hier dat staal ze nooit leest; daardoor viel in een
 * stalen ligger de quasi-blijvende combinatie met ψ₂·Q weg.
 *
 * Alleen een model met UITSLUITEND staal en UITSLUITEND overwegend verticale
 * staven zonder gekozen doorbuigingsklasse (zijdelingse eis, A1.4.3(7))
 * levert met deze twee combinaties dus rekentijd, tabelkolommen en
 * rapportregels op waar niets mee gedaan wordt. `selecteerCombinaties`
 * (lib/combinatieSelectie.ts) laat ze dan weg — met zichtbare reden, en
 * uitsluitend zolang ze ONGEWIJZIGD zijn.
 *
 * MET ÉÉN UITZONDERING, sinds september 2026: de opstelling van 6.16b zonder
 * veranderlijke gevallen is "alleen de blijvende belasting", en daar leest de
 * STAALtoetsing w₁ uit — het deel dat NEN-EN 1990:2002/NB:2019 A1.4.3(2) van
 * w_tot aftrekt om w₂ + w₃ te krijgen. Die opstelling wordt dus nooit
 * weggelaten; zie `selecteerCombinaties`.
 *
 * Herkend op SOORT en niet meer op id: sinds de set uit de belastinggevallen
 * wordt afgeleid, heeft een frequente combinatie geen vast nummer meer.
 */
export const SOORTEN_BUITEN_STAAL: readonly CombinatieSoort[] = ["6.15b", "6.16b"];

/**
 * De standaardcombinaties voor `loadCases` in `gevolgklasse`, met id's 1…n.
 * Zonder argumenten: de vier gevallen van een nieuw model (G = 1, Q = 2,
 * S = 3, W = 4) in CC2 — de lijst waarmee de store en de sidecar beginnen.
 * De afleiding zelf staat in `normcombinaties.ts`.
 */
export function defaultCombinations(
  loadCases: readonly GevalInvoer[] = STANDAARD_BELASTINGGEVALLEN,
  gevolgklasse: Gevolgklasse = STANDAARD_GEVOLGKLASSE,
  bijlage: NationaleBijlageCode = STANDAARD_BIJLAGE,
): LoadCombination[] {
  return genereerStandaardCombinaties(loadCases, gevolgklasse, bijlage).map((c, i) => ({
    ...c,
    id: i + 1,
  }));
}

/**
 * Welke norm-uitdrukking deze combinatie is. Een standaardcombinatie draagt dat
 * in haar kenmerk. Voor een eigen combinatie, of een combinatie uit een ouder
 * projectbestand, is de NAAM het enige spoor — dezelfde herkenning die de
 * toetsbouwers tot september 2026 gebruikten. `null` = niet te herkennen.
 */
export function soortVanCombinatie(c: LoadCombination): CombinatieSoort | null {
  if (c.standaard) return c.standaard.soort;
  if (c.type === "sls") {
    if (/karakter/i.test(c.name)) return "6.14b";
    if (/frequent/i.test(c.name)) return "6.15b";
    if (/quasi/i.test(c.name)) return "6.16b";
    return null;
  }
  if (/6\.10a/.test(c.name)) return "6.10a";
  if (/6\.10b/.test(c.name)) return "6.10b";
  return null;
}

/**
 * ALLE combinaties van één soort, in lijstvolgorde. Een toets die een
 * bruikbaarheidseis bij "de karakteristieke combinatie" moet leggen, hoort over
 * deze hele lijst te envelopperen: er is een karakteristieke combinatie PER
 * leidende veranderlijke last (A1.4.3(3) en (7)), en de eerste treffer nemen
 * maakt de uitkomst afhankelijk van de volgorde waarin combinaties toevallig
 * staan.
 */
export function combinatiesVanSoort(
  combinations: readonly LoadCombination[],
  soort: CombinatieSoort,
): LoadCombination[] {
  return combinations.filter((c) => soortVanCombinatie(c) === soort);
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
  // ── Eindtoestandvariant (EN 1995-1-1 2.3.2.2(2)) ─────────────────────────
  // Dezelfde superpositie, maar over de gevallen die met E_mean,fin zijn
  // doorgerekend. Ontbreken die, dan is dat een fout en geen terugval op de
  // gewone gevallen: dan zou de variant stil gelijk zijn aan de combinatie.
  if (combo.eindtoestand !== undefined) {
    const fin = getEindtoestandGevallen(perCase, combo.eindtoestand.psi2);
    if (fin === undefined) {
      throw new Error(
        `Combinatie "${combo.name}" is een eindtoestandvariant (E_mean,fin, ` +
          "NEN-EN 1995-1-1 2.3.2.2(2)), maar de eindtoestand is niet doorgerekend. " +
          "Er wordt niet stil met E_mean gerekend.",
      );
    }
    if (getSecondOrderState(perCase)) {
      throw new Error(
        `Combinatie "${combo.name}": een eindtoestandvariant hoort bij een eerste-orde-` +
          "berekening (NEN-EN 1995-1-1 2.2.2(1)P); bij tweede orde wordt hij niet gerekend.",
      );
    }
    const basis: LoadCombination = { ...combo };
    delete basis.eindtoestand;
    return combineResults(basis, fin);
  }

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
  //
  // Met een scheefstand staan de gevallen tweemaal in de Map: onder hun eigen
  // id met de primaire richting en onder id + offset met de tegengestelde.
  // Een combinatievariant met de tegengestelde richting leest de tweede set;
  // een combinatie zonder richting (of met de primaire) de eerste.
  const sr = getScheefstandRichtingen(perCase);
  const tegen = sr !== undefined && combo.scheefstandRichting !== undefined &&
    combo.scheefstandRichting !== sr.primair;
  const idVan = (caseId: number): number => (tegen ? caseId + sr!.offset : caseId);
  // Union of all keys across the contributing cases.
  const nodeIds = new Set<number>();
  const beamIds = new Set<number>();
  const reactionIds = new Set<number>();

  for (const [caseId] of combo.factors) {
    const r = perCase.get(idVan(caseId));
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
      const r = perCase.get(idVan(caseId));
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
      const r = perCase.get(idVan(caseId));
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
    // θ(x) = dw/dx is lineair in de belasting — de afgeleide van een
    // superponeerbare w superponeert met dezelfde factoren.
    let rotation: number[] = [];

    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(idVan(caseId));
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
        rotation      = new Array(ef.stations_mm.length).fill(0);
      }
      for (let i = 0; i < ef.stations_mm.length && i < normalForce.length; i++) {
        normalForce[i]   += factor * (ef.normalForce[i]   ?? 0);
        shearForce[i]    += factor * (ef.shearForce[i]    ?? 0);
        bendingMoment[i] += factor * (ef.bendingMoment[i] ?? 0);
        // ?. — resultaten van vóór de veldzakking-uitbreiding missen deze arrays
        deflection[i]    += factor * (ef.deflection?.[i]  ?? 0);
        axialDisp[i]     += factor * (ef.axialDisp?.[i]   ?? 0);
        rotation[i]      += factor * (ef.rotation?.[i]    ?? 0);
      }
    }
    elements.set(bid, {
      N, V, M_start: Ms, M_end: Me,
      L_mm, stations_mm, normalForce, shearForce, bendingMoment,
      deflection, axialDisp, rotation,
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
    perCase.get(idVan(caseId))?.plateElements?.forEach(p => plateIds.add(p.plateId));
  }
  let plateElements: PlateResult[] | undefined;
  if (plateIds.size > 0) {
    plateElements = [];
    for (const pid of plateIds) {
      // Referentiegeometrie: de eerste bijdrage levert corners/elementIds.
      let referentie: PlateResult | undefined;
      for (const [caseId] of combo.factors) {
        referentie = perCase.get(idVan(caseId))?.plateElements?.find(p => p.plateId === pid);
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
        const bron = perCase.get(idVan(caseId))?.plateElements?.find(p => p.plateId === pid);
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
        // Materiaalassen: opnieuw uit de GECOMBINEERDE globale componenten,
        // met dezelfde hoek als de engine (de hoofdrichting hoort bij de
        // plaat, niet bij het belastinggeval). Lineair, dus gelijk aan het
        // combineren van σ₁/σ₂/τ₁₂ per geval — maar zo staat de regel één keer.
        if (referentie.materiaalassen) {
          d.materiaalassen = spanningInMateriaalassen(sx, sy, t, referentie.materiaalassen.hoekGraden);
        }
        for (const [sleutel, waarde] of [
          ["sigmaX", d.sigmaX], ["sigmaY", d.sigmaY], ["tauXY", d.tauXY],
          ["vonMises", d.vonMises], ["nx", d.nx], ["ny", d.ny], ["nxy", d.nxy],
        ] as const) {
          const r = ranges[sleutel];
          if (waarde < r.min) r.min = waarde;
          if (waarde > r.max) r.max = waarde;
        }
      }
      plateElements.push({
        plateId: pid, elements: gecombineerd, ranges,
        ...(referentie.materiaalassen
          ? { materiaalassen: materiaalasRanges(gecombineerd, referentie.materiaalassen.hoekGraden) }
          : {}),
      });
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
  // Een aanroeper die de lijst niet zelf heeft ontvouwd, krijgt hier alsnog
  // beide scheefstandrichtingen in de omhullende — zo kan de omhullende nooit
  // stil op één richting berusten.
  const sr = getScheefstandRichtingen(perCase);
  if (sr && combinations.every((c) => c.scheefstandRichting === undefined)) {
    combinations = metScheefstandRichtingen(combinations, true, sr.primair);
  }
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
