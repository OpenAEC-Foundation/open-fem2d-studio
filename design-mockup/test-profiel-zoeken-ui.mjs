// De profielkiezer met zoekveld in Chromium (issue #39): focus bij openen,
// treffers over alle reeksen, pijltjes/Enter/Esc, de lege toestand, "In dit
// project" in de profielstap, het verlopende profiel en een smal venster.
//
// De zoekREGELS zelf staan in test-profiel-zoeken.mjs (pure functie); deze test
// bewaakt wat alleen een browser kan laten zien: waar de focus staat, of Esc
// het venster echt met rust laat, en of de indeling past.
//
// Schermafbeeldingen (licht en donker) worden alleen gemaakt als
// OPENAEC_SCHERMAFBEELDINGEN naar een map wijst — buiten de repo.
//
// Draaien met: node test-profiel-zoeken-ui.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { startBrowser } from "./scripts/headlessBrowser.mjs";

const browser = [process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium vereist; stel OPENAEC_BROWSER in");

const folder = mkdtempSync(join(tmpdir(), "profiel-zoeken-ui-"));
let profielNr = 0;
const basisArgs = () => ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--hide-scrollbars", `--user-data-dir=${join(folder, `profiel-${(profielNr += 1)}`)}`];

try {
  const bundle = await build({ entryPoints: ["scripts/profiel-zoeken-browser.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", external: ["fs", "path"],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" } });
  // De echte stylesheets: zonder thema-tokens en Modal.css zegt een
  // indelingscontrole niets.
  const styles = ["src/themes.css", "src/App.css", "src/components/Modal.css", "src/components/fem/ProfielKiezer.css"]
    .map((path) => readFileSync(path, "utf8")).join("\n");
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><html data-theme="light"><meta charset="utf-8"><style>' + styles +
    '</style><div id="test-root"></div><pre id="uitslag"></pre><script>' +
    bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script></html>");
  const url = pathToFileURL(html).href;

  // 560 breed: smaller dan de 860 van de media query, en breder dan de
  // minimale vensterbreedte van headless Chromium (ca. 500) — daaronder knipt
  // de schermafbeelding een venster af dat in werkelijkheid breder is.
  let totaal = 0;
  for (const [stand, venster] of [["", "1280,900"], ["#smal", "560,760"]]) {
    const result = startBrowser(browser, [...basisArgs(), `--window-size=${venster}`, "--virtual-time-budget=12000",
      "--dump-dom", url + stand], { encoding: "utf8", timeout: 90_000, maxBuffer: 64 * 1024 * 1024 });
    const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
    assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
    const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
    for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
    assert.equal(report.error, null, report.error);
    assert.ok(report.tests.length > 0, `Geen tests gedraaid in stand "${stand}"`);
    assert.equal(report.tests.filter((t) => t.error).length, 0, "Profielkiezer-regressies");
    totaal += report.tests.length;
  }

  const beeldMap = process.env.OPENAEC_SCHERMAFBEELDINGEN;
  if (beeldMap) {
    mkdirSync(beeldMap, { recursive: true });
    for (const thema of ["licht", "donker"]) {
      for (const [toestand, venster] of [["start", "1100,760"], ["zoek", "1100,760"], ["leeg", "1100,760"], ["verlopend", "1100,760"], ["smal", "560,760"]]) {
        const bestand = resolve(beeldMap, `profielkiezer-${thema}-${toestand}.png`);
        startBrowser(browser, [...basisArgs(), `--window-size=${venster}`, "--virtual-time-budget=6000",
          `--screenshot=${bestand}`, `${url}#beeld-${thema}-${toestand}`], { encoding: "utf8", timeout: 90_000 });
        assert.ok(existsSync(bestand), `Schermafbeelding mislukt: ${bestand}`);
        console.log(`  beeld ${bestand}`);
      }
    }
  }
  console.log(`${totaal} geslaagd, 0 gefaald`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
