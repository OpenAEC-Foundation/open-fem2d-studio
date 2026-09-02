// Thermische belasting (uniforme ΔT per staaf) — analytische validatie.
//
// Valideert de hele keten: SolverInput.thermalLoads → engine.ts (adapter) →
// core (equivalente knoopkrachten + mechanische krachtterugrekening
// N = EA·(ε − α·ΔT)) → SolverResult, inclusief combinatie-superpositie
// (1e-orde) en het gefactoreerde 2e-orde-pad per combinatie.
//
// Analytische referenties:
//   • Vrij uitzetbare staaf:  N = 0 exact, u_eind = α·ΔT·L
//   • Beide zijden axiaal vast: |N| = E·A·α·ΔT (druk), reacties ±E·A·α·ΔT
//   • Uniforme ΔT geeft GEEN kromming: M(x) = 0 en w(x) = 0 op alle stations
//   • Combinatie γ×ΔT ⇒ exact γ× de snedekrachten (thermiek is lineair)
//   • 2e-orde: thermische druk P = E·A·α·ΔT werkt als gewone normaalkracht
//     in K_G — vergrotingsfactor volgt de exacte secansoplossing, en boven
//     de kniklast moet de combinatie een nette fout geven.
//
// TEKENCONVENTIE: het engine-resultaat rapporteert N druk-positief
// (empirisch verankerd in test [0] met een druk-puntlast).
//
// Stijl: test-tweede-orde.mjs. Draaien met: npx tsx test-thermiek.mjs

const { solve, solveAllCases, solveAllCasesNonlinear } =
  await import("./src/components/fem/solver/engine.ts");
const { combineResults } =
  await import("./src/components/fem/solver/combinations.ts");

const E = 210000;        // N/mm²
const ALPHA = 1.2e-5;    // 1/K — default van de adapter (staal)

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected.toFixed(6)} (tol ${tolPct}%)`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected} (tol ${tolPct}%)`); }
}

function checkAbs(name, actual, maxAbs) {
  const ok = Number.isFinite(actual) && Math.abs(actual) <= maxAbs;
  if (ok) { passed++; log(`  ✓ ${name}: |${actual.toExponential(3)}| ≤ ${maxAbs}`); }
  else    { failed++; log(`  ✗ ${name}: |${actual}| > ${maxAbs}`); }
}

