// Kruislaaghout — cltCheckBuilder: profielnaam-grammatica, mechanica-spiegel
// tegen de handberekening (dezelfde als in de Rust-kern), doorsnede voor de
// solver, en de invoerbouw op een doorgerekend model.
//
// Handberekening (5-laags 40/20/40/20/40, b = 1000, C24, E = 11000):
//   z₀ = 80 mm; I_ef,net = 3·(1000·40³/12) + 2·(40 000·60²) = 3,04·10⁸ mm⁴
//   (EI)_ef = 3,344·10¹² N·mm²; (EA)_ef = 1,32·10⁹ N
//   M = 20 kNm: σ_rand = 5,263; σ binnenkant buitenlaag = 2,632; σ_mid = 1,316
//   V = 10 kN: (ES)(40) = 2,64·10¹⁰ N·mm → τ_rol = 0,0789; τ_max (z₀) = 0,0855
//
// Draaien met: npx tsx test-clt-builder.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const clt = await import("./src/lib/cltCheckBuilder.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual} ≈ ${expected}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}
function checkEq(name, actual, expected) {
  checkTrue(`${name}: ${JSON.stringify(actual)}`, JSON.stringify(actual) === JSON.stringify(expected));
}

const E_C = { C24: 11000, C16: 8000 };
const eVan = (k) => E_C[k];

// ── 1. Profielnaam-grammatica ─────────────────────────────────────────────
log("1. Profielnaam → opbouw → profielnaam");
checkTrue("herkenning 'CLT 40/20/40/20/40'", clt.isCltProfiel("CLT 40/20/40/20/40"));
checkTrue("herkenning kleine letters", clt.isCltProfiel("clt 30/30/30"));
checkTrue("'96x450' is geen CLT", !clt.isCltProfiel("96x450"));
checkTrue("'HEA160' is geen CLT", !clt.isCltProfiel("HEA160"));

const l5 = clt.parseCltProfiel("CLT 40/20/40/20/40", "C24");
checkTrue("5-laags geparsed", l5 !== null && l5.layers.length === 5);
checkEq("richting afwisselend L/D", l5.layers.map((l) => l.orientation),
  ["Longitudinal", "Transverse", "Longitudinal", "Transverse", "Longitudinal"]);
checkEq("klasse = materiaal", [...new Set(l5.layers.map((l) => l.strength_class))], ["C24"]);
check("standaardbreedte 1000", l5.width_mm, 1000);
checkEq("canonieke naam", clt.formatCltProfiel(l5, "C24"), "CLT 40/20/40/20/40");

const lx = clt.parseCltProfiel("CLT 40L:C24/20D:C16/40L/20D/40L b600", "C24");
checkTrue("expliciete vorm geparsed", lx !== null);
checkEq("laag 2 klasse C16", lx.layers[1].strength_class, "C16");
checkEq("laag 2 dwars", lx.layers[1].orientation, "Transverse");
check("breedte 600", lx.width_mm, 600);
checkEq("kortste naam bewaart alleen afwijkingen", clt.formatCltProfiel(lx, "C24"), "CLT 40/20:C16/40/20/40 b600");

const ld = clt.parseCltProfiel("CLT 40D/20L/40D", "C24");
checkEq("afwijkende richting expliciet", ld.layers.map((l) => l.orientation), ["Transverse", "Longitudinal", "Transverse"]);
checkEq("… en terug in de naam", clt.formatCltProfiel(ld, "C24"), "CLT 40D/20L/40D");

checkTrue("twee lagen afgewezen", clt.parseCltProfiel("CLT 40/20", "C24") === null);
checkTrue("nul-dikte afgewezen", clt.parseCltProfiel("CLT 40/0/40", "C24") === null);
checkTrue("rommel afgewezen", clt.parseCltProfiel("CLT 40/x/40", "C24") === null);
checkTrue("rechthoek afgewezen", clt.parseCltProfiel("96x450", "C24") === null);

const vp = clt.CLT_VOORINSTELLINGEN.find((p) => p.name === "5-laags 160");
const lv = clt.cltVanVoorinstelling(vp, "C24");
checkEq("voorinstelling 5-laags 160 → naam", clt.formatCltProfiel(lv, "C24"), "CLT 40/20/40/20/40");
check("voorinstelling hoogte", clt.cltHoogteMm(lv), 160);
checkTrue("alle voorinstellingen oneven en sluitend", clt.CLT_VOORINSTELLINGEN.every(
  (p) => p.thicknesses_mm.length % 2 === 1 && p.thicknesses_mm.reduce((a, b) => a + b, 0) === p.height_mm));

