#!/usr/bin/env node
/**
 * genereer-staalprofielen.mjs — genereert de TypeScript-profieltabellen uit de
 * Rust-profieldatabase (bron van waarheid):
 *
 *   bron : ../src-tauri/crates/steel-profiles/data/profiles.json
 *   doel : src/lib/steelSections.generated.ts      (A/Iy voor de solver)
 *          src/lib/steelSectionDims.generated.ts   (afmetingen + grootheden
 *                                                   voor tekening en rapport)
 *
 * Draaien vanuit design-mockup/:  node scripts/genereer-staalprofielen.mjs
 *
 * Sleutels worden genormaliseerd zoals profileLookupKey in
 * src/lib/steelCheckBuilder.ts (spiegel van `lookup_key` in de Rust-crate):
 * spaties/koppeltekens/punten eruit, hoofdletters. Profielen die daarna op
 * dezelfde sleutel uitkomen worden ontdubbeld met eerste-wint — dezelfde
 * regel als de Rust-lookup, en dat voorkomt dubbele objectsleutels waar
 * Vite/esbuild over klaagt.
 *
 * Geen dependencies; alleen Node-ingebouwde modules.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const bronPad = join(
  hier, "..", "..",
  "src-tauri", "crates", "steel-profiles", "data", "profiles.json",
);
const doelSections = join(hier, "..", "src", "lib", "steelSections.generated.ts");
const doelDims = join(hier, "..", "src", "lib", "steelSectionDims.generated.ts");

/** Zelfde normalisatie als profileLookupKey / Rust `lookup_key`. */
function sleutel(naam) {
  return naam.replace(/[\s\-.]/g, "").toUpperCase();
}

/** Getal → TS-literal; niet-numeriek wordt hard geweigerd (bron is dan stuk). */
function num(v, ctx) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Geen geldig getal voor ${ctx}: ${JSON.stringify(v)}`);
  }
  return String(v);
}

const profielen = JSON.parse(readFileSync(bronPad, "utf8"));
if (!Array.isArray(profielen) || profielen.length === 0) {
  throw new Error(`Lege of ongeldige profieldatabase: ${bronPad}`);
}

// Eerste-wint ontdubbeling op de genormaliseerde sleutel.
const uniek = new Map();
let dubbel = 0;
for (const p of profielen) {
  const k = sleutel(p.name);
  if (uniek.has(k)) { dubbel += 1; continue; }
  uniek.set(k, p);
}

const kop = (omschrijving) => `/**
 * ${omschrijving}
 *
 * GEGENEREERD uit src-tauri/crates/steel-profiles/data/profiles.json —
 * de bron van waarheid die ook de Rust-toetsing gebruikt. Niet met de hand
 * bijwerken; opnieuw genereren met: node scripts/genereer-staalprofielen.mjs
 * Sleutels genormaliseerd (hoofdletters, zonder spaties/koppeltekens/punten);
 * dubbelen ontdubbeld met dezelfde eerste-wint-regel als de Rust-lookup.
 */
`;

/* ------------------------------------------------------------------ *
 * 1. steelSections.generated.ts — A (mm²) en Iy (mm⁴) voor de solver *
 * ------------------------------------------------------------------ */
let secties = kop(
  "Staalprofiel-doorsnedegrootheden voor de solver (A in mm2, Iy in mm4).",
);
secties += `export const STEEL_SECTIONS: Record<string, { A: number; Iy: number }> = {\n`;
for (const [k, p] of uniek) {
  const pr = p.properties;
  secties += `  "${k}": { A: ${num(pr.area_mm2, `${k}.area_mm2`)}, Iy: ${num(pr.iy_mm4, `${k}.iy_mm4`)} },\n`;
}
secties += `};\n`;
writeFileSync(doelSections, secties, "utf8");

/* ------------------------------------------------------------------------- *
 * 2. steelSectionDims.generated.ts — afmetingen + rapportgrootheden         *
 * ------------------------------------------------------------------------- */
let dims = kop(
  `Staalprofiel-hoofdafmetingen voor de doorsnede-tekening in het rapport
 * (h, b, tw, tf, r in mm; bij buisprofielen geldt tw = tf = wanddikte t,
 * bij CHS is h = b = uitwendige diameter en r = 0), plus de aanvullende
 * doorsnedegrootheden (props) voor de eigenschappentabel.
 *
 * Bij U-profielen staat er ook een flensHelling: 0,08 voor de UNP-reeks
 * (toelopende flens), 0 voor de UPE-reeks (evenwijdige flenzen).`,
);
dims += `export type SteelSectionKind = "ISection" | "Channel" | "Shs" | "Rhs" | "Chs";

