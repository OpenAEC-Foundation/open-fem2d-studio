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
 * TWEE PLAATSEN, TWEE PALETTEN, ÉÉN TEKENING
 * Deze figuur staat in het rapport (papier: vaste documentkleuren op wit, ook
 * wanneer de app donker staat) én in de profielkiezer (scherm: het app-thema,
 * dat donker kan zijn). Dat is hetzelfde onderscheid dat de betonfiguren maken
 * met `THEMA_KLEUREN` tegenover `RAPPORT_KLEUREN` in `beton/tekenkleuren.ts`,
 * en het wordt hier op dezelfde manier opgelost: één component met een
 * `kleuren`-prop, rapportkleuren als standaard. Er komt géén tweede
 * tekencomponent — twee tekeningen van dezelfde opbouw lopen na de eerste
 * wijziging uit elkaar.
 *
 * Zonder `sigma` én `tau` blijft alleen het doorsnedepaneel over en krimpt het
 * kader mee. Dat is wat de profielkiezer nodig heeft: daar is nog niets
 * berekend, dus er zijn geen spanningen om te tonen.
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

/**
 * Het palet van de figuur, in twee smaken (zie de kop van dit bestand).
 *
 * De scheiding die telt is WAAROP een kleur ligt. Alles wat op het houtvlak
 * ligt — contour, arcering, de zware contour van de maatgevende laag — moet
 * donker blijven, óók in een donker thema, want dat vlak is een materiaalkleur
 * en in élk thema licht. Alles wat op de paneelachtergrond ligt — teksten,
 * maatlijnen, de zwaartelijn — volgt juist wél het thema, anders staat het in
 * het donker bijna onzichtbaar. Dezelfde afweging als `betonLijn` tegenover
 * `lijn` in `beton/tekenkleuren.ts`.
 */
export interface CltTekenKleuren {
  /** Vlak van het hout. Materiaalkleur: in elk thema hetzelfde. */
  houtVlak: string;
  /** Arcering ÓP dat vlak. */
  arcering: string;
  /** Laagcontour, ligt eveneens op dat vlak. */
  contour: string;
  /** Zware contour van de maatgevende laag; op het vlak. */
  contourMaatgevend: string;
  /** Tekst op de paneelACHTERGROND. */
  tekst: string;
  /** Maatlijnen, pijlen, zwaartelijn en grafiekassen — op de achtergrond. */
  maatlijn: string;
  /** De verwijzing "◂ maatgevend" — tekst, dus op de achtergrond. */
  tekstMaatgevend: string;
  /** Vulling van het σ-vlak. */
  sigmaVlak: string;
  /** Vulling van het τ-vlak. */
  tauVlak: string;
}

/** Papier: vaste documentkleuren, onafhankelijk van het app-thema. */
export const CLT_RAPPORT_KLEUREN: CltTekenKleuren = {
  houtVlak: "#e9deca",
  arcering: "#8b7355",
  contour: "#39424e",
  contourMaatgevend: "#b91c1c",
  tekst: "#333",
  maatlijn: "#5b6470",
  tekstMaatgevend: "#b91c1c",
  sigmaVlak: "#c9d6e8",
  tauVlak: "#d9c9e8",
};

/** Scherm: het app-thema, met de papierkleuren als terugval. */
export const CLT_THEMA_KLEUREN: CltTekenKleuren = {
  // Hout is een materiaal en geen thema; dezelfde token die
  // `ProfielMiniatuur` gebruikt, zodat de houten doorsneden in de
  // profielkiezer allemaal dezelfde kleur hebben.
  houtVlak: "var(--theme-hout-vlak, #E9DECA)",
  arcering: "#8b7355",
  contour: "var(--theme-materiaal-lijn, #2A2A30)",
  contourMaatgevend: "#b91c1c",
  tekst: "var(--theme-text, #333)",
  // Niet `--theme-text-muted`: dat haalt op de lichte achtergrond maar 2,8:1
  // tegenover het paneel, terwijl een maatlijn een grafisch element is dat
  // 3:1 hoort te halen. Met `--theme-text-secondary` is het 4,1:1 in licht en
  // 6,9:1 in donker, en blijft de lijn toch lichter dan de tekst ernaast.
  maatlijn: "var(--theme-text-secondary, #5b6470)",
  tekstMaatgevend: "var(--theme-danger-color, #b91c1c)",
  // De spanningsvlakken dragen dezelfde donkere contourlijn als de lagen, dus
  // blijven ze net als het houtvlak licht — een themavulling zou die lijn in
  // het donkere thema opslokken.
  sigmaVlak: "#c9d6e8",
  tauVlak: "#d9c9e8",
};

