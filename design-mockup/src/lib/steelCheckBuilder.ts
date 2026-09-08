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
 *  - De doorbuigingstoets kiest zijn eigen eis én zijn eigen BGT-combinatie
 *    per staaf; zie het blok bij `bepaalDoorbuigingsInvoer`.
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

// ═══════════════════════════════════════════════════════════════════════════
//  Doorbuiging (BGT): welke eis geldt voor deze staaf, en met welke zakking
// ═══════════════════════════════════════════════════════════════════════════
//
// WAT DE NORM ZEGT — NEN-EN 1990:2002+A1:2019/NB:2019, A1.4.3.
//
//  * A1.4.3(3) begrenst w2 + w3 (de doorbuiging bovenop het deel dat de
//    blijvende belasting al veroorzaakt) en kent vier gedachtestreepjes. Alle
//    vier hebben een VLOER, een DAK of een VLOERAFSCHEIDING als onderwerp:
//    "vloeren die scheurgevoelige scheidingswanden dragen", "overige vloeren
//    en daken die intensief door personen worden gebruikt", "overige daken",
//    "vloerafscheidingen ter plaatse van een hoogteverschil". Bij elk streepje
//    hoort een belastingscombinatie: de FREQUENTE (6.15b) bij de eerste twee,
//    de KARAKTERISTIEKE (6.14b) bij de overige daken.
//  * A1.4.3(4) begrenst w_max "bij zowel vloeren als daken" tot 1/250 deel van
//    ℓ_rep en schrijft daarvoor de QUASI-BLIJVENDE combinatie (6.16b) voor.
//  * A1.4.3(7) gaat over de HORIZONTALE verplaatsing — figuur A1.2: u over de
//    gebouwhoogte H, u_i over de bouwlaaghoogte H_i. De NB geeft daar wél
//    grenswaarden bij, alle bij de KARAKTERISTIEKE combinatie (6.14b): bij één
//    bouwlaag h/150 voor industriegebouwen en h/300 voor andere gebouwen, bij
//    meer bouwlagen h/300 per bouwlaag en h/500 voor het gehele gebouw,
//    "waarin h is de kleinste gevelhoogte of de kleinste bouwlaaghoogte".
//
// WAAROM EEN KOLOM EEN ANDERE EIS KRIJGT
// Tot september 2026 kreeg élke stalen staaf onvoorwaardelijk de vloer-/dakeis
// van A1.4.3(3)/(4). In het startmodel was dat de MAATGEVENDE toets van beide
// portaalkolommen: 21,4 mm tegen 3/1 000 · 5 000 = 15 mm, unity check 1,43,
// met in het rapport de zin "overige vloeren en daken die intensief door
// personen worden gebruikt" onder een kolom. Een kolom is geen vloer en geen
// dak; die grenswaarden gelden daar niet.
//
// GEKOZEN: voor een overwegend VERTICALE staaf wordt de vloer-/dakeis
// vervangen door de zijdelingse eis van A1.4.3(7), want daar geeft de norm
// wél een grenswaarde (h/300). Getoetst wordt dan ook de grootheid die dat
// artikel noemt: de horizontale verplaatsing over de hoogte van de staaf,
// u = u_x(boven) − u_x(onder), bij de karakteristieke combinatie. Er is geen
// getal verzonnen — h/300 staat letterlijk in de NB.
//
// NIET GEKOZEN, en waarom:
//  * "bij een kolom niets melden" kan deze bouwer niet afdwingen. De rekenkern
//    zet de twee doorbuigingsregels altijd neer (steel-check orchestrator,
//    stap 9) en kent voor die toets geen "niet van toepassing"-pad. De enige
//    knoppen die de bouwer heeft zijn de klasse, de twee noemers en de
//    verplaatsing zelf.
//  * De doorbuiging van de kolom tussen zijn eigen einden (de kromming vanaf
//    de koorde, 21,4 mm in het startmodel) tegen een zelfbedachte grens
//    houden. A1.4.3 geeft voor die grootheid bij een verticale staaf geen
//    grenswaarde; dan is "deze eis geldt hier niet" het eerlijke antwoord.
//
// De gebruiker houdt het laatste woord: kiest hij bij de staaf expliciet een
// doorbuigingsklasse, dan geldt die klasse en vervalt de zijdelingse toets.

