// De betonkolomtoets na een TWEEDE-ORDE-berekening: r_m, λ_lim en φ_ef uit de
// EERSTE-ORDE-momenten (EN 1992-1-1 §5.8.3.1(1), 5.8.4(2) (5.19); issue #35).
//
// WAT DEZE TEST BEWAAKT
//   [1] het model: een ingeklemde kolom met normaalkracht, kopkracht en
//       kopmoment, waarvan het voetmoment onder P-Δ merkbaar groeit;
//   [2] `eersteOrdeCombinatieResultaat` en `eersteOrdeResultatenVoorKolomtoets`:
//       eerste orde = de lineaire oplossing, één keer gerekend en gedeeld met
//       de (5.19)-stap van de fysisch niet-lineaire lus (issue #24); niets bij
//       een eerste-orde-rekengang of zonder kolom;
//   [3] `buildBetonCheckInputs`: `first_order_envelope` en de quasi-blijvende
//       omhullende uit de eerste orde, `forces_envelope` uit de gekozen
//       berekening; zonder eerste-orde-resultaten precies de oude invoer; een
//       gespiegeld getekende kolom geeft hetzelfde;
//   [4] de doorvoer in App.tsx, checkStore en variantStore (bronbestanden);
//   [5] met de ECHTE rekenkern (toetsbrug): φ_ef, A, C en λ_lim tegen de
//       handberekening uit de eerste-orde-momenten, en de TEGENPROEF dat de
//       oude route (tweede-orde-momenten) andere getallen gaf.
//
// Draaien met: npx tsx test-kolom-eerste-orde.mjs
//          of: node scripts/run-tests.mjs --filter=kolom-eerste-orde

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { kruipInvoerVoorCombinatie, eersteOrdeQuasiBlijvend, betonStavenUitModel } =
  await import("./src/lib/betonStijfheid.ts");
const { eersteOrdeResultatenVoorKolomtoets } = await import("./src/lib/eersteOrdeResultaten.ts");
const { solveAllCases, solveAllCasesNonlinear, eersteOrdeCombinatieResultaat, getSecondOrderInput } =
  await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function dicht(naam, gemeten, verwacht, tolRel = 1e-6) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  ok(`${naam}: ${gemeten} ≈ ${verwacht}`, rel <= tolRel, `afwijking ${rel.toExponential(2)}`);
}
const leesBron = (...pad) => readFileSync(join(HIER, ...pad), "utf8").replace(/\r\n/g, "\n");

// ═══════════════════════════════════════════════════════════════════════════
log("[1] Het model: ingeklemde kolom 300 × 300, l = 3 m, met N, H en kopmoment");
// ═══════════════════════════════════════════════════════════════════════════
//
// Belastinggeval G aan de kop: 1000 kN druk, H = 10 kN, M = 20 kNm (een
// excentriciteit van 20 mm). UGT = 1,2·G, quasi-blijvend = 1,0·G.
//
// EERSTE ORDE, lineair langs de staaf (geen last tussen de knopen):
//   UGT:  kop 1,2·20 = 24 kNm, voet 1,2·(10·3 + 20) = 60 kNm
//   QP:   kop 20 kNm,          voet 10·3 + 20 = 50 kNm
// Het kopmoment werkt in dezelfde draairichting als het moment van H, dus
// kop en voet hebben hetzelfde teken (enkele kromming).
const L = 3000, B = 300, H_MM = 300;
const E = 33000; // C30/37, tabel 3.1
const I = (B * H_MM ** 3) / 12;
const N_KN = 1000, HK_KN = 10, MK_KNM = 20;

