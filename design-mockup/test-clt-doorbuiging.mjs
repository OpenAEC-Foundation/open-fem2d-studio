// Doorbuiging §7.2 van kruislaaghout: met een OPGEGEVEN k_def, en een weigering
// met reden zonder.
//
// WAAROM k_def INVOER IS. Tabel 3.2 van EN 1995-1-1 (ook met NB:2013) geeft
// k_def voor gezaagd hout, gelijmd gelamineerd hout, LVL, multiplex, OSB,
// spaanplaat, vezelplaat en MDF, en heeft GEEN rij voor kruislaaghout; de
// nationale bijlage voegt er geen toe. Er is dus geen normwaarde om aan te
// nemen. De toets draait daarom alleen met `cltKdef` + `cltKdefBron` uit de
// toetsconfiguratie (productverklaring of ETA van de plaat).
//
// WAT HIER BEWEZEN WORDT
//   [1] De bouwer vult w_inst, w_qp en w₁ met dezelfde keten als massief hout,
//       en geeft k_def + bron alleen door als ze zijn opgegeven.
//   [2] De kern met k_def: w_fin = w_inst + k_def·w_qp, w_add = w_fin − w₁,
//       tegen de hand.
//   [3] De kern ZONDER k_def: w_fin en w_add staan als "niet van toepassing"
//       met de reden (tabel 3.2) — niet weggelaten, en zonder invloed op uc_max.
//   [4] k_def zonder bron, en een negatieve k_def: ook geweigerd met reden.
//   [5] k_def = 0 (geen kruip) mag: w_fin = w_inst.
//   [6] De veldpoort (`keurCheckConfig`) weigert onzin.
//   [7] De MCP-weg (`check_fem_model`) geeft dezelfde uitkomst.
//
// ── HANDBEREKENING ─────────────────────────────────────────────────────────
// Opbouw CLT 40/20/40/20/40, C24 (E₀,mean = 11 000 N/mm², EN 338), b = 1000 mm.
// Lengtelagen op 0–40, 60–100 en 120–160 mm; dwarslagen tellen met E = 0.
//   z₀ = 80 mm; I_ef = 3·1000·40³/12 + 2·1000·40·60² = 16·10⁶ + 288·10⁶
//        = 304·10⁶ mm⁴ ; (EI)_ef = 11 000·304·10⁶ = 3,344·10¹² N·mm² (3344 kNm²,
//        dezelfde waarde als de kerntest `vijflaags_volledige_toets`).
// Vrij opgelegd, L = 5000 mm; G = 1,0 kN/m, Q = 2,0 kN/m categorie A (ψ₂ = 0,3).
//   w(q) = 5·q·L⁴/(384·(EI)_ef) = q · 5·6,25·10¹⁴/(1,284096·10¹⁵) = q · 2,43362 mm
//   w_inst = w(3,0) = 7,30087 mm      (6.14b)
//   w_qp   = w(1,6) = 3,89380 mm      (6.16b: G + 0,3·Q)
//   w₁     = w(1,0) = 2,43362 mm      (6.16b zonder Q)
// k_def = 0,85 is een TESTGETAL — geen productwaarde en geen normwaarde; het is
// gekozen om ongelijk te zijn aan de tabel-3.2-waarden van massief hout, zodat
// een stille terugval op 0,60 hier zou opvallen.
//   w_fin = 7,30087 + 0,85·3,89380 = 10,61060 mm → UC = 10,61060/(5000/250) = 0,53053
//   w_add = 10,61060 − 2,43362     =  8,17698 mm → UC = 8,17698·333/5000   = 0,54459
//
// Draaien met: npx tsx test-clt-doorbuiging.mjs
//         of : node scripts/run-tests.mjs --filter=clt-doorbuiging

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
const { buildCltCheckInputs } = await import("./src/lib/cltCheckBuilder.ts");
const { keurCheckConfig } = await import("./src/mcp/valideerModel.ts");

