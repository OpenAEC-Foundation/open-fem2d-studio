/**
 * betonStijfheid.ts — de lus die de segmentstijfheden van de rekenkern aan de
 * raamwerksolver knoopt (fase D, stap 11 van het plandocument).
 *
 * ── DE VORM ───────────────────────────────────────────────────────────────
 *
 *   ronde 0   vraag per betonstaaf de SEGMENTINDELING op. Een verzoek zonder
 *             krachten levert alleen die indeling; de staaf krijgt in de
 *             solverinvoer per segment de ONGESCHEURDE stijfheid als
 *             startwaarde.
 *   ronde k   los het raamwerk op → lees per segment (N, M) uit
 *             `ElementForces.segmenten` → vraag de nieuwe stijfheden op →
 *             zet ze terug → opnieuw oplossen. Klaar zodra de KERN zegt dat
 *             de ronde geconvergeerd is; niet eerder, en niet op grond van
 *             een eigen oordeel hier.
 *   vangnet   `maxRonden`. Wordt dat gehaald zonder convergentie, dan volgt
 *             een fout met de reden erbij en GÉÉN resultaat. Een getal dat de
 *             kern niet heeft goedgekeurd is geen antwoord.
 *
 * ── ÉÉN COMBINATIE TEGELIJK ───────────────────────────────────────────────
 *
 * De lus draait per belastingcombinatie. Een envelop over combinaties zou
 * impliciet beantwoorden welke EI bij welke combinatie hoort — en die vraag
 * heeft geen antwoord, want de stijfheid volgt uit de krachten van één
 * belastingtoestand. De kern weigert een verzoek waarin de krachten niet bij
 * één indeling horen; hier wordt die scheiding aan de bovenkant vastgehouden.
 * Superpositie is in dit pad dus dubbel ongeldig: geometrisch én fysisch.
 *
 * ── WAT ER PER SEGMENT VERANDERT ──────────────────────────────────────────
 *
 * Alleen `I`. De kern levert EI in kNm²; de solver rekent met E van de staaf
 * en I per segment (mm⁴). De omrekening is dus I = EI / E met E de
 * staafwaarde uit de modelmapping — niet een geometrische I, maar de I die
 * mét de staaf-E precies de door de kern berekende EI oplevert. E en A blijven
 * van de staaf: de normaalkrachtstijfheid EA varieert in deze stap niet mee.
 *
 * ── DIT IS HET ENIGE ASYNCHRONE PUNT ──────────────────────────────────────
 *
 * De rekenkern is een apart proces (Tauri-command, toetsbrug of MCP-server),
 * dus de lus is async. `combinations.ts` blijft synchroon en ongemoeid: het
 * uitgerekende combinatieresultaat gaat via `zetCombinatieResultaat` in
 * engine.ts naar dezelfde plek waar het geometrische 2e-orde-resultaat landt,
 * waarna `combineResults`/`computeEnvelope` het zonder verdere kennis
 * gebruiken.
 */
import type {
  MultiInput,
  SolverBeamSegmentInput,
  SolverResult,
  ElementForces,
  BeamSegmentForces,
} from "../components/fem/solver/types";
import { DEFAULT_E } from "../components/fem/solver/types";
import {
  solveCombinationSecondOrder,
  type SecondOrderCombo,
} from "../components/fem/solver/engine";
import type { Beam, Node } from "../components/fem/femTypes";
import type { CheckSkip } from "./checkTypes";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { SteelBranch } from "./types/concrete/SteelBranch";
import type { NonlinearBasis } from "./types/concrete/NonlinearBasis";
import type { LoadDuration } from "./types/concrete/LoadDuration";
import type { SegmentForces } from "./types/concrete/SegmentForces";
import type { SegmentStiffnessRequest } from "./types/concrete/SegmentStiffnessRequest";
import type { SegmentStiffnessResponse } from "./types/concrete/SegmentStiffnessResponse";
import {
  DEFAULT_N_STRIPS,
  DEFAULT_REINFORCEMENT_GRADE,
  SUPPORTED_CONCRETE_CLASSES,
  matchSupportedConcreteClass,
  parseConcreteRectMm,
} from "./betonCheckBuilder";
import { beamLengthMm, isSteelProfile } from "./steelCheckBuilder";
import { getLinearSolver, type LinearSolverId } from "../core/math/LinearSolver";

