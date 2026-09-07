/**
 * InteractieGrafiek — het N-M-interactiediagram (bezwijkomhullende) als SVG.
 *
 * De rekenkern levert per normaalkracht de momentweerstand M_Rd(N), voor
 * positief én negatief moment (`interaction_positive` / `interaction_negative`
 * van `ConcreteBeamCheckResult`). Samen vormen die een gesloten omhullende in
 * het (M, N)-vlak: alles binnen de omhullende is een combinatie die de
 * doorsnede kan opnemen, alles erbuiten niet.
 *
 * TEKENCONVENTIE — dezelfde als overal in dit programma en in de rekenkern:
 * N positief is TREK, N negatief is druk. Op de verticale as staat trek dus
 * bovenaan en druk onderaan. Dat is niet de klassieke kolomtekening (waar
 * druk vaak omhoog staat), maar wél consistent met de snedekrachten in de
 * rest van het rapport; de asbenoeming zegt het er expliciet bij.
 *
 * WAT DE GRAFIEK NIET IS: de unity check. Die wordt bepaald als
 * M_Ed / M_Rd(N_Ed) — een horizontale snede door de omhullende bij constante
 * N — en niet als afstand tot de omhullende. Het rekenpunt staat er daarom
 * mét zijn horizontale snede in: van de N-as tot de omhullende is M_Rd, en
 * het ruitje daarop is M_Ed.
 */
import { useMemo } from "react";
import type { InteractionPoint } from "../../lib/types/concrete/InteractionPoint";
import { THEMA_KLEUREN, type BetonTekenKleuren } from "./tekenkleuren";
import { nl } from "./wapeningskorf";

const BREEDTE = 380;
const HOOGTE = 280;
const MARGE = { links: 56, rechts: 14, boven: 14, onder: 40 };

interface Props {
  /** Omhullende bij positief moment (trek onder), M_Rd ≥ 0. */
  positief: InteractionPoint[];
  /** Omhullende bij negatief moment (trek boven), M_Rd ≥ 0 (wordt gespiegeld). */
  negatief: InteractionPoint[];
  /** Het rekenpunt: normaalkracht in kN (trek positief). */
  nEdKn?: number;
  /** Het rekenpunt: moment in kNm, mét teken. */
  mEdKnm?: number;
  /**
   * M_Rd bij N_Ed in kNm (teken volgt M_Ed), zoals de toets hem heeft
   * berekend. Ontbreekt die, dan wordt hij uit de omhullende geïnterpoleerd —
   * maar dat is een 21-puntsbenadering en levert een net iets ander getal dan
   * de toets. Geef hem dus mee zodra hij bekend is, zodat de figuur en de
   * toetstabel hetzelfde getal tonen.
   */
  mRdKnm?: number;
  /** Palet; standaard de theme-tokens, het rapport geeft RAPPORT_KLEUREN mee. */
  kleuren?: BetonTekenKleuren;
  className?: string;
}

/** Ronde asstap: 1, 2 of 5 × 10ⁿ zodat er ongeveer `doel` stappen komen. */
function mooieStap(bereik: number, doel = 5): number {
  if (!(bereik > 0)) return 1;
  const ruw = bereik / doel;
  const mag = 10 ** Math.floor(Math.log10(ruw));
  const r = ruw / mag;
  const stap = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
  return stap * mag;
}

/** Asindeling die het hele bereik omvat en 0 altijd meeneemt. */
function as(min: number, max: number, doel = 5): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const stap = mooieStap(hi - lo || 1, doel);
  const i0 = Math.floor(lo / stap - 1e-9);
  const i1 = Math.ceil(hi / stap + 1e-9);
  const ticks: number[] = [];
  for (let i = i0; i <= i1; i++) ticks.push(i * stap);
  return { min: i0 * stap, max: i1 * stap, ticks };
}

/** −0 en 1e-15 lezen als een richting die er niet is; die hoort weg. */
function nulSchoon(v: number, decimalen: number): string {
  const afgerond = Number(v.toFixed(decimalen));
  return nl(afgerond === 0 ? 0 : afgerond, decimalen);
}

