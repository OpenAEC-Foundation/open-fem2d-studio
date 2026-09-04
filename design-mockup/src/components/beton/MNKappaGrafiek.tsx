/**
 * MNKappaGrafiek — het M-κ-diagram bij vaste N als SVG-grafiek.
 *
 * Eén reeks (M als functie van κ) met twee gemarkeerde punten: het vloeien
 * van de eerste wapeningslaag en het bezwijkpunt; optioneel M_Ed als
 * stippellijn. Bij aanwijzen met de muis verschijnt een verticale hulplijn
 * met de waarden van het dichtstbijzijnde diagrampunt (κ, M, ε_c, x).
 *
 * Opmaak: dunne lijn (2 px) in de accentkleur, rustige rasterlijnen, tekst
 * in de tekstkleuren van het thema — nooit in de reekskleur. Getallen in
 * nl-notatie. De kromming staat in 10⁻³/m.
 */
import { useMemo, useRef, useState } from "react";
import type { MnKappaDiagram } from "../../lib/types/concrete/MnKappaDiagram";
import { nl } from "./wapeningskorf";

const BREEDTE = 380;
const HOOGTE = 250;
const MARGE = { links: 52, rechts: 16, boven: 16, onder: 40 };

interface Props {
  diagram: MnKappaDiagram | null;
  /** Rekenmoment ter vergelijking, kNm (absolute waarde wordt getoond). */
  mEdKnm?: number;
  className?: string;
}

/** Ronde asstap: 1, 2 of 5 × 10ⁿ zodat er ongeveer `doel` stappen komen. */
function mooieStap(max: number, doel = 5): number {
  if (!(max > 0)) return 1;
  const ruw = max / doel;
  const mag = 10 ** Math.floor(Math.log10(ruw));
  const r = ruw / mag;
  const stap = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
  return stap * mag;
}

function ticks(max: number): number[] {
  const stap = mooieStap(max);
  const n = Math.ceil(max / stap - 1e-9);
  const uit: number[] = [];
  for (let i = 0; i <= n; i++) uit.push(i * stap);
  return uit;
}

function bezwijkLabel(d: MnKappaDiagram): string {
  switch (d.failure_mode) {
    case "ConcreteCrushing": return "bezwijken beton";
    case "SteelRupture": return "bezwijken staal";
    case "SteelStrainLimit": return "rekgrens staal";
    case "AxialCapacityExceeded": return "N te groot";
    default: return "geen evenwicht";
  }
}

