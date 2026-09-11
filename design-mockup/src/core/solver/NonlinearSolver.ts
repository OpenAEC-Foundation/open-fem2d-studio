/**
 * Geometric Nonlinear Frame Solver
 *
 * Implements P-Delta analysis for second-order effects
 * Uses Newton-Raphson iteration for geometric nonlinearity
 */

import { Matrix } from '../math/Matrix';
import { Mesh } from '../fem/Mesh';
import { ISolverResult, IBeamForces, IElementStress, AnalysisType, getConnectionTypes, getReleasedLocalDofs, getSprungLocalDofs, getBeamDistributedLoads } from '../fem/types';
import {
  calculateBeamLength,
  calculateBeamAngle,
  calculateBeamLocalStiffness,
  createTransformationMatrix,
  calculateDistributedLoadLocalForces,
} from '../fem/Beam';
import { calculateBeamInternalForces } from '../fem/BeamForces';
import { calculateBeamThermalLocalForces } from '../fem/ThermalLoad';
import { calculateElementStress, calculatePrincipalStresses, calculateTriangleGeometricStiffness, expandTriangleGeometricStiffness } from '../fem/Triangle';
import { calculateQuadStress, calculateQuadGeometricStiffness, expandQuadGeometricStiffness } from '../fem/Quad4';
import { calculateElementMoments, calculateElementShearForces } from '../fem/DKT';
import { assembleGlobalStiffnessMatrix, assembleForceVector as assembleForceVectorNew, getConstrainedDofs, getDofsPerNode, applyEndReleases, applyEndConnections, buildNodeIdToIndex } from './Assembler';
// De keuze welke stelseloplosser draait loopt via één plek: `LinearSolver`.
// De zeven aanroepen hieronder houden hun bestaande handtekening en weten niet
// welke oplosser eronder zit. Standaard is dat nog steeds de dichte
// Gauss-eliminatie uit `GaussElimination`.
import { solveLinearSystem } from '../math/LinearSolver';
import {
  ISectionState,
  createSteelMaterial,
  createConcreteMaterial,
  initSectionState,
  updateSectionState,
} from './NonlinearMaterial';

/**
 * Eén regel solverlogboek.
 *
 * De solver MELDT; hij bewaart niets. Dat is met opzet: het log is juist het
 * meest waard wanneer de solver daarna een fout gooit (divergentie, singuliere
 * K), en dan komt er nooit een resultaatobject waar het log in had kunnen
 * zitten. Een callback levert de regels wél, tot en met de laatste iteratie
 * vóór de fout.
 *
 * `soort` stuurt de weergave, niet de inhoud:
 *   - `info`        — een stap die gelukt is (assembly, randvoorwaarden)
 *   - `iteratie`    — één Newton-Raphson-stap, met de twee normen
 *   - `waarschuwing`— iets wat de uitkomst kleurt maar hem niet verwerpt
 *   - `fout`        — de reden waarom er zo meteen niets terugkomt
 */
export interface SolverLogRegel {
  soort: 'info' | 'iteratie' | 'waarschuwing' | 'fout';
  tekst: string;
  /** Laststap (1-gebaseerd); alleen bij `iteratie`. */
  laststap?: number;
  /** Iteratienummer binnen de laststap (1-gebaseerd); alleen bij `iteratie`. */
  iteratie?: number;
  /** ‖Δu‖ van deze iteratie. */
  incrementNorm?: number;
  /** ‖u‖ na deze iteratie — samen met de vorige de convergentiemaat. */
  verplaatsingsNorm?: number;
}

export interface NonlinearSolverOptions {
  analysisType: AnalysisType;
  geometricNonlinear: boolean;
  materialNonlinear: boolean;          // Enable physical nonlinearity (FNL)
  materialType: 'steel' | 'concrete';  // Material model for FNL
  steelFy: number;                     // Steel yield strength (Pa)
  concreteFck: number;                 // Concrete characteristic strength (Pa)
  maxIterations: number;
  tolerance: number;
  loadSteps: number;
  /**
   * Ontvangt elke logregel zodra hij ontstaat. Weglaten = geen log, en dan
   * kost dit niets: er wordt geen tekst opgebouwd die niemand leest.
   *
   * De ontvanger mag NIET gooien — hij draait midden in de iteratielus.
   */
  onLog?: (regel: SolverLogRegel) => void;
}

const DEFAULT_OPTIONS: NonlinearSolverOptions = {
  analysisType: 'frame',
  geometricNonlinear: false,
  materialNonlinear: false,
  materialType: 'steel',
  steelFy: 235e6,        // S235
  concreteFck: 30e6,     // C30/37
  maxIterations: 20,
  tolerance: 1e-6,
  loadSteps: 1
};

/**
 * Calculate geometric stiffness matrix for a beam element
 * This accounts for the P-Delta effect (second-order effects)
 */
function calculateGeometricStiffness(
  L: number,
  N: number  // Axial force (positive = tension)
): Matrix {
  const Kg = new Matrix(6, 6);

  const factor = N / L;

  // Geometric stiffness for transverse DOFs
  // Based on consistent geometric stiffness matrix
  const a = 6 / 5;
  const b = L / 10;
  const c = 2 * L * L / 15;
  const d = -L / 10;
  const e = -L * L / 30;

  // v1, v1
  Kg.set(1, 1, a * factor);
  // v1, θ1
  Kg.set(1, 2, b * factor);
  Kg.set(2, 1, b * factor);
  // v1, v2
  Kg.set(1, 4, -a * factor);
  Kg.set(4, 1, -a * factor);
  // v1, θ2
  Kg.set(1, 5, b * factor);
  Kg.set(5, 1, b * factor);

  // θ1, θ1
  Kg.set(2, 2, c * factor);
  // θ1, v2
  Kg.set(2, 4, d * factor);
  Kg.set(4, 2, d * factor);
  // θ1, θ2
  Kg.set(2, 5, e * factor);
  Kg.set(5, 2, e * factor);

  // v2, v2
  Kg.set(4, 4, a * factor);
  // v2, θ2
  Kg.set(4, 5, d * factor);
  Kg.set(5, 4, d * factor);

  // θ2, θ2
  Kg.set(5, 5, c * factor);

  return Kg;
}

/**
 * Assemble global stiffness matrix including geometric stiffness
 */
function assembleGlobalStiffnessWithGeometric(
  mesh: Mesh,
  axialForces: Map<number, number>,  // elementId -> N
  includeGeometric: boolean
): Matrix {
  const numNodes = mesh.getNodeCount();
  const numDofs = numNodes * 3;
  const K = new Matrix(numDofs, numDofs);

  // Create node ID to index mapping
  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);

    if (L < 1e-10) continue;

    // Linear elastic stiffness
    const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);

    // Statische condensatie voor releases: buigscharnieren (Rz) én
    // translatie-releases (Tx = axiaal / normaalkrachthuls, Tz = dwars),
    // in LOKALE assen — vandaar vóór de transformatie naar globaal.
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if (veren.length > 0) {
      applyEndConnections(Kl, releasedLocalDofs, veren);
    } else if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }

    // Add geometric stiffness if requested
    if (includeGeometric) {
      // TEKENCONVENTIE: calculateAllInternalForces vult axialForces met
      // (N1+N2)/2 uit de krachtenrecovery, en die levert N1 = f_lokaal[0]
      // — DRUK-positief (empirisch geverifieerd: trek geeft negatieve N1).
      // calculateGeometricStiffness verwacht N trek-positief, dus flippen.
      // Zonder deze flip verstijft druk i.p.v. verslapt (P-Δ verkeerd om).
      const N = -(axialForces.get(beam.id) || 0);
      const Kg = calculateGeometricStiffness(L, N);

      // Add geometric stiffness to local stiffness.
      // Beperking: Kg wordt NIET mee-gecondenseerd met scharnier-releases
      // (kleine benadering; de Kg-termen ~N/L zijn klein t.o.v. EI/L³).
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          Kl.addAt(i, j, Kg.get(i, j));
        }
      }
    }

    // Transform to global
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const temp = Kl.multiply(T);
    const Ke = TT.multiply(temp);

    // Get DOF indices
    const idx1 = nodeIdToIndex.get(n1.id)!;
    const idx2 = nodeIdToIndex.get(n2.id)!;
    const dofIndices = [
      idx1 * 3, idx1 * 3 + 1, idx1 * 3 + 2,
      idx2 * 3, idx2 * 3 + 1, idx2 * 3 + 2
    ];

    // Assemble
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
      }
    }

    // Add Winkler foundation stiffness for beam on grade
    if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
      const k = beam.onGrade.k; // N/m² (spring stiffness per unit area)
      const b = beam.onGrade.b ?? 1.0; // Foundation width in m (default 1.0m)
      const kL = k * b * L; // Total spring stiffness along beam

      // Vertical stiffness (primary Winkler stiffness)
      const v1Dof = dofIndices[1]; // v1
      const v2Dof = dofIndices[4]; // v2
      K.addAt(v1Dof, v1Dof, kL / 2);
      K.addAt(v2Dof, v2Dof, kL / 2);

      // Small horizontal friction stiffness to prevent singularity (0.1% of vertical)
      const u1Dof = dofIndices[0]; // u1
      const u2Dof = dofIndices[3]; // u2
      const kFriction = kL * 0.001;
      K.addAt(u1Dof, u1Dof, kFriction / 2);
      K.addAt(u2Dof, u2Dof, kFriction / 2);
    }
  }

  // Add spring support stiffness to diagonal
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === undefined) continue;
    const c = node.constraints;
    if (c.springX != null && c.x) {
      K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
    }
    if (c.springY != null && c.y) {
      K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
    }
    if (c.springRot != null && c.rotation) {
      K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
    }
  }

  return K;
}

