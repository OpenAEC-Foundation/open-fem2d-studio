/**
 * engine.ts — FEM solver entry point for v2.
 *
 *   UI state (SolverInput / SolverResult, units mm / N / N·mm)
 *      │
 *      ▼
 *   unit conversion → Mesh (units m / Pa / m² / m⁴ / N·m)
 *      │
 *      ▼
 *   solveNonlinear(mesh, { analysisType: 'frame' })
 *      │
 *      ▼
 *   unit conversion → SolverResult
 *
 * The FEM engine lives in `src/core/` (own code of this app — fem / solver /
 * math / mesher: Newton-Raphson, mixed analyses, FNL materials, Winkler
 * foundations). This file is the unit-conversion + type-adapter layer
 * between the UI's compact data shape and the engine's Mesh class. It does
 * NO FEM math itself — that all sits in `src/core/`.
 */
import { Mesh } from "../../../core/fem/Mesh";
import { solveNonlinear } from "../../../core/solver/NonlinearSolver";
import { assembleGlobalStiffnessMatrix, buildNodeIdToIndex, getDofsPerNode } from "../../../core/solver/Assembler";
import { calculateBeamLength, calculateBeamAngle, calculateBeamLocalStiffness } from "../../../core/fem/Beam";
import type {
  SolverInput,
  SolverResult,
  MultiInput,
  MultiLcResult,
  NodalDisp,
  NodalReaction,
  ElementForces,
} from "./types";

type AnyMesh = any; // structural typing — Mesh shape from core/fem/Mesh

// ── Helpers ─────────────────────────────────────────────────────────────────

function applySupportToMesh(mesh: AnyMesh, meshNodeId: number, support: SolverInput["supports"][number]): void {
  const k = support.k ?? 0;
  switch (support.type) {
    case "pinned":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: true, rotation: false } });
      break;
    case "fixed":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: true, rotation: true } });
      break;
    case "xRoller":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: false, rotation: false } });
      break;
    case "zRoller":
      mesh.updateNode(meshNodeId, { constraints: { x: false, y: true, rotation: false } });
      break;
    // Veren: k ≤ 0 of ontbrekend → star (contract in types.ts) — een veer met
    // stijfheid 0 zou het DOF vrij én onverend laten en het stelsel singulier
    // maken. springY/X/Rot alleen zetten bij k > 0.
    case "zSpring":
      // canonical k (N/mm) → mesh (N/m): × 1000
      mesh.updateNode(meshNodeId, k > 0
        ? { constraints: { x: false, y: true, rotation: false, springY: k * 1000 } }
        : { constraints: { x: false, y: true, rotation: false } });
      break;
    case "xSpring":
      mesh.updateNode(meshNodeId, k > 0
        ? { constraints: { x: true, y: false, rotation: false, springX: k * 1000 } }
        : { constraints: { x: true, y: false, rotation: false } });
      break;
    case "rotSpring":
      // canonical k (N·mm/rad) → mesh (N·m/rad): / 1000
      mesh.updateNode(meshNodeId, k > 0
        ? { constraints: { x: false, y: false, rotation: true, springRot: k / 1000 } }
        : { constraints: { x: false, y: false, rotation: true } });
      break;
  }
}

/**
 * Build a Mesh from a SolverInput, returning the mesh + id maps so the
 * caller can convert results back. Caller is responsible for invoking
 * solveNonlinear and reading from result via the id maps.
 *
 * `loadFactor` bepaalt per belastinggeval de multiplicatieve factor waarmee
 * de lasten het model in gaan (undefined → 1 voor alles). Hiermee bouwt
 * hetzelfde pad zowel één-geval-meshes (factor 1/0) als GEFACTOREERDE
 * combinatie-meshes voor de 2e-orde-berekening.
 */
