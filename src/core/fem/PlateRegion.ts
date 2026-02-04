/**
 * Plate Region: mesh generation, edge load conversion, and deletion
 * A PlateRegion is a rectangular area auto-meshed with quad elements.
 */

import { Mesh } from './Mesh';
import { INode, IPlateRegion, IEdgeLoad } from './types';
import { triangulatePolygon } from '../mesher/TriangleService';
import { pairTrianglesToQuads, pairTrianglesToQuadsOnly } from '../mesher/TriToQuad';

export interface PlateRegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  divisionsX: number;
  divisionsY: number;
  materialId: number;
  thickness: number;
  elementType?: 'triangle' | 'quad';
}

/**
 * Generate a plate region mesh: creates grid nodes and quad elements.
 * Reuses existing nodes at matching positions (within tolerance).
 */
export function generatePlateRegionMesh(mesh: Mesh, config: PlateRegionConfig): IPlateRegion {
  const { x, y, width, height, divisionsX, divisionsY, materialId, thickness } = config;
  const elementType = config.elementType ?? 'quad';
  const nx = divisionsX;
  const ny = divisionsY;

  // Create (nx+1)*(ny+1) grid nodes
  const nodeGrid: number[][] = []; // nodeGrid[j][i] = nodeId
  const allNodeIds: number[] = [];

  for (let j = 0; j <= ny; j++) {
    nodeGrid[j] = [];
    for (let i = 0; i <= nx; i++) {
      const nodeX = x + (i / nx) * width;
      const nodeY = y + (j / ny) * height;

      // Try to reuse existing node at this position
      const existing = mesh.findNodeAt(nodeX, nodeY, 0.001);
      if (existing) {
        nodeGrid[j][i] = existing.id;
      } else {
        // Use plate node IDs (starting from 1000) for plate mesh nodes
        const newNode = mesh.addPlateNode(nodeX, nodeY);
        nodeGrid[j][i] = newNode.id;
      }
      if (!allNodeIds.includes(nodeGrid[j][i])) {
        allNodeIds.push(nodeGrid[j][i]);
      }
    }
  }

  const allElementIds: number[] = [];

  if (elementType === 'quad') {
    // Create nx*ny quad elements (1 per grid cell)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];         // BL
        const n1 = nodeGrid[j][i + 1];     // BR
        const n2 = nodeGrid[j + 1][i + 1]; // TR
        const n3 = nodeGrid[j + 1][i];     // TL

        const q = mesh.addQuadElement([n0, n1, n2, n3], materialId, thickness);
        if (q) allElementIds.push(q.id);
      }
    }
  } else {
    // Create 2*nx*ny triangles (2 per grid cell)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];       // BL
        const n1 = nodeGrid[j][i + 1];   // BR
        const n2 = nodeGrid[j + 1][i + 1]; // TR
        const n3 = nodeGrid[j + 1][i];   // TL

        // Triangle 1: (BL, BR, TR)
        const t1 = mesh.addTriangleElement([n0, n1, n2], materialId, thickness);
        if (t1) allElementIds.push(t1.id);

        // Triangle 2: (BL, TR, TL)
        const t2 = mesh.addTriangleElement([n0, n2, n3], materialId, thickness);
        if (t2) allElementIds.push(t2.id);
      }
    }
  }

  // Record edge nodeIds (ordered)
  const bottomEdge: number[] = [];
  for (let i = 0; i <= nx; i++) bottomEdge.push(nodeGrid[0][i]);

  const topEdge: number[] = [];
  for (let i = 0; i <= nx; i++) topEdge.push(nodeGrid[ny][i]);

  const leftEdge: number[] = [];
  for (let j = 0; j <= ny; j++) leftEdge.push(nodeGrid[j][0]);

  const rightEdge: number[] = [];
  for (let j = 0; j <= ny; j++) rightEdge.push(nodeGrid[j][nx]);

  const cornerNodeIds: [number, number, number, number] = [
    nodeGrid[0][0],     // BL
    nodeGrid[0][nx],    // BR
    nodeGrid[ny][nx],   // TR
    nodeGrid[ny][0]     // TL
  ];

  return {
    id: 0, // Will be assigned by Mesh.addPlateRegion
    x,
    y,
    width,
    height,
    divisionsX,
    divisionsY,
    materialId,
    thickness,
    elementType,
    nodeIds: allNodeIds,
    cornerNodeIds,
    elementIds: allElementIds,
    edges: {
      bottom: { nodeIds: bottomEdge },
      top: { nodeIds: topEdge },
      left: { nodeIds: leftEdge },
      right: { nodeIds: rightEdge }
    }
  };
}

/**
 * Convert an edge load on a plate to equivalent nodal forces using tributary lengths.
 * Returns an array of { nodeId, fx, fy } for each node along the edge.
 * Supports both named edges (top/bottom/left/right) and polygon edge indices (number).
 */
export function convertEdgeLoadToNodalForces(
  mesh: Mesh,
  plate: IPlateRegion,
  edgeLoad: IEdgeLoad
): { nodeId: number; fx: number; fy: number }[] {
  // New path: if edgeId is set, use IEdge.nodeIds directly
  if (edgeLoad.edgeId !== undefined) {
    const edge = mesh.getEdge(edgeLoad.edgeId);
    if (edge && edge.nodeIds.length >= 2) {
      return convertEdgeNodeIdsToNodalForces(mesh, edge.nodeIds, edgeLoad.px, edgeLoad.py);
    }
  }

  // If edge is a number (polygon edge index), find nodes along that polygon edge
  if (typeof edgeLoad.edge === 'number') {
    return convertPolygonEdgeLoadToNodalForces(mesh, plate, edgeLoad.edge, edgeLoad.px, edgeLoad.py);
  }

  const edgeNodeIds = plate.edges[edgeLoad.edge].nodeIds;
  if (edgeNodeIds.length < 2) return [];

  // Get positions of edge nodes
  const positions: { nodeId: number; pos: number }[] = [];
  for (const nodeId of edgeNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;

    // Compute position along edge (parametric)
    let pos: number;
    if (edgeLoad.edge === 'bottom' || edgeLoad.edge === 'top') {
      pos = node.x;
    } else {
      pos = node.y;
    }
    positions.push({ nodeId, pos });
  }

  // Sort by position
  positions.sort((a, b) => a.pos - b.pos);

  const forces: { nodeId: number; fx: number; fy: number }[] = [];

  for (let i = 0; i < positions.length; i++) {
    // Tributary length: half the distance to neighbors on each side
    let tributaryLength = 0;

    if (i > 0) {
      tributaryLength += (positions[i].pos - positions[i - 1].pos) / 2;
    }
    if (i < positions.length - 1) {
      tributaryLength += (positions[i + 1].pos - positions[i].pos) / 2;
    }

    forces.push({
      nodeId: positions[i].nodeId,
      fx: edgeLoad.px * tributaryLength,
      fy: edgeLoad.py * tributaryLength
    });
  }

  return forces;
}

/**
 * Convert a polygon edge load to nodal forces.
 * Finds all mesh nodes that lie on the polygon edge between vertex[edgeIndex]
 * and vertex[(edgeIndex+1) % n], then distributes the load using tributary lengths.
 */
