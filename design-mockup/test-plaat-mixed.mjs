// P1.1 — Analytisch bewijs van de mixed-kern (staaf + membraan in één stelsel):
// rechtstreeks op de core (Mesh + solveNonlinear met 'mixed_beam_plate'),
// zonder engine-adapter.
//
// (a) TREKWAND — kolomschijf b = 1,0 m, h = 3,0 m, t = 20 mm, quad-grid 4×12
//     via generatePlateRegionMesh, bovenrand knooplasten volgens tributary
//     lengths met σ = 5 N/mm². Twee oplegvarianten:
//     — NORMATIEF "opgelegd": alle onderrandknopen verticaal vast (y), één
//       onderrandknoop ook horizontaal (x) — statisch bepaald in het vlak.
//       De exacte oplossing is dan de uniforme éénassige trekstand
//       (dwarscontractie vrij), die het element exact kan representeren:
//       u_top = σ·h/E binnen 1%, σy per element binnen 2%, ΣR_y = σ·b·t
//       binnen 0,1% (gemeten: alle drie op machineprecisie). Ook gedraaid
//       voor CST ('triangle') — dekt calculateTriangleStiffnessExpanded.
//     — SUPPLEMENT "volledig ingeklemd": alle onderrandknopen x+y vast.
//       Dan verhindert de rand de dwarscontractie en ontstaat de bekende
//       Saint-Venant-hoekverstoring (hoeksingulariteit in het continuüm):
//       gemeten σy-spreiding per element ±3,25% bij 4×12 — een fysisch
//       randeffect, géén codefout; de 2%-per-element-eis is in deze
//       configuratie principieel niet haalbaar. Daarom hier alleen
//       u_top = σ·h/E binnen 1% (gemeten −0,52%), ΣR_y binnen 0,1% en
//       σy binnen 5% als sanity-grens.
//     Referentie: mechanicaboek, staaf onder trek (u = σL/E) + Saint-Venant.
// (b) KRAAGWAND — L = 4,0 m, h = 1,0 m, t = 100 mm (L/h = 4), tiplast
//     P = 100 kN verdeeld over de rechterrand (tributary): w_tip vs
//     Timoshenko w = P·L³/(3EI) + 1,2·P·L/(G·A) met I = t·h³/12, A = t·h,
//     G = E/(2(1+ν)): binnen 5% bij 32×8 quads, en mesh-verdubbeling
//     8×2 → 16×4 → 32×8 verkleint de fout monotoon
//     (gemeten: 12,06% → 3,86% → 1,44%; Q4 convergeert van de stijve kant).
//     Referentie: Timoshenko-liggertheorie, schuifvormfactor 1,2 (rechthoek).
// (c) STAAF-EQUIVALENTIE — een los portaalraamwerk (2 kolommen + ligger met
//     q-last) plus een ver weg gelegen, apart opgelegd mini-plaatje (1×1 m,
//     2×2 quads op x = 100) geeft in mixed-mode dezelfde liggerresultaten
//     (knoopverplaatsingen, N/V/M op alle stations, oplegreacties) als het
//     kale raamwerk in frame-mode, binnen 0,1% — bewijst dat de
//     rotatiestabilisatie voor plaatknopen (Assembler.ts, rotStab =
//     maxDiag·1e-6 alleen op θ-DOF's zónder staafaansluiting) de
//     staafresultaten niet vervuilt. Gemeten: bit-identiek (verschil 0,0).
//
// Tijdens P1.1 zijn GEEN bugs in Assembler.ts/NonlinearSolver.ts aangetoond;
// er is dan ook niets in de productiecode gewijzigd.
//
// Uitvoeren: npx tsx test-plaat-mixed.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");
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

/** Booleaanse check met omschrijving. */
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

// Materiaal 1 = staal (Material.ts): E = 210 GPa, ν = 0,3
const E = 210e9, nu = 0.3;

// ─────────────────────────────────────────────────────────────────────────
// (a) TREKWAND — b = 1,0 m, h = 3,0 m, t = 20 mm, σ = 5 N/mm², quad 4×12
// ─────────────────────────────────────────────────────────────────────────

const B_WAND = 1.0, H_WAND = 3.0, T_WAND = 0.02, SIGMA = 5e6;
const F_TOT = SIGMA * B_WAND * T_WAND; // 100 kN

/**
 * Bouwt de trekwand en lost op in mixed-mode.
 * variant 'opgelegd'   : onderrand y vast, middelste onderrandknoop ook x vast
 * variant 'ingeklemd'  : onderrand x én y vast
 */
