/**
 * Model Agent: Natural language command parser and executor for structural models.
 *
 * Understands Dutch and English commands to create:
 * - Portal frames (ongeschoord/geschoord portaal)
 * - Simply supported beams (ligger / beam)
 * - Cantilever beams (console / cantilever)
 * - Trusses (vakwerk / truss)
 * - Continuous beams (doorlopende ligger / continuous beam)
 * - Multi-story frames (kantoor / office / etages / multi-story)
 * - Concrete walls with openings (betonwand / concrete wall / shear wall)
 * - Pitched roof structures (dakconstructie / pitched roof / zadeldak)
 *
 * Also supports profile optimization commands:
 * - "Optimaliseer op doorbuiging" / "Optimize for deflection"
 * - "Optimaliseer op gewicht" / "Optimize for weight"
 * - "Optimaliseer UC" / "Optimize UC ratio"
 *
 * No external LLM required - uses regex-based pattern matching.
 */

import { Mesh } from '../fem/Mesh';
import { IBeamSection } from '../fem/types';
import { ILoadCase } from '../fem/LoadCase';
import { DEFAULT_SECTIONS } from '../fem/Beam';
import {
  optimizeProfile,
  OptimizationCriterion,
  OptimizationConstraint,
} from './ProfileOptimizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StructureType = 'portal' | 'beam' | 'cantilever' | 'truss' | 'continuous_beam' | 'multi_story_frame' | 'concrete_wall' | 'pitched_roof';

export interface AgentCommand {
  type: StructureType;
  params: {
    span?: number;         // meters
    height?: number;       // meters (for portals, trusses)
    load?: number;         // kN/m (distributed) or kN (point)
    loadType?: 'distributed' | 'point';
    spans?: number[];      // for continuous beams, multiple spans
    numSpans?: number;     // number of spans for continuous beams
    profile?: string;      // section profile name
    braced?: boolean;      // for portal frames
    numPanels?: number;    // for trusses
    pointLoadPosition?: number; // fractional position for point loads (0-1)
    // Multi-story frame parameters
    numStories?: number;   // number of stories
    storyHeight?: number;  // height per story (m)
    numBays?: number;      // number of bays
    bayWidth?: number;     // width per bay (m)
    // Concrete wall parameters
    numOpenings?: number;  // number of openings in wall
    openingWidth?: number; // width of each opening (m)
    openingHeight?: number; // height of each opening (m)
    thickness?: number;    // wall thickness (m)
    width?: number;        // total wall width (m)
    // Pitched roof parameters
    eaveHeight?: number;   // height at eaves (m)
  };
}

export interface AgentResult {
  success: boolean;
  message: string;
  details?: string;
  nodeCount?: number;
  elementCount?: number;
}

// Optimization command types
export interface OptimizeAgentCommand {
  criterion: OptimizationCriterion;
  beamId?: number;
  constraints?: OptimizationConstraint;
}

/**
 * Type for the apply-load-case function the agent needs.
 * This decouples the agent from the FEMContext module.
 */
export type ApplyLoadCaseFn = (mesh: Mesh, lc: ILoadCase) => void;

// ---------------------------------------------------------------------------
// Section lookup helper
// ---------------------------------------------------------------------------

function findSection(name?: string): { section: IBeamSection; profileName: string } {
  if (name) {
    const upper = name.toUpperCase().replace(/\s+/g, ' ').trim();
    for (const s of DEFAULT_SECTIONS) {
      if (s.name.toUpperCase() === upper) {
        return { section: { ...s.section }, profileName: s.name };
      }
    }
    // Fuzzy match: check if input is contained or contains the section name
    for (const s of DEFAULT_SECTIONS) {
      if (s.name.toUpperCase().includes(upper) || upper.includes(s.name.toUpperCase())) {
        return { section: { ...s.section }, profileName: s.name };
      }
    }
  }
  // Default to IPE 200
  const def = DEFAULT_SECTIONS.find(s => s.name === 'IPE 200')!;
  return { section: { ...def.section }, profileName: 'IPE 200' };
}

// ---------------------------------------------------------------------------
// Number extraction helpers
// ---------------------------------------------------------------------------

/** Extract a number that may use comma as decimal separator */
function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

/**
 * Extract the first number after a keyword pattern.
 * Handles both "6m", "6 m", "6.5m", "6,5 m" forms.
 */