// ── Vaste waarden ──────────────────────────────────────────────────────────

/**
 * Beginwaarde van de segmentlengte in mm — besluit B3 van het plandocument.
 * Instelbaar; er is bewust GEEN automatische vergroving.
 */
export const STANDAARD_SEGMENTLENGTE_MM = 400;

/**
 * Vangnet van de kern (`DEFAULT_MAX_SEGMENTS` in concrete-check): meer
 * segmenten dan dit is een verzoekfout en geen berekening.
 */
export const MAX_SEGMENTEN = 2000;

/**
 * Hoeveel ronden de lus hoogstens draait. Een keuze, geen normwaarde: de
 * secansiteratie van een gescheurde ligger zakt in de praktijk in een handvol
 * ronden weg (gemeten in `test-fysisch-nietlineair.mjs`), en wat na 25 ronden
 * nog heen en weer loopt, loopt heen en weer.
 */
export const STANDAARD_MAX_RONDEN = 25;

/** Vrijheidsgraden per knoop in het vlakke raamwerk (ux, uz, ry). */
const DOF_PER_KNOOP = 3;

/**
 * Gemeten drempels voor de waarschuwing van besluit B3, per stelseloplosser.
 *
 * NIET geraden: de meting staat in het plandocument onder B3 en is met
 * `scripts/meet-oplossers.mjs` gedaan. Criterium: één stelseloplossing duurt
 * meer dan één seconde.
 *
 *  - `skyline` (de huidige standaard): 414 ms bij 7860 DOF en 1236 ms bij
 *    12 585 DOF, drempel 10 000 DOF.
 *  - `gauss`: 987 ms bij 1245 DOF en 4355 ms bij 2001 DOF, drempel 1250 DOF.
 */
export const DOF_DREMPEL: Record<LinearSolverId, number> = {
  gauss: 1250,
  skyline: 10000,
};

/**
 * Het gemeten geheugenplafond van de huidige opzet: de volledige rekenketen
 * haalde 15 735 vrijheidsgraden (3,88 GB heap) en brak bij 20 160 af met
 * "JavaScript heap out of memory". De dichte `Matrix` kost 8·n² bytes en
 * `applyBoundaryConditions` kloont hem nog eens.
 */
export const DOF_GEHEUGENPLAFOND = 15735;

// ── De betonstaven uit het model ───────────────────────────────────────────

/**
 * Eén betonstaaf zoals de segmentstijfheidsdienst hem nodig heeft. Dezelfde
 * herkenning als `betonCheckBuilder`: materiaal is een sterkteklasse, profiel
 * is een rechthoek b×h, en er is een wapeningskorf bij de staafeigenschappen.
 * Zonder korf géén staaf — er is geen stille standaardkorf.
 */
export interface BetonSegmentStaaf {
  beamId: number;
  breedteMm: number;
  hoogteMm: number;
  betonklasse: string;
  staalsoort: string;
  korf: ReinforcementCage;
  lengteMm: number;
  aantalStroken: number;
  staaltak: SteelBranch;
}

export interface BetonStavenInvoer {
  nodes: Node[];
  beams: Beam[];
  /** Runtime-lijst uit `list_concrete_classes`; leeg → statische fallback. */
  supportedClasses?: string[];
}

/**
 * Verzamel de betonstaven mét wapeningskorf. De overgeslagen staven komen
 * mét reden terug, zodat de interface kan zeggen waarom een staaf niet
 * fysisch niet-lineair meerekent in plaats van dat stil te laten.
 */
