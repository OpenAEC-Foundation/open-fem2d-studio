/**
 * DiagramRenderer — Renders structural diagrams as SVG for reports
 * Generates high-quality vector graphics matching the canvas visualization
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult, INode, getConnectionTypes } from '../fem/types';
import { ILoadCase } from '../fem/LoadCase';
import { calculateBeamLength } from '../fem/Beam';

export interface DiagramOptions {
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  showGrid: boolean;
  showDimensions: boolean;
  showNodeLabels: boolean;
  showMemberLabels: boolean;
  showLoads: boolean;
  diagramScale: number;
  deformationScale: number;
  title?: string;
  subtitle?: string;
}

const DEFAULT_OPTIONS: DiagramOptions = {
  width: 700,
  height: 350,
  padding: 50,
  backgroundColor: '#ffffff',
  showGrid: true,
  showDimensions: true,
  showNodeLabels: true,
  showMemberLabels: false,
  showLoads: true,
  diagramScale: 1.0,
  deformationScale: 50,
};

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Transform {
  scale: number;
  worldToScreen: (x: number, y: number) => [number, number];
  screenLength: (worldLength: number) => number;
  getScreenPerpendicular: (x1: number, y1: number, x2: number, y2: number) => [number, number];
}

// Color scheme matching the canvas
const COLORS = {
  beam: '#1e3a5f',
  beamSelected: '#3b82f6',
  node: '#1e40af',
  support: { fill: '#fbbf24', stroke: '#92400e' },
  pointLoad: '#ef4444',
  distLoad: '#3b82f6',
  moment: '#9333ea',
  reaction: '#dc2626',
  displaced: '#2563eb',
  hinge: '#f59e0b',
  grid: '#e5e7eb',
  text: '#374151',
  textMuted: '#6b7280',
  moment_diagram: { fill: 'rgba(239, 68, 68, 0.3)', stroke: '#dc2626' },
  shear_diagram: { fill: 'rgba(59, 130, 246, 0.3)', stroke: '#2563eb' },
  normal_diagram: { fill: 'rgba(34, 197, 94, 0.3)', stroke: '#16a34a' },
};

/**
 * Calculate model bounding box from mesh
 */
function calculateBounds(mesh: Mesh): BoundingBox {
  const nodes = Array.from(mesh.nodes.values());
  if (nodes.length === 0) {
    return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  // Add margin for supports and loads
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const margin = Math.max(dx, dy) * 0.2;

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin,
  };
}

/**
 * Create coordinate transformation functions
 */
