// Headless screenshots of the running app for visual smoke + comparison.
// Usage: node scripts/smoke-screenshots.mjs  (requires vite dev on :1420)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT_DIR ?? join(process.cwd(), '..', '..', '..', 'AppData', 'Local', 'Temp', 'openaec-ui-shots');
const URL = process.env.APP_URL ?? 'http://localhost:1420';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

// Stub the Tauri runtime so the app doesn't crash on every effect
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});

page.on('pageerror', () => {}); // suppress error spam

console.log('navigating to', URL);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('nav warning:', e.message));

// Let React finish first render
await page.waitForTimeout(2000);

async function shot(name, sel) {
  const path = join(OUT, name + '.png');
  if (sel) {
    const el = await page.$(sel);
    if (el) {
      await el.screenshot({ path });
      console.log('SHOT', name, '->', path);
      return;
    }
  }
  await page.screenshot({ path, fullPage: false });
  console.log('SHOT', name, '->', path);
}

// 1. Full app first-load
await shot('01-app-first-load');

// 2. Ribbon
await shot('02-ribbon-area', '.oa-ribbon, [class*="ribbon"]');

// 3. TitleBar
await shot('03-titlebar', '[class*="title-bar"], [class*="TitleBar"], header');

// 4. StatusBar
await shot('04-statusbar', '[class*="status-bar"], [class*="StatusBar"]');

// 5. Geometry tab — click + screenshot
const tabs = await page.$$('[role="tab"], .oa-ribbon-tab, [class*="ribbon-tab"]');
console.log('found ribbon tabs:', tabs.length);

async function clickTab(label) {
  const t = await page.locator(`button:has-text("${label}"), [role="tab"]:has-text("${label}")`).first();
  if (await t.count()) {
    await t.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

for (const label of ['Home', 'Geometry', 'Loads', 'Analyze', 'Check', 'View']) {
  const ok = await clickTab(label);
  await shot(`05-tab-${label.toLowerCase()}`);
  console.log('tab', label, ok ? 'clicked' : 'not found');
}

// 6. Open Backstage (File tab)
const fileTab = await page.locator('button:has-text("File"), [class*="file-tab"]').first();
if (await fileTab.count()) {
  await fileTab.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot('06-backstage');
  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// 7. Theme switch via prefers-color-scheme emulation
await ctx.emulateColorScheme && await ctx.emulateColorScheme('dark');
await page.waitForTimeout(300);
await shot('07-dark-theme-hint');

await browser.close();
console.log('done. wrote', OUT);