export function betonStavenUitModel(
  data: BetonStavenInvoer,
): { staven: BetonSegmentStaaf[]; overgeslagen: CheckSkip[] } {
  const klassen =
    data.supportedClasses && data.supportedClasses.length > 0
      ? data.supportedClasses
      : SUPPORTED_CONCRETE_CLASSES;
  const staven: BetonSegmentStaaf[] = [];
  const overgeslagen: CheckSkip[] = [];

  for (const beam of data.beams) {
    const klasse = matchSupportedConcreteClass(beam.material?.trim() ?? "", klassen);
    if (!klasse) continue; // geen beton: geen zaak van deze lus
    if (isSteelProfile(beam.profile)) {
      overgeslagen.push({
        beamId: beam.id,
        reason: `profiel "${beam.profile}" is een staalprofiel bij betonmateriaal "${beam.material}" — kies een rechthoek (bijv. "300x500")`,
      });
      continue;
    }
    const rect = parseConcreteRectMm(beam.profile);
    if (!rect) {
      overgeslagen.push({
        beamId: beam.id,
        reason: `doorsnede "${beam.profile ?? "—"}" is geen herkenbare rechthoek b×h — gebruik bijv. "300x500"`,
      });
      continue;
    }
    const cfg = beam.checkConfig;
    if (!cfg?.betonKorf) {
      overgeslagen.push({
        beamId: beam.id,
        reason:
          "geen wapeningskorf opgegeven — zonder korf is er geen M-N-κ-relatie en dus geen segmentstijfheid",
      });
      continue;
    }
    const lengteMm = beamLengthMm(beam, data.nodes);
    if (!(lengteMm > 0)) {
      overgeslagen.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }
    staven.push({
      beamId: beam.id,
      breedteMm: rect.bMm,
      hoogteMm: rect.hMm,
      betonklasse: klasse,
      staalsoort: cfg.betonStaalsoort ?? DEFAULT_REINFORCEMENT_GRADE,
      korf: cfg.betonKorf,
      lengteMm,
      aantalStroken:
        cfg.betonStroken && cfg.betonStroken > 0
          ? Math.round(cfg.betonStroken)
          : DEFAULT_N_STRIPS,
      staaltak: cfg.betonStaaltak ?? "Horizontal",
    });
  }
  return { staven, overgeslagen };
}

// ── De waarschuwing van besluit B3 ─────────────────────────────────────────

/**
 * Hoeveel segmenten een staaf van `lengteMm` bij deze doellengte krijgt.
 *
 * LET OP: dit is een SCHATTING voor de waarschuwing, niet de indeling zelf.
 * De werkelijke indeling komt altijd uit de kern (ronde 0), want die regel
 * hoort op één plek te staan. De formule hieronder is dezelfde als
 * `segment_layout` in `concrete-check`, zodat de schatting klopt zolang de
 * kern niet verandert; wijkt hij ooit af, dan verschuift alleen het moment
 * waarop de waarschuwing verschijnt en niet wat er gerekend wordt.
 */
export function geschatSegmentAantal(lengteMm: number, doelMm: number): number {
  if (!(lengteMm > 0) || !(doelMm > 0)) return 1;
  return Math.max(1, Math.round(lengteMm / doelMm));
}

/**
 * Schatting van het aantal vrijheidsgraden ná het opknippen: de bestaande
 * knopen plus per betonstaaf de segmentknopen die erbij komen. Platen en
 * bestaande splitsingen (staafpuntlasten, plaatranden) tellen niet mee — die
 * maken het model alleen maar groter, dus de schatting is een ondergrens.
 */
export function schatVrijheidsgraden(
  aantalKnopen: number,
  staven: { lengteMm: number }[],
  segmentLengteMm: number,
): number {
  let extra = 0;
  for (const s of staven) extra += geschatSegmentAantal(s.lengteMm, segmentLengteMm) - 1;
  return (aantalKnopen + extra) * DOF_PER_KNOOP;
}

/**
 * De waarschuwing van besluit B3. `null` = geen waarschuwing.
 *
 * De applicatie grijpt niet zelf in: er is geen automatische vergroving. De
 * gebruiker houdt de knop, en de melding noemt die knop met naam — de
 * segmentlengte is het enige waar hij dit mee kan sturen.
 */
