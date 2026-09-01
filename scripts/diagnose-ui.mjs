// Hands-on diagnostic: load app, capture state, click around, inspect what is + isn't there.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.env.LOCALAPPDATA + '\\Temp\\openaec-ui-diag';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message).split('\n')[0]));
page.on('console', m => {
  if (m.type() === 'error') errors.push('[err] ' + m.text());
});

log('NAV...');
await page.goto('http://localhost:1420', { waitUntil: 'load', timeout: 15000 }).catch(e => log('nav err:', e.message));
await page.waitForTimeout(2000);

async function shot(name) { await page.screenshot({ path: join(OUT, name + '.png') }); log('SHOT', name); }

// 1. Fresh screenshot
await shot('01-fresh');

// 2. What is data-theme?
const theme = await page.evaluate(() => ({
  htmlTheme: document.documentElement.dataset.theme,
  appWrapTheme: document.querySelector('.oa-app-shell')?.getAttribute('data-theme'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  rootBg: getComputedStyle(document.documentElement).backgroundColor,
}));
log('=== THEME STATE ===', JSON.stringify(theme));

// 3. Inventory main top-level children of .oa-app-shell
const shellChildren = await page.evaluate(() => {
  const shell = document.querySelector('.oa-app-shell');
  if (!shell) return ['NO-SHELL'];
  return Array.from(shell.children).map(c => `${c.tagName}.${c.className.split(' ').slice(0,2).join('.')}`);
});
log('=== SHELL CHILDREN ===');
shellChildren.forEach(c => log('  ', c));

// 4. Inventory all panels visible right now
const panels = await page.evaluate(() => {
  const panels = Array.from(document.querySelectorAll('[class*="panel"], [class*="Panel"], [class*="sidebar"], [class*="Sidebar"], [class*="dock"], [class*="properties"]'));
  return panels.slice(0, 30).map(p => {
    const r = p.getBoundingClientRect();
    return {
      tag: p.tagName,
      cls: p.className.split(' ').slice(0, 3).join(' '),
      visible: r.width > 0 && r.height > 0,
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
});
log('=== PANELS (top 30) ===');
panels.forEach(p => log(`  ${p.tag} [${p.cls}] ${p.visible ? '✓' : '✗'} ${p.w}x${p.h}`));

// 5. Click on the canvas to attempt selecting a beam
log('=== CLICKING canvas ===');
const cv = page.locator('canvas').first();
const cvBox = await cv.boundingBox().catch(() => null);
log('canvas box:', JSON.stringify(cvBox));
if (cvBox) {
  await cv.click({ position: { x: 200, y: 250 } }).catch(e => log('click err:', e.message));
  await page.waitForTimeout(500);
}
await shot('02-after-canvas-click');

// 6. Look for properties panel state
const propsState = await page.evaluate(() => {
  const propsCandidates = document.querySelectorAll('[class*="properties"i], [class*="property"i], [class*="props"i]');
  return Array.from(propsCandidates).slice(0, 20).map(p => ({
    cls: p.className,
    text: (p.innerText || '').slice(0, 100),
    visible: p.getBoundingClientRect().width > 0,
  }));
});
log('=== PROPERTIES CANDIDATES ===');
propsState.forEach(p => log('  ', JSON.stringify(p).slice(0, 200)));

// 7. Try toggling View > Properties button explicitly
log('=== try View tab + Properties toggle ===');
await page.locator('[role="tab"]:has-text("View"), button:has-text("View")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(300);
await page.locator('button:has-text("Properties")').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(300);
await shot('03-after-toggle-properties');

// 8. Re-click canvas to try select
if (cvBox) {
  await cv.click({ position: { x: 200, y: 250 } }).catch(() => {});
  await page.waitForTimeout(500);
}
await shot('04-after-second-canvas-click');

// 9. Final dom dump for properties
const propDom = await page.evaluate(() => {
  const root = document.querySelector('[class*="properties-panel"], [class*="PropertiesPanel"], [class*="props"], aside, .oa-side-panel');
  return root ? root.outerHTML.slice(0, 2000) : 'NONE-FOUND';
});
log('=== PROPS DOM SAMPLE (2KB) ===');
log(propDom);

log('=== ERRORS COUNT ===', errors.length);
errors.slice(0, 10).forEach(e => log('  ', e.slice(0, 300)));
await browser.close();
log('done. screenshots in', OUT);
