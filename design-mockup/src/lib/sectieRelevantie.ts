/**
 * sectieRelevantie.ts — welke rapporthoofdstukken dit model werkelijk kan
 * vullen, en waarom de rest wegblijft.
 *
 * HET PROBLEEM
 * `REPORT_SECTIONS` kende tot nu toe maar één vraag: staat de sectie aan? Elke
 * aangezette sectie kwam in het rapport, ook als ze niets te melden had. Een
 * zuiver stalen raamwerk kreeg zo een hoofdstuk "Kruislaaghout", een hoofdstuk
 * "Beton", een hoofdstuk "Beton — fysisch niet-lineaire tweede orde", een
 * "Spanningstoets" en twee plaathoofdstukken, elk met één regel dat er niets
 * is. Dat zijn zes hoofdstukken ruis in een document dat een constructeur
 * ondertekent — mét eigen nummer in de inhoudsopgave.
 *
 * DE OPLOSSING, EN WAAROM HIJ HIER STAAT
 * Net als `combinatieSelectie.ts` is dit een ZUIVERE functie van het model naar
 * een oordeel, met per weggelaten hoofdstuk een REDEN. Hij verandert niets aan
 * de opgeslagen sectiekeuze (`reportStore.hiddenSections`) en wordt aangeroepen
 * op de plek waar het model bekend is: als afgeleide waarde in de rapportschil
 * en in de zijbalk. Daardoor:
 *
 *  - blijft de VOORINSTELLING van het rapporttype ongemoeid. "Volledig" zet nog
 *    steeds alles aan, "Beperkt" verbergt nog steeds dezelfde secties, en
 *    "aangepast" blijft betekenen dat de GEBRUIKER iets veranderd heeft — niet
 *    dat zijn model toevallig geen beton bevat.
 *  - komt een hoofdstuk METEEN TERUG zodra er één betonstaaf bij komt. Was het
 *    weglaten een mutatie van `hiddenSections` geweest, dan was het weg — en
 *    dan zou de betonparagraaf stilzwijgend ontbreken in het rapport van een
 *    model dat inmiddels beton bevat.
 *
 * DE VRAAG IS "KAN HET NOOIT", NIET "IS HET NU LEEG"
 * Alleen wat het MODEL principieel niet kan leveren valt weg. "Nog niet
 * berekend" en "nog niet getoetst" zijn rekenstanden, geen eigenschappen van
 * het model: die hoofdstukken blijven staan met hun eerlijke melding, precies
 * zoals de oplegreacties en de krachtsverdeling dat doen. Anders zou het
 * rapport bij elke druk op Berekenen van omvang veranderen, en dat is geen
 * document maar een knipperlicht.
 *
 * TWIJFELGEVALLEN HOUDEN HET HOOFDSTUK
 * Een staaf met een onbekend materiaal, of een toetsresultaat waar geen staaf
 * meer bij hoort: in beide gevallen blijft het hoofdstuk staan. Een overbodig
 * hoofdstuk kost een halve bladzijde; een ontbrekend hoofdstuk kost de
 * verantwoording van een toets die wél gedraaid is.
 */
import type { Beam, Plate } from "../components/fem/femTypes";
import type { MemberCheckResult } from "./checkTypes";
import { isConcreteCheckResult, isStressCheckResult } from "./checkTypes";
import { isCltCheckResult } from "./cltCheckBuilder";
import { materiaalVanStaaf, type StaafMateriaal } from "./variantInvoer";

/**
 * Alles waar een sectie haar toepasselijkheid uit mag afleiden.
 *
 * Bewust breder dan `ReportData`: of er kruislaaghout, beton of een vrij
 * materiaal in het spel is, blijkt uit de STAVEN (het model), maar de
 * toetsresultaten en het segmentspoor van de fysisch niet-lineaire berekening
 * wonen in eigen stores. Beide reizen al mee in het rapportsnapshot naar een
 * losgekoppeld venster, dus daar valt het oordeel identiek uit.
 */
export interface RapportGegevens {
  beams: Beam[];
  plates: Plate[];
  /** Toetsresultaten uit de checkStore; leeg = (nog) niets getoetst. */
  checkResults: MemberCheckResult[];
  /**
   * Aantal fysisch niet-lineair gerekende combinaties (betonStijfheidStore).
   * Alleen als vangnet: staat er een segmentspoor, dan is er beton geweest.
   */
  fysischeCombinaties: number;
}

