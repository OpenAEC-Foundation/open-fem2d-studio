import React, { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from 'react';
import { Mesh } from '../core/fem/Mesh';
import { INode, IBeamElement, ISolverResult, IEnvelopeResult, Tool, IViewState, ISelection, AnalysisType, StressType, IPlateReinforcement } from '../core/fem/types';
import { ILoadCase, ILoadCombination } from '../core/fem/LoadCase';
import { convertEdgeLoadToNodalForces, convertEdgeNodeIdsToNodalForces } from '../core/fem/PlateRegion';
import { IStructuralGrid } from '../core/fem/StructuralGrid';
import { calculateThermalNodalForces, calculateBeamThermalNodalForces, calculateBeamThermalLoadForces } from '../core/fem/ThermalLoad';
import { IReportConfig, DEFAULT_REPORT_CONFIG } from '../core/report/ReportConfig';
import { ConsoleService } from '../core/console/ConsoleService';

export type ViewMode = 'geometry' | 'loads' | 'results' | '3d' | 'drawing';
export type BrowserTab = 'project' | 'results';

export interface IProjectInfo {
  name: string;
  projectNumber: string;
  engineer: string;
  company: string;
  date: string;
  description: string;
  notes: string;
  location: string;
  latitude?: number;
  longitude?: number;
}

interface FEMState {
  mesh: Mesh;
  result: ISolverResult | null;
  selectedTool: Tool;
  selection: ISelection;
  selectionFilter: {
    nodes: boolean;
    beams: boolean;
    plates: boolean;
    loads: boolean;
    vertices: boolean;
  };
  viewState: IViewState;
  analysisType: AnalysisType;
  showDeformed: boolean;
  deformationScale: number;
  showStress: boolean;
  stressType: StressType;
  pendingNodes: number[];
  gridSize: number;
  snapToGrid: boolean;
  // Frame-specific state — individual diagram toggles (combinable)
  showMoment: boolean;
  showShear: boolean;
  showNormal: boolean;
  showRotation: boolean;
  diagramScale: number;
  selectedSection: string;
  // View mode (bottom tabs)
  viewMode: ViewMode;
  activeLoadCase: number;
  // Display toggles
  showProfileNames: boolean;
  showReactions: boolean;
  showDimensions: boolean;
  // Element visibility toggles
  showNodes: boolean;
  showMembers: boolean;
  showSupports: boolean;
  showLoads: boolean;
  showNodeLabels: boolean;
  showMemberLabels: boolean;
  showElementTypes: boolean;
  // Force unit
  forceUnit: 'N' | 'kN' | 'MN';
  // Length unit
  lengthUnit: 'm' | 'mm' | 'cm';
  // Displacement unit
  displacementUnit: 'mm' | 'm';
  // Stress unit
  stressUnit: 'MPa' | 'kPa' | 'Pa' | 'N/mm²';
  // Moment of inertia unit
  momentOfInertiaUnit: 'mm⁴' | 'cm⁴' | 'm⁴';
  // Section modulus unit
  sectionModulusUnit: 'mm³' | 'cm³' | 'm³';
  // Area unit
  areaUnit: 'mm²' | 'cm²' | 'm²';
  // Moment unit
  momentUnit: 'kNm' | 'Nm';
  // Distributed load unit
  distributedLoadUnit: 'kN/m' | 'N/m';
  // Plate stress units
  plateBendingMomentUnit: 'kNm/m' | 'Nm/m';  // mxx, myy, mxy
  plateShearForceUnit: 'kN/m' | 'N/m';       // vx, vy
  plateMembraneForceUnit: 'kN/m' | 'N/m';    // nxx, nyy, nxy
  // Active combination for results (null = individual load case)
  activeCombination: number | null;
  // Envelope results (min/max across all combinations)
  showEnvelope: boolean;
  envelopeResult: IEnvelopeResult | null;
  // Active envelope type: 'uls' = ULS envelope (6.10a/b), 'sls' = SLS envelope (6.16/17/18), 'all' = all combinations
  activeEnvelope: 'uls' | 'sls' | 'all' | null;
  // Show displacement values at nodes in results view
  showDisplacements: boolean;
  // Show numerical values on diagrams and stress results
  showDiagramValues: boolean;
  // Auto-recalculate
  autoRecalculate: boolean;
  // Canvas refresh counter
  meshVersion: number;
  // Undo/Redo stacks (JSON snapshots of mesh + loadCases)
  undoStack: string[];
  redoStack: string[];
  // Load cases (structured)
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
  // Project info
  projectInfo: IProjectInfo;
  // Structural grid
  structuralGrid: IStructuralGrid;
  // Deflection diagram toggle
  showDeflections: boolean;
  // Code-check: beam ID for which to show the steel check report
  codeCheckBeamId: number | null;
  // Clipboard for copy/paste
  clipboard: { nodes: INode[]; beamElements: IBeamElement[] } | null;
  // Mouse world position for status bar display
  mouseWorldPos: { x: number; y: number } | null;
  // Canvas size for zoom-to-fit calculations
  canvasSize: { width: number; height: number };
  // Solver error message (shown in status bar)
  solverError: string | null;
  // Show stress gradient overlay on plate elements
  showStressGradient: boolean;
  // Stress display mode: 'element' = per element color, 'smoothed' = interpolated gradient
  stressDisplayMode: 'element' | 'smoothed';
  // Active tab in the ProjectBrowser ('project' or 'results')
  browserTab: BrowserTab;
  // Plate edit mode (for Ribbon Finish button visibility)
  plateEditMode: { mode: 'void' | 'polygon-outline' | 'polygon-void'; plateId?: number } | null;
  // Trigger for finishing plate edit (incremented by Ribbon Finish button)
  finishEditTrigger: number;
  // Report configuration
  reportConfig: IReportConfig;
  // Canvas captures for report (data URLs keyed by capture type)
  canvasCaptures: Map<string, string>;
  // Insights panel active view
  insightsView: InsightsView | null;
  // Active layer for new elements
  activeLayerId: number;
  // Concrete beam view panel visibility
  showConcreteBeamView: boolean;
  // Graph editor state (nodes + wires for persistence)
  graphState: IGraphState | null;
  // Auto-run graph on value changes
  graphAutoRun: boolean;
  // Steel check interval (mm) — how often to check steel sections along beams
  steelCheckInterval: number;
  // Internal versioning system
  versioning: IVersioningState;
}

export interface IGraphState {
  nodes: any[];
  wires: any[];
}

// Internal versioning system types
export interface IVersion {
  id: string;
  name: string;
  timestamp: number;
  branchName: string;
  meshSnapshot: string;   // JSON stringified mesh
  loadCasesSnapshot: string;  // JSON stringified load cases
  loadCombinationsSnapshot: string;  // JSON stringified load combinations
  projectInfoSnapshot: string;  // JSON stringified project info
}

export interface IVersioningState {
  versions: IVersion[];
  currentBranch: string;
  branches: string[];
}

export type InsightsView = 'element-matrix' | 'system-matrix' | 'solver-info' | 'dof-mapping' | 'logs' | 'errors';

type FEMAction =
  | { type: 'SET_MESH'; payload: Mesh }
  | { type: 'SET_RESULT'; payload: ISolverResult | null }
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'TOGGLE_SELECTION_FILTER'; payload: 'nodes' | 'beams' | 'plates' | 'loads' | 'vertices' }
  | { type: 'SET_SELECTION'; payload: Partial<ISelection> & { nodeIds: Set<number>; elementIds: Set<number> } }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SELECT_NODE'; payload: number }
  | { type: 'SELECT_ELEMENT'; payload: number }
  | { type: 'DESELECT_NODE'; payload: number }
  | { type: 'DESELECT_ELEMENT'; payload: number }
  | { type: 'SELECT_POINT_LOAD'; payload: number }
  | { type: 'DESELECT_POINT_LOAD'; payload: number }
  | { type: 'SELECT_DIST_LOAD'; payload: number }
  | { type: 'DESELECT_DIST_LOAD'; payload: number }
  | { type: 'SET_VIEW_STATE'; payload: Partial<IViewState> }
  | { type: 'SET_ANALYSIS_TYPE'; payload: AnalysisType }
  | { type: 'SET_SHOW_DEFORMED'; payload: boolean }
  | { type: 'SET_DEFORMATION_SCALE'; payload: number }
  | { type: 'SET_SHOW_STRESS'; payload: boolean }
  | { type: 'SET_STRESS_TYPE'; payload: StressType }
  | { type: 'ADD_PENDING_NODE'; payload: number }
  | { type: 'CLEAR_PENDING_NODES' }
  | { type: 'REFRESH_MESH' }
  | { type: 'SET_GRID_SIZE'; payload: number }
  | { type: 'SET_SNAP_TO_GRID'; payload: boolean }
  | { type: 'SET_SHOW_MOMENT'; payload: boolean }
  | { type: 'SET_SHOW_SHEAR'; payload: boolean }
  | { type: 'SET_SHOW_NORMAL'; payload: boolean }
  | { type: 'SET_SHOW_ROTATION'; payload: boolean }
  | { type: 'SET_DIAGRAM_SCALE'; payload: number }
  | { type: 'SET_SELECTED_SECTION'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_ACTIVE_LOAD_CASE'; payload: number }
  | { type: 'SET_SHOW_PROFILE_NAMES'; payload: boolean }
  | { type: 'SET_SHOW_REACTIONS'; payload: boolean }
  | { type: 'SET_SHOW_DISPLACEMENTS'; payload: boolean }
  | { type: 'SET_SHOW_DIAGRAM_VALUES'; payload: boolean }
  | { type: 'SET_SHOW_DIMENSIONS'; payload: boolean }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'PUSH_UNDO' }
  | { type: 'SET_LOAD_CASES'; payload: ILoadCase[] }
  | { type: 'SET_LOAD_COMBINATIONS'; payload: ILoadCombination[] }
  | { type: 'SET_ACTIVE_COMBINATION'; payload: number | null }
  | { type: 'ADD_POINT_LOAD'; payload: { lcId: number; nodeId: number; fx: number; fy: number; mz: number; beamId?: number; position?: number } }
  | { type: 'UPDATE_BEAM_POINT_LOAD'; payload: { lcId: number; beamId: number; nodeId: number; position: number } }
  | { type: 'ADD_DISTRIBUTED_LOAD'; payload: { lcId: number; beamId: number; edgeId?: number; qx: number; qy: number; qxEnd?: number; qyEnd?: number; startT?: number; endT?: number; coordSystem?: 'local' | 'global'; description?: string } }
  | { type: 'UPDATE_DISTRIBUTED_LOAD'; payload: { lcId: number; loadId: number; qx: number; qy: number; qxEnd?: number; qyEnd?: number; startT?: number; endT?: number; coordSystem?: 'local' | 'global'; description?: string } }
  | { type: 'REMOVE_POINT_LOAD'; payload: { lcId: number; nodeId: number } }
  | { type: 'REMOVE_DISTRIBUTED_LOAD'; payload: { lcId: number; loadId: number } }
  | { type: 'SELECT_INDIVIDUAL_DIST_LOAD'; payload: number }
  | { type: 'DESELECT_INDIVIDUAL_DIST_LOAD'; payload: number }
  | { type: 'SELECT_PLATE'; payload: number }
  | { type: 'DESELECT_PLATE'; payload: number }
  | { type: 'SELECT_VERTEX'; payload: number }
  | { type: 'DESELECT_VERTEX'; payload: number }
  | { type: 'ADD_THERMAL_LOAD'; payload: { lcId: number; elementId: number; plateId?: number; deltaT: number } }
  | { type: 'REMOVE_THERMAL_LOAD'; payload: { lcId: number; elementId: number } }
  | { type: 'SET_PROJECT_INFO'; payload: Partial<IProjectInfo> }
  | { type: 'LOAD_PROJECT'; payload: { mesh: Mesh; loadCases: ILoadCase[]; loadCombinations: ILoadCombination[]; projectInfo: IProjectInfo; structuralGrid?: IStructuralGrid; graphState?: IGraphState | null; versioning?: IVersioningState } }
  | { type: 'SET_STRUCTURAL_GRID'; payload: IStructuralGrid }
  | { type: 'SET_SHOW_GRID_LINES'; payload: boolean }
  | { type: 'SET_SNAP_TO_GRID_LINES'; payload: boolean }
  | { type: 'SET_SHOW_NODES'; payload: boolean }
  | { type: 'SET_SHOW_MEMBERS'; payload: boolean }
  | { type: 'SET_SHOW_SUPPORTS'; payload: boolean }
  | { type: 'SET_SHOW_LOADS'; payload: boolean }
  | { type: 'SET_SHOW_NODE_LABELS'; payload: boolean }
  | { type: 'SET_SHOW_MEMBER_LABELS'; payload: boolean }
  | { type: 'SET_SHOW_ELEMENT_TYPES'; payload: boolean }
  | { type: 'SET_FORCE_UNIT'; payload: 'N' | 'kN' | 'MN' }
  | { type: 'SET_LENGTH_UNIT'; payload: 'm' | 'mm' | 'cm' }
  | { type: 'SET_DISPLACEMENT_UNIT'; payload: 'mm' | 'm' }
  | { type: 'SET_STRESS_UNIT'; payload: 'MPa' | 'kPa' | 'Pa' | 'N/mm²' }
  | { type: 'SET_MOMENT_OF_INERTIA_UNIT'; payload: 'mm⁴' | 'cm⁴' | 'm⁴' }
  | { type: 'SET_SECTION_MODULUS_UNIT'; payload: 'mm³' | 'cm³' | 'm³' }
  | { type: 'SET_AREA_UNIT'; payload: 'mm²' | 'cm²' | 'm²' }
  | { type: 'SET_MOMENT_UNIT'; payload: 'kNm' | 'Nm' }
  | { type: 'SET_DISTRIBUTED_LOAD_UNIT'; payload: 'kN/m' | 'N/m' }
  | { type: 'SET_PLATE_BENDING_MOMENT_UNIT'; payload: 'kNm/m' | 'Nm/m' }
  | { type: 'SET_PLATE_SHEAR_FORCE_UNIT'; payload: 'kN/m' | 'N/m' }
  | { type: 'SET_PLATE_MEMBRANE_FORCE_UNIT'; payload: 'kN/m' | 'N/m' }
  | { type: 'SET_AUTO_RECALCULATE'; payload: boolean }
  | { type: 'SET_SHOW_ENVELOPE'; payload: boolean }
  | { type: 'SET_ENVELOPE_RESULT'; payload: IEnvelopeResult | null }
  | { type: 'SET_ACTIVE_ENVELOPE'; payload: 'uls' | 'sls' | 'all' | null }
  | { type: 'SET_SHOW_DEFLECTIONS'; payload: boolean }
  | { type: 'SET_CODE_CHECK_BEAM'; payload: number | null }
  | { type: 'CLEANUP_PLATE_LOADS'; payload: { plateId: number; elementIds: number[] } }
  | { type: 'COPY_SELECTED' }
  | { type: 'PASTE'; payload?: { offsetX: number; offsetY: number } }
  | { type: 'SET_MOUSE_WORLD_POS'; payload: { x: number; y: number } | null }
  | { type: 'SET_CANVAS_SIZE'; payload: { width: number; height: number } }
  | { type: 'SET_SOLVER_ERROR'; payload: string | null }
  | { type: 'SET_BROWSER_TAB'; payload: BrowserTab }
  | { type: 'TOGGLE_STRESS_GRADIENT' }
  | { type: 'SET_STRESS_DISPLAY_MODE'; payload: 'element' | 'smoothed' }
  | { type: 'SET_PLATE_EDIT_MODE'; payload: { mode: 'void' | 'polygon-outline' | 'polygon-void'; plateId?: number } | null }
  | { type: 'TRIGGER_FINISH_EDIT' }
  | { type: 'SET_REPORT_CONFIG'; payload: Partial<IReportConfig> }
  | { type: 'SET_CANVAS_CAPTURE'; payload: { key: string; dataUrl: string } }
  | { type: 'CLEAR_CANVAS_CAPTURES' }
  | { type: 'SET_INSIGHTS_VIEW'; payload: InsightsView | null }
  | { type: 'ADD_LAYER'; payload: { name: string; color?: string } }
  | { type: 'UPDATE_LAYER'; payload: { id: number; updates: Partial<{ name: string; color: string; visible: boolean; locked: boolean }> } }
  | { type: 'REMOVE_LAYER'; payload: number }
  | { type: 'SET_ACTIVE_LAYER'; payload: number }
  | { type: 'SET_SHOW_CONCRETE_BEAM_VIEW'; payload: boolean }
  | { type: 'SET_GRAPH_STATE'; payload: IGraphState | null }
  | { type: 'SET_GRAPH_AUTO_RUN'; payload: boolean }
  | { type: 'SET_STEEL_CHECK_INTERVAL'; payload: number }
  // Versioning actions
  | { type: 'CREATE_VERSION'; payload: { name: string } }
  | { type: 'RESTORE_VERSION'; payload: { versionId: string } }
  | { type: 'CREATE_BRANCH'; payload: { branchName: string } }
  | { type: 'SWITCH_BRANCH'; payload: { branchName: string } }
  | { type: 'DELETE_VERSION'; payload: { versionId: string } }
  | { type: 'DELETE_BRANCH'; payload: { branchName: string } }
  | { type: 'UPDATE_PLATE_REINFORCEMENT'; plateId: number; reinforcement: IPlateReinforcement };

