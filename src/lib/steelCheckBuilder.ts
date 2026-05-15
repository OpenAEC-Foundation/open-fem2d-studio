import { Mesh } from '../core/fem/Mesh';
import { ISolverResult } from '../core/fem/types';
import { IProjectInfo, IBeamSteelConfig } from '../context/FEMContext';
import { buildNodeIdToIndex, getDofsPerNode } from '../core/solver/Assembler';
import { calculateBeamLength } from '../core/fem/Beam';
import type { BeamCheckInput } from './types/steel/BeamCheckInput';
import type { ForcePoint } from './types/steel/ForcePoint';
import type { LateralBracing } from './types/steel/LateralBracing';
import type { ConsequenceClass } from './types/steel/ConsequenceClass';
import type { DeflectionClass } from './types/steel/DeflectionClass';

const STEEL_PROFILE_PREFIXES = [
  'HEA', 'HEB', 'HEM', 'IPE', 'UPE', 'UNP',
  'RHS', 'SHS', 'HFRHS', 'KKR', 'CHS',
];

export function isSteelProfile(profileName: string | undefined): boolean {
  if (!profileName) return false;
  const upper = profileName.toUpperCase();
  return STEEL_PROFILE_PREFIXES.some(p => upper.startsWith(p));
}

export function defaultConfigForBeam(
  beamId: number,
  profileName: string,
  lengthMm: number,
): IBeamSteelConfig {
  return {
    beamId,
    profileName,
    steelGrade: 'S235',
    lateralBracing: { topFlangePositions: [], bottomFlangePositions: [] },
    bucklingLengthY: lengthMm,
    bucklingLengthZ: lengthMm,
    deflectionClass: 'floor',
    deflectionLimitNumerator: 333,
    isCantilever: false,
  };
}

function configToBracing(config: IBeamSteelConfig): LateralBracing {
  return {
    top_flange_positions: config.lateralBracing.topFlangePositions,
    bottom_flange_positions: config.lateralBracing.bottomFlangePositions,
  };
}

function configToDeflectionClass(config: IBeamSteelConfig): DeflectionClass {
  switch (config.deflectionClass) {
    case 'floor':     return 'Floor';
    case 'roof':      return 'Roof';
    case 'cantilever': return 'Cantilever';
    case 'custom':    return 'Custom';
  }
}

/**
 * Extract the maximum absolute vertical displacement for a beam element from a
 * solver result, in mm.
 *
 * The ISolverResult.displacements flat array uses 3 DOFs per node (u, v, θ)
 * for frame analyses. Node ordering matches the iteration order of mesh.nodes,
 * filtered to active (connected) nodes only — identical to buildNodeIdToIndex.
 *
 * DOF layout per node: index*3+0 = u (horizontal), index*3+1 = v (vertical), index*3+2 = θ
 *
 * Returns 0.0 if the displacement vector is empty or the nodes cannot be located.
 */
function extractMaxDeflection(
  beam: { nodeIds: number[] },
  mesh: Mesh,
  result: ISolverResult,
): number {
  const disp = result.displacements;
  if (!disp || disp.length === 0) return 0.0;

  // Frame analysis: 3 DOFs per node
  try {
    const nodeIdToIndex = buildNodeIdToIndex(mesh, 'frame');
    const dofsPerNode = getDofsPerNode('frame'); // 3

    let maxAbs = 0.0;
    for (const nodeId of beam.nodeIds) {
      const idx = nodeIdToIndex.get(nodeId);
      if (idx === undefined) continue;
      const vDof = idx * dofsPerNode + 1; // v (vertical) DOF index
      if (vDof < disp.length) {
        const absV = Math.abs(disp[vDof]);
        if (absV > maxAbs) maxAbs = absV;
      }
    }
    // Solver result is in metres; return mm
    return maxAbs * 1000.0;
  } catch {
    return 0.0;
  }
}

