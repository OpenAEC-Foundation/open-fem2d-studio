// Vrije spanningstoets — de frontendkant: de grammatica van het vrije
// materiaal, de doorsnede-herkenning, de doorwerking naar solverstijfheid en
// eigen gewicht, en de invoerbouw op een doorgerekend model.
//
// De TOETSING zelf zit in de Rust-kern (`src-tauri/crates/spanning-check`) en
// is daar tegen handberekeningen getest (tests/handberekening.rs). Deze test
// bewaakt wat de frontend eraan levert: welke staven meedoen, met welke
// doorsnede en met welke materiaalgegevens — en of een staaf die niet mee kan
// doen een expliciete reden krijgt in plaats van stilte.
//
// Handberekeningen die hier gecontroleerd worden:
//   rechthoek 300 × 500: A = 150 000 mm², I = 300·500³/12 = 3,125·10⁹ mm⁴
//   eigen gewicht bij ρ = 2700 kg/m³: q = 2700 · 0,15 m² · 9,81 / 1000
//                                       = 3,973 kN/m (negatief, omlaag)
//   HEA 200 uit de database: A = 5380 mm², I_y = 3,69·10⁷ mm⁴
//
// Draaien met: npx tsx test-spanning-builder.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const vm = await import("./src/lib/vrijMateriaal.ts");
const sp = await import("./src/lib/spanningCheckBuilder.ts");
const sec = await import("./src/lib/sectionResolver.ts");

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

// ── 1. Grammatica van het vrije materiaal ─────────────────────────────────
log("1. Materiaalnaam → vrij materiaal → materiaalnaam");
checkTrue("herkenning 'VRIJ:…'", vm.isVrijMateriaal("VRIJ:Natuursteen E=60000 rho=2700 f=8"));
checkTrue("herkenning kleine letters", vm.isVrijMateriaal("vrij:Steen E=1 rho=1 f=1"));
checkTrue("'S235' is geen vrij materiaal", !vm.isVrijMateriaal("S235"));
checkTrue("'C24' is geen vrij materiaal", !vm.isVrijMateriaal("C24"));
checkTrue("undefined is geen vrij materiaal", !vm.isVrijMateriaal(undefined));

const steen = vm.parseVrijMateriaal("VRIJ:Natuursteen E=60000 rho=2700 f=8");
checkTrue("geparsed", steen !== null);
checkEq("naam", steen.naam, "Natuursteen");
check("E", steen.eMod, 60000);
check("ρ", steen.dichtheid, 2700);
check("f_toel", steen.fToel, 8);
check("γ_M standaard 1", steen.gammaM, 1);
checkEq("kortste naam laat γ_M = 1 weg",
  vm.formatVrijMateriaal(steen), "VRIJ:Natuursteen E=60000 rho=2700 f=8");

const ijzer = vm.parseVrijMateriaal("VRIJ:Gietijzer E=100000 rho=7200 f=150 gM=1.5");
check("γ_M expliciet", ijzer.gammaM, 1.5);
checkEq("γ_M ≠ 1 komt terug in de naam",
  vm.formatVrijMateriaal(ijzer), "VRIJ:Gietijzer E=100000 rho=7200 f=150 gM=1.5");

const spatie = vm.parseVrijMateriaal("VRIJ:Belgisch hardsteen E=70000 rho=2680 f=6,5");
checkEq("naam met spaties", spatie.naam, "Belgisch hardsteen");
check("decimaalkomma in f", spatie.fToel, 6.5);

