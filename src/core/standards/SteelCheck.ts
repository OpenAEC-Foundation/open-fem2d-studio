/**
 * Steel Section Check — NEN-EN 1993-1-1
 * Cross-section resistance checks for beams under N, V, M.
 * Member buckling checks (6.3.1) and lateral torsional buckling (6.3.2).
 * Deflection check (SLS).
 */

import { ISteelGrade } from './EurocodeNL';
import { IBeamForces, IBeamElement } from '../fem/types';

/** Lateral bracing information for LTB calculation */
export interface ILateralBracing {
  top: number[];     // Bracing positions at top flange (0-1 fraction)
  bottom: number[];  // Bracing positions at bottom flange (0-1 fraction)
}

export interface ISectionProperties {
  A: number;        // Cross-section area (m²)
  I: number;        // Second moment of area (m⁴)
  h: number;        // Section height (m)
  Wel?: number;     // Elastic section modulus (m³)
  b?: number;       // Flange width (mm)
  tf?: number;      // Flange thickness (mm)
  tw?: number;      // Web thickness (mm)
  Iz?: number;      // Second moment of area, weak axis (m⁴)
  It?: number;      // Torsion constant (m⁴)
  Iw?: number;      // Warping constant (m⁶)
  profileName?: string;
}

/** Check location along beam */
export interface ICheckLocation {
  position: number;       // Position along beam (m, 0 = start, L = end)
  positionRatio: number;  // Position as ratio (0 to 1)
  locationType: string;   // Description of why this location was checked
}

/** Result of a cross-section check at a single location */
export interface ILocationCheckResult {
  location: ICheckLocation;
  // Forces at this location
  NEd: number;
  VEd: number;
  MEd: number;
  // Unity checks at this location
  UC_N: number;
  UC_V: number;
  UC_M: number;
  UC_MN: number;
  UC_MV: number;
  UC_max: number;
  governingCheck: string;
}

export interface ISteelCheckResult {
  elementId: number;
  profileName: string;
  steelGrade: string;
  // Design resistances
  NcRd: number;     // Axial compression resistance (N)
  NtRd: number;     // Axial tension resistance (N)
  VcRd: number;     // Shear resistance (N)
  McRd: number;     // Bending moment resistance (Nm)
  // Design internal forces (governing values from all checked locations)
  NEd: number;      // Design axial force (N)
  VEd: number;      // Design shear force (N)
  MEd: number;      // Design bending moment (Nm)
  // Unity checks (UC = Ed / Rd, must be <= 1.0)
  UC_N: number;     // Axial unity check
  UC_V: number;     // Shear unity check
  UC_M: number;     // Bending unity check
  UC_MN: number;    // Combined M+N unity check
  UC_MV: number;    // Combined M+V unity check (reduced moment)
  // Member stability checks (NEN-EN 1993-1-1 §6.3)
  UC_buckling: number;   // Member buckling check (6.3.1) — NEd / Nb,Rd
  NbRd: number;          // Buckling resistance (N)
  UC_LTB: number;        // Lateral torsional buckling check (6.3.2) — MEd / Mb,Rd
  MbRd: number;          // LTB resistance (Nm)
  Lcr_LTB?: number;      // Effective unbraced length for LTB (m)
  // Deflection check (SLS)
  UC_deflection: number;      // Deflection unity check — delta / delta_limit
  deflectionActual: number;   // Actual max deflection (m)
  deflectionLimit: number;    // Allowable deflection (m)
  // Governing
  UC_max: number;   // Governing unity check
  // Status
  status: 'OK' | 'FAIL';
  governingCheck: string;
  // Governing location info (new)
  governingLocation: ICheckLocation;
  // All checked locations (for detailed reporting)
  checkedLocations?: ILocationCheckResult[];
}

/** Imperfection factors alpha for buckling curves (NEN-EN 1993-1-1, Table 6.1) */
const BUCKLING_ALPHA: Record<string, number> = {
  a0: 0.13,
  a: 0.21,
  b: 0.34,
  c: 0.49,
  d: 0.76,
};

/**
 * Calculate elastic section modulus from I and h if not provided
 */
function getWel(section: ISectionProperties): number {
  if (section.Wel && section.Wel > 0) return section.Wel;
  // Wel = I / (h/2)
  return section.I / (section.h / 2);
}

