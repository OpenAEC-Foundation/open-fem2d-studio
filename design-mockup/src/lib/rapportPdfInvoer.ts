/**
 * rapportPdfInvoer.ts — de brug van de stores naar de PDF-uitdraai van de
 * rekenkern (`generate_steel_report_pdf`).
 *
 * WAT HIER GEBEURT EN WAAROM HET EEN EIGEN BESTAND IS
 * ---------------------------------------------------
 * De Rust-kant kent één invoertype, `ReportInput`. De frontend heeft datzelfde
 * gegeven verspreid over drie plaatsen: de projectinstelling, de `checkStore`
 * met de toetsresultaten en de `betonStijfheidStore` met het segmentspoor van
 * de fysisch niet-lineaire tweede orde. Dit bestand is de ENIGE plaats waar die
 * drie samenkomen, zodat er geen tweede — en dus afwijkende — samenstelling van
 * dezelfde uitdraai kan ontstaan.
 *
 * De bouwfunctie is met opzet ZUIVER: hij leest geen store en roept niets aan,
 * maar krijgt alles binnen. Daardoor is hij zonder DOM en zonder Tauri te
 * testen (`test-rapportpdf-invoer.mjs`), en kan het losgekoppelde
 * rapportvenster hem met zijn eigen momentopname voeden.
 *
 * DE VORM VOLGT DE RUST-KANT, NIET ANDERSOM
 * -----------------------------------------
 * De veldnamen hieronder (`beam_id`, `max_relatieve_verandering`,
 * `staafdoorsneden`) zijn die van `report::betonspoor`. De store gebruikt
 * camelCase; deze module is de vertaalslag, en verder niets — er wordt niets
 * afgeleid, niets afgerond en niets weggelaten. Wat de kern heeft gezegd, gaat
 * ongewijzigd door naar het papier.
 *
 * WANNEER HET SPOOR WEGBLIJFT
 * ---------------------------
 * Is er niet fysisch niet-lineair gerekend, dan blijven de SEGMENTEN weg in
 * plaats van leeg mee te gaan. Het veld heeft `#[serde(default)]`, dus dat is
 * geldig, en de PDF laat het betonhoofdstuk dan de eerlijke melding zien dat er
 * geen fysische ronde is gedraaid — precies zoals het live rapport doet.
 *
 * DE DOORSNEDEFIGUUR HANGT NIET AAN DIE RONDE
 * -------------------------------------------
 * `staafdoorsneden` is geen rekengegeven maar tekengegeven: de doorsnede van
 * een betonstaaf bestaat ook zonder fysische ronde. De store vult dat veld
 * alleen ná zo'n ronde, dus bij elk ander analysetype wordt het hier alsnog
 * afgeleid uit de toetsresultaten — met dezelfde terugval die het live rapport
 * gebruikt (`betonDoorsnedeTerugval`), zodat het scherm en het papier niet uit
 * elkaar gaan lopen. Daardoor kan `concrete_stiffness_trace` meegaan met
 * ALLEEN doorsneden erin: het betonhoofdstuk houdt dan zijn eerlijke melding
 * over de ontbrekende segmenten en tekent toch de doorsnede.
 *
 * MAAR NIET BIJ EEN STAAF DIE DE KERN HEEFT GEWEIGERD
 * ---------------------------------------------------
 * Een geweigerde toets levert een resultaat waarin de doorsnedenaam en de
 * wapeningsregel uit de INVOER komen (`concrete-check::orchestrator::
 * error_result`) — dus ook uit een invoer die de kern niet kon verwerken. De
 * terugval leest die twee regels en zou er een keurige tekening bij zetten,
 * naast een staaf waarover niets bekend is. Zie [`toetsGeweigerd`]: die staaf
 * krijgt geen figuur, en het betonhoofdstuk meldt zelf waarom er geen staat.
 *
 * DEZELFDE TERUGVAL MOET OOK DEZELFDE INVOER KRIJGEN
 * --------------------------------------------------
 * "Één gedeelde functie" is niets waard zolang de twee kanten er iets anders
 * in stoppen: het live rapport geeft `doorsnedeUitToets` de korf uit het model
 * mee (exacte getallen), en het papier deed dat niet. Dan tekent het scherm de
 * korf van het model en het papier de teruggeparste korf uit de
 * samenvattingsregel — dezelfde functie, twee beelden. Daarom draagt
 * [`RapportPdfBronnen`] die korven mee; wie ze aanlevert, krijgt op papier
 * hetzelfde als op het scherm. Blijven ze weg, dan is de samenvattingsregel de
 * bron, precies zoals in het losgekoppelde rapportvenster dat ook geen
 * modelstate heeft.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  isConcreteCheckResult,
  isStressCheckResult,
  isSteelCheckResult,
  type CheckSkip,
  type MemberCheckResult,
} from "./checkTypes";
import { isCltCheckResult } from "./cltCheckBuilder";
import { doorsnedeUitToets } from "./betonDoorsnedeTerugval";
import type { BeamCheckResult } from "./types/steel/BeamCheckResult";
import type { BetonStaafDoorsnede } from "./types/concrete/BetonStaafDoorsnede";
import type { BetonStijfheidSpoor } from "./types/concrete/BetonStijfheidSpoor";
import type { CltBeamCheckResult } from "./types/timber/CltBeamCheckResult";
import type { ConcreteBeamCheckResult } from "./types/concrete/ConcreteBeamCheckResult";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { ReportInput } from "./types/steel/ReportInput";
import type { SpanningBeamCheckResult } from "./types/spanning/SpanningBeamCheckResult";
import type { TimberBeamCheckResult } from "./types/timber/TimberBeamCheckResult";
import type {
  BetonStaafDoorsnedeInvoer,
  StijfheidCombinatie,
} from "../stores/betonStijfheidStore";

/** De projectgegevens die op het omslag komen. */
export interface RapportProject {
  name: string;
  projectNumber: string;
  engineer: string;
  company: string;
  date: string;
}

