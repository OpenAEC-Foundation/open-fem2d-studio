/**
 * timberCheckBuilder.ts — bouwt TimberBeamCheckInput[] voor het Tauri-command
 * `check_timber_beams` — spiegel van steelCheckBuilder, aangesloten op het
 * design-mockup datamodel.
 *
 * Herkenning in dit datamodel:
 *  - Een staaf is hout wanneer `beam.material` een EN 338/EN 14080-
 *    sterkteklasse is ("C24", "GL28h", …). De lijst komt runtime uit het
 *    Tauri-command `list_timber_grades`; de statische lijst hieronder is de
 *    browser-fallback en moet daarmee overeenkomen.
 *  - De doorsnede moet een rechthoek b × h zijn, herkenbaar aan de
 *    profielnaam ("60x100", "38x89 SLS", "96x450 GL"). Dit model slaat
 *    geen numerieke doorsnede-eigenschappen per staaf op, dus de naam is de
 *    enige bron — geen naam-match betekent eerlijk overslaan.
 *
 * Gedocumenteerde defaults (nog niet per staaf instelbaar in deze UI):
 *  - klimaatklasse 1, belastingduur "middellang" (maatgevend voor de
 *    gebruikelijke UGT-combinatie met veranderlijke vloerbelasting);
 *  - kniklengte = systeemlengte om beide assen; kipsteunafstand =
 *    staaflengte; belastinggeval "gelijkmatig verdeeld" aangrijpend in het
 *    zwaartepunt; k_cr = 1,0; geen lastverdelend systeem;
 *  - doorbuiging: karakteristieke BGT-zakking geldt óók als quasi-blijvend
 *    (volledige kruip — veilig-zijdig); blijvend deel 0 → w_add = w_fin.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { TimberBeamCheckInput } from "./types/timber/TimberBeamCheckInput";
import type { CheckSkip } from "./checkTypes";
import {
  isSteelProfile,
  beamLengthMm,
  buildForcesEnvelope,
  extractFieldDeflectionMm,
} from "./steelCheckBuilder";

/**
 * Sterkteklassen die de Rust EN 1995-kern kent (nen-en-1995-1-1/data.rs):
 * EN 338 naaldhout C14–C35 en EN 14080 gelamineerd hout GL24h–GL36h.
 * Browser-fallback voor `list_timber_grades`.
 */
export const SUPPORTED_TIMBER_GRADES = [
  "C14", "C16", "C18", "C20", "C22", "C24", "C27", "C30", "C35",
  "GL24h", "GL28h", "GL32h", "GL36h",
] as const;

/** Wel herkenbaar als hout, maar (nog) zonder normdata: EN 338 loofhout. */
const UNSUPPORTED_TIMBER_GRADES = ["D30", "D35", "D40", "D50", "D60", "D70"];

/** Generieke houtnamen zonder sterkteklasse — niet toetsbaar. */
const GENERIC_TIMBER_NAMES = ["timber (softwood)", "timber (hardwood)", "wood", "hout"];

/** Match een materiaalnaam op een ondersteunde sterkteklasse. */
export function matchSupportedTimberGrade(
  materialName: string | undefined,
  supportedGrades: readonly string[] = SUPPORTED_TIMBER_GRADES,
): string | null {
  if (!materialName) return null;
  const trimmed = materialName.trim();
  const hit = supportedGrades.find((g) => g.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}

/**
 * Herken een rechthoekige houtdoorsnede b × h (mm) uit de profielnaam:
 * "38x89 SLS", "60x100 GL", of kaal "96x450" (conventie: b×h).
 */
export function parseTimberRectMm(
  profileName: string | undefined,
): { bMm: number; hMm: number } | null {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s+(?:SLS|EU|CLS|GL))?$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}

export interface TimberBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Runtime-lijst uit `list_timber_grades`; leeg → statische fallback. */
  supportedGrades?: string[];
}

