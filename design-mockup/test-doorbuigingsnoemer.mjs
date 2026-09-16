// Issue #9 — een doorbuigingsnoemer van 0 of kleiner is een invoerfout.
//
// WAT HIER MISGING
// Staal: klasse "custom" met noemer 0 gaf in de kern een oneindige grens, UC 0
// en status Ok op w_fin. Hout en kruislaaghout: de bouwer maakte van een
// opgegeven 0 of negatief getal stil 333, en de houtkern zelf gaf bij n <= 0
// ook een oneindige grens met status Ok.
//
// DE REGEL (voor w_fin én w_add, staal, hout en CLT): een OPGEGEVEN noemer moet
// groter dan nul zijn; anders weigert de kern de staaf met reden (status
// NotApplicable, geen toetsen, "ERROR: …" in governing_check_id). Alleen een
// ONTBREKENDE noemer krijgt een standaardwaarde; bij de staalkern betekent
// w_add-noemer 0 bovendien "afleiden uit de klasse".
//
// WAT DEZE TEST DOET
//  [1] de bouwers geven een opgegeven 0 of negatief getal ongewijzigd door;
//  [2] de MCP-modelkeuring (`keurCheckConfig`) weigert 0 en negatief;
//  [3] de toetsbrug (echte Rust-kern) weigert de gebouwde staal-, hout- en
//      CLT-invoer met reden, en rekent een geldige noemer gewoon;
//  [4] de MCP-server weigert via `check_fem_model` met de veldnaam erbij.
// De Rust-kant langs alle drie de wegen, veld voor veld gelijk, staat in
// `openaec-mcp-server/tests/drie_wegen_doorbuigingsnoemer.rs`.
//
// Draaien met: npx tsx test-doorbuigingsnoemer.mjs
//         of : node scripts/run-tests.mjs --filter=doorbuigingsnoemer

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const win = process.platform === "win32";
const TOETSBRUG = join(REPO, "src-tauri", "target", "release", win ? "toetsbrug.exe" : "toetsbrug");
const MCP_SERVER = join(REPO, "src-tauri", "target", "release", win ? "openaec-mcp-server.exe" : "openaec-mcp-server");

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { buildSteelCheckInputs } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs, timberDeflectionNumerators } = await import("./src/lib/timberCheckBuilder.ts");
const { keurCheckConfig } = await import("./src/mcp/valideerModel.ts");

let passed = 0, failed = 0;
const log = (s = "") => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}

// ── Fixture: twee losse liggers van 6 m, staal HEA160 en hout 96x450 ────────
const L = 6000;
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 }];
const solverBeams = [
  { id: 1, from: 1, to: 2, E: 210000, A: 3877, I: 1.673e7 },
  { id: 2, from: 2, to: 3, E: 11000, A: 43200, I: 7.29e8 },
];
const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 3, type: "zRoller" }];
const loads = [{ beamId: 1, q: -2 }, { beamId: 2, q: -2 }];
const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads })],
  [2, solve({ nodes, beams: solverBeams, supports, loads })],
]);
const combinations = defaultCombinations();
const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
const profileDb = new Map([["HEA160", { geometry: { h: 152 } }]]);

const staalInvoer = (checkConfig) =>
  buildSteelCheckInputs({
    nodes, combinations, combinationResults, profileDb,
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "HEA160", checkConfig }],
  }).inputs[0];
const houtInvoer = (checkConfig) =>
  buildTimberCheckInputs({
    nodes, combinations, combinationResults,
    beams: [{ id: 2, from: 2, to: 3, material: "C24", profile: "96x450", checkConfig }],
  }).inputs[0];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De bouwers geven een opgegeven noemer ongewijzigd door");
