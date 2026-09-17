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
  solveCombinationFirstOrder,
  solveCombinationSecondOrder,
  type SecondOrderCombo,
} from "../components/fem/solver/engine";
import {
  soortVanCombinatie,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import type { Beam, Node } from "../components/fem/femTypes";
import type { CheckSkip } from "./checkTypes";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { SteelBranch } from "./types/concrete/SteelBranch";
import type { NonlinearBasis } from "./types/concrete/NonlinearBasis";
import type { LoadDuration } from "./types/concrete/LoadDuration";
import type { ConcreteSectionInput } from "./types/concrete/ConcreteSectionInput";
import type { SegmentForces } from "./types/concrete/SegmentForces";
import type { SegmentStiffnessRequest } from "./types/concrete/SegmentStiffnessRequest";
import type { SegmentStiffnessResponse } from "./types/concrete/SegmentStiffnessResponse";
import type { Kruip519Invoer } from "./types/concrete/Kruip519Invoer";
import {
  BETON_PROFIEL_VOORBEELDEN,
  DEFAULT_N_STRIPS,
  DEFAULT_REINFORCEMENT_GRADE,
  SUPPORTED_CONCRETE_CLASSES,
  matchSupportedConcreteClass,
  metBeff,
  parseConcreteSection,
} from "./betonCheckBuilder";
import { beamLengthMm, isSteelProfile } from "./steelCheckBuilder";
import { referentieVanStaaf } from "./referentierichting";
import { kruipcoefficientVanStaaf } from "./kruipcoefficient";
import { getLinearSolver, type LinearSolverId } from "../core/math/LinearSolver";
import { STANDAARD_BIJLAGE, type NationaleBijlageCode } from "./normAanduidingen";

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
 * herkenning als `betonCheckBuilder`: materiaal is een sterkteklasse, het
 * profiel is een betondoorsnede (rechthoek, T of L), en er is een
 * wapeningskorf bij de staafeigenschappen. Zonder korf géén staaf — er is
 * geen stille standaardkorf.
 */
export interface BetonSegmentStaaf {
  beamId: number;
  /** De doorsnede zoals de kern hem verwacht: rechthoek, T of L. */
  doorsnede: ConcreteSectionInput;
  betonklasse: string;
  staalsoort: string;
  korf: ReinforcementCage;
  lengteMm: number;
  aantalStroken: number;
  staaltak: SteelBranch;
  /**
   * −1 als de staaf tegen zijn referentierichting in is getekend. Het moment
   * uit de solver staat in lokale assen; de korf noemt boven en onder in de
   * referentierichting. Bij een ongelijke korf bepaalt dat teken welke rij op
   * trek staat en dus de secant-EI. Ontbreekt → 1. Zie
   * `lib/referentierichting.ts`.
   */
  momentTeken?: 1 | -1;
  /**
   * De EINDWAARDE van de kruipcoëfficiënt φ(∞,t₀) van deze staaf (art. 3.1.4),
   * of `undefined` wanneer zij niet is opgegeven.
   *
   * `undefined` en 0 zijn NIET hetzelfde. 0 betekent "geen kruip" — een
   * uitspraak over het beton; `undefined` betekent "niet opgegeven", en dan
   * rekent de lus met φ_ef = 0 maar meldt de kern dat luid (`creep_note`,
   * `zonderKruipcoefficient`). Zie `bouwVerzoek` voor de vertaling naar φ_ef.
   */
  phiInfT0?: number;
}

export interface BetonStavenInvoer {
  nodes: Node[];
  beams: Beam[];
  /** Runtime-lijst uit `list_concrete_classes`; leeg → statische fallback. */
  supportedClasses?: string[];
  /**
   * De afgeleide meewerkende flensbreedte b_eff per staaf-id, in mm
   * (5.3.2.1). Alleen van toepassing op een T of een L; ontbreekt hij, dan
   * gaat de ingevoerde flensbreedte de berekening in en drukt de kern die
   * waarde af als de veronderstelde b_eff.
   */
  bEffPerStaaf?: Map<number, number>;
  /**
   * De kruipcoëfficiënt φ(∞,t₀) van het PROJECT (art. 3.1.4), voor elke
   * betonstaaf die er zelf geen heeft. Een staaf met een eigen waarde in het
   * §5.8-blok (`betonKolom.phi_inf_t0`) gaat vóór: die is specifieker, en
   * §5.8.4 hangt φ_ef uitdrukkelijk aan het ELEMENT.
   */
  standaardPhiInfT0?: number;
  /**
   * φ(∞,t₀) volgens bijlage B per staaf-id, uit de kern
   * (`bepaalKruipPerStaaf` in lib/kruipcoefficient.ts). Geldt alleen waar
   * staaf en project niets opgeven — dezelfde regel en dezelfde waarden als de
   * kolomtoets.
   */
  berekendePhiPerStaaf?: ReadonlyMap<number, number>;
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
        reason: `profiel "${beam.profile}" is een staalprofiel bij betonmateriaal "${beam.material}" — kies ${BETON_PROFIEL_VOORBEELDEN}`,
      });
      continue;
    }
    const vorm = parseConcreteSection(beam.profile);
    if (!vorm.ok) {
      overgeslagen.push({ beamId: beam.id, reason: vorm.reden });
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
      doorsnede: metBeff(vorm.doorsnede, data.bEffPerStaaf?.get(beam.id)),
      betonklasse: klasse,
      staalsoort: cfg.betonStaalsoort ?? DEFAULT_REINFORCEMENT_GRADE,
      korf: cfg.betonKorf,
      lengteMm,
      aantalStroken:
        cfg.betonStroken && cfg.betonStroken > 0
          ? Math.round(cfg.betonStroken)
          : DEFAULT_N_STRIPS,
      staaltak: cfg.betonStaaltak ?? "Horizontal",
      momentTeken: referentieVanStaaf(beam, data.nodes).gespiegeld ? -1 : 1,
      // Per staaf gaat vóór per project; allebei afwezig = niet opgegeven, en
      // dat is een andere toestand dan nul (zie `phiInfT0`). Dezelfde regel als
      // de kolomtoets (`korvenUitStaven`), uit één module.
      phiInfT0: kruipcoefficientVanStaaf(
        cfg.betonKolom?.phi_inf_t0,
        data.standaardPhiInfT0,
        data.berekendePhiPerStaaf?.get(beam.id),
      ),
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

// ── β van (7.19): de belastingduur per combinatie ──────────────────────────

/**
 * Welke β hoort bij deze belastingcombinatie — art. 7.4.3(3), vergelijking
 * (7.19).
 *
 * De norm geeft er twee, en geen derde:
 *
 *   "β is een coëfficiënt die rekening houdt met de invloed van de
 *    belastingsduur of herhaalde belasting op de gemiddelde rek;
 *    β = 1,0 voor een enkele kortdurende belasting;
 *    β = 0,5 voor aanhoudende belastingen of meervoudige cycli van zich
 *    herhalende belastingen."
 *
 * β zit in ζ = 1 − β·(σ_sr/σ_s)² (7.19). Een LAGERE β geeft een HOGERE ζ, dus
 * meer gewicht op de volledig gescheurde toestand in (7.18), dus een lagere
 * stijfheid en een grotere zakking. β = 1,0 is daarmee de gunstige kant, en
 * die hoort alleen bij een belasting die werkelijk eenmalig en kortdurend is.
 *
 * DE KEUZE PER COMBINATIETYPE. De grondslag is A1.4.3 van EN 1990 met de drie
 * BGT-combinaties:
 *
 *  - quasi-blijvend (6.16b) — per definitie de aanhoudende belasting.
 *    β = 0,5. Dit is het geval waarvoor 7.4.3 bestaat.
 *  - frequent (6.15b) — G plus ψ₁·Q: het blijvende deel staat er onafgebroken
 *    op, en de frequente waarde van de veranderlijke belasting is juist de
 *    waarde die een groot deel van de referentieperiode wordt overschreden.
 *    Dat is geen "enkele kortdurende belasting". β = 0,5.
 *  - karakteristiek (6.14b) — G plus Q_k1 plus ψ₀·Q_ki. Ook hier draagt de
 *    combinatie het volledige blijvende deel, dat de doorsnede al vóór deze
 *    toestand heeft laten scheuren en de tension stiffening al heeft laten
 *    afnemen. De karakteristieke combinatie is een ZELDZAME toestand van een
 *    element dat de aanhoudende belasting al achter de rug heeft, en niet een
 *    maagdelijk element onder één kortdurende last. β = 0,5. Het is bovendien
 *    de ongunstige kant, en 7.4.3(2) vraagt om een methode die "overeenkomt
 *    met het werkelijke gedrag".
 *  - een BGT-combinatie die niet als een van de drie te herkennen is —
 *    `soortVanCombinatie` geeft dan `null`, bijvoorbeeld bij een eigen
 *    combinatie met een eigen naam. Dan is de duur ONBEKEND, en de veilige
 *    kant is β = 0,5. Nooit stil 1,0 aannemen: dat is precies de gunstige
 *    kant zonder dat een getal het verraadt.
 *
 * β = 1,0 blijft dus over voor de UGT, waar (7.19) niet wordt gebruikt: in de
 * UGT rekent de kern volgens 5.8.6(5) zonder betontrek en dus zonder tension
 * stiffening, en β heeft er geen invloed. De waarde reist mee zodat het
 * rapport kan laten zien wat er is meegegeven.
 */
export function belastingduurVanCombinatie(
  combo: Pick<LoadCombination, "type" | "name" | "standaard">,
): { duur: LoadDuration; reden: string } {
  if (combo.type !== "sls") {
    return {
      duur: "ShortTerm",
      reden:
        "UGT-combinatie: 5.8.6(5) rekent zonder betontrek, dus (7.18)/(7.19) " +
        "en daarmee β spelen hier geen rol.",
    };
  }
  const soort = soortVanCombinatie(combo as LoadCombination);
  switch (soort) {
    case "6.16b":
      return {
        duur: "Sustained",
        reden:
          "quasi-blijvende combinatie (6.16b) — 7.4.3(3): β = 0,5 voor aanhoudende belastingen.",
      };
    case "6.15b":
      return {
        duur: "Sustained",
        reden:
          "frequente combinatie (6.15b) — het blijvende deel staat onafgebroken op de " +
          "constructie, dus 7.4.3(3): β = 0,5 voor aanhoudende belastingen.",
      };
    case "6.14b":
      return {
        duur: "Sustained",
        reden:
          "karakteristieke combinatie (6.14b) — een zeldzame toestand van een element dat de " +
          "aanhoudende belasting al draagt; de tension stiffening is dan al afgenomen. " +
          "7.4.3(3): β = 0,5. β = 1,0 geldt alleen voor één enkele kortdurende belasting.",
      };
    default:
      return {
        duur: "Sustained",
        reden:
          "BGT-combinatie zonder herkenbare soort (niet 6.14b, 6.15b of 6.16b) — de " +
          "belastingduur is onbekend en 7.4.3(3) β = 0,5 is de ongunstige en dus veilige kant.",
      };
  }
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
  /**
   * φ_ef voor staven ZONDER eigen φ(∞,t₀) (`BetonSegmentStaaf.phiInfT0`);
   * standaard 0 (besluit B1). 0 betekent rekenen zonder kruip, en de kern
   * zet daar zijn verplichte vermelding bij (`creep_note`, "ONVEILIGE KANT").
   * De staven die het betreft staan in `zonderKruipcoefficient`.
   */
  phiEf?: number;
  /** Onderrelaxatie ω ∈ (0, 1]; standaard 1,0 = geen relaxatie. */
  relaxatie?: number;
  /** Convergentietolerantie op de relatieve verandering van EI; standaard 0,01. */
  tolerantie?: number;
  /** Ondergrens voor EI als fractie van E_c·I_c; standaard 0,01. */
  minEiRatio?: number;
  /**
   * β van (7.19); alleen in de BGT van invloed. Standaard `"ShortTerm"`
   * (β = 1,0) — de aanroeper hoort de duur uit de COMBINATIE af te leiden met
   * `belastingduurVanCombinatie`, want 7.4.3(3) hangt β aan de belasting en
   * niet aan de doorsnede.
   */
  belastingduur?: LoadDuration;
  /** Vangnet op het aantal segmenten per staaf; standaard 2000. */
  maxSegmenten?: number;
  /**
   * De nationale bijlage van het project (normnaad): γ_C, γ_S, α_cc en γ_cE van
   * de (3.14)-kromme komen uit haar rij in de kern. Standaard de enige gevulde
   * bijlage, zoals `#[serde(default)]` aan de Rust-kant.
   */
  bijlage?: NationaleBijlageCode;
  /**
   * Per staaf-id de eerste-orde-momenten waarmee de KERN φ_ef uit (5.19)
   * bepaalt — alleen in de UGT (`grenstoestand = "DesignValues"`) en alleen
   * voor staven mét φ(∞,t₀). Bouw hem met `kruipInvoerVoorCombinatie`.
   *
   * Weggelaten = φ_ef = φ(∞,t₀), de bovengrens van (5.19) (de oude stand, aan
   * de ongunstige kant). Meegegeven bij een BGT-grenstoestand is een fout:
   * 7.4.3(5) vraagt daar de volle φ(∞,t₀), en de kern weigert het ook.
   */
  kruip519?: ReadonlyMap<number, Kruip519Invoer>;
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

interface Ingevuld extends Required<Omit<FysischOpties, "losOp" | "roep" | "kruip519">> {
  kruip519: ReadonlyMap<number, Kruip519Invoer> | undefined;
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
    bijlage: o?.bijlage ?? STANDAARD_BIJLAGE,
    kruip519: o?.kruip519,
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
  /**
   * De staaf-ids waarvoor GEEN kruipcoëfficiënt φ(∞,t₀) was opgegeven en die
   * dus met φ_ef = 0 zijn gerekend.
   *
   * Leeg is het goede geval. Is de lijst gevuld, dan is er zonder kruip
   * gerekend en staat de uitkomst aan de ONVEILIGE kant: de zakking is te
   * klein, en in een statisch onbepaald model klopt ook de krachtsverdeling
   * niet, want de betonstaven zijn dan te stijf ten opzichte van de rest. De
   * aanroeper hoort dit te MELDEN en niet stil door te rekenen; de kern zet
   * dezelfde boodschap in `creep_note` van elk antwoord.
   */
  zonderKruipcoefficient: number[];
}

// ── Hulp: verzoek bouwen ───────────────────────────────────────────────────

function bouwVerzoek(
  staaf: BetonSegmentStaaf,
  opties: Ingevuld,
  krachten: SegmentForces[],
  vorigeEi: number[],
): SegmentStiffnessRequest {
  // (5.19) met de werkelijke verhouding: alleen in de UGT en alleen voor een
  // staaf met φ(∞,t₀). Zie `kruipInvoerVoorCombinatie`.
  const kruip =
    opties.grenstoestand === "DesignValues" && staaf.phiInfT0 !== undefined
      ? opties.kruip519?.get(staaf.beamId)
      : undefined;
  return {
    bijlage: opties.bijlage,
    beam_id: staaf.beamId,
    section: staaf.doorsnede,
    concrete_class: staaf.betonklasse,
    reinforcement_grade: staaf.staalsoort,
    cage: staaf.korf,
    length_m: staaf.lengteMm / 1000,
    target_segment_length_mm: opties.segmentLengteMm,
    max_segments: opties.maxSegmenten,
    limit_state: opties.grenstoestand,
    // φ_ef VAN DEZE STAAF.
    //
    // De kern verwerkt kruip volgens 5.8.6(4): alle rekwaarden in het
    // spanning-rekdiagram maal (1 + φ_ef). Voor de beginhelling komt dat neer
    // op E_c,eff = E_cm/(1 + φ_ef) — precies de effectieve elasticiteitsmodulus
    // die 7.4.3(5) met (7.20) voor de BGT voorschrijft.
    //
    // IN DE BGT (alle drie de combinaties) gaat φ(∞,t₀) zelf de kern in, dus
    // (5.19) met M₀Eqp/M₀Ed = 1. 7.4.3(5) vraagt daar de volle
    // kruipcoëfficiënt, E_c,eff = E_cm/(1 + φ(∞,t₀)), en kent geen verhouding;
    // in de quasi-blijvende combinatie is de verhouding bovendien per definitie
    // 1. Voor de karakteristieke en de frequente combinatie is het de veilige
    // kant (besluit bij issue #24).
    //
    // IN DE UGT bepaalt de KERN φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed uit de meegestuurde
    // eerste-orde-momenten (`kruip_5_19`), met dezelfde begrensde regel als de
    // kolomtoets (`phi_ef_5_19_begrensd` in nen-en-1992-1-1/src/kolom.rs).
    // `phi_ef` blijft dan 0: twee bronnen voor één getal weigert de kern.
    // Zonder die momenten blijft het φ(∞,t₀), de bovengrens van (5.19): de
    // laagste EI en dus de ongunstige kant.
    phi_ef: kruip ? 0 : (staaf.phiInfT0 ?? opties.phiEf),
    ...(kruip ? { kruip_5_19: kruip } : {}),
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
  /**
   * −1 voor een staaf die tegen zijn referentierichting in is getekend: dan
   * staat het moment hier in de referentierichting, waarin de korf boven en
   * onder noemt. De segmentgrenzen blijven vanaf de beginknoop — de EI per
   * segment gaat terug naar de solver, en de korf is langs de staaf gelijk.
   */
  momentTeken: 1 | -1 = 1,
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
      m_ed_knm: (momentTeken * beste.M_max) / 1e6,
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

// ── (5.19): de eerste-orde-momenten per staaf ──────────────────────────────

/**
 * Het moment (N·mm) op plaats `x` (mm) langs een staaf, lineair geïnterpoleerd
 * tussen de stations. Valt `x` binnen de tolerantie op een station, dan dat
 * station zelf — bij dezelfde invoer delen alle combinaties dezelfde stations.
 */
export function momentOpX(el: ElementForces, x: number): number {
  const xs = el.stations_mm;
  const ms = el.bendingMoment;
  if (xs.length === 0) {
    // Zonder stations alleen de eindmomenten; lineair ertussen.
    const L = el.L_mm > 0 ? el.L_mm : 1;
    const t = Math.min(1, Math.max(0, x / L));
    return el.M_start + t * (el.M_end - el.M_start);
  }
  const EPS = 1e-6;
  for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - x) <= EPS) return ms[i];
  if (x <= xs[0]) return ms[0];
  if (x >= xs[xs.length - 1]) return ms[ms.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (x < xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ms[i - 1] + t * (ms[i] - ms[i - 1]);
    }
  }
  return ms[ms.length - 1];
}

/**
 * De plaats en de waarde (N·mm, met teken) van het grootste |M| langs de staaf.
 * Bij gelijke |M| telt de eerste plaats vanaf de beginknoop, zodat de keuze niet
 * van afronding afhangt.
 */
export function grootsteMoment(el: ElementForces): { xMm: number; mNmm: number } {
  const kandidaten: [number, number][] =
    el.stations_mm.length > 0
      ? el.stations_mm.map((xi, i) => [xi, el.bendingMoment[i]])
      : [[0, el.M_start], [el.L_mm, el.M_end]];
  let [x, m] = kandidaten[0];
  for (const [xi, mi] of kandidaten) {
    if (Math.abs(mi) > Math.abs(m)) {
      x = xi;
      m = mi;
    }
  }
  return { xMm: x, mNmm: m };
}

/** Eén quasi-blijvende combinatie met haar eerste-orde-oplossing. */
export interface QuasiBlijvendResultaat {
  combo: SecondOrderCombo;
  /** `null` = de combinatie activeert geen last; dan is M₀Eqp overal 0. */
  resultaat: SolverResult | null;
}

/**
 * De eerste-orde-oplossing van elke quasi-blijvende combinatie (6.16b). Eén
 * keer per rekengang: M₀Eqp hangt niet van de UGT-combinatie af.
 */
export function eersteOrdeQuasiBlijvend(
  input: MultiInput,
  quasiBlijvend: readonly SecondOrderCombo[],
  losOp: (input: MultiInput, combo: SecondOrderCombo) => SolverResult | null =
    solveCombinationFirstOrder,
): QuasiBlijvendResultaat[] {
  return quasiBlijvend.map((combo) => ({ combo, resultaat: losOp(input, combo) }));
}

/**
 * De invoer van (5.19) per staaf voor ÉÉN UGT-combinatie — issue #24.
 *
 * EN 1992-1-1 5.8.4(2): φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed, met M₀Eqp en M₀Ed de
 * EERSTE-ORDE-momenten in de quasi-blijvende combinatie en in de
 * rekencombinatie. De vaste bovengrens φ(∞,t₀) (verhouding 1) gaf in de UGT
 * een lagere stijfheid dan de norm vraagt.
 *
 * DE DOORSNEDE — 5.8.4(3): "Indien M₀Eqp/M₀Ed in een element of constructie
 * varieert, mag de verhouding zijn berekend voor de doorsnede met het maximale
 * moment". Genomen: de plaats van het grootste |M₀Ed| langs de staaf in de
 * eerste-orde-oplossing van DEZE UGT-combinatie, en M₀Eqp op dezelfde plaats
 * uit de eerste-orde-oplossing van elke quasi-blijvende combinatie.
 *
 * DE EERSTE ORDE. Beide oplossingen komen uit `solveCombinationFirstOrder`:
 * hetzelfde model, geometrisch lineair, met de elastische staaf-EI en zonder
 * segmentstijfheden. Pas daarna draait de fysisch niet-lineaire lus.
 *
 * WAT DE KERN ERMEE DOET (`kruip_5_19` in concrete-check/src/segments.rs):
 * begrenst φ_ef tussen 0 en φ(∞,t₀); M₀Ed ≈ 0, een tegengesteld teken of
 * |M₀Eqp| > |M₀Ed| houdt φ(∞,t₀) met een notitie; bij meerdere quasi-blijvende
 * combinaties telt de grootste φ_ef en noemt de kern welke.
 *
 * Alleen staven MET φ(∞,t₀) krijgen een regel: zonder kruipcoëfficiënt valt er
 * niets te verhouden, en die staven meldt de lus al (`zonderKruipcoefficient`).
 * Een UGT-combinatie zonder lasten levert een lege Map; de lus meldt dan
 * `zonderLasten`.
 *
 * `momentTeken` speelt geen rol: M₀Eqp en M₀Ed worden in dezelfde lokale assen
 * gelezen, dus hun onderlinge teken en hun verhouding blijven gelijk.
 */
export function kruipInvoerVoorCombinatie(
  input: MultiInput,
  ugt: SecondOrderCombo,
  quasiBlijvend: readonly QuasiBlijvendResultaat[],
  staven: readonly BetonSegmentStaaf[],
  losOp: (input: MultiInput, combo: SecondOrderCombo) => SolverResult | null =
    solveCombinationFirstOrder,
): Map<number, Kruip519Invoer> {
  const uit = new Map<number, Kruip519Invoer>();
  const metKruip = staven.filter((s) => s.phiInfT0 !== undefined);
  if (metKruip.length === 0) return uit;
  const eersteOrde = losOp(input, ugt);
  if (!eersteOrde) return uit;
  for (const staaf of metKruip) {
    const el = eersteOrde.elements.get(staaf.beamId);
    if (!el) {
      throw new Error(
        `Staaf ${staaf.beamId}: de eerste-orde-oplossing van combinatie "${ugt.name}" kent ` +
          `deze staaf niet, dus M₀Ed van (5.19) is niet te bepalen.`,
      );
    }
    const { xMm, mNmm } = grootsteMoment(el);
    uit.set(staaf.beamId, {
      phi_inf_t0: staaf.phiInfT0!,
      ugt_combinatie: ugt.name,
      m0_ed_knm: mNmm / 1e6,
      x_mm: xMm,
      quasi_blijvend: quasiBlijvend.map(({ combo, resultaat }) => {
        // Een quasi-blijvende combinatie zonder enige last: M₀Eqp is dan
        // werkelijk nul, niet onbekend.
        if (!resultaat) return { combinatie: combo.name, m0_eqp_knm: 0 };
        const q = resultaat.elements.get(staaf.beamId);
        if (!q) {
          throw new Error(
            `Staaf ${staaf.beamId}: de eerste-orde-oplossing van de quasi-blijvende ` +
              `combinatie "${combo.name}" kent deze staaf niet, dus M₀Eqp van (5.19) is ` +
              `niet te bepalen.`,
          );
        }
        return { combinatie: combo.name, m0_eqp_knm: momentOpX(q, xMm) / 1e6 };
      }),
    });
  }
  return uit;
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
  if (o.kruip519 && o.kruip519.size > 0 && o.grenstoestand !== "DesignValues") {
    throw new Error(
      `Combinatie "${combo.name}": de verhouding M₀Eqp/M₀Ed van (5.19) is meegegeven bij een ` +
        `BGT-berekening. In de BGT vraagt 7.4.3(5) de volle φ(∞,t₀); de verhouding hoort ` +
        `alleen bij de UGT.`,
    );
  }
  const geschiedenis: RondeVerslag[] = [];
  // Wie mist er een kruipcoëfficiënt? Eén keer bepaald en in elke uitkomst
  // meegegeven — ook in de uitkomst zonder lasten, zodat het antwoord nooit
  // van de weg door de lus afhangt.
  const zonderKruipcoefficient = staven
    .filter((s) => s.phiInfT0 === undefined && !(o.phiEf > 0))
    .map((s) => s.beamId);

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
        zonderKruipcoefficient,
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
      const krachten = krachtenPerSegment(el, grenzen, staaf.beamId, staaf.momentTeken ?? 1);
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
        zonderKruipcoefficient,
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