function extractNumber(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  // Find the capture group that has a number
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) {
      return parseNum(m[i]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Optimization Command Parser
// ---------------------------------------------------------------------------

/**
 * Parse an optimization command from natural language (Dutch + English).
 * Returns null if the input is not an optimization command.
 */
export function parseOptimizeCommand(input: string): OptimizeAgentCommand | null {
  const text = input.toLowerCase().trim();

  // Must contain "optimaliseer" / "optimize" / "optimaal" / "optimal" / "best" / "beste"
  if (!/optimali[sz]e|optimaal|optimal|beste?\b|minimali[sz]e|minimaliseer|lichtste|lightest/.test(text)) {
    return null;
  }

  // Determine criterion
  let criterion: OptimizationCriterion = 'weight'; // default

  // Deflection: doorbuiging, vervorming, deflection, deformation
  if (/doorbuiging|vervorming|deflect|deformation|stijf|stiff|rigidity/.test(text)) {
    criterion = 'deflection';
  }
  // Weight: gewicht, weight, licht, light, massa, mass
  else if (/gewicht|weight|licht|light|massa|mass|kosten|cost/.test(text)) {
    criterion = 'weight';
  }
  // UC ratio: unity check, uc, utilization, bezettingsgraad, benutting
  else if (/unity\s*check|uc\s*ratio|uc\b|utiliz|bezetting|benutting/.test(text)) {
    criterion = 'UC';
  }
  // Stress: spanning, stress
  else if (/spanning|stress|sigma/.test(text)) {
    criterion = 'stress';
  }

  // Parse constraints
  const constraints: OptimizationConstraint = {};

  // Series filter: "IPE", "HEA", "HEB", "HEM"
  const seriesMatch = text.match(/\b(ipe|hea|heb|hem|rhs|chs|shs|unp)\b/i);
  if (seriesMatch) {
    constraints.series = seriesMatch[1].toUpperCase();
  }

  // Steel grade: "S235", "S355"
  const gradeMatch = text.match(/\b(s\s*(?:235|275|355|420|460))\b/i);
  if (gradeMatch) {
    constraints.steelGrade = gradeMatch[1].replace(/\s/g, '').toUpperCase();
  }

  // Max UC: "UC max 0.8", "UC < 0.9"
  const ucMatch = text.match(/uc\s*(?:max|<|<=|limit)?\s*(\d+[.,]?\d*)/);
  if (ucMatch) {
    constraints.maxUC = parseFloat(ucMatch[1].replace(',', '.'));
  }

  // Max deflection in mm: "max doorbuiging 10mm", "deflection limit 15 mm"
  const deflMatch = text.match(/(?:max\s*)?(?:doorbuiging|deflect\w*)\s*(?:max|limit|<|<=)?\s*(\d+[.,]?\d*)\s*mm/);
  if (deflMatch) {
    constraints.maxDeflectionMm = parseFloat(deflMatch[1].replace(',', '.'));
  }

  // Deflection limit divisor: "L/300", "L/500"
  const limMatch = text.match(/l\s*\/\s*(\d+)/);
  if (limMatch) {
    constraints.deflectionLimitDivisor = parseInt(limMatch[1]);
  }

  // Beam ID: "beam 3", "staaf 5", "element 2"
  let beamId: number | undefined;
  const beamIdMatch = text.match(/(?:beam|staaf|element|balk|ligger)\s*(?:nr\.?\s*)?(\d+)/);
  if (beamIdMatch) {
    beamId = parseInt(beamIdMatch[1]);
  }

  return { criterion, beamId, constraints };
}

// ---------------------------------------------------------------------------
// Command Parser
// ---------------------------------------------------------------------------

export function parseCommand(input: string): AgentCommand | null {
  const text = input.toLowerCase().trim();

  // Detect structure type
  let type: StructureType | null = null;

  // Multi-story frame detection (NL + EN) - must check before portal
  if (/multi[\s-]?stor(?:y|ey)|meervoudig\s*frame|kantoor|office|etages|stories|verdieping/.test(text)) {
    type = 'multi_story_frame';
  }
  // Concrete wall detection (NL + EN)
  else if (/betonwand|betonmuur|concrete\s*wall|shear\s*wall|wand\s*met\s*sparingen/.test(text)) {
    type = 'concrete_wall';
  }
  // Pitched roof detection (NL + EN)
  else if (/dakconstructie|pitched\s*roof|zadeldak|roof\s*structure|dak\b/.test(text)) {
    type = 'pitched_roof';
  }
  // Portal frame detection (NL + EN)
  else if (/portaal|portal\s*frame|portal/.test(text)) {
    type = 'portal';
  }
  // Cantilever detection (NL + EN) - must check before 'beam'
  else if (/console|cantilever|inklemming|ingeklem/.test(text)) {
    type = 'cantilever';
  }
  // Truss detection (NL + EN)
  else if (/vakwerk|truss|spant/.test(text)) {
    type = 'truss';
  }
  // Continuous beam detection (NL + EN)
  else if (/doorlopend|continuous|meervoudig|multi[\s-]?span/.test(text)) {
    type = 'continuous_beam';
  }
  // Simple beam detection (NL + EN) - general fallback for beam-like terms
  else if (/ligger|beam|balk|staaf|girder|simply\s*supported/.test(text)) {
    type = 'beam';
  }

  if (!type) return null;

  // Extract parameters
  const params: AgentCommand['params'] = {};

  // ------ Span / width ------
  // "6m breed", "6 m wide", "span 8m", "overspanning 12m", "van 5m", "of 5m"
  const spanPatterns = [
    /(\d+[.,]?\d*)\s*m?\s*(?:breed|wide|width)/,
    /(?:span|overspanning|lengte|length)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/,
    /(\d+[.,]?\d*)\s*m\b/,                     // fallback: first "Nm" token
  ];
  for (const pat of spanPatterns) {
    const v = extractNumber(text, pat);
    if (v !== null) { params.span = v; break; }
  }

  // ------ Height ------
  const heightPatterns = [
    /(\d+[.,]?\d*)\s*m?\s*(?:hoog|high|height|hoogte)/,
    /(?:hoogte|height|hoog|high)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/,
  ];
  for (const pat of heightPatterns) {
    const v = extractNumber(text, pat);
    if (v !== null) { params.height = v; break; }
  }

  // For trusses, try to get height from a second dimension if not already found
  if (type === 'truss' && !params.height) {
    // Pattern: "12m ... en 2m hoog" or "12m x 2m"
    const trussHeight = text.match(/(?:en|and|x|bij)\s*(\d+[.,]?\d*)\s*m/);
    if (trussHeight) {
      params.height = parseNum(trussHeight[1]);
    } else {
      // Default truss height = span / 6
      if (params.span) params.height = Math.max(1, params.span / 6);
    }
  }

  // For portal frames default height
  if (type === 'portal' && !params.height) {
    params.height = params.span ? Math.max(3, params.span * 0.6) : 4;
  }

  // ------ Load ------
  // Distributed load: "10 kN/m", "lijnlast van 10 kN/m", "UDL 15 kN/m"
  const distLoadPattern = /(\d+[.,]?\d*)\s*kn\s*\/\s*m/;
  const distMatch = text.match(distLoadPattern);
  if (distMatch) {
    params.load = parseNum(distMatch[1]);
    params.loadType = 'distributed';
  }

  // Point load: "20 kN" (without /m), "puntlast 20 kN", "point load 20 kN"
  if (!params.load) {
    const ptLoadPattern = /(?:puntlast|point\s*load|kracht|force)?\s*(?:van|of)?\s*(\d+[.,]?\d*)\s*kn(?!\s*\/)/;
    const ptMatch = text.match(ptLoadPattern);
    if (ptMatch) {
      params.load = parseNum(ptMatch[1]);
      params.loadType = 'point';
    }
  }

  // Detect load position hints
  if (/tip|uiteinde|punt|end|vrij|free/.test(text)) {
    params.pointLoadPosition = 1.0;
  } else if (/midden|middle|mid|center|centre/.test(text)) {
    params.pointLoadPosition = 0.5;
  }

  // ------ Profile ------
  const profilePattern = /(?:profiel|profile|section|doorsnede)?\s*((?:ipe|hea|heb|tube|rectangle)\s*\d+(?:\s*x?\s*\d+)?)/i;
  const profMatch = input.match(profilePattern); // use original case for profile
  if (profMatch) {
    params.profile = profMatch[1].trim();
  }

  // ------ Number of spans (continuous beam) ------
  if (type === 'continuous_beam') {
    const spanCountMatch = text.match(/(\d+)\s*(?:velden|spans|overspanningen|veld)/);
    if (spanCountMatch) {
      params.numSpans = parseInt(spanCountMatch[1]);
    } else {
      params.numSpans = 3; // default
    }
  }

  // ------ Number of panels (truss) ------
  if (type === 'truss') {
    const panelMatch = text.match(/(\d+)\s*(?:panelen|panels|vakken|bays)/);
    if (panelMatch) {
      params.numPanels = parseInt(panelMatch[1]);
    }
  }

  // ------ Braced ------
  if (type === 'portal') {
    params.braced = /geschoord|braced/.test(text) && !/ongeschoord|unbraced/.test(text);
  }

  // ------ Multi-story frame parameters ------
  if (type === 'multi_story_frame') {
    // Number of stories: "3 etages", "5 stories", "4 verdiepingen"
    const storiesMatch = text.match(/(\d+)\s*(?:etages|stories|storeys|verdieping(?:en)?)/);
    if (storiesMatch) {
      params.numStories = parseInt(storiesMatch[1]);
    } else {
      params.numStories = 3;
    }

    // Story height: "verdiepingshoogte 3.5m", "story height 4m"
    const storyHeightMatch = text.match(/(?:verdiepings?\s*hoogte|story\s*height)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/);
    if (storyHeightMatch) {
      params.storyHeight = parseNum(storyHeightMatch[1]);
    } else {
      params.storyHeight = 3.5;
    }

    // Number of bays: "2 traveeën", "3 bays", "2 velden"
    const baysMatch = text.match(/(\d+)\s*(?:travee[ëe]?n?|bays?|velden)/);
    if (baysMatch) {
      params.numBays = parseInt(baysMatch[1]);
    } else {
      params.numBays = 2;
    }

    // Bay width: "travee 6m", "bay width 5m", "6m breed"
    const bayWidthMatch = text.match(/(?:travee\s*(?:breedte)?|bay\s*width)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/);
    if (bayWidthMatch) {
      params.bayWidth = parseNum(bayWidthMatch[1]);
    } else if (params.span) {
      params.bayWidth = params.span;
    } else {
      params.bayWidth = 6;
    }

    // Default height from stories
    if (!params.height) {
      params.height = params.numStories * params.storyHeight;
    }
  }

  // ------ Concrete wall parameters ------
  if (type === 'concrete_wall') {
    // Number of openings: "2 sparingen", "3 openings"
    const openingsMatch = text.match(/(\d+)\s*(?:sparingen|openings?|gaten|openingen)/);
    if (openingsMatch) {
      params.numOpenings = parseInt(openingsMatch[1]);
    } else {
      params.numOpenings = 1;
    }

    // Opening width: "opening breedte 1.5m", "opening width 2m"
    const openingWidthMatch = text.match(/(?:opening\s*(?:breedte|width)|sparing\s*(?:breedte|width))\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/);
    if (openingWidthMatch) {
      params.openingWidth = parseNum(openingWidthMatch[1]);
    } else {
      params.openingWidth = 1.5;
    }

    // Opening height: "opening hoogte 2m", "opening height 2.5m"
    const openingHeightMatch = text.match(/(?:opening\s*(?:hoogte|height)|sparing\s*(?:hoogte|height))\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/);
    if (openingHeightMatch) {
      params.openingHeight = parseNum(openingHeightMatch[1]);
    } else {
      params.openingHeight = 2;
    }

    // Thickness: "dikte 0.3m", "thickness 300mm", "0.3m dik"
    const thicknessMatch = text.match(/(?:dikte|thickness|dik)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*(?:m(?:m)?)?/);
    if (thicknessMatch) {
      let t = parseNum(thicknessMatch[1]);
      // If > 1, assume mm, convert to m
      if (t > 1) t = t / 1000;
      params.thickness = t;
    } else {
      params.thickness = 0.3;
    }

    // Wall width: use span if given, default 6m
    if (params.span) {
      params.width = params.span;
    } else {
      params.width = 6;
    }

    // Wall height: default 3m
    if (!params.height) {
      params.height = 3;
    }
  }

  // ------ Pitched roof parameters ------
  if (type === 'pitched_roof') {
    // Eave height: "goothoogte 4m", "eave height 4m"
    const eaveMatch = text.match(/(?:goothoogte|eave\s*height|goot)\s*(?:van|of|:)?\s*(\d+[.,]?\d*)\s*m?/);
    if (eaveMatch) {
      params.eaveHeight = parseNum(eaveMatch[1]);
    } else {
      params.eaveHeight = 4;
    }

    // Ridge height (relative to eave): use height param, default 3m
    if (!params.height) {
      params.height = 3;
    }

    // Span default for roof
    if (!params.span) {
      params.span = 10;
    }
  }

  // Apply defaults
  if (!params.span) {
    params.span = type === 'cantilever' ? 3 : type === 'truss' ? 12 : 6;
  }

  return { type, params };
}

// ---------------------------------------------------------------------------
// Command Executor
// ---------------------------------------------------------------------------

export function executeCommand(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  // Push undo before making changes
  dispatch({ type: 'PUSH_UNDO' });

  // Clear the mesh for a fresh model
  mesh.clear();

  switch (cmd.type) {
    case 'beam':
      return createSimplySupported(cmd, mesh, dispatch, loadCases);
    case 'cantilever':
      return createCantilever(cmd, mesh, dispatch, loadCases);
    case 'portal':
      return createPortalFrame(cmd, mesh, dispatch, loadCases);
    case 'truss':
      return createTruss(cmd, mesh, dispatch, loadCases);
    case 'continuous_beam':
      return createContinuousBeam(cmd, mesh, dispatch, loadCases);
    case 'multi_story_frame':
      return createMultiStoryFrame(cmd, mesh, dispatch, loadCases);
    case 'concrete_wall':
      return createConcreteWall(cmd, mesh, dispatch, loadCases);
    case 'pitched_roof':
      return createPitchedRoof(cmd, mesh, dispatch, loadCases);
    default:
      return { success: false, message: `Unknown structure type: ${cmd.type}` };
  }
}

// ---------------------------------------------------------------------------
// Structure Builders
// ---------------------------------------------------------------------------

function createSimplySupported(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const span = cmd.params.span!;
  const { section, profileName } = findSection(cmd.params.profile);

  // Nodes: left support, midpoint, right support
  const n1 = mesh.addNode(0, 0);
  const n2 = mesh.addNode(span / 2, 0);
  const n3 = mesh.addNode(span, 0);

  // Supports: pinned left, roller right
  mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
  mesh.updateNode(n3.id, { constraints: { x: false, y: true, rotation: false } });

  // Beam elements
  const b1 = mesh.addBeamElement([n1.id, n2.id], 1, section, profileName);
  const b2 = mesh.addBeamElement([n2.id, n3.id], 1, section, profileName);

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed' && b1 && b2) {
    const qy = -cmd.params.load * 1000; // kN/m to N/m, negative = downward
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b1.id, qx: 0, qy, coordSystem: 'global' } });
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b2.id, qx: 0, qy, coordSystem: 'global' } });
    loadDesc = ` with ${cmd.params.load} kN/m distributed load`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000; // kN to N, negative = downward
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply at midpoint by default
    dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: n2.id, fx: 0, fy, mz: 0 } });
    loadDesc = ` with ${cmd.params.load} kN point load at midspan`;
  }

  const details = [
    `Span: ${span} m`,
    `Profile: ${profileName}`,
    `Nodes: 3, Elements: 2`,
    `Supports: Pinned (left) + Roller (right)`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Simply supported beam created (${span}m)${loadDesc}`,
    details,
    nodeCount: 3,
    elementCount: 2
  };
}

function createCantilever(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const span = cmd.params.span!;
  const { section, profileName } = findSection(cmd.params.profile);

  // Nodes: fixed end, midpoint, free end
  const n1 = mesh.addNode(0, 0);
  const n2 = mesh.addNode(span / 2, 0);
  const n3 = mesh.addNode(span, 0);

  // Supports: fixed at left
  mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: true } });

  // Beam elements
  const b1 = mesh.addBeamElement([n1.id, n2.id], 1, section, profileName);
  const b2 = mesh.addBeamElement([n2.id, n3.id], 1, section, profileName);

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed' && b1 && b2) {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b1.id, qx: 0, qy, coordSystem: 'global' } });
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b2.id, qx: 0, qy, coordSystem: 'global' } });
    loadDesc = ` with ${cmd.params.load} kN/m distributed load`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Default: load at tip
    const targetNode = cmd.params.pointLoadPosition === 0.5 ? n2.id : n3.id;
    const posLabel = cmd.params.pointLoadPosition === 0.5 ? 'midspan' : 'tip';
    dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: targetNode, fx: 0, fy, mz: 0 } });
    loadDesc = ` with ${cmd.params.load} kN point load at ${posLabel}`;
  }

  const details = [
    `Length: ${span} m`,
    `Profile: ${profileName}`,
    `Nodes: 3, Elements: 2`,
    `Supports: Fixed (left)`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Cantilever beam created (${span}m)${loadDesc}`,
    details,
    nodeCount: 3,
    elementCount: 2
  };
}

