/**
 * AanzichtTekening — de betonstaaf op zijn kant, met de dekkingslijnen eronder.
 *
 * ── WAT ER STAAT, VAN BOVEN NAAR BENEDEN ───────────────────────────────────
 *
 *   momentendekking BOVEN   (laag "moment")
 *   de staaf zelf           met opleggingen, wapeningsbundels en beugelzones
 *   momentendekking ONDER   (laag "moment")
 *   dwarskrachtdekking      (laag "dwarskracht")
 *   scheurwijdte            (laag "scheurwijdte")
 *   unity checks            (laag "uc") — een kleurbalk
 *   de x-as                 met de zonegrenzen als maatstreepjes
 *
 * Alle lanen delen ÉÉN x-as, en die is de staaflengte. Daardoor staat een
 * tekort in de momentendekking recht onder de plaats in de staaf waar het zit,
 * en recht boven het rode stuk van de kleurbalk.
 *
 * ── DE KANT WAAROP EEN LAAN LIGT IS EEN AFSPRAAK, GEEN SMAAK ───────────────
 *
 * De ONDERwapening neemt het positieve moment op, en positief moment trekt in
 * deze app aan de ONDERvezel (zie het blok SNEDETEKENS in
 * `FemResultsOverlay.tsx`, dat de conventie vastlegt en naar `BeamForces.ts`
 * verwijst). De momentenlijn op het canvas wordt op de TREKZIJDE uitgezet, dus
 * naar beneden bij positief moment. De laan van de onderwapening ligt hier om
 * dezelfde reden ONDER de staaf en die van de bovenwapening erboven: een
 * dekkingslijn die andersom staat dan het diagram op het canvas is onbruikbaar,
 * want dan wijst de lezer de verkeerde staaflaag aan.
 *
 * ── DEZE COMPONENT REKENT NIET ─────────────────────────────────────────────
 *
 * Elke afleiding staat in `dekkingLagen.ts`; hier gebeurt alleen het omzetten
 * van millimeters naar beeldpunten. Dat is de reden dat de tekening met vaste
 * afmetingen te renderen is en dat `test-dekkingsvenster.mjs` de LIGGING van de
 * trapjes uit de gerenderde SVG kan terugmeten.
 */
import { useMemo, type MouseEvent } from "react";
import type { SupportType } from "../../fem/femTypes";
import {
  laanMaximum,
  type LijnPunt,
  eindzoneVakken,
  tekortVakken,
  ucKlasse,
  UC_KLEUR,
  type Laan,
  type LaagVlaggen,
  type UcVak,
} from "./dekkingLagen";
import { maat, nl } from "../wapeningskorf";

/** Eén wapeningsbundel zoals de tekening hem nodig heeft. */
export interface BundelTekening {
  zijde: "boven" | "onder";
  xStartMm: number;
  xEindMm: number;
  /** "3Ø16" */
  label: string;
  /**
   * De verankeringslengte aan elk uiteinde, mm. Binnen die lengte telt de
   * staaf volgens §9.2.1.3(3) lineair mee — van nul op het uiteinde tot vol op
   * l_bd ervandaan — en daarom wordt hij daar met een aanloop getekend in
   * plaats van als een lijn die abrupt begint. `0` = niet bekend.
   */
  lBdMm: number;
}

/** Eén beugelzone zoals de tekening hem nodig heeft. */
export interface BeugelTekening {
  xStartMm: number;
  xEindMm: number;
  spacingMm: number;
  benen: number;
  diameterMm: number;
}

export interface OplegTekening {
  xMm: number;
  type: SupportType;
}

interface Props {
  lengteMm: number;
  /** Hoogte van de doorsnede, voor de verhouding van de getekende staaf. */
  hoogteMm: number;
  opleggingen: readonly OplegTekening[];
  bundels: readonly BundelTekening[];
  beugels: readonly BeugelTekening[];
  /** De plaatsen waar de wapening verandert; als stippellijn door alle lanen. */
  zoneGrenzenMm: readonly number[];
  /** De lanen, in de volgorde waarin ze onder de staaf komen te liggen. */
  lanenBoven: readonly Laan[];
  lanenOnder: readonly Laan[];
  ucVakken: readonly UcVak[];
  lagen: LaagVlaggen;
  /** De aangewezen snede, mm vanaf de beginknoop; `null` = geen aanwijzer. */
  cursorXMm: number | null;
  onCursorX?: (xMm: number) => void;
  /** Breedte van het tekenvlak in beeldpunten. */
  breedtePx?: number;
}

