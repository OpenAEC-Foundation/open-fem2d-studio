/**
 * 2D Geometry primitives for section profiles
 * Supports points, lines, arcs, and polycurves with SVG rendering
 */

const SQRT2 = Math.sqrt(2);

/** 2D Point */
export class Point2D {
  constructor(public x: number, public y: number) {}

  static origin(): Point2D {
    return new Point2D(0, 0);
  }

  add(other: Point2D): Point2D {
    return new Point2D(this.x + other.x, this.y + other.y);
  }

  subtract(other: Point2D): Point2D {
    return new Point2D(this.x - other.x, this.y - other.y);
  }

  scale(factor: number): Point2D {
    return new Point2D(this.x * factor, this.y * factor);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Point2D {
    const len = this.length();
    return len > 0 ? this.scale(1 / len) : new Point2D(0, 0);
  }

  distanceTo(other: Point2D): number {
    return this.subtract(other).length();
  }

  rotate(angle: number): Point2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Point2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  negate(): Point2D {
    return new Point2D(-this.x, -this.y);
  }

  mirrorX(): Point2D {
    return new Point2D(-this.x, this.y);
  }

  mirrorY(): Point2D {
    return new Point2D(this.x, -this.y);
  }

  clone(): Point2D {
    return new Point2D(this.x, this.y);
  }

  equals(other: Point2D, tolerance: number = 1e-9): boolean {
    return Math.abs(this.x - other.x) < tolerance && Math.abs(this.y - other.y) < tolerance;
  }
}

/** Curve segment interface */
export interface CurveSegment {
  type: 'line' | 'arc';
  start: Point2D;
  end: Point2D;
  toSvgPath(first: boolean): string;
  getPoints(numSegments?: number): Point2D[];
}

/** Line segment */
export class Line implements CurveSegment {
  type: 'line' = 'line';

  constructor(public start: Point2D, public end: Point2D) {}

  get length(): number {
    return this.start.distanceTo(this.end);
  }

  toSvgPath(first: boolean): string {
    if (first) {
      return `M ${this.start.x} ${this.start.y} L ${this.end.x} ${this.end.y}`;
    }
    return `L ${this.end.x} ${this.end.y}`;
  }

  getPoints(numSegments: number = 1): Point2D[] {
    const points: Point2D[] = [this.start.clone()];
    for (let i = 1; i <= numSegments; i++) {
      const t = i / numSegments;
      points.push(new Point2D(
        this.start.x + t * (this.end.x - this.start.x),
        this.start.y + t * (this.end.y - this.start.y)
      ));
    }
    return points;
  }

  pointAt(t: number): Point2D {
    return new Point2D(
      this.start.x + t * (this.end.x - this.start.x),
      this.start.y + t * (this.end.y - this.start.y)
    );
  }
}

/** Arc segment defined by start, mid, and end points */
export class Arc implements CurveSegment {
  type: 'arc' = 'arc';
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;

  constructor(
    public start: Point2D,
    public mid: Point2D,
    public end: Point2D
  ) {
    // Calculate circle through three points
    const result = Arc.calculateCircle(start, mid, end);
    this.center = result.center;
    this.radius = result.radius;
    this.startAngle = Math.atan2(start.y - this.center.y, start.x - this.center.x);
    this.endAngle = Math.atan2(end.y - this.center.y, end.x - this.center.x);
    this.clockwise = result.clockwise;
  }

  /**
   * Create arc from start, mid, and end points
   */
  static byStartMidEnd(start: Point2D, mid: Point2D, end: Point2D): Arc {
    return new Arc(start, mid, end);
  }

  /**
   * Create arc from center, radius, and angles
   */
  static byCenter(
    center: Point2D,
    radius: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false
  ): Arc {
    const start = new Point2D(
      center.x + radius * Math.cos(startAngle),
      center.y + radius * Math.sin(startAngle)
    );
    const midAngle = clockwise
      ? (startAngle + endAngle) / 2 + Math.PI
      : (startAngle + endAngle) / 2;
    const mid = new Point2D(
      center.x + radius * Math.cos(midAngle),
      center.y + radius * Math.sin(midAngle)
    );
    const end = new Point2D(
      center.x + radius * Math.cos(endAngle),
      center.y + radius * Math.sin(endAngle)
    );
    return new Arc(start, mid, end);
  }