function createTransform(bounds: BoundingBox, width: number, height: number, padding: number): Transform {
  const viewWidth = width - 2 * padding;
  const viewHeight = height - 2 * padding;

  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;

  const scaleX = viewWidth / worldWidth;
  const scaleY = viewHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (viewWidth - worldWidth * scale) / 2;
  const offsetY = padding + (viewHeight - worldHeight * scale) / 2;

  return {
    scale,
    worldToScreen: (x: number, y: number): [number, number] => {
      const sx = offsetX + (x - bounds.minX) * scale;
      const sy = height - (offsetY + (y - bounds.minY) * scale); // Flip Y
      return [sx, sy];
    },
    screenLength: (worldLength: number): number => worldLength * scale,
    getScreenPerpendicular: (x1: number, y1: number, x2: number, y2: number): [number, number] => {
      const [sx1, sy1] = [offsetX + (x1 - bounds.minX) * scale, height - (offsetY + (y1 - bounds.minY) * scale)];
      const [sx2, sy2] = [offsetX + (x2 - bounds.minX) * scale, height - (offsetY + (y2 - bounds.minY) * scale)];
      const dx = sx2 - sx1;
      const dy = sy2 - sy1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return [-dy / len, dx / len];
    },
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Format force value for display
 */
function formatForce(value: number): string {
  const kN = Math.abs(value) / 1000;
  if (kN >= 1000) return `${(kN / 1000).toFixed(1)} MN`;
  if (kN >= 1) return `${kN.toFixed(1)} kN`;
  return `${(value).toFixed(0)} N`;
}

/**
 * Format moment value for display
 */
function formatMoment(value: number): string {
  const kNm = Math.abs(value) / 1000;
  if (kNm >= 1) return `${kNm.toFixed(2)} kNm`;
  return `${value.toFixed(0)} Nm`;
}

/**
 * Generate grid SVG
 */
function generateGridSVG(bounds: BoundingBox, transform: Transform, width: number, height: number): string {
  const worldWidth = bounds.maxX - bounds.minX;
  const gridStep = Math.pow(10, Math.floor(Math.log10(worldWidth / 5)));

  let svg = `<g class="grid" stroke="${COLORS.grid}" stroke-width="0.5">`;

  // Vertical lines
  for (let x = Math.ceil(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
    const [sx] = transform.worldToScreen(x, 0);
    svg += `<line x1="${sx}" y1="0" x2="${sx}" y2="${height}"/>`;
  }

  // Horizontal lines
  for (let y = Math.ceil(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
    const [, sy] = transform.worldToScreen(0, y);
    svg += `<line x1="0" y1="${sy}" x2="${width}" y2="${sy}"/>`;
  }

  svg += '</g>';
  return svg;
}

/**
 * Generate support symbol SVG - matches canvas rendering exactly
 */
function generateSupportSVG(x: number, y: number, node: INode, _size: number = 20): string {
  const hasX = node.constraints.x;
  const hasY = node.constraints.y;
  const hasRot = node.constraints.rotation;

  let svg = `<g transform="translate(${x},${y})">`;

  if (hasX && hasY && hasRot) {
    // Fixed support (inklemming) - rectangle centered at node with hatch below
    const rectW = 24;
    const rectH = 10;
    svg += `<rect x="${-rectW / 2}" y="${-rectH / 2}" width="${rectW}" height="${rectH}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Hatch lines below rectangle
    svg += `<g stroke="${COLORS.support.stroke}" stroke-width="1.5">`;
    for (let i = -10; i <= 10; i += 5) {
      svg += `<line x1="${i}" y1="${rectH / 2}" x2="${i - 6}" y2="${rectH / 2 + 10}"/>`;
    }
    svg += '</g>';
  } else if (hasX && hasY) {
    // Pinned support (scharnier) - triangle pointing down from node
    const triW = 24;
    const triH = 20;
    svg += `<polygon points="0,0 ${-triW / 2},${triH} ${triW / 2},${triH}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Ground line
    svg += `<line x1="${-triW / 2 - 2}" y1="${triH + 2}" x2="${triW / 2 + 2}" y2="${triH + 2}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Hatch lines
    svg += `<g stroke="${COLORS.support.stroke}" stroke-width="1">`;
    for (let i = -10; i <= 10; i += 6) {
      svg += `<line x1="${i}" y1="${triH + 2}" x2="${i - 6}" y2="${triH + 8}"/>`;
    }
    svg += '</g>';
  } else if (hasY) {
    // Roller Y (roloplegging) - triangle with two roller circles below
    const triHalfBase = 7;
    const triHeight = 12;
    const circleRadius = 3.5;
    const circleSpacing = 5;
    const circleCenterY = triHeight + 1 + circleRadius;
    const groundLineY = circleCenterY + circleRadius + 2;

    // Triangle pointing down
    svg += `<polygon points="0,0 ${-triHalfBase},${triHeight} ${triHalfBase},${triHeight}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Two roller circles
    svg += `<circle cx="${-circleSpacing}" cy="${circleCenterY}" r="${circleRadius}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    svg += `<circle cx="${circleSpacing}" cy="${circleCenterY}" r="${circleRadius}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Ground line
    svg += `<line x1="-14" y1="${groundLineY}" x2="14" y2="${groundLineY}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Hatch lines
    svg += `<g stroke="${COLORS.support.stroke}" stroke-width="1">`;
    for (let i = -10; i <= 10; i += 6) {
      svg += `<line x1="${i}" y1="${groundLineY}" x2="${i - 6}" y2="${groundLineY + 6}"/>`;
    }
    svg += '</g>';
  } else if (hasX) {
    // Roller X (horizontal) - triangle pointing left with circles
    const triHalfBase = 7;
    const triHeight = 14;
    const circleRadius = 3.5;

    // Triangle pointing left (apex at node)
    svg += `<polygon points="0,0 ${-triHeight},${-triHalfBase} ${-triHeight},${triHalfBase}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Two roller circles
    svg += `<circle cx="${-triHeight - 1 - circleRadius}" cy="${-4}" r="${circleRadius}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    svg += `<circle cx="${-triHeight - 1 - circleRadius}" cy="4" r="${circleRadius}" fill="${COLORS.support.fill}" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Ground line
    const groundLineX = -triHeight - 1 - circleRadius * 2 - 2;
    svg += `<line x1="${groundLineX}" y1="-14" x2="${groundLineX}" y2="14" stroke="${COLORS.support.stroke}" stroke-width="1.5"/>`;
    // Hatch lines
    svg += `<g stroke="${COLORS.support.stroke}" stroke-width="1">`;
    for (let i = -10; i <= 10; i += 6) {
      svg += `<line x1="${groundLineX}" y1="${i}" x2="${groundLineX - 6}" y2="${i - 6}"/>`;
    }
    svg += '</g>';
  }

  svg += '</g>';
  return svg;
}

/**
 * Generate hinge symbol SVG (small circle at beam end)
 */
function generateHingeSVG(x: number, y: number, radius: number = 6): string {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="white" stroke="${COLORS.hinge}" stroke-width="2"/>`;
}

/**
 * Generate point load arrow SVG
 */
function generatePointLoadSVG(
  x: number,
  y: number,
  fx: number,
  fy: number,
  moment: number,
  maxForce: number
): string {
  let svg = '';
  const arrowLength = 50;
  const headSize = 10;

  // Force arrow
  if (Math.abs(fx) > 0.1 || Math.abs(fy) > 0.1) {
    const mag = Math.sqrt(fx * fx + fy * fy);
    const scale = Math.min(1, mag / maxForce);
    const len = arrowLength * scale;

    // Normalize direction
    const nx = fx / mag;
    const ny = -fy / mag; // Flip Y for screen coords

    // Arrow starts away from node, points to node
    const startX = x - nx * len;
    const startY = y - ny * len;

    svg += `<g stroke="${COLORS.pointLoad}" fill="${COLORS.pointLoad}" stroke-width="2.5">`;

    // Shaft
    svg += `<line x1="${startX}" y1="${startY}" x2="${x}" y2="${y}"/>`;

    // Arrowhead at node
    const angle = Math.atan2(ny, nx);
    svg += `<polygon points="${x},${y} ${x - headSize * Math.cos(angle - 0.4)},${y - headSize * Math.sin(angle - 0.4)} ${x - headSize * Math.cos(angle + 0.4)},${y - headSize * Math.sin(angle + 0.4)}"/>`;

    // Label
    svg += `<text x="${startX - 5}" y="${startY - 8}" font-size="10" font-weight="bold" fill="${COLORS.pointLoad}" stroke="none" text-anchor="end">${formatForce(mag)}</text>`;

    svg += '</g>';
  }

  // Moment arrow (curved arc)
  if (Math.abs(moment) > 0.1) {
    const radius = 20;
    const direction = moment > 0 ? 1 : -1;

    svg += `<g stroke="${COLORS.moment}" fill="${COLORS.moment}" stroke-width="2">`;

    // Arc
    const startAngle = -0.3 * Math.PI;
    const endAngle = 0.8 * Math.PI * direction;
    const x1 = x + radius * Math.cos(startAngle);
    const y1 = y + radius * Math.sin(startAngle);
    const x2 = x + radius * Math.cos(endAngle);
    const y2 = y + radius * Math.sin(endAngle);
    const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
    const sweep = direction > 0 ? 1 : 0;

    svg += `<path d="M${x1},${y1} A${radius},${radius} 0 ${largeArc},${sweep} ${x2},${y2}" fill="none"/>`;

    // Arrowhead
    const arrowAngle = endAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    svg += `<polygon points="${x2},${y2} ${x2 - 8 * Math.cos(arrowAngle - 0.4)},${y2 - 8 * Math.sin(arrowAngle - 0.4)} ${x2 - 8 * Math.cos(arrowAngle + 0.4)},${y2 - 8 * Math.sin(arrowAngle + 0.4)}"/>`;

    // Label
    svg += `<text x="${x + 25}" y="${y - 25}" font-size="10" font-weight="bold" fill="${COLORS.moment}" stroke="none">${formatMoment(Math.abs(moment))}</text>`;

    svg += '</g>';
  }

  return svg;
}

/**
 * Generate distributed load SVG with multiple arrows
 */
function generateDistributedLoadSVG(
  p1: [number, number],
  p2: [number, number],
  qy: number,
  qyEnd: number,
  maxQ: number,
  startT: number = 0,
  endT: number = 1,
  coordSystem: 'local' | 'global' = 'local'
): string {
  if (Math.abs(qy) < 0.1 && Math.abs(qyEnd) < 0.1) return '';

  const screenAngle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const perpAngle = coordSystem === 'global' ? -Math.PI / 2 : screenAngle - Math.PI / 2;

  // Start and end points on beam
  const loadP1 = [
    p1[0] + (p2[0] - p1[0]) * startT,
    p1[1] + (p2[1] - p1[1]) * startT
  ];
  const loadP2 = [
    p1[0] + (p2[0] - p1[0]) * endT,
    p1[1] + (p2[1] - p1[1]) * endT
  ];

  // Arrow lengths based on global max
  const baseLen = Math.min(50, 30);
  const startLen = maxQ === 0 ? 20 : (Math.abs(qy) / maxQ) * baseLen;
  const endLen = maxQ === 0 ? 20 : (Math.abs(qyEnd) / maxQ) * baseLen;

  const numArrows = Math.max(3, Math.round(6 * (endT - startT)));

  let svg = `<g stroke="${COLORS.distLoad}" fill="${COLORS.distLoad}" stroke-width="2">`;

  const topPoints: [number, number][] = [];

  for (let i = 0; i <= numArrows; i++) {
    const t = i / numArrows;
    const px = loadP1[0] + (loadP2[0] - loadP1[0]) * t;
    const py = loadP1[1] + (loadP2[1] - loadP1[1]) * t;

    const currentQ = qy + (qyEnd - qy) * t;
    const currentLen = startLen + (endLen - startLen) * t;

    const topX = px + Math.cos(perpAngle) * currentLen;
    const topY = py + Math.sin(perpAngle) * currentLen;
    topPoints.push([topX, topY]);

    if (Math.abs(currentQ) > 0.1) {
      // Arrow shaft
      svg += `<line x1="${topX}" y1="${topY}" x2="${px}" y2="${py}"/>`;

      // Arrowhead pointing to beam
      const arrowDir = Math.atan2(py - topY, px - topX);
      svg += `<polygon points="${px},${py} ${px - 7 * Math.cos(arrowDir - 0.4)},${py - 7 * Math.sin(arrowDir - 0.4)} ${px - 7 * Math.cos(arrowDir + 0.4)},${py - 7 * Math.sin(arrowDir + 0.4)}"/>`;
    }
  }

  // Connect tops with a line
  if (topPoints.length >= 2) {
    svg += `<polyline points="${topPoints.map(p => p.join(',')).join(' ')}" fill="none"/>`;
  }

  // Label at center
  const midIdx = Math.floor(topPoints.length / 2);
  const labelQ = qy + (qyEnd - qy) * 0.5;
  const labelX = topPoints[midIdx][0];
  const labelY = topPoints[midIdx][1] - 12;
  svg += `<text x="${labelX}" y="${labelY}" font-size="10" font-weight="bold" fill="${COLORS.distLoad}" stroke="none" text-anchor="middle">${(Math.abs(labelQ) / 1000).toFixed(1)} kN/m</text>`;

  svg += '</g>';
  return svg;
}

/**
 * Generate reaction arrow SVG
 */
function generateReactionArrowSVG(
  x: number,
  y: number,
  value: number,
  direction: 'x' | 'y',
  maxR: number
): string {
  if (Math.abs(value) < 1) return '';

  const arrowScale = 40;
  const len = Math.min(arrowScale, (Math.abs(value) / maxR) * arrowScale);
  const headSize = 8;

  let svg = `<g stroke="${COLORS.reaction}" fill="${COLORS.reaction}" stroke-width="2">`;

  if (direction === 'x') {
    const sign = Math.sign(value);
    const startX = x - sign * 25;
    const endX = startX + sign * len;

    svg += `<line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}"/>`;

    const angle = sign > 0 ? 0 : Math.PI;
    svg += `<polygon points="${endX},${y} ${endX - headSize * Math.cos(angle - 0.4)},${y - headSize * Math.sin(angle - 0.4)} ${endX - headSize * Math.cos(angle + 0.4)},${y - headSize * Math.sin(angle + 0.4)}"/>`;

    svg += `<text x="${startX + sign * len / 2}" y="${y - 10}" font-size="9" fill="${COLORS.reaction}" stroke="none" text-anchor="middle">${(value / 1000).toFixed(1)} kN</text>`;
  } else {
    const sign = Math.sign(value);
    const startY = y + sign * 25;
    const endY = startY - sign * len;

    svg += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${endY}"/>`;

    const angle = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    svg += `<polygon points="${x},${endY} ${x - headSize * Math.cos(angle - 0.4)},${endY - headSize * Math.sin(angle - 0.4)} ${x - headSize * Math.cos(angle + 0.4)},${endY - headSize * Math.sin(angle + 0.4)}"/>`;

    svg += `<text x="${x + 15}" y="${startY - sign * len / 2}" font-size="9" fill="${COLORS.reaction}" stroke="none">${(value / 1000).toFixed(1)} kN</text>`;
  }

  svg += '</g>';
  return svg;
}

/**
 * Render model geometry as SVG with loads
 */
export function renderGeometry(
  mesh: Mesh,
  options: Partial<DiagramOptions> = {},
  loadCases?: ILoadCase[],
  activeLoadCaseId?: number
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const bounds = calculateBounds(mesh);
  const transform = createTransform(bounds, opts.width, opts.height, opts.padding);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" style="max-width:100%;height:auto;font-family:'Segoe UI',Arial,sans-serif">`;

  // Background
  svg += `<rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}"/>`;

  // Grid
  if (opts.showGrid) {
    svg += generateGridSVG(bounds, transform, opts.width, opts.height);
  }

  // Plates (triangles/quads)
  svg += '<g fill="rgba(99, 102, 241, 0.15)" stroke="#6366f1" stroke-width="1">';
  for (const element of mesh.elements.values()) {
    if (element.nodeIds.length < 3) continue;
    const nodes = mesh.getElementNodes(element);
    if (!nodes || nodes.length < 3) continue;
    const coords = nodes.map((node: INode) => transform.worldToScreen(node.x, node.y));
    svg += `<polygon points="${coords.map((c: [number, number]) => c.join(',')).join(' ')}"/>`;
  }
  svg += '</g>';

  // Beams
  svg += `<g stroke="${COLORS.beam}" stroke-width="3" stroke-linecap="round">`;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  svg += '</g>';

  // Connection symbols at beam ends
  for (const beam of mesh.beamElements.values()) {
    const { start, end } = getConnectionTypes(beam);
    if (start === 'fixed' && end === 'fixed') continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = 15;

    if (start === 'hinge') {
      svg += generateHingeSVG(x1 + (dx / len) * offset, y1 + (dy / len) * offset);
    } else if (start === 'tension_only') {
      const hx = x1 + (dx / len) * offset;
      const hy = y1 + (dy / len) * offset;
      svg += `<line x1="${hx - 6}" y1="${hy}" x2="${hx + 6}" y2="${hy}" stroke="#22c55e" stroke-width="2"/>`;
      svg += `<line x1="${hx}" y1="${hy - 6}" x2="${hx}" y2="${hy + 6}" stroke="#22c55e" stroke-width="2"/>`;
    } else if (start === 'pressure_only') {
      const hx = x1 + (dx / len) * offset;
      const hy = y1 + (dy / len) * offset;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      svg += `<polyline points="${hx - 9},${hy} ${hx - 6},${hy - 5} ${hx},${hy + 5} ${hx + 6},${hy - 5} ${hx + 9},${hy}" fill="none" stroke="#ef4444" stroke-width="2" transform="rotate(${angle},${hx},${hy})"/>`;
    }
    if (end === 'hinge') {
      svg += generateHingeSVG(x2 - (dx / len) * offset, y2 - (dy / len) * offset);
    } else if (end === 'tension_only') {
      const hx = x2 - (dx / len) * offset;
      const hy = y2 - (dy / len) * offset;
      svg += `<line x1="${hx - 6}" y1="${hy}" x2="${hx + 6}" y2="${hy}" stroke="#22c55e" stroke-width="2"/>`;
      svg += `<line x1="${hx}" y1="${hy - 6}" x2="${hx}" y2="${hy + 6}" stroke="#22c55e" stroke-width="2"/>`;
    } else if (end === 'pressure_only') {
      const hx = x2 - (dx / len) * offset;
      const hy = y2 - (dy / len) * offset;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      svg += `<polyline points="${hx - 9},${hy} ${hx - 6},${hy - 5} ${hx},${hy + 5} ${hx + 6},${hy - 5} ${hx + 9},${hy}" fill="none" stroke="#ef4444" stroke-width="2" transform="rotate(${angle},${hx},${hy})"/>`;
    }
  }

  // Dimension labels
  if (opts.showDimensions) {
    svg += `<g font-size="10" fill="${COLORS.text}" text-anchor="middle">`;
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const L = calculateBeamLength(nodes[0], nodes[1]);
      const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
      const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 12;
      svg += `<text x="${mx}" y="${my}">${(L * 1000).toFixed(0)} mm</text>`;
    }
    svg += '</g>';
  }

  // Supports
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += generateSupportSVG(x, y, node);
    }
  }

  // Calculate max force for scaling loads
  let maxForce = 0;
  let maxQ = 0;

  // From node loads
  for (const node of mesh.nodes.values()) {
    const mag = Math.sqrt(node.loads.fx ** 2 + node.loads.fy ** 2);
    maxForce = Math.max(maxForce, mag);
  }

  // From load cases
  if (loadCases) {
    for (const lc of loadCases) {
      for (const pl of lc.pointLoads) {
        const mag = Math.sqrt(pl.fx ** 2 + pl.fy ** 2);
        maxForce = Math.max(maxForce, mag);
      }
      for (const dl of lc.distributedLoads) {
        maxQ = Math.max(maxQ, Math.abs(dl.qy), Math.abs(dl.qyEnd ?? dl.qy));
      }
    }
  }

  // From beam distributed loads
  for (const beam of mesh.beamElements.values()) {
    if (beam.distributedLoad) {
      maxQ = Math.max(maxQ, Math.abs(beam.distributedLoad.qy), Math.abs(beam.distributedLoad.qyEnd ?? beam.distributedLoad.qy));
    }
  }

  if (maxForce === 0) maxForce = 1000;
  if (maxQ === 0) maxQ = 1000;

  // Draw loads
  if (opts.showLoads) {
    // Point loads on nodes
    for (const node of mesh.nodes.values()) {
      if (node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment !== 0) {
        const [x, y] = transform.worldToScreen(node.x, node.y);
        svg += generatePointLoadSVG(x, y, node.loads.fx, node.loads.fy, node.loads.moment, maxForce);
      }
    }

    // Distributed loads on beams
    for (const beam of mesh.beamElements.values()) {
      if (!beam.distributedLoad) continue;
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;

      const p1 = transform.worldToScreen(nodes[0].x, nodes[0].y);
      const p2 = transform.worldToScreen(nodes[1].x, nodes[1].y);
      const { qy, qyEnd, startT, endT, coordSystem } = beam.distributedLoad;

      svg += generateDistributedLoadSVG(p1, p2, qy, qyEnd ?? qy, maxQ, startT ?? 0, endT ?? 1, coordSystem ?? 'local');
    }

    // Load case loads
    if (loadCases && activeLoadCaseId) {
      const lc = loadCases.find(l => l.id === activeLoadCaseId);
      if (lc) {
        // Point loads from load case
        for (const pl of lc.pointLoads) {
          const node = mesh.nodes.get(pl.nodeId);
          if (!node) continue;
          const [x, y] = transform.worldToScreen(node.x, node.y);
          svg += generatePointLoadSVG(x, y, pl.fx, pl.fy, pl.mz, maxForce);
        }

        // Distributed loads from load case
        for (const dl of lc.distributedLoads) {
          const beam = mesh.beamElements.get(dl.elementId);
          if (!beam) continue;
          const nodes = mesh.getBeamElementNodes(beam);
          if (!nodes) continue;

          const p1 = transform.worldToScreen(nodes[0].x, nodes[0].y);
          const p2 = transform.worldToScreen(nodes[1].x, nodes[1].y);
          svg += generateDistributedLoadSVG(p1, p2, dl.qy, dl.qyEnd ?? dl.qy, maxQ, dl.startT ?? 0, dl.endT ?? 1, dl.coordSystem ?? 'local');
        }
      }
    }
  }

  // Nodes
  svg += `<g fill="${COLORS.node}">`;
  for (const node of mesh.nodes.values()) {
    const [x, y] = transform.worldToScreen(node.x, node.y);
    svg += `<circle cx="${x}" cy="${y}" r="4"/>`;
  }
  svg += '</g>';

  // Node labels
  if (opts.showNodeLabels) {
    svg += `<g font-size="9" fill="${COLORS.text}">`;
    for (const node of mesh.nodes.values()) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += `<text x="${x + 8}" y="${y - 8}">N${node.id}</text>`;
    }
    svg += '</g>';
  }

  // Member labels
  if (opts.showMemberLabels) {
    svg += `<g font-size="9" fill="${COLORS.textMuted}" text-anchor="middle">`;
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
      const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 + 15;
      const label = beam.profileName || `B${beam.id}`;
      svg += `<text x="${mx}" y="${my}">${escapeXml(label)}</text>`;
    }
    svg += '</g>';
  }

  svg += '</svg>';
  return svg;
}

