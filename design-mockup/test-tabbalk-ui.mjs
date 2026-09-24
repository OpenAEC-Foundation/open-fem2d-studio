// De tabbalk met belastinggevallen in een lokale headless browser (issue #51):
// twaalf gevallen in een te smal venster. Alleen de gevallen scrollen (pijlen,
// muiswiel, slepen, toetsenbord), het actieve geval schuift vanzelf in beeld,
// de lijstknop ▾ kiest elk geval, lange namen worden afgekort en de vaste
// onderdelen (Model, Resultaten, +, eigen gewicht, analyse, φ, bijlage B,
// scheefstand) blijven staan. De rekenregels bewaakt test-tabbalk-scroll.mjs.
//
// Schermafbeeldingen: zet TABBALK_SCHERMAFBEELDINGEN op een bestaande map en
// de test schrijft daar balk.png, midden.png, lijst.png en lijst-donker.png
// (SCHERMAFBEELDING_VOORVOEGSEL zet er desgewenst iets voor). Met
// ALLEEN_SCHERMAFBEELDINGEN erbij alleen de beelden, zonder testreeks.
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
const folder = mkdtempSync(join(tmpdir(), "tabbalk-ui-"));
// Smal genoeg dat twaalf gevallen niet passen naast de vaste onderdelen.
const VENSTER = "1280,480";
try {
  const bundle = await build({
    absWorkingDir: dirname(fileURLToPath(import.meta.url)),
    entryPoints: ["scripts/tabbalk-browser.tsx"], bundle: true, write: false,
    outfile: join(folder, "test.js"), format: "iife", platform: "browser", jsx: "automatic",
    external: ["fs", "path"],
    loader: { ".svg": "dataurl", ".png": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  for (const file of bundle.outputFiles) writeFileSync(file.path, file.contents);
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="test.css"></head><body style="margin:0"><div id="root"></div>' +
    '<pre id="uitslag"></pre><script src="test.js"></script></body></html>');
  const chromium = (extra, doel) => startBrowser(browser, ["--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(folder, "profiel")}`,
    `--window-size=${VENSTER}`, "--virtual-time-budget=10000", ...extra, doel,
  ], { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  const url = pathToFileURL(html).href;

  const map = process.env.TABBALK_SCHERMAFBEELDINGEN;
  if (map) {
    assert.ok(existsSync(map), `map voor schermafbeeldingen bestaat niet: ${map}`);
    for (const beeld of ["balk", "midden", "lijst", "lijst-donker"]) {
      const pad = join(map, `${process.env.SCHERMAFBEELDING_VOORVOEGSEL ?? ""}${beeld}.png`);
      chromium([`--screenshot=${pad}`, "--hide-scrollbars"], `${url}#beeld=${beeld}`);
      assert.ok(existsSync(pad), `schermafbeelding niet gemaakt: ${pad}`);
      console.log(`  schermafbeelding: ${pad}`);
    }
  }
  if (!(map && process.env.ALLEEN_SCHERMAFBEELDINGEN)) {
    const result = chromium(["--dump-dom"], url);
    const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
    assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
    const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
    for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
    assert.equal(report.error, null, report.error);
    assert.equal(report.tests.filter((t) => t.error).length, 0, "Tabbalk-UI regressies");
    console.log(`${report.tests.length} geslaagd, 0 gefaald (${basename(browser)})`);
  }
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
