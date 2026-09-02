// ───────────────────────────────────────────────────────────────────────────
// R17 — Vrij opgelegde dakligger IPE 400 van 15,00 m met tussensteunen en
//       windzuiging.
//
// Validatiecampagne referentieberekeningen; dossier:
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md  (§6, R17)
//
// WAT DIT SCRIPT DOET
//   1. Bouwt het model uit de invoertabel van R17 op (2 knopen, 1 staaf,
//      3 belastinggevallen, 2 UGT- en 2 BGT-combinaties).
//   2. Schrijft het weg met serializeProject → R17.femp (en R17.ifcfem2d,
//      de extensie waarop de open-dialoog van de app filtert).
//   3. Leest het bestand terug met deserializeProject, vertaalt het met
//      dezelfde bouwMultiInput die de app gebruikt, en rekent het door met
//      solveAllCases + combineResults.
//   4. Bouwt met dezelfde buildSteelCheckInputs die de app gebruikt de
//      EN 1993-toetsinvoer, en laat die door de ECHTE Rust-rekenkern lopen —
//      via de meegeleverde MCP-server over stdio, zodat er geen tweede,
//      nagebouwde toetsing in dit script staat.
//   5. Legt elke referentiewaarde uit het dossier naast onze uitkomst.
//
// EENHEDEN
//   Model/adapter: mm, kN, kNm. Solver: mm, N, N·mm. De omrekening gebeurt in
//   bouwMultiInput; dit script rekent de solver-uitvoer alleen terug naar
//   kN/kNm om met de bron te vergelijken. De toetsinvoer (ForcePoint) is
//   kN/kNm — die omrekening doet buildSteelCheckInputs.
//
// TEKENCONVENTIES
//   - shearForce   : V(x), omhoog-positief links van x
//   - bendingMoment: veldmoment (sagging) positief
//   - deflection   : lokale +y; voor een horizontale staaf = omhoog positief,
//                    doorhangen dus NEGATIEF
//   De bron noteert M, V en w als grootheden zónder teken; er wordt daarom op
//   absolute waarde vergeleken, met het teken erbij gelogd.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R17.mjs
// ───────────────────────────────────────────────────────────────────────────

import { writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { buildSteelCheckInputs, profileLookupKey } =
  await import("../src/lib/steelCheckBuilder.ts");
const {
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
} = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..");
const MCP_EXE = join(REPO, "src-tauri", "target", "release", "openaec-mcp-server.exe");

const log = (s) => process.stdout.write(s + "\n");
const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n).replace(".", ",") : "—");

// ═══════════════════════════════════════════════════════════════════════════
// 1. HET MODEL — letterlijk uit de invoertabel van R17
// ═══════════════════════════════════════════════════════════════════════════
//
// Overspanning 15,00 m; belastingbreedte (stramien) 6,00 m.
// Profiel IPE 400, S235, doorsnedeklasse 1.
// Vrij opgelegd, zijdelings gesteund bij de opleggingen.
//
// BELASTING (karakteristiek, uit het dossier):
//   eigen gewicht ligger        0,65 kN/m   → uit selfWeightEnabled (ρ·A·g)
//   dakbedekking met gordingen  0,30 kN/m² × 6,00 m = 1,80 kN/m
//   Gk = 0,65 + 1,80 = 2,45 kN/m
//   sneeuw  Qs = 0,60 × 6,00 = 3,60 kN/m   (omlaag)
//   wind    Qw = 0,50 × 6,00 = 3,00 kN/m   (ZUIGING, dus omhoog)
//
// AANNAME — eigen gewicht. De bron geeft 0,65 kN/m; de app rekent zelf
// ρ·A·g = 7850 · 8450 mm² · 9,81 = 0,6507 kN/m. Verschil 0,1 %; we laten de
// app haar eigen gewicht rekenen in plaats van het als handlast in te voeren,
// zodat de eigengewichtroute meegetoetst wordt. Het effect op M en V is
// 0,02 % (zie de gelogde ontwerplasten).
const L_MM = 15000;
const STRAMIEN_M = 6.0;

