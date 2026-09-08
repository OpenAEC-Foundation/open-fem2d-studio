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
 * Is er niet fysisch niet-lineair gerekend, dan blijft `concrete_stiffness_trace`
 * WEG in plaats van leeg mee te gaan. Het veld heeft `#[serde(default)]`, dus
 * dat is geldig, en de PDF laat het betonhoofdstuk dan de eerlijke melding zien
 * dat er geen fysische ronde is gedraaid — precies zoals het live rapport doet.
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
import type { BeamCheckResult } from "./types/steel/BeamCheckResult";
import type { BetonStijfheidSpoor } from "./types/concrete/BetonStijfheidSpoor";
import type { ConcreteBeamCheckResult } from "./types/concrete/ConcreteBeamCheckResult";
import type { ReportInput } from "./types/steel/ReportInput";
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

/** Alles wat de uitdraai nodig heeft, uit de drie bronnen bij elkaar. */
export interface RapportPdfBronnen {
  project: RapportProject;
  /** De toetsresultaten uit `checkStore`, ongefilterd. */
  checkResults: MemberCheckResult[];
  /** Het spoor uit `betonStijfheidStore`; laat weg als er niets staat. */
  stijfheid?: StijfheidSpoorInvoer;
}

/**
 * Een houtresultaat is wat overblijft: geen staal, geen beton, geen vrije
 * spanningstoets en geen kruislaaghout.
 *
 * Er is geen `isTimberCheckResult`-wachter in `checkTypes` — hout is daar de
 * terugval — en die hier alsnog verzinnen zou een zesde definitie van
 * "wat is hout" opleveren. Kruislaaghout valt er apart uit omdat de
 * PDF-uitdraai daar (nog) geen hoofdstuk voor heeft; zie het slot van dit
 * bestand.
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

/** De volledige invoer voor `generate_steel_report_pdf`. */
export function bouwRapportInvoer(bron: RapportPdfBronnen): ReportInput {
  const staal: BeamCheckResult[] = bron.checkResults.filter(isSteelCheckResult);
  const beton: ConcreteBeamCheckResult[] = bron.checkResults.filter(isConcreteCheckResult);
  const hout: TimberBeamCheckResult[] = bron.checkResults.filter(isHoutResultaat);
  const spoor = spoorVoorPdf(bron.stijfheid);

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
  if (beton.length > 0) invoer.concrete_check_results = beton;
  if (spoor) invoer.concrete_stiffness_trace = spoor;
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
 * WAT DEZE UITDRAAI (NOG) NIET DRAAGT, en dus in het live rapport moet blijven:
 * kruislaaghout, de vrije spanningstoets, de plaatspanningen, de
 * krachtsverdeling en de oplegreacties. `ReportInput` kent daar geen velden
 * voor; die resultaten worden hier daarom BEWUST niet meegestuurd in plaats van
 * ze op een naburig veld te laten lijken.
 */
export const NIET_IN_PDF = [
  "kruislaaghout",
  "vrije spanningstoets",
  "plaatspanningen",
  "krachtsverdeling",
  "oplegreacties",
] as const;
