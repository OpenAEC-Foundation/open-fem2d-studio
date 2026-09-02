// P1.2 — Plaatlasten-helpers (PlateLoads.ts): eigengewicht en randlast →
// equivalente knooplasten. De checks zijn exacte sommen (tolerantie 1e-9
// relatief; het zijn optellingen van exacte oppervlakte-/lengteformules),
// plus één integratietest op de mixed-kern.
//
// (a) EIGENGEWICHT — per membraanelement W = ρ·g·t·A, gelijk verdeeld over
//     de knopen (CST: W/3, Quad4: W/4), werkend in −y (core-y is de
//     verticale in-vlak-as; de UI noemt die as z — "ΣFz" in het plan):
//     — één los CST resp. Quad4: elke knoop draagt exact W/3 resp. W/4;
//     — grid 2,0 × 1,5 m (triangle én quad): ΣFy = −ρ·g·t·A binnen 1e-9;
//     — onregelmatig lapje 0,24 × 0,12 m (5 quads / 10 CST's, zelfde
//       geometrie als de patchtest van P0.1): de elementen betegelen de
//       rechthoek exact, dus ΣFy = −ρ·g·t·(0,24·0,12) binnen 1e-9 —
//       bewijst de schoenveterformule op niet-rechthoekige elementen.
//     Referentie: ρ staal = 7850 kg/m³ (Material.ts), g = 9,81 m/s².
// (b) RANDLAST — wrapper om convertEdgeNodeIdsToNodalForces (cumulatieve
//     booglengte + tributary lengths):
//     — uniforme knoopafstand s: randknopen exact p·s/2 (½-gewicht),
//       binnenknopen exact p·s ("trapeziumverdeling"), ΣF = p·L binnen 1e-9;
//     — niet-uniforme afstanden (0 / 0,3 / 0,7 / 1,2 / 2,0 m): per knoop
//       exact p·(d_links + d_rechts)/2, ΣF = p·L binnen 1e-9;
//     — schuine rand (booglengte ≠ Δx): ΣF = p·L_boog binnen 1e-9, voor
//       px én py onafhankelijk.
// (c) INTEGRATIE — trekwand b=1 m, h=3 m, t=20 mm, quad 4×12 (opgelegde
//     onderrand als in test-plaat-mixed.mjs), belast via de randlast-helper
//     met py = σ·t op de bovenrand → u_top = σ·h/E binnen 1%
//     (mixed_beam_plate; gemeten: machineprecisie).
//
// Uitvoeren: npx tsx test-plaat-lasten.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");
const {
  computeSelfWeightNodalForces,
  computeEdgeLoadNodalForces,
  applyNodalForces,
  computeElementArea,
  STANDARD_GRAVITY,
} = await import("./src/core/fem/PlateLoads.ts");
const { solveNonlinear } = await import("./src/core/solver/NonlinearSolver.ts");
const { buildNodeIdToIndex } = await import("./src/core/solver/Assembler.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve check: |actual - expected| <= tolRel * schaal (schaal = |expected| tenzij anders). */
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toExponential(6)} vs ${expected.toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

// Materiaal 1 = staal (Material.ts): E = 210 GPa, ν = 0,3, ρ = 7850 kg/m³
const E = 210e9, RHO = 7850, G_VAL = STANDARD_GRAVITY;

const somFy = (forces) => forces.reduce((s, f) => s + f.fy, 0);
const somFx = (forces) => forces.reduce((s, f) => s + f.fx, 0);

// ─────────────────────────────────────────────────────────────────────────
// (a) EIGENGEWICHT
// ─────────────────────────────────────────────────────────────────────────

function runEigengewichtEnkelElement() {
  log(`\n[eigengewicht enkel element] CST W/3, Quad4 W/4 per knoop`);
  const t = 0.02;

  // Eén CST (rechthoekige driehoek 0,8 × 0,6 m → A = 0,24 m²)
  {
    const mesh = new Mesh();
    const a = mesh.addNode(0, 0), b = mesh.addNode(0.8, 0), c = mesh.addNode(0, 0.6);
    const tri = mesh.addTriangleElement([a.id, b.id, c.id], 1, t);
    const A = 0.5 * 0.8 * 0.6;
    checkRel("CST oppervlakte (schoenveter)", computeElementArea(mesh, tri), A, 1e-12);
    const W = RHO * G_VAL * t * A;
    const forces = computeSelfWeightNodalForces(mesh);
    for (const f of forces) {
      checkRel(`CST knoop ${f.nodeId} draagt W/3`, f.fy, -W / 3, 1e-12);
    }
    checkRel("CST ΣFy = −ρ·g·t·A", somFy(forces), -W, 1e-12);
  }

  // Eén niet-rechthoekige Quad4 (trapezium, A via schoenveter = 0,75 m²)
  {
    const mesh = new Mesh();
    const a = mesh.addNode(0, 0), b = mesh.addNode(1, 0),
          c = mesh.addNode(0.8, 0.5), d = mesh.addNode(0.2, 0.5);
    const quad = mesh.addQuadElement([a.id, b.id, c.id, d.id], 1, t);
    const A = ((1.0 + 0.6) / 2) * 0.5; // trapezium: (b1+b2)/2 · hoogte
    checkRel("Quad4 oppervlakte (schoenveter)", computeElementArea(mesh, quad), A, 1e-12);
    const W = RHO * G_VAL * t * A;
    const forces = computeSelfWeightNodalForces(mesh);
    for (const f of forces) {
      checkRel(`Quad4 knoop ${f.nodeId} draagt W/4`, f.fy, -W / 4, 1e-12);
    }
    checkRel("Quad4 ΣFy = −ρ·g·t·A", somFy(forces), -W, 1e-12);
  }
}

function runEigengewichtGrid(elementType) {
  const B = 2.0, H = 1.5, t = 0.02;
  log(`\n[eigengewicht grid ${elementType}] ${B} × ${H} m, t=${t * 1000} mm, 8×6-mesh`);
  const mesh = new Mesh();
  generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: B, height: H,
    divisionsX: 8, divisionsY: 6,
    materialId: 1, thickness: t, elementType,
  });
  const W = RHO * G_VAL * t * B * H;
  const forces = computeSelfWeightNodalForces(mesh);
  checkRel("ΣFy = −ρ·g·t·A_totaal", somFy(forces), -W, 1e-9);
  checkRel("ΣFx = 0", somFx(forces), 0, 1e-9, W);
}

