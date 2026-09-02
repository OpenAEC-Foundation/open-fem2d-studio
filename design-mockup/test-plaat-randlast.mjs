// P3.3 — Randlast op een plaatrand via de engine (buildMesh → PlateLoads →
// convertEdgeNodeIdsToNodalForces, cumulatieve booglengte + tributary lengths):
// trekwand B = 2 m × H = 3 m, t = 20 mm, E = 210000 N/mm², ν = 0,3,
// meshSize 500 mm (quad-grid 4×6). Onderrand: 5 UI-knopen op gridposities,
// alle zRoller behalve de middelste (pinned) — vrije dwarscontractie, dus de
// analytische éénassige oplossing geldt exact op discretisatie na.
//
// (a) TREK OMHOOG: p = +100 kN/m op de bovenrand (richting z, positief =
//     omhoog) → σy = p/t = 100e3 / 0,02 = 5,0 N/mm².
//     - ΣRz = −p·B = −200.000 N binnen 1e-9 relatief (de knooplastverdeling
//       is exact en het lineaire stelsel is in evenwicht op machineprecisie);
//     - u_top = σ·H/E = 5,0 · 3000 / 210000 = 0,071429 mm binnen 1%;
//     - σy per element ≈ 5,0 N/mm² (ranges binnen 2%).
// (b) PER GEVAL GESCHEIDEN: de randlast zit ALLEEN in geval 2. Geval 1
//     (puntlast F = 10 kN omlaag op een bovenhoek) geeft ΣRz = +10.000 N
//     binnen 1e-9 relatief — géén randlastbijdrage; en andersom bevat
//     geval 2 exact de randlast zonder de puntlast.
// (c) HORIZONTAAL: p = +50 kN/m met richting x op de bovenrand →
//     ΣRx = −p·B = −100.000 N binnen 1e-9 relatief (dir-mapping px/py).
//
// Uitvoeren: npx tsx test-plaat-randlast.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toExponential(6)} vs ${expected.toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Model: wand 2×3 m, meshSize 500 mm; onderrand 5 UI-knopen op gridposities
// (zRoller, middelste pinned), bovenhoeken als plaat-hoekknopen (id 6/7).
// ─────────────────────────────────────────────────────────────────────────
const B = 2000, H = 3000, S = 500;    // mm
const T = 20;                         // mm
const E = 210000;                     // N/mm²
const P_TREK = 100;                   // kN/m omhoog op de bovenrand (geval 2)
const P_HOR  = 50;                    // kN/m horizontaal (geval 3)
const SIGMA = (P_TREK * 1000) / (T / 1000) / 1e6;  // = p/t → 5,0 N/mm²
const U_TOP = SIGMA * H / E;                        // = 0,0714286 mm

function maakInput(extra = {}) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 }); // onderrand
  nodes.push({ id: 6, x: 0, z: H });    // TL
  nodes.push({ id: 7, x: B, z: H });    // TR
  const supports = nodes.slice(0, 5).map((n) =>
    n.id === 3 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" });
  return {
    nodes,
    beams: [],
    supports,
    loads: [],
    // Geval 1: puntlast 10 kN omlaag op de linkerbovenhoek — bewijst de
    // scheiding per belastinggeval (de randlast zit in geval 2).
    pointLoads: [{ nodeId: 6, fz: -10000, caseId: 1 }],
    // Geval 2: trek omhoog op de bovenrand; geval 3: horizontaal.
    edgeLoads: [
      { plateId: 1, edge: "top", p: P_TREK, dir: "z", caseId: 2 },
      { plateId: 1, edge: "top", p: P_HOR,  dir: "x", caseId: 3 },
    ],
    plates: [{
      id: 1, nodeIds: [1, 5, 7, 6],
      thickness: T, E, nu: 0.3, rho: 7850, meshSize: S,
    }],
    cases: [
      { id: 1, name: "Permanent (G)" },
      { id: 2, name: "Variabel (Q)" },
      { id: 3, name: "Wind (W)" },
    ],
    ...extra,
  };
}

const somR = (r, comp) => {
  let s = 0;
  for (const [, re] of r.reactions) s += re[comp];
  return s;
};

// ─────────────────────────────────────────────────────────────────────────
// (a) Trekwand: ΣF = p·B exact, u_top = σH/E, σy ≈ p/t
// ─────────────────────────────────────────────────────────────────────────
log("\n[trekwand] p = +100 kN/m op de bovenrand → σy = 5,0 N/mm²");
{
  const { perCase } = solveAllCases(maakInput());
  const r2 = perCase.get(2);
  checkTrue("geval 2 opgelost (randlast = last)", !!r2);
  // ΣRz = −p·B: reacties houden de omhoog gerichte trek tegen. De
  // knooplastverdeling (trapezium, ½-gewicht op de hoekknopen) sommeert
  // exact tot p·L en het lineaire stelsel is op machineprecisie in
  // evenwicht → 1e-9 relatief.
  checkRel("ΣRz = −p·B (1e-9 rel.)", somR(r2, "fz"), -(P_TREK * 1000) * (B / 1000), 1e-9);
  checkRel("ΣRx = 0", somR(r2, "fx"), 0, 1e-9, P_TREK * 1000 * (B / 1000));
  // u_top = σH/E op beide bovenhoeken (uz omhoog positief).
  checkRel("u_top links = σH/E (1%)",  r2.displacements.get(6)?.uz ?? 0, U_TOP, 0.01);
  checkRel("u_top rechts = σH/E (1%)", r2.displacements.get(7)?.uz ?? 0, U_TOP, 0.01);
  // σy per element vrijwel uniform 5,0 N/mm² (elementgemiddelde, 2%).
  checkTrue("plateElements aanwezig", Array.isArray(r2.plateElements) && r2.plateElements.length === 1);
  const rng = r2.plateElements[0].ranges.sigmaY;
  checkRel("σy min ≈ p/t (2%)", rng.min, SIGMA, 0.02);
  checkRel("σy max ≈ p/t (2%)", rng.max, SIGMA, 0.02);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) Per belastinggeval gescheiden
// ─────────────────────────────────────────────────────────────────────────
log("\n[scheiding] randlast alleen in geval 2; geval 1 = alleen puntlast");
{
  const { perCase } = solveAllCases(maakInput());
  const r1 = perCase.get(1);
  checkTrue("geval 1 opgelost", !!r1);
  // Alleen de puntlast van 10 kN — een randlast-lek zou hier ±200 kN bijmengen.
  checkRel("ΣRz(geval 1) = 10 kN (géén randlast)", somR(r1, "fz"), 10000, 1e-9,
    P_TREK * 1000 * (B / 1000));
}

// ─────────────────────────────────────────────────────────────────────────
// (c) Horizontale randlast (dir "x") — px/py-mapping
// ─────────────────────────────────────────────────────────────────────────
log("\n[horizontaal] p = +50 kN/m richting x op de bovenrand → ΣRx = −p·B");
{
  const { perCase } = solveAllCases(maakInput());
  const r3 = perCase.get(3);
  checkTrue("geval 3 opgelost", !!r3);
  checkRel("ΣRx = −p·B (1e-9 rel.)", somR(r3, "fx"), -(P_HOR * 1000) * (B / 1000), 1e-9);
  checkRel("ΣRz = 0", somR(r3, "fz"), 0, 1e-9, P_HOR * 1000 * (B / 1000));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
