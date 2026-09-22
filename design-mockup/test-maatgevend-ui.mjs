// Het toetsingspaneel met "wat is maatgevend" in Chromium (issue #41):
// modeloverzicht, samenvattingsregel per kaart, de toetslijst met balkjes, de
// keuze van de volgorde en de klik naar het tekenvlak. De afleiding zelf staat
// in test-maatgevend.mjs.
//
// Schermafbeeldingen (licht en donker thema) komen er alleen als de
// omgevingsvariabele MAATGEVEND_SCHERMAFBEELDINGEN een map noemt; ze horen niet
// in de repo.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const browser = [process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium vereist; stel OPENAEC_BROWSER in");
const beeldmap = process.env.MAATGEVEND_SCHERMAFBEELDINGEN;
const folder = mkdtempSync(join(tmpdir(), "maatgevend-ui-"));
try {
  const styles = ["src/themes.css", "src/App.css", "node_modules/katex/dist/katex.min.css", "src/components/panels/CheckPanel.css"]
    .map((path) => readFileSync(path, "utf8")).join("\n");
  const pagina = async (thema) => {
    const bundle = await build({ entryPoints: ["scripts/maatgevend-browser.tsx"], bundle: true, write: false,
      format: "iife", platform: "browser", jsx: "automatic", external: ["fs", "path"],
      define: { "process.env.NODE_ENV": '"production"', THEMA: JSON.stringify(thema) },
      loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" } });
    const html = join(folder, `test-${thema}.html`);
    writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>' + styles +
      "html,body{margin:0;height:auto}#test-root{width:860px;height:2000px}#uitslag{display:none}" +
      '</style><div id="test-root"></div><pre id="uitslag"></pre><script>' +
      bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>");
    return html;
  };
  const vlaggen = (thema) => ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(folder, "profiel-" + thema)}`, "--window-size=860,2000", "--virtual-time-budget=12000"];

  const html = await pagina("light");
  const result = spawnSync(browser, [...vlaggen("light"), "--dump-dom", pathToFileURL(html).href],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
  assert.equal(report.error, null, report.error);
  assert.equal(report.tests.filter((t) => t.error).length, 0, "Regressies in het toetsingspaneel");

  if (beeldmap) {
    mkdirSync(beeldmap, { recursive: true });
    for (const [thema, naam] of [["light", "toetsingspaneel-licht.png"], ["openaec", "toetsingspaneel-donker.png"]]) {
      const doel = join(beeldmap, naam);
      spawnSync(browser, [...vlaggen(thema + "-beeld"), `--screenshot=${doel}`, pathToFileURL(await pagina(thema)).href],
        { encoding: "utf8", timeout: 60_000 });
      assert.ok(existsSync(doel), `schermafbeelding ontbreekt: ${doel}`);
      console.log(`  schermafbeelding: ${doel}`);
    }
  }
  console.log(`${report.tests.length} geslaagd, 0 gefaald`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
