// Verende staafaansluitingen (N, V, M met een veerstijfheid tussen het
// staafeinde en de knoop) — de derde keuze naast star en scharnier.
// Analytisch exacte referenties:
//
// [1] Console met een momentveer k aan de inklemming, puntlast P aan de tip:
//       θ_veer = M/k = P·L/k
//       w_tip  = P·L³/(3EI) + θ_veer·L
//       θ_tip  = P·L²/(2EI) + θ_veer
//     De inklemmingsreacties zijn onafhankelijk van k (statisch bepaald).
// [2] Tweezijdig ingeklemde ligger met UDL q, eind B verend (k) aan de starre
//     knoop; slope-deflection met θ_A = 0 en veerevenwicht aan B:
//       θ_B = (q·L²/12) / (4EI/L + k)
//       |M_B| = k·θ_B                       (k→∞: qL²/12, k→0: 0)
//       |M_A| = q·L²/12 + (2EI/L)·θ_B       (k→∞: qL²/12, k→0: qL²/8)
// [3] Staaf met een normaalkrachtveer k_N aan het begin, Fx = P aan het eind:
//       u = P·L/(EA) + P/k_N
// [4] Een veer op een DOF dat al los is doet niets: het blijft een scharnier.
// [5] Limieten: een zeer stijve veer is star, een zeer slappe veer is (bijna)
//     een scharnier — en zonder veren is het pad bit-identiek aan vroeger.
//
// Eenheden van de solverinvoer: mm, N; veren canoniek in N/mm en N·mm/rad.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7, L = 4000;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(4)} ≈ ${expected.toFixed(4)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); } else { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const beam = (id, from, to, extra = {}) => ({ id, from, to, E: E0, A: A0, I: I0, ...extra });
const solve = (invoer) => solveAllCases({ cases: [{ id: 1, name: "G" }], loads: [], ...invoer }).perCase.get(1);

log("\n[1] Console met momentveer aan de inklemming, P aan de tip");
{
  const P = 10000, k = 3.5e9; // N·mm/rad (3500 kNm/rad)
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam(1, 1, 2, { veren: { startRy: k } })],
    supports: [{ nodeId: 1, type: "fixed" }],
    pointLoads: [{ nodeId: 2, fz: -P, caseId: 1 }],
  });
  const thVeer = P * L / k;
  const wExp = P * L ** 3 / (3 * E0 * I0) + thVeer * L;
  const thExp = P * L ** 2 / (2 * E0 * I0) + thVeer;
  check("w_tip = PL³/3EI + (PL/k)·L (mm)", Math.abs(r.displacements.get(2).uz), wExp);
  check("θ_tip = PL²/2EI + PL/k (rad)", Math.abs(r.displacements.get(2).ry), thExp);
  check("reactie fz = P (kN)", r.reactions.get(1).fz / 1e3, P / 1e3);
  check("inklemmingsmoment |M| = P·L (kNm)", Math.abs(r.reactions.get(1).my) / 1e6, P * L / 1e6);
  check("M aan het verende begin = P·L: de veer draagt het moment over (kNm)", Math.abs(r.elements.get(1).M_start) / 1e6, P * L / 1e6);
  // Zonder veer: de gewone console — de veer voegt precies θ_veer·L toe.
  const r0 = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam(1, 1, 2)],
    supports: [{ nodeId: 1, type: "fixed" }],
    pointLoads: [{ nodeId: 2, fz: -P, caseId: 1 }],
  });
  check("verschil met de starre console = θ_veer·L (mm)",
    Math.abs(r.displacements.get(2).uz) - Math.abs(r0.displacements.get(2).uz), thVeer * L);
}

