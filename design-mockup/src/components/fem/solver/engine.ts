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
import { generatePlateRegionMesh } from "../../../core/fem/PlateRegion";
import { computeSelfWeightNodalForces, computeEdgeLoadNodalForces, applyNodalForces } from "../../../core/fem/PlateLoads";
import {
  isAsgelijndeRechthoek, valideerPlaatPolygoon, berekenPlaatMeshSignatuur,
  leesPlaatMeshCache, leesPolygoonRandlasten,
} from "../femTypes";
import type { PlaatMeshCache } from "../femTypes";
import type {
  SolverInput,
  SolverResult,
  MultiInput,
  MultiLcResult,
  NodalDisp,
  NodalReaction,
  ElementForces,
  SolverPlateInput,
  PlateResult,
  PlateElementStress,
  PlateStressRange,
} from "./types";

type AnyMesh = any; // structural typing — Mesh shape from core/fem/Mesh

/**
 * Gemeshte plaat: koppeling UI-plaat-id ↔ core-plaatregio (mesh-knopen/
 * -elementen). `edgeNodeIds` is alleen gevuld voor polygonplaten (P4.2):
 * per polygonrand (index i = hoek i → hoek i+1) de geordende mesh-knoop-ids,
 * voor randlasten via rand-index (P4.3).
 */
type PlateRegionInfo = {
  plateId: number;
  region: ReturnType<typeof generatePlateRegionMesh>;
  edgeNodeIds?: number[][];
};

/**
 * Schaalbewaking mixed-analyse: de dense Gauss-eliminatie is O(n³) in tijd en
 * O(n²) in geheugen — boven ±4000 vrijheidsgraden wordt de UI onwerkbaar.
 * De adapter weigert grotere modellen met een nette melding (meshSize
 * vergroten); een sparse solver staat op de backlog.
 */
const MAX_MIXED_DOFS = 4000;

/**
 * Splitsfracties (0..1, exclusief de uiteinden) van een staaf die exact op
 * een plaatrand ligt: de gridknoop-posities van die rand, uitgedrukt als
 * fractie langs de staaf van `nA` naar `nB`. Een staaf die niet (volledig)
 * op een rand ligt levert een lege lijst — die blijft ongesplitst.
 * Randen van meerdere platen worden samengevoegd en ontdubbeld (gedeelde
 * randen tussen twee platen leveren dezelfde posities).
 */
