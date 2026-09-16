/**
 * projectFile.ts — serialize / deserialize the FEM model to a JSON file
 * (.ifcfem2d extension) + native dialog + IO via Tauri plugins, with a browser
 * fallback (Blob download / file-input) when running in a plain web context.
 */
import type {
  Node, Beam, Support, Plate, Load, LoadCase, StructuralGrid,
} from "../components/fem/femTypes";
import { analysetypeUitBestand } from "../components/fem/femTypes";
import type { LoadCombination } from "../components/fem/solver/combinations";
import {
  GEVOLGKLASSEN, type CombinatieSoort, type Gevolgklasse,
} from "../components/fem/solver/normcombinaties";
import type { EigenDoorsnede } from "../lib/profieleditor/types";
import type { KruipInvoerProject } from "../lib/kruipcoefficient";
import type { EigenCltOpbouw } from "../lib/profieleditor/cltOpbouwenStore";

export const PROJECT_FILE_EXT = "ifcfem2d";
/**
 * Versiegeschiedenis:
 *  1 — model + loadCases + solver-toggles.
 *  2 — + belastingcombinaties (`combinations`, factors als object omdat een
 *      Map niet JSON-serialiseerbaar is) en stramien (`structuralGrid`).
 *      `Beam.checkConfig` reist automatisch mee met de beams-array.
 *      Later binnen v2 toegevoegd (optioneel, dus geen versie-bump):
 *      scheefstand-instellingen (`scheefstandEnabled`, `scheefstandNoemer`,
 *      `scheefstandRichting`) — ontbreken ze, dan laadt het bestand met
 *      scheefstand uit (noemer 200, richting +x).
 *      Daarna, óók optioneel: de normberekening van φ (`scheefstandBron`,
 *      `scheefstandHoogteM`, `scheefstandAantalElementen`). Ontbreekt
 *      `scheefstandBron`, dan geldt "vast" en rekent het bestand met de
 *      noemer hierboven — dus precies zoals het altijd deed. Een oudere
 *      versie van de app die deze drie velden niet kent leest hetzelfde
 *      bestand ook zo; de noemer blijft daarom altijd meegeschreven.
 *      Eveneens optioneel binnen v2: plaat-rekenvelden op `Plate`
 *      (`thickness`, `E`, `nu`, `rho`, `meshSize`) — reizen automatisch mee
 *      met de plates-array (zoals `Beam.checkConfig`); ontbreken ze, dan
 *      vult het laden de PLATE_DEFAULTS aan (20 mm / 210000 N/mm² / 0,3 /
 *      7850 kg/m³ / 500 mm — zie femTypes.withPlateDefaults).
 *      Polygonplaten (P4.2, optioneel — geen versie-bump): `Plate.nodeIds`
 *      mag n ≥ 3 hoeken bevatten en `Plate.meshCache` draagt dan het
 *      gecachete CDT-rekenmesh (platte data + geometrie-signatuur, zie
 *      femTypes.PlaatMeshCache); randlasten op polygonranden gebruiken
 *      `Load.edgeIndex` i.p.v. de benoemde `Load.edge`. Beide velden reizen
 *      automatisch mee met de bestaande arrays; oude bestanden zonder deze
 *      velden laden ongewijzigd, en een bestand met verouderde cache wordt
 *      bij het openen door het canvas geregenereerd (signatuurcontrole).
 *      Stap 2 van het platenspoor (september 2026, optioneel — geen
 *      versie-bump): `Plate.meshType` ("driehoeken" | "vierhoeken"; ontbreekt
 *      = de standaard voor de vorm, dus dezelfde getallen als voorheen),
 *      `Plate.openingen` (polygonen in mm binnen de omtrek) en in de
 *      meshcache `quads`, `meshSoort` en `openingEdgeNodeIndices`. De
 *      handtekening van een cache zonder openingen en zonder keuze is
 *      ongewijzigd, zodat bestaande caches geldig blijven.
 *      Vervolg op stap 2 (september 2026, optioneel — geen versie-bump):
 *      `Load.openingId` — een randlast of een puntlast op een plaatrand mag op
 *      de rand van een OPENING staan in plaats van op de omtrek. Het veld
 *      draagt het id van die `PlaatOpening`; `Load.edgeIndex` telt dan langs de
 *      hoeken van die opening en `startFrac`/`endFrac`/`posFrac` vanaf
 *      openingshoek j. Reist automatisch mee met de loads-array, precies zoals
 *      `Load.edgeIndex`. ONTBREEKT het veld — elk bestaand bestand — dan staat
 *      de last op de omtrek en verandert er geen enkel getal. Een oudere versie
 *      van de app die het veld niet kent, zou de last op de OMTREK leggen; dat
 *      is de reden dat het bestandsformaat verder ongewijzigd blijft maar de
 *      huidige app zo'n adres nooit stil verschuift: hier weigert elke route
 *      (engine, modelcontrole, MCP-poort) een opening die niet bestaat.
 *      Stap 3 van het platenspoor (september 2026, optioneel — geen
 *      versie-bump): `Plate.materiaal` (dezelfde grammatica als
 *      `Beam.material`: staalsoort, betonklasse, houtsterkteklasse,
 *      "CLT <klasse> <opbouw>" of "VRIJ:…") en `Plate.hoofdrichting` (hoek in
 *      graden voor een richtingsafhankelijk materiaal). Ontbreken ze — elk
 *      bestaand bestand — dan rekent de plaat isotroop met haar losse E, ν en
 *      ρ, precies zoals voorheen. Staat er WEL een materiaal, dan komen E, ν
 *      en ρ daaruit en vult het laden ze niet meer met de staaldefaults aan
 *      (zie femTypes.withPlateDefaults); een los ingevuld veld blijft de
 *      expliciete overschrijving. Een oudere versie van de app negeert het
 *      materiaalveld en leest de plaat dan met haar eigen E/ν/ρ of, als die
 *      ontbreken, met de staaldefaults — dat verschil is zichtbaar in het
 *      rapport (materiaal en E-bron staan erin) en niet stil.
 *      Issue #14 (september 2026, optioneel — geen versie-bump):
 *      `Plate.cltG12` met `Plate.cltG12Bron`, of `Plate.cltG12Bovengrens`, de
 *      G₁₂-keuze van een kruislaaghouten plaat. Ontbreken ze bij elke andere
 *      plaat, dan verandert er niets. Een kruislaaghouten plaat uit een ouder
 *      bestand draagt geen van beide en wordt bij het rekenen GEWEIGERD met
 *      de reden en de twee uitwegen — er wordt geen G₁₂ aangenomen.
 *      Bewust geen automatische aanvulling bij het laden: dat zou de
 *      niet-gereduceerde bovengrens stil tot keuze van de gebruiker maken.
 *      Issue #15 (september 2026, optioneel — geen versie-bump):
 *      `Plate.klimaatklasse` (1/2/3) van een houten plaat voor de plaattoets.
 *      Ontbreekt hij, dan toetst de app met klimaatklasse 1 en zegt dat;
 *      stijfheid en spanningen veranderen niet.
 *      Eveneens optioneel binnen v2: `analysetype` (drie standen) en
 *      `betonSegmentLengteMm`. `nonlinearEnabled` BLIJFT geschreven worden en
 *      blijft leidend zolang `analysetype` ontbreekt — zie
 *      `analysetypeUitBestand` in femTypes. Een bestand van vóór het
 *      analysetype laadt daardoor onveranderd (true → 2e orde P-Δ, false →
 *      1e orde), en een nieuw bestand blijft leesbaar in een oudere versie
 *      van de app, want die leest alleen de booleaan.
 *      Eveneens optioneel binnen v2 (geen versie-bump): `Load.omschrijving` —
 *      de vrije naam die de gebruiker aan een last geeft ("sneeuw op
 *      overstek"). Reist automatisch mee met de loads-array, precies zoals
 *      `Load.edgeIndex` en `Beam.checkConfig`. Een bestand zónder het veld
 *      laadt ongewijzigd (de omschrijving is dan simpelweg leeg) en een
 *      oudere versie van de app negeert het veld bij het lezen, want die
 *      leest de lasten ook als geheel. Het veld is documentatie: er verschuift
 *      geen enkel rekengetal door.
 *      Eveneens optioneel binnen v2 (geen versie-bump): `eigenCltOpbouwen` —
 *      de namen die de gebruiker aan zijn CLT-vloeropbouwen gaf. Puur
 *      bijschrift: de opbouw zelf staat in de profielnaam van de staaf, dus
 *      een bestand zonder dit veld rekent identiek door.
 *      Eveneens optioneel binnen v2 (september 2026, geen versie-bump):
 *      `combinations[].standaard` — het kenmerk van een standaardcombinatie
 *      (sleutel, soort, gevolgklasse) — en `idTellers` voor belastinggevallen
 *      en combinaties. Een oudere versie van de app negeert beide velden; de
 *      factoren zelf staan er gewoon in.
 *      Bij het OPENEN — in de app en via de MCP-weg — vervangt
 *      `openCombinatieStaat` (lib/combinatieBeheer) de standaardcombinaties van
 *      versie 0.3.11 en ouder door de huidige standaardset, herkend op naam en
 *      factorpatroon en NIET op het ontbreken van tellers, met een melding en
 *      ongedaan maken. Eigen combinaties blijven staan en worden gecontroleerd.
 *      Eveneens optioneel (september 2026, geen versie-bump):
 *      `combinatiesVervangenBijOpenen` — de tekst van die melding, zodat het
 *      rapport ook in een latere sessie vermeldt dat de combinaties bij het
 *      openen zijn vervangen. Puur bijschrift: er rekent niets mee.
 *      Eveneens optioneel binnen v2 (september 2026, geen versie-bump):
 *      `Beam.profileEnd` — het eindprofiel van een verlopende staaf; `profile`
 *      is dan het beginprofiel. Reist automatisch mee met de beams-array.
 *      Ontbreekt het veld, dan is de staaf prismatisch en rekent het bestand
 *      exact zoals voorheen; een oudere versie van de app negeert het veld en
 *      rekent de staaf prismatisch met het beginprofiel (zie femTypes.Beam).
 * v1-bestanden blijven leesbaar: de v2-velden zijn optioneel en ontbrekende
 * velden krijgen bij het laden de bestaande defaults (defaultCombinations()
 * en DEFAULT_STRUCTURAL_GRID in useFemStore.loadProjectState).
 */
