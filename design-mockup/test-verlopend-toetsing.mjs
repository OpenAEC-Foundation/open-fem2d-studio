// Verlopende profielen — deel 2: de TOETSING (staal en hout) langs drie wegen.
//
// WAT HIER BEWEZEN WORDT
//   [1] Prismatisch-gelijkheid van de INVOER: een staaf zonder `profileEnd`,
//       met een leeg eindprofiel of met hetzelfde profiel levert een
//       byte-gelijke toetsinvoer — het veld `profile_end` respectievelijk
//       `width_end_mm`/`height_end_mm` ontbreekt dan.
//   [2] De bouwers geven het eindprofiel door zodra er werkelijk een verloop
//       is, en weigeren met reden wat geen verloop kan zijn.
//   [3] Een verlopende staaf wordt NOOIT met een buur samengevoegd tot een
//       doorgaande lijn: het verloop zou dan over de hele lijn worden
//       uitgesmeerd.
//   [4] De echte kern (toetsbrug): hout en staal, tegen handberekeningen.
//   [5] De MCP-weg: dezelfde staven door `check_timber_beams` en
//       `check_steel_beam`, en een heel model door `check_fem_model`.
//
// ── ANALYTISCHE REFERENTIES (alles met de hand) ──────────────────────────────
//
// HOUT. Rechthoek b × h(x), b constant, h lineair van h₀ (x = 0) naar h₁.
//   W_y(x) = b·h(x)²/6 ; σ_m = |M|·10⁶/W_y ; f_m,d = k_h·k_mod·f_m,k/γ_M
//   C24: f_m,k = 24, γ_M = 1,30, klimaatklasse 1. k_mod = 0,80 (middellang),
//   0,60 (blijvend). k_h = min((150/h)^0,2 ; 1,3) voor h < 150 mm, anders 1,0.
//
//   Uitkrager, M(u) = M₀·(1 − u) met u = x/L, h(u) = h₀(1 + k·u), k = h₁/h₀ − 1:
//     σ(u) ∝ (1 − u)/(1 + k·u)²  ⇒  dσ/du = 0 bij u* = (1 + 2k)/k.
//   Voor h₁/h₀ = 0,4 (k = −0,6) is u* = 1/3: het maatgevende punt ligt op
//   x = L/3 en NIET bij de inklemming, waar M het grootst is.
//   Met b = 100, h₀ = 500, h₁ = 200, L = 3000, M₀ = 30 kNm, k_mod = 0,80:
//     x =    0: h = 500, W = 4 166 666,7 → σ = 7,2000 → UC = 0,487500
//     x = 1000: h = 400, W = 2 666 666,7 → σ = 7,5000 → UC = 0,507813  ← max
//   De verhouding 0,507813/0,487500 = 25/24 is zuivere meetkunde.
//
// STAAL. Gelast I-profiel zonder afrondingsstraal, dubbelsymmetrisch:
//   W_pl,y = b·t_f·(h − t_f) + t_w·(h − 2·t_f)²/4
//   M_y,c,Rd = W_pl,y·f_y/γ_M0 (klasse 1/2), UC = |M_y,Ed|/M_y,c,Rd.
//   IPE 400 (h400 b180 tw8,6 tf13,5) → IPE 200 (h200 b100 tw5,6 tf8,5),
//   L = 6000, M(u) = 200·(1 − u) kNm, S235 (f_y = 235, γ_M0 = 1,0):
//     u = 0,0: W_pl = 180·13,5·386,5 + 8,6·373²/4 = 939 195 + 299 127,25
//              = 1 238 322,25 mm³ → M_Rd = 291,01 kNm → UC = 0,687264
//     u = 0,4: h = 320, b = 148, t_w = 7,4, t_f = 11,5
//              W_pl = 148·11,5·308,5 + 7,4·297²/4 = 525 067 + 163 186,65
//              = 688 253,65 mm³ → M_Rd = 161,74 kNm → UC = 0,741936  ← max
//   Het maatgevende punt ligt dus op x = 2400 mm, niet op x = 0.
//
// Draaien met: npx tsx test-verlopend-toetsing.mjs
//         of : node scripts/run-tests.mjs --filter=verlopend-toetsing

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const win = process.platform === "win32";
const TOETSBRUG = join(REPO, "src-tauri", "target", "release", win ? "toetsbrug.exe" : "toetsbrug");
const MCP_SERVER = join(REPO, "src-tauri", "target", "release", win ? "openaec-mcp-server.exe" : "openaec-mcp-server");

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { buildSteelCheckInputs, collinearContinuations, profileLookupKey } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