function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}${extra ? " — " + extra : ""}`); }
  else      { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// [0] Tekenconventie-anker: druk-puntlast op vrije staaf → N-teken voor druk
// ─────────────────────────────────────────────────────────────────────────
log("\n[0] Conventie-anker: staaf 4 m, druklast 1000 N → teken van N bij druk");
let DRUK_TEKEN = 0; // +1 of −1, empirisch
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A: 1000, I: 1e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: -1000, fz: 0 }], // duwt node2 naar node1 → druk
  });
  const N = r.elements.get(1).N;
  DRUK_TEKEN = Math.sign(N);
  check("|N| onder druk 1000 N", Math.abs(N), 1000, 0.1);
  checkTrue("druk-teken vastgelegd", DRUK_TEKEN !== 0, `druk → N ${DRUK_TEKEN > 0 ? "positief" : "negatief"}`);
}

// ─────────────────────────────────────────────────────────────────────────
// [1] Vrij uitzetbare staaf: ΔT=+30 K → N = 0, u_eind = α·ΔT·L
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrije uitzetting: L=4 m, A=1000 mm², ΔT=+30 K (scharnier + z-rol)");
{
  const A = 1000, L = 4000, dT = 30;
  const N_ref = E * A * ALPHA * dT;   // 75600 N — schaalgrootte voor tolerantie
  const uExp = ALPHA * dT * L;        // 1.44 mm
  try {
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E, A, I: 1e7 }],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: [],
      thermalLoads: [{ beamId: 1, deltaT: dT }],
    });
    const ef = r.elements.get(1);
    const maxN = Math.max(...ef.normalForce.map(Math.abs));
    checkAbs("N(x) ≡ 0 (alle 21 stations)", maxN, N_ref * 1e-3);
    check("u_x knoop 2 = α·ΔT·L", r.displacements.get(2).ux, uExp, 0.1);
    check("u(x) station 20 = α·ΔT·L", ef.axialDisp[20], uExp, 0.1);
    // Uniforme ΔT geeft geen kromming: M en w exact nul
    checkAbs("M(x) ≡ 0 (geen kromming)", Math.max(...ef.bendingMoment.map(Math.abs)), 1);
    checkAbs("w(x) ≡ 0 (geen kromming)", Math.max(...ef.deflection.map(Math.abs)), 1e-6);
    const R1 = r.reactions.get(1);
    checkAbs("reactie F_x knoop 1 ≈ 0", R1.fx, N_ref * 1e-3);
  } catch (e) {
    failed += 6;
    log(`  ✗ solve() faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [2] Beide zijden axiaal vastgehouden: |N| = E·A·α·ΔT (druk), binnen 0,1%
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Axiaal star: L=4 m, A=1000 mm², ΔT=+30 K (scharnier + scharnier)");
{
  const A = 1000, L = 4000, dT = 30;
  const N_exp = E * A * ALPHA * dT; // 75600 N druk
  try {
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E, A, I: 1e7 }],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
      loads: [],
      thermalLoads: [{ beamId: 1, deltaT: dT }],
    });
    const ef = r.elements.get(1);
    check("|N| = E·A·α·ΔT", Math.abs(ef.N), N_exp, 0.1);
    checkTrue("N heeft het druk-teken", Math.sign(ef.N) === DRUK_TEKEN,
      `N = ${ef.N.toFixed(1)} N`);
    check("N constant over de staaf", ef.normalForce[10], ef.N, 0.1);
    const R1 = r.reactions.get(1), R2 = r.reactions.get(2);
    check("|reactie F_x knoop 1| = E·A·α·ΔT", Math.abs(R1.fx), N_exp, 0.1);
    checkAbs("ΣF_x = 0", R1.fx + R2.fx, N_exp * 1e-3);
    checkTrue("wand duwt terug: R1_x wijst +x (staaf in druk)", R1.fx > 0,
      `R1_x = ${R1.fx.toFixed(1)} N`);
    checkAbs("verplaatsingen ≡ 0", Math.abs(r.displacements.get(2).ux), 1e-6);
  } catch (e) {
    failed += 7;
    log(`  ✗ solve() faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Portaal met ΔT op de ligger: evenwicht + symmetrie
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Portaal H=4 m × B=6 m, scharnierbases, ΔT=+30 K op de ligger");
{
  const A = 3877, I = 1.673e7, dT = 30;
  const N_free = E * A * ALPHA * dT; // bovengrens ligger-N (volledig verhinderd)
  try {
    const r = solve({
      nodes: [
        { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
        { id: 3, x: 0, z: 4000 }, { id: 4, x: 6000, z: 4000 },
      ],
      beams: [
        { id: 1, from: 1, to: 3, E, A, I },  // linker kolom
        { id: 2, from: 3, to: 4, E, A, I },  // ligger
        { id: 3, from: 2, to: 4, E, A, I },  // rechter kolom
      ],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
      loads: [],
      thermalLoads: [{ beamId: 2, deltaT: dT }],
    });
    const R1 = r.reactions.get(1), R2 = r.reactions.get(2);
    checkAbs("ΣF_x = 0", R1.fx + R2.fx, 1e-3);
    checkAbs("ΣF_z = 0", R1.fz + R2.fz, 1e-3);
    // Spiegelsymmetrie: verticale reacties elk afzonderlijk nul
    checkAbs("R1_z = 0 (symmetrie)", R1.fz, 1e-3);
    check("R1_x = −R2_x (symmetrie)", R1.fx, -R2.fx, 0.1);
    // Uitzetting deels verhinderd door de kolommen → ligger in druk, 0 < |N| < EAαΔT
    const Nligger = r.elements.get(2).N;
    checkTrue("ligger in druk", Math.sign(Nligger) === DRUK_TEKEN && Math.abs(Nligger) > 1,
      `N = ${Nligger.toFixed(1)} N`);
    checkTrue("|N_ligger| < E·A·α·ΔT (geen volledige verhindering)",
      Math.abs(Nligger) < N_free, `${Math.abs(Nligger).toFixed(0)} < ${N_free.toFixed(0)}`);
    // Kolomtoppen schuiven naar buiten
    checkTrue("kolomtoppen schuiven naar buiten",
      r.displacements.get(3).ux < 0 && r.displacements.get(4).ux > 0,
      `u3=${r.displacements.get(3).ux.toFixed(4)}, u4=${r.displacements.get(4).ux.toFixed(4)} mm`);
    // Kolommen krijgen buiging (moment ≠ 0 aan de top)
    const Mkol = Math.max(...r.elements.get(1).bendingMoment.map(Math.abs));
    checkTrue("kolommen krijgen moment", Mkol > 1e4, `|M|_max = ${(Mkol / 1e6).toFixed(3)} kNm`);
  } catch (e) {
    failed += 8;
    log(`  ✗ solve() faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Combinatiefactor: 1,5×ΔT-geval geeft exact 1,5× N (1e-orde superpositie)
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Combinatie 1,5 × thermisch geval (axiaal starre staaf)");
{
  const A = 1000, dT = 30;
  const multi = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I: 1e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    loads: [],
    thermalLoads: [{ beamId: 1, deltaT: dT, caseId: 1 }],
    cases: [{ id: 1, name: "Thermisch" }],
  };
  try {
    const { perCase } = solveAllCases(multi);
    const N1x = perCase.get(1).elements.get(1).N;
    const combo = { id: 100, name: "1.5T", factors: new Map([[1, 1.5]]) };
    const comboRes = combineResults(combo, perCase);
    const N15 = comboRes.elements.get(1).N;
    check("N(1,0×) = E·A·α·ΔT", Math.abs(N1x), E * A * ALPHA * dT, 0.1);
    check("N(1,5×) = 1,5 × N(1,0×)", N15, 1.5 * N1x, 0.01);
    check("reactie schaalt mee", comboRes.reactions.get(1).fx, 1.5 * perCase.get(1).reactions.get(1).fx, 0.01);
  } catch (e) {
    failed += 3;
    log(`  ✗ solveAllCases faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [5] 2e-orde: thermische druk P = 0,5·P_E + dwarslast H → secansvergroting
// ─────────────────────────────────────────────────────────────────────────
// Kolom scharnier-scharnier (beide x+y vast), 4 elementen, verwarmd zodat de
// verhinderde uitzetting P = E·A·α·ΔT = 0,5·P_E oplevert; H op halve hoogte.
// De gefactoreerde ΔT moet met de combinatie mee het 2e-orde-pad in: de
// laterale vergroting t.o.v. 1e-orde volgt de exacte secansoplossing
//   f = (tan(u) − u)/(u³/3),  u = (L/2)·√(P/EI)  →  f(0,5·P_E) ≈ 1,9816.
log("\n[5] 2e-orde: kolom met thermische druk 0,5·P_E + H op halve hoogte");
{
  const A = 3877, I = 1e7, L = 4000, nEl = 4, H = 1000;
  const EI = E * I;
  const P_E = Math.PI * Math.PI * EI / (L * L);
  const P = 0.5 * P_E;
  const dT = P / (E * A * ALPHA); // ≈ 66.3 K
  const u = (L / 2) * Math.sqrt(P / EI);
  const fExact = (Math.tan(u) - u) / (u * u * u / 3); // ≈ 1.9816
  const nodes = [], beams = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: 0, z: (L / nEl) * i });
  for (let i = 0; i < nEl; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
  const multi = {
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: nEl + 1, type: "pinned" }],
    loads: [],
    pointLoads: [{ nodeId: nEl / 2 + 1, fx: H, fz: 0, caseId: 2 }],
    thermalLoads: beams.map(b => ({ beamId: b.id, deltaT: dT, caseId: 1 })),
    cases: [{ id: 1, name: "Thermisch" }, { id: 2, name: "Dwarslast" }],
  };
  const combo = { id: 200, name: "T+H", factors: new Map([[1, 1], [2, 1]]) };
  try {
    const lin = combineResults(combo, solveAllCases(multi).perCase);
    const nl  = combineResults(combo, solveAllCasesNonlinear(multi).perCase);
    const w1 = lin.displacements.get(nEl / 2 + 1).ux;
    const w2 = nl.displacements.get(nEl / 2 + 1).ux;
    check("w_1e = H·L³/48EI", w1, H * L * L * L / (48 * EI), 1);
    check("vergrotingsfactor w_2e/w_1e = secans-exact", w2 / w1, fExact, 3);
    // Thermische N komt onvermengd door het 2e-orde-pad (P-Δ raakt zuivere druk niet)
    const Nnl = nl.elements.get(1).N;
    check("|N| in 2e-orde = E·A·α·ΔT = 0,5·P_E", Math.abs(Nnl), P, 0.5);
    checkTrue("N heeft het druk-teken (2e-orde)", Math.sign(Nnl) === DRUK_TEKEN);
  } catch (e) {
    failed += 4;
    log(`  ✗ 2e-orde-pad faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [6] 2e-orde: thermische druk BOVEN de kniklast → nette combinatiefout
// ─────────────────────────────────────────────────────────────────────────
// Zelfde kolom, ΔT zodat P = 1,5·P_E, alléén thermisch geval. Het 2e-orde-pad
// moet het thermische geval als last herkennen en de instabiliteit melden
// (geen stille terugval op superpositie).
log("\n[6] 2e-orde: thermische druk 1,5·P_E → verwachte instabiliteitsmelding");
{
  const A = 3877, I = 1e7, L = 4000, nEl = 4;
  const EI = E * I;
  const P_E = Math.PI * Math.PI * EI / (L * L);
  const dT = 1.5 * P_E / (E * A * ALPHA); // ≈ 199 K
  const nodes = [], beams = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: 0, z: (L / nEl) * i });
  for (let i = 0; i < nEl; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
  const multi = {
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: nEl + 1, type: "pinned" }],
    loads: [],
    thermalLoads: beams.map(b => ({ beamId: b.id, deltaT: dT, caseId: 1 })),
    cases: [{ id: 1, name: "Thermisch" }],
  };
  const combo = { id: 300, name: "1.0T_boven_knik", factors: new Map([[1, 1]]) };
  try {
    const { perCase } = solveAllCasesNonlinear(multi);
    // 1e-orde per geval moet gewoon lukken (lineair kent geen knik)
    checkTrue("1e-orde per geval lukt", perCase.get(1) !== undefined);
    let threw = false, msg = "";
    try {
      combineResults(combo, perCase);
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    checkTrue("combinatie meldt instabiliteit (geen stille superpositie)",
      threw && /2e-orde|kritieke/.test(msg), threw ? msg.slice(0, 80) : "geen fout gegooid");
  } catch (e) {
    failed += 2;
    log(`  ✗ solveAllCasesNonlinear faalde: ${e instanceof Error ? e.message : e}`);
  }
}

log("\n══════════════════════════════════");
log(`RESULTAAT: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
