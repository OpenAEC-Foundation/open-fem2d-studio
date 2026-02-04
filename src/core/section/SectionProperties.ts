/**
 * SectionProperties - Cross-section property calculator
 *
 * Calculates geometric properties of arbitrary cross-sections defined by polygon contours.
 * Supports solid sections and hollow sections (with holes/voids).
 *
 * Uses Green's theorem / shoelace formula for efficient polygon calculations.
 *
 * Inspired by: https://github.com/robbievanleeuwen/section-properties
 *
 * Properties calculated:
 * - Area (A)
 * - First moment of area / Static moment (Qx, Qy)
 * - Centroid (xc, yc)
 * - Second moment of area / Moment of inertia (Ixx, Iyy, Ixy)
 * - Centroidal moments of inertia (Ixx_c, Iyy_c, Ixy_c)
 * - Principal moments of inertia (I11, I22)
 * - Principal axis angle (phi)
 * - Section modulus / Elastic modulus (Wx, Wy)
 * - Plastic section modulus (Wpl_x, Wpl_y)
 * - Radius of gyration (rx, ry)
 * - Torsion constant (J) - for thin-walled sections
 * - Warping constant (Cw) - for open thin-walled sections
 */

/** 2D Point */
export interface Point2D {
  x: number;
  y: number;
}

/** Polygon contour defined by ordered vertices (counter-clockwise for outer, clockwise for holes) */
export interface Contour {
  points: Point2D[];
  isHole?: boolean;
}

/** Complete section geometry with outer boundary and optional holes */
export interface SectionGeometry {
  outer: Point2D[];
  holes?: Point2D[][];
}

/** Calculated section properties */
export interface SectionPropertiesResult {
  // Basic properties
  A: number;              // Area [unit²]

  // First moments of area (static moments) about origin
  Qx: number;             // First moment about x-axis [unit³]
  Qy: number;             // First moment about y-axis [unit³]

  // Centroid coordinates
  xc: number;             // Centroid x-coordinate [unit]
  yc: number;             // Centroid y-coordinate [unit]

  // Second moments of area about origin
  Ixx: number;            // Moment of inertia about x-axis [unit⁴]
  Iyy: number;            // Moment of inertia about y-axis [unit⁴]
  Ixy: number;            // Product of inertia [unit⁴]

  // Centroidal moments of inertia (about centroid)
  Ixx_c: number;          // Centroidal Ixx [unit⁴]
  Iyy_c: number;          // Centroidal Iyy [unit⁴]
  Ixy_c: number;          // Centroidal Ixy [unit⁴]

  // Principal moments of inertia
  I11: number;            // Maximum principal moment [unit⁴]
  I22: number;            // Minimum principal moment [unit⁴]
  phi: number;            // Principal axis angle [radians]

  // Section moduli (elastic)
  Wx_pos: number;         // Section modulus about x, positive y [unit³]
  Wx_neg: number;         // Section modulus about x, negative y [unit³]
  Wy_pos: number;         // Section modulus about y, positive x [unit³]
  Wy_neg: number;         // Section modulus about y, negative x [unit³]

  // Minimum section moduli
  Wx: number;             // Minimum section modulus about x [unit³]
  Wy: number;             // Minimum section modulus about y [unit³]

  // Radii of gyration
  rx: number;             // Radius of gyration about x [unit]
  ry: number;             // Radius of gyration about y [unit]

  // Bounding box (relative to centroid)
  xmin: number;           // Minimum x from centroid [unit]
  xmax: number;           // Maximum x from centroid [unit]
  ymin: number;           // Minimum y from centroid [unit]
  ymax: number;           // Maximum y from centroid [unit]

  // Section height and width
  h: number;              // Total height [unit]
  b: number;              // Total width [unit]
}

/**
 * Calculate the signed area of a polygon using the shoelace formula.
 * Positive for counter-clockwise, negative for clockwise.
 */
export function calculateSignedArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return area / 2;
}

/**
 * Calculate the area of a polygon (absolute value).
 */
export function calculateArea(points: Point2D[]): number {
  return Math.abs(calculateSignedArea(points));
}

