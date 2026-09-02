/**
 * Solver types — plane-frame 2D static linear analysis.
 *
 * Coordinate system (matches FemCanvas model coords):
 *   x  : horizontal (mm, right positive)
 *   z  : vertical   (mm, up positive)
 *   ry : rotation about the y-axis (rad, counter-clockwise positive when looking from +y)
 *
 * Per-node DOFs: (ux, uz, ry) — 3 per node.
 * Per-element 2-node beam → 6 DOF local stiffness matrix.
 *
 * Units throughout: N, mm, rad, N·mm. Distributed load q is N/mm
 * (negative q = gravity-down on a horizontal beam).
 */
export interface SolverNodeInput {
  id: number;
  x: number;
  z: number;
}

export interface SolverBeamInput {
  id: number;
  from: number;          // node id
  to: number;            // node id
  E?: number;            // N/mm²   default 210000
  A?: number;            // mm²     default 3877  (HEA 160)
  I?: number;            // mm⁴     default 1.673e7 (HEA 160 Iy)
  /**
   * Scharnier-aansluiting per uiteinde:
   *  - 'fixed' (default): rigid moment-resisting joint to the next element.
   *  - 'hinge': moment-free joint — the solver condenses M = 0 at that end.
   * Useful for typical column-beam connections in 2D plane frames.
   */
  startConnection?: 'fixed' | 'hinge';
  endConnection?:   'fixed' | 'hinge';
  /**
   * Volledige release-set per uiteinde, in LOKALE staafassen:
   *  - Tx: axiaal los (normaalkrachthuls — het element draagt daar geen N)
   *  - Tz: dwars los (dwarskrachthuls — het element draagt daar geen V)
   *  - Ry: buigscharnier (equivalent aan start/endConnection 'hinge')
   * Dezelfde translatie aan BEIDE einden lossen koppelt het element in die
   * richting volledig los; hangt een knoop daardoor nergens meer aan, dan
   * meldt de solver een singulier stelsel.
   */
  releases?: {
    startTx?: boolean; startTz?: boolean; startRy?: boolean;
    endTx?: boolean; endTz?: boolean; endRy?: boolean;
  };
}

export type SupportType =
  | "pinned" | "fixed" | "xRoller" | "zRoller"
  | "zSpring" | "xSpring" | "rotSpring";

export interface SolverSupportInput {
  nodeId: number;
  type: SupportType;
  /**
   * Spring stiffness — required for `zSpring` / `xSpring` (N/mm) and
   * `rotSpring` (N·mm/rad). Ignored for rigid support types.
   * If omitted or non-positive on a spring type, the solver treats the
   * support as fully constrained ("rigid") to keep the system non-singular.
   */
  k?: number;
}

export interface SolverDistLoadInput {
  beamId: number;
  q: number;             // N/mm (negative = down in z, applied perpendicular to global z on the beam)
  /** Trapezoidal start value (optional). When omitted, q is uniform along the beam. */
  qStart?: number;
  /** Trapezoidal end value (optional). When omitted, q is uniform along the beam. */
  qEnd?: number;
  /** Direction of the load in GLOBAL axes. Default "z" = vertical (gravity). "x" = horizontal (wind). */
  qDir?: "x" | "z";
  /**
   * Assenstelsel van qDir. Default "global" (bestaand gedrag). Bij "local"
   * is qDir "z" = loodrecht op de staafas (positief = lokale +y: 90° CCW
   * vanaf de as from→to) en qDir "x" = axiaal langs de staaf. q blijft
   * per lengte-eenheid STAAFLENGTE. De adapter projecteert lokale lasten
   * exact naar globale componenten (rechte staven) vóórdat de core rekent;
   * de scheefstand-companion werkt daardoor op de echte verticale component.
   */
  qCoord?: "global" | "local";
  /**
   * Deellast: begin van het belaste deel als FRACTIE 0..1 van de staaflengte,
   * gemeten vanaf de startknoop. Default 0 (last begint bij de startknoop).
   * Bij een trapezium (qStart/qEnd) lopen de waarden lineair over het
   * BELASTE interval [startFrac·L, endFrac·L].
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Default 1. */
  endFrac?: number;
}

/** Point force/moment applied directly on a node — added in step 1c. */
export interface SolverPointLoadInput {
  nodeId: number;
  fx?: number;   // N
  fz?: number;   // N
  my?: number;   // N·mm
}

/** Uniform temperature change on a beam — added in step 2b. */
export interface SolverThermalLoadInput {
  beamId: number;
  deltaT: number;        // K
  /** Linear expansion coefficient (1/K). Default α = 1.2e-5 (steel). */
  alpha?: number;
}

