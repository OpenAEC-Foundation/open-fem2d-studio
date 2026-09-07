// Taak B3 — doorbuigingstoets gebruikt het VELDmaximum, niet de knopen.
// Verifieert dat steelCheckBuilder/timberCheckBuilder de zakking voor de
// BGT-doorbuigingstoets uit de 21-station deflection[]-arrays halen (max |w|,
// teken behouden: negatief = omlaag, conform de kern-conventie) en dus voor
// een vrij opgelegde ligger ≈ 5qL⁴/384EI doorgeven en NIET ~0 (de knopen
// zakken daar immers niet).
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-doorbuiging-toets.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const {
  buildSteelCheckInputs,
  collinearContinuations,
  deflectionNotesFor,
  extractFieldDeflectionMm,
} = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

const E = 210000; // N/mm²
const I = 1e8;    // mm⁴
const A = 3877;   // mm²
const L = 6000;   // mm
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 1) {
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
// Model: vrij opgelegde ligger L=6 m, twee lastgevallen
//   G (case 1): q = -5 N/mm,  Q (case 2): q = -5 N/mm
// SLS Karakteristiek (combo 6) = 1,0·G + 1,0·Q → q = 10 N/mm
//   w_mid = 5qL⁴/384EI = 5·10·6000⁴/(384·210000·1e8) = 8,0357 mm (omlaag)
// ─────────────────────────────────────────────────────────────────────────
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
const solverBeams = [{ id: 1, from: 1, to: 2, E, A, I }];
const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];

const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -5 }] })],
  [2, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: -5 }] })],
]);

const combos = defaultCombinations();
const combinationResults = new Map(
  combos.map((c) => [c.id, combineResults(c, perCase)]),
);

