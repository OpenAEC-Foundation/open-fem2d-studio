/**
 * checkTypes.ts — gedeeld contract voor de normtoetsing (EN 1993 + EN 1995).
 *
 * Beide Rust-kernen leveren hetzelfde NamedCheck-contract; alleen de
 * kopregels verschillen (profiel/staalsoort vs. doorsnede/sterkteklasse).
 */
import type { BeamCheckResult } from "./types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "./types/timber/TimberBeamCheckResult";

/** Eén toetsresultaat: staal (EN 1993) of hout (EN 1995). */
export type MemberCheckResult = BeamCheckResult | TimberBeamCheckResult;

/** Type-guard: staalresultaat heeft `profile_name`, hout `section_name`. */
export function isSteelCheckResult(r: MemberCheckResult): r is BeamCheckResult {
  return "profile_name" in r;
}

/** Staaf die herkend maar bewust niet getoetst is, met expliciete reden. */
export interface CheckSkip {
  beamId: number;
  reason: string;
}
