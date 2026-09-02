// Deellasten (partiële verdeelde lasten) — UI/adapter-doorvoer + exacte stations.
//
// De core kende al startT/endT (fracties 0..1) op element.distributedLoad,
// maar de adapter (engine.ts) en de UI boden ze niet aan. Deze test verifieert
// de nieuwe doorvoer via Load.startFrac/endFrac → SolverDistLoadInput →
// mesh.distributedLoads, en dat N/V/M/w op de 21 stations EXACT zijn
// (stuksgewijze particuliere oplossing in BeamForces.ts).
//
// Alle referenties zijn analytische handberekeningen (in commentaar) of een
// fijn onderverdeeld referentiemodel uit dezelfde solver.
//
// Stijl: test-v2-stations.mjs / test-veldzakking.mjs.
// Draaien met: npx tsx test-deellast.mjs

const { solve, solveCombinationSecondOrder } = await import("./src/components/fem/solver/engine.ts");
const { computeBeamSplit } = await import("./src/hooks/useFemStore.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

const E = 210000;   // N/mm²
const I = 1e8;      // mm⁴
const A = 3877;     // mm²
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

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: vrij opgelegde ligger L=6 m, deellast q=10 kN/m ↓ op [2 m, 4 m].
// Handberekening: W = 10·2 = 20 kN symmetrisch → R_A = R_B = 10 kN.
// M(3 m) = R_A·3 − q·1·0,5 = 30 − 5 = 25 kNm (sagging-positief).
// V(1 m) (vóór de last) = R_A = 10 kN (constant tot x=2 m).
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrij opgelegd L=6 m + q=10 kN/m ↓ op [2 m, 4 m]");
let deel1 = null; // resultaat bewaard voor test 3 (w-symmetrie)
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, startFrac: 2 / 6, endFrac: 4 / 6 }],
  });
  deel1 = r;
  check("R_A = 10 kN", r.reactions.get(1)?.fz ?? NaN, 10000);
  check("R_B = 10 kN", r.reactions.get(2)?.fz ?? NaN, 10000);
  const ef = r.elements.get(1);
  // Station 10 van 21 = x = 3,0 m (exact op het stationsraster).
  check("M(3 m) = 25 kNm exact", ef.bendingMoment[10], 25e6, 0.001);
  // Onbelast deel vóór de last: V constant. Stations 0..6 → x = 0 .. 1,8 m.
  const Vfront = ef.shearForce.slice(0, 7);
  const vSpread = Math.max(...Vfront) - Math.min(...Vfront);
  checkTrue(`V constant vóór lastbegin (spreiding ${vSpread.toExponential(2)} N)`, vSpread < 1e-6 * 10000 + 1e-6);
  check("|V| vóór de last = R_A", Math.abs(ef.shearForce[3]), 10000, 0.001);
  // M lineair op het onbelaste deel: M(1,8) = R_A·1,8 = 18 kNm (station 6).
  check("M(1,8 m) = 18 kNm exact", ef.bendingMoment[6], 18e6, 0.001);
  check("M(0) = 0", Math.abs(ef.bendingMoment[0]), 0, 0.001);
  check("M(L) = 0", Math.abs(ef.bendingMoment[20]), 0, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: asymmetrische deellast q=10 kN/m ↓ op [0, 2 m], L=6 m.
// Momentenevenwicht: W = 20 kN op zwaartepunt x=1 m.
//   R_B = 20·1/6 = 3,3333 kN;  R_A = 20·5/6 = 16,6667 kN.
// Na het lasteinde (x > 2 m) is V constant = −R_B → |V| = 3,3333 kN.
// M(3 m) = R_B·3 = 10 kNm (vanaf rechts).
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Asymmetrische deellast [0, 2 m] op L=6 m");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, startFrac: 0, endFrac: 2 / 6 }],
  });
  check("R_A = 16,667 kN", r.reactions.get(1)?.fz ?? NaN, 20000 * 5 / 6, 0.001);
  check("R_B = 3,333 kN", r.reactions.get(2)?.fz ?? NaN, 20000 / 6, 0.001);
  const ef = r.elements.get(1);
  // Stations 7..20 → x = 2,1 .. 6,0 m: allemaal ná het lasteinde → V constant.
  const Vtail = ef.shearForce.slice(7);
  const spread = Math.max(...Vtail) - Math.min(...Vtail);
  checkTrue(`V constant na lasteinde (spreiding ${spread.toExponential(2)} N)`, spread < 1e-6 * 20000 + 1e-6);
  check("|V| na lasteinde = R_B", Math.abs(ef.shearForce[15]), 20000 / 6, 0.001);
  check("M(3 m) = R_B·3 = 10 kNm", ef.bendingMoment[10], 10e6, 0.001);
  // Binnen het belaste deel: M(0,9 m) = R_A·0,9 − 10·0,9²/2 = 15 − 4,05 = 10,95 kNm (station 3).
  check("M(0,9 m) = 10,95 kNm exact", ef.bendingMoment[3], 10.95e6, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: w(x) bij symmetrische deellast (geval van test 1).
// (a) symmetrie: w[i] == w[20−i] (rel. 1e-6);
// (b) w_mid exact via eenheidslastmethode (handberekening):
//     R = 10 kN; w_mid = 2/EI·[∫₀² Rx·(x/2)dx + ∫₂³ (Rx − q(x−2)²/2)(x/2)dx]
//                = 2·(13,3333 + 29,375) kNm³/EI = 85,41667 kNm³/EI
//     = 8,541667e13 N·mm³ / (2,1e13 N·mm²) = 4,06746 mm (omlaag → w < 0);
// (c) kruiscontrole met fijn onderverdeeld referentiemodel uit dezelfde
//     solver: 12 elementen van 0,5 m, elementen 5–8 (x=2..4 m) q over de
//     VOLLE elementlengte → knoopzakking op x=3 m, binnen 0,5%.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] w(x): symmetrie + w_mid exact + referentiemodel");
{
  const ef = deel1.elements.get(1);
  checkTrue("deflection[] aanwezig (21 stations)", Array.isArray(ef.deflection) && ef.deflection.length === 21);
  let symOK = true;
  for (let i = 0; i <= 10; i++) {
    const a = ef.deflection[i], b = ef.deflection[20 - i];
    if (Math.abs(a - b) > 1e-6 * Math.max(1e-9, Math.abs(a))) { symOK = false; break; }
  }
  checkTrue("w symmetrisch rond het midden (rel. 1e-6)", symOK);
  const wExp = 85.416666667e12 / (E * I); // 4,06746 mm
  check("|w_mid| exact (eenheidslastmethode)", Math.abs(ef.deflection[10]), wExp, 0.01);
  checkTrue("w_mid < 0 (doorhangen negatief)", ef.deflection[10] < 0);

  // Referentiemodel: 12 elementen van 0,5 m; q op elementen tussen x=2 en 4 m.
  const nodes = [], beams = [], loads = [];
  for (let i = 0; i <= 12; i++) nodes.push({ id: i + 1, x: i * 500, z: 0 });
  for (let i = 0; i < 12; i++) {
    beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
    const x0 = i * 500, x1 = (i + 1) * 500;
    if (x0 >= 2000 && x1 <= 4000) loads.push({ beamId: i + 1, q: -10 });
  }
  const rRef = solve({
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 13, type: "zRoller" }],
    loads,
  });
  const wRef = rRef.displacements.get(7)?.uz ?? NaN; // knoop op x=3 m
  check("w_mid t.o.v. referentiemodel (12 el.)", ef.deflection[10], wRef, 0.5);
  // w óók exact op een station BINNEN het onbelaste deel (x=0,9 m, station 3):
  // referentieknoop bestaat niet op 0,9 m → vergelijk met de exacte kromme via
  // eenheidslastmethode is bewerkelijk; in plaats daarvan: station 4 (x=1,2 m)
  // tegen referentiemodel-knoop 0? Niet beschikbaar. We checken het volledige
  // verloop indirect: w op x=2,5 m ligt niet op het referentieraster (wel op
  // 2,5 m: knoop 6!) → vergelijk daar wél, met Hermite-vrije knoopwaarde.
  // Station op 2,5 m bestaat niet in het 21-raster (stap 0,3 m) — gebruik
  // x=1,5 m (station 5) vs. referentieknoop 4 (x=1500).
  const wRef15 = rRef.displacements.get(4)?.uz ?? NaN;
  check("w(1,5 m) t.o.v. referentiemodel", ef.deflection[5], wRef15, 0.5);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: trapezium-deellast 0 → 10 kN/m ↓ op [2 m, 4 m], L=6 m.