/** Hoek van een staaf met de horizontaal, 0°..90°. `null` = geen richting. */
export function hellingGradenVanStaaf(beam: Beam, nodes: Node[]): number | null {
  const d = beamDirection(beam, nodes);
  if (!d) return null;
  return (Math.atan2(Math.abs(d.z), Math.abs(d.x)) * 180) / Math.PI;
}

/**
 * Vanaf welke hellingshoek een staaf "overwegend verticaal" heet.
 *
 * 75° is dezelfde grens die `bepaalStandaardRol` (femTypes.ts) al hanteert om
 * een gevelstijl of kolom van een ligger te onderscheiden. Twee verschillende
 * drempels in één app zou betekenen dat dezelfde staaf in de staaftypentabel
 * een kolom is en in de doorbuigingstoets niet.
 */
export const VERTICAAL_VANAF_GRADEN = 75;

export function isOverwegendVerticaal(beam: Beam, nodes: Node[]): boolean {
  const helling = hellingGradenVanStaaf(beam, nodes);
  return helling !== null && helling >= VERTICAAL_VANAF_GRADEN;
}

/**
 * Horizontale verplaatsing over de hoogte van een staaf: u_x van de bovenste
 * knoop min u_x van de onderste (mm, teken behouden). Dat is de grootheid u_i
 * uit figuur A1.2 bij NEN-EN 1990 A1.4.3(7) voor een staaf die één
 * bouwlaaghoogte overspant.
 *
 * `null` als de knopen of hun verplaatsingen ontbreken — dan is er niets te
 * toetsen en zegt de notitie dat, in plaats van dat er een 0 in het rapport
 * belandt die als getoetste verplaatsing leest.
 */
export function zijdelingseVerplaatsingMm(
  beam: Beam,
  nodes: Node[],
  result: SolverResult | null,
): number | null {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b || !result) return null;
  const boven = a.z >= b.z ? a : b;
  const onder = a.z >= b.z ? b : a;
  const dBoven = result.displacements.get(boven.id);
  const dOnder = result.displacements.get(onder.id);
  if (!dBoven || !dOnder) return null;
  return dBoven.ux - dOnder.ux;
}

/**
 * De drie BGT-combinaties die A1.4.3 aanwijst, herkend aan hun naam — zelfde
 * werkwijze als de houtbouwer voor de quasi-blijvende combinatie hanteert.
 * De volgorde is die van de uitdrukkingen zelf.
 */
const BGT_NORMCOMBINATIES: { sleutel: RegExp; uitdrukking: string }[] = [
  { sleutel: /karakter/i, uitdrukking: "6.14b" },
  { sleutel: /frequent/i, uitdrukking: "6.15b" },
  { sleutel: /quasi/i, uitdrukking: "6.16b" },
];

/** Getal met een decimale komma, zoals de rest van het rapport het toont. */
function nl(x: number, cijfers = 1): string {
  return x.toFixed(cijfers).replace(".", ",");
}

/** Welke combinatie A1.4.3(3) bij deze klasse aanwijst, als zin voor het rapport. */
function wAddCombinatieVanKlasse(klasse: DeflectionClass): string {
  switch (klasse) {
    case "FloorBrittlePartitions":
      return "de FREQUENTE belastingscombinatie (uitdrukking 6.15b), A1.4.3(3) eerste gedachtestreepje";
    case "Roof":
      return "de KARAKTERISTIEKE belastingscombinatie (uitdrukking 6.14b), A1.4.3(3) derde gedachtestreepje";
    case "Custom":
      return 'de combinatie die hoort bij de categorie waarvoor de opgegeven noemer is gekozen — de klasse "aangepast" wijst zelf geen NB-categorie aan';
    default:
      return "de FREQUENTE belastingscombinatie (uitdrukking 6.15b), A1.4.3(3) tweede gedachtestreepje";
  }
}

/** Alles wat de doorbuigingstoets van één staaf nodig heeft, plus de verantwoording. */
export interface DoorbuigingsInvoer {
  klasse: DeflectionClass;
  /** Noemer n voor w_fin — geheel getal, want de kern leest hem als u32. */
  noemerFin: number;
  /** Noemer n voor w_add; 0 = de kern leidt hem uit de klasse af. */
  noemerAdd: number;
  /** De getoetste verplaatsing in mm, teken behouden. */
  wMm: number;
  isUitkraging: boolean;
  /** Welke eis is toegepast: A1.4.3(3)/(4) of A1.4.3(7). */
  eis: "vloerdak" | "zijdelings";
  /** Regels voor `deflection_notes`; belanden letterlijk in het rapport. */
  notes: string[];
}

