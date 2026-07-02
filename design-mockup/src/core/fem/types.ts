export interface INode {
  id: number;
  x: number;
  y: number;
  gridLineId?: number;  // ID of structural grid line this node is snapped to
  constraints: {
    x: boolean;
    y: boolean;
    rotation: boolean;  // For frame analysis
    springX?: number;    // Spring stiffness X direction (N/m) — if set, X-constraint is a spring
    springY?: number;    // Spring stiffness Y direction (N/m) — if set, Y-constraint is a spring
    springRot?: number;  // Rotational spring stiffness (Nm/rad) — if set, rotation constraint is a spring
  };
  loads: {
    fx: number;
    fy: number;
    fz?: number;        // Transverse force for plate bending (N)
    moment: number;     // Applied moment (Nm)
  };
}

export interface IMaterial {
  id: number;
  name: string;
  E: number;      // Young's modulus (Pa)
  nu: number;     // Poisson's ratio
  rho: number;    // Density (kg/m³)
  color: string;  // Display color
  alpha?: number; // Thermal expansion coefficient (1/°C)
}

export interface IElement {
  id: number;
  nodeIds: number[];
  materialId: number;
  thickness: number;
}

export interface ITriangleElement extends IElement {
  nodeIds: [number, number, number];
}

export interface IQuadElement extends IElement {
  nodeIds: [number, number, number, number];
}

export interface IBeamSection {
  A: number;          // Cross-sectional area (m²)
  I: number;          // Second moment of area about strong axis Iy (m⁴) - keep for backward compat
  h: number;          // Height of section (m) - for stress calculation
  b?: number;         // Flange width (m)
  tw?: number;        // Web thickness (m)
  tf?: number;        // Flange thickness (m)
  Iy?: number;        // Second moment of area, strong axis (m⁴) - same as I
  Iz?: number;        // Second moment of area, weak axis (m⁴)
  Wy?: number;        // Elastic section modulus, strong axis (m³)
  Wz?: number;        // Elastic section modulus, weak axis (m³)
  Wply?: number;      // Plastic section modulus, strong axis (m³)
  Wplz?: number;      // Plastic section modulus, weak axis (m³)
  It?: number;        // Torsional constant (m⁴)
  Iw?: number;        // Warping constant (m⁶)
}

// Point load on beam (at a specific position along the beam)
export interface IBeamPointLoad {
  id: number;
  beamId: number;       // Which beam this load is on
  position: number;     // Position along beam (0 to 1, where 0 = start node, 1 = end node)
  fx: number;           // Force in local x direction (N)
  fy: number;           // Force in local y direction (N)
  moment: number;       // Moment (Nm)
}

// Element types for load generation and code checking
export type StructuralElementType = 'none' | 'roof_left' | 'roof_right' | 'flat_roof' | 'facade_left' | 'facade_right' | 'floor' | 'column';

export interface IBeamElement extends IElement {
  nodeIds: [number, number];
  section: IBeamSection;
  profileName?: string;   // Display name of the profile (e.g. "IPE 200")
  elementType?: StructuralElementType;  // Structural function for load generation
  beamGroup?: number;     // Beam group ID (beams in extension form a group)
  // Distributed loads (local coordinates)
  distributedLoad?: {
    qx: number;       // Axial load at start (N/m)
    qy: number;       // Transverse load at start (N/m)
    qxEnd?: number;   // Axial load at end (N/m), if different → trapezoidal
    qyEnd?: number;   // Transverse load at end (N/m), if different → trapezoidal
    startT?: number;  // Partial load start position (0-1), default 0
    endT?: number;    // Partial load end position (0-1), default 1
    coordSystem?: 'local' | 'global'; // Load direction, default 'local'
  };
  // Point loads on the beam (will cause automatic beam splitting)
  pointLoads?: IBeamPointLoad[];
  // Beam end releases (hinges) - legacy boolean format
  endReleases?: {
    startMoment: boolean;  // Release rotation at start node
    endMoment: boolean;    // Release rotation at end node
    startAxial?: boolean;  // Release axial at start (Tx)
    endAxial?: boolean;    // Release axial at end (Tx)
    startShear?: boolean;  // Release shear at start (Tz)
    endShear?: boolean;    // Release shear at end (Tz)
  };
  // Connection type at beam ends (legacy single-value)
  startConnection?: ConnectionType;
  endConnection?: ConnectionType;
  // Per-DOF connection types (overrides startConnection/endConnection when present)
  startConnections?: IDOFConnections;
  endConnections?: IDOFConnections;
  // Beam on elastic foundation (Winkler support)
  onGrade?: {
    enabled: boolean;
    k: number;  // Spring stiffness (N/m per m length = N/m²)
    b?: number; // Foundation width (m), defaults to 1.0 if not specified
  };
  // Lateral bracing (kipsteunen) - positions along beam as fraction (0-1)
  lateralBracing?: {
    top: number[];     // Bracing positions at top flange (e.g., [0, 0.5, 1] = at supports and mid-span)
    bottom: number[];  // Bracing positions at bottom flange
  };
  // Pre-camber - pre-deflection at mid-span (m, positive = upward)
  camber?: number;
  // Deflection limit for SLS check
  deflectionLimit?: 'L/500' | 'L/333' | 'L/250';  // 0.002L, 0.003L, 0.004L
  // Layer assignment
  layerId?: number;
  // Thermal load on beam element
  thermalLoad?: {
    deltaT?: number;        // Uniform temperature change (C)
    deltaTTop?: number;     // Temperature at top fiber (C)
    deltaTBottom?: number;  // Temperature at bottom fiber (C)
  };
}

