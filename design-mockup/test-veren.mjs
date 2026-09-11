// Veerondersteuningen: reactiekrachten en k<=0-gedrag (één support per knoop,
// zoals de UI ze aanmaakt).
//
// De core vult de reactievector alleen op starre DOF's; veer-DOF's bleven 0
// waardoor het evenwicht in de reactietabel zoek was. convertResult vult nu
// R = -k*u aan. Analytische referenties:
//   [1] ligger 6 m, scharnier + Z-veer, q=-10 N/mm -> symmetrie: elk 30 kN,
//       veerzakking u = R/k.
//   [2] kolom 3 m, voet ingeklemd, top X-veer met k = 3EI/L^3 (= laterale
//       topstijfheid van de kolom) -> veer en inklemming delen Fx exact 50/50.
//   [3] ligger 4 m, links ingeklemd, rechts rotatieveer (translatie vrij);
//       k zeer stijf -> geleid uiteinde: |M_veer| -> qL^2/6, en per definitie
//       M_veer = -k*phi.
//   [4] Z-veer met k=0 -> contract types.ts: behandel als STAR (geen
//       singulariteit), reactie via het gewone core-pad.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(3)} ≈ ${expected.toFixed(3)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`); }
}

log("\n[1] Ligger 6 m, scharnier + Z-veer (k=5000 N/mm), q=-10 N/mm");
{
  const k = 5000, L = 6000, q = -10;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zSpring", k }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q, caseId: 1 }],
  }).perCase.get(1);
  const R1 = r.reactions.get(1).fz, R2 = r.reactions.get(2).fz;
  check("R1 = qL/2 (kN)", R1 / 1e3, Math.abs(q) * L / 2 / 1e3);
  check("R2 (veer) = qL/2 (kN)", R2 / 1e3, Math.abs(q) * L / 2 / 1e3);
  check("veerzakking u = -R/k (mm)", r.displacements.get(2).uz, -R2 / k);
  check("evenwicht ΣFz = |q|·L (kN)", (R1 + R2) / 1e3, Math.abs(q) * L / 1e3);
}

log("\n[2] Kolom 3 m ingeklemd, top X-veer met k = 3EI/L³ → 50/50-verdeling van Fx");
{
  const L = 3000, F = 10000;
  const kCol = 3 * E0 * I0 / (L * L * L); // laterale topstijfheid (rotatie top vrij)
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "xSpring", k: kCol }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: F, caseId: 1 }],
  }).perCase.get(1);
  const RxVeer = r.reactions.get(2).fx;
  const RxVoet = r.reactions.get(1).fx;
  check("veer draagt F/2 (kN)", Math.abs(RxVeer) / 1e3, F / 2 / 1e3, 1);
  check("voet draagt F/2 (kN)", Math.abs(RxVoet) / 1e3, F / 2 / 1e3, 1);
  check("evenwicht ΣFx = 0 (kN)", (RxVeer + RxVoet + F) / 1e3, 0, 0.001);
  check("veerwet R = -k·u", RxVeer, -kCol * r.displacements.get(2).ux, 0.001);
}

log("\n[3] Ligger 4 m ingeklemd + zeer stijve rotatieveer rechts → geleid uiteinde qL²/6");
{
  const k = 1e12, L = 4000, q = -10; // N·mm/rad; |q| N/mm
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "rotSpring", k }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q, caseId: 1 }],
  }).perCase.get(1);
  const phi2 = r.displacements.get(2).ry;
  const M2 = r.reactions.get(2).my;
  check("veerwet M = -k·φ (kNm)", M2 / 1e6, -k * phi2 / 1e6, 0.001);
  check("|M_veer| → qL²/6 (kNm)", Math.abs(M2) / 1e6, Math.abs(q) * L * L / 6 / 1e6, 1);
  check("R1z = |q|·L (kN)", r.reactions.get(1).fz / 1e3, Math.abs(q) * L / 1e3);
}

log("\n[4] Z-veer met k=0 → star gedrag (geen singulariteit, reactie via core)");
{
  const L = 6000, q = -10;
  try {
    const r = solveAllCases({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zSpring", k: 0 }],
      cases: [{ id: 1, name: "G" }],
      loads: [{ beamId: 1, q, caseId: 1 }],
    }).perCase.get(1);
    check("star: zakking knoop 2 = 0 (mm)", r.displacements.get(2).uz, 0, 0.001);
    check("star: R2 = qL/2 (kN)", r.reactions.get(2).fz / 1e3, Math.abs(q) * L / 2 / 1e3);
  } catch (e) {
    failed++; log(`  ✗ exceptie (singulier?): ${e.message}`);
  }
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
