// Houten staaf met een EIGEN doorsnede — de terugval op HEA 160 / S235.
//
// HET GEBREK DAT DEZE TEST VASTLEGT
// `resolveSection` was een keten van if / else-if waarin de eigen doorsneden
// uit de profieleditor alleen in de LAATSTE else stonden. Een houten staaf met
// een profielnaam "EIGEN:…" kwam daar nooit, viel door alle takken heen en
// kreeg de solver-default: HEA 160 in S235, dus E = 210 000 in plaats van
// 11 000. Een factor negentien in de stijfheid, met alleen een console.warn —
// de berekening liep door en de zakking zag er volstrekt normaal uit.
//
// De analytische referentie is de zakking van een vrij opgelegde ligger onder
// een gelijkmatig verdeelde last:
//
//   w = 5·q·L⁴ / (384·E·I)
//
// Met de HOUTEN stijfheid (C24, E = 11 000) hoort daar een ander getal bij dan
// met de staaldefault, en de test eist expliciet allebei: het houten getal
// moet kloppen én het stalen getal moet er ver vandaan liggen. Zou iemand de
// terugval terugzetten, dan valt de tweede eis om.
//
// Verder in deze test: beton met een eigen doorsnede (dezelfde bug, andere
// tak), het eigen gewicht (houtdichtheid en niet staaldichtheid), de weigering
// van een onbepaalbare doorsnede, en de doorvoer naar de houttoetsing
// (custom_section in TimberBeamCheckInput).

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const {
  resolveSection,
  eigenGewichtPerMeter,
  onbekendeDoorsneden,
  doorsnedeVoorSolver,
  DoorsnedeOnbekendFout,
  TIMBER_E_MEAN,
  CONCRETE_E_CM,
  E_STAAL,
} = await import("./src/lib/sectionResolver.ts");
const { eigenDoorsnedenStore } = await import("./src/lib/profieleditor/eigenDoorsnedenStore.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, gemeten, verwacht, tolPct = 0.5) {
  const tol = Math.abs(verwacht) * tolPct / 100 + 1e-9;
  const ok = Math.abs(gemeten - verwacht) <= tol;
  if (ok) { passed++; log(`  ✓ ${naam}: ${gemeten.toPrecision(6)} ~ ${verwacht.toPrecision(6)}`); }
  else { failed++; log(`  ✗ ${naam}: ${gemeten.toPrecision(6)} vs ${verwacht.toPrecision(6)}`); }
}

