import { Matrix } from '../math/Matrix';
import { Mesh } from '../fem/Mesh';
import { AnalysisType, getConnectionTypes } from '../fem/types';
import { calculateElementStiffness, calculateTriangleStiffnessExpanded } from '../fem/Triangle';
import { calculateQuadStiffness, calculateQuadStiffnessExpanded } from '../fem/Quad4';
import { calculateDKTStiffness } from '../fem/DKT';
import { calculateBeamGlobalStiffness, calculateBeamLocalStiffness, calculateDistributedLoadVector, calculatePartialDistributedLoadVector, calculateTrapezoidalLoadVector, calculatePartialTrapezoidalLoadVector, transformLocalToGlobal, calculateBeamLength, calculateBeamAngle } from '../fem/Beam';

/**
 * Collect only the nodes that participate in the current analysis type.
 * For frame: nodes used by beam elements.
 * For plane_stress/plane_strain: nodes used by triangle/quad elements.
 * This prevents disconnected nodes from creating zero-stiffness DOFs (singular matrix).
 */
function getActiveNodeIds(mesh: Mesh, analysisType: AnalysisType): Set<number> {
  const activeIds = new Set<number>();
  if (analysisType === 'frame') {
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) activeIds.add(nid);
    }
  } else if (analysisType === 'mixed_beam_plate') {
    // Include nodes from BOTH beams and plate elements
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) activeIds.add(nid);
    }
    for (const elem of mesh.elements.values()) {
      for (const nid of elem.nodeIds) activeIds.add(nid);
    }
  } else {
    for (const elem of mesh.elements.values()) {
      for (const nid of elem.nodeIds) activeIds.add(nid);
    }
  }
  return activeIds;
}

/**
 * Build a node-ID-to-sequential-index mapping for active nodes only.
 */
export function buildNodeIdToIndex(mesh: Mesh, analysisType: AnalysisType): Map<number, number> {
  const activeIds = getActiveNodeIds(mesh, analysisType);
  const nodeIdToIndex = new Map<number, number>();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    if (activeIds.has(node.id)) {
      nodeIdToIndex.set(node.id, index);
      index++;
    }
  }
  return nodeIdToIndex;
}

/** Get DOFs per node for the given analysis type. */
export function getDofsPerNode(analysisType: AnalysisType): number {
  if (analysisType === 'frame') return 3;  // u, v, θ
  if (analysisType === 'plate_bending') return 3;  // w, θx, θy
  if (analysisType === 'mixed_beam_plate') return 3;  // u, v, θ (unified for beams + plates)
  return 2;  // u, v
}

