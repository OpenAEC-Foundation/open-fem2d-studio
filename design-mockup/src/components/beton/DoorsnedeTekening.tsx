/**
 * DoorsnedeTekening — de betondoorsnede met wapeningskorf als SVG.
 *
 * Toont wat de constructeur wil zien: de rechthoek b × h, de beugel op de
 * dekking, en de hoofdwapening als cirkels op ware schaal — het aantal
 * staven en hun diameter zijn direct af te lezen, met "3Ø16" / "2Ø12" als
 * label. Maatlijnen voor b (boven), h (links) en de nuttige hoogte d
 * (rechts), in de stijl van ProfielMiniatuur.
 *
 * Kleuren komen uit de theme-tokens, zodat de tekening in licht én donker
 * leesbaar blijft.
 */
import { asAfstandMm, maat, nuttigeHoogteMm, rijLabel, staafPosities, type Wapeningskorf } from "./wapeningskorf";

const KADER_W = 220;
const KADER_H = 220;
const MARGE_LINKS = 30;
const MARGE_RECHTS = 34;
const MARGE_BOVEN = 22;
const MARGE_ONDER = 18;
const TICK = 3;

interface Props {
  korf: Wapeningskorf;
  /** Toon de maatlijnen b, h en d (uit = alleen de doorsnede). */
  maatvoering?: boolean;
  className?: string;
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

export default function DoorsnedeTekening({ korf, maatvoering = true, className }: Props) {
  const bMm = korf.breedteMm;
  const hMm = korf.hoogteMm;
  if (!(bMm > 0) || !(hMm > 0)) return null;

  const tekenW = KADER_W - MARGE_LINKS - MARGE_RECHTS;
  const tekenH = KADER_H - MARGE_BOVEN - MARGE_ONDER;
  const s = Math.min(tekenW / bMm, tekenH / hMm);
  const w = bMm * s;
  const h = hMm * s;
  const x0 = MARGE_LINKS + (tekenW - w) / 2;
  const y0 = MARGE_BOVEN + (tekenH - h) / 2;

  // z loopt in het model van onder naar boven; op het scherm van boven naar onder.
  const sx = (xMm: number) => x0 + xMm * s;
  const sy = (zMm: number) => y0 + (hMm - zMm) * s;

  const c = korf.korf.cover_mm;
  const dBgl = korf.korf.stirrup_diameter_mm;
  const staven = staafPosities(korf.korf, bMm, hMm);
  const heeftOnder = korf.korf.bottom.count > 0 && korf.korf.bottom.diameter_mm > 0;
  const heeftBoven = korf.korf.top.count > 0 && korf.korf.top.diameter_mm > 0;
  const d = nuttigeHoogteMm(korf.korf, hMm);

  // Beugel: hartlijn op c + Ø/2 van de rand, lijndikte Ø; buigstraal ≈ 2Ø (visueel).
  const beugelInzet = c + dBgl / 2;
  const beugelPast = dBgl > 0 && 2 * beugelInzet < Math.min(bMm, hMm);

  const yMaatB = y0 - 9;
  const xMaatH = x0 - 10;
  const xMaatD = x0 + w + 10;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${KADER_W} ${KADER_H}`}
      role="img"
      aria-label={`Betondoorsnede ${maat(bMm)} × ${maat(hMm)} mm, ${rijLabel(korf.korf.bottom)} onder, ${rijLabel(korf.korf.top)} boven`}
    >
      {/* Beton */}
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        fill="var(--theme-beton-vlak, var(--theme-border, #e6e5e1))"
        stroke="var(--theme-text, #39424e)"
        strokeWidth="1"
      />

      {/* Beugel */}
      {beugelPast && (
        <rect
          x={sx(beugelInzet)}
          y={sy(hMm - beugelInzet)}
          width={(bMm - 2 * beugelInzet) * s}
          height={(hMm - 2 * beugelInzet) * s}
          rx={Math.max(1.5, 2 * dBgl * s)}
          fill="none"
          stroke="var(--theme-text-secondary, #666)"
          strokeWidth={Math.max(0.8, dBgl * s)}
          strokeLinejoin="round"
        />
      )}

      {/* Hoofdwapening op ware schaal */}
      {staven.map((st, i) => (
        <circle
          key={i}
          cx={sx(st.x)}
          cy={sy(st.z)}
          r={Math.max(1.2, (st.diameter / 2) * s)}
          fill="var(--theme-text, #39424e)"
        />
      ))}

      {/* Labels van de rijen: in het beton, naast de staven */}
      {heeftOnder && (
        <text
          x={x0 + w / 2}
          y={sy(asAfstandMm(korf.korf, korf.korf.bottom)) - Math.max(3, (korf.korf.bottom.diameter_mm / 2) * s) - 2.5}
          fill="var(--theme-text-secondary, #555)"
          fontSize="7.5"
          textAnchor="middle"
        >
          {rijLabel(korf.korf.bottom)}
        </text>
      )}
      {heeftBoven && (
        <text
          x={x0 + w / 2}
          y={sy(hMm - asAfstandMm(korf.korf, korf.korf.top)) + Math.max(3, (korf.korf.top.diameter_mm / 2) * s) + 8}
          fill="var(--theme-text-secondary, #555)"
          fontSize="7.5"
          textAnchor="middle"
        >
          {rijLabel(korf.korf.top)}
        </text>
      )}

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
          {/* d-maatlijn rechts: van bovenrand tot as onderwapening */}
          {heeftOnder && (
            <>
              <line x1={xMaatD} y1={y0} x2={xMaatD} y2={sy(hMm - d)} />
              <line x1={xMaatD - TICK} y1={y0} x2={xMaatD + TICK} y2={y0} />
              <line x1={xMaatD - TICK} y1={sy(hMm - d)} x2={xMaatD + TICK} y2={sy(hMm - d)} />
              <line x1={x0 + w} y1={sy(hMm - d)} x2={xMaatD} y2={sy(hMm - d)} strokeDasharray="2 2" />
            </>
          )}
        </g>
      )}
      {maatvoering && (
        <>
          <Pijl x={x0} y={yMaatB} hoek={0} />
          <Pijl x={x0 + w} y={yMaatB} hoek={180} />
          <Pijl x={xMaatH} y={y0} hoek={90} />
          <Pijl x={xMaatH} y={y0 + h} hoek={270} />
          <text x={x0 + w / 2} y={yMaatB - 3} fill="var(--theme-text-muted, #666)" fontSize="7.5" textAnchor="middle">
            b {maat(bMm)}
          </text>
          <text
            x={xMaatH - 3}
            y={y0 + h / 2}
            fill="var(--theme-text-muted, #666)"
            fontSize="7.5"
            textAnchor="middle"
            transform={`rotate(-90 ${(xMaatH - 3).toFixed(2)} ${(y0 + h / 2).toFixed(2)})`}
          >
            h {maat(hMm)}
          </text>
          {heeftOnder && (
            <>
              <Pijl x={xMaatD} y={y0} hoek={90} />
              <Pijl x={xMaatD} y={sy(hMm - d)} hoek={270} />
              <text
                x={xMaatD + 3}
                y={y0 + (h * d) / hMm / 2}
                fill="var(--theme-text-muted, #666)"
                fontSize="7.5"
                textAnchor="middle"
                transform={`rotate(90 ${(xMaatD + 3).toFixed(2)} ${(y0 + (h * d) / hMm / 2).toFixed(2)})`}
              >
                d {maat(d)}
              </text>
            </>
          )}
          <text x={x0 + w / 2} y={y0 + h + 12} fill="var(--theme-text-muted, #666)" fontSize="7" textAnchor="middle">
            dekking {maat(c)}{dBgl > 0 ? `, beugel Ø${maat(dBgl)}` : ""}
          </text>
        </>
      )}
    </svg>
  );
}