/**
 * Calculate shear area Av for I-section (NEN-EN 1993-1-1, 6.2.6)
 * Av = A - 2*b*tf + (tw + 2*r)*tf  ~=  hw * tw  for hot-rolled I-sections
 */
function getShearArea(section: ISectionProperties): number {
  if (section.tw && section.h) {
    const twM = (section.tw ?? 0) / 1000; // mm -> m
    const tfM = (section.tf ?? 0) / 1000;
    const hw = section.h - 2 * tfM;
    // Simplified: Av = hw * tw (conservative)
    return Math.max(hw * twM, section.A * 0.5);
  }
  // Fallback: assume Av ~ A * h_web/h ~ 0.6*A for typical I-sections
  return section.A * 0.6;
}

/**
 * Get or approximate Iz (weak axis second moment of area)
 */
function getIz(section: ISectionProperties): number | null {
  if (section.Iz && section.Iz > 0) return section.Iz;
  // Approximate for I-sections if b and tf are known
  if (section.b && section.tf) {
    const bM = section.b / 1000; // mm -> m
    const tfM = section.tf / 1000;
    const twM = (section.tw ?? 0) / 1000;
    const hw = section.h - 2 * tfM;
    // Iz = 2*(tf*b^3/12) + hw*tw^3/12
    return 2 * (tfM * Math.pow(bM, 3) / 12) + hw * Math.pow(twM, 3) / 12;
  }
  return null;
}

/**
 * Get or approximate It (torsion constant)
 * For open thin-walled sections: It ~ sum(b*t^3/3)
 */
function getIt(section: ISectionProperties): number | null {
  if (section.It && section.It > 0) return section.It;
  if (section.b && section.tf && section.tw) {
    const bM = section.b / 1000;
    const tfM = section.tf / 1000;
    const twM = section.tw / 1000;
    const hw = section.h - 2 * tfM;
    // It = 2 * (b * tf^3 / 3) + hw * tw^3 / 3
    return 2 * (bM * Math.pow(tfM, 3) / 3) + hw * Math.pow(twM, 3) / 3;
  }
  return null;
}

/**
 * Get or approximate Iw (warping constant)
 * For doubly-symmetric I-sections: Iw = Iz * (h - tf)^2 / 4
 */
function getIw(section: ISectionProperties, Iz: number): number | null {
  if (section.Iw && section.Iw > 0) return section.Iw;
  if (section.tf) {
    const tfM = section.tf / 1000;
    return Iz * Math.pow(section.h - tfM, 2) / 4;
  }
  return null;
}

/**
 * Determine buckling curve for LTB based on h/b ratio (NEN-EN 1993-1-1, Table 6.4)
 * For rolled I-sections:
 * - h/b > 2: curve a (alpha_LT = 0.21)
 * - h/b <= 2: curve b (alpha_LT = 0.34)
 */
function getLTBucklingCurve(section: ISectionProperties): string {
  if (section.b && section.b > 0) {
    const hMm = section.h * 1000;
    const ratio = hMm / section.b;
    return ratio > 2 ? 'a' : 'b';
  }
  return 'b'; // conservative default
}

/**
 * Determine buckling curve for flexural buckling (NEN-EN 1993-1-1, Table 6.2)
 * Simplified: for rolled I-sections about strong axis
 * - h/b > 1.2, tf <= 40mm: curve a
 * - h/b > 1.2, tf > 40mm: curve b
 * - h/b <= 1.2, tf <= 100mm: curve b
 * - h/b <= 1.2, tf > 100mm: curve d
 */
function getFlexuralBucklingCurve(section: ISectionProperties): string {
  if (section.b && section.b > 0 && section.tf) {
    const hMm = section.h * 1000;
    const ratio = hMm / section.b;
    if (ratio > 1.2) {
      return section.tf <= 40 ? 'a' : 'b';
    } else {
      return section.tf <= 100 ? 'b' : 'd';
    }
  }
  return 'b'; // conservative default
}

/**
 * Calculate chi reduction factor for buckling (NEN-EN 1993-1-1, §6.3.1.2)
 * Phi = 0.5 * [1 + alpha*(lambda - 0.2) + lambda^2]
 * chi = 1 / (Phi + sqrt(Phi^2 - lambda^2))
 * chi <= 1.0
 */
