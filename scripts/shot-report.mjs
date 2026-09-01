import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const OUT = join(process.env.LOCALAPPDATA, 'Temp', 'openaec-ui-projfix');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null), transformCallback: () => 0 };
  window.__TAURI__ = { invoke: () => Promise.resolve(null), event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420').catch(() => {});
await page.waitForTimeout(2500);
await page.locator('button:has-text("Report"), [role="tab"]:has-text("Report")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, '05-tab-report.png') });
console.log('SHOT report');
await browser.close();