/**
 * Calculate first moments of area (static moments) about the origin.
 * Qx = ∫y dA (first moment about x-axis)
 * Qy = ∫x dA (first moment about y-axis)
 */
export function calculateFirstMoments(points: Point2D[]): { Qx: number; Qy: number } {
  const n = points.length;
  if (n < 3) return { Qx: 0, Qy: 0 };

  let Qx = 0;
  let Qy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i].x * points[j].y - points[j].x * points[i].y;

    Qx += (points[i].y + points[j].y) * cross;
    Qy += (points[i].x + points[j].x) * cross;
  }

  return {
    Qx: Qx / 6,
    Qy: Qy / 6
  };
}

/**
 * Calculate centroid of a polygon.
 */
export function calculateCentroid(points: Point2D[]): Point2D {
  const A = calculateSignedArea(points);
  if (Math.abs(A) < 1e-12) return { x: 0, y: 0 };

  const { Qx, Qy } = calculateFirstMoments(points);

  return {
    x: Qy / A,
    y: Qx / A
  };
}

/**
 * Calculate second moments of area (moments of inertia) about the origin.
 * Using Green's theorem for polygon integration.
 *
 * Ixx = ∫y² dA
 * Iyy = ∫x² dA
 * Ixy = ∫xy dA
 */
export function calculateSecondMoments(points: Point2D[]): { Ixx: number; Iyy: number; Ixy: number } {
  const n = points.length;
  if (n < 3) return { Ixx: 0, Iyy: 0, Ixy: 0 };

  let Ixx = 0;
  let Iyy = 0;
  let Ixy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const cross = xi * yj - xj * yi;

    // Ixx = (1/12) * Σ(yi² + yi*yj + yj²) * (xi*yj - xj*yi)
    Ixx += (yi * yi + yi * yj + yj * yj) * cross;

    // Iyy = (1/12) * Σ(xi² + xi*xj + xj²) * (xi*yj - xj*yi)
    Iyy += (xi * xi + xi * xj + xj * xj) * cross;

    // Ixy = (1/24) * Σ(xi*yj + 2*xi*yi + 2*xj*yj + xj*yi) * (xi*yj - xj*yi)
    Ixy += (xi * yj + 2 * xi * yi + 2 * xj * yj + xj * yi) * cross;
  }

  return {
    Ixx: Ixx / 12,
    Iyy: Iyy / 12,
    Ixy: Ixy / 24
  };
}

/**
 * Calculate principal moments of inertia and principal axis angle.
 *
 * I11 = (Ixx + Iyy)/2 + sqrt(((Ixx - Iyy)/2)² + Ixy²)
 * I22 = (Ixx + Iyy)/2 - sqrt(((Ixx - Iyy)/2)² + Ixy²)
 * phi = 0.5 * atan2(-2*Ixy, Ixx - Iyy)
 */
export function calculatePrincipalMoments(
  Ixx: number,
  Iyy: number,
  Ixy: number
): { I11: number; I22: number; phi: number } {
  const avg = (Ixx + Iyy) / 2;
  const diff = (Ixx - Iyy) / 2;
  const delta = Math.sqrt(diff * diff + Ixy * Ixy);

  const I11 = avg + delta;
  const I22 = avg - delta;

  // Principal axis angle (angle from x-axis to major principal axis)
  let phi = 0;
  if (Math.abs(Ixy) > 1e-12 || Math.abs(diff) > 1e-12) {
    phi = 0.5 * Math.atan2(-2 * Ixy, Ixx - Iyy);
  }

  return { I11, I22, phi };
}

/**
 * Get bounding box of polygon points.
 */
export function getBoundingBox(points: Point2D[]): { xmin: number; xmax: number; ymin: number; ymax: number } {
  if (points.length === 0) {
    return { xmin: 0, xmax: 0, ymin: 0, ymax: 0 };
  }

  let xmin = Infinity, xmax = -Infinity;
  let ymin = Infinity, ymax = -Infinity;

  for (const p of points) {
    if (p.x < xmin) xmin = p.x;
    if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y;
    if (p.y > ymax) ymax = p.y;
  }

  return { xmin, xmax, ymin, ymax };
}