export interface ForceDiagramOptions extends DiagramOptions {
  title?: string;
  subtitle?: string;
}

/**
 * Render force diagram (M, V, or N line) as SVG
 */
export function renderForceDiagram(
  mesh: Mesh,
  result: ISolverResult,
  diagramType: 'moment' | 'shear' | 'normal',
  options: Partial<ForceDiagramOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const bounds = calculateBounds(mesh);
  const transform = createTransform(bounds, opts.width, opts.height, opts.padding);

  const colorKey = `${diagramType}_diagram` as keyof typeof COLORS;
  const color = COLORS[colorKey] as { fill: string; stroke: string };

  const defaultTitles: Record<string, string> = {
    moment: 'Bending Moment Diagram (M)',
    shear: 'Shear Force Diagram (V)',
    normal: 'Axial Force Diagram (N)',
  };

  // Find max force value for scaling
  let maxVal = 0;
  for (const forces of result.beamForces.values()) {
    if (diagramType === 'moment') {
      if (forces.bendingMoment && forces.bendingMoment.length > 0) {
        for (const m of forces.bendingMoment) {
          maxVal = Math.max(maxVal, Math.abs(m));
        }
      } else {
        maxVal = Math.max(maxVal, Math.abs(forces.M1), Math.abs(forces.M2), Math.abs(forces.maxM));
      }
    } else if (diagramType === 'shear') {
      if (forces.shearForce && forces.shearForce.length > 0) {
        for (const v of forces.shearForce) {
          maxVal = Math.max(maxVal, Math.abs(v));
        }
      } else {
        maxVal = Math.max(maxVal, Math.abs(forces.V1), Math.abs(forces.V2), Math.abs(forces.maxV));
      }
    } else {
      if (forces.normalForce && forces.normalForce.length > 0) {
        for (const n of forces.normalForce) {
          maxVal = Math.max(maxVal, Math.abs(n));
        }
      } else {
        maxVal = Math.max(maxVal, Math.abs(forces.N1), Math.abs(forces.N2), Math.abs(forces.maxN));
      }
    }
  }
  if (maxVal === 0) maxVal = 1;

  const diagramHeight = 60 * opts.diagramScale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" style="max-width:100%;height:auto;font-family:'Segoe UI',Arial,sans-serif">`;
  svg += `<rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}"/>`;

  if (opts.showGrid) {
    svg += generateGridSVG(bounds, transform, opts.width, opts.height);
  }

  // Baseline beams (draw first, behind the diagram)
  svg += `<g stroke="${COLORS.beam}" stroke-width="2.5" stroke-linecap="round">`;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  svg += '</g>';

  // Connection symbols
  for (const beam of mesh.beamElements.values()) {
    const { start, end } = getConnectionTypes(beam);
    if (start === 'fixed' && end === 'fixed') continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = 12;

    if (start === 'hinge') {
      svg += generateHingeSVG(x1 + (dx / len) * offset, y1 + (dy / len) * offset, 5);
    }
    if (end === 'hinge') {
      svg += generateHingeSVG(x2 - (dx / len) * offset, y2 - (dy / len) * offset, 5);
    }
  }

  // Force diagrams
  for (const beam of mesh.beamElements.values()) {
    const forces = result.beamForces.get(beam.id);
    if (!forces) continue;

    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    const [perpX, perpY] = transform.getScreenPerpendicular(nodes[0].x, nodes[0].y, nodes[1].x, nodes[1].y);

    // Get force values along the beam
    let forceValues: number[];
    let numStations: number;

    if (diagramType === 'moment' && forces.bendingMoment && forces.bendingMoment.length > 0) {
      forceValues = forces.bendingMoment;
      numStations = forceValues.length - 1;
    } else if (diagramType === 'shear' && forces.shearForce && forces.shearForce.length > 0) {
      forceValues = forces.shearForce;
      numStations = forceValues.length - 1;
    } else if (diagramType === 'normal' && forces.normalForce && forces.normalForce.length > 0) {
      forceValues = forces.normalForce;
      numStations = forceValues.length - 1;
    } else {
      const v1 = diagramType === 'moment' ? forces.M1 : diagramType === 'shear' ? forces.V1 : forces.N1;
      const v2 = diagramType === 'moment' ? forces.M2 : diagramType === 'shear' ? forces.V2 : forces.N2;
      numStations = 20;
      forceValues = [];
      for (let i = 0; i <= numStations; i++) {
        forceValues.push(v1 + (v2 - v1) * (i / numStations));
      }
    }

    // Build polygon points
    const points: string[] = [`${x1},${y1}`];

    for (let i = 0; i <= numStations; i++) {
      const t = i / numStations;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;

      let val = forceValues[Math.min(i, forceValues.length - 1)];

      // For moment: flip to draw on tension side
      if (diagramType === 'moment') {
        val = -val;
      }

      const offset = (val / maxVal) * diagramHeight;
      points.push(`${px + perpX * offset},${py + perpY * offset}`);
    }

    points.push(`${x2},${y2}`);

    // Filled polygon with gradient effect
    svg += `<polygon points="${points.join(' ')}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.5"/>`;

    // Find and label max value
    let maxIdx = 0;
    let maxAbsVal = 0;
    for (let i = 0; i < forceValues.length; i++) {
      if (Math.abs(forceValues[i]) > maxAbsVal) {
        maxAbsVal = Math.abs(forceValues[i]);
        maxIdx = i;
      }
    }

    if (maxAbsVal > maxVal * 0.05) {
      const t = maxIdx / numStations;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const val = forceValues[maxIdx];
      const displayVal = diagramType === 'moment' ? -val : val;
      const offset = (displayVal / maxVal) * diagramHeight;
      const labelOffset = 16 * Math.sign(displayVal || 1);

      const lx = px + perpX * (offset + labelOffset);
      const ly = py + perpY * (offset + labelOffset);

      const valueKN = Math.abs(val) / 1000;
      svg += `<text x="${lx}" y="${ly}" font-size="10" font-weight="bold" fill="${color.stroke}" text-anchor="middle" dominant-baseline="middle">${valueKN.toFixed(1)}</text>`;
    }

    // Label end values if different from max
    const v1 = forceValues[0];
    const v2 = forceValues[forceValues.length - 1];

    if (Math.abs(v1) > maxVal * 0.03 && maxIdx > 1) {
      const displayV1 = diagramType === 'moment' ? -v1 : v1;
      const offset1 = (displayV1 / maxVal) * diagramHeight;
      const labelOffset1 = 14 * Math.sign(displayV1 || 1);
      svg += `<text x="${x1 + perpX * (offset1 + labelOffset1)}" y="${y1 + perpY * (offset1 + labelOffset1)}" font-size="9" fill="${color.stroke}" text-anchor="middle">${(Math.abs(v1) / 1000).toFixed(1)}</text>`;
    }

    if (Math.abs(v2) > maxVal * 0.03 && maxIdx < numStations - 1) {
      const displayV2 = diagramType === 'moment' ? -v2 : v2;
      const offset2 = (displayV2 / maxVal) * diagramHeight;
      const labelOffset2 = 14 * Math.sign(displayV2 || 1);
      svg += `<text x="${x2 + perpX * (offset2 + labelOffset2)}" y="${y2 + perpY * (offset2 + labelOffset2)}" font-size="9" fill="${color.stroke}" text-anchor="middle">${(Math.abs(v2) / 1000).toFixed(1)}</text>`;
    }
  }

  // Supports
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += generateSupportSVG(x, y, node, 14);
    }
  }

  // Nodes
  svg += `<g fill="${COLORS.text}">`;
  for (const node of mesh.nodes.values()) {
    const [x, y] = transform.worldToScreen(node.x, node.y);
    svg += `<circle cx="${x}" cy="${y}" r="3"/>`;
  }
  svg += '</g>';

  // Title
  const title = options.title || defaultTitles[diagramType];
  svg += `<text x="10" y="18" font-size="11" font-weight="bold" fill="${color.stroke}">${escapeXml(title)}</text>`;

  if (options.subtitle) {
    svg += `<text x="10" y="32" font-size="9" fill="${COLORS.textMuted}">${escapeXml(options.subtitle)}</text>`;
  }

  // Unit label
  const unit = diagramType === 'moment' ? 'kNm' : 'kN';
  svg += `<text x="${opts.width - 10}" y="18" font-size="10" fill="${COLORS.textMuted}" text-anchor="end">[${unit}]</text>`;
  svg += `<text x="${opts.width - 10}" y="32" font-size="9" fill="${COLORS.textMuted}" text-anchor="end">max: ${(maxVal / 1000).toFixed(2)} ${unit}</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * Render reaction forces as SVG
 */
export function renderReactions(
  mesh: Mesh,
  result: ISolverResult,
  options: Partial<DiagramOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const bounds = calculateBounds(mesh);
  const transform = createTransform(bounds, opts.width, opts.height, opts.padding);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" style="max-width:100%;height:auto;font-family:'Segoe UI',Arial,sans-serif">`;
  svg += `<rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}"/>`;

  if (opts.showGrid) {
    svg += generateGridSVG(bounds, transform, opts.width, opts.height);
  }

  // Beams
  svg += `<g stroke="${COLORS.textMuted}" stroke-width="2" stroke-linecap="round">`;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  svg += '</g>';

  // Supports
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += generateSupportSVG(x, y, node);
    }
  }

  // Calculate max reaction for scaling
  const beams = Array.from(mesh.beamElements.values());
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  let maxR = 0;
  for (const node of mesh.nodes.values()) {
    if (!node.constraints.x && !node.constraints.y) continue;
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) continue;
    if (node.constraints.x) maxR = Math.max(maxR, Math.abs(result.reactions[idx * dofsPerNode] || 0));
    if (node.constraints.y) maxR = Math.max(maxR, Math.abs(result.reactions[idx * dofsPerNode + 1] || 0));
  }
  if (maxR === 0) maxR = 1;

  // Reaction arrows
  for (const node of mesh.nodes.values()) {
    if (!node.constraints.x && !node.constraints.y && !node.constraints.rotation) continue;
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) continue;

    const [sx, sy] = transform.worldToScreen(node.x, node.y);

    if (node.constraints.x) {
      const rx = result.reactions[idx * dofsPerNode] || 0;
      svg += generateReactionArrowSVG(sx, sy, rx, 'x', maxR);
    }

    if (node.constraints.y) {
      const ry = result.reactions[idx * dofsPerNode + 1] || 0;
      svg += generateReactionArrowSVG(sx, sy, ry, 'y', maxR);
    }

    // Moment reaction
    if (isFrame && node.constraints.rotation) {
      const mz = result.reactions[idx * dofsPerNode + 2] || 0;
      if (Math.abs(mz) > 1) {
        const r = 18;
        const direction = mz > 0 ? 1 : -1;
        const startAngle = -90 * Math.PI / 180;
        const endAngle = (direction > 0 ? 135 : -135) * Math.PI / 180;
        const x1 = sx + r * Math.cos(startAngle);
        const y1 = sy + r * Math.sin(startAngle);
        const x2 = sx + r * Math.cos(endAngle);
        const y2 = sy + r * Math.sin(endAngle);
        const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
        const sweep = direction > 0 ? 1 : 0;

        svg += `<g stroke="#7c3aed" fill="#7c3aed" stroke-width="2">`;
        svg += `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},${sweep} ${x2},${y2}" fill="none"/>`;

        const arrowAngle = endAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
        svg += `<polygon points="${x2},${y2} ${x2 - 7 * Math.cos(arrowAngle - 0.4)},${y2 - 7 * Math.sin(arrowAngle - 0.4)} ${x2 - 7 * Math.cos(arrowAngle + 0.4)},${y2 - 7 * Math.sin(arrowAngle + 0.4)}"/>`;

        svg += `<text x="${sx}" y="${sy - 30}" font-size="9" fill="#7c3aed" stroke="none" text-anchor="middle">${(mz / 1000).toFixed(2)} kNm</text>`;
        svg += '</g>';
      }
    }
  }

  // Nodes
  svg += `<g fill="${COLORS.text}">`;
  for (const node of mesh.nodes.values()) {
    const [x, y] = transform.worldToScreen(node.x, node.y);
    svg += `<circle cx="${x}" cy="${y}" r="3"/>`;
  }
  svg += '</g>';

  svg += `<text x="10" y="18" font-size="12" font-weight="bold" fill="${COLORS.reaction}">Reaction Forces</text>`;
  svg += '</svg>';
  return svg;
}

