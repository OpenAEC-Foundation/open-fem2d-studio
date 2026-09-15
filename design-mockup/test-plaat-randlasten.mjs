// Randlast (volle, deel- en trapeziumlast), puntlast op een plaatrand en een
// staafeinde tussen twee randknopen — stap 1 van het platenspoor.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] ΣF en momentevenwicht voor volle, deel- en trapeziumrandlasten op een
//       rechthoek en een polygoon. De verwachting is statica: ΣR = −∫p ds en
//       Σ(x·Rz − z·Rx) = −∫(x·pz − z·px) ds, met de integraal uit de formule
//       van een trapezium of — voor de schuine richting langs een polygoonrand —
//       Simpson, die op een tweedegraads integrand exact is.
//   [2] Consistentie: twee deellasten die samen de rand dekken, met een grens
//       MIDDEN in een element, geven exact dezelfde verplaatsingen als één
//       volle last. Dat kan alleen als de omzetting naar knoopkrachten lineair
//       en consistent is.
//   [3] Puntlast op een plaatrand: op een knoop gelijk aan een knooplast daar;
//       tussen twee knopen gelijk aan (1−t)·F en t·F op die twee knopen (de
//       lineaire vormfuncties); evenwicht; spiegelsymmetrie.
//   [4] Staafeinde tussen twee randknopen: evenwicht, u_staaf = (1−t)·u_a +
//       t·u_b tot op afrondruis, en een verticale kolom geeft de wand precies
//       dezelfde verplaatsingen als een randpuntlast op die plek. Weigering bij
//       een oplegging op zo'n knoop. Ook in het tweede-ordepad.
//   [5] Combinaties: de plaatspanningen die `combineResults` per elementindex
//       optelt zijn gelijk aan één berekening met de gefactoreerde lasten.
//   [6] De MCP-route (in-proces sidecar) geeft dezelfde reacties als de app.
//   [7] De droogloop meldt onvolledige of tegenstrijdige plaatlasten.
// Vóór deze stap bestonden deellast, trapezium en randpuntlast niet, en gaf
// het staafeinde uit [4] een kale "Matrix is singular" (gemeten).
//
// Uitvoeren: npx tsx test-plaat-randlasten.mjs   (vanuit design-mockup/)

const { solveAllCases, solveAllCasesNonlinear } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { berekenPlaatMeshSignatuur } = await import("./src/components/fem/femTypes.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  checkTrue(name, ok, `${Number(actual).toExponential(9)} ≈ ${Number(expected).toExponential(9)}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}

/** ΣRx, ΣRz (N) en Σ(x·Rz − z·Rx) (N·mm) over de opleggingen. */
function reactieSom(r, nodes) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  let rx = 0, rz = 0, m = 0;
  for (const [id, re] of r.reactions) {
    const n = pos.get(id);
    rx += re.fx; rz += re.fz; m += n.x * re.fz - n.z * re.fx;
  }
  return { rx, rz, m };
}

/**
 * Resultante (N) en moment om de oorsprong (N·mm) van een lineair verlopende
 * randlast langs het lijnstuk a → b (mm), belast van fractie fa tot fb met
 * waarden qa → qb (kN/m = N/mm) in richting dir. Simpson is exact: x·p is een
 * tweedegraads polynoom in de booglengte.
 */