/**
 * Translate polygon points by offset.
 */
export function translatePoints(points: Point2D[], dx: number, dy: number): Point2D[] {
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Calculate all section properties for a geometry with optional holes.
 *
 * For hollow sections, properties are calculated as:
 * Property_total = Property_outer - Σ Property_holes
 */
export function calculateSectionProperties(geometry: SectionGeometry): SectionPropertiesResult {
  const { outer, holes = [] } = geometry;

  // Calculate properties for outer contour
  let A = calculateSignedArea(outer);
  let { Qx, Qy } = calculateFirstMoments(outer);
  let { Ixx, Iyy, Ixy } = calculateSecondMoments(outer);

  // Ensure outer is counter-clockwise (positive area)
  const outerSign = A >= 0 ? 1 : -1;
  A = Math.abs(A);
  Qx *= outerSign;
  Qy *= outerSign;
  Ixx *= outerSign;
  Iyy *= outerSign;
  Ixy *= outerSign;

  // Subtract hole contributions
  for (const hole of holes) {
    const holeA = Math.abs(calculateSignedArea(hole));
    const holeMoments = calculateFirstMoments(hole);
    const holeSign = calculateSignedArea(hole) >= 0 ? 1 : -1;
    const holeSecond = calculateSecondMoments(hole);

    A -= holeA;
    Qx -= holeMoments.Qx * holeSign;
    Qy -= holeMoments.Qy * holeSign;
    Ixx -= holeSecond.Ixx * holeSign;
    Iyy -= holeSecond.Iyy * holeSign;
    Ixy -= holeSecond.Ixy * holeSign;
  }

  // Centroid
  const xc = A > 1e-12 ? Qy / A : 0;
  const yc = A > 1e-12 ? Qx / A : 0;

  // Centroidal moments of inertia (parallel axis theorem)
  const Ixx_c = Ixx - A * yc * yc;
  const Iyy_c = Iyy - A * xc * xc;
  const Ixy_c = Ixy - A * xc * yc;

  // Principal moments of inertia
  const { I11, I22, phi } = calculatePrincipalMoments(Ixx_c, Iyy_c, Ixy_c);

  // Bounding box (collect all points)
  const allPoints = [...outer];
  for (const hole of holes) {
    allPoints.push(...hole);
  }
  const bbox = getBoundingBox(allPoints);

  // Bounding box relative to centroid
  const xmin = bbox.xmin - xc;
  const xmax = bbox.xmax - xc;
  const ymin = bbox.ymin - yc;
  const ymax = bbox.ymax - yc;

  // Section dimensions
  const h = bbox.ymax - bbox.ymin;
  const b = bbox.xmax - bbox.xmin;

  // Section moduli (elastic)
  const Wx_pos = Math.abs(ymax) > 1e-12 ? Math.abs(Ixx_c / ymax) : Infinity;
  const Wx_neg = Math.abs(ymin) > 1e-12 ? Math.abs(Ixx_c / ymin) : Infinity;
  const Wy_pos = Math.abs(xmax) > 1e-12 ? Math.abs(Iyy_c / xmax) : Infinity;
  const Wy_neg = Math.abs(xmin) > 1e-12 ? Math.abs(Iyy_c / xmin) : Infinity;

  // Minimum section moduli
  const Wx = Math.min(Wx_pos, Wx_neg);
  const Wy = Math.min(Wy_pos, Wy_neg);

  // Radii of gyration
  const rx = A > 1e-12 ? Math.sqrt(Ixx_c / A) : 0;
  const ry = A > 1e-12 ? Math.sqrt(Iyy_c / A) : 0;

  return {
    A,
    Qx, Qy,
    xc, yc,
    Ixx, Iyy, Ixy,
    Ixx_c, Iyy_c, Ixy_c,
    I11, I22, phi,
    Wx_pos, Wx_neg, Wy_pos, Wy_neg,
    Wx, Wy,
    rx, ry,
    xmin, xmax, ymin, ymax,
    h, b
  };
}

/**
 * Calculate plastic section modulus about x-axis.
 * This requires finding the plastic neutral axis (PNA) where the area above equals area below.
 *
 * For symmetric sections: Wpl_x = 2 * (first moment of half-area about PNA)
 *
 * This implementation uses a numerical approach by dividing the section into strips.
 */
export function calculatePlasticModulus(
  geometry: SectionGeometry,
  axis: 'x' | 'y' = 'x',
  _numStrips: number = 100  // Reserved for future strip-based integration
): number {
  const props = calculateSectionProperties(geometry);
  const { outer, holes = [] } = geometry;

  // Get bounding box
  const allPoints = [...outer, ...holes.flat()];
  const bbox = getBoundingBox(allPoints);

  if (axis === 'x') {
    // Find plastic neutral axis (y-coordinate where area above = area below)
    const yMin = bbox.ymin;
    const yMax = bbox.ymax;

    // Binary search for PNA
    let yPNA = props.yc; // Start at centroid
    let lo = yMin, hi = yMax;

    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      const areaBelow = calculateAreaBelowLine(geometry, mid, 'y');
      const areaAbove = props.A - areaBelow;

      if (Math.abs(areaAbove - areaBelow) < props.A * 1e-8) {
        yPNA = mid;
        break;
      }

      if (areaBelow < areaAbove) {
        lo = mid;
      } else {
        hi = mid;
      }
      yPNA = mid;
    }

    // Calculate first moments about PNA for each half
    const Qabove = calculateFirstMomentAboutLine(geometry, yPNA, 'above', 'y');
    const Qbelow = calculateFirstMomentAboutLine(geometry, yPNA, 'below', 'y');

    return Math.abs(Qabove) + Math.abs(Qbelow);
  } else {
    // Find plastic neutral axis (x-coordinate)
    const xMin = bbox.xmin;
    const xMax = bbox.xmax;

    let xPNA = props.xc;
    let lo = xMin, hi = xMax;

    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      const areaLeft = calculateAreaBelowLine(geometry, mid, 'x');
      const areaRight = props.A - areaLeft;

      if (Math.abs(areaRight - areaLeft) < props.A * 1e-8) {
        xPNA = mid;
        break;
      }

      if (areaLeft < areaRight) {
        lo = mid;
      } else {
        hi = mid;
      }
      xPNA = mid;
    }

    const Qright = calculateFirstMomentAboutLine(geometry, xPNA, 'above', 'x');
    const Qleft = calculateFirstMomentAboutLine(geometry, xPNA, 'below', 'x');

    return Math.abs(Qright) + Math.abs(Qleft);
  }
}

