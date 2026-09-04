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

/**
 * Waarmee getoetst is, kort. De vrije spanningstoets hoort bij géén norm en
 * zegt dat ook zo — "EN …" suggereren zou de lezer op het verkeerde been
 * zetten.
 */
export function normLabel(r: MemberCheckResult): string {
  if (isSteelCheckResult(r)) return "EN 1993";
  if (isConcreteCheckResult(r)) return "EN 1992";
  if (isStressCheckResult(r)) return "spanning";
  return "EN 1995";
}

/** Staaf die herkend maar bewust niet getoetst is, met expliciete reden. */
export interface CheckSkip {
  beamId: number;
  reason: string;
}
