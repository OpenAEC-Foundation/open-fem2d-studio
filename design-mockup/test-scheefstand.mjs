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

// ── Uitbreiding: de motor moet met ELKE φ overweg kunnen ────────────────────
// De keuze tussen de vaste noemer en de normformule van EN 1993-1-1 (5.5),
// EN 1992-1-1 (5.1) of EN 1995-1-1 (5.1) valt buiten de motor: die krijgt φ
// als getal binnen en zet H = φ·V. Zie `lib/scheefstandNorm.ts` en
// `test-scheefstand-norm.mjs` voor de formules zelf. Wat híér telt, is dat de
// motor een normwaarde net zo behandelt als 1/200 — hij is lineair in φ en
// raakt precies de verticale lastcomponenten, niet meer en niet minder.

/**
 * φ volgens EN 1993-1-1 (5.5) voor een portaal van 9 m met twee kolommen:
 * φ = φ₀·α_h·α_m = 1/200 · 2/3 · √0,75 = 1/346,41. Bewust als LETTERLIJKE
 * uitdrukking, niet uit de normmodule geïmporteerd: deze test draait óók tegen
 * de sidecarbundel, en die kent alleen de motor.
 */
const PHI_5_5 = (1 / 200) * (2 / 3) * Math.sqrt(0.75);

log("\n[7] Portaal, φ uit EN 1993-1-1 (5.5) = 1/346: Σ fx-reacties = −φ·ΣV");
{
  const P = 100000;   // N op elke kolomtop
  const r = solveAllCases({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 9000 },
      { id: 3, x: 6000, z: 9000 }, { id: 4, x: 6000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0 },
      { id: 3, from: 4, to: 3, E: E0, A: A0, I: I0 },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 4, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [
      { nodeId: 2, fz: -P, caseId: 1 },
      { nodeId: 3, fz: -P, caseId: 1 },
    ],
    scheefstand: { phi: PHI_5_5, richting: 1 },
  }).perCase.get(1);
  check("Σ fx = −φ·2P (N)",
    r.reactions.get(1).fx + r.reactions.get(4).fx, -PHI_5_5 * 2 * P);
  check("verticaal ongewijzigd: ΣFz = 200 kN",
    (r.reactions.get(1).fz + r.reactions.get(4).fz) / 1e3, 200);
}

log("\n[8] Lineair in φ: de normfactoren α_h·α_m schalen H mee, niets anders");
{
  const kolom = (phi) => solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 9000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -100000, caseId: 1 }],
    scheefstand: { phi, richting: 1 },
  }).perCase.get(1);
  const basis = kolom(PHI);
  const norm = kolom(PHI_5_5);
  // α_h·α_m = 2/3·√0,75; de horizontale reactie hoort met exact die factor mee
  // te schalen, want de motor is lineair in φ.
  check("fx schaalt met α_h·α_m",
    norm.reactions.get(1).fx / basis.reactions.get(1).fx, (2 / 3) * Math.sqrt(0.75));
  check("het inklemmoment schaalt mee",
    norm.reactions.get(1).my / basis.reactions.get(1).my, (2 / 3) * Math.sqrt(0.75));
  check("de verticale reactie schaalt NIET mee",
    norm.reactions.get(1).fz, basis.reactions.get(1).fz);
}

log("\n[9] Alleen VERTICALE componenten krijgen een metgezel");
{
  // Een horizontale puntlast en een koppel horen niets toe te voegen: de
  // scheefstand kantelt de verticale lastafdracht, hij vermenigvuldigt niet
  // alles wat er op de knoop staat.
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 5000, my: 2e6, caseId: 1 }],
    scheefstand: { phi: PHI_5_5, richting: 1 },
  }).perCase.get(1);
  check("fx = −5000 N, geen opslag door φ", r.reactions.get(1).fx, -5000);
}

log("\n[10] Een OPWAARTSE last (windzuiging) keert de metgezel om");
{
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "W" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: 40000, caseId: 1 }],   // omhoog
    scheefstand: { phi: PHI_5_5, richting: 1 },
  }).perCase.get(1);
  check("fx = +φ·40 kN (tegengesteld aan een drukkende last)",
    r.reactions.get(1).fx, PHI_5_5 * 40000);
}

log("\n[11] Een puntlast midden op een staaf krijgt óók zijn metgezel");
{
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    beamPointLoads: [{ beamId: 1, posFrac: 0.5, fz: -80000, caseId: 1 }],
    scheefstand: { phi: PHI_5_5, richting: 1 },
  }).perCase.get(1);
  check("fx = −φ·80 kN", r.reactions.get(1).fx, -PHI_5_5 * 80000);
  check("verticaal ongewijzigd: ΣFz = 80 kN",
    (r.reactions.get(1).fz + r.reactions.get(2).fz) / 1e3, 80);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
