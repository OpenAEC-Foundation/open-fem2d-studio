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
  { id: "KOKER", label: "Koker (SHS/RHS)", match: (n) => n.startsWith("SHS") || n.startsWith("RHS") || n.startsWith("HFRHS") },
  { id: "CHS", label: "Buis (CHS)", match: (n) => n.startsWith("CHS") },
];

/** Sorteersleutel: eerste getal in de naam (maat), daarna alfabetisch. */
function maatVan(naam: string): number {
  const m = /(\d+)/.exec(naam);
  return m ? parseInt(m[1], 10) : 0;
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