function convertPolygonEdgeLoadToNodalForces(
  mesh: Mesh,
  plate: IPlateRegion,
  edgeIndex: number,
  px: number,
  py: number
): { nodeId: number; fx: number; fy: number }[] {
  if (!plate.polygon || plate.polygon.length < 3) return [];

  const n = plate.polygon.length;
  const v1 = plate.polygon[edgeIndex % n];
  const v2 = plate.polygon[(edgeIndex + 1) % n];

  const edgeDx = v2.x - v1.x;
  const edgeDy = v2.y - v1.y;
  const edgeLenSq = edgeDx * edgeDx + edgeDy * edgeDy;
  if (edgeLenSq < 1e-12) return [];

  const edgeLen = Math.sqrt(edgeLenSq);
  const tolerance = edgeLen * 0.01 + 0.001;

  // Find all nodes on this edge using the boundary nodes or all plate nodes
  const candidateNodeIds = plate.boundaryNodeIds && plate.boundaryNodeIds.length > 0
    ? plate.boundaryNodeIds
    : plate.nodeIds;

  const positions: { nodeId: number; t: number }[] = [];
  for (const nodeId of candidateNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;

    // Check if the node lies on the segment v1->v2
    const dist = pointToSegmentDistanceFn(node.x, node.y, v1.x, v1.y, v2.x, v2.y);
    if (dist < tolerance) {
      // Compute parametric position along the edge
      const t = ((node.x - v1.x) * edgeDx + (node.y - v1.y) * edgeDy) / edgeLenSq;
      positions.push({ nodeId, t });
    }
  }

  if (positions.length < 2) return [];

  // Sort by parametric position
  positions.sort((a, b) => a.t - b.t);

  const forces: { nodeId: number; fx: number; fy: number }[] = [];
  for (let i = 0; i < positions.length; i++) {
    // Tributary length along the edge
    let tributaryLength = 0;
    if (i > 0) {
      tributaryLength += (positions[i].t - positions[i - 1].t) * edgeLen / 2;
    }
    if (i < positions.length - 1) {
      tributaryLength += (positions[i + 1].t - positions[i].t) * edgeLen / 2;
    }

    forces.push({
      nodeId: positions[i].nodeId,
      fx: px * tributaryLength,
      fy: py * tributaryLength
    });
  }

  return forces;
}

/** Point-to-segment distance (used by polygon edge load conversion) */
function pointToSegmentDistanceFn(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

/**
 * Convert a list of ordered node IDs along an edge to nodal forces using tributary lengths.
 */
export function convertEdgeNodeIdsToNodalForces(
  mesh: Mesh,
  nodeIds: number[],
  px: number,
  py: number
): { nodeId: number; fx: number; fy: number }[] {
  if (nodeIds.length < 2) return [];

  // Compute parametric positions from cumulative arc length
  const nodes = nodeIds.map(id => mesh.getNode(id)).filter((n): n is INode => n !== undefined);
  if (nodes.length < 2) return [];

  const cumDist: number[] = [0];
  for (let i = 1; i < nodes.length; i++) {
    const dx = nodes[i].x - nodes[i - 1].x;
    const dy = nodes[i].y - nodes[i - 1].y;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLen = cumDist[cumDist.length - 1];
  if (totalLen < 1e-12) return [];

  const forces: { nodeId: number; fx: number; fy: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let tributaryLength = 0;
    if (i > 0) {
      tributaryLength += (cumDist[i] - cumDist[i - 1]) / 2;
    }
    if (i < nodes.length - 1) {
      tributaryLength += (cumDist[i + 1] - cumDist[i]) / 2;
    }
    forces.push({
      nodeId: nodes[i].id,
      fx: px * tributaryLength,
      fy: py * tributaryLength,
    });
  }
  return forces;
}

export interface PolygonPlateConfig {
  outline: { x: number; y: number }[];
  voids?: { x: number; y: number }[][];
  meshSize: number;   // element edge length in meters
  materialId: number;
  thickness: number;
  quadOnly?: boolean; // if true, subdivide remaining triangles into quads (no mixed mesh)
}

/**
 * Generate a polygon plate mesh using a voxelized quad grid approach.
 * Creates a regular grid of quad elements within the polygon bounding box,
 * keeping only quads whose centroid lies inside the polygon (and outside voids).
 */
export function generatePolygonPlateMesh(mesh: Mesh, config: PolygonPlateConfig): IPlateRegion {
  const { outline, voids, meshSize, materialId, thickness } = config;

  // Compute bounding box
  const xs = outline.map(p => p.x);
  const ys = outline.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxX = minX;
  const bboxY = minY;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Compute grid divisions based on mesh size
  const nx = Math.max(1, Math.round(bboxW / meshSize));
  const ny = Math.max(1, Math.round(bboxH / meshSize));
  const dx = bboxW / nx;
  const dy = bboxH / ny;

  // Create grid nodes: (nx+1) x (ny+1)
  // nodeGrid[j][i] = nodeId at grid position (i, j)
  // We only create nodes that are needed (adjacent to kept quads)
  // First pass: determine which quads to keep
  const keepQuad: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    keepQuad[j] = [];
    for (let i = 0; i < nx; i++) {
      // Compute centroid of this quad cell
      const cx = bboxX + (i + 0.5) * dx;
      const cy = bboxY + (j + 0.5) * dy;

      // Check if centroid is inside the polygon
      let inside = pointInPolygon(cx, cy, outline);

      // Check if centroid is inside any void
      if (inside && voids) {
        for (const voidPoly of voids) {
          if (pointInPolygon(cx, cy, voidPoly)) {
            inside = false;
            break;
          }
        }
      }

      keepQuad[j][i] = inside;
    }
  }

  // Second pass: create nodes and quad elements for kept cells
  // Track which grid positions need nodes
  const nodeNeeded: boolean[][] = [];
  for (let j = 0; j <= ny; j++) {
    nodeNeeded[j] = new Array(nx + 1).fill(false);
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (keepQuad[j][i]) {
        nodeNeeded[j][i] = true;
        nodeNeeded[j][i + 1] = true;
        nodeNeeded[j + 1][i] = true;
        nodeNeeded[j + 1][i + 1] = true;
      }
    }
  }

  // Create nodes
  const nodeGrid: (number | null)[][] = [];
  const allNodeIds: number[] = [];
  for (let j = 0; j <= ny; j++) {
    nodeGrid[j] = [];
    for (let i = 0; i <= nx; i++) {
      if (nodeNeeded[j][i]) {
        const nodeX = bboxX + i * dx;
        const nodeY = bboxY + j * dy;
        const existing = mesh.findNodeAt(nodeX, nodeY, 0.001);
        if (existing) {
          nodeGrid[j][i] = existing.id;
          if (!allNodeIds.includes(existing.id)) {
            allNodeIds.push(existing.id);
          }
        } else {
          const newNode = mesh.addPlateNode(nodeX, nodeY);
          nodeGrid[j][i] = newNode.id;
          allNodeIds.push(newNode.id);
        }
      } else {
        nodeGrid[j][i] = null;
      }
    }
  }

  // Create quad elements for kept cells
  const allElementIds: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!keepQuad[j][i]) continue;
      const n0 = nodeGrid[j][i]!;       // BL
      const n1 = nodeGrid[j][i + 1]!;   // BR
      const n2 = nodeGrid[j + 1][i + 1]!; // TR
      const n3 = nodeGrid[j + 1][i]!;   // TL

      const q = mesh.addQuadElement([n0, n1, n2, n3], materialId, thickness);
      if (q) allElementIds.push(q.id);
    }
  }

  // Identify boundary nodes: nodes on the edge of the kept region
  // A node is on the boundary if it is on the edge of a kept quad that borders
  // a non-kept quad or the grid boundary
  const boundaryNodeIds: number[] = [];
  const boundarySet = new Set<number>();
  const tolerance = 0.001;
  for (const nodeId of allNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;
    if (isPointOnPolygonBoundary(node.x, node.y, outline, Math.max(dx, dy) * 0.6)) {
      boundarySet.add(nodeId);
      boundaryNodeIds.push(nodeId);
    }
  }

  // Also add nodes at the grid edges that border empty cells
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!keepQuad[j][i]) continue;
      const corners = [
        { nid: nodeGrid[j][i]!, side: 'bottom-left' },
        { nid: nodeGrid[j][i + 1]!, side: 'bottom-right' },
        { nid: nodeGrid[j + 1][i + 1]!, side: 'top-right' },
        { nid: nodeGrid[j + 1][i]!, side: 'top-left' },
      ];
      // Check if this quad borders empty space
      const isEdgeLeft = i === 0 || !keepQuad[j][i - 1];
      const isEdgeRight = i === nx - 1 || !keepQuad[j][i + 1];
      const isEdgeBottom = j === 0 || !keepQuad[j - 1][i];
      const isEdgeTop = j === ny - 1 || !keepQuad[j + 1][i];

      if (isEdgeBottom) { boundarySet.add(corners[0].nid); boundarySet.add(corners[1].nid); }
      if (isEdgeRight) { boundarySet.add(corners[1].nid); boundarySet.add(corners[2].nid); }
      if (isEdgeTop) { boundarySet.add(corners[2].nid); boundarySet.add(corners[3].nid); }
      if (isEdgeLeft) { boundarySet.add(corners[3].nid); boundarySet.add(corners[0].nid); }
    }
  }
  // Rebuild boundary list without duplicates
  const finalBoundaryNodeIds = Array.from(boundarySet);

  // Classify boundary nodes into edges based on bbox proximity
  const edgeTol = Math.max(dx, dy) * 0.6 + tolerance;
  const bottomEdge: number[] = [];
  const topEdge: number[] = [];
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];

  for (const nodeId of finalBoundaryNodeIds) {
    const node = mesh.getNode(nodeId)!;
    if (Math.abs(node.y - bboxY) < edgeTol) bottomEdge.push(nodeId);
    if (Math.abs(node.y - (bboxY + bboxH)) < edgeTol) topEdge.push(nodeId);
    if (Math.abs(node.x - bboxX) < edgeTol) leftEdge.push(nodeId);
    if (Math.abs(node.x - (bboxX + bboxW)) < edgeTol) rightEdge.push(nodeId);
  }

  // Sort edges
  const sortByX = (a: number, b: number) => (mesh.getNode(a)!.x - mesh.getNode(b)!.x);
  const sortByY = (a: number, b: number) => (mesh.getNode(a)!.y - mesh.getNode(b)!.y);
  bottomEdge.sort(sortByX);
  topEdge.sort(sortByX);
  leftEdge.sort(sortByY);
  rightEdge.sort(sortByY);

  // Corner nodes: find boundary nodes closest to bbox corners
  const findClosest = (tx: number, ty: number): number => {
    let bestId = allNodeIds[0];
    let bestDist = Infinity;
    const candidates = finalBoundaryNodeIds.length > 0 ? finalBoundaryNodeIds : allNodeIds;
    for (const nodeId of candidates) {
      const node = mesh.getNode(nodeId)!;
      const d = (node.x - tx) ** 2 + (node.y - ty) ** 2;
      if (d < bestDist) { bestDist = d; bestId = nodeId; }
    }
    return bestId;
  };

  const cornerNodeIds: [number, number, number, number] = [
    findClosest(bboxX, bboxY),             // BL
    findClosest(bboxX + bboxW, bboxY),     // BR
    findClosest(bboxX + bboxW, bboxY + bboxH), // TR
    findClosest(bboxX, bboxY + bboxH),     // TL
  ];

  return {
    id: 0, // Will be assigned by Mesh.addPlateRegion
    x: bboxX,
    y: bboxY,
    width: bboxW,
    height: bboxH,
    divisionsX: nx,
    divisionsY: ny,
    materialId,
    thickness,
    elementType: 'quad',
    nodeIds: allNodeIds,
    cornerNodeIds,
    elementIds: allElementIds,
    edges: {
      bottom: { nodeIds: bottomEdge },
      top: { nodeIds: topEdge },
      left: { nodeIds: leftEdge },
      right: { nodeIds: rightEdge },
    },
    isPolygon: true,
    polygon: [...outline],
    voids: voids ? voids.map(v => [...v]) : undefined,
    meshSize,
    boundaryNodeIds: finalBoundaryNodeIds,
  };
}