/** Het segmentspoor zoals `betonStijfheidStore` het bewaart. */
export interface StijfheidSpoorInvoer {
  segmentLengteMm: number;
  combinaties: StijfheidCombinatie[];
  overgeslagen: CheckSkip[];
  staafdoorsneden: BetonStaafDoorsnedeInvoer[];
}

/**
 * De wapeningskorven zoals ze in het MODEL staan, per staaf-id.
 *
 * `checkStore.korvenUitStaven(lastRunData.beams)` levert precies deze kaart,
 * uit dezelfde staafeigenschappen (`checkConfig.betonKorf`) waar het live
 * rapport ze uit haalt.
 */
export type KorvenUitModel = ReadonlyMap<number, ReinforcementCage>;

/** Alles wat de uitdraai nodig heeft, uit de drie bronnen bij elkaar. */
export interface RapportPdfBronnen {
  project: RapportProject;
  /** De toetsresultaten uit `checkStore`, ongefilterd. */
  checkResults: MemberCheckResult[];
  /** Het spoor uit `betonStijfheidStore`; laat weg als er niets staat. */
  stijfheid?: StijfheidSpoorInvoer;
  /**
   * De wapeningskorven uit het model, per staaf-id — de EXACTE getallen.
   *
   * Waarom dit erbij hoort: het live rapport geeft ze aan `doorsnedeUitToets`
   * mee en het papier deed dat niet, dus dezelfde gedeelde terugval kreeg aan
   * beide kanten andere invoer. Levert de aanroeper ze aan, dan tekenen scherm
   * en papier aantoonbaar dezelfde korf; laat hij ze weg, dan leest de terugval
   * de samenvattingsregel van de kern — dat is wat het losgekoppelde
   * rapportvenster óók doet, en het verschil zit hoogstens in de afronding
   * waarmee die regel geschreven is.
   */
  korvenUitModel?: KorvenUitModel;
}

/**
 * Een houtresultaat is wat overblijft: geen staal, geen beton, geen vrije
 * spanningstoets en geen kruislaaghout.
 *
 * Er is geen `isTimberCheckResult`-wachter in `checkTypes` — hout is daar de
 * terugval — en die hier alsnog verzinnen zou een zesde definitie van
 * "wat is hout" opleveren. Kruislaaghout valt er apart uit omdat het een eigen
 * veld heeft: het draagt dezelfde norm maar een eigen resultaattype, en het
 * rapport telt de twee samen als één normvermelding.
 */
function isHoutResultaat(r: MemberCheckResult): r is TimberBeamCheckResult {
  return (
    !isSteelCheckResult(r) &&
    !isConcreteCheckResult(r) &&
    !isStressCheckResult(r) &&
    !isCltCheckResult(r)
  );
}

/**
 * Het segmentspoor in de vorm van de rekenkern, of `undefined` wanneer er
 * niets na te vertellen valt.
 */