/**
 * Render displaced shape as SVG with curved beams
 */
export function renderDisplacements(
  mesh: Mesh,
  result: ISolverResult,
  options: Partial<DiagramOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const bounds = calculateBounds(mesh);
  const transform = createTransform(bounds, opts.width, opts.height, opts.padding);

  const beams = Array.from(mesh.beamElements.values());
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  // Calculate max displacement for scaling
  let maxDisp = 0;
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) continue;
    const ux = result.displacements[idx * dofsPerNode] || 0;
    const uy = result.displacements[idx * dofsPerNode + 1] || 0;
    maxDisp = Math.max(maxDisp, Math.abs(ux), Math.abs(uy));
  }

  const worldSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const autoScale = maxDisp > 0 ? (worldSize * 0.08) / maxDisp : 1;
  const scale = opts.deformationScale > 0 ? opts.deformationScale : autoScale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" style="max-width:100%;height:auto;font-family:'Segoe UI',Arial,sans-serif">`;
  svg += `<rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}"/>`;

  if (opts.showGrid) {
    svg += generateGridSVG(bounds, transform, opts.width, opts.height);
  }

  // Original beams (dashed)
  svg += '<g stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="6,4">';
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  svg += '</g>';

  // Deformed beams - use cubic bezier for curved shape
  svg += `<g stroke="${COLORS.displaced}" stroke-width="3" stroke-linecap="round" fill="none">`;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const idx1 = nodeIdToIndex.get(nodes[0].id);
    const idx2 = nodeIdToIndex.get(nodes[1].id);
    if (idx1 === undefined || idx2 === undefined) continue;

    const ux1 = (result.displacements[idx1 * dofsPerNode] || 0) * scale;
    const uy1 = (result.displacements[idx1 * dofsPerNode + 1] || 0) * scale;
    const theta1 = isFrame ? (result.displacements[idx1 * dofsPerNode + 2] || 0) * scale : 0;

    const ux2 = (result.displacements[idx2 * dofsPerNode] || 0) * scale;
    const uy2 = (result.displacements[idx2 * dofsPerNode + 1] || 0) * scale;
    const theta2 = isFrame ? (result.displacements[idx2 * dofsPerNode + 2] || 0) * scale : 0;

    const [x1, y1] = transform.worldToScreen(nodes[0].x + ux1, nodes[0].y + uy1);
    const [x2, y2] = transform.worldToScreen(nodes[1].x + ux2, nodes[1].y + uy2);

    // Use cubic bezier for smooth curve based on end rotations
    const L = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const beamAngle = Math.atan2(y2 - y1, x2 - x1);

    // Control points offset by rotation angle
    const cp1x = x1 + (L / 3) * Math.cos(beamAngle - theta1 * 0.3);
    const cp1y = y1 + (L / 3) * Math.sin(beamAngle - theta1 * 0.3);
    const cp2x = x2 - (L / 3) * Math.cos(beamAngle + theta2 * 0.3);
    const cp2y = y2 - (L / 3) * Math.sin(beamAngle + theta2 * 0.3);

    svg += `<path d="M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}"/>`;
  }
  svg += '</g>';

  // Deformed nodes with displacement values
  svg += `<g fill="${COLORS.displaced}" font-size="9">`;
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) continue;

    const ux = result.displacements[idx * dofsPerNode] || 0;
    const uy = result.displacements[idx * dofsPerNode + 1] || 0;
    const [sx, sy] = transform.worldToScreen(node.x + ux * scale, node.y + uy * scale);

    svg += `<circle cx="${sx}" cy="${sy}" r="4"/>`;

    const dispMag = Math.sqrt(ux * ux + uy * uy) * 1000;
    if (dispMag > 0.01) {
      svg += `<text x="${sx + 8}" y="${sy - 8}" fill="${COLORS.displaced}">${dispMag.toFixed(2)} mm</text>`;
    }
  }
  svg += '</g>';

  // Supports on original position
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += generateSupportSVG(x, y, node, 14);
    }
  }

  svg += `<text x="10" y="18" font-size="12" font-weight="bold" fill="${COLORS.displaced}">Displaced Shape</text>`;
  svg += `<text x="10" y="32" font-size="9" fill="${COLORS.textMuted}">Scale: ${scale.toFixed(0)}x | Max: ${(maxDisp * 1000).toFixed(2)} mm</text>`;
  svg += '</svg>';
  return svg;
}