/**
 * Generate a boundary-conforming polygon plate mesh using CDT + triangle-to-quad pairing.
 * Returns a mixed mesh (quads + remaining triangles).
 * Also creates IEdge objects for each polygon edge.
 */
export async function generatePolygonPlateMeshV2(mesh: Mesh, config: PolygonPlateConfig): Promise<IPlateRegion> {
  const { outline, voids, meshSize, materialId, thickness, quadOnly } = config;

  // Compute bounding box
  const xs = outline.map(p => p.x);
  const ys = outline.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Target max area based on meshSize
  const maxArea = (meshSize * meshSize * Math.sqrt(3)) / 4 * 2;

  // Triangulate with boundary subdivision
  const triResult = await triangulatePolygon({
    outline,
    voids,
    maxArea,
    minAngle: 20,
    meshSize,
  });

  // Pair triangles into quads (optionally subdivide remaining triangles for quad-only mesh)
  let meshPoints: { x: number; y: number }[];
  let quads: [number, number, number, number][];
  let remainingTriangles: [number, number, number][];

  if (quadOnly) {
    const quadOnlyResult = pairTrianglesToQuadsOnly({
      points: triResult.points,
      triangles: triResult.triangles,
    });
    meshPoints = quadOnlyResult.points;
    quads = quadOnlyResult.quads;
    remainingTriangles = [];
  } else {
    const pairResult = pairTrianglesToQuads({
      points: triResult.points,
      triangles: triResult.triangles,
    });
    meshPoints = triResult.points;
    quads = pairResult.quads;
    remainingTriangles = pairResult.remainingTriangles;
  }

  // Create mesh nodes (reuse existing via findNodeAt)
  const pointToNodeId = new Map<number, number>();
  const allNodeIds: number[] = [];

  for (let i = 0; i < meshPoints.length; i++) {
    const pt = meshPoints[i];
    const existing = mesh.findNodeAt(pt.x, pt.y, 0.001);
    if (existing) {
      pointToNodeId.set(i, existing.id);
      if (!allNodeIds.includes(existing.id)) {
        allNodeIds.push(existing.id);
      }
    } else {
      const newNode = mesh.addPlateNode(pt.x, pt.y);
      pointToNodeId.set(i, newNode.id);
      allNodeIds.push(newNode.id);
    }
  }

  // Create quad elements
  const allElementIds: number[] = [];
  for (const quad of quads) {
    const nids: [number, number, number, number] = [
      pointToNodeId.get(quad[0])!,
      pointToNodeId.get(quad[1])!,
      pointToNodeId.get(quad[2])!,
      pointToNodeId.get(quad[3])!,
    ];
    const q = mesh.addQuadElement(nids, materialId, thickness);
    if (q) allElementIds.push(q.id);
  }

  // Create triangle elements for remaining unpaired triangles (only in mixed mode)
  for (const tri of remainingTriangles) {
    const nids: [number, number, number] = [
      pointToNodeId.get(tri[0])!,
      pointToNodeId.get(tri[1])!,
      pointToNodeId.get(tri[2])!,
    ];
    const t = mesh.addTriangleElement(nids, materialId, thickness);
    if (t) allElementIds.push(t.id);
  }

  // --- Build IEdge objects from segment markers ---
  // Group segments by polygon edge index (marker is 1-based, 0 = internal/void)
  const edgePointSets = new Map<number, Set<number>>(); // edgeIndex → set of point indices
  if (triResult.segmentMarkers) {
    for (let si = 0; si < triResult.segments.length; si++) {
      const marker = triResult.segmentMarkers[si];
      if (marker <= 0) continue; // skip internal/void segments
      const edgeIdx = marker - 1; // convert to 0-based
      if (!edgePointSets.has(edgeIdx)) edgePointSets.set(edgeIdx, new Set());
      const set = edgePointSets.get(edgeIdx)!;
      set.add(triResult.segments[si][0]);
      set.add(triResult.segments[si][1]);
    }
  }

  // Also detect boundary nodes by proximity to polygon edges (fallback if no markers)
  if (edgePointSets.size === 0) {
    for (let ei = 0; ei < outline.length; ei++) {
      const v1 = outline[ei];
      const v2 = outline[(ei + 1) % outline.length];
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const edgeLenSq = dx * dx + dy * dy;
      if (edgeLenSq < 1e-12) continue;
      const edgeLen = Math.sqrt(edgeLenSq);
      const tol = edgeLen * 0.01 + 0.001;

      const ptSet = new Set<number>();
      for (let pi = 0; pi < triResult.points.length; pi++) {
        const pt = triResult.points[pi];
        const dist = pointToSegmentDistanceFn(pt.x, pt.y, v1.x, v1.y, v2.x, v2.y);
        if (dist < tol) ptSet.add(pi);
      }
      if (ptSet.size >= 2) edgePointSets.set(ei, ptSet);
    }
  }

  const edgeIds: number[] = [];
  const boundaryNodeSet = new Set<number>();

  for (let ei = 0; ei < outline.length; ei++) {
    const v1 = outline[ei];
    const v2 = outline[(ei + 1) % outline.length];
    const ptSet = edgePointSets.get(ei);
    if (!ptSet || ptSet.size < 2) continue;

    // Sort points along the edge parametrically
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLenSq = dx * dx + dy * dy;

    const sorted = Array.from(ptSet).sort((a, b) => {
      const pa = triResult.points[a];
      const pb = triResult.points[b];
      const ta = ((pa.x - v1.x) * dx + (pa.y - v1.y) * dy) / edgeLenSq;
      const tb = ((pb.x - v1.x) * dx + (pb.y - v1.y) * dy) / edgeLenSq;
      return ta - tb;
    });

    const edgeNodeIds = sorted.map(pi => pointToNodeId.get(pi)!);
    for (const nid of edgeNodeIds) boundaryNodeSet.add(nid);

    const edge = mesh.addEdge({
      plateId: 0,  // will be set after plate is added
      vertexStart: { x: v1.x, y: v1.y },
      vertexEnd: { x: v2.x, y: v2.y },
      nodeIds: edgeNodeIds,
      polygonEdgeIndex: ei,
    });
    edgeIds.push(edge.id);
  }

  const boundaryNodeIds = Array.from(boundaryNodeSet);

  // Corner nodes: closest boundary nodes to bbox corners
  const findClosest = (tx: number, ty: number): number => {
    let bestId = allNodeIds[0];
    let bestDist = Infinity;
    const candidates = boundaryNodeIds.length > 0 ? boundaryNodeIds : allNodeIds;
    for (const nodeId of candidates) {
      const node = mesh.getNode(nodeId);
      if (!node) continue;
      const d = (node.x - tx) ** 2 + (node.y - ty) ** 2;
      if (d < bestDist) { bestDist = d; bestId = nodeId; }
    }
    return bestId;
  };

  const cornerNodeIds: [number, number, number, number] = [
    findClosest(minX, minY),
    findClosest(maxX, minY),
    findClosest(maxX, maxY),
    findClosest(minX, maxY),
  ];

  // Build named edges from boundary nodes for backward compat
  const edgeTol = meshSize * 0.6 + 0.001;
  const bottomEdge: number[] = [];
  const topEdge: number[] = [];
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (const nodeId of boundaryNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;
    if (Math.abs(node.y - minY) < edgeTol) bottomEdge.push(nodeId);
    if (Math.abs(node.y - maxY) < edgeTol) topEdge.push(nodeId);
    if (Math.abs(node.x - minX) < edgeTol) leftEdge.push(nodeId);
    if (Math.abs(node.x - maxX) < edgeTol) rightEdge.push(nodeId);
  }
  const sortByX = (a: number, b: number) => (mesh.getNode(a)!.x - mesh.getNode(b)!.x);
  const sortByY = (a: number, b: number) => (mesh.getNode(a)!.y - mesh.getNode(b)!.y);
  bottomEdge.sort(sortByX);
  topEdge.sort(sortByX);
  leftEdge.sort(sortByY);
  rightEdge.sort(sortByY);

  const plate: IPlateRegion = {
    id: 0,
    x: minX,
    y: minY,
    width: bboxW,
    height: bboxH,
    divisionsX: 0,
    divisionsY: 0,
    materialId,
    thickness,
    elementType: quadOnly ? 'quad' : 'mixed',
    nodeIds: allNodeIds,
    cornerNodeIds,
    elementIds: allElementIds,
    edges: {
      bottom: { nodeIds: bottomEdge },
      top: { nodeIds: topEdge },
      left: { nodeIds: leftEdge },
      right: { nodeIds: rightEdge },
    },
    edgeIds,
    isPolygon: true,
    polygon: [...outline],
    voids: voids ? voids.map(v => [...v]) : undefined,
    meshSize,
    boundaryNodeIds,
    quadOnly,
  };

  return plate;
}

