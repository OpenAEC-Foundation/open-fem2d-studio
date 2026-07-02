// Quick Playwright smoke test for the FEM solver wiring.
// Loads the running dev server, clicks the Toetsing ribbon tab, clicks
// "Toetsen uitvoeren", waits for the overlay, and screenshots the result.
//
// Run from design-mockup/  with the dev server already up on :5174:
//   node scripts/solve-screenshot.mjs
//
// IMPORTANT: this is a TEMPORARY verification helper — fine to delete after.

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.env.URL ?? "http://localhost:5174/";
const OUT_DIR = resolve("./screenshots/solver");
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

// Pre-solve screenshot.
await page.screenshot({ path: `${OUT_DIR}/01-before.png`, fullPage: false });

// Click the Toetsing tab.
console.log("→ click Toetsing tab");
const tabClicked = await page.getByRole("button", { name: /Toetsing/i }).first().click({ timeout: 3000 }).then(() => true).catch(() => false);
if (!tabClicked) {
  // Fallback: click any ribbon tab whose text contains "Toetsing"
  await page.locator(".ribbon-tab", { hasText: "Toetsing" }).first().click({ timeout: 3000 });
}
await page.waitForTimeout(400);

// Click the "Toetsen uitvoeren" button.
console.log("→ click Toetsen uitvoeren");
await page.getByText(/Toetsen uitvoeren/).first().click({ timeout: 4000 });
await page.waitForTimeout(500);

// Wait for the deflected shape to render.
await page.waitForSelector(".fem-deflected", { timeout: 4000 });
console.log("✓ deflected shape rendered");

const deflCount = await page.locator(".fem-deflected").count();
const reactCount = await page.locator(".fem-reaction-arrow").count();
const labelCount = await page.locator(".fem-force-label").count();
console.log(`   deflected polylines: ${deflCount}`);
console.log(`   reaction arrows    : ${reactCount}`);
console.log(`   force labels       : ${labelCount}`);

// Take final screenshot.
await page.screenshot({ path: `${OUT_DIR}/02-after-solve.png`, fullPage: false });
console.log(`✓ screenshots in ${OUT_DIR}`);

if (errors.length) {
  console.log("⚠ errors:");
  for (const e of errors) console.log("  " + e);
}

await browser.close();
process.exit(errors.length ? 2 : 0);