/**
 * De aanduiding achter een niet-toepasselijke sectie in de zijbalk. Eén vaste
 * tekst voor alle secties, anders dan bij de combinaties: daar zei het label
 * "niet gebruikt" iets wat de naam ernaast niet al zei, hier is het verschil
 * tussen "geen beton in het model" en "geen platen in het model" precies wat de
 * sectienaam zelf al toont. De volledige uitleg staat in de tooltip.
 */
export const LABEL_NIET_VAN_TOEPASSING = "n.v.t.";

/**
 * Het oordeel over één sectie: de REDEN waarom ze wegblijft, of `null` wanneer
 * ze meedoet.
 *
 * De reden — en niet een kale `false` — omdat een hoofdstuk dat verdwijnt zonder
 * uitleg iemand laat zoeken naar een schakelaar die er wél was. Elke reden
 * noemt daarom drie dingen: wat er ontbreekt, waar de sectie over zou gaan, en
 * wat je moet toevoegen om haar terug te krijgen.
 */
export type SectieOordeel = string | null;

/** Zit er minstens één staaf van dit materiaal in het model? */
function heeftMateriaal(beams: Beam[], soort: StaafMateriaal): boolean {
  return beams.some((b) => materiaalVanStaaf(b) === soort);
}

// ═══════════════════════════════════════════════════════════════════════
// De regels per sectie
//
// Elke regel is een losse geëxporteerde functie in plaats van een tabel op
// sectie-id: zo staat ze onder haar eigen naam in de registry (reportSections)
// en is ze los te testen zonder de React-componenten aan te raken.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Kruislaaghout. Weg zodra er geen CLT-staaf in het model zit — behalve wanneer
 * er tóch een CLT-toetsresultaat ligt: dan is die uitwerking gedraaid en hoort
 * ze verantwoord te worden, ook al herkent `materiaalVanStaaf` de staaf niet
 * meer.
 */
export function nvtKruislaaghout(g: RapportGegevens): SectieOordeel {
  if (heeftMateriaal(g.beams, "clt")) return null;
  if (g.checkResults.some(isCltCheckResult)) return null;
  return (
    "Dit hoofdstuk beschrijft de opbouw en de toetsing per lamel van staven " +
    "van kruislaaghout, en er staat geen enkele CLT-staaf in dit model " +
    '(profielnaam "CLT …"). Het is daarom weggelaten uit het rapport en uit ' +
    "de inhoudsopgave. Voeg een CLT-staaf toe en het hoofdstuk komt terug."
  );
}

/**
 * Beton — doorsnede, M-κ en N-M. Weg zodra er geen betonstaaf in het model zit.
 * Let op: het beperkingenblok ("wat deze betontoetsing niet omvat") zit ín dit
 * hoofdstuk. Dat blok hoort in elk rapport MET beton, en juist daarom nergens
 * in een rapport zonder — een waarschuwing over iets dat er niet is, maakt de
 * waarschuwing minder geloofwaardig, niet meer.
 */
export function nvtBeton(g: RapportGegevens): SectieOordeel {
  if (heeftMateriaal(g.beams, "beton")) return null;
  if (g.checkResults.some(isConcreteCheckResult)) return null;
  return (
    "Dit hoofdstuk toont per betonstaaf de doorsnede met wapeningskorf, het " +
    "M-κ-diagram, het N-M-interactiediagram en het beperkingenblok, en er " +
    "staat geen enkele betonstaaf in dit model (materiaal een sterkteklasse " +
    'zoals "C30/37"). Het is daarom weggelaten uit het rapport en uit de ' +
    "inhoudsopgave. Voeg een betonstaaf toe en het hoofdstuk komt terug."
  );
}

/**
 * Beton — fysisch niet-lineaire tweede orde. Weg op dezelfde grond als het
 * betonhoofdstuk: geen beton, geen segmenttabellen.
 *
 * NIET weg wanneer er wél beton is maar er eerste-orde gerekend is. Dat is een
 * rekenstand en geen modeleigenschap, en de melding die het hoofdstuk dan toont
 * ('kies analysetype "2e orde + fysisch"') is precies de aanwijzing die een
 * gebruiker met beton in zijn model nodig heeft.
 */