export function spoorVoorPdf(
  s: StijfheidSpoorInvoer | undefined,
): BetonStijfheidSpoor | undefined {
  if (!s) return undefined;
  const heeftRonden = s.combinaties.some((c) => c.staven.length > 0);
  if (!heeftRonden && s.overgeslagen.length === 0) return undefined;
  return {
    segment_lengte_mm: s.segmentLengteMm,
    combinaties: s.combinaties.map((c) => ({
      combinatie_id: c.combinatieId,
      combinatie_naam: c.combinatieNaam,
      grenstoestand: c.grenstoestand,
      ronden: c.ronden,
      verloop: c.verloop.map((v) => ({
        ronde: v.ronde,
        max_relatieve_verandering: v.maxRelatieveVerandering,
        geconvergeerd: v.geconvergeerd,
      })),
      // De kernantwoorden gaan ONGEWIJZIGD mee: `SegmentStiffnessResponse` is
      // aan beide kanten hetzelfde type.
      staven: c.staven,
    })),
    overgeslagen: s.overgeslagen.map((o) => ({
      beam_id: o.beamId,
      // Woordelijk de reden die de rekengang heeft vastgesteld.
      reden: o.reason,
    })),
    staafdoorsneden: s.staafdoorsneden.map((d) => ({
      beam_id: d.beamId,
      doorsnede: d.doorsnede,
      korf: d.korf,
    })),
  };
}

/**
 * Heeft de rekenkern deze staaf GEWEIGERD te toetsen?
 *
 * Zo ja, dan is er over die staaf niets vastgesteld: geen toetsen, geen UC,
 * geen status. De kern zet dan de reden in `governing_check_id` met "ERROR: "
 * ervoor (`concrete-check::orchestrator::error_result`) en laat `checks` leeg;
 * de doorsnedenaam en de wapeningsregel in dat resultaat komen uit de INVOER,
 * niet uit een doorsnede die de kern heeft kunnen bouwen.
 *
 * Woordelijk dezelfde vraag als in het live rapport
 * (`components/report/sections/BetonSection.tsx`, `const fout = …`), zodat het
 * scherm en het papier dezelfde staven overslaan. Beide voorwaarden blijven
 * staan: een resultaat zonder één toets zegt evenveel als een ERROR-melding,
 * ook als een toekomstige kern die melding anders zou schrijven.
 */
export function toetsGeweigerd(
  r: Pick<ConcreteBeamCheckResult, "checks" | "governing_check_id">,
): boolean {
  return r.checks.length === 0 || r.governing_check_id.startsWith("ERROR:");
}

/**
 * De doorsneden waarmee de PDF de doorsnedefiguren tekent, per betonstaaf.
 *
 * De exacte doorsneden uit de rekengang gaan VOOR: dat zijn de maten en de
 * korf zoals de kern ze gekregen heeft. Voor elke betonstaaf die daar niet bij
 * staat — bij eerste orde staat er geen enkele — wordt de doorsnede uit het
 * toetsresultaat herleid. Is dat niet te doen, dan blijft die staaf weg en
 * meldt het betonhoofdstuk zelf dat de figuur ontbreekt; een verzonnen
 * doorsnede op papier is erger dan een lege plek.
 *
 * EEN GEWEIGERDE STAAF KRIJGT GEEN TERUGVAL. De doorsnedenaam en de
 * wapeningsregel van zo'n resultaat zijn de INVOER die de kern niet kon
 * verwerken; er een tekening bij zetten suggereert dat er iets getoetst is.
 * Zie [`toetsGeweigerd`]. Wat de kern in de rekengang zelf heeft GEKREGEN
 * (`uitRekengang`) blijft wél staan: die maten komen niet uit een naam maar
 * uit de aanroep, en zijn dus ook waar als de toetsing daarna strandde.
 *
 * `korvenUitModel` is de exacte korf per staaf, als de aanroeper hem heeft.
 * Hij gaat één op één door naar dezelfde parameter van `doorsnedeUitToets` die
 * het live rapport vult — dat is de hele reden dat die parameter hier bestaat.
 */
export function doorsnedenVoorFiguren(
  beton: ConcreteBeamCheckResult[],
  uitRekengang: BetonStaafDoorsnede[],
  korvenUitModel?: KorvenUitModel,
): BetonStaafDoorsnede[] {
  const uit = [...uitRekengang];
  for (const r of beton) {
    if (uit.some((d) => d.beam_id === r.beam_id)) continue;
    if (toetsGeweigerd(r)) continue;
    const terugval = doorsnedeUitToets(r, korvenUitModel?.get(r.beam_id));
    if (!terugval) continue;
    uit.push({ beam_id: r.beam_id, doorsnede: terugval.doorsnede, korf: terugval.korf });
  }
  return uit;
}

