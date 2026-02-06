/**
 * ConcreteDesign.ts
 *
 * Concrete reinforcement design module per EN 1992-1-1 (Eurocode 2).
 * Supports rectangular, T-section and L-section design.
 *
 * All internal calculations use consistent units:
 *   - Forces in N, moments in Nm
 *   - Lengths in m (except cover/diameters in mm)
 *   - Stresses in MPa (N/mm²)
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IConcreteDesignGrade {
  name: string;
  fck: number;    // Characteristic cylinder strength (MPa)
  fcd: number;    // Design compressive strength (MPa) = fck / 1.5
  fctm: number;   // Mean tensile strength (MPa)
  Ecm: number;    // Secant modulus of elasticity (MPa)
}

export interface IReinforcementDesignGrade {
  name: string;
  fyk: number;    // Characteristic yield strength (MPa)
  fyd: number;    // Design yield strength (MPa) = fyk / 1.15
  Es: number;     // Modulus of elasticity (MPa)
}

export type ConcreteShapeType = 'rectangle' | 'T' | 'L';

export interface IConcreteDesignSection {
  shape: ConcreteShapeType;
  h: number;        // Total height (mm)
  b: number;        // Web width (mm) — for rectangle, this is the full width
  bf?: number;      // Flange width (mm) — for T and L sections
  hf?: number;      // Flange depth (mm) — for T and L sections
  coverTop: number;    // Cover to stirrup top (mm)
  coverBottom: number; // Cover to stirrup bottom (mm)
  coverSide: number;   // Cover to stirrup side (mm)
}

export interface IReinforcementConfig {
  mainBarDiameter: number;      // Main bar diameter (mm)
  nBarsBottom: number;          // Number of bottom bars
  nBarsTop: number;             // Number of top bars
  stirrupDiameter: number;      // Stirrup diameter (mm)
  stirrupSpacing: number;       // Stirrup spacing (mm)
}

export interface IConcreteDesignResult {
  // Input echo
  MEd: number;           // Design bending moment (Nm)
  VEd: number;           // Design shear force (N)
  // Section geometry
  d: number;             // Effective depth (mm)
  // Bending
  mu: number;            // Dimensionless bending coefficient
  muLim: number;         // Limiting mu for ductile failure
  omega: number;         // Mechanical reinforcement ratio
  AsReqBottom: number;   // Required tension reinforcement (mm²)
  AsReqTop: number;      // Required compression reinforcement (mm², 0 if not needed)
  AsMin: number;         // Minimum reinforcement (mm²)
  AsProvBottom: number;  // Provided bottom reinforcement (mm²)
  AsProvTop: number;     // Provided top reinforcement (mm²)
  // Shear
  VRdc: number;          // Concrete shear resistance without stirrups (N)
  VRdMax: number;        // Maximum shear with strut-and-tie (N)
  AsswReq: number;       // Required stirrup reinforcement Asw/s (mm²/m)
  AsswProv: number;      // Provided stirrup reinforcement Asw/s (mm²/m)
  shearOk: boolean;
  // Unity checks
  UC_bending: number;    // mu / muLim
  UC_shear: number;      // VEd / max(VRdc, VRdMax)
  // Status
  status: 'OK' | 'WARN' | 'FAIL';
  notes: string[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const CONCRETE_DESIGN_GRADES: IConcreteDesignGrade[] = [
  { name: 'C20/25', fck: 20, fcd: 13.33, fctm: 2.2, Ecm: 30000 },
  { name: 'C25/30', fck: 25, fcd: 16.67, fctm: 2.6, Ecm: 31000 },
  { name: 'C30/37', fck: 30, fcd: 20.00, fctm: 2.9, Ecm: 33000 },
  { name: 'C35/45', fck: 35, fcd: 23.33, fctm: 3.2, Ecm: 34000 },
  { name: 'C40/50', fck: 40, fcd: 26.67, fctm: 3.5, Ecm: 35000 },
  { name: 'C45/55', fck: 45, fcd: 30.00, fctm: 3.8, Ecm: 36000 },
  { name: 'C50/60', fck: 50, fcd: 33.33, fctm: 4.1, Ecm: 37000 },
];

export const REINFORCEMENT_DESIGN_GRADES: IReinforcementDesignGrade[] = [
  { name: 'B500A', fyk: 500, fyd: 434.78, Es: 200000 },
  { name: 'B500B', fyk: 500, fyd: 434.78, Es: 200000 },
];

/** Common bar diameters (mm) and their areas (mm²) */
export const BAR_AREAS: { diameter: number; area: number }[] = [
  { diameter: 6,  area: 28.3 },
  { diameter: 8,  area: 50.3 },
  { diameter: 10, area: 78.5 },
  { diameter: 12, area: 113.1 },
  { diameter: 16, area: 201.1 },
  { diameter: 20, area: 314.2 },
  { diameter: 25, area: 490.9 },
  { diameter: 32, area: 804.2 },
  { diameter: 40, area: 1256.6 },
];

