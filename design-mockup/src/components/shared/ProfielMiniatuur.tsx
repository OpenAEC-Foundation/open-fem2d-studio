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
 *
 * DE VULKLEUR HOORT BIJ HET MATERIAAL, NIET BIJ DE VORM. Tot september 2026
 * koos deze component de vulling op `shape.type === "rect"`: elke rechthoek
 * kreeg de houtkleur. Een betonnen rechthoek werd dus beige en dezelfde
 * doorsnede als T-ligger blauwgrijs — twee kleuren voor één materiaal, en
 * geen ervan de kleur van beton. De aanroeper weet wél welk materiaal het is
 * en geeft dat nu door in [`Props.materiaal`].
 */
import { shapePath, buitenmaten, type SectionShape } from "./profielVorm";

/**
 * Vulling, omtrek en dekking per materiaal; zie de materiaalkleuren in
 * `themes.css`.
 *
 * Staal en een vrij materiaal krijgen een doorschijnende accenttint over de
 * paneelkleur; daar volgt de omtrek het thema. Hout en beton hebben een VASTE
 * lichte vulling in élk thema, en dan moet de omtrek er ook in het donkere
 * thema donker op staan — de themakleur voor tekst is daar bijna wit.
 *
 * `dekking` is de opacity van het hele pad, vulling én omtrek. Voor staal en
 * het vrije materiaal staat die op 0,95 om de accenttint zijn harde rand te
 * ontnemen; dat mag daar, want die vulling volgt het thema toch al en er is
 * geen afspraak over de precieze RGB-waarde.
 *
 * BETON ÉN HOUT STAAN OP 1 EN DAT MOET ZO BLIJVEN. Allebei hebben ze een
 * materiaalkleur die in élk thema gelijk hoort te zijn — `--theme-beton-vlak`
 * #C0C0C0 = 192-192-192 en `--theme-hout-vlak` #E9DECA = 233-222-202 — zie het
 * materiaalkleurenblok in `themes.css` en `beton/tekenkleuren.ts`. Het paneel
 * eronder (`.pk-tekening`, background `var(--theme-bg)`) mengt mee zodra de
 * dekking onder 1 zakt, en die achtergrond verschilt per thema. Dan is de
 * uitkomst dus zowel afwijkend áls thema-afhankelijk, en dat is precies wat een
 * vaste materiaalkleur moest voorkomen.
 *
 * Nagemeten wat 0,95 zou opleveren — src·α + dst·(1−α), per kanaal afgerond:
 *
 *              licht         forge         openaec       blueprint     contrast
 *   beton      195-195-195   185-185-185   184-184-184   183-184-185   182-182-182
 *   hout       234-223-204   224-214-195   223-213-194   222-212-194   221-211-192
 *
 * Niet één van die tien is de materiaalkleur, en geen twee kolommen zijn
 * gelijk: dát is de fout, in tweevoud.
 *
 * De laatste eenheid is niet hard. Bij beton in openaec komt het blauwkanaal in
 * exacte rekenkunde op precies 184,5 uit; in binary64 wordt dat 184,49999…, dus
 * naar beneden. Daar liepen twee eerdere commentaren op uit elkaar (184 tegen
 * 185). Wat NIET afrondingsgevoelig is, is dát er wordt afgeweken en dát het per
 * thema verschilt — en daar gaat de afspraak over. `test-doorsnede-kleur.mjs`
 * rekent deze tabel na voor alle vijf de thema's en valt om zodra een van de
 * twee dekkingen weer onder 1 gaat; de getallen hierboven horen dus met die
 * test mee te bewegen.
 *
 * Hout stond tot september 2026 nog op 0,95, met als reden dat alleen voor
 * beton een exacte RGB-waarde was afgesproken. Dat argument houdt geen stand
 * tegen de belofte "in élk thema dezelfde kleur" die dit bestand en
 * `beton/tekenkleuren.ts` allebei doen: die belofte gaat over de kleur die op
 * het scherm belandt, niet over de kleur die in het bestand staat.
 */
const KLEUREN: Record<
  Materiaalsoort,
  { vulling: string; lijn: string; dekking: number }
> = {
  staal: {
    vulling: "var(--theme-accent-soft, #dbe4f0)",
    lijn: "var(--theme-text, #39424e)",
    dekking: 0.95,
  },
  hout: {
    vulling: "var(--theme-hout-vlak, #E9DECA)",
    lijn: "var(--theme-materiaal-lijn, #2A2A30)",
    dekking: 1,
  },
  beton: {
    vulling: "var(--theme-beton-vlak, #C0C0C0)",
    lijn: "var(--theme-materiaal-lijn, #2A2A30)",
    dekking: 1,
  },
  // Een vrij materiaal heeft geen eigen kleur — het is per definitie niet één
  // materiaal. Dezelfde neutrale vulling als staal.
  vrij: {
    vulling: "var(--theme-accent-soft, #dbe4f0)",
    lijn: "var(--theme-text, #39424e)",
    dekking: 0.95,
  },
};

/** Het materiaal waarvan de doorsnede is; bepaalt alleen de vulkleur. */
export type Materiaalsoort = "staal" | "hout" | "beton" | "vrij";

const KADER_W = 132;
const KADER_H = 132;
const MARGE_LINKS = 26;   // ruimte voor de h-maatlijn
const MARGE_BOVEN = 20;   // ruimte voor de b-maatlijn
const MARGE_REST = 10;
const TICK = 2.5;

interface Props {
  shape: SectionShape;
  /**
   * Het materiaal, voor de vulkleur. Standaard "staal" — de neutrale kleur;
   * er wordt bewust niet uit de vorm geraden welk materiaal het is.
   */
  materiaal?: Materiaalsoort;
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

export default function ProfielMiniatuur({
  shape,
  materiaal = "staal",
  maatvoering = true,
  titel,
  className,
}: Props) {
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
        fill={KLEUREN[materiaal].vulling}
        stroke={KLEUREN[materiaal].lijn}
        strokeWidth="1"
        strokeLinejoin="miter"
        opacity={KLEUREN[materiaal].dekking}
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
