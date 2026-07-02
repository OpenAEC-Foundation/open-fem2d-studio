import { Matrix } from '../math/Matrix';
import { INode, IMaterial, IBeamSection } from './types';

/**
 * 2D Frame/Beam Element
 *
 * Each node has 3 DOFs: u (axial), v (transverse), θ (rotation)
 * Element stiffness matrix is 6x6 in local coordinates
 *
 * Local coordinate system:
 * - x-axis: along beam from node 1 to node 2
 * - y-axis: perpendicular, positive upward (90° counter-clockwise from x)
 *
 * Sign conventions:
 * - Positive N: tension
 * - Positive V: causes clockwise rotation
 * - Positive M: causes tension in bottom fiber (sagging)
 */

export function calculateBeamLength(n1: INode, n2: INode): number {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateBeamAngle(n1: INode, n2: INode): number {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  return Math.atan2(dy, dx);
}

/**
 * Calculate the local stiffness matrix for a 2D beam element
 * Using Euler-Bernoulli beam theory
 *
 * DOF order: [u1, v1, θ1, u2, v2, θ2]
 */
export function calculateBeamLocalStiffness(
  L: number,
  E: number,
  A: number,
  I: number
): Matrix {
  const Ke = new Matrix(6, 6);

  const EA_L = E * A / L;
  const EI_L3 = E * I / (L * L * L);
  const EI_L2 = E * I / (L * L);
  const EI_L = E * I / L;

  // Axial stiffness terms
  Ke.set(0, 0, EA_L);
  Ke.set(0, 3, -EA_L);
  Ke.set(3, 0, -EA_L);
  Ke.set(3, 3, EA_L);

  // Bending stiffness terms
  // v1, v1
  Ke.set(1, 1, 12 * EI_L3);
  // v1, θ1
  Ke.set(1, 2, 6 * EI_L2);
  Ke.set(2, 1, 6 * EI_L2);
  // v1, v2
  Ke.set(1, 4, -12 * EI_L3);
  Ke.set(4, 1, -12 * EI_L3);
  // v1, θ2
  Ke.set(1, 5, 6 * EI_L2);
  Ke.set(5, 1, 6 * EI_L2);

  // θ1, θ1
  Ke.set(2, 2, 4 * EI_L);
  // θ1, v2
  Ke.set(2, 4, -6 * EI_L2);
  Ke.set(4, 2, -6 * EI_L2);
  // θ1, θ2
  Ke.set(2, 5, 2 * EI_L);
  Ke.set(5, 2, 2 * EI_L);

  // v2, v2
  Ke.set(4, 4, 12 * EI_L3);
  // v2, θ2
  Ke.set(4, 5, -6 * EI_L2);
  Ke.set(5, 4, -6 * EI_L2);

  // θ2, θ2
  Ke.set(5, 5, 4 * EI_L);

  return Ke;
}

/**
 * Create transformation matrix from local to global coordinates
 *
 * T transforms from local to global: {global} = [T] * {local}
 * T^T transforms from global to local: {local} = [T]^T * {global}
 */
export function createTransformationMatrix(angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  const T = new Matrix(6, 6);

  // Node 1 transformation
  T.set(0, 0, c);
  T.set(0, 1, s);
  T.set(1, 0, -s);
  T.set(1, 1, c);
  T.set(2, 2, 1);

  // Node 2 transformation
  T.set(3, 3, c);
  T.set(3, 4, s);
  T.set(4, 3, -s);
  T.set(4, 4, c);
  T.set(5, 5, 1);

  return T;
}

/**
 * Calculate global stiffness matrix for a beam element
 * Kg = T^T * Kl * T
 */
export function calculateBeamGlobalStiffness(
  n1: INode,
  n2: INode,
  material: IMaterial,
  section: IBeamSection
): Matrix {
  const L = calculateBeamLength(n1, n2);
  const angle = calculateBeamAngle(n1, n2);

  if (L < 1e-10) {
    throw new Error('Beam element has zero length');
  }

  const Kl = calculateBeamLocalStiffness(L, material.E, section.A, section.I);
  const T = createTransformationMatrix(angle);

  // Kg = T^T * Kl * T
  const TT = T.transpose();
  const temp = Kl.multiply(T);
  const Kg = TT.multiply(temp);

  return Kg;
}

/**
 * Calculate equivalent nodal forces for uniformly distributed load
 * in local coordinates
 *
 * qx: distributed axial load (N/m)
 * qy: distributed transverse load (N/m), positive upward in local y
 */
export function calculateDistributedLoadVector(
  L: number,
  qx: number,
  qy: number
): number[] {
  // Local force vector: [Fx1, Fy1, M1, Fx2, Fy2, M2]
  return [
    qx * L / 2,           // Fx1
    qy * L / 2,           // Fy1
    qy * L * L / 12,      // M1
    qx * L / 2,           // Fx2
    qy * L / 2,           // Fy2
    -qy * L * L / 12      // M2
  ];
}

/**
 * Calculate equivalent nodal forces for a partial distributed load.
 * startT and endT are normalized positions (0 to 1) along the beam.
 */
export function calculatePartialDistributedLoadVector(
  L: number,
  qx: number,
  qy: number,
  startT: number,
  endT: number
): number[] {
  // Partial load from a*L to b*L
  const a = startT;
  const b = endT;
  const span = (b - a) * L;

  // For a uniform partial load from position a*L to b*L:
  // Using integration of load * shape functions
  const La = a * L;
  const Lb = b * L;

  // Equivalent nodal forces using Hermite shape function integration
  // N1(x) = 1 - 3(x/L)^2 + 2(x/L)^3
  // N2(x) = x(1 - x/L)^2
  // N3(x) = 3(x/L)^2 - 2(x/L)^3
  // N4(x) = x^2/L * (x/L - 1)

  // Integrate qy * Ni(x) from La to Lb for transverse direction
  const intN1 = integrate_N1(La, Lb, L);
  const intN2 = integrate_N2(La, Lb, L);
  const intN3 = integrate_N3(La, Lb, L);
  const intN4 = integrate_N4(La, Lb, L);

  // For axial: linear shape functions
  const intL1 = span * (1 - (a + b) / 2); // integral of (1 - x/L) from La to Lb
  const intL2 = span * (a + b) / 2;       // integral of (x/L) from La to Lb

  return [
    qx * intL1,          // Fx1
    qy * intN1,          // Fy1
    qy * intN2,          // M1
    qx * intL2,          // Fx2
    qy * intN3,          // Fy2
    qy * intN4           // M2
  ];
}

// Hermite shape function integrals
function integrate_N1(a: number, b: number, L: number): number {
  // N1(x) = 1 - 3(x/L)^2 + 2(x/L)^3
  // Integral = x - (x/L)^3 * L + (x/L)^4 * L/2
  const eval_at = (x: number) => x - x*x*x/(L*L) + x*x*x*x/(2*L*L*L);
  return eval_at(b) - eval_at(a);
}

function integrate_N2(a: number, b: number, L: number): number {
  // N2(x) = x - 2x^2/L + x^3/L^2
  const eval_at = (x: number) => x*x/2 - 2*x*x*x/(3*L) + x*x*x*x/(4*L*L);
  return eval_at(b) - eval_at(a);
}

function integrate_N3(a: number, b: number, L: number): number {
  // N3(x) = 3(x/L)^2 - 2(x/L)^3
  const eval_at = (x: number) => x*x*x/(L*L) - x*x*x*x/(2*L*L*L);
  return eval_at(b) - eval_at(a);
}

function integrate_N4(a: number, b: number, L: number): number {
  // N4(x) = -x^2/L + x^3/L^2
  const eval_at = (x: number) => -x*x*x/(3*L) + x*x*x*x/(4*L*L);
  return eval_at(b) - eval_at(a);
}

/**
 * Calculate equivalent nodal forces for a full-span trapezoidal distributed load.
 * qxStart/qyStart at node 1, qxEnd/qyEnd at node 2.
 * q(x) = qStart + (qEnd - qStart) * x/L  (linear variation)
 */
export function calculateTrapezoidalLoadVector(
  L: number,
  qxStart: number,
  qyStart: number,
  qxEnd: number,
  qyEnd: number
): number[] {
  // Superposition: uniform part + triangular part
  // Uniform: q_uniform = qStart, full span
  // Triangle: q_tri(x) = (qEnd - qStart) * x/L, from 0 to L
  //
  // For transverse (qy):
  //   Uniform:   Fy1 = qy*L/2,   M1 = qy*L^2/12,   Fy2 = qy*L/2,   M2 = -qy*L^2/12
  //   Triangle:  Fy1 = 3dqy*L/20, M1 = dqy*L^2/30,  Fy2 = 7dqy*L/20, M2 = -dqy*L^2/20
  //
  // For axial (qx):
  //   Uniform:   Fx1 = qx*L/2,   Fx2 = qx*L/2
  //   Triangle:  Fx1 = dqx*L/6,  Fx2 = dqx*L/3

  const dqy = qyEnd - qyStart;
  const dqx = qxEnd - qxStart;

  return [
    qxStart * L / 2 + dqx * L / 6,                      // Fx1
    qyStart * L / 2 + 3 * dqy * L / 20,                 // Fy1
    qyStart * L * L / 12 + dqy * L * L / 30,            // M1
    qxStart * L / 2 + dqx * L / 3,                      // Fx2
    qyStart * L / 2 + 7 * dqy * L / 20,                 // Fy2
    -qyStart * L * L / 12 - dqy * L * L / 20            // M2
  ];
}

/**
 * Calculate equivalent nodal forces for a partial trapezoidal distributed load.
 * Load varies linearly from qStart at startT to qEnd at endT.
 * Uses numerical integration with Simpson's rule for accuracy.
 */
export function calculatePartialTrapezoidalLoadVector(
  L: number,
  qxStart: number,
  qyStart: number,
  qxEnd: number,
  qyEnd: number,
  startT: number,
  endT: number
): number[] {
  const La = startT * L;
  const Lb = endT * L;
  const span = Lb - La;
  if (span <= 0) return [0, 0, 0, 0, 0, 0];

  // Use 20 Simpson integration intervals
  const n = 20;
  const h = span / n;

  // Accumulators for force vector [Fx1, Fy1, M1, Fx2, Fy2, M2]
  const F = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i <= n; i++) {
    const x = La + i * h;
    const t = span > 0 ? (x - La) / span : 0; // parameter 0..1 within loaded region
    const qy_x = qyStart + (qyEnd - qyStart) * t;
    const qx_x = qxStart + (qxEnd - qxStart) * t;

    // Hermite shape functions at x
    const xi = x / L;
    const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const N2 = x * (1 - xi) * (1 - xi);
    const N3 = 3 * xi * xi - 2 * xi * xi * xi;
    const N4 = x * xi * (xi - 1);

    // Linear axial shape functions
    const L1 = 1 - xi;
    const L2 = xi;

    // Simpson weight
    let w: number;
    if (i === 0 || i === n) w = 1;
    else if (i % 2 === 1) w = 4;
    else w = 2;

    F[0] += w * qx_x * L1;  // Fx1
    F[1] += w * qy_x * N1;  // Fy1
    F[2] += w * qy_x * N2;  // M1
    F[3] += w * qx_x * L2;  // Fx2
    F[4] += w * qy_x * N3;  // Fy2
    F[5] += w * qy_x * N4;  // M2
  }

  const factor = h / 3;
  for (let i = 0; i < 6; i++) {
    F[i] *= factor;
  }

  return F;
}

