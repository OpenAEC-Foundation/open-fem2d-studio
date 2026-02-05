/**
 * Steel Profile Geometry Generators
 *
 * Parametric steel profiles with proper fillet radii.
 * Based on BuildingPy by Maarten Vroegindeweij & Jonathan van der Gouwe
 *
 * All dimensions are in consistent units (typically mm).
 * Profiles are centered at origin unless otherwise specified.
 */

import { Point2D, Line, Arc, PolyCurve, CurveSegment, SQRT2 } from './Geometry2D';

/** Base profile interface */
export interface ProfileGeometry {
  name: string;
  description: string;
  height: number;
  width: number;
  curve: PolyCurve;
  tw?: number;  // web thickness
  tf?: number;  // flange thickness
}

// ============================================================================
// I-Shape Profiles (IPE, HEA, HEB, HEM, W-shapes)
// ============================================================================

/**
 * I-Shape profile with parallel flanges and fillets
 * Standard European I-profiles (IPE, HEA, HEB, HEM)
 */
export function createIShapeParallelFlange(
  name: string,
  height: number,
  width: number,
  tw: number,
  tf: number,
  r: number  // web-flange fillet radius
): ProfileGeometry {
  const r1 = r / SQRT2;  // Fillet offset for 45° point

  // Define points (right side, then mirror)
  const p1 = new Point2D(width / 2, -height / 2);  // right bottom
  const p2 = new Point2D(width / 2, -height / 2 + tf);
  const p3 = new Point2D(tw / 2 + r, -height / 2 + tf);  // start arc
  const p4 = new Point2D(tw / 2 + r - r1, -height / 2 + tf + r - r1);  // mid arc
  const p5 = new Point2D(tw / 2, -height / 2 + tf + r);  // end arc
  const p6 = new Point2D(tw / 2, height / 2 - tf - r);  // start arc
  const p7 = new Point2D(tw / 2 + r - r1, height / 2 - tf - r + r1);  // mid arc
  const p8 = new Point2D(tw / 2 + r, height / 2 - tf);  // end arc
  const p9 = new Point2D(width / 2, height / 2 - tf);
  const p10 = new Point2D(width / 2, height / 2);  // right top

  // Mirror points for left side
  const p11 = p10.mirrorX();  // left top
  const p12 = p9.mirrorX();
  const p13 = p8.mirrorX();  // start arc
  const p14 = p7.mirrorX();  // mid arc
  const p15 = p6.mirrorX();  // end arc
  const p16 = p5.mirrorX();  // start arc
  const p17 = p4.mirrorX();  // mid arc
  const p18 = p3.mirrorX();  // end arc
  const p19 = p2.mirrorX();
  const p20 = p1.mirrorX();  // left bottom

  // Create curve segments
  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    new Line(p9, p10),
    new Line(p10, p11),
    new Line(p11, p12),
    new Line(p12, p13),
    Arc.byStartMidEnd(p13, p14, p15),
    new Line(p15, p16),
    Arc.byStartMidEnd(p16, p17, p18),
    new Line(p18, p19),
    new Line(p19, p20),
    new Line(p20, p1),
  ];

  return {
    name,
    description: 'I-Shape profile with parallel flanges',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Channel Profiles (UNP, UPE, C-profiles)
// ============================================================================

/**
 * C-Channel with parallel flanges
 */
export function createCChannelParallelFlange(
  name: string,
  height: number,
  width: number,
  tw: number,
  tf: number,
  r: number,  // web fillet radius
  ex: number  // centroid x offset from left
): ProfileGeometry {
  const p1 = new Point2D(-ex, -height / 2);  // left bottom
  const p2 = new Point2D(width - ex, -height / 2);  // right bottom
  const p3 = new Point2D(width - ex, -height / 2 + tf);
  const p4 = new Point2D(-ex + tw + r, -height / 2 + tf);  // start arc
  const p5 = new Point2D(-ex + tw + r, -height / 2 + tf + r);  // mid arc
  const p6 = new Point2D(-ex + tw, -height / 2 + tf + r);  // end arc
  const p7 = new Point2D(-ex + tw, height / 2 - tf - r);  // start arc
  const p8 = new Point2D(-ex + tw + r, height / 2 - tf - r);  // mid arc
  const p9 = new Point2D(-ex + tw + r, height / 2 - tf);  // end arc
  const p10 = new Point2D(width - ex, height / 2 - tf);
  const p11 = new Point2D(width - ex, height / 2);  // right top
  const p12 = new Point2D(-ex, height / 2);  // left top

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    Arc.byStartMidEnd(p4, p5, p6),
    new Line(p6, p7),
    Arc.byStartMidEnd(p7, p8, p9),
    new Line(p9, p10),
    new Line(p10, p11),
    new Line(p11, p12),
    new Line(p12, p1),
  ];

  return {
    name,
    description: 'C-channel with parallel flanges',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

/**
 * C-Channel with sloped flanges (traditional UNP)
 */
export function createCChannelSlopedFlange(
  name: string,
  height: number,
  width: number,
  tw: number,
  tf: number,
  r1: number,  // web fillet radius
  r2: number,  // flange toe fillet radius
  tl: number,  // flange thickness location from right
  slopeDeg: number,  // flange slope angle in degrees
  ex: number  // centroid x offset from left
): ProfileGeometry {
  const sa = slopeDeg * Math.PI / 180;  // Convert to radians
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-ex, -height / 2);  // left bottom
  const p2 = new Point2D(width - ex, -height / 2);  // right bottom
  const p3 = new Point2D(width - ex, -height / 2 + tf - Math.tan(sa) * tl - r2);  // start arc
  const p4 = new Point2D(width - ex - r2 + r21, -height / 2 + tf - Math.tan(sa) * tl - r2 + r21);  // mid arc
  const p5 = new Point2D(width - ex - r2 + Math.sin(sa) * r2, -height / 2 + tf - Math.tan(sa) * (tl - r2));  // end arc
  const p6 = new Point2D(-ex + tw + r1 - Math.sin(sa) * r1, -height / 2 + tf + Math.tan(sa) * (width - tl - tw - r1));  // start arc
  const p7 = new Point2D(-ex + tw + r1 - r11, -height / 2 + tf + Math.tan(sa) * (width - tl - tw - r1) + r1 - r11);  // mid arc
  const p8 = new Point2D(-ex + tw, -height / 2 + tf + Math.tan(sa) * (width - tl - tw) + r1);  // end arc

  // Mirror for top half
  const p9 = new Point2D(p8.x, -p8.y);
  const p10 = new Point2D(p7.x, -p7.y);
  const p11 = new Point2D(p6.x, -p6.y);
  const p12 = new Point2D(p5.x, -p5.y);
  const p13 = new Point2D(p4.x, -p4.y);
  const p14 = new Point2D(p3.x, -p3.y);
  const p15 = new Point2D(p2.x, -p2.y);
  const p16 = new Point2D(p1.x, -p1.y);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    Arc.byStartMidEnd(p9, p10, p11),
    new Line(p11, p12),
    Arc.byStartMidEnd(p12, p13, p14),
    new Line(p14, p15),
    new Line(p15, p16),
    new Line(p16, p1),
  ];

  return {
    name,
    description: 'C-channel with sloped flanges',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Rectangular Profiles
// ============================================================================

/**
 * Solid rectangle profile
 */
export function createRectangle(
  name: string,
  width: number,
  height: number
): ProfileGeometry {
  const p1 = new Point2D(width / 2, -height / 2);
  const p2 = new Point2D(width / 2, height / 2);
  const p3 = new Point2D(-width / 2, height / 2);
  const p4 = new Point2D(-width / 2, -height / 2);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    new Line(p4, p1),
  ];

  return {
    name,
    description: 'Rectangular solid section',
    height,
    width,
    curve: new PolyCurve(segments)
  };
}

/**
 * Rectangular Hollow Section (RHS/SHS) with corner radii
 */
export function createRectangleHollowSection(
  name: string,
  height: number,
  width: number,
  t: number,     // wall thickness
  r1: number,    // outer corner radius
  r2: number     // inner corner radius
): ProfileGeometry {
  const dr = r1 - r1 / SQRT2;
  const bi = width - 2 * t;
  const hi = height - 2 * t;

  // Clamp inner corner radius so it doesn't exceed available inner space
  const maxR2 = Math.min(bi / 2, hi / 2);
  const r2c = Math.min(r2, Math.max(0, maxR2));
  const dri = r2c - r2c / SQRT2;

  // Outer contour
  const p1 = new Point2D(-width / 2 + r1, -height / 2);
  const p2 = new Point2D(width / 2 - r1, -height / 2);
  const p3 = new Point2D(width / 2 - dr, -height / 2 + dr);
  const p4 = new Point2D(width / 2, -height / 2 + r1);
  const p5 = new Point2D(p4.x, -p4.y);
  const p6 = new Point2D(p3.x, -p3.y);
  const p7 = new Point2D(p2.x, -p2.y);
  const p8 = new Point2D(-p7.x, p7.y);
  const p9 = new Point2D(-p6.x, p6.y);
  const p10 = new Point2D(-p5.x, p5.y);
  const p11 = new Point2D(p10.x, -p10.y);
  const p12 = new Point2D(p9.x, -p9.y);

  // Inner contour
  const p13 = new Point2D(-bi / 2 + r2c, -hi / 2);
  const p14 = new Point2D(bi / 2 - r2c, -hi / 2);
  const p15 = new Point2D(bi / 2 - dri, -hi / 2 + dri);
  const p16 = new Point2D(bi / 2, -hi / 2 + r2c);
  const p17 = new Point2D(p16.x, -p16.y);
  const p18 = new Point2D(p15.x, -p15.y);
  const p19 = new Point2D(p14.x, -p14.y);
  const p20 = new Point2D(-p19.x, p19.y);
  const p21 = new Point2D(-p18.x, p18.y);
  const p22 = new Point2D(-p17.x, p17.y);
  const p23 = new Point2D(p22.x, -p22.y);
  const p24 = new Point2D(p21.x, -p21.y);

  const segments: CurveSegment[] = [
    // Outer
    new Line(p1, p2),
    Arc.byStartMidEnd(p2, p3, p4),
    new Line(p4, p5),
    Arc.byStartMidEnd(p5, p6, p7),
    new Line(p7, p8),
    Arc.byStartMidEnd(p8, p9, p10),
    new Line(p10, p11),
    Arc.byStartMidEnd(p11, p12, p1),
    // Connect to inner
    new Line(p1, p13),
    // Inner (reverse direction for hole)
    new Line(p13, p14),
    Arc.byStartMidEnd(p14, p15, p16),
    new Line(p16, p17),
    Arc.byStartMidEnd(p17, p18, p19),
    new Line(p19, p20),
    Arc.byStartMidEnd(p20, p21, p22),
    new Line(p22, p23),
    Arc.byStartMidEnd(p23, p24, p13),
    // Close
    new Line(p13, p1),
  ];

  return {
    name,
    description: 'Rectangular hollow section',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Circular Profiles
// ============================================================================

/**
 * Solid circular profile
 */
export function createRound(
  name: string,
  radius: number
): ProfileGeometry {
  const r = radius;
  const dr = r / SQRT2;

  const p1 = new Point2D(r, 0);
  const p2 = new Point2D(dr, dr);
  const p3 = new Point2D(0, r);
  const p4 = new Point2D(-dr, dr);
  const p5 = new Point2D(-r, 0);
  const p6 = new Point2D(-dr, -dr);
  const p7 = new Point2D(0, -r);
  const p8 = new Point2D(dr, -dr);

  const segments: CurveSegment[] = [
    Arc.byStartMidEnd(p1, p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    Arc.byStartMidEnd(p5, p6, p7),
    Arc.byStartMidEnd(p7, p8, p1),
  ];

  return {
    name,
    description: 'Solid circular section',
    height: r * 2,
    width: r * 2,
    curve: new PolyCurve(segments)
  };
}

/**
 * Circular Hollow Section (CHS/Tube)
 */
export function createRoundTube(
  name: string,
  diameter: number,
  thickness: number
): ProfileGeometry {
  const r = diameter / 2;
  const ri = r - thickness;
  const dr = r / SQRT2;
  const dri = ri / SQRT2;

  // Outer circle
  const p1 = new Point2D(r, 0);
  const p2 = new Point2D(dr, dr);
  const p3 = new Point2D(0, r);
  const p4 = new Point2D(-dr, dr);
  const p5 = new Point2D(-r, 0);
  const p6 = new Point2D(-dr, -dr);
  const p7 = new Point2D(0, -r);
  const p8 = new Point2D(dr, -dr);

  // Inner circle
  const p9 = new Point2D(ri, 0);
  const p10 = new Point2D(dri, dri);
  const p11 = new Point2D(0, ri);
  const p12 = new Point2D(-dri, dri);
  const p13 = new Point2D(-ri, 0);
  const p14 = new Point2D(-dri, -dri);
  const p15 = new Point2D(0, -ri);
  const p16 = new Point2D(dri, -dri);

  const segments: CurveSegment[] = [
    // Outer
    Arc.byStartMidEnd(p1, p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    Arc.byStartMidEnd(p5, p6, p7),
    Arc.byStartMidEnd(p7, p8, p1),
    // Connect to inner
    new Line(p1, p9),
    // Inner (clockwise for hole)
    Arc.byStartMidEnd(p9, p10, p11),
    Arc.byStartMidEnd(p11, p12, p13),
    Arc.byStartMidEnd(p13, p14, p15),
    Arc.byStartMidEnd(p15, p16, p9),
    // Close
    new Line(p9, p1),
  ];

  return {
    name,
    description: 'Circular hollow section (tube)',
    height: diameter,
    width: diameter,
    tw: thickness,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Angle Profiles (L-shapes)
// ============================================================================

/**
 * L-Angle profile with fillets (hot-rolled)
 */
export function createLAngle(
  name: string,
  height: number,
  width: number,
  tw: number,  // thickness of vertical leg
  tf: number,  // thickness of horizontal leg (often same as tw)
  r1: number,  // inner fillet radius
  r2: number,  // outer edge fillet radius
  ex: number,  // centroid x from left edge
  ey: number   // centroid y from bottom edge
): ProfileGeometry {
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-ex, -ey);  // left bottom
  const p2 = new Point2D(width - ex, -ey);  // right bottom
  const p3 = new Point2D(width - ex, -ey + tf - r2);  // start arc
  const p4 = new Point2D(width - ex - r2 + r21, -ey + tf - r2 + r21);  // mid arc
  const p5 = new Point2D(width - ex - r2, -ey + tf);  // end arc
  const p6 = new Point2D(-ex + tw + r1, -ey + tf);  // start inner arc
  const p7 = new Point2D(-ex + tw + r1 - r11, -ey + tf + r1 - r11);  // mid arc
  const p8 = new Point2D(-ex + tw, -ey + tf + r1);  // end arc
  const p9 = new Point2D(-ex + tw, height - ey - r2);  // start arc
  const p10 = new Point2D(-ex + tw - r2 + r21, height - ey - r2 + r21);  // mid arc
  const p11 = new Point2D(-ex + tw - r2, height - ey);  // end arc
  const p12 = new Point2D(-ex, height - ey);  // left top

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    Arc.byStartMidEnd(p9, p10, p11),
    new Line(p11, p12),
    new Line(p12, p1),
  ];

  return {
    name,
    description: 'L-angle profile',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// T-Profiles
// ============================================================================

/**
 * T-Profile with fillets
 */
export function createTProfileRounded(
  name: string,
  height: number,
  width: number,
  tw: number,
  tf: number,
  r: number,   // inner fillet (web-flange)
  r1: number,  // outer flange fillet
  r2: number,  // outer web top fillet
  ex: number,  // centroid x (usually 0 for symmetric)
  ey: number   // centroid y from bottom
): ProfileGeometry {
  const r01 = r / SQRT2;
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-ex, -ey);  // left bottom
  const p2 = new Point2D(width - ex, -ey);  // right bottom
  const p3 = new Point2D(width - ex, -ey + tf - r1);  // start arc
  const p4 = new Point2D(width - ex - r1 + r11, -ey + tf - r1 + r11);  // mid arc
  const p5 = new Point2D(width - ex - r1, -ey + tf);  // end arc
  const p6 = new Point2D(tw / 2 + r, -ey + tf);  // start inner arc
  const p7 = new Point2D(tw / 2 + r - r01, -ey + tf + r - r01);  // mid arc
  const p8 = new Point2D(tw / 2, -ey + tf + r);  // end arc
  const p9 = new Point2D(tw / 2, -ey + height - r2);  // start top arc
  const p10 = new Point2D(tw / 2 - r21, -ey + height - r2 + r21);  // mid arc
  const p11 = new Point2D(tw / 2 - r2, -ey + height);  // end arc

  // Mirror for left side
  const p12 = p11.mirrorX();
  const p13 = p10.mirrorX();
  const p14 = p9.mirrorX();
  const p15 = p8.mirrorX();
  const p16 = p7.mirrorX();
  const p17 = p6.mirrorX();
  const p18 = p5.mirrorX();
  const p19 = p4.mirrorX();
  const p20 = p3.mirrorX();

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    Arc.byStartMidEnd(p3, p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    Arc.byStartMidEnd(p9, p10, p11),
    new Line(p11, p12),
    Arc.byStartMidEnd(p12, p13, p14),
    new Line(p14, p15),
    Arc.byStartMidEnd(p15, p16, p17),
    new Line(p17, p18),
    Arc.byStartMidEnd(p18, p19, p20),
    new Line(p20, p1),
  ];

  return {
    name,
    description: 'T-profile with fillets',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

/**
 * Simple T-Profile without fillets
 */
export function createTProfile(
  name: string,
  height: number,
  width: number,
  tw: number,  // web thickness (h1 in original)
  tf: number   // flange thickness (b1 in original)
): ProfileGeometry {
  const p1 = new Point2D(tw / 2, -height / 2);
  const p2 = new Point2D(tw / 2, height / 2 - tf);
  const p3 = new Point2D(width / 2, height / 2 - tf);
  const p4 = new Point2D(width / 2, height / 2);
  const p5 = new Point2D(-width / 2, height / 2);
  const p6 = new Point2D(-width / 2, height / 2 - tf);
  const p7 = new Point2D(-tw / 2, height / 2 - tf);
  const p8 = new Point2D(-tw / 2, -height / 2);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    new Line(p6, p7),
    new Line(p7, p8),
    new Line(p8, p1),
  ];

  return {
    name,
    description: 'T-profile',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Cold-Formed Profiles
// ============================================================================

/**
 * Cold-formed C-profile
 */
export function createCProfileColdFormed(
  name: string,
  width: number,
  height: number,
  t: number,    // thickness
  r1: number,   // outer corner radius
  ex: number    // centroid x from right edge
): ProfileGeometry {
  const r2 = r1 - t;  // inner radius
  const dr = r1 - r1 / SQRT2;
  const dri = r2 - r2 / SQRT2;
  const hi = height - t;

  const p1 = new Point2D(width - ex, -height / 2);  // right bottom
  const p2 = new Point2D(r1 - ex, -height / 2);
  const p3 = new Point2D(dr - ex, -height / 2 + dr);
  const p4 = new Point2D(-ex, -height / 2 + r1);
  const p5 = new Point2D(p4.x, -p4.y);
  const p6 = new Point2D(p3.x, -p3.y);
  const p7 = new Point2D(p2.x, -p2.y);
  const p8 = new Point2D(p1.x, -p1.y);  // right top
  const p9 = new Point2D(width - ex, hi / 2);
  const p10 = new Point2D(t + r2 - ex, hi / 2);
  const p11 = new Point2D(t + dri - ex, hi / 2 - dri);
  const p12 = new Point2D(t - ex, hi / 2 - r2);
  const p13 = new Point2D(p12.x, -p12.y);
  const p14 = new Point2D(p11.x, -p11.y);
  const p15 = new Point2D(p10.x, -p10.y);
  const p16 = new Point2D(p9.x, -p9.y);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    Arc.byStartMidEnd(p2, p3, p4),
    new Line(p4, p5),
    Arc.byStartMidEnd(p5, p6, p7),
    new Line(p7, p8),
    new Line(p8, p9),
    new Line(p9, p10),
    Arc.byStartMidEnd(p10, p11, p12),
    new Line(p12, p13),
    Arc.byStartMidEnd(p13, p14, p15),
    new Line(p15, p16),
    new Line(p16, p1),
  ];

  return {
    name,
    description: 'Cold-formed C-profile',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

/**
 * Cold-formed C-profile with lips
 */
export function createCProfileWithLips(
  name: string,
  width: number,
  height: number,
  lipLength: number,  // h1
  t: number,          // thickness
  r1: number,         // outer corner radius
  ex: number          // centroid x from right edge
): ProfileGeometry {
  const r2 = r1 - t;  // inner radius
  const dr = r1 - r1 / SQRT2;
  const dri = r2 - r2 / SQRT2;

  const p1 = new Point2D(width - ex - r1, -height / 2);
  const p2 = new Point2D(r1 - ex, -height / 2);
  const p3 = new Point2D(dr - ex, -height / 2 + dr);
  const p4 = new Point2D(-ex, -height / 2 + r1);
  const p5 = new Point2D(p4.x, -p4.y);
  const p6 = new Point2D(p3.x, -p3.y);
  const p7 = new Point2D(p2.x, -p2.y);
  const p8 = new Point2D(p1.x, -p1.y);
  const p9 = new Point2D(width - ex - dr, height / 2 - dr);
  const p10 = new Point2D(width - ex, height / 2 - r1);
  const p11 = new Point2D(width - ex, height / 2 - lipLength);
  const p12 = new Point2D(width - ex - t, height / 2 - lipLength);
  const p13 = new Point2D(width - ex - t, height / 2 - t - r2);
  const p14 = new Point2D(width - ex - t - dri, height / 2 - t - dri);
  const p15 = new Point2D(width - ex - t - r2, height / 2 - t);
  const p16 = new Point2D(-ex + t + r2, height / 2 - t);
  const p17 = new Point2D(-ex + t + dri, height / 2 - t - dri);
  const p18 = new Point2D(-ex + t, height / 2 - t - r2);

  // Mirror for bottom
  const p19 = new Point2D(p18.x, -p18.y);
  const p20 = new Point2D(p17.x, -p17.y);
  const p21 = new Point2D(p16.x, -p16.y);
  const p22 = new Point2D(p15.x, -p15.y);
  const p23 = new Point2D(p14.x, -p14.y);
  const p24 = new Point2D(p13.x, -p13.y);
  const p25 = new Point2D(p12.x, -p12.y);
  const p26 = new Point2D(p11.x, -p11.y);
  const p27 = new Point2D(p10.x, -p10.y);
  const p28 = new Point2D(p9.x, -p9.y);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    Arc.byStartMidEnd(p2, p3, p4),
    new Line(p4, p5),
    Arc.byStartMidEnd(p5, p6, p7),
    new Line(p7, p8),
    Arc.byStartMidEnd(p8, p9, p10),
    new Line(p10, p11),
    new Line(p11, p12),
    new Line(p12, p13),
    Arc.byStartMidEnd(p13, p14, p15),
    new Line(p15, p16),
    Arc.byStartMidEnd(p16, p17, p18),
    new Line(p18, p19),
    Arc.byStartMidEnd(p19, p20, p21),
    new Line(p21, p22),
    Arc.byStartMidEnd(p22, p23, p24),
    new Line(p24, p25),
    new Line(p25, p26),
    new Line(p26, p27),
    Arc.byStartMidEnd(p27, p28, p1),
  ];

  return {
    name,
    description: 'Cold-formed C-profile with lips',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

/**
 * Cold-formed Z-profile
 */
export function createZProfileColdFormed(
  name: string,
  width: number,
  height: number,
  t: number,    // thickness
  r1: number    // inner corner radius
): ProfileGeometry {
  const r2 = r1 + t;  // outer radius
  const ex = width / 2;
  const ey = height / 2;
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-0.5 * t, -ey + t + r1);
  const p2 = new Point2D(-0.5 * t - r1 + r11, -ey + t + r1 - r11);
  const p3 = new Point2D(-0.5 * t - r1, -ey + t);
  const p4 = new Point2D(-ex, -ey + t);
  const p5 = new Point2D(-ex, -ey);
  const p6 = new Point2D(-r2 + 0.5 * t, -ey);
  const p7 = new Point2D(-r2 + 0.5 * t + r21, -ey + r2 - r21);
  const p8 = new Point2D(0.5 * t, -ey + r2);

  // Mirror for top
  const p9 = new Point2D(-p1.x, -p1.y);
  const p10 = new Point2D(-p2.x, -p2.y);
  const p11 = new Point2D(-p3.x, -p3.y);
  const p12 = new Point2D(-p4.x, -p4.y);
  const p13 = new Point2D(-p5.x, -p5.y);
  const p14 = new Point2D(-p6.x, -p6.y);
  const p15 = new Point2D(-p7.x, -p7.y);
  const p16 = new Point2D(-p8.x, -p8.y);

  const segments: CurveSegment[] = [
    Arc.byStartMidEnd(p1, p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    Arc.byStartMidEnd(p9, p10, p11),
    new Line(p11, p12),
    new Line(p12, p13),
    new Line(p13, p14),
    Arc.byStartMidEnd(p14, p15, p16),
    new Line(p16, p1),
  ];

  return {
    name,
    description: 'Cold-formed Z-profile',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

/**
 * Cold-formed L-profile
 */
export function createLProfileColdFormed(
  name: string,
  width: number,
  height: number,
  t: number,    // thickness
  r1: number,   // inner corner radius
  ex: number,   // centroid x from left
  ey: number    // centroid y from bottom
): ProfileGeometry {
  const r11 = r1 / SQRT2;
  const r2 = r1 + t;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-ex, -ey + r2);
  const p2 = new Point2D(-ex + r2 - r21, -ey + r2 - r21);
  const p3 = new Point2D(-ex + r2, -ey);
  const p4 = new Point2D(width - ex, -ey);
  const p5 = new Point2D(width - ex, -ey + t);
  const p6 = new Point2D(-ex + t + r1, -ey + t);
  const p7 = new Point2D(-ex + t + r1 - r11, -ey + t + r1 - r11);
  const p8 = new Point2D(-ex + t, -ey + t + r1);
  const p9 = new Point2D(-ex + t, ey);
  const p10 = new Point2D(-ex, ey);

  const segments: CurveSegment[] = [
    Arc.byStartMidEnd(p1, p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    Arc.byStartMidEnd(p6, p7, p8),
    new Line(p8, p9),
    new Line(p9, p10),
    new Line(p10, p1),
  ];

  return {
    name,
    description: 'Cold-formed L-profile',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Simple L-Profile (without fillets)
// ============================================================================

/**
 * Simple L-Profile without fillets
 */
export function createLProfile(
  name: string,
  height: number,
  width: number,
  tw: number,  // vertical leg thickness
  tf: number   // horizontal leg thickness
): ProfileGeometry {
  const p1 = new Point2D(width / 2, -height / 2);
  const p2 = new Point2D(width / 2, -height / 2 + tf);
  const p3 = new Point2D(-width / 2 + tw, -height / 2 + tf);
  const p4 = new Point2D(-width / 2 + tw, height / 2);
  const p5 = new Point2D(-width / 2, height / 2);
  const p6 = new Point2D(-width / 2, -height / 2);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    new Line(p6, p1),
  ];

  return {
    name,
    description: 'L-profile',
    height,
    width,
    tw,
    tf,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Z-Profile with Lips (Cold-Formed)
// ============================================================================

/**
 * Cold-formed Z-profile with lips
 */
export function createZProfileWithLips(
  name: string,
  width: number,
  height: number,
  lipLength: number,  // c - lip height
  t: number,          // thickness
  r1: number          // inner corner radius
): ProfileGeometry {
  const r2 = r1 + t;  // outer radius
  const ex = width / 2;
  const ey = height / 2;
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;

  const p1 = new Point2D(-0.5 * t, -ey + t + r1);
  const p2 = new Point2D(-0.5 * t - r1 + r11, -ey + t + r1 - r11);
  const p3 = new Point2D(-0.5 * t - r1, -ey + t);
  const p4 = new Point2D(-ex + r2, -ey + t);
  const p5 = new Point2D(-ex + r2 - r21, -ey + t - r2 + r21);
  const p6 = new Point2D(-ex, -ey + t - r2);
  const p7 = new Point2D(-ex, -ey + t - lipLength);
  const p8 = new Point2D(-ex + t, -ey + t - lipLength);
  const p9 = new Point2D(-ex + t, -ey + r1);
  const p10 = new Point2D(-ex + t + r1 - r11, -ey + r1 - r11);
  const p11 = new Point2D(-ex + t + r1, -ey);
  const p12 = new Point2D(-r2 + 0.5 * t, -ey);
  const p13 = new Point2D(-r2 + 0.5 * t + r21, -ey + r2 - r21);
  const p14 = new Point2D(0.5 * t, -ey + r2);

  // Mirror for top
  const p15 = new Point2D(-p1.x, -p1.y);
  const p16 = new Point2D(-p2.x, -p2.y);
  const p17 = new Point2D(-p3.x, -p3.y);
  const p18 = new Point2D(-p4.x, -p4.y);
  const p19 = new Point2D(-p5.x, -p5.y);
  const p20 = new Point2D(-p6.x, -p6.y);
  const p21 = new Point2D(-p7.x, -p7.y);
  const p22 = new Point2D(-p8.x, -p8.y);
  const p23 = new Point2D(-p9.x, -p9.y);
  const p24 = new Point2D(-p10.x, -p10.y);
  const p25 = new Point2D(-p11.x, -p11.y);
  const p26 = new Point2D(-p12.x, -p12.y);
  const p27 = new Point2D(-p13.x, -p13.y);
  const p28 = new Point2D(-p14.x, -p14.y);

  const segments: CurveSegment[] = [
    Arc.byStartMidEnd(p1, p2, p3),
    new Line(p3, p4),
    Arc.byStartMidEnd(p4, p5, p6),
    new Line(p6, p7),
    new Line(p7, p8),
    new Line(p8, p9),
    Arc.byStartMidEnd(p9, p10, p11),
    new Line(p11, p12),
    Arc.byStartMidEnd(p12, p13, p14),
    new Line(p14, p15),
    Arc.byStartMidEnd(p15, p16, p17),
    new Line(p17, p18),
    Arc.byStartMidEnd(p18, p19, p20),
    new Line(p20, p21),
    new Line(p21, p22),
    new Line(p22, p23),
    Arc.byStartMidEnd(p23, p24, p25),
    new Line(p25, p26),
    Arc.byStartMidEnd(p26, p27, p28),
    new Line(p28, p1),
  ];

  return {
    name,
    description: 'Cold-formed Z-profile with lips',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Sigma Profile (Cold-Formed)
// ============================================================================

/**
 * Cold-formed Sigma profile with lips
 * A sigma profile has a distinctive S-shaped web for increased stiffness
 */
export function createSigmaProfile(
  name: string,
  width: number,
  height: number,
  lipLength: number,  // c - lip length
  webDepth: number,   // d - web indentation depth
  webHeight: number,  // e - web indentation height
  t: number,          // thickness
  r1: number          // inner corner radius
): ProfileGeometry {
  const r2 = r1 + t;
  const r11 = r1 / SQRT2;
  const r21 = r2 / SQRT2;
  const ex = width / 2;
  const ey = height / 2;

  // Bottom right corner
  const p1 = new Point2D(width - ex - t - r1, -ey + t);
  const p2 = new Point2D(width - ex - r2, -ey + t);
  const p3 = new Point2D(width - ex - r2 + r21, -ey + t - r2 + r21);
  const p4 = new Point2D(width - ex, -ey + t - r2);
  const p5 = new Point2D(width - ex, -ey + t - lipLength);
  const p6 = new Point2D(width - ex - t, -ey + t - lipLength);
  const p7 = new Point2D(width - ex - t, -ey + r1);
  const p8 = new Point2D(width - ex - t - r1 + r11, -ey + r1 - r11);
  const p9 = new Point2D(width - ex - t - r1, -ey);

  // Bottom web indent
  const p10 = new Point2D(-ex + webDepth + r2, -ey);
  const p11 = new Point2D(-ex + webDepth + r2 - r21, -ey + r2 - r21);
  const p12 = new Point2D(-ex + webDepth, -ey + r2);
  const p13 = new Point2D(-ex + webDepth, -ey + webHeight - r2);
  const p14 = new Point2D(-ex + webDepth - r21, -ey + webHeight - r2 + r21);
  const p15 = new Point2D(-ex + webDepth - r2, -ey + webHeight);
  const p16 = new Point2D(-ex + t + r1, -ey + webHeight);
  const p17 = new Point2D(-ex + t + r1 - r11, -ey + webHeight + r1 - r11);
  const p18 = new Point2D(-ex + t, -ey + webHeight + r1);

  // Mirror for top half
  const p19 = new Point2D(p18.x, -p18.y);
  const p20 = new Point2D(p17.x, -p17.y);
  const p21 = new Point2D(p16.x, -p16.y);
  const p22 = new Point2D(p15.x, -p15.y);
  const p23 = new Point2D(p14.x, -p14.y);
  const p24 = new Point2D(p13.x, -p13.y);
  const p25 = new Point2D(p12.x, -p12.y);
  const p26 = new Point2D(p11.x, -p11.y);
  const p27 = new Point2D(p10.x, -p10.y);
  const p28 = new Point2D(p9.x, -p9.y);
  const p29 = new Point2D(p8.x, -p8.y);
  const p30 = new Point2D(p7.x, -p7.y);
  const p31 = new Point2D(p6.x, -p6.y);
  const p32 = new Point2D(p5.x, -p5.y);
  const p33 = new Point2D(p4.x, -p4.y);
  const p34 = new Point2D(p3.x, -p3.y);
  const p35 = new Point2D(p2.x, -p2.y);
  const p36 = new Point2D(p1.x, -p1.y);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    Arc.byStartMidEnd(p2, p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    new Line(p6, p7),
    Arc.byStartMidEnd(p7, p8, p9),
    new Line(p9, p10),
    Arc.byStartMidEnd(p10, p11, p12),
    new Line(p12, p13),
    Arc.byStartMidEnd(p13, p14, p15),
    new Line(p15, p16),
    Arc.byStartMidEnd(p16, p17, p18),
    new Line(p18, p19),
    Arc.byStartMidEnd(p19, p20, p21),
    new Line(p21, p22),
    Arc.byStartMidEnd(p22, p23, p24),
    new Line(p24, p25),
    Arc.byStartMidEnd(p25, p26, p27),
    new Line(p27, p28),
    Arc.byStartMidEnd(p28, p29, p30),
    new Line(p30, p31),
    new Line(p31, p32),
    new Line(p32, p33),
    Arc.byStartMidEnd(p33, p34, p35),
    new Line(p35, p36),
    new Line(p36, p1),
  ];

  return {
    name,
    description: 'Cold-formed Sigma profile with lips',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// E-Profile (Double Channel back-to-back)
// ============================================================================

/**
 * E-Profile - Two channels back to back
 */
export function createEProfile(
  name: string,
  width: number,
  height: number,
  flangeWidth: number,  // b1 - top/bottom flange width
  webThickness: number, // b2 - web thickness
  flangeThickness: number  // b3 - flange thickness
): ProfileGeometry {
  const p1 = new Point2D(-width / 2, -height / 2);
  const p2 = new Point2D(width / 2, -height / 2);
  const p3 = new Point2D(width / 2, -height / 2 + flangeThickness);
  const p4 = new Point2D(-width / 2 + flangeWidth, -height / 2 + flangeThickness);
  const p5 = new Point2D(-width / 2 + flangeWidth, -webThickness / 2);
  const p6 = new Point2D(width / 2, -webThickness / 2);
  const p7 = new Point2D(width / 2, webThickness / 2);
  const p8 = new Point2D(-width / 2 + flangeWidth, webThickness / 2);
  const p9 = new Point2D(-width / 2 + flangeWidth, height / 2 - flangeThickness);
  const p10 = new Point2D(width / 2, height / 2 - flangeThickness);
  const p11 = new Point2D(width / 2, height / 2);
  const p12 = new Point2D(-width / 2, height / 2);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    new Line(p6, p7),
    new Line(p7, p8),
    new Line(p8, p9),
    new Line(p9, p10),
    new Line(p10, p11),
    new Line(p11, p12),
    new Line(p12, p1),
  ];

  return {
    name,
    description: 'E-profile (double channel)',
    height,
    width,
    tw: webThickness,
    tf: flangeThickness,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// N-Profile (Special asymmetric section)
// ============================================================================

/**
 * N-Profile - Asymmetric profile (letter N shape)
 * A solid N with diagonal member connecting the two vertical stems
 */
export function createNProfile(
  name: string,
  width: number,    // b - total width
  height: number,   // h - total height
  _h1: number,      // unused in simplified N (kept for API compat)
  _b1: number,      // unused in simplified N (kept for API compat)
  t: number         // thickness
): ProfileGeometry {
  const ex = width / 2;
  const ey = height / 2;

  // Left stem: bottom-left to top-left
  const p1 = new Point2D(-ex, -ey);           // outer bottom-left
  const p2 = new Point2D(-ex + t, -ey);       // inner bottom-left
  const p3 = new Point2D(-ex + t, ey - t);    // start of diagonal (top inner left)
  const p4 = new Point2D(ex - t, -ey + t);    // end of diagonal (bottom inner right)
  const p5 = new Point2D(ex - t, ey);         // inner top-right
  const p6 = new Point2D(ex, ey);             // outer top-right
  const p7 = new Point2D(ex, -ey);            // outer bottom-right
  const p8 = new Point2D(ex - t, -ey);        // inner bottom-right
  const p9 = new Point2D(-ex + t, ey);        // inner top-left
  const p10 = new Point2D(-ex, ey);           // outer top-left

  // N shape: two vertical stems with a diagonal
  const segments: CurveSegment[] = [
    new Line(p1, p2),          // bottom of left stem
    new Line(p2, p3),          // left stem up to diagonal
    new Line(p3, p4),          // diagonal (top-left to bottom-right)
    new Line(p4, p5),          // right stem up from diagonal
    new Line(p5, p6),          // top of right stem
    new Line(p6, p7),          // right outer edge down
    new Line(p7, p8),          // bottom of right stem
    new Line(p8, p4),          // right inner up to diagonal end
    new Line(p4, p3),          // diagonal back (inner)
    new Line(p3, p9),          // left inner above diagonal
    new Line(p9, p10),         // top of left stem
    new Line(p10, p1),         // left outer edge down
  ];

  return {
    name,
    description: 'N-profile',
    height,
    width,
    tw: t,
    tf: t,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Arrow Profile (Special section)
// ============================================================================

/**
 * Arrow Profile - Pointed section
 */
export function createArrowProfile(
  name: string,
  width: number,
  height: number,
  arrowHeight: number,   // b1 - height of arrow point
  bottomWidth: number    // b2 - width at arrow base
): ProfileGeometry {
  const p1 = new Point2D(0, height / 2);  // Arrow tip
  const p2 = new Point2D(-bottomWidth / 2, height / 2 - arrowHeight);
  const p3 = new Point2D(-width / 2, height / 2 - arrowHeight);
  const p4 = new Point2D(-width / 2, -height / 2);
  const p5 = new Point2D(width / 2, -height / 2);
  const p6 = new Point2D(width / 2, height / 2 - arrowHeight);
  const p7 = new Point2D(bottomWidth / 2, height / 2 - arrowHeight);

  const segments: CurveSegment[] = [
    new Line(p1, p2),
    new Line(p2, p3),
    new Line(p3, p4),
    new Line(p4, p5),
    new Line(p5, p6),
    new Line(p6, p7),
    new Line(p7, p1),
  ];

  return {
    name,
    description: 'Arrow profile',
    height,
    width,
    curve: new PolyCurve(segments)
  };
}

// ============================================================================
// Export all profile types
// ============================================================================

export type ProfileCreator = (...args: any[]) => ProfileGeometry;

export const ProfileTypes = {
  'I-Shape': createIShapeParallelFlange,
  'C-Channel': createCChannelParallelFlange,
  'C-Channel-Sloped': createCChannelSlopedFlange,
  'Rectangle': createRectangle,
  'RHS': createRectangleHollowSection,
  'Round': createRound,
  'CHS': createRoundTube,
  'L-Angle': createLAngle,
  'T-Profile': createTProfile,
  'T-Profile-Rounded': createTProfileRounded,
  'C-Cold-Formed': createCProfileColdFormed,
  'C-Cold-Formed-Lips': createCProfileWithLips,
  'Z-Cold-Formed': createZProfileColdFormed,
  'Z-Cold-Formed-Lips': createZProfileWithLips,
  'Sigma': createSigmaProfile,
  'L-Cold-Formed': createLProfileColdFormed,
  'L-Profile': createLProfile,
  'E-Profile': createEProfile,
  'N-Profile': createNProfile,
  'Arrow': createArrowProfile,
} as const;
