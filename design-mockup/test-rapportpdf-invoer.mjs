// De brug van de stores naar de PDF-uitdraai van de rekenkern.
//
// WAT HIER VASTLIGT
// `bouwRapportInvoer` is de ENIGE plaats waar de projectinstelling, de
// toetsresultaten en het segmentspoor van de fysisch niet-lineaire tweede orde
// tot één `ReportInput` worden samengevoegd. Gaat daar iets mis, dan mist de
// PDF stilzwijgend een hoofdstuk — en een ontbrekend hoofdstuk valt niet op,
// want er staat niets waar iets zou moeten staan.
//
// DE VIJF MANIEREN WAAROP DIT MIS KAN GAAN, alle vijf hier afgedekt:
//
//  1. De toetsresultaten belanden in de verkeerde emmer. Staal, hout en beton
//     hebben elk hun eigen veld; hout is in `checkTypes` de TERUGVAL, dus een
//     betonresultaat dat niet herkend wordt komt er stilletjes bij te staan.
//  2. Het spoor wordt verkeerd omgezet. De store schrijft camelCase, de
//     rekenkern snake_case; één vergeten veld en de tabel is leeg.
//  3. Een leeg spoor gaat toch mee. Het veld hoort dan WEG te blijven, zodat
//     het betonhoofdstuk zijn eerlijke melding toont in plaats van een tabel
//     met nul regels.
//  4. De reden bij een overgeslagen staaf wordt geherformuleerd. Die tekst komt
//     uit de rekengang en gaat woordelijk mee.
//  5. Het kernantwoord wordt onderweg aangeraakt. `SegmentStiffnessResponse`
//     is aan beide kanten hetzelfde type en moet ONGEWIJZIGD doorgaan.
//
// Draaien met: npx tsx test-rapportpdf-invoer.mjs

const { bouwRapportInvoer, spoorVoorPdf } = await import("./src/lib/rapportPdfInvoer.ts");

let passed = 0,
  failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${extra ? " — " + extra : ""}`);
  }
}

function checkGelijk(naam, actueel, verwacht) {
  const ok = JSON.stringify(actueel) === JSON.stringify(verwacht);
  if (ok) {
    passed++;
    log(`  ✓ ${naam}: ${JSON.stringify(actueel)}`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${JSON.stringify(actueel)} vs ${JSON.stringify(verwacht)}`);
  }
}

// ── Toetsresultaten zoals de vijf kernen ze leveren. Alleen de velden waar
//    `checkTypes` op onderscheidt plus wat de uitdraai overneemt. ──
const staal = (id) => ({
  beam_id: id,
  profile_name: "HEB160",
  steel_grade: "S235",
  checks: [],
  uc_max: 0.4,
  status: "Ok",
  governing_check_id: "comp",
});
const hout = (id) => ({
  beam_id: id,
  section_name: "96 x 450",
  strength_class: "C24",
  checks: [],
  uc_max: 0.5,
  status: "Ok",
  governing_check_id: "bending",
});
const beton = (id) => ({
  beam_id: id,
  section_name: "300 x 500",
  concrete_class: "C30/37",
  reinforcement_grade: "B500B",
  reinforcement_summary: "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm",
  checks: [],
  uc_max: 0.7,
  status: "Ok",
  governing_check_id: "6.1_mn_kappa",
});
const vrij = (id) => ({
  beam_id: id,
  section_name: "200 x 200",
  material_name: "natuursteen",
  f_toel_mpa: 8,
  checks: [],
  uc_max: 0.3,
  status: "Ok",
  governing_check_id: "sigma_eq",
});
const clt = (id) => ({
  beam_id: id,
  section_name: "CLT 100",
  strength_class: "C24",
  // `isCltCheckResult` herkent een lamellenopbouw.
  layup: [],
  lamellen: [],
  checks: [],
  uc_max: 0.2,
  status: "Ok",
  governing_check_id: "clt_bending",
});

const project = {
  name: "Betonportaal",
  projectNumber: "BT-001",
  engineer: "M. V.",
  company: "OpenAEC Foundation",
  date: "2026-09-08",
};

// Eén kernantwoord; de inhoud doet er hier niet toe, wél dat het ONGEWIJZIGD
// doorgaat.
const kernantwoord = {
  beam_id: 1,
  section_name: "300 x 500",
  concrete_class: "C30/37",
  reinforcement_grade: "B500B",
  reinforcement_summary: "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm",
  length_m: 6,
  segment_length_mm: 400,
  segment_count: 15,
  segmentation_rule: "n = max(1; round(L / L_doel)); alle segmenten even lang",
  creep_note: "Er is ZONDER kruip gerekend: φ_ef = 0.",
  converged: true,
  segments: [],
  notes: [],
};

