import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const OUT = join(process.env.LOCALAPPDATA, 'Temp', 'openaec-template-live');
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
await page.goto('http://localhost:3020', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);
const tabs = ['Home', 'View', 'Tools'];
for (const tab of tabs) {
  const t = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
  if (await t.count()) { await t.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }
  await page.screenshot({ path: join(OUT, `tab-${tab.toLowerCase()}.png`) });
  console.log('SHOT', tab);
}
await browser.close();