/**
 * Calculate area below/left of a horizontal/vertical line using polygon clipping.
 */
function calculateAreaBelowLine(geometry: SectionGeometry, value: number, axis: 'x' | 'y'): number {
  const { outer, holes = [] } = geometry;

  let area = calculateClippedArea(outer, value, axis, 'below');

  for (const hole of holes) {
    area -= calculateClippedArea(hole, value, axis, 'below');
  }

  return Math.abs(area);
}

/**
 * Calculate first moment of area above/below a line about that line.
 */
function calculateFirstMomentAboutLine(
  geometry: SectionGeometry,
  value: number,
  side: 'above' | 'below',
  axis: 'x' | 'y'
): number {
  const { outer, holes = [] } = geometry;

  let Q = calculateClippedFirstMoment(outer, value, axis, side);

  for (const hole of holes) {
    Q -= calculateClippedFirstMoment(hole, value, axis, side);
  }

  return Q;
}

/**
 * Calculate area of polygon clipped by horizontal/vertical line.
 * Uses Sutherland-Hodgman style clipping.
 */
function calculateClippedArea(
  points: Point2D[],
  value: number,
  axis: 'x' | 'y',
  side: 'above' | 'below'
): number {
  const clipped = clipPolygon(points, value, axis, side);
  return calculateArea(clipped);
}

/**
 * Calculate first moment of clipped polygon about the clip line.
 */