function runEigengewichtOnregelmatig(elementType) {
  log(`\n[eigengewicht onregelmatig ${elementType}] lapje 0,24 × 0,12 m (patchtest-geometrie)`);
  const t = 0.01;
  const mesh = new Mesh();
  // Zelfde onregelmatige betegeling als de patchtest van P0.1: de vijf
  // quads (of tien CST's) vullen de rechthoek exact op — A_totaal is bekend.
  const coords = [
    [0.00, 0.00], [0.24, 0.00], [0.24, 0.12], [0.00, 0.12], // A B C D — rand
    [0.04, 0.02], [0.18, 0.03], [0.16, 0.08], [0.08, 0.08], // E F G H — binnen
  ];
  const ids = coords.map(([x, y]) => mesh.addNode(x, y).id);
  const [A, B, C, D, Ei, F, G, H] = ids;
  const quads = [[A, B, F, Ei], [B, C, G, F], [C, D, H, G], [D, A, Ei, H], [Ei, F, G, H]];
  if (elementType === "quad") {
    for (const q of quads) mesh.addQuadElement(q, 1, t);
  } else {
    for (const [a, b, c, d] of quads) {
      mesh.addTriangleElement([a, b, c], 1, t);
      mesh.addTriangleElement([a, c, d], 1, t);
    }
  }
  const W = RHO * G_VAL * t * 0.24 * 0.12;
  const forces = computeSelfWeightNodalForces(mesh);
  checkRel("ΣFy = −ρ·g·t·(0,24·0,12)", somFy(forces), -W, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) RANDLAST
// ─────────────────────────────────────────────────────────────────────────

function runRandlastUniform() {
  log(`\n[randlast uniform] bovenrand 4 elementen, s=0,25 m, p=12 kN/m`);
  const p = 12e3, B = 1.0;
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: B, height: 0.5,
    divisionsX: 4, divisionsY: 1,
    materialId: 1, thickness: 0.02, elementType: "quad",
  });
  const topIds = region.edges.top.nodeIds;
  const s = B / 4;
  const forces = computeEdgeLoadNodalForces(mesh, topIds, 0, -p);
  checkRel("aantal knoopkrachten", forces.length, topIds.length, 0);
  for (let i = 0; i < forces.length; i++) {
    const isRand = i === 0 || i === forces.length - 1;
    checkRel(
      `knoop ${forces[i].nodeId} (${isRand ? "rand ½·p·s" : "binnen p·s"})`,
      forces[i].fy, -(isRand ? p * s / 2 : p * s), 1e-12
    );
  }
  checkRel("ΣFy = −p·L", somFy(forces), -p * B, 1e-9);
}