/** Aanvullende doorsnedegrootheden voor de eigenschappentabel in het rapport. */
export interface SteelSectionProps {
  /** Traagheidsmoment zwakke as Iz in mm⁴. */
  iz: number;
  /** Elastisch weerstandsmoment sterke as Wel;y in mm³. */
  welY: number;
  /** Elastisch weerstandsmoment zwakke as Wel;z in mm³. */
  welZ: number;
  /** Plastisch weerstandsmoment sterke as Wpl;y in mm³. */
  wplY: number;
  /** Plastisch weerstandsmoment zwakke as Wpl;z in mm³. */
  wplZ: number;
  /** Afschuifoppervlak Av;z in mm². */
  avZ: number;
  /** Torsietraagheidsmoment It in mm⁴. */
  it: number;
  /** Welvingsconstante Iw in mm⁶. */
  iw: number;
  /** Traagheidsstraal sterke as iy in mm. */
  iRadY: number;
  /** Traagheidsstraal zwakke as iz in mm. */
  iRadZ: number;
}

export interface SteelSectionDims {
  kind: SteelSectionKind;
  /**
   * De naam zoals hij in de profieldatabase staat ("HEA 200", "DIN 42.5").
   * De sleutel van dit record is de genormaliseerde vorm daarvan, en die is
   * niet altijd leesbaar: uit "DIN 42.5" wordt "DIN425", wat er uitziet als
   * een maat 425. Wie de gebruiker een profiel laat kiezen, toont dit veld.
   */
  naam: string;
  /** Hoogte in mm (CHS: uitwendige diameter). */
  h: number;
  /** Breedte in mm (CHS: uitwendige diameter). */
  b: number;
  /** Lijfdikte in mm (buisprofielen: wanddikte t). */
  tw: number;
  /** Flensdikte in mm (buisprofielen: wanddikte t). */
  tf: number;
  /** Afrondingsstraal in mm (walsuitronding; SHS/RHS: hoekstraal; CHS: 0). */
  r: number;
  /**
   * Helling van het flensBINNENvlak (U-profielen), als verhouding: 0,08 is
   * 8 %. 0 betekent evenwijdige flenzen.
   *
   * Dit is een TEKENgrootheid, geen rekengrootheid: de doorsnedegrootheden in
   * \`props\` staan los van dit veld en komen onveranderd uit de catalogus.
   * Zonder dit veld is een UNP niet van een UPE te onderscheiden en wordt hij
   * met evenwijdige flenzen getekend — precies de fout die dit veld opheft.
   *
   * Ontbreekt het veld, dan tekent \`profielVorm.ts\` evenwijdige flenzen. Een
   * nieuwe U-reeks met toelopende flens MOET het dus in profiles.json krijgen;
   * anders ziet niemand dat de tekening de verkeerde vorm laat zien.
   */
  flensHelling?: number;
  /** Aanvullende grootheden voor de eigenschappentabel (uit de database). */
  props?: SteelSectionProps;
}

export const STEEL_SECTION_DIMS: Record<string, SteelSectionDims> = {
`;
for (const [k, p] of uniek) {
  const g = p.geometry;
  const pr = p.properties;
  // Buisprofielen: wanddikte kan als t (Shs) of tw/tf (Rhs/Chs) in de bron staan.
  const t = g.t ?? g.tw;
  const tw = g.tw ?? t;
  const tf = g.tf ?? t;
  const r = g.r ?? 0;
  // Flenshelling: alleen meegenomen als de bron hem noemt. Bewust GEEN
  // terugval op een reeksnaam ("begint met UNP") — dan zou een reeks zonder
  // veld stilzwijgend een helling krijgen die niemand heeft opgezocht.
  const helling = g.flange_slope;
  const hellingVeld =
    helling === undefined ? "" : `flensHelling: ${num(helling, `${k}.flange_slope`)}, `;
  const props =
    `{ iz: ${num(pr.iz_mm4, `${k}.iz_mm4`)}, ` +
    `welY: ${num(pr.wel_y_mm3, `${k}.wel_y_mm3`)}, welZ: ${num(pr.wel_z_mm3, `${k}.wel_z_mm3`)}, ` +
    `wplY: ${num(pr.wpl_y_mm3, `${k}.wpl_y_mm3`)}, wplZ: ${num(pr.wpl_z_mm3, `${k}.wpl_z_mm3`)}, ` +
    `avZ: ${num(pr.av_z_mm2, `${k}.av_z_mm2`)}, it: ${num(pr.it_mm4, `${k}.it_mm4`)}, ` +
    `iw: ${num(pr.iw_mm6, `${k}.iw_mm6`)}, ` +
    `iRadY: ${num(pr.iy_radius_mm, `${k}.iy_radius_mm`)}, iRadZ: ${num(pr.iz_radius_mm, `${k}.iz_radius_mm`)} }`;
  dims +=
    `  "${k}": { kind: "${p.kind}", naam: ${JSON.stringify(p.name)}, ` +
    `h: ${num(g.h, `${k}.h`)}, b: ${num(g.b, `${k}.b`)}, ` +
    `tw: ${num(tw, `${k}.tw`)}, tf: ${num(tf, `${k}.tf`)}, r: ${num(r, `${k}.r`)},\n` +
    `    ${hellingVeld}props: ${props} },\n`;
}
dims += `};\n`;
writeFileSync(doelDims, dims, "utf8");

console.log(
  `Klaar: ${uniek.size} profielen (${dubbel} dubbele sleutel(s) ontdubbeld, eerste-wint).\n` +
  `  → ${doelSections}\n  → ${doelDims}`,
);
