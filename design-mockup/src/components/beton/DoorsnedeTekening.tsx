/**
 * DoorsnedeTekening — de betondoorsnede met wapeningskorf als SVG.
 *
 * Toont wat de constructeur wil zien: de omtrek van de doorsnede — rechthoek,
 * T of L — de beugel op de dekking, en de hoofdwapening als cirkels op ware
 * schaal, zodat het aantal staven en hun diameter direct af te lezen zijn, met
 * "3Ø16" / "2Ø12" als label. Maatlijnen voor b (boven), h (links) en de
 * nuttige hoogte d (rechts), in de stijl van ProfielMiniatuur.
 *
 * DE VORM WORDT ECHT GETEKEND. De korfvalidatie kijkt naar de breedte op de
 * hoogte van de rij; zou de tekening een T als rechthoek laten zien, dan zou
 * een afgekeurde rij er in het beeld gewoon in passen en zou de melding
 * onbegrijpelijk zijn. De banden en de omtrek komen daarom uit
 * `wapeningskorf.ts`, dat dezelfde b(z) hanteert als `ConcreteSection` in de
 * kern. Het enige wat de tekening zélf beslist, is waar de flens van een L
 * ligt (links) — in de berekening is dat geen verschil, in het beeld wel.
 *
 * Kleuren komen standaard uit de theme-tokens, zodat de tekening in licht én
 * donker leesbaar blijft. Het rapport geeft `RAPPORT_KLEUREN` mee: daar is de
 * tekening papier en volgt hij het app-thema juist niet.
 */
import { THEMA_KLEUREN, type BetonTekenKleuren } from "./tekenkleuren";
import {
  asAfstandMm,
  banden,
  hartXMm,
  maat,
  nuttigeHoogteMm,
  omtrekPunten,
  rijLabel,
  staafPosities,
  type Wapeningskorf,
} from "./wapeningskorf";

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
  /** Palet; standaard de theme-tokens, het rapport geeft RAPPORT_KLEUREN mee. */
  kleuren?: BetonTekenKleuren;
  /** Toegankelijke titel; standaard een omschrijving van de doorsnede. */
  titel?: string;
  className?: string;
}

