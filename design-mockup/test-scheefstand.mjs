// Scheefstand / initiele imperfectie: elke verticale last krijgt een
// equivalente horizontale metgezel H = phi*V (EN 1993-1-1 par. 5.3.2-aanpak).
// Analytisch exact via horizontaal evenwicht: som fx-reacties = -H_totaal.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7;
const PHI = 1 / 200;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(3)} ≈ ${expected.toFixed(3)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`); }
}

log("\n[1] Kolom 3 m ingeklemd, top Fz=-100 kN, φ=1/200 → H = 0.5 kN op de top");
{
  const P = 100000, h = 3000;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: h }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -P, caseId: 1 }],
    scheefstand: { phi: PHI, richting: 1 },
  }).perCase.get(1);
  const H = PHI * P;
  check("reactie fx = -H (N)", r.reactions.get(1).fx, -H);
  check("inklemmoment |my| = H·h (kNm)", Math.abs(r.reactions.get(1).my) / 1e6, H * h / 1e6);
  check("verticaal ongewijzigd: fz = P (kN)", r.reactions.get(1).fz / 1e3, P / 1e3);
  check("kolom N = -P (druk, kN)", r.elements.get(1).N / 1e3, -P / 1e3);
}

const liggerInput = (scheefstand, loads) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  cases: [{ id: 1, name: "G" }],
  loads,
  scheefstand,
});

log("\n[2] Ligger 6 m, q=-10 N/mm, φ=1/200 → H_totaal = 0.3 kN als qx-last");
{
  const r = solveAllCases(liggerInput({ phi: PHI, richting: 1 }, [{ beamId: 1, q: -10, caseId: 1 }])).perCase.get(1);
  const Htot = PHI * 10 * 6000; // 300 N
  check("scharnier draagt alle H: fx = -H_tot (N)", r.reactions.get(1).fx, -Htot);
  check("verticaal ongewijzigd: ΣFz = 60 kN", (r.reactions.get(1).fz + r.reactions.get(2).fz) / 1e3, 60);
}

log("\n[3] Lineariteit: combinatiefactor 1.35 schaalt de companion mee");
{
  const res = solveAllCases(liggerInput({ phi: PHI, richting: 1 }, [{ beamId: 1, q: -10, caseId: 1 }]));
  const combo = { id: 1, name: "ULS", type: "uls", formula: "1.35G", factors: new Map([[1, 1.35]]) };
  const c = combineResults(combo, res.perCase);
  check("combi fx = 1.35·(-300) (N)", c.reactions.get(1).fx, 1.35 * -300);
}

log("\n[4] Richting -1 flipt de companion");
{
  const r = solveAllCases(liggerInput({ phi: PHI, richting: -1 }, [{ beamId: 1, q: -10, caseId: 1 }])).perCase.get(1);
  check("fx = +H_tot (N)", r.reactions.get(1).fx, 300);
}

log("\n[5] Deellast: alleen het belaste deel telt (frac 0.25–0.75 → V = 30 kN)");
{
  const r = solveAllCases(liggerInput(
    { phi: PHI, richting: 1 },
    [{ beamId: 1, q: -10, startFrac: 0.25, endFrac: 0.75, caseId: 1 }],
  )).perCase.get(1);
  check("fx = -φ·30 kN = -150 N", r.reactions.get(1).fx, -PHI * 10 * 3000);
}

log("\n[6] Zonder scheefstand: geen horizontale reactie");
{
  const r = solveAllCases(liggerInput(undefined, [{ beamId: 1, q: -10, caseId: 1 }])).perCase.get(1);
  check("fx = 0 (N)", r.reactions.get(1).fx, 0, 0.001);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
