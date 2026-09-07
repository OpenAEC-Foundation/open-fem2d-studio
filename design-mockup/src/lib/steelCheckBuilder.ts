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
import type { Beam, BeamCheckConfig, Node, Support } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { BeamCheckInput } from "./types/steel/BeamCheckInput";
import type { DeflectionClass } from "./types/steel/DeflectionClass";
import type { ForcePoint } from "./types/steel/ForcePoint";
import type { SteelProfile } from "./types/steel/SteelProfile";
import type { CheckSkip } from "./checkTypes";
import {
  eigenNaamVan,
  isEigenProfiel,
  naarCustomSection,
  zoekEigenDoorsnede,
} from "./profieleditor/eigenDoorsnedenStore";

// ── Per-staaf toetsconfiguratie (Beam.checkConfig) ─────────────────────────
/** UI-doorbuigingsklasse → ts-rs/Rust-enum. Ontbreekt → "Floor". */
export function mapDeflectionClass(
  cls: BeamCheckConfig["deflectionClass"],
): DeflectionClass {
  switch (cls) {
    case "roof":         return "Roof";
    case "cantilever":   return "Cantilever";
    case "custom":       return "Custom";
    // Vloer die scheurgevoelige scheidingswanden draagt — NEN-EN
    // 1990:2002/NB:2019 A1.4.3(3), eerste gedachtestreepje (w2 + w3 ≤ ℓ_rep/500).
    case "floorBrittle": return "FloorBrittlePartitions";
    case "floor":
    default:             return "Floor";
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
  // Een eigen doorsnede uit de profieleditor is staal en gaat als
  // `custom_section` naar dezelfde kern.
  if (isEigenProfiel(profileName)) return true;
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

// ── Doorgeknipte staven ────────────────────────────────────────────────────
//
// Een ligger die door een tussenknoop in twee staven is geknipt, wordt hier per
// DEEL getoetst: eigen lengte, eigen koorde, eigen grenswaarde L/n. Ligt op die
// knoop een steunpunt, dan is dat juist — het zijn dan twee overspanningen.
// Ligt er géén steunpunt (de knoop is er alleen om een andere staaf aan te
// hangen, of omdat er is geknipt), dan is de fysieke overspanning langer dan
// elk van de delen en klopt de toetsing per deel niet: de koorde loopt dan van
// knip tot knip in plaats van van steunpunt tot steunpunt.
//
// Samenvoegen tot één staaf is binnen deze wijziging NIET gedaan. Het raakt
// niet alleen de doorbuiging maar ook de lengte die in de kniklengtes, de
// kipvelden en de krachtenomhullende zit; die als één geheel opnieuw opbouwen
// is een aparte ingreep. Wat hier wél gebeurt: het geval opsporen en het in het
// rapport zetten, zodat de lezer het ziet in plaats van dat het stilzwijgend
// per deel gaat.

/** Eenheidsrichting van een staaf, of `null` als de knopen ontbreken/samenvallen. */
function beamDirection(beam: Beam, nodes: Node[]): { x: number; z: number } | null {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  if (l <= 0) return null;
  return { x: dx / l, z: dz / l };
}

/**
 * Staaf-ids die in het verlengde van `beam` liggen: ze delen een knoop, lopen
 * in dezelfde richting (of exact tegengesteld), hebben hetzelfde profiel en
 * hetzelfde materiaal, en op die gedeelde knoop staat geen oplegging.
 *
 * De richtingstolerantie is 1e-6 op het uitwendig product van de
 * eenheidsrichtingen — dat is ~0,00006°, dus alleen echt collineaire staven.
 * Een portaal (ligger + kolom) valt daar ruim buiten en geeft dus geen melding.
 */
export function collinearContinuations(
  beam: Beam,
  nodes: Node[],
  beams: Beam[],
  supports: Support[] | undefined,
): number[] {
  const dir = beamDirection(beam, nodes);
  if (!dir) return [];
  const opgelegd = new Set((supports ?? []).map((s) => s.nodeId));
  const uit: number[] = [];
  for (const other of beams) {
    if (other.id === beam.id) continue;
    const gedeeld = [beam.from, beam.to].filter(
      (n) => n === other.from || n === other.to,
    );
    // Precies één gedeelde knoop: twee gedeelde knopen zou een dubbele staaf
    // zijn, en dat is een modelfout die de modelcontrole meldt, niet deze.
    if (gedeeld.length !== 1) continue;
    if (opgelegd.has(gedeeld[0])) continue;
    if ((other.profile ?? "") !== (beam.profile ?? "")) continue;
    if ((other.material ?? "") !== (beam.material ?? "")) continue;
    const d2 = beamDirection(other, nodes);
    if (!d2) continue;
    if (Math.abs(dir.x * d2.z - dir.z * d2.x) > 1e-6) continue;
    uit.push(other.id);
  }
  return uit.sort((a, b) => a - b);
}

/**
 * Toelichtingen bij de doorbuiging van één staaf, voor `deflection_notes`.
 * Altijd de referentielijn; daarnaast een waarschuwing zodra de staaf in het
 * verlengde doorloopt zonder tussensteunpunt.
 */
export function deflectionNotesFor(
  beam: Beam,
  nodes: Node[],
  beams: Beam[],
  supports: Support[] | undefined,
): string[] {
  const notes = [
    "w is gemeten vanaf de koorde tussen de verplaatste staafeinden: de starre " +
      "zakking en rotatie van de staaf zelf tellen niet mee, alleen de kromming " +
      "ertussen.",
  ];
  const vervolg = collinearContinuations(beam, nodes, beams, supports);
  if (vervolg.length > 0) {
    notes.push(
      `Deze staaf loopt in het verlengde door in staaf ${vervolg.join(", ")} ` +
        "(zelfde doorsnede en materiaal) zonder oplegging op de tussenknoop. De " +
        "doorbuiging is per staafdeel getoetst, dus over de koorde van dit deel " +
        "en tegen L/n van dit deel — niet over de volledige overspanning. Voor " +
        "een doorgaande ligger onderschat dat de veldzakking; beoordeel de " +
        "overspanning als geheel." +
        (supports === undefined
          ? " (De opleggingen zijn niet meegegeven aan de toetsbouwer, dus een " +
            "tussensteunpunt kan hier niet zijn uitgesloten.)"
          : ""),
    );
  }
  return notes;
}

export interface SteelBuildData {
  nodes: Node[];
  beams: Beam[];
  /**
   * Opleggingen, om een echt tussensteunpunt te onderscheiden van een knoop
   * waar een ligger alleen is doorgeknipt. Ontbreekt de lijst, dan kan dat
   * onderscheid niet worden gemaakt en zegt de notitie in het rapport dat ook.
   */
  supports?: Support[];
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
 * Maatgevende doorbuiging van een staaf (mm, MET teken) uit een SolverResult:
 * het veldmaximum van max |w(x) − koorde(x)| over de 21 stations, met het
 * teken van de maatgevende stationswaarde behouden.
 *
 * VANAF DE KOORDE, NIET ABSOLUUT. `ElementForces.deflection[]` is de volledige
 * transversale verplaatsing in lokale assen: het Hermite-deel op de eind-DOF's
 * plus de particuliere oplossing van de elementbelasting. Daar zit dus ook de
 * STARRE beweging van de staaf in — de zakking en de rotatie van de twee
 * staafeinden zelf. Zodra een staafeind meebeweegt (een doorgaande ligger, een
 * portaal, elke staaf die niet op twee onwrikbare opleggingen ligt) telde die
 * starre beweging tot september 2026 mee als doorbuiging. Gemeten op een
 * referentiegeval liep dat op tot +121 %, met als gevolg dat een staaf ten
 * onrechte "voldoet niet" meldde (UC 1,04 waar de bron 0,55 geeft).
 *
 * De doorbuiging hoort te worden gemeten vanaf de KOORDE: de rechte lijn
 * tussen de twee VERPLAATSTE staafeinden. Omdat `deflection[0]` en
 * `deflection[n−1]` per definitie de transversale verplaatsingen van die twee
 * einden zijn, is de koorde precies hun lineaire interpolatie — er is geen
 * extra solveruitvoer voor nodig. Het aftrekken gebeurt in de LOKALE
 * transversale richting (loodrecht op de staafas), dus het klopt net zo goed
 * voor een kolom of een schuine staaf als voor een horizontale ligger.
 *
 * Voor een vrij opgelegde ligger op twee onwrikbare steunpunten is de koorde
 * nul en verandert er niets — daar was de oude uitkomst al goed.
 *
 * Tekenkeuze — afgestemd op wat de Rust-kern verwacht (steel-check
 * `input.deflection_actual_max_mm` en timber `input.deflection_inst_mm`:
 * "mm, negatief = omlaag"; de UC gebruikt |w|, maar het teken telt in de
 * verrekening met zeeg en blijvend deel, w_fin = w_z − w_zeeg): w(x) staat
 * in LOKALE assen (+y = 90° CCW vanaf de staafas, zie solver/types.ts),
 * dus voor een horizontale staaf is doorhangen negatief — precies de
 * kern-conventie.
 *
 * Fallback: ontbreken de station-arrays (resultaat van vóór de
 * veldzakking-uitbreiding), dan het knooppad met een console.warn. Dat pad
 * levert een ABSOLUTE verplaatsing en géén koorde-relatieve doorbuiging; het
 * kan er dus zowel naast zitten als de veldzakking missen.
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
        `solverresultaat (ouder resultaat?) — val terug op knoopverplaatsingen. ` +
        `Dat is de ABSOLUTE verplaatsing van een staafeind, niet de doorbuiging ` +
        `vanaf de koorde: de veldzakking kan zowel onderschat als overschat ` +
        `worden. Reken het model opnieuw door.`,
    );
    return nodalDeflectionMm(beam, result);
  }
  return chordRelativeMaxMm(stations, ef.stations_mm);
}

