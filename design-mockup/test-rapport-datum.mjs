// De rapportdatum voluit en in de taal van de app, in titelblad én paginakop
// van het live rapport (issue #20).
//
// WAT HIER MISGING
//  Het titelblad (`sections/ProjectSection`) zette de datum voluit ("16
//  september 2026"), de kop van elke pagina (`ReportShell`) ruw ("2026-09-16").
//  Het titelblad las de tekst bovendien met `new Date(...)` in de tijdzone van
//  de computer: ten westen van Greenwich stond er de dag ervoor.
//
// WAT DEZE TEST VASTLEGT
//  [1] datumVoluit levert per taal precies de notatie uit de gedeelde
//      proeftabel `src-tauri/crates/report/tests/data/datumnotatie.json` —
//      dezelfde tabel waartegen report/tests/datum_kop_pdf.rs de PDF houdt.
//      Scherm en papier kunnen dus niet uiteenlopen.
//  [2] De datum hangt niet van de tijdzone af.
//  [3] rapportTaal herleidt de taal van i18next naar één van de vier, met
//      Engels (fallbackLng) voor de rest.
//  [4] bouwRapportInvoer geeft die taal aan de PDF mee, en laat het veld weg
//      als de aanroeper geen taal noemt.
//  [5] Titelblad en paginakop roepen allebei datumVoluit aan, met de taal van
//      i18next; in de rapportcomponenten staat geen eigen datumformattering
//      meer.
//
// Uitvoeren: npx tsx test-rapport-datum.mjs   (vanuit design-mockup/)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const { datumVoluit, rapportTaal, RAPPORT_TALEN } = await import("./src/lib/rapportDatum.ts");
const { bouwRapportInvoer } = await import("./src/lib/rapportPdfInvoer.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De gedeelde proeftabel");
{
  const tabel = JSON.parse(readFileSync(
    join(HIER, "..", "src-tauri", "crates", "report", "tests", "data", "datumnotatie.json"), "utf8"));
  for (const taal of RAPPORT_TALEN) {
    check(`${taal}: elke maand in de tabel`,
      tabel.rijen.filter((r) => r.taal === taal && r.voluit !== r.ruw).length >= 12);
  }
  const fout = tabel.rijen.filter((r) => datumVoluit(r.ruw, r.taal) !== r.voluit);
  check(`alle ${tabel.rijen.length} rijen gelijk aan de PDF-notatie`, fout.length === 0,
    fout.map((r) => `${r.taal} ${JSON.stringify(r.ruw)} → ${JSON.stringify(datumVoluit(r.ruw, r.taal))}, verwacht ${JSON.stringify(r.voluit)}`).join("; "));
  check("de vier talen van de app, in de volgorde van report::RapportTaal",
    JSON.stringify(RAPPORT_TALEN) === JSON.stringify(["nl", "en", "de", "fr"]));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Onafhankelijk van de tijdzone");
{
  const oud = process.env.TZ;
  for (const tz of ["America/Los_Angeles", "Pacific/Kiritimati", "Europe/Amsterdam"]) {
    process.env.TZ = tz;
    check(`${tz}: 16 september 2026`, datumVoluit("2026-09-16", "nl") === "16 september 2026",
      datumVoluit("2026-09-16", "nl"));
  }
  process.env.TZ = "America/Los_Angeles";
  // Tegenproef: zo las het titelblad de datum vóór deze wijziging.
  check("tegenproef: new Date() gaf daar de dag ervoor",
    new Date("2026-09-16").toLocaleDateString("nl", { day: "numeric", month: "long", year: "numeric" })
      === "15 september 2026");
  if (oud === undefined) delete process.env.TZ; else process.env.TZ = oud;
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] rapportTaal");
{
  const gevallen = [["nl", "nl"], ["de", "de"], ["fr-BE", "fr"], ["en-GB", "en"], ["NL", "nl"],
    ["es", "en"], ["", "en"], [undefined, "en"]];
  for (const [invoer, verwacht] of gevallen) {
    check(`${JSON.stringify(invoer)} → ${verwacht}`, rapportTaal(invoer) === verwacht, rapportTaal(invoer));
  }
  check("en-GB en en geven op het scherm dezelfde notatie",
    datumVoluit("2026-09-16", "en-GB") === datumVoluit("2026-09-16", "en"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De taal gaat mee naar de PDF");
{
  const project = { name: "P", projectNumber: "1", engineer: "E", company: "C", date: "2026-09-16" };
  const met = bouwRapportInvoer({ project, checkResults: [], taal: "de-DE" });
  check("taal van de app → taal van de PDF", met.taal === "de", String(met.taal));
  check("de datum zelf gaat ruw mee (de PDF formatteert)", met.date === "2026-09-16");
  const onbekend = bouwRapportInvoer({ project, checkResults: [], taal: "es" });
  check("onbekende taal → Engels, net als op het scherm", onbekend.taal === "en", String(onbekend.taal));
  const zonder = bouwRapportInvoer({ project, checkResults: [] });
  check("zonder taal blijft het veld weg", !("taal" in zonder));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Titelblad en paginakop");
{
  const rapportMap = join(HIER, "src", "components", "report");
  const shell = readFileSync(join(rapportMap, "ReportShell.tsx"), "utf8");
  const project = readFileSync(join(rapportMap, "sections", "ProjectSection.tsx"), "utf8");
  check("paginakop: datumVoluit met de taal van i18next",
    /report\.kopDatum[^\]]*datumVoluit\(info\.date, i18n\.language\)/.test(shell));
  check("paginakop: de ruwe datum staat er niet meer",
    !/\[t\("report\.kopDatum", "Datum"\), info\.date\]/.test(shell));
  check("titelblad: datumVoluit met de taal van i18next",
    /return datumVoluit\(raw, taal\)/.test(project) && /formatDate\(info\.date, i18n\.language\)/.test(project));

  const bestanden = [];
  const loop = (map) => {
    for (const naam of readdirSync(map)) {
      const pad = join(map, naam);
      if (statSync(pad).isDirectory()) loop(pad);
      else if (/\.tsx?$/.test(naam)) bestanden.push(pad);
    }
  };
  loop(rapportMap);
  const eigen = bestanden.filter((p) =>
    /toLocaleDateString|DateTimeFormat|new Date\(\s*(raw|info\.date)/.test(readFileSync(p, "utf8")));
  check("geen eigen datumformattering in de rapportcomponenten", eigen.length === 0, eigen.join(", "));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