function Pijl({ x, y, hoek, kleur }: { x: number; y: number; hoek: number; kleur: string }) {
  return (
    <polygon
      points="0,0 5,-1.7 5,1.7"
      fill={kleur}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${hoek})`}
    />
  );
}

export default function DoorsnedeTekening({
  korf,
  maatvoering = true,
  kleuren = THEMA_KLEUREN,
  titel,
  className,
}: Props) {
  const d3 = korf.doorsnede;
  const bMm = d3.b_mm;
  const hMm = d3.h_mm;
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
  const staven = staafPosities(korf.korf, d3);
  const heeftOnder = korf.korf.bottom.count > 0 && korf.korf.bottom.diameter_mm > 0;
  const heeftBoven = korf.korf.top.count > 0 && korf.korf.top.diameter_mm > 0;
  const d = nuttigeHoogteMm(korf.korf, hMm);

  const omtrek = omtrekPunten(d3)
    .map(([x, z]) => `${sx(x).toFixed(2)},${sy(z).toFixed(2)}`)
    .join(" ");

  // De beugel volgt het LIJF, niet de omhullende breedte: de hoofdbeugel van
  // een T-ligger zit om het lijf, en de flens draagt daar zijn eigen
  // dwarswapening. Bij een rechthoek is het lijf de hele doorsnede en staat
  // er precies wat er altijd stond.
  const beugelInzet = c + dBgl / 2;
  const lijf = banden(d3).reduce((a, b) => (b.bMm < a.bMm ? b : a));
  const lijfHart = hartXMm(d3, 0.5 * (lijf.z0Mm + lijf.z1Mm));
  const beugelBreedte = lijf.bMm - 2 * beugelInzet;
  const beugelHoogte = hMm - 2 * beugelInzet;
  const beugelPast = dBgl > 0 && beugelBreedte > 0 && beugelHoogte > 0;

  const yMaatB = y0 - 9;
  const xMaatH = x0 - 10;
  const xMaatD = x0 + w + 10;

  const vormLabel =
    d3.shape === "Rectangle"
      ? `Betondoorsnede ${maat(bMm)} × ${maat(hMm)} mm`
      : `${d3.shape === "Tee" ? "T" : "L"}-doorsnede ${maat(bMm)} × ${maat(hMm)} mm, flens ${maat(
          d3.h_f_mm ?? 0,
        )} mm dik ${d3.flange_at_bottom ? "onder" : "boven"}, lijf ${maat(d3.b_w_mm ?? 0)} mm`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${KADER_W} ${KADER_H}`}
      role="img"
      aria-label={
        titel ??
        `${vormLabel}, ${rijLabel(korf.korf.bottom)} onder, ${rijLabel(korf.korf.top)} boven`
      }
    >
      {/* Beton — de werkelijke omtrek, dus ook de flens van een T of een L */}
      <polygon points={omtrek} fill={kleuren.betonVlak} stroke={kleuren.lijn} strokeWidth="1" />

      {/* Beugel om het lijf */}
      {beugelPast && (
        <rect
          x={sx(lijfHart - lijf.bMm / 2 + beugelInzet)}
          y={sy(hMm - beugelInzet)}
          width={beugelBreedte * s}
          height={beugelHoogte * s}
          rx={Math.max(1.5, 2 * dBgl * s)}
          fill="none"
          stroke={kleuren.beugel}
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
          fill={kleuren.lijn}
        />
      ))}

      {/* Labels van de rijen: in het beton, naast de staven */}
      {heeftOnder && (
        <text
          x={sx(hartXMm(d3, asAfstandMm(korf.korf, korf.korf.bottom)))}
          y={sy(asAfstandMm(korf.korf, korf.korf.bottom)) - Math.max(3, (korf.korf.bottom.diameter_mm / 2) * s) - 2.5}
          fill={kleuren.tekstZwak}
          fontSize="7.5"
          textAnchor="middle"
        >
          {rijLabel(korf.korf.bottom)}
        </text>
      )}
      {heeftBoven && (
        <text
          x={sx(hartXMm(d3, hMm - asAfstandMm(korf.korf, korf.korf.top)))}
          y={sy(hMm - asAfstandMm(korf.korf, korf.korf.top)) + Math.max(3, (korf.korf.top.diameter_mm / 2) * s) + 8}
          fill={kleuren.tekstZwak}
          fontSize="7.5"
          textAnchor="middle"
        >
          {rijLabel(korf.korf.top)}
        </text>
      )}

      {maatvoering && (
        <g stroke={kleuren.maatlijn} strokeWidth="0.6">
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
          {/* Lijfbreedte: de maat die bij een T of L het verschil maakt */}
          {d3.shape !== "Rectangle" && (
            <>
              <line
                x1={sx(lijfHart - lijf.bMm / 2)}
                y1={sy(0.5 * (lijf.z0Mm + lijf.z1Mm))}
                x2={sx(lijfHart + lijf.bMm / 2)}
                y2={sy(0.5 * (lijf.z0Mm + lijf.z1Mm))}
              />
            </>
          )}
        </g>
      )}
      {maatvoering && (
        <>
          <Pijl x={x0} y={yMaatB} hoek={0} kleur={kleuren.maatlijn} />
          <Pijl x={x0 + w} y={yMaatB} hoek={180} kleur={kleuren.maatlijn} />
          <Pijl x={xMaatH} y={y0} hoek={90} kleur={kleuren.maatlijn} />
          <Pijl x={xMaatH} y={y0 + h} hoek={270} kleur={kleuren.maatlijn} />
          <text x={x0 + w / 2} y={yMaatB - 3} fill={kleuren.tekstMaat} fontSize="7.5" textAnchor="middle">
            {d3.shape === "Rectangle" ? "b" : "b_eff"} {maat(bMm)}
          </text>
          <text
            x={xMaatH - 3}
            y={y0 + h / 2}
            fill={kleuren.tekstMaat}
            fontSize="7.5"
            textAnchor="middle"
            transform={`rotate(-90 ${(xMaatH - 3).toFixed(2)} ${(y0 + h / 2).toFixed(2)})`}
          >
            h {maat(hMm)}
          </text>
          {d3.shape !== "Rectangle" && (
            <text
              x={sx(lijfHart)}
              y={sy(0.5 * (lijf.z0Mm + lijf.z1Mm)) - 2.5}
              fill={kleuren.tekstMaat}
              fontSize="7"
              textAnchor="middle"
            >
              b_w {maat(lijf.bMm)}
            </text>
          )}
          {heeftOnder && (
            <>
              <Pijl x={xMaatD} y={y0} hoek={90} kleur={kleuren.maatlijn} />
              <Pijl x={xMaatD} y={sy(hMm - d)} hoek={270} kleur={kleuren.maatlijn} />
              <text
                x={xMaatD + 3}
                y={y0 + (h * d) / hMm / 2}
                fill={kleuren.tekstMaat}
                fontSize="7.5"
                textAnchor="middle"
                transform={`rotate(90 ${(xMaatD + 3).toFixed(2)} ${(y0 + (h * d) / hMm / 2).toFixed(2)})`}
              >
                d {maat(d)}
              </text>
            </>
          )}
          <text x={x0 + w / 2} y={y0 + h + 12} fill={kleuren.tekstMaat} fontSize="7" textAnchor="middle">
            {d3.shape === "Rectangle"
              ? `dekking ${maat(c)}${dBgl > 0 ? `, beugel Ø${maat(dBgl)}` : ""}`
              : `h_f ${maat(d3.h_f_mm ?? 0)}, dekking ${maat(c)}${dBgl > 0 ? `, beugel Ø${maat(dBgl)}` : ""}`}
          </text>
        </>
      )}
    </svg>
  );
}