export function nvtBetonStijfheid(g: RapportGegevens): SectieOordeel {
  if (g.fysischeCombinaties > 0) return null;
  return nvtBeton(g) === null
    ? null
    : "Dit hoofdstuk verantwoordt de segmentstijfheden van een fysisch " +
        "niet-lineaire tweede-orde-berekening van BETONSTAVEN, en er staat " +
        "geen enkele betonstaaf in dit model. Het is daarom weggelaten uit " +
        "het rapport en uit de inhoudsopgave. Voeg een betonstaaf toe en het " +
        "hoofdstuk komt terug — het vult zich zodra er met het analysetype " +
        '"2e orde + fysisch" gerekend is.';
}

/**
 * De vrije spanningstoets. Weg zodra er geen staaf met een vrij materiaal in
 * het model zit. Dit is geen normtoets maar de σ/τ/σ_eq-uitwerking voor
 * materialen die buiten EN 1992/1993/1995 vallen; zonder zo'n staaf gaat het
 * hoofdstuk over niets.
 */
export function nvtSpanningstoets(g: RapportGegevens): SectieOordeel {
  if (heeftMateriaal(g.beams, "vrij")) return null;
  if (g.checkResults.some(isStressCheckResult)) return null;
  return (
    "Dit hoofdstuk toont de doorsnede met het spanningsverloop van staven met " +
    'een VRIJ materiaal (materiaalnaam "VRIJ:…"), en er staat geen enkele ' +
    "zo'n staaf in dit model. Het is daarom weggelaten uit het rapport en uit " +
    "de inhoudsopgave. Geef een staaf een vrij materiaal met een toelaatbare " +
    "spanning en het hoofdstuk komt terug."
  );
}

/**
 * De plaatinvoertabel. Weg zonder platen: de tabel heeft dan geen enkele rij.
 * Platen zijn modelinvoer, dus dit oordeel hangt niet van een berekening af.
 */
export function nvtPlaten(g: RapportGegevens): SectieOordeel {
  if (g.plates.length > 0) return null;
  return (
    "Dit hoofdstuk is de invoertabel van de platen (wandschijven) — " +
    "dikte, materiaal, meshgrootte — en er staat geen enkele plaat in dit " +
    "model. Het is daarom weggelaten uit het rapport en uit de " +
    "inhoudsopgave. Teken een plaat en het hoofdstuk komt terug."
  );
}

/**
 * De plaatspanningen. Zelfde grond als de invoertabel: zonder platen zijn er
 * geen plaatelementen om spanningen van te tonen. Wél blijven staan wanneer er
 * platen zijn maar nog niet gerekend is — dan is "Nog niet berekend" de
 * eerlijke stand.
 */
export function nvtPlaatspanningen(g: RapportGegevens): SectieOordeel {
  if (g.plates.length > 0) return null;
  return (
    "Dit hoofdstuk toont de spanningen per plaatelement en de omhullende over " +
    "de combinaties, en er staat geen enkele plaat in dit model. Het is " +
    "daarom weggelaten uit het rapport en uit de inhoudsopgave. Teken een " +
    "plaat en het hoofdstuk komt terug."
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Het oordeel over een hele registry
// ═══════════════════════════════════════════════════════════════════════

/** Het minimum dat deze module van een sectiedefinitie hoeft te weten. */
export interface BeoordeelbareSectie {
  id: string;
  /** Ontbreekt de functie, dan is de sectie altijd van toepassing. */
  nietVanToepassing?: (g: RapportGegevens) => SectieOordeel;
}

/**
 * De redenen per sectie-id, alléén voor de secties die wegblijven. Een lege map
 * betekent dus: alles is van toepassing.
 *
 * Eén doorloop voor beide afnemers (de rapportschil filtert ermee, de zijbalk
 * dempt ermee), zodat er geen twee lijstjes kunnen ontstaan die uit elkaar
 * lopen.
 */
export function redenenPerSectie(
  secties: readonly BeoordeelbareSectie[],
  g: RapportGegevens,
): Map<string, string> {
  const uit = new Map<string, string>();
  for (const s of secties) {
    const reden = s.nietVanToepassing?.(g) ?? null;
    if (reden !== null) uit.set(s.id, reden);
  }
  return uit;
}