function createEmptySelection(): ISelection {
  return {
    nodeIds: new Set(),
    elementIds: new Set(),
    pointLoadNodeIds: new Set(),
    distLoadBeamIds: new Set(),
    selectedDistLoadIds: new Set(),
    plateIds: new Set(),
    vertexIds: new Set(),
    edgeIds: new Set()
  };
}

function createDemoBeamModel(): Mesh {
  const mesh = new Mesh();

  // Unbraced portal frame: 12m span, 5m height
  // Nodes: base left, base right, top left, top right
  const n1 = mesh.addNode(0, 0);     // Base left
  const n2 = mesh.addNode(12, 0);    // Base right
  const n3 = mesh.addNode(0, 5);     // Top left
  const n4 = mesh.addNode(12, 5);    // Top right

  // Fixed supports at column bases
  mesh.updateNode(n1.id, {
    constraints: { x: true, y: true, rotation: true } // Fixed
  });
  mesh.updateNode(n2.id, {
    constraints: { x: true, y: true, rotation: true } // Fixed
  });

  // HEA 160 columns (A=38.77 cm², Iy=1673 cm⁴, h=152mm)
  const hea160 = { A: 38.77e-4, I: 1673e-8, h: 0.152 };
  mesh.addBeamElement([n1.id, n3.id], 1, hea160, 'HEA 160');
  mesh.addBeamElement([n2.id, n4.id], 1, hea160, 'HEA 160');

  // IPE 360 beam (A=72.73 cm², Iy=16270 cm⁴, h=360mm)
  const ipe360 = { A: 72.73e-4, I: 16270e-8, h: 0.360 };
  mesh.addBeamElement([n3.id, n4.id], 1, ipe360, 'IPE 360');

  return mesh;
}