/**
 * After adding a plate region, update the plateId on its IEdge objects.
 */
export function fixupEdgePlateIds(mesh: Mesh, plate: IPlateRegion): void {
  if (plate.edgeIds) {
    for (const edgeId of plate.edgeIds) {
      const edge = mesh.getEdge(edgeId);
      if (edge) edge.plateId = plate.id;
    }
  }
}

/**
 * Create IEdge objects for a rectangular plate (after mesh generation).
 */
export function createEdgesForRectPlate(mesh: Mesh, plate: IPlateRegion): void {
  const bl = mesh.getNode(plate.cornerNodeIds[0]);
  const br = mesh.getNode(plate.cornerNodeIds[1]);
  const tr = mesh.getNode(plate.cornerNodeIds[2]);
  const tl = mesh.getNode(plate.cornerNodeIds[3]);
  if (!bl || !br || !tr || !tl) return;

  const edgeDefs: Array<{
    name: 'bottom' | 'top' | 'left' | 'right';
    start: { x: number; y: number };
    end: { x: number; y: number };
    nodeIds: number[];
  }> = [
    { name: 'bottom', start: { x: bl.x, y: bl.y }, end: { x: br.x, y: br.y }, nodeIds: plate.edges.bottom.nodeIds },
    { name: 'top', start: { x: tl.x, y: tl.y }, end: { x: tr.x, y: tr.y }, nodeIds: plate.edges.top.nodeIds },
    { name: 'left', start: { x: bl.x, y: bl.y }, end: { x: tl.x, y: tl.y }, nodeIds: plate.edges.left.nodeIds },
    { name: 'right', start: { x: br.x, y: br.y }, end: { x: tr.x, y: tr.y }, nodeIds: plate.edges.right.nodeIds },
  ];

  const edgeIds: number[] = [];
  for (const def of edgeDefs) {
    const edge = mesh.addEdge({
      plateId: plate.id,
      vertexStart: def.start,
      vertexEnd: def.end,
      nodeIds: [...def.nodeIds],
      namedEdge: def.name,
    });
    edgeIds.push(edge.id);
  }
  plate.edgeIds = edgeIds;
}

/**
 * Check if a point lies on any segment of a polygon outline.
 */
function isPointOnPolygonBoundary(px: number, py: number, polygon: { x: number; y: number }[], tolerance: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dist = pointToSegmentDistance(px, py, a.x, a.y, b.x, b.y);
    if (dist < tolerance) return true;
  }
  return false;
}

function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

/**
 * Point-in-polygon test using ray casting algorithm.
 * Works for both convex and concave polygons.
 */
export function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute the centroid of a polygon.
 */
export function polygonCentroid(polygon: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0, cy = 0, area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const cross = polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
    area += cross;
    cx += (polygon[j].x + polygon[i].x) * cross;
    cy += (polygon[j].y + polygon[i].y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    // Degenerate: fallback to simple average
    const sx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
    const sy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
    return { x: sx, y: sy };
  }
  cx /= (6 * area);
  cy /= (6 * area);
  return { x: cx, y: cy };
}

/**
 * Compute the signed area of a polygon.
 */
export function polygonArea(polygon: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
  }
  return Math.abs(area * 0.5);
}

/**
 * Re-mesh a rectangular plate region after a corner node has been dragged.
 * Reads current corner node positions, removes old interior nodes/elements,
 * and regenerates the mesh grid to fit the new quadrilateral shape.
 *
 * For a general quadrilateral (non-axis-aligned after drag), the mesh is
 * generated using bilinear interpolation between the four corner positions.
 */
