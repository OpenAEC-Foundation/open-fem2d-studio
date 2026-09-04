/**
 * CltOpbouwTekening — de opbouw van een kruislaaghout-doorsnede als
 * rapportfiguur (SVG), met daarnaast het spanningsverloop over de hoogte.
 *
 * Drie panelen naast elkaar, in de papierstijl van SectionSketch:
 *
 *  1. Doorsnede: de lagen van boven naar beneden, op hoogteschaal.
 *     Lengtelagen (vezels in de spanrichting, in doorsnede dus kopshout)
 *     zijn diagonaal gearceerd; dwarslagen (vezels in het vlak van de
 *     tekening) krijgen horizontale lijnen. Rechts per laag de dikte en
 *     de sterkteklasse, links de totale hoogte, en de zwaartelijn z₀ als
 *     streep-punt-lijn. De maatgevende laag krijgt een zware contour en
 *     het label "maatgevend".
 *  2. Buigspanning σ_m,d: lineair per lengtelaag, nul in de dwarslagen —
 *     het stapsgewijze verloop dat de samengestelde doorsnede eigen is.
 *  3. Schuifspanning τ_d: parabolisch in de lengtelagen, constant in de
 *     dwarslagen (de rolschuifspanning).
 *
 * De breedte van de strook wordt NIET op schaal getekend — een strook van
 * 1000 mm naast een hoogte van 160 mm zou de lagen tot streepjes maken.
 * Dat staat in het b-label.
 *
 * Kleuren zijn vaste documentkleuren (print-echt op wit), zoals de overige
 * rapportfiguren.
 */
import { useId } from "react";
import type { CltLayerOrientation } from "../../lib/types/timber/CltLayerOrientation";

export interface CltTekenLaag {
  /** Dikte in mm. */
  dikte: number;
  richting: CltLayerOrientation;
  klasse?: string;
  /** Bevat de maatgevende toets van de staaf. */
  maatgevend?: boolean;
}

/** Een grootheid over de hoogte: segmenten van (z vanaf boven, waarde). */
export interface Verloop {
  segmenten: Array<Array<{ z: number; v: number }>>;
  /** Aslabel, bijv. "σm,d". */
  label: string;
  eenheid: string;
}

interface Props {
  lagen: CltTekenLaag[];
  breedteMm: number;
  /** Zwaartelijn vanaf boven (mm); zonder waarde geen lijn. */
  z0Mm?: number;
  sigma?: Verloop;
  tau?: Verloop;
  titel?: string;
  className?: string;
}

// Kader (viewBox-eenheden).
const Y0 = 24; // bovenmarge: b-label
const DRAW_H = 120; // vaste tekenhoogte; de plaat vult die altijd
const XA = 34; // doorsnede
const WA = 96;
const XLAB = XA + WA + 6; // labelkolom rechts van de doorsnede
const XB = XLAB + 70; // σ-paneel
const WB = 64;
const XC = XB + WB + 24; // τ-paneel
const WC = 52;
const FRAME_W = XC + WC + 16;
const FRAME_H = Y0 + DRAW_H + 32;
const TICK = 3;

const FILL_TIMBER = "#e9deca";
const HATCH = "#8b7355";
const STROKE = "#39424e";
const STROKE_GOV = "#b91c1c";
const DIM_COLOR = "#5b6470";
const TEXT_COLOR = "#333";
const FILL_SIGMA = "#c9d6e8";
const FILL_TAU = "#d9c9e8";

function fmt(v: number, digits = 2): string {
  return v.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}