function calculateChi(lambda: number, alpha: number): number {
  if (lambda <= 0.2) return 1.0;
  const phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
  const chi = 1 / (phi + Math.sqrt(phi * phi - lambda * lambda));
  return Math.min(chi, 1.0);
}

/**
 * Calculate member buckling resistance (NEN-EN 1993-1-1, §6.3.1)
 * Returns { NbRd, UC_buckling } or null if check is not applicable
 */
function checkMemberBuckling(
  section: ISectionProperties,
  NEd: number,
  beamLength: number,
  grade: ISteelGrade
): { NbRd: number; UC_buckling: number } {
  if (NEd <= 0 || beamLength <= 0) {
    return { NbRd: 0, UC_buckling: 0 };
  }

  const fy = grade.fy * 1e6; // MPa -> Pa
  const gammaM1 = grade.gammaM1;
  const E = 210e9; // Pa (steel)

  // Euler critical force about strong axis
  const Ncr = Math.PI * Math.PI * E * section.I / (beamLength * beamLength);

  if (Ncr <= 0) return { NbRd: 0, UC_buckling: 0 };

  // Non-dimensional slenderness
  const lambda = Math.sqrt(section.A * fy / Ncr);

  // Get buckling curve and imperfection factor
  const curve = getFlexuralBucklingCurve(section);
  const alpha = BUCKLING_ALPHA[curve] ?? 0.34;

  // Reduction factor
  const chi = calculateChi(lambda, alpha);

  // Buckling resistance
  const NbRd = chi * section.A * fy / gammaM1;

  const UC_buckling = NbRd > 0 ? NEd / NbRd : 0;

  return { NbRd, UC_buckling };
}

/**
 * Calculate the effective unbraced length for LTB based on lateral bracing positions.
 *
 * For sagging (positive moment, compression in top flange): use top bracing positions
 * For hogging (negative moment, compression in bottom flange): use bottom bracing positions
 *
 * The effective length is the maximum distance between adjacent bracing points.
 *
 * @param beamLength - Total beam length (m)
 * @param bracing - Lateral bracing positions (0-1 fractions)
 * @param momentSign - Sign of the governing moment: 'positive' (sagging) or 'negative' (hogging)
 * @returns Effective unbraced length for LTB (m)
 */
function calculateEffectiveLTBLength(
  beamLength: number,
  bracing: ILateralBracing | undefined,
  momentSign: 'positive' | 'negative'
): number {
  if (!bracing) {
    // No lateral bracing defined, use full beam length
    return beamLength;
  }

  // Select bracing positions based on moment sign
  // Positive moment (sagging): compression in top flange -> use top bracing
  // Negative moment (hogging): compression in bottom flange -> use bottom bracing
  const positions = momentSign === 'positive' ? bracing.top : bracing.bottom;

  if (!positions || positions.length === 0) {
    // No bracing on the relevant flange, use full beam length
    return beamLength;
  }

  // Ensure positions include beam ends (0 and 1) and sort them
  const allPositions = [...new Set([0, ...positions, 1])].sort((a, b) => a - b);

  // Find maximum distance between adjacent bracing points
  let maxSpan = 0;
  for (let i = 1; i < allPositions.length; i++) {
    const span = allPositions[i] - allPositions[i - 1];
    if (span > maxSpan) {
      maxSpan = span;
    }
  }

  // Convert fraction to actual length
  return maxSpan * beamLength;
}

/**
 * Determine the sign of the governing moment for LTB check.
 * Looks at the moment distribution to find the dominant sign.
 *
 * @param beamForces - Beam forces from analysis
 * @returns 'positive' for sagging (compression in top), 'negative' for hogging (compression in bottom)
 */
