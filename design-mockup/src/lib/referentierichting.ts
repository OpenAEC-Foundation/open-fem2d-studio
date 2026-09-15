/**
 * referentierichting.ts — de tekenafspraak op de grens tussen solver en toetsing.
 *
 * ── HET PROBLEEM ───────────────────────────────────────────────────────────
 *
 * De solver levert M, V, w, u en θ in LOKALE staafassen: x loopt van de
 * beginknoop naar de eindknoop, +y staat 90° tegen de klok in vanaf die as.
 * Welke knoop het begin is, volgt uit de klikvolgorde bij het tekenen. Dezelfde
 * doorhangende ligger geeft daardoor +45 kNm als hij van links naar rechts is
 * getekend en −45 kNm van rechts naar links (gemeten; zie
 * `test-tekenrichting.mjs`, blok [a]).
 *
 * De toetskernen lezen dat teken als een wereldbegrip: "M_y positief = trek in
 * de onderste vezel" (`mechanics::InternalForces`), en de kipsteunen heten in
 * de invoer "bovenflens" en "onderflens". Tot september 2026 kwam het lokale
 * teken daar ongewijzigd binnen. Gemeten gevolgen bij een rechts→links getekende
 * staaf:
 *  - een betonnen uitkraging toetste de verkeerde wapening als trekwapening:
 *    UC 0,662 "voldoet" waar 2,891 hoort (factor 4,4 aan de onveilige kant);
 *  - een ligger onder windzuiging telde de bovenflenssteunen als steunen van de
 *    gedrukte flens: kip-UC 0,547 waar 1,428 hoort;
 *  - de zeeg vergrootte de zakking in plaats van haar te verkleinen.
 *
 * ── DE AFSPRAAK ────────────────────────────────────────────────────────────
 *
 * Elke staaf heeft een REFERENTIERICHTING:
 *  - LIGGEND — de hoek met de horizontaal is kleiner dan 75° — van LINKS naar
 *    RECHTS;
 *  - STAAND — 75° of meer — van VOET naar KOP: de beginknoop is de voet.
 * De grens is `isOverwegendVerticaal`, dezelfde 75° als `bepaalStandaardRol`
 * voor het staaftype. Er is geen derde regel.
 *
 * Een staaf die tegen zijn referentierichting in is getekend, ziet de toetsing
 * precies alsof hij in de referentierichting was getekend. Dat gebeurt op ÉÉN
 * plek: `toetsdataInReferentierichting`, als eerste regel van elke
 * toetsbouwer (staal, hout, kruislaaghout, beton, spanning). Wie een bouwer
 * aanroept — de toetsstore, de sidecar, het betonvenster, de dekkingslijn, de
 * varianten — krijgt het dus vanzelf, en kan het niet vergeten.
 *
 * Wil de gebruiker de afspraak ooit anders (bijvoorbeeld een staande staaf van
 * kop naar voet), dan verandert alleen `referentieVanStaaf`.
 *
 * ── WAT "SPIEGELEN" INHOUDT ────────────────────────────────────────────────
 *
 * Niet alleen het teken van M. Alles wat aan de staafas hangt, gaat consequent
 * mee; zie de drie regeltabellen onderaan, die de compiler volledig laat houden:
 *  - de solveruitvoer (`SPIEGELREGELS_ELEMENTKRACHTEN`): stations x → L − x in
 *    omgekeerde volgorde; M, w en u van teken; N, V en θ NIET — die zijn onder
 *    het omkeren van de as invariant (V = dM/dx: beide omklappen heft elkaar
 *    op; θ is een draaiing in het vlak). Blok [a] van de test legt dat vast door
 *    de gespiegelde uitkomst te vergelijken met een staaf die werkelijk
 *    andersom is doorgerekend;
 *  - de staaf zelf (`SPIEGELREGELS_STAAF`): begin- en eindknoop, en de
 *    scharnieren en veren van begin en eind;
 *  - de toetsinstellingen (`SPIEGELREGELS_TOETSCONFIG`): kipsteunfracties
 *    f → 1 − f en betonzones [a, b] → [L − b, L − a]. Die staan in het model
 *    gemeten VANAF DE BEGINKNOOP — zo toont het eigenschappenpaneel ze ook —
 *    en blijven daar zo staan; alleen de toetsing ziet ze gespiegeld.
 *
 * ── WAAROM HIER, EN NIET IN DE KERNEN ──────────────────────────────────────
 *
 * Het alternatief was de oriëntatie aan de kernen meegeven en ze zelf "boven"
 * laten bepalen. Dat raakt de staalkern (kipsteunen, zeeg), de betonkern
 * (buiging, M-N-κ, dwarskracht, scheurwijdte, slankheid, zones, dekkingslijn,
 * kolom), de spanningskern (de vezelspanning van een onsymmetrische doorsnede),
 * de segmentstijfheid van de fysisch niet-lineaire lus en de MCP-invoer — elk
 * een plek waar het opnieuw kan worden vergeten, en elk kernresultaat zou dan
 * posities vanaf een wisselend uiteinde tonen. Spiegelen op de grens houdt de
 * kernen bij één betekenis, raakt vijf regels in vijf bouwers plus deze module,
 * en de regeltabellen maken een nieuw positieveld een compileerfout in plaats
 * van een stille fout. Het enige wat de kernen extra krijgen is de STAAFSTAND
 * (`mechanics::Staafstand`), en die rekent nergens mee: hij zet alleen in de
 * afleiding welke wereldzijde "onder" is.
 *
 * ── STAANDE STAVEN ─────────────────────────────────────────────────────────
 *
 * Voor een kolom is "onder" geen fysiek begrip. Van voet naar kop wijst lokaal
 * +y naar LINKS. Dus:
 *  - BOVEN = LINKS: de bovenwapening, de bovenflens, de kipsteunen "bovenflens";
 *  - ONDER = RECHTS: de onderwapening, de onderflens, trek bij een positief
 *    moment.
 * Een kolom die van links door de wind wordt belast, trekt aan de voet aan de
 * linkerkant: M < 0, de bovenwapening (links) op trek.
 *
 * ── ZEEG ───────────────────────────────────────────────────────────────────
 *
 * Zeeg is een positieve grootte OMHOOG; de kern rekent w_fin = w_z + w_zeeg met
 * de gespiegelde zakking (negatief omlaag). NEN-EN 1990 A1.4.3(2) definieert de
 * zeeg w_c bij de VERTICALE doorbuiging (figuur A1.1); bij een staande staaf
 * bestaat "omhoog" loodrecht op de staaf niet, en verrekent de toetsing geen
 * zeeg — met een kanttekening als er toch een is opgegeven.
 */
