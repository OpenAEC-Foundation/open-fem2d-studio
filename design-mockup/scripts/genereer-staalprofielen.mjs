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
 * doorsnedegrootheden (props) voor de eigenschappentabel.`,
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
  const props =
    `{ iz: ${num(pr.iz_mm4, `${k}.iz_mm4`)}, ` +
    `welY: ${num(pr.wel_y_mm3, `${k}.wel_y_mm3`)}, welZ: ${num(pr.wel_z_mm3, `${k}.wel_z_mm3`)}, ` +
    `wplY: ${num(pr.wpl_y_mm3, `${k}.wpl_y_mm3`)}, wplZ: ${num(pr.wpl_z_mm3, `${k}.wpl_z_mm3`)}, ` +
    `avZ: ${num(pr.av_z_mm2, `${k}.av_z_mm2`)}, it: ${num(pr.it_mm4, `${k}.it_mm4`)}, ` +
    `iw: ${num(pr.iw_mm6, `${k}.iw_mm6`)}, ` +
    `iRadY: ${num(pr.iy_radius_mm, `${k}.iy_radius_mm`)}, iRadZ: ${num(pr.iz_radius_mm, `${k}.iz_radius_mm`)} }`;
  dims +=
    `  "${k}": { kind: "${p.kind}", h: ${num(g.h, `${k}.h`)}, b: ${num(g.b, `${k}.b`)}, ` +
    `tw: ${num(tw, `${k}.tw`)}, tf: ${num(tf, `${k}.tf`)}, r: ${num(r, `${k}.r`)},\n` +
    `    props: ${props} },\n`;
}
dims += `};\n`;
writeFileSync(doelDims, dims, "utf8");

console.log(
  `Klaar: ${uniek.size} profielen (${dubbel} dubbele sleutel(s) ontdubbeld, eerste-wint).\n` +
  `  → ${doelSections}\n  → ${doelDims}`,
);
