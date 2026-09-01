import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const hud = document.querySelector('.oa-mesh-hud-card');
  if (!hud) return { error: 'no .oa-mesh-hud-card' };
  const s = getComputedStyle(hud);
  const theme = document.documentElement.dataset.theme;
  const parentThemes = [];
  let el = hud;
  while (el) {
    if (el.dataset?.theme) parentThemes.push({ tag: el.tagName, theme: el.dataset.theme });
    el = el.parentElement;
  }
  // Group label
  const grp = document.querySelector('.ribbon-group-label');
  const grpStyle = grp ? { color: getComputedStyle(grp).color, opacity: getComputedStyle(grp).opacity, fontSize: getComputedStyle(grp).fontSize } : null;
  return {
    htmlTheme: theme,
    hudBg: s.backgroundColor,
    hudColor: s.color,
    hudBorder: s.borderColor,
    parentThemes,
    grpLabel: grpStyle,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
