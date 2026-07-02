/**
 * useFemStore — single hook owning all FEM model state.
 *
 * Used by App.tsx so FemCanvas, FemProjectTree, FemProperties and the
 * Ribbon buttons all consume the same model. Keeps state lifting tidy
 * (no prop-drilling soup) without introducing an external store library.
 *
 * Includes a tiny undo/redo history stack — every mutating action pushes
 * a Snapshot, Ctrl+Z restores the previous one.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import type {
  Node, Beam, Plate, Support, Load, LoadCase, Selection,
  Snapshot, SupportType, StructuralGrid,
} from "../components/fem/femTypes";
import { DEFAULT_STRUCTURAL_GRID } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type {
  LoadCombination, Envelope,
} from "../components/fem/solver/combinations";
import { defaultCombinations } from "../components/fem/solver/combinations";

// ── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_NODES: Node[] = [
  { id: 1, x: 0,     z: 0 },
  { id: 2, x: 12000, z: 0 },
  { id: 3, x: 0,     z: 5000 },
  { id: 4, x: 12000, z: 5000 },
];
const DEFAULT_BEAMS: Beam[] = [
  { id: 1, from: 1, to: 3 },
  { id: 2, from: 2, to: 4 },
  { id: 3, from: 3, to: 4 },
];
const DEFAULT_SUPPORTS: Support[] = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "pinned" },
];
const DEFAULT_PLATES: Plate[] = [];
const DEFAULT_LOAD_CASES: LoadCase[] = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)",  type: "live" },
  { id: 3, name: "Sneeuw (S)",    type: "snow" },
  { id: 4, name: "Wind (W)",      type: "wind" },
];
// Pre-populate one line load on top beam (id 3) in the permanent case,
// so the solver still has something to act on by default.
const DEFAULT_LOADS: Load[] = [
  { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -5 /* kN/m */ },
];

function makeInitialSnapshot(): Snapshot {
  return {
    nodes: [...DEFAULT_NODES],
    beams: [...DEFAULT_BEAMS],
    supports: [...DEFAULT_SUPPORTS],
    plates: [...DEFAULT_PLATES],
    loads: [...DEFAULT_LOADS],
  };
}

const HISTORY_LIMIT = 100;

export interface FemStore {
  // Model
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  loadCases: LoadCase[];
  activeLoadCaseId: number;

  // Combinations / envelope (step 2d/2e)
  combinations: LoadCombination[];
  /** Selected combination for canvas display; null = show active LC or envelope. */
  activeCombinationId: number | null;
  /** When true, canvas shows envelope view instead of a single result. */
  envelopeView: boolean;
  /** Per-case solver outputs from the last "Toetsen uitvoeren" run. */
  multiLcResult: Map<number, SolverResult> | null;
  /** Combined SolverResult per combination id. */
  combinationResults: Map<number, SolverResult> | null;
  /** Envelope across all combinations. */
  envelope: Envelope | null;

  // UI
  selection: Selection;

  // Setters (snapshot-aware)
  setSelection: (s: Selection) => void;
  setActiveLoadCaseId: (id: number) => void;
  setActiveCombinationId: (id: number | null) => void;
  setEnvelopeView: (v: boolean) => void;
  setSolverOutputs: (m: {
    perCase: Map<number, SolverResult>;
    combinationResults: Map<number, SolverResult>;
    envelope: Envelope;
  } | null) => void;

  // Mutations (each pushes a history snapshot)
  addNode: (x: number, z: number) => number;          // returns new node id
  updateNode: (id: number, x: number, z: number) => void;
  addBeam: (fromId: number, toId: number) => number | null;
  updateBeam: (id: number, updates: Partial<Beam>) => void;
  addPlate: (nodeIds: number[]) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  removeSupport: (nodeId: number) => void;
  addLoad: (l: Omit<Load, "id">) => void;
  updateLoad: (id: number, updates: Partial<Load>) => void;
  deleteSelected: () => void;
  splitBeamAt: (beamId: number, x: number, z: number) => void;
  translateSelection: (sel: Selection, dx: number, dz: number) => void;
  copySelection: (sel: Selection, dx: number, dz: number) => void;
  rotateSelection: (sel: Selection, cx: number, cz: number, angleRad: number) => void;
  mirrorSelection: (sel: Selection, x1: number, z1: number, x2: number, z2: number) => void;
  addLoadCase: (name: string) => void;

