/**
 * SectionSketch — parametrische doorsnede-tekening (SVG) voor het rapport,
 * in de stijl van het referentie-rapport: twee weergaven naast elkaar.
 *
 *  1. Gemaatvoerde contour: b-maatlijn boven, h-maatlijn links (met korte
 *     eindstreepjes en pijlpunten), en verwijslabels voor tw, tf en r bij de
 *     betreffende onderdelen.
 *  2. Assenweergave: dezelfde doorsnede met de y- en z-as door het
 *     zwaartepunt en de uiterste-vezelafstanden (h/2 boven/onder, b/2
 *     links/rechts, met teken).
 *
 * Contouren mét échte afrondingsstralen:
 *  - I-profiel (HEA/HEB/HEM/IPE): walsuitrondingen r als kwartcirkelbogen
 *    bij de lijf-flens-overgangen;
 *  - U-profiel (UNP/UPE): idem, twee uitrondingen aan de lijfzijde;
 *  - koker (SHS/RHS): afgeronde buitenhoeken (datastraal, minimaal 1,5t)
 *    en binnenhoeken (buitenstraal − t);
 *  - buis (CHS): buiten- + binnencirkel;
 *  - rechthoek b×h (hout): strak, zonder afrondingen.
 *
 * NB: bij U-profielen ligt het werkelijke zwaartepunt niet op b/2; de
 * profieldatabase bevat die ligging niet, dus de assenweergave tekent de
 * z-as symmetrisch (door b/2) — bewuste, gedocumenteerde vereenvoudiging.
 *
 * Kleuren zijn vaste documentkleuren: lichte vulling met donkere contour,
 * print-echt op wit papier (A4), ook in grijstinten.
 */

// Vormdefinitie en contourwiskunde zijn gedeeld met het profielkeuzescherm
// (components/shared/profielVorm.ts) zodat een profiel overal identiek wordt
// herkend en getekend; dit bestand houdt de rapport-specifieke opmaak
// (maatvoering, assenweergave, papierkleuren).
import { shapePath, type SectionShape } from "../../shared/profielVorm";

export type { SectionShape };

/** Maat in mm als tekst: integer waar mogelijk, anders 1 decimaal. */
function dim(v: number): string {
  const afgerond = Math.round(v * 10) / 10;
  return Number.isInteger(afgerond) ? String(afgerond) : afgerond.toFixed(1);
}

// ---------------------------------------------------------------------------
// Vast kader (viewBox-eenheden).
// Panel 1 (maatvoering): links ruimte voor de h-maatlijn, boven voor de
// b-maatlijn, rechts voor de tw/tf/r-labels. Panel 2 (assen): links/boven
// ruimte voor de aspijlen, rondom voor de vezelafstand-teksten.
// ---------------------------------------------------------------------------
const DRAW_W = 100; // tekenvlak per panel (contour wordt hierin gecentreerd)
const DRAW_H = 130;
const M1_LEFT = 30;
const M1_TOP = 26;
const M1_RIGHT = 48; // labelkolom tw/tf/r
const GAP = 8;
const M2_LEFT = 30;
const M2_RIGHT = 26;
const M_BOTTOM = 16;
const P2_X = M1_LEFT + DRAW_W + M1_RIGHT + GAP; // x-offset panel 2
const FRAME_W = P2_X + M2_LEFT + DRAW_W + M2_RIGHT;
const FRAME_H = M1_TOP + DRAW_H + M_BOTTOM;
const TICK = 3; // korte eindstreepjes op de maatlijnen

const FILL_STEEL = "#dbe4f0";
const FILL_TIMBER = "#e9deca";
const STROKE = "#39424e";
const DIM_COLOR = "#5b6470";
const TEXT_COLOR = "#333";

// ---------------------------------------------------------------------------
// Kleine tekenhulpen.
// ---------------------------------------------------------------------------