/**
 * Render load case diagram as SVG
 */
export function renderLoadCase(
  mesh: Mesh,
  loadCase: ILoadCase,
  options: Partial<DiagramOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, showLoads: true, ...options };
  const bounds = calculateBounds(mesh);
  const transform = createTransform(bounds, opts.width, opts.height, opts.padding);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" style="max-width:100%;height:auto;font-family:'Segoe UI',Arial,sans-serif">`;
  svg += `<rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}"/>`;

  if (opts.showGrid) {
    svg += generateGridSVG(bounds, transform, opts.width, opts.height);
  }

  // Beams (lighter)
  svg += `<g stroke="${COLORS.textMuted}" stroke-width="2.5" stroke-linecap="round">`;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [x1, y1] = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const [x2, y2] = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  svg += '</g>';

  // Supports
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const [x, y] = transform.worldToScreen(node.x, node.y);
      svg += generateSupportSVG(x, y, node, 14);
    }
  }

  // Calculate max values for scaling
  let maxForce = 0;
  let maxQ = 0;

  for (const pl of loadCase.pointLoads) {
    const mag = Math.sqrt(pl.fx ** 2 + pl.fy ** 2);
    maxForce = Math.max(maxForce, mag);
  }
  for (const dl of loadCase.distributedLoads) {
    maxQ = Math.max(maxQ, Math.abs(dl.qy), Math.abs(dl.qyEnd ?? dl.qy));
  }

  if (maxForce === 0) maxForce = 1000;
  if (maxQ === 0) maxQ = 1000;

  // Point loads
  for (const pl of loadCase.pointLoads) {
    const node = mesh.nodes.get(pl.nodeId);
    if (!node) continue;
    const [x, y] = transform.worldToScreen(node.x, node.y);
    svg += generatePointLoadSVG(x, y, pl.fx, pl.fy, pl.mz, maxForce);
  }

  // Distributed loads
  for (const dl of loadCase.distributedLoads) {
    const beam = mesh.beamElements.get(dl.elementId);
    if (!beam) continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;

    const p1 = transform.worldToScreen(nodes[0].x, nodes[0].y);
    const p2 = transform.worldToScreen(nodes[1].x, nodes[1].y);
    svg += generateDistributedLoadSVG(p1, p2, dl.qy, dl.qyEnd ?? dl.qy, maxQ, dl.startT ?? 0, dl.endT ?? 1, dl.coordSystem ?? 'local');
  }

  // Nodes
  svg += `<g fill="${COLORS.node}">`;
  for (const node of mesh.nodes.values()) {
    const [x, y] = transform.worldToScreen(node.x, node.y);
    svg += `<circle cx="${x}" cy="${y}" r="3"/>`;
  }
  svg += '</g>';

  // Title
  svg += `<text x="10" y="18" font-size="11" font-weight="bold" fill="${COLORS.text}">${escapeXml(loadCase.name)}</text>`;
  svg += `<text x="10" y="32" font-size="9" fill="${COLORS.textMuted}">Type: ${loadCase.type}</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * Export all diagrams for report
 */
export interface ReportDiagrams {
  geometry: string;
  momentDiagram: string | null;
  shearDiagram: string | null;
  normalDiagram: string | null;
  reactions: string | null;
  displacements: string | null;
  loadCases: Map<number, string>;
}

export function generateAllDiagrams(
  mesh: Mesh,
  result: ISolverResult | null,
  loadCases: ILoadCase[] = [],
  options: Partial<DiagramOptions> = {}
): ReportDiagrams {
  const diagrams: ReportDiagrams = {
    geometry: renderGeometry(mesh, options, loadCases),
    momentDiagram: null,
    shearDiagram: null,
    normalDiagram: null,
    reactions: null,
    displacements: null,
    loadCases: new Map(),
  };

  // Generate load case diagrams
  for (const lc of loadCases) {
    diagrams.loadCases.set(lc.id, renderLoadCase(mesh, lc, options));
  }

  if (result && result.beamForces.size > 0) {
    diagrams.momentDiagram = renderForceDiagram(mesh, result, 'moment', options);
    diagrams.shearDiagram = renderForceDiagram(mesh, result, 'shear', options);
    diagrams.normalDiagram = renderForceDiagram(mesh, result, 'normal', options);
    diagrams.reactions = renderReactions(mesh, result, options);
    diagrams.displacements = renderDisplacements(mesh, result, options);
  }

  return diagrams;
}