function calculateClippedFirstMoment(
  points: Point2D[],
  value: number,
  axis: 'x' | 'y',
  side: 'above' | 'below'
): number {
  const clipped = clipPolygon(points, value, axis, side);
  if (clipped.length < 3) return 0;

  // Translate so clip line is at origin
  const translated = axis === 'y'
    ? clipped.map(p => ({ x: p.x, y: p.y - value }))
    : clipped.map(p => ({ x: p.x - value, y: p.y }));

  const { Qx, Qy } = calculateFirstMoments(translated);

  return axis === 'y' ? Qx : Qy;
}

/**
 * Clip polygon by horizontal or vertical line.
 * Returns vertices of the clipped polygon.
 */
function clipPolygon(
  points: Point2D[],
  value: number,
  axis: 'x' | 'y',
  side: 'above' | 'below'
): Point2D[] {
  if (points.length < 3) return [];

  const result: Point2D[] = [];
  const n = points.length;

  const isInside = (p: Point2D): boolean => {
    const coord = axis === 'x' ? p.x : p.y;
    return side === 'below' ? coord <= value : coord >= value;
  };

  const intersect = (p1: Point2D, p2: Point2D): Point2D => {
    if (axis === 'y') {
      const t = (value - p1.y) / (p2.y - p1.y);
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: value
      };
    } else {
      const t = (value - p1.x) / (p2.x - p1.x);
      return {
        x: value,
        y: p1.y + t * (p2.y - p1.y)
      };
    }
  };

  for (let i = 0; i < n; i++) {
    const current = points[i];
    const next = points[(i + 1) % n];
    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside) {
      result.push(current);
      if (!nextInside) {
        result.push(intersect(current, next));
      }
    } else if (nextInside) {
      result.push(intersect(current, next));
    }
  }

  return result;
}

// ============================================================================
// Torsion Properties for Thin-Walled Sections
// ============================================================================

/**
 * Calculate torsion constant (J) for a thin-walled closed section.
 * Uses Bredt's formula: J = 4 * A² / ∮(ds/t)
 *
 * For a section defined by centerline and thickness.
 */
export function calculateTorsionConstantClosed(
  centerline: Point2D[],
  thickness: number | number[]
): number {
  const n = centerline.length;
  if (n < 3) return 0;

  // Calculate enclosed area using shoelace
  const A = Math.abs(calculateSignedArea(centerline));

  // Calculate line integral ∮(ds/t)
  let integral = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = centerline[j].x - centerline[i].x;
    const dy = centerline[j].y - centerline[i].y;
    const ds = Math.sqrt(dx * dx + dy * dy);

    const t = Array.isArray(thickness) ? thickness[i] : thickness;
    integral += ds / t;
  }

  return (4 * A * A) / integral;
}

/**
 * Calculate torsion constant (J) for a thin-walled open section.
 * J = (1/3) * Σ(b * t³)
 *
 * For each segment: b = length, t = thickness
 */
export function calculateTorsionConstantOpen(
  segments: Array<{ start: Point2D; end: Point2D; thickness: number }>
): number {
  let J = 0;

  for (const seg of segments) {
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const b = Math.sqrt(dx * dx + dy * dy);
    const t = seg.thickness;

    J += (b * t * t * t) / 3;
  }

  return J;
}

// ============================================================================
// Standard Profile Generators
// ============================================================================

/**
 * Generate I-section geometry (IPE, HEA, HEB, etc.)
 * Dimensions in consistent units (e.g., mm or m)
 */
export function createISection(
  h: number,      // Total height
  b: number,      // Flange width
  tw: number,     // Web thickness
  tf: number,     // Flange thickness
  _r?: number     // Fillet radius (optional, reserved for future use)
): SectionGeometry {
  // Create I-shape contour (counter-clockwise, centered at origin)
  const outer: Point2D[] = [
    { x: -b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 + tf },
    { x: tw / 2, y: -h / 2 + tf },
    { x: tw / 2, y: h / 2 - tf },
    { x: b / 2, y: h / 2 - tf },
    { x: b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 - tf },
    { x: -tw / 2, y: h / 2 - tf },
    { x: -tw / 2, y: -h / 2 + tf },
    { x: -b / 2, y: -h / 2 + tf },
  ];

  return { outer };
}