let passed = 0, failed = 0;
const log = (s = "") => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function dicht(naam, gemeten, verwacht, tolAbs) {
  ok(naam, Number.isFinite(gemeten) && Math.abs(gemeten - verwacht) <= tolAbs,
    `${Number(gemeten).toFixed(5)} vs ${verwacht.toFixed(5)}`);
}

// ── Handwaarden ─────────────────────────────────────────────────────────────
const L = 5000, G = 1.0, Q = 2.0, KDEF = 0.85;
const EI = 11000 * (3 * 1000 * 40 ** 3 / 12 + 2 * 1000 * 40 * 60 ** 2);
const w = (q) => (5 * q * L ** 4) / (384 * EI);
const wInst = w(G + Q), wQp = w(G + 0.3 * Q), wPerm = w(G);
const wFin = wInst + KDEF * wQp, wAdd = wFin - wPerm;
dicht("hand (EI)_ef = 3,344·10¹² N·mm²", EI / 1e12, 3.344, 1e-9);
dicht("hand w_inst = 7,30087", wInst, 7.30087, 1e-4);
dicht("hand w_fin = 10,61060", wFin, 10.6106, 1e-4);
dicht("hand w_add = 8,17698", wAdd, 8.17698, 1e-4);

const BRON = "testwaarde, geen productverklaring";

function model(checkConfig) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40/20/40", ...(checkConfig ? { checkConfig } : {}) }],
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

function bouw(m) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  const combinations = selecteerCombinaties(defaultCombinations(m.loadCases), m.beams, m.plates, { loadCases: m.loadCases }).actief;
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  return buildCltCheckInputs({
    nodes: m.nodes, beams: m.beams, supports: m.supports, combinations, combinationResults,
    loadCases: m.loadCases, gevallenMetLast: [...perCase.keys()],
  });
}

function kern(inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht: "check_clt_beams", inputs }), encoding: "utf8", maxBuffer: 256 << 20,
  });
  if (r.status !== 0 || !r.stdout) throw new Error(`toetsbrug faalde: ${(r.stderr ?? "").slice(0, 300)}`);
  const uit = JSON.parse(r.stdout);
  if (uit.fout) throw new Error(uit.fout);
  return uit;
}
const toets = (res, id) => res.checks.find((c) => c.id === id)?.kind?.data;
const heeftKern = existsSync(TOETSBRUG);
if (!heeftKern) ok("toetsbrug gevonden — bouw hem met `cargo build --release -p toetsbrug`", false, TOETSBRUG);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De bouwer");
// ─────────────────────────────────────────────────────────────────────────
const metKdef = bouw(model({ cltKdef: KDEF, cltKdefBron: BRON })).inputs[0];
const zonderKdef = bouw(model()).inputs[0];
ok("met k_def: invoer gebouwd", metKdef !== undefined);
ok("zonder k_def: invoer gebouwd (de staaf wordt niet overgeslagen)", zonderKdef !== undefined);
if (metKdef) {
  dicht("w_inst = −7,30087", metKdef.deflection_inst_mm, -wInst, 5e-4);
  dicht("w_qp = −3,89380", metKdef.deflection_quasi_perm_mm, -wQp, 5e-4);
  dicht("w₁ = −2,43362", metKdef.deflection_permanent_mm, -wPerm, 5e-4);
  ok("k_def en bron gaan door", metKdef.k_def === KDEF && metKdef.k_def_bron === BRON);
  ok("NB-noemers 250 / 333", metKdef.deflection_limit_fin === 250 && metKdef.deflection_limit_add === 333);
  ok("notities noemen w_qp en w₁", metKdef.deflection_notes.some((n) => /quasi-blijvende/.test(n)) &&
    metKdef.deflection_notes.some((n) => n.startsWith("w₁ =")));
}
if (zonderKdef) {
  ok("zonder k_def: geen k_def-veld in de invoer (geen aangenomen getal)",
    !("k_def" in zonderKdef) && !("k_def_bron" in zonderKdef));
}

