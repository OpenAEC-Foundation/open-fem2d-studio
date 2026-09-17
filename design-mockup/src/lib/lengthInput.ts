/** Alle bewerkbare lengtes worden in mm ingevoerd. Alleen aan de UI-grens
 * converteren: geometrie bewaart mm, toets- en windvelden soms m, lasten
 * fracties. Projectopslag, rekenkern en rapporteenheden veranderen niet.
 * Peilmaten en hover-coördinaten blijven als alleen-lezen canvasweergave in m;
 * maatlijnen, invoerhints en lengtes naast invoervelden tonen mm.
 */
export type LengthUnit = "mm" | "m";

export const mmToMeters = (mm: number): number => mm / 1000;
export const metersToMm = (m: number): number => m * 1000;

/** Strikt decimaal getal; komma en punt zijn decimaaltekens, geen duizendtallen. */
export function parseLength(text: string, storedUnit: LengthUnit = "mm"): number {
  const decimal = text.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(decimal)) return NaN;
  const mm = Number(decimal);
  return Number.isFinite(mm) ? (storedUnit === "m" ? mmToMeters(mm) : mm) : NaN;
}

/** Geen afronding van opgeslagen maten bij openen en ongewijzigd bevestigen. */
export function formatLength(value: number | null | undefined, storedUnit: LengthUnit = "mm"): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(storedUnit === "m" ? metersToMm(value) : value);
}
