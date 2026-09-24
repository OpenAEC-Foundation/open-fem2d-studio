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

/**
 * Een lengte in hele mm voor WEERGAVE (labels, tekening, placeholders). Niet
 * voor invoervelden: die gebruiken `formatLength`, dat de opgeslagen waarde
 * exact terugzet. Een afgeleide hoogte als 7,183821405597214 m werd anders
 * letterlijk "7183.821405597214 mm" op het scherm.
 */
export function toonMm(value: number | null | undefined, storedUnit: LengthUnit = "mm"): string {
  if (value == null || !Number.isFinite(value)) return "";
  const mm = storedUnit === "mm" ? value : Number(formatLength(value, storedUnit));
  const r = Math.round(mm);
  return String(Object.is(r, -0) ? 0 : r);
}

/** Geen afronding van opgeslagen maten bij openen en ongewijzigd bevestigen. */
export function formatLength(value: number | null | undefined, storedUnit: LengthUnit = "mm"): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (storedUnit === "mm") return String(value);
  // Verschuif de decimale exponent in plaats van binair te vermenigvuldigen:
  // 1.001 m moet 1001 mm blijven, niet 1000.9999999999999 mm.
  const [mantissa, exponent = "0"] = String(value).split("e");
  return String(Number(`${mantissa}e${Number(exponent) + 3}`));
}
