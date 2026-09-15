// k_mod per UGT-combinatie voor hout en kruislaaghout (basisaudit nr 15 en 18).
//
// WAT HIER MISGING
// De houttoetsing rekende met één belastingduurklasse voor alle
// UGT-combinaties, standaard "middellang". EN 1995-1-1 3.1.3(2) wil per
// combinatie de kortste belastingsduur. Gevolg, gemeten in de audit:
//   - GL24h 160×400, L = 3,5 m, alleen G = 26,45 kN/m: UC 0,801 waar 1,068 hoort;
//   - C24 100×300, L = 3 m, G = 9 en Q = 2 kN/m: 1,35·G met k_mod 0,60 geeft 0,823;
//   - G = 4 en S = 3: 0,472 waar 0,420 hoort (te streng).
//
// WAT DEZE TEST VASTLEGT
//  1. de toewijzing per belastinggeval volgens de NB-versie van tabel 2.2 en het
//     besluit "categorie H = kort";
//  2. per combinatie de kortste klasse, zonder lege gevallen en zonder "overig";
//  3. een opgegeven klasse op de staaf is een ONDERGRENS (R20-R22 "short");
//  4. de bouwers (hout en CLT) sturen de lijst per combinatie mee;
//  5. een UGT-set zonder combinatie met alleen blijvende belasting geeft bij
//     hout een FOUT in de meldingen;
//  6. de echte keten tot in de kern (toetsbrug): GL24h alleen G → UC 1,068.
//
// Draaien met: npx tsx test-hout-kmod-combinatie.mjs
// (node scripts/run-tests.mjs --filter=hout-kmod-combinatie)

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const { buildCltCheckInputs } = await import("./src/lib/cltCheckBuilder.ts");
const { meldingenBelastinggevallen } = await import("./src/lib/combinatieBeheer.ts");
const {
  belastingduurPerCombinatie,
  duurklasseVanGeval,
  ontbrekendeBlijvendeCombinatie,
} = await import("./src/lib/belastingduur.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, actueel, verwacht) {
  const ok = JSON.stringify(actueel) === JSON.stringify(verwacht);
  if (ok) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actueel)}`); }
  else { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actueel)} ≠ ${JSON.stringify(verwacht)}`); }
}
function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}
function dichtbij(naam, actueel, verwacht, tolRel = 1e-3) {
  const ok = Number.isFinite(actueel) && Math.abs(actueel - verwacht) <= Math.abs(verwacht) * tolRel;
  if (ok) { passed++; log(`  ✓ ${naam}: ${actueel.toFixed(4)} ≈ ${verwacht.toFixed(4)}`); }
  else { failed++; log(`  ✗ ${naam}: ${actueel} vs ${verwacht}`); }
}

