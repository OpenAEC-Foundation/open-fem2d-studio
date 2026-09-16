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
];
const r = spawnSync(TOETSBRUG, [], { input: JSON.stringify({ opdracht: "check_plates", inputs: invoer }), encoding: "utf8" });
const res = JSON.parse(r.stdout);
checkTrue("kern antwoordt met twee platen", Array.isArray(res) && res.length === 2, r.stdout.slice(0, 200));

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

log("\n[c] rapportsectie");
{
  const html = renderToStaticMarkup(React.createElement(PlaatToetsRapport, {
    plateResults: res,
    plateSkipped: [{ plateId: 3, reason: "geen materiaal — test" }],
    lastRunAt: null,
    gedetailleerd: true,
    aantalPlaten: 3,
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
}

log("\n[d] zonder platen");
{
  const html = renderToStaticMarkup(React.createElement(PlaatToetsRapport, {
    plateResults: [], plateSkipped: [], lastRunAt: null, gedetailleerd: true, aantalPlaten: 0, combinations: [],
  }));
  checkTrue("lege-modelmelding", tekst(html).includes("Geen platen"), tekst(html));
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
