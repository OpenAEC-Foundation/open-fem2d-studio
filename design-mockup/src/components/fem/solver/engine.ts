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
import { solveNonlinear, SingulierStelselFout, type NonlinearSolverOptions } from "../../../core/solver/NonlinearSolver";
import { assembleGlobalStiffnessMatrix, buildNodeIdToIndex, getDofsPerNode, PlaatElementFout } from "../../../core/solver/Assembler";
import { calculateBeamLength, calculateBeamAngle, calculateBeamLocalStiffness } from "../../../core/fem/Beam";
import { generatePlateRegionMesh } from "../../../core/fem/PlateRegion";
import {
  computeSelfWeightNodalForces, computeEdgeLoadNodalForces, applyNodalForces,
  verdeelRandlastConsistent, verdeelRandpuntlastConsistent,
} from "../../../core/fem/PlateLoads";
import {
  isAsgelijndeRechthoek, valideerPlaatPolygoon, berekenPlaatMeshSignatuur, bepaalPlaatRand,
} from "../femTypes";
import type { PlaatMeshCache, PlaatPunt } from "../femTypes";
import type {
  SolverInput,
  SolverResult,
  MultiInput,
  MultiLcResult,
  NodalDisp,
  NodalReaction,
  ElementForces,
  BeamSegmentForces,
  SolverBeamSegmentInput,
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
  /**
   * Hoekcoördinaten (mm) in de volgorde van de plaatinvoer — de invoer voor
   * `bepaalPlaatRand`, zodat elke plaatlast zijn rand langs dezelfde regel
   * vindt als de validatie en het canvas.
   */
  hoeken: PlaatPunt[];
};

/** Eén kinematische randkoppeling, zie `NonlinearSolverOptions.randKoppelingen`. */
type RandKoppeling = NonNullable<NonlinearSolverOptions["randKoppelingen"]>[number];

/**
 * Schaalbewaking mixed-analyse: de dense Gauss-eliminatie is O(n³) in tijd en
 * O(n²) in geheugen — boven ±4000 vrijheidsgraden wordt de UI onwerkbaar.
 * De adapter weigert grotere modellen met een nette melding (meshSize
 * vergroten); een sparse solver staat op de backlog.
 */
const MAX_MIXED_DOFS = 4000;

/**
 * Knooptolerantie van `mesh.findNodeAt` in mm (0,001 m). Twee splitsposities
 * die dichter bij elkaar liggen krijgen DEZELFDE mesh-knoop en leveren dus een
 * element van lengte nul — met NaN-doorbuigingen tot gevolg. Deze constante
 * staat hier alleen om die grens in de segmentcontrole te kunnen noemen.
 */
const KNOOP_TOL_MM = 1;

/**
 * SAMENVOEGREGEL VOOR FLINTERS — kleinste lengte (mm) die een rekenelement van
 * een gesegmenteerde staaf van de segmentindeling mag krijgen.
 *
 * De regel: een segmentgrens die dichter dan deze afstand bij een fractie ligt
 * die om een ANDERE reden al vastligt — de twee eindknopen, een
 * plaatrandknoop, een staafpuntlast — wordt laten vallen. Die andere fracties
 * zijn dwingend (daar hangt een plaat of grijpt een last aan) en worden nooit
 * verplaatst; het samengevoegde element krijgt de I van het segment waarin zijn
 * MIDDEN valt. Segmentgrenzen worden NIET tegen elkaar afgewogen: een
 * gelijkmatig fijne indeling is de resolutiekeuze van de aanroeper en het is
 * niet aan de adapter om die uit te dunnen.
 *
 * WAAROM EEN GRENS NODIG IS. De buigtermen van de elementstijfheid schalen met
 * 1/L², 1/L³. Een flinter zet daardoor torenhoge termen naast de gewone termen
 * in dezelfde matrix en de oplossing verliest cijfers.
 *
 * WAAROM 25 mm — GEMETEN, niet geschat. Een flinter van lengte ℓ werd
 * afgedwongen met twee nul-puntlasten naast elkaar (die splitsen wel maar
 * belasten niet) en de uitkomst vergeleken met de analytische waarde
 * θ_A = qL³/24EI van een vrij opgelegde ligger van 6000 mm onder UDL, en met
 * max|u| van een raamwerk van 3 velden × 3 verdiepingen waarvan elke staaf in
 * segmenten van 400 mm ligt (het model uit besluit B3):
 *
 *   ℓ [mm]  |  ligger 6 m   |  raamwerk 3×3 (max|u| / R)
 *   --------|---------------|---------------------------
 *     100   |    8,8e-13    |   1,0e-12 / 2,4e-13
 *      50   |    2,0e-12    |   1,2e-12 / 2,9e-12
 *      25   |    3,5e-10    |   1,6e-11 / 6,6e-11
 *    12,5   |    2,5e-9     |   6,6e-11 / 2,7e-10   (12 mm)
 *      10   |    1,2e-8     |   3,4e-10 / 1,3e-9
 *       5   |    3,7e-8     |   8,8e-10 / 3,3e-9
 *       2   |    4,2e-7     |   1,7e-8  / 6,4e-8
 *      ≤1   |  knoopsnapping: element van lengte nul, doorbuiging NaN
 *
 * Bij 25 mm blijft de fout onder 5,5e-10 — ruim onder de 1e-9 waarmee de
 * batterij toetst — terwijl de volgende halvering (12,5 mm) er al overheen
 * gaat. Vandaar 25 en niet 10.
 *
 * De maat is ABSOLUUT (mm) en geen verhouding tot de buurelementen, omdat de
 * meting dat zo uitwijst: een flinter van 25 mm kost 2,6e-10 tot 5,5e-10,
 * ongeacht of zijn buren 400, 200, 100 of 40 mm lang zijn. Bij een VASTE
 * verhouding buur/flinter = 16 loopt de fout juist op van 3,5e-10 (buur 400,
 * flinter 25) naar 6,8e-7 (buur 40, flinter 2,5). Het is dus de absolute
 * elementlengte die telt.
 *
 * En hij kost niets aan modelleervrijheid: 25 mm is 1/16 van de 400 mm
 * segmentlengte uit besluit B3, dus er gaat nooit een echt segment verloren —
 * alleen grenzen die praktisch al samenvielen met een bestaande splitsing.
 */
export const MIN_SEGMENT_MM = 25;

/**
 * Segmentinvoer van één staaf controleren en normaliseren.
 *
 * Weigert liever met een Nederlandse melding dan stil met een verkeerde I te
 * rekenen: de segmenten moeten een sluitende, niet-overlappende partitie van
 * [0, 1] vormen. Retourneert `undefined` wanneer de staaf geen segmenten heeft
 * (het bestaande, ongewijzigde pad).
 */
