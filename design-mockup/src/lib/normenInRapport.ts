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
 * normen waarover de gebruiker zelf een uitspraak heeft gedaan.
 *
 * DRIE STANDEN, GEEN TWEE — DE REDEN DAT DIT GEEN VINKJE MEER IS
 * Twee velden samen beschrijven DRIE standen (zie `NormStand`): "volgt het
 * model", "altijd vermelden" en "niet vermelden". Een aan/uit-vinkje kan er
 * maar twee tonen, en het perste "volgt het model" en "niet vermelden" in
 * hetzelfde lege hokje. Dat was geen schoonheidsfout maar een leugen op het
 * scherm: hetzelfde lege hokje leverde bij hout in het model de ene keer wél
 * en de andere keer géén EN 1995 in het rapport, zonder dat de gebruiker kon
 * zien welke van de twee hij voor zich had. Erger nog: wie één keer klikte
 * kwam nooit meer terug in "volgt het model", want een vinkje kan zijn eigen
 * spoor in `normenHandmatig` niet meer uitwissen. Daarom kent deze module de
 * stand expliciet (`normStanden`) en zet de dialoog hem met `zetNormStand`,
 * dat óók de weg terug kent.
 *
 * DE DRIE REGELS, in deze volgorde
 *  1. Er ligt een toetsresultaat voor die norm → noemen. Wat gedraaid is hoort
 *     verantwoord te worden; daar gaat geen keuze overheen.
 *  2. De gebruiker heeft zelf een stand gekozen → die geldt, aan én uit.
 *  3. Anders volgt de norm het MODEL: zit er materiaal van die soort in de
 *     staven, dan hoort de norm erbij, en anders niet.
 *
 * WAT DE GEBRUIKER DAARVAN TE ZIEN KRIJGT
 * Regel 1 overrulet zijn keuze. Een scherm dat "niet vermelden" toont terwijl
 * het rapport de norm tóch noemt, liegt opnieuw — daarom vertelt
 * `normOordelen` de dialoog per norm welke van de drie regels het wint, zodat
 * ze "toch vermeld: er is op getoetst" kan tonen in plaats van te zwijgen.
 *
 * BESTAANDE PROJECTBESTANDEN
 * Daarin staat `normenHandmatig` niet. Dat leest hier als "de gebruiker heeft
 * over geen enkele norm iets gezegd", waarna alle drie de normen het model
 * volgen — precies de eerlijke uitleg van een stand die niemand heeft gekozen.
 * Zulke bestanden hoeven niet gemigreerd te worden en verliezen niets: doet de
 * gebruiker één uitspraak, dan telt die meteen.
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
  /**
   * De normen waarover de gebruiker zelf een uitspraak heeft gedaan; ontbreekt
   * = geen enkele. Samen met de boolean hierboven vormt dit de stand: staat de
   * sleutel er niet in, dan is de boolean betekenisloos en volgt de norm het
   * model. Zie `normStanden`.
   */
  normenHandmatig?: readonly NormSleutel[];
}

/**
 * De stand van één norm in de uitgangspunten — de drie dingen die een
 * gebruiker kan bedoelen, uit elkaar gehouden:
 *
 *  - `"model"` — geen uitspraak; de norm komt in het rapport zodra er
 *    materiaal van die soort in het model zit of erop getoetst is. De
 *    beginstand, en de stand van elk projectbestand van vóór `normenHandmatig`.
 *  - `"aan"`   — altijd vermelden, ook in een model waar dat materiaal nog
 *    getekend moet worden.
 *  - `"uit"`   — niet vermelden, ook niet als het model die soort bevat.
 *
 * `"model"` en `"uit"` zijn NIET hetzelfde en mogen op het scherm nooit op
 * hetzelfde neerkomen: bij hout in het model levert de eerste wél en de tweede
 * géén EN 1995 in het rapport.
 */
export type NormStand = "model" | "aan" | "uit";

/** Per norm de stand die het scherm hoort te tonen. */
export type NormStanden = Record<NormSleutel, NormStand>;

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
 * De stand per norm — de enige plek waar de twee opgeslagen velden tot een
 * stand worden samengevoegd. Een `true` zonder vermelding in `normenHandmatig`
 * is de oude standaardstand en dus niemands uitspraak; die leest hier als
 * `"model"`, precies zoals het rapport hem behandelt.
 */
