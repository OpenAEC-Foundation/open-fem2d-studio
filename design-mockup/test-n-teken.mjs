// Tekenconventie normaalkracht: TREK POSITIEF (constructeursconventie, en
// wat solver/types.ts altijd al beloofde: "tension +ve"). De core levert
// intern druk-positief; convertResult flipt op de adapter-grens. Deze test
// borgt: druk = negatief, trek = positief, richting-ONAFHANKELIJK (staaf
// from=onder of from=boven maakt niet uit), en eindwaarde N == stations.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${(actual / 1e3).toFixed(3)} ≈ ${(expected / 1e3).toFixed(3)} kN`); }
  else    { failed++; log(`  ✗ ${name}: ${(actual / 1e3).toFixed(3)} vs ${(expected / 1e3).toFixed(3)} kN`); }
}

const kolomBasis = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
  supports: [{ nodeId: 1, type: "fixed" }],
  cases: [{ id: 1, name: "G" }],
  loads: [],
  pointLoads: [{ nodeId: 2, fz: -10000, caseId: 1 }],
};

log("\n[1] Kolom onder druk (Fz=-10 kN bovenop) → N = -10 kN, beide richtingen");
{
  const rA = solveAllCases({ ...kolomBasis, beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }] });
  const efA = rA.perCase.get(1).elements.get(1);
  check("from=onder: N", efA.N, -10000);
  check("from=onder: stations N[10]", efA.normalForce[10], -10000);

  const rB = solveAllCases({ ...kolomBasis, beams: [{ id: 1, from: 2, to: 1, E: E0, A: A0, I: I0 }] });
  const efB = rB.perCase.get(1).elements.get(1);
  check("from=boven: N", efB.N, -10000);
  check("from=boven: stations N[10]", efB.normalForce[10], -10000);
}

log("\n[2] Horizontale staaf onder trek (Fx=+10 kN) → N = +10 kN");
{
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 10000, caseId: 1 }],
  });
  const ef = r.perCase.get(1).elements.get(1);
  check("trekstaaf: N", ef.N, 10000);
  check("trekstaaf: stations N[10]", ef.normalForce[10], 10000);
}

log("\n[3] Portaal 12x5 m, scharniervoeten, q=-5 op ligger — alles druk (negatief)");
{
  const L = 12000, q = -5;
  const r = solveAllCases({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 },
      { id: 3, x: 0, z: 5000 }, { id: 4, x: L, z: 5000 },
    ],
    beams: [
      { id: 1, from: 1, to: 3, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 4, E: E0, A: A0, I: I0 },
      { id: 3, from: 3, to: 4, E: E0, A: A0, I: I0 },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 3, q, caseId: 1 }],
  });
  const res = r.perCase.get(1);
  // Kolommen dragen elk qL/2 druk.
  check("linkerkolom: N = -qL/2", res.elements.get(1).N, q * L / 2);
  check("rechterkolom: N = -qL/2", res.elements.get(2).N, q * L / 2);
  // Ligger draagt de spatkracht H als druk: N_ligger = -|Fx-reactie|.
  const H = Math.abs(res.reactions.get(1).fx);
  check("ligger: N = -H (spatkracht als druk)", res.elements.get(3).N, -H);
  if (H < 100) { failed++; log("  ✗ spatkracht H onverwacht ~0 — testopzet stuk"); }
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