function solveTrekwand(elementType, variant) {
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: B_WAND, height: H_WAND,
    divisionsX: 4, divisionsY: 12,
    materialId: 1, thickness: T_WAND, elementType,
  });

  const fixX = variant === "ingeklemd";
  for (const nid of region.edges.bottom.nodeIds) {
    mesh.updateNode(nid, { constraints: { x: fixX, y: true, rotation: false } });
  }
  if (!fixX) {
    const bottomIds = region.edges.bottom.nodeIds;
    const mid = bottomIds[Math.floor(bottomIds.length / 2)];
    mesh.updateNode(mid, { constraints: { x: true, y: true, rotation: false } });
  }

  // Bovenrand: knooplasten volgens tributary lengths (randknopen ½-gewicht)
  const topIds = region.edges.top.nodeIds; // gesorteerd van links naar rechts
  const xs = topIds.map((nid) => mesh.getNode(nid).x);
  for (let i = 0; i < topIds.length; i++) {
    let trib = 0;
    if (i > 0) trib += (xs[i] - xs[i - 1]) / 2;
    if (i < topIds.length - 1) trib += (xs[i + 1] - xs[i]) / 2;
    mesh.updateNode(topIds[i], { loads: { fx: 0, fy: SIGMA * T_WAND * trib, moment: 0 } });
  }

  const result = solveNonlinear(mesh, { analysisType: "mixed_beam_plate" });
  const n2i = buildNodeIdToIndex(mesh, "mixed_beam_plate");
  return { mesh, region, result, n2i, topIds };
}

function runTrekwandOpgelegd(elementType) {
  log(`\n[trekwand opgelegd ${elementType}] b=1 m, h=3 m, t=20 mm, σ=5 N/mm², quad-grid 4×12`);
  const { region, result, n2i, topIds } = solveTrekwand(elementType, "opgelegd");

  // u_top = σ·h/E op elke bovenrandknoop (binnen 1%)
  const uExp = SIGMA * H_WAND / E; // 7,143e-5 m
  for (const nid of topIds) {
    checkRel(`u_top knoop ${nid}`, result.displacements[n2i.get(nid) * 3 + 1], uExp, 0.01);
  }

  // σy per element binnen 2% van 5,0 N/mm²
  let syMin = Infinity, syMax = -Infinity, sigmaOk = true;
  for (const stress of result.elementStresses.values()) {
    syMin = Math.min(syMin, stress.sigmaY);
    syMax = Math.max(syMax, stress.sigmaY);
    if (Math.abs(stress.sigmaY - SIGMA) > 0.02 * SIGMA) sigmaOk = false;
  }
  checkTrue(`σy alle elementen binnen 2%`, sigmaOk,
    `${(syMin / 1e6).toFixed(4)} .. ${(syMax / 1e6).toFixed(4)} N/mm²`);

  // ΣR_y onderrand = −σ·b·t (binnen 0,1%)
  let sumRy = 0;
  for (const nid of region.edges.bottom.nodeIds) {
    sumRy += result.reactions[n2i.get(nid) * 3 + 1];
  }
  checkRel("ΣR_y onderrand", Math.abs(sumRy), F_TOT, 0.001);
}

