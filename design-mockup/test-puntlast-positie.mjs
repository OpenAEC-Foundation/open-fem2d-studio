// Puntlast op een VRIJE POSITIE op een staaf (Load.beamId + posFrac).
//
// De puntlast-tool kon alleen op een knoop aangrijpen. Deze test verifieert de
// nieuwe doorvoer Load.posFrac → SolverBeamPointLoadInput → engine-adapter, en
// bewijst analytisch dat de gekozen rekenaanpak (staaf SPLITSEN op de
// lastpositie en de kracht op de tussenknoop zetten — zie types.ts) exact is:
// reacties, M_max op de lastpositie én de sprong in V.
//
// Referenties zijn handberekeningen voor een vrij opgelegde ligger:
//   P op het midden : R_A = R_B = P/2,  M_max = P·L/4
//   P op afstand a  : R_A = P·b/L, R_B = P·a/L,  M_max = P·a·b/L
//
// Stijl: test-deellast.mjs / test-v2-stations.mjs.
// Draaien met: npx tsx test-puntlast-positie.mjs

const { solve, solveAllCases, solveCombinationSecondOrder } =
  await import("./src/components/fem/solver/engine.ts");
const { computeBeamSplit } = await import("./src/hooks/useFemStore.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

const E = 210000;   // N/mm²
const I = 1e8;      // mm⁴
const A = 3877;     // mm²
const L = 6000;     // mm
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-6;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(4)} ≈ ${expected.toFixed(4)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected.toFixed(4)}`); }
}

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

/** Vrij opgelegde ligger L=6 m met één staafgebonden puntlast. */
function liggerMetPuntlast(posFrac, fz_N, extra = {}) {
  return solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [],
    beamPointLoads: [{ beamId: 1, posFrac, fz: fz_N, ...extra }],
  });
}

/** Grootste |M| over alle stations (N·mm) + de x waar dat optreedt (mm). */
function maxMoment(ef) {
  let best = { M: 0, x: 0 };
  for (let i = 0; i < ef.bendingMoment.length; i++) {
    if (Math.abs(ef.bendingMoment[i]) > Math.abs(best.M)) {
      best = { M: ef.bendingMoment[i], x: ef.stations_mm[i] };
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: P = 20 kN ↓ op het MIDDEN (posFrac 0,5) van een vrij opgelegde
// ligger L = 6 m.  R_A = R_B = P/2 = 10 kN;  M_max = P·L/4 = 30 kNm op x = 3 m.
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrij opgelegd L=6 m, P=20 kN ↓ op het midden (posFrac 0,5)");
{
  const P = 20000; // N
  const r = liggerMetPuntlast(0.5, -P);
  check("R_A = P/2 = 10 kN", r.reactions.get(1)?.fz ?? NaN, P / 2, 0.001);
  check("R_B = P/2 = 10 kN", r.reactions.get(2)?.fz ?? NaN, P / 2, 0.001);
  const ef = r.elements.get(1);
  checkTrue("staafresultaat aanwezig", !!ef);
  check("staaflengte blijft 6 m na splitsen", ef.L_mm, L, 0.001);
  const mm = maxMoment(ef);
  check("M_max = P·L/4 = 30 kNm", mm.M, P * L / 4, 0.001);
  check("M_max op x = 3,0 m", mm.x, L / 2, 0.001);
  check("M(0) = 0", Math.abs(ef.bendingMoment[0]), 0, 0.001);
  check("M(L) = 0", Math.abs(ef.bendingMoment[ef.bendingMoment.length - 1]), 0, 0.001);
  // V springt op de lastpositie van +P/2 naar −P/2 (dubbel station op x=3 m).
  const iSprong = ef.stations_mm.findIndex((x, i) =>
    i > 0 && Math.abs(x - L / 2) < 1e-6 && Math.abs(ef.stations_mm[i - 1] - L / 2) < 1e-6);
  checkTrue("dubbel station op de lastpositie (splitsgrens)", iSprong > 0);
  if (iSprong > 0) {
    const sprong = ef.shearForce[iSprong] - ef.shearForce[iSprong - 1];
    check("V-sprong = −P = −20 kN", sprong, -P, 0.001);
    check("|V| links van de last = P/2", Math.abs(ef.shearForce[iSprong - 1]), P / 2, 0.001);
    check("|V| rechts van de last = P/2", Math.abs(ef.shearForce[iSprong]), P / 2, 0.001);
  }
  // Zakking op de lastpositie: w = P·L³/(48·EI) omlaag.
  const wExp = P * L ** 3 / (48 * E * I);
  const iMid = ef.stations_mm.findIndex((x) => Math.abs(x - L / 2) < 1e-6);
  check("|w| midden = P·L³/(48·EI)", Math.abs(ef.deflection[iMid]), wExp, 0.05);
  checkTrue("w midden < 0 (doorhangen negatief)", ef.deflection[iMid] < 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: P = 20 kN ↓ op a = 0,3·L = 1,8 m (b = 4,2 m).
//   R_A = P·b/L = 20·4,2/6 = 14 kN;  R_B = P·a/L = 20·1,8/6 = 6 kN
//   M_max = P·a·b/L = 20·1,8·4,2/6 = 25,2 kNm, op x = a
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] P=20 kN ↓ op a = 0,3·L (posFrac 0,3)");
{
  const P = 20000, a = 0.3 * L, b = L - a;
  const r = liggerMetPuntlast(0.3, -P);
  check("R_A = P·b/L = 14 kN", r.reactions.get(1)?.fz ?? NaN, P * b / L, 0.001);
  check("R_B = P·a/L = 6 kN",  r.reactions.get(2)?.fz ?? NaN, P * a / L, 0.001);
  const ef = r.elements.get(1);
  const mm = maxMoment(ef);
  check("M_max = P·a·b/L = 25,2 kNm", mm.M, P * a * b / L / 1, 0.001);
  check("M_max op x = a = 1,8 m", mm.x, a, 0.001);
  check("M(0) = 0", Math.abs(ef.bendingMoment[0]), 0, 0.001);
  check("M(L) = 0", Math.abs(ef.bendingMoment[ef.bendingMoment.length - 1]), 0, 0.001);
  // M loopt LINEAIR naar de last toe: M(a/2) = R_A·a/2 = 14·0,9 = 12,6 kNm.
  const iHalf = ef.stations_mm.reduce((best, x, i) =>
    Math.abs(x - a / 2) < Math.abs(ef.stations_mm[best] - a / 2) ? i : best, 0);
  const xh = ef.stations_mm[iHalf];
  check(`M lineair links (x=${(xh / 1000).toFixed(2)} m)`,
    ef.bendingMoment[iHalf], (P * b / L) * xh, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: posFrac 0 en 1 vallen op de eindknopen → IDENTIEK aan een
// gewone knooplast daar (geen splitsing, zelfde stationsraster).
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] posFrac 0 / 1 ≡ knooplast op de start-/eindknoop");
{
  const P = 15000;
  const basis = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: L / 2, z: 3000 }],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 1, to: 3, E, A, I },
    ],
    supports: [{ nodeId: 2, type: "pinned" }, { nodeId: 3, type: "pinned" }],
    loads: [],
  };
  for (const [frac, nodeId, naam] of [[0, 1, "startknoop"], [1, 2, "eindknoop"]]) {
    const rKnoop = solve({ ...basis, pointLoads: [{ nodeId, fz: -P, fx: 0.3 * P }] });
    const rStaaf = solve({ ...basis, beamPointLoads: [{ beamId: 1, posFrac: frac, fz: -P, fx: 0.3 * P }] });
    let gelijk = true;
    for (const nid of [1, 2, 3]) {
      const da = rKnoop.displacements.get(nid), db = rStaaf.displacements.get(nid);
      if (!Object.is(da.ux, db.ux) || !Object.is(da.uz, db.uz) || !Object.is(da.ry, db.ry)) gelijk = false;
      const ra = rKnoop.reactions.get(nid), rb = rStaaf.reactions.get(nid);
      if (ra && rb && (!Object.is(ra.fx, rb.fx) || !Object.is(ra.fz, rb.fz) || !Object.is(ra.my, rb.my))) gelijk = false;
    }
    for (const bid of [1, 2]) {
      const ea = rKnoop.elements.get(bid), eb = rStaaf.elements.get(bid);
      if (ea.stations_mm.length !== eb.stations_mm.length) { gelijk = false; break; }
      for (let i = 0; i < ea.stations_mm.length; i++) {
        if (!Object.is(ea.bendingMoment[i], eb.bendingMoment[i])
         || !Object.is(ea.shearForce[i], eb.shearForce[i])
         || !Object.is(ea.normalForce[i], eb.normalForce[i])) { gelijk = false; break; }
      }
    }
    checkTrue(`posFrac ${frac} (${naam}) bitgelijk aan knooplast op knoop ${nodeId}`, gelijk);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: regressie-anker — een model ZONDER staafpuntlasten is bit-voor-bit
// identiek met en zonder het (lege) beamPointLoads-veld: de nieuwe splits-
// logica raakt het bestaande pad niet.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Regressie-anker: leeg beamPointLoads ≡ veld weggelaten (bitgelijk)");
{
  const basis = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10 }],
  };
  const rOud = solve(basis);
  const rNieuw = solve({ ...basis, beamPointLoads: [] });
  let bitEq = rOud.elements.get(1).stations_mm.length === rNieuw.elements.get(1).stations_mm.length;
  const a = rOud.elements.get(1), b = rNieuw.elements.get(1);
  for (const key of ["bendingMoment", "shearForce", "normalForce", "deflection", "axialDisp"]) {
    for (let i = 0; i < a[key].length; i++) {
      if (!Object.is(a[key][i], b[key][i])) { bitEq = false; break; }
    }
  }
  for (const nid of [1, 2]) {
    const ra = rOud.reactions.get(nid), rb = rNieuw.reactions.get(nid);
    if (!Object.is(ra.fz, rb.fz) || !Object.is(ra.fx, rb.fx)) bitEq = false;
  }
  checkTrue("stations + reacties bitgelijk", bitEq);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: horizontale staafpuntlast op een KOLOM (posFrac 0,6) —
// H = 10 kN naar rechts op 3 m hoogte van een 5 m kolom, onder ingeklemd.
//   ΣFx-reactie = −H;  M_voet = −H·h = −30 kNm (grootte 30 kNm).
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Horizontale puntlast op een kolom (posFrac 0,6 van 5 m)");
{
  const H = 10000, hK = 5000, a = 0.6 * hK;
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: hK }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    beamPointLoads: [{ beamId: 1, posFrac: 0.6, fx: H }],
  });
  check("R_x = −H = −10 kN", r.reactions.get(1)?.fx ?? NaN, -H, 0.001);
  check("|M_voet| = H·a = 30 kNm", Math.abs(r.reactions.get(1)?.my ?? NaN), H * a, 0.001);
  const ef = r.elements.get(1);
  // Boven de last is de kolom momentvrij: M op het laatste station = 0.
  check("M(top) = 0", Math.abs(ef.bendingMoment[ef.bendingMoment.length - 1]), 0, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: multi-geval + 2e-orde-combinatiepad. Een vrij opgelegde ligger
// zonder normaalkracht heeft geen P-Δ-effect, dus 1,35·P moet EXACT 1,35·R
// geven. Tegelijk een controle dat het stationsraster van een geval ZONDER
// de puntlast identiek is (splitsing is lastgeval-onafhankelijk) — anders zou
// combinatie-superpositie ongeldig zijn.
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Multi-geval + 2e-orde-combinatie met staafpuntlast");
{
  const P = 20000;
  const input = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, caseId: 2 }],
    beamPointLoads: [{ beamId: 1, posFrac: 0.3, fz: -P, caseId: 1 }],
    cases: [{ id: 1, name: "Q" }, { id: 2, name: "G" }],
  };
  const { perCase } = solveAllCases(input);
  const rQ = perCase.get(1), rG = perCase.get(2);
  checkTrue("beide gevallen leveren resultaat", !!rQ && !!rG);
  if (rQ && rG) {
    check("geval Q: R_A = P·b/L = 14 kN", rQ.reactions.get(1)?.fz ?? NaN, P * 0.7, 0.001);
    check("geval G: R_A = qL/2 = 30 kN", rG.reactions.get(1)?.fz ?? NaN, 30000, 0.001);
    const nQ = rQ.elements.get(1).stations_mm.length;
    const nG = rG.elements.get(1).stations_mm.length;
    checkTrue(`stationsraster gelijk in beide gevallen (${nQ} = ${nG}) — superpositie geldig`, nQ === nG);
    let rasterGelijk = true;
    for (let i = 0; i < nQ; i++) {
      if (Math.abs(rQ.elements.get(1).stations_mm[i] - rG.elements.get(1).stations_mm[i]) > 1e-9) {
        rasterGelijk = false; break;
      }
    }
    checkTrue("stationsposities identiek in beide gevallen", rasterGelijk);
  }
  const rC = solveCombinationSecondOrder(input, {
    id: 1, name: "1,35·Q", factors: new Map([[1, 1.35]]),
  });
  checkTrue("2e-orde-combinatie levert resultaat", rC !== null);
  if (rC) {
    check("R_A = 1,35·14 = 18,9 kN", rC.reactions.get(1)?.fz ?? NaN, 1.35 * P * 0.7, 0.01);
    const mm = maxMoment(rC.elements.get(1));
    check("M_max = 1,35·25,2 = 34,02 kNm", mm.M, 1.35 * P * 1800 * 4200 / L, 0.05);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: staaf splitsen (computeBeamSplit) hermapt posFrac.
// Staaf 6 m, puntlast op posFrac 0,3 (= 1,8 m), splits op x = 3 m (t = 0,5):
//   de last hoort bij deel 1 en krijgt posFrac 0,3/0,5 = 0,6.
// Een last op 0,8 (= 4,8 m) hoort bij deel 2: (0,8−0,5)/0,5 = 0,6.
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Splitsen met staafpuntlast: posFrac-remapping");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [
      { id: 1, type: "pointForce", caseId: 1, beamId: 1, posFrac: 0.3, fz: -20 },
      { id: 2, type: "pointForce", caseId: 1, beamId: 1, posFrac: 0.8, fz: -20 },
    ],
  };
  const split = computeBeamSplit(cur, 1, 3000, 0);
  checkTrue("split gelukt", split !== null);
  if (split) {
    const l1 = split.loads.find(l => l.beamId === 2);
    const l2 = split.loads.find(l => l.beamId === 3);
    checkTrue("last 1 verhuist naar deel 1", l1 !== undefined);
    checkTrue("last 2 verhuist naar deel 2", l2 !== undefined);
    if (l1) check("deel 1: posFrac = 0,6", l1.posFrac ?? NaN, 0.6, 0.001);
    if (l2) check("deel 2: posFrac = 0,6", l2.posFrac ?? NaN, 0.6, 0.001);
    // Gesplitst model doorrekenen: reacties identiek aan het ongesplitste.
    const rs = solve({
      nodes: split.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
      beams: split.beams.map(b => ({ id: b.id, from: b.from, to: b.to, E, A, I })),
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: [],
      beamPointLoads: split.loads.map(l => ({
        beamId: l.beamId, posFrac: l.posFrac, fz: (l.fz ?? 0) * 1000,
      })),
    });
    // Handberekening: P=20 kN op 1,8 m én op 4,8 m.
    //   R_A = 20·(6−1,8)/6 + 20·(6−4,8)/6 = 14 + 4 = 18 kN
    //   R_B = 20·1,8/6 + 20·4,8/6 = 6 + 16 = 22 kN
    check("gesplitst: R_A = 18 kN", rs.reactions.get(1)?.fz ?? NaN, 18000, 0.001);
    check("gesplitst: R_B = 22 kN", rs.reactions.get(2)?.fz ?? NaN, 22000, 0.001);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 8: projectbestand-roundtrip — posFrac reist mee, en een OUD bestand
// zonder het veld laadt ongewijzigd (knoopgebonden puntlast blijft werken).
// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Projectbestand-roundtrip met posFrac");
{
  const state = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    supports: [{ nodeId: 1, type: "pinned" }],
    plates: [],
    loads: [
      { id: 1, type: "pointForce", caseId: 1, beamId: 1, posFrac: 0.35, fz: -12 },
      { id: 2, type: "pointForce", caseId: 1, nodeId: 2, fz: -5 },
    ],
    loadCases: [{ id: 1, name: "G", type: "dead" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: false,
    nonlinearEnabled: false,
  };
  const text = serializeProject(state);
  const back = deserializeProject(text);
  check("posFrac overleeft roundtrip", back.loads[0].posFrac ?? NaN, 0.35, 0.001);
  check("beamId overleeft roundtrip", back.loads[0].beamId ?? NaN, 1, 0.001);
  checkTrue("knoopgebonden puntlast onaangetast",
    back.loads[1].nodeId === 2 && back.loads[1].posFrac === undefined);
  // Oud bestand zonder het veld: laadt zonder fout.
  const oud = JSON.parse(text);
  delete oud.loads[0].posFrac;
  delete oud.loads[0].beamId;
  oud.loads[0].nodeId = 1;
  const backOud = deserializeProject(JSON.stringify(oud));
  checkTrue("oud bestand (alleen nodeId) laadt, posFrac undefined",
    backOud.loads[0].posFrac === undefined && backOud.loads[0].nodeId === 1);
}

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
