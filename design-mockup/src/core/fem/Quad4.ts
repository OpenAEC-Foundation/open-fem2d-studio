/**
 * Quad4 — 4-node isoparametric quadrilateral element
 * for plane stress / plane strain analysis.
 *
 * Uses 2x2 Gauss quadrature for stiffness integration.
 * Node numbering: counter-clockwise (BL, BR, TR, TL) in physical space,
 * mapped to natural coordinates (-1,-1), (1,-1), (1,1), (-1,1).
 */

import { Matrix } from '../math/Matrix';
import { INode, IMaterial, AnalysisType } from './types';
import { getConstitutiveMatrix, membraneGeometricFromGradients, type IMembraneStress } from './Triangle';

/** 2x2 Gauss points and weights */
const GP = 1 / Math.sqrt(3);
const GAUSS_POINTS: { xi: number; eta: number; w: number }[] = [
  { xi: -GP, eta: -GP, w: 1 },
  { xi:  GP, eta: -GP, w: 1 },
  { xi:  GP, eta:  GP, w: 1 },
  { xi: -GP, eta:  GP, w: 1 },
];

/**
 * Derivatives of shape functions w.r.t. natural coordinates.
 * Returns { dNdxi: number[4], dNdeta: number[4] }
 */
function shapeFunctionDerivatives(xi: number, eta: number): { dNdxi: number[]; dNdeta: number[] } {
  const dNdxi = [
    -0.25 * (1 - eta),
     0.25 * (1 - eta),
     0.25 * (1 + eta),
    -0.25 * (1 + eta),
  ];
  const dNdeta = [
    -0.25 * (1 - xi),
    -0.25 * (1 + xi),
     0.25 * (1 + xi),
     0.25 * (1 - xi),
  ];
  return { dNdxi, dNdeta };
}

/**
 * Compute the Jacobian matrix at a given natural coordinate point.
 * J = [[dx/dxi, dy/dxi], [dx/deta, dy/deta]]
 */
function jacobian(
  xi: number,
  eta: number,
  x: number[],
  y: number[]
): { J: number[][]; detJ: number; invJ: number[][] } {
  const { dNdxi, dNdeta } = shapeFunctionDerivatives(xi, eta);

  // J[0][0] = dx/dxi,  J[0][1] = dy/dxi
  // J[1][0] = dx/deta, J[1][1] = dy/deta
  let J00 = 0, J01 = 0, J10 = 0, J11 = 0;
  for (let i = 0; i < 4; i++) {
    J00 += dNdxi[i] * x[i];
    J01 += dNdxi[i] * y[i];
    J10 += dNdeta[i] * x[i];
    J11 += dNdeta[i] * y[i];
  }

  const detJ = J00 * J11 - J01 * J10;

  // Inverse Jacobian
  const invJ = [
    [ J11 / detJ, -J01 / detJ],
    [-J10 / detJ,  J00 / detJ],
  ];

  return { J: [[J00, J01], [J10, J11]], detJ, invJ };
}

/**
 * Build the strain-displacement matrix B (3x8) at a Gauss point.
 * For 2D: B relates [eps_x, eps_y, gamma_xy] to [u1,v1, u2,v2, u3,v3, u4,v4].
 */
function strainDisplacementMatrix(
  xi: number,
  eta: number,
  x: number[],
  y: number[]
): { B: Matrix; detJ: number } {
  const { dNdxi, dNdeta } = shapeFunctionDerivatives(xi, eta);
  const { detJ, invJ } = jacobian(xi, eta, x, y);

  // Derivatives w.r.t. physical coordinates
  const dNdx: number[] = [];
  const dNdy: number[] = [];
  for (let i = 0; i < 4; i++) {
    dNdx.push(invJ[0][0] * dNdxi[i] + invJ[0][1] * dNdeta[i]);
    dNdy.push(invJ[1][0] * dNdxi[i] + invJ[1][1] * dNdeta[i]);
  }

  const B = new Matrix(3, 8);
  for (let i = 0; i < 4; i++) {
    // Row 0: eps_x = du/dx
    B.set(0, 2 * i, dNdx[i]);
    // Row 1: eps_y = dv/dy
    B.set(1, 2 * i + 1, dNdy[i]);
    // Row 2: gamma_xy = du/dy + dv/dx
    B.set(2, 2 * i, dNdy[i]);
    B.set(2, 2 * i + 1, dNdx[i]);
  }

  return { B, detJ };
}