function createPortalFrame(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const span = cmd.params.span!;
  const height = cmd.params.height!;
  const { section, profileName } = findSection(cmd.params.profile);

  // Nodes: 4 corners + midpoint on beam
  //   n1 (0,0) -- bottom left
  //   n2 (0,H) -- top left
  //   n3 (L/2,H) -- midpoint top
  //   n4 (L,H) -- top right
  //   n5 (L,0) -- bottom right
  const n1 = mesh.addNode(0, 0);
  const n2 = mesh.addNode(0, height);
  const n3 = mesh.addNode(span / 2, height);
  const n4 = mesh.addNode(span, height);
  const n5 = mesh.addNode(span, 0);

  // Supports: both base nodes fixed
  mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: true } });
  mesh.updateNode(n5.id, { constraints: { x: true, y: true, rotation: true } });

  // Columns
  mesh.addBeamElement([n1.id, n2.id], 1, section, profileName);
  mesh.addBeamElement([n5.id, n4.id], 1, section, profileName);

  // Beam (rafter)
  const b1 = mesh.addBeamElement([n2.id, n3.id], 1, section, profileName);
  const b2 = mesh.addBeamElement([n3.id, n4.id], 1, section, profileName);

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads on the beam (rafter)
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed' && b1 && b2) {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b1.id, qx: 0, qy, coordSystem: 'global' } });
    dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: b2.id, qx: 0, qy, coordSystem: 'global' } });
    loadDesc = ` with ${cmd.params.load} kN/m on rafter`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: n3.id, fx: 0, fy, mz: 0 } });
    loadDesc = ` with ${cmd.params.load} kN point load at mid-rafter`;
  }

  const details = [
    `Width: ${span} m, Height: ${height} m`,
    `Profile: ${profileName}`,
    `Nodes: 5, Elements: 4 (2 columns + 2 rafter segments)`,
    `Supports: Fixed at both bases`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Portal frame created (${span}m x ${height}m)${loadDesc}`,
    details,
    nodeCount: 5,
    elementCount: 4
  };
}

function createTruss(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const span = cmd.params.span!;
  const height = cmd.params.height ?? Math.max(1, span / 6);
  const numPanels = cmd.params.numPanels ?? Math.max(4, Math.round(span / 2));
  const { section, profileName } = findSection(cmd.params.profile);

  const panelWidth = span / numPanels;

  // Create bottom chord nodes
  const bottomNodes: number[] = [];
  for (let i = 0; i <= numPanels; i++) {
    const n = mesh.addNode(i * panelWidth, 0);
    bottomNodes.push(n.id);
  }

  // Create top chord nodes
  const topNodes: number[] = [];
  for (let i = 0; i <= numPanels; i++) {
    const n = mesh.addNode(i * panelWidth, height);
    topNodes.push(n.id);
  }

  // Supports: pinned left, roller right
  mesh.updateNode(bottomNodes[0], { constraints: { x: true, y: true, rotation: false } });
  mesh.updateNode(bottomNodes[numPanels], { constraints: { x: false, y: true, rotation: false } });

  let elementCount = 0;

  // Bottom chord elements
  for (let i = 0; i < numPanels; i++) {
    const beam = mesh.addBeamElement([bottomNodes[i], bottomNodes[i + 1]], 1, section, profileName);
    if (beam) {
      mesh.updateBeamElement(beam.id, { startConnection: 'hinge', endConnection: 'hinge', endReleases: { startMoment: true, endMoment: true } });
      elementCount++;
    }
  }

  // Top chord elements
  for (let i = 0; i < numPanels; i++) {
    const beam = mesh.addBeamElement([topNodes[i], topNodes[i + 1]], 1, section, profileName);
    if (beam) {
      mesh.updateBeamElement(beam.id, { startConnection: 'hinge', endConnection: 'hinge', endReleases: { startMoment: true, endMoment: true } });
      elementCount++;
    }
  }

  // Vertical elements
  for (let i = 0; i <= numPanels; i++) {
    const beam = mesh.addBeamElement([bottomNodes[i], topNodes[i]], 1, section, profileName);
    if (beam) {
      mesh.updateBeamElement(beam.id, { startConnection: 'hinge', endConnection: 'hinge', endReleases: { startMoment: true, endMoment: true } });
      elementCount++;
    }
  }

  // Diagonal elements (Pratt truss pattern)
  for (let i = 0; i < numPanels; i++) {
    const beam = mesh.addBeamElement([bottomNodes[i], topNodes[i + 1]], 1, section, profileName);
    if (beam) {
      mesh.updateBeamElement(beam.id, { startConnection: 'hinge', endConnection: 'hinge', endReleases: { startMoment: true, endMoment: true } });
      elementCount++;
    }
  }

  const totalNodes = (numPanels + 1) * 2;

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads at top chord nodes
  let loadDesc = '';
  if (cmd.params.load) {
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    if (cmd.params.loadType === 'distributed') {
      // Convert distributed load to equivalent point loads on top chord
      const tributaryLength = panelWidth;
      for (let i = 0; i <= numPanels; i++) {
        const factor = (i === 0 || i === numPanels) ? 0.5 : 1.0;
        const fy = -cmd.params.load * 1000 * tributaryLength * factor;
        dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: topNodes[i], fx: 0, fy, mz: 0 } });
      }
      loadDesc = ` with ${cmd.params.load} kN/m on top chord`;
    } else {
      // Point load at midspan top chord
      const midIdx = Math.floor(numPanels / 2);
      const fy = -cmd.params.load * 1000;
      dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: topNodes[midIdx], fx: 0, fy, mz: 0 } });
      loadDesc = ` with ${cmd.params.load} kN point load at midspan`;
    }
  }

  const details = [
    `Span: ${span} m, Height: ${height} m`,
    `Panels: ${numPanels} (Pratt pattern)`,
    `Profile: ${profileName}`,
    `Nodes: ${totalNodes}, Elements: ${elementCount}`,
    `Supports: Pinned (left) + Roller (right)`,
    `All connections: hinged (truss)`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Pratt truss created (${span}m x ${height}m, ${numPanels} panels)${loadDesc}`,
    details,
    nodeCount: totalNodes,
    elementCount
  };
}

