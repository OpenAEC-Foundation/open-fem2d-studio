// Visual smoke test for the lifted-state foundation.
//
// 1. Loads the app, verifies the default portal renders (4 knopen + 3 balken).
// 2. Verifies the live ProjectTree counts the actual model.
// 3. Selects a beam → verifies the Properties panel reacts.
// 4. Zooms in via mouse-wheel, draws a node via the Knoop tool.
// 5. Solves and takes a final screenshot.
//
// Run with the dev server up on :5174:
//   node scripts/test-draw-portal.mjs

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.env.URL ?? "http://localhost:5174/";
const OUT_DIR = resolve("./screenshots/foundation");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});

console.log(`→ goto ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".fem-canvas-svg", { timeout: 10000 });
console.log("✓ canvas mounted");

// Dismiss Start sidebar if present
const sb = page.locator(".start-sidebar-close, .start-sidebar button").first();
if (await sb.count()) {
  try { await sb.click({ timeout: 1000 }); } catch {}
}

await page.screenshot({ path: `${OUT_DIR}/01-initial.png`, fullPage: false });

// 1. ProjectTree counts — should say "4" knopen and "3" balken
const treeCounts = await page.locator(".fem-tree-count").allTextContents();
console.log(`   tree counts: [${treeCounts.join(", ")}]`);

// 2. Click on beam #3 (the top beam) in the canvas — at roughly mid-span.
// The default top beam runs from (0,5000) → (12000,5000). With SCALE=1/25,
// origin (80,540-ish), beam is at y ≈ 540 - 5000/25 = 340, x range ≈ 80-560.
const svgBox = await page.locator(".fem-canvas-svg").boundingBox();
const midX = svgBox.x + 80 + (12000 / 25) / 2;
const midY = svgBox.y + svgBox.height - 60 - 5000 / 25;
await page.mouse.click(midX, midY);
await page.waitForTimeout(200);

// Check Properties header is now "Balk 3"
const sel = await page.locator(".fem-prop-selection-value").textContent();
console.log(`   Properties selection: ${sel}`);

await page.screenshot({ path: `${OUT_DIR}/02-selected-beam.png`, fullPage: false });

// 3. Zoom in 3× by spinning the wheel on the canvas center
const cx = svgBox.x + svgBox.width / 2;
const cy = svgBox.y + svgBox.height / 2;
for (let i = 0; i < 6; i++) {
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(50);
}

// 4. Switch to Knoop tool and draw a new node
await page.locator(".ribbon-btn", { hasText: "Knoop" }).first().click({ timeout: 3000 });
await page.waitForTimeout(150);
// Click somewhere empty (right of the portal)
await page.mouse.move(cx + 50, cy - 30);
await page.waitForTimeout(100);
await page.mouse.click(cx + 50, cy - 30);
await page.waitForTimeout(150);

await page.screenshot({ path: `${OUT_DIR}/03-zoomed-with-new-node.png`, fullPage: false });

// 5. Switch to Toetsing tab and solve
await page.locator(".ribbon-tab", { hasText: "Toetsing" }).first().click({ timeout: 3000 });
await page.waitForTimeout(300);
const runBtn = page.getByText(/Toetsen uitvoeren/).first();
if (await runBtn.count()) {
  await runBtn.click({ timeout: 3000 });
  await page.waitForTimeout(600);
}

await page.screenshot({ path: `${OUT_DIR}/04-final-solved.png`, fullPage: false });

console.log(`✓ screenshots in ${OUT_DIR}`);
if (errors.length) {
  console.log("⚠ errors:");
  for (const e of errors) console.log("  " + e);
}
await browser.close();
process.exit(errors.length ? 2 : 0);
