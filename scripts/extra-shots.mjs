import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.env.LOCALAPPDATA + '\\Temp\\openaec-ui-shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1800);
async function shot(name) { await page.screenshot({ path: join(OUT, name + '.png') }); console.log('SHOT', name); }
// Loads tab → click "Load Cases"
await page.locator('button:has-text("Loads"), [role="tab"]:has-text("Loads")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);
await page.locator('button:has-text("Load Cases"), button:has-text("Cases")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
await shot('08-sheet-loadcase');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// Click center canvas to try select a beam
await page.locator('canvas').first().click({ position: { x: 100, y: 200 } }).catch(() => {});
await page.waitForTimeout(400);
await shot('09-properties-empty-or-bar');
// Backstage → Preferences
await page.locator('button:has-text("File"), [class*="file-tab"]').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);
await page.locator('button:has-text("Preferences"), text=Preferences').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
await shot('10-settings-modal');
await browser.close();
