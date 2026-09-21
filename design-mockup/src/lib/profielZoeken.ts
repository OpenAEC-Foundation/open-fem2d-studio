/**
 * profielZoeken — de zoekfunctie van de profielkiezer (issue #39).
 *
 * WAAROM EEN EIGEN BESTAND
 *  Wie het profiel al kent ("HEB 240", of alleen "240") moest in de kiezer
 *  toch eerst de reeks opzoeken. Zoeken hoort dus OVER DE REEKSEN HEEN te
 *  gaan: één term, treffers uit alle reeksen, gegroepeerd per reeks. Dat is
 *  lijstwerk zonder scherm, en staat daarom hier als pure functie met een
 *  eigen test (`test-profiel-zoeken.mjs`); de component tekent alleen.
 *
 * WAT EEN TREFFER IS
 *  De term en de profielnaam worden op dezelfde manier platgeslagen
 *  (`normaliseerZoektekst`): kleine letters, zonder spaties, "×" en "*" als
 *  "x", een komma als punt. Daardoor vinden "hea160", "HEA 160" en "hea  160"
 *  hetzelfde profiel, en vindt "42,5" de historische maat "DIN 42.5".
 *
 *  Er wordt op de LEESBARE naam gezocht en niet op de databasesleutel. De
 *  sleutel van "DIN 42.5" is "DIN425"; zoeken op de sleutel zou bij "425" een
 *  profiel aanwijzen dat geen maat 425 heeft (zie `profielLabel`).
 *
 *  Een woord van de term mag daarnaast de REEKS aanwijzen in plaats van het
 *  profiel, zodat "koker 100" en "gelijkbenig 80" werken: de kokers heten
 *  "SHS …" en "RHS …", het woord "koker" staat alleen in de reeksnaam. Zo'n
 *  reekswoord is een woord zonder cijfer, van minstens twee letters, dat in de
 *  reeksnaam staat en NIET in de profielnaam. De rest van de term moet dan als
 *  geheel in de profielnaam staan.
 *   - Zonder cijfer: de reeksnaam van de kokers bevat "EN 10210", en anders
 *     zou "102" elke koker opleveren.
 *   - Minstens twee letters: "L 100" past al op de profielnaam, en een losse
 *     "e" staat in bijna elke reeksnaam.
 *   - De rest als GEHEEL, niet woord voor woord: wie "heb 2" typt is op weg
 *     naar HEB 2xx en verwacht geen HEB 120 omdat daar ook een 2 in zit.
 *
 * VOLGORDE
 *  Reeksen in de volgorde van de catalogus, maar de oude reeksen ("(oud)")
 *  onderaan: ze doen mee — wie een bestaande constructie narekent zoekt juist
 *  die — maar horen een gangbaar profiel niet van het scherm te duwen. Binnen
 *  een reeks blijft de volgorde van de catalogus staan (op maat).
 *
 * Dit bestand laadt geen i18n: de vertaalde reeksnaam komt van de aanroeper.
 */
import { STEEL_SECTION_DIMS } from "./steelSectionDims.generated";
import { profileLookupKey } from "./steelCheckBuilder";
import { matchSupportedConcreteClass } from "./betonCheckBuilder";
import { isCltProfiel } from "./cltCheckBuilder";
import { TIMBER_E_MEAN, parseRechthoek } from "./sectionResolver";
import { parseVrijMateriaal } from "./vrijMateriaal";
import { REEKSEN, profielLabel, profielenVanReeks } from "./profieleditor/catalogus";

/** Eén profiel zoals de zoekfunctie het ziet: de sleutel en de leesbare naam. */
export interface ZoekProfiel {
  /** Databasesleutel ("HEA160") — wat er op de staaf komt te staan. */
  sleutel: string;
  /** Leesbare naam ("HEA 160") — waarop gezocht wordt. */
  label: string;
}

/** Eén reeks met zijn profielen, in de volgorde waarin ze getoond worden. */
export interface ZoekReeks {
  id: string;
  /** Oude reeks: doet mee, maar staat onderaan in de treffers. */
  oud: boolean;
  /** Naam van de reeks zoals hij op het scherm staat (vertaald). */
  zoektekst: string;
  profielen: ZoekProfiel[];
}

/** De treffers van één reeks. */
export interface ZoekGroep {
  reeksId: string;
  oud: boolean;
  /** Databasesleutels, in de volgorde van de reeks. */
  treffers: string[];
}

export interface ZoekUitslag {
  /** Is er een zoekterm? Zo niet, dan blijft de kiezer per reeks werken. */
  actief: boolean;
  /** Alleen reeksen MET treffers; oude reeksen onderaan. */
  groepen: ZoekGroep[];
  /** Aantal treffers per reeks — élke reeks, ook die met nul. */
  perReeks: Record<string, number>;
  totaal: number;
}

/**
 * Tekst platslaan om te vergelijken: hoofdletters, spaties, koppeltekens en
 * de schrijfwijze van het maalteken en de decimaal mogen geen verschil maken.
 */
export function normaliseerZoektekst(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[×*]/g, "x")
    .replace(/,/g, ".")
    .replace(/[\s\-_]+/g, "");
}

/** De losse woorden van een term, elk al platgeslagen; lege woorden vallen weg. */
function woordenVan(term: string): string[] {
  return term
    .split(/\s+/)
    .map(normaliseerZoektekst)
    .filter((w) => w !== "");
}

/**
 * Staat de term in de tekst? Voor lijsten zonder reeksen (de eigen
 * doorsneden): dezelfde ongevoeligheid voor hoofdletters en spaties. Een lege
 * term past op alles.
 */