/**
 * Calculate the 8x8 element stiffness matrix for a 4-node quad element.
 * Ke = integral( t * B^T * D * B * detJ ) over element area
 * using 2x2 Gauss quadrature.
 */
export function calculateQuadStiffness(
  n1: INode, n2: INode, n3: INode, n4: INode,
  material: IMaterial,
  thickness: number,
  analysisType: AnalysisType
): Matrix {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];

  const D = getConstitutiveMatrix(material, analysisType);
  const Ke = new Matrix(8, 8);

  for (const gp of GAUSS_POINTS) {
    const { B, detJ } = strainDisplacementMatrix(gp.xi, gp.eta, x, y);

    if (detJ <= 0) {
      throw new Error('Quad element has non-positive Jacobian determinant (bad element shape)');
    }

    // Ke += w * t * detJ * B^T * D * B
    const Bt = B.transpose();    // 8x3
    const BtD = Bt.multiply(D);  // 8x3
    const BtDB = BtD.multiply(B); // 8x8

    const factor = gp.w * thickness * detJ;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        Ke.addAt(i, j, factor * BtDB.get(i, j));
      }
    }
  }

  return Ke;
}

/**
 * Calculate element stress at the centroid of a quad element (average of Gauss points).
 * Returns stress components for plane stress/strain.
 */
export function calculateQuadStress(
  n1: INode, n2: INode, n3: INode, n4: INode,
  material: IMaterial,
  displacements: number[],  // [u1,v1, u2,v2, u3,v3, u4,v4]
  analysisType: AnalysisType
): { sigmaX: number; sigmaY: number; tauXY: number; vonMises: number } {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];

  const D = getConstitutiveMatrix(material, analysisType);

  // Average stress over the 4 Gauss points
  let sigmaX = 0, sigmaY = 0, tauXY = 0;

  for (const gp of GAUSS_POINTS) {
    const { B } = strainDisplacementMatrix(gp.xi, gp.eta, x, y);
    // sigma = D * B * u
    const DB = D.multiply(B);  // 3x8
    const stress = DB.multiplyVector(displacements); // 3
    sigmaX += stress[0];
    sigmaY += stress[1];
    tauXY += stress[2];
  }

  sigmaX /= GAUSS_POINTS.length;
  sigmaY /= GAUSS_POINTS.length;
  tauXY /= GAUSS_POINTS.length;

  // Von Mises stress
  const vonMises = Math.sqrt(
    sigmaX * sigmaX - sigmaX * sigmaY + sigmaY * sigmaY + 3 * tauXY * tauXY
  );

  return { sigmaX, sigmaY, tauXY, vonMises };
}

/**
 * Calculate expanded 12x12 stiffness matrix for mixed beam+plate analysis.
 * Expands the original 8x8 (2 DOF/node) to 12x12 (3 DOF/node) with zero rotational stiffness.
 * DOF mapping: [u1,v1,θ1, u2,v2,θ2, u3,v3,θ3, u4,v4,θ4]
 */