export function remeshPlateRegion(mesh: Mesh, plateId: number): void {
  const plate = mesh.getPlateRegion(plateId);
  if (!plate || plate.isPolygon) return;

  const [blId, brId, trId, tlId] = plate.cornerNodeIds;
  const bl = mesh.getNode(blId);
  const br = mesh.getNode(brId);
  const tr = mesh.getNode(trId);
  const tl = mesh.getNode(tlId);
  if (!bl || !br || !tr || !tl) return;

  // Save corner node constraints and loads so they are preserved
  const cornerData = new Map<number, { constraints: INode['constraints']; loads: INode['loads'] }>();
  for (const cId of plate.cornerNodeIds) {
    const n = mesh.getNode(cId);
    if (n) {
      cornerData.set(cId, {
        constraints: { ...n.constraints },
        loads: { ...n.loads },
      });
    }
  }

  const cornerSet = new Set(plate.cornerNodeIds);

  // --- Remove old elements ---
  for (const elemId of plate.elementIds) {
    mesh.elements.delete(elemId);
  }

  // --- Remove old interior nodes (not corner, not shared) ---
  const otherPlateNodeIds = new Set<number>();
  for (const [id, otherPlate] of mesh.plateRegions) {
    if (id === plateId) continue;
    for (const nodeId of otherPlate.nodeIds) {
      otherPlateNodeIds.add(nodeId);
    }
  }
  const beamNodeIds = new Set<number>();
  for (const beam of mesh.beamElements.values()) {
    beamNodeIds.add(beam.nodeIds[0]);
    beamNodeIds.add(beam.nodeIds[1]);
  }
  const remainingTriNodeIds = new Set<number>();
  for (const elem of mesh.elements.values()) {
    for (const nodeId of elem.nodeIds) {
      remainingTriNodeIds.add(nodeId);
    }
  }

  for (const nodeId of plate.nodeIds) {
    if (cornerSet.has(nodeId)) continue; // keep corners
    if (otherPlateNodeIds.has(nodeId)) continue;
    if (beamNodeIds.has(nodeId)) continue;
    if (remainingTriNodeIds.has(nodeId)) continue;
    mesh.nodes.delete(nodeId);
  }

  // --- Regenerate mesh using bilinear interpolation ---
  const nx = plate.divisionsX;
  const ny = plate.divisionsY;
  const { materialId, thickness, elementType } = plate;
  const elemTypeActual = elementType ?? 'quad';

  const nodeGrid: number[][] = [];
  const allNodeIds: number[] = [];

  for (let j = 0; j <= ny; j++) {
    nodeGrid[j] = [];
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const v = j / ny;

      // Bilinear interpolation of the four corners
      const nodeX = (1 - u) * (1 - v) * bl.x + u * (1 - v) * br.x + u * v * tr.x + (1 - u) * v * tl.x;
      const nodeY = (1 - u) * (1 - v) * bl.y + u * (1 - v) * br.y + u * v * tr.y + (1 - u) * v * tl.y;

      // Map corners to existing corner nodes
      if (i === 0 && j === 0) {
        nodeGrid[j][i] = blId;
      } else if (i === nx && j === 0) {
        nodeGrid[j][i] = brId;
      } else if (i === nx && j === ny) {
        nodeGrid[j][i] = trId;
      } else if (i === 0 && j === ny) {
        nodeGrid[j][i] = tlId;
      } else {
        const newNode = mesh.addPlateNode(nodeX, nodeY);
        nodeGrid[j][i] = newNode.id;
      }

      if (!allNodeIds.includes(nodeGrid[j][i])) {
        allNodeIds.push(nodeGrid[j][i]);
      }
    }
  }

  // Create elements
  const allElementIds: number[] = [];

  if (elemTypeActual === 'quad') {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];
        const n1 = nodeGrid[j][i + 1];
        const n2 = nodeGrid[j + 1][i + 1];
        const n3 = nodeGrid[j + 1][i];
        const q = mesh.addQuadElement([n0, n1, n2, n3], materialId, thickness);
        if (q) allElementIds.push(q.id);
      }
    }
  } else {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];
        const n1 = nodeGrid[j][i + 1];
        const n2 = nodeGrid[j + 1][i + 1];
        const n3 = nodeGrid[j + 1][i];
        const t1 = mesh.addTriangleElement([n0, n1, n2], materialId, thickness);
        if (t1) allElementIds.push(t1.id);
        const t2 = mesh.addTriangleElement([n0, n2, n3], materialId, thickness);
        if (t2) allElementIds.push(t2.id);
      }
    }
  }

  // Build edges
  const bottomEdge: number[] = [];
  for (let i = 0; i <= nx; i++) bottomEdge.push(nodeGrid[0][i]);
  const topEdge: number[] = [];
  for (let i = 0; i <= nx; i++) topEdge.push(nodeGrid[ny][i]);
  const leftEdge: number[] = [];
  for (let j = 0; j <= ny; j++) leftEdge.push(nodeGrid[j][0]);
  const rightEdge: number[] = [];
  for (let j = 0; j <= ny; j++) rightEdge.push(nodeGrid[j][nx]);

  // Update the plate region bounding box based on current corner positions
  const allXs = [bl.x, br.x, tr.x, tl.x];
  const allYs = [bl.y, br.y, tr.y, tl.y];

  // Update plate region in-place
  plate.x = Math.min(...allXs);
  plate.y = Math.min(...allYs);
  plate.width = Math.max(...allXs) - plate.x;
  plate.height = Math.max(...allYs) - plate.y;
  plate.nodeIds = allNodeIds;
  plate.elementIds = allElementIds;
  plate.edges = {
    bottom: { nodeIds: bottomEdge },
    top: { nodeIds: topEdge },
    left: { nodeIds: leftEdge },
    right: { nodeIds: rightEdge },
  };

  // Restore corner node constraints and loads
  for (const [cId, data] of cornerData) {
    mesh.updateNode(cId, { constraints: data.constraints, loads: data.loads });
  }

  // --- Update IEdge nodeIds for this plate ---
  if (plate.edgeIds) {
    const namedEdgeMap: Record<string, number[]> = {
      bottom: bottomEdge,
      top: topEdge,
      left: leftEdge,
      right: rightEdge,
    };
    for (const edgeId of plate.edgeIds) {
      const edge = mesh.getEdge(edgeId);
      if (!edge) continue;
      if (edge.namedEdge && namedEdgeMap[edge.namedEdge]) {
        edge.nodeIds = [...namedEdgeMap[edge.namedEdge]];
        // Update vertex positions from corners
        if (edge.namedEdge === 'bottom') {
          edge.vertexStart = { x: bl.x, y: bl.y };
          edge.vertexEnd = { x: br.x, y: br.y };
        } else if (edge.namedEdge === 'top') {
          edge.vertexStart = { x: tl.x, y: tl.y };
          edge.vertexEnd = { x: tr.x, y: tr.y };
        } else if (edge.namedEdge === 'left') {
          edge.vertexStart = { x: bl.x, y: bl.y };
          edge.vertexEnd = { x: tl.x, y: tl.y };
        } else if (edge.namedEdge === 'right') {
          edge.vertexStart = { x: br.x, y: br.y };
          edge.vertexEnd = { x: tr.x, y: tr.y };
        }
      }
    }
  }
}

/**
 * Re-mesh a polygon plate region after a vertex node has been dragged.
 * Uses boundary-conforming CDT + tri-to-quad pairing so that the mesh
 * boundary exactly follows the polygon shape.
 *
 * @param draggedNodeId The node that was dragged (must be a polygon vertex node)
 */