function maat(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

function ArrowHead({ x, y, ang }: { x: number; y: number; ang: number }) {
  return (
    <polygon
      points="0,0 6,-2 6,2"
      fill={DIM_COLOR}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${ang})`}
    />
  );
}

/** Verticale maatlijn met eindstreepjes, pijlen en gedraaid label. */
function DimV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <g>
      <g stroke={DIM_COLOR} strokeWidth="0.7">
        <line x1={x} y1={y1} x2={x} y2={y2} />
        <line x1={x - TICK} y1={y1} x2={x + TICK} y2={y1} />
        <line x1={x - TICK} y1={y2} x2={x + TICK} y2={y2} />
      </g>
      <ArrowHead x={x} y={y1} ang={90} />
      <ArrowHead x={x} y={y2} ang={270} />
      <text
        x={x - 3}
        y={(y1 + y2) / 2}
        fill={TEXT_COLOR}
        fontSize="7.5"
        textAnchor="middle"
        transform={`rotate(-90 ${x - 3} ${(y1 + y2) / 2})`}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Eén spanningspaneel: een verticale as op x = xAs, de segmenten als
 * gevulde vlakken tussen as en lijn, en labels bij de uiterste waarden.
 * `schaal` zet waarde → horizontale uitwijk; positief naar rechts.
 */
function SpanningsPaneel({
  verloop,
  xAs,
  schaal,
  s,
  fill,
  labelUitersten,
}: {
  verloop: Verloop;
  xAs: number;
  schaal: number;
  s: number;
  fill: string;
  labelUitersten: boolean;
}) {
  // Uiterste waarden voor de labels.
  let maxPunt: { z: number; v: number } | null = null;
  let minPunt: { z: number; v: number } | null = null;
  for (const seg of verloop.segmenten) {
    for (const p of seg) {
      if (!maxPunt || p.v > maxPunt.v) maxPunt = p;
      if (!minPunt || p.v < minPunt.v) minPunt = p;
    }
  }
  const X = (v: number) => xAs + v * schaal;
  const Y = (z: number) => Y0 + z * s;

  return (
    <g>
      <line x1={xAs} y1={Y0 - 4} x2={xAs} y2={Y0 + DRAW_H + 4} stroke={DIM_COLOR} strokeWidth="0.6" />
      {verloop.segmenten.map((seg, i) => {
        if (seg.length === 0) return null;
        const lijn = seg.map((p) => `${X(p.v).toFixed(2)},${Y(p.z).toFixed(2)}`).join(" ");
        const vlak = [
          `${xAs.toFixed(2)},${Y(seg[0].z).toFixed(2)}`,
          ...seg.map((p) => `${X(p.v).toFixed(2)},${Y(p.z).toFixed(2)}`),
          `${xAs.toFixed(2)},${Y(seg[seg.length - 1].z).toFixed(2)}`,
        ].join(" ");
        return (
          <g key={i}>
            <polygon points={vlak} fill={fill} fillOpacity="0.8" stroke="none" />
            <polyline points={lijn} fill="none" stroke={STROKE} strokeWidth="0.9" />
          </g>
        );
      })}
      {labelUitersten && maxPunt && Math.abs(maxPunt.v) > 1e-9 && (
        <text
          x={X(maxPunt.v) + (maxPunt.v >= 0 ? 2 : -2)}
          y={Y(maxPunt.z) + 2.5}
          fill={TEXT_COLOR}
          fontSize="6.5"
          textAnchor={maxPunt.v >= 0 ? "start" : "end"}
        >
          {fmt(maxPunt.v)}
        </text>
      )}
      {labelUitersten && minPunt && minPunt !== maxPunt && Math.abs(minPunt.v) > 1e-9 && (
        <text
          x={X(minPunt.v) + (minPunt.v >= 0 ? 2 : -2)}
          y={Y(minPunt.z) + 2.5}
          fill={TEXT_COLOR}
          fontSize="6.5"
          textAnchor={minPunt.v >= 0 ? "start" : "end"}
        >
          {fmt(minPunt.v)}
        </text>
      )}
      <text x={xAs} y={Y0 + DRAW_H + 12} fill={TEXT_COLOR} fontSize="7" textAnchor="middle">
        {verloop.label} ({verloop.eenheid})
      </text>
    </g>
  );
}

export default function CltOpbouwTekening({ lagen, breedteMm, z0Mm, sigma, tau, titel, className }: Props) {
  const rawId = useId();
  const uid = `clt${rawId.replace(/[^A-Za-z0-9]/g, "")}`;
  const hTot = lagen.reduce((a, l) => a + l.dikte, 0);
  if (!(hTot > 0) || lagen.length === 0) return null;

  const s = DRAW_H / hTot;
  const yNa = z0Mm !== undefined ? Y0 + z0Mm * s : null;

  // Laaggrenzen.
  let z = 0;
  const grenzen = lagen.map((l) => {
    const zTop = z;
    z += l.dikte;
    return { zTop, zBot: z };
  });

  // Schalen van de spanningspanelen: grootste absolute waarde vult het paneel.
  const maxAbs = (v?: Verloop) =>
    v ? Math.max(1e-9, ...v.segmenten.flat().map((p) => Math.abs(p.v))) : 1;
  const schaalSigma = (WB / 2 - 6) / maxAbs(sigma);
  const schaalTau = (WC - 8) / maxAbs(tau);

  const gov = lagen.some((l) => l.maatgevend);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      role="img"
      aria-label={titel ?? `Kruislaaghout, ${lagen.length} lagen, h = ${maat(hTot)} mm`}
    >
      <defs>
        {/* Lengtelaag: kopshout in doorsnede — diagonale arcering. */}
        <pattern id={`${uid}-lengte`} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0" stroke={HATCH} strokeWidth="0.5" />
        </pattern>
        {/* Dwarslaag: vezels in het tekenvlak — horizontale lijnen. */}
        <pattern id={`${uid}-dwars`} width="6" height="3" patternUnits="userSpaceOnUse">
          <path d="M0 1.5 L6 1.5" stroke={HATCH} strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* ---- Paneel 1: doorsnede ---- */}
      <text x={XA + WA / 2} y={Y0 - 8} fill={TEXT_COLOR} fontSize="7.5" textAnchor="middle">
        b = {maat(breedteMm)} (strook, breedte niet op schaal)
      </text>
      {lagen.map((l, i) => {
        const y = Y0 + grenzen[i].zTop * s;
        const h = l.dikte * s;
        const patroon = l.richting === "Longitudinal" ? `${uid}-lengte` : `${uid}-dwars`;
        return (
          <g key={i}>
            <rect x={XA} y={y} width={WA} height={h} fill={FILL_TIMBER} />
            <rect x={XA} y={y} width={WA} height={h} fill={`url(#${patroon})`} />
            <rect
              x={XA}
              y={y}
              width={WA}
              height={h}
              fill="none"
              stroke={l.maatgevend ? STROKE_GOV : STROKE}
              strokeWidth={l.maatgevend ? 1.5 : 0.7}
            />
            <text x={XLAB} y={y + h / 2 + 2.4} fill={TEXT_COLOR} fontSize="6.8">
              {maat(l.dikte)} mm{l.klasse ? ` · ${l.klasse}` : ""}
              {l.maatgevend && (
                <tspan fill={STROKE_GOV} fontStyle="italic">
                  {" "}
                  ◂ maatgevend
                </tspan>
              )}
            </text>
          </g>
        );
      })}
      {/* Zwaartelijn (E-gewogen): streep-punt-lijn, iets buiten de contour. */}
      {yNa !== null && (
        <g>
          <line
            x1={XA - 6}
            y1={yNa}
            x2={XA + WA + 4}
            y2={yNa}
            stroke={DIM_COLOR}
            strokeWidth="0.7"
            strokeDasharray="7 2.5 1.5 2.5"
          />
          <text x={XA - 7} y={yNa + 2.3} fill={TEXT_COLOR} fontSize="6.5" fontStyle="italic" textAnchor="end">
            z₀ = {maat(z0Mm ?? 0)}
          </text>
        </g>
      )}
      <DimV x={XA - 20} y1={Y0} y2={Y0 + DRAW_H} label={`h = ${maat(hTot)}`} />

      {/* Legenda arcering. */}
      <g transform={`translate(${XA} ${Y0 + DRAW_H + 8})`}>
        <rect x={0} y={0} width={10} height={6} fill={FILL_TIMBER} />
        <rect x={0} y={0} width={10} height={6} fill={`url(#${uid}-lengte)`} stroke={STROKE} strokeWidth="0.5" />
        <text x={13} y={5} fill={TEXT_COLOR} fontSize="6.5">
          lengtelaag (vezels in spanrichting)
        </text>
        <rect x={0} y={10} width={10} height={6} fill={FILL_TIMBER} />
        <rect x={0} y={10} width={10} height={6} fill={`url(#${uid}-dwars)`} stroke={STROKE} strokeWidth="0.5" />
        <text x={13} y={15} fill={TEXT_COLOR} fontSize="6.5">
          dwarslaag (rolschuiving){gov ? " · zware contour = maatgevende laag" : ""}
        </text>
      </g>

      {/* ---- Paneel 2: buigspanning ---- */}
      {sigma && (
        <g>
          {yNa !== null && (
            <line
              x1={XB}
              y1={yNa}
              x2={XB + WB}
              y2={yNa}
              stroke={DIM_COLOR}
              strokeWidth="0.5"
              strokeDasharray="7 2.5 1.5 2.5"
            />
          )}
          <SpanningsPaneel
            verloop={sigma}
            xAs={XB + WB / 2}
            schaal={schaalSigma}
            s={s}
            fill={FILL_SIGMA}
            labelUitersten
          />
        </g>
      )}

      {/* ---- Paneel 3: schuifspanning ---- */}
      {tau && (
        <g>
          {yNa !== null && (
            <line
              x1={XC}
              y1={yNa}
              x2={XC + WC}
              y2={yNa}
              stroke={DIM_COLOR}
              strokeWidth="0.5"
              strokeDasharray="7 2.5 1.5 2.5"
            />
          )}
          <SpanningsPaneel verloop={tau} xAs={XC} schaal={schaalTau} s={s} fill={FILL_TAU} labelUitersten />
        </g>
      )}
    </svg>
  );
}