checkTrue("zonder f → null", vm.parseVrijMateriaal("VRIJ:Steen E=60000 rho=2700") === null);
checkTrue("zonder E → null", vm.parseVrijMateriaal("VRIJ:Steen rho=2700 f=8") === null);
checkTrue("zonder naam → null", vm.parseVrijMateriaal("VRIJ: E=60000 rho=2700 f=8") === null);
checkTrue("f = 0 → null", vm.parseVrijMateriaal("VRIJ:Steen E=60000 rho=2700 f=0") === null);
checkTrue("E = 0 → null", vm.parseVrijMateriaal("VRIJ:Steen E=0 rho=2700 f=8") === null);
checkTrue("γ_M = 0 → null", vm.parseVrijMateriaal("VRIJ:Steen E=6e4 rho=2700 f=8 gM=0") === null);
checkTrue("ρ = 0 mag (gewichtloos rekenen)", vm.parseVrijMateriaal("VRIJ:Steen E=60000 rho=0 f=8") !== null);
checkEq("leesbare weergave", vm.materiaalWeergave("VRIJ:Natuursteen E=60000 rho=2700 f=8"),
  "Natuursteen (f = 8 N/mm²)");
checkEq("gewone naam blijft ongewijzigd", vm.materiaalWeergave("S235"), "S235");

// ── 2. Doorsnede-herkenning ───────────────────────────────────────────────
log("2. Profielnaam → doorsnede-invoer");
checkEq("rechthoek", sp.doorsnedeVanProfiel("300x500"),
  { vorm: "Rechthoek", maten: { b_mm: 300, h_mm: 500 } });
checkEq("rechthoek met spaties en ×", sp.doorsnedeVanProfiel("300 × 500"),
  { vorm: "Rechthoek", maten: { b_mm: 300, h_mm: 500 } });
checkEq("catalogusprofiel", sp.doorsnedeVanProfiel("HEA200"),
  { vorm: "Catalogus", maten: { naam: "HEA200" } });
checkEq("catalogusprofiel met spatie", sp.doorsnedeVanProfiel("IPE 300"),
  { vorm: "Catalogus", maten: { naam: "IPE 300" } });
checkTrue("CLT afgewezen met reden", /kruislaaghout/.test(sp.doorsnedeVanProfiel("CLT 40/20/40")));
checkTrue("eigen doorsnede afgewezen met reden", /b\(z\)/.test(sp.doorsnedeVanProfiel("EIGEN:mijnprofiel")));
checkTrue("leeg profiel afgewezen met reden", /geen profiel/.test(sp.doorsnedeVanProfiel(undefined)));
checkTrue("onbekend profiel afgewezen met reden", /profieldatabase/.test(sp.doorsnedeVanProfiel("ZZZ999")));

// ── 3. Doorwerking naar solver en eigen gewicht ───────────────────────────
log("3. resolveSection + eigenGewichtPerMeter voor een vrij materiaal");
const mat = "VRIJ:Natuursteen E=60000 rho=2700 f=8";
const rs = sec.resolveSection(mat, "300x500");
checkEq("bron 'vrij'", rs.bron, "vrij");
check("E uit de naam", rs.E, 60000);
check("A = b·h", rs.A, 150000);
check("I = b·h³/12", rs.I, 3.125e9, 1e-6);
// ρ · A · g: 2700 · 0,15 · 9,81 / 1000 = 3,9730 kN/m, omlaag dus negatief.
check("eigen gewicht uit ρ van het materiaal",
  sec.eigenGewichtPerMeter(mat, "300x500"), -(2700 * 0.15 * 9.81) / 1000, 0.01);
checkTrue("staaldichtheid wordt NIET gebruikt",
  Math.abs(sec.eigenGewichtPerMeter(mat, "300x500") + (7850 * 0.15 * 9.81) / 1000) > 1);

const rsProfiel = sec.resolveSection(mat, "HEA200");
checkEq("catalogusprofiel: bron 'vrij'", rsProfiel.bron, "vrij");
check("catalogusprofiel: E uit de naam", rsProfiel.E, 60000);
check("catalogusprofiel: A uit de database", rsProfiel.A, 5380, 0.5);
check("catalogusprofiel: I_y uit de database", rsProfiel.I, 3.69e7, 0.5);

