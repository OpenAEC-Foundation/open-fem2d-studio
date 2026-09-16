// De drie houtkeuzen van de toetsconfiguratie komen in de toetsinvoer aan:
// scheurfactor k_cr, kiptoets aan/uit en het aangrijpingspunt van de belasting.
//
// Waarom deze test bestaat. Tot september 2026 zette de houtbouwer
// `k_cr = 1,0`, `perform_ltb_check = true` en `ltb_load_position =
// CentreOfGravity` hard vast. De velden bestonden in de EN 1995-kern, maar
// wie een balklaag met doorgaand dakbeschot (kiptoets niet nodig, art.
// 6.3.3(5)), een last aan de drukzijde (tabel 6.1, voetnoot a: l_ef + 2h) of
// de Europese aanbeveling k_cr = 0,67 (6.1.7(2)) wilde toetsen, kon dat alleen
// buiten de app om — en dat zijn constructeurskeuzen die in het model horen.
//
// Wat hier wordt vastgelegd:
//  (a) zonder de velden verandert er NIETS: k_cr 1,0, kiptoets aan, zwaartepunt
//      (regressie-anker — geen bestaand getal verschuift);
//  (b) elk van de drie komt 1-op-1 door, in de spelling van de Rust-enum;
//  (c) een k_cr buiten (0, 1] is geen keuze maar een fout: de bouwer slaat de
//      staaf over MET reden in plaats van stil op 1,0 terug te vallen;
//  (d) `keurCheckConfig` (de veldpoort van de sidecar, dus ook van
//      `check_config` in `check_fem_model`) weigert onzin: k_cr buiten (0, 1],
//      een onbekende lastpositie, een niet-booleaanse kiptoetsvlag — en laat
//      de drie geldige velden door;
//  (e) de standaardwaarden schrijven de UI-paden niet weg: `performLtbCheck`
//      is alleen `false` of afwezig (dat is de afspraak van BarPropertiesDialog).
//
// Praat alleen met `engine`, `combinations`, de houtbouwer en `valideerModel`
// — allemaal in de barrel, dus draaibaar tegen de sidecarbundel. Dat is de
// bedoeling: laat de bundel een van deze velden vallen, dan toetst de MCP-weg
// met de standaard terwijl de bron de keuze van de gebruiker volgt.
//
// Stijl: test-hout-kipsteunafstand.mjs. Draaien met:
//   npx tsx test-hout-checkconfig.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildTimberCheckInputs, kCrUitConfig, K_CR_STANDAARD, mapLtbLoadPosition } =
  await import("./src/lib/timberCheckBuilder.ts");
const { keurCheckConfig } = await import("./src/mcp/valideerModel.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected) {
  const ok = Object.is(actual, expected) || actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${JSON.stringify(actual)}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture: doorgaande ligger van twee velden van 6 m; staaf 2 is hout.
// ─────────────────────────────────────────────────────────────────────────
const L = 6000;
const nodes = [
  { id: 1, x: 0, z: 0 },
  { id: 2, x: L, z: 0 },
  { id: 3, x: 2 * L, z: 0 },
];
const solverBeams = [
  { id: 1, from: 1, to: 2, E: 11000, A: 43200, I: 7.29e8 },
  { id: 2, from: 2, to: 3, E: 11000, A: 43200, I: 7.29e8 },
];
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "zRoller" },
  { nodeId: 3, type: "zRoller" },
];
const loads = [
  { beamId: 1, q: -5 },
  { beamId: 2, q: -5 },
];
const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads })],
  [2, solve({ nodes, beams: solverBeams, supports, loads })],
]);
const combos = defaultCombinations();
const combinationResults = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));

const houtStaaf = { id: 2, from: 2, to: 3, material: "C24", profile: "96x450" };

/** Houtinvoer bouwen met (eventueel) een toetsconfiguratie op de houtstaaf. */
const bouw = (checkConfig) =>
  buildTimberCheckInputs({
    nodes,
    beams: [{ ...houtStaaf, ...(checkConfig ? { checkConfig } : {}) }],
    combinations: combos,
    combinationResults,
  });
const hout = (checkConfig) => bouw(checkConfig).inputs[0];

