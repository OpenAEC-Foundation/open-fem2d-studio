// Analytisch bewijs van het schijfpad (plane stress): CST (Triangle.ts) en
// Quad4 (Quad4.ts) via Assembler + solveNonlinear.
//
// (a) PATCHTEST — klassiek membraan-patchlapje (onregelmatige binnenknopen op
//     een rechthoek 0,24 × 0,12 m): een lineair verplaatsingsveld
//     u = 1e-3·(x + y/2), v = 1e-3·(y + x/2) op de randknopen moet door de
//     elementen EXACT gereproduceerd worden (rel. fout < 1e-8), met constante
//     spanning σx = σy = E/(1−ν²)·(1+ν)·1e-3 en τxy = G·1e-3.
//     Referentie: standaard patchtest voor membraanelementen (constante-rek-eis).
// (b) TREKSTAAF — schijf 1,0 × 0,2 m, t = 10 mm, σ = 5 N/mm², 10×2-mesh via
//     generatePlateRegionMesh + solveNonlinear ('plane_stress'):
//     u_eind = σ·L/E (mechanicaboek, staaf onder trek), σx per element ≈ 5,0
//     N/mm², ΣR_x = σ·b·t (evenwicht).
// Beide testen draaien voor elementType 'triangle' én 'quad'.
//
// Uitvoeren: npx tsx test-plaat-schijf.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");
const { solveNonlinear } = await import("./src/core/solver/NonlinearSolver.ts");
const { assembleGlobalStiffnessMatrix, buildNodeIdToIndex } = await import("./src/core/solver/Assembler.ts");
const { calculateElementStress } = await import("./src/core/fem/Triangle.ts");
const { calculateQuadStress } = await import("./src/core/fem/Quad4.ts");
const { solveLinearSystem } = await import("./src/core/math/GaussElimination.ts");
const { Matrix } = await import("./src/core/math/Matrix.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve check: |actual - expected| <= tolRel * schaal (schaal = |expected| tenzij anders). */
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toExponential(6)} vs ${expected.toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

// Materiaal 1 = staal (Material.ts): E = 210 GPa, nu = 0,3
const E = 210e9, nu = 0.3;

// ─────────────────────────────────────────────────────────────────────────
// (a) PATCHTEST — lineair verplaatsingsveld exact gereproduceerd
// ─────────────────────────────────────────────────────────────────────────

// Voorgeschreven lineair veld en bijbehorende constante rek/spanning
const uExact = (x, y) => 1e-3 * (x + y / 2);
const vExact = (x, y) => 1e-3 * (y + x / 2);
const epsX = 1e-3, epsY = 1e-3, gammaXY = 1e-3;
const sigmaXExp = E / (1 - nu * nu) * (epsX + nu * epsY); // 300 MPa
const sigmaYExp = E / (1 - nu * nu) * (epsY + nu * epsX); // 300 MPa
const tauXYExp = E / (2 * (1 + nu)) * gammaXY;            // 80,77 MPa

function runPatchTest(elementType) {
  log(`\n[patchtest ${elementType}] onregelmatig lapje 0,24 × 0,12 m, rand voorgeschreven`);
  const mesh = new Mesh();
  // Hoeken (rand) A..D, binnenknopen E..H (bewust onregelmatig geplaatst)
  const coords = [
    [0.00, 0.00], [0.24, 0.00], [0.24, 0.12], [0.00, 0.12], // A B C D — rand
    [0.04, 0.02], [0.18, 0.03], [0.16, 0.08], [0.08, 0.08], // E F G H — binnen
  ];
  const ids = coords.map(([x, y]) => mesh.addNode(x, y).id);
  const [A, B, C, D, Ei, F, G, H] = ids;
  const quads = [[A, B, F, Ei], [B, C, G, F], [C, D, H, G], [D, A, Ei, H], [Ei, F, G, H]];
  if (elementType === "quad") {
    for (const q of quads) mesh.addQuadElement(q, 1, 0.01);
  } else {
    for (const [a, b, c, d] of quads) {
      mesh.addTriangleElement([a, b, c], 1, 0.01);
      mesh.addTriangleElement([a, c, d], 1, 0.01);
    }
  }

  // Assembleren en partitioneren: randknopen voorgeschreven, binnenknopen vrij.
  // K_ii · u_i = −K_ib · u_b  (geen uitwendige belasting op binnenknopen)
  const K = assembleGlobalStiffnessMatrix(mesh, "plane_stress");
  const n2i = buildNodeIdToIndex(mesh, "plane_stress");
  const numDofs = n2i.size * 2;

  const uFull = new Array(numDofs).fill(0);
  const isPrescribed = new Array(numDofs).fill(false);
  for (const nid of [A, B, C, D]) {
    const node = mesh.getNode(nid);
    const idx = n2i.get(nid);
    uFull[idx * 2] = uExact(node.x, node.y);
    uFull[idx * 2 + 1] = vExact(node.x, node.y);
    isPrescribed[idx * 2] = true;
    isPrescribed[idx * 2 + 1] = true;
  }
  const freeDofs = [];
  for (let d = 0; d < numDofs; d++) if (!isPrescribed[d]) freeDofs.push(d);

  const Kii = new Matrix(freeDofs.length, freeDofs.length);
  const rhs = new Array(freeDofs.length).fill(0);
  for (let i = 0; i < freeDofs.length; i++) {
    for (let j = 0; j < freeDofs.length; j++) {
      Kii.set(i, j, K.get(freeDofs[i], freeDofs[j]));
    }
    for (let d = 0; d < numDofs; d++) {
      if (isPrescribed[d]) rhs[i] -= K.get(freeDofs[i], d) * uFull[d];
    }
  }
  const uFree = solveLinearSystem(Kii, rhs);
  for (let i = 0; i < freeDofs.length; i++) uFull[freeDofs[i]] = uFree[i];

  // Schaal voor relatieve fout: grootste verplaatsing in het exacte veld
  const uScale = Math.max(...coords.map(([x, y]) => Math.max(Math.abs(uExact(x, y)), Math.abs(vExact(x, y)))));

  // Verplaatsingen binnenknopen exact?
  for (const nid of [Ei, F, G, H]) {
    const node = mesh.getNode(nid);
    const idx = n2i.get(nid);
    checkRel(`u knoop ${nid}`, uFull[idx * 2], uExact(node.x, node.y), 1e-8, uScale);
    checkRel(`v knoop ${nid}`, uFull[idx * 2 + 1], vExact(node.x, node.y), 1e-8, uScale);
  }

  // Spanning per element constant en exact?
  const material = mesh.getMaterial(1);
  for (const element of mesh.elements.values()) {
    const nodes = element.nodeIds.map((nid) => mesh.getNode(nid));
    const elemDisp = [];
    for (const node of nodes) {
      const idx = n2i.get(node.id);
      elemDisp.push(uFull[idx * 2], uFull[idx * 2 + 1]);
    }
    const stress = nodes.length === 4
      ? calculateQuadStress(nodes[0], nodes[1], nodes[2], nodes[3], material, elemDisp, "plane_stress")
      : calculateElementStress(nodes[0], nodes[1], nodes[2], material, elemDisp, "plane_stress");
    checkRel(`σx elem ${element.id}`, stress.sigmaX, sigmaXExp, 1e-8);
    checkRel(`σy elem ${element.id}`, stress.sigmaY, sigmaYExp, 1e-8);
    checkRel(`τxy elem ${element.id}`, stress.tauXY, tauXYExp, 1e-8);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (b) TREKSTAAF — 1,0 × 0,2 m, t = 10 mm, σ = 5 N/mm², 10×2-mesh
// ─────────────────────────────────────────────────────────────────────────

function runTensionBar(elementType) {
  log(`\n[trekstaaf ${elementType}] 1,0 × 0,2 m, t=10 mm, σ=5 N/mm², 10×2-mesh`);
  const L = 1.0, b = 0.2, t = 0.01;
  const sigma = 5e6; // Pa
  const Ftot = sigma * b * t; // 10.000 N

  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: L, height: b,
    divisionsX: 10, divisionsY: 2,
    materialId: 1, thickness: t, elementType,
  });

  // Linkerrand: u vast; linksonder ook v vast (statisch bepaald in y,
  // dwarscontractie blijft vrij — consistent met de exacte oplossing)
  for (const nid of region.edges.left.nodeIds) {
    mesh.updateNode(nid, { constraints: { x: true, y: false, rotation: false } });
  }
  mesh.updateNode(region.cornerNodeIds[0], { constraints: { x: true, y: true, rotation: false } });

  // Rechterrand: knooplasten volgens tributary lengths (rand ½-gewicht)
  const rightIds = region.edges.right.nodeIds; // gesorteerd van onder naar boven
  const ys = rightIds.map((nid) => mesh.getNode(nid).y);
  for (let i = 0; i < rightIds.length; i++) {
    let trib = 0;
    if (i > 0) trib += (ys[i] - ys[i - 1]) / 2;
    if (i < rightIds.length - 1) trib += (ys[i + 1] - ys[i]) / 2;
    mesh.updateNode(rightIds[i], { loads: { fx: sigma * t * trib, fy: 0, moment: 0 } });
  }

  const result = solveNonlinear(mesh, { analysisType: "plane_stress" });
  const n2i = buildNodeIdToIndex(mesh, "plane_stress");

  // u_eind = σ·L/E op elke rechterrandknoop (binnen 0,5%)
  const uExp = sigma * L / E; // 2,381e-5 m
  for (const nid of rightIds) {
    checkRel(`u_eind knoop ${nid}`, result.displacements[n2i.get(nid) * 2], uExp, 0.005);
  }

  // σx per element binnen 6% van 5,0 N/mm²
  let sigMin = Infinity, sigMax = -Infinity;
  for (const stress of result.elementStresses.values()) {
    sigMin = Math.min(sigMin, stress.sigmaX);
    sigMax = Math.max(sigMax, stress.sigmaX);
    if (Math.abs(stress.sigmaX - sigma) > 0.06 * sigma) {
      failed++;
      log(`  ✗ σx elem ${stress.elementId}: ${(stress.sigmaX / 1e6).toFixed(3)} N/mm² buiten 6% van 5,0`);
    }
  }
  passed++;
  log(`  ✓ σx alle elementen binnen 6%: ${(sigMin / 1e6).toFixed(4)} .. ${(sigMax / 1e6).toFixed(4)} N/mm²`);

  // ΣR_x over de linkerrand = −σ·b·t (binnen 0,1%)
  let sumRx = 0;
  for (const nid of region.edges.left.nodeIds) {
    sumRx += result.reactions[n2i.get(nid) * 2];
  }
  checkRel("ΣR_x linkerrand", Math.abs(sumRx), Ftot, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────

for (const elementType of ["triangle", "quad"]) {
  runPatchTest(elementType);
  runTensionBar(elementType);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
