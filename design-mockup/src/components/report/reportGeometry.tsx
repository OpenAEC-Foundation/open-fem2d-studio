/**
 * reportGeometry — gedeelde model→SVG-helpers voor de rapportfiguren.
 *
 * Eén plek voor de transformatie- en tekenbouwstenen die zowel de
 * constructieschets (SchemaSection) als de constructiebrede
 * krachtsverdelingsfiguren (DiagramsSection) gebruiken:
 *
 *  - modelExtent / buildSchemaTransform: model-bbox → viewBox-schaal met
 *    marges; model-x naar rechts, model-z omhoog (SVG-y geflipt), symbolen
 *    en teksten in vaste viewBox-maten zodat ze onafhankelijk van de
 *    modelgrootte leesbaar blijven;
 *  - renderBeamLines / renderNodeDots: staven en knopen — default exact de
 *    stijl van de constructieschets (nummers aan), via opties de lichte
 *    variant voor de resultaatfiguren;
 *  - renderSupportSymbols: de vereenvoudigde opleggingssymbolen (afgeleid
 *    van de canvas-symbolen);
 *  - renderGridAxisLines: stramienassen streep-punt met omcirkelde labels,
 *    zoals het referentie-rapport ze in de resultaatfiguren toont.
 *
 * Print-eis: donkere contouren, lichte vullingen — leesbaar in grijstinten.
 */
import type { Beam, Node, StructuralGrid, Support } from "../fem/femTypes";

export const INK = "#1a1a1a";
export const GROUND = "#555";
export const DIM = "#444";
export const MUTED = "#777";

// ── Transformatie ──────────────────────────────────────────────────────────

export interface ModelExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  dxMm: number;
  dzMm: number;
  /** Is verticale maatvoering/hoogte zinvol (model hoger dan 1 mm)? */
  hasHeight: boolean;
}

export function modelExtent(nodes: Node[]): ModelExtent {
  const xs = nodes.map((n) => n.x);
  const zs = nodes.map((n) => n.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    dxMm: Math.max(maxX - minX, 1),
    dzMm: Math.max(maxZ - minZ, 1),
    hasHeight: maxZ - minZ > 1,
  };
}

export interface SchemaMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SchemaTransform extends ModelExtent {
  /** viewBox-breedte/-hoogte. */
  W: number;
  H: number;
  /** viewBox-eenheden per model-mm. */
  scale: number;
  /** model-x (mm) → SVG-x. */
  X: (x: number) => number;
  /** model-z (mm) → SVG-y (geflipt: z omhoog, SVG-y omlaag). */
  Y: (z: number) => number;
}

/**
 * Bouwt de model→SVG-transformatie: het model past in een tekendoel van
 * 1000×700 viewBox-eenheden (kleinste schaal wint), de marges komen er als
 * vaste randen omheen.
 */
export function buildSchemaTransform(nodes: Node[], m: SchemaMargins): SchemaTransform {
  const ext = modelExtent(nodes);
  const scale = Math.min(1000 / ext.dxMm, 700 / ext.dzMm);
  const W = m.left + ext.dxMm * scale + m.right;
  const H = m.top + ext.dzMm * scale + m.bottom;
  const X = (x: number) => m.left + (x - ext.minX) * scale;
  const Y = (z: number) => m.top + (ext.maxZ - z) * scale;
  return { ...ext, W, H, scale, X, Y };
}

// ── Staven en knopen ───────────────────────────────────────────────────────

export interface BeamLineOptions {
  stroke?: string;
  strokeWidth?: number;
  /** Staafnummers grijs tussen haakjes tekenen (default aan, zoals de schets). */
  withIds?: boolean;
}