export function bevatZoekterm(tekst: string, term: string): boolean {
  const naald = normaliseerZoektekst(term);
  if (naald === "") return true;
  const hooi = normaliseerZoektekst(tekst);
  if (hooi.includes(naald)) return true;
  const woorden = woordenVan(term);
  return woorden.length > 1 && woorden.every((w) => hooi.includes(w));
}

/** Past dit profiel uit deze reeks bij de term? Zie de kop voor de regels. */
function isTreffer(label: string, reeksTekst: string, naald: string, woorden: string[]): boolean {
  if (label.includes(naald)) return true;
  const isReekswoord = (w: string) =>
    w.length >= 2 && !/\d/.test(w) && reeksTekst.includes(w) && !label.includes(w);
  if (!woorden.some(isReekswoord)) return false;
  return label.includes(woorden.filter((w) => !isReekswoord(w)).join(""));
}

/**
 * Term → treffers per reeks.
 *
 * Zonder term (leeg of alleen spaties) is de uitslag niet actief en leeg: de
 * aanroeper toont dan de gekozen reeks zoals altijd.
 */
export function zoekProfielen(term: string, reeksen: ZoekReeks[]): ZoekUitslag {
  const naald = normaliseerZoektekst(term);
  const perReeks: Record<string, number> = {};
  for (const r of reeksen) perReeks[r.id] = 0;
  if (naald === "") return { actief: false, groepen: [], perReeks, totaal: 0 };

  const woorden = woordenVan(term);
  const groepen: ZoekGroep[] = [];
  let totaal = 0;
  for (const r of reeksen) {
    const reeksTekst = normaliseerZoektekst(r.zoektekst);
    const treffers = r.profielen
      .filter((p) => isTreffer(normaliseerZoektekst(p.label), reeksTekst, naald, woorden))
      .map((p) => p.sleutel);
    perReeks[r.id] = treffers.length;
    totaal += treffers.length;
    if (treffers.length > 0) groepen.push({ reeksId: r.id, oud: r.oud, treffers });
  }
  // Stabiel sorteren: alleen "oud" verhuist naar onderen, de rest houdt de
  // volgorde van de catalogus.
  groepen.sort((a, b) => Number(a.oud) - Number(b.oud));
  return { actief: true, groepen, perReeks, totaal };
}

/**
 * De treffers als één lijst, in de volgorde waarin ze op het scherm staan —
 * waar de pijltjestoetsen doorheen lopen. Met `alleenReeks` blijft alleen die
 * reeks over (de gebruiker klikte een reeks aan tijdens het zoeken).
 */
export function vlakkeTreffers(uitslag: ZoekUitslag, alleenReeks: string | null = null): string[] {
  return uitslag.groepen
    .filter((g) => alleenReeks === null || g.reeksId === alleenReeks)
    .flatMap((g) => g.treffers);
}

/**
 * De volgende gemarkeerde rij bij pijltje omlaag (+1) of omhoog (−1).
 *
 * Klemt aan de randen in plaats van rond te lopen: in een lijst van honderd
 * profielen is "omhoog vanaf de eerste" een vergissing en geen wens om
 * onderaan te belanden. Zonder markering begint omlaag bovenaan en omhoog
 * onderaan. `null` bij een lege lijst.
 */
export function verplaatsMarkering(
  lijst: string[],
  huidig: string | null,
  stap: 1 | -1,
): string | null {
  if (lijst.length === 0) return null;
  const i = huidig === null ? -1 : lijst.indexOf(huidig);
  if (i < 0) return stap > 0 ? lijst[0] : lijst[lijst.length - 1];
  return lijst[Math.min(lijst.length - 1, Math.max(0, i + stap))];
}

/**
 * De staalcatalogus in de vorm die `zoekProfielen` leest. `reeksTekst` levert
 * de naam van een reeks zoals hij op het scherm staat (de component vertaalt);
 * zonder die functie geldt het Nederlandse label uit de catalogus.
 */
export function catalogusZoekReeksen(
  reeksTekst: (reeks: { id: string; label: string }) => string = (r) => r.label,
): ZoekReeks[] {
  return REEKSEN.map((r) => ({
    id: r.id,
    oud: r.oud === true,
    zoektekst: reeksTekst(r),
    profielen: profielenVanReeks(r.id).map((sleutel) => ({ sleutel, label: profielLabel(sleutel) })),
  }));
}

/** Een combinatie die al in het model staat (zie `profielenInGebruik`). */
interface InGebruik {
  material: string;
  profile: string;
}

/**
 * Welke van de al gebruikte profielen horen in deze stap van de kiezer?
 *
 * "In dit project" stond alleen in de materiaalstap. In de profielstap horen
 * uitsluitend de combinaties die díe stap ook kan maken: een houten balk als
 * snelkeuze in de staalstap zou de stap verlaten zonder dat de gebruiker dat
 * vroeg. De indeling volgt de startstap van de kiezer: vrij materiaal en
 * beton vallen af, hout is wat een houtklasse draagt, en staal is wat
 * overblijft én in de catalogus staat.
 */
export function inGebruikVoorStap<T extends InGebruik>(lijst: T[], stap: "staal" | "hout"): T[] {
  return lijst.filter((g) => {
    if (parseVrijMateriaal(g.material)) return false;
    if (matchSupportedConcreteClass(g.material) !== null) return false;
    const isHout = g.material in TIMBER_E_MEAN;
    if (stap === "hout") {
      return isHout && (isCltProfiel(g.profile) || parseRechthoek(g.profile) !== null);
    }
    return !isHout && STEEL_SECTION_DIMS[profileLookupKey(g.profile)] !== undefined;
  });
}