import type {
  Beam,
  BeamCheckConfig,
  BeamEindVeren,
  BeamReleases,
  Node,
} from "../components/fem/femTypes";
import type {
  BeamSegmentForces,
  ElementForces,
  SolverResult,
} from "../components/fem/solver/types";
import type { ReinforcementZones } from "./types/concrete/ReinforcementZones";
import type { Staafstand } from "./types/steel/Staafstand";
// Wederzijdse import: de staalbouwer roept deze module aan, en deze module
// gebruikt de 75°-regel en de staaflengte van de staalbouwer. Alleen functies,
// die pas bij een aanroep worden gelezen — dan zijn beide modules geladen.
import { beamLengthMm, isOverwegendVerticaal } from "./steelCheckBuilder";

/** Hoe een staaf ten opzichte van zijn referentierichting getekend is. */
export interface Referentie {
  /** De staaf is tegen zijn referentierichting in getekend. */
  gespiegeld: boolean;
  /** Liggend (van links naar rechts) of staand (van voet naar kop). */
  staafstand: Staafstand;
}

/**
 * De referentie van één staaf. Een staaf waarvan de knopen ontbreken of
 * samenvallen, geldt als liggend en niet gespiegeld: er valt niets te spiegelen,
 * en de bouwers slaan zo'n staaf met een reden over.
 *
 * Randgevallen bestaan niet: een liggende staaf heeft per definitie een
 * horizontale component (x-begin ≠ x-eind), een staande een verticale.
 */
export function referentieVanStaaf(beam: Beam, nodes: Node[]): Referentie {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return { gespiegeld: false, staafstand: "Liggend" };
  const staand = isOverwegendVerticaal(beam, nodes);
  return {
    gespiegeld: staand ? a.z > b.z : a.x > b.x,
    staafstand: staand ? "Staand" : "Liggend",
  };
}

/** Tegengesteld teken zonder −0 (dat zou in een vergelijking als ander getal lezen). */
function tegen(v: number): number {
  return v === 0 ? 0 : -v;
}

function omgekeerd<T>(a: readonly T[]): T[] {
  return [...a].reverse();
}

/**
 * De solveruitvoer van één staaf alsof hij andersom getekend was.
 *
 * Posities: x → L − x, en de reeksen in omgekeerde volgorde zodat de stations
 * oplopend blijven. Tekens: zie `SPIEGELREGELS_ELEMENTKRACHTEN`.
 */