const wExp = 5 * 10 * Math.pow(L, 4) / (384 * E * I); // 8,0357 mm

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Sanity: knopen zakken niet, veld wel (anders test dit niets)");
{
  const slsRes = combinationResults.get(6);
  const d1 = slsRes.displacements.get(1), d2 = slsRes.displacements.get(2);
  checkTrue("|uz| eindknopen < 0.01 mm", Math.abs(d1.uz) < 0.01 && Math.abs(d2.uz) < 0.01);
  check("|w_mid| station-array = 5qL⁴/384EI", Math.abs(slsRes.elements.get(1).deflection[10]), wExp, 1);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Staal: deflection_actual_max_mm = veldmaximum (teken behouden)");
{
  const { inputs, skipped } = buildSteelCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" }],
    combinations: combos,
    combinationResults,
    profileDb: new Map([["HEA160", { geometry: { h: 152 } }]]),
  });
  checkTrue("1 input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const w = inputs[0]?.deflection_actual_max_mm ?? NaN;
  checkTrue("NIET ~0 (de oude knoop-extractie gaf hier 0)", Math.abs(w) > 1);
  check("|w| = 5qL⁴/384EI", Math.abs(w), wExp, 1);
  checkTrue("teken negatief (omlaag, kern-conventie)", w < 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Hout: w_inst uit de karakteristieke, w_qp uit de QUASI-BLIJVENDE combinatie");
{
  const { inputs, skipped } = buildTimberCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "60x100" }],
    combinations: combos,
    combinationResults,
  });
  checkTrue("1 input, 0 skipped", inputs.length === 1 && skipped.length === 0);
  const wi = inputs[0]?.deflection_inst_mm ?? NaN;
  const wq = inputs[0]?.deflection_quasi_perm_mm ?? NaN;
  checkTrue("w_inst NIET ~0", Math.abs(wi) > 1);
  check("|w_inst| = 5qL⁴/384EI", Math.abs(wi), wExp, 1);
  checkTrue("w_inst negatief (omlaag)", wi < 0);

  // Bevroren grenswaarde. G (case 1) en Q (case 2) leveren elk q = -5 N/mm.
  //   SLS Karakteristiek (combo 6) = 1,0·G + 1,0·Q       → q = -10   → w_inst
  //   SLS Quasi-permanent (combo 8) = 1,0·G + ψ₂·Q, ψ₂ = 0,3
  //                                                      → q = -6,5  → w_qp
  // w is lineair in q, dus w_qp/w_inst = 6,5/10 = 0,65 exact.
  // Vóór september 2026 stond hier w_qp = w_inst (de volle last), 1/0,65 ≈ 1,54
  // keer te hoog; de kruipterm k_def·w_qp viel daarmee even veel te hoog uit.
  check("w_qp = 0,65 · w_inst (G + ψ₂·Q, ψ₂ = 0,3 voor Q)", wq, 0.65 * wi, 0.01);
  const notes = (inputs[0]?.deflection_notes ?? []).join(" ");
  checkTrue("notitie noemt de gebruikte combinatie",
    /quasi-blijvende BGT-combinatie "SLS Quasi-permanent"/.test(notes));
  checkTrue("notitie noemt de koorde als referentielijn", /vanaf de koorde/.test(notes));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3b] Hout: geen quasi-blijvende combinatie → volle last MET notitie");
{
  // Zelfde model, maar de quasi-blijvende combinatie is uit de lijst gehaald.
  const zonderQp = combos.filter((c) => !/quasi/i.test(c.name));
  const { inputs } = buildTimberCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "60x100" }],
    combinations: zonderQp,
    combinationResults,
  });
  const wi = inputs[0]?.deflection_inst_mm ?? NaN;
  const wq = inputs[0]?.deflection_quasi_perm_mm ?? NaN;
  check("terugval: w_qp = w_inst (volle last)", wq, wi, 0.01);
  const notes = (inputs[0]?.deflection_notes ?? []).join(" ");
  checkTrue("terugval is expliciet gemeld, niet stilzwijgend",
    /geen quasi-blijvende BGT-combinatie/.test(notes));
  checkTrue("notitie zegt dat het veilig-zijdig maar te hoog is",
    /veilig-zijdig/.test(notes));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Koorde-aftrek: max |w − koorde|, teken behouden");
{
  // w = [0, 3.2, -5.7] op x = [0, 500, 1000]. De koorde loopt van 0 naar -5,7,
  // dus koorde(500) = -2,85. Dan is w − koorde = [0, +6,05, 0] en is 6,05 het
  // maximum. Vóór september 2026 gaf dit -5,7: de ABSOLUTE verplaatsing van het
  // staafeind, wat helemaal geen doorbuiging is.
  const fake = {
    displacements: new Map([[1, { ux: 0, uz: 0, ry: 0 }], [2, { ux: 0, uz: 0, ry: 0 }]]),
    reactions: new Map(),
    elements: new Map([[7, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 1000,
      stations_mm: [0, 500, 1000],
      normalForce: [0, 0, 0], shearForce: [0, 0, 0], bendingMoment: [0, 0, 0],
      deflection: [0, 3.2, -5.7], axialDisp: [0, 0, 0],
    }]]),
    maxDisplacement: 0,
  };
  const w = extractFieldDeflectionMm({ id: 7, from: 1, to: 2 }, fake);
  check("w = 3.2 − (−2.85) = 6.05 (vanaf de koorde)", w, 6.05, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4b] Koorde-aftrek: starre zakking en rotatie tellen NIET mee");
{
  // Vrij opgelegde ligger, maar beide steunpunten zakken mee: 20 mm links,
  // 30 mm rechts. De echte doorbuiging is de parabool eromheen (hier −4 mm in
  // het midden). Zonder koorde-aftrek zou hier −29 mm uitkomen — ruim 7 keer
  // te veel, precies het defect dat in een referentievergelijking opdook.
  const parabool = [0, -3, -4, -3, 0];                 // echte doorbuiging
  const star = [-20, -22.5, -25, -27.5, -30];          // lineaire meebeweging
  const fake = {
    displacements: new Map(),
    reactions: new Map(),
    elements: new Map([[9, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 4000,
      stations_mm: [0, 1000, 2000, 3000, 4000],
      normalForce: [0, 0, 0, 0, 0], shearForce: [0, 0, 0, 0, 0],
      bendingMoment: [0, 0, 0, 0, 0],
      deflection: parabool.map((v, i) => v + star[i]),
      axialDisp: [0, 0, 0, 0, 0],
    }]]),
    maxDisplacement: 0,
  };
  const w = extractFieldDeflectionMm({ id: 9, from: 1, to: 2 }, fake);
  check("w = -4 mm (de parabool), niet -29 mm (parabool + starre beweging)", w, -4, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4c] Vrij opgelegd op onwrikbare steunpunten: koorde = 0, niets verandert");
{
  const fake = {
    displacements: new Map(),
    reactions: new Map(),
    elements: new Map([[11, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 4000,
      stations_mm: [0, 1000, 2000, 3000, 4000],
      normalForce: [0, 0, 0, 0, 0], shearForce: [0, 0, 0, 0, 0],
      bendingMoment: [0, 0, 0, 0, 0],
      deflection: [0, -3, -4, -3, 0], axialDisp: [0, 0, 0, 0, 0],
    }]]),
    maxDisplacement: 0,
  };
  check("w = -4 mm, onveranderd t.o.v. de oude absolute meting",
    extractFieldDeflectionMm({ id: 11, from: 1, to: 2 }, fake), -4, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Fallback: geen station-arrays (ouder resultaat) → knooppad + warn");
{
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  const oldStyle = {
    displacements: new Map([
      [1, { ux: 0, uz: -12.3, ry: 0 }],
      [2, { ux: 0, uz: -3.0, ry: 0 }],
    ]),
    reactions: new Map(),
    elements: new Map([[7, {
      N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 1000,
      stations_mm: [0, 500, 1000],
      normalForce: [0, 0, 0], shearForce: [0, 0, 0], bendingMoment: [0, 0, 0],
      // GEEN deflection/axialDisp — resultaat van vóór de veldzakking-uitbreiding
    }]]),
    maxDisplacement: 12.3,
  };
  const w = extractFieldDeflectionMm({ id: 7, from: 1, to: 2 }, oldStyle);
  console.warn = origWarn;
  check("fallback: signed knoop-uz met max |uz|", w, -12.3, 0.01);
  // De waarschuwing moet zeggen dat dit pad de ABSOLUTE verplaatsing levert en
  // niet de doorbuiging vanaf de koorde — anders leest een te grote of te
  // kleine waarde als een gewone uitkomst.
  checkTrue("console.warn noemt het risico in beide richtingen",
    warns.length >= 1 && /onderschat als overschat/i.test(warns.join(" ")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Geen resultaat → 0 (geen crash)");
{
  const w = extractFieldDeflectionMm({ id: 1, from: 1, to: 2 }, null);
  check("null-resultaat → 0", w, 0, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Doorgeknipte staaf: gemeld in het rapport, niet stilzwijgend per deel");
{
  // 1 ── 2 ── 3, twee staafdelen met dezelfde doorsnede in elkaars verlengde.
  const ketenNodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }, { id: 3, x: 6000, z: 0 },
  ];
  const deel1 = { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" };
  const deel2 = { id: 2, from: 2, to: 3, material: "S235", profile: "HEA160" };
  const ketenBeams = [deel1, deel2];

  // (a) geen oplegging op knoop 2 → één overspanning, dus melden.
  const zonderSteun = [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }];
  const vervolg = collinearContinuations(deel1, ketenNodes, ketenBeams, zonderSteun);
  checkTrue("staaf 1 loopt door in staaf 2", vervolg.length === 1 && vervolg[0] === 2);
  const nZonder = deflectionNotesFor(deel1, ketenNodes, ketenBeams, zonderSteun).join(" ");
  checkTrue("melding over toetsing per staafdeel", /per staafdeel getoetst/.test(nZonder));

  // (b) wél een oplegging op knoop 2 → twee overspanningen, dus GEEN melding.
  const metSteun = [...zonderSteun, { nodeId: 2, type: "zRoller" }];
  checkTrue("tussensteunpunt → geen doorloop",
    collinearContinuations(deel1, ketenNodes, ketenBeams, metSteun).length === 0);
  const nMet = deflectionNotesFor(deel1, ketenNodes, ketenBeams, metSteun).join(" ");
  checkTrue("geen valse melding bij een echt tussensteunpunt",
    !/per staafdeel getoetst/.test(nMet) && /vanaf de koorde/.test(nMet));

  // (c) een kolom op knoop 2 is niet collineair → geen melding.
  const kolom = { id: 3, from: 2, to: 4, material: "S235", profile: "HEA160" };
  const portaalNodes = [...ketenNodes, { id: 4, x: 3000, z: -3000 }];
  checkTrue("haakse staaf telt niet als doorloop",
    collinearContinuations(kolom, portaalNodes, [deel1, deel2, kolom], zonderSteun).length === 0);

  // (d) ander profiel op hetzelfde hart → geen doorlopende ligger.
  const anderProfiel = { ...deel2, profile: "IPE300" };
  checkTrue("ander profiel telt niet als doorloop",
    collinearContinuations(deel1, ketenNodes, [deel1, anderProfiel], zonderSteun).length === 0);

  // (e) opleggingen niet meegegeven → melden mét het voorbehoud.
  const nOnbekend = deflectionNotesFor(deel1, ketenNodes, ketenBeams, undefined).join(" ");
  checkTrue("zonder opleggingenlijst wordt het voorbehoud vermeld",
    /niet meegegeven aan de toetsbouwer/.test(nOnbekend));
}

log(`\n${"─".repeat(60)}`);
log(`Totaal: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
