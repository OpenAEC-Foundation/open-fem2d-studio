// Het belastinggeval "Eigen gewicht" in de echte tabbalk en het echte
// tekenvlak (issue #42): echte React, echte CSS en thema's, in Chromium,
// zonder webserver of rekenkern. De rekenkant staat in
// test-eigen-gewicht-geval.mjs.
//
// Met EIGEN_GEWICHT_SCHERMEN=<map> maakt de test daarnaast twee
// schermafbeeldingen (licht en donker thema) van tabbalk en tekenvlak met het
// geval "Eigen gewicht" actief. Die horen niet in de repo.
//
// Uitvoeren: node test-eigen-gewicht-ui.mjs   (vanuit design-mockup/)
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";
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
const folder = mkdtempSync(join(tmpdir(), "eigen-gewicht-ui-"));
const chromium = (extra, url) => startBrowser(browser, ["--headless=new", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", `--user-data-dir=${join(folder, "profiel")}`,
  "--virtual-time-budget=10000", ...extra, url,
], { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
try {
  const bundle = await build({
    absWorkingDir: dirname(fileURLToPath(import.meta.url)),
    entryPoints: ["scripts/eigen-gewicht-ui-browser.tsx"], bundle: true, write: false,
    outfile: join(folder, "test.js"), format: "iife", platform: "browser", jsx: "automatic",
    external: ["fs", "path"], loader: { ".svg": "dataurl", ".png": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  for (const file of bundle.outputFiles) writeFileSync(file.path, file.contents);
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="test.css"></head><body><div id="root"></div>' +
    '<pre id="uitslag" style="display:none"></pre><script src="test.js"></script></body></html>');
  const result = chromium(["--dump-dom"], pathToFileURL(html).href);
  const match = /<pre id="uitslag"[^>]*>([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const line of report.tests) console.log("  ok  " + line);
  assert.deepEqual(report.errors, [], report.errors.join("\n"));

  const schermen = process.env.EIGEN_GEWICHT_SCHERMEN;
  if (schermen) {
    for (const [thema, naam] of [["light", "licht"], ["openaec", "donker"]]) {
      const pad = resolve(schermen, `eigen-gewicht-${naam}.png`);
      const r = chromium([`--screenshot=${pad}`, "--window-size=1100,640", "--hide-scrollbars"],
        `${pathToFileURL(html).href}#toon-${thema}`);
      assert.ok(existsSync(pad), `schermafbeelding ${naam} niet gemaakt: ${r.stderr?.slice(0, 500)}`);
      console.log(`  schermafbeelding: ${pad}`);
    }
  }
  console.log(`${report.tests.length} geslaagd, 0 gefaald (${basename(browser)})`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