const COMBOS = [
  { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,20·G", factors: new Map([[1, 1.2]]) },
  { id: 4, name: "BGT quasi-blijvend", type: "sls", formula: "1,00·G", factors: new Map([[1, 1.0]]) },
];

const KORF = {
  cover_mm: 30, stirrup_diameter_mm: 8, stirrup_spacing_mm: 200, stirrup_legs: 2,
  top: { count: 2, diameter_mm: 16 }, bottom: { count: 2, diameter_mm: 16 },
};
const CONSOLE = {
  bracing: "Ongeschoord",
  buckling_length: { soort: "Figuur57", geval: "Console" },
  phi_inf_t0: 2.0,
};

/** De solverinvoer; `omgekeerd` tekent de staaf van kop naar voet. */
function solverInvoer(omgekeerd = false) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L }],
    beams: [{ id: 1, from: omgekeerd ? 2 : 1, to: omgekeerd ? 1 : 2, E, A: B * H_MM, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -N_KN * 1000, fx: HK_KN * 1000, my: -MK_KNM * 1e6, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  };
}
function uiModel(kolom, omgekeerd = false) {
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L }];
  return {
    nodes,
    beams: [{
      id: 1, from: omgekeerd ? 2 : 1, to: omgekeerd ? 1 : 2, material: "C30/37", profile: "300x300",
      checkConfig: { betonKorf: KORF, ...(kolom ? { betonKolom: kolom } : {}) },
    }],
  };
}

const eersteOrdeRekengang = solveAllCases(solverInvoer()).perCase;
const tweedeOrdeRekengang = solveAllCasesNonlinear(solverInvoer()).perCase;
const res1 = new Map(COMBOS.map((c) => [c.id, combineResults(c, eersteOrdeRekengang)]));
const res2 = new Map(COMBOS.map((c) => [c.id, combineResults(c, tweedeOrdeRekengang)]));

/** Moment (kNm) aan de voet (x = 0 van de staaf van voet naar kop). */
const voet = (r) => r.elements.get(1).bendingMoment[0] / 1e6;
const kop = (r) => { const m = r.elements.get(1).bendingMoment; return m[m.length - 1] / 1e6; };
dicht("eerste orde UGT: |M_voet| = 1,2·(10·3 + 20) = 60 kNm", Math.abs(voet(res1.get(1))), 60, 1e-9);
dicht("eerste orde UGT: |M_kop| = 1,2·20 = 24 kNm", Math.abs(kop(res1.get(1))), 24, 1e-9);
dicht("eerste orde QP: |M_voet| = 50 kNm", Math.abs(voet(res1.get(4))), 50, 1e-9);
ok("kop en voet hebben hetzelfde teken (enkele kromming)",
  Math.sign(voet(res1.get(1))) === Math.sign(kop(res1.get(1))));
const m2Voet = Math.abs(voet(res2.get(1)));
const m2VoetQp = Math.abs(voet(res2.get(4)));
ok(`tweede orde vergroot het UGT-voetmoment merkbaar: ${m2Voet.toFixed(2)} kNm (> 1,05·60)`, m2Voet > 63);
ok(`… en het quasi-blijvende: ${m2VoetQp.toFixed(2)} kNm (> 50)`, m2VoetQp > 50.5);
const m2Kop = Math.abs(kop(res2.get(1)));
ok(`ook het kopmoment verschuift in tweede orde: ${m2Kop.toFixed(2)} kNm (≠ 24)`, Math.abs(m2Kop - 24) > 0.1);

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] De eerste-orde-oplossing: één keer gerekend, gedeeld met (5.19)");
// ═══════════════════════════════════════════════════════════════════════════
{
  const m = uiModel(CONSOLE);
  ok("eerste-orde-rekengang: niets extra (undefined)",
    eersteOrdeResultatenVoorKolomtoets(eersteOrdeRekengang, COMBOS, m.beams) === undefined);
  ok("tweede orde zonder §5.8-blok: niets extra (undefined)",
    eersteOrdeResultatenVoorKolomtoets(tweedeOrdeRekengang, COMBOS, uiModel(null).beams) === undefined);
  ok("eersteOrdeCombinatieResultaat op een eerste-orde-rekengang: undefined",
    eersteOrdeCombinatieResultaat(eersteOrdeRekengang, COMBOS[0]) === undefined);

  // Een VERSE tweede-orde-rekengang, zodat de cache leeg begint. De
  // (5.19)-stap van de fysisch niet-lineaire lus loopt eerst, precies zoals in
  // App.tsx, met `losOp` op de gedeelde cache.
  const rekengang = solveAllCasesNonlinear(solverInvoer()).perCase;
  const input = getSecondOrderInput(rekengang);
  const losOp = (_i, c) => eersteOrdeCombinatieResultaat(rekengang, c) ?? null;
  const { staven } = betonStavenUitModel({ nodes: m.nodes, beams: m.beams, standaardPhiInfT0: 2.0 });
  const qp = eersteOrdeQuasiBlijvend(input, [COMBOS[1]], losOp);
  const kruip = kruipInvoerVoorCombinatie(input, COMBOS[0], qp, staven, losOp);
  const k = kruip.get(1);
  dicht("(5.19) in de lus: |M₀Ed| = 60 kNm (eerste orde)", Math.abs(k.m0_ed_knm), 60, 1e-9);
  dicht("(5.19) in de lus: |M₀Eqp| = 50 kNm (eerste orde)", Math.abs(k.quasi_blijvend[0].m0_eqp_knm), 50, 1e-9);

  const kaart = eersteOrdeResultatenVoorKolomtoets(rekengang, COMBOS, m.beams);
  ok("de kolomtoets krijgt UGT én quasi-blijvend", kaart?.has(1) && kaart?.has(4));
  ok("GEEN DUBBEL REKENWERK: de UGT-oplossing is hetzelfde object als in de lus",
    kaart.get(1) === eersteOrdeCombinatieResultaat(rekengang, COMBOS[0]) && kaart.get(1) === losOp(input, COMBOS[0]));
  ok("… en de quasi-blijvende ook", kaart.get(4) === qp[0].resultaat);
  const lin = res1.get(1).elements.get(1).bendingMoment;
  const eo = kaart.get(1).elements.get(1).bendingMoment;
  ok("eerste orde = de lineaire oplossing, station voor station",
    lin.length === eo.length && lin.every((v, i) => Math.abs(v - eo[i]) <= 1e-6 * Math.max(1, Math.abs(v))));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] De bouwer: eerste orde voor §5.8, gekozen berekening voor de doorsnede");
