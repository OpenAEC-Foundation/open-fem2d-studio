// ═══════════════════════════════════════════════════════════════════════════
// De wapeningsworkflow, end-to-end door de ÉCHTE desktop-app — via de
// MCP-server, met screenshots.
// ═══════════════════════════════════════════════════════════════════════════
//
// WAT DIT TOETST
// Niet de rekenkern — die heeft zijn eigen referenties. Dit toetst de KETEN
// zoals een gebruiker hem loopt: app starten → betonstaaf kiezen → korf
// invoeren → analysetype → rekenen → toetsen → dekkingslijn → rapport. Elke
// stap gaat door de geïnstalleerde (of gebouwde) app heen, aangestuurd over
// haar bedieningskanaal, en elke stap wordt vastgelegd als PNG.
//
// De aansturing loopt met opzet via de MCP-SERVER over stdio en niet
// rechtstreeks over HTTP: zo wordt de MCP-laag (gui_tools.rs) zelf ook
// beproefd, tot en met de schema's.
//
// WAT "GESLAAGD" HIER BETEKENT
// * Elke stap komt terug zonder fout, met de toestand die hij belooft.
// * De toetsing levert voor de betonstaaf uitkomsten op, en twee keer toetsen
//   geeft hetzelfde (determinisme door de hele keten).
// * De dekkingslijn komt uit de kern met punten aan onder- en bovenzijde.
// * Elke screenshot is een echte afbeelding: juiste afmetingen, niet zwart,
//   niet leeg-wit, en de stappen verschillen van elkaar.
// * Na `gui_quit` is het vindbestand weg: de app ruimde zichzelf op.
//
// Draaien:  node referentie-gui/wapening-workflow.mjs   (vanuit design-mockup/)
// Vereist:  een gebouwde app (OPENAEC_APP of target/release) en
//           cargo build --release -p openaec-mcp-server
// Uitvoer:  docs/verificatie/gui/NN-*.png  +  een regel per stap hier.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..");
const APP = process.env.OPENAEC_APP
  ?? join(REPO, "src-tauri", "target", "release", "open-fem2d-studio.exe");
const MCP = join(REPO, "src-tauri", "target", "release", "openaec-mcp-server.exe");
const UIT = join(REPO, "docs", "verificatie", "gui");
const VINDBESTAND = process.env.OPENAEC_GUI_CONTROL_FILE
  ?? join(process.env.LOCALAPPDATA ?? "", "org.openaec.fem2d-studio", "gui-control.json");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
}
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Vooraf ──────────────────────────────────────────────────────────────────
for (const [wat, pad] of [["app", APP], ["MCP-server", MCP]]) {
  if (!existsSync(pad)) {
    log(`ONTBREEKT: ${wat} op ${pad}`);
    log(wat === "app"
      ? "  bouw met: npm run tauri build   (of zet OPENAEC_APP naar de geïnstalleerde exe)"
      : "  bouw met: cargo build --release -p openaec-mcp-server   (in src-tauri)");
    process.exit(2);
  }
}
mkdirSync(UIT, { recursive: true });

// ── De MCP-server over stdio ────────────────────────────────────────────────
class Mcp {
  constructor() {
    this.kind = spawn(MCP, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.wachtenden = new Map();
    this.id = 0;
    this.kind.stdout.on("data", (d) => {
      this.buffer += d.toString();
      let i;
      while ((i = this.buffer.indexOf("\n")) >= 0) {
        const regel = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!regel) continue;
        let msg; try { msg = JSON.parse(regel); } catch { continue; }
        const w = this.wachtenden.get(msg.id);
        if (w) { this.wachtenden.delete(msg.id); w(msg); }
      }
    });
    this.kind.stderr.on("data", () => {});
  }
  verzoek(method, params) {
    const id = ++this.id;
    this.kind.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((los, weiger) => {
      const t = setTimeout(() => { this.wachtenden.delete(id); weiger(new Error(`${method}: geen antwoord binnen 360 s`)); }, 360_000);
      this.wachtenden.set(id, (msg) => { clearTimeout(t); los(msg); });
    });
  }
  async init() {
    const r = await this.verzoek("initialize", {
      protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "wapening-workflow", version: "0.0.0" },
    });
    if (r.error) throw new Error(`initialize: ${JSON.stringify(r.error)}`);
  }
  /** Roep een tool; een toolfout wordt een Error met de tekst van de app. */
  async tool(name, args = {}) {
    const r = await this.verzoek("tools/call", { name, arguments: args });
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
    if (r.result?.isError) throw new Error(`${name}: ${r.result.content?.[0]?.text ?? "toolfout"}`);
    return r.result?.structuredContent ?? null;
  }
  async lijst() {
    const r = await this.verzoek("tools/list", {});
    return (r.result?.tools ?? []).map((t) => t.name);
  }
  stop() { try { this.kind.stdin.end(); this.kind.kill(); } catch {} }
}

