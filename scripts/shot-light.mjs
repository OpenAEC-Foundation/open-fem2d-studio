import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
  localStorage.setItem('fem2d-theme', 'light');
  document.documentElement.dataset.theme = 'light';
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);
// Force light theme via direct attribute too
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light';
  const shell = document.querySelector('.oa-app-shell');
  if (shell) shell.setAttribute('data-theme', 'light');
});
await page.waitForTimeout(500);
const out = process.env.LOCALAPPDATA + '\\Temp\\openaec-ui-light\\01-app.png';
import('node:fs').then(fs => fs.mkdirSync(process.env.LOCALAPPDATA + '\\Temp\\openaec-ui-light', { recursive: true }));
await page.screenshot({ path: out });
console.log('SHOT', out);
await browser.close();