/**
 * Calculate beam element stiffness with reduced EI from material nonlinearity
 * Uses the tangent stiffness EI_tangent from M-κ relationship
 */
function calculateBeamLocalStiffnessFNL(
  L: number,
  E: number,
  A: number,
  _I: number,          // Not used directly - EI_tangent provides the stiffness
  EI_tangent: number   // From M-κ relationship
): Matrix {
  const Kl = new Matrix(6, 6);

  // Axial stiffness (unchanged - assuming axial remains elastic)
  const EA_L = E * A / L;
  Kl.set(0, 0, EA_L);
  Kl.set(0, 3, -EA_L);
  Kl.set(3, 0, -EA_L);
  Kl.set(3, 3, EA_L);

  // Bending stiffness using tangent EI
  const EI = EI_tangent;
  const EI_L3 = EI / (L * L * L);
  const EI_L2 = EI / (L * L);
  const EI_L = EI / L;

  // v1, v1
  Kl.set(1, 1, 12 * EI_L3);
  // v1, θ1
  Kl.set(1, 2, 6 * EI_L2);
  Kl.set(2, 1, 6 * EI_L2);
  // v1, v2
  Kl.set(1, 4, -12 * EI_L3);
  Kl.set(4, 1, -12 * EI_L3);
  // v1, θ2
  Kl.set(1, 5, 6 * EI_L2);
  Kl.set(5, 1, 6 * EI_L2);

  // θ1, θ1
  Kl.set(2, 2, 4 * EI_L);
  // θ1, v2
  Kl.set(2, 4, -6 * EI_L2);
  Kl.set(4, 2, -6 * EI_L2);
  // θ1, θ2
  Kl.set(2, 5, 2 * EI_L);
  Kl.set(5, 2, 2 * EI_L);

  // v2, v2
  Kl.set(4, 4, 12 * EI_L3);
  // v2, θ2
  Kl.set(4, 5, -6 * EI_L2);
  Kl.set(5, 4, -6 * EI_L2);

  // θ2, θ2
  Kl.set(5, 5, 4 * EI_L);

  return Kl;
}

/**
 * Assemble global stiffness matrix with material nonlinearity (FNL)
 * For steel: uses tangent stiffness from M-κ section states.
 *
 * BETON LOOPT HIER NIET LANGS. De gescheurde buigstijfheid komt uit de
 * rekenkern (NEN-EN 1992-1-1, M-N-κ met de werkelijke wapeningskorf) en wordt
 * per SEGMENT als `section.I` van een deelelement aangeleverd — zie
 * `lib/betonStijfheid.ts`. `solveNonlinear` weigert daarom
 * `materialNonlinear` met `materialType: 'concrete'`.
 */
function assembleGlobalStiffnessFNL(
  mesh: Mesh,
  sectionStates: Map<number, ISectionState>,
  axialForces: Map<number, number>,
  includeGeometric: boolean
): Matrix {
  const numNodes = mesh.getNodeCount();
  const numDofs = numNodes * 3;
  const K = new Matrix(numDofs, numDofs);

  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);

    if (L < 1e-10) continue;

    // Steel: use tangent stiffness from M-κ relationship
    const sectionState = sectionStates.get(beam.id);
    const EI_eff = sectionState?.tangentStiffness ?? (material.E * beam.section.I);

    // Local stiffness with effective EI
    const Kl = calculateBeamLocalStiffnessFNL(L, material.E, beam.section.A, beam.section.I, EI_eff);

    // Releases condenseren (Rz-scharnieren + Tx/Tz-hulzen, lokale assen)
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if (veren.length > 0) {
      applyEndConnections(Kl, releasedLocalDofs, veren);
    } else if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }

    // Add geometric stiffness
    if (includeGeometric) {
      // Zelfde tekenflip als in assembleGlobalStiffnessWithGeometric:
      // recovery-N is druk-positief, Kg verwacht trek-positief.
      const N = -(axialForces.get(beam.id) || 0);
      const Kg = calculateGeometricStiffness(L, N);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          Kl.addAt(i, j, Kg.get(i, j));
        }
      }
    }

    // Transform to global
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const temp = Kl.multiply(T);
    const Ke = TT.multiply(temp);

    // Get DOF indices
    const idx1 = nodeIdToIndex.get(n1.id)!;
    const idx2 = nodeIdToIndex.get(n2.id)!;
    const dofIndices = [
      idx1 * 3, idx1 * 3 + 1, idx1 * 3 + 2,
      idx2 * 3, idx2 * 3 + 1, idx2 * 3 + 2
    ];

    // Assemble
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
      }
    }
  }

  // Add spring support stiffness
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === undefined) continue;
    const c = node.constraints;
    if (c.springX != null && c.x) {
      K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
    }
    if (c.springY != null && c.y) {
      K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
    }
    if (c.springRot != null && c.rotation) {
      K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
    }
  }

  return K;
}

/**
 * Update section states based on current displacements
 * For steel: updates M-κ state for plastic hinge tracking.
 */
function updateAllSectionStates(
  mesh: Mesh,
  displacements: number[],
  sectionStates: Map<number, ISectionState>,
  opts: NonlinearSolverOptions
): Map<number, ISectionState> {
  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  const steel = opts.materialType === 'steel' ? createSteelMaterial(opts.steelFy) : undefined;
  const concrete = opts.materialType === 'concrete' ? createConcreteMaterial(opts.concreteFck) : undefined;

  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);

    if (L < 1e-10) continue;

    const idx1 = nodeIdToIndex.get(n1.id)!;
    const idx2 = nodeIdToIndex.get(n2.id)!;

    // Extract local displacements
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const u1 = displacements[idx1 * 3];
    const v1 = displacements[idx1 * 3 + 1];
    const theta1 = displacements[idx1 * 3 + 2];
    const u2 = displacements[idx2 * 3];
    const v2 = displacements[idx2 * 3 + 1];
    const theta2 = displacements[idx2 * 3 + 2];

    // Transform to local (only transverse displacements needed for curvature)
    const vL1 = -u1 * sin + v1 * cos;
    const vL2 = -u2 * sin + v2 * cos;

    // Calculate curvature at mid-span (approximate)
    // κ ≈ (θ2 - θ1) / L + 6*(vL2 - vL1) / L²
    const kappa = (theta2 - theta1) / L + 6 * (vL2 - vL1) / (L * L);

    // Steel: use M-κ relationship for plastic hinge tracking
    let state = sectionStates.get(beam.id);
    if (!state) {
      state = initSectionState(beam.section, opts.materialType, steel, concrete);
    }

    state = updateSectionState(
      state, kappa, beam.section, opts.materialType,
      steel, concrete,
      undefined, // rebarTop
      undefined  // rebarBot
    );

    sectionStates.set(beam.id, state);
  }

  return sectionStates;
}

/**
 * Assemble force vector from nodal loads and distributed loads
 */
