/**
 * TriangleService — singleton wrapper around triangle-wasm (Shewchuk's Triangle)
 * Provides polygon triangulation for plate meshing.
 */

// triangle-wasm is a CJS module, imported dynamically
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let triangleLib: any = null;

let initPromise: Promise<void> | null = null;

/**
 * Lazy-load and initialize the WASM module (once).
 */
async function ensureInit(): Promise<void> {
  if (triangleLib) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[TriangleService] Initializing WASM module...');
    try {
      const lib = await import('triangle-wasm');
      const mod = lib.default ?? lib;
      // The WASM file is served from public/
      const wasmPath = new URL('/triangle.out.wasm', window.location.origin).href;
      console.log('[TriangleService] Loading WASM from:', wasmPath);
      await mod.init(wasmPath);
      triangleLib = mod;
      console.log('[TriangleService] WASM module initialized successfully');
    } catch (err) {
      console.error('[TriangleService] WASM initialization failed:', err);
      throw err;
    }
  })();

  return initPromise;
}

export interface TriangulateInput {
  outline: { x: number; y: number }[];
  voids?: { x: number; y: number }[][];
  maxArea?: number;
  minAngle?: number;
  meshSize?: number;  // element edge length — enables boundary subdivision
}

export interface TriangulateResult {
  points: { x: number; y: number }[];
  triangles: [number, number, number][];
  segments: [number, number][];
  segmentMarkers?: number[];  // per output segment: polygon edge index (1-based, 0 = internal)
}

/**
 * Build a PSLG (Planar Straight Line Graph) from polygon outline + voids.
 * Returns flat arrays suitable for triangle-wasm IO.
 */
function buildPSLG(input: TriangulateInput): {
  pointlist: number[];
  segmentlist: number[];
  segmentmarkerlist: number[];
  holelist: number[];
} {
  const pointlist: number[] = [];
  const segmentlist: number[] = [];
  const segmentmarkerlist: number[] = [];
  const holelist: number[] = [];

  let ptOffset = 0;

  // Outline points and segments
  const outline = input.outline;
  for (const p of outline) {
    pointlist.push(p.x, p.y);
  }
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    segmentlist.push(ptOffset + i, ptOffset + next);
    // Mark outline segments with 1-based edge index (edge i → marker i+1)
    segmentmarkerlist.push(i + 1);
  }
  ptOffset += outline.length;

  // Void polygons
  if (input.voids) {
    for (const voidPoly of input.voids) {
      for (const p of voidPoly) {
        pointlist.push(p.x, p.y);
      }
      for (let i = 0; i < voidPoly.length; i++) {
        const next = (i + 1) % voidPoly.length;
        segmentlist.push(ptOffset + i, ptOffset + next);
        segmentmarkerlist.push(0);  // void edges get marker 0
      }

      // Compute a point inside the void to mark as hole
      // Use signed-area centroid for better handling of non-convex polygons
      const holePoint = computeInteriorPoint(voidPoly);
      // Validate the hole point is inside the void polygon
      if (pointInPolygonLocal(holePoint.x, holePoint.y, voidPoly)) {
        holelist.push(holePoint.x, holePoint.y);
      } else {
        // Fallback: use simple centroid
        const cx = voidPoly.reduce((s, p) => s + p.x, 0) / voidPoly.length;
        const cy = voidPoly.reduce((s, p) => s + p.y, 0) / voidPoly.length;
        holelist.push(cx, cy);
        console.warn('buildPSLG: Void hole point fallback used');
      }

      ptOffset += voidPoly.length;
    }
  }

  return { pointlist, segmentlist, segmentmarkerlist, holelist };
}

/**
 * Build a subdivided PSLG: each polygon edge is split into segments of
 * approximately `meshSize` length. This ensures Triangle places nodes on the
 * boundary at regular intervals, giving a boundary-conforming mesh.
 */
