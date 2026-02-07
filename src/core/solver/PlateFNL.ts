/**
 * PlateFNL.ts - Physically Nonlinear Plate Solver for Reinforced Concrete
 *
 * Implements a layered concrete model with:
 * - Through-thickness integration (10-20 layers)
 * - Cracked concrete (tension cut-off)
 * - Crack direction tracking (fixed crack model)
 * - Reinforcement layers (top/bottom mesh)
 * - Newton-Raphson iteration with D-matrix updates
 */

import { Matrix } from '../math/Matrix';
import { Mesh } from '../fem/Mesh';
import { IPlateRegion, IPlateReinforcement, IReinforcementMesh } from '../fem/types';

// ============================================================================
// Material Interfaces
// ============================================================================

export interface IConcretePlateLayer {
  z: number;              // Distance from mid-surface (m), + = top
  thickness: number;      // Layer thickness (m)
  isCracked: boolean;
  crackAngle: number;     // Principal crack direction (rad)
  epsilonX: number;       // Strain in X
  epsilonY: number;       // Strain in Y
  gammaXY: number;        // Shear strain
  sigmaX: number;         // Stress in X (Pa)
  sigmaY: number;         // Stress in Y (Pa)
  tauXY: number;          // Shear stress (Pa)
}

export interface IRebarPlateLayer {
  z: number;              // Distance from mid-surface (m)
  direction: 'X' | 'Y';   // Bar direction
  As: number;             // Area per unit width (m²/m)
  fy: number;             // Yield strength (Pa)
  Es: number;             // Young's modulus (Pa)
  isYielded: boolean;
  strain: number;
  stress: number;
}

export interface IPlateElementState {
  elementId: number;
  concreteLayers: IConcretePlateLayer[];
  rebarLayers: IRebarPlateLayer[];
  Deff: Matrix;           // Effective 3x3 D-matrix for membrane
  Dbend: Matrix;          // Effective 3x3 D-matrix for bending
  isCracked: boolean;
}

export interface IPlateFNLOptions {
  nLayers: number;            // Number of concrete layers (default 10)
  fck: number;                // Characteristic strength (Pa)
  fctm: number;               // Mean tensile strength (Pa)
  Ecm: number;                // Secant modulus (Pa)
  nu: number;                 // Poisson's ratio
  epsilonC2: number;          // Strain at peak (default 0.002)
  epsilonCU2: number;         // Ultimate strain (default 0.0035)
  rebarEs: number;            // Rebar modulus (default 200e9)
  rebarFy: number;            // Rebar yield (default 500e6)
  maxIterations: number;
  tolerance: number;
  crackModel: 'fixed' | 'rotating';  // Fixed or rotating crack
  tensionStiffening: boolean;        // Include tension stiffening
  beta: number;                      // Tension stiffening factor
}

const DEFAULT_PLATE_FNL_OPTIONS: IPlateFNLOptions = {
  nLayers: 10,
  fck: 30e6,
  fctm: 2.9e6,
  Ecm: 33e9,
  nu: 0.2,
  epsilonC2: 0.002,
  epsilonCU2: 0.0035,
  rebarEs: 200e9,
  rebarFy: 500e6,
  maxIterations: 20,
  tolerance: 1e-4,
  crackModel: 'fixed',
  tensionStiffening: true,
  beta: 0.4,
};

// ============================================================================
// Concrete Material Model
// ============================================================================

/**
 * Uniaxial concrete stress-strain (compression positive)
 * EC2 parabola-rectangle for compression, linear tension until cracking
 */
function concreteUniaxialStress(
  epsilon: number,
  opts: IPlateFNLOptions
): { sigma: number; Et: number } {
  const { fck, fctm, Ecm, epsilonC2, epsilonCU2, tensionStiffening, beta } = opts;
  const fcd = fck / 1.5; // Design strength

  if (epsilon > 0) {
    // Tension
    const epsilonCr = fctm / Ecm; // Cracking strain
    if (epsilon <= epsilonCr) {
      // Uncracked tension
      return { sigma: Ecm * epsilon, Et: Ecm };
    } else {
      // Cracked - tension stiffening or zero
      if (tensionStiffening) {
        // Exponential decay of tension stiffening
        const decay = Math.exp(-beta * (epsilon - epsilonCr) / epsilonCr);
        const sigma = fctm * decay * 0.4; // Reduced contribution
        return { sigma, Et: sigma > 0 ? -beta * sigma / epsilonCr : 0 };
      }
      return { sigma: 0, Et: 0 };
    }
  } else {
    // Compression (make epsilon positive for calculation)
    const epsC = -epsilon;

    if (epsC <= epsilonC2) {
      // Parabolic part
      const n = 2;
      const ratio = epsC / epsilonC2;
      const sigma = -fcd * (1 - Math.pow(1 - ratio, n));
      const Et = fcd * n * Math.pow(1 - ratio, n - 1) / epsilonC2;
      return { sigma, Et };
    } else if (epsC <= epsilonCU2) {
      // Constant plateau
      return { sigma: -fcd, Et: 0 };
    } else {
      // Crushed
      return { sigma: 0, Et: 0 };
    }
  }
}

