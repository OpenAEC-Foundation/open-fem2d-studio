import { INode, IBeamElement, IBeamForces, IMaterial, getConnectionTypes } from './types';
import {
  calculateBeamLength,
  calculateBeamAngle,
  calculateBeamLocalStiffness,
  transformGlobalToLocal,
  calculateTrapezoidalLoadVector,
  calculatePartialTrapezoidalLoadVector,
  calculateDistributedLoadVector,
  calculatePartialDistributedLoadVector,
} from './Beam';
import { applyEndReleases } from '../solver/Assembler';

const NUM_STATIONS = 21; // Number of points along beam for diagrams

/**
 * Calculate internal forces (N, V, M) for a beam element
 *
 * Sign conventions:
 * - N positive: tension
 * - V positive: causes clockwise rotation of element
 * - M positive: causes tension in bottom fiber (sagging)
 */
export function calculateBeamInternalForces(
  element: IBeamElement,
  n1: INode,
  n2: INode,
  material: IMaterial,
  globalDisplacements: number[]
): IBeamForces {
  const L = calculateBeamLength(n1, n2);
  const angle = calculateBeamAngle(n1, n2);

  // Transform global displacements to local coordinates
  const localDisp = transformGlobalToLocal(globalDisplacements, angle);

  // Get distributed loads (in local coordinates)
  let qxS = element.distributedLoad?.qx ?? 0;
  let qyS = element.distributedLoad?.qy ?? 0;
  let qxE = element.distributedLoad?.qxEnd ?? qxS;
  let qyE = element.distributedLoad?.qyEnd ?? qyS;
  const coordSystem = element.distributedLoad?.coordSystem ?? 'local';
  const startT = element.distributedLoad?.startT ?? 0;
  const endT = element.distributedLoad?.endT ?? 1;

  // If global coordinate system, project to local axes
  if (coordSystem === 'global') {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const qxSL = qxS * cos + qyS * sin;
    const qySL = -qxS * sin + qyS * cos;
    const qxEL = qxE * cos + qyE * sin;
    const qyEL = -qxE * sin + qyE * cos;
    qxS = qxSL; qyS = qySL;
    qxE = qxEL; qyE = qyEL;
  }

  const isTrapezoidal = qxE !== qxS || qyE !== qyS;
  const isPartial = startT > 0 || endT < 1;

  // Calculate local stiffness matrix
  const Kl = calculateBeamLocalStiffness(L, material.E, element.section.A, element.section.I);

  // Compute equivalent nodal forces from distributed loads
  let equivalentNodalForces: number[];
  if (isTrapezoidal) {
    equivalentNodalForces = isPartial
      ? calculatePartialTrapezoidalLoadVector(L, qxS, qyS, qxE, qyE, startT, endT)
      : calculateTrapezoidalLoadVector(L, qxS, qyS, qxE, qyE);
  } else if (isPartial) {
    equivalentNodalForces = calculatePartialDistributedLoadVector(L, qxS, qyS, startT, endT);
  } else {
    equivalentNodalForces = calculateDistributedLoadVector(L, qxS, qyS);
  }

  // Apply static condensation for hinges — must be done BEFORE computing forces.
  // This ensures moment = 0 at hinged ends and correctly redistributes
  // fixed-end forces from distributed loads to the remaining DOFs.
  const { start, end } = getConnectionTypes(element);
  const releasedLocalDofs: number[] = [];
  if (start === 'hinge') releasedLocalDofs.push(2); // θ1
  if (end === 'hinge') releasedLocalDofs.push(5);   // θ2
  if (releasedLocalDofs.length > 0) {
    applyEndReleases(Kl, releasedLocalDofs, equivalentNodalForces);
  }

  // Calculate local element forces from displacements: f_local = K_condensed * d_local
  const localForces = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      localForces[i] += Kl.get(i, j) * localDisp[j];
    }
  }

  // Internal forces = condensed stiffness forces - condensed equivalent nodal forces
  for (let i = 0; i < 6; i++) {
    localForces[i] -= equivalentNodalForces[i];
  }

  const N1 = localForces[0];
  const V1 = localForces[1];
  const M1 = -localForces[2];
  const N2 = -localForces[3];
  const V2 = -localForces[4];
  const M2 = localForces[5];

  // Generate stations along beam for diagram plotting
  const stations: number[] = [];
  const normalForce: number[] = [];
  const shearForce: number[] = [];
  const bendingMoment: number[] = [];

  for (let i = 0; i < NUM_STATIONS; i++) {
    const x = (i / (NUM_STATIONS - 1)) * L;
    stations.push(x);

    // N(x) = N1 + integral of qx from 0 to x
    // For trapezoidal partial: integrate piecewise
    let intQx = 0;
    let intQy = 0;
    let intQyMoment = 0; // integral of qy*(x-s) ds from load start to x

    if (x > startT * L) {
      const loadStart = startT * L;
      const loadEnd = Math.min(x, endT * L);
      if (loadEnd > loadStart) {
        const span = (endT - startT) * L;
        const tStart = 0; // at loadStart, t=0
        const tEnd = span > 0 ? (loadEnd - loadStart) / span : 0;
        // q(s) = qxS + (qxE - qxS) * ((s - loadStart) / span)
        // integral from loadStart to loadEnd = qxS*(loadEnd-loadStart) + (qxE-qxS)*(loadEnd-loadStart)^2/(2*span)
        const ds = loadEnd - loadStart;
        intQx = qxS * ds + (qxE - qxS) * ds * (tStart + tEnd) / 2;
        intQy = qyS * ds + (qyE - qyS) * ds * (tStart + tEnd) / 2;

        // For moment: integral of qy(s) * (x - s) ds from loadStart to loadEnd
        // Using numerical integration (Simpson's rule, 10 intervals)
        const nSub = 10;
        const hSub = ds / nSub;
        let sum = 0;
        for (let k = 0; k <= nSub; k++) {
          const s = loadStart + k * hSub;
          const tK = span > 0 ? (s - loadStart) / span : 0;
          const qy_s = qyS + (qyE - qyS) * tK;
          let w: number;
          if (k === 0 || k === nSub) w = 1;
          else if (k % 2 === 1) w = 4;
          else w = 2;
          sum += w * qy_s * (x - s);
        }
        intQyMoment = sum * hSub / 3;
      }
    }

    const N_x = N1 + intQx;
    normalForce.push(N_x);

    const V_x = V1 + intQy;
    shearForce.push(V_x);

    const M_x = M1 + V1 * x + intQyMoment;
    bendingMoment.push(M_x);
  }

  // Find maximum absolute values for scaling
  const maxN = Math.max(...normalForce.map(Math.abs), 1e-10);
  const maxV = Math.max(...shearForce.map(Math.abs), 1e-10);
  const maxM = Math.max(...bendingMoment.map(Math.abs), 1e-10);

  return {
    elementId: element.id,
    N1,
    V1,
    M1,
    N2,
    V2,
    M2,
    stations,
    normalForce,
    shearForce,
    bendingMoment,
    maxN,
    maxV,
    maxM
  };
}

