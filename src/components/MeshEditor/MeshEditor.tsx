import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useFEM, applyLoadCaseToMesh } from '../../context/FEMContext';
import { INode, IBeamElement, IBeamSection, ConnectionType, getConnectionTypes } from '../../core/fem/types';
import { getStressColor, generateColorScale, formatResultValue } from '../../utils/colors';
import { calculateBeamLength, calculateBeamAngle } from '../../core/fem/Beam';
import { formatForce, formatMoment } from '../../core/fem/BeamForces';
import { SectionPropertiesDialog } from '../SectionPropertiesDialog/SectionPropertiesDialog';
import { LoadDialog } from '../LoadDialog/LoadDialog';
import { BarPropertiesDialog } from '../BarPropertiesDialog/BarPropertiesDialog';
import { NodePropertiesDialog } from '../NodePropertiesDialog/NodePropertiesDialog';
import { LineLoadDialog } from '../LineLoadDialog/LineLoadDialog';
import { PlateDialog } from '../PlateDialog/PlateDialog';
import { ThermalLoadDialog } from '../ThermalLoadDialog/ThermalLoadDialog';
import { PlatePropertiesDialog } from '../PlatePropertiesDialog/PlatePropertiesDialog';
import { DimensionEditDialog } from '../DimensionEditDialog/DimensionEditDialog';
import { generatePolygonPlateMesh, generatePolygonPlateMeshV2, fixupEdgePlateIds, createEdgesForRectPlate, removePlateRegion, remeshPlateRegion, remeshPolygonPlateRegion, remeshPolygonPlateRegionFromContour, findPlateCornerForNode, pointInPolygon, polygonCentroid } from '../../core/fem/PlateRegion';
import { buildNodeIdToIndex } from '../../core/solver/Assembler';
import { checkSteelSection } from '../../core/standards/SteelCheck';
import { STEEL_GRADES } from '../../core/standards/EurocodeNL';
import './MeshEditor.css';
import { IGridLine } from '../../core/fem/StructuralGrid';
import { useI18n } from '../../i18n/i18n';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'node' | 'beam' | 'canvas';
  id?: number;
}

interface MeshEditorProps {
  onShowGridsDialog?: () => void;
}

/**
 * Check if two line segments intersect (excluding shared endpoints)
 */
function segmentsIntersectPoints(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number }
): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function direction(pi: { x: number; y: number }, pj: { x: number; y: number }, pk: { x: number; y: number }): number {
  return (pk.x - pi.x) * (pj.y - pi.y) - (pj.x - pi.x) * (pk.y - pi.y);
}

/**
 * Check if a polygon is self-intersecting (edges cross each other)
 */