export function segmentWaarschuwing(
  dof: number,
  segmentLengteMm: number,
  oplosser: LinearSolverId = getLinearSolver(),
): string | null {
  const drempel = DOF_DREMPEL[oplosser];
  if (dof <= drempel) return null;
  const grover = Math.ceil((segmentLengteMm * dof) / drempel / 50) * 50;
  const kop =
    `Dit model komt met een segmentlengte van ${segmentLengteMm} mm op naar ` +
    `schatting ${dof} vrijheidsgraden.`;
  const tijd =
    ` Gemeten met de ${oplosser}-oplosser duurt één stelseloplossing boven ` +
    `${drempel} vrijheidsgraden meer dan een seconde, en een fysisch ` +
    `niet-lineaire berekening doet er tientallen per combinatie.`;
  const knop =
    ` Vergroot de segmentlengte (naar circa ${grover} mm blijft het model ` +
    `onder de drempel) als de berekening te lang duurt; de applicatie doet ` +
    `dat niet uit zichzelf.`;
  if (dof > DOF_GEHEUGENPLAFOND) {
    return (
      kop +
      ` Dat ligt BOVEN het gemeten geheugenplafond van ${DOF_GEHEUGENPLAFOND} ` +
      `vrijheidsgraden: de berekening breekt daar af met "JavaScript heap out ` +
      `of memory".` +
      knop
    );
  }
  return kop + tijd + knop;
}

// ── De aanroep van de kern ─────────────────────────────────────────────────

/** De vorm van `roepKern` uit `stores/checkStore`. */
export type RoepKern = <T>(opdracht: string, inputs?: unknown) => Promise<T>;

/**
 * De standaardaanroep: dezelfde `roepKern` die de toetsing gebruikt — in de
 * desktop-app via Tauri, in de browser via de toetsbrug van de dev-server.
 * Dynamisch geïmporteerd zodat een aanroeper met een eigen kernaanroep (de
 * testbatterij) de Tauri-glue niet meesleept.
 */
async function standaardRoep<T>(opdracht: string, inputs?: unknown): Promise<T> {
  const { roepKern } = await import("../stores/checkStore");
  return roepKern<T>(opdracht, inputs);
}

// ── Opties ─────────────────────────────────────────────────────────────────

export interface FysischOpties {
  /** Gewenste segmentlengte in mm; standaard 400 (besluit B3). */
  segmentLengteMm?: number;
  /** Vangnet op het aantal ronden; standaard 25. */
  maxRonden?: number;
  /** UGT (`DesignValues`, standaard) of BGT (`MeanValues`) — besluit B2. */
  grenstoestand?: NonlinearBasis;
  /** Effectieve kruipcoëfficiënt; standaard 0 (besluit B1). */
  phiEf?: number;
  /** Onderrelaxatie ω ∈ (0, 1]; standaard 1,0 = geen relaxatie. */
  relaxatie?: number;
  /** Convergentietolerantie op de relatieve verandering van EI; standaard 0,01. */
  tolerantie?: number;
  /** Ondergrens voor EI als fractie van E_c·I_c; standaard 0,01. */
  minEiRatio?: number;
  /** β van (7.19); alleen in de BGT van invloed. */
  belastingduur?: LoadDuration;
  /** Vangnet op het aantal segmenten per staaf; standaard 2000. */
  maxSegmenten?: number;
  /** Aanroep van de rekenkern; standaard `roepKern` uit checkStore. */
  roep?: RoepKern;
  /**
   * De raamwerkoplossing van één combinatie. Standaard het geometrisch
   * niet-lineaire pad (`solveCombinationSecondOrder`); als naad aanwezig
   * zodat de testbatterij dezelfde lus met een eerste-orde-oplossing of met
   * een geteld aantal aanroepen kan draaien.
   */
  losOp?: (input: MultiInput, combo: SecondOrderCombo) => SolverResult | null;
}

interface Ingevuld extends Required<Omit<FysischOpties, "losOp" | "roep">> {
  roep: RoepKern;
  losOp: (input: MultiInput, combo: SecondOrderCombo) => SolverResult | null;
}

function vulAan(o: FysischOpties | undefined): Ingevuld {
  return {
    segmentLengteMm: o?.segmentLengteMm ?? STANDAARD_SEGMENTLENGTE_MM,
    maxRonden: o?.maxRonden ?? STANDAARD_MAX_RONDEN,
    grenstoestand: o?.grenstoestand ?? "DesignValues",
    phiEf: o?.phiEf ?? 0,
    relaxatie: o?.relaxatie ?? 1,
    tolerantie: o?.tolerantie ?? 0.01,
    minEiRatio: o?.minEiRatio ?? 0.01,
    belastingduur: o?.belastingduur ?? "ShortTerm",
    maxSegmenten: o?.maxSegmenten ?? MAX_SEGMENTEN,
    roep: o?.roep ?? standaardRoep,
    losOp: o?.losOp ?? solveCombinationSecondOrder,
  };
}