export const PROJECT_FORMAT_VERSION = 2;

/** JSON-vorm van één belastingcombinatie: `factors` als { caseId: factor }. */
export interface ProjectFileCombination {
  id: number;
  name: string;
  type: "uls" | "sls";
  formula: string;
  factors: Record<string, number>;
  /** Kenmerk van een standaardcombinatie; ontbreekt bij een eigen combinatie. */
  standaard?: { sleutel: string; soort: string; gevolgklasse: string };
}

const SOORTEN: readonly CombinatieSoort[] = ["6.10a", "6.10b", "6.14b", "6.15b", "6.16b"];

/** LoadCombination[] (Map-factoren) → JSON-serialiseerbare vorm. */
export function combinationsToFile(combos: LoadCombination[]): ProjectFileCombination[] {
  return combos.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    formula: c.formula,
    factors: Object.fromEntries([...c.factors].map(([caseId, f]) => [String(caseId), f])),
    ...(c.standaard ? { standaard: { ...c.standaard } } : {}),
  }));
}

/**
 * Het kenmerk uit het bestand, of `undefined` als het ontbreekt of niet klopt.
 * Een onleesbaar kenmerk maakt de combinatie een EIGEN combinatie: dan past de
 * app haar niet aan, en dat is de veilige kant van de vergissing.
 */
