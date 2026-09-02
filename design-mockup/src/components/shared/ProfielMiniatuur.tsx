/**
 * ProfielMiniatuur — compacte doorsnede-tekening voor de app-UI.
 *
 * Zelfde contourwiskunde als de rapporttekening (gedeeld via profielVorm.ts,
 * inclusief echte walsuitrondingen en kokerhoeken), maar dan één paneel,
 * thema-volgend en met alleen de hoofdmaten b en h. Bedoeld voor het
 * profielkeuzescherm: je ziet in één oogopslag welke vorm je kiest.
 *
 * Kleuren komen uit de theme-tokens, zodat de tekening in licht én donker
 * leesbaar blijft (het rapport gebruikt bewust vaste papierkleuren).
 */
import { shapePath, buitenmaten, type SectionShape } from "./profielVorm";

const KADER_W = 132;
const KADER_H = 132;
const MARGE_LINKS = 26;   // ruimte voor de h-maatlijn
const MARGE_BOVEN = 20;   // ruimte voor de b-maatlijn
const MARGE_REST = 10;
const TICK = 2.5;

interface Props {
  shape: SectionShape;
  /** Toon de b/h-maatlijnen (uit = alleen de contour). */
  maatvoering?: boolean;
  /** Toegankelijke omschrijving; standaard afgeleid van de maten. */
  titel?: string;
  className?: string;
}

/** Maat in mm als tekst: integer waar mogelijk, anders één decimaal. */
function maat(v: number): string {
  const afgerond = Math.round(v * 10) / 10;
  return Number.isInteger(afgerond) ? String(afgerond) : afgerond.toFixed(1).replace(".", ",");
}

function Pijl({ x, y, hoek }: { x: number; y: number; hoek: number }) {
  return (
    <polygon
      points="0,0 5,-1.7 5,1.7"
      fill="var(--theme-text-faint, #888)"
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${hoek})`}
    />
  );
}

export default function ProfielMiniatuur({ shape, maatvoering = true, titel, className }: Props) {
  const { b: bMm, h: hMm } = buitenmaten(shape);
  if (!(bMm > 0) || !(hMm > 0)) return null;

  const tekenW = KADER_W - MARGE_LINKS - MARGE_REST;
  const tekenH = KADER_H - MARGE_BOVEN - MARGE_REST;
  const s = Math.min(tekenW / bMm, tekenH / hMm);
  const w = bMm * s;
  const h = hMm * s;
  const x0 = MARGE_LINKS + (tekenW - w) / 2;
  const y0 = MARGE_BOVEN + (tekenH - h) / 2;

  const pad = shapePath(shape, s, x0, y0);
  const isHout = shape.type === "rect";
  const bLabel = shape.type === "tube" ? `d ${maat(bMm)}` : `b ${maat(bMm)}`;
  const hLabel = `h ${maat(hMm)}`;

  const yMaatB = y0 - 9;
  const xMaatH = x0 - 9;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${KADER_W} ${KADER_H}`}
      role="img"
      aria-label={titel ?? `Doorsnede ${bLabel} × ${hLabel} mm`}
    >
      <path
        d={pad.d}
        fillRule={pad.fillRule}
        fill={isHout ? "var(--theme-hout-vlak, #e9deca)" : "var(--theme-accent-soft, #dbe4f0)"}
        stroke="var(--theme-text, #39424e)"
        strokeWidth="1"
        strokeLinejoin="miter"
        opacity={0.95}
      />

      {maatvoering && (
        <g stroke="var(--theme-text-faint, #888)" strokeWidth="0.6">
          {/* b-maatlijn boven */}
          <line x1={x0} y1={yMaatB} x2={x0 + w} y2={yMaatB} />
          <line x1={x0} y1={yMaatB - TICK} x2={x0} y2={yMaatB + TICK} />
          <line x1={x0 + w} y1={yMaatB - TICK} x2={x0 + w} y2={yMaatB + TICK} />
          {/* h-maatlijn links */}
          <line x1={xMaatH} y1={y0} x2={xMaatH} y2={y0 + h} />
          <line x1={xMaatH - TICK} y1={y0} x2={xMaatH + TICK} y2={y0} />
          <line x1={xMaatH - TICK} y1={y0 + h} x2={xMaatH + TICK} y2={y0 + h} />
        </g>
      )}
      {maatvoering && (
        <>
          <Pijl x={x0} y={yMaatB} hoek={0} />
          <Pijl x={x0 + w} y={yMaatB} hoek={180} />
          <Pijl x={xMaatH} y={y0} hoek={90} />
          <Pijl x={xMaatH} y={y0 + h} hoek={270} />
          <text
            x={x0 + w / 2}
            y={yMaatB - 3}
            fill="var(--theme-text-muted, #666)"
            fontSize="7.5"
            textAnchor="middle"
          >
            {bLabel}
          </text>
          <text
            x={xMaatH - 3}
            y={y0 + h / 2}
            fill="var(--theme-text-muted, #666)"
            fontSize="7.5"
            textAnchor="middle"
            transform={`rotate(-90 ${(xMaatH - 3).toFixed(2)} ${(y0 + h / 2).toFixed(2)})`}
          >
            {hLabel}
          </text>
        </>
      )}
    </svg>
  );
}