function buildMesh(input: SolverInput | MultiInput, loadFactor?: (caseId?: number) => number): {
  mesh: AnyMesh;
  nodeIdMap: Map<number, number>;
  beamIdMap: Map<number, number>;
} {
  const mesh = new Mesh();
  const nodeIdMap = new Map<number, number>();
  const beamIdMap = new Map<number, number>();

  // Materialen: één mesh-materiaal per unieke E-waarde, zodat een gemengd
  // model (bv. staal + hout) per staaf zijn eigen E behoudt. Voorheen werd
  // E van de eerste staaf op default-materiaal 1 gemuteerd en deelde het
  // hele model die ene E — fout zodra staven verschillende E hebben.
  const matTemplate = mesh.getMaterial(1); // default staal — bron voor nu/rho/alpha
  const materialIdByE = new Map<number, number>();
  const materialIdForE = (E_Nmm2: number): number => {
    const cached = materialIdByE.get(E_Nmm2);
    if (cached !== undefined) return cached;
    const created = mesh.addMaterial({
      name: `E=${E_Nmm2} N/mm²`,
      E: E_Nmm2 * 1e6, // N/mm² → Pa
      nu: matTemplate?.nu ?? 0.3,
      rho: matTemplate?.rho ?? 7850,
      color: matTemplate?.color ?? "#3b82f6",
      alpha: matTemplate?.alpha ?? 12e-6,
    });
    materialIdByE.set(E_Nmm2, created.id);
    return created.id;
  };

  // Nodes: mm → m
  for (const n of input.nodes) {
    const meshNode = mesh.addNode(n.x / 1000, n.z / 1000);
    nodeIdMap.set(n.id, meshNode.id);
  }

  // Supports
  for (const s of input.supports) {
    const meshNid = nodeIdMap.get(s.nodeId);
    if (meshNid === undefined) continue;
    applySupportToMesh(mesh, meshNid, s);
  }

  // Beams: mm² → m², mm⁴ → m⁴; preserve scharnier (startConnection/endConnection)
  for (const b of input.beams) {
    const fromId = nodeIdMap.get(b.from);
    const toId   = nodeIdMap.get(b.to);
    if (fromId === undefined || toId === undefined) continue;
    const section = {
      A: (b.A ?? 3877) * 1e-6,
      I: (b.I ?? 1.673e7) * 1e-12,
      h: 0.2, // default depth — only used for plate analysis
    };
    const meshBeam = mesh.addBeamElement([fromId, toId], materialIdForE(b.E ?? 210000), section);
    if (!meshBeam) continue;
    beamIdMap.set(b.id, meshBeam.id);

    // Releases doorgeven aan de mesh (die condenseert via applyEndReleases).
    // Twee vormen: het legacy scharnierpaar startConnection/endConnection
    // (alleen Rz) en het volledige releases-object met ook Tx (axiaal,
    // normaalkrachthuls) en Tz (dwars, dwarskrachthuls) in LOKALE assen.
    // Met translatie-releases gaat het per-DOF-connectiemodel mee; zonder
    // blijft het legacy pad bit-identiek.
    const updates: any = {};
    const rel = (b as any).releases as {
      startTx?: boolean; startTz?: boolean; startRy?: boolean;
      endTx?: boolean; endTz?: boolean; endRy?: boolean;
    } | undefined;
    const heeftTransRelease = !!(rel && (rel.startTx || rel.startTz || rel.endTx || rel.endTz));
    if (heeftTransRelease) {
      const startRz = rel!.startRy || (b as any).startConnection === "hinge";
      const endRz   = rel!.endRy   || (b as any).endConnection   === "hinge";
      updates.startConnections = {
        Tx: rel!.startTx ? "hinge" : "fixed",
        Tz: rel!.startTz ? "hinge" : "fixed",
        Rz: startRz ? "hinge" : "fixed",
      };
      updates.endConnections = {
        Tx: rel!.endTx ? "hinge" : "fixed",
        Tz: rel!.endTz ? "hinge" : "fixed",
        Rz: endRz ? "hinge" : "fixed",
      };
    } else {
      if ((b as any).startConnection === "hinge" || rel?.startRy) updates.startConnection = "hinge";
      if ((b as any).endConnection === "hinge"   || rel?.endRy)   updates.endConnection   = "hinge";
    }
    if (Object.keys(updates).length > 0) mesh.updateBeamElement(meshBeam.id, updates);
  }

  // Scheefstand: elke verticale last krijgt een equivalente horizontale
  // metgezel H = φ·V (richting ±x). Lineair in de last, dus per-geval-
  // factoren en combinaties schalen automatisch mee — zie ScheefstandInput.
  const sch = (input as any).scheefstand as { phi: number; richting: 1 | -1 } | undefined;
  const schFactor = sch ? sch.richting * sch.phi : 0;

  // Distributed loads: N/mm → N/m, project qDir into qx/qy global axes
  const loads = (input as any).loads as Array<any> | undefined;
  if (loads) {
    for (const ld of loads) {
      const f = loadFactor ? loadFactor(ld.caseId) : 1;
      if (f === 0) continue;
      const beamMeshId = beamIdMap.get(ld.beamId);
      if (beamMeshId === undefined) continue;
      const qa = (ld.qStart ?? ld.q ?? 0) * 1000 * f;
      const qb = (ld.qEnd   ?? ld.q ?? 0) * 1000 * f;
      const dir = ld.qDir ?? "z";
      // Companion-qx uit scheefstand: −qy omdat qy < 0 = omlaag (gravitatie)
      // een H in +richting moet geven.
      const qxA = (dir === "x" ? qa : 0) + (dir === "z" ? schFactor * -qa : 0);
      const qyA = dir === "z" ? qa : 0;
      const qxB = (dir === "x" ? qb : 0) + (dir === "z" ? schFactor * -qb : 0);
      const qyB = dir === "z" ? qb : 0;

      // Deellast? (startFrac/endFrac, fracties 0..1; ontbreken = volle lengte)
      const aFrac = Math.min(1, Math.max(0, ld.startFrac ?? 0));
      const bFrac = Math.min(1, Math.max(0, ld.endFrac ?? 1));
      const isPartial = aFrac > 0 || bFrac < 1;

      const beam = mesh.getBeamElement(beamMeshId);
      if (!isPartial) {
        // Volle lengte: additief samenvoegen in het enkelvoudige
        // distributedLoad-veld — ONGEWIJZIGD pad (bit-stabiel regressie-anker).
        const ex = beam?.distributedLoad;
        mesh.updateBeamElement(beamMeshId, {
          distributedLoad: {
            qx: (ex?.qx ?? 0) + qxA,
            qy: (ex?.qy ?? 0) + qyA,
            qxEnd: (ex?.qxEnd ?? ex?.qx ?? 0) + qxB,
            qyEnd: (ex?.qyEnd ?? ex?.qy ?? 0) + qyB,
            coordSystem: "global",
          },
        });
      } else {
        // Deellast: eigen record in de distributedLoads-array — extents
        // verschillen per last en zijn dus niet additief samen te voegen.
        // De core sommeert over alle records (getBeamDistributedLoads).
        if (bFrac - aFrac <= 0) continue; // leeg belast deel → geen last
        const arr = beam?.distributedLoads ?? [];
        mesh.updateBeamElement(beamMeshId, {
          distributedLoads: [...arr, {
            qx: qxA, qy: qyA, qxEnd: qxB, qyEnd: qyB,
            startT: aFrac, endT: bFrac,
            coordSystem: "global" as const,
          }],
        });
      }
    }
  }

  // Point loads on nodes
  const pls = (input as any).pointLoads as Array<any> | undefined;
  if (pls) {
    for (const pl of pls) {
      const f = loadFactor ? loadFactor(pl.caseId) : 1;
      if (f === 0) continue;
      const meshNid = nodeIdMap.get(pl.nodeId);
      if (meshNid === undefined) continue;
      const node = mesh.getNode(meshNid);
      const ex = node?.loads ?? { fx: 0, fy: 0, moment: 0 };
      mesh.updateNode(meshNid, {
        loads: {
          // Scheefstand-companion: fx += φ·(−fz)·richting (fz < 0 = omlaag).
          fx: ex.fx + ((pl.fx ?? 0) + schFactor * -(pl.fz ?? 0)) * f,
          fy: ex.fy + (pl.fz ?? 0) * f,
          // my in N·mm → mesh moment in N·m  → /1000
          moment: ex.moment + ((pl.my ?? 0) / 1000) * f,
        },
      });
    }
  }

  // Thermische lasten: uniforme ΔT per staaf (K — geen eenheidsconversie),
  // additief over gevallen en gefactoreerd via loadFactor, net als q en F.
  // Thermiek is lineair in ΔT: in het 1e-orde-pad superponeert de combinatie
  // de per-geval-resultaten; in het 2e-orde-pad gaat de gefactoreerde ΔT hier
  // met de combinatie-mesh mee.
  //
  // α-KEUZE: de core rekent met material.alpha, en elk via materialIdForE
  // aangemaakte mesh-materiaal draagt de staal-default 12e-6 /K (matTemplate).
  // De UI geeft (nog) geen α per staaf door, dus élk materiaal — ook hout —
  // krijgt de default α = 1,2e-5 /K, tenzij de last zelf `alpha` meegeeft
  // (SolverThermalLoadInput.alpha). Voor hout (α∥ ≈ 3–5e-6 /K) overschat die
  // default de verhinderde thermische krachten circa factor 2,5–4 —
  // conservatief voor de toetsing van gedwongen vervormingen. Materiaal→α
  // doorgeven vanuit App.tsx is een gedocumenteerde vervolgtaak.
  //
  // Een per-last α wordt exact gehonoreerd via equivalent-ΔT-schaling:
  // de core gebruikt ΔT uitsluitend in α_mat·ΔT-producten, dus
  // ΔT_mesh = ΔT·(α_last/α_mat) geeft identiek E·A·α_last·ΔT.
  const tls = (input as any).thermalLoads as Array<any> | undefined;
  if (tls) {
    for (const tl of tls) {
      const f = loadFactor ? loadFactor(tl.caseId) : 1;
      if (f === 0 || !tl.deltaT) continue;
      const beamMeshId = beamIdMap.get(tl.beamId);
      if (beamMeshId === undefined) continue;
      const beam = mesh.getBeamElement(beamMeshId);
      if (!beam) continue;
      const alphaMat = mesh.getMaterial(beam.materialId)?.alpha ?? 12e-6;
      const alphaLoad = tl.alpha ?? 1.2e-5; // default staal — zie types.ts
      const ex = beam.thermalLoad?.deltaT ?? 0;
      mesh.updateBeamElement(beamMeshId, {
        thermalLoad: { deltaT: ex + tl.deltaT * (alphaLoad / alphaMat) * f },
      });
    }
  }

  return { mesh, nodeIdMap, beamIdMap };
}

