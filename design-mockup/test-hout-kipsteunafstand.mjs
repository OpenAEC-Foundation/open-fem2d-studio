// De kipsteunafstand van een HOUTEN staaf komt in de toetsinvoer aan.
//
// Waarom deze test bestaat. `ltb_segment_length_m` bestond al in de
// EN 1995-kern, maar de houtbouwer zette hem hard op 0 en er was geen
// invoerveld. Gevolg: een houten ligger met tussensteunen tegen kip werd
// altijd op de VOLLE staaflengte getoetst. Een kniklengte kon je wel opgeven,
// maar die is iets anders: L_cr,z hoort bij art. 6.3.2 (knik om de zwakke as)
// en kan al korter zijn door een steun aan één flens, terwijl kip de hele
// doorsnede laat uitwijken én torderen.
//
// Wat de kern ermee doet (src-tauri/crates/timber-check/src/orchestrator.rs en
// nen-en-1995-1-1/src/stability.rs): de afstand is de ℓ waaruit tabel 6.1 de
// meewerkende lengte maakt — l_ef = 0,9·ℓ bij een gelijkmatig verdeelde
// belasting op twee steunpunten — en l_ef gaat naar σ_m,crit van (6.32) en
// daarmee naar k_crit van (6.33)/(6.35). Dat de kern het werkelijk zo doet,
// staat vast in src-tauri/crates/timber-check/tests/kipsteunafstand.rs; deze
// test bewaakt de weg ernaartoe.
//
// Wat hier wordt vastgelegd:
//  (a) zonder checkConfig blijft alles zoals het was: 0 = staaflengte
//      (regressie-anker — deze wijziging mag geen bestaande berekening
//      verschuiven);
//  (b) een ingevulde kipsteunafstand komt 1-op-1 door, in METER;
//  (c) kipsteunFRACTIES leiden er nog steeds NIET toe: die zijn per flens en
//      horen bij het staalmodel;
//  (d) onzin (0, negatief, NaN) valt terug op 0 en dus op de staaflengte — de
//      veilige kant, want de volle lengte geeft de laagste σ_m,crit;
//  (e) de kipsteunafstand en L_cr,z staan los van elkaar.
//
// Stijl: test-hout-kniklengte.mjs. Draaien met:
//   npx tsx test-hout-kipsteunafstand.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

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
// Dezelfde opzet als test-hout-kniklengte.mjs.
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
const hout = (checkConfig) =>
  buildTimberCheckInputs({
    nodes,
    beams: [{ ...houtStaaf, ...(checkConfig ? { checkConfig } : {}) }],
    combinations: combos,
    combinationResults,
  }).inputs[0];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zonder kipsteunafstand → 0, en de kern neemt dan de staaflengte");
{
  const i = hout(undefined);
  checkTrue("er is een hout-invoer", i !== undefined);
  check("ltb_segment_length_m = 0", i.ltb_segment_length_m, 0);
  check("length_m = 6 m", i.length_m, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Met kipsteunafstand → 1-op-1 door, in meter");
{
  // Vier tussensteunen op 6 m: vijf velden van 1,2 m. Tabel 6.1 maakt daar
  // l_ef = 0,9 · 1200 = 1080 mm van.
  const i = hout({ ltbSupportSpacing_m: 1.2 });
  check("ltb_segment_length_m = 1,2", i.ltb_segment_length_m, 1.2);

  // Eenheid: meter, niet millimeter. De kern vermenigvuldigt zelf met 1e3
  // (timber-check/src/orchestrator.rs), dus 1200 hier zou 1,2 km betekenen.
  checkTrue("waarde is meter, geen mm", i.ltb_segment_length_m < 100);

  // Langer dan de staaflengte mag: tabel 6.1 kent de voetnoot die l_ef met
  // 2h verhoogt, en wie dat met de hand in de afstand verwerkt hoort niet
  // door de bouwer te worden tegengehouden.
  check("langer dan de staaf mag", hout({ ltbSupportSpacing_m: 9 }).ltb_segment_length_m, 9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Kipsteunfracties leiden nog steeds NIET tot een kipsteunafstand");
{
  // lateralRestraints is een staalveld: fracties PER FLENS. Art. 6.3.3 kent
  // dat onderscheid niet en vraagt één afstand. Zou hij hier stilzwijgend uit
  // de fracties volgen, dan werd l_ef kleiner en de kiptoets gunstiger dan de
  // invoer rechtvaardigt.
  const i = hout({ lateralRestraints: [0.25, 0.5, 0.75] });
  check("fracties geven geen kipsteunafstand", i.ltb_segment_length_m, 0);

  // Maar het eigen veld werkt wél, óók als de fracties er toevallig staan.
  const j = hout({ lateralRestraints: [0.5], ltbSupportSpacing_m: 3 });
  check("het eigen veld wint van de fracties", j.ltb_segment_length_m, 3);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Onbruikbare waarden vallen terug op 0 (= staaflengte)");
{
  for (const [omschrijving, waarde] of [
    ["nul", 0],
    ["negatief", -2],
    ["NaN", Number.NaN],
    ["oneindig", Number.POSITIVE_INFINITY],
  ]) {
    check(`${omschrijving} → 0`, hout({ ltbSupportSpacing_m: waarde }).ltb_segment_length_m, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Kipsteunafstand en L_cr,z zijn twee verschillende grootheden");
{
  // L_cr,z hoort bij art. 6.3.2 en bij de drukterm van (6.35); de
  // kipsteunafstand bij tabel 6.1. Ze mogen elkaar niet overschrijven.
  const i = hout({ bucklingLengthZ_m: 2, ltbSupportSpacing_m: 4 });
  check("L_cr,z = 2", i.buckling_length_z_m, 2);
  check("kipsteunafstand = 4", i.ltb_segment_length_m, 4);

  const alleenKip = hout({ ltbSupportSpacing_m: 1.5 });
  check("L_cr,z valt terug op de systeemlengte", alleenKip.buckling_length_z_m, 6);
  check("kipsteunafstand = 1,5", alleenKip.ltb_segment_length_m, 1.5);

  const alleenKnik = hout({ bucklingLengthZ_m: 1.5 });
  check("kipsteunafstand blijft 0", alleenKnik.ltb_segment_length_m, 0);
}

log(`\n${failed === 0 ? "ALLES GOED" : "FOUTEN"} — ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