/**
 * max |w(x) − koorde(x)| over de stations, teken behouden.
 *
 * De koorde loopt van `w[0]` naar `w[n−1]`, lineair in x. `stationsMm` mag
 * ontbreken of een andere lengte hebben — dan wordt de index als parameter
 * gebruikt, wat op het vaste 21-stationsraster op hetzelfde neerkomt.
 */
export function chordRelativeMaxMm(
  w: number[],
  stationsMm?: number[],
): number {
  const n = w.length;
  if (n === 0) return 0;
  const wStart = w[0];
  const wEnd = w[n - 1];
  // Zijn de eindwaarden onbruikbaar, dan is er geen koorde te trekken. Niet
  // stilzwijgend op nul zetten: dan zou de toets een zakking van 0 melden.
  const koordeBruikbaar = Number.isFinite(wStart) && Number.isFinite(wEnd);
  const xOk =
    Array.isArray(stationsMm) &&
    stationsMm.length === n &&
    Number.isFinite(stationsMm[0]) &&
    Number.isFinite(stationsMm[n - 1]) &&
    stationsMm[n - 1] !== stationsMm[0];
  const x0 = xOk ? stationsMm![0] : 0;
  const span = xOk ? stationsMm![n - 1] - x0 : n - 1;

  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i];
    if (!Number.isFinite(v)) continue;
    let d = v;
    if (koordeBruikbaar && span !== 0) {
      const t = xOk ? (stationsMm![i] - x0) / span : i / span;
      d = v - (wStart + t * (wEnd - wStart));
    }
    if (Math.abs(d) > Math.abs(max)) max = d;
  }
  return max;
}