// ── Uitkomst ───────────────────────────────────────────────────────────────

/** Wat één ronde opleverde — het spoor dat het rapporthoofdstuk nodig heeft. */
export interface RondeVerslag {
  /** 1-gebaseerd; ronde 0 is de indeling en staat apart in `indeling`. */
  ronde: number;
  /** Grootste relatieve verandering van EI over alle staven; null = niet te beoordelen. */
  maxRelatieveVerandering: number | null;
  /** Zeggen ALLE staven van de kern dat deze ronde geconvergeerd is? */
  geconvergeerd: boolean;
  /** Het volledige antwoord per staaf-id. */
  perStaaf: Map<number, SegmentStiffnessResponse>;
}

export interface FysischUitkomst {
  /** De raamwerkoplossing van de laatste ronde. */
  resultaat: SolverResult;
  /** Aantal opgeloste stelsels (ronde 0 is de indeling en telt niet mee). */
  ronden: number;
  /** Het antwoord van ronde 0 per staaf: de indeling en de vergelijkingswaarden. */
  indeling: Map<number, SegmentStiffnessResponse>;
  /** Het antwoord van de laatste ronde per staaf: de segmenttabel van het rapport. */
  laatsteRonde: Map<number, SegmentStiffnessResponse>;
  /** Alle ronden, op volgorde. */
  geschiedenis: RondeVerslag[];
  /** De segmentindeling mét de gebruikte I (mm⁴) per staaf-id. */
  segmenten: Map<number, SolverBeamSegmentInput[]>;
  /** Staaf-ids die geen segmenten kregen omdat de combinatie geen lasten activeert. */
  zonderLasten: boolean;
}

// ── Hulp: verzoek bouwen ───────────────────────────────────────────────────

function bouwVerzoek(
  staaf: BetonSegmentStaaf,
  opties: Ingevuld,
  krachten: SegmentForces[],
  vorigeEi: number[],
): SegmentStiffnessRequest {
  return {
    beam_id: staaf.beamId,
    width_mm: staaf.breedteMm,
    height_mm: staaf.hoogteMm,
    concrete_class: staaf.betonklasse,
    reinforcement_grade: staaf.staalsoort,
    cage: staaf.korf,
    length_m: staaf.lengteMm / 1000,
    target_segment_length_mm: opties.segmentLengteMm,
    max_segments: opties.maxSegmenten,
    limit_state: opties.grenstoestand,
    phi_ef: opties.phiEf,
    segment_forces: krachten,
    previous_ei_knm2: vorigeEi,
    relaxation: opties.relaxatie,
    convergence_tolerance: opties.tolerantie,
    min_ei_ratio: opties.minEiRatio,
    n_strips: staaf.aantalStroken,
    steel_branch: staaf.staaltak,
    design_situation: "PersistentTransient",
    load_duration: opties.belastingduur,
  };
}

/** E van de staaf uit de solverinvoer (N/mm²) — de basis voor I = EI/E. */
function staafE(input: MultiInput, beamId: number): number {
  const b = input.beams.find((x) => x.id === beamId);
  return b?.E ?? DEFAULT_E;
}

/** kNm² → mm⁴ bij een gegeven E in N/mm². 1 kNm² = 1e9 N·mm². */
export function iUitEi(eiKnm2: number, eMpa: number): number {
  return (eiKnm2 * 1e9) / eMpa;
}

/**
 * De segmentindeling uit een kernantwoord omzetten naar solverinvoer, met een
 * gegeven EI per segment. `tStart`/`tEnd` zijn fracties van de STAAFLENGTE
 * zoals de kern hem kent, zodat de grenzen exact op de segmentgrenzen liggen.
 */