/**
 * De doorbuigingsinvoer van één staaf: welke eis, welke verplaatsing, welke
 * grens. Losse functie zodat de testbatterij hem zonder profieldatabase en
 * zonder rekenkern kan aanroepen.
 */
export function bepaalDoorbuigingsInvoer(
  beam: Beam,
  data: Pick<
    SteelBuildData,
    "nodes" | "beams" | "supports" | "combinations" | "combinationResults"
  >,
): DoorbuigingsInvoer {
  const cfg = beam.checkConfig ?? {};
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const karakteristiek =
    slsCombos.find((c) => /karakter/i.test(c.name)) ?? slsCombos[0] ?? null;

  // Een expliciete klassekeuze van de gebruiker gaat vóór: wie bij een
  // verticale staaf tóch een vloer- of dakeis wil toetsen kan dat afdwingen.
  if (cfg.deflectionClass === undefined && isOverwegendVerticaal(beam, data.nodes)) {
    return zijdelingseEis(beam, data, karakteristiek);
  }
  return vloerDakEis(beam, data, slsCombos);
}

/** A1.4.3(7): horizontale verplaatsing over de hoogte, grens h/300. */
function zijdelingseEis(
  beam: Beam,
  data: Pick<SteelBuildData, "nodes" | "combinationResults">,
  karakteristiek: LoadCombination | null,
): DoorbuigingsInvoer {
  const a = data.nodes.find((n) => n.id === beam.from);
  const b = data.nodes.find((n) => n.id === beam.to);
  const lengteMm = beamLengthMm(beam, data.nodes);
  const hoogteMm = a && b ? Math.abs(b.z - a.z) : 0;
  const helling = hellingGradenVanStaaf(beam, data.nodes) ?? 90;

  // De NB begrenst h/300 op de HOOGTE h, terwijl de kern L/n op de
  // STAAFLENGTE rekent. n = 300 · L/h maakt L/n weer gelijk aan h/300. Naar
  // boven afronden omdat de kern voor w_fin een geheel getal leest, én omdat
  // een grotere noemer de strenge kant is: L/n wordt daarmee hoogstens h/300.
  const noemer = hoogteMm > 0 ? Math.ceil((300 * lengteMm) / hoogteMm) : 300;
  const grensMm = noemer > 0 ? lengteMm / noemer : 0;

  const result = karakteristiek
    ? data.combinationResults.get(karakteristiek.id) ?? null
    : null;
  const u = zijdelingseVerplaatsingMm(beam, data.nodes, result);

  const notes: string[] = [
    `Deze staaf staat overwegend verticaal (${nl(helling)}° met de horizontaal; ` +
      `vanaf ${VERTICAAL_VANAF_GRADEN}° geldt hij als kolom of gevelstijl). De ` +
      "doorbuigingseisen van NEN-EN 1990:2002/NB:2019 A1.4.3(3) en A1.4.3(4) " +
      "gelden voor VLOEREN EN DAKEN — alle vier de gedachtestreepjes van " +
      "A1.4.3(3) noemen een vloer, een dak of een vloerafscheiding, en A1.4.3(4) " +
      'begrenst w_max "bij zowel vloeren als daken". Een kolom is geen van beide, ' +
      "dus die grenswaarden zijn hier NIET toegepast.",
    "Wat de norm voor een verticale staaf wél voorschrijft is A1.4.3(7): de " +
      "horizontale verplaatsing over de hoogte (figuur A1.2), bij de " +
      "KARAKTERISTIEKE belastingscombinatie (uitdrukking 6.14b), begrensd op " +
      "h/300 voor andere gebouwen dan industriegebouwen; bij meer dan één " +
      "bouwlaag geldt diezelfde h/300 per bouwlaag. Getoetst is daarom niet de " +
      "kromming van de staaf maar u = u_x(boven) − u_x(onder), tegen " +
      `h/300 = ${nl(grensMm)} mm met h = ${nl(hoogteMm, 0)} mm.`,
    "AANNAMES bij die grens. (1) Het gebouw is niet als industriegebouw " +
      "aangemerkt; daarvoor geeft de NB h/150, en h/300 is de strengere van de " +
      'twee. (2) h is gelijkgesteld aan de hoogte van deze staaf, terwijl de NB "de ' +
      'kleinste gevelhoogte of de kleinste bouwlaaghoogte" bedoelt; overspant ' +
      "deze staaf meer dan één bouwlaag, dan is de grens hier te ruim. (3) De " +
      "eis h/500 voor de TOTALE hoogte van een gebouw met meer dan één bouwlaag " +
      "is een eigenschap van het gebouw en niet van deze staaf, en is hier dus " +
      "niet getoetst.",
    "Voor de doorbuiging van de staaf tussen zijn eigen einden — de kromming " +
      "vanaf de koorde — geeft A1.4.3 bij een verticale staaf geen grenswaarde; " +
      "er is er dan ook geen verzonnen. Wie hier tóch een vloer- of dakeis wil " +
      "toetsen, kiest bij de staaf expliciet een doorbuigingsklasse: die keuze " +
      "gaat vóór en laat deze zijdelingse toets vervallen.",
    "Beide doorbuigingsregels in dit rapport (w_fin en w_add) tonen dezelfde " +
      "verplaatsing tegen dezelfde grens: de norm splitst de horizontale " +
      "verplaatsing niet in een blijvend en een bijkomend deel, en de rekenkern " +
      "levert de twee regels altijd als paar.",
  ];

  if (u === null) {
    notes.push(
      "GEEN UITKOMST: " +
        (karakteristiek
          ? `de karakteristieke BGT-combinatie "${karakteristiek.name}" levert geen ` +
            "knoopverplaatsingen voor deze staaf — reken het model opnieuw door"
          : "het model kent geen BGT-combinatie (verwacht: een combinatie met " +
            '"karakteristiek" in de naam)') +
        ". De zijdelingse verplaatsing is daarom op 0 gezet; die 0 is een " +
        "ontbrekende uitkomst en geen getoetste verplaatsing.",
    );
  } else {
    notes.push(
      `u = ${nl(u, 2)} mm, uit de karakteristieke BGT-combinatie ` +
        `"${karakteristiek?.name ?? "—"}".`,
    );
  }

  return {
    // "Custom" met een opgegeven noemer: alleen zo rekent de kern L/n met een
    // noemer die niet uit de vloer-/dakcategorieën van A1.4.3(3) komt.
    klasse: "Custom",
    noemerFin: noemer,
    noemerAdd: noemer,
    wMm: u ?? 0,
    // ℓ_rep = 2 × L hoort bij een uitkragende vloer of dakrand, niet bij een
    // horizontale verplaatsing; die verdubbeling mag hier niet gebeuren.
    isUitkraging: false,
    eis: "zijdelings",
    notes,
  };
}

