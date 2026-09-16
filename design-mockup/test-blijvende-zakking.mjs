// w₁ — de zakking onder ALLEEN de blijvende belasting — voor hout en staal.
//
// WAT HIER BEWEZEN WORDT
//   [1] Hout: de bouwer geeft w₁ uit de BGT-combinatie met alleen G mee, de
//       kern rekent daarmee w_add = w_fin − w₁ = w₂ + w₃.
//   [2] Hout zonder zo'n combinatie: w₁ = 0 MET een notitie — nooit stil.
//   [3] Wat NIET als w₁ telt: een deel van de blijvende gevallen, of G met een
//       andere factor dan 1,0; en geen belastinggevallen meegegeven.
//   [4] Staal: dezelfde w₁ in de staalbouwer, en de ZEEG blijft erbuiten.
//   [5] Staal zonder blijvende combinatie: 0 met notitie.
//   [6] Een stalen ligger houdt ALLE BGT-combinaties in de selectie, ook de
//       volledige 6.16b met ψ₂·Q en de frequente 6.15b (issue #10), en de
//       doorbuigingstoets ziet de quasi-blijvende zakking 5,793 mm.
//   [7] De MCP-weg (`check_fem_model`): dezelfde getallen voor hout en staal.
//
// ── NORM ─────────────────────────────────────────────────────────────────────
// NEN-EN 1990:2002/NB:2019 vervangt A1.4.3(2) en definieert bij figuur NB.1:
// w₁ = "aanvangsdeel van de doorbuiging onder de blijvende belastingen uit de
// van toepassing zijnde belastingscombinatie"; w_tot = w₁ + w₂ + w₃; A1.4.3(3)
// legt de grenswaarden op "de som van de vervorming w₂ en w₃". Dus
// w_add = w₂ + w₃ = w_tot − w₁. Tot september 2026 stuurden beide bouwers
// w₁ = 0, en was w_add gelijk aan w_tot.
//
// Let op, en bewust NIET veranderd: EN 1995-1-1 2.2.3(2) rekent w_inst met de
// KARAKTERISTIEKE combinatie, terwijl de NB bij A1.4.3(3) voor w₂ + w₃ van een
// vloer de FREQUENTE noemt. De houttoets volgt EC5 en is daarmee strenger; deze
// test legt dat vast in plaats van het te wijzigen.
//
// ── HANDBEREKENINGEN ────────────────────────────────────────────────────────
// Vrij opgelegde ligger, gelijkmatig verdeelde last q: w = 5·q·L⁴ / (384·E·I).
//
// HOUT. C24 45 × 145, L = 3000 mm, E₀,mean = 11 000 N/mm² (EN 338),
//   I = 45·145³/12 = 11 432 343,75 mm⁴; 384·E·I = 4,82902·10¹³; L⁴ = 8,1·10¹³.
//   G = 0,5 kN/m, Q = 1,5 kN/m categorie A (ψ₂ = 0,3), klimaatklasse 1
//   (k_def = 0,60, tabel 3.2).
//     w_inst = w(G + Q = 2,0)        = 16,774 mm   (6.14b)
//     w_qp   = w(G + 0,3·Q = 0,95)   =  7,967 mm   (6.16b)
//     w₁     = w(G = 0,5)            =  4,193 mm   (6.16b zonder Q)
//     w_fin  = 16,774 + 0,60·7,967   = 21,554 mm → UC = 21,554/(3000/250) = 1,7962
//     w_add  = 21,554 − 4,193        = 17,361 mm → UC = 17,361·333/3000  = 1,9270
//   Met w₁ = 0 (het oude gedrag):  w_add = 21,554 → UC = 21,554·333/3000 = 2,3925.
//
// STAAL. IPE 200, L = 5000 mm, E = 210 000 N/mm², I_y = 19,4·10⁶ mm⁴;
//   384·E·I = 1,564416·10¹⁵; L⁴ = 6,25·10¹⁴. G = 2 kN/m, Q = 3 kN/m cat. A.
//     w_tot = w(5,0) = 9,988 mm ; w₁ = w(2,0) = 3,995 mm
//     w_add = 9,988 − 3,995 = 5,993 mm → UC = 5,993/15,0 = 0,3995
//     (vloer: 3/1 000 · ℓ_rep = 15,0 mm, NB A1.4.3(3) tweede streepje)
//   Met w₁ = 0: UC = 9,988/15,0 = 0,6659.
//
// STAAL, QUASI-BLIJVEND (issue #10). Categorie A: ψ₂ = 0,3 (NB tabel
//   NB.2–A1.1); uitdrukking 6.16b ΣG + Σψ₂·Q = 2,0 + 0,3 · 3,0 = 2,9 kN/m.
//     w_qp = 5 · 2,9 · 5000⁴ / (384 · 210 000 · 19,4·10⁶)
//          = 5 · 2,9 · 6,25·10¹⁴ / 1,564416·10¹⁵ = 5,793 mm
//   Zonder ψ₂·Q (alleen G, wat de selectie in zuiver staal overliet): 3,995 mm.
//   Staan alleen de quasi-blijvende combinaties in de lijst (de gebruiker
//   haalde 6.14b en 6.15b weg), dan is 6.16b maatgevend:
//     w_fin = 5,793 mm → UC = 5,793 / (5000/333) = 0,3858
//     w_add = 5,793 − 3,995 = 1,798 mm → UC = 1,798 / 15,0 = 0,1199
//
// Draaien met: npx tsx test-blijvende-zakking.mjs
//         of : node scripts/run-tests.mjs --filter=blijvende-zakking

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
const { buildSteelCheckInputs, profileLookupKey } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");