function segmentenUitAntwoord(
  antwoord: SegmentStiffnessResponse,
  eiPerSegment: number[],
  eMpa: number,
): SolverBeamSegmentInput[] {
  const lengteMm = antwoord.length_m * 1000;
  return antwoord.segments.map((s, i) => ({
    tStart: s.x_start_mm / lengteMm,
    // Het laatste segment eindigt exact op 1: delen levert anders 0,9999999998
    // en dan valt de partitiecontrole van de adapter erover.
    tEnd: i === antwoord.segments.length - 1 ? 1 : s.x_end_mm / lengteMm,
    I: iUitEi(eiPerSegment[i], eMpa),
  }));
}

/** De solverinvoer met de segmenten van deze ronde erin. */
function metSegmenten(
  input: MultiInput,
  segmenten: Map<number, SolverBeamSegmentInput[]>,
): MultiInput {
  // Geen betonstaven ⇒ letterlijk dezelfde invoer terug. Dat is de garantie
  // dat een model zonder beton bit-identiek rekent aan het bestaande pad.
  if (segmenten.size === 0) return input;
  return {
    ...input,
    beams: input.beams.map((b) => {
      const s = segmenten.get(b.id);
      return s ? { ...b, segmenten: s } : b;
    }),
  };
}

// ── Hulp: krachten per segment uit het resultaat ───────────────────────────

/**
 * De (N, M) per INVOERSEGMENT uit de segmentuitkomsten van één staaf.
 *
 * `ElementForces.segmenten` geeft één record per REKENELEMENT. Dat is niet
 * één-op-één het invoersegment: binnen een segment kan nog geknipt zijn op een
 * staafpuntlast of een plaatrandknoop (meerdere records met dezelfde
 * `segmentIndex`), en een segmentgrens die met een bestaande splitsing is
 * samengevoegd levert één record dat twee segmenten overspant. Daarom wordt
 * per segment op OVERLAP geselecteerd en niet op `segmentIndex`: van alle
 * records die het segment raken telt het record met de grootste |M_max|, met
 * de normaalkracht op datzelfde station. Dat is het maatgevende (N, M)-paar
 * van het segment — de doorsnede waar de stijfheid het laagst is.
 *
 * Bij een samengevoegde grens ziet één van beide segmenten dus een moment dat
 * net buiten zijn eigen grenzen ligt. Dat kan alleen bij grenzen die al binnen
 * de knooptolerantie van het rekenmesh (25 mm) samenvielen, en het werkt naar
 * de veilige kant: een hoger moment geeft een lagere EI.
 */