export function spiegelElementKrachten(ef: ElementForces): ElementForces {
  const L = ef.L_mm;
  const laatste = <T>(a: readonly T[], anders: T): T => (a.length > 0 ? a[a.length - 1] : anders);
  const uit: ElementForces = {
    N: laatste(ef.normalForce, ef.N),
    V: laatste(ef.shearForce, ef.V),
    M_start: tegen(ef.M_end),
    M_end: tegen(ef.M_start),
    L_mm: L,
    stations_mm: omgekeerd(ef.stations_mm).map((x) => L - x),
    normalForce: omgekeerd(ef.normalForce),
    shearForce: omgekeerd(ef.shearForce),
    bendingMoment: omgekeerd(ef.bendingMoment).map(tegen),
    deflection: omgekeerd(ef.deflection).map(tegen),
    axialDisp: omgekeerd(ef.axialDisp).map(tegen),
  };
  if (ef.rotation) uit.rotation = omgekeerd(ef.rotation);
  if (ef.segmenten) uit.segmenten = omgekeerd(ef.segmenten).map((s) => spiegelSegment(s, L));
  return uit;
}

function spiegelSegment(s: BeamSegmentForces, L: number): BeamSegmentForces {
  return {
    xStart: L - s.xEnd,
    xEnd: L - s.xStart,
    I: s.I,
    // De index wijst in `SolverBeamInput.segmenten`, de solverinvoer, en die
    // wordt niet gespiegeld.
    segmentIndex: s.segmentIndex,
    N_start: s.N_end,
    N_end: s.N_start,
    M_start: tegen(s.M_end),
    M_end: tegen(s.M_start),
    M_max: tegen(s.M_max),
    N_bij_M_max: s.N_bij_M_max,
  };
}

/**
 * Kipsteunfracties vanaf het andere uiteinde: f → 1 − f.
 *
 * Afgerond op 12 decimalen: 1 − 0,8 is in dubbele precisie 0,19999999999999996,
 * en een gebruiker die bij de andere tekenrichting 0,2 invoert, hoort precies
 * dezelfde fractie in de toetsinvoer te zien. Twaalf decimalen is op een staaf
 * van 100 m een tiende nanometer.
 */
export function spiegelFracties(fracties: readonly number[]): number[] {
  return fracties.map((f) => Math.round((1 - f) * 1e12) / 1e12);
}

/**
 * Betonzones vanaf het andere uiteinde: [a, b] → [L − b, L − a], elke lijst in
 * omgekeerde volgorde zodat een oplopende lijst oplopend blijft. Zijde (boven of
 * onder), staafvorm en stortpositie gaan ongewijzigd mee: dat zijn zijden en
 * eigenschappen, geen posities langs de staaf.
 *
 * Zijn eigen omgekeerde: tweemaal spiegelen geeft de zones terug. Het
 * betonvenster gebruikt dat om de editor in de referentierichting te tonen en
 * de invoer weer vanaf de beginknoop op te slaan.
 */
export function spiegelZones(zones: ReinforcementZones, lengteMm: number): ReinforcementZones {
  return {
    longitudinal: omgekeerd(zones.longitudinal).map((z) => ({
      ...z,
      x_start_mm: lengteMm - z.x_end_mm,
      x_end_mm: lengteMm - z.x_start_mm,
    })),
    stirrups: omgekeerd(zones.stirrups).map((z) => ({
      ...z,
      x_start_mm: lengteMm - z.x_end_mm,
      x_end_mm: lengteMm - z.x_start_mm,
    })),
  };
}

/** Begin- en eindwaarden van scharnieren of veren verwisseld. */
function spiegelEinden<T extends BeamReleases | BeamEindVeren>(einden: T): T {
  const uit: Record<string, unknown> = {};
  for (const [sleutel, waarde] of Object.entries(einden)) {
    const nieuw = sleutel.startsWith("start")
      ? `end${sleutel.slice("start".length)}`
      : sleutel.startsWith("end")
        ? `start${sleutel.slice("end".length)}`
        : sleutel;
    uit[nieuw] = waarde;
  }
  return uit as T;
}

function spiegelToetsconfig(cfg: BeamCheckConfig, lengteMm: number): BeamCheckConfig {
  const uit: Record<string, unknown> = { ...cfg };
  for (const [sleutel, waarde] of Object.entries(cfg)) {
    if (waarde === undefined) continue;
    // Een veld dat de tabel niet kent (een ouder projectbestand) kan geen
    // positieveld van nu zijn en gaat ongewijzigd mee.
    const regel = (SPIEGELREGELS_TOETSCONFIG as Record<string, ConfigRegel | undefined>)[sleutel];
    if (regel === "fracties" && Array.isArray(waarde)) {
      uit[sleutel] = spiegelFracties(waarde as number[]);
    } else if (regel === "zonesMm") {
      uit[sleutel] = spiegelZones(waarde as ReinforcementZones, lengteMm);
    }
  }
  return uit as BeamCheckConfig;
}