function normaliseerSegmenten(
  beamId: number, segmenten: SolverBeamSegmentInput[] | undefined, L_mm: number,
): { t0: number; t1: number; I_mm4: number; A_mm2?: number; index: number }[] | undefined {
  if (segmenten === undefined) return undefined;
  if (!Array.isArray(segmenten) || segmenten.length === 0) {
    throw new Error(
      `Staaf ${beamId}: het veld "segmenten" is aanwezig maar leeg. Laat het ` +
      `weg om met één doorsnede over de volle lengte te rekenen.`);
  }
  const TOL = 1e-9;
  const uit = segmenten.map((s, i) => {
    const t0 = s.tStart, t1 = s.tEnd, I_mm4 = s.I;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(I_mm4)) {
      throw new Error(`Staaf ${beamId}, segment ${i + 1}: tStart, tEnd en I moeten getallen zijn.`);
    }
    if (t0 < -TOL || t1 > 1 + TOL) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: tStart/tEnd moeten tussen 0 en 1 ` +
        `liggen (gekregen ${t0} … ${t1}).`);
    }
    if (t1 - t0 <= TOL) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: tEnd (${t1}) moet groter zijn dan tStart (${t0}).`);
    }
    if (!(I_mm4 > 0)) {
      throw new Error(`Staaf ${beamId}, segment ${i + 1}: I moet groter dan nul zijn (mm⁴).`);
    }
    // A per segment is optioneel (verlopend profiel); staat hij er, dan moet
    // hij net als I een positief getal zijn — een A van nul geeft een
    // rekstijfheid nul en een singulier stelsel zonder aanwijsbare oorzaak.
    const A_mm2 = s.A;
    if (A_mm2 !== undefined && !(Number.isFinite(A_mm2) && A_mm2 > 0)) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: A moet, als hij is opgegeven, groter dan nul zijn (mm²).`);
    }
    // Ondergrens die het REKENMESH stelt, niet de nauwkeurigheid: twee
    // splitsposities binnen KNOOP_TOL_MM krijgen dezelfde mesh-knoop en het
    // segment ertussen wordt een element van lengte nul (doorbuiging NaN).
    // Daarom hier een harde weigering in plaats van een stil NaN verderop.
    const lengte_mm = (t1 - t0) * L_mm;
    if (L_mm > 0 && lengte_mm < KNOOP_TOL_MM) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: lengte ${lengte_mm.toFixed(4)} mm is ` +
        `korter dan de knooptolerantie van het rekenmesh (${KNOOP_TOL_MM} mm). ` +
        `Zo'n segment levert een element van lengte nul op. Gebruik een grovere ` +
        `segmentindeling.`);
    }
    return { t0, t1, I_mm4, ...(A_mm2 !== undefined ? { A_mm2 } : {}), index: i };
  });
  // Partitie-eis: oplopend, sluitend van 0 tot 1, zonder gaten of overlap.
  if (Math.abs(uit[0].t0) > TOL || Math.abs(uit[uit.length - 1].t1 - 1) > TOL) {
    throw new Error(
      `Staaf ${beamId}: de segmenten moeten de hele staaf dekken — het eerste ` +
      `segment begint bij tStart ${uit[0].t0} en het laatste eindigt bij tEnd ` +
      `${uit[uit.length - 1].t1}; verwacht 0 en 1.`);
  }
  for (let i = 1; i < uit.length; i++) {
    if (Math.abs(uit[i].t0 - uit[i - 1].t1) > TOL) {
      throw new Error(
        `Staaf ${beamId}: segment ${i} eindigt op ${uit[i - 1].t1} en segment ` +
        `${i + 1} begint op ${uit[i].t0}. De segmenten moeten aaneensluiten ` +
        `(geen gat en geen overlap).`);
    }
  }
  return uit;
}

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
export function buildMesh(input: SolverInput | MultiInput, loadFactor?: (caseId?: number) => number): {
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
  /**
   * Rekenstukken van staven die met een eigen I PER SEGMENT zijn opgebouwd
   * (fase D, stap 10). Alleen entries voor staven waarvan de invoer een
   * `segmenten`-veld droeg; anders leeg, en dan blijft convertResult op het
   * bestaande pad. Eén item per mesh-element, op volgorde langs de staaf.
   */
  segmentUitvoer: Map<number, { meshId: number; I_mm4: number; A_mm2?: number; segmentIndex: number }[]>;
  /**
   * Staafknopen die op een plaatrand tussen twee randknopen liggen en daaraan
   * kinematisch gekoppeld worden (leeg zonder zulke knopen, en altijd leeg
   * zonder platen). Gaat mee naar `solveNonlinear`.
   */
  randKoppelingen: RandKoppeling[];
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
    // Een dubbel knoopnummer zou hier de eerdere afbeelding stil overschrijven:
    // staven die naar dat nummer wijzen, landen dan op de laatste knoop met
    // dat nummer. De MCP-poort (`valideerModel`) weigert dit al; het app-pad
    // en de engine zelf horen het ook niet door te laten.
    if (nodeIdMap.has(n.id)) {
      throw new Error(
        `Knoop ${n.id} komt tweemaal voor in het model. Elke knoop hoort een ` +
        "eigen nummer te hebben; anders is niet te zeggen op welke van de twee " +
        "een staaf, oplegging of last aangrijpt.");
    }
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
    punten: PlaatPunt[];
  }[] = [];
  const plaatPolygonen: { p: SolverPlateInput; cache: PlaatMeshCache; punten: PlaatPunt[] }[] = [];
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
        plateRects.push({ p, minX, minZ, width, height, nx, ny, punten });
        continue;
      }

      // ── Polygonpad (P4.2) ─────────────────────────────────────────────────
      // Eerst de vorm zelf valideren (zelfsnijdend, dubbele hoeken,
      // degeneraat — dekt ook de oude "gedegenereerde rechthoek"-gevallen).
      const vormFout = valideerPlaatPolygoon(punten, TOL_MM);
      if (vormFout) {
        throw new Error(`Plaat ${p.id}: ${vormFout}`);
      }
      // CDT-cache: UITSLUITEND uit de invoer. Het module-globale doorgeefluik
      // waaruit de engine hem vroeger ook las, bestond alleen in de GUI; in de
      // MCP-sidecar was het leeg, en daar rekende dezelfde plaat dus anders
      // (of niet). De signatuur borgt dat de cache bij de ACTUELE geometrie +
      // meshSize hoort; een verouderde of ontbrekende cache is een nette fout,
      // nooit een stil verkeerd mesh.
      const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
      const cache = p.meshCache && p.meshCache.signature === handtekening ? p.meshCache : undefined;
      if (!cache) {
        throw new Error(
          `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als ` +
          `polygonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. ` +
          `Open het canvas (het mesh wordt daar automatisch gegenereerd) en ` +
          `reken daarna opnieuw.`);
      }
      const beschadigd = (waarom: string): never => {
        throw new Error(
          `Plaat ${p.id}: de meshcache is beschadigd — ${waarom}. Wijzig de plaat ` +
          `(bijv. de meshSize) zodat het mesh opnieuw wordt gegenereerd.`);
      };
      // Cache-sanity: puntindices binnen bereik (beschadigd projectbestand).
      const nPts = cache.points.length;
      const driehoekenOk = Array.isArray(cache.triangles) && cache.triangles.every((t) =>
        Array.isArray(t) && t.length === 3 && t.every((i) => Number.isInteger(i) && i >= 0 && i < nPts));
      if (!driehoekenOk || nPts < 3 || cache.triangles.length < 1) {
        beschadigd("de driehoeken verwijzen naar punten die niet bestaan");
      }
      // RANDKNOPEN, PER HOEKPAAR. Zonder `edgeNodeIndices` kan geen randlast,
      // randpuntlast of randkoppeling zijn rand vinden; vroeger crashte de
      // engine hier op `undefined.every` (gemeten via de MCP). Er hoort precies
      // één lijst per rand te zijn, en elke lijst moet de rand van hoek tot hoek
      // dekken met punten die OP die rand liggen: anders zou een randlast stil
      // op een deel van de rand, of op inwendige knopen, terechtkomen.
      if (!Array.isArray(cache.edgeNodeIndices)) {
        beschadigd("`edgeNodeIndices` ontbreekt");
      }
      if (cache.edgeNodeIndices.length !== punten.length) {
        beschadigd(
          `\`edgeNodeIndices\` beschrijft ${cache.edgeNodeIndices.length} randen, ` +
          `maar de plaat heeft ${punten.length} hoeken en dus ${punten.length} randen`);
      }
      cache.edgeNodeIndices.forEach((rand, i) => {
        if (!Array.isArray(rand) || rand.length < 2
            || !rand.every((k) => Number.isInteger(k) && k >= 0 && k < nPts)) {
          beschadigd(`rand ${i + 1} heeft geen geldige lijst randknopen (minstens de twee hoeken)`);
        }
        const a = punten[i], b = punten[(i + 1) % punten.length];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        let tMin = Infinity, tMax = -Infinity;
        for (const k of rand) {
          const q = cache.points[k];
          const t = ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / L;
          const d = Math.abs((q.x - a.x) * (b.z - a.z) - (q.z - a.z) * (b.x - a.x)) / L;
          if (!(d <= TOL_MM) || t < -TOL_MM || t > L + TOL_MM) {
            beschadigd(`punt ${k} van rand ${i + 1} ligt niet op die rand`);
          }
          tMin = Math.min(tMin, t);
          tMax = Math.max(tMax, t);
        }
        if (tMin > TOL_MM || tMax < L - TOL_MM) {
          beschadigd(`de randknopen van rand ${i + 1} reiken niet van hoek tot hoek`);
        }
      });
      plaatPolygonen.push({ p, cache, punten });
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
    // Verende aansluitingen (canoniek N/mm resp. N·mm/rad) → core (N/m resp.
    // N·m/rad): translatie ×1000, rotatie /1000 — dezelfde omzetting als de
    // veeropleggingen hierboven. Een veer op een DOF dat al los is, telt niet.
    const veer = b.veren as {
      startTx?: number; startTz?: number; startRy?: number;
      endTx?: number; endTz?: number; endRy?: number;
    } | undefined;
    const kOf = (aan: boolean, los: boolean, k: number | undefined) =>
      aan && !los && k !== undefined && k > 0 ? k : undefined;
    const vSTx = kOf(metStartzijde, sTx, veer?.startTx);
    const vSTz = kOf(metStartzijde, sTz, veer?.startTz);
    const vSRy = kOf(metStartzijde, sRy, veer?.startRy);
    const vETx = kOf(metEindzijde, eTx, veer?.endTx);
    const vETz = kOf(metEindzijde, eTz, veer?.endTz);
    const vERy = kOf(metEindzijde, eRy, veer?.endRy);
    const heeftVeer = [vSTx, vSTz, vSRy, vETx, vETz, vERy].some((k) => k !== undefined);
    const updates: any = {};
    if (sTx || sTz || eTx || eTz || heeftVeer) {
      const soort = (los: boolean, k: number | undefined) => (los ? "hinge" : k !== undefined ? "spring" : "fixed");
      updates.startConnections = {
        Tx: soort(sTx, vSTx),
        Tz: soort(sTz, vSTz),
        Rz: soort(sRy, vSRy),
        ...(vSTx !== undefined ? { springTx: vSTx * 1000 } : {}),
        ...(vSTz !== undefined ? { springTz: vSTz * 1000 } : {}),
        ...(vSRy !== undefined ? { springRz: vSRy / 1000 } : {}),
      };
      updates.endConnections = {
        Tx: soort(eTx, vETx),
        Tz: soort(eTz, vETz),
        Rz: soort(eRy, vERy),
        ...(vETx !== undefined ? { springTx: vETx * 1000 } : {}),
        ...(vETz !== undefined ? { springTz: vETz * 1000 } : {}),
        ...(vERy !== undefined ? { springRz: vERy / 1000 } : {}),
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
  // last landt gewoon op de bestaande eindknoop. Een fractie die verder weg
  // ligt maar nog binnen de knooptolerantie van 1 mm, vervalt bij het
  // splitsen zelf — zie "NOOIT EEN REKENELEMENT VAN LENGTE NUL" verderop.
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

  // ── Extra sneden op knikken en sprongen in de lijnen ──────────────────────
  // WAAROM. Elk rekenelement levert een VAST aantal stations (NUM_STATIONS =
  // 21, zie BeamForces.ts). Wie de krachtenlijn of de weerstandslijn over die
  // stations volgt, interpoleert dus over alles wat er tússen gebeurt. Op
  // twee plaatsen is dat aantoonbaar fout:
  //
  //   • DEELLASTGRENS. Op x = a en x = b van een deellast knikt V(x) — de
  //     helling springt van 0 naar −q — en knikt de kromming van M(x). Valt
  //     daar geen station, dan mist de omhullende die knik: hij leest het
  //     uiterste af op het dichtstbijzijnde station, tot een halve
  //     stationsafstand ernaast.
  //   • ZONEGRENS van de wapening. Daar SPRINGT de opneembare weerstand
  //     (V_Rd, M_Rd) omdat het aantal staven verandert. Interpoleren over een
  //     sprong heeft geen betekenis; een dekkingslijn moet daar twee waarden
  //     kunnen tonen, links en rechts van de grens.
  //
  // HOE. Niet met een tweede mechanisme naast het bestaande, maar met exact
  // dezelfde splitsfracties waarmee de adapter hierboven al knipt voor
  // plaatranden, staafpuntlasten en segmentgrenzen. Een snede maakt een echte
  // rekenknoop; het stuk links en het stuk rechts leveren elk hun eigen 21
  // stations, dus op de snede staat het station DUBBEL. Dat is precies wat
  // een sprong nodig heeft — dezelfde redenering als bij de gedeelde
  // plaatrandknoop (zie convertResult) en bij een staafpuntlast, waar V ter
  // plaatse ook werkelijk springt.
  //
  // KOST HET NAUWKEURIGHEID? Nee, het levert ze op. Voor een
  // Euler-Bernoulli-staaf met consistente knooplasten is de eindige-
  // elementenoplossing in de KNOPEN exact (de homogene oplossing is kubisch
  // en ligt dus in de Hermite-ruimte). Een extra knoop midden op een staaf
  // laat reacties en knoopverplaatsingen daarom ongemoeid — op afrondruis na,
  // waarvoor MIN_SEGMENT_MM de ondergrens bewaakt — en maakt alleen het
  // stationsraster fijner.
  //
  // TWEE BRONNEN, ÉÉN LIJST:
  //   (a) de grenzen van elke DEELLAST op de staaf (startFrac/endFrac);
  //   (b) `SolverBeamInput.extraSneden` — de expliciete lijst waarlangs de
  //       aanroeper zijn eigen knikken doorgeeft. Daar landen de grenzen van
  //       de wapeningszones; die zones zelf wonen buiten de solver, naast de
  //       wapeningskorf, en de solver hoeft er niets van te weten.
  //
  // LASTGEVAL-ONAFHANKELIJK, net als de staafpuntlasten hierboven: álle
  // deellasten uit de invoer leveren hun grenzen, ook die in deze solve
  // factor 0 hebben. Zo krijgt elk belastinggeval hetzelfde stationsraster en
  // blijft superpositie van de per-geval-resultaten (combinaties, omhullende)
  // geldig. Een last die per definitie nul is (q = qStart = qEnd = 0) heeft
  // geen knik en levert dus geen snede — dat oordeel kijkt naar de LAST, niet
  // naar de gevalfactor, en breekt de onafhankelijkheid dus niet.
  const extraSnedeFracties = new Map<number, number[]>();
  const voegSnedeToe = (beamId: number, t: number): void => {
    const lijst = extraSnedeFracties.get(beamId) ?? [];
    lijst.push(t);
    extraSnedeFracties.set(beamId, lijst);
  };
  for (const ld of ((input as any).loads as Array<any> | undefined) ?? []) {
    const qa = ld.qStart ?? ld.q ?? 0;
    const qb = ld.qEnd ?? ld.q ?? 0;
    if (qa === 0 && qb === 0) continue;          // geen last → geen knik
    const a = Math.min(1, Math.max(0, ld.startFrac ?? 0));
    const c = Math.min(1, Math.max(0, ld.endFrac ?? 1));
    if (c - a <= 0) continue;                    // leeg belast deel → geen last
    if (a > 0) voegSnedeToe(ld.beamId, a);
    if (c < 1) voegSnedeToe(ld.beamId, c);
  }
  for (const b of input.beams) {
    for (const t of b.extraSneden ?? []) {
      if (Number.isFinite(t)) voegSnedeToe(b.id, t);
    }
    // Een staaf op bedding wordt fijn geknipt: de veren zitten alleen op de
    // knopen, dus de indeling bepaalt hoe goed de bedding wordt gevolgd.
    if (b.bedding) {
      const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
      if (nA && nB) {
        const L_mm = Math.hypot(nB.x - nA.x, nB.z - nA.z);
        for (const t of beddingSplitsFracties(L_mm, b.E ?? 210000, b.I ?? 1.673e7, b.bedding.kLijn)) {
          voegSnedeToe(b.id, t);
        }
      }
    }
  }

  // PLATEN BLIJVEN BUITEN SCHOT. Zodra het model ook maar één plaat bevat,
  // worden er GEEN extra sneden gezet — op geen enkele staaf. Reden: de
  // knopen van een plaatmesh en de splitsknopen van een staaf worden
  // aaneengeknoopt via `mesh.findNodeAt(..., 0.001)`, dus binnen 1 mm. Een
  // extra snede die toevallig binnen die millimeter van een plaatknoop valt,
  // zou staaf en plaat op een plek aan elkaar KNOPEN waar het model dat niet
  // vraagt (of, andersom, een losse knoop tussen twee plaatknopen zetten die
  // niet meedraagt). Dat is een modelwijziging, geen verfijning. Het gedrag
  // van elk model met platen blijft daarmee bit-identiek aan voorheen; de
  // fijnere sneden op een betonstaaf naast een plaat zijn een vervolgtaak
  // (dan per staaf toetsen op nabije plaatknopen in plaats van modelbreed).
  const modelHeeftPlaten = plateRects.length > 0 || plaatPolygonen.length > 0;

  /**
   * Mesh-knoop-id per splitsfractie, per UI-staaf — inclusief de eindknopen
   * (t = 0 en t = 1). Hiermee vindt het staafpuntlastenblok verderop de knoop
   * waarop de kracht moet landen.
   */
  const beamKnoopPerFractie = new Map<number, { t: number; meshNodeId: number }[]>();

  // Rekenstukken van gesegmenteerde staven — zie het returntype hierboven.
  const segmentUitvoer = new Map<number, { meshId: number; I_mm4: number; A_mm2?: number; segmentIndex: number }[]>();

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
    // STAAF VAN LENGTE NUL: WEIGEREN. De kern sloeg zo'n element stil over
    // (`NonlinearSolver.ts`, `if (L < 1e-10) continue`) en rekende de rest
    // door, met een krachtsverdeling die bij een ander model hoort. Hier, op de
    // grens van het model, kan de melding de staaf en de knopen bij hun
    // nummer noemen. Dezelfde drempel als de kern (1e-10 m): alleen wat daar
    // stil wegviel, wordt hier geweigerd — een korte maar echte staaf rekent
    // gewoon door. Geldt voor elk pad dat door deze adapter gaat: canvas,
    // combinaties en toetsing, de bediening en de MCP-sidecar.
    if (!(Math.hypot(nB.x - nA.x, nB.z - nA.z) >= 1e-7)) {
      throw new Error(
        `Staaf ${b.id} heeft lengte nul: knoop ${b.from} en knoop ${b.to} liggen op dezelfde ` +
        `plek (${nA.x}, ${nA.z}) mm. Zo'n staaf kan geen kracht overbrengen, en overslaan zou ` +
        "een krachtsverdeling geven bij een ander model dan is ingevoerd. Voeg de twee knopen " +
        "samen of verwijder de staaf.",
      );
    }
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

    // ── Segmenten met een eigen I (fase D, stap 10) ────────────────────────
    // De segmentgrenzen komen ACHTERAF bij de geometrische splitsfracties:
    // die laatste zijn dwingend (daar hangt een plaat of grijpt een last aan)
    // en worden nooit verplaatst of weggelaten. Een segmentgrens binnen
    // MIN_SEGMENT_MM van zo'n dwingende fractie — of van een uiteinde — wordt
    // LATEN VALLEN; dat is de samenvoegregel tegen flinters (zie
    // MIN_SEGMENT_MM voor de meting erachter). Segmentgrenzen worden bewust
    // NIET tegen elkáár afgewogen: de indeling van de aanroeper blijft intact.
    // Welke I een rekenelement krijgt volgt daarna uit zijn MIDDEN en niet uit
    // zijn nummer; die ene regel dekt samengevoegde grenzen én extra knippen
    // bínnen één segment.
    const L_mm = Math.hypot(nB.x - nA.x, nB.z - nA.z);
    const segDef = normaliseerSegmenten(b.id, b.segmenten, L_mm);
    if (segDef) {
      // Staaf met lengte 0 kan niet gesplitst worden; minFrac = ∞ laat dan
      // elke grens vallen en levert één element met de I van het middensegment.
      const minFrac = L_mm > 0 ? MIN_SEGMENT_MM / L_mm : Infinity;
      const dwingend = [0, ...splitsT, 1];
      for (const s of segDef.slice(1)) {           // grens = tStart van segment 2..n
        if (dwingend.some((t) => Math.abs(t - s.t0) < minFrac)) continue;
        splitsT.push(s.t0);
      }
      splitsT.sort((p, q) => p - q);
    }

    // ── Extra sneden erbij (deellastgrenzen en `extraSneden`) ──────────────
    // Ze komen ALS LAATSTE, ná de dwingende fracties en ná de segmentgrenzen.
    // Dat is geen willekeur:
    //  • Ze mogen niets verdringen. Een dwingende fractie draagt een plaat of
    //    een puntlast, een segmentgrens draagt een eigen I; een extra snede
    //    draagt alleen een STATION. Bij twijfel verliest dus de extra snede.
    //  • Daardoor blijft de bestaande samenvoegregel voor segmentgrenzen
    //    letterlijk zoals hij was: die weegt tegen `dwingend` en heeft nog
    //    nooit een extra snede gezien.
    //
    // De drempel is dezelfde MIN_SEGMENT_MM als hierboven, maar de weging is
    // STRENGER: een extra snede wordt niet alleen tegen de al aanvaarde
    // fracties gewogen maar ook tegen de al aanvaarde EXTRA SNEDEN. Twee
    // deellastgrenzen op 3 mm van elkaar leveren dus één snede en geen
    // flinterelement van 3 mm — bij zo'n lengte loopt de afrondfout in de
    // stijfheidsmatrix op tot ~1e-7 relatief (zie de meettabel bij
    // MIN_SEGMENT_MM). Dat mag hier strenger dan bij de segmentgrenzen, want
    // het weglaten van een extra snede kost hooguit één tekenpunt, terwijl
    // het weglaten van een segmentgrens een verkeerde I zou opleveren.
    // De linkerkandidaat wint (de lijst wordt oplopend afgelopen), zodat de
    // uitkomst niet van de invoervolgorde van de lasten afhangt.
    if (!modelHeeftPlaten) {
      const minFracSnede = L_mm > 0 ? MIN_SEGMENT_MM / L_mm : Infinity;
      const kandidaten = [...(extraSnedeFracties.get(b.id) ?? [])].sort((p, q) => p - q);
      let iets = false;
      for (const t of kandidaten) {
        // Te dicht op een uiteinde: de last landt daar al op de eindknoop.
        if (!(t > minFracSnede) || !(t < 1 - minFracSnede)) continue;
        if (splitsT.some((u) => Math.abs(u - t) < minFracSnede)) continue;
        // NOOIT AAN EEN BESTAANDE KNOOP LASSEN. De splitslus hieronder
        // hergebruikt via `mesh.findNodeAt(..., 0.001)` een knoop die al
        // binnen 1 mm ligt — bedoeld voor plaatrandknopen, die er juist aan
        // vast MOETEN. Voor een extra snede is dat verkeerd: ligt er een losse
        // knoop op deze staaf (een kolomvoet die er alleen tegenaan staat, het
        // einde van een andere staaf), dan zou de snede die knoop ongevraagd
        // AAN de staaf knopen en het mechanisme repareren dat de gebruiker nog
        // moet zien. Een verfijning mag de constructie niet veranderen, dus:
        // ligt er al een knoop, dan vervalt de snede. Dat de uitkomst daarmee
        // van de staafvolgorde kan afhangen (knopen van eerder gesplitste
        // staven staan er al) is aanvaard — de uitkomst van die afhankelijkheid
        // is altijd "niet knippen", nooit een gewijzigd model.
        const mxT = (nA.x + t * (nB.x - nA.x)) / 1000;
        const myT = (nA.z + t * (nB.z - nA.z)) / 1000;
        if (mesh.findNodeAt(mxT, myT, 0.001)) continue;
        splitsT.push(t);
        iets = true;
      }
      if (iets) splitsT.sort((p, q) => p - q);
    }

    /**
     * Doorsnede van het rekenstuk [t0, t1]: h van de staaf, I van het
     * segment waarin het MIDDEN van het stuk valt (zonder segmenten: de
     * staaf-I, en dan is dit hetzelfde object als voorheen), en A van
     * datzelfde segment als het er een draagt (verlopend profiel), anders
     * de A van de staaf.
     */
    const doorsnedeVoor = (t0: number, t1: number):
      { sec: typeof section; I_mm4: number; A_mm2?: number; segmentIndex: number } => {
      if (!segDef) return { sec: section, I_mm4: 0, segmentIndex: -1 };
      const mid = (t0 + t1) / 2;
      const s = segDef.find((d) => mid >= d.t0 && mid < d.t1) ?? segDef[segDef.length - 1];
      return {
        sec: {
          A: s.A_mm2 !== undefined ? s.A_mm2 * 1e-6 : section.A,
          I: s.I_mm4 * 1e-12,
          h: section.h,
        },
        I_mm4: s.I_mm4,
        ...(s.A_mm2 !== undefined ? { A_mm2: s.A_mm2 } : {}),
        segmentIndex: s.index,
      };
    };

    /**
     * De bedding van de kern op één mesh-element: `k` in N/m² met b = 1, dus
     * de lijnstijfheid k·b uit de invoer (N/mm²) maal 1e6. De kern zet er
     * veren kL/2 op beide knopen van het element; een tussenknoop krijgt zo
     * van beide buren samen kL — de tributaire lengte.
     */
    const zetBedding = (meshId: number): void => {
      if (!b.bedding) return;
      mesh.updateBeamElement(meshId, {
        onGrade: { enabled: true, k: b.bedding.kLijn * 1e6, b: 1 },
      });
    };

    if (splitsT.length === 0) {
      // Ongesplitst — het bestaande pad (bit-identiek zonder platen).
      const d = doorsnedeVoor(0, 1);
      const meshBeam = mesh.addBeamElement([fromId, toId], matId, d.sec);
      if (!meshBeam) continue;
      beamIdMap.set(b.id, meshBeam.id);
      pasReleasesToe(meshBeam.id, b, true, true);
      zetBedding(meshBeam.id);
      beamKnoopPerFractie.set(b.id, [
        { t: 0, meshNodeId: fromId }, { t: 1, meshNodeId: toId },
      ]);
      if (segDef) {
        segmentUitvoer.set(b.id,
          [{ meshId: meshBeam.id, I_mm4: d.I_mm4, A_mm2: d.A_mm2, segmentIndex: d.segmentIndex }]);
      }
    } else {
      // Tussenknopen op de gridposities van de plaatrand. findNodeAt
      // hergebruikt een eventueel al bestaande (UI-)knoop binnen 1 mm; het
      // plaatgrid pikt straks dezelfde knopen op — staaf en plaat delen dus
      // álle randknopen.
      // NOOIT EEN REKENELEMENT VAN LENGTE NUL. `findNodeAt` hergebruikt een
      // knoop binnen 1 mm. Ligt een splitsfractie binnen die millimeter van de
      // VORIGE knoop in de keten — een puntlast op 0,6 mm van een eindknoop,
      // twee puntlasten 0,3 mm uit elkaar, een puntlast naast een
      // plaatrandknoop — dan kreeg die splitsing dezelfde knoop als zijn
      // voorganger, en ontstond er een element van lengte nul: NaN in de
      // momentenlijn (frame-pad) of een weigering (gemengd pad). Gemeten: bij
      // 0,999 mm NaN, bij 1 mm niet. Zo'n splitsing vervalt nu; de last landt
      // hieronder via de dichtstbijzijnde geregistreerde fractie op diezelfde
      // knoop, binnen de millimeter die de knooptolerantie al als "dezelfde
      // plek" behandelt. Het criterium is letterlijk dat van `findNodeAt`, dus
      // een splitsing op 1 mm of meer blijft precies wat hij was.
      const knoopIds = [fromId];
      const grens = [0];
      for (const t of splitsT) {
        const mx = (nA.x + t * (nB.x - nA.x)) / 1000;
        const my = (nA.z + t * (nB.z - nA.z)) / 1000;
        const bestaand = mesh.findNodeAt(mx, my, 0.001);
        const knoopId = bestaand ? bestaand.id : mesh.addNode(mx, my).id;
        if (knoopId === knoopIds[knoopIds.length - 1]) continue;
        knoopIds.push(knoopId);
        grens.push(t);
      }
      // Viel de laatste splitsing op de eindknoop zelf, dan is dat geen stuk.
      if (knoopIds.length > 1 && knoopIds[knoopIds.length - 1] === toId) {
        knoopIds.pop();
        grens.pop();
      }
      knoopIds.push(toId);
      grens.push(1);
      beamKnoopPerFractie.set(b.id,
        grens.map((t, i) => ({ t, meshNodeId: knoopIds[i] })));
      const segs: { meshId: number; t0: number; t1: number }[] = [];
      const stukken: { meshId: number; I_mm4: number; A_mm2?: number; segmentIndex: number }[] = [];
      for (let i = 0; i < knoopIds.length - 1; i++) {
        const d = doorsnedeVoor(grens[i], grens[i + 1]);
        const mb = mesh.addBeamElement([knoopIds[i], knoopIds[i + 1]], matId, d.sec);
        if (!mb) continue;
        pasReleasesToe(mb.id, b, i === 0, i === knoopIds.length - 2);
        zetBedding(mb.id);
        segs.push({ meshId: mb.id, t0: grens[i], t1: grens[i + 1] });
        stukken.push({ meshId: mb.id, I_mm4: d.I_mm4, A_mm2: d.A_mm2, segmentIndex: d.segmentIndex });
      }
      if (segs.length > 0) {
        beamIdMap.set(b.id, segs[0].meshId);
        if (segs.length > 1) beamSegments.set(b.id, segs);
        if (segDef) segmentUitvoer.set(b.id, stukken);
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
    for (const { p, minX, minZ, width, height, nx, ny, punten } of plateRects) {
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
      plateInfo.push({ plateId: p.id, region, hoeken: punten });
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
    for (const { p, cache, punten } of plaatPolygonen) {
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
        // rand-index (edgeNodeIds hieronder); een benoemde rand op een
        // polygonplaat wordt door `bepaalPlaatRand` geweigerd.
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
      plateInfo.push({ plateId: p.id, region, edgeNodeIds, hoeken: punten });
      pasPlaatEigengewichtToe(p, elementIds);
    }
  }

  // ── Randknopen van een plaatrand ──────────────────────────────────────────
  // ADRESSERING: één regel, `bepaalPlaatRand` (femTypes). Hij zet `edge` of
  // `edgeIndex` om naar het hoekpaar van de rand; de randknopen komen daarna
  // uit het gridmesh (rechthoek: de zijde met die naam) of uit de CDT-cache
  // (polygoon: de lijst van die rand-index). Een adres dat daar niet doorheen
  // komt, en een last op een plaat die niet in het model staat, WEIGEREN de
  // hele berekening met een reden. Tot september 2026 vielen zulke lasten stil
  // weg of kwamen ze op een andere rand terecht; een ontbrekende last leest in
  // een resultaat als "geen last".
  const infoByPlateId = new Map(plateInfo.map((pi) => [pi.plateId, pi]));

  /**
   * De rekenknopen op één plaatrand, geordend van fractie 0 (`hoekVan`) naar
   * fractie 1 (`hoekNaar`), met hun afstand `s` (m) vanaf `hoekVan` en de
   * randlengte `L` (m). `wat` noemt de last in een eventuele melding.
   */
  const randKnopenVan = (
    plateId: number, adres: { edge?: string; edgeIndex?: number }, wat: string,
  ): { nodeIds: number[]; s: number[]; L: number } => {
    // Elke melding begint met "Plaat N": zo herkent de MCP-foutafbeelding
    // (mcp/fouten.ts) hem als Nederlandse modelmelding en geeft hem
    // ongewijzigd door, in plaats van er een INTERN-storing van te maken.
    const info = infoByPlateId.get(plateId);
    if (!info) {
      throw new Error(
        `Plaat ${plateId} staat niet in het model, maar ${wat} verwijst ernaar. ` +
        "Een last zonder plaat overslaan zou een berekening geven zonder die last.");
    }
    const rand = bepaalPlaatRand(info.hoeken, adres, TOL_MM);
    if (!rand.ok) throw new Error(`Plaat ${plateId}: ${wat} — ${rand.reden}`);
    const kandidaten = rand.soort === "rechthoek"
      ? info.region.edges[rand.naam!].nodeIds
      : info.edgeNodeIds![rand.edgeIndex!];
    // Ordenen op de projectie langs van → naar (m). De randlijsten van het
    // grid en van de cache liggen al op de rand (gecontroleerd bij het
    // inlezen van de cache); ordenen maakt de richting van de fracties
    // onafhankelijk van de volgorde waarin een mesher ze opsomde.
    const ax = rand.van.x / 1000, az = rand.van.z / 1000;
    const L = rand.lengte / 1000;
    const ex = (rand.naar.x - rand.van.x) / rand.lengte;
    const ez = (rand.naar.z - rand.van.z) / rand.lengte;
    const rij = [...new Set(kandidaten)].map((nid) => {
      const nd = mesh.getNode(nid);
      return { nid, s: nd ? (nd.x - ax) * ex + (nd.y - az) * ez : NaN };
    });
    if (rij.length < 2 || rij.some((r) => !Number.isFinite(r.s))) {
      throw new Error(
        `Plaat ${plateId}: ${wat} — de rand heeft geen bruikbare rekenknopen ` +
        "(het rekenmesh is onvolledig). Wijzig de plaat zodat het mesh opnieuw wordt gemaakt.");
    }
    rij.sort((a, b) => a.s - b.s);
    return { nodeIds: rij.map((r) => r.nid), s: rij.map((r) => r.s), L };
  };

  // ── Staafeinde op een plaatrand TUSSEN twee randknopen: koppelen ──────────
  // WAT ER MISGING. Een staaf die op een plaatrand eindigt, deelt alleen een
  // knoop met de plaat als dat eindpunt toevallig op een rekenknoop van de rand
  // valt (binnen 1 mm, `findNodeAt`). Ligt het ertussen, dan hing de staaf los
  // naast de plaat: gemeten bij een wand van 4 × 3 m met meshSize 1000 en een
  // kolomvoet op x = 1500 gaf dat een kale "Matrix is singular", en op
  // x = 2000 rekende hetzelfde model gewoon. Of een aansluiting bestaat, mag
  // niet van de elementgrootte afhangen.
  //
  // DE KEUZE: KINEMATISCH KOPPELEN, NIET WEIGEREN. De verplaatsing van het
  // membraan langs een elementrand is lineair tussen de twee randknopen
  // (CST en Quad4). Een knoop op fractie t van die rand verplaatst dus exact
  //     u = (1 − t)·u_a + t·u_b,    v = (1 − t)·v_a + t·v_b.
  // Die voorwaarde legt de kern op door eliminatie (NonlinearSolverOptions.
  // randKoppelingen): de staafknoop wordt een slaaf van de twee randknopen.
  // Dat is precies de verbinding die de staaf ook had gehad als hij op een
  // randknoop eindigde — de rotatie blijft vrij, want een membraan draagt in
  // zijn knopen geen moment — en een kracht op de staafknoop komt met
  // dezelfde gewichten op de rand als een randpuntlast op die plek. Een
  // weigering zou de gebruiker dwingen de meshSize op zijn staven af te
  // stemmen; de koppeling is exact binnen dezelfde elementaanname die de
  // plaat al maakt.
  //
  // GEWEIGERD wordt wat niet eenduidig is: een starre oplegging op zo'n
  // gekoppelde knoop, en een knoop op de rand van twee platen die daar
  // verschillende randknopen hebben.
  const randKoppelingen: RandKoppeling[] = [];
  if (plateInfo.length > 0) {
    const uiIdVan = new Map<number, number>();
    for (const [uiId, meshId] of nodeIdMap) uiIdVan.set(meshId, uiId);
    const knoopNaam = (meshId: number): string => {
      const ui = uiIdVan.get(meshId);
      if (ui !== undefined) return `knoop ${ui}`;
      const nd = mesh.getNode(meshId);
      return nd
        ? `de rekenknoop op (${Math.round(nd.x * 1e4) / 10}, ${Math.round(nd.y * 1e4) / 10}) mm`
        : `rekenknoop ${meshId}`;
    };
    const plaatKnopen = new Set<number>();
    for (const el of mesh.elements.values()) for (const nid of el.nodeIds) plaatKnopen.add(nid);
    // Alle randrijen van alle platen, langs dezelfde ordening als de lasten.
    const rijen: { plateId: number; nodeIds: number[] }[] = [];
    for (const info of plateInfo) {
      const adressen = info.edgeNodeIds
        ? info.hoeken.map((_, i) => ({ edgeIndex: i }))
        : (["bottom", "top", "left", "right"] as const).map((edge) => ({ edge }));
      for (const adres of adressen) {
        rijen.push({ plateId: info.plateId, nodeIds: randKnopenVan(info.plateId, adres, "een plaatrand").nodeIds });
      }
    }
    const staafKnopen = new Set<number>();
    for (const be of mesh.beamElements.values()) for (const nid of be.nodeIds) staafKnopen.add(nid);
    const TOL_M = TOL_MM / 1000;
    for (const nid of staafKnopen) {
      if (plaatKnopen.has(nid)) continue;           // al een randknoop: gedeeld
      const nd = mesh.getNode(nid);
      if (!nd) continue;
      // Per plaat de dichtstbijzijnde elementrand waar de knoop op ligt.
      const perPlaat = new Map<number, { a: number; b: number; t: number; d: number }>();
      for (const rij of rijen) {
        for (let j = 0; j + 1 < rij.nodeIds.length; j++) {
          const na = mesh.getNode(rij.nodeIds[j]);
          const nb = mesh.getNode(rij.nodeIds[j + 1]);
          if (!na || !nb) continue;
          const dx = nb.x - na.x, dy = nb.y - na.y;
          const l2 = dx * dx + dy * dy;
          if (!(l2 > 0)) continue;
          const t = ((nd.x - na.x) * dx + (nd.y - na.y) * dy) / l2;
          if (t < 0 || t > 1) continue;
          const d = Math.abs((nd.x - na.x) * dy - (nd.y - na.y) * dx) / Math.sqrt(l2);
          if (d > TOL_M) continue;
          const oud = perPlaat.get(rij.plateId);
          if (!oud || d < oud.d) perPlaat.set(rij.plateId, { a: na.id, b: nb.id, t, d });
        }
      }
      if (perPlaat.size === 0) continue;
      const [[eerstePlaat, k0], ...rest] = [...perPlaat.entries()];
      for (const [pid, k] of rest) {
        const zelfde =
          (k.a === k0.a && k.b === k0.b && Math.abs(k.t - k0.t) < 1e-9)
          || (k.a === k0.b && k.b === k0.a && Math.abs(k.t - (1 - k0.t)) < 1e-9);
        if (!zelfde) {
          throw new Error(
            `Plaat ${eerstePlaat} en plaat ${pid}: ${knoopNaam(nid)} ligt op de rand van ` +
            "beide platen, maar tussen verschillende rekenknopen van die randen. Aan welke " +
            "rand de staaf dan hangt, is niet eenduidig. Geef beide platen langs die rand " +
            "dezelfde rekenknopen (gelijke meshSize en ligging), of laat de staaf op een hoek " +
            "of rekenknoop aansluiten.");
        }
      }
      const c = nd.constraints;
      if ((c.x && c.springX == null) || (c.y && c.springY == null)) {
        throw new Error(
          `Plaat ${eerstePlaat}: de oplegging op ${knoopNaam(nid)} staat op een staafknoop die ` +
          "tussen twee rekenknopen op de plaatrand ligt. Zo'n knoop wordt kinematisch aan die " +
          "rand gekoppeld (lineaire interpolatie tussen de twee randknopen); een starre " +
          "oplegging in x of z erop is dan niet eenduidig te verwerken. Zet de oplegging op een " +
          "hoek of rekenknoop van de plaat, of kies de meshSize zodat deze knoop een rekenknoop wordt.");
      }
      randKoppelingen.push({
        slaafKnoopId: nid,
        meesters: [{ knoopId: k0.a, gewicht: 1 - k0.t }, { knoopId: k0.b, gewicht: k0.t }],
      });
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
  // p (kN/m = N/mm) → N/m, naar knooplasten op de mesh-randknopen: ΣF exact.
  // De scheefstand-companion werkt — net als bij knoop-, staaf- en
  // gewichtslasten — op de VERTICALE component ná omzetting. De rand komt uit
  // `randKnopenVan` hierboven (één adresregel, harde weigering).
  //
  // De adressen en het belaste deel worden gecontroleerd VOOR de
  // factorcontrole: een ongeldige last hoort in elk belastinggeval dezelfde
  // fout te geven, niet alleen in het geval waar hij toevallig in zit.
  const edgeLds = ((input as any).edgeLoads as Array<any> | undefined) ?? [];

  /** Knoopkrachten (N, globale assen) op de mesh, met de scheefstand-metgezel. */
  const zetRandkrachten = (krachten: { nodeId: number; fx: number; fy: number }[]): void => {
    applyNodalForces(mesh, krachten.map((kr) => ({
      nodeId: kr.nodeId,
      fx: kr.fx + schFactor * -kr.fy,
      fy: kr.fy,
    })));
  };

  for (const el of edgeLds) {
    const rand = randKnopenVan(el.plateId, el, "een randlast");
    // DEELLAST EN TRAPEZIUM, met de betekenis van een staaf: het belaste deel
    // loopt van startFrac tot endFrac langs de rand vanaf de beginhoek, en de
    // waarde lineair van pStart naar pEnd over dat deel. Een leeg of omgekeerd
    // deel is geen last; overslaan zou een berekening zonder die last geven.
    const a = el.startFrac ?? 0;
    const b = el.endFrac ?? 1;
    if (!(Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 1 && a < b)) {
      throw new Error(
        `Plaat ${el.plateId}: een randlast heeft een belast deel dat niet binnen de rand ` +
        `ligt of niet vóór zijn einde begint (startFrac ${a}, endFrac ${b}). Geef ` +
        "0 ≤ startFrac < endFrac ≤ 1, gemeten vanaf de beginhoek van de rand.");
    }
    const f = loadFactor ? loadFactor(el.caseId) : 1;
    if (f === 0) continue;
    const pA = el.pStart ?? el.p ?? 0;
    const pB = el.pEnd ?? el.p ?? 0;
    if (pA === 0 && pB === 0) continue;
    const dir = (el.dir ?? "z") as "x" | "z";
    if (a === 0 && b === 1 && pA === pB) {
      // Volle gelijkmatige randlast: het bestaande pad (tributaire lengten),
      // bit-identiek aan voorheen. Wiskundig is het dezelfde verdeling als de
      // consistente hieronder: ½·p·ℓ per knoop per elementrand.
      const p_Nm = pA * 1000 * f;                  // kN/m (= N/mm) → N/m, gefactoreerd
      zetRandkrachten(computeEdgeLoadNodalForces(
        mesh, rand.nodeIds, dir === "x" ? p_Nm : 0, dir === "z" ? p_Nm : 0));
      continue;
    }
    // Deellast of trapezium: consistente knoopkrachten volgens de lineaire
    // vormfuncties van de randelementen, ook als het belaste deel binnen een
    // elementrand begint of eindigt (PlateLoads.verdeelRandlastConsistent).
    const qa = pA * 1000 * f, qb = pB * 1000 * f;  // N/m
    zetRandkrachten(verdeelRandlastConsistent(
      rand.nodeIds, rand.s, a * rand.L, b * rand.L,
      dir === "x" ? qa : 0, dir === "z" ? qa : 0,
      dir === "x" ? qb : 0, dir === "z" ? qb : 0));
  }

  // ── Puntlasten op een plaatrand ───────────────────────────────────────────
  // De kracht gaat naar de twee randknopen van de elementrand waarop hij staat,
  // gewogen met de lineaire vormfuncties (PlateLoads.verdeelRandpuntlastConsistent):
  // exact voor lineaire randen, geen nieuwe rekenknoop en dus hetzelfde mesh in
  // elk belastinggeval. Een ontbrekende of onmogelijke positie wordt geweigerd;
  // "op 0 zetten" zou een last op een andere plek zijn dan is ingevoerd.
  const randPls = ((input as any).edgePointLoads as Array<any> | undefined) ?? [];
  for (const pl of randPls) {
    const rand = randKnopenVan(pl.plateId, pl, "een puntlast op de plaatrand");
    const t = pl.posFrac;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
      throw new Error(
        `Plaat ${pl.plateId}: een puntlast op de plaatrand heeft ` +
        (t === undefined ? "geen positie" : `een positie buiten de rand (posFrac ${t})`) +
        ". Geef posFrac als fractie 0 … 1 langs de rand, gemeten vanaf de beginhoek.");
    }
    const f = loadFactor ? loadFactor(pl.caseId) : 1;
    if (f === 0) continue;
    const fx = (pl.fx ?? 0) * f, fz = (pl.fz ?? 0) * f;   // N
    if (fx === 0 && fz === 0) continue;
    zetRandkrachten(verdeelRandpuntlastConsistent(rand.nodeIds, rand.s, t * rand.L, fx, fz));
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

  return { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen };
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
  segmentUitvoer?: Map<number, { meshId: number; I_mm4: number; A_mm2?: number; segmentIndex: number }[]>,
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
  // LET OP: die 21 gelden PER REKENELEMENT, niet per UI-staaf. Een staaf die
  // op een plaatrand, een staafpuntlast, een segmentgrens of een extra snede
  // is geknipt, levert 21 stations per stuk, aaneengeregen tot één reeks —
  // met een DUBBEL station op elke knip. Elke lezer moet dus over
  // `stations_mm.length` lopen en nooit een vast aantal aannemen.
  /**
   * Segmentuitkomsten van één staaf (fase D, stap 10): per rekenstuk de
   * x-grenzen langs de staaf, de gebruikte I, en de N/M die erin optraden.
   * De x-as loopt gelijk met `stations_mm`, dus de offsets worden op dezelfde
   * manier opgeteld als daar: de lengte van elk stuk is het laatste station
   * van dat stuk.
   *
   * TEKENS: N wordt hier — net als in het staafresultaat zelf — van de
   * druk-positieve core naar de TREK-POSITIEVE adaptergrens geflipt; M gaat
   * van N·m naar N·mm.
   */
  const bouwSegmentUitvoer = (
    stukken: { meshId: number; I_mm4: number; A_mm2?: number; segmentIndex: number }[],
  ): BeamSegmentForces[] | undefined => {
    const uit: BeamSegmentForces[] = [];
    let offset_m = 0;
    for (const stuk of stukken) {
      const d = engineResult.beamForces.get(stuk.meshId);
      if (!d) return undefined;              // onvolledig → veld weglaten
      const st: number[] = d.stations ?? [];
      const L_stuk_m = st.length > 0 ? st[st.length - 1] : 0;
      const nArr: number[] = d.normalForce ?? [];
      const mArr: number[] = d.bendingMoment ?? [];
      let iMax = 0;
      for (let i = 1; i < mArr.length; i++) {
        if (Math.abs(mArr[i]) > Math.abs(mArr[iMax])) iMax = i;
      }
      const laatste = Math.max(0, mArr.length - 1);
      uit.push({
        xStart: offset_m * 1000,
        xEnd: (offset_m + L_stuk_m) * 1000,
        I: stuk.I_mm4,
        ...(stuk.A_mm2 !== undefined ? { A: stuk.A_mm2 } : {}),
        segmentIndex: stuk.segmentIndex,
        N_start: -(nArr[0] ?? 0),
        N_end:   -(nArr[nArr.length - 1] ?? 0),
        M_start: (mArr[0] ?? 0) * 1000,
        M_end:   (mArr[laatste] ?? 0) * 1000,
        M_max:   (mArr[iMax] ?? 0) * 1000,
        N_bij_M_max: -(nArr[iMax] ?? 0),
      });
      offset_m += L_stuk_m;
    }
    return uit;
  };

  for (const [uiId, meshId] of beamIdMap) {
    const stukken = segmentUitvoer?.get(uiId);
    const segmentVeld = stukken ? bouwSegmentUitvoer(stukken) : undefined;
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
      const rotation: number[] = [];
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
          // θ is dimensieloos (rad = m/m) — géén eenheidsomrekening. Op de
          // gedeelde randknoop staat het station dubbel; θ is daar continu,
          // dus beide kopieën dragen dezelfde waarde.
          rotation.push(d.rotation?.[i] ?? 0);
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
        rotation,
        ...(segmentVeld ? { segmenten: segmentVeld } : {}),
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
      // θ = dw/dx is dimensieloos (rad): dezelfde waarde in m-assen en in
      // mm-assen, dus onveranderd doorgegeven.
      rotation:   bf.rotation ?? [],
      ...(segmentVeld ? { segmenten: segmentVeld } : {}),
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

// ── Staaf op bedding: de indeling ───────────────────────────────────────────

/**
 * De splitsfracties (0 < t < 1) waarmee een staaf op bedding wordt geknipt.
 *
 * De kern legt de bedding als veren op de KNOPEN (kL/2 per element-einde).
 * Hoe goed dat de continue bedding volgt hangt dus af van de elementlengte,
 * afgezet tegen de karakteristieke lengte van de ligger op bedding:
 *
 *     λ = (k·b / (4·E·I))^¼        [1/mm]
 *
 * Een puntlast klinkt uit over ongeveer π/λ; om die golf te volgen hoort een
 * element niet langer te zijn dan ~0,15/λ. Referentie R26 (SSLL15) laat de
 * convergentie van deze knoopveren zien: 2 → 8 → … → 512 elementen. Hier:
 * ten minste 8 elementen, en verder zo veel als 0,15/λ vraagt, met een
 * bovengrens van 200 — een staaf van 20 m op stijve grond wordt dan
 * 100 mm-elementen, en dat is nog steeds een klein stelsel.
 *
 * Geëxporteerd zodat een test dezelfde indeling kan nabouwen met losse
 * Z-veren en aantonen dat bedding en handveren hetzelfde stelsel geven.
 */
export function beddingSplitsFracties(L_mm: number, E_nmm2: number, I_mm4: number, kLijn: number): number[] {
  if (!(L_mm > 0) || !(kLijn > 0) || !(E_nmm2 > 0) || !(I_mm4 > 0)) return [];
  const lambda = Math.pow(kLijn / (4 * E_nmm2 * I_mm4), 0.25);   // 1/mm
  const maxLengte = 0.15 / lambda;                                // mm
  const n = Math.min(200, Math.max(8, Math.ceil(L_mm / maxLengte)));
  const uit: number[] = [];
  for (let i = 1; i < n; i++) uit.push(i / n);
  return uit;
}

// ── Solverlogboek ───────────────────────────────────────────────────────────

/**
 * De opvanger die de kern zijn regels geeft, of `undefined` als niemand luistert.
 *
 * WAAROM EEN MODULE-GLOBALE EN GEEN PARAMETER
 * Het log moet uit drie paden komen: de losse belastinggevallen, de tweede orde
 * per combinatie, en de enkele solve. Het tweede-orde-pad wordt niet vanuit de
 * app aangeroepen maar vanuit `combineResults` in `combinations.ts`, en dié
 * functie heeft zelf een handvol aanroepers. Een parameter zou dus door vijf
 * lagen moeten die er verder niets mee doen — en elk van die lagen zou hem
 * kunnen vergeten, waarna één pad stilletjes niet meer logt.
 *
 * Deze module zit in de sidecar-bundel en mag daarom niets van de UI kennen.
 * Dat blijft zo: hier staat alleen een functietype. De app zet er een opvanger
 * in die naar `stores/solverLogStore` schrijft; het kale Node-proces van de
 * sidecar zet niets en logt dus ook niets — dan blijft dit `undefined` en wordt
 * er in de kern geen tekst opgebouwd.
 */
let actieveLogOpvanger: NonlinearSolverOptions["onLog"];

/**
 * Zet (of wis, met `undefined`) de ontvanger van het solverlogboek.
 *
 * De aanroeper hoort hem vóór de berekening te zetten. Wissen is niet nodig:
 * de volgende berekening overschrijft hem, en een opvanger die blijft staan
 * kost niets zolang er niet gerekend wordt.
 */
export function zetSolverLogOpvanger(f: NonlinearSolverOptions["onLog"]): void {
  actieveLogOpvanger = f;
}

/**
 * De opvanger met een vast voorvoegsel — het belastinggeval of de combinatie.
 * Zonder dat staan de assemblies van vier gevallen onder elkaar zonder dat te
 * zien is welke bij welk hoort, en juist bij een divergentie is dát de vraag.
 */
function logMet(voorvoegsel: string): NonlinearSolverOptions["onLog"] {
  const opvanger = actieveLogOpvanger;
  if (!opvanger) return undefined;
  return (r) => opvanger({ ...r, tekst: `[${voorvoegsel}] ${r.tekst}` });
}

// ── Meldingen op de modelgrens ──────────────────────────────────────────────

/**
 * Een singulier stelsel met het KNOOPNUMMER uit het model in plaats van de
 * rekenknoop. De kern kent alleen zijn eigen knopen; deze adapter heeft de
 * vertaling. Een tussenknoop die de adapter zelf aanlegde (een splitsing)
 * heeft geen modelnummer en houdt het label "een rekenknoop", met de plek.
 */
function metKnoopnummer(
  e: unknown, nodeIdMap: Map<number, number>, plateInfo: PlateRegionInfo[] = [],
): unknown {
  // Een schijfelement dat niet op te bouwen is: de kern kent alleen zijn eigen
  // elementnummer, de adapter weet bij welke plaat het hoort.
  if (e instanceof PlaatElementFout) {
    const plaat = plateInfo.find((pi) => pi.region.elementIds.includes(e.meshElementId));
    return new Error(plaat ? `Plaat ${plaat.plateId}: ${e.message}` : e.message);
  }
  if (!(e instanceof SingulierStelselFout)) return e;
  for (const [uiId, meshId] of nodeIdMap) {
    if (meshId === e.meshKnoopId) return new Error(e.tekstVoor(`knoop ${uiId}`));
  }
  return new Error(e.message);
}

/**
 * EINDIGHEIDSCONTROLE. Een resultaat met NaN of oneindig mag niet verder: in
 * de tabel werd het een lege cel, in het rapport een "—", in het
 * eigenschappenvenster "NaN kNm", en de toetskern weigerde met "invalid type:
 * null, expected f64" — een melding die de oorzaak niet noemt. JSON schrijft
 * NaN bovendien als null weg, en dat kan als nul worden gelezen. Hier stopt
 * het met een Nederlandse melding die de staaf of knoop noemt.
 *
 * Een correct model levert per definitie eindige getallen, dus deze controle
 * verandert daar niets aan.
 */
function eisEindigeUitkomst(r: SolverResult, wat: string): SolverResult {
  const stop = (waar: string): never => {
    throw new Error(
      `De berekening leverde een ongeldig getal (NaN of oneindig) op${wat} bij ${waar}. ` +
      "Dat resultaat wordt niet getoond of getoetst. Meestal zit er een rekenelement van " +
      "(bijna) lengte nul in het model — twee knopen of een puntlast vlak naast elkaar — of " +
      "een staaf zonder stijfheid.",
    );
  };
  const eindig = (v: number | undefined) => v === undefined || Number.isFinite(v);
  for (const [id, d] of r.displacements) {
    if (!eindig(d.ux) || !eindig(d.uz) || !eindig(d.ry)) stop(`de verplaatsing van knoop ${id}`);
  }
  for (const [id, re] of r.reactions) {
    if (!eindig(re.fx) || !eindig(re.fz) || !eindig(re.my)) stop(`de oplegreactie van knoop ${id}`);
  }
  for (const [id, ef] of r.elements) {
    if (!eindig(ef.N) || !eindig(ef.V) || !eindig(ef.M_start) || !eindig(ef.M_end)) {
      stop(`de staafkrachten van staaf ${id}`);
    }
    const lijnen: [string, number[] | undefined][] = [
      ["de momentenlijn", ef.bendingMoment],
      ["de dwarskrachtenlijn", ef.shearForce],
      ["de normaalkrachtenlijn", ef.normalForce],
      ["de doorbuigingslijn", ef.deflection],
    ];
    for (const [naam, lijn] of lijnen) {
      if (lijn?.some((v) => !Number.isFinite(v))) stop(`${naam} van staaf ${id}`);
    }
  }
  return r;
}

// ── Public engine functions ─────────────────────────────────────────────────

export function solve(input: SolverInput): SolverResult {
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(input);
  // Platen aanwezig ⇒ mixed_beam_plate (staven 6×6 + membranen 3 DOF/knoop);
  // zonder platen blijft het pad bit-identiek "frame".
  const heeftPlaten = plateInfo.length > 0;
  let engineResult;
  try {
    engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: false,
      randKoppelingen,
    });
  } catch (e) {
    throw metKnoopnummer(e, nodeIdMap, plateInfo);
  }
  const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : undefined;
  return eisEindigeUitkomst(
    convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments, segmentUitvoer),
    "",
  );
}

// ── Scheefstand in beide richtingen ─────────────────────────────────────────
//
// EN 1993-1-1 5.3.2(2) eist de initiële scheefstand "in de meest ongunstige
// richting"; 5.3.2(8) noemt alle relevante richtingen, één per keer. Tot
// september 2026 rekende de motor één vaste richting (+x tenzij de gebruiker
// −x koos) voor álle combinaties (basisaudit nr 28). Op een symmetrisch
// portaal scheelt dat per staaf 2 à 4 %; bij een excentrisch belaste kolom
// (console van 100 mm, P = 400 kN) 23 % in eerste en 36 % in tweede orde.
//
// Daarom lost `solveAllCases` elk belastinggeval nu TWEEMAAL op: met de
// opgegeven richting (de "primaire", onder het gewone geval-id) en met de
// tegengestelde richting (onder id + SCHEEFSTAND_ID_OFFSET). De combinaties
// worden door `metScheefstandRichtingen` (combinations.ts) ontvouwd in twee
// varianten met een eigen richting; `combineResults` kiest per variant de
// juiste set gevallen, en de omhullende en de toetsing nemen zo per staaf de
// ongunstigste. Zonder scheefstand verandert er niets.

/** Verschuiving van het geval-id waaronder de tegengestelde richting staat. */
export const SCHEEFSTAND_ID_OFFSET = 1_000_000;

const SCHEEFSTAND_KEY = "__femScheefstandRichtingen";

/** Wat `solveAllCases` aan een perCase-Map hangt als er een scheefstand is. */
export interface ScheefstandRichtingen {
  /** De richting van de resultaten onder het gewone geval-id. */
  primair: 1 | -1;
  /** De id-verschuiving van de tegengestelde richting. */
  offset: number;
}

/** De scheefstandrichtingen die in deze perCase-Map zitten; `undefined` = geen scheefstand. */
export function getScheefstandRichtingen(
  perCase: Map<number, SolverResult>,
): ScheefstandRichtingen | undefined {
  return (perCase as any)[SCHEEFSTAND_KEY];
}

/**
 * Alleen de resultaten onder de gewone geval-id's — voor wie de Map per
 * belastinggeval toont of wegschrijft. De tegengestelde richting hoort daar
 * niet als "extra geval" tussen te staan.
 */
export function gevalResultaten(perCase: Map<number, SolverResult>): Map<number, SolverResult> {
  const sr = getScheefstandRichtingen(perCase);
  if (!sr) return perCase;
  return new Map([...perCase].filter(([id]) => id < sr.offset));
}

/** Lost elk belastinggeval van `input` op en zet het onder `id + idOffset`. */
function losGevallenOp(input: MultiInput, perCase: Map<number, SolverResult>, idOffset: number): void {
  for (const c of input.cases) {
    const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(input, (caseId) => (caseId === c.id ? 1 : 0));
    // Een leeg belastinggeval (bijv. Q/S/W zonder ingevoerde lasten — de
    // standaardset heeft er vier) is geen fout: overslaan. De solver gooit er
    // anders "No loads applied" op en dat liet de hele combinatie-/toetsings-
    // pijplijn falen; combineResults behandelt een ontbrekend geval als
    // nulbijdrage, wat mechanisch exact klopt.
    if (!meshHeeftLasten(mesh)) continue;
    const heeftPlaten = plateInfo.length > 0;
    let engineResult;
    try {
      engineResult = solveNonlinear(mesh, {
        analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
        geometricNonlinear: false,
        onLog: logMet(c.name),
        randKoppelingen,
      });
    } catch (e) {
      throw metKnoopnummer(e, nodeIdMap, plateInfo);
    }
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : undefined;
    perCase.set(c.id + idOffset, eisEindigeUitkomst(
      convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments, segmentUitvoer),
      ` in belastinggeval "${c.name}"`,
    ));
  }
}

export function solveAllCases(input: MultiInput): MultiLcResult {
  const perCase = new Map<number, SolverResult>();
  losGevallenOp(input, perCase, 0);
  if (input.scheefstand) {
    // De tegengestelde richting, onder verschoven id's — zie het blok
    // "Scheefstand in beide richtingen" hierboven.
    const tegen: MultiInput = {
      ...input,
      scheefstand: { ...input.scheefstand, richting: (-input.scheefstand.richting) as 1 | -1 },
    };
    losGevallenOp(tegen, perCase, SCHEEFSTAND_ID_OFFSET);
    const sr: ScheefstandRichtingen = { primair: input.scheefstand.richting, offset: SCHEEFSTAND_ID_OFFSET };
    (perCase as any)[SCHEEFSTAND_KEY] = sr;
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
  /**
   * De scheefstandrichting van deze combinatievariant (zie
   * `metScheefstandRichtingen` in combinations.ts). Ontbreekt = de richting
   * van de invoer.
   */
  scheefstandRichting?: 1 | -1;
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
 * De cachesleutel van één combinatie: id plus de gebruikte factoren.
 *
 * MOET gelijk blijven aan de sleutel die `combineResults` in combinations.ts
 * bouwt — anders leest die de cache niet. `test-fysisch-nietlineair.mjs`
 * controleert dat met een rondgang: iets in de cache zetten en het via
 * `combineResults` terugkrijgen.
 */
function tweedeOrdeSleutel(combo: SecondOrderCombo): string {
  return `${combo.id}|` + [...combo.factors.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cid, f]) => `${cid}=${f}`)
    .join(",");
}

/**
 * Zet een van BUITEN uitgerekend combinatieresultaat op de plek waar
 * `combineResults` en `computeEnvelope` het vinden.
 *
 * Waarom dit bestaat: de fysisch niet-lineaire lus (lib/betonStijfheid.ts)
 * lost een combinatie zelf op — met per ronde nieuwe segmentstijfheden uit de
 * rekenkern — en dat is asynchroon. `combineResults` is synchroon en blijft
 * dat; het resultaat komt hier binnen en wordt daarna gewoon gelezen. Zonder
 * deze route zou de lus de combinatie- en envelopeberekening moeten
 * overschrijven, met twee wegen naar hetzelfde getal als gevolg.
 *
 * `false` = er hing geen 2e-orde-status aan deze Map (het model is met het
 * eerste-ordepad doorgerekend); de aanroeper hoort dat te merken.
 */
export function zetCombinatieResultaat(
  perCase: Map<number, SolverResult>,
  combo: SecondOrderCombo,
  resultaat: SolverResult,
): boolean {
  const so = getSecondOrderState(perCase);
  if (!so) return false;
  so.cache.set(tweedeOrdeSleutel(combo), resultaat);
  return true;
}

/**
 * De model-invoer waarmee de 2e-orde-status is opgezet — de fysisch
 * niet-lineaire lus heeft hem nodig om er de segmentindeling in te zetten.
 */
export function getSecondOrderInput(perCase: Map<number, SolverResult>): MultiInput | undefined {
  return getSecondOrderState(perCase)?.input;
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
  // De scheefstandrichting van DEZE combinatievariant: de tweede-orde-som is
  // per combinatie, dus hier is de plek waar de tegengestelde richting het
  // model in gaat (basisaudit nr 28).
  const invoer: MultiInput =
    input.scheefstand && combo.scheefstandRichting !== undefined &&
    combo.scheefstandRichting !== input.scheefstand.richting
      ? { ...input, scheefstand: { ...input.scheefstand, richting: combo.scheefstandRichting } }
      : input;
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(
    invoer,
    (caseId) => combo.factors.get(caseId ?? -1) ?? 0,
  );

  // Geen geactiveerde lasten in deze combinatie? → aanroeper superponeert (nul).
  if (!meshHeeftLasten(mesh)) return null;

  // Wandschijven in het model? Dan het gemengde pad, dat sinds de
  // membraan-Kg óók geometrisch niet-lineair kan. De staven houden hun
  // bestaande P-Δ; de schijven krijgen hun initiële-spanningsstijfheid erbij
  // (zie `assembleGeometricStiffnessMixed` in NonlinearSolver.ts).
  //
  // Let op wat dit NIET is: uitknikken van een schijf LOODRECHT op het vlak.
  // Dit model heeft per knoop u, v en θ en geen verplaatsing uit het vlak, dus
  // die vorm van instabiliteit bestaat hier niet en kan ook niet gevonden
  // worden. Wat er wél in zit is het in-vlak effect.
  const heeftPlaten = plateInfo.length > 0;

  try {
    const engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: true,
      randKoppelingen,
      // Geïtereerde P-Δ convergeert met ratio ≈ P/P_kr per iteratie; 100
      // iteraties dekt tot P ≈ 0.87·P_kr bij tol 1e-6. Daarboven → nette fout.
      maxIterations: 100,
      tolerance: 1e-6,
      // De combinatienaam erbij. Juist hier telt dat: divergeert er één
      // combinatie, dan is het log het enige wat vertelt wélke.
      onLog: logMet(combo.name),
    });
    // beamSegments/segmentUitvoer gaan hier MEE. Zonder die twee zou een
    // gesplitste staaf (staafpuntlast, of straks een segmentindeling) in het
    // 2e-orde-pad alleen zijn EERSTE deelstuk als staafresultaat melden — het
    // 1e-orde-pad rijgt de deelstukken al wél aaneen. Dit is dus geen extra
    // vrijheid maar het wegwerken van een verschil tussen de twee paden; op
    // modellen zónder splitsing is beide Maps leeg en verandert er niets.
    // Met schijven erbij horen `plateInfo` en de knoopindex van het gemengde
    // stelsel mee — anders komen de schijfspanningen niet in het resultaat en
    // toont het canvas na een 2e-orde-som een leeg schijfbeeld. Zonder schijven
    // blijven beide `undefined` en is dit bit-identiek aan voorheen.
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : undefined;
    return eisEindigeUitkomst(
      convertResult(
        mesh, engineResult, nodeIdMap, beamIdMap, invoer.supports,
        heeftPlaten ? plateInfo : undefined, nodeIndex, beamSegments, segmentUitvoer,
      ),
      ` in combinatie "${combo.name}"`,
    );
  } catch (e) {
    // Een singulier stelsel in de eerste iteratie is een mechanisme en geen
    // knik (zie NonlinearSolver): met het knoopnummer doorgeven.
    const vertaald = metKnoopnummer(e, nodeIdMap, plateInfo);
    if (vertaald !== e) throw vertaald;
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