/** Gevulde pijlpunt met de punt op (x, y); ang 0 = wijst naar links,
 *  90 = omhoog, 180 = rechts, 270 = omlaag. */
function ArrowHead({ x, y, ang, color }: { x: number; y: number; ang: number; color: string }) {
  return (
    <polygon
      points="0,0 6.5,-2.1 6.5,2.1"
      fill={color}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${ang.toFixed(1)})`}
    />
  );
}

/** Horizontale maatlijn (b boven de contour) met eindstreepjes en pijlen. */
function DimH({ x1, x2, y, yObj, label }: { x1: number; x2: number; y: number; yObj: number; label: string }) {
  return (
    <g>
      <g stroke={DIM_COLOR} strokeWidth="0.7">
        <line x1={x1} y1={y} x2={x2} y2={y} />
        {/* korte eindstreepjes + hulplijnen naar de contour */}
        <line x1={x1} y1={y - TICK} x2={x1} y2={y + TICK} />
        <line x1={x2} y1={y - TICK} x2={x2} y2={y + TICK} />
        <line x1={x1} y1={y + TICK} x2={x1} y2={yObj - 1.5} strokeDasharray="2 2" />
        <line x1={x2} y1={y + TICK} x2={x2} y2={yObj - 1.5} strokeDasharray="2 2" />
      </g>
      <ArrowHead x={x1} y={y} ang={0} color={DIM_COLOR} />
      <ArrowHead x={x2} y={y} ang={180} color={DIM_COLOR} />
      <text x={(x1 + x2) / 2} y={y - 2.5} fill={TEXT_COLOR} fontSize="8" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/** Verticale maatlijn (h links van de contour) met eindstreepjes en pijlen. */
function DimV({ y1, y2, x, xObj, label }: { y1: number; y2: number; x: number; xObj: number; label: string }) {
  return (
    <g>
      <g stroke={DIM_COLOR} strokeWidth="0.7">
        <line x1={x} y1={y1} x2={x} y2={y2} />
        <line x1={x - TICK} y1={y1} x2={x + TICK} y2={y1} />
        <line x1={x - TICK} y1={y2} x2={x + TICK} y2={y2} />
        <line x1={x + TICK} y1={y1} x2={xObj - 1.5} y2={y1} strokeDasharray="2 2" />
        <line x1={x + TICK} y1={y2} x2={xObj - 1.5} y2={y2} strokeDasharray="2 2" />
      </g>
      <ArrowHead x={x} y={y1} ang={90} color={DIM_COLOR} />
      <ArrowHead x={x} y={y2} ang={270} color={DIM_COLOR} />
      <text
        x={x - 3}
        y={(y1 + y2) / 2}
        fill={TEXT_COLOR}
        fontSize="8"
        textAnchor="middle"
        transform={`rotate(-90 ${x - 3} ${(y1 + y2) / 2})`}
      >
        {label}
      </text>
    </g>
  );
}

/** Verwijslabel: dun lijntje van een onderdeel naar een tekstje rechts. */
function Leader({ fx, fy, tx, ty, label }: { fx: number; fy: number; tx: number; ty: number; label: string }) {
  return (
    <g>
      <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={DIM_COLOR} strokeWidth="0.6" />
      <circle cx={fx} cy={fy} r="0.9" fill={DIM_COLOR} />
      <text x={tx + 1.5} y={ty + 2.6} fill={TEXT_COLOR} fontSize="7.5">
        {label}
      </text>
    </g>
  );
}

interface LeaderSpec { fx: number; fy: number; tx: number; ty: number; label: string }

export default function SectionSketch({ shape }: { shape: SectionShape }) {
  const bMm = shape.type === "tube" ? shape.d : shape.b;
  const hMm = shape.type === "tube" ? shape.d : shape.h;
  if (!(bMm > 0) || !(hMm > 0)) return null;

  const s = Math.min(DRAW_W / bMm, DRAW_H / hMm);
  const w = bMm * s;
  const h = hMm * s;

  // Panel 1: gemaatvoerde contour.
  const x0 = M1_LEFT + (DRAW_W - w) / 2;
  const y0 = M1_TOP + (DRAW_H - h) / 2;
  // Panel 2: assenweergave, verticaal op dezelfde hoogte.
  const x0b = P2_X + M2_LEFT + (DRAW_W - w) / 2;

  const path1 = shapePath(shape, s, x0, y0);
  const path2 = shapePath(shape, s, x0b, y0);
  const isTimber = shape.type === "rect";
  const fill = isTimber ? FILL_TIMBER : FILL_STEEL;

  // Maatlijn-posities.
  const yDimB = y0 - 12; // b-maatlijn boven
  const xDimH = x0 - 12; // h-maatlijn links
  const xLab = M1_LEFT + DRAW_W + 8; // labelkolom rechts in panel 1

  // Verwijslabels per vorm (tw/tf/r resp. t).
  const leaders: LeaderSpec[] = [];
  if (shape.type === "isection") {
    const { h: hs, b: bs, tw, tf, r } = shape;
    const wr = x0 + ((bs + tw) / 2) * s; // rechterkant lijf (scherm-x)
    leaders.push({
      fx: x0 + w, fy: y0 + (tf / 2) * s,
      tx: xLab, ty: y0 + (tf / 2) * s,
      label: `tf = ${dim(tf)}`,
    });
    // Iets boven het midden zodat het verwijslijntje de neutrale lijn niet kruist.
    leaders.push({
      fx: wr, fy: y0 + h * 0.32,
      tx: xLab, ty: y0 + h * 0.32,
      label: `tw = ${dim(tw)}`,
    });
    // Uitrondingsboog rechtsonder: middelpunt van de kwartcirkel.
    const rEff = Math.max(0, Math.min(r, (bs - tw) / 2 - 0.5, (hs - 2 * tf) / 2 - 0.5));
    leaders.push({
      fx: wr + 0.29 * rEff * s, fy: y0 + (hs - tf - 0.29 * rEff) * s,
      tx: xLab, ty: y0 + h * 0.8,
      label: `r = ${dim(r)}`,
    });
  } else if (shape.type === "channel") {
    const { h: hs, b: bs, tw, tf, r } = shape;
    leaders.push({
      fx: x0 + w, fy: y0 + (tf / 2) * s,
      tx: xLab, ty: y0 + (tf / 2) * s,
      label: `tf = ${dim(tf)}`,
    });
    leaders.push({
      fx: x0 + tw * s, fy: y0 + h * 0.32,
      tx: xLab, ty: y0 + h * 0.32,
      label: `tw = ${dim(tw)}`,
    });
    const rEff = Math.max(0, Math.min(r, bs - tw - 0.5, (hs - 2 * tf) / 2 - 0.5));
    leaders.push({
      fx: x0 + (tw + 0.29 * rEff) * s, fy: y0 + (hs - tf - 0.29 * rEff) * s,
      tx: xLab, ty: y0 + h * 0.8,
      label: `r = ${dim(r)}`,
    });
  } else if (shape.type === "box") {
    leaders.push({
      fx: x0 + w - (shape.t / 2) * s, fy: y0 + h * 0.4,
      tx: xLab, ty: y0 + h * 0.4,
      label: `t = ${dim(shape.t)}`,
    });
  } else if (shape.type === "tube") {
    leaders.push({
      fx: x0 + w - (shape.t / 2) * s, fy: y0 + h / 2,
      tx: xLab, ty: y0 + h / 2,
      label: `t = ${dim(shape.t)}`,
    });
  }

  // Assenweergave: zwaartepunt. Bij U-profielen ligt het echte zwaartepunt
  // niet op b/2, maar de profieldatabase bevat die ligging niet — we tekenen
  // symmetrisch (gedocumenteerde vereenvoudiging, zie kopcommentaar).
  const xc = x0b + w / 2;
  const yc = y0 + h / 2;
  const halfB = dim(bMm / 2);
  const halfH = dim(hMm / 2);

  const bLabel = shape.type === "tube" ? `d = ${dim(bMm)}` : `b = ${dim(bMm)}`;
  const hLabel = `h = ${dim(hMm)}`;

  return (
    <svg
      className="rpt-section-sketch"
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      role="img"
      aria-label={`${bLabel} mm, ${hLabel} mm`}
    >
      {/* ---- Panel 1: gemaatvoerde contour ---- */}
      <path
        d={path1.d}
        fillRule={path1.fillRule}
        fill={fill}
        stroke={STROKE}
        strokeWidth="1.1"
        strokeLinejoin="miter"
      />
      {/* Neutrale lijn (zwaartepuntsas voor buiging om de sterke as): de as
          waar de buigspanning nul is en van teken wisselt. Streep-punt-lijn
          in tekeningconventie, iets buiten de contour doorlopend. */}
      <line
        x1={x0 - 6} y1={yc} x2={x0 + w + 6} y2={yc}
        stroke={DIM_COLOR}
        strokeWidth="0.7"
        strokeDasharray="7 2.5 1.5 2.5"
      />
      <text
        x={x0 + w + 7.5}
        y={yc - 2}
        fill={TEXT_COLOR}
        fontSize="6.5"
        fontStyle="italic"
      >
        n.l.
      </text>
      <DimH x1={x0} x2={x0 + w} y={yDimB} yObj={y0} label={bLabel} />
      {shape.type !== "tube" && (
        <DimV y1={y0} y2={y0 + h} x={xDimH} xObj={x0} label={hLabel} />
      )}
      {leaders.map((l) => (
        <Leader key={l.label} {...l} />
      ))}

      {/* ---- Panel 2: assen door het zwaartepunt + uiterste vezels ---- */}
      <path
        d={path2.d}
        fillRule={path2.fillRule}
        fill={fill}
        stroke={STROKE}
        strokeWidth="1.1"
        strokeLinejoin="miter"
      />
      {/* y-as: horizontaal, positief naar links (rechtsdraaiend assenstelsel
          met z omhoog, x uit het papier) */}
      <line
        x1={x0b - 16} y1={yc} x2={xc + 14} y2={yc}
        stroke={DIM_COLOR} strokeWidth="0.7"
      />
      <ArrowHead x={x0b - 16} y={yc} ang={0} color={DIM_COLOR} />
      <text x={x0b - 19} y={yc + 2.6} fill={TEXT_COLOR} fontSize="8" fontStyle="italic" textAnchor="end">
        y
      </text>
      {/* z-as: verticaal, positief omhoog */}
      <line
        x1={xc} y1={y0 - 14} x2={xc} y2={yc + 14}
        stroke={DIM_COLOR} strokeWidth="0.7"
      />
      <ArrowHead x={xc} y={y0 - 14} ang={90} color={DIM_COLOR} />
      <text x={xc - 4} y={y0 - 11} fill={TEXT_COLOR} fontSize="8" fontStyle="italic" textAnchor="end">
        z
      </text>
      {/* uiterste-vezelafstanden (met teken) */}
      <text x={xc + 4} y={y0 - 2.5} fill={TEXT_COLOR} fontSize="7">
        {halfH}
      </text>
      <text x={xc + 4} y={y0 + h + 7.5} fill={TEXT_COLOR} fontSize="7">
        −{halfH}
      </text>
      <text x={x0b - 2} y={yc + 9} fill={TEXT_COLOR} fontSize="7" textAnchor="end">
        {halfB}
      </text>
      <text x={x0b + w + 2} y={yc + 9} fill={TEXT_COLOR} fontSize="7">
        −{halfB}
      </text>
    </svg>
  );
}
