// De dekkingslijn — van de wapeningszones tot en met de rekenkern.
//
// WAAROM DEZE TEST BESTAAT
// De dekkingslijn (§9.2.1.3, figuur 9.2) zet per plaats langs de staaf de
// BENODIGDE trekkracht naast de AANWEZIGE. Op een zonegrens verandert het
// aantal staven, en dus SPRINGT de aanwezige kracht. De benodigde kracht komt
// van de solver, die per rekenelement een vast aantal stations levert. Valt op
// de zonegrens geen station, dan wordt daar een benodigde kracht van een
// station ERNAAST naast een weerstand van HIER gezet — een vergelijking van
// twee getallen die niet bij dezelfde plaats horen, en dat is in een tekening
// niet te zien.
//
// Deze test legt die hele keten vast:
//
//   [1] ZONEGRENZEN  — `zoneGrenzenMm`/`zoneSnedeFracties` leveren precies de
//                      grenzen die `ReinforcementZones::boundaries_mm()` in de
//                      rekenkern ook oplevert, zonder doublures, met de twee
//                      staafuiteinden eraf.
//   [2] AANSLUITING  — `bouwMultiInput` zet die grenzen als `extraSneden` op de
//                      staaf, en laat een model ZONDER zones bit-identiek.
//   [3] EXACTHEID    — de extra knoop verandert reacties en verplaatsingen
//                      niet; hij maakt alleen het stationsraster fijner. Voor
//                      een Euler-Bernoulli-staaf met consistente knooplasten is
//                      de oplossing in de knopen exact, dus dit wordt op 1e-9
//                      relatief getoetst en niet op procenten.
//   [4] DUBBEL       — op de zonegrens staat het station DUBBEL: het stuk links
//                      eindigt erop en het stuk rechts begint erop. Dat is wat
//                      een sprong nodig heeft.
//   [5] INVOERBOUW   — de zones uit `checkConfig.betonZones` komen in de
//                      toetsinvoer (`reinforcement_zones`) én in het
//                      dekkingslijnverzoek, uit DEZELFDE bron.
//   [6] TEGENPROEF   — zonder de aansluiting van [2] meldt
//                      `ontbrekendeZoneStations` de gemiste grenzen. Dat is het
//                      bewijs dat de aansluiting ergens voor dient.
//   [7] DE KERN      — `concrete_dekkingslijn` via de toetsbrug-binary: twee
//                      bundels bij een staffeling 3/5/3, twee punten op elke
//                      zonegrens (links en rechts), en de weerstand die daar
//                      werkelijk verschilt.
//
// Blok [7] wordt LUID overgeslagen als de toetsbrug-binary ontbreekt; [1] t/m
// [6] draaien altijd.
//
// Uitvoeren: npx tsx test-dekkingslijn.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=dekkingslijn

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { zoneGrenzenMm, zoneSnedeFracties, zoneSnedenUitStaven, metZoneSneden } =
  await import("./src/lib/betonZoneSneden.ts");