function kenmerkUitBestand(raw: unknown): LoadCombination["standaard"] {
  if (!raw || typeof raw !== "object") return undefined;
  const k = raw as Record<string, unknown>;
  if (typeof k.sleutel !== "string") return undefined;
  if (!SOORTEN.includes(k.soort as CombinatieSoort)) return undefined;
  if (!GEVOLGKLASSEN.includes(k.gevolgklasse as Gevolgklasse)) return undefined;
  return {
    sleutel: k.sleutel,
    soort: k.soort as CombinatieSoort,
    gevolgklasse: k.gevolgklasse as Gevolgklasse,
  };
}

/**
 * Een projectbestand dat niet gelezen KAN worden zonder te raden. Eigen
 * fouttype zodat de openroute hem van een JSON-syntaxfout onderscheidt; de
 * `redenen` staan ook in `message`, zodat de bestaande melding "Kan bestand
 * niet openen" ze zonder verdere bewerking toont.
 */
export class ProjectBestandFout extends Error {
  constructor(readonly redenen: string[]) {
    super(redenen.join(" "));
    this.name = "ProjectBestandFout";
  }
}

/**
 * JSON-vorm → LoadCombination[] met Map-factoren (caseId weer numeriek).
 * `undefined` in → `undefined` uit, zodat de aanroeper bij v1-bestanden op
 * de bestaande defaults kan terugvallen.
 *
 * TWEE STILLE VERVORMINGEN zijn hier weggehaald (basisaudit ruw 29):
 *
 *  - `type: c.type === "sls" ? "sls" : "uls"` maakte van ELKE andere waarde
 *    een UGT-combinatie. Een tikfout ("als") of een hoofdletterverschil
 *    ("SLS") verplaatste een combinatie van de bruikbaarheids- naar de
 *    uiterste grenstoestand, waarna de doorbuigingstoets zijn BGT-combinatie
 *    kwijt was en de UGT-omhullende er een combinatie bij kreeg.
 *  - `Number(f)` maakte van een factor met een DECIMALE KOMMA ("1,5") — de
 *    voor de hand liggende handbewerking in een Nederlands bestand — stil
 *    `NaN`, dat vervolgens de hele combinatie in gaat.
 *
 * Allebei worden ze nu geweigerd met de combinatienaam en het gelezen
 * kenmerk erbij. Niets wordt hersteld of geraden: "1,5" zou ook 15 kunnen
 * zijn, en welke grenstoestand "als" was is niet uit te maken.
 */