function lastResultante(a, b, fa, fb, qa, qb, dir) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const s0 = fa * L, s1 = fb * L;
  const punt = (s) => ({ x: a.x + (b.x - a.x) * s / L, z: a.z + (b.z - a.z) * s / L });
  const p = (s) => qa + (qb - qa) * (s - s0) / (s1 - s0);
  const f = (s) => {
    const q = punt(s), v = p(s);
    const px = dir === "x" ? v : 0, pz = dir === "z" ? v : 0;
    return { fx: px, fz: pz, m: q.x * pz - q.z * px };
  };
  const w = (s1 - s0) / 6, m = (s0 + s1) / 2;
  const [A, M, B] = [f(s0), f(m), f(s1)];
  return {
    fx: w * (A.fx + 4 * M.fx + B.fx),
    fz: w * (A.fz + 4 * M.fz + B.fz),
    m: w * (A.m + 4 * M.m + B.m),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Modellen
// ─────────────────────────────────────────────────────────────────────────
// Wand 2 × 3 m (t = 20 mm, meshSize 500): opleggingen op elke onderrandknoop
// (scharnier links en rechts, rollen ertussen) — symmetrisch. Knopen 8, 9 en 10
// liggen op gridposities van de bovenrand en worden dus rekenknopen van de
// plaat: zo zijn hun verplaatsingen in het resultaat af te lezen.
function wandKnopen() {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * 500, z: 0 });
  nodes.push({ id: 6, x: 0, z: 3000 }, { id: 7, x: 2000, z: 3000 });
  nodes.push({ id: 8, x: 500, z: 3000 }, { id: 9, x: 1000, z: 3000 }, { id: 10, x: 1500, z: 3000 });
  return nodes;
}
function wand(extra = {}) {
  const nodes = wandKnopen();
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 1 || n.id === 5 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500 }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}
const eenGeval = (mi) => solveAllCases(mi).perCase.get(1);