function runTrekwandIngeklemd() {
  log(`\n[trekwand ingeklemd quad] onderrand x+y vast — Saint-Venant-randeffect`);
  const { region, result, n2i, topIds } = solveTrekwand("quad", "ingeklemd");

  const uExp = SIGMA * H_WAND / E;
  for (const nid of topIds) {
    checkRel(`u_top knoop ${nid}`, result.displacements[n2i.get(nid) * 3 + 1], uExp, 0.01);
  }

  // σy-spreiding door de ingeklemde rand: sanity-grens 5% (gemeten ±3,25%)
  let syMin = Infinity, syMax = -Infinity, sigmaOk = true;
  for (const stress of result.elementStresses.values()) {
    syMin = Math.min(syMin, stress.sigmaY);
    syMax = Math.max(syMax, stress.sigmaY);
    if (Math.abs(stress.sigmaY - SIGMA) > 0.05 * SIGMA) sigmaOk = false;
  }
  checkTrue(`σy alle elementen binnen 5% (randeffect)`, sigmaOk,
    `${(syMin / 1e6).toFixed(4)} .. ${(syMax / 1e6).toFixed(4)} N/mm²`);

  let sumRy = 0;
  for (const nid of region.edges.bottom.nodeIds) {
    sumRy += result.reactions[n2i.get(nid) * 3 + 1];
  }
  checkRel("ΣR_y onderrand", Math.abs(sumRy), F_TOT, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) KRAAGWAND — L = 4,0 m, h = 1,0 m, t = 100 mm, tiplast P = 100 kN
// ─────────────────────────────────────────────────────────────────────────

function solveKraagwand(nx, ny) {
  const L = 4.0, h = 1.0, t = 0.1, P = 1e5;
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: L, height: h,
    divisionsX: nx, divisionsY: ny,
    materialId: 1, thickness: t, elementType: "quad",
  });

  // Linkerrand volledig ingeklemd (u = v = 0)
  for (const nid of region.edges.left.nodeIds) {
    mesh.updateNode(nid, { constraints: { x: true, y: true, rotation: false } });
  }

  // Tiplast: P omlaag, verdeeld over de rechterrand volgens tributary lengths
  const rightIds = region.edges.right.nodeIds; // gesorteerd van onder naar boven
  const ys = rightIds.map((nid) => mesh.getNode(nid).y);
  for (let i = 0; i < rightIds.length; i++) {
    let trib = 0;
    if (i > 0) trib += (ys[i] - ys[i - 1]) / 2;
    if (i < rightIds.length - 1) trib += (ys[i + 1] - ys[i]) / 2;
    mesh.updateNode(rightIds[i], { loads: { fx: 0, fy: -P * trib / h, moment: 0 } });
  }

  const result = solveNonlinear(mesh, { analysisType: "mixed_beam_plate" });
  const n2i = buildNodeIdToIndex(mesh, "mixed_beam_plate");

  // Doorbuiging op halve hoogte van de tip (middelste rechterrandknoop)
  const midId = rightIds[Math.floor(rightIds.length / 2)];
  const wTip = -result.displacements[n2i.get(midId) * 3 + 1];

  // Timoshenko-referentie: buiging + dwarskracht (vormfactor 1,2 rechthoek)
  const I = t * h ** 3 / 12, A = t * h, G = E / (2 * (1 + nu));
  const wRef = P * L ** 3 / (3 * E * I) + 1.2 * P * L / (G * A);
  return { wTip, wRef, relErr: Math.abs(wTip / wRef - 1) };
}

function runKraagwand() {
  log(`\n[kraagwand] L=4 m, h=1 m, t=100 mm, P=100 kN — convergentie 8×2 → 16×4 → 32×8`);
  const levels = [[8, 2], [16, 4], [32, 8]];
  const errs = [];
  let wRef = 0;
  for (const [nx, ny] of levels) {
    const r = solveKraagwand(nx, ny);
    wRef = r.wRef;
    errs.push(r.relErr);
    log(`    ${nx}×${ny}: w_tip = ${r.wTip.toExponential(6)} m (rel.fout ${(r.relErr * 100).toFixed(3)}%)`);
  }
  log(`    Timoshenko-referentie: ${wRef.toExponential(6)} m`);

  // Binnen 5% bij 32×8
  checkTrue("w_tip 32×8 binnen 5% van Timoshenko", errs[2] <= 0.05,
    `rel.fout ${(errs[2] * 100).toFixed(3)}%`);
  // Monotone convergentie: elke verdubbeling verkleint de fout
  checkTrue("monotone convergentie 8×2 → 16×4", errs[1] < errs[0],
    `${(errs[0] * 100).toFixed(3)}% → ${(errs[1] * 100).toFixed(3)}%`);
  checkTrue("monotone convergentie 16×4 → 32×8", errs[2] < errs[1],
    `${(errs[1] * 100).toFixed(3)}% → ${(errs[2] * 100).toFixed(3)}%`);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) STAAF-EQUIVALENTIE — raamwerk in frame-mode ≡ raamwerk + ver
//     mini-plaatje in mixed-mode, binnen 0,1%
// ─────────────────────────────────────────────────────────────────────────

/** Portaalraamwerk: 2 pendelkolommen op scharnieropleggingen + ligger met q-last. */
function bouwRaamwerk(mesh) {
  const n1 = mesh.addNode(0, 0);
  const n2 = mesh.addNode(0, 3);
  const n3 = mesh.addNode(6, 3);
  const n4 = mesh.addNode(6, 0);
  mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
  mesh.updateNode(n4.id, { constraints: { x: true, y: true, rotation: false } });
  const b1 = mesh.addBeamElement([n1.id, n2.id]); // kolom links (IPE300-default)
  const b2 = mesh.addBeamElement([n2.id, n3.id]); // ligger
  const b3 = mesh.addBeamElement([n3.id, n4.id]); // kolom rechts
  b2.distributedLoad = { qx: 0, qy: -10e3 }; // 10 kN/m omlaag op de ligger
  return { nodeIds: [n1.id, n2.id, n3.id, n4.id], beamIds: [b1.id, b2.id, b3.id] };
}