export default function MNKappaGrafiek({ diagram, mEdKnm, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const punten = useMemo(() => diagram?.points ?? [], [diagram]);
  const leeg = punten.length < 2;

  const { xMax, yMax, xTicks, yTicks } = useMemo(() => {
    const kMax = punten.reduce((m, p) => Math.max(m, p.kappa_per_m * 1e3), 0);
    const mMaxData = punten.reduce((m, p) => Math.max(m, p.m_knm), 0);
    const mMax = Math.max(mMaxData, mEdKnm !== undefined ? Math.abs(mEdKnm) : 0);
    const xT = ticks(kMax > 0 ? kMax : 1);
    const yT = ticks(mMax > 0 ? mMax : 1);
    return { xMax: xT[xT.length - 1], yMax: yT[yT.length - 1], xTicks: xT, yTicks: yT };
  }, [punten, mEdKnm]);

  const plotW = BREEDTE - MARGE.links - MARGE.rechts;
  const plotH = HOOGTE - MARGE.boven - MARGE.onder;
  const sx = (kappaPerM: number) => MARGE.links + (kappaPerM * 1e3 / xMax) * plotW;
  const sy = (mKnm: number) => MARGE.boven + plotH - (Math.max(0, mKnm) / yMax) * plotH;

  const pad = useMemo(
    () => punten.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.kappa_per_m).toFixed(2)} ${sy(p.m_knm).toFixed(2)}`).join(" "),
    // sx/sy hangen alleen van xMax/yMax af.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [punten, xMax, yMax],
  );

  const vloeiIndex = useMemo(() => {
    if (!diagram || diagram.kappa_y_per_m === null) return null;
    const ky = diagram.kappa_y_per_m;
    let beste = 0;
    for (let i = 1; i < punten.length; i++) {
      if (Math.abs(punten[i].kappa_per_m - ky) < Math.abs(punten[beste].kappa_per_m - ky)) beste = i;
    }
    return beste;
  }, [diagram, punten]);

  function bijMuis(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || leeg) return;
    const rect = svg.getBoundingClientRect();
    const xView = ((e.clientX - rect.left) / rect.width) * BREEDTE;
    const kappa = ((xView - MARGE.links) / plotW) * xMax * 1e-3;
    let beste = 0;
    for (let i = 1; i < punten.length; i++) {
      if (Math.abs(punten[i].kappa_per_m - kappa) < Math.abs(punten[beste].kappa_per_m - kappa)) beste = i;
    }
    setHover(beste);
  }

  const hp = hover !== null && !leeg ? punten[hover] : null;
  const laatste = punten[punten.length - 1];

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${BREEDTE} ${HOOGTE}`}
      role="img"
      aria-label={
        diagram && !leeg
          ? `M-κ-diagram bij N = ${nl(diagram.n_kn, 1)} kN; M_Rd = ${nl(diagram.m_max_knm, 1)} kNm bij κ = ${nl(diagram.kappa_u_per_m * 1e3, 2)} per duizend meter`
          : "M-κ-diagram (leeg)"
      }
      onMouseMove={bijMuis}
      onMouseLeave={() => setHover(null)}
    >
      {/* Raster en assen */}
      <g stroke="var(--theme-border, #ddd)" strokeWidth="0.6">
        {yTicks.map((t) => (
          <line key={`y${t}`} x1={MARGE.links} y1={sy(t)} x2={MARGE.links + plotW} y2={sy(t)} />
        ))}
        {xTicks.map((t) => (
          <line key={`x${t}`} x1={MARGE.links + (t / xMax) * plotW} y1={MARGE.boven} x2={MARGE.links + (t / xMax) * plotW} y2={MARGE.boven + plotH} />
        ))}
      </g>
      <g stroke="var(--theme-text-faint, #999)" strokeWidth="0.8">
        <line x1={MARGE.links} y1={MARGE.boven + plotH} x2={MARGE.links + plotW} y2={MARGE.boven + plotH} />
        <line x1={MARGE.links} y1={MARGE.boven} x2={MARGE.links} y2={MARGE.boven + plotH} />
      </g>
      <g fill="var(--theme-text-secondary, #666)" fontSize="8">
        {yTicks.map((t) => (
          <text key={`yl${t}`} x={MARGE.links - 5} y={sy(t) + 2.8} textAnchor="end">
            {nl(t, 0)}
          </text>
        ))}
        {xTicks.map((t) => (
          <text key={`xl${t}`} x={MARGE.links + (t / xMax) * plotW} y={MARGE.boven + plotH + 11} textAnchor="middle">
            {nl(t, t < 1 ? 1 : 0)}
          </text>
        ))}
      </g>
      <text x={MARGE.links + plotW / 2} y={HOOGTE - 6} fill="var(--theme-text-muted, #666)" fontSize="8.5" textAnchor="middle">
        kromming κ [10⁻³/m]
      </text>
      <text
        x={12}
        y={MARGE.boven + plotH / 2}
        fill="var(--theme-text-muted, #666)"
        fontSize="8.5"
        textAnchor="middle"
        transform={`rotate(-90 12 ${MARGE.boven + plotH / 2})`}
      >
        moment M [kNm]
      </text>

      {leeg && (
        <text x={MARGE.links + plotW / 2} y={MARGE.boven + plotH / 2} fill="var(--theme-text-muted, #666)" fontSize="9" textAnchor="middle">
          {diagram ? `Geen diagram: ${bezwijkLabel(diagram)}` : "Nog geen diagram berekend"}
        </text>
      )}

      {/* M_Ed als referentielijn */}
      {!leeg && mEdKnm !== undefined && Math.abs(mEdKnm) > 0 && (
        <g>
          <line
            x1={MARGE.links}
            y1={sy(Math.abs(mEdKnm))}
            x2={MARGE.links + plotW}
            y2={sy(Math.abs(mEdKnm))}
            stroke="var(--theme-text-muted, #666)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x={MARGE.links + plotW - 2} y={sy(Math.abs(mEdKnm)) - 3} fill="var(--theme-text-secondary, #555)" fontSize="8" textAnchor="end">
            M_Ed = {nl(Math.abs(mEdKnm), 1)} kNm
          </text>
        </g>
      )}

      {/* De reeks */}
      {!leeg && (
        <path d={pad} fill="none" stroke="var(--theme-accent, #D97706)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* Vloeipunt en bezwijkpunt, direct gelabeld */}
      {!leeg && vloeiIndex !== null && diagram && diagram.m_y_knm !== null && diagram.kappa_y_per_m !== null && (
        <g>
          <circle cx={sx(diagram.kappa_y_per_m)} cy={sy(diagram.m_y_knm)} r="4.5" fill="var(--theme-surface, #fff)" stroke="var(--theme-accent, #D97706)" strokeWidth="2" />
          <text x={sx(diagram.kappa_y_per_m) + 7} y={sy(diagram.m_y_knm) + 10} fill="var(--theme-text-secondary, #555)" fontSize="8">
            vloeien {nl(diagram.m_y_knm, 1)} kNm
          </text>
        </g>
      )}
      {!leeg && diagram && laatste && (
        <g>
          <circle cx={sx(laatste.kappa_per_m)} cy={sy(laatste.m_knm)} r="4.5" fill="var(--theme-accent, #D97706)" />
          <text x={sx(laatste.kappa_per_m) - 7} y={sy(laatste.m_knm) - 6} fill="var(--theme-text-secondary, #555)" fontSize="8" textAnchor="end">
            {bezwijkLabel(diagram)} {nl(laatste.m_knm, 1)} kNm
          </text>
        </g>
      )}

      {/* Aanwijzen: hulplijn + waarden */}
      {hp && (
        <g pointerEvents="none">
          <line x1={sx(hp.kappa_per_m)} y1={MARGE.boven} x2={sx(hp.kappa_per_m)} y2={MARGE.boven + plotH} stroke="var(--theme-text-muted, #666)" strokeWidth="0.8" strokeDasharray="2 2" />
          <circle cx={sx(hp.kappa_per_m)} cy={sy(hp.m_knm)} r="3.5" fill="var(--theme-surface, #fff)" stroke="var(--theme-accent, #D97706)" strokeWidth="1.5" />
          {(() => {
            const regels = [
              `κ = ${nl(hp.kappa_per_m * 1e3, 2)}·10⁻³/m`,
              `M = ${nl(hp.m_knm, 1)} kNm`,
              `ε_c = ${nl(Math.max(hp.eps_top, hp.eps_bottom) * 1e3, 2)} ‰`,
              `x = ${nl(hp.x_mm, 0)} mm`,
            ];
            const bw = 112;
            const bh = 12 * regels.length + 8;
            const links = sx(hp.kappa_per_m) + 10 + bw > BREEDTE - MARGE.rechts;
            const bx = links ? sx(hp.kappa_per_m) - 10 - bw : sx(hp.kappa_per_m) + 10;
            const by = Math.min(Math.max(MARGE.boven, sy(hp.m_knm) - bh / 2), MARGE.boven + plotH - bh);
            return (
              <g>
                <rect x={bx} y={by} width={bw} height={bh} rx="3" fill="var(--theme-surface, #fff)" stroke="var(--theme-border, #ccc)" strokeWidth="0.8" />
                {regels.map((r, i) => (
                  <text key={i} x={bx + 6} y={by + 12 + i * 12} fill="var(--theme-text, #333)" fontSize="8">
                    {r}
                  </text>
                ))}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