/**
 * Convert engine ISolverResult → UI SolverResult, using the id maps from buildMesh.
 */
function convertResult(
  mesh: AnyMesh,
  engineResult: any,
  nodeIdMap: Map<number, number>,
  beamIdMap: Map<number, number>,
  supports: SolverInput["supports"],
): SolverResult {
  const displacements = new Map<number, NodalDisp>();
  const reactions = new Map<number, NodalReaction>();
  const elements = new Map<number, ElementForces>();

  // Build mesh-id → array-index lookup (matches order in Mesh.nodes Map)
  const meshNodes = Array.from(mesh.nodes.values());
  const indexById = new Map<number, number>();
  meshNodes.forEach((n: any, i: number) => indexById.set(n.id, i));

  let maxDisp = 0;
  for (const [uiId, meshId] of nodeIdMap) {
    const idx = indexById.get(meshId);
    if (idx === undefined) continue;
    const base = idx * 3;
    const ux_m = engineResult.displacements[base + 0] ?? 0;
    const uz_m = engineResult.displacements[base + 1] ?? 0;
    const ry   = engineResult.displacements[base + 2] ?? 0;
    const ux = ux_m * 1000, uz = uz_m * 1000;
    displacements.set(uiId, { ux, uz, ry });
    maxDisp = Math.max(maxDisp, Math.abs(ux), Math.abs(uz));

    const support = supports.find(s => s.nodeId === uiId);
    if (support) {
      let fx = engineResult.reactions[base + 0] ?? 0;
      let fz = engineResult.reactions[base + 1] ?? 0;
      let my_Nmm = (engineResult.reactions[base + 2] ?? 0) * 1000; // N·m → N·mm
      // Veerreacties: de core vult de reactievector alleen op STARRE DOF's;
      // een veer-DOF blijft vrij en meldt daar 0. De veerkracht is R = −k·u
      // (k canoniek N/mm resp. N·mm/rad, u in mm resp. rad — zie liftSpringK
      // in App.tsx en applySupportToMesh). k ≤ 0 werd hierboven star gezet en
      // levert dan wél een core-reactie, dus alleen bij k > 0 aanvullen.
      const k = support.k ?? 0;
      if (k > 0) {
        if (support.type === "zSpring")  fz = -k * uz;
        if (support.type === "xSpring")  fx = -k * ux;
        if (support.type === "rotSpring") my_Nmm = -k * ry;
      }
      reactions.set(uiId, { fx, fz, my: my_Nmm });
    }
  }

  // Beam internal forces — engineResult.beamForces[meshId] has:
  //   endpoint values N1/V1/M1/N2/V2/M2 (local, N en N·m)
  //   AND 21-station arrays stations[], normalForce[], shearForce[],
  //   bendingMoment[], deflection[], axialDisp[]
  // We forward ALL of it (with mm/N·mm units for the UI) so the canvas
  // can draw real parabola / step shapes instead of linear interpolation.
  for (const [uiId, meshId] of beamIdMap) {
    const bf = engineResult.beamForces.get(meshId);
    if (!bf) continue;
    const stations_m: number[] = bf.stations ?? [];
    const L_m: number = stations_m.length > 0 ? stations_m[stations_m.length - 1] : 0;
    elements.set(uiId, {
      // TEKENCONVENTIE N: de core levert druk-positief (f_local = K·d aan het
      // startpunt). De hele UI/rapport/toetsing hanteert de constructeurs-
      // conventie TREK POSITIEF (EN-contract n_ed idem), dus hier — op de ene
      // adapter-grens — wordt geflipt. Richting-onafhankelijk geverifieerd
      // (kolom from=onder én from=boven geven dezelfde druk): zie
      // test-n-teken.mjs.
      N: -bf.N1,
      V: bf.V1,
      M_start: bf.M1 * 1000, // N·m → N·mm
      M_end:   bf.M2 * 1000,
      L_mm: L_m * 1000,
      stations_mm:  stations_m.map((x: number) => x * 1000),
      normalForce:  (bf.normalForce ?? []).map((n: number) => -n),
      shearForce:   bf.shearForce   ?? [],
      bendingMoment: (bf.bendingMoment ?? []).map((m: number) => m * 1000), // N·m → N·mm
      deflection: (bf.deflection ?? []).map((w: number) => w * 1000), // m → mm (lokaal, +y)
      axialDisp:  (bf.axialDisp  ?? []).map((u: number) => u * 1000), // m → mm
    });
  }

  return { displacements, reactions, elements, maxDisplacement: maxDisp };
}