function assembleForceVector(mesh: Mesh): number[] {
  const numNodes = mesh.getNodeCount();
  const F: number[] = new Array(numNodes * 3).fill(0);

  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  // Nodal loads
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id)!;
    F[idx * 3] = node.loads.fx;
    F[idx * 3 + 1] = node.loads.fy;
    F[idx * 3 + 2] = node.loads.moment || 0;
  }

  // Equivalent nodal forces from distributed loads + thermal loads (ΔT)
  for (const beam of mesh.beamElements.values()) {
    const material = mesh.getMaterial(beam.materialId);

    // Thermische equivalente knoopkrachten (lokaal): uniforme ΔT geeft
    // ±E·A·α·ΔT axiaal; gradient-ΔT ook eindmomenten. Zie ThermalLoad.ts.
    const fThermal = material
      ? calculateBeamThermalLocalForces(beam, material)
      : [0, 0, 0, 0, 0, 0];
    const hasThermal = fThermal.some(v => v !== 0);

    const dLoads = getBeamDistributedLoads(beam);
    if (dLoads.length === 0 && !hasThermal) continue;

    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);

    // Equivalente knoopkrachten (lokaal): SOM over alle verdeelde lasten op
    // deze staaf (enkelvoudig veld + deellasten-array). Per last exact
    // dezelfde projectie/dispatch als voorheen inline — zie Beam.ts.
    // (De vroegere inline uniforme tak was formule-identiek aan
    //  calculateDistributedLoadVector.)
    const fLocal: number[] = [0, 0, 0, 0, 0, 0];
    for (const dl of dLoads) {
      const f = calculateDistributedLoadLocalForces(L, angle, dl);
      for (let i = 0; i < 6; i++) fLocal[i] += f[i];
    }

    // Thermiek optellen vóór de scharniercondensatie, zodat beide
    // lastsoorten consistent met de gecondenseerde stijfheid meelopen.
    if (hasThermal) {
      for (let i = 0; i < 6; i++) fLocal[i] += fThermal[i];
    }

    // Krachtcondensatie voor releases (Rz-scharnieren + Tx/Tz-hulzen) —
    // de equivalente knoopkrachten moeten consistent met de gecondenseerde
    // stijfheid meelopen.
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if ((releasedLocalDofs.length > 0 || veren.length > 0) && material) {
      const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
      if (veren.length > 0) applyEndConnections(Kl, releasedLocalDofs, veren, fLocal);
      else applyEndReleases(Kl, releasedLocalDofs, fLocal);
    }

    // Transform to global
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const fGlobal = new Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        fGlobal[i] += TT.get(i, j) * fLocal[j];
      }
    }

    // Add to global force vector
    const idx1 = nodeIdToIndex.get(n1.id)!;
    const idx2 = nodeIdToIndex.get(n2.id)!;

    F[idx1 * 3] += fGlobal[0];
    F[idx1 * 3 + 1] += fGlobal[1];
    F[idx1 * 3 + 2] += fGlobal[2];
    F[idx2 * 3] += fGlobal[3];
    F[idx2 * 3 + 1] += fGlobal[4];
    F[idx2 * 3 + 2] += fGlobal[5];
  }

  return F;
}

/**
 * Apply boundary conditions using penalty method
 */
function applyBoundaryConditions(
  K: Matrix,
  F: number[],
  mesh: Mesh
): { K: Matrix; F: number[]; fixedDofs: number[] } {
  const Kmod = K.clone();
  const Fmod = [...F];
  const fixedDofs: number[] = [];

  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  const penalty = 1e20;

  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id)!;
    const c = node.constraints;

    // Spring DOFs are NOT constrained with penalty — stiffness is added to K diagonal instead
    if (c.x && c.springX == null) {
      const dof = idx * 3;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
    if (c.y && c.springY == null) {
      const dof = idx * 3 + 1;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
    if (c.rotation && c.springRot == null) {
      const dof = idx * 3 + 2;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
  }

  return { K: Kmod, F: Fmod, fixedDofs };
}

/**
 * Calculate internal forces for all beam elements
 */
function calculateAllInternalForces(
  mesh: Mesh,
  displacements: number[]
): { beamForces: Map<number, IBeamForces>; axialForces: Map<number, number> } {
  const beamForces = new Map<number, IBeamForces>();
  const axialForces = new Map<number, number>();

  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }

  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id)!;
    const idx2 = nodeIdToIndex.get(n2.id)!;

    const globalDisp = [
      displacements[idx1 * 3],
      displacements[idx1 * 3 + 1],
      displacements[idx1 * 3 + 2],
      displacements[idx2 * 3],
      displacements[idx2 * 3 + 1],
      displacements[idx2 * 3 + 2]
    ];

    const forces = calculateBeamInternalForces(beam, n1, n2, material, globalDisp);
    beamForces.set(beam.id, forces);

    // Average axial force for geometric stiffness
    axialForces.set(beam.id, (forces.N1 + forces.N2) / 2);
  }

  return { beamForces, axialForces };
}

/**
 * Stabiliteitscheck voor 2e-orde: tel het aantal negatieve (en bijna-nul)
 * pivots van de symmetrische matrix K via eliminatie ZONDER rijwisselingen.
 * Volgens de traagheidswet van Sylvester is dat het aantal negatieve
 * eigenwaarden. Voor K = Ke + Kg(N) betekent ≥ 1 negatieve eigenwaarde dat
 * de belasting de kritieke (knik)waarde van minstens één mode overschrijdt —
 * de geïtereerde P-Δ kan dan wél "convergeren", maar naar een fysisch
 * betekenisloze oplossing voorbij het knikpunt. Vandaar deze aparte check.
 *
 * Bijna-nul-pivots (|piv| < 1e-10 × |oorspronkelijke diagonaal|) tellen ook
 * mee: dan zit de belasting op (of numeriek onhoudbaar dicht bij) de
 * kritieke waarde.
 */
function countNonPositivePivots(K: Matrix): number {
  const n = K.rows;
  // Dense kopie voor in-place eliminatie
  const a: number[][] = [];
  const diag0: number[] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(K.get(i, j));
    a.push(row);
    diag0.push(Math.abs(K.get(i, i)) || 1);
  }

  let nonPositive = 0;
  for (let col = 0; col < n; col++) {
    const piv = a[col][col];
    if (!Number.isFinite(piv) || Math.abs(piv) < 1e-10 * diag0[col]) {
      // (bijna) singulier — conservatief als instabiel tellen en stoppen
      return nonPositive + 1;
    }
    if (piv < 0) nonPositive++;
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / piv;
      if (factor === 0) continue;
      for (let j = col; j < n; j++) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }
  return nonPositive;
}

/**
 * Main nonlinear solver using Newton-Raphson iteration
 */