export function calculateQuadStiffnessExpanded(
  n1: INode, n2: INode, n3: INode, n4: INode,
  material: IMaterial,
  thickness: number,
  analysisType: AnalysisType
): Matrix {
  // Get original 8x8 stiffness (2 DOF/node: u, v)
  const Ke8 = calculateQuadStiffness(n1, n2, n3, n4, material, thickness, analysisType);

  // Expand to 12x12: insert zero rows/columns for θ DOFs at positions 2, 5, 8, 11
  const Ke12 = new Matrix(12, 12);

  // Mapping from 2-DOF indices to 3-DOF indices
  // Original: [u1,v1, u2,v2, u3,v3, u4,v4] → indices [0,1,2,3,4,5,6,7]
  // Expanded: [u1,v1,θ1, u2,v2,θ2, u3,v3,θ3, u4,v4,θ4] → u,v at [0,1,3,4,6,7,9,10]
  const mapping = [0, 1, 3, 4, 6, 7, 9, 10];

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      Ke12.set(mapping[i], mapping[j], Ke8.get(i, j));
    }
  }

  return Ke12;
}

/**
 * Geometrische (initiële-spannings)stijfheid van een vierknoops membraan —
 * 8×8, DOF-volgorde [u1,v1, u2,v2, u3,v3, u4,v4].
 *
 * Kg = ∫ Gᵀ·S·G · t dA, met 2×2 Gauss — dezelfde integratie als
 * `calculateQuadStiffness`, zodat de twee matrices op dezelfde punten worden
 * bemonsterd en niet elk hun eigen benadering maken.
 *
 * BENADERING, EN WELKE
 * De spanning wordt in élk Gauss-punt gelijk genomen aan de meegegeven
 * elementspanning. Die is bij `calculateQuadStress` al het gemiddelde over de
 * vier punten, dus voor een element met een spanningsgradiënt is dit een
 * elementgemiddelde en niet de puntwaarde. Voor een rechthoekig element onder
 * een constante spanningstoestand — het geval waarvoor de wandschijf in dit
 * model bedoeld is — vallen de twee samen en is er geen verschil. De driehoek
 * kent deze benadering niet: daar is de spanning per definitie constant.
 *
 * Zie `calculateTriangleGeometricStiffness` voor wat dit wél en niet is; ook
 * hier gaat het om het in-vlak effect en niet om plaatknik uit het vlak.
 */
export function calculateQuadGeometricStiffness(
  n1: INode, n2: INode, n3: INode, n4: INode,
  stress: IMembraneStress,
  thickness: number
): Matrix {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];

  const Kg = new Matrix(8, 8);

  for (const gp of GAUSS_POINTS) {
    const { dNdxi, dNdeta } = shapeFunctionDerivatives(gp.xi, gp.eta);
    const { detJ, invJ } = jacobian(gp.xi, gp.eta, x, y);
    if (detJ <= 0) {
      throw new Error('Quad element has non-positive Jacobian determinant (bad element shape)');
    }

    const G = new Matrix(4, 8);
    for (let i = 0; i < 4; i++) {
      const dNdx = invJ[0][0] * dNdxi[i] + invJ[0][1] * dNdeta[i];
      const dNdy = invJ[1][0] * dNdxi[i] + invJ[1][1] * dNdeta[i];
      G.set(0, 2 * i, dNdx);      // ∂u/∂x
      G.set(1, 2 * i, dNdy);      // ∂u/∂y
      G.set(2, 2 * i + 1, dNdx);  // ∂v/∂x
      G.set(3, 2 * i + 1, dNdy);  // ∂v/∂y
    }

    const bijdrage = membraneGeometricFromGradients(
      G, stress, gp.w * thickness * detJ, 8
    );
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) Kg.addAt(i, j, bijdrage.get(i, j));
    }
  }

  return Kg;
}

/**
 * Breid een 8×8 membraan-Kg uit naar 12×12 met nulrijen/-kolommen voor θ —
 * dezelfde afbeelding als `calculateQuadStiffnessExpanded`.
 */
export function expandQuadGeometricStiffness(Kg8: Matrix): Matrix {
  const Kg12 = new Matrix(12, 12);
  const mapping = [0, 1, 3, 4, 6, 7, 9, 10];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      Kg12.set(mapping[i], mapping[j], Kg8.get(i, j));
    }
  }
  return Kg12;
}