const { bouwDekkingslijnVerzoeken, ontbrekendeZoneStations, dekkingslijnSamenvatting } =
  await import("./src/lib/betonDekkingslijnBuilder.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

/** Relatieve toets; drukt de gemeten afwijking altijd af. */
function check(naam, gemeten, verwacht, tolRel = 1e-9) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  if (rel <= tolRel) {
    passed++;
    log(`  ✓ ${naam}: ${gemeten.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${gemeten.toPrecision(10)} vs ${verwacht.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HET MODEL — één vrij opgelegde betonligger van 6 m, gestaffelde onderwapening
// ═══════════════════════════════════════════════════════════════════════════
//
// Onderwapening 3Ø16 over de hele lengte met 2Ø16 bijgelegd in het veld: drie
// zones (3/5/3) met grenzen op 1500 en 4500 mm. Dat zijn TWEE bundels in de zin
// van figuur 9.2 — de doorgaande 3Ø16 en de bijgelegde 2Ø16 — en alleen die
// tweede heeft staafeinden in het veld, dus alleen dáár loopt de
// weerstandslijn schuin.
//
// De beugels staan in twee zones: dicht bij de steunpunten (Ø8-100 over de
// eerste en de laatste 1000 mm) en ruimer in het veld (Ø8-200). Die grenzen
// liggen op 1000 en 5000 mm, dus samen met de langswapening zijn er VIER
// zonegrenzen binnen de staaf.
const L = 6000;

const KORF = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  bottom: { count: 3, diameter_mm: 16 },
  top: { count: 2, diameter_mm: 12 },
  stirrup_spacing_mm: 200,
  stirrup_legs: 2,
};

const langs = (side, count, x0, x1) => ({
  side,
  row: { count, diameter_mm: side === "Bottom" ? 16 : 12 },
  x_start_mm: x0,
  x_end_mm: x1,
});

const ZONES = {
  longitudinal: [
    langs("Bottom", 3, 0, 1500),
    langs("Bottom", 5, 1500, 4500),
    langs("Bottom", 3, 4500, L),
    langs("Top", 2, 0, L),
  ],
  stirrups: [
    { x_start_mm: 0, x_end_mm: 1000, spacing_mm: 100, legs: 2, diameter_mm: 8 },
    { x_start_mm: 1000, x_end_mm: 5000, spacing_mm: 200, legs: 2, diameter_mm: 8 },
    { x_start_mm: 5000, x_end_mm: L, spacing_mm: 100, legs: 2, diameter_mm: 8 },
  ],
};

/** De vier grenzen die BINNEN de staaf liggen; 0 en L horen er niet bij. */
const GRENZEN_BINNEN = [1000, 1500, 4500, 5000];

function bouwModel({ metZones = true } = {}) {
  const cfg = {
    betonKorf: KORF,
    betonStaalsoort: "B500B",
    betonMilieuklasse: "XC1",
    ...(metZones ? { betonZones: ZONES } : {}),
  };
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x600", checkConfig: cfg }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [
      { id: 1, name: "Blijvend", type: "dead" },
      { id: 2, name: "Veranderlijk", type: "live" },
    ],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -12 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -8 },
    ],
    selfWeightEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}

const COMBOS = [
  { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,20·G + 1,50·Q",
    factors: new Map([[1, 1.2], [2, 1.5]]) },
];

/** De hele app-route van model naar resultaten per combinatie. */
function rekenDoor(model) {
  const multi = bouwMultiInput(model);
  const perCase = solveAllCases(multi).perCase;
  const res = new Map(COMBOS.map((c) => [c.id, combineResults(c, perCase)]));
  return { multi, res };
}

log("═".repeat(78));
log("DE DEKKINGSLIJN — van de wapeningszones tot en met de rekenkern");
log("═".repeat(78));

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] De zonegrenzen");
// ═══════════════════════════════════════════════════════════════════════════
{
  const grenzen = zoneGrenzenMm(ZONES);
  ok("de grenzen zijn oplopend en ontdubbeld",
    JSON.stringify(grenzen) === JSON.stringify([0, 1000, 1500, 4500, 5000, L]),
    `[${grenzen.join(", ")}]`);
  ok("dezelfde grens uit twee lijsten telt één keer",
    zoneGrenzenMm({
      longitudinal: [langs("Bottom", 3, 0, 3000), langs("Bottom", 3, 3000, L)],
      stirrups: [
        { x_start_mm: 0, x_end_mm: 3000, spacing_mm: 100, legs: 2, diameter_mm: 8 },
        { x_start_mm: 3000, x_end_mm: L, spacing_mm: 200, legs: 2, diameter_mm: 8 },
      ],
    }).length === 3);

  const fracties = zoneSnedeFracties(ZONES, L);
  ok("de twee staafuiteinden vallen af", fracties.length === GRENZEN_BINNEN.length);
  for (let i = 0; i < GRENZEN_BINNEN.length; i++) {
    check(`fractie ${i + 1} hoort bij x = ${GRENZEN_BINNEN[i]} mm`,
      fracties[i] * L, GRENZEN_BINNEN[i]);
  }
  ok("zonder zones geen sneden", zoneSnedeFracties(undefined, L).length === 0);
  ok("zonder lengte geen sneden", zoneSnedeFracties(ZONES, 0).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] De aansluiting op de solverinvoer");
// ═══════════════════════════════════════════════════════════════════════════
const metZonesModel = bouwModel({ metZones: true });
const zonderZonesModel = bouwModel({ metZones: false });
const multiMet = bouwMultiInput(metZonesModel);
const multiZonder = bouwMultiInput(zonderZonesModel);
{
  ok("de staaf mét zones krijgt vier extra sneden",
    multiMet.beams[0].extraSneden?.length === 4,
    `${multiMet.beams[0].extraSneden?.length ?? 0}`);
  ok("de staaf zónder zones krijgt er géén — het veld ontbijft helemaal",
    multiZonder.beams[0].extraSneden === undefined);

  // Bit-identiek: het enige verschil tussen de twee invoeren mag `extraSneden`
  // zijn. Zonder deze toets zou een model zonder beton ongemerkt anders kunnen
  // gaan rekenen.
  const zonderVeld = { ...multiMet.beams[0] };
  delete zonderVeld.extraSneden;
  ok("verder is de staafinvoer bit-identiek",
    JSON.stringify(zonderVeld) === JSON.stringify(multiZonder.beams[0]));

  // `zoneSnedenUitStaven` en `metZoneSneden` leveren hetzelfde als de
  // aansluiting in `bouwMultiInput` — dezelfde bron, dus dezelfde uitkomst.
  const losseSneden = zoneSnedenUitStaven(metZonesModel.beams, metZonesModel.nodes);
  const handmatig = metZoneSneden(multiZonder, losseSneden);
  ok("`metZoneSneden` geeft dezelfde invoer als `bouwMultiInput`",
    JSON.stringify(handmatig.beams[0].extraSneden) ===
      JSON.stringify(multiMet.beams[0].extraSneden));
  ok("`metZoneSneden` met een lege map geeft letterlijk dezelfde invoer terug",
    metZoneSneden(multiZonder, new Map()) === multiZonder);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] De extra knopen veranderen de oplossing niet");
// ═══════════════════════════════════════════════════════════════════════════
const { res: resMet } = rekenDoor(metZonesModel);
const { res: resZonder } = rekenDoor(zonderZonesModel);
{
  const R = (res, nid) => res.get(1).reactions.get(nid).fz;
  check("oplegreactie knoop 1 ongewijzigd", R(resMet, 1), R(resZonder, 1));
  check("oplegreactie knoop 2 ongewijzigd", R(resMet, 2), R(resZonder, 2));

  // Het veldmoment: qL²/8 met q = 1,2·12 + 1,5·8 = 26,4 kN/m.
  const q = 1.2 * 12 + 1.5 * 8;
  const Mhand = (q * (L / 1000) ** 2) / 8;
  const grootsteM = (res) => {
    const ef = res.get(1).elements.get(1);
    let m = 0;
    for (const v of ef.bendingMoment) if (Math.abs(v) > Math.abs(m)) m = v;
    return Math.abs(m) / 1e6;
  };
  check("het veldmoment is qL²/8", grootsteM(resMet), Mhand, 1e-6);
  check("en het is gelijk aan dat zonder sneden", grootsteM(resMet), grootsteM(resZonder), 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Op elke zonegrens staat het station DUBBEL");
// ═══════════════════════════════════════════════════════════════════════════
const stationsMet = resMet.get(1).elements.get(1).stations_mm;
{
  for (const g of GRENZEN_BINNEN) {
    const raak = stationsMet.filter((s) => Math.abs(s - g) < 1e-6).length;
    ok(`x = ${g} mm is een station, en wel dubbel`, raak === 2, `${raak} stations`);
  }
  // Tegenproef op één grens die NIET toevallig al een station is. Een staaf
  // zonder sneden levert 21 gelijk verdeelde stations over 6000 mm, dus om de
  // 300 mm: 1500 en 4500 vallen daar toevallig op, 1000 en 5000 niet. Juist
  // die twee laten zien wat de aansluiting toevoegt.
  const stationsZonder = resZonder.get(1).elements.get(1).stations_mm;
  ok("zonder zones ligt er op x = 1000 mm géén station",
    !stationsZonder.some((s) => Math.abs(s - 1000) < 1e-6));
  ok("zonder zones ligt er op x = 5000 mm géén station",
    !stationsZonder.some((s) => Math.abs(s - 5000) < 1e-6));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] De zones komen in de toetsinvoer én in het dekkingslijnverzoek");
// ═══════════════════════════════════════════════════════════════════════════
const korven = korvenUitStaven(metZonesModel.beams);
const bouwData = {
  nodes: metZonesModel.nodes,
  beams: metZonesModel.beams,
  combinations: COMBOS,
  combinationResults: resMet,
  korven,
};
const { verzoeken, skipped } = bouwDekkingslijnVerzoeken(bouwData);
{
  const { inputs } = buildBetonCheckInputs(bouwData);
  ok("de betontoetsing krijgt de vier langszones en de drie beugelzones",
    inputs[0].reinforcement_zones.longitudinal.length === 4 &&
      inputs[0].reinforcement_zones.stirrups.length === 3);
  ok("een model zónder zones levert lege lijsten — het gedrag van voorheen",
    (() => {
      const r = buildBetonCheckInputs({ ...bouwData, beams: zonderZonesModel.beams });
      return r.inputs[0].reinforcement_zones.longitudinal.length === 0 &&
        r.inputs[0].reinforcement_zones.stirrups.length === 0;
    })());

  ok("er is één verzoek en geen overgeslagen staaf",
    verzoeken.length === 1 && skipped.length === 0);
  ok("het verzoek draagt de staaf in `beam`, met dezelfde zones",
    verzoeken[0].beam.reinforcement_zones.longitudinal.length === 4);
  ok("de vier keuzes zijn NIET ingevuld — niets wordt aangenomen",
    verzoeken[0].z_mm === undefined && verzoeken[0].c_d_mm === undefined &&
      verzoeken[0].a_sl_mm2 === undefined && verzoeken[0].cot_theta === undefined);

  const keuzes = new Map([[1, { zMm: 520, cDMm: 34, cotTheta: 2.5 }]]);
  const metKeuzes = bouwDekkingslijnVerzoeken({ ...bouwData, keuzes }).verzoeken[0];
  ok("opgegeven keuzes reizen ongewijzigd mee",
    metKeuzes.z_mm === 520 && metKeuzes.c_d_mm === 34 && metKeuzes.cot_theta === 2.5 &&
      metKeuzes.a_sl_mm2 === undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[6] Tegenproef: zonder de aansluiting mist de omhullende de grenzen");
// ═══════════════════════════════════════════════════════════════════════════
{
  ok("mét de aansluiting mist er geen enkele zonegrens een station",
    ontbrekendeZoneStations(ZONES, verzoeken[0]).length === 0);

  // Dezelfde staaf, dezelfde zones — maar de krachten uit het model ZONDER
  // extra sneden. Dat is precies de toestand van vóór deze aansluiting.
  const zonder = bouwDekkingslijnVerzoeken({
    ...bouwData,
    beams: zonderZonesModel.beams,
    combinationResults: resZonder,
  }).verzoeken[0];
  const gemist = ontbrekendeZoneStations(ZONES, zonder);
  ok("zonder de aansluiting worden gemiste grenzen gemeld",
    gemist.length > 0, `gemist: [${gemist.join(", ")}] mm`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] De ECHTE rekenkern — concrete_dekkingslijn via de toetsbrug");
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log(`   cargo build --release -p toetsbrug  vanuit src-tauri)`);
} else {
  const echteKern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", () => {
      let j;
      try { j = JSON.parse(uit); } catch { return rej(new Error(`kern gaf geen JSON: ${uit || fout}`)); }
      if (j && j.fout) return rej(new Error(j.fout));
      res(j);
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  const a = await echteKern("concrete_dekkingslijn", verzoeken[0]);
  log(`      ${a.section_name} ${a.concrete_class}/${a.reinforcement_grade}, ` +
      `a_l = ${a.a_l_mm.toFixed(0)} mm volgens ${a.a_l_artikel}`);
  log(`      ${dekkingslijnSamenvatting(a)}`);

  ok("het staafnummer reist mee", a.beam_id === 1);
  ok("de staaflengte klopt", Math.abs(a.lengte_mm - L) < 1e-6);
  ok("er is een verschuiving a_l en zij noemt haar artikel",
    a.a_l_mm > 0 && a.a_l_artikel.includes("9.2.1.3"), a.a_l_artikel);

  // Staffeling 3/5/3 = TWEE bundels: de doorgaande 3Ø16 en de bijgelegde 2Ø16.
  ok("de onderwapening levert twee bundels", a.onder.bundels.length === 2,
    a.onder.bundels.map((b) => b.label).join(" | "));
  const bij = a.onder.bundels.find((b) => b.aantal === 2);
  ok("de bijgelegde bundel loopt van 1500 tot 4500 mm",
    bij && Math.abs(bij.x_start_mm - 1500) < 1 && Math.abs(bij.x_end_mm - 4500) < 1);
  ok("zij draagt de hele l_bd-afleiding van §8.4",
    bij && bij.l_bd_mm > 0 && bij.verankering.f_bd_mpa > 0 &&
      bij.verankering.l_b_rqd_mm > 0 && bij.verankering.herkomst.length > 0,
    bij ? `l_bd = ${bij.l_bd_mm.toFixed(0)} mm, f_bd = ${bij.verankering.f_bd_mpa.toFixed(2)} N/mm²` : "");

  // Op elke zonegrens twee punten met dezelfde x, links en rechts.
  for (const g of [1500, 4500]) {
    const op = a.onder.punten.filter((p) => Math.abs(p.x_mm - g) < 1e-6);
    ok(`momentdekking: twee punten op x = ${g} mm`,
      op.some((p) => p.zijde === "Links") && op.some((p) => p.zijde === "Rechts"),
      `${op.length} punten`);
  }
  for (const g of [1000, 5000]) {
    const op = a.dwarskracht.punten.filter((p) => Math.abs(p.x_mm - g) < 1e-6);
    ok(`dwarskrachtdekking: twee punten op x = ${g} mm`,
      op.some((p) => p.zijde === "Links") && op.some((p) => p.zijde === "Rechts"),
      `${op.length} punten`);
  }

  // De sprong is er ook werkelijk: de aanwezige trekkracht verschilt links en
  // rechts van 1500 mm. Zou hij gelijk zijn, dan zeggen de zones niets.
  {
    const op = a.onder.punten.filter((p) => Math.abs(p.x_mm - 1500) < 1e-6);
    const links = op.find((p) => p.zijde === "Links");
    const rechts = op.find((p) => p.zijde === "Rechts");
    ok("de aanwezige trekkracht SPRINGT op de zonegrens",
      links && rechts && rechts.aanwezig_volledig_kn > links.aanwezig_volledig_kn + 1,
      links && rechts
        ? `links ${links.aanwezig_volledig_kn.toFixed(1)} kN, rechts ${rechts.aanwezig_volledig_kn.toFixed(1)} kN`
        : "");
  }

  // §9.2.1.4/§9.2.1.5 aan beide uiteinden — de eis wordt gemeld, de LENGTE
  // niet beoordeeld (daarvoor zou het model een oplegvlak moeten hebben).
  ok("beide staafuiteinden krijgen hun steunpunteis",
    a.steunpunten.length === 2 &&
      a.steunpunten.some((s) => s.uiteinde === "Begin") &&
      a.steunpunten.some((s) => s.uiteinde === "Eind"));
  ok("de eis noemt β₂·A_s,veld en de te verankeren kracht F_Ed",
    a.steunpunten.every((s) => s.a_s_vereist_mm2 > 0 && s.f_ed_kn >= 0));

  // De kanttekeningen zijn geen opsmuk: zij dragen de lezing van a_l bij een
  // omhullende, wat er met N_Ed is gebeurd, en waarom V_Rd,c en V_Rd,s niet
  // zijn opgeteld.
  ok("het antwoord draagt de verplichte kanttekeningen",
    a.notes.some((n) => n.includes("6.2.1(8)")) &&
      a.notes.some((n) => n.includes("V_Rd,c") && n.includes("opgeteld")),
    `${a.notes.length} regels`);

  // Een normaalkracht zonder opgegeven z hoort een FOUT te zijn en geen lijn.
  {
    const metN = JSON.parse(JSON.stringify(verzoeken[0]));
    for (const p of metN.beam.forces_envelope) p.forces.n_ed = -250;
    let melding = null;
    try { await echteKern("concrete_dekkingslijn", metN); }
    catch (e) { melding = e instanceof Error ? e.message : String(e); }
    ok("normaalkracht zonder z levert een fout met het artikel erbij",
      melding !== null && melding.includes("6.2.3(1)"), melding ?? "er kwam een lijn terug");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n" + "─".repeat(78));
log(`${passed} geslaagd, ${failed} gefaald${overgeslagen ? `, ${overgeslagen} blok overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