export function solveNonlinear(
  mesh: Mesh,
  options: Partial<NonlinearSolverOptions> = {}
): ISolverResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Mixed beam+plate analysis: beams AND plates together
  if (opts.analysisType === 'mixed_beam_plate') {
    return solveMixed(mesh, opts);
  }

  // For plate-related analyses, delegate to the Assembler-based path
  // But if there are no plate/triangle elements, fall back to frame analysis for beams
  if (opts.analysisType === 'plate_bending' || opts.analysisType === 'plane_stress' || opts.analysisType === 'plane_strain') {
    if (mesh.elements.size > 0) {
      return solvePlateOrPlane(mesh, opts);
    }
    // No plate elements — fall back to frame if there are beams
    if (mesh.getBeamCount() > 0) {
      opts.analysisType = 'frame';
    } else {
      throw new Error('Model must have plate elements for this analysis type, or beams for frame analysis');
    }
  }

  // Validate frame analysis
  if (mesh.getNodeCount() < 2) {
    throw new Error('Model must have at least 2 nodes');
  }
  if (mesh.getBeamCount() < 1) {
    throw new Error('Model must have at least 1 beam element');
  }

  // Check for constraints
  let hasConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasConstraints = true;
      break;
    }
  }
  if (!hasConstraints) {
    throw new Error('Model has no constraints - add boundary conditions');
  }

  // Check for loads
  const F = assembleForceVector(mesh);
  const hasLoads = F.some(f => f !== 0);
  if (!hasLoads) {
    throw new Error('No loads applied - add forces to nodes');
  }

  const numDofs = mesh.getNodeCount() * 3;
  let displacements = new Array(numDofs).fill(0);
  let axialForces = new Map<number, number>();

  /**
   * Meld een regel, als er iemand luistert. De tekst wordt binnen deze functie
   * opgebouwd, dus zonder luisteraar kost het log niets.
   */
  const log = (regel: SolverLogRegel): void => {
    opts.onLog?.(regel);
  };

  const soortAnalyse = opts.materialNonlinear
    ? (opts.geometricNonlinear ? 'fysisch én geometrisch niet-lineair' : 'fysisch niet-lineair')
    : (opts.geometricNonlinear ? 'geometrisch niet-lineair (P-Δ)' : 'lineair');
  log({
    soort: 'info',
    tekst:
      `Model: ${mesh.getNodeCount()} knopen, ${mesh.beamElements.size} staven, ` +
      `${numDofs} vrijheidsgraden — ${soortAnalyse}`,
  });

  // Check if any beam has tension/pressure-only connections
  let hasAxialConstraints = false;
  for (const beam of mesh.beamElements.values()) {
    const { start, end } = getConnectionTypes(beam);
    if (start === 'tension_only' || start === 'pressure_only' ||
        end === 'tension_only' || end === 'pressure_only') {
      hasAxialConstraints = true;
      break;
    }
  }

  // Initialize section states for material nonlinearity
  let sectionStates = new Map<number, ISectionState>();

  if (opts.materialNonlinear) {
    // Beton kent hier geen materiaalmodel meer. Er stond er wel een — met een
    // geschatte wapening (0,5 % van het betonoppervlak) en b en h
    // teruggerekend uit A en I — maar dat was een tweede antwoord op een vraag
    // die de rekenkern al beantwoordt, mét de werkelijke wapeningskorf. Een
    // stille terugval op de ongescheurde EI zou hier het ergste van twee
    // werelden zijn: fysisch niet-lineair heten en het niet zijn.
    if (opts.materialType === 'concrete') {
      throw new Error(
        'Fysisch niet-lineair beton loopt niet via deze solver. De gescheurde ' +
        'buigstijfheid komt per segment uit de rekenkern (NEN-EN 1992-1-1, ' +
        'M-N-κ met de wapeningskorf) en wordt als section.I van de ' +
        'deelelementen aangeleverd — zie lib/betonStijfheid.ts.'
      );
    }
    const steel = createSteelMaterial(opts.steelFy);

    for (const beam of mesh.beamElements.values()) {
      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;

      // Steel: use M-κ section state
      const state = initSectionState(beam.section, opts.materialType, steel, undefined);
      sectionStates.set(beam.id, state);
    }
  }

  // For linear analysis, just solve once (or iteratively for axial constraints)
  if (!opts.geometricNonlinear && !opts.materialNonlinear) {
    if (hasAxialConstraints) {
      return solveWithAxialConstraints(mesh, F, opts);
    }

    const K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, false);
    log({ soort: 'info', tekst: `Stijfheidsmatrix geassembleerd (${K.rows}×${K.cols})` });
    const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, F, mesh);
    log({ soort: 'info', tekst: 'Randvoorwaarden toegepast' });
    displacements = solveLinearSystem(Kbc, Fbc);
    log({ soort: 'info', tekst: 'Stelsel opgelost — één keer, want lineair' });

    const { beamForces, axialForces: newAxial } = calculateAllInternalForces(mesh, displacements);
    axialForces = newAxial;

    // Calculate reactions
    const reactions = K.multiplyVector(displacements);
    for (let i = 0; i < reactions.length; i++) {
      reactions[i] = reactions[i] - F[i];
    }

    // Find max values for scaling
    let maxVonMises = 0;
    for (const forces of beamForces.values()) {
      maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
    }

    return {
      displacements,
      reactions,
      elementStresses: new Map(),
      beamForces,
      maxVonMises,
      minVonMises: 0
    };
  }

  // Nonlinear iteration (P-Delta and/or FNL analysis)
  //
  // Iteratieschema (geometrisch): geïtereerde P-Δ. Iteratie 0 lost 1e-orde op
  // (axialForces leeg → Kg = 0); elke volgende iteratie herassembleert
  // K = Ke + Kg(N_vorige) en lost het residu F − K·u op. Voor het (in u)
  // lineaire P-Δ-probleem is dit de klassieke vaste-punt-iteratie met
  // convergentieratio ≈ P/P_kritiek per iteratie.
  //
  // CONVERGENTIECRITERIUM: relatieve verplaatsingsincrement-norm
  //     ‖Δu‖ ≤ tolerance · ‖u‖
  // Het oude criterium (residunorm/krachtnorm) was kapot: het residu bevatte
  // op vaste DOF's de reactiekrachten (F_bc = 0 daar, K·u = reactie), die
  // per definitie niet naar nul gaan — de toets sloeg dus nooit aan.
  //
  // DIVERGENTIEDETECTIE (alleen geometrisch pad): als de increment-norm 3
  // iteraties op rij groeit, of niet-eindig wordt, of K (bijna) singulier
  // raakt, of maxIterations wordt bereikt zonder convergentie, dan is de
  // belasting op of boven de kritieke (knik)waarde → duidelijke Error
  // (stroomt via engine.ts als nette NL-melding naar de UI).
  let beamForces = new Map<number, IBeamForces>();

  const DIVERGENCE_MSG =
    'Second-order (P-Delta) analysis did not converge — the applied load is at or above the critical (buckling) load';

  for (let step = 1; step <= opts.loadSteps; step++) {
    const loadFactor = step / opts.loadSteps;
    const scaledF = F.map(f => f * loadFactor);

    let converged = false;
    let prevIncrNorm = Infinity;
    let growthCount = 0;

    for (let iter = 0; iter < opts.maxIterations; iter++) {
      // Assemble stiffness with current state
      let K: Matrix;
      if (opts.materialNonlinear) {
        // Use effective stiffness from material state (M-κ for steel, cracked I for concrete)
        K = assembleGlobalStiffnessFNL(
          mesh, sectionStates, axialForces, opts.geometricNonlinear
        );
      } else {
        // Geometric nonlinearity only
        K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, true);
      }

      const { K: Kbc, F: Fbc, fixedDofs } = applyBoundaryConditions(K, scaledF, mesh);

      // Residual t.o.v. de huidige stand; op vaste DOF's is het residu per
      // definitie 0 (K·u geeft daar de reactie, geen onbalans).
      const internalForces = K.multiplyVector(displacements);
      const residual = Fbc.map((f, i) => f - internalForces[i]);
      for (const dof of fixedDofs) residual[dof] = 0;

      // Solve for displacement increment
      let deltaU: number[];
      try {
        deltaU = solveLinearSystem(Kbc, residual);
      } catch (e) {
        if (opts.geometricNonlinear) throw new Error(DIVERGENCE_MSG);
        throw e;
      }

      // Update displacements
      for (let i = 0; i < numDofs; i++) {
        displacements[i] += deltaU[i];
      }

      // Update internal forces
      const forcesResult = calculateAllInternalForces(mesh, displacements);
      axialForces = forcesResult.axialForces;
      beamForces = forcesResult.beamForces;

      // Update section states for material nonlinearity
      if (opts.materialNonlinear) {
        sectionStates = updateAllSectionStates(mesh, displacements, sectionStates, opts);
      }

      const incrNorm = Math.sqrt(deltaU.reduce((s, d) => s + d * d, 0));
      const dispNorm = Math.sqrt(displacements.reduce((s, d) => s + d * d, 0));

      log({
        soort: 'iteratie',
        laststap: step,
        iteratie: iter + 1,
        incrementNorm: incrNorm,
        verplaatsingsNorm: dispNorm,
        tekst: `‖Δu‖ = ${incrNorm.toExponential(3)}, ‖u‖ = ${dispNorm.toExponential(3)}`,
      });

      if (!Number.isFinite(incrNorm) || !Number.isFinite(dispNorm)) {
        log({ soort: 'fout', tekst: 'De normen zijn niet-eindig — het stelsel loopt weg' });
        if (opts.geometricNonlinear) throw new Error(DIVERGENCE_MSG);
        break;
      }

      // Convergentie: relatieve increment-norm
      if (incrNorm <= opts.tolerance * Math.max(dispNorm, 1e-30)) {
        converged = true;
        log({
          soort: 'info',
          tekst:
            `Laststap ${step} geconvergeerd in ${iter + 1} iteratie(s) ` +
            `(tolerantie ${opts.tolerance.toExponential(0)})`,
        });
        break;
      }

      // Divergentie: increment-norm groeit structureel (ratio P/P_kr > 1)
      if (iter >= 1 && incrNorm > prevIncrNorm) {
        growthCount++;
      } else {
        growthCount = 0;
      }
      if (growthCount >= 3 && opts.geometricNonlinear) {
        log({
          soort: 'fout',
          tekst: 'De increment-norm groeit drie iteraties op rij — de last ligt op of boven de kniklast',
        });
        throw new Error(DIVERGENCE_MSG);
      }
      prevIncrNorm = incrNorm;
    }

    if (!converged && !opts.geometricNonlinear) {
      log({
        soort: 'waarschuwing',
        tekst:
          `Laststap ${step} bereikte ${opts.maxIterations} iteraties zonder te convergeren; ` +
          `de laatste stand wordt aangehouden`,
      });
    }

    if (!converged && opts.geometricNonlinear) {
      throw new Error(
        `Second-order (P-Delta) analysis did not converge within ${opts.maxIterations} iterations — the load is at, above, or very close to the critical (buckling) load`
      );
    }
  }

  // Final internal forces calculation (if not already calculated)
  if (beamForces.size === 0) {
    const forcesResult = calculateAllInternalForces(mesh, displacements);
    beamForces = forcesResult.beamForces;
    axialForces = forcesResult.axialForces;
  }

  // Calculate reactions using the final stiffness matrix
  let K: Matrix;
  if (opts.materialNonlinear) {
    K = assembleGlobalStiffnessFNL(
      mesh, sectionStates, axialForces, opts.geometricNonlinear
    );
  } else {
    K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, opts.geometricNonlinear);
  }

  // Stabiliteitscheck: boven de kniklast "convergeert" de geïtereerde P-Δ
  // vaak alsnog (N hangt nauwelijks van u af, dus Kg ligt na iteratie 1 vast
  // en het indefiniete stelsel heeft gewoon een vast punt) — maar dan is
  // K = Ke + Kg indefiniet en de oplossing fysisch betekenisloos. Detecteer
  // dat via negatieve pivots (Sylvester) op de finale K mét randvoorwaarden.
  if (opts.geometricNonlinear) {
    const { K: Kstab } = applyBoundaryConditions(K, F, mesh);
    const nietPositief = countNonPositivePivots(Kstab);
    if (nietPositief > 0) {
      log({
        soort: 'fout',
        tekst:
          `Stabiliteitscontrole: ${nietPositief} niet-positieve pivot(s) in K = Ke + Kg — ` +
          `de matrix is indefiniet en de oplossing fysisch betekenisloos`,
      });
      throw new Error(
        'Second-order (P-Delta) analysis is unstable — the applied load is at or above the critical (buckling) load'
      );
    }
    log({ soort: 'info', tekst: 'Stabiliteitscontrole: K = Ke + Kg is positief definiet' });
  }

  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }

  // Find max values
  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }

  return {
    displacements,
    reactions,
    elementStresses: new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0,
  };
}

