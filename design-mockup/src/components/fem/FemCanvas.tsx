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
 *   - addPlate    : 4 clicks → adds 4 perimeter beams + Plate region
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
import FemResultsOverlay, { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "./FemResultsOverlay";
import BarPropertiesDialog from "./BarPropertiesDialog";
import { resolveSection, TIMBER_E_MEAN } from "../../lib/sectionResolver";
import type {
  Tool, Node, Beam, Plate, Support, Load, Selection,
  ViewTransform, GridSettings, SupportType, StructuralGrid,
} from "./femTypes";
import InlinePopover from "../openaec/InlinePopover";
import { notifyWarning } from "../../io/notify";

// Re-export Tool so older imports (Ribbon, HomeTab) keep working.
export type { Tool } from "./femTypes";

/**
 * Thermische uitzettingscoëfficiënt per staafmateriaal (1/K) voor thermische
 * lasten (SolverThermalLoadInput.alpha — de engine honoreert een per-last α
 * exact, zie engine.ts buildMesh).
 *  - Staal: α = 1,2e-5 /K (EN 1993-1-1).
 *  - Hout:  α = 5,0e-6 /K — α∥ (vezelrichting), bovengrens van de
 *    literatuurrange 3–5e-6 /K en dus conservatief voor de krachten uit
 *    verhinderde thermische vervorming.
 * Houtdetectie via de sterkteklassentabel (TIMBER_E_MEAN); al het overige
 * (staal, onbekend) rekent met de staal-α. Wordt gedeeld met het multi-LC-pad
 * in App.tsx zodat beide solver-paden dezelfde α-keuze maken.
 */
export const ALPHA_STAAL = 1.2e-5;
export const ALPHA_HOUT = 5.0e-6;
export function thermalAlphaForMaterial(material: string | undefined): number {
  return material !== undefined && material in TIMBER_E_MEAN ? ALPHA_HOUT : ALPHA_STAAL;
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
  addPlate: (nodeIds: number[]) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  addLoad: (l: Omit<Load, "id">) => void;
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
}

// World ↔ screen constants
const DEFAULT_SCALE = 1 / 25;     // 1 mm → 1/25 px
const SCALE_MIN = 1 / 200;        // 50 px/m
const SCALE_MAX = 1 / 2;          // 12 500 px/m
const ORIGIN_X = 80;
const ORIGIN_Y_FROM_BOTTOM = 60;

export default function FemCanvas(props: FemCanvasProps) {
  const {
    tool, onToolChange, nodes, beams, supports, plates, loads, selection, activeLoadCaseId,
    setSelection, addNode, addBeam, updateBeam, addPlate, addSupport, addLoad,
    deleteSelected, splitBeamAt,
    translateSelection, copySelection, rotateSelection, mirrorSelection,
    translateNodes,
    grid, structuralGrid, setStructuralGrid,
    solveTrigger, onSolveResult, scheefstand,
    combinations, activeCombinationId, envelopeView,
    combinationResults, envelope,
    displayFlags: displayFlagsProp,
    setDisplayFlags: setDisplayFlagsProp,
    showLoads = true,
    resultsMode = false,
    setPendingLoadFocus,
    onZoomChange,
  } = props;
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
    kind: "zSpring" | "xSpring" | "rotSpring" | "pointLoad" | "pointLoadH" | "moment" | "lineLoad" | "thermal";
    nodeId?: number; beamId?: number;
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

  // Invalidate results whenever the model changes
  useEffect(() => {
    setResults(null);
    setSolveError(null);
    onSolveResult?.(null);
  }, [nodes, beams, supports, loads, activeLoadCaseId, onSolveResult]);

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
        startFrac?: number; endFrac?: number;
      }[] = [];
      const pointLoads: { nodeId: number; fx?: number; fz?: number; my?: number }[] = [];
      const thermalLoads: { beamId: number; deltaT: number; alpha?: number }[] = [];
      for (const l of activeLoads) {
        if (l.type === "lineLoad" && l.beamId !== undefined && l.q !== undefined) {
          // q in kN/m → N/mm: 1 kN/m = 1 N/mm. Trapezium (qStart/qEnd),
          // richting (qDir) en deellast-fracties (startFrac/endFrac) gaan
          // mee — zelfde velden als het multi-LC-pad in App.tsx.
          distLoads.push({
            beamId: l.beamId, q: l.q,
            qStart: l.qStart, qEnd: l.qEnd, qDir: l.qDir,
            startFrac: l.startFrac, endFrac: l.endFrac,
          });
        } else if (l.type === "pointForce" && l.nodeId !== undefined) {
          // Fx, Fz in kN → N (×1000)
          pointLoads.push({
            nodeId: l.nodeId,
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
          // multi-LC-pad in App.tsx; zie thermalAlphaForMaterial hierboven.
          const beam = beams.find(b => b.id === l.beamId);
          thermalLoads.push({
            beamId: l.beamId, deltaT: l.deltaT,
            alpha: thermalAlphaForMaterial(beam?.material),
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
        thermalLoads,
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

  const snap = useCallback((v: number) =>
    Math.round(v / grid.spacingMm) * grid.spacingMm,
  [grid.spacingMm]);

  /**
   * Snap a (world-coord) point to the nearest STRAMIEN intersection if it's
   * within `radiusModel` mm; otherwise fall back to the 500 mm grid snap.
   * Returns the snapped point + a flag for the canvas to show the amber halo.
   */
  const snapToStramien = useCallback((mx: number, mz: number): { x: number; z: number; snapped: boolean } => {
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
  }, [structuralGrid, view.scale, snap]);

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
      setSnapNode(isBeamTool ? null : findSnapNode(sx, sy));
      const beamSnapTools = tool === "addSubNode" || tool === "addLineLoad" || tool === "addThermal";
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
      // 4-click rectangle. Snap to existing node or create one.
      let nodeId = overNodeId;
      if (nodeId === null) {
        const existing = nodes.find(n => n.x === clickModel.x && n.z === clickModel.z);
        if (existing) nodeId = existing.id;
        else nodeId = addNode(clickModel.x, clickModel.z);
      }
      if (nodeId === null) return;
      const next = [...plateCorners, nodeId];
      if (next.length === 4) {
        // Close polygon: add 4 perimeter beams if they don't already exist
        for (let i = 0; i < 4; i++) {
          const a = next[i], b = next[(i + 1) % 4];
          addBeam(a, b);
        }
        addPlate(next);
        setPlateCorners([]);
      } else {
        setPlateCorners(next);
      }
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
      if (overNodeId === null) return;
      const n = nodes.find(nn => nn.id === overNodeId);
      if (!n) return;
      const p = worldToScreen(n.x, n.z);
      const kind =
        tool === "addMoment"        ? "moment" :
        tool === "addPointLoadH"    ? "pointLoadH" :
                                      "pointLoad";
      setPopover({ kind, nodeId: overNodeId, sx: p.x, sy: p.y });
      return;
    }

    if (tool === "addLineLoad" || tool === "addThermal") {
      const sb = findSnapBeam(sx, sy);
      if (!sb) return;
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
        if (e.key === "x" || e.key === "X") {
          e.preventDefault();
          setGrabMode({ ...grabMode, axisLock: grabMode.axisLock === "x" ? null : "x" });
          return;
        }
        if (e.key === "z" || e.key === "Z") {
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
      selectionNodeIds, copySelection, onToolChange, tool]);

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
      return (
        <g key={`sup${s.nodeId}`}>
          <rect x={p.x - 14} y={p.y + 18} width={28} height={6} className="fem-support" />
          <line x1={p.x - 16} y1={p.y + 24} x2={p.x + 16} y2={p.y + 24} className="fem-support-ground" />
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
      return (
        <g key={`sup${s.nodeId}`}>
          <circle cx={p.x} cy={p.y} r={11} fill="none" className="fem-spring" strokeDasharray="3 2" />
          <circle cx={p.x} cy={p.y} r={6}  fill="none" className="fem-spring" />
          {s.k !== undefined && <text x={p.x + 14} y={p.y - 8} className="fem-spring-label">kθ={s.k}</text>}
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
    if (l.type !== "lineLoad") return m;
    const qa = Math.abs(l.qStart ?? l.q ?? 0);
    const qb = Math.abs(l.qEnd   ?? l.q ?? 0);
    return Math.max(m, qa, qb);
  }, 0);
  const lineLoadPxPerKnm = maxLineQ > 0 ? LINE_LOAD_TARGET_PX / maxLineQ : 0;

  const renderLoad = (l: Load) => {
    // POINT FORCE on node
    if (l.type === "pointForce" && l.nodeId !== undefined) {
      const n = nodes.find(nn => nn.id === l.nodeId); if (!n) return null;
      const p = worldToScreen(n.x, n.z);
      const fx = l.fx ?? 0, fz = l.fz ?? 0;
      const mag = Math.hypot(fx, fz);
      if (mag < 1e-9) return null;
      const scale = 40 / mag;
      // Arrow drawn TOWARD the node, in load direction. Tail away.
      const ax = fx * scale, ay = -fz * scale;
      const tail = { x: p.x - ax, y: p.y - ay };
      return (
        <g key={`load${l.id}`}>
          <line x1={tail.x} y1={tail.y} x2={p.x} y2={p.y} className="fem-load-vec" markerEnd="url(#fem-load-head)" />
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
      // Perpendicular unit vector pointing "up" in load direction (negative q → arrows point down at beam)
      const dxs = pB.x - pA.x, dys = pB.y - pA.y;
      const L = Math.hypot(dxs, dys);
      if (L < 1) return null;
      const nx = -dys / L, ny = dxs / L;            // perpendicular (left)
      // Deellast: pijlen + lastblok alleen over het belaste deel
      // [startFrac, endFrac] van de staaf (default volle lengte).
      const aF = Math.min(1, Math.max(0, l.startFrac ?? 0));
      const bF = Math.min(1, Math.max(aF, l.endFrac ?? 1));
      const pS = { x: pA.x + dxs * aF, y: pA.y + dys * aF };
      const pE = { x: pA.x + dxs * bF, y: pA.y + dys * bF };
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
    : dragState ? "grabbing"
    : grabMode ? "move"
    : rotateMode ? "alias"
    : boxSelect ? "crosshair"
    : tool === "select"
      ? (snapNode !== null || snapBeam !== null ? "pointer" : "default")
      : "crosshair";

  // Render plates (translucent polygons)
  const renderPlate = (pl: Plate) => {
    const pts = pl.nodeIds.map(id => {
      const n = nodes.find(nn => nn.id === id);
      if (!n) return null;
      const p = worldToScreen(n.x, n.z);
      return `${p.x},${p.y}`;
    });
    if (pts.some(x => x === null)) return null;
    const isSel = selection?.type === "plate" && selection.id === pl.id;
    return (
      <polygon
        key={`plate${pl.id}`}
        points={pts.join(" ")}
        className={`fem-plate${isSel ? " selected" : ""}`}
        onClick={(e) => { if (tool === "select") { e.stopPropagation(); setSelection({ type: "plate", id: pl.id }); } }}
      />
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
      const mKnm = (mAbs / 1e6).toFixed(1);

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
            x={lx - 60} y={ly - 18}
            width={120} height={32}
            rx={3}
            className="fem-result-label-bg"
          />
          <text x={lx} y={ly - 5} className="fem-force-label"
            style={{ fontWeight: 600, fill: color }}>
            M_max = {mKnm} kNm
          </text>
          {combo && (
            <text x={lx} y={ly + 8} className="fem-force-label" style={{ fontSize: 9 }}>
              {combo.name}
            </text>
          )}
        </g>
      );
    });
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
          const addZAxis = () => {
            if (!setStructuralGrid) return;
            setStructuralGrid(prev => {
              const used = new Set(prev.zAxes.map(a => a.label));
              let lbl = "";
              for (let k = 1; k <= 99; k++) {
                const l = String(k);
                if (!used.has(l)) { lbl = l; break; }
              }
              const maxPos = prev.zAxes.length ? Math.max(...prev.zAxes.map(a => a.position)) : 0;
              return { ...prev, zAxes: [...prev.zAxes, { id: `z-${Date.now()}`, label: lbl || `Z${prev.zAxes.length + 1}`, position: maxPos + 3000 }] };
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
                const elevMeters = az.position / 1000;
                const elevText = `${az.label}  ${elevMeters >= 0 ? "+" : ""}${elevMeters.toFixed(2)} m`;
                return (
                  <g key={`zax${az.id}`}>
                    <line x1={pL.x} y1={pL.y} x2={pR.x} y2={pR.y} className="fem-stramien-line" />
                    {/* LEFT label — combineert level-naam + peilmaat */}
                    <text x={pL.x - 10} y={pL.y + 4} className="fem-stramien-elev fem-stramien-elev-left">
                      {elevText}
                    </text>
                    {/* RIGHT label — combineert level-naam + peilmaat */}
                    <text x={pR.x + 10} y={pR.y + 4} className="fem-stramien-elev fem-stramien-elev-right">
                      {elevText}
                    </text>
                    {/* Minus button — verwijder dit niveau */}
                    {setStructuralGrid && (
                      <g
                        transform={`translate(${pR.x + 96}, ${pR.y})`}
                        className="fem-stramien-minus"
                        onClick={(e) => { e.stopPropagation(); removeZAxis(az.id); }}
                      >
                        <title>Niveau "{az.label}" ({elevMeters >= 0 ? "+" : ""}{elevMeters.toFixed(2)} m) verwijderen</title>
                        <circle r={7} />
                        <text y={3}>−</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Dimensions BELOW the model (horizontal distance between consecutive X-axes).
                  Klik op de tekst opent een popover om een nieuwe maat in te voeren — de
                  RECHTER as schuift mee, de linker blijft op zijn plek (vast referentiepunt). */}
              {xSorted.length > 1 && (() => {
                const dimZ = zLo - DIM_PAD;
                const items: React.ReactNode[] = [];
                for (let i = 0; i < xSorted.length - 1; i++) {
                  const a = xSorted[i], b = xSorted[i + 1];
                  const pa = worldToScreen(a.position, dimZ);
                  const pb = worldToScreen(b.position, dimZ);
                  const midX = (pa.x + pb.x) / 2, midY = pa.y;
                  const distMm = b.position - a.position;
                  const distM  = distMm / 1000;
                  items.push(
                    <g key={`dimx${i}`}>
                      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="fem-dim-line" pointerEvents="none" />
                      <line x1={pa.x} y1={pa.y - 6} x2={pa.x} y2={pa.y + 6} className="fem-dim-tick" pointerEvents="none" />
                      <line x1={pb.x} y1={pb.y - 6} x2={pb.x} y2={pb.y + 6} className="fem-dim-tick" pointerEvents="none" />
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
                            sx: midX, sy: midY,
                          });
                        }}
                      >
                        <rect x={midX - 28} y={midY - 8} width={56} height={16} rx={3} className="fem-dim-label-bg" />
                        <text x={midX} y={midY + 4} className="fem-dim-text">{distM.toFixed(2)} m</text>
                      </g>
                    </g>
                  );
                }
                return items;
              })()}

              {/* Dimensions RIGHT of the model (vertical distance between consecutive Z-axes) */}
              {zSorted.length > 1 && (() => {
                const dimX = xHi + DIM_PAD;
                const items: React.ReactNode[] = [];
                for (let i = 0; i < zSorted.length - 1; i++) {
                  const a = zSorted[i], b = zSorted[i + 1];
                  const pa = worldToScreen(dimX, a.position);
                  const pb = worldToScreen(dimX, b.position);
                  const midX = pa.x, midY = (pa.y + pb.y) / 2;
                  const distMm = b.position - a.position;
                  const distM  = distMm / 1000;
                  items.push(
                    <g key={`dimz${i}`}>
                      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="fem-dim-line" pointerEvents="none" />
                      <line x1={pa.x - 6} y1={pa.y} x2={pa.x + 6} y2={pa.y} className="fem-dim-tick" pointerEvents="none" />
                      <line x1={pb.x - 6} y1={pb.y} x2={pb.x + 6} y2={pb.y} className="fem-dim-tick" pointerEvents="none" />
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
                            sx: midX, sy: midY,
                          });
                        }}
                      >
                        <rect x={midX - 28} y={midY - 8} width={56} height={16} rx={3} className="fem-dim-label-bg" />
                        <text x={midX} y={midY + 4} className="fem-dim-text">{distM.toFixed(2)} m</text>
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
        <g className="fem-plates-layer">{plates.map(renderPlate)}</g>

        {/* Origin axes */}
        <g className="fem-axes" transform={`translate(${ORIGIN_X + view.offsetX}, ${size.h - ORIGIN_Y_FROM_BOTTOM + view.offsetY})`}>
          <line x1={0} y1={0} x2={40} y2={0} className="fem-axis-x" />
          <text x={44} y={4} className="fem-axis-label fem-axis-x">+X</text>
          <line x1={0} y1={0} x2={0} y2={-40} className="fem-axis-z" />
          <text x={4} y={-44} className="fem-axis-label fem-axis-z">+Z</text>
          <circle cx={0} cy={0} r={3} fill="var(--theme-accent)" />
        </g>

        {/* Beams */}
        {beamsWithCoords.map(({ b, p1, p2 }) => {
          const isSel = isBeamInSelection(b.id, selection);
          const isSnap = snapBeam === b.id;
          const selectBeam = (e: React.MouseEvent) => {
            if (tool === "select" && !dragState) { e.stopPropagation(); setSelection({ type: "beam", id: b.id }); }
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

        {/* Plate preview while drawing — connect plateCorners + hover */}
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
          return <polyline points={pts.join(" ")} className="fem-member-preview" />;
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
                onClick={(e) => { if (tool === "select" && !dragState) { e.stopPropagation(); setSelection({ type: "node", id: n.id }); } }} />
              <text x={p.x + 8} y={p.y - 8} className="fem-node-label">{n.id}</text>
            </g>
          );
        })}

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
          // Ghost beams: only those whose both endpoints are moving (rigid translation).
          for (const b of beams) {
            if (movedNodeIds.has(b.from) && movedNodeIds.has(b.to)) {
              const oA = dragState.originPositions.get(b.from)!;
              const oB = dragState.originPositions.get(b.to)!;
              const pa = worldToScreen(oA.x + dragState.currentDelta.dx, oA.z + dragState.currentDelta.dz);
              const pb = worldToScreen(oB.x + dragState.currentDelta.dx, oB.z + dragState.currentDelta.dz);
              ghosts.push(<line key={`ghb${b.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                className="fem-member-ghost" />);
            }
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
          for (const b of beams) {
            if (movedNodeIds.has(b.from) && movedNodeIds.has(b.to)) {
              const oA = grabMode.originPositions.get(b.from)!;
              const oB = grabMode.originPositions.get(b.to)!;
              const pa = worldToScreen(oA.x + dx, oA.z + dz);
              const pb = worldToScreen(oB.x + dx, oB.z + dz);
              ghosts.push(<line key={`grabb${b.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                className="fem-member-ghost" />);
            }
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
            shape = (<>
              <rect x={p.x - 14} y={p.y + 18} width={28} height={6} className="fem-support" />
              <line x1={p.x - 16} y1={p.y + 24} x2={p.x + 16} y2={p.y + 24} className="fem-support-ground" />
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
            shape = (<>
              <circle cx={p.x} cy={p.y} r={11} fill="none" className="fem-spring" strokeDasharray="3 2" />
              <circle cx={p.x} cy={p.y} r={6}  fill="none" className="fem-spring" />
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
            <span className="fem-hud-muted">— hoek {plateCorners.length + 1} van 4</span>
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
      </div>
      <div className="fem-hud fem-hud-tr">
        <div className="fem-hud-card fem-hud-mono">
          <span>{nodes.length} knopen · {beams.length} balken{plates.length ? ` · ${plates.length} platen` : ""}</span>
        </div>
        <div className="fem-hud-card fem-hud-mono" style={{ marginTop: 6 }}>
          <span>{zoomPct}%</span>
          <button className="fem-hud-btn" onClick={resetView} title="Reset zoom (F = fit)">Reset</button>
        </div>
        {/* Coordinate-system indicator — fixed compass showing +X / +Z. */}
        <div className="fem-hud-card fem-coord-widget" style={{ marginTop: 6, padding: 6 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" aria-label="Assenstelsel">
            <defs>
              <marker id="fem-coord-head" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {/* Origin dot */}
            <circle cx={20} cy={36} r={2.5} fill="var(--theme-accent)" />
            {/* +X arrow (horizontal, right) */}
            <g style={{ color: "var(--theme-accent)" }}>
              <line x1={20} y1={36} x2={46} y2={36} stroke="currentColor" strokeWidth={2}
                markerEnd="url(#fem-coord-head)" />
              <text x={48} y={40} fontSize={10} fontWeight={600} fill="currentColor">+X</text>
            </g>
            {/* +Z arrow (vertical, up) */}
            <g style={{ color: "#06b6d4" }}>
              <line x1={20} y1={36} x2={20} y2={10} stroke="currentColor" strokeWidth={2}
                markerEnd="url(#fem-coord-head)" />
              <text x={24} y={14} fontSize={10} fontWeight={600} fill="currentColor">+Z</text>
            </g>
          </svg>
        </div>
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
          <span className="fem-hud-strong">{grid.spacingMm} mm</span>
        </div>
      </div>

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

      {/* Maatlijn-edit popover — opent als je op een maat-label klikt. Vul
          nieuwe afstand in mm of m in. De bewegende as schuift mee, de
          referentie-as blijft op zijn plek. */}
      {dimEdit && setStructuralGrid && (
        <InlinePopover x={dimEdit.sx} y={dimEdit.sy} onClose={() => setDimEdit(null)}>
          <DimEditForm
            axis={dimEdit.axis}
            currentMm={dimEdit.currentMm}
            onSubmit={(newMm) => {
              const newPos = dimEdit.fixedPos + newMm;
              setStructuralGrid(prev => ({
                ...prev,
                xAxes: dimEdit.axis === "x"
                  ? prev.xAxes.map(a => a.id === dimEdit.movingAxisId ? { ...a, position: newPos } : a)
                  : prev.xAxes,
                zAxes: dimEdit.axis === "z"
                  ? prev.zAxes.map(a => a.id === dimEdit.movingAxisId ? { ...a, position: newPos } : a)
                  : prev.zAxes,
              }));
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
    if (p.kind === "pointLoad") {
      return <PopoverPointLoadForm onSubmit={(fx, fz) => cbs.onAddLoad({
        type: "pointForce", nodeId: p.nodeId, fx, fz,
      })} />;
    }
    if (p.kind === "pointLoadH") {
      // Horizontale puntlast — Fx voor-ingevuld (+10 = naar rechts), Fz=0.
      return <PopoverPointLoadForm horizontal onSubmit={(fx, fz) => cbs.onAddLoad({
        type: "pointForce", nodeId: p.nodeId, fx, fz,
      })} />;
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
    return null;
  }
}

/** UI spring stiffness → solver units (N/mm or N·mm/rad). Same logic as App.tsx. */
function liftSpringK(s: { type: string; k?: number }): number | undefined {
  if (s.k === undefined) return undefined;
  if (s.type === "zSpring" || s.type === "xSpring") return s.k * 1000;
  if (s.type === "rotSpring") return s.k * 1e6;
  return undefined;
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
 *  to mm and forwards to the parent which updates the moving axis position. */
function DimEditForm({ axis, currentMm, onSubmit, onCancel }: {
  axis: "x" | "z";
  currentMm: number;
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

function PopoverPointLoadForm({ onSubmit, horizontal }: { onSubmit: (fx: number, fz: number) => void; horizontal?: boolean }) {
  // Horizontal mode: pre-fill Fx (+10 kN, rightward) and clear Fz; the Fx field
  // gets focus. Vertical mode: pre-fill Fz (-10 kN, downward) and focus Fz.
  const [fx, setFx] = useState(horizontal ? "10" : "0");
  const [fz, setFz] = useState(horizontal ? "0"  : "-10");
  return (
    <div className="fem-popover-form">
      <div className="fem-popover-title">{horizontal ? "Horizontale puntlast toevoegen" : "Puntlast toevoegen"}</div>
      <label className="fem-popover-row">
        <span>Fx (kN)</span>
        <input type="number" step="0.1" value={fx} onChange={e => setFx(e.target.value)}
          autoFocus={horizontal}
          onKeyDown={e => { if (e.key === "Enter" && horizontal) onSubmit(Number(fx) || 0, Number(fz) || 0); }} />
      </label>
      <label className="fem-popover-row">
        <span>Fz (kN)</span>
        <input type="number" step="0.1" value={fz} onChange={e => setFz(e.target.value)}
          autoFocus={!horizontal}
          onKeyDown={e => { if (e.key === "Enter") onSubmit(Number(fx) || 0, Number(fz) || 0); }} />
      </label>
      <div className="fem-popover-actions">
        <button onClick={() => onSubmit(Number(fx) || 0, Number(fz) || 0)} className="fem-popover-primary">OK</button>
      </div>
    </div>
  );
}