/** A1.4.3(3)/(4): de vloer- en dakeisen, met de zakking uit de BGT-combinaties. */
function vloerDakEis(
  beam: Beam,
  data: Pick<SteelBuildData, "nodes" | "beams" | "supports" | "combinationResults">,
  slsCombos: LoadCombination[],
): DoorbuigingsInvoer {
  const cfg = beam.checkConfig ?? {};
  const klasse = mapDeflectionClass(cfg.deflectionClass);

  // ── Welke zakking gaat de kern in ────────────────────────────────────────
  //
  // De kern leidt w_fin én w_add uit ÉÉN zakking af, terwijl de norm er twee
  // verschillende combinaties voor aanwijst: w_max bij de quasi-blijvende
  // (A1.4.3(4), 6.16b) en w2 + w3 bij de frequente of de karakteristieke
  // (A1.4.3(3)). Door de GROOTSTE zakking te nemen over de voorgeschreven
  // combinaties die dit model kent, is geen van beide toetsen lichter dan de
  // norm vraagt. "De karakteristieke is toch altijd de zwaarste" is daarbij
  // geen geldige aanname: staat er windzuiging tegenover een neerwaartse last,
  // dan kan een lichtere combinatie juist de grootste zakking geven.
  //
  // Tot september 2026 werd hier onvoorwaardelijk de karakteristieke
  // combinatie gevoerd, terwijl de notitie die de kern bij w_add meestuurt de
  // FREQUENTE combinatie noemt. Het rapport zei dus niet wat er gerekend was.
  const gewogen: { naam: string; uitdrukking: string; w: number }[] = [];
  const ontbreekt: string[] = [];
  for (const norm of BGT_NORMCOMBINATIES) {
    const combo = slsCombos.find((c) => norm.sleutel.test(c.name)) ?? null;
    const result = combo ? data.combinationResults.get(combo.id) ?? null : null;
    if (!combo || !result || !result.elements.has(beam.id)) {
      ontbreekt.push(norm.uitdrukking);
      continue;
    }
    gewogen.push({
      naam: combo.name,
      uitdrukking: norm.uitdrukking,
      w: extractFieldDeflectionMm(beam, result),
    });
  }
  // Terugval: geen enkele herkende normcombinatie → de eerste BGT-combinatie
  // die er wél is. Beter dan 0, en de notitie zegt dat het een terugval is.
  if (gewogen.length === 0 && slsCombos.length > 0) {
    const combo = slsCombos[0];
    const result = data.combinationResults.get(combo.id) ?? null;
    if (result && result.elements.has(beam.id)) {
      gewogen.push({
        naam: combo.name,
        uitdrukking: "niet herkend als 6.14b/6.15b/6.16b",
        w: extractFieldDeflectionMm(beam, result),
      });
    }
  }
  let maatgevend = gewogen.length > 0 ? gewogen[0] : null;
  for (const g of gewogen) {
    if (maatgevend && Math.abs(g.w) > Math.abs(maatgevend.w)) maatgevend = g;
  }

  const notes = deflectionNotesFor(beam, data.nodes, data.beams, data.supports);

  if (!maatgevend) {
    notes.push(
      "GEEN UITKOMST: geen enkele BGT-combinatie levert een zakking voor deze " +
        "staaf — reken het model opnieuw door. De zakking is op 0 gezet; die 0 " +
        "is een ontbrekende uitkomst en geen getoetste zakking.",
    );
  } else {
    notes.push(
      "w is de grootste zakking over de BGT-combinaties die NEN-EN 1990 A1.4.3 " +
        "aanwijst en die dit model kent: " +
        gewogen
          .map((g) => `"${g.naam}" (${g.uitdrukking}) ${nl(g.w, 2)} mm`)
          .join("; ") +
        `. Maatgevend is "${maatgevend.naam}".`,
      "De rekenkern leidt w_fin én w_add uit één zakking af, terwijl de norm er " +
        "twee combinaties voor aanwijst: w_max bij de QUASI-BLIJVENDE combinatie " +
        "(uitdrukking 6.16b, A1.4.3(4)) en w2 + w3 bij " +
        `${wAddCombinatieVanKlasse(klasse)}. Door de grootste van de ` +
        "voorgeschreven combinaties te nemen is geen van beide toetsen lichter " +
        "dan de norm vraagt; is de maatgevende combinatie zwaarder dan de " +
        "voorgeschreven, dan valt de toets strenger uit.",
    );
    if (ontbreekt.length > 0) {
      notes.push(
        "Niet meegewogen omdat dit model ze niet kent of niet heeft doorgerekend: " +
          `uitdrukking ${ontbreekt.join(" en ")}. Zit de combinatie die A1.4.3 voor ` +
          "deze categorie voorschrijft daarbij, dan is de zakking hierboven een " +
          "vervanger en geen letterlijke uitvoering van dat artikel.",
      );
    }
  }

  // w_perm — het blijvende deel w1 uit figuur NB.1 — is uit de meegegeven
  // combinatieresultaten niet af te leiden: de bouwer krijgt alleen
  // COMBINATIES, en de standaardset kent geen BGT-combinatie met uitsluitend
  // de blijvende belasting. Er gaat daarom 0 naar de kern, en dat betekent
  // w_add = w_fin. Veilig-zijdig (w2 + w3 ≤ w_tot), maar het is niet de
  // grootheid die A1.4.3(3) bedoelt — en tot september 2026 stond dat nergens
  // in het rapport: twee regels met hetzelfde getal, zonder uitleg.
  notes.push(
    "w_add is hier GELIJK aan w_fin. De norm meet w2 + w3 vanaf w1, de zakking " +
      "onder alleen de blijvende belasting (figuur NB.1 bij A1.4.3(2)); die is " +
      "uit de doorgerekende combinaties niet af te leiden, want het model kent " +
      "geen BGT-combinatie met uitsluitend de blijvende belasting. " +
      "w_BGT,permanent is daarom 0: w_add krijgt de VOLLEDIGE zakking in plaats " +
      "van alleen het deel bovenop de blijvende belasting. Veilig-zijdig, maar " +
      "de w_add-regel is daarmee geen w2 + w3, en de twee doorbuigingsregels " +
      "tonen hetzelfde getal.",
  );

  return {
    klasse,
    // De kern gebruikt de noemer alleen bij klasse "Custom"
    // (deflection.rs::default_numerator); anders geldt de klassenoemer.
    noemerFin: cfg.deflectionClass === "custom" ? cfg.deflectionLimitNumerator ?? 333 : 333,
    // 0 = de kern leidt de w_add-noemer af uit de klasse volgens
    // NEN-EN 1990:2002/NB:2019 A1.4.3(3); dat is de normale gang van zaken.
    // Een getal hier overschrijft die klassewaarde en is alleen bedoeld om een
    // externe referentie-uitwerking met een vaste noemer na te rekenen.
    noemerAdd: cfg.deflectionAddLimitNumerator ?? 0,
    wMm: maatgevend ? maatgevend.w : 0,
    isUitkraging: cfg.deflectionClass === "cantilever",
    eis: "vloerdak",
    notes,
  };
}