const G_REST_KN_M = 0.30 * STRAMIEN_M;   // 1,80 kN/m — dakbedekking + gordingen
const QS_KN_M     = 0.60 * STRAMIEN_M;   // 3,60 kN/m — sneeuw
const QW_KN_M     = 0.50 * STRAMIEN_M;   // 3,00 kN/m — windzuiging (omhoog)

const ZEEG_MM = 30;                       // wc = L/500 = 30 mm

// Kipsteunen als FRACTIE van de staaflengte — dezelfde conventie als de
// Rust-kern (lambda_chi.rs vermenigvuldigt de fracties met de staaflengte).
//   bovenflens: gordingen om 2,50 m → 6 velden, 5 tussensteunen
//   onderflens: schoren van het stabiliteitsverband om 5,00 m → 2 tussensteunen
const STEUNEN_BOVEN = [1, 2, 3, 4, 5].map((i) => i / 6);
const STEUNEN_ONDER = [1, 2].map((i) => i / 3);

const nodes = [
  { id: 1, x: 0,     z: 0 },
  { id: 2, x: L_MM,  z: 0 },
];

const beams = [
  {
    id: 1, from: 1, to: 2,
    material: "S235",
    profile: "IPE400",
    checkConfig: {
      lateralRestraints: STEUNEN_BOVEN,
      lateralRestraintsBottom: STEUNEN_ONDER,
      deflectionClass: "roof",           // dak → L/250
      // Zeeg in de tekenconventie van de kern: w_fin = w − w_zeeg, en w is
      // negatief (omlaag). Een zeeg die 30 mm van de zakking afhaalt moet
      // dus als −30 worden ingevoerd (zie deflection.rs::w_fin_mm en de
      // veldbeschrijving in femTypes.BeamCheckConfig).
      preCamber_mm: -ZEEG_MM,
      bucklingLengthY_m: L_MM / 1000,
      bucklingLengthZ_m: L_MM / 1000,
    },
    loadRole: "dakPlat",
  },
];

// Vrij opgelegd: scharnier + rol. Alle belasting is verticaal, dus de keuze
// welke oplegging de horizontale richting opneemt raakt M/V/w niet.
const supports = [
  { nodeId: 1, type: "pinned"  },
  { nodeId: 2, type: "zRoller" },
];

const loadCases = [
  { id: 1, name: "G — permanent",     type: "dead" },
  { id: 2, name: "Qs — sneeuw",       type: "snow" },
  { id: 3, name: "Qw — windzuiging",  type: "wind" },
];

const loads = [
  { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -G_REST_KN_M },
  { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -QS_KN_M },
  // Windzuiging: POSITIEF q = omhoog. Dit is de tekentest van dit geval.
  { id: 3, type: "lineLoad", caseId: 3, beamId: 1, q: +QW_KN_M },
];

// Combinaties uit het dossier. De bron gebruikt EN 1990 vgl. 6.10 met de
// aanbevolen partiële factoren; de standaardcombinaties van de app
// (6.10a/6.10b met ψ) zijn hier dus expliciet vervangen.
//   UGT 1: 1,35·G + 1,50·Qs = 8,71 kN/m  (neerwaarts)
//   UGT 2: 1,00·G − 1,50·Qw = −2,05 kN/m (netto opwaarts; γ_G,inf = 1,0)
//   BGT  : G + Qs = 6,05 kN/m (karakteristiek)
//   BGT sneeuw: alleen Qs = 3,60 kN/m — de bron geeft die zakking apart.
const combinations = [
  { id: 1, name: "UGT 1 — sneeuw maatgevend", type: "uls",
    formula: "1,35·G + 1,50·Qs",
    factors: new Map([[1, 1.35], [2, 1.50]]) },
  { id: 2, name: "UGT 2 — windzuiging (netto opwaarts)", type: "uls",
    formula: "1,00·G + 1,50·Qw",
    factors: new Map([[1, 1.00], [3, 1.50]]) },
  { id: 3, name: "BGT Karakteristiek", type: "sls",
    formula: "G + Qs",
    factors: new Map([[1, 1.0], [2, 1.0]]) },
  { id: 4, name: "BGT sneeuw alleen", type: "sls",
    formula: "Qs",
    factors: new Map([[2, 1.0]]) },
];