// ─────────────────────────────────────────────────────────────────────────
for (const n of [0, -300]) {
  const s = staalInvoer({ deflectionClass: "custom", deflectionLimitNumerator: n });
  ok(`staal custom ${n} → deflection_limit_numerator ${n} (geen 333)`, s?.deflection_limit_numerator === n,
    String(s?.deflection_limit_numerator));
  const h = houtInvoer({ deflectionClass: "custom", deflectionLimitNumerator: n });
  ok(`hout custom ${n} → fin ${n} en add ${n} (geen 333)`,
    h?.deflection_limit_fin === n && h?.deflection_limit_add === n,
    `${h?.deflection_limit_fin} / ${h?.deflection_limit_add}`);
  const d = timberDeflectionNumerators("custom", n);
  ok(`timberDeflectionNumerators("custom", ${n}) → ${n} (ook de CLT-bouwer)`, d.fin === n && d.add === n);
}
ok("staal custom zonder noemer → 333", staalInvoer({ deflectionClass: "custom" })?.deflection_limit_numerator === 333);
ok("hout custom zonder noemer → 333", timberDeflectionNumerators("custom", undefined).fin === 333);
ok("staal w_add-noemer -150 → -150 (niet stil 0)",
  staalInvoer({ deflectionAddLimitNumerator: -150 })?.deflection_add_limit_numerator === -150);

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De MCP-modelkeuring");
// ─────────────────────────────────────────────────────────────────────────
{
  const fouten = (cc) => keurCheckConfig(cc, "check_config.1");
  for (const n of [0, -300]) {
    ok(`deflectionLimitNumerator ${n} geweigerd`,
      fouten({ deflectionClass: "custom", deflectionLimitNumerator: n })
        .some((f) => /deflectionLimitNumerator: moet groter dan nul/.test(f)));
    ok(`deflectionAddLimitNumerator ${n} geweigerd`,
      fouten({ deflectionAddLimitNumerator: n }).some((f) => /deflectionAddLimitNumerator: moet groter dan nul/.test(f)));
  }
  ok("deflectionLimitNumerator 400 geen fout", fouten({ deflectionClass: "custom", deflectionLimitNumerator: 400 }).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] De echte kern via de toetsbrug");
// ─────────────────────────────────────────────────────────────────────────
function kern(opdracht, inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs }), encoding: "utf8", maxBuffer: 256 << 20,
  });
  if (r.status !== 0 || !r.stdout) throw new Error(`toetsbrug faalde: ${(r.stdout || r.stderr || "").slice(0, 300)}`);
  const uit = JSON.parse(r.stdout);
  if (uit.fout) throw new Error(uit.fout);
  return uit;
}
const geweigerd = (r, trefwoord) =>
  r?.status === "NotApplicable" && Array.isArray(r.checks) && r.checks.length === 0 &&
  typeof r.governing_check_id === "string" && r.governing_check_id.startsWith("ERROR: ") &&
  r.governing_check_id.includes(trefwoord) && r.governing_check_id.includes("niet getoetst");