function berekenPlaatrandSplitsFracties(
  nA: { x: number; z: number },
  nB: { x: number; z: number },
  plateRects: { minX: number; minZ: number; width: number; height: number; nx: number; ny: number }[],
  tolMm: number,
): number[] {
  const ts: number[] = [];
  for (const r of plateRects) {
    // Horizontale randen (onder/boven): z ≈ randhoogte, x varieert.
    for (const randZ of [r.minZ, r.minZ + r.height]) {
      if (Math.abs(nA.z - randZ) <= tolMm && Math.abs(nB.z - randZ) <= tolMm &&
          Math.abs(nB.x - nA.x) > tolMm) {
        const lo = Math.min(nA.x, nB.x), hi = Math.max(nA.x, nB.x);
        for (let i = 0; i <= r.nx; i++) {
          const pos = r.minX + (i / r.nx) * r.width;
          if (pos > lo + tolMm && pos < hi - tolMm) {
            ts.push((pos - nA.x) / (nB.x - nA.x));
          }
        }
      }
    }
    // Verticale randen (links/rechts): x ≈ randpositie, z varieert.
    for (const randX of [r.minX, r.minX + r.width]) {
      if (Math.abs(nA.x - randX) <= tolMm && Math.abs(nB.x - randX) <= tolMm &&
          Math.abs(nB.z - nA.z) > tolMm) {
        const lo = Math.min(nA.z, nB.z), hi = Math.max(nA.z, nB.z);
        for (let j = 0; j <= r.ny; j++) {
          const pos = r.minZ + (j / r.ny) * r.height;
          if (pos > lo + tolMm && pos < hi - tolMm) {
            ts.push((pos - nA.z) / (nB.z - nA.z));
          }
        }
      }
    }
  }
  ts.sort((a, b) => a - b);
  const uniek: number[] = [];
  for (const t of ts) {
    if (uniek.length === 0 || Math.abs(t - uniek[uniek.length - 1]) > 1e-9) uniek.push(t);
  }
  return uniek;
}

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
  /** Gemeshte platen (leeg zonder platen) — aanwezig ⇒ analyse in mixed_beam_plate. */
  plateInfo: PlateRegionInfo[];
  /**
   * Op plaatranden gesplitste staven (P2.4): UI-staaf-id → geordende
   * deelstukken met hun fractie-interval [t0, t1] op de oorspronkelijke
   * staaf. Alleen entries voor staven met ≥ 2 deelstukken.
   */
  beamSegments: Map<number, { meshId: number; t0: number; t1: number }[]>;
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

  // UI-knoopposities (mm) — nodig voor het staafsplitsen langs plaatranden
  // (P2.4) én verderop voor de staafhoek bij lokale lijnlasten.
  const nodeById = new Map<number, { x: number; z: number }>();
  for (const n of input.nodes) nodeById.set(n.id, { x: n.x, z: n.z });

  // ── Platen parsen + valideren (P2.2/P2.4/P4.2) ───────────────────────────
  // De validatie gebeurt VÓÓR de staven, zodat het splitsen van staven op
  // plaatrandknopen de gridposities al kent; het meshen zelf volgt verderop
  // (na de staven, zodat het grid hun splitsknopen kan hergebruiken).
  // Classificatie (P4.2): 4 hoekknopen die een asgelijnde rechthoek vormen →
  // het deterministische quad-grid-pad; elke andere geldige polygoon
  // (n ≥ 3 hoeken) → het CDT-polygonpad, dat het vooraf gegenereerde mesh
  // uit de cache haalt (de CDT zelf is async/WASM en draait niet in de solve).
  const TOL_MM = 1; // zelfde orde als de findNodeAt-hergebruiktolerantie (0,001 m)
  const plateInputs = (input as any).plates as SolverPlateInput[] | undefined;
  const plateRects: {
    p: SolverPlateInput;
    minX: number; minZ: number; width: number; height: number;
    nx: number; ny: number;
  }[] = [];
  const plaatPolygonen: { p: SolverPlateInput; cache: PlaatMeshCache }[] = [];
  if (plateInputs && plateInputs.length > 0) {
    for (const p of plateInputs) {
      if (!Array.isArray(p.nodeIds) || p.nodeIds.length < 3) {
        throw new Error(
          `Plaat ${p.id}: verwacht minstens 3 hoekknopen, maar kreeg er ${p.nodeIds?.length ?? 0}.`);
      }
      const corners = p.nodeIds.map((id) => nodeById.get(id));
      if (corners.some((c) => !c)) {
        throw new Error(`Plaat ${p.id}: één of meer hoekknopen bestaan niet meer.`);
      }
      const punten = corners.map((c) => ({ x: c!.x, z: c!.z }));
      const meshSize = p.meshSize > 0 ? p.meshSize : 500;

      if (punten.length === 4 && isAsgelijndeRechthoek(punten, TOL_MM)) {
        // ── Rechthoekpad (ongewijzigd t.o.v. P2.2) ──────────────────────────
        const xs = punten.map((c) => c.x);
        const zs = punten.map((c) => c.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const width = maxX - minX, height = maxZ - minZ;
        // Divisions uit meshSize (mm): afgerond op het dichtstbijzijnde
        // gehele aantal, minimaal 1 per richting.
        const nx = Math.max(1, Math.round(width / meshSize));
        const ny = Math.max(1, Math.round(height / meshSize));
        plateRects.push({ p, minX, minZ, width, height, nx, ny });
        continue;
      }

      // ── Polygonpad (P4.2) ─────────────────────────────────────────────────
      // Eerst de vorm zelf valideren (zelfsnijdend, dubbele hoeken,
      // degeneraat — dekt ook de oude "gedegenereerde rechthoek"-gevallen).
      const vormFout = valideerPlaatPolygoon(punten, TOL_MM);
      if (vormFout) {
        throw new Error(`Plaat ${p.id}: ${vormFout}`);
      }
      // CDT-cache: uit de invoer (canvas/tests) of het femTypes-doorgeefluik
      // (store-registratie — de App-multi-LC-mapping draagt het veld niet).
      // De signatuur borgt dat de cache bij de ACTUELE geometrie + meshSize
      // hoort; een verouderde of ontbrekende cache is een nette fout, nooit
      // een stil verkeerd mesh.
      const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
      const kandidaten = [p.meshCache, leesPlaatMeshCache(p.id)];
      const cache = kandidaten.find((c) => c && c.signature === handtekening);
      if (!cache) {
        throw new Error(
          `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als ` +
          `polygonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. ` +
          `Open het canvas (het mesh wordt daar automatisch gegenereerd) en ` +
          `reken daarna opnieuw.`);
      }
      // Cache-sanity: puntindices binnen bereik (beschadigd projectbestand).
      const nPts = cache.points.length;
      const indexOk = cache.triangles.every((t) =>
        t.length === 3 && t.every((i) => Number.isInteger(i) && i >= 0 && i < nPts))
        && cache.edgeNodeIndices.every((rand) =>
          rand.every((i) => Number.isInteger(i) && i >= 0 && i < nPts));
      if (!indexOk || nPts < 3 || cache.triangles.length < 1) {
        throw new Error(
          `Plaat ${p.id}: de meshcache is beschadigd. Wijzig de plaat ` +
          `(bijv. de meshSize) zodat het mesh opnieuw wordt gegenereerd.`);
      }
      plaatPolygonen.push({ p, cache });
    }
  }

  /**
   * Releases toepassen op één (deel)staaf. Bij een gesplitste staaf (P2.4)
   * horen de start-releases alleen bij het eerste deel en de eind-releases
   * alleen bij het laatste deel; de tussenknopen zijn momentvast — dezelfde
   * regels als computeBeamSplit in de store. Met (true, true) is het gedrag
   * bit-identiek aan het oorspronkelijke ongesplitste pad: het legacy
   * scharnierpaar (alleen Rz) blijft het legacy pad, en zodra er een
   * translatie-release (Tx/Tz-huls, lokale assen) in het spel is gaat het
   * volledige per-DOF-connectiemodel mee.
   */
  const pasReleasesToe = (meshBeamId: number, b: any, metStartzijde: boolean, metEindzijde: boolean): void => {
    const rel = b.releases as {
      startTx?: boolean; startTz?: boolean; startRy?: boolean;
      endTx?: boolean; endTz?: boolean; endRy?: boolean;
    } | undefined;
    const sTx = !!(metStartzijde && rel?.startTx);
    const sTz = !!(metStartzijde && rel?.startTz);
    const sRy = !!(metStartzijde && (rel?.startRy || b.startConnection === "hinge"));
    const eTx = !!(metEindzijde && rel?.endTx);
    const eTz = !!(metEindzijde && rel?.endTz);
    const eRy = !!(metEindzijde && (rel?.endRy || b.endConnection === "hinge"));
    const updates: any = {};
    if (sTx || sTz || eTx || eTz) {
      updates.startConnections = {
        Tx: sTx ? "hinge" : "fixed",
        Tz: sTz ? "hinge" : "fixed",
        Rz: sRy ? "hinge" : "fixed",
      };
      updates.endConnections = {
        Tx: eTx ? "hinge" : "fixed",
        Tz: eTz ? "hinge" : "fixed",
        Rz: eRy ? "hinge" : "fixed",
      };
    } else {
      if (sRy) updates.startConnection = "hinge";
      if (eRy) updates.endConnection = "hinge";
    }
    if (Object.keys(updates).length > 0) mesh.updateBeamElement(meshBeamId, updates);
  };

  // Beams: mm² → m², mm⁴ → m⁴; preserve scharnier (startConnection/endConnection).
  // P2.4: een staaf die exact op een plaatrand ligt wordt op de plaatrand-
  // knopen gesplitst (1 UI-staaf → n mesh-staven) — anders zou de plaat
  // alleen aan de staafuiteinden hangen. beamSegments registreert de delen
  // (met hun fractie-interval op de UI-staaf) zodat lasten worden verdeeld
  // en convertResult de stationsresultaten weer aaneenrijgt.
  const beamSegments = new Map<number, { meshId: number; t0: number; t1: number }[]>();

  // ── Splitsfracties van staafgebonden puntlasten (vrije positie) ───────────
  // Een puntlast op een vrije positie wordt gerekend door de staaf op die
  // fractie te SPLITSEN en de kracht op de tussenknoop te zetten (zie
  // SolverBeamPointLoadInput in types.ts voor de motivatie). De splitsing is
  // bewust LASTGEVAL-ONAFHANKELIJK: álle staafpuntlasten uit de invoer
  // splitsen mee, ook die in deze solve factor 0 hebben. Zo krijgt elk
  // belastinggeval hetzelfde stationsraster en blijft superpositie van de
  // per-geval-resultaten (combinaties, envelope) geldig.
  // Fracties op/naast een eindknoop (≤ EPS of ≥ 1−EPS) splitsen NIET: die
  // last landt gewoon op de bestaande eindknoop.
  const BPL_EPS = 1e-6;
  const staafPuntlasten = (input as any).beamPointLoads as Array<any> | undefined;
  const puntlastFracties = new Map<number, number[]>();
  if (staafPuntlasten) {
    for (const bpl of staafPuntlasten) {
      const t = Math.min(1, Math.max(0, bpl.posFrac ?? 0));
      if (t <= BPL_EPS || t >= 1 - BPL_EPS) continue;
      const lijst = puntlastFracties.get(bpl.beamId) ?? [];
      lijst.push(t);
      puntlastFracties.set(bpl.beamId, lijst);
    }
  }

  /**
   * Mesh-knoop-id per splitsfractie, per UI-staaf — inclusief de eindknopen
   * (t = 0 en t = 1). Hiermee vindt het staafpuntlastenblok verderop de knoop
   * waarop de kracht moet landen.
   */
  const beamKnoopPerFractie = new Map<number, { t: number; meshNodeId: number }[]>();

  for (const b of input.beams) {
    const fromId = nodeIdMap.get(b.from);
    const toId   = nodeIdMap.get(b.to);
    if (fromId === undefined || toId === undefined) continue;
    const section = {
      A: (b.A ?? 3877) * 1e-6,
      I: (b.I ?? 1.673e7) * 1e-12,
      h: 0.2, // default depth — only used for plate analysis
    };
    const matId = materialIdForE(b.E ?? 210000);
    const nA = nodeById.get(b.from)!;
    const nB = nodeById.get(b.to)!;
    // Plaatrandknopen (P2.4) + staafpuntlastposities, samengevoegd, gesorteerd
    // en ontdubbeld — een puntlast exact óp een plaatrandknoop splitst dus
    // maar één keer.
    const ruweSplits = [
      ...(plateRects.length > 0
        ? berekenPlaatrandSplitsFracties(nA, nB, plateRects, TOL_MM)
        : []),
      ...(puntlastFracties.get(b.id) ?? []),
    ].sort((p, q) => p - q);
    const splitsT: number[] = [];
    for (const t of ruweSplits) {
      if (splitsT.length === 0 || Math.abs(t - splitsT[splitsT.length - 1]) > 1e-9) splitsT.push(t);
    }

    if (splitsT.length === 0) {
      // Ongesplitst — het bestaande pad (bit-identiek zonder platen).
      const meshBeam = mesh.addBeamElement([fromId, toId], matId, section);
      if (!meshBeam) continue;
      beamIdMap.set(b.id, meshBeam.id);
      pasReleasesToe(meshBeam.id, b, true, true);
      beamKnoopPerFractie.set(b.id, [
        { t: 0, meshNodeId: fromId }, { t: 1, meshNodeId: toId },
      ]);
    } else {
      // Tussenknopen op de gridposities van de plaatrand. findNodeAt
      // hergebruikt een eventueel al bestaande (UI-)knoop binnen 1 mm; het
      // plaatgrid pikt straks dezelfde knopen op — staaf en plaat delen dus
      // álle randknopen.
      const knoopIds = [fromId];
      for (const t of splitsT) {
        const mx = (nA.x + t * (nB.x - nA.x)) / 1000;
        const my = (nA.z + t * (nB.z - nA.z)) / 1000;
        const bestaand = mesh.findNodeAt(mx, my, 0.001);
        knoopIds.push(bestaand ? bestaand.id : mesh.addNode(mx, my).id);
      }
      knoopIds.push(toId);
      const grens = [0, ...splitsT, 1];
      beamKnoopPerFractie.set(b.id,
        grens.map((t, i) => ({ t, meshNodeId: knoopIds[i] })));
      const segs: { meshId: number; t0: number; t1: number }[] = [];
      for (let i = 0; i < knoopIds.length - 1; i++) {
        const mb = mesh.addBeamElement([knoopIds[i], knoopIds[i + 1]], matId, section);
        if (!mb) continue;
        pasReleasesToe(mb.id, b, i === 0, i === knoopIds.length - 2);
        segs.push({ meshId: mb.id, t0: grens[i], t1: grens[i + 1] });
      }
      if (segs.length > 0) {
        beamIdMap.set(b.id, segs[0].meshId);
        if (segs.length > 1) beamSegments.set(b.id, segs);
      }
    }
  }

  // Scheefstand-factor (hier al nodig voor het plaat-eigengewicht hieronder;
  // de volledige toelichting staat bij het lastenblok verderop): elke
  // verticale last krijgt een horizontale metgezel H = φ·V, richting ±x.
  const sch = (input as any).scheefstand as { phi: number; richting: 1 | -1 } | undefined;
  const schFactor = sch ? sch.richting * sch.phi : 0;

  // ── Wandschijven meshen (platen, P2.2) ────────────────────────────────────
  // Per (hierboven al gevalideerde) plaat: eigen mesh-materiaal (E, ν, ρ) en
  // een Quad4-grid via generatePlateRegionMesh. Dat grid HERGEBRUIKT
  // bestaande knopen op gridposities (findNodeAt, tolerantie 1 mm) — de vier
  // UI-hoekknopen, UI-knopen op de rand én de splitsknopen van randstaven
  // worden dus rekenknopen van de plaat, zodat steunpunten en lasten daar
  // gewoon aangrijpen en randstaven volledig meedragen.
  const plateInfo: PlateRegionInfo[] = [];

  // Eigengewicht (P2.3) — gedeeld door het rechthoek- en het polygonpad:
  // wanneer de plaat een selfWeightCaseId draagt en dat geval in deze solve
  // meedoet (loadFactor ≠ 0), worden de exacte ρ·g·t·A-knooplasten van
  // PlateLoads op de meshknopen gezet — CST W/3, Quad4 W/4 per knoop, ΣF
  // exact. De scheefstand-companion werkt op de verticale component, net als
  // bij staaf- en knooplasten.
  const pasPlaatEigengewichtToe = (p: SolverPlateInput, elementIds: number[]): void => {
    if (p.selfWeightCaseId === undefined) return;
    const f = loadFactor ? loadFactor(p.selfWeightCaseId) : 1;
    if (f === 0) return;
    const gewicht = computeSelfWeightNodalForces(mesh, { elementIds });
    applyNodalForces(mesh, gewicht.map((kr) => ({
      nodeId: kr.nodeId,
      fx: (kr.fx + schFactor * -kr.fy) * f,
      fy: kr.fy * f,
    })));
  };

  if (plateRects.length > 0) {
    for (const { p, minX, minZ, width, height, nx, ny } of plateRects) {
      // Eigen mesh-materiaal per plaat: E (N/mm² → Pa), ν en ρ uit de invoer.
      const mat = mesh.addMaterial({
        name: `Plaat ${p.id}`,
        E: p.E * 1e6,
        nu: p.nu,
        rho: p.rho,
        color: matTemplate?.color ?? "#3b82f6",
        alpha: matTemplate?.alpha ?? 12e-6,
      });
      const region = generatePlateRegionMesh(mesh, {
        x: minX / 1000, y: minZ / 1000,          // mm → m
        width: width / 1000, height: height / 1000,
        divisionsX: nx, divisionsY: ny,
        materialId: mat.id,
        thickness: p.thickness / 1000,           // mm → m
        // Regelmatig grid → Quad4: geen detJ-problemen en beter buiggedrag
        // dan CST (zie het platenplan, ontwerpbesluiten).
        elementType: "quad",
      });
      mesh.addPlateRegion(region);
      plateInfo.push({ plateId: p.id, region });
      pasPlaatEigengewichtToe(p, region.elementIds);
    }
  }

  // ── Polygonplaten meshen uit de CDT-cache (P4.2) ─────────────────────────
  // De cache (mm, gevalideerd op signatuur hierboven) wordt 1-op-1 omgezet
  // naar meshknopen (mm → m) en CST-driehoeken. findNodeAt HERGEBRUIKT
  // bestaande knopen binnen 1 mm — de UI-hoekknopen (polygoonhoeken zitten
  // altijd in het CDT-mesh) en eventuele UI-knopen op randposities worden zo
  // rekenknopen van de plaat, net als in het grid-pad. Staafsplitsen langs
  // polygonranden (het P2.4-gedrag van rechthoekranden) is er bewust nog
  // niet — een staaf op een polygonrand hangt alleen aan zijn eindknopen.
  if (plaatPolygonen.length > 0) {
    for (const { p, cache } of plaatPolygonen) {
      const mat = mesh.addMaterial({
        name: `Plaat ${p.id}`,
        E: p.E * 1e6,
        nu: p.nu,
        rho: p.rho,
        color: matTemplate?.color ?? "#3b82f6",
        alpha: matTemplate?.alpha ?? 12e-6,
      });
      const dikte_m = p.thickness / 1000;
      const knoopIdPerPunt = cache.points.map((pt) => {
        const mx = pt.x / 1000, my = pt.z / 1000;   // mm → m; model-z = mesh-y
        const bestaand = mesh.findNodeAt(mx, my, 0.001);
        return bestaand ? bestaand.id : mesh.addPlateNode(mx, my).id;
      });
      const nodeIds = Array.from(new Set(knoopIdPerPunt));
      const elementIds: number[] = [];
      for (const [a, b, c] of cache.triangles) {
        const t = mesh.addTriangleElement(
          [knoopIdPerPunt[a], knoopIdPerPunt[b], knoopIdPerPunt[c]], mat.id, dikte_m);
        if (t) elementIds.push(t.id);
      }
      const xs = cache.points.map((pt) => pt.x);
      const zs = cache.points.map((pt) => pt.z);
      const minX = Math.min(...xs), minZ = Math.min(...zs);
      const region: ReturnType<typeof generatePlateRegionMesh> = {
        id: 0, // wordt door addPlateRegion toegekend
        x: minX / 1000, y: minZ / 1000,
        width: (Math.max(...xs) - minX) / 1000,
        height: (Math.max(...zs) - minZ) / 1000,
        divisionsX: 0, divisionsY: 0,
        materialId: mat.id,
        thickness: dikte_m,
        elementType: "triangle",
        nodeIds,
        // Niet gebruikt in het adapterpad (alleen door remesh-/edge-helpers
        // van de core, die hier niet lopen) — bewust een neutrale vulling.
        cornerNodeIds: [nodeIds[0], nodeIds[0], nodeIds[0], nodeIds[0]],
        elementIds,
        // Polygonmesh heeft geen benoemde randen: randlasten lopen via de
        // rand-index (edgeNodeIds hieronder); een benoemde-rand-last op een
        // polygonplaat vervalt daardoor stil in het randlastenblok.
        edges: {
          bottom: { nodeIds: [] }, top: { nodeIds: [] },
          left: { nodeIds: [] }, right: { nodeIds: [] },
        },
        isPolygon: true,
        meshSize: (p.meshSize > 0 ? p.meshSize : 500) / 1000,
      };
      mesh.addPlateRegion(region);
      const edgeNodeIds = cache.edgeNodeIndices.map((rand) =>
        rand.map((i) => knoopIdPerPunt[i]));
      plateInfo.push({ plateId: p.id, region, edgeNodeIds });
      pasPlaatEigengewichtToe(p, elementIds);
    }
  }

  if (plateInfo.length > 0) {
    // Schaalbewaking + validatie op rekenknopen — één actieve-knopen-index
    // voor beide checks.
    const actieveKnopen = buildNodeIdToIndex(mesh, "mixed_beam_plate");
    const nDof = actieveKnopen.size * 3;
    if (nDof > MAX_MIXED_DOFS) {
      throw new Error(
        `Model te groot voor de ingebouwde solver: ${nDof} vrijheidsgraden ` +
        `(maximum ±${MAX_MIXED_DOFS}). Vergroot de meshSize van de platen ` +
        `of verklein het model.`);
    }
    // solveMixed kent géén constraint-/last-transfer: een steunpunt of
    // puntlast op een knoop die niet in het rekenmesh zit zou stil genegeerd
    // worden (of een solver-fout geven). Daarom hier een expliciete controle.
    for (const s of input.supports) {
      const mid = nodeIdMap.get(s.nodeId);
      if (mid !== undefined && !actieveKnopen.has(mid)) {
        throw new Error(
          `Steunpunt op knoop ${s.nodeId} ligt niet op een rekenknoop van het ` +
          `plaatmesh. Verplaats de knoop naar een gridpositie van de plaat ` +
          `(veelvoud van de meshSize vanaf een hoek) of pas de meshSize aan.`);
      }
    }
    const plsValidatie = (input as any).pointLoads as Array<any> | undefined;
    if (plsValidatie) {
      for (const pl of plsValidatie) {
        const mid = nodeIdMap.get(pl.nodeId);
        if (mid !== undefined && !actieveKnopen.has(mid)) {
          throw new Error(
            `Puntlast op knoop ${pl.nodeId} ligt niet op een rekenknoop van het ` +
            `plaatmesh. Verplaats de knoop naar een gridpositie van de plaat ` +
            `of pas de meshSize aan.`);
        }
      }
    }
  }

  // Scheefstand: elke verticale last krijgt een equivalente horizontale
  // metgezel H = φ·V (richting ±x). Lineair in de last, dus per-geval-
  // factoren en combinaties schalen automatisch mee — zie ScheefstandInput.
  // (`schFactor` is hierboven al berekend, vóór het plaat-eigengewicht.)

  // Staafhoek per UI-staaf-id, voor de projectie van LOKALE lijnlasten.
  // atan2(Δz, Δx) in modelassen (z omhoog) is identiek aan de hoek die de
  // core zelf berekent (calculateBeamAngle), omdat mesh-y 1-op-1 uit de
  // UI-z komt en de hoek schaal-invariant is. (nodeById is hierboven al
  // opgebouwd, vóór het staafsplitsen.)
  const beamAngle = new Map<number, number>();
  for (const b of input.beams) {
    const nf = nodeById.get(b.from), nt = nodeById.get(b.to);
    if (nf && nt) beamAngle.set(b.id, Math.atan2(nt.z - nf.z, nt.x - nf.x));
  }

  /**
   * Verdeelde last (globale componenten, N/m) op één mesh-staaf toepassen —
   * exact de bestaande merge-logica: volle lengte additief in het
   * enkelvoudige distributedLoad-veld (bit-stabiel regressie-anker),
   * deellast als eigen record in de distributedLoads-array.
   */
  const pasVerdeeldeLastToe = (
    meshBeamId: number,
    qxA: number, qyA: number, qxB: number, qyB: number,
    aFrac: number, bFrac: number,
  ): void => {
    const isPartial = aFrac > 0 || bFrac < 1;
    const beam = mesh.getBeamElement(meshBeamId);
    if (!isPartial) {
      const ex = beam?.distributedLoad;
      mesh.updateBeamElement(meshBeamId, {
        distributedLoad: {
          qx: (ex?.qx ?? 0) + qxA,
          qy: (ex?.qy ?? 0) + qyA,
          qxEnd: (ex?.qxEnd ?? ex?.qx ?? 0) + qxB,
          qyEnd: (ex?.qyEnd ?? ex?.qy ?? 0) + qyB,
          coordSystem: "global",
        },
      });
    } else {
      if (bFrac - aFrac <= 0) return; // leeg belast deel → geen last
      const arr = beam?.distributedLoads ?? [];
      mesh.updateBeamElement(meshBeamId, {
        distributedLoads: [...arr, {
          qx: qxA, qy: qyA, qxEnd: qxB, qyEnd: qyB,
          startT: aFrac, endT: bFrac,
          coordSystem: "global" as const,
        }],
      });
    }
  };

  // Distributed loads: N/mm → N/m, richting (qCoord/qDir) → globale qx/qy.
  // De core ondersteunt weliswaar coordSystem "local", maar hier wordt
  // bewust in de ADAPTER geprojecteerd: het volle-lengte-pad voegt lasten
  // additief samen in één record met één coordSystem (mengen kan niet), en
  // de scheefstand-companion moet op de VERTICALE component werken — ná
  // projectie is dat uniform voor globale én lokale lasten. De projectie is
  // exact voor rechte staven en de core-paden blijven bit-stabiel "global".
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
      const coord = ld.qCoord ?? "global";
      // Stap 1 — componenten in WERELDASSEN (x rechts, y=z omhoog), N/m.
      // Globaal: triviale toewijzing (bestaand gedrag). Lokaal: projectie
      // met staafhoek θ; met lokale eenheidsvectoren
      //   x̂_lok (axiaal)       = ( cosθ, sinθ)
      //   ŷ_lok (transversaal) = (−sinθ, cosθ)   [90° CCW vanaf de as]
      // geldt exact (rechte staaf):
      //   lokaal qDir "z": (qx_glob, qy_glob) = q·(−sinθ, cosθ)
      //   lokaal qDir "x": (qx_glob, qy_glob) = q·( cosθ, sinθ)
      let gxA: number, gyA: number, gxB: number, gyB: number;
      if (coord === "local") {
        const th = beamAngle.get(ld.beamId) ?? 0;
        const c = Math.cos(th), s = Math.sin(th);
        const ax = dir === "x" ? 1 : 0;   // axiaal aandeel
        const tr = dir === "z" ? 1 : 0;   // transversaal aandeel
        gxA = qa * (ax * c - tr * s); gyA = qa * (ax * s + tr * c);
        gxB = qb * (ax * c - tr * s); gyB = qb * (ax * s + tr * c);
      } else {
        gxA = dir === "x" ? qa : 0; gyA = dir === "z" ? qa : 0;
        gxB = dir === "x" ? qb : 0; gyB = dir === "z" ? qb : 0;
      }
      // Stap 2 — scheefstand-companion NÁ de projectie, op de verticale
      // component: qx += φ·richting·(−qy), omdat qy < 0 = omlaag (gravitatie)
      // een H in +richting moet geven. Voor globale z-lasten is dit
      // bit-identiek aan het oude pad (gy = q); een lokale last krijgt zo
      // een companion op basis van zijn échte verticale aandeel.
      const qxA = gxA + schFactor * -gyA;
      const qyA = gyA;
      const qxB = gxB + schFactor * -gyB;
      const qyB = gyB;

      // Deellast? (startFrac/endFrac, fracties 0..1; ontbreken = volle lengte)
      const aFrac = Math.min(1, Math.max(0, ld.startFrac ?? 0));
      const bFrac = Math.min(1, Math.max(0, ld.endFrac ?? 1));

      const segs = beamSegments.get(ld.beamId);
      if (!segs) {
        // Ongesplitste staaf — bestaand pad via de merge-helper (identieke ops).
        pasVerdeeldeLastToe(beamMeshId, qxA, qyA, qxB, qyB, aFrac, bFrac);
      } else {
        // Gesplitste staaf (P2.4): het belaste interval [aFrac, bFrac] wordt
        // per deelstuk gesneden en de componentwaarden worden op de
        // snijgrenzen lineair geïnterpoleerd over het BELASTE interval —
        // dezelfde regels als computeBeamSplit in de store. De interpolatie
        // gebeurt op de al geprojecteerde + scheefstand-verrijkte
        // componenten; dat mag, want beide bewerkingen zijn puntsgewijs
        // lineair en commuteren dus met de interpolatie.
        for (const s of segs) {
          const lo = Math.max(aFrac, s.t0);
          const hi = Math.min(bFrac, s.t1);
          if (hi - lo <= 1e-12) continue; // dit deelstuk is onbelast
          const frac = (t: number) => (bFrac === aFrac ? 0 : (t - aFrac) / (bFrac - aFrac));
          const fLo = frac(lo), fHi = frac(hi);
          // Fracties op het DEELSTUK, met snapping tegen float-ruis zodat een
          // volledig gedekt deelstuk het volle-lengte-pad (additief) neemt.
          let segA = (lo - s.t0) / (s.t1 - s.t0);
          let segB = (hi - s.t0) / (s.t1 - s.t0);
          if (segA < 1e-9) segA = 0;
          if (segB > 1 - 1e-9) segB = 1;
          pasVerdeeldeLastToe(
            s.meshId,
            qxA + (qxB - qxA) * fLo, qyA + (qyB - qyA) * fLo,
            qxA + (qxB - qxA) * fHi, qyA + (qyB - qyA) * fHi,
            segA, segB,
          );
        }
      }
    }
  }

  // ── Randlasten op plaatranden (P3.3/P4.3) ─────────────────────────────────
  // p (kN/m = N/mm) → N/m, en via de PlateLoads-wrapper (cumulatieve
  // booglengte + tributary lengths, convertEdgeNodeIdsToNodalForces) naar
  // exacte knooplasten op de mesh-randknopen: ΣF = p·L exact. De
  // scheefstand-companion werkt — net als bij knoop-, staaf- en
  // gewichtslasten — op de VERTICALE component ná omzetting. Een randlast op
  // een niet (meer) bestaande plaat vervalt stil, consistent met lasten op
  // verwijderde staven.
  //
  // Adressering: rechthoeken via de vier BENOEMDE randen van het gridmesh;
  // polygonen via de RAND-INDEX (P4.3, rand hoek i → hoek i+1) op de
  // randknopen uit de CDT-cache. Draagt de invoer voor een polygonplaat geen
  // enkele rand-index-last (de App-multi-LC-mapping geeft `edgeIndex` niet
  // door), dan leest de engine de polygonrandlasten uit het femTypes-
  // doorgeefluik — per plaat exclusief invoer ÓF doorgeefluik, nooit beide
  // (geen dubbeltelling).
  const edgeLds = (input as any).edgeLoads as Array<any> | undefined;
  if (plateInfo.length > 0) {
    const infoByPlateId = new Map(plateInfo.map((pi) => [pi.plateId, pi]));

    /** Eén randlast (p in kN/m, factor f) op een geordende randknopenrij. */
    const pasRandlastToe = (
      randNodeIds: number[], p_kNm: number, dir: "x" | "z", f: number,
    ): void => {
      if (!randNodeIds || randNodeIds.length < 2) return;
      const p_Nm = p_kNm * 1000 * f;              // kN/m (= N/mm) → N/m, gefactoreerd
      const px = dir === "x" ? p_Nm : 0;
      const py = dir === "z" ? p_Nm : 0;
      const krachten = computeEdgeLoadNodalForces(mesh, randNodeIds, px, py);
      applyNodalForces(mesh, krachten.map((kr) => ({
        nodeId: kr.nodeId,
        fx: kr.fx + schFactor * -kr.fy,
        fy: kr.fy,
      })));
    };

    // 1) Randlasten uit de invoer. Platen waarvoor de invoer rand-index-
    //    lasten draagt zijn "index-bewust": het doorgeefluik blijft daar uit.
    const invoerIndexBewust = new Set<number>();
    if (edgeLds && edgeLds.length > 0) {
      for (const el of edgeLds) {
        if (el.edgeIndex !== undefined && el.plateId !== undefined) {
          invoerIndexBewust.add(el.plateId);
        }
      }
      for (const el of edgeLds) {
        const f = loadFactor ? loadFactor(el.caseId) : 1;
        if (f === 0 || !el.p) continue;
        const info = infoByPlateId.get(el.plateId);
        if (!info) continue;
        const dir = (el.dir ?? "z") as "x" | "z";
        if (el.edgeIndex !== undefined) {
          // Polygonrand via rand-index (alleen aanwezig op polygonplaten).
          pasRandlastToe(info.edgeNodeIds?.[el.edgeIndex] ?? [], el.p, dir, f);
          continue;
        }
        const rand = info.region.edges?.[el.edge as "bottom" | "top" | "left" | "right"];
        if (!rand || rand.nodeIds.length < 2) continue; // ook: benoemde rand op polygonplaat → stil
        pasRandlastToe(rand.nodeIds, el.p, dir, f);
      }
    }

    // 2) Doorgeefluik-fallback: polygonrandlasten die de store registreerde
    //    (App-pad). Per belastinggeval gefactoreerd; in de één-geval-solve
    //    (geen loadFactor) filtert input.caseId — het canvas zet die.
    const invoerCaseId = (input as any).caseId as number | undefined;
    for (const pi of plateInfo) {
      if (!pi.edgeNodeIds) continue;                     // rechthoek: n.v.t.
      if (invoerIndexBewust.has(pi.plateId)) continue;   // invoer wint
      for (const rl of leesPolygoonRandlasten(pi.plateId)) {
        const f = loadFactor
          ? loadFactor(rl.caseId)
          : (invoerCaseId !== undefined && rl.caseId !== invoerCaseId ? 0 : 1);
        if (f === 0 || !rl.p) continue;
        pasRandlastToe(pi.edgeNodeIds[rl.edgeIndex] ?? [], rl.p, rl.dir, f);
      }
    }
  }

  // Point loads on nodes
  /** Eén knooplast (N, N·mm) additief op een MESH-knoop zetten. */
  const pasKnooplastToe = (
    meshNid: number, fx_N: number, fz_N: number, my_Nmm: number, f: number,
  ): void => {
    const node = mesh.getNode(meshNid);
    const ex = node?.loads ?? { fx: 0, fy: 0, moment: 0 };
    mesh.updateNode(meshNid, {
      loads: {
        // Scheefstand-companion: fx += φ·(−fz)·richting (fz < 0 = omlaag).
        fx: ex.fx + (fx_N + schFactor * -fz_N) * f,
        fy: ex.fy + fz_N * f,
        // my in N·mm → mesh moment in N·m  → /1000
        moment: ex.moment + (my_Nmm / 1000) * f,
      },
    });
  };

  const pls = (input as any).pointLoads as Array<any> | undefined;
  if (pls) {
    for (const pl of pls) {
      const f = loadFactor ? loadFactor(pl.caseId) : 1;
      if (f === 0) continue;
      const meshNid = nodeIdMap.get(pl.nodeId);
      if (meshNid === undefined) continue;
      pasKnooplastToe(meshNid, pl.fx ?? 0, pl.fz ?? 0, pl.my ?? 0, f);
    }
  }

  // ── Puntlasten op een vrije positie op een staaf ──────────────────────────
  // De staaf is hierboven al op `posFrac` gesplitst (lastgeval-onafhankelijk);
  // hier landt de kracht als gewone knooplast op de bijbehorende mesh-knoop.
  // Daardoor is het resultaat exact: V springt en M knikt op de lastpositie,
  // en het stationsraster van convertResult bevat de lastpositie als grens.
  // posFrac 0/1 (of een last op een staaf die niet in de mesh zit) valt terug
  // op de dichtstbijzijnde geregistreerde fractie — dat is dan de eindknoop.
  if (staafPuntlasten) {
    for (const bpl of staafPuntlasten) {
      const f = loadFactor ? loadFactor(bpl.caseId) : 1;
      if (f === 0) continue;
      const knopen = beamKnoopPerFractie.get(bpl.beamId);
      if (!knopen || knopen.length === 0) continue;   // staaf bestaat niet (meer)
      const t = Math.min(1, Math.max(0, bpl.posFrac ?? 0));
      let beste = knopen[0];
      for (const k of knopen) {
        if (Math.abs(k.t - t) < Math.abs(beste.t - t)) beste = k;
      }
      pasKnooplastToe(beste.meshNodeId, bpl.fx ?? 0, bpl.fz ?? 0, bpl.my ?? 0, f);
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
      // Gesplitste staaf (P2.4): uniforme ΔT geldt voor élk deelstuk —
      // zelfde duplicatieregel als computeBeamSplit voor thermische lasten.
      const doelIds = beamSegments.get(tl.beamId)?.map((s) => s.meshId) ?? [beamMeshId];
      for (const doelId of doelIds) {
        const beam = mesh.getBeamElement(doelId);
        if (!beam) continue;
        const alphaMat = mesh.getMaterial(beam.materialId)?.alpha ?? 12e-6;
        const alphaLoad = tl.alpha ?? 1.2e-5; // default staal — zie types.ts
        const ex = beam.thermalLoad?.deltaT ?? 0;
        mesh.updateBeamElement(doelId, {
          thermalLoad: { deltaT: ex + tl.deltaT * (alphaLoad / alphaMat) * f },
        });
      }
    }
  }

  return { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments };
}