// ── Public engine functions ─────────────────────────────────────────────────

export function solve(input: SolverInput): SolverResult {
  const { mesh, nodeIdMap, beamIdMap } = buildMesh(input);
  const engineResult = solveNonlinear(mesh, { analysisType: "frame", geometricNonlinear: false });
  return convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports);
}

export function solveAllCases(input: MultiInput): MultiLcResult {
  const perCase = new Map<number, SolverResult>();
  for (const c of input.cases) {
    const { mesh, nodeIdMap, beamIdMap } = buildMesh(input, (caseId) => (caseId === c.id ? 1 : 0));
    // Een leeg belastinggeval (bijv. Q/S/W zonder ingevoerde lasten — de
    // standaardset heeft er vier) is geen fout: overslaan. De solver gooit er
    // anders "No loads applied" op en dat liet de hele combinatie-/toetsings-
    // pijplijn falen; combineResults behandelt een ontbrekend geval als
    // nulbijdrage, wat mechanisch exact klopt.
    if (!meshHeeftLasten(mesh)) continue;
    const engineResult = solveNonlinear(mesh, { analysisType: "frame", geometricNonlinear: false });
    perCase.set(c.id, convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports));
  }
  return { perCase };
}

/** Heeft de opgebouwde mesh ten minste één werkzame last (knoop, verdeeld of thermisch)? */
function meshHeeftLasten(mesh: unknown): boolean {
  for (const node of (mesh as any).nodes.values()) {
    const l = node.loads;
    if (l && (l.fx !== 0 || l.fy !== 0 || (l.moment ?? 0) !== 0)) return true;
  }
  for (const beam of (mesh as any).beamElements.values()) {
    const d = beam.distributedLoad;
    if (d && (d.qx !== 0 || d.qy !== 0 || (d.qxEnd ?? 0) !== 0 || (d.qyEnd ?? 0) !== 0)) return true;
    // Deellasten staan in de distributedLoads-array (eigen record per last).
    const dArr = beam.distributedLoads as Array<{ qx: number; qy: number; qxEnd?: number; qyEnd?: number }> | undefined;
    if (dArr && dArr.some(p => p.qx !== 0 || p.qy !== 0 || (p.qxEnd ?? 0) !== 0 || (p.qyEnd ?? 0) !== 0)) return true;
    // Thermische last telt ook: een verhinderde ΔT levert normaalkracht
    // zonder dat er knoop- of q-lasten bestaan.
    const t = beam.thermalLoad;
    if (t && ((t.deltaT ?? 0) !== 0 || t.deltaTTop !== undefined || t.deltaTBottom !== undefined)) return true;
  }
  return false;
}

