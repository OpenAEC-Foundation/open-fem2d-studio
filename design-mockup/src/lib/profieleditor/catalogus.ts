/**
 * Catalogusprofielen als bouwsteen voor de profieleditor.
 *
 * Bron: `steelSectionDims.generated.ts` (gegenereerd uit de Rust-
 * profieldatabase). De vertaling naar de `soort` die de motor verwacht staat
 * hier op één plek: de database noemt UNP én UPE "Channel", maar de motor
 * rekent een UNP met de toelopende flens van DIN 1026-1 (`ChannelSchuin`);
 * net zo noemt zij INP én IPE "ISection", terwijl de INP met de toelopende
 * flens van DIN 1025-1 gaat (`ISectionSchuin`). Bij de I beslist de
 * flenshelling uit de database, niet de naam.
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
  // Normaalprofiel DIN 1025-1, toelopende flenzen; zelfde generator.
  { id: "INP", label: "INP (oud)", match: (n) => n.startsWith("INP") },
  { id: "KOKER", label: "Koker (SHS/RHS)", match: (n) => n.startsWith("SHS") || n.startsWith("RHS") || n.startsWith("HFRHS") },
  { id: "CHS", label: "Buis (CHS)", match: (n) => n.startsWith("CHS") },
  // Hoeklijnen (EN 10056-1) in twee reeksen. Beide heten "L lang×kort×dikte",
  // dus het onderscheid zit in de eerste twee getallen: gelijk = gelijkbenig.
  // Ze door elkaar in één lijst zetten geeft een keuzelijst waarin
  // "L 100x100x10" en "L 100x50x8" naast elkaar staan zonder dat te zien is
  // dat de eerste twee even lange benen heeft — en de keuze tussen die twee
  // is bij een hoeklijn ingrijpender dan bij welk ander profiel ook, want zij
  // bepaalt waar de hoofdassen liggen. Zie scripts/genereer-hoeklijnen.mjs
  // voor de bron van de maten.
  { id: "L", label: "L gelijkbenig", match: (n) => hoeklijnBenen(n)?.gelijk === true },
  { id: "LO", label: "L ongelijkbenig", match: (n) => hoeklijnBenen(n)?.gelijk === false },
];

/**
 * De twee beenlengten uit een hoeklijnsleutel ("L200X100X14"), of null als de
 * naam geen hoeklijn is.
 */
function hoeklijnBenen(sleutel: string): { h: number; b: number; gelijk: boolean } | null {
  const m = /^L(\d+)X(\d+)X\d+$/.exec(sleutel);
  if (!m) return null;
  const h = Number(m[1]);
  const b = Number(m[2]);
  return { h, b, gelijk: h === b };
}

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
 * Sorteersleutel: ALLE getallen in de LEESBARE naam, met de decimaal erin
 * ("DIN 42.5" → [42,5]; "L 100x50x8" → [100, 50, 8]). Op de sleutel sorteren
 * zou 42.5 als 425 lezen en de maat achteraan zetten.
 *
 * Dat het er méér dan één zijn, telt bij elke reeks waar de tweede en derde
 * maat variëren: bij "L 100x50x6/8/10" en bij de kokers zou een vergelijking
 * op tekst 10 vóór 6 zetten.
 */
function matenVan(sleutel: string): number[] {
  return (profielLabel(sleutel).match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((m) => parseFloat(m.replace(",", ".")));
}

/** Getal-voor-getal vergelijken; de kortste naam eerst bij gelijke maten. */
function vergelijkMaten(a: string, b: string): number {
  const ma = matenVan(a);
  const mb = matenVan(b);
  for (let i = 0; i < Math.max(ma.length, mb.length); i += 1) {
    const va = ma[i] ?? -Infinity;
    const vb = mb[i] ?? -Infinity;
    if (va !== vb) return va - vb;
  }
  return a.localeCompare(b);
}

/** Profielnamen (databasesleutels) van één reeks, op maat gesorteerd. */
export function profielenVanReeks(reeksId: string): string[] {
  const r = REEKSEN.find((x) => x.id === reeksId);
  if (!r) return [];
  return Object.keys(STEEL_SECTION_DIMS)
    .filter((naam) => r.match(naam))
    .sort(vergelijkMaten);
}

/** Reeks waarin een profielnaam valt; null als geen reeks past. */
export function reeksVanProfiel(naam: string): string | null {
  const key = profileLookupKey(naam);
  return REEKSEN.find((r) => r.match(key))?.id ?? null;
}

function motorSoort(naam: string, dims: SteelSectionDims): MotorSoort {
  switch (dims.kind) {
    case "ISection":
      // DIN 1025-1 (INP) heeft 14 % flensschuinte; de moderne reeksen niet.
      return (dims.flensHelling ?? 0) > 0 ? "ISectionSchuin" : "ISection";
    case "Channel":
      // DIN 1026-1 (UNP) heeft 8 % flensschuinte; UPE heeft evenwijdige flenzen.
      return profileLookupKey(naam).startsWith("UNP") ? "ChannelSchuin" : "Channel";
    case "Shs":
      return "Shs";
    case "Rhs":
      return "Rhs";
    case "Chs":
      return "Chs";
    case "Angle":
      return "Angle";
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
    // Alleen een hoeklijn draagt een tweede straal (de teenafronding); bij de
    // rest blijft het veld weg, zodat de motorinvoer er niet stilzwijgend een
    // nul voor krijgt.
    ...(dims.r2 === undefined ? {} : { r2: dims.r2 }),
  };
}

/** Oppervlak uit de database (mm²), voor de snelle TS-schatting tijdens tekenen. */
export function catalogusOppervlak(naam: string): number | undefined {
  return STEEL_SECTIONS[profileLookupKey(naam)]?.A;
}