export function assembleGlobalStiffnessMatrix(
  mesh: Mesh,
  analysisType: AnalysisType,
  axialReleasedBeamIds?: Set<number>
): Matrix {
  const dofsPerNode = getDofsPerNode(analysisType);

  // Create node ID to index mapping (active nodes only)
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);
  const numNodes = nodeIdToIndex.size;
  const numDofs = numNodes * dofsPerNode;

  const K = new Matrix(numDofs, numDofs);

  if (analysisType === 'frame') {
    // Assemble beam elements for frame analysis
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;

      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;

      const [n1, n2] = nodes;

      try {
        const Ke = calculateBeamGlobalStiffness(n1, n2, material, beam.section);

        // Apply static condensation for end releases (hinges / axial releases)
        const { start, end } = getConnectionTypes(beam);
        const releasedLocalDofs: number[] = [];
        if (start === 'hinge') releasedLocalDofs.push(2); // θ1
        if (end === 'hinge') releasedLocalDofs.push(5);   // θ2
        // Axial release for tension/pressure-only beams that are in the released set
        if (axialReleasedBeamIds?.has(beam.id)) {
          releasedLocalDofs.push(0, 3); // u1, u2 (axial DOFs)
        }
        if (releasedLocalDofs.length > 0) {
          applyEndReleases(Ke, releasedLocalDofs);
        }

        // Get global DOF indices for this beam element
        const idx1 = nodeIdToIndex.get(n1.id)!;
        const idx2 = nodeIdToIndex.get(n2.id)!;
        const dofIndices = [
          idx1 * 3,     // u1
          idx1 * 3 + 1, // v1
          idx1 * 3 + 2, // θ1
          idx2 * 3,     // u2
          idx2 * 3 + 1, // v2
          idx2 * 3 + 2  // θ2
        ];

        // Assemble into global matrix
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }

        // Add Winkler foundation stiffness for beam on grade
        if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
          const L = calculateBeamLength(n1, n2);
          const k = beam.onGrade.k; // N/m² (spring stiffness per unit area)
          const b = beam.onGrade.b ?? 1.0; // Foundation width in m (default 1.0m if not specified)
          const kL = k * b * L; // Total spring stiffness along beam

          // Vertical stiffness (primary Winkler stiffness)
          const v1Dof = dofIndices[1]; // v1
          const v2Dof = dofIndices[4]; // v2
          K.addAt(v1Dof, v1Dof, kL / 2);
          K.addAt(v2Dof, v2Dof, kL / 2);

          // Small horizontal friction stiffness to prevent singularity (0.1% of vertical)
          // This represents soil friction resistance
          const u1Dof = dofIndices[0]; // u1
          const u2Dof = dofIndices[3]; // u2
          const kFriction = kL * 0.001;
          K.addAt(u1Dof, u1Dof, kFriction / 2);
          K.addAt(u2Dof, u2Dof, kFriction / 2);
        }
      } catch (e) {
        console.warn(`Skipping beam element ${beam.id}: ${e}`);
      }
    }
  } else if (analysisType === 'plate_bending') {
    // Assemble DKT plate bending elements (9×9, 3 DOFs/node)
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      if (nodes.length !== 3) continue;

      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;

      const [n1, n2, n3] = nodes;

      try {
        const Ke = calculateDKTStiffness(n1, n2, n3, material, element.thickness);

        // Get global DOF indices: 3 DOFs per node (w, θx, θy)
        const dofIndices: number[] = [];
        for (const node of nodes) {
          const nodeIndex = nodeIdToIndex.get(node.id)!;
          dofIndices.push(nodeIndex * 3);     // w
          dofIndices.push(nodeIndex * 3 + 1); // θx
          dofIndices.push(nodeIndex * 3 + 2); // θy
        }

        // Assemble 9×9 into global matrix
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < 9; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }
      } catch (e) {
        console.warn(`Skipping DKT element ${element.id}: ${e}`);
      }
    }
  } else if (analysisType === 'mixed_beam_plate') {
    // MIXED ANALYSIS: Assemble both beams (3 DOF/node) and plates (expanded to 3 DOF/node)

    // 1. Assemble beam elements (6×6, 3 DOF/node - same as frame analysis)
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;

      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;

      const [n1, n2] = nodes;

      try {
        const Ke = calculateBeamGlobalStiffness(n1, n2, material, beam.section);

        // Apply static condensation for end releases (hinges / axial releases)
        const { start, end } = getConnectionTypes(beam);
        const releasedLocalDofs: number[] = [];
        if (start === 'hinge') releasedLocalDofs.push(2);
        if (end === 'hinge') releasedLocalDofs.push(5);
        if (axialReleasedBeamIds?.has(beam.id)) {
          releasedLocalDofs.push(0, 3);
        }
        if (releasedLocalDofs.length > 0) {
          applyEndReleases(Ke, releasedLocalDofs);
        }

        const idx1 = nodeIdToIndex.get(n1.id)!;
        const idx2 = nodeIdToIndex.get(n2.id)!;
        const dofIndices = [
          idx1 * 3, idx1 * 3 + 1, idx1 * 3 + 2,
          idx2 * 3, idx2 * 3 + 1, idx2 * 3 + 2
        ];

        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }

        // Add Winkler foundation stiffness for beam on grade
        if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
          const L = calculateBeamLength(n1, n2);
          const k = beam.onGrade.k;
          const b = beam.onGrade.b ?? 1.0; // Foundation width in m (default 1.0m)
          const kL = k * b * L;

          // Vertical stiffness
          const v1Dof = dofIndices[1];
          const v2Dof = dofIndices[4];
          K.addAt(v1Dof, v1Dof, kL / 2);
          K.addAt(v2Dof, v2Dof, kL / 2);

          // Horizontal friction stiffness (0.1% of vertical)
          const u1Dof = dofIndices[0];
          const u2Dof = dofIndices[3];
          const kFriction = kL * 0.001;
          K.addAt(u1Dof, u1Dof, kFriction / 2);
          K.addAt(u2Dof, u2Dof, kFriction / 2);
        }
      } catch (e) {
        console.warn(`Skipping beam element ${beam.id} in mixed analysis: ${e}`);
      }
    }

    // 2. Assemble plate elements (EXPANDED to 3 DOF/node)
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;

      try {
        if (nodes.length === 4) {
          // 4-node quad: expand 8×8 → 12×12
          const [n1, n2, n3, n4] = nodes;
          const Ke = calculateQuadStiffnessExpanded(n1, n2, n3, n4, material, element.thickness, 'plane_stress');

          const dofIndices: number[] = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id)!;
            dofIndices.push(nodeIndex * 3);     // u
            dofIndices.push(nodeIndex * 3 + 1); // v
            dofIndices.push(nodeIndex * 3 + 2); // θ (zero stiffness)
          }

          for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else if (nodes.length === 3) {
          // 3-node triangle: expand 6×6 → 9×9
          const [n1, n2, n3] = nodes;
          const Ke = calculateTriangleStiffnessExpanded(n1, n2, n3, material, element.thickness, 'plane_stress');

          const dofIndices: number[] = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id)!;
            dofIndices.push(nodeIndex * 3);     // u
            dofIndices.push(nodeIndex * 3 + 1); // v
            dofIndices.push(nodeIndex * 3 + 2); // θ (zero stiffness)
          }

          for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        }
      } catch (e) {
        console.warn(`Skipping element ${element.id} in mixed analysis: ${e}`);
      }
    }
    // 3. Stabilize rotational DOFs for plate-only nodes (no beam connected)
    // Plate elements expanded to 3-DOF have zero θ-stiffness; add small penalty
    // to prevent singularity for nodes not connected to any beam
    const beamNodeIds = new Set<number>();
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) beamNodeIds.add(nid);
    }
    // Find a representative stiffness magnitude for scaling
    let maxDiag = 0;
    for (let i = 0; i < numDofs; i++) {
      const d = Math.abs(K.get(i, i));
      if (d > maxDiag) maxDiag = d;
    }
    const rotStab = maxDiag * 1e-6; // small stabilization
    for (const [nodeId, nodeIndex] of nodeIdToIndex.entries()) {
      if (!beamNodeIds.has(nodeId)) {
        // This node has no beam connection → θ DOF has zero stiffness
        const thetaDof = nodeIndex * 3 + 2;
        if (Math.abs(K.get(thetaDof, thetaDof)) < 1e-20) {
          K.addAt(thetaDof, thetaDof, rotStab);
        }
      }
    }
  } else {
    // Assemble triangle and quad elements for plane stress/strain
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);

      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;

      try {
        if (nodes.length === 4) {
          // 4-node quad element (8x8 stiffness)
          const [n1, n2, n3, n4] = nodes;
          const Ke = calculateQuadStiffness(n1, n2, n3, n4, material, element.thickness, analysisType);

          const dofIndices: number[] = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id)!;
            dofIndices.push(nodeIndex * 2);     // u
            dofIndices.push(nodeIndex * 2 + 1); // v
          }

          for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else if (nodes.length === 3) {
          // 3-node triangle element (6x6 stiffness) — backward compatibility
          const [n1, n2, n3] = nodes;
          const Ke = calculateElementStiffness(n1, n2, n3, material, element.thickness, analysisType);

          const dofIndices: number[] = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id)!;
            dofIndices.push(nodeIndex * 2);     // u
            dofIndices.push(nodeIndex * 2 + 1); // v
          }

          for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else {
          continue; // Skip unsupported element types
        }
      } catch (e) {
        console.warn(`Skipping element ${element.id}: ${e}`);
      }
    }
  }

  // Add spring support stiffness to diagonal
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === undefined) continue;
    const c = node.constraints;
    if (analysisType === 'plate_bending') {
      // plate_bending: DOFs are w, θx, θy
      // DOF 0 = w (vertical) → springY
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 3, nodeIndex * 3, c.springY);
      }
      // DOF 1,2 = θx, θy → springRot (split between both rotation DOFs)
      if (c.springRot != null && c.rotation) {
        K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springRot / 2);
        K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot / 2);
      }
    } else if (dofsPerNode === 3) {
      // frame/mixed: DOFs are u, v, θ
      if (c.springX != null && c.x) {
        K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
      }
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
      }
      if (c.springRot != null && c.rotation) {
        K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
      }
    } else if (dofsPerNode === 2) {
      // plane_stress/plane_strain: DOFs are u, v
      if (c.springX != null && c.x) {
        K.addAt(nodeIndex * 2, nodeIndex * 2, c.springX);
      }
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 2 + 1, nodeIndex * 2 + 1, c.springY);
      }
    }
  }

  return K;
}