/**
 * Biaxial concrete model with crack tracking
 * Uses modified compression field theory (MCFT) principles
 */
function concreteBiaxialStress(
  layer: IConcretePlateLayer,
  epsilonX: number,
  epsilonY: number,
  gammaXY: number,
  opts: IPlateFNLOptions
): { sigmaX: number; sigmaY: number; tauXY: number; D: Matrix; cracked: boolean; crackAngle: number } {
  const { Ecm, nu, crackModel } = opts;

  // Principal strains
  const epsilonAvg = (epsilonX + epsilonY) / 2;
  const R = Math.sqrt(((epsilonX - epsilonY) / 2) ** 2 + (gammaXY / 2) ** 2);
  const epsilon1 = epsilonAvg + R; // Major principal (tension positive)
  const epsilon2 = epsilonAvg - R; // Minor principal

  // Principal angle
  let theta = 0.5 * Math.atan2(gammaXY, epsilonX - epsilonY);

  // Get uniaxial stresses in principal directions
  const { sigma: sigma1, Et: Et1 } = concreteUniaxialStress(epsilon1, opts);
  const { sigma: sigma2, Et: Et2 } = concreteUniaxialStress(epsilon2, opts);

  // Check for cracking
  const epsilonCr = opts.fctm / Ecm;
  const cracked = epsilon1 > epsilonCr;

  // Use fixed or rotating crack angle
  let crackAngle = theta;
  if (cracked && crackModel === 'fixed' && layer.isCracked) {
    // Keep original crack angle
    crackAngle = layer.crackAngle;
  }

  // Transform stresses back to global XY
  const cos2 = Math.cos(2 * theta);
  const sin2 = Math.sin(2 * theta);

  const sigmaX = (sigma1 + sigma2) / 2 + (sigma1 - sigma2) / 2 * cos2;
  const sigmaY = (sigma1 + sigma2) / 2 - (sigma1 - sigma2) / 2 * cos2;
  const tauXY = (sigma1 - sigma2) / 2 * sin2;

  // Tangent D-matrix in principal directions
  const D1 = new Matrix(3, 3);
  if (!cracked) {
    // Uncracked isotropic
    const factor = Ecm / (1 - nu * nu);
    D1.set(0, 0, factor);
    D1.set(0, 1, factor * nu);
    D1.set(1, 0, factor * nu);
    D1.set(1, 1, factor);
    D1.set(2, 2, Ecm / (2 * (1 + nu)));
  } else {
    // Cracked - orthotropic in principal directions
    D1.set(0, 0, Et1); // Direction 1 (cracked)
    D1.set(1, 1, Et2); // Direction 2
    // Reduced shear stiffness
    const Gred = Math.min(Et1, Et2) / (2 * (1 + nu)) * 0.4;
    D1.set(2, 2, Math.max(Gred, 1e6)); // Minimum shear stiffness
  }

  // Transform D-matrix to global XY
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const T = new Matrix(3, 3);
  T.set(0, 0, c * c);
  T.set(0, 1, s * s);
  T.set(0, 2, c * s);
  T.set(1, 0, s * s);
  T.set(1, 1, c * c);
  T.set(1, 2, -c * s);
  T.set(2, 0, -2 * c * s);
  T.set(2, 1, 2 * c * s);
  T.set(2, 2, c * c - s * s);

  const TT = T.transpose();
  const D = TT.multiply(D1).multiply(T);

  return { sigmaX, sigmaY, tauXY, D, cracked, crackAngle };
}

// ============================================================================
// Reinforcement Model
// ============================================================================

/**
 * Calculate rebar stress (bilinear elastic-plastic)
 */
