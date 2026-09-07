/**
 * EiVerloopGrafiek — de buigstijfheid EI langs één betonstaaf, als stapfiguur
 * met de ongescheurde E_c·I_c als referentielijn.
 *
 * DEZELFDE FIGUUR ALS OP HET CANVAS, MAAR OP PAPIER. De canvas-weergave
 * (`FemResultsOverlay`, stand "EI") tekent hetzelfde beeld langs de staafas in
 * het model: een stapfiguur van de EI per stuk, een gestreepte referentielijn
 * op de ongescheurde waarde, en een vlak ertussen zodat de terugval als "hap"
 * leest. De vraag van een constructeur is daar niet "hoe groot is EI" maar
 * "wáár is de ligger gescheurd", en die vraag is op papier dezelfde. Wat hier
 * anders is, is wat papier nodig heeft en het canvas niet: een eigen assenstelsel
 * met getallen (het canvas leunt op de modelschaal), en vaste documentkleuren.
 *
 * De gegevens komen uit hetzelfde kernantwoord als de segmenttabel eronder,
 * dus figuur en tabel kunnen niet uit elkaar lopen.
 *
 * Een segment zonder stijfheid (de kern gaf er geen) laat een GAT in de
 * figuur, met een merkteken op de as. Doortrekken zou een waarde suggereren
 * die er niet is.
 */
import { ticks } from "./MNKappaGrafiek";
import { THEMA_KLEUREN, type BetonTekenKleuren } from "./tekenkleuren";
import { nl } from "./wapeningskorf";

const BREEDTE = 560;
const HOOGTE = 210;
const MARGE = { links: 62, rechts: 14, boven: 26, onder: 34 };

/** Eén segment zoals de figuur het nodig heeft — een uitsnede van `SegmentStiffness`. */
export interface EiSegment {
  xStartMm: number;
  xEndMm: number;
  /** De gebruikte stijfheid in kNm²; `null` = de kern gaf er geen. */
  eiKnm2: number | null;
  /** `null` in ronde 0 (nog niets gerekend). */
  gescheurd: boolean | null;
  /** Is EI op de numerieke ondergrens geklemd? Dan is het geen rekenuitkomst. */
  geklemd: boolean;
}

interface Props {
  segmenten: EiSegment[];
  /** E_c·I_c van de bruto doorsnede, kNm² — vergelijkingswaarde. */
  eiOngescheurdKnm2: number;
  /** Staaflengte in mm; bepaalt de x-as. */
  lengteMm: number;
  /** Palet; standaard de theme-tokens, het rapport geeft RAPPORT_KLEUREN mee. */
  kleuren?: BetonTekenKleuren;
  className?: string;
  /** Toegankelijke omschrijving (aria-label). */
  titel?: string;
}