export function krachtenPerSegment(
  el: ElementForces,
  segmentGrenzenMm: { x0: number; x1: number }[],
  beamId: number,
): SegmentForces[] {
  const records: BeamSegmentForces[] | undefined = el.segmenten;
  if (!records || records.length === 0) {
    throw new Error(
      `Staaf ${beamId}: het solverresultaat draagt geen segmentuitkomsten. ` +
        `De segmentindeling is niet bij de solver aangekomen.`,
    );
  }
  const EPS = 1e-6;
  return segmentGrenzenMm.map(({ x0, x1 }, i) => {
    let beste: BeamSegmentForces | null = null;
    for (const r of records) {
      if (r.xEnd <= x0 + EPS || r.xStart >= x1 - EPS) continue;
      if (!beste || Math.abs(r.M_max) > Math.abs(beste.M_max)) beste = r;
    }
    if (!beste) {
      // Kan alleen als de records de staaf niet dekken; dat is een fout in de
      // adapter en geen reden om met een verzonnen nul door te rekenen.
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1} (${x0.toFixed(1)}–${x1.toFixed(1)} mm): ` +
          `geen enkel rekenelement overlapt dit segment.`,
      );
    }
    return {
      n_ed_kn: beste.N_bij_M_max / 1000,
      m_ed_knm: beste.M_max / 1e6,
    };
  });
}

/** De segmentgrenzen in mm uit een kernantwoord. */
function grenzenUitAntwoord(a: SegmentStiffnessResponse): { x0: number; x1: number }[] {
  return a.segments.map((s) => ({ x0: s.x_start_mm, x1: s.x_end_mm }));
}

/** De EI's van een antwoord, of een fout als een segment er geen heeft. */
function eiUitAntwoord(a: SegmentStiffnessResponse): number[] {
  return a.segments.map((s, i) => {
    if (s.ei_knm2 === null || !Number.isFinite(s.ei_knm2)) {
      throw new Error(
        `Staaf ${a.beam_id}, segment ${i + 1} (${s.x_start_mm.toFixed(0)}–` +
          `${s.x_end_mm.toFixed(0)} mm): de rekenkern gaf geen stijfheid — ` +
          `${s.message ?? "reden onbekend"}.`,
      );
    }
    return s.ei_knm2;
  });
}

// ── De lus ─────────────────────────────────────────────────────────────────

/**
 * Los ÉÉN belastingcombinatie fysisch niet-lineair op.
 *
 * Gooit een `Error` met een Nederlandse melding wanneer de lus niet
 * convergeert, wanneer een segment geen stijfheid oplevert, of wanneer de
 * rekenkern het verzoek weigert. In geen van die gevallen komt er een
 * resultaat terug: een niet-geconvergeerde krachtsverdeling is geen antwoord.
 */
export async function losCombinatieFysischOp(
  input: MultiInput,
  combo: SecondOrderCombo,
  staven: BetonSegmentStaaf[],
  opties?: FysischOpties,
): Promise<FysischUitkomst> {
  const o = vulAan(opties);
  const geschiedenis: RondeVerslag[] = [];

  // ── Ronde 0: de indeling ────────────────────────────────────────────────
  // Een verzoek zonder krachten levert alleen de segmentindeling. Elke staaf
  // start met de ONGESCHEURDE stijfheid E_c·I_c uit hetzelfde antwoord — het
  // enige getal dat er vóór de eerste oplossing is.
  const indeling = new Map<number, SegmentStiffnessResponse>();
  let segmenten = new Map<number, SolverBeamSegmentInput[]>();
  const eiVorig = new Map<number, number[]>();

  for (const staaf of staven) {
    const antwoord = await o.roep<SegmentStiffnessResponse>(
      "concrete_segment_stiffness",
      bouwVerzoek(staaf, o, [], []),
    );
    indeling.set(staaf.beamId, antwoord);
    const start = antwoord.segments.map(() => antwoord.ei_uncracked_knm2);
    eiVorig.set(staaf.beamId, start);
    segmenten.set(
      staaf.beamId,
      segmentenUitAntwoord(antwoord, start, staafE(input, staaf.beamId)),
    );
  }

  // ── Ronde 1..n: oplossen, krachten heen, stijfheden terug ───────────────
  let laatste: Map<number, SegmentStiffnessResponse> = new Map();
  for (let ronde = 1; ronde <= o.maxRonden; ronde++) {
    const resultaat = o.losOp(metSegmenten(input, segmenten), combo);
    if (!resultaat) {
      // Deze combinatie activeert geen enkele last; de aanroeper valt terug
      // op superpositie (die dan triviaal nul is).
      return {
        resultaat: legeUitkomst(),
        ronden: ronde - 1,
        indeling,
        laatsteRonde: laatste,
        geschiedenis,
        segmenten,
        zonderLasten: true,
      };
    }

    const nieuw = new Map<number, SegmentStiffnessResponse>();
    let allesGeconvergeerd = true;
    let maxVerandering: number | null = null;

    for (const staaf of staven) {
      const el = resultaat.elements.get(staaf.beamId);
      if (!el) {
        throw new Error(
          `Staaf ${staaf.beamId}: het solverresultaat kent deze staaf niet. ` +
            `De fysisch niet-lineaire lus kan er geen stijfheid voor bepalen.`,
        );
      }
      const grenzen = grenzenUitAntwoord(indeling.get(staaf.beamId)!);
      const krachten = krachtenPerSegment(el, grenzen, staaf.beamId);
      const antwoord = await o.roep<SegmentStiffnessResponse>(
        "concrete_segment_stiffness",
        bouwVerzoek(staaf, o, krachten, eiVorig.get(staaf.beamId)!),
      );
      nieuw.set(staaf.beamId, antwoord);
      if (antwoord.failed_count > 0) {
        const eerste = antwoord.segments.find((s) => s.message !== null && s.ei_knm2 === null);
        throw new Error(
          `Staaf ${staaf.beamId}: ${antwoord.failed_count} van de ` +
            `${antwoord.segment_count} segmenten leverde in ronde ${ronde} geen ` +
            `stijfheid. ${eerste?.message ?? ""} De krachtsverdeling is daarmee ` +
            `niet bepaald; er is geen uitkomst.`,
        );
      }
      if (!antwoord.converged) allesGeconvergeerd = false;
      if (antwoord.max_relative_change !== null) {
        maxVerandering =
          maxVerandering === null
            ? antwoord.max_relative_change
            : Math.max(maxVerandering, antwoord.max_relative_change);
      }
    }

    geschiedenis.push({
      ronde,
      maxRelatieveVerandering: maxVerandering,
      geconvergeerd: allesGeconvergeerd,
      perStaaf: nieuw,
    });
    laatste = nieuw;

    if (allesGeconvergeerd) {
      // De kern heeft de stijfheden van deze ronde goedgekeurd: ze wijken
      // hoogstens de tolerantie af van die waarmee `resultaat` gerekend is.
      // Dat resultaat IS de uitkomst; opnieuw oplossen zou binnen dezelfde
      // tolerantie hetzelfde geven.
      return {
        resultaat,
        ronden: ronde,
        indeling,
        laatsteRonde: laatste,
        geschiedenis,
        segmenten,
        zonderLasten: false,
      };
    }

    // Stijfheden terugzetten voor de volgende ronde.
    const volgende = new Map<number, SolverBeamSegmentInput[]>();
    for (const staaf of staven) {
      const antwoord = nieuw.get(staaf.beamId)!;
      const ei = eiUitAntwoord(antwoord);
      eiVorig.set(staaf.beamId, ei);
      volgende.set(
        staaf.beamId,
        segmentenUitAntwoord(antwoord, ei, staafE(input, staaf.beamId)),
      );
    }
    segmenten = volgende;
  }

  throw new Error(nietConvergentMelding(combo, laatste, o));
}

/**
 * De foutmelding bij een lus die het vangnet haalt. Noemt de reden die de
 * kern zelf geeft — een blijvend geklemd segment is een andere zaak dan een
 * stijfheid die heen en weer blijft lopen — en geeft GEEN getal.
 */
function nietConvergentMelding(
  combo: SecondOrderCombo,
  laatste: Map<number, SegmentStiffnessResponse>,
  o: Ingevuld,
): string {
  const geklemd: string[] = [];
  const lopend: string[] = [];
  for (const [beamId, a] of laatste) {
    if (a.clamped_count > 0) {
      geklemd.push(
        `staaf ${beamId} (${a.clamped_count} van de ${a.segment_count} segmenten op de ondergrens)`,
      );
    } else if (a.max_relative_change !== null) {
      lopend.push(
        `staaf ${beamId} (${(100 * a.max_relative_change).toFixed(1)} % verandering in segment ${a.governing_segment ?? "?"})`,
      );
    }
  }
  const delen = [
    `De fysisch niet-lineaire berekening van combinatie "${combo.name}" is na ` +
      `${o.maxRonden} ronden niet geconvergeerd op ${(100 * o.tolerantie).toFixed(1)} %.`,
  ];
  if (geklemd.length > 0) {
    delen.push(
      `Op de ondergrens geklemd: ${geklemd.join(", ")}. Een geklemde stijfheid ` +
        `is een numerieke ondergrens en geen rekenuitkomst — die staven staan ` +
        `vrijwel op hun momentweerstand.`,
    );
  }
  if (lopend.length > 0) {
    delen.push(`Nog in beweging: ${lopend.join(", ")}.`);
  }
  delen.push(
    `Er is daarom GEEN krachtsverdeling voor deze combinatie. Verlaag de ` +
      `belasting, verzwaar de doorsnede of de wapening, of gebruik ` +
      `onderrelaxatie (ω < 1) als de stijfheden heen en weer springen.`,
  );
  return delen.join(" ");
}

/** Een leeg resultaat voor een combinatie die geen enkele last activeert. */
function legeUitkomst(): SolverResult {
  return {
    displacements: new Map(),
    reactions: new Map(),
    elements: new Map(),
    maxDisplacement: 0,
  };
}
