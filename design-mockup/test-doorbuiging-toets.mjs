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
  bepaalDoorbuigingsInvoer,
  buildSteelCheckInputs,
  collinearContinuations,
  deflectionNotesFor,
  extractFieldDeflectionMm,
  hellingGradenVanStaaf,
  isOverwegendVerticaal,
  zijdelingseVerplaatsingMm,
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

// ═════════════════════════════════════════════════════════════════════════
//  [8] Een KOLOM krijgt geen vloercriterium
// ═════════════════════════════════════════════════════════════════════════
//
// Bevinding uit de beproeving van het startmodel: de doorbuigingstoets werd
// onvoorwaardelijk op elke stalen staaf losgelaten, ook op de twee verticale
// portaalkolommen. Die kregen daardoor 21,42 mm getoetst aan 3/1 000 · ℓ_rep
// = 15 mm — unity check 1,43, met in het rapport "overige vloeren en daken die
// intensief door personen worden gebruikt" onder een kolom. Alle vier de
// gedachtestreepjes van NEN-EN 1990:2002/NB:2019 A1.4.3(3) gaan over een
// vloer, een dak of een vloerafscheiding, en A1.4.3(4) begrenst w_max "bij
// zowel vloeren als daken"; een kolom is geen van beide. Voor een verticale
// staaf geeft A1.4.3(7) wél een grens: de horizontale verplaatsing over de
// hoogte, bij de karakteristieke combinatie (6.14b), h/300 voor andere
// gebouwen dan industriegebouwen.
//
// Het model is het stalen portaal uit het startmodel: 12 m overspanning,
// 5 m hoge kolommen, twee scharnieren aan de voet, q = −5 N/mm op de regel.
log("\n[8] Kolom: A1.4.3(7) h/300 op de zijdelingse verplaatsing, geen vloereis");
{
  // HEA 160, zodat de getallen hieronder dezelfde zijn als in het startmodel:
  // A = 3 877 mm², I_y = 1 673 cm⁴.
  const H = 5000, B = 12000, Ihea = 1.673e7;
  const pNodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: B, z: 0 },
    { id: 3, x: 0, z: H }, { id: 4, x: B, z: H },
  ];
  const pSolverBeams = [
    { id: 1, from: 1, to: 3, E, A, I: Ihea },
    { id: 2, from: 2, to: 4, E, A, I: Ihea },
    { id: 3, from: 3, to: 4, E, A, I: Ihea },
  ];
  const pSupports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }];
  const pPerCase = new Map([
    [1, solve({ nodes: pNodes, beams: pSolverBeams, supports: pSupports,
                loads: [{ beamId: 3, q: -5 }] })],
  ]);
  const pCombos = defaultCombinations();
  const pResults = new Map(pCombos.map((c) => [c.id, combineResults(c, pPerCase)]));
  const kolom = { id: 1, from: 1, to: 3, material: "S235", profile: "HEA160" };
  const regel = { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" };
  const pBeams = [kolom, { id: 2, from: 2, to: 4, material: "S235", profile: "HEA160" }, regel];
  const pData = {
    nodes: pNodes, beams: pBeams, supports: pSupports,
    combinations: pCombos, combinationResults: pResults,
  };

  // Sanity: zonder deze twee regels bewijst de rest niets.
  const slsRes = pResults.get(6);
  const kromming = extractFieldDeflectionMm(kolom, slsRes);
  // Precies de twee getallen uit de beproeving van het startmodel: de kolom
  // kromt 21,4 mm en de regel zakt 144 mm. Zonder deze regels bewijst de rest
  // niets — dan zou de toets ook "voldoet" melden omdat er niets gebeurt.
  check("sanity: de kolom kromt 21,4 mm vanaf de koorde", Math.abs(kromming), 21.42, 2);
  check("sanity: de regel zakt 144 mm",
    Math.abs(extractFieldDeflectionMm(regel, slsRes)), 143.97, 2);
  checkTrue("sanity: de oude vloereis 3/1 000 · 5 000 = 15 mm zou hier UC 1,4 geven",
    Math.abs(kromming) / (H * 3 / 1000) > 1.3);

  const kolomInvoer = bepaalDoorbuigingsInvoer(kolom, pData);
  check("kolom: eis is de zijdelingse", kolomInvoer.eis === "zijdelings" ? 1 : 0, 1);
  check("kolom: noemer 300 (h/300, A1.4.3(7))", kolomInvoer.noemerFin, 300);
  check("kolom: dezelfde noemer voor w_add", kolomInvoer.noemerAdd, 300);
  checkTrue("kolom: klasse is niet meer een vloer-/dakcategorie",
    kolomInvoer.klasse === "Custom");
  checkTrue("kolom: geen ℓ_rep-verdubbeling", kolomInvoer.isUitkraging === false);

  // De getoetste grootheid is u = u_x(boven) − u_x(onder), NIET de kromming.
  const u = zijdelingseVerplaatsingMm(kolom, pNodes, slsRes);
  check("kolom: getoetst wordt u_x(boven) − u_x(onder)", kolomInvoer.wMm, u, 0.01);
  checkTrue("kolom: dat is NIET de kromming vanaf de koorde",
    Math.abs(kolomInvoer.wMm - kromming) > 5);

  const kn = kolomInvoer.notes.join(" ");
  checkTrue("kolom: notitie zegt dat de vloer-/dakeis niet is toegepast",
    /NIET toegepast/.test(kn) && /A1\.4\.3\(3\)/.test(kn));
  checkTrue("kolom: notitie noemt A1.4.3(7) en h/300",
    /A1\.4\.3\(7\)/.test(kn) && /h\/300/.test(kn));
  checkTrue("kolom: notitie noemt de karakteristieke combinatie (6.14b)",
    /6\.14b/.test(kn) && /Karakteristiek/.test(kn));
  checkTrue("kolom: aannames (industriegebouw h/150, h, h/500) staan erbij",
    /h\/150/.test(kn) && /h\/500/.test(kn));

  // De regel is horizontaal en houdt de vloereis.
  const regelInvoer = bepaalDoorbuigingsInvoer(regel, pData);
  check("regel: eis blijft de vloer-/dakeis", regelInvoer.eis === "vloerdak" ? 1 : 0, 1);
  checkTrue("regel: klasse blijft Floor", regelInvoer.klasse === "Floor");
  check("regel: w blijft de kromming vanaf de koorde",
    regelInvoer.wMm, extractFieldDeflectionMm(regel, slsRes), 0.01);

  // Hetzelfde langs de volledige bouwer, want dáár komt het rapport vandaan.
  const { inputs } = buildSteelCheckInputs({
    ...pData, profileDb: new Map([["HEA160", { geometry: { h: 152 } }]]),
  });
  const inKolom = inputs.find((i) => i.beam_id === 1);
  const inRegel = inputs.find((i) => i.beam_id === 3);
  checkTrue("bouwer: kolom → Custom met noemer 300",
    inKolom?.deflection_limit_class === "Custom" &&
    inKolom?.deflection_limit_numerator === 300 &&
    inKolom?.deflection_add_limit_numerator === 300);
  checkTrue("bouwer: regel → Floor met de klassenoemer uit de kern",
    inRegel?.deflection_limit_class === "Floor" &&
    inRegel?.deflection_add_limit_numerator === 0);
  checkTrue("bouwer: kolom-UC op h/300 blijft ruim onder 1 (portaal zwaait niet)",
    Math.abs(inKolom.deflection_actual_max_mm) / (5000 / 300) < 1);

  // Ontsnappingsluik: kiest de gebruiker zelf een klasse, dan geldt die.
  const metKlasse = bepaalDoorbuigingsInvoer(
    { ...kolom, checkConfig: { deflectionClass: "floor" } }, pData,
  );
  check("kolom met expliciete klasse: vloereis geldt weer",
    metKlasse.eis === "vloerdak" ? 1 : 0, 1);
  checkTrue("kolom met expliciete klasse: klasse Floor", metKlasse.klasse === "Floor");

  // Drempel: 75°, dezelfde die bepaalStandaardRol hanteert.
  const schuin60 = { id: 9, from: 1, to: 10 };
  const schuinNodes = [...pNodes, { id: 10, x: 1000, z: 1732 }]; // 60°
  check("hellingshoek 60° wordt correct berekend",
    hellingGradenVanStaaf(schuin60, schuinNodes), 60, 0.5);
  checkTrue("60° telt NIET als verticaal", !isOverwegendVerticaal(schuin60, schuinNodes));
  const steil80 = { id: 9, from: 1, to: 11 };
  const steilNodes = [...pNodes, { id: 11, x: 1000, z: 5671 }]; // 80°
  checkTrue("80° telt WEL als verticaal", isOverwegendVerticaal(steil80, steilNodes));
}