/**
 * Transform local forces to global coordinates
 */
export function transformLocalToGlobal(localForces: number[], angle: number): number[] {
  const T = createTransformationMatrix(angle);
  const TT = T.transpose();

  // Global = T^T * Local
  const result = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      result[i] += TT.get(i, j) * localForces[j];
    }
  }
  return result;
}

/**
 * Transform global displacements to local coordinates
 */
export function transformGlobalToLocal(globalDisp: number[], angle: number): number[] {
  const T = createTransformationMatrix(angle);

  // Local = T * Global
  const result = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      result[i] += T.get(i, j) * globalDisp[j];
    }
  }
  return result;
}

/**
 * Common beam sections
 */
export const DEFAULT_SECTIONS: { name: string; section: IBeamSection }[] = [
  {
    name: 'IPE 100',
    section: { A: 10.3e-4, I: 171e-8, h: 0.100, Iy: 171e-8, Iz: 15.9e-8, Wy: 34.2e-6, Wz: 5.79e-6, Wply: 39.4e-6, Wplz: 9.15e-6 }
  },
  {
    name: 'IPE 200',
    section: { A: 28.5e-4, I: 1940e-8, h: 0.200, Iy: 1940e-8, Iz: 142e-8, Wy: 194e-6, Wz: 28.5e-6, Wply: 221e-6, Wplz: 44.6e-6 }
  },
  {
    name: 'IPE 300',
    section: { A: 53.8e-4, I: 8360e-8, h: 0.300, Iy: 8360e-8, Iz: 604e-8, Wy: 557e-6, Wz: 80.5e-6, Wply: 628e-6, Wplz: 125e-6 }
  },
  {
    name: 'HEA 100',
    section: { A: 21.2e-4, I: 349e-8, h: 0.096, Iy: 349e-8, Iz: 134e-8, Wy: 72.8e-6, Wz: 26.8e-6, Wply: 83.0e-6, Wplz: 41.1e-6 }
  },
  {
    name: 'HEA 200',
    section: { A: 53.8e-4, I: 3690e-8, h: 0.190, Iy: 3690e-8, Iz: 1340e-8, Wy: 389e-6, Wz: 134e-6, Wply: 430e-6, Wplz: 204e-6 }
  },
  {
    // b=100mm, h=200mm: Iy=bh³/12, Iz=hb³/12, Wy=bh²/6, Wz=hb²/6, Wply=bh²/4, Wplz=hb²/4
    name: 'Rectangle 100x200',
    section: { A: 0.02, I: 6.667e-5, h: 0.200, Iy: 6.667e-5, Iz: 1.667e-5, Wy: 6.667e-4, Wz: 3.333e-4, Wply: 1.0e-3, Wplz: 5.0e-4 }
  },
  {
    // b=200mm, h=400mm
    name: 'Rectangle 200x400',
    section: { A: 0.08, I: 1.067e-3, h: 0.400, Iy: 1.067e-3, Iz: 2.667e-4, Wy: 5.333e-3, Wz: 2.667e-3, Wply: 8.0e-3, Wplz: 4.0e-3 }
  },
  {
    // D=100mm, t=5mm → d=90mm; Iy=Iz=π(D⁴-d⁴)/64, Wy=Wz=π(D⁴-d⁴)/(32D)
    name: 'Tube 100x5',
    section: { A: 14.92e-4, I: 168e-8, h: 0.100, Iy: 168e-8, Iz: 168e-8, Wy: 33.6e-6, Wz: 33.6e-6, Wply: 44.3e-6, Wplz: 44.3e-6 }
  }
];

