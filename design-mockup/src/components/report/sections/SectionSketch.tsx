/**
 * SectionSketch — parametrische doorsnede-tekening (SVG) voor het rapport.
 *
 * v1 volgens de rapporteis: rechte rechthoekcontouren (geen afrondingen),
 * netjes op schaal binnen een vast kader, met maatlijnen h en b.
 *  - I-profiel (HEA/HEB/IPE): één 12-punts contour uit h/b/tw/tf;
 *  - U-profiel (UNP/UPE): 8-punts contour;
 *  - koker (RHS/SHS): buiten- + binnenrechthoek (evenodd);
 *  - buis (CHS): buiten- + binnencirkel (evenodd);
 *  - rechthoek b×h (hout): massieve rechthoek.
 * Kleuren zijn vaste documentkleuren (zwart-op-wit rapport, print-echt).
 */

export type SectionShape =
  | { type: "isection"; h: number; b: number; tw: number; tf: number }
  | { type: "channel"; h: number; b: number; tw: number; tf: number }
  | { type: "box"; h: number; b: number; t: number }
  | { type: "tube"; d: number; t: number }
  | { type: "rect"; h: number; b: number };

/** Maat in mm als tekst: integer waar mogelijk, anders 1 decimaal. */
function dim(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Vast kader (viewBox-eenheden): tekenvlak + ruimte voor maatlijnen.
const FRAME_W = 196;
const FRAME_H = 184;
const DRAW_W = 120;
const DRAW_H = 130;
const PAD = 12;
const DIM_GAP = 12; // afstand contour → maatlijn
const TICK = 3.5;

const FILL_STEEL = "#dce3ea";
const FILL_TIMBER = "#e9deca";
const STROKE = "#39424e";
const DIM_COLOR = "#767676";

function shapePath(shape: SectionShape, s: number, x0: number, y0: number): {
  d: string;
  fillRule?: "evenodd";
} {
  const p = (x: number, y: number) => `${(x0 + x * s).toFixed(2)} ${(y0 + y * s).toFixed(2)}`;

  switch (shape.type) {
    case "isection": {
      const { h, b, tw, tf } = shape;
      const wl = (b - tw) / 2; // flensuitstek links van het lijf
      return {
        d:
          `M ${p(0, 0)} L ${p(b, 0)} L ${p(b, tf)} L ${p(wl + tw, tf)} ` +
          `L ${p(wl + tw, h - tf)} L ${p(b, h - tf)} L ${p(b, h)} L ${p(0, h)} ` +
          `L ${p(0, h - tf)} L ${p(wl, h - tf)} L ${p(wl, tf)} L ${p(0, tf)} Z`,
      };
    }
    case "channel": {
      const { h, b, tw, tf } = shape;
      return {
        d:
          `M ${p(0, 0)} L ${p(b, 0)} L ${p(b, tf)} L ${p(tw, tf)} ` +
          `L ${p(tw, h - tf)} L ${p(b, h - tf)} L ${p(b, h)} L ${p(0, h)} Z`,
      };
    }
    case "box": {
      const { h, b, t } = shape;
      return {
        d:
          `M ${p(0, 0)} H ${(x0 + b * s).toFixed(2)} V ${(y0 + h * s).toFixed(2)} H ${x0.toFixed(2)} Z ` +
          `M ${p(t, t)} H ${(x0 + (b - t) * s).toFixed(2)} V ${(y0 + (h - t) * s).toFixed(2)} H ${(x0 + t * s).toFixed(2)} Z`,
        fillRule: "evenodd",
      };
    }
    case "tube": {
      const { d, t } = shape;
      const r = d / 2;
      const ri = r - t;
      const cx = x0 + r * s;
      const cy = y0 + r * s;
      const circle = (rad: number) =>
        `M ${(cx - rad * s).toFixed(2)} ${cy.toFixed(2)} ` +
        `a ${(rad * s).toFixed(2)} ${(rad * s).toFixed(2)} 0 1 0 ${(2 * rad * s).toFixed(2)} 0 ` +
        `a ${(rad * s).toFixed(2)} ${(rad * s).toFixed(2)} 0 1 0 ${(-2 * rad * s).toFixed(2)} 0 Z`;
      return { d: `${circle(r)} ${circle(ri)}`, fillRule: "evenodd" };
    }
    case "rect": {
      const { h, b } = shape;
      return {
        d: `M ${p(0, 0)} L ${p(b, 0)} L ${p(b, h)} L ${p(0, h)} Z`,
      };
    }
  }
}

export default function SectionSketch({ shape }: { shape: SectionShape }) {
  const bMm = shape.type === "tube" ? shape.d : shape.b;
  const hMm = shape.type === "tube" ? shape.d : shape.h;
  if (!(bMm > 0) || !(hMm > 0)) return null;

  const s = Math.min(DRAW_W / bMm, DRAW_H / hMm);
  const w = bMm * s;
  const h = hMm * s;
  const x0 = PAD + (DRAW_W - w) / 2;
  const y0 = PAD + (DRAW_H - h) / 2;

  const path = shapePath(shape, s, x0, y0);

  // Maatlijnen: h rechts van de contour, b eronder.
  const hx = PAD + DRAW_W + DIM_GAP; // x van de h-maatlijn
  const by = PAD + DRAW_H + DIM_GAP; // y van de b-maatlijn
  const isTimber = shape.type === "rect";
  const hLabel = `${shape.type === "tube" ? "d" : "h"} = ${dim(hMm)}`;
  const bLabel = `b = ${dim(bMm)}`;

  return (
    <svg
      className="rpt-section-sketch"
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      role="img"
      aria-label={`${bLabel} mm, ${hLabel} mm`}
    >
      <path
        d={path.d}
        fillRule={path.fillRule}
        fill={isTimber ? FILL_TIMBER : FILL_STEEL}
        stroke={STROKE}
        strokeWidth="1.2"
        strokeLinejoin="miter"
      />

      {/* h-maatlijn (rechts) */}
      <g stroke={DIM_COLOR} strokeWidth="0.8">
        <line x1={hx} y1={y0} x2={hx} y2={y0 + h} />
        <line x1={hx - TICK} y1={y0} x2={hx + TICK} y2={y0} />
        <line x1={hx - TICK} y1={y0 + h} x2={hx + TICK} y2={y0 + h} />
        <line x1={x0 + w + 2} y1={y0} x2={hx + TICK} y2={y0} strokeDasharray="2 2" />
        <line x1={x0 + w + 2} y1={y0 + h} x2={hx + TICK} y2={y0 + h} strokeDasharray="2 2" />
      </g>
      <text
        x={hx + 6}
        y={y0 + h / 2}
        fill="#444"
        fontSize="9"
        textAnchor="middle"
        transform={`rotate(-90 ${hx + 6} ${y0 + h / 2})`}
      >
        {hLabel}
      </text>

      {/* b-maatlijn (onder) — bij CHS volstaat de d-maat rechts */}
      {shape.type !== "tube" && (
        <>
          <g stroke={DIM_COLOR} strokeWidth="0.8">
            <line x1={x0} y1={by} x2={x0 + w} y2={by} />
            <line x1={x0} y1={by - TICK} x2={x0} y2={by + TICK} />
            <line x1={x0 + w} y1={by - TICK} x2={x0 + w} y2={by + TICK} />
            <line x1={x0} y1={y0 + h + 2} x2={x0} y2={by + TICK} strokeDasharray="2 2" />
            <line x1={x0 + w} y1={y0 + h + 2} x2={x0 + w} y2={by + TICK} strokeDasharray="2 2" />
          </g>
          <text x={x0 + w / 2} y={by + 11} fill="#444" fontSize="9" textAnchor="middle">
            {bLabel}
          </text>
        </>
      )}
    </svg>
  );
}