function buildSubdividedPSLG(input: TriangulateInput, meshSize: number): {
  pointlist: number[];
  segmentlist: number[];
  segmentmarkerlist: number[];
  holelist: number[];
} {
  const pointlist: number[] = [];
  const segmentlist: number[] = [];
  const segmentmarkerlist: number[] = [];
  const holelist: number[] = [];

  let ptOffset = 0;

  // --- Outline subdivision with edge marker tracking ---
  const outlineStartOffset = ptOffset;
  const outlinePtEdgeMap: number[] = []; // for each point: which outline edge index

  for (let i = 0; i < input.outline.length; i++) {
    const v1 = input.outline[i];
    const v2 = input.outline[(i + 1) % input.outline.length];
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLen = Math.sqrt(dx * dx + dy * dy);
    const numSeg = Math.max(1, Math.round(edgeLen / meshSize));

    if (i === 0) {
      pointlist.push(v1.x, v1.y);
      outlinePtEdgeMap.push(i);
      ptOffset++;
    }

    for (let s = 1; s < numSeg; s++) {
      const t = s / numSeg;
      pointlist.push(v1.x + t * dx, v1.y + t * dy);
      outlinePtEdgeMap.push(i);
      ptOffset++;
    }

    if (i < input.outline.length - 1) {
      pointlist.push(v2.x, v2.y);
      outlinePtEdgeMap.push(i + 1 < input.outline.length ? i + 1 : 0);
      ptOffset++;
    }
  }

  const outlineTotalPts = ptOffset - outlineStartOffset;
  for (let j = 0; j < outlineTotalPts; j++) {
    const nextJ = (j + 1) % outlineTotalPts;
    segmentlist.push(outlineStartOffset + j, outlineStartOffset + nextJ);
    // The marker is 1-based edge index: edge at point j (since segments go forward)
    segmentmarkerlist.push(outlinePtEdgeMap[j] + 1);
  }

  // --- Void polygons ---
  if (input.voids) {
    for (const voidPoly of input.voids) {
      const voidStartOffset = ptOffset;

      for (let i = 0; i < voidPoly.length; i++) {
        const v1 = voidPoly[i];
        const v2 = voidPoly[(i + 1) % voidPoly.length];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const edgeLen = Math.sqrt(dx * dx + dy * dy);
        const numSeg = Math.max(1, Math.round(edgeLen / meshSize));

        if (i === 0) {
          pointlist.push(v1.x, v1.y);
          ptOffset++;
        }

        for (let s = 1; s < numSeg; s++) {
          const t = s / numSeg;
          pointlist.push(v1.x + t * dx, v1.y + t * dy);
          ptOffset++;
        }

        if (i < voidPoly.length - 1) {
          pointlist.push(v2.x, v2.y);
          ptOffset++;
        }
      }

      const voidTotalPts = ptOffset - voidStartOffset;
      for (let j = 0; j < voidTotalPts; j++) {
        const nextJ = (j + 1) % voidTotalPts;
        segmentlist.push(voidStartOffset + j, voidStartOffset + nextJ);
        segmentmarkerlist.push(0);  // void edges get marker 0
      }

      // Compute a point inside the void to mark as hole
      // Use signed-area centroid for better handling of non-convex polygons
      const holePoint = computeInteriorPoint(voidPoly);
      // Validate the hole point is inside the void polygon
      if (pointInPolygonLocal(holePoint.x, holePoint.y, voidPoly)) {
        holelist.push(holePoint.x, holePoint.y);
      } else {
        // Fallback: use simple centroid
        const cx = voidPoly.reduce((s, p) => s + p.x, 0) / voidPoly.length;
        const cy = voidPoly.reduce((s, p) => s + p.y, 0) / voidPoly.length;
        holelist.push(cx, cy);
        console.warn('buildSubdividedPSLG: Void hole point fallback used');
      }
    }
  }

  return { pointlist, segmentlist, segmentmarkerlist, holelist };
}

/**
 * Compute a point guaranteed to be inside a polygon.
 * Uses the signed-area weighted centroid, which works for non-convex polygons.
 * Falls back to inward sampling if centroid is outside.
 */
function computeInteriorPoint(polygon: { x: number; y: number }[]): { x: number; y: number } {
  // Compute signed-area weighted centroid
  let cx = 0, cy = 0, signedArea = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const cross = polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
    signedArea += cross;
    cx += (polygon[j].x + polygon[i].x) * cross;
    cy += (polygon[j].y + polygon[i].y) * cross;
  }
  signedArea *= 0.5;

  if (Math.abs(signedArea) > 1e-12) {
    cx /= (6 * signedArea);
    cy /= (6 * signedArea);

    // Verify centroid is inside using ray casting
    if (pointInPolygonLocal(cx, cy, polygon)) {
      return { x: cx, y: cy };
    }
  }

  // Fallback: find a point slightly inward from each vertex
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const next = polygon[(i + 1) % polygon.length];

    // Move slightly inward from vertex toward the midpoint of adjacent edges
    const midX = (prev.x + next.x) / 2;
    const midY = (prev.y + next.y) / 2;
    const inwardX = v.x + (midX - v.x) * 0.1;
    const inwardY = v.y + (midY - v.y) * 0.1;

    if (pointInPolygonLocal(inwardX, inwardY, polygon)) {
      return { x: inwardX, y: inwardY };
    }
  }

  // Last resort: simple average
  const avgX = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const avgY = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return { x: avgX, y: avgY };
}