export function combinationsFromFile(
  raw: ProjectFileCombination[] | undefined,
): LoadCombination[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const redenen: string[] = [];
  const uit = raw.map((c, i) => {
    const standaard = kenmerkUitBestand(c.standaard);
    const naam = `combinatie ${c.name ?? `#${i + 1}`} (id ${c.id})`;
    if (c.type !== "uls" && c.type !== "sls") {
      redenen.push(
        `In ${naam} staat type ${JSON.stringify(c.type)}; alleen "uls" ` +
          `(uiterste grenstoestand) en "sls" (bruikbaarheid) bestaan. Er wordt ` +
          "niet geraden: het verschil bepaalt of de combinatie in de " +
          "sterktetoets of in de doorbuigingstoets terechtkomt.",
      );
    }
    const factors = new Map<number, number>();
    for (const [caseId, f] of Object.entries(c.factors ?? {})) {
      const getal = typeof f === "number" ? f : Number(f);
      if (!Number.isFinite(getal)) {
        redenen.push(
          `In ${naam} is de factor van belastinggeval ${caseId} ` +
            `${JSON.stringify(f)}; dat is geen getal. Een decimale KOMMA hoort ` +
            "een punt te zijn (1.5, niet 1,5); anders zou er met NaN gerekend " +
            "worden en zou de hele combinatie leeg uitkomen.",
        );
        continue;
      }
      factors.set(Number(caseId), getal);
    }
    return {
      id: c.id,
      name: c.name,
      type: (c.type === "sls" ? "sls" : "uls") as LoadCombination["type"],
      formula: c.formula ?? "",
      factors,
      ...(standaard ? { standaard } : {}),
    };
  });
  if (redenen.length > 0) throw new ProjectBestandFout(redenen);
  return uit;
}

