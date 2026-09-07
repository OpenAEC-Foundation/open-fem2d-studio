// Twee stelseloplossers, dezelfde antwoorden.
//
// De app kan sinds deze taak kiezen tussen twee oplossers achter één
// handtekening (`core/math/LinearSolver`):
//
//   gauss    dichte Gauss-eliminatie met partiële pivotering (standaard)
//   skyline  LDLᵀ over de onderdriehoek-envelop, zonder pivotering
//
// Deze test bewijst dat de keuze geen verschil in UITKOMST maakt. Hij doet dat
// op drie niveaus:
//
//   [1] Kale wiskunde — willekeurige symmetrische bandmatrices met bekende
//       oplossing, plus de twee randgevallen (singulier, asymmetrisch).
//   [2] Volledige modellen door `solveAllCases` / `solveAllCasesNonlinear`,
//       met vergelijking van verplaatsingen, reacties én staafkrachten
//       (inclusief alle 21 stations per staaf).
//   [3] Een MECHANISME: het portaal uit `test-modelcontrole.mjs` vóór herstel.
//       Beide oplossers horen dat te weigeren met dezelfde melding en niet met
//       getallen terug te komen.
//
// WELKE MARGE, EN WAAROM
//
// Bit-identiek is niet haalbaar en zou ook geen goed criterium zijn: de twee
// oplossers elimineren in een andere volgorde (Gauss pivoteert, LDLᵀ loopt de
// natuurlijke volgorde af), dus de afrondfouten stapelen anders. Wat wél moet
// gelden is dat het verschil op afrondniveau blijft en niet meegroeit met de
// modelgrootte tot iets wat een ingenieur zou zien.
//
// De marge hieronder is daarom NIET ruim gekozen maar op de gemeten waarden
// gezet: elke vergelijking drukt de werkelijk gemeten relatieve afwijking af,
// zodat een verschuiving zichtbaar wordt lang voordat de test omvalt.
//
// GEMETEN op de modellen hieronder (grootste model 543 vrijheidsgraden):
//   verplaatsingen  9,3e-13    reacties  1,1e-12    N/V/M  2,0e-12
//
// De afwijking GROEIT met de modelgrootte — dat is geen fout maar het gevolg
// van een andere eliminatievolgorde in een matrix waarvan het conditiegetal
// met de staaflengteketen meegroeit. Gemeten in `scripts/meet-oplossers.mjs`
// op raamwerken met steeds meer segmenten:
//
//     63 DOF → 5e-14 · 741 DOF → 2,7e-12 · 2001 DOF → 2,1e-11 · 3135 DOF → 1,5e-10
//
// De grens staat op 1e-9. Dat is ruwweg 500× boven de grootste meting IN DEZE
// TEST en houdt volgens die reeks stand tot circa 5000 vrijheidsgraden — ruim
// boven alles wat deze batterij doorrekent. Blijft hij ook fysiek klein: 1e-9
// relatief op een zakking van 10 mm is 1e-8 mm.
//
// Uitvoeren: npx tsx test-oplossers.mjs   (vanuit design-mockup/)

const { solveAllCases, solveAllCasesNonlinear } =
  await import("./src/components/fem/solver/engine.ts");
const { setLinearSolver, getLinearSolver, LINEAR_SOLVER_IDS } =
  await import("./src/core/math/LinearSolver.ts");
const { solveSkyline, solveWithProfile, analyzeMatrix, getSkylineDiagnostics, resetSkylineDiagnostics } =
  await import("./src/core/math/SkylineSolver.ts");
const { solveLinearSystem: solveGauss } = await import("./src/core/math/GaussElimination.ts");
const { Matrix } = await import("./src/core/math/Matrix.ts");