function getGoverningMomentSign(beamForces: IBeamForces): 'positive' | 'negative' {
  // Check station data for moment distribution
  if (beamForces.bendingMoment && beamForces.bendingMoment.length > 0) {
    let maxPositive = 0;
    let maxNegative = 0;

    for (const m of beamForces.bendingMoment) {
      if (m > maxPositive) maxPositive = m;
      if (m < maxNegative) maxNegative = m;
    }

    // Return sign of the moment with larger absolute value
    return Math.abs(maxPositive) >= Math.abs(maxNegative) ? 'positive' : 'negative';
  }

  // Fallback: check end moments
  const m1 = beamForces.M1;
  const m2 = beamForces.M2;
  const maxM = beamForces.maxM;

  // Compare absolute values of all available moments
  const maxPositive = Math.max(0, m1, m2, maxM);
  const maxNegative = Math.min(0, m1, m2, -maxM);

  return Math.abs(maxPositive) >= Math.abs(maxNegative) ? 'positive' : 'negative';
}

/**
 * Calculate lateral torsional buckling resistance (NEN-EN 1993-1-1, §6.3.2)
 *
 * When lateral bracing is provided, the effective unbraced length is the maximum
 * distance between adjacent bracing points on the compression flange.
 *
 * @param section - Section properties
 * @param MEd - Design bending moment (N.m)
 * @param beamLength - Total beam length (m)
 * @param grade - Steel grade properties
 * @param bracing - Optional lateral bracing positions
 * @param beamForces - Optional beam forces for determining moment sign
 * @returns { MbRd, UC_LTB, Lcr_LTB } where Lcr_LTB is the effective unbraced length used
 */
function checkLTB(
  section: ISectionProperties,
  MEd: number,
  beamLength: number,
  grade: ISteelGrade,
  bracing?: ILateralBracing,
  beamForces?: IBeamForces
): { MbRd: number; UC_LTB: number; Lcr_LTB: number } {
  if (MEd <= 0 || beamLength <= 0) {
    return { MbRd: 0, UC_LTB: 0, Lcr_LTB: 0 };
  }

  const fy = grade.fy * 1e6; // MPa -> Pa
  const gammaM1 = grade.gammaM1;
  const E = 210e9; // Pa
  const G = 81e9;  // Pa (shear modulus for steel)

  // Get section properties for LTB
  const Iz = getIz(section);
  if (Iz === null || Iz <= 0) {
    return { MbRd: 0, UC_LTB: 0, Lcr_LTB: 0 }; // Insufficient data, skip LTB check
  }

  const It = getIt(section);
  if (It === null || It <= 0) {
    return { MbRd: 0, UC_LTB: 0, Lcr_LTB: 0 };
  }

  const Iw = getIw(section, Iz);
  if (Iw === null || Iw <= 0) {
    return { MbRd: 0, UC_LTB: 0, Lcr_LTB: 0 };
  }

  const Wy = getWel(section);

  // Determine effective unbraced length based on lateral bracing
  const momentSign = beamForces ? getGoverningMomentSign(beamForces) : 'positive';
  const Lcr = calculateEffectiveLTBLength(beamLength, bracing, momentSign);

  // C1 = 1.0 for uniform moment distribution (conservative)
  // k = 1.0 for fork supports at both ends of each unbraced segment
  const C1 = 1.0;
  const k = 1.0;
  const kL = k * Lcr;

  // Elastic critical moment for LTB (simplified formula)
  // Mcr = C1 * (pi^2 * E * Iz) / (kL)^2 * sqrt(Iw/Iz + (kL)^2 * G * It / (pi^2 * E * Iz))
  const pi2EIz = Math.PI * Math.PI * E * Iz;
  const kL2 = kL * kL;
  const term1 = pi2EIz / kL2;
  const term2 = Math.sqrt(Iw / Iz + kL2 * G * It / pi2EIz);
  const Mcr = C1 * term1 * term2;

  if (Mcr <= 0) return { MbRd: 0, UC_LTB: 0, Lcr_LTB: Lcr };

  // Non-dimensional slenderness for LTB
  const lambdaLT = Math.sqrt(Wy * fy / Mcr);

  // LTB buckling curve
  const curve = getLTBucklingCurve(section);
  const alphaLT = BUCKLING_ALPHA[curve] ?? 0.34;

  // LTB reduction factor
  // Phi_LT = 0.5 * [1 + alpha_LT * (lambda_LT - 0.2) + lambda_LT^2]
  // chi_LT = 1 / (Phi_LT + sqrt(Phi_LT^2 - lambda_LT^2))
  const chiLT = calculateChi(lambdaLT, alphaLT);

  // LTB resistance
  const MbRd = chiLT * Wy * fy / gammaM1;

  const UC_LTB = MbRd > 0 ? MEd / MbRd : 0;

  return { MbRd, UC_LTB, Lcr_LTB: Lcr };
}