if (heeftKern && metKdef && zonderKdef) {
  // ─────────────────────────────────────────────────────────────────────────
  log("\n[2] De kern MET k_def");
  // ─────────────────────────────────────────────────────────────────────────
  const r = kern([metKdef])[0];
  const fin = toets(r, "deflection_w_fin"), add = toets(r, "deflection_w_add");
  ok("w_fin en w_add aanwezig", fin !== undefined && add !== undefined);
  if (fin && add) {
    dicht("w_fin = w_inst + 0,85·w_qp = 10,61060 mm", fin.uc.ed, wFin, 2e-3);
    dicht("UC w_fin = 0,53053", fin.uc.uc, 0.53053, 2e-4);
    dicht("w_add = w_fin − w₁ = 8,17698 mm", add.uc.ed, wAdd, 2e-3);
    dicht("UC w_add = 0,54459", add.uc.uc, 0.54459, 2e-4);
    ok("k_def-variabele is de opgegeven 0,85 (geen terugval op 0,60)",
      fin.variables.find((v) => v.symbol === "k_{def}")?.value === KDEF);
    ok("de bron staat in de notitie bij w_fin", fin.notes.some((n) => n.includes(BRON) && /tabel 3\.2/.test(n)));
    ok("status Ok", fin.status === "Ok" && add.status === "Ok");
  }
  ok("staafnotitie: doorbuiging getoetst met opgegeven k_def",
    r.notes.some((n) => /Doorbuiging §7\.2 is getoetst met de OPGEGEVEN k_def/.test(n)));

  // ─────────────────────────────────────────────────────────────────────────
  log("\n[3] De kern ZONDER k_def: weigering met reden");
  // ─────────────────────────────────────────────────────────────────────────
  const z = kern([zonderKdef])[0];
  const zf = toets(z, "deflection_w_fin"), za = toets(z, "deflection_w_add");
  ok("w_fin en w_add staan er, niet weggelaten", zf !== undefined && za !== undefined);
  ok("beide 'niet van toepassing'", zf?.status === "NotApplicable" && za?.status === "NotApplicable");
  ok("zonder unity check", zf?.uc === null && za?.uc === null);
  ok("reden noemt tabel 3.2 en kruislaaghout",
    (zf?.notes ?? []).some((n) => /Niet getoetst: k_def is niet opgegeven/.test(n) && /tabel 3\.2/i.test(n) && /kruislaaghout/.test(n)));
  ok("staafnotitie meldt dat de doorbuiging niet is getoetst",
    z.notes.some((n) => /Doorbuiging §7\.2 is niet getoetst/.test(n)));
  // uc_max van de lamellen verandert niet door de weigering.
  const zonderDoorbuiging = z.checks.filter((c) => !c.id.startsWith("deflection_"))
    .map((c) => c.kind.data.uc?.uc ?? 0);
  dicht("uc_max = de grootste lameltoets (de weigering telt niet mee)", z.uc_max, Math.max(...zonderDoorbuiging), 1e-12);
  ok("met k_def is uc_max de doorbuiging (0,54459) of hoger", r.uc_max >= 0.54459 - 2e-4, String(r.uc_max));

  // ─────────────────────────────────────────────────────────────────────────
  log("\n[4] k_def zonder bron, en een negatieve k_def");
  // ─────────────────────────────────────────────────────────────────────────
  const geenBron = kern([{ ...metKdef, k_def_bron: "   " }])[0];
  ok("zonder bron: niet van toepassing, reden noemt de bron",
    toets(geenBron, "deflection_w_fin")?.status === "NotApplicable" &&
    toets(geenBron, "deflection_w_fin").notes.some((n) => /bron ervan niet/.test(n)));
  const negatief = kern([{ ...metKdef, k_def: -0.2 }])[0];
  ok("negatieve k_def: niet van toepassing met reden",
    toets(negatief, "deflection_w_fin")?.status === "NotApplicable" &&
    toets(negatief, "deflection_w_fin").notes.some((n) => /geen bruikbare vervormingsfactor/.test(n)));

  // ─────────────────────────────────────────────────────────────────────────
  log("\n[5] k_def = 0 (geen kruip) mag");
  // ─────────────────────────────────────────────────────────────────────────
  const nul = kern([{ ...metKdef, k_def: 0 }])[0];
  dicht("w_fin = w_inst", toets(nul, "deflection_w_fin")?.uc?.ed, wInst, 2e-3);
  dicht("w_add = w_inst − w₁", toets(nul, "deflection_w_add")?.uc?.ed, wInst - wPerm, 2e-3);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] De veldpoort");