// L-schijf (meshSize 500), randconforme triangulatie — als test-plaat-polygoon.
const L_HOEKEN = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 },
];
function lCache() {
  const S = 500, points = [], idx = new Map();
  const punt = (x, z) => { const k = `${x},${z}`; if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); } return idx.get(k); };
  const binnen = (x, z) => (x <= 2000 && z <= 1000) || (x <= 1000 && z <= 2000);
  const triangles = [];
  for (let x = 0; x < 2000; x += S) for (let z = 0; z < 2000; z += S) {
    if (!binnen(x + S / 2, z + S / 2)) continue;
    const bl = punt(x, z), br = punt(x + S, z), tr = punt(x + S, z + S), tl = punt(x, z + S);
    triangles.push([bl, br, tr], [bl, tr, tl]);
  }
  const rand = (a, b) => { const n = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / S), l = []; for (let s = 0; s <= n; s++) l.push(punt(a.x + (s / n) * (b.x - a.x), a.z + (s / n) * (b.z - a.z))); return l; };
  return { signature: berekenPlaatMeshSignatuur(L_HOEKEN, S), points, triangles, edgeNodeIndices: L_HOEKEN.map((h, i) => rand(h, L_HOEKEN[(i + 1) % L_HOEKEN.length])) };
}
const L_CACHE = lCache();
function lSchijf(extra = {}) {
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  return {
    nodes,
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 6, type: "xRoller" }],
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, meshCache: L_CACHE }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Randlasten: ΣF en momentevenwicht");
{
  const nodes = wandKnopen();
  const boven = { a: { x: 0, z: 3000 }, b: { x: 2000, z: 3000 } };  // edge "top": vanaf kleinste x
  const gevallen = [
    { naam: "volle gelijkmatige last, top", el: { edge: "top", p: -10, dir: "z" }, res: lastResultante(boven.a, boven.b, 0, 1, -10, -10, "z") },
    { naam: "deellast 0,2–0,85, top", el: { edge: "top", p: -10, startFrac: 0.2, endFrac: 0.85, dir: "z" }, res: lastResultante(boven.a, boven.b, 0.2, 0.85, -10, -10, "z") },
    { naam: "trapezium −10 → −30 over 0,2–0,85, top", el: { edge: "top", p: -20, pStart: -10, pEnd: -30, startFrac: 0.2, endFrac: 0.85, dir: "z" }, res: lastResultante(boven.a, boven.b, 0.2, 0.85, -10, -30, "z") },
    // Rand-index 2 loopt van hoek 3 (2000,3000) naar hoek 4 (0,3000): de
    // fracties tellen dus vanaf RECHTS. Hetzelfde trapezium, gespiegeld.
    { naam: "trapezium via edgeIndex 2 (vanaf rechts)", el: { edgeIndex: 2, p: -20, pStart: -10, pEnd: -30, startFrac: 0.2, endFrac: 0.85, dir: "z" }, res: lastResultante(boven.b, boven.a, 0.2, 0.85, -10, -30, "z") },
    { naam: "horizontale deellast +8 kN/m, linkerrand 0,5–1", el: { edge: "left", p: 8, startFrac: 0.5, endFrac: 1, dir: "x" }, res: lastResultante({ x: 0, z: 0 }, { x: 0, z: 3000 }, 0.5, 1, 8, 8, "x") },
  ];
  for (const g of gevallen) {
    const r = eenGeval(wand({ edgeLoads: [{ plateId: 1, caseId: 1, ...g.el }] }));
    const som = reactieSom(r, nodes);
    const schaal = Math.max(Math.abs(g.res.fx), Math.abs(g.res.fz));
    checkRel(`${g.naam}: ΣRz = −∫pz`, som.rz, -g.res.fz, 1e-9, schaal);
    checkRel(`${g.naam}: ΣRx = −∫px`, som.rx, -g.res.fx, 1e-9, schaal);
    checkRel(`${g.naam}: Σ(x·Rz − z·Rx) = −∫(x·pz − z·px)`, som.m, -g.res.m, 1e-9, schaal * 3000);
  }
  // Polygoon: rand-index 3 van de L loopt van hoek 4 (1000,2000) naar hoek 5
  // (1000,1000)? Nee — hoek 4 is (1000,1000), hoek 5 (1000,2000). Rand-index 4
  // loopt van (1000,2000) naar (0,2000): x AFNEMEND, dus fractie 0,25 ligt op
  // x = 750 — de proef op "vanaf hoek i".
  const lNodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  const polygoonGevallen = [
    { naam: "L, rand 5 trapezium −12 → −4 over 0,25–0,75", el: { edgeIndex: 4, p: -8, pStart: -12, pEnd: -4, startFrac: 0.25, endFrac: 0.75, dir: "z" }, res: lastResultante(L_HOEKEN[4], L_HOEKEN[5], 0.25, 0.75, -12, -4, "z") },
    { naam: "L, rand 3 (schuin langs x) volle last −6", el: { edgeIndex: 2, p: -6, dir: "z" }, res: lastResultante(L_HOEKEN[2], L_HOEKEN[3], 0, 1, -6, -6, "z") },
    { naam: "L, rand 2 horizontale deellast 0,1–0,6", el: { edgeIndex: 1, p: 5, startFrac: 0.1, endFrac: 0.6, dir: "x" }, res: lastResultante(L_HOEKEN[1], L_HOEKEN[2], 0.1, 0.6, 5, 5, "x") },
  ];
  for (const g of polygoonGevallen) {
    const r = eenGeval(lSchijf({ edgeLoads: [{ plateId: 1, caseId: 1, ...g.el }] }));
    const som = reactieSom(r, lNodes);
    const schaal = Math.max(Math.abs(g.res.fx), Math.abs(g.res.fz));
    checkRel(`${g.naam}: ΣRz`, som.rz, -g.res.fz, 1e-9, schaal);
    checkRel(`${g.naam}: ΣRx`, som.rx, -g.res.fx, 1e-9, schaal);
    checkRel(`${g.naam}: momentevenwicht`, som.m, -g.res.m, 1e-9, schaal * 2000);
  }
  weigert("belast deel omgekeerd (startFrac ≥ endFrac): weigering",
    () => eenGeval(wand({ edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: -5, startFrac: 0.6, endFrac: 0.4 }] })), /^Plaat 1: een randlast heeft een belast deel/);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Consistentie: deellasten met een grens midden in een element");
{
  const vol = eenGeval(wand({ edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: -10, dir: "z" }] }));
  // 0,3·2000 = 600 mm: midden in het element 500–1000.
  const tweeDelen = eenGeval(wand({ edgeLoads: [
    { plateId: 1, caseId: 1, edge: "top", p: -10, startFrac: 0, endFrac: 0.3, dir: "z" },
    { plateId: 1, caseId: 1, edge: "top", p: -10, startFrac: 0.3, endFrac: 1, dir: "z" },
  ] }));
  for (const id of [6, 7, 8, 9, 10]) {
    checkRel(`uz knoop ${id}: [0; 0,3] + [0,3; 1] ≡ volle last`, tweeDelen.displacements.get(id).uz, vol.displacements.get(id).uz, 1e-10);
  }
  const trap = eenGeval(wand({ edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: -20, pStart: -10, pEnd: -30, dir: "z" }] }));
  // Waarde op 0,3: −10 + (−20)·0,3 = −16.
  const trapDelen = eenGeval(wand({ edgeLoads: [
    { plateId: 1, caseId: 1, edge: "top", p: -13, pStart: -10, pEnd: -16, startFrac: 0, endFrac: 0.3, dir: "z" },
    { plateId: 1, caseId: 1, edge: "top", p: -23, pStart: -16, pEnd: -30, startFrac: 0.3, endFrac: 1, dir: "z" },
  ] }));
  for (const id of [6, 7, 9]) {
    checkRel(`uz knoop ${id}: gesplitst trapezium ≡ volle trapeziumlast`, trapDelen.displacements.get(id).uz, trap.displacements.get(id).uz, 1e-10);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Puntlast op een plaatrand");
{
  const nodes = wandKnopen();
  const F = -10000; // N (−10 kN)
  // (a) Op een randknoop: posFrac 0,5 van de bovenrand = x 1000 = knoop 9.
  const opKnoop = eenGeval(wand({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.5, fz: F, caseId: 1 }] }));
  const knooplast = eenGeval(wand({ pointLoads: [{ nodeId: 9, fz: F, caseId: 1 }] }));
  for (const id of [6, 7, 8, 9, 10]) {
    checkRel(`op een knoop: uz knoop ${id} ≡ knooplast`, opKnoop.displacements.get(id).uz, knooplast.displacements.get(id).uz, 1e-12);
  }
  // (b) Tussen twee knopen: posFrac 0,375 = x 750, midden tussen 500 en 1000.
  const tussen = eenGeval(wand({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.375, fz: F, caseId: 1 }] }));
  const verdeeld = eenGeval(wand({ pointLoads: [{ nodeId: 8, fz: F / 2, caseId: 1 }, { nodeId: 9, fz: F / 2, caseId: 1 }] }));
  for (const id of [6, 7, 8, 9, 10]) {
    checkRel(`tussen knopen: uz knoop ${id} ≡ ½F op 500 en ½F op 1000`, tussen.displacements.get(id).uz, verdeeld.displacements.get(id).uz, 1e-12);
  }
  // Niet in het midden: x = 600 → t = 0,2 → 0,8·F op 500 en 0,2·F op 1000.
  const scheef = eenGeval(wand({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.3, fz: F, caseId: 1 }] }));
  const scheefVerdeeld = eenGeval(wand({ pointLoads: [{ nodeId: 8, fz: 0.8 * F, caseId: 1 }, { nodeId: 9, fz: 0.2 * F, caseId: 1 }] }));
  checkRel("x = 600: uz knoop 8 ≡ 0,8·F op 500 + 0,2·F op 1000", scheef.displacements.get(8).uz, scheefVerdeeld.displacements.get(8).uz, 1e-12);
  const som = reactieSom(scheef, nodes);
  checkRel("x = 600: ΣRz = −F", som.rz, -F, 1e-9);
  checkRel("x = 600: Σx·Rz = −x·F", som.m, -600 * F, 1e-9, 600 * Math.abs(F));
  // (c) Spiegelsymmetrie: dezelfde last op 0,3 en op 0,7.
  const spiegel = eenGeval(wand({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.7, fz: F, caseId: 1 }] }));
  checkRel("symmetrie: uz(knoop 6) bij 0,3 ≡ uz(knoop 7) bij 0,7", scheef.displacements.get(6).uz, spiegel.displacements.get(7).uz, 1e-9);
  checkRel("symmetrie: ux(knoop 6) bij 0,3 ≡ −ux(knoop 7) bij 0,7", scheef.displacements.get(6).ux, -spiegel.displacements.get(7).ux, 1e-9);
  // (d) Horizontaal op rand-index 1 (rechterzijde, van (2000,0) omhoog).
  const hor = eenGeval(wand({ edgePointLoads: [{ plateId: 1, edgeIndex: 1, posFrac: 0.5, fx: 6000, caseId: 1 }] }));
  const somH = reactieSom(hor, nodes);
  checkRel("horizontaal op rand 2: ΣRx = −Fx", somH.rx, -6000, 1e-9);
  checkRel("horizontaal op rand 2: Σ(x·Rz − z·Rx) = z·Fx", somH.m, 1500 * 6000, 1e-9, 1500 * 6000);
  // (e) Polygoon: rand-index 2 van (2000,1000) naar (1000,1000), posFrac 0,2 → x 1800.
  const lNodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  const poly = eenGeval(lSchijf({ edgePointLoads: [{ plateId: 1, edgeIndex: 2, posFrac: 0.2, fz: -7000, caseId: 1 }] }));
  const somP = reactieSom(poly, lNodes);
  checkRel("polygoon: ΣRz = 7 kN", somP.rz, 7000, 1e-9);
  checkRel("polygoon: momentevenwicht (x = 1800, vanaf hoek 3)", somP.m, 1800 * 7000, 1e-9, 1800 * 7000);
  weigert("puntlast op de plaatrand zonder posFrac: weigering",
    () => eenGeval(wand({ edgePointLoads: [{ plateId: 1, edge: "top", fz: F, caseId: 1 }] })), /^Plaat 1: een puntlast op de plaatrand heeft geen positie/);
  weigert("benoemde rand op een polygoon, ook voor een puntlast: weigering",
    () => eenGeval(lSchijf({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.5, fz: -1000, caseId: 1 }] })), /^Plaat 1: een puntlast op de plaatrand — een benoemde rand/);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Staafeinde op een plaatrand tussen twee randknopen");
