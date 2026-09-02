// Pendelstaaf (scharnier aan BEIDE einden): condensatie-exactheid.
//
// Bug die deze test borgt: applyEndReleases behandelde K_cc als diagonaal
// bij meerdere released DOF's. De rotaties van een dubbel scharnier zijn
// echter gekoppeld (K(θ1,θ2) = 2EI/L), waardoor een pendelstaaf NEGATIEVE
// dwarsstijfheid kreeg (-6EI/L³ i.p.v. exact 0) en elk model met
// pendelstaven vervuilde.
//
// [1] Matrixniveau: buigblok met [θ1,θ2] gecondenseerd → v-terme exact 0,
//     EA-blok onaangetast.
// [2] Systeemniveau: twee ingeklemde kolommen, toppen gekoppeld met een
//     pendelstaaf, Fx op kolom 1 → exact 50/50-verdeling (gelijke EI),
//     pendel draagt N = -F/2 (druk, trek-positief), geen moment in de
//     pendel.
const { applyEndReleases } = await import("./src/core/solver/Assembler.ts");
const { Matrix } = await import("./src/core/math/Matrix.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected.toFixed(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(6)} vs ${expected.toFixed(6)}`); }
}

log("\n[1] Condensatie [θ1,θ2] op het buigblok → exact 0 dwarsstijfheid");
{
  const f = 1; // EI/L³ genormaliseerd, L=1
  const K = new Matrix(6, 6);
  const set = (i, j, v) => { K.set(i, j, v); K.set(j, i, v); };
  set(0, 0, 1); set(0, 3, -1); set(3, 3, 1);
  set(1, 1, 12 * f); set(1, 2, 6 * f); set(1, 4, -12 * f); set(1, 5, 6 * f);
  set(2, 2, 4 * f); set(2, 4, -6 * f); set(2, 5, 2 * f);
  set(4, 4, 12 * f); set(4, 5, -6 * f);
  set(5, 5, 4 * f);
  applyEndReleases(K, [2, 5]);
  check("K(v1,v1) = 0", K.get(1, 1), 0);
  check("K(v1,v2) = 0", K.get(1, 4), 0);
  check("K(v2,v2) = 0", K.get(4, 4), 0);
  check("K(u1,u1) = 1 (EA-blok onaangetast)", K.get(0, 0), 1);
  // Krachtcondensatie: symmetrische q-eindkrachten op een dubbel scharnier
  // moeten volledig naar de v-DOF's gaan (elk qL/2), momenten weg.
  const K2 = new Matrix(6, 6);
  const set2 = (i, j, v) => { K2.set(i, j, v); K2.set(j, i, v); };
  set2(0, 0, 1); set2(0, 3, -1); set2(3, 3, 1);
  set2(1, 1, 12 * f); set2(1, 2, 6 * f); set2(1, 4, -12 * f); set2(1, 5, 6 * f);
  set2(2, 2, 4 * f); set2(2, 4, -6 * f); set2(2, 5, 2 * f);
  set2(4, 4, 12 * f); set2(4, 5, -6 * f);
  set2(5, 5, 4 * f);
  const F = [0, 0.5, 1 / 12, 0, 0.5, -1 / 12]; // vaste-inklemmingskrachten qL=1
  applyEndReleases(K2, [2, 5], F);
  check("F(v1) = 0.5 (qL/2)", F[1], 0.5);
  check("F(v2) = 0.5 (qL/2)", F[4], 0.5);
  check("F(θ1) = 0", F[2], 0);
  check("F(θ2) = 0", F[5], 0);
}

log("\n[2] Twee kolommen + pendelstaaf-koppeling, Fx=10 kN op top kolom 1");
{
  const E0 = 210000, A0 = 3877, I0 = 1.673e7, H = 3000, F = 10000;
  const r = solveAllCases({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: H },       // kolom 1
      { id: 3, x: 4000, z: 0 }, { id: 4, x: 4000, z: H }, // kolom 2
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 3, to: 4, E: E0, A: A0, I: I0 },
      { id: 3, from: 2, to: 4, E: E0, A: A0, I: I0, startConnection: "hinge", endConnection: "hinge" },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: F, caseId: 1 }],
  }).perCase.get(1);

  // De toppen verschillen exact de axiale verkorting van de pendel:
  // Δu = |N|·L_pendel/(EA) — scherper dan "ongeveer gelijk".
  const duVerwacht = (F / 2) * 4000 / (E0 * A0);
  check("topverschil = |N|·L/EA (mm)", r.displacements.get(2).ux - r.displacements.get(4).ux, duVerwacht, 1);
  check("voet 1 draagt F/2 (kN)", Math.abs(r.reactions.get(1).fx) / 1e3, F / 2 / 1e3, 1);
  check("voet 2 draagt F/2 (kN)", Math.abs(r.reactions.get(3).fx) / 1e3, F / 2 / 1e3, 1);
  check("pendel: N = -F/2 (druk, kN)", r.elements.get(3).N / 1e3, -F / 2 / 1e3, 1);
  const p = r.elements.get(3);
  check("pendel: M_start = 0 (kNm)", p.M_start / 1e6, 0, 0.01);
  check("pendel: M_end = 0 (kNm)", p.M_end / 1e6, 0, 0.01);
  check("pendel: geen dwarskracht (kN)", p.V / 1e3, 0, 0.01);
  check("evenwicht ΣFx (kN)", (r.reactions.get(1).fx + r.reactions.get(3).fx + F) / 1e3, 0, 0.001);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