export interface ProjectFile {
  format: "open-fem2d-studio-v2";
  version: number;
  savedAt: string;          // ISO timestamp
  // Model
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  // Cases + UI prefs
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  selfWeightEnabled: boolean;
  /**
   * OUD veld, nog altijd geschreven: `true` voor beide tweede-orde-standen.
   * Het is de enige uitspraak over het analysetype die een oudere versie van
   * de app (en de sidecar) kan lezen. Bij het laden telt hij alleen wanneer
   * `analysetype` ontbreekt.
   */
  nonlinearEnabled: boolean;
  // v2 — optioneel zodat v1-bestanden zonder migratiestap blijven laden.
  /**
   * Analysetype (v2, optioneel): "eersteOrde" | "tweedeOrdeGeometrisch" |
   * "tweedeOrdeFysisch". Ontbreekt het veld, dan bepaalt `nonlinearEnabled`
   * de stand. Bewust als `string` getypeerd: een bestand uit een nieuwere
   * versie mag hier een onbekende waarde in hebben staan zonder dat het
   * laden omvalt — `analysetypeUitBestand` valt dan terug op de booleaan.
   */
  analysetype?: string;
  /** Gewenste segmentlengte in mm (v2, optioneel — ontbreekt = 400, besluit B3). */
  betonSegmentLengteMm?: number;
  /**
   * φ(∞,t₀) van het project, art. 3.1.4 (september 2026, optioneel). Ontbreekt
   * het veld of staat er `null`, dan is de kruipcoëfficiënt NIET opgegeven —
   * uitdrukkelijk iets anders dan 0.
   */
  betonKruipcoefficient?: number | null;
  /**
   * De invoer voor φ(∞,t₀) volgens bijlage B (september 2026, optioneel):
   * `{ rhProcent, t0Dagen, cementklasse }`. Ontbreekt het veld of staat er
   * `null`, dan wordt er niets berekend — elk ouder bestand rekent dus als
   * voorheen. Een opgegeven `betonKruipcoefficient` gaat voor.
   */
  betonKruipInvoer?: KruipInvoerProject | null;
  /** Belastingcombinatie-definities (v2). */
  combinations?: ProjectFileCombination[];
  /**
   * Tellers voor nieuwe id's (v2, optioneel — september 2026). Ze lopen nooit
   * terug, zodat een verwijderd belastinggeval of een verwijderde combinatie
   * zijn id nooit aan een nieuwe doorgeeft. Ontbreekt het veld, dan leidt
   * `openCombinatieStaat` (lib/combinatieBeheer) de tellers af uit de hoogste
   * id's — van de gevallen én van de factortabellen, zodat een wees-factor uit
   * een ouder bestand nooit door een nieuw geval wordt geërfd.
   */
  idTellers?: { belastinggeval: number; combinatie: number };
  /**
   * De melding van een vervanging van combinaties bij het openen (v2,
   * optioneel — september 2026). Bijschrift voor het rapport; zie de
   * versiegeschiedenis hierboven.
   */
  combinatiesVervangenBijOpenen?: string;
  /** Stramien (v2). */
  structuralGrid?: StructuralGrid;
  /** Scheefstand meenemen in de berekening (v2, optioneel — ontbreekt = uit). */
  scheefstandEnabled?: boolean;
  /** Noemer x in φ = 1/x (v2, optioneel — ontbreekt = 200). */
  scheefstandNoemer?: number;
  /** Richting van de equivalente horizontale krachten (v2, optioneel — ontbreekt = +1). */
  scheefstandRichting?: 1 | -1;
  /**
   * Waar φ vandaan komt (v2, optioneel — ontbreekt = "vast", dus de noemer
   * hierboven). Geldige waarden: "vast" | "en1993" | "en1992" | "en1995" |
   * "ongunstigste", zie `lib/scheefstandNorm.ts`. Bewust als `string`
   * getypeerd, net als `analysetype`: een bestand uit een nieuwere versie mag
   * hier een onbekende waarde in hebben staan zonder dat het laden omvalt —
   * de store valt dan terug op "vast".
   */
  scheefstandBron?: string;
  /** Handmatige hoogte h in m voor α_h (v2, optioneel — ontbreekt = afleiden). */
  scheefstandHoogteM?: number | null;
  /** Handmatig aantal verticale elementen m voor α_m (v2, optioneel — ontbreekt = afleiden). */
  scheefstandAantalElementen?: number | null;
  /**
   * Eigen doorsneden uit de profieleditor waarnaar staven verwijzen
   * (`EIGEN:<naam>`); v2, optioneel — geen versie-bump. Ontbreekt het veld
   * (ouder bestand), dan blijft de lokaal bewaarde lijst ongemoeid.
   *
   * Alleen de GEBRUIKTE doorsneden staan erin (zie `exporteer` in
   * eigenDoorsnedenStore); bij het openen worden ze SAMENGEVOEGD met de
   * lokale bibliotheek, waarbij het project wint bij een gelijke naam.
   */
  eigenDoorsneden?: EigenDoorsnede[];
  /**
   * De projectgegevens (naam, nummer, ingenieur, bedrijf, datum, locatie,
   * omschrijving, uitgangspunten met normen, gevolgklasse, windgebied en
   * terreincategorie). Die stonden alleen in de app-instellingen van de
   * machine, niet in het bestand: wie een project doorstuurde, stuurde het
   * zonder zijn gegevens, en wie een ander project opende hield de vorige
   * projectnaam. Optioneel: een ouder bestand laadt zonder en laat de
   * instellingen staan. Bewust als losse JSON (geen ProjectInfo-import):
   * dit bestand kent de dialoog niet, en onbekende velden reizen zo mee.
   */
  projectInfo?: Record<string, unknown>;
  /**
   * De instellingen van de windbelastinggenerator, zodat "Genereren" op een
   * andere machine dezelfde lasten oplevert. Optioneel; de gegenereerde
   * lasten zelf staan al in `loads` en `loadCases`.
   */
  windInstellingen?: Record<string, unknown>;
  /**
   * De rapportinstellingen die de inhoud bepalen: rapporttype, toetsdetail,
   * aan/uit per sectie, staafkeuze, inhoudsopgavediepte, opmaak en
   * papierformaat. Geen zoom of actieve sectie — dat is scherm, geen
   * project.
   */
  rapport?: Record<string, unknown>;
  /**
   * Eigen CLT-vloeropbouwen: de NAMEN die de gebruiker aan opbouwen gaf,
   * v2, optioneel — geen versie-bump.
   *
   * Anders dan bij `eigenDoorsneden` is dit geen afhankelijkheid maar een
   * bijschrift: een CLT-staaf draagt zijn opbouw volledig in de profielnaam
   * ("CLT 40L:C24/20D:C16/40L b600"), dus een bestand zonder dit veld rekent
   * exact hetzelfde door — je mist alleen de naam waaronder de gebruiker de
   * opbouw kent. Alleen opbouwen die in dít model voorkomen gaan mee (zie
   * `exporteer` in cltOpbouwenStore), en bij het openen worden ze op dezelfde
   * manier samengevoegd als de eigen doorsneden.
   */
  eigenCltOpbouwen?: EigenCltOpbouw[];
}

