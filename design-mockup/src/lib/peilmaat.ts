/**
 * peilmaat.ts — de peilmaat van een niveau op het tekenvlak (issue #48).
 *
 * Een niveau (horizontale stramienas) draagt een peilmaat in bouwkundige
 * notatie, "+5,00 m", met het peildriehoekje op de lijn. Klikken op de
 * peilmaat opent een invoerveld waarin het NIVEAU zelf wordt gewijzigd, in mm
 * (alle lengte-invoer is in mm). Het tekenvlak verschuift het niveau daarna
 * met `verplaatsStramienAs`: de knopen die erop liggen gaan mee, in één
 * undo-stap.
 *
 * Hier staan alleen de regels, zonder React: de tekst van de peilmaat, de
 * afmetingen van het klikvlak en het lezen van de invoer. Het tekenvlak en de
 * testbatterij gebruiken dezelfde functies.
 */
import { formatLength, parseLength } from "./lengthInput";

/**
 * Letterhoogte van de peilmaat op het tekenvlak (px). Was 10,5; groter zodat
 * hij bij elke zoomstand leesbaar en aan te wijzen is. De tekst schaalt niet
 * mee met de zoom, net als de andere maten.
 */
export const PEILMAAT_FONT_PX = 12.5;
/**
 * Gemiddelde tekenbreedte van de peilmaat (px): monospace, ~0,6 em. Alleen
 * voor het klikvlak en de plaats van de knop ernaast; de tekst zelf meet de
 * browser.
 */
export const PEILMAAT_TEKEN_PX = PEILMAAT_FONT_PX * 0.6;
/** Halve breedte en hoogte van het peildriehoekje (px). */
export const PEIL_DRIEHOEK_HALF_PX = 6;
export const PEIL_DRIEHOEK_HOOGTE_PX = 8;
/** Ruimte tussen de lijn en de tekst (px). */
export const PEILMAAT_AFSTAND_PX = 12;
/** Minimale hoogte van het klikvlak (px): ruim boven de letterhoogte. */
export const PEILMAAT_KLIK_HOOGTE_PX = 24;

/**
 * Peilmaat van een niveau in bouwkundige notatie: "+5,00 m" boven peil,
 * "−1,20 m" eronder en "±0,00 m" op het nulniveau. Een alleen-lezen weergave
 * in m, zoals op tekeningen; de invoer is in mm.
 */
export function peilmaatTekst(positieMm: number): string {
  const m = positieMm / 1000;
  const teken = Math.abs(m) < 0.005 ? "±" : m > 0 ? "+" : "−";
  return `${teken}${Math.abs(m).toFixed(2).replace(".", ",")} m`;
}

/**
 * De tekst naast het niveau: een eigen niveaunaam ("verdieping", "maaiveld")
 * vóór de peilmaat; een automatisch volgnummer wordt niet getoond.
 */
export function niveauLabel(label: string, positieMm: number): string {
  const peil = peilmaatTekst(positieMm);
  const eigenNaam = /^\d+$/.test(label.trim()) ? "" : label.trim();
  return eigenNaam ? `${eigenNaam}  ${peil}` : peil;
}

/** Geschatte breedte van een peilmaattekst op het scherm (px). */
export function peilmaatBreedtePx(tekst: string): number {
  return tekst.length * PEILMAAT_TEKEN_PX;
}

/** De beginwaarde van het invoerveld: het huidige niveau in mm. */
export function niveauInvoerStart(positieMm: number): string {
  return formatLength(positieMm);
}

/** Uitkomst van `leesNiveauInvoer`. */
export type NiveauInvoer =
  | { ok: true; mm: number }
  /** Geen getal (leeg, letters, twee decimaaltekens). */
  | { ok: false; fout: "ongeldig" }
  /** Er ligt al een ander niveau op deze hoogte; `peil` is dat niveau. */
  | { ok: false; fout: "bezet"; peil: string };

/**
 * Leest het ingetypte niveau (mm; komma of punt als decimaalteken, negatief
 * mag: onder peil). Een hoogte waar al een ANDER niveau ligt (binnen
 * `tolMm`) wordt geweigerd: de knopen van beide niveaus zouden op elkaar
 * vallen. Het eigen niveau telt niet mee, zodat ongewijzigd bevestigen kan.
 * De tolerantie is die van de stramienmutator (`STRAMIEN_TOL_MM`, 1 mm).
 */
export function leesNiveauInvoer(
  tekst: string,
  eigenAsId: string,
  niveaus: readonly { id: string; position: number }[],
  tolMm = 1,
): NiveauInvoer {
  // Het typografische minteken (zoals de peilmaat het toont) telt als "-".
  const mm = parseLength(tekst.replace(/−/g, "-"));
  if (!Number.isFinite(mm)) return { ok: false, fout: "ongeldig" };
  const ander = niveaus.find((n) => n.id !== eigenAsId && Math.abs(n.position - mm) <= tolMm);
  if (ander) return { ok: false, fout: "bezet", peil: peilmaatTekst(ander.position) };
  return { ok: true, mm };
}