function createDefaultLoadCases(_beamElementId: number): ILoadCase[] {
  // Load cases for portal frame: G, Q, S, W
  // Beam element 3 is the roof beam (IPE 360)
  const roofBeamId = 3;
  return [
    {
      id: 1,
      name: 'Permanent (G)',
      type: 'dead',
      pointLoads: [],
      distributedLoads: [
        { id: 1, elementId: roofBeamId, qx: 0, qy: -5000, coordSystem: 'global' } // 5 kN/m self weight + cladding
      ],
      thermalLoads: [],
      color: '#6b7280'
    },
    {
      id: 2,
      name: 'Variable (Q)',
      type: 'live',
      pointLoads: [],
      distributedLoads: [
        { id: 1, elementId: roofBeamId, qx: 0, qy: -2500, coordSystem: 'global' } // 2.5 kN/m live load
      ],
      thermalLoads: [],
      color: '#3b82f6'
    },
    {
      id: 3,
      name: 'Snow (S)',
      type: 'snow',
      pointLoads: [],
      distributedLoads: [
        { id: 1, elementId: roofBeamId, qx: 0, qy: -4000, coordSystem: 'global' } // 4 kN/m snow load
      ],
      thermalLoads: [],
      color: '#60a5fa'
    },
    {
      id: 4,
      name: 'Wind (W)',
      type: 'wind',
      pointLoads: [],
      distributedLoads: [
        { id: 1, elementId: 1, qx: 1500, qy: 0, coordSystem: 'global' }, // 1.5 kN/m wind on left column
        { id: 2, elementId: 2, qx: -750, qy: 0, coordSystem: 'global' }  // -0.75 kN/m suction on right column
      ],
      thermalLoads: [],
      color: '#22c55e'
    }
  ];
}

function createDefaultCombinations(): ILoadCombination[] {
  // EN 1990 combinations for G (1), Q (2), S (3), W (4)
  // ψ₀: Q=0.7, S=0.5, W=0.6
  // ψ₁: Q=0.5, S=0.2, W=0.2
  // ψ₂: Q=0.3, S=0.0, W=0.0
  return [
    // ULS combinations (6.10a and 6.10b)
    {
      id: 1,
      name: 'ULS 6.10a: 1.08G + 1.35ψ₀Q + 1.35ψ₀S',
      type: '6.10a',
      factors: new Map([[1, 1.08], [2, 1.35 * 0.7], [3, 1.35 * 0.5]])
    },
    {
      id: 2,
      name: 'ULS 6.10b: 1.35G + 1.50Q + 1.50ψ₀S',
      type: '6.10b',
      factors: new Map([[1, 1.35], [2, 1.50], [3, 1.50 * 0.5]])
    },
    {
      id: 3,
      name: 'ULS 6.10b: 1.35G + 1.50S + 1.50ψ₀Q',
      type: '6.10b',
      factors: new Map([[1, 1.35], [2, 1.50 * 0.7], [3, 1.50]])
    },
    {
      id: 4,
      name: 'ULS 6.10b: 1.35G + 1.50W + 1.50ψ₀Q',
      type: '6.10b',
      factors: new Map([[1, 1.35], [2, 1.50 * 0.7], [4, 1.50]])
    },
    {
      id: 5,
      name: 'ULS 6.10b: 1.00G + 1.50W (uplift)',
      type: '6.10b',
      factors: new Map([[1, 1.00], [4, 1.50]])
    },
    {
      id: 6,
      name: 'ULS 6.10b: 1.35G + 1.50Q + 1.50ψ₀S + 1.50ψ₀W',
      type: '6.10b',
      factors: new Map([[1, 1.35], [2, 1.50], [3, 1.50 * 0.5], [4, 1.50 * 0.6]])
    },
    // SLS combinations
    {
      id: 7,
      name: 'SLS 6.16 Characteristic: G + Q + S',
      type: '6.16',
      factors: new Map([[1, 1.0], [2, 1.0], [3, 1.0]])
    },
    {
      id: 8,
      name: 'SLS 6.17 Frequent: G + ψ₁Q + ψ₂S',
      type: '6.17',
      factors: new Map([[1, 1.0], [2, 0.5], [3, 0.0]])
    },
    {
      id: 9,
      name: 'SLS 6.18 Quasi-perm: G + ψ₂Q + ψ₂S',
      type: '6.18',
      factors: new Map([[1, 1.0], [2, 0.3], [3, 0.0]])
    }
  ];
}

function createDefaultStructuralGrid(): IStructuralGrid {
  return {
    verticalLines: [
      { id: 1, name: 'A', position: 0, orientation: 'vertical' },
      { id: 2, name: 'B', position: 12, orientation: 'vertical' }
    ],
    horizontalLines: [
      { id: 3, name: '1', position: 0, orientation: 'horizontal' },
      { id: 4, name: '2', position: 5, orientation: 'horizontal' }
    ],
    showGridLines: true,
    snapToGridLines: true
  };
}

// Serialize load cases for undo/redo snapshots
function serializeLoadCases(loadCases: ILoadCase[]): object[] {
  return loadCases.map(lc => ({ ...lc }));
}

function migrateDistributedLoadIds(lcs: ILoadCase[]): void {
  for (const lc of lcs) {
    if (!lc.distributedLoads) continue;
    let maxId = 0;
    for (const dl of lc.distributedLoads) {
      if (dl.id != null && dl.id > maxId) maxId = dl.id;
    }
    for (const dl of lc.distributedLoads) {
      if (dl.id == null) dl.id = ++maxId;
    }
  }
}

/** Migrate old edgeLoads[] to distributedLoads[] with edgeId (backward compat) */
function migrateEdgeLoads(loadCases: ILoadCase[], mesh: Mesh): void {
  for (const lc of loadCases) {
    if (!lc.edgeLoads || lc.edgeLoads.length === 0) continue;
    for (const el of lc.edgeLoads) {
      // Find the matching IEdge for this edge load
      let edgeId: number | undefined;
      const plateEdges = mesh.getEdgesForPlate(el.plateId);
      for (const iedge of plateEdges) {
        if (typeof el.edge === 'string' && iedge.namedEdge === el.edge) {
          edgeId = iedge.id;
          break;
        }
        if (typeof el.edge === 'number' && iedge.polygonEdgeIndex === el.edge) {
          edgeId = iedge.id;
          break;
        }
      }
      if (edgeId !== undefined) {
        // Find max existing ID
        const maxId = lc.distributedLoads.reduce((m, dl) => Math.max(m, dl.id ?? 0), 0);
        lc.distributedLoads.push({
          id: maxId + 1,
          elementId: 0,
          edgeId,
          qx: el.px,
          qy: el.py,
          coordSystem: 'global',
        });
      }
    }
    // Clear the old edgeLoads array after migration
    lc.edgeLoads = [];
  }
}

function deserializeLoadCases(data: object[]): ILoadCase[] {
  const lcs = data as ILoadCase[];
  migrateDistributedLoadIds(lcs);
  return lcs;
}

