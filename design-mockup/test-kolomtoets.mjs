// De KOLOMTOETS van art. 5.8, van invoerscherm tot rekenkern.
//
// WAT DEZE TEST BEWAAKT
// De rekenregels zelf staan in Rust en zijn daar tegen handberekeningen
// getest (`concrete-check/tests/kolomtoets.rs` en
// `nen-en-1992-1-1/tests/kolom_5_8.rs`). Deze test bewaakt de KETEN die
// daarvóór ligt, en die loopt volledig door de frontend:
//
//   [1] de keuzelijst van figuur 5.7 — welke gevallen bij welke schoring
//       horen, en dat een wisseling van schoring nooit een tegenspraak
//       achterlaat;
//   [2] `korvenUitStaven` — het §5.8-blok van `checkConfig.betonKolom` naar de
//       bouwer;
//   [3] `buildBetonCheckInputs` — het blok als GEHEEL in `column`, en de
//       QUASI-BLIJVENDE BGT-combinatie in `sls_quasi_permanent_envelope`;
//   [4] de drie omhullenden uit elkaar houden: UGT, frequent (6.15) en
//       quasi-blijvend (6.16) horen bij drie verschillende toetsen en mogen
//       elkaars plaats niet innemen;
//   [4b] de modelpoort (`controleerVelden`): een geldig blok komt erdoor, een
//       halve of tikfoutige invoer wordt geweigerd met de reden;
//   [5] met de ECHTE rekenkern (toetsbrug-binary, als hij er is): komt de
//       slankheidsgrens werkelijk terug, en verandert hij mee met het
//       ontwerpbesluit geschoord/ongeschoord?
//
// WAAROM [4] ERTOE DOET. §7.3 vraagt in Nederland de FREQUENTE combinatie
// (nationale bijlage bij 7.3.1(5)) en §5.8.4 de QUASI-BLIJVENDE. Wie ze
// verwisselt krijgt een φ_ef die te groot of te klein is, en daarmee een λ_lim
// die de kolom ten onrechte goedkeurt of afkeurt — zonder enig signaal.
//
// Draaien met: npx tsx test-kolomtoets.mjs
//          of: node scripts/run-tests.mjs --filter=kolomtoets

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
const { knikgevallenVoor, kniklengteVoorSchoring, KNIKGEVALLEN } =
  await import("./src/components/beton/kolomgegevens.ts");
