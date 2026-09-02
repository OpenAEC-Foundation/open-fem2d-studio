// Taak A3 — veldzakking w(x) per station in de verplaatsingsuitvoer.
// Verifieert dat engine.ts per staaf een 21-station deflection[]-array (mm,
// lokaal, +y = omhoog voor een horizontale staaf) levert waarvan de waarden
// de EXACTE Euler-Bernoulli-veldzakking geven — dus inclusief de particuliere
// oplossing van de elementbelasting, niet alleen Hermite op knoopwaarden.
//
// Stijl: test-v2-stations.mjs. Draaien met: npx tsx test-veldzakking.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");

const E = 210000;      // N/mm²
const I = 1e8;         // mm⁴
const A = 3877;        // mm²
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
// TEST 1: vrij opgelegde ligger L=6 m, q=10 kN/m ↓ → w_mid = 5qL⁴/(384EI)
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrij opgelegd L=6 m + q=10 kN/m ↓ (q=-10 N/mm)");
let w1 = null; // bewaard voor symmetrietest 4
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10 }],
  });
  const ef = r.elements.get(1);
  checkTrue("deflection[] aanwezig (21 stations)", Array.isArray(ef.deflection) && ef.deflection.length === 21);
  if (Array.isArray(ef.deflection) && ef.deflection.length === 21) {
    w1 = ef.deflection;
    const wExp = 5 * 10 * Math.pow(6000, 4) / (384 * E * I);  // = 8.0357 mm
    check("|w_mid| = 5qL⁴/384EI", Math.abs(ef.deflection[10]), wExp, 1);
    checkTrue("w_mid < 0 (doorhangen = negatief, lokale +y omhoog)", ef.deflection[10] < 0);
    check("w(0) = 0", Math.abs(ef.deflection[0]), 0, 1);
    check("w(L) = 0", Math.abs(ef.deflection[20]), 0, 1);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: beide zijden ingeklemd, zelfde belasting → w_mid = qL⁴/(384EI)
// (knoopverplaatsingen + rotaties zijn hier 0 — ALLES komt uit de
//  particuliere oplossing; dé test dat Hermite-op-knopen alleen niet volstaat)
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Ingeklemd-ingeklemd L=6 m + q=10 kN/m ↓");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: [{ beamId: 1, q: -10 }],
  });
  const ef = r.elements.get(1);
  const wExp = 10 * Math.pow(6000, 4) / (384 * E * I);        // = 1.6071 mm
  check("|w_mid| = qL⁴/384EI", Math.abs((ef.deflection ?? [])[10] ?? NaN), wExp, 1);
  check("w(0) = 0", Math.abs((ef.deflection ?? [])[0] ?? NaN), 0, 1);
  check("w(L) = 0", Math.abs((ef.deflection ?? [])[20] ?? NaN), 0, 1);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: uitkraging L=4 m + puntlast F=10 kN op het eind → w_tip = FL³/(3EI)
// (puntlast op eindknoop → geen elementbelasting: test het Hermite-deel)
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Uitkraging L=4 m + tip P=-10 kN");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 0, fz: -10000 }],
  });
  const ef = r.elements.get(1);
  const wExp = 10000 * Math.pow(4000, 3) / (3 * E * I);       // = 10.159 mm
  check("|w_tip| = FL³/3EI", Math.abs((ef.deflection ?? [])[20] ?? NaN), wExp, 1);
  check("w(0) = 0 (inklemming)", Math.abs((ef.deflection ?? [])[0] ?? NaN), 0, 1);
  // Kwart-punt controle: exact w(x) = F x²(3L−x)/(6EI)
  const xq = 0.25 * 4000;
  const wq = 10000 * xq * xq * (3 * 4000 - xq) / (6 * E * I);
  check("|w(L/4)| exact-kromme", Math.abs((ef.deflection ?? [])[5] ?? NaN), wq, 1);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: symmetrie — w-array van geval 1 symmetrisch rond het midden
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Symmetrie w(x) van geval 1 rond midden (rel. tol 1e-6)");
{
  if (!w1) { failed++; log("  ✗ geen w-array uit test 1"); }
  else {
    const wMax = Math.max(...w1.map(Math.abs), 1e-12);
    let worst = 0;
    for (let i = 0; i <= 10; i++) {
      const d = Math.abs(w1[i] - w1[20 - i]) / wMax;
      if (d > worst) worst = d;
    }
    checkTrue(`symmetrisch (max rel. afwijking ${worst.toExponential(2)} ≤ 1e-6)`, worst <= 1e-6);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5 (bonus): driehoeksbelasting 0→10 kN/m op vrij opgelegde ligger
// valideert het trapezium-deel van de particuliere oplossing.
// Exact: w(x) = q0·x·(7L⁴ − 10L²x² + 3x⁴)/(360·L·EI)
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Vrij opgelegd L=6 m + driehoek q: 0 → -10 N/mm");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, qStart: 0, qEnd: -10 }],
  });
  const ef = r.elements.get(1);
  const L = 6000, q0 = 10;
  const wExact = (x) => q0 * x * (7 * L ** 4 - 10 * L * L * x * x + 3 * x ** 4) / (360 * L * E * I);
  check("|w_mid| driehoek", Math.abs((ef.deflection ?? [])[10] ?? NaN), wExact(L / 2), 1);
  check("|w(0.55L)| driehoek (nabij max)", Math.abs((ef.deflection ?? [])[11] ?? NaN), wExact(0.55 * L), 1);
}

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