/**
 * Point-in-polygon test using ray casting (local version for this module).
 */
function pointInPolygonLocal(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
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
 * Triangulate a polygon with optional voids using Shewchuk's Triangle.
 * When meshSize is provided, boundary edges are subdivided for conforming mesh.
 */
export async function triangulatePolygon(input: TriangulateInput): Promise<TriangulateResult> {
  console.log('[TriangleService] triangulatePolygon called with outline:', input.outline.length, 'vertices');
  await ensureInit();
  console.log('[TriangleService] WASM initialized, triangleLib:', triangleLib ? 'loaded' : 'null');

  const useMeshSize = input.meshSize !== undefined && input.meshSize > 0;
  const { pointlist, segmentlist, segmentmarkerlist, holelist } = useMeshSize
    ? buildSubdividedPSLG(input, input.meshSize!)
    : buildPSLG(input);

  // Build input IO
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputIO = triangleLib.makeIO({
    pointlist: new Float64Array(pointlist),
    segmentlist: new Int32Array(segmentlist),
    segmentmarkerlist: new Int32Array(segmentmarkerlist),
    ...(holelist.length > 0 ? { holelist: new Float64Array(holelist) } : {}),
  });

  const outputIO = triangleLib.makeIO({});

  // Build switches
  const switches: {
    pslg: boolean;
    quiet: boolean;
    ccdt: boolean;  // Conforming Constrained Delaunay - ensures segments are respected
    quality?: number;
    area?: number;
  } = {
    pslg: true,
    quiet: true,
    ccdt: true,  // Essential for voids/holes to work correctly with quality refinement
  };

  if (input.minAngle !== undefined && input.minAngle > 0) {
    switches.quality = input.minAngle;
  } else {
    switches.quality = 20; // default min angle
  }

  if (input.maxArea !== undefined && input.maxArea > 0) {
    switches.area = input.maxArea;
  }

  try {
    console.log('[TriangleService] Input PSLG:', {
      pointCount: pointlist.length / 2,
      segmentCount: segmentlist.length / 2,
      holeCount: holelist.length / 2,
      switches,
    });
    triangleLib.triangulate(switches, inputIO, outputIO);
    console.log('[TriangleService] Triangulation completed');

    // Read results
    const outPoints = outputIO.pointlist;
    const outTriangles = outputIO.trianglelist;
    const outSegments = outputIO.segmentlist;
    const outSegmentMarkers = outputIO.segmentmarkerlist;

    const points: { x: number; y: number }[] = [];
    if (outPoints) {
      for (let i = 0; i < outPoints.length; i += 2) {
        points.push({ x: outPoints[i], y: outPoints[i + 1] });
      }
    }

    const triangles: [number, number, number][] = [];
    if (outTriangles) {
      for (let i = 0; i < outTriangles.length; i += 3) {
        triangles.push([outTriangles[i], outTriangles[i + 1], outTriangles[i + 2]]);
      }
    }

    const segments: [number, number][] = [];
    const segmentMarkers: number[] = [];
    if (outSegments) {
      for (let i = 0; i < outSegments.length; i += 2) {
        segments.push([outSegments[i], outSegments[i + 1]]);
      }
    }
    if (outSegmentMarkers) {
      for (let i = 0; i < outSegmentMarkers.length; i++) {
        segmentMarkers.push(outSegmentMarkers[i]);
      }
    }

    console.log('[TriangleService] triangulatePolygon result:', {
      points: points.length,
      triangles: triangles.length,
      segments: segments.length,
    });
    return { points, triangles, segments, segmentMarkers };
  } finally {
    // Free memory
    triangleLib.freeIO(inputIO, true);
    triangleLib.freeIO(outputIO);
  }
}