/**
 * De staaf zoals de toetsing hem ziet: in zijn referentierichting. Een staaf die
 * al zo getekend is, komt als hetzelfde object terug.
 */
export function staafInReferentierichting(beam: Beam, nodes: Node[]): Beam {
  if (!referentieVanStaaf(beam, nodes).gespiegeld) return beam;
  const lengteMm = beamLengthMm(beam, nodes);
  const uit: Beam = { ...beam, from: beam.to, to: beam.from };
  if (beam.releases) uit.releases = spiegelEinden(beam.releases);
  if (beam.veren) uit.veren = spiegelEinden(beam.veren);
  if (beam.checkConfig) uit.checkConfig = spiegelToetsconfig(beam.checkConfig, lengteMm);
  return uit;
}

/**
 * Een solverresultaat met de staven uit `gespiegeld` in hun referentierichting.
 * Knoopverplaatsingen, reacties en plaatspanningen zijn wereldgrootheden en
 * blijven zoals ze zijn.
 */
export function resultaatInReferentierichting(
  result: SolverResult,
  gespiegeld: ReadonlySet<number>,
): SolverResult {
  let elements: Map<number, ElementForces> | null = null;
  for (const id of gespiegeld) {
    const ef = result.elements.get(id);
    if (!ef) continue;
    elements ??= new Map(result.elements);
    elements.set(id, spiegelElementKrachten(ef));
  }
  return elements ? { ...result, elements } : result;
}

/** Wat elke toetsbouwer binnenkrijgt, voor zover het de staafrichting raakt. */
export interface Toetsdata {
  nodes: Node[];
  beams: Beam[];
  combinationResults: Map<number, SolverResult>;
}

/**
 * DE GRENS. De bouwerinvoer met elke staaf in zijn referentierichting: de staven
 * zelf én hun krachten, zakkingen en positievelden.
 *
 * Idempotent: op zijn eigen uitkomst toegepast verandert er niets meer, want
 * dan staat elke staaf al in zijn referentierichting. Wat NIET werkt, is
 * gespiegelde staven met ongespiegelde resultaten combineren (of andersom);
 * geef altijd het paar door dat bij elkaar hoort.
 */
export function toetsdataInReferentierichting<T extends Toetsdata>(data: T): T {
  const gespiegeld = new Set<number>();
  for (const b of data.beams) {
    if (referentieVanStaaf(b, data.nodes).gespiegeld) gespiegeld.add(b.id);
  }
  if (gespiegeld.size === 0) return data;
  return {
    ...data,
    beams: data.beams.map((b) => staafInReferentierichting(b, data.nodes)),
    combinationResults: new Map(
      [...data.combinationResults].map(
        ([id, r]) => [id, resultaatInReferentierichting(r, gespiegeld)] as const,
      ),
    ),
  };
}

/** De wereldzijden die in een afleiding "onder" en "boven" heten. */
export function zijdenInWereldtermen(staafstand: Staafstand): { onder: string; boven: string } {
  return staafstand === "Staand"
    ? { onder: "rechts", boven: "links" }
    : { onder: "onder", boven: "boven" };
}

