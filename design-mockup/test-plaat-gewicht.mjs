// P2.3 — Plaat-eigengewicht via de engine (buildMesh → PlateLoads):
// wandschijf 3×3 m, t = 200 mm, ρ = 2500 kg/m³ (betonwaarden als invoer),
// alleen eigengewicht in het dead-geval (selfWeightCaseId = 1).
//
// (a) ΣRz = ρ·g·t·A = 2500 · 9,81 · 0,2 · 9,0 = 44.145 N binnen 0,1%
//     (de knooplastverdeling is exact — Quad4 W/4 per knoop — dus dit is
//     in de praktijk machineprecisie; 0,1% is de planeis).
// (b) PER GEVAL GESCHEIDEN: het eigengewicht zit ALLEEN in geval 1 (dead).
//     Geval 2 (live) met een puntlast F = 10 kN omlaag op een hoekknoop
//     geeft ΣRz = +10.000 N binnen 0,1% — géén gewichtsbijdrage.
// (c) SCHEEFSTAND-CONSISTENTIE: met φ = 1/200 (richting +x) krijgt het
//     verticale plaatgewicht een horizontale metgezel H = φ·W, net als
//     staaf- en knooplasten: ΣRx = −φ·W = −220,725 N binnen 0,1%.
//
// Uitvoeren: npx tsx test-plaat-gewicht.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { STANDARD_GRAVITY } = await import("./src/core/fem/PlateLoads.ts");

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
// Model: wand 3×3 m, meshSize 500 mm; onderrand 7 UI-knopen op gridposities
// (alle zRoller, middelste pinned), bovenhoeken als plaat-hoekknopen.
// ─────────────────────────────────────────────────────────────────────────
const B = 3000, H = 3000, S = 500;   // mm
const T = 200;                        // mm
const RHO = 2500;                     // kg/m³
const W_TOT = RHO * STANDARD_GRAVITY * (T / 1000) * (B / 1000) * (H / 1000); // 44.145 N

function maakInput(extra = {}) {
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 }); // onderrand
  nodes.push({ id: 8, x: 0, z: H });    // TL
  nodes.push({ id: 9, x: B, z: H });    // TR
  const supports = nodes.slice(0, 7).map((n) =>
    n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" });
  return {
    nodes,
    beams: [],
    supports,
    loads: [],
    // Geval 2: puntlast 10 kN omlaag op de linkerbovenhoek (UI-knoop 8,
    // door het grid hergebruikt) — test de scheiding per belastinggeval.
    pointLoads: [{ nodeId: 8, fz: -10000, caseId: 2 }],
    plates: [{
      id: 1, nodeIds: [1, 7, 9, 8],
      thickness: T, E: 30000 /* betonachtig */, nu: 0.2, rho: RHO, meshSize: S,
      selfWeightCaseId: 1,
    }],
    cases: [{ id: 1, name: "Permanent (G)" }, { id: 2, name: "Variabel (Q)" }],
    ...extra,
  };
}

const somR = (r, comp) => {
  let s = 0;
  for (const [, re] of r.reactions) s += re[comp];
  return s;
};

// ─────────────────────────────────────────────────────────────────────────
// (a) ΣRz = ρ·g·t·A in het dead-geval
// ─────────────────────────────────────────────────────────────────────────
log("\n[eigengewicht] 3×3 m, t=200 mm, ρ=2500 → ΣRz = ρ·g·t·A");
{
  const { perCase } = solveAllCases(maakInput());
  const r1 = perCase.get(1);
  checkTrue("dead-geval opgelost (gewicht = last)", !!r1);
  checkRel("ΣRz(geval 1) = ρ·g·t·A", somR(r1, "fz"), W_TOT, 0.001);
  // Zijdelings evenwicht zonder scheefstand: geen netto Rx.
  checkRel("ΣRx(geval 1) = 0", somR(r1, "fx"), 0, 1e-9, W_TOT);
  // Wand zakt onder eigen gewicht: bovenhoeken omlaag (uz < 0).
  checkTrue("bovenhoek zakt (uz < 0)", (r1.displacements.get(8)?.uz ?? 0) < 0,
    `uz = ${(r1.displacements.get(8)?.uz ?? 0).toExponential(3)} mm`);
  // Spanningsresultaten aanwezig (drukzone onderin).
  checkTrue("plateElements aanwezig", Array.isArray(r1.plateElements) && r1.plateElements.length === 1);
  checkTrue("σy onderin < 0 (druk)", r1.plateElements[0].ranges.sigmaY.min < 0);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) Per belastinggeval gescheiden
// ─────────────────────────────────────────────────────────────────────────
log("\n[scheiding] eigengewicht alleen in geval 1; geval 2 = alleen puntlast");
{
  const { perCase } = solveAllCases(maakInput());
  const r2 = perCase.get(2);
  checkTrue("geval 2 opgelost", !!r2);
  checkRel("ΣRz(geval 2) = 10 kN (géén gewicht)", somR(r2, "fz"), 10000, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) Scheefstand-companion op het plaatgewicht
// ─────────────────────────────────────────────────────────────────────────
log("\n[scheefstand] φ=1/200, richting +x → ΣRx = −φ·W");
{
  const { perCase } = solveAllCases(maakInput({
    scheefstand: { phi: 1 / 200, richting: 1 },
  }));
  const r1 = perCase.get(1);
  checkRel("ΣRz blijft ρ·g·t·A", somR(r1, "fz"), W_TOT, 0.001);
  checkRel("ΣRx = −φ·W", somR(r1, "fx"), -W_TOT / 200, 0.001);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