const structuralGrid = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: 0 },
    { id: "B", label: "B", position: L_MM },
  ],
  zAxes: [{ id: "1", label: "1", position: 0 }],
};

const projectState = {
  nodes, beams, supports, plates: [], loads, loadCases,
  activeLoadCaseId: 1,
  selfWeightEnabled: true,       // 0,65 kN/m uit ρ·A·g
  nonlinearEnabled: false,       // eerste orde, zoals het dossier voorschrijft
  combinations: combinationsToFile(combinations),
  structuralGrid,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. OPSLAAN
// ═══════════════════════════════════════════════════════════════════════════
const json = serializeProject(projectState);
const padFemp = join(HIER, "R17.femp");
const padApp  = join(HIER, "R17.ifcfem2d");
writeFileSync(padFemp, json, "utf8");
writeFileSync(padApp,  json, "utf8");
log(`Model opgeslagen: ${padFemp}`);
log(`                  ${padApp}  (extensie die de open-dialoog van de app filtert)`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. DOORREKENEN — vanaf het TERUGGELEZEN bestand
// ═══════════════════════════════════════════════════════════════════════════
const bestand = deserializeProject(json);
const model = {
  nodes: bestand.nodes,
  beams: bestand.beams,
  supports: bestand.supports,
  plates: bestand.plates,
  loadCases: bestand.loadCases,
  loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: bestand.scheefstandEnabled ?? false,
  scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
  scheefstandRichting: bestand.scheefstandRichting ?? 1,
};
const combos = combinationsFromFile(bestand.combinations);
const multi = bouwMultiInput(model);
const perCase = solveAllCases(multi).perCase;

const perCombo = new Map();
for (const c of combos) perCombo.set(c.id, combineResults(c, perCase));

// Ontwerplast per combinatie (kN/m, omlaag positief) — puur ter controle van
// de invoer, direct uit de solver-invoer opgeteld.
function ontwerpLast(comboId) {
  const combo = combos.find((c) => c.id === comboId);
  let q = 0;
  for (const l of multi.loads) {
    const f = combo.factors.get(l.caseId);
    if (f !== undefined) q += f * l.q;   // q in N/mm = kN/m, negatief = omlaag
  }
  return -q;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERGELIJKEN — administratie
// ═══════════════════════════════════════════════════════════════════════════
//
// TOLERANTIE. R17 is een uitgewerkt voorbeeld uit een gepubliceerde
// ontwerpgids: numerieke referentie, dossier §1.5 → 1 %. Unity checks: 0,02
// absoluut (de bron rondt op 2 decimalen af).
const TOL_PCT = 1.0;
const TOL_UC  = 0.02;

const rijen = [];
function vergelijk(groep, grootheid, ref, onze, opties = {}) {
  const { tolAbs = 0, tolPct = TOL_PCT, eenheid = "", notitie = "" } = opties;
  const delta = onze - ref;
  const pct = ref === 0 ? (Math.abs(delta) < 1e-12 ? 0 : Infinity)
                        : (delta / Math.abs(ref)) * 100;
  const tol = Math.max(Math.abs(ref) * tolPct / 100, tolAbs);
  const ok = Math.abs(delta) <= tol;
  rijen.push({ groep, grootheid, ref, onze, delta, pct, ok, eenheid, notitie });
  log(`  ${ok ? "✓" : "✗"} ${grootheid.padEnd(34)}` +
      ` ref ${fmt(ref, 3).padStart(10)}   ons ${fmt(onze, 3).padStart(10)} ${eenheid.padEnd(5)}` +
      `  Δ ${fmt(delta, 3).padStart(9)}  ${Number.isFinite(pct) ? (pct.toFixed(2) + " %").padStart(8) : "   n.v.t."}` +
      (notitie ? `   ${notitie}` : ""));
}

/** Alleen loggen, niet als vergelijking meetellen. */
function meld(grootheid, waarde, eenheid = "") {
  log(`    · ${grootheid.padEnd(34)} ${fmt(waarde, 3).padStart(10)} ${eenheid}`);
}

// ── Uitlezers ──────────────────────────────────────────────────────────────
const ef = (comboId) => perCombo.get(comboId).elements.get(1);
/** Grootste |M| over de 21 stations, in kN·m, met teken. */
function mMax(comboId) {
  const a = ef(comboId).bendingMoment;
  let m = 0;
  for (const v of a) if (Math.abs(v) > Math.abs(m)) m = v;
  return m / 1e6;
}
/** Grootste |V| over de 21 stations, in kN, met teken. */
function vMax(comboId) {
  const a = ef(comboId).shearForce;
  let v = 0;
  for (const s of a) if (Math.abs(s) > Math.abs(v)) v = s;
  return v / 1000;
}
/** Grootste |w| over de 21 stations, in mm, met teken (negatief = omlaag). */
function wMax(comboId) {
  const a = ef(comboId).deflection;
  let w = 0;
  for (const s of a) if (Math.abs(s) > Math.abs(w)) w = s;
  return w;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5a. KRACHTSVERDELING
// ═══════════════════════════════════════════════════════════════════════════
log("\n═══ R17 — krachtsverdeling ═══");

log(`\n─── ${combos[0].name}  (${combos[0].formula}) ───`);
meld("ontwerplast q", ontwerpLast(1), "kN/m  (bron: 8,71)");
vergelijk("comb 1", "My,Ed", 244.97, Math.abs(mMax(1)), { eenheid: "kNm" });
vergelijk("comb 1", "VEd",    65.33, Math.abs(vMax(1)), { eenheid: "kN" });

log(`\n─── ${combos[1].name}  (${combos[1].formula}) ───`);
meld("ontwerplast q", ontwerpLast(2), "kN/m  (bron: −2,05, opwaarts)");
vergelijk("comb 2", "My,Ed", 57.66, Math.abs(mMax(2)), { eenheid: "kNm" });
vergelijk("comb 2", "VEd",   15.38, Math.abs(vMax(2)), { eenheid: "kN" });
log(`    tekencontrole: M = ${fmt(mMax(2))} kNm (hogging, dus negatief) — ` +
    `${mMax(2) < 0 ? "correct opwaarts" : "LET OP: teken klopt niet"}`);

// ═══════════════════════════════════════════════════════════════════════════
// 5b. DOORBUIGING (BGT)
// ═══════════════════════════════════════════════════════════════════════════
log("\n─── BGT-doorbuiging ───");
const wTot   = wMax(3);           // G + Qs
const wSneeuw = wMax(4);          // alleen Qs
meld("ontwerplast BGT karakteristiek", ontwerpLast(3), "kN/m  (bron: 6,05)");
vergelijk("BGT", "wtot (G + Qs)", 82.10, Math.abs(wTot), { eenheid: "mm" });
vergelijk("BGT", "wmax na aftrek zeeg", 52.10, Math.abs(wTot) - ZEEG_MM, { eenheid: "mm" });
vergelijk("BGT", "w door sneeuw alleen", 48.90, Math.abs(wSneeuw), { eenheid: "mm" });
log(`    L/w: wtot → L/${(L_MM / Math.abs(wTot)).toFixed(0)}` +
    `, na zeeg → L/${(L_MM / (Math.abs(wTot) - ZEEG_MM)).toFixed(0)} (bron L/288)` +
    `, sneeuw → L/${(L_MM / Math.abs(wSneeuw)).toFixed(0)} (bron L/307)`);

// ═══════════════════════════════════════════════════════════════════════════
// 6. EN 1993-TOETSING — via de echte Rust-kern (MCP-server over stdio)
// ═══════════════════════════════════════════════════════════════════════════
//
// Er staat hier BEWUST geen nagebouwde toetsing: het gaat er juist om of DE
// APP de referentiewaarden reproduceert. De toetsinvoer komt uit de app-eigen
// buildSteelCheckInputs; de weerstanden komen uit de Rust-kern.

/** Eén sessie met de MCP-server; `oproepen` = [{ naam, argumenten }]. */
function mcp(oproepen) {
  return new Promise((klaar, fout) => {
    if (!existsSync(MCP_EXE)) {
      fout(new Error(`MCP-server niet gevonden: ${MCP_EXE}`));
      return;
    }
    const kind = spawn(MCP_EXE, [], { stdio: ["pipe", "pipe", "ignore"] });
    let uit = "";
    const antwoorden = new Map();
    kind.stdout.on("data", (d) => {
      uit += d.toString();
      for (const regel of uit.split("\n")) {
        if (!regel.trim()) continue;
        let o; try { o = JSON.parse(regel); } catch { continue; }
        if (typeof o.id === "number" && o.id >= 10) antwoorden.set(o.id, o);
      }
      if (antwoorden.size === oproepen.length) kind.stdin.end();
    });
    kind.on("error", fout);
    kind.on("close", () => {
      const uitkomst = [];
      for (let i = 0; i < oproepen.length; i++) {
        const o = antwoorden.get(10 + i);
        if (!o) { fout(new Error(`geen antwoord op oproep ${oproepen[i].naam}`)); return; }
        if (o.error) { fout(new Error(`${oproepen[i].naam}: ${JSON.stringify(o.error)}`)); return; }
        const tekst = o.result?.content?.[0]?.text;
        uitkomst.push(tekst ? JSON.parse(tekst) : o.result);
      }
      klaar(uitkomst);
    });
    const stuur = (o) => kind.stdin.write(JSON.stringify(o) + "\n");
    stuur({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {},
                clientInfo: { name: "toets-R17", version: "1" } } });
    stuur({ jsonrpc: "2.0", method: "notifications/initialized" });
    oproepen.forEach((op, i) =>
      stuur({ jsonrpc: "2.0", id: 10 + i, method: "tools/call",
              params: { name: op.naam, arguments: op.argumenten } }));
  });
}

const uc = (res, id) => {
  const c = res.checks.find((x) => x.id === id);
  return c ? c.kind.data.uc : null;
};
const rd = (res, id) => {
  const c = res.checks.find((x) => x.id === id);
  return c ? c.kind.data.value : NaN;
};
const tussen = (res, id, symbool) => {
  const c = res.checks.find((x) => x.id === id);
  const v = c?.kind.data.intermediate_values?.find((x) => x.symbol === symbool);
  return v ? v.value : NaN;
};

let toetsGedraaid = false;
try {
  // Profielendatabase uit de kern — buildSteelCheckInputs heeft hem nodig
  // voor z_a (= h/2) en om onbekende profielen eerlijk over te slaan.
  const [db] = await mcp([{ naam: "list_steel_profiles", argumenten: {} }]);
  const profileDb = new Map(db.profiles.map((p) => [profileLookupKey(p.name), p]));

  // De app bouwt één invoer per staaf over de VOLLEDIGE UGT-envelop. Voor de
  // vergelijking met de bron, die comb. 1 en comb. 2 apart uitwerkt, bouwen we
  // die invoer driemaal met dezelfde functie: envelop, alleen comb. 1, alleen
  // comb. 2. Zo blijft de app-route intact en zijn de twee combinaties toch
  // los te leggen naast de bron.
  const bouw = (ulsIds) =>
    buildSteelCheckInputs({
      nodes: bestand.nodes,
      beams: bestand.beams,
      combinations: combos.filter((c) => c.type === "sls" || ulsIds.includes(c.id)),
      combinationResults: perCombo,
      profileDb,
    }).inputs[0];

  const invEnvelop = bouw([1, 2]);
  const invComb1   = bouw([1]);
  const invComb2   = bouw([2]);

  // Variant op comb. 2 die de ONDERFLENS-steunafstand (5,00 m) als
  // bovenflenssteun invoert. Dient om te laten zien of
  // lateralRestraintsBottom überhaupt effect heeft — zie de bevindingen.
  const invComb2Onder = {
    ...invComb2,
    lateral_bracing: {
      top_flange_positions: STEUNEN_ONDER,
      bottom_flange_positions: [],
    },
  };

  const [rEnvelop, rComb1, rComb2, rComb2Onder] = await mcp([
    { naam: "check_steel_beam", argumenten: invEnvelop },
    { naam: "check_steel_beam", argumenten: invComb1 },
    { naam: "check_steel_beam", argumenten: invComb2 },
    { naam: "check_steel_beam", argumenten: invComb2Onder },
  ]);
  toetsGedraaid = true;

  log("\n═══ R17 — EN 1993-1-1-toetsing (Rust-kern van de app) ═══");
  log(`  doorsnedeklasse: ${rComb1.classification}  (bron: klasse 1)`);

  log("\n─── Doorsnedeweerstand ───");
  vergelijk("doorsnede", "Mc,Rd", 307.15, rd(rComb1, "6.2.5_bending_y"),
    { eenheid: "kNm", notitie: "Wpl,y 1310 vs 1307 cm³ in de brontabel" });
  vergelijk("doorsnede", "Vpl,Rd", 579.21, rd(rComb1, "6.2.6_shear_z"),
    { eenheid: "kN", notitie: "Av 4273,1 vs 4269 mm²" });
  vergelijk("doorsnede", "Av", 4269, rd(rComb1, "6.2.6_shear_z") * Math.sqrt(3) / 235 * 1000,
    { eenheid: "mm²" });

  log("\n─── Unity checks doorsnede ───");
  vergelijk("comb 1", "UC buiging comb. 1", 0.798, uc(rComb1, "6.2.5_bending_y").uc,
    { tolAbs: TOL_UC, eenheid: "-" });
  vergelijk("comb 2", "UC buiging comb. 2", 0.188, uc(rComb2, "6.2.5_bending_y").uc,
    { tolAbs: TOL_UC, eenheid: "-" });
  vergelijk("comb 1", "UC dwarskracht comb. 1", 0.113, uc(rComb1, "6.2.6_shear_z").uc,
    { tolAbs: TOL_UC, eenheid: "-" });

  log("\n─── Kip: wat ONZE route (§6.3.2.2/6.3.2.3, NL NB) oplevert ───");
  log("  De bron toetst kip met de VEREENVOUDIGDE methode §6.3.2.4 (kolom");
  log("  drukflens, λ̄f ≤ λ̄c0·Mc,Rd/My,Ed). Die methode zit NIET in de kern");
  log("  (grep op 6.3.2.4 / λ̄f in nen-en-1993-1-1-ltb levert niets). De kern");
  log("  rekent altijd de Mcr-route van de NEDERLANDSE nationale bijlage.");
  log("  Onderstaande getallen zijn dus GEEN vergelijking met de bron maar");
  log("  de vastlegging van wat onze route geeft — dossier vraagt daarom.");
  for (const [naam, r, inv] of [["comb. 1", rComb1, invComb1], ["comb. 2", rComb2, invComb2]]) {
    log(`  ${naam}: toetsinvoer q_equiv = ${fmt(inv.q_equiv_n_per_mm, 3)} N/mm` +
        `, z_a = ${fmt(inv.z_a_mm, 0)} mm`);
    const u = uc(r, "6.3.2_ltb");
    log(`  ${naam}: L_st = ${fmt(tussen(r, "6.3.2_ltb", "L_{st}"), 0)} mm` +
        `, Mcr = ${fmt(tussen(r, "6.3.2_ltb", "M_{cr}"))} kNm` +
        `, λ̄_LT = ${fmt(tussen(r, "6.3.2_ltb", "\\bar{\\lambda}_{LT}"), 3)}` +
        `, χ_LT = ${fmt(tussen(r, "6.3.2_ltb", "\\chi_{LT}"), 3)}` +
        `, Mb,Rd = ${fmt(u.rd)} kNm, UC = ${fmt(u.uc, 3)}`);
  }
  log(`  Let op de q_equiv van comb. 2: 0 N/mm. equivalentUdlFromMoments`);
  log(`  (steelCheckBuilder.ts) klemt de pijl van de momentenlijn op ≥ 0 af,`);
  log(`  dus bij een HOGGING lijn (opwaartse last) valt de belastingterm B*`);
  log(`  weg en blijft "alleen eindmomenten" over — gunstiger dan de`);
  log(`  werkelijkheid, net als de genegeerde onderflenssteunen hieronder.`);
  log(`  envelop (zoals de app hem draait): UC kip = ` +
      `${fmt(uc(rEnvelop, "6.3.2_ltb").uc, 3)}, maatgevende toets ` +
      `"${rEnvelop.governing_check_id}", UC max = ${fmt(rEnvelop.uc_max, 3)}`);

  log("\n─── Werkt lateralRestraintsBottom? (comb. 2, onderflens gedrukt) ───");
  const lstNormaal = tussen(rComb2, "6.3.2_ltb", "L_{st}");
  const lstOnder   = tussen(rComb2Onder, "6.3.2_ltb", "L_{st}");
  log(`  model zoals ingevoerd (boven 2,50 m / onder 5,00 m): L_st = ${fmt(lstNormaal, 0)} mm`);
  log(`  dezelfde staaf met 5,00 m als BOVENflenssteun        : L_st = ${fmt(lstOnder, 0)} mm`);
  log(`  → de onderflenssteunen ${Math.abs(lstNormaal - 5000) < 1 ? "TELLEN MEE" : "worden GENEGEERD"}` +
      ` (bron rekent comb. 2 met Lc = 5,00 m)`);
  log(`     UC kip comb. 2 met 2,50 m: ${fmt(uc(rComb2, "6.3.2_ltb").uc, 3)}` +
      `   met 5,00 m: ${fmt(uc(rComb2Onder, "6.3.2_ltb").uc, 3)}`);

  log("\n─── Doorbuigingstoets van de kern (zeeg-verrekening) ───");
  const wfin = uc(rEnvelop, "deflection_w_fin");
  log(`  w uit de solver (BGT karakteristiek): ${fmt(invEnvelop.deflection_actual_max_mm)} mm`);
  log(`  zeeg ingevoerd                      : ${fmt(invEnvelop.pre_camber_mm)} mm`);
  vergelijk("BGT", "w_fin uit de kern", 52.10, wfin.ed, { eenheid: "mm" });
  log(`  grens L/250 = ${fmt(wfin.rd)} mm → UC = ${fmt(wfin.uc, 3)}`);
} catch (e) {
  log("\n═══ EN 1993-1-1-toetsing NIET gedraaid ═══");
  log(`  reden: ${e.message}`);
  log(`  De toetsing zit in de Rust-kern. Dit script roept die aan via de`);
  log(`  meegeleverde MCP-server (${MCP_EXE}).`);
  log(`  Bouwen met: cargo build --release -p openaec-mcp-server  (in src-tauri/)`);
  log(`  Er worden hier BEWUST geen vervangende getallen berekend.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. BRONCONSISTENTIE — §6.3.2.4 als derde partij nagerekend
// ═══════════════════════════════════════════════════════════════════════════
//
// Dit is GEEN app-uitkomst. Het dossier (§1.3) staat toe een gesloten formule
// als derde partij te gebruiken om te beoordelen of een verschil bij de bron
// of bij ons zit. Omdat onze kern §6.3.2.4 niet kent, wordt hier alleen
// gecontroleerd of de bron met zichzelf in overeenstemming is.
log("\n═══ Bronconsistentie §6.3.2.4 (handafleiding, NIET uit de app) ═══");
{
  const If_z = 658.34e4;   // mm⁴ — uit de bron
  const Af_z = 31.54e2;    // mm² — uit de bron
  const if_z = Math.sqrt(If_z / Af_z);
  const lambda1 = 93.9;    // ε = 1 bij S235
  const c0 = 0.50;
  const McRd_bron = 307.15;

  log(`  i_f,z = √(I_f,z/A_f,z) = ${fmt(if_z / 10, 3)} cm   (bron 4,57 cm)`);
  for (const [naam, Lc, MEd, refLam, refGrens] of [
    ["comb. 1", 2500, 244.97, 0.583, 0.627],
    ["comb. 2", 5000,  57.66, 1.165, 2.663],
  ]) {
    const lam = Lc / (if_z * lambda1);
    const grens = c0 * McRd_bron / MEd;
    log(`  ${naam}: λ̄_f = ${fmt(lam, 3)} (bron ${fmt(refLam, 3)}) ` +
        `≤ λ̄_c0·Mc,Rd/My,Ed = ${fmt(grens, 3)} (bron ${fmt(refGrens, 3)}) → ` +
        `${lam <= grens ? "voldoet" : "voldoet NIET"}`);
  }

  // Reconstructie van A_f,z: drukflens + de twee walsstralen + ⅓ van het
  // gedrukte lijfdeel. De walsstraal-oppervlakken zijn (1 − π/4)·r² per hoek.
  const b = 180, tf = 13.5, tw = 8.6, r = 21, hw = 400 - 2 * 13.5;
  const Afl = b * tf;
  const Astraal = 2 * (1 - Math.PI / 4) * r * r;
  const Alijf = (1 / 3) * (hw / 2) * tw;
  log(`  reconstructie A_f,z = flens ${fmt(Afl, 0)} + 2 walsstralen ${fmt(Astraal, 0)}` +
      ` + ⅓ gedrukt lijf ${fmt(Alijf, 0)} = ${fmt(Afl + Astraal + Alijf, 0)} mm²  (bron 3154)`);
  const Ifl = tf * b ** 3 / 12;
  const Ilijf = (hw / 2 / 3) * tw ** 3 / 12;
  log(`  reconstructie I_f,z = flens ${fmt(Ifl / 1e4, 1)} + ⅓ lijf ${fmt(Ilijf / 1e4, 2)}` +
      ` = ${fmt((Ifl + Ilijf) / 1e4, 1)} cm⁴ (bron 658,34; walsstralen ≈ 1,5 cm⁴ verwaarloosd)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. WAT NIET VERGELEKEN IS
// ═══════════════════════════════════════════════════════════════════════════
log("\n═══ Niet vergeleken ═══");
log("  If,z / Af,z / if,z, λ1 / c0, kc / Lc / λ̄f  — grootheden van de");
log("    vereenvoudigde kipmethode §6.3.2.4; die methode zit niet in de kern,");
log("    dus de app produceert deze getallen niet. Hierboven staat alleen de");
log("    bronconsistentiecontrole, expliciet gemerkt als handafleiding.");
log("  Lijfplooi hw/tw = 43,37 < 72 — de kern toetst lijfplooi niet apart maar");
log("    weigert de schuiftoets zodra hw/tw > 72ε/η; die weigering blijft hier");
log("    uit, wat overeenkomt met de conclusie van de bron.");

// ═══════════════════════════════════════════════════════════════════════════
// 9. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
const buiten = rijen.filter((r) => !r.ok);
const eindig = rijen.filter((r) => Number.isFinite(r.pct));
const grootste = eindig.reduce((m, r) => Math.max(m, Math.abs(r.pct)), 0);
const ergste = eindig.find((r) => Math.abs(r.pct) === grootste);

log("\n═══════════════════════════════════════════════════════════════════");
log(`R17 — ${rijen.length} vergelijkingen: ${rijen.length - buiten.length} binnen tolerantie, ${buiten.length} erbuiten`);
log(`Grootste relatieve afwijking: ${grootste.toFixed(2)} %` +
    (ergste ? `  bij "${ergste.grootheid}" (${ergste.groep})` : ""));
if (!toetsGedraaid) log("LET OP: de EN 1993-toetsing is niet gedraaid — zie hierboven.");
if (buiten.length) {
  log("\nBuiten tolerantie:");
  for (const r of buiten) {
    log(`  ${r.groep}  ${r.grootheid}: ref ${fmt(r.ref, 3)}  ons ${fmt(r.onze, 3)}` +
        `  Δ ${fmt(r.delta, 3)}  (${Number.isFinite(r.pct) ? r.pct.toFixed(2) + " %" : "n.v.t."})` +
        (r.notitie ? `  — ${r.notitie}` : ""));
  }
}
log("═══════════════════════════════════════════════════════════════════");

process.exit(buiten.length > 0 ? 1 : 0);