function eis(naam, waar, toelichting = "") {
  if (waar) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${toelichting ? " — " + toelichting : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// De eigen doorsnede: de samengestelde ligger van een externe
// referentie-berekening. Flenzen 1000 x 40 boven en onder, lijf 71 x 40,
// totale hoogte 120 mm.
//   A   = 2·1000·40 + 71·40                          =      82 840 mm²
//   I_y = 2·(1000·40³/12 + 40000·40²) + 71·40³/12    = 139 045 333 mm⁴
// ─────────────────────────────────────────────────────────────────────────
const A_MM2 = 82_840;
const IY_MM4 = 2 * (1000 * 40 ** 3 / 12 + 40000 * 40 ** 2) + 71 * 40 ** 3 / 12;

const plaat = (id, b, t, z) => ({ id, b_mm: b, t_mm: t, y_mm: 0, z_mm: z, alphaGraden: 0 });

const EIGEN = {
  id: "test-samengesteld",
  naam: "Samengestelde ligger 1000/71/1000",
  ontwerp: {
    soort: "samenstelling",
    lamellen: [plaat("f-onder", 1000, 40, 20), plaat("lijf", 71, 40, 60), plaat("f-boven", 1000, 40, 100)],
    catalogusdelen: [],
    celMeenemen: false,
    lassen: [],
  },
  eigenschappen: {
    area_mm2: A_MM2, iy_mm4: IY_MM4, iz_mm4: 0, wel_y_mm3: IY_MM4 / 60, wel_z_mm3: 0,
    wpl_y_mm3: 0, wpl_z_mm3: 0, av_y_mm2: 0, av_z_mm2: 0, it_mm4: 0, iw_mm6: 0,
    iy_radius_mm: Math.sqrt(IY_MM4 / A_MM2), iz_radius_mm: 0,
    h_mm: 120, b_mm: 1000, tw_mm: 0, tf_mm: 0, r_mm: 0,
    y_c_mm: 0, z_c_mm: 60, wel_y_top_mm3: IY_MM4 / 60, wel_y_bot_mm3: IY_MM4 / 60,
    wel_z_left_mm3: 0, wel_z_right_mm3: 0, iyz_mm4: 0, iu_mm4: IY_MM4, iv_mm4: 0,
    alpha_hoofdas_rad: 0, y_s_mm: 0, z_s_mm: 60,
  },
  vorm: "Onbekend",
  motor: {
    methode: "lamellen", wpl_bepaald: false, iw_bepaald: false,
    schuifmiddelpunt_bepaald: false, it_onzekerheid: 0, a_gaten_mm2: 0,
    y_min_mm: -500, y_max_mm: 500, z_min_mm: 0, z_max_mm: 120,
    delen: [], meldingen: [],
  },
  berekendOp: "2026-09-14T00:00:00.000Z",
};
eigenDoorsnedenStore.getState().bewaar(EIGEN);

const NAAM = `EIGEN:${EIGEN.naam}`;

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] resolveSection: materiaal bepaalt E, profiel bepaalt A en I");
{
  const hout = resolveSection("C24", NAAM);
  check("1a hout: E = E_0,mean van C24", hout.E, TIMBER_E_MEAN.C24);
  check("1b hout: A uit de eigen doorsnede", hout.A, A_MM2);
  check("1c hout: I uit de eigen doorsnede", hout.I, IY_MM4);
  eis("1d hout: bron is 'eigen', niet 'default'", hout.bron === "eigen", `bron=${hout.bron}`);
  eis("1e hout: E is NIET de staaldefault", hout.E !== E_STAAL);

  const beton = resolveSection("C30/37", NAAM);
  check("1f beton: E = E_cm van C30/37", beton.E, CONCRETE_E_CM["C30/37"]);
  eis("1g beton: bron is 'eigen'", beton.bron === "eigen", `bron=${beton.bron}`);

  const staal = resolveSection("S355", NAAM);
  check("1h staal: E = 210 000", staal.E, E_STAAL);

  const vrij = resolveSection("VRIJ:Natuursteen E=60000 rho=2700 f=8", NAAM);
  check("1i vrij materiaal: E uit de naam", vrij.E, 60000);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Eigen gewicht: houtdichtheid, niet staaldichtheid");
{
  // q = -rho · A · g / 1000 (kN/m); C24 heeft rho_mean = 420 kg/m³.
  const q = eigenGewichtPerMeter("C24", NAAM);
  check("2a q van de houten staaf", q, -(420 * (A_MM2 * 1e-6) * 9.81) / 1000);
  const qStaal = eigenGewichtPerMeter("S235", NAAM);
  eis("2b staal weegt meer dan hout", Math.abs(qStaal) > Math.abs(q) * 15);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] De zakking hoort bij de HOUTEN stijfheid — door de hele keten");
{
  const L = 4000;   // mm, twee velden van 2000 zodat er een middenknoop is
  const q = 2;      // N/mm = kN/m, omlaag
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L / 2, z: 0 }, { id: 3, x: L, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, material: "C24", profile: NAAM },
      { id: 2, from: 2, to: 3, material: "C24", profile: NAAM },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "LC1", type: "live" }],
    loads: [
      { id: 1, type: "lineLoad", beamId: 1, q: -q, caseId: 1 },
      { id: 2, type: "lineLoad", beamId: 2, q: -q, caseId: 1 },
    ],
    selfWeightEnabled: false,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
  const res = solveAllCases(bouwMultiInput(model)).perCase.get(1);
  const wMidden = Math.abs(res.displacements.get(2).uz);

  const wHout = 5 * q * L ** 4 / (384 * TIMBER_E_MEAN.C24 * IY_MM4);
  const wStaal = 5 * q * L ** 4 / (384 * E_STAAL * 1.673e7); // HEA 160-default
  check("3a zakking = 5qL^4/(384·E_hout·I_eigen)", wMidden, wHout);
  eis(
    "3b zakking hoort NIET bij de staaldefault",
    Math.abs(wMidden - wStaal) / wStaal > 0.2,
    `w=${wMidden.toFixed(3)} mm, staaldefault=${wStaal.toFixed(3)} mm`,
  );
  log(`      hout ${wHout.toFixed(3)} mm  vs  staaldefault ${wStaal.toFixed(3)} mm`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Onbepaalbare doorsnede: stoppen met reden, niet doorrekenen");
{
  const weg = resolveSection("C24", "EIGEN:Bestaat niet");
  eis("4a weggeraakte eigen doorsnede -> bron 'default'", weg.bron === "default");
  eis("4b met leesbare reden", typeof weg.reden === "string" && weg.reden.includes("bewaard"), weg.reden);

  const geenProfiel = resolveSection("C24", undefined);
  eis("4c staaf zonder profiel -> bron 'default'", geenProfiel.bron === "default");
  eis("4d met een reden die een houtvoorbeeld noemt",
      (geenProfiel.reden ?? "").includes("96x450"), geenProfiel.reden);

  const onzin = resolveSection("S235", "IPE onbekend");
  eis("4e onbekend staalprofiel -> bron 'default'", onzin.bron === "default");

  const lijst = onbekendeDoorsneden([
    { id: 7, material: "C24", profile: NAAM },
    { id: 8, material: "C24", profile: "EIGEN:Bestaat niet" },
  ]);
  eis("4f onbekendeDoorsneden meldt alleen staaf 8",
      lijst.length === 1 && lijst[0].beamId === 8, JSON.stringify(lijst));

  let gegooid = null;
  try { doorsnedeVoorSolver("C24", "EIGEN:Bestaat niet", 8); } catch (e) { gegooid = e; }
  eis("4g doorsnedeVoorSolver gooit DoorsnedeOnbekendFout",
      gegooid instanceof DoorsnedeOnbekendFout, String(gegooid));
  eis("4h de melding noemt de staaf", (gegooid?.message ?? "").includes("Staaf 8"), gegooid?.message);

  const stukModel = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 3, from: 1, to: 2, material: "C24", profile: "EIGEN:Bestaat niet" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases: [{ id: 1, name: "LC1", type: "live" }], loads: [],
    selfWeightEnabled: false, scheefstandEnabled: false,
    scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  let fout = null;
  try { bouwMultiInput(stukModel); } catch (e) { fout = e; }
  eis("4i bouwMultiInput stopt de berekening", fout instanceof DoorsnedeOnbekendFout, String(fout));
  eis("4j en noemt staaf 3 met reden",
      (fout?.message ?? "").includes("staaf 3") && (fout?.message ?? "").includes("bewaard"),
      fout?.message);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Doorvoer naar de houttoetsing: custom_section in de invoer");
{
  // Echte solveruitvoer, geen nagemaakte: zo bewijst de test ook dat het
  // krachtsverloop van deze staaf de toetsinvoer haalt.
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }];
  const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
  const model = (profiel) => ({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: profiel }],
    supports,
    plates: [],
    loadCases: [{ id: 1, name: "LC1", type: "live" }],
    loads: [{ id: 1, type: "lineLoad", beamId: 1, q: -2, caseId: 1 }],
    selfWeightEnabled: false,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  });
  const combinaties = [
    { id: 1, name: "UGT 6.10", type: "uls", formula: "1,35G + 1,5Q", factors: { 1: 1.5 } },
    { id: 2, name: "BGT karakteristiek", type: "sls", formula: "G + Q", factors: { 1: 1.0 } },
  ];
  const res = solveAllCases(bouwMultiInput(model(NAAM))).perCase.get(1);
  const resultaten = new Map([[1, res], [2, res]]);

  const uit = buildTimberCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: NAAM }],
    supports,
    combinations: combinaties,
    combinationResults: resultaten,
  });
  eis("5a de houten staaf wordt niet meer overgeslagen",
      uit.inputs.length === 1, JSON.stringify(uit.skipped));
  const inv = uit.inputs[0];
  eis("5b custom_section gaat mee", !!inv?.custom_section, JSON.stringify(inv?.custom_section ?? null));
  eis("5c met drie lamellen", inv?.custom_section?.lamellen?.length === 3);
  check("5d omhullende hoogte", inv?.height_mm ?? 0, 120);
  check("5e omhullende breedte", inv?.width_mm ?? 0, 1000);
  eis("5f de sterkteklasse blijft C24", inv?.strength_class === "C24");

  const weg = buildTimberCheckInputs({
    nodes,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "EIGEN:Bestaat niet" }],
    supports,
    combinations: combinaties,
    combinationResults: resultaten,
  });
  eis("5g een weggeraakte doorsnede wordt overgeslagen met reden",
      weg.inputs.length === 0 && (weg.skipped[0]?.reason ?? "").includes("bewaard"),
      JSON.stringify(weg.skipped));
}

log(`
${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