export default function InteractieGrafiek({
  positief,
  negatief,
  nEdKn,
  mEdKnm,
  mRdKnm,
  kleuren = THEMA_KLEUREN,
  className,
}: Props) {
  const leeg = positief.length < 2 && negatief.length < 2;

  const { asM, asN, omtrek } = useMemo(() => {
    // De omhullende: heen langs de positieve tak (M ≥ 0, van trek naar druk),
    // terug langs de negatieve tak gespiegeld (−M_Rd). Sluit vanzelf.
    const heen = positief.map((p) => ({ m: p.m_rd_knm, n: p.n_kn }));
    const terug = [...negatief].reverse().map((p) => ({ m: -p.m_rd_knm, n: p.n_kn }));
    const punten = [...heen, ...terug];

    const mWaarden = punten.map((p) => p.m);
    const nWaarden = punten.map((p) => p.n);
    if (mEdKnm !== undefined) mWaarden.push(mEdKnm);
    if (mRdKnm !== undefined) mWaarden.push(mRdKnm, -mRdKnm);
    if (nEdKn !== undefined) nWaarden.push(nEdKn);

    return {
      asM: as(Math.min(...mWaarden, 0), Math.max(...mWaarden, 0)),
      asN: as(Math.min(...nWaarden, 0), Math.max(...nWaarden, 0)),
      omtrek: punten,
    };
  }, [positief, negatief, mEdKnm, mRdKnm, nEdKn]);

  const plotW = BREEDTE - MARGE.links - MARGE.rechts;
  const plotH = HOOGTE - MARGE.boven - MARGE.onder;
  const sx = (m: number) => MARGE.links + ((m - asM.min) / (asM.max - asM.min)) * plotW;
  // N loopt van beneden (druk, meest negatief) naar boven (trek).
  const sy = (n: number) => MARGE.boven + plotH - ((n - asN.min) / (asN.max - asN.min)) * plotH;

  const pad =
    omtrek.length > 1
      ? `${omtrek.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.m).toFixed(2)} ${sy(p.n).toFixed(2)}`).join(" ")} Z`
      : "";

  // M_Rd bij N_Ed: de horizontale snede die de unity check bepaalt. Bij
  // voorkeur het getal van de toets zelf; anders lineair geïnterpoleerd uit de
  // tak die bij het teken van M_Ed hoort.
  const mRdBijNEd = useMemo(() => {
    if (mRdKnm !== undefined) {
      return (mEdKnm ?? 0) < 0 ? -Math.abs(mRdKnm) : Math.abs(mRdKnm);
    }
    if (nEdKn === undefined) return null;
    const tak = (mEdKnm ?? 0) < 0 ? negatief : positief;
    if (tak.length < 2) return null;
    for (let i = 1; i < tak.length; i++) {
      const a = tak[i - 1];
      const b = tak[i];
      const lo = Math.min(a.n_kn, b.n_kn);
      const hi = Math.max(a.n_kn, b.n_kn);
      if (nEdKn < lo || nEdKn > hi) continue;
      const span = b.n_kn - a.n_kn;
      const t = Math.abs(span) < 1e-12 ? 0 : (nEdKn - a.n_kn) / span;
      const m = a.m_rd_knm + t * (b.m_rd_knm - a.m_rd_knm);
      return (mEdKnm ?? 0) < 0 ? -m : m;
    }
    return null;
  }, [nEdKn, mEdKnm, mRdKnm, positief, negatief]);

  const heeftPunt = nEdKn !== undefined && mEdKnm !== undefined;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${BREEDTE} ${HOOGTE}`}
      role="img"
      aria-label={
        leeg
          ? "N-M-interactiediagram (leeg)"
          : `N-M-interactiediagram; ${omtrek.length} punten op de bezwijkomhullende` +
            (heeftPunt
              ? `, rekenpunt N = ${nl(nEdKn, 1)} kN en M = ${nl(mEdKnm, 1)} kNm`
              : "")
      }
    >
      {/* Raster */}
      <g stroke={kleuren.raster} strokeWidth="0.6">
        {asN.ticks.map((t) => (
          <line key={`y${t}`} x1={MARGE.links} y1={sy(t)} x2={MARGE.links + plotW} y2={sy(t)} />
        ))}
        {asM.ticks.map((t) => (
          <line key={`x${t}`} x1={sx(t)} y1={MARGE.boven} x2={sx(t)} y2={MARGE.boven + plotH} />
        ))}
      </g>

      {/* De nul-assen zelf zwaarder: M = 0 en N = 0 zijn betekenisvolle lijnen. */}
      <g stroke={kleuren.maatlijn} strokeWidth="0.9">
        <line x1={sx(0)} y1={MARGE.boven} x2={sx(0)} y2={MARGE.boven + plotH} />
        <line x1={MARGE.links} y1={sy(0)} x2={MARGE.links + plotW} y2={sy(0)} />
      </g>

      {/* Astekst */}
      <g fill={kleuren.tekstMaat} fontSize="8">
        {asN.ticks.map((t) => (
          <text key={`yl${t}`} x={MARGE.links - 5} y={sy(t) + 2.8} textAnchor="end">
            {nulSchoon(t, 0)}
          </text>
        ))}
        {asM.ticks.map((t) => (
          <text key={`xl${t}`} x={sx(t)} y={MARGE.boven + plotH + 11} textAnchor="middle">
            {nulSchoon(t, 0)}
          </text>
        ))}
      </g>
      <text x={MARGE.links + plotW / 2} y={HOOGTE - 6} fill={kleuren.tekstMaat} fontSize="8.5" textAnchor="middle">
        moment M [kNm] — positief: trek onder
      </text>
      <text
        x={12}
        y={MARGE.boven + plotH / 2}
        fill={kleuren.tekstMaat}
        fontSize="8.5"
        textAnchor="middle"
        transform={`rotate(-90 12 ${MARGE.boven + plotH / 2})`}
      >
        normaalkracht N [kN] — trek +, druk −
      </text>

      {leeg && (
        <text x={MARGE.links + plotW / 2} y={MARGE.boven + plotH / 2} fill={kleuren.tekstMaat} fontSize="9" textAnchor="middle">
          Geen interactiediagram berekend
        </text>
      )}

      {/* De omhullende: gevuld vlak = het opneembare gebied. */}
      {!leeg && (
        <path
          d={pad}
          fill={kleuren.reeks}
          fillOpacity="0.12"
          stroke={kleuren.reeks}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}

      {/* Het rekenpunt met de horizontale snede die de unity check is. */}
      {!leeg && heeftPunt && (
        <g>
          {mRdBijNEd !== null && (
            <>
              <line
                x1={sx(0)}
                y1={sy(nEdKn)}
                x2={sx(mRdBijNEd)}
                y2={sy(nEdKn)}
                stroke={kleuren.rekenpunt}
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <circle cx={sx(mRdBijNEd)} cy={sy(nEdKn)} r="2.6" fill={kleuren.vlak} stroke={kleuren.rekenpunt} strokeWidth="1.4" />
              <text
                x={sx(mRdBijNEd) + (mRdBijNEd < 0 ? -5 : 5)}
                y={sy(nEdKn) + 11}
                fill={kleuren.tekstZwak}
                fontSize="7.5"
                textAnchor={mRdBijNEd < 0 ? "end" : "start"}
              >
                M_Rd = {nl(Math.abs(mRdBijNEd), 1)} kNm
              </text>
            </>
          )}
          <path
            d={`M${sx(mEdKnm).toFixed(2)} ${(sy(nEdKn) - 5).toFixed(2)} l5 5 l-5 5 l-5 -5 z`}
            fill={kleuren.rekenpunt}
          />
          <text
            x={sx(mEdKnm) + (mEdKnm < 0 ? 8 : -8)}
            y={sy(nEdKn) - 8}
            fill={kleuren.rekenpunt}
            fontSize="8"
            textAnchor={mEdKnm < 0 ? "start" : "end"}
          >
            ({nl(nEdKn, 1)} kN; {nl(mEdKnm, 1)} kNm)
          </text>
        </g>
      )}
    </svg>
  );
}
