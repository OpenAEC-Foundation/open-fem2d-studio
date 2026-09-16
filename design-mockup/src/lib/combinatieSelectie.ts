/**
 * combinatieSelectie.ts — welke belastingcombinaties dit model werkelijk nodig
 * heeft, en waarom de rest wegblijft.
 *
 * HET PROBLEEM
 * De standaardset (`normcombinaties.ts`) wordt afgeleid uit de belastinggevallen
 * en de gevolgklasse — niet uit het materiaal: er is op dat moment geen reden
 * om op staal of hout te beslissen. Twee soorten daarin — de frequente (6.15b)
 * en de quasi-blijvende (6.16b) BGT-combinatie — worden bij een zuivere
 * staalconstructie door geen enkele toets gelezen (zie `SOORTEN_BUITEN_STAAL`
 * in solver/combinations.ts). Ze kosten dan rekentijd en vullen de
 * combinatielijst, de resultatentabellen en het rapport met kolommen waar
 * niets mee gedaan wordt.
 *
 * 6.15 HEEFT SINDS SEPTEMBER 2026 EEN AFNEMER. Toen deze module werd
 * geschreven las geen enkele toets de frequente combinatie; ze bleef alleen
 * staan omdat een houten of betonnen staaf haar terug zou kunnen vragen.
 * Inmiddels vraagt zij haar werkelijk: §7.3 van EN 1992-1-1 toetst de
 * scheurwijdte van beton onder de FREQUENTE combinatie, want de nationale
 * bijlage bij 7.3.1(5) vervangt tabel 7.1N door een tabel waarvan alle
 * kolommen die combinatie noemen (de EN-tekst noemt daar de quasi-blijvende).
 * Weglaten bij een model MET beton zou dus geen overbodige kolom besparen maar
 * de scheurwijdtetoets kosten — en die zou dan met een reden als "niet
 * uitgevoerd" in het rapport komen. Dat is precies waarom de vraag hier "is
 * ALLES staal" is en niet "zit er hout in".
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
 * Alleen een ONGEWIJZIGDE standaardcombinatie wordt overgeslagen: ze draagt het
 * kenmerk `standaard`, en naam, type, formule én alle factoren zijn exact gelijk
 * aan wat de generator voor de gevallen en de gevolgklasse van dit model levert.
 * Heeft de gebruiker de combinatie hernoemd,
 * een factor bijgesteld of hem zelf toegevoegd, dan is het zijn combinatie en
 * blijft hij staan — ook in een zuivere staalconstructie. Dezelfde regel maakt
 * dat de windgenerator (die eigen combinaties met eigen namen schrijft) hier
 * nooit iets van merkt.
 *
 * ÉÉN OPSTELLING VAN 6.16b BLIJFT ALTIJD
 * De opstelling van uitdrukking 6.16b zonder veranderlijke gevallen is
 * "alleen de blijvende belasting". Sinds september 2026 leest de STAALtoetsing
 * haar: zij levert w₁, en zonder w₁ wordt de bijkomende doorbuiging w₂ + w₃
 * gelijk aan de volledige zakking (NEN-EN 1990:2002/NB:2019 A1.4.3(2), figuur
 * NB.1). Die ene opstelling wordt hier daarom nooit overgeslagen; de volledige
 * 6.16b en de frequente 6.15b nog wel.
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
  SOORTEN_BUITEN_STAAL,
  soortVanCombinatie,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import {
  genereerStandaardCombinaties,
  STANDAARD_BELASTINGGEVALLEN,
  STANDAARD_GEVOLGKLASSE,
  type GevalInvoer,
  type Gevolgklasse,
  type StandaardCombinatie,
} from "../components/fem/solver/normcombinaties";
import { materiaalVanStaaf } from "./variantInvoer";
import { bepaalPlaatStijfheid } from "./plaatMateriaal";
import { blijvendeBgtCombinaties } from "./blijvendeZakking";

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
  const frequent = soortVanCombinatie(combo) === "6.15b";
  const uitdrukking = frequent ? "6.15b" : "6.16b";
  const gebruiker =
    frequent
      ? "de scheurbeheersing van beton (EN 1992-1-1 §7.3; de nationale bijlage bij 7.3.1(5) schrijft juist deze combinatie voor)"
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
 * een ander materiaal dan staal is geen stalen plaat. Hij houdt de
 * combinaties dus aan — de goedkope kant van de vergissing.
 *
 * Sinds een plaat een MATERIAALNAAM kan dragen (stap 3) kan dat oordeel niet
 * meer op de E-modulus alleen rusten: een houten plaat laat het E-veld leeg
 * en zou met `p.E ?? PLATE_DEFAULTS.E` als staal gelezen worden, waarna de
 * hout- en betoncombinaties stil zouden wegvallen. Draagt de plaat een
 * materiaal, dan telt de SOORT; draagt ze er geen, dan blijft de oude regel
 * gelden (E gelijk aan die van staal).
 */