// ── 2. Mechanica-spiegel tegen de handberekening ──────────────────────────
log("2. Mechanica (spiegel van de Rust-kern) — handberekening");
const mech = clt.cltMechanica(l5, eVan);
check("z₀ = 80 mm", mech.z0, 80);
check("h = 160 mm", mech.hoogte, 160);
check("(EI)_ef = 3,344e12 N·mm²", mech.eiEf, 3.344e12, 1e-6);
check("(EA)_ef = 1,32e9 N", mech.eaEf, 1.32e9, 1e-6);
check("σ rand buitenlaag (z = 160)", clt.cltSigmaOpZ(mech, 4, 160, 20), 5.2632, 0.01);
check("σ binnenkant buitenlaag (z = 120)", clt.cltSigmaOpZ(mech, 4, 120, 20), 2.6316, 0.01);
check("σ middenlaag onderkant (z = 100)", clt.cltSigmaOpZ(mech, 2, 100, 20), 1.3158, 0.01);
check("σ bovenlaag rand = druk", clt.cltSigmaOpZ(mech, 0, 0, 20), -5.2632, 0.01);
check("σ dwarslaag = 0", clt.cltSigmaOpZ(mech, 1, 50, 20), 0);
check("(ES)(40) = 2,64e10 N·mm", Math.abs(clt.cltEsBoven(mech, 40)), 2.64e10, 1e-6);
check("τ_rol (z = 40)", clt.cltTauOpZ(mech, 40, 10, 1), 0.078947, 0.01);
check("τ constant over de dwarslaag", clt.cltTauOpZ(mech, 55, 10, 1), 0.078947, 0.01);
check("τ_max op z₀", clt.cltTauOpZ(mech, 80, 10, 1), 0.085526, 0.01);
check("k_cr = 0,67 vergroot τ met 1/0,67", clt.cltTauOpZ(mech, 80, 10, 0.67), 0.085526 / 0.67, 0.01);
checkTrue("onbekende klasse → null", clt.cltMechanica(l5, () => undefined) === null);
checkTrue("alleen dwarslagen → null", clt.cltMechanica(
  { width_mm: 1000, layers: [1, 2, 3].map(() => ({ thickness_mm: 20, orientation: "Transverse", strength_class: "C24" })) },
  eVan) === null);

// Uit het resultaat van de kern moet dezelfde mechanica volgen.
const alsResultaat = {
  width_mm: 1000, height_mm: 160, z0_mm: 80, ei_ef_knm2: 3344, ea_ef_kn: 1.32e6,
  i_ef_net_mm4: 3.04e8, slenderness: 31.25, governing_layer: 1,
  layers: mech.lagen.map((l, i) => ({
    index: i + 1, thickness_mm: l.zOnder - l.zBoven, orientation: l.richting, strength_class: "C24",
    z_top_mm: l.zBoven, z_bot_mm: l.zOnder, e_mpa: l.e, sigma_top_mpa: 0, sigma_bot_mpa: 0,
    tau_max_mpa: 0, f_md_mpa: 0, f_vd_mpa: 0, uc_bending: null, uc_shear: null, governing: false, check_ids: [],
  })),
};
const mech2 = clt.cltMechanicaUitResultaat(alsResultaat);
check("uit resultaat: (EI)_ef", mech2.eiEf, 3.344e12, 1e-6);
check("uit resultaat: τ_max", clt.cltTauOpZ(mech2, 80, 10, 1), 0.085526, 0.01);

// ── 3. Doorsnede voor de solver ───────────────────────────────────────────
log("3. Solver-doorsnede");
const sd = clt.cltSolverDoorsnede(l5, eVan);
check("E = E_ref = 11000", sd.E, 11000);
check("I = (EI)_ef/E = 3,04e8", sd.I, 3.04e8, 1e-6);
check("A = (EA)_ef/E = 120 000 (3 lengtelagen)", sd.A, 120000, 1e-6);
check("A_bruto = 160 000 (alle lagen, eigen gewicht)", sd.aBruto, 160000);

// ── 4. Invoerbouw op een doorgerekend model ───────────────────────────────
log("4. buildCltCheckInputs op een vrij opgelegde CLT-strook");
const L = 5000;
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
const solverBeams = [{ id: 1, from: 1, to: 2, E: sd.E, A: sd.A, I: sd.I }];
const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -3 }] })],
  [2, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -3 }] })],
]);
const combinations = defaultCombinations();
const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));

const beams = [
  { id: 1, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40/20/40", checkConfig: { serviceClass: 2, loadDuration: "short" } },
  { id: 2, from: 1, to: 2, material: "S235", profile: "CLT 40/20/40/20/40" },
  { id: 3, from: 1, to: 2, material: "C24", profile: "CLT 40/20" },
  { id: 4, from: 1, to: 2, material: "C24", profile: "96x450" },
  { id: 5, from: 1, to: 2, material: "C24", profile: "CLT 40/20:D40/40" },
];
const { inputs, skipped } = clt.buildCltCheckInputs({ nodes, beams, combinations, combinationResults });
checkEq("één toetsbare CLT-staaf", inputs.map((i) => i.beam_id), [1]);
checkEq("staven 2, 3, 5 overgeslagen met reden; 4 is geen zaak van deze bouwer",
  skipped.map((s) => s.beamId), [2, 3, 5]);
checkTrue("reden staaf 2 noemt het materiaal", /S235/.test(skipped[0].reason));
checkTrue("reden staaf 3 noemt de grammatica", /CLT 40\/20\/40\/20\/40/.test(skipped[1].reason));
checkTrue("reden staaf 5 noemt D40", /D40/.test(skipped[2].reason));
const inp = inputs[0];
check("lengte 5 m", inp.length_m, 5);
checkEq("klimaatklasse uit checkConfig", inp.service_class, "Sc2");
checkEq("belastingduur uit checkConfig", inp.load_duration, "ShortTerm");
check("k_cr = 1,0 (NB, prismatisch)", inp.k_cr, 1);
checkTrue("opbouw met 5 lagen", inp.layup.layers.length === 5 && inp.layup.width_mm === 1000);
checkTrue("krachtsverloop gevuld", inp.forces_envelope.length > 0);
const mMax = Math.max(...inp.forces_envelope.map((p) => Math.abs(p.forces.my_ed)));
checkTrue(`veldmoment in de envelop (${mMax.toFixed(2)} kNm > 0)`, mMax > 0);

// ── 5. Type-guard ─────────────────────────────────────────────────────────
log("5. isCltCheckResult");
checkTrue("met layup → CLT", clt.isCltCheckResult({ beam_id: 1, layup: alsResultaat }));
checkTrue("houtresultaat zonder layup → niet", !clt.isCltCheckResult({ beam_id: 1, section_name: "96 x 450" }));

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed === 0 ? 0 : 1);