/**
 * Solve plane stress/strain or plate bending using the Assembler module.
 */
function solvePlateOrPlane(
  mesh: Mesh,
  opts: NonlinearSolverOptions
): ISolverResult {
  const analysisType = opts.analysisType;
  const dofsPerNode = getDofsPerNode(analysisType);

  // Validate
  if (mesh.elements.size < 1) {
    throw new Error('Model must have at least 1 plate element');
  }

  // Get active nodes (nodes connected to elements) - IMPORTANT: only these are used by the solver
  const activeNodeIds = buildNodeIdToIndex(mesh, analysisType);

  // Collect all node IDs that are connected to elements
  const elementNodeIds = new Set<number>();
  for (const element of mesh.elements.values()) {
    for (const nid of element.nodeIds) {
      elementNodeIds.add(nid);
    }
  }

  // === CONSTRAINT TRANSLATION ===
  // If constraints are on nodes NOT connected to elements, transfer them to the nearest active node
  // This handles the case where the UI places constraints on polygon vertices that don't match mesh nodes
  const constraintTransfers: Array<{ fromId: number; toId: number; dist: number }> = [];

  for (const node of mesh.nodes.values()) {
    const hasConstraint = node.constraints.x || node.constraints.y || node.constraints.rotation;
    const hasLoad = node.loads.fx !== 0 || node.loads.fy !== 0 || (node.loads.moment && node.loads.moment !== 0);

    if ((hasConstraint || hasLoad) && !activeNodeIds.has(node.id)) {
      // This node has constraints/loads but is not connected to any element
      // Find the nearest active node and transfer the constraint/load
      let nearestActiveId: number | null = null;
      let nearestDist = Infinity;

      for (const activeId of activeNodeIds.keys()) {
        const activeNode = mesh.getNode(activeId);
        if (!activeNode) continue;
        const dist = Math.sqrt((node.x - activeNode.x) ** 2 + (node.y - activeNode.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestActiveId = activeId;
        }
      }

      if (nearestActiveId !== null && nearestDist < 0.5) { // 0.5m tolerance
        const targetNode = mesh.getNode(nearestActiveId);
        if (targetNode) {
          // Transfer constraints
          if (hasConstraint) {
            targetNode.constraints = {
              x: targetNode.constraints.x || node.constraints.x,
              y: targetNode.constraints.y || node.constraints.y,
              rotation: targetNode.constraints.rotation || node.constraints.rotation,
              springX: node.constraints.springX ?? targetNode.constraints.springX,
              springY: node.constraints.springY ?? targetNode.constraints.springY,
              springRot: node.constraints.springRot ?? targetNode.constraints.springRot,
            };
          }
          // Transfer loads
          if (hasLoad) {
            targetNode.loads = {
              fx: targetNode.loads.fx + node.loads.fx,
              fy: targetNode.loads.fy + node.loads.fy,
              moment: (targetNode.loads.moment || 0) + (node.loads.moment || 0),
            };
          }
          constraintTransfers.push({ fromId: node.id, toId: nearestActiveId, dist: nearestDist });
        }
      }
    }
  }

  if (constraintTransfers.length > 0) {
    console.log(`[Plate Solver] Transferred ${constraintTransfers.length} constraint(s) to mesh nodes`);
  }

  // Re-check constraints after transfer
  let hasActiveConstraints = false;
  let hasAnyConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasAnyConstraints = true;
      if (activeNodeIds.has(node.id)) {
        hasActiveConstraints = true;
      }
    }
  }

  if (!hasAnyConstraints) {
    throw new Error('Model has no constraints - add boundary conditions');
  }

  if (!hasActiveConstraints) {
    // List nodes with constraints that couldn't be transferred
    const problemNodes: string[] = [];
    for (const node of mesh.nodes.values()) {
      if ((node.constraints.x || node.constraints.y || node.constraints.rotation) && !activeNodeIds.has(node.id)) {
        problemNodes.push(`Node ${node.id} at (${node.x.toFixed(3)}, ${node.y.toFixed(3)})`);
      }
    }
    throw new Error(`Constraints are not on mesh nodes and couldn't be transferred. Problem nodes: ${problemNodes.join('; ')}`);
  }

  // Assemble
  const K = assembleGlobalStiffnessMatrix(mesh, analysisType);
  const F = assembleForceVectorNew(mesh, analysisType);
  const { dofs: constrainedDofs, nodeIdToIndex } = getConstrainedDofs(mesh, analysisType);

  // Check for sufficient constraints to prevent rigid body motion (need at least 3 DOFs constrained for 2D)
  if (constrainedDofs.length < 3) {
    throw new Error(`Insufficient constraints: ${constrainedDofs.length} DOFs constrained, need at least 3 to prevent rigid body motion`);
  }

  const hasLoads = F.some(f => f !== 0);
  if (!hasLoads) {
    // Debug: check if loads exist but on inactive nodes
    const inactiveLoads: string[] = [];
    const activeLoads: string[] = [];
    for (const node of mesh.nodes.values()) {
      const hasLoad = node.loads.fx !== 0 || node.loads.fy !== 0 || (node.loads.moment && node.loads.moment !== 0);
      if (hasLoad) {
        const isActive = activeNodeIds.has(node.id);
        const info = `Node ${node.id} at (${node.x.toFixed(3)}, ${node.y.toFixed(3)}): fx=${node.loads.fx}, fy=${node.loads.fy}`;
        if (isActive) activeLoads.push(info); else inactiveLoads.push(info);
      }
    }
    if (inactiveLoads.length > 0) {
      throw new Error(`Loads on ${inactiveLoads.length} node(s) not connected to elements (inactive). Loads: ${inactiveLoads.join('; ')}. Total elements: ${mesh.elements.size}`);
    }
    throw new Error('No loads applied - add forces to nodes or elements');
  }

  // Diagnostic & auto-fix: check for zero-stiffness DOFs and auto-constrain them
  const numDofs = K.rows;
  const indexToNodeId = new Map<number, number>();
  for (const [nodeId, idx] of nodeIdToIndex.entries()) indexToNodeId.set(idx, nodeId);
  const constrainedSet = new Set(constrainedDofs);
  for (let d = 0; d < numDofs; d++) {
    if (Math.abs(K.get(d, d)) < 1e-20 && !constrainedSet.has(d)) {
      const nodeIdx = Math.floor(d / dofsPerNode);
      const localDof = d % dofsPerNode;
      const nodeId = indexToNodeId.get(nodeIdx);
      const node = nodeId !== undefined ? mesh.getNode(nodeId) : null;
      const dofLabel = dofsPerNode === 2 ? ['u', 'v'][localDof] : ['u/w', 'v/θx', 'θ/θy'][localDof];
      console.warn(`[Plate Solver] Zero stiffness at DOF ${d} (node ${nodeId} at (${node?.x.toFixed(3)}, ${node?.y.toFixed(3)}), dof=${dofLabel}) — auto-constraining`);
      // Auto-constrain this DOF to prevent singularity
      constrainedDofs.push(d);
      constrainedSet.add(d);
    }
  }

  // Apply boundary conditions (penalty method)
  // Note: getConstrainedDofs already excludes spring DOFs — springs have their stiffness
  // added to K diagonal in assembleGlobalStiffnessMatrix instead
  const Kmod = K.clone();
  const Fmod = [...F];
  const penalty = 1e20;
  for (const dof of constrainedDofs) {
    Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
    Fmod[dof] = 0;
  }

  // Solve
  let displacements: number[];
  try {
    displacements = solveLinearSystem(Kmod, Fmod);
  } catch (e) {
    // Enhanced error message with DOF diagnosis
    const msg = (e as Error).message;
    const colMatch = msg.match(/column (\d+)/);
    if (colMatch) {
      const col = parseInt(colMatch[1]);
      const nodeIdx = Math.floor(col / dofsPerNode);
      const localDof = col % dofsPerNode;
      const nodeId = indexToNodeId.get(nodeIdx);
      const node = nodeId !== undefined ? mesh.getNode(nodeId) : null;
      const dofLabel = dofsPerNode === 2 ? ['u', 'v'][localDof] : ['u/w', 'v/θx', 'θ/θy'][localDof];
      throw new Error(`Singular matrix at DOF ${col}: node ${nodeId} at (${node?.x.toFixed(3)}, ${node?.y.toFixed(3)}), direction=${dofLabel}. Check boundary conditions and element connectivity.`);
    }
    throw e;
  }

  // Solve succeeded

  // Reactions: R = K·u - F
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }

  // Post-processing: element stresses / moments
  const elementStresses = new Map<number, IElementStress>();
  let maxVonMises = 0;
  let minVonMises = Infinity;
  let maxMoment = -Infinity;
  let minMoment = Infinity;

  // Per-component range tracking
  const ranges = {
    sigmaX: { min: Infinity, max: -Infinity },
    sigmaY: { min: Infinity, max: -Infinity },
    tauXY: { min: Infinity, max: -Infinity },
    mx: { min: Infinity, max: -Infinity },
    my: { min: Infinity, max: -Infinity },
    mxy: { min: Infinity, max: -Infinity },
    vx: { min: Infinity, max: -Infinity },
    vy: { min: Infinity, max: -Infinity },
    nx: { min: Infinity, max: -Infinity },
    ny: { min: Infinity, max: -Infinity },
    nxy: { min: Infinity, max: -Infinity },
  };

  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;

    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;

    // Extract element displacements
    const elemDisp: number[] = [];
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === undefined) continue;
      for (let d = 0; d < dofsPerNode; d++) {
        elemDisp.push(displacements[idx * dofsPerNode + d]);
      }
    }

    if (analysisType === 'plate_bending') {
      // DKT plate bending only supports triangles (backward compat)
      if (nodes.length !== 3) continue;
      const [n1, n2, n3] = nodes;
      // Calculate moments
      const moments = calculateElementMoments(n1, n2, n3, material, element.thickness, elemDisp);
      // Calculate transverse shear forces
      const shear = calculateElementShearForces(n1, n2, n3, material, element.thickness, elemDisp);
      const stress: IElementStress = {
        elementId: element.id,
        sigmaX: 0,
        sigmaY: 0,
        tauXY: 0,
        vonMises: 0,
        principalStresses: { sigma1: 0, sigma2: 0, angle: 0 },
        mx: moments.mx,
        my: moments.my,
        mxy: moments.mxy,
        vx: shear.vx,
        vy: shear.vy,
      };
      elementStresses.set(element.id, stress);

      maxMoment = Math.max(maxMoment, moments.mx, moments.my, moments.mxy);
      minMoment = Math.min(minMoment, moments.mx, moments.my, moments.mxy);

      // Track per-component ranges
      ranges.mx.min = Math.min(ranges.mx.min, moments.mx);
      ranges.mx.max = Math.max(ranges.mx.max, moments.mx);
      ranges.my.min = Math.min(ranges.my.min, moments.my);
      ranges.my.max = Math.max(ranges.my.max, moments.my);
      ranges.mxy.min = Math.min(ranges.mxy.min, moments.mxy);
      ranges.mxy.max = Math.max(ranges.mxy.max, moments.mxy);
      ranges.vx.min = Math.min(ranges.vx.min, shear.vx);
      ranges.vx.max = Math.max(ranges.vx.max, shear.vx);
      ranges.vy.min = Math.min(ranges.vy.min, shear.vy);
      ranges.vy.max = Math.max(ranges.vy.max, shear.vy);
    } else {
      // Plane stress/strain — handle both quad and triangle elements
      let stress: { sigmaX: number; sigmaY: number; tauXY: number; vonMises: number };

      if (nodes.length === 4) {
        const [n1, n2, n3, n4] = nodes;
        stress = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, analysisType);
      } else {
        const [n1, n2, n3] = nodes;
        stress = calculateElementStress(n1, n2, n3, material, elemDisp, analysisType);
      }

      const principal = calculatePrincipalStresses(stress.sigmaX, stress.sigmaY, stress.tauXY);

      // Membrane forces: N = stress x thickness (N/m)
      const thickness = element.thickness || 1;
      const nx = stress.sigmaX * thickness;
      const ny = stress.sigmaY * thickness;
      const nxy = stress.tauXY * thickness;

      elementStresses.set(element.id, {
        elementId: element.id,
        ...stress,
        principalStresses: principal,
        nx,
        ny,
        nxy,
      });
      maxVonMises = Math.max(maxVonMises, stress.vonMises);
      minVonMises = Math.min(minVonMises, stress.vonMises);

      // Track per-component ranges
      ranges.sigmaX.min = Math.min(ranges.sigmaX.min, stress.sigmaX);
      ranges.sigmaX.max = Math.max(ranges.sigmaX.max, stress.sigmaX);
      ranges.sigmaY.min = Math.min(ranges.sigmaY.min, stress.sigmaY);
      ranges.sigmaY.max = Math.max(ranges.sigmaY.max, stress.sigmaY);
      ranges.tauXY.min = Math.min(ranges.tauXY.min, stress.tauXY);
      ranges.tauXY.max = Math.max(ranges.tauXY.max, stress.tauXY);
      ranges.nx.min = Math.min(ranges.nx.min, nx);
      ranges.nx.max = Math.max(ranges.nx.max, nx);
      ranges.ny.min = Math.min(ranges.ny.min, ny);
      ranges.ny.max = Math.max(ranges.ny.max, ny);
      ranges.nxy.min = Math.min(ranges.nxy.min, nxy);
      ranges.nxy.max = Math.max(ranges.nxy.max, nxy);
    }
  }

  if (minVonMises === Infinity) minVonMises = 0;
  if (maxMoment === -Infinity) maxMoment = 0;
  if (minMoment === Infinity) minMoment = 0;

  // Finalize ranges (replace Infinity with 0 for unused components)
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    if (ranges[key].min === Infinity) ranges[key].min = 0;
    if (ranges[key].max === -Infinity) ranges[key].max = 0;
  }

  // Result ready

  return {
    displacements,
    reactions,
    elementStresses,
    beamForces: new Map(),
    maxVonMises,
    minVonMises,
    maxMoment: analysisType === 'plate_bending' ? maxMoment : undefined,
    minMoment: analysisType === 'plate_bending' ? minMoment : undefined,
    stressRanges: ranges,
  };
}

