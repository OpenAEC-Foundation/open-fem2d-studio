/**
 * steelCheckBuilder.ts — bouwt BeamCheckInput[] voor het Tauri-command
 * `check_steel_beams` uit het design-mockup datamodel.
 *
 * Datamodel van deze app (anders dan de oude frontend):
 *  - Staven zijn `Beam { id, from, to, material?, profile? }` — profiel en
 *    materiaal zijn NAMEN (bijv. "HEA160", "S235"), geen objecten.
 *  - Het krachtsverloop komt uit de eigen TS-solver via `combinationResults`:
 *    per belastingcombinatie een SolverResult met per staaf 21 stations
 *    (stations_mm, normalForce [N], shearForce [N], bendingMoment [N·mm]).
 *  - We voeden de Rust-kern met de VOLLEDIGE UGT-envelop: de stations van
 *    álle UGT-combinaties, elk getagd met hun combination_id. De Rust-
 *    orchestrator kiest daar zelf het maatgevende punt per toets uit.
 *  - De doorbuigingstoets gebruikt de karakteristieke BGT-combinatie.
 *
 * Eerlijkheidsregel: staven die niet toetsbaar zijn worden overgeslagen met
 * een expliciete reden (zichtbaar in het toetsingspaneel) — geen stille
 * aannames.
 */
import type { Beam, BeamCheckConfig, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { BeamCheckInput } from "./types/steel/BeamCheckInput";
import type { DeflectionClass } from "./types/steel/DeflectionClass";
import type { ForcePoint } from "./types/steel/ForcePoint";
import type { SteelProfile } from "./types/steel/SteelProfile";
import type { CheckSkip } from "./checkTypes";

// ── Per-staaf toetsconfiguratie (Beam.checkConfig) ─────────────────────────
/** UI-doorbuigingsklasse → ts-rs/Rust-enum. Ontbreekt → "Floor". */
export function mapDeflectionClass(
  cls: BeamCheckConfig["deflectionClass"],
): DeflectionClass {
  switch (cls) {
    case "roof":       return "Roof";
    case "cantilever": return "Cantilever";
    case "custom":     return "Custom";
    case "floor":
    default:           return "Floor";
  }
}

/**
 * Kipsteunfracties opschonen voor LateralBracing.top_flange_positions:
 * alleen 0 < f < 1 (de uiteinden zelf zijn geen kipsteun), gesorteerd en
 * ontdubbeld — de Rust-kern (lambda_chi.rs) vermenigvuldigt de fracties
 * met de staaflengte.
 */
export function sanitizeRestraintFractions(fractions: number[] | undefined): number[] {
  if (!Array.isArray(fractions)) return [];
  return [...new Set(fractions.filter((f) => Number.isFinite(f) && f > 0 && f < 1))]
    .sort((a, b) => a - b);
}

/** Profielprefixen die de Rust steel-profiles DB kent. */
const STEEL_PROFILE_PREFIXES = [
  "HEA", "HEB", "HEM", "IPE", "UPE", "UNP",
  "RHS", "SHS", "HFRHS", "KKR", "CHS",
];

/** Staalsoorten die de Rust-kern kent (list_steel_grades). */
const STEEL_GRADES = ["S235", "S275", "S355", "S420", "S460"];

export function isSteelProfile(profileName: string | undefined): boolean {
  if (!profileName) return false;
  const upper = profileName.toUpperCase();
  return STEEL_PROFILE_PREFIXES.some((p) => upper.startsWith(p));
}

/**
 * Zoeksleutel voor profielnamen — spiegel van `lookup_key` in de Rust
 * steel-profiles crate: spaties/koppeltekens/punten eruit, hoofdletters.
 * Zo matcht "HEA160" uit dit model op "HEA 160" in de database.
 */
export function profileLookupKey(name: string): string {
  return name.replace(/[\s\-.]/g, "").toUpperCase();
}

export interface SteelBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  /** Combinatieresultaten uit de laatste solver-run (per combinatie-id). */
  combinationResults: Map<number, SolverResult>;
  /**
   * Rust-profieldatabase (via list_steel_profiles), keyed op
   * profileLookupKey(name). Gebruikt voor z_a (= h/2) en om profielen die
   * de kern niet kent eerlijk over te slaan.
   */
  profileDb: Map<string, SteelProfile>;
}

export interface SteelBuildResult {
  inputs: BeamCheckInput[];
  /** Staalstaven die niet toetsbaar zijn, met expliciete reden. */
  skipped: CheckSkip[];
}