// ---------------------------------------------------------------------------
// EC2 Rectangular Stress Block Parameters
// ---------------------------------------------------------------------------

/**
 * Get the rectangular stress block parameters per EC2 3.1.7
 * For fck <= 50 MPa: lambda = 0.8, eta = 1.0
 * For 50 < fck <= 90 MPa: lambda = 0.8 - (fck-50)/400, eta = 1.0 - (fck-50)/200
 */
export function getStressBlockParams(fck: number): { lambda: number; eta: number } {
  if (fck <= 50) {
    return { lambda: 0.8, eta: 1.0 };
  }
  return {
    lambda: 0.8 - (fck - 50) / 400,
    eta: 1.0 - (fck - 50) / 200,
  };
}

// ---------------------------------------------------------------------------
// Effective depth calculation
// ---------------------------------------------------------------------------

/**
 * Calculate effective depth d (mm) from section geometry
 */
export function calculateEffectiveDepth(
  section: IConcreteDesignSection,
  reinforcement: IReinforcementConfig,
): number {
  return section.h - section.coverBottom - reinforcement.stirrupDiameter - reinforcement.mainBarDiameter / 2;
}

// ---------------------------------------------------------------------------
// Bending design — Rectangular section
// ---------------------------------------------------------------------------

/**
 * Calculate required flexural reinforcement for a rectangular section.
 *
 * @param MEd  Design bending moment (Nm) — positive = bottom tension
 * @param b    Width of compression zone (mm)
 * @param d    Effective depth (mm)
 * @param fcd  Design compressive strength (MPa)
 * @param fyd  Design yield strength of reinforcement (MPa)
 * @param fctm Mean tensile strength (MPa) — for As,min
 * @param fyk  Characteristic yield strength (MPa) — for As,min
 * @returns   { AsReq, mu, omega, muLim, AsMin }
 */
export function designRectangularBending(
  MEd: number,
  b: number,
  d: number,
  fcd: number,
  fyd: number,
  fctm: number,
  fyk: number,
): {
  AsReq: number;
  AsReqCompression: number;
  mu: number;
  omega: number;
  muLim: number;
  AsMin: number;
} {
  const MEdMmN = Math.abs(MEd) * 1000; // Nm -> Nmm

  // mu = MEd / (b * d² * fcd)
  const mu = MEdMmN / (b * d * d * fcd);

  // Limiting mu for ductile failure (no compression reinforcement needed)
  // For C <= C50/60: mu_lim ≈ 0.295 (corresponds to x/d = 0.45)
  const muLim = 0.295;

  let omega: number;
  let AsReqCompression = 0;

  if (mu <= muLim) {
    // Single reinforcement
    omega = 1 - Math.sqrt(1 - 2 * mu);
  } else {
    // Compression reinforcement would be needed — cap omega at limit
    omega = 1 - Math.sqrt(1 - 2 * muLim);
    // Excess moment must be carried by compression reinforcement
    // This is a simplified approach
    const MRdLim = muLim * b * d * d * fcd; // Nmm
    const deltaM = MEdMmN - MRdLim;
    const dPrime = d * 0.1; // approximate d' ≈ 10% of d (cover + stirrup + bar/2)
    AsReqCompression = deltaM / (fyd * (d - dPrime));
    // Additional tension reinforcement for delta M
    const AsExtraTension = deltaM / (fyd * (d - dPrime));
    // Total omega includes the limited portion
    omega = omega; // keep the limited omega for the concrete part
    // The total As will be computed outside
    AsReqCompression = Math.max(0, AsExtraTension);
  }

  // Required tension reinforcement
  // As = omega * b * d * fcd / fyd (mm²)
  let AsReq = omega * b * d * fcd / fyd;
  if (mu > muLim) {
    // Add extra tension steel for compression reinforcement
    AsReq += AsReqCompression;
  }

  // Minimum reinforcement (EN 1992-1-1, 9.2.1.1)
  // As,min = max(0.26 * fctm/fyk * b * d, 0.0013 * b * d)
  const AsMin = Math.max(0.26 * fctm / fyk * b * d, 0.0013 * b * d);

  return { AsReq: Math.max(AsReq, 0), AsReqCompression, mu, omega, muLim, AsMin };
}

