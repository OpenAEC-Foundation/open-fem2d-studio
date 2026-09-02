// Leeg belastinggeval: het standaardmodel heeft vier gevallen (G/Q/S/W)
// waarvan er meestal maar één of twee gevuld zijn. Een leeg geval liet
// voorheen de HELE multi-LC-pijplijn falen ("No loads applied" uit de kern),
// waardoor combinaties, omhullende én toetsing verdwenen. Regressietest:
// lege gevallen worden overgeslagen; combinaties behandelen ze als
// nulbijdrage (mechanisch exact).
//
// Referentie: vrij opgelegde ligger L, UDL q alleen in geval G →
//   M_mid = qL²/8, R = qL/2, en elke combinatie = factor_G × geval-G.

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults, computeEnvelope } = await import("./src/components/fem/solver/combinations.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7; // HEA 160 / S235
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(3)} ≈ ${expected.toFixed(3)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(3)} vs ${expected.toFixed(3)} (Δ=${(actual - expected).toFixed(3)})`); }
}

const L = 6000, q = -10; // mm, N/mm (omlaag)

// Vier gevallen zoals het standaardmodel; alleen G (id 1) draagt een last.
const input = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  loads: [{ beamId: 1, q, caseId: 1 }],
  cases: [
    { id: 1, name: "Permanent" },
    { id: 2, name: "Variabel" }, // leeg
    { id: 3, name: "Sneeuw" },   // leeg
    { id: 4, name: "Wind" },     // leeg
  ],
};

log("\n[1] solveAllCases met drie lege gevallen gooit niet en levert alleen G");
let r;
try {
  r = solveAllCases(input);
  passed++; log("  ✓ geen exceptie");
} catch (e) {
  failed++; log(`  ✗ exceptie: ${e.message}`);
  process.exit(1);
}
check("aantal opgeloste gevallen", r.perCase.size, 1, 0);
check("geval G aanwezig", r.perCase.has(1) ? 1 : 0, 1, 0);

const efG = r.perCase.get(1).elements.get(1);
check("G: |M_mid| = qL²/8", Math.abs(efG.bendingMoment[10]), Math.abs(q) * L * L / 8);

log("\n[2] Combinatie over gevulde + lege gevallen = factor_G × geval-G");
const combo = {
  id: 1, name: "ULS 6.10a", type: "uls",
  formula: "1.35G + 1.05Q + 1.05S + 0.9W",
  factors: new Map([[1, 1.35], [2, 1.05], [3, 1.05], [4, 0.9]]),
};
const c = combineResults(combo, r.perCase);
const efC = c.elements.get(1);
check("combi: |M_mid| = 1.35·qL²/8", Math.abs(efC.bendingMoment[10]), 1.35 * Math.abs(q) * L * L / 8);
check("combi: reactie fz knoop 1 = 1.35·qL/2", Math.abs(c.reactions.get(1).fz), 1.35 * Math.abs(q) * L / 2);
check("combi: zakking = 1.35 × geval-G", efC.deflection[10], 1.35 * efG.deflection[10]);

log("\n[3] Omhullende over combinaties met lege gevallen werkt");
const comboSls = {
  id: 6, name: "SLS Karakteristiek", type: "sls",
  formula: "G + Q + 0.7S + 0.6W",
  factors: new Map([[1, 1.0], [2, 1.0], [3, 0.7], [4, 0.6]]),
};
const env = computeEnvelope([combo, comboSls], r.perCase);
const span = env.elements.get(1);
check("omhullende aanwezig voor staaf 1", span ? 1 : 0, 1, 0);
check("omhullende maxDisplacement > 0", env.maxDisplacement > 0 ? 1 : 0, 1, 0);

log("\n[4] Volledig leeg model (geen enkele last) gooit evenmin");
try {
  const r0 = solveAllCases({ ...input, loads: [] });
  check("perCase leeg", r0.perCase.size, 0, 0);
  const c0 = combineResults(combo, r0.perCase);
  check("combinatie zonder gevallen = leeg resultaat", c0.elements.size, 0, 0);
} catch (e) {
  failed++; log(`  ✗ exceptie: ${e.message}`);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