function runRandlastNietUniform() {
  log(`\n[randlast niet-uniform] knopen op x = 0 / 0,3 / 0,7 / 1,2 / 2,0 m, p=8 kN/m`);
  const p = 8e3;
  const xs = [0, 0.3, 0.7, 1.2, 2.0];
  const L = xs[xs.length - 1] - xs[0];
  const mesh = new Mesh();
  const ids = xs.map((x) => mesh.addNode(x, 0).id);
  const forces = computeEdgeLoadNodalForces(mesh, ids, 0, -p);
  for (let i = 0; i < xs.length; i++) {
    const dLinks = i > 0 ? xs[i] - xs[i - 1] : 0;
    const dRechts = i < xs.length - 1 ? xs[i + 1] - xs[i] : 0;
    checkRel(`knoop ${ids[i]}: p·(d_links+d_rechts)/2`,
      forces[i].fy, -p * (dLinks + dRechts) / 2, 1e-12);
  }
  checkRel("ΣFy = −p·L", somFy(forces), -p * L, 1e-9);
}

function runRandlastSchuin() {
  log(`\n[randlast schuine rand] 3-4-5-helling, booglengte 2,5 m, px=3 kN/m en py=−5 kN/m`);
  // Rand langs (0,0)→(1,2; 0,9)→(2,0; 1,5): booglengte 1,5 + 1,0 = 2,5 m
  const px = 3e3, py = -5e3, L = 2.5;
  const mesh = new Mesh();
  const ids = [
    mesh.addNode(0, 0).id,
    mesh.addNode(1.2, 0.9).id,
    mesh.addNode(2.0, 1.5).id,
  ];
  const forces = computeEdgeLoadNodalForces(mesh, ids, px, py);
  checkRel("ΣFx = px·L_boog", somFx(forces), px * L, 1e-9);
  checkRel("ΣFy = py·L_boog", somFy(forces), py * L, 1e-9);
  // Tributary per knoop: 0,75 / 1,25 / 0,50 m
  checkRel("knoop 1 (½·1,5 m)", forces[0].fy, py * 0.75, 1e-12);
  checkRel("knoop 2 (½·1,5+½·1,0 m)", forces[1].fy, py * 1.25, 1e-12);
  checkRel("knoop 3 (½·1,0 m)", forces[2].fy, py * 0.5, 1e-12);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) INTEGRATIE — trekwand belast via de randlast-helper
// ─────────────────────────────────────────────────────────────────────────

function runIntegratieTrekwand() {
  log(`\n[integratie trekwand] b=1 m, h=3 m, t=20 mm, σ=5 N/mm² via randlast-helper`);
  const B = 1.0, H = 3.0, t = 0.02, sigma = 5e6;
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: B, height: H,
    divisionsX: 4, divisionsY: 12,
    materialId: 1, thickness: t, elementType: "quad",
  });

  // Onderrand verticaal opgelegd, middelste knoop ook horizontaal
  // (statisch bepaald — zie test-plaat-mixed.mjs voor de onderbouwing)
  for (const nid of region.edges.bottom.nodeIds) {
    mesh.updateNode(nid, { constraints: { x: false, y: true, rotation: false } });
  }
  const bottomIds = region.edges.bottom.nodeIds;
  mesh.updateNode(bottomIds[Math.floor(bottomIds.length / 2)],
    { constraints: { x: true, y: true, rotation: false } });

  // Bovenrand: randlast py = σ·t (N/m) via de helper, additief aangebracht
  const forces = computeEdgeLoadNodalForces(mesh, region.edges.top.nodeIds, 0, sigma * t);
  checkRel("ΣFy = σ·t·b", somFy(forces), sigma * t * B, 1e-9);
  applyNodalForces(mesh, forces);

  const result = solveNonlinear(mesh, { analysisType: "mixed_beam_plate" });
  const n2i = buildNodeIdToIndex(mesh, "mixed_beam_plate");
  const uExp = sigma * H / E; // 7,143e-5 m
  for (const nid of region.edges.top.nodeIds) {
    checkRel(`u_top knoop ${nid}`, result.displacements[n2i.get(nid) * 3 + 1], uExp, 0.01);
  }
}

// ─────────────────────────────────────────────────────────────────────────

runEigengewichtEnkelElement();
runEigengewichtGrid("triangle");
runEigengewichtGrid("quad");
runEigengewichtOnregelmatig("quad");
runEigengewichtOnregelmatig("triangle");
runRandlastUniform();
runRandlastNietUniform();
runRandlastSchuin();
runIntegratieTrekwand();

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
