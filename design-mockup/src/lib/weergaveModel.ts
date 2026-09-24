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
