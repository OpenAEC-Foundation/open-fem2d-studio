import type { BeamCheckConfig } from "../components/fem/femTypes";
import { kipsteunenGelijk } from "./kipsteunenGelijk";

/**
 * De velden van de toetsconfiguratie die de staafdialoog (BarPropertiesDialog)
 * zelf toont en dus zelf opnieuw opbouwt. Alles wat hier NIET in staat, laat
 * de dialoog ongemoeid.
 *
 * Tot september 2026 bouwde de dialoog de configuratie van nul op en verdween
 * bij OK alles wat hij niet kende: eerst de wapeningskorf en de kolomgegevens
 * (toen apart gerepareerd), daarna de kipsteunen van de onderflens. Door van de
 * bestaande configuratie uit te gaan en alleen deze velden te vervangen, kan
 * een nieuw veld elders in de app niet meer stil wegvallen.
 */
export const DIALOOG_VELDEN = [
  "bucklingLengthY_m", "bucklingLengthZ_m", "lateralRestraints",
  "deflectionClass", "deflectionLimitNumerator", "deflectionAddLimitNumerator", "preCamber_mm",
  "ltbSupportSpacing_m", "kCr", "cltKdef", "cltKdefBron", "performLtbCheck", "ltbLoadPosition",
  "serviceClass", "loadDuration", "spanningSigmaZ",
  "betonKorf", "betonMilieuklasse", "betonConstructieklasse", "betonStaalsoort", "betonStroken",
  "betonStaaltak", "betonKolom",
] as const satisfies readonly (keyof BeamCheckConfig)[];

/** De bestaande configuratie zonder de velden die de dialoog opnieuw invult. */
export function dialoogBasis(cfg0: BeamCheckConfig | undefined): BeamCheckConfig {
  const basis: Record<string, unknown> = { ...(cfg0 ?? {}) };
  for (const k of DIALOOG_VELDEN) delete basis[k];
  return basis as BeamCheckConfig;
}

/**
 * De dialoog kent alleen de rij van de bovenflens. Stonden boven- en onderflens
 * gelijk (het vinkje "Onder en boven gelijk" in het paneel), dan volgt de
 * onderflens de nieuwe bovenflens; anders blijft de onderflens zoals hij was.
 */
export function onderflensNaDialoog(
  cfg0: BeamCheckConfig | undefined,
  nieuweBoven: readonly number[],
  lengteMm: number,
): number[] | undefined {
  const onder0 = cfg0?.lateralRestraintsBottom;
  if (kipsteunenGelijk(cfg0?.lateralRestraints, onder0, lengteMm)) {
    return nieuweBoven.length > 0 ? [...nieuweBoven] : undefined;
  }
  return onder0 ? [...onder0] : undefined;
}