export function assembleForceVector(mesh: Mesh, analysisType: AnalysisType = 'plane_stress'): number[] {
  const dofsPerNode = getDofsPerNode(analysisType);

  // Create node ID to index mapping (active nodes only)
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);
  const numNodes = nodeIdToIndex.size;
  const numDofs = numNodes * dofsPerNode;
  const F: number[] = new Array(numDofs).fill(0);

  // Add nodal forces (only for active nodes)
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === undefined) continue;
    if (analysisType === 'plate_bending') {
      // Plate bending: DOFs are w, θx, θy
      // fz goes into the w DOF, rotations stay 0 unless explicit
      F[nodeIndex * 3] = node.loads.fz ?? node.loads.fy; // use fy as transverse if fz not set
      F[nodeIndex * 3 + 1] = 0;
      F[nodeIndex * 3 + 2] = 0;
    } else if (dofsPerNode === 3) {
      F[nodeIndex * 3] = node.loads.fx;
      F[nodeIndex * 3 + 1] = node.loads.fy;
      F[nodeIndex * 3 + 2] = node.loads.moment ?? 0;
    } else {
      F[nodeIndex * 2] = node.loads.fx;
      F[nodeIndex * 2 + 1] = node.loads.fy;
    }
  }

  // Add equivalent nodal forces from distributed loads on beams
  if (analysisType === 'frame' || analysisType === 'mixed_beam_plate') {
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

      // Get equivalent nodal forces in local coordinates
      const isTrapezoidal = qxE !== qx || qyE !== qy;
      let localForces: number[];
      if (isTrapezoidal) {
        if (startT > 0 || endT < 1) {
          localForces = calculatePartialTrapezoidalLoadVector(L, qx, qy, qxE, qyE, startT, endT);
        } else {
          localForces = calculateTrapezoidalLoadVector(L, qx, qy, qxE, qyE);
        }
      } else if (startT > 0 || endT < 1) {
        localForces = calculatePartialDistributedLoadVector(L, qx, qy, startT, endT);
      } else {
        localForces = calculateDistributedLoadVector(L, qx, qy);
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
          applyEndReleases(Kl, releasedLocalDofs, localForces);
        }
      }

      // Transform to global coordinates
      const globalForces = transformLocalToGlobal(localForces, angle);

      // Add to force vector
      const idx1 = nodeIdToIndex.get(n1.id)!;
      const idx2 = nodeIdToIndex.get(n2.id)!;

      F[idx1 * 3] += globalForces[0];
      F[idx1 * 3 + 1] += globalForces[1];
      F[idx1 * 3 + 2] += globalForces[2];
      F[idx2 * 3] += globalForces[3];
      F[idx2 * 3 + 1] += globalForces[4];
      F[idx2 * 3 + 2] += globalForces[5];
    }
  }

  return F;
}

