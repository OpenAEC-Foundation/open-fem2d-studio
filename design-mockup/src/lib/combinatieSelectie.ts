/**
 * combinatieSelectie.ts — welke belastingcombinaties dit model werkelijk nodig
 * heeft, en waarom de rest wegblijft.
 *
 * HET PROBLEEM
 * `defaultCombinations()` levert acht combinaties, want die lijst wordt gemaakt
 * vóórdat er een model is: bij het starten van de store en bij het laden van
 * een bestand zonder combinaties. Op dat moment is er geen materiaal om op te
 * beslissen. Twee van die acht — de frequente (6.15) en de quasi-blijvende
 * (6.16) BGT-combinatie — worden bij een zuivere staalconstructie door geen
 * enkele toets gelezen (zie `STANDAARD_SLS_BUITEN_STAAL` in
 * solver/combinations.ts). Ze kosten dan rekentijd en vullen de
 * combinatielijst, de resultatentabellen en het rapport met kolommen waar
 * niets mee gedaan wordt.
 *
 * DE OPLOSSING, EN WAAROM HIJ HIER STAAT
 * Deze module is een ZUIVERE functie van (combinaties, staven, platen) naar
 * een selectie. Hij verandert de opgeslagen lijst niet en wordt aangeroepen op
 * de plek waar het model wél bekend is: als afgeleide waarde in `useFemStore`
 * en in de sidecar vlak vóór het combineren. Daardoor:
 *
 *  - draagt het PROJECTBESTAND altijd de volledige lijst. Opslaan en opnieuw
 *    openen verandert niets aan de beslissing; die wordt elke render opnieuw
 *    genomen uit het model dat er dan ligt.
 *  - komt een combinatie METEEN TERUG zodra er één houten of betonnen staaf
 *    bij komt. Was het weglaten een mutatie geweest, dan was hij weg — en dan
 *    zou de kruipvervorming van die houten staaf stilzwijgend op de terugval
 *    landen.
 *
 * WAT MET RUST WORDT GELATEN
 * Alleen een ONGEWIJZIGDE standaardcombinatie wordt overgeslagen: id, naam,
 * type, formule én alle factoren moeten exact gelijk zijn aan wat
 * `defaultCombinations()` levert. Heeft de gebruiker de combinatie hernoemd,
 * een factor bijgesteld of hem zelf toegevoegd, dan is het zijn combinatie en
 * blijft hij staan — ook in een zuivere staalconstructie. Dezelfde regel maakt
 * dat de windgenerator (die eigen combinaties met eigen namen schrijft) hier
 * nooit iets van merkt.
 *
 * ALLES WAT NIET AANTOONBAAR STAAL IS, HOUDT ZE
 * De vraag is niet "zit er hout in" maar "is ALLES staal". Een model zonder
 * staven, een staaf met een onbekend materiaal, een vrij materiaal voor de
 * spanningstoets of een plaat met een andere E-modulus dan staal: in al die
 * gevallen blijven de combinaties staan. Een overbodige combinatie kost
 * rekentijd; een ontbrekende kost een toets.
 */
