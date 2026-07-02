import { Matrix } from '../math/Matrix';
import { INode, IMaterial, AnalysisType } from './types';

export function calculateTriangleArea(n1: INode, n2: INode, n3: INode): number {
  // Area using cross product: 0.5 * |x1(y2-y3) + x2(y3-y1) + x3(y1-y2)|
  const area = 0.5 * Math.abs(
    n1.x * (n2.y - n3.y) +
    n2.x * (n3.y - n1.y) +
    n3.x * (n1.y - n2.y)
  );
  return area;
}

export function getConstitutiveMatrix(material: IMaterial, type: AnalysisType): Matrix {
  const E = material.E;
  const nu = material.nu;
  const D = new Matrix(3, 3);

  if (type === 'plane_stress') {
    const factor = E / (1 - nu * nu);
    D.set(0, 0, factor);
    D.set(0, 1, factor * nu);
    D.set(1, 0, factor * nu);
    D.set(1, 1, factor);
    D.set(2, 2, factor * (1 - nu) / 2);
  } else {
    // Plane strain
    const factor = E / ((1 + nu) * (1 - 2 * nu));
    D.set(0, 0, factor * (1 - nu));
    D.set(0, 1, factor * nu);
    D.set(1, 0, factor * nu);
    D.set(1, 1, factor * (1 - nu));
    D.set(2, 2, factor * (1 - 2 * nu) / 2);
  }

  return D;
}

export function getStrainDisplacementMatrix(n1: INode, n2: INode, n3: INode): Matrix {
  const area = calculateTriangleArea(n1, n2, n3);

  if (area < 1e-12) {
    throw new Error('Triangle has zero or negative area');
  }

  // B matrix (3x6) for CST element
  const B = new Matrix(3, 6);

  const beta1 = n2.y - n3.y;
  const beta2 = n3.y - n1.y;
  const beta3 = n1.y - n2.y;

  const gamma1 = n3.x - n2.x;
  const gamma2 = n1.x - n3.x;
  const gamma3 = n2.x - n1.x;

  const factor = 1 / (2 * area);

  // Row 1: dN/dx terms (epsilon_x = du/dx)
  B.set(0, 0, factor * beta1);
  B.set(0, 2, factor * beta2);
  B.set(0, 4, factor * beta3);

  // Row 2: dN/dy terms (epsilon_y = dv/dy)
  B.set(1, 1, factor * gamma1);
  B.set(1, 3, factor * gamma2);
  B.set(1, 5, factor * gamma3);

  // Row 3: shear strain (gamma_xy = du/dy + dv/dx)
  B.set(2, 0, factor * gamma1);
  B.set(2, 1, factor * beta1);
  B.set(2, 2, factor * gamma2);
  B.set(2, 3, factor * beta2);
  B.set(2, 4, factor * gamma3);
  B.set(2, 5, factor * beta3);

  return B;
}

export function calculateElementStiffness(
  n1: INode,
  n2: INode,
  n3: INode,
  material: IMaterial,
  thickness: number,
  analysisType: AnalysisType
): Matrix {
  const area = calculateTriangleArea(n1, n2, n3);
  const B = getStrainDisplacementMatrix(n1, n2, n3);
  const D = getConstitutiveMatrix(material, analysisType);

  // Ke = t * A * B^T * D * B
  const Bt = B.transpose();
  const BtD = Bt.multiply(D);
  const BtDB = BtD.multiply(B);

  return BtDB.scale(thickness * area);
}

export function calculateElementStress(
  n1: INode,
  n2: INode,
  n3: INode,
  material: IMaterial,
  displacements: number[],
  analysisType: AnalysisType
): { sigmaX: number; sigmaY: number; tauXY: number; vonMises: number } {
  const B = getStrainDisplacementMatrix(n1, n2, n3);
  const D = getConstitutiveMatrix(material, analysisType);

  // sigma = D * B * u
  const DB = D.multiply(B);
  const stress = DB.multiplyVector(displacements);

  const sigmaX = stress[0];
  const sigmaY = stress[1];
  const tauXY = stress[2];

  // Von Mises stress for plane stress
  const vonMises = Math.sqrt(
    sigmaX * sigmaX - sigmaX * sigmaY + sigmaY * sigmaY + 3 * tauXY * tauXY
  );

  return { sigmaX, sigmaY, tauXY, vonMises };
}

export function calculatePrincipalStresses(
  sigmaX: number,
  sigmaY: number,
  tauXY: number
): { sigma1: number; sigma2: number; angle: number } {
  const avgStress = (sigmaX + sigmaY) / 2;
  const radius = Math.sqrt(
    Math.pow((sigmaX - sigmaY) / 2, 2) + tauXY * tauXY
  );

  const sigma1 = avgStress + radius;
  const sigma2 = avgStress - radius;

  // Principal angle
  const angle = 0.5 * Math.atan2(2 * tauXY, sigmaX - sigmaY);

  return { sigma1, sigma2, angle };
}

/**
 * Calculate expanded 9x9 stiffness matrix for mixed beam+plate analysis.
 * Expands the original 6x6 (2 DOF/node) to 9x9 (3 DOF/node) with zero rotational stiffness.
 * DOF mapping: [u1,v1,θ1, u2,v2,θ2, u3,v3,θ3]
 */
export function calculateTriangleStiffnessExpanded(
  n1: INode,
  n2: INode,
  n3: INode,
  material: IMaterial,
  thickness: number,
  analysisType: AnalysisType
): Matrix {
  // Get original 6x6 stiffness (2 DOF/node: u, v)
  const Ke6 = calculateElementStiffness(n1, n2, n3, material, thickness, analysisType);

  // Expand to 9x9: insert zero rows/columns for θ DOFs at positions 2, 5, 8
  const Ke9 = new Matrix(9, 9);

  // Mapping from 2-DOF indices to 3-DOF indices
  // Original: [u1,v1, u2,v2, u3,v3] → indices [0,1,2,3,4,5]
  // Expanded: [u1,v1,θ1, u2,v2,θ2, u3,v3,θ3] → u,v at [0,1,3,4,6,7]
  const mapping = [0, 1, 3, 4, 6, 7];

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      Ke9.set(mapping[i], mapping[j], Ke6.get(i, j));
    }
  }

  return Ke9;
}