// De staalbouwer krijgt de profieldatabase mee, net als de app. Zij komt uit
// dezelfde `profiles.json` als de Rust-kern, zodat de maten waarmee de bouwer
// werkt en de maten waarmee de kern rekent uit één bron komen.
const PROFIELEN = JSON.parse(
  readFileSync(join(REPO, "src-tauri", "crates", "steel-profiles", "data", "profiles.json"), "utf8"),
);
const profileDb = new Map();
for (const p of PROFIELEN) {
  const k = profileLookupKey(p.name);
  if (!profileDb.has(k)) profileDb.set(k, p);
}

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function rel(naam, gemeten, verwacht, tolRel) {
  const afw = Math.abs(gemeten - verwacht) / Math.max(Math.abs(verwacht), 1e-300);
  ok(naam, Number.isFinite(gemeten) && afw <= tolRel,
    `${Number(gemeten).toPrecision(7)} vs ${verwacht.toPrecision(7)}, afwijking ${(afw * 100).toExponential(2)} %`);
}

// ── Modellen en bouwers ─────────────────────────────────────────────────────

/** Ligger op twee steunpunten, één staaf, één of meer belastinggevallen. */
function model({ materiaal, profiel, profielEind, L, lasten }) {
  const t = { 1: ["G", "dead"], 2: ["Q", "live"], 3: ["S", "snow"], 4: ["W", "wind"] };
  const loadCases = [], loads = [];
  for (const [id, q] of Object.entries(lasten)) {
    const [name, type] = t[id];
    loadCases.push({ id: +id, name, type });
    if (q !== 0) loads.push({ id: +id, type: "lineLoad", caseId: +id, beamId: 1, q });
  }
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{
      id: 1, from: 1, to: 2, material: materiaal, profile: profiel,
      ...(profielEind !== undefined ? { profileEnd: profielEind } : {}),
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases, loads,
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}

function bouw(m, bouwer) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  const combinations = selecteerCombinaties(defaultCombinations(m.loadCases), m.beams, m.plates).actief;
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  return bouwer({
    nodes: m.nodes, beams: m.beams, supports: m.supports, combinations, combinationResults,
    profileDb, loadCases: m.loadCases, gevallenMetLast: [...perCase.keys()],
  });
}