const PROFIELEN = JSON.parse(
  readFileSync(join(REPO, "src-tauri", "crates", "steel-profiles", "data", "profiles.json"), "utf8"),
);
const profileDb = new Map();
for (const p of PROFIELEN) {
  const k = profileLookupKey(p.name);
  if (!profileDb.has(k)) profileDb.set(k, p);
}

let passed = 0, failed = 0;
const log = (s = "") => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function dicht(naam, gemeten, verwacht, tolAbs) {
  ok(naam, Number.isFinite(gemeten) && Math.abs(gemeten - verwacht) <= tolAbs,
    `${Number(gemeten).toFixed(4)} vs ${verwacht.toFixed(4)}`);
}

// ── Handwaarden ─────────────────────────────────────────────────────────────
const wUniform = (qKnPerM, L, E, I) => (5 * qKnPerM * L ** 4) / (384 * E * I);

const HOUT = { L: 3000, E: 11000, I: (45 * 145 ** 3) / 12, G: 0.5, Q: 1.5 };
const hInst = wUniform(HOUT.G + HOUT.Q, HOUT.L, HOUT.E, HOUT.I);
const hQp = wUniform(HOUT.G + 0.3 * HOUT.Q, HOUT.L, HOUT.E, HOUT.I);
const hPerm = wUniform(HOUT.G, HOUT.L, HOUT.E, HOUT.I);
const hFin = hInst + 0.6 * hQp;
const hAdd = hFin - hPerm;

const STAAL = { L: 5000, E: 210000, I: 19.4e6, G: 2.0, Q: 3.0 };
const sTot = wUniform(STAAL.G + STAAL.Q, STAAL.L, STAAL.E, STAAL.I);
const sPerm = wUniform(STAAL.G, STAAL.L, STAAL.E, STAAL.I);
const sQp = wUniform(STAAL.G + 0.3 * STAAL.Q, STAAL.L, STAAL.E, STAAL.I);

