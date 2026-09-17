// Plaattoets in paneel en rapport (issue #15): rendert de kaart van het
// toetsingspaneel en de rapportsectie "Toetsing platen" met react-dom/server,
// gevoed met een echt kernantwoord (toetsbrug), en leest terug wat er staat.
//
// WAT HIER VASTLIGT
//  [a] Een getoetste plaat toont UC, maatgevend element en combinatie, en
//      "niet uitgevoerd: plooi" zonder te hoeven openklappen.
//  [b] Een geweigerde plaat toont haar reden en GEEN unity check.
//  [c] De rapportsectie heeft het overzicht, de weigering, de overgeslagen plaat
//      en de afleiding met artikel (6.1); de krachtregel noemt geen N, V of M.
//  [d] Zonder platen: een lege-modelmelding in plaats van een tabel.
//  [e] Issue #25 (3) en (4): de n.v.t.-reden van trek loodrecht op de vezel
//      (6.1.3, geen uitdrukking voor k_vol in een schijf, ontwerp vermijdt die
//      trek) en de weigering van kruislaaghout (geen normgrondslag,
//      productnorm/ETA, geen invoerveld voor de bron) staan in kaart én
//      rapportsectie, woordelijk zoals de kern ze gaf.
//
// De handberekening van de getoetste plaat: S355, t = 50 mm → f_y = 335 N/mm²
// (tabel 3.1), σ_x = 150, σ_z = −80, τ = 60 → σ_eq = √51700 = 227,38 N/mm²,
// UC = 227,38/335 = 0,68.
//
// Uitvoeren: npx tsx test-plaat-toets-weergave.mjs   (vanuit design-mockup/)

import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

// De componenten importeren stylesheets (CheckPanel.css, KaTeX); Node kent
// die niet. Een lege module volstaat: hier wordt tekst gelezen, geen opmaak.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function load(url, ctx, next) {" +
        " if (url.split('?')[0].endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };" +
        " return next(url, ctx); }",
    ),
);
await import("./scripts/i18n-voor-tests.mjs");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { PlaatToetsKaart } = await import("./src/components/panels/PlaatToetsKaart.tsx");
const { PlaatToetsRapport } = await import("./src/components/report/sections/PlateCheckSection.tsx");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
const tekst = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

if (!existsSync(TOETSBRUG)) {
  checkTrue(`toetsbrug aanwezig (${TOETSBRUG}) — bouw hem met cargo build --release -p toetsbrug`, false);
  log(`\n${passed} geslaagd, ${failed} mislukt`);
  process.exit(1);
}
const invoer = [
  { plate_id: 1, soort: "Staal", materiaal: "S355", thickness_mm: 50,
    combinations: [{ combination_id: 4, elements: [
      { element_id: 7, sigma_x_mpa: 150, sigma_y_mpa: -80, tau_xy_mpa: 60 },
      { element_id: 8, sigma_x_mpa: 0, sigma_y_mpa: 0, tau_xy_mpa: 10 },
    ] }] },
  { plate_id: 2, soort: "Kruislaaghout", materiaal: "CLT C24 40/20/40", thickness_mm: 100, combinations: [] },
  // Beton, zuivere afschuiving τ = 3: bijlage F (F.2)/(F.3) f'_td = 3 N/mm² in
  // beide richtingen → n_td = 3·200 = 600 kN/m.
  { plate_id: 4, soort: "Beton", materiaal: "C30/37", thickness_mm: 200,
    combinations: [{ combination_id: 4, elements: [
      { element_id: 1, sigma_x_mpa: 0, sigma_y_mpa: 0, tau_xy_mpa: 3 },
    ] }] },
  // Hout C24, vezel verticaal (90°), σ_x = 0,2 → σ₂ = 0,2 N/mm² trek loodrecht
  // op de vezel: niet getoetst (6.1.3), status N/A.
  { plate_id: 5, soort: "Hout", materiaal: "C24", thickness_mm: 100, hoofdrichting_graden: 90,
    service_class: "Sc1",
    load_duration_per_combination: [{ combination_id: 4, load_duration: "MediumTerm" }],
    combinations: [{ combination_id: 4, elements: [
      { element_id: 2, sigma_x_mpa: 0.2, sigma_y_mpa: -1, tau_xy_mpa: 0 },
    ] }] },
];
const r = spawnSync(TOETSBRUG, [], { input: JSON.stringify({ opdracht: "check_plates", inputs: invoer }), encoding: "utf8" });
const res = JSON.parse(r.stdout);
checkTrue("kern antwoordt met vier platen", Array.isArray(res) && res.length === 4, r.stdout.slice(0, 200));

log("\n[a] kaart van een getoetste plaat");
{
  const t = tekst(renderToStaticMarkup(React.createElement(PlaatToetsKaart, { result: res[0] })));
  checkTrue("UC 0.68 in de kop", t.includes("0.68"), t);
  checkTrue("maatgevend element 7 in combinatie 4", t.includes("element 7 in combinatie 4"), t);
  checkTrue("plooi als niet uitgevoerd, zonder openklappen", t.includes("Plooi van plaatvelden"), t);
  checkTrue("norm in de kop", t.includes("1993-1-1"), t);
}