// ---------------------------------------------------------------------------
// Bending design — T-section
// ---------------------------------------------------------------------------

/**
 * Calculate required flexural reinforcement for a T-section.
 * If the neutral axis falls within the flange, treat as rectangular with b = bf.
 * Otherwise, split into flange and web contributions.
 */
export function designTSectionBending(
  MEd: number,
  bw: number,  // Web width (mm)
  bf: number,  // Flange width (mm)
  hf: number,  // Flange depth (mm)
  d: number,   // Effective depth (mm)
  fcd: number,
  fyd: number,
  fctm: number,
  fyk: number,
): {
  AsReq: number;
  AsReqCompression: number;
  mu: number;
  omega: number;
  muLim: number;
  AsMin: number;
  neutralAxisInFlange: boolean;
} {
  const MEdMmN = Math.abs(MEd) * 1000; // Nm -> Nmm
  const muLim = 0.295;

  // First check: can the flange alone resist the moment?
  // Assume full flange in compression: Mf = 0.8 * fcd * bf * hf * (d - 0.4*hf)
  const MfMax = 0.8 * fcd * bf * hf * (d - 0.4 * hf); // Nmm

  if (MEdMmN <= MfMax) {
    // Neutral axis within flange — treat as rectangular with width = bf
    const result = designRectangularBending(MEd, bf, d, fcd, fyd, fctm, fyk);
    return { ...result, neutralAxisInFlange: true };
  }

  // Neutral axis in web — split into flange and web contributions
  // Moment from flange overhangs
  const Mf = fcd * (bf - bw) * hf * (d - hf / 2); // Nmm
  const Asf = Mf / (fyd * (d - hf / 2)); // mm²

  // Remaining moment from web
  const Mw = MEdMmN - Mf; // Nmm
  const muW = Mw / (bw * d * d * fcd);
  let omegaW: number;
  if (muW <= muLim) {
    omegaW = 1 - Math.sqrt(1 - 2 * muW);
  } else {
    omegaW = 1 - Math.sqrt(1 - 2 * muLim);
  }
  const Asw = omegaW * bw * d * fcd / fyd;

  const AsReq = Asf + Asw;
  const mu = MEdMmN / (bf * d * d * fcd); // overall mu based on bf
  const omega = AsReq * fyd / (bf * d * fcd);

  const AsMin = Math.max(0.26 * fctm / fyk * bw * d, 0.0013 * bw * d);

  return { AsReq: Math.max(AsReq, 0), AsReqCompression: 0, mu, omega, muLim, AsMin, neutralAxisInFlange: false };
}

// ---------------------------------------------------------------------------
// Shear design
// ---------------------------------------------------------------------------

/**
 * Calculate shear resistance and required stirrup reinforcement.
 *
 * @param VEd   Design shear force (N)
 * @param bw    Web width (mm)
 * @param d     Effective depth (mm)
 * @param fck   Characteristic concrete strength (MPa)
 * @param fcd   Design concrete strength (MPa)
 * @param fyd   Design yield strength of stirrup steel (MPa)
 * @param AsBottom Tension reinforcement area (mm²) — for rho_l
 */