/** Als `bouw`, maar de bouwer krijgt een ANDERE staaf dan de solver zag. */
function bouwMetStaaf(m, staaf, bouwer) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  const combinations = selecteerCombinaties(defaultCombinations(m.loadCases), m.beams, m.plates).actief;
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  return bouwer({
    nodes: m.nodes, beams: [staaf], supports: m.supports, combinations, combinationResults,
    profileDb, loadCases: m.loadCases, gevallenMetLast: [...perCase.keys()],
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Prismatisch-gelijkheid van de toetsinvoer");
// ─────────────────────────────────────────────────────────────────────────
{
  const staal = (eind) => bouw(model({ materiaal: "S235", profiel: "IPE300", profielEind: eind, L: 5000, lasten: { 1: -8, 2: -4 } }), buildSteelCheckInputs);
  const ref = JSON.stringify(staal(undefined).inputs);
  ok("staal zonder eindprofiel: geen `profile_end` in de invoer", !ref.includes("profile_end"));
  for (const [naam, eind] of [["leeg", ""], ["gelijk", "IPE300"], ["anders gespeld", "IPE 300"]]) {
    ok(`staal, eindprofiel ${naam}: invoer byte-gelijk`, JSON.stringify(staal(eind).inputs) === ref);
  }
  const hout = (eind) => bouw(model({ materiaal: "C24", profiel: "100x300", profielEind: eind, L: 3000, lasten: { 1: -4, 2: -2 } }), buildTimberCheckInputs);
  const refH = JSON.stringify(hout(undefined).inputs);
  ok("hout zonder eindprofiel: geen `width_end_mm`/`height_end_mm`",
    !refH.includes("width_end_mm") && !refH.includes("height_end_mm"));
  for (const [naam, eind] of [["leeg", ""], ["gelijk", "100x300"], ["anders gespeld", "100 x 300"]]) {
    ok(`hout, eindprofiel ${naam}: invoer byte-gelijk`, JSON.stringify(hout(eind).inputs) === refH);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De bouwers geven het verloop door, of weigeren met reden");
// ─────────────────────────────────────────────────────────────────────────
{
  const s = bouw(model({ materiaal: "S235", profiel: "IPE400", profielEind: "IPE200", L: 6000, lasten: { 1: -10 } }), buildSteelCheckInputs);
  ok("staal: `profile_end` gaat mee", s.inputs[0]?.profile_end === "IPE200", JSON.stringify(s.inputs[0]?.profile_end));
  const h = bouw(model({ materiaal: "C24", profiel: "100x500", profielEind: "100x200", L: 3000, lasten: { 1: -4 } }), buildTimberCheckInputs);
  ok("hout: eindmaten gaan mee als b en h", h.inputs[0]?.width_end_mm === 100 && h.inputs[0]?.height_end_mm === 200,
    JSON.stringify([h.inputs[0]?.width_end_mm, h.inputs[0]?.height_end_mm]));

  // Een eindprofiel van een andere soort komt in het model niet eens door de
  // solverpoort (`controleerDoorsneden` weigert het, en deel 1 toetst dat).
  // Dat de BOUWER hem óók met reden overslaat, wordt hier gemeten door de
  // staaf pas ná het doorrekenen te verwisselen — anders is er geen
  // krachtsverloop om mee te bouwen.
  const goedHout = model({ materiaal: "C24", profiel: "100x500", profielEind: "100x200", L: 3000, lasten: { 1: -4 } });
  const fout = bouwMetStaaf(goedHout, { ...goedHout.beams[0], profileEnd: "IPE200" }, buildTimberCheckInputs);
  ok("hout: eindprofiel van een andere soort → overgeslagen mét reden",
    fout.inputs.length === 0 && fout.skipped.some((x) => x.beamId === 1 && /rechthoek/.test(x.reason)),
    fout.skipped.map((x) => x.reason).join("; ").slice(0, 120));
  const goedStaal = model({ materiaal: "S235", profiel: "IPE400", profielEind: "IPE200", L: 6000, lasten: { 1: -10 } });
  const foutS = bouwMetStaaf(goedStaal, { ...goedStaal.beams[0], profileEnd: "SHS100x100x5" }, buildSteelCheckInputs);
  ok("staal: een koker als eindprofiel → overgeslagen mét reden",
    foutS.inputs.length === 0 && foutS.skipped.some((x) => x.beamId === 1 && /niet ondersteund/.test(x.reason)),
    foutS.skipped.map((x) => x.reason).join("; ").slice(0, 140));
}

// ─────────────────────────────────────────────────────────────────────────
log("[3] Een verlopende staaf wordt niet tot een doorgaande lijn samengevoegd");
// ─────────────────────────────────────────────────────────────────────────
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }, { id: 3, x: 6000, z: 0 }];
  const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }];
  const prism = [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300" },
  ];
  ok("prismatische buren blijven één doorgaande lijn",
    collinearContinuations(prism[0], nodes, prism, supports).includes(2));
  const verlopend = [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE300", profileEnd: "IPE200" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300", profileEnd: "IPE200" },
  ];
  ok("verlopende buren worden NIET samengevoegd",
    collinearContinuations(verlopend[0], nodes, verlopend, supports).length === 0);
  ok("ook als maar één van de twee verloopt",
    collinearContinuations(prism[0], nodes, [prism[0], verlopend[1]], supports).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De echte kern (toetsbrug): hout en staal tegen de handberekening");
// ─────────────────────────────────────────────────────────────────────────
const punten = (n, L, f) => Array.from({ length: n + 1 }, (_, i) => ({
  combination_id: 1, position_mm: (i * L) / n,
  forces: { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: f(i / n), mz_ed: 0 },
}));

/** Houten uitkrager 100×500 → 100×200, L = 3000, M = 30·(1 − u) kNm. */
const HOUT_VERLOPEND = {
  beam_id: 1, width_mm: 100, height_mm: 500, height_end_mm: 200,
  strength_class: "C24", service_class: "Sc1", load_duration: "MediumTerm",
  length_m: 3.0, forces_envelope: punten(6, 3000, (u) => 30 * (1 - u)),
  perform_ltb_check: false,
};
/** Stalen uitkrager IPE 400 → IPE 200, L = 6000, M = 200·(1 − u) kNm. */
const STAAL_VERLOPEND = {
  beam_id: 1, profile_name: "IPE400", profile_end: "IPE200", steel_grade: "S235",
  length_m: 6.0, forces_envelope: punten(10, 6000, (u) => 200 * (1 - u)),
  lateral_bracing: { top_flange_positions: [], bottom_flange_positions: [] },
  deflection_limit_class: "Floor", deflection_limit_numerator: 333,
  deflection_actual_max_mm: 0, is_cantilever: false, consequence_class: "CC1",
};

const ucVan = (res, id) => res.checks.find((c) => c.id === id)?.kind?.data?.uc?.uc;
const posVan = (res, id) => res.checks.find((c) => c.id === id)?.kind?.data?.force_state?.position_mm;

function kern(opdracht, inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs }), encoding: "utf8", maxBuffer: 256 << 20,
  });
  if (r.status !== 0 || !r.stdout) throw new Error(`toetsbrug ${opdracht} faalde: ${(r.stderr ?? "").slice(0, 300)}`);
  return JSON.parse(r.stdout);
}

