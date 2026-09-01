import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto('http://localhost:1420/', { waitUntil: 'load' }).catch(() => {});
await page.evaluate(() => { localStorage.removeItem('fem2d-theme'); });
console.log('cleared fem2d-theme from localStorage');
await browser.close();