/**
 * Convert engine ISolverResult → UI SolverResult, using the id maps from buildMesh.
 *
 * `plateInfo`/`nodeIndex` horen bij het mixed-pad (platen aanwezig):
 * `nodeIndex` is dan de échte actieve-knopen-index van de solver
 * (buildNodeIdToIndex) — nodig omdat plaatknopen (id ≥ 1000) meedoen — en
 * `plateInfo` levert de elementspanningen per plaat op. Zonder platen blijft
 * het pad bit-identiek aan het bestaande frame-gedrag.
 */
function convertResult(
  mesh: AnyMesh,
  engineResult: any,
  nodeIdMap: Map<number, number>,
  beamIdMap: Map<number, number>,
  supports: SolverInput["supports"],
  plateInfo?: PlateRegionInfo[],
  nodeIndex?: Map<number, number>,
  beamSegments?: Map<number, { meshId: number; t0: number; t1: number }[]>,
): SolverResult {
  const displacements = new Map<number, NodalDisp>();
  const reactions = new Map<number, NodalReaction>();
  const elements = new Map<number, ElementForces>();

  // Build mesh-id → array-index lookup (matches order in Mesh.nodes Map).
  // Mét platen komt de index van de solver zelf (actieve knopen) binnen via
  // `nodeIndex`; zonder platen het bestaande insertion-order-pad.
  let indexById: Map<number, number>;
  if (nodeIndex) {
    indexById = nodeIndex;
  } else {
    const meshNodes = Array.from(mesh.nodes.values());
    indexById = new Map<number, number>();
    meshNodes.forEach((n: any, i: number) => indexById.set(n.id, i));
  }

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
    // Op een plaatrand gesplitste staaf (P2.4): de stations van de
    // deelstukken worden aaneengeregen tot één doorlopend staafresultaat.
    // De gedeelde randknoop levert een dubbel station (einde deel i =
    // begin deel i+1) — dat is gewenst: N en V mogen daar een sprong maken
    // (de plaat "prikt" krachten in), en het diagram tekent die sprong dan
    // exact; M en w zijn er continu. L_mm is de som van de deellengtes;
    // eindwaarden N/V/M_start van het eerste en M_end van het laatste deel.
    const segs = beamSegments?.get(uiId);
    if (segs && segs.length > 1) {
      const delen = segs.map((s) => engineResult.beamForces.get(s.meshId));
      if (delen.some((d: any) => !d)) continue;
      const stations_mm: number[] = [];
      const normalForce: number[] = [];
      const shearForce: number[] = [];
      const bendingMoment: number[] = [];
      const deflection: number[] = [];
      const axialDisp: number[] = [];
      let offset_m = 0;
      for (const d of delen) {
        const st: number[] = d.stations ?? [];
        for (let i = 0; i < st.length; i++) {
          stations_mm.push((st[i] + offset_m) * 1000);
          normalForce.push(-(d.normalForce?.[i] ?? 0));            // druk→trek-flip, zie hieronder
          shearForce.push(d.shearForce?.[i] ?? 0);
          bendingMoment.push((d.bendingMoment?.[i] ?? 0) * 1000);  // N·m → N·mm
          deflection.push((d.deflection?.[i] ?? 0) * 1000);        // m → mm
          axialDisp.push((d.axialDisp?.[i] ?? 0) * 1000);
        }
        offset_m += st.length > 0 ? st[st.length - 1] : 0;
      }
      const eerste = delen[0], laatste = delen[delen.length - 1];
      elements.set(uiId, {
        N: -eerste.N1,
        V: eerste.V1,
        M_start: eerste.M1 * 1000,
        M_end:   laatste.M2 * 1000,
        L_mm: offset_m * 1000,
        stations_mm, normalForce, shearForce, bendingMoment, deflection, axialDisp,
      });
      continue;
    }

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

  // ── Plaatresultaten (P2.2) ────────────────────────────────────────────────
  // 1. Plaatknopen (mesh-id ≥ 1000 én hergebruikte UI-knopen) tellen mee in
  //    maxDisplacement, zodat de canvas-schaal ook zuivere plaatvervorming volgt.
  // 2. Per plaat de elementspanningen uit het mixed-postprocessingpad:
  //    Pa → N/mm² (÷1e6), membraankrachten N/m → kN/m (÷1000), plus
  //    min/max-ranges per component voor de kleurenlegenda.
  let plateResults: PlateResult[] | undefined;
  if (plateInfo && plateInfo.length > 0) {
    plateResults = [];
    for (const info of plateInfo) {
      for (const nid of info.region.nodeIds) {
        const idx = indexById.get(nid);
        if (idx === undefined) continue;
        const base = idx * 3;
        const ux = (engineResult.displacements[base + 0] ?? 0) * 1000;
        const uz = (engineResult.displacements[base + 1] ?? 0) * 1000;
        maxDisp = Math.max(maxDisp, Math.abs(ux), Math.abs(uz));
      }

      const mkRange = (): PlateStressRange => ({ min: Infinity, max: -Infinity });
      const ranges = {
        sigmaX: mkRange(), sigmaY: mkRange(), tauXY: mkRange(),
        vonMises: mkRange(), nx: mkRange(), ny: mkRange(), nxy: mkRange(),
      };
      const bijwerken = (r: PlateStressRange, v: number) => {
        r.min = Math.min(r.min, v);
        r.max = Math.max(r.max, v);
      };

      const plaatElementen: PlateElementStress[] = [];
      for (const eid of info.region.elementIds) {
        const st = engineResult.elementStresses?.get(eid);
        const el = mesh.getElement(eid);
        if (!st || !el) continue;
        const corners = (el.nodeIds as number[])
          .map((nid) => mesh.getNode(nid))
          .filter((n: any) => !!n)
          .map((n: any) => ({ x: n.x * 1000, z: n.y * 1000 })); // m → mm; mesh-y = model-z
        const item: PlateElementStress = {
          elementId: eid,
          corners,
          sigmaX:   st.sigmaX / 1e6,
          sigmaY:   st.sigmaY / 1e6,
          tauXY:    st.tauXY / 1e6,
          vonMises: st.vonMises / 1e6,
          sigma1: (st.principalStresses?.sigma1 ?? 0) / 1e6,
          sigma2: (st.principalStresses?.sigma2 ?? 0) / 1e6,
          angle:   st.principalStresses?.angle ?? 0,
          nx:  (st.nx  ?? 0) / 1000,
          ny:  (st.ny  ?? 0) / 1000,
          nxy: (st.nxy ?? 0) / 1000,
        };
        plaatElementen.push(item);
        bijwerken(ranges.sigmaX, item.sigmaX);
        bijwerken(ranges.sigmaY, item.sigmaY);
        bijwerken(ranges.tauXY, item.tauXY);
        bijwerken(ranges.vonMises, item.vonMises);
        bijwerken(ranges.nx, item.nx);
        bijwerken(ranges.ny, item.ny);
        bijwerken(ranges.nxy, item.nxy);
      }
      // Lege plaat (geen spanningsresultaten) → ranges op 0 i.p.v. ±Infinity.
      for (const r of Object.values(ranges)) {
        if (!Number.isFinite(r.min)) { r.min = 0; r.max = 0; }
      }
      plateResults.push({ plateId: info.plateId, elements: plaatElementen, ranges });
    }
  }

  return {
    displacements, reactions, elements, maxDisplacement: maxDisp,
    ...(plateResults ? { plateElements: plateResults } : {}),
  };
}