function rebarStress(
  epsilon: number,
  Es: number,
  fy: number
): { sigma: number; Et: number; yielded: boolean } {
  const epsilonY = fy / Es;

  if (Math.abs(epsilon) <= epsilonY) {
    return { sigma: Es * epsilon, Et: Es, yielded: false };
  } else {
    const sign = epsilon > 0 ? 1 : -1;
    // Small hardening to avoid numerical issues
    const Esh = Es * 0.01;
    const sigma = sign * (fy + Esh * (Math.abs(epsilon) - epsilonY));
    return { sigma, Et: Esh, yielded: true };
  }
}

// ============================================================================
// Plate Element State Management
// ============================================================================

/**
 * Initialize element state with layers
 */
export function initPlateElementState(
  elementId: number,
  thickness: number,
  reinforcement: IPlateReinforcement | undefined,
  opts: IPlateFNLOptions
): IPlateElementState {
  const { nLayers, Ecm, nu } = opts;
  const h = thickness;
  const layerH = h / nLayers;

  // Create concrete layers
  const concreteLayers: IConcretePlateLayer[] = [];
  for (let i = 0; i < nLayers; i++) {
    const z = -h / 2 + layerH / 2 + i * layerH; // From bottom to top
    concreteLayers.push({
      z,
      thickness: layerH,
      isCracked: false,
      crackAngle: 0,
      epsilonX: 0,
      epsilonY: 0,
      gammaXY: 0,
      sigmaX: 0,
      sigmaY: 0,
      tauXY: 0,
    });
  }

  // Create rebar layers from reinforcement config
  const rebarLayers: IRebarPlateLayer[] = [];
  if (reinforcement) {
    const addRebarLayer = (mesh: IReinforcementMesh | undefined, position: 'top' | 'bottom') => {
      if (!mesh) return;
      const z = position === 'bottom'
        ? -h / 2 + mesh.cover / 1000 + mesh.barDiameter / 2000
        : h / 2 - mesh.cover / 1000 - mesh.barDiameter / 2000;
      const As = Math.PI * (mesh.barDiameter / 2000) ** 2 / (mesh.spacing / 1000);
      rebarLayers.push({
        z,
        direction: mesh.direction,
        As,
        fy: opts.rebarFy,
        Es: opts.rebarEs,
        isYielded: false,
        strain: 0,
        stress: 0,
      });
    };

    addRebarLayer(reinforcement.bottomX, 'bottom');
    addRebarLayer(reinforcement.bottomY, 'bottom');
    addRebarLayer(reinforcement.topX, 'top');
    addRebarLayer(reinforcement.topY, 'top');
  }

  // Initial elastic D-matrices
  const factor = Ecm / (1 - nu * nu);
  const Delas = new Matrix(3, 3);
  Delas.set(0, 0, factor);
  Delas.set(0, 1, factor * nu);
  Delas.set(1, 0, factor * nu);
  Delas.set(1, 1, factor);
  Delas.set(2, 2, Ecm / (2 * (1 + nu)));

  // Membrane stiffness: D * h
  const Deff = Delas.scale(h);

  // Bending stiffness: D * h³/12
  const Dbend = Delas.scale(h * h * h / 12);

  return {
    elementId,
    concreteLayers,
    rebarLayers,
    Deff,
    Dbend,
    isCracked: false,
  };
}

/**
 * Update element state based on current strains
 * Returns updated D-matrices for membrane and bending
 */