// Zelfcontrole van de handwaarden tegen de getallen in de kop.
dicht("hand hout w_fin = 21,554", hFin, 21.554, 5e-4);
dicht("hand hout w₁ = 4,193", hPerm, 4.193, 5e-4);
dicht("hand hout w_add = 17,361", hAdd, 17.361, 5e-4);
dicht("hand staal w_tot = 9,988", sTot, 9.988, 5e-4);
dicht("hand staal w₁ = 3,995", sPerm, 3.995, 5e-4);
dicht("hand staal w_qp = w(2,9) = 5,793", sQp, 5.793, 5e-4);

// ── Modellen en bouwers ─────────────────────────────────────────────────────
function ligger({ materiaal, profiel, L, G, Q, checkConfig }) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: materiaal, profile: profiel, ...(checkConfig ? { checkConfig } : {}) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live", categorie: "A" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -G },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -Q },
    ],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}

/** Doorrekenen zoals de app: selectie MET de belastinggevallen, dan combineren. */
function reken(m, filter = () => true, extraCombinaties = []) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  const alle = [...defaultCombinations(m.loadCases), ...extraCombinaties];
  // Met de knopen, zoals de store en de sidecar: zonder knopen is niet te
  // zien of een staaf een vloer- of dakeis krijgt (zie combinatieSelectie).
  const sel = selecteerCombinaties(alle, m.beams, m.plates, { loadCases: m.loadCases, nodes: m.nodes });
  const combinations = sel.actief.filter(filter);
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  return { perCase, sel, combinations, combinationResults };
}

const isBlijvend = (c) => c.type === "sls" && c.factors.size === 1 && c.factors.get(1) === 1;

function hout(m, opties = {}) {
  const r = reken(m, opties.filter, opties.extra);
  return buildTimberCheckInputs({
    nodes: m.nodes, beams: m.beams, supports: m.supports,
    combinations: r.combinations, combinationResults: r.combinationResults,
    ...(opties.zonderGevallen ? {} : { loadCases: m.loadCases }),
    gevallenMetLast: [...r.perCase.keys()],
  });
}

function staal(m, opties = {}) {
  const r = reken(m, opties.filter);
  return {
    sel: r.sel,
    res: buildSteelCheckInputs({
      nodes: m.nodes, beams: m.beams, supports: m.supports,
      combinations: r.combinations, combinationResults: r.combinationResults,
      profileDb,
      ...(opties.zonderGevallen ? {} : { loadCases: m.loadCases }),
    }),
  };
}

function kern(opdracht, inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs }), encoding: "utf8", maxBuffer: 256 << 20,
  });
  if (r.status !== 0 || !r.stdout) throw new Error(`toetsbrug ${opdracht} faalde: ${(r.stderr ?? "").slice(0, 300)}`);
  const uit = JSON.parse(r.stdout);
  if (uit.fout) throw new Error(uit.fout);
  return uit;
}
const toets = (res, id) => res.checks.find((c) => c.id === id)?.kind?.data;
const heeftKern = existsSync(TOETSBRUG);
if (!heeftKern) ok("toetsbrug gevonden — bouw hem met `cargo build --release -p toetsbrug`", false, TOETSBRUG);