log("\n[b] kaart van een geweigerde plaat");
{
  const t = tekst(renderToStaticMarkup(React.createElement(PlaatToetsKaart, { result: res[1] })));
  checkTrue("reden staat er", t.includes("kruislaaghout"), t);
  checkTrue("geen unity check", !/\b0\.00\b/.test(t) && !t.includes("cp-card-uc"), t);
}

log("\n[b2] kaart van een betonnen plaat");
{
  const t = tekst(renderToStaticMarkup(React.createElement(PlaatToetsKaart, { result: res[2] })));
  checkTrue("benodigde wapening zonder openklappen", t.includes("Benodigde wapening") && t.includes("600"), t);
}

log("\n[c] rapportsectie");
{
  const html = renderToStaticMarkup(React.createElement(PlaatToetsRapport, {
    plateResults: res,
    plateSkipped: [{ plateId: 3, reason: "geen materiaal — test" }],
    lastRunAt: null,
    gedetailleerd: true,
    aantalPlaten: 4,
    combinations: [{ id: 4, name: "UGT 6.10b" }],
  }));
  const t = tekst(html);
  checkTrue("titel Toetsing platen", t.includes("Toetsing platen"), t.slice(0, 200));
  checkTrue("UC 0,68 in het overzicht", t.includes("0,68"), t);
  checkTrue("combinatienaam in plaats van nummer", t.includes("UGT 6.10b"), t);
  checkTrue("weigering met reden", t.includes("kruislaaghout als plaat wordt niet getoetst"), t);
  checkTrue("overgeslagen plaat met reden", t.includes("geen materiaal — test"), t);
  checkTrue("afleiding met artikel", t.includes("6.2.1(5)"), t);
  checkTrue("krachtregel zonder snedekrachten", !t.includes("kNm"), t);
  checkTrue("niet getoetst: plooi met reden", t.includes("NEN-EN 1993-1-5"), t);
  checkTrue("benodigde wapening in het rapport", t.includes("Benodigde wapening volgens bijlage F") && t.includes("600"), t);
}

log("\n[d] zonder platen");
{
  const html = renderToStaticMarkup(React.createElement(PlaatToetsRapport, {
    plateResults: [], plateSkipped: [], lastRunAt: null, gedetailleerd: true, aantalPlaten: 0, combinations: [],
  }));
  checkTrue("lege-modelmelding", tekst(html).includes("Geen platen"), tekst(html));
}

log("\n[e] redenen voor niet getoetst: trek loodrecht op de vezel en kruislaaghout");
{
  const hout = res[3];
  const trek90 = hout?.niet_getoetst?.find((n) => n.id === "6.1.3_trek_loodrecht");
  checkTrue("kern geeft 6.1.3 als niet getoetst", trek90 !== undefined, JSON.stringify(hout?.niet_getoetst));
  checkTrue("status van de houtplaat is n.v.t.", hout?.status === "NotApplicable", hout?.status);
  for (const w of ["6.1.3(1)P", "k_vol", "(6.51)", "6.4.3(6)", "geen uitdrukking", "niet optreedt"]) {
    checkTrue(`reden 6.1.3 noemt ${w}`, trek90?.reden.includes(w) ?? false, trek90?.reden);
  }
  for (const w of ["normgrondslag", "productnorm", "ETA", "invoerveld"]) {
    checkTrue(`weigering kruislaaghout noemt ${w}`, res[1]?.geweigerd?.includes(w) ?? false, res[1]?.geweigerd);
  }

  const kaart = tekst(renderToStaticMarkup(React.createElement(PlaatToetsKaart, { result: hout })));
  checkTrue("kaart: titel 6.1.3", kaart.includes("Trek loodrecht op de vezel (6.1.3)"), kaart);
  const kaartClt = tekst(renderToStaticMarkup(React.createElement(PlaatToetsKaart, { result: res[1] })));
  checkTrue("kaart kruislaaghout: ETA en invoerveld", kaartClt.includes("ETA") && kaartClt.includes("invoerveld"), kaartClt);

  const html = renderToStaticMarkup(React.createElement(PlaatToetsRapport, {
    plateResults: res, plateSkipped: [], lastRunAt: null, gedetailleerd: false,
    aantalPlaten: 4, combinations: [{ id: 4, name: "UGT 6.10b" }],
  }));
  // Terug naar platte tekst, met de entiteiten die renderToStaticMarkup zet.
  const ont = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  const t = ont(tekst(html));
  const plat = (s) => s.replace(/\s+/g, " ");
  checkTrue("rapport: reden 6.1.3 woordelijk", t.includes(plat(trek90?.reden ?? "∅")), t.slice(0, 300));
  checkTrue("rapport: weigering kruislaaghout woordelijk", t.includes(plat(res[1]?.geweigerd ?? "∅")), t.slice(0, 300));
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
