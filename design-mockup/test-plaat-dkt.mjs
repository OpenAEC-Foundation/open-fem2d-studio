// Verificatie van het DKT-buigelement (DKT.ts) ná de 6-termen-fix: de
// afgeleiden van de kwadratische hoekvormfuncties Lk(2Lk−1) zijn (4Lk−1),
// niet ±1 (die waarde geldt alleen in Lk=1/2, het middenpunt van een zijde).
//
// Referentie: Batoz, Bathe & Ho (1980), "A study of three-node triangular
// plate bending elements", Int. J. Num. Methods Eng.
//
// DOF-conventie per knoop (gemeten, zie hieronder): [w, θx, θy] met
// θx = −∂w/∂y en θy = +∂w/∂x.
//
// Momenttekens (vastgelegd via de constante-krommingspatch): bij het veld
// w = ½·c·x² met c > 0 (opwaartse doorbuiging, holle zijde boven) geeft
// calculateElementMoments mx = +D·c en my = +ν·D·c — dus m = +D·∂²w/∂x²
// (kromming κx = ∂²w/∂x², geen minteken in de conventie van deze code).
//
// Tests:
// (a) rigid-body: drie starre-lichaamsmodes geven ‖Ke·u‖∞ < 1e-8·‖Ke‖∞
// (b) constante kromming: patch onder zuivere kromming w = ½c·x² geeft
//     my/mx = ν binnen 1% (en |mx| = D·c binnen 1%)
// (c) vrij opgelegde vierkante plaat, centrale puntlast P, ν = 0,3:
//     w_mid vs analytisch 0,01160·P·a²/D (dunne-plaattheorie, Timoshenko)
//     binnen 1,5% bij n=12, met monotone convergentie over n = 4/8/12.
//     Vóór de fix divergeerde dit pad (ratio 0,265 → 0,106 → 0,0375).
//
// Uitvoeren: npx tsx test-plaat-dkt.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");
const { solveNonlinear } = await import("./src/core/solver/NonlinearSolver.ts");
const { buildNodeIdToIndex } = await import("./src/core/solver/Assembler.ts");
const { calculateDKTStiffness, calculateElementMoments } = await import("./src/core/fem/DKT.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toExponential(6)} vs ${expected.toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

function checkTrue(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

// Materiaal: staal, E = 210 GPa, ν = 0,3
const E = 210e9, nu = 0.3;
const material = { id: 1, name: "Staal", E, nu, rho: 7850 };

// Testdriehoeken: bewust onregelmatig en verschillend georiënteerd
const testTriangles = [
  [{ x: 0.0, y: 0.0 }, { x: 1.0, y: 0.0 }, { x: 0.0, y: 1.0 }],
  [{ x: 0.1, y: 0.2 }, { x: 1.3, y: 0.4 }, { x: 0.5, y: 1.1 }],
  [{ x: -0.4, y: 0.7 }, { x: 0.9, y: -0.3 }, { x: 1.2, y: 1.5 }],
];

// ─────────────────────────────────────────────────────────────────────────
// (a) RIGID-BODY — starre modes geven geen elementkrachten
// ─────────────────────────────────────────────────────────────────────────
log("\n[a] Rigid-body modes: ‖Ke·u‖∞ < 1e-8·‖Ke‖∞");
{
  const t = 0.02;
  for (let ti = 0; ti < testTriangles.length; ti++) {
    const [n1, n2, n3] = testTriangles[ti];
    const Ke = calculateDKTStiffness(n1, n2, n3, material, t);

    let KeNorm = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) KeNorm = Math.max(KeNorm, Math.abs(Ke.get(i, j)));

    // Modes in conventie [w, −∂w/∂y, +∂w/∂x]:
    //   translatie  w = 1        → [1, 0, 0]
    //   rotatie om x-as, w = y   → [y_i, −1, 0]
    //   rotatie om y-as, w = x   → [x_i, 0, +1]
    const modes = [
      { name: "translatie w=1", u: (n) => [1, 0, 0] },
      { name: "rotatie w=y", u: (n) => [n.y, -1, 0] },
      { name: "rotatie w=x", u: (n) => [n.x, 0, 1] },
    ];

    for (const mode of modes) {
      const u = [...mode.u(n1), ...mode.u(n2), ...mode.u(n3)];
      const f = Ke.multiplyVector(u);
      const fMax = Math.max(...f.map(Math.abs));
      const uMax = Math.max(...u.map(Math.abs));
      const tol = 1e-8 * KeNorm * Math.max(1, uMax);
      checkTrue(`driehoek ${ti + 1}, ${mode.name}`, fMax < tol,
        `‖Ke·u‖∞/‖Ke‖∞ = ${(fMax / KeNorm).toExponential(2)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (b) CONSTANTE KROMMING — my/mx = ν
// ─────────────────────────────────────────────────────────────────────────
log("\n[b] Constante-krommingspatch w = ½c·x²: my/mx = ν binnen 1%");
{
  const t = 0.02;
  const c = 1e-3; // kromming ∂²w/∂x² [1/m]
  const D = E * t * t * t / (12 * (1 - nu * nu));

  for (let ti = 0; ti < testTriangles.length; ti++) {
    const [n1, n2, n3] = testTriangles[ti];
    // Knoop-DOF's uit het exacte veld w = ½c·x²:
    //   w = ½c·x², θx = −∂w/∂y = 0, θy = +∂w/∂x = c·x
    const u = [];
    for (const n of [n1, n2, n3]) u.push(0.5 * c * n.x * n.x, 0, c * n.x);

    const m = calculateElementMoments(n1, n2, n3, material, t, u);
    checkRel(`driehoek ${ti + 1}: my/mx = ν`, m.my / m.mx, nu, 0.01);
    checkRel(`driehoek ${ti + 1}: |mx| = D·c`, Math.abs(m.mx), D * c, 0.01);
    checkTrue(`driehoek ${ti + 1}: teken mx = +D·c (m = +D·∂²w/∂x²)`, m.mx > 0,
      `mx = ${m.mx.toExponential(3)} N·m/m`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (c) VRIJ OPGELEGDE VIERKANTE PLAAT — centrale puntlast, convergentie
// ─────────────────────────────────────────────────────────────────────────
log("\n[c] Vrij opgelegde vierkante plaat a=2 m, t=20 mm, centrale P=10 kN");
{
  const a = 2.0, t = 0.02, P = 10000;
  const D = E * t * t * t / (12 * (1 - nu * nu));
  const wExact = 0.01160 * P * a * a / D; // Timoshenko: α = 0,01160 (ν = 0,3)

  function solvePlate(n) {
    const mesh = new Mesh();
    const region = generatePlateRegionMesh(mesh, {
      x: 0, y: 0, width: a, height: a,
      divisionsX: n, divisionsY: n,
      materialId: 1, thickness: t, elementType: "triangle",
    });
    // Vrij opgelegd: w = 0 op alle randknopen (rotaties vrij)
    const boundary = new Set([
      ...region.edges.bottom.nodeIds,
      ...region.edges.top.nodeIds,
      ...region.edges.left.nodeIds,
      ...region.edges.right.nodeIds,
    ]);
    for (const nid of boundary) {
      mesh.updateNode(nid, { constraints: { x: false, y: true, rotation: false } });
    }
    // Centrale puntlast (n is even → knoop op (a/2, a/2) bestaat)
    const center = mesh.findNodeAt(a / 2, a / 2, 1e-6);
    if (!center) throw new Error(`geen middenknoop voor n=${n}`);
    mesh.updateNode(center.id, { loads: { fx: 0, fy: P, moment: 0 } });

    const result = solveNonlinear(mesh, { analysisType: "plate_bending" });
    const n2i = buildNodeIdToIndex(mesh, "plate_bending");
    return result.displacements[n2i.get(center.id) * 3]; // w-DOF
  }

  const ns = [4, 8, 12];
  const ratios = ns.map((n) => solvePlate(n) / wExact);
  log(`  w_exact = ${wExact.toExponential(6)} m`);
  log(`  convergentiereeks w_fem/w_exact (n=4/8/12): ${ratios.map((r) => r.toFixed(4)).join(" → ")}`);

  checkRel("w_mid bij n=12", ratios[2], 1.0, 0.015, 1.0);
  checkTrue("monotone convergentie |r−1| dalend over n=4/8/12",
    Math.abs(ratios[0] - 1) > Math.abs(ratios[1] - 1) &&
    Math.abs(ratios[1] - 1) > Math.abs(ratios[2] - 1),
    ratios.map((r) => Math.abs(r - 1).toExponential(2)).join(" > "));
  checkTrue("van boven convergerend (r > 1, zachte oplegging)",
    ratios.every((r) => r > 1),
    ratios.map((r) => r.toFixed(4)).join(", "));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