export function isZuivereStaalconstructie(
  beams: Beam[],
  plates: Plate[] = [],
): boolean {
  if (beams.length === 0) return false;
  if (!beams.every((b) => materiaalVanStaaf(b) === "staal")) return false;
  return plates.every((p) => {
    if ((p.materiaal ?? "").trim() !== "") {
      const uit = bepaalPlaatStijfheid(p);
      // Een materiaal dat niet herkend wordt is geen bewijs van staal.
      return uit.ok && uit.stijfheid.soort === "staal" && uit.stijfheid.bronE === "materiaal";
    }
    return (p.E ?? PLATE_DEFAULTS.E) === PLATE_DEFAULTS.E;
  });
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
 * Het id telt NIET: dat deelt de store uit en zegt niets over de inhoud.
 */
function isOngewijzigd(combo: LoadCombination, standaard: StandaardCombinatie): boolean {
  return (
    combo.name === standaard.name &&
    combo.type === standaard.type &&
    combo.formula === standaard.formula &&
    zelfdeFactoren(combo.factors, standaard.factors)
  );
}

/** Waartegen een combinatie als "ongewijzigde standaard" wordt vergeleken. */
export interface SelectieOpties {
  /**
   * De belastinggevallen van het model. Ontbreekt dit, dan wordt vergeleken
   * met de standaardset van een NIEUW model (G = 1, Q = 2, S = 3, W = 4) —
   * dezelfde aanname als vóór september 2026. De store en de sidecar geven de
   * echte gevallen mee.
   */
  loadCases?: readonly GevalInvoer[];
  /** De gevolgklasse van het project; ontbreekt → CC2. */
  gevolgklasse?: Gevolgklasse;
}

/**
 * Splitst de combinatielijst in wat er doorgerekend wordt en wat er met reden
 * wegblijft. De invoerlijst wordt niet aangeraakt.
 */
export function selecteerCombinaties(
  combinations: LoadCombination[],
  beams: Beam[],
  plates: Plate[] = [],
  opties: SelectieOpties = {},
): CombinatieSelectie {
  const redenPerId = new Map<number, string>();
  if (!isZuivereStaalconstructie(beams, plates)) {
    return { actief: combinations, overgeslagen: [], redenPerId };
  }

  const gevallen = opties.loadCases ?? STANDAARD_BELASTINGGEVALLEN;
  const standaardSet = genereerStandaardCombinaties(
    gevallen,
    opties.gevolgklasse ?? STANDAARD_GEVOLGKLASSE,
  );

  // DE BLIJVENDE BGT-COMBINATIE BLIJFT ALTIJD STAAN, ook in een zuivere
  // staalconstructie. Zij is een opstelling van uitdrukking 6.16b — die zonder
  // veranderlijke gevallen — en viel dus onder `SOORTEN_BUITEN_STAAL`. Sinds
  // september 2026 heeft juist die opstelling een afnemer in de STAALtoetsing:
  // zij levert w₁, de zakking onder alleen de blijvende belasting, die
  // NEN-EN 1990:2002/NB:2019 A1.4.3(2) van w_tot aftrekt om w₂ + w₃ te krijgen
  // (figuur NB.1). Zou zij hier wegvallen, dan kreeg de w_add-toets de volle
  // zakking terug — de fout die in september 2026 juist is gerepareerd. De
  // volledige 6.16b (mét ψ₂·Q) en de frequente 6.15b blijven wél weg.
  const blijvendeSleutels = new Set(
    blijvendeBgtCombinaties(
      standaardSet.map((c, i) => ({ ...c, id: i + 1 })),
      gevallen,
    ).map((c) => c.standaard?.sleutel),
  );

  // De kandidaten uit de standaardset, per sleutel opzoekbaar. Alleen
  // combinaties met dat kenmerk die er exact op passen komen in aanmerking.
  const kandidaten = new Map(
    standaardSet
      .filter((c) => SOORTEN_BUITEN_STAAL.includes(c.standaard.soort))
      .filter((c) => !blijvendeSleutels.has(c.standaard.sleutel))
      .map((c) => [c.standaard.sleutel, c] as const),
  );

  const actief: LoadCombination[] = [];
  const overgeslagen: OvergeslagenCombinatie[] = [];
  for (const combo of combinations) {
    const standaard = combo.standaard ? kandidaten.get(combo.standaard.sleutel) : undefined;
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