const { isOverwegendVerticaal } = await import("./src/lib/steelCheckBuilder.ts");
const { controleerVelden } = await import("./src/mcp/valideerModel.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function eq(naam, gemeten, verwacht) {
  ok(`${naam}: ${JSON.stringify(gemeten)}`,
    JSON.stringify(gemeten) === JSON.stringify(verwacht),
    `verwacht ${JSON.stringify(verwacht)}`);
}
function dicht(naam, gemeten, verwacht, tolRel = 1e-4) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  ok(`${naam}: ${gemeten} ≈ ${verwacht}`, rel <= tolRel, `afwijking ${rel.toExponential(2)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("[1] Figuur 5.7 — welke gevallen bij welke schoring horen");
// ═══════════════════════════════════════════════════════════════════════════
//
// De vijf vakjes met een VASTE l₀. De vakjes f) en g) staan er bewust NIET
// bij: hun bijschrift geeft een bereik en niet een waarde, want zij horen bij
// (5.15) en (5.16), die k = (θ/M)·(EI/l) per staafeind vragen.
eq("vijf gevallen in totaal", KNIKGEVALLEN.length, 5);
eq("geschoord: a), c) en d)",
  knikgevallenVoor("Geschoord").map((g) => g.letter), ["a", "c", "d"]);
eq("ongeschoord: b) en e)",
  knikgevallenVoor("Ongeschoord").map((g) => g.letter), ["b", "e"]);

// De factoren zijn de bijschriften van de figuur zelf.
const factor = (geval) => KNIKGEVALLEN.find((g) => g.geval === geval).factor;
dicht("a) l₀ = l", factor("ScharnierendScharnierend"), 1.0);
dicht("b) l₀ = 2l (console)", factor("Console"), 2.0);
dicht("c) l₀ = 0,7l", factor("IngeklemdScharnierend"), 0.7);
dicht("d) l₀ = l/2", factor("TweezijdigIngeklemdGeschoord"), 0.5);
dicht("e) l₀ = l", factor("TweezijdigIngeklemdOngeschoord"), 1.0);

// EEN WISSELING VAN SCHORING MAG GEEN TEGENSPRAAK ACHTERLATEN. De kern weigert
// geval b) bij "geschoord" — een console houdt zichzelf overeind — dus het
// scherm mag die combinatie niet kunnen opleveren.
eq("console + geschoord springt naar geval a)",
  kniklengteVoorSchoring({ soort: "Figuur57", geval: "Console" }, "Geschoord"),
  { soort: "Figuur57", geval: "ScharnierendScharnierend" });
eq("geval a) + ongeschoord springt naar de console",
  kniklengteVoorSchoring({ soort: "Figuur57", geval: "ScharnierendScharnierend" }, "Ongeschoord"),
  { soort: "Figuur57", geval: "Console" });
eq("een geldig geval blijft staan",
  kniklengteVoorSchoring({ soort: "Figuur57", geval: "TweezijdigIngeklemdGeschoord" }, "Geschoord"),
  { soort: "Figuur57", geval: "TweezijdigIngeklemdGeschoord" });
// Een zelf opgegeven l₀ hoort NIET te worden gewist als de schoring wisselt:
// hij is geldig bij allebei, en overtypen is werk dat de gebruiker al deed.
eq("een opgegeven l₀ overleeft een wisseling",
  kniklengteVoorSchoring({ soort: "Opgegeven", l0_m: 4.2 }, "Ongeschoord"),
  { soort: "Opgegeven", l0_m: 4.2 });
eq("zonder eerdere keuze: het eerste geval van de lijst",
  kniklengteVoorSchoring(undefined, "Ongeschoord"),
  { soort: "Figuur57", geval: "Console" });

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] Het model: een portaalstijl van 3 m met 600 kN druk");
// ═══════════════════════════════════════════════════════════════════════════

const KORF = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  stirrup_spacing_mm: 200,
  stirrup_legs: 2,
  top: { count: 2, diameter_mm: 16 },
  bottom: { count: 2, diameter_mm: 16 },
};

const KOLOM_GESCHOORD = {
  bracing: "Geschoord",
  buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" },
};

const nodes = [
  { id: 1, x: 0, z: 0 },
  { id: 2, x: 0, z: 3000 },
];

/** Één verticale betonstaaf 300 × 300 met de korf en (optioneel) het §5.8-blok. */
function model(kolom) {
  return {
    nodes,
    beams: [
      {
        id: 1,
        from: 1,
        to: 2,
        material: "C30/37",
        profile: "300x300",
        checkConfig: { betonKorf: KORF, ...(kolom ? { betonKolom: kolom } : {}) },
      },
    ],
  };
}

// De staaf staat verticaal: het invoerscherm biedt §5.8 dus vanzelf open aan.
ok("de staaf is overwegend verticaal (≥ 75°)",
  isOverwegendVerticaal(model(null).beams[0], nodes));

// DRIE COMBINATIES MET DRIE VERSCHILLENDE BELASTINGFACTOREN, zodat de test kan
// zien welke omhullende waar terechtkomt. De namen doen ertoe: de bouwer
// herkent "frequent" en "quasi" op naam, en er is met opzet geen terugval.
const COMBOS = [
  { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,20·G", factors: new Map([[1, 1.2]]) },
  { id: 5, name: "BGT frequent", type: "sls", formula: "0,50·G", factors: new Map([[1, 0.5]]) },
  { id: 4, name: "BGT quasi-blijvend", type: "sls", formula: "0,30·G", factors: new Map([[1, 0.3]]) },
];

// EEN INGEKLEMDE STIJL MET EEN KOPKRACHT. Aan de kop is het moment nul, aan de
// voet H·l; daartussen loopt het lineair, dus het grootste |M| ligt aan een
// EIND en niet in het veld. Daarmee is er geen dwarsbelasting in de zin van
// §5.8.3.1(1) en geldt r_m = M₀₁/M₀₂ = 0/M₀₂ = 0, dus C = 1,7 − 0 = 1,7.
//
// Eenheden aan de SOLVERgrens: N en N·mm.
const N_KN = 500;   // normaaldruk in het belastinggeval
const H_KN = 10;    // kopkracht  → M_voet = 10 · 3,0 = 30 kNm

function rekenDoor() {
  const invoer = {
    nodes,
    // 300 × 300 mm, E = 33 000 N/mm² (C30/37, tabel 3.1). De E doet er voor
    // deze test niet toe — een statisch bepaalde stijl — maar een verzonnen
    // waarde zou wel in de zakkingen doorwerken.
    beams: [{ id: 1, from: 1, to: 2, E: 33000, A: 300 * 300, I: (300 * 300 ** 3) / 12 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [
      { nodeId: 2, fz: -N_KN * 1000, fx: H_KN * 1000, caseId: 1 },
    ],
    cases: [{ id: 1, name: "G" }],
  };
  const perCase = solveAllCases(invoer).perCase;
  return new Map(COMBOS.map((c) => [c.id, combineResults(c, perCase)]));
}

const resultaten = rekenDoor();


function bouw(kolom) {
  const m = model(kolom);
  return buildBetonCheckInputs({
    nodes: m.nodes,
    beams: m.beams,
    combinations: COMBOS,
    combinationResults: resultaten,
    korven: korvenUitStaven(m.beams),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] korvenUitStaven en de bouwer dragen het §5.8-blok door");
// ═══════════════════════════════════════════════════════════════════════════
{
  const korven = korvenUitStaven(model(KOLOM_GESCHOORD).beams);
  eq("het blok komt ongewijzigd in de korvenmap",
    korven.get(1).kolom, KOLOM_GESCHOORD);

  const zonder = korvenUitStaven(model(null).beams);
  ok("zonder blok blijft het veld leeg", zonder.get(1).kolom === undefined);
}
{
  const { inputs, skipped } = bouw(KOLOM_GESCHOORD);
  ok("de staaf is toetsbaar", inputs.length === 1 && skipped.length === 0,
    skipped.map((s) => s.reason).join("; "));
  const i = inputs[0];
  eq("`column` is het blok als GEHEEL", i.column, KOLOM_GESCHOORD);
  eq("doorsnede 300 × 300", [i.section.b_mm, i.section.h_mm], [300, 300]);
  dicht("lengte 3,0 m", i.length_m, 3.0);
}
{
  // ZONDER BLOK GAAT ER GEEN `column` MEE. Niet een leeg object, niet een
  // aangenomen schoring: het veld ontbreekt, en de kern meldt daarop dat §5.8
  // niet is getoetst met de reden erbij.
  const { inputs } = bouw(null);
  ok("zonder blok ontbreekt `column` in het verzoek",
    !("column" in inputs[0]), JSON.stringify(inputs[0].column));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Drie omhullenden, drie combinaties — en geen terugval");
// ═══════════════════════════════════════════════════════════════════════════
{
  const i = bouw(KOLOM_GESCHOORD).inputs[0];
  const combis = (lijst) => [...new Set(lijst.map((p) => p.combination_id))];

  eq("UGT-omhullende: alleen combinatie 1", combis(i.forces_envelope), [1]);
  eq("frequente omhullende: alleen combinatie 5 (6.15)",
    combis(i.sls_frequent_envelope), [5]);
  eq("quasi-blijvende omhullende: alleen combinatie 4 (6.16)",
    combis(i.sls_quasi_permanent_envelope), [4]);

  // De drie dragen ook werkelijk verschillende krachten; anders zou een
  // verwisseling nergens uit blijken.
  const nMin = (lijst) => Math.min(...lijst.map((p) => p.forces.n_ed));
  dicht("UGT: 1,20 × 500 kN druk", nMin(i.forces_envelope), -600, 1e-6);
  dicht("frequent: 0,50 × 500 kN druk", nMin(i.sls_frequent_envelope), -250, 1e-6);
  dicht("quasi-blijvend: 0,30 × 500 kN druk", nMin(i.sls_quasi_permanent_envelope), -150, 1e-6);
}
{
  // ZONDER QUASI-BLIJVENDE COMBINATIE gaat er een LEGE lijst mee. Er wordt
  // niet teruggevallen op de frequente: dat zou φ_ef te groot maken en λ_lim
  // te laag, zonder dat er iets opvalt.
  const zonderQp = COMBOS.filter((c) => !/quasi/i.test(c.name));
  const m = model(KOLOM_GESCHOORD);
  const { inputs } = buildBetonCheckInputs({
    nodes: m.nodes, beams: m.beams,
    combinations: zonderQp, combinationResults: resultaten,
    korven: korvenUitStaven(m.beams),
  });
  eq("geen quasi-blijvende combinatie → lege lijst",
    inputs[0].sls_quasi_permanent_envelope, []);
  ok("en de frequente is er nog wel",
    inputs[0].sls_frequent_envelope.length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4b] De modelpoort laat het blok door en vangt een halve invoer");
//
// `controleerVelden` is de poort waar een model doorheen moet dat via MCP
// binnenkomt of van schijf wordt geladen. Een veld dat zij niet kent, keurt zij
// af — en dat is precies goed voor een tikfout en precies fout voor een geldig
// gegeven. Toen `betonKorf` er nog niet in stond, werd elk model met een
// wapeningskorf geweigerd; dezelfde val staat klaar voor `betonKolom`.
{
  const rauw = (kolom) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [{
      id: 1, from: 1, to: 2, material: "C30/37", profile: "300x300",
      checkConfig: { betonKorf: KORF, betonKolom: kolom },
    }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loadCases: [{ id: 1, name: "G" }],
  });

  eq("een geldig §5.8-blok komt schoon door de poort",
    controleerVelden(rauw(KOLOM_GESCHOORD)), []);

  const zonderSchoring = controleerVelden(rauw({
    buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" },
  }));
  ok("een blok zonder schoring wordt geweigerd, met art. 5.8.1 erbij",
    zonderSchoring.some((f) => f.includes("bracing") && f.includes("5.8.1")),
    zonderSchoring.join(" | ") || "geen enkele fout");

  const zonderL0 = controleerVelden(rauw({ bracing: "Geschoord" }));
  ok("een blok zonder kniklengte wordt geweigerd",
    zonderL0.some((f) => f.includes("buckling_length")),
    zonderL0.join(" | ") || "geen enkele fout");

  // De vakjes f) en g) van figuur 5.7 kent dit invoertype niet: hun bijschrift
  // geeft een bereik en niet een waarde.
  const gedeeltelijk = controleerVelden(rauw({
    bracing: "Geschoord",
    buckling_length: { soort: "Figuur57", geval: "GedeeltelijkIngeklemdGeschoord" },
  }));
  ok("vakje f) wordt geweigerd — het geeft een bereik, geen waarde",
    gedeeltelijk.some((f) => f.includes("buckling_length.geval")),
    gedeeltelijk.join(" | ") || "geen enkele fout");

  const tikfout = controleerVelden(rauw({
    bracing: "Geschoord",
    buckling_length: { soort: "Opgegeven", l0_mm: 3000 },
  }));
  ok("een tikfout in l0_m wordt geweigerd in plaats van stil genegeerd",
    tikfout.length > 0, tikfout.join(" | ") || "geen enkele fout");
}

log("\n[5] Met de ECHTE rekenkern");
// ═══════════════════════════════════════════════════════════════════════════
//
// HANDBEREKENING bij deze kolom (300 × 300, C30/37, B500B, 4Ø16, l = 3,0 m,
// N_Ed = 600 kN druk):
//
//   i     = 300/√12                          = 86,60254 mm     (5.8.3.2(1))
//   λ(a)  = 1,0·3000/86,60254                = 34,64102        (5.14)
//   λ(b)  = 2,0·3000/86,60254                = 69,28203
//   ω     = 804,2477·434,7826/(90 000·20)    = 0,1942627
//   B     = √(1 + 2ω)                        = 1,1783571
//   n     = 600 000/(90 000·20)              = 0,3333333
//   A     = 0,7 (φ_ef onbekend)
//
// Deze kolom draagt een kopmoment, dus er staat aan één eind een
// eerste-orde-moment en aan het andere niets: r_m = 0/30 = 0 en C = 1,7.
//
//   λ_lim = 20·0,7·1,1783571·1,7/√0,3333333  = 48,57519
//
// Geschoord: 34,64 < 48,58 → tweede orde mag vervallen.
// Ongeschoord (console): C valt terug op 0,7, λ_lim = 20,0027, en λ = 69,28.
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

  const poortVan = (r) => r.checks.find((c) => c.id === "5.8.3.1_slankheidsgrens").kind.data;

  // ── 5a. Geschoord: de poort staat open ────────────────────────────────
  {
    const [r] = await kern("check_concrete_beams", bouw(KOLOM_GESCHOORD).inputs);
    const p = poortVan(r);
    dicht("λ = l₀/i met l₀ = l", p.uc.ed, 34.64102, 1e-4);
    dicht("λ_lim = 20·A·B·C/√n met C = 1,7", p.uc.rd, 48.57519, 1e-6);
    eq("de tweede-orde-effecten mogen vervallen", p.status, "Ok");
  }

  // ── 5b. Ongeschoord als console: dezelfde kolom, andere uitkomst ──────
  //
  // Dit is de kern van art. 5.8.1: hetzelfde model, hetzelfde krachtsverloop,
  // dezelfde korf — alleen een ander ONTWERPBESLUIT, en de kolom moet ineens
  // op tweede orde worden gerekend. Daarom is schoring invoer en geen
  // afleiding.
  {
    const [r] = await kern("check_concrete_beams", bouw({
      bracing: "Ongeschoord",
      buckling_length: { soort: "Figuur57", geval: "Console" },
    }).inputs);
    const p = poortVan(r);
    dicht("λ verdubbelt: l₀ = 2·l", p.uc.ed, 69.28203, 1e-4);
    dicht("λ_lim zakt naar 20,0 (C = 0,7)", p.uc.rd, 20.00155, 1e-6);
    eq("er MOET tweede orde worden gerekend", p.status, "NotOk");
    ok("en de melding zegt dat dit geen bezwijken is",
      p.notes.join(" ").includes("GEEN bezwijken"));
  }

  // ── 5c. Zonder het blok: geen toets, maar wél de reden ────────────────
  {
    const [r] = await kern("check_concrete_beams", bouw(null).inputs);
    const p = poortVan(r);
    eq("niet uitgevoerd", p.status, "NotApplicable");
    ok("de reden noemt art. 5.8.1 en het ontwerpbesluit",
      p.notes.join(" ").includes("5.8.1") && p.notes.join(" ").includes("geschoord"));
  }

  // ── 5d. φ_ef uit de quasi-blijvende combinatie ────────────────────────
  //
  // Met φ(∞,t₀) = 2,0 en M₀Eqp/M₀Ed = 0,30/1,20 = 0,25 (dezelfde last, andere
  // factor) is φ_ef = 0,5 en A = 1/(1 + 0,2·0,5) = 0,90909.
  //   λ_lim = 20·0,90909·1,1783571·1,7/√0,3333333 = 63,0882
  {
    const [r] = await kern("check_concrete_beams", bouw({
      ...KOLOM_GESCHOORD,
      phi_inf_t0: 2.0,
    }).inputs);
    const p = poortVan(r);
    dicht("λ_lim stijgt doordat φ_ef nu bekend is", p.uc.rd, 63.08466, 1e-6);
    const kruip = r.checks.find((c) => c.id === "5.8.4_kruip").kind.data;
    dicht("φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed = 2,0 · 0,25", kruip.value, 0.5, 1e-6);
    ok("de afleiding noemt de quasi-blijvende combinatie",
      kruip.notes.join(" ").includes("QUASI-BLIJVENDE"));
  }

  // ── 5e. De §9.5-eisen die een keuze missen, melden dat ────────────────
  {
    const [r] = await kern("check_concrete_beams", bouw(KOLOM_GESCHOORD).inputs);
    const eis = (id) => r.checks.find((c) => c.id === id).kind.data;
    eq("A_s,max zonder overlappingssituatie", eis("9.5.2_as_max").status, "NotApplicable");
    eq("s_cl,tmax zonder beugelzone", eis("9.5.3_s_cl_tmax").status, "NotApplicable");
    eq("A_s,min wordt wél gerekend", eis("9.5.2_as_min").status, "Ok");

    // Mét de twee keuzen worden ze wél gerekend.
    const [r2] = await kern("check_concrete_beams", bouw({
      ...KOLOM_GESCHOORD,
      stirrup_zone: "Regulier",
      lap_situation: "GeenLassen",
    }).inputs);
    const eis2 = (id) => r2.checks.find((c) => c.id === id).kind.data;
    // A_s,max = 0,08·A_c = 0,08 · 90 000 = 7 200 mm²
    dicht("A_s,max = 0,08·A_c", eis2("9.5.2_as_max").value, 7200, 1e-9);
    // s_cl,tmax = min(20·16 ; b = 300 ; 400) = 300 mm, reguliere zone
    dicht("s_cl,tmax = min(20Ø ; b ; 400)", eis2("9.5.3_s_cl_tmax").value, 300, 1e-9);
  }
}

log(`\n${passed} geslaagd, ${failed} mislukt${overgeslagen ? `, ${overgeslagen} overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