  /** Bulk translate a set of nodes by (dx, dz) — used by drag-to-move / G-grab. */
  translateNodes: (nodeIds: number[], dx: number, dz: number) => void;

  /** Structural grid (stramien) — defaults are 2×2 letters/numbers for the default portal. */
  structuralGrid: StructuralGrid;
  setStructuralGrid: (g: StructuralGrid | ((prev: StructuralGrid) => StructuralGrid)) => void;

  /** Solver options. */
  selfWeightEnabled: boolean;
  setSelfWeightEnabled: (v: boolean) => void;
  /** Niet-lineair (P-Δ) toggle — adds geometric stiffness + Newton-Raphson. */
  nonlinearEnabled: boolean;
  setNonlinearEnabled: (v: boolean) => void;
  /** Canvas view mode: false = model-only (no loads drawn), true = LC active loads visible. */
  showLoads: boolean;
  setShowLoads: (v: boolean) => void;
  /** When set, the matching field in LoadProperties auto-focuses + selects. */
  pendingLoadFocus: { loadId: number; field: keyof Load } | null;
  setPendingLoadFocus: (v: { loadId: number; field: keyof Load } | null) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // ── Load case + combination management ────────────────────────────────
  updateLoadCase: (id: number, patch: Partial<Omit<LoadCase, "id">>) => void;
  removeLoadCase: (id: number) => void;
  addCombination: (combo: Omit<LoadCombination, "id">) => void;
  updateCombination: (id: number, patch: Partial<Omit<LoadCombination, "id">>) => void;
  removeCombination: (id: number) => void;

  /** Replace all model state from a deserialized project file. */
  loadProjectState: (p: {
    nodes: Node[]; beams: Beam[]; supports: Support[]; plates: Plate[]; loads: Load[];
    loadCases: LoadCase[]; activeLoadCaseId: number;
    selfWeightEnabled?: boolean; nonlinearEnabled?: boolean;
  }) => void;
}