// ═════════════════════════════════════════════════════════════════════════
//  [9] w_add, w_perm en de belastingscombinatie staan in het rapport
// ═════════════════════════════════════════════════════════════════════════
//
// Tweede bevinding: de bouwer voerde onvoorwaardelijk de KARAKTERISTIEKE
// combinatie, terwijl de notitie die de kern bij w_add meestuurt de FREQUENTE
// (6.15b) noemt — het rapport zei dus niet wat er gerekend was. En
// `deflection_permanent_mm: 0` maakt w_add gelijk aan w_fin, twee rapportregels
// met hetzelfde getal, zonder dat ergens stond waarom.
//
// Model: vrij opgelegde ligger met een blijvende neerwaartse last (G) en
// WINDZUIGING (W) omhoog. De standaardcombinaties geven dan:
//   karakteristiek (6.14b) = G + 0,6·W  → de KLEINSTE zakking
//   frequent       (6.15b) = G          → de grootste
//   quasi-blijvend (6.16b) = G          → idem
// "De karakteristieke is toch altijd de zwaarste" is hier dus aantoonbaar
// onwaar; wie alleen die combinatie voert, toetst 40 % van de zakking.
log("\n[9] BGT-combinatie en w_perm: gerekend én verantwoord in het rapport");
{
  const qG = -6, qW = +5; // N/mm — W is zuiging (omhoog)
  const zuigingCases = new Map([
    [1, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: qG }] })],
    [4, solve({ nodes, beams: solverBeams, supports, loads: [{ beamId: 1, q: qW }] })],
  ]);
  const zCombos = defaultCombinations();
  const zResults = new Map(zCombos.map((c) => [c.id, combineResults(c, zuigingCases)]));
  const ligger = { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" };
  const zData = {
    nodes, beams: [ligger], supports,
    combinations: zCombos, combinationResults: zResults,
  };

  const wKar = extractFieldDeflectionMm(ligger, zResults.get(6)); // G + 0,6·W
  const wFreq = extractFieldDeflectionMm(ligger, zResults.get(7)); // G
  checkTrue("sanity: de karakteristieke geeft hier de KLEINSTE zakking",
    Math.abs(wKar) < Math.abs(wFreq) - 1);
  check("sanity: w_kar = (6 − 0,6·5)/6 · w_freq", wKar, (3 / 6) * wFreq, 0.5);

  const invoer = bepaalDoorbuigingsInvoer(ligger, zData);
  check("maatgevend is de grootste van de voorgeschreven combinaties",
    invoer.wMm, wFreq, 0.01);
  checkTrue("en dus NIET de karakteristieke", Math.abs(invoer.wMm - wKar) > 1);

  const n = invoer.notes.join(" ");
  checkTrue("notitie noemt de maatgevende combinatie bij naam",
    /Maatgevend is "SLS Frequent"/.test(n));
  checkTrue("notitie noemt alle drie de uitdrukkingen die A1.4.3 aanwijst",
    /6\.14b/.test(n) && /6\.15b/.test(n) && /6\.16b/.test(n));
  checkTrue("notitie legt uit dat één zakking twee toetsen voedt",
    /w_fin én w_add uit één zakking/.test(n));
  checkTrue("notitie meldt dat w_add gelijk is aan w_fin",
    /w_add is hier GELIJK aan w_fin/.test(n));
  checkTrue("notitie zegt waarom: w1 is niet af te leiden",
    /geen BGT-combinatie met uitsluitend de blijvende belasting/.test(n));
  checkTrue("notitie zegt dat de w_add-regel daarmee geen w2 + w3 is",
    /geen w2 \+ w3/.test(n));

  // Diezelfde notities moeten ook langs de volledige bouwer in de invoer voor
  // de kern belanden — daar leest het rapport ze uit.
  const { inputs } = buildSteelCheckInputs({
    ...zData, profileDb: new Map([["HEA160", { geometry: { h: 152 } }]]),
  });
  const bn = (inputs[0]?.deflection_notes ?? []).join(" ");
  checkTrue("bouwer: de verantwoording zit in deflection_notes",
    /Maatgevend is "SLS Frequent"/.test(bn) && /w_add is hier GELIJK aan w_fin/.test(bn));
  checkTrue("bouwer: de koorde-referentielijn staat er nog steeds bij",
    /vanaf de koorde/.test(bn));

  // Ontbrekende combinaties worden gemeld, niet stilzwijgend overgeslagen.
  const alleenKar = zCombos.filter((c) => c.type !== "sls" || /karakter/i.test(c.name));
  const magerNotes = bepaalDoorbuigingsInvoer(ligger, { ...zData, combinations: alleenKar })
    .notes.join(" ");
  checkTrue("ontbrekende voorgeschreven combinaties staan in het rapport",
    /Niet meegewogen/.test(magerNotes) && /6\.15b en 6\.16b/.test(magerNotes));
}

log(`\n${"─".repeat(60)}`);
log(`Totaal: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
