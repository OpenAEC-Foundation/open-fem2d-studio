import type { DisplayFlags } from "../components/fem/FemResultsOverlay";

/**
 * De weergavelagen die resultaten tonen. De tab "Model" zet ze uit, de tab
 * "Resultaten" en Berekenen zetten ze weer aan. Deelopties (reactie X/Z,
 * knoopwaarden, extremen, snedetekens) en schalen blijven staan, zodat ze bij
 * terugkeer naar de resultaten weer zo zijn als de gebruiker ze liet.
 */
export const RESULTAATLAGEN = ["M", "V", "N", "deflection", "rotation", "EI", "reactions", "uc"] as const;

/** Dezelfde vlaggen met alle resultaatlagen uit. */
export function zonderResultaten(flags: DisplayFlags): DisplayFlags {
  const uit = { ...flags };
  for (const k of RESULTAATLAGEN) uit[k] = false;
  return uit;
}

/** De resultaatlagen die als DIAGRAM op de systeemlijn liggen. */
const DIAGRAMLAGEN = ["M", "V", "N", "deflection", "rotation", "EI"] as const;

/**
 * Staat het aanzicht op ware grootte (issue #45) in beeld?
 *
 * Aan in de tab Model en bij de belastinggevallen, als het vinkje aan staat.
 * NIET in de resultaatweergave, en ook niet zodra er een resultaatdiagram op
 * het tekenvlak ligt (een belastinggeval of combinatie met een berekend
 * resultaat en M/V/N/u/φ/EI aan, of de omhullende): die diagrammen hangen aan
 * de systeemlijn, en een vlak van een halve meter hoog eronder maakt ze
 * onleesbaar. Het vinkje zelf blijft staan; terug naar Model brengt het
 * aanzicht terug.
 */
export function aanzichtInBeeld(s: {
  flags: DisplayFlags;
  /** De tab Resultaten is actief. */
  resultsMode: boolean;
  /** false = de tab Model (geen lasten, geen resultaten). */
  showLoads: boolean;
  /** Er ligt een resultaat klaar voor het getoonde geval of de getoonde combinatie. */
  heeftResultaat: boolean;
  /** De omhullende wordt getoond (en is er). */
  omhullende: boolean;
}): boolean {
  if (s.flags.aanzicht !== true || s.resultsMode) return false;
  if (!s.showLoads) return true;
  const diagram = DIAGRAMLAGEN.some((k) => s.flags[k] === true);
  return !(s.omhullende || (s.heeftResultaat && diagram));
}
