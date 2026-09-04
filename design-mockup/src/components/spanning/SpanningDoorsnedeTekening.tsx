/**
 * SpanningDoorsnedeTekening — de doorsnede met het spanningsverloop ernaast.
 *
 * Vier panelen naast elkaar, op één en dezelfde hoogteschaal, zodat elke
 * vezel in de doorsnede horizontaal op één lijn staat met zijn spanningen:
 *
 *  1. Doorsnede — de echte contour wanneer die bekend is (catalogusprofiel of
 *     rechthoek, met walsuitrondingen; dezelfde contourwiskunde als de
 *     profielkiezer en het rapport), anders de lagen van het rekenmodel als
 *     gestapelde rechthoeken. Met de zwaartelijn z_c en een merkteken op de
 *     maatgevende vezel.
 *  2. σ_x — normaalspanning: rechte lijn per laag (N/A + M·(z−z_c)/I_y),
 *     trek positief naar rechts.
 *  3. τ — schuifspanning: parabolisch in elke laag, met de sprong op elke
 *     laaggrens waar de breedte verspringt (flens → lijf). Die sprong is
 *     geen tekenfout maar het gedrag van V·S(z)/(I_y·b(z)).
 *  4. σ_eq — de vergelijkspanning van von Mises, met de rekenwaarde f_d als
 *     streeplijn ernaast. Wie de twee ziet, ziet meteen de marge.
 *
 * De verticale schaal is voor alle vier de panelen gelijk. De doorsnede wordt
 * in de breedte samengedrukt zodra hij anders buiten zijn paneel valt; dat
 * staat dan in het bijschrift van het paneel.
 *
 * Kleuren zijn vaste documentkleuren op een eigen papiervlak, zodat de figuur
 * in het rapport (wit papier) en in het toetsingspaneel (licht én donker
 * thema) hetzelfde en leesbaar blijft — precies zoals de CLT-opbouwtekening.
 */
import { useId, useMemo } from "react";
import type { SpanningLaag } from "../../lib/types/spanning/SpanningLaag";
import type { SpanningVezel } from "../../lib/types/spanning/SpanningVezel";
import { shapePath, shapeVanProfiel, type SectionShape } from "../shared/profielVorm";

export interface SpanningTekeningProps {
  /** Doorsnedenaam — bepaalt de contour ("IPE 300", "100 × 300 mm"). */
  naam: string;
  /** Lagen van het rekenmodel, van boven naar beneden. */
  lagen: SpanningLaag[];
  hoogteMm: number;
  breedteMaxMm: number;
  /** Zwaartelijn vanaf de bovenkant (mm). */
  zCMm: number;
  /** Het spanningsverloop bij de maatgevende snede. */
  vezels: SpanningVezel[];
  /** Hoogte waar σ_eq maximaal is (mm vanaf boven). */
  zMaatgevendMm: number;
  /** Rekenwaarde f_d = f_toel/γ_M (N/mm²) — de streeplijn in het σ_eq-paneel. */
  fDMpa: number;
  titel?: string;
  className?: string;
}

// Kader (viewBox-eenheden).
const Y0 = 26;
const DRAW_H = 124;
const XA = 32;
const WA = 96; // doorsnede
const XB = XA + WA + 30; // σ_x
const WB = 68;
const XC = XB + WB + 26; // τ
const WC = 52;
const XD = XC + WC + 28; // σ_eq
const WD = 64;
const FRAME_W = XD + WD + 20;
const FRAME_H = Y0 + DRAW_H + 30;
const TICK = 3;

const PAPIER = "#ffffff";
const FILL_VLAK = "#dfe4ea";
const HATCH = "#8d97a5";
const STROKE = "#39424e";
const DIM_COLOR = "#5b6470";
const TEXT_COLOR = "#333";
const FILL_SIGMA = "#c9d6e8";
const FILL_TAU = "#d9c9e8";
const FILL_EQ = "#f6d9c2";
const LIMIET = "#b91c1c";