/**
 * Bouw BeamCheckInput[] voor alle staven met een staalprofiel.
 *
 * Per-staaf toetsconfiguratie komt uit `beam.checkConfig` (ingesteld via de
 * EN 1993-tab van het staaf-eigenschappenvenster). Gedocumenteerde defaults
 * voor ontbrekende velden:
 *  - kniklengte = systeemlengte om beide assen; geen kipsteunen;
 *  - doorbuiging: zie `bepaalDoorbuigingsInvoer` — een overwegend horizontale
 *    staaf krijgt klasse "vloer" (w_fin op L/333, w_add op 3/1 000 · ℓ_rep uit
 *    NEN-EN 1990:2002/NB:2019 A1.4.3(3), tweede gedachtestreepje), een
 *    overwegend verticale staaf de zijdelingse eis h/300 uit A1.4.3(7);
 *    geen zeeg;
 *  - gevolgklasse CC1; last grijpt aan op de bovenflens (z_a = h/2,
 *    destabiliserend = veilig-zijdig);
 *  - blijvende BGT-zakking (w1) niet af te leiden uit de combinatieresultaten
 *    → 0, dus w_add = w_fin; dat staat als notitie in het rapport.
 */
export function buildSteelCheckInputs(data: SteelBuildData): SteelBuildResult {
  const inputs: BeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");

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
    const doorbuiging = bepaalDoorbuigingsInvoer(beam, data);

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
      // Welke doorbuigingseis hier geldt, met welke verplaatsing en welke
      // grens — zie `bepaalDoorbuigingsInvoer`. Een overwegend verticale staaf
      // krijgt de zijdelingse eis van A1.4.3(7) in plaats van een vloereis.
      deflection_limit_class: doorbuiging.klasse,
      deflection_limit_numerator: doorbuiging.noemerFin,
      deflection_add_limit_numerator: doorbuiging.noemerAdd,
      // Waar de verplaatsing vandaan komt, uit welke combinatie, en wat er bij
      // is aangenomen. Landt in de notes van de w_fin-regel van het rapport.
      deflection_notes: doorbuiging.notes,
      // mm met teken: bij een ligger het veldmaximum vanaf de koorde
      // (negatief = omlaag), bij een kolom de zijdelingse verplaatsing.
      deflection_actual_max_mm: doorbuiging.wMm,
      is_cantilever: doorbuiging.isUitkraging,
      consequence_class: "CC1",
      pre_camber_mm: cfg.preCamber_mm ?? 0,
      // Het blijvende deel w1 is uit de combinatieresultaten niet af te leiden
      // → 0, dus w_add = w_fin. Veilig-zijdig, en `bepaalDoorbuigingsInvoer`
      // zet die gelijkstelling met reden in het rapport.
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
