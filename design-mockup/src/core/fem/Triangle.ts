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

/**
 * De in-vlak spanningstoestand van een membraanelement, in Pa.
 * Dezelfde drie componenten die `calculateElementStress` teruggeeft.
 */
export interface IMembraneStress {
  sigmaX: number;
  sigmaY: number;
  tauXY: number;
}

/**
 * Geometrische (initiële-spannings)stijfheid van een CST-membraan — 6×6,
 * DOF-volgorde [u1,v1, u2,v2, u3,v3].
 *
 * WAT DIT IS
 * Kg = ∫ Gᵀ·S·G · t dA, met G de gradiënten van u en v en S de heersende
 * spanningstoestand. Het is de tweede-ordeterm van de rekenergie: een schijf
 * die al onder druk staat, verzet zich mínder tegen een volgende vervorming
 * (en onder trek juist méér). Voor een raamwerkstaaf doet
 * `calculateGeometricStiffness` in NonlinearSolver.ts precies hetzelfde met N.
 *
 * WAAROM DIT VOOR EEN CST EXACT IS
 * De vormfuncties van een driehoek met drie knopen zijn lineair, dus hun
 * gradiënten zijn over het hele element constant — net als de spanning die de
 * CST oplevert. De integrand is daarmee constant en de integraal is niets meer
 * dan vermenigvuldigen met t·A. Er wordt hier dus niets benaderd; bij de
 * vierhoek ligt dat anders (zie `calculateQuadGeometricStiffness`).
 *
 * WAT DIT NIET IS
 * Geen plaatknik. Dit model is vlak: de knopen hebben u, v en θ en géén
 * verplaatsing loodrecht op het vlak. Uitknikken uit het vlak — de klassieke
 * plaatstabiliteit — heeft die vrijheidsgraad nodig en kan hier per definitie
 * niet worden gevonden. Wat hier staat is het in-vlak effect, en dat is ook
 * precies wat het raamwerk eromheen nodig heeft.
 */
export function calculateTriangleGeometricStiffness(
  n1: INode, n2: INode, n3: INode,
  stress: IMembraneStress,
  thickness: number
): Matrix {
  const area = calculateTriangleArea(n1, n2, n3);
  if (area < 1e-12) {
    throw new Error('Triangle has zero or negative area');
  }

  // Dezelfde β en γ als in getStrainDisplacementMatrix: ∂N_i/∂x = β_i/(2A),
  // ∂N_i/∂y = γ_i/(2A).
  const factor = 1 / (2 * area);
  const dNdx = [
    factor * (n2.y - n3.y),
    factor * (n3.y - n1.y),
    factor * (n1.y - n2.y),
  ];
  const dNdy = [
    factor * (n3.x - n2.x),
    factor * (n1.x - n3.x),
    factor * (n2.x - n1.x),
  ];

  // G (4×6): de vier gradiënten ∂u/∂x, ∂u/∂y, ∂v/∂x, ∂v/∂y.
  const G = new Matrix(4, 6);
  for (let i = 0; i < 3; i++) {
    G.set(0, 2 * i, dNdx[i]);      // ∂u/∂x
    G.set(1, 2 * i, dNdy[i]);      // ∂u/∂y
    G.set(2, 2 * i + 1, dNdx[i]);  // ∂v/∂x
    G.set(3, 2 * i + 1, dNdy[i]);  // ∂v/∂y
  }

  return multiplyGtSG(G, stress, thickness * area, 6);
}

/**
 * Kg = c · Gᵀ·S·G, met S tweemaal het 2×2 spanningsblok op de diagonaal —
 * één blok voor de u-gradiënten en één voor de v-gradiënten.
 *
 * Apart van beide elementen omdat de driehoek en de vierhoek alleen in hun
 * G verschillen; de rest van de som is identiek, en tweemaal uitgeschreven
 * zou tweemaal fout kunnen gaan.
 */
function multiplyGtSG(
  G: Matrix,
  stress: IMembraneStress,
  c: number,
  n: number
): Matrix {
  const { sigmaX, sigmaY, tauXY } = stress;
  // S·G, rij voor rij: de rijen 0/1 horen bij u, de rijen 2/3 bij v.
  const SG = new Matrix(4, n);
  for (let j = 0; j < n; j++) {
    const gux = G.get(0, j), guy = G.get(1, j);
    const gvx = G.get(2, j), gvy = G.get(3, j);
    SG.set(0, j, sigmaX * gux + tauXY * guy);
    SG.set(1, j, tauXY * gux + sigmaY * guy);
    SG.set(2, j, sigmaX * gvx + tauXY * gvy);
    SG.set(3, j, tauXY * gvx + sigmaY * gvy);
  }

  const Kg = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += G.get(k, i) * SG.get(k, j);
      Kg.set(i, j, c * s);
    }
  }
  return Kg;
}

/** Zoals `multiplyGtSG`, maar bruikbaar vanuit Quad4.ts. */
export function membraneGeometricFromGradients(
  G: Matrix,
  stress: IMembraneStress,
  c: number,
  n: number
): Matrix {
  return multiplyGtSG(G, stress, c, n);
}

/**
 * Breid een 6×6 membraan-Kg uit naar 9×9 door nulrijen/-kolommen voor de
 * θ-vrijheidsgraden — dezelfde afbeelding als
 * `calculateTriangleStiffnessExpanded`, zodat beide matrices op precies
 * dezelfde plekken in het stelsel terechtkomen.
 */
export function expandTriangleGeometricStiffness(Kg6: Matrix): Matrix {
  const Kg9 = new Matrix(9, 9);
  const mapping = [0, 1, 3, 4, 6, 7];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      Kg9.set(mapping[i], mapping[j], Kg6.get(i, j));
    }
  }
  return Kg9;
}