// ── Public engine functions ─────────────────────────────────────────────────

export function solve(input: SolverInput): SolverResult {
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments } = buildMesh(input);
  // Platen aanwezig ⇒ mixed_beam_plate (staven 6×6 + membranen 3 DOF/knoop);
  // zonder platen blijft het pad bit-identiek "frame".
  const heeftPlaten = plateInfo.length > 0;
  const engineResult = solveNonlinear(mesh, {
    analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
    geometricNonlinear: false,
  });
  const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : undefined;
  return convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments);
}

export function solveAllCases(input: MultiInput): MultiLcResult {
  const perCase = new Map<number, SolverResult>();
  for (const c of input.cases) {
    const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments } = buildMesh(input, (caseId) => (caseId === c.id ? 1 : 0));
    // Een leeg belastinggeval (bijv. Q/S/W zonder ingevoerde lasten — de
    // standaardset heeft er vier) is geen fout: overslaan. De solver gooit er
    // anders "No loads applied" op en dat liet de hele combinatie-/toetsings-
    // pijplijn falen; combineResults behandelt een ontbrekend geval als
    // nulbijdrage, wat mechanisch exact klopt.
    if (!meshHeeftLasten(mesh)) continue;
    const heeftPlaten = plateInfo.length > 0;
    const engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: false,
    });
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : undefined;
    perCase.set(c.id, convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments));
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
  const { mesh, nodeIdMap, beamIdMap, plateInfo } = buildMesh(
    input,
    (caseId) => combo.factors.get(caseId ?? -1) ?? 0,
  );

  // Platen + 2e orde is nog niet ondersteund: solveMixed is puur lineair
  // (geen geometrische membraanstijfheid, geen koppeling met het P-Δ-pad —
  // zie backlog platenplan). Lineair rekenen en het "2e orde" noemen zou
  // misleiden, dus een duidelijke fout via de bestaande engine-foutroute.
  if (plateInfo.length > 0) {
    throw new Error(
      `2e-orde-berekening met platen wordt nog niet ondersteund — schakel ` +
      `"2e orde (P-Δ)" uit of verwijder de platen.`);
  }

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