/**
 * Calculate section properties for rectangular section
 */
export function rectangularSection(b: number, h: number): IBeamSection {
  const Iy = b * h * h * h / 12;
  const Iz = h * b * b * b / 12;
  return {
    A: b * h,
    I: Iy,
    h: h,
    Iy,
    Iz,
    Wy: b * h * h / 6,
    Wz: h * b * b / 6,
    Wply: b * h * h / 4,
    Wplz: h * b * b / 4,
  };
}

/**
 * Calculate section properties for circular tube
 */
export function tubularSection(D: number, t: number): IBeamSection {
  const r_outer = D / 2;
  const r_inner = r_outer - t;
  const Iy = Math.PI / 4 * (Math.pow(r_outer, 4) - Math.pow(r_inner, 4));
  const Wy = Iy / r_outer;
  // Plastic section modulus for hollow circular tube
  const Wply = (4 / 3) * (Math.pow(r_outer, 3) - Math.pow(r_inner, 3));
  return {
    A: Math.PI * (r_outer * r_outer - r_inner * r_inner),
    I: Iy,
    h: D,
    Iy,
    Iz: Iy,     // Symmetric: Iz = Iy for circular tube
    Wy,
    Wz: Wy,     // Symmetric
    Wply,
    Wplz: Wply,  // Symmetric
  };
}

