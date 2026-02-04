/**
 * NodeEditorPanel — Visual programming interface like Grasshopper
 * Nodes connected with wires for parametric structural modeling
 * Connected to FEM model for live structural analysis
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { solve } from '../../core/solver/SolverService';
import { ALL_STEEL_PROFILES, ISteelProfile } from '../../core/data/SteelSections';
import { Plus, Trash2, Play, ZoomIn, ZoomOut, Maximize, RefreshCw } from 'lucide-react';
import './NodeEditorPanel.css';

// Node types for structural modeling
type NodeType =
  | 'number'
  | 'point'
  | 'line'
  | 'beam'
  | 'support'
  | 'load'
  | 'lineLoad'
  | 'solve'
  | 'display'
  | 'slider'
  | 'math'
  | 'series'
  | 'maxDisp'
  | 'maxMoment'
  | 'python';

interface Port {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType: 'number' | 'point' | 'geometry' | 'any' | 'list';
  value?: any;
}

interface GraphNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  inputs: Port[];
  outputs: Port[];
  data: Record<string, any>;
  collapsed?: boolean;
}

interface Wire {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

// Execution context for graph evaluation
interface ExecutionContext {
  nodeOutputs: Map<string, Map<string, any>>;
  createdNodes: Map<string, number>; // graphNodeId -> meshNodeId
  createdBeams: Map<string, number>; // graphNodeId -> meshBeamId
  solverResult: any;
}

// Node templates
const NODE_TEMPLATES: Record<NodeType, Omit<GraphNode, 'id' | 'x' | 'y'>> = {
  number: {
    type: 'number',
    width: 120,
    height: 80,
    title: 'Number',
    inputs: [],
    outputs: [{ id: 'out', name: 'N', type: 'output', dataType: 'number' }],
    data: { value: 0 },
  },
  slider: {
    type: 'slider',
    width: 180,
    height: 90,
    title: 'Slider',
    inputs: [],
    outputs: [{ id: 'out', name: 'N', type: 'output', dataType: 'number' }],
    data: { value: 3000, min: 0, max: 10000, step: 100 },
  },
  series: {
    type: 'series',
    width: 160,
    height: 120,
    title: 'Series',
    inputs: [
      { id: 'start', name: 'Start', type: 'input', dataType: 'number' },
      { id: 'step', name: 'Step', type: 'input', dataType: 'number' },
      { id: 'count', name: 'Count', type: 'input', dataType: 'number' },
    ],
    outputs: [{ id: 'list', name: 'List', type: 'output', dataType: 'list' }],
    data: { start: 0, step: 1000, count: 5 },
  },
  point: {
    type: 'point',
    width: 140,
    height: 100,
    title: 'Point',
    inputs: [
      { id: 'x', name: 'X (mm)', type: 'input', dataType: 'number' },
      { id: 'y', name: 'Y (mm)', type: 'input', dataType: 'number' },
    ],
    outputs: [{ id: 'pt', name: 'Pt', type: 'output', dataType: 'point' }],
    data: { x: 0, y: 0 },
  },
  line: {
    type: 'line',
    width: 140,
    height: 100,
    title: 'Line',
    inputs: [
      { id: 'start', name: 'Start', type: 'input', dataType: 'point' },
      { id: 'end', name: 'End', type: 'input', dataType: 'point' },
    ],
    outputs: [{ id: 'line', name: 'Line', type: 'output', dataType: 'geometry' }],
    data: {},
  },
  beam: {
    type: 'beam',
    width: 160,
    height: 100,
    title: 'Beam Element',
    inputs: [
      { id: 'line', name: 'Line', type: 'input', dataType: 'geometry' },
    ],
    outputs: [{ id: 'beam', name: 'Beam', type: 'output', dataType: 'geometry' }],
    data: { profile: 'IPE 200' },
  },
  support: {
    type: 'support',
    width: 150,
    height: 100,
    title: 'Support',
    inputs: [
      { id: 'point', name: 'Point', type: 'input', dataType: 'point' },
    ],
    outputs: [{ id: 'node', name: 'Node', type: 'output', dataType: 'any' }],
    data: { type: 'pinned' },
  },
  load: {
    type: 'load',
    width: 160,
    height: 140,
    title: 'Point Load',
    inputs: [
      { id: 'point', name: 'Point', type: 'input', dataType: 'point' },
      { id: 'fx', name: 'Fx (kN)', type: 'input', dataType: 'number' },
      { id: 'fy', name: 'Fy (kN)', type: 'input', dataType: 'number' },
    ],
    outputs: [],
    data: { fx: 0, fy: -10 },
  },
  lineLoad: {
    type: 'lineLoad',
    width: 160,
    height: 120,
    title: 'Line Load',
    inputs: [
      { id: 'beam', name: 'Beam', type: 'input', dataType: 'geometry' },
      { id: 'qy', name: 'qy (kN/m)', type: 'input', dataType: 'number' },
    ],
    outputs: [],
    data: { qy: -10 },
  },
  solve: {
    type: 'solve',
    width: 140,
    height: 80,
    title: 'Solve',
    inputs: [],
    outputs: [{ id: 'result', name: 'Result', type: 'output', dataType: 'any' }],
    data: { status: 'ready' },
  },
  display: {
    type: 'display',
    width: 160,
    height: 90,
    title: 'Display',
    inputs: [{ id: 'data', name: 'Data', type: 'input', dataType: 'any' }],
    outputs: [],
    data: { value: null },
  },
  maxDisp: {
    type: 'maxDisp',
    width: 160,
    height: 90,
    title: 'Max Displacement',
    inputs: [{ id: 'result', name: 'Result', type: 'input', dataType: 'any' }],
    outputs: [{ id: 'value', name: 'mm', type: 'output', dataType: 'number' }],
    data: { value: null },
  },
  maxMoment: {
    type: 'maxMoment',
    width: 160,
    height: 90,
    title: 'Max Moment',
    inputs: [{ id: 'result', name: 'Result', type: 'input', dataType: 'any' }],
    outputs: [{ id: 'value', name: 'kNm', type: 'output', dataType: 'number' }],
    data: { value: null },
  },
  math: {
    type: 'math',
    width: 140,
    height: 100,
    title: 'Math',
    inputs: [
      { id: 'a', name: 'A', type: 'input', dataType: 'number' },
      { id: 'b', name: 'B', type: 'input', dataType: 'number' },
    ],
    outputs: [{ id: 'result', name: 'R', type: 'output', dataType: 'number' }],
    data: { operation: '+' },
  },
  python: {
    type: 'python',
    width: 220,
    height: 160,
    title: 'Python',
    inputs: [
      { id: 'x', name: 'x', type: 'input', dataType: 'number' },
      { id: 'y', name: 'y', type: 'input', dataType: 'number' },
      { id: 'z', name: 'z', type: 'input', dataType: 'number' },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'output', dataType: 'any' }],
    data: { code: 'x + y * 2', error: null },
  },
};

// Node categories for palette
const NODE_CATEGORIES = [
  { name: 'Input', nodes: ['number', 'slider', 'series'] as NodeType[] },
  { name: 'Geometry', nodes: ['point', 'line'] as NodeType[] },
  { name: 'Structure', nodes: ['beam', 'support', 'load', 'lineLoad'] as NodeType[] },
  { name: 'Analysis', nodes: ['solve', 'maxDisp', 'maxMoment', 'display'] as NodeType[] },
  { name: 'Math', nodes: ['math', 'python'] as NodeType[] },
];

let nextNodeId = 1;
let nextWireId = 1;

export const NodeEditorPanel: React.FC = () => {
  const { state, dispatch } = useFEM();
  const { mesh } = state;
  const canvasRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<{ node: string; port: string; type: 'input' | 'output' } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showPalette, setShowPalette] = useState(false);
  const [palettePos, setPalettePos] = useState({ x: 0, y: 0 });
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Get input value for a node
  const getInputValue = useCallback((
    nodeId: string,
    portId: string,
    context: ExecutionContext,
    graphNodes: GraphNode[],
    graphWires: Wire[]
  ): any => {
    // Find wire connected to this input
    const wire = graphWires.find(w => w.toNode === nodeId && w.toPort === portId);
    if (wire) {
      const sourceOutputs = context.nodeOutputs.get(wire.fromNode);
      if (sourceOutputs) {
        return sourceOutputs.get(wire.fromPort);
      }
    }
    // No wire, use default from node data
    const node = graphNodes.find(n => n.id === nodeId);
    if (node) {
      // Map port id to data key (strip suffix)
      const basePortId = portId.split('_')[0];
      return node.data[basePortId];
    }
    return undefined;
  }, []);

  // Topological sort of nodes
  const topologicalSort = useCallback((graphNodes: GraphNode[], graphWires: Wire[]): GraphNode[] => {
    const sorted: GraphNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error('Circular dependency detected');
      }
      visiting.add(nodeId);

      // Visit all nodes that this node depends on
      const incomingWires = graphWires.filter(w => w.toNode === nodeId);
      for (const wire of incomingWires) {
        visit(wire.fromNode);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      const node = graphNodes.find(n => n.id === nodeId);
      if (node) sorted.push(node);
    };

    for (const node of graphNodes) {
      visit(node.id);
    }

    return sorted;
  }, []);

  // Execute a single node
  const executeNode = useCallback(async (
    node: GraphNode,
    context: ExecutionContext,
    graphNodes: GraphNode[],
    graphWires: Wire[]
  ): Promise<void> => {
    const outputs = new Map<string, any>();

    const getInput = (portId: string) => getInputValue(node.id, portId, context, graphNodes, graphWires);

    switch (node.type) {
      case 'number': {
        outputs.set(node.outputs[0].id, node.data.value);
        break;
      }

      case 'slider': {
        outputs.set(node.outputs[0].id, node.data.value);
        break;
      }

      case 'series': {
        const start = getInput(node.inputs[0].id) ?? node.data.start;
        const step = getInput(node.inputs[1].id) ?? node.data.step;
        const count = getInput(node.inputs[2].id) ?? node.data.count;
        const list = [];
        for (let i = 0; i < count; i++) {
          list.push(start + i * step);
        }
        outputs.set(node.outputs[0].id, list);
        break;
      }

      case 'point': {
        const x = getInput(node.inputs[0].id) ?? node.data.x;
        const y = getInput(node.inputs[1].id) ?? node.data.y;
        // Convert mm to m for internal use
        outputs.set(node.outputs[0].id, { x: x / 1000, y: y / 1000 });
        break;
      }

      case 'line': {
        const start = getInput(node.inputs[0].id);
        const end = getInput(node.inputs[1].id);
        if (start && end) {
          outputs.set(node.outputs[0].id, { start, end });
        }
        break;
      }

      case 'beam': {
        const lineInput = getInput(node.inputs[0].id);
        if (lineInput) {
          const { start, end } = lineInput;

          // Find or create start node
          let startNodeId = findOrCreateMeshNode(start.x, start.y, context, mesh);
          let endNodeId = findOrCreateMeshNode(end.x, end.y, context, mesh);

          // Get profile section (SteelSections units: A in cm², Iy/Iz in cm⁴, Wy/Wz in cm³, h/b/tw/tf in mm)
          const profileName = node.data.profile;
          const profile = ALL_STEEL_PROFILES.find((p: ISteelProfile) => p.name === profileName);
          const section = profile ? {
            A: profile.A / 1e4,        // cm² to m²
            I: profile.Iy / 1e8,       // cm⁴ to m⁴
            h: profile.h / 1000,       // mm to m
            b: profile.b / 1000,       // mm to m
            tw: profile.tw / 1000,     // mm to m
            tf: profile.tf / 1000,     // mm to m
            Iy: profile.Iy / 1e8,      // cm⁴ to m⁴
            Iz: profile.Iz / 1e8,      // cm⁴ to m⁴
            Wy: profile.Wy / 1e6,      // cm³ to m³
            Wz: profile.Wz / 1e6,      // cm³ to m³
          } : { A: 0.005, I: 2e-5, h: 0.2 };

          // Create beam
          const beam = mesh.addBeamElement([startNodeId, endNodeId], 1, section, profileName);
          if (beam) {
            context.createdBeams.set(node.id, beam.id);
            outputs.set(node.outputs[0].id, { beamId: beam.id, start, end });
          }
        }
        break;
      }

      case 'support': {
        const point = getInput(node.inputs[0].id);
        if (point) {
          const nodeId = findOrCreateMeshNode(point.x, point.y, context, mesh);
          const supportType = node.data.type;

          let constraints = { x: false, y: false, rotation: false };
          if (supportType === 'pinned') {
            constraints = { x: true, y: true, rotation: false };
          } else if (supportType === 'fixed') {
            constraints = { x: true, y: true, rotation: true };
          } else if (supportType === 'roller') {
            constraints = { x: false, y: true, rotation: false };
          }

          mesh.updateNode(nodeId, { constraints });
          outputs.set(node.outputs[0].id, { nodeId, point });
        }
        break;
      }

      case 'load': {
        const point = getInput(node.inputs[0].id);
        const fx = (getInput(node.inputs[1].id) ?? node.data.fx) * 1000; // kN to N
        const fy = (getInput(node.inputs[2].id) ?? node.data.fy) * 1000; // kN to N

        if (point) {
          const nodeId = findOrCreateMeshNode(point.x, point.y, context, mesh);
          const meshNode = mesh.nodes.get(nodeId);
          if (meshNode) {
            mesh.updateNode(nodeId, {
              loads: { ...meshNode.loads, fx, fy }
            });
          }
        }
        break;
      }

      case 'lineLoad': {
        const beamInput = getInput(node.inputs[0].id);
        const qy = (getInput(node.inputs[1].id) ?? node.data.qy) * 1000; // kN/m to N/m

        if (beamInput && beamInput.beamId !== undefined) {
          mesh.updateBeamElement(beamInput.beamId, {
            distributedLoad: { qx: 0, qy }
          });
        }
        break;
      }

      case 'solve': {
        // Run solver
        try {
          node.data.status = 'solving';
          const result = await solve(mesh, { analysisType: 'frame', geometricNonlinear: false });
          context.solverResult = result;
          dispatch({ type: 'SET_RESULT', payload: result });
          dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
          node.data.status = 'done';
          outputs.set(node.outputs[0].id, result);
        } catch (err: any) {
          node.data.status = 'error';
          throw new Error(`Solver failed: ${err.message}`);
        }
        break;
      }

      case 'maxDisp': {
        const result = getInput(node.inputs[0].id) ?? context.solverResult;
        if (result && result.displacements) {
          let maxDisp = 0;
          for (let i = 0; i < result.displacements.length; i++) {
            maxDisp = Math.max(maxDisp, Math.abs(result.displacements[i]));
          }
          const value = maxDisp * 1000; // m to mm
          node.data.value = value.toFixed(2);
          outputs.set(node.outputs[0].id, value);
        }
        break;
      }

      case 'maxMoment': {
        const result = getInput(node.inputs[0].id) ?? context.solverResult;
        if (result && result.beamForces) {
          let maxM = 0;
          for (const forces of result.beamForces.values()) {
            maxM = Math.max(maxM, Math.abs(forces.maxM));
          }
          const value = maxM / 1000; // Nm to kNm
          node.data.value = value.toFixed(2);
          outputs.set(node.outputs[0].id, value);
        }
        break;
      }

      case 'display': {
        const data = getInput(node.inputs[0].id);
        if (data !== undefined) {
          if (typeof data === 'number') {
            node.data.value = data.toFixed(3);
          } else if (typeof data === 'object') {
            node.data.value = JSON.stringify(data, null, 0).slice(0, 50);
          } else {
            node.data.value = String(data);
          }
        } else {
          node.data.value = '—';
        }
        break;
      }

      case 'math': {
        const a = getInput(node.inputs[0].id) ?? 0;
        const b = getInput(node.inputs[1].id) ?? 0;
        let result = 0;
        switch (node.data.operation) {
          case '+': result = a + b; break;
          case '-': result = a - b; break;
          case '*': result = a * b; break;
          case '/': result = b !== 0 ? a / b : 0; break;
        }
        outputs.set(node.outputs[0].id, result);
        break;
      }

      case 'python': {
        const x = getInput(node.inputs[0].id) ?? 0;
        const y = getInput(node.inputs[1].id) ?? 0;
        const z = getInput(node.inputs[2].id) ?? 0;
        const code = node.data.code || '';

        try {
          // Convert Python-like syntax to JavaScript
          let jsCode = code
            .replace(/\*\*/g, '**')  // Power operator (ES7)
            .replace(/True/g, 'true')
            .replace(/False/g, 'false')
            .replace(/None/g, 'null')
            .replace(/and/g, '&&')
            .replace(/or/g, '\|\|')
            .replace(/not\s+/g, '!')
            .replace(/math\.sqrt/g, 'Math.sqrt')
            .replace(/math\.sin/g, 'Math.sin')
            .replace(/math\.cos/g, 'Math.cos')
            .replace(/math\.tan/g, 'Math.tan')
            .replace(/math\.pi/g, 'Math.PI')
            .replace(/math\.e/g, 'Math.E')
            .replace(/math\.abs/g, 'Math.abs')
            .replace(/math\.pow/g, 'Math.pow')
            .replace(/math\.log/g, 'Math.log')
            .replace(/math\.exp/g, 'Math.exp')
            .replace(/math\.floor/g, 'Math.floor')
            .replace(/math\.ceil/g, 'Math.ceil')
            .replace(/math\.round/g, 'Math.round')
            .replace(/abs\(/g, 'Math.abs(')
            .replace(/sqrt\(/g, 'Math.sqrt(')
            .replace(/sin\(/g, 'Math.sin(')
            .replace(/cos\(/g, 'Math.cos(')
            .replace(/tan\(/g, 'Math.tan(')
            .replace(/min\(/g, 'Math.min(')
            .replace(/max\(/g, 'Math.max(');

          // Safe evaluation with restricted scope
          const safeEval = new Function('x', 'y', 'z', 'Math', `"use strict"; return (${jsCode});`);
          const result = safeEval(x, y, z, Math);
          node.data.error = null;
          outputs.set(node.outputs[0].id, result);
        } catch (err: any) {
          node.data.error = err.message;
          outputs.set(node.outputs[0].id, null);
        }
        break;
      }
    }

    context.nodeOutputs.set(node.id, outputs);
  }, [getInputValue, mesh, dispatch]);

  // Find or create mesh node at position
  const findOrCreateMeshNode = (x: number, y: number, _context: ExecutionContext, meshRef: any): number => {
    // Check if we already have a node at this position
    const tolerance = 0.001; // 1mm
    for (const [, meshNode] of meshRef.nodes) {
      if (Math.abs(meshNode.x - x) < tolerance && Math.abs(meshNode.y - y) < tolerance) {
        return meshNode.id;
      }
    }
    // Create new node
    const newNode = meshRef.addNode(x, y);
    return newNode.id;
  };

  // Execute entire graph
  const executeGraph = useCallback(async () => {
    setExecuting(true);
    setExecutionError(null);

    try {
      // Clear mesh first
      mesh.clear();

      // Add default steel material if not present
      if (mesh.materials.size === 0) {
        mesh.addMaterial({
          name: 'Steel S235',
          E: 210e9,
          nu: 0.3,
          rho: 7850,
          color: '#4a90d9'
        });
      }

      const context: ExecutionContext = {
        nodeOutputs: new Map(),
        createdNodes: new Map(),
        createdBeams: new Map(),
        solverResult: null,
      };

      // Sort nodes topologically
      const sortedNodes = topologicalSort(nodes, wires);

      // Execute each node in order
      for (const node of sortedNodes) {
        await executeNode(node, context, nodes, wires);
      }

      // Update state to refresh view
      dispatch({ type: 'REFRESH_MESH' });

      // Force update nodes to show display values
      setNodes(prev => [...prev]);

    } catch (error: any) {
      setExecutionError(error.message);
      console.error('Graph execution failed:', error);
    } finally {
      setExecuting(false);
    }
  }, [nodes, wires, mesh, topologicalSort, executeNode, dispatch]);

  // Add a node
  const addNode = useCallback((type: NodeType, x: number, y: number) => {
    const template = NODE_TEMPLATES[type];
    const id = nextNodeId++;
    const newNode: GraphNode = {
      ...template,
      id: `node_${id}`,
      x,
      y,
      inputs: template.inputs.map(p => ({ ...p, id: `${p.id}_${id}` })),
      outputs: template.outputs.map(p => ({ ...p, id: `${p.id}_${id}` })),
      data: { ...template.data },
    };
    setNodes(prev => [...prev, newNode]);
    setShowPalette(false);
  }, []);

  // Delete selected node
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setWires(prev => prev.filter(w => w.fromNode !== nodeId && w.toNode !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  }, [selectedNode]);

  // Handle canvas mouse down
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    } else if (e.button === 0 && e.target === canvasRef.current) {
      setSelectedNode(null);
    }
  }, [pan]);

  // Handle canvas mouse move
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      });
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (draggingNode) {
      setNodes(prev => prev.map(n => {
        if (n.id === draggingNode) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            return {
              ...n,
              x: (e.clientX - rect.left - pan.x) / zoom - dragOffset.x,
              y: (e.clientY - rect.top - pan.y) / zoom - dragOffset.y,
            };
          }
        }
        return n;
      }));
    }
  }, [isPanning, panStart, draggingNode, dragOffset, pan, zoom]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNode(null);
    setConnecting(null);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNode(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: (e.clientX - rect.left - pan.x) / zoom - node.x,
          y: (e.clientY - rect.top - pan.y) / zoom - node.y,
        });
        setDraggingNode(nodeId);
      }
    }
  }, [nodes, pan, zoom]);

  const handlePortClick = useCallback((e: React.MouseEvent, nodeId: string, portId: string, portType: 'input' | 'output') => {
    e.stopPropagation();

    if (connecting) {
      if (connecting.type === 'output' && portType === 'input' && connecting.node !== nodeId) {
        const exists = wires.some(w =>
          w.fromNode === connecting.node && w.fromPort === connecting.port &&
          w.toNode === nodeId && w.toPort === portId
        );
        if (!exists) {
          setWires(prev => prev.filter(w => !(w.toNode === nodeId && w.toPort === portId)));
          setWires(prev => [...prev, {
            id: `wire_${nextWireId++}`,
            fromNode: connecting.node,
            fromPort: connecting.port,
            toNode: nodeId,
            toPort: portId,
          }]);
        }
      } else if (connecting.type === 'input' && portType === 'output' && connecting.node !== nodeId) {
        const exists = wires.some(w =>
          w.fromNode === nodeId && w.fromPort === portId &&
          w.toNode === connecting.node && w.toPort === connecting.port
        );
        if (!exists) {
          setWires(prev => prev.filter(w => !(w.toNode === connecting.node && w.toPort === connecting.port)));
          setWires(prev => [...prev, {
            id: `wire_${nextWireId++}`,
            fromNode: nodeId,
            fromPort: portId,
            toNode: connecting.node,
            toPort: connecting.port,
          }]);
        }
      }
      setConnecting(null);
    } else {
      setConnecting({ node: nodeId, port: portId, type: portType });
    }
  }, [connecting, wires]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setPalettePos({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      });
      setShowPalette(true);
    }
  }, [pan, zoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(2, Math.max(0.25, prev * delta)));
  }, []);

  const getPortPosition = useCallback((nodeId: string, portId: string, isOutput: boolean) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const ports = isOutput ? node.outputs : node.inputs;
    const portIndex = ports.findIndex(p => p.id === portId);
    const portCount = ports.length;

    const x = isOutput ? node.x + node.width : node.x;
    const headerHeight = 28;
    const portSpacing = (node.height - headerHeight) / (portCount + 1);
    const y = node.y + headerHeight + portSpacing * (portIndex + 1);

    return { x, y };
  }, [nodes]);

  const updateNodeData = useCallback((nodeId: string, key: string, value: any) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, [key]: value } };
      }
      return n;
    }));
  }, []);

  const zoomIn = () => setZoom(prev => Math.min(2, prev * 1.2));
  const zoomOut = () => setZoom(prev => Math.max(0.25, prev / 1.2));
  const zoomFit = () => {
    setZoom(1);
    setPan({ x: 100, y: 100 });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedNode) {
        deleteNode(selectedNode);
      }
      if (e.key === 'Escape') {
        setConnecting(null);
        setShowPalette(false);
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        executeGraph();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, deleteNode, executeGraph]);

  // Create demo graph on first load
  useEffect(() => {
    if (nodes.length === 0) {
      // Create a simple beam example
      const demoNodes: GraphNode[] = [
        { ...NODE_TEMPLATES.slider, id: 'node_1', x: 50, y: 50,
          inputs: [],
          outputs: [{ id: 'out_1', name: 'N', type: 'output', dataType: 'number' }],
          data: { value: 6000, min: 1000, max: 12000, step: 500 } },
        { ...NODE_TEMPLATES.point, id: 'node_2', x: 50, y: 180,
          inputs: [
            { id: 'x_2', name: 'X (mm)', type: 'input', dataType: 'number' },
            { id: 'y_2', name: 'Y (mm)', type: 'input', dataType: 'number' },
          ],
          outputs: [{ id: 'pt_2', name: 'Pt', type: 'output', dataType: 'point' }],
          data: { x: 0, y: 0 } },
        { ...NODE_TEMPLATES.point, id: 'node_3', x: 50, y: 320,
          inputs: [
            { id: 'x_3', name: 'X (mm)', type: 'input', dataType: 'number' },
            { id: 'y_3', name: 'Y (mm)', type: 'input', dataType: 'number' },
          ],
          outputs: [{ id: 'pt_3', name: 'Pt', type: 'output', dataType: 'point' }],
          data: { x: 6000, y: 0 } },
        { ...NODE_TEMPLATES.line, id: 'node_4', x: 250, y: 230,
          inputs: [
            { id: 'start_4', name: 'Start', type: 'input', dataType: 'point' },
            { id: 'end_4', name: 'End', type: 'input', dataType: 'point' },
          ],
          outputs: [{ id: 'line_4', name: 'Line', type: 'output', dataType: 'geometry' }],
          data: {} },
        { ...NODE_TEMPLATES.beam, id: 'node_5', x: 430, y: 230,
          inputs: [{ id: 'line_5', name: 'Line', type: 'input', dataType: 'geometry' }],
          outputs: [{ id: 'beam_5', name: 'Beam', type: 'output', dataType: 'geometry' }],
          data: { profile: 'IPE 200' } },
        { ...NODE_TEMPLATES.support, id: 'node_6', x: 250, y: 80,
          inputs: [{ id: 'point_6', name: 'Point', type: 'input', dataType: 'point' }],
          outputs: [{ id: 'node_6', name: 'Node', type: 'output', dataType: 'any' }],
          data: { type: 'pinned' } },
        { ...NODE_TEMPLATES.support, id: 'node_7', x: 250, y: 380,
          inputs: [{ id: 'point_7', name: 'Point', type: 'input', dataType: 'point' }],
          outputs: [{ id: 'node_7', name: 'Node', type: 'output', dataType: 'any' }],
          data: { type: 'roller' } },
        { ...NODE_TEMPLATES.lineLoad, id: 'node_8', x: 620, y: 180,
          inputs: [
            { id: 'beam_8', name: 'Beam', type: 'input', dataType: 'geometry' },
            { id: 'qy_8', name: 'qy (kN/m)', type: 'input', dataType: 'number' },
          ],
          outputs: [],
          data: { qy: -10 } },
        { ...NODE_TEMPLATES.solve, id: 'node_9', x: 620, y: 300,
          inputs: [],
          outputs: [{ id: 'result_9', name: 'Result', type: 'output', dataType: 'any' }],
          data: { status: 'ready' } },
        { ...NODE_TEMPLATES.maxDisp, id: 'node_10', x: 800, y: 250,
          inputs: [{ id: 'result_10', name: 'Result', type: 'input', dataType: 'any' }],
          outputs: [{ id: 'value_10', name: 'mm', type: 'output', dataType: 'number' }],
          data: { value: null } },
        { ...NODE_TEMPLATES.maxMoment, id: 'node_11', x: 800, y: 350,
          inputs: [{ id: 'result_11', name: 'Result', type: 'input', dataType: 'any' }],
          outputs: [{ id: 'value_11', name: 'kNm', type: 'output', dataType: 'number' }],
          data: { value: null } },
      ];

      const demoWires: Wire[] = [
        { id: 'wire_1', fromNode: 'node_1', fromPort: 'out_1', toNode: 'node_3', toPort: 'x_3' },
        { id: 'wire_2', fromNode: 'node_2', fromPort: 'pt_2', toNode: 'node_4', toPort: 'start_4' },
        { id: 'wire_3', fromNode: 'node_3', fromPort: 'pt_3', toNode: 'node_4', toPort: 'end_4' },
        { id: 'wire_4', fromNode: 'node_4', fromPort: 'line_4', toNode: 'node_5', toPort: 'line_5' },
        { id: 'wire_5', fromNode: 'node_2', fromPort: 'pt_2', toNode: 'node_6', toPort: 'point_6' },
        { id: 'wire_6', fromNode: 'node_3', fromPort: 'pt_3', toNode: 'node_7', toPort: 'point_7' },
        { id: 'wire_7', fromNode: 'node_5', fromPort: 'beam_5', toNode: 'node_8', toPort: 'beam_8' },
        { id: 'wire_8', fromNode: 'node_9', fromPort: 'result_9', toNode: 'node_10', toPort: 'result_10' },
        { id: 'wire_9', fromNode: 'node_9', fromPort: 'result_9', toNode: 'node_11', toPort: 'result_11' },
      ];

      setNodes(demoNodes);
      setWires(demoWires);
      nextNodeId = 12;
      nextWireId = 10;
    }
  }, []);

  return (
    <div className="node-editor-panel">
      {/* Toolbar */}
      <div className="node-editor-toolbar">
        <div className="toolbar-group">
          <button onClick={() => setShowPalette(!showPalette)} title="Add Node (Double-click canvas)">
            <Plus size={16} />
          </button>
          <button onClick={() => selectedNode && deleteNode(selectedNode)} disabled={!selectedNode} title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
        <div className="toolbar-group">
          <button
            onClick={executeGraph}
            disabled={executing}
            className={executing ? 'executing' : ''}
            title="Execute Graph (Ctrl+Enter)"
          >
            {executing ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            <span style={{ marginLeft: 4 }}>Run</span>
          </button>
        </div>
        <div className="toolbar-group">
          <button onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button onClick={zoomFit} title="Fit View">
            <Maximize size={16} />
          </button>
        </div>
        {executionError && (
          <div className="execution-error">
            Error: {executionError}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="node-editor-canvas"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onDoubleClick={handleCanvasDoubleClick}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : draggingNode ? 'move' : 'default' }}
      >
        {/* Grid */}
        <svg className="node-editor-grid" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <defs>
            <pattern id="grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--grid-color)" strokeWidth="0.5" />
            </pattern>
            <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#grid-small)" />
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--grid-color)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid-large)" />
        </svg>

        {/* Wires */}
        <svg className="node-editor-wires" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {wires.map(wire => {
            const from = getPortPosition(wire.fromNode, wire.fromPort, true);
            const to = getPortPosition(wire.toNode, wire.toPort, false);
            const dx = Math.abs(to.x - from.x) * 0.5;
            const path = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
            return (
              <path
                key={wire.id}
                d={path}
                className="wire"
                onClick={() => setWires(prev => prev.filter(w => w.id !== wire.id))}
              />
            );
          })}
          {connecting && (
            <path
              d={(() => {
                const from = getPortPosition(connecting.node, connecting.port, connecting.type === 'output');
                const to = mousePos;
                const dx = Math.abs(to.x - from.x) * 0.5;
                if (connecting.type === 'output') {
                  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
                } else {
                  return `M ${to.x} ${to.y} C ${to.x + dx} ${to.y}, ${from.x - dx} ${from.y}, ${from.x} ${from.y}`;
                }
              })()}
              className="wire active"
            />
          )}
        </svg>

        {/* Nodes */}
        <div className="node-editor-nodes" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {nodes.map(node => (
            <div
              key={node.id}
              className={`graph-node ${node.type} ${selectedNode === node.id ? 'selected' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                minHeight: node.height,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            >
              <div className="node-header">
                <span className="node-title">{node.title}</span>
              </div>
              <div className="node-body">
                <div className="node-ports inputs">
                  {node.inputs.map(port => (
                    <div key={port.id} className="port-row">
                      <div
                        className={`port input ${connecting?.node === node.id && connecting?.port === port.id ? 'connecting' : ''}`}
                        onClick={(e) => handlePortClick(e, node.id, port.id, 'input')}
                      />
                      <span className="port-label">{port.name}</span>
                    </div>
                  ))}
                </div>

                <div className="node-content">
                  {node.type === 'number' && (
                    <input
                      type="number"
                      value={node.data.value}
                      onChange={(e) => updateNodeData(node.id, 'value', parseFloat(e.target.value) || 0)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  )}
                  {node.type === 'slider' && (
                    <div className="slider-container">
                      <input
                        type="range"
                        min={node.data.min}
                        max={node.data.max}
                        step={node.data.step}
                        value={node.data.value}
                        onChange={(e) => updateNodeData(node.id, 'value', parseFloat(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <span className="slider-value">{node.data.value}</span>
                    </div>
                  )}
                  {node.type === 'support' && (
                    <select
                      value={node.data.type}
                      onChange={(e) => updateNodeData(node.id, 'type', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <option value="pinned">Pinned</option>
                      <option value="fixed">Fixed</option>
                      <option value="roller">Roller</option>
                    </select>
                  )}
                  {node.type === 'beam' && (
                    <select
                      value={node.data.profile}
                      onChange={(e) => updateNodeData(node.id, 'profile', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {ALL_STEEL_PROFILES.slice(0, 20).map((p: ISteelProfile) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  )}
                  {node.type === 'math' && (
                    <select
                      value={node.data.operation}
                      onChange={(e) => updateNodeData(node.id, 'operation', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <option value="+">Add (+)</option>
                      <option value="-">Subtract (-)</option>
                      <option value="*">Multiply (*)</option>
                      <option value="/">Divide (/)</option>
                    </select>
                  )}
                  {(node.type === 'display' || node.type === 'maxDisp' || node.type === 'maxMoment') && (
                    <div className="display-value">
                      {node.data.value !== null ? String(node.data.value) : '—'}
                    </div>
                  )}
                  {node.type === 'solve' && (
                    <div className={`solve-status ${node.data.status}`}>
                      {node.data.status === 'ready' ? 'Ready' :
                       node.data.status === 'solving' ? 'Solving...' :
                       node.data.status === 'done' ? '✓ Done' : '✗ Error'}
                    </div>
                  )}
                  {node.type === 'python' && (
                    <div className="python-container">
                      <textarea
                        value={node.data.code}
                        onChange={(e) => updateNodeData(node.id, 'code', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="x + y * 2"
                        rows={3}
                        spellCheck={false}
                      />
                      {node.data.error && (
                        <div className="python-error">{node.data.error}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="node-ports outputs">
                  {node.outputs.map(port => (
                    <div key={port.id} className="port-row output">
                      <span className="port-label">{port.name}</span>
                      <div
                        className={`port output ${connecting?.node === node.id && connecting?.port === port.id ? 'connecting' : ''}`}
                        onClick={(e) => handlePortClick(e, node.id, port.id, 'output')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Palette */}
        {showPalette && (
          <div
            className="node-palette"
            style={{
              left: palettePos.x * zoom + pan.x,
              top: palettePos.y * zoom + pan.y,
            }}
          >
            {NODE_CATEGORIES.map(category => (
              <div key={category.name} className="palette-category">
                <div className="palette-category-title">{category.name}</div>
                {category.nodes.map(type => (
                  <button
                    key={type}
                    className="palette-item"
                    onClick={() => addNode(type, palettePos.x, palettePos.y)}
                  >
                    {NODE_TEMPLATES[type].title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="node-editor-status">
        <span>Nodes: {nodes.length}</span>
        <span>Wires: {wires.length}</span>
        {connecting && <span className="connecting-hint">Click a port to connect</span>}
        <span className="hint">Double-click to add | Ctrl+Enter to run | Alt+drag to pan</span>
      </div>
    </div>
  );
};
