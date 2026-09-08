/**
 * checkTypes.ts — gedeeld contract voor de toetsing.
 *
 * Vijf kernen leveren hetzelfde NamedCheck-contract: staal (EN 1993), hout
 * (EN 1995), kruislaaghout (EN 1995, per lamel), beton (EN 1992) en de vrije
 * spanningstoets (geen norm — een doorsnede plus een toelaatbare spanning,
 * getoetst op de vergelijkspanning van von Mises). Alleen de kopregels
 * verschillen — profiel/staalsoort, doorsnede/sterkteklasse, opbouw/
 * lamelklasse, doorsnede/betonklasse, doorsnede/materiaalnaam. De helpers
 * onderaan geven die kopregels één naam, zodat het paneel en het rapport niet
 * per materiaal hoeven te vertakken.
 */
import type { BeamCheckResult } from "./types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "./types/timber/TimberBeamCheckResult";
import type { CltBeamCheckResult } from "./types/timber/CltBeamCheckResult";
import type { ConcreteBeamCheckResult } from "./types/concrete/ConcreteBeamCheckResult";
import type { SpanningBeamCheckResult } from "./types/spanning/SpanningBeamCheckResult";

/** Eén toetsresultaat: staal, hout, kruislaaghout, beton of vrije spanning. */
export type MemberCheckResult =
  | BeamCheckResult
  | TimberBeamCheckResult
  | CltBeamCheckResult
  | ConcreteBeamCheckResult
  | SpanningBeamCheckResult;

/** Type-guard: alleen een staalresultaat heeft `profile_name`. */
export function isSteelCheckResult(r: MemberCheckResult): r is BeamCheckResult {
  return "profile_name" in r;
}

/** Type-guard: alleen een betonresultaat heeft `concrete_class`. */
export function isConcreteCheckResult(r: MemberCheckResult): r is ConcreteBeamCheckResult {
  return "concrete_class" in r;
}

/**
 * Type-guard: alleen de vrije spanningstoets draagt een toelaatbare spanning.
 * Moet vóór de terugval op `strength_class` staan — een spanningsresultaat
 * heeft die niet.
 */
export function isStressCheckResult(r: MemberCheckResult): r is SpanningBeamCheckResult {
  return "f_toel_mpa" in r;
}

/** Profiel of doorsnede voor de kopregel: "HEA 200", "96 x 450", "300 x 500". */
export function sectionLabel(r: MemberCheckResult): string {
  return isSteelCheckResult(r) ? r.profile_name : r.section_name;
}

/** Materiaal voor de kopregel: staalsoort, betonklasse, houtklasse of vrije naam. */
export function gradeLabel(r: MemberCheckResult): string {
  if (isSteelCheckResult(r)) return r.steel_grade;
  if (isConcreteCheckResult(r)) return r.concrete_class;
  if (isStressCheckResult(r)) {
    const f = r.f_toel_mpa.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
    return `${r.material_name}, f = ${f} N/mm²`;
  }
  return r.strength_class;
}

/** Type-guard: alleen kruislaaghout draagt een lamellenopbouw. */
export function isCltCheckResult(r: MemberCheckResult): r is CltBeamCheckResult {
  return "layup" in r;
}

/**
 * Type-guard: massief hout. Moet ná `isCltCheckResult` gevraagd worden —
 * kruislaaghout is structureel een superset en draagt dezelfde
 * `strength_class`.
 */
export function isTimberCheckResult(r: MemberCheckResult): r is TimberBeamCheckResult {
  return !isCltCheckResult(r) && "strength_class" in r;
}

/** Uit welke rekenkern een toetsresultaat komt. Eén soort per kern. */
export type CheckSoort = "staal" | "hout" | "clt" | "beton" | "spanning";

