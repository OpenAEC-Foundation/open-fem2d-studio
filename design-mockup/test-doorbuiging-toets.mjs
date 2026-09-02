// Taak B3 — doorbuigingstoets gebruikt het VELDmaximum, niet de knopen.
// Verifieert dat steelCheckBuilder/timberCheckBuilder de zakking voor de
// BGT-doorbuigingstoets uit de 21-station deflection[]-arrays halen (max |w|,
// teken behouden: negatief = omlaag, conform de kern-conventie) en dus voor
// een vrij opgelegde ligger ≈ 5qL⁴/384EI doorgeven en NIET ~0 (de knopen
// zakken daar immers niet).
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-doorbuiging-toets.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildSteelCheckInputs, extractFieldDeflectionMm } = await import(
  "./src/lib/steelCheckBuilder.ts"
);
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

const E = 210000; // N/mm²
const I = 1e8;    // mm⁴
const A = 3877;   // mm²
const L = 6000;   // mm
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(4)} ≈ ${expected.toFixed(4)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected.toFixed(4)}`); }
}

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Model: vrij opgelegde ligger L=6 m, twee lastgevallen
//   G (case 1): q = -5 N/mm,  Q (case 2): q = -5 N/mm
// SLS Karakteristiek (combo 6) = 1,0·G + 1,0·Q → q = 10 N/mm
//   w_mid = 5qL⁴/384EI = 5·10·6000⁴/(384·210000·1e8) = 8,0357 mm (omlaag)
// ─────────────────────────────────────────────────────────────────────────
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
const solverBeams = [{ id: 1, from: 1, to: 2, E, A, I }];
const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];

const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -5 }] })],
  [2, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -5 }] })],
]);

const combos = defaultCombinations();
const combinationResults = new Map(
  combos.map((c) => [c.id, combineResults(c, perCase)]),
);

const wExp = 5 * 10 * Math.pow(L, 4) / (384 * E * I); // 8,0357 mm

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Sanity: knopen zakken niet, veld wel (anders test dit niets)");
{
  const slsRes = combinationResults.get(6);
  const d1 = slsRes.displacements.get(1), d2 = slsRes.displacements.get(2);
  checkTrue("|uz| eindknopen < 0.01 mm", Math.abs(d1.uz) < 0.01 && Math.abs(d2.uz) < 0.01);
  check("|w_mid| station-array = 5qL⁴/384EI", Math.abs(slsRes.elements.get(1).deflection[10]), wExp, 1);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Staal: deflection_actual_max_mm = veldmaximum (teken behouden)");
{
  const { inputs, skipped } = buildSteelCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" }],
    combinations: combos,
    combinationResults,
    profileDb: new Map([["HEA160", { geometry: { h: 152 } }]]),
  });
  checkTrue("1 input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const w = inputs[0]?.deflection_actual_max_mm ?? NaN;
  checkTrue("NIET ~0 (de oude knoop-extractie gaf hier 0)", Math.abs(w) > 1);
  check("|w| = 5qL⁴/384EI", Math.abs(w), wExp, 1);
  checkTrue("teken negatief (omlaag, kern-conventie)", w < 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Hout: deflection_inst_mm en deflection_quasi_perm_mm = veldmaximum");
{
  const { inputs, skipped } = buildTimberCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "60x100" }],
    combinations: combos,
    combinationResults,
  });
  checkTrue("1 input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const wi = inputs[0]?.deflection_inst_mm ?? NaN;
  const wq = inputs[0]?.deflection_quasi_perm_mm ?? NaN;
  checkTrue("w_inst NIET ~0", Math.abs(wi) > 1);
  check("|w_inst| = 5qL⁴/384EI", Math.abs(wi), wExp, 1);
  checkTrue("w_inst negatief (omlaag)", wi < 0);
  check("w_qp = w_inst (gedocumenteerde veilig-zijdige keuze)", wq, wi, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Teken bij max |w|: grootste amplitude wint, teken blijft");
{
  const fake = {
    displacements: new Map([[1, { ux: 0, uz: 0, ry: 0 }], [2, { ux: 0, uz: 0, ry: 0 }]]),
    reactions: new Map(),
    elements: new Map([[7, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 1000,
      stations_mm: [0, 500, 1000],
      normalForce: [0, 0, 0], shearForce: [0, 0, 0], bendingMoment: [0, 0, 0],
      deflection: [0, 3.2, -5.7], axialDisp: [0, 0, 0],
    }]]),
    maxDisplacement: 0,
  };
  const w = extractFieldDeflectionMm({ id: 7, from: 1, to: 2 }, fake);
  check("w = -5.7 (|max|, teken behouden)", w, -5.7, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Fallback: geen station-arrays (ouder resultaat) → knooppad + warn");
{
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  const oldStyle = {
    displacements: new Map([
      [1, { ux: 0, uz: -12.3, ry: 0 }],
      [2, { ux: 0, uz: -3.0, ry: 0 }],
    ]),
    reactions: new Map(),
    elements: new Map([[7, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 1000,
      stations_mm: [0, 500, 1000],
      normalForce: [0, 0, 0], shearForce: [0, 0, 0], bendingMoment: [0, 0, 0],
      // GEEN deflection/axialDisp — resultaat van vóór de veldzakking-uitbreiding
    }]]),
    maxDisplacement: 12.3,
  };
  const w = extractFieldDeflectionMm({ id: 7, from: 1, to: 2 }, oldStyle);
  console.warn = origWarn;
  check("fallback: signed knoop-uz met max |uz|", w, -12.3, 0.01);
  checkTrue("console.warn over mogelijke onderschatting", warns.length >= 1 && /onderschat/i.test(warns.join(" ")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Geen resultaat → 0 (geen crash)");
{
  const w = extractFieldDeflectionMm({ id: 1, from: 1, to: 2 }, null);
  check("null-resultaat → 0", w, 0, 0.01);
}

log(`\n${"─".repeat(60)}`);
log(`Totaal: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