if (!existsSync(TOETSBRUG)) {
  ok("toetsbrug gevonden — bouw hem met `cargo build --release -p toetsbrug`", false, TOETSBRUG);
} else {
  const hout = kern("check_timber_beams", [HOUT_VERLOPEND])[0];
  ok("hout: het maatgevende punt ligt op x = L/3 = 1000 mm, niet bij de inklemming",
    posVan(hout, "6.1.6_bending") === 1000, String(posVan(hout, "6.1.6_bending")));
  rel("hout: UC buiging = 7,5/14,76923", ucVan(hout, "6.1.6_bending"), 0.507813, 1e-4);
  ok("hout: doorsnedenaam noemt het verloop", hout.section_name === "100 x 500 → 100 x 200 (verlopend)", hout.section_name);
  ok("hout: zes toetsdoorsneden in het rapport", hout.verloop?.toetsdoorsneden?.length === 6,
    String(hout.verloop?.toetsdoorsneden?.length));
  const bijNul = hout.verloop.toetsdoorsneden.find((d) => d.x_mm === 0);
  rel("hout: UC bij de inklemming = 7,2/14,76923", bijNul.toetsen.find((t) => t.id === "6.1.6_bending").uc, 0.4875, 1e-4);
  rel("hout: verhouding maatgevend/inklemming = 25/24",
    ucVan(hout, "6.1.6_bending") / bijNul.toetsen.find((t) => t.id === "6.1.6_bending").uc, 25 / 24, 1e-5);
  ok("hout: k_h en klasse ontbreken bij hout (geen staalbegrip)", bijNul.klasse === null || bijNul.klasse === undefined);

  // Prismatisch blijft prismatisch, ook door de kern heen.
  const { height_end_mm: _weg, ...prismatisch } = HOUT_VERLOPEND;
  const prism = kern("check_timber_beams", [{ ...prismatisch, height_mm: 500 }])[0];
  ok("hout prismatisch: geen verloopveld in het antwoord", prism.verloop === undefined || prism.verloop === null);
  const gelijk = kern("check_timber_beams", [{ ...prismatisch, height_mm: 500, height_end_mm: 500 }])[0];
  ok("hout: eindhoogte gelijk aan de beginhoogte geeft een byte-gelijk antwoord",
    JSON.stringify(gelijk) === JSON.stringify(prism));

  const staal = kern("check_steel_beams", [STAAL_VERLOPEND])[0];
  ok("staal: het maatgevende punt ligt op x = 2400 mm, niet bij de inklemming",
    posVan(staal, "6.2.5_bending_y") === 2400, String(posVan(staal, "6.2.5_bending_y")));
  rel("staal: UC buiging = 120/161,74", ucVan(staal, "6.2.5_bending_y"), 0.741936, 5e-4);
  ok("staal: doorsnedenaam noemt het verloop", staal.profile_name === "IPE 400 → IPE 200 (verlopend)", staal.profile_name);
  ok("staal: zes toetsdoorsneden", staal.verloop?.toetsdoorsneden?.length === 6, String(staal.verloop?.toetsdoorsneden?.length));
  ok("staal: elf rekenpunten", staal.verloop?.aantal_rekenpunten === 11, String(staal.verloop?.aantal_rekenpunten));
  // W_pl uit de doorsnedemotor tegen de gesloten formule van een gelaste I.
  const wpl = (h, b, tw, tf) => b * tf * (h - tf) + (tw * (h - 2 * tf) ** 2) / 4;
  for (const d of staal.verloop.toetsdoorsneden) {
    const u = d.t;
    const m = [400 - 200 * u, 180 - 80 * u, 8.6 - 3 * u, 13.5 - 5 * u];
    rel(`staal: W_pl,y op t = ${u.toFixed(1)} tegen de handformule`, d.w_y_mm3, wpl(...m), 1e-6);
  }
  ok("staal: de stabiliteitsdoorsnede staat in het rapport met reden",
    staal.verloop.stabiliteit.length >= 2 && staal.verloop.stabiliteit.every((s) => /KLEINSTE doorsnede/.test(s.reden)));
  const { profile_end: _weg2, ...staalPrism } = STAAL_VERLOPEND;
  const sp = kern("check_steel_beams", [staalPrism])[0];
  const sg = kern("check_steel_beams", [{ ...staalPrism, profile_end: "IPE 400" }])[0];
  ok("staal: eindprofiel gelijk aan het beginprofiel geeft een byte-gelijk antwoord",
    JSON.stringify(sg) === JSON.stringify(sp));
  ok("staal prismatisch: geen verloopveld in het antwoord", sp.verloop === undefined || sp.verloop === null);

  const weiger = kern("check_steel_beams", [{ ...STAAL_VERLOPEND, profile_end: "SHS100x100x5" }])[0];
  ok("staal: een koker als eindprofiel wordt geweigerd mét reden",
    weiger.checks.length === 0 && /geen I\/H-profiel/.test(weiger.governing_check_id ?? ""),
    (weiger.governing_check_id ?? "").slice(0, 120));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] De MCP-weg: dezelfde staven en een heel model");