const houtModel = ligger({ materiaal: "C24", profiel: "45x145", L: HOUT.L, G: HOUT.G, Q: HOUT.Q, checkConfig: { serviceClass: 1 } });
const staalModel = ligger({ materiaal: "S235", profiel: "IPE200", L: STAAL.L, G: STAAL.G, Q: STAAL.Q, checkConfig: { deflectionClass: "floor" } });

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Hout mét blijvende BGT-combinatie");
// ─────────────────────────────────────────────────────────────────────────
{
  const inv = hout(houtModel).inputs[0];
  dicht("w₁ naar de kern = −w(G)", inv.deflection_permanent_mm, -hPerm, 1e-3);
  dicht("w_inst ongewijzigd", inv.deflection_inst_mm, -hInst, 1e-3);
  dicht("w_qp ongewijzigd", inv.deflection_quasi_perm_mm, -hQp, 1e-3);
  const noot = inv.deflection_notes.find((n) => n.startsWith("w₁ ="));
  ok("notitie noemt de combinatie zonder Q", /"BGT quasi-blijvend 6\.16b — zonder Q"/.test(noot ?? ""), (noot ?? "").slice(0, 90));
  ok("notitie citeert de NB (A1.4.3(2), figuur NB.1)", /A1\.4\.3\(2\)/.test(noot ?? "") && /figuur NB\.1/.test(noot ?? ""));
  ok("notitie zegt dat de zeeg niet in w₁ zit", /zeeg/.test(noot ?? ""));
  ok("rapport noemt de bewuste keuze: karakteristiek (EC5 2.2.3(2)) i.p.v. frequent (NB A1.4.3(3))",
    inv.deflection_notes.some((n) => /2\.2\.3\(2\)/.test(n) && /FREQUENTE/.test(n) && /strenger/.test(n)));
  if (heeftKern) {
    const r = kern("check_timber_beams", [inv])[0];
    const fin = toets(r, "deflection_w_fin"), add = toets(r, "deflection_w_add");
    dicht("kern w_fin = 21,554 mm", fin.uc.ed, hFin, 2e-3);
    dicht("kern UC w_fin = 1,7962", fin.uc.uc, 1.7962, 2e-4);
    dicht("kern w_add = w_fin − w₁ = 17,361 mm", add.uc.ed, hAdd, 2e-3);
    dicht("kern UC w_add = 1,9270 (was 2,3925)", add.uc.uc, 1.9270, 2e-4);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Hout ZONDER blijvende BGT-combinatie: 0 met melding, nooit stil");
// ─────────────────────────────────────────────────────────────────────────
{
  const inv = hout(houtModel, { filter: (c) => !isBlijvend(c) }).inputs[0];
  ok("w₁ = 0", inv.deflection_permanent_mm === 0, String(inv.deflection_permanent_mm));
  const noot = inv.deflection_notes.find((n) => n.startsWith("w₁ — de zakking onder alleen de blijvende belasting — is op 0 gezet"));
  ok("er staat een melding dat w₁ op 0 is gezet", noot !== undefined);
  ok("de melding noemt de reden (geen combinatie met alleen de blijvende gevallen)", /geen BGT-combinatie kent die uitsluitend/.test(noot ?? ""));
  ok("de melding zegt dat w_add daardoor de volledige zakking krijgt", /VOLLEDIGE zakking/.test(noot ?? ""));
  ok("de melding zegt hoe het te herstellen is (6.16b zonder veranderlijke gevallen)", /6\.16b in de opstelling zonder veranderlijke gevallen/.test(noot ?? ""));
  if (heeftKern) {
    const r = kern("check_timber_beams", [inv])[0];
    dicht("kern UC w_add = 2,3925 (het strenge oude getal)", toets(r, "deflection_w_add").uc.uc, 2.3925, 2e-4);
    ok("de melding reist mee in het kernresultaat (w_fin-notes)",
      toets(r, "deflection_w_fin").notes.some((n) => /is op 0 gezet/.test(n)));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Wat NIET als w₁ telt");
// ─────────────────────────────────────────────────────────────────────────
{
  // (a) G met factor 0,9: geen uitdrukking 6.14a–6.16b.
  const scheef = {
    id: 900, name: "BGT eigen: 0,9·G", type: "sls", formula: "0,9·G", factors: new Map([[1, 0.9]]),
  };
  const a = hout(houtModel, { filter: (c) => !isBlijvend(c), extra: [scheef] }).inputs[0];
  ok("(a) 0,9·G telt niet als w₁ → 0 met melding",
    a.deflection_permanent_mm === 0 && a.deflection_notes.some((n) => /is op 0 gezet/.test(n)));

  // (b) Twee blijvende gevallen; een combinatie met maar één ervan is geen w₁.
  const twee = ligger({ materiaal: "C24", profiel: "45x145", L: HOUT.L, G: HOUT.G, Q: HOUT.Q, checkConfig: { serviceClass: 1 } });
  twee.loadCases.push({ id: 3, name: "G afwerking", type: "dead" });
  twee.loads.push({ id: 3, type: "lineLoad", caseId: 3, beamId: 1, q: -0.2 });
  const alleenG1 = {
    id: 901, name: "BGT eigen: alleen G", type: "sls", formula: "G", factors: new Map([[1, 1]]),
  };
  const zonderVolledig = (c) => !(c.type === "sls" && c.factors.size === 2 && c.factors.get(1) === 1 && c.factors.get(3) === 1);
  const b = hout(twee, { filter: zonderVolledig, extra: [alleenG1] }).inputs[0];
  ok("(b) een deel van de blijvende gevallen telt niet als w₁ → 0 met melding",
    b.deflection_permanent_mm === 0 && b.deflection_notes.some((n) => /is op 0 gezet/.test(n)),
    String(b.deflection_permanent_mm));
  // …en met de standaardset wél: w₁ = w(0,5 + 0,2).
  const b2 = hout(twee).inputs[0];
  dicht("(b) met beide blijvende gevallen: w₁ = w(0,7)", b2.deflection_permanent_mm, -wUniform(0.7, HOUT.L, HOUT.E, HOUT.I), 1e-3);

  // (c) Geen belastinggevallen meegegeven: niet te zien wat blijvend is.
  const c = hout(houtModel, { zonderGevallen: true }).inputs[0];
  ok("(c) zonder belastinggevallen → 0 met die reden",
    c.deflection_permanent_mm === 0 && c.deflection_notes.some((n) => /belastinggevallen niet zijn meegegeven/.test(n)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Staal mét blijvende BGT-combinatie, en de zeeg blijft erbuiten");
// ─────────────────────────────────────────────────────────────────────────
{
  const { res } = staal(staalModel);
  const inv = res.inputs[0];
  dicht("w₁ naar de kern = −w(G)", inv.deflection_permanent_mm, -sPerm, 1e-3);
  dicht("w_max ongewijzigd", inv.deflection_actual_max_mm, -sTot, 1e-3);
  ok("de oude melding 'w_add is hier GELIJK aan w_fin' is weg",
    !inv.deflection_notes.some((n) => /w_add is hier GELIJK aan w_fin/.test(n)));
  ok("notitie noemt w₁ en de combinatie",
    inv.deflection_notes.some((n) => n.startsWith("w₁ =") && /zonder Q/.test(n)));

  const metZeeg = ligger({ materiaal: "S235", profiel: "IPE200", L: STAAL.L, G: STAAL.G, Q: STAAL.Q, checkConfig: { deflectionClass: "floor", preCamber_mm: 5 } });
  const invZ = staal(metZeeg).res.inputs[0];
  ok("met 5 mm zeeg: w₁ is dezelfde (de zeeg hoort bij w_c, niet bij w₁)",
    invZ.deflection_permanent_mm === inv.deflection_permanent_mm, `${invZ.deflection_permanent_mm} vs ${inv.deflection_permanent_mm}`);
  ok("met 5 mm zeeg: pre_camber_mm gaat apart mee", invZ.pre_camber_mm === 5);

  if (heeftKern) {
    const r = kern("check_steel_beams", [inv])[0];
    dicht("kern w_add = 9,988 − 3,995 = 5,993 mm", toets(r, "deflection_w_add").uc.ed, sTot - sPerm, 2e-3);
    dicht("kern UC w_add = 0,3995 (was 0,6659)", toets(r, "deflection_w_add").uc.uc, 0.3995, 2e-4);
    dicht("kern w_fin = 9,988 mm (zonder zeeg)", toets(r, "deflection_w_fin").uc.ed, sTot, 2e-3);
    const rz = kern("check_steel_beams", [invZ])[0];
    dicht("kern met zeeg: w_add onveranderd 5,993 mm", toets(rz, "deflection_w_add").uc.ed, sTot - sPerm, 2e-3);
    ok("kern met zeeg: w_fin verandert wél", Math.abs(toets(rz, "deflection_w_fin").uc.ed - sTot) > 1,
      String(toets(rz, "deflection_w_fin").uc.ed));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Staal ZONDER blijvende BGT-combinatie: 0 met melding");
// ─────────────────────────────────────────────────────────────────────────
{
  const inv = staal(staalModel, { filter: (c) => !isBlijvend(c) }).res.inputs[0];
  ok("w₁ = 0", inv.deflection_permanent_mm === 0);
  ok("melding aanwezig", inv.deflection_notes.some((n) => /is op 0 gezet/.test(n) && /VOLLEDIGE zakking/.test(n)));
  if (heeftKern) {
    const r = kern("check_steel_beams", [inv])[0];
    dicht("kern UC w_add = 0,6659", toets(r, "deflection_w_add").uc.uc, 0.6659, 2e-4);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Stalen ligger: de volledige 6.16b (met ψ₂·Q) blijft, en de toets ziet 5,793 mm (issue #10)");
// ─────────────────────────────────────────────────────────────────────────
// NEN-EN 1990 A1.4.3(4): "Indien het uiterlijk van de constructie wordt
// beschouwd, behoort de quasi-blijvende combinatie (uitdrukking 6.16b) te zijn
// gebruikt"; de NB begrenst w_max daar "bij zowel vloeren als daken". Tot
// september 2026 liet de selectie die combinatie in een zuivere
// staalconstructie weg — staal kent geen kruip — en hield alleen G over.
{
  const { sel, res } = staal(staalModel);
  const namen = sel.actief.map((c) => c.name);
  ok("'BGT quasi-blijvend 6.16b' (met ψ₂·Q) blijft actief", namen.includes("BGT quasi-blijvend 6.16b"), namen.join(" | "));
  ok("'BGT quasi-blijvend 6.16b — zonder Q' blijft actief", namen.includes("BGT quasi-blijvend 6.16b — zonder Q"));
  ok("de frequente 6.15b blijft actief (A1.4.3(3), w₂ + w₃ van een vloer)", namen.some((n) => /6\.15b/.test(n)));
  ok("er wordt niets overgeslagen", sel.overgeslagen.length === 0, sel.overgeslagen.map((o) => o.naam).join(" | "));

  // Met de volledige set blijft het veilige maximum maatgevend (6.14b), maar
  // de quasi-blijvende zakking staat met haar eigen getal in de verantwoording.
  const inv = res.inputs[0];
  dicht("met alle combinaties: w = max = 9,988 mm (6.14b)", inv.deflection_actual_max_mm, -sTot, 1e-3);
  const noot = inv.deflection_notes.find((n) => n.startsWith("w is de grootste zakking"));
  ok("de verantwoording noemt 'BGT quasi-blijvend 6.16b' met −5,79 mm",
    /"BGT quasi-blijvend 6\.16b" \(6\.16b\) -5,79 mm/.test(noot ?? ""), (noot ?? "").slice(0, 400));

  // Alleen de quasi-blijvende combinaties in de lijst: dan is 6.16b met ψ₂·Q
  // maatgevend. Vóór de reparatie zag de toets hier 3,995 mm (alleen G).
  const alleenQp = (c) => c.type !== "sls" || /quasi-blijvend/.test(c.name);
  const invQp = staal(staalModel, { filter: alleenQp }).res.inputs[0];
  dicht("alleen quasi-blijvend: w = w(G + 0,3·Q) = 5,793 mm (was 3,995)", invQp.deflection_actual_max_mm, -sQp, 1e-3);
  dicht("alleen quasi-blijvend: w₁ = 3,995 mm", invQp.deflection_permanent_mm, -sPerm, 1e-3);
  if (heeftKern) {
    const r = kern("check_steel_beams", [invQp])[0];
    const fin = toets(r, "deflection_w_fin"), add = toets(r, "deflection_w_add");
    dicht("kern w_fin = 5,793 mm", fin.uc.ed, sQp, 2e-3);
    dicht("kern UC w_fin = 5,793 · 333 / 5000 = 0,3858", fin.uc.uc, 0.3858, 2e-4);
    dicht("kern w_add = 5,793 − 3,995 = 1,798 mm", add.uc.ed, sQp - sPerm, 2e-3);
    dicht("kern UC w_add = 1,798 / 15,0 = 0,1199", add.uc.uc, 0.1199, 2e-4);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De MCP-weg: check_fem_model rekent w₁ net zo");
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
        const bericht = JSON.parse(regel);
        antwoorden.set(bericht.id, bericht);
        if (antwoorden.size === aanroepen.length + 1) {
          clearTimeout(klok);
          k.stdin.end();
          klaar(aanroepen.map((_, n) => antwoorden.get(n + 2)));
        }
      }
    });
    const schrijf = (o) => k.stdin.write(JSON.stringify(o) + "\n");
    schrijf({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-blijvende-zakking", version: "1" } } });
    aanroepen.forEach((a, n) => schrijf({ jsonrpc: "2.0", id: n + 2, method: "tools/call", params: { name: a.name, arguments: a.arguments } }));
  });
}

if (!existsSync(MCP_SERVER)) {
  ok("MCP-server gevonden — bouw hem met `cargo build --release -p openaec-mcp-server` (na `npm run build:sidecar`)", false, MCP_SERVER);
} else {
  const zonderRuis = (m) => {
    const { selfWeightEnabled: _a, scheefstandEnabled: _b, scheefstandNoemer: _c, scheefstandRichting: _d, ...rest } = m;
    return rest;
  };
  const [h, s] = await mcp([
    { name: "check_fem_model", arguments: { model: zonderRuis(houtModel) } },
    { name: "check_fem_model", arguments: { model: zonderRuis(staalModel) } },
  ]);
  const inhoud = (a) => a?.result?.structuredContent;
  ok("MCP hout slaagt", !h?.error && !h?.result?.isError, JSON.stringify(h?.error ?? h?.result?.content).slice(0, 300));
  ok("MCP staal slaagt", !s?.error && !s?.result?.isError, JSON.stringify(s?.error ?? s?.result?.content).slice(0, 300));
  if (inhoud(h)) {
    const inv = inhoud(h).timber_check_inputs?.[0];
    const r = inhoud(h).timber_results?.[0];
    dicht("MCP hout: w₁ in de toetsinvoer", inv?.deflection_permanent_mm, -hPerm, 1e-3);
    if (r) dicht("MCP hout: UC w_add = 1,9270", toets(r, "deflection_w_add").uc.uc, 1.9270, 2e-4);
  }
  if (inhoud(s)) {
    const inv = inhoud(s).steel_check_inputs?.[0];
    const r = inhoud(s).results?.[0];
    dicht("MCP staal: w₁ in de toetsinvoer (de selectie liet de combinatie staan)", inv?.deflection_permanent_mm, -sPerm, 1e-3);
    if (r) dicht("MCP staal: UC w_add = 0,3995", toets(r, "deflection_w_add").uc.uc, 0.3995, 2e-4);
    ok("MCP staal: de quasi-blijvende 6.16b met ψ₂·Q is doorgerekend en gewogen (−5,79 mm)",
      (inv?.deflection_notes ?? []).some((n) => /"BGT quasi-blijvend 6\.16b" \(6\.16b\) -5,79 mm/.test(n)));
    ok("MCP staal: geen combinatie overgeslagen", (inhoud(s).combinations_skipped ?? []).length === 0,
      JSON.stringify(inhoud(s).combinations_skipped ?? null));
  }
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
