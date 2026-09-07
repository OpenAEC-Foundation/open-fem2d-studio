/**
 * Catalogusprofielen als bouwsteen voor de profieleditor.
 *
 * Bron: `steelSectionDims.generated.ts` (gegenereerd uit de Rust-
 * profieldatabase). De vertaling naar de `soort` die de motor verwacht staat
 * hier op één plek: de database noemt UNP én UPE "Channel", maar de motor
 * rekent een UNP met de toelopende flens van DIN 1026-1 (`ChannelSchuin`).
 */
import { STEEL_SECTION_DIMS, type SteelSectionDims } from "../steelSectionDims.generated";
import { STEEL_SECTIONS } from "../steelSections.generated";
import { profileLookupKey } from "../steelCheckBuilder";
import type { Basisprofiel, MotorSoort } from "./types";

/** Reeksindeling op naamprefix, zoals het profielkeuzescherm hem kent. */
export const REEKSEN: Array<{ id: string; label: string; match: (naam: string) => boolean }> = [
  { id: "IPE", label: "IPE", match: (n) => n.startsWith("IPE") },
  { id: "HEA", label: "HEA", match: (n) => n.startsWith("HEA") },
  { id: "HEB", label: "HEB", match: (n) => n.startsWith("HEB") },
  { id: "HEM", label: "HEM", match: (n) => n.startsWith("HEM") },
  { id: "UNP", label: "UNP", match: (n) => n.startsWith("UNP") },
  { id: "UPE", label: "UPE", match: (n) => n.startsWith("UPE") },
  // Oude Differdinger parallelflensreeksen; zie
  // scripts/genereer-oude-profielen.mjs voor de bron van de maten.
  { id: "DIE", label: "DIE (oud)", match: (n) => n.startsWith("DIE") },
  { id: "DIL", label: "DIL (oud)", match: (n) => n.startsWith("DIL") },
  { id: "DIN", label: "DIN (oud)", match: (n) => n.startsWith("DIN") },
  { id: "KOKER", label: "Koker (SHS/RHS)", match: (n) => n.startsWith("SHS") || n.startsWith("RHS") || n.startsWith("HFRHS") },
  { id: "CHS", label: "Buis (CHS)", match: (n) => n.startsWith("CHS") },
];

/**
 * Naam om te tónen bij een databasesleutel: "DIN425" → "DIN 42.5".
 *
 * De sleutel is de genormaliseerde naam (zonder spaties en punten) en die is
 * bij de oude reeksen misleidend: DIN 42.5 en DIN 47.5 zijn de historische
 * maten 42½ en 47½, geen maat 425 of 475.
 */
export function profielLabel(sleutel: string): string {
  return STEEL_SECTION_DIMS[sleutel]?.naam ?? sleutel;
}

/**
 * Sorteersleutel: het eerste getal in de LEESBARE naam, dus met de decimaal
 * erin ("DIN 42.5" → 42,5). Op de sleutel sorteren zou 42.5 als 425 lezen en
 * de maat achteraan zetten.
 */
function maatVan(sleutel: string): number {
  const m = /(\d+(?:[.,]\d+)?)/.exec(profielLabel(sleutel));
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
}

/** Profielnamen (databasesleutels) van één reeks, op maat gesorteerd. */
export function profielenVanReeks(reeksId: string): string[] {
  const r = REEKSEN.find((x) => x.id === reeksId);
  if (!r) return [];
  return Object.keys(STEEL_SECTION_DIMS)
    .filter((naam) => r.match(naam))
    .sort((a, b) => maatVan(a) - maatVan(b) || a.localeCompare(b));
}

/** Reeks waarin een profielnaam valt; null als geen reeks past. */
export function reeksVanProfiel(naam: string): string | null {
  const key = profileLookupKey(naam);
  return REEKSEN.find((r) => r.match(key))?.id ?? null;
}

function motorSoort(naam: string, dims: SteelSectionDims): MotorSoort {
  switch (dims.kind) {
    case "ISection":
      return "ISection";
    case "Channel":
      // DIN 1026-1 (UNP) heeft 8 % flensschuinte; UPE heeft evenwijdige flenzen.
      return profileLookupKey(naam).startsWith("UNP") ? "ChannelSchuin" : "Channel";
    case "Shs":
      return "Shs";
    case "Rhs":
      return "Rhs";
    case "Chs":
      return "Chs";
  }
}

/**
 * Catalogusprofiel → invoer voor de motor; undefined als het niet bestaat.
 * `naam` wordt de databasesleutel ("IPE300"), dezelfde vorm als het
 * profielkeuzescherm op een staaf zet.
 */
export function basisprofielVan(naam: string): Basisprofiel | undefined {
  const sleutel = profileLookupKey(naam);
  const dims = STEEL_SECTION_DIMS[sleutel];
  if (!dims) return undefined;
  return {
    naam: sleutel,
    soort: motorSoort(naam, dims),
    h: dims.h,
    b: dims.b,
    tw: dims.tw,
    tf: dims.tf,
    r: dims.r,
  };
}

/** Oppervlak uit de database (mm²), voor de snelle TS-schatting tijdens tekenen. */
export function catalogusOppervlak(naam: string): number | undefined {
  return STEEL_SECTIONS[profileLookupKey(naam)]?.A;
}