export async function remeshPolygonPlateRegion(mesh: Mesh, plateId: number, draggedNodeId: number): Promise<void> {
  const plate = mesh.getPlateRegion(plateId);
  if (!plate || !plate.isPolygon || !plate.polygon) return;

  const polygon = plate.polygon;
  const boundaryNodeIds = plate.boundaryNodeIds ?? plate.nodeIds;

  // Find which polygon vertex corresponds to the dragged node.
  let draggedVertexIndex = -1;
  for (let vi = 0; vi < polygon.length; vi++) {
    const vx = polygon[vi].x;
    const vy = polygon[vi].y;
    let bestDist = Infinity;
    let bestNodeId = -1;
    for (const nodeId of boundaryNodeIds) {
      const node = mesh.getNode(nodeId);
      if (!node) continue;
      const d = (node.x - vx) ** 2 + (node.y - vy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestNodeId = nodeId;
      }
    }
    if (bestNodeId === draggedNodeId) {
      draggedVertexIndex = vi;
      break;
    }
  }

  if (draggedVertexIndex === -1) return;

  // Update the polygon vertex to the dragged node's new position
  const draggedNode = mesh.getNode(draggedNodeId);
  if (!draggedNode) return;
  polygon[draggedVertexIndex] = { x: draggedNode.x, y: draggedNode.y };

  // Save constraints/loads on all boundary vertex nodes for preservation
  const vertexNodeData = new Map<number, { constraints: INode['constraints']; loads: INode['loads'] }>();
  const vertexNodeIds: number[] = [];
  for (let vi = 0; vi < polygon.length; vi++) {
    const vx = polygon[vi].x;
    const vy = polygon[vi].y;
    let bestDist = Infinity;
    let bestNodeId = -1;
    for (const nodeId of boundaryNodeIds) {
      const node = mesh.getNode(nodeId);
      if (!node) continue;
      const d = (node.x - vx) ** 2 + (node.y - vy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestNodeId = nodeId;
      }
    }
    vertexNodeIds.push(bestNodeId);
    if (bestNodeId >= 0) {
      const n = mesh.getNode(bestNodeId);
      if (n) {
        vertexNodeData.set(bestNodeId, {
          constraints: { ...n.constraints },
          loads: { ...n.loads },
        });
      }
    }
  }

  const vertexNodeSet = new Set(vertexNodeIds.filter(id => id >= 0));

  // --- Remove old elements ---
  for (const elemId of plate.elementIds) {
    mesh.elements.delete(elemId);
  }

  // --- Remove old interior nodes (not vertex, not shared) ---
  const otherPlateNodeIds = new Set<number>();
  for (const [id, otherPlate] of mesh.plateRegions) {
    if (id === plateId) continue;
    for (const nodeId of otherPlate.nodeIds) {
      otherPlateNodeIds.add(nodeId);
    }
  }
  const beamNodeIdsSet = new Set<number>();
  for (const beam of mesh.beamElements.values()) {
    beamNodeIdsSet.add(beam.nodeIds[0]);
    beamNodeIdsSet.add(beam.nodeIds[1]);
  }
  const remainingElemNodeIds = new Set<number>();
  for (const elem of mesh.elements.values()) {
    for (const nodeId of elem.nodeIds) {
      remainingElemNodeIds.add(nodeId);
    }
  }

  for (const nodeId of plate.nodeIds) {
    if (vertexNodeSet.has(nodeId)) continue;
    if (otherPlateNodeIds.has(nodeId)) continue;
    if (beamNodeIdsSet.has(nodeId)) continue;
    if (remainingElemNodeIds.has(nodeId)) continue;
    mesh.nodes.delete(nodeId);
  }

  // --- Remove old IEdge objects for this plate ---
  mesh.removeEdgesForPlate(plateId);

  // --- Regenerate using boundary-conforming CDT + tri-to-quad pairing ---
  const meshSizeVal = plate.meshSize ?? 0.5;
  const maxArea = (meshSizeVal * meshSizeVal * Math.sqrt(3)) / 4 * 2;

  const triResult = await triangulatePolygon({
    outline: polygon,
    voids: plate.voids,
    maxArea,
    minAngle: 20,
    meshSize: meshSizeVal,
  });

  const pairResult = pairTrianglesToQuads({
    points: triResult.points,
    triangles: triResult.triangles,
  });

  // Create mesh nodes (reuse existing via findNodeAt)
  const pointToNodeId = new Map<number, number>();
  const allNodeIds: number[] = [];

  for (let i = 0; i < triResult.points.length; i++) {
    const pt = triResult.points[i];
    const existing = mesh.findNodeAt(pt.x, pt.y, 0.001);
    if (existing) {
      pointToNodeId.set(i, existing.id);
      if (!allNodeIds.includes(existing.id)) {
        allNodeIds.push(existing.id);
      }
    } else {
      const newNode = mesh.addPlateNode(pt.x, pt.y);
      pointToNodeId.set(i, newNode.id);
      allNodeIds.push(newNode.id);
    }
  }

  // Create quad elements
  const allElementIds: number[] = [];
  for (const quad of pairResult.quads) {
    const nids: [number, number, number, number] = [
      pointToNodeId.get(quad[0])!,
      pointToNodeId.get(quad[1])!,
      pointToNodeId.get(quad[2])!,
      pointToNodeId.get(quad[3])!,
    ];
    const q = mesh.addQuadElement(nids, plate.materialId, plate.thickness);
    if (q) allElementIds.push(q.id);
  }

  // Create triangle elements for remaining unpaired triangles
  for (const tri of pairResult.remainingTriangles) {
    const nids: [number, number, number] = [
      pointToNodeId.get(tri[0])!,
      pointToNodeId.get(tri[1])!,
      pointToNodeId.get(tri[2])!,
    ];
    const t = mesh.addTriangleElement(nids, plate.materialId, plate.thickness);
    if (t) allElementIds.push(t.id);
  }

  // --- Build IEdge objects from segment markers ---
  const edgePointSets = new Map<number, Set<number>>();
  if (triResult.segmentMarkers) {
    for (let si = 0; si < triResult.segments.length; si++) {
      const marker = triResult.segmentMarkers[si];
      if (marker <= 0) continue;
      const edgeIdx = marker - 1;
      if (!edgePointSets.has(edgeIdx)) edgePointSets.set(edgeIdx, new Set());
      const set = edgePointSets.get(edgeIdx)!;
      set.add(triResult.segments[si][0]);
      set.add(triResult.segments[si][1]);
    }
  }

  // Fallback: detect boundary nodes by proximity if no markers
  if (edgePointSets.size === 0) {
    for (let ei = 0; ei < polygon.length; ei++) {
      const v1 = polygon[ei];
      const v2 = polygon[(ei + 1) % polygon.length];
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const edgeLenSq = dx * dx + dy * dy;
      if (edgeLenSq < 1e-12) continue;
      const edgeLen = Math.sqrt(edgeLenSq);
      const tol = edgeLen * 0.01 + 0.001;

      const ptSet = new Set<number>();
      for (let pi = 0; pi < triResult.points.length; pi++) {
        const pt = triResult.points[pi];
        const dist = pointToSegmentDistanceFnLocal(pt.x, pt.y, v1.x, v1.y, v2.x, v2.y);
        if (dist < tol) ptSet.add(pi);
      }
      if (ptSet.size >= 2) edgePointSets.set(ei, ptSet);
    }
  }

  const newEdgeIds: number[] = [];
  const boundaryNodeSet = new Set<number>();

  for (let ei = 0; ei < polygon.length; ei++) {
    const v1 = polygon[ei];
    const v2 = polygon[(ei + 1) % polygon.length];
    const ptSet = edgePointSets.get(ei);
    if (!ptSet || ptSet.size < 2) continue;

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLenSq = dx * dx + dy * dy;

    const sorted = Array.from(ptSet).sort((a, b) => {
      const pa = triResult.points[a];
      const pb = triResult.points[b];
      const ta = ((pa.x - v1.x) * dx + (pa.y - v1.y) * dy) / edgeLenSq;
      const tb = ((pb.x - v1.x) * dx + (pb.y - v1.y) * dy) / edgeLenSq;
      return ta - tb;
    });

    const edgeNodeIds = sorted.map(pi => pointToNodeId.get(pi)!);
    for (const nid of edgeNodeIds) boundaryNodeSet.add(nid);

    const edge = mesh.addEdge({
      plateId,
      vertexStart: { x: v1.x, y: v1.y },
      vertexEnd: { x: v2.x, y: v2.y },
      nodeIds: edgeNodeIds,
      polygonEdgeIndex: ei,
    });
    newEdgeIds.push(edge.id);
  }

  const newBoundaryNodeIds = Array.from(boundaryNodeSet);

  // Recompute bounding box from updated polygon
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Corner nodes
  const findClosest = (tx: number, ty: number): number => {
    let bestId = allNodeIds[0];
    let bestDist = Infinity;
    const candidates = newBoundaryNodeIds.length > 0 ? newBoundaryNodeIds : allNodeIds;
    for (const nodeId of candidates) {
      const node = mesh.getNode(nodeId);
      if (!node) continue;
      const d = (node.x - tx) ** 2 + (node.y - ty) ** 2;
      if (d < bestDist) { bestDist = d; bestId = nodeId; }
    }
    return bestId;
  };

  const newCornerNodeIds: [number, number, number, number] = [
    findClosest(minX, minY),
    findClosest(maxX, minY),
    findClosest(maxX, maxY),
    findClosest(minX, maxY),
  ];

  // Named edges for backward compat
  const edgeTol = meshSizeVal * 0.6 + 0.001;
  const bottomEdge: number[] = [];
  const topEdge: number[] = [];
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (const nodeId of newBoundaryNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;
    if (Math.abs(node.y - minY) < edgeTol) bottomEdge.push(nodeId);
    if (Math.abs(node.y - maxY) < edgeTol) topEdge.push(nodeId);
    if (Math.abs(node.x - minX) < edgeTol) leftEdge.push(nodeId);
    if (Math.abs(node.x - maxX) < edgeTol) rightEdge.push(nodeId);
  }
  const sortByX = (a: number, b: number) => (mesh.getNode(a)!.x - mesh.getNode(b)!.x);
  const sortByY = (a: number, b: number) => (mesh.getNode(a)!.y - mesh.getNode(b)!.y);
  bottomEdge.sort(sortByX);
  topEdge.sort(sortByX);
  leftEdge.sort(sortByY);
  rightEdge.sort(sortByY);

  // Update plate region in-place
  plate.x = minX;
  plate.y = minY;
  plate.width = bboxW;
  plate.height = bboxH;
  plate.divisionsX = 0;
  plate.divisionsY = 0;
  plate.nodeIds = allNodeIds;
  plate.cornerNodeIds = newCornerNodeIds;
  plate.elementIds = allElementIds;
  plate.elementType = 'mixed';
  plate.edges = {
    bottom: { nodeIds: bottomEdge },
    top: { nodeIds: topEdge },
    left: { nodeIds: leftEdge },
    right: { nodeIds: rightEdge },
  };
  plate.edgeIds = newEdgeIds;
  plate.polygon = polygon.map(p => ({ ...p }));
  plate.boundaryNodeIds = newBoundaryNodeIds;

  // Restore vertex node constraints and loads
  for (const [nId, data] of vertexNodeData) {
    if (mesh.getNode(nId)) {
      mesh.updateNode(nId, { constraints: data.constraints, loads: data.loads });
    }
  }
}

