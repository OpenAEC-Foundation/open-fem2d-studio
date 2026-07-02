/**
 * TriToQuad — Greedy triangle-to-quad pairing algorithm.
 * Merges pairs of adjacent triangles into quadrilateral elements
 * based on quality metrics.
 */

export interface TriToQuadInput {
  points: { x: number; y: number }[];
  triangles: [number, number, number][];
}

export interface TriToQuadResult {
  quads: [number, number, number, number][];
  remainingTriangles: [number, number, number][];
}

interface TrianglePair {
  t1: number;  // index into triangles array
  t2: number;
  sharedEdge: [number, number];
  quality: number;
}

/**
 * Compute the interior angle at vertex B in triangle A-B-C.
 */
function angleBetween(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): number {
  const v1x = ax - bx;
  const v1y = ay - by;
  const v2x = cx - bx;
  const v2y = cy - by;
  const dot = v1x * v2x + v1y * v2y;
  const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (len1 < 1e-12 || len2 < 1e-12) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  return Math.acos(cosA) * (180 / Math.PI);
}

/**
 * Check if a quadrilateral (p0, p1, p2, p3) in order is convex.
 */
function isConvexQuad(
  points: { x: number; y: number }[],
  a: number, b: number, c: number, d: number
): boolean {
  const pts = [points[a], points[b], points[c], points[d]];
  for (let i = 0; i < 4; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 4];
    const p2 = pts[(i + 2) % 4];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (cross < 0) return false; // not CCW → not convex
  }
  return true;
}

/**
 * Compute quad quality for 4 corner points.
 * Quality Q = min(angle) / 90° — ideal quad has Q = 1.0.
 * Returns -1 if quad is invalid (non-convex or extreme angles).
 */
function quadQuality(
  points: { x: number; y: number }[],
  a: number, b: number, c: number, d: number
): number {
  const ids = [a, b, c, d];
  const angles: number[] = [];

  for (let i = 0; i < 4; i++) {
    const prev = ids[(i + 3) % 4];
    const curr = ids[i];
    const next = ids[(i + 1) % 4];
    const angle = angleBetween(
      points[prev].x, points[prev].y,
      points[curr].x, points[curr].y,
      points[next].x, points[next].y
    );
    angles.push(angle);
  }

  const maxAngle = Math.max(...angles);
  const minAngle = Math.min(...angles);

  // Reject if any angle is too extreme
  if (maxAngle > 170 || minAngle < 10) return -1;

  // Check convexity
  if (!isConvexQuad(points, a, b, c, d)) return -1;

  return minAngle / 90;
}

/**
 * Merge two triangles sharing an edge into a quad.
 * Returns the 4 vertex indices in CCW order, or null if merge fails.
 *
 * Triangle t1 = [a, b, c], triangle t2 = [d, e, f]
 * Shared edge = [s1, s2]
 * Opposite vertices: opp1 (from t1), opp2 (from t2)
 * Result: [opp1, s1, opp2, s2] — we then verify CCW ordering.
 */
function mergeTriangles(
  points: { x: number; y: number }[],
  t1: [number, number, number],
  t2: [number, number, number],
  sharedEdge: [number, number]
): [number, number, number, number] | null {
  const [s1, s2] = sharedEdge;
  const opp1 = t1.find(v => v !== s1 && v !== s2);
  const opp2 = t2.find(v => v !== s1 && v !== s2);
  if (opp1 === undefined || opp2 === undefined) return null;

  // Try both orderings and pick the one that's CCW and convex
  const candidates: [number, number, number, number][] = [
    [opp1, s1, opp2, s2],
    [opp1, s2, opp2, s1],
  ];

  for (const quad of candidates) {
    // Check if it's CCW by computing signed area
    let signedArea = 0;
    for (let i = 0; i < 4; i++) {
      const curr = points[quad[i]];
      const next = points[quad[(i + 1) % 4]];
      signedArea += curr.x * next.y - next.x * curr.y;
    }

    if (signedArea > 0 && isConvexQuad(points, quad[0], quad[1], quad[2], quad[3])) {
      return quad;
    }
  }

  return null;
}

/**
 * Make an edge key string for lookup (order-independent).
 */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Pair triangles into quads using a greedy algorithm.
 *
 * 1. Build adjacency: per shared edge, record the two triangle indices
 * 2. For each pair, compute quad quality
 * 3. Sort by quality (descending)
 * 4. Greedily select pairs, marking used triangles
 * 5. Return quads + remaining unpaired triangles
 */
