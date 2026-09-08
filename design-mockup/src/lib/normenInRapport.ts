/**
 * normenInRapport — welke Eurocodes de regel "Toegepaste normen" bovenin het
 * rekenrapport mag noemen.
 *
 * HET PROBLEEM
 * De uitgangspunten kenden drie normvinkjes waarvan er twee standaard aan
 * stonden. Een zuiver stalen raamwerk meldde daardoor in zijn kop "Eurocode 5
 * — Hout (EN 1995-1-1)": een norm die in dat werk nergens is toegepast, en dat
 * uitgerekend in het hoofdstuk dat de lezer vertelt waarop de berekening rust.
 * Een stand die niemand heeft gekozen mag niet als keuze van de constructeur
 * in het rapport verschijnen.
 *
 * WAAROM DE VINKJES DAN NIET GEWOON UIT KUNNEN
 * Het vinkje heeft een tweede, legitieme functie: vooruitlopen op wat er nog
 * getekend gaat worden. Wie EN 1995 bewust aanzet hoort hem te blijven zien,
 * ook in een model waar nog geen houten staaf in staat. "Aan omdat de
 * gebruiker hem aanzette" en "aan omdat het de standaardstand was" moeten dus
 * uit elkaar te houden zijn — en aan `en1995: true` alleen is dat niet te
 * zien. Daarom draagt de keuze een tweede veld: `normenHandmatig`, de lijst
 * vinkjes die de gebruiker zelf heeft omgezet.
 *
 * DE DRIE REGELS, in deze volgorde
 *  1. Er ligt een toetsresultaat voor die norm → noemen. Wat gedraaid is hoort
 *     verantwoord te worden; daar gaat geen vinkje overheen.
 *  2. De gebruiker heeft het vinkje zelf gezet → zijn stand geldt, aan én uit.
 *  3. Anders volgt de norm het MODEL: zit er materiaal van die soort in de
 *     staven, dan hoort de norm erbij, en anders niet.
 *
 * BESTAANDE PROJECTBESTANDEN
 * Daarin staat `normenHandmatig` niet. Dat leest hier als "geen enkel vinkje
 * is aanwijsbaar door de gebruiker gezet", waarna alle drie de normen het
 * model volgen — precies de eerlijke uitleg van een stand die niemand heeft
 * gekozen. Zulke bestanden hoeven niet gemigreerd te worden en verliezen
 * niets: raakt de gebruiker één vinkje aan, dan telt dat vinkje meteen weer
 * als keuze.
 *
 * DE VRAAG IS "WORDT DEZE NORM TOEGEPAST", NIET "KAN HIJ VAN PAS KOMEN"
 * Bij twijfel valt een norm hier weg, andersom dan bij `sectieRelevantie`.
 * Daar kost een overbodig hoofdstuk een halve bladzijde; hier kost een
 * overbodige norm de geloofwaardigheid van de uitgangspunten. Een staaf met
 * een onbekend materiaal en een vrij materiaal ("VRIJ: …", geen norm maar
 * eigen getallen) brengen daarom géén norm mee.
 */
import type { Beam } from "../components/fem/femTypes";
import { materiaalVanStaaf, type StaafMateriaal } from "./variantInvoer";

export const NORM_SLEUTELS = ["en1993", "en1995", "en1992"] as const;

export type NormSleutel = (typeof NORM_SLEUTELS)[number];

/** Per norm: hoort hij in deze regel thuis? */
export type NormVlaggen = Record<NormSleutel, boolean>;

/**
 * De normkeuze zoals ze in de projectgegevens staat (`Uitgangspunten`). Hier
 * als eigen, kale vorm zodat deze module niets van de dialoog hoeft te weten
 * en buiten de browser te draaien is.
 */
export interface NormKeuze {
  en1993: boolean;
  en1995: boolean;
  en1992: boolean;
  /** De vinkjes die de gebruiker zelf heeft omgezet; ontbreekt = geen enkel. */
  normenHandmatig?: readonly NormSleutel[];
}

/**
 * Verse vlaggenset. Bewust geen gedeelde constante: het rapport rekent dit per
 * render uit en één per ongeluk gemuteerd gedeeld object zou daarna in élk
 * rapport blijven staan.
 */
function leeg(): NormVlaggen {
  return { en1993: false, en1995: false, en1992: false };
}

/**
 * De norm waaronder een staafmateriaal valt.
 *
 * Kruislaaghout gaat hier bij EN 1995, dezelfde afspraak als de toetsbasis in
 * de voetregel (`usedNorms` rekent elk niet-stalen, niet-betonnen resultaat
 * tot hout). Een vrij materiaal heeft geen norm: de gebruiker geeft daar zelf
 * E en de toelaatbare spanning, en de spanningstoets die erop draait is geen
 * normtoetsing.
 */
export function normVanMateriaal(soort: StaafMateriaal): NormSleutel | null {
  switch (soort) {
    case "staal":
      return "en1993";
    case "hout":
    case "clt":
      return "en1995";
    case "beton":
      return "en1992";
    default:
      return null;
  }
}

/** Welke normen het MODEL zelf aandraagt: de materialen van de staven. */
export function normenInModel(beams: Beam[]): NormVlaggen {
  const uit = leeg();
  for (const beam of beams) {
    const norm = normVanMateriaal(materiaalVanStaaf(beam));
    if (norm !== null) uit[norm] = true;
  }
  return uit;
}

/**
 * Het oordeel van `usedNorms` (welke normen er daadwerkelijk getoetst zijn)
 * in normsleutels. Los gehouden van `checkReportUtils`, dat de vertaalfunctie
 * van de rapportschil meetrekt.
 */
export function normenUitToetsen(gebruikt: {
  steel: boolean;
  timber: boolean;
  concrete: boolean;
}): NormVlaggen {
  return {
    en1993: gebruikt.steel,
    en1995: gebruikt.timber,
    en1992: gebruikt.concrete,
  };
}

/**
 * De vinkjes die de gebruiker aantoonbaar zelf heeft gezet — de stand die het
 * dialoogvenster hoort te tonen. Een `true` zonder vermelding in
 * `normenHandmatig` is de oude standaardstand en dus niemands keuze; een
 * aangevinkt hokje dat het rapport vervolgens negeert zou een tweede
 * onwaarheid zijn naast de eerste.
 */
export function gekozenNormen(keuze: NormKeuze): NormVlaggen {
  const handmatig = new Set(keuze.normenHandmatig ?? []);
  const uit = leeg();
  for (const sleutel of NORM_SLEUTELS) {
    uit[sleutel] = handmatig.has(sleutel) && keuze[sleutel] === true;
  }
  return uit;
}

/**
 * De normen die in de uitgangspunten van het rapport mogen staan — de drie
 * regels uit de kop van dit bestand, in die volgorde.
 */
export function normenVoorRapport(
  keuze: NormKeuze,
  inModel: NormVlaggen,
  getoetst: NormVlaggen,
): NormVlaggen {
  const handmatig = new Set(keuze.normenHandmatig ?? []);
  const uit = leeg();
  for (const sleutel of NORM_SLEUTELS) {
    uit[sleutel] = getoetst[sleutel]
      ? true
      : handmatig.has(sleutel)
        ? keuze[sleutel] === true
        : inModel[sleutel];
  }
  return uit;
}