/** Local point-to-segment distance helper for remesh edge update */
function pointToSegmentDistanceFnLocal(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

/**
 * Check if a point lies on a line segment within a given tolerance.
 */
export function isPointOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number, tolerance: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2) < tolerance;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const dist = Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
  return dist < tolerance;
}

/**
 * Re-mesh a polygon plate from its updated contour.
 * The polygon vertices (plate.polygon) are assumed to already have been updated.
 * Removes all existing elements and interior nodes, then regenerates via CDT.
 *
 * @param edgeDragDelta When provided, constraints/loads on the old edge position
 *   are saved at their new (shifted) position to preserve them after remeshing.
 */
export async function remeshPolygonPlateRegionFromContour(
  mesh: Mesh,
  plateId: number,
  edgeDragDelta?: { edgeIndex: number; dx: number; dy: number }
): Promise<void> {
  const plate = mesh.getPlateRegion(plateId);
  if (!plate || !plate.isPolygon || !plate.polygon) {
    return;
  }

  const polygon = plate.polygon;

  // Save constraints/loads on all current nodes
  // When edgeDragDelta is provided, nodes on the old edge (before drag) have their
  // save position shifted by (dx, dy) so they match the new edge after remeshing.
  const nodeConstraints = new Map<string, { constraints: INode['constraints']; loads: INode['loads'] }>();
  for (const nodeId of plate.nodeIds) {
    const n = mesh.getNode(nodeId);
    if (n && (n.constraints.x || n.constraints.y || n.constraints.rotation || n.loads.fx || n.loads.fy || n.loads.moment)) {
      let saveX = n.x;
      let saveY = n.y;

      if (edgeDragDelta) {
        // Compute old edge vertex positions (current polygon positions minus delta)
        const ei = edgeDragDelta.edgeIndex;
        const ei2 = (ei + 1) % polygon.length;
        const oldV1x = polygon[ei].x - edgeDragDelta.dx;
        const oldV1y = polygon[ei].y - edgeDragDelta.dy;
        const oldV2x = polygon[ei2].x - edgeDragDelta.dx;
        const oldV2y = polygon[ei2].y - edgeDragDelta.dy;
        const meshSizeVal = plate.meshSize ?? 0.5;
        const tol = meshSizeVal * 0.6 + 0.001;

        if (isPointOnSegment(n.x, n.y, oldV1x, oldV1y, oldV2x, oldV2y, tol)) {
          saveX = n.x + edgeDragDelta.dx;
          saveY = n.y + edgeDragDelta.dy;
        }
      }

      const key = `${saveX.toFixed(6)},${saveY.toFixed(6)}`;
      nodeConstraints.set(key, {
        constraints: { ...n.constraints },
        loads: { ...n.loads },
      });
    }
  }

  // --- Remove all elements ---
  for (const elemId of plate.elementIds) {
    mesh.elements.delete(elemId);
  }

  // --- Remove ALL plate nodes (including boundary/vertex) ---
  const otherPlateNodeIds = new Set<number>();
  for (const [id, otherPlate] of mesh.plateRegions) {
    if (id === plateId) continue;
    for (const nodeId of otherPlate.nodeIds) {
      otherPlateNodeIds.add(nodeId);
    }
  }
  const beamNodeIdsSet = new Set<number>();
  for (const beam of mesh.beamElements.values()) {
    beamNodeIdsSet.add(beam.nodeIds[0]);
    beamNodeIdsSet.add(beam.nodeIds[1]);
  }
  const remainingElemNodeIds = new Set<number>();
  for (const elem of mesh.elements.values()) {
    for (const nodeId of elem.nodeIds) {
      remainingElemNodeIds.add(nodeId);
    }
  }

  for (const nodeId of plate.nodeIds) {
    if (otherPlateNodeIds.has(nodeId)) continue;
    if (beamNodeIdsSet.has(nodeId)) continue;
    if (remainingElemNodeIds.has(nodeId)) continue;
    mesh.nodes.delete(nodeId);
  }

  // --- Remove old IEdge objects ---
  mesh.removeEdgesForPlate(plateId);

  // --- Regenerate using CDT + tri-to-quad ---
  const meshSizeVal = plate.meshSize ?? 0.5;
  const maxArea = (meshSizeVal * meshSizeVal * Math.sqrt(3)) / 4 * 2;

  const triResult = await triangulatePolygon({
    outline: polygon,
    voids: plate.voids,
    maxArea,
    minAngle: 20,
    meshSize: meshSizeVal,
  });

  const pairResult = pairTrianglesToQuads({
    points: triResult.points,
    triangles: triResult.triangles,
  });

  // Create mesh nodes
  const pointToNodeId = new Map<number, number>();
  const allNodeIds: number[] = [];

  for (let i = 0; i < triResult.points.length; i++) {
    const pt = triResult.points[i];
    const existing = mesh.findNodeAt(pt.x, pt.y, 0.001);
    if (existing) {
      pointToNodeId.set(i, existing.id);
      if (!allNodeIds.includes(existing.id)) allNodeIds.push(existing.id);
    } else {
      const newNode = mesh.addPlateNode(pt.x, pt.y);
      pointToNodeId.set(i, newNode.id);
      allNodeIds.push(newNode.id);
    }
  }

  // Restore constraints/loads on matching positions
  for (const nodeId of allNodeIds) {
    const n = mesh.getNode(nodeId);
    if (!n) continue;
    const key = `${n.x.toFixed(6)},${n.y.toFixed(6)}`;
    const saved = nodeConstraints.get(key);
    if (saved) {
      mesh.updateNode(nodeId, { constraints: saved.constraints, loads: saved.loads });
    }
  }

  // Create elements
  const allElementIds: number[] = [];
  for (const quad of pairResult.quads) {
    const nids: [number, number, number, number] = [
      pointToNodeId.get(quad[0])!, pointToNodeId.get(quad[1])!,
      pointToNodeId.get(quad[2])!, pointToNodeId.get(quad[3])!,
    ];
    const q = mesh.addQuadElement(nids, plate.materialId, plate.thickness);
    if (q) allElementIds.push(q.id);
  }
  for (const tri of pairResult.remainingTriangles) {
    const nids: [number, number, number] = [
      pointToNodeId.get(tri[0])!, pointToNodeId.get(tri[1])!, pointToNodeId.get(tri[2])!,
    ];
    const t = mesh.addTriangleElement(nids, plate.materialId, plate.thickness);
    if (t) allElementIds.push(t.id);
  }

  // --- Build IEdge objects ---
  const edgePointSets = new Map<number, Set<number>>();
  if (triResult.segmentMarkers) {
    for (let si = 0; si < triResult.segments.length; si++) {
      const marker = triResult.segmentMarkers[si];
      if (marker <= 0) continue;
      const edgeIdx = marker - 1;
      if (!edgePointSets.has(edgeIdx)) edgePointSets.set(edgeIdx, new Set());
      const set = edgePointSets.get(edgeIdx)!;
      set.add(triResult.segments[si][0]);
      set.add(triResult.segments[si][1]);
    }
  }
  if (edgePointSets.size === 0) {
    for (let ei = 0; ei < polygon.length; ei++) {
      const v1 = polygon[ei];
      const v2 = polygon[(ei + 1) % polygon.length];
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const edgeLenSq = dx * dx + dy * dy;
      if (edgeLenSq < 1e-12) continue;
      const edgeLen = Math.sqrt(edgeLenSq);
      const tol = edgeLen * 0.01 + 0.001;
      const ptSet = new Set<number>();
      for (let pi = 0; pi < triResult.points.length; pi++) {
        const pt = triResult.points[pi];
        const dist = pointToSegmentDistanceFnLocal(pt.x, pt.y, v1.x, v1.y, v2.x, v2.y);
        if (dist < tol) ptSet.add(pi);
      }
      if (ptSet.size >= 2) edgePointSets.set(ei, ptSet);
    }
  }

  const newEdgeIds: number[] = [];
  const boundaryNodeSet = new Set<number>();
  for (let ei = 0; ei < polygon.length; ei++) {
    const v1 = polygon[ei];
    const v2 = polygon[(ei + 1) % polygon.length];
    const ptSet = edgePointSets.get(ei);
    if (!ptSet || ptSet.size < 2) continue;
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLenSq = dx * dx + dy * dy;
    const sorted = Array.from(ptSet).sort((a, b) => {
      const pa = triResult.points[a];
      const pb = triResult.points[b];
      return (((pa.x - v1.x) * dx + (pa.y - v1.y) * dy) - ((pb.x - v1.x) * dx + (pb.y - v1.y) * dy)) / edgeLenSq;
    });
    const edgeNodeIds = sorted.map(pi => pointToNodeId.get(pi)!);
    for (const nid of edgeNodeIds) boundaryNodeSet.add(nid);
    const edge = mesh.addEdge({
      plateId,
      vertexStart: { x: v1.x, y: v1.y },
      vertexEnd: { x: v2.x, y: v2.y },
      nodeIds: edgeNodeIds,
      polygonEdgeIndex: ei,
    });
    newEdgeIds.push(edge.id);
  }

  const newBoundaryNodeIds = Array.from(boundaryNodeSet);

  // Bounding box
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Corner nodes
  const findClosest = (tx: number, ty: number): number => {
    let bestId = allNodeIds[0];
    let bestDist = Infinity;
    const candidates = newBoundaryNodeIds.length > 0 ? newBoundaryNodeIds : allNodeIds;
    for (const nodeId of candidates) {
      const node = mesh.getNode(nodeId);
      if (!node) continue;
      const d = (node.x - tx) ** 2 + (node.y - ty) ** 2;
      if (d < bestDist) { bestDist = d; bestId = nodeId; }
    }
    return bestId;
  };

  // Named edges
  const edgeTol = meshSizeVal * 0.6 + 0.001;
  const bottomEdge: number[] = [];
  const topEdge: number[] = [];
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (const nodeId of newBoundaryNodeIds) {
    const node = mesh.getNode(nodeId);
    if (!node) continue;
    if (Math.abs(node.y - minY) < edgeTol) bottomEdge.push(nodeId);
    if (Math.abs(node.y - maxY) < edgeTol) topEdge.push(nodeId);
    if (Math.abs(node.x - minX) < edgeTol) leftEdge.push(nodeId);
    if (Math.abs(node.x - maxX) < edgeTol) rightEdge.push(nodeId);
  }
  const sortByX = (a: number, b: number) => (mesh.getNode(a)!.x - mesh.getNode(b)!.x);
  const sortByY = (a: number, b: number) => (mesh.getNode(a)!.y - mesh.getNode(b)!.y);
  bottomEdge.sort(sortByX);
  topEdge.sort(sortByX);
  leftEdge.sort(sortByY);
  rightEdge.sort(sortByY);

  // Update plate in-place
  plate.x = minX;
  plate.y = minY;
  plate.width = bboxW;
  plate.height = bboxH;
  plate.divisionsX = 0;
  plate.divisionsY = 0;
  plate.nodeIds = allNodeIds;
  plate.cornerNodeIds = [
    findClosest(minX, minY), findClosest(maxX, minY),
    findClosest(maxX, maxY), findClosest(minX, maxY),
  ];
  plate.elementIds = allElementIds;
  plate.elementType = 'mixed';
  plate.edges = {
    bottom: { nodeIds: bottomEdge }, top: { nodeIds: topEdge },
    left: { nodeIds: leftEdge }, right: { nodeIds: rightEdge },
  };
  plate.edgeIds = newEdgeIds;
  plate.polygon = polygon.map(p => ({ ...p }));
  plate.boundaryNodeIds = newBoundaryNodeIds;
}