export function useFemStore(): FemStore {
  // Active snapshot (current model)
  const [nodes, setNodes]       = useState<Node[]>(DEFAULT_NODES);
  const [beams, setBeams]       = useState<Beam[]>(DEFAULT_BEAMS);
  const [supports, setSupports] = useState<Support[]>(DEFAULT_SUPPORTS);
  const [plates, setPlates]     = useState<Plate[]>(DEFAULT_PLATES);
  const [loads, setLoads]       = useState<Load[]>(DEFAULT_LOADS);

  const [loadCases, setLoadCases] = useState<LoadCase[]>(DEFAULT_LOAD_CASES);
  const [activeLoadCaseId, setActiveLoadCaseId] = useState<number>(1);

  // Combinations + cached solver outputs (step 2d/2e)
  const [combinations, setCombinations] = useState<LoadCombination[]>(() => defaultCombinations());
  const [activeCombinationId, setActiveCombinationId] = useState<number | null>(null);
  const [envelopeView, setEnvelopeView] = useState<boolean>(false);
  const [multiLcResult, setMultiLcResult] = useState<Map<number, SolverResult> | null>(null);
  const [combinationResults, setCombinationResults] = useState<Map<number, SolverResult> | null>(null);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);

  // Structural grid (stramien) — separate from undo history.
  const [structuralGrid, setStructuralGridState] = useState<StructuralGrid>(DEFAULT_STRUCTURAL_GRID);

  // Solver options — separate from undo history (UI toggles, not model state).
  const [selfWeightEnabled, setSelfWeightEnabled] = useState<boolean>(false);
  const [nonlinearEnabled, setNonlinearEnabled]   = useState<boolean>(false);
  // Canvas view mode: false = "Model" tab (no loads drawn), true = LC active.
  const [showLoads, setShowLoads] = useState<boolean>(true);
  // Cross-panel focus hint: when the user clicks a value on the canvas (e.g.
  // a q-load label), this requests that the matching Properties-input gets
  // focused + selected. Consumed once then cleared.
  const [pendingLoadFocus, setPendingLoadFocus] = useState<{ loadId: number; field: keyof Load } | null>(null);

  const setSolverOutputs = useCallback((m: {
    perCase: Map<number, SolverResult>;
    combinationResults: Map<number, SolverResult>;
    envelope: Envelope;
  } | null) => {
    if (m === null) {
      setMultiLcResult(null);
      setCombinationResults(null);
      setEnvelope(null);
      return;
    }
    setMultiLcResult(m.perCase);
    setCombinationResults(m.combinationResults);
    setEnvelope(m.envelope);
  }, []);

  const [selection, setSelection] = useState<Selection>(null);

  // History — stack of Snapshots, plus pointer.
  const [history, setHistory] = useState<Snapshot[]>([makeInitialSnapshot()]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // We use a ref for the latest model so the snapshot push always grabs
  // the freshest values without stale-closure trouble.
  const latestRef = useRef({ nodes, beams, supports, plates, loads });
  useEffect(() => {
    latestRef.current = { nodes, beams, supports, plates, loads };
  }, [nodes, beams, supports, plates, loads]);

  /** Push a new history snapshot AFTER a mutation completes. */
  const pushHistory = useCallback((next: Snapshot) => {
    setHistory((prev) => {
      const truncated = prev.slice(0, historyIdx + 1);
      const updated = [...truncated, next];
      // Cap memory usage
      const trimmed = updated.length > HISTORY_LIMIT
        ? updated.slice(updated.length - HISTORY_LIMIT)
        : updated;
      return trimmed;
    });
    setHistoryIdx((i) => Math.min(i + 1, HISTORY_LIMIT - 1));
  }, [historyIdx]);

  // Helper: produce next snapshot from a partial change
  const applySnapshot = useCallback((next: Snapshot) => {
    setNodes(next.nodes);
    setBeams(next.beams);
    setSupports(next.supports);
    setPlates(next.plates);
    setLoads(next.loads);
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const addNode = useCallback((x: number, z: number) => {
    const cur = latestRef.current;
    const newId = cur.nodes.length === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
    const nextNodes = [...cur.nodes, { id: newId, x, z }];
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
    return newId;
  }, [pushHistory]);

  const updateNode = useCallback((id: number, x: number, z: number) => {
    const cur = latestRef.current;
    const nextNodes = cur.nodes.map(n => n.id === id ? { ...n, x, z } : n);
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  const addBeam = useCallback((fromId: number, toId: number) => {
    if (fromId === toId) return null;
    const cur = latestRef.current;
    // No duplicate
    if (cur.beams.some(b =>
      (b.from === fromId && b.to === toId) || (b.from === toId && b.to === fromId))) {
      return null;
    }
    const newId = cur.beams.length === 0 ? 1 : Math.max(...cur.beams.map(b => b.id)) + 1;
    const nextBeams = [...cur.beams, { id: newId, from: fromId, to: toId }];
    setBeams(nextBeams);
    pushHistory({ ...cur, beams: nextBeams });
    return newId;
  }, [pushHistory]);

  /** Patch arbitrary fields on a beam (material, profile, releases, …). */
  const updateBeam = useCallback((id: number, updates: Partial<Beam>) => {
    const cur = latestRef.current;
    if (!cur.beams.some(b => b.id === id)) return;
    const nextBeams = cur.beams.map(b => b.id === id ? { ...b, ...updates } : b);
    setBeams(nextBeams);
    pushHistory({ ...cur, beams: nextBeams });
  }, [pushHistory]);

  const addPlate = useCallback((nodeIds: number[]) => {
    const cur = latestRef.current;
    const newId = cur.plates.length === 0 ? 1 : Math.max(...cur.plates.map(p => p.id)) + 1;
    const nextPlates = [...cur.plates, { id: newId, nodeIds }];
    setPlates(nextPlates);
    pushHistory({ ...cur, plates: nextPlates });
  }, [pushHistory]);

  const addSupport = useCallback((nodeId: number, type: SupportType, k?: number) => {
    const cur = latestRef.current;
    const without = cur.supports.filter(s => s.nodeId !== nodeId);
    const nextSupports = [...without, { nodeId, type, k }];
    setSupports(nextSupports);
    pushHistory({ ...cur, supports: nextSupports });
  }, [pushHistory]);

  const removeSupport = useCallback((nodeId: number) => {
    const cur = latestRef.current;
    const nextSupports = cur.supports.filter(s => s.nodeId !== nodeId);
    setSupports(nextSupports);
    pushHistory({ ...cur, supports: nextSupports });
  }, [pushHistory]);

  const addLoad = useCallback((l: Omit<Load, "id">) => {
    const cur = latestRef.current;
    const newId = cur.loads.length === 0 ? 1 : Math.max(...cur.loads.map(x => x.id)) + 1;
    const nextLoads = [...cur.loads, { ...l, id: newId }];
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });
  }, [pushHistory]);

  /** Patch arbitrary fields on a load (q, fx/fz/my, deltaT, …). */
  const updateLoad = useCallback((id: number, updates: Partial<Load>) => {
    const cur = latestRef.current;
    if (!cur.loads.some(l => l.id === id)) return;
    const nextLoads = cur.loads.map(l => l.id === id ? { ...l, ...updates } : l);
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });
  }, [pushHistory]);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    const cur = latestRef.current;
    if (selection.type === "beam") {
      const nextBeams = cur.beams.filter(b => b.id !== selection.id);
      // Also drop loads attached to this beam
      const nextLoads = cur.loads.filter(l => l.beamId !== selection.id);
      // And plates that reference its endpoints? — leave for now (plates use nodeIds).
      setBeams(nextBeams);
      setLoads(nextLoads);
      pushHistory({ ...cur, beams: nextBeams, loads: nextLoads });
    } else if (selection.type === "node") {
      const id = selection.id;
      const nextNodes = cur.nodes.filter(n => n.id !== id);
      const nextBeams = cur.beams.filter(b => b.from !== id && b.to !== id);
      const nextSupports = cur.supports.filter(s => s.nodeId !== id);
      // Drop plates that touch this node + loads on the removed beams / node
      const goneBeamIds = new Set(cur.beams.filter(b => b.from === id || b.to === id).map(b => b.id));
      const nextLoads = cur.loads.filter(l =>
        l.nodeId !== id && !(l.beamId !== undefined && goneBeamIds.has(l.beamId))
      );
      const nextPlates = cur.plates.filter(p => !p.nodeIds.includes(id));
      setNodes(nextNodes);
      setBeams(nextBeams);
      setSupports(nextSupports);
      setPlates(nextPlates);
      setLoads(nextLoads);
      pushHistory({
        nodes: nextNodes, beams: nextBeams, supports: nextSupports,
        plates: nextPlates, loads: nextLoads,
      });
    } else if (selection.type === "plate") {
      const nextPlates = cur.plates.filter(p => p.id !== selection.id);
      setPlates(nextPlates);
      pushHistory({ ...cur, plates: nextPlates });
    } else if (selection.type === "load") {
      const nextLoads = cur.loads.filter(l => l.id !== selection.id);
      setLoads(nextLoads);
      pushHistory({ ...cur, loads: nextLoads });
    } else if (selection.type === "multi") {
      // Multi-select: drop all selected nodes/beams/plates and everything that
      // referenced them. Mirrors the single-node/beam branches above.
      const nodeIds = new Set(selection.nodeIds);
      const beamIds = new Set(selection.beamIds);
      const plateIds = new Set(selection.plateIds);
      const nextNodes = cur.nodes.filter(n => !nodeIds.has(n.id));
      const nextBeams = cur.beams.filter(b =>
        !beamIds.has(b.id) && !nodeIds.has(b.from) && !nodeIds.has(b.to));
      const goneBeamIds = new Set(cur.beams.filter(b =>
        beamIds.has(b.id) || nodeIds.has(b.from) || nodeIds.has(b.to)).map(b => b.id));
      const nextSupports = cur.supports.filter(s => !nodeIds.has(s.nodeId));
      const nextLoads = cur.loads.filter(l =>
        (l.nodeId === undefined || !nodeIds.has(l.nodeId)) &&
        (l.beamId === undefined || !goneBeamIds.has(l.beamId)));
      const nextPlates = cur.plates.filter(p =>
        !plateIds.has(p.id) && p.nodeIds.every(nid => !nodeIds.has(nid)));
      setNodes(nextNodes);
      setBeams(nextBeams);
      setSupports(nextSupports);
      setPlates(nextPlates);
      setLoads(nextLoads);
      pushHistory({
        nodes: nextNodes, beams: nextBeams, supports: nextSupports,
        plates: nextPlates, loads: nextLoads,
      });
    }
    setSelection(null);
  }, [selection, pushHistory]);

  /** Translate selected node/beam endpoints by (dx, dz). */
  const translateSelection = useCallback((sel: Selection, dx: number, dz: number) => {
    if (!sel) return;
    const cur = latestRef.current;
    const nodeIds = new Set<number>();
    if (sel.type === "node") nodeIds.add(sel.id);
    else if (sel.type === "beam") {
      const b = cur.beams.find(bb => bb.id === sel.id);
      if (b) { nodeIds.add(b.from); nodeIds.add(b.to); }
    } else if (sel.type === "plate") {
      const p = cur.plates.find(pp => pp.id === sel.id);
      if (p) p.nodeIds.forEach(id => nodeIds.add(id));
    }
    const nextNodes = cur.nodes.map(n =>
      nodeIds.has(n.id) ? { ...n, x: n.x + dx, z: n.z + dz } : n);
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  /** Duplicate selected node/beam at offset (dx, dz). */
  const copySelection = useCallback((sel: Selection, dx: number, dz: number) => {
    if (!sel) return;
    const cur = latestRef.current;
    const idMap = new Map<number, number>();
    let nextNodeId = cur.nodes.length === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
    let nextBeamId = cur.beams.length === 0 ? 1 : Math.max(...cur.beams.map(b => b.id)) + 1;
    const newNodes: Node[] = [];
    const newBeams: Beam[] = [];
    const cloneNode = (id: number) => {
      if (idMap.has(id)) return idMap.get(id)!;
      const orig = cur.nodes.find(n => n.id === id);
      if (!orig) return id;
      const clone = { id: nextNodeId++, x: orig.x + dx, z: orig.z + dz };
      newNodes.push(clone);
      idMap.set(id, clone.id);
      return clone.id;
    };
    if (sel.type === "node") cloneNode(sel.id);
    else if (sel.type === "beam") {
      const b = cur.beams.find(bb => bb.id === sel.id);
      if (b) {
        const a = cloneNode(b.from), c = cloneNode(b.to);
        newBeams.push({ id: nextBeamId++, from: a, to: c });
      }
    } else if (sel.type === "plate") {
      const p = cur.plates.find(pp => pp.id === sel.id);
      if (p) p.nodeIds.forEach(cloneNode);
    }
    const nextNodesAll = [...cur.nodes, ...newNodes];
    const nextBeamsAll = [...cur.beams, ...newBeams];
    setNodes(nextNodesAll);
    setBeams(nextBeamsAll);
    pushHistory({ ...cur, nodes: nextNodesAll, beams: nextBeamsAll });
  }, [pushHistory]);

  /** Rotate selected node-set around (cx, cz) by `angleRad`. */
  const rotateSelection = useCallback((sel: Selection, cx: number, cz: number, angleRad: number) => {
    if (!sel) return;
    const cur = latestRef.current;
    const nodeIds = new Set<number>();
    if (sel.type === "node") nodeIds.add(sel.id);
    else if (sel.type === "beam") {
      const b = cur.beams.find(bb => bb.id === sel.id);
      if (b) { nodeIds.add(b.from); nodeIds.add(b.to); }
    } else if (sel.type === "plate") {
      const p = cur.plates.find(pp => pp.id === sel.id);
      if (p) p.nodeIds.forEach(id => nodeIds.add(id));
    }
    const cs = Math.cos(angleRad), sn = Math.sin(angleRad);
    const nextNodes = cur.nodes.map(n => {
      if (!nodeIds.has(n.id)) return n;
      const rx = n.x - cx, rz = n.z - cz;
      const nx = cx + rx * cs - rz * sn;
      const nz = cz + rx * sn + rz * cs;
      return { ...n, x: Math.round(nx), z: Math.round(nz) };
    });
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  /** Mirror selected node-set across a line through (x1,z1)-(x2,z2). */
  const mirrorSelection = useCallback((sel: Selection, x1: number, z1: number, x2: number, z2: number) => {
    if (!sel) return;
    const cur = latestRef.current;
    const nodeIds = new Set<number>();
    if (sel.type === "node") nodeIds.add(sel.id);
    else if (sel.type === "beam") {
      const b = cur.beams.find(bb => bb.id === sel.id);
      if (b) { nodeIds.add(b.from); nodeIds.add(b.to); }
    } else if (sel.type === "plate") {
      const p = cur.plates.find(pp => pp.id === sel.id);
      if (p) p.nodeIds.forEach(id => nodeIds.add(id));
    }
    const dx = x2 - x1, dz = z2 - z1;
    const denom = dx * dx + dz * dz;
    if (denom < 1e-6) return;
    const nextNodes = cur.nodes.map(n => {
      if (!nodeIds.has(n.id)) return n;
      // Reflect (n.x, n.z) across the line.
      const t = ((n.x - x1) * dx + (n.z - z1) * dz) / denom;
      const fx = x1 + t * dx, fz = z1 + t * dz;
      return { ...n, x: Math.round(2 * fx - n.x), z: Math.round(2 * fz - n.z) };
    });
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  /** Split a beam at a snapped point (x, z): inserts a new node and replaces beam with two. */
  const splitBeamAt = useCallback((beamId: number, x: number, z: number) => {
    const cur = latestRef.current;
    const beam = cur.beams.find(b => b.id === beamId);
    if (!beam) return;
    const newNodeId = cur.nodes.length === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
    const nextNodes = [...cur.nodes, { id: newNodeId, x, z }];
    const maxBeamId = Math.max(...cur.beams.map(b => b.id));
    const newBeam1 = { id: maxBeamId + 1, from: beam.from, to: newNodeId };
    const newBeam2 = { id: maxBeamId + 2, from: newNodeId, to: beam.to };
    const nextBeams = cur.beams.filter(b => b.id !== beamId).concat([newBeam1, newBeam2]);
    setNodes(nextNodes);
    setBeams(nextBeams);
    pushHistory({ ...cur, nodes: nextNodes, beams: nextBeams });
  }, [pushHistory]);

  const addLoadCase = useCallback((name: string) => {
    setLoadCases(prev => {
      const newId = prev.length === 0 ? 1 : Math.max(...prev.map(c => c.id)) + 1;
      return [...prev, { id: newId, name, type: "other" }];
    });
  }, []);

  /** Bulk-translate the given nodeIds by (dx, dz). One snapshot push. */
  const translateNodes = useCallback((nodeIds: number[], dx: number, dz: number) => {
    if (nodeIds.length === 0 || (dx === 0 && dz === 0)) return;
    const cur = latestRef.current;
    const idSet = new Set(nodeIds);
    const nextNodes = cur.nodes.map(n =>
      idSet.has(n.id) ? { ...n, x: n.x + dx, z: n.z + dz } : n);
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  const setStructuralGrid = useCallback((g: StructuralGrid | ((prev: StructuralGrid) => StructuralGrid)) => {
    setStructuralGridState(prev => typeof g === "function" ? (g as (p: StructuralGrid) => StructuralGrid)(prev) : g);
  }, []);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;
  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIdx = historyIdx - 1;
    applySnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
    setSelection(null);
  }, [canUndo, historyIdx, history, applySnapshot]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIdx = historyIdx + 1;
    applySnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
    setSelection(null);
  }, [canRedo, historyIdx, history, applySnapshot]);

  // Invalidate cached solver outputs whenever the model changes, so the UI
  // never shows a stale envelope/combination after the user edits the model.
  useEffect(() => {
    setMultiLcResult(null);
    setCombinationResults(null);
    setEnvelope(null);
    // We deliberately depend on the model-bearing state, not on the setters.
  }, [nodes, beams, supports, loads]);

  return {
    nodes, beams, supports, plates, loads,
    loadCases, activeLoadCaseId,
    combinations, activeCombinationId, envelopeView,
    multiLcResult, combinationResults, envelope,
    selection,
    setSelection,
    setActiveLoadCaseId,
    setActiveCombinationId,
    setEnvelopeView,
    setSolverOutputs,
    addNode, updateNode, addBeam, updateBeam, addPlate,
    addSupport, removeSupport, addLoad, updateLoad,
    deleteSelected, splitBeamAt, addLoadCase,
    translateSelection, copySelection, rotateSelection, mirrorSelection,
    translateNodes,
    structuralGrid, setStructuralGrid,
    selfWeightEnabled, setSelfWeightEnabled,
    nonlinearEnabled,  setNonlinearEnabled,
    showLoads, setShowLoads,
    pendingLoadFocus, setPendingLoadFocus,
    canUndo, canRedo, undo, redo,
    // ── Load case + combination mutators ─────────────────────────────────
    updateLoadCase: (id, patch) => {
      setLoadCases(prev => prev.map(lc => lc.id === id ? { ...lc, ...patch } : lc));
    },
    removeLoadCase: (id) => {
      setLoadCases(prev => {
        const next = prev.filter(lc => lc.id !== id);
        if (next.length === 0) return prev; // nooit alles wissen
        return next;
      });
      // Detach loads die naar deze case verwijzen.
      setLoads(prev => prev.filter(l => l.caseId !== id));
      // Switch actieve case als die verdwijnt.
      setActiveLoadCaseId(curr => curr === id ? (loadCases.find(c => c.id !== id)?.id ?? 1) : curr);
    },
    addCombination: (combo) => {
      setCombinations(prev => {
        const maxId = prev.reduce((m, c) => Math.max(m, c.id), 0);
        return [...prev, { ...combo, id: maxId + 1 }];
      });
    },
    updateCombination: (id, patch) => {
      setCombinations(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    },
    removeCombination: (id) => {
      setCombinations(prev => prev.filter(c => c.id !== id));
      setActiveCombinationId(curr => curr === id ? null : curr);
    },

    /** Replace the entire model from a deserialized project file. */
    loadProjectState: (p: {
      nodes: Node[]; beams: Beam[]; supports: Support[]; plates: Plate[]; loads: Load[];
      loadCases: LoadCase[]; activeLoadCaseId: number;
      selfWeightEnabled?: boolean; nonlinearEnabled?: boolean;
    }) => {
      setNodes(p.nodes);
      setBeams(p.beams);
      setSupports(p.supports);
      setPlates(p.plates);
      setLoads(p.loads);
      setLoadCases(p.loadCases);
      setActiveLoadCaseId(p.activeLoadCaseId);
      setSelfWeightEnabled(!!p.selfWeightEnabled);
      setNonlinearEnabled(!!p.nonlinearEnabled);
      setSelection(null);
      // Reset history so undo can't time-travel back to the previous model.
      setHistory([{ nodes: p.nodes, beams: p.beams, supports: p.supports, plates: p.plates, loads: p.loads }]);
      setHistoryIdx(0);
    },
  };
}