// ── 2e-orde (P-Δ) per belastingcombinatie ──────────────────────────────────
//
// Superpositie is bij 2e-orde ONGELDIG: de vergroting hangt niet-lineair van
// het totale (gefactoreerde) lastniveau af. Daarom wordt per COMBINATIE een
// mesh met gefactoreerde lasten gebouwd en geometrisch niet-lineair opgelost
// (geïtereerde P-Δ: N uit vorige iteratie → KG → opnieuw, tot de relatieve
// verplaatsingsincrement-norm ‖Δu‖/‖u‖ ≤ 1e-6 — zie NonlinearSolver.ts).
//
// De koppeling met de UI loopt zónder App.tsx-wijziging: solveAllCasesNonlinear
// hangt de MultiInput + een resultaatcache als verborgen eigenschappen aan de
// perCase-Map; combineResults() in combinations.ts detecteert die en lost dan
// per combinatie niet-lineair op i.p.v. te superponeren. computeEnvelope()
// gebruikt combineResults en envelopt dus automatisch over de per-combinatie
// 2e-orde-resultaten (max/min, geen superpositie).

/** Minimale structurele vorm van een combinatie (combinations.LoadCombination past hierin). */
export interface SecondOrderCombo {
  id: number;
  name: string;
  factors: Map<number, number>;
}

