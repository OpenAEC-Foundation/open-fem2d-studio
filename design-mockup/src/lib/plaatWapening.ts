/**
 * plaatWapening — de vorm van de aanwezige wapening van een betonwand
 * (`Plate.wapening`, issue #25), en de poortcontrole daarop.
 *
 * De vorm is precies die van de kerninvoer `PlaatWapeningInvoer`: de bouwer
 * geeft hem ongewijzigd door. Deze module rekent niets en toetst geen norm;
 * zij weigert alleen een vorm die de kern niet zou kunnen lezen of die stil
 * iets anders zou betekenen (een tikfout in een veldnaam, Ø zonder h.o.h.,
 * beide opgaven tegelijk). De normregels (9.6, 7.3, bijlage F) zitten in de
 * Rust-kern `plaat-check`, langs alle drie de wegen dezelfde.
 */
import type { PlaatWapeningInvoer } from "./types/plaat/PlaatWapeningInvoer";

/** De betonstaalsoorten die de kern kent (tabel C.1, `REINFORCEMENT_GRADES`). */
export const PLAAT_STAALSOORTEN = ["B500A", "B500B", "B500C"] as const;

/** De milieuklassen van tabel 4.1 (`ExposureClass`). */
export const PLAAT_MILIEUKLASSEN = [
  "X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3", "XS1", "XS2", "XS3",
  "XF1", "XF2", "XF3", "XF4", "XA1", "XA2", "XA3",
] as const;

const WAPENING_VELDEN = ["staalsoort", "horizontaal", "verticaal", "milieuklasse"];
const RICHTING_VELDEN = ["zijde_1", "zijde_2"];
const LAAG_VELDEN = ["diameter_mm", "hoh_mm", "as_mm2_per_m", "dekking_mm"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function positief(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function onbekend(o: Record<string, unknown>, toegestaan: readonly string[], pad: string, fouten: string[]) {
  for (const k of Object.keys(o)) {
    if (!toegestaan.includes(k)) fouten.push(`${pad}.${k}: onbekend veld (toegestaan: ${toegestaan.join(", ")}).`);
  }
}

function keurLaag(laag: unknown, pad: string, fouten: string[]) {
  if (!isObject(laag)) {
    fouten.push(`${pad}: object verwacht.`);
    return;
  }
  onbekend(laag, LAAG_VELDEN, pad, fouten);
  const metStaven = laag.diameter_mm !== undefined || laag.hoh_mm !== undefined;
  const metOppervlak = laag.as_mm2_per_m !== undefined;
  if (metStaven && metOppervlak) {
    fouten.push(`${pad}: óf diameter_mm met hoh_mm, óf as_mm2_per_m — niet beide.`);
  } else if (metStaven) {
    if (!positief(laag.diameter_mm)) fouten.push(`${pad}.diameter_mm: positief getal verwacht.`);
    if (!positief(laag.hoh_mm)) fouten.push(`${pad}.hoh_mm: positief getal verwacht.`);
  } else if (metOppervlak) {
    if (!positief(laag.as_mm2_per_m)) fouten.push(`${pad}.as_mm2_per_m: positief getal verwacht.`);
  } else {
    fouten.push(`${pad}: geef diameter_mm met hoh_mm, of as_mm2_per_m.`);
  }
  if (!positief(laag.dekking_mm)) fouten.push(`${pad}.dekking_mm: positieve dekking in mm verwacht.`);
}

/** De vormcontrole op `Plate.wapening`; levert de fouten (leeg = goed). */
export function keurPlaatWapening(w: unknown, pad: string): string[] {
  const fouten: string[] = [];
  if (!isObject(w)) return [`${pad}: object verwacht.`];
  onbekend(w, WAPENING_VELDEN, pad, fouten);
  if (typeof w.staalsoort !== "string" || !(PLAAT_STAALSOORTEN as readonly string[]).includes(w.staalsoort)) {
    fouten.push(`${pad}.staalsoort: ${PLAAT_STAALSOORTEN.join(", ")} verwacht.`);
  }
  if (w.milieuklasse !== undefined && !(PLAAT_MILIEUKLASSEN as readonly string[]).includes(w.milieuklasse as string)) {
    fouten.push(`${pad}.milieuklasse: een milieuklasse uit tabel 4.1 verwacht (bijvoorbeeld XC3).`);
  }
  for (const richting of ["horizontaal", "verticaal"] as const) {
    const r = w[richting];
    const rp = `${pad}.${richting}`;
    if (!isObject(r)) {
      fouten.push(`${rp}: object verwacht.`);
      continue;
    }
    onbekend(r, RICHTING_VELDEN, rp, fouten);
    for (const zijde of RICHTING_VELDEN) {
      if (r[zijde] !== undefined) keurLaag(r[zijde], `${rp}.${zijde}`, fouten);
    }
  }
  return fouten;
}

/**
 * Een lege invoer voor het eigenschappenvenster. De staalsoort staat zichtbaar
 * in het venster en is daar te wijzigen; lagen en milieuklasse zijn leeg.
 */
export function legePlaatWapening(): PlaatWapeningInvoer {
  return { staalsoort: "B500B", horizontaal: {}, verticaal: {} };
}