/**
 * Find critical check locations along the beam
 * Returns positions where checks should be performed:
 * - Location of Mmax (maximum positive moment)
 * - Location of Mmin (maximum negative moment)
 * - Location of Vmax (maximum positive shear)
 * - Location of Vmin (maximum negative shear)
 * - Location of Nmax (maximum positive normal force)
 * - Location of Nmin (maximum negative normal force)
 * - Every checkInterval mm along the beam
 *
 * @param beamForces - Forces along the beam
 * @param beamLength - Length of the beam (m)
 * @param checkIntervalMm - Interval for checks along beam (mm, default 100)
 */
function findCriticalLocations(beamForces: IBeamForces, beamLength: number, checkIntervalMm: number = 100): ICheckLocation[] {
  const locations: ICheckLocation[] = [];
  const addedPositions = new Set<string>(); // To avoid duplicates (use string key for floating point comparison)

  const addLocation = (position: number, locationType: string) => {
    // Clamp position to beam length
    const pos = Math.max(0, Math.min(position, beamLength));
    const posRatio = beamLength > 0 ? pos / beamLength : 0;
    // Use a tolerance of 1mm for deduplication
    const key = pos.toFixed(4);
    if (!addedPositions.has(key)) {
      addedPositions.add(key);
      locations.push({
        position: pos,
        positionRatio: posRatio,
        locationType,
      });
    }
  };

  // Always add beam ends
  addLocation(0, 'Start');
  addLocation(beamLength, 'End');

  // Find critical locations from station data if available
  if (beamForces.stations && beamForces.stations.length > 0) {
    const stations = beamForces.stations;
    const N = beamForces.normalForce || [];
    const V = beamForces.shearForce || [];
    const M = beamForces.bendingMoment || [];

    // Find Mmax and Mmin locations
    let maxM = -Infinity, minM = Infinity;
    let maxMIdx = 0, minMIdx = 0;
    for (let i = 0; i < M.length; i++) {
      if (M[i] > maxM) { maxM = M[i]; maxMIdx = i; }
      if (M[i] < minM) { minM = M[i]; minMIdx = i; }
    }
    if (M.length > 0 && maxM > 0) {
      addLocation(stations[maxMIdx], 'Mmax');
    }
    if (M.length > 0 && minM < 0) {
      addLocation(stations[minMIdx], 'Mmin');
    }

    // Find Vmax and Vmin locations
    let maxV = -Infinity, minV = Infinity;
    let maxVIdx = 0, minVIdx = 0;
    for (let i = 0; i < V.length; i++) {
      if (V[i] > maxV) { maxV = V[i]; maxVIdx = i; }
      if (V[i] < minV) { minV = V[i]; minVIdx = i; }
    }
    if (V.length > 0 && maxV > 0) {
      addLocation(stations[maxVIdx], 'Vmax');
    }
    if (V.length > 0 && minV < 0) {
      addLocation(stations[minVIdx], 'Vmin');
    }

    // Find Nmax and Nmin locations
    let maxN = -Infinity, minN = Infinity;
    let maxNIdx = 0, minNIdx = 0;
    for (let i = 0; i < N.length; i++) {
      if (N[i] > maxN) { maxN = N[i]; maxNIdx = i; }
      if (N[i] < minN) { minN = N[i]; minNIdx = i; }
    }
    if (N.length > 0 && maxN > 0) {
      addLocation(stations[maxNIdx], 'Nmax');
    }
    if (N.length > 0 && minN < 0) {
      addLocation(stations[minNIdx], 'Nmin');
    }
  }

  // Add locations every checkIntervalMm along the beam
  const stepSize = checkIntervalMm / 1000; // Convert mm to m
  let pos = stepSize;
  while (pos < beamLength - 0.001) { // Small tolerance to avoid duplicating end
    addLocation(pos, `x=${(pos * 1000).toFixed(0)}mm`);
    pos += stepSize;
  }

  // Sort locations by position
  locations.sort((a, b) => a.position - b.position);

  return locations;
}

/**
 * Interpolate force value at a specific position along the beam
 */
