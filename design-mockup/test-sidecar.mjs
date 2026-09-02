// Sidecar — protocol en hoofdlus (NDJSON over stdio).
//
// WAAROM DEZE TEST BESTAAT
// De sidecar is de brug tussen de Rust-MCP-server en de ENIGE rekenkern. Als
// die brug een fout als een geldig antwoord doorgeeft, of een antwoord stil
// laat vallen, dan leest een ontbrekende runtime aan de clientkant hetzelfde
// als "je constructie is in orde". Deze test bewaakt daarom drie dingen:
//
//   1. het KANAAL  — één antwoordregel per verzoekregel, in volgorde,
//                    gepipelined (zoals Rust schrijft), exitcode altijd 0,
//                    stdout uitsluitend protocol;
//   2. de FOUTPADEN — kapotte JSON, verkeerde protocolversie, onbekende
//                    bewerking, onoplosbaar model: elk met zijn eigen code;
//   3. de GETALLEN  — het referentieportaal uit het implementatieplan §5.1,
//                    met analytische controles (½qL, qL²/8, superpositie).
//
// De verwachte getallen zijn NIET verzonnen: ze staan in het plan en zijn daar
// met analytische identiteiten gestaafd. Wijkt de sidecar ervan af, dan is dat
// een bevinding — geen reden om de verwachting bij te stellen.
//
// Draaien met: npx tsx test-sidecar.mjs   (of: node scripts/run-tests.mjs --filter=sidecar)

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TSX_CLI = join(HIER, "node_modules", "tsx", "dist", "cli.mjs");
const SIDECAR_TS = join(HIER, "src", "mcp", "sidecar.ts");
const BUNDEL = join(
  REPO,
  "src-tauri",
  "crates",
  "openaec-mcp-server",
  "assets",
  "fem-kernel.mjs",
);
const HOUTEN_RAAMWERK = join(REPO, "voorbeelden", "houten-raamwerk.ifcfem2d");

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${extra ? " — " + extra : ""}`);
  }
}

function dichtbij(naam, actueel, verwacht, tol) {
  const afwijking = Math.abs(actueel - verwacht);
  ok(
    naam,
    afwijking <= tol,
    `${actueel.toFixed(6)} (verwacht ${verwacht}, |Δ| = ${afwijking.toExponential(2)}, tol ${tol})`,
  );
}

// ── Sidecar aanroepen ──────────────────────────────────────────────────────

/**
 * Start één sidecar-proces, schrijft alle verzoeken GEPIPELINED (in één keer,
 * zoals de Rust-kant doet), sluit stdin en verzamelt de antwoorden.
 */
function roepAan(verzoeken, { bundel = false } = {}) {
  const commando = process.execPath;
  const argumenten = bundel
    ? [BUNDEL, "--sidecar"]
    : [TSX_CLI, SIDECAR_TS, "--sidecar"];

  return new Promise((klaar) => {
    const kind = spawn(commando, argumenten, { cwd: HIER });
    let uit = "";
    let fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("close", (code) => {
      const regels = uit.split("\n").filter((r) => r.trim().length > 0);
      const antwoorden = regels.map((r) => {
        try {
          return JSON.parse(r);
        } catch (err) {
          return { __onparsebaar: r, __fout: String(err) };
        }
      });
      klaar({ code, antwoorden, regels, stderr: fout });
    });
    kind.stdin.write(verzoeken.map((v) => JSON.stringify(v)).join("\n") + "\n");
    kind.stdin.end();
  });
}

const verzoek = (id, op, payload = {}) => ({ v: 1, id, op, payload });

// ── Referentiemodel — implementatieplan §5.1 ───────────────────────────────
// Portaal 6 × 4 m: kolommen HEA160, ligger IPE300, beide voeten ingeklemd.
// LC1 "G": q = −10 N/mm op de ligger; LC2 "Q": q = −6 N/mm.
// Combinatie: 1,2·G + 1,5·Q.
const PORTAAL = {
  nodes: [
    { id: 1, x: 0, z: 0 },
    { id: 2, x: 0, z: 4000 },
    { id: 3, x: 6000, z: 4000 },
    { id: 4, x: 6000, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" },
  ],
  supports: [
    { nodeId: 1, type: "fixed" },
    { nodeId: 4, type: "fixed" },
  ],
  plates: [],
  loadCases: [
    { id: 1, name: "G", type: "dead" },
    { id: 2, name: "Q", type: "live" },
  ],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -10 },
    { id: 2, type: "lineLoad", caseId: 2, beamId: 2, q: -6 },
  ],
  selfWeightEnabled: false,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

const COMBI_12G_15Q = [
  {
    id: 1,
    name: "1,2·G + 1,5·Q",
    type: "uls",
    formula: "1,2·G + 1,5·Q",
    factors: { 1: 1.2, 2: 1.5 },
  },
];

// De echte profieldatabase van de Rust-crate — geen nagemaakte doorsneden.
const PROFIELEN = JSON.parse(
  readFileSync(join(REPO, "src-tauri", "crates", "steel-profiles", "data", "profiles.json"), "utf8"),
);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Kanaal: pipelining, volgorde, exitcode en stdout-hygiëne");
{
  const r = await roepAan([
    verzoek(7, "handshake"),
    verzoek(8, "solve", { model: PORTAAL, combinations: COMBI_12G_15Q }),
  ]);
  ok("exitcode 0", r.code === 0, `code ${r.code}`);
  ok("twee antwoordregels", r.antwoorden.length === 2, `${r.antwoorden.length} regel(s)`);
  ok(
    "elke stdout-regel is geldige JSON",
    r.antwoorden.every((a) => a.__onparsebaar === undefined),
  );
  ok("volgorde blijft 7, 8", r.antwoorden[0]?.id === 7 && r.antwoorden[1]?.id === 8);
  ok("handshake geslaagd", r.antwoorden[0]?.ok === true);
  ok("solve geslaagd", r.antwoorden[1]?.ok === true, r.antwoorden[1]?.error?.melding ?? "");

  const h = r.antwoorden[0]?.result ?? {};
  ok("protocolversie 1", h.protocol === 1, String(h.protocol));
  ok("node_version gemeld", typeof h.node_version === "string" && h.node_version.startsWith("v"), h.node_version);
  ok("alle vijf bewerkingen gemeld", Array.isArray(h.ops) && h.ops.length === 5, JSON.stringify(h.ops));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Foutpaden — elk met zijn eigen code, proces blijft exitcode 0");
{
  const r = await roepAan([]);
  ok("leeg verzoek geeft geen antwoord én geen crash", r.code === 0 && r.antwoorden.length === 0);
}
{
  // Kapotte JSON kan niet als object worden meegegeven; rechtstreeks schrijven.
  const kind = spawn(process.execPath, [TSX_CLI, SIDECAR_TS, "--sidecar"], { cwd: HIER });
  let uit = "";
  kind.stdout.on("data", (d) => (uit += d));
  const code = await new Promise((klaar) => {
    kind.on("close", klaar);
    kind.stdin.write('{ "v": 1, "id": 3, "op": "solve"\n');
    kind.stdin.end();
  });
  const a = JSON.parse(uit.trim());
  ok("kapotte JSON: exitcode 0", code === 0, `code ${code}`);
  ok("kapotte JSON: ok=false", a.ok === false);
  ok("kapotte JSON: INVOER_ONGELDIG", a.error?.code === "INVOER_ONGELDIG", a.error?.code);
  ok("kapotte JSON: Nederlandse melding", /geldige JSON/.test(a.error?.melding ?? ""), a.error?.melding);
}
{
  const r = await roepAan([
    { v: 99, id: 1, op: "handshake", payload: {} },
    { v: 1, id: 2, op: "verzin_iets", payload: {} },
    { v: 1, op: "handshake", payload: {} },
  ]);
  ok("exitcode 0 na drie foutregels", r.code === 0);
  ok("drie antwoorden", r.antwoorden.length === 3, String(r.antwoorden.length));
  ok(
    "verkeerde protocolversie → PROTOCOL_MISMATCH",
    r.antwoorden[0]?.error?.code === "PROTOCOL_MISMATCH",
    r.antwoorden[0]?.error?.code,
  );
  ok(
    "onbekende bewerking → INVOER_ONGELDIG",
    r.antwoorden[1]?.error?.code === "INVOER_ONGELDIG",
    r.antwoorden[1]?.error?.melding,
  );
  ok(
    "ontbrekend id → INVOER_ONGELDIG met id 0",
    r.antwoorden[2]?.error?.code === "INVOER_ONGELDIG" && r.antwoorden[2]?.id === 0,
  );
}
{
  const zonderOpleggingen = { ...PORTAAL, supports: [] };
  const r = await roepAan([verzoek(1, "solve", { model: zonderOpleggingen })]);
  const a = r.antwoorden[0];
  ok("model zonder opleggingen: exitcode 0", r.code === 0);
  ok("model zonder opleggingen: MODEL_ONOPLOSBAAR", a?.error?.code === "MODEL_ONOPLOSBAAR", a?.error?.code);
  ok(
    "originele kernmelding blijft bewaard",
    typeof a?.error?.detail?.originele_melding === "string" &&
      a.error.detail.originele_melding.length > 0,
    a?.error?.detail?.originele_melding,
  );
}
{
  const metEigenDoorsnede = {
    ...PORTAAL,
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "HEA160", A: 1234 }],
  };
  const r = await roepAan([verzoek(1, "solve", { model: metEigenDoorsnede })]);
  const a = r.antwoorden[0];
  ok(
    "losse A op een staaf wordt geweigerd",
    a?.error?.code === "INVOER_ONGELDIG" && /doorsnede/.test(a.error.melding),
    a?.error?.melding,
  );
}
{
  const r = await roepAan([
    verzoek(1, "solve", {}),
    verzoek(2, "solve", { model: PORTAAL, project: { inhoud: "{}" } }),
  ]);
  ok(
    "geen model én geen project → INVOER_ONGELDIG",
    r.antwoorden[0]?.error?.code === "INVOER_ONGELDIG",
    r.antwoorden[0]?.error?.melding,
  );
  ok(
    "model én project tegelijk → INVOER_ONGELDIG",
    r.antwoorden[1]?.error?.code === "INVOER_ONGELDIG",
    r.antwoorden[1]?.error?.melding,
  );
}
{
  const r = await roepAan([verzoek(1, "load_project", { inhoud: "geen json" })]);
  ok(
    "onleesbaar projectbestand → BESTAND_ONLEESBAAR",
    r.antwoorden[0]?.error?.code === "BESTAND_ONLEESBAAR",
    r.antwoorden[0]?.error?.code,
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Referentieportaal §5.1 — getallen met analytische controle");

const solveAntwoord = await roepAan([
  verzoek(1, "solve", {
    model: PORTAAL,
    combinations: COMBI_12G_15Q,
    detail: "stations",
    profiles: PROFIELEN,
  }),
]);
ok("solve geslaagd", solveAntwoord.antwoorden[0]?.ok === true, solveAntwoord.antwoorden[0]?.error?.melding ?? "");
const R = solveAntwoord.antwoorden[0]?.result ?? {};

{
  ok("eenheden: kracht kN", R.units?.kracht === "kN", R.units?.kracht);
  ok("eenheden: moment kNm", R.units?.moment === "kNm", R.units?.moment);
  ok("beide gevallen opgelost", JSON.stringify(R.cases_solved) === "[1,2]", JSON.stringify(R.cases_solved));
  ok("geen leeg belastinggeval", (R.cases_skipped_empty ?? []).length === 0);
  ok("geen waarschuwingen over NaN", !(R.warnings ?? []).some((w) => /NaN/.test(w)));

  const lc1 = R.per_case?.["1"];
  const lc2 = R.per_case?.["2"];
  const combi = R.combinations?.["1"];

  dichtbij("LC1 R1.fz", lc1.reactions["1"].fz, 30.0, 1e-4);
  dichtbij("LC1 R4.fz", lc1.reactions["4"].fz, 30.0, 1e-4);
  dichtbij("LC1 ΣFz (= qL = 60 kN)", lc1.reactions["1"].fz + lc1.reactions["4"].fz, 60.0, 1e-4);
  dichtbij("LC2 ΣFz (= 6·6 = 36 kN)", lc2.reactions["1"].fz + lc2.reactions["4"].fz, 36.0, 1e-4);
  dichtbij(
    "Combi ΣFz (= (1,2·10 + 1,5·6)·6 = 126 kN)",
    combi.reactions["1"].fz + combi.reactions["4"].fz,
    126.0,
    1e-4,
  );

  const ligger1 = lc1.elements["2"];
  ok("LC1 ligger: 21 stations", ligger1.stations_mm.length === 21, String(ligger1.stations_mm.length));
  dichtbij("LC1 ligger M_start", ligger1.M_start, -11.2324, 5e-4);
  const maxM1 = Math.max(...ligger1.M_x.map(Math.abs));
  dichtbij("LC1 ligger max|M|", maxM1, 33.7676, 5e-4);
  dichtbij(
    "LC1 identiteit M_veld + |M_steun| = qL²/8 = 45 kNm",
    maxM1 + Math.abs(ligger1.M_start),
    45.0,
    1e-3,
  );

  const liggerC = combi.elements["2"];
  const maxMC = Math.max(...liggerC.M_x.map(Math.abs));
  dichtbij("Combi ligger max|M|", maxMC, 70.912, 1e-3);
  const maxM2 = Math.max(...lc2.elements["2"].M_x.map(Math.abs));
  dichtbij("Combi = 1,2·LC1 + 1,5·LC2 (superpositie)", maxMC, 1.2 * maxM1 + 1.5 * maxM2, 1e-9);
  dichtbij("Combi max zakking ligger", Math.min(...liggerC.w_x), -14.4485, 5e-4);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] steel_check_inputs — de invoer voor check_steel_beam");
{
  ok("drie staalstaven getoetst", R.steel_check_inputs?.length === 3, String(R.steel_check_inputs?.length));
  const ligger = (R.steel_check_inputs ?? []).find((i) => i.beam_id === 2);
  ok("ligger aanwezig", !!ligger);
  ok("profielnaam doorgegeven", ligger?.profile_name === "IPE300", ligger?.profile_name);
  dichtbij("ligger length_m", ligger?.length_m ?? 0, 6.0, 1e-9);
  ok(
    "z_a_mm = h/2 uit de profieldatabase (IPE 300, h = 300)",
    ligger?.z_a_mm === 150,
    String(ligger?.z_a_mm),
  );
  ok("q_equiv_n_per_mm gevuld", typeof ligger?.q_equiv_n_per_mm === "number");

  // Zonder profieldatabase blijft de toetsinvoer leeg — mét waarschuwing.
  const zonder = await roepAan([
    verzoek(1, "solve", { model: PORTAAL, combinations: COMBI_12G_15Q }),
  ]);
  const Z = zonder.antwoorden[0]?.result ?? {};
  ok("zonder `profiles`: geen toetsinvoer", (Z.steel_check_inputs ?? []).length === 0);
  ok(
    "zonder `profiles`: expliciete waarschuwing",
    (Z.warnings ?? []).some((w) => /profieldatabase/.test(w)),
    JSON.stringify(Z.warnings),
  );

  // beam_ids beperkt de toetsing, niet de berekening.
  const beperkt = await roepAan([
    verzoek(1, "check", {
      model: PORTAAL,
      combinations: COMBI_12G_15Q,
      profiles: PROFIELEN,
      beam_ids: [2],
    }),
  ]);
  const B = beperkt.antwoorden[0]?.result ?? {};
  ok("check: alleen staaf 2 getoetst", B.steel_check_inputs?.length === 1, String(B.steel_check_inputs?.length));
  ok("check: beide gevallen tóch opgelost", JSON.stringify(B.solve_summary?.cases_solved) === "[1,2]");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] load_project — alleen-lezen, inhoud komt van de aanroeper");
if (existsSync(HOUTEN_RAAMWERK)) {
  const inhoud = readFileSync(HOUTEN_RAAMWERK, "utf8");
  const r = await roepAan([
    verzoek(1, "load_project", { path: HOUTEN_RAAMWERK, inhoud }),
  ]);
  const P = r.antwoorden[0]?.result ?? {};
  ok("load_project geslaagd", r.antwoorden[0]?.ok === true, r.antwoorden[0]?.error?.melding ?? "");
  ok("format_version gemeld", typeof P.format_version === "number", String(P.format_version));
  const bestand = JSON.parse(inhoud);
  ok(
    "knopen geteld zoals in het bestand",
    P.counts?.nodes === bestand.nodes.length,
    `${P.counts?.nodes} van ${bestand.nodes.length}`,
  );
  ok(
    "staven geteld zoals in het bestand",
    P.counts?.beams === bestand.beams.length,
    `${P.counts?.beams} van ${bestand.beams.length}`,
  );
} else {
  log(`  (overgeslagen: ${HOUTEN_RAAMWERK} ontbreekt)`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Bundel — dezelfde lus, dezelfde getallen");
if (existsSync(BUNDEL)) {
  const bron = await roepAan([
    verzoek(1, "solve", { model: PORTAAL, combinations: COMBI_12G_15Q, detail: "stations" }),
  ]);
  const bundel = await roepAan(
    [verzoek(1, "solve", { model: PORTAAL, combinations: COMBI_12G_15Q, detail: "stations" })],
    { bundel: true },
  );
  ok("bundel: exitcode 0", bundel.code === 0, `code ${bundel.code} ${bundel.stderr.trim()}`.trim());
  ok("bundel: solve geslaagd", bundel.antwoorden[0]?.ok === true, bundel.antwoorden[0]?.error?.melding ?? "");

  // solve_ms en bundle_hash horen te verschillen; de getallen niet.
  const kaal = (a) =>
    JSON.stringify({
      cases_solved: a.cases_solved,
      cases_skipped_empty: a.cases_skipped_empty,
      per_case: a.per_case,
      combinations: a.combinations,
      envelope: a.envelope,
    });
  ok(
    "bron en bundel geven exact dezelfde getallen",
    kaal(bron.antwoorden[0]?.result ?? {}) === kaal(bundel.antwoorden[0]?.result ?? {}),
  );

  const h = (await roepAan([verzoek(1, "handshake")], { bundel: true })).antwoorden[0]?.result ?? {};
  ok(
    "bundel meldt zijn eigen sha256",
    typeof h.bundle_hash === "string" && h.bundle_hash.startsWith("sha256:"),
    String(h.bundle_hash),
  );
  const sha = readFileSync(BUNDEL.replace(/\.mjs$/, ".sha256"), "utf8").trim().split(/\s+/)[0];
  ok(
    "zelf-hash komt overeen met fem-kernel.sha256",
    h.bundle_hash === `sha256:${sha}`,
    `${h.bundle_hash} vs sha256:${sha}`,
  );
} else {
  log(`  (overgeslagen: ${BUNDEL} ontbreekt — bouw hem met npm run build:sidecar)`);
}

// ─────────────────────────────────────────────────────────────────────────
log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