const spoor = {
  segmentLengteMm: 400,
  combinaties: [
    {
      combinatieId: 3,
      combinatieNaam: "BGT-kar 1",
      grenstoestand: "MeanValues",
      ronden: 3,
      verloop: [
        { ronde: 1, maxRelatieveVerandering: null, geconvergeerd: false },
        { ronde: 2, maxRelatieveVerandering: 0.004, geconvergeerd: true },
      ],
      staven: [kernantwoord],
    },
  ],
  overgeslagen: [{ beamId: 7, reason: "geen wapeningskorf opgegeven" }],
  staafdoorsneden: [
    {
      beamId: 1,
      doorsnede: { shape: "Rectangle", b_mm: 300, h_mm: 500 },
      korf: {
        cover_mm: 30,
        stirrup_diameter_mm: 8,
        top: { count: 2, diameter_mm: 12 },
        bottom: { count: 3, diameter_mm: 16 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De toetsresultaten komen in de juiste emmer");
{
  const invoer = bouwRapportInvoer({
    project,
    checkResults: [staal(1), hout(2), beton(3), vrij(4), clt(5)],
  });
  checkGelijk("staal", invoer.steel_check_results.map((r) => r.beam_id), [1]);
  checkGelijk("hout", (invoer.timber_check_results ?? []).map((r) => r.beam_id), [2]);
  checkGelijk("beton", (invoer.concrete_check_results ?? []).map((r) => r.beam_id), [3]);
  checkWaar(
    "de vrije spanningstoets en kruislaaghout gaan NIET als hout mee",
    !(invoer.timber_check_results ?? []).some((r) => r.beam_id === 4 || r.beam_id === 5),
    "ReportInput kent er geen veld voor; meesturen zou ze als EN 1995 laten lezen",
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De projectgegevens komen op het omslag");
{
  const invoer = bouwRapportInvoer({ project, checkResults: [staal(1)] });
  checkGelijk("naam", invoer.project_name, "Betonportaal");
  checkGelijk("nummer", invoer.project_number, "BT-001");
  checkGelijk("datum", invoer.date, "2026-09-08");

  const leeg = bouwRapportInvoer({
    project: { name: "", projectNumber: "", engineer: "", company: "", date: "" },
    checkResults: [staal(1)],
  });
  checkGelijk("een naamloos project krijgt een naam", leeg.project_name, "Naamloos");
  checkWaar(
    "een lege datum wordt vandaag",
    /^\d{4}-\d{2}-\d{2}$/.test(leeg.date),
    leeg.date,
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Het segmentspoor wordt volledig omgezet");
{
  const uit = spoorVoorPdf(spoor);
  checkGelijk("segmentlengte", uit.segment_lengte_mm, 400);
  checkGelijk("combinatie-id", uit.combinaties[0].combinatie_id, 3);
  checkGelijk("combinatienaam", uit.combinaties[0].combinatie_naam, "BGT-kar 1");
  checkGelijk("grenstoestand", uit.combinaties[0].grenstoestand, "MeanValues");
  checkGelijk("ronden", uit.combinaties[0].ronden, 3);
  checkGelijk(
    "het convergentieverloop, inclusief de lege eerste ronde",
    uit.combinaties[0].verloop,
    [
      { ronde: 1, max_relatieve_verandering: null, geconvergeerd: false },
      { ronde: 2, max_relatieve_verandering: 0.004, geconvergeerd: true },
    ],
  );
  checkWaar(
    "het kernantwoord gaat ongewijzigd door",
    JSON.stringify(uit.combinaties[0].staven[0]) === JSON.stringify(kernantwoord),
  );
  checkGelijk(
    "de reden bij een overgeslagen staaf gaat woordelijk mee",
    uit.overgeslagen,
    [{ beam_id: 7, reden: "geen wapeningskorf opgegeven" }],
  );
  checkGelijk("de doorsnede voor de figuur", uit.staafdoorsneden[0].beam_id, 1);
  checkGelijk("met de korf erbij", uit.staafdoorsneden[0].korf.cover_mm, 30);
  checkGelijk(
    "en de maten waarmee gerekend is",
    [uit.staafdoorsneden[0].doorsnede.b_mm, uit.staafdoorsneden[0].doorsnede.h_mm],
    [300, 500],
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Een leeg spoor gaat NIET mee");
{
  checkWaar("geen spoor", spoorVoorPdf(undefined) === undefined);
  checkWaar(
    "een spoor zonder ronden en zonder overgeslagen staven",
    spoorVoorPdf({
      segmentLengteMm: 400,
      combinaties: [],
      overgeslagen: [],
      staafdoorsneden: [],
    }) === undefined,
    "het betonhoofdstuk toont dan zijn eerlijke melding in plaats van een lege tabel",
  );
  checkWaar(
    "een combinatie zonder staven telt niet als ronde",
    spoorVoorPdf({
      segmentLengteMm: 400,
      combinaties: [{ ...spoor.combinaties[0], staven: [] }],
      overgeslagen: [],
      staafdoorsneden: [],
    }) === undefined,
  );
  checkWaar(
    "maar een overgeslagen staaf alleen gaat WEL mee",
    spoorVoorPdf({
      segmentLengteMm: 400,
      combinaties: [],
      overgeslagen: [{ beamId: 7, reason: "geen wapeningskorf" }],
      staafdoorsneden: [],
    }) !== undefined,
    "anders verdwijnt een betonstaaf stilzwijgend uit het rapport",
  );

  const zonder = bouwRapportInvoer({ project, checkResults: [beton(1)] });
  checkWaar(
    "zonder spoor draagt de invoer het veld niet",
    !("concrete_stiffness_trace" in zonder),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] De volledige invoer met spoor");
{
  const invoer = bouwRapportInvoer({
    project,
    checkResults: [staal(1), beton(2)],
    stijfheid: spoor,
  });
  checkGelijk("staaltoetsingen", invoer.steel_check_results.length, 1);
  checkGelijk("betontoetsingen", invoer.concrete_check_results.length, 1);
  checkWaar("geen leeg houtveld", !("timber_check_results" in invoer));
  checkGelijk(
    "het spoor draagt één combinatie",
    invoer.concrete_stiffness_trace.combinaties.length,
    1,
  );
  checkWaar(
    "de invoer overleeft JSON — dat is de weg naar de rekenkern",
    JSON.stringify(JSON.parse(JSON.stringify(invoer))) === JSON.stringify(invoer),
  );
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