// Generate a unique version ID
function generateVersionId(): string {
  return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Serialize load combinations for versioning
function serializeLoadCombinations(combinations: ILoadCombination[]): string {
  return JSON.stringify(combinations.map(lc => ({
    id: lc.id,
    name: lc.name,
    type: lc.type,
    factors: Array.from(lc.factors.entries())
  })));
}

// Deserialize load combinations from versioning
function deserializeLoadCombinations(json: string): ILoadCombination[] {
  const data = JSON.parse(json);
  return data.map((lc: any) => ({
    id: lc.id,
    name: lc.name,
    type: lc.type as 'ULS' | 'SLS',
    factors: new Map(lc.factors)
  }));
}

// Maximum versions per branch to prevent memory issues
const MAX_VERSIONS_PER_BRANCH = 20;

// Helper: apply a load case's loads onto the mesh (for solving)
export function applyLoadCaseToMesh(mesh: Mesh, loadCase: ILoadCase, skipEdgeToNodeConversion = true): void {
  // Clear all existing loads on nodes
  for (const node of mesh.nodes.values()) {
    mesh.updateNode(node.id, { loads: { fx: 0, fy: 0, moment: 0 } });
  }
  // Clear all distributed loads on beams
  for (const beam of mesh.beamElements.values()) {
    mesh.updateBeamElement(beam.id, { distributedLoad: undefined });
  }

  // Apply point loads from load case
  for (const pl of loadCase.pointLoads) {
    // Check if this is a beam point load (has beamId and position)
    if (pl.beamId !== undefined && pl.position !== undefined) {
      // Beam point load: convert to equivalent nodal forces using fixed-end moment formulas
      const beam = mesh.getBeamElement(pl.beamId);
      if (!beam) continue;
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      // Beam length and load position
      const L = Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2);
      const a = pl.position * L;  // distance from start to load
      const b = L - a;            // distance from load to end

      // Fixed-end reactions for point load at position a from start:
      // For vertical load P at position a:
      //   R1 = P * b^2 * (3a + b) / L^3
      //   R2 = P * a^2 * (a + 3b) / L^3
      //   M1 = P * a * b^2 / L^2  (clockwise positive)
      //   M2 = -P * a^2 * b / L^2 (counterclockwise positive)

      // Transform global loads (fx, fy) to beam local coordinates
      const cosA = (n2.x - n1.x) / L;
      const sinA = (n2.y - n1.y) / L;
      // Local: fx_local = fx*cos + fy*sin (axial), fy_local = -fx*sin + fy*cos (transverse)
      const fxLocal = pl.fx * cosA + pl.fy * sinA;  // axial
      const fyLocal = -pl.fx * sinA + pl.fy * cosA; // transverse

      // Equivalent nodal forces for transverse load
      const L3 = L * L * L;
      const L2 = L * L;
      const b2 = b * b;
      const a2 = a * a;

      // Transverse reactions (in local Y)
      const R1y = fyLocal * b2 * (3 * a + b) / L3;
      const R2y = fyLocal * a2 * (a + 3 * b) / L3;
      // Fixed-end moments
      const M1 = fyLocal * a * b2 / L2;
      const M2 = -fyLocal * a2 * b / L2;

      // Axial reactions (simple: proportional to position)
      const R1x = fxLocal * (1 - pl.position);
      const R2x = fxLocal * pl.position;

      // Transform back to global and apply to nodes
      // Node 1
      const fx1Global = R1x * cosA - R1y * sinA;
      const fy1Global = R1x * sinA + R1y * cosA;
      const node1 = mesh.getNode(n1.id);
      if (node1) {
        mesh.updateNode(n1.id, {
          loads: {
            fx: node1.loads.fx + fx1Global,
            fy: node1.loads.fy + fy1Global,
            moment: node1.loads.moment + M1 + pl.mz * (1 - pl.position)
          }
        });
      }

      // Node 2
      const fx2Global = R2x * cosA - R2y * sinA;
      const fy2Global = R2x * sinA + R2y * cosA;
      const node2 = mesh.getNode(n2.id);
      if (node2) {
        mesh.updateNode(n2.id, {
          loads: {
            fx: node2.loads.fx + fx2Global,
            fy: node2.loads.fy + fy2Global,
            moment: node2.loads.moment + M2 + pl.mz * pl.position
          }
        });
      }
    } else {
      // Regular node-based point load
      const node = mesh.getNode(pl.nodeId);
      if (node) {
        mesh.updateNode(pl.nodeId, {
          loads: {
            fx: node.loads.fx + pl.fx,
            fy: node.loads.fy + pl.fy,
            moment: node.loads.moment + pl.mz
          }
        });
      }
    }
  }

  // Apply distributed loads from load case (combine multiple loads per beam additively)
  for (const dl of loadCase.distributedLoads) {
    // Edge-based distributed load: convert to nodal forces on the plate edge
    if (dl.edgeId !== undefined) {
      if (!skipEdgeToNodeConversion) {
        const edge = mesh.getEdge(dl.edgeId);
        if (edge && edge.nodeIds.length >= 2) {
          const nodalForces = convertEdgeNodeIdsToNodalForces(mesh, edge.nodeIds, dl.qx, dl.qy);
          for (const nf of nodalForces) {
            const node = mesh.getNode(nf.nodeId);
            if (node) {
              mesh.updateNode(nf.nodeId, {
                loads: {
                  fx: node.loads.fx + nf.fx,
                  fy: node.loads.fy + nf.fy,
                  moment: node.loads.moment
                }
              });
            }
          }
        }
      }
      continue;
    }

    const beam = mesh.getBeamElement(dl.elementId);
    if (beam) {
      const existing = beam.distributedLoad;
      if (existing) {
        // Combine additively with existing load on this beam
        mesh.updateBeamElement(dl.elementId, {
          distributedLoad: {
            qx: existing.qx + dl.qx,
            qy: existing.qy + dl.qy,
            qxEnd: (existing.qxEnd ?? existing.qx) + (dl.qxEnd ?? dl.qx),
            qyEnd: (existing.qyEnd ?? existing.qy) + (dl.qyEnd ?? dl.qy),
            startT: Math.min(existing.startT ?? 0, dl.startT ?? 0),
            endT: Math.max(existing.endT ?? 1, dl.endT ?? 1),
            coordSystem: dl.coordSystem ?? existing.coordSystem
          }
        });
      } else {
        mesh.updateBeamElement(dl.elementId, {
          distributedLoad: {
            qx: dl.qx,
            qy: dl.qy,
            qxEnd: dl.qxEnd,
            qyEnd: dl.qyEnd,
            startT: dl.startT,
            endT: dl.endT,
            coordSystem: dl.coordSystem
          }
        });
      }
    }
  }

  // Legacy: Apply edge loads from old load case format (backward compatibility)
  if (loadCase.edgeLoads) {
    for (const el of loadCase.edgeLoads) {
      const plate = mesh.getPlateRegion(el.plateId);
      if (plate) {
        const nodalForces = convertEdgeLoadToNodalForces(mesh, plate, el);
        for (const nf of nodalForces) {
          const node = mesh.getNode(nf.nodeId);
          if (node) {
            mesh.updateNode(nf.nodeId, {
              loads: {
                fx: node.loads.fx + nf.fx,
                fy: node.loads.fy + nf.fy,
                moment: node.loads.moment
              }
            });
          }
        }
      }
    }
  }

  // Apply thermal loads from load case
  if (loadCase.thermalLoads) {
    for (const tl of loadCase.thermalLoads) {
      // Check if it's a beam element first
      const beam = mesh.getBeamElement(tl.elementId);
      if (beam) {
        const beamNodes = mesh.getBeamElementNodes(beam);
        if (!beamNodes) continue;
        const [n1, n2] = beamNodes;
        const material = mesh.getMaterial(beam.materialId);
        if (!material) continue;

        const F = calculateBeamThermalNodalForces(n1, n2, beam, material, tl.deltaT);

        // Apply to node 1
        mesh.updateNode(n1.id, {
          loads: {
            fx: n1.loads.fx + F[0],
            fy: n1.loads.fy + F[1],
            moment: n1.loads.moment + F[2]
          }
        });
        // Apply to node 2
        mesh.updateNode(n2.id, {
          loads: {
            fx: n2.loads.fx + F[3],
            fy: n2.loads.fy + F[4],
            moment: n2.loads.moment + F[5]
          }
        });
        continue;
      }

      // Otherwise, check for plate/triangle element
      const element = mesh.getElement(tl.elementId);
      if (!element) continue;
      const nodes = mesh.getElementNodes(element);
      if (nodes.length !== 3) continue;
      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;

      const F = calculateThermalNodalForces(
        nodes[0], nodes[1], nodes[2],
        material, element.thickness, tl.deltaT, 'plane_stress'
      );

      for (let i = 0; i < 3; i++) {
        const node = mesh.getNode(nodes[i].id);
        if (node) {
          mesh.updateNode(node.id, {
            loads: {
              fx: node.loads.fx + F[i * 2],
              fy: node.loads.fy + F[i * 2 + 1],
              moment: node.loads.moment
            }
          });
        }
      }
    }
  }

  // Apply thermal loads from beam element's thermalLoad property
  for (const beam of mesh.beamElements.values()) {
    if (!beam.thermalLoad) continue;
    const beamNodes = mesh.getBeamElementNodes(beam);
    if (!beamNodes) continue;
    const [n1, n2] = beamNodes;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const F = calculateBeamThermalLoadForces(n1, n2, beam, material);
    if (F.every(v => v === 0)) continue;

    // Apply to node 1
    mesh.updateNode(n1.id, {
      loads: {
        fx: n1.loads.fx + F[0],
        fy: n1.loads.fy + F[1],
        moment: n1.loads.moment + F[2]
      }
    });
    // Apply to node 2
    mesh.updateNode(n2.id, {
      loads: {
        fx: n2.loads.fx + F[3],
        fy: n2.loads.fy + F[4],
        moment: n2.loads.moment + F[5]
      }
    });
  }
}