export function designShear(
  VEd: number,
  bw: number,
  d: number,
  fck: number,
  fcd: number,
  fyd: number,
  AsBottom: number,
): {
  VRdc: number;
  VRdMax: number;
  AsswReq: number;  // Asw/s in mm²/m
  shearOk: boolean;
} {
  const VEdAbs = Math.abs(VEd);

  // VRd,c — Concrete shear resistance without reinforcement (EN 1992-1-1, 6.2.2)
  // VRd,c = [CRd,c * k * (100 * rho_l * fck)^(1/3)] * bw * d
  const CRdc = 0.18 / 1.5;
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(AsBottom / (bw * d), 0.02);
  const vMin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck); // MPa
  const VRdc1 = CRdc * k * Math.pow(100 * rhoL * fck, 1 / 3) * bw * d; // N
  const VRdc = Math.max(VRdc1, vMin * bw * d); // N

  // VRd,max — Maximum shear with compression strut (EN 1992-1-1, 6.2.3)
  // Assume cot(theta) = 2.5 (theta = 21.8 degrees, most economical)
  const cotTheta = 2.5;
  const sinTheta = Math.sin(Math.atan(1 / cotTheta));
  const cosTheta = Math.cos(Math.atan(1 / cotTheta));
  const nu1 = 0.6 * (1 - fck / 250); // strength reduction factor
  const alphaCw = 1.0; // no axial force
  const VRdMax = alphaCw * bw * 0.9 * d * nu1 * fcd * sinTheta * cosTheta; // N

  // Required stirrup reinforcement Asw/s (mm²/mm -> convert to mm²/m)
  let AsswReq = 0; // mm²/m
  if (VEdAbs > VRdc) {
    // Asw/s = VEd / (0.9 * d * fyd * cot(theta))
    const AsswReqMmPerMm = VEdAbs / (0.9 * d * fyd * cotTheta); // mm²/mm
    AsswReq = AsswReqMmPerMm * 1000; // mm²/m
  }

  // Minimum shear reinforcement (EN 1992-1-1, 9.2.2)
  // rho_w,min = 0.08 * sqrt(fck) / fyk  (using fyd would be unconservative)
  // Asw,min/s = rho_w,min * bw * sin(alpha), alpha=90 for vertical stirrups
  const rhoWMin = 0.08 * Math.sqrt(fck) / (fyd * 1.15); // use fyk = fyd * 1.15
  const AsswMin = rhoWMin * bw * 1000; // mm²/m

  AsswReq = Math.max(AsswReq, AsswMin);

  const shearOk = VEdAbs <= Math.max(VRdc, VRdMax);

  return { VRdc, VRdMax, AsswReq, shearOk };
}

// ---------------------------------------------------------------------------
// Full design function
// ---------------------------------------------------------------------------

/**
 * Perform complete concrete design for a beam section.
 */
