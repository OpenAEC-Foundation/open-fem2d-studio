/**
 * Profile Optimizer — Iterates through steel profiles to find the optimal
 * section for a given criterion (deflection, weight, UC ratio).
 *
 * Provides API methods:
 *   - getAvailableProfiles()     : list all steel profiles in the library
 *   - profileToBeamSection()     : convert ISteelProfile to IBeamSection
 *   - setBeamProfile()           : change a beam's profile on the mesh
 *   - runAnalysis()              : trigger the solver and return results
 *   - getMaxDeflection()         : get max deflection for a beam or all beams
 *   - getMaxStress()             : get max stress for a beam or all beams
 *   - getUCRatio()               : get unity check ratio for a beam or all beams
 *   - optimizeProfile()          : optimize a beam's profile for a given criterion
 */

import { Mesh } from '../fem/Mesh';
import { IBeamSection, ISolverResult } from '../fem/types';
import { calculateBeamLength } from '../fem/Beam';
import { ILoadCase } from '../fem/LoadCase';
import { solve } from '../solver/SolverService';
import {
  ALL_STEEL_PROFILES,
  ISteelProfile,
  STEEL_SECTION_SERIES,
  STEEL_SERIES_NAMES,
} from '../data/SteelSections';
import { checkSteelSection, ISteelCheckResult, ISectionProperties } from '../standards/SteelCheck';
import { STEEL_GRADES, ISteelGrade } from '../standards/EurocodeNL';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptimizationCriterion = 'deflection' | 'weight' | 'UC' | 'stress';

export interface OptimizationConstraint {
  /** Maximum allowable UC ratio (default 1.0) */
  maxUC?: number;
  /** Maximum allowable deflection in mm (optional) */
  maxDeflectionMm?: number;
  /** Restrict to a specific series (e.g. 'IPE', 'HEA') */
  series?: string;
  /** Steel grade name (default 'S235') */
  steelGrade?: string;
  /** Deflection limit divisor L/x (default 250) */
  deflectionLimitDivisor?: number;
}

export interface OptimizationResult {
  success: boolean;
  message: string;
  details?: string;
  /** The selected optimal profile name */
  selectedProfile?: string;
  /** UC ratio for the selected profile */
  ucRatio?: number;
  /** Max deflection for the selected profile in mm */
  maxDeflectionMm?: number;
  /** Weight per meter of the selected profile in kg/m */
  weightPerMeter?: number;
  /** Number of profiles evaluated */
  profilesEvaluated?: number;
  /** All candidate results for reporting */
  candidates?: Array<{
    name: string;
    mass: number;
    UC: number;
    deflectionMm: number;
    status: 'OK' | 'FAIL';
  }>;
}

// ---------------------------------------------------------------------------
// Public API: Profile Library
// ---------------------------------------------------------------------------

/** Get all available steel profiles grouped by series. */
export function getAvailableProfiles(): { series: string; profiles: ISteelProfile[] }[] {
  return STEEL_SERIES_NAMES.map(series => ({
    series,
    profiles: STEEL_SECTION_SERIES[series],
  }));
}

/** Get all available series names. */
export function getAvailableSeries(): string[] {
  return [...STEEL_SERIES_NAMES];
}

/** Get a flat list of all profile names. */
export function getAllProfileNames(): string[] {
  return ALL_STEEL_PROFILES.map(p => p.name);
}

// ---------------------------------------------------------------------------
// Conversion: ISteelProfile -> IBeamSection
// ---------------------------------------------------------------------------

/**
 * Convert a steel profile (catalog data in mm/cm units) to the FEM beam
 * section interface (SI units: m, m^2, m^4, m^3).
 */
export function profileToBeamSection(profile: ISteelProfile): IBeamSection {
  return {
    A: profile.A * 1e-4,            // cm^2 -> m^2
    I: profile.Iy * 1e-8,           // cm^4 -> m^4
    h: profile.h * 1e-3,            // mm -> m
    Iy: profile.Iy * 1e-8,          // cm^4 -> m^4
    Iz: profile.Iz * 1e-8,          // cm^4 -> m^4
    Wy: profile.Wy * 1e-6,          // cm^3 -> m^3
    Wz: profile.Wz * 1e-6,          // cm^3 -> m^3
    Wply: profile.Wpl_y * 1e-6,     // cm^3 -> m^3
    Wplz: profile.Wpl_z * 1e-6,     // cm^3 -> m^3
  };
}