export default function EiVerloopGrafiek({
  segmenten,
  eiOngescheurdKnm2,
  lengteMm,
  kleuren = THEMA_KLEUREN,
  className,
  titel,
}: Props) {
  const plotW = BREEDTE - MARGE.links - MARGE.rechts;
  const plotH = HOOGTE - MARGE.boven - MARGE.onder;
  const lengteM = lengteMm / 1000;

  const eiWaarden = segmenten
    .map((s) => s.eiKnm2)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const yT = ticks(Math.max(eiOngescheurdKnm2, ...eiWaarden, 1));
  const yMax = yT[yT.length - 1];
  const xT = ticks(lengteM > 0 ? lengteM : 1);
  const xMax = xT[xT.length - 1];
  // Decimalen van de x-as uit de STAP, niet uit de waarde: anders staat er
  // "0,0  1  2" op één as. Bij een korte staaf is de stap een halve meter en
  // is één decimaal nodig.
  const xDec = xT.length > 1 && xT[1] - xT[0] < 1 ? 1 : 0;

  const sx = (xMm: number) => MARGE.links + (xMm / 1000 / xMax) * plotW;
  const sy = (ei: number) => MARGE.boven + plotH - (Math.max(0, ei) / yMax) * plotH;
  const yBasis = MARGE.boven + plotH;

  const reeksKleur = kleuren.reeks;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${BREEDTE} ${HOOGTE}`}
      role="img"
      aria-label={
        titel ??
        `Buigstijfheid EI langs de staaf; ongescheurd E_c·I_c = ${nl(eiOngescheurdKnm2, 0)} kNm²`
      }
    >
      {/* Raster en assen */}
      <g stroke={kleuren.raster} strokeWidth="0.6">
        {yT.map((t) => (
          <line key={`y${t}`} x1={MARGE.links} y1={sy(t)} x2={MARGE.links + plotW} y2={sy(t)} />
        ))}
        {xT.map((t) => (
          <line
            key={`x${t}`}
            x1={MARGE.links + (t / xMax) * plotW}
            y1={MARGE.boven}
            x2={MARGE.links + (t / xMax) * plotW}
            y2={yBasis}
          />
        ))}
      </g>
      <g stroke={kleuren.maatlijn} strokeWidth="0.8">
        <line x1={MARGE.links} y1={yBasis} x2={MARGE.links + plotW} y2={yBasis} />
        <line x1={MARGE.links} y1={MARGE.boven} x2={MARGE.links} y2={yBasis} />
      </g>
      <g fill={kleuren.tekstMaat} fontSize="8">
        {yT.map((t) => (
          <text key={`yl${t}`} x={MARGE.links - 5} y={sy(t) + 2.8} textAnchor="end">
            {nl(t, 0)}
          </text>
        ))}
        {xT.map((t) => (
          <text
            key={`xl${t}`}
            x={MARGE.links + (t / xMax) * plotW}
            y={yBasis + 11}
            textAnchor="middle"
          >
            {nl(t, xDec)}
          </text>
        ))}
      </g>
      <text
        x={MARGE.links + plotW / 2}
        y={HOOGTE - 6}
        fill={kleuren.tekstMaat}
        fontSize="8.5"
        textAnchor="middle"
      >
        plaats langs de staaf x [m]
      </text>
      <text
        x={12}
        y={MARGE.boven + plotH / 2}
        fill={kleuren.tekstMaat}
        fontSize="8.5"
        textAnchor="middle"
        transform={`rotate(-90 12 ${MARGE.boven + plotH / 2})`}
      >
        buigstijfheid EI [kNm²]
      </text>

      {/* Per segment een staaf tot de eigen EI. Gescheurde segmenten donkerder
          dan ongescheurde, zodat het onderscheid ook in grijstinten leesbaar
          blijft en niet alleen in kleur. */}
      {segmenten.map((s, i) => {
        if (s.eiKnm2 === null || !Number.isFinite(s.eiKnm2)) {
          return (
            <text
              key={`gat${i}`}
              x={(sx(s.xStartMm) + sx(s.xEndMm)) / 2}
              y={yBasis - 4}
              fill={kleuren.rekenpunt}
              fontSize="8"
              textAnchor="middle"
            >
              geen EI
            </text>
          );
        }
        const x0 = sx(s.xStartMm);
        const x1 = sx(s.xEndMm);
        const y = sy(s.eiKnm2);
        return (
          <rect
            key={`seg${i}`}
            x={x0}
            y={y}
            width={Math.max(0.2, x1 - x0)}
            height={yBasis - y}
            fill={reeksKleur}
            fillOpacity={s.gescheurd ? 0.32 : 0.1}
            stroke={reeksKleur}
            strokeWidth="0.7"
            strokeOpacity="0.6"
          />
        );
      })}

      {/* De bovenrand als doorlopende stapfiguur — dat is de EI-lijn zelf. */}
      {segmenten.map((s, i) => {
        if (s.eiKnm2 === null || !Number.isFinite(s.eiKnm2)) return null;
        const y = sy(s.eiKnm2);
        const vorige = segmenten[i - 1];
        const sprong =
          vorige && vorige.eiKnm2 !== null && Number.isFinite(vorige.eiKnm2)
            ? sy(vorige.eiKnm2)
            : null;
        return (
          <g key={`top${i}`} stroke={reeksKleur} strokeWidth="1.8" fill="none">
            <line x1={sx(s.xStartMm)} y1={y} x2={sx(s.xEndMm)} y2={y} />
            {sprong !== null && (
              <line x1={sx(s.xStartMm)} y1={sprong} x2={sx(s.xStartMm)} y2={y} />
            )}
            {s.geklemd && (
              <circle
                cx={(sx(s.xStartMm) + sx(s.xEndMm)) / 2}
                cy={y}
                r="2.6"
                fill={kleuren.rekenpunt}
                stroke="none"
              />
            )}
          </g>
        );
      })}

      {/* Referentielijn: de ongescheurde stijfheid. In de UGT is dat een
          VERGELIJKINGSWAARDE en geen tak van de kromme — 5.8.6(5) laat de
          betontrek weg, dus daar bestaat geen ongescheurde toestand. */}
      <line
        x1={MARGE.links}
        y1={sy(eiOngescheurdKnm2)}
        x2={MARGE.links + plotW}
        y2={sy(eiOngescheurdKnm2)}
        stroke={kleuren.lijn}
        strokeWidth="1"
        strokeDasharray="5 3"
      />
      <text
        x={MARGE.links + plotW - 2}
        y={sy(eiOngescheurdKnm2) - 4}
        fill={kleuren.tekstZwak}
        fontSize="8"
        textAnchor="end"
      >
        E_c·I_c = {nl(eiOngescheurdKnm2, 0)} kNm²
      </text>

      {/* Legenda: twee vlakjes en de streeplijn, zodat de figuur zonder
          bijschrift te lezen is. */}
      <g fontSize="7.5" fill={kleuren.tekstZwak}>
        <rect x={MARGE.links} y={7} width="9" height="9" fill={reeksKleur} fillOpacity="0.32" stroke={reeksKleur} strokeWidth="0.7" />
        <text x={MARGE.links + 12} y={14.5}>gescheurd</text>
        <rect x={MARGE.links + 72} y={7} width="9" height="9" fill={reeksKleur} fillOpacity="0.1" stroke={reeksKleur} strokeWidth="0.7" />
        <text x={MARGE.links + 84} y={14.5}>ongescheurd</text>
        <line x1={MARGE.links + 156} y1={11.5} x2={MARGE.links + 174} y2={11.5} stroke={kleuren.lijn} strokeWidth="1" strokeDasharray="5 3" />
        <text x={MARGE.links + 178} y={14.5}>E_c·I_c (vergelijkingswaarde)</text>
      </g>
    </svg>
  );
}
