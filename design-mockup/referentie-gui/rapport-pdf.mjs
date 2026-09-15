// ═══════════════════════════════════════════════════════════════════════════
// Het standaardrapport als PDF, via de MCP-server, door de ÉCHTE desktop-app.
// ═══════════════════════════════════════════════════════════════════════════
//
// WAT DIT TOETST
// Een extern programma laat de draaiende app een referentieproject laden,
// rekenen, toetsen en het LIVE rapport (volledig en beperkt) als PDF opleveren —
// hetzelfde document als Afdrukken → Opslaan als PDF. De aansturing loopt met
// opzet via de MCP-server over stdio (gui_tools.rs), zodat ook de schema's en de
// base64-uitvoer beproefd worden.
//
// WAT "GESLAAGD" HIER BETEKENT
// * Zonder berekening WEIGERT de export, met de reden, en verandert er niets.
// * Elke PDF: %PDF-kop, pagina's = vellen (en dat ook volgens pdftotext), het
//   papier volgens de vraag (MediaBox), de base64 is exact het bestand.
// * De tekst (pdftotext) bevat de projectkop uit het argument, de hoofdstuktitels
//   en de toetsresultaten (profiel + UC per staaf); de paginanummers uit de
//   @page-margeboxen staan erin.
// * De grijze achtergrond van de tabelkoppen is geprint (achtergronden aan).
// * Beperkt heeft minder pagina's dan volledig en mist "Toetsing per staaf".
// * Na elke export staan weergave, rapporttype, papier en kop terug.
// * Een geminimaliseerd venster wordt voor de export hersteld en daarna weer
//   geminimaliseerd, met een geldige PDF.
//
// NIET OVERSCHRIJVEN
// Draait er al een app met bediening (het vindbestand in de app-datamap wijst
// naar een levend proces), dan wordt dat GEMELD en niet aangeraakt: deze test
// geeft zijn eigen app een eigen vindbestand (OPENAEC_GUI_CONTROL_FILE) en een
// eigen WebView2-gegevensmap (WEBVIEW2_USER_DATA_FOLDER).
//
// Draaien:  node referentie-gui/rapport-pdf.mjs   (vanuit design-mockup/)
// Vereist:  de app uit DEZE boom:  npm run build  (design-mockup/), daarna in
//           src-tauri/: cargo build --release -p open-fem2d-studio --features tauri/custom-protocol
//           en cargo build --release -p openaec-mcp-server; pdftotext op PATH.
// Uitvoer:  de PDF's in een tijdelijke map (het pad staat in de uitvoer).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..");
const APP = process.env.OPENAEC_APP
  ?? join(REPO, "src-tauri", "target", "release", "open-fem2d-studio.exe");
const MCP = join(REPO, "src-tauri", "target", "release", "openaec-mcp-server.exe");
const PROJECT = join(HIER, "..", "referentie-projecten", "P04.femp");
const UIT = join(tmpdir(), `openfem2d-rapport-pdf-${process.pid}`);
const VIND = join(UIT, "gui-control.json");
const STANDAARD_VIND = join(process.env.LOCALAPPDATA ?? "", "org.openaec.fem2d-studio", "gui-control.json");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
  return ok;
}
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Vooraf ──────────────────────────────────────────────────────────────────
for (const [wat, pad] of [["app", APP], ["MCP-server", MCP], ["referentieproject", PROJECT]]) {
  if (!existsSync(pad)) {
    log(`ONTBREEKT: ${wat} op ${pad}`);
    process.exit(2);
  }
}
if (spawnSync("pdftotext", ["-v"]).error) {
  log("ONTBREEKT: pdftotext op PATH (poppler) — zonder tekstlaag is de inhoud niet te toetsen");
  process.exit(2);
}
mkdirSync(UIT, { recursive: true });
rmSync(VIND, { force: true });

log("═══════════════════════════════════════════════════════════════════════");
log("Het standaardrapport als PDF, via de MCP-server");
log(`  app:     ${APP}`);
log(`  project: ${PROJECT}`);
log(`  uitvoer: ${UIT}`);
log("═══════════════════════════════════════════════════════════════════════");

