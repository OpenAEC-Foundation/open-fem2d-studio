// De grootste verplaatsing (`maxDisplacement`) boven het canvas: issue #32.
//
// De melding "Doorgerekend: max |u| = … mm" gaf 0,00 mm bij een doorbuigende
// ligger. `maxDisplacement` telde alleen de verplaatsingen IN DE KNOPEN; een
// ligger met alleen oplegknopen heeft daar u = 0, en de doorbuiging tussen de
// knopen bleef buiten beschouwing. De vervormingsweergave op het canvas
// (FemResultsOverlay) neemt wél de veldkromme uit de stationsarrays
// (`deflection`, `axialDisp`) mee, als lengte van de verplaatsingsvector.
// Verwacht: de melding en de weergave geven hetzelfde getal.
//
// Referenties (handberekening, lineair-elastisch, Euler-Bernoulli):
//   ligger op twee steunpunten, q:     w_max = 5qL⁴/(384EI) in het midden
//   ligger ingeklemd-vrij, F aan top:  w = FL³/(3EI), u = F_axiaal·L/(EA)
//   combinatie en omhullende:          lineair, dus factor × geval
//
// Uitvoeren: npx tsx test-max-verplaatsing.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults, computeEnvelope } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(4)} ≈ ${expected.toFixed(4)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(4)} vs ${expected.toFixed(4)} (Δ=${(actual - expected).toFixed(4)})`); }
}

// IPE 270 / S235 in N en mm.
const E = 210000, A = 4595, I = 5.79e7;

// ─────────────────────────────────────────────────────────────────────────
// [1] Ligger op twee steunpunten, alleen knopen op de steunpunten
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Ligger 6 m op twee steunpunten, q = 10 kN/m, knopen alleen op de steunpunten");
const L = 6000, q = -10; // mm, N/mm (omlaag)
const wMid = 5 * Math.abs(q) * L ** 4 / (384 * E * I);
const ligger = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, E, A, I }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  loads: [{ beamId: 1, q, caseId: 1 }, { beamId: 1, q: 2 * q, caseId: 2 }],
  cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }],
};
const { perCase } = solveAllCases(ligger);
const g = perCase.get(1);
const knoopMax = Math.max(...[...g.displacements.values()].map((d) => Math.hypot(d.ux, d.uz)));
check("knopen zelf: u = 0", knoopMax, 0);
check("maxDisplacement = 5qL⁴/384EI (was 0,00)", g.maxDisplacement, wMid);
check("geval Q (2q): 2 × 5qL⁴/384EI", perCase.get(2).maxDisplacement, 2 * wMid);

log("\n[2] Combinatie en omhullende nemen de veldkromme mee");
const c1 = { id: 1, name: "1,35G", type: "uls", formula: "1.35G", factors: new Map([[1, 1.35]]) };
const c2 = { id: 2, name: "1,2G + 1,5Q", type: "uls", formula: "1.2G + 1.5Q", factors: new Map([[1, 1.2], [2, 1.5]]) };
check("combinatie 1,35G", combineResults(c1, perCase).maxDisplacement, 1.35 * wMid);
check("combinatie 1,2G + 1,5Q", combineResults(c2, perCase).maxDisplacement, (1.2 + 1.5 * 2) * wMid);
const env = computeEnvelope([c1, c2], perCase);
check("omhullende = grootste combinatie", env.maxDisplacement, 4.2 * wMid);
check("omhullende wijst combinatie 2 aan", env.maxDisplacementCombinationId ?? -1, 2, 0);

// ─────────────────────────────────────────────────────────────────────────
// [3] Knoop in het midden: het getal verandert niet (knoop = veldmaximum)
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Dezelfde ligger met een knoop in het midden");
{
  const r = solveAllCases({
    ...ligger,
    nodes: [...ligger.nodes, { id: 3, x: L / 2, z: 0 }],
    beams: [{ id: 1, from: 1, to: 3, E, A, I }, { id: 2, from: 3, to: 2, E, A, I }],
    loads: [{ beamId: 1, q, caseId: 1 }, { beamId: 2, q, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  }).perCase.get(1);
  check("knoop 3: |uz| = 5qL⁴/384EI", Math.abs(r.displacements.get(3).uz), wMid);
  check("maxDisplacement = knoopwaarde", r.maxDisplacement, wMid);
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Kolom ingeklemd-vrij met een schuine toplast: de lengte van de
//     verplaatsingsvector, zoals de vervormingsweergave hem meet
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Kolom 4 m ingeklemd-vrij, H = 5 kN en V = −500 kN aan de top");
{
  const H = 4000, Fx = 5000, Fz = -500000;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: H }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: Fx, fz: Fz, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  }).perCase.get(1);
  const ux = Fx * H ** 3 / (3 * E * I);
  const uz = Math.abs(Fz) * H / (E * A);
  check("top ux = FL³/3EI", r.displacements.get(2).ux, ux);
  check("top |uz| = VL/EA", Math.abs(r.displacements.get(2).uz), uz);
  check("maxDisplacement = √(ux² + uz²)", r.maxDisplacement, Math.hypot(ux, uz));
}

// ─────────────────────────────────────────────────────────────────────────
// [5] Uitkraging met q: het maximum zit aan de vrije top (knoop), de
//     veldkromme mag het niet overschrijden
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Uitkraging 3 m met q: qL⁴/8EI aan het vrije einde");
{
  const Lk = 3000;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: Lk, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [{ beamId: 1, q, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  }).perCase.get(1);
  check("maxDisplacement = qL⁴/8EI", r.maxDisplacement, Math.abs(q) * Lk ** 4 / (8 * E * I));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
