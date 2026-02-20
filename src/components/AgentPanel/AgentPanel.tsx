import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, X, Loader2, Mic, MicOff, Trash2,
  Play, BarChart3,
  HelpCircle, Eraser, Building2, Columns, PanelTop, Box, Zap, Wifi, WifiOff
} from 'lucide-react';
import { useFEM, applyLoadCaseToMesh } from '../../context/FEMContext';
import { solve } from '../../core/solver/SolverService';
import { processAgentInput } from '../../core/agent/ModelAgent';
import { DEFAULT_SECTIONS } from '../../core/fem/Beam';
import './AgentPanel.css';

interface AgentPanelProps {
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  details?: string;
  toolCalls?: ToolCallDisplay[];
}

interface ToolCallDisplay {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}

// Types for the Claude CLI backend responses
interface ApiCommand {
  tool: string;
  args: Record<string, unknown>;
}

interface ApiChatResponse {
  response: string | null;
  commands: ApiCommand[] | null;
  error: string | null;
}

// Helper to build model state for the API
function buildModelState(state: ReturnType<typeof useFEM>['state']): Record<string, unknown> {
  const nodes = Array.from(state.mesh.nodes.values());
  const beams = Array.from(state.mesh.beamElements.values());
  const plates = Array.from(state.mesh.plateRegions.values());
  const supportedNodes = nodes.filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation);

  return {
    node_count: nodes.length,
    beam_count: beams.length,
    plate_count: plates.length,
    support_count: supportedNodes.length,
    load_case_count: state.loadCases.length,
    is_solved: !!state.result,
    analysis_type: state.analysisType,
    nodes: nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      constraints: n.constraints,
      has_load: n.loads.fx !== 0 || n.loads.fy !== 0 || n.loads.moment !== 0,
    })),
    beams: beams.map(b => ({
      id: b.id,
      node1_id: b.nodeIds[0],
      node2_id: b.nodeIds[1],
      profile: b.profileName,
      has_distributed_load: !!b.distributedLoad,
      end_releases: b.endReleases,
      start_connection: b.startConnection,
      end_connection: b.endConnection,
    })),
    load_cases: state.loadCases.map(lc => ({
      id: lc.id,
      name: lc.name,
      type: lc.type,
      point_loads: lc.pointLoads.length,
      distributed_loads: lc.distributedLoads.length,
    })),
  };
}