export function serializeProject(state: Omit<ProjectFile, "format" | "version" | "savedAt">): string {
  const file: ProjectFile = {
    format: "open-fem2d-studio-v2",
    version: PROJECT_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    ...state,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * De lijsten die ELK projectbestand draagt. Ontbreekt er een, dan is het
 * bestand niet leesbaar: `pasProjectToe` zet dan `undefined` in de store en de
 * app valt pas veel later om, op een plek die niets meer met het bestand te
 * maken heeft ("Cannot read properties of undefined"). Tot september 2026
 * gebeurde dat zonder enige melding bij het openen (basisaudit ruw 27).
 *
 * Ze zijn alle zes al sinds v1 verplicht: geen van de 32 bestanden in de repo
 * mist er een. Een lege lijst is gewoon goed — het gaat om het VELD.
 */
const VERPLICHTE_LIJSTEN = [
  "nodes", "beams", "supports", "plates", "loads", "loadCases",
] as const;

/**
 * Alle sleutels die deze versie op modelniveau van een projectbestand kent.
 * Wat hier niet in staat, overleeft een rondje openen-en-opslaan niet: de
 * opslaroute (`App.tsx`) bouwt een vaste veldlijst op. `toelichting` — de
 * documentatie in de referentiebestanden — is daar het gemeten voorbeeld van.
 */
const BEKENDE_TOPVELDEN: readonly string[] = [
  "format", "version", "savedAt",
  ...VERPLICHTE_LIJSTEN,
  "activeLoadCaseId", "selfWeightEnabled", "nonlinearEnabled", "analysetype",
  "betonSegmentLengteMm", "betonKruipcoefficient", "betonKruipInvoer", "combinations", "idTellers",
  "combinatiesVervangenBijOpenen", "structuralGrid",
  "scheefstandEnabled", "scheefstandNoemer", "scheefstandRichting",
  "scheefstandBron", "scheefstandHoogteM", "scheefstandAantalElementen",
  "eigenDoorsneden", "eigenCltOpbouwen", "projectInfo", "windInstellingen",
  "rapport",
];

/**
 * De top-level sleutels die deze versie NIET kent, in leesvolgorde. Niet
 * blokkerend — een onbekend veld is meestal documentatie of een veld uit een
 * latere versie — maar wel te melden, want bij het volgende opslaan is het weg.
 */
export function onbekendeTopVelden(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== "object") return [];
  return Object.keys(parsed as Record<string, unknown>)
    .filter((k) => !BEKENDE_TOPVELDEN.includes(k));
}

export function deserializeProject(text: string): ProjectFile {
  const parsed = JSON.parse(text);
  if (parsed.format !== "open-fem2d-studio-v2") {
    throw new Error(`Onbekend bestandsformaat: ${parsed.format ?? "(geen format-tag)"}`);
  }
  if (typeof parsed.version !== "number") {
    throw new Error("Bestand mist version-tag");
  }
  if (parsed.version > PROJECT_FORMAT_VERSION) {
    throw new Error(`Bestand is opgeslagen met nieuwere versie (${parsed.version}) — werk je app bij`);
  }
  // Structuur. Hier stond `return parsed as ProjectFile` en verder niets: de
  // drie poorten hierboven keken alleen naar de kaft van het bestand.
  const redenen: string[] = [];
  for (const veld of VERPLICHTE_LIJSTEN) {
    if (!Array.isArray(parsed[veld])) {
      redenen.push(
        `Het bestand mist de lijst \`${veld}\`` +
          (parsed[veld] === undefined ? "" : ` (er staat ${JSON.stringify(parsed[veld])})`) +
          ". Elk projectbestand draagt nodes, beams, supports, plates, loads en " +
          "loadCases; een lege lijst mag, het veld weglaten niet.",
      );
    }
  }
  if (redenen.length > 0) throw new ProjectBestandFout(redenen);
  // Het analysetype aan de poort (basisaudit ruw 28): een waarde die deze
  // versie niet kent viel stil terug op de booleaan — meestal op tweede orde.
  // De weigering hoort hier te vallen, bij het openen, en niet halverwege het
  // laden in de store.
  analysetypeUitBestand(parsed.analysetype, parsed.nonlinearEnabled);
  // Combinatietypen en factoren (basisaudit ruw 29): `combinationsFromFile`
  // weigert een onbekend type en een niet-eindige factor. Hier alvast, zodat
  // een bestand met een tikfout niet half geladen op het scherm komt.
  combinationsFromFile(parsed.combinations);
  return parsed as ProjectFile;
}

// ── Tauri vs. browser detection ─────────────────────────────────────────────
function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

// ── Save flow ──────────────────────────────────────────────────────────────
/**
 * Save text to a file. In Tauri: opens a native Save-dialog and writes via
 * the fs plugin. In browser: triggers a Blob download. Returns the path that
 * was saved to (Tauri only — empty string in browser).
 */
export async function saveProjectAs(text: string, suggestedName: string): Promise<string> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Open FEM2D Studio project", extensions: [PROJECT_FILE_EXT] }],
    });
    if (!path) return "";  // user cancelled
    await writeTextFile(path, text);
    return path as string;
  }
  // Browser fallback: trigger download
  const blob = new Blob([text], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = suggestedName.endsWith(`.${PROJECT_FILE_EXT}`)
    ? suggestedName
    : `${suggestedName}.${PROJECT_FILE_EXT}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "";
}

/**
 * Save to a known path (no dialog). Falls back to saveProjectAs in the browser.
 */
export async function saveProjectTo(path: string, text: string): Promise<void> {
  if (isTauri() && path) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return;
  }
  // No known path / browser → fall back to dialog flow
  await saveProjectAs(text, "project");
}

// ── Open flow ──────────────────────────────────────────────────────────────
/**
 * Open a project file. In Tauri: native dialog + fs read. In browser: hidden
 * file-input. Returns { text, path } — text is the raw JSON, path is the
 * file path (Tauri only) or filename (browser).
 */
export async function openProject(): Promise<{ text: string; path: string } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Open FEM2D Studio project", extensions: [PROJECT_FILE_EXT] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const text = await readTextFile(selected as string);
    return { text, path: selected as string };
  }
  // Browser: hidden <input type=file>
  return await new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${PROJECT_FILE_EXT},application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const text = await file.text();
      resolve({ text, path: file.name });
    };
    input.click();
  });
}