import type { Beam, Plate } from "../components/fem/femTypes";
import { PLATE_DEFAULTS } from "../components/fem/femTypes";
import {
  defaultCombinations,
  STANDAARD_SLS_BUITEN_STAAL,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import { materiaalVanStaaf } from "./variantInvoer";

/** Eén combinatie die niet is doorgerekend, met de reden erbij. */
export interface OvergeslagenCombinatie {
  id: number;
  naam: string;
  /** Korte aanduiding, voor achter een regel in een lijst. */
  label: string;
  /** De volledige uitleg — tooltip, rapportnoot, sidecar-waarschuwing. */
  reden: string;
}

export interface CombinatieSelectie {
  /** De combinaties die worden doorgerekend en getoetst. */
  actief: LoadCombination[];
  /** De weggelaten combinaties, met reden. Leeg = er is niets weggelaten. */
  overgeslagen: OvergeslagenCombinatie[];
  /** Reden per combinatie-id, voor een lijst die alle combinaties toont. */
  redenPerId: Map<number, string>;
}

/**
 * De korte aanduiding achter een overgeslagen combinatie in een lijst. Kort
 * omdat hij in de smalle projectboom naast de naam moet passen; de volledige
 * uitleg staat in `reden` (tooltip, combinatie-editor en rapport).
 */
export const LABEL_ZUIVER_STAAL = "niet gebruikt";

/**
 * De uitleg bij een overgeslagen combinatie. Noemt de norm-uitdrukking, wat
 * de combinatie normaal voedt, en wat de gebruiker moet doen om hem terug te
 * krijgen — zodat zes combinaties waar er acht verwacht werden nooit een
 * raadsel zijn.
 */
export function redenZuiverStaal(combo: LoadCombination): string {
  const uitdrukking = combo.id === 7 ? "6.15" : "6.16";
  const gebruiker =
    combo.id === 7
      ? "geen enkele toets in deze app"
      : "de kruipvervorming van hout en de BGT-tak van beton";
  return (
    `"${combo.name}" (NEN-EN 1990 uitdrukking ${uitdrukking}) is niet ` +
    `doorgerekend: elke staaf in dit model is staal. De doorbuigingstoets van ` +
    `staal gebruikt de karakteristieke BGT-combinatie (6.14); deze combinatie ` +
    `voedt ${gebruiker}. Voeg een houten of betonnen staaf toe — of wijzig de ` +
    `combinatie zelf — en hij wordt weer meegenomen.`
  );
}

/**
 * Is dit een zuivere staalconstructie?
 *
 * Staven: `materiaalVanStaaf` is dezelfde classificatie die de toetsing
 * gebruikt (inclusief de volgorde waarin vrij materiaal en CLT eruit worden
 * gehaald), zodat hier nooit een ander materiaal wordt gezien dan bij het
 * toetsen. Een model zonder staven levert `false`: er is dan niets om uit af
 * te leiden, en dat is geen bewijs van staal.
 *
 * Platen: die worden door geen enkele EN-toets aangeraakt, maar een plaat met
 * een andere E-modulus dan staal is geen stalen plaat. Hij houdt de
 * combinaties dus aan — de goedkope kant van de vergissing.
 */
export function isZuivereStaalconstructie(
  beams: Beam[],
  plates: Plate[] = [],
): boolean {
  if (beams.length === 0) return false;
  if (!beams.every((b) => materiaalVanStaaf(b) === "staal")) return false;
  return plates.every((p) => (p.E ?? PLATE_DEFAULTS.E) === PLATE_DEFAULTS.E);
}

/** Factorenkaarten zijn gelijk als ze dezelfde gevallen met dezelfde factor dragen. */
function zelfdeFactoren(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [caseId, factor] of a) {
    if (b.get(caseId) !== factor) return false;
  }
  return true;
}

/**
 * Is `combo` letterlijk de standaardcombinatie `standaard`, ongewijzigd?
 * Alles telt mee: naam en formule zijn wat de gebruiker ziet, de factoren zijn
 * wat er gerekend wordt. Eén verschil en het is zijn combinatie geworden.
 */
function isOngewijzigd(combo: LoadCombination, standaard: LoadCombination): boolean {
  return (
    combo.id === standaard.id &&
    combo.name === standaard.name &&
    combo.type === standaard.type &&
    combo.formula === standaard.formula &&
    zelfdeFactoren(combo.factors, standaard.factors)
  );
}

/**
 * Splitst de combinatielijst in wat er doorgerekend wordt en wat er met reden
 * wegblijft. De invoerlijst wordt niet aangeraakt.
 */
export function selecteerCombinaties(
  combinations: LoadCombination[],
  beams: Beam[],
  plates: Plate[] = [],
): CombinatieSelectie {
  const redenPerId = new Map<number, string>();
  if (!isZuivereStaalconstructie(beams, plates)) {
    return { actief: combinations, overgeslagen: [], redenPerId };
  }

  // De kandidaten uit de standaardset, per id opzoekbaar. Alleen combinaties
  // die hier exact op passen komen in aanmerking.
  const kandidaten = new Map(
    defaultCombinations()
      .filter((c) => STANDAARD_SLS_BUITEN_STAAL.includes(c.id))
      .map((c) => [c.id, c] as const),
  );

  const actief: LoadCombination[] = [];
  const overgeslagen: OvergeslagenCombinatie[] = [];
  for (const combo of combinations) {
    const standaard = kandidaten.get(combo.id);
    if (standaard && isOngewijzigd(combo, standaard)) {
      const reden = redenZuiverStaal(combo);
      overgeslagen.push({
        id: combo.id,
        naam: combo.name,
        label: LABEL_ZUIVER_STAAL,
        reden,
      });
      redenPerId.set(combo.id, reden);
    } else {
      actief.push(combo);
    }
  }
  return { actief, overgeslagen, redenPerId };
}