  /**
   * Calculate circle center and radius from three points
   */
  private static calculateCircle(
    p1: Point2D,
    p2: Point2D,
    p3: Point2D
  ): { center: Point2D; radius: number; clockwise: boolean } {
    const ax = p1.x, ay = p1.y;
    const bx = p2.x, by = p2.y;
    const cx = p3.x, cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

    if (Math.abs(d) < 1e-12) {
      // Points are collinear, return a degenerate arc
      return {
        center: new Point2D((ax + cx) / 2, (ay + cy) / 2),
        radius: p1.distanceTo(p3) / 2,
        clockwise: false
      };
    }

    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

    const center = new Point2D(ux, uy);
    const radius = center.distanceTo(p1);

    // Determine direction (clockwise or counter-clockwise)
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const clockwise = cross < 0;

    return { center, radius, clockwise };
  }

  toSvgPath(first: boolean): string {
    // SVG arc parameters
    const rx = this.radius;
    const ry = this.radius;
    const xAxisRotation = 0;

    // Calculate sweep angle
    let sweepAngle = this.endAngle - this.startAngle;
    if (this.clockwise) {
      if (sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    } else {
      if (sweepAngle < 0) sweepAngle += 2 * Math.PI;
    }

    const largeArcFlag = Math.abs(sweepAngle) > Math.PI ? 1 : 0;
    const sweepFlag = this.clockwise ? 0 : 1;

    if (first) {
      return `M ${this.start.x} ${this.start.y} A ${rx} ${ry} ${xAxisRotation} ${largeArcFlag} ${sweepFlag} ${this.end.x} ${this.end.y}`;
    }
    return `A ${rx} ${ry} ${xAxisRotation} ${largeArcFlag} ${sweepFlag} ${this.end.x} ${this.end.y}`;
  }

  getPoints(numSegments: number = 8): Point2D[] {
    const points: Point2D[] = [this.start.clone()];

    let startAngle = this.startAngle;
    let endAngle = this.endAngle;

    // Adjust angles for direction
    if (this.clockwise) {
      if (endAngle > startAngle) endAngle -= 2 * Math.PI;
    } else {
      if (endAngle < startAngle) endAngle += 2 * Math.PI;
    }

    for (let i = 1; i <= numSegments; i++) {
      const t = i / numSegments;
      const angle = startAngle + t * (endAngle - startAngle);
      points.push(new Point2D(
        this.center.x + this.radius * Math.cos(angle),
        this.center.y + this.radius * Math.sin(angle)
      ));
    }

    return points;
  }

  pointAt(t: number): Point2D {
    let startAngle = this.startAngle;
    let endAngle = this.endAngle;

    if (this.clockwise) {
      if (endAngle > startAngle) endAngle -= 2 * Math.PI;
    } else {
      if (endAngle < startAngle) endAngle += 2 * Math.PI;
    }

    const angle = startAngle + t * (endAngle - startAngle);
    return new Point2D(
      this.center.x + this.radius * Math.cos(angle),
      this.center.y + this.radius * Math.sin(angle)
    );
  }
}

/** PolyCurve - a chain of connected curve segments */
export class PolyCurve {
  constructor(public segments: CurveSegment[]) {}

  static byJoinedCurves(curves: CurveSegment[]): PolyCurve {
    return new PolyCurve(curves);
  }

  get isClosed(): boolean {
    if (this.segments.length === 0) return false;
    const first = this.segments[0].start;
    const last = this.segments[this.segments.length - 1].end;
    return first.equals(last, 0.001);
  }

  /**
   * Convert to SVG path string
   */
  toSvgPath(): string {
    if (this.segments.length === 0) return '';

    const pathParts: string[] = [];
    this.segments.forEach((seg, i) => {
      pathParts.push(seg.toSvgPath(i === 0));
    });

    if (this.isClosed) {
      pathParts.push('Z');
    }

    return pathParts.join(' ');
  }

  /**
   * Get all points as polygon approximation
   */
  getPoints(segmentsPerCurve: number = 8): Point2D[] {
    const points: Point2D[] = [];

    for (const segment of this.segments) {
      const segPoints = segment.getPoints(
        segment.type === 'arc' ? segmentsPerCurve : 1
      );
      // Skip first point if we already have points (avoid duplicates)
      const startIdx = points.length > 0 ? 1 : 0;
      for (let i = startIdx; i < segPoints.length; i++) {
        points.push(segPoints[i]);
      }
    }

    // Remove last point if closed (it duplicates the first)
    if (this.isClosed && points.length > 1) {
      points.pop();
    }

    return points;
  }

  /**
   * Get bounding box
   */
  getBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number } {
    const points = this.getPoints(16);
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { minX, minY, maxX, maxY };
  }
}

export { SQRT2 };