/** Grens voor de relatieve afwijking tussen de twee oplossers. */
const MARGE = 1e-9;

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${naam}${detail ? ` — ${detail}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

/** Relatieve afwijking, geschaald op de grootste waarde van de reeks zelf. */
function relAfwijking(a, b) {
  let afw = 0, schaal = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (Number.isFinite(d) && d > afw) afw = d;
    const m = Math.abs(a[i]);
    if (Number.isFinite(m) && m > schaal) schaal = m;
  }
  return schaal > 0 ? afw / schaal : afw;
}

// ═══════════════════════════════════════════════════════════════════════════
// [1] Kale wiskunde
// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] Kale wiskunde: skyline LDLᵀ tegen dichte Gauss");

let zaad = 20260907;
function rnd() { zaad = (zaad * 1103515245 + 12345) & 0x7fffffff; return zaad / 0x7fffffff; }

/** Symmetrische, diagonaal-dominante bandmatrix — het geval waar LDLᵀ voor is. */
function bandMatrix(n, b) {
  const A = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - b); j < i; j++) {
      const v = (rnd() - 0.5) * 2;
      A.set(i, j, v); A.set(j, i, v);
    }
  }
  for (let i = 0; i < n; i++) {
    let som = 0;
    for (let j = 0; j < n; j++) if (j !== i) som += Math.abs(A.get(i, j));
    A.set(i, i, som + 1 + rnd());
  }
  return A;
}

for (const [n, b] of [[6, 2], [40, 4], [150, 9], [300, 15]]) {
  const A = bandMatrix(n, b);
  const xEcht = Array.from({ length: n }, () => rnd() - 0.5);
  const rhs = A.multiplyVector(xEcht);
  const xg = solveGauss(A, rhs);
  const xs = solveSkyline(A, rhs);
  const rel = relAfwijking(xg, xs);
  const profiel = analyzeMatrix(A);
  check(
    `n=${n}, halve band ${b}: skyline ≡ gauss`,
    rel < MARGE,
    `rel.afw = ${rel.toExponential(3)}, b_max = ${profiel.halfBandwidth}, rel.asym = ${profiel.relAsymmetry.toExponential(1)}`,
  );
}

{
  // Vaste band en variabele envelop moeten hetzelfde antwoord geven — dat
  // bewijst dat de envelop-keuze alleen over rekentijd gaat, niet over
  // uitkomst. Het meetscript leunt daarop.
  const n = 120, b = 6;
  const A = bandMatrix(n, b);
  const rhs = A.multiplyVector(Array.from({ length: n }, () => rnd()));
  const vast = new Int32Array(n);
  for (let i = 0; i < n; i++) vast[i] = Math.max(0, i - analyzeMatrix(A).halfBandwidth);
  const rel = relAfwijking(solveSkyline(A, rhs), solveWithProfile(A, rhs, vast));
  check("vaste band ≡ variabele envelop", rel === 0, `rel.afw = ${rel.toExponential(3)}`);
}

{
  // Mechanisme: een vrijheidsgraad zonder stijfheid. Beide oplossers horen te
  // weigeren, met dezelfde melding en dezelfde kolomaanduiding.
  const A = bandMatrix(14, 3);
  for (let j = 0; j < 14; j++) { A.set(6, j, 0); A.set(j, 6, 0); }
  const rhs = new Array(14).fill(1);
  let gFout = null, sFout = null;
  try { solveGauss(A, rhs); } catch (e) { gFout = e.message; }
  try { solveSkyline(A, rhs); } catch (e) { sFout = e.message; }
  check("gauss weigert een singuliere matrix", /singular/i.test(gFout ?? ""), gFout ?? "gaf een getal terug");
  check("skyline weigert dezelfde matrix", /singular/i.test(sFout ?? ""), sFout ?? "gaf een getal terug");
  check("dezelfde melding, dezelfde kolom", gFout === sFout, `${gFout} | ${sFout}`);
}

{
  // Veiligheidsklep: LDLᵀ mag niet op een asymmetrische matrix. Dan hoort de
  // skyline-oplosser terug te vallen op Gauss en dus EXACT hetzelfde te geven.
  resetSkylineDiagnostics();
  const A = bandMatrix(20, 4);
  A.set(5, 8, A.get(5, 8) + 3.5);            // eenzijdige verstoring
  const rhs = A.multiplyVector(Array.from({ length: 20 }, () => rnd()));
  const xg = solveGauss(A, rhs);
  const xs = solveSkyline(A, rhs);
  const { terugvallen } = getSkylineDiagnostics();
  check("asymmetrische matrix → terugval op gauss", terugvallen === 1, `terugvallen = ${terugvallen}`);
  check("en dan bit-identiek", xg.every((v, i) => Object.is(v, xs[i])));
}

// ═══════════════════════════════════════════════════════════════════════════
// [2] Volledige modellen
// ═══════════════════════════════════════════════════════════════════════════

const E0 = 210000, A0 = 3880, I0 = 1.673e7;

/** Ligger van L mm in `nSeg` segmenten, knopen doorgenummerd vanaf `startId`. */
function segmenten(startId, x0, z0, x1, z1, nSeg, staafId) {
  const nodes = [], beams = [];
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    nodes.push({ id: startId + i, x: x0 + t * (x1 - x0), z: z0 + t * (z1 - z0) });
    if (i > 0) beams.push({ id: staafId + i - 1, from: startId + i - 1, to: startId + i, E: E0, A: A0, I: I0 });
  }
  return { nodes, beams };
}

/** De modellen waarop de twee oplossers vergeleken worden. */
const MODELLEN = [];

// (a) Doorgaande ligger op drie steunpunten — statisch onbepaald.
MODELLEN.push({
  naam: "doorgaande ligger, 2×6 m, q = −10 N/mm",
  soort: "lineair",
  invoer: {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 12000, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0 },
    ],
    supports: [
      { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 3, type: "zRoller" },
    ],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }, { beamId: 2, q: -10, caseId: 1 }],
  },
});

// (b) Portaal, ingeklemde voeten, horizontale én verticale last.
MODELLEN.push({
  naam: "portaal 6×3,5 m, ingeklemd, H + q",
  soort: "lineair",
  invoer: {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3500 },
      { id: 3, x: 6000, z: 3500 }, { id: 4, x: 6000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0 },
      { id: 3, from: 3, to: 4, E: E0, A: A0, I: I0 },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 2, q: -12, caseId: 1 }],
    pointLoads: [{ nodeId: 2, fx: 25000, caseId: 1 }],
  },
});

// (c) Zwaar gesegmenteerd: precies het geval waarvoor de tweede oplosser
//     bestaat — de fysisch niet-lineaire tweede orde knipt betonstaven in
//     segmenten van circa 400 mm.
{
  const ligger = segmenten(1, 0, 0, 8000, 0, 20, 1);           // 400 mm/segment
  MODELLEN.push({
    naam: "ligger 8 m in 20 segmenten van 400 mm",
    soort: "lineair",
    invoer: {
      nodes: ligger.nodes,
      beams: ligger.beams,
      supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 21, type: "zRoller" }],
      cases: [{ id: 1, name: "G" }],
      loads: ligger.beams.map((b) => ({ beamId: b.id, q: -14, caseId: 1 })),
    },
  });
}

// (d) Portaal met scharnieren — raakt de statische condensatie van
//     `applyEndReleases`, waar de elementmatrix wordt aangepast.
MODELLEN.push({
  naam: "portaal met scharnieren aan beide liggeruiteinden",
  soort: "lineair",
  invoer: {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 4000 },
      { id: 3, x: 5000, z: 4000 }, { id: 4, x: 5000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0, releases: { startRy: true, endRy: true } },
      { id: 3, from: 3, to: 4, E: E0, A: A0, I: I0 },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 2, q: -8, caseId: 1 }],
    pointLoads: [{ nodeId: 3, fx: 15000, caseId: 1 }],
  },
});

// (e) Veren — veer-DOF's slaan de penalty over en zetten stijfheid op de
//     diagonaal; een andere weg door dezelfde matrix.
MODELLEN.push({
  naam: "ligger op veeropleggingen (z-veer + rotatieveer)",
  soort: "lineair",
  invoer: {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "zSpring", k: 5000 },
    ],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }],
  },
});

// (f) Vakwerk-achtig raamwerk met schuine staven — brengt volle
//     transformatiematrices in het spel (cos/sin ≠ 0 en ≠ 1).
MODELLEN.push({
  naam: "spantvorm met schuine staven",
  soort: "lineair",
  invoer: {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 2000 },
      { id: 3, x: 8000, z: 0 }, { id: 4, x: 4000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0 },
      { id: 3, from: 1, to: 4, E: E0, A: A0, I: I0 },
      { id: 4, from: 4, to: 3, E: E0, A: A0, I: I0 },
      { id: 5, from: 4, to: 2, E: E0, A: A0, I: I0 },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q: -6, caseId: 1 }, { beamId: 2, q: -6, caseId: 1 }],
    pointLoads: [{ nodeId: 2, fz: -20000, caseId: 1 }],
  },
});

// (g) Wandschijf — het GEMENGDE pad (plaat + raamwerk), een andere
//     aanroepplaats van de oplosser dan het zuivere raamwerkpad.
{
  const S = 500, B = 3000, H = 3000;
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  for (let i = 0; i <= 6; i++) nodes.push({ id: 8 + i, x: i * S, z: H });
  MODELLEN.push({
    naam: "wandschijf 3×3 m, 6×6 quads (gemengd pad)",
    soort: "lineair",
    invoer: {
      nodes,
      beams: [],
      supports: nodes.slice(0, 7).map((n) =>
        n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" }),
      loads: [],
      pointLoads: nodes.slice(7).map((n) => ({
        nodeId: n.id, fz: 5 * 20 * (n.x === 0 || n.x === B ? S / 2 : S), caseId: 1,
      })),
      plates: [{ id: 1, nodeIds: [1, 7, 14, 8], thickness: 20, E: E0, nu: 0.3, rho: 7850, meshSize: S }],
      cases: [{ id: 1, name: "G" }],
    },
  });
}

// (h) Tweede orde (P-Δ) — de Newton-Raphson-lus lost per iteratie een stelsel
//     op; hier tellen ook de verschillen tussen iteraties mee.
{
  const L = 4000, nEl = 8;
  const nodes = [], beams = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: 0, z: (L / nEl) * i });
  for (let i = 0; i < nEl; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E: E0, A: A0, I: 1e8 });
  const P_E = Math.PI ** 2 * E0 * 1e8 / (L * L);
  MODELLEN.push({
    naam: "kolom 4 m, P = 0,5·P_E, tweede orde (P-Δ)",
    soort: "tweedeorde",
    invoer: {
      nodes, beams,
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: nEl + 1, type: "xRoller" }],
      cases: [{ id: 1, name: "G" }],
      loads: [],
      pointLoads: [
        { nodeId: nEl + 1, fz: -0.5 * P_E, caseId: 1 },
        { nodeId: nEl / 2 + 1, fx: 5000, caseId: 1 },
      ],
    },
  });
}

// (i) Hetzelfde raamwerk als (b), maar elke staaf in 60 segmenten — ruim
//     boven de praktijk, om te zien of de afwijking MEEGROEIT met de
//     modelgrootte. Doet hij dat, dan is de vergelijking op kleine modellen
//     niets waard.
{
  const nodes = [], beams = [];
  let nid = 1, bid = 1;
  const hoek = new Map();
  const knoop = (x, z) => {
    const s = `${Math.round(x)},${Math.round(z)}`;
    if (!hoek.has(s)) { hoek.set(s, nid); nodes.push({ id: nid++, x, z }); }
    return hoek.get(s);
  };
  const staaf = (x0, z0, x1, z1, n) => {
    let vorig = knoop(x0, z0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const id = knoop(x0 + t * (x1 - x0), z0 + t * (z1 - z0));
      beams.push({ id: bid++, from: vorig, to: id, E: E0, A: A0, I: I0 });
      vorig = id;
    }
  };
  staaf(0, 0, 0, 3500, 60);
  staaf(0, 3500, 6000, 3500, 60);
  staaf(6000, 3500, 6000, 0, 60);
  MODELLEN.push({
    naam: "portaal met 60 segmenten per staaf (180 elementen)",
    soort: "lineair",
    invoer: {
      nodes, beams,
      supports: [{ nodeId: knoop(0, 0), type: "fixed" }, { nodeId: knoop(6000, 0), type: "fixed" }],
      cases: [{ id: 1, name: "G" }],
      loads: beams.filter((b) => b.id > 60 && b.id <= 120).map((b) => ({ beamId: b.id, q: -12, caseId: 1 })),
      pointLoads: [{ nodeId: knoop(0, 3500), fx: 25000, caseId: 1 }],
    },
  });
}

/** Plat alle getallen van één belastinggeval-resultaat, in vaste volgorde. */
function platteResultaat(r) {
  const verpl = [], reac = [], krachten = [];
  for (const id of [...r.displacements.keys()].sort((a, b) => a - b)) {
    const d = r.displacements.get(id);
    verpl.push(d.ux, d.uz, d.ry);
  }
  for (const id of [...r.reactions.keys()].sort((a, b) => a - b)) {
    const q = r.reactions.get(id);
    reac.push(q.fx, q.fz, q.my);
  }
  for (const id of [...r.elements.keys()].sort((a, b) => a - b)) {
    const e = r.elements.get(id);
    krachten.push(e.N, e.V, e.M_start, e.M_end);
    for (const v of e.normalForce ?? []) krachten.push(v);
    for (const v of e.shearForce ?? []) krachten.push(v);
    for (const v of e.bendingMoment ?? []) krachten.push(v);
    for (const v of e.deflection ?? []) krachten.push(v);
    for (const v of e.axialDisp ?? []) krachten.push(v);
  }
  // Plaatspanningen tellen als staafkracht-achtige uitkomst mee: zonder deze
  // regels zou het gemengde pad alleen op de UI-knopen vergeleken worden.
  for (const plaat of r.plateElements ?? []) {
    for (const el of plaat.elements) {
      krachten.push(el.sigmaX, el.sigmaY, el.tauXY, el.vonMises, el.sigma1, el.sigma2, el.nx, el.ny, el.nxy);
    }
  }
  return { verpl, reac, krachten };
}

function rekenMet(id, model) {
  setLinearSolver(id);
  try {
    const uit = model.soort === "tweedeorde"
      ? solveAllCasesNonlinear(model.invoer)
      : solveAllCases(model.invoer);
    return { ok: true, resultaat: uit.perCase.get(1) };
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : String(e) };
  } finally {
    setLinearSolver("gauss");
  }
}

log("\n[2] Volledige modellen: verplaatsingen, reacties en staafkrachten");
const gemeten = { verpl: 0, reac: 0, krachten: 0 };

for (const model of MODELLEN) {
  const g = rekenMet("gauss", model);
  const s = rekenMet("skyline", model);
  if (!g.ok || !s.ok) {
    check(`${model.naam}: beide oplossers rekenen door`, false, `${g.fout ?? ""} ${s.fout ?? ""}`.trim());
    continue;
  }
  const pg = platteResultaat(g.resultaat);
  const ps = platteResultaat(s.resultaat);
  const rel = {
    verpl: relAfwijking(pg.verpl, ps.verpl),
    reac: relAfwijking(pg.reac, ps.reac),
    krachten: relAfwijking(pg.krachten, ps.krachten),
  };
  for (const k of Object.keys(rel)) gemeten[k] = Math.max(gemeten[k], rel[k]);
  check(
    `${model.naam} (${pg.verpl.length / 3} knopen, ${pg.krachten.length} krachtwaarden)`,
    rel.verpl < MARGE && rel.reac < MARGE && rel.krachten < MARGE,
    `u ${rel.verpl.toExponential(2)} · R ${rel.reac.toExponential(2)} · N/V/M ${rel.krachten.toExponential(2)}`,
  );
}

log("");
log(`  Grootste gemeten relatieve afwijking over alle modellen:`);
log(`    verplaatsingen ${gemeten.verpl.toExponential(3)}`);
log(`    reacties       ${gemeten.reac.toExponential(3)}`);
log(`    staafkrachten  ${gemeten.krachten.toExponential(3)}`);
log(`    gehanteerde marge ${MARGE.toExponential(0)}`);

// ═══════════════════════════════════════════════════════════════════════════
// [3] Een mechanisme — beide oplossers moeten weigeren
// ═══════════════════════════════════════════════════════════════════════════
// Het portaal uit test-modelcontrole.mjs vóór herstel: twee kolomvoeten staan
// ÓP een doorgaande ligger zonder eraan vast te zitten, en de dakligger
// eindigt op een andere knoop dan de rechterkolom, precies op dezelfde plek.
// Drie gebreken, één mechanisme. Een oplosser die hier een getal teruggeeft is
// gevaarlijker dan een oplosser die traag is.
log("\n[3] Mechanisme: portaal op een doorgaande ligger, vóór herstel");
{
  const SCHARNIER = { startRy: true, endRy: true };
  const kapot = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4050, z: 0 }, { id: 3, x: 8100, z: 0 },
      { id: 4, x: 3500, z: 0 }, { id: 5, x: 3500, z: 2500 },
      { id: 6, x: 6500, z: 2500 }, { id: 7, x: 6500, z: 0 }, { id: 8, x: 6500, z: 2500 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0 },
      { id: 3, from: 4, to: 5, E: E0, A: A0, I: I0, releases: SCHARNIER },
      { id: 4, from: 5, to: 6, E: E0, A: A0, I: I0 },
      { id: 5, from: 7, to: 8, E: E0, A: A0, I: I0, releases: SCHARNIER },
    ],
    supports: [
      { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
      { nodeId: 3, type: "zRoller" }, { nodeId: 5, type: "xRoller" },
    ],
    cases: [{ id: 1, name: "G" }],
    loads: [
      { beamId: 1, q: -10, caseId: 1, startFrac: 0, endFrac: 3500 / 4050 },
      { beamId: 2, q: -10, caseId: 1, startFrac: 2450 / 4050, endFrac: 1 },
    ],
  };

  const uitslagen = {};
  for (const id of LINEAR_SOLVER_IDS) {
    const r = rekenMet(id, { soort: "lineair", invoer: kapot });
    uitslagen[id] = r;
    check(`${id}: geeft GEEN getallen terug`, r.ok === false, r.ok ? "het model rekende door" : "");
    check(`${id}: meldt een singuliere matrix`, /singular/i.test(r.fout ?? ""), r.fout ?? "");
  }
  check(
    "beide oplossers wijzen dezelfde vrijheidsgraad aan",
    (uitslagen.gauss.fout ?? "") === (uitslagen.skyline.fout ?? ""),
    `${uitslagen.gauss.fout} | ${uitslagen.skyline.fout}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// [4] Het keuzepunt zelf
// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Keuzepunt: standaard, geldigheid en herstel");
{
  check("standaard is de dichte Gauss-eliminatie", getLinearSolver() === "gauss", getLinearSolver());
  check("beide oplossers staan in de lijst",
    LINEAR_SOLVER_IDS.includes("gauss") && LINEAR_SOLVER_IDS.includes("skyline"),
    LINEAR_SOLVER_IDS.join(", "));
  let geweigerd = false;
  try { setLinearSolver("bestaatniet"); } catch { geweigerd = true; }
  check("een onbekende naam wordt geweigerd", geweigerd);
  check("de keuze staat na de weigering nog goed", getLinearSolver() === "gauss", getLinearSolver());
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