/**
 * Build BeamCheckInput[] from current mesh + solver result for the Tauri
 * check_steel_beams command.
 *
 * Force extraction notes (2D frame solver):
 * - ISolverResult.beamForces is Map<beamId, IBeamForces>
 * - IBeamForces.stations: number[] — positions in metres from beam start
 * - IBeamForces.normalForce: number[]  — N in Newtons (+tension)
 * - IBeamForces.shearForce: number[]   — V in Newtons
 * - IBeamForces.bendingMoment: number[] — M in Newton·metres (+sagging)
 * - The solver is 2D, so Vy=0, Vz=V, My=M, Mz=0, Mt=0 by convention.
 *   We map them to the 3D EN1993 force vector accordingly.
 * - All results are for a single load combination (combinationId = result.combinationId ?? 1).
 */
export function buildSteelCheckInputs(
  mesh: Mesh,
  configs: Map<number, IBeamSteelConfig>,
  result: ISolverResult | null,
  _projectInfo: IProjectInfo,
): BeamCheckInput[] {
  if (!result) return [];

  const combinationId = result.combinationId ?? result.loadCaseId ?? 1;
  const inputs: BeamCheckInput[] = [];

  for (const beam of mesh.beamElements.values()) {
    const profileName: string | undefined = beam.profileName;
    if (!isSteelProfile(profileName)) continue;

    // Resolve both endpoint nodes
    const n1 = mesh.nodes.get(beam.nodeIds[0]);
    const n2 = mesh.nodes.get(beam.nodeIds[1]);
    if (!n1 || !n2) continue;

    const lengthM  = calculateBeamLength(n1, n2);   // metres
    const lengthMm = lengthM * 1000.0;

    const config = configs.get(beam.id) ?? defaultConfigForBeam(beam.id, profileName!, lengthMm);

    // Build force envelope from solver result.
    // The 2D frame solver produces: N (axial), V (in-plane shear), M (in-plane moment).
    // Map to EN1993 3D convention: n_ed=N, vy_ed=0, vz_ed=V, mt_ed=0, my_ed=M, mz_ed=0.
    const forcesEnvelope: ForcePoint[] = [];
    const bf = result.beamForces.get(beam.id);
    if (bf && bf.stations.length > 0) {
      for (let i = 0; i < bf.stations.length; i++) {
        const posM = bf.stations[i];                         // metres from start
        const N    = bf.normalForce[i] ?? 0;                 // N (Newtons)
        const V    = bf.shearForce[i]  ?? 0;                 // N
        const M    = bf.bendingMoment[i] ?? 0;               // N·m

        forcesEnvelope.push({
          combination_id: combinationId,
          position_mm: posM * 1000.0,
          forces: {
            n_ed:  N / 1000.0,   // N → kN
            vy_ed: 0,             // 2D: no lateral shear
            vz_ed: V / 1000.0,   // N → kN
            mt_ed: 0,             // 2D: no torsion
            my_ed: M / 1000.0,   // N·m → kN·m
            mz_ed: 0,             // 2D: no weak-axis bending
          },
        });
      }
    }

    // Fallback: single zero-force point so the Rust orchestrator does not crash
    if (forcesEnvelope.length === 0) {
      forcesEnvelope.push({
        combination_id: combinationId,
        position_mm: 0,
        forces: { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: 0, mz_ed: 0 },
      });
    }

    const consequenceClass: ConsequenceClass = 'CC1';

    inputs.push({
      beam_id: beam.id,
      profile_name: profileName!,
      steel_grade: config.steelGrade,
      length_m: lengthM,
      forces_envelope: forcesEnvelope,
      lateral_bracing: configToBracing(config),
      buckling_length_y_m: config.bucklingLengthY / 1000.0,
      buckling_length_z_m: config.bucklingLengthZ / 1000.0,
      deflection_limit_class: configToDeflectionClass(config),
      deflection_limit_numerator: config.deflectionLimitNumerator,
      deflection_actual_max_mm: extractMaxDeflection(beam, mesh, result),
      is_cantilever: config.isCantilever,
      consequence_class: consequenceClass,
    });
  }

  return inputs;
}