function interpolateForce(stations: number[], values: number[], position: number): number {
  if (stations.length === 0 || values.length === 0) return 0;
  if (stations.length !== values.length) return 0;

  // If position is before first station or after last station, extrapolate from nearest
  if (position <= stations[0]) return values[0];
  if (position >= stations[stations.length - 1]) return values[values.length - 1];

  // Find the two stations that bracket the position
  for (let i = 0; i < stations.length - 1; i++) {
    if (position >= stations[i] && position <= stations[i + 1]) {
      const t = (position - stations[i]) / (stations[i + 1] - stations[i]);
      return values[i] + t * (values[i + 1] - values[i]);
    }
  }

  return 0;
}

/**
 * Get forces at a specific location along the beam
 */
function getForcesAtLocation(beamForces: IBeamForces, position: number): { N: number; V: number; M: number } {
  if (!beamForces.stations || beamForces.stations.length === 0) {
    // Fallback: return maximum absolute values
    return {
      N: Math.max(Math.abs(beamForces.N1), Math.abs(beamForces.N2)),
      V: Math.max(Math.abs(beamForces.V1), Math.abs(beamForces.V2)),
      M: Math.max(Math.abs(beamForces.M1), Math.abs(beamForces.M2)),
    };
  }

  return {
    N: interpolateForce(beamForces.stations, beamForces.normalForce || [], position),
    V: interpolateForce(beamForces.stations, beamForces.shearForce || [], position),
    M: interpolateForce(beamForces.stations, beamForces.bendingMoment || [], position),
  };
}

/**
 * Perform cross-section check at a single location
 */
function checkAtLocation(
  _section: ISectionProperties,
  forces: { N: number; V: number; M: number },
  resistances: { NcRd: number; VcRd: number; McRd: number },
  location: ICheckLocation
): ILocationCheckResult {
  const { NcRd, VcRd, McRd } = resistances;

  // Use absolute values for design forces
  const NEd = Math.abs(forces.N);
  const VEd = Math.abs(forces.V);
  const MEd = Math.abs(forces.M);

  // Unity checks
  const UC_N = NcRd > 0 ? NEd / NcRd : 0;
  const UC_V = VcRd > 0 ? VEd / VcRd : 0;
  const UC_M = McRd > 0 ? MEd / McRd : 0;

  // 6.2.8 — Combined bending and axial force
  const UC_MN = UC_N + UC_M;

  // 6.2.10 — Reduced bending resistance due to shear
  let UC_MV = UC_M;
  if (VEd > 0.5 * VcRd) {
    const rho = Math.pow((2 * VEd / VcRd - 1), 2);
    const MvRd = McRd * (1 - rho);
    UC_MV = MvRd > 0 ? MEd / MvRd : 999;
  }

  // Find governing check at this location
  const checks: [number, string][] = [
    [UC_N, 'Axial (6.2.4)'],
    [UC_V, 'Shear (6.2.6)'],
    [UC_M, 'Bending (6.2.5)'],
    [UC_MN, 'M+N (6.2.8)'],
    [UC_MV, 'M+V (6.2.10)'],
  ];

  let UC_max = 0;
  let governingCheck = '';
  for (const [uc, name] of checks) {
    if (uc > UC_max) {
      UC_max = uc;
      governingCheck = name;
    }
  }

  return {
    location,
    NEd,
    VEd,
    MEd,
    UC_N,
    UC_V,
    UC_M,
    UC_MN,
    UC_MV,
    UC_max,
    governingCheck,
  };
}

/**
 * Calculate deflection unity check (SLS)
 *
 * @param beamLength - Beam span length (m)
 * @param maxDeflection - Maximum vertical deflection (m), absolute value
 * @param limitDivisor - L/limitDivisor is the allowable deflection (default: 250 for permanent, 300 for variable)
 * @returns { UC_deflection, deflectionActual, deflectionLimit }
 */
export function checkDeflection(
  beamLength: number,
  maxDeflection: number,
  limitDivisor: number = 250
): { UC_deflection: number; deflectionActual: number; deflectionLimit: number } {
  if (beamLength <= 0 || limitDivisor <= 0) {
    return { UC_deflection: 0, deflectionActual: 0, deflectionLimit: 0 };
  }

  const deflectionLimit = beamLength / limitDivisor;
  const deflectionActual = Math.abs(maxDeflection);
  const UC_deflection = deflectionLimit > 0 ? deflectionActual / deflectionLimit : 0;

  return { UC_deflection, deflectionActual, deflectionLimit };
}

