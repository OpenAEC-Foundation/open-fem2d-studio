/**
 * FemCanvas — interactive FEM canvas (v2).
 *
 * Controlled component: all model state lives in App.tsx via useFemStore.
 * The canvas reads model from props, dispatches mutations through the
 * store's action callbacks, and owns only LOCAL UI state (hover position,
 * pending beam start, drag-pan in progress).
 *
 * Supports drawing portal frames using the ribbon tools:
 *   - select      : pick / highlight (no add)
 *   - addNode     : click empty area → snap to grid → add node
 *   - addBeam     : click two nodes → add beam between them
 *   - addSubNode  : click a beam → split at projected click pos
 *   - addPlate    : n hoeken klikken, sluiten door klik op de eerste knoop
 *                   (P4.2) → wandschijf; asgelijnde rechthoek rekent via het
 *                   quad-grid, elke andere polygoon via een CDT-meshcache
 *   - addPinned/Fixed/X-Roller/Z-Roller : click a node → toggle support
 *   - addZSpring/XSpring/RotSpring     : click node → popover asks for k
 *   - addPointLoad/Moment              : click node → popover for components
 *   - addLineLoad/Thermal              : click beam → popover for q / ΔT
 *
 * Pan + Zoom: mouse-wheel zooms around cursor; middle-mouse-drag OR
 * space+drag pans; F-key fits all to view; HUD Reset button reverts to
 * the default 1/25 scale + (0,0) offset.
 *
 * Solver wiring: parent passes a `solveTrigger` — when it changes, canvas
 * runs the solver against the current store and stores+renders the result
 * via FemResultsOverlay until the next model edit.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import "./FemCanvas.css";
import { solve } from "./solver/solver";
import type { SolverResult, SolverInput } from "./solver/types";
import type { LoadCombination, Envelope } from "./solver/combinations";
import FemResultsOverlay, { DEFAULT_DISPLAY_FLAGS, fmtNl, type DisplayFlags } from "./FemResultsOverlay";
import BarPropertiesDialog from "./BarPropertiesDialog";
import { useCheckStore } from "../../stores/checkStore";
import { resolveSection } from "../../lib/sectionResolver";
import { thermalAlphaForMaterial } from "../../lib/thermalAlpha";
// Veerstijfheid-omrekening: één bron voor het canvas-pad én het multi-LC-pad.
// Stond hier eerder als eigen kopie onderaan dit bestand ("Same logic as
// App.tsx"), naast een identieke kopie in App.tsx — twee kopieën van dezelfde
// eenheidsconversie is precies het soort duplicaat dat stil uit elkaar kan
// lopen en dan twee antwoorden op hetzelfde model geeft.
import { liftSpringK } from "../../lib/modelNaarSolverInput";
import type {
  Tool, Node, Beam, Plate, PlaatMeshCache, PlaatPunt, Support, Load, Selection,
  ViewTransform, GridSettings, SupportType, StructuralGrid,
} from "./femTypes";
import {
  withPlateDefaults, PLATE_DEFAULTS,
  isAsgelijndeRechthoek, valideerPlaatPolygoon, berekenPlaatMeshSignatuur,
  commitPlaatMeshCache,
} from "./femTypes";
// Alleen importeren (mesh-generatie voor de CDT-cache, P4.2) — de core zelf
// blijft ongewijzigd.
import { Mesh } from "../../core/fem/Mesh";
import { generatePolygonPlateMeshV2 } from "../../core/fem/PlateRegion";
import InlinePopover from "../openaec/InlinePopover";
import { notifyWarning } from "../../io/notify";
// Pure stramien-helper (zelfde tolerantie als de store-mutator) — alleen om
// in de maat-popover te tonen hoeveel knopen mee gaan schuiven.
import { knopenOpStramienAs } from "../../hooks/useFemStore";

// Re-export Tool so older imports (Ribbon, HomeTab) keep working.
export type { Tool } from "./femTypes";

/** Benoemde plaatrand in modelassen — zelfde namen als het rekenmesh. */
type PlaatRand = "bottom" | "top" | "left" | "right";

const RAND_LABEL: Record<PlaatRand, string> = {
  bottom: "onderrand", top: "bovenrand", left: "linkerrand", right: "rechterrand",
};

/**
 * Contourcomponenten voor de plaatspanningsweergave (P3.2): label + eenheid
 * per kiesbare component. Gedeeld met de Resultaten-tab (FemProjectTree)
 * zodat select en legenda dezelfde teksten tonen.
 */
export const PLAAT_COMPONENTEN = {
  vonMises: { label: "von Mises", eenheid: "N/mm²" },
  sigmaX:   { label: "σx",        eenheid: "N/mm²" },
  sigmaY:   { label: "σy",        eenheid: "N/mm²" },
  tauXY:    { label: "τxy",       eenheid: "N/mm²" },
  nx:       { label: "nx",        eenheid: "kN/m" },
  ny:       { label: "ny",        eenheid: "kN/m" },
  nxy:      { label: "nxy",       eenheid: "kN/m" },
} as const;
export type PlaatComponent = keyof typeof PLAAT_COMPONENTEN;

/**
 * Kleurschaal voor de contouren: blauw → cyaan → groen → amber → rood over
 * t ∈ [0, 1] (lineaire interpolatie tussen de stops). De legenda gebruikt
 * dezelfde stops als CSS-gradient, dus balk en vlakken matchen exact.
 */