// Apply combined loads from multiple load cases with factors
export function applyCombinedLoadsToMesh(mesh: Mesh, loadCases: ILoadCase[], combination: ILoadCombination): void {
  // Clear all existing loads
  for (const node of mesh.nodes.values()) {
    mesh.updateNode(node.id, { loads: { fx: 0, fy: 0, moment: 0 } });
  }
  for (const beam of mesh.beamElements.values()) {
    mesh.updateBeamElement(beam.id, { distributedLoad: undefined });
  }

  for (const lc of loadCases) {
    const factor = combination.factors.get(lc.id) ?? 0;
    if (factor === 0) continue;

    for (const pl of lc.pointLoads) {
      const node = mesh.getNode(pl.nodeId);
      if (node) {
        mesh.updateNode(pl.nodeId, {
          loads: {
            fx: node.loads.fx + pl.fx * factor,
            fy: node.loads.fy + pl.fy * factor,
            moment: node.loads.moment + pl.mz * factor
          }
        });
      }
    }

    for (const dl of lc.distributedLoads) {
      // Edge-based distributed load
      if (dl.edgeId !== undefined) {
        const edge = mesh.getEdge(dl.edgeId);
        if (edge && edge.nodeIds.length >= 2) {
          const nodalForces = convertEdgeNodeIdsToNodalForces(mesh, edge.nodeIds, dl.qx * factor, dl.qy * factor);
          for (const nf of nodalForces) {
            const node = mesh.getNode(nf.nodeId);
            if (node) {
              mesh.updateNode(nf.nodeId, {
                loads: {
                  fx: node.loads.fx + nf.fx,
                  fy: node.loads.fy + nf.fy,
                  moment: node.loads.moment
                }
              });
            }
          }
        }
        continue;
      }

      const beam = mesh.getBeamElement(dl.elementId);
      if (beam) {
        const existing = beam.distributedLoad ?? { qx: 0, qy: 0 };
        mesh.updateBeamElement(dl.elementId, {
          distributedLoad: {
            qx: existing.qx + dl.qx * factor,
            qy: existing.qy + dl.qy * factor,
            qxEnd: (existing.qxEnd ?? existing.qx) + (dl.qxEnd ?? dl.qx) * factor,
            qyEnd: (existing.qyEnd ?? existing.qy) + (dl.qyEnd ?? dl.qy) * factor,
            startT: dl.startT,
            endT: dl.endT,
            coordSystem: dl.coordSystem
          }
        });
      }
    }

    // Legacy: Apply edge loads with factor (backward compatibility)
    if (lc.edgeLoads) {
      for (const el of lc.edgeLoads) {
        const plate = mesh.getPlateRegion(el.plateId);
        if (plate) {
          const factoredLoad = { ...el, px: el.px * factor, py: el.py * factor };
          const nodalForces = convertEdgeLoadToNodalForces(mesh, plate, factoredLoad);
          for (const nf of nodalForces) {
            const node = mesh.getNode(nf.nodeId);
            if (node) {
              mesh.updateNode(nf.nodeId, {
                loads: {
                  fx: node.loads.fx + nf.fx,
                  fy: node.loads.fy + nf.fy,
                  moment: node.loads.moment
                }
              });
            }
          }
        }
      }
    }
  }
}

const demoMesh = createDemoBeamModel();
// The demo model has beam element IDs starting at 1; beam 1 is the first span
const demoLoadCases = createDefaultLoadCases(1);

const initialState: FEMState = {
  mesh: demoMesh,
  result: null,
  selectedTool: 'select',
  selection: createEmptySelection(),
  selectionFilter: { nodes: true, beams: true, plates: true, loads: true, vertices: true },
  viewState: { offsetX: 150, offsetY: 350, scale: 80 },
  analysisType: 'frame',
  showDeformed: false,
  deformationScale: 20,
  showStress: false,
  stressType: 'vonMises',
  pendingNodes: [],
  gridSize: 0.5,
  snapToGrid: false,
  showMoment: true,
  showShear: false,
  showNormal: false,
  showRotation: false,
  diagramScale: 50,
  selectedSection: 'IPE 200',
  viewMode: 'geometry',
  activeLoadCase: 1,
  showProfileNames: false,
  showReactions: true,
  showDisplacements: false,
  showDiagramValues: false,
  showDimensions: true,
  showNodes: true,
  showMembers: true,
  showSupports: true,
  showLoads: true,
  showNodeLabels: true,
  showMemberLabels: true,
  showElementTypes: false,
  forceUnit: 'kN',
  lengthUnit: 'm',
  displacementUnit: 'mm',
  stressUnit: 'N/mm²',
  momentOfInertiaUnit: 'mm⁴',
  sectionModulusUnit: 'mm³',
  areaUnit: 'mm²',
  momentUnit: 'kNm',
  distributedLoadUnit: 'kN/m',
  plateBendingMomentUnit: 'kNm/m',
  plateShearForceUnit: 'kN/m',
  plateMembraneForceUnit: 'kN/m',
  activeCombination: null,
  showEnvelope: false,
  envelopeResult: null,
  activeEnvelope: null,
  autoRecalculate: true,
  meshVersion: 0,
  undoStack: [],
  redoStack: [],
  loadCases: demoLoadCases,
  loadCombinations: createDefaultCombinations(),
  projectInfo: {
    name: 'Untitled Project',
    projectNumber: '',
    engineer: '',
    company: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    notes: '',
    location: ''
  },
  structuralGrid: createDefaultStructuralGrid(),
  showDeflections: false,
  codeCheckBeamId: null,
  clipboard: null,
  mouseWorldPos: null,
  canvasSize: { width: 800, height: 600 },
  solverError: null,
  showStressGradient: true,
  stressDisplayMode: 'element',
  browserTab: 'project',
  plateEditMode: null,
  finishEditTrigger: 0,
  reportConfig: DEFAULT_REPORT_CONFIG,
  canvasCaptures: new Map<string, string>(),
  insightsView: null,
  activeLayerId: 0,
  showConcreteBeamView: false,
  graphState: null,
  graphAutoRun: true,
  steelCheckInterval: 100, // mm
  versioning: {
    versions: [],
    currentBranch: 'main',
    branches: ['main']
  }
};

// Apply demo load case loads to mesh so they render on first load
applyLoadCaseToMesh(initialState.mesh, initialState.loadCases[0]);