// W = ½·10·2 = 10 kN op zwaartepunt x = 2 + (2/3)·2 = 3,3333 m.
//   R_A = 10·(6−3,3333)/6 = 4,4444 kN;  R_B = 5,5556 kN.
// M(3 m) = R_A·3 − W₁·(3−z₁), met W₁ = ∫₂³ 5(s−2) ds = 2,5 kN op z₁ = 2,6667 m
//        = 13,3333 − 2,5·0,3333 = 12,5 kNm.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Trapezium-deellast 0→10 kN/m op [2 m, 4 m]");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: 0, qStart: 0, qEnd: -10, startFrac: 2 / 6, endFrac: 4 / 6 }],
  });
  check("R_A = 4,444 kN", r.reactions.get(1)?.fz ?? NaN, 10000 * (6 - 10 / 3) / 6, 0.001);
  check("R_B = 5,556 kN", r.reactions.get(2)?.fz ?? NaN, 10000 * (10 / 3) / 6, 0.001);
  const ef = r.elements.get(1);
  check("M(3 m) = 12,5 kNm exact", ef.bendingMoment[10], 12.5e6, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: meerdere lasten op DEZELFDE staaf in één geval:
// volle-lengte q=10 kN/m ↓ + deellast q=10 kN/m ↓ op [2,4] m.
// R = qL/2 + 10 = 30 + 10 = 40 kN;  M_mid = qL²/8 + 25 = 45 + 25 = 70 kNm.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Volle-lengte + deellast op dezelfde staaf");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [
      { beamId: 1, q: -10 },
      { beamId: 1, q: -10, startFrac: 2 / 6, endFrac: 4 / 6 },
    ],
  });
  check("R_A = 40 kN", r.reactions.get(1)?.fz ?? NaN, 40000, 0.001);
  check("M_mid = 70 kNm exact", r.elements.get(1).bendingMoment[10], 70e6, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: regressie-anker — startFrac:0/endFrac:1 geeft BIT-VOOR-BIT
// hetzelfde als de velden weglaten (het pre-existente volle-lengte-pad).
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Regressie-anker: expliciet [0,1] ≡ velden weggelaten (bitgelijk)");
{
  const base = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  };
  const rOud = solve({ ...base, loads: [{ beamId: 1, q: -10 }] });
  const rNul = solve({ ...base, loads: [{ beamId: 1, q: -10, startFrac: 0, endFrac: 1 }] });
  const a = rOud.elements.get(1), b = rNul.elements.get(1);
  let bitEq = true;
  for (const key of ["bendingMoment", "shearForce", "normalForce", "deflection", "axialDisp"]) {
    for (let i = 0; i < 21; i++) {
      if (!Object.is(a[key][i], b[key][i])) { bitEq = false; log(`    afwijking in ${key}[${i}]: ${a[key][i]} vs ${b[key][i]}`); break; }
    }
  }
  for (const nid of [1, 2]) {
    const ra = rOud.reactions.get(nid), rb = rNul.reactions.get(nid);
    if (!Object.is(ra.fz, rb.fz) || !Object.is(ra.fx, rb.fx) || !Object.is(ra.my, rb.my)) bitEq = false;
    const da = rOud.displacements.get(nid), db = rNul.displacements.get(nid);
    if (!Object.is(da.uz, db.uz) || !Object.is(da.ux, db.ux) || !Object.is(da.ry, db.ry)) bitEq = false;
  }
  checkTrue("alle station-arrays + reacties + verplaatsingen bitgelijk", bitEq);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: 2e-orde-/combinatiepad neemt deellasten mee.
// Vrij opgelegde ligger zonder normaalkracht: P-Δ-effect = 0, dus de
// 2e-orde-combinatie met factor 1,35 moet EXACT 1,35·R geven.
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] 2e-orde-combinatiepad met deellast (factor 1,35)");
{
  const input = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, startFrac: 2 / 6, endFrac: 4 / 6, caseId: 1 }],
    cases: [{ id: 1, name: "Q" }],
  };
  const r = solveCombinationSecondOrder(input, { id: 1, name: "1,35·Q", factors: new Map([[1, 1.35]]) });
  checkTrue("combinatie levert resultaat (deellast geactiveerd)", r !== null);
  if (r) {
    check("R_A = 1,35·10 = 13,5 kN", r.reactions.get(1)?.fz ?? NaN, 13500, 0.001);
    check("M(3 m) = 1,35·25 = 33,75 kNm", r.elements.get(1).bendingMoment[10], 33.75e6, 0.01);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 8: staaf splitsen (computeBeamSplit) hermapt deellast-fracties.
// Staaf 6 m, deellast [2,4] m, splits op x=3 m:
//   deel 1 (0–3 m): belast [2,3] → fracties [2/3, 1]
//   deel 2 (3–6 m): belast [3,4] → fracties [0, 1/3]
// En het gesplitste model geeft dezelfde reacties als het ongesplitste.
// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Splitsen met deellast: fractie-remapping + zelfde reacties");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, startFrac: 2 / 6, endFrac: 4 / 6 }],
  };
  const split = computeBeamSplit(cur, 1, 3000, 0);
  checkTrue("split gelukt", split !== null);
  if (split) {
    const l1 = split.loads.find(l => l.beamId === 2); // deel 1 (nieuwe id's beginnen na max)
    const l2 = split.loads.find(l => l.beamId === 3);
    checkTrue("deel 1 heeft last", l1 !== undefined);
    checkTrue("deel 2 heeft last", l2 !== undefined);
    if (l1) {
      check("deel 1 startFrac = 2/3", l1.startFrac ?? 0, 2 / 3, 0.001);
      check("deel 1 endFrac = 1", l1.endFrac ?? 1, 1, 0.001);
    }
    if (l2) {
      check("deel 2 startFrac = 0", l2.startFrac ?? 0, 0, 0.001);
      check("deel 2 endFrac = 1/3", l2.endFrac ?? 1, 1 / 3, 0.001);
    }
    // Gesplitst model doorrekenen: reacties identiek aan test 1.
    const rs = solve({
      nodes: split.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
      beams: split.beams.map(b => ({ id: b.id, from: b.from, to: b.to, E, A, I })),
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: split.loads.map(l => ({ beamId: l.beamId, q: l.q, startFrac: l.startFrac, endFrac: l.endFrac })),
    });
    check("gesplitst: R_A = 10 kN", rs.reactions.get(1)?.fz ?? NaN, 10000, 0.001);
    check("gesplitst: R_B = 10 kN", rs.reactions.get(2)?.fz ?? NaN, 10000, 0.001);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 9: horizontale (wind-)deellast op een kolom — qDir:"x" + fracties.
// Kolom H=5 m, onder pinned, boven xRoller; q=+1,5 N/mm op onderste helft.
// ΣFx-reacties = −1,5·2500 = −3750 N (evenwicht).
// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Horizontale deellast op kolom (qDir x, onderste helft)");
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 5000 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "xRoller" }],
    loads: [{ beamId: 1, q: 1.5, qDir: "x", startFrac: 0, endFrac: 0.5 }],
  });
  const sumFx = (r.reactions.get(1)?.fx ?? 0) + (r.reactions.get(2)?.fx ?? 0);
  check("ΣFx-reacties = −3750 N", sumFx, -3750, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 10: projectbestand-roundtrip — startFrac/endFrac reizen mee zonder
// versie-bump (nieuwe optionele Load-velden).
// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Projectbestand-roundtrip met deellast-velden");
{
  const state = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    supports: [{ nodeId: 1, type: "pinned" }],
    plates: [],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, startFrac: 0.25, endFrac: 0.75 }],
    loadCases: [{ id: 1, name: "G", type: "dead" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: false,
    nonlinearEnabled: false,
  };
  const text = serializeProject(state);
  const back = deserializeProject(text);
  check("startFrac overleeft roundtrip", back.loads[0].startFrac ?? NaN, 0.25, 0.001);
  check("endFrac overleeft roundtrip", back.loads[0].endFrac ?? NaN, 0.75, 0.001);
  // Oud bestand zonder de velden: laden zonder fout, velden undefined.
  const oud = JSON.parse(text);
  delete oud.loads[0].startFrac;
  delete oud.loads[0].endFrac;
  const backOud = deserializeProject(JSON.stringify(oud));
  checkTrue("oud bestand zonder velden laadt (velden undefined)",
    backOud.loads[0].startFrac === undefined && backOud.loads[0].endFrac === undefined);
}

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
