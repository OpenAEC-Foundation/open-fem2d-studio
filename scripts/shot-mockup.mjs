import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const OUT = join(process.env.LOCALAPPDATA, 'Temp', 'fem-mockup');
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
// NL labels for the 7 ribbon tabs (matches design-mockup/src/i18n/locales/nl/ribbon.json)
const tabs = ['Start', 'Tabel', 'Instellingen', 'Inzicht', 'IFC', 'Toetsing', 'Rapport'];
for (const tab of tabs) {
  const t = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
  if (await t.count()) { await t.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }
  await page.screenshot({ path: join(OUT, `tab-${tab.toLowerCase()}.png`) });
  console.log('SHOT', tab);
}
await browser.close();