// ─────────────────────────────────────────────────────────────────────────
function mcp(aanroepen) {
  return new Promise((klaar, mis) => {
    const k = spawn(MCP_SERVER, [], { stdio: ["pipe", "pipe", "pipe"] });
    const klok = setTimeout(() => { k.kill(); mis(new Error("MCP-server reageerde niet binnen 120 s")); }, 120_000);
    let buf = "";
    const antwoorden = new Map();
    k.on("error", (e) => { clearTimeout(klok); mis(e); });
    k.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const regel = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!regel) continue;
        antwoorden.set(JSON.parse(regel).id, JSON.parse(regel));
        if (antwoorden.size === aanroepen.length + 1) {
          clearTimeout(klok);
          k.stdin.end();
          klaar(aanroepen.map((_, n) => antwoorden.get(n + 2)));
        }
      }
    });
    const schrijf = (o) => k.stdin.write(JSON.stringify(o) + "\n");
    schrijf({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-verlopend-toetsing", version: "1" } } });
    aanroepen.forEach((a, n) => schrijf({ jsonrpc: "2.0", id: n + 2, method: "tools/call", params: { name: a.name, arguments: a.arguments } }));
  });
}

if (!existsSync(MCP_SERVER)) {
  ok("MCP-server gevonden — bouw hem met `cargo build --release -p openaec-mcp-server` (na `npm run build:sidecar`)", false, MCP_SERVER);
} else {
  const femModel = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "100x500", profileEnd: "100x200" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -4 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -6 },
    ],
  };
  const [hout, staal, femr] = await mcp([
    { name: "check_timber_beams", arguments: { inputs: [HOUT_VERLOPEND] } },
    { name: "check_steel_beam", arguments: STAAL_VERLOPEND },
    { name: "check_fem_model", arguments: { model: femModel } },
  ]);
  const inhoud = (a) => a?.result?.structuredContent;
  ok("MCP: `check_timber_beams` aanvaardt `height_end_mm` (strikt schema)",
    !hout?.error && !hout?.result?.isError, JSON.stringify(hout?.error ?? hout?.result?.content).slice(0, 200));
  if (inhoud(hout)) {
    const r = inhoud(hout).results[0];
    ok("MCP hout: zelfde maatgevende punt als de toetsbrug (x = 1000)", posVan(r, "6.1.6_bending") === 1000);
    rel("MCP hout: zelfde UC", ucVan(r, "6.1.6_bending"), 0.507813, 1e-4);
  }
  ok("MCP: `check_steel_beam` aanvaardt `profile_end` (strikt schema)",
    !staal?.error && !staal?.result?.isError, JSON.stringify(staal?.error ?? staal?.result?.content).slice(0, 200));
  if (inhoud(staal)) {
    const r = inhoud(staal);
    ok("MCP staal: zelfde maatgevende punt als de toetsbrug (x = 2400)", posVan(r, "6.2.5_bending_y") === 2400);
    rel("MCP staal: zelfde UC", ucVan(r, "6.2.5_bending_y"), 0.741936, 5e-4);
    ok("MCP staal: het verlooprapport reist mee", r.verloop?.toetsdoorsneden?.length === 6);
  }
  ok("MCP: `check_fem_model` met een verlopende houten staaf slaagt",
    !femr?.error && !femr?.result?.isError, JSON.stringify(femr?.error ?? femr?.result?.content).slice(0, 300));
  if (inhoud(femr)) {
    const r = inhoud(femr).timber_results?.find((x) => x.beam_id === 1);
    ok("MCP model: de staaf is getoetst en niet overgeslagen",
      r !== undefined, JSON.stringify(inhoud(femr).skipped_beams ?? []).slice(0, 200));
    if (r) {
      ok("MCP model: het verlooprapport zit in het antwoord", r.verloop?.toetsdoorsneden?.length === 6,
        String(r.verloop?.toetsdoorsneden?.length));
      ok("MCP model: de doorsnedenaam noemt het verloop", /verlopend/.test(r.section_name ?? r.profile_name ?? ""),
        r.section_name ?? r.profile_name);
    }
  }
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
