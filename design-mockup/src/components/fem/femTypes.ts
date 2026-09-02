/**
 * Shared types for the FEM v2 app.
 *
 * Centralised here so the lifted state in App.tsx can be consumed by
 * FemCanvas (controlled rendering), FemProjectTree (live counts/leaves)
 * and FemProperties (reactive details) without circular imports.
 */

export type Tool =
  | "select"
  | "addNode"
  | "addBeam"
  | "addSubNode"
  | "addPlate"
  | "addPinned"
  | "addFixed"
  | "addXRoller"
  | "addZRoller"
  | "addZSpring"
  | "addXSpring"
  | "addRotSpring"
  | "addPointLoad"          // verticale puntlast (default Fz)
  | "addPointLoadH"         // horizontale puntlast (default Fx, voor o.a. wind)
  | "addMoment"
  | "addLineLoad"
  | "addThermal"
  | "move"
  | "copy"
  | "rotate"
  | "mirror";

export interface Node {
  id: number;
  x: number; // model coords (mm)
  z: number;
}

/** Per-DOF release flags — `true` = vrijheidsgraad ontkoppeld (scharnier). */
export interface BeamReleases {
  startTx?: boolean;
  startTz?: boolean;
  startRy?: boolean;
  endTx?: boolean;
  endTz?: boolean;
  endRy?: boolean;
}

/**
 * Per-staaf toetsconfiguratie voor de normtoetsing (EN 1993 staal /
 * EN 1995 hout). Alle velden zijn optioneel: een ontbrekend veld betekent
 * "gebruik de gedocumenteerde default van de builder" (zie
 * steelCheckBuilder.ts / timberCheckBuilder.ts). De enum-vormen hier zijn
 * UI-vriendelijk; de builders mappen ze 1-op-1 op de ts-rs-typen die de
 * Rust-kern verwacht (DeflectionClass, ServiceClass, LoadDurationClass).
 */
export interface BeamCheckConfig {
  // Staal (EN 1993)
  /** Kniklengte sterke as in m; default: systeemlengte. */
  bucklingLengthY_m?: number;
  /** Kniklengte zwakke as in m; default: systeemlengte. */
  bucklingLengthZ_m?: number;
  /**
   * Kipsteunposities (bovenflens) als fractie 0..1 van de staaflengte —
   * zelfde conventie als LateralBracing.top_flange_positions in de
   * Rust-kern (lambda_chi.rs vermenigvuldigt met de staaflengte).
   */
  lateralRestraints?: number[];
  // Doorbuiging (beide normen)
  /** Doorbuigingsklasse; default "floor". */
  deflectionClass?: "floor" | "roof" | "cantilever" | "custom";
  /** Bij deflectionClass "custom": de n in L/n. */
  deflectionLimitNumerator?: number;
  /** Zeeg (pre-camber) in mm, zelfde tekenconventie als de zakking
   *  (negatief = omlaag). Alleen door de staalkern geconsumeerd. */
  preCamber_mm?: number;
  // Hout (EN 1995)
  /** Klimaatklasse §2.3.1.3; default 1. */
  serviceClass?: 1 | 2 | 3;
  /** Belastingduurklasse §2.3.1.2; default "medium" (middellang). */
  loadDuration?: "permanent" | "long" | "medium" | "short" | "instantaneous";
}

export interface Beam {
  id: number;
  from: number; // node id
  to: number;
  /** Material name (default: "S235" for steel). */
  material?: string;
  /** Profile name (default: "HEA160"). */
  profile?: string;
  /** DOF releases per end (default: all rigid = no releases). */
  releases?: BeamReleases;
  /** Per-staaf toetsconfiguratie; ontbreekt → builder-defaults. */
  checkConfig?: BeamCheckConfig;
}

export interface Plate {
  id: number;
  nodeIds: number[]; // 4 corners (in click order)
}

export type SupportType =
  | "pinned"
  | "fixed"
  | "xRoller"
  | "zRoller"
  | "zSpring"
  | "xSpring"
  | "rotSpring";

export interface Support {
  nodeId: number;
  type: SupportType;
  /** Spring stiffness (kN/mm for translational, kNm/rad for rot). */
  k?: number;
}

export type LoadType = "pointForce" | "pointMoment" | "lineLoad" | "thermal";