function createContinuousBeam(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const spanLength = cmd.params.span!;
  const numSpans = cmd.params.numSpans ?? 3;
  const { section, profileName } = findSection(cmd.params.profile);

  const nodes: number[] = [];
  const midNodes: number[] = [];
  const beamIds: number[] = [];

  for (let i = 0; i <= numSpans; i++) {
    const n = mesh.addNode(i * spanLength, 0);
    nodes.push(n.id);

    // Add midspan nodes (except after last support)
    if (i < numSpans) {
      const mid = mesh.addNode((i + 0.5) * spanLength, 0);
      midNodes.push(mid.id);
    }
  }

  // Supports: pinned at first, roller at all others
  mesh.updateNode(nodes[0], { constraints: { x: true, y: true, rotation: false } });
  for (let i = 1; i <= numSpans; i++) {
    mesh.updateNode(nodes[i], { constraints: { x: false, y: true, rotation: false } });
  }

  // Create beam elements between consecutive nodes (support - mid - support)
  for (let i = 0; i < numSpans; i++) {
    const b1 = mesh.addBeamElement([nodes[i], midNodes[i]], 1, section, profileName);
    const b2 = mesh.addBeamElement([midNodes[i], nodes[i + 1]], 1, section, profileName);
    if (b1) beamIds.push(b1.id);
    if (b2) beamIds.push(b2.id);
  }

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed') {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    for (const bId of beamIds) {
      dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: bId, qx: 0, qy, coordSystem: 'global' } });
    }
    loadDesc = ` with ${cmd.params.load} kN/m distributed load`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply point loads at midspan of each span
    for (const midId of midNodes) {
      dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: midId, fx: 0, fy, mz: 0 } });
    }
    loadDesc = ` with ${cmd.params.load} kN point loads at each midspan`;
  }

  const totalNodes = nodes.length + midNodes.length;
  const totalElements = beamIds.length;
  const totalSpan = numSpans * spanLength;

  const details = [
    `Total length: ${totalSpan} m (${numSpans} spans of ${spanLength} m)`,
    `Profile: ${profileName}`,
    `Nodes: ${totalNodes}, Elements: ${totalElements}`,
    `Supports: Pinned + ${numSpans} Rollers`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Continuous beam created (${numSpans}x ${spanLength}m)${loadDesc}`,
    details,
    nodeCount: totalNodes,
    elementCount: totalElements
  };
}

function createMultiStoryFrame(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const numStories = cmd.params.numStories ?? 3;
  const storyHeight = cmd.params.storyHeight ?? 3.5;
  const numBays = cmd.params.numBays ?? 2;
  const bayWidth = cmd.params.bayWidth ?? cmd.params.span ?? 6;
  const { section, profileName } = findSection(cmd.params.profile ?? 'HEA 200');

  // Create a grid of nodes: (numBays+1) columns x (numStories+1) levels
  // nodeGrid[level][col] = nodeId
  const nodeGrid: number[][] = [];

  for (let level = 0; level <= numStories; level++) {
    const row: number[] = [];
    for (let col = 0; col <= numBays; col++) {
      const x = col * bayWidth;
      const y = level * storyHeight;
      const n = mesh.addNode(x, y);
      row.push(n.id);
    }
    nodeGrid.push(row);
  }

  // Fixed supports at base (level 0)
  for (let col = 0; col <= numBays; col++) {
    mesh.updateNode(nodeGrid[0][col], { constraints: { x: true, y: true, rotation: true } });
  }

  let elementCount = 0;

  // Columns: vertical elements between levels
  for (let level = 0; level < numStories; level++) {
    for (let col = 0; col <= numBays; col++) {
      const beam = mesh.addBeamElement(
        [nodeGrid[level][col], nodeGrid[level + 1][col]],
        1, section, profileName
      );
      if (beam) elementCount++;
    }
  }

  // Floor beams: horizontal elements at each level above base
  const floorBeamIds: number[] = [];
  for (let level = 1; level <= numStories; level++) {
    for (let col = 0; col < numBays; col++) {
      const beam = mesh.addBeamElement(
        [nodeGrid[level][col], nodeGrid[level][col + 1]],
        1, section, profileName
      );
      if (beam) {
        floorBeamIds.push(beam.id);
        elementCount++;
      }
    }
  }

  const totalNodes = (numBays + 1) * (numStories + 1);

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply distributed loads on all floor beams
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed') {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    for (const bId of floorBeamIds) {
      dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: bId, qx: 0, qy, coordSystem: 'global' } });
    }
    loadDesc = ` with ${cmd.params.load} kN/m on all floor beams`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply point loads at mid-floor nodes of the top story
    for (let col = 0; col < numBays; col++) {
      dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: nodeGrid[numStories][col + 1], fx: 0, fy, mz: 0 } });
    }
    loadDesc = ` with ${cmd.params.load} kN point loads on top floor`;
  }

  const totalHeight = numStories * storyHeight;
  const totalWidth = numBays * bayWidth;

  const details = [
    `Stories: ${numStories}, Story height: ${storyHeight} m`,
    `Bays: ${numBays}, Bay width: ${bayWidth} m`,
    `Total: ${totalWidth} m x ${totalHeight} m`,
    `Profile: ${profileName}`,
    `Nodes: ${totalNodes}, Elements: ${elementCount}`,
    `Columns: ${(numBays + 1) * numStories}, Floor beams: ${numBays * numStories}`,
    `Supports: Fixed at all ${numBays + 1} base nodes`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Multi-story frame created (${numStories} stories, ${numBays} bays)${loadDesc}`,
    details,
    nodeCount: totalNodes,
    elementCount
  };
}