// ── PNG lezen: afmetingen en helderheid, zonder extra pakket ────────────────
function leesPng(pad) {
  const b = readFileSync(pad);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${pad}: geen PNG`);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const kleur = b[25];               // 6 = RGBA, 2 = RGB
  const bpp = kleur === 6 ? 4 : 3;
  let p = 8; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8);
    if (type === "IDAT") idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rij = w * bpp;
  const uit = Buffer.alloc(h * rij);
  let som = 0, som2 = 0, n = 0, donker = 0, licht = 0;
  const stap = Math.max(1, Math.floor(w / 200));
  for (let y = 0; y < h; y++) {
    const f = raw[y * (rij + 1)];
    const bron = y * (rij + 1) + 1, doel = y * rij, vorig = (y - 1) * rij;
    for (let x = 0; x < rij; x++) {
      const a = x >= bpp ? uit[doel + x - bpp] : 0;
      const up = y > 0 ? uit[vorig + x] : 0;
      const c = (y > 0 && x >= bpp) ? uit[vorig + x - bpp] : 0;
      let v = raw[bron + x];
      switch (f) {
        case 1: v += a; break;
        case 2: v += up; break;
        case 3: v += (a + up) >> 1; break;
        case 4: { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); break; }
      }
      uit[doel + x] = v & 255;
    }
    if (y % stap === 0) for (let x = 0; x < w; x += stap) {
      const i = doel + x * bpp; const l = (uit[i] + uit[i + 1] + uit[i + 2]) / 3;
      som += l; som2 += l * l; n++; if (l < 10) donker++; if (l > 245) licht++;
    }
  }
  const gem = som / n, sd = Math.sqrt(Math.max(0, som2 / n - gem * gem));
  return { w, h, gem, sd, donkerPct: 100 * donker / n, lichtPct: 100 * licht / n, bytes: b.length };
}

function toetsScreenshot(naam, pad) {
  const s = leesPng(pad);
  const ok = s.w >= 800 && s.h >= 500 && s.donkerPct < 90 && s.lichtPct < 99 && s.sd > 8;
  eis(`screenshot ${naam} is een echte afbeelding`, ok,
    `${s.w}×${s.h}, gem ${s.gem.toFixed(0)}, sd ${s.sd.toFixed(1)}, ${s.donkerPct.toFixed(0)}% donker, ${s.lichtPct.toFixed(0)}% wit, ${(s.bytes / 1024).toFixed(0)} kB`);
  return s;
}

// ── De app starten en vinden ────────────────────────────────────────────────
log("═══════════════════════════════════════════════════════════════════════");
log("Wapeningsworkflow door de desktop-app, via de MCP-server");
log(`  app: ${APP}`);
log("═══════════════════════════════════════════════════════════════════════");

const app = spawn(APP, [], {
  env: { ...process.env, OPENAEC_GUI_CONTROL: "1" },
  stdio: "ignore", detached: false,
});
let vind = null;
for (let i = 0; i < 120 && !vind; i++) {
  await slaap(250);
  try {
    const j = JSON.parse(readFileSync(VINDBESTAND, "utf8"));
    if (j.pid === app.pid) vind = j;
  } catch {}
}
eis("de app schrijft gui-control.json met haar eigen pid", vind !== null,
  vind ? `poort ${vind.poort}, versie ${vind.versie}` : `niet gevonden op ${VINDBESTAND}`);
if (!vind) { app.kill(); process.exit(1); }

const mcp = new Mcp();
await mcp.init();
const tools = await mcp.lijst();
eis("tools/list bevat de gui_*-tools", tools.filter((t) => t.startsWith("gui_")).length === 14,
  tools.filter((t) => t.startsWith("gui_")).join(", "));

// De pagina moet geladen zijn: status tot er staven zijn.
let status = null;
for (let i = 0; i < 60 && !(status?.pagina?.aantalStaven > 0); i++) {
  await slaap(500);
  try { status = await mcp.tool("gui_status"); } catch { status = null; }
}
eis("de pagina antwoordt en het startmodel staat er", status?.pagina?.aantalStaven > 0,
  status ? `${status.pagina.aantalKnopen} knopen, ${status.pagina.aantalStaven} staven, versie ${status.versie}` : "geen status");

const shots = {};
async function shot(nr, naam, window = "main") {
  const pad = join(UIT, `${String(nr).padStart(2, "0")}-${naam}.png`);
  await mcp.tool("gui_screenshot", { window, path: pad });
  shots[naam] = toetsScreenshot(naam, pad);
  return pad;
}

try {
  // ── 1. Start ──────────────────────────────────────────────────────────────
  log("\n① Startmodel");
  await slaap(800);
  await shot(1, "start");

  const beton = status.pagina.staven.find((s) => /^C\d{2}\/\d{2}$/.test(s.material ?? ""));
  eis("het startmodel heeft een betonstaaf", !!beton,
    beton ? `staaf ${beton.id} (${beton.material}), korf: ${beton.heeftKorf ? "ja" : "nee"}` : "geen");
  if (!beton) throw new Error("zonder betonstaaf is er geen wapeningsworkflow");
  const ID = beton.id;

  // ── 2. Selecteren ─────────────────────────────────────────────────────────
  log("\n② Betonstaaf selecteren");
  const sel = await mcp.tool("gui_select_member", { id: ID });
  eis("de geselecteerde staaf komt terug", sel?.id === ID, `id ${sel?.id}, ${sel?.material}`);
  await shot(2, "staaf-geselecteerd");

  // ── 3. Korf zetten ────────────────────────────────────────────────────────
  log("\n③ Wapeningskorf invoeren");
  const korf = {
    cover_mm: 30, stirrup_diameter_mm: 8,
    bottom: { count: 3, diameter_mm: 16 }, top: { count: 2, diameter_mm: 12 },
    stirrup_spacing_mm: 200, stirrup_legs: 2,
  };
  const metKorf = await mcp.tool("gui_set_cage", { beam_id: ID, cage: korf });
  const k = metKorf?.checkConfig?.betonKorf;
  eis("de korf staat op de staaf (checkConfig.betonKorf)", k?.bottom?.count === 3 && k?.top?.diameter_mm === 12,
    JSON.stringify(k));
  await shot(3, "korf-ingevoerd");

  // ── 4. Analysetype ────────────────────────────────────────────────────────
  log("\n④ Analysetype: tweede orde + fysisch niet-lineair");
  const at = await mcp.tool("gui_set_analysis", { analysis_type: "tweedeOrdeFysisch" });
  eis("analysetype gezet", at?.analysetype === "tweedeOrdeFysisch", at?.analysetype);

  // ── 5. Rekenen ────────────────────────────────────────────────────────────
  log("\n⑤ Rekenen");
  const rek = await mcp.tool("gui_solve");
  eis("er zijn combinatieresultaten", (rek?.combinaties?.length ?? 0) > 0,
    (rek?.combinaties ?? []).map((c) => `${c.naam}: M ${c.M_max_kNm.toFixed(1)} kNm`).join(" · "));
  await shot(4, "berekend");

  // ── 6. Toetsen ────────────────────────────────────────────────────────────
  log("\n⑥ Toetsen");
  const t1 = await mcp.tool("gui_run_checks");
  eis("de toetsing meldt geen fout", !t1?.error, t1?.error ?? "");
  const mijn = (t1?.results ?? []).filter((r) => r.beamId === ID || r.beam_id === ID);
  eis("de betonstaaf heeft toetsuitkomsten", mijn.length > 0, `${mijn.length} resultaat(en), ${(t1?.results ?? []).length} in totaal`);
  const eersteToets = mijn[0];
  const aantalChecks = eersteToets?.checks?.length ?? eersteToets?.result?.checks?.length ?? 0;
  eis("met meer dan één normtoets erin", aantalChecks > 1, `${aantalChecks} toetsen`);
  await mcp.tool("gui_set_view", { view: "check" });
  await slaap(600);
  await shot(5, "toetsing");

  const t2 = await mcp.tool("gui_run_checks");
  const stripTijd = (x) => JSON.stringify({ results: x?.results, skipped: x?.skipped, error: x?.error });
  eis("twee keer toetsen geeft hetzelfde antwoord (determinisme door de hele keten)",
    stripTijd(t1) === stripTijd(t2));
  const gelezen = await mcp.tool("gui_read_checks");
  eis("gui_read_checks leest dezelfde uitkomst terug", stripTijd(gelezen) === stripTijd(t2));

  // ── Vier wegen, één antwoord ──────────────────────────────────────────────
  // De rekenkern is langs drie wegen bereikbaar (Tauri-command, toetsbrug,
  // MCP); de GUI is de vierde. De app bewaart de kerninvoer die haar bouwer
  // voor de betonstaaf samenstelde; diezelfde invoer rechtstreeks door
  // `check_concrete_beam` op de MCP halen moet hetzelfde resultaat geven als
  // wat de GUI toont — veld voor veld, inclusief de afleidingsteksten. Zo niet,
  // dan rekent de app met iets anders dan zij zegt.
  log("\n⑥b Vier wegen, één antwoord");
  const invoerBeton = (t2?.inputs?.beton ?? []).find((i) => i.beam_id === ID);
  eis("de app bewaart de kerninvoer van de betonstaaf", !!invoerBeton,
    invoerBeton ? `${invoerBeton.concrete_class}, ${invoerBeton.forces_envelope?.length ?? 0} krachtpunten` : "geen lastRunInputs");
  if (invoerBeton) {
    const direct = await mcp.tool("check_concrete_beam", invoerBeton);
    const guiResultaat = (t2?.results ?? []).find((r) => r.beam_id === ID);
    const a = JSON.stringify(guiResultaat), b = JSON.stringify(direct);
    eis("de GUI en de kern rechtstreeks geven hetzelfde antwoord", a === b,
      a === b ? `${direct?.checks?.length ?? 0} toetsen identiek` : `verschil op positie ${[...a].findIndex((c, i) => c !== b[i])}`);
  }

  // ── 7. Dekkingslijn ───────────────────────────────────────────────────────
  log("\n⑦ Dekkingslijn");
  await mcp.tool("gui_set_view", { view: "default" });
  const dekUit = await mcp.tool("gui_open_curtailment", { beam_id: ID });
  const dek = dekUit?.antwoord;
  const nOnder = dek?.onder?.punten?.length ?? 0, nBoven = dek?.boven?.punten?.length ?? 0;
  eis("de dekkingslijn komt uit de kern met punten onder én boven", nOnder > 0 && nBoven > 0,
    `${nOnder} punten onder, ${nBoven} boven, a_l = ${dek?.a_l_mm?.toFixed?.(1) ?? "?"} mm`);
  eis("de dekkingslijn hoort bij deze staaf", dek?.beam_id === ID, `beam_id ${dek?.beam_id}`);
  // Vier wegen, één antwoord — ook hier: het verzoek dat het venster stuurde,
  // rechtstreeks door de kern, moet hetzelfde antwoord geven als het venster
  // toont. Bit-identiek; sinds float_roundtrip in de app-crate kan dat.
  eis("het venster bewaart zijn verzoek", !!dekUit?.verzoek?.beam,
    dekUit?.verzoek ? `${dekUit.verzoek.beam.concrete_class}, ${dekUit.verzoek.beam.forces_envelope?.length ?? 0} krachtpunten` : "geen verzoek");
  if (dekUit?.verzoek) {
    const direct = await mcp.tool("concrete_dekkingslijn", dekUit.verzoek);
    const a = JSON.stringify(dek), b = JSON.stringify(direct);
    eis("de dekkingslijn van de GUI is die van de kern", a === b,
      a === b ? `${nOnder + nBoven} punten identiek` : `verschil op positie ${[...a].findIndex((c, i) => c !== b[i])}`);
  }
  await slaap(600);
  await shot(6, "dekkingslijn");

  // ── 8. Rapport ────────────────────────────────────────────────────────────
  log("\n⑧ Rapport");
  await mcp.tool("gui_set_view", { view: "report" });
  await slaap(1500);
  await shot(7, "rapport");
  const los = await mcp.tool("gui_detach_report");
  eis("het rapport is losgemaakt in een eigen venster", typeof los?.label === "string" && los.label.length > 0, los?.label);
  // Het losse venster laadt de app opnieuw, meldt zich bij het hoofdvenster
  // en krijgt dan pas zijn snapshot via reportSync. Gemeten: na 1 s staat er
  // nog "Wachten op het hoofdvenster" met lege secties, na 10 s is alles
  // gesynchroniseerd (60 vellen). Zonder hook in dat venster is er niets om
  // op te wachten dan de tijd; daarom een vaste marge en pas dán de capture.
  // Eerst wachten tot het venster überhaupt bestaat (de capture faalt anders).
  let bestaat = false;
  for (let i = 0; i < 20 && !bestaat; i++) {
    await slaap(500);
    try { await mcp.tool("gui_screenshot", { window: los.label, path: join(UIT, "08-rapport-los.png") }); bestaat = true; }
    catch (e) { if (i === 19) throw e; }
  }
  await slaap(6000);
  await shot(8, "rapport-los", los.label);

  // ── 9. De screenshots verschillen ─────────────────────────────────────────
  log("\n⑨ De stappen zijn te onderscheiden");
  const paren = [["start", "toetsing"], ["berekend", "dekkingslijn"], ["rapport", "start"]];
  for (const [a, b] of paren) {
    const A = shots[a], B = shots[b];
    eis(`${a} ≠ ${b}`, !!A && !!B && (Math.abs(A.gem - B.gem) > 0.5 || Math.abs(A.sd - B.sd) > 0.5 || A.bytes !== B.bytes),
      A && B ? `gem ${A.gem.toFixed(1)}/${B.gem.toFixed(1)}, sd ${A.sd.toFixed(1)}/${B.sd.toFixed(1)}` : "ontbreekt");
  }
} catch (e) {
  failed++;
  log(`  ✗ afgebroken: ${e instanceof Error ? e.message : String(e)}`);
}

// ── 10. Afsluiten en opruimen ───────────────────────────────────────────────
log("\n⑩ Afsluiten");
try {
  const q = await mcp.tool("gui_quit");
  eis("gui_quit wordt bevestigd", q?.afgesloten === true);
} catch (e) {
  eis("gui_quit wordt bevestigd", false, e.message);
}
let weg = false;
for (let i = 0; i < 40 && !weg; i++) { await slaap(250); weg = !existsSync(VINDBESTAND); }
eis("de app ruimde gui-control.json op", weg);
if (!app.killed && app.exitCode === null) { await slaap(1000); try { app.kill(); } catch {} }
mcp.stop();

log("\n═══════════════════════════════════════════════════════════════════════");
log(`wapening-workflow: ${passed} geslaagd, ${failed} gefaald.  Screenshots: ${UIT}`);
process.exit(failed === 0 ? 0 : 1);
