import { solveWithConstraints } from '../math/GaussElimination';
import { Mesh } from '../fem/Mesh';
import { ISolverResult, IElementStress, IBeamForces, AnalysisType } from '../fem/types';
import { assembleGlobalStiffnessMatrix, assembleForceVector, getConstrainedDofs } from './Assembler';
import { calculateElementStress, calculatePrincipalStresses } from '../fem/Triangle';
import { calculateQuadStress } from '../fem/Quad4';
import { calculateBeamInternalForces } from '../fem/BeamForces';

export interface SolverOptions {
  analysisType: AnalysisType;
}

export function solve(mesh: Mesh, options: SolverOptions): ISolverResult {
  const { analysisType } = options;

  // Validate mesh based on analysis type
  if (analysisType === 'frame') {
    if (mesh.getNodeCount() < 2) {
      throw new Error('Frame must have at least 2 nodes');
    }
    if (mesh.getBeamCount() < 1) {
      throw new Error('Frame must have at least 1 beam element');
    }
  } else {
    if (mesh.getNodeCount() < 3) {
      throw new Error('Mesh must have at least 3 nodes');
    }
    if (mesh.getElementCount() < 1) {
      throw new Error('Mesh must have at least 1 element');
    }
  }

  // Get constrained DOFs
  const { dofs: fixedDofs, nodeIdToIndex } = getConstrainedDofs(mesh, analysisType);
  if (fixedDofs.length === 0) {
    throw new Error('Model has no constraints - add boundary conditions');
  }

  // Assemble system
  const K = assembleGlobalStiffnessMatrix(mesh, analysisType);
  const F = assembleForceVector(mesh, analysisType);

  // Check if any loads are applied
  const hasLoads = F.some(f => f !== 0);
  if (!hasLoads) {
    throw new Error('No loads applied - add forces to nodes');
  }

  // Solve the system
  const displacements = solveWithConstraints(K, F, fixedDofs);

  // Calculate reactions at constrained DOFs
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }

  // Calculate element stresses (for plane stress/strain)
  const elementStresses = new Map<number, IElementStress>();
  let maxVonMises = 0;
  let minVonMises = Infinity;

  if (analysisType !== 'frame') {
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      if (nodes.length < 3 || nodes.length > 4) continue;

      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;

      // Get element displacements
      const elemDisp: number[] = [];
      for (const node of nodes) {
        const nodeIndex = nodeIdToIndex.get(node.id)!;
        elemDisp.push(displacements[nodeIndex * 2]);     // u
        elemDisp.push(displacements[nodeIndex * 2 + 1]); // v
      }

      let stressResult: { sigmaX: number; sigmaY: number; tauXY: number; vonMises: number };
      if (nodes.length === 4) {
        const [n1, n2, n3, n4] = nodes;
        stressResult = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, analysisType);
      } else {
        const [n1, n2, n3] = nodes;
        stressResult = calculateElementStress(n1, n2, n3, material, elemDisp, analysisType);
      }

      const { sigmaX, sigmaY, tauXY, vonMises } = stressResult;
      const principal = calculatePrincipalStresses(sigmaX, sigmaY, tauXY);

      const stress: IElementStress = {
        elementId: element.id,
        sigmaX,
        sigmaY,
        tauXY,
        vonMises,
        principalStresses: principal
      };

      elementStresses.set(element.id, stress);

      maxVonMises = Math.max(maxVonMises, vonMises);
      minVonMises = Math.min(minVonMises, vonMises);
    }
  }

  // Calculate beam internal forces (for frame analysis)
  const beamForces = new Map<number, IBeamForces>();

  if (analysisType === 'frame') {
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;

      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;

      const [n1, n2] = nodes;

      // Get beam element displacements (global)
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

      // Use max moment for von Mises equivalent (for color scaling)
      const maxStress = forces.maxM * (beam.section.h / 2) / beam.section.I;
      maxVonMises = Math.max(maxVonMises, Math.abs(maxStress));
      if (minVonMises === Infinity) minVonMises = 0;
    }
  }

  return {
    displacements,
    reactions,
    elementStresses,
    beamForces,
    maxVonMises,
    minVonMises
  };
}

export function getNodeDisplacement(
  result: ISolverResult,
  nodeId: number,
  nodeIdToIndex: Map<number, number>
): { u: number; v: number } {
  const index = nodeIdToIndex.get(nodeId);
  if (index === undefined) {
    return { u: 0, v: 0 };
  }
  return {
    u: result.displacements[index * 2] || 0,
    v: result.displacements[index * 2 + 1] || 0
  };
}