// Draait er al een app met bediening? Dan niet overschrijven, wel melden.
try {
  const j = JSON.parse(readFileSync(STANDAARD_VIND, "utf8"));
  let leeft = false;
  try { process.kill(j.pid, 0); leeft = true; } catch { leeft = false; }
  log(leeft
    ? `  MELDING: er draait al een app met bediening (pid ${j.pid}, poort ${j.poort}, versie ${j.versie}). ` +
      `Zijn vindbestand (${STANDAARD_VIND}) wordt niet aangeraakt; deze test gebruikt een eigen.`
    : `  MELDING: ${STANDAARD_VIND} wijst naar pid ${j.pid}, dat niet meer leeft; niet aangeraakt.`);
} catch {
  // geen vindbestand: niets te melden
}

// ── PDF-hulp: tekst, papier, achtergronden ──────────────────────────────────
function pdfTekst(pad) {
  const r = spawnSync("pdftotext", ["-enc", "UTF-8", pad, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`pdftotext ${pad}: ${r.stderr}`);
  const paginas = r.stdout.split("\f");
  // pdftotext sluit elke pagina af met een form feed; het laatste stuk is leeg.
  if (paginas.length > 0 && paginas[paginas.length - 1].trim() === "") paginas.pop();
  return { tekst: r.stdout.replace(/\s+/g, " "), paginas: paginas.length };
}

function mediaBox(bytes) {
  const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(bytes.toString("latin1"));
  return m ? { b: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null;
}

/**
 * Alle ontpakte stromen (content streams) als tekst.
 *
 * Het sleutelwoord `stream` staat ook in `endstream`: zonder de lookbehind
 * matchte de zoeker na elke stroom eerst het staartje van `endstream`, ontpakte
 * dan bytes ná de stroom (mislukt, stil) en sprong met `lastIndex` over de
 * volgende echte stroom heen — 1 van 95 stromen gelezen, en "geen achtergrond"
 * terwijl de vulkleur er wél in stond. Gemeten op de PDF van deze test.
 */
function stromen(bytes) {
  const s = bytes.toString("latin1");
  const uit = [];
  const re = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const begin = m.index + m[0].length;
    const eind = s.indexOf("endstream", begin);
    if (eind < 0) break;
    try { uit.push(inflateSync(bytes.subarray(begin, eind)).toString("latin1")); } catch { /* geen Flate */ }
    re.lastIndex = eind;
  }
  return uit;
}

/**
 * De grijze tabelkop: `.rpt-table thead th { background: #f2f2f2 }` (report.css).
 * #f2 = 242/255 = 0,949. Achtergronden die niet geprint worden, laten geen
 * vulkleur in die tint achter; tekst en lijnen in het rapport zijn donkerder.
 */
function heeftGrijzeTabelkop(bytes) {
  const getal = "(\\d*\\.\\d+|\\d+)";
  const re = new RegExp(`${getal}\\s+${getal}\\s+${getal}\\s+(rg|sc|scn)\\b`, "g");
  let gevonden = 0;
  for (const st of stromen(bytes)) {
    let m;
    while ((m = re.exec(st))) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (Math.abs(r - 242 / 255) < 0.004 && Math.abs(g - r) < 1e-6 && Math.abs(b - r) < 1e-6) gevonden++;
    }
  }
  return gevonden;
}

// ── De titels in de taal van de app ─────────────────────────────────────────
const TALEN = ["nl", "en", "de", "fr"].map((taal) => ({
  taal,
  report: JSON.parse(readFileSync(join(HIER, "..", "src", "i18n", "locales", taal, "ribbon.json"), "utf8")).report,
}));

// ── De MCP-server over stdio (zelfde als wapening-workflow) ─────────────────
class Mcp {
  constructor() {
    this.kind = spawn(MCP, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, OPENAEC_GUI_CONTROL_FILE: VIND },
    });
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
      clientInfo: { name: "rapport-pdf", version: "0.0.0" },
    });
    if (r.error) throw new Error(`initialize: ${JSON.stringify(r.error)}`);
  }
  async tool(name, args = {}) {
    const r = await this.verzoek("tools/call", { name, arguments: args });
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
    if (r.result?.isError) throw new Error(`${name}: ${r.result.content?.[0]?.text ?? "toolfout"}`);
    return r.result?.structuredContent ?? null;
  }
  async lijst() {
    const r = await this.verzoek("tools/list", {});
    return r.result?.tools ?? [];
  }
  stop() { try { this.kind.stdin.end(); this.kind.kill(); } catch {} }
}