interface SecondOrderState {
  input: MultiInput;
  cache: Map<string, SolverResult>;
}

const SECOND_ORDER_KEY = "__femSecondOrder";

/** Lees de 2e-orde-status die solveAllCasesNonlinear aan een perCase-Map hing. */
export function getSecondOrderState(perCase: Map<number, SolverResult>): SecondOrderState | undefined {
  return (perCase as any)[SECOND_ORDER_KEY];
}

/**
 * Los één combinatie 2e-orde op: gefactoreerde lasten samen het model in,
 * geometrisch niet-lineair. Retourneert null wanneer de combinatie geen
 * enkele last activeert (de aanroeper valt dan terug op superpositie, die
 * in dat geval triviaal nul is).
 *
 * Divergentie (belasting op/boven de kritieke knikwaarde) wordt door de core
 * gemeld als "P-Delta ..."-Error (niet-convergent of instabiel via de
 * negatieve-pivot-check); hier vertaald naar een duidelijke NL-melding mét
 * combinatienaam. Die stroomt via de bestaande engine-foutroute naar de UI
 * (App.tsx: try/catch → console.warn + setSolverOutputs(null)).
 *
 * BEPERKING station-arrays (N/V/M/w per station): de recovery gebeurt
 * LINEAIR op de niet-lineaire eindstand. De P-Δ-vergroting zit dus in de
 * knoopverplaatsingen/eindkrachten (en daarmee in de Hermite-interpolatie
 * tussen de knopen), maar BINNEN één element ontbreekt het extra P·δ-aandeel
 * t.o.v. de elementkoorde: w(x) gebruikt de 1e-orde particuliere oplossing
 * en M(x) = M1 + V1·x + ∫q neemt het interne P·w(x)-moment niet mee.
 * Mitigatie: staven onderverdelen (validatie: kolom met 4 elementen geeft
 * M_mid binnen ~2% van de exacte secansoplossing — zie test-tweede-orde.mjs).
 */
