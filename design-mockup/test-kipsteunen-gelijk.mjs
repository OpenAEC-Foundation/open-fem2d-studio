// Het vinkje "Onder en boven gelijk" bij de kipsteunen (issue #44):
// `lib/kipsteunenGelijk.ts` — detectie bij het openen (binnen afronding),
// gelijktrekken bij het aanzetten, en de wijziging die beide velden in één
// keer zet. Dat de toetsinvoer dan voor beide flenzen dezelfde posities krijgt,
// rekent het slotblok na met de echte staalbouwer (`lateral_bracing`). Het
// gedrag in het paneel (één invoer, één undo-stap, uitzetten wist niets)
// bewaakt test-eigenschappen-ui.mjs.
import assert from "node:assert/strict";

const { kipsteunenGelijk, gelijkTrekken, kipsteunenPatch, TOLERANTIE_FRACTIE } = await import(
  "./src/lib/kipsteunenGelijk.ts"
);
const { kipsteunenVanStaaf } = await import("./src/lib/kipsteunen.ts");

let geslaagd = 0;
function geval(naam, fn) {
  fn();
  geslaagd++;
  console.log(`  ok ${naam}`);
}

geval("gelijke rijen, ook in andere volgorde of met een dubbele waarde", () => {
  assert.equal(kipsteunenGelijk([0.25, 0.5, 0.75], [0.25, 0.5, 0.75], 6000), true);
  assert.equal(kipsteunenGelijk([0.75, 0.25, 0.5], [0.25, 0.5, 0.75, 0.5], 6000), true);
});

geval("binnen afronding: 1 mm langs de staaf, zoals de kern een steunpaar ziet", () => {
  // Derdepunten op 8770 mm, afgerond op drie decimalen: 0,333 vs 1/3 is 2,9 mm.
  assert.equal(kipsteunenGelijk([1 / 3, 2 / 3], [0.3333, 0.6667], 8770), true, "0,3 mm");
  assert.equal(kipsteunenGelijk([1 / 3, 2 / 3], [0.333, 0.667], 8770), false, "2,9 mm is geen afronding meer");
  assert.equal(kipsteunenGelijk([0.5], [0.5 + 0.9 / 6000], 6000), true, "0,9 mm");
  assert.equal(kipsteunenGelijk([0.5], [0.5 + 1.1 / 6000], 6000), false, "1,1 mm");
});

geval("zonder staaflengte: een strakke tolerantie op de fractie", () => {
  assert.equal(kipsteunenGelijk([0.5], [0.5 + TOLERANTIE_FRACTIE / 2], 0), true);
  assert.equal(kipsteunenGelijk([0.5], [0.501], 0), false);
});

geval("verschillend aantal, of één rij leeg: niet gelijk", () => {
  assert.equal(kipsteunenGelijk([0.25, 0.5, 0.75], [0.5], 6000), false);
  assert.equal(kipsteunenGelijk([0.5], undefined, 6000), false);
  assert.equal(kipsteunenGelijk([], [0.5], 6000), false);
});

geval("beide leeg (of alleen randen die geen kipsteun zijn): gelijk", () => {
  assert.equal(kipsteunenGelijk(undefined, undefined, 6000), true);
  assert.equal(kipsteunenGelijk([], [], 6000), true);
  assert.equal(kipsteunenGelijk([0, 1], [], 6000), true, "0 en 1 zijn de gaffels, geen kipsteun");
});

geval("gelijktrekken: de bovenflens voorop, de onderflens als boven leeg is", () => {
  assert.deepEqual(gelijkTrekken([0.25, 0.75], [0.5]), [0.25, 0.75]);
  assert.deepEqual(gelijkTrekken([], [0.5]), [0.5]);
  assert.deepEqual(gelijkTrekken(undefined, [0.5]), [0.5]);
  assert.deepEqual(gelijkTrekken(undefined, undefined), []);
  const boven = [0.5];
  assert.notEqual(gelijkTrekken(boven, []), boven, "een kopie, geen gedeelde array");
});

geval("de wijziging: één rij of beide velden in één object", () => {
  assert.deepEqual(kipsteunenPatch("boven", [0.5]), { lateralRestraints: [0.5] });
  assert.deepEqual(kipsteunenPatch("onder", [0.5]), { lateralRestraintsBottom: [0.5] });
  const beide = kipsteunenPatch("beide", [0.25, 0.75]);
  assert.deepEqual(beide, { lateralRestraints: [0.25, 0.75], lateralRestraintsBottom: [0.25, 0.75] });
  assert.notEqual(beide.lateralRestraints, beide.lateralRestraintsBottom, "twee losse arrays");
});

geval("de toetsinvoer: met het vinkje aan krijgt lateral_bracing boven en onder dezelfde posities", () => {
  const cfg = kipsteunenPatch("beide", [0.25, 0.5, 0.75]);
  const { lateral_bracing: lb, steunen } = kipsteunenVanStaaf(cfg, 8770, "staal");
  assert.deepEqual(lb.top_flange_positions, [0.25, 0.5, 0.75]);
  assert.deepEqual(lb.bottom_flange_positions, [0.25, 0.5, 0.75]);
  assert.ok(steunen.every((s) => s.flens === "beide"), "op de tekening: elke steun aan beide flenzen");
  const hout = kipsteunenVanStaaf(kipsteunenPatch("beide", [0.5]), 6000, "hout").lateral_bracing;
  assert.deepEqual([hout.top_flange_positions, hout.bottom_flange_positions], [[0.5], [0.5]], "hout: boven- en onderrand");
});

console.log(`${geslaagd} geslaagd, 0 gefaald`);
