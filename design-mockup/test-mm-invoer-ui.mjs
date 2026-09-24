// Echte React-formulieren in een lokale, headless browser; geen webserver.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { startBrowser } from "./scripts/headlessBrowser.mjs";

const browser = [
  process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(browser, "Chromium-browser vereist; stel eventueel OPENAEC_BROWSER in");
const folder = mkdtempSync(join(tmpdir(), "mm-invoer-ui-"));
try {
  const bundle = await build({
    entryPoints: ["scripts/mm-invoer-browser.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic",
    // Niet-uitgevoerde Node-tak van triangle-wasm, zoals Vite hem externaliseert.
    external: ["fs", "path"],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "private-formulieren-testen",
      setup(builder) {
        builder.onLoad({ filter: /FemCanvas\.tsx$/ }, args => ({
          // Alleen de testbundel krijgt toegang tot bestaande formulierfuncties.
          contents: readFileSync(args.path, "utf8") +
            "\nexport { DimEditForm, PopoverLineLoadForm, PopoverEdgeLoadForm, PopoverPointLoadForm };",
          loader: "tsx",
        }));
      },
    }],
  });
  const html = join(folder, "test.html");
  const inputStyles = ["src/lib/wind/WindGeneratorDialog.css", "src/components/fem/LoadCaseTabBar.css"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>' + inputStyles +
    '.fem-canvas-wrap{width:1000px;height:600px}</style><div id="root"></div><pre id="uitslag"></pre><script>' +
    bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>");
  const result = startBrowser(browser, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(folder, "profiel")}`, "--virtual-time-budget=10000",
    "--dump-dom", pathToFileURL(html).href,
  ], { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  const match = /<pre id="uitslag">([^<]*)<\/pre>/.exec(result.stdout ?? "");
  assert.ok(match?.[1], result.error?.message ?? result.stderr?.slice(0, 1500) ?? "Geen browserresultaat");
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  for (const line of report.tests) console.log("  ok  " + line);
  assert.equal(report.error, null, report.error);
  console.log(`${report.tests.length} geslaagd, 0 gefaald (${basename(browser)})`);
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