export interface Load {
  id: number;
  type: LoadType;
  caseId: number;
  /** node target for pointForce / pointMoment */
  nodeId?: number;
  fx?: number; // kN
  fz?: number; // kN
  my?: number; // kNm
  /** beam target for lineLoad / thermal */
  beamId?: number;
  q?: number; // kN/m (uniform)
  qStart?: number;
  qEnd?: number;
  /** Direction of the line load in GLOBAL axes. Default "z" = vertical (gravity-style).
   *  "x" = horizontal (wind-style). Affects projection to local-axial + local-transverse. */
  qDir?: "x" | "z";
  /**
   * Assenstelsel van de lijnlast. Default (en ontbrekend veld, dus ook alle
   * oude projectbestanden) = "global" — het bestaande gedrag.
   *
   * SEMANTIEK — q is ALTIJD in kN per meter STAAFLENGTE:
   *  - "global" + qDir "z": verticaal in wereldassen (negatief = omlaag,
   *    gravitatie — het huidige rekengedrag);
   *  - "global" + qDir "x": horizontaal in wereldassen (wind-stijl);
   *  - "local"  + qDir "z": loodrecht op de staafas (lokale z; positief =
   *    lokale +y van de core: 90° CCW vanaf de as from→to — voor een
   *    horizontale staaf van links naar rechts identiek aan globaal-z);
   *  - "local"  + qDir "x": axiaal, langs de staafas (positief richting de
   *    to-knoop).
   * De adapter (solver/engine.ts) projecteert lokale lasten exact naar
   * globale componenten per staafhoek; de core rekent altijd globaal.
   */
  qCoord?: "global" | "local";
  /**
   * Deellast (partiële lijnlast): begin van het belaste deel als FRACTIE
   * 0..1 van de staaflengte, gemeten vanaf de startknoop (`Beam.from`).
   * Ontbreekt het veld (oude bestanden) dan geldt de volle lengte (0).
   * De UI voert dit in als afstand in m vanaf de startknoop en rekent om.
   * Bij een trapezium (qStart/qEnd) lopen de waarden lineair over het
   * BELASTE interval.
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Default 1. */
  endFrac?: number;
  deltaT?: number; // K
}

export interface LoadCase {
  id: number;
  name: string;
  type: "dead" | "live" | "snow" | "wind" | "other";
}

export type Selection =
  | { type: "node"; id: number }
  | { type: "beam"; id: number }
  | { type: "plate"; id: number }
  | { type: "load"; id: number }
  | { type: "multi"; nodeIds: number[]; beamIds: number[]; plateIds: number[] }
  | null;

// ── Structural grid (stramien) ───────────────────────────────────────────
/**
 * One vertical or horizontal axis line of a structural grid (stramien).
 * Conventions:
 *  - vertical lines run top-to-bottom and are positioned by their `x` coord (mm).
 *  - horizontal lines run left-to-right and are positioned by `z` (mm).
 * Labels are typically letters (A, B, …) for x-axes and numbers (1, 2, …) for z-axes.
 */
export interface GridAxisLine {
  id: string;
  label: string;
  /** mm — x for vertical axis, z for horizontal axis */
  position: number;
}

export interface StructuralGrid {
  enabled: boolean;
  /** vertical lines, varying x */
  xAxes: GridAxisLine[];
  /** horizontal lines, varying z */
  zAxes: GridAxisLine[];
}

export const DEFAULT_STRUCTURAL_GRID: StructuralGrid = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: 0 },
    { id: "B", label: "B", position: 12000 },
  ],
  zAxes: [
    { id: "1", label: "1", position: 0 },
    { id: "2", label: "2", position: 5000 },
  ],
};

/** Canvas pan/zoom state. */
export interface ViewTransform {
  scale: number; // px per mm
  offsetX: number; // px
  offsetY: number; // px
}

/** Grid display settings (lifted to App.tsx so Grids dialog can mutate). */
export interface GridSettings {
  show: boolean;
  showLines: boolean;
  spacingMm: number;
}

/** Snapshot used for undo/redo. */
export interface Snapshot {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
}

export const DEFAULT_VIEW: ViewTransform = {
  scale: 1 / 25,
  offsetX: 0,
  offsetY: 0,
};

export const DEFAULT_GRID: GridSettings = {
  show: true,
  showLines: true,
  spacingMm: 500,
};