// ---------------------------------------------------------------------------
// Public API: Model Manipulation
// ---------------------------------------------------------------------------

/**
 * Change the profile of a beam element. Modifies the mesh in place.
 * Returns true if successful.
 */
export function setBeamProfile(
  mesh: Mesh,
  beamId: number,
  profile: ISteelProfile
): boolean {
  const beam = mesh.getBeamElement(beamId);
  if (!beam) return false;

  const section = profileToBeamSection(profile);
  mesh.updateBeamElement(beamId, {
    section,
    profileName: profile.name,
  });
  return true;
}

/**
 * Set the same profile on ALL beam elements in the mesh.
 */
export function setAllBeamsProfile(
  mesh: Mesh,
  profile: ISteelProfile
): number {
  let count = 0;
  for (const beam of mesh.beamElements.values()) {
    setBeamProfile(mesh, beam.id, profile);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Public API: Analysis Helpers
// ---------------------------------------------------------------------------

/**
 * Run the FEM analysis. Applies the given load case to the mesh first.
 * Returns the solver result.
 */
export async function runAnalysis(
  mesh: Mesh,
  loadCase: ILoadCase,
  applyLoadCaseFn: (mesh: Mesh, lc: ILoadCase) => void,
): Promise<ISolverResult> {
  applyLoadCaseFn(mesh, loadCase);
  return solve(mesh, {
    analysisType: 'frame',
    geometricNonlinear: false,
  });
}

/**
 * Get the maximum vertical deflection across all beams (or a specific beam).
 * Returns deflection in meters.
 */
export function getMaxDeflection(
  mesh: Mesh,
  result: ISolverResult,
  beamId?: number
): number {
  const nodeIds = new Set<number>();
  const beams = beamId
    ? [mesh.getBeamElement(beamId)].filter(Boolean)
    : Array.from(mesh.beamElements.values());

  for (const beam of beams) {
    if (!beam) continue;
    for (const nid of beam.nodeIds) {
      nodeIds.add(nid);
    }
  }

  // In frame analysis, each node has 3 DOFs: u, v, theta
  // We need the node ordering to index into the displacements array
  const allNodeIds = Array.from(mesh.nodes.keys()).sort((a, b) => a - b);
  let maxDefl = 0;

  for (const nid of nodeIds) {
    const idx = allNodeIds.indexOf(nid);
    if (idx === -1) continue;
    // v displacement is at index idx * 3 + 1
    const v = Math.abs(result.displacements[idx * 3 + 1] ?? 0);
    maxDefl = Math.max(maxDefl, v);
  }

  return maxDefl;
}

/**
 * Get the maximum bending stress for a beam or all beams (Pa).
 * sigma = M / Wy (elastic section modulus)
 */
export function getMaxStress(
  mesh: Mesh,
  result: ISolverResult,
  beamId?: number
): number {
  let maxStress = 0;

  const beams = beamId
    ? [mesh.getBeamElement(beamId)].filter(Boolean)
    : Array.from(mesh.beamElements.values());

  for (const beam of beams) {
    if (!beam) continue;
    const forces = result.beamForces.get(beam.id);
    if (!forces) continue;

    const Wy = beam.section.Wy ?? (beam.section.I / (beam.section.h / 2));
    if (Wy <= 0) continue;
    const sigma = Math.abs(forces.maxM) / Wy;
    maxStress = Math.max(maxStress, sigma);
  }

  return maxStress;
}

/**
 * Get the maximum unity check ratio for a beam or all beams.
 * Uses NEN-EN 1993-1-1 cross-section checks.
 *
 * @param checkIntervalMm - Interval for checks along beam (mm, default 100)
 */
export function getUCRatio(
  mesh: Mesh,
  result: ISolverResult,
  grade: ISteelGrade,
  beamId?: number,
  deflectionLimitDivisor: number = 250,
  checkIntervalMm: number = 100
): { maxUC: number; checkResults: ISteelCheckResult[] } {
  const beams = beamId
    ? [mesh.getBeamElement(beamId)].filter(Boolean)
    : Array.from(mesh.beamElements.values());

  let maxUC = 0;
  const checkResults: ISteelCheckResult[] = [];

  for (const beam of beams) {
    if (!beam) continue;
    const forces = result.beamForces.get(beam.id);
    if (!forces) continue;

    // Get beam length
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [n1, n2] = nodes;
    const length = calculateBeamLength(n1, n2);

    // Get max deflection for this beam
    const deflection = getMaxDeflectionForBeam(mesh, result, beam.id);

    // Build ISectionProperties from beam section
    const sectionProps: ISectionProperties = {
      A: beam.section.A,
      I: beam.section.I,
      h: beam.section.h,
      Wel: beam.section.Wy,
      b: beam.section.b ? beam.section.b * 1000 : undefined,     // m -> mm
      tf: beam.section.tf ? beam.section.tf * 1000 : undefined,   // m -> mm
      tw: beam.section.tw ? beam.section.tw * 1000 : undefined,   // m -> mm
      Iz: beam.section.Iz,
      It: beam.section.It,
      Iw: beam.section.Iw,
      profileName: beam.profileName,
    };

    const checkResult = checkSteelSection(
      sectionProps,
      forces,
      grade,
      length,
      deflection,
      deflectionLimitDivisor,
      false,
      checkIntervalMm
    );
    checkResults.push(checkResult);
    maxUC = Math.max(maxUC, checkResult.UC_max);
  }

  return { maxUC, checkResults };
}

/** Helper: max vertical deflection for a specific beam's nodes. */
function getMaxDeflectionForBeam(
  mesh: Mesh,
  result: ISolverResult,
  beamId: number
): number {
  const beam = mesh.getBeamElement(beamId);
  if (!beam) return 0;

  const allNodeIds = Array.from(mesh.nodes.keys()).sort((a, b) => a - b);
  let maxDefl = 0;

  for (const nid of beam.nodeIds) {
    const idx = allNodeIds.indexOf(nid);
    if (idx === -1) continue;
    const v = Math.abs(result.displacements[idx * 3 + 1] ?? 0);
    maxDefl = Math.max(maxDefl, v);
  }

  return maxDefl;
}

// ---------------------------------------------------------------------------
// Public API: Profile Optimization
// ---------------------------------------------------------------------------

/**
 * Optimize the profile of a beam (or all beams) for a given criterion.
 *
 * This function iterates through candidate steel profiles, applies each one,
 * runs the analysis, and scores them according to the criterion.
 *
 * Criteria:
 *   - 'deflection': minimize deflection while satisfying constraints
 *   - 'weight':     minimize profile weight (kg/m) while satisfying constraints
 *   - 'UC':         find the profile with UC closest to but <= maxUC
 *   - 'stress':     minimize maximum stress while satisfying constraints
 *
 * @param mesh - The mesh object (modified in place with the optimal profile)
 * @param loadCase - The load case to analyze under
 * @param applyLoadCaseFn - Function to apply load case to mesh
 * @param beamId - Specific beam to optimize (if undefined, optimizes all beams together)
 * @param criterion - Optimization criterion
 * @param constraints - Optional constraints
 * @param onProgress - Optional callback for progress reporting
 */
export async function optimizeProfile(
  mesh: Mesh,
  loadCase: ILoadCase,
  applyLoadCaseFn: (mesh: Mesh, lc: ILoadCase) => void,
  beamId: number | undefined,
  criterion: OptimizationCriterion,
  constraints?: OptimizationConstraint,
  onProgress?: (message: string) => void,
): Promise<OptimizationResult> {
  const maxUCLimit = constraints?.maxUC ?? 1.0;
  const seriesFilter = constraints?.series?.toUpperCase();
  const gradeName = constraints?.steelGrade ?? 'S235';
  const deflLimitDiv = constraints?.deflectionLimitDivisor ?? 250;

  const grade = STEEL_GRADES.find(g => g.name === gradeName) ?? STEEL_GRADES[0];

  // Determine candidate profiles
  let candidates: ISteelProfile[];
  if (seriesFilter && STEEL_SECTION_SERIES[seriesFilter]) {
    candidates = STEEL_SECTION_SERIES[seriesFilter];
  } else if (seriesFilter) {
    // Try to find by partial match
    const key = STEEL_SERIES_NAMES.find(s => s.toUpperCase().includes(seriesFilter));
    candidates = key ? STEEL_SECTION_SERIES[key] : ALL_STEEL_PROFILES;
  } else {
    // Auto-detect: if beam has a profile, use the same series
    const targetBeams = beamId
      ? [mesh.getBeamElement(beamId)].filter(Boolean)
      : Array.from(mesh.beamElements.values());

    const currentProfileName = targetBeams[0]?.profileName ?? '';
    const currentSeries = ALL_STEEL_PROFILES.find(
      p => p.name === currentProfileName
    )?.series;

    if (currentSeries && STEEL_SECTION_SERIES[currentSeries]) {
      candidates = STEEL_SECTION_SERIES[currentSeries];
    } else {
      // Default to IPE series for beams
      candidates = STEEL_SECTION_SERIES['IPE'] ?? ALL_STEEL_PROFILES;
    }
  }

  // Sort candidates by Iy (ascending) for efficient search
  candidates = [...candidates].sort((a, b) => a.Iy - b.Iy);

  onProgress?.(`Evaluating ${candidates.length} profiles from ${candidates[0]?.series ?? 'mixed'} series...`);

  // Save original sections so we can restore if needed
  const originalSections = new Map<number, { section: IBeamSection; profileName?: string }>();
  const targetBeamIds: number[] = [];

  if (beamId) {
    const beam = mesh.getBeamElement(beamId);
    if (beam) {
      originalSections.set(beam.id, { section: { ...beam.section }, profileName: beam.profileName });
      targetBeamIds.push(beam.id);
    }
  } else {
    for (const beam of mesh.beamElements.values()) {
      originalSections.set(beam.id, { section: { ...beam.section }, profileName: beam.profileName });
      targetBeamIds.push(beam.id);
    }
  }

  if (targetBeamIds.length === 0) {
    return { success: false, message: 'No beam elements found to optimize.' };
  }

  // Evaluate each candidate
  interface CandidateResult {
    profile: ISteelProfile;
    maxUC: number;
    maxDeflMm: number;
    feasible: boolean;
  }

  const results: CandidateResult[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const profile = candidates[i];

    if (i % 3 === 0) {
      onProgress?.(`Testing ${profile.name} (${i + 1}/${candidates.length})...`);
    }

    // Apply profile to target beams
    for (const bid of targetBeamIds) {
      setBeamProfile(mesh, bid, profile);
    }

    try {
      // Run analysis
      const solverResult = await runAnalysis(mesh, loadCase, applyLoadCaseFn);

      // Get UC ratio
      const { maxUC } = getUCRatio(mesh, solverResult, grade, beamId, deflLimitDiv);

      // Get max deflection
      const maxDefl = getMaxDeflection(mesh, solverResult, beamId);
      const maxDeflMm = maxDefl * 1000;

      // Check feasibility
      let feasible = maxUC <= maxUCLimit;
      if (constraints?.maxDeflectionMm && maxDeflMm > constraints.maxDeflectionMm) {
        feasible = false;
      }

      results.push({ profile, maxUC, maxDeflMm, feasible });
    } catch {
      // Solver failed for this profile (e.g. singular matrix for very small section)
      results.push({ profile, maxUC: 999, maxDeflMm: 999, feasible: false });
    }
  }

  // Find optimal profile based on criterion
  const feasible = results.filter(r => r.feasible);

  if (feasible.length === 0) {
    // Restore original sections
    for (const [bid, orig] of originalSections) {
      mesh.updateBeamElement(bid, { section: orig.section, profileName: orig.profileName });
    }

    return {
      success: false,
      message: 'No feasible profile found within constraints.',
      details: `Evaluated ${results.length} profiles. All exceeded UC limit of ${maxUCLimit.toFixed(2)} or deflection constraints.`,
      profilesEvaluated: results.length,
      candidates: results.map(r => ({
        name: r.profile.name,
        mass: r.profile.mass,
        UC: Math.round(r.maxUC * 100) / 100,
        deflectionMm: Math.round(r.maxDeflMm * 100) / 100,
        status: r.feasible ? 'OK' as const : 'FAIL' as const,
      })),
    };
  }

  let optimal: CandidateResult;

  switch (criterion) {
    case 'weight':
      // Minimize weight (kg/m) among feasible profiles
      optimal = feasible.reduce((best, r) =>
        r.profile.mass < best.profile.mass ? r : best
      );
      break;

    case 'deflection':
      // Minimize deflection among feasible profiles
      optimal = feasible.reduce((best, r) =>
        r.maxDeflMm < best.maxDeflMm ? r : best
      );
      break;

    case 'UC':
      // Find profile with UC closest to maxUCLimit (most efficient use)
      optimal = feasible.reduce((best, r) =>
        Math.abs(r.maxUC - maxUCLimit) < Math.abs(best.maxUC - maxUCLimit) ? r : best
      );
      break;

    case 'stress':
      // For stress, minimize UC which is correlated with stress
      // Among feasible solutions, pick the smallest section that still passes
      optimal = feasible.reduce((best, r) =>
        r.profile.mass < best.profile.mass ? r : best
      );
      break;

    default:
      optimal = feasible[0];
  }

  // Apply optimal profile to the mesh
  for (const bid of targetBeamIds) {
    setBeamProfile(mesh, bid, optimal.profile);
  }

  onProgress?.(`Optimal profile: ${optimal.profile.name} (UC=${optimal.maxUC.toFixed(2)}, defl=${optimal.maxDeflMm.toFixed(1)}mm)`);

  // Build details string
  const detailLines: string[] = [
    `Criterion: ${criterion}`,
    `Steel grade: ${grade.name}`,
    `Series: ${optimal.profile.series}`,
    `Profiles evaluated: ${results.length}`,
    `Feasible profiles: ${feasible.length}`,
    ``,
    `Selected: ${optimal.profile.name}`,
    `  Weight: ${optimal.profile.mass} kg/m`,
    `  UC ratio: ${optimal.maxUC.toFixed(3)}`,
    `  Max deflection: ${optimal.maxDeflMm.toFixed(2)} mm`,
    `  h=${optimal.profile.h}mm, b=${optimal.profile.b}mm`,
    `  Iy=${optimal.profile.Iy} cm4, A=${optimal.profile.A} cm2`,
    ``,
    `All evaluated profiles:`,
  ];

  for (const r of results) {
    const marker = r.profile.name === optimal.profile.name ? ' <-- selected' : '';
    const status = r.feasible ? 'OK' : 'FAIL';
    detailLines.push(
      `  ${r.profile.name.padEnd(18)} ${r.profile.mass.toString().padStart(6)} kg/m  UC=${r.maxUC.toFixed(3).padStart(6)}  defl=${r.maxDeflMm.toFixed(1).padStart(6)}mm  [${status}]${marker}`
    );
  }

  return {
    success: true,
    message: `Optimal profile: ${optimal.profile.name} (${optimal.profile.mass} kg/m, UC=${optimal.maxUC.toFixed(2)}, deflection=${optimal.maxDeflMm.toFixed(1)}mm)`,
    details: detailLines.join('\n'),
    selectedProfile: optimal.profile.name,
    ucRatio: optimal.maxUC,
    maxDeflectionMm: optimal.maxDeflMm,
    weightPerMeter: optimal.profile.mass,
    profilesEvaluated: results.length,
    candidates: results.map(r => ({
      name: r.profile.name,
      mass: r.profile.mass,
      UC: Math.round(r.maxUC * 1000) / 1000,
      deflectionMm: Math.round(r.maxDeflMm * 100) / 100,
      status: r.feasible ? 'OK' as const : 'FAIL' as const,
    })),
  };
}