/**
 * Scheefstand / initiële imperfectie (EN 1993-1-1 §5.3.2-aanpak):
 * elke VERTICALE last krijgt een equivalente horizontale metgezel
 * H = φ·V in de gekozen richting (knooplast fz → fx-companion,
 * lijnlast in z → qx-companion over hetzelfde belaste deel).
 * Lineair in de last, dus factoren/combinaties schalen automatisch mee —
 * ook in het 2e-orde-pad, waar de imperfectie er het meest toe doet.
 * φ zelf (φ₀·αh·αm, basis 1/200) bepaalt de aanroeper; de motor past
 * alleen toe. Thermische lasten en momenten krijgen geen companion.
 */
export interface ScheefstandInput {
  /** Scheefstand als verhouding, bv. 1/200 = 0.005. */
  phi: number;
  /** Richting van de equivalente horizontale krachten: +1 = +x, -1 = −x. */
  richting: 1 | -1;
}

export interface SolverInput {
  nodes: SolverNodeInput[];
  beams: SolverBeamInput[];
  supports: SolverSupportInput[];
  loads: SolverDistLoadInput[];
  /** Optional concentrated forces on nodes. */
  pointLoads?: SolverPointLoadInput[];
  /** Optional uniform temperature changes on beams. */
  thermalLoads?: SolverThermalLoadInput[];
  /** Optional load-case tag for traceability (used by multi-LC variant). */
  caseId?: number;
  /** Optionele scheefstand — zie ScheefstandInput. */
  scheefstand?: ScheefstandInput;
}

// ── Multi-load-case + combinations (step 2c–2e) ──────────────────────────────
export interface MultiInput {
  nodes: SolverNodeInput[];
  beams: SolverBeamInput[];
  supports: SolverSupportInput[];
  /** Distributed loads tagged by caseId — the solver splits internally. */
  loads: (SolverDistLoadInput & { caseId: number })[];
  pointLoads?: (SolverPointLoadInput & { caseId: number })[];
  thermalLoads?: (SolverThermalLoadInput & { caseId: number })[];
  /** All load cases referenced by the loads above. */
  cases: { id: number; name: string }[];
  /** Optionele scheefstand — zie ScheefstandInput. */
  scheefstand?: ScheefstandInput;
}

export interface MultiLcResult {
  /** caseId → SolverResult for that case in isolation. */
  perCase: Map<number, SolverResult>;
}

export interface NodalDisp {
  ux: number;   // mm
  uz: number;   // mm
  ry: number;   // rad
}

export interface NodalReaction {
  fx: number;   // N
  fz: number;   // N
  my: number;   // N·mm
}

export interface ElementForces {
  N: number;        // N   (axial, tension +ve at end A)
  V: number;        // N   (shear, end-A local convention)
  M_start: number;  // N·mm at node "from"
  M_end: number;    // N·mm at node "to"

  /** Beam length (mm) — needed for diagram x-axis scaling. */
  L_mm: number;

  /**
   * 21 sample positions x along the beam from start to end (mm).
   * Same length as the three force arrays below.
   */
  stations_mm: number[];

  /**
   * Axial force N(x) at each station (N, tension positive).
   * Used to draw a real N-diagram (varies if axial loads are applied),
   * instead of linear interpolation between endpoints.
   */
  normalForce: number[];

  /**
   * Shear V(x) at each station (N, sagging-positive engineering convention).
   * Linear under UDL, stepwise under point loads.
   */
  shearForce: number[];

  /**
   * Bending moment M(x) at each station (N·mm, sagging-positive).
   * Parabolic under UDL, linear under point loads — drawn station-per-station.
   */
  bendingMoment: number[];

  /**
   * Veldzakking w(x) op dezelfde stations (mm, LOKALE assen): transversale
   * verplaatsing loodrecht op de staafas, positief in lokale +y (90° CCW
   * vanaf de as from→to). Voor een horizontale staaf is +y omhoog — dezelfde
   * conventie als de knoop-uz; doorhangen onder gravitatie geeft dus
   * NEGATIEVE waarden (consistent met sagging-positieve M: veldmoment > 0
   * hoort bij w < 0). Bevat het Hermite-homogene deel op de eind-DOF's plus
   * de particuliere oplossing van de elementbelasting (volledige-lengte
   * uniforme + trapezium-q; partiële q wordt alleen homogeen benaderd).
   */
  deflection: number[];

  /**
   * Axiale verplaatsing u(x) op dezelfde stations (mm, lokaal, positief
   * richting "to"-knoop). Lineair homogeen deel + particuliere oplossing
   * voor verdeelde axiale q.
   */
  axialDisp: number[];
}

export interface SolverResult {
  displacements: Map<number, NodalDisp>;
  reactions: Map<number, NodalReaction>;
  elements: Map<number, ElementForces>;
  /** Largest |u_x| or |u_z| across all nodes (mm) — used to auto-scale on-screen deflection. */
  maxDisplacement: number;
}

// HEA 160 defaults — same numbers the v2 Properties panel hardcodes.
export const DEFAULT_E = 210000;        // N/mm²
export const DEFAULT_A = 3877;          // mm²
export const DEFAULT_I = 1.673e7;       // mm⁴