// ─────────────────────────────────────────────────────────────────────────
log("\n[a] Zonder de velden: het gedrag van vóór de velden (regressie-anker)");
{
  const i = hout(undefined);
  check("k_cr = 1,0 (NB bij 6.1.7, prismatisch)", i.k_cr, 1);
  check("K_CR_STANDAARD = 1,0", K_CR_STANDAARD, 1);
  check("kiptoets aan", i.perform_ltb_check, true);
  check("aangrijpingspunt zwaartepunt", i.ltb_load_position, "CentreOfGravity");
  check("belastinggeval gelijkmatig verdeeld (ongewijzigd)", i.ltb_load_case, "UniformLoad");
  check("l_ef-override 0 (ongewijzigd)", i.ltb_effective_length_override_m, 0);
  // Een checkConfig met alleen ANDERE velden raakt de drie evenmin.
  const j = hout({ serviceClass: 2, ltbSupportSpacing_m: 1.5 });
  check("andere velden laten k_cr op 1,0", j.k_cr, 1);
  check("andere velden laten de kiptoets aan", j.perform_ltb_check, true);
  check("andere velden laten het zwaartepunt staan", j.ltb_load_position, "CentreOfGravity");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[b] Elk veld komt 1-op-1 door");
{
  const i = hout({ kCr: 0.67, performLtbCheck: false, ltbLoadPosition: "compressionEdge" });
  check("kCr 0,67 → k_cr 0,67", i.k_cr, 0.67);
  check("performLtbCheck false → perform_ltb_check false", i.perform_ltb_check, false);
  check("compressionEdge → CompressionEdge", i.ltb_load_position, "CompressionEdge");
  check("tensionEdge → TensionEdge", hout({ ltbLoadPosition: "tensionEdge" }).ltb_load_position, "TensionEdge");
  check("centreOfGravity → CentreOfGravity", hout({ ltbLoadPosition: "centreOfGravity" }).ltb_load_position, "CentreOfGravity");
  check("performLtbCheck true → true", hout({ performLtbCheck: true }).perform_ltb_check, true);
  check("kCr 1 → 1 (de grens hoort erbij)", hout({ kCr: 1 }).k_cr, 1);
  check("mapLtbLoadPosition(undefined) → CentreOfGravity", mapLtbLoadPosition(undefined), "CentreOfGravity");
  // De drie velden staan los van de kipsteunafstand: die blijft gewoon doorkomen.
  const k = hout({ kCr: 0.67, ltbSupportSpacing_m: 1.2 });
  check("kipsteunafstand blijft doorkomen naast kCr", k.ltb_segment_length_m, 1.2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[c] Een k_cr buiten (0, 1] slaat de staaf over MET reden — niet stil op 1,0");
{
  for (const slecht of [0, -0.5, 1.5, NaN, Infinity]) {
    const { inputs, skipped } = bouw({ kCr: slecht });
    checkTrue(`kCr ${String(slecht)}: geen invoer, één overgeslagen staaf`,
      inputs.length === 0 && skipped.length === 1 && skipped[0].beamId === 2);
    checkTrue(`kCr ${String(slecht)}: de reden noemt k_cr en 6.1.7`,
      skipped.length === 1 && /k_cr/.test(skipped[0].reason) && /6\.1\.7/.test(skipped[0].reason));
  }
  checkTrue("kCrUitConfig({}) → 1,0", kCrUitConfig({}).kCr === 1);
  checkTrue("kCrUitConfig({kCr: 0.8}) → 0,8", kCrUitConfig({ kCr: 0.8 }).kCr === 0.8);
  checkTrue("kCrUitConfig({kCr: 2}) → fout", "fout" in kCrUitConfig({ kCr: 2 }));
  checkTrue("kCrUitConfig({kCr: '0.67'}) → fout (tekst is geen getal)", "fout" in kCrUitConfig({ kCr: "0.67" }));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[d] De veldpoort (keurCheckConfig) — dezelfde als voor `check_config` in check_fem_model");
{
  const fouten = (cc) => keurCheckConfig(cc, "check_config.2");
  check("geldig: de drie velden samen → geen fouten",
    fouten({ kCr: 0.67, performLtbCheck: false, ltbLoadPosition: "compressionEdge" }).length, 0);
  check("geldig: kCr 1 → geen fouten", fouten({ kCr: 1 }).length, 0);
  check("geldig: performLtbCheck true → geen fouten", fouten({ performLtbCheck: true }).length, 0);
  for (const [naam, cc, patroon] of [
    ["kCr 0", { kCr: 0 }, /kCr.*groter dan nul/],
    ["kCr -1", { kCr: -1 }, /kCr.*groter dan nul/],
    ["kCr 1,5", { kCr: 1.5 }, /kCr.*ten hoogste 1/],
    ["kCr als tekst", { kCr: "0.67" }, /kCr.*moet een getal zijn/],
    ["performLtbCheck als tekst", { performLtbCheck: "nee" }, /performLtbCheck.*true of false/],
    ["performLtbCheck als 0", { performLtbCheck: 0 }, /performLtbCheck.*true of false/],
    ["ltbLoadPosition onbekend", { ltbLoadPosition: "bovenrand" }, /ltbLoadPosition.*geen geldige waarde/],
    ["ltbLoadPosition in Rust-spelling", { ltbLoadPosition: "CompressionEdge" }, /ltbLoadPosition.*geen geldige waarde/],
    ["tikfout k_cr (snake_case)", { k_cr: 0.67 }, /onbekend veld `k_cr`.*kCr/],
    ["tikfout perform_ltb_check", { perform_ltb_check: false }, /onbekend veld `perform_ltb_check`/],
  ]) {
    const f = fouten(cc);
    checkTrue(`${naam} wordt geweigerd: ${f[0] ?? "(geen fout)"}`, f.length >= 1 && patroon.test(f.join(" ")));
  }
  // De foutmelding voor een onbekende lastpositie noemt de drie geldige namen.
  const f = fouten({ ltbLoadPosition: "bovenrand" }).join(" ");
  checkTrue("de melding noemt centreOfGravity, compressionEdge en tensionEdge",
    /centreOfGravity/.test(f) && /compressionEdge/.test(f) && /tensionEdge/.test(f));
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Totaal: ${passed + failed} checks — ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