export function designConcreteBeam(
  MEd: number,      // Design moment (Nm)
  VEd: number,      // Design shear (N)
  section: IConcreteDesignSection,
  reinforcement: IReinforcementConfig,
  concrete: IConcreteDesignGrade,
  mainSteel: IReinforcementDesignGrade,
  stirrupSteel: IReinforcementDesignGrade,
): IConcreteDesignResult {
  const d = calculateEffectiveDepth(section, reinforcement);
  const notes: string[] = [];

  // Bending design
  let bendingResult;
  if (section.shape === 'T' || section.shape === 'L') {
    const bf = section.bf || section.b;
    const hf = section.hf || 0;
    bendingResult = designTSectionBending(
      MEd, section.b, bf, hf, d,
      concrete.fcd, mainSteel.fyd, concrete.fctm, mainSteel.fyk,
    );
    if ('neutralAxisInFlange' in bendingResult && !bendingResult.neutralAxisInFlange) {
      notes.push('Neutral axis in web — T-section design applied');
    }
  } else {
    const rect = designRectangularBending(
      MEd, section.b, d,
      concrete.fcd, mainSteel.fyd, concrete.fctm, mainSteel.fyk,
    );
    bendingResult = { ...rect, neutralAxisInFlange: false };
  }

  const AsReqBottom = Math.max(bendingResult.AsReq, bendingResult.AsMin);
  const AsReqTop = bendingResult.AsReqCompression !== undefined ? bendingResult.AsReqCompression : 0;

  // Provided reinforcement
  const barArea = getBarArea(reinforcement.mainBarDiameter);
  const AsProvBottom = reinforcement.nBarsBottom * barArea;
  const AsProvTop = reinforcement.nBarsTop * barArea;

  // Shear design
  const shear = designShear(
    VEd, section.b, d,
    concrete.fck, concrete.fcd, stirrupSteel.fyd,
    AsProvBottom > 0 ? AsProvBottom : AsReqBottom,
  );

  // Provided stirrup reinforcement: 2 legs
  const stirrupArea = getBarArea(reinforcement.stirrupDiameter);
  const AsswProv = (2 * stirrupArea / reinforcement.stirrupSpacing) * 1000; // mm²/m

  // Unity checks
  const UC_bending = bendingResult.mu / bendingResult.muLim;
  const UC_shear = Math.abs(VEd) > 0
    ? Math.abs(VEd) / Math.max(shear.VRdc, shear.VRdMax)
    : 0;

  // Status
  let status: 'OK' | 'WARN' | 'FAIL' = 'OK';

  if (bendingResult.mu > bendingResult.muLim) {
    status = 'FAIL';
    notes.push('mu > mu_lim: Compression reinforcement required or increase section');
  }

  if (AsProvBottom < AsReqBottom && AsProvBottom > 0) {
    if (status === 'OK') status = 'WARN';
    notes.push(`Provided As,bottom (${AsProvBottom.toFixed(0)} mm²) < required (${AsReqBottom.toFixed(0)} mm²)`);
  }

  if (Math.abs(VEd) > shear.VRdMax) {
    status = 'FAIL';
    notes.push('VEd > VRd,max: Increase section or concrete grade');
  } else if (Math.abs(VEd) > shear.VRdc) {
    if (AsswProv < shear.AsswReq) {
      if (status === 'OK') status = 'WARN';
      notes.push('Shear reinforcement insufficient — reduce stirrup spacing or increase diameter');
    }
  }

  if (UC_bending > 0.85 && UC_bending <= 1.0 && status === 'OK') {
    status = 'WARN';
    notes.push('High bending utilization — consider larger section');
  }

  if (notes.length === 0) {
    notes.push('Section adequate');
  }

  return {
    MEd,
    VEd,
    d,
    mu: bendingResult.mu,
    muLim: bendingResult.muLim,
    omega: bendingResult.omega,
    AsReqBottom,
    AsReqTop,
    AsMin: bendingResult.AsMin,
    AsProvBottom,
    AsProvTop,
    VRdc: shear.VRdc,
    VRdMax: shear.VRdMax,
    AsswReq: shear.AsswReq,
    AsswProv,
    shearOk: shear.shearOk,
    UC_bending,
    UC_shear,
    status,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the cross-sectional area of a single bar given its diameter.
 */
export function getBarArea(diameter: number): number {
  const entry = BAR_AREAS.find(b => b.diameter === diameter);
  if (entry) return entry.area;
  // Fallback: pi/4 * d²
  return Math.PI / 4 * diameter * diameter;
}

/**
 * Suggest a bar arrangement for a given required area.
 */
export function suggestBarArrangement(asReqMm2: number): { diameter: number; count: number; asProv: number } {
  const barOptions = [8, 10, 12, 16, 20, 25, 32];
  for (const dia of barOptions) {
    const area = getBarArea(dia);
    const n = Math.ceil(asReqMm2 / area);
    if (n <= 8) {
      return { diameter: dia, count: n, asProv: n * area };
    }
  }
  // Fallback: use largest bar
  const area = getBarArea(32);
  const n = Math.ceil(asReqMm2 / area);
  return { diameter: 32, count: n, asProv: n * area };
}