const combi = (id, factors, type = "uls", name = `C${id}`) => ({
  id, name, type, formula: "", factors: new Map(Object.entries(factors).map(([k, v]) => [Number(k), v])),
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Toewijzing per belastinggeval (NB tabel 2.2 + besluit categorie H)");
{
  const k = (lc) => duurklasseVanGeval(lc).klasse;
  check("dead → blijvend (eigen gewicht)", k({ type: "dead" }), "Permanent");
  check("snow → kort (NB: sneeuw kort)", k({ type: "snow" }), "ShortTerm");
  check("wind → kort (NB: wind kort, niet zeer kort)", k({ type: "wind" }), "ShortTerm");
  check("live zonder categorie (= A) → middellang (vloerbelasting)", k({ type: "live" }), "MediumTerm");
  for (const c of ["A", "B", "C", "D"]) check(`live ${c} → middellang`, k({ type: "live", categorie: c }), "MediumTerm");
  check("live E → lang (opslag)", k({ type: "live", categorie: "E" }), "LongTerm");
  check("live industrie-lang → lang (opslag)", k({ type: "live", categorie: "industrie-lang" }), "LongTerm");
  check("live H (daken) → kort (besluit constructeur)", k({ type: "live", categorie: "H" }), "ShortTerm");
  for (const c of ["F", "G", "C-menigte", "industrie-kort"]) {
    check(`live ${c} → middellang (niet in de tabel, veilig-zijdig)`, k({ type: "live", categorie: c }), "MediumTerm");
    checkWaar(`  basis ${c} zegt dat de tabel hem niet noemt`, /niet in tabel 2\.2/.test(duurklasseVanGeval({ type: "live", categorie: c }).reden));
  }
  check("other → geen klasse", k({ type: "other" }), null);
  checkWaar("basis H noemt het besluit", /besluit/.test(duurklasseVanGeval({ type: "live", categorie: "H" }).reden));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Kortste klasse per combinatie; lege gevallen en 'overig' maken niet korter");
{
  const loadCases = [
    { id: 1, name: "G", type: "dead" },
    { id: 2, name: "Q", type: "live", categorie: "A" },
    { id: 3, name: "S", type: "snow" },
    { id: 4, name: "W", type: "wind" },
    { id: 5, name: "X", type: "other" },
    { id: 6, name: "Opslag", type: "live", categorie: "E" },
  ];
  const combinaties = [
    combi(1, { 1: 1.35 }),
    combi(2, { 1: 1.2, 2: 1.5 }),
    combi(3, { 1: 1.2, 3: 1.5, 2: 0.6 }),
    combi(4, { 1: 1.2, 4: 1.5 }),
    combi(5, { 1: 1.35, 5: 1.5 }),
    combi(6, { 1: 1.2, 6: 1.5 }),
    combi(7, { 1: 1, 2: 1 }, "sls"),
  ];
  const alle = belastingduurPerCombinatie({ combinaties, loadCases });
  check("alleen UGT-combinaties", alle.map((c) => c.combination_id), [1, 2, 3, 4, 5, 6]);
  check("klassen", alle.map((c) => c.load_duration), ["Permanent", "MediumTerm", "ShortTerm", "ShortTerm", "Permanent", "LongTerm"]);
  checkWaar("basis G-only noemt 'alleen blijvende belasting'", /alleen blijvende belasting/.test(alle[0].basis));
  checkWaar("basis G+S noemt het bepalende geval", /kortste: geval 3 "S", kort/.test(alle[2].basis), alle[2].basis);
  checkWaar("basis met 'overig' zegt dat hij niet meetelt", /geval 5 "X".*maakt de duur niet korter/.test(alle[4].basis), alle[4].basis);
  checkWaar("zonder `gevuld` zegt de basis dat elk geval meetelt", /niet meegegeven/.test(alle[0].basis));

  // Een LEEG windgeval (geen werkzame last) maakt 1,2·G + 1,5·W niet kort.
  const gevuld = (id) => id !== 4;
  const metLeeg = belastingduurPerCombinatie({ combinaties, loadCases, gevuld });
  check("leeg windgeval → G + W is blijvend", metLeeg.find((c) => c.combination_id === 4).load_duration, "Permanent");
  checkWaar("basis noemt het lege geval", /geval 4 "W" heeft geen werkzame last/.test(metLeeg[3].basis), metLeeg[3].basis);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Een opgegeven klasse is een ondergrens (R20-R22: 'short')");
{
  const loadCases = [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "W", type: "wind" }, { id: 3, name: "Q", type: "live" }];
  const combinaties = [combi(1, { 1: 1.35 }), combi(2, { 1: 1.2, 2: 1.5 }), combi(3, { 1: 1.2, 3: 1.5 })];
  const kort = belastingduurPerCombinatie({ combinaties, loadCases, gevuld: () => true, ondergrens: "ShortTerm" });
  check("'kort' opgegeven: G-only blijft blijvend", kort[0].load_duration, "Permanent");
  check("'kort' opgegeven: G+Q blijft middellang", kort[2].load_duration, "MediumTerm");
  checkWaar("basis zegt dat de korte opgave niet telt", /korter en telt niet/.test(kort[0].basis), kort[0].basis);
  const lang = belastingduurPerCombinatie({ combinaties, loadCases, gevuld: () => true, ondergrens: "LongTerm" });
  check("'lang' opgegeven: G+W wordt lang", lang[1].load_duration, "LongTerm");
  check("'lang' opgegeven: G-only blijft blijvend", lang[0].load_duration, "Permanent");
  checkWaar("basis zegt dat de duur verlengd is", /verlengd tot lang/.test(lang[1].basis), lang[1].basis);
}

// ─────────────────────────────────────────────────────────────────────────
// Echte keten: model → bouwMultiInput → solveAllCases → standaardcombinaties →
// combineResults → bouwer. Zelfde model als in de audit (w15/w18b).
function model({ materiaal, profiel, L, lasten, checkConfig, typen }) {
  const t = typen ?? { 1: ["G", "dead"], 2: ["Q", "live"], 3: ["S", "snow"], 4: ["W", "wind"] };
  const loadCases = [], loads = [];
  for (const [id, q] of Object.entries(lasten)) {
    const [name, type, categorie] = t[id];
    loadCases.push({ id: +id, name, type, ...(categorie ? { categorie } : {}) });
    if (q !== 0) loads.push({ id: +id, type: "lineLoad", caseId: +id, beamId: 1, q });
  }
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: materiaal, profile: profiel, ...(checkConfig ? { checkConfig } : {}) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases, loads,
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}
function bouw(m, { bouwer = buildTimberCheckInputs, metGevallen = true } = {}) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  const combinations = selecteerCombinaties(defaultCombinations(m.loadCases), m.beams, m.plates).actief;
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  return bouwer({
    nodes: m.nodes, beams: m.beams, supports: m.supports, combinations, combinationResults,
    ...(metGevallen ? { loadCases: m.loadCases, gevallenMetLast: [...perCase.keys()] } : {}),
  });
}

log("\n[4] De houtbouwer stuurt de lijst per combinatie mee");
{
  const gq = bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -9, 2: -2 } })).inputs[0];
  const lijst = gq.load_duration_per_combination;
  checkWaar("lijst gevuld", Array.isArray(lijst) && lijst.length > 0);
  const zonderQ = lijst.filter((c) => /zonder/.test(c.basis) || c.load_duration === "Permanent");
  checkWaar("de standaardset heeft een UGT-combinatie met alleen G → blijvend",
    lijst.some((c) => c.load_duration === "Permanent" && /UGT 6\.10a — zonder/.test(c.basis)), JSON.stringify(zonderQ));
  checkWaar("combinaties met Q zijn middellang", lijst.filter((c) => c.load_duration !== "Permanent").every((c) => c.load_duration === "MediumTerm"));
  check("load_duration (terugval) = de langste in de lijst", gq.load_duration, "Permanent");

  const gs = bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -4, 3: -3 } })).inputs[0];
  check("G + S: klassen in de lijst", [...new Set(gs.load_duration_per_combination.map((c) => c.load_duration))].sort(), ["Permanent", "ShortTerm"]);

  const h = bouw(model({
    materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -4, 2: -1 },
    typen: { 1: ["G", "dead"], 2: ["Onderhoud", "live", "H"] },
  })).inputs[0];
  checkWaar("categorie H → kort in de lijst", h.load_duration_per_combination.some((c) => c.load_duration === "ShortTerm"));

  const e = bouw(model({
    materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -4, 2: -3 },
    typen: { 1: ["G", "dead"], 2: ["Opslag", "live", "E"] },
  })).inputs[0];
  checkWaar("categorie E → lang in de lijst", e.load_duration_per_combination.some((c) => c.load_duration === "LongTerm"));
  checkWaar("categorie E → nergens middellang of korter",
    e.load_duration_per_combination.every((c) => ["Permanent", "LongTerm"].includes(c.load_duration)));

  // Leeg windgeval: het windgeval bestaat, maar zonder last.
  const leeg = bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -4, 4: 0 } })).inputs[0];
  check("leeg windgeval: alle combinaties blijvend", [...new Set(leeg.load_duration_per_combination.map((c) => c.load_duration))], ["Permanent"]);

  // Override kan niet verkorten.
  const kort = bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -9, 2: -2 }, checkConfig: { loadDuration: "short" } })).inputs[0];
  checkWaar("checkConfig 'short': geen enkele combinatie kort",
    kort.load_duration_per_combination.every((c) => c.load_duration !== "ShortTerm"));
  checkWaar("checkConfig 'short': G-only blijft blijvend",
    kort.load_duration_per_combination.some((c) => c.load_duration === "Permanent"));

  // Zonder loadCases: de oude terugval, zonder lijst.
  const oud = bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -9, 2: -2 } }), { metGevallen: false }).inputs[0];
  check("zonder loadCases: lege lijst", oud.load_duration_per_combination, []);
  check("zonder loadCases: middellang voor alles", oud.load_duration, "MediumTerm");
}