function createConcreteWall(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const wallHeight = cmd.params.height ?? 3;
  const wallWidth = cmd.params.width ?? cmd.params.span ?? 6;
  const numOpenings = cmd.params.numOpenings ?? 1;
  const openingWidth = cmd.params.openingWidth ?? 1.5;
  const openingHeight = cmd.params.openingHeight ?? 2;
  const thickness = cmd.params.thickness ?? 0.3;

  // Concrete rectangular section: thickness x 500mm (width x depth)
  const depth = 0.5; // 500mm section depth
  const Iy = (thickness * Math.pow(depth, 3)) / 12; // bh³/12
  const concreteSection: IBeamSection = {
    A: thickness * depth,           // cross-sectional area (m²)
    I: Iy,                          // second moment of area (m⁴)
    h: depth,                       // section height (m)
    Iy: Iy,                         // strong axis (m⁴)
    Iz: (depth * Math.pow(thickness, 3)) / 12,  // weak axis (m⁴)
    Wy: (thickness * Math.pow(depth, 2)) / 6,   // elastic modulus strong axis (m³)
    Wz: (depth * Math.pow(thickness, 2)) / 6,   // elastic modulus weak axis (m³)
  };
  const concProfileName = `Rectangle ${thickness * 1000}x${depth * 1000}`;

  // Layout: piers (vertical members) between and beside openings,
  // spandrels (horizontal beams) above openings connecting piers.
  //
  // For N openings, we need (N+1) piers evenly spaced.
  // The openings are centered between piers.
  //
  // Calculate pier positions
  const totalOpeningWidth = numOpenings * openingWidth;
  const totalPierWidth = wallWidth - totalOpeningWidth;
  const pierWidth = totalPierWidth / (numOpenings + 1);

  // Build pier positions (center x of each pier)
  const pierCenters: number[] = [];
  for (let i = 0; i <= numOpenings; i++) {
    const x = i * (pierWidth + openingWidth) + pierWidth / 2;
    pierCenters.push(x);
  }

  let elementCount = 0;
  let nodeCount = 0;
  const allBeamIds: number[] = [];

  // Create pier elements (vertical) for each pier
  // Each pier: base node, top-of-opening node, top-of-wall node
  const pierBaseNodes: number[] = [];
  const pierOpeningTopNodes: number[] = [];
  const pierTopNodes: number[] = [];

  for (let i = 0; i <= numOpenings; i++) {
    const x = pierCenters[i];

    // Base node (y=0)
    const nBase = mesh.addNode(x, 0);
    pierBaseNodes.push(nBase.id);
    nodeCount++;

    // Top of opening node (y = openingHeight)
    const nOpenTop = mesh.addNode(x, openingHeight);
    pierOpeningTopNodes.push(nOpenTop.id);
    nodeCount++;

    // Top of wall node (y = wallHeight)
    const nTop = mesh.addNode(x, wallHeight);
    pierTopNodes.push(nTop.id);
    nodeCount++;

    // Pier element: base to opening-top
    const b1 = mesh.addBeamElement([nBase.id, nOpenTop.id], 1, concreteSection, concProfileName);
    if (b1) { elementCount++; allBeamIds.push(b1.id); }

    // Pier element: opening-top to wall-top
    const b2 = mesh.addBeamElement([nOpenTop.id, nTop.id], 1, concreteSection, concProfileName);
    if (b2) { elementCount++; allBeamIds.push(b2.id); }

    // Fixed support at base
    mesh.updateNode(nBase.id, { constraints: { x: true, y: true, rotation: true } });
  }

  // Create spandrel beams above openings (connecting pier tops at opening level)
  for (let i = 0; i < numOpenings; i++) {
    const beam = mesh.addBeamElement(
      [pierOpeningTopNodes[i], pierOpeningTopNodes[i + 1]],
      1, concreteSection, concProfileName
    );
    if (beam) { elementCount++; allBeamIds.push(beam.id); }
  }

  // Connect top of wall nodes with horizontal beams (top beam / lintel)
  for (let i = 0; i < numOpenings; i++) {
    const beam = mesh.addBeamElement(
      [pierTopNodes[i], pierTopNodes[i + 1]],
      1, concreteSection, concProfileName
    );
    if (beam) { elementCount++; allBeamIds.push(beam.id); }
  }

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads
  let loadDesc = '';
  if (cmd.params.load && cmd.params.loadType === 'distributed') {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply on top beams
    for (let i = 0; i < numOpenings; i++) {
      // Find beam between top nodes i and i+1 (last added top beams)
      const topBeamIdx = allBeamIds.length - numOpenings + i;
      dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: allBeamIds[topBeamIdx], qx: 0, qy, coordSystem: 'global' } });
    }
    loadDesc = ` with ${cmd.params.load} kN/m on top edge`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply at top nodes
    for (const nId of pierTopNodes) {
      dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: nId, fx: 0, fy, mz: 0 } });
    }
    loadDesc = ` with ${cmd.params.load} kN at top nodes`;
  }

  const details = [
    `Wall: ${wallWidth} m x ${wallHeight} m, thickness: ${thickness} m`,
    `Openings: ${numOpenings} (${openingWidth}m x ${openingHeight}m each)`,
    `Piers: ${numOpenings + 1}, pier width: ${pierWidth.toFixed(2)} m`,
    `Section: ${concProfileName} (concrete, E=30 GPa)`,
    `Nodes: ${nodeCount}, Elements: ${elementCount}`,
    `Supports: Fixed at all ${numOpenings + 1} base nodes`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Concrete wall created (${wallWidth}m x ${wallHeight}m, ${numOpenings} openings)${loadDesc}`,
    details,
    nodeCount,
    elementCount
  };
}

function createPitchedRoof(
  cmd: AgentCommand,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const span = cmd.params.span ?? 10;
  const ridgeHeight = cmd.params.height ?? 3;   // height above eave
  const eaveHeight = cmd.params.eaveHeight ?? 4;
  const { section, profileName } = findSection(cmd.params.profile ?? 'IPE 200');

  // Nodes:
  //   n1 (0, 0)           -- left base
  //   n2 (0, eaveHeight)  -- left eave (top of left column)
  //   n3 (span/2, eaveHeight + ridgeHeight) -- ridge
  //   n4 (span, eaveHeight) -- right eave (top of right column)
  //   n5 (span, 0)         -- right base
  const ridgeY = eaveHeight + ridgeHeight;

  const n1 = mesh.addNode(0, 0);
  const n2 = mesh.addNode(0, eaveHeight);
  const n3 = mesh.addNode(span / 2, ridgeY);
  const n4 = mesh.addNode(span, eaveHeight);
  const n5 = mesh.addNode(span, 0);

  // Midpoints on rafters for load application
  const nMidLeft = mesh.addNode(span / 4, eaveHeight + ridgeHeight / 2);
  const nMidRight = mesh.addNode(3 * span / 4, eaveHeight + ridgeHeight / 2);

  // Fixed supports at base
  mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: true } });
  mesh.updateNode(n5.id, { constraints: { x: true, y: true, rotation: true } });

  let elementCount = 0;

  // Left column
  const colL = mesh.addBeamElement([n1.id, n2.id], 1, section, profileName);
  if (colL) elementCount++;

  // Right column
  const colR = mesh.addBeamElement([n5.id, n4.id], 1, section, profileName);
  if (colR) elementCount++;

  // Left rafter (eave to mid, mid to ridge)
  const rafterL1 = mesh.addBeamElement([n2.id, nMidLeft.id], 1, section, profileName);
  if (rafterL1) elementCount++;
  const rafterL2 = mesh.addBeamElement([nMidLeft.id, n3.id], 1, section, profileName);
  if (rafterL2) elementCount++;

  // Right rafter (eave to mid, mid to ridge)
  const rafterR1 = mesh.addBeamElement([n4.id, nMidRight.id], 1, section, profileName);
  if (rafterR1) elementCount++;
  const rafterR2 = mesh.addBeamElement([nMidRight.id, n3.id], 1, section, profileName);
  if (rafterR2) elementCount++;

  // Hinged connection at ridge: release moment at the ridge end of both rafter segments
  if (rafterL2) {
    mesh.updateBeamElement(rafterL2.id, { endConnection: 'hinge', endReleases: { startMoment: false, endMoment: true } });
  }
  if (rafterR2) {
    mesh.updateBeamElement(rafterR2.id, { endConnection: 'hinge', endReleases: { startMoment: false, endMoment: true } });
  }

  const totalNodes = 7;

  // Update state
  dispatch({ type: 'SET_MESH', payload: mesh });
  dispatch({ type: 'REFRESH_MESH' });
  dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
  dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });

  // Apply loads on rafter elements
  let loadDesc = '';
  const rafterBeamIds = [rafterL1?.id, rafterL2?.id, rafterR1?.id, rafterR2?.id].filter((id): id is number => id !== undefined);

  if (cmd.params.load && cmd.params.loadType === 'distributed') {
    const qy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    for (const bId of rafterBeamIds) {
      dispatch({ type: 'ADD_DISTRIBUTED_LOAD', payload: { lcId, beamId: bId, qx: 0, qy, coordSystem: 'global' } });
    }
    loadDesc = ` with ${cmd.params.load} kN/m on rafters`;
  } else if (cmd.params.load && cmd.params.loadType === 'point') {
    const fy = -cmd.params.load * 1000;
    const lcId = loadCases.length > 0 ? loadCases[0].id : 1;
    // Apply at ridge
    dispatch({ type: 'ADD_POINT_LOAD', payload: { lcId, nodeId: n3.id, fx: 0, fy, mz: 0 } });
    loadDesc = ` with ${cmd.params.load} kN point load at ridge`;
  }

  const details = [
    `Span: ${span} m`,
    `Eave height: ${eaveHeight} m, Ridge height: ${ridgeY} m (${ridgeHeight} m above eave)`,
    `Profile: ${profileName}`,
    `Nodes: ${totalNodes}, Elements: ${elementCount}`,
    `Structure: 2 columns + 4 rafter segments (2 per side)`,
    `Supports: Fixed at both bases`,
    `Ridge: Hinged connection`,
    loadDesc ? `Load:${loadDesc}` : 'No loads applied'
  ].join('\n');

  return {
    success: true,
    message: `Pitched roof structure created (${span}m span, ridge at ${ridgeY}m)${loadDesc}`,
    details,
    nodeCount: totalNodes,
    elementCount
  };
}

// ---------------------------------------------------------------------------
// Help / description generator
// ---------------------------------------------------------------------------

export function getHelpText(): string {
  return `I can create structural models from natural language commands in Dutch and English.

Supported structures:
  - Simply supported beam (ligger/beam)
  - Cantilever beam (console/cantilever)
  - Portal frame (portaal/portal)
  - Truss (vakwerk/truss)
  - Continuous beam (doorlopende ligger/continuous beam)
  - Multi-story frame (kantoor/office/etages/multi-story)
  - Concrete wall with openings (betonwand/concrete wall/shear wall)
  - Pitched roof structure (dakconstructie/pitched roof/zadeldak)

Example commands:
  "Teken een ligger van 8m met lijnlast 10 kN/m"
  "Create a simply supported beam 5m with UDL 15 kN/m"
  "Maak een portaal van 6m breed en 4m hoog met 10 kN/m"
  "Draw a cantilever 3m with point load 20 kN at the tip"
  "Teken een vakwerk van 12m overspanning en 2m hoog"
  "Create a continuous beam 5m, 3 spans with 8 kN/m"
  "Kantoor 4 etages 3 bays met 5 kN/m"
  "Create a multi-story frame 5 stories 3 bays with 10 kN/m"
  "Betonwand 6m breed 3m hoog met 2 sparingen"
  "Create a concrete wall 8m with 3 openings"
  "Zadeldak 12m overspanning goothoogte 4m met 5 kN/m"
  "Create a pitched roof 10m span 3m high eave height 4m"

Profile optimization:
  "Optimaliseer op doorbuiging" — find stiffest profile
  "Optimaliseer op gewicht" — find lightest feasible profile
  "Optimaliseer op gewicht IPE S355" — lightest IPE in S355
  "Optimize for deflection HEA" — stiffen with HEA series
  "Optimaliseer UC ratio" — best material utilization
  "Optimize for weight L/300" — lightest profile with L/300 limit

Parameters I understand:
  - Span/width (in meters)
  - Height (for portals, trusses, walls, roofs)
  - Loads (kN/m for distributed, kN for point)
  - Profiles (e.g., IPE 200, HEA 200)
  - Number of panels (for trusses)
  - Number of spans (for continuous beams)
  - Number of stories, story height, bays, bay width (for multi-story frames)
  - Number of openings, opening dimensions, wall thickness (for concrete walls)
  - Eave height, ridge height (for pitched roofs)
  - Optimization: criterion, series, steel grade, UC limit, deflection limit`;
}

// ---------------------------------------------------------------------------
// Process: parse + execute convenience
// ---------------------------------------------------------------------------

export function processAgentInput(
  input: string,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[]
): AgentResult {
  const text = input.toLowerCase().trim();

  // Check for help commands
  if (/^(help|hulp|wat kan je|what can you|\?)/.test(text)) {
    return { success: true, message: getHelpText() };
  }

  // Check for clear/reset commands
  if (/^(clear|wis|reset|nieuw|new|leeg)/.test(text)) {
    dispatch({ type: 'PUSH_UNDO' });
    mesh.clear();
    dispatch({ type: 'SET_MESH', payload: mesh });
    dispatch({ type: 'REFRESH_MESH' });
    // Reset load cases to defaults
    dispatch({
      type: 'SET_LOAD_CASES',
      payload: [
        {
          id: 1, name: 'Dead Load (G)', type: 'dead' as const,
          pointLoads: [], distributedLoads: [], edgeLoads: [], thermalLoads: [],
          color: '#6b7280'
        },
        {
          id: 2, name: 'Live Load (Q)', type: 'live' as const,
          pointLoads: [], distributedLoads: [], edgeLoads: [], thermalLoads: [],
          color: '#3b82f6'
        }
      ]
    });
    return { success: true, message: 'Model cleared.' };
  }

  // Check for optimization commands (will be handled by async version)
  const optCmd = parseOptimizeCommand(input);
  if (optCmd) {
    return {
      success: false,
      message: '__OPTIMIZE__',  // Sentinel: AgentPanel will call the async version
      details: JSON.stringify(optCmd),
    };
  }

  // Try to parse as a structural command
  const cmd = parseCommand(input);
  if (!cmd) {
    return {
      success: false,
      message: `I could not understand that command. Type "help" to see what I can do.

I need a structure type keyword like:
  - beam / ligger / balk
  - cantilever / console
  - portal / portaal
  - truss / vakwerk
  - continuous beam / doorlopende ligger
  - multi-story frame / kantoor / etages
  - concrete wall / betonwand / shear wall
  - pitched roof / dakconstructie / zadeldak
  - optimaliseer / optimize (profile optimization)`
    };
  }

  return executeCommand(cmd, mesh, dispatch, loadCases);
}

// ---------------------------------------------------------------------------
// Async Agent Input: handles optimization (requires solver calls)
// ---------------------------------------------------------------------------

/**
 * Process agent input that may require async operations (optimization).
 * This should be called from the UI when the sync version returns '__OPTIMIZE__'.
 */
export async function processAgentOptimize(
  input: string,
  mesh: Mesh,
  dispatch: (action: any) => void,
  loadCases: ILoadCase[],
  applyLoadCaseFn: ApplyLoadCaseFn,
  onProgress?: (message: string) => void,
): Promise<AgentResult> {
  const optCmd = parseOptimizeCommand(input);
  if (!optCmd) {
    return { success: false, message: 'Not an optimization command.' };
  }

  // Verify there are beam elements to optimize
  if (mesh.beamElements.size === 0) {
    return {
      success: false,
      message: 'No beam elements in the model. Create a structure first, then optimize.',
    };
  }

  // Get the active load case
  const activeLc = loadCases.find(lc => lc.id === 1) ?? loadCases[0];
  if (!activeLc) {
    return {
      success: false,
      message: 'No load case available. Add loads before optimizing.',
    };
  }

  // Check if there are any loads
  const hasLoads = loadCases.some(lc =>
    lc.pointLoads.length > 0 || lc.distributedLoads.length > 0
  );
  if (!hasLoads) {
    return {
      success: false,
      message: 'No loads defined. Apply loads to the model before optimizing.',
    };
  }

  dispatch({ type: 'PUSH_UNDO' });

  onProgress?.('Starting profile optimization...');

  try {
    const result = await optimizeProfile(
      mesh,
      activeLc,
      applyLoadCaseFn,
      optCmd.beamId,
      optCmd.criterion,
      optCmd.constraints,
      onProgress,
    );

    if (result.success) {
      // Update the UI
      dispatch({ type: 'SET_MESH', payload: mesh });
      dispatch({ type: 'REFRESH_MESH' });

      // Also re-run the solver one final time with the optimal profile
      // so results are up-to-date
      try {
        applyLoadCaseFn(mesh, activeLc);
        const { solve: solveFn } = await import('../solver/SolverService');
        const solverResult = await solveFn(mesh, {
          analysisType: 'frame',
          geometricNonlinear: false,
        });
        dispatch({ type: 'SET_RESULT', payload: solverResult });
        dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
        dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
        dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
      } catch {
        // Final solve failed, but optimization result is still valid
      }
    }

    return {
      success: result.success,
      message: result.message,
      details: result.details,
    };
  } catch (e) {
    return {
      success: false,
      message: `Optimization failed: ${(e as Error).message}`,
    };
  }
}