interface Props {
  lagen: CltTekenLaag[];
  breedteMm: number;
  /** Zwaartelijn vanaf boven (mm); zonder waarde geen lijn. */
  z0Mm?: number;
  sigma?: Verloop;
  tau?: Verloop;
  titel?: string;
  className?: string;
  /** Palet; standaard papier (het rapport is de oudste aanroeper). */
  kleuren?: CltTekenKleuren;
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
/**
 * Kaderbreedte zónder spanningspanelen: alleen de doorsnede plus zijn
 * labelkolom. Het rapportkader (362 breed) zou hier voor een derde tekening
 * zijn en voor twee derde wit, en de doorsnede daarmee onnodig klein maken.
 *
 * De labelkolom is breed genoeg voor "40 mm · C24"; staat er ook nog
 * "◂ maatgevend" achter, dan moet het kader mee. De ondergrens (178) is de
 * legenda eronder, die breder is dan de laaglabels zelf.
 */
const FRAME_W_SMAL = Math.max(XLAB + 56 + 8, 178);
const FRAME_W_SMAL_GOV = XLAB + 96 + 8;
const FRAME_H = Y0 + DRAW_H + 32;
const TICK = 3;

function fmt(v: number, digits = 2): string {
  return v.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}

function maat(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

function ArrowHead({ x, y, ang, k }: { x: number; y: number; ang: number; k: CltTekenKleuren }) {
  return (
    <polygon
      points="0,0 6,-2 6,2"
      fill={k.maatlijn}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${ang})`}
    />
  );
}

/** Verticale maatlijn met eindstreepjes, pijlen en gedraaid label. */
function DimV({
  x,
  y1,
  y2,
  label,
  k,
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
  k: CltTekenKleuren;
}) {
  return (
    <g>
      <g stroke={k.maatlijn} strokeWidth="0.7">
        <line x1={x} y1={y1} x2={x} y2={y2} />
        <line x1={x - TICK} y1={y1} x2={x + TICK} y2={y1} />
        <line x1={x - TICK} y1={y2} x2={x + TICK} y2={y2} />
      </g>
      <ArrowHead x={x} y={y1} ang={90} k={k} />
      <ArrowHead x={x} y={y2} ang={270} k={k} />
      <text
        x={x - 3}
        y={(y1 + y2) / 2}
        fill={k.tekst}
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
  k,
}: {
  verloop: Verloop;
  xAs: number;
  schaal: number;
  s: number;
  fill: string;
  labelUitersten: boolean;
  k: CltTekenKleuren;
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
      <line x1={xAs} y1={Y0 - 4} x2={xAs} y2={Y0 + DRAW_H + 4} stroke={k.maatlijn} strokeWidth="0.6" />
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
            <polyline points={lijn} fill="none" stroke={k.contour} strokeWidth="0.9" />
          </g>
        );
      })}
      {labelUitersten && maxPunt && Math.abs(maxPunt.v) > 1e-9 && (
        <text
          x={X(maxPunt.v) + (maxPunt.v >= 0 ? 2 : -2)}
          y={Y(maxPunt.z) + 2.5}
          fill={k.tekst}
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
          fill={k.tekst}
          fontSize="6.5"
          textAnchor={minPunt.v >= 0 ? "start" : "end"}
        >
          {fmt(minPunt.v)}
        </text>
      )}
      <text x={xAs} y={Y0 + DRAW_H + 12} fill={k.tekst} fontSize="7" textAnchor="middle">
        {verloop.label} ({verloop.eenheid})
      </text>
    </g>
  );
}

export default function CltOpbouwTekening({
  lagen,
  breedteMm,
  z0Mm,
  sigma,
  tau,
  titel,
  className,
  kleuren: k = CLT_RAPPORT_KLEUREN,
}: Props) {
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

  // Zonder spanningen blijft alleen paneel 1 over; het kader krimpt mee zodat
  // de doorsnede de beschikbare breedte pakt in plaats van een strook wit.
  const smal = !sigma && !tau;
  const frameW = smal ? (gov ? FRAME_W_SMAL_GOV : FRAME_W_SMAL) : FRAME_W;
  // De legenda-regel over de maatgevende laag past in het smalle kader niet
  // meer achter "dwarslaag (rolschuiving)"; die krijgt dan een eigen regel.
  const govOpEigenRegel = smal && gov;
  const frameH = FRAME_H + (govOpEigenRegel ? 10 : 0);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${frameW} ${frameH}`}
      role="img"
      aria-label={titel ?? `Kruislaaghout, ${lagen.length} lagen, h = ${maat(hTot)} mm`}
    >
      <defs>
        {/* Lengtelaag: kopshout in doorsnede — diagonale arcering. */}
        <pattern id={`${uid}-lengte`} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0" stroke={k.arcering} strokeWidth="0.5" />
        </pattern>
        {/* Dwarslaag: vezels in het tekenvlak — horizontale lijnen. */}
        <pattern id={`${uid}-dwars`} width="6" height="3" patternUnits="userSpaceOnUse">
          <path d="M0 1.5 L6 1.5" stroke={k.arcering} strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* ---- Paneel 1: doorsnede ---- */}
      <text x={XA + WA / 2} y={Y0 - 8} fill={k.tekst} fontSize="7.5" textAnchor="middle">
        b = {maat(breedteMm)} (strook, breedte niet op schaal)
      </text>
      {lagen.map((l, i) => {
        const y = Y0 + grenzen[i].zTop * s;
        const h = l.dikte * s;
        const patroon = l.richting === "Longitudinal" ? `${uid}-lengte` : `${uid}-dwars`;
        return (
          <g key={i}>
            <rect x={XA} y={y} width={WA} height={h} fill={k.houtVlak} />
            <rect x={XA} y={y} width={WA} height={h} fill={`url(#${patroon})`} />
            <rect
              x={XA}
              y={y}
              width={WA}
              height={h}
              fill="none"
              stroke={l.maatgevend ? k.contourMaatgevend : k.contour}
              strokeWidth={l.maatgevend ? 1.5 : 0.7}
            />
            <text x={XLAB} y={y + h / 2 + 2.4} fill={k.tekst} fontSize="6.8">
              {maat(l.dikte)} mm{l.klasse ? ` · ${l.klasse}` : ""}
              {l.maatgevend && (
                <tspan fill={k.tekstMaatgevend} fontStyle="italic">
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
            stroke={k.maatlijn}
            strokeWidth="0.7"
            strokeDasharray="7 2.5 1.5 2.5"
          />
          {/* Het label stond links van de plaat, precies waar het gedraaide
              h-label staat: bij een symmetrische opbouw ligt z₀ op halve
              hoogte en kruisten de twee teksten elkaar. Het staat nu ín de
              plaat, tegen de lijn aan, met een halo in de houtkleur zodat de
              arcering niet door de letters loopt. Die letters liggen daarmee
              ÓP het houtvlak, dus krijgen ze de contourkleur en niet de
              themakleur voor tekst — die is in een donker thema bijna wit. */}
          <text
            x={XA + 3}
            y={yNa < Y0 + 9 ? yNa + 7 : yNa - 2.6}
            fill={k.contour}
            fontSize="6.5"
            fontStyle="italic"
            stroke={k.houtVlak}
            strokeWidth="1.8"
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            z₀ = {maat(z0Mm ?? 0)}
          </text>
        </g>
      )}
      <DimV x={XA - 20} y1={Y0} y2={Y0 + DRAW_H} label={`h = ${maat(hTot)}`} k={k} />

      {/* Legenda arcering. */}
      <g transform={`translate(${XA} ${Y0 + DRAW_H + 8})`}>
        <rect x={0} y={0} width={10} height={6} fill={k.houtVlak} />
        <rect x={0} y={0} width={10} height={6} fill={`url(#${uid}-lengte)`} stroke={k.contour} strokeWidth="0.5" />
        <text x={13} y={5} fill={k.tekst} fontSize="6.5">
          lengtelaag (vezels in spanrichting)
        </text>
        <rect x={0} y={10} width={10} height={6} fill={k.houtVlak} />
        <rect x={0} y={10} width={10} height={6} fill={`url(#${uid}-dwars)`} stroke={k.contour} strokeWidth="0.5" />
        <text x={13} y={15} fill={k.tekst} fontSize="6.5">
          dwarslaag (rolschuiving)
          {gov && !govOpEigenRegel ? " · zware contour = maatgevende laag" : ""}
        </text>
        {govOpEigenRegel && (
          <text x={0} y={25} fill={k.tekst} fontSize="6.5">
            zware contour = maatgevende laag
          </text>
        )}
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
              stroke={k.maatlijn}
              strokeWidth="0.5"
              strokeDasharray="7 2.5 1.5 2.5"
            />
          )}
          <SpanningsPaneel
            verloop={sigma}
            xAs={XB + WB / 2}
            schaal={schaalSigma}
            s={s}
            fill={k.sigmaVlak}
            labelUitersten
            k={k}
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
              stroke={k.maatlijn}
              strokeWidth="0.5"
              strokeDasharray="7 2.5 1.5 2.5"
            />
          )}
          <SpanningsPaneel verloop={tau} xAs={XC} schaal={schaalTau} s={s} fill={k.tauVlak} labelUitersten k={k} />
        </g>
      )}
    </svg>
  );
}