const CONTOUR_STOPS: [number, number, number][] = [
  [37, 99, 235],   // blauw  (min)
  [6, 182, 212],   // cyaan
  [16, 185, 129],  // groen
  [245, 158, 11],  // amber
  [220, 38, 38],   // rood   (max)
];
function contourKleur(t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const seg = Math.min(CONTOUR_STOPS.length - 2, Math.floor(tt * (CONTOUR_STOPS.length - 1)));
  const f = tt * (CONTOUR_STOPS.length - 1) - seg;
  const a = CONTOUR_STOPS[seg], b = CONTOUR_STOPS[seg + 1];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
const CONTOUR_GRADIENT_CSS = `linear-gradient(to top, ${
  CONTOUR_STOPS.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`).join(", ")})`;

/** Legenda-getal: precisie afhankelijk van de orde van grootte. */
function fmtLegenda(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100)  return v.toFixed(1);
  if (a >= 1)    return v.toFixed(2);
  return v.toFixed(3);
}

/**
 * Peilmaat van een niveau in bouwkundige notatie: "+5,00 m" boven peil,
 * "−1,20 m" eronder en "±0,00 m" op het nulniveau. Horizontale assen zijn
 * NIVEAUS met een peilmaat, geen genummerd stramien — alleen de verticale
 * assen dragen een stramienletter.
 */
function peilmaatTekst(positieMm: number): string {
  const m = positieMm / 1000;
  const teken = Math.abs(m) < 0.005 ? "±" : m > 0 ? "+" : "−";
  return `${teken}${Math.abs(m).toFixed(2).replace(".", ",")} m`;
}

/**
 * Validatie van de vier hoekknopen van de plaattool (P3.1): de punten moeten
 * een asgelijnde rechthoek vormen — zelfde regels en tolerantie (1 mm) als de
 * adapter-validatie in solver/engine.ts, maar hier VÓÓR het aanmaken zodat er
 * nooit een kapotte (collineaire, samenvallende of gedraaide) plaat in het
 * model komt. Retourneert een NL-foutmelding, of null wanneer de vorm geldig is.
 */
export function valideerPlaatHoeken(
  punten: { x: number; z: number }[],
): string | null {
  const TOL = 1; // mm
  if (punten.length !== 4) return "Een plaat heeft precies vier hoeken nodig.";
  const xs = punten.map(p => p.x), zs = punten.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  if (maxX - minX < TOL || maxZ - minZ < TOL) {
    return "De hoeken vallen samen of liggen (vrijwel) op één lijn — teken een echte rechthoek.";
  }
  // Elk van de vier bbox-hoeken moet door precies één hoekknoop bezet zijn.
  const doelen: [number, number][] = [
    [minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ],
  ];
  const bezet = [false, false, false, false];
  for (const p of punten) {
    const hit = doelen.findIndex(([tx, tz], i) =>
      !bezet[i] && Math.abs(p.x - tx) <= TOL && Math.abs(p.z - tz) <= TOL);
    if (hit < 0) {
      return "De vier hoeken vormen geen asgelijnde rechthoek — gedraaide of scheve platen worden nog niet ondersteund.";
    }
    bezet[hit] = true;
  }
  return null;
}

/** Asgelijnde bounding box van de vier hoekknopen van een plaat (mm). */
function plaatBBox(
  pl: Plate, nodes: Node[],
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const pts = pl.nodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is Node => !!n);
  if (pts.length !== 4) return null;
  return {
    minX: Math.min(...pts.map(p => p.x)),
    maxX: Math.max(...pts.map(p => p.x)),
    minZ: Math.min(...pts.map(p => p.z)),
    maxZ: Math.max(...pts.map(p => p.z)),
  };
}

/** Eindpunten (modelcoörd., mm) van één benoemde plaatrand. */
function plaatRandSegment(
  pl: Plate, nodes: Node[], rand: PlaatRand,
): { a: { x: number; z: number }; b: { x: number; z: number } } | null {
  const bb = plaatBBox(pl, nodes);
  if (!bb) return null;
  switch (rand) {
    case "bottom": return { a: { x: bb.minX, z: bb.minZ }, b: { x: bb.maxX, z: bb.minZ } };
    case "top":    return { a: { x: bb.minX, z: bb.maxZ }, b: { x: bb.maxX, z: bb.maxZ } };
    case "left":   return { a: { x: bb.minX, z: bb.minZ }, b: { x: bb.minX, z: bb.maxZ } };
    case "right":  return { a: { x: bb.maxX, z: bb.minZ }, b: { x: bb.maxX, z: bb.maxZ } };
  }
}

/** Hoekcoördinaten (mm, klikvolgorde) van een plaat — null bij een dode knoop. */
function plaatHoekPunten(pl: Plate, nodes: Node[]): PlaatPunt[] | null {
  const punten: PlaatPunt[] = [];
  for (const id of pl.nodeIds) {
    const n = nodes.find((nn) => nn.id === id);
    if (!n) return null;
    punten.push({ x: n.x, z: n.z });
  }
  return punten;
}

/**
 * Rekent deze plaat via het CDT-polygonpad (P4.2)? Zelfde classificatie als
 * de engine-adapter: 4 hoeken die een asgelijnde rechthoek vormen = grid-pad,
 * al het andere = polygonpad.
 */
function isPolygoonPlaat(punten: PlaatPunt[]): boolean {
  return !(punten.length === 4 && isAsgelijndeRechthoek(punten));
}

/** Eindpunten (mm) van polygonrand `edgeIndex` (hoek i → hoek i+1, cyclisch). */
function plaatPolygoonRandSegment(
  pl: Plate, nodes: Node[], edgeIndex: number,
): { a: { x: number; z: number }; b: { x: number; z: number } } | null {
  const n = pl.nodeIds.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return null;
  const na = nodes.find((nn) => nn.id === pl.nodeIds[edgeIndex]);
  const nb = nodes.find((nn) => nn.id === pl.nodeIds[(edgeIndex + 1) % n]);
  if (!na || !nb) return null;
  return { a: { x: na.x, z: na.z }, b: { x: nb.x, z: nb.z } };
}

/**
 * Genereer de CDT-meshcache van een polygonplaat (P4.2). Draait volledig op
 * een SCRATCH-mesh in mm (Triangle is eenheid-agnostisch) zodat er geen
 * mm↔m-afrondingsruis in de cache belandt; de engine zet de punten bij het
 * solven om naar meters. Async (WASM) — vandaar de cache: de solve zelf
 * blijft synchroon. Gooit bij WASM-/CDT-fouten; de aanroeper meldt dat en
 * laat het model ongewijzigd (P4.3).
 */
async function bouwPlaatMeshCache(punten: PlaatPunt[], meshSizeMm: number): Promise<PlaatMeshCache> {
  const scratch = new Mesh();
  const region = await generatePolygonPlateMeshV2(scratch, {
    outline: punten.map((p) => ({ x: p.x, y: p.z })),   // model-z = mesh-y
    meshSize: meshSizeMm,
    materialId: 1,
    thickness: 1, // dummy — de dikte gaat pas bij het solven op de elementen
  });
  const indexById = new Map<number, number>();
  const points = region.nodeIds.map((id, i) => {
    indexById.set(id, i);
    const n = scratch.getNode(id)!;
    return { x: n.x, z: n.y };
  });
  const triangles: [number, number, number][] = [];
  for (const eid of region.elementIds) {
    const el = scratch.getElement(eid);
    if (!el || el.nodeIds.length !== 3) continue;
    const [a, b, c] = el.nodeIds.map((id: number) => indexById.get(id));
    if (a === undefined || b === undefined || c === undefined) continue;
    triangles.push([a, b, c]);
  }
  const edgeNodeIndices: number[][] = punten.map(() => []);
  for (const edgeId of region.edgeIds ?? []) {
    const e = scratch.getEdge(edgeId);
    if (e && e.polygonEdgeIndex !== undefined && e.polygonEdgeIndex >= 0
        && e.polygonEdgeIndex < edgeNodeIndices.length) {
      edgeNodeIndices[e.polygonEdgeIndex] = e.nodeIds
        .map((id) => indexById.get(id))
        .filter((i): i is number => i !== undefined);
    }
  }
  if (points.length < 3 || triangles.length === 0) {
    throw new Error("de CDT leverde geen bruikbaar mesh op");
  }
  return {
    signature: berekenPlaatMeshSignatuur(punten, meshSizeMm),
    points, triangles, edgeNodeIndices,
  };
}

interface FemCanvasProps {
  tool: Tool;
  onToolChange?: (t: Tool) => void;

  // Model (from useFemStore)
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  selection: Selection;
  activeLoadCaseId: number;

  // Mutations
  setSelection: (s: Selection) => void;
  addNode: (x: number, z: number) => number;
  updateNode: (id: number, x: number, z: number) => void;
  addBeam: (fromId: number, toId: number) => number | null;
  updateBeam?: (id: number, updates: Partial<Beam>) => void;
  /**
   * Plaat toevoegen; een polygonplaat (P4.2) krijgt zijn zojuist gegenereerde
   * CDT-meshcache direct mee zodat plaat + mesh één history-snapshot vormen.
   */
  addPlate: (nodeIds: number[], meshCache?: PlaatMeshCache) => number;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  addLoad: (l: Omit<Load, "id">) => void;
  /** Deellast-grepen: commit van start-/endFrac op muis-loslaten (undo-baar). */
  updateLoad?: (id: number, updates: Partial<Load>) => void;
  deleteSelected: () => void;
  splitBeamAt: (beamId: number, x: number, z: number) => void;
  // Transformaties (multi-bewust). `false` = selectie bevat niets
  // transformeerbaars → canvas toont feedback i.p.v. een stille no-op.
  translateSelection: (sel: Selection, dx: number, dz: number) => boolean;
  copySelection: (sel: Selection, dx: number, dz: number) => boolean;
  rotateSelection: (sel: Selection, cx: number, cz: number, angleRad: number) => boolean;
  mirrorSelection: (sel: Selection, x1: number, z1: number, x2: number, z2: number) => boolean;

  // View settings
  grid: GridSettings;
  /** Structural grid (stramien) — rendered + used for snap when enabled. */
  structuralGrid?: StructuralGrid;
  /** Mutate the stramien (for + button to add new axes on canvas). */
  setStructuralGrid?: (g: StructuralGrid | ((prev: StructuralGrid) => StructuralGrid)) => void;
  /**
   * Verplaats één stramienas naar een nieuwe positie (mm) én neem de knopen
   * die op die as liggen mee — samen één undo-stap. Wordt gebruikt door de
   * maat-popover onder/naast het model. Retourneert het aantal meegeschoven
   * knopen (null = niets gedaan).
   */
  verplaatsStramienAs?: (as: "x" | "z", axisId: string, nieuwePositie: number) => number | null;
  /** Bulk node translate — used by drag-to-move and G-grab. */
  translateNodes?: (nodeIds: number[], dx: number, dz: number) => void;

  /** Incremented on every "Solve" click — canvas re-runs solver on change. */
  solveTrigger?: number;
  /** Notify parent of solver result. */
  onSolveResult?: (result: SolverResult | null) => void;
  /**
   * Scheefstand (initiële imperfectie) — wanneer gezet krijgt elke verticale
   * last in de solve een horizontale metgezel H = φ·V (zie ScheefstandInput).
   * App.tsx levert dezelfde waarde aan het multi-LC-pad.
   */
  scheefstand?: { phi: number; richting: 1 | -1 };

  // Multi-LC / combinations / envelope (step 2d/2e)
  combinations?: LoadCombination[];
  activeCombinationId?: number | null;
  envelopeView?: boolean;
  combinationResults?: Map<number, SolverResult> | null;
  envelope?: Envelope | null;

  /** Display toggles (lifted from App.tsx so sidebar can also mutate). */
  displayFlags?: DisplayFlags;
  setDisplayFlags?: React.Dispatch<React.SetStateAction<DisplayFlags>>;
  /** Model view: when false, no LC loads are drawn on the canvas. */
  showLoads?: boolean;
  /** Results-view: hide load arrows so only the result overlays are visible. */
  resultsMode?: boolean;
  /** Request the matching field in LoadProperties to auto-focus. */
  setPendingLoadFocus?: (v: { loadId: number; field: keyof Load } | null) => void;
  /** Meldt de actuele zoom (in %, 100 = default) aan de parent — StatusBar. */
  onZoomChange?: (pct: number) => void;
  /** UC-badge geklikt → open het toetsingspaneel gefocust op deze staaf. */
  onOpenCheckForBeam?: (beamId: number) => void;
}

// World ↔ screen constants
const DEFAULT_SCALE = 1 / 25;     // 1 mm → 1/25 px
const SCALE_MIN = 1 / 200;        // 50 px/m
const SCALE_MAX = 1 / 2;          // 12 500 px/m
const ORIGIN_X = 80;
const ORIGIN_Y_FROM_BOTTOM = 60;

// Maatvoering-opmaak (px, schermruimte — niet meeschalend met de zoom)
/** Straal van het open cirkeltje op het snijpunt maatlijn × stramienlijn. */
const DIM_KNOOP_R = 3.5;
/** Verspringing van het maat-label t.o.v. de maatlijn (boven / ernaast). */
const DIM_LABEL_DY = 13;

export default function FemCanvas(props: FemCanvasProps) {
  const {
    tool, onToolChange, nodes, beams, supports, plates, loads, selection, activeLoadCaseId,
    setSelection, addNode, addBeam, updateBeam, addPlate, addSupport, addLoad,
    updateLoad,
    deleteSelected, splitBeamAt,
    translateSelection, copySelection, rotateSelection, mirrorSelection,
    translateNodes,
    grid, structuralGrid, setStructuralGrid, verplaatsStramienAs,
    solveTrigger, onSolveResult, scheefstand,
    combinations, activeCombinationId, envelopeView,
    combinationResults, envelope,
    displayFlags: displayFlagsProp,
    setDisplayFlags: setDisplayFlagsProp,
    showLoads = true,
    resultsMode = false,
    setPendingLoadFocus,
    onZoomChange,
    onOpenCheckForBeam,
  } = props;
  // Toetsresultaten (normtoetsing) — voor de Unity-check-badges op het canvas.
  const checkResults = useCheckStore((s) => s.results);
  // updateNode is consumed by FemProperties — accept the prop but suppress unused-var lint
  void props.updateNode;

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const [hoverModel, setHoverModel] = useState<{ x: number; z: number } | null>(null);
  const [snapNode, setSnapNode] = useState<number | null>(null);
  const [snapBeam, setSnapBeam] = useState<number | null>(null);
  const [beamStart, setBeamStart] = useState<number | null>(null);
  const [plateCorners, setPlateCorners] = useState<number[]>([]);
  // First-click anchor for transform tools (move/copy/rotate/mirror)
  const [transformAnchor, setTransformAnchor] = useState<{ x: number; z: number } | null>(null);
  const [results, setResults] = useState<SolverResult | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  // Result display toggles — controlled by App.tsx via FemProjectTree sidebar.
  // We keep a local fallback so the component still works standalone, but the
  // setter is only used by the (now-removed) bottom canvas HUD; expose-only
  // for future inline use. setDisplayFlagsProp itself is acknowledged via a
  // void to suppress unused-var warnings.
  const [localDisplayFlags] = useState<DisplayFlags>(DEFAULT_DISPLAY_FLAGS);
  const displayFlags = displayFlagsProp ?? localDisplayFlags;
  void setDisplayFlagsProp;
  // Beam currently open in the BarPropertiesDialog (dblclick).
  const [editingBeamId, setEditingBeamId] = useState<number | null>(null);
  // Dimension-edit popover state: click a maatlijn to enter a new distance.
  const [dimEdit, setDimEdit] = useState<{
    axis: "x" | "z";           // x = horizontal dim (between x-axes), z = vertical
    movingAxisId: string;      // the axis whose position gets updated
    fixedPos: number;          // mm, position of the unchanged axis
    currentMm: number;         // current distance in mm
    sx: number; sy: number;    // popover anchor position (screen)
    meeschuivendeKnopen: number; // aantal knopen ÓP de bewegende as
  } | null>(null);

  // Pan/zoom view transform
  const [view, setView] = useState<ViewTransform>({
    scale: DEFAULT_SCALE, offsetX: 0, offsetY: 0,
  });
  // Zoom-percentage omhoog melden (StatusBar toont de echte canvas-zoom).
  useEffect(() => {
    onZoomChange?.(Math.round((view.scale / DEFAULT_SCALE) * 100));
  }, [view.scale, onZoomChange]);
  // Auto-fit het model ÉÉN keer bij het openen van de canvas, zodra we
  // zowel canvas-size als nodes hebben. Daarna respecteer user pan/zoom.
  const initialFitDoneRef = useRef(false);

  // Multi-key command sequence buffer (CAD-stijl): bv. "M" gevolgd door "V"
  // activeert het Verplaats-gereedschap. { key, t } = laatst ingedrukte
  // prefix + tijdstip (ms) zodat oude prefixes na een timeout vervallen.
  const keySeqRef = useRef<{ key: string; t: number } | null>(null);

  // Pan-drag state
  const panRef = useRef<{ active: boolean; startSX: number; startSY: number; startOX: number; startOY: number }>({
    active: false, startSX: 0, startSY: 0, startOX: 0, startOY: 0,
  });
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Popover state for support/load tools (anchored at a screen position)
  const [popover, setPopover] = useState<{
    kind: "zSpring" | "xSpring" | "rotSpring" | "pointLoad" | "pointLoadH" | "moment" | "lineLoad" | "thermal" | "edgeLoad";
    nodeId?: number; beamId?: number;
    /**
     * Puntlast op een VRIJE POSITIE op een staaf: fractie 0..1 vanaf de
     * startknoop. Alleen gezet wanneer de puntlast-tool op een staaf (en niet
     * op een knoop) klikte; met `nodeId` gezet is dit veld leeg.
     */
    posFrac?: number;
    /** edgeLoad (P3.3): doelplaat + benoemde rand (rechthoek). */
    plateId?: number; edge?: PlaatRand;
    /** edgeLoad op een polygonplaat (P4.3): rand-index i.p.v. benoemde rand. */
    edgeIndex?: number;
    sx: number; sy: number;
  } | null>(null);

  // Right-click context menu (Bewerk / Verwijder / Dupliceer)
  const [contextMenu, setContextMenu] = useState<{ sx: number; sy: number } | null>(null);

  // ── Drag-to-move state (mouse-driven, Select tool only) ────────────────
  // While dragging a node or beam we keep the original positions of all the
  // affected nodes so we can snap-deltas relative to the *first* world
  // position and rebuild a ghost preview without committing to the store.
  const [dragState, setDragState] = useState<{
    nodeIds: number[];                                    // nodes being translated
    originModel: { x: number; z: number };                // world-coord at drag start
    originPositions: Map<number, { x: number; z: number }>; // pre-drag positions
    currentDelta: { dx: number; dz: number };             // snapped delta in mm
  } | null>(null);

  // ── Deellast-greep-sleep (shape-handles op de lastband) ────────────────
  // Bij een geselecteerde lijnlast staan vierkante grepen op de uiteinden
  // van de lastband (posities startFrac/endFrac op de staafas). Slepen
  // toont een live preview (previewStart/previewEnd); de commit gebeurt
  // pas op muis-loslaten via updateLoad zodat undo één stap is.
  const [loadHandleDrag, setLoadHandleDrag] = useState<{
    loadId: number;
    beamId: number;
    end: "start" | "end";
    previewStart: number;   // fractie 0..1
    previewEnd: number;     // fractie 0..1
    moved: boolean;         // pas committen als er echt gesleept is
  } | null>(null);

  // ── Box-select rubber-band state ──────────────────────────────────────
  const [boxSelect, setBoxSelect] = useState<{
    startSX: number; startSY: number;
    endSX: number; endSY: number;
    additive: boolean;
  } | null>(null);

  // ── G-grab (Blender-style move mode) ───────────────────────────────────
  const [grabMode, setGrabMode] = useState<{
    nodeIds: number[];
    originPositions: Map<number, { x: number; z: number }>;
    /** centroid of the originals — used for distance display + ghost anchor */
    centroidModel: { x: number; z: number };
    /** mouse pos when grab started (so cursor delta = current − this) */
    cursorStartModel: { x: number; z: number };
    /** axis lock: null = both axes, 'x' = horizontal only, 'z' = vertical only */
    axisLock: "x" | "z" | null;
    /** typed numeric distance buffer (mm) — overrides cursor delta when present */
    typedDistance: string | null;
    /** current cursor model position (kept fresh by mousemove + key handlers) */
    cursorModel: { x: number; z: number };
  } | null>(null);

  // ── R-rotate mode (Blender-style rotate) ──────────────────────────────
  const [rotateMode, setRotateMode] = useState<{
    nodeIds: number[];
    originPositions: Map<number, { x: number; z: number }>;
    centroidModel: { x: number; z: number };
    /** mouse angle at rotate start, used to compute Δθ */
    angleStart: number;
    /** current Δθ in radians */
    deltaRad: number;
    /** snap to 15° increments unless SHIFT held */
    snap: boolean;
  } | null>(null);

  // Callback via een ref, zodat een wisselende functie-identiteit vanuit de
  // parent NOOIT als "modelwijziging" telt. Met onSolveResult in de dep-array
  // hieronder wiste elke App-render (bv. direct na Berekenen, door
  // setSolverOutputs) de zojuist berekende resultaten — de gemelde
  // "resultaten verdwijnen gelijk weer"-bug.
  const onSolveResultRef = useRef(onSolveResult);
  onSolveResultRef.current = onSolveResult;

  // Invalidate results whenever the model changes. `plates` doet mee sinds
  // de canvas-solve platen meerekent (P3): een dikte- of meshSize-wijziging
  // maakt ook het single-LC-resultaat (en de contourlaag) ongeldig.
  useEffect(() => {
    setResults(null);
    setSolveError(null);
    onSolveResultRef.current?.(null);
  }, [nodes, beams, supports, plates, loads, activeLoadCaseId]);

  // Run solver whenever parent bumps solveTrigger.
  // This single-case run still feeds the right-rail Properties panel which
  // expects a SolverResult; the multi-LC pipeline runs in parallel in App.tsx.
  useEffect(() => {
    if (solveTrigger === undefined || solveTrigger === 0) return;
    try {
      const activeLoads = loads.filter(l => l.caseId === activeLoadCaseId);
      const distLoads: {
        beamId: number; q: number;
        qStart?: number; qEnd?: number; qDir?: "x" | "z";
        qCoord?: "global" | "local";
        startFrac?: number; endFrac?: number;
      }[] = [];
      const pointLoads: { nodeId: number; fx?: number; fz?: number; my?: number }[] = [];
      // Puntlasten op een vrije positie op een staaf (posFrac 0..1) — de
      // engine splitst de staaf daar en zet de kracht op de tussenknoop.
      const beamPointLoads: { beamId: number; posFrac: number; fx?: number; fz?: number; my?: number }[] = [];
      const thermalLoads: { beamId: number; deltaT: number; alpha?: number }[] = [];
      const edgeLoads: {
        plateId: number; edge: PlaatRand; edgeIndex?: number; p: number; dir?: "x" | "z";
      }[] = [];
      for (const l of activeLoads) {
        if (l.type === "lineLoad" && l.beamId !== undefined && l.q !== undefined) {
          // q in kN/m → N/mm: 1 kN/m = 1 N/mm. Trapezium (qStart/qEnd),
          // richting (qDir + assenstelsel qCoord) en deellast-fracties
          // (startFrac/endFrac) gaan mee — zelfde velden als het
          // multi-LC-pad in App.tsx.
          distLoads.push({
            beamId: l.beamId, q: l.q,
            qStart: l.qStart, qEnd: l.qEnd, qDir: l.qDir, qCoord: l.qCoord,
            startFrac: l.startFrac, endFrac: l.endFrac,
          });
        } else if (l.type === "pointForce" && l.nodeId !== undefined) {
          // Fx, Fz in kN → N (×1000)
          pointLoads.push({
            nodeId: l.nodeId,
            fx: (l.fx ?? 0) * 1000,
            fz: (l.fz ?? 0) * 1000,
          });
        } else if (l.type === "pointForce" && l.beamId !== undefined) {
          // Staafgebonden puntlast (vrije positie): fractie 0..1 vanaf de
          // startknoop — zelfde velden als het multi-LC-pad in App.tsx.
          beamPointLoads.push({
            beamId: l.beamId,
            posFrac: Math.min(1, Math.max(0, l.posFrac ?? 0)),
            fx: (l.fx ?? 0) * 1000,
            fz: (l.fz ?? 0) * 1000,
          });
        } else if (l.type === "pointMoment" && l.nodeId !== undefined) {
          // My in kNm → N·mm (×1e6)
          pointLoads.push({
            nodeId: l.nodeId,
            my: (l.my ?? 0) * 1e6,
          });
        } else if (l.type === "thermal" && l.beamId !== undefined && l.deltaT !== undefined) {
          // α per materiaal meesturen (hout ≠ staal) — zelfde keuze als het
          // multi-LC-pad; één bron in lib/thermalAlpha.ts.
          const beam = beams.find(b => b.id === l.beamId);
          thermalLoads.push({
            beamId: l.beamId, deltaT: l.deltaT,
            alpha: thermalAlphaForMaterial(beam?.material),
          });
        } else if (l.type === "edgeLoad" && l.plateId !== undefined && l.q !== undefined) {
          // Randlast op een plaatrand (P3.3): p in kN/m (= N/mm), richting
          // in globale assen — zelfde velden als het multi-LC-pad in App.tsx.
          // Op een POLYGONplaat (P4.3) adresseert `edgeIndex` de rand; de
          // engine laat `edge` dan links liggen.
          edgeLoads.push({
            plateId: l.plateId,
            edge: l.edge ?? "top",
            edgeIndex: l.edgeIndex,
            p: l.q,
            dir: l.qDir,
          });
        }
      }
      const input: SolverInput = {
        nodes: nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
        beams: beams.map(b => {
          // Stijfheid uit materiaal + profiel; zonder dit rekende elke staaf
          // met de solver-default (HEA 160 / S235).
          const sec = resolveSection(b.material, b.profile);
          return {
            id: b.id, from: b.from, to: b.to,
            E: sec.E, A: sec.A, I: sec.I,
            startConnection: b.releases?.startRy ? 'hinge' : 'fixed',
            endConnection:   b.releases?.endRy   ? 'hinge' : 'fixed',
            // Volledige release-set (incl. Tx/Tz-hulzen, lokale assen).
            releases: b.releases,
          };
        }),
        supports: supports.map(s => ({
          nodeId: s.nodeId,
          type: s.type,
          k: liftSpringK(s),
        })),
        loads: distLoads,
        pointLoads,
        beamPointLoads,
        thermalLoads,
        edgeLoads,
        // Platen (wandschijven): zelfde defaults-aanvulling als het
        // multi-LC-pad in App.tsx — hiermee rekent óók de canvas-solve de
        // platen mee (mixed_beam_plate) en levert het resultaat
        // `plateElements` voor de contourlaag (P3.2). Polygonplaten (P4.2)
        // dragen hun CDT-meshcache direct mee.
        plates: plates.map(p => {
          const d = withPlateDefaults(p);
          return {
            id: d.id, nodeIds: d.nodeIds,
            thickness: d.thickness!, E: d.E!, nu: d.nu!, rho: d.rho!,
            meshSize: d.meshSize!,
            meshCache: d.meshCache,
          };
        }),
        // Actief belastinggeval meegeven (P4.3): de doorgeefluik-fallback
        // voor polygonrandlasten in de engine filtert hierop wanneer er
        // geen loadFactor is (één-geval-solve).
        caseId: activeLoadCaseId,
        // Scheefstand — zelfde instelling als het multi-LC-pad in App.tsx.
        scheefstand,
      };
      const r = solve(input);
      setResults(r);
      setSolveError(null);
      onSolveResult?.(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSolveError(msg);
      setResults(null);
      onSolveResult?.(null);
      console.error("[FEM solver]", e);
    }
  }, [solveTrigger]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── CDT-meshcache actueel houden (P4.2) ─────────────────────────────────
  // Een geometrie- (hoekknoop verplaatst/gesleept/geroteerd) of meshSize-
  // wijziging verandert de signatuur; dit effect regenereert de cache dan
  // async en commit hem via het femTypes-terugkanaal naar de store (geen
  // history-snapshot — de cache is afgeleide data). Dekt ook: een rechthoek
  // die door slepen/roteren polygoon wordt, undo/redo naar een staat zonder
  // cache, en projectbestanden met een verouderde cache. Mislukt de CDT, dan
  // blijft de oude (stale) cache staan en weigert de engine met een nette
  // NL-melding — nooit stil een verkeerd mesh.
  const meshRegenBezigRef = useRef(new Map<number, string>()); // plateId → signatuur onderweg
  useEffect(() => {
    for (const pl of plates) {
      const punten = plaatHoekPunten(pl, nodes);
      if (!punten || !isPolygoonPlaat(punten)) continue;      // rechthoek: grid-pad
      if (valideerPlaatPolygoon(punten) !== null) continue;   // (tijdelijk) ongeldig — niet meshen
      const meshSize = withPlateDefaults(pl).meshSize!;
      const sig = berekenPlaatMeshSignatuur(punten, meshSize);
      if (pl.meshCache?.signature === sig) continue;          // cache is actueel
      if (meshRegenBezigRef.current.get(pl.id) === sig) continue; // al onderweg
      meshRegenBezigRef.current.set(pl.id, sig);
      const plateId = pl.id;
      void (async () => {
        try {
          const cache = await bouwPlaatMeshCache(punten, meshSize);
          // Commit; is de plaat inmiddels wéér gewijzigd, dan matcht de
          // signatuur niet meer en draait dit effect gewoon opnieuw.
          commitPlaatMeshCache(plateId, cache);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          notifyWarning("Plaatmesh niet bijgewerkt",
            `Meshgeneratie (CDT) voor plaat ${plateId} mislukt: ${msg}. ` +
            `Rekenen met deze plaat geeft een foutmelding totdat het mesh opnieuw lukt.`);
        } finally {
          if (meshRegenBezigRef.current.get(plateId) === sig) {
            meshRegenBezigRef.current.delete(plateId);
          }
        }
      })();
    }
  }, [plates, nodes]);

  // Resize observer
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const r = e.contentRect;
        if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
      }
    });
    ro.observe(svgRef.current.parentElement!);
    return () => ro.disconnect();
  }, []);

  // ── Coordinate transforms (view-aware) ─────────────────────────────────
  const worldToScreen = useCallback((mx: number, mz: number) => ({
    x: ORIGIN_X + view.offsetX + mx * view.scale,
    y: size.h - ORIGIN_Y_FROM_BOTTOM + view.offsetY - mz * view.scale,
  }), [size.h, view]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({
    x: (sx - ORIGIN_X - view.offsetX) / view.scale,
    z: (size.h - ORIGIN_Y_FROM_BOTTOM + view.offsetY - sy) / view.scale,
  }), [size.h, view]);

  // Raster-snap aan/uit — schakelbaar via de Snap-knop in de HUD. Uit =
  // vrij tekenen/slepen op exacte muispositie (stramien-snap ook uit).
  const [snapAan, setSnapAan] = useState(true);
  const snap = useCallback((v: number) =>
    snapAan ? Math.round(v / grid.spacingMm) * grid.spacingMm : v,
  [grid.spacingMm, snapAan]);

  /**
   * Snap a (world-coord) point to the nearest STRAMIEN intersection if it's
   * within `radiusModel` mm; otherwise fall back to the 500 mm grid snap.
   * Returns the snapped point + a flag for the canvas to show the amber halo.
   */
  const snapToStramien = useCallback((mx: number, mz: number): { x: number; z: number; snapped: boolean } => {
    if (!snapAan) return { x: mx, z: mz, snapped: false };
    if (!structuralGrid?.enabled) return { x: snap(mx), z: snap(mz), snapped: false };
    // Convert 8 screen-px tolerance into mm in world space using the live scale.
    const tolModel = 8 / view.scale;
    let bestX: number | null = null;
    let bestZ: number | null = null;
    let bestDist = Infinity;
    for (const ax of structuralGrid.xAxes) {
      for (const az of structuralGrid.zAxes) {
        const d = Math.hypot(mx - ax.position, mz - az.position);
        if (d <= tolModel && d < bestDist) {
          bestDist = d; bestX = ax.position; bestZ = az.position;
        }
      }
    }
    if (bestX !== null && bestZ !== null) return { x: bestX, z: bestZ, snapped: true };
    return { x: snap(mx), z: snap(mz), snapped: false };
  }, [structuralGrid, view.scale, snap, snapAan]);

  /** Collect every node id implied by a Selection (handles single / multi). */
  const selectionNodeIds = useCallback((sel: Selection): number[] => {
    if (!sel) return [];
    if (sel.type === "node") return [sel.id];
    if (sel.type === "beam") {
      const b = beams.find(bb => bb.id === sel.id);
      return b ? [b.from, b.to] : [];
    }
    if (sel.type === "plate") {
      const p = plates.find(pp => pp.id === sel.id);
      return p ? [...p.nodeIds] : [];
    }
    if (sel.type === "multi") {
      // Beams contribute their endpoints; plates contribute their corners.
      const ids = new Set<number>(sel.nodeIds);
      for (const bid of sel.beamIds) {
        const b = beams.find(bb => bb.id === bid);
        if (b) { ids.add(b.from); ids.add(b.to); }
      }
      for (const pid of sel.plateIds) {
        const p = plates.find(pp => pp.id === pid);
        if (p) p.nodeIds.forEach(n => ids.add(n));
      }
      return Array.from(ids);
    }
    return [];
  }, [beams, plates]);

  // Find nearest existing node within 14px snap radius (SCREEN px, not world)
  const findSnapNode = useCallback((sx: number, sy: number): number | null => {
    const RADIUS_PX = 14;
    let best: { id: number; d: number } | null = null;
    for (const n of nodes) {
      const p = worldToScreen(n.x, n.z);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d <= RADIUS_PX && (best === null || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  }, [nodes, worldToScreen]);

  // Find nearest beam within 8 px of the click (perpendicular distance)
  const findSnapBeam = useCallback((sx: number, sy: number): { beamId: number; x: number; z: number } | null => {
    const RADIUS_PX = 8;
    let best: { beamId: number; d: number; px: number; py: number } | null = null;
    for (const b of beams) {
      const nA = nodes.find(n => n.id === b.from);
      const nB = nodes.find(n => n.id === b.to);
      if (!nA || !nB) continue;
      const a = worldToScreen(nA.x, nA.z);
      const c = worldToScreen(nB.x, nB.z);
      const vx = c.x - a.x, vy = c.y - a.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((sx - a.x) * vx + (sy - a.y) * vy) / lenSq));
      const px = a.x + t * vx, py = a.y + t * vy;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= RADIUS_PX && (best === null || d < best.d)) {
        best = { beamId: b.id, d, px, py };
      }
    }
    if (!best) return null;
    const w = screenToWorld(best.px, best.py);
    return { beamId: best.beamId, x: snap(w.x), z: snap(w.z) };
  }, [beams, nodes, worldToScreen, screenToWorld, snap]);

  /**
   * Positie op een staaf als FRACTIE 0..1 vanaf de startknoop, voor een punt
   * in modelcoördinaten (mm) — de loodrechte projectie op de staafas, geknipt
   * op [0, 1]. Gebruikt door het puntlast-gereedschap voor een last op een
   * vrije positie; de aangeboden coördinaten zijn al raster-gesnapt door
   * findSnapBeam, dus de positie volgt de snap-instelling.
   * Retourneert null voor een niet-bestaande of nul-lange staaf.
   */
  const beamPosFractie = useCallback((beamId: number, x: number, z: number): number | null => {
    const b = beams.find(bb => bb.id === beamId);
    if (!b) return null;
    const nA = nodes.find(n => n.id === b.from);
    const nB = nodes.find(n => n.id === b.to);
    if (!nA || !nB) return null;
    const vx = nB.x - nA.x, vz = nB.z - nA.z;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 1e-9) return null;
    const t = ((x - nA.x) * vx + (z - nA.z) * vz) / lenSq;
    return Math.min(1, Math.max(0, t));
  }, [beams, nodes]);

  // Dichtstbijzijnde plaatrand binnen 8 px (P3.3/P4.3) — gebruikt door het
  // Lijnlast-gereedschap wanneer er géén staaf onder de muis ligt, zodat
  // één tool zowel staaf-lijnlasten als plaatrandlasten plaatst.
  // Rechthoeken leveren een BENOEMDE rand, polygonplaten een RAND-INDEX
  // (rand van hoek i naar hoek i+1, in klikvolgorde).
  const findSnapPlateEdge = useCallback((sx: number, sy: number):
    { plateId: number; edge?: PlaatRand; edgeIndex?: number } | null => {
    const RADIUS_PX = 8;
    let best: { plateId: number; edge?: PlaatRand; edgeIndex?: number; d: number } | null = null;
    const probeer = (plateId: number, seg: { a: PlaatPunt; b: PlaatPunt } | null,
                     doel: { edge?: PlaatRand; edgeIndex?: number }) => {
      if (!seg) return;
      const pa = worldToScreen(seg.a.x, seg.a.z);
      const pb = worldToScreen(seg.b.x, seg.b.z);
      const vx = pb.x - pa.x, vy = pb.y - pa.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq < 1e-6) return;
      const t = Math.max(0, Math.min(1, ((sx - pa.x) * vx + (sy - pa.y) * vy) / lenSq));
      const px = pa.x + t * vx, py = pa.y + t * vy;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= RADIUS_PX && (best === null || d < best.d)) {
        best = { plateId, ...doel, d };
      }
    };
    for (const pl of plates) {
      const punten = plaatHoekPunten(pl, nodes);
      if (punten && isPolygoonPlaat(punten)) {
        for (let i = 0; i < pl.nodeIds.length; i++) {
          probeer(pl.id, plaatPolygoonRandSegment(pl, nodes, i), { edgeIndex: i });
        }
      } else {
        for (const rand of ["bottom", "top", "left", "right"] as PlaatRand[]) {
          probeer(pl.id, plaatRandSegment(pl, nodes, rand), { edge: rand });
        }
      }
    }
    if (!best) return null;
    const b = best as { plateId: number; edge?: PlaatRand; edgeIndex?: number };
    return { plateId: b.plateId, edge: b.edge, edgeIndex: b.edgeIndex };
  }, [plates, nodes, worldToScreen]);

  // ── Selection helpers (multi-aware) ─────────────────────────────────────
  const isNodeInSelection = useCallback((nodeId: number, sel: Selection): boolean => {
    if (!sel) return false;
    if (sel.type === "node") return sel.id === nodeId;
    if (sel.type === "multi") return sel.nodeIds.includes(nodeId);
    return false;
  }, []);
  const isBeamInSelection = useCallback((beamId: number, sel: Selection): boolean => {
    if (!sel) return false;
    if (sel.type === "beam") return sel.id === beamId;
    if (sel.type === "multi") return sel.beamIds.includes(beamId);
    return false;
  }, []);
  const addNodeToSelection = useCallback((nodeId: number, sel: Selection): Selection => {
    if (!sel) return { type: "node", id: nodeId };
    if (sel.type === "node") return { type: "multi", nodeIds: [sel.id, nodeId], beamIds: [], plateIds: [] };
    if (sel.type === "beam") return { type: "multi", nodeIds: [nodeId], beamIds: [sel.id], plateIds: [] };
    if (sel.type === "plate") return { type: "multi", nodeIds: [nodeId], beamIds: [], plateIds: [sel.id] };
    if (sel.type === "multi") return { ...sel, nodeIds: Array.from(new Set([...sel.nodeIds, nodeId])) };
    return sel;
  }, []);
  const addBeamToSelection = useCallback((beamId: number, sel: Selection): Selection => {
    if (!sel) return { type: "beam", id: beamId };
    if (sel.type === "node") return { type: "multi", nodeIds: [sel.id], beamIds: [beamId], plateIds: [] };
    if (sel.type === "beam") return { type: "multi", nodeIds: [], beamIds: [sel.id, beamId], plateIds: [] };
    if (sel.type === "plate") return { type: "multi", nodeIds: [], beamIds: [beamId], plateIds: [sel.id] };
    if (sel.type === "multi") return { ...sel, beamIds: Array.from(new Set([...sel.beamIds, beamId])) };
    return sel;
  }, []);

  /** Begin a drag-to-move operation. Captures original positions of every node
   *  reachable via the current selection (node ids, beam endpoints, plate corners). */
  const startDragFromSelection = useCallback((sel: Selection, originX: number, originZ: number) => {
    const nodeIds = selectionNodeIds(sel);
    if (nodeIds.length === 0) return;
    const orig = new Map<number, { x: number; z: number }>();
    for (const id of nodeIds) {
      const n = nodes.find(nn => nn.id === id);
      if (n) orig.set(id, { x: n.x, z: n.z });
    }
    setDragState({
      nodeIds,
      originModel: { x: snap(originX), z: snap(originZ) },
      originPositions: orig,
      currentDelta: { dx: 0, dz: 0 },
    });
  }, [selectionNodeIds, nodes, snap]);

  /** Apply current grab delta + commit to store. */
  const commitGrab = useCallback(() => {
    if (!grabMode) return;
    let dx = 0, dz = 0;
    if (grabMode.typedDistance !== null) {
      const v = parseFloat(grabMode.typedDistance);
      if (!isNaN(v)) {
        if (grabMode.axisLock === "z") dz = v;
        else dx = v;
      }
    } else {
      dx = grabMode.cursorModel.x - grabMode.cursorStartModel.x;
      dz = grabMode.cursorModel.z - grabMode.cursorStartModel.z;
      if (grabMode.axisLock === "x") dz = 0;
      if (grabMode.axisLock === "z") dx = 0;
    }
    if ((dx !== 0 || dz !== 0) && translateNodes) {
      translateNodes(grabMode.nodeIds, dx, dz);
    }
    setGrabMode(null);
  }, [grabMode, translateNodes]);

  /** Cancel current grab — no commit. */
  const cancelGrab = useCallback(() => setGrabMode(null), []);

  /** Apply current rotate delta + commit to store. */
  const commitRotate = useCallback(() => {
    if (!rotateMode) return;
    if (rotateMode.deltaRad !== 0 && selection) {
      // rotateSelection is multi-bewust en pusht één undo-snapshot.
      rotateSelection(selection,
        rotateMode.centroidModel.x, rotateMode.centroidModel.z,
        rotateMode.deltaRad);
    }
    setRotateMode(null);
  }, [rotateMode, selection, rotateSelection]);
  const cancelRotate = useCallback(() => setRotateMode(null), []);

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panRef.current.active) {
      const dx = sx - panRef.current.startSX;
      const dy = sy - panRef.current.startSY;
      setView(v => ({
        ...v,
        offsetX: panRef.current.startOX + dx,
        offsetY: panRef.current.startOY + dy,
      }));
      return;
    }

    const world = screenToWorld(sx, sy);

    // Deellast-greep-sleep: projecteer de muis op de staafas → fractie,
    // snap het geprojecteerde punt via de bestaande snap-helper (raster +
    // stramien; respecteert de snapAan-toggle) en klem tegen de andere
    // greep met minimaal 2% staaflengte verschil. Alleen live preview —
    // de commit volgt op muis-loslaten (handleMouseUp).
    if (loadHandleDrag) {
      const b = beams.find(bb => bb.id === loadHandleDrag.beamId);
      const nA = b ? nodes.find(n => n.id === b.from) : undefined;
      const nB = b ? nodes.find(n => n.id === b.to) : undefined;
      if (b && nA && nB) {
        const vx = nB.x - nA.x, vz = nB.z - nA.z;
        const lenSq = vx * vx + vz * vz;
        if (lenSq > 1e-9) {
          const tRaw = ((world.x - nA.x) * vx + (world.z - nA.z) * vz) / lenSq;
          // Snap het PUNT op de as en projecteer terug, zodat de greep op de
          // staaf blijft én het actieve rasterpunt gevolgd wordt.
          const pSnap = snapToStramien(nA.x + vx * tRaw, nA.z + vz * tRaw);
          let t = ((pSnap.x - nA.x) * vx + (pSnap.z - nA.z) * vz) / lenSq;
          const MIN_GAP = 0.02;
          if (loadHandleDrag.end === "start") {
            t = Math.max(0, Math.min(loadHandleDrag.previewEnd - MIN_GAP, t));
            setLoadHandleDrag({ ...loadHandleDrag, previewStart: t, moved: true });
          } else {
            t = Math.min(1, Math.max(loadHandleDrag.previewStart + MIN_GAP, t));
            setLoadHandleDrag({ ...loadHandleDrag, previewEnd: t, moved: true });
          }
        }
      }
      return;
    }

    // Snap to stramien intersection if close, else to grid spacing.
    const snapped = snapToStramien(world.x, world.z);
    setHoverModel({ x: snapped.x, z: snapped.z });
    // Hover halo (Select tool only)
    if (tool === "select" && !boxSelect && !dragState && !grabMode && !rotateMode) {
      setSnapNode(findSnapNode(sx, sy));
      const sb = findSnapBeam(sx, sy);
      setSnapBeam(sb?.beamId ?? null);
    } else {
      // Beam-targeting tools snap to BEAMS, not nodes. Showing a node-halo
      // while placing a line load is misleading ("puntje aan je cursor").
      const isBeamTool = tool === "addLineLoad" || tool === "addThermal";
      const hoverNode = isBeamTool ? null : findSnapNode(sx, sy);
      setSnapNode(hoverNode);
      // Het puntlast-gereedschap snapt zowel op een KNOOP (voorrang) als op
      // een vrije positie op een STAAF; de staaf-halo verschijnt daarom pas
      // wanneer er geen knoop onder de muis ligt.
      const isPuntlastTool = tool === "addPointLoad" || tool === "addPointLoadH";
      const beamSnapTools = tool === "addSubNode" || isBeamTool
        || (isPuntlastTool && hoverNode === null);
      setSnapBeam(beamSnapTools ? (findSnapBeam(sx, sy)?.beamId ?? null) : null);
    }

    // Drag-to-move: update ghost preview delta in mm (snapped).
    if (dragState) {
      const snappedDrag = snapToStramien(world.x, world.z);
      const dx = snappedDrag.x - dragState.originModel.x;
      const dz = snappedDrag.z - dragState.originModel.z;
      setDragState({ ...dragState, currentDelta: { dx, dz } });
      return;
    }

    // Box-select: update rectangle.
    if (boxSelect) {
      setBoxSelect({ ...boxSelect, endSX: sx, endSY: sy });
      return;
    }

    // G-grab: update cursor + recompute delta visualisation.
    if (grabMode) {
      const snappedG = snapToStramien(world.x, world.z);
      setGrabMode({ ...grabMode, cursorModel: { x: snappedG.x, z: snappedG.z } });
      return;
    }

    // R-rotate: update angle delta based on cursor vs centroid.
    if (rotateMode) {
      const ang = Math.atan2(world.z - rotateMode.centroidModel.z,
                             world.x - rotateMode.centroidModel.x);
      let raw = ang - rotateMode.angleStart;
      if (rotateMode.snap) {
        const step = 15 * Math.PI / 180;
        raw = Math.round(raw / step) * step;
      }
      setRotateMode({ ...rotateMode, deltaRad: raw });
      return;
    }
  };

  const handleMouseLeave = () => {
    setHoverModel(null);
    setSnapNode(null);
    setSnapBeam(null);
    panRef.current.active = false;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // Middle-mouse OR Space+left → pan
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      panRef.current = {
        active: true, startSX: sx, startSY: sy,
        startOX: view.offsetX, startOY: view.offsetY,
      };
      return;
    }
    // Cancel grab/rotate on mousedown — user is committing or starting fresh.
    if (grabMode) { commitGrab(); return; }
    if (rotateMode) { commitRotate(); return; }
    // Right-click context menu (Select tool, on a selection)
    if (e.button === 2) {
      e.preventDefault();
      if (selection) {
        setContextMenu({ sx, sy });
      }
      return;
    }
    // Drag-to-move OR box-select (Select tool only, left button, no Space)
    if (e.button === 0 && tool === "select" && !popover) {
      const overNodeId = findSnapNode(sx, sy);
      const overBeam = findSnapBeam(sx, sy);
      const world = screenToWorld(sx, sy);

      // CASE A — clicked on a node that's part of the current selection → drag-move.
      // CASE B — clicked on a node NOT in selection → select it first, then start drag.
      // CASE C — clicked on a beam → select+start drag.
      // CASE D — clicked on empty area → box-select rubber-band.
      if (overNodeId !== null) {
        e.preventDefault();
        // Promote single-click to selection (replace or add with SHIFT)
        let newSel: Selection = selection;
        const inSel = isNodeInSelection(overNodeId, selection);
        if (!inSel) {
          if (e.shiftKey && selection) {
            newSel = addNodeToSelection(overNodeId, selection);
          } else {
            newSel = { type: "node", id: overNodeId };
          }
          setSelection(newSel);
        }
        startDragFromSelection(newSel, world.x, world.z);
        return;
      }
      if (overBeam) {
        e.preventDefault();
        let newSel: Selection = selection;
        const inSel = isBeamInSelection(overBeam.beamId, selection);
        if (!inSel) {
          if (e.shiftKey && selection) {
            newSel = addBeamToSelection(overBeam.beamId, selection);
          } else {
            newSel = { type: "beam", id: overBeam.beamId };
          }
          setSelection(newSel);
        }
        startDragFromSelection(newSel, world.x, world.z);
        return;
      }
      // Empty area — start box-select.
      e.preventDefault();
      setBoxSelect({ startSX: sx, startSY: sy, endSX: sx, endSY: sy, additive: e.shiftKey });
      return;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      panRef.current.active = false;
      return;
    }
    // Commit deellast-greep-sleep op loslaten — één updateLoad-aanroep is
    // één undo-stap. Volledige lengte normaliseren naar `undefined` (zelfde
    // conventie als commitRange in FemProperties en oude bestanden).
    if (e.button === 0 && loadHandleDrag) {
      if (loadHandleDrag.moved && updateLoad) {
        const aF = loadHandleDrag.previewStart;
        const bF = loadHandleDrag.previewEnd;
        const isFull = aF <= 0 && bF >= 1;
        updateLoad(loadHandleDrag.loadId, {
          startFrac: isFull ? undefined : aF,
          endFrac:   isFull ? undefined : bF,
        });
      }
      setLoadHandleDrag(null);
      return;
    }
    // Commit drag-to-move on left-button release.
    if (e.button === 0 && dragState) {
      const { nodeIds, currentDelta } = dragState;
      if ((currentDelta.dx !== 0 || currentDelta.dz !== 0) && translateNodes) {
        translateNodes(nodeIds, currentDelta.dx, currentDelta.dz);
      }
      setDragState(null);
      return;
    }
    // Commit box-select.
    if (e.button === 0 && boxSelect) {
      const minSX = Math.min(boxSelect.startSX, boxSelect.endSX);
      const maxSX = Math.max(boxSelect.startSX, boxSelect.endSX);
      const minSY = Math.min(boxSelect.startSY, boxSelect.endSY);
      const maxSY = Math.max(boxSelect.startSY, boxSelect.endSY);
      // Treat tiny boxes as "click on empty" → clear selection.
      const isTinyBox = Math.abs(maxSX - minSX) < 3 && Math.abs(maxSY - minSY) < 3;
      if (isTinyBox) {
        if (!boxSelect.additive) setSelection(null);
        setBoxSelect(null);
        return;
      }
      // Collect nodes inside box (in screen coords).
      const pickedNodes: number[] = [];
      for (const n of nodes) {
        const p = worldToScreen(n.x, n.z);
        if (p.x >= minSX && p.x <= maxSX && p.y >= minSY && p.y <= maxSY) {
          pickedNodes.push(n.id);
        }
      }
      // Beams: both endpoints must be inside the box.
      const pickedNodeSet = new Set(pickedNodes);
      const pickedBeams: number[] = [];
      for (const b of beams) {
        if (pickedNodeSet.has(b.from) && pickedNodeSet.has(b.to)) {
          pickedBeams.push(b.id);
        }
      }
      // Plates: all corner nodes must be inside the box.
      const pickedPlates: number[] = [];
      for (const p of plates) {
        if (p.nodeIds.every(id => pickedNodeSet.has(id))) {
          pickedPlates.push(p.id);
        }
      }
      let nextSel: Selection;
      if (pickedNodes.length === 0 && pickedBeams.length === 0 && pickedPlates.length === 0) {
        nextSel = boxSelect.additive ? selection : null;
      } else {
        if (boxSelect.additive && selection) {
          const existingNodes = selection.type === "multi" ? selection.nodeIds
            : selection.type === "node" ? [selection.id] : [];
          const existingBeams = selection.type === "multi" ? selection.beamIds
            : selection.type === "beam" ? [selection.id] : [];
          const existingPlates = selection.type === "multi" ? selection.plateIds
            : selection.type === "plate" ? [selection.id] : [];
          nextSel = {
            type: "multi",
            nodeIds: Array.from(new Set([...existingNodes, ...pickedNodes])),
            beamIds: Array.from(new Set([...existingBeams, ...pickedBeams])),
            plateIds: Array.from(new Set([...existingPlates, ...pickedPlates])),
          };
        } else if (pickedNodes.length === 1 && pickedBeams.length === 0 && pickedPlates.length === 0) {
          nextSel = { type: "node", id: pickedNodes[0] };
        } else if (pickedNodes.length === 0 && pickedBeams.length === 1 && pickedPlates.length === 0) {
          nextSel = { type: "beam", id: pickedBeams[0] };
        } else {
          nextSel = { type: "multi", nodeIds: pickedNodes, beamIds: pickedBeams, plateIds: pickedPlates };
        }
      }
      setSelection(nextSel);
      setBoxSelect(null);
      return;
    }
  };

  // Wheel handler is wired natively (non-passive) in useEffect below so we can
  // call preventDefault to stop the page scrolling while zooming the model.

  // ── Tool dispatch (click) ───────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Ignore if a drag just ended
    if (panRef.current.active) return;
    // Hide context menu on any plain click
    if (contextMenu) setContextMenu(null);
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const overNodeId = findSnapNode(sx, sy);
    // Model-positie uit het klik-event zelf. Niet op hoverModel leunen: dat is
    // de laatste mousemove-positie, en een klik zonder voorafgaande beweging
    // (touchpad-tap, snelle klik, automation) komt dan stilzwijgend op de
    // oude of ontbrekende hoverpositie uit.
    const clickWorld = screenToWorld(sx, sy);
    const clickSnap = snapToStramien(clickWorld.x, clickWorld.z);
    const clickModel = { x: clickSnap.x, z: clickSnap.z };

    if (tool === "select") {
      // mousedown handler already sets selection / starts drag / starts box-select.
      // On bare click (no drag), browsers still fire click after mouseup — but
      // mousedown's selection update is authoritative. We only handle the
      // commit-grab-on-click case here (Blender G then click).
      if (grabMode) { commitGrab(); }
      if (rotateMode) { commitRotate(); }
      return;
    }

    if (tool === "addNode") {
      if (nodes.some(n => n.x === clickModel.x && n.z === clickModel.z)) return;
      addNode(clickModel.x, clickModel.z);
      return;
    }

    if (tool === "addBeam") {
      // Need 2 node clicks. If clicking empty area, snap-create a node first.
      let nodeId = overNodeId;
      if (nodeId === null) {
        const existing = nodes.find(n => n.x === clickModel.x && n.z === clickModel.z);
        if (existing) nodeId = existing.id;
        else nodeId = addNode(clickModel.x, clickModel.z);
      }
      if (nodeId === null) return;
      if (beamStart === null) {
        setBeamStart(nodeId);
      } else if (beamStart !== nodeId) {
        addBeam(beamStart, nodeId);
        setBeamStart(null);
      }
      return;
    }

    if (tool === "addSubNode") {
      const sb = findSnapBeam(sx, sy);
      if (sb) splitBeamAt(sb.beamId, sb.x, sb.z);
      return;
    }

    if (tool === "addPlate") {
      // Polygontekentool (P4.2): n hoeken klikken, sluiten door op de EERSTE
      // knoop te klikken (Esc annuleert; de HUD toont de hoekenteller).
      // Snap naar een bestaande knoop of maak er één op de klikpositie.
      let nodeId = overNodeId;
      if (nodeId === null) {
        const existing = nodes.find(n => n.x === clickModel.x && n.z === clickModel.z);
        if (existing) nodeId = existing.id;
        else nodeId = addNode(clickModel.x, clickModel.z);
      }
      if (nodeId === null) return;

      // Sluiten: klik op de eerste hoek (vanaf 3 hoeken).
      if (plateCorners.length >= 3 && nodeId === plateCorners[0]) {
        const hoekIds = [...plateCorners];
        const punten = hoekIds.map(id => {
          const n = nodes.find(nn => nn.id === id);
          return n ? { x: n.x, z: n.z } : null;
        });
        if (punten.some(p => p === null)) { setPlateCorners([]); return; }
        const geldigePunten = punten as PlaatPunt[];
        setPlateCorners([]);

        // Asgelijnde rechthoek → het deterministische quad-grid-pad; geen
        // CDT-cache nodig. Alleen de plaat zelf (P2.4): geen auto-randstaven.
        if (geldigePunten.length === 4 && isAsgelijndeRechthoek(geldigePunten)) {
          addPlate(hoekIds);
          return;
        }

        // Polygonvalidatie (P4.3): zelfsnijdend, dubbele hoeken, degeneraat —
        // geweigerd VÓÓR het aanmaken, zodat er nooit een kapotte plaat in
        // het model komt.
        const fout = valideerPlaatPolygoon(geldigePunten);
        if (fout) {
          notifyWarning("Plaat niet toegevoegd", fout);
          return;
        }

        // Polygonplaat: eerst de CDT-meshcache genereren (async, WASM), pas
        // bij succes de plaat aanmaken — mislukt de meshgeneratie, dan komt
        // er GEEN halve plaat in de store (P4.3). De cache hoort bij de
        // default-meshSize waarmee addPlate de plaat aanmaakt.
        void (async () => {
          try {
            const cache = await bouwPlaatMeshCache(geldigePunten, PLATE_DEFAULTS.meshSize);
            addPlate(hoekIds, cache);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifyWarning("Plaat niet toegevoegd",
              `Meshgeneratie (CDT) mislukt: ${msg}. De plaat is niet aangemaakt; het model is ongewijzigd.`);
          }
        })();
        return;
      }

      // Samenvallende hoekklik: dezelfde knoop nogmaals aanklikken (behalve
      // de eerste, die sluit) zou een gedegenereerde omtrek opleveren.
      if (plateCorners.includes(nodeId)) {
        notifyWarning("Ongeldige hoek",
          plateCorners.length >= 3 && nodeId !== plateCorners[0]
            ? "Deze knoop is al een hoek van deze plaat — klik de eerste knoop om te sluiten."
            : "Deze knoop is al een hoek van deze plaat — kies een andere knoop.");
        return;
      }
      setPlateCorners([...plateCorners, nodeId]);
      return;
    }

    if (tool === "addPinned" || tool === "addFixed"
     || tool === "addXRoller" || tool === "addZRoller") {
      if (overNodeId === null) return;
      const type =
        tool === "addPinned"  ? "pinned"  :
        tool === "addFixed"   ? "fixed"   :
        tool === "addXRoller" ? "xRoller" : "zRoller";
      addSupport(overNodeId, type);
      return;
    }

    if (tool === "addZSpring" || tool === "addXSpring" || tool === "addRotSpring") {
      if (overNodeId === null) return;
      const n = nodes.find(nn => nn.id === overNodeId);
      if (!n) return;
      const p = worldToScreen(n.x, n.z);
      const kind = tool === "addZSpring" ? "zSpring" : tool === "addXSpring" ? "xSpring" : "rotSpring";
      setPopover({ kind, nodeId: overNodeId, sx: p.x, sy: p.y });
      return;
    }

    if (tool === "addPointLoad" || tool === "addPointLoadH" || tool === "addMoment") {
      const kind =
        tool === "addMoment"        ? "moment" :
        tool === "addPointLoadH"    ? "pointLoadH" :
                                      "pointLoad";
      // 1) KNOOP heeft voorrang (bestaande snap-indicatie).
      if (overNodeId !== null) {
        const n = nodes.find(nn => nn.id === overNodeId);
        if (!n) return;
        const p = worldToScreen(n.x, n.z);
        setPopover({ kind, nodeId: overNodeId, sx: p.x, sy: p.y });
        return;
      }
      // 2) Geen knoop onder de muis: een puntlast mag ook op een VRIJE
      //    POSITIE op een staaf. (Het moment blijft knoopgebonden.)
      if (tool === "addMoment") return;
      const sb = findSnapBeam(sx, sy);
      if (!sb) return;
      const frac = beamPosFractie(sb.beamId, sb.x, sb.z);
      if (frac === null) return;
      const b = beams.find(bb => bb.id === sb.beamId);
      const nA = b ? nodes.find(n => n.id === b.from) : undefined;
      const nB = b ? nodes.find(n => n.id === b.to) : undefined;
      if (!nA || !nB) return;
      const p = worldToScreen(
        nA.x + (nB.x - nA.x) * frac,
        nA.z + (nB.z - nA.z) * frac,
      );
      setPopover({ kind, beamId: sb.beamId, posFrac: frac, sx: p.x, sy: p.y });
      return;
    }

    if (tool === "addLineLoad" || tool === "addThermal") {
      const sb = findSnapBeam(sx, sy);
      if (!sb) {
        // Randlast op een plaatrand (P3.3): geen staaf onder de muis, wél
        // een plaatrand → randlast-popover op de klikpositie.
        if (tool === "addLineLoad") {
          const pe = findSnapPlateEdge(sx, sy);
          if (pe) {
            setPopover({
              kind: "edgeLoad", plateId: pe.plateId,
              edge: pe.edge, edgeIndex: pe.edgeIndex,
              sx, sy,
            });
          }
        }
        return;
      }
      const nA = nodes.find(n => beams.find(b => b.id === sb.beamId)?.from === n.id);
      const nB = nodes.find(n => beams.find(b => b.id === sb.beamId)?.to === n.id);
      if (!nA || !nB) return;
      const midX = (nA.x + nB.x) / 2, midZ = (nA.z + nB.z) / 2;
      const p = worldToScreen(midX, midZ);
      setPopover({ kind: tool === "addLineLoad" ? "lineLoad" : "thermal", beamId: sb.beamId, sx: p.x, sy: p.y });
      return;
    }

    // Transform tools (move/copy/rotate/mirror) — 2-click interaction
    if (tool === "move" || tool === "copy" || tool === "rotate" || tool === "mirror") {
      if (!selection) {
        // Eerste gebruik zonder selectie: klik op knoop/staaf selecteert die;
        // klik in het niets geeft feedback i.p.v. een stille no-op.
        if (overNodeId !== null) { setSelection({ type: "node", id: overNodeId }); return; }
        const sb = findSnapBeam(sx, sy);
        if (sb) { setSelection({ type: "beam", id: sb.beamId }); return; }
        notifyWarning("Geen selectie",
          "Selecteer eerst één of meer knopen, staven of platen — klik erop of sleep een selectiekader.");
        return;
      }
      if (!hoverModel) return;
      if (transformAnchor === null) {
        // First click: set anchor point
        setTransformAnchor({ x: hoverModel.x, z: hoverModel.z });
      } else {
        // Second click: apply transform
        const a = transformAnchor;
        const b = hoverModel;
        let ok = true;
        if (tool === "move") {
          ok = translateSelection(selection, b.x - a.x, b.z - a.z);
        } else if (tool === "copy") {
          ok = copySelection(selection, b.x - a.x, b.z - a.z);
        } else if (tool === "rotate") {
          // Snap angle to 15°
          const angle0 = 0; // default reference axis +x
          const angle = Math.atan2(b.z - a.z, b.x - a.x) - angle0;
          const step = (15 * Math.PI / 180);
          const snapped = Math.round(angle / step) * step;
          ok = rotateSelection(selection, a.x, a.z, snapped);
        } else if (tool === "mirror") {
          ok = mirrorSelection(selection, a.x, a.z, b.x, b.z);
        }
        if (!ok) {
          notifyWarning("Transformatie niet uitgevoerd",
            tool === "mirror"
              ? "De selectie bevat geen knopen, staven of platen — of de spiegelas heeft geen lengte."
              : "De selectie bevat geen knopen, staven of platen.");
        }
        setTransformAnchor(null);
      }
      return;
    }
  };

  // ── Keyboard handlers ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

      // ── Active modal: grab/rotate ────────────────────────────────────
      // Numeric / X / Z / Enter / Esc handled here before generic Escape.
      if (grabMode) {
        if (e.key === "Escape") { e.preventDefault(); cancelGrab(); return; }
        if (e.key === "Enter")  { e.preventDefault(); commitGrab(); return; }
        // As-locks alleen zonder modifiers — Ctrl+Z (ongedaan maken) mag
        // tijdens een grab niet stiekem de Z-aslock omschakelen.
        if ((e.key === "x" || e.key === "X") && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setGrabMode({ ...grabMode, axisLock: grabMode.axisLock === "x" ? null : "x" });
          return;
        }
        if ((e.key === "z" || e.key === "Z") && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setGrabMode({ ...grabMode, axisLock: grabMode.axisLock === "z" ? null : "z" });
          return;
        }
        if (/^[0-9.\-]$/.test(e.key)) {
          e.preventDefault();
          setGrabMode({ ...grabMode, typedDistance: (grabMode.typedDistance ?? "") + e.key });
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          const cur = grabMode.typedDistance;
          const next = cur && cur.length > 1 ? cur.slice(0, -1) : null;
          setGrabMode({ ...grabMode, typedDistance: next });
          return;
        }
      }
      if (rotateMode) {
        if (e.key === "Escape") { e.preventDefault(); cancelRotate(); return; }
        if (e.key === "Enter")  { e.preventDefault(); commitRotate(); return; }
        if (e.key === "Shift") {
          e.preventDefault();
          setRotateMode({ ...rotateMode, snap: false });
          return;
        }
      }

      // ── Multi-key commando-sequences (CAD-stijl) ─────────────────────
      // "MV" (M gevolgd door V binnen 1,2 s) activeert het Verplaats-tool.
      if (!grabMode && !rotateMode && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        const pending = keySeqRef.current;
        const fresh = pending !== null && Date.now() - pending.t < 1200;
        if (fresh && pending!.key === "m") {
          keySeqRef.current = null;
          if (k === "v") { e.preventDefault(); onToolChange?.("move"); return; }
          // andere tweede toets: prefix vervalt, val door naar normale afhandeling
        }
        if (k === "m") {
          keySeqRef.current = { key: "m", t: Date.now() };
          e.preventDefault();
          return;
        }
      }

      // G / R / D — only if there's a selection and no modal is active.
      if (!grabMode && !rotateMode && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if ((e.key === "g" || e.key === "G") && selection) {
          e.preventDefault();
          const nodeIds = selectionNodeIds(selection);
          if (nodeIds.length === 0) return;
          const orig = new Map<number, { x: number; z: number }>();
          let sx = 0, sz = 0, n = 0;
          for (const id of nodeIds) {
            const nd = nodes.find(nn => nn.id === id);
            if (nd) { orig.set(id, { x: nd.x, z: nd.z }); sx += nd.x; sz += nd.z; n++; }
          }
          if (n === 0) return;
          const centroid = { x: sx / n, z: sz / n };
          const cur = hoverModel ?? centroid;
          setGrabMode({
            nodeIds,
            originPositions: orig,
            centroidModel: centroid,
            cursorStartModel: { x: cur.x, z: cur.z },
            cursorModel: { x: cur.x, z: cur.z },
            axisLock: null,
            typedDistance: null,
          });
          return;
        }
        if ((e.key === "r" || e.key === "R") && selection) {
          e.preventDefault();
          const nodeIds = selectionNodeIds(selection);
          if (nodeIds.length === 0) return;
          let sx = 0, sz = 0, n = 0;
          const orig = new Map<number, { x: number; z: number }>();
          for (const id of nodeIds) {
            const nd = nodes.find(nn => nn.id === id);
            if (nd) { orig.set(id, { x: nd.x, z: nd.z }); sx += nd.x; sz += nd.z; n++; }
          }
          if (n === 0) return;
          const centroid = { x: sx / n, z: sz / n };
          const cur = hoverModel ?? centroid;
          const a0 = Math.atan2(cur.z - centroid.z, cur.x - centroid.x);
          setRotateMode({
            nodeIds,
            originPositions: orig,
            centroidModel: centroid,
            angleStart: a0,
            deltaRad: 0,
            snap: !e.shiftKey,
          });
          return;
        }
        if ((e.key === "d" || e.key === "D") && selection) {
          // Blender-style: duplicate + enter grab.
          e.preventDefault();
          // copySelection is multi-bewust; false = niets kopieerbaars.
          if (!copySelection(selection, 0, 0)) {
            notifyWarning("Niets te dupliceren",
              "De selectie bevat geen knopen, staven of platen.");
          }
          // We don't auto-grab the new copy yet (would need access to the new
          // ids); user can re-grab manually. Mockup shortcut.
          return;
        }
      }

      if (e.key === "Escape") {
        // Actieve greep-sleep? Alleen de sleep annuleren (geen commit),
        // selectie en tool blijven staan.
        if (loadHandleDrag) { setLoadHandleDrag(null); return; }
        setBeamStart(null);
        setPlateCorners([]);
        setPopover(null);
        setTransformAnchor(null);
        setBoxSelect(null);
        setDragState(null);
        setContextMenu(null);
        setSelection(null);
        // ESC verlaat ook de actieve tool en valt terug naar Selecteren.
        if (tool !== "select") onToolChange?.("select");
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === " ") {
        setSpaceHeld(true);
        e.preventDefault();
      }
      if (e.key === "f" || e.key === "F") {
        if (nodes.length === 0) {
          setView({ scale: DEFAULT_SCALE, offsetX: 0, offsetY: 0 });
          return;
        }
        const xs = nodes.map(n => n.x), zs = nodes.map(n => n.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const w = Math.max(1, maxX - minX), h = Math.max(1, maxZ - minZ);
        const pad = 0.1;
        const usableW = size.w - ORIGIN_X - 40;
        const usableH = size.h - ORIGIN_Y_FROM_BOTTOM - 40;
        const scaleW = (usableW * (1 - 2 * pad)) / w;
        const scaleH = (usableH * (1 - 2 * pad)) / h;
        const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.min(scaleW, scaleH)));
        const centerWorldX = (minX + maxX) / 2;
        const centerWorldZ = (minZ + maxZ) / 2;
        // Where should center land on screen?
        const cxScreen = ORIGIN_X + usableW / 2;
        const cyScreen = (size.h - ORIGIN_Y_FROM_BOTTOM) - usableH / 2;
        const newOX = cxScreen - ORIGIN_X - centerWorldX * newScale;
        const newOY = cyScreen - (size.h - ORIGIN_Y_FROM_BOTTOM) + centerWorldZ * newScale;
        setView({ scale: newScale, offsetX: newOX, offsetY: newOY });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selection, deleteSelected, setSelection, nodes, size, hoverModel,
      grabMode, rotateMode, cancelGrab, commitGrab, cancelRotate, commitRotate,
      selectionNodeIds, copySelection, onToolChange, tool, loadHandleDrag]);

  // ── Wheel event listener (non-passive so preventDefault works) ──────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      // Forward to React handler via simulated state — but we already handle
      // in handleWheel. We need non-passive to call preventDefault().
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView(v => {
        const nextScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v.scale * factor));
        if (nextScale === v.scale) return v;
        // Pivot on cursor: solve so the world point under cursor stays put.
        const worldX = (sx - ORIGIN_X - v.offsetX) / v.scale;
        const worldZ = (size.h - ORIGIN_Y_FROM_BOTTOM + v.offsetY - sy) / v.scale;
        const newOX = sx - ORIGIN_X - worldX * nextScale;
        const newOY = sy - (size.h - ORIGIN_Y_FROM_BOTTOM) + worldZ * nextScale;
        return { scale: nextScale, offsetX: newOX, offsetY: newOY };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [size.h]);

  const resetView = () => setView({ scale: DEFAULT_SCALE, offsetX: 0, offsetY: 0 });

  /** Auto-fit: schaalt+centreert zodat alle nodes met 10% padding zichtbaar zijn. */
  const fitView = useCallback(() => {
    if (nodes.length === 0 || size.w === 0 || size.h === 0) return;
    const xs = nodes.map(n => n.x), zs = nodes.map(n => n.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxZ - minZ);
    const pad = 0.1;
    const usableW = size.w - ORIGIN_X - 40;
    const usableH = size.h - ORIGIN_Y_FROM_BOTTOM - 40;
    if (usableW <= 0 || usableH <= 0) return;
    const scaleW = (usableW * (1 - 2 * pad)) / w;
    const scaleH = (usableH * (1 - 2 * pad)) / h;
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.min(scaleW, scaleH)));
    const centerWorldX = (minX + maxX) / 2;
    const centerWorldZ = (minZ + maxZ) / 2;
    const cxScreen = ORIGIN_X + usableW / 2;
    const cyScreen = (size.h - ORIGIN_Y_FROM_BOTTOM) - usableH / 2;
    const newOX = cxScreen - ORIGIN_X - centerWorldX * newScale;
    const newOY = cyScreen - (size.h - ORIGIN_Y_FROM_BOTTOM) + centerWorldZ * newScale;
    setView({ scale: newScale, offsetX: newOX, offsetY: newOY });
  }, [nodes, size.w, size.h]);

  // Eenmalige auto-fit bij eerste render zodra canvas-grootte EN model
  // beschikbaar zijn. Daarna respecteer de eigen pan/zoom van de gebruiker.
  useEffect(() => {
    if (initialFitDoneRef.current) return;
    if (nodes.length === 0 || size.w === 0 || size.h === 0) return;
    fitView();
    initialFitDoneRef.current = true;
  }, [nodes.length, size.w, size.h, fitView]);

  // ── Render helpers ──────────────────────────────────────────────────────
  const renderGrid = () => {
    if (!grid.show || !grid.showLines) return null;
    const lines: React.ReactNode[] = [];
    const minor = grid.spacingMm * view.scale;
    // Skip rendering if the minor step would render thousands of lines
    if (minor < 4 || minor > 400) return null;
    const major = minor * 5;
    // X grid lines (vertical lines in screen) — start at origin offset
    const baseX = ORIGIN_X + view.offsetX;
    const xStart = baseX - Math.ceil(baseX / minor) * minor;
    for (let x = xStart; x < size.w; x += minor) {
      if (x < 0) continue;
      const rel = (x - baseX);
      const isMajor = Math.abs(rel % major) < 0.5 || Math.abs((rel % major) - major) < 0.5;
      lines.push(<line key={`vx${x.toFixed(1)}`} x1={x} y1={0} x2={x} y2={size.h}
        className={isMajor ? "fem-grid-major" : "fem-grid-minor"} />);
    }
    // Y grid lines
    const baseY = size.h - ORIGIN_Y_FROM_BOTTOM + view.offsetY;
    const yStart = baseY - Math.ceil(baseY / minor) * minor;
    for (let y = yStart; y < size.h; y += minor) {
      if (y < 0) continue;
      const rel = y - baseY;
      const isMajor = Math.abs(rel % major) < 0.5 || Math.abs((rel % major) - major) < 0.5;
      lines.push(<line key={`hy${y.toFixed(1)}`} x1={0} y1={y} x2={size.w} y2={y}
        className={isMajor ? "fem-grid-major" : "fem-grid-minor"} />);
    }
    return lines;
  };

  const beamsWithCoords = beams.map(b => {
    const n1 = nodes.find(n => n.id === b.from);
    const n2 = nodes.find(n => n.id === b.to);
    if (!n1 || !n2) return null;
    const p1 = worldToScreen(n1.x, n1.z);
    const p2 = worldToScreen(n2.x, n2.z);
    return { b, p1, p2 };
  }).filter(Boolean) as { b: Beam; p1: { x: number; y: number }; p2: { x: number; y: number } }[];

  const renderSupport = (s: Support) => {
    const n = nodes.find(nn => nn.id === s.nodeId);
    if (!n) return null;
    const p = worldToScreen(n.x, n.z);
    if (s.type === "pinned") {
      // Klassieke scharnier-support: driehoek + grondlijn direct onder de
      // driehoek + grond-hatching (6 schuine streepjes onder de lijn).
      // Hatching begint 1.5 px ONDER de grondlijn zodat anti-aliasing /
      // stroke-width geen randje boven de lijn laat zien.
      const triBase = p.y + 18;          // bottom edge of triangle
      const groundY = triBase;           // grondlijn raakt direct onder driehoek
      const hatchTop = groundY + 1.5;
      const hatchBot = groundY + 7.5;
      const hatchXs = [-14, -8, -2, 4, 10, 16];
      return (
        <g key={`sup${s.nodeId}`}>
          <polygon points={`${p.x},${p.y} ${p.x - 12},${triBase} ${p.x + 12},${triBase}`} className="fem-support" />
          <line x1={p.x - 16} y1={groundY} x2={p.x + 16} y2={groundY} className="fem-support-ground" />
          {hatchXs.map((dx, i) => (
            <line key={`h${i}`}
              x1={p.x + dx}     y1={hatchTop}
              x2={p.x + dx - 4} y2={hatchBot}
              className="fem-support-ground" />
          ))}
        </g>
      );
    }
    if (s.type === "fixed") {
      // Inklemming: de inklemlijn ligt DIRECT op de knoop (geen zwevend blok
      // eronder) met arceerstreepjes aan de grondzijde — de tekenconventie
      // voor een volledig ingeklemde rand.
      const halveBreedte = 15;
      const arcering: React.ReactNode[] = [];
      for (let i = 0; i <= 6; i++) {
        const x = p.x - halveBreedte + (i * 2 * halveBreedte) / 6;
        arcering.push(
          <line
            key={`ha${i}`}
            x1={x} y1={p.y}
            x2={x - 5} y2={p.y + 7}
            className="fem-support-ground"
          />,
        );
      }
      return (
        <g key={`sup${s.nodeId}`}>
          <line
            x1={p.x - halveBreedte} y1={p.y}
            x2={p.x + halveBreedte} y2={p.y}
            className="fem-support-vast"
          />
          {arcering}
        </g>
      );
    }
    if (s.type === "xRoller") {
      return (
        <g key={`sup${s.nodeId}`}>
          <polygon points={`${p.x},${p.y} ${p.x - 20},${p.y - 12} ${p.x - 20},${p.y + 12}`} className="fem-support" />
          <line x1={p.x - 25} y1={p.y - 16} x2={p.x - 25} y2={p.y + 16} className="fem-support-ground" />
        </g>
      );
    }
    if (s.type === "zRoller") {
      return (
        <g key={`sup${s.nodeId}`}>
          <polygon points={`${p.x},${p.y} ${p.x - 12},${p.y + 20} ${p.x + 12},${p.y + 20}`} className="fem-support" />
          <circle cx={p.x - 6} cy={p.y + 22} r={2.5} className="fem-support" />
          <circle cx={p.x + 6} cy={p.y + 22} r={2.5} className="fem-support" />
          <line x1={p.x - 16} y1={p.y + 27} x2={p.x + 16} y2={p.y + 27} className="fem-support-ground" />
        </g>
      );
    }
    if (s.type === "zSpring") {
      // Vertical zig-zag spring with ground line below
      const top = p.y + 6, bot = p.y + 28;
      const xs = [p.x, p.x - 6, p.x + 6, p.x - 6, p.x + 6, p.x];
      const ys = [top, top + 4, top + 8, top + 12, top + 16, bot];
      const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
      return (
        <g key={`sup${s.nodeId}`}>
          <polyline points={points} className="fem-spring" />
          <line x1={p.x - 16} y1={p.y + 32} x2={p.x + 16} y2={p.y + 32} className="fem-support-ground" />
          {s.k !== undefined && <text x={p.x + 18} y={p.y + 22} className="fem-spring-label">k={s.k}</text>}
        </g>
      );
    }
    if (s.type === "xSpring") {
      const left = p.x - 28, right = p.x - 6;
      const ys = [p.y - 6, p.y - 2, p.y + 2, p.y - 2, p.y + 2, p.y];
      const xs = [left, left + 4, left + 8, left + 12, left + 16, right];
      const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
      return (
        <g key={`sup${s.nodeId}`}>
          <polyline points={points} className="fem-spring" />
          <line x1={p.x - 32} y1={p.y - 12} x2={p.x - 32} y2={p.y + 12} className="fem-support-ground" />
          {s.k !== undefined && <text x={p.x + 12} y={p.y + 4} className="fem-spring-label">k={s.k}</text>}
        </g>
      );
    }
    if (s.type === "rotSpring") {
      // Rotatieveer: een INKLEMMING (grondlijn met arcering) met daartussen
      // een spiraalveer, zodat zichtbaar is dat de rotatie verend is
      // vastgehouden in plaats van star.
      const halveBreedte = 15;
      const grondY = p.y + 26;
      const arcering: React.ReactNode[] = [];
      for (let i = 0; i <= 6; i++) {
        const x = p.x - halveBreedte + (i * 2 * halveBreedte) / 6;
        arcering.push(
          <line
            key={`ra${i}`}
            x1={x} y1={grondY}
            x2={x - 5} y2={grondY + 7}
            className="fem-support-ground"
          />,
        );
      }
      // Archimedische spiraal van de knoop naar de grondlijn: r groeit
      // lineair met de hoek, 2,25 omwentelingen.
      const punten: string[] = [];
      const stappen = 54;
      const rMax = 9.5;
      for (let i = 0; i <= stappen; i++) {
        const t = i / stappen;
        const hoek = t * 2.25 * 2 * Math.PI;
        const r = t * rMax;
        punten.push(`${(p.x + r * Math.sin(hoek)).toFixed(2)},${(p.y + 12 - r * Math.cos(hoek)).toFixed(2)}`);
      }
      return (
        <g key={`sup${s.nodeId}`}>
          {/* aansluiting knoop → spiraal en spiraal → grondlijn */}
          <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + 12 - rMax} className="fem-spring" />
          <polyline points={punten.join(" ")} fill="none" className="fem-spring" />
          <line
            x1={p.x + rMax * Math.sin(2.25 * 2 * Math.PI)}
            y1={p.y + 12 - rMax * Math.cos(2.25 * 2 * Math.PI)}
            x2={p.x} y2={grondY}
            className="fem-spring"
          />
          <line
            x1={p.x - halveBreedte} y1={grondY}
            x2={p.x + halveBreedte} y2={grondY}
            className="fem-support-vast"
          />
          {arcering}
          {s.k !== undefined && <text x={p.x + 16} y={p.y + 6} className="fem-spring-label">kθ={s.k}</text>}
        </g>
      );
    }
    return null;
  };

  // Loads for the active load case only — empty when in Model-view mode.
  // In Resultaten-modus willen we de invoer-belasting-pijlen verbergen zodat
  // alleen de output-overlays (M/V/N/u/R) zichtbaar zijn.
  const activeLoads = (showLoads && !resultsMode)
    ? loads.filter(l => l.caseId === activeLoadCaseId)
    : [];

  // Auto-scale q-load arrows so the biggest line load reaches LINE_LOAD_TARGET_PX
  // on screen — fixed 16-px arrows were unreadable for q ≈ 1 kN/m and ridiculous
  // for q ≈ 50 kN/m. Range is clamped to [LINE_LOAD_MIN_PX, LINE_LOAD_MAX_PX].
  const LINE_LOAD_TARGET_PX = 56;
  const LINE_LOAD_MIN_PX = 18;
  const LINE_LOAD_MAX_PX = 80;
  const maxLineQ = activeLoads.reduce((m, l) => {
    // Randlasten (edgeLoad, uniform — alleen q) schalen mee met de lijnlasten
    // zodat beide pijlsoorten dezelfde px-per-kN/m-verhouding delen.
    if (l.type !== "lineLoad" && l.type !== "edgeLoad") return m;
    const qa = Math.abs(l.qStart ?? l.q ?? 0);
    const qb = Math.abs(l.qEnd   ?? l.q ?? 0);
    return Math.max(m, qa, qb);
  }, 0);
  const lineLoadPxPerKnm = maxLineQ > 0 ? LINE_LOAD_TARGET_PX / maxLineQ : 0;

  // ── Stapeling van lijnlasten op dezelfde staaf ──────────────────────────
  // Twee q-lasten op één staaf (bv. permanent + variabel, of twee elkaar
  // overlappende deellasten) tekenden vroeger dwars door elkaar heen. Nu
  // krijgt elke volgende last op dezelfde staaf een oplopende verschuiving
  // LOODRECHT op de staafas: de eerste ligt tegen de staaf aan, de volgende
  // erbuiten. De verschuiving is een simpele translatie van de lastband, dus
  // de bestaande auto-schaling van de pijllengte, de deellast-fracties
  // (startFrac/endFrac), de richting (qCoord/qDir) en de shape-grepen blijven
  // exact zoals ze waren; met offset 0 is de tekening bit-identiek aan vroeger.
  //
  // Regels:
  //  - alleen stapelen binnen dezelfde "baan": zelfde assenstelsel, richting
  //    én zijde van de staaf. Een verticale en een horizontale last tekenen
  //    langs verschillende assen en botsen niet, dus die blijven op offset 0.
  //  - alleen stapelen waar de lasten elkaar in de LENGTE overlappen; twee
  //    deellasten naast elkaar houden allebei offset 0.
  //  - stabiele volgorde op (belastinggeval-id, last-id) zodat een herrender
  //    de stapel nooit laat springen. De fracties komen uit de OPGESLAGEN
  //    waarden (niet uit een lopende greep-sleep), zodat de stapel tijdens
  //    het slepen van een shape-greep evenmin verspringt.
  // Ruimte tussen twee gestapelde banden. Het waardelabel van de onderste
  // band staat 14 px boven zijn pijlstaarten en is ±11 px hoog, dus 30 px
  // geeft het label van elke band zijn eigen strook.
  const STAPEL_GAT_PX = 30;
  /** Stapelgegevens per lijnlast-id (leeg wanneer er niets te stapelen valt). */
  const qStapel = new Map<number, {
    beamId: number;
    /** Loodrechte verschuiving van de lastband t.o.v. de staafas (px). */
    offset: number;
    /** Scherm-eenheidsvector van de staafas naar de pijlstaarten. */
    ex: number; ey: number;
    /** Pijllengte (px) aan begin/eind van het belaste deel. */
    lenA: number; lenB: number;
    /** Belast interval als fracties op de staaf. */
    a: number; b: number;
  }>();
  {
    const perStaaf = new Map<number, Load[]>();
    for (const l of activeLoads) {
      if (l.type !== "lineLoad" || l.beamId === undefined) continue;
      const arr = perStaaf.get(l.beamId);
      if (arr) arr.push(l); else perStaaf.set(l.beamId, [l]);
    }
    for (const [beamId, lijst] of perStaaf) {
      const b = beams.find(bb => bb.id === beamId);
      if (!b) continue;
      const nA = nodes.find(n => n.id === b.from);
      const nB = nodes.find(n => n.id === b.to);
      if (!nA || !nB) continue;
      const pA = worldToScreen(nA.x, nA.z), pB = worldToScreen(nB.x, nB.z);
      const dxs = pB.x - pA.x, dys = pB.y - pA.y;
      const Lpx = Math.hypot(dxs, dys);
      if (Lpx < 1) continue;
      const gesorteerd = [...lijst].sort((p, q) => (p.caseId - q.caseId) || (p.id - q.id));
      const geplaatst: { a: number; b: number; baan: string; offset: number; hoogte: number }[] = [];
      for (const l of gesorteerd) {
        // Zelfde richtingsbepaling als in renderLoad hieronder.
        const coordL = l.qCoord ?? "global";
        const dirL = l.qDir ?? "z";
        let nx: number, ny: number;
        if (coordL === "local") {
          if (dirL === "z") { nx = -dys / Lpx; ny = dxs / Lpx; }
          else              { nx = -dxs / Lpx; ny = -dys / Lpx; }
        } else {
          if (dirL === "z") { nx = 0; ny = 1; }
          else              { nx = -1; ny = 0; }
        }
        const qa = l.qStart ?? l.q ?? 0;
        const qb = l.qEnd   ?? l.q ?? 0;
        const gemDir = ((qa + qb) / 2) < 0 ? 1 : -1;   // zelfde flip-conventie
        const ex = nx * -gemDir, ey = ny * -gemDir;    // as → pijlstaarten
        const a = Math.min(1, Math.max(0, l.startFrac ?? 0));
        const bF = Math.min(1, Math.max(a, l.endFrac ?? 1));
        const lenA = Math.min(LINE_LOAD_MAX_PX, Math.max(LINE_LOAD_MIN_PX, Math.abs(qa) * lineLoadPxPerKnm || LINE_LOAD_MIN_PX));
        const lenB = Math.min(LINE_LOAD_MAX_PX, Math.max(LINE_LOAD_MIN_PX, Math.abs(qb) * lineLoadPxPerKnm || LINE_LOAD_MIN_PX));
        const hoogte = Math.max(lenA, lenB);
        const baan = `${coordL}|${dirL}|${gemDir}`;
        let offset = 0;
        for (const g of geplaatst) {
          if (g.baan !== baan) continue;
          // Overlap in de lengte? (elkaar rakend telt niet als overlap)
          if (Math.min(bF, g.b) - Math.max(a, g.a) <= 1e-6) continue;
          offset = Math.max(offset, g.offset + g.hoogte + STAPEL_GAT_PX);
        }
        geplaatst.push({ a, b: bF, baan, offset, hoogte });
        qStapel.set(l.id, { beamId, offset, ex, ey, lenA, lenB, a, b: bF });
      }
    }
  }

  /**
   * Hoogte (px) van de gestapelde q-banden op fractie `t` van staaf `beamId`,
   * geprojecteerd op de schermrichting (ux, uy) — de richting waarin een
   * puntlastpijl vanaf zijn aangrijpingspunt WEG wijst. Alleen banden die
   * dezelfde kant op steken tellen mee (projectie > 0), zodat een verticale
   * puntlast niet uitwijkt voor een horizontale windlast.
   */
  const qBandHoogte = (beamId: number, t: number, ux: number, uy: number): number => {
    let h = 0;
    for (const info of qStapel.values()) {
      if (info.beamId !== beamId) continue;
      if (t < info.a - 1e-9 || t > info.b + 1e-9) continue;
      const proj = info.ex * ux + info.ey * uy;
      if (proj <= 0.05) continue;
      const s = info.b > info.a ? Math.min(1, Math.max(0, (t - info.a) / (info.b - info.a))) : 0;
      const len = info.lenA + (info.lenB - info.lenA) * s;
      h = Math.max(h, (info.offset + len) * proj);
    }
    return h;
  };

  /**
   * Vrije hoogte (px) die een puntlast op KNOOP `nodeId` moet aanhouden om
   * boven alle q-banden op de aansluitende staven uit te komen.
   */
  const qBandHoogteBijKnoop = (nodeId: number, ux: number, uy: number): number => {
    let h = 0;
    if (qStapel.size === 0) return 0;              // geen q-lasten zichtbaar
    const metBand = new Set([...qStapel.values()].map(i => i.beamId));
    for (const b of beams) {
      if (!metBand.has(b.id)) continue;
      if (b.from === nodeId) h = Math.max(h, qBandHoogte(b.id, 0, ux, uy));
      if (b.to === nodeId)   h = Math.max(h, qBandHoogte(b.id, 1, ux, uy));
    }
    return h;
  };

  /** Extra lucht tussen de bovenkant van de q-band en de puntlastkop (px). */
  const PUNTLAST_LUCHT_PX = 6;

  const renderLoad = (l: Load) => {
    // PUNTLAST op een knoop óf op een vrije positie op een staaf.
    // De pijl wordt ALTIJD boven de (eventueel gestapelde) q-lastband
    // getekend: `vrij` is de hoogte van de banden op die positie, gemeten in
    // de richting waarin de pijl vanaf het aangrijpingspunt weg wijst. Is er
    // geen q-band (vrij = 0), dan is de tekening identiek aan vroeger.
    if (l.type === "pointForce" && (l.nodeId !== undefined || l.beamId !== undefined)) {
      const fx = l.fx ?? 0, fz = l.fz ?? 0;
      const mag = Math.hypot(fx, fz);
      if (mag < 1e-9) return null;

      // Aangrijpingspunt (scherm) + de vrije hoogte van de q-banden daar.
      let p: { x: number; y: number };
      let vrijMeten: (ux: number, uy: number) => number;
      let opStaaf = false;
      if (l.nodeId !== undefined) {
        const n = nodes.find(nn => nn.id === l.nodeId); if (!n) return null;
        p = worldToScreen(n.x, n.z);
        vrijMeten = (ux, uy) => qBandHoogteBijKnoop(l.nodeId!, ux, uy);
      } else {
        const b = beams.find(bb => bb.id === l.beamId); if (!b) return null;
        const nA = nodes.find(n => n.id === b.from);
        const nB = nodes.find(n => n.id === b.to);
        if (!nA || !nB) return null;
        const t = Math.min(1, Math.max(0, l.posFrac ?? 0));
        const pA = worldToScreen(nA.x, nA.z), pB = worldToScreen(nB.x, nB.z);
        p = { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t };
        vrijMeten = (ux, uy) => qBandHoogte(b.id, t, ux, uy);
        opStaaf = true;
      }

      const scale = 40 / mag;
      // Pijl wijst NAAR het aangrijpingspunt toe, in de lastrichting;
      // (ux, uy) is de eenheidsvector die daar vandaan wijst (naar de staart).
      const ax = fx * scale, ay = -fz * scale;
      const ux = -ax / 40, uy = -ay / 40;
      const vrij = vrijMeten(ux, uy);
      const lucht = vrij > 0 ? vrij + PUNTLAST_LUCHT_PX : 0;
      const kop  = { x: p.x + ux * lucht, y: p.y + uy * lucht };
      const tail = { x: kop.x + ux * 40,  y: kop.y + uy * 40 };
      const isSel = selection?.type === "load" && selection.id === l.id;
      return (
        <g
          key={`load${l.id}`}
          className={`fem-pointload-group${isSel ? " selected" : ""}`}
          onClick={(e) => {
            if (tool === "select" && !dragState) {
              e.stopPropagation();
              setSelection({ type: "load", id: l.id });
            }
          }}
        >
          {/* Stippellijn van het aangrijpingspunt naar de opgetilde pijlkop —
              zonder dit is niet te zien wáár de last precies aangrijpt. */}
          {lucht > 0 && (
            <line x1={p.x} y1={p.y} x2={kop.x} y2={kop.y} className="fem-load-leader" />
          )}
          {/* Markeerpunt op de staaf bij een last op een vrije positie. */}
          {opStaaf && <circle cx={p.x} cy={p.y} r={2.5} className="fem-pointload-dot" />}
          {/* Onzichtbare klikzone langs de pijlschacht (steekt van de staaf
              af, dus botst niet met het aanklikken van de staaf zelf). */}
          <line x1={tail.x} y1={tail.y} x2={kop.x} y2={kop.y} className="fem-pointload-hit" />
          <line x1={tail.x} y1={tail.y} x2={kop.x} y2={kop.y} className="fem-load-vec" markerEnd="url(#fem-load-head)" />
          <text x={tail.x} y={tail.y - 4} className="fem-load-text">{mag.toFixed(1)} kN</text>
        </g>
      );
    }
    // POINT MOMENT on node
    if (l.type === "pointMoment" && l.nodeId !== undefined) {
      const n = nodes.find(nn => nn.id === l.nodeId); if (!n) return null;
      const p = worldToScreen(n.x, n.z);
      const m = l.my ?? 0;
      const r = 14;
      const sweepFlag = m > 0 ? 1 : 0;
      const path = `M ${p.x + r} ${p.y} A ${r} ${r} 0 1 ${sweepFlag} ${p.x - r} ${p.y}`;
      return (
        <g key={`load${l.id}`}>
          <path d={path} fill="none" className="fem-load-vec" markerEnd="url(#fem-load-head)" />
          <text x={p.x} y={p.y - r - 4} className="fem-load-text">{Math.abs(m).toFixed(1)} kNm</text>
        </g>
      );
    }
    // LINE LOAD on beam
    if (l.type === "lineLoad" && l.beamId !== undefined) {
      const b = beams.find(bb => bb.id === l.beamId); if (!b) return null;
      const nA = nodes.find(n => n.id === b.from);
      const nB = nodes.find(n => n.id === b.to);
      if (!nA || !nB) return null;
      const pA = worldToScreen(nA.x, nA.z), pB = worldToScreen(nB.x, nB.z);
      const dxs = pB.x - pA.x, dys = pB.y - pA.y;
      const L = Math.hypot(dxs, dys);
      if (L < 1) return null;
      // Richting van de pijlen: (nx, ny) is de scherm-eenheidsvector
      // waarlangs de last WERKT bij q < 0 (conventie: negatief = gravitatie):
      //  - globaal + qDir z: verticaal omlaag (wereldassen) — zoals gerekend;
      //  - globaal + qDir x: wereld −x (horizontaal);
      //  - lokaal  + qDir z: loodrecht op de staaf (lokale −y);
      //  - lokaal  + qDir x: axiaal, tegen de staafrichting in.
      // Consistent met de rekensemantiek in solver/engine.ts: een GLOBALE
      // last tekent verticaal/horizontaal ook op een schuine staaf, een
      // LOKALE last draait met de staaf mee.
      const coordL = l.qCoord ?? "global";
      const dirL = l.qDir ?? "z";
      let nx: number, ny: number;
      if (coordL === "local") {
        if (dirL === "z") { nx = -dys / L; ny = dxs / L; }   // lokale −y (loodrecht)
        else              { nx = -dxs / L; ny = -dys / L; }  // −x̂ lokaal (axiaal)
      } else {
        if (dirL === "z") { nx = 0; ny = 1; }                // scherm-omlaag = wereld −z
        else              { nx = -1; ny = 0; }               // wereld −x
      }
      // Lokaal-axiale pijlen liggen anders óp de staaflijn: til de band een
      // vast stukje loodrecht van de as zodat de pijlen leesbaar blijven.
      const isAxial = coordL === "local" && dirL === "x";
      // Stapelverschuiving (zie qStapel hierboven): translatie van de hele
      // lastband loodrecht op de staafas. Offset 0 (enige last op de staaf,
      // of geen overlap) ⇒ exact de oude tekening.
      const stap = qStapel.get(l.id);
      const stapOffX = stap ? stap.ex * stap.offset : 0;
      const stapOffY = stap ? stap.ey * stap.offset : 0;
      const offX = (isAxial ? (dys / L) * 10 : 0) + stapOffX;
      const offY = (isAxial ? (-dxs / L) * 10 : 0) + stapOffY;
      // Deellast: pijlen + lastblok alleen over het belaste deel
      // [startFrac, endFrac] van de staaf (default volle lengte). Tijdens een
      // greep-sleep gelden de PREVIEW-fracties zodat band en grepen de muis
      // live volgen; de commit gebeurt pas op loslaten.
      const storedA = Math.min(1, Math.max(0, l.startFrac ?? 0));
      const storedB = Math.min(1, Math.max(storedA, l.endFrac ?? 1));
      const hd = loadHandleDrag && loadHandleDrag.loadId === l.id ? loadHandleDrag : null;
      const aF = hd ? hd.previewStart : storedA;
      const bF = hd ? hd.previewEnd : storedB;
      const pS = { x: pA.x + dxs * aF + offX, y: pA.y + dys * aF + offY };
      const pE = { x: pA.x + dxs * bF + offX, y: pA.y + dys * bF + offY };
      const sdx = pE.x - pS.x, sdy = pE.y - pS.y;   // belaste segment (px)
      // Trapezium vs uniform: when qStart/qEnd defined, varies linearly
      // (over het BELASTE deel).
      const qa = l.qStart ?? l.q ?? 0;
      const qb = l.qEnd   ?? l.q ?? 0;
      const isTrap = l.qStart !== undefined || l.qEnd !== undefined;
      // Direction (per end). Convention: NEGATIVE q = gravity / downward,
      // so the arrow heads should point DOWN onto the beam (tails ABOVE).
      // For a horizontal beam the perpendicular `ny` points DOWN in screen
      // (since screen-y is flipped); with `-dir` shift, dir=+1 puts the tail
      // ABOVE the beam (where we want it for downward load).
      const dirA = qa < 0 ? 1 : -1;
      const dirB = qb < 0 ? 1 : -1;
      // Auto-scaled lengths per end.
      const lenA = Math.min(LINE_LOAD_MAX_PX, Math.max(LINE_LOAD_MIN_PX, Math.abs(qa) * lineLoadPxPerKnm || LINE_LOAD_MIN_PX));
      const lenB = Math.min(LINE_LOAD_MAX_PX, Math.max(LINE_LOAD_MIN_PX, Math.abs(qb) * lineLoadPxPerKnm || LINE_LOAD_MIN_PX));
      const arrows: React.ReactNode[] = [];
      // Pijldichtheid gelijk houden: volle lengte → 8 tussenstappen,
      // deellast naar rato (minimaal 2).
      const N = Math.max(2, Math.round(8 * (bF - aF)));
      // Build the polyline along the arrow tails so we can draw a connecting
      // "load envelope" (silhouette) + clickable hit-region.
      const tailPts: { x: number; y: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const cx = pS.x + sdx * t, cy = pS.y + sdy * t;
        // Linear interpolation of arrow length + direction
        const lenT = lenA + (lenB - lenA) * t;
        const dirT = dirA + (dirB - dirA) * t;       // smooth interp for sign
        const dirSign = dirT < 0 ? -1 : 1;
        const sx = cx + nx * lenT * -dirSign;
        const sy = cy + ny * lenT * -dirSign;
        tailPts.push({ x: sx, y: sy });
        arrows.push(
          <line key={`la${l.id}-${i}`}
            x1={sx} y1={sy} x2={cx} y2={cy}
            className="fem-load-vec" markerEnd="url(#fem-load-head)" />
        );
      }
      // Label position: midden van het BELASTE deel — use average length for offset.
      const midX = (pS.x + pE.x) / 2, midY = (pS.y + pE.y) / 2;
      const avgLen = (lenA + lenB) / 2;
      const avgDir = ((qa + qb) / 2) < 0 ? 1 : -1;     // same flipped convention
      const labelX = midX + nx * (avgLen + 14) * -avgDir;
      const labelY = midY + ny * (avgLen + 14) * -avgDir;
      // Closed polygon (baseline van het belaste deel → tails) for a
      // clickable hit-region + halo.
      const polyPoints = [
        `${pS.x},${pS.y}`,
        ...tailPts.map(p => `${p.x},${p.y}`),
        `${pE.x},${pE.y}`,
      ].join(" ");
      const isSel = selection?.type === "load" && selection.id === l.id;
      return (
        <g
          key={`load${l.id}`}
          className={`fem-lineload-group${isSel ? " selected" : ""}`}
          onClick={(e) => {
            if (tool === "select" && !dragState) {
              e.stopPropagation();
              setSelection({ type: "load", id: l.id });
            }
          }}
        >
          {/* Invisible hit-region — covers the whole trapezoid for easy clicks */}
          <polygon className="fem-lineload-hit" points={polyPoints} />
          {/* Visible top line connecting all arrow tails */}
          <polyline className="fem-lineload-tip" points={tailPts.map(p => `${p.x},${p.y}`).join(" ")} />
          {arrows}
          {isTrap ? (
            // Trapezium: split label into qa / qb so each value clicks into its own input
            <>
              <text x={labelX} y={labelY} className="fem-load-text-static">q=</text>
              <text
                x={labelX} y={labelY} dx="14"
                className="fem-load-text fem-load-text-clickable"
                onClick={(e) => {
                  if (tool === "select" && !dragState) {
                    e.stopPropagation();
                    setSelection({ type: "load", id: l.id });
                    setPendingLoadFocus?.({ loadId: l.id, field: "qStart" });
                  }
                }}
              >{qa.toFixed(1)}</text>
              <text x={labelX} y={labelY} dx="34" className="fem-load-text-static">→</text>
              <text
                x={labelX} y={labelY} dx="44"
                className="fem-load-text fem-load-text-clickable"
                onClick={(e) => {
                  if (tool === "select" && !dragState) {
                    e.stopPropagation();
                    setSelection({ type: "load", id: l.id });
                    setPendingLoadFocus?.({ loadId: l.id, field: "qEnd" });
                  }
                }}
              >{qb.toFixed(1)}</text>
              <text x={labelX} y={labelY} dx="64" className="fem-load-text-static">kN/m</text>
            </>
          ) : (
            // Uniform: single value, click anywhere on the label sends focus to q
            <text
              x={labelX} y={labelY}
              className="fem-load-text fem-load-text-clickable"
              onClick={(e) => {
                if (tool === "select" && !dragState) {
                  e.stopPropagation();
                  setSelection({ type: "load", id: l.id });
                  setPendingLoadFocus?.({ loadId: l.id, field: "q" });
                }
              }}
            >
              q={qa.toFixed(1)} kN/m
            </text>
          )}
        </g>
      );
    }
    // RANDLAST op een plaatrand (P3.3/P4.3) — pijltjesrij langs de rand,
    // zelfde pijl- en tekenconventie als de lijnlast (q < 0 = omlaag/links).
    // Polygonranden (edgeIndex) tekenen langs het echte randsegment
    // hoek i → hoek i+1; benoemde randen langs de bbox-rand (rechthoek).
    if (l.type === "edgeLoad" && l.plateId !== undefined) {
      const pl = plates.find(pp => pp.id === l.plateId); if (!pl) return null;
      const seg = l.edgeIndex !== undefined
        ? plaatPolygoonRandSegment(pl, nodes, l.edgeIndex)
        : plaatRandSegment(pl, nodes, l.edge ?? "top");
      if (!seg) return null;
      const q = l.q ?? 0;
      if (Math.abs(q) < 1e-9) return null;
      const pA = worldToScreen(seg.a.x, seg.a.z);
      const pB = worldToScreen(seg.b.x, seg.b.z);
      const dxs = pB.x - pA.x, dys = pB.y - pA.y;
      const L = Math.hypot(dxs, dys);
      if (L < 1) return null;
      // Richting van de pijlen (globale assen, zoals de rekensemantiek):
      // (nx, ny) = scherm-eenheidsvector waarlangs de last werkt bij q < 0.
      const dirL = l.qDir ?? "z";
      const nx = dirL === "z" ? 0 : -1;
      const ny = dirL === "z" ? 1 : 0;
      const len = Math.min(LINE_LOAD_MAX_PX,
        Math.max(LINE_LOAD_MIN_PX, Math.abs(q) * lineLoadPxPerKnm || LINE_LOAD_MIN_PX));
      const dirQ = q < 0 ? 1 : -1;    // zelfde flip-conventie als de lijnlast
      const N = 8;
      const arrows: React.ReactNode[] = [];
      const tailPts: { x: number; y: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const cx = pA.x + dxs * t, cy = pA.y + dys * t;
        const sxT = cx + nx * len * -dirQ;
        const syT = cy + ny * len * -dirQ;
        tailPts.push({ x: sxT, y: syT });
        arrows.push(
          <line key={`ea${l.id}-${i}`}
            x1={sxT} y1={syT} x2={cx} y2={cy}
            className="fem-load-vec" markerEnd="url(#fem-load-head)" />
        );
      }
      const midX = (pA.x + pB.x) / 2, midY = (pA.y + pB.y) / 2;
      const labelX = midX + nx * (len + 14) * -dirQ;
      const labelY = midY + ny * (len + 14) * -dirQ;
      const polyPoints = [
        `${pA.x},${pA.y}`,
        ...tailPts.map(p => `${p.x},${p.y}`),
        `${pB.x},${pB.y}`,
      ].join(" ");
      const isSel = selection?.type === "load" && selection.id === l.id;
      return (
        <g
          key={`load${l.id}`}
          className={`fem-lineload-group${isSel ? " selected" : ""}`}
          onClick={(e) => {
            if (tool === "select" && !dragState) {
              e.stopPropagation();
              setSelection({ type: "load", id: l.id });
            }
          }}
        >
          <polygon className="fem-lineload-hit" points={polyPoints} />
          <polyline className="fem-lineload-tip" points={tailPts.map(p => `${p.x},${p.y}`).join(" ")} />
          {arrows}
          <text
            x={labelX} y={labelY}
            className="fem-load-text fem-load-text-clickable"
            onClick={(e) => {
              if (tool === "select" && !dragState) {
                e.stopPropagation();
                setSelection({ type: "load", id: l.id });
                setPendingLoadFocus?.({ loadId: l.id, field: "q" });
              }
            }}
          >
            p={q.toFixed(1)} kN/m
          </text>
        </g>
      );
    }
    // THERMAL on beam
    if (l.type === "thermal" && l.beamId !== undefined) {
      const b = beams.find(bb => bb.id === l.beamId); if (!b) return null;
      const nA = nodes.find(n => n.id === b.from);
      const nB = nodes.find(n => n.id === b.to);
      if (!nA || !nB) return null;
      const mx = (nA.x + nB.x) / 2, mz = (nA.z + nB.z) / 2;
      const p = worldToScreen(mx, mz);
      return (
        <g key={`load${l.id}`}>
          <circle cx={p.x} cy={p.y} r={6} className="fem-load-thermal" />
          <text x={p.x + 10} y={p.y + 4} className="fem-load-text">ΔT={l.deltaT}°</text>
        </g>
      );
    }
    return null;
  };

  const cursorStyle = panRef.current.active ? "grabbing"
    : spaceHeld ? "grab"
    : loadHandleDrag ? "grabbing"
    : dragState ? "grabbing"
    : grabMode ? "move"
    : rotateMode ? "alias"
    : boxSelect ? "crosshair"
    : tool === "select"
      ? (snapNode !== null || snapBeam !== null ? "pointer" : "default")
      : "crosshair";

  // Render plates (translucent polygons). Polygonplaten (P4.2) tonen hun
  // gecachete CDT-mesh als lichte lijnen zodra de cache actueel is — zo is
  // het rekenmesh al vóór de berekening zichtbaar.
  const renderPlate = (pl: Plate) => {
    const pts = pl.nodeIds.map(id => {
      const n = nodes.find(nn => nn.id === id);
      if (!n) return null;
      const p = worldToScreen(n.x, n.z);
      return `${p.x},${p.y}`;
    });
    if (pts.some(x => x === null)) return null;
    const isSel = selection?.type === "plate" && selection.id === pl.id;

    // CDT-mesh-preview: alleen wanneer de cache bij de ACTUELE geometrie +
    // meshSize hoort (zelfde signatuurcheck als de engine).
    let meshPreview: React.ReactNode = null;
    const punten = plaatHoekPunten(pl, nodes);
    if (punten && isPolygoonPlaat(punten) && pl.meshCache) {
      const d = withPlateDefaults(pl);
      const sig = berekenPlaatMeshSignatuur(punten, d.meshSize!);
      if (pl.meshCache.signature === sig) {
        const schermPunt = pl.meshCache.points.map(p2 => worldToScreen(p2.x, p2.z));
        meshPreview = (
          <g pointerEvents="none" className="fem-plate-meshlines">
            {pl.meshCache.triangles.map((t, i) => (
              <polygon
                key={`pm${pl.id}-${i}`}
                points={t.map(pi => `${schermPunt[pi].x.toFixed(2)},${schermPunt[pi].y.toFixed(2)}`).join(" ")}
                fill="none"
                stroke="rgba(100, 116, 139, 0.35)"
                strokeWidth={0.7}
              />
            ))}
          </g>
        );
      }
    }

    return (
      <g key={`plate${pl.id}`}>
        <polygon
          points={pts.join(" ")}
          className={`fem-plate${isSel ? " selected" : ""}`}
          onClick={(e) => { if (tool === "select") { e.stopPropagation(); setSelection({ type: "plate", id: pl.id }); } }}
        />
        {meshPreview}
      </g>
    );
  };

  // Display zoom percentage
  const zoomPct = Math.round((view.scale / DEFAULT_SCALE) * 100);

  // ── Pick which result to render in the overlay ──────────────────────────
  // Priority:
  //   1. activeCombinationId set → render that combination's combined result.
  //   2. envelopeView true → don't use deflected-shape overlay, render the
  //      envelope view in its own layer below.
  //   3. fall back to the single-case live solver result for the active LC.
  const overlayResult: SolverResult | null = useMemo(() => {
    if (activeCombinationId !== null && activeCombinationId !== undefined && combinationResults) {
      return combinationResults.get(activeCombinationId) ?? null;
    }
    if (envelopeView) return null; // envelope rendered separately
    return results;
  }, [activeCombinationId, combinationResults, envelopeView, results]);

  // ── Plaatspanningscontouren (P3.2) ──────────────────────────────────────
  // Elementvlakken gevuld op de gekozen component; het kleurbereik is de
  // min/max over ALLE platen samen zodat één legenda het hele model dekt.
  // `plateElements` komt uit de single-LC-canvas-solve (en elk ander
  // SolverResult dat plaatspanningen draagt); combinatie-superpositie van
  // plaatspanningen staat op de backlog en toont dan geen contouren.
  const plaatComponent = (displayFlags.plaatComponent ?? "vonMises") as PlaatComponent;
  const plaatContourData = useMemo(() => {
    if (!showLoads || displayFlags.plaatContour === false) return null;
    const platenRes = overlayResult?.plateElements;
    if (!platenRes || platenRes.length === 0) return null;
    let min = Infinity, max = -Infinity;
    for (const pr of platenRes) {
      const r = pr.ranges[plaatComponent];
      if (r) { min = Math.min(min, r.min); max = Math.max(max, r.max); }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { platenRes, min, max };
  }, [overlayResult, plaatComponent, displayFlags.plaatContour, showLoads]);

  /** Banner text shown at the top of the canvas after a successful solve. */
  const bannerText: { kind: "single" | "combo" | "envelope"; text: string } | null = useMemo(() => {
    if (envelopeView && envelope) {
      const combo = combinations?.find(c => c.id === envelope.maxDisplacementCombinationId);
      const comboTag = combo ? ` (Combo: ${combo.name})` : "";
      return { kind: "envelope", text: `Enveloppe (${combinations?.length ?? 0} combinaties): max |u| = ${envelope.maxDisplacement.toFixed(2)} mm${comboTag}` };
    }
    if (activeCombinationId !== null && activeCombinationId !== undefined && combinationResults) {
      const r = combinationResults.get(activeCombinationId);
      const combo = combinations?.find(c => c.id === activeCombinationId);
      if (r && combo) {
        return { kind: "combo", text: `${combo.name}: max |u| = ${r.maxDisplacement.toFixed(2)} mm` };
      }
    }
    if (results) {
      return { kind: "single", text: `Solved: max |u| = ${results.maxDisplacement.toFixed(2)} mm` };
    }
    return null;
  }, [envelopeView, envelope, activeCombinationId, combinationResults, combinations, results]);

  // ── Envelope overlay rendering ──────────────────────────────────────────
  // Colors each beam by sign of max |M| and labels with value + governing combo.
  const renderEnvelopeOverlay = () => {
    if (!envelopeView || !envelope) return null;
    const overlays: React.ReactNode[] = [];
    envelope.elements.forEach((env, beamId) => {
      const beam = beams.find(b => b.id === beamId);
      if (!beam) return;
      const nA = nodes.find(n => n.id === beam.from);
      const nB = nodes.find(n => n.id === beam.to);
      if (!nA || !nB) return;
      const p1 = worldToScreen(nA.x, nA.z);
      const p2 = worldToScreen(nB.x, nB.z);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const mAbs = Math.max(Math.abs(env.M_max), Math.abs(env.M_min));
      // Sign chosen by which extreme has larger magnitude.
      const sign = Math.abs(env.M_max) >= Math.abs(env.M_min) ? +1 : -1;
      // Amber = sagging+, Blue = hogging−; subtle stroke width modulated by mAbs.
      const color = sign > 0 ? "#ffb000" : "#3a7afe";
      // 0..1 normalisation against the largest member in the envelope so the
      // thickest stroke remains readable.
      let maxAcrossAll = 0;
      envelope.elements.forEach(e => {
        const m = Math.max(Math.abs(e.M_max), Math.abs(e.M_min));
        if (m > maxAcrossAll) maxAcrossAll = m;
      });
      const t = maxAcrossAll > 0 ? mAbs / maxAcrossAll : 0;
      const sw = 2 + t * 6;
      const combo = combinations?.find(c => c.id === env.governingCombinationId);
      const mKnm = fmtNl(mAbs / 1e6);

      // Beam line
      overlays.push(
        <line
          key={`env${beamId}-line`}
          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke={color}
          strokeWidth={sw}
          opacity={0.7}
          strokeLinecap="round"
        />
      );

      // Label — perpendicular offset so it doesn't sit on the line
      const dxs = p2.x - p1.x, dys = p2.y - p1.y;
      const L = Math.hypot(dxs, dys);
      const nx = L > 0 ? -dys / L : 0;
      const ny = L > 0 ?  dxs / L : 0;
      const offset = 20 + sw;
      const lx = midX + nx * offset;
      const ly = midY + ny * offset;
      overlays.push(
        <g key={`env${beamId}-label`}>
          <rect
            x={lx - 72} y={ly - 20}
            width={144} height={36}
            rx={3}
            className="fem-result-label-bg"
          />
          <text x={lx} y={ly - 5} className="fem-force-label"
            style={{ fontWeight: 600, fill: color }}>
            M_max = {mKnm} kNm
          </text>
          {combo && (
            <text x={lx} y={ly + 9} className="fem-force-label" style={{ fontSize: 10 }}>
              {combo.name}
            </text>
          )}
        </g>
      );
    });

    // ── Reactie-extremen bij de opleggingen (min…max over alle combinaties).
    // Componentkeuze volgt de Reactie-subschakelaars (X/Z) in de
    // Resultaten-tab; onder de drempel van 0,05 kN wordt niets getoond.
    if (displayFlags.reactions) {
      const MIN_KN = 0.05;
      const fmtBereik = (min: number, max: number) =>
        `${fmtNl(min / 1000)}…${fmtNl(max / 1000)} kN`;
      envelope.reactions.forEach((r, nodeId) => {
        const n = nodes.find(nn => nn.id === nodeId);
        if (!n) return;
        const p = worldToScreen(n.x, n.z);
        const rijen: string[] = [];
        if (displayFlags.reactieX !== false &&
            Math.max(Math.abs(r.fx_min), Math.abs(r.fx_max)) / 1000 > MIN_KN) {
          rijen.push(`Fx ${fmtBereik(r.fx_min, r.fx_max)}`);
        }
        if (displayFlags.reactieZ !== false &&
            Math.max(Math.abs(r.fz_min), Math.abs(r.fz_max)) / 1000 > MIN_KN) {
          rijen.push(`Fz ${fmtBereik(r.fz_min, r.fz_max)}`);
        }
        if (rijen.length === 0) return;
        const bx = p.x + 22;
        const by = p.y + 40;
        const h = 8 + rijen.length * 15;
        const bw = Math.max(...rijen.map(r2 => r2.length)) * 7.5 + 12;
        overlays.push(
          <g key={`envr${nodeId}`}>
            <rect x={bx - 4} y={by - 12} width={bw} height={h} rx={3}
              className="fem-result-label-bg" />
            {rijen.map((tekst, i) => (
              <text key={i} x={bx} y={by + i * 15} className="fem-reaction-label"
                textAnchor="start">
                {tekst}
              </text>
            ))}
          </g>
        );
      });
    }
    return overlays;
  };

  return (
    <div className="fem-canvas-wrap">
      <svg
        ref={svgRef}
        className="fem-canvas-svg"
        width="100%"
        height="100%"
        style={{ cursor: cursorStyle }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={(e) => {
          // Rechter-muisknop:
          //  - In SELECT-modus met selectie → laat handleMouseDown het
          //    context-menu tonen (geen tool-exit).
          //  - In andere tool-modi → annuleer pending operaties + ga terug
          //    naar Selecteren (Blender / AutoCAD-conventie).
          e.preventDefault();
          if (tool === "select") return;
          setBeamStart(null);
          setPlateCorners([]);
          setPopover(null);
          setTransformAnchor(null);
          onToolChange?.("select");
        }}
      >
        <defs>
          <marker id="fem-load-head" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fem-load-marker-fill" />
          </marker>
        </defs>

        {/* Grid */}
        <g className="fem-grid-layer">{renderGrid()}</g>

        {/* Structural grid (stramien) — amber axis lines bounded by the model
            extents (with padding) + dimension chains between consecutive axes.
            Labels at BOTH ends, and + buttons to add new axes inline. */}
        {structuralGrid?.enabled && (() => {
          // Model bounds — combine nodes + stramien axes so dimensions cover
          // both. Defensive fallback if there are no nodes yet.
          let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
          for (const n of nodes) {
            if (n.x < xMin) xMin = n.x; if (n.x > xMax) xMax = n.x;
            if (n.z < zMin) zMin = n.z; if (n.z > zMax) zMax = n.z;
          }
          for (const ax of structuralGrid.xAxes) {
            if (ax.position < xMin) xMin = ax.position;
            if (ax.position > xMax) xMax = ax.position;
          }
          for (const az of structuralGrid.zAxes) {
            if (az.position < zMin) zMin = az.position;
            if (az.position > zMax) zMax = az.position;
          }
          if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1000; zMin = 0; zMax = 1000; }
          const PAD       = 1500;     // mm  padding around construction
          const LABEL_PAD = 600;      // mm  extra distance from line end to label
          const DIM_PAD   = 1100;     // mm  distance from model to dimension line
          const xLo = xMin - PAD, xHi = xMax + PAD;
          const zLo = zMin - PAD, zHi = zMax + PAD;

          // Sorted copies for dimension chains
          const xSorted = [...structuralGrid.xAxes].sort((a, b) => a.position - b.position);
          const zSorted = [...structuralGrid.zAxes].sort((a, b) => a.position - b.position);

          // Helpers to remove an axis by id (called from the − buttons)
          const removeXAxis = (id: string) => {
            if (!setStructuralGrid) return;
            setStructuralGrid(prev => ({ ...prev, xAxes: prev.xAxes.filter(a => a.id !== id) }));
          };
          const removeZAxis = (id: string) => {
            if (!setStructuralGrid) return;
            setStructuralGrid(prev => ({ ...prev, zAxes: prev.zAxes.filter(a => a.id !== id) }));
          };

          // Helpers to add new axes via the + buttons
          const addXAxis = () => {
            if (!setStructuralGrid) return;
            setStructuralGrid(prev => {
              const used = new Set(prev.xAxes.map(a => a.label));
              let lbl = "";
              for (let k = 0; k < 26; k++) {
                const l = String.fromCharCode(65 + k);
                if (!used.has(l)) { lbl = l; break; }
              }
              const maxPos = prev.xAxes.length ? Math.max(...prev.xAxes.map(a => a.position)) : 0;
              return { ...prev, xAxes: [...prev.xAxes, { id: `x-${Date.now()}`, label: lbl || `X${prev.xAxes.length + 1}`, position: maxPos + 3000 }] };
            });
          };
          // Nieuw NIVEAU: krijgt geen volgnummer maar identificeert zich via
          // zijn peilmaat (het label blijft leeg tot de gebruiker er zelf een
          // naam aan geeft, bv. "verdieping" of "maaiveld").
          const addZAxis = () => {
            if (!setStructuralGrid) return;
            setStructuralGrid(prev => {
              const maxPos = prev.zAxes.length ? Math.max(...prev.zAxes.map(a => a.position)) : 0;
              return { ...prev, zAxes: [...prev.zAxes, { id: `z-${Date.now()}`, label: "", position: maxPos + 3000 }] };
            });
          };

          return (
            <g className="fem-stramien-layer">
              {/* X-axes — vertical lines. Label-bubble ALLEEN bovenin
                  (onderaan zou conflicteren met de horizontale maatlijn). */}
              {structuralGrid.xAxes.map(ax => {
                const pTop = worldToScreen(ax.position, zHi);
                const pBot = worldToScreen(ax.position, zLo);
                const labelTopY = pTop.y - 14;
                return (
                  <g key={`xax${ax.id}`}>
                    <line x1={pTop.x} y1={pTop.y} x2={pBot.x} y2={pBot.y} className="fem-stramien-line" />
                    <circle cx={pTop.x} cy={labelTopY} r={11} className="fem-stramien-bubble" />
                    <text x={pTop.x} y={labelTopY + 4} className="fem-stramien-label">{ax.label}</text>
                    {/* Minus button — verwijder deze X-as */}
                    {setStructuralGrid && (
                      <g
                        transform={`translate(${pTop.x + 18}, ${labelTopY - 11})`}
                        className="fem-stramien-minus"
                        onClick={(e) => { e.stopPropagation(); removeXAxis(ax.id); }}
                      >
                        <title>X-stramien "{ax.label}" verwijderen</title>
                        <circle r={7} />
                        <text y={3}>−</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Z-axes (= LEVELS / NIVEAUS) — horizontale lijnen ZONDER bubble.
                  Alleen de peilmaat-tekst (links + rechts) is leesbaar. Een
                  bubble zou bovenop de balken/kolommen vallen wat verwarrend is. */}
              {structuralGrid.zAxes.map(az => {
                const pL = worldToScreen(xLo, az.position);
                const pR = worldToScreen(xHi, az.position);
                // Horizontale assen zijn NIVEAUS, geen genummerd stramien: ze
                // dragen een peilmaat in bouwkundige notatie (+5,00 m; het
                // nulniveau als ±0,00 m). Een eventueel eigen niveaunaam
                // ("verdieping", "maaiveld") staat ervóór; het automatische
                // volgnummer wordt niet meer getoond.
                const elevText = peilmaatTekst(az.position);
                const eigenNaam = /^\d+$/.test(az.label.trim()) ? "" : az.label.trim();
                const labelTekst = eigenNaam ? `${eigenNaam}  ${elevText}` : elevText;
                return (
                  <g key={`zax${az.id}`}>
                    <line x1={pL.x} y1={pL.y} x2={pR.x} y2={pR.y} className="fem-stramien-line" />
                    {/* Peilmaat-symbool links: het bouwkundige driehoekje op de lijn. */}
                    <polygon
                      points={`${pL.x - 4},${pL.y - 5} ${pL.x + 4},${pL.y - 5} ${pL.x},${pL.y}`}
                      className="fem-peil-driehoek"
                    />
                    <text x={pL.x - 10} y={pL.y + 4} className="fem-stramien-elev fem-stramien-elev-left">
                      {labelTekst}
                    </text>
                    <text x={pR.x + 10} y={pR.y + 4} className="fem-stramien-elev fem-stramien-elev-right">
                      {labelTekst}
                    </text>
                    {/* Minus button — verwijder dit niveau */}
                    {setStructuralGrid && (
                      <g
                        transform={`translate(${pR.x + 96}, ${pR.y})`}
                        className="fem-stramien-minus"
                        onClick={(e) => { e.stopPropagation(); removeZAxis(az.id); }}
                      >
                        <title>Niveau {elevText} verwijderen</title>
                        <circle r={7} />
                        <text y={3}>−</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Dimensions BELOW the model (horizontal distance between consecutive X-axes).
                  Klik op de tekst opent een popover om een nieuwe maat in te voeren — de
                  RECHTER as schuift mee (mét de knopen die erop liggen), de linker blijft
                  op zijn plek (vast referentiepunt).
                  Opmaak: op het snijpunt met de stramienlijn een open cirkeltje (gevuld met
                  de achtergrondkleur, zodat de maatlijn er niet doorheen loopt) en de maat
                  BOVEN de maatlijn. */}
              {xSorted.length > 1 && (() => {
                const dimZ = zLo - DIM_PAD;
                const items: React.ReactNode[] = [];
                for (let i = 0; i < xSorted.length - 1; i++) {
                  const a = xSorted[i], b = xSorted[i + 1];
                  const pa = worldToScreen(a.position, dimZ);
                  const pb = worldToScreen(b.position, dimZ);
                  const midX = (pa.x + pb.x) / 2, midY = pa.y;
                  const labelCY = midY - DIM_LABEL_DY;   // boven de maatlijn
                  const distMm = b.position - a.position;
                  const distM  = distMm / 1000;
                  items.push(
                    <g key={`dimx${i}`}>
                      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="fem-dim-line" pointerEvents="none" />
                      <circle cx={pa.x} cy={pa.y} r={DIM_KNOOP_R} className="fem-dim-knoop" pointerEvents="none" />
                      <circle cx={pb.x} cy={pb.y} r={DIM_KNOOP_R} className="fem-dim-knoop" pointerEvents="none" />
                      <g
                        className="fem-dim-label-group"
                        onClick={(e) => {
                          if (!setStructuralGrid) return;
                          e.stopPropagation();
                          setDimEdit({
                            axis: "x",
                            movingAxisId: b.id,
                            fixedPos: a.position,
                            currentMm: distMm,
                            sx: midX, sy: labelCY,
                            meeschuivendeKnopen: knopenOpStramienAs(nodes, "x", b.position).length,
                          });
                        }}
                      >
                        <rect x={midX - 30} y={labelCY - 9} width={60} height={18} rx={4} className="fem-dim-label-bg" />
                        <text x={midX} y={labelCY} className="fem-dim-text">{distM.toFixed(2)} m</text>
                      </g>
                    </g>
                  );
                }
                return items;
              })()}

              {/* Dimensions RIGHT of the model (vertical distance between consecutive Z-axes).
                  Zelfde opmaak als de horizontale maatvoering: open cirkeltje op het
                  snijpunt met de niveaulijn en de maat NAAST de maatlijn in plaats van
                  eróp. De tekst gaat naar de buitenzijde (rechts van de lijn) — de
                  binnenzijde is bezet door de peilmaten van de niveaus. */}
              {zSorted.length > 1 && (() => {
                const dimX = xHi + DIM_PAD;
                const items: React.ReactNode[] = [];
                for (let i = 0; i < zSorted.length - 1; i++) {
                  const a = zSorted[i], b = zSorted[i + 1];
                  const pa = worldToScreen(dimX, a.position);
                  const pb = worldToScreen(dimX, b.position);
                  const midX = pa.x, midY = (pa.y + pb.y) / 2;
                  const labelCX = midX + DIM_LABEL_DY + 22;  // naast de maatlijn
                  const distMm = b.position - a.position;
                  const distM  = distMm / 1000;
                  items.push(
                    <g key={`dimz${i}`}>
                      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="fem-dim-line" pointerEvents="none" />
                      <circle cx={pa.x} cy={pa.y} r={DIM_KNOOP_R} className="fem-dim-knoop" pointerEvents="none" />
                      <circle cx={pb.x} cy={pb.y} r={DIM_KNOOP_R} className="fem-dim-knoop" pointerEvents="none" />
                      <g
                        className="fem-dim-label-group"
                        onClick={(e) => {
                          if (!setStructuralGrid) return;
                          e.stopPropagation();
                          setDimEdit({
                            axis: "z",
                            movingAxisId: b.id,
                            fixedPos: a.position,
                            currentMm: distMm,
                            sx: labelCX, sy: midY,
                            meeschuivendeKnopen: knopenOpStramienAs(nodes, "z", b.position).length,
                          });
                        }}
                      >
                        <rect x={labelCX - 30} y={midY - 9} width={60} height={18} rx={4} className="fem-dim-label-bg" />
                        <text x={labelCX} y={midY} className="fem-dim-text">{distM.toFixed(2)} m</text>
                      </g>
                    </g>
                  );
                }
                return items;
              })()}

              {/* + buttons for new axes — duidelijk apart in verschillende
                  hoeken zodat je niet per ongeluk de verkeerde aanmaakt.
                  X-stramien-+ : top-right (in lijn met top X-labels)
                  Z-stramien-+ : bottom-right (in lijn met right Z-labels) */}
              {setStructuralGrid && (() => {
                const lastX  = xSorted.length ? xSorted[xSorted.length - 1].position : xMax;
                const firstZ = zSorted.length ? zSorted[0].position                   : zMin;
                // X+ further to the right + bit higher than the bubbles so it
                // doesn't overlap the last label. Z+ goes BELOW the model,
                // putting it in a completely separate corner from X+.
                const plusXTop    = worldToScreen(lastX + LABEL_PAD * 4, zHi);
                const plusZBottom = worldToScreen(xHi, firstZ - LABEL_PAD * 4);
                return (
                  <g>
                    {/* Add X-axis — top-right */}
                    <g
                      transform={`translate(${plusXTop.x}, ${plusXTop.y - 14})`}
                      className="fem-stramien-plus"
                      onClick={addXAxis}
                    >
                      <title>X-stramien toevoegen (verticale lijn)</title>
                      <circle r={11} />
                      <text y={4}>+</text>
                    </g>
                    {/* Add Z-axis — bottom-right */}
                    <g
                      transform={`translate(${plusZBottom.x + 14}, ${plusZBottom.y})`}
                      className="fem-stramien-plus"
                      onClick={addZAxis}
                    >
                      <title>Z-stramien toevoegen (horizontale lijn)</title>
                      <circle r={11} />
                      <text y={4}>+</text>
                    </g>
                  </g>
                );
              })()}
            </g>
          );
        })()}

        {/* Plates BELOW beams (so beam lines render on top) */}
        <g className="fem-plates-layer">
          {plates.map(renderPlate)}
          {/* Spanningscontouren (P3.2): elementvlakken op de gekozen
              component, in dezelfde laag boven de basis-plaatpolygonen maar
              ONDER staven/diagrammen (die verderop renderen) — de
              staafdiagrammen blijven dus onaangetast. pointerEvents none:
              kliks vallen door naar de plaatpolygoon (selectie werkt). */}
          {plaatContourData && (
            <g pointerEvents="none">
              {plaatContourData.platenRes.flatMap(pr =>
                pr.elements.map(el => {
                  const pts = el.corners.map(c => {
                    const p = worldToScreen(c.x, c.z);
                    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
                  }).join(" ");
                  const span = plaatContourData.max - plaatContourData.min;
                  const t = span > 1e-12
                    ? (el[plaatComponent] - plaatContourData.min) / span
                    : 0.5; // uniform veld → middenkleur
                  const toonMesh = displayFlags.plaatMesh !== false;
                  return (
                    <polygon
                      key={`pc${pr.plateId}-${el.elementId}`}
                      points={pts}
                      fill={contourKleur(t)}
                      fillOpacity={0.85}
                      stroke={toonMesh ? "rgba(15, 23, 42, 0.35)" : "none"}
                      strokeWidth={toonMesh ? 0.6 : 0}
                    />
                  );
                })
              )}
            </g>
          )}
        </g>

        {/* Het assenkruis op de wereld-oorsprong is vervangen door de vaste
            assenstelsel-widget linksboven (fem-coord-widget) — één weergave
            i.p.v. twee. */}

        {/* Beams */}
        {beamsWithCoords.map(({ b, p1, p2 }) => {
          const isSel = isBeamInSelection(b.id, selection);
          const isSnap = snapBeam === b.id;
          const selectBeam = (e: React.MouseEvent) => {
            if (tool === "select" && !dragState) {
              e.stopPropagation();
              // Shift-klik: handleMouseDown heeft de staaf al additief aan de
              // selectie toegevoegd (addBeamToSelection); hier niet meer
              // vervangen — anders kon je nooit meerdere staven aanklikken
              // om ze samen met G te verplaatsen.
              if (e.shiftKey) return;
              setSelection({ type: "beam", id: b.id });
            }
          };
          const openBeamProps = (e: React.MouseEvent) => { e.stopPropagation(); setEditingBeamId(b.id); };
          return (
            <g key={`beam${b.id}`}>
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                className={`fem-member${isSel ? " selected" : ""}${isSnap ? " snap" : ""}`}
                onClick={selectBeam}
                onDoubleClick={openBeamProps}
              />
              {/* Onzichtbare brede hit-lijn: de zichtbare staaf is maar een paar
                  pixel dik, waardoor (dubbel)klikken er net naast vaak misten. */}
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="transparent" strokeWidth={12} style={{ cursor: "pointer" }}
                onClick={selectBeam}
                onDoubleClick={openBeamProps}
              />
            </g>
          );
        })}

        {/* Beam preview while drawing */}
        {tool === "addBeam" && beamStart !== null && hoverModel && (() => {
          const startNode = nodes.find(n => n.id === beamStart);
          if (!startNode) return null;
          const p1 = worldToScreen(startNode.x, startNode.z);
          const p2 = worldToScreen(hoverModel.x, hoverModel.z);
          return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="fem-member-preview" />;
        })()}

        {/* Plate preview while drawing — connect plateCorners + hover. Vanaf
            3 hoeken markeert een ring de eerste knoop: dáár klikken sluit de
            polygoon (P4.2). */}
        {tool === "addPlate" && plateCorners.length > 0 && hoverModel && (() => {
          const pts: string[] = [];
          for (const id of plateCorners) {
            const n = nodes.find(nn => nn.id === id);
            if (!n) continue;
            const p = worldToScreen(n.x, n.z);
            pts.push(`${p.x},${p.y}`);
          }
          const hp = worldToScreen(hoverModel.x, hoverModel.z);
          pts.push(`${hp.x},${hp.y}`);
          const eerste = nodes.find(nn => nn.id === plateCorners[0]);
          const ep = eerste ? worldToScreen(eerste.x, eerste.z) : null;
          return (
            <g>
              <polyline points={pts.join(" ")} className="fem-member-preview" />
              {plateCorners.length >= 3 && ep && (
                <circle cx={ep.x} cy={ep.y} r={9} fill="none"
                  stroke="var(--theme-accent)" strokeWidth={2} strokeDasharray="3 2" />
              )}
            </g>
          );
        })()}

        {/* Transform preview — anchor → cursor while in move/copy/rotate/mirror */}
        {transformAnchor && hoverModel && (() => {
          const p1 = worldToScreen(transformAnchor.x, transformAnchor.z);
          const p2 = worldToScreen(hoverModel.x, hoverModel.z);
          return (
            <g className="fem-transform-preview">
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
              <circle cx={p1.x} cy={p1.y} r={4} />
              <circle cx={p2.x} cy={p2.y} r={4} />
            </g>
          );
        })()}

        {/* Loads */}
        <g className="fem-loads-layer">{activeLoads.map(renderLoad)}</g>

        {/* Supports */}
        {supports.map(renderSupport)}

        {/* Nodes */}
        {nodes.map(n => {
          const p = worldToScreen(n.x, n.z);
          const isSnap = snapNode === n.id;
          const isSel = isNodeInSelection(n.id, selection);
          return (
            <g key={`node${n.id}`}>
              {(isSnap || isSel) && (
                <circle cx={p.x} cy={p.y} r={10} className={isSel ? "fem-node-sel-halo" : "fem-node-snap-halo"} />
              )}
              <circle cx={p.x} cy={p.y} r={5} className="fem-node"
                onClick={(e) => {
                  if (tool === "select" && !dragState) {
                    e.stopPropagation();
                    // Shift-klik: additieve selectie is al in handleMouseDown
                    // gemaakt — niet vervangen (zie selectBeam).
                    if (e.shiftKey) return;
                    setSelection({ type: "node", id: n.id });
                  }
                }} />
              <text x={p.x + 8} y={p.y - 8} className="fem-node-label">{n.id}</text>
            </g>
          );
        })}

        {/* Deellast-grepen — in een EIGEN toplaag ná de knopen, zodat een
            greep die op een knoop valt (startFrac 0 / endFrac 1) de muisklik
            wint van de knoop-cirkel eronder. Vierkante grepen op de twee
            uiteinden van de lastband, óp de staafas; slepen past startFrac
            (linkergreep) of endFrac (rechtergreep) aan — zie loadHandleDrag
            in handleMouseMove/handleMouseUp. Alleen bij een geselecteerde
            lijnlast in het actieve lastgeval. */}
        {tool === "select" && showLoads && !resultsMode && selection?.type === "load" && (() => {
          const l = loads.find(ll => ll.id === (selection as { type: "load"; id: number }).id);
          if (!l || l.type !== "lineLoad" || l.beamId === undefined) return null;
          if (l.caseId !== activeLoadCaseId) return null;
          const b = beams.find(bb => bb.id === l.beamId);
          const nA = b ? nodes.find(n => n.id === b.from) : undefined;
          const nB = b ? nodes.find(n => n.id === b.to) : undefined;
          if (!b || !nA || !nB) return null;
          const pA = worldToScreen(nA.x, nA.z), pB = worldToScreen(nB.x, nB.z);
          const dxs = pB.x - pA.x, dys = pB.y - pA.y;
          const storedA = Math.min(1, Math.max(0, l.startFrac ?? 0));
          const storedB = Math.min(1, Math.max(storedA, l.endFrac ?? 1));
          const hd = loadHandleDrag && loadHandleDrag.loadId === l.id ? loadHandleDrag : null;
          const aF = hd ? hd.previewStart : storedA;
          const bF = hd ? hd.previewEnd : storedB;
          // Gestapelde last: de grepen schuiven mee met de lastband, zodat ze
          // op de basislijn van DEZE band blijven zitten (zie qStapel). Het
          // slepen zelf projecteert de muis op de staafas en is dus ongewijzigd.
          const stap = qStapel.get(l.id);
          const sox = stap ? stap.ex * stap.offset : 0;
          const soy = stap ? stap.ey * stap.offset : 0;
          const HS = 4.5; // halve zijde van de greep (px)
          return (
            <g className="fem-loadhandles-layer">
              {([
                { end: "start" as const, fr: aF },
                { end: "end" as const, fr: bF },
              ]).map(({ end, fr }) => (
                <rect
                  key={`lh-${end}`}
                  x={pA.x + dxs * fr + sox - HS} y={pA.y + dys * fr + soy - HS}
                  width={HS * 2} height={HS * 2}
                  fill="#ffffff" stroke="rgba(220, 38, 38, 1)" strokeWidth={1.5}
                  style={{ cursor: loadHandleDrag ? "grabbing" : "grab", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    // stopPropagation: geen box-select of knoop-/staaf-drag
                    // starten; klik en dubbelklik op staaf en last buiten de
                    // grepen blijven gewoon werken.
                    e.stopPropagation();
                    e.preventDefault();
                    setLoadHandleDrag({
                      loadId: l.id, beamId: b.id, end,
                      previewStart: aF, previewEnd: bF, moved: false,
                    });
                  }}
                />
              ))}
            </g>
          );
        })()}

        {/* Drag ghost preview — translucent dots/lines for nodes being moved */}
        {dragState && (() => {
          const ghosts: React.ReactNode[] = [];
          const movedNodeIds = new Set(dragState.nodeIds);
          for (const id of dragState.nodeIds) {
            const orig = dragState.originPositions.get(id);
            if (!orig) continue;
            const newX = orig.x + dragState.currentDelta.dx;
            const newZ = orig.z + dragState.currentDelta.dz;
            const p = worldToScreen(newX, newZ);
            ghosts.push(<circle key={`gh${id}`} cx={p.x} cy={p.y} r={5}
              className="fem-node-ghost" />);
          }
          // Ghost beams. Twee gevallen:
          //  - beide uiteinden bewegen mee → starre translatie van de staaf;
          //  - één uiteinde beweegt → de staaf "rekt" mee: ghost van het
          //    vaste uiteinde naar de nieuwe positie, zodat je tijdens het
          //    slepen direct ziet hoe de aangesloten staven meegaan.
          const previewPos = (id: number): { x: number; y: number } | null => {
            const orig = dragState.originPositions.get(id);
            if (orig) {
              return worldToScreen(orig.x + dragState.currentDelta.dx, orig.z + dragState.currentDelta.dz);
            }
            const n = nodes.find(nn => nn.id === id);
            return n ? worldToScreen(n.x, n.z) : null;
          };
          for (const b of beams) {
            const fromMoves = movedNodeIds.has(b.from);
            const toMoves = movedNodeIds.has(b.to);
            if (!fromMoves && !toMoves) continue;
            const pa = previewPos(b.from);
            const pb = previewPos(b.to);
            if (!pa || !pb) continue;
            ghosts.push(<line key={`ghb${b.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              className="fem-member-ghost" />);
          }
          return <g pointerEvents="none">{ghosts}</g>;
        })()}

        {/* Grab-mode ghost preview */}
        {grabMode && (() => {
          let dx = 0, dz = 0;
          if (grabMode.typedDistance !== null) {
            const v = parseFloat(grabMode.typedDistance);
            if (!isNaN(v)) {
              if (grabMode.axisLock === "z") dz = v;
              else dx = v;
            }
          } else {
            dx = grabMode.cursorModel.x - grabMode.cursorStartModel.x;
            dz = grabMode.cursorModel.z - grabMode.cursorStartModel.z;
            if (grabMode.axisLock === "x") dz = 0;
            if (grabMode.axisLock === "z") dx = 0;
          }
          const ghosts: React.ReactNode[] = [];
          const movedNodeIds = new Set(grabMode.nodeIds);
          for (const id of grabMode.nodeIds) {
            const orig = grabMode.originPositions.get(id);
            if (!orig) continue;
            const p = worldToScreen(orig.x + dx, orig.z + dz);
            ghosts.push(<circle key={`grab${id}`} cx={p.x} cy={p.y} r={5} className="fem-node-ghost" />);
          }
          // Zelfde stretch-preview als bij muisverslepen: staven met één
          // meebewegend uiteinde rekken zichtbaar mee.
          const grabPos = (id: number): { x: number; y: number } | null => {
            const orig = grabMode.originPositions.get(id);
            if (orig) return worldToScreen(orig.x + dx, orig.z + dz);
            const n = nodes.find(nn => nn.id === id);
            return n ? worldToScreen(n.x, n.z) : null;
          };
          for (const b of beams) {
            if (!movedNodeIds.has(b.from) && !movedNodeIds.has(b.to)) continue;
            const pa = grabPos(b.from);
            const pb = grabPos(b.to);
            if (!pa || !pb) continue;
            ghosts.push(<line key={`grabb${b.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              className="fem-member-ghost" />);
          }
          // Axis lock visual: dotted line through centroid in the lock direction
          if (grabMode.axisLock) {
            const c = worldToScreen(grabMode.centroidModel.x, grabMode.centroidModel.z);
            if (grabMode.axisLock === "x") {
              ghosts.push(<line key="lkx" x1={0} y1={c.y} x2={size.w} y2={c.y} className="fem-axis-lock" />);
            } else {
              ghosts.push(<line key="lkz" x1={c.x} y1={0} x2={c.x} y2={size.h} className="fem-axis-lock" />);
            }
          }
          return <g pointerEvents="none">{ghosts}</g>;
        })()}

        {/* Box-select rubber-band */}
        {boxSelect && (() => {
          const x = Math.min(boxSelect.startSX, boxSelect.endSX);
          const y = Math.min(boxSelect.startSY, boxSelect.endSY);
          const w = Math.abs(boxSelect.endSX - boxSelect.startSX);
          const h = Math.abs(boxSelect.endSY - boxSelect.startSY);
          return (
            <rect x={x} y={y} width={w} height={h} className="fem-box-select" pointerEvents="none" />
          );
        })()}

        {/* Hover cross */}
        {tool !== "select" && hoverModel && (() => {
          const p = worldToScreen(hoverModel.x, hoverModel.z);
          return (
            <g className="fem-hover-cross">
              <line x1={p.x - 6} y1={p.y} x2={p.x + 6} y2={p.y} />
              <line x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y + 6} />
              <circle cx={p.x} cy={p.y} r={3} />
            </g>
          );
        })()}

        {/* Support tool preview — een ghost van het oplegging-symbool hangt
            aan de muis zodat je ziet wat je gaat plaatsen voordat je klikt. */}
        {hoverModel && (() => {
          const supportTypeMap: Record<string, SupportType> = {
            addPinned:    "pinned",
            addFixed:     "fixed",
            addXRoller:   "xRoller",
            addZRoller:   "zRoller",
            addZSpring:   "zSpring",
            addXSpring:   "xSpring",
            addRotSpring: "rotSpring",
          };
          const previewType = supportTypeMap[tool];
          if (!previewType) return null;
          const p = worldToScreen(hoverModel.x, hoverModel.z);
          // Render the actual support symbol shapes with translucent style.
          // Mirrors renderSupport(s) but uses screen coords directly.
          let shape: React.ReactNode = null;
          if (previewType === "pinned") {
            shape = (<>
              <polygon points={`${p.x},${p.y} ${p.x - 12},${p.y + 20} ${p.x + 12},${p.y + 20}`} className="fem-support" />
              <line x1={p.x - 16} y1={p.y + 25} x2={p.x + 16} y2={p.y + 25} className="fem-support-ground" />
            </>);
          } else if (previewType === "fixed") {
            // Zelfde vorm als renderSupport: inklemlijn direct op de knoop
            // met arcering eronder.
            shape = (<>
              <line x1={p.x - 15} y1={p.y} x2={p.x + 15} y2={p.y} className="fem-support-vast" />
              {Array.from({ length: 7 }, (_, i) => {
                const x = p.x - 15 + (i * 30) / 6;
                return <line key={`pfa${i}`} x1={x} y1={p.y} x2={x - 5} y2={p.y + 7} className="fem-support-ground" />;
              })}
            </>);
          } else if (previewType === "xRoller") {
            shape = (<>
              <polygon points={`${p.x},${p.y} ${p.x - 20},${p.y - 12} ${p.x - 20},${p.y + 12}`} className="fem-support" />
              <line x1={p.x - 25} y1={p.y - 16} x2={p.x - 25} y2={p.y + 16} className="fem-support-ground" />
            </>);
          } else if (previewType === "zRoller") {
            shape = (<>
              <polygon points={`${p.x},${p.y} ${p.x - 12},${p.y + 20} ${p.x + 12},${p.y + 20}`} className="fem-support" />
              <circle cx={p.x - 6} cy={p.y + 22} r={2.5} className="fem-support" />
              <circle cx={p.x + 6} cy={p.y + 22} r={2.5} className="fem-support" />
              <line x1={p.x - 16} y1={p.y + 27} x2={p.x + 16} y2={p.y + 27} className="fem-support-ground" />
            </>);
          } else if (previewType === "zSpring") {
            const top = p.y + 6, bot = p.y + 28;
            const xs = [p.x, p.x - 6, p.x + 6, p.x - 6, p.x + 6, p.x];
            const ys = [top, top + 4, top + 8, top + 12, top + 16, bot];
            const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
            shape = (<>
              <polyline points={pts} className="fem-spring" />
              <line x1={p.x - 16} y1={p.y + 32} x2={p.x + 16} y2={p.y + 32} className="fem-support-ground" />
            </>);
          } else if (previewType === "xSpring") {
            const left = p.x - 28, right = p.x - 6;
            const ys = [p.y - 6, p.y - 2, p.y + 2, p.y - 2, p.y + 2, p.y];
            const xs = [left, left + 4, left + 8, left + 12, left + 16, right];
            const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
            shape = (<>
              <polyline points={pts} className="fem-spring" />
              <line x1={p.x - 32} y1={p.y - 12} x2={p.x - 32} y2={p.y + 12} className="fem-support-ground" />
            </>);
          } else if (previewType === "rotSpring") {
            // Zelfde vorm als renderSupport: spiraalveer tussen knoop en
            // ingeklemde grondlijn.
            const grondY = p.y + 26;
            const rMax = 9.5;
            const pts: string[] = [];
            for (let i = 0; i <= 54; i++) {
              const t = i / 54;
              const hoek = t * 2.25 * 2 * Math.PI;
              const r = t * rMax;
              pts.push(`${(p.x + r * Math.sin(hoek)).toFixed(2)},${(p.y + 12 - r * Math.cos(hoek)).toFixed(2)}`);
            }
            shape = (<>
              <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + 12 - rMax} className="fem-spring" />
              <polyline points={pts.join(" ")} fill="none" className="fem-spring" />
              <line
                x1={p.x + rMax * Math.sin(2.25 * 2 * Math.PI)}
                y1={p.y + 12 - rMax * Math.cos(2.25 * 2 * Math.PI)}
                x2={p.x} y2={grondY} className="fem-spring"
              />
              <line x1={p.x - 15} y1={grondY} x2={p.x + 15} y2={grondY} className="fem-support-vast" />
              {Array.from({ length: 7 }, (_, i) => {
                const x = p.x - 15 + (i * 30) / 6;
                return <line key={`pra${i}`} x1={x} y1={grondY} x2={x - 5} y2={grondY + 7} className="fem-support-ground" />;
              })}
            </>);
          }
          return (
            <g className="fem-support-preview" pointerEvents="none" opacity={0.55}>
              {shape}
            </g>
          );
        })()}

        {/* Solver results overlay — single LC OR active combination.
            In Model-view (showLoads=false) onderdrukken we ALLE resultaten
            (vervormde stand, M/V/N, reacties) zodat alleen het structurele
            model zichtbaar is. */}
        {showLoads && overlayResult && (
          <FemResultsOverlay
            nodes={nodes}
            beams={beams}
            supports={supports}
            result={overlayResult}
            worldToScreen={worldToScreen}
            canvasW={size.w}
            canvasH={size.h}
            displayFlags={displayFlags}
            loads={loads}
            activeLoadCaseId={activeLoadCaseId}
          />
        )}

        {/* Envelope overlay (color-coded beams + governing combo labels) —
            ook onderdrukt in Model-view. */}
        {showLoads && (
          <g className="fem-envelope-overlay" pointerEvents="none">
            {renderEnvelopeOverlay()}
          </g>
        )}

        {/* Unity-check-badges (Resultaten-tab, rij "Unity check"): per staaf
            met toetsresultaat de maatgevende UC op het staafmidden. Groen
            ≤ 1,0, rood > 1,0; klik opent het toetsingspaneel voor die staaf. */}
        {showLoads && displayFlags.uc === true && checkResults.length > 0 && (
          <g className="fem-uc-layer">
            {checkResults.map(r => {
              const b = beams.find(bb => bb.id === r.beam_id);
              const nA = b ? nodes.find(n => n.id === b.from) : undefined;
              const nB = b ? nodes.find(n => n.id === b.to) : undefined;
              if (!b || !nA || !nB) return null;
              const p1 = worldToScreen(nA.x, nA.z);
              const p2 = worldToScreen(nB.x, nB.z);
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              const ok = r.uc_max <= 1.0;
              const tekst = `UC ${fmtNl(r.uc_max, 2)}`;
              const bw = tekst.length * 7.5 + 16;
              return (
                <g
                  key={`ucb${r.beam_id}`}
                  className="fem-uc-badge"
                  style={{ pointerEvents: "auto" }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCheckForBeam?.(r.beam_id);
                  }}
                >
                  <title>{`Staaf ${r.beam_id}: maatgevend ${r.governing_check_id} — klik voor de toetsing`}</title>
                  <rect
                    x={mx - bw / 2} y={my - 11} width={bw} height={22} rx={11}
                    fill={ok ? "#16a34a" : "#dc2626"}
                  />
                  <text x={mx} y={my + 4} className="fem-uc-badge-text">{tekst}</text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* HUDs */}
      <div className="fem-hud fem-hud-tl">
        <div className="fem-hud-card">
          <span className="fem-hud-muted">Tool:</span>
          <span className="fem-hud-strong">{toolLabel(tool)}</span>
          {tool === "addBeam" && beamStart !== null && (
            <span className="fem-hud-muted">— klik tweede knoop</span>
          )}
          {tool === "addPlate" && plateCorners.length > 0 && (
            <span className="fem-hud-muted">
              — {plateCorners.length} {plateCorners.length === 1 ? "hoek" : "hoeken"}
              {plateCorners.length >= 3
                ? " · klik de eerste knoop om te sluiten · Esc annuleert"
                : " · klik de volgende hoek · Esc annuleert"}
            </span>
          )}
          {(tool === "move" || tool === "copy" || tool === "rotate" || tool === "mirror") && !selection && (
            <span className="fem-hud-muted">— selecteer eerst een knoop/balk</span>
          )}
          {(tool === "move" || tool === "copy" || tool === "rotate" || tool === "mirror") && selection && transformAnchor === null && (
            <span className="fem-hud-muted">— klik ankerpunt</span>
          )}
          {(tool === "move" || tool === "copy" || tool === "rotate" || tool === "mirror") && transformAnchor !== null && (
            <span className="fem-hud-muted">— klik doelpunt</span>
          )}
          {spaceHeld && <span className="fem-hud-muted">— [pan]</span>}
        </div>
        {/* Assenstelsel-widget: +X (rechts), +Z (omhoog) en een boogpijl om de
            y-as die de positieve My-richting toont — zelfde draairichting als
            een positief puntmoment op het canvas (sweep 1). */}
        <div
          className="fem-hud-card fem-coord-widget"
          style={{ marginTop: 6, padding: 6 }}
          title="Assenstelsel: +X naar rechts, +Z omhoog; de boogpijl toont de positieve My-richting (om de y-as)"
        >
          <svg width="84" height="72" viewBox="0 0 84 72" aria-label="Assenstelsel">
            <defs>
              <marker id="fem-coord-head-x" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--theme-accent)" />
              </marker>
              <marker id="fem-coord-head-z" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
              </marker>
              <marker id="fem-coord-head-my" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
              </marker>
            </defs>
            {/* My+ boogpijl om de oorsprong (y-as staat loodrecht op het scherm) */}
            <path
              d="M 39 41 A 13 13 0 1 1 13 41"
              fill="none" stroke="#2563eb" strokeWidth={1.8}
              markerEnd="url(#fem-coord-head-my)"
            />
            <text x={26} y={69} fontSize={10} fontWeight={600} fill="#2563eb" textAnchor="middle">My+</text>
            {/* +X-pijl (horizontaal, naar rechts) */}
            <line x1={26} y1={41} x2={70} y2={41} stroke="var(--theme-accent)" strokeWidth={2}
              markerEnd="url(#fem-coord-head-x)" />
            <text x={64} y={34} fontSize={10} fontWeight={600} fill="var(--theme-accent)">+X</text>
            {/* +Z-pijl (verticaal, omhoog) */}
            <line x1={26} y1={41} x2={26} y2={8} stroke="#06b6d4" strokeWidth={2}
              markerEnd="url(#fem-coord-head-z)" />
            <text x={32} y={14} fontSize={10} fontWeight={600} fill="#06b6d4">+Z</text>
            {/* Oorsprong */}
            <circle cx={26} cy={41} r={2.5} fill="var(--theme-accent)" />
          </svg>
        </div>
      </div>
      <div className="fem-hud fem-hud-tr">
        <div className="fem-hud-card fem-hud-mono">
          <span>{nodes.length} knopen · {beams.length} balken{plates.length ? ` · ${plates.length} platen` : ""}</span>
        </div>
        <div className="fem-hud-card fem-hud-mono" style={{ marginTop: 6 }}>
          <span>{zoomPct}%</span>
          <button className="fem-hud-btn" onClick={resetView} title="Reset zoom (F = fit)">Reset</button>
        </div>
        {/* De assenstelsel-widget staat nu linksboven (één weergave). */}
      </div>
      <div className="fem-hud fem-hud-bl">
        <div className="fem-hud-card fem-hud-mono">
          {hoverModel
            ? <span>({(hoverModel.x / 1000).toFixed(2)}, {(hoverModel.z / 1000).toFixed(2)}) m</span>
            : <span>(——, ——) m</span>}
        </div>
      </div>
      <div className="fem-hud fem-hud-br">
        <div className="fem-hud-card">
          <span className="fem-hud-muted">Snap:</span>
          <button
            className="fem-hud-btn"
            onClick={() => setSnapAan(v => !v)}
            title={snapAan
              ? `Snap aan raster (${grid.spacingMm} mm) en stramien — klik om uit te zetten`
              : "Snap staat uit (vrij tekenen) — klik om aan te zetten"}
            style={snapAan ? undefined : { opacity: 0.6 }}
          >
            {snapAan ? `${grid.spacingMm} mm` : "uit"}
          </button>
        </div>
      </div>

      {/* Kleurenlegenda plaatcontouren (P3.2) — min/max uit de
          plateElements-ranges van het getoonde resultaat; de gradient-balk
          gebruikt dezelfde kleurstops als de elementvlakken. */}
      {plaatContourData && (
        <div className="fem-hud" style={{ left: 12, top: "50%", transform: "translateY(-50%)" }}>
          <div
            className="fem-hud-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 10px" }}
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>
              {PLAAT_COMPONENTEN[plaatComponent].label}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              <div style={{
                width: 14, height: 120, borderRadius: 2,
                background: CONTOUR_GRADIENT_CSS,
              }} />
              <div
                className="fem-hud-mono"
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 10 }}
              >
                <span>{fmtLegenda(plaatContourData.max)}</span>
                <span>{fmtLegenda((plaatContourData.min + plaatContourData.max) / 2)}</span>
                <span>{fmtLegenda(plaatContourData.min)}</span>
              </div>
            </div>
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              {PLAAT_COMPONENTEN[plaatComponent].eenheid}
            </span>
          </div>
        </div>
      )}

      {(bannerText || solveError) && (
        <div className="fem-hud fem-hud-tc">
          <div className={`fem-hud-card ${solveError ? "fem-hud-error" : "fem-hud-success"}`}>
            {solveError ? (
              <span>Solver: {solveError}</span>
            ) : bannerText ? (
              <span className="fem-hud-strong fem-hud-mono">{bannerText.text}</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Toggle-chips voor weergave staan nu uitsluitend in de Resultaten-tab
          van de sidebar (FemProjectTree). De floating bottom-center HUD is
          bewust verwijderd om dubbele controls te voorkomen. */}

      {/* Popover for support/load setup */}
      {popover && (
        <InlinePopover
          x={popover.sx}
          y={popover.sy}
          onClose={() => setPopover(null)}
        >
          {renderPopoverContent(popover, {
            onAddSupport: (type, k) => {
              if (popover.nodeId !== undefined) addSupport(popover.nodeId, type, k);
              setPopover(null);
            },
            onAddLoad: (l) => {
              addLoad({ ...l, caseId: activeLoadCaseId });
              setPopover(null);
            },
          })}
        </InlinePopover>
      )}

      {/* Grab-mode HUD chip (Blender-style move feedback) */}
      {grabMode && (() => {
        let dx = 0, dz = 0;
        if (grabMode.typedDistance !== null) {
          const v = parseFloat(grabMode.typedDistance);
          if (!isNaN(v)) {
            if (grabMode.axisLock === "z") dz = v;
            else dx = v;
          }
        } else {
          dx = grabMode.cursorModel.x - grabMode.cursorStartModel.x;
          dz = grabMode.cursorModel.z - grabMode.cursorStartModel.z;
          if (grabMode.axisLock === "x") dz = 0;
          if (grabMode.axisLock === "z") dx = 0;
        }
        const lock = grabMode.axisLock ? ` [${grabMode.axisLock.toUpperCase()}-as]` : "";
        const typed = grabMode.typedDistance ? `  ⌨ ${grabMode.typedDistance}` : "";
        return (
          <div className="fem-hud fem-hud-tc" style={{ top: 38 }}>
            <div className="fem-hud-card" style={{ background: "var(--theme-accent)", color: "var(--theme-bg)", fontWeight: 600 }}>
              <span>Move: ΔX = {Math.round(dx)} mm, ΔZ = {Math.round(dz)} mm{lock}{typed}</span>
            </div>
          </div>
        );
      })()}

      {/* Rotate-mode HUD chip */}
      {rotateMode && (
        <div className="fem-hud fem-hud-tc" style={{ top: 38 }}>
          <div className="fem-hud-card" style={{ background: "var(--theme-accent)", color: "var(--theme-bg)", fontWeight: 600 }}>
            <span>Rotate: {(rotateMode.deltaRad * 180 / Math.PI).toFixed(1)}°{rotateMode.snap ? " [snap 15°]" : " [vrij]"}</span>
          </div>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && selection && (
        <div
          className="fem-context-menu"
          style={{ left: contextMenu.sx, top: contextMenu.sy }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button onClick={() => {
            setContextMenu(null);
            if (selection?.type === "beam") setEditingBeamId(selection.id);
          }}>
            Bewerk eigenschappen
          </button>
          <button onClick={() => {
            setContextMenu(null);
            // copySelection is multi-bewust; kleine offset zodat de kopie zichtbaar is.
            if (selection && !copySelection(selection, 500, 0)) {
              notifyWarning("Niets te dupliceren",
                "De selectie bevat geen knopen, staven of platen.");
            }
          }}>
            Dupliceer
          </button>
          <button onClick={() => { setContextMenu(null); deleteSelected(); }} style={{ color: "#e94560" }}>
            Verwijder
          </button>
        </div>
      )}

      {/* Maatlijn-edit popover — opent als je op een maat-label klikt. Vul de
          nieuwe afstand in m in. De bewegende as schuift mee, de referentie-as
          blijft op zijn plek, en de knopen ÓP de bewegende as schuiven mee
          zodat staven en lasten aan het stramien vast blijven zitten. */}
      {dimEdit && setStructuralGrid && (
        <InlinePopover x={dimEdit.sx} y={dimEdit.sy} onClose={() => setDimEdit(null)}>
          <DimEditForm
            axis={dimEdit.axis}
            currentMm={dimEdit.currentMm}
            /* Aantal knopen dat mee gaat schuiven — puur informatief in de
               popover, zodat de gebruiker vooraf ziet wat er gebeurt. */
            meeschuivendeKnopen={dimEdit.meeschuivendeKnopen}
            onSubmit={(newMm) => {
              const newPos = dimEdit.fixedPos + newMm;
              if (verplaatsStramienAs) {
                // Voorkeurspad: as + knopen in één undo-stap (store-mutator).
                verplaatsStramienAs(dimEdit.axis, dimEdit.movingAxisId, newPos);
              } else {
                // Fallback wanneer de mutator niet is doorgegeven (standalone
                // gebruik van het canvas): alleen de as verschuiven.
                setStructuralGrid(prev => ({
                  ...prev,
                  xAxes: dimEdit.axis === "x"
                    ? prev.xAxes.map(a => a.id === dimEdit.movingAxisId ? { ...a, position: newPos } : a)
                    : prev.xAxes,
                  zAxes: dimEdit.axis === "z"
                    ? prev.zAxes.map(a => a.id === dimEdit.movingAxisId ? { ...a, position: newPos } : a)
                    : prev.zAxes,
                }));
              }
              setDimEdit(null);
            }}
            onCancel={() => setDimEdit(null)}
          />
        </InlinePopover>
      )}

      {/* Beam properties dialog — opened by double-click on a beam, or via
          the right-click context-menu "Bewerk eigenschappen" action. */}
      {editingBeamId !== null && (() => {
        const beam = beams.find(b => b.id === editingBeamId);
        if (!beam) return null;
        const beamForces = overlayResult?.elements.get(editingBeamId) ?? null;
        return (
          <BarPropertiesDialog
            beam={beam}
            nodes={nodes}
            beamForces={beamForces}
            onUpdate={(updates) => updateBeam?.(beam.id, updates)}
            onClose={() => setEditingBeamId(null)}
          />
        );
      })()}
    </div>
  );

  /** Tiny inline form factory. Kept inside the component so it can use callbacks. */
  function renderPopoverContent(
    p: NonNullable<typeof popover>,
    cbs: {
      onAddSupport: (type: SupportType, k?: number) => void;
      onAddLoad: (l: Omit<Load, "id" | "caseId">) => void;
    },
  ) {
    if (p.kind === "zSpring" || p.kind === "xSpring" || p.kind === "rotSpring") {
      const supportType: SupportType =
        p.kind === "zSpring" ? "zSpring" :
        p.kind === "xSpring" ? "xSpring" : "rotSpring";
      const label = p.kind === "rotSpring" ? "kθ (kNm/rad)" : "k (kN/mm)";
      return <PopoverSingleNumberForm
        title={p.kind === "rotSpring" ? "Rot-veer toevoegen" : "Veer toevoegen"}
        label={label}
        defaultValue={10}
        onSubmit={(v) => cbs.onAddSupport(supportType, v)}
      />;
    }
    if (p.kind === "pointLoad" || p.kind === "pointLoadH") {
      // Twee aangrijpingsvormen: op een KNOOP (p.nodeId) of op een vrije
      // positie op een STAAF (p.beamId + p.posFrac). In het tweede geval
      // toont het formulier ook een positieveld in m vanaf de startknoop.
      // Horizontale variant: Fx voor-ingevuld (+10 = naar rechts), Fz = 0.
      const opStaaf = p.nodeId === undefined && p.beamId !== undefined;
      const beam = opStaaf ? beams.find(b => b.id === p.beamId) : undefined;
      const nA = beam ? nodes.find(n => n.id === beam.from) : undefined;
      const nB = beam ? nodes.find(n => n.id === beam.to) : undefined;
      const lenM = nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) / 1000 : 0;
      return <PopoverPointLoadForm
        horizontal={p.kind === "pointLoadH"}
        beamLenM={opStaaf ? lenM : undefined}
        defaultPosM={opStaaf ? (p.posFrac ?? 0) * lenM : undefined}
        onSubmit={(fx, fz, posFrac) => cbs.onAddLoad(
          opStaaf
            ? { type: "pointForce", beamId: p.beamId, posFrac: posFrac ?? p.posFrac ?? 0, fx, fz }
            : { type: "pointForce", nodeId: p.nodeId, fx, fz },
        )}
      />;
    }
    if (p.kind === "moment") {
      return <PopoverSingleNumberForm
        title="Moment toevoegen" label="My (kNm)" defaultValue={5}
        onSubmit={(my) => cbs.onAddLoad({ type: "pointMoment", nodeId: p.nodeId, my })}
      />;
    }
    if (p.kind === "lineLoad") {
      // Staaflengte (m) voor de begin/eind-invoer van een deellast.
      const beam = beams.find(b => b.id === p.beamId);
      const nA = beam ? nodes.find(n => n.id === beam.from) : undefined;
      const nB = beam ? nodes.find(n => n.id === beam.to) : undefined;
      const lenM = nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) / 1000 : 0;
      return <PopoverLineLoadForm
        beamLenM={lenM}
        onSubmit={(q, qDir, startFrac, endFrac) =>
          cbs.onAddLoad({ type: "lineLoad", beamId: p.beamId, q, qDir, startFrac, endFrac })}
      />;
    }
    if (p.kind === "thermal") {
      return <PopoverSingleNumberForm
        title="Temperatuurlast" label="ΔT (K)" defaultValue={20}
        onSubmit={(deltaT) => cbs.onAddLoad({ type: "thermal", beamId: p.beamId, deltaT })}
      />;
    }
    if (p.kind === "edgeLoad" && p.plateId !== undefined) {
      // Randlast op een plaatrand (P3.3/P4.3): p in kN/m langs de rand,
      // richting in globale assen — zelfde tekenconventie als lijnlasten.
      // Polygonranden gaan via de rand-index (`edgeIndex`), benoemde randen
      // blijven het rechthoekpad.
      return <PopoverEdgeLoadForm
        randLabel={p.edgeIndex !== undefined
          ? `rand ${p.edgeIndex + 1}`
          : RAND_LABEL[p.edge ?? "top"]}
        onSubmit={(pWaarde, dir) => cbs.onAddLoad(
          p.edgeIndex !== undefined
            ? { type: "edgeLoad", plateId: p.plateId, edgeIndex: p.edgeIndex, q: pWaarde, qDir: dir }
            : { type: "edgeLoad", plateId: p.plateId, edge: p.edge ?? "top", q: pWaarde, qDir: dir },
        )}
      />;
    }
    return null;
  }
}

function toolLabel(t: Tool): string {
  switch (t) {
    case "select":     return "Selecteren";
    case "addNode":    return "Knoop";
    case "addBeam":    return "Balk";
    case "addSubNode": return "Subknoop";
    case "addPlate":   return "Plaat";
    case "addPinned":  return "Scharnier";
    case "addFixed":   return "Inklemming";
    case "addXRoller": return "X-Rol";
    case "addZRoller": return "Z-Rol";
    case "addZSpring": return "Z-Veer";
    case "addXSpring": return "X-Veer";
    case "addRotSpring": return "Rot-Veer";
    case "addPointLoad": return "Puntlast (V)";
    case "addPointLoadH": return "Puntlast (H)";
    case "addMoment":  return "Moment";
    case "addLineLoad": return "Lijnlast";
    case "addThermal": return "Temperatuur";
    case "move":       return "Verplaatsen";
    case "copy":       return "Kopiëren";
    case "rotate":     return "Roteren";
    case "mirror":     return "Spiegelen";
  }
}

// ── Popover forms ─────────────────────────────────────────────────────────

/** Form to enter a new distance for a clicked dimension line.
 *  Input is in METERS (matches the on-canvas label format), commit converts
 *  to mm and forwards to the parent which updates the moving axis position.
 *  De knopen die OP de bewegende as liggen schuiven mee; het aantal staat als
 *  hint in de popover zodat de gebruiker vooraf weet wat er meebeweegt. */
function DimEditForm({ axis, currentMm, meeschuivendeKnopen = 0, onSubmit, onCancel }: {
  axis: "x" | "z";
  currentMm: number;
  meeschuivendeKnopen?: number;
  onSubmit: (newMm: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState((currentMm / 1000).toFixed(2));
  const commit = () => {
    const m = parseFloat(val);
    if (!Number.isFinite(m) || m <= 0) return;
    onSubmit(Math.round(m * 1000));
  };
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">
        Maat {axis === "x" ? "X-stramien" : "Z-niveau"} bewerken
      </div>
      <label className="fem-popover-row">
        <span>Afstand (m)</span>
        <input
          type="number" step="0.1" min="0.01" value={val} autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") onCancel();
          }}
          onFocus={e => e.target.select()}
        />
      </label>
      <div className="fem-popover-hint">
        {meeschuivendeKnopen > 0
          ? (meeschuivendeKnopen === 1
            ? `1 knoop op ${axis === "x" ? "deze as" : "dit niveau"} schuift mee.`
            : `${meeschuivendeKnopen} knopen op ${axis === "x" ? "deze as" : "dit niveau"} schuiven mee.`)
          : `Geen knopen op ${axis === "x" ? "deze as" : "dit niveau"} — alleen de `
            + `${axis === "x" ? "stramienlijn" : "niveaulijn"} verschuift.`}
      </div>
      <div className="fem-popover-actions">
        <button onClick={onCancel}>Annuleer</button>
        <button onClick={commit} className="fem-popover-primary">OK</button>
      </div>
    </div>
  );
}

function PopoverSingleNumberForm({ title, label, defaultValue, onSubmit }:
  { title: string; label: string; defaultValue: number; onSubmit: (v: number) => void }) {
  const [val, setVal] = useState(String(defaultValue));
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">{title}</div>
      <label className="fem-popover-row">
        <span>{label}</span>
        <input
          type="number" step="0.1" value={val} onChange={e => setVal(e.target.value)}
          autoFocus onKeyDown={e => { if (e.key === "Enter") onSubmit(Number(val) || 0); }}
        />
      </label>
      <div className="fem-popover-actions">
        <button onClick={() => onSubmit(Number(val) || 0)} className="fem-popover-primary">OK</button>
      </div>
    </div>
  );
}

function PopoverLineLoadForm({ beamLenM, onSubmit }: {
  /** Staaflengte in m — begrenst de begin/eind-invoer van een deellast. */
  beamLenM: number;
  /** startFrac/endFrac zijn undefined bij volle lengte (default-gedrag). */
  onSubmit: (q: number, qDir: "x" | "z", startFrac?: number, endFrac?: number) => void;
}) {
  const [q, setQ]     = useState("-5");
  const [dir, setDir] = useState<"x" | "z">("z");
  // Deellast-invoer in m VANAF DE STARTKNOOP (zelfde eenheid als de
  // maatvoering elders in de UI); intern omgerekend naar fracties 0..1.
  const [beginM, setBeginM] = useState("0");
  const [endM, setEndM]     = useState(beamLenM > 0 ? beamLenM.toFixed(2) : "0");
  const b0 = Number(beginM), b1 = Number(endM);
  const rangeValid = beamLenM > 0
    && Number.isFinite(b0) && Number.isFinite(b1)
    && b0 >= 0 && b0 < b1 && b1 <= beamLenM + 1e-9;
  const commit = () => {
    if (!rangeValid) return;
    const aF = b0 / beamLenM;
    const bF = Math.min(1, b1 / beamLenM);
    const isFull = aF <= 0 && bF >= 1;
    onSubmit(Number(q) || 0, dir,
      isFull ? undefined : aF,
      isFull ? undefined : bF);
  };
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">Lijnlast toevoegen</div>
      <label className="fem-popover-row">
        <span>Richting</span>
        <select value={dir} onChange={e => setDir(e.target.value as "x" | "z")}>
          <option value="z">Verticaal (+Z, gravitatie)</option>
          <option value="x">Horizontaal (+X, wind)</option>
        </select>
      </label>
      <label className="fem-popover-row">
        <span>q (kN/m)</span>
        <input
          type="number" step="0.1" value={q} autoFocus
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <label className="fem-popover-row">
        <span>Begin (m)</span>
        <input
          type="number" step="0.1" min="0" max={beamLenM} value={beginM}
          onChange={e => setBeginM(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <label className="fem-popover-row">
        <span>Einde (m)</span>
        <input
          type="number" step="0.1" min="0" max={beamLenM} value={endM}
          onChange={e => setEndM(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <div className="fem-popover-hint">
        Negatief = tegen +richting in (downward voor Z, links voor X).
        Begin/einde vanaf de startknoop; 0 t/m {beamLenM.toFixed(2)} m = volle lengte.
      </div>
      {!rangeValid && (
        <div className="fem-popover-hint" style={{ color: "var(--theme-danger, #d33)" }}>
          Ongeldig bereik: 0 ≤ begin &lt; einde ≤ {beamLenM.toFixed(2)} m
        </div>
      )}
      <div className="fem-popover-actions">
        <button onClick={commit} className="fem-popover-primary" disabled={!rangeValid}>OK</button>
      </div>
    </div>
  );
}

/**
 * Randlast op een plaatrand (P3.3/P4.3): p in kN/m langs de randlengte,
 * richting in GLOBALE assen. Negatief = tegen de +richting in (omlaag voor
 * Z, naar links voor X) — dezelfde tekenconventie als lijnlasten op staven.
 * `randLabel` is de NL-naam van de rand ("bovenrand" of "rand 3").
 */
function PopoverEdgeLoadForm({ randLabel, onSubmit }: {
  randLabel: string;
  onSubmit: (p: number, dir: "x" | "z") => void;
}) {
  const [p, setP] = useState("-5");
  const [dir, setDir] = useState<"x" | "z">("z");
  const commit = () => onSubmit(Number(p) || 0, dir);
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">Randlast op {randLabel}</div>
      <label className="fem-popover-row">
        <span>Richting</span>
        <select value={dir} onChange={e => setDir(e.target.value as "x" | "z")}>
          <option value="z">Verticaal (+Z, gravitatie)</option>
          <option value="x">Horizontaal (+X, wind)</option>
        </select>
      </label>
      <label className="fem-popover-row">
        <span>p (kN/m)</span>
        <input
          type="number" step="0.1" value={p} autoFocus
          onChange={e => setP(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <div className="fem-popover-hint">
        p werkt per meter randlengte. Negatief = tegen de +richting in
        (omlaag voor Z, links voor X).
      </div>
      <div className="fem-popover-actions">
        <button onClick={commit} className="fem-popover-primary">OK</button>
      </div>
    </div>
  );
}

function PopoverPointLoadForm({ onSubmit, horizontal, beamLenM, defaultPosM }: {
  /** `posFrac` is alleen gevuld bij een puntlast op een vrije staafpositie. */
  onSubmit: (fx: number, fz: number, posFrac?: number) => void;
  horizontal?: boolean;
  /** Staaflengte in m — gezet ⇒ de last grijpt op een STAAF aan, niet op een
   *  knoop, en het positieveld verschijnt. */
  beamLenM?: number;
  /** Voorgestelde positie in m vanaf de startknoop (uit de klikpositie). */
  defaultPosM?: number;
}) {
  // Horizontal mode: pre-fill Fx (+10 kN, rightward) and clear Fz; the Fx field
  // gets focus. Vertical mode: pre-fill Fz (-10 kN, downward) and focus Fz.
  const [fx, setFx] = useState(horizontal ? "10" : "0");
  const [fz, setFz] = useState(horizontal ? "0"  : "-10");
  // Positie op de staaf in m vanaf de startknoop; intern omgerekend naar een
  // fractie 0..1 (Load.posFrac) — dezelfde conventie als de deellast-invoer.
  const opStaaf = beamLenM !== undefined && beamLenM > 0;
  const [posM, setPosM] = useState((defaultPosM ?? 0).toFixed(2));
  const posGeldig = !opStaaf
    || (Number.isFinite(Number(posM)) && Number(posM) >= 0 && Number(posM) <= beamLenM! + 1e-9);
  const commit = () => {
    if (!posGeldig) return;
    const frac = opStaaf
      ? Math.min(1, Math.max(0, Number(posM) / beamLenM!))
      : undefined;
    onSubmit(Number(fx) || 0, Number(fz) || 0, frac);
  };
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">
        {horizontal ? "Horizontale puntlast toevoegen" : "Puntlast toevoegen"}
      </div>
      {opStaaf && (
        <label className="fem-popover-row">
          <span>Positie (m)</span>
          <input
            type="number" step="0.05" min="0" max={beamLenM}
            value={posM} onChange={e => setPosM(e.target.value)}
            title={`Afstand vanaf de startknoop van de staaf (0 – ${beamLenM!.toFixed(2)} m).`}
            onKeyDown={e => { if (e.key === "Enter") commit(); }}
          />
        </label>
      )}
      <label className="fem-popover-row">
        <span>Fx (kN)</span>
        <input type="number" step="0.1" value={fx} onChange={e => setFx(e.target.value)}
          autoFocus={horizontal}
          onKeyDown={e => { if (e.key === "Enter" && horizontal) commit(); }} />
      </label>
      <label className="fem-popover-row">
        <span>Fz (kN)</span>
        <input type="number" step="0.1" value={fz} onChange={e => setFz(e.target.value)}
          autoFocus={!horizontal}
          onKeyDown={e => { if (e.key === "Enter") commit(); }} />
      </label>
      {opStaaf && !posGeldig && (
        <div className="fem-popover-hint" style={{ color: "var(--theme-danger, #d33)" }}>
          Ongeldige positie: 0 ≤ positie ≤ {beamLenM!.toFixed(2)} m
        </div>
      )}
      <div className="fem-popover-actions">
        <button onClick={commit} className="fem-popover-primary" disabled={!posGeldig}>OK</button>
      </div>
    </div>
  );
}