/**
 * Equivalente gelijkmatig verdeelde belasting uit de momentenlijn (N/mm),
 * voor B* volgens NB.NB.4.3(3). Zelfde afleiding als de oude frontend:
 * pijl van de momentenparabool t.o.v. de koorde → q = 8·pijl/L².
 *
 * De teruggegeven waarde is de GROOTTE van die belasting, altijd ≥ 0.
 * `nb_annex::b_ster` rekent B* = 8·M/(8·|M| + q·L_st²): het teken van de
 * momentenlijn zit al in de teller M, en q hoort daar als positieve
 * lastgrootte in de noemer te staan.
 *
 * Vóór september 2026 stond hier `Math.max(0, …)`. Bij een hogging
 * momentenlijn (windzuiging) is de pijl negatief, en die werd dan op nul
 * geklemd. B* kwam daarmee op ±1 uit — "uitsluitend eindmomenten" — terwijl er
 * gewoon veldbelasting was. C₁ viel daardoor te hoog uit en M_cr mee. De
 * absolute waarde herstelt dat: dezelfde belasting, gespiegelde momentenlijn,
 * dezelfde B*-noemer.
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
  return Math.abs(qKnPerM);
}

/**
 * Bouw BeamCheckInput[] voor alle staven met een staalprofiel.
 *
 * Per-staaf toetsconfiguratie komt uit `beam.checkConfig` (ingesteld via de
 * EN 1993-tab van het staaf-eigenschappenvenster). Gedocumenteerde defaults
 * voor ontbrekende velden:
 *  - kniklengte = systeemlengte om beide assen; geen kipsteunen;
 *  - doorbuigingsklasse "vloer", w_fin op L/333 en w_add op de NB-waarde bij
 *    die klasse (3/1 000 · ℓ_rep, NEN-EN 1990:2002/NB:2019 A1.4.3(3), tweede
 *    gedachtestreepje); geen zeeg;
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
    // GEEN terugval op "HEA160" meer. Een staaf zonder profiel werd hier
    // stilzwijgend als HEA 160 getoetst — met een unity check die niets met
    // die staaf te maken had. Zo'n staaf valt nu door naar de eindcontrole in
    // de check-store en komt met reden bij de overgeslagen staven te staan.
    const profileName = beam.profile ?? "";
    if (!isSteelProfile(profileName)) continue; // geen staal — niet onze zaak

    // Eigen doorsnede uit de profieleditor: de motor heeft de eigenschappen
    // al bepaald en die gaan als `custom_section` mee — de kern slaat de
    // profieldatabase dan over. Een naam die niet (meer) bewaard is, is een
    // fout in het model en wordt gemeld, niet stil vervangen.
    const eigen = isEigenProfiel(profileName) ? zoekEigenDoorsnede(profileName) : undefined;
    if (isEigenProfiel(profileName) && !eigen) {
      skipped.push({
        beamId: beam.id,
        reason: `eigen doorsnede "${eigenNaamVan(profileName)}" is niet (meer) bewaard — open de profieleditor en bewaar hem opnieuw`,
      });
      continue;
    }
    const profile = eigen ? undefined : data.profileDb.get(profileLookupKey(profileName));
    if (!eigen && !profile) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${profileName}" is niet bekend in de EN 1993-profieldatabase`,
      });
      continue;
    }
    // Hoogte voor het aangrijpingspunt van de last (z_a = +h/2, zie onder).
    // Eén van beide bestaat na de controles hierboven.
    const hMm = eigen ? eigen.motor.z_max_mm - eigen.motor.z_min_mm : profile!.geometry.h;

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
      profile_name: eigen ? eigen.naam : profileName,
      ...(eigen ? { custom_section: naarCustomSection(eigen) } : {}),
      steel_grade: grade.toUpperCase(),
      length_m: lengthMm / 1000,
      forces_envelope: forcesEnvelope,
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraintsBottom),
      },
      buckling_length_y_m: cfg.bucklingLengthY_m ?? lengthMm / 1000,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? lengthMm / 1000,
      deflection_limit_class: mapDeflectionClass(cfg.deflectionClass),
      // De Rust-kern gebruikt de noemer alleen bij klasse "Custom"
      // (deflection.rs::default_numerator); anders geldt de klassenoemer.
      deflection_limit_numerator:
        cfg.deflectionClass === "custom" ? (cfg.deflectionLimitNumerator ?? 333) : 333,
      // Noemer voor de BIJKOMENDE doorbuiging w_add. 0 = de kern leidt hem af
      // uit de klasse volgens NEN-EN 1990:2002/NB:2019 A1.4.3(3); dat is de
      // normale gang van zaken. Een getal hier overschrijft die klassewaarde
      // en is alleen bedoeld om een externe referentie-uitwerking met een
      // vaste noemer (bijvoorbeeld L/150) na te rekenen.
      deflection_add_limit_numerator: cfg.deflectionAddLimitNumerator ?? 0,
      // Waar de doorbuiging vandaan komt en wat er bij is aangenomen — zie
      // `deflectionNotesFor`. Landt in de notes van de w_fin-regel.
      deflection_notes: deflectionNotesFor(beam, data.nodes, data.beams, data.supports),
      // Veldmaximum over de 21 stations, mm met teken (negatief = omlaag).
      deflection_actual_max_mm: extractFieldDeflectionMm(beam, slsResult),
      is_cantilever: cfg.deflectionClass === "cantilever",
      consequence_class: "CC1",
      pre_camber_mm: cfg.preCamber_mm ?? 0,
      // Blijvend BGT-deel is (nog) niet apart op te lossen → 0 betekent
      // w_add = w_fin, de zwaarste van de twee toetsen (veilig-zijdig).
      deflection_permanent_mm: 0,
      q_equiv_n_per_mm: equivalentUdlFromMoments(govPoints, lengthMm),
      // AANNAME, bewust niet meegenomen in de kipreparatie van sept 2026:
      // de last grijpt aan op de bovenflens, z_a = +h/2. `c2_gecorrigeerd`
      // maakt daar een negatieve C₂ van, wat M_cr verlaagt — veilig-zijdig, en
      // dat blijft zo ongeacht welke flens gedrukt is. Bij hogging (gedrukte
      // ONDERflens) grijpt een neerwaartse last echter aan op de GETROKKEN
      // flens en werkt hij in werkelijkheid stabiliserend; de aanname is daar
      // dus conservatief in plaats van juist. Het echte aangrijpingspunt is nu
      // niet bekend in de invoer; dit hoort een expliciet veld te worden.
      z_a_mm: hMm / 2,
    });
  }

  return { inputs, skipped };
}