/**
 * De geometrische stijfheid van het GEMENGDE stelsel: staven én wandschijven,
 * beide in het 3-DOF-schema (u, v, θ) dat `mixed_beam_plate` gebruikt.
 *
 * Twee bronnen, één matrix:
 *
 * * **Staven** — dezelfde `calculateGeometricStiffness(L, N)` als het
 *   frame-pad, met N uit de huidige verplaatsingen. De tekenafspraak is hier
 *   eenvoudiger dan in het frame-pad: N wordt hieronder rechtstreeks uit de
 *   lokale rekking bepaald en is dus TREK-positief, precies zoals
 *   `calculateGeometricStiffness` hem wil. Er wordt niets omgeklapt.
 * * **Wandschijven** — de initiële-spanningsstijfheid van het membraan, uit
 *   de heersende σx, σy en τxy (zie `calculateTriangleGeometricStiffness`).
 *
 * De θ-vrijheidsgraden van de schijven blijven leeg, net als bij de elastische
 * matrix: een membraan draagt geen moment in zijn knopen.
 *
 * Waarom de index hier opnieuw wordt opgebouwd en niet die van het frame-pad
 * hergebruikt: `mixed_beam_plate` nummert alleen de ACTIEVE knopen (via
 * `buildNodeIdToIndex`), terwijl het frame-pad alle knopen op volgorde neemt.
 * Dezelfde staaf krijgt in de twee schema's dus andere DOF-nummers, en de
 * meegegeven `nodeIdToIndex` is de enige die bij dit stelsel hoort.
 */
function assembleGeometricStiffnessMixed(
  mesh: Mesh,
  displacements: number[],
  nodeIdToIndex: Map<number, number>,
  numDofs: number
): Matrix {
  const Kg = new Matrix(numDofs, numDofs);

  // ── Staven ────────────────────────────────────────────────────────────────
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    if (idx1 === undefined || idx2 === undefined) continue;

    const L = calculateBeamLength(n1, n2);
    if (L < 1e-10) continue;
    const angle = calculateBeamAngle(n1, n2);

    const dofIndices = [
      idx1 * 3, idx1 * 3 + 1, idx1 * 3 + 2,
      idx2 * 3, idx2 * 3 + 1, idx2 * 3 + 2,
    ];

    // Lokale verplaatsingen u_l = T·u_g, en daaruit de rekking. N = EA/L·Δu
    // is trek-positief.
    const T = createTransformationMatrix(angle);
    const ug = dofIndices.map(d => displacements[d]);
    const ul = T.multiplyVector(ug);
    const N = (material.E * beam.section.A / L) * (ul[3] - ul[0]);

    const KgLokaal = calculateGeometricStiffness(L, N);
    const KgGlobaal = T.transpose().multiply(KgLokaal.multiply(T));

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        Kg.addAt(dofIndices[i], dofIndices[j], KgGlobaal.get(i, j));
      }
    }
  }

  // ── Wandschijven ──────────────────────────────────────────────────────────
  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;

    const dofIndices: number[] = [];
    const elemDisp: number[] = [];
    let compleet = true;
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === undefined) { compleet = false; break; }
      dofIndices.push(idx * 3, idx * 3 + 1, idx * 3 + 2);
      elemDisp.push(displacements[idx * 3], displacements[idx * 3 + 1]);
    }
    if (!compleet) continue;

    try {
      if (nodes.length === 4) {
        const [n1, n2, n3, n4] = nodes;
        const s = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, 'plane_stress');
        const Kg12 = expandQuadGeometricStiffness(
          calculateQuadGeometricStiffness(n1, n2, n3, n4, s, element.thickness)
        );
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 12; j++) Kg.addAt(dofIndices[i], dofIndices[j], Kg12.get(i, j));
        }
      } else {
        const [n1, n2, n3] = nodes;
        const s = calculateElementStress(n1, n2, n3, material, elemDisp, 'plane_stress');
        const Kg9 = expandTriangleGeometricStiffness(
          calculateTriangleGeometricStiffness(n1, n2, n3, s, element.thickness)
        );
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < 9; j++) Kg.addAt(dofIndices[i], dofIndices[j], Kg9.get(i, j));
        }
      }
    } catch {
      // Een ontaard element levert geen geometrische bijdrage. De elastische
      // assemblage slaat hem op dezelfde grond over (met een console.warn);
      // hier stil, anders staat dezelfde melding tweemaal per iteratie.
    }
  }

  return Kg;
}