export function pairTrianglesToQuads(input: TriToQuadInput): TriToQuadResult {
  const { points, triangles } = input;

  if (triangles.length === 0) {
    return { quads: [], remainingTriangles: [] };
  }

  // Build edge → triangle adjacency
  const edgeToTriangles = new Map<string, number[]>();

  for (let ti = 0; ti < triangles.length; ti++) {
    const tri = triangles[ti];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = edgeKey(a, b);
      const list = edgeToTriangles.get(key);
      if (list) {
        list.push(ti);
      } else {
        edgeToTriangles.set(key, [ti]);
      }
    }
  }

  // Find candidate pairs
  const pairs: TrianglePair[] = [];

  for (const [key, triIndices] of edgeToTriangles) {
    if (triIndices.length !== 2) continue;

    const [t1, t2] = triIndices;
    const parts = key.split('-');
    const s1 = parseInt(parts[0]);
    const s2 = parseInt(parts[1]);

    const merged = mergeTriangles(points, triangles[t1], triangles[t2], [s1, s2]);
    if (!merged) continue;

    const q = quadQuality(points, merged[0], merged[1], merged[2], merged[3]);
    if (q <= 0) continue;

    pairs.push({
      t1,
      t2,
      sharedEdge: [s1, s2],
      quality: q,
    });
  }

  // Sort by quality descending
  pairs.sort((a, b) => b.quality - a.quality);

  // Greedy selection
  const used = new Set<number>();
  const quads: [number, number, number, number][] = [];

  for (const pair of pairs) {
    if (used.has(pair.t1) || used.has(pair.t2)) continue;

    const merged = mergeTriangles(points, triangles[pair.t1], triangles[pair.t2], pair.sharedEdge);
    if (!merged) continue;

    quads.push(merged);
    used.add(pair.t1);
    used.add(pair.t2);
  }

  // Collect remaining unpaired triangles
  const remainingTriangles: [number, number, number][] = [];
  for (let ti = 0; ti < triangles.length; ti++) {
    if (!used.has(ti)) {
      remainingTriangles.push(triangles[ti]);
    }
  }

  return { quads, remainingTriangles };
}

/**
 * Subdivide a single triangle into 3 quads by adding a center point and edge midpoints.
 * Returns 4 new points and 3 quads (indices relative to new points array start).
 *
 * For triangle [a, b, c], adds:
 *   - center point m at centroid
 *   - midpoints on each edge: m_ab, m_bc, m_ca
 * Creates 3 quads: [a, m_ab, m, m_ca], [b, m_bc, m, m_ab], [c, m_ca, m, m_bc]
 */
function subdivideTriangleToQuads(
  points: { x: number; y: number }[],
  tri: [number, number, number],
  newPointsStartIndex: number
): {
  newPoints: { x: number; y: number }[];
  quads: [number, number, number, number][];
} {
  const [a, b, c] = tri;
  const pa = points[a], pb = points[b], pc = points[c];

  // Centroid
  const cx = (pa.x + pb.x + pc.x) / 3;
  const cy = (pa.y + pb.y + pc.y) / 3;

  // Edge midpoints
  const mab = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const mbc = { x: (pb.x + pc.x) / 2, y: (pb.y + pc.y) / 2 };
  const mca = { x: (pc.x + pa.x) / 2, y: (pc.y + pa.y) / 2 };
  const center = { x: cx, y: cy };

  // New point indices
  const iMab = newPointsStartIndex;
  const iMbc = newPointsStartIndex + 1;
  const iMca = newPointsStartIndex + 2;
  const iCenter = newPointsStartIndex + 3;

  return {
    newPoints: [mab, mbc, mca, center],
    quads: [
      [a, iMab, iCenter, iMca],
      [b, iMbc, iCenter, iMab],
      [c, iMca, iCenter, iMbc]
    ]
  };
}

/**
 * Pair triangles into quads, then subdivide any remaining unpaired triangles
 * into 3 quads each. This guarantees a quad-only mesh with no remaining triangles.
 *
 * The subdivision adds 4 new points per remaining triangle:
 *   - 3 edge midpoints
 *   - 1 centroid
 *
 * @param input - Points and triangles from triangulation
 * @returns Points array (original + new) and quads array (no triangles)
 */
export function pairTrianglesToQuadsOnly(input: TriToQuadInput): {
  points: { x: number; y: number }[];
  quads: [number, number, number, number][];
} {
  const { points } = input;
  const result = pairTrianglesToQuads(input);

  if (result.remainingTriangles.length === 0) {
    return { points: [...points], quads: result.quads };
  }

  // Subdivide remaining triangles into quads
  const newPoints = [...points];
  const allQuads = [...result.quads];

  for (const tri of result.remainingTriangles) {
    const { newPoints: addedPts, quads: newQuads } = subdivideTriangleToQuads(
      newPoints,
      tri,
      newPoints.length
    );
    newPoints.push(...addedPts);
    allQuads.push(...newQuads);
  }

  return { points: newPoints, quads: allQuads };
}
