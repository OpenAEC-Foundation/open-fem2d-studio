/**
 * Thermal load computation for CST (Constant Strain Triangle) elements.
 *
 * Equivalent nodal forces for a uniform temperature change ΔT:
 *   ε_thermal = [α·ΔT, α·ΔT, 0]^T
 *   F_thermal = t · A · B^T · D · ε_thermal
 */

import { INode, IMaterial, AnalysisType, IBeamElement } from './types';
import { calculateTriangleArea, getStrainDisplacementMatrix, getConstitutiveMatrix } from './Triangle';
import { calculateBeamAngle } from './Beam';

/**
 * Calculate equivalent nodal forces due to thermal loading on a CST element.
 * Returns array of 6 values: [fx1, fy1, fx2, fy2, fx3, fy3]
 */
export function calculateThermalNodalForces(
  n1: INode,
  n2: INode,
  n3: INode,
  material: IMaterial,
  thickness: number,
  deltaT: number,
  analysisType: AnalysisType
): number[] {
  const alpha = material.alpha ?? 12e-6; // default to steel
  const area = calculateTriangleArea(n1, n2, n3);
  const B = getStrainDisplacementMatrix(n1, n2, n3);
  const D = getConstitutiveMatrix(material, analysisType === 'plate_bending' ? 'plane_stress' : analysisType);

  // Thermal strain vector: [α·ΔT, α·ΔT, 0]
  const epsThermal = [alpha * deltaT, alpha * deltaT, 0];

  // D · ε_thermal → thermal stress (3×1)
  const sigma = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      sigma[i] += D.get(i, j) * epsThermal[j];
    }
  }

  // B^T · sigma → nodal forces (6×1)
  const Bt = B.transpose(); // 6×3
  const F = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      F[i] += Bt.get(i, j) * sigma[j];
    }
  }

  // Scale by thickness × area
  const scale = thickness * area;
  for (let i = 0; i < 6; i++) {
    F[i] *= scale;
  }

  return F;
}

/**
 * Calculate equivalent nodal forces due to thermal loading on a beam element.
 * For a beam with temperature change ΔT:
 *   - Thermal strain: ε_th = α × ΔT
 *   - Axial force: N_th = E × A × α × ΔT
 *   - Positive ΔT (heating) causes compression, pushing outward at ends
 * Returns array of 6 values: [fx1, fy1, m1, fx2, fy2, m2] in global coordinates
 */
export function calculateBeamThermalNodalForces(
  n1: INode,
  n2: INode,
  beam: IBeamElement,
  material: IMaterial,
  deltaT: number
): number[] {
  const alpha = material.alpha ?? 12e-6; // default to steel: 12×10⁻⁶ /°C
  const E = material.E;
  const A = beam.section.A;

  // Thermal axial force (tension positive when cooling, compression positive when heating)
  const N_th = E * A * alpha * deltaT;

  // Beam angle
  const angle = calculateBeamAngle(n1, n2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Local forces: [Fx1, Fy1, M1, Fx2, Fy2, M2] = [-N_th, 0, 0, N_th, 0, 0]
  // Transform to global: Fx_global = Fx_local*cos - Fy_local*sin
  //                      Fy_global = Fx_local*sin + Fy_local*cos

  // At node 1: local force is -N_th in axial direction (pointing away from beam)
  const fx1 = -N_th * cos;
  const fy1 = -N_th * sin;

  // At node 2: local force is +N_th in axial direction (pointing away from beam)
  const fx2 = N_th * cos;
  const fy2 = N_th * sin;

  return [fx1, fy1, 0, fx2, fy2, 0]; // No moments from uniform thermal load
}

/**
 * Calculate equivalent nodal forces due to temperature gradient on a beam element.
 * Temperature gradient (ΔT_top ≠ ΔT_bottom) causes:
 *   - Uniform axial load from average temperature change: ΔT_avg = (ΔT_top + ΔT_bottom) / 2
 *   - Bending moment from temperature difference: M_th = E × I × α × (ΔT_top - ΔT_bottom) / h
 *
 * Sign convention:
 *   - Positive ΔT_top > ΔT_bottom → top fiber hotter → beam bends downward (sagging)
 *   - The thermal moment causes the beam to curve toward the cooler side
 *
 * Returns array of 6 values: [fx1, fy1, m1, fx2, fy2, m2] in global coordinates
 */
export function calculateBeamThermalGradientForces(
  n1: INode,
  n2: INode,
  beam: IBeamElement,
  material: IMaterial,
  deltaTTop: number,
  deltaTBottom: number
): number[] {
  const alpha = material.alpha ?? 12e-6; // default to steel: 12×10⁻⁶ /°C
  const E = material.E;
  const A = beam.section.A;
  const I = beam.section.Iy ?? beam.section.I;
  const h = beam.section.h;

  // Average temperature change causes axial force
  const deltaTAvg = (deltaTTop + deltaTBottom) / 2;
  const N_th = E * A * alpha * deltaTAvg;

  // Temperature difference causes bending moment
  // κ_th = α × (ΔT_top - ΔT_bottom) / h (thermal curvature)
  // M_th = E × I × κ_th (moment required to prevent free curvature)
  const deltaTDiff = deltaTTop - deltaTBottom;
  const M_th = E * I * alpha * deltaTDiff / h;

  // Beam angle
  const angle = calculateBeamAngle(n1, n2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Local forces: [Fx1, Fy1, M1, Fx2, Fy2, M2]
  // Axial: [-N_th, 0, M_th, N_th, 0, -M_th]
  // The thermal moment is applied as equal and opposite at both ends
  // (fixed-end moments for thermal gradient loading)

  // Transform axial forces to global
  const fx1 = -N_th * cos;
  const fy1 = -N_th * sin;
  const fx2 = N_th * cos;
  const fy2 = N_th * sin;

  // Moments remain the same in global coordinates (rotation about z-axis)
  // Sign: positive M_th at node 1, negative at node 2 (equal and opposite)
  // This causes the beam to deflect toward the hotter side
  return [fx1, fy1, M_th, fx2, fy2, -M_th];
}

/**
 * Calculate equivalent nodal forces from beam's thermalLoad property.
 * Handles both uniform ΔT and temperature gradient cases.
 * Returns array of 6 values: [fx1, fy1, m1, fx2, fy2, m2] in global coordinates
 */
export function calculateBeamThermalLoadForces(
  n1: INode,
  n2: INode,
  beam: IBeamElement,
  material: IMaterial
): number[] {
  const tl = beam.thermalLoad;
  if (!tl) return [0, 0, 0, 0, 0, 0];

  // Check if gradient is specified
  if (tl.deltaTTop !== undefined && tl.deltaTBottom !== undefined) {
    return calculateBeamThermalGradientForces(n1, n2, beam, material, tl.deltaTTop, tl.deltaTBottom);
  }

  // Uniform temperature change
  if (tl.deltaT !== undefined && tl.deltaT !== 0) {
    return calculateBeamThermalNodalForces(n1, n2, beam, material, tl.deltaT);
  }

  return [0, 0, 0, 0, 0, 0];
}
