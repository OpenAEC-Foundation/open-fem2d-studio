// Visual smoke test for Step 1 features (springs, loads, undo/redo, load cases).
//
// 1. Add a Z-spring at node 1 with k=15
// 2. Switch to "Variabel (Q)" load case
// 3. Add a 10 kN point load on node 3
// 4. Ctrl+Z three times
// 5. Solve and screenshot

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.env.URL ?? "http://localhost:5174/";
const OUT_DIR = resolve("./screenshots/step1");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

console.log(`→ goto ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".fem-canvas-svg", { timeout: 10000 });

// Dismiss any sidebar
try { await page.locator(".start-sidebar button").first().click({ timeout: 600 }); } catch {}

const svgBox = await page.locator(".fem-canvas-svg").boundingBox();
// Coordinates use SCALE=1/25, origin (80, h-60)
const w2s = (x, z) => ({
  x: svgBox.x + 80 + x / 25,
  y: svgBox.y + svgBox.height - 60 - z / 25,
});

// 1. Z-Veer tool → click node 1
console.log("→ Z-Veer @ node 1");
await page.locator(".ribbon-btn", { hasText: "Z-Veer" }).first().click({ timeout: 3000 });
await page.waitForTimeout(150);
const n1 = w2s(0, 0);
await page.mouse.click(n1.x, n1.y);
await page.waitForTimeout(300);
// Popover appears — fill k=15
const kInput = page.locator(".oa-inline-popover input").first();
if (await kInput.count()) {
  await kInput.fill("15");
  await page.locator(".fem-popover-primary").click({ timeout: 1000 });
  await page.waitForTimeout(200);
}
await page.screenshot({ path: `${OUT_DIR}/01-spring-added.png` });

// 2. Switch to "Variabel (Q)" load case in the tree
console.log("→ activate Variabel (Q)");
await page.locator(".fem-tree-leaf", { hasText: "Variabel" }).first().click({ timeout: 3000 });
await page.waitForTimeout(200);

// 3. Add a Puntlast at node 3 → top-left
console.log("→ Puntlast @ node 3");
await page.locator(".ribbon-btn", { hasText: "Puntlast" }).first().click({ timeout: 3000 });
await page.waitForTimeout(150);
const n3 = w2s(0, 5000);
await page.mouse.click(n3.x, n3.y);
await page.waitForTimeout(300);
// Popover for Fx/Fz
const fxInput = page.locator(".oa-inline-popover input").first();
const fzInput = page.locator(".oa-inline-popover input").last();
if (await fxInput.count()) {
  await fxInput.fill("8");
  await fzInput.fill("-12");
  await page.locator(".fem-popover-primary").click({ timeout: 1000 });
  await page.waitForTimeout(200);
}
await page.screenshot({ path: `${OUT_DIR}/02-pointload-added.png` });

// 4. Solve via Toetsing tab
console.log("→ solve");
await page.locator(".ribbon-tab", { hasText: "Toetsing" }).first().click({ timeout: 3000 });
await page.waitForTimeout(300);
const runBtn = page.getByText(/Toetsen uitvoeren/).first();
if (await runBtn.count()) {
  await runBtn.click({ timeout: 3000 });
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${OUT_DIR}/03-solved-with-Q-case.png` });

// 5. Ctrl+Z to undo last change
console.log("→ Ctrl+Z x3");
await page.keyboard.press("Control+Z");
await page.waitForTimeout(100);
await page.keyboard.press("Control+Z");
await page.waitForTimeout(100);
await page.keyboard.press("Control+Z");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT_DIR}/04-after-undo.png` });

console.log(`✓ screenshots in ${OUT_DIR}`);
await browser.close();
