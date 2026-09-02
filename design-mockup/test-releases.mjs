// Translatie-releases (uX = normaalkrachthuls, uZ = dwarskrachthuls, in
// LOKALE staafassen) — de vinkjes in de staafdialoog werden voorheen stil
// genegeerd. Analytisch exacte referenties:
//
// [1] Normaalkrachthuls: 2 staven in serie tussen vaste steunen, Fx op de
//     middenknoop; staaf B axiaal los aan de middenzijde -> staaf A draagt
//     alles (N_A = +F trek, N_B = 0, reactie alleen bij knoop 1).
// [2] Dwarskrachthuls: zelfde systeem, Fz op de middenknoop; staaf B dwars
//     los aan de middenzijde -> geen V-overdracht: knoop 1 draagt de hele
//     verticale last, knoop 3 exact 0.
// [3] Dwarskrachthuls met UDL op beide staven -> per staaf gaat de eigen
//     last volledig naar de eigen verre steun (V = 0 op de huls): R1z = qL,
//     R3z = qL, en de huls toont V_B(begin) = 0.
// [4] Zelfde translatie aan BEIDE einden los = mechanisme -> eerlijke
//     singulier-fout, geen stil resultaat.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7, L = 3000;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(3)} ≈ ${expected.toFixed(3)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`); }
}

const nodes3 = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 },
];
const beam = (id, from, to, releases) => ({ id, from, to, E: E0, A: A0, I: I0, releases });

log("\n[1] Normaalkrachthuls: Fx=+10 kN op middenknoop, staaf B axiaal los bij het begin");
{
  const F = 10000;
  const r = solveAllCases({
    nodes: nodes3,
    beams: [beam(1, 1, 2), beam(2, 2, 3, { startTx: true })],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: F, caseId: 1 }],
  }).perCase.get(1);
  check("N staaf A = +F (trek, kN)", r.elements.get(1).N / 1e3, F / 1e3);
  check("N staaf B = 0 (kN)", r.elements.get(2).N / 1e3, 0, 0.01);
  check("reactie knoop 1 fx = -F (kN)", r.reactions.get(1).fx / 1e3, -F / 1e3);
  check("reactie knoop 3 fx = 0 (kN)", r.reactions.get(3).fx / 1e3, 0, 0.01);
  check("stations N_B[10] = 0 (kN)", r.elements.get(2).normalForce[10] / 1e3, 0, 0.01);
}

log("\n[2] Dwarskrachthuls: Fz=-10 kN op middenknoop, staaf B dwars los bij het begin");
{
  const F = -10000;
  const r = solveAllCases({
    nodes: nodes3,
    beams: [beam(1, 1, 2), beam(2, 2, 3, { startTz: true })],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: F, caseId: 1 }],
  }).perCase.get(1);
  check("knoop 1 draagt alles: fz = |F| (kN)", r.reactions.get(1).fz / 1e3, Math.abs(F) / 1e3);
  check("knoop 3 fz = 0 (kN)", r.reactions.get(3).fz / 1e3, 0, 0.01);
  check("stations V_B[10] = 0 (kN)", r.elements.get(2).shearForce[10] / 1e3, 0, 0.01);
  check("evenwicht ΣFz (kN)", (r.reactions.get(1).fz + r.reactions.get(3).fz + F) / 1e3, 0, 0.001);
}

log("\n[3] Dwarskrachthuls + q=-10 op beide staven: eigen last naar eigen steun");
{
  const q = -10;
  const r = solveAllCases({
    nodes: nodes3,
    beams: [beam(1, 1, 2), beam(2, 2, 3, { startTz: true })],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [
      { beamId: 1, q, caseId: 1 },
      { beamId: 2, q, caseId: 1 },
    ],
  }).perCase.get(1);
  check("R1z = |q|·L (kN)", r.reactions.get(1).fz / 1e3, Math.abs(q) * L / 1e3);
  check("R3z = |q|·L (kN)", r.reactions.get(3).fz / 1e3, Math.abs(q) * L / 1e3);
  check("V_B op de huls = 0 (kN)", r.elements.get(2).shearForce[0] / 1e3, 0, 0.01);
  // V_B aan de steunzijde draagt de volle staaflast.
  check("V_B bij knoop 3 = ±|q|·L (kN)", Math.abs(r.elements.get(2).shearForce[20]) / 1e3, Math.abs(q) * L / 1e3);
}

log("\n[4a] Beide einden axiaal los, knopen extern gedragen → geldig, N = 0");
{
  // Géén mechanisme: beide knopen zijn zelf ingeklemd, het element is
  // simpelweg axiaal ontkoppeld en draagt N = 0.
  const r = solveAllCases({
    nodes: nodes3,
    beams: [beam(1, 1, 2), beam(2, 2, 3, { startTx: true, endTx: true })],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 10000, caseId: 1 }],
  }).perCase.get(1);
  check("N staaf B = 0 (volledig ontkoppeld, kN)", r.elements.get(2).N / 1e3, 0, 0.01);
  check("reactie knoop 1 fx = -F (kN)", r.reactions.get(1).fx / 1e3, -10, 0.01);
}

log("\n[4b] Knoop alléén axiaal gedragen via een dubbelzijdige huls → eerlijke singulier-fout");
{
  try {
    // Knoop 3 op Z-rol: zijn x-DOF hangt volledig aan staaf B, die axiaal
    // aan beide kanten los is → mechanisme → eerlijke fout, geen stil getal.
    solveAllCases({
      nodes: nodes3,
      beams: [beam(1, 1, 2), beam(2, 2, 3, { startTx: true, endTx: true })],
      supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "zRoller" }],
      cases: [{ id: 1, name: "G" }],
      loads: [],
      pointLoads: [{ nodeId: 2, fx: 10000, caseId: 1 }],
    });
    failed++; log("  ✗ verwachtte een singulier-fout, maar de solve slaagde");
  } catch (e) {
    passed++; log(`  ✓ gooit zoals verwacht: ${String(e.message).slice(0, 60)}…`);
  }
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