/**
 * De soort van dit resultaat, of `null` voor een vorm die hier niet bekend is.
 *
 * WAAROM GEEN if / else-if / ELSE
 * Deze classificatie stond eerder als keten die eindigde in een kale `else`
 * voor hout. Alles wat geen staal en geen beton was, werd daarmee hout — ook
 * de vrije spanningstoets, die helemaal geen norm achter zich heeft. Het
 * rapport zette vervolgens "Eurocode 5 — Hout" bij de toegepaste normen van
 * een model zonder één houten staaf, en de gebruiker kreeg hem er niet uit:
 * de regel "waarop getoetst is telt altijd" wint van zijn vinkje.
 *
 * Daarom herkent elke soort zich hier aan zijn eigen veld en vangt geen enkele
 * tak "de rest" op. Een resultaatsoort die er later bijkomt zonder eigen tak
 * komt als `null` naar buiten — dat is "geen norm", de veilige uitkomst — in
 * plaats van dat hij stilzwijgend een norm meebrengt die niet is toegepast.
 */
export function checkSoort(r: MemberCheckResult): CheckSoort | null {
  if (isSteelCheckResult(r)) return "staal";
  if (isConcreteCheckResult(r)) return "beton";
  if (isStressCheckResult(r)) return "spanning";
  if (isCltCheckResult(r)) return "clt";
  if (isTimberCheckResult(r)) return "hout";
  return null;
}

/** Hulptype dat bij het compileren weigert zodra `T` niet leeg is. */
type MoetLeegZijn<T extends never> = T;

/**
 * Vangnet bij het compileren: elk lid van `MemberCheckResult` moet in
 * `checkSoort` een eigen tak hebben. Komt er een zesde resultaatsoort bij
 * zonder tak, dan blijft die hier over en weigert `tsc` dit bestand — dat is
 * eerder dan wanneer hij in een rapport opduikt. Het vangnet ligt náást de
 * `null`-uitkomst hierboven en niet in plaats daarvan: het compileren bewaakt
 * de code, de `null` bewaakt de uitvoer.
 */
export type OngedekteResultaatSoort = MoetLeegZijn<
  Exclude<
    MemberCheckResult,
    | BeamCheckResult
    | ConcreteBeamCheckResult
    | SpanningBeamCheckResult
    | CltBeamCheckResult
    | TimberBeamCheckResult
  >
>;

/**
 * Normaanduiding per soort. `null` is geen omissie maar de aard van de toets:
 * de weerstand van de vrije spanningstoets is een OPGEGEVEN toelaatbare
 * spanning en geen normwaarde.
 *
 * Kruislaaghout draagt dezelfde norm als massief hout: de lamellen worden per
 * stuk getoetst, maar het blijft EN 1995.
 *
 * De aanduidingen zijn woordelijk die van de rapportkern (`report`-crate,
 * `NORM_STEEL` / `NORM_TIMBER` / `NORM_CONCRETE`), zodat scherm, CSV en PDF
 * over hetzelfde model niet drie antwoorden geven.
 */
const NORM_PER_SOORT: Record<CheckSoort, string | null> = {
  staal: "EN 1993-1-1",
  hout: "EN 1995-1-1",
  clt: "EN 1995-1-1",
  beton: "EN 1992-1-1",
  spanning: null,
};

/** Wat er staat waar een norm hoort maar er geen is; zoals de rapportkern. */
export const GEEN_NORM = "geen norm";

/**
 * De norm waaronder deze toets valt, of `null` als er geen norm achter zit.
 * Wie een normnummer op papier zet, gebruikt dit — en plakt er niets achter:
 * een aanduiding samenstellen uit een label plus "-1-1" leverde voor de vrije
 * spanningstoets "spanning-1-1" op, een norm die niet bestaat.
 */
export function normAanduiding(r: MemberCheckResult): string | null {
  const soort = checkSoort(r);
  return soort === null ? null : NORM_PER_SOORT[soort];
}

/**
 * Waarmee getoetst is, als één regel voor scherm, tabel en export. De vrije
 * spanningstoets hoort bij géén norm en zegt dat ook zo — "EN …" suggereren
 * zou de lezer op het verkeerde been zetten.
 */
export function normLabel(r: MemberCheckResult): string {
  return normAanduiding(r) ?? GEEN_NORM;
}

/** Staaf die herkend maar bewust niet getoetst is, met expliciete reden. */
export interface CheckSkip {
  beamId: number;
  reason: string;
}
