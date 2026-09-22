/**
 * HET BELASTINGGEVAL VAN HET EIGEN GEWICHT — één regel, één plek (issue #42).
 *
 * Tot september 2026 was het eigen gewicht een vinkje dat zijn lasten
 * onzichtbaar in "het eerste blijvende geval" zette, tussen de handmatig
 * ingevoerde lasten. Nu kan een belastinggeval het kenmerk `eigenGewicht: true`
 * dragen: dát geval krijgt de automatisch gegenereerde lasten, en alleen die.
 *
 * DE REGEL (`eigenGewichtDoel`):
 *   1. draagt een geval het kenmerk en is het van type "dead" → dat geval;
 *   2. draagt een geval het kenmerk maar is het NIET van type "dead" → geen
 *      eigen gewicht, met een foutmelding. Er wordt niet stil teruggevallen op
 *      regel 3: een blijvende last met de factoren van een ander type is geen
 *      veilige terugval, en "toch maar het eerste blijvende geval" zou de
 *      uitdrukkelijke keuze van het bestand negeren;
 *   3. draagt geen enkel geval het kenmerk → de OUDE regel: het eerste geval
 *      van type "dead". Zo rekent elk projectbestand van vóór het kenmerk
 *      bit-identiek aan voorheen — er wordt niets stil omgezet;
 *   4. is er geen geval van type "dead" → geen eigen gewicht, met een
 *      foutmelding (ongewijzigd, zie `meldingenBelastinggevallen`).
 *
 * De schakelaar blijft `selfWeightEnabled`; deze regel zegt alleen WAAR het
 * eigen gewicht landt als hij aan staat. De rekengang (`bouwMultiInput`), de
 * meldingen, het tekenvlak, de tabel en het rapport lezen allemaal deze
 * functie — geen tweede afleiding.
 *
 * Dit bestand importeert bewust alleen TYPEN: `modelNaarSolverInput` leest de
 * regel hier, en het overzicht voor de weergave (lib/eigenGewichtOverzicht)
 * leest op zijn beurt `eigenGewichtLasten` dáár. Zo is er geen kringverwijzing.
 */
import type { LoadCase } from "../components/fem/femTypes";

/** Het deel van een belastinggeval dat de regel leest. */
export type EigenGewichtGevalInvoer = Pick<LoadCase, "id" | "type"> &
  Partial<Pick<LoadCase, "name" | "eigenGewicht">>;

export type EigenGewichtDoel<G extends EigenGewichtGevalInvoer = EigenGewichtGevalInvoer> =
  /** Regel 1: het gekenmerkte blijvende geval. */
  | { soort: "kenmerk"; geval: G }
  /** Regel 3: geen kenmerk in het model, dus het eerste blijvende geval. */
  | { soort: "eersteBlijvend"; geval: G }
  /** Regel 2: kenmerk op een geval dat niet blijvend is — NIET toegepast. */
  | { soort: "kenmerkNietBlijvend"; geval: G }
  /** Regel 4: geen blijvend geval — NIET toegepast. */
  | { soort: "geen" };

/** Draagt dit geval het kenmerk van het automatische eigen gewicht? */
export function isEigenGewichtGeval(c: { eigenGewicht?: unknown } | undefined | null): boolean {
  return c?.eigenGewicht === true;
}

/** Waar landt het eigen gewicht als de schakelaar aan staat? Zie de kop. */
export function eigenGewichtDoel<G extends EigenGewichtGevalInvoer>(
  loadCases: readonly G[],
): EigenGewichtDoel<G> {
  const gekenmerkt = loadCases.find(isEigenGewichtGeval);
  if (gekenmerkt) {
    return gekenmerkt.type === "dead"
      ? { soort: "kenmerk", geval: gekenmerkt }
      : { soort: "kenmerkNietBlijvend", geval: gekenmerkt };
  }
  const eersteBlijvend = loadCases.find((c) => c.type === "dead");
  return eersteBlijvend ? { soort: "eersteBlijvend", geval: eersteBlijvend } : { soort: "geen" };
}

/**
 * Het geval dat het eigen gewicht WERKELIJK krijgt, of `undefined` als de
 * schakelaar uit staat of de regel geen geval oplevert. Dit is wat de
 * rekengang gebruikt.
 */
export function eigenGewichtGeval<G extends EigenGewichtGevalInvoer>(
  loadCases: readonly G[],
  selfWeightEnabled: boolean | undefined,
): G | undefined {
  if (selfWeightEnabled !== true) return undefined;
  const doel = eigenGewichtDoel(loadCases);
  return doel.soort === "kenmerk" || doel.soort === "eersteBlijvend" ? doel.geval : undefined;
}

/**
 * Mag de gebruiker (of een client) een last in dit geval zetten? Niet in het
 * gekenmerkte geval: de inhoud daarvan volgt uit het model. Een last die er
 * toch in stond zou onzichtbaar bij het eigen gewicht optellen — precies de
 * vermenging die het eigen geval moet opheffen.
 */