export function renderBeamLines(
  beams: Beam[],
  nodeById: Map<number, Node>,
  tr: SchemaTransform,
  opts: BeamLineOptions = {},
): React.ReactNode[] {
  const { stroke = INK, strokeWidth = 3, withIds = true } = opts;
  return beams.map((b) => {
    const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
    if (!nA || !nB) return null;
    const x1 = tr.X(nA.x), y1 = tr.Y(nA.z), x2 = tr.X(nB.x), y2 = tr.Y(nB.z);
    const dxS = x2 - x1, dyS = y2 - y1;
    const L = Math.hypot(dxS, dyS) || 1;
    // Staafnummer aan de "onder"-kant (loodrecht +n = rechts van de richting).
    const nx = -dyS / L, ny = dxS / L;
    const mx = (x1 + x2) / 2 + nx * 22, my2 = (y1 + y2) / 2 + ny * 22;
    return (
      <g key={`b${b.id}`}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} />
        {withIds && (
          <text x={mx} y={my2 + 5} textAnchor="middle" fontSize={15}
            fill={MUTED} fontStyle="italic">({b.id})</text>
        )}
      </g>
    );
  });
}

export interface NodeDotOptions {
  /** Knoopnummers tekenen (default aan, zoals de schets). */
  withNumbers?: boolean;
  r?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export function renderNodeDots(
  nodes: Node[],
  tr: SchemaTransform,
  opts: NodeDotOptions = {},
): React.ReactNode[] {
  const {
    withNumbers = true,
    r = 5,
    fill = "#fff",
    stroke = INK,
    strokeWidth = 2,
  } = opts;
  return nodes.map((n) => {
    const px = tr.X(n.x), py = tr.Y(n.z);
    return (
      <g key={`n${n.id}`}>
        <circle cx={px} cy={py} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {withNumbers && (
          <text x={px - 10} y={py - 10} textAnchor="end" fontSize={16}
            fontWeight={600} fill={INK}>{n.id}</text>
        )}
      </g>
    );
  });
}

// ── Opleggingssymbolen ─────────────────────────────────────────────────────

/** Eén opleggingssymbool op SVG-positie (px, py) — vereenvoudigde canvas-vorm. */
export function renderSupportSymbol(s: Support, px: number, py: number): React.ReactNode {
  const key = `sup${s.nodeId}`;
  if (s.type === "pinned") {
    const base = py + 29;
    const hatchXs = [-22, -13, -4, 5, 14, 23];
    return (
      <g key={key}>
        <polygon
          points={`${px},${py} ${px - 19},${base} ${px + 19},${base}`}
          fill="none" stroke={INK} strokeWidth={2}
        />
        <line x1={px - 26} y1={base} x2={px + 26} y2={base} stroke={GROUND} strokeWidth={2} />
        {hatchXs.map((dx, i) => (
          <line key={i} x1={px + dx} y1={base + 2} x2={px + dx - 7} y2={base + 12}
            stroke={GROUND} strokeWidth={1.5} />
        ))}
      </g>
    );
  }
  if (s.type === "fixed") {
    return (
      <g key={key}>
        <rect x={px - 22} y={py + 6} width={45} height={10} fill={INK} />
        <line x1={px - 26} y1={py + 16} x2={px + 26} y2={py + 16} stroke={GROUND} strokeWidth={2} />
      </g>
    );
  }
  if (s.type === "xRoller") {
    return (
      <g key={key}>
        <polygon
          points={`${px},${py} ${px - 32},${py - 19} ${px - 32},${py + 19}`}
          fill="none" stroke={INK} strokeWidth={2}
        />
        <line x1={px - 40} y1={py - 26} x2={px - 40} y2={py + 26} stroke={GROUND} strokeWidth={2} />
      </g>
    );
  }
  if (s.type === "zRoller") {
    const base = py + 32;
    return (
      <g key={key}>
        <polygon
          points={`${px},${py} ${px - 19},${base} ${px + 19},${base}`}
          fill="none" stroke={INK} strokeWidth={2}
        />
        <circle cx={px - 10} cy={base + 5} r={4} fill="none" stroke={INK} strokeWidth={1.5} />
        <circle cx={px + 10} cy={base + 5} r={4} fill="none" stroke={INK} strokeWidth={1.5} />
        <line x1={px - 26} y1={base + 11} x2={px + 26} y2={base + 11} stroke={GROUND} strokeWidth={2} />
      </g>
    );
  }
  if (s.type === "zSpring") {
    const top = py + 10, bot = py + 45;
    const zx = [px, px - 10, px + 10, px - 10, px + 10, px];
    const zy = [top, top + 7, top + 14, top + 21, top + 28, bot];
    return (
      <g key={key}>
        <polyline points={zx.map((x, i) => `${x},${zy[i]}`).join(" ")}
          fill="none" stroke={INK} strokeWidth={2} />
        <line x1={px - 26} y1={bot + 6} x2={px + 26} y2={bot + 6} stroke={GROUND} strokeWidth={2} />
      </g>
    );
  }
  if (s.type === "xSpring") {
    const left = px - 45, right = px - 10;
    const zy = [py - 10, py - 3, py + 3, py - 3, py + 3, py];
    const zx = [left, left + 7, left + 14, left + 21, left + 28, right];
    return (
      <g key={key}>
        <polyline points={zx.map((x, i) => `${x},${zy[i]}`).join(" ")}
          fill="none" stroke={INK} strokeWidth={2} />
        <line x1={left - 6} y1={py - 20} x2={left - 6} y2={py + 20} stroke={GROUND} strokeWidth={2} />
      </g>
    );
  }
  if (s.type === "rotSpring") {
    return (
      <g key={key}>
        <circle cx={px} cy={py} r={18} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="5 3" />
        <circle cx={px} cy={py} r={10} fill="none" stroke={INK} strokeWidth={1.5} />
      </g>
    );
  }
  return null;
}

/** Alle opleggingssymbolen (knopen zonder positie worden overgeslagen). */
export function renderSupportSymbols(
  supports: Support[],
  nodeById: Map<number, Node>,
  tr: SchemaTransform,
): React.ReactNode[] {
  return supports.map((s) => {
    const n = nodeById.get(s.nodeId);
    if (!n) return null;
    return renderSupportSymbol(s, tr.X(n.x), tr.Y(n.z));
  });
}

// ── Stramienassen ──────────────────────────────────────────────────────────

/**
 * Stramienassen als streep-puntlijnen met omcirkelde labels, zoals het
 * referentie-rapport: verticale assen (x-posities) met het label boven,
 * horizontale assen (z-posities) met het label links. Alleen assen binnen
 * de modelomvang worden getekend.
 */
export function renderGridAxisLines(
  grid: StructuralGrid,
  tr: SchemaTransform,
): React.ReactNode[] {
  if (!grid.enabled) return [];
  const els: React.ReactNode[] = [];
  const STROKE = "#8a8a8a";
  const DASH = "16 5 3 5"; // streep-punt
  const OVER = 45;         // uitloop voorbij het model
  const R = 14;            // straal labelcirkel

  const yTop = tr.Y(tr.maxZ) - OVER;
  const yBot = tr.Y(tr.minZ) + OVER;
  for (const a of grid.xAxes) {
    if (a.position < tr.minX - 1 || a.position > tr.maxX + 1) continue;
    const px = tr.X(a.position);
    els.push(
      <g key={`gx${a.id}`}>
        <line x1={px} y1={yTop} x2={px} y2={yBot}
          stroke={STROKE} strokeWidth={1.2} strokeDasharray={DASH} />
        <circle cx={px} cy={yTop - R - 4} r={R} fill="#fff" stroke={DIM} strokeWidth={1.4} />
        <text x={px} y={yTop - R - 4} textAnchor="middle" dominantBaseline="central"
          fontSize={15} fontWeight={600} fill={DIM}>{a.label}</text>
      </g>,
    );
  }

  if (tr.hasHeight) {
    const xL = tr.X(tr.minX) - OVER;
    const xR = tr.X(tr.maxX) + OVER;
    for (const a of grid.zAxes) {
      if (a.position < tr.minZ - 1 || a.position > tr.maxZ + 1) continue;
      const py = tr.Y(a.position);
      els.push(
        <g key={`gz${a.id}`}>
          <line x1={xL} y1={py} x2={xR} y2={py}
            stroke={STROKE} strokeWidth={1.2} strokeDasharray={DASH} />
          <circle cx={xL - R - 4} cy={py} r={R} fill="#fff" stroke={DIM} strokeWidth={1.4} />
          <text x={xL - R - 4} y={py} textAnchor="middle" dominantBaseline="central"
            fontSize={15} fontWeight={600} fill={DIM}>{a.label}</text>
        </g>,
      );
    }
  }
  return els;
}