/**
 * Solve mixed beam+plate analysis.
 * Uses unified 3 DOFs per node (u, v, θ) with expanded plate stiffness matrices.
 * Beam elements use their native 6×6 (3 DOF/node) stiffness.
 * Plate elements are expanded from 6×6 or 8×8 to 9×9 or 12×12 (3 DOF/node).
 *
 * Met `geometricNonlinear` wordt er geïtereerd: elke ronde bouwt K = Ke + Kg
 * met de spanningen en normaalkrachten van de vorige stand, tot de
 * verplaatsingen niet meer veranderen. Zie `assembleGeometricStiffnessMixed`.
 *
 * WAT DIT PAD NIET DOET, en het raamwerkpad wél:
 * `opts.loadSteps` wordt hier genegeerd — de last gaat er in één keer op. Het
 * raamwerkpad kent een laststappenlus die de belasting in stappen opbouwt.
 * Voor geometrische niet-lineariteit maakt dat geen verschil: het eindpunt
 * hangt niet van de weg erheen af, en de directe iteratie vindt hetzelfde vaste
 * punt. Het zou pas gaan tellen bij fysische niet-lineariteit, en die loopt
 * voor schijven niet via deze weg. Niemand zet `loadSteps` vandaag: de
 * standaard is 1 en geen enkele aanroeper in de app of de sidecar wijkt daarvan
 * af. Wordt dat ooit anders, dan hoort hier eerst een laststappenlus omheen.
 */
function solveMixed(
  mesh: Mesh,
  opts: NonlinearSolverOptions
): ISolverResult {
  const analysisType = 'mixed_beam_plate';
  const dofsPerNode = 3; // u, v, θ for all nodes

  const log = (regel: SolverLogRegel): void => { opts.onLog?.(regel); };

  // Validate model
  if (mesh.elements.size < 1 && mesh.getBeamCount() < 1) {
    throw new Error('Mixed analysis requires at least one plate or beam element');
  }

  // Get active nodes (nodes connected to elements/beams) - IMPORTANT: only these are used by the solver
  const activeNodeIds = buildNodeIdToIndex(mesh, analysisType);

  // Check that constraints are on ACTIVE nodes
  let hasActiveConstraints = false;
  let hasAnyConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasAnyConstraints = true;
      if (activeNodeIds.has(node.id)) {
        hasActiveConstraints = true;
      }
    }
  }

  if (!hasAnyConstraints) {
    throw new Error('Model has no constraints - add boundary conditions');
  }

  if (!hasActiveConstraints) {
    throw new Error('Constraints are not on mesh nodes - place supports on plate corner/edge nodes or beam nodes');
  }

  // Assemble global matrices using the mixed_beam_plate mode
  const K = assembleGlobalStiffnessMatrix(mesh, analysisType);
  const F = assembleForceVectorNew(mesh, analysisType);
  const { dofs: constrainedDofs, nodeIdToIndex } = getConstrainedDofs(mesh, analysisType);

  // Check for sufficient constraints to prevent rigid body motion
  if (constrainedDofs.length < 3) {
    throw new Error(`Insufficient constraints: ${constrainedDofs.length} DOFs constrained, need at least 3 to prevent rigid body motion`);
  }

  const hasLoads = F.some(f => f !== 0);
  if (!hasLoads) {
    throw new Error('No loads applied - add forces to nodes or elements');
  }

  /**
   * Los K·u = F op met de opgelegde vrijheidsgraden erin. Penaltymethode,
   * net als voorheen — apart gezet omdat de niet-lineaire lus hem per
   * iteratie opnieuw nodig heeft, met een andere K.
   */
  const losOp = (Kt: Matrix): number[] => {
    const Kmod = Kt.clone();
    const Fmod = [...F];
    const penalty = 1e20;
    for (const dof of constrainedDofs) {
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
    }
    return solveLinearSystem(Kmod, Fmod);
  };

  const numDofsMixed = K.rows;
  log({
    soort: 'info',
    tekst:
      `Gemengd model: ${mesh.beamElements.size} staven en ${mesh.elements.size} ` +
      `schijfelementen, ${numDofsMixed} vrijheidsgraden` +
      (opts.geometricNonlinear ? ' — geometrisch niet-lineair (P-Δ)' : ' — lineair'),
  });

  let displacements = losOp(K);

  /**
   * De matrix waaruit de oplegreacties volgen. Lineair is dat de elastische K;
   * bij tweede orde de raakstijfheid Ke + Kg van de eindstand, want dát is de
   * matrix waarmee het evenwicht is gevonden. Het frame-pad doet hetzelfde.
   */
  let Kreactie: Matrix = K;

  // ── Geometrisch niet-lineair: itereren op K = Ke + Kg ─────────────────────
  //
  // Directe iteratie op de secansstijfheid, niet Newton-Raphson: Kg volgt uit
  // de spanningstoestand, en die volgt weer uit u. Elke ronde bouwt Kg met de
  // stand van de vorige en lost opnieuw op. Voor P-Δ convergeert dat met
  // ratio ≈ P/P_kr per ronde — hetzelfde gedrag als het frame-pad, dat langs
  // dezelfde weg tot P ≈ 0,87·P_kr komt.
  //
  // De elastische K blijft staan en wordt per ronde opgeteld bij een VERSE Kg;
  // Kg accumuleren zou de tweede orde tweemaal tellen.
  if (opts.geometricNonlinear) {
    let vorigeNorm = Infinity;
    let groei = 0;
    let geconvergeerd = false;

    for (let iter = 0; iter < opts.maxIterations; iter++) {
      const Kg = assembleGeometricStiffnessMixed(
        mesh, displacements, nodeIdToIndex, numDofsMixed
      );
      const Kt = K.clone();
      for (let i = 0; i < numDofsMixed; i++) {
        for (let j = 0; j < numDofsMixed; j++) Kt.addAt(i, j, Kg.get(i, j));
      }

      let nieuw: number[];
      try {
        nieuw = losOp(Kt);
      } catch {
        log({ soort: 'fout', tekst: 'Het stelsel K = Ke + Kg is niet oplosbaar' });
        throw new Error(
          'Second-order (P-Delta) analysis is unstable — the applied load is at or above the critical (buckling) load'
        );
      }

      let som = 0, somU = 0;
      for (let i = 0; i < numDofsMixed; i++) {
        const d = nieuw[i] - displacements[i];
        som += d * d;
        somU += nieuw[i] * nieuw[i];
      }
      const incrNorm = Math.sqrt(som);
      const dispNorm = Math.sqrt(somU);
      displacements = nieuw;

      log({
        soort: 'iteratie',
        laststap: 1,
        iteratie: iter + 1,
        incrementNorm: incrNorm,
        verplaatsingsNorm: dispNorm,
        tekst: `‖Δu‖ = ${incrNorm.toExponential(3)}, ‖u‖ = ${dispNorm.toExponential(3)}`,
      });

      if (!Number.isFinite(incrNorm) || !Number.isFinite(dispNorm)) {
        log({ soort: 'fout', tekst: 'De normen zijn niet-eindig — het stelsel loopt weg' });
        throw new Error(
          'Second-order (P-Delta) analysis did not converge — the applied load is at or above the critical (buckling) load'
        );
      }

      if (incrNorm <= opts.tolerance * Math.max(dispNorm, 1e-30)) {
        geconvergeerd = true;
        log({
          soort: 'info',
          tekst: `Geconvergeerd in ${iter + 1} iteratie(s) (tolerantie ${opts.tolerance.toExponential(0)})`,
        });
        break;
      }

      if (iter >= 1 && incrNorm > vorigeNorm) groei++; else groei = 0;
      if (groei >= 3) {
        log({
          soort: 'fout',
          tekst: 'De increment-norm groeit drie iteraties op rij — de last ligt op of boven de kniklast',
        });
        throw new Error(
          'Second-order (P-Delta) analysis did not converge — the applied load is at or above the critical (buckling) load'
        );
      }
      vorigeNorm = incrNorm;
    }

    if (!geconvergeerd) {
      throw new Error(
        `Second-order (P-Delta) analysis did not converge within ${opts.maxIterations} iterations — the load is at, above, or very close to the critical (buckling) load`
      );
    }

    // De raakstijfheid van de EINDSTAND. Hij dient twee doelen: de
    // stabiliteitscontrole hieronder, en straks de reacties — die horen uit
    // dezelfde matrix te komen waarmee het evenwicht is gevonden, precies
    // zoals het frame-pad dat doet.
    const Kg = assembleGeometricStiffnessMixed(
      mesh, displacements, nodeIdToIndex, numDofsMixed
    );
    const Kt = K.clone();
    for (let i = 0; i < numDofsMixed; i++) {
      for (let j = 0; j < numDofsMixed; j++) Kt.addAt(i, j, Kg.get(i, j));
    }
    Kreactie = Kt;

    // Stabiliteitscontrole op de eindstand, langs dezelfde weg als het
    // frame-pad: boven de kniklast kan de directe iteratie alsnog een vast
    // punt vinden terwijl K = Ke + Kg indefiniet is. Dan is er wel een
    // getal, maar het betekent niets. De penalty gaat op een KLOON — anders
    // zou 1e20 op de diagonaal in de reactieberekening meeliften.
    const Kstab = Kt.clone();
    for (const dof of constrainedDofs) Kstab.set(dof, dof, Kstab.get(dof, dof) + 1e20);
    const nietPositief = countNonPositivePivots(Kstab);
    if (nietPositief > 0) {
      log({
        soort: 'fout',
        tekst:
          `Stabiliteitscontrole: ${nietPositief} niet-positieve pivot(s) in K = Ke + Kg — ` +
          `de matrix is indefiniet en de oplossing fysisch betekenisloos`,
      });
      throw new Error(
        'Second-order (P-Delta) analysis is unstable — the applied load is at or above the critical (buckling) load'
      );
    }
    log({ soort: 'info', tekst: 'Stabiliteitscontrole: K = Ke + Kg is positief definiet' });
  }

  // Calculate reactions: R = K·u - F
  const reactions = Kreactie.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }

  // =====================
  // POST-PROCESSING: BEAMS
  // =====================
  const beamForces = new Map<number, IBeamForces>();

  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;

    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    if (idx1 === undefined || idx2 === undefined) continue;

    // Extract 6-DOF global displacements for beam (3 DOF per node)
    const globalDisp = [
      displacements[idx1 * dofsPerNode],      // u1
      displacements[idx1 * dofsPerNode + 1],  // v1
      displacements[idx1 * dofsPerNode + 2],  // θ1
      displacements[idx2 * dofsPerNode],      // u2
      displacements[idx2 * dofsPerNode + 1],  // v2
      displacements[idx2 * dofsPerNode + 2],  // θ2
    ];

    const forces = calculateBeamInternalForces(beam, n1, n2, material, globalDisp);
    beamForces.set(beam.id, forces);
  }

  // ======================
  // POST-PROCESSING: PLATES
  // ======================
  const elementStresses = new Map<number, IElementStress>();
  let maxVonMises = 0;
  let minVonMises = Infinity;

  // Per-component range tracking
  const ranges = {
    sigmaX: { min: Infinity, max: -Infinity },
    sigmaY: { min: Infinity, max: -Infinity },
    tauXY: { min: Infinity, max: -Infinity },
    mx: { min: Infinity, max: -Infinity },
    my: { min: Infinity, max: -Infinity },
    mxy: { min: Infinity, max: -Infinity },
    vx: { min: Infinity, max: -Infinity },
    vy: { min: Infinity, max: -Infinity },
    nx: { min: Infinity, max: -Infinity },
    ny: { min: Infinity, max: -Infinity },
    nxy: { min: Infinity, max: -Infinity },
  };

  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;

    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;

    // Extract element displacements: only u, v (skip θ) for plate stress calculation
    // Plates in mixed analysis use plane stress formulation
    const elemDisp: number[] = [];
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === undefined) continue;
      // Only u and v (indices 0 and 1 within each node's 3 DOFs)
      elemDisp.push(displacements[idx * dofsPerNode]);     // u
      elemDisp.push(displacements[idx * dofsPerNode + 1]); // v
    }

    // Calculate stresses using plane_stress formulation
    let stress: { sigmaX: number; sigmaY: number; tauXY: number; vonMises: number };

    if (nodes.length === 4) {
      const [n1, n2, n3, n4] = nodes;
      stress = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, 'plane_stress');
    } else {
      const [n1, n2, n3] = nodes;
      stress = calculateElementStress(n1, n2, n3, material, elemDisp, 'plane_stress');
    }

    const principal = calculatePrincipalStresses(stress.sigmaX, stress.sigmaY, stress.tauXY);

    // Membrane forces: N = stress × thickness (N/m)
    const thickness = element.thickness || 1;
    const nx = stress.sigmaX * thickness;
    const ny = stress.sigmaY * thickness;
    const nxy = stress.tauXY * thickness;

    elementStresses.set(element.id, {
      elementId: element.id,
      ...stress,
      principalStresses: principal,
      nx,
      ny,
      nxy,
    });

    maxVonMises = Math.max(maxVonMises, stress.vonMises);
    minVonMises = Math.min(minVonMises, stress.vonMises);

    // Track per-component ranges
    ranges.sigmaX.min = Math.min(ranges.sigmaX.min, stress.sigmaX);
    ranges.sigmaX.max = Math.max(ranges.sigmaX.max, stress.sigmaX);
    ranges.sigmaY.min = Math.min(ranges.sigmaY.min, stress.sigmaY);
    ranges.sigmaY.max = Math.max(ranges.sigmaY.max, stress.sigmaY);
    ranges.tauXY.min = Math.min(ranges.tauXY.min, stress.tauXY);
    ranges.tauXY.max = Math.max(ranges.tauXY.max, stress.tauXY);
    ranges.nx.min = Math.min(ranges.nx.min, nx);
    ranges.nx.max = Math.max(ranges.nx.max, nx);
    ranges.ny.min = Math.min(ranges.ny.min, ny);
    ranges.ny.max = Math.max(ranges.ny.max, ny);
    ranges.nxy.min = Math.min(ranges.nxy.min, nxy);
    ranges.nxy.max = Math.max(ranges.nxy.max, nxy);
  }

  if (minVonMises === Infinity) minVonMises = 0;

  // Finalize ranges (replace Infinity with 0 for unused components)
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    if (ranges[key].min === Infinity) ranges[key].min = 0;
    if (ranges[key].max === -Infinity) ranges[key].max = 0;
  }

  return {
    displacements,
    reactions,
    elementStresses,
    beamForces,
    maxVonMises,
    minVonMises,
    stressRanges: ranges,
  };
}

