/**
 * betonCheckBuilder.ts — bouwt ConcreteBeamCheckInput[] voor de kern-opdracht
 * `check_concrete_beams` (NEN-EN 1992-1-1) — spiegel van timberCheckBuilder,
 * aangesloten op het design-mockup datamodel.
 *
 * Herkenning in dit datamodel:
 *  - Een staaf is beton wanneer `beam.material` een betonsterkteklasse uit
 *    tabel 3.1 is ("C30/37", of kort "C30"). De lijst komt runtime uit de
 *    kern-opdracht `list_concrete_classes`; de statische lijst hieronder is
 *    de browser-fallback en moet daarmee overeenkomen.
 *  - De doorsnede moet een rechthoek b × h zijn, herkenbaar aan de
 *    profielnaam ("300x500", "300 x 500"). Dit model slaat geen numerieke
 *    doorsnede-eigenschappen per staaf op, dus de naam is de enige bron —
 *    geen naam-match betekent eerlijk overslaan.
 *  - De wapeningskorf komt NIET uit `beam` (dat veld bestaat daar nog niet)
 *    maar uit de map `korven` die de aanroeper meegeeft, gesleuteld op
 *    staaf-id. Een betonstaaf zonder korf wordt overgeslagen met reden: een
 *    stilzwijgend aangenomen standaardkorf zou een toetsuitkomst zonder
 *    invoer zijn. Zie `components/beton/` voor het korfmodel en de editor.
 *
 * Gedocumenteerde defaults: wapeningsstaal B500B; 50 stroken; horizontale
 * bovenste tak (3.2.7(2)b); blijvende/tijdelijke ontwerpsituatie; minimale
 * excentriciteit 6.1(4) aan.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { ConcreteBeamCheckInput } from "./types/concrete/ConcreteBeamCheckInput";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { SteelBranch } from "./types/concrete/SteelBranch";
import type { CheckSkip } from "./checkTypes";
import { isSteelProfile, beamLengthMm, buildForcesEnvelope } from "./steelCheckBuilder";

/**
 * Betonsterkteklassen die de Rust EN 1992-kern kent (nen-en-1992-1-1/data.rs,
 * tabel 3.1). Browser-fallback voor `list_concrete_classes`.
 */
export const SUPPORTED_CONCRETE_CLASSES = [
  "C12/15", "C16/20", "C20/25", "C25/30", "C30/37", "C35/45", "C40/50",
  "C45/55", "C50/60", "C55/67", "C60/75", "C70/85", "C80/95", "C90/105",
] as const;

/** Wapeningsstaal dat de kern kent (bijlage C, klasse A/B/C). */
export const SUPPORTED_REINFORCEMENT_GRADES = ["B500A", "B500B", "B500C"] as const;

/** Standaard wapeningsstaal voor staven in Nederland. */
export const DEFAULT_REINFORCEMENT_GRADE = "B500B";

/** Standaardaantal stroken (nen-en-1992-1-1/mnkappa.rs: DEFAULT_N_STRIPS). */
export const DEFAULT_N_STRIPS = 50;

/** Generieke betonnamen zonder sterkteklasse — niet toetsbaar. */
const GENERIC_CONCRETE_NAMES = ["concrete", "beton", "reinforced concrete", "gewapend beton"];

/**
 * Match een materiaalnaam op een ondersteunde betonsterkteklasse. "C30" en
 * "C30/37" leveren allebei "C30/37"; spaties en hoofdletters doen niet mee.
 */
export function matchSupportedConcreteClass(
  materialName: string | undefined,
  supportedClasses: readonly string[] = SUPPORTED_CONCRETE_CLASSES,
): string | null {
  if (!materialName) return null;
  const gezocht = materialName.replace(/\s/g, "").toLowerCase();
  if (!gezocht) return null;
  const hit = supportedClasses.find((c) => {
    const lang = c.toLowerCase();
    const kort = lang.split("/")[0];
    return lang === gezocht || kort === gezocht;
  });
  return hit ?? null;
}

/**
 * Herken een rechthoekige betondoorsnede b × h (mm) uit de profielnaam:
 * "300x500", "300 x 500", "300×500" (conventie: b×h).
 */
export function parseConcreteRectMm(
  profileName: string | undefined,
): { bMm: number; hMm: number } | null {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}

/** Per-staaf betoninstellingen zoals de aanroeper ze bijhoudt. */
export interface BetonStaafConfig {
  /** De wapeningskorf (dekking, beugel, boven- en onderwapening). */
  korf: ReinforcementCage;
  /** Wapeningsstaal; ontbreekt → B500B. */
  staalsoort?: string;
  /** Aantal stroken voor de integratie; ontbreekt → 50. */
  aantalStroken?: number;
  /** Bovenste tak van het staaldiagram; ontbreekt → horizontaal. */
  staaltak?: SteelBranch;
}

export interface BetonBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Wapeningskorf per staaf-id. Betonstaven zonder korf worden overgeslagen. */
  korven: Map<number, BetonStaafConfig>;
  /** Runtime-lijst uit `list_concrete_classes` (namen); leeg → statische fallback. */
  supportedClasses?: string[];
}

export interface BetonBuildResult {
  inputs: ConcreteBeamCheckInput[];
  /** Betonstaven die herkend maar niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

export function buildBetonCheckInputs(data: BetonBuildData): BetonBuildResult {
  const inputs: ConcreteBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];

  const klassen =
    data.supportedClasses && data.supportedClasses.length > 0
      ? data.supportedClasses
      : SUPPORTED_CONCRETE_CLASSES;

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");

  for (const beam of data.beams) {
    const materialName = beam.material?.trim() ?? "";
    const klasse = matchSupportedConcreteClass(materialName, klassen);

    if (!klasse) {
      // Wel beton, maar zonder sterkteklasse → expliciet melden. Al het
      // overige (staal, hout) is geen zaak van deze builder.
      if (GENERIC_CONCRETE_NAMES.includes(materialName.toLowerCase())) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse — kies bijv. C30/37`,
        });
      }
      continue;
    }

    if (isSteelProfile(beam.profile)) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName}" is beton maar profiel "${beam.profile}" is een staalprofiel — kies een rechthoek (bijv. "300x500") of een staalsoort`,
      });
      continue;
    }

    const rect = parseConcreteRectMm(beam.profile);
    if (!rect) {
      skipped.push({
        beamId: beam.id,
        reason: `doorsnede "${beam.profile ?? "—"}" is geen herkenbare rechthoek b×h — gebruik bijv. "300x500" als profielnaam`,
      });
      continue;
    }

    const cfg = data.korven.get(beam.id);
    if (!cfg) {
      skipped.push({
        beamId: beam.id,
        reason: "geen wapeningskorf opgegeven — vul dekking, beugel en hoofdwapening in bij de staafeigenschappen",
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

    inputs.push({
      beam_id: beam.id,
      width_mm: rect.bMm,
      height_mm: rect.hMm,
      concrete_class: klasse,
      reinforcement_grade: cfg.staalsoort ?? DEFAULT_REINFORCEMENT_GRADE,
      cage: cfg.korf,
      length_m: lengthMm / 1000,
      forces_envelope: buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults),
      n_strips: cfg.aantalStroken && cfg.aantalStroken > 0 ? Math.round(cfg.aantalStroken) : DEFAULT_N_STRIPS,
      steel_branch: cfg.staaltak ?? "Horizontal",
      design_situation: "PersistentTransient",
      apply_min_eccentricity: true,
    });
  }

  return { inputs, skipped };
}