/** De volledige invoer voor `generate_steel_report_pdf`. */
export function bouwRapportInvoer(bron: RapportPdfBronnen): ReportInput {
  const staal: BeamCheckResult[] = bron.checkResults.filter(isSteelCheckResult);
  const beton: ConcreteBeamCheckResult[] = bron.checkResults.filter(isConcreteCheckResult);
  const hout: TimberBeamCheckResult[] = bron.checkResults.filter(isHoutResultaat);
  const clt: CltBeamCheckResult[] = bron.checkResults.filter(isCltCheckResult);
  const spanning: SpanningBeamCheckResult[] = bron.checkResults.filter(isStressCheckResult);
  const spoor = spoorVoorPdf(bron.stijfheid);
  const doorsneden = doorsnedenVoorFiguren(
    beton,
    spoor?.staafdoorsneden ?? [],
    bron.korvenUitModel,
  );

  const invoer: ReportInput = {
    project_name: bron.project.name || "Naamloos",
    project_number: bron.project.projectNumber ?? "",
    engineer: bron.project.engineer ?? "",
    company: bron.project.company ?? "",
    date: bron.project.date || new Date().toISOString().slice(0, 10),
    steel_check_results: staal,
  };
  // De optionele velden alleen MEESTUREN als er iets in zit. Ze hebben aan de
  // Rust-kant `#[serde(default)]`, dus een leeg veld en een ontbrekend veld
  // betekenen hetzelfde; weglaten houdt de aanroep leesbaar in de logboeken.
  if (hout.length > 0) invoer.timber_check_results = hout;
  // Kruislaaghout en de vrije spanningstoets MOETEN mee, ook al tekent de PDF
  // hun laagtabel en spanningsverloop nog niet. Zonder deze twee regels levert
  // een model dat alleen daaruit bestaat een rapport met nul getoetste staven,
  // en dan zegt de PDF niets over wat de gebruiker wél getoetst heeft.
  if (clt.length > 0) invoer.clt_check_results = clt;
  if (beton.length > 0) invoer.concrete_check_results = beton;
  if (spanning.length > 0) invoer.stress_check_results = spanning;
  if (spoor) {
    invoer.concrete_stiffness_trace = { ...spoor, staafdoorsneden: doorsneden };
  } else if (doorsneden.length > 0) {
    // Wel doorsneden om te tekenen, geen segmenten om na te vertellen: dat is
    // elk analysetype behalve "2e orde + fysisch". De segmentlengte is dan
    // geen weggelaten gegeven maar een niet-bestaand gegeven — er is niet
    // geknipt — en het hoofdstuk drukt hem in dit geval ook niet af.
    invoer.concrete_stiffness_trace = {
      segment_lengte_mm: 0,
      combinaties: [],
      overgeslagen: [],
      staafdoorsneden: doorsneden,
    };
  }
  return invoer;
}

/**
 * Vraag de rekenkern om de PDF. Alleen in de desktop-app: het rapport-PDF-pad
 * loopt via een Tauri-command, niet via de dev-brug.
 */
export async function genereerRapportPdf(invoer: ReportInput): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("generate_steel_report_pdf", { input: invoer });
  return new Uint8Array(bytes);
}

/**
 * WAT DEZE UITDRAAI (NOG) NIET DRAAGT, en dus in het live rapport moet blijven.
 *
 * `ReportInput` kent voor deze onderdelen geen veld; ze worden hier daarom
 * BEWUST niet meegestuurd in plaats van ze op een naburig veld te laten lijken.
 *
 * De TOETSINGEN van kruislaaghout en van de vrije spanningstoets staan er niet
 * meer bij: die gaan sinds de velden `clt_check_results` en
 * `stress_check_results` gewoon mee, en komen in de samenvattingstabel en in
 * het blok per staaf. Alleen hun eigen figuren ontbreken nog.
 */
export const NIET_IN_PDF = [
  "de laagtabel en de laagtekening van kruislaaghout",
  "de doorsnedetekening met het spanningsverloop",
  "plaatspanningen",
  "krachtsverdeling",
  "oplegreacties",
] as const;