log("\n[2] Tweezijdig ingeklemd met UDL, eind B verend — slope-deflection");
{
  const q = 10; // N/mm
  const EI = E0 * I0;
  const ref = (k) => {
    const thB = (q * L * L / 12) / (4 * EI / L + k);
    return { MB: k * thB, MA: q * L * L / 12 + (2 * EI / L) * thB };
  };
  for (const [naam, k] of [["k = 4EI/L", 4 * EI / L], ["k = EI/L", EI / L], ["k = 20·EI/L", 20 * EI / L]]) {
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [beam(1, 1, 2, { veren: { endRy: k } })],
      supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
      loads: [{ beamId: 1, q: -q, qDir: "z", qCoord: "local", caseId: 1 }],
    });
    const e = r.elements.get(1);
    const { MA, MB } = ref(k);
    check(`${naam}: |M_B| = k·θ_B (kNm)`, Math.abs(e.M_end) / 1e6, MB / 1e6);
    check(`${naam}: |M_A| = qL²/12 + (2EI/L)·θ_B (kNm)`, Math.abs(e.M_start) / 1e6, MA / 1e6);
    check(`${naam}: ΣR_z = q·L (kN)`, (r.reactions.get(1).fz + r.reactions.get(2).fz) / 1e3, q * L / 1e3);
    check(`${naam}: de inklemmingsmomenten zijn M_A en M_B (kNm)`,
      (Math.abs(r.reactions.get(1).my) + Math.abs(r.reactions.get(2).my)) / 1e6,
      (MA + MB) / 1e6);
  }
}

log("\n[3] Normaalkrachtveer aan het begin, Fx aan het eind");
{
  const P = 50000, kN = 200000; // N/mm (200 kN/mm)
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam(1, 1, 2, { veren: { startTx: kN } })],
    supports: [{ nodeId: 1, type: "fixed" }],
    pointLoads: [{ nodeId: 2, fx: P, caseId: 1 }],
  });
  check("u = PL/EA + P/k (mm)", r.displacements.get(2).ux, P * L / (E0 * A0) + P / kN);
  check("N = P (kN)", r.elements.get(1).N / 1e3, P / 1e3);
  check("reactie fx = −P (kN)", r.reactions.get(1).fx / 1e3, -P / 1e3);
}

log("\n[4] Een veer op een los DOF doet niets: scharnier wint");
{
  const q = 10;
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam(1, 1, 2, { releases: { endRy: true }, veren: { endRy: 1e12 } })],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: [{ beamId: 1, q: -q, qDir: "z", qCoord: "local", caseId: 1 }],
  });
  check("M_B = 0 ondanks de veer (kNm)", Math.abs(r.elements.get(1).M_end) / 1e6, 0, 0.01);
  check("M_A = qL²/8, de propped cantilever (kNm)", Math.abs(r.elements.get(1).M_start) / 1e6, q * L * L / 8 / 1e6);
}

log("\n[5] Limieten en bit-identiteit zonder veren");
{
  const q = 10;
  const maak = (extra) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam(1, 1, 2, extra)],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: [{ beamId: 1, q: -q, qDir: "z", qCoord: "local", caseId: 1 }],
  });
  const star = solve(maak({}));
  const stijf = solve(maak({ veren: { endRy: 1e15 } }));
  const slap = solve(maak({ veren: { endRy: 1e-3 } }));
  const los = solve(maak({ releases: { endRy: true } }));
  check("zeer stijve veer = star: |M_B| = qL²/12 (kNm)", Math.abs(stijf.elements.get(1).M_end) / 1e6, q * L * L / 12 / 1e6, 0.01);
  check("zeer slappe veer ≈ scharnier: |M_A| = qL²/8 (kNm)", Math.abs(slap.elements.get(1).M_start) / 1e6, Math.abs(los.elements.get(1).M_start) / 1e6, 0.01);
  checkTrue("zonder veren zijn de uitkomsten bit-identiek aan het starre pad",
    star.elements.get(1).M_end === solve(maak({ veren: {} })).elements.get(1).M_end
    && star.elements.get(1).M_end === solve(maak({ veren: { endRy: 0 } })).elements.get(1).M_end);
  // De UI-omzetting: kN/mm → N/mm, kNm/rad → N·mm/rad; niets zonder veren.
  const mi = bouwMultiInput({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, veren: { startTx: 200, endRy: 5000 } }, { id: 2, from: 1, to: 2 }],
    supports: [], loads: [], loadCases: [{ id: 1, name: "G", type: "dead" }], plates: [],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 300, scheefstandRichting: 1,
  });
  checkTrue("UI 200 kN/mm → 200000 N/mm en 5000 kNm/rad → 5e9 N·mm/rad",
    mi.beams[0].veren?.startTx === 200000 && mi.beams[0].veren?.endRy === 5e9, JSON.stringify(mi.beams[0].veren));
  checkTrue("zonder veren geen veren-sleutel in de solverinvoer", !("veren" in mi.beams[1]));
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