// ── Venster minimaliseren (Win32, via PowerShell) ───────────────────────────
const WIN32 = `$sig = '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'
Add-Type -MemberDefinition $sig -Name W -Namespace RapportPdf | Out-Null`;

function powershell(script) {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

/**
 * Het HWND van het hoofdvenster, bepaald ZOLANG HET ZICHTBAAR IS en daarna
 * hergebruikt. `Process.MainWindowHandle` kiest het eerste zichtbare
 * top-level venster van het proces; is het hoofdvenster geminimaliseerd, dan
 * wijst het naar een ander (hulp)venster van dezelfde app — gemeten: het
 * handle veranderde na het minimaliseren, en dat andere venster is nooit
 * "iconic". Wie na de export opnieuw via Get-Process zoekt, leest dus altijd
 * "zichtbaar", wat er ook met het hoofdvenster gebeurde.
 */
function hoofdvensterHandle(pid) {
  const h = powershell(`(Get-Process -Id ${pid}).MainWindowHandle`);
  return /^\d+$/.test(h) && h !== "0" ? h : null;
}

function vensterActie(hwnd, actie) {
  return powershell(`${WIN32}
$h = [IntPtr]${hwnd}
${actie === "minimaliseer" ? "[RapportPdf.W]::ShowWindow($h, 6) | Out-Null; Start-Sleep -Milliseconds 300" : ""}
if ([RapportPdf.W]::IsIconic($h)) { Write-Output "geminimaliseerd" } else { Write-Output "zichtbaar" }`);
}

// ── De app starten ──────────────────────────────────────────────────────────
const app = spawn(APP, [], {
  env: {
    ...process.env,
    OPENAEC_GUI_CONTROL: "1",
    OPENAEC_GUI_CONTROL_FILE: VIND,
    WEBVIEW2_USER_DATA_FOLDER: join(UIT, "webview2"),
  },
  stdio: "ignore", detached: false,
});
let vind = null;
for (let i = 0; i < 160 && !vind; i++) {
  await slaap(250);
  try {
    const j = JSON.parse(readFileSync(VIND, "utf8"));
    if (j.pid === app.pid) vind = j;
  } catch {}
}
eis("de app schrijft haar vindbestand op het eigen pad (OPENAEC_GUI_CONTROL_FILE)", vind !== null,
  vind ? `pid ${vind.pid}, poort ${vind.poort}` : `niet gevonden op ${VIND}`);
if (!vind) { app.kill(); process.exit(1); }

const mcp = new Mcp();
await mcp.init();

const status = async () => (await mcp.tool("gui_status")).pagina;
const pdfPad = (naam) => join(UIT, `${naam}.pdf`);

try {
  // ── 1. Tools en schema ───────────────────────────────────────────────────
  log("\n① De tool staat in tools/list");
  const tools = await mcp.lijst();
  const gui = tools.filter((t) => t.name.startsWith("gui_"));
  const exp = tools.find((t) => t.name === "gui_export_report_pdf");
  eis("15 gui_*-tools, waaronder gui_export_report_pdf", gui.length === 15 && !!exp, gui.map((t) => t.name).join(", "));
  eis("het schema eist `path` en weigert onbekende velden",
    JSON.stringify(exp?.inputSchema?.required) === '["path"]' && exp?.inputSchema?.additionalProperties === false);

  let st = null;
  for (let i = 0; i < 80 && !(st?.aantalStaven > 0); i++) {
    await slaap(500);
    try { st = await status(); } catch { st = null; }
  }
  eis("de pagina antwoordt (startmodel geladen)", st?.aantalStaven > 0, st ? `${st.aantalStaven} staven` : "geen status");

  // ── 2. Weigeren zonder berekening ────────────────────────────────────────
  log("\n② Zonder berekening: weigeren, en niets veranderen");
  const voorWeigering = await status();
  let weigering = null;
  try { await mcp.tool("gui_export_report_pdf", { path: pdfPad("zonder-berekening") }); }
  catch (e) { weigering = e.message; }
  eis("de export weigert", weigering !== null, weigering ?? "geen fout");
  eis("met de reden (geen resultaten, roep rekenen aan)", /geen resultaten/.test(weigering ?? "") && /rekenen/.test(weigering ?? ""), weigering ?? "");
  eis("er staat geen PDF", !existsSync(pdfPad("zonder-berekening")));
  const naWeigering = await status();
  eis("weergave en rapportinstellingen onveranderd",
    naWeigering.weergave === voorWeigering.weergave
      && JSON.stringify(naWeigering.rapport) === JSON.stringify(voorWeigering.rapport),
    `${naWeigering.weergave} ${JSON.stringify(naWeigering.rapport)}`);
  let argFout = null;
  try { await mcp.tool("gui_export_report_pdf", { path: pdfPad("fout"), report_type: "kort" }); }
  catch (e) { argFout = e.message; }
  eis("een onbekend rapporttype wordt door de MCP-laag geweigerd", /report_type/.test(argFout ?? ""), argFout ?? "geen fout");

  // ── 3. Referentieproject laden, rekenen, toetsen ─────────────────────────
  log("\n③ Referentieproject laden, rekenen, toetsen");
  const geladen = await mcp.tool("gui_load_model", { path: PROJECT });
  eis("P04 geladen", geladen?.aantalStaven > 0, `${geladen?.aantalKnopen} knopen, ${geladen?.aantalStaven} staven`);
  const rek = await mcp.tool("gui_solve");
  eis("gui_solve rekent én toetst in één gang",
    (rek?.combinaties?.length ?? 0) > 0 && rek?.toetsing?.getoetst > 0 && rek?.toetsing?.fout === null,
    `${rek?.combinaties?.length} combinaties, ${rek?.toetsing?.getoetst} getoetst, fout ${rek?.toetsing?.fout}`);
  const toets = await mcp.tool("gui_read_checks");
  eis("de toetsing staat er, zonder fout", (toets?.results?.length ?? 0) > 0 && !toets?.error,
    `${toets?.results?.length} resultaten`);
  const fmtUc = (v) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── 4. Beperkt (het type staat op volledig → na afloop weer volledig) ────
  log("\n④ Beperkt rapport");
  const voorBeperkt = await status();
  const beperkt = await mcp.tool("gui_export_report_pdf", { path: pdfPad("beperkt"), report_type: "beperkt" });
  const bytesB = readFileSync(pdfPad("beperkt"));
  eis("%PDF-kop", bytesB.subarray(0, 5).toString("latin1") === "%PDF-");
  eis("base64 is exact het bestand", Buffer.from(beperkt.pdf_base64, "base64").equals(bytesB) && beperkt.bytes === bytesB.length,
    `${beperkt.bytes} bytes`);
  eis("pagina's = vellen", beperkt.pages === beperkt.sheets && beperkt.sheets > 0, `${beperkt.pages} / ${beperkt.sheets}`);
  const tekstB = pdfTekst(pdfPad("beperkt"));
  eis("pdftotext telt evenveel pagina's", tekstB.paginas === beperkt.pages, `${tekstB.paginas}`);
  eis("rapporttype beperkt in het antwoord", beperkt.report_type === "beperkt");
  const naBeperkt = await status();
  eis("na afloop: rapporttype, papier en weergave terug",
    naBeperkt.rapport.type === voorBeperkt.rapport.type
      && naBeperkt.rapport.formaat === voorBeperkt.rapport.formaat
      && naBeperkt.rapport.orientatie === voorBeperkt.rapport.orientatie
      && naBeperkt.weergave === voorBeperkt.weergave
      && naBeperkt.rapport.kopOverschreven === false && naBeperkt.rapport.lopendeExport === null,
    `${JSON.stringify(naBeperkt.rapport)}, weergave ${naBeperkt.weergave}`);
  eis("… en dat was een echte terugzetting (beperkt ≠ het type ervoor)", voorBeperkt.rapport.type === "volledig",
    voorBeperkt.rapport.type);

  // ── 5. Volledig met eigen kop ────────────────────────────────────────────
  log("\n⑤ Volledig rapport met een eigen projectkop");
  const kop = {
    name: "Rapport-PDF referentie", number: "RP-2026-001",
    engineer: "Test Constructeur", company: "Testbureau Noord", date: "2026-09-15",
  };
  const volledig = await mcp.tool("gui_export_report_pdf", {
    path: pdfPad("volledig"), report_type: "volledig", page_size: "A4", orientation: "portrait", project: kop,
  });
  const bytesV = readFileSync(pdfPad("volledig"));
  eis("%PDF-kop", bytesV.subarray(0, 5).toString("latin1") === "%PDF-");
  eis("base64 is exact het bestand", Buffer.from(volledig.pdf_base64, "base64").equals(bytesV));
  eis("pagina's = vellen", volledig.pages === volledig.sheets && volledig.sheets > 0, `${volledig.pages} / ${volledig.sheets}`);
  const tekstV = pdfTekst(pdfPad("volledig"));
  eis("pdftotext telt evenveel pagina's", tekstV.paginas === volledig.pages, `${tekstV.paginas}`);
  const mbV = mediaBox(bytesV);
  eis("papier A4 staand (595 × 842 pt)", mbV && Math.abs(mbV.b - 595.28) < 1.5 && Math.abs(mbV.h - 841.89) < 1.5,
    JSON.stringify(mbV));
  eis("beperkt heeft minder pagina's dan volledig", beperkt.pages < volledig.pages, `${beperkt.pages} < ${volledig.pages}`);

  const taal = TALEN.find((t) => tekstV.tekst.includes(t.report.sectionCheckTable)) ?? null;
  eis("de taal van het rapport is herkend", !!taal, taal?.taal ?? "geen van nl/en/de/fr");
  if (taal) {
    const r = taal.report;
    const hoofdstukken = [
      r.sectionToc, r.sectionNodes, r.sectionBeams, r.sectionSections, r.sectionLoads,
      r.sectionCombinations, r.sectionSchema, r.sectionDiagrams, r.sectionReactions,
      r.sectionDisplacements, r.sectionCheckTable, r.sectionCheckDetail,
    ];
    const ontbreekt = hoofdstukken.filter((h) => !tekstV.tekst.includes(h));
    eis("volledig: de hoofdstuktitels staan erin", ontbreekt.length === 0, ontbreekt.length ? `ontbreekt: ${ontbreekt.join(", ")}` : hoofdstukken.join(" · "));
    eis("beperkt: toetsingsoverzicht wel, toetsing per staaf niet",
      tekstB.tekst.includes(r.sectionCheckTable) && !tekstB.tekst.includes(r.sectionCheckDetail));
    eis("de paginanummers uit de @page-margeboxen staan erin",
      tekstV.tekst.includes(`${r.pagePrefix} 1 / ${volledig.pages}`) && tekstV.tekst.includes(`${r.pagePrefix} ${volledig.pages} / ${volledig.pages}`),
      `"${r.pagePrefix} 1 / ${volledig.pages}"`);
  }
  const kopTeksten = [kop.name, kop.number, kop.engineer, kop.company];
  const kopMist = kopTeksten.filter((k) => !tekstV.tekst.includes(k));
  eis("de projectkop uit het argument staat erin", kopMist.length === 0, kopMist.length ? `ontbreekt: ${kopMist.join(", ")}` : kopTeksten.join(" · "));
  eis("de app meldt de kop als argument", volledig.details?.projectKop?.bron === "argument" && volledig.details.projectKop.naam === kop.name);
  const toetsMist = [];
  for (const res of toets.results) {
    const profiel = res.profile_name ?? res.section_name;
    if (profiel && !tekstV.tekst.includes(profiel)) toetsMist.push(`profiel ${profiel}`);
    if (!tekstV.tekst.includes(fmtUc(res.uc_max))) toetsMist.push(`UC ${fmtUc(res.uc_max)} (staaf ${res.beam_id})`);
  }
  eis("de toetsresultaten staan erin (profiel en UC per staaf)", toetsMist.length === 0,
    toetsMist.length ? toetsMist.join(", ") : `${toets.results.length} staven`);
  const grijsV = heeftGrijzeTabelkop(bytesV);
  eis("de grijze achtergrond van de tabelkoppen is geprint", grijsV > 0, `${grijsV} vulkleuren #f2f2f2`);
  const naVolledig = await status();
  eis("na afloop: geen kopoverschrijving meer, weergave terug",
    naVolledig.rapport.kopOverschreven === false && naVolledig.weergave === voorBeperkt.weergave && naVolledig.rapport.lopendeExport === null,
    `${JSON.stringify(naVolledig.rapport)}, weergave ${naVolledig.weergave}`);

  // ── 6. Liggend ───────────────────────────────────────────────────────────
  log("\n⑥ Liggend papier");
  const liggend = await mcp.tool("gui_export_report_pdf", { path: pdfPad("beperkt-liggend"), report_type: "beperkt", orientation: "landscape" });
  const bytesL = readFileSync(pdfPad("beperkt-liggend"));
  const mbL = mediaBox(bytesL);
  eis("papier A4 liggend (842 × 595 pt)", mbL && Math.abs(mbL.b - 841.89) < 1.5 && Math.abs(mbL.h - 595.28) < 1.5, JSON.stringify(mbL));
  eis("pagina's = vellen", liggend.pages === liggend.sheets, `${liggend.pages} / ${liggend.sheets}`);
  eis("na afloop weer staand", (await status()).rapport.orientatie === "portrait");

  // ── 7. Geminimaliseerd venster ───────────────────────────────────────────
  log("\n⑦ Geminimaliseerd venster");
  const hwnd = hoofdvensterHandle(app.pid);
  eis("het hoofdvenster is gevonden (zichtbaar)", hwnd !== null, hwnd ?? "geen handle");
  const voorMin = vensterActie(hwnd, "minimaliseer");
  eis("het venster is geminimaliseerd", voorMin === "geminimaliseerd", voorMin);
  const min = await mcp.tool("gui_export_report_pdf", { path: pdfPad("geminimaliseerd"), report_type: "beperkt" });
  eis("export gelukt, met pagina's = vellen", min.pages === min.sheets && min.sheets > 0, `${min.pages} / ${min.sheets}`);
  eis("de app meldt dat het venster geminimaliseerd was", min.details?.vensterWasGeminimaliseerd === true);
  eis("dezelfde vellen als zonder minimaliseren", min.sheets === beperkt.sheets, `${min.sheets} / ${beperkt.sheets}`);
  // Tauri's `minimize()` is een bericht aan de eventloop; de HTTP-uitkomst kan
  // er net vóór liggen. Kort pollen, geen vaste wachttijd als enige meting.
  let naMin = "";
  for (let i = 0; i < 10 && naMin !== "geminimaliseerd"; i++) {
    if (i > 0) await slaap(200);
    naMin = vensterActie(hwnd, "lees");
  }
  eis("daarna weer geminimaliseerd", naMin === "geminimaliseerd", naMin);

  log(`\n  beforeprint gezien door de pagina: ${volledig.details?.beforeprintGezien}`);
  log(`  wachttijd tot klaar (volledig): ${volledig.details?.wachttijdMs} ms, totale duur ${volledig.details?.duurMs} ms`);
  log(`  vellen: volledig ${volledig.sheets}, beperkt ${beperkt.sheets}, liggend ${liggend.sheets}`);
  log(`  bestanden: ${["beperkt", "volledig", "beperkt-liggend", "geminimaliseerd"].map((n) => `${n}.pdf ${(statSync(pdfPad(n)).size / 1024).toFixed(0)} kB`).join(", ")}`);
} catch (e) {
  failed++;
  log(`  ✗ afgebroken: ${e instanceof Error ? e.message : String(e)}`);
}

// ── Afsluiten ───────────────────────────────────────────────────────────────
log("\n⑧ Afsluiten");
try {
  const q = await mcp.tool("gui_quit");
  eis("gui_quit wordt bevestigd", q?.afgesloten === true);
} catch (e) {
  eis("gui_quit wordt bevestigd", false, e.message);
}
let weg = false;
for (let i = 0; i < 40 && !weg; i++) { await slaap(250); weg = !existsSync(VIND); }
eis("de app ruimde haar vindbestand op", weg);
if (!app.killed && app.exitCode === null) { await slaap(1000); try { app.kill(); } catch {} }
mcp.stop();

log("\n═══════════════════════════════════════════════════════════════════════");
log(`rapport-pdf: ${passed} geslaagd, ${failed} gefaald.  PDF's: ${UIT}`);
process.exit(failed === 0 ? 0 : 1);
