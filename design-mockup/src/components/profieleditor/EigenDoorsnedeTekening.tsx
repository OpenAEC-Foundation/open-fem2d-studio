/**
 * EigenDoorsnedeTekening — statische tekening van een bewaarde eigen
 * doorsnede, in twee stijlen:
 *
 *  - "rapport": papierstijl (vaste kleuren, print-echt), met b/h-maatlijnen
 *    en de zwaartepuntsassen — de tegenhanger van SectionSketch voor
 *    catalogusprofielen, bedoeld voor de sectie "Profielen & doorsneden";
 *  - "app": thema-volgend en compact, voor het profielkeuzescherm en de
 *    lijst van bewaarde doorsneden (tegenhanger van ProfielMiniatuur).
 *
 * Dezelfde contourwiskunde als het tekenvlak (lib/profieleditor/tekening.ts).
 */
import { omhullende } from "../../lib/profieleditor/geometrie";
import { fmtMaat } from "../../lib/profieleditor/format";
import { tekenItems } from "../../lib/profieleditor/tekening";
import type { EigenDoorsnede } from "../../lib/profieleditor/types";

interface Props {
  doorsnede: EigenDoorsnede;
  stijl: "rapport" | "app";
  className?: string;
  /** Toon b/h-maatlijnen en de zwaartepuntsassen (standaard aan). */
  maatvoering?: boolean;
}

const RAPPORT = {
  vulling: "#dbe4f0",
  gat: "#ffffff",
  lijn: "#39424e",
  maat: "#5b6470",
  tekst: "#333333",
};
const APP = {
  vulling: "var(--theme-accent-soft, #dbe4f0)",
  gat: "var(--theme-bg, #fff)",
  lijn: "var(--theme-text, #39424e)",
  maat: "var(--theme-text-faint, #888)",
  tekst: "var(--theme-text-muted, #666)",
};

export default function EigenDoorsnedeTekening({ doorsnede, stijl, className, maatvoering = true }: Props) {
  const kleuren = stijl === "rapport" ? RAPPORT : APP;
  const o = doorsnede.ontwerp;
  const delen = doorsnede.motor.delen;
  const kader = omhullende(o, delen);
  if (!kader) return null;

  const items = tekenItems(o, delen);
  const bw = Math.max(kader.yMax - kader.yMin, 1);
  const bh = Math.max(kader.zMax - kader.zMin, 1);

  const W = 220;
  const H = 200;
  const ML = maatvoering ? 34 : 8;
  const MT = maatvoering ? 26 : 8;
  const MR = maatvoering ? 22 : 8;
  const MB = maatvoering ? 14 : 8;
  const tekenW = W - ML - MR;
  const tekenH = H - MT - MB;
  const s = Math.min(tekenW / bw, tekenH / bh);
  const ox = ML + (tekenW - bw * s) / 2 - kader.yMin * s;
  const oy = MT + (tekenH - bh * s) / 2 + kader.zMax * s;
  const X = (y: number) => ox + y * s;
  const Y = (z: number) => oy - z * s;

  const e = doorsnede.eigenschappen;
  const zx = X(e.y_c_mm);
  const zy = Y(e.z_c_mm);
  const yMaat = Y(kader.zMax) - 9;
  const xMaat = X(kader.yMin) - 9;
  const dik = stijl === "rapport" ? 1.1 : 1;

  return (
    <svg
      className={className ?? (stijl === "rapport" ? "rpt-section-sketch" : undefined)}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Doorsnede ${doorsnede.naam}, ${fmtMaat(bw)} × ${fmtMaat(bh)} mm`}
    >
      <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`}>
        {items.map((it) => (
          <path
            key={`${it.soort}-${it.id}`}
            d={it.d}
            transform={it.transform}
            fillRule={it.fillRule}
            fill={it.soort === "gat" ? kleuren.gat : kleuren.vulling}
            stroke={kleuren.lijn}
            strokeWidth={dik}
            strokeDasharray={it.soort === "gat" ? "3 2" : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="miter"
          />
        ))}
      </g>

      {maatvoering && (
        <g>
          {/* Zwaartepuntsassen */}
          <line x1={X(kader.yMin) - 6} y1={zy} x2={X(kader.yMax) + 6} y2={zy} stroke={kleuren.maat} strokeWidth="0.7" strokeDasharray="6 2 1.5 2" />
          <line x1={zx} y1={Y(kader.zMax) - 6} x2={zx} y2={Y(kader.zMin) + 6} stroke={kleuren.maat} strokeWidth="0.7" strokeDasharray="6 2 1.5 2" />
          <text x={X(kader.yMax) + 8} y={zy + 2.5} fill={kleuren.tekst} fontSize="7" fontStyle="italic">y</text>
          <text x={zx + 3} y={Y(kader.zMax) - 8} fill={kleuren.tekst} fontSize="7" fontStyle="italic">z</text>
          <circle cx={zx} cy={zy} r="2" fill="none" stroke={kleuren.lijn} strokeWidth="0.8" />

          {/* Maatlijnen */}
          <g stroke={kleuren.maat} strokeWidth="0.6">
            <line x1={X(kader.yMin)} y1={yMaat} x2={X(kader.yMax)} y2={yMaat} />
            <line x1={X(kader.yMin)} y1={yMaat - 2.5} x2={X(kader.yMin)} y2={yMaat + 2.5} />
            <line x1={X(kader.yMax)} y1={yMaat - 2.5} x2={X(kader.yMax)} y2={yMaat + 2.5} />
            <line x1={xMaat} y1={Y(kader.zMax)} x2={xMaat} y2={Y(kader.zMin)} />
            <line x1={xMaat - 2.5} y1={Y(kader.zMax)} x2={xMaat + 2.5} y2={Y(kader.zMax)} />
            <line x1={xMaat - 2.5} y1={Y(kader.zMin)} x2={xMaat + 2.5} y2={Y(kader.zMin)} />
          </g>
          <text x={(X(kader.yMin) + X(kader.yMax)) / 2} y={yMaat - 3} fill={kleuren.tekst} fontSize="7.5" textAnchor="middle">
            b = {fmtMaat(bw)}
          </text>
          <text
            x={xMaat - 3}
            y={(Y(kader.zMax) + Y(kader.zMin)) / 2}
            fill={kleuren.tekst}
            fontSize="7.5"
            textAnchor="middle"
            transform={`rotate(-90 ${xMaat - 3} ${(Y(kader.zMax) + Y(kader.zMin)) / 2})`}
          >
            h = {fmtMaat(bh)}
          </text>
        </g>
      )}
    </svg>
  );
}