if (!existsSync(TOETSBRUG)) {
  ok("toetsbrug gevonden — bouw hem met `cargo build --release -p toetsbrug`", false, TOETSBRUG);
} else {
  // Eén aanroep met alle staven: een foute staaf mag de rest niet meenemen.
  const staal = kern("check_steel_beams", [
    staalInvoer({ deflectionClass: "custom", deflectionLimitNumerator: 0 }),
    staalInvoer({ deflectionClass: "custom", deflectionLimitNumerator: -300 }),
    staalInvoer({ deflectionAddLimitNumerator: -150 }),
    staalInvoer({ deflectionClass: "custom", deflectionLimitNumerator: 250 }),
  ]);
  ok("staal custom 0: geweigerd met reden", geweigerd(staal[0], "'Custom'"), staal[0]?.governing_check_id);
  ok("staal custom -300: geweigerd met reden", geweigerd(staal[1], "'Custom'"), staal[1]?.governing_check_id);
  ok("staal w_add -150: geweigerd met reden", geweigerd(staal[2], "w_add"), staal[2]?.governing_check_id);
  const fin = staal[3]?.checks?.find((c) => c.id === "deflection_w_fin")?.kind?.data;
  // Hand: grens L/250 = 6000/250 = 24 mm.
  ok("staal custom 250: getoetst met grens 24 mm", staal[3]?.status !== "NotApplicable" &&
    fin && fin.status !== "NotApplicable" && Math.abs(fin.uc.rd - 24) < 1e-9, String(fin?.uc?.rd));

  const hout = kern("check_timber_beams", [
    houtInvoer({ deflectionClass: "custom", deflectionLimitNumerator: 0 }),
    houtInvoer({ deflectionClass: "custom", deflectionLimitNumerator: -250 }),
    houtInvoer({ deflectionClass: "custom", deflectionLimitNumerator: 300 }),
  ]);
  ok("hout custom 0: geweigerd met reden", geweigerd(hout[0], "w_fin"), hout[0]?.governing_check_id);
  ok("hout custom -250: geweigerd met reden", geweigerd(hout[1], "w_fin"), hout[1]?.governing_check_id);
  const hfin = hout[2]?.checks?.find((c) => c.id === "deflection_w_fin")?.kind?.data;
  // Hand: grens L/300 = 6000/300 = 20 mm.
  ok("hout custom 300: getoetst met grens 20 mm", hfin && Math.abs(hfin.uc.rd - 20) < 1e-9, String(hfin?.uc?.rd));

  // CLT: de bouwer deelt `timberDeflectionNumerators` (zie [1]); hier de kern.
  const laag = (t, o) => ({ thickness_mm: t, orientation: o, strength_class: "C24" });
  const clt = (n) => ({
    beam_id: 7,
    layup: { width_mm: 1000, layers: [laag(40, "Longitudinal"), laag(20, "Transverse"), laag(40, "Longitudinal")] },
    service_class: "Sc1", load_duration: "MediumTerm", length_m: 5,
    forces_envelope: [{ combination_id: 1, position_mm: 2500, forces: { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: 5, mz_ed: 0 } }],
    k_def: 0.8, k_def_bron: "testwaarde",
    deflection_inst_mm: -5, deflection_quasi_perm_mm: -3, deflection_permanent_mm: -3,
    deflection_limit_fin: n, deflection_limit_add: n,
  });
  const c = kern("check_clt_beams", [clt(0), clt(-250)]);
  ok("CLT noemer 0: geweigerd met reden", geweigerd(c[0], "w_fin"), c[0]?.governing_check_id);
  ok("CLT noemer -250: geweigerd met reden", geweigerd(c[1], "w_fin"), c[1]?.governing_check_id);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De MCP-weg: check_fem_model");
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
    schrijf({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-doorbuigingsnoemer", version: "1" } } });
    aanroepen.forEach((a, n) => schrijf({ jsonrpc: "2.0", id: n + 2, method: "tools/call", params: { name: a.name, arguments: a.arguments } }));
  });
}

if (!existsSync(MCP_SERVER)) {
  ok("MCP-server gevonden — bouw hem met `cargo build --release -p openaec-mcp-server` (na `npm run build:sidecar`)", false, MCP_SERVER);
} else {
  const model = (material, profile, checkConfig) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material, profile, checkConfig }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loadCases: [{ id: 1, name: "G", type: "dead" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -2 }],
  });
  const gevallen = [
    ["staal custom 0", model("S235", "HEA160", { deflectionClass: "custom", deflectionLimitNumerator: 0 }), "deflectionLimitNumerator"],
    ["staal custom -300", model("S235", "HEA160", { deflectionClass: "custom", deflectionLimitNumerator: -300 }), "deflectionLimitNumerator"],
    ["staal w_add -150", model("S235", "HEA160", { deflectionAddLimitNumerator: -150 }), "deflectionAddLimitNumerator"],
    ["hout custom 0", model("C24", "96x450", { deflectionClass: "custom", deflectionLimitNumerator: 0 }), "deflectionLimitNumerator"],
  ];
  const antwoorden = await mcp(gevallen.map(([, m]) => ({ name: "check_fem_model", arguments: { model: m } })));
  gevallen.forEach(([naam, , veld], i) => {
    const a = antwoorden[i];
    const tekst = JSON.stringify(a?.error ?? a?.result ?? {});
    const fout = Boolean(a?.error) || a?.result?.isError === true;
    ok(`MCP ${naam}: geweigerd met de veldnaam in de reden`,
      fout && tekst.includes(veld) && tekst.includes("groter dan nul"), tekst.slice(0, 200));
    ok(`MCP ${naam}: geen toetsresultaat met status Ok`, !/"status":"Ok"/.test(tekst));
  });
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
