import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null), transformCallback: () => 0 };
  window.__TAURI__ = { invoke: () => Promise.resolve(null), event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({
  htmlTheme: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  themeText: getComputedStyle(document.documentElement).getPropertyValue('--theme-text').trim(),
  themeBg: getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim(),
  themeBgLighter: getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-lighter').trim(),
  titlebarColor: getComputedStyle(document.querySelector('.titlebar') || document.body).color,
  titlebarBg: getComputedStyle(document.querySelector('.titlebar') || document.body).backgroundColor,
}));
console.log(JSON.stringify(info, null, 2));
await browser.close();