function fmt(v: number, digits = 1): string {
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

interface PaneelProps {
  punten: Array<{ z: number; v: number }>;
  label: string;
  xLinks: number;
  breedte: number;
  /** Waarde → horizontale uitwijk (positief naar rechts). */
  schaal: number;
  /** Hoogte → y. */
  s: number;
  /** Waarde waarop de as staat (0 in het midden of aan de linkerkant). */
  xAs: number;
  fill: string;
  /** Grenswaarde als streeplijn (alleen het σ_eq-paneel). */
  limiet?: number;
}

/**
 * Eén spanningspaneel: verticale as, het verloop als gevuld vlak, labels bij
 * de uiterste waarden en eventueel de grenswaarde als streeplijn.
 */
function Paneel({ punten, label, xLinks, breedte, schaal, s, xAs, fill, limiet }: PaneelProps) {
  if (punten.length === 0) return null;
  const X = (v: number) => xAs + v * schaal;
  const Y = (z: number) => Y0 + z * s;

  let maxPunt = punten[0];
  let minPunt = punten[0];
  for (const p of punten) {
    if (p.v > maxPunt.v) maxPunt = p;
    if (p.v < minPunt.v) minPunt = p;
  }

  const lijn = punten.map((p) => `${X(p.v).toFixed(2)},${Y(p.z).toFixed(2)}`).join(" ");
  const vlak = [
    `${xAs.toFixed(2)},${Y(punten[0].z).toFixed(2)}`,
    ...punten.map((p) => `${X(p.v).toFixed(2)},${Y(p.z).toFixed(2)}`),
    `${xAs.toFixed(2)},${Y(punten[punten.length - 1].z).toFixed(2)}`,
  ].join(" ");

  return (
    <g>
      <line x1={xAs} y1={Y0 - 5} x2={xAs} y2={Y0 + DRAW_H + 5} stroke={DIM_COLOR} strokeWidth="0.6" />
      <polygon points={vlak} fill={fill} fillOpacity="0.85" stroke="none" />
      <polyline points={lijn} fill="none" stroke={STROKE} strokeWidth="0.9" />
      {limiet !== undefined && X(limiet) <= xLinks + breedte + 6 && (
        <g>
          <line
            x1={X(limiet)}
            y1={Y0 - 5}
            x2={X(limiet)}
            y2={Y0 + DRAW_H + 5}
            stroke={LIMIET}
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          <text x={X(limiet)} y={Y0 - 8} fill={LIMIET} fontSize="6.5" textAnchor="middle">
            f_d = {fmt(limiet, 1)}
          </text>
        </g>
      )}
      {Math.abs(maxPunt.v) > 1e-9 && (
        <text
          x={X(maxPunt.v) + (maxPunt.v >= 0 ? 2 : -2)}
          y={Y(maxPunt.z) + 2.4}
          fill={TEXT_COLOR}
          fontSize="6.5"
          textAnchor={maxPunt.v >= 0 ? "start" : "end"}
        >
          {fmt(maxPunt.v)}
        </text>
      )}
      {minPunt !== maxPunt && Math.abs(minPunt.v) > 1e-9 && (
        <text
          x={X(minPunt.v) + (minPunt.v >= 0 ? 2 : -2)}
          y={Y(minPunt.z) + 2.4}
          fill={TEXT_COLOR}
          fontSize="6.5"
          textAnchor={minPunt.v >= 0 ? "start" : "end"}
        >
          {fmt(minPunt.v)}
        </text>
      )}
      <text
        x={xLinks + breedte / 2}
        y={Y0 + DRAW_H + 13}
        fill={TEXT_COLOR}
        fontSize="7"
        textAnchor="middle"
      >
        {label} (N/mm²)
      </text>
    </g>
  );
}

/** De contour van het profiel wanneer die uit de naam af te leiden is. */
function contourVan(naam: string): SectionShape | null {
  return shapeVanProfiel(naam);
}

export default function SpanningDoorsnedeTekening({
  naam,
  lagen,
  hoogteMm,
  breedteMaxMm,
  zCMm,
  vezels,
  zMaatgevendMm,
  fDMpa,
  titel,
  className,
}: SpanningTekeningProps) {
  const rawId = useId();
  const uid = `sp${rawId.replace(/[^A-Za-z0-9]/g, "")}`;
  const shape = useMemo(() => contourVan(naam), [naam]);

  if (!(hoogteMm > 0) || vezels.length === 0) return null;

  // Eén keer het contourpad; de vulling en de arcering delen het.
  const pad = shape ? shapePath(shape, DRAW_H / hoogteMm, 0, 0) : null;

  const s = DRAW_H / hoogteMm;
  const yNa = Y0 + zCMm * s;
  const yGov = Y0 + zMaatgevendMm * s;

  // Breedte: op ware schaal zolang het profiel in zijn paneel past, anders
  // samengedrukt. De HOOGTE blijft altijd dezelfde schaal als de panelen —
  // anders staan de spanningen niet meer naast hun vezel.
  const breedte = breedteMaxMm > 0 ? breedteMaxMm : hoogteMm;
  const sx = Math.min(s, WA / breedte);
  const opSchaal = sx >= s - 1e-9;
  const tekenB = breedte * sx;
  const xMid = XA + WA / 2;

  const sigma = vezels.map((v) => ({ z: v.z_mm, v: v.sigma_x_mpa }));
  const tau = vezels.map((v) => ({ z: v.z_mm, v: v.tau_mpa }));
  const eq = vezels.map((v) => ({ z: v.z_mm, v: v.sigma_eq_mpa }));

  const maxAbs = (p: Array<{ v: number }>) => Math.max(1e-9, ...p.map((x) => Math.abs(x.v)));
  const schaalSigma = (WB / 2 - 8) / maxAbs(sigma);
  const schaalTau = (WC - 10) / maxAbs(tau);
  // Het σ_eq-paneel schaalt op de grootste van (σ_eq,max, f_d), zodat de
  // grenslijn altijd in beeld staat en de marge zichtbaar is.
  const schaalEq = (WD - 12) / Math.max(maxAbs(eq), fDMpa > 0 ? fDMpa : 0, 1e-9);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      role="img"
      aria-label={
        titel ??
        `Doorsnede ${naam} met spanningsverloop: normaalspanning, schuifspanning en vergelijkspanning over de hoogte`
      }
    >
      <defs>
        <pattern id={`${uid}-arc`} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0" stroke={HATCH} strokeWidth="0.45" />
        </pattern>
      </defs>

      {/* Papiervlak: houdt de figuur leesbaar in licht én donker thema. */}
      <rect x="0" y="0" width={FRAME_W} height={FRAME_H} rx="2" fill={PAPIER} />

      {/* ---- Paneel 1: doorsnede ---- */}
      <text x={xMid} y={Y0 - 10} fill={TEXT_COLOR} fontSize="7.5" textAnchor="middle">
        {naam}
      </text>
      {shape && pad ? (
        // Echte contour, met walsuitrondingen. De niet-uniforme schaal zit in
        // een transform; de lijndikte blijft daardoor onafhankelijk van de
        // samendrukking.
        <g transform={`translate(${(xMid - tekenB / 2).toFixed(2)} ${Y0}) scale(${(sx / s).toFixed(4)} 1)`}>
          <path d={pad.d} fillRule={pad.fillRule} fill={FILL_VLAK} stroke="none" />
          <path
            d={pad.d}
            fillRule={pad.fillRule}
            fill={`url(#${uid}-arc)`}
            stroke={STROKE}
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ) : (
        // Terugval: de lagen van het rekenmodel, elk gecentreerd.
        lagen.map((l, i) => {
          const w = l.breedte_mm * sx;
          return (
            <g key={i}>
              <rect
                x={xMid - w / 2}
                y={Y0 + l.z_top_mm * s}
                width={w}
                height={(l.z_bot_mm - l.z_top_mm) * s}
                fill={FILL_VLAK}
              />
              <rect
                x={xMid - w / 2}
                y={Y0 + l.z_top_mm * s}
                width={w}
                height={(l.z_bot_mm - l.z_top_mm) * s}
                fill={`url(#${uid}-arc)`}
                stroke={STROKE}
                strokeWidth="0.6"
              />
            </g>
          );
        })
      )}

      {/* Zwaartelijn door alle panelen. */}
      <line
        x1={XA - 6}
        y1={yNa}
        x2={XD + WD}
        y2={yNa}
        stroke={DIM_COLOR}
        strokeWidth="0.55"
        strokeDasharray="7 2.5 1.5 2.5"
      />
      <text x={XA - 7} y={yNa - 1.6} fill={TEXT_COLOR} fontSize="6.3" fontStyle="italic" textAnchor="end">
        z_c = {maat(zCMm)}
      </text>

      {/* Maatgevende vezel: één rode streep door de panelen. */}
      <line
        x1={XA - 2}
        y1={yGov}
        x2={XD + WD}
        y2={yGov}
        stroke={LIMIET}
        strokeWidth="0.6"
        strokeDasharray="2 1.6"
      />
      <text x={XD + WD} y={yGov - 1.8} fill={LIMIET} fontSize="6.3" textAnchor="end">
        maatgevend z = {maat(zMaatgevendMm)} mm
      </text>

      <DimV x={XA - 22} y1={Y0} y2={Y0 + DRAW_H} label={`h = ${maat(hoogteMm)}`} />
      <text x={xMid} y={Y0 + DRAW_H + 13} fill={TEXT_COLOR} fontSize="7" textAnchor="middle">
        doorsnede{opSchaal ? "" : " (breedte niet op schaal)"}
      </text>

      {/* ---- Panelen 2–4: de spanningen ---- */}
      <Paneel
        punten={sigma}
        label="σx"
        xLinks={XB}
        breedte={WB}
        schaal={schaalSigma}
        s={s}
        xAs={XB + WB / 2}
        fill={FILL_SIGMA}
      />
      <Paneel
        punten={tau}
        label="τ"
        xLinks={XC}
        breedte={WC}
        schaal={schaalTau}
        s={s}
        xAs={XC}
        fill={FILL_TAU}
      />
      <Paneel
        punten={eq}
        label="σeq"
        xLinks={XD}
        breedte={WD}
        schaal={schaalEq}
        s={s}
        xAs={XD}
        fill={FILL_EQ}
        limiet={fDMpa > 0 ? fDMpa : undefined}
      />
    </svg>
  );
}