/** Staaflengte in mm uit de knoopcoördinaten. */
export function beamLengthMm(beam: Beam, nodes: Node[]): number {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Krachtsverloop van één staaf voor één combinatie → ForcePoint[].
 * Eenheden: solver levert N / N·mm; het EN-contract wil kN / kN·m.
 * 2D-solver: n_ed=N, vz_ed=V, my_ed=M; vy/mt/mz = 0.
 */
function forcePointsForCombination(
  beamId: number,
  comboId: number,
  result: SolverResult,
): ForcePoint[] {
  const ef = result.elements.get(beamId);
  if (!ef || ef.stations_mm.length === 0) return [];
  const pts: ForcePoint[] = [];
  for (let i = 0; i < ef.stations_mm.length; i++) {
    pts.push({
      combination_id: comboId,
      position_mm: ef.stations_mm[i],
      forces: {
        n_ed: (ef.normalForce[i] ?? 0) / 1000,        // N → kN
        vy_ed: 0,
        vz_ed: (ef.shearForce[i] ?? 0) / 1000,        // N → kN
        mt_ed: 0,
        my_ed: (ef.bendingMoment[i] ?? 0) / 1e6,      // N·mm → kN·m
        mz_ed: 0,
      },
    });
  }
  return pts;
}

/**
 * UGT-envelop van één staaf: stations van alle UGT-combinaties achter
 * elkaar, elk getagd met de combinatie-id. Levert altijd ≥ 1 punt zodat de
 * Rust-orchestrator niet op een lege envelop hoeft te rekenen.
 */
export function buildForcesEnvelope(
  beamId: number,
  ulsCombinations: LoadCombination[],
  combinationResults: Map<number, SolverResult>,
): ForcePoint[] {
  const env: ForcePoint[] = [];
  for (const combo of ulsCombinations) {
    const res = combinationResults.get(combo.id);
    if (!res) continue;
    env.push(...forcePointsForCombination(beamId, combo.id, res));
  }
  if (env.length === 0) {
    env.push({
      combination_id: ulsCombinations[0]?.id ?? 1,
      position_mm: 0,
      forces: { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: 0, mz_ed: 0 },
    });
  }
  return env;
}

/**
 * Knoop-gebaseerd fallback-pad: de uz van de eindknoop met de grootste
 * |uz|, MET teken (negatief = omlaag). Ziet de veldzakking tussen de
 * knopen niet — alleen te gebruiken als de station-arrays ontbreken.
 */
function nodalDeflectionMm(beam: Beam, result: SolverResult): number {
  let w = 0;
  for (const nid of [beam.from, beam.to]) {
    const d = result.displacements.get(nid);
    if (d && Math.abs(d.uz) > Math.abs(w)) w = d.uz;
  }
  return w;
}

/**
 * Maatgevende zakking van een staaf (mm, MET teken) uit een SolverResult:
 * het veldmaximum max |w(x)| over de 21 stations van de staaf, met het
 * teken van de maatgevende stationswaarde behouden.
 *
 * Tekenkeuze — afgestemd op wat de Rust-kern verwacht (steel-check
 * `input.deflection_actual_max_mm` en timber `input.deflection_inst_mm`:
 * "mm, negatief = omlaag"; de UC gebruikt |w|, maar het teken telt in de
 * verrekening met zeeg en blijvend deel, w_fin = w_z − w_zeeg): w(x) staat
 * in LOKALE assen (+y = 90° CCW vanaf de staafas, zie solver/types.ts),
 * dus voor een horizontale staaf is doorhangen negatief — precies de
 * kern-conventie. Voor kolommen is w de transversale uitbuiging (de juiste
 * grootheid voor deze toets); axiale verkorting telt niet meer mee zoals
 * bij het oude knooppad.
 *
 * Fallback: ontbreken de station-arrays (resultaat van vóór de
 * veldzakking-uitbreiding), dan het knooppad met een console.warn — de
 * veldzakking kan dan onderschat zijn.
 */
export function extractFieldDeflectionMm(
  beam: Beam,
  result: SolverResult | null,
): number {
  if (!result) return 0;
  const ef = result.elements.get(beam.id);
  const stations = ef?.deflection;
  if (!ef || !Array.isArray(stations) || stations.length === 0) {
    console.warn(
      `[doorbuigingstoets] staaf ${beam.id}: geen station-zakkingen in het ` +
        `solverresultaat (ouder resultaat?) — val terug op knoopverplaatsingen; ` +
        `de veldzakking kan hierdoor onderschat zijn. Reken het model opnieuw door.`,
    );
    return nodalDeflectionMm(beam, result);
  }
  let w = 0;
  for (const v of stations) {
    if (Number.isFinite(v) && Math.abs(v) > Math.abs(w)) w = v;
  }
  return w;
}

/**
 * Equivalente gelijkmatig verdeelde belasting uit de momentenlijn (N/mm),
 * voor B* volgens NB.NB.4.3(3). Zelfde afleiding als de oude frontend:
 * pijl van de momentenparabool t.o.v. de koorde → q = 8·pijl/L².
 */
export function equivalentUdlFromMoments(env: ForcePoint[], lengthMm: number): number {
  if (env.length < 3 || lengthMm <= 0) return 0;
  const sorted = [...env].sort((a, b) => a.position_mm - b.position_mm);
  const mStart = sorted[0].forces.my_ed;
  const mEnd = sorted[sorted.length - 1].forces.my_ed;

  const mid = lengthMm / 2;
  let best = sorted[0];
  for (const p of sorted) {
    if (Math.abs(p.position_mm - mid) < Math.abs(best.position_mm - mid)) best = p;
  }

  const pijlKnm = best.forces.my_ed - (mStart + mEnd) / 2; // kNm
  const qKnPerM = (8 * pijlKnm) / Math.pow(lengthMm / 1000, 2); // kN/m ≡ N/mm
  return Math.max(0, qKnPerM);
}

/**
 * Bouw BeamCheckInput[] voor alle staven met een staalprofiel.
 *
 * Per-staaf toetsconfiguratie komt uit `beam.checkConfig` (ingesteld via de
 * EN 1993-tab van het staaf-eigenschappenvenster). Gedocumenteerde defaults
 * voor ontbrekende velden:
 *  - kniklengte = systeemlengte om beide assen; geen kipsteunen;
 *  - doorbuigingsklasse "vloer", limiet L/333; geen zeeg;
 *  - gevolgklasse CC1; last grijpt aan op de bovenflens (z_a = h/2,
 *    destabiliserend = veilig-zijdig);
 *  - blijvende BGT-zakking onbekend → 0, dus w_add = w_fin (veilig-zijdig).
 */
export function buildSteelCheckInputs(data: SteelBuildData): SteelBuildResult {
  const inputs: BeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  // Karakteristieke BGT-combinatie voor de doorbuigingstoets.
  const slsChar =
    slsCombos.find((c) => /karakter/i.test(c.name)) ?? slsCombos[0] ?? null;
  const slsResult = slsChar ? data.combinationResults.get(slsChar.id) ?? null : null;

  for (const beam of data.beams) {
    const profileName = beam.profile ?? "HEA160";
    if (!isSteelProfile(profileName)) continue; // geen staal — niet onze zaak

    const profile = data.profileDb.get(profileLookupKey(profileName));
    if (!profile) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${profileName}" is niet bekend in de EN 1993-profieldatabase`,
      });
      continue;
    }

    const grade = beam.material ?? "S235";
    if (!STEEL_GRADES.includes(grade.toUpperCase())) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${grade}" is geen ondersteunde staalsoort (S235–S460) — staaf heeft een staalprofiel maar geen staalmateriaal`,
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

    // Maatgevende combinatie voor het kipveld: die met de grootste |My|.
    let govComboId = forcesEnvelope[0].combination_id;
    let govAbsMy = 0;
    for (const p of forcesEnvelope) {
      if (Math.abs(p.forces.my_ed) > govAbsMy) {
        govAbsMy = Math.abs(p.forces.my_ed);
        govComboId = p.combination_id;
      }
    }
    const govPoints = forcesEnvelope.filter((p) => p.combination_id === govComboId);

    // Per-staaf toetsconfiguratie; ontbrekende velden → defaults hierboven.
    const cfg = beam.checkConfig ?? {};

    inputs.push({
      beam_id: beam.id,
      profile_name: profileName,
      steel_grade: grade.toUpperCase(),
      length_m: lengthMm / 1000,
      forces_envelope: forcesEnvelope,
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: [],
      },
      buckling_length_y_m: cfg.bucklingLengthY_m ?? lengthMm / 1000,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? lengthMm / 1000,
      deflection_limit_class: mapDeflectionClass(cfg.deflectionClass),
      // De Rust-kern gebruikt de noemer alleen bij klasse "Custom"
      // (deflection.rs::default_numerator); anders geldt de klassenoemer.
      deflection_limit_numerator:
        cfg.deflectionClass === "custom" ? (cfg.deflectionLimitNumerator ?? 333) : 333,
      // Veldmaximum over de 21 stations, mm met teken (negatief = omlaag).
      deflection_actual_max_mm: extractFieldDeflectionMm(beam, slsResult),
      is_cantilever: cfg.deflectionClass === "cantilever",
      consequence_class: "CC1",
      pre_camber_mm: cfg.preCamber_mm ?? 0,
      // Blijvend BGT-deel is (nog) niet apart op te lossen → 0 betekent
      // w_add = w_fin, de zwaarste van de twee toetsen (veilig-zijdig).
      deflection_permanent_mm: 0,
      q_equiv_n_per_mm: equivalentUdlFromMoments(govPoints, lengthMm),
      // Last op de bovenflens aangenomen: destabiliserend, dus conservatief.
      z_a_mm: profile.geometry.h / 2,
    });
  }

  return { inputs, skipped };
}