/** Getal met decimaalkomma voor een kanttekening. */
function nl(v: number): string {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

/**
 * De toetsinstellingen zonder zeeg bij een STAANDE staaf. Zie het blok ZEEG
 * bovenaan: "omhoog" bestaat daar niet loodrecht op de staaf, en de zijdelingse
 * eis van A1.4.3(7) meet de kop ten opzichte van de voet — die verandert niet
 * door een staaf vooraf krom te maken.
 */
export function zeegVoorToets(beam: Beam, nodes: Node[]): BeamCheckConfig {
  const cfg = beam.checkConfig ?? {};
  if (cfg.preCamber_mm === undefined) return cfg;
  if (referentieVanStaaf(beam, nodes).staafstand === "Liggend") return cfg;
  const zonder = { ...cfg };
  delete zonder.preCamber_mm;
  return zonder;
}

/** De kanttekening als `zeegVoorToets` een opgegeven zeeg heeft laten vallen. */
export function zeegNotities(beam: Beam, nodes: Node[]): string[] {
  const zeeg = beam.checkConfig?.preCamber_mm;
  if (zeeg === undefined || zeeg === 0) return [];
  if (referentieVanStaaf(beam, nodes).staafstand === "Liggend") return [];
  return [
    `De opgegeven zeeg van ${nl(zeeg)} mm is NIET verrekend. NEN-EN 1990 A1.4.3(2) ` +
      "definieert de zeeg w_c bij de VERTICALE doorbuiging (figuur A1.1); deze staaf " +
      "staat overwegend verticaal (75° of meer met de horizontaal), en daar bestaat " +
      '"omhoog" loodrecht op de staaf niet. Een zeeg verandert bovendien de ' +
      "horizontale verplaatsing van de kop ten opzichte van de voet niet.",
  ];
}

// ── De regeltabellen ────────────────────────────────────────────────────────
//
// Elk veld van de drie typen staat hier, met wat spiegelen ermee doet. De
// mapped types laten de compiler dat afdwingen: wie een veld aan
// `ElementForces`, `Beam` of `BeamCheckConfig` toevoegt zonder het hier in te
// delen, krijgt een fout van `tsc` in plaats van een stil vergeten spiegeling.

/** Wat spiegelen met een veld van de solveruitvoer doet. Geïmplementeerd in `spiegelElementKrachten`. */
export const SPIEGELREGELS_ELEMENTKRACHTEN: { [K in keyof Required<ElementForces>]: string } = {
  N: "de normaalkracht aan het nieuwe begin (het oude eind); trek blijft trek",
  V: "de dwarskracht aan het nieuwe begin; V = dM/dx en x én M klappen om, dus geen tekenwissel",
  M_start: "−M_end: het moment aan het oude eind, met omgekeerd teken",
  M_end: "−M_start",
  L_mm: "gelijk",
  stations_mm: "L − x, in omgekeerde volgorde",
  normalForce: "omgekeerde volgorde, zelfde teken",
  shearForce: "omgekeerde volgorde, zelfde teken",
  bendingMoment: "omgekeerde volgorde, tegengesteld teken (+y klapt om, dus 'onder' ook)",
  deflection: "omgekeerde volgorde, tegengesteld teken (w staat langs lokaal +y)",
  axialDisp: "omgekeerde volgorde, tegengesteld teken (u staat langs de staafas)",
  rotation: "omgekeerde volgorde, zelfde teken (een draaiing in het vlak hangt niet aan de as)",
  segmenten: "x → L − x, begin en eind verwisseld, momenten tegengesteld; segmentIndex blijft",
};

/** Wat spiegelen met een veld van de staaf doet. Geïmplementeerd in `staafInReferentierichting`. */
export const SPIEGELREGELS_STAAF: { [K in keyof Required<Beam>]: string } = {
  id: "gelijk",
  from: "wordt de eindknoop",
  to: "wordt de beginknoop",
  material: "gelijk",
  profile: "gelijk",
  releases: "begin en eind verwisseld",
  veren: "begin en eind verwisseld",
  checkConfig: "per veld, zie SPIEGELREGELS_TOETSCONFIG",
  loadRole: "gelijk: het staaftype hangt niet aan de tekenrichting",
  bedding: "gelijk: over de hele staaf",
};

type ConfigRegel = "gelijk" | "fracties" | "zonesMm";

/** Wat spiegelen met een toetsinstelling doet. Geïmplementeerd in `spiegelToetsconfig`. */
export const SPIEGELREGELS_TOETSCONFIG: { [K in keyof Required<BeamCheckConfig>]: ConfigRegel } = {
  bucklingLengthY_m: "gelijk",
  bucklingLengthZ_m: "gelijk",
  // Fracties vanaf de beginknoop.
  lateralRestraints: "fracties",
  lateralRestraintsBottom: "fracties",
  deflectionClass: "gelijk",
  deflectionLimitNumerator: "gelijk",
  deflectionAddLimitNumerator: "gelijk",
  // Een grootte omhoog, geen positie; bij een staande staaf zie `zeegVoorToets`.
  preCamber_mm: "gelijk",
  serviceClass: "gelijk",
  loadDuration: "gelijk",
  // Een afstand, geen positie.
  ltbSupportSpacing_m: "gelijk",
  // Boven en onder zijn ZIJDEN in de referentierichting, geen posities.
  betonKorf: "gelijk",
  betonMilieuklasse: "gelijk",
  betonConstructieklasse: "gelijk",
  betonStaalsoort: "gelijk",
  betonStroken: "gelijk",
  betonStaaltak: "gelijk",
  // Schoring, kniklengte, kruip en een beugelzone-SOORT: geen posities.
  betonKolom: "gelijk",
  // Maten in mm vanaf de beginknoop.
  betonZones: "zonesMm",
  spanningSigmaZ: "gelijk",
};
