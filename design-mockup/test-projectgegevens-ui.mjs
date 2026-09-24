// Het venster Projectgegevens in een lokale headless browser (issue #50): de
// uitleg bij toegepaste normen, gevolgklasse, windgebied en terreincategorie
// staat in een InfoTip (in nl/en/de/fr, niets verloren), de korte status over
// de huidige keuze blijft als één grijze regel, en het venster loopt nergens
// horizontaal over — niet op de standaardgrootte en niet in een smal venster.
// Het gedrag van de tip zelf bewaakt test-eigenschappen-ui.mjs.
//
// Schermafbeeldingen: zet PROJECTGEGEVENS_SCHERMAFBEELDINGEN op een bestaande
// map en de test schrijft daar licht.png, licht-onder.png, smal.png, donker.png
// en tip-open.png (SCHERMAFBEELDING_VOORVOEGSEL zet er desgewenst iets voor).
// Met ALLEEN_SCHERMAFBEELDINGEN erbij alleen de beelden, zonder testreeks.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startBrowser } from "./scripts/headlessBrowser.mjs";

const browser = [process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium-browser vereist; stel eventueel OPENAEC_BROWSER in");
const folder = mkdtempSync(join(tmpdir(), "projectgegevens-ui-"));
try {
  const bundle = await build({
    absWorkingDir: dirname(fileURLToPath(import.meta.url)),
    entryPoints: ["scripts/projectgegevens-browser.tsx"], bundle: true, write: false,
    outfile: join(folder, "test.js"), format: "iife", platform: "browser", jsx: "automatic",
    external: ["fs", "path"],
    loader: { ".svg": "dataurl", ".png": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  for (const file of bundle.outputFiles) writeFileSync(file.path, file.contents);
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="test.css"></head><body><div id="root"></div>' +
    '<pre id="uitslag"></pre><script src="test.js"></script></body></html>');
  const chromium = (extra, doel, venster) => startBrowser(browser, ["--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(folder, "profiel")}`,
    `--window-size=${venster}`, "--virtual-time-budget=10000", ...extra, doel,
  ], { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  const url = pathToFileURL(html).href;

  const map = process.env.PROJECTGEGEVENS_SCHERMAFBEELDINGEN;
  if (map) {
    assert.ok(existsSync(map), `map voor schermafbeeldingen bestaat niet: ${map}`);
    for (const [naam, beeld, venster] of [["licht", "licht", "1220,1100"], ["licht-onder", "licht-onder", "1220,1100"],
      ["smal", "licht-onder&venster=smal", "600,1100"], ["donker", "donker-onder", "1220,1100"], ["tip-open", "tip-open", "1220,1100"]]) {
      const pad = join(map, `${process.env.SCHERMAFBEELDING_VOORVOEGSEL ?? ""}${naam}.png`);
      chromium([`--screenshot=${pad}`, "--hide-scrollbars"], `${url}#beeld=${beeld}`, venster);
      assert.ok(existsSync(pad), `schermafbeelding niet gemaakt: ${pad}`);
      console.log(`  schermafbeelding: ${pad}`);
    }
  }
  if (!(map && process.env.ALLEEN_SCHERMAFBEELDINGEN)) {
    let totaal = 0;
    // Standaardgrootte en een smal venster (een iframe van 360 px; zie de browserkant).
    for (const [venster, hash] of [["1220,900", ""], ["1220,800", "#venster=smal"]]) {
      totaal += testreeks(chromium(["--dump-dom"], `${url}${hash}`, venster));
    }
    console.log(`${totaal} geslaagd, 0 gefaald (${basename(browser)})`);
  }
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function testreeks(result) {
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
  assert.equal(report.error, null, report.error);
  assert.equal(report.tests.filter((t) => t.error).length, 0, "Projectgegevens-UI regressies");
  return report.tests.length;
}