// ── 4. Invoerbouw op een doorgerekend model ───────────────────────────────
log("4. buildSpanningCheckInputs op een vrij opgelegde ligger");
// Twee velden, zodat de staven 1 en 2 elk een eigen element met een eigen
// krachtsverloop hebben; de staven 3–6 vallen al eerder af.
const L = 4000;
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 }];
const solverBeams = [
  { id: 1, from: 1, to: 2, E: rs.E, A: rs.A, I: rs.I },
  { id: 2, from: 2, to: 3, E: rsProfiel.E, A: rsProfiel.A, I: rsProfiel.I },
];
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "zRoller" },
  { nodeId: 3, type: "zRoller" },
];
const lasten = [{ beamId: 1, q: -10 }, { beamId: 2, q: -10 }];
const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads: lasten })],
  [2, solve({ nodes, beams: solverBeams, supports, loads: lasten })],
]);
const combinations = defaultCombinations();
const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));

const beams = [
  { id: 1, from: 1, to: 2, material: mat, profile: "300x500" },
  { id: 2, from: 2, to: 3, material: mat, profile: "HEA200", checkConfig: { spanningSigmaZ: 2.5 } },
  { id: 3, from: 1, to: 2, material: "VRIJ:Steen E=60000 rho=2700", profile: "300x500" },
  { id: 4, from: 1, to: 2, material: mat, profile: "CLT 40/20/40" },
  { id: 5, from: 1, to: 2, material: "S235", profile: "HEA200" },
  { id: 6, from: 1, to: 2, material: "VRIJ:Gietijzer E=100000 rho=7200 f=150 gM=1.5", profile: "ZZZ999" },
];
const { inputs, skipped } = sp.buildSpanningCheckInputs({ nodes, beams, combinations, combinationResults });
checkEq("twee toetsbare staven", inputs.map((i) => i.beam_id), [1, 2]);
checkEq("staven 3, 4 en 6 overgeslagen; 5 is geen zaak van deze bouwer",
  skipped.map((s) => s.beamId), [3, 4, 6]);
checkTrue("reden staaf 3 noemt de grammatica", /VRIJ:<naam>/.test(skipped[0].reason));
checkTrue("reden staaf 4 noemt kruislaaghout", /kruislaaghout/.test(skipped[1].reason));
checkTrue("reden staaf 6 noemt de profieldatabase", /profieldatabase/.test(skipped[2].reason));

const i1 = inputs[0];
checkEq("materiaalnaam zonder codering", i1.material_name, "Natuursteen");
check("f_toel", i1.f_toel_mpa, 8);
check("γ_M standaard 1", i1.gamma_m, 1);
check("σ_z standaard 0", i1.sigma_z_mpa, 0);
check("lengte 4 m", i1.length_m, 4);
checkEq("doorsnede is de rechthoek", i1.section, { vorm: "Rechthoek", maten: { b_mm: 300, h_mm: 500 } });
checkTrue("krachtsverloop gevuld", i1.forces_envelope.length > 0);
const mMax = Math.max(...i1.forces_envelope.map((p) => Math.abs(p.forces.my_ed)));
checkTrue(`veldmoment in de envelop (${mMax.toFixed(2)} kNm > 0)`, mMax > 0);

const i2 = inputs[1];
check("σ_z uit checkConfig", i2.sigma_z_mpa, 2.5);
checkEq("doorsnede is het catalogusprofiel", i2.section, { vorm: "Catalogus", maten: { naam: "HEA200" } });

// ── 5. Type-guard ─────────────────────────────────────────────────────────
log("5. isSpanningCheckResult");
checkTrue("met f_toel_mpa → spanning", sp.isSpanningCheckResult({ beam_id: 1, f_toel_mpa: 8 }));
checkTrue("staalresultaat → niet", !sp.isSpanningCheckResult({ beam_id: 1, profile_name: "HEA 200" }));
checkTrue("houtresultaat → niet", !sp.isSpanningCheckResult({ beam_id: 1, strength_class: "C24" }));

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed === 0 ? 0 : 1);
