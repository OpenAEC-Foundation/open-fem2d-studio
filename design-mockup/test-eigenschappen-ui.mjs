// Het eigenschappenpaneel van een staaf in een lokale headless browser
// (issues #43 en #44): uitleg in een InfoTip (hover, focus, klik/tik, Esc,
// aria-describedby), korte status en waarschuwingen blijven zichtbaar, geen
// uitlegtekst verloren; en het vinkje "Onder en boven gelijk" bij de
// kipsteunen (detectie bij openen, één invoer, één undo-stap, uitzetten wist
// niets). De plaatsing van de tip bewaakt ook test-infotip-plaats.mjs, de
// logica van het vinkje test-kipsteunen-gelijk.mjs.
//
// Schermafbeeldingen: zet EIGENSCHAPPEN_SCHERMAFBEELDINGEN op een bestaande map
// en de test schrijft daar staal-licht.png, hout-licht.png, staal-donker.png en
// tip-open.png. Zonder die variabele worden er geen bestanden gemaakt.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { startBrowser } from "./scripts/headlessBrowser.mjs";

const browser = [process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium-browser vereist; stel eventueel OPENAEC_BROWSER in");
const folder = mkdtempSync(join(tmpdir(), "eigenschappen-ui-"));
try {
  const bundle = await build({
    absWorkingDir: dirname(fileURLToPath(import.meta.url)),
    entryPoints: ["scripts/eigenschappen-browser.tsx"], bundle: true, write: false,
    outfile: join(folder, "test.js"), format: "iife", platform: "browser", jsx: "automatic",
    // Niet-uitgevoerde Node-tak van triangle-wasm, zoals Vite hem externaliseert.
    external: ["fs", "path"],
    loader: { ".svg": "dataurl", ".png": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  for (const file of bundle.outputFiles) writeFileSync(file.path, file.contents);
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="test.css"></head><body><div id="root"></div>' +
    '<pre id="uitslag"></pre><script src="test.js"></script></body></html>');
  const chromium = (extra, doel, venster = "1220,900") => startBrowser(browser, ["--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(folder, "profiel")}`,
    `--window-size=${venster}`, "--virtual-time-budget=10000", ...extra, doel,
  ], { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });

  const map = process.env.EIGENSCHAPPEN_SCHERMAFBEELDINGEN;
  if (map) {
    assert.ok(existsSync(map), `map voor schermafbeeldingen bestaat niet: ${map}`);
    for (const [beeld, venster] of [["staal-licht", "280,1500"], ["hout-licht", "280,1500"],
      ["staal-donker", "280,1500"], ["tip-open", "280,700"]]) {
      const pad = join(map, `${beeld}.png`);
      chromium([`--screenshot=${pad}`, "--hide-scrollbars", "--force-device-scale-factor=2"],
        `${pathToFileURL(html).href}#beeld=${beeld}`, venster);
      assert.ok(existsSync(pad), `schermafbeelding niet gemaakt: ${pad}`);
      console.log(`  schermafbeelding: ${pad}`);
    }
  }
  // ALLEEN_SCHERMAFBEELDINGEN: alleen de beelden (bijv. van een oudere stand
  // van het paneel, om vóór en na te vergelijken), zonder de testreeks.
  if (!(map && process.env.ALLEEN_SCHERMAFBEELDINGEN)) await testreeks(chromium, pathToFileURL(html).href);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function testreeks(chromium, url) {
  const result = chromium(["--dump-dom"], url);
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
  assert.equal(report.error, null, report.error);
  assert.equal(report.tests.filter((t) => t.error).length, 0, "Eigenschappenpaneel-UI regressies");
  console.log(`${report.tests.length} geslaagd, 0 gefaald (${basename(browser)})`);
}