// ── Maten van het kader, in beeldpunten ────────────────────────────────────
const MARGE_LINKS = 8;
const MARGE_RECHTS = 14;
const MARGE_BOVEN = 6;
const AS_HOOGTE = 24;
/** Hoogte van de getekende staaf; de doorsnedehoogte bepaalt alleen de lijnen erin. */
const STAAF_H = 46;
/**
 * Ruimte ONDER de staaf voor het oplegteken en de lengtemaatlijn.
 *
 * Zonder deze marge tekent de laan eronder over de driehoek van de oplegging
 * en over "L = 6,00 m" heen — en juist die twee zijn wat de aanzicht een
 * aanzicht maakt.
 */
const STAAF_ONDER = 26;
const LAAN_H = 66;
const UC_BALK_H = 18;
/** Ruimte boven in een laan voor de titel; de lijn begint eronder. */
const LAAN_KOP = 13;

export default function AanzichtTekening({
  lengteMm,
  hoogteMm,
  opleggingen,
  bundels,
  beugels,
  zoneGrenzenMm,
  lanenBoven,
  lanenOnder,
  ucVakken,
  lagen,
  cursorXMm,
  onCursorX,
  breedtePx = 900,
}: Props) {
  const tekenW = Math.max(120, breedtePx - MARGE_LINKS - MARGE_RECHTS);
  const sx = (xMm: number) => MARGE_LINKS + (lengteMm > 0 ? (xMm / lengteMm) * tekenW : 0);

  // De verticale indeling wordt één keer uitgerekend, zodat elk element weet
  // waar zijn laan begint en de hoogte van de SVG uit dezelfde optelling komt.
  const indeling = useMemo(() => {
    let y = MARGE_BOVEN;
    const boven = lanenBoven.map((laan) => {
      const rij = { laan, y0: y, y1: y + LAAN_H };
      y += LAAN_H;
      return rij;
    });
    const staafY0 = y;
    y += STAAF_H + STAAF_ONDER;
    const onder = lanenOnder.map((laan) => {
      const rij = { laan, y0: y, y1: y + LAAN_H };
      y += LAAN_H;
      return rij;
    });
    const ucY0 = y;
    if (lagen.uc) y += UC_BALK_H + 4;
    const asY = y;
    return { boven, staafY0, onder, ucY0, asY, totaal: y + AS_HOOGTE };
  }, [lanenBoven, lanenOnder, lagen.uc]);

  const hoogte = indeling.totaal;

  const pakCursor = (e: MouseEvent<SVGSVGElement>) => {
    if (!onCursorX || lengteMm <= 0) return;
    const doel = e.currentTarget;
    const kader = doel.getBoundingClientRect();
    if (kader.width <= 0) return;
    // Het beeld wordt met `preserveAspectRatio` niet vervormd, maar de SVG kan
    // wel geschaald staan; daarom via de verhouding en niet via ruwe pixels.
    const px = ((e.clientX - kader.left) / kader.width) * breedtePx;
    const x = ((px - MARGE_LINKS) / tekenW) * lengteMm;
    onCursorX(Math.min(lengteMm, Math.max(0, x)));
  };

  return (
    <svg
      className="dek-aanzicht"
      viewBox={`0 0 ${breedtePx} ${hoogte}`}
      width={breedtePx}
      height={hoogte}
      role="img"
      aria-label={`Aanzicht van de betonstaaf over ${nl(lengteMm / 1000, 2)} m met de dekkingslijnen`}
      // KLIKKEN wijst de snede aan, meebewegen met de muis niet. Dat is met
      // opzet: de werkwijze is "zet de aanwijzer waar je wilt inkorten en druk
      // dan op splits", en met een aanwijzer die de muis volgt zou hij
      // onderweg naar die knop de hele staaf over schuiven.
      onClick={pakCursor}
    >
      {/* De zonegrenzen lopen door ALLE lanen heen: zij zijn de plaatsen waar
          de weerstand springt, en dat is in elke laan tegelijk te zien. */}
      {zoneGrenzenMm.map((g, i) =>
        g > 0 && g < lengteMm ? (
          <line
            key={`g${i}`}
            x1={sx(g)}
            y1={MARGE_BOVEN}
            x2={sx(g)}
            y2={indeling.asY}
            stroke="var(--theme-border, #ccc)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        ) : null,
      )}

      {indeling.boven.map((rij) => (
        <LaanTekening
          key={rij.laan.titel}
          laan={rij.laan}
          y0={rij.y0}
          y1={rij.y1}
          sx={sx}
          lengteMm={lengteMm}
        />
      ))}

      <StaafTekening
        y0={indeling.staafY0}
        hoogtePx={STAAF_H}
        lengteMm={lengteMm}
        hoogteMm={hoogteMm}
        sx={sx}
        opleggingen={opleggingen}
        bundels={bundels}
        beugels={beugels}
      />

      {indeling.onder.map((rij) => (
        <LaanTekening
          key={rij.laan.titel}
          laan={rij.laan}
          y0={rij.y0}
          y1={rij.y1}
          sx={sx}
          lengteMm={lengteMm}
        />
      ))}

      {lagen.uc && (
        <UcBalk vakken={ucVakken} y0={indeling.ucY0} hoogte={UC_BALK_H} sx={sx} />
      )}

      <XAs
        y={indeling.asY}
        lengteMm={lengteMm}
        sx={sx}
        breedtePx={breedtePx}
        tekenW={tekenW}
      />

      {/* De aanwijzer staat bovenop: hij hoort door alles heen te snijden. */}
      {cursorXMm !== null && (
        <g className="dek-cursor" pointerEvents="none">
          <line
            x1={sx(cursorXMm)}
            y1={MARGE_BOVEN}
            x2={sx(cursorXMm)}
            y2={indeling.asY + 4}
            stroke="var(--theme-accent, #d97706)"
            strokeWidth="1.2"
          />
          <polygon
            points={`${sx(cursorXMm) - 4},${indeling.asY + 10} ${sx(cursorXMm) + 4},${indeling.asY + 10} ${sx(cursorXMm)},${indeling.asY + 3}`}
            fill="var(--theme-accent, #d97706)"
          />
        </g>
      )}
    </svg>
  );
}

/**
 * Schuine arceerlijnen binnen een rechthoek, 45 graden, om de `stap`
 * beeldpunten uit elkaar.
 *
 * Dit had een SVG-`<pattern>` kunnen zijn, en dat wás het ook. Een patroon
 * vult echter niet overal hetzelfde: bij het uitdraaien van de tekening buiten
 * de browser (het bewijsbeeld van `test-dekkingsvenster.mjs`) kwam de eindzone
 * als een ZWART VLAK terug in plaats van als arcering, en een zwart vlak over
 * de dekkingslijn maakt precies onleesbaar wat het moest verduidelijken.
 * Losse lijnen zijn gewone meetkunde en tekenen overal hetzelfde.
 *
 * De lijnen worden analytisch op de rechthoek geknipt (geen `clipPath`, dus
 * ook geen id's die tussen twee tekeningen kunnen botsen).
 */
function arceringLijnen(
  x0: number,
  y0: number,
  breedte: number,
  hoogte: number,
  stap = 7,
): Array<[number, number, number, number]> {
  const uit: Array<[number, number, number, number]> = [];
  if (!(breedte > 0) || !(hoogte > 0)) return uit;
  // Elke lijn loopt door (x0 + d + t, y0 + t) met t >= 0; hij ligt in de
  // rechthoek zolang t tussen max(0, -d) en min(hoogte, breedte - d) zit.
  for (let d = -Math.ceil(hoogte / stap) * stap; d < breedte; d += stap) {
    const t0 = Math.max(0, -d);
    const t1 = Math.min(hoogte, breedte - d);
    if (t1 <= t0) continue;
    uit.push([x0 + d + t0, y0 + t0, x0 + d + t1, y0 + t1]);
  }
  return uit;
}

// ══ De staaf zelf ═════════════════════════════════════════════════════════

function StaafTekening({
  y0,
  hoogtePx,
  lengteMm,
  hoogteMm,
  sx,
  opleggingen,
  bundels,
  beugels,
}: {
  y0: number;
  hoogtePx: number;
  lengteMm: number;
  hoogteMm: number;
  sx: (x: number) => number;
  opleggingen: readonly OplegTekening[];
  bundels: readonly BundelTekening[];
  beugels: readonly BeugelTekening[];
}) {
  const y1 = y0 + hoogtePx;
  // De staven liggen op hun werkelijke hoogte in de doorsnede, omgerekend naar
  // de getekende staafhoogte. Zonder doorsnedehoogte valt er niets om te
  // rekenen en worden ze op een vaste inzet gezet.
  const inzet = hoogteMm > 0 ? Math.max(5, (hoogtePx * 45) / hoogteMm) : 7;
  /**
   * Twee bundels aan DEZELFDE zijde krijgen elk hun eigen rij, 6 beeldpunten
   * uit elkaar. Zonder die rijen liggen bij een staffeling (3Ø16 doorgaand met
   * 2Ø16 bijgelegd) beide lijnen én beide labels op elkaar, en leest de
   * tekening als één onbepaalde hoeveelheid staal. De rijvolgorde is die van
   * de bundellijst, zodat de doorgaande laag onderin blijft liggen.
   */
  const rijIndex = new Map<BundelTekening, number>();
  for (const zijde of ["onder", "boven"] as const) {
    let n = 0;
    for (const b of bundels) if (b.zijde === zijde) rijIndex.set(b, n++);
  }
  const RIJ_STAP = 6;
  const yBundel = (b: BundelTekening) => {
    const rij = rijIndex.get(b) ?? 0;
    return b.zijde === "boven" ? y0 + inzet + rij * RIJ_STAP : y1 - inzet - rij * RIJ_STAP;
  };

  return (
    <g className="dek-staaf">
      <rect
        x={sx(0)}
        y={y0}
        width={sx(lengteMm) - sx(0)}
        height={hoogtePx}
        fill="var(--theme-beton-vlak, #C0C0C0)"
        stroke="var(--theme-materiaal-lijn, #2A2A30)"
        strokeWidth="1"
      />

      {/* Beugelzones: de beugels zelf zolang ze uit elkaar te houden zijn,
          anders een arcering. Het label staat er altijd bij — dat is het
          gegeven waar de dwarskrachtdekking op leunt. */}
      {beugels.map((z, i) => {
        const x0 = sx(z.xStartMm);
        const x1 = sx(z.xEindMm);
        const stapPx = z.spacingMm > 0 ? (x1 - x0) * (z.spacingMm / (z.xEindMm - z.xStartMm)) : 0;
        const losTekenen = stapPx >= 3.5 && Number.isFinite(stapPx) && stapPx > 0;
        const ticks: number[] = [];
        if (losTekenen) {
          for (let x = x0 + stapPx / 2; x < x1; x += stapPx) ticks.push(x);
        }
        return (
          <g key={`b${i}`}>
            {losTekenen ? (
              ticks.map((x, k) => (
                <line
                  key={k}
                  x1={x}
                  y1={y0 + 3}
                  x2={x}
                  y2={y1 - 3}
                  stroke="var(--theme-materiaal-beugel, #55555E)"
                  strokeWidth="0.7"
                  opacity="0.75"
                />
              ))
            ) : (
              // Te dicht op elkaar om ze los te tekenen: dan een arcering, want
              // zestig lijnen op vijf beeldpunten is een zwart vlak en geen
              // beugelzone.
              arceringLijnen(x0, y0 + 3, Math.max(0, x1 - x0), hoogtePx - 6, 5).map((l, k) => (
                <line
                  key={k}
                  x1={l[0]}
                  y1={l[1]}
                  x2={l[2]}
                  y2={l[3]}
                  stroke="var(--theme-materiaal-beugel, #55555E)"
                  strokeWidth="0.6"
                  opacity="0.55"
                />
              ))
            )}
            {/* Ook dit label staat bij het BEGIN van zijn zone. In het midden
                van de staaf komen de labels van de langswapening en die van de
                beugels elkaar tegen; bij de zonegrenzen niet, en daar hoort de
                aanduiding ook: dáár verandert de beugelafstand. */}
            <text
              x={x0 + 6}
              y={y0 + hoogtePx / 2 + 3}
              textAnchor="start"
              fontSize="8.5"
              fill="var(--theme-text-secondary, #555)"
            >
              {`Ø${maat(z.diameterMm)}-${maat(z.spacingMm)}${z.benen !== 2 ? `, ${z.benen}-benig` : ""}`}
            </text>
          </g>
        );
      })}

      {/* De wapeningsbundels. Binnen l_bd van elk uiteinde loopt de staaf
          volgens §9.2.1.3(3) lineair op van nul tot vol; dat stuk wordt
          gestreept getekend, op dezelfde hoogte als de rest. Het stond eerst
          als schuine aanzet in de tekening, maar een staaf die naar de
          betonrand wegloopt leest als een gebogen staaf, en dat is hij niet. */}
      {bundels.map((b, i) => {
        const y = yBundel(b);
        const x0 = sx(b.xStartMm);
        const x1 = sx(b.xEindMm);
        const lBdPx = b.lBdMm > 0 ? sx(b.lBdMm) - sx(0) : 0;
        const aanloop = Math.min(lBdPx, (x1 - x0) / 2);
        const kleur = "var(--theme-materiaal-lijn, #2A2A30)";
        return (
          <g key={`s${i}`}>
            <line x1={x0 + aanloop} y1={y} x2={x1 - aanloop} y2={y} stroke={kleur} strokeWidth="2" strokeLinecap="round" />
            {aanloop > 0 && (
              <>
                <line x1={x0} y1={y} x2={x0 + aanloop} y2={y} stroke={kleur} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="butt">
                  <title>{`Verankeringslengte l_bd = ${maat(b.lBdMm)} mm: de staaf levert hier nog niet zijn volle kracht (§9.2.1.3(3))`}</title>
                </line>
                <line x1={x1 - aanloop} y1={y} x2={x1} y2={y} stroke={kleur} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="butt">
                  <title>{`Verankeringslengte l_bd = ${maat(b.lBdMm)} mm: de staaf levert hier nog niet zijn volle kracht (§9.2.1.3(3))`}</title>
                </line>
              </>
            )}
            {/* Het label staat waar de bundel zijn VOLLE kracht bereikt, dus
                net voorbij de aanloop van l_bd — en niet in het midden. Twee
                bundels aan dezelfde zijde overlappen elkaar in het midden bijna
                altijd (een doorgaande laag met een bijgelegde laag), en dan
                staan twee labels over elkaar heen. Bij het begin van de bundel
                staan ze uit elkaar én zegt het label meteen wáár die staven
                beginnen. */}
            <text
              x={Math.min(x0 + aanloop + 4, x1 - 2)}
              // Het label wijst NAAR BINNEN, het beton in: een label onder de
              // onderste staaflaag zou buiten de staaf vallen, over de
              // lengtemaatlijn heen.
              y={b.zijde === "boven" ? y + 8.5 : y - 3.5}
              textAnchor="start"
              fontSize="8.5"
              fontWeight="600"
              fill="var(--theme-materiaal-lijn, #2A2A30)"
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {opleggingen.map((o, i) => (
        <OplegTeken key={`o${i}`} x={sx(o.xMm)} y={y1} type={o.type} />
      ))}

      {/* De lengte, als maatlijn onder de staaf. */}
      <g stroke="var(--theme-text-faint, #888)" strokeWidth="0.7">
        <line x1={sx(0)} y1={y1 + 13} x2={sx(lengteMm)} y2={y1 + 13} />
        <line x1={sx(0)} y1={y1 + 10} x2={sx(0)} y2={y1 + 16} />
        <line x1={sx(lengteMm)} y1={y1 + 10} x2={sx(lengteMm)} y2={y1 + 16} />
      </g>
      <text
        x={(sx(0) + sx(lengteMm)) / 2}
        y={y1 + 11}
        textAnchor="middle"
        fontSize="8.5"
        fill="var(--theme-text-muted, #666)"
      >
        {`L = ${nl(lengteMm / 1000, 2)} m`}
      </text>
    </g>
  );
}

/**
 * Het oplegteken, in dezelfde taal als een constructietekening: een driehoek
 * voor een scharnier, een driehoek op rollen voor een roloplegging, een
 * gearceerde wand voor een inklemming en een spiraal voor een veer.
 */
function OplegTeken({ x, y, type }: { x: number; y: number; type: SupportType }) {
  const kleur = "var(--theme-text, #333)";
  const driehoek = `${x},${y} ${x - 6},${y + 9} ${x + 6},${y + 9}`;
  if (type === "fixed") {
    return (
      <g stroke={kleur} strokeWidth="1" fill="none">
        <line x1={x - 8} y1={y} x2={x + 8} y2={y} strokeWidth="2" />
        {[-6, -2, 2, 6].map((d) => (
          <line key={d} x1={x + d} y1={y} x2={x + d - 3} y2={y + 5} />
        ))}
      </g>
    );
  }
  if (type === "zSpring" || type === "xSpring" || type === "rotSpring") {
    return (
      <g stroke={kleur} strokeWidth="1" fill="none">
        <path d={`M ${x} ${y} l 0 2 l -4 1.5 l 8 3 l -8 3 l 8 3 l -4 1.5`} />
        <line x1={x - 6} y1={y + 14} x2={x + 6} y2={y + 14} />
      </g>
    );
  }
  return (
    <g stroke={kleur} strokeWidth="1" fill="none">
      <polygon points={driehoek} />
      {(type === "xRoller" || type === "zRoller") && (
        <>
          <circle cx={x - 3} cy={y + 11.5} r="2" />
          <circle cx={x + 3} cy={y + 11.5} r="2" />
        </>
      )}
    </g>
  );
}

// ══ Eén laan met een benodigde en een aanwezige lijn ═══════════════════════

function LaanTekening({
  laan,
  y0,
  y1,
  sx,
  lengteMm,
}: {
  laan: Laan;
  y0: number;
  y1: number;
  sx: (x: number) => number;
  lengteMm: number;
}) {
  const max = laanMaximum(laan.punten);
  const bruikbaar = y1 - y0 - LAAN_KOP - 3;
  const schaal = max > 0 ? bruikbaar / max : 0;
  // De basislijn ligt aan de kant van de staaf: een laan boven de staaf groeit
  // omhoog vanaf zijn onderrand, een laan eronder groeit omlaag vanaf zijn
  // bovenrand. Zo staat de nul altijd tegen de staaf aan.
  const basis = laan.richting === "omhoog" ? y1 : y0 + LAAN_KOP;
  const sy = (v: number) => (laan.richting === "omhoog" ? basis - v * schaal : basis + v * schaal);

  const eindzones = eindzoneVakken(laan.punten);
  const tekorten = tekortVakken(laan.punten);
  // Werkt er aan deze zijde nergens trek — de bovenwapening van een vrij
  // opgelegde ligger — dan zegt "UC 0,00" niets. De laan zegt dan wat er wél
  // aan de hand is: er is hier niets te dekken.
  const geenTrek = laan.punten.every((punt) => punt.benodigd <= 1e-9);
  const maatgevendPunt =
    !geenTrek && laan.maatgevend !== undefined ? laan.punten[laan.maatgevend] : undefined;

  const pad = (kies: (p: (typeof laan.punten)[number]) => number | null) => {
    const stukken: string[] = [];
    let open = false;
    for (const p of laan.punten) {
      const v = kies(p);
      if (v === null) {
        open = false;
        continue;
      }
      stukken.push(`${open ? "L" : "M"} ${sx(p.xMm).toFixed(2)} ${sy(v).toFixed(2)}`);
      open = true;
    }
    return stukken.join(" ");
  };

  // Het vlak ONDER de aanwezige lijn is de ruimte die er is; het stuk waar de
  // benodigde lijn eroverheen komt, is het tekort. Twee vlakken dus, en niet
  // één lijn met een kleurtje: de lezer moet in één oogopslag zien waar hij
  // ruimte heeft en waar niet.
  const vlakAanwezig = (() => {
    const punten = laan.punten.filter((p) => p.aanwezig !== null);
    if (punten.length < 2) return "";
    const heen = punten
      .map((p) => `${sx(p.xMm).toFixed(2)} ${sy(p.aanwezig as number).toFixed(2)}`)
      .join(" L ");
    return `M ${sx(punten[0].xMm).toFixed(2)} ${basis.toFixed(2)} L ${heen} L ${sx(punten[punten.length - 1].xMm).toFixed(2)} ${basis.toFixed(2)} Z`;
  })();

  return (
    <g className="dek-laan">
      <text x={MARGE_LINKS} y={y0 + 9} fontSize="9" fill="var(--theme-text-secondary, #555)">
        {`${laan.titel} — ${laan.benodigdLabel} / ${laan.aanwezigLabel} [${laan.eenheid}], max ${nl(max, max < 10 ? 3 : 0)}`}
        {geenTrek ? `  ·  ${laan.benodigdLabel} is overal nul: aan deze zijde werkt geen trek` : ""}
      </text>
      {laan.tweede && laan.tweede.punten.length > 1 && (
        <text
          x={sx(lengteMm)}
          y={y0 + 9}
          fontSize="9"
          textAnchor="end"
          fill={laan.tweede.kleur}
          className="dek-tweede-kop"
        >
          {`${laan.tweede.benodigdLabel} / ${laan.tweede.aanwezigLabel} [${laan.tweede.eenheid}] (eigen schaal), max ${nl(laanMaximum(laan.tweede.punten), 3)}`}
        </text>
      )}

      {/* De eindzones: binnen l_bd van een staafeinde geldt §9.2.1.4/§9.2.1.5
          en niet de vrije dekkingslijn. De weerstandslijn begint daar per
          definitie bij nul, dus zonder deze arcering leest de lezer er een
          tekort dat een ander artikel regelt. */}
      {eindzones.map((v, i) =>
        arceringLijnen(
          sx(v.x0Mm),
          Math.min(y0 + LAAN_KOP, y1),
          Math.max(0, sx(v.x1Mm) - sx(v.x0Mm)),
          Math.max(0, y1 - y0 - LAAN_KOP),
        ).map((l, k) => (
          <line
            key={`e${i}-${k}`}
            x1={l[0]}
            y1={l[1]}
            x2={l[2]}
            y2={l[3]}
            stroke="var(--theme-text-faint, #888)"
            strokeWidth="0.7"
            opacity="0.4"
          />
        )),
      )}

      {vlakAanwezig && <path d={vlakAanwezig} fill="#16a34a" opacity="0.13" />}

      {tekorten.map((v, i) => (
        <rect
          key={`t${i}`}
          x={sx(v.x0Mm)}
          y={Math.min(y0 + LAAN_KOP, y1)}
          width={Math.max(0, sx(v.x1Mm) - sx(v.x0Mm))}
          height={Math.max(0, y1 - y0 - LAAN_KOP)}
          fill="var(--theme-danger-color, #dc2626)"
          opacity="0.16"
          className="dek-tekort"
        />
      ))}

      <path
        d={pad((p) => p.aanwezig)}
        fill="none"
        stroke="#16a34a"
        strokeWidth="1.4"
        className="dek-aanwezig"
      />
      <path
        d={pad((p) => p.benodigd)}
        fill="none"
        stroke={laan.kleur}
        strokeWidth="1.8"
        className="dek-benodigd"
      />

      {/* De tweede reeks (scheurwijdte) in dezelfde laan, op eigen schaal:
          w_max als gestreepte grenslijn, w_k als doorgetrokken lijn. Waar w_k
          boven w_max komt, ligt de lijn boven de streep — dat is het tekort,
          en het staat ook in de kleurbalk. */}
      {laan.tweede && laan.tweede.punten.length > 1 && (() => {
        const t = laan.tweede;
        const max2 = laanMaximum(t.punten);
        const schaal2 = max2 > 0 ? bruikbaar / max2 : 0;
        const sy2 = (v: number) => (laan.richting === "omhoog" ? basis - v * schaal2 : basis + v * schaal2);
        const pad2 = (kies: (p: LijnPunt) => number | null) => {
          const stukken: string[] = [];
          let open = false;
          for (const p of t.punten) {
            const v = kies(p);
            if (v === null) { open = false; continue; }
            stukken.push(`${open ? "L" : "M"} ${sx(p.xMm).toFixed(2)} ${sy2(v).toFixed(2)}`);
            open = true;
          }
          return stukken.join(" ");
        };
        return (
          <g className="dek-tweede">
            <path d={pad2((p) => p.aanwezig)} fill="none" stroke={t.kleur} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" className="dek-tweede-grens" />
            <path d={pad2((p) => p.benodigd)} fill="none" stroke={t.kleur} strokeWidth="1.6" className="dek-tweede-lijn" />
          </g>
        );
      })()}

      <line
        x1={sx(0)}
        y1={basis}
        x2={sx(lengteMm)}
        y2={basis}
        stroke="var(--theme-border, #ccc)"
        strokeWidth="0.8"
      />

      {/* De maatgevende plaats — door de kern aangewezen, hier niet herzocht.
          Zij ligt per definitie buiten de eindzones; zie `Momentdekking`. */}
      {maatgevendPunt && maatgevendPunt.uc !== null && (
        <g className="dek-maatgevend">
          <circle
            cx={sx(maatgevendPunt.xMm)}
            cy={sy(maatgevendPunt.benodigd)}
            r="3"
            fill={UC_KLEUR[ucKlasse(maatgevendPunt.uc)]}
            stroke="var(--theme-surface, #fff)"
            strokeWidth="1"
          />
          <text
            x={sx(maatgevendPunt.xMm)}
            y={laan.richting === "omhoog" ? sy(maatgevendPunt.benodigd) - 6 : sy(maatgevendPunt.benodigd) + 11}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill={UC_KLEUR[ucKlasse(maatgevendPunt.uc)]}
          >
            {`UC ${nl(maatgevendPunt.uc, 2)}`}
          </text>
        </g>
      )}
    </g>
  );
}

// ══ De kleurbalk met de unity checks ══════════════════════════════════════

function UcBalk({
  vakken,
  y0,
  hoogte,
  sx,
}: {
  vakken: readonly UcVak[];
  y0: number;
  hoogte: number;
  sx: (x: number) => number;
}) {
  return (
    <g className="dek-ucbalk">
      {vakken.map((v, i) => (
        <rect
          key={i}
          x={sx(v.x0Mm)}
          y={y0}
          // Een halve beeldpunt overlap tegen de afrondingsruis: zonder die
          // overlap blijft er tussen twee vakken een witte haarlijn staan, en
          // die leest als een gat in de toetsing.
          width={Math.max(0.5, sx(v.x1Mm) - sx(v.x0Mm) + 0.5)}
          height={hoogte}
          fill={UC_KLEUR[ucKlasse(v.uc)]}
          opacity={v.uc > 1 ? 0.95 : 0.75}
        >
          <title>{`x = ${maat(v.x0Mm)}…${maat(v.x1Mm)} mm — UC ${nl(v.uc, 2)} (${v.bron})`}</title>
        </rect>
      ))}
      {vakken.length === 0 && (
        <text x={MARGE_LINKS} y={y0 + hoogte - 5} fontSize="9" fill="var(--theme-text-faint, #888)">
          Geen unity check per snede beschikbaar.
        </text>
      )}
    </g>
  );
}

// ══ De x-as ═══════════════════════════════════════════════════════════════

function XAs({
  y,
  lengteMm,
  sx,
  breedtePx,
  tekenW,
}: {
  y: number;
  lengteMm: number;
  sx: (x: number) => number;
  breedtePx: number;
  tekenW: number;
}) {
  // Ongeveer één streepje per 90 beeldpunten, afgerond op een ronde maat in
  // meters — zodat er "1,0 m" staat en niet "0,857 m".
  const gewenst = Math.max(2, Math.round(tekenW / 90));
  const ruweStap = lengteMm / gewenst;
  const machten = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const stap = machten.find((m) => m >= ruweStap) ?? ruweStap;
  const streepjes: number[] = [];
  for (let x = 0; x <= lengteMm + 1e-6; x += stap) streepjes.push(x);
  if (streepjes[streepjes.length - 1] < lengteMm - 1e-6) streepjes.push(lengteMm);

  return (
    <g className="dek-as">
      <line x1={sx(0)} y1={y} x2={sx(lengteMm)} y2={y} stroke="var(--theme-border, #ccc)" strokeWidth="1" />
      {streepjes.map((x, i) => (
        <g key={i}>
          <line x1={sx(x)} y1={y} x2={sx(x)} y2={y + 4} stroke="var(--theme-border, #ccc)" strokeWidth="1" />
          <text
            x={Math.min(breedtePx - 12, Math.max(10, sx(x)))}
            y={y + 14}
            textAnchor="middle"
            fontSize="8.5"
            fill="var(--theme-text-faint, #888)"
          >
            {nl(x / 1000, 2)}
          </text>
        </g>
      ))}
      <text x={sx(lengteMm)} y={y + 22} textAnchor="end" fontSize="8" fill="var(--theme-text-faint, #888)">
        x [m] vanaf de beginknoop
      </text>
    </g>
  );
}