// ═══════════════════════════════════════════════════════════════════════════
function bouw({ resultaten, eersteOrde, kolom = CONSOLE, omgekeerd = false }) {
  const m = uiModel(kolom, omgekeerd);
  return buildBetonCheckInputs({
    nodes: m.nodes, beams: m.beams, combinations: COMBOS, combinationResults: resultaten,
    korven: korvenUitStaven(m.beams),
    ...(eersteOrde ? { eersteOrdeResultaten: eersteOrde } : {}),
  }).inputs[0];
}
const eersteOrdeKaart = eersteOrdeResultatenVoorKolomtoets(tweedeOrdeRekengang, COMBOS, uiModel(CONSOLE).beams);
const nieuw = bouw({ resultaten: res2, eersteOrde: eersteOrdeKaart });
const oud = bouw({ resultaten: res2 });
const absMax = (env) => Math.max(...env.map((p) => Math.abs(p.forces.my_ed)));
{
  ok("zonder eerste-orde-resultaten: geen `first_order_envelope`-sleutel", !("first_order_envelope" in oud));
  ok("zonder eerste-orde-resultaten: exact de invoer met het veld `undefined`",
    JSON.stringify(oud) === JSON.stringify(bouw({ resultaten: res2, eersteOrde: undefined })));
  ok("eerste-orde-rekengang: de invoer is gelijk aan die zonder het nieuwe veld",
    !("first_order_envelope" in bouw({ resultaten: res1 })));
  dicht("forces_envelope blijft tweede orde (doorsnedetoetsen)", absMax(nieuw.forces_envelope), m2Voet, 1e-12);
  dicht("first_order_envelope draagt het eerste-orde-moment 60 kNm", absMax(nieuw.first_order_envelope), 60, 1e-9);
  dicht("quasi-blijvend uit de eerste orde: 50 kNm", absMax(nieuw.sls_quasi_permanent_envelope), 50, 1e-9);
  dicht("oude route: quasi-blijvend uit de tweede orde", absMax(oud.sls_quasi_permanent_envelope), m2VoetQp, 1e-12);
  ok("zonder §5.8-blok gaat er geen eerste-orde-omhullende mee",
    !("first_order_envelope" in bouw({ resultaten: res2, eersteOrde: eersteOrdeKaart, kolom: null })));

  // GESPIEGELD GETEKEND: de staaf van kop naar voet. De referentierichting draait
  // beide kaarten om, dus de invoer is dezelfde als bij voet → kop.
  const rekengangOm = solveAllCasesNonlinear(solverInvoer(true)).perCase;
  const res2Om = new Map(COMBOS.map((c) => [c.id, combineResults(c, rekengangOm)]));
  const kaartOm = eersteOrdeResultatenVoorKolomtoets(rekengangOm, COMBOS, uiModel(CONSOLE, true).beams);
  const om = bouw({ resultaten: res2Om, eersteOrde: kaartOm, omgekeerd: true });
  const snede = (env, x) => env.find((p) => Math.abs(p.position_mm - x) < 1e-6).forces.my_ed;
  dicht("gespiegeld: eerste-orde-moment aan de voet (x = 0)",
    snede(om.first_order_envelope, 0), snede(nieuw.first_order_envelope, 0), 1e-9);
  dicht("gespiegeld: eerste-orde-moment aan de kop (x = l)",
    snede(om.first_order_envelope, L), snede(nieuw.first_order_envelope, L), 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] De doorvoer in de app (bronbestanden)");
// ═══════════════════════════════════════════════════════════════════════════
{
  const app = leesBron("src", "App.tsx");
  ok("App.tsx geeft de eerste-orde-resultaten aan de toetsing",
    /eersteOrdeResultaten:\s*eersteOrdeResultatenVoorKolomtoets\(\s*perCase,\s*fem\.actieveCombinaties,\s*fem\.beams,?\s*\)/.test(app));
  ok("de (5.19)-stap van de lus rekent via de gedeelde cache (quasi-blijvend)",
    /"6\.16b",\s*\),\s*losEersteOrde,\s*\)/.test(app));
  ok("… en per UGT-combinatie",
    /kruipInvoerVoorCombinatie\(input, combo, quasiBlijvend, staven, losEersteOrde\)/.test(app));
  const store = leesBron("src", "stores", "checkStore.ts");
  ok("checkStore draagt het veld (en geeft het via ...data aan de betonbouwer)",
    /eersteOrdeResultaten\?: Map<number, SolverResult>;/.test(store) &&
      /buildBetonCheckInputs\(\{\s*\.\.\.data,/.test(store));
  const varianten = leesBron("src", "stores", "variantStore.ts");
  ok("de profielvarianten gebruiken dezelfde eerste-orde-momenten",
    /eersteOrdeResultaten: data\.eersteOrdeResultaten/.test(varianten));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] De echte rekenkern tegen de handberekening");
// ═══════════════════════════════════════════════════════════════════════════
//
// 300 × 300, C30/37, B500B, 4Ø16, l = 3,0 m, N_Ed = 1,2·1000 = 1200 kN druk:
//   ω = 804,2477·434,7826/(90 000·20) = 0,1942627;  B = √(1 + 2ω) = 1,1783571
//   n = 1 200 000/(90 000·20)          = 0,6666667
//   de maatgevende snede: gelijke druk langs de staaf → het eerste punt, x = 0
//
// CONSOLE (ongeschoord, figuur 5.7 b): C = 0,7
//   φ_ef  = 2,0·|50/60| = 1,6666667;  A = 1/(1 + 0,2·1,6666667) = 0,75
//   λ_lim = 20·0,75·1,1783571·0,7/√0,6666667 = 15,15346
//
// GESCHOORD, geval a) — alleen om r_m te laten zien (het ontwerpbesluit is
// invoer; de kern rekent wat er staat):
//   r_m   = M₀₁/M₀₂ = 24/60 = 0,4 (zelfde teken);  C = 1,7 − 0,4 = 1,3
//   λ_lim = 20·0,75·1,1783571·1,3/√0,6666667 = 28,14214
//
// TEGENPROEF (oude route, tweede-orde-momenten M_II uit [1]):
//   φ_ef = 2,0·M_II,QP/M_II,UGT ≠ 1,6666667,  r_m = M_II,kop/M_II,voet ≠ 0,4
const OMEGA = (4 * Math.PI / 4 * 16 ** 2) * (500 / 1.15) / (90000 * 20);
const BF = Math.sqrt(1 + 2 * OMEGA);
const WN = Math.sqrt(1200e3 / (90000 * 20));
const PHI_EF = 2.0 * 50 / 60;
const A_F = 1 / (1 + 0.2 * PHI_EF);
dicht("handberekening B", BF, 1.1783571, 1e-7);
dicht("handberekening A", A_F, 0.75, 1e-12);
const LIM_CONSOLE = 20 * A_F * BF * 0.7 / WN;
const LIM_GESCHOORD = 20 * A_F * BF * 1.3 / WN;
dicht("handberekening λ_lim console", LIM_CONSOLE, 15.15346, 1e-6);
dicht("handberekening λ_lim geschoord", LIM_GESCHOORD, 28.14214, 1e-6);

if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log("   cargo build --release -p toetsbrug  vanuit src-tauri)");
} else {
  const kern = (opdracht, inputs) => new Promise((res, rej) => {
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
  const toets = (r, id) => r.checks.find((c) => c.id === id).kind.data;
  const variabele = (t, sym) => t.variables.find((v) => v.symbol === sym)?.value;

  // ── 5a. Console, nieuwe route ─────────────────────────────────────────
  const [rNieuw, rOud] = await kern("check_concrete_beams", [nieuw, oud]);
  {
    const poort = toets(rNieuw, "5.8.3.1_slankheidsgrens");
    const kruip = toets(rNieuw, "5.8.4_kruip");
    dicht("φ_ef = 2,0·50/60 uit de eerste orde", variabele(kruip, "φ_ef"), PHI_EF, 1e-9);
    dicht("A = 0,75", variabele(poort, "A"), 0.75, 1e-9);
    dicht("C = 0,7 (ongeschoord)", variabele(poort, "C"), 0.7, 1e-12);
    dicht("n = 0,6666667 — N_Ed uit de gekozen berekening", variabele(poort, "n"), 2 / 3, 1e-9);
    dicht("λ_lim = 15,15346", poort.uc.rd, LIM_CONSOLE, 1e-7);
    const tekst = poort.notes.join(" ");
    ok("het rapport noemt de eerste-orde-momenten", tekst.includes("EERSTE-ORDE-MOMENTEN"), tekst);
    ok("… met M₀Ed = 60 kNm", /M₀Ed = -?60,0 kNm/.test(tekst), tekst);
    ok("de kruiptoets noemt de eerste-orde-oplossing voor (5.19)",
      kruip.notes.join(" ").includes("EERSTE-ORDE-oplossing"));
  }

  // ── 5b. TEGENPROEF: de oude route gaf andere getallen ─────────────────
  {
    const poort = toets(rOud, "5.8.3.1_slankheidsgrens");
    const phiOud = variabele(toets(rOud, "5.8.4_kruip"), "φ_ef");
    dicht("oude route: φ_ef = 2,0·M_II,QP/M_II,UGT", phiOud, 2.0 * m2VoetQp / m2Voet, 1e-6);
    ok(`oude route: φ_ef = ${phiOud.toFixed(5)} ≠ ${PHI_EF.toFixed(5)}`, Math.abs(phiOud - PHI_EF) > 1e-3);
    ok(`oude route: λ_lim = ${poort.uc.rd.toFixed(5)} ≠ ${LIM_CONSOLE.toFixed(5)}`,
      Math.abs(poort.uc.rd - LIM_CONSOLE) > 1e-3);
    ok("oude route: geen melding over eerste-orde-momenten",
      !poort.notes.join(" ").includes("EERSTE-ORDE-MOMENTEN"));
  }

  // ── 5c. Geschoord a): r_m uit de eerste orde, tegenproef r_m uit de tweede
  {
    const geschoord = { ...CONSOLE, bracing: "Geschoord", buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" } };
    const [g, gOud] = await kern("check_concrete_beams", [
      bouw({ resultaten: res2, eersteOrde: eersteOrdeKaart, kolom: geschoord }),
      bouw({ resultaten: res2, kolom: geschoord }),
    ]);
    const p = toets(g, "5.8.3.1_slankheidsgrens");
    dicht("r_m = 24/60 = 0,4 → C = 1,3", variabele(p, "C"), 1.3, 1e-9);
    dicht("λ_lim = 28,14214", p.uc.rd, LIM_GESCHOORD, 1e-7);
    const pOud = toets(gOud, "5.8.3.1_slankheidsgrens");
    dicht("oude route: C = 1,7 − M_II,kop/M_II,voet", variabele(pOud, "C"), 1.7 - m2Kop / m2Voet, 1e-6);
    ok(`oude route: C = ${variabele(pOud, "C").toFixed(5)} ≠ 1,3`, Math.abs(variabele(pOud, "C") - 1.3) > 1e-3);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald${overgeslagen ? `, ${overgeslagen} blok(ken) overgeslagen` : ""}`);
if (failed > 0) process.exit(1);