function isPolygonSelfIntersecting(polygon: { x: number; y: number }[]): boolean {
  const n = polygon.length;
  if (n < 4) return false; // Triangle can't self-intersect

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Check against all non-adjacent edges
    for (let j = i + 2; j < n; j++) {
      // Skip if the edges share a vertex
      if (j === (i + n - 1) % n) continue;

      const p3 = polygon[j];
      const p4 = polygon[(j + 1) % n];

      // Skip if edges share a vertex
      if ((j + 1) % n === i) continue;

      if (segmentsIntersectPoints(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute signed area of a polygon using the trapezoidal/shoelace formula.
 * In a Y-up coordinate system: negative = CCW, positive = CW.
 */
function polygonArea(polygon: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return area / 2;
}

export function MeshEditor({ onShowGridsDialog }: MeshEditorProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const captureModeRef = useRef(false);
  const drawRef = useRef<(() => void) | null>(null);
  const { state, dispatch, pushUndo } = useFEM();
  const {
    mesh,
    result,
    selectedTool,
    selection,
    viewState,
    analysisType,
    showDeformed,
    deformationScale,
    showStress,
    stressType,
    pendingNodes,
    gridSize,
    snapToGrid,
    showMoment,
    showShear,
    showNormal,
    diagramScale,
    viewMode,
    showProfileNames,
    showReactions,
    meshVersion,
    structuralGrid,
    loadCases,
    activeLoadCase,
    showDimensions,
    showNodes,
    showMembers,
    showSupports,
    showLoads,
    showNodeLabels,
    showMemberLabels,
    showElementTypes,
    forceUnit,
    showDisplacements,
    showDeflections,
    autoRecalculate,
    showEnvelope,
    envelopeResult,
    showStressGradient,
    stressDisplayMode,
    stressUnit,
    plateBendingMomentUnit,
    plateShearForceUnit,
    plateMembraneForceUnit,
    finishEditTrigger,
    activeLayerId
  } = state;

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = useState<number | null>(null);
  const [gizmoAxis, setGizmoAxis] = useState<'x' | 'y' | 'free' | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [dragNodeOrigin, setDragNodeOrigin] = useState<{ x: number; y: number } | null>(null);
  const [snapNodeId, setSnapNodeId] = useState<number | null>(null);
  const [editingDimension, setEditingDimension] = useState<{
    beamId: number;
    screenX: number;
    screenY: number;
    currentLength: number;
  } | null>(null);

  // Dimension edit dialog (double-click on dimension line)
  const [dimDialogBeamId, setDimDialogBeamId] = useState<number | null>(null);

  // Pending beam awaiting section profile selection
  const [pendingBeamNodeIds, setPendingBeamNodeIds] = useState<[number, number] | null>(null);
  const [showSectionDialog, setShowSectionDialog] = useState(false);

  // Remember last used beam section so continuous beam drawing skips the dialog
  const [lastUsedSection, setLastUsedSection] = useState<{ section: IBeamSection; profileName: string } | null>(null);

  // Load dialog for editing point loads
  const [editingLoadNodeId, setEditingLoadNodeId] = useState<number | null>(null);

  // Bar properties dialog (double-click on bar)
  const [editingBarId, setEditingBarId] = useState<number | null>(null);

  // Line load input dialog (beam or plate edge)
  const [lineLoadBeamId, setLineLoadBeamId] = useState<number | null>(null);
  const [lineLoadEdgeId, setLineLoadEdgeId] = useState<number | null>(null); // IEdge ID when targeting a plate edge
  // When editing an existing distributed load (double-click), track its id
  const [editingDistLoadId, setEditingDistLoadId] = useState<number | null>(null);

  // Node properties dialog (double-click on node)
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);

  // Plate properties dialog (double-click on plate)
  const [editingPlateId, setEditingPlateId] = useState<number | null>(null);

  // Hovered beam for line load / addLoad tool highlight
  const [hoveredBeamId, setHoveredBeamId] = useState<number | null>(null);

  // Hovered plate edge for addLineLoad tool
  const [hoveredEdgeId, setHoveredEdgeId] = useState<number | null>(null);

  // Hovered node for pre-highlight
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);

  // Tooltip mouse position (screen coords relative to container)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Line load shape handle resizing
  const [resizingLoadBeamId, setResizingLoadBeamId] = useState<number | null>(null);
  const [resizeStartQy, setResizeStartQy] = useState<number>(0);
  const [resizeStartQyEnd, setResizeStartQyEnd] = useState<number>(0);
  const [resizingLoadEnd, setResizingLoadEnd] = useState<'start' | 'end' | null>(null);
  // Handle type: 'magnitude' for qy/qyEnd adjustment, 'length' for startT/endT adjustment
  const [resizingLoadHandleType, setResizingLoadHandleType] = useState<'magnitude' | 'length'>('magnitude');
  const [resizeStartT, setResizeStartT] = useState<number>(0);
  const [resizeEndT, setResizeEndT] = useState<number>(1);

  // Beam mid-gizmo dragging
  const [draggedBeamId, setDraggedBeamId] = useState<number | null>(null);
  const [beamDragOrigins, setBeamDragOrigins] = useState<{ n1: { x: number; y: number }; n2: { x: number; y: number } } | null>(null);

  // Grid line interaction
  const [draggedGridLineId, setDraggedGridLineId] = useState<number | null>(null);
  const [draggedGridLineType, setDraggedGridLineType] = useState<'vertical' | 'horizontal' | null>(null);

  // Selection box (rubber band)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number; startY: number; endX: number; endY: number;
  } | null>(null);

  // Length input for beam drawing (triggered by typing a number while placing beam)
  const [beamLengthInput, setBeamLengthInput] = useState<string | null>(null);

  // Plate drawing tool state (polygon mode only)
  const [showPlateDialog, setShowPlateDialog] = useState(false);
  const [platePolygonPoints, setPlatePolygonPoints] = useState<{x: number, y: number}[]>([]);
  const [plateVoids, setPlateVoids] = useState<{x: number, y: number}[][]>([]);
  const [plateEditState, setPlateEditState] = useState<'outline' | 'void' | null>(null);
  const [currentVoidPoints, setCurrentVoidPoints] = useState<{x: number, y: number}[]>([]);
  const [pendingPolygonPlate, setPendingPolygonPlate] = useState<{
    outline: {x: number, y: number}[];
    voids: {x: number, y: number}[][];
    bbox: {x: number, y: number, w: number, h: number};
  } | null>(null);

  // Void drawing on existing plate (from PlatePropertiesDialog "+" button)
  const [voidTargetPlateId, setVoidTargetPlateId] = useState<number | null>(null);

  // Arc mode for polygon/void drawing
  const [arcMode, setArcMode] = useState(false);

  // Rotate tool state
  const [rotateCenter, setRotateCenter] = useState<{x: number, y: number} | null>(null);
  const [rotateAngleInput, setRotateAngleInput] = useState<string | null>(null);

  // Angle dimension for selected beam (click to edit angle, rotates around first node)
  const [angleEditBeamId, setAngleEditBeamId] = useState<number | null>(null);
  const [angleEditInput, setAngleEditInput] = useState<string>('');

  // Polygon corner vertex dragging (drag a polygon vertex without moving mesh nodes until mouseUp)
  const [polygonCornerDrag, setPolygonCornerDrag] = useState<{
    plateId: number;
    vertexIndex: number;
    nodeId: number;
    originVertex: { x: number; y: number };
  } | null>(null);

  // Polygon contour edge dragging (grab edge midpoint to move both vertices)
  const [contourEdgeDrag, setContourEdgeDrag] = useState<{
    plateId: number;
    edgeIndex: number;  // polygon edge index (v[i] -> v[i+1])
    originV1: { x: number; y: number };
    originV2: { x: number; y: number };
  } | null>(null);


  // Thermal load dialog
  const [thermalLoadElementIds, setThermalLoadElementIds] = useState<number[]>([]);
  const [thermalLoadPlateId, setThermalLoadPlateId] = useState<number | undefined>(undefined);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // i18n hook
  const { t } = useI18n();

  // Arc discretization helper: semicircular arc from start to end
  const discretizeArc = useCallback((start: {x:number, y:number}, end: {x:number, y:number}, numSegments = 12): {x:number, y:number}[] => {
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const halfChord = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) / 2;
    if (halfChord < 1e-6) return [end];
    const startAngle = Math.atan2(start.y - my, start.x - mx);
    const pts: {x:number, y:number}[] = [];
    for (let i = 1; i <= numSegments; i++) {
      const angle = startAngle + (i / numSegments) * Math.PI;
      pts.push({ x: mx + halfChord * Math.cos(angle), y: my + halfChord * Math.sin(angle) });
    }
    return pts;
  }, []);

  // Canvas capture function for report images
  const captureCanvas = useCallback((key: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      dispatch({ type: 'SET_CANVAS_CAPTURE', payload: { key, dataUrl } });
    } catch (e) {
      console.error('Failed to capture canvas:', e);
    }
  }, [dispatch]);

  // Track viewState via ref so captureCanvasForReport doesn't depend on state.viewState
  const viewStateRef = useRef(state.viewState);
  viewStateRef.current = state.viewState;

  // Capture with zoom-to-fit and no grid (for report use)
  // Uses viewStateRef override to render offscreen without modifying real viewport (prevents flicker)
  const captureCanvasForReport = useCallback((key: string) => {
    const canvas = canvasRef.current;
    if (!canvas || mesh.nodes.size === 0) return;
    if (captureModeRef.current) return;

    // Calculate zoom-to-fit bounds
    const nodes = Array.from(mesh.nodes.values());
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }
    if (maxX - minX < 0.001) { minX -= 1; maxX += 1; }
    if (maxY - minY < 0.001) { minY -= 1; maxY += 1; }
    const { width: cw, height: ch } = state.canvasSize;
    const padding = 0.12;
    const availW = cw * (1 - 2 * padding);
    const availH = ch * (1 - 2 * padding);
    const scaleX = availW / (maxX - minX);
    const scaleY = availH / (maxY - minY);
    const newScale = Math.min(scaleX, scaleY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = cw / 2 - centerX * newScale;
    const offsetY = ch / 2 + centerY * newScale;

    // Override viewStateRef temporarily (no dispatch = no React re-render = no flicker)
    const savedViewState = { ...viewStateRef.current };
    captureModeRef.current = true;
    viewStateRef.current = { scale: newScale, offsetX, offsetY };

    // Synchronously redraw at zoom-to-fit, capture, then restore
    drawRef.current?.();
    captureCanvas(key);

    viewStateRef.current = savedViewState;
    captureModeRef.current = false;
    drawRef.current?.();
  }, [captureCanvas, mesh, state.canvasSize]);

  // Capture current canvas state on every render (for report use)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'geometry') {
        captureCanvasForReport('geometry');
      } else if (viewMode === 'results' && result) {
        captureCanvasForReport('results');
        if (showMoment) captureCanvasForReport('moment');
        if (showShear) captureCanvasForReport('shear');
        if (showNormal) captureCanvasForReport('normal');
        if (showDeformed) captureCanvasForReport('deformed');
        if (showReactions) captureCanvasForReport('reactions');
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [viewMode, result, showMoment, showShear, showNormal, showDeformed, showReactions, captureCanvasForReport, meshVersion]);

  // Capture load case specific view when activeLoadCase changes
  useEffect(() => {
    if (viewMode === 'geometry' && activeLoadCase) {
      const timer = setTimeout(() => {
        captureCanvas(`loadcase_${activeLoadCase}`);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeLoadCase, viewMode, captureCanvas, meshVersion]);

  // Global max values for force diagrams - use ONE scale for all beams
  const globalForceMaxes = useMemo(() => {
    if (!result || result.beamForces.size === 0) {
      return { maxM: 1, maxV: 1, maxN: 1 };
    }
    let maxM = 0, maxV = 0, maxN = 0;
    for (const forces of result.beamForces.values()) {
      // Check detailed station values if available
      if (forces.bendingMoment) {
        for (const m of forces.bendingMoment) maxM = Math.max(maxM, Math.abs(m));
      } else {
        maxM = Math.max(maxM, Math.abs(forces.M1), Math.abs(forces.M2), Math.abs(forces.maxM || 0));
      }
      if (forces.shearForce) {
        for (const v of forces.shearForce) maxV = Math.max(maxV, Math.abs(v));
      } else {
        maxV = Math.max(maxV, Math.abs(forces.V1), Math.abs(forces.V2), Math.abs(forces.maxV || 0));
      }
      if (forces.normalForce) {
        for (const n of forces.normalForce) maxN = Math.max(maxN, Math.abs(n));
      } else {
        maxN = Math.max(maxN, Math.abs(forces.N1), Math.abs(forces.N2), Math.abs(forces.maxN || 0));
      }
    }
    return { maxM: maxM || 1, maxV: maxV || 1, maxN: maxN || 1 };
  }, [result]);

  // Global max q-load for distributed load scaling - use ONE scale for all loads
  const globalMaxQ = useMemo(() => {
    let maxQ = 0;
    // Check beam's own distributedLoad (applied directly to beam)
    for (const beam of mesh.beamElements.values()) {
      if (beam.distributedLoad) {
        const { qy } = beam.distributedLoad;
        const qyE = beam.distributedLoad.qyEnd ?? qy;
        maxQ = Math.max(maxQ, Math.abs(qy), Math.abs(qyE));
      }
    }
    // Check all load cases for stored distributed loads
    for (const lc of loadCases) {
      if (lc.distributedLoads) {
        for (const dl of lc.distributedLoads) {
          const qyE = dl.qyEnd ?? dl.qy;
          maxQ = Math.max(maxQ, Math.abs(dl.qy), Math.abs(qyE));
        }
      }
    }
    return maxQ || 1;
  }, [mesh.beamElements, loadCases, meshVersion]);

  // Draw gizmo for selected node
  const drawGizmo = useCallback((
    ctx: CanvasRenderingContext2D,
    screen: { x: number; y: number }
  ) => {
    const arrowLength = 50;
    const arrowHead = 12;

    // X axis (red)
    ctx.strokeStyle = gizmoAxis === 'x' ? '#ff6b6b' : '#ef4444';
    ctx.fillStyle = gizmoAxis === 'x' ? '#ff6b6b' : '#ef4444';
    ctx.lineWidth = gizmoAxis === 'x' ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screen.x + arrowLength, screen.y);
    ctx.stroke();
    // Arrow head
    ctx.beginPath();
    ctx.moveTo(screen.x + arrowLength + arrowHead, screen.y);
    ctx.lineTo(screen.x + arrowLength, screen.y - 5);
    ctx.lineTo(screen.x + arrowLength, screen.y + 5);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('X', screen.x + arrowLength + 16, screen.y + 4);

    // Y axis (green)
    ctx.strokeStyle = gizmoAxis === 'y' ? '#6bff6b' : '#22c55e';
    ctx.fillStyle = gizmoAxis === 'y' ? '#6bff6b' : '#22c55e';
    ctx.lineWidth = gizmoAxis === 'y' ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screen.x, screen.y - arrowLength);
    ctx.stroke();
    // Arrow head
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y - arrowLength - arrowHead);
    ctx.lineTo(screen.x - 5, screen.y - arrowLength);
    ctx.lineTo(screen.x + 5, screen.y - arrowLength);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.fillText('Z', screen.x - 4, screen.y - arrowLength - 16);

    // Center square
    ctx.fillStyle = gizmoAxis === 'free' ? '#60a5fa' : '#4299e1';
    ctx.fillRect(screen.x - 6, screen.y - 6, 12, 12);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(screen.x - 6, screen.y - 6, 12, 12);
  }, [gizmoAxis]);

  const getGizmoAxis = useCallback((screenX: number, screenY: number, nodeScreen: { x: number; y: number }): 'x' | 'y' | 'free' | null => {
    const tolerance = 10;
    const arrowLength = 50;

    // Check X axis arrow
    if (Math.abs(screenY - nodeScreen.y) < tolerance &&
        screenX > nodeScreen.x + 6 && screenX < nodeScreen.x + arrowLength + 15) {
      return 'x';
    }

    // Check Y axis arrow
    if (Math.abs(screenX - nodeScreen.x) < tolerance &&
        screenY < nodeScreen.y - 6 && screenY > nodeScreen.y - arrowLength - 15) {
      return 'y';
    }

    // Check center square (free drag)
    if (Math.abs(screenX - nodeScreen.x) <= 8 && Math.abs(screenY - nodeScreen.y) <= 8) {
      return 'free';
    }

    return null;
  }, []);

  // Use viewStateRef so these callbacks are stable and don't trigger draw() recreation on every pan/zoom
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const vs = viewStateRef.current;
    const x = (screenX - vs.offsetX) / vs.scale;
    const y = -(screenY - vs.offsetY) / vs.scale;
    return { x, y };
  }, []);

  const worldToScreen = useCallback((worldX: number, worldY: number) => {
    const vs = viewStateRef.current;
    const x = worldX * vs.scale + vs.offsetX;
    const y = -worldY * vs.scale + vs.offsetY;
    return { x, y };
  }, []);

  const snapToGridFn = useCallback((x: number, y: number, useBarSnap?: boolean) => {
    let snappedX = x;
    let snappedY = y;

    if (snapToGrid) {
      // Use 100mm snap for bar placement, otherwise use grid size
      const snap = useBarSnap ? 0.1 : gridSize;
      snappedX = Math.round(x / snap) * snap;
      snappedY = Math.round(y / snap) * snap;
    }

    // Also snap to structural grid lines if enabled
    if (structuralGrid.snapToGridLines) {
      const tolerance = gridSize * 0.5;
      for (const line of structuralGrid.verticalLines) {
        if (Math.abs(x - line.position) < tolerance) {
          snappedX = line.position;
          break;
        }
      }
      for (const line of structuralGrid.horizontalLines) {
        if (Math.abs(y - line.position) < tolerance) {
          snappedY = line.position;
          break;
        }
      }
    }

    return { x: snappedX, y: snappedY };
  }, [snapToGrid, gridSize, structuralGrid]);

  const findNodeAtScreen = useCallback((screenX: number, screenY: number): INode | null => {
    const tolerance = 10 / viewState.scale;
    const world = screenToWorld(screenX, screenY);

    for (const node of mesh.nodes.values()) {
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      if (Math.sqrt(dx * dx + dy * dy) < tolerance) {
        return node;
      }
    }
    return null;
  }, [mesh, viewState, screenToWorld]);

  const findElementAtScreen = useCallback((screenX: number, screenY: number): number | null => {
    const world = screenToWorld(screenX, screenY);

    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      if (nodes.length === 3) {
        if (pointInTriangle(world, nodes[0], nodes[1], nodes[2])) {
          return element.id;
        }
      } else if (nodes.length === 4) {
        // Quad: test as two triangles (BL,BR,TR) and (BL,TR,TL)
        if (pointInTriangle(world, nodes[0], nodes[1], nodes[2]) ||
            pointInTriangle(world, nodes[0], nodes[2], nodes[3])) {
          return element.id;
        }
      }
    }
    return null;
  }, [mesh, screenToWorld]);

  const findBeamAtScreen = useCallback((screenX: number, screenY: number): IBeamElement | null => {
    const world = screenToWorld(screenX, screenY);
    const tolerance = 15 / viewState.scale;

    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      // Point to line segment distance
      const dist = pointToLineDistance(world, n1, n2);
      if (dist < tolerance) {
        return beam;
      }
    }
    return null;
  }, [mesh, screenToWorld, viewState.scale]);

  // Find beam at screen coordinates AND return parametric position (0-1) along beam
  const findBeamAtScreenWithPosition = useCallback((screenX: number, screenY: number): { beam: IBeamElement; t: number } | null => {
    const world = screenToWorld(screenX, screenY);
    const tolerance = 15 / viewState.scale;

    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      let t = ((world.x - n1.x) * dx + (world.y - n1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const closestX = n1.x + t * dx;
      const closestY = n1.y + t * dy;
      const dist = Math.sqrt((world.x - closestX) ** 2 + (world.y - closestY) ** 2);

      if (dist < tolerance) {
        return { beam, t };
      }
    }
    return null;
  }, [mesh, screenToWorld, viewState.scale]);

  const findDimensionAtScreen = useCallback((screenX: number, screenY: number): {
    beamId: number; midX: number; midY: number; length: number;
  } | null => {
    const dimOffset = 30;

    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);

      const length = calculateBeamLength(n1, n2);

      // Compute perpendicular in screen space (+ PI/2 = below beam in screen coords)
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = screenAngle + Math.PI / 2;

      const offsetX = Math.cos(perpAngle) * dimOffset;
      const offsetY = Math.sin(perpAngle) * dimOffset;

      const d1 = { x: p1.x + offsetX, y: p1.y + offsetY };
      const d2 = { x: p2.x + offsetX, y: p2.y + offsetY };

      const midX = (d1.x + d2.x) / 2;
      const midY = (d1.y + d2.y) / 2;

      if (Math.abs(screenX - midX) < 40 && Math.abs(screenY - midY) < 14) {
        return { beamId: beam.id, midX, midY, length };
      }
    }

    return null;
  }, [mesh, worldToScreen]);

  // Find structural grid line at screen position
  const findGridLineAtScreen = useCallback((sx: number, sy: number): { line: IGridLine; type: 'vertical' | 'horizontal' } | null => {
    if (!structuralGrid.showGridLines) return null;
    const world = screenToWorld(sx, sy);
    const threshold = 10 / viewState.scale; // 10 pixels in world coords

    for (const line of structuralGrid.verticalLines) {
      if (Math.abs(world.x - line.position) < threshold) {
        return { line, type: 'vertical' };
      }
    }
    for (const line of structuralGrid.horizontalLines) {
      if (Math.abs(world.y - line.position) < threshold) {
        return { line, type: 'horizontal' };
      }
    }
    return null;
  }, [structuralGrid, screenToWorld, viewState.scale]);

  // Find load resize handle at screen position (for selected beams with distributed loads)
  const findLoadHandleAtScreen = useCallback((screenX: number, screenY: number): {
    beamId: number; end: 'start' | 'end'; handleType: 'magnitude' | 'length';
  } | null => {
    const handleHitRadius = 10;

    // Check both element selection and dist load selection
    const beamIdsToCheck = new Set([...selection.elementIds, ...selection.distLoadBeamIds]);
    for (const beamId of beamIdsToCheck) {
      const beam = mesh.getBeamElement(beamId);
      if (!beam?.distributedLoad) continue;
      const { qy } = beam.distributedLoad;
      const qyEnd = beam.distributedLoad.qyEnd ?? qy;

      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);

      const startT = beam.distributedLoad.startT ?? 0;
      const endT = beam.distributedLoad.endT ?? 1;
      const coordSystem = beam.distributedLoad.coordSystem ?? 'local';
      const isGlobal = coordSystem === 'global';
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = isGlobal ? -Math.PI / 2 : screenAngle - Math.PI / 2;

      // Calculate arrow lengths based on qy values
      const startArrowLen = Math.min(60, Math.abs(qy) / 500 * 40 + 20);
      const endArrowLen = Math.min(60, Math.abs(qyEnd) / 500 * 40 + 20);
      const signStart = qy >= 0 ? -1 : 1;
      const signEnd = qyEnd >= 0 ? -1 : 1;

      const loadP1 = {
        x: p1.x + (p2.x - p1.x) * startT,
        y: p1.y + (p2.y - p1.y) * startT
      };
      const loadP2 = {
        x: p1.x + (p2.x - p1.x) * endT,
        y: p1.y + (p2.y - p1.y) * endT
      };

      // Magnitude handles (at arrow tips)
      const startTop = {
        x: loadP1.x + Math.cos(perpAngle) * startArrowLen * signStart,
        y: loadP1.y + Math.sin(perpAngle) * startArrowLen * signStart
      };
      const endTop = {
        x: loadP2.x + Math.cos(perpAngle) * endArrowLen * signEnd,
        y: loadP2.y + Math.sin(perpAngle) * endArrowLen * signEnd
      };

      // Check magnitude handles first (prioritize over length handles)
      if (qy !== 0 || qyEnd !== 0) {
        const dStartMag = Math.sqrt((screenX - startTop.x) ** 2 + (screenY - startTop.y) ** 2);
        if (dStartMag < handleHitRadius) return { beamId: beam.id, end: 'start', handleType: 'magnitude' };

        const dEndMag = Math.sqrt((screenX - endTop.x) ** 2 + (screenY - endTop.y) ** 2);
        if (dEndMag < handleHitRadius) return { beamId: beam.id, end: 'end', handleType: 'magnitude' };
      }

      // Length handles (on the beam, at loadP1 and loadP2)
      const dStartLen = Math.sqrt((screenX - loadP1.x) ** 2 + (screenY - loadP1.y) ** 2);
      if (dStartLen < handleHitRadius) return { beamId: beam.id, end: 'start', handleType: 'length' };

      const dEndLen = Math.sqrt((screenX - loadP2.x) ** 2 + (screenY - loadP2.y) ** 2);
      if (dEndLen < handleHitRadius) return { beamId: beam.id, end: 'end', handleType: 'length' };
    }

    return null;
  }, [mesh, selection, worldToScreen]);

  // Find point load arrow at screen position
  const findPointLoadAtScreen = useCallback((screenX: number, screenY: number): number | null => {
    for (const node of mesh.nodes.values()) {
      if (node.loads.fx === 0 && node.loads.fy === 0 && node.loads.moment === 0) continue;
      const screen = worldToScreen(node.x, node.y);
      const mag = Math.sqrt(node.loads.fx ** 2 + node.loads.fy ** 2);
      if (mag === 0) continue;

      const arrowLength = 50;
      const dx = (node.loads.fx / mag) * arrowLength;
      const dy = -(node.loads.fy / mag) * arrowLength;
      const startX = screen.x - dx;
      const startY = screen.y - dy;

      // Point-to-segment distance
      const segDx = screen.x - startX;
      const segDy = screen.y - startY;
      const lenSq = segDx * segDx + segDy * segDy;
      if (lenSq === 0) continue;
      let t = ((screenX - startX) * segDx + (screenY - startY) * segDy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const closestX = startX + t * segDx;
      const closestY = startY + t * segDy;
      const dist = Math.sqrt((screenX - closestX) ** 2 + (screenY - closestY) ** 2);
      if (dist < 10) return node.id;
    }
    return null;
  }, [mesh, worldToScreen]);

  // Find distributed load at screen position — returns { beamId, loadId } for individual load selection
  const findDistLoadAtScreen = useCallback((screenX: number, screenY: number): { beamId: number; loadId: number } | null => {
    const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
    if (!activeLc) return null;

    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      const beamLoads = activeLc.distributedLoads.filter(dl => dl.elementId === beam.id);
      if (beamLoads.length === 0) continue;

      // Iterate loads in reverse draw order (topmost first) so topmost load gets picked first
      let cumulativeOffset = 0;
      const loadBands: { loadId: number; offsetStart: number; offsetEnd: number; perpAngle: number; startT: number; endT: number }[] = [];
      for (const dl of beamLoads) {
        if (dl.qx === 0 && dl.qy === 0 && (dl.qyEnd ?? dl.qy) === 0) continue;
        const qy = dl.qy;
        const qyE = dl.qyEnd ?? qy;
        const coordSystem = dl.coordSystem ?? 'local';
        const isGlobal = coordSystem === 'global';
        const perpAngle = isGlobal ? -Math.PI / 2 : screenAngle - Math.PI / 2;
        const maxQ = Math.max(Math.abs(qy), Math.abs(qyE));
        const baseLen = Math.min(40, maxQ / 500 * 40 + 20);
        const arrowHeight = Math.max(Math.abs(qy) / maxQ, Math.abs(qyE) / maxQ) * baseLen;

        loadBands.push({
          loadId: dl.id ?? 0,
          offsetStart: cumulativeOffset,
          offsetEnd: cumulativeOffset + arrowHeight,
          perpAngle,
          startT: dl.startT ?? 0,
          endT: dl.endT ?? 1
        });
        cumulativeOffset += arrowHeight + 4;
      }

      // Check in reverse order (topmost load first for proper z-order hit testing)
      for (let i = loadBands.length - 1; i >= 0; i--) {
        const band = loadBands[i];
        // Compute the band region in screen space
        const loadP1base = {
          x: p1.x + (p2.x - p1.x) * band.startT + Math.cos(band.perpAngle) * band.offsetStart,
          y: p1.y + (p2.y - p1.y) * band.startT + Math.sin(band.perpAngle) * band.offsetStart
        };
        const loadP2base = {
          x: p1.x + (p2.x - p1.x) * band.endT + Math.cos(band.perpAngle) * band.offsetStart,
          y: p1.y + (p2.y - p1.y) * band.endT + Math.sin(band.perpAngle) * band.offsetStart
        };
        const loadP1top = {
          x: p1.x + (p2.x - p1.x) * band.startT + Math.cos(band.perpAngle) * band.offsetEnd,
          y: p1.y + (p2.y - p1.y) * band.startT + Math.sin(band.perpAngle) * band.offsetEnd
        };
        const loadP2top = {
          x: p1.x + (p2.x - p1.x) * band.endT + Math.cos(band.perpAngle) * band.offsetEnd,
          y: p1.y + (p2.y - p1.y) * band.endT + Math.sin(band.perpAngle) * band.offsetEnd
        };

        const distToBase = pointToSegmentDist(screenX, screenY, loadP1base.x, loadP1base.y, loadP2base.x, loadP2base.y);
        const distToTop = pointToSegmentDist(screenX, screenY, loadP1top.x, loadP1top.y, loadP2top.x, loadP2top.y);
        const bandHeight = band.offsetEnd - band.offsetStart;

        // Skip if click is right on the beam line (within 5px) for first load — let beam handler take priority
        if (i === 0 && band.offsetStart === 0) {
          const distToBeam = pointToSegmentDist(screenX, screenY, p1.x, p1.y, p2.x, p2.y);
          if (distToBeam < 5) continue;
        }

        if (distToBase < bandHeight + 8 && distToTop < bandHeight + 8 &&
            (distToBase < 12 || distToTop < 12 ||
             (distToBase < bandHeight + 4 && distToTop < bandHeight + 4))) {
          return { beamId: beam.id, loadId: band.loadId };
        }
      }
    }
    return null;
  }, [mesh, worldToScreen, loadCases, activeLoadCase]);

  const applyNewDimension = useCallback((beamId: number, newLength: number) => {
    if (isNaN(newLength) || newLength <= 0) return;

    const beam = mesh.getBeamElement(beamId);
    if (!beam) return;

    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) return;
    const [n1, n2] = nodes;

    const currentLength = calculateBeamLength(n1, n2);
    if (currentLength === 0) return;

    const dx = (n2.x - n1.x) / currentLength;
    const dy = (n2.y - n1.y) / currentLength;

    // Move the unconstrained end; prefer moving n2
    const n2Constrained = n2.constraints.x || n2.constraints.y || n2.constraints.rotation;
    const n1Constrained = n1.constraints.x || n1.constraints.y || n1.constraints.rotation;

    if (n2Constrained && !n1Constrained) {
      mesh.updateNode(n1.id, { x: n2.x - dx * newLength, y: n2.y - dy * newLength });
    } else {
      mesh.updateNode(n2.id, { x: n1.x + dx * newLength, y: n1.y + dy * newLength });
    }

    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  }, [mesh, dispatch]);

  const getNodeIdToIndex = useCallback(() => {
    return buildNodeIdToIndex(mesh, analysisType);
  }, [mesh, analysisType]);

  const drawSupportSymbol = useCallback((
    ctx: CanvasRenderingContext2D,
    screen: { x: number; y: number },
    node: INode
  ) => {
    const { constraints } = node;

    if (constraints.x && constraints.y && constraints.rotation) {
      // Inklemming (fixed) - filled rectangle
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(screen.x - 12, screen.y - 6, 24, 12);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x - 12, screen.y - 6, 24, 12);
      // Hatch pattern
      ctx.beginPath();
      for (let i = -10; i <= 10; i += 5) {
        ctx.moveTo(screen.x + i, screen.y + 6);
        ctx.lineTo(screen.x + i - 6, screen.y + 16);
      }
      ctx.stroke();
    } else if (constraints.x && constraints.y) {
      // Scharnier (pinned) - triangle
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x - 12, screen.y + 20);
      ctx.lineTo(screen.x + 12, screen.y + 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Hatch pattern below
      ctx.beginPath();
      ctx.moveTo(screen.x - 14, screen.y + 22);
      ctx.lineTo(screen.x + 14, screen.y + 22);
      ctx.stroke();
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(screen.x + i, screen.y + 22);
        ctx.lineTo(screen.x + i - 6, screen.y + 30);
        ctx.stroke();
      }
    } else if (constraints.y && constraints.springY != null) {
      // Z-Spring — vertical zigzag spring with ground line
      const sx = screen.x;
      const sy = screen.y;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;

      // Vertical line from node to spring start
      const springTop = sy + 6;
      const springBot = sy + 28;
      const numZigs = 3;
      const segH = (springBot - springTop) / (numZigs * 2);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, springTop);
      for (let i = 0; i < numZigs; i++) {
        ctx.lineTo(sx + 8, springTop + segH * (i * 2 + 1));
        ctx.lineTo(sx - 8, springTop + segH * (i * 2 + 2));
      }
      ctx.lineTo(sx, springBot);
      ctx.stroke();

      // Ground line below spring
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(sx - 14, springBot + 2);
      ctx.lineTo(sx + 14, springBot + 2);
      ctx.stroke();

      // Hatch marks
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(sx + i, springBot + 2);
        ctx.lineTo(sx + i - 5, springBot + 9);
        ctx.stroke();
      }
    } else if (constraints.y) {
      // Roloplegging (Z-roller) - standard structural engineering roller symbol
      const triHalfBase = 7;
      const triHeight = 12;
      const circleRadius = 3.5;
      const circleSpacing = 5;
      const circleTopY = screen.y + triHeight + 1;
      const circleCenterY = circleTopY + circleRadius;
      const groundLineY = circleCenterY + circleRadius + 1;

      // 1. Equilateral triangle pointing down (apex at node)
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x - triHalfBase, screen.y + triHeight);
      ctx.lineTo(screen.x + triHalfBase, screen.y + triHeight);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 2. Two roller circles below the triangle base
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(screen.x - circleSpacing, circleCenterY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(screen.x + circleSpacing, circleCenterY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3. Horizontal ground line below circles
      ctx.beginPath();
      ctx.moveTo(screen.x - 14, groundLineY);
      ctx.lineTo(screen.x + 14, groundLineY);
      ctx.stroke();

      // 4. Hatch marks below ground line
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(screen.x + i, groundLineY);
        ctx.lineTo(screen.x + i - 5, groundLineY + 7);
        ctx.stroke();
      }
    } else if (constraints.x && constraints.springX != null) {
      // X-Spring — horizontal zigzag spring with wall line
      const sx = screen.x;
      const sy = screen.y;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;

      // Horizontal line from node to spring start
      const springLeft = sx - 6;
      const springRight = sx - 28;
      const numZigs = 3;
      const segW = (springLeft - springRight) / (numZigs * 2);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(springLeft, sy);
      for (let i = 0; i < numZigs; i++) {
        ctx.lineTo(springLeft - segW * (i * 2 + 1), sy + 8);
        ctx.lineTo(springLeft - segW * (i * 2 + 2), sy - 8);
      }
      ctx.lineTo(springRight, sy);
      ctx.stroke();

      // Wall line
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(springRight - 2, sy - 14);
      ctx.lineTo(springRight - 2, sy + 14);
      ctx.stroke();

      // Hatch marks
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(springRight - 2, sy + i);
        ctx.lineTo(springRight - 9, sy + i - 5);
        ctx.stroke();
      }
    } else if (constraints.x) {
      // Horizontal roller - vertical triangle
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x - 16, screen.y - 12);
      ctx.lineTo(screen.x - 16, screen.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Rollers
      ctx.beginPath();
      ctx.arc(screen.x - 21, screen.y - 6, 4, 0, Math.PI * 2);
      ctx.arc(screen.x - 21, screen.y + 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (constraints.rotation && constraints.springRot != null) {
      // Rotational spring — curved arcs
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 14, 0.3 * Math.PI, 0.7 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 14, 1.3 * Math.PI, 1.7 * Math.PI);
      ctx.stroke();
    }
  }, []);

  const drawLoadArrow = useCallback((
    ctx: CanvasRenderingContext2D,
    screen: { x: number; y: number },
    node: INode
  ) => {
    const { loads } = node;

    // Point load arrow
    if (loads.fx !== 0 || loads.fy !== 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 3;

      const mag = Math.sqrt(loads.fx ** 2 + loads.fy ** 2);
      const arrowLength = 50;
      const dx = (loads.fx / mag) * arrowLength;
      const dy = -(loads.fy / mag) * arrowLength;

      // Draw from outside pointing to node
      const startX = screen.x - dx;
      const startY = screen.y - dy;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(screen.x, screen.y);
      ctx.stroke();

      // Arrow head at node
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(
        screen.x - 12 * Math.cos(angle - 0.4),
        screen.y - 12 * Math.sin(angle - 0.4)
      );
      ctx.lineTo(
        screen.x - 12 * Math.cos(angle + 0.4),
        screen.y - 12 * Math.sin(angle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // Force label
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#ef4444';
      const forceText = formatForce(mag);
      ctx.fillText(forceText, startX - 30, startY - 5);
    }

    // Moment arrow
    if (loads.moment !== 0) {
      ctx.strokeStyle = '#9333ea';
      ctx.fillStyle = '#9333ea';
      ctx.lineWidth = 2;

      const radius = 20;
      const direction = loads.moment > 0 ? 1 : -1;

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, -0.3 * Math.PI, 0.8 * Math.PI * direction, direction < 0);
      ctx.stroke();

      // Arrow head
      const endAngle = 0.8 * Math.PI * direction;
      const arrowX = screen.x + radius * Math.cos(endAngle);
      const arrowY = screen.y + radius * Math.sin(endAngle);
      const arrowAngle = endAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - 8 * Math.cos(arrowAngle - 0.4),
        arrowY - 8 * Math.sin(arrowAngle - 0.4)
      );
      ctx.lineTo(
        arrowX - 8 * Math.cos(arrowAngle + 0.4),
        arrowY - 8 * Math.sin(arrowAngle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // Moment label
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(formatMoment(Math.abs(loads.moment)), screen.x + 25, screen.y - 25);
    }
  }, []);

  const drawDistributedLoad = useCallback((
    ctx: CanvasRenderingContext2D,
    beam: IBeamElement,
    n1: INode,
    n2: INode,
    isSelected: boolean,
    loadData?: { qx: number; qy: number; qxEnd?: number; qyEnd?: number; startT?: number; endT?: number; coordSystem?: 'local' | 'global'; description?: string },
    stackOffset?: number,
    overrideColor?: string
  ): number => {
    const dlSource = loadData ?? beam.distributedLoad;
    if (!dlSource) return 0;
    const { qx, qy } = dlSource;
    const qyE = dlSource.qyEnd ?? qy;
    if (qx === 0 && qy === 0 && qyE === 0) return 0;

    const coordSystem = dlSource.coordSystem ?? 'local';
    const startT = dlSource.startT ?? 0;
    const endT = dlSource.endT ?? 1;
    const isVariable = qyE !== qy;

    const p1 = worldToScreen(n1.x, n1.y);
    const p2 = worldToScreen(n2.x, n2.y);

    const isGlobal = coordSystem === 'global';

    // Use screen-space angle (Y flipped vs world coords) for correct perpendicular direction
    const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const perpAngle = isGlobal ? -Math.PI / 2 : screenAngle - Math.PI / 2;

    // Apply stacking offset: shift arrow bases perpendicular to the beam (upward in screen space)
    // All loads stack in the SAME direction away from the beam
    const sOffset = stackOffset ?? 0;

    // Compute start and end points on beam for partial loads (with stacking offset)
    const loadP1 = {
      x: p1.x + (p2.x - p1.x) * startT + Math.cos(perpAngle) * sOffset,
      y: p1.y + (p2.y - p1.y) * startT + Math.sin(perpAngle) * sOffset
    };
    const loadP2 = {
      x: p1.x + (p2.x - p1.x) * endT + Math.cos(perpAngle) * sOffset,
      y: p1.y + (p2.y - p1.y) * endT + Math.sin(perpAngle) * sOffset
    };

    // Arrow lengths: use GLOBAL max q-load so all loads share the same scale
    const baseLen = Math.min(60, globalMaxQ / 500 * 40 + 20);
    const startLen = globalMaxQ === 0 ? 20 : (Math.abs(qy) / globalMaxQ) * baseLen;
    const endLen = globalMaxQ === 0 ? 20 : (Math.abs(qyE) / globalMaxQ) * baseLen;

    const numArrows = Math.max(2, Math.round(8 * (endT - startT)));

    const loadColorVal = overrideColor ?? (isSelected ? '#ef4444' : '#3b82f6');
    ctx.strokeStyle = loadColorVal;
    ctx.fillStyle = loadColorVal;
    ctx.lineWidth = isSelected ? 2.5 : 2;

    const topPoints: { x: number; y: number }[] = [];

    for (let i = 0; i <= numArrows; i++) {
      const t = i / numArrows;
      const px = loadP1.x + (loadP2.x - loadP1.x) * t;
      const py = loadP1.y + (loadP2.y - loadP1.y) * t;

      // Interpolate arrow length for trapezoidal
      const currentQ = qy + (qyE - qy) * t;
      const currentLen = startLen + (endLen - startLen) * t;

      // Extend arrow perpendicular to beam; flip direction based on load sign
      // Negative qy (gravity) → arrows above beam pointing down; Positive qy (upward) → arrows below beam pointing up
      const signFactor = currentQ >= 0 ? -1 : 1;
      const topX = px + Math.cos(perpAngle) * currentLen * signFactor;
      const topY = py + Math.sin(perpAngle) * currentLen * signFactor;
      topPoints.push({ x: topX, y: topY });

      // Only draw arrow if load is non-zero at this point
      if (Math.abs(currentQ) > 0.1) {
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Arrow head: always at base (beam side), pointing from top toward beam
        // This shows force direction: arrows point toward the beam (compression/gravity)
        const arrowDir = Math.atan2(py - topY, px - topX);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 8 * Math.cos(arrowDir - 0.4), py - 8 * Math.sin(arrowDir - 0.4));
        ctx.lineTo(px - 8 * Math.cos(arrowDir + 0.4), py - 8 * Math.sin(arrowDir + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Connect tops of arrows with a line (for trapezoidal: sloped line)
    if (topPoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(topPoints[0].x, topPoints[0].y);
      for (let i = 1; i < topPoints.length; i++) {
        ctx.lineTo(topPoints[i].x, topPoints[i].y);
      }
      ctx.stroke();
    }

    // If selected, draw a subtle highlight outline around the load region
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      // Draw outline: base line -> end top -> tops reversed -> start base
      ctx.moveTo(loadP1.x, loadP1.y);
      ctx.lineTo(loadP2.x, loadP2.y);
      ctx.lineTo(topPoints[topPoints.length - 1].x, topPoints[topPoints.length - 1].y);
      for (let i = topPoints.length - 2; i >= 0; i--) {
        ctx.lineTo(topPoints[i].x, topPoints[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    const startTop = topPoints[0];
    const endTop = topPoints[topPoints.length - 1];

    // Load value label
    ctx.fillStyle = loadColorVal;
    ctx.font = 'bold 11px sans-serif';
    const midX = (startTop.x + endTop.x) / 2;
    const midY = (startTop.y + endTop.y) / 2 - 10;
    const qLabel = isGlobal ? 'q(G)' : 'q';
    if (isVariable) {
      const qText = `${qLabel} = ${(Math.abs(qy) / 1000).toFixed(1)}..${(Math.abs(qyE) / 1000).toFixed(1)} kN/m`;
      ctx.fillText(qText, midX - 45, midY);
    } else {
      const qText = `${qLabel} = ${(Math.abs(qy) / 1000).toFixed(1)} kN/m`;
      ctx.fillText(qText, midX - 30, midY);
    }

    // Show description label from load data or load case (if available)
    const dlDesc = loadData?.description ?? loadCases.find(lc => lc.id === activeLoadCase)?.distributedLoads.find(dl => dl.elementId === beam.id)?.description;
    if (dlDesc) {
      ctx.font = 'italic 10px sans-serif';
      ctx.fillStyle = '#d4d4d8';
      ctx.fillText(dlDesc, midX - 30, midY - 14);
    }

    // Draw resize handles on selected beams with loads
    if (isSelected) {
      const handleSize = 7;
      const half = handleSize / 2;

      // Magnitude handles (square, at arrow tips) - for adjusting qy/qyEnd
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = loadColorVal;
      ctx.lineWidth = 2;
      ctx.fillRect(startTop.x - half, startTop.y - half, handleSize, handleSize);
      ctx.strokeRect(startTop.x - half, startTop.y - half, handleSize, handleSize);
      ctx.fillRect(endTop.x - half, endTop.y - half, handleSize, handleSize);
      ctx.strokeRect(endTop.x - half, endTop.y - half, handleSize, handleSize);

      // Length handles (circles, on the beam) - for adjusting startT/endT
      const lengthHandleR = 5;
      ctx.fillStyle = '#fbbf24'; // yellow/amber to distinguish from magnitude handles
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      // Start length handle
      ctx.beginPath();
      ctx.arc(loadP1.x, loadP1.y, lengthHandleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // End length handle
      ctx.beginPath();
      ctx.arc(loadP2.x, loadP2.y, lengthHandleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw Qx (axial load) as separate block with parallel arrows in different color
    const qxE = dlSource.qxEnd ?? qx;
    if (qx !== 0 || qxE !== 0) {
      const qxColor = isSelected ? '#f97316' : '#f59e0b'; // orange tones
      ctx.strokeStyle = qxColor;
      ctx.fillStyle = qxColor;
      ctx.lineWidth = 1.5;

      const axialAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const axialPerp = axialAngle + Math.PI / 2;
      // Offset the qx arrows below qy arrows
      const qxOffset = 50;

      const maxQx = Math.max(Math.abs(qx), Math.abs(qxE));
      const qxBaseLen = Math.min(30, maxQx / 500 * 30 + 15);
      const qxStartLen = maxQx === 0 ? 15 : (Math.abs(qx) / maxQx) * qxBaseLen;
      const qxEndLen = maxQx === 0 ? 15 : (Math.abs(qxE) / maxQx) * qxBaseLen;

      const numQxArrows = Math.max(2, Math.round(6 * (endT - startT)));
      const qxTopPoints: { x: number; y: number }[] = [];

      for (let i = 0; i <= numQxArrows; i++) {
        const t = i / numQxArrows;
        const baseX = loadP1.x + (loadP2.x - loadP1.x) * t;
        const baseY = loadP1.y + (loadP2.y - loadP1.y) * t;
        // Offset perpendicular to beam (below qy)
        const px = baseX + Math.cos(axialPerp) * qxOffset;
        const py = baseY + Math.sin(axialPerp) * qxOffset;

        const currentQx = qx + (qxE - qx) * t;
        const currentLen = qxStartLen + (qxEndLen - qxStartLen) * t;
        const sign = currentQx >= 0 ? 1 : -1;

        // Arrow tip along beam axis
        const tipX = px + Math.cos(axialAngle) * currentLen * sign;
        const tipY = py + Math.sin(axialAngle) * currentLen * sign;
        qxTopPoints.push({ x: px, y: py });

        if (Math.abs(currentQx) > 0.1) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Arrow head
          const arrowDir = Math.atan2(tipY - py, tipX - px);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - 6 * Math.cos(arrowDir - 0.4), tipY - 6 * Math.sin(arrowDir - 0.4));
          ctx.lineTo(tipX - 6 * Math.cos(arrowDir + 0.4), tipY - 6 * Math.sin(arrowDir + 0.4));
          ctx.closePath();
          ctx.fill();
        }
      }

      // Connect base points with a line
      if (qxTopPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(qxTopPoints[0].x, qxTopPoints[0].y);
        for (let i = 1; i < qxTopPoints.length; i++) {
          ctx.lineTo(qxTopPoints[i].x, qxTopPoints[i].y);
        }
        ctx.stroke();
      }

      // Qx label
      ctx.font = 'bold 10px sans-serif';
      const qxMidX = (qxTopPoints[0].x + qxTopPoints[qxTopPoints.length - 1].x) / 2;
      const qxMidY = (qxTopPoints[0].y + qxTopPoints[qxTopPoints.length - 1].y) / 2 + 14;
      const isQxVariable = qxE !== qx;
      if (isQxVariable) {
        ctx.fillText(`qx = ${(Math.abs(qx) / 1000).toFixed(1)}..${(Math.abs(qxE) / 1000).toFixed(1)} kN/m`, qxMidX - 45, qxMidY);
      } else {
        ctx.fillText(`qx = ${(Math.abs(qx) / 1000).toFixed(1)} kN/m`, qxMidX - 30, qxMidY);
      }
    }

    // Return the max arrow height for stacking purposes (always positive)
    return Math.max(startLen, endLen);
  }, [worldToScreen, loadCases, activeLoadCase, globalMaxQ]);

  const constraintTools = ['addPinned', 'addXRoller', 'addZRoller', 'addZSpring', 'addRotSpring', 'addXSpring', 'addFixed'] as const;
  const isConstraintTool = constraintTools.includes(selectedTool as typeof constraintTools[number]);

  const drawDimensions = useCallback((ctx: CanvasRenderingContext2D) => {
    const _rs = getComputedStyle(document.documentElement);
    const dimColor = _rs.getPropertyValue('--canvas-dim-color').trim() || '#718096';
    const dimBg = captureModeRef.current ? '#ffffff' : (_rs.getPropertyValue('--canvas-bg').trim() || '#1a1a2e');
    const dimOffset = 30; // px offset perpendicular to beam

    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);

      const length = calculateBeamLength(n1, n2);

      // Compute perpendicular direction in screen space (+ PI/2 = below beam in screen coords)
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = screenAngle + Math.PI / 2;

      const offsetX = Math.cos(perpAngle) * dimOffset;
      const offsetY = Math.sin(perpAngle) * dimOffset;

      // Dimension line endpoints (offset from beam endpoints)
      const d1 = { x: p1.x + offsetX, y: p1.y + offsetY };
      const d2 = { x: p2.x + offsetX, y: p2.y + offsetY };

      // Extension lines (dashed, from beam endpoints to dimension line)
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(d1.x, d1.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dimension line (solid with arrowheads)
      ctx.strokeStyle = dimColor;
      ctx.fillStyle = dimColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.stroke();

      // Arrowheads
      const arrowSize = 8;
      const beamScreenAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);

      // Arrow at d1 (pointing towards d2)
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(
        d1.x + arrowSize * Math.cos(beamScreenAngle + 0.4),
        d1.y + arrowSize * Math.sin(beamScreenAngle + 0.4)
      );
      ctx.lineTo(
        d1.x + arrowSize * Math.cos(beamScreenAngle - 0.4),
        d1.y + arrowSize * Math.sin(beamScreenAngle - 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // Arrow at d2 (pointing towards d1)
      ctx.beginPath();
      ctx.moveTo(d2.x, d2.y);
      ctx.lineTo(
        d2.x - arrowSize * Math.cos(beamScreenAngle - 0.4),
        d2.y - arrowSize * Math.sin(beamScreenAngle - 0.4)
      );
      ctx.lineTo(
        d2.x - arrowSize * Math.cos(beamScreenAngle + 0.4),
        d2.y - arrowSize * Math.sin(beamScreenAngle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // Label centered on dimension line, rotated parallel to the beam
      const labelText = `${(length * 1000).toFixed(0)} mm`;
      ctx.font = 'bold 11px sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = 14;

      const midX = (d1.x + d2.x) / 2;
      const midY = (d1.y + d2.y) / 2;

      // Calculate rotation angle for text (keep text readable: flip if upside down)
      let textAngle = beamScreenAngle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(textAngle);

      // Background for readability (now drawn at origin after translate/rotate)
      ctx.fillStyle = dimBg;
      ctx.fillRect(-textWidth / 2 - 3, -textHeight / 2 - 1, textWidth + 6, textHeight + 2);
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-textWidth / 2 - 3, -textHeight / 2 - 1, textWidth + 6, textHeight + 2);

      ctx.fillStyle = dimColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, 0, 0);

      ctx.restore();
    }
  }, [mesh, worldToScreen]);

  const drawConstraintPreview = useCallback((
    ctx: CanvasRenderingContext2D,
    screenPos: { x: number; y: number },
    tool: string
  ) => {
    ctx.globalAlpha = 0.5;

    // Create a mock node with spring stiffness where applicable
    let constraints: INode['constraints'] = { x: false, y: false, rotation: false };
    switch (tool) {
      case 'addPinned': constraints = { x: true, y: true, rotation: false }; break;
      case 'addXRoller': constraints = { x: true, y: false, rotation: false }; break;
      case 'addZRoller': constraints = { x: false, y: true, rotation: false }; break;
      case 'addFixed': constraints = { x: true, y: true, rotation: true }; break;
      case 'addZSpring': constraints = { x: false, y: true, rotation: false, springY: 1e5 }; break;
      case 'addXSpring': constraints = { x: true, y: false, rotation: false, springX: 1e5 }; break;
      case 'addRotSpring': constraints = { x: false, y: false, rotation: true, springRot: 1e5 }; break;
    }

    const mockNode: INode = {
      id: -1,
      x: 0, y: 0,
      constraints,
      loads: { fx: 0, fy: 0, moment: 0 }
    };

    drawSupportSymbol(ctx, screenPos, mockNode);

    ctx.globalAlpha = 1.0;
  }, [drawSupportSymbol]);

  const drawForceDiagram = useCallback((
    ctx: CanvasRenderingContext2D,
    diagramType: 'normal' | 'shear' | 'moment',
    globalLabels?: { x: number; y: number; w: number; h: number }[]
  ) => {
    if (!result) return;

    const _diagStyle = getComputedStyle(document.documentElement);
    const _diagLabelBg = _diagStyle.getPropertyValue('--canvas-label-bg').trim() || 'rgba(26,26,46,0.85)';

    // Use global label list for collision detection across all beams and diagram types
    const allPlacedLabels = globalLabels || [];

    for (const beam of mesh.beamElements.values()) {
      const forces = result.beamForces.get(beam.id);
      if (!forces) continue;

      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);

      const L = calculateBeamLength(n1, n2);
      // Use screen-space angle for perpendicular direction (Y is flipped vs world)
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = screenAngle - Math.PI / 2;

      let values: number[];
      let maxVal: number;
      let color: string;
      let fillColor: string;

      // Use GLOBAL max values so all beams share the same scale
      switch (diagramType) {
        case 'normal':
          values = forces.normalForce;
          maxVal = globalForceMaxes.maxN;
          color = '#22c55e';
          fillColor = 'rgba(34, 197, 94, 0.3)';
          break;
        case 'shear':
          values = forces.shearForce;
          maxVal = globalForceMaxes.maxV;
          color = '#3b82f6';
          fillColor = 'rgba(59, 130, 246, 0.3)';
          break;
        case 'moment':
        default:
          values = forces.bendingMoment;
          maxVal = globalForceMaxes.maxM;
          color = '#ef4444';
          fillColor = 'rgba(239, 68, 68, 0.3)';
          break;
      }

      const scale = diagramScale / maxVal;

      // Draw filled diagram
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);

      const points: { x: number; y: number }[] = [];

      for (let i = 0; i < forces.stations.length; i++) {
        const t = forces.stations[i] / L;
        const baseX = p1.x + (p2.x - p1.x) * t;
        const baseY = p1.y + (p2.y - p1.y) * t;

        const diagramValue = values[i];
        // Flip moment diagram to show on tension side (structural convention)
        const offset = (diagramType === 'moment' ? -diagramValue : diagramValue) * scale;

        const px = baseX + Math.cos(perpAngle) * offset;
        const py = baseY + Math.sin(perpAngle) * offset;

        points.push({ x: px, y: py });
        ctx.lineTo(px, py);
      }

      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();

      // Draw hatching for shear force diagrams
      if (diagramType === 'shear') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        const hatchSpacing = 14;
        const beamScreenLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        const numHatches = Math.floor(beamScreenLen / hatchSpacing);
        for (let h = 1; h < numHatches; h++) {
          const t = h / numHatches;
          const baseX = p1.x + (p2.x - p1.x) * t;
          const baseY = p1.y + (p2.y - p1.y) * t;
          // Interpolate diagram point
          const stationIdx = Math.min(Math.floor(t * (forces.stations.length - 1)), forces.stations.length - 2);
          const localT = t * (forces.stations.length - 1) - stationIdx;
          const val = values[stationIdx] + (values[stationIdx + 1] - values[stationIdx]) * localT;
          const offset = val * scale;
          const px = baseX + Math.cos(perpAngle) * offset;
          const py = baseY + Math.sin(perpAngle) * offset;
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }

      // Draw outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      for (const pt of points) {
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Draw perpendicular tick marks and +/- sign indicators for shear force diagram
      if (diagramType === 'shear') {
        const tickLen = 5; // half-length of tick mark
        // Tick at start (p1)
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1.x - Math.cos(perpAngle) * tickLen, p1.y - Math.sin(perpAngle) * tickLen);
        ctx.lineTo(p1.x + Math.cos(perpAngle) * tickLen, p1.y + Math.sin(perpAngle) * tickLen);
        ctx.stroke();
        // Tick at end (p2)
        ctx.beginPath();
        ctx.moveTo(p2.x - Math.cos(perpAngle) * tickLen, p2.y - Math.sin(perpAngle) * tickLen);
        ctx.lineTo(p2.x + Math.cos(perpAngle) * tickLen, p2.y + Math.sin(perpAngle) * tickLen);
        ctx.stroke();

        // Draw +/- sign symbols on the diagram to indicate sign convention
        // Place symbols at ~25% and ~75% along the beam where absolute value is significant
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        const signPositions = [0.25, 0.75];
        for (const sp of signPositions) {
          const stationIdx = Math.min(Math.floor(sp * (forces.stations.length - 1)), forces.stations.length - 2);
          const localT = sp * (forces.stations.length - 1) - stationIdx;
          const val = values[stationIdx] + (values[stationIdx + 1] - values[stationIdx]) * localT;
          if (Math.abs(val) > maxVal * 0.05) {
            const baseX = p1.x + (p2.x - p1.x) * sp;
            const baseY = p1.y + (p2.y - p1.y) * sp;
            const offset = val * scale;
            // Place the sign symbol at mid-height of the diagram fill
            const signX = baseX + Math.cos(perpAngle) * offset * 0.5;
            const signY = baseY + Math.sin(perpAngle) * offset * 0.5;
            const sign = val > 0 ? '+' : '\u2212';
            ctx.fillText(sign, signX, signY);
          }
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw baseline
      ctx.strokeStyle = _diagStyle.getPropertyValue('--canvas-baseline').trim() || '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw values at key points with collision avoidance
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = color;

      // Collision avoidance: use global labels list across all beams
      const tryPlaceLabel = (text: string, lx: number, ly: number, bgColor?: string): void => {
        const w = ctx.measureText(text).width + 4;
        const h = 14;
        let finalY = ly;

        // Iteratively check overlap with existing labels and shift to resolve
        let maxIterations = 10;
        let hasOverlap = true;
        while (hasOverlap && maxIterations > 0) {
          hasOverlap = false;
          for (const placed of allPlacedLabels) {
            if (Math.abs(lx - placed.x) < (w + placed.w) / 2 &&
                Math.abs(finalY - placed.y) < (h + placed.h) / 2) {
              // Shift in the direction that creates the least displacement
              const shiftUp = placed.y - placed.h / 2 - h / 2;
              const shiftDown = placed.y + placed.h / 2 + h / 2;
              finalY = Math.abs(shiftUp - ly) < Math.abs(shiftDown - ly) ? shiftUp : shiftDown;
              hasOverlap = true;
              break; // re-check from start after shifting
            }
          }
          maxIterations--;
        }

        if (bgColor) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(lx - 2, finalY - 12, w, h);
          ctx.fillStyle = color;
        }
        ctx.fillText(text, lx, finalY);
        allPlacedLabels.push({ x: lx + w / 2, y: finalY, w, h });
      };

      // Start value
      const startVal = values[0];
      if (Math.abs(startVal) > maxVal * 0.01) {
        const label = diagramType === 'moment' ? formatMoment(startVal) : formatForce(startVal);
        if (diagramType === 'moment') {
          // Place on tension side (same direction as diagram curve) with extra offset past the curve
          const startOffset = (-startVal) * scale; // moment uses -value for tension side
          const labelPx = p1.x + Math.cos(perpAngle) * startOffset;
          const labelPy = p1.y + Math.sin(perpAngle) * startOffset;
          // Offset further past the curve in the perpendicular direction
          const extraOffset = startOffset >= 0 ? 14 : -14;
          tryPlaceLabel(label, labelPx - 20, labelPy + Math.sin(perpAngle) * extraOffset);
        } else {
          tryPlaceLabel(label, p1.x - 40, p1.y - 10);
        }
      }

      // End value
      const endVal = values[values.length - 1];
      if (Math.abs(endVal) > maxVal * 0.01) {
        const label = diagramType === 'moment' ? formatMoment(endVal) : formatForce(endVal);
        if (diagramType === 'moment') {
          // Place on tension side (same direction as diagram curve) with extra offset past the curve
          const endOffset = (-endVal) * scale; // moment uses -value for tension side
          const labelPx = p2.x + Math.cos(perpAngle) * endOffset;
          const labelPy = p2.y + Math.sin(perpAngle) * endOffset;
          const extraOffset = endOffset >= 0 ? 14 : -14;
          tryPlaceLabel(label, labelPx + 5, labelPy + Math.sin(perpAngle) * extraOffset);
        } else {
          tryPlaceLabel(label, p2.x + 5, p2.y - 10);
        }
      }

      // Max value (find it)
      let maxIdx = 0;
      let absMax = 0;
      for (let i = 0; i < values.length; i++) {
        if (Math.abs(values[i]) > absMax) {
          absMax = Math.abs(values[i]);
          maxIdx = i;
        }
      }

      if (maxIdx > 0 && maxIdx < values.length - 1) {
        const t = forces.stations[maxIdx] / L;
        const labelX = p1.x + (p2.x - p1.x) * t;
        const labelY = p1.y + (p2.y - p1.y) * t;
        const diagramValue = values[maxIdx];
        // Apply same flip as the diagram drawing (moment is inverted for tension side)
        const offset = (diagramType === 'moment' ? -diagramValue : diagramValue) * scale;

        const label = diagramType === 'moment' ? formatMoment(values[maxIdx]) : formatForce(values[maxIdx]);
        // Position label on the diagram curve side
        const labelOffsetX = labelX + Math.cos(perpAngle) * offset - 22;
        // For moment: place at bottom of the curve (past the curve in diagram direction)
        // For other diagrams: place slightly above the curve
        const labelOffsetY = labelY + Math.sin(perpAngle) * offset + (diagramType === 'moment' ? 16 : -8);
        tryPlaceLabel(label, labelOffsetX, labelOffsetY, _diagLabelBg);
      }
    }
  }, [result, mesh, worldToScreen, diagramScale, globalForceMaxes]);

  /** Draw envelope force diagram (min/max curves) for a given diagram type. */
  const drawEnvelopeDiagram = useCallback((
    ctx: CanvasRenderingContext2D,
    diagramType: 'normal' | 'shear' | 'moment'
  ) => {
    if (!envelopeResult) return;

    for (const beam of mesh.beamElements.values()) {
      const envForces = envelopeResult.beamForces.get(beam.id);
      if (!envForces) continue;

      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      const p1 = worldToScreen(n1.x, n1.y);
      const p2 = worldToScreen(n2.x, n2.y);

      const L = calculateBeamLength(n1, n2);
      const screenAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = screenAngle - Math.PI / 2;

      let minValues: number[];
      let maxValues: number[];
      let maxAbsVal: number;
      let color: string;
      let fillColorMin: string;
      let fillColorMax: string;

      switch (diagramType) {
        case 'normal':
          minValues = envForces.minN;
          maxValues = envForces.maxN;
          maxAbsVal = Math.max(...envForces.maxN.map(Math.abs), ...envForces.minN.map(Math.abs), 1);
          color = '#22c55e';
          fillColorMin = 'rgba(34, 197, 94, 0.15)';
          fillColorMax = 'rgba(34, 197, 94, 0.3)';
          break;
        case 'shear':
          minValues = envForces.minV;
          maxValues = envForces.maxV;
          maxAbsVal = Math.max(...envForces.maxV.map(Math.abs), ...envForces.minV.map(Math.abs), 1);
          color = '#3b82f6';
          fillColorMin = 'rgba(59, 130, 246, 0.15)';
          fillColorMax = 'rgba(59, 130, 246, 0.3)';
          break;
        case 'moment':
        default:
          minValues = envForces.minM;
          maxValues = envForces.maxM;
          maxAbsVal = Math.max(...envForces.maxM.map(Math.abs), ...envForces.minM.map(Math.abs), 1);
          color = '#ef4444';
          fillColorMin = 'rgba(239, 68, 68, 0.15)';
          fillColorMax = 'rgba(239, 68, 68, 0.3)';
          break;
      }

      const scale = diagramScale / maxAbsVal;

      // Helper: draw one envelope curve
      const drawCurve = (values: number[], fillColor: string, dashed: boolean) => {
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1.5 : 2;
        if (dashed) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);

        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < envForces.stations.length; i++) {
          const t = envForces.stations[i] / L;
          const baseX = p1.x + (p2.x - p1.x) * t;
          const baseY = p1.y + (p2.y - p1.y) * t;
          const diagramValue = values[i];
          const offset = (diagramType === 'moment' ? -diagramValue : diagramValue) * scale;
          const px = baseX + Math.cos(perpAngle) * offset;
          const py = baseY + Math.sin(perpAngle) * offset;
          pts.push({ x: px, y: py });
          ctx.lineTo(px, py);
        }

        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();

        // Outline
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // Draw max envelope (solid)
      drawCurve(maxValues, fillColorMax, false);
      // Draw min envelope (dashed)
      drawCurve(minValues, fillColorMin, true);
    }
  }, [envelopeResult, mesh, worldToScreen, diagramScale]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const fmtForce = (val: number) => {
      if (forceUnit === 'N') return `${val.toFixed(0)} N`;
      if (forceUnit === 'MN') return `${(val / 1e6).toFixed(3)} MN`;
      return `${(val / 1000).toFixed(1)} kN`;
    };
    const fmtMoment = (val: number) => {
      if (forceUnit === 'N') return `${val.toFixed(0)} N·m`;
      if (forceUnit === 'MN') return `${(val / 1e6).toFixed(4)} MN·m`;
      return `${(val / 1000).toFixed(2)} kN·m`;
    };

    const width = canvas.width;
    const height = canvas.height;

    // Read theme-aware colors from CSS variables
    const rootStyle = getComputedStyle(document.documentElement);
    const canvasBg = rootStyle.getPropertyValue('--canvas-bg').trim() || '#1a1a2e';
    const canvasGrid = rootStyle.getPropertyValue('--canvas-grid').trim() || '#2a2a4a';
    const canvasAxis = rootStyle.getPropertyValue('--canvas-axis').trim() || '#4a4a6a';

    // Build set of hidden layer IDs for fast lookup
    const hiddenLayerIds = new Set<number>();
    for (const layer of mesh.layers.values()) {
      if (!layer.visible) hiddenLayerIds.add(layer.id);
    }
    const isBeamHidden = (beam: { layerId?: number }) => hiddenLayerIds.has(beam.layerId ?? 0);

    ctx.fillStyle = captureModeRef.current ? '#ffffff' : canvasBg;
    ctx.fillRect(0, 0, width, height);

    // Draw grid and axes (skip in capture mode for clean report images)
    if (!captureModeRef.current) {
      ctx.strokeStyle = canvasGrid;
      ctx.lineWidth = 1;

      const topLeft = screenToWorld(0, 0);
      const bottomRight = screenToWorld(width, height);

      const startX = Math.floor(topLeft.x / gridSize) * gridSize;
      const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
      const startY = Math.floor(bottomRight.y / gridSize) * gridSize;
      const endY = Math.ceil(topLeft.y / gridSize) * gridSize;

      for (let x = startX; x <= endX; x += gridSize) {
        const screen = worldToScreen(x, 0);
        ctx.beginPath();
        ctx.moveTo(screen.x, 0);
        ctx.lineTo(screen.x, height);
        ctx.stroke();
      }

      for (let y = startY; y <= endY; y += gridSize) {
        const screen = worldToScreen(0, y);
        ctx.beginPath();
        ctx.moveTo(0, screen.y);
        ctx.lineTo(width, screen.y);
        ctx.stroke();
      }

      // Draw axes
      ctx.strokeStyle = canvasAxis;
      ctx.lineWidth = 2;
      const origin = worldToScreen(0, 0);

      // X axis
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(width, origin.y);
      ctx.stroke();

      // Y axis
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, height);
      ctx.stroke();
    }

    // Draw structural grid lines (stramienen / levels)
    if (structuralGrid.showGridLines) {
      ctx.save();
      ctx.setLineDash([16, 8]);
      ctx.lineWidth = 1.5;

      // Compute grid extent for clipping lines
      const vLines = structuralGrid.verticalLines;
      const hLines = structuralGrid.horizontalLines;
      const vPositions = vLines.map(l => l.position);
      const hPositions = hLines.map(l => l.position);
      const gridMinX = vPositions.length > 0 ? Math.min(...vPositions) : 0;
      const gridMaxX = vPositions.length > 0 ? Math.max(...vPositions) : 0;
      const gridMinY = hPositions.length > 0 ? Math.min(...hPositions) : 0;
      const gridMaxY = hPositions.length > 0 ? Math.max(...hPositions) : 0;
      const gridPadding = 0.5; // meters overshoot

      // Vertical grid lines — clip to horizontal grid extent
      for (const line of vLines) {
        const top = hPositions.length > 0 ? worldToScreen(line.position, gridMaxY + gridPadding) : { x: 0, y: 0 };
        const bot = hPositions.length > 0 ? worldToScreen(line.position, gridMinY - gridPadding) : { x: 0, y: height };
        const screenPos = worldToScreen(line.position, 0);
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(screenPos.x, hPositions.length > 0 ? top.y : 0);
        ctx.lineTo(screenPos.x, hPositions.length > 0 ? bot.y : height);
        ctx.stroke();

        // Circle label at top
        const labelY = (hPositions.length > 0 ? top.y : 0) - 20;
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(screenPos.x, Math.max(labelY, 20), 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(line.name, screenPos.x, Math.max(labelY, 20));
        ctx.setLineDash([16, 8]);
      }

      // Horizontal grid lines — clip to vertical grid extent
      for (const line of hLines) {
        const left = vPositions.length > 0 ? worldToScreen(gridMinX - gridPadding, line.position) : { x: 0, y: 0 };
        const right2 = vPositions.length > 0 ? worldToScreen(gridMaxX + gridPadding, line.position) : { x: width, y: 0 };
        const screenPos = worldToScreen(0, line.position);
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(vPositions.length > 0 ? left.x : 0, screenPos.y);
        ctx.lineTo(vPositions.length > 0 ? right2.x : width, screenPos.y);
        ctx.stroke();

        // Label at left
        const labelX = (vPositions.length > 0 ? left.x : 0) - 20;
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(line.name, Math.max(labelX, 8), screenPos.y - 8);
        ctx.setLineDash([16, 8]);
      }

      ctx.setLineDash([]);

      // Auto structural grid dimensioning
      // Horizontal dimensions between vertical grid lines (below structure)
      if (vLines.length >= 2) {
        const sorted = [...vLines].sort((a, b) => a.position - b.position);
        const dimY = gridMinY - gridPadding - 0.3;
        const dimScreenY = worldToScreen(0, dimY).y;

        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let i = 0; i < sorted.length - 1; i++) {
          const x1 = sorted[i].position;
          const x2 = sorted[i + 1].position;
          const s1 = worldToScreen(x1, dimY);
          const s2 = worldToScreen(x2, dimY);
          const dist = Math.abs(x2 - x1) * 1000; // meters → mm

          // Dimension line
          ctx.beginPath();
          ctx.moveTo(s1.x, dimScreenY);
          ctx.lineTo(s2.x, dimScreenY);
          ctx.stroke();

          // Ticks
          ctx.beginPath();
          ctx.moveTo(s1.x, dimScreenY - 4);
          ctx.lineTo(s1.x, dimScreenY + 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s2.x, dimScreenY - 4);
          ctx.lineTo(s2.x, dimScreenY + 4);
          ctx.stroke();

          // Label (clickable — underlined)
          const midX = (s1.x + s2.x) / 2;
          const dimLabel = `${dist.toFixed(0)}`;
          ctx.fillText(dimLabel, midX, dimScreenY + 4);
          // Draw subtle underline to indicate clickability
          const textW = ctx.measureText(dimLabel).width;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.setLineDash([2, 2]);
          ctx.moveTo(midX - textW / 2, dimScreenY + 16);
          ctx.lineTo(midX + textW / 2, dimScreenY + 16);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#f59e0b';
        }
      }

      // Vertical dimensions between horizontal grid lines (left of structure)
      if (hLines.length >= 2) {
        const sorted = [...hLines].sort((a, b) => a.position - b.position);
        const dimX = gridMinX - gridPadding - 0.3;
        const dimScreenX = worldToScreen(dimX, 0).x;

        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < sorted.length - 1; i++) {
          const y1 = sorted[i].position;
          const y2 = sorted[i + 1].position;
          const s1 = worldToScreen(dimX, y1);
          const s2 = worldToScreen(dimX, y2);
          const dist = Math.abs(y2 - y1) * 1000; // meters → mm

          // Dimension line
          ctx.beginPath();
          ctx.moveTo(dimScreenX, s1.y);
          ctx.lineTo(dimScreenX, s2.y);
          ctx.stroke();

          // Ticks
          ctx.beginPath();
          ctx.moveTo(dimScreenX - 4, s1.y);
          ctx.lineTo(dimScreenX + 4, s1.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(dimScreenX - 4, s2.y);
          ctx.lineTo(dimScreenX + 4, s2.y);
          ctx.stroke();

          // Label (clickable — underlined)
          const midY = (s1.y + s2.y) / 2;
          const vDimLabel = `${dist.toFixed(0)}`;
          ctx.fillText(vDimLabel, dimScreenX - 6, midY);
          // Draw subtle underline to indicate clickability
          const vTextW = ctx.measureText(vDimLabel).width;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.setLineDash([2, 2]);
          ctx.moveTo(dimScreenX - 6 - vTextW, midY + 7);
          ctx.lineTo(dimScreenX - 6, midY + 7);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#f59e0b';
        }
      }

      // Draw '-' remove buttons below each grid line label (stacked vertically)
      ctx.setLineDash([]);
      // Vertical line '-' buttons (below the label circle)
      if (vLines.length > 1) {
        for (const line of vLines) {
          const screenPos = worldToScreen(line.position, 0);
          const topY = hPositions.length > 0
            ? worldToScreen(line.position, gridMaxY + gridPadding).y
            : 0;
          const labelY = Math.max(topY - 20, 20);
          const minBtnX = screenPos.x;
          const minBtnY = labelY + 22;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.beginPath();
          ctx.arc(minBtnX, minBtnY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(minBtnX, minBtnY, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('−', minBtnX, minBtnY);
        }
      }
      // Horizontal line '-' buttons (below each label)
      if (hLines.length > 1) {
        for (const line of hLines) {
          const screenPos = worldToScreen(0, line.position);
          const leftX = vPositions.length > 0
            ? worldToScreen(gridMinX - gridPadding, line.position).x
            : 0;
          const labelX = Math.max(leftX - 20, 8);
          const minBtnX = labelX;
          const minBtnY = screenPos.y - 8 + 20;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.beginPath();
          ctx.arc(minBtnX, minBtnY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(minBtnX, minBtnY, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('−', minBtnX, minBtnY);
        }
      }

      // Draw '+' add buttons (stacked above the '-' button of the last grid line)
      ctx.setLineDash([]);
      // Vertical '+' above the '-' of the last vertical grid line
      if (vLines.length > 0) {
        const lastVLine = [...vLines].sort((a, b) => a.position - b.position).pop()!;
        const sp = worldToScreen(lastVLine.position, 0);
        const topY = hPositions.length > 0
          ? worldToScreen(lastVLine.position, gridMaxY + gridPadding).y
          : 0;
        const labelY = Math.max(topY - 20, 20);
        // Place '+' above the '-' button: '-' is at labelY+22, '+' goes at labelY+40
        const addBtnX = sp.x;
        const addBtnY = labelY + 40;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.beginPath();
        ctx.arc(addBtnX, addBtnY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(addBtnX, addBtnY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', addBtnX, addBtnY);
      }

      // Horizontal '+' stacked below the '-' of the last horizontal grid line
      if (hLines.length > 0) {
        const lastHLine = [...hLines].sort((a, b) => a.position - b.position).pop()!;
        const sp = worldToScreen(0, lastHLine.position);
        const leftX = vPositions.length > 0
          ? worldToScreen(gridMinX - gridPadding, lastHLine.position).x
          : 0;
        const addBtnX = Math.max(leftX - 20, 8);
        const addBtnY = sp.y - 8 + 38;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.beginPath();
        ctx.arc(addBtnX, addBtnY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(addBtnX, addBtnY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', addBtnX, addBtnY);
      }

      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    const nodeIdToIndex = result ? getNodeIdToIndex() : null;
    const dofsPerNode = analysisType === 'frame' ? 3 : analysisType === 'plate_bending' ? 3 : 2;
    // For plate elements, DOFs per node is always 2 (plane_stress) or 3 (plate_bending)
    const plateDofsPerNode = analysisType === 'plate_bending' ? 3 : 2;

    // Pre-compute nodal stress values for smoothed rendering (average stress at each node)
    const nodalStressValues = new Map<number, number>();
    let smoothedMinVal = 0;
    let smoothedMaxVal = 1;
    if (showStress && result && stressDisplayMode === 'smoothed' && stressType !== 'normals') {
      const nodeStressSums = new Map<number, number>();
      const nodeStressCounts = new Map<number, number>();
      const sr = result.stressRanges;

      // Determine min/max for the current stress type
      switch (stressType) {
        case 'sigmaX':
          smoothedMinVal = sr?.sigmaX.min ?? result.minVonMises;
          smoothedMaxVal = sr?.sigmaX.max ?? result.maxVonMises;
          break;
        case 'sigmaY':
          smoothedMinVal = sr?.sigmaY.min ?? result.minVonMises;
          smoothedMaxVal = sr?.sigmaY.max ?? result.maxVonMises;
          break;
        case 'tauXY':
          smoothedMinVal = sr?.tauXY.min ?? result.minVonMises;
          smoothedMaxVal = sr?.tauXY.max ?? result.maxVonMises;
          break;
        case 'mx':
          smoothedMinVal = sr?.mx.min ?? result.minMoment ?? 0;
          smoothedMaxVal = sr?.mx.max ?? result.maxMoment ?? 1;
          break;
        case 'my':
          smoothedMinVal = sr?.my.min ?? result.minMoment ?? 0;
          smoothedMaxVal = sr?.my.max ?? result.maxMoment ?? 1;
          break;
        case 'mxy':
          smoothedMinVal = sr?.mxy.min ?? result.minMoment ?? 0;
          smoothedMaxVal = sr?.mxy.max ?? result.maxMoment ?? 1;
          break;
        case 'vx':
          smoothedMinVal = sr?.vx.min ?? 0;
          smoothedMaxVal = sr?.vx.max ?? 1;
          break;
        case 'vy':
          smoothedMinVal = sr?.vy.min ?? 0;
          smoothedMaxVal = sr?.vy.max ?? 1;
          break;
        case 'nx':
          smoothedMinVal = sr?.nx.min ?? 0;
          smoothedMaxVal = sr?.nx.max ?? 1;
          break;
        case 'ny':
          smoothedMinVal = sr?.ny.min ?? 0;
          smoothedMaxVal = sr?.ny.max ?? 1;
          break;
        case 'nxy':
          smoothedMinVal = sr?.nxy.min ?? 0;
          smoothedMaxVal = sr?.nxy.max ?? 1;
          break;
        default:
          smoothedMinVal = result.minVonMises;
          smoothedMaxVal = result.maxVonMises;
      }

      // Sum stress values at each node from connected elements
      for (const element of mesh.elements.values()) {
        const stress = result.elementStresses.get(element.id);
        if (!stress) continue;

        let value: number;
        switch (stressType) {
          case 'sigmaX': value = stress.sigmaX; break;
          case 'sigmaY': value = stress.sigmaY; break;
          case 'tauXY': value = stress.tauXY; break;
          case 'mx': value = stress.mx ?? 0; break;
          case 'my': value = stress.my ?? 0; break;
          case 'mxy': value = stress.mxy ?? 0; break;
          case 'vx': value = stress.vx ?? 0; break;
          case 'vy': value = stress.vy ?? 0; break;
          case 'nx': value = stress.nx ?? 0; break;
          case 'ny': value = stress.ny ?? 0; break;
          case 'nxy': value = stress.nxy ?? 0; break;
          default: value = stress.vonMises;
        }

        for (const nodeId of element.nodeIds) {
          nodeStressSums.set(nodeId, (nodeStressSums.get(nodeId) ?? 0) + value);
          nodeStressCounts.set(nodeId, (nodeStressCounts.get(nodeId) ?? 0) + 1);
        }
      }

      // Compute averaged nodal values
      for (const [nodeId, sum] of nodeStressSums) {
        nodalStressValues.set(nodeId, sum / (nodeStressCounts.get(nodeId) ?? 1));
      }
    }

    // Check if we're in void edit mode for a specific plate
    const isVoidEditMode = voidTargetPlateId !== null && plateEditState === 'void';
    const voidEditPlate = isVoidEditMode ? mesh.getPlateRegion(voidTargetPlateId) : null;
    const voidEditElementIds = voidEditPlate ? new Set(voidEditPlate.elementIds) : null;

    // Draw elements (triangles and quads) for plane stress/strain
    for (const element of mesh.elements.values()) {
      // Skip elements of the plate being edited (void edit mode)
      if (voidEditElementIds && voidEditElementIds.has(element.id)) continue;

      const nodes = mesh.getElementNodes(element);
      if (nodes.length < 3) continue;

      let drawNodes = nodes;

      if (viewMode === 'results' && showDeformed && result && nodeIdToIndex) {
        drawNodes = nodes.map(n => {
          const idx = nodeIdToIndex.get(n.id);
          if (idx === undefined) return n;
          if (analysisType === 'plate_bending') {
            // w (deflection) mapped to y-offset for 2D visualization
            const w = result.displacements[idx * 3] * deformationScale;
            return { ...n, y: n.y + w };
          }
          // plane_stress/plane_strain: 2 DOFs per node (u, v)
          const u = result.displacements[idx * plateDofsPerNode] * deformationScale;
          const v = result.displacements[idx * plateDofsPerNode + 1] * deformationScale;
          return { ...n, x: n.x + u, y: n.y + v };
        });
      }

      // Build polygon path for any element (3 or 4 nodes)
      const screenPts = drawNodes.map(n => worldToScreen(n.x, n.y));

      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let pi = 1; pi < screenPts.length; pi++) {
        ctx.lineTo(screenPts[pi].x, screenPts[pi].y);
      }
      ctx.closePath();

      // Fill with stress color or material color
      if (showStress && result && showStressGradient && stressType !== 'normals') {
        const stress = result.elementStresses.get(element.id);
        if (stress) {
          // Check if smoothed mode with pre-computed nodal values
          if (stressDisplayMode === 'smoothed' && nodalStressValues.size > 0) {
            // Get nodal stress values for this element's corners
            const cornerValues = element.nodeIds.map(nid => nodalStressValues.get(nid) ?? 0);

            // Compute center point (screen coords) and center value
            const cx = screenPts.reduce((s, p) => s + p.x, 0) / screenPts.length;
            const cy = screenPts.reduce((s, p) => s + p.y, 0) / screenPts.length;
            const centerValue = cornerValues.reduce((s, v) => s + v, 0) / cornerValues.length;

            // Draw sub-triangles from center to each edge with interpolated colors
            for (let si = 0; si < screenPts.length; si++) {
              const sj = (si + 1) % screenPts.length;
              const p0 = screenPts[si];
              const p1 = screenPts[sj];
              const v0 = cornerValues[si];
              const v1 = cornerValues[sj];

              // Average value for this sub-triangle
              const avgVal = (v0 + v1 + centerValue) / 3;

              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(p0.x, p0.y);
              ctx.lineTo(p1.x, p1.y);
              ctx.closePath();
              ctx.fillStyle = getStressColor(avgVal, smoothedMinVal, smoothedMaxVal);
              ctx.fill();
            }
          } else {
            // Per-element (integration point) mode - single color for entire element
            let value: number;
            let minVal: number;
            let maxVal: number;
            const sr = result.stressRanges;
            switch (stressType) {
              case 'sigmaX':
                value = stress.sigmaX;
                minVal = sr?.sigmaX.min ?? result.minVonMises;
                maxVal = sr?.sigmaX.max ?? result.maxVonMises;
                break;
              case 'sigmaY':
                value = stress.sigmaY;
                minVal = sr?.sigmaY.min ?? result.minVonMises;
                maxVal = sr?.sigmaY.max ?? result.maxVonMises;
                break;
              case 'tauXY':
                value = stress.tauXY;
                minVal = sr?.tauXY.min ?? result.minVonMises;
                maxVal = sr?.tauXY.max ?? result.maxVonMises;
                break;
              case 'mx':
                value = stress.mx ?? 0;
                minVal = sr?.mx.min ?? result.minMoment ?? 0;
                maxVal = sr?.mx.max ?? result.maxMoment ?? 1;
                break;
              case 'my':
                value = stress.my ?? 0;
                minVal = sr?.my.min ?? result.minMoment ?? 0;
                maxVal = sr?.my.max ?? result.maxMoment ?? 1;
                break;
              case 'mxy':
                value = stress.mxy ?? 0;
                minVal = sr?.mxy.min ?? result.minMoment ?? 0;
                maxVal = sr?.mxy.max ?? result.maxMoment ?? 1;
                break;
              case 'vx':
                value = stress.vx ?? 0;
                minVal = sr?.vx.min ?? 0;
                maxVal = sr?.vx.max ?? 1;
                break;
              case 'vy':
                value = stress.vy ?? 0;
                minVal = sr?.vy.min ?? 0;
                maxVal = sr?.vy.max ?? 1;
                break;
              case 'nx':
                value = stress.nx ?? 0;
                minVal = sr?.nx.min ?? 0;
                maxVal = sr?.nx.max ?? 1;
                break;
              case 'ny':
                value = stress.ny ?? 0;
                minVal = sr?.ny.min ?? 0;
                maxVal = sr?.ny.max ?? 1;
                break;
              case 'nxy':
                value = stress.nxy ?? 0;
                minVal = sr?.nxy.min ?? 0;
                maxVal = sr?.nxy.max ?? 1;
                break;
              default:
                value = stress.vonMises;
                minVal = result.minVonMises;
                maxVal = result.maxVonMises;
            }
            ctx.fillStyle = getStressColor(value, minVal, maxVal);
            ctx.fill();
          }
        }
      } else {
        const material = mesh.getMaterial(element.materialId);
        // Check for thermal load overlay
        const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
        const hasThermal = activeLc?.thermalLoads?.some(tl => tl.elementId === element.id);
        if (hasThermal) {
          ctx.fillStyle = '#f59e0b50'; // light orange for thermal
        } else {
          ctx.fillStyle = material ? material.color + '40' : '#3b82f640';
        }
        ctx.fill();
      }

      // Stroke
      const isSelected = selection.elementIds.has(element.id);
      if (isSelected) {
        ctx.save();
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = isSelected ? '#e94560' : '#3b82f6';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
      if (isSelected) {
        ctx.restore();
      }
    }

    // Draw normals arrows (after element rendering)
    if (stressType === 'normals' && result && viewMode === 'results') {
      let maxMag = 0;
      const arrowData: {cx: number, cy: number, angle: number, mag: number}[] = [];
      for (const [elemId, stress] of result.elementStresses) {
        const nxVal = stress.nx ?? 0;
        const nyVal = stress.ny ?? 0;
        const mag = Math.sqrt(nxVal * nxVal + nyVal * nyVal);
        if (mag > maxMag) maxMag = mag;
        const elem = mesh.getElement(elemId);
        if (!elem) continue;
        let cx = 0, cy = 0;
        const elemNodes = mesh.getElementNodes(elem);
        for (const nd of elemNodes) {
          cx += nd.x; cy += nd.y;
        }
        cx /= elemNodes.length;
        cy /= elemNodes.length;
        arrowData.push({ cx, cy, angle: Math.atan2(nyVal, nxVal), mag });
      }
      if (maxMag > 0) {
        const maxLen = 35;
        for (const { cx, cy, angle, mag } of arrowData) {
          const scr = worldToScreen(cx, cy);
          const len = (mag / maxMag) * maxLen;
          const t = mag / maxMag;
          const r = Math.round(t * 255);
          const b = Math.round((1 - t) * 255);
          ctx.strokeStyle = `rgb(${r}, 50, ${b})`;
          ctx.fillStyle = `rgb(${r}, 50, ${b})`;
          ctx.lineWidth = 1.5;
          const dx = Math.cos(angle) * len;
          const dy = -Math.sin(angle) * len;
          ctx.beginPath();
          ctx.moveTo(scr.x - dx / 2, scr.y - dy / 2);
          ctx.lineTo(scr.x + dx / 2, scr.y + dy / 2);
          ctx.stroke();
          const headLen = 5;
          const headAngle = 0.4;
          const tipX = scr.x + dx / 2;
          const tipY = scr.y + dy / 2;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - headLen * Math.cos(angle - headAngle), tipY + headLen * Math.sin(angle - headAngle));
          ctx.lineTo(tipX - headLen * Math.cos(angle + headAngle), tipY + headLen * Math.sin(angle + headAngle));
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw shear trajectory arrows (vx, vy direction)
    if (stressType === 'shearTrajectory' && result && viewMode === 'results') {
      let maxMag = 0;
      const arrowData: {cx: number, cy: number, angle: number, mag: number}[] = [];
      for (const [elemId, stress] of result.elementStresses) {
        const vxVal = stress.vx ?? 0;
        const vyVal = stress.vy ?? 0;
        const mag = Math.sqrt(vxVal * vxVal + vyVal * vyVal);
        if (mag > maxMag) maxMag = mag;
        const elem = mesh.getElement(elemId);
        if (!elem) continue;
        let cx = 0, cy = 0;
        const elemNodes = mesh.getElementNodes(elem);
        for (const nd of elemNodes) {
          cx += nd.x; cy += nd.y;
        }
        cx /= elemNodes.length;
        cy /= elemNodes.length;
        arrowData.push({ cx, cy, angle: Math.atan2(vyVal, vxVal), mag });
      }
      if (maxMag > 0) {
        const maxLen = 35;
        for (const { cx, cy, angle, mag } of arrowData) {
          const scr = worldToScreen(cx, cy);
          const len = (mag / maxMag) * maxLen;
          const t = mag / maxMag;
          // Green-cyan gradient for shear
          const g = Math.round(150 + t * 105);
          const b = Math.round(200 - t * 100);
          ctx.strokeStyle = `rgb(50, ${g}, ${b})`;
          ctx.fillStyle = `rgb(50, ${g}, ${b})`;
          ctx.lineWidth = 1.5;
          const dx = Math.cos(angle) * len;
          const dy = -Math.sin(angle) * len;
          ctx.beginPath();
          ctx.moveTo(scr.x - dx / 2, scr.y - dy / 2);
          ctx.lineTo(scr.x + dx / 2, scr.y + dy / 2);
          ctx.stroke();
          const headLen = 5;
          const headAngle = 0.4;
          const tipX = scr.x + dx / 2;
          const tipY = scr.y + dy / 2;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - headLen * Math.cos(angle - headAngle), tipY + headLen * Math.sin(angle - headAngle));
          ctx.lineTo(tipX - headLen * Math.cos(angle + headAngle), tipY + headLen * Math.sin(angle + headAngle));
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw moment principal direction trajectories (mx, my, mxy → principal angles)
    if (stressType === 'momentTrajectory' && result && viewMode === 'results') {
      let maxMag = 0;
      const trajectoryData: {cx: number, cy: number, angle1: number, angle2: number, mag1: number, mag2: number}[] = [];
      for (const [elemId, stress] of result.elementStresses) {
        const mxVal = stress.mx ?? 0;
        const myVal = stress.my ?? 0;
        const mxyVal = stress.mxy ?? 0;

        // Compute principal moments and directions
        // Principal values: M1, M2 = (mx + my)/2 ± sqrt(((mx-my)/2)^2 + mxy^2)
        const avg = (mxVal + myVal) / 2;
        const diff = (mxVal - myVal) / 2;
        const radius = Math.sqrt(diff * diff + mxyVal * mxyVal);
        const m1 = avg + radius;  // Maximum principal moment
        const m2 = avg - radius;  // Minimum principal moment

        // Principal angle (angle of M1 direction from x-axis)
        // tan(2θ) = 2*mxy / (mx - my)
        const theta = mxyVal === 0 && diff === 0 ? 0 : Math.atan2(2 * mxyVal, mxVal - myVal) / 2;

        const mag = Math.max(Math.abs(m1), Math.abs(m2));
        if (mag > maxMag) maxMag = mag;

        const elem = mesh.getElement(elemId);
        if (!elem) continue;
        let cx = 0, cy = 0;
        const elemNodes = mesh.getElementNodes(elem);
        for (const nd of elemNodes) {
          cx += nd.x; cy += nd.y;
        }
        cx /= elemNodes.length;
        cy /= elemNodes.length;

        trajectoryData.push({
          cx, cy,
          angle1: theta,
          angle2: theta + Math.PI / 2,  // Perpendicular direction
          mag1: Math.abs(m1),
          mag2: Math.abs(m2)
        });
      }
      if (maxMag > 0) {
        const maxLen = 30;
        for (const { cx, cy, angle1, angle2, mag1, mag2 } of trajectoryData) {
          const scr = worldToScreen(cx, cy);

          // Draw principal direction 1 (M1) - red/orange for tension, blue for compression
          const len1 = (mag1 / maxMag) * maxLen;
          if (len1 > 2) {
            const t1 = mag1 / maxMag;
            ctx.strokeStyle = `rgb(${Math.round(200 + t1 * 55)}, ${Math.round(100 - t1 * 50)}, 50)`;
            ctx.lineWidth = 2;
            const dx1 = Math.cos(angle1) * len1;
            const dy1 = -Math.sin(angle1) * len1;
            ctx.beginPath();
            ctx.moveTo(scr.x - dx1 / 2, scr.y - dy1 / 2);
            ctx.lineTo(scr.x + dx1 / 2, scr.y + dy1 / 2);
            ctx.stroke();
          }

          // Draw principal direction 2 (M2) - perpendicular, cyan/blue
          const len2 = (mag2 / maxMag) * maxLen;
          if (len2 > 2) {
            const t2 = mag2 / maxMag;
            ctx.strokeStyle = `rgb(50, ${Math.round(150 + t2 * 100)}, ${Math.round(200 + t2 * 55)})`;
            ctx.lineWidth = 1.5;
            const dx2 = Math.cos(angle2) * len2;
            const dy2 = -Math.sin(angle2) * len2;
            ctx.beginPath();
            ctx.moveTo(scr.x - dx2 / 2, scr.y - dy2 / 2);
            ctx.lineTo(scr.x + dx2 / 2, scr.y + dy2 / 2);
            ctx.stroke();
          }
        }
      }
    }

    // Draw plate region boundaries
    for (const plate of mesh.plateRegions.values()) {
      const isPlateSelected = selection.plateIds.has(plate.id);

      if (plate.isPolygon && plate.polygon && plate.polygon.length >= 3) {
        // Draw actual polygon outline
        const polyScreenPts = plate.polygon.map(p => worldToScreen(p.x, p.y));

        // Fill
        ctx.fillStyle = isPlateSelected ? 'rgba(233, 69, 96, 0.08)' : 'rgba(59, 130, 246, 0.05)';
        ctx.beginPath();
        polyScreenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();

        // Stroke
        if (isPlateSelected) {
          ctx.save();
          ctx.shadowColor = '#e94560';
          ctx.shadowBlur = 14;
        }
        ctx.strokeStyle = isPlateSelected ? '#e94560' : '#3b82f680';
        ctx.lineWidth = isPlateSelected ? 2 : 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        polyScreenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (isPlateSelected) {
          ctx.restore();
        }

        // Draw voids
        if (plate.voids) {
          for (const voidPoly of plate.voids) {
            const voidScreenPts = voidPoly.map(p => worldToScreen(p.x, p.y));
            ctx.strokeStyle = isPlateSelected ? '#e94560' : '#3b82f680';
            ctx.lineWidth = isPlateSelected ? 2 : 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            voidScreenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      } else {
        // Rectangular plate: draw using corner node positions (so contour follows during drag)
        const [blId, brId, trId, tlId] = plate.cornerNodeIds;
        const blNode = mesh.getNode(blId);
        const brNode = mesh.getNode(brId);
        const trNode = mesh.getNode(trId);
        const tlNode = mesh.getNode(tlId);
        const bl = worldToScreen(blNode?.x ?? plate.x, blNode?.y ?? plate.y);
        const br = worldToScreen(brNode?.x ?? plate.x + plate.width, brNode?.y ?? plate.y);
        const tr = worldToScreen(trNode?.x ?? plate.x + plate.width, trNode?.y ?? plate.y + plate.height);
        const tl = worldToScreen(tlNode?.x ?? plate.x, tlNode?.y ?? plate.y + plate.height);

        // Light background fill
        ctx.fillStyle = isPlateSelected ? 'rgba(233, 69, 96, 0.08)' : 'rgba(59, 130, 246, 0.05)';
        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(tl.x, tl.y);
        ctx.closePath();
        ctx.fill();

        // Dashed boundary rectangle
        if (isPlateSelected) {
          ctx.save();
          ctx.shadowColor = '#e94560';
          ctx.shadowBlur = 14;
        }
        ctx.strokeStyle = isPlateSelected ? '#e94560' : '#3b82f680';
        ctx.lineWidth = isPlateSelected ? 2 : 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(tl.x, tl.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (isPlateSelected) {
          ctx.restore();
        }
      }

      // Draw IEdge boundary segments (colored lines on polygon edges) - only when addLineLoad tool is active
      if (selectedTool === 'addLineLoad' && plate.edgeIds && plate.edgeIds.length > 0) {
        const edgeColors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
        for (let eIdx = 0; eIdx < plate.edgeIds.length; eIdx++) {
          const edge = mesh.getEdge(plate.edgeIds[eIdx]);
          if (!edge || edge.nodeIds.length < 2) continue;
          ctx.strokeStyle = edgeColors[eIdx % edgeColors.length];
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          for (let ni = 0; ni < edge.nodeIds.length; ni++) {
            const node = mesh.getNode(edge.nodeIds[ni]);
            if (!node) continue;
            const sp = worldToScreen(node.x, node.y);
            if (ni === 0) ctx.moveTo(sp.x, sp.y);
            else ctx.lineTo(sp.x, sp.y);
          }
          ctx.stroke();
        }
      }

      // Highlight hovered edge for addLineLoad tool
      if (hoveredEdgeId !== null && selectedTool === 'addLineLoad') {
        const hovEdge = mesh.getEdge(hoveredEdgeId);
        if (hovEdge && (plate.edgeIds ?? []).concat(
          Array.from(mesh.edges.values()).filter(e => e.plateId === plate.id).map(e => e.id)
        ).includes(hoveredEdgeId)) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
          ctx.beginPath();
          const hv1 = worldToScreen(hovEdge.vertexStart.x, hovEdge.vertexStart.y);
          const hv2 = worldToScreen(hovEdge.vertexEnd.x, hovEdge.vertexEnd.y);
          ctx.moveTo(hv1.x, hv1.y);
          ctx.lineTo(hv2.x, hv2.y);
          ctx.stroke();
        }
      }

      // Draw edge-based distributed loads (unified system: distributedLoads with edgeId)
      if (showLoads && viewMode !== 'geometry') {
        const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
        if (activeLc) {
          // Find distributed loads targeting edges of this plate
          const plateEdgeIds = new Set((plate.edgeIds ?? []).concat(
            Array.from(mesh.edges.values()).filter(e => e.plateId === plate.id).map(e => e.id)
          ));
          const edgeLoads = activeLc.distributedLoads.filter(dl => dl.edgeId !== undefined && plateEdgeIds.has(dl.edgeId!));
          for (const dl of edgeLoads) {
            const iedge = mesh.getEdge(dl.edgeId!);
            if (!iedge) continue;

            // Collect edge screen positions from IEdge nodeIds
            const edgeScreenPts: { x: number; y: number }[] = [];
            if (iedge.nodeIds.length >= 2) {
              for (const nodeId of iedge.nodeIds) {
                const node = mesh.getNode(nodeId);
                if (node) edgeScreenPts.push(worldToScreen(node.x, node.y));
              }
            }
            // Fallback to edge vertices
            if (edgeScreenPts.length < 2) {
              edgeScreenPts.length = 0;
              edgeScreenPts.push(worldToScreen(iedge.vertexStart.x, iedge.vertexStart.y));
              edgeScreenPts.push(worldToScreen(iedge.vertexEnd.x, iedge.vertexEnd.y));
            }
            if (edgeScreenPts.length < 2) continue;

            const mag = Math.sqrt(dl.qx ** 2 + dl.qy ** 2);
            if (mag < 0.01) continue;

            const isThisLoadSelected = dl.id != null && selection.selectedDistLoadIds.has(dl.id);
            const arrowLen = Math.min(35, mag / 500 * 30 + 18);
            const edgeColor = isThisLoadSelected ? '#ef4444' : (activeLc.color ?? '#3b82f6');
            ctx.strokeStyle = edgeColor;
            ctx.fillStyle = edgeColor;
            ctx.lineWidth = 1.5;

            if (isThisLoadSelected) {
              ctx.save();
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 12;
            }

            // Normalized load direction in screen coords
            const ndx = dl.qx / mag;
            const ndy = -(dl.qy / mag); // flip Y

            // Draw connecting line at arrow tails (offset from edge)
            ctx.beginPath();
            ctx.moveTo(edgeScreenPts[0].x - ndx * arrowLen, edgeScreenPts[0].y - ndy * arrowLen);
            for (let i = 1; i < edgeScreenPts.length; i++) {
              ctx.lineTo(edgeScreenPts[i].x - ndx * arrowLen, edgeScreenPts[i].y - ndy * arrowLen);
            }
            ctx.stroke();

            // Draw arrows from tail line to edge nodes
            const arrowAngle = Math.atan2(ndy, ndx);
            for (const sp of edgeScreenPts) {
              const tailX = sp.x - ndx * arrowLen;
              const tailY = sp.y - ndy * arrowLen;

              ctx.beginPath();
              ctx.moveTo(tailX, tailY);
              ctx.lineTo(sp.x, sp.y);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(sp.x, sp.y);
              ctx.lineTo(sp.x - 7 * Math.cos(arrowAngle - 0.4), sp.y - 7 * Math.sin(arrowAngle - 0.4));
              ctx.lineTo(sp.x - 7 * Math.cos(arrowAngle + 0.4), sp.y - 7 * Math.sin(arrowAngle + 0.4));
              ctx.closePath();
              ctx.fill();
            }

            if (isThisLoadSelected) {
              ctx.restore();
            }

            // Label at midpoint of edge, offset along arrow direction
            const midIdx = Math.floor(edgeScreenPts.length / 2);
            const labelX = edgeScreenPts[midIdx].x - ndx * (arrowLen + 8);
            const labelY = edgeScreenPts[midIdx].y - ndy * (arrowLen + 8);
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = edgeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const qxKN = (dl.qx / 1000).toFixed(1);
            const qzKN = (dl.qy / 1000).toFixed(1);
            const desc = dl.description ? `${dl.description}: ` : '';
            ctx.fillText(`${desc}q = (${qxKN}, ${qzKN}) kN/m`, labelX, labelY);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }
        }
      }
    }

    // Draw polygon contour outlines and edge midpoint handles
    for (const plate of mesh.plateRegions.values()) {
      if (!plate.isPolygon || !plate.polygon || plate.polygon.length < 3) continue;

      // Draw solid contour outline (the persistent geometry)
      const polyPts = plate.polygon.map(p => worldToScreen(p.x, p.y));
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      polyPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();

      // Draw edge midpoint handles (circles, like beam mid-gizmo)
      const isEdgeActive = contourEdgeDrag?.plateId === plate.id;
      for (let ei = 0; ei < plate.polygon.length; ei++) {
        const p1 = polyPts[ei];
        const p2 = polyPts[(ei + 1) % polyPts.length];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const isDraggedEdge = isEdgeActive && contourEdgeDrag?.edgeIndex === ei;
        const handleR = isDraggedEdge ? 8 : 6;

        ctx.fillStyle = isDraggedEdge ? '#60a5fa' : '#4299e1';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(midX, midY, handleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw move arrows inside
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const ar = 3;
        ctx.beginPath();
        ctx.moveTo(midX - ar, midY); ctx.lineTo(midX + ar, midY);
        ctx.moveTo(midX, midY - ar); ctx.lineTo(midX, midY + ar);
        ctx.stroke();
      }

      // Draw void contour vertex handles
      if (plate.voids) {
        for (const voidPoly of plate.voids) {
          const voidPts = voidPoly.map(p => worldToScreen(p.x, p.y));
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          voidPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.stroke();

          for (const sp of voidPts) {
            ctx.fillStyle = '#ef4444';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
            ctx.strokeRect(sp.x - 4, sp.y - 4, 8, 8);
          }
        }
      }
    }

    // Draw thermal load labels on plates
    if (showLoads && viewMode !== 'geometry') {
      const activeLcForTherm = loadCases.find(lc => lc.id === activeLoadCase);
      if (activeLcForTherm?.thermalLoads) {
        // Group by plate
        const plateDeltas = new Map<number, number>();
        for (const tl of activeLcForTherm.thermalLoads) {
          if (tl.plateId !== undefined) {
            plateDeltas.set(tl.plateId, tl.deltaT);
          }
        }
        for (const [pId, dT] of plateDeltas) {
          const plate = mesh.getPlateRegion(pId);
          if (!plate) continue;
          let cx: number, cy: number;
          if (plate.isPolygon && plate.polygon) {
            const c = polygonCentroid(plate.polygon);
            cx = c.x; cy = c.y;
          } else {
            cx = plate.x + plate.width / 2;
            cy = plate.y + plate.height / 2;
          }
          const sp = worldToScreen(cx, cy);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#f59e0b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`ΔT = ${dT}°C`, sp.x, sp.y);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Deferred connection symbols (drawn after nodes so they appear on top)
    const deferredConnectionSymbols: { px: number; py: number; type: ConnectionType; beamAngle: number }[] = [];

    // Draw beam elements
    for (const beam of mesh.beamElements.values()) {
      if (isBeamHidden(beam)) continue;
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;

      let drawN1 = n1;
      let drawN2 = n2;

      // Track cubic deformation curve points for drawing
      let deformedCurvePoints: { x: number; y: number }[] | null = null;

      if (viewMode === 'results' && showDeformed && result && nodeIdToIndex) {
        const idx1 = nodeIdToIndex.get(n1.id);
        const idx2 = nodeIdToIndex.get(n2.id);
        if (idx1 !== undefined && idx2 !== undefined) {
          const u1 = result.displacements[idx1 * dofsPerNode] * deformationScale;
          const v1 = result.displacements[idx1 * dofsPerNode + 1] * deformationScale;
          const u2 = result.displacements[idx2 * dofsPerNode] * deformationScale;
          const v2 = result.displacements[idx2 * dofsPerNode + 1] * deformationScale;
          drawN1 = { ...n1, x: n1.x + u1, y: n1.y + v1 };
          drawN2 = { ...n2, x: n2.x + u2, y: n2.y + v2 };

          // Cubic Hermite interpolation using rotation DOFs for frame analysis
          if (dofsPerNode === 3) {
            const theta1 = result.displacements[idx1 * 3 + 2] * deformationScale;
            const theta2 = result.displacements[idx2 * 3 + 2] * deformationScale;
            const L = calculateBeamLength(n1, n2);
            const alpha = calculateBeamAngle(n1, n2);
            const cosA = Math.cos(alpha);
            const sinA = Math.sin(alpha);

            // Transform global displacements to local beam coordinates
            const u1_loc = u1 * cosA + v1 * sinA;
            const v1_loc = -u1 * sinA + v1 * cosA;
            const u2_loc = u2 * cosA + v2 * sinA;
            const v2_loc = -u2 * sinA + v2 * cosA;

            const numPts = 16;
            deformedCurvePoints = [];
            for (let i = 0; i <= numPts; i++) {
              const t = i / numPts;
              // Hermite shape functions
              const H1 = 1 - 3 * t * t + 2 * t * t * t;
              const H2 = t - 2 * t * t + t * t * t;
              const H3 = 3 * t * t - 2 * t * t * t;
              const H4 = -t * t + t * t * t;

              // Local interpolated displacements
              const u_loc = (1 - t) * u1_loc + t * u2_loc;
              const v_loc = H1 * v1_loc + H2 * theta1 * L + H3 * v2_loc + H4 * theta2 * L;

              // Undeformed position along beam
              const x_base = n1.x + (n2.x - n1.x) * t;
              const y_base = n1.y + (n2.y - n1.y) * t;

              // Add displacement (transform local back to global)
              const dx = u_loc * cosA - v_loc * sinA;
              const dy = u_loc * sinA + v_loc * cosA;

              deformedCurvePoints.push(worldToScreen(x_base + dx, y_base + dy));
            }
          }
        }
      }

      const p1 = worldToScreen(drawN1.x, drawN1.y);
      const p2 = worldToScreen(drawN2.x, drawN2.y);

      // Draw beam as thick line (or cubic curve when deformed)
      const isSelected = selection.elementIds.has(beam.id);
      const isHovered = hoveredBeamId === beam.id;

      // Draw profile width outline when showProfileNames is enabled and section.h is available
      if (showProfileNames && beam.section && beam.section.h && showMembers) {
        const hPixels = beam.section.h * viewStateRef.current.scale; // section height in pixels
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          // Perpendicular direction (unit vector)
          const perpX = -dy / len;
          const perpY = dx / len;
          const halfH = hPixels / 2;

          // Four corners of the profile rectangle
          const c1x = p1.x + perpX * halfH;
          const c1y = p1.y + perpY * halfH;
          const c2x = p2.x + perpX * halfH;
          const c2y = p2.y + perpY * halfH;
          const c3x = p2.x - perpX * halfH;
          const c3y = p2.y - perpY * halfH;
          const c4x = p1.x - perpX * halfH;
          const c4y = p1.y - perpY * halfH;

          const beamColor = isSelected ? '#e94560' : isHovered ? '#fbbf24' : '#60a5fa';

          // Semi-transparent fill
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = beamColor;
          ctx.beginPath();
          ctx.moveTo(c1x, c1y);
          ctx.lineTo(c2x, c2y);
          ctx.lineTo(c3x, c3y);
          ctx.lineTo(c4x, c4y);
          ctx.closePath();
          ctx.fill();

          // Thin outline
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = beamColor;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      if (showMembers) {
        if (isSelected) {
          ctx.save();
          ctx.shadowColor = '#e94560';
          ctx.shadowBlur = 14;
        }
        ctx.strokeStyle = isSelected ? '#e94560' : isHovered ? '#fbbf24' : '#60a5fa';
        ctx.lineWidth = isSelected ? 6 : isHovered ? 5 : 4;
        ctx.lineCap = 'round';

        if (deformedCurvePoints && deformedCurvePoints.length > 1) {
          // Draw smooth cubic deformation curve
          ctx.beginPath();
          ctx.moveTo(deformedCurvePoints[0].x, deformedCurvePoints[0].y);
          for (let i = 1; i < deformedCurvePoints.length; i++) {
            ctx.lineTo(deformedCurvePoints[i].x, deformedCurvePoints[i].y);
          }
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }

        // Draw end circles (bar symbol)
        const circleR = 4;
        ctx.fillStyle = isSelected ? '#e94560' : isHovered ? '#fbbf24' : '#60a5fa';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, circleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, circleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (isSelected) {
          ctx.restore();
        }
      }

      // Draw distributed loads if present (only in loads/results view)
      // Iterate over all individual loads from the active load case for this beam
      // Stacking: offset subsequent loads by the arrow height of previous loads
      // Each load can be individually selected via selectedDistLoadIds
      if (showLoads && viewMode !== 'geometry') {
        // Only highlight ALL loads when the beam element itself is selected (not when an individual load is)
        const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
        const beamLoads = activeLc?.distributedLoads.filter(dl => dl.elementId === beam.id) ?? [];
        if (beamLoads.length > 0) {
          let cumulativeOffset = 0;
          for (const dl of beamLoads) {
            // Individual load selection: only this specific load, OR all loads when beam element is selected
            const isThisLoadSelected = isSelected || (dl.id != null && selection.selectedDistLoadIds.has(dl.id));
            // Use a brighter/highlighted color when individually selected
            const loadColor = isThisLoadSelected ? '#ef4444' : (activeLc?.color ?? '#3b82f6');
            if (isThisLoadSelected) {
              ctx.save();
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 12;
            }
            const arrowHeight = drawDistributedLoad(ctx, beam, n1, n2, isThisLoadSelected, {
              qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd,
              startT: dl.startT, endT: dl.endT, coordSystem: dl.coordSystem,
              description: dl.description
            }, cumulativeOffset, loadColor);
            if (isThisLoadSelected) {
              ctx.restore();
            }
            // Stack next load after this one's arrows (always positive direction)
            cumulativeOffset += arrowHeight + 4; // 4px gap between stacked loads
          }
        } else {
          // Fallback: draw from beam.distributedLoad (e.g. during live preview)
          if (isSelected) {
            ctx.save();
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 12;
          }
          drawDistributedLoad(ctx, beam, n1, n2, isSelected);
          if (isSelected) {
            ctx.restore();
          }
        }
      }

      // Draw profile name on beam (only if a named profile is assigned)
      if (showProfileNames && beam.profileName) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#8b949e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(beam.profileName, midX, midY - 6);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw I-section symbol at beam midpoint (bar symbol)
      if (showProfileNames && beam.section) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const beamAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const perpAngle = beamAngle + Math.PI / 2;
        const h = 10; // half-height of I-section symbol
        const fw = 6; // flange half-width

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(perpAngle);
        ctx.strokeStyle = isSelected ? '#e94560' : '#8b949e';
        ctx.lineWidth = 1.5;
        // Web (vertical line)
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(0, h);
        ctx.stroke();
        // Top flange
        ctx.beginPath();
        ctx.moveTo(-fw, -h);
        ctx.lineTo(fw, -h);
        ctx.stroke();
        // Bottom flange
        ctx.beginPath();
        ctx.moveTo(-fw, h);
        ctx.lineTo(fw, h);
        ctx.stroke();
        ctx.restore();
      }

      // Collect connection symbols for deferred drawing (after nodes)
      // Symbols are offset along the beam away from the node
      {
        const { start: startConn, end: endConn } = getConnectionTypes(beam);
        const beamAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const offset = 14; // px offset along beam from node center
        if (startConn !== 'fixed') {
          deferredConnectionSymbols.push({
            px: p1.x + Math.cos(beamAngle) * offset,
            py: p1.y + Math.sin(beamAngle) * offset,
            type: startConn, beamAngle,
          });
        }
        if (endConn !== 'fixed') {
          deferredConnectionSymbols.push({
            px: p2.x - Math.cos(beamAngle) * offset,
            py: p2.y - Math.sin(beamAngle) * offset,
            type: endConn, beamAngle,
          });
        }
      }

      // Draw member label (beam ID)
      if (showMemberLabels) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#60a5fa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${beam.id}`, midX, midY + 6);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw element type label (colored pill badge)
      if (showElementTypes && beam.elementType && beam.elementType !== 'none') {
        const elTypeColorMap: Record<string, string> = {
          roof_left: '#f59e0b',
          roof_right: '#f59e0b',
          flat_roof: '#f59e0b',
          facade_left: '#3b82f6',
          facade_right: '#3b82f6',
          floor: '#10b981',
          column: '#8b5cf6',
        };
        const elTypeLabelMap: Record<string, string> = {
          roof_left: 'Roof\u2197',
          roof_right: 'Roof\u2198',
          flat_roof: 'Flat Rf',
          facade_left: 'Facade\u2190',
          facade_right: 'Facade\u2192',
          floor: 'Floor',
          column: 'Column',
        };
        const elColor = elTypeColorMap[beam.elementType] || '#6b7280';
        const elLabel = elTypeLabelMap[beam.elementType] || beam.elementType;

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        // Offset perpendicular to beam direction
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / len;
        const perpY = dx / len;
        const offsetPx = 16;
        const labelX = midX + perpX * offsetPx;
        const labelY = midY + perpY * offsetPx;

        ctx.font = 'bold 9px sans-serif';
        const tw = ctx.measureText(elLabel).width + 10;
        const th = 14;
        const rx = labelX - tw / 2;
        const ry = labelY - th / 2;

        // Pill background
        ctx.fillStyle = elColor;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.roundRect(rx, ry, tw, th, 7);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Pill text
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(elLabel, labelX, labelY);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw UC badge when results are available
      if (viewMode === 'results' && result && beam.section) {
        const forces = result.beamForces.get(beam.id);
        if (forces) {
          const grade = STEEL_GRADES[2]; // S355
          const sectionProps = {
            A: beam.section.A,
            I: beam.section.I,
            h: beam.section.h,
            profileName: beam.profileName,
          };
          const check = checkSteelSection(sectionProps, forces, grade);
          const uc = check.UC_max;
          const isOk = uc <= 1.0;

          // Position: offset from beam end (3/4 along beam)
          const t = 0.75;
          const bx = p1.x + (p2.x - p1.x) * t;
          const by = p1.y + (p2.y - p1.y) * t;

          const label = `UC ${uc.toFixed(2)}`;
          ctx.font = 'bold 9px sans-serif';
          const tw = ctx.measureText(label).width + 8;
          const th = 14;

          // Badge background
          ctx.fillStyle = isOk ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
          const rx = bx - tw / 2;
          const ry = by - th - 4;
          ctx.beginPath();
          ctx.roundRect(rx, ry, tw, th, 3);
          ctx.fill();

          // Badge text
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bx, ry + th / 2);

          // Checkmark or cross icon
          const iconX = bx - tw / 2 + 8;
          const iconY = ry + th / 2;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          if (isOk) {
            ctx.beginPath();
            ctx.moveTo(iconX - 3, iconY);
            ctx.lineTo(iconX - 1, iconY + 2);
            ctx.lineTo(iconX + 3, iconY - 2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(iconX - 2, iconY - 2);
            ctx.lineTo(iconX + 2, iconY + 2);
            ctx.moveTo(iconX + 2, iconY - 2);
            ctx.lineTo(iconX - 2, iconY + 2);
            ctx.stroke();
          }

          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    // Draw dimensions when enabled
    if (showDimensions) {
      drawDimensions(ctx);
    }

    // Draw force diagrams (only in results view)
    if (viewMode === 'results' && result) {
      // Shared label collision list across all diagram types
      const diagramLabels: { x: number; y: number; w: number; h: number }[] = [];
      if (showEnvelope && envelopeResult) {
        // Draw envelope diagrams (min/max across all combinations)
        if (showNormal) drawEnvelopeDiagram(ctx, 'normal');
        if (showShear) drawEnvelopeDiagram(ctx, 'shear');
        if (showMoment) drawEnvelopeDiagram(ctx, 'moment');
      } else {
        if (showNormal) drawForceDiagram(ctx, 'normal', diagramLabels);
        if (showShear) drawForceDiagram(ctx, 'shear', diagramLabels);
        if (showMoment) drawForceDiagram(ctx, 'moment', diagramLabels);
      }

      // Sign convention legend (top-left corner)
      if (showMoment || showShear || showNormal) {
        const legX = 10;
        const legY = 10;
        const entries: { label: string; color: string; sign: string }[] = [];
        if (showMoment) entries.push({ label: 'M', color: '#ef4444', sign: '+ on tension side' });
        if (showShear) entries.push({ label: 'V', color: '#3b82f6', sign: '+ upward (left)' });
        if (showNormal) entries.push({ label: 'N', color: '#22c55e', sign: '+ tension' });
        const lineH = 16;
        const panelW = 160;
        const panelH = entries.length * lineH + 10;
        ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(legX, legY, panelW, panelH, 5);
        } else {
          ctx.rect(legX, legY, panelW, panelH);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const yPos = legY + 5 + i * lineH + lineH / 2;
          ctx.fillStyle = e.color;
          ctx.fillRect(legX + 6, yPos - 4, 8, 8);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(`${e.label}: ${e.sign}`, legX + 20, yPos);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw deflection diagrams when enabled
      if (showDeflections && analysisType === 'frame' && nodeIdToIndex) {
        const deflColor = '#8b5cf6'; // purple
        const deflFill = 'rgba(139, 92, 246, 0.25)';

        for (const beam of mesh.beamElements.values()) {
          if (isBeamHidden(beam)) continue;
          const nodes = mesh.getBeamElementNodes(beam);
          if (!nodes) continue;
          const [n1, n2] = nodes;

          const idx1 = nodeIdToIndex.get(n1.id);
          const idx2 = nodeIdToIndex.get(n2.id);
          if (idx1 === undefined || idx2 === undefined) continue;

          const L = calculateBeamLength(n1, n2);
          if (L < 1e-6) continue;
          const alpha = calculateBeamAngle(n1, n2);
          const cosA = Math.cos(alpha);
          const sinA = Math.sin(alpha);

          // Get nodal displacements (in metres)
          const u1g = result.displacements[idx1 * 3];
          const v1g = result.displacements[idx1 * 3 + 1];
          const theta1 = result.displacements[idx1 * 3 + 2];
          const u2g = result.displacements[idx2 * 3];
          const v2g = result.displacements[idx2 * 3 + 1];
          const theta2 = result.displacements[idx2 * 3 + 2];

          // Transform to local beam coords
          const v1_loc = -u1g * sinA + v1g * cosA;
          const v2_loc = -u2g * sinA + v2g * cosA;

          // Chord line deflection (linear interpolation between end displacements)
          // Relative deflection = actual - chord
          const p1s = worldToScreen(n1.x, n1.y);
          const p2s = worldToScreen(n2.x, n2.y);
          const screenAngle = Math.atan2(p2s.y - p1s.y, p2s.x - p1s.x);
          const perpAngle = screenAngle - Math.PI / 2;

          // Compute deflection curve using Hermite interpolation
          const numPts = 20;
          const deflValues: number[] = [];
          const curvePoints: { x: number; y: number }[] = [];

          for (let i = 0; i <= numPts; i++) {
            const t = i / numPts;
            // Hermite shape functions for transverse displacement
            const H1 = 1 - 3 * t * t + 2 * t * t * t;
            const H2 = t - 2 * t * t + t * t * t;
            const H3 = 3 * t * t - 2 * t * t * t;
            const H4 = -t * t + t * t * t;

            const v_loc = H1 * v1_loc + H2 * theta1 * L + H3 * v2_loc + H4 * theta2 * L;

            // Chord line displacement (linear interpolation)
            const v_chord = v1_loc + (v2_loc - v1_loc) * t;

            // Relative deflection from chord (in metres)
            const defl = v_loc - v_chord;
            deflValues.push(defl);

            // Base position along beam in screen space
            const baseX = p1s.x + (p2s.x - p1s.x) * t;
            const baseY = p1s.y + (p2s.y - p1s.y) * t;

            // Scale deflection for diagram visibility (use diagramScale)
            const maxDefl = Math.max(...deflValues.map(Math.abs), 1e-10);
            const scaledOffset = defl * diagramScale / (maxDefl > 1e-10 ? maxDefl : 1) * 30;

            curvePoints.push({
              x: baseX + Math.cos(perpAngle) * scaledOffset,
              y: baseY + Math.sin(perpAngle) * scaledOffset
            });
          }

          // Re-scale all points now that we know the max deflection
          const maxDefl = Math.max(...deflValues.map(Math.abs), 1e-10);
          const scaleFactor = maxDefl > 1e-10 ? diagramScale / maxDefl * 30 : 0;

          const finalPoints: { x: number; y: number }[] = [];
          for (let i = 0; i <= numPts; i++) {
            const t = i / numPts;
            const baseX = p1s.x + (p2s.x - p1s.x) * t;
            const baseY = p1s.y + (p2s.y - p1s.y) * t;
            const scaledOffset = deflValues[i] * scaleFactor;

            finalPoints.push({
              x: baseX + Math.cos(perpAngle) * scaledOffset,
              y: baseY + Math.sin(perpAngle) * scaledOffset
            });
          }

          // Draw filled deflection diagram
          ctx.fillStyle = deflFill;
          ctx.beginPath();
          ctx.moveTo(p1s.x, p1s.y);
          for (const pt of finalPoints) {
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineTo(p2s.x, p2s.y);
          ctx.closePath();
          ctx.fill();

          // Draw outline
          ctx.strokeStyle = deflColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p1s.x, p1s.y);
          for (const pt of finalPoints) {
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineTo(p2s.x, p2s.y);
          ctx.stroke();

          // Draw reference line (chord) along beam axis
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p1s.x, p1s.y);
          ctx.lineTo(p2s.x, p2s.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Find max deflection and label it
          let maxDeflIdx = 0;
          let absMaxDefl = 0;
          for (let i = 0; i < deflValues.length; i++) {
            if (Math.abs(deflValues[i]) > absMaxDefl) {
              absMaxDefl = Math.abs(deflValues[i]);
              maxDeflIdx = i;
            }
          }

          if (absMaxDefl > 1e-10) {
            const deflMM = deflValues[maxDeflIdx] * 1000; // convert m to mm
            const label = `\u03B4 = ${Math.abs(deflMM).toFixed(2)} mm`;
            const labelPt = finalPoints[maxDeflIdx];

            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = deflColor;
            const textW = ctx.measureText(label).width + 6;
            const textH = 14;

            // Background for readability
            ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
            ctx.fillRect(labelPt.x - textW / 2, labelPt.y - textH - 4, textW, textH);
            ctx.fillStyle = deflColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, labelPt.x, labelPt.y - 4);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }
        }

        // Add deflection to legend if it was drawn
        const legX = 10;
        const existingLegendH = (showMoment || showShear || showNormal) ?
          ((showMoment ? 1 : 0) + (showShear ? 1 : 0) + (showNormal ? 1 : 0)) * 16 + 10 + 10 : 10;
        const legY = existingLegendH;
        const lineH = 16;
        const panelW2 = 160;
        const panelH2 = lineH + 10;
        ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(legX, legY, panelW2, panelH2, 5);
        } else {
          ctx.rect(legX, legY, panelW2, panelH2);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = deflColor;
        ctx.fillRect(legX + 6, legY + 5 + lineH / 2 - 4, 8, 8);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText('\u03B4: deflection from chord', legX + 20, legY + 5 + lineH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Draw pending element preview
    if ((selectedTool === 'addElement' || selectedTool === 'addBeam') && pendingNodes.length > 0) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      const pendingNodeObjs = pendingNodes.map(id => mesh.getNode(id)).filter(n => n) as INode[];

      if (pendingNodeObjs.length >= 1) {
        ctx.beginPath();
        const p = worldToScreen(pendingNodeObjs[0].x, pendingNodeObjs[0].y);
        ctx.moveTo(p.x, p.y);

        for (let i = 1; i < pendingNodeObjs.length; i++) {
          const pn = worldToScreen(pendingNodeObjs[i].x, pendingNodeObjs[i].y);
          ctx.lineTo(pn.x, pn.y);
        }

        // Draw preview line from last pending node to cursor position
        if (cursorPos) {
          ctx.lineTo(cursorPos.x, cursorPos.y);

          // Show preview length label near cursor
          if (selectedTool === 'addBeam' && pendingNodes.length === 1) {
            const lastNode = pendingNodeObjs[pendingNodeObjs.length - 1];
            const lastP = worldToScreen(lastNode.x, lastNode.y);
            const cursorWorld = screenToWorld(cursorPos.x, cursorPos.y);
            const dx = cursorWorld.x - lastNode.x;
            const dy = cursorWorld.y - lastNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const midX = (lastP.x + cursorPos.x) / 2;
            const midY = (lastP.y + cursorPos.y) / 2;

            ctx.setLineDash([]);
            ctx.font = 'bold 11px sans-serif';
            const label = `${(dist * 1000).toFixed(0)} mm`;
            const textW = ctx.measureText(label).width + 8;
            ctx.fillStyle = 'rgba(26, 26, 46, 0.9)';
            ctx.fillRect(midX - textW / 2, midY - 18, textW, 16);
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY - 10);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            ctx.setLineDash([5, 5]);
          }
        }

        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    // Draw plate polygon preview
    if (selectedTool === 'addPlate' && platePolygonPoints.length > 0) {
      const isOutlineClosed = plateEditState !== 'outline';
      const outlinePts = platePolygonPoints.map(p => worldToScreen(p.x, p.y));

      // Fill the outline
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.beginPath();
      outlinePts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      if (isOutlineClosed) ctx.closePath();
      ctx.fill();

      // Draw outline edges
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash(isOutlineClosed ? [6, 4] : []);
      ctx.beginPath();
      outlinePts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      if (isOutlineClosed) ctx.closePath();

      // If still drawing outline, add rubber-band line (or arc preview) to cursor
      if (plateEditState === 'outline' && cursorPos) {
        const cursorWorld = screenToWorld(cursorPos.x, cursorPos.y);
        const snappedCursor = snapToGridFn(cursorWorld.x, cursorWorld.y);
        const cursorScreen = worldToScreen(snappedCursor.x, snappedCursor.y);
        if (arcMode && platePolygonPoints.length > 0) {
          // Draw arc preview
          ctx.stroke(); // stroke what we have so far
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#06b6d4'; // cyan for arc
          ctx.beginPath();
          const lastPt = platePolygonPoints[platePolygonPoints.length - 1];
          const arcPts = discretizeArc(lastPt, snappedCursor);
          const lastScreen = worldToScreen(lastPt.x, lastPt.y);
          ctx.moveTo(lastScreen.x, lastScreen.y);
          for (const ap of arcPts) {
            const sp = worldToScreen(ap.x, ap.y);
            ctx.lineTo(sp.x, sp.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.lineTo(cursorScreen.x, cursorScreen.y);
          ctx.stroke();
        }
      } else {
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Draw outline vertex dots
      ctx.fillStyle = '#3b82f6';
      for (const p of outlinePts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Highlight first vertex (close target) when drawing outline
      if (plateEditState === 'outline' && outlinePts.length >= 3) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(outlinePts[0].x, outlinePts[0].y, 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw completed voids
      for (const voidPoly of plateVoids) {
        const voidPts = voidPoly.map(p => worldToScreen(p.x, p.y));
        ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        voidPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Void vertex dots
        ctx.fillStyle = '#e94560';
        for (const p of voidPts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw target plate in void edit mode - enhanced visualization
      if (voidTargetPlateId !== null && plateEditState === 'void') {
        const targetPlate = mesh.getPlateRegion(voidTargetPlateId);
        if (targetPlate && targetPlate.polygon) {
          const tgtPts = targetPlate.polygon.map(p => worldToScreen(p.x, p.y));

          // Semi-transparent fill for the plate area
          ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
          ctx.beginPath();
          tgtPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.fill();

          // Solid blue outline for the plate contour
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath();
          tgtPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.stroke();

          // Corner vertex dots (blue)
          ctx.fillStyle = '#3b82f6';
          for (const p of tgtPts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw existing voids of this plate in pink/light red
          if (targetPlate.voids && targetPlate.voids.length > 0) {
            for (const existingVoid of targetPlate.voids) {
              const voidScreenPts = existingVoid.map(p => worldToScreen(p.x, p.y));

              // Pink fill for existing voids
              ctx.fillStyle = 'rgba(236, 72, 153, 0.25)';
              ctx.beginPath();
              voidScreenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.fill();

              // Pink outline for existing voids
              ctx.strokeStyle = '#ec4899';
              ctx.lineWidth = 2;
              ctx.beginPath();
              voidScreenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.stroke();

              // Void vertex dots (pink)
              ctx.fillStyle = '#ec4899';
              for (const p of voidScreenPts) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }

      // Draw current void being drawn
      if (plateEditState === 'void' && currentVoidPoints.length > 0) {
        const voidPts = currentVoidPoints.map(p => worldToScreen(p.x, p.y));
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        voidPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));

        // Rubber-band line (or arc preview) to cursor
        if (cursorPos) {
          const cursorWorld = screenToWorld(cursorPos.x, cursorPos.y);
          const snappedCursor = snapToGridFn(cursorWorld.x, cursorWorld.y);
          const cursorScreen = worldToScreen(snappedCursor.x, snappedCursor.y);
          if (arcMode && currentVoidPoints.length > 0) {
            ctx.stroke();
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = '#06b6d4';
            ctx.beginPath();
            const lastPt = currentVoidPoints[currentVoidPoints.length - 1];
            const arcPts = discretizeArc(lastPt, snappedCursor);
            const lastScreen = worldToScreen(lastPt.x, lastPt.y);
            ctx.moveTo(lastScreen.x, lastScreen.y);
            for (const ap of arcPts) {
              const sp = worldToScreen(ap.x, ap.y);
              ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.lineTo(cursorScreen.x, cursorScreen.y);
            ctx.stroke();
          }
        } else {
          ctx.stroke();
        }

        // Void vertex dots
        ctx.fillStyle = '#e94560';
        for (const p of voidPts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Highlight first vertex (close target) when drawing void
        if (voidPts.length >= 3) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(voidPts[0].x, voidPts[0].y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Show bounding box dimensions
      if (isOutlineClosed) {
        const xs = platePolygonPoints.map(p => p.x);
        const ys = platePolygonPoints.map(p => p.y);
        const minXP = Math.min(...xs);
        const maxXP = Math.max(...xs);
        const minYP = Math.min(...ys);
        const maxYP = Math.max(...ys);
        const bboxW = maxXP - minXP;
        const bboxH = maxYP - minYP;
        const centerP = worldToScreen((minXP + maxXP) / 2, (minYP + maxYP) / 2);
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(
          `Polygon: ${platePolygonPoints.length} pts, bbox ${(bboxW * 1000).toFixed(0)} x ${(bboxH * 1000).toFixed(0)} mm` +
          (plateVoids.length > 0 ? `, ${plateVoids.length} void(s)` : ''),
          centerP.x + 5, centerP.y - 10
        );
      }
    }

    // Prepare set of node IDs to hide in void edit mode (all nodes of the plate being edited)
    const voidEditNodeIds = voidEditPlate ? new Set(voidEditPlate.nodeIds) : null;

    // Precompute set of polygon vertex node IDs (so they are drawn as normal nodes, not small gray plate nodes)
    const polygonVertexNodeIds = new Set<number>();
    for (const plate of mesh.plateRegions.values()) {
      // Include bounding box corner node IDs
      for (const cid of plate.cornerNodeIds) polygonVertexNodeIds.add(cid);
      // For polygon plates, also include actual polygon vertex nodes
      if (plate.isPolygon && plate.polygon) {
        const bNodeIds = plate.boundaryNodeIds ?? plate.nodeIds;
        for (let vi = 0; vi < plate.polygon.length; vi++) {
          const vx = plate.polygon[vi].x;
          const vy = plate.polygon[vi].y;
          let bestDist = Infinity;
          let bestNodeId = -1;
          for (const bid of bNodeIds) {
            const bn = mesh.getNode(bid);
            if (!bn) continue;
            const d = (bn.x - vx) ** 2 + (bn.y - vy) ** 2;
            if (d < bestDist) { bestDist = d; bestNodeId = bid; }
          }
          if (bestNodeId >= 0) polygonVertexNodeIds.add(bestNodeId);
        }
      }
    }

    // Draw nodes
    for (const node of mesh.nodes.values()) {
      // Skip nodes of the plate being edited (void edit mode) - but allow corner/vertex nodes
      if (voidEditNodeIds && voidEditNodeIds.has(node.id) && !polygonVertexNodeIds.has(node.id)) continue;

      let drawNode = node;

      if (viewMode === 'results' && showDeformed && result && nodeIdToIndex) {
        const idx = nodeIdToIndex.get(node.id);
        if (idx !== undefined) {
          if (analysisType === 'plate_bending') {
            // w (deflection) mapped to y-offset for 2D visualization
            const w = result.displacements[idx * 3] * deformationScale;
            drawNode = { ...node, y: node.y + w };
          } else {
            const u = result.displacements[idx * dofsPerNode] * deformationScale;
            const v = result.displacements[idx * dofsPerNode + 1] * deformationScale;
            drawNode = { ...node, x: node.x + u, y: node.y + v };
          }
        }
      }

      const screen = worldToScreen(drawNode.x, drawNode.y);
      const isSelected = selection.nodeIds.has(node.id);
      const isPending = pendingNodes.includes(node.id);

      // Draw constraint symbol FIRST (behind node)
      if (showSupports && (node.constraints.x || node.constraints.y || node.constraints.rotation)) {
        if (isSelected) {
          ctx.save();
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 14;
          drawSupportSymbol(ctx, screen, node);
          ctx.restore();
        } else {
          drawSupportSymbol(ctx, screen, node);
        }
      }

      // Draw load arrow (only in loads/results view)
      if (showLoads && viewMode !== 'geometry' && (node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment !== 0)) {
        const isLoadSelected = selection.pointLoadNodeIds.has(node.id);
        if (isLoadSelected) {
          // Highlight glow for selected point loads
          ctx.save();
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 12;
          drawLoadArrow(ctx, screen, node);
          ctx.restore();
        } else {
          drawLoadArrow(ctx, screen, node);
        }
      }

      // Draw hovered node highlight ring
      const isHoveredNode = hoveredNodeId === node.id;
      if (isHoveredNode && !isSelected && !isPending) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Check if this is a plate mesh node (belongs to a plate region but NOT a corner/vertex node)
      const isPlateNode = Array.from(mesh.plateRegions.values()).some(pr => pr.nodeIds.includes(node.id)) && !polygonVertexNodeIds.has(node.id);

      // Draw node
      if (showNodes) {
        const isSubNodeFlag = mesh.isSubNode(node.id);
        const nodeRadius = isPlateNode ? 3 : isSubNodeFlag ? 4 : 6;

        if (isSelected) {
          ctx.save();
          ctx.shadowColor = '#e94560';
          ctx.shadowBlur = 12;
        }

        ctx.beginPath();
        ctx.arc(screen.x, screen.y, nodeRadius, 0, Math.PI * 2);

        if (isPending) {
          ctx.fillStyle = '#fbbf24';
        } else if (isSelected) {
          ctx.fillStyle = '#e94560';
        } else if (isSubNodeFlag) {
          ctx.fillStyle = '#f59e0b'; // orange for sub-nodes
        } else if (isPlateNode) {
          ctx.fillStyle = '#8b949e'; // gray for plate mesh nodes
        } else {
          ctx.fillStyle = '#4ade80';
        }
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSubNodeFlag ? 1.5 : 2;
        ctx.stroke();

        if (isSelected) {
          ctx.restore();
        }
      }

      // Node label
      if (showNodeLabels) {
        if (isPlateNode) {
          ctx.fillStyle = 'rgba(139, 148, 158, 0.6)';
          ctx.font = '8px sans-serif';
        } else {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px sans-serif';
        }
        ctx.fillText(`${node.id}`, screen.x + 10, screen.y - 10);
      }

      // Displacement values at node (results view only)
      if (showDisplacements && viewMode === 'results' && result && nodeIdToIndex) {
        const idx = nodeIdToIndex.get(node.id);
        if (idx !== undefined) {
          ctx.font = '9px monospace';
          ctx.fillStyle = '#a78bfa'; // purple tint
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          let label = '';
          if (analysisType === 'plate_bending') {
            // Plate bending: DOFs are w, θx, θy
            const w = result.displacements[idx * 3];
            if (w !== undefined && Math.abs(w) > 1e-10) {
              const wMM = w * 1000; // convert m to mm
              label = `w=${wMM.toFixed(2)}mm`;
            }
          } else {
            const ux = result.displacements[idx * dofsPerNode];
            const uz = result.displacements[idx * dofsPerNode + 1];
            if (ux !== undefined && uz !== undefined && (Math.abs(ux) > 1e-10 || Math.abs(uz) > 1e-10)) {
              const uxMM = ux * 1000; // convert m to mm
              const uzMM = uz * 1000;
              label = `ux=${uxMM.toFixed(2)}mm uz=${uzMM.toFixed(2)}mm`;
            }
          }
          if (label) {
            ctx.fillText(label, screen.x + 10, screen.y + 6);
          }
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    // Draw gizmo for single selected node
    if (selection.nodeIds.size === 1 && selectedTool === 'select') {
      const selectedNodeId = Array.from(selection.nodeIds)[0];
      const selectedNode = mesh.getNode(selectedNodeId);
      if (selectedNode) {
        const screen = worldToScreen(selectedNode.x, selectedNode.y);
        drawGizmo(ctx, screen);
      }
    }

    // Draw deferred connection symbols next to nodes on the beam
    for (const sym of deferredConnectionSymbols) {
      const { px, py, type, beamAngle } = sym;
      if (type === 'hinge') {
        // Small filled circle, slightly smaller than node (node=6, this=4)
        ctx.fillStyle = captureModeRef.current ? '#ffffff' : canvasBg;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (type === 'tension_only') {
        // + cross symbol
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
        ctx.stroke();
      } else if (type === 'pressure_only') {
        // Zigzag/spring symbol along beam axis
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(beamAngle);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(0, 5);
        ctx.lineTo(5, -5);
        ctx.lineTo(8, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw beam mid-gizmo for single selected beam
    if (selection.elementIds.size === 1 && selection.nodeIds.size === 0 && selectedTool === 'select') {
      const selectedBeamId = Array.from(selection.elementIds)[0];
      const selectedBeam = mesh.getBeamElement(selectedBeamId);
      if (selectedBeam) {
        const beamNodes = mesh.getBeamElementNodes(selectedBeam);
        if (beamNodes) {
          const [bn1, bn2] = beamNodes;
          const sp1 = worldToScreen(bn1.x, bn1.y);
          const sp2 = worldToScreen(bn2.x, bn2.y);
          const midSX = (sp1.x + sp2.x) / 2;
          const midSY = (sp1.y + sp2.y) / 2;

          // Draw move handle at midpoint
          const handleR = 10;
          ctx.fillStyle = draggedBeamId === selectedBeamId ? '#60a5fa' : '#4299e1';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(midSX, midSY, handleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw move arrows inside the circle
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          const arrowR = 5;
          // Horizontal arrows
          ctx.beginPath();
          ctx.moveTo(midSX - arrowR, midSY);
          ctx.lineTo(midSX + arrowR, midSY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(midSX + arrowR, midSY);
          ctx.lineTo(midSX + arrowR - 3, midSY - 2);
          ctx.moveTo(midSX + arrowR, midSY);
          ctx.lineTo(midSX + arrowR - 3, midSY + 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(midSX - arrowR, midSY);
          ctx.lineTo(midSX - arrowR + 3, midSY - 2);
          ctx.moveTo(midSX - arrowR, midSY);
          ctx.lineTo(midSX - arrowR + 3, midSY + 2);
          ctx.stroke();
          // Vertical arrows
          ctx.beginPath();
          ctx.moveTo(midSX, midSY - arrowR);
          ctx.lineTo(midSX, midSY + arrowR);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(midSX, midSY - arrowR);
          ctx.lineTo(midSX - 2, midSY - arrowR + 3);
          ctx.moveTo(midSX, midSY - arrowR);
          ctx.lineTo(midSX + 2, midSY - arrowR + 3);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(midSX, midSY + arrowR);
          ctx.lineTo(midSX - 2, midSY + arrowR - 3);
          ctx.moveTo(midSX, midSY + arrowR);
          ctx.lineTo(midSX + 2, midSY + arrowR - 3);
          ctx.stroke();

          // Draw angle dimension arc at first node (showing beam angle relative to horizontal)
          const beamAngle = Math.atan2(bn2.y - bn1.y, bn2.x - bn1.x);
          const angleDeg = beamAngle * 180 / Math.PI;
          const arcRadius = 40;

          // Draw horizontal reference line (dashed)
          ctx.save();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp1.x + arcRadius + 10, sp1.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw arc from 0 to beamAngle (note: canvas y is inverted so we negate)
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Canvas arc goes clockwise when angle increases, but our world Y is up
          // So we draw from 0 to -beamAngle (in screen coords, Y is down)
          const screenBeamAngle = -beamAngle; // flip for screen coordinates
          if (screenBeamAngle >= 0) {
            ctx.arc(sp1.x, sp1.y, arcRadius, 0, screenBeamAngle, false);
          } else {
            ctx.arc(sp1.x, sp1.y, arcRadius, screenBeamAngle, 0, false);
          }
          ctx.stroke();

          // Draw angle label near the arc
          const labelAngle = screenBeamAngle / 2;
          const labelR = arcRadius + 15;
          const labelX = sp1.x + labelR * Math.cos(labelAngle);
          const labelY = sp1.y + labelR * Math.sin(labelAngle);

          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const angleText = `${Math.abs(angleDeg).toFixed(1)}°`;
          ctx.fillText(angleText, labelX, labelY);

          // Draw small clickable circle at the arc label position
          ctx.beginPath();
          ctx.arc(labelX, labelY, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.restore();
        }
      }
    }

    // Draw sub-node preview at cursor when addSubNode tool active
    if (selectedTool === 'addSubNode' && cursorPos && hoveredBeamId !== null) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cursorPos.x, cursorPos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Draw point load preview at cursor when addLoad tool active
    if ((selectedTool === 'addLoad' || selectedTool === 'addLineLoad') && cursorPos) {
      ctx.strokeStyle = selectedTool === 'addLoad' ? '#ef4444' : '#3b82f6';
      ctx.fillStyle = selectedTool === 'addLoad' ? '#ef4444' : '#3b82f6';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 3;

      if (selectedTool === 'addLoad') {
        // Ghost point load arrow pointing down
        ctx.beginPath();
        ctx.moveTo(cursorPos.x, cursorPos.y - 50);
        ctx.lineTo(cursorPos.x, cursorPos.y);
        ctx.stroke();
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(cursorPos.x, cursorPos.y);
        ctx.lineTo(cursorPos.x - 6, cursorPos.y - 12);
        ctx.lineTo(cursorPos.x + 6, cursorPos.y - 12);
        ctx.closePath();
        ctx.fill();
      } else {
        // Ghost distributed load arrows
        const arrowSpacing = 20;
        for (let i = -2; i <= 2; i++) {
          const ax = cursorPos.x + i * arrowSpacing;
          ctx.beginPath();
          ctx.moveTo(ax, cursorPos.y - 35);
          ctx.lineTo(ax, cursorPos.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ax, cursorPos.y);
          ctx.lineTo(ax - 4, cursorPos.y - 8);
          ctx.lineTo(ax + 4, cursorPos.y - 8);
          ctx.closePath();
          ctx.fill();
        }
        // Top line
        ctx.beginPath();
        ctx.moveTo(cursorPos.x - 2 * arrowSpacing, cursorPos.y - 35);
        ctx.lineTo(cursorPos.x + 2 * arrowSpacing, cursorPos.y - 35);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    // Draw reaction forces if result exists (only in results view)
    if (viewMode === 'results' && result && showReactions) {
      const reactionFont = 'bold 11px sans-serif';
      ctx.font = reactionFont;

      // Helper: draw a label with background box for readability
      const drawReactionLabel = (text: string, cx: number, cy: number, color: string) => {
        ctx.font = reactionFont;
        const tw = ctx.measureText(text).width;
        const pad = 3;
        ctx.fillStyle = 'rgba(26, 26, 46, 0.85)';
        ctx.fillRect(cx - tw / 2 - pad, cy - 10, tw + pad * 2, 14);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - tw / 2 - pad, cy - 10, tw + pad * 2, 14);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, cx, cy);
        ctx.textAlign = 'start';
      };

      for (const node of mesh.nodes.values()) {
        if (!node.constraints.x && !node.constraints.y && !node.constraints.rotation) continue;

        const idx = nodeIdToIndex?.get(node.id);
        if (idx === undefined) continue;

        const screen = worldToScreen(node.x, node.y);

        // Reaction forces - depends on analysis type
        let Rx = 0, Ry = 0, Rm = 0;
        if (analysisType === 'frame') {
          // Frame: 3 DOFs (u, v, theta)
          Rx = node.constraints.x ? result.reactions[idx * 3] : 0;
          Ry = node.constraints.y ? result.reactions[idx * 3 + 1] : 0;
          Rm = node.constraints.rotation ? result.reactions[idx * 3 + 2] : 0;
        } else if (analysisType === 'plane_stress' || analysisType === 'plane_strain') {
          // Plane stress/strain: 2 DOFs (u, v)
          Rx = node.constraints.x ? result.reactions[idx * 2] : 0;
          Ry = node.constraints.y ? result.reactions[idx * 2 + 1] : 0;
        } else if (analysisType === 'plate_bending') {
          // Plate bending: 3 DOFs (w, theta_x, theta_y) - reaction is vertical force at constrained nodes
          Ry = node.constraints.y ? result.reactions[idx * 3] : 0; // w (deflection) constrained gives Rz
          // theta_x and theta_y constraints would give moment reactions but we show Rz primarily
        }

        const reactionColor = '#10b981';
        const arrowLen = 35;
        const supportOffset = 35; // offset from node for reactions
        let labelOffsetX = 0;

        // Draw Rx arrow (horizontal, to the side of support)
        if (Math.abs(Rx) > 0.01) {
          const dir = Rx > 0 ? 1 : -1;
          ctx.strokeStyle = reactionColor;
          ctx.fillStyle = reactionColor;
          ctx.lineWidth = 2.5;
          // Arrow positioned to the left/right of the node
          const arrowY = screen.y;
          const startX = screen.x + dir * supportOffset + dir * arrowLen;
          const tipX = screen.x + dir * supportOffset;
          ctx.beginPath();
          ctx.moveTo(startX, arrowY);
          ctx.lineTo(tipX, arrowY);
          ctx.stroke();
          // Arrowhead pointing toward node
          ctx.beginPath();
          ctx.moveTo(tipX, arrowY);
          ctx.lineTo(tipX + dir * 8, arrowY - 5);
          ctx.lineTo(tipX + dir * 8, arrowY + 5);
          ctx.closePath();
          ctx.fill();
          // Label at the tail of the arrow
          drawReactionLabel(`Rx = ${fmtForce(Rx)}`, startX + dir * 5, arrowY - 14, reactionColor);
          labelOffsetX = dir * 60;
        }

        // Draw Ry arrow (vertical, below or above support)
        if (Math.abs(Ry) > 0.01) {
          ctx.strokeStyle = reactionColor;
          ctx.fillStyle = reactionColor;
          ctx.lineWidth = 2.5;
          const dir = Ry > 0 ? 1 : -1; // positive Ry: arrow below support pointing up
          // Arrow positioned below/above the node
          const arrowX = screen.x;
          const startY = screen.y + dir * supportOffset + dir * arrowLen;
          const tipY = screen.y + dir * supportOffset;
          ctx.beginPath();
          ctx.moveTo(arrowX, startY);
          ctx.lineTo(arrowX, tipY);
          ctx.stroke();
          // Arrowhead pointing toward node
          ctx.beginPath();
          ctx.moveTo(arrowX, tipY);
          ctx.lineTo(arrowX - 5, tipY + dir * 8);
          ctx.lineTo(arrowX + 5, tipY + dir * 8);
          ctx.closePath();
          ctx.fill();
          // Label at the tail of the arrow
          const labelY = startY + dir * 14;
          drawReactionLabel(`Rz = ${fmtForce(Ry)}`, arrowX + labelOffsetX, labelY, reactionColor);
        }

        // Draw Rm arc arrow (moment) with arc symbol
        if (Math.abs(Rm) > 0.01) {
          const arcR = 18;
          ctx.strokeStyle = reactionColor;
          ctx.lineWidth = 2;
          const startAngle = Rm > 0 ? -Math.PI * 0.75 : Math.PI * 0.25;
          const endAngle = Rm > 0 ? Math.PI * 0.25 : -Math.PI * 0.75;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, arcR, startAngle, endAngle, Rm < 0);
          ctx.stroke();
          // Arrow tip on arc
          const tipAngle = endAngle;
          const tipX = screen.x + arcR * Math.cos(tipAngle);
          const tipY = screen.y + arcR * Math.sin(tipAngle);
          const tangent = Rm > 0 ? tipAngle + Math.PI / 2 : tipAngle - Math.PI / 2;
          ctx.fillStyle = reactionColor;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - 6 * Math.cos(tangent - 0.5), tipY - 6 * Math.sin(tangent - 0.5));
          ctx.lineTo(tipX - 6 * Math.cos(tangent + 0.5), tipY - 6 * Math.sin(tangent + 0.5));
          ctx.closePath();
          ctx.fill();
          // Moment label positioned above the node
          drawReactionLabel(`M = ${fmtMoment(Rm)}`, screen.x, screen.y - arcR - 8, reactionColor);
        }
      }
    }

    // Draw navigation cube (top-left overlay) - skip in capture mode
    if (!captureModeRef.current) {
      const cubeX = 16;
      const cubeY = 16;
      const cubeW = 130;
      const cubeH = 90;

      // Background
      ctx.fillStyle = 'rgba(30, 35, 50, 0.6)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cubeX, cubeY, cubeW, cubeH, 6);
      ctx.fill();
      ctx.stroke();

      const axisOriginX = cubeX + 20;
      const axisOriginY = cubeY + 58;
      const axisLen = 32;
      const arrowH = 7;

      // X axis (right) - red
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(axisOriginX, axisOriginY);
      ctx.lineTo(axisOriginX + axisLen, axisOriginY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(axisOriginX + axisLen + arrowH, axisOriginY);
      ctx.lineTo(axisOriginX + axisLen, axisOriginY - 3);
      ctx.lineTo(axisOriginX + axisLen, axisOriginY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('+X', axisOriginX + axisLen + 10, axisOriginY + 4);

      // Z axis (up) - green
      ctx.strokeStyle = '#22c55e';
      ctx.fillStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(axisOriginX, axisOriginY);
      ctx.lineTo(axisOriginX, axisOriginY - axisLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(axisOriginX, axisOriginY - axisLen - arrowH);
      ctx.lineTo(axisOriginX - 3, axisOriginY - axisLen);
      ctx.lineTo(axisOriginX + 3, axisOriginY - axisLen);
      ctx.closePath();
      ctx.fill();
      ctx.fillText('+Z', axisOriginX - 4, axisOriginY - axisLen - 10);

      // Sign conventions on right side of cube
      const convX = axisOriginX + axisLen + 36;
      const convY = cubeY + 20;

      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#8b949e';

      // Force convention: downward arrow with "−"
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(convX, convY);
      ctx.lineTo(convX, convY + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(convX, convY + 17);
      ctx.lineTo(convX - 3, convY + 13);
      ctx.lineTo(convX + 3, convY + 13);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('F−', convX + 6, convY + 14);

      // Moment convention: CCW arc with "+"
      const mCx = convX;
      const mCy = convY + 38;
      const mR = 9;
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mCx, mCy, mR, -0.6 * Math.PI, 0.6 * Math.PI, false);
      ctx.stroke();
      // Arrow at end of arc
      const endA = 0.6 * Math.PI;
      const aex = mCx + mR * Math.cos(endA);
      const aey = mCy + mR * Math.sin(endA);
      ctx.fillStyle = '#9333ea';
      ctx.beginPath();
      ctx.moveTo(aex + 3, aey + 2);
      ctx.lineTo(aex - 3, aey - 1);
      ctx.lineTo(aex + 1, aey - 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('M+', mCx + mR + 5, mCy + 4);
    }

    // Draw snap indicator when near a node (constraint or beam tool)
    if (snapNodeId !== null && cursorPos) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cursorPos.x, cursorPos.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw constraint preview at cursor position
    if (isConstraintTool && cursorPos) {
      drawConstraintPreview(ctx, cursorPos, selectedTool);
    }

    // Draw rotation center marker
    if (selectedTool === 'rotate' && rotateCenter) {
      const rcScreen = worldToScreen(rotateCenter.x, rotateCenter.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(rcScreen.x - 10, rcScreen.y);
      ctx.lineTo(rcScreen.x + 10, rcScreen.y);
      ctx.moveTo(rcScreen.x, rcScreen.y - 10);
      ctx.lineTo(rcScreen.x, rcScreen.y + 10);
      ctx.stroke();
      // Circle
      ctx.beginPath();
      ctx.arc(rcScreen.x, rcScreen.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw move preview (ghost of selected elements at new position)
    if (moveMode && cursorPos && (selection.nodeIds.size > 0 || selection.plateIds.size > 0)) {
      const world = screenToWorld(cursorPos.x, cursorPos.y);
      const snapped = snapToGridFn(world.x, world.y);

      // Collect all movable node IDs
      const previewNodeIds = new Set(selection.nodeIds);
      for (const plateId of selection.plateIds) {
        const plate = mesh.getPlateRegion(plateId);
        if (plate) {
          for (const nid of plate.nodeIds) previewNodeIds.add(nid);
        }
      }

      // Calculate centroid of movable nodes
      let sumX = 0, sumY = 0, count = 0;
      for (const nodeId of previewNodeIds) {
        const node = mesh.getNode(nodeId);
        if (node) { sumX += node.x; sumY += node.y; count++; }
      }
      if (count > 0) {
        const deltaX = snapped.x - sumX / count;
        const deltaY = snapped.y - sumY / count;

        ctx.globalAlpha = 0.4;

        // Draw ghost beams connected to movable nodes
        for (const beam of mesh.beamElements.values()) {
          const n1 = mesh.getNode(beam.nodeIds[0]);
          const n2 = mesh.getNode(beam.nodeIds[1]);
          if (!n1 || !n2) continue;
          const sel1 = previewNodeIds.has(n1.id);
          const sel2 = previewNodeIds.has(n2.id);
          if (!sel1 && !sel2) continue;
          const gp1 = worldToScreen(sel1 ? n1.x + deltaX : n1.x, sel1 ? n1.y + deltaY : n1.y);
          const gp2 = worldToScreen(sel2 ? n2.x + deltaX : n2.x, sel2 ? n2.y + deltaY : n2.y);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(gp1.x, gp1.y);
          ctx.lineTo(gp2.x, gp2.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw ghost plate outlines
        for (const plateId of selection.plateIds) {
          const plate = mesh.getPlateRegion(plateId);
          if (plate && plate.polygon) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            plate.polygon.forEach((p, i) => {
              const sp = worldToScreen(p.x + deltaX, p.y + deltaY);
              if (i === 0) ctx.moveTo(sp.x, sp.y);
              else ctx.lineTo(sp.x, sp.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (plate) {
            const bl = worldToScreen(plate.x + deltaX, plate.y + deltaY);
            const tr = worldToScreen(plate.x + plate.width + deltaX, plate.y + plate.height + deltaY);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(bl.x, tr.y, tr.x - bl.x, bl.y - tr.y);
            ctx.setLineDash([]);
          }
        }

        // Draw ghost nodes (only corner/selected, not all mesh nodes to reduce clutter)
        for (const nodeId of selection.nodeIds) {
          const node = mesh.getNode(nodeId);
          if (!node) continue;
          const gs = worldToScreen(node.x + deltaX, node.y + deltaY);
          ctx.beginPath();
          ctx.arc(gs.x, gs.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
      }
    }

    // Draw beam angle labels during node or beam dragging
    if (draggedNode !== null || draggedBeamId !== null) {
      const beamsToLabel = new Set<number>();
      if (draggedNode !== null) {
        // Find all beams connected to the dragged node
        for (const beam of mesh.beamElements.values()) {
          if (beam.nodeIds[0] === draggedNode || beam.nodeIds[1] === draggedNode) {
            beamsToLabel.add(beam.id);
          }
        }
      }
      if (draggedBeamId !== null) {
        beamsToLabel.add(draggedBeamId);
      }

      for (const beamId of beamsToLabel) {
        const beam = mesh.getBeamElement(beamId);
        if (!beam) continue;
        const bn1 = mesh.getNode(beam.nodeIds[0]);
        const bn2 = mesh.getNode(beam.nodeIds[1]);
        if (!bn1 || !bn2) continue;

        const sp1 = worldToScreen(bn1.x, bn1.y);
        const sp2 = worldToScreen(bn2.x, bn2.y);
        const midSX = (sp1.x + sp2.x) / 2;
        const midSY = (sp1.y + sp2.y) / 2;

        // Calculate angle in degrees (world coordinates, measured from horizontal)
        const angleDeg = Math.atan2(bn2.y - bn1.y, bn2.x - bn1.x) * (180 / Math.PI);
        const label = `${Math.abs(angleDeg).toFixed(1)}°`;

        ctx.font = 'bold 11px sans-serif';
        const textW = ctx.measureText(label).width + 8;
        const labelX = midSX;
        const labelY = midSY + 18;

        ctx.fillStyle = 'rgba(26, 26, 46, 0.9)';
        ctx.fillRect(labelX - textW / 2, labelY - 8, textW, 16);
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX, labelY);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Draw color scale legend for stress contours (skip for normals arrow mode)
    if (showStress && result && result.elementStresses.size > 0 && stressType !== 'normals') {
      const sr = result.stressRanges;
      let legendMin: number;
      let legendMax: number;
      switch (stressType) {
        case 'sigmaX': legendMin = sr?.sigmaX.min ?? result.minVonMises; legendMax = sr?.sigmaX.max ?? result.maxVonMises; break;
        case 'sigmaY': legendMin = sr?.sigmaY.min ?? result.minVonMises; legendMax = sr?.sigmaY.max ?? result.maxVonMises; break;
        case 'tauXY': legendMin = sr?.tauXY.min ?? result.minVonMises; legendMax = sr?.tauXY.max ?? result.maxVonMises; break;
        case 'mx': legendMin = sr?.mx.min ?? result.minMoment ?? 0; legendMax = sr?.mx.max ?? result.maxMoment ?? 1; break;
        case 'my': legendMin = sr?.my.min ?? result.minMoment ?? 0; legendMax = sr?.my.max ?? result.maxMoment ?? 1; break;
        case 'mxy': legendMin = sr?.mxy.min ?? result.minMoment ?? 0; legendMax = sr?.mxy.max ?? result.maxMoment ?? 1; break;
        case 'vx': legendMin = sr?.vx.min ?? 0; legendMax = sr?.vx.max ?? 1; break;
        case 'vy': legendMin = sr?.vy.min ?? 0; legendMax = sr?.vy.max ?? 1; break;
        case 'nx': legendMin = sr?.nx.min ?? 0; legendMax = sr?.nx.max ?? 1; break;
        case 'ny': legendMin = sr?.ny.min ?? 0; legendMax = sr?.ny.max ?? 1; break;
        case 'nxy': legendMin = sr?.nxy.min ?? 0; legendMax = sr?.nxy.max ?? 1; break;
        default: legendMin = result.minVonMises; legendMax = result.maxVonMises;
      }
      const stressLabels: Record<string, string> = {
        vonMises: '\u03C3 Von Mises', sigmaX: '\u03C3x', sigmaY: '\u03C3y', tauXY: '\u03C4xy',
        mx: 'mxx', my: 'myy', mxy: 'mxy', vx: 'vx', vy: 'vy',
        nx: 'nxx', ny: 'nyy', nxy: 'nxy', normals: 'Normal forces',
        shearTrajectory: 'Shear trajectory', momentTrajectory: 'Moment trajectory',
      };
      const legendWidth = 30;
      const legendHeight = 200;
      const legendLeft = 20;
      const legendTop = 25;
      const legendX = legendLeft;
      const legendY = legendTop + 25;
      const numSteps = 10;
      const stepHeight = legendHeight / numSteps;
      const colorScale = generateColorScale(legendMin, legendMax, numSteps);
      ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
      const panelPad = 8;
      const panelW = legendWidth + 90 + panelPad * 2;
      const panelH = legendHeight + 30 + panelPad * 2;
      const panelX = legendX - panelPad;
      const panelY = legendY - 25 - panelPad;
      // Legend is now positioned at top-left
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(panelX, panelY, panelW, panelH, 6);
      } else {
        ctx.rect(panelX, panelY, panelW, panelH);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(stressLabels[stressType] || stressType, legendX + legendWidth / 2 + 30, legendY - 6);
      for (let i = 0; i < numSteps; i++) {
        const colorIdx = numSteps - i;
        ctx.fillStyle = colorScale[colorIdx].color;
        ctx.fillRect(legendX, legendY + i * stepHeight, legendWidth, stepHeight + 1);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lblX = legendX + legendWidth + 5;
      const lblPositions = [0, 0.25, 0.5, 0.75, 1.0];
      for (const t of lblPositions) {
        const yPos = legendY + t * legendHeight;
        const val = legendMax - t * (legendMax - legendMin);
        ctx.fillText(formatResultValue(val, stressType, {
          stress: stressUnit,
          bendingMoment: plateBendingMomentUnit,
          shearForce: plateShearForceUnit,
          membraneForce: plateMembraneForceUnit
        }), lblX, yPos);
      }
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // Draw XZ axis indicator in bottom-left corner (skip in capture mode)
    if (!captureModeRef.current) {
      const axLen = 36; // axis length in px
      const axMargin = 20;
      const axX = axMargin + axLen + 4;
      const axY = height - axMargin - 4;

      // Arrow: X (horizontal right)
      ctx.strokeStyle = '#ef4444'; // red for X
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(axX, axY);
      ctx.lineTo(axX + axLen, axY);
      ctx.stroke();
      // arrowhead
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(axX + axLen + 1, axY);
      ctx.lineTo(axX + axLen - 5, axY - 3.5);
      ctx.lineTo(axX + axLen - 5, axY + 3.5);
      ctx.fill();

      // Arrow: Z (vertical down = positive Z in structural convention)
      ctx.strokeStyle = '#3b82f6'; // blue for Z
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(axX, axY);
      ctx.lineTo(axX, axY - axLen);
      ctx.stroke();
      // arrowhead
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(axX, axY - axLen - 1);
      ctx.lineTo(axX - 3.5, axY - axLen + 5);
      ctx.lineTo(axX + 3.5, axY - axLen + 5);
      ctx.fill();

      // Labels
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('X', axX + axLen + 1, axY + 4);
      ctx.fillStyle = '#3b82f6';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Z', axX - 10, axY - axLen + 2);

      // Reset text alignment
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // Draw selection box (window vs crossing)
    if (selectionBox) {
      const { startX, startY, endX, endY } = selectionBox;
      const bx = Math.min(startX, endX);
      const by = Math.min(startY, endY);
      const bw = Math.abs(endX - startX);
      const bh = Math.abs(endY - startY);

      // Detect drag direction: endX < startX = crossing (left), else = window (right)
      const isCrossing = endX < startX;

      if (isCrossing) {
        // Crossing selection: dashed border, lighter fill
        ctx.fillStyle = 'rgba(74, 222, 128, 0.05)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
      } else {
        // Window selection: solid border, darker fill
        ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(bx, by, bw, bh);
      }
    }

  }, [
    mesh, result, selection, showDeformed, deformationScale,
    showStress, stressType, pendingNodes, selectedTool, gridSize, analysisType,
    showMoment, showShear, showNormal, showDeflections, diagramScale, viewMode, showProfileNames, showReactions, meshVersion,
    showNodes, showMembers, showSupports, showLoads, showNodeLabels, showMemberLabels, showElementTypes, showDimensions, showDisplacements, forceUnit,
    isConstraintTool, cursorPos, snapNodeId, hoveredBeamId, hoveredNodeId, hoveredEdgeId, moveMode, rotateCenter, selectionBox, draggedBeamId, draggedNode,
    structuralGrid, loadCases, activeLoadCase,
    platePolygonPoints, plateVoids, plateEditState, currentVoidPoints, voidTargetPlateId, arcMode, discretizeArc,
    screenToWorld, worldToScreen, snapToGridFn, getNodeIdToIndex, drawSupportSymbol, drawLoadArrow,
    drawDistributedLoad, drawForceDiagram, drawEnvelopeDiagram, drawGizmo, drawDimensions, drawConstraintPreview,
    showEnvelope, envelopeResult, showStressGradient
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      dispatch({ type: 'SET_CANVAS_SIZE', payload: { width: canvas.width, height: canvas.height } });
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw, dispatch]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Keep drawRef in sync so captureCanvasForReport and viewState effect can call draw
  drawRef.current = draw;
  // Redraw when viewState changes (viewState is read via ref to keep draw() stable and prevent capture flicker)
  useEffect(() => {
    drawRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState]);

  // Auto-recalculate when geometry changes (meshVersion increments on REFRESH_MESH)
  const autoSolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs to avoid stale closures in the debounced timer
  const stateRef = useRef(state);
  stateRef.current = state;
  const meshRef = useRef(mesh);
  meshRef.current = mesh;
  // Ref for live solve throttling during node drag (Feature #17)
  const lastLiveSolveRef = useRef(0);
  useEffect(() => {
    if (!autoRecalculate || meshVersion === 0) return;
    // Only auto-solve when we have at least one beam or element and at least one constrained node
    const hasStructure = mesh.beamElements.size > 0 || mesh.elements.size > 0;
    const hasConstraints = Array.from(mesh.nodes.values()).some(n => n.constraints.x || n.constraints.y);
    if (!hasStructure || !hasConstraints) return;

    // Debounce: wait 300ms after last change before solving
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current);
    autoSolveTimerRef.current = setTimeout(async () => {
      try {
        const { solve } = await import('../../core/solver/SolverService');
        const { applyLoadCaseToMesh } = await import('../../context/FEMContext');
        const currentState = stateRef.current;
        const currentMesh = meshRef.current;
        const activeLc = currentState.loadCases.find(lc => lc.id === currentState.activeLoadCase);
        if (activeLc) applyLoadCaseToMesh(currentMesh, activeLc);
        const result = await solve(currentMesh, {
          analysisType: currentState.analysisType,
          geometricNonlinear: false
        });
        dispatch({ type: 'SET_RESULT', payload: result });
      } catch {
        // Silently ignore auto-solve failures
      }
    }, 300);

    return () => { if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current); };
  }, [meshVersion, autoRecalculate, dispatch]);

  // Clear last used beam section when switching away from addBeam tool
  useEffect(() => {
    if (selectedTool !== 'addBeam') {
      setLastUsedSection(null);
    }
  }, [selectedTool]);

  // Clear polygon plate state when switching away from addPlate tool
  // BUT preserve void drawing state if we're drawing a void on an existing plate
  useEffect(() => {
    console.log('[Clear State Effect] selectedTool:', selectedTool, 'voidTargetPlateId:', voidTargetPlateId);
    if (selectedTool !== 'addPlate' && voidTargetPlateId === null) {
      console.log('[Clear State Effect] CLEARING polygon plate state');
      setPlatePolygonPoints([]);
      setPlateVoids([]);
      setCurrentVoidPoints([]);
      setPlateEditState(null);
      setPendingPolygonPlate(null);
    }
  }, [selectedTool, voidTargetPlateId]);

  // Auto-start outline mode when switching to addPlate tool
  useEffect(() => {
    if (selectedTool === 'addPlate' && plateEditState === null && platePolygonPoints.length === 0) {
      setPlateEditState('outline');
    }
  }, [selectedTool, plateEditState, platePolygonPoints.length]);

  // Sync plate edit mode to global state for Ribbon visibility
  useEffect(() => {
    if (voidTargetPlateId !== null && plateEditState === 'void') {
      dispatch({ type: 'SET_PLATE_EDIT_MODE', payload: { mode: 'void', plateId: voidTargetPlateId } });
    } else if (selectedTool === 'addPlate') {
      if (plateEditState === 'outline') {
        dispatch({ type: 'SET_PLATE_EDIT_MODE', payload: { mode: 'polygon-outline' } });
      } else if (plateEditState === 'void') {
        dispatch({ type: 'SET_PLATE_EDIT_MODE', payload: { mode: 'polygon-void' } });
      } else {
        dispatch({ type: 'SET_PLATE_EDIT_MODE', payload: null });
      }
    } else {
      dispatch({ type: 'SET_PLATE_EDIT_MODE', payload: null });
    }
  }, [voidTargetPlateId, plateEditState, selectedTool, dispatch]);

  // Respond to Ribbon "Finish" button (finishEditTrigger)
  const prevFinishTriggerRef = useRef(finishEditTrigger);
  useEffect(() => {
    if (finishEditTrigger !== prevFinishTriggerRef.current) {
      prevFinishTriggerRef.current = finishEditTrigger;
      // Finish void drawing on existing plate
      if (voidTargetPlateId !== null && plateEditState === 'void' && currentVoidPoints.length >= 3) {
        const plate = mesh.getPlateRegion(voidTargetPlateId);
        if (plate) {
          pushUndo();
          if (!plate.voids) plate.voids = [];
          plate.voids.push([...currentVoidPoints]);
          const capturedPlateId = voidTargetPlateId;
          remeshPolygonPlateRegionFromContour(mesh, capturedPlateId).then(() => {
            dispatch({ type: 'REFRESH_MESH' });
          });
        }
        setCurrentVoidPoints([]);
        setPlateEditState(null);
        setVoidTargetPlateId(null);
        return;
      }
      // Finish polygon outline
      if (selectedTool === 'addPlate' && plateEditState === 'outline' && platePolygonPoints.length >= 3) {
        setPlateEditState(null);
        return;
      }
      // Finish void in polygon plate mode
      if (selectedTool === 'addPlate' && plateEditState === 'void' && currentVoidPoints.length >= 3) {
        setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
        setCurrentVoidPoints([]);
        setPlateEditState(null);
        return;
      }
    }
  }, [finishEditTrigger, voidTargetPlateId, plateEditState, currentVoidPoints, selectedTool, platePolygonPoints, mesh, pushUndo, dispatch]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
        return;
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selection.nodeIds.size > 0 || selection.elementIds.size > 0) {
          e.preventDefault();
          dispatch({ type: 'COPY_SELECTED' });
          return;
        }
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        dispatch({ type: 'PASTE', payload: { offsetX: 1, offsetY: 1 } });
        return;
      }

      // Tab key - intercept early to prevent browser focus navigation
      if (e.key === 'Tab') {
        // Tab enters edit mode for selected plate
        if (selection.plateIds.size === 1 && selectedTool === 'select' && voidTargetPlateId === null && plateEditState === null) {
          e.preventDefault();
          const selectedPlateId = Array.from(selection.plateIds)[0];
          setEditingPlateId(selectedPlateId);
          return;
        }
        // Tab closes void on existing plate
        if (voidTargetPlateId !== null && plateEditState === 'void' && currentVoidPoints.length >= 3) {
          e.preventDefault();
          const plate = mesh.getPlateRegion(voidTargetPlateId);
          if (plate) {
            pushUndo();
            if (!plate.voids) plate.voids = [];
            plate.voids.push([...currentVoidPoints]);
            const oldEdgeMap = new Map<number, number>();
            for (const edge of mesh.edges.values()) {
              if (edge.plateId === voidTargetPlateId && edge.polygonEdgeIndex !== undefined) {
                oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
              }
            }
            const capturedPlateId = voidTargetPlateId;
            remeshPolygonPlateRegionFromContour(mesh, capturedPlateId).then(() => {
              const newEdgeByPolyIdx = new Map<number, number>();
              for (const edge of mesh.edges.values()) {
                if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
                  newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
                }
              }
              for (const lc of loadCases) {
                for (const dl of lc.distributedLoads) {
                  if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                    const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                    const newId = newEdgeByPolyIdx.get(polyIdx);
                    if (newId !== undefined) dl.edgeId = newId;
                  }
                }
              }
              dispatch({ type: 'REFRESH_MESH' });
            });
          }
          setCurrentVoidPoints([]);
          setPlateEditState(null);
          setVoidTargetPlateId(null);
          return;
        }
        // Tab closes polygon outline or void in polygon plate mode
        if (selectedTool === 'addPlate') {
          if (plateEditState === 'outline' && platePolygonPoints.length >= 3) {
            e.preventDefault();
            setPlateEditState(null);
            return;
          }
          if (plateEditState === 'void' && currentVoidPoints.length >= 3) {
            e.preventDefault();
            setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
            setCurrentVoidPoints([]);
            setPlateEditState(null);
            return;
          }
        }
      }

      // Handle 'F' key - zoom to fit
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const nodes = Array.from(mesh.nodes.values());
        if (nodes.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const node of nodes) {
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
          }
          if (maxX - minX < 0.001) { minX -= 1; maxX += 1; }
          if (maxY - minY < 0.001) { minY -= 1; maxY += 1; }
          const { width: cw, height: ch } = state.canvasSize;
          const padding = 0.1;
          const availW = cw * (1 - 2 * padding);
          const availH = ch * (1 - 2 * padding);
          const scaleX = availW / (maxX - minX);
          const scaleY = availH / (maxY - minY);
          const newScale = Math.min(scaleX, scaleY);
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const offsetX = cw / 2 - centerX * newScale;
          const offsetY = ch / 2 + centerY * newScale;
          dispatch({ type: 'SET_VIEW_STATE', payload: { scale: newScale, offsetX, offsetY } });
        }
        return;
      }

      // Handle 'M' key - immediately activate move mode
      // M or G key - activate move mode (G is common in Blender/CAD)
      if ((e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'g') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (selection.nodeIds.size > 0 || selection.plateIds.size > 0) {
          setMoveMode(true);
          dispatch({ type: 'SET_TOOL', payload: 'select' });
        }
      }

      // Handle 'R' key - activate rotate tool
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (selection.nodeIds.size > 0 || selection.plateIds.size > 0) {
          dispatch({ type: 'SET_TOOL', payload: 'rotate' });
          setRotateCenter(null);
          setRotateAngleInput(null);
        }
      }

      // Handle 'A' key - toggle arc mode during polygon/void drawing
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const isDrawingPolygon = (selectedTool === 'addPlate' && (plateEditState === 'outline' || plateEditState === 'void'));
        const isDrawingVoidOnPlate = (voidTargetPlateId !== null && plateEditState === 'void');
        if (isDrawingPolygon || isDrawingVoidOnPlate) {
          setArcMode(prev => !prev);
        }
      }

      // When drawing beam with first node placed, typing a digit opens length input
      if (selectedTool === 'addBeam' && pendingNodes.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (/^[0-9.]$/.test(e.key) && beamLengthInput === null) {
          e.preventDefault();
          setBeamLengthInput(e.key);
          return;
        }
      }

      // Enter key closes void on existing plate
      if (e.key === 'Enter' && voidTargetPlateId !== null && plateEditState === 'void' && currentVoidPoints.length >= 3) {
        e.preventDefault();
        const plate = mesh.getPlateRegion(voidTargetPlateId);
        if (plate) {
          pushUndo();
          if (!plate.voids) plate.voids = [];
          plate.voids.push([...currentVoidPoints]);
          const oldEdgeMap = new Map<number, number>();
          for (const edge of mesh.edges.values()) {
            if (edge.plateId === voidTargetPlateId && edge.polygonEdgeIndex !== undefined) {
              oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
            }
          }
          const capturedPlateId = voidTargetPlateId;
          remeshPolygonPlateRegionFromContour(mesh, capturedPlateId).then(() => {
            const newEdgeByPolyIdx = new Map<number, number>();
            for (const edge of mesh.edges.values()) {
              if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
                newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
              }
            }
            for (const lc of loadCases) {
              for (const dl of lc.distributedLoads) {
                if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                  const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                  const newId = newEdgeByPolyIdx.get(polyIdx);
                  if (newId !== undefined) dl.edgeId = newId;
                }
              }
            }
            dispatch({ type: 'REFRESH_MESH' });
          });
        }
        setCurrentVoidPoints([]);
        setPlateEditState(null);
        setVoidTargetPlateId(null);
        return;
      }

      // Enter key closes polygon outline or void in polygon plate mode
      if (e.key === 'Enter' && selectedTool === 'addPlate') {
        if (plateEditState === 'outline' && platePolygonPoints.length >= 3) {
          e.preventDefault();
          setPlateEditState(null);
          return;
        }
        if (plateEditState === 'void' && currentVoidPoints.length >= 3) {
          e.preventDefault();
          setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
          setCurrentVoidPoints([]);
          setPlateEditState(null);
          return;
        }
      }

      // Handle Escape - cancel current tool / move mode
      if (e.key === 'Escape') {
        // Cancel rotate tool
        if (selectedTool === 'rotate') {
          setRotateCenter(null);
          setRotateAngleInput(null);
          dispatch({ type: 'SET_TOOL', payload: 'select' });
          return;
        }
        // Cancel void drawing on existing plate
        if (voidTargetPlateId !== null) {
          setCurrentVoidPoints([]);
          setPlateEditState(null);
          setVoidTargetPlateId(null);
          return;
        }
        if (beamLengthInput !== null) {
          setBeamLengthInput(null);
          return;
        }
        // Cancel polygon plate drawing states
        if (selectedTool === 'addPlate') {
          if (plateEditState === 'void' && currentVoidPoints.length > 0) {
            // Cancel current void, go back to toolbar
            setCurrentVoidPoints([]);
            setPlateEditState(null);
            return;
          }
          if (plateEditState === 'outline' && platePolygonPoints.length > 0) {
            // Cancel polygon outline
            setPlatePolygonPoints([]);
            setPlateEditState(null);
            return;
          }
          if (platePolygonPoints.length > 0) {
            // Cancel the whole polygon plate
            setPlatePolygonPoints([]);
            setPlateVoids([]);
            setCurrentVoidPoints([]);
            setPlateEditState(null);
            return;
          }
        }
        setPendingCommand(null);
        setMoveMode(false);
        // Remove orphaned nodes created during aborted bar placement
        if (selectedTool === 'addBeam' && pendingNodes.length > 0) {
          for (const nodeId of pendingNodes) {
            const node = mesh.getNode(nodeId);
            if (node) {
              // Check if this node is orphaned (not connected to any element)
              const isConnected = Array.from(mesh.beamElements.values()).some(b =>
                b.nodeIds.includes(nodeId)
              ) || Array.from(mesh.elements.values()).some(e =>
                e.nodeIds.includes(nodeId)
              );
              if (!isConnected) {
                mesh.removeNode(nodeId);
              }
            }
          }
          dispatch({ type: 'REFRESH_MESH' });
        }
        // Return to select tool from any placement tool
        if (selectedTool !== 'select') {
          dispatch({ type: 'SET_TOOL', payload: 'select' });
        }
      }

      // Handle Delete key
      if (e.key === 'Delete') {
        if (selection.nodeIds.size > 0 || selection.elementIds.size > 0 || selection.plateIds.size > 0) {
          pushUndo();
          // Delete selected plates first (removes their elements/nodes)
          for (const plateId of selection.plateIds) {
            const plate = mesh.getPlateRegion(plateId);
            const elementIds = plate ? [...plate.elementIds] : [];
            removePlateRegion(mesh, plateId);
            dispatch({ type: 'CLEANUP_PLATE_LOADS', payload: { plateId, elementIds } });
          }
          // Delete selected nodes (cascades to connected beams)
          for (const nodeId of selection.nodeIds) {
            mesh.removeNode(nodeId);
          }
          // Delete selected elements (that weren't already removed with plates)
          for (const elementId of selection.elementIds) {
            mesh.removeElement(elementId);
          }
          // Clean up any orphan nodes left after element deletion
          mesh.removeOrphanNodes();
          dispatch({ type: 'CLEAR_SELECTION' });
          dispatch({ type: 'SET_RESULT', payload: null });
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, pendingCommand, mesh, dispatch, selectedTool, pushUndo, pendingNodes, beamLengthInput,
      plateEditState, platePolygonPoints, plateVoids, currentVoidPoints, voidTargetPlateId, arcMode, discretizeArc]);

  // LC filtering: apply active load case to mesh when LC tab changes
  useEffect(() => {
    const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
    if (activeLc) {
      applyLoadCaseToMesh(mesh, activeLc);
      dispatch({ type: 'REFRESH_MESH' });
    }
  }, [activeLoadCase, loadCases, mesh, dispatch]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle rotate tool: click sets rotation center, then show angle input
    if (selectedTool === 'rotate' && (selection.nodeIds.size > 0 || selection.plateIds.size > 0)) {
      if (!rotateCenter) {
        const world = screenToWorld(x, y);
        const snapped = snapToGridFn(world.x, world.y);
        setRotateCenter(snapped);
        setRotateAngleInput('');
        return;
      }
      // If center already set, ignore further clicks (angle input handles it)
      return;
    }

    // Handle move mode (M+click)
    if (moveMode && (selection.nodeIds.size > 0 || selection.plateIds.size > 0)) {
      pushUndo();
      const world = screenToWorld(x, y);
      const snapped = snapToGridFn(world.x, world.y);

      // Collect all movable node IDs (selected nodes + all nodes from selected plates)
      const moveNodeIds = new Set(selection.nodeIds);
      for (const plateId of selection.plateIds) {
        const plate = mesh.getPlateRegion(plateId);
        if (plate) {
          for (const nid of plate.nodeIds) moveNodeIds.add(nid);
        }
      }

      // Calculate the centroid of movable nodes
      let sumX = 0, sumY = 0, count = 0;
      for (const nodeId of moveNodeIds) {
        const node = mesh.getNode(nodeId);
        if (node) {
          sumX += node.x;
          sumY += node.y;
          count++;
        }
      }
      if (count === 0) { setMoveMode(false); return; }
      const centroidX = sumX / count;
      const centroidY = sumY / count;

      // Move all movable nodes by the delta
      const deltaX = snapped.x - centroidX;
      const deltaY = snapped.y - centroidY;

      for (const nodeId of moveNodeIds) {
        const node = mesh.getNode(nodeId);
        if (node) {
          mesh.updateNode(nodeId, {
            x: node.x + deltaX,
            y: node.y + deltaY
          });
        }
      }

      // Break grid line association when manually moving nodes via Move function
      for (const nodeId of moveNodeIds) {
        const node = mesh.getNode(nodeId);
        if (node) {
          node.gridLineId = undefined;
        }
      }

      // Update plate geometry for selected plates
      for (const plateId of selection.plateIds) {
        const plate = mesh.getPlateRegion(plateId);
        if (plate) {
          plate.x += deltaX;
          plate.y += deltaY;
          if (plate.polygon) {
            for (const v of plate.polygon) {
              v.x += deltaX;
              v.y += deltaY;
            }
          }
          if (plate.voids) {
            for (const voidPoly of plate.voids) {
              for (const v of voidPoly) {
                v.x += deltaX;
                v.y += deltaY;
              }
            }
          }
          // Update IEdge vertex positions for moved plate
          if (plate.edgeIds) {
            for (const edgeId of plate.edgeIds) {
              const edge = mesh.getEdge(edgeId);
              if (edge) {
                edge.vertexStart.x += deltaX;
                edge.vertexStart.y += deltaY;
                edge.vertexEnd.x += deltaX;
                edge.vertexEnd.y += deltaY;
              }
            }
          }
        }
      }

      setMoveMode(false);
      dispatch({ type: 'REFRESH_MESH' });
      return;
    }

    if (selectedTool === 'pan' || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Right-click is handled by onContextMenu, not here
    if (e.button === 2) return;

    // Handle void drawing on existing plate (from "+" button) - VERY EARLY to prevent other handlers
    if (voidTargetPlateId !== null && plateEditState === 'void') {
      console.log('[Void Click] Adding point, voidTargetPlateId:', voidTargetPlateId);
      const world = screenToWorld(x, y);
      const snapped = snapToGridFn(world.x, world.y);
      console.log('[Void Click] snapped:', snapped);
      if (currentVoidPoints.length >= 3) {
        const first = currentVoidPoints[0];
        const dist = Math.sqrt((snapped.x - first.x) ** 2 + (snapped.y - first.y) ** 2);
        if (dist < 0.05) {
          // Close the void polygon and add to plate
          const plate = mesh.getPlateRegion(voidTargetPlateId);
          if (plate) {
            pushUndo();
            if (!plate.voids) plate.voids = [];
            plate.voids.push([...currentVoidPoints]);
            // Save old edge mapping before remesh
            const oldEdgeMap = new Map<number, number>();
            for (const edge of mesh.edges.values()) {
              if (edge.plateId === voidTargetPlateId && edge.polygonEdgeIndex !== undefined) {
                oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
              }
            }
            const capturedPlateId = voidTargetPlateId;
            remeshPolygonPlateRegionFromContour(mesh, capturedPlateId).then(() => {
              // Re-map distributed load edgeIds
              const newEdgeByPolyIdx = new Map<number, number>();
              for (const edge of mesh.edges.values()) {
                if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
                  newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
                }
              }
              for (const lc of loadCases) {
                for (const dl of lc.distributedLoads) {
                  if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                    const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                    const newId = newEdgeByPolyIdx.get(polyIdx);
                    if (newId !== undefined) dl.edgeId = newId;
                  }
                }
              }
              dispatch({ type: 'REFRESH_MESH' });
            });
          }
          setCurrentVoidPoints([]);
          setPlateEditState(null);
          setVoidTargetPlateId(null);
          return;
        }
      }
      if (arcMode && currentVoidPoints.length > 0) {
        const lastPt = currentVoidPoints[currentVoidPoints.length - 1];
        const arcPts = discretizeArc(lastPt, { x: snapped.x, y: snapped.y });
        setCurrentVoidPoints(prev => [...prev, ...arcPts]);
        setArcMode(false);
      } else {
        setCurrentVoidPoints(prev => [...prev, { x: snapped.x, y: snapped.y }]);
      }
      return;
    }

    // Check grid line label click (circles) for dragging
    if (structuralGrid.showGridLines) {
      const vLines = structuralGrid.verticalLines;
      const hLines = structuralGrid.horizontalLines;
      const vPositions = vLines.map(l => l.position);
      const hPositions = hLines.map(l => l.position);
      const gridMaxY = hPositions.length > 0 ? Math.max(...hPositions) : 0;
      const gridMinX = vPositions.length > 0 ? Math.min(...vPositions) : 0;
      const gridPadding = 0.5;

      // Check vertical line circle labels
      for (const line of vLines) {
        const screenPos = worldToScreen(line.position, 0);
        const topY = hPositions.length > 0
          ? worldToScreen(line.position, gridMaxY + gridPadding).y
          : 0;
        const labelY = Math.max(topY - 20, 20);
        const dist = Math.sqrt((x - screenPos.x) ** 2 + (y - labelY) ** 2);
        if (dist < 14) {
          setDraggedGridLineId(line.id);
          setDraggedGridLineType('vertical');
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
        }
      }

      // Check horizontal line labels
      for (const line of hLines) {
        const screenPos = worldToScreen(0, line.position);
        const leftX = vPositions.length > 0
          ? worldToScreen(gridMinX - gridPadding, line.position).x
          : 0;
        const labelX = Math.max(leftX - 20, 8);
        const dist = Math.sqrt((x - labelX - 15) ** 2 + (y - (screenPos.y - 8)) ** 2);
        if (dist < 14) {
          setDraggedGridLineId(line.id);
          setDraggedGridLineType('horizontal');
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
        }
      }

      // Check '-' buttons for removing grid lines (vertical: below label circle)
      if (vLines.length > 1) {
        for (const line of vLines) {
          const screenPos = worldToScreen(line.position, 0);
          const topY = hPositions.length > 0
            ? worldToScreen(line.position, gridMaxY + gridPadding).y
            : 0;
          const labelY = Math.max(topY - 20, 20);
          const minBtnX = screenPos.x;
          const minBtnY = labelY + 22;
          if (Math.sqrt((x - minBtnX) ** 2 + (y - minBtnY) ** 2) < 10) {
            dispatch({
              type: 'SET_STRUCTURAL_GRID',
              payload: { ...structuralGrid, verticalLines: vLines.filter(l => l.id !== line.id) }
            });
            return;
          }
        }
      }
      if (hLines.length > 1) {
        for (const line of hLines) {
          const screenPos = worldToScreen(0, line.position);
          const leftX = vPositions.length > 0
            ? worldToScreen(gridMinX - gridPadding, line.position).x
            : 0;
          const labelX = Math.max(leftX - 20, 8);
          const minBtnX = labelX;
          const minBtnY = screenPos.y - 8 + 20;
          if (Math.sqrt((x - minBtnX) ** 2 + (y - minBtnY) ** 2) < 10) {
            dispatch({
              type: 'SET_STRUCTURAL_GRID',
              payload: { ...structuralGrid, horizontalLines: hLines.filter(l => l.id !== line.id) }
            });
            return;
          }
        }
      }

      // Check '+' buttons at ends of grid (stacked below '-')
      // Vertical: '+' below the '-' of the last vertical grid line
      if (vLines.length > 0) {
        const lastVLine = [...vLines].sort((a, b) => a.position - b.position).pop()!;
        const sp = worldToScreen(lastVLine.position, 0);
        const topY = hPositions.length > 0
          ? worldToScreen(lastVLine.position, gridMaxY + gridPadding).y
          : 0;
        const labelY = Math.max(topY - 20, 20);
        const addBtnX = sp.x;
        const addBtnY = labelY + 40;
        if (Math.sqrt((x - addBtnX) ** 2 + (y - addBtnY) ** 2) < 10) {
          // Add new vertical grid line 500mm to the right
          const newPos = lastVLine.position + 0.5;
          const usedNames = new Set(vLines.map(l => l.name));
          let newName = '';
          for (let i = 0; i < 26; i++) {
            const n = String.fromCharCode(65 + i);
            if (!usedNames.has(n)) { newName = n; break; }
          }
          if (!newName) newName = `G${vLines.length + 1}`;
          const newLine = { id: Date.now(), name: newName, position: newPos, orientation: 'vertical' as const };
          dispatch({
            type: 'SET_STRUCTURAL_GRID',
            payload: { ...structuralGrid, verticalLines: [...vLines, newLine] }
          });
          return;
        }
      }

      // Horizontal: '+' below the '-' of the last horizontal grid line
      if (hLines.length > 0) {
        const lastHLine = [...hLines].sort((a, b) => a.position - b.position).pop()!;
        const sp = worldToScreen(0, lastHLine.position);
        const leftX = vPositions.length > 0
          ? worldToScreen(gridMinX - gridPadding, lastHLine.position).x
          : 0;
        const addBtnX = Math.max(leftX - 20, 8);
        const addBtnY = sp.y - 8 + 38;
        if (Math.sqrt((x - addBtnX) ** 2 + (y - addBtnY) ** 2) < 10) {
          // Add new horizontal grid line 500mm above
          const newPos = lastHLine.position + 0.5;
          const newName = `+${(newPos).toFixed(3)}`;
          const newLine = { id: Date.now(), name: newName, position: newPos, orientation: 'horizontal' as const };
          dispatch({
            type: 'SET_STRUCTURAL_GRID',
            payload: { ...structuralGrid, horizontalLines: [...hLines, newLine] }
          });
          return;
        }
      }

      // Check grid dimension label click (click to edit spacing)
      // Horizontal dimensions between vertical grid lines
      if (vLines.length >= 2) {
        const sorted = [...vLines].sort((a, b) => a.position - b.position);
        const gridMinY_local = hPositions.length > 0 ? Math.min(...hPositions) : 0;
        const dimY = gridMinY_local - gridPadding - 0.3;
        const dimScreenY = worldToScreen(0, dimY).y;

        for (let i = 0; i < sorted.length - 1; i++) {
          const x1 = sorted[i].position;
          const x2 = sorted[i + 1].position;
          const s1 = worldToScreen(x1, dimY);
          const s2 = worldToScreen(x2, dimY);
          const midX = (s1.x + s2.x) / 2;

          // Check if click is near the dimension label
          if (Math.abs(x - midX) < 25 && Math.abs(y - (dimScreenY + 10)) < 12) {
            const currentDist = Math.abs(x2 - x1) * 1000; // m -> mm
            const newValStr = prompt(`Edit grid spacing (mm):`, currentDist.toFixed(0));
            if (newValStr !== null) {
              const newValMm = parseFloat(newValStr);
              if (!isNaN(newValMm) && newValMm > 0) {
                const newValM = newValMm / 1000;
                // Move the right grid line so that spacing equals newValM
                const newPos = x1 + newValM;
                const delta = newPos - x2;
                // Shift this line and all lines to its right
                const updatedVLines = sorted.map((l, idx) => {
                  if (idx > i) return { ...l, position: l.position + delta };
                  return l;
                });
                dispatch({
                  type: 'SET_STRUCTURAL_GRID',
                  payload: { ...structuralGrid, verticalLines: updatedVLines }
                });
              }
            }
            return;
          }
        }
      }

      // Vertical dimensions between horizontal grid lines
      if (hLines.length >= 2) {
        const sorted = [...hLines].sort((a, b) => a.position - b.position);
        const gridMinX_local = vPositions.length > 0 ? Math.min(...vPositions) : 0;
        const dimX = gridMinX_local - gridPadding - 0.3;
        const dimScreenX = worldToScreen(dimX, 0).x;

        for (let i = 0; i < sorted.length - 1; i++) {
          const y1 = sorted[i].position;
          const y2 = sorted[i + 1].position;
          const s1 = worldToScreen(dimX, y1);
          const s2 = worldToScreen(dimX, y2);
          const midY = (s1.y + s2.y) / 2;

          // Check if click is near the dimension label
          if (Math.abs(x - (dimScreenX - 6)) < 25 && Math.abs(y - midY) < 12) {
            const currentDist = Math.abs(y2 - y1) * 1000; // m -> mm
            const newValStr = prompt(`Edit grid spacing (mm):`, currentDist.toFixed(0));
            if (newValStr !== null) {
              const newValMm = parseFloat(newValStr);
              if (!isNaN(newValMm) && newValMm > 0) {
                const newValM = newValMm / 1000;
                const newPos = y1 + newValM;
                const delta = newPos - y2;
                const updatedHLines = sorted.map((l, idx) => {
                  if (idx > i) return { ...l, position: l.position + delta };
                  return l;
                });
                dispatch({
                  type: 'SET_STRUCTURAL_GRID',
                  payload: { ...structuralGrid, horizontalLines: updatedHLines }
                });
              }
            }
            return;
          }
        }
      }
    }

    if (selectedTool === 'select') {
      // Check load resize handle interaction (for selected beams/loads with distributed loads)
      if (viewMode !== 'geometry' && (selection.elementIds.size > 0 || selection.distLoadBeamIds.size > 0)) {
        const handle = findLoadHandleAtScreen(x, y);
        if (handle) {
          const beam = mesh.getBeamElement(handle.beamId);
          if (beam?.distributedLoad) {
            pushUndo();
            setResizingLoadBeamId(handle.beamId);
            setResizingLoadEnd(handle.end);
            setResizingLoadHandleType(handle.handleType);
            setResizeStartQy(beam.distributedLoad.qy);
            setResizeStartQyEnd(beam.distributedLoad.qyEnd ?? beam.distributedLoad.qy);
            setResizeStartT(beam.distributedLoad.startT ?? 0);
            setResizeEndT(beam.distributedLoad.endT ?? 1);
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            return;
          }
        }
      }

      // Check beam mid-gizmo interaction (when a single beam is selected)
      if (selection.elementIds.size === 1 && selection.nodeIds.size === 0) {
        const selectedBeamId = Array.from(selection.elementIds)[0];
        const selectedBeam = mesh.getBeamElement(selectedBeamId);
        if (selectedBeam) {
          const beamNodes = mesh.getBeamElementNodes(selectedBeam);
          if (beamNodes) {
            const [bn1, bn2] = beamNodes;
            const sp1 = worldToScreen(bn1.x, bn1.y);
            const sp2 = worldToScreen(bn2.x, bn2.y);
            const midSX = (sp1.x + sp2.x) / 2;
            const midSY = (sp1.y + sp2.y) / 2;
            const dist = Math.sqrt((x - midSX) ** 2 + (y - midSY) ** 2);
            if (dist <= 12) {
              pushUndo();
              setDraggedBeamId(selectedBeamId);
              setBeamDragOrigins({ n1: { x: bn1.x, y: bn1.y }, n2: { x: bn2.x, y: bn2.y } });
              setIsDragging(true);
              setDragStart({ x: e.clientX, y: e.clientY });
              return;
            }

            // Check angle label click (circle near the arc)
            const beamAngle = Math.atan2(bn2.y - bn1.y, bn2.x - bn1.x);
            const screenBeamAngle = -beamAngle; // flip for screen coordinates
            const arcRadius = 40;
            const labelAngle = screenBeamAngle / 2;
            const labelR = arcRadius + 15;
            const angleLabelX = sp1.x + labelR * Math.cos(labelAngle);
            const angleLabelY = sp1.y + labelR * Math.sin(labelAngle);
            const angleDist = Math.sqrt((x - angleLabelX) ** 2 + (y - angleLabelY) ** 2);
            if (angleDist <= 12) {
              // Open angle edit input
              const currentAngleDeg = beamAngle * 180 / Math.PI;
              setAngleEditBeamId(selectedBeamId);
              setAngleEditInput(currentAngleDeg.toFixed(1));
              return;
            }
          }
        }
      }

      // Check gizmo interaction first (when a single node is already selected)
      if (selection.nodeIds.size === 1) {
        const selectedNodeId = Array.from(selection.nodeIds)[0];
        const selectedNode = mesh.getNode(selectedNodeId);
        if (selectedNode) {
          const nodeScreen = worldToScreen(selectedNode.x, selectedNode.y);
          const axis = getGizmoAxis(x, y, nodeScreen);
          if (axis) {
            pushUndo();
            setGizmoAxis(axis);
            setDraggedNode(selectedNodeId);
            setDragNodeOrigin({ x: selectedNode.x, y: selectedNode.y });
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            return;
          }
        }
      }

      // Check dimension label click (geometry view only)
      if (viewMode === 'geometry') {
        const dim = findDimensionAtScreen(x, y);
        if (dim) {
          setEditingDimension({
            beamId: dim.beamId,
            screenX: dim.midX,
            screenY: dim.midY,
            currentLength: dim.length
          });
          return;
        }
      }

      // Check polygon contour edge midpoint handles (before nodes)
      for (const plate of mesh.plateRegions.values()) {
        if (!plate.isPolygon || !plate.polygon || plate.polygon.length < 3) continue;
        for (let ei = 0; ei < plate.polygon.length; ei++) {
          const v1 = plate.polygon[ei];
          const v2 = plate.polygon[(ei + 1) % plate.polygon.length];
          const midWorld = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
          const midScreen = worldToScreen(midWorld.x, midWorld.y);
          const dist = Math.sqrt((x - midScreen.x) ** 2 + (y - midScreen.y) ** 2);
          if (dist <= 10) {
            pushUndo();
            setContourEdgeDrag({
              plateId: plate.id,
              edgeIndex: ei,
              originV1: { x: v1.x, y: v1.y },
              originV2: { x: v2.x, y: v2.y },
            });
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            return;
          }
        }
      }

      // Check node selection FIRST (nodes have priority over loads)
      const node = findNodeAtScreen(x, y);
      if (node) {
        if (e.shiftKey) {
          // Toggle selection
          if (selection.nodeIds.has(node.id)) {
            dispatch({ type: 'DESELECT_NODE', payload: node.id });
          } else {
            dispatch({ type: 'SELECT_NODE', payload: node.id });
          }
        } else {
          // Exclusive selection, prepare for dragging
          dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set([node.id]), elementIds: new Set(), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() } });
          // Don't allow dragging plate interior mesh nodes (only corner/vertex nodes)
          const plateCornerInfo = findPlateCornerForNode(mesh, node.id);
          const isPlateNode = Array.from(mesh.plateRegions.values()).some(
            pr => pr.nodeIds.includes(node.id)
          );
          const canDrag = !isPlateNode || plateCornerInfo !== null;
          if (canDrag) {
            pushUndo();
            // If dragging a polygon vertex, use special mode that only updates contour during drag
            if (plateCornerInfo?.isPolygonVertex) {
              const plate = mesh.getPlateRegion(plateCornerInfo.plateId);
              if (plate?.polygon) {
                // Find which vertex index this node corresponds to
                const boundaryNodeIds = plate.boundaryNodeIds ?? plate.nodeIds;
                let targetVertexIndex = -1;
                for (let vi = 0; vi < plate.polygon.length; vi++) {
                  const vx = plate.polygon[vi].x;
                  const vy = plate.polygon[vi].y;
                  let bestDist = Infinity;
                  let bestNodeId = -1;
                  for (const bid of boundaryNodeIds) {
                    const bn = mesh.getNode(bid);
                    if (!bn) continue;
                    const d = (bn.x - vx) ** 2 + (bn.y - vy) ** 2;
                    if (d < bestDist) { bestDist = d; bestNodeId = bid; }
                  }
                  if (bestNodeId === node.id) {
                    targetVertexIndex = vi;
                    break;
                  }
                }
                if (targetVertexIndex >= 0) {
                  setPolygonCornerDrag({
                    plateId: plateCornerInfo.plateId,
                    vertexIndex: targetVertexIndex,
                    nodeId: node.id,
                    originVertex: { ...plate.polygon[targetVertexIndex] }
                  });
                  setDragNodeOrigin({ x: node.x, y: node.y });
                  setIsDragging(true);
                  setDragStart({ x: e.clientX, y: e.clientY });
                  return;
                }
              }
            }
            setDraggedNode(node.id);
            setDragNodeOrigin({ x: node.x, y: node.y });
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
          }
        }
        return;
      }

      // Check load hit-testing (after nodes, before beams in non-geometry view)
      if (viewMode !== 'geometry') {
        const pointLoadNodeId = findPointLoadAtScreen(x, y);
        if (pointLoadNodeId !== null) {
          if (e.shiftKey) {
            if (selection.pointLoadNodeIds.has(pointLoadNodeId)) {
              dispatch({ type: 'DESELECT_POINT_LOAD', payload: pointLoadNodeId });
            } else {
              dispatch({ type: 'SELECT_POINT_LOAD', payload: pointLoadNodeId });
            }
          } else {
            dispatch({
              type: 'SET_SELECTION',
              payload: { nodeIds: new Set(), elementIds: new Set(), pointLoadNodeIds: new Set([pointLoadNodeId]), distLoadBeamIds: new Set() }
            });
          }
          return;
        }

        const distLoadHit = findDistLoadAtScreen(x, y);
        if (distLoadHit !== null) {
          const { beamId, loadId } = distLoadHit;
          if (e.shiftKey) {
            // Toggle individual load selection with Shift
            if (selection.selectedDistLoadIds.has(loadId)) {
              dispatch({ type: 'DESELECT_INDIVIDUAL_DIST_LOAD', payload: loadId });
            } else {
              dispatch({ type: 'SELECT_INDIVIDUAL_DIST_LOAD', payload: loadId });
              // Also track beam-level for backward compat
              dispatch({ type: 'SELECT_DIST_LOAD', payload: beamId });
            }
          } else {
            // Select only this specific load
            dispatch({
              type: 'SET_SELECTION',
              payload: {
                nodeIds: new Set(),
                elementIds: new Set(),
                pointLoadNodeIds: new Set(),
                distLoadBeamIds: new Set([beamId]),
                selectedDistLoadIds: new Set([loadId])
              }
            });
          }
          return;
        }
      }

      // Check for beam selection
      const beam = findBeamAtScreen(x, y);
      if (beam) {
        if (e.shiftKey) {
          if (selection.elementIds.has(beam.id)) {
            dispatch({ type: 'DESELECT_ELEMENT', payload: beam.id });
          } else {
            dispatch({ type: 'SELECT_ELEMENT', payload: beam.id });
          }
        } else {
          dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set(), elementIds: new Set([beam.id]), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() } });
        }
        return;
      }

      const elementId = findElementAtScreen(x, y);
      if (elementId) {
        // Check if this element belongs to a plate - if so, select the plate
        const plate = mesh.getPlateForElement(elementId);
        if (plate) {
          if (e.shiftKey) {
            if (selection.plateIds.has(plate.id)) {
              dispatch({ type: 'DESELECT_PLATE', payload: plate.id });
            } else {
              dispatch({ type: 'SELECT_PLATE', payload: plate.id });
            }
          } else {
            const plateElementIds = new Set(plate.elementIds);
            dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set(), elementIds: plateElementIds, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), plateIds: new Set([plate.id]) } });
          }
          return;
        }
        if (e.shiftKey) {
          if (selection.elementIds.has(elementId)) {
            dispatch({ type: 'DESELECT_ELEMENT', payload: elementId });
          } else {
            dispatch({ type: 'SELECT_ELEMENT', payload: elementId });
          }
        } else {
          dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set(), elementIds: new Set([elementId]), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), plateIds: new Set() } });
        }
        return;
      }

      // Check if clicking inside a plate region boundary
      {
        const world = screenToWorld(x, y);
        for (const plate of mesh.plateRegions.values()) {
          const inPlate = plate.isPolygon && plate.polygon
            ? pointInPolygon(world.x, world.y, plate.polygon) && !(plate.voids ?? []).some(v => pointInPolygon(world.x, world.y, v))
            : world.x >= plate.x && world.x <= plate.x + plate.width &&
              world.y >= plate.y && world.y <= plate.y + plate.height;
          if (inPlate) {
            if (e.shiftKey) {
              if (selection.plateIds.has(plate.id)) {
                dispatch({ type: 'DESELECT_PLATE', payload: plate.id });
              } else {
                dispatch({ type: 'SELECT_PLATE', payload: plate.id });
              }
            } else {
              const plateElementIds = new Set(plate.elementIds);
              dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set(), elementIds: plateElementIds, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), plateIds: new Set([plate.id]) } });
            }
            return;
          }
        }
      }

      // No node, beam, or element hit — start selection box
      setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (selectedTool === 'addNode') {
      pushUndo();
      const world = screenToWorld(x, y);
      const snapped = snapToGridFn(world.x, world.y);
      const newNode = mesh.addNode(snapped.x, snapped.y);
      // Associate node with structural grid line if placed on one
      const GRID_SNAP_TOL = 0.001; // 1mm tolerance
      for (const gl of structuralGrid.verticalLines) {
        if (Math.abs(snapped.x - gl.position) < GRID_SNAP_TOL) {
          newNode.gridLineId = gl.id;
          break;
        }
      }
      if (!newNode.gridLineId) {
        for (const gl of structuralGrid.horizontalLines) {
          if (Math.abs(snapped.y - gl.position) < GRID_SNAP_TOL) {
            newNode.gridLineId = gl.id;
            break;
          }
        }
      }
      dispatch({ type: 'REFRESH_MESH' });
    }

    if (selectedTool === 'addElement') {
      const node = findNodeAtScreen(x, y);
      if (node) {
        if (pendingNodes.includes(node.id)) return;

        dispatch({ type: 'ADD_PENDING_NODE', payload: node.id });

        if (pendingNodes.length === 2) {
          pushUndo();
          const nodeIds = [...pendingNodes, node.id] as [number, number, number];
          mesh.addTriangleElement(nodeIds);
          dispatch({ type: 'CLEAR_PENDING_NODES' });
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
    }

    if (selectedTool === 'addBeam') {
      // Find existing node or create new one at click position
      let node = findNodeAtScreen(x, y);
      if (!node) {
        pushUndo();
        const world = screenToWorld(x, y);
        let snapped = snapToGridFn(world.x, world.y, true);
        // Shift angle snapping for second node
        if (pendingNodes.length === 1 && e.shiftKey) {
          const firstNode = mesh.getNode(pendingNodes[0]);
          if (firstNode) {
            const dx = snapped.x - firstNode.x;
            const dy = snapped.y - firstNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 8)) * (Math.PI / 8);
            snapped = {
              x: firstNode.x + dist * Math.cos(snapAngle),
              y: firstNode.y + dist * Math.sin(snapAngle)
            };
          }
        }
        node = mesh.addNode(snapped.x, snapped.y);
        // Associate node with structural grid line if placed on one
        const GRID_SNAP_TOL_BEAM = 0.001;
        for (const gl of structuralGrid.verticalLines) {
          if (Math.abs(snapped.x - gl.position) < GRID_SNAP_TOL_BEAM) {
            node.gridLineId = gl.id;
            break;
          }
        }
        if (!node.gridLineId) {
          for (const gl of structuralGrid.horizontalLines) {
            if (Math.abs(snapped.y - gl.position) < GRID_SNAP_TOL_BEAM) {
              node.gridLineId = gl.id;
              break;
            }
          }
        }
        dispatch({ type: 'REFRESH_MESH' });
      }

      if (pendingNodes.includes(node.id)) return;

      dispatch({ type: 'ADD_PENDING_NODE', payload: node.id });

      if (pendingNodes.length === 1) {
        const nodeIds = [...pendingNodes, node.id] as [number, number];

        if (lastUsedSection) {
          // Reuse last section: create beam immediately and continue chain
          pushUndo();
          const newBeam = mesh.addBeamElement(nodeIds, 1, lastUsedSection.section, lastUsedSection.profileName);
          if (newBeam) newBeam.layerId = activeLayerId;
          dispatch({ type: 'REFRESH_MESH' });
          dispatch({ type: 'SET_RESULT', payload: null });
          // Continue chain: end node becomes start of next beam
          dispatch({ type: 'CLEAR_PENDING_NODES' });
          dispatch({ type: 'ADD_PENDING_NODE', payload: node.id });
        } else {
          // First beam: show section dialog
          setPendingBeamNodeIds(nodeIds);
          setShowSectionDialog(true);
          dispatch({ type: 'CLEAR_PENDING_NODES' });
        }
      }
    }

    if (selectedTool === 'addConstraint') {
      const node = findNodeAtScreen(x, y);
      if (node) {
        pushUndo();
        // Cycle through support types: none -> pinned -> roller -> fixed -> none
        let newConstraints;
        if (!node.constraints.x && !node.constraints.y && !node.constraints.rotation) {
          // None -> Pinned (scharnier)
          newConstraints = { x: true, y: true, rotation: false };
        } else if (node.constraints.x && node.constraints.y && !node.constraints.rotation) {
          // Pinned -> Roller (roloplegging)
          newConstraints = { x: false, y: true, rotation: false };
        } else if (!node.constraints.x && node.constraints.y && !node.constraints.rotation) {
          // Roller -> Fixed (inklemming)
          newConstraints = { x: true, y: true, rotation: true };
        } else {
          // Fixed -> None
          newConstraints = { x: false, y: false, rotation: false };
        }
        mesh.updateNode(node.id, { constraints: newConstraints });
        dispatch({ type: 'REFRESH_MESH' });
      }
    }

    if (isConstraintTool) {
      const node = findNodeAtScreen(x, y);
      if (node) {
        pushUndo();
        let newConstraints: INode['constraints'] = { x: false, y: false, rotation: false };
        switch (selectedTool) {
          case 'addPinned':
            newConstraints = { x: true, y: true, rotation: false };
            break;
          case 'addXRoller':
            newConstraints = { x: true, y: false, rotation: false };
            break;
          case 'addZRoller':
            newConstraints = { x: false, y: true, rotation: false };
            break;
          case 'addFixed':
            newConstraints = { x: true, y: true, rotation: true };
            break;
          case 'addZSpring':
            newConstraints = { x: false, y: true, rotation: false, springY: 1e5 };
            break;
          case 'addXSpring':
            newConstraints = { x: true, y: false, rotation: false, springX: 1e5 };
            break;
          case 'addRotSpring':
            newConstraints = { x: false, y: false, rotation: true, springRot: 1e5 };
            break;
        }
        mesh.updateNode(node.id, { constraints: newConstraints });
        dispatch({ type: 'REFRESH_MESH' });
      }
    }

    if (selectedTool === 'addLoad') {
      const node = findNodeAtScreen(x, y);
      if (node) {
        // Open load dialog for existing node
        if (viewMode === 'geometry') {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
        }
        setEditingLoadNodeId(node.id);
        return;
      }

      // If clicking on a bar, split it and apply load at that point
      const hit = findBeamAtScreenWithPosition(x, y);
      if (hit) {
        pushUndo();
        const newNode = mesh.splitBeamAt(hit.beam.id, hit.t);
        if (newNode) {
          dispatch({ type: 'REFRESH_MESH' });
          if (viewMode === 'geometry') {
            dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
          }
          setEditingLoadNodeId(newNode.id);
        }
      }
    }

    if (selectedTool === 'addLineLoad') {
      const beam = findBeamAtScreen(x, y);
      if (beam) {
        if (viewMode === 'geometry') {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
        }
        setLineLoadEdgeId(null);
        setLineLoadBeamId(beam.id);
      } else {
        // No beam found — check for plate edge
        const world = screenToWorld(x, y);
        const tolerance = 15 / viewState.scale;
        let closestEdgeId: number | null = null;
        let closestDist = Infinity;

        for (const edge of mesh.edges.values()) {
          const v1 = edge.vertexStart;
          const v2 = edge.vertexEnd;
          const dx = v2.x - v1.x;
          const dy = v2.y - v1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) continue;
          let t = ((world.x - v1.x) * dx + (world.y - v1.y) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const cx = v1.x + t * dx;
          const cy = v1.y + t * dy;
          const dist = Math.sqrt((world.x - cx) ** 2 + (world.y - cy) ** 2);
          if (dist < closestDist && dist < tolerance) {
            closestDist = dist;
            closestEdgeId = edge.id;
          }
        }

        if (closestEdgeId !== null) {
          if (viewMode === 'geometry') {
            dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
          }
          setLineLoadEdgeId(closestEdgeId);
          // Use a dummy beam id of -1 to trigger dialog rendering
          setLineLoadBeamId(-1);
        }
      }
    }

    if (selectedTool === 'addPlate') {
      const world = screenToWorld(x, y);
      const snapped = snapToGridFn(world.x, world.y);

      // Polygon plate drawing mode
      if (plateEditState === 'outline') {
        // Add vertex to outline polygon
        // Check if clicking near first point to close the polygon
        if (platePolygonPoints.length >= 3) {
          const first = platePolygonPoints[0];
          const dist = Math.sqrt((snapped.x - first.x) ** 2 + (snapped.y - first.y) ** 2);
          if (dist < 0.05) { // close tolerance ~50mm
            // Close the polygon
            setPlateEditState(null);
            return;
          }
        }
        if (arcMode && platePolygonPoints.length > 0) {
          const lastPt = platePolygonPoints[platePolygonPoints.length - 1];
          const arcPts = discretizeArc(lastPt, { x: snapped.x, y: snapped.y });
          setPlatePolygonPoints(prev => [...prev, ...arcPts]);
          setArcMode(false);
        } else {
          setPlatePolygonPoints(prev => [...prev, { x: snapped.x, y: snapped.y }]);
        }
      } else if (plateEditState === 'void') {
        // Add vertex to current void polygon
        if (currentVoidPoints.length >= 3) {
          const first = currentVoidPoints[0];
          const dist = Math.sqrt((snapped.x - first.x) ** 2 + (snapped.y - first.y) ** 2);
          if (dist < 0.05) {
            // Close the void polygon
            setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
            setCurrentVoidPoints([]);
            setPlateEditState(null);
            return;
          }
        }
        if (arcMode && currentVoidPoints.length > 0) {
          const lastPt = currentVoidPoints[currentVoidPoints.length - 1];
          const arcPts = discretizeArc(lastPt, { x: snapped.x, y: snapped.y });
          setCurrentVoidPoints(prev => [...prev, ...arcPts]);
          setArcMode(false);
        } else {
          setCurrentVoidPoints(prev => [...prev, { x: snapped.x, y: snapped.y }]);
        }
      }
      // If plateEditState is null (toolbar showing), ignore clicks on canvas
    }


    if (selectedTool === 'addThermalLoad') {
      const world = screenToWorld(x, y);
      // Check if clicked inside a plate region
      for (const plate of mesh.plateRegions.values()) {
        const inPlate = plate.isPolygon && plate.polygon
          ? pointInPolygon(world.x, world.y, plate.polygon) && !(plate.voids ?? []).some(v => pointInPolygon(world.x, world.y, v))
          : world.x >= plate.x && world.x <= plate.x + plate.width &&
            world.y >= plate.y && world.y <= plate.y + plate.height;
        if (inPlate) {
          setThermalLoadElementIds(plate.elementIds);
          setThermalLoadPlateId(plate.id);
          return;
        }
      }
      // Check if clicked on individual element (triangle or quad)
      for (const element of mesh.elements.values()) {
        const nodes = mesh.getElementNodes(element);
        if (nodes.length === 3) {
          if (pointInTriangle(world, nodes[0], nodes[1], nodes[2])) {
            setThermalLoadElementIds([element.id]);
            setThermalLoadPlateId(undefined);
            return;
          }
        } else if (nodes.length === 4) {
          // Quad: test as two triangles
          if (pointInTriangle(world, nodes[0], nodes[1], nodes[2]) ||
              pointInTriangle(world, nodes[0], nodes[2], nodes[3])) {
            setThermalLoadElementIds([element.id]);
            setThermalLoadPlateId(undefined);
            return;
          }
        }
      }
    }

    // Sub-node tool: click on a beam to place a sub-node
    if (selectedTool === 'addSubNode') {
      const hit = findBeamAtScreenWithPosition(x, y);
      if (hit) {
        pushUndo();
        const subNode = mesh.addSubNode(hit.beam.id, hit.t);
        if (subNode) {
          dispatch({ type: 'SET_RESULT', payload: null });
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
      return;
    }

    if (selectedTool === 'delete') {
      const node = findNodeAtScreen(x, y);
      if (node) {
        pushUndo();
        // If deleting a sub-node, use removeSubNode to rejoin the beam
        const subNodeRecord = mesh.getSubNodeByNodeId(node.id);
        if (subNodeRecord) {
          mesh.removeSubNode(subNodeRecord.id);
        } else {
          mesh.removeNode(node.id);
        }
        dispatch({ type: 'REFRESH_MESH' });
        return;
      }

      const beam = findBeamAtScreen(x, y);
      if (beam) {
        pushUndo();
        mesh.removeElement(beam.id);
        dispatch({ type: 'REFRESH_MESH' });
        return;
      }

      // Check if clicking inside a plate region
      const world = screenToWorld(x, y);
      let clickedPlateId: number | null = null;
      for (const plate of mesh.plateRegions.values()) {
        const inPlate = plate.isPolygon && plate.polygon
          ? pointInPolygon(world.x, world.y, plate.polygon) && !(plate.voids ?? []).some(v => pointInPolygon(world.x, world.y, v))
          : world.x >= plate.x && world.x <= plate.x + plate.width &&
            world.y >= plate.y && world.y <= plate.y + plate.height;
        if (inPlate) {
          clickedPlateId = plate.id;
          break;
        }
      }
      if (clickedPlateId !== null) {
        pushUndo();
        const plate = mesh.getPlateRegion(clickedPlateId);
        const elementIds = plate ? [...plate.elementIds] : [];
        removePlateRegion(mesh, clickedPlateId);
        dispatch({ type: 'CLEANUP_PLATE_LOADS', payload: { plateId: clickedPlateId, elementIds } });
        dispatch({ type: 'SET_RESULT', payload: null });
        dispatch({ type: 'REFRESH_MESH' });
        return;
      }

      const elementId = findElementAtScreen(x, y);
      if (elementId) {
        pushUndo();
        mesh.removeElement(elementId);
        dispatch({ type: 'REFRESH_MESH' });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Update mouse world position for status bar
    const worldPos = screenToWorld(mx, my);
    dispatch({ type: 'SET_MOUSE_WORLD_POS', payload: worldPos });

    // Track cursor position during move mode
    if (moveMode) {
      setCursorPos({ x: mx, y: my });
    }

    // Detect beam/node under cursor for all tools (pre-highlight)
    const nearNode = findNodeAtScreen(mx, my);
    const nearBeam = findBeamAtScreen(mx, my);
    setHoveredNodeId(nearNode?.id ?? null);

    // Track tooltip position when hovering over a beam or node
    if (nearNode || nearBeam) {
      setTooltipPos({ x: mx, y: my });
    } else {
      setTooltipPos(null);
    }

    // Track cursor position for constraint/beam/load tool preview
    if (isConstraintTool || selectedTool === 'addBeam') {
      if (nearNode) {
        const snapped = worldToScreen(nearNode.x, nearNode.y);
        setCursorPos({ x: snapped.x, y: snapped.y });
        setSnapNodeId(nearNode.id);
      } else if (selectedTool === 'addBeam' && pendingNodes.length === 1 && e.shiftKey) {
        // Shift angle snapping: snap to nearest 22.5° increment
        const firstNode = mesh.getNode(pendingNodes[0]);
        if (firstNode) {
          const firstScreen = worldToScreen(firstNode.x, firstNode.y);
          const dx = mx - firstScreen.x;
          const dy = my - firstScreen.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          const snapAngle = Math.round(angle / (Math.PI / 8)) * (Math.PI / 8);
          setCursorPos({
            x: firstScreen.x + dist * Math.cos(snapAngle),
            y: firstScreen.y + dist * Math.sin(snapAngle)
          });
          setSnapNodeId(null);
        } else {
          setCursorPos({ x: mx, y: my });
          setSnapNodeId(null);
        }
      } else {
        // Snap cursor preview to grid for addBeam
        const world = screenToWorld(mx, my);
        const useBarSnap = selectedTool === 'addBeam';
        const snapped = snapToGridFn(world.x, world.y, useBarSnap);
        const screenSnapped = worldToScreen(snapped.x, snapped.y);
        setCursorPos({ x: screenSnapped.x, y: screenSnapped.y });
        setSnapNodeId(null);
      }
      setHoveredBeamId(nearBeam?.id ?? null);
    } else if (selectedTool === 'addSubNode') {
      // Sub-node tool: show cursor snapped to nearest beam position
      setHoveredBeamId(nearBeam?.id ?? null);
      if (nearBeam) {
        const hit = findBeamAtScreenWithPosition(mx, my);
        if (hit) {
          const nodes = mesh.getBeamElementNodes(hit.beam);
          if (nodes) {
            const [n1, n2] = nodes;
            const px = n1.x + hit.t * (n2.x - n1.x);
            const py = n1.y + hit.t * (n2.y - n1.y);
            const screenSnapped = worldToScreen(px, py);
            setCursorPos({ x: screenSnapped.x, y: screenSnapped.y });
          }
        }
      } else {
        setCursorPos(null);
      }
      setSnapNodeId(null);
    } else if (selectedTool === 'addNode' || selectedTool === 'addLoad' || selectedTool === 'addLineLoad' || selectedTool === 'addPlate' || (voidTargetPlateId !== null && plateEditState === 'void')) {
      // Snap cursor preview to grid for addNode/addLoad/addPlate tools and void edit mode
      const world = screenToWorld(mx, my);
      const snapped = snapToGridFn(world.x, world.y);
      const screenSnapped = worldToScreen(snapped.x, snapped.y);
      setCursorPos({ x: screenSnapped.x, y: screenSnapped.y });
      setHoveredBeamId(nearBeam?.id ?? null);
      setSnapNodeId(null);
      // Edge hover detection for addLineLoad tool
      if (selectedTool === 'addLineLoad' && !nearBeam) {
        const tolerance = 15 / viewState.scale;
        let closestEdge: number | null = null;
        let closestDist = Infinity;
        for (const edge of mesh.edges.values()) {
          const v1 = edge.vertexStart;
          const v2 = edge.vertexEnd;
          const edx = v2.x - v1.x;
          const edy = v2.y - v1.y;
          const lenSq = edx * edx + edy * edy;
          if (lenSq === 0) continue;
          let t = ((world.x - v1.x) * edx + (world.y - v1.y) * edy) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const cx = v1.x + t * edx;
          const cy = v1.y + t * edy;
          const dist = Math.sqrt((world.x - cx) ** 2 + (world.y - cy) ** 2);
          if (dist < closestDist && dist < tolerance) {
            closestDist = dist;
            closestEdge = edge.id;
          }
        }
        setHoveredEdgeId(closestEdge);
      } else {
        setHoveredEdgeId(null);
      }
    } else {
      if (snapNodeId !== null) setSnapNodeId(null);
      if (cursorPos !== null) setCursorPos(null);
      setHoveredBeamId(nearBeam?.id ?? null);
    }

    // Gizmo hover detection (only when not dragging)
    if (!isDragging && selection.nodeIds.size === 1 && selectedTool === 'select') {
      const selectedNodeId = Array.from(selection.nodeIds)[0];
      const selectedNode = mesh.getNode(selectedNodeId);
      if (selectedNode) {
        const nodeScreen = worldToScreen(selectedNode.x, selectedNode.y);
        setGizmoAxis(getGizmoAxis(mx, my, nodeScreen));
      }
    }

    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Handle selection box dragging
    if (selectionBox) {
      setSelectionBox({ ...selectionBox, endX: mx, endY: my });
      return;
    }

    // Handle load resize dragging
    if (resizingLoadBeamId !== null) {
      const beam = mesh.getBeamElement(resizingLoadBeamId);
      if (beam && beam.distributedLoad) {
        const nodes = mesh.getBeamElementNodes(beam);
        if (nodes) {
          const [n1, n2] = nodes;
          const p1 = worldToScreen(n1.x, n1.y);
          const p2 = worldToScreen(n2.x, n2.y);
          const beamScreenLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

          if (resizingLoadHandleType === 'length' && resizingLoadEnd && beamScreenLen > 0) {
            // Dragging length handle along beam axis → change startT/endT
            const beamDirX = (p2.x - p1.x) / beamScreenLen;
            const beamDirY = (p2.y - p1.y) / beamScreenLen;

            // Project mouse position onto beam axis
            const mouseScreenX = e.clientX - canvasRef.current!.getBoundingClientRect().left;
            const mouseScreenY = e.clientY - canvasRef.current!.getBoundingClientRect().top;
            const relX = mouseScreenX - p1.x;
            const relY = mouseScreenY - p1.y;
            const proj = (relX * beamDirX + relY * beamDirY) / beamScreenLen;
            const t = Math.max(0, Math.min(1, proj));

            if (resizingLoadEnd === 'start') {
              const newStartT = Math.min(t, resizeEndT - 0.01);
              beam.distributedLoad = { ...beam.distributedLoad, startT: Math.max(0, newStartT) };
            } else {
              const newEndT = Math.max(t, resizeStartT + 0.01);
              beam.distributedLoad = { ...beam.distributedLoad, endT: Math.min(1, newEndT) };
            }
            dispatch({ type: 'REFRESH_MESH' });
          } else if (resizingLoadHandleType === 'magnitude' && resizingLoadEnd) {
            // Dragging magnitude handle perpendicular to beam → change qy or qyEnd
            const angle = calculateBeamAngle(n1, n2);
            const perpAngle = angle + Math.PI / 2;
            // Calculate perpendicular distance from drag start
            const perpDist = dx * Math.cos(perpAngle) + dy * Math.sin(perpAngle);

            if (resizingLoadEnd === 'start') {
              // Adjust qy (start magnitude)
              const sign = resizeStartQy >= 0 ? 1 : -1;
              const newQy = resizeStartQy + sign * perpDist * 100;
              beam.distributedLoad = { ...beam.distributedLoad, qy: newQy };
            } else {
              // Adjust qyEnd (end magnitude) - creates trapezoidal load
              const sign = resizeStartQyEnd >= 0 ? 1 : -1;
              const newQyEnd = resizeStartQyEnd + sign * perpDist * 100;
              beam.distributedLoad = { ...beam.distributedLoad, qyEnd: newQyEnd };
            }
            dispatch({ type: 'REFRESH_MESH' });
          }
        }
      }
      return;
    }

    // Handle grid line dragging
    if (draggedGridLineId !== null && draggedGridLineType) {
      const world = screenToWorld(mx, my);
      const snapped = snapToGridFn(world.x, world.y);
      const newPos = draggedGridLineType === 'vertical' ? snapped.x : snapped.y;
      // Move all nodes associated with this grid line
      for (const [nodeId, node] of mesh.nodes) {
        if (node.gridLineId === draggedGridLineId) {
          if (draggedGridLineType === 'vertical') {
            mesh.updateNode(nodeId, { x: newPos });
          } else {
            mesh.updateNode(nodeId, { y: newPos });
          }
        }
      }
      if (draggedGridLineType === 'vertical') {
        const updated = structuralGrid.verticalLines.map(l =>
          l.id === draggedGridLineId ? { ...l, position: snapped.x } : l
        );
        dispatch({ type: 'SET_STRUCTURAL_GRID', payload: { ...structuralGrid, verticalLines: updated } });
      } else {
        const updated = structuralGrid.horizontalLines.map(l =>
          l.id === draggedGridLineId ? { ...l, position: snapped.y } : l
        );
        dispatch({ type: 'SET_STRUCTURAL_GRID', payload: { ...structuralGrid, horizontalLines: updated } });
      }
      dispatch({ type: 'REFRESH_MESH' });
      return;
    }

    // Handle beam mid-gizmo dragging
    if (draggedBeamId !== null && beamDragOrigins) {
      const beam = mesh.getBeamElement(draggedBeamId);
      if (beam) {
        const beamNodes = mesh.getBeamElementNodes(beam);
        if (beamNodes) {
          // Convert total drag delta from screen to world
          const totalDx = (e.clientX - dragStart.x) / viewState.scale;
          const totalDy = -(e.clientY - dragStart.y) / viewState.scale;

          const newN1X = beamDragOrigins.n1.x + totalDx;
          const newN1Y = beamDragOrigins.n1.y + totalDy;
          const newN2X = beamDragOrigins.n2.x + totalDx;
          const newN2Y = beamDragOrigins.n2.y + totalDy;

          // Snap midpoint to grid, then apply same offset to both nodes
          const midX = (newN1X + newN2X) / 2;
          const midY = (newN1Y + newN2Y) / 2;
          const snapped = snapToGridFn(midX, midY);
          const snapDx = snapped.x - midX;
          const snapDy = snapped.y - midY;

          mesh.updateNode(beamNodes[0].id, { x: newN1X + snapDx, y: newN1Y + snapDy });
          mesh.updateNode(beamNodes[1].id, { x: newN2X + snapDx, y: newN2Y + snapDy });
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
      return;
    }

    // Polygon corner vertex drag: move only the polygon vertex (contour preview), not the mesh node
    if (polygonCornerDrag !== null) {
      const plate = mesh.getPlateRegion(polygonCornerDrag.plateId);
      if (plate?.polygon) {
        const world = screenToWorld(mx, my);
        const snapped = snapToGridFn(world.x, world.y);

        // Check if the new position would create a self-intersecting polygon or flip winding
        const testPolygon = plate.polygon.map((p, i) =>
          i === polygonCornerDrag.vertexIndex ? { x: snapped.x, y: snapped.y } : { ...p }
        );
        const originalArea = polygonArea(plate.polygon);
        const newArea = polygonArea(testPolygon);
        const windingFlipped = (originalArea > 0 && newArea <= 0) || (originalArea < 0 && newArea >= 0) || (originalArea === 0);

        if (!isPolygonSelfIntersecting(testPolygon) && !windingFlipped) {
          // Valid: update the polygon vertex only (not the mesh node)
          plate.polygon[polygonCornerDrag.vertexIndex] = { x: snapped.x, y: snapped.y };
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
      return;
    }

    // Contour edge drag: move both edge vertices by the same delta
    if (contourEdgeDrag !== null) {
      const plate = mesh.getPlateRegion(contourEdgeDrag.plateId);
      if (plate?.polygon) {
        const totalDx = (e.clientX - dragStart.x) / viewState.scale;
        const totalDy = -(e.clientY - dragStart.y) / viewState.scale;

        const newV1X = contourEdgeDrag.originV1.x + totalDx;
        const newV1Y = contourEdgeDrag.originV1.y + totalDy;
        const newV2X = contourEdgeDrag.originV2.x + totalDx;
        const newV2Y = contourEdgeDrag.originV2.y + totalDy;

        // Snap the midpoint to grid, apply same offset to both vertices
        const midX = (newV1X + newV2X) / 2;
        const midY = (newV1Y + newV2Y) / 2;
        const snapped = snapToGridFn(midX, midY);
        const snapDx = snapped.x - midX;
        const snapDy = snapped.y - midY;

        const ei = contourEdgeDrag.edgeIndex;
        const ei2 = (ei + 1) % plate.polygon.length;
        plate.polygon[ei] = { x: newV1X + snapDx, y: newV1Y + snapDy };
        plate.polygon[ei2] = { x: newV2X + snapDx, y: newV2Y + snapDy };
        dispatch({ type: 'REFRESH_MESH' });
      }
      return;
    }

    if (draggedNode !== null) {
      const node = mesh.getNode(draggedNode);
      if (node) {
        const world = screenToWorld(mx, my);
        const snapped = snapToGridFn(world.x, world.y);

        let newX = snapped.x;
        let newY = snapped.y;

        // Check if dragging a sub-node: constrain movement along beam axis
        const draggedSubNode = mesh.getSubNodeByNodeId(draggedNode);
        if (draggedSubNode) {
          const startNode = mesh.getNode(draggedSubNode.originalBeamStart);
          const endNode = mesh.getNode(draggedSubNode.originalBeamEnd);
          if (startNode && endNode) {
            const bx = endNode.x - startNode.x;
            const by = endNode.y - startNode.y;
            const lenSq = bx * bx + by * by;
            if (lenSq > 0) {
              let t = ((newX - startNode.x) * bx + (newY - startNode.y) * by) / lenSq;
              t = Math.max(0.01, Math.min(0.99, t));
              newX = startNode.x + t * bx;
              newY = startNode.y + t * by;
              draggedSubNode.t = t;
            }
          }
        } else {
          // Apply axis constraint from gizmo (only for regular nodes)
          if (gizmoAxis === 'x' && dragNodeOrigin) {
            newY = dragNodeOrigin.y;
          } else if (gizmoAxis === 'y' && dragNodeOrigin) {
            newX = dragNodeOrigin.x;
          }
        }

        // Sync polygon vertex position if this node is a polygon corner
        // First check if the new position would create a self-intersecting polygon
        let isValidMove = true;
        if (!draggedSubNode) {
          const cornerInfo = findPlateCornerForNode(mesh, draggedNode);
          if (cornerInfo?.isPolygonVertex) {
            const plate = mesh.getPlateRegion(cornerInfo.plateId);
            if (plate?.polygon) {
              const boundaryNodeIds = plate.boundaryNodeIds ?? plate.nodeIds;
              // Find which vertex index this node corresponds to
              let targetVertexIndex = -1;
              for (let vi = 0; vi < plate.polygon.length; vi++) {
                const vx = plate.polygon[vi].x;
                const vy = plate.polygon[vi].y;
                let bestDist = Infinity;
                let bestNodeId = -1;
                for (const bid of boundaryNodeIds) {
                  if (bid === draggedNode) {
                    const ox = dragNodeOrigin?.x ?? newX;
                    const oy = dragNodeOrigin?.y ?? newY;
                    const d = (ox - vx) ** 2 + (oy - vy) ** 2;
                    if (d < bestDist) { bestDist = d; bestNodeId = bid; }
                  } else {
                    const bn = mesh.getNode(bid);
                    if (!bn) continue;
                    const d = (bn.x - vx) ** 2 + (bn.y - vy) ** 2;
                    if (d < bestDist) { bestDist = d; bestNodeId = bid; }
                  }
                }
                if (bestNodeId === draggedNode) {
                  targetVertexIndex = vi;
                  break;
                }
              }

              // Check if the new polygon would be self-intersecting or flip winding
              if (targetVertexIndex >= 0) {
                const testPolygon = plate.polygon.map((p, i) =>
                  i === targetVertexIndex ? { x: newX, y: newY } : { ...p }
                );
                const originalArea = polygonArea(plate.polygon);
                const newArea = polygonArea(testPolygon);
                // Reject if self-intersecting or if winding direction flipped (sign of area changed)
                const windingFlipped = (originalArea > 0 && newArea <= 0) || (originalArea < 0 && newArea >= 0) || (originalArea === 0);
                if (isPolygonSelfIntersecting(testPolygon) || windingFlipped) {
                  // Invalid: polygon would self-intersect or have wrong winding
                  isValidMove = false;
                } else {
                  // Valid: update the polygon
                  plate.polygon[targetVertexIndex] = { x: newX, y: newY };
                }
              }
            }
          }
        }

        // Only update node position if move is valid (or not a polygon corner)
        if (isValidMove) {
          mesh.updateNode(draggedNode, { x: newX, y: newY });
        } else {
          // Reset to origin if invalid
          if (dragNodeOrigin) {
            newX = dragNodeOrigin.x;
            newY = dragNodeOrigin.y;
          }
        }

        // Update sub-node positions if this node is an endpoint of beams with sub-nodes
        if (!draggedSubNode) {
          mesh.updateSubNodePositions(draggedNode);
        }

        dispatch({ type: 'REFRESH_MESH' });

        // Feature #17: Live result update during dragging
        if (autoRecalculate && result) {
          const now = Date.now();
          if (now - lastLiveSolveRef.current > 200) {
            lastLiveSolveRef.current = now;
            setTimeout(async () => {
              try {
                const { solve } = await import('../../core/solver/SolverService');
                const currentState = stateRef.current;
                const currentMesh = meshRef.current;
                const activeLc = currentState.loadCases.find(lc => lc.id === currentState.activeLoadCase);
                if (activeLc) applyLoadCaseToMesh(currentMesh, activeLc);
                const solveResult = await solve(currentMesh, {
                  analysisType: currentState.analysisType,
                  geometricNonlinear: false
                });
                dispatch({ type: 'SET_RESULT', payload: solveResult });
              } catch {
                // Silently ignore live-solve failures
              }
            }, 0);
          }
        }
      }
    } else {
      dispatch({
        type: 'SET_VIEW_STATE',
        payload: {
          offsetX: viewState.offsetX + dx,
          offsetY: viewState.offsetY + dy
        }
      });
    }

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    // Finalize selection box
    if (selectionBox) {
      const { startX, startY, endX, endY } = selectionBox;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      // Only select if the box has meaningful size (> 3px drag)
      if (maxX - minX > 3 || maxY - minY > 3) {
        const selectedNodes = new Set<number>();
        const selectedElements = new Set<number>();
        const selectedPointLoadNodes = new Set<number>();
        const selectedDistLoadBeams = new Set<number>();
        const selectedDistLoadIds = new Set<number>();

        // Detect crossing (left-drag) vs window (right-drag)
        const isCrossing = selectionBox.endX < selectionBox.startX;

        // Active load case for load selection
        const activeLcForBox = loadCases.find(lc => lc.id === activeLoadCase);

        // Select nodes within box
        for (const node of mesh.nodes.values()) {
          const s = worldToScreen(node.x, node.y);
          if (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) {
            selectedNodes.add(node.id);
            // Also select point loads on these nodes (in non-geometry view)
            if (viewMode !== 'geometry' && (node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment !== 0)) {
              selectedPointLoadNodes.add(node.id);
            }
          }
        }

        // Select beams
        for (const beam of mesh.beamElements.values()) {
          const nodes = mesh.getBeamElementNodes(beam);
          if (!nodes) continue;
          const [n1, n2] = nodes;
          const s1 = worldToScreen(n1.x, n1.y);
          const s2 = worldToScreen(n2.x, n2.y);

          const midX = (s1.x + s2.x) / 2;
          const midY = (s1.y + s2.y) / 2;

          // Also check load arrow symbolic area using load-case loads
          let loadTopInBox = false;
          const beamLoadsForBox = activeLcForBox?.distributedLoads.filter(dl => dl.elementId === beam.id) ?? [];
          if (viewMode !== 'geometry' && beamLoadsForBox.length > 0) {
            const screenAngle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
            let cumulativeOff = 0;
            for (const dl of beamLoadsForBox) {
              if (dl.qy === 0 && (dl.qyEnd ?? dl.qy) === 0) continue;
              const isGlobal = (dl.coordSystem ?? 'local') === 'global';
              const perpAngle = isGlobal ? -Math.PI / 2 : screenAngle - Math.PI / 2;
              const maxQ = Math.max(Math.abs(dl.qy), Math.abs(dl.qyEnd ?? dl.qy));
              const arrowLen = Math.min(40, maxQ / 500 * 40 + 20);
              const offset = cumulativeOff + arrowLen / 2;
              const topMidX = midX + Math.cos(perpAngle) * offset;
              const topMidY = midY + Math.sin(perpAngle) * offset;
              if (topMidX >= minX && topMidX <= maxX && topMidY >= minY && topMidY <= maxY) {
                loadTopInBox = true;
                if (dl.id != null) selectedDistLoadIds.add(dl.id);
              }
              cumulativeOff += arrowLen + 4;
            }
          }

          if (isCrossing) {
            // Crossing: select beams that intersect or are contained in the box
            const midInside = midX >= minX && midX <= maxX && midY >= minY && midY <= maxY;
            const crosses = lineIntersectsRect(s1.x, s1.y, s2.x, s2.y, minX, minY, maxX, maxY);
            if (midInside || crosses || loadTopInBox) {
              selectedElements.add(beam.id);
              if (viewMode !== 'geometry' && beamLoadsForBox.length > 0) {
                selectedDistLoadBeams.add(beam.id);
                for (const dl of beamLoadsForBox) {
                  if (dl.id != null) selectedDistLoadIds.add(dl.id);
                }
              }
            }
          } else {
            // Window: select beams whose midpoint is fully inside box
            if ((midX >= minX && midX <= maxX && midY >= minY && midY <= maxY) || loadTopInBox) {
              selectedElements.add(beam.id);
              if (viewMode !== 'geometry' && beamLoadsForBox.length > 0) {
                selectedDistLoadBeams.add(beam.id);
                for (const dl of beamLoadsForBox) {
                  if (dl.id != null) selectedDistLoadIds.add(dl.id);
                }
              }
            }
          }
        }

        dispatch({
          type: 'SET_SELECTION',
          payload: {
            nodeIds: selectedNodes,
            elementIds: selectedElements,
            pointLoadNodeIds: selectedPointLoadNodes,
            distLoadBeamIds: selectedDistLoadBeams,
            selectedDistLoadIds: selectedDistLoadIds
          }
        });
      } else {
        // Tiny box = click on empty space → clear
        dispatch({ type: 'CLEAR_SELECTION' });
      }

      setSelectionBox(null);
      setIsDragging(false);
      setDraggedNode(null);
      setDragNodeOrigin(null);
      return;
    }

    // Finalize load resize
    if (resizingLoadBeamId !== null) {
      const beam = mesh.getBeamElement(resizingLoadBeamId);
      if (beam?.distributedLoad) {
        // Find the first load for this beam in the active load case and update it
        const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        const existingDl = activeLc?.distributedLoads.find(dl => dl.elementId === resizingLoadBeamId);
        if (existingDl?.id != null) {
          dispatch({
            type: 'UPDATE_DISTRIBUTED_LOAD',
            payload: {
              lcId: state.activeLoadCase,
              loadId: existingDl.id,
              qx: beam.distributedLoad.qx,
              qy: beam.distributedLoad.qy,
              qxEnd: beam.distributedLoad.qxEnd,
              qyEnd: beam.distributedLoad.qyEnd,
              startT: beam.distributedLoad.startT,
              endT: beam.distributedLoad.endT,
              coordSystem: beam.distributedLoad.coordSystem
            }
          });
        } else {
          // Fallback: add as new load (for backward compatibility with loads without id)
          dispatch({
            type: 'ADD_DISTRIBUTED_LOAD',
            payload: {
              lcId: state.activeLoadCase,
              beamId: resizingLoadBeamId,
              qx: beam.distributedLoad.qx,
              qy: beam.distributedLoad.qy,
              qxEnd: beam.distributedLoad.qxEnd,
              qyEnd: beam.distributedLoad.qyEnd,
              startT: beam.distributedLoad.startT,
              endT: beam.distributedLoad.endT,
              coordSystem: beam.distributedLoad.coordSystem
            }
          });
        }
      }
      setResizingLoadBeamId(null);
      setResizeStartQy(0);
      setResizeStartQyEnd(0);
      setResizingLoadEnd(null);
      setResizingLoadHandleType('magnitude');
      setResizeStartT(0);
      setResizeEndT(1);
    }

    // Polygon corner vertex drag release: update the mesh node and remesh
    if (polygonCornerDrag !== null) {
      const plate = mesh.getPlateRegion(polygonCornerDrag.plateId);
      if (plate?.polygon) {
        const vi = polygonCornerDrag.vertexIndex;
        const newX = plate.polygon[vi].x;
        const newY = plate.polygon[vi].y;
        const hasDelta = Math.abs(newX - polygonCornerDrag.originVertex.x) > 1e-9 ||
                         Math.abs(newY - polygonCornerDrag.originVertex.y) > 1e-9;

        if (hasDelta) {
          // Now update the node position to match the polygon vertex
          mesh.updateNode(polygonCornerDrag.nodeId, { x: newX, y: newY });

          // Save old edgeId → polygonEdgeIndex mapping before remesh
          const capturedPlateId = polygonCornerDrag.plateId;
          const draggedNodeCapture = polygonCornerDrag.nodeId;
          const oldEdgeMap = new Map<number, number>();
          for (const edge of mesh.edges.values()) {
            if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
              oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
            }
          }

          // Async CDT boundary-conforming remesh
          remeshPolygonPlateRegion(mesh, capturedPlateId, draggedNodeCapture).then(() => {
            // Re-map distributed load edgeIds
            const newEdgeByPolyIdx = new Map<number, number>();
            for (const edge of mesh.edges.values()) {
              if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
                newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
              }
            }
            for (const lc of loadCases) {
              for (const dl of lc.distributedLoads) {
                if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                  const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                  const newId = newEdgeByPolyIdx.get(polyIdx);
                  if (newId !== undefined) dl.edgeId = newId;
                }
              }
            }
            dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set([draggedNodeCapture]), elementIds: new Set(), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() } });
            dispatch({ type: 'REFRESH_MESH' });
          });
        }
      }
      setPolygonCornerDrag(null);
      setDragNodeOrigin(null);
      setIsDragging(false);
      setDragStart({ x: 0, y: 0 });
      return;
    }

    // Contour edge drag release: regenerate mesh inside the new polygon contour
    if (contourEdgeDrag !== null) {
      const plate = mesh.getPlateRegion(contourEdgeDrag.plateId);
      if (plate?.polygon) {
        pushUndo();
        const capturedPlateId = contourEdgeDrag.plateId;
        const ei = contourEdgeDrag.edgeIndex;
        // Compute the total delta this edge was dragged
        const dx = plate.polygon[ei].x - contourEdgeDrag.originV1.x;
        const dy = plate.polygon[ei].y - contourEdgeDrag.originV1.y;
        const hasDelta = Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9;

        // Save old edgeId → polygonEdgeIndex mapping before remesh destroys old edges
        const oldEdgeMap = new Map<number, number>(); // oldEdgeId → polygonEdgeIndex
        for (const edge of mesh.edges.values()) {
          if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
            oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
          }
        }

        remeshPolygonPlateRegionFromContour(
          mesh,
          capturedPlateId,
          hasDelta ? { edgeIndex: ei, dx, dy } : undefined
        ).then(() => {
          // Re-map distributed load edgeIds from old edge IDs to new ones
          const newEdgeByPolyIdx = new Map<number, number>(); // polygonEdgeIndex → newEdgeId
          for (const edge of mesh.edges.values()) {
            if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
              newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
            }
          }
          for (const lc of loadCases) {
            for (const dl of lc.distributedLoads) {
              if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                const newId = newEdgeByPolyIdx.get(polyIdx);
                if (newId !== undefined) {
                  dl.edgeId = newId;
                }
              }
            }
          }
          dispatch({ type: 'CLEAR_SELECTION' });
          dispatch({ type: 'REFRESH_MESH' });
        }).catch(err => {
          console.error('[Edge Drag] Remesh failed:', err);
        });
      }
      setContourEdgeDrag(null);
      setIsDragging(false);
      setDragStart({ x: 0, y: 0 });
      return;
    }

    // Re-mesh plate region if a corner/vertex node was dragged
    if (draggedNode !== null) {
      const plateCornerInfo = findPlateCornerForNode(mesh, draggedNode);
      if (plateCornerInfo) {
        const draggedNodeCapture = draggedNode;
        if (plateCornerInfo.isPolygonVertex) {
          // Save old edgeId → polygonEdgeIndex mapping before remesh
          const oldEdgeMap = new Map<number, number>();
          for (const edge of mesh.edges.values()) {
            if (edge.plateId === plateCornerInfo.plateId && edge.polygonEdgeIndex !== undefined) {
              oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
            }
          }
          // Async CDT boundary-conforming remesh
          remeshPolygonPlateRegion(mesh, plateCornerInfo.plateId, draggedNodeCapture).then(() => {
            // Re-map distributed load edgeIds
            const newEdgeByPolyIdx = new Map<number, number>();
            for (const edge of mesh.edges.values()) {
              if (edge.plateId === plateCornerInfo.plateId && edge.polygonEdgeIndex !== undefined) {
                newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
              }
            }
            for (const lc of loadCases) {
              for (const dl of lc.distributedLoads) {
                if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                  const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                  const newId = newEdgeByPolyIdx.get(polyIdx);
                  if (newId !== undefined) dl.edgeId = newId;
                }
              }
            }
            dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set([draggedNodeCapture]), elementIds: new Set(), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() } });
            dispatch({ type: 'REFRESH_MESH' });
          });
        } else {
          remeshPlateRegion(mesh, plateCornerInfo.plateId);
          // Clear selection to avoid stale references to deleted interior node IDs
          dispatch({ type: 'SET_SELECTION', payload: { nodeIds: new Set([draggedNodeCapture]), elementIds: new Set(), pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() } });
          dispatch({ type: 'REFRESH_MESH' });
        }
      }
    }

    // Lock node to grid line if drag ended on a grid line
    if (draggedNode !== null) {
      const node = mesh.getNode(draggedNode);
      if (node) {
        const GRID_SNAP_TOL = 0.001; // 1mm
        let newGridLineId: number | undefined = undefined;

        for (const gl of structuralGrid.verticalLines) {
          if (Math.abs(node.x - gl.position) < GRID_SNAP_TOL) {
            newGridLineId = gl.id;
            break;
          }
        }
        if (!newGridLineId) {
          for (const gl of structuralGrid.horizontalLines) {
            if (Math.abs(node.y - gl.position) < GRID_SNAP_TOL) {
              newGridLineId = gl.id;
              break;
            }
          }
        }

        // Update gridLineId (may be undefined to clear old lock)
        node.gridLineId = newGridLineId;
      }
    }

    // Lock beam nodes to grid lines if beam drag ended on a grid line
    if (draggedBeamId !== null) {
      const beam = mesh.getBeamElement(draggedBeamId);
      if (beam) {
        const beamNodes = mesh.getBeamElementNodes(beam);
        if (beamNodes) {
          const GRID_SNAP_TOL = 0.001; // 1mm
          for (const node of beamNodes) {
            let newGridLineId: number | undefined = undefined;

            for (const gl of structuralGrid.verticalLines) {
              if (Math.abs(node.x - gl.position) < GRID_SNAP_TOL) {
                newGridLineId = gl.id;
                break;
              }
            }
            if (!newGridLineId) {
              for (const gl of structuralGrid.horizontalLines) {
                if (Math.abs(node.y - gl.position) < GRID_SNAP_TOL) {
                  newGridLineId = gl.id;
                  break;
                }
              }
            }

            // Update gridLineId (may be undefined to clear old lock)
            node.gridLineId = newGridLineId;
          }
        }
      }
    }

    setIsDragging(false);
    setDraggedNode(null);
    setDragNodeOrigin(null);
    setDraggedBeamId(null);
    setBeamDragOrigins(null);
    setDraggedGridLineId(null);
    setDraggedGridLineType(null);
    setContourEdgeDrag(null);
    setPolygonCornerDrag(null);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Double-click closes polygon in plate polygon drawing mode
    if (selectedTool === 'addPlate') {
      if (plateEditState === 'outline' && platePolygonPoints.length >= 3) {
        setPlateEditState(null); // close outline, show toolbar
        return;
      }
      if (plateEditState === 'void' && currentVoidPoints.length >= 3) {
        setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
        setCurrentVoidPoints([]);
        setPlateEditState(null);
        return;
      }
    }

    // Double-click on grid line -> open grids dialog
    const gridLine = findGridLineAtScreen(x, y);
    if (gridLine && onShowGridsDialog) {
      onShowGridsDialog();
      return;
    }

    // Double-click on a node -> open node properties dialog
    const node = findNodeAtScreen(x, y);
    if (node) {
      setEditingNodeId(node.id);
      return;
    }

    // Double-click on a dimension line -> open dimension edit dialog
    if (showDimensions && viewMode === 'geometry') {
      const dim = findDimensionAtScreen(x, y);
      if (dim) {
        setDimDialogBeamId(dim.beamId);
        return;
      }
    }

    // Double-click on a bar -> open bar properties (always takes priority over line load)
    const beam = findBeamAtScreen(x, y);
    if (beam) {
      // Check if click is near the UC badge (75% along beam)
      if (viewMode === 'results' && result && beam.section) {
        const nodes = mesh.getBeamElementNodes(beam);
        if (nodes) {
          const [n1, n2] = nodes;
          const p1 = worldToScreen(n1.x, n1.y);
          const p2 = worldToScreen(n2.x, n2.y);
          const t = 0.75;
          const bx = p1.x + (p2.x - p1.x) * t;
          const by = p1.y + (p2.y - p1.y) * t;
          const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
          if (dist < 20) {
            // Open code-check tab
            dispatch({ type: 'SET_CODE_CHECK_BEAM', payload: beam.id });
            return;
          }
        }
      }
      setEditingBarId(beam.id);
      return;
    }

    // Double-click on distributed load arrows (not on beam line) -> open LineLoadDialog for THAT specific load
    if (viewMode !== 'geometry') {
      const distLoadHit = findDistLoadAtScreen(x, y);
      if (distLoadHit !== null) {
        const { beamId, loadId } = distLoadHit;
        dispatch({
          type: 'SET_SELECTION',
          payload: {
            nodeIds: new Set(),
            elementIds: new Set(),
            pointLoadNodeIds: new Set(),
            distLoadBeamIds: new Set([beamId]),
            selectedDistLoadIds: new Set([loadId])
          }
        });
        setLineLoadBeamId(beamId);
        setEditingDistLoadId(loadId);
        return;
      }
    }

    // Double-click on a plate region -> open plate properties dialog
    const world = screenToWorld(x, y);
    for (const plate of mesh.plateRegions.values()) {
      const inPlate = plate.isPolygon && plate.polygon
        ? pointInPolygon(world.x, world.y, plate.polygon) && !(plate.voids ?? []).some(v => pointInPolygon(world.x, world.y, v))
        : world.x >= plate.x && world.x <= plate.x + plate.width &&
          world.y >= plate.y && world.y <= plate.y + plate.height;
      if (inPlate) {
        setEditingPlateId(plate.id);
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setEditingDimension(null);
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(10, Math.min(500, viewState.scale * zoomFactor));

    // Zoom towards mouse position
    const worldBeforeX = (mouseX - viewState.offsetX) / viewState.scale;
    const worldBeforeY = (mouseY - viewState.offsetY) / viewState.scale;

    const newOffsetX = mouseX - worldBeforeX * newScale;
    const newOffsetY = mouseY - worldBeforeY * newScale;

    dispatch({
      type: 'SET_VIEW_STATE',
      payload: { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }
    });
  };

  return (
    <div className="mesh-editor" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setCursorPos(null); setGizmoAxis(null); dispatch({ type: 'SET_MOUSE_WORLD_POS', payload: null }); }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={e => {
          e.preventDefault();
          // Cancel polygon corner drag — restore vertex to original position
          if (isDragging && polygonCornerDrag !== null) {
            const plate = mesh.getPlateRegion(polygonCornerDrag.plateId);
            if (plate?.polygon) {
              plate.polygon[polygonCornerDrag.vertexIndex] = { ...polygonCornerDrag.originVertex };
            }
            setPolygonCornerDrag(null);
            setDragNodeOrigin(null);
            setIsDragging(false);
            setDragStart({ x: 0, y: 0 });
            dispatch({ type: 'UNDO' });
            return;
          }
          // Cancel contour edge drag — restore both vertices to original positions
          if (isDragging && contourEdgeDrag !== null) {
            const plate = mesh.getPlateRegion(contourEdgeDrag.plateId);
            if (plate?.polygon) {
              const ei = contourEdgeDrag.edgeIndex;
              const ei2 = (ei + 1) % plate.polygon.length;
              plate.polygon[ei] = { ...contourEdgeDrag.originV1 };
              plate.polygon[ei2] = { ...contourEdgeDrag.originV2 };
            }
            setContourEdgeDrag(null);
            setIsDragging(false);
            setDragStart({ x: 0, y: 0 });
            dispatch({ type: 'UNDO' });
            return;
          }
          // Cancel any in-progress drag first — restore node to pre-drag position
          if (isDragging && draggedNode !== null && dragNodeOrigin) {
            const node = mesh.getNode(draggedNode);
            if (node) {
              mesh.updateNode(draggedNode, { x: dragNodeOrigin.x, y: dragNodeOrigin.y });
              mesh.updateSubNodePositions(draggedNode);
            }
            setIsDragging(false);
            setDraggedNode(null);
            setDragNodeOrigin(null);
            setGizmoAxis(null);
            dispatch({ type: 'UNDO' }); // Restore the pre-drag snapshot
            return;
          }
          if (isDragging && draggedBeamId !== null && beamDragOrigins) {
            setIsDragging(false);
            setDraggedBeamId(null);
            setBeamDragOrigins(null);
            dispatch({ type: 'UNDO' });
            return;
          }
          if (isDragging) {
            setIsDragging(false);
            setDraggedNode(null);
            setDragNodeOrigin(null);
            setDraggedBeamId(null);
            setBeamDragOrigins(null);
            setDraggedGridLineId(null);
            setDraggedGridLineType(null);
            setResizingLoadBeamId(null);
            setGizmoAxis(null);
            setPolygonCornerDrag(null);
            return;
          }
          // Right-click cancels active tool / mode (like Escape)
          if (moveMode) {
            setMoveMode(false);
          } else if (pendingCommand) {
            setPendingCommand(null);
          } else if (editingDimension) {
            setEditingDimension(null);
          } else if (voidTargetPlateId !== null && plateEditState === 'void') {
            // Right-click closes void on existing plate (from "+" button)
            if (currentVoidPoints.length >= 3) {
              const plate = mesh.getPlateRegion(voidTargetPlateId);
              if (plate) {
                pushUndo();
                if (!plate.voids) plate.voids = [];
                plate.voids.push([...currentVoidPoints]);
                const oldEdgeMap = new Map<number, number>();
                for (const edge of mesh.edges.values()) {
                  if (edge.plateId === voidTargetPlateId && edge.polygonEdgeIndex !== undefined) {
                    oldEdgeMap.set(edge.id, edge.polygonEdgeIndex);
                  }
                }
                const capturedPlateId = voidTargetPlateId;
                remeshPolygonPlateRegionFromContour(mesh, capturedPlateId).then(() => {
                  const newEdgeByPolyIdx = new Map<number, number>();
                  for (const edge of mesh.edges.values()) {
                    if (edge.plateId === capturedPlateId && edge.polygonEdgeIndex !== undefined) {
                      newEdgeByPolyIdx.set(edge.polygonEdgeIndex, edge.id);
                    }
                  }
                  for (const lc of loadCases) {
                    for (const dl of lc.distributedLoads) {
                      if (dl.edgeId !== undefined && oldEdgeMap.has(dl.edgeId)) {
                        const polyIdx = oldEdgeMap.get(dl.edgeId)!;
                        const newId = newEdgeByPolyIdx.get(polyIdx);
                        if (newId !== undefined) dl.edgeId = newId;
                      }
                    }
                  }
                  dispatch({ type: 'REFRESH_MESH' });
                });
              }
              setCurrentVoidPoints([]);
              setPlateEditState(null);
              setVoidTargetPlateId(null);
            } else {
              setCurrentVoidPoints([]);
              setPlateEditState(null);
              setVoidTargetPlateId(null);
            }
          } else if (selectedTool === 'addPlate' && (plateEditState !== null || platePolygonPoints.length > 0)) {
            // Right-click closes polygon if >= 3 points, cancels if < 3
            if (plateEditState === 'outline' && platePolygonPoints.length >= 3) {
              // Close the outline polygon — same as Enter/double-click
              setPlateEditState(null);
            } else if (plateEditState === 'void' && currentVoidPoints.length >= 3) {
              // Close the void polygon
              setPlateVoids(prev => [...prev, [...currentVoidPoints]]);
              setCurrentVoidPoints([]);
              setPlateEditState(null);
            } else if (plateEditState === 'void' && currentVoidPoints.length > 0) {
              // Cancel current void (< 3 points)
              setCurrentVoidPoints([]);
              setPlateEditState(null);
            } else if (plateEditState === 'outline' && platePolygonPoints.length > 0) {
              // Cancel outline (< 3 points)
              setPlatePolygonPoints([]);
              setPlateEditState(null);
            } else if (plateEditState === null && platePolygonPoints.length > 0) {
              // Outline complete, toolbar showing — cancel the whole polygon plate
              setPlatePolygonPoints([]);
              setPlateVoids([]);
              setCurrentVoidPoints([]);
              setPlateEditState(null);
            }
          } else if (pendingNodes.length > 0) {
            // Right-click with pending nodes: cancel the current chain but stay in the tool
            // Remove orphaned nodes created during aborted bar placement
            if (selectedTool === 'addBeam') {
              for (const nodeId of pendingNodes) {
                const node = mesh.getNode(nodeId);
                if (node) {
                  const isConnected = Array.from(mesh.beamElements.values()).some(b =>
                    b.nodeIds.includes(nodeId)
                  ) || Array.from(mesh.elements.values()).some(e =>
                    e.nodeIds.includes(nodeId)
                  );
                  if (!isConnected) {
                    mesh.removeNode(nodeId);
                  }
                }
              }
              dispatch({ type: 'REFRESH_MESH' });
            }
            dispatch({ type: 'CLEAR_PENDING_NODES' });
          } else if (selectedTool !== 'select') {
            dispatch({ type: 'SET_TOOL', payload: 'select' });
          } else {
            // No pending operation — show context menu
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const node = findNodeAtScreen(x, y);
            if (node) {
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'node', id: node.id });
              return;
            }
            const beam = findBeamAtScreen(x, y);
            if (beam) {
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'beam', id: beam.id });
              return;
            }
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas' });
          }
        }}
        style={{
          cursor: moveMode ? 'move'
            : selectedTool === 'rotate' ? 'crosshair'
            : isConstraintTool ? 'none'
            : (selectedTool === 'addLoad' || selectedTool === 'addLineLoad' || selectedTool === 'addPlate' || selectedTool === 'addThermalLoad' || selectedTool === 'addSubNode') ? 'crosshair'
            : gizmoAxis === 'x' ? 'ew-resize'
            : gizmoAxis === 'y' ? 'ns-resize'
            : gizmoAxis === 'free' ? 'grab'
            : (isDragging && draggedNode !== null) ? 'grabbing'
            : (isDragging && contourEdgeDrag !== null) ? 'grabbing'
            : 'default'
        }}
      />
      {/* Zoom controls overlay */}
      <div className="zoom-controls">
        <button
          className="zoom-control-btn"
          onClick={() => {
            const newScale = Math.min(500, viewState.scale * 1.2);
            const cx = (canvasRef.current?.width ?? 800) / 2;
            const cy = (canvasRef.current?.height ?? 600) / 2;
            const worldX = (cx - viewState.offsetX) / viewState.scale;
            const worldY = (cy - viewState.offsetY) / viewState.scale;
            dispatch({ type: 'SET_VIEW_STATE', payload: { scale: newScale, offsetX: cx - worldX * newScale, offsetY: cy - worldY * newScale } });
          }}
          title="Zoom In"
        >
          +
        </button>
        <span className="zoom-level">{Math.round(viewState.scale)}%</span>
        <button
          className="zoom-control-btn"
          onClick={() => {
            const newScale = Math.max(10, viewState.scale / 1.2);
            const cx = (canvasRef.current?.width ?? 800) / 2;
            const cy = (canvasRef.current?.height ?? 600) / 2;
            const worldX = (cx - viewState.offsetX) / viewState.scale;
            const worldY = (cy - viewState.offsetY) / viewState.scale;
            dispatch({ type: 'SET_VIEW_STATE', payload: { scale: newScale, offsetX: cx - worldX * newScale, offsetY: cy - worldY * newScale } });
          }}
          title="Zoom Out"
        >
          -
        </button>
      </div>
      {/* Hover tooltip for beams and nodes */}
      {tooltipPos && selectedTool === 'select' && !isDragging && (hoveredBeamId !== null || hoveredNodeId !== null) && (() => {
        const lines: string[] = [];
        if (hoveredNodeId !== null && hoveredBeamId === null) {
          const node = mesh.getNode(hoveredNodeId);
          if (node) {
            lines.push(`Node ${node.id}`);
            lines.push(`X: ${(node.x * 1000).toFixed(0)} mm  (${node.x.toFixed(3)} m)`);
            lines.push(`Y: ${(node.y * 1000).toFixed(0)} mm  (${node.y.toFixed(3)} m)`);
            const cx = node.constraints.x;
            const cy = node.constraints.y;
            const cr = node.constraints.rotation;
            if (cx || cy || cr) {
              const parts: string[] = [];
              if (cx) parts.push('X');
              if (cy) parts.push('Y');
              if (cr) parts.push('Rot');
              lines.push(`Constraints: ${parts.join(', ')}`);
            } else {
              lines.push('Constraints: Free');
            }
          }
        } else if (hoveredBeamId !== null) {
          const beam = mesh.getBeamElement(hoveredBeamId);
          if (beam) {
            const beamNodes = mesh.getBeamElementNodes(beam);
            const length = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : 0;
            const mat = mesh.getMaterial(beam.materialId);
            lines.push(`Beam ${beam.id}`);
            if (beam.profileName) lines.push(`Profile: ${beam.profileName}`);
            if (mat) lines.push(`Material: ${mat.name}`);
            lines.push(`Length: ${(length * 1000).toFixed(0)} mm`);
            lines.push(`A = ${(beam.section.A * 1e4).toFixed(2)} cm\u00B2`);
            lines.push(`I = ${(beam.section.I * 1e8).toFixed(1)} cm\u2074`);
          }
        }
        if (lines.length === 0) return null;
        return (
          <div
            className="mesh-tooltip"
            style={{
              left: tooltipPos.x + 14,
              top: tooltipPos.y + 14
            }}
          >
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        );
      })()}
      {selectedTool === 'rotate' && !rotateCenter && (
        <div className="command-indicator">
          Click to set rotation center.
        </div>
      )}
      {voidTargetPlateId !== null && plateEditState === 'void' && (
        <div className="command-indicator" style={{ backgroundColor: 'rgba(59, 130, 246, 0.9)' }}>
          Void Edit Mode (Plate {voidTargetPlateId}): Click vertices to draw opening, A for arc, Tab/Enter/Right-click to close, Esc to cancel.{arcMode ? ' [Arc mode ON]' : ''}
        </div>
      )}
      {moveMode && (
        <div className="command-indicator">
          Click to place, Escape to cancel
        </div>
      )}
      {selectedTool === 'addPlate' && plateEditState === 'outline' && (
        <div className="command-indicator">
          Click to add vertices. A for arc. Tab/Enter/Right-click to close polygon. Esc to cancel.{arcMode ? ' [Arc mode ON]' : ''}
        </div>
      )}
      {selectedTool === 'addPlate' && plateEditState === 'void' && !voidTargetPlateId && (
        <div className="command-indicator">
          Drawing void: Click to add vertices. A for arc. Tab/Enter/Right-click to close. Esc to cancel.{arcMode ? ' [Arc mode ON]' : ''}
        </div>
      )}
      {selectedTool === 'addPlate' && plateEditState === null && platePolygonPoints.length >= 3 && !showPlateDialog && (
        <div className="plate-polygon-toolbar">
          <span className="plate-polygon-toolbar-label">
            Polygon plate ({platePolygonPoints.length} vertices{plateVoids.length > 0 ? `, ${plateVoids.length} void(s)` : ''})
          </span>
          <button
            className="plate-polygon-toolbar-btn void-btn"
            onClick={() => setPlateEditState('void')}
          >
            Add Void
          </button>
          <button
            className="plate-polygon-toolbar-btn finish-btn"
            onClick={() => {
              // Compute bounding box from polygon points
              const xs = platePolygonPoints.map(p => p.x);
              const ys = platePolygonPoints.map(p => p.y);
              const minXP = Math.min(...xs);
              const maxXP = Math.max(...xs);
              const minYP = Math.min(...ys);
              const maxYP = Math.max(...ys);
              const bboxW = maxXP - minXP;
              const bboxH = maxYP - minYP;
              if (bboxW > 0.001 && bboxH > 0.001) {
                setPendingPolygonPlate({
                  outline: [...platePolygonPoints],
                  voids: [...plateVoids],
                  bbox: { x: minXP, y: minYP, w: bboxW, h: bboxH }
                });
                setShowPlateDialog(true);
              }
            }}
          >
            Finish
          </button>
          <button
            className="plate-polygon-toolbar-btn cancel-btn"
            onClick={() => {
              setPlatePolygonPoints([]);
              setPlateVoids([]);
              setCurrentVoidPoints([]);
              setPlateEditState(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {/* Floating "+" button to add void when a polygon plate is selected */}
      {(() => {
        if (selection.plateIds.size !== 1) return null;
        const selectedPlateId = Array.from(selection.plateIds)[0];
        const selectedPlate = mesh.getPlateRegion(selectedPlateId);
        if (!selectedPlate?.isPolygon) return null;
        // Compute plate centroid for button position
        const centroid = selectedPlate.polygon
          ? polygonCentroid(selectedPlate.polygon)
          : { x: selectedPlate.x + selectedPlate.width / 2, y: selectedPlate.y + selectedPlate.height / 2 };
        const screenPos = worldToScreen(centroid.x, centroid.y);
        return (
          <button
            className="plate-add-void-floating-btn"
            style={{
              position: 'absolute',
              left: screenPos.x + 20,
              top: screenPos.y - 30,
              zIndex: 100
            }}
            onClick={() => {
              setVoidTargetPlateId(selectedPlateId);
              setCurrentVoidPoints([]);
              setPlateEditState('void');
              dispatch({ type: 'CLEAR_SELECTION' });
            }}
            title="Add void opening"
          >
            +
          </button>
        );
      })()}
      {beamLengthInput !== null && selectedTool === 'addBeam' && pendingNodes.length === 1 && (
        <div className="beam-length-input-overlay">
          <label>Length (mm):</label>
          <input
            className="dimension-input"
            type="text"
            autoFocus
            defaultValue={beamLengthInput}
            onFocus={(e) => {
              // Place cursor at end
              const len = e.target.value.length;
              e.target.setSelectionRange(len, len);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const valMm = parseFloat(e.currentTarget.value);
                if (!isNaN(valMm) && valMm > 0) {
                  const firstNode = mesh.getNode(pendingNodes[0]);
                  if (firstNode && cursorPos) {
                    const cursorWorld = screenToWorld(cursorPos.x, cursorPos.y);
                    const dx = cursorWorld.x - firstNode.x;
                    const dy = cursorWorld.y - firstNode.y;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);
                    const angle = currentDist > 0.001
                      ? Math.atan2(dy, dx)
                      : 0; // Default to horizontal if cursor is on the node
                    const targetDist = valMm / 1000;
                    const newX = firstNode.x + targetDist * Math.cos(angle);
                    const newY = firstNode.y + targetDist * Math.sin(angle);
                    pushUndo();
                    const newNode = mesh.addNode(newX, newY);
                    const nodeIds: [number, number] = [pendingNodes[0], newNode.id];
                    if (lastUsedSection) {
                      const nb = mesh.addBeamElement(nodeIds, 1, lastUsedSection.section, lastUsedSection.profileName);
                      if (nb) nb.layerId = activeLayerId;
                      dispatch({ type: 'REFRESH_MESH' });
                      dispatch({ type: 'SET_RESULT', payload: null });
                      dispatch({ type: 'CLEAR_PENDING_NODES' });
                      dispatch({ type: 'ADD_PENDING_NODE', payload: newNode.id });
                    } else {
                      setPendingBeamNodeIds(nodeIds);
                      setShowSectionDialog(true);
                      dispatch({ type: 'CLEAR_PENDING_NODES' });
                    }
                  }
                }
                setBeamLengthInput(null);
              }
              if (e.key === 'Escape') {
                setBeamLengthInput(null);
              }
            }}
            onBlur={() => setBeamLengthInput(null)}
          />
        </div>
      )}
      {rotateAngleInput !== null && rotateCenter && selectedTool === 'rotate' && (
        <div className="beam-length-input-overlay">
          <label>Rotation angle (°):</label>
          <input
            className="dimension-input"
            type="text"
            autoFocus
            value={rotateAngleInput}
            onChange={(e) => setRotateAngleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const angleDeg = parseFloat(rotateAngleInput || '0');
                if (!isNaN(angleDeg) && angleDeg !== 0) {
                  pushUndo();
                  const rad = angleDeg * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const cx = rotateCenter.x;
                  const cy = rotateCenter.y;

                  // Collect all rotatable node IDs
                  const rotateNodeIds = new Set(selection.nodeIds);
                  for (const plateId of selection.plateIds) {
                    const plate = mesh.getPlateRegion(plateId);
                    if (plate) {
                      for (const nid of plate.nodeIds) rotateNodeIds.add(nid);
                    }
                  }

                  // Rotate all nodes
                  for (const nodeId of rotateNodeIds) {
                    const node = mesh.getNode(nodeId);
                    if (node) {
                      const dx = node.x - cx;
                      const dy = node.y - cy;
                      mesh.updateNode(nodeId, {
                        x: cx + dx * cos - dy * sin,
                        y: cy + dx * sin + dy * cos
                      });
                    }
                  }

                  // Update plate geometry for selected plates
                  for (const plateId of selection.plateIds) {
                    const plate = mesh.getPlateRegion(plateId);
                    if (plate) {
                      // Rotate plate origin
                      const pdx = plate.x - cx;
                      const pdy = plate.y - cy;
                      plate.x = cx + pdx * cos - pdy * sin;
                      plate.y = cy + pdx * sin + pdy * cos;
                      if (plate.polygon) {
                        for (const v of plate.polygon) {
                          const vdx = v.x - cx;
                          const vdy = v.y - cy;
                          v.x = cx + vdx * cos - vdy * sin;
                          v.y = cy + vdx * sin + vdy * cos;
                        }
                      }
                      if (plate.voids) {
                        for (const voidPoly of plate.voids) {
                          for (const v of voidPoly) {
                            const vdx = v.x - cx;
                            const vdy = v.y - cy;
                            v.x = cx + vdx * cos - vdy * sin;
                            v.y = cy + vdx * sin + vdy * cos;
                          }
                        }
                      }
                      if (plate.edgeIds) {
                        for (const edgeId of plate.edgeIds) {
                          const edge = mesh.getEdge(edgeId);
                          if (edge) {
                            const sdx = edge.vertexStart.x - cx;
                            const sdy = edge.vertexStart.y - cy;
                            edge.vertexStart.x = cx + sdx * cos - sdy * sin;
                            edge.vertexStart.y = cy + sdx * sin + sdy * cos;
                            const edx = edge.vertexEnd.x - cx;
                            const edy = edge.vertexEnd.y - cy;
                            edge.vertexEnd.x = cx + edx * cos - edy * sin;
                            edge.vertexEnd.y = cy + edx * sin + edy * cos;
                          }
                        }
                      }
                    }
                  }

                  dispatch({ type: 'REFRESH_MESH' });
                  dispatch({ type: 'SET_RESULT', payload: null });
                }
                setRotateCenter(null);
                setRotateAngleInput(null);
                dispatch({ type: 'SET_TOOL', payload: 'select' });
              }
              if (e.key === 'Escape') {
                setRotateCenter(null);
                setRotateAngleInput(null);
                dispatch({ type: 'SET_TOOL', payload: 'select' });
              }
            }}
          />
        </div>
      )}
      {angleEditBeamId !== null && (() => {
        const beam = mesh.getBeamElement(angleEditBeamId);
        const beamNodes = beam ? mesh.getBeamElementNodes(beam) : null;
        if (!beamNodes) return null;
        const [bn1, bn2] = beamNodes;
        const sp1 = worldToScreen(bn1.x, bn1.y);
        const beamAngle = Math.atan2(bn2.y - bn1.y, bn2.x - bn1.x);
        const screenBeamAngle = -beamAngle;
        const arcRadius = 40;
        const labelAngle = screenBeamAngle / 2;
        const labelR = arcRadius + 15;
        const inputX = sp1.x + labelR * Math.cos(labelAngle);
        const inputY = sp1.y + labelR * Math.sin(labelAngle);
        return (
          <input
            className="dimension-input"
            type="text"
            autoFocus
            value={angleEditInput}
            onChange={(e) => setAngleEditInput(e.target.value)}
            style={{
              position: 'absolute',
              left: inputX - 25,
              top: inputY - 12,
              width: 50,
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const newAngleDeg = parseFloat(angleEditInput);
                if (!isNaN(newAngleDeg) && beam && beamNodes) {
                  pushUndo();
                  // Calculate current beam length
                  const dx = bn2.x - bn1.x;
                  const dy = bn2.y - bn1.y;
                  const length = Math.sqrt(dx * dx + dy * dy);
                  // Calculate new position for node 2 (rotate around node 1)
                  const newAngleRad = newAngleDeg * Math.PI / 180;
                  const newX2 = bn1.x + length * Math.cos(newAngleRad);
                  const newY2 = bn1.y + length * Math.sin(newAngleRad);
                  mesh.updateNode(bn2.id, { x: newX2, y: newY2 });
                  dispatch({ type: 'REFRESH_MESH' });
                  dispatch({ type: 'SET_RESULT', payload: null });
                }
                setAngleEditBeamId(null);
                setAngleEditInput('');
              }
              if (e.key === 'Escape') {
                setAngleEditBeamId(null);
                setAngleEditInput('');
              }
            }}
            onBlur={() => {
              setAngleEditBeamId(null);
              setAngleEditInput('');
            }}
          />
        );
      })()}
      {editingDimension && (
        <input
          className="dimension-input"
          type="text"
          autoFocus
          defaultValue={(editingDimension.currentLength * 1000).toFixed(0)}
          style={{
            position: 'absolute',
            left: editingDimension.screenX - 38,
            top: editingDimension.screenY - 13,
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const valMm = parseFloat(e.currentTarget.value);
              if (!isNaN(valMm) && valMm > 0) {
                pushUndo();
                applyNewDimension(editingDimension.beamId, valMm / 1000);
              }
              setEditingDimension(null);
            }
            if (e.key === 'Escape') {
              setEditingDimension(null);
            }
          }}
          onBlur={() => setEditingDimension(null)}
        />
      )}
      {showSectionDialog && pendingBeamNodeIds && (
        <SectionPropertiesDialog
          isNew
          onSave={(profileName: string, section: IBeamSection) => {
            pushUndo();
            const nb = mesh.addBeamElement(pendingBeamNodeIds, 1, section, profileName);
            if (nb) nb.layerId = activeLayerId;
            dispatch({ type: 'REFRESH_MESH' });
            dispatch({ type: 'SET_RESULT', payload: null });
            // Remember section for continuous beam drawing
            setLastUsedSection({ section, profileName });
            // Continue chain: end node becomes start of next beam
            const endNodeId = pendingBeamNodeIds[1];
            dispatch({ type: 'ADD_PENDING_NODE', payload: endNodeId });
            setShowSectionDialog(false);
            setPendingBeamNodeIds(null);
          }}
          onClose={() => {
            setShowSectionDialog(false);
            setPendingBeamNodeIds(null);
          }}
        />
      )}
      {editingNodeId !== null && (() => {
        const node = mesh.getNode(editingNodeId);
        if (!node) return null;
        return (
          <NodePropertiesDialog
            node={node}
            onUpdate={(updates) => {
              pushUndo();
              if (updates.x !== undefined || updates.y !== undefined) {
                mesh.updateNode(editingNodeId, {
                  x: updates.x ?? node.x,
                  y: updates.y ?? node.y
                });
              }
              if (updates.constraints) {
                mesh.updateNode(editingNodeId, { constraints: updates.constraints });
              }
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
            }}
            onClose={() => setEditingNodeId(null)}
          />
        );
      })()}
      {editingLoadNodeId !== null && (() => {
        const node = mesh.getNode(editingLoadNodeId);
        if (!node) return null;
        // Find existing load in active LC
        const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        const existingPl = activeLc?.pointLoads.find(pl => pl.nodeId === editingLoadNodeId);
        return (
          <LoadDialog
            initialFx={existingPl?.fx ?? 0}
            initialFy={existingPl?.fy ?? 0}
            initialMoment={existingPl?.mz ?? 0}
            loadCases={state.loadCases}
            activeLoadCase={state.activeLoadCase}
            onApply={(fx, fy, moment, lcId) => {
              pushUndo();
              dispatch({
                type: 'ADD_POINT_LOAD',
                payload: { lcId, nodeId: editingLoadNodeId, fx, fy, mz: moment }
              });
              // Also apply to mesh for rendering
              mesh.updateNode(editingLoadNodeId, { loads: { fx, fy, moment } });
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
              dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
              setEditingLoadNodeId(null);
            }}
            onCancel={() => setEditingLoadNodeId(null)}
          />
        );
      })()}
      {editingBarId !== null && (() => {
        const beam = mesh.getBeamElement(editingBarId);
        if (!beam) return null;
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) return null;
        const length = calculateBeamLength(nodes[0], nodes[1]);
        const beamMaterial = mesh.getMaterial(beam.materialId);
        const editBarForces = result?.beamForces.get(editingBarId);
        return (
          <BarPropertiesDialog
            beam={beam}
            length={length}
            material={beamMaterial}
            beamForces={editBarForces}
            layers={Array.from(mesh.layers.values())}
            onUpdate={(updates) => {
              pushUndo();
              mesh.updateBeamElement(editingBarId, updates);
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
            }}
            onClose={() => setEditingBarId(null)}
          />
        );
      })()}
      {dimDialogBeamId !== null && (() => {
        const beam = mesh.getBeamElement(dimDialogBeamId);
        if (!beam) return null;
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) return null;
        const [n1, n2] = nodes;
        const currentLength = calculateBeamLength(n1, n2);
        // Determine which node to move: prefer moving the unconstrained end (n2)
        const n2Constrained = n2.constraints.x || n2.constraints.y || n2.constraints.rotation;
        const n1Constrained = n1.constraints.x || n1.constraints.y || n1.constraints.rotation;
        const movingNodeId = (n2Constrained && !n1Constrained) ? n1.id : n2.id;
        return (
          <DimensionEditDialog
            beamId={dimDialogBeamId}
            node1={n1}
            node2={n2}
            currentLength={currentLength}
            movingNodeId={movingNodeId}
            onApply={(newLength) => {
              pushUndo();
              applyNewDimension(dimDialogBeamId, newLength);
            }}
            onClose={() => setDimDialogBeamId(null)}
          />
        );
      })()}
      {lineLoadBeamId !== null && (() => {
        const isEdgeMode = lineLoadEdgeId !== null;
        const beam = isEdgeMode ? null : mesh.getBeamElement(lineLoadBeamId);
        if (!isEdgeMode && !beam) return null;

        // Compute length: beam length or edge length
        let effectiveLength: number | undefined;
        if (isEdgeMode) {
          const iedge = mesh.getEdge(lineLoadEdgeId!);
          if (iedge) {
            const dx = iedge.vertexEnd.x - iedge.vertexStart.x;
            const dy = iedge.vertexEnd.y - iedge.vertexStart.y;
            effectiveLength = Math.sqrt(dx * dx + dy * dy);
          }
        } else if (beam) {
          const beamNodes = mesh.getBeamElementNodes(beam);
          effectiveLength = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : undefined;
        }

        // If editingDistLoadId is set, find the existing load to pre-fill the dialog
        const editingLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        const existingLoad = editingDistLoadId != null
          ? editingLc?.distributedLoads.find(dl => dl.id === editingDistLoadId)
          : null;

        return (
          <LineLoadDialog
            initialQx={existingLoad ? existingLoad.qx : 0}
            initialQy={existingLoad ? existingLoad.qy : -3000}
            initialQxEnd={existingLoad?.qxEnd}
            initialQyEnd={existingLoad?.qyEnd}
            initialStartT={existingLoad?.startT ?? 0}
            initialEndT={existingLoad?.endT ?? 1}
            initialCoordSystem={existingLoad?.coordSystem ?? (isEdgeMode ? 'global' : 'local')}
            initialDescription={existingLoad?.description ?? ''}
            beamLength={isEdgeMode ? undefined : effectiveLength}
            edgeMode={isEdgeMode}
            edgeId={lineLoadEdgeId ?? undefined}
            edgeLength={isEdgeMode ? effectiveLength : undefined}
            loadCases={state.loadCases}
            activeLoadCase={state.activeLoadCase}
            onApply={(qx, qy, lcId, startT, endT, coordSystem, qxEnd, qyEnd, description) => {
              pushUndo();
              if (existingLoad && existingLoad.id != null) {
                // Update existing load
                dispatch({
                  type: 'UPDATE_DISTRIBUTED_LOAD',
                  payload: { lcId, loadId: existingLoad.id, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description }
                });
              } else if (isEdgeMode) {
                // Add new edge load
                dispatch({
                  type: 'ADD_DISTRIBUTED_LOAD',
                  payload: { lcId, beamId: 0, edgeId: lineLoadEdgeId!, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description }
                });
              } else {
                // Add new beam load
                dispatch({
                  type: 'ADD_DISTRIBUTED_LOAD',
                  payload: { lcId, beamId: lineLoadBeamId, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description }
                });
              }
              // Re-apply load case to mesh for rendering (combines all loads) — beam path only
              if (!isEdgeMode) {
                const updatedLc = state.loadCases.find(lc => lc.id === lcId);
                if (updatedLc) {
                  mesh.updateBeamElement(lineLoadBeamId, { distributedLoad: undefined });
                  const allLoadsForBeam = [...updatedLc.distributedLoads.filter(dl => dl.elementId === lineLoadBeamId)];
                  if (existingLoad && existingLoad.id != null) {
                    const idx = allLoadsForBeam.findIndex(dl => dl.id === existingLoad.id);
                    if (idx >= 0) {
                      allLoadsForBeam[idx] = { ...allLoadsForBeam[idx], qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description };
                    }
                  } else {
                    allLoadsForBeam.push({ elementId: lineLoadBeamId, qx, qy, qxEnd, qyEnd, startT, endT, coordSystem, description });
                  }
                  let combined = { qx: 0, qy: 0, qxEnd: 0, qyEnd: 0, startT: 0 as number, endT: 1 as number, coordSystem: coordSystem as 'local' | 'global' | undefined };
                  for (const dl of allLoadsForBeam) {
                    combined.qx += dl.qx;
                    combined.qy += dl.qy;
                    combined.qxEnd += (dl.qxEnd ?? dl.qx);
                    combined.qyEnd += (dl.qyEnd ?? dl.qy);
                    combined.startT = Math.min(combined.startT, dl.startT ?? 0);
                    combined.endT = Math.max(combined.endT, dl.endT ?? 1);
                    if (dl.coordSystem) combined.coordSystem = dl.coordSystem;
                  }
                  mesh.updateBeamElement(lineLoadBeamId, { distributedLoad: combined });
                }
              }
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
              dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
              setLineLoadBeamId(null);
              setLineLoadEdgeId(null);
              setEditingDistLoadId(null);
            }}
            onCancel={() => { setLineLoadBeamId(null); setLineLoadEdgeId(null); setEditingDistLoadId(null); }}
            onPreview={isEdgeMode ? undefined : (pQx, pQy, pCoord, pStartT, pEndT, pQxEnd, pQyEnd) => {
              mesh.updateBeamElement(lineLoadBeamId, {
                distributedLoad: { qx: pQx, qy: pQy, qxEnd: pQxEnd, qyEnd: pQyEnd, startT: pStartT, endT: pEndT, coordSystem: pCoord }
              });
              dispatch({ type: 'REFRESH_MESH' });
            }}
          />
        );
      })()}
      {showPlateDialog && pendingPolygonPlate && (
        <PlateDialog
          polygonVertices={pendingPolygonPlate.outline}
          polygonVoids={pendingPolygonPlate.voids}
          materials={Array.from(mesh.materials.values()).map(m => ({ id: m.id, name: m.name }))}
          onConfirm={async (config) => {
            pushUndo();

            let plate;
            // Polygon mode: boundary-conforming CDT + tri-to-quad pairing
            try {
              plate = await generatePolygonPlateMeshV2(mesh, {
                outline: pendingPolygonPlate.outline,
                voids: pendingPolygonPlate.voids.length > 0 ? pendingPolygonPlate.voids : undefined,
                meshSize: config.meshSize,
                materialId: config.materialId,
                thickness: config.thickness,
              });
            } catch {
              // Fallback to voxelized quad grid if CDT fails
              plate = generatePolygonPlateMesh(mesh, {
                outline: pendingPolygonPlate.outline,
                voids: pendingPolygonPlate.voids.length > 0 ? pendingPolygonPlate.voids : undefined,
                meshSize: config.meshSize,
                materialId: config.materialId,
                thickness: config.thickness,
              });
            }

            mesh.addPlateRegion(plate);
            // Create IEdge objects and fix plateId references
            fixupEdgePlateIds(mesh, plate);
            dispatch({ type: 'REFRESH_MESH' });
            dispatch({ type: 'SET_RESULT', payload: null });
            // Switch to plane_stress if currently in frame mode
            if (state.analysisType === 'frame') {
              dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'plane_stress' });
            }
            setShowPlateDialog(false);
            // Clear polygon state
            setPlatePolygonPoints([]);
            setPlateVoids([]);
            setCurrentVoidPoints([]);
            setPendingPolygonPlate(null);
            setPlateEditState(null);
          }}
          onCancel={() => {
            setShowPlateDialog(false);
            setPendingPolygonPlate(null);
          }}
        />
      )}
      {editingPlateId !== null && (() => {
        const plate = mesh.plateRegions.get(editingPlateId);
        if (!plate) return null;
        return (
          <PlatePropertiesDialog
            plate={plate}
            materials={Array.from(mesh.materials.values())}
            onAddVoid={plate.isPolygon ? () => {
              const capturedPlateId = editingPlateId;
              console.log('[Add Void] Starting void edit mode for plate', capturedPlateId);
              // First close the dialog, then set void drawing state
              setEditingPlateId(null);
              setVoidTargetPlateId(capturedPlateId);
              setCurrentVoidPoints([]);
              setPlateEditState('void');
            } : undefined}
            onUpdate={(updates) => {
              pushUndo();
              const p = mesh.plateRegions.get(editingPlateId);
              if (!p) return;
              if (updates.thickness !== undefined) {
                p.thickness = updates.thickness;
                // Also update thickness on all plate elements
                for (const elemId of p.elementIds) {
                  const elem = mesh.getElement(elemId);
                  if (elem) elem.thickness = updates.thickness;
                }
              }
              if (updates.materialId !== undefined) {
                p.materialId = updates.materialId;
                for (const elemId of p.elementIds) {
                  const elem = mesh.getElement(elemId);
                  if (elem) elem.materialId = updates.materialId;
                }
              }
              if (updates.meshSize !== undefined) {
                if (p.isPolygon) {
                  p.meshSize = updates.meshSize;
                  // Save old edge mapping before remesh
                  const oldEdgeMap3 = new Map<number, number>();
                  for (const edge of mesh.edges.values()) {
                    if (edge.plateId === editingPlateId && edge.polygonEdgeIndex !== undefined) {
                      oldEdgeMap3.set(edge.id, edge.polygonEdgeIndex);
                    }
                  }
                  const capturedPlateId3 = editingPlateId;
                  remeshPolygonPlateRegionFromContour(mesh, capturedPlateId3).then(() => {
                    const newEdgeByPolyIdx3 = new Map<number, number>();
                    for (const edge of mesh.edges.values()) {
                      if (edge.plateId === capturedPlateId3 && edge.polygonEdgeIndex !== undefined) {
                        newEdgeByPolyIdx3.set(edge.polygonEdgeIndex, edge.id);
                      }
                    }
                    for (const lc of loadCases) {
                      for (const dl of lc.distributedLoads) {
                        if (dl.edgeId !== undefined && oldEdgeMap3.has(dl.edgeId)) {
                          const polyIdx = oldEdgeMap3.get(dl.edgeId)!;
                          const newId = newEdgeByPolyIdx3.get(polyIdx);
                          if (newId !== undefined) dl.edgeId = newId;
                        }
                      }
                    }
                    dispatch({ type: 'REFRESH_MESH' });
                  });
                } else {
                  // Rectangular: compute new divisions from mesh size
                  const newDivX = Math.max(1, Math.round(p.width / updates.meshSize));
                  const newDivY = Math.max(1, Math.round(p.height / updates.meshSize));
                  p.divisionsX = newDivX;
                  p.divisionsY = newDivY;
                  remeshPlateRegion(mesh, editingPlateId);
                  // Recreate IEdge objects for rect plate
                  mesh.removeEdgesForPlate(editingPlateId);
                  createEdgesForRectPlate(mesh, p);
                }
              }
              mesh.plateRegions.set(editingPlateId, p);
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
            }}
            onClose={() => setEditingPlateId(null)}
          />
        );
      })()}
      {thermalLoadElementIds.length > 0 && (
        <ThermalLoadDialog
          elementIds={thermalLoadElementIds}
          plateId={thermalLoadPlateId}
          onConfirm={(deltaT) => {
            pushUndo();
            for (const elemId of thermalLoadElementIds) {
              dispatch({
                type: 'ADD_THERMAL_LOAD',
                payload: { lcId: activeLoadCase, elementId: elemId, plateId: thermalLoadPlateId, deltaT }
              });
            }
            dispatch({ type: 'REFRESH_MESH' });
            dispatch({ type: 'SET_RESULT', payload: null });
            setThermalLoadElementIds([]);
            setThermalLoadPlateId(undefined);
          }}
          onCancel={() => {
            setThermalLoadElementIds([]);
            setThermalLoadPlateId(undefined);
          }}
        />
      )}
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.type === 'node' && (
            <>
              <div
                className="context-menu-item"
                onClick={() => {
                  setEditingNodeId(contextMenu.id!);
                  setContextMenu(null);
                }}
              >
                {t('context.properties')}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (contextMenu.id !== undefined) {
                    pushUndo();
                    mesh.removeNode(contextMenu.id);
                    dispatch({ type: 'REFRESH_MESH' });
                  }
                  setContextMenu(null);
                }}
              >
                {t('context.deleteNode')}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (contextMenu.id !== undefined) {
                    const node = mesh.getNode(contextMenu.id);
                    if (node && !node.constraints.x && !node.constraints.y) {
                      pushUndo();
                      mesh.updateNode(contextMenu.id, {
                        constraints: { x: true, y: true, rotation: false }
                      });
                      dispatch({ type: 'REFRESH_MESH' });
                    }
                  }
                  setContextMenu(null);
                }}
              >
                {t('context.addSupport')}
              </div>
            </>
          )}
          {contextMenu.type === 'beam' && (
            <>
              <div
                className="context-menu-item"
                onClick={() => {
                  setEditingBarId(contextMenu.id!);
                  setContextMenu(null);
                }}
              >
                {t('context.properties')}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (contextMenu.id !== undefined) {
                    pushUndo();
                    mesh.removeElement(contextMenu.id);
                    dispatch({ type: 'REFRESH_MESH' });
                  }
                  setContextMenu(null);
                }}
              >
                {t('context.deleteBeam')}
              </div>
            </>
          )}
          {contextMenu.type === 'canvas' && (
            <>
              <div
                className="context-menu-item"
                onClick={() => {
                  const allNodeIds = new Set(Array.from(mesh.nodes.keys()));
                  const allElementIds = new Set(Array.from(mesh.beamElements.keys()));
                  dispatch({
                    type: 'SET_SELECTION',
                    payload: { nodeIds: allNodeIds, elementIds: allElementIds, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set() }
                  });
                  setContextMenu(null);
                }}
              >
                {t('context.selectAll')}
              </div>
            </>
          )}
        </div>
      )}
      {/* Click outside context menu to close */}
      {contextMenu && (
        <div
          className="context-menu-overlay"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
      )}
    </div>
  );
}

function pointInTriangle(p: { x: number; y: number }, v1: INode, v2: INode, v3: INode): boolean {
  const sign = (p1: { x: number; y: number }, p2: INode, p3: INode) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);

  const d1 = sign(p, v1, v2);
  const d2 = sign(p, v2, v3);
  const d3 = sign(p, v3, v1);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  // Check if either endpoint is inside the rect
  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true;
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) return true;

  // Check intersection with each rect edge
  return (
    segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) || // top
    segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) || // right
    segmentsIntersect(x1, y1, x2, y2, minX, maxY, maxX, maxY) || // bottom
    segmentsIntersect(x1, y1, x2, y2, minX, minY, minX, maxY)    // left
  );
}

function pointToLineDistance(p: { x: number; y: number }, a: INode, b: INode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;

  return Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2);
}
