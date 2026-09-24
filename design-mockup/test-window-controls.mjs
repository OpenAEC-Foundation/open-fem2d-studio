// Echte titelbalk en Tauri-client, met alleen de native IPC-grens vervangen.
// De sluitroute moet toegestaan zijn door de daadwerkelijk gebundelde capability.
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
const capabilities = JSON.parse(readFileSync("../src-tauri/capabilities/default.json", "utf8"));
const folder = mkdtempSync(join(tmpdir(), "window-controls-"));
try {
  const bundle = await build({ entryPoints: ["scripts/window-controls-browser.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"', WINDOW_PERMISSIONS: JSON.stringify(capabilities.permissions) } });
  const html = join(folder, "test.html");
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="uitslag"></pre><script>' +
    bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>");
  const result = startBrowser(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(folder, "profiel")}`, "--virtual-time-budget=12000", "--dump-dom", pathToFileURL(html).href],
    { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const item of report.tests) console.log(`  ${item.error ? "FAIL" : "ok"} ${item.name}${item.error ? ": " + item.error : ""}`);
  assert.equal(report.error, undefined, report.error);
  assert.equal(report.tests.filter(t => t.error).length, 0, "Vensterbediening regressies");
  console.log(`${report.tests.length} geslaagd, 0 gefaald`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