/**
 * Perform NEN-EN 1993-1-1 cross-section resistance checks at multiple locations
 * plus member stability checks (buckling, LTB) and deflection check.
 *
 * Checks are performed at:
 * - Location of Mmax (maximum positive moment)
 * - Location of Mmin (maximum negative moment)
 * - Location of Vmax (maximum positive shear)
 * - Location of Vmin (maximum negative shear)
 * - Location of Nmax (maximum positive normal force)
 * - Location of Nmin (maximum negative normal force)
 * - Every checkIntervalMm along the beam
 *
 * Returns the governing (highest unity check) result with location info.
 *
 * @param checkIntervalMm - Interval for checks along beam (mm, default 100)
 * @param lateralBracing - Optional lateral bracing positions for LTB calculation
 */
export function checkSteelSection(
  section: ISectionProperties,
  beamForces: IBeamForces,
  grade: ISteelGrade,
  beamLength: number = 0,
  maxDeflection: number = 0,
  deflectionLimitDivisor: number = 250,
  includeAllLocations: boolean = false,
  checkIntervalMm: number = 100,
  lateralBracing?: ILateralBracing
): ISteelCheckResult {
  const fy = grade.fy * 1e6; // MPa -> Pa
  const gammaM0 = grade.gammaM0;

  // Section properties
  const A = section.A;
  const Wel = getWel(section);
  const Av = getShearArea(section);

  // Design resistances (NEN-EN 1993-1-1)
  // 6.2.3 — Tension resistance
  const NtRd = (A * fy) / gammaM0;

  // 6.2.4 — Compression resistance (cross-section, no buckling)
  const NcRd = (A * fy) / gammaM0;

  // 6.2.5 — Bending resistance (elastic)
  const McRd = (Wel * fy) / gammaM0;

  // 6.2.6 — Shear resistance
  const VcRd = (Av * (fy / Math.sqrt(3))) / gammaM0;

  const resistances = { NcRd, VcRd, McRd };

  // Find all critical check locations
  const effectiveLength = beamLength > 0 ? beamLength : 1; // Use 1m as fallback
  const locations = findCriticalLocations(beamForces, effectiveLength, checkIntervalMm);

  // Perform checks at all locations
  const locationResults: ILocationCheckResult[] = [];
  let governingLocationResult: ILocationCheckResult | null = null;
  let maxLocationUC = 0;

  for (const location of locations) {
    const forces = getForcesAtLocation(beamForces, location.position);
    const result = checkAtLocation(section, forces, resistances, location);
    locationResults.push(result);

    if (result.UC_max > maxLocationUC) {
      maxLocationUC = result.UC_max;
      governingLocationResult = result;
    }
  }

  // Default location if no checks were performed
  const defaultLocation: ICheckLocation = {
    position: 0,
    positionRatio: 0,
    locationType: 'Start',
  };

  // Get governing cross-section check values
  const govResult = governingLocationResult || {
    location: defaultLocation,
    NEd: 0,
    VEd: 0,
    MEd: 0,
    UC_N: 0,
    UC_V: 0,
    UC_M: 0,
    UC_MN: 0,
    UC_MV: 0,
    UC_max: 0,
    governingCheck: '',
  };

  // For member stability checks, use maximum forces along the beam
  const maxNEd = Math.max(
    Math.abs(beamForces.maxN),
    Math.abs(beamForces.N1),
    Math.abs(beamForces.N2),
    ...locationResults.map(r => r.NEd)
  );
  const maxMEd = Math.max(
    Math.abs(beamForces.maxM),
    Math.abs(beamForces.M1),
    Math.abs(beamForces.M2),
    ...locationResults.map(r => r.MEd)
  );

  // Member buckling check (6.3.1) — only if compression and beam length known
  const { NbRd, UC_buckling } = (beamLength > 0 && maxNEd > 0)
    ? checkMemberBuckling(section, maxNEd, beamLength, grade)
    : { NbRd: 0, UC_buckling: 0 };

  // Lateral torsional buckling check (6.3.2) — only if moment and beam length known
  // When lateral bracing is provided, effective LTB length is max span between bracing points
  const { MbRd, UC_LTB, Lcr_LTB } = (beamLength > 0 && maxMEd > 0)
    ? checkLTB(section, maxMEd, beamLength, grade, lateralBracing, beamForces)
    : { MbRd: 0, UC_LTB: 0, Lcr_LTB: 0 };

  // Deflection check (SLS)
  const { UC_deflection, deflectionActual, deflectionLimit } =
    checkDeflection(beamLength, maxDeflection, deflectionLimitDivisor);

  // Determine overall governing check including member stability
  let UC_max = govResult.UC_max;
  let governingCheck = govResult.governingCheck;
  let governingLocation = govResult.location;

  // Check if buckling governs
  if (UC_buckling > UC_max) {
    UC_max = UC_buckling;
    governingCheck = 'Buckling (6.3.1)';
    // Find location of max compression
    const maxNLocation = locationResults.reduce((max, r) =>
      r.NEd > max.NEd ? r : max, locationResults[0]);
    if (maxNLocation) {
      governingLocation = maxNLocation.location;
    }
  }

  // Check if LTB governs
  if (UC_LTB > UC_max) {
    UC_max = UC_LTB;
    governingCheck = 'LTB (6.3.2)';
    // Find location of max moment
    const maxMLocation = locationResults.reduce((max, r) =>
      r.MEd > max.MEd ? r : max, locationResults[0]);
    if (maxMLocation) {
      governingLocation = maxMLocation.location;
    }
  }

  // Check if deflection governs
  if (UC_deflection > UC_max) {
    UC_max = UC_deflection;
    governingCheck = 'Deflection (SLS)';
    governingLocation = {
      position: effectiveLength / 2,
      positionRatio: 0.5,
      locationType: 'Mid-span',
    };
  }

  // Build result with governing values
  const result: ISteelCheckResult = {
    elementId: beamForces.elementId,
    profileName: section.profileName || 'Unknown',
    steelGrade: grade.name,
    NcRd,
    NtRd,
    VcRd,
    McRd,
    // Use forces at governing location for cross-section checks
    NEd: govResult.NEd,
    VEd: govResult.VEd,
    MEd: govResult.MEd,
    UC_N: govResult.UC_N,
    UC_V: govResult.UC_V,
    UC_M: govResult.UC_M,
    UC_MN: govResult.UC_MN,
    UC_MV: govResult.UC_MV,
    UC_buckling,
    NbRd,
    UC_LTB,
    MbRd,
    Lcr_LTB,
    UC_deflection,
    deflectionActual,
    deflectionLimit,
    UC_max,
    status: UC_max <= 1.0 ? 'OK' : 'FAIL',
    governingCheck,
    governingLocation,
  };

  // Include all location results if requested (for detailed reporting)
  if (includeAllLocations) {
    result.checkedLocations = locationResults;
  }

  return result;
}

