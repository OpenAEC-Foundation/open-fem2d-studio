/**
 * checkTypes.ts — gedeeld contract voor de normtoetsing.
 *
 * Vier kernen leveren hetzelfde NamedCheck-contract: staal (EN 1993), hout
 * (EN 1995), kruislaaghout (EN 1995, per lamel) en beton (EN 1992). Alleen de
 * kopregels verschillen — profiel/staalsoort, doorsnede/sterkteklasse,
 * opbouw/lamelklasse, doorsnede/betonklasse. De helpers onderaan geven die
 * kopregels één naam, zodat het paneel en het rapport niet per materiaal
 * hoeven te vertakken.
 */
import type { BeamCheckResult } from "./types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "./types/timber/TimberBeamCheckResult";
import type { CltBeamCheckResult } from "./types/timber/CltBeamCheckResult";
import type { ConcreteBeamCheckResult } from "./types/concrete/ConcreteBeamCheckResult";

/** Eén toetsresultaat: staal, hout, kruislaaghout of beton. */
export type MemberCheckResult =
  | BeamCheckResult
  | TimberBeamCheckResult
  | CltBeamCheckResult
  | ConcreteBeamCheckResult;

/** Type-guard: alleen een staalresultaat heeft `profile_name`. */
export function isSteelCheckResult(r: MemberCheckResult): r is BeamCheckResult {
  return "profile_name" in r;
}

/** Type-guard: alleen een betonresultaat heeft `concrete_class`. */
export function isConcreteCheckResult(r: MemberCheckResult): r is ConcreteBeamCheckResult {
  return "concrete_class" in r;
}

/** Profiel of doorsnede voor de kopregel: "HEA 200", "96 x 450", "300 x 500". */
export function sectionLabel(r: MemberCheckResult): string {
  return isSteelCheckResult(r) ? r.profile_name : r.section_name;
}

/** Materiaal voor de kopregel: staalsoort, betonklasse of houtsterkteklasse. */
export function gradeLabel(r: MemberCheckResult): string {
  if (isSteelCheckResult(r)) return r.steel_grade;
  if (isConcreteCheckResult(r)) return r.concrete_class;
  return r.strength_class;
}

/** De norm waarmee getoetst is, kort. */
export function normLabel(r: MemberCheckResult): string {
  if (isSteelCheckResult(r)) return "EN 1993";
  if (isConcreteCheckResult(r)) return "EN 1992";
  return "EN 1995";
}

/** Staaf die herkend maar bewust niet getoetst is, met expliciete reden. */
export interface CheckSkip {
  beamId: number;
  reason: string;
}