function femReducer(state: FEMState, action: FEMAction): FEMState {
  switch (action.type) {
    case 'SET_MESH':
      return { ...state, mesh: action.payload, result: null };

    case 'SET_RESULT':
      return {
        ...state,
        result: action.payload,
        solverError: null,
        // Auto-switch ProjectBrowser to Results tab when solve completes
        browserTab: action.payload !== null ? 'results' as BrowserTab : state.browserTab
      };

    case 'SET_SOLVER_ERROR':
      return { ...state, solverError: action.payload };

    case 'SET_TOOL':
      return { ...state, selectedTool: action.payload, pendingNodes: [] };

    case 'TOGGLE_SELECTION_FILTER':
      return {
        ...state,
        selectionFilter: {
          ...state.selectionFilter,
          [action.payload]: !state.selectionFilter[action.payload]
        }
      };

    case 'SET_SELECTION':
      return {
        ...state,
        selection: {
          nodeIds: action.payload.nodeIds ?? new Set(),
          elementIds: action.payload.elementIds ?? new Set(),
          pointLoadNodeIds: action.payload.pointLoadNodeIds ?? new Set(),
          distLoadBeamIds: action.payload.distLoadBeamIds ?? new Set(),
          selectedDistLoadIds: action.payload.selectedDistLoadIds ?? new Set(),
          plateIds: action.payload.plateIds ?? new Set(),
          vertexIds: action.payload.vertexIds ?? new Set(),
          edgeIds: action.payload.edgeIds ?? new Set()
        }
      };

    case 'CLEAR_SELECTION':
      return { ...state, selection: createEmptySelection() };

    case 'SELECT_NODE': {
      const newNodeIds = new Set(state.selection.nodeIds);
      newNodeIds.add(action.payload);
      return { ...state, selection: { ...state.selection, nodeIds: newNodeIds } };
    }

    case 'SELECT_ELEMENT': {
      const newElementIds = new Set(state.selection.elementIds);
      newElementIds.add(action.payload);
      return { ...state, selection: { ...state.selection, elementIds: newElementIds } };
    }

    case 'DESELECT_NODE': {
      const newNodeIds = new Set(state.selection.nodeIds);
      newNodeIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, nodeIds: newNodeIds } };
    }

    case 'DESELECT_ELEMENT': {
      const newElementIds = new Set(state.selection.elementIds);
      newElementIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, elementIds: newElementIds } };
    }

    case 'SELECT_POINT_LOAD': {
      const newIds = new Set(state.selection.pointLoadNodeIds);
      newIds.add(action.payload);
      return { ...state, selection: { ...state.selection, pointLoadNodeIds: newIds } };
    }

    case 'DESELECT_POINT_LOAD': {
      const newIds = new Set(state.selection.pointLoadNodeIds);
      newIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, pointLoadNodeIds: newIds } };
    }

    case 'SELECT_DIST_LOAD': {
      const newIds = new Set(state.selection.distLoadBeamIds);
      newIds.add(action.payload);
      return { ...state, selection: { ...state.selection, distLoadBeamIds: newIds } };
    }

    case 'DESELECT_DIST_LOAD': {
      const newIds = new Set(state.selection.distLoadBeamIds);
      newIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, distLoadBeamIds: newIds } };
    }

    case 'SELECT_INDIVIDUAL_DIST_LOAD': {
      const newIds = new Set(state.selection.selectedDistLoadIds);
      newIds.add(action.payload);
      return { ...state, selection: { ...state.selection, selectedDistLoadIds: newIds } };
    }

    case 'DESELECT_INDIVIDUAL_DIST_LOAD': {
      const newIds = new Set(state.selection.selectedDistLoadIds);
      newIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, selectedDistLoadIds: newIds } };
    }

    case 'SET_VIEW_STATE':
      return { ...state, viewState: { ...state.viewState, ...action.payload } };

    case 'SET_ANALYSIS_TYPE':
      return { ...state, analysisType: action.payload, result: null };

    case 'SET_SHOW_DEFORMED':
      return { ...state, showDeformed: action.payload };

    case 'SET_DEFORMATION_SCALE':
      return { ...state, deformationScale: action.payload };

    case 'SET_SHOW_STRESS':
      return { ...state, showStress: action.payload };

    case 'SET_STRESS_TYPE':
      return { ...state, stressType: action.payload };

    case 'ADD_PENDING_NODE':
      return { ...state, pendingNodes: [...state.pendingNodes, action.payload] };

    case 'CLEAR_PENDING_NODES':
      return { ...state, pendingNodes: [] };

    case 'REFRESH_MESH':
      return { ...state, meshVersion: state.meshVersion + 1 };

    case 'SET_GRID_SIZE':
      return { ...state, gridSize: action.payload };

    case 'SET_SNAP_TO_GRID':
      return { ...state, snapToGrid: action.payload };

    case 'SET_SHOW_MOMENT':
      return { ...state, showMoment: action.payload };

    case 'SET_SHOW_SHEAR':
      return { ...state, showShear: action.payload };

    case 'SET_SHOW_NORMAL':
      return { ...state, showNormal: action.payload };

    case 'SET_SHOW_ROTATION':
      return { ...state, showRotation: action.payload };

    case 'SET_DIAGRAM_SCALE':
      return { ...state, diagramScale: action.payload };

    case 'SET_SELECTED_SECTION':
      return { ...state, selectedSection: action.payload };

    case 'SET_VIEW_MODE':
      return {
        ...state,
        viewMode: action.payload,
        // Auto-switch browser tab to 'results' when entering results view mode
        browserTab: action.payload === 'results' ? 'results' as BrowserTab : state.browserTab
      };

    case 'SET_ACTIVE_LOAD_CASE':
      return { ...state, activeLoadCase: action.payload };

    case 'SET_SHOW_PROFILE_NAMES':
      return { ...state, showProfileNames: action.payload };

    case 'SET_SHOW_REACTIONS':
      return { ...state, showReactions: action.payload };

    case 'SET_SHOW_DISPLACEMENTS':
      return { ...state, showDisplacements: action.payload };

    case 'SET_SHOW_DIAGRAM_VALUES':
      return { ...state, showDiagramValues: action.payload };

    case 'SET_SHOW_DIMENSIONS':
      return { ...state, showDimensions: action.payload };

    case 'PUSH_UNDO': {
      const meshSnapshot = JSON.stringify(state.mesh.toJSON());
      const lcSnapshot = JSON.stringify(serializeLoadCases(state.loadCases));
      const snapshot = JSON.stringify({ mesh: meshSnapshot, loadCases: lcSnapshot });
      const newStack = [...state.undoStack, snapshot];
      if (newStack.length > 50) newStack.shift();
      return { ...state, undoStack: newStack, redoStack: [] };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const newUndo = [...state.undoStack];
      const snapshot = newUndo.pop()!;
      const currentMeshSnapshot = JSON.stringify(state.mesh.toJSON());
      const currentLcSnapshot = JSON.stringify(serializeLoadCases(state.loadCases));
      const redoSnapshot = JSON.stringify({ mesh: currentMeshSnapshot, loadCases: currentLcSnapshot });

      const parsed = JSON.parse(snapshot);
      const restoredMesh = Mesh.fromJSON(JSON.parse(parsed.mesh));
      const restoredLoadCases = deserializeLoadCases(JSON.parse(parsed.loadCases));

      return {
        ...state,
        mesh: restoredMesh,
        loadCases: restoredLoadCases,
        undoStack: newUndo,
        redoStack: [...state.redoStack, redoSnapshot],
        meshVersion: state.meshVersion + 1,
        result: null
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const newRedo = [...state.redoStack];
      const snapshot = newRedo.pop()!;
      const currentMeshSnapshot = JSON.stringify(state.mesh.toJSON());
      const currentLcSnapshot = JSON.stringify(serializeLoadCases(state.loadCases));
      const undoSnapshot = JSON.stringify({ mesh: currentMeshSnapshot, loadCases: currentLcSnapshot });

      const parsed = JSON.parse(snapshot);
      const restoredMesh = Mesh.fromJSON(JSON.parse(parsed.mesh));
      const restoredLoadCases = deserializeLoadCases(JSON.parse(parsed.loadCases));

      return {
        ...state,
        mesh: restoredMesh,
        loadCases: restoredLoadCases,
        undoStack: [...state.undoStack, undoSnapshot],
        redoStack: newRedo,
        meshVersion: state.meshVersion + 1,
        result: null
      };
    }

    case 'SET_LOAD_CASES':
      return { ...state, loadCases: action.payload };

    case 'SET_LOAD_COMBINATIONS':
      return { ...state, loadCombinations: action.payload };

    case 'SET_ACTIVE_COMBINATION':
      return { ...state, activeCombination: action.payload };

    case 'ADD_POINT_LOAD': {
      const { lcId, nodeId, fx, fy, mz, beamId, position } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        // For beam point loads (beamId set), use beamId:nodeId as unique key
        // For node-based loads, use nodeId as key
        const isBeamLoad = beamId !== undefined && position !== undefined;
        const filtered = lc.pointLoads.filter(pl => {
          if (isBeamLoad) {
            // Remove if same beamId and nodeId
            return !(pl.beamId === beamId && pl.nodeId === nodeId);
          } else {
            // Remove if same nodeId (old behavior for node-based loads)
            return pl.nodeId !== nodeId || pl.beamId !== undefined;
          }
        });
        if (fx !== 0 || fy !== 0 || mz !== 0) {
          if (isBeamLoad) {
            filtered.push({ nodeId, fx, fy, mz, beamId, position });
          } else {
            filtered.push({ nodeId, fx, fy, mz });
          }
        }
        return { ...lc, pointLoads: filtered };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'UPDATE_BEAM_POINT_LOAD': {
      const { lcId, beamId, nodeId, position } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        const updatedLoads = lc.pointLoads.map(pl => {
          if (pl.beamId === beamId && pl.nodeId === nodeId) {
            return { ...pl, position };
          }
          return pl;
        });
        return { ...lc, pointLoads: updatedLoads };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'ADD_DISTRIBUTED_LOAD': {
      const { lcId, beamId, edgeId, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        if (qx === 0 && qy === 0 && (qxEnd === undefined || qxEnd === 0) && (qyEnd === undefined || qyEnd === 0)) {
          return lc; // Don't add zero loads
        }
        // Auto-generate a unique id for the new load
        const maxId = lc.distributedLoads.reduce((max, dl) => Math.max(max, dl.id ?? 0), 0);
        const effectiveElementId = edgeId !== undefined ? 0 : beamId;
        const newLoad = { id: maxId + 1, elementId: effectiveElementId, edgeId, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description };
        return { ...lc, distributedLoads: [...lc.distributedLoads, newLoad] };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'UPDATE_DISTRIBUTED_LOAD': {
      const { lcId, loadId, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        const updatedLoads = lc.distributedLoads.map(dl => {
          if (dl.id !== loadId) return dl;
          // If all values are zero, keep the load but with zero values (use REMOVE to delete)
          return { ...dl, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description };
        });
        return { ...lc, distributedLoads: updatedLoads };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'REMOVE_POINT_LOAD': {
      const { lcId, nodeId } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        return { ...lc, pointLoads: lc.pointLoads.filter(pl => pl.nodeId !== nodeId) };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'REMOVE_DISTRIBUTED_LOAD': {
      const { lcId, loadId } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        return { ...lc, distributedLoads: lc.distributedLoads.filter(dl => dl.id !== loadId) };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'SELECT_PLATE': {
      const newPlateIds = new Set(state.selection.plateIds);
      newPlateIds.add(action.payload);
      return { ...state, selection: { ...state.selection, plateIds: newPlateIds } };
    }

    case 'DESELECT_PLATE': {
      const newPlateIds = new Set(state.selection.plateIds);
      newPlateIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, plateIds: newPlateIds } };
    }

    case 'SELECT_VERTEX': {
      const newVertexIds = new Set(state.selection.vertexIds);
      newVertexIds.add(action.payload);
      return { ...state, selection: { ...state.selection, vertexIds: newVertexIds } };
    }

    case 'DESELECT_VERTEX': {
      const newVertexIds = new Set(state.selection.vertexIds);
      newVertexIds.delete(action.payload);
      return { ...state, selection: { ...state.selection, vertexIds: newVertexIds } };
    }

    case 'ADD_THERMAL_LOAD': {
      const { lcId, elementId, plateId, deltaT } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        const filtered = (lc.thermalLoads || []).filter(tl => tl.elementId !== elementId);
        if (deltaT !== 0) {
          filtered.push({ elementId, plateId, deltaT });
        }
        return { ...lc, thermalLoads: filtered };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'REMOVE_THERMAL_LOAD': {
      const { lcId, elementId } = action.payload;
      const newLoadCases = state.loadCases.map(lc => {
        if (lc.id !== lcId) return lc;
        return { ...lc, thermalLoads: (lc.thermalLoads || []).filter(tl => tl.elementId !== elementId) };
      });
      return { ...state, loadCases: newLoadCases };
    }

    case 'SET_PROJECT_INFO':
      return { ...state, projectInfo: { ...state.projectInfo, ...action.payload } };

    case 'LOAD_PROJECT': {
      const { mesh, loadCases, loadCombinations, projectInfo, structuralGrid, graphState, versioning } = action.payload;
      // Migrate: ensure all distributed loads have IDs (backward compat with old projects)
      migrateDistributedLoadIds(loadCases);
      migrateEdgeLoads(loadCases, mesh);
      // Migrate: create plate vertices for polygon plates that don't have them
      for (const plate of mesh.plateRegions.values()) {
        if (plate.isPolygon && plate.polygon && mesh.getVerticesForPlate(plate.id).length === 0) {
          mesh.createVerticesForPlate(plate.id, plate.polygon);
        }
      }
      return {
        ...state,
        mesh,
        loadCases,
        loadCombinations,
        projectInfo,
        structuralGrid: structuralGrid ?? createDefaultStructuralGrid(),
        graphState: graphState ?? null,
        versioning: versioning ?? { versions: [], currentBranch: 'main', branches: ['main'] },
        result: null,
        undoStack: [],
        redoStack: [],
        selection: createEmptySelection(),
        meshVersion: state.meshVersion + 1
      };
    }

    case 'SET_STRUCTURAL_GRID': {
      const newGrid = action.payload;
      const oldGrid = state.structuralGrid;
      // Move nodes associated with grid lines that changed position
      const allOldLines = [...oldGrid.verticalLines, ...oldGrid.horizontalLines];
      const allNewLines = [...newGrid.verticalLines, ...newGrid.horizontalLines];
      const oldPosMap = new Map(allOldLines.map(l => [l.id, l]));
      for (const newLine of allNewLines) {
        const oldLine = oldPosMap.get(newLine.id);
        if (oldLine && oldLine.position !== newLine.position) {
          // This grid line moved — update associated nodes
          for (const [nodeId, node] of state.mesh.nodes) {
            if (node.gridLineId === newLine.id) {
              if (newLine.orientation === 'vertical') {
                state.mesh.updateNode(nodeId, { x: newLine.position });
              } else {
                state.mesh.updateNode(nodeId, { y: newLine.position });
              }
            }
          }
        }
      }
      return { ...state, structuralGrid: newGrid, meshVersion: state.meshVersion + 1 };
    }

    case 'SET_SHOW_GRID_LINES':
      return { ...state, structuralGrid: { ...state.structuralGrid, showGridLines: action.payload } };

    case 'SET_SNAP_TO_GRID_LINES':
      return { ...state, structuralGrid: { ...state.structuralGrid, snapToGridLines: action.payload } };

    case 'SET_SHOW_NODES':
      return { ...state, showNodes: action.payload };

    case 'SET_SHOW_MEMBERS':
      return { ...state, showMembers: action.payload };

    case 'SET_SHOW_SUPPORTS':
      return { ...state, showSupports: action.payload };

    case 'SET_SHOW_LOADS':
      return { ...state, showLoads: action.payload };

    case 'SET_SHOW_NODE_LABELS':
      return { ...state, showNodeLabels: action.payload };

    case 'SET_SHOW_MEMBER_LABELS':
      return { ...state, showMemberLabels: action.payload };

    case 'SET_SHOW_ELEMENT_TYPES':
      return { ...state, showElementTypes: action.payload };

    case 'SET_FORCE_UNIT':
      return { ...state, forceUnit: action.payload };

    case 'SET_LENGTH_UNIT':
      return { ...state, lengthUnit: action.payload };

    case 'SET_DISPLACEMENT_UNIT':
      return { ...state, displacementUnit: action.payload };

    case 'SET_STRESS_UNIT':
      return { ...state, stressUnit: action.payload };

    case 'SET_MOMENT_OF_INERTIA_UNIT':
      return { ...state, momentOfInertiaUnit: action.payload };

    case 'SET_SECTION_MODULUS_UNIT':
      return { ...state, sectionModulusUnit: action.payload };

    case 'SET_AREA_UNIT':
      return { ...state, areaUnit: action.payload };

    case 'SET_MOMENT_UNIT':
      return { ...state, momentUnit: action.payload };

    case 'SET_DISTRIBUTED_LOAD_UNIT':
      return { ...state, distributedLoadUnit: action.payload };

    case 'SET_PLATE_BENDING_MOMENT_UNIT':
      return { ...state, plateBendingMomentUnit: action.payload };

    case 'SET_PLATE_SHEAR_FORCE_UNIT':
      return { ...state, plateShearForceUnit: action.payload };

    case 'SET_PLATE_MEMBRANE_FORCE_UNIT':
      return { ...state, plateMembraneForceUnit: action.payload };

    case 'SET_AUTO_RECALCULATE':
      return { ...state, autoRecalculate: action.payload };

    case 'SET_SHOW_ENVELOPE':
      return { ...state, showEnvelope: action.payload };

    case 'SET_ENVELOPE_RESULT':
      return { ...state, envelopeResult: action.payload };

    case 'SET_ACTIVE_ENVELOPE':
      return {
        ...state,
        activeEnvelope: action.payload,
        // When activating envelope, clear individual combination selection
        activeCombination: action.payload ? null : state.activeCombination,
        showEnvelope: action.payload !== null
      };

    case 'SET_SHOW_DEFLECTIONS':
      return { ...state, showDeflections: action.payload };

    case 'SET_CODE_CHECK_BEAM':
      return { ...state, codeCheckBeamId: action.payload };

    case 'CLEANUP_PLATE_LOADS': {
      const { plateId, elementIds } = action.payload;
      const elementIdSet = new Set(elementIds);
      // Find edge IDs belonging to this plate for filtering distributed edge loads
      const plateObj = state.mesh.getPlateRegion(plateId);
      const plateEdgeIds = new Set(plateObj?.edgeIds ?? []);
      const cleanedLoadCases = state.loadCases.map(lc => ({
        ...lc,
        edgeLoads: (lc.edgeLoads || []).filter(el => el.plateId !== plateId),
        distributedLoads: lc.distributedLoads.filter(dl =>
          dl.edgeId === undefined || !plateEdgeIds.has(dl.edgeId)
        ),
        thermalLoads: (lc.thermalLoads || []).filter(tl =>
          tl.plateId !== plateId && !elementIdSet.has(tl.elementId)
        )
      }));
      return { ...state, loadCases: cleanedLoadCases };
    }

    case 'COPY_SELECTED': {
      const selectedNodeIds = state.selection.nodeIds;
      const selectedElementIds = state.selection.elementIds;
      if (selectedNodeIds.size === 0 && selectedElementIds.size === 0) return state;

      // Collect selected nodes
      const copiedNodes: INode[] = [];
      for (const nodeId of selectedNodeIds) {
        const node = state.mesh.getNode(nodeId);
        if (node) copiedNodes.push({ ...node });
      }

      // Collect beam elements where BOTH nodes are in the selection,
      // or elements that are explicitly selected and have both nodes selected
      const copiedBeams: IBeamElement[] = [];
      const copiedNodeIdSet = new Set(copiedNodes.map(n => n.id));

      // First: include explicitly selected beam elements if both nodes are selected
      for (const elemId of selectedElementIds) {
        const beam = state.mesh.getBeamElement(elemId);
        if (beam && copiedNodeIdSet.has(beam.nodeIds[0]) && copiedNodeIdSet.has(beam.nodeIds[1])) {
          copiedBeams.push({ ...beam });
        }
      }

      // Second: find any beam elements where both nodes are in the selection (implicit)
      for (const beam of state.mesh.beamElements.values()) {
        if (copiedNodeIdSet.has(beam.nodeIds[0]) && copiedNodeIdSet.has(beam.nodeIds[1])) {
          // Avoid duplicates
          if (!copiedBeams.find(b => b.id === beam.id)) {
            copiedBeams.push({ ...beam });
          }
        }
      }

      return {
        ...state,
        clipboard: { nodes: copiedNodes, beamElements: copiedBeams }
      };
    }

    case 'PASTE': {
      if (!state.clipboard || state.clipboard.nodes.length === 0) return state;

      const offsetX = action.payload?.offsetX ?? 1;
      const offsetY = action.payload?.offsetY ?? 1;

      // Push undo before modifying
      const meshSnapshot = JSON.stringify(state.mesh.toJSON());
      const lcSnapshot = JSON.stringify(serializeLoadCases(state.loadCases));
      const snapshot = JSON.stringify({ mesh: meshSnapshot, loadCases: lcSnapshot });
      const newUndoStack = [...state.undoStack, snapshot];
      if (newUndoStack.length > 50) newUndoStack.shift();

      // Mapping from old node ID to new node ID
      const nodeIdMap = new Map<number, number>();
      const newNodeIds = new Set<number>();
      const newElementIds = new Set<number>();

      // Create new nodes at offset positions
      for (const clipNode of state.clipboard.nodes) {
        const newNode = state.mesh.addNode(clipNode.x + offsetX, clipNode.y + offsetY);
        nodeIdMap.set(clipNode.id, newNode.id);
        newNodeIds.add(newNode.id);

        // Copy constraints from the original node
        state.mesh.updateNode(newNode.id, {
          constraints: { ...clipNode.constraints }
        });
      }

      // Create new beam elements with mapped node IDs
      for (const clipBeam of state.clipboard.beamElements) {
        const newNodeId0 = nodeIdMap.get(clipBeam.nodeIds[0]);
        const newNodeId1 = nodeIdMap.get(clipBeam.nodeIds[1]);
        if (newNodeId0 !== undefined && newNodeId1 !== undefined) {
          const newBeam = state.mesh.addBeamElement(
            [newNodeId0, newNodeId1],
            clipBeam.materialId,
            { ...clipBeam.section },
            clipBeam.profileName
          );
          if (newBeam) {
            newElementIds.add(newBeam.id);
            // Copy connection types and end releases if present
            const updates: Partial<typeof clipBeam> = {};
            if (clipBeam.startConnection) updates.startConnection = clipBeam.startConnection;
            if (clipBeam.endConnection) updates.endConnection = clipBeam.endConnection;
            if (clipBeam.endReleases) updates.endReleases = { ...clipBeam.endReleases };
            if (Object.keys(updates).length > 0) {
              state.mesh.updateBeamElement(newBeam.id, updates);
            }
          }
        }
      }

      return {
        ...state,
        selection: {
          nodeIds: newNodeIds,
          elementIds: newElementIds,
          pointLoadNodeIds: new Set(),
          distLoadBeamIds: new Set(),
          selectedDistLoadIds: new Set(),
          plateIds: new Set(),
          vertexIds: new Set(),
          edgeIds: new Set()
        },
        undoStack: newUndoStack,
        redoStack: [],
        meshVersion: state.meshVersion + 1,
        result: null
      };
    }

    case 'SET_MOUSE_WORLD_POS':
      return { ...state, mouseWorldPos: action.payload };

    case 'SET_CANVAS_SIZE':
      return { ...state, canvasSize: action.payload };

    case 'SET_BROWSER_TAB':
      return { ...state, browserTab: action.payload };

    case 'TOGGLE_STRESS_GRADIENT':
      return { ...state, showStressGradient: !state.showStressGradient };

    case 'SET_STRESS_DISPLAY_MODE':
      return { ...state, stressDisplayMode: action.payload };

    case 'SET_PLATE_EDIT_MODE':
      return { ...state, plateEditMode: action.payload };

    case 'TRIGGER_FINISH_EDIT':
      return { ...state, finishEditTrigger: state.finishEditTrigger + 1 };

    case 'SET_REPORT_CONFIG':
      return {
        ...state,
        reportConfig: {
          ...state.reportConfig,
          ...action.payload,
          // Handle sections separately to ensure proper merging
          sections: action.payload.sections ?? state.reportConfig.sections
        }
      };

    case 'SET_CANVAS_CAPTURE': {
      const newCaptures = new Map(state.canvasCaptures);
      newCaptures.set(action.payload.key, action.payload.dataUrl);
      return { ...state, canvasCaptures: newCaptures };
    }

    case 'CLEAR_CANVAS_CAPTURES':
      return { ...state, canvasCaptures: new Map<string, string>() };

    case 'SET_INSIGHTS_VIEW':
      return { ...state, insightsView: action.payload };

    case 'ADD_LAYER': {
      const layer = state.mesh.addLayer(action.payload.name, action.payload.color);
      return { ...state, meshVersion: state.meshVersion + 1, activeLayerId: layer.id };
    }

    case 'UPDATE_LAYER': {
      state.mesh.updateLayer(action.payload.id, action.payload.updates);
      return { ...state, meshVersion: state.meshVersion + 1 };
    }

    case 'REMOVE_LAYER': {
      state.mesh.removeLayer(action.payload);
      const newActiveLayer = state.activeLayerId === action.payload ? 0 : state.activeLayerId;
      return { ...state, meshVersion: state.meshVersion + 1, activeLayerId: newActiveLayer };
    }

    case 'SET_ACTIVE_LAYER':
      return { ...state, activeLayerId: action.payload };

    case 'SET_SHOW_CONCRETE_BEAM_VIEW':
      return { ...state, showConcreteBeamView: action.payload };

    case 'SET_GRAPH_STATE':
      return { ...state, graphState: action.payload };

    case 'SET_GRAPH_AUTO_RUN':
      return { ...state, graphAutoRun: action.payload };

    case 'SET_STEEL_CHECK_INTERVAL':
      return { ...state, steelCheckInterval: action.payload };

    // Versioning actions
    case 'CREATE_VERSION': {
      const { name } = action.payload;
      const { versioning, mesh, loadCases, loadCombinations, projectInfo } = state;

      const newVersion: IVersion = {
        id: generateVersionId(),
        name,
        timestamp: Date.now(),
        branchName: versioning.currentBranch,
        meshSnapshot: JSON.stringify(mesh.toJSON()),
        loadCasesSnapshot: JSON.stringify(serializeLoadCases(loadCases)),
        loadCombinationsSnapshot: serializeLoadCombinations(loadCombinations),
        projectInfoSnapshot: JSON.stringify(projectInfo)
      };

      // Get versions for the current branch and limit to MAX_VERSIONS_PER_BRANCH
      const branchVersions = versioning.versions.filter(v => v.branchName === versioning.currentBranch);
      const otherBranchVersions = versioning.versions.filter(v => v.branchName !== versioning.currentBranch);

      // Add new version and trim oldest if over limit
      let updatedBranchVersions = [...branchVersions, newVersion];
      if (updatedBranchVersions.length > MAX_VERSIONS_PER_BRANCH) {
        updatedBranchVersions = updatedBranchVersions.slice(-MAX_VERSIONS_PER_BRANCH);
      }

      return {
        ...state,
        versioning: {
          ...versioning,
          versions: [...otherBranchVersions, ...updatedBranchVersions]
        }
      };
    }

    case 'RESTORE_VERSION': {
      const { versionId } = action.payload;
      const { versioning } = state;

      const version = versioning.versions.find(v => v.id === versionId);
      if (!version) return state;

      const restoredMesh = Mesh.fromJSON(JSON.parse(version.meshSnapshot));
      const restoredLoadCases = deserializeLoadCases(JSON.parse(version.loadCasesSnapshot));
      const restoredLoadCombinations = deserializeLoadCombinations(version.loadCombinationsSnapshot);
      const restoredProjectInfo = JSON.parse(version.projectInfoSnapshot) as IProjectInfo;

      return {
        ...state,
        mesh: restoredMesh,
        loadCases: restoredLoadCases,
        loadCombinations: restoredLoadCombinations,
        projectInfo: restoredProjectInfo,
        result: null,
        meshVersion: state.meshVersion + 1,
        selection: createEmptySelection(),
        // Also switch to the branch this version belongs to
        versioning: {
          ...versioning,
          currentBranch: version.branchName
        }
      };
    }

    case 'CREATE_BRANCH': {
      const { branchName } = action.payload;
      const { versioning } = state;

      // Don't create duplicate branches
      if (versioning.branches.includes(branchName)) return state;

      return {
        ...state,
        versioning: {
          ...versioning,
          branches: [...versioning.branches, branchName],
          currentBranch: branchName
        }
      };
    }

    case 'SWITCH_BRANCH': {
      const { branchName } = action.payload;
      const { versioning } = state;

      // Only switch to existing branches
      if (!versioning.branches.includes(branchName)) return state;

      return {
        ...state,
        versioning: {
          ...versioning,
          currentBranch: branchName
        }
      };
    }

    case 'DELETE_VERSION': {
      const { versionId } = action.payload;
      const { versioning } = state;

      return {
        ...state,
        versioning: {
          ...versioning,
          versions: versioning.versions.filter(v => v.id !== versionId)
        }
      };
    }

    case 'DELETE_BRANCH': {
      const { branchName } = action.payload;
      const { versioning } = state;

      // Cannot delete main branch
      if (branchName === 'main') return state;

      // Cannot delete current branch
      if (branchName === versioning.currentBranch) return state;

      return {
        ...state,
        versioning: {
          ...versioning,
          branches: versioning.branches.filter(b => b !== branchName),
          versions: versioning.versions.filter(v => v.branchName !== branchName)
        }
      };
    }

    case 'UPDATE_PLATE_REINFORCEMENT': {
      const { plateId, reinforcement } = action;
      const plate = state.mesh.plateRegions.get(plateId);
      if (!plate) return state;

      // Update plate with reinforcement config
      const updatedPlate = { ...plate, reinforcement };
      state.mesh.plateRegions.set(plateId, updatedPlate);

      return {
        ...state,
        meshVersion: state.meshVersion + 1
      };
    }

    default:
      return state;
  }
}

interface FEMContextType {
  state: FEMState;
  dispatch: React.Dispatch<FEMAction>;
  pushUndo: () => void;
}

const FEMContext = createContext<FEMContextType | null>(null);

export function FEMProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(femReducer, initialState);

  const dispatch = useMemo(() => {
    return (action: FEMAction) => {
      ConsoleService.logDispatch(action.type, (action as any).payload);
      rawDispatch(action);
    };
  }, []);

  const pushUndo = useCallback(() => {
    dispatch({ type: 'PUSH_UNDO' });
  }, [dispatch]);

  return (
    <FEMContext.Provider value={{ state, dispatch, pushUndo }}>
      {children}
    </FEMContext.Provider>
  );
}

export function useFEM() {
  const context = useContext(FEMContext);
  if (!context) {
    throw new Error('useFEM must be used within a FEMProvider');
  }
  return context;
}