export function normStanden(keuze: NormKeuze): NormStanden {
  const handmatig = new Set(keuze.normenHandmatig ?? []);
  const uit = {} as NormStanden;
  for (const sleutel of NORM_SLEUTELS) {
    uit[sleutel] = handmatig.has(sleutel)
      ? keuze[sleutel] === true
        ? "aan"
        : "uit"
      : "model";
  }
  return uit;
}

/**
 * Eén norm op een andere stand zetten — inclusief de weg terug.
 *
 * Dit is de reparatie van de vastloper: de oude dialoog kon een sleutel alleen
 * AAN `normenHandmatig` toevoegen, nooit verwijderen, dus was één klik genoeg
 * om "volgt het model" voorgoed kwijt te zijn. `"model"` haalt de sleutel er
 * weer uit en zet de boolean op false, zodat er geen betekenisloze `true`
 * blijft rondslingeren in het projectbestand.
 *
 * Puur: de meegegeven keuze wordt niet gemuteerd. Er komen alleen normvelden
 * terug, zodat de aanroeper ze over zijn eigen, rijkere object kan spreiden.
 * `normenHandmatig` krijgt de vaste volgorde van `NORM_SLEUTELS`, zodat twee
 * gelijke keuzes ook gelijke JSON opleveren.
 */
export function zetNormStand(
  keuze: NormKeuze,
  sleutel: NormSleutel,
  stand: NormStand,
): { en1993: boolean; en1995: boolean; en1992: boolean; normenHandmatig: NormSleutel[] } {
  const handmatig = new Set(keuze.normenHandmatig ?? []);
  if (stand === "model") handmatig.delete(sleutel);
  else handmatig.add(sleutel);
  const nieuw = {
    en1993: keuze.en1993 === true,
    en1995: keuze.en1995 === true,
    en1992: keuze.en1992 === true,
    normenHandmatig: NORM_SLEUTELS.filter((k) => handmatig.has(k)),
  };
  nieuw[sleutel] = stand === "aan";
  return nieuw;
}

/**
 * Welke van de drie regels een norm wint, en dus WAAROM hij wel of niet in het
 * rapport staat. De dialoog toont dit naast de stand, want de stand alleen is
 * niet het hele verhaal: `"getoetst"` overrulet de keuze van de gebruiker, en
 * zonder die mededeling zou het scherm "niet vermelden" beweren terwijl het
 * rapport de norm wél noemt.
 *
 * `"model"` doet bewust geen uitspraak over de uitkomst: daarvoor is het model
 * nodig, en de uitgangspuntendialoog heeft de staven niet in handen. Ze zegt
 * daar dus wat de regel is, niet wat er vandaag uitkomt — een halve waarheid
 * is hier beter dan een hele die kan verouderen zodra er een staaf bij komt.
 */
export type NormOordeel = "getoetst" | "keuze-aan" | "keuze-uit" | "model";

export function normOordelen(
  keuze: NormKeuze,
  getoetst: NormVlaggen,
): Record<NormSleutel, NormOordeel> {
  const stand = normStanden(keuze);
  const uit = {} as Record<NormSleutel, NormOordeel>;
  for (const sleutel of NORM_SLEUTELS) {
    uit[sleutel] = getoetst[sleutel]
      ? "getoetst"
      : stand[sleutel] === "aan"
        ? "keuze-aan"
        : stand[sleutel] === "uit"
          ? "keuze-uit"
          : "model";
  }
  return uit;
}

/**
 * De normen die in de uitgangspunten van het rapport mogen staan — de drie
 * regels uit de kop van dit bestand, in die volgorde. Bewust via `normStanden`
 * en `normOordelen`, zodat het rapport en het scherm niet elk hun eigen lezing
 * van dezelfde twee velden kunnen ontwikkelen.
 */
export function normenVoorRapport(
  keuze: NormKeuze,
  inModel: NormVlaggen,
  getoetst: NormVlaggen,
): NormVlaggen {
  const oordeel = normOordelen(keuze, getoetst);
  const uit = leeg();
  for (const sleutel of NORM_SLEUTELS) {
    uit[sleutel] =
      oordeel[sleutel] === "getoetst" || oordeel[sleutel] === "keuze-aan"
        ? true
        : oordeel[sleutel] === "keuze-uit"
          ? false
          : inModel[sleutel];
  }
  return uit;
}
