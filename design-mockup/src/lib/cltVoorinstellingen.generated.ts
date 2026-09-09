/**
 * Standaardopbouwen van kruislaaghout (CLT) voor de profielkiezer.
 *
 * GEGENEREERD uit src-tauri/crates/nen-en-1995-1-1/src/clt.rs (fn clt_presets) —
 * de bron van waarheid die ook het Tauri-command `list_clt_presets`, de
 * toetsbrug en de MCP-server bedienen. Niet met de hand bijwerken; opnieuw
 * genereren met: node scripts/genereer-clt-voorinstellingen.mjs
 *
 * Dit zijn VOORINSTELLINGEN met ronde lameldikten in symmetrische opbouw —
 * geen normwaarden en geen productmaten. De gebruiker past ze vrij aan.
 *
 * `test-clt-voorinstellingen.mjs` houdt deze lijst tegen de kern aan en valt
 * om zodra er één naam, laagdikte of totale hoogte uiteenloopt.
 */
import type { CltPreset } from "./types/timber/CltPreset";

export const CLT_VOORINSTELLINGEN: readonly CltPreset[] = [
  { name: "3-laags 60", thicknesses_mm: [20, 20, 20], height_mm: 60 },
  { name: "3-laags 90", thicknesses_mm: [30, 30, 30], height_mm: 90 },
  { name: "3-laags 120", thicknesses_mm: [40, 40, 40], height_mm: 120 },
  { name: "5-laags 100", thicknesses_mm: [20, 20, 20, 20, 20], height_mm: 100 },
  { name: "5-laags 140", thicknesses_mm: [40, 20, 20, 20, 40], height_mm: 140 },
  { name: "5-laags 160", thicknesses_mm: [40, 20, 40, 20, 40], height_mm: 160 },
  { name: "5-laags 200", thicknesses_mm: [40, 40, 40, 40, 40], height_mm: 200 },
  { name: "7-laags 200", thicknesses_mm: [30, 20, 30, 40, 30, 20, 30], height_mm: 200 },
  { name: "7-laags 240", thicknesses_mm: [40, 30, 30, 40, 30, 30, 40], height_mm: 240 },
  { name: "7-laags 280", thicknesses_mm: [40, 40, 40, 40, 40, 40, 40], height_mm: 280 },
];