/**
 * Iterative solver for tension-only and pressure-only beam connections.
 * Beams that violate their axial constraint are released (axial DOFs zeroed)
 * and the system is re-solved until convergence.
 */
function solveWithAxialConstraints(
  mesh: Mesh,
  F: number[],
  opts: NonlinearSolverOptions
): ISolverResult {
  const maxIter = opts.maxIterations || 20;
  const axialReleasedBeamIds = new Set<number>();

  for (let iter = 0; iter < maxIter; iter++) {
    // Assemble with current axial releases using the Assembler
    const K = assembleGlobalStiffnessMatrix(mesh, 'frame', axialReleasedBeamIds);
    const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, F, mesh);
    const displacements = solveLinearSystem(Kbc, Fbc);

    const { beamForces, axialForces } = calculateAllInternalForces(mesh, displacements);

    // Check each beam with tension/pressure-only connections
    let changed = false;
    for (const beam of mesh.beamElements.values()) {
      const { start, end } = getConnectionTypes(beam);
      const hasTensionOnly = start === 'tension_only' || end === 'tension_only';
      const hasPressureOnly = start === 'pressure_only' || end === 'pressure_only';

      if (!hasTensionOnly && !hasPressureOnly) continue;

      const N = axialForces.get(beam.id) ?? 0;
      const shouldRelease =
        (hasTensionOnly && N < 0) ||   // compression in tension-only → release
        (hasPressureOnly && N > 0);     // tension in pressure-only → release

      const isReleased = axialReleasedBeamIds.has(beam.id);

      if (shouldRelease && !isReleased) {
        axialReleasedBeamIds.add(beam.id);
        changed = true;
      } else if (!shouldRelease && isReleased) {
        axialReleasedBeamIds.delete(beam.id);
        changed = true;
      }
    }

    // Converged — return this result
    if (!changed) {
      const reactions = K.multiplyVector(displacements);
      for (let i = 0; i < reactions.length; i++) {
        reactions[i] = reactions[i] - F[i];
      }

      let maxVonMises = 0;
      for (const forces of beamForces.values()) {
        maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
      }

      return {
        displacements,
        reactions,
        elementStresses: new Map(),
        beamForces,
        maxVonMises,
        minVonMises: 0
      };
    }
  }

  // If not converged, solve one final time with current releases
  const K = assembleGlobalStiffnessMatrix(mesh, 'frame', axialReleasedBeamIds);
  const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, F, mesh);
  const displacements = solveLinearSystem(Kbc, Fbc);
  const { beamForces } = calculateAllInternalForces(mesh, displacements);

  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }

  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }

  console.warn('Axial constraint iteration did not converge within', maxIter, 'iterations');

  return {
    displacements,
    reactions,
    elementStresses: new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0
  };
}