/**
 * Calculate section properties for I-profile (simplified)
 */
export function iProfileSection(h: number, b: number, tw: number, tf: number): IBeamSection {
  // Web contribution
  const Aw = (h - 2 * tf) * tw;
  const Iw = tw * Math.pow(h - 2 * tf, 3) / 12;

  // Flange contributions (2 flanges)
  const Af = 2 * b * tf;
  const d = (h - tf) / 2; // distance from centroid to flange centroid
  const If = 2 * (b * Math.pow(tf, 3) / 12 + b * tf * d * d);

  const A = Aw + Af;
  const Iy = Iw + If;

  // Weak axis: Iz = 2*(tf*b³/12) + (h-2*tf)*tw³/12
  const Iz = 2 * (tf * Math.pow(b, 3) / 12) + (h - 2 * tf) * Math.pow(tw, 3) / 12;

  // Elastic section moduli
  const Wy = Iy / (h / 2);
  const Wz = Iz / (b / 2);

  // Plastic section moduli (approximate)
  // Strong axis: Wply = b*tf*(h-tf) + tw*(h-2*tf)²/4
  const Wply = b * tf * (h - tf) + tw * Math.pow(h - 2 * tf, 2) / 4;
  // Weak axis: Wplz = 2*tf*b²/4 + (h-2*tf)*tw²/4
  const Wplz = tf * b * b / 2 + (h - 2 * tf) * tw * tw / 4;

  return {
    A,
    I: Iy,
    h,
    Iy,
    Iz,
    Wy,
    Wz,
    Wply,
    Wplz,
  };
}