// Wand 4 × 3 m, meshSize 1000; randknopen op de bovenrand bij x = 0, 1000,
// 2000, 3000, 4000. Knopen 8 (1000) en 9 (2000) liggen daarop; knoop 10
// (1500) ligt er MIDDENIN.
function wand4(extra = {}) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * 1000, z: 0 });
  nodes.push({ id: 6, x: 0, z: 3000 }, { id: 7, x: 4000, z: 3000 }, { id: 8, x: 1000, z: 3000 }, { id: 9, x: 2000, z: 3000 });
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 1 || n.id === 5 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 1000 }],
    cases: [{ id: 1, name: "G" }],
    ...extra,
  };
}
const KOLOM = { E: 210000, A: 5380, I: 3.692e7 };
{
  // (a) Kolom op x = 1500 met een rol bovenin (x vast) en P = −20 kN.
  const basis = wand4();
  const model = wand4({
    nodes: [...basis.nodes, { id: 10, x: 1500, z: 3000 }, { id: 11, x: 1500, z: 5000 }],
    beams: [{ id: 1, from: 10, to: 11, ...KOLOM }],
    supports: [...basis.supports, { nodeId: 11, type: "xRoller" }],
    pointLoads: [{ nodeId: 11, fz: -20000, caseId: 1 }],
  });
  const r = eenGeval(model);
  const som = reactieSom(r, model.nodes);
  checkRel("kolom op x = 1500: ΣRz = 20 kN (was: Matrix is singular)", som.rz, 20000, 1e-9);
  checkTrue("kolom: de rol bovenin draagt geen horizontale kracht", Math.abs(r.reactions.get(11).fx) < 1e-6 * 20000, `${r.reactions.get(11).fx} N`);
  const d = (id) => r.displacements.get(id);
  checkRel("compatibiliteit: uz(10) = ½·uz(8) + ½·uz(9)", d(10).uz, 0.5 * d(8).uz + 0.5 * d(9).uz, 1e-12);
  checkRel("compatibiliteit: ux(10) = ½·ux(8) + ½·ux(9)", d(10).ux, 0.5 * d(8).ux + 0.5 * d(9).ux, 1e-12, Math.abs(d(10).uz));
  // (b) Dezelfde wand met een randpuntlast op dezelfde plek: de wand hoort
  //     precies hetzelfde te zien. De kolom brengt P axiaal over en is aan
  //     beide einden vrij om te draaien, dus zonder dwarskracht.
  const puntlast = eenGeval(wand4({ edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.375, fz: -20000, caseId: 1 }] }));
  for (const id of [6, 7, 8, 9]) {
    checkRel(`kolom ≡ randpuntlast: uz knoop ${id}`, d(id).uz, puntlast.displacements.get(id).uz, 1e-9);
  }
  // (c) Horizontaal: staaf LANGS de bovenrand van hoek 6 (0) tot knoop 12
  //     (1250), gesplitst op randknoop 8; knoop 12 zit op t = 0,25 tussen 8 en 9.
  const hor = wand4({
    nodes: [...basis.nodes, { id: 12, x: 1250, z: 3000 }],
    beams: [{ id: 1, from: 6, to: 12, ...KOLOM }],
    pointLoads: [{ nodeId: 12, fx: 10000, caseId: 1 }],
  });
  const rh = eenGeval(hor);
  const somH = reactieSom(rh, hor.nodes);
  checkRel("randstaaf tot x = 1250, Fx = 10 kN: ΣRx = −10 kN", somH.rx, -10000, 1e-9);
  checkRel("randstaaf: momentevenwicht Σ(x·Rz − z·Rx) = z·Fx", somH.m, 3000 * 10000, 1e-9, 3000 * 10000);
  const dh = (id) => rh.displacements.get(id);
  checkRel("compatibiliteit: ux(12) = 0,75·ux(8) + 0,25·ux(9)", dh(12).ux, 0.75 * dh(8).ux + 0.25 * dh(9).ux, 1e-12);
  // (d) Polygoon: kolom op (250, 2000), op rand 5 tussen (0,2000) en (500,2000).
  const lBasis = lSchijf();
  const lKolom = lSchijf({
    nodes: [...lBasis.nodes, { id: 7, x: 500, z: 2000 }, { id: 8, x: 250, z: 2000 }, { id: 9, x: 250, z: 3000 }],
    beams: [{ id: 1, from: 8, to: 9, ...KOLOM }],
    supports: [...lBasis.supports, { nodeId: 9, type: "xRoller" }],
    pointLoads: [{ nodeId: 9, fz: -10000, caseId: 1 }],
  });
  const rl = eenGeval(lKolom);
  checkRel("polygoon, kolom op x = 250: ΣRz = 10 kN", reactieSom(rl, lKolom.nodes).rz, 10000, 1e-9);
  const dl = (id) => rl.displacements.get(id);
  checkRel("polygoon: uz(8) = ½·uz(hoek 6) + ½·uz(7)", dl(8).uz, 0.5 * dl(6).uz + 0.5 * dl(7).uz, 1e-12);
  // (e) Weigering: een starre oplegging op de gekoppelde knoop.
  weigert("oplegging op een gekoppelde knoop: weigering met reden",
    () => eenGeval({ ...model, supports: [...model.supports, { nodeId: 10, type: "pinned" }] }),
    /^Plaat 1: de oplegging op knoop 10 staat op een staafknoop die tussen twee rekenknopen/);
  // (f) Tweede orde: dezelfde koppeling in het niet-lineaire pad.
  const nl = solveAllCasesNonlinear({ ...model, cases: [{ id: 1, name: "G" }] });
  const combo = { id: 1, name: "1,5·G", type: "uls", formula: "1,5·G", factors: new Map([[1, 1.5]]) };
  const r2 = combineResults(combo, nl.perCase);
  checkRel("tweede orde, 1,5·G: ΣRz = 30 kN", reactieSom(r2, model.nodes).rz, 30000, 1e-6);
  const d2 = (id) => r2.displacements.get(id);
  checkRel("tweede orde: uz(10) = ½·uz(8) + ½·uz(9)", d2(10).uz, 0.5 * d2(8).uz + 0.5 * d2(9).uz, 1e-12);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Combinaties: plaatspanningen per elementindex");
{
  const lasten = (s1, s2, s3, caseIds) => ({
    edgeLoads: [
      { plateId: 1, caseId: caseIds[0], edge: "top", p: -20 * s1, pStart: -10 * s1, pEnd: -30 * s1, startFrac: 0.2, endFrac: 0.85, dir: "z" },
      { plateId: 1, caseId: caseIds[2], edge: "left", p: 8 * s3, startFrac: 0.5, endFrac: 1, dir: "x" },
    ],
    edgePointLoads: [{ plateId: 1, edge: "top", posFrac: 0.375, fz: -10000 * s2, caseId: caseIds[1] }],
  });
  const perGeval = solveAllCases(wand({
    ...lasten(1, 1, 1, [1, 2, 3]),
    cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }, { id: 3, name: "W" }],
  })).perCase;
  const factoren = new Map([[1, 1.35], [2, 1.5], [3, 0.9]]);
  const combi = combineResults({ id: 7, name: "combi", type: "uls", formula: "", factors: factoren }, perGeval);
  const direct = eenGeval(wand(lasten(1.35, 1.5, 0.9, [1, 1, 1])));
  const c = combi.plateElements[0].elements, dEl = direct.plateElements[0].elements;
  checkTrue("zelfde aantal elementen in elk geval en in de combinatie",
    c.length === dEl.length && [1, 2, 3].every((g) => perGeval.get(g).plateElements[0].elements.length === c.length), `${c.length}`);
  checkTrue("elementvolgorde gelijk (ids en hoeken)",
    c.every((e, i) => e.elementId === dEl[i].elementId && JSON.stringify(e.corners) === JSON.stringify(dEl[i].corners)));
  let schaal = 0;
  for (const e of dEl) schaal = Math.max(schaal, Math.abs(e.sigmaX), Math.abs(e.sigmaY), Math.abs(e.tauXY));
  let maxFout = 0;
  for (let i = 0; i < c.length; i++) {
    for (const k of ["sigmaX", "sigmaY", "tauXY", "vonMises"]) maxFout = Math.max(maxFout, Math.abs(c[i][k] - dEl[i][k]));
  }
  checkTrue("σx, σy, τxy en von Mises: combinatie ≡ gefactoreerde berekening (1e-9·max|σ|)",
    maxFout <= 1e-9 * schaal, `max |Δ| = ${maxFout.toExponential(2)} N/mm² bij max|σ| = ${schaal.toFixed(4)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] MCP-route ≡ app-route (polygoon, trapezium, randpuntlast en kolom)");
function lUiModel(lastExtra = []) {
  return {
    nodes: [
      ...L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z })),
      { id: 8, x: 250, z: 2000 }, { id: 9, x: 250, z: 3000 },
    ],
    beams: [{ id: 1, from: 8, to: 9, material: "S235", profile: "HEA160" }],
    supports: [
      { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
      { nodeId: 6, type: "xRoller" }, { nodeId: 9, type: "xRoller" },
    ],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, meshCache: L_CACHE }],
    loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }],
    loads: [
      { id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edgeIndex: 4, q: -8, qStart: -12, qEnd: -4, startFrac: 0.25, endFrac: 0.75, qDir: "z" },
      { id: 2, type: "pointForce", caseId: 2, plateId: 1, edgeIndex: 2, posFrac: 0.2, fz: -7 },
      { id: 3, type: "pointForce", caseId: 2, nodeId: 9, fz: -10 },
      ...lastExtra,
    ],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}
{
  const model = lUiModel();
  const mi = bouwMultiInput(model);
  checkTrue("mapping: randpuntlast in edgePointLoads, kN → N", mi.edgePointLoads?.length === 1 && mi.edgePointLoads[0].fz === -7000 && mi.edgePointLoads[0].posFrac === 0.2);
  checkTrue("mapping: trapezium en deellast gaan mee",
    mi.edgeLoads[0].pStart === -12 && mi.edgeLoads[0].pEnd === -4 && mi.edgeLoads[0].startFrac === 0.25 && mi.edgeLoads[0].endFrac === 0.75);
  checkTrue("mapping zonder randpuntlast: geen edgePointLoads-sleutel (byte-gelijk)",
    !("edgePointLoads" in bouwMultiInput({ ...model, loads: model.loads.filter((l) => l.id !== 2) })));
  const app = solveAllCases(mi).perCase;
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model } });
  checkTrue("MCP solve slaagt", antw.ok === true, antw.error?.melding ?? "");
  for (const geval of [1, 2]) {
    for (const knoop of [1, 2, 6, 9]) {
      const mcp = antw.result?.per_case?.[String(geval)]?.reactions?.[String(knoop)];
      const ref = app.get(geval).reactions.get(knoop);
      checkRel(`geval ${geval}, knoop ${knoop}: MCP Rz ≡ app (kN)`, mcp?.fz ?? NaN, ref.fz / 1000, 1e-12, Math.max(1e-9, Math.abs(ref.fz / 1000)));
    }
  }
  const res1 = lastResultante(L_HOEKEN[4], L_HOEKEN[5], 0.25, 0.75, -12, -4, "z");
  const som1 = Object.values(antw.result.per_case["1"].reactions).reduce((s, x) => s + x.fz, 0);
  checkRel("MCP geval 1: ΣRz = −∫p = 4 kN", som1, -res1.fz / 1000, 1e-9);
  const som2 = Object.values(antw.result.per_case["2"].reactions).reduce((s, x) => s + x.fz, 0);
  checkRel("MCP geval 2: ΣRz = 7 + 10 kN (randpuntlast + kolom)", som2, 17, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Droogloop: plaatlasten");
{
  const geldig = valideerModel(lUiModel());
  checkTrue("geldig model met randpuntlast, trapezium en kolom: ok", geldig.ok === true, JSON.stringify(geldig.errors));
  const met = (extra) => valideerModel(lUiModel([extra]));
  const zonderPos = met({ id: 9, type: "pointForce", caseId: 1, plateId: 1, edgeIndex: 0, fz: -1 });
  checkTrue("randpuntlast zonder posFrac: fout", zonderPos.errors.some((e) => /Last 9 is een puntlast op plaat 1 zonder positie/.test(e)), JSON.stringify(zonderPos.errors));
  const tweePlekken = met({ id: 9, type: "pointForce", caseId: 1, plateId: 1, edgeIndex: 0, posFrac: 0.5, nodeId: 1, fz: -1 });
  checkTrue("randpuntlast die ook een knoop noemt: fout", tweePlekken.errors.some((e) => /Last 9 is een puntlast op plaat 1 én noemt een knoop/.test(e)), JSON.stringify(tweePlekken.errors));
  const omgekeerd = met({ id: 9, type: "edgeLoad", caseId: 1, plateId: 1, edgeIndex: 0, q: -1, startFrac: 0.7, endFrac: 0.2 });
  checkTrue("randlast met omgekeerd deel: fout", omgekeerd.errors.some((e) => /Last 9 \(randlast\): het belaste deel begint niet vóór zijn einde/.test(e)), JSON.stringify(omgekeerd.errors));
  const zonderPlaat = met({ id: 9, type: "pointForce", caseId: 1, nodeId: 1, edgeIndex: 0, fz: -1 });
  checkTrue("randadres zonder plaat: fout", zonderPlaat.errors.some((e) => /Last 9 noemt een plaatrand/.test(e)), JSON.stringify(zonderPlaat.errors));
  const moment = met({ id: 9, type: "pointMoment", caseId: 1, plateId: 1, edgeIndex: 0, posFrac: 0.5, my: 1 });
  checkTrue("moment op een plaat: fout", moment.errors.some((e) => /Last 9 \(type "pointMoment"\) noemt een plaat/.test(e)), JSON.stringify(moment.errors));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
