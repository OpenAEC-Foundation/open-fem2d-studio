/**
 * Geometric Nonlinear Frame Solver
 *
 * Implements P-Delta analysis for second-order effects
 * Uses Newton-Raphson iteration for geometric nonlinearity
 */

import { Matrix } from '../math/Matrix';
import { Mesh } from '../fem/Mesh';
import { ISolverResult, IBeamForces, IElementStress, AnalysisType, getConnectionTypes } from '../fem/types';
import {
  calculateBeamLength,
  calculateBeamAngle,
  calculateBeamLocalStiffness,
  createTransformationMatrix,
  calculateTrapezoidalLoadVector,
  calculatePartialTrapezoidalLoadVector,
  calculatePartialDistributedLoadVector,
} from '../fem/Beam';
import { calculateBeamInternalForces } from '../fem/BeamForces';
import { calculateElementStress, calculatePrincipalStresses } from '../fem/Triangle';
import { calculateQuadStress } from '../fem/Quad4';
import { calculateElementMoments, calculateElementShearForces } from '../fem/DKT';
import { assembleGlobalStiffnessMatrix, assembleForceVector as assembleForceVectorNew, getConstrainedDofs, getDofsPerNode, applyEndReleases, buildNodeIdToIndex } from './Assembler';
import { solveLinearSystem } from '../math/GaussElimination';

export interface NonlinearSolverOptions {
  analysisType: AnalysisType;
  geometricNonlinear: boolean;
  maxIterations: number;
  tolerance: number;
  loadSteps: number;
}

const DEFAULT_OPTIONS: NonlinearSolverOptions = {
  analysisType: 'frame',
  geometricNonlinear: false,
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

    // Apply static condensation for connection types (hinges)
    const { start, end } = getConnectionTypes(beam);
    const releasedLocalDofs: number[] = [];
    if (start === 'hinge') releasedLocalDofs.push(2); // θ1
    if (end === 'hinge') releasedLocalDofs.push(5);   // θ2
    if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }

    // Add geometric stiffness if requested
    if (includeGeometric) {
      const N = axialForces.get(beam.id) || 0;
      const Kg = calculateGeometricStiffness(L, N);

      // Add geometric stiffness to local stiffness
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

  // Equivalent nodal forces from distributed loads
  for (const beam of mesh.beamElements.values()) {
    if (!beam.distributedLoad) continue;

    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);

    let qx = beam.distributedLoad.qx;
    let qy = beam.distributedLoad.qy;
    let qxE = beam.distributedLoad.qxEnd ?? qx;
    let qyE = beam.distributedLoad.qyEnd ?? qy;
    const coordSystem = beam.distributedLoad.coordSystem ?? 'local';
    const startT = beam.distributedLoad.startT ?? 0;
    const endT = beam.distributedLoad.endT ?? 1;

    // If global coordinate system, project to local axes
    if (coordSystem === 'global') {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const qxLocal = qx * cos + qy * sin;
      const qyLocal = -qx * sin + qy * cos;
      const qxELocal = qxE * cos + qyE * sin;
      const qyELocal = -qxE * sin + qyE * cos;
      qx = qxLocal;
      qy = qyLocal;
      qxE = qxELocal;
      qyE = qyELocal;
    }

    // Equivalent nodal forces in local coordinates
    const isTrapezoidal = qxE !== qx || qyE !== qy;
    let fLocal: number[];
    if (isTrapezoidal) {
      if (startT > 0 || endT < 1) {
        fLocal = calculatePartialTrapezoidalLoadVector(L, qx, qy, qxE, qyE, startT, endT);
      } else {
        fLocal = calculateTrapezoidalLoadVector(L, qx, qy, qxE, qyE);
      }
    } else if (startT > 0 || endT < 1) {
      fLocal = calculatePartialDistributedLoadVector(L, qx, qy, startT, endT);
    } else {
      fLocal = [
        qx * L / 2,
        qy * L / 2,
        qy * L * L / 12,
        qx * L / 2,
        qy * L / 2,
        -qy * L * L / 12
      ];
    }

    // Apply force condensation for beam end releases (hinges)
    // The equivalent nodal forces must be condensed consistently with the stiffness
    const { start, end } = getConnectionTypes(beam);
    const releasedLocalDofs: number[] = [];
    if (start === 'hinge') releasedLocalDofs.push(2); // θ1
    if (end === 'hinge') releasedLocalDofs.push(5);   // θ2
    if (releasedLocalDofs.length > 0) {
      const material = mesh.getMaterial(beam.materialId);
      if (material) {
        const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
        applyEndReleases(Kl, releasedLocalDofs, fLocal);
      }
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

  // For linear analysis, just solve once (or iteratively for axial constraints)
  if (!opts.geometricNonlinear) {
    if (hasAxialConstraints) {
      return solveWithAxialConstraints(mesh, F, opts);
    }

    const K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, false);
    const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, F, mesh);
    displacements = solveLinearSystem(Kbc, Fbc);

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

  // Nonlinear iteration (P-Delta analysis)
  for (let step = 1; step <= opts.loadSteps; step++) {
    const loadFactor = step / opts.loadSteps;
    const scaledF = F.map(f => f * loadFactor);

    for (let iter = 0; iter < opts.maxIterations; iter++) {
      // Assemble stiffness with current geometric stiffness
      const K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, true);
      const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, scaledF, mesh);

      // Calculate residual
      const internalForces = K.multiplyVector(displacements);
      const residual = Fbc.map((f, i) => f - internalForces[i]);

      // Check convergence
      const residualNorm = Math.sqrt(residual.reduce((sum, r) => sum + r * r, 0));
      const forceNorm = Math.sqrt(scaledF.reduce((sum, f) => sum + f * f, 0));

      if (residualNorm / (forceNorm + 1e-10) < opts.tolerance) {
        break;
      }

      // Solve for displacement increment
      const deltaU = solveLinearSystem(Kbc, residual);

      // Update displacements
      for (let i = 0; i < numDofs; i++) {
        displacements[i] += deltaU[i];
      }

      // Update axial forces
      const { axialForces: newAxial } = calculateAllInternalForces(mesh, displacements);
      axialForces = newAxial;
    }
  }

  // Final internal forces calculation
  const { beamForces } = calculateAllInternalForces(mesh, displacements);

  // Calculate reactions
  const K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, opts.geometricNonlinear);
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
    minVonMises: 0
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
    throw new Error('No loads applied - add forces to nodes or elements');
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
  const displacements = solveLinearSystem(Kmod, Fmod);

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
 * Solve mixed beam+plate analysis.
 * Uses unified 3 DOFs per node (u, v, θ) with expanded plate stiffness matrices.
 * Beam elements use their native 6×6 (3 DOF/node) stiffness.
 * Plate elements are expanded from 6×6 or 8×8 to 9×9 or 12×12 (3 DOF/node).
 */
function solveMixed(
  mesh: Mesh,
  _opts: NonlinearSolverOptions  // Reserved for future nonlinear mixed analysis
): ISolverResult {
  const analysisType = 'mixed_beam_plate';
  const dofsPerNode = 3; // u, v, θ for all nodes

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

  // Apply boundary conditions (penalty method)
  const Kmod = K.clone();
  const Fmod = [...F];
  const penalty = 1e20;
  for (const dof of constrainedDofs) {
    Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
    Fmod[dof] = 0;
  }

  // Solve linear system
  const displacements = solveLinearSystem(Kmod, Fmod);

  // Calculate reactions: R = K·u - F
  const reactions = K.multiplyVector(displacements);
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