// Execute a single tool command on the mesh
function executeToolCommand(
  command: ApiCommand,
  state: ReturnType<typeof useFEM>['state'],
  dispatch: ReturnType<typeof useFEM>['dispatch'],
): Record<string, unknown> {
  const { tool, args } = command;

  switch (tool) {
    case 'get_model_info': {
      const modelState = buildModelState(state);
      return { success: true, ...modelState };
    }

    case 'add_node': {
      const x = args.x as number;
      const y = args.y as number;
      const node = state.mesh.addNode(x, y);
      dispatch({ type: 'REFRESH_MESH' });
      return { success: true, node_id: node.id, x: node.x, y: node.y };
    }

    case 'add_beam': {
      const node1Id = args.node1_id as number;
      const node2Id = args.node2_id as number;
      const profileName = (args.profile_name as string) || 'IPE 200';

      // Find the section data
      const normalizedName = profileName.toUpperCase().replace(/\s+/g, ' ').trim();
      let section = DEFAULT_SECTIONS.find(s => s.name.toUpperCase() === normalizedName);
      if (!section) {
        // Try without space
        const noSpace = normalizedName.replace(/\s+/g, '');
        section = DEFAULT_SECTIONS.find(s => s.name.toUpperCase().replace(/\s+/g, '') === noSpace);
      }
      if (!section) {
        section = DEFAULT_SECTIONS.find(s => s.name === 'IPE 200');
      }
      if (!section) {
        return { success: false, error: 'Could not find section data' };
      }

      const beam = state.mesh.addBeamElement(
        [node1Id, node2Id],
        1,
        { ...section.section },
        section.name,
      );
      if (!beam) {
        return { success: false, error: 'Failed to add beam element. Check that both nodes exist.' };
      }
      dispatch({ type: 'SET_MESH', payload: state.mesh });
      dispatch({ type: 'REFRESH_MESH' });
      dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
      return { success: true, beam_id: beam.id, node1_id: node1Id, node2_id: node2Id, profile: section.name };
    }

    case 'add_support': {
      const nodeId = args.node_id as number;
      const supportType = args.type as string;

      let constraints: { x: boolean; y: boolean; rotation: boolean };
      switch (supportType) {
        case 'pinned':
          constraints = { x: true, y: true, rotation: false };
          break;
        case 'roller':
          constraints = { x: false, y: true, rotation: false };
          break;
        case 'fixed':
          constraints = { x: true, y: true, rotation: true };
          break;
        case 'roller_x':
          constraints = { x: true, y: false, rotation: false };
          break;
        default:
          return { success: false, error: `Unknown support type: ${supportType}` };
      }

      state.mesh.updateNode(nodeId, { constraints });
      dispatch({ type: 'REFRESH_MESH' });
      return { success: true, node_id: nodeId, type: supportType };
    }

    case 'add_distributed_load': {
      const beamId = args.beam_id as number;
      const qyStart = args.qy_start as number;
      const qyEnd = (args.qy_end as number) ?? qyStart;
      const qxStart = (args.qx_start as number) ?? 0;
      const startT = args.start_t as number | undefined;
      const endT = args.end_t as number | undefined;
      const lcId = (args.load_case_id as number) ?? state.loadCases[0]?.id ?? 1;
      const coordSystem = (args.coord_system as 'local' | 'global') ?? 'global';

      dispatch({
        type: 'ADD_DISTRIBUTED_LOAD',
        payload: {
          lcId,
          beamId,
          qx: qxStart,
          qy: qyStart,
          qyEnd,
          startT,
          endT,
          coordSystem,
        },
      });
      return { success: true, beam_id: beamId, qy_start: qyStart, qy_end: qyEnd, load_case_id: lcId };
    }

    case 'add_point_load': {
      const nodeId = args.node_id as number;
      const fx = (args.fx as number) ?? 0;
      const fy = (args.fy as number) ?? 0;
      const mz = (args.mz as number) ?? 0;
      const lcId = (args.load_case_id as number) ?? state.loadCases[0]?.id ?? 1;

      dispatch({
        type: 'ADD_POINT_LOAD',
        payload: { lcId, nodeId, fx, fy, mz },
      });
      return { success: true, node_id: nodeId, fx, fy, mz, load_case_id: lcId };
    }

    case 'set_profile': {
      const beamId = args.beam_id as number;
      const profileName = args.profile_name as string;

      const normalizedName = profileName.toUpperCase().replace(/\s+/g, ' ').trim();
      let section = DEFAULT_SECTIONS.find(s => s.name.toUpperCase() === normalizedName);
      if (!section) {
        const noSpace = normalizedName.replace(/\s+/g, '');
        section = DEFAULT_SECTIONS.find(s => s.name.toUpperCase().replace(/\s+/g, '') === noSpace);
      }
      if (!section) {
        return { success: false, error: `Profile ${profileName} not found` };
      }

      state.mesh.updateBeamElement(beamId, {
        section: { ...section.section },
        profileName: section.name,
      });
      dispatch({ type: 'REFRESH_MESH' });
      return { success: true, beam_id: beamId, profile: section.name };
    }

    case 'set_end_releases': {
      const beamId = args.beam_id as number;
      const startMoment = (args.start_moment_released as boolean) ?? false;
      const endMoment = (args.end_moment_released as boolean) ?? false;

      state.mesh.updateBeamElement(beamId, {
        endReleases: { startMoment, endMoment },
      });
      dispatch({ type: 'REFRESH_MESH' });
      return { success: true, beam_id: beamId, start_released: startMoment, end_released: endMoment };
    }

    case 'run_analysis': {
      // This is handled asynchronously - return a placeholder
      return { success: true, message: 'Analysis will be run asynchronously' };
    }

    case 'get_results': {
      if (!state.result) {
        return { success: false, error: 'No analysis results available. Run analysis first.' };
      }
      const beamId = args.beam_id as number | undefined;
      if (beamId !== undefined) {
        const bf = state.result.beamForces.get(beamId);
        if (!bf) {
          return { success: false, error: `No results for beam ${beamId}` };
        }
        return {
          success: true,
          beam_id: beamId,
          max_moment_kNm: (bf.maxM / 1000).toFixed(2),
          max_shear_kN: (bf.maxV / 1000).toFixed(2),
          max_normal_kN: (bf.maxN / 1000).toFixed(2),
        };
      }
      // Global summary
      let maxM = 0, maxV = 0, maxN = 0;
      for (const bf of state.result.beamForces.values()) {
        maxM = Math.max(maxM, Math.abs(bf.maxM));
        maxV = Math.max(maxV, Math.abs(bf.maxV));
        maxN = Math.max(maxN, Math.abs(bf.maxN));
      }
      return {
        success: true,
        max_moment_kNm: (maxM / 1000).toFixed(2),
        max_shear_kN: (maxV / 1000).toFixed(2),
        max_normal_kN: (maxN / 1000).toFixed(2),
        num_beams_with_results: state.result.beamForces.size,
      };
    }

    case 'optimize_profile': {
      // This is handled asynchronously - return a placeholder
      return { success: true, message: 'Optimization will be run asynchronously' };
    }

    case 'clear_model': {
      dispatch({ type: 'PUSH_UNDO' });
      state.mesh.clear();
      dispatch({ type: 'SET_MESH', payload: state.mesh });
      dispatch({ type: 'REFRESH_MESH' });
      dispatch({
        type: 'SET_LOAD_CASES',
        payload: [
          {
            id: 1, name: 'Dead Load (G)', type: 'dead' as const,
            pointLoads: [], distributedLoads: [], edgeLoads: [], thermalLoads: [],
            color: '#6b7280',
          },
          {
            id: 2, name: 'Live Load (Q)', type: 'live' as const,
            pointLoads: [], distributedLoads: [], edgeLoads: [], thermalLoads: [],
            color: '#3b82f6',
          },
        ],
      });
      return { success: true, message: 'Model cleared' };
    }

    case 'add_load_case': {
      const name = args.name as string;
      const lcType = (args.type as string) ?? 'other';
      const maxId = Math.max(...state.loadCases.map(lc => lc.id), 0);
      const newLc = {
        id: maxId + 1,
        name,
        type: lcType as 'dead' | 'live' | 'wind' | 'snow' | 'other',
        pointLoads: [] as { nodeId: number; fx: number; fy: number; mz: number }[],
        distributedLoads: [] as { id: number; elementId: number; qx: number; qy: number; qxEnd?: number; qyEnd?: number; startT?: number; endT?: number; coordSystem?: 'local' | 'global'; description?: string }[],
        edgeLoads: [] as { plateId: number; edge: 'top' | 'bottom' | 'left' | 'right' | number; px: number; py: number }[],
        thermalLoads: [] as { elementId: number; plateId?: number; deltaT: number }[],
        color: '#9333ea',
      };
      dispatch({ type: 'SET_LOAD_CASES', payload: [...state.loadCases, newLc] });
      return { success: true, load_case_id: newLc.id, name };
    }

    case 'create_structure': {
      // Delegate to the existing regex-based ModelAgent for structure creation
      const structType = args.type as string;
      const span = args.span as number;
      const height = args.height as number | undefined;
      const profile = args.profile as string | undefined;
      const numPanels = args.num_panels as number | undefined;
      const numSpans = args.num_spans as number | undefined;
      const loadQy = args.load_qy as number | undefined;
      const pointLoad = args.point_load as number | undefined;

      // Map to regex agent command string
      let cmd = '';
      switch (structType) {
        case 'simply_supported':
          cmd = `Create a simply supported beam ${span}m`;
          break;
        case 'cantilever':
          cmd = `Create a cantilever beam ${span}m`;
          break;
        case 'portal_frame':
          cmd = `Create a portal frame ${span}m wide ${height ?? (span * 0.6)}m high`;
          break;
        case 'truss':
          cmd = `Create a truss ${span}m span ${height ?? Math.max(1, span / 6)}m high${numPanels ? ` ${numPanels} panels` : ''}`;
          break;
        case 'continuous_beam':
          cmd = `Create a continuous beam ${span}m ${numSpans ?? 3} spans`;
          break;
        default:
          return { success: false, error: `Unknown structure type: ${structType}` };
      }

      if (profile) cmd += ` profile ${profile}`;
      if (loadQy) cmd += ` with ${loadQy} kN/m`;
      else if (pointLoad) cmd += ` with point load ${pointLoad} kN`;

      const result = processAgentInput(cmd, state.mesh, dispatch, state.loadCases);
      return {
        success: result.success,
        message: result.message,
        node_count: result.nodeCount,
        element_count: result.elementCount,
      };
    }

    case 'delete_element': {
      const elementType = args.element_type as string;
      const id = args.id as number;

      switch (elementType) {
        case 'beam':
          if (state.mesh.beamElements.has(id)) {
            state.mesh.beamElements.delete(id);
            dispatch({ type: 'REFRESH_MESH' });
            return { success: true, deleted: 'beam', id };
          }
          return { success: false, error: `Beam ${id} not found` };
        case 'node':
          if (state.mesh.removeNode(id)) {
            dispatch({ type: 'REFRESH_MESH' });
            return { success: true, deleted: 'node', id };
          }
          return { success: false, error: `Node ${id} not found` };
        case 'distributed_load': {
          for (const lc of state.loadCases) {
            const loadIdx = lc.distributedLoads.findIndex(dl => dl.id === id);
            if (loadIdx >= 0) {
              dispatch({ type: 'REMOVE_DISTRIBUTED_LOAD', payload: { lcId: lc.id, loadId: id } });
              return { success: true, deleted: 'distributed_load', id };
            }
          }
          return { success: false, error: `Distributed load ${id} not found` };
        }
        case 'point_load': {
          for (const lc of state.loadCases) {
            const pl = lc.pointLoads.find(p => p.nodeId === id);
            if (pl) {
              dispatch({ type: 'REMOVE_POINT_LOAD', payload: { lcId: lc.id, nodeId: id } });
              return { success: true, deleted: 'point_load', node_id: id };
            }
          }
          return { success: false, error: `Point load on node ${id} not found` };
        }
        default:
          return { success: false, error: `Unknown element type: ${elementType}` };
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${tool}` };
  }
}


export function AgentPanel({ onClose }: AgentPanelProps) {
  const { state, dispatch } = useFEM();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'I am a structural engineering AI assistant powered by Claude. I can create and analyze 2D structural models. Try "Create a portal frame 6m wide 4m high with 10 kN/m" or use the quick-create buttons below.',
  }]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Thinking...');
  const [isListening, setIsListening] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Check backend availability on mount
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setBackendAvailable(data.status === 'ok' && data.claude_cli === true);
      })
      .catch(() => {
        setBackendAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  const getModelSummary = () => {
    const nodes = Array.from(state.mesh.nodes.values());
    const beams = Array.from(state.mesh.beamElements.values());
    const plates = Array.from(state.mesh.plateRegions.values());
    const supportedNodes = nodes.filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation);
    return {
      nodes: nodes.length,
      beams: beams.length,
      plates: plates.length,
      elements: Array.from(state.mesh.elements.values()).length,
      supports: supportedNodes.length,
      loadCases: state.loadCases.length,
    };
  };

  const toggleListening = useCallback(() => {
    if (isListening) {
      (recognitionRef.current as { stop: () => void } | null)?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, { role: 'system', content: 'Speech recognition is not supported in this browser.' }]);
      return;
    }

    const SpeechRecClass = SpeechRecognition as new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (event: { results: { length: number; [key: number]: { [key: number]: { transcript: string } } } }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    const recognition = new SpeechRecClass();
    recognition.lang = 'nl-NL';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Run analysis helper
  const runAnalysis = async (): Promise<Record<string, unknown>> => {
    try {
      const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
      if (activeLc) {
        applyLoadCaseToMesh(state.mesh, activeLc);
      }
      const result = await solve(state.mesh, {
        analysisType: state.analysisType,
        geometricNonlinear: false,
      });
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
      if (state.analysisType === 'frame') {
        dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
      }

      // Build summary
      let maxM = 0, maxV = 0, maxN = 0;
      for (const bf of result.beamForces.values()) {
        maxM = Math.max(maxM, Math.abs(bf.maxM));
        maxV = Math.max(maxV, Math.abs(bf.maxV));
        maxN = Math.max(maxN, Math.abs(bf.maxN));
      }
      return {
        success: true,
        max_moment_kNm: (maxM / 1000).toFixed(2),
        max_shear_kN: (maxV / 1000).toFixed(2),
        max_normal_kN: (maxN / 1000).toFixed(2),
        num_beams: result.beamForces.size,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  };

  // Send message via Claude CLI virtual terminal (single call)
  const handleSendClaude = async (msg: string) => {
    setLoadingMessage('Claude is thinking...');

    try {
      const modelState = buildModelState(state);

      // Build conversation history for context
      const history = [
        ...chatHistory,
        { role: 'user', content: msg },
      ];

      // Single API call to Claude CLI backend
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          model_state: modelState,
          conversation_history: history.slice(-10), // Keep last 10 turns
        }),
      });

      if (!resp.ok) {
        throw new Error(`API error: ${resp.status}`);
      }

      const data: ApiChatResponse = await resp.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const allToolCalls: ToolCallDisplay[] = [];
      const finalResponse = data.response || '';

      // Execute commands returned by Claude
      if (data.commands && data.commands.length > 0) {
        dispatch({ type: 'PUSH_UNDO' });
        setLoadingMessage(`Executing ${data.commands.length} command(s)...`);

        for (const cmd of data.commands) {
          let result: Record<string, unknown>;

          if (cmd.tool === 'run_analysis') {
            setLoadingMessage('Running analysis...');
            result = await runAnalysis();
          } else {
            result = executeToolCommand(cmd, state, dispatch);
          }

          allToolCalls.push({
            tool: cmd.tool,
            args: cmd.args as Record<string, unknown>,
            result: JSON.stringify(result, null, 2),
          });
        }
      }

      // Update conversation history (keep for context in next messages)
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: finalResponse || 'Done.' },
      ].slice(-20)); // Keep last 20 entries

      // Build details string
      let details: string | undefined;
      if (allToolCalls.length > 0) {
        details = allToolCalls.map(tc =>
          `[${tc.tool}] ${JSON.stringify(tc.args)}\n  -> ${tc.result}`
        ).join('\n\n');
      }

      // Add response message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalResponse || 'Done.',
        details,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      }]);

      // Set view mode to geometry if we just built something
      if (allToolCalls.some(tc => ['add_node', 'add_beam', 'create_structure', 'clear_model'].includes(tc.tool))) {
        dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });
      }

    } catch (e) {
      throw e;
    }
  };

  // Fallback to regex-based ModelAgent
  const handleSendFallback = async (msg: string) => {
    setLoadingMessage('Creating model...');

    const result = processAgentInput(msg, state.mesh, dispatch, state.loadCases);

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: result.message,
      details: result.details,
    }]);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    await new Promise(r => setTimeout(r, 50));

    try {
      if (backendAvailable) {
        await handleSendClaude(msg);
      } else {
        await handleSendFallback(msg);
      }
    } catch (e) {
      // If Claude API fails, try fallback
      if (backendAvailable) {
        console.warn('Claude API failed, trying fallback:', e);
        try {
          await handleSendFallback(msg);
          setMessages(prev => [...prev, {
            role: 'system',
            content: `(Used offline mode - API error: ${(e as Error).message})`,
          }]);
        } catch (e2) {
          setMessages(prev => [...prev, {
            role: 'system',
            content: `Error: ${(e2 as Error).message}`,
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Error: ${(e as Error).message}`,
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const executeQuickCommand = async (command: string) => {
    setMessages(prev => [...prev, { role: 'user', content: command }]);
    setLoading(true);
    setLoadingMessage('Creating model...');
    await new Promise(r => setTimeout(r, 50));

    try {
      if (backendAvailable) {
        await handleSendClaude(command);
      } else {
        await handleSendFallback(command);
      }
    } catch (e) {
      // Fallback to regex on API failure
      try {
        await handleSendFallback(command);
      } catch (e2) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Error: ${(e2 as Error).message}`,
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setExpandedDetails(new Set());
    setChatHistory([]);
  };

  const handleQuickSolve = async () => {
    setMessages(prev => [...prev, { role: 'system', content: 'Running analysis...' }]);
    try {
      const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
      if (activeLc) {
        applyLoadCaseToMesh(state.mesh, activeLc);
      }
      const result = await solve(state.mesh, {
        analysisType: state.analysisType,
        geometricNonlinear: false,
      });
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
      if (state.analysisType === 'frame') {
        dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
      }

      let resultSummary = 'Analysis completed successfully.';
      if (result.beamForces.size > 0) {
        let maxM = 0, maxV = 0, maxN = 0;
        for (const bf of result.beamForces.values()) {
          maxM = Math.max(maxM, Math.abs(bf.maxM));
          maxV = Math.max(maxV, Math.abs(bf.maxV));
          maxN = Math.max(maxN, Math.abs(bf.maxN));
        }
        resultSummary += `\n\nMax values:\n  M = ${(maxM / 1000).toFixed(2)} kNm\n  V = ${(maxV / 1000).toFixed(2)} kN\n  N = ${(maxN / 1000).toFixed(2)} kN`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: resultSummary }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'system', content: `Solver error: ${(e as Error).message}` }]);
    }
  };

  const handleQuickShowResults = () => {
    if (!state.result) {
      setMessages(prev => [...prev, { role: 'system', content: 'No results available. Run analysis first.' }]);
      return;
    }
    dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
    dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
    if (state.analysisType === 'frame') {
      dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
    }
    setMessages(prev => [...prev, { role: 'system', content: 'Switched to results view.' }]);
  };

  const toggleDetails = (index: number) => {
    setExpandedDetails(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const summary = getModelSummary();

  return (
    <div className="agent-panel">
      <div className="agent-panel-header">
        <span>AI Model Agent</span>
        <div className="agent-header-actions">
          <span className={`agent-connection-indicator ${backendAvailable ? 'connected' : 'offline'}`} title={backendAvailable ? 'Connected to Claude API' : 'Offline mode (regex fallback)'}>
            {backendAvailable ? <Wifi size={10} /> : <WifiOff size={10} />}
          </span>
          {messages.length > 0 && (
            <button
              className="agent-clear-btn"
              onClick={handleClearChat}
              title="Clear chat"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button className="agent-panel-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Backend status notice */}
      {backendAvailable === false && (
        <div className="agent-backend-notice">
          Offline mode: using regex parser. Start the backend for Claude AI integration.
        </div>
      )}

      {/* Context Section */}
      <div className="agent-context">
        <div className="agent-context-title">Model Context</div>
        <div className="agent-context-grid">
          <div className="agent-context-item">
            <span className="agent-context-value">{summary.nodes}</span>
            <span className="agent-context-label">Nodes</span>
          </div>
          <div className="agent-context-item">
            <span className="agent-context-value">{summary.beams}</span>
            <span className="agent-context-label">Beams</span>
          </div>
          <div className="agent-context-item">
            <span className="agent-context-value">{summary.plates}</span>
            <span className="agent-context-label">Plates</span>
          </div>
          <div className="agent-context-item">
            <span className="agent-context-value">{summary.loadCases}</span>
            <span className="agent-context-label">Load Cases</span>
          </div>
        </div>
        <div className="agent-context-status">
          <span className={`agent-status-dot ${state.result ? 'solved' : 'unsolved'}`} />
          <span>{state.result ? 'Solved' : 'Not solved'}</span>
          <span className="agent-context-sep">|</span>
          <span>{state.analysisType.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Quick Create Structures */}
      <div className="agent-quick-actions">
        <div className="agent-quick-title">Quick Create</div>
        <div className="agent-quick-buttons">
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('Create a simply supported beam 6m with 10 kN/m')}
            title="Simply supported beam 6m with 10 kN/m"
          >
            <Columns size={12} />
            <span>Beam 6m</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('Create a cantilever beam 3m with point load 10 kN at tip')}
            title="Cantilever 3m with 10 kN at tip"
          >
            <PanelTop size={12} />
            <span>Cantilever 3m</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('Create a portal frame 6m wide 4m high with 10 kN/m')}
            title="Portal frame 6m x 4m with 10 kN/m"
          >
            <Building2 size={12} />
            <span>Portal 6x4m</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('Create a truss 12m span 2m high with 5 kN/m')}
            title="Truss 12m x 2m with 5 kN/m"
          >
            <Box size={12} />
            <span>Truss 12m</span>
          </button>
        </div>
      </div>

      {/* Tool Shortcuts */}
      <div className="agent-quick-actions agent-tool-actions">
        <div className="agent-quick-title">Actions</div>
        <div className="agent-quick-buttons">
          <button className="agent-quick-btn" onClick={handleQuickSolve} title="Run analysis">
            <Play size={12} />
            <span>Solve</span>
          </button>
          <button className="agent-quick-btn" onClick={handleQuickShowResults} title="Show results">
            <BarChart3 size={12} />
            <span>Results</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('Optimaliseer op gewicht')}
            title="Optimize profile for minimum weight"
          >
            <Zap size={12} />
            <span>Optimize</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('clear')}
            title="Clear model"
          >
            <Eraser size={12} />
            <span>Clear</span>
          </button>
          <button
            className="agent-quick-btn"
            onClick={() => executeQuickCommand('help')}
            title="Show help"
          >
            <HelpCircle size={12} />
            <span>Help</span>
          </button>
        </div>
      </div>

      {/* Chat body */}
      <div className="agent-panel-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <div className="agent-panel-placeholder">
            <p>AI structural engineering assistant</p>
            <p className="agent-hint">Describe a structure in Dutch or English, and I will build it.</p>
            <p className="agent-hint">{backendAvailable ? 'Connected to Claude AI' : 'Offline mode - type "help" for commands'}</p>
          </div>
        ) : (
          <div className="agent-messages">
            {messages.map((m, i) => (
              <div key={i} className={`agent-msg agent-msg-${m.role}`}>
                <div className="agent-msg-label">
                  {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Claude' : 'System'}
                </div>
                <div className="agent-msg-content">
                  {m.content}
                  {(m.details || m.toolCalls) && (
                    <>
                      <button
                        className="agent-details-toggle"
                        onClick={() => toggleDetails(i)}
                      >
                        {expandedDetails.has(i) ? 'Hide details' : `Show details${m.toolCalls ? ` (${m.toolCalls.length} tools)` : ''}`}
                      </button>
                      {expandedDetails.has(i) && (
                        <div className="agent-msg-details">
                          {m.toolCalls ? (
                            m.toolCalls.map((tc, j) => (
                              <div key={j} className="agent-tool-call">
                                <div className="agent-tool-name">{tc.tool}</div>
                                <div className="agent-tool-args">{JSON.stringify(tc.args, null, 2)}</div>
                                {tc.result && <div className="agent-tool-result">{tc.result}</div>}
                              </div>
                            ))
                          ) : (
                            m.details
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="agent-msg agent-msg-assistant">
                <div className="agent-msg-label">Claude</div>
                <div className="agent-msg-content agent-loading">
                  <Loader2 size={14} className="agent-spinner" /> {loadingMessage}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="agent-panel-input-area">
        <input
          type="text"
          placeholder={backendAvailable ? 'Ask Claude anything about your model...' : 'Describe a structure... (e.g. beam 8m with 15 kN/m)'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim() && !loading) {
              handleSend();
            }
          }}
          disabled={loading}
        />
        <button
          className={`agent-mic-btn ${isListening ? 'active' : ''}`}
          onClick={toggleListening}
          title={isListening ? 'Stop recording' : 'Start speech input'}
        >
          {isListening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button className="agent-send-btn" disabled={!input.trim() || loading} onClick={handleSend}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
