// Werkelijke betonformulieren, async resultaten en paneelindeling in Chromium.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const folder = mkdtempSync(join(tmpdir(), "beton-ui-"));
try {
  const bundle = await build({ entryPoints: ["scripts/beton-ui-browser.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", external: ["fs", "path"],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" } });
  const styles = ["src/App.css", "src/components/fem/FemProperties.css", "src/components/beton/beton.css"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>' + styles +
    '</style><div id="test-root"></div><pre id="uitslag"></pre><script>' +
    bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>");
  const result = startBrowser(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(folder, "profiel")}`, "--window-size=1280,900", "--virtual-time-budget=12000",
    "--dump-dom", pathToFileURL(html).href], { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
  assert.equal(report.error, null, report.error);
  assert.equal(report.tests.filter(t => t.error).length, 0, "Beton-UI regressies");
  console.log(`${report.tests.length} geslaagd, 0 gefaald`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