// Connection type for beam ends: 'fixed' (A), 'free' (hinge), 'spring' (S), or special
export type ConnectionType = 'fixed' | 'hinge' | 'spring' | 'tension_only' | 'pressure_only';

// Per-DOF connection types for beam ends (6 DOF for 3D, Ty/Ry optional for 2D)
export interface IDOFConnections {
  Tx: ConnectionType;  // Axial (along beam)
  Ty?: ConnectionType; // Lateral (out of plane, for 3D)
  Tz: ConnectionType;  // Transverse (perpendicular in plane)
  Rx?: ConnectionType; // Torsion (about beam axis, for 3D)
  Ry?: ConnectionType; // Bending about Y (for 3D)
  Rz: ConnectionType;  // Bending about Z (in-plane rotation)
  // Spring stiffnesses (only used when connection type is 'spring')
  springTx?: number;   // N/m
  springTy?: number;   // N/m
  springTz?: number;   // N/m
  springRx?: number;   // Nm/rad
  springRy?: number;   // Nm/rad
  springRz?: number;   // Nm/rad
}

const DEFAULT_DOF_CONNECTIONS: IDOFConnections = { Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' };

/**
 * Get per-DOF connection types for a beam, with backward compatibility.
 */
export function getDOFConnectionTypes(beam: IBeamElement): { start: IDOFConnections; end: IDOFConnections } {
  if (beam.startConnections || beam.endConnections) {
    return {
      start: beam.startConnections ?? { ...DEFAULT_DOF_CONNECTIONS },
      end: beam.endConnections ?? { ...DEFAULT_DOF_CONNECTIONS },
    };
  }
  // Fall back to legacy single connection type (applied to Rz/moment)
  const conn = getConnectionTypes(beam);
  return {
    start: { ...DEFAULT_DOF_CONNECTIONS, Rz: conn.start },
    end: { ...DEFAULT_DOF_CONNECTIONS, Rz: conn.end },
  };
}

/**
 * Get connection types for a beam, with backward compatibility from legacy endReleases.
 * Returns the primary (Rz/moment) connection type for rendering symbols.
 */
export function getConnectionTypes(beam: IBeamElement): { start: ConnectionType; end: ConnectionType } {
  if (beam.startConnections || beam.endConnections) {
    const start = beam.startConnections ?? DEFAULT_DOF_CONNECTIONS;
    const end = beam.endConnections ?? DEFAULT_DOF_CONNECTIONS;
    // Return the first non-fixed DOF, prioritizing Rz (moment)
    const pickPrimary = (c: IDOFConnections): ConnectionType => {
      if (c.Rz !== 'fixed') return c.Rz;
      if (c.Tx !== 'fixed') return c.Tx;
      if (c.Tz !== 'fixed') return c.Tz;
      if (c.Rx && c.Rx !== 'fixed') return c.Rx;
      if (c.Ry && c.Ry !== 'fixed') return c.Ry;
      if (c.Ty && c.Ty !== 'fixed') return c.Ty;
      return 'fixed';
    };
    return { start: pickPrimary(start), end: pickPrimary(end) };
  }
  if (beam.startConnection || beam.endConnection) {
    return { start: beam.startConnection ?? 'fixed', end: beam.endConnection ?? 'fixed' };
  }
  if (beam.endReleases) {
    return {
      start: beam.endReleases.startMoment ? 'hinge' : 'fixed',
      end: beam.endReleases.endMoment ? 'hinge' : 'fixed',
    };
  }
  return { start: 'fixed', end: 'fixed' };
}

export interface IPlateEdge {
  nodeIds: number[];  // ordered node IDs along edge
}

export interface IEdge {
  id: number;
  plateId: number;
  vertexStart: { x: number; y: number };  // geometric start (polygon vertex)
  vertexEnd: { x: number; y: number };    // geometric end
  nodeIds: number[];                       // ordered mesh nodes along this edge
  polygonEdgeIndex?: number;               // for polygon: which edge (0-based)
  namedEdge?: 'bottom' | 'top' | 'left' | 'right';  // for rectangular
}

export interface IPlateRegion {
  id: number;
  x: number; y: number;           // bottom-left corner (world) / bounding box origin
  width: number; height: number;   // dimensions (meters) / bounding box size
  divisionsX: number;              // mesh divisions in X (rectangular mode)
  divisionsY: number;              // mesh divisions in Y (rectangular mode)
  materialId: number;
  thickness: number;               // plate thickness (meters)
  elementType?: 'triangle' | 'quad' | 'mixed'; // element type (default: quad)
  nodeIds: number[];               // all generated node IDs
  cornerNodeIds: [number, number, number, number]; // BL, BR, TR, TL
  elementIds: number[];            // all generated element IDs (triangles or quads)
  edges: {
    bottom: IPlateEdge;
    top: IPlateEdge;
    left: IPlateEdge;
    right: IPlateEdge;
  };
  edgeIds?: number[];              // IEdge IDs for boundary edges
  // Polygon plate fields (optional — rectangular plates omit these)
  isPolygon?: boolean;
  polygon?: { x: number; y: number }[];
  voids?: { x: number; y: number }[][];
  maxArea?: number;
  meshSize?: number;               // element edge length for polygon quad mesh (meters)
  boundaryNodeIds?: number[];
  quadOnly?: boolean;              // if true, mesh is quad-only (no remaining triangles)
  reinforcement?: IPlateReinforcement;  // Reinforcement configuration for concrete plates
}

/**
 * Plate vertex: defines a corner point of a plate's geometric contour.
 * Separate from mesh nodes - moving a vertex only affects the plate contour,
 * not the FEM mesh nodes directly (mesh is regenerated after vertex move).
 */
export interface IPlateVertex {
  id: number;
  plateId: number;
  x: number;
  y: number;
  index: number;  // Position in the plate's polygon array
}

export interface IEdgeLoad {
  plateId: number;
  edge: 'top' | 'bottom' | 'left' | 'right' | number;  // number = polygon edge index (0-based)
  edgeId?: number;  // IEdge id — primary coupling (when available)
  px: number;  // N/m global X
  py: number;  // N/m global Y
}

export interface IThermalLoad {
  elementId: number;   // per element
  plateId?: number;    // if applied to whole plate
  deltaT: number;      // temperature change (°C)
}

// ============ Reinforcement types for concrete plates ============

/**
 * Mesh reinforcement layer (rebar net in one direction)
 */
export interface IReinforcementMesh {
  direction: 'X' | 'Y';           // Rebar direction
  barDiameter: number;            // mm
  spacing: number;                // mm c/c
  cover: number;                  // mm from surface to bar center
  position: 'top' | 'bottom';     // Layer position
}

/**
 * Individual reinforcement bar (additional rebar)
 */
export interface IReinforcementBar {
  barDiameter: number;                     // mm
  cover: number;                           // mm
  position: 'top' | 'bottom';
  coordinates: { x: number; y: number }[]; // Bar path (at least 2 points)
}

/**
 * Complete reinforcement configuration for a plate region
 */
export interface IPlateReinforcement {
  topX?: IReinforcementMesh;      // Top layer, X direction
  topY?: IReinforcementMesh;      // Top layer, Y direction
  bottomX?: IReinforcementMesh;   // Bottom layer, X direction
  bottomY?: IReinforcementMesh;   // Bottom layer, Y direction
  additionalBars?: IReinforcementBar[];
}

// ============================================================

export interface IEnvelopeResult {
  minDisplacements: number[];
  maxDisplacements: number[];
  beamForces: Map<number, {
    minN: number[]; maxN: number[];
    minV: number[]; maxV: number[];
    minM: number[]; maxM: number[];
    stations: number[];
  }>;
}

export interface ISubNode {
  id: number;
  beamId: number;      // The original beam this sub-node was placed on (before split)
  t: number;           // Parameter 0-1 along original beam length
  nodeId: number;      // The actual mesh node ID created for this sub-node
  originalBeamStart: number;  // Original beam start node ID
  originalBeamEnd: number;    // Original beam end node ID
  childBeamIds: [number, number]; // The two beam segments created by the split
}

export type ElementType = 'triangle' | 'quad' | 'beam';

export interface IMesh {
  nodes: Map<number, INode>;
  elements: Map<number, IElement>;
  materials: Map<number, IMaterial>;
}

export interface ISolverResult {
  displacements: number[];          // [u1, v1, u2, v2, ...] or [u1, v1, θ1, u2, v2, θ2, ...] for frames
  reactions: number[];              // Reaction forces at constrained DOFs
  elementStresses: Map<number, IElementStress>;
  beamForces: Map<number, IBeamForces>;  // Internal forces for beam elements
  maxVonMises: number;
  minVonMises: number;
  loadCaseId?: number;              // Which load case was solved (optional)
  combinationId?: number;           // Which load combination was solved (optional)
  maxMoment?: number;               // For plate bending color scale
  minMoment?: number;
  // Per-component min/max for stress contour scaling
  stressRanges?: {
    sigmaX: { min: number; max: number };
    sigmaY: { min: number; max: number };
    tauXY: { min: number; max: number };
    mx: { min: number; max: number };
    my: { min: number; max: number };
    mxy: { min: number; max: number };
    vx: { min: number; max: number };
    vy: { min: number; max: number };
    nx: { min: number; max: number };
    ny: { min: number; max: number };
    nxy: { min: number; max: number };
  };
  // FNL concrete: cracked section states per beam (Map<beamId, ICrackedSectionState>)
  crackedSectionStates?: Map<number, {
    isCracked: boolean;
    Mcr: number;        // Cracking moment (Nm)
    Icr: number;        // Cracked second moment of area (m⁴)
    Ieff: number;       // Effective I with tension stiffening (m⁴)
    xCr: number;        // Neutral axis depth when cracked (m)
    EIeff: number;      // Effective bending stiffness (Nm²)
  }>;
}

export interface IBeamForces {
  elementId: number;
  // Forces at start node (local coordinates)
  N1: number;         // Axial force (positive = tension)
  V1: number;         // Shear force
  M1: number;         // Bending moment
  // Forces at end node (local coordinates)
  N2: number;
  V2: number;
  M2: number;
  // For diagram plotting - values along beam length
  stations: number[];           // Positions along beam (0 to L)
  normalForce: number[];        // N(x)
  shearForce: number[];         // V(x)
  bendingMoment: number[];      // M(x)
  // Maximum values for scaling
  maxN: number;
  maxV: number;
  maxM: number;
}

export interface IElementStress {
  elementId: number;
  sigmaX: number;   // Normal stress in x
  sigmaY: number;   // Normal stress in y
  tauXY: number;    // Shear stress
  vonMises: number; // Von Mises equivalent stress
  principalStresses: {
    sigma1: number;
    sigma2: number;
    angle: number;
  };
  mx?: number;      // Bending moment per unit length (plate bending) [Nm/m]
  my?: number;
  mxy?: number;
  vx?: number;      // Transverse shear force per unit length [N/m]
  vy?: number;
  // Membrane forces (N/m) = stress × thickness
  nx?: number;
  ny?: number;
  nxy?: number;
}

// Layer for grouping elements
export interface ILayer {
  id: number;
  name: string;
  color: string;    // Display color (hex)
  visible: boolean;
  locked: boolean;
}

export type AnalysisType = 'plane_stress' | 'plane_strain' | 'frame' | 'plate_bending' | 'mixed_beam_plate';

export interface IAnalysisSettings {
  type: AnalysisType;
  scaleFactor: number;  // Deformation scale for visualization
}

export type Tool = 'select' | 'addNode' | 'addSubNode' | 'addElement' | 'addBeam' | 'delete' | 'pan' | 'addLoad' | 'addConstraint'
  | 'addPinned' | 'addXRoller' | 'addZRoller' | 'addZSpring' | 'addRotSpring' | 'addXSpring' | 'addFixed'
  | 'addLineLoad' | 'addPlate' | 'addThermalLoad' | 'rotate';

export type StressType = 'vonMises' | 'sigmaX' | 'sigmaY' | 'tauXY' | 'mx' | 'my' | 'mxy' | 'vx' | 'vy' | 'nx' | 'ny' | 'nxy' | 'normals' | 'shearTrajectory' | 'momentTrajectory';

export interface IViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface ISelection {
  nodeIds: Set<number>;
  elementIds: Set<number>;
  pointLoadNodeIds: Set<number>;    // nodes with selected point load
  distLoadBeamIds: Set<number>;     // beams with selected distributed load
  selectedDistLoadIds: Set<number>; // individual distributed load IDs (from IDistributedLoad.id)
  plateIds: Set<number>;            // selected plate regions
  vertexIds: Set<number>;           // selected plate vertices
  edgeIds: Set<number>;             // selected IEdge IDs
}