export function solveCombinationSecondOrder(
  input: MultiInput,
  combo: SecondOrderCombo,
): SolverResult | null {
  const { mesh, nodeIdMap, beamIdMap } = buildMesh(
    input,
    (caseId) => combo.factors.get(caseId ?? -1) ?? 0,
  );

  // Geen geactiveerde lasten in deze combinatie? → aanroeper superponeert (nul).
  if (!meshHeeftLasten(mesh)) return null;

  try {
    const engineResult = solveNonlinear(mesh, {
      analysisType: "frame",
      geometricNonlinear: true,
      // Geïtereerde P-Δ convergeert met ratio ≈ P/P_kr per iteratie; 100
      // iteraties dekt tot P ≈ 0.87·P_kr bij tol 1e-6. Daarboven → nette fout.
      maxIterations: 100,
      tolerance: 1e-6,
    });
    return convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/P-Delta/.test(msg)) {
      throw new Error(
        `2e-orde-berekening niet convergent voor combinatie "${combo.name}" — ` +
        `belasting op of boven de kritieke (knik)waarde. Verlaag de belasting ` +
        `of verzwaar de constructie.`,
      );
    }
    throw e;
  }
}

/**
 * Multi-geval-solve met 2e-orde (P-Δ) ingeschakeld.
 *
 * BEWUSTE KEUZE: de per-GEVAL-resultaten blijven 1e-orde — een los
 * belastinggeval is geen fysieke belastingtoestand (die ontstaat pas in een
 * combinatie), en 2e-orde-resultaten mogen niet gesuperponeerd worden. De
 * combinatie- en envelope-resultaten die de UI toont komen via
 * combineResults/computeEnvelope WEL uit het echte 2e-orde-pad (zie
 * getSecondOrderState + combinations.ts).
 */
export function solveAllCasesNonlinear(input: MultiInput): MultiLcResult {
  const { perCase } = solveAllCases(input);
  const state: SecondOrderState = { input, cache: new Map() };
  (perCase as any)[SECOND_ORDER_KEY] = state;
  return { perCase };
}

// ── Inspection helpers — for the Insights matrix viewer ────────────────────
// (Not the solver. These rebuild K/per-beam-K via core utilities for display.)

export interface ExposedBeamCache {
  id: number;
  E: number; A: number; L: number; c: number; s: number;
  kLocal: number[][];
  T: number[][];
  fromIdx: number;
  toIdx: number;
}

export interface Assembly {
  nodeIndex: Map<number, number>;
  nDof: number;
  K: number[][];
  beamCache: ExposedBeamCache[];
  rigidConstraints: { dof: number; supRef: number }[];
  springs: { dof: number; k: number; nodeId: number; axis: 0 | 1 | 2 }[];
}

/**
 * Build matrices WITHOUT solving — used by the Insights panel.
 * Delegates to core Assembler so the displayed K is identical to what the
 * solver internally uses.
 */