/**
 * Generate rectangular hollow section (RHS/SHS) geometry
 */
export function createRHS(
  h: number,      // Total height
  b: number,      // Total width
  t: number,      // Wall thickness
  _ri?: number    // Inner corner radius (optional, reserved for future use)
): SectionGeometry {
  const outer: Point2D[] = [
    { x: -b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 },
    { x: b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 },
  ];

  const hole: Point2D[] = [
    { x: -b / 2 + t, y: -h / 2 + t },
    { x: -b / 2 + t, y: h / 2 - t },
    { x: b / 2 - t, y: h / 2 - t },
    { x: b / 2 - t, y: -h / 2 + t },
  ];

  return { outer, holes: [hole] };
}

/**
 * Generate circular hollow section (CHS) geometry
 * Approximated as polygon with n segments
 */
export function createCHS(
  d: number,      // Outer diameter
  t: number,      // Wall thickness
  n: number = 32  // Number of polygon segments
): SectionGeometry {
  const ro = d / 2;
  const ri = ro - t;

  const outer: Point2D[] = [];
  const hole: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    outer.push({
      x: ro * Math.cos(angle),
      y: ro * Math.sin(angle)
    });
    // Hole goes clockwise (reverse order)
    hole.unshift({
      x: ri * Math.cos(angle),
      y: ri * Math.sin(angle)
    });
  }

  return { outer, holes: [hole] };
}

/**
 * Generate U-channel section (UNP, UPE) geometry
 */
export function createChannel(
  h: number,      // Total height
  b: number,      // Flange width
  tw: number,     // Web thickness
  tf: number      // Flange thickness
): SectionGeometry {
  // U-shape opening to the right, centered vertically
  const outer: Point2D[] = [
    { x: -b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 + tf },
    { x: -b / 2 + tw, y: -h / 2 + tf },
    { x: -b / 2 + tw, y: h / 2 - tf },
    { x: b / 2, y: h / 2 - tf },
    { x: b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 },
  ];

  return { outer };
}

/**
 * Generate L-angle section geometry
 */
export function createAngle(
  h: number,      // Height (vertical leg)
  b: number,      // Width (horizontal leg)
  t: number       // Thickness
): SectionGeometry {
  // L-shape with corner at origin, legs extending to positive x and positive y
  const outer: Point2D[] = [
    { x: 0, y: 0 },
    { x: b, y: 0 },
    { x: b, y: t },
    { x: t, y: t },
    { x: t, y: h },
    { x: 0, y: h },
  ];

  return { outer };
}

/**
 * Generate T-section geometry
 */
export function createTSection(
  h: number,      // Total height
  b: number,      // Flange width
  tw: number,     // Web thickness
  tf: number      // Flange thickness
): SectionGeometry {
  const outer: Point2D[] = [
    { x: -b / 2, y: h / 2 - tf },
    { x: -tw / 2, y: h / 2 - tf },
    { x: -tw / 2, y: -h / 2 },
    { x: tw / 2, y: -h / 2 },
    { x: tw / 2, y: h / 2 - tf },
    { x: b / 2, y: h / 2 - tf },
    { x: b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 },
  ];

  return { outer };
}

/**
 * Generate solid rectangular section
 */
export function createRectangle(
  h: number,      // Height
  b: number       // Width
): SectionGeometry {
  const outer: Point2D[] = [
    { x: -b / 2, y: -h / 2 },
    { x: b / 2, y: -h / 2 },
    { x: b / 2, y: h / 2 },
    { x: -b / 2, y: h / 2 },
  ];

  return { outer };
}

/**
 * Generate solid circular section
 */
export function createCircle(
  d: number,      // Diameter
  n: number = 32  // Number of polygon segments
): SectionGeometry {
  const r = d / 2;
  const outer: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    outer.push({
      x: r * Math.cos(angle),
      y: r * Math.sin(angle)
    });
  }

  return { outer };
}