/**
 * Find the plate region that has the given node as a corner node (rectangular)
 * or as a polygon vertex node (polygon). Returns the plate ID and whether it's
 * a polygon vertex, or null if the node is not a plate corner/vertex.
 */
export function findPlateCornerForNode(
  mesh: Mesh,
  nodeId: number
): { plateId: number; isPolygonVertex: boolean } | null {
  for (const [plateId, plate] of mesh.plateRegions) {
    // Check rectangular plate corners
    if (!plate.isPolygon && plate.cornerNodeIds.includes(nodeId)) {
      return { plateId, isPolygonVertex: false };
    }

    // Check polygon plate vertex nodes
    if (plate.isPolygon && plate.polygon) {
      const boundaryNodeIds = plate.boundaryNodeIds ?? plate.nodeIds;
      // Check if this node is a polygon vertex node
      for (let vi = 0; vi < plate.polygon.length; vi++) {
        const vx = plate.polygon[vi].x;
        const vy = plate.polygon[vi].y;
        let bestDist = Infinity;
        let bestNodeId = -1;
        for (const bid of boundaryNodeIds) {
          const bn = mesh.getNode(bid);
          if (!bn) continue;
          const d = (bn.x - vx) ** 2 + (bn.y - vy) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestNodeId = bid;
          }
        }
        if (bestNodeId === nodeId) {
          return { plateId, isPolygonVertex: true };
        }
      }
    }
  }
  return null;
}

/**
 * Remove a plate region and all its elements.
 * Interior-only nodes (not shared with beams or other plates) are also removed.
 */
export function removePlateRegion(mesh: Mesh, plateId: number): void {
  const plate = mesh.getPlateRegion(plateId);
  if (!plate) return;

  // Remove all triangle elements belonging to this plate
  for (const elemId of plate.elementIds) {
    mesh.elements.delete(elemId);
  }

  // Determine which nodes are "interior-only" (not used by beams or other plates)
  const otherPlateNodeIds = new Set<number>();
  for (const [id, otherPlate] of mesh.plateRegions) {
    if (id === plateId) continue;
    for (const nodeId of otherPlate.nodeIds) {
      otherPlateNodeIds.add(nodeId);
    }
  }

  const beamNodeIds = new Set<number>();
  for (const beam of mesh.beamElements.values()) {
    beamNodeIds.add(beam.nodeIds[0]);
    beamNodeIds.add(beam.nodeIds[1]);
  }

  // Also check remaining triangle elements (not part of this plate)
  const remainingTriNodeIds = new Set<number>();
  for (const elem of mesh.elements.values()) {
    for (const nodeId of elem.nodeIds) {
      remainingTriNodeIds.add(nodeId);
    }
  }

  for (const nodeId of plate.nodeIds) {
    if (otherPlateNodeIds.has(nodeId)) continue;
    if (beamNodeIds.has(nodeId)) continue;
    if (remainingTriNodeIds.has(nodeId)) continue;
    mesh.nodes.delete(nodeId);
  }

  // Remove edges for this plate
  mesh.removeEdgesForPlate(plateId);

  // Remove the plate region itself
  mesh.plateRegions.delete(plateId);
}
