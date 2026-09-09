// Spoor D, gebrek 1 — de kniklengte van een HOUTEN staaf komt in de toetsing
// aan.
//
// Waarom deze test bestaat. De houtbouwer zette buckling_length_y_m en
// buckling_length_z_m hard op de systeemlengte, en de twee invoerschermen
// verborgen de velden voor hout. Dat was geen stille fout — het viel gewoon
// niet in te vullen — maar het maakte een houten kolom die halverwege om de
// zwakke as gesteund is, of een spant met een gordingsteun, onmodelleerbaar:
// de toetsing rekende altijd met de volle systeemlengte.
//
// De EN 1995-kern gebruikt beide assen wél echt
// (src-tauri/crates/nen-en-1995-1-1/src/stability.rs):
//   - lambda = L_cr / i, en daaruit via art. 6.3.2 verg. (6.21)/(6.22) de
//     relatieve slankheid en de knikfactoren k_c,y en k_c,z van (6.23)/(6.24);
//   - L_cr,z gaat daarnaast naar de drukterm van de kiptoets (6.35).
// Het veld tonen is dus geen schijninvoer meer.
//
// Wat hier wordt vastgelegd:
//  (a) zonder checkConfig blijft alles zoals het was: beide kniklengtes de
//      systeemlengte (regressie-anker — deze wijziging mag geen bestaande
//      berekening verschuiven);
//  (b) een ingevulde kniklengte komt 1-op-1 in TimberBeamCheckInput, in
//      METER, per as afzonderlijk, met de systeemlengte als terugval voor de
//      as die leeg blijft;
//  (c) de kipsteunafstand (ltb_segment_length_m) blijft 0 (= staaflengte),
//      ook als er kipsteunfracties in de config staan: die fracties zijn per
//      FLENS en horen bij het staalmodel, terwijl EN 1995 art. 6.3.3 één
//      kipsteunafstand vraagt waaruit tabel 6.1 l_ef afleidt. Bewust niet
//      afgeleid — veilig-zijdig en zichtbaar;
//  (d) de staalbouwer leest dezelfde twee velden ongewijzigd, zodat hout en
//      staal aantoonbaar dezelfde invoer krijgen.
//
// Stijl: test-checkconfig.mjs. Draaien met: npx tsx test-hout-kniklengte.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildSteelCheckInputs } = await import("./src/lib/steelCheckBuilder.ts");
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
// Fixture: doorgaande ligger, staalstaaf (1) en houtstaaf (2), elk 6 m.
// Dezelfde opzet als test-checkconfig.mjs, zodat de twee tests dezelfde
// getallen bewaken.
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

const staalStaaf = { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" };
const houtStaaf  = { id: 2, from: 2, to: 3, material: "C24",  profile: "96x450" };

/** Houtinvoer bouwen met (eventueel) een toetsconfiguratie op de houtstaaf. */
const hout = (checkConfig) =>
  buildTimberCheckInputs({
    nodes,
    beams: [{ ...houtStaaf, ...(checkConfig ? { checkConfig } : {}) }],
    combinations: combos,
    combinationResults,
  }).inputs[0];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Hout ZONDER kniklengte → systeemlengte om beide assen (regressie)");
{
  const i = hout(undefined);
  checkTrue("er is een hout-invoer", i !== undefined);
  check("buckling_length_y_m = 6 m", i.buckling_length_y_m, 6);
  check("buckling_length_z_m = 6 m", i.buckling_length_z_m, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Hout MET kniklengte → 1-op-1 door, in meter, per as");
{
  // Een houten kolom die halverwege om de zwakke as is gesteund: L_cr,y blijft
  // de systeemlengte, L_cr,z wordt de halve. Precies het geval dat vóór deze
  // wijziging niet in te voeren was.
  const i = hout({ bucklingLengthY_m: 6, bucklingLengthZ_m: 3 });
  check("buckling_length_y_m 6", i.buckling_length_y_m, 6);
  check("buckling_length_z_m 3", i.buckling_length_z_m, 3);

  // Eenheid: meter, niet millimeter. De kern vermenigvuldigt zelf met 1e3
  // (timber-check/src/orchestrator.rs), dus een waarde van 3000 hier zou een
  // kniklengte van 3 km betekenen.
  checkTrue("waarde is meter, geen mm", i.buckling_length_z_m < 100);

  // Ook langer dan de systeemlengte mag: een kolom met een vrij bovenuiteinde
  // heeft L_cr = 2·L (knikgeval met een ingeklemde voet).
  const lang = hout({ bucklingLengthY_m: 12 });
  check("L_cr,y mag groter zijn dan de staaflengte", lang.buckling_length_y_m, 12);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Eén as ingevuld → de andere valt terug op de systeemlengte");
{
  const alleenY = hout({ bucklingLengthY_m: 4.5 });
  check("y = 4,5", alleenY.buckling_length_y_m, 4.5);
  check("z terugval = 6", alleenY.buckling_length_z_m, 6);

  const alleenZ = hout({ bucklingLengthZ_m: 1.5 });
  check("y terugval = 6", alleenZ.buckling_length_y_m, 6);
  check("z = 1,5", alleenZ.buckling_length_z_m, 1.5);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De kniklengte staat los van de andere houtvelden");
{
  // Klimaatklasse en belastingduur horen ongemoeid te blijven; de kniklengte
  // mag geen enkele k_mod- of k_def-keuze verschuiven.
  const i = hout({ bucklingLengthZ_m: 2, serviceClass: 2, loadDuration: "short" });
  check("service_class Sc2", i.service_class, "Sc2");
  check("load_duration ShortTerm", i.load_duration, "ShortTerm");
  check("buckling_length_z_m 2", i.buckling_length_z_m, 2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Kipsteunfracties leiden NIET tot een kipsteunafstand voor hout");
{
  // lateralRestraints is een staalveld: fracties per flens. EN 1995 art. 6.3.3
  // vraagt één kipsteunafstand waaruit tabel 6.1 l_ef maakt. Zolang de UI daar
  // geen eigen veld voor heeft, blijft ltb_segment_length_m 0 (= staaflengte).
  // Zou hij hier stilzwijgend uit de fracties worden afgeleid, dan werd l_ef
  // KLEINER en de toetsing gunstiger dan de invoer rechtvaardigt.
  const i = hout({ bucklingLengthZ_m: 1.5, lateralRestraints: [0.25, 0.5, 0.75] });
  check("ltb_segment_length_m blijft 0 (= staaflengte)", i.ltb_segment_length_m, 0);
  check("L_cr,z komt wél door", i.buckling_length_z_m, 1.5);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Staal leest dezelfde twee velden — hout en staal krijgen gelijke invoer");
{
  const cfg = { bucklingLengthY_m: 5, bucklingLengthZ_m: 2.5 };
  const staal = buildSteelCheckInputs({
    nodes, beams: [{ ...staalStaaf, checkConfig: cfg }],
    combinations: combos, combinationResults, profileDb,
  }).inputs[0];
  const h = hout(cfg);
  check("staal y = 5", staal.buckling_length_y_m, 5);
  check("staal z = 2,5", staal.buckling_length_z_m, 2.5);
  checkTrue(
    "hout en staal geven dezelfde kniklengtes door",
    staal.buckling_length_y_m === h.buckling_length_y_m &&
      staal.buckling_length_z_m === h.buckling_length_z_m,
  );
}

log(`\n${failed === 0 ? "ALLES GOED" : "FOUTEN"} — ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