export function getConstrainedDofs(
  mesh: Mesh,
  analysisType: AnalysisType = 'plane_stress'
): { dofs: number[]; nodeIdToIndex: Map<number, number> } {
  // Use active nodes only to match the stiffness matrix
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);

  const dofsPerNode = getDofsPerNode(analysisType);
  const dofs: number[] = [];

  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === undefined) continue;
    if (analysisType === 'plate_bending') {
      // plate_bending: DOFs are w, θx, θy
      // y constraint → w fixed (vertical displacement constrained)
      // Spring DOFs are NOT constrained - stiffness is added to K diagonal instead
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 3);
      // rotation constraint → θx and θy fixed
      if (node.constraints.rotation && node.constraints.springRot == null) {
        dofs.push(nodeIndex * 3 + 1);
        dofs.push(nodeIndex * 3 + 2);
      }
    } else if (dofsPerNode === 3) {
      // Spring DOFs are NOT constrained - stiffness is added to K diagonal instead
      if (node.constraints.x && node.constraints.springX == null) dofs.push(nodeIndex * 3);
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 3 + 1);
      if (node.constraints.rotation && node.constraints.springRot == null) dofs.push(nodeIndex * 3 + 2);
    } else {
      if (node.constraints.x && node.constraints.springX == null) dofs.push(nodeIndex * 2);
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 2 + 1);
    }
  }

  return { dofs, nodeIdToIndex };
}

/**
 * Apply static condensation for beam end releases (hinges).
 * Modifies the stiffness matrix in place.
 * Optionally also condenses a force vector (e.g. equivalent nodal forces).
 * releasedDofs: indices of released DOFs in the 6x6 element matrix
 */
export function applyEndReleases(Ke: Matrix, releasedDofs: number[], F?: number[]): void {
  const n = 6;
  const retained: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!releasedDofs.includes(i)) retained.push(i);
  }

  // Static condensation: K_rr - K_rc * K_cc^-1 * K_cr
  // For single DOF releases, this simplifies significantly
  for (const c of releasedDofs) {
    const kcc = Ke.get(c, c);
    if (Math.abs(kcc) < 1e-20) continue;

    // Condense force vector FIRST (uses original K values before modification)
    // F_i -= K_ic / K_cc * F_c
    if (F) {
      const fc = F[c];
      for (const i of retained) {
        F[i] -= Ke.get(i, c) / kcc * fc;
      }
      F[c] = 0;
    }

    // Modify retained entries: K_ij -= K_ic * K_cj / K_cc
    for (const i of retained) {
      for (const j of retained) {
        const kic = Ke.get(i, c);
        const kcj = Ke.get(c, j);
        Ke.addAt(i, j, -kic * kcj / kcc);
      }
    }

    // Zero out the released DOF row and column
    for (let i = 0; i < n; i++) {
      Ke.set(i, c, 0);
      Ke.set(c, i, 0);
    }
  }
}
