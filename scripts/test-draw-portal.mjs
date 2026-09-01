import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const OUT = join(process.env.LOCALAPPDATA, 'Temp', 'fem-mockup-draw');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null), transformCallback: () => 0 };
  window.__TAURI__ = { invoke: () => Promise.resolve(null), event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:5174', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);

// Find the SVG canvas
const svg = page.locator('.fem-canvas-svg').first();
const box = await svg.boundingBox();
console.log('canvas box:', JSON.stringify(box));

// Default model is already loaded — first verify
await page.screenshot({ path: join(OUT, '01-initial.png') });

// Click "Knoop" small button to switch to addNode
await page.locator('button:has-text("Knoop")').first().click({ timeout: 3000 }).catch(e => console.log('Knoop click:', e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, '02-after-node-tool.png') });

// Add 3 new nodes by clicking the canvas at 3 spots
if (box) {
  await svg.click({ position: { x: 400, y: 200 } });
  await page.waitForTimeout(300);
  await svg.click({ position: { x: 600, y: 200 } });
  await page.waitForTimeout(300);
  await svg.click({ position: { x: 500, y: 100 } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '03-after-3-nodes.png') });
}

// Switch to addBeam, draw beams between new nodes
await page.locator('button:has-text("Balk")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(500);

if (box) {
  // Click two existing model nodes
  await svg.click({ position: { x: 400, y: 200 } });
  await page.waitForTimeout(300);
  await svg.click({ position: { x: 600, y: 200 } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '04-after-beam-draw.png') });
}

console.log('done. shots in', OUT);
await browser.close();