log("\n[5] De CLT-bouwer doet hetzelfde");
{
  const clt = bouw(model({ materiaal: "C24", profiel: "CLT 40/20/40/20/40", L: 5000, lasten: { 1: -3, 3: -2 } }), { bouwer: buildCltCheckInputs }).inputs[0];
  check("CLT G + S: klassen", [...new Set(clt.load_duration_per_combination.map((c) => c.load_duration))].sort(), ["Permanent", "ShortTerm"]);
  check("CLT terugval = langste", clt.load_duration, "Permanent");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Eigen set zonder combinatie met alleen blijvende belasting → FOUT bij hout");
{
  const loadCases = [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }];
  const eigen = [combi(1, { 1: 1.2, 2: 1.5 }, "uls", "eigen: G + Q"), combi(2, { 1: 1, 2: 1 }, "sls", "BGT karakteristiek")];
  const loads = [{ caseId: 1 }, { caseId: 2 }];
  check("ontbrekendeBlijvendeCombinatie noemt geval 1", ontbrekendeBlijvendeCombinatie({ combinaties: eigen, loadCases })?.map((c) => c.id), [1]);
  const metHout = meldingenBelastinggevallen({ loadCases, combinations: eigen, loads, metHout: true });
  checkWaar("FOUT in de meldingen bij hout",
    metHout.some((m) => m.niveau === "fout" && /alleen blijvende belasting/.test(m.tekst) && /3\.1\.3\(2\)/.test(m.tekst)));
  const zonderHout = meldingenBelastinggevallen({ loadCases, combinations: eigen, loads, metHout: false });
  checkWaar("geen FOUT zonder hout", !zonderHout.some((m) => /alleen blijvende belasting/.test(m.tekst)));
  const standaard = defaultCombinations(loadCases);
  const std = meldingenBelastinggevallen({ loadCases, combinations: standaard, loads, metHout: true });
  checkWaar("de standaardset geeft die FOUT niet", !std.some((m) => /alleen blijvende belasting/.test(m.tekst)));
  // Leeg Q-geval: G + Q telt dan als alleen G.
  check("met leeg Q-geval is er wel een combinatie met alleen G",
    ontbrekendeBlijvendeCombinatie({ combinaties: eigen, loadCases, gevuld: (id) => id === 1 }), null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De echte kern (toetsbrug): GL24h 160×400, L = 3,5 m, alleen G = 26,45 kN/m");
{
  const HIER = dirname(fileURLToPath(import.meta.url));
  const exe = join(resolve(HIER, ".."), "src-tauri", "target", "release", process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug");
  if (!existsSync(exe)) {
    failed++;
    log(`  ✗ toetsbrug ontbreekt (${exe}) — bouw eerst: cargo build --release -p toetsbrug`);
  } else {
    const kern = (inputs) => {
      const r = spawnSync(exe, [], { input: JSON.stringify({ opdracht: "check_timber_beams", inputs }), encoding: "utf8", maxBuffer: 256 << 20 });
      return JSON.parse(r.stdout);
    };
    const buig = (res) => res.checks.find((c) => c.id === "6.1.6_bending").kind.data.uc.uc;
    // Hand: M = 1,35·26,45·3,5²/8 = 54,677 kNm; W = 160·400²/6 = 4,2667·10⁶ mm³;
    // σ = 12,815 N/mm²; k_h = (600/400)^0,1 = 1,0414; γ_M = 1,25.
    // k_mod 0,60 → f_m,d = 11,997 → UC 1,068. k_mod 0,80 → f_m,d = 15,996 → UC 0,801.
    const m = model({ materiaal: "GL24h", profiel: "160x400", L: 3500, lasten: { 1: -26.45 } });
    const nieuw = kern([bouw(m).inputs[0]])[0];
    dichtbij("met belastingduur per combinatie: buiging UC 1,068 (k_mod 0,60)", buig(nieuw), 1.068, 5e-4);
    check("maatgevende klasse blijvend", nieuw.load_duration, "Permanent");
    check("k_mod per klasse", nieuw.k_mod_per_load_duration.map((k) => [k.load_duration, k.k_mod]), [["Permanent", 0.6]]);
    const oud = kern([bouw(m, { metGevallen: false }).inputs[0]])[0];
    dichtbij("zonder loadCases (oude terugval): buiging UC 0,801", buig(oud), 0.801, 5e-4);

    // G = 9, Q = 2 op C24 100×300, L = 3 m: 1,35·G met k_mod 0,60 → 9,1125/11,077 = 0,823.
    const gq = kern([bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -9, 2: -2 } })).inputs[0]])[0];
    dichtbij("G = 9, Q = 2: buiging UC 0,823 (1,35·G, blijvend)", buig(gq), 0.823, 1e-3);

    // G = 4, S = 3: 1,2·G + 1,5·S = 9,3 kN/m met k_mod 0,90 → 6,975/16,615 = 0,420.
    const gs = kern([bouw(model({ materiaal: "C24", profiel: "100x300", L: 3000, lasten: { 1: -4, 3: -3 } })).inputs[0]])[0];
    dichtbij("G = 4, S = 3: buiging UC 0,420 (sneeuw leidend, kort)", buig(gs), 0.420, 1e-3);
    check("G + S: maatgevend kort", gs.load_duration, "ShortTerm");
  }
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
if (failed > 0) process.exit(1);
