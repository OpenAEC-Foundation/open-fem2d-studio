import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const browser = [process.env.OPENAEC_BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium vereist (OPENAEC_BROWSER)");
const folder = mkdtempSync(join(tmpdir(), "beton-bediening-"));
try {
  const bundle = await build({ entryPoints: ["scripts/beton-bediening-browser.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", external: ["fs", "path"],
    define: { "process.env.NODE_ENV": '"production"' }, loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" } });
  const css = ["src/App.css", "src/components/Modal.css", "src/components/beton/beton.css", "src/components/beton/dekking/dekking.css"].map(p => readFileSync(p, "utf8")).join("\n");
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>' + css + '</style><div id="test-root"></div><pre id="uitslag"></pre><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + '</script>');
  const result = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(folder, "profile")}`, "--window-size=1280,900", "--virtual-time-budget=10000", "--dump-dom", pathToFileURL(html).href], { encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr);
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const t of report.tests) console.log(`${t.error ? "FAIL" : "ok"} ${t.name}${t.error ? ": " + t.error : ""}`);
  assert.equal(report.error, null);
  assert.equal(report.tests.filter(t => t.error).length, 0, "Betonbediening regressies");
  console.log(`${report.tests.length} geslaagd`);
} finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
