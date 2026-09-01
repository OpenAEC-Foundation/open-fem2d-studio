import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});
const errors = [];
const consoleMsgs = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('console', m => consoleMsgs.push('[' + m.type() + '] ' + m.text()));
await page.goto('http://localhost:1420', { waitUntil: 'load', timeout: 15000 }).catch(e => errors.push('NAV: ' + e.message));
await page.waitForTimeout(2500);
const rootHtml = await page.evaluate(() => {
  const r = document.getElementById('root');
  return { len: r?.innerHTML.length, firstClass: r?.firstElementChild?.className, body: document.body.innerText.slice(0, 200) };
});
console.log('=== ROOT STATE ===');
console.log(JSON.stringify(rootHtml, null, 2));
console.log('=== PAGE ERRORS (' + errors.length + ') ===');
errors.slice(0, 10).forEach(e => console.log(e.slice(0, 800)));
console.log('=== CONSOLE ERROR/WARN (' + consoleMsgs.filter(m => /\[(error|warning)\]/i.test(m)).length + ') ===');
consoleMsgs.filter(m => /\[(error|warning)\]/i.test(m)).slice(0, 10).forEach(m => console.log(m.slice(0, 600)));
await browser.close();