/**
 * Calculate stress at a point in the beam cross-section
 *
 * @param N Normal force
 * @param M Bending moment
 * @param A Cross-sectional area
 * @param I Second moment of area
 * @param y Distance from neutral axis (positive = tension side for positive M)
 */
export function calculateBeamStress(
  N: number,
  M: number,
  A: number,
  I: number,
  y: number
): number {
  const sigma_axial = N / A;
  const sigma_bending = -M * y / I; // Negative because positive M causes compression at top (y > 0)
  return sigma_axial + sigma_bending;
}

/**
 * Calculate maximum stress in beam element (at extreme fibers)
 */
export function calculateMaxBeamStress(
  forces: IBeamForces,
  section: { A: number; I: number; h: number }
): { maxTension: number; maxCompression: number; location: { x: number; fiber: 'top' | 'bottom' } } {
  const y_top = section.h / 2;
  const y_bottom = -section.h / 2;

  let maxTension = -Infinity;
  let maxCompression = Infinity;
  let location = { x: 0, fiber: 'top' as 'top' | 'bottom' };

  for (let i = 0; i < forces.stations.length; i++) {
    const N = forces.normalForce[i];
    const M = forces.bendingMoment[i];

    const sigma_top = calculateBeamStress(N, M, section.A, section.I, y_top);
    const sigma_bottom = calculateBeamStress(N, M, section.A, section.I, y_bottom);

    if (sigma_top > maxTension) {
      maxTension = sigma_top;
      location = { x: forces.stations[i], fiber: 'top' };
    }
    if (sigma_bottom > maxTension) {
      maxTension = sigma_bottom;
      location = { x: forces.stations[i], fiber: 'bottom' };
    }
    if (sigma_top < maxCompression) {
      maxCompression = sigma_top;
    }
    if (sigma_bottom < maxCompression) {
      maxCompression = sigma_bottom;
    }
  }

  return { maxTension, maxCompression, location };
}

/**
 * Format force value for display
 */
export function formatForce(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)} MN`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)} kN`;
  } else {
    return `${value.toFixed(2)} N`;
  }
}

/**
 * Format moment value for display
 */
export function formatMoment(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)} MNm`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)} kNm`;
  } else {
    return `${value.toFixed(2)} Nm`;
  }
}

/**
 * Calculate reaction forces at supports for the entire frame
 */
export function calculateReactionForces(
  reactions: number[],
  nodeIdToIndex: Map<number, number>,
  nodes: Map<number, INode>,
  dofsPerNode: number
): Map<number, { Rx: number; Ry: number; Rm: number }> {
  const reactionMap = new Map<number, { Rx: number; Ry: number; Rm: number }>();

  for (const node of nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const nodeIndex = nodeIdToIndex.get(node.id);
      if (nodeIndex === undefined) continue;

      const baseDof = nodeIndex * dofsPerNode;
      const Rx = node.constraints.x ? reactions[baseDof] : 0;
      const Ry = node.constraints.y ? reactions[baseDof + 1] : 0;
      const Rm = dofsPerNode === 3 && node.constraints.rotation ? reactions[baseDof + 2] : 0;

      reactionMap.set(node.id, { Rx, Ry, Rm });
    }
  }

  return reactionMap;
}