export function gevalNeemtHandmatigeLasten(
  loadCases: readonly EigenGewichtGevalInvoer[],
  caseId: number,
): boolean {
  return !isEigenGewichtGeval(loadCases.find((c) => c.id === caseId));
}

// ── Het standaardgeval van een nieuw project ──────────────────────────────

/**
 * Naam van het standaardgeval. Net als "Permanent (G)" een gegeven dat in het
 * projectbestand staat en dat de gebruiker kan hernoemen — het kenmerk, niet
 * de naam, bepaalt de werking.
 */
export const EIGEN_GEWICHT_NAAM = "Eigen gewicht";

/**
 * Id van het standaardgeval in een nieuw project. NIET 1: de vier bestaande
 * standaardgevallen houden hun id (Permanent = 1, Variabel = 2, Sneeuw = 3,
 * Wind = 4), zodat de lasten van het startmodel, elk voorbeeld in de
 * documentatie en elke client die "caseId 1 = permanent" aanneemt blijven
 * kloppen. Het geval staat wel VOORAAN in de lijst; de volgorde van de lijst
 * bepaalt de tabs, niet het id.
 */
export const EIGEN_GEWICHT_STANDAARD_ID = 5;

/** De vier handmatige gevallen van een nieuw project — ongewijzigd. */
export const HANDMATIGE_STANDAARDGEVALLEN: readonly LoadCase[] = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)",  type: "live" },
  { id: 3, name: "Sneeuw (S)",    type: "snow" },
  { id: 4, name: "Wind (W)",      type: "wind" },
];

/**
 * De belastinggevallen van een NIEUW project en van het startmodel: het geval
 * "Eigen gewicht" voorop, dan de vier handmatige. Een verse lijst per aanroep,
 * zodat geen twee projecten dezelfde objecten delen.
 */
export function standaardBelastinggevallen(): LoadCase[] {
  return [
    { id: EIGEN_GEWICHT_STANDAARD_ID, name: EIGEN_GEWICHT_NAAM, type: "dead", eigenGewicht: true },
    ...HANDMATIGE_STANDAARDGEVALLEN.map((c) => ({ ...c })),
  ];
}

/** Staat het eigen gewicht in een nieuw project aan? Ja (issue #42, punt 1). */
export const EIGEN_GEWICHT_STANDAARD_AAN = true;

/**
 * Het geval dat in een nieuw project actief is: het eerste HANDMATIGE geval.
 * In het geval "Eigen gewicht" valt niets in te voeren, dus wie een nieuw
 * project opent en een last tekent moet niet eerst van tab hoeven wisselen.
 */
export const STANDAARD_ACTIEF_GEVAL_ID = 1;

// ── Wat een wijziging aan de gevallen met het eigen gewicht doet ──────────

export type EigenGewichtUitReden = "verwijderd" | "typeGewijzigd";

/**
 * Verdwijnt door een wijziging aan de gevallen het gekenmerkte blijvende
 * geval — verwijderd, of van type gewijzigd — dan gaat het eigen gewicht UIT,
 * en de aanroeper meldt dat (issue #42, punt 6). Zonder deze stap zou het
 * eigen gewicht stil naar "het eerste blijvende geval" verhuizen, tussen de
 * handmatige lasten: terug bij af, zonder dat iemand het zag.
 *
 * Geeft `null` als er niets verandert voor het eigen gewicht: de schakelaar
 * stond al uit, er wás geen gekenmerkt geval, of het staat er nog.
 */
export function eigenGewichtNaGevalWijziging(p: {
  voor: readonly EigenGewichtGevalInvoer[];
  na: readonly EigenGewichtGevalInvoer[];
  selfWeightEnabled: boolean;
}): { uitzetten: true; reden: EigenGewichtUitReden; geval: EigenGewichtGevalInvoer } | null {
  if (!p.selfWeightEnabled) return null;
  const voor = eigenGewichtDoel(p.voor);
  if (voor.soort !== "kenmerk") return null;
  if (eigenGewichtDoel(p.na).soort === "kenmerk") return null;
  const staatErNog = p.na.some((c) => c.id === voor.geval.id);
  return { uitzetten: true, reden: staatErNog ? "typeGewijzigd" : "verwijderd", geval: voor.geval };
}

/**
 * Hoort dit project het aanbod te krijgen om het eigen gewicht naar een eigen
 * geval te verplaatsen? Alleen als het eigen gewicht AAN staat en volgens de
 * oude regel in het eerste blijvende geval landt. De app zet niets stil om
 * (issue #42, punt 5): dit is een aanbod, de gebruiker beslist.
 */
export function eigenGewichtAanbodVanToepassing(p: {
  loadCases: readonly EigenGewichtGevalInvoer[];
  selfWeightEnabled: boolean | undefined;
}): boolean {
  return p.selfWeightEnabled === true && eigenGewichtDoel(p.loadCases).soort === "eersteBlijvend";
}