/**
 * Run steel checks on all beam elements
 *
 * @param checkIntervalMm - Interval for checks along beam (mm, default 100)
 * @param beamElements - Optional map of beam elements for lateral bracing info
 */
export function checkAllBeams(
  beamForces: Map<number, IBeamForces>,
  sectionMap: Map<number, ISectionProperties>,
  grade: ISteelGrade,
  beamLengths?: Map<number, number>,
  beamDeflections?: Map<number, number>,
  deflectionLimitDivisor?: number,
  checkIntervalMm?: number,
  beamElements?: Map<number, IBeamElement>
): ISteelCheckResult[] {
  const results: ISteelCheckResult[] = [];
  for (const [beamId, forces] of beamForces) {
    const section = sectionMap.get(beamId);
    if (!section) continue;
    const length = beamLengths?.get(beamId) ?? 0;
    const deflection = beamDeflections?.get(beamId) ?? 0;
    // Get lateral bracing from beam element if available
    const beam = beamElements?.get(beamId);
    const bracing = beam?.lateralBracing;
    results.push(checkSteelSection(
      section,
      forces,
      grade,
      length,
      deflection,
      deflectionLimitDivisor ?? 250,
      false,
      checkIntervalMm ?? 100,
      bracing
    ));
  }
  return results;
}
