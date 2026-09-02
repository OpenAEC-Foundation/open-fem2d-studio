// Taak B1+B2 — per-staaf toetsconfiguratie (Beam.checkConfig) + projectbestand v2.
//
// Verifieert dat:
//  (a) de builders ZONDER checkConfig exact de huidige gedocumenteerde
//      defaults leveren (kniklengte = systeemlengte, geen kipsteunen,
//      vloer/333, geen zeeg; hout Sc1/MediumTerm, fin 250 / add 333);
//  (b) een gezette checkConfig 1-op-1 in BeamCheckInput / TimberBeamCheckInput
//      terechtkomt (kniklengtes, kipsteunfracties gesorteerd+gefilterd,
//      doorbuigingsklasse incl. custom L/n, zeeg; klimaatklasse, duurklasse);
//  (c) projectbestand v2 round-tript (serialize → deserialize → identiek,
//      inclusief combinaties met Map-factoren en stramien) en v1-bestanden
//      (voorbeelden/houten-raamwerk.ifcfem2d) zonder fouten laden.
//
// Stijl: test-doorbuiging-toets.mjs. Draaien met: npx tsx test-checkconfig.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildSteelCheckInputs } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const {
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
  PROJECT_FORMAT_VERSION,
} = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected) {
  const ok = Object.is(actual, expected) || actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${JSON.stringify(actual)}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

function checkDeep(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; log(`  ✓ ${name}`); }
  else         { failed++; log(`  ✗ ${name}:\n      actual:   ${a}\n      expected: ${e}`); }
}

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture: doorgaande ligger met een staalstaaf (1) en een houtstaaf (2).
//   nodes 1(0,0) — 2(6000,0) — 3(12000,0); q = -5 kN/m in G en Q.
// ─────────────────────────────────────────────────────────────────────────
const L = 6000;
const nodes = [
  { id: 1, x: 0, z: 0 },
  { id: 2, x: L, z: 0 },
  { id: 3, x: 2 * L, z: 0 },
];
const solverBeams = [
  { id: 1, from: 1, to: 2, E: 210000, A: 3877, I: 1e8 },
  { id: 2, from: 2, to: 3, E: 11000,  A: 43200, I: 7.29e8 },
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

const profileDb = new Map([["HEA160", { geometry: { h: 152 } }]]);

const steelBeamNoCfg  = { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" };
const timberBeamNoCfg = { id: 2, from: 2, to: 3, material: "C24",  profile: "96x450" };

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Staal ZONDER checkConfig → gedocumenteerde defaults");
{
  const { inputs, skipped } = buildSteelCheckInputs({
    nodes, beams: [steelBeamNoCfg, timberBeamNoCfg],
    combinations: combos, combinationResults, profileDb,
  });
  checkTrue("1 staal-input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const i = inputs[0];
  check("buckling_length_y_m = systeemlengte", i.buckling_length_y_m, 6);
  check("buckling_length_z_m = systeemlengte", i.buckling_length_z_m, 6);
  checkDeep("geen kipsteunen", i.lateral_bracing.top_flange_positions, []);
  check("deflection_limit_class Floor", i.deflection_limit_class, "Floor");
  check("deflection_limit_numerator 333", i.deflection_limit_numerator, 333);
  check("is_cantilever false", i.is_cantilever, false);
  check("pre_camber_mm 0", i.pre_camber_mm, 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Staal MET checkConfig → waarden 1-op-1 doorgegeven");
{
  const steelCfg = {
    ...steelBeamNoCfg,
    checkConfig: {
      bucklingLengthY_m: 12,
      bucklingLengthZ_m: 3,
      // Ongeldige fracties (≤0, ≥1) worden gefilterd; rest gesorteerd.
      lateralRestraints: [0.75, 0.25, 1.5, -0.1, 0.5, 0, 1],
      deflectionClass: "custom",
      deflectionLimitNumerator: 500,
      preCamber_mm: -10,
    },
  };
  const { inputs } = buildSteelCheckInputs({
    nodes, beams: [steelCfg],
    combinations: combos, combinationResults, profileDb,
  });
  const i = inputs[0];
  check("buckling_length_y_m 12", i.buckling_length_y_m, 12);
  check("buckling_length_z_m 3", i.buckling_length_z_m, 3);
  checkDeep("kipsteunfracties gefilterd + gesorteerd", i.lateral_bracing.top_flange_positions, [0.25, 0.5, 0.75]);
  checkDeep("onderflens blijft leeg", i.lateral_bracing.bottom_flange_positions, []);
  check("deflection_limit_class Custom", i.deflection_limit_class, "Custom");
  check("deflection_limit_numerator 500", i.deflection_limit_numerator, 500);
  check("pre_camber_mm -10", i.pre_camber_mm, -10);
}

log("\n[2b] Staal doorbuigingsklassen: floor/roof/cantilever mappen op Rust-enum");
{
  const mk = (deflectionClass) => ({ ...steelBeamNoCfg, checkConfig: { deflectionClass } });
  for (const [ui, rust, cant] of [
    ["floor", "Floor", false], ["roof", "Roof", false], ["cantilever", "Cantilever", true],
  ]) {
    const { inputs } = buildSteelCheckInputs({
      nodes, beams: [mk(ui)], combinations: combos, combinationResults, profileDb,
    });
    check(`"${ui}" → ${rust}`, inputs[0].deflection_limit_class, rust);
    check(`"${ui}" → is_cantilever ${cant}`, inputs[0].is_cantilever, cant);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Hout ZONDER checkConfig → gedocumenteerde defaults");
{
  const { inputs, skipped } = buildTimberCheckInputs({
    nodes, beams: [steelBeamNoCfg, timberBeamNoCfg],
    combinations: combos, combinationResults,
  });
  checkTrue("1 hout-input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const i = inputs[0];
  check("service_class Sc1", i.service_class, "Sc1");
  check("load_duration MediumTerm", i.load_duration, "MediumTerm");
  check("deflection_limit_fin 250", i.deflection_limit_fin, 250);
  check("deflection_limit_add 333", i.deflection_limit_add, 333);
  check("buckling_length_y_m = systeemlengte", i.buckling_length_y_m, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Hout MET checkConfig → klimaatklasse/duurklasse/doorbuiging 1-op-1");
{
  const mk = (checkConfig) => ({ ...timberBeamNoCfg, checkConfig });
  const run = (cfg) => buildTimberCheckInputs({
    nodes, beams: [mk(cfg)], combinations: combos, combinationResults,
  }).inputs[0];

  const a = run({ serviceClass: 3, loadDuration: "long" });
  check("serviceClass 3 → Sc3", a.service_class, "Sc3");
  check('loadDuration "long" → LongTerm', a.load_duration, "LongTerm");

  const durMap = [
    ["permanent", "Permanent"], ["long", "LongTerm"], ["medium", "MediumTerm"],
    ["short", "ShortTerm"], ["instantaneous", "Instantaneous"],
  ];
  for (const [ui, rust] of durMap) {
    check(`duurklasse "${ui}" → ${rust}`, run({ loadDuration: ui }).load_duration, rust);
  }

  const roof = run({ deflectionClass: "roof" });
  check("roof → fin 250", roof.deflection_limit_fin, 250);
  check("roof → add 250", roof.deflection_limit_add, 250);

  const cant = run({ deflectionClass: "cantilever" });
  check("cantilever → fin 125", cant.deflection_limit_fin, 125);
  check("cantilever → add 167", cant.deflection_limit_add, 167);

  const cust = run({ deflectionClass: "custom", deflectionLimitNumerator: 400 });
  check("custom 400 → fin 400", cust.deflection_limit_fin, 400);
  check("custom 400 → add 400", cust.deflection_limit_add, 400);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Projectbestand v2: round-trip serialize → deserialize → identiek");
{
  const grid = {
    enabled: true,
    xAxes: [{ id: "A", label: "A", position: 0 }, { id: "B", label: "B", position: 7500 }],
    zAxes: [{ id: "1", label: "1", position: 0 }],
  };
  const state = {
    nodes,
    beams: [
      { ...steelBeamNoCfg, checkConfig: { bucklingLengthY_m: 9, lateralRestraints: [0.5], deflectionClass: "roof", preCamber_mm: 5 } },
      { ...timberBeamNoCfg, checkConfig: { serviceClass: 2, loadDuration: "short" } },
    ],
    supports, plates: [], loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -5 }],
    loadCases: [{ id: 1, name: "Permanent (G)", type: "dead" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: true,
    nonlinearEnabled: false,
    combinations: combinationsToFile(combos),
    structuralGrid: grid,
  };
  const text = serializeProject(state);
  const parsed = deserializeProject(text);

  check("PROJECT_FORMAT_VERSION = 2", PROJECT_FORMAT_VERSION, 2);
  check("version in bestand = 2", parsed.version, 2);
  checkDeep("beams (incl. checkConfig) identiek", parsed.beams, state.beams);
  checkDeep("combinations identiek", parsed.combinations, state.combinations);
  checkDeep("structuralGrid identiek", parsed.structuralGrid, state.structuralGrid);
  checkDeep("nodes identiek", parsed.nodes, state.nodes);

  // Map-conversie: combinationsFromFile(combinationsToFile(x)) ≡ x
  const back = combinationsFromFile(parsed.combinations);
  checkTrue("combinations terug naar Map-vorm: zelfde aantal", back.length === combos.length);
  const eq = combos.every((c, k) => {
    const b = back[k];
    return b.id === c.id && b.name === c.name && b.type === c.type && b.formula === c.formula
      && b.factors instanceof Map
      && b.factors.size === c.factors.size
      && [...c.factors].every(([caseId, f]) => b.factors.get(caseId) === f);
  });
  checkTrue("factors-Map per combinatie identiek (ids numeriek)", eq);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] v1-migratie: bestaand v1-bestand laadt zonder fouten");
{
  const v1Path = fileURLToPath(new URL("../voorbeelden/houten-raamwerk.ifcfem2d", import.meta.url));
  const text = readFileSync(v1Path, "utf8");
  let parsed = null, err = null;
  try { parsed = deserializeProject(text); } catch (e) { err = e; }
  checkTrue("geen fout bij deserialiseren", err === null);
  check("version = 1 blijft leesbaar", parsed?.version, 1);
  checkTrue("combinations ontbreekt (v1)", parsed?.combinations === undefined);
  checkTrue("structuralGrid ontbreekt (v1)", parsed?.structuralGrid === undefined);
  checkTrue("combinationsFromFile(undefined) → undefined (store pakt defaults)",
    combinationsFromFile(undefined) === undefined);
  checkTrue("beams zonder checkConfig blijven geldig",
    Array.isArray(parsed?.beams) && parsed.beams.every((b) => b.checkConfig === undefined));

  // Nieuwere versie dan de app kent → duidelijke fout (bestaand gedrag).
  const future = JSON.stringify({ ...JSON.parse(text), version: PROJECT_FORMAT_VERSION + 1 });
  let futureErr = null;
  try { deserializeProject(future); } catch (e) { futureErr = e; }
  checkTrue("toekomstige versie geeft nette fout", futureErr instanceof Error);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Totaal: ${passed + failed} checks — ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