export function updatePlateElementState(
  state: IPlateElementState,
  kappasX: number,      // Curvature in X (1/m)
  kappaY: number,       // Curvature in Y (1/m)
  kappaXY: number,      // Twist curvature (1/m)
  epsilon0X: number,    // Membrane strain X
  epsilon0Y: number,    // Membrane strain Y
  gamma0XY: number,     // Membrane shear strain
  opts: IPlateFNLOptions
): IPlateElementState {
  const { nLayers } = opts;

  // Integrate through thickness
  let DmemSum = new Matrix(3, 3);
  let DbendSum = new Matrix(3, 3);
  let anyCracked = false;

  const updatedConcreteLayers: IConcretePlateLayer[] = [];

  for (let i = 0; i < state.concreteLayers.length; i++) {
    const layer = state.concreteLayers[i];
    const z = layer.z;
    const dz = layer.thickness;

    // Total strain at layer = membrane + z * curvature
    const epsilonX = epsilon0X + z * kappasX;
    const epsilonY = epsilon0Y + z * kappaY;
    const gammaXY = gamma0XY + z * kappaXY;

    // Get concrete stress and tangent D
    const result = concreteBiaxialStress(layer, epsilonX, epsilonY, gammaXY, opts);

    if (result.cracked) anyCracked = true;

    // Update layer
    const updatedLayer: IConcretePlateLayer = {
      ...layer,
      epsilonX,
      epsilonY,
      gammaXY,
      sigmaX: result.sigmaX,
      sigmaY: result.sigmaY,
      tauXY: result.tauXY,
      isCracked: result.cracked,
      crackAngle: result.crackAngle,
    };
    updatedConcreteLayers.push(updatedLayer);

    // Integrate D-matrix contributions
    // Membrane: D * dz
    // Bending: D * z² * dz
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        DmemSum.addAt(r, c, result.D.get(r, c) * dz);
        DbendSum.addAt(r, c, result.D.get(r, c) * z * z * dz);
      }
    }
  }

  // Update rebar layers
  const updatedRebarLayers: IRebarPlateLayer[] = [];

  for (const rebar of state.rebarLayers) {
    const z = rebar.z;

    // Strain in rebar direction
    const epsilonX = epsilon0X + z * kappasX;
    const epsilonY = epsilon0Y + z * kappaY;
    const strain = rebar.direction === 'X' ? epsilonX : epsilonY;

    // Get rebar stress
    const { sigma, Et, yielded } = rebarStress(strain, rebar.Es, rebar.fy);

    updatedRebarLayers.push({
      ...rebar,
      strain,
      stress: sigma,
      isYielded: yielded,
    });

    // Add rebar stiffness to D-matrices (smeared)
    // Only in the bar direction
    const idx = rebar.direction === 'X' ? 0 : 1;
    const EAs = Et * rebar.As; // Stiffness per unit width

    DmemSum.addAt(idx, idx, EAs);
    DbendSum.addAt(idx, idx, EAs * z * z);
  }

  return {
    ...state,
    concreteLayers: updatedConcreteLayers,
    rebarLayers: updatedRebarLayers,
    Deff: DmemSum,
    Dbend: DbendSum,
    isCracked: anyCracked,
  };
}

/**
 * Calculate internal forces from element state (for residual calculation)
 */
export function calculatePlateInternalForces(
  state: IPlateElementState
): { Nx: number; Ny: number; Nxy: number; Mx: number; My: number; Mxy: number } {
  let Nx = 0, Ny = 0, Nxy = 0;
  let Mx = 0, My = 0, Mxy = 0;

  // Integrate concrete stresses
  for (const layer of state.concreteLayers) {
    const dz = layer.thickness;
    const z = layer.z;

    Nx += layer.sigmaX * dz;
    Ny += layer.sigmaY * dz;
    Nxy += layer.tauXY * dz;

    Mx += layer.sigmaX * z * dz;
    My += layer.sigmaY * z * dz;
    Mxy += layer.tauXY * z * dz;
  }

  // Add rebar contributions
  for (const rebar of state.rebarLayers) {
    const z = rebar.z;
    const force = rebar.stress * rebar.As;

    if (rebar.direction === 'X') {
      Nx += force;
      Mx += force * z;
    } else {
      Ny += force;
      My += force * z;
    }
  }

  return { Nx, Ny, Nxy, Mx, My, Mxy };
}

// ============================================================================
// Utility: Get D-matrix for a plate region
// ============================================================================

/**
 * Calculate effective D-matrix for a cracked plate region
 */
export function getEffectivePlateStiffness(
  plate: IPlateRegion,
  elementStates: Map<number, IPlateElementState>
): { Deff: Matrix; Dbend: Matrix; percentCracked: number } {
  let totalElements = 0;
  let crackedElements = 0;
  const DeffSum = new Matrix(3, 3);
  const DbendSum = new Matrix(3, 3);

  for (const elemId of plate.elementIds) {
    const state = elementStates.get(elemId);
    if (!state) continue;

    totalElements++;
    if (state.isCracked) crackedElements++;

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        DeffSum.addAt(i, j, state.Deff.get(i, j));
        DbendSum.addAt(i, j, state.Dbend.get(i, j));
      }
    }
  }

  const n = Math.max(totalElements, 1);
  const Deff = DeffSum.scale(1 / n);
  const Dbend = DbendSum.scale(1 / n);
  const percentCracked = totalElements > 0 ? (crackedElements / totalElements) * 100 : 0;

  return { Deff, Dbend, percentCracked };
}