function runStaafEquivalentie() {
  log(`\n[staaf-equivalentie] portaal + q-last: frame-mode vs mixed-mode met ver mini-plaatje`);
  const TOL = 0.001; // 0,1%

  // Referentie: kaal raamwerk in frame-mode
  const meshA = new Mesh();
  const refA = bouwRaamwerk(meshA);
  const resA = solveNonlinear(meshA, { analysisType: "frame" });
  // Frame-pad indexeert álle knopen op invoegvolgorde (alle knopen zijn actief)
  const n2iA = new Map();
  let k = 0;
  for (const node of meshA.nodes.values()) n2iA.set(node.id, k++);

  // Zelfde raamwerk + apart opgelegd mini-plaatje ver weg (x = 100), mixed-mode
  const meshB = new Mesh();
  const refB = bouwRaamwerk(meshB);
  const regionB = generatePlateRegionMesh(meshB, {
    x: 100, y: 0, width: 1, height: 1,
    divisionsX: 2, divisionsY: 2,
    materialId: 1, thickness: 0.02, elementType: "quad",
  });
  for (const nid of regionB.edges.bottom.nodeIds) {
    meshB.updateNode(nid, { constraints: { x: true, y: true, rotation: false } });
  }
  const resB = solveNonlinear(meshB, { analysisType: "mixed_beam_plate" });
  const n2iB = buildNodeIdToIndex(meshB, "mixed_beam_plate");

  // Knoopverplaatsingen (u, v, θ) van de raamwerkknopen
  const dofNaam = ["u", "v", "θ"];
  const uScale = Math.max(...resA.displacements.map(Math.abs));
  for (let i = 0; i < refA.nodeIds.length; i++) {
    for (let d = 0; d < 3; d++) {
      const a = resA.displacements[n2iA.get(refA.nodeIds[i]) * 3 + d];
      const b = resB.displacements[n2iB.get(refB.nodeIds[i]) * 3 + d];
      checkRel(`${dofNaam[d]} knoop ${refA.nodeIds[i]}`, b, a, TOL, uScale);
    }
  }

  // Snedekrachten N/V/M op alle stations, per staaf, t.o.v. het staafmaximum
  for (let i = 0; i < refA.beamIds.length; i++) {
    const fa = resA.beamForces.get(refA.beamIds[i]);
    const fb = resB.beamForces.get(refB.beamIds[i]);
    checkTrue(`staaf ${i + 1}: zelfde aantal stations`, fa.stations.length === fb.stations.length);
    const grootheden = [
      ["N", fa.normalForce, fb.normalForce],
      ["V", fa.shearForce, fb.shearForce],
      ["M", fa.bendingMoment, fb.bendingMoment],
    ];
    for (const [naam, arrA, arrB] of grootheden) {
      const scale = Math.max(...arrA.map(Math.abs), 1);
      let maxDiff = 0;
      for (let s = 0; s < arrA.length; s++) {
        maxDiff = Math.max(maxDiff, Math.abs(arrA[s] - arrB[s]));
      }
      checkTrue(`staaf ${i + 1}: ${naam}(x) identiek binnen 0,1%`, maxDiff <= TOL * scale,
        `max.verschil ${maxDiff.toExponential(2)} bij schaal ${scale.toExponential(2)}`);
    }
  }

  // Oplegreacties op de raamwerkopleggingen
  const rScale = Math.max(...resA.reactions.map(Math.abs));
  for (const idx of [0, 3]) { // n1 en n4
    for (const d of [0, 1]) { // Rx, Ry
      const a = resA.reactions[n2iA.get(refA.nodeIds[idx]) * 3 + d];
      const b = resB.reactions[n2iB.get(refB.nodeIds[idx]) * 3 + d];
      checkRel(`R${d === 0 ? "x" : "y"} knoop ${refA.nodeIds[idx]}`, b, a, TOL, rScale);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────

runTrekwandOpgelegd("quad");
runTrekwandOpgelegd("triangle");
runTrekwandIngeklemd();
runKraagwand();
runStaafEquivalentie();

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