export function buildMatrices(input: { nodes: { id: number; x: number; z: number }[]; beams: { id: number; from: number; to: number; E?: number; A?: number; I?: number }[]; supports: { nodeId: number; type: string; k?: number }[] }): {
  K: number[][]; nDof: number; nodeIndex: Map<number, number>;
  beams: ExposedBeamCache[];
  rigidConstraints: { dof: number; supRef: number }[];
  springs: { dof: number; k: number; nodeId: number; axis: 0 | 1 | 2 }[];
} {
  // Reuse buildMesh (no loads).
  const { mesh, nodeIdMap, beamIdMap } = buildMesh(
    { ...input, loads: [], supports: input.supports as any } as any
  );

  // Ask the engine's Assembler for the global K
  const engineK = assembleGlobalStiffnessMatrix(mesh, "frame");
  const dofsPerNode = getDofsPerNode("frame");
  const nodeIdToIndex = buildNodeIdToIndex(mesh, "frame");
  const nDof = nodeIdToIndex.size * dofsPerNode;

  // Convert sparse K (with .get(i,j)) to dense 2D array for display.
  const K: number[][] = [];
  for (let i = 0; i < nDof; i++) {
    const row: number[] = [];
    for (let j = 0; j < nDof; j++) row.push(engineK.get(i, j));
    K.push(row);
  }

  // Build per-beam matrices for the matrix viewer
  const beamCache: ExposedBeamCache[] = [];
  for (const [uiId, meshId] of beamIdMap) {
    const beam = mesh.getBeamElement(meshId);
    if (!beam) continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    const c = Math.cos(angle), s = Math.sin(angle);
    const mat = mesh.getMaterial(beam.materialId);
    const E = mat?.E ?? 210e9;
    const A = beam.section.A;
    const I = beam.section.I;
    // Get the engine's local K (returns SparseMatrix-like with .get())
    const KlSparse = calculateBeamLocalStiffness(L, E, A, I);
    const kLocal: number[][] = [];
    for (let i = 0; i < 6; i++) {
      const row: number[] = [];
      for (let j = 0; j < 6; j++) row.push(KlSparse.get(i, j));
      kLocal.push(row);
    }
    // Transformation matrix (6x6) for 2D frame element with angle θ
    const T: number[][] = [
      [ c,  s, 0,  0,  0, 0],
      [-s,  c, 0,  0,  0, 0],
      [ 0,  0, 1,  0,  0, 0],
      [ 0,  0, 0,  c,  s, 0],
      [ 0,  0, 0, -s,  c, 0],
      [ 0,  0, 0,  0,  0, 1],
    ];
    const fromIdx = (nodeIdToIndex.get(n1.id) ?? 0) * dofsPerNode;
    const toIdx   = (nodeIdToIndex.get(n2.id) ?? 0) * dofsPerNode;
    beamCache.push({ id: uiId, E, A, L, c, s, kLocal, T, fromIdx, toIdx });
  }

  // Constraints + springs for the viewer
  const rigidConstraints: { dof: number; supRef: number }[] = [];
  const springs: { dof: number; k: number; nodeId: number; axis: 0 | 1 | 2 }[] = [];
  for (const node of mesh.nodes.values() as any) {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) continue;
    const base = idx * dofsPerNode;
    const cstr = node.constraints ?? {};
    if (cstr.x) rigidConstraints.push({ dof: base + 0, supRef: node.id });
    if (cstr.y) rigidConstraints.push({ dof: base + 1, supRef: node.id });
    if (cstr.rotation) rigidConstraints.push({ dof: base + 2, supRef: node.id });
    if (cstr.springX) springs.push({ dof: base + 0, k: cstr.springX, nodeId: node.id, axis: 0 });
    if (cstr.springY) springs.push({ dof: base + 1, k: cstr.springY, nodeId: node.id, axis: 1 });
    if (cstr.springRot) springs.push({ dof: base + 2, k: cstr.springRot, nodeId: node.id, axis: 2 });
  }

  // Convert mesh nodeId map back for the viewer (UI talks in UI ids).
  // Display shows UI node ids, so map mesh index → UI nodeId for the panel.
  const uiNodeIndex = new Map<number, number>();
  for (const [uiId, meshId] of nodeIdMap) {
    const idx = nodeIdToIndex.get(meshId);
    if (idx !== undefined) uiNodeIndex.set(uiId, idx);
  }

  return { K, nDof, nodeIndex: uiNodeIndex, beams: beamCache, rigidConstraints, springs };
}