export interface TimberBuildResult {
  inputs: TimberBeamCheckInput[];
  /** Houtstaven die herkend maar niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

export function buildTimberCheckInputs(data: TimberBuildData): TimberBuildResult {
  const inputs: TimberBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];

  const grades =
    data.supportedGrades && data.supportedGrades.length > 0
      ? data.supportedGrades
      : SUPPORTED_TIMBER_GRADES;

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const slsChar =
    slsCombos.find((c) => /karakter/i.test(c.name)) ?? slsCombos[0] ?? null;
  const slsResult = slsChar ? data.combinationResults.get(slsChar.id) ?? null : null;

  for (const beam of data.beams) {
    const materialName = beam.material?.trim() ?? "";
    const grade = matchSupportedTimberGrade(materialName, grades);

    if (!grade) {
      // Wel hout, maar niet toetsbaar → expliciet melden. Al het overige
      // (staal, generiek) is geen zaak van deze builder.
      const lower = materialName.toLowerCase();
      if (UNSUPPORTED_TIMBER_GRADES.some((g) => g.toLowerCase() === lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" (loofhout) wordt nog niet ondersteund door de EN 1995-kern`,
        });
      } else if (GENERIC_TIMBER_NAMES.includes(lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse — kies bijv. C24 of GL28h`,
        });
      }
      continue;
    }

    // Staalprofiel + houtmateriaal is een inconsistent model — niet toetsen
    // met verzonnen eigenschappen (de staalbouwer slaat hem ook over omdat
    // het materiaal geen staalsoort is).
    if (isSteelProfile(beam.profile)) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName}" is hout maar profiel "${beam.profile}" is een staalprofiel — kies een houtdoorsnede (bijv. "60x100") of een staalsoort`,
      });
      continue;
    }

    const rect = parseTimberRectMm(beam.profile);
    if (!rect) {
      skipped.push({
        beamId: beam.id,
        reason: `doorsnede "${beam.profile ?? "—"}" is geen herkenbare rechthoek b×h — gebruik bijv. "60x100" of "96x450 GL" als profielnaam`,
      });
      continue;
    }

    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }

    const hasAnyResult = ulsCombos.some((c) =>
      data.combinationResults.get(c.id)?.elements.has(beam.id),
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties — reken het model eerst door",
      });
      continue;
    }

    const forcesEnvelope = buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults);

    // Zakking onder de karakteristieke BGT-combinatie: veldmaximum
    // max |w(x)| over de 21 stations, teken behouden (mm, negatief =
    // omlaag conform de tekenconventie van de kern — de lokale
    // stationsconventie van de solver valt daar voor horizontale staven
    // mee samen; zie extractFieldDeflectionMm).
    const wInstMm = extractFieldDeflectionMm(beam, slsResult);

    inputs.push({
      beam_id: beam.id,
      width_mm: rect.bMm,
      height_mm: rect.hMm,
      strength_class: grade,
      service_class: "Sc1",
      load_duration: "MediumTerm",
      length_m: lengthMm / 1000,
      forces_envelope: forcesEnvelope,
      buckling_length_y_m: lengthMm / 1000,
      buckling_length_z_m: lengthMm / 1000,
      ltb_segment_length_m: 0, // 0 → staaflengte
      ltb_load_case: "UniformLoad",
      ltb_load_position: "CentreOfGravity",
      ltb_effective_length_override_m: 0,
      perform_ltb_check: true,
      k_cr: 1.0,
      load_sharing: false,
      deflection_inst_mm: wInstMm,
      // Volledige last als quasi-blijvend: maximale kruiptoeslag (veilig-zijdig).
      deflection_quasi_perm_mm: wInstMm,
      // Blijvend deel onbekend → 0, dus w_add = w_fin (veilig-zijdig).
      deflection_permanent_mm: 0,
      deflection_limit_fin: 250,
      deflection_limit_add: 333,
    });
  }

  return { inputs, skipped };
}