// ─────────────────────────────────────────────────────────────────────────
{
  const fouten = (cc) => keurCheckConfig(cc, "check_config.1");
  ok("k_def + bron: geen fouten", fouten({ cltKdef: 0.85, cltKdefBron: BRON }).length === 0);
  ok("k_def = 0 + bron: geen fouten", fouten({ cltKdef: 0, cltKdefBron: BRON }).length === 0);
  ok("negatieve k_def geweigerd", fouten({ cltKdef: -1, cltKdefBron: BRON }).some((f) => /cltKdef: mag niet negatief/.test(f)));
  ok("k_def als tekst geweigerd", fouten({ cltKdef: "0,85", cltKdefBron: BRON }).some((f) => /cltKdef: moet een getal/.test(f)));
  ok("k_def zonder bron geweigerd", fouten({ cltKdef: 0.85 }).some((f) => /cltKdefBron: verplicht/.test(f)));
  ok("lege bron geweigerd", fouten({ cltKdef: 0.85, cltKdefBron: " " }).some((f) => /cltKdefBron: verplicht/.test(f)));
  ok("bron als getal geweigerd", fouten({ cltKdefBron: 12 }).some((f) => /cltKdefBron: moet een tekst/.test(f)));
  ok("alleen een bron (nog geen k_def) is geen fout", fouten({ cltKdefBron: BRON }).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De MCP-weg");
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
    schrijf({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-clt-doorbuiging", version: "1" } } });
    aanroepen.forEach((a, n) => schrijf({ jsonrpc: "2.0", id: n + 2, method: "tools/call", params: { name: a.name, arguments: a.arguments } }));
  });
}

if (!existsSync(MCP_SERVER)) {
  ok("MCP-server gevonden — bouw hem met `cargo build --release -p openaec-mcp-server` (na `npm run build:sidecar`)", false, MCP_SERVER);
} else {
  const kaal = (m) => {
    const { selfWeightEnabled: _a, scheefstandEnabled: _b, scheefstandNoemer: _c, scheefstandRichting: _d, ...rest } = m;
    return rest;
  };
  const [met, zonder] = await mcp([
    { name: "check_fem_model", arguments: { model: kaal(model({ cltKdef: KDEF, cltKdefBron: BRON })) } },
    { name: "check_fem_model", arguments: { model: kaal(model()) } },
  ]);
  const inhoud = (a) => a?.result?.structuredContent;
  ok("MCP met k_def slaagt", !met?.error && !met?.result?.isError, JSON.stringify(met?.error ?? met?.result?.content).slice(0, 300));
  ok("MCP zonder k_def slaagt", !zonder?.error && !zonder?.result?.isError, JSON.stringify(zonder?.error ?? zonder?.result?.content).slice(0, 300));
  const rm = inhoud(met)?.clt_results?.[0];
  const rz = inhoud(zonder)?.clt_results?.[0];
  if (rm) {
    dicht("MCP met k_def: UC w_fin = 0,53053", toets(rm, "deflection_w_fin")?.uc?.uc, 0.53053, 2e-4);
    dicht("MCP met k_def: UC w_add = 0,54459", toets(rm, "deflection_w_add")?.uc?.uc, 0.54459, 2e-4);
  } else ok("MCP met k_def: CLT-resultaat aanwezig", false, JSON.stringify(inhoud(met)?.skipped_beams ?? []).slice(0, 200));
  if (rz) {
    ok("MCP zonder k_def: w_fin niet van toepassing met reden",
      toets(rz, "deflection_w_fin")?.status === "NotApplicable" &&
      toets(rz, "deflection_w_fin").notes.some((n) => /tabel 3\.2/i.test(n)));
  } else ok("MCP zonder k_def: CLT-resultaat aanwezig", false);
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
