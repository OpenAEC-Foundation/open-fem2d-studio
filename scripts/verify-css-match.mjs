import { chromium } from 'playwright';

// Compare computed styles of key chrome elements vs what the vendored CSS SHOULD produce.
// Catches the bluff: if class names don't match, vendored CSS does nothing.

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const stub = () => Promise.resolve(null);
  window.__TAURI_INTERNALS__ = { invoke: stub, transformCallback: () => 0 };
  window.__TAURI__ = { invoke: stub, event: { listen: () => Promise.resolve(() => {}) } };
});
page.on('pageerror', () => {});
await page.goto('http://localhost:1420', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);

// What actually renders for the major chrome elements?
const audit = await page.evaluate(() => {
  const probes = [
    { name: 'ribbon-container', sel: '.ribbon-container, [class*="ribbon-container"]' },
    { name: 'ribbon-tabs',      sel: '.ribbon-tabs, [class*="ribbon-tabs"]' },
    { name: 'ribbon-tab.active',sel: '.ribbon-tab.active, [class*="ribbon-tab"][class*="active"]' },
    { name: 'ribbon-tab.file',  sel: '.ribbon-tab.file-tab, [class*="file-tab"]' },
    { name: 'ribbon-group',     sel: '.ribbon-group, [class*="ribbon-group"]:not([class*="label"]):not([class*="separator"])' },
    { name: 'ribbon-group-label', sel: '.ribbon-group-label, [class*="ribbon-group-label"]' },
    { name: 'ribbon-button',    sel: '.ribbon-button, [class*="ribbon-button"]' },
    { name: 'titlebar',         sel: '.titlebar, [class*="titlebar"], [class*="title-bar"]' },
    { name: 'document-bar',     sel: '.document-bar, .oa-document-bar-wrap, [class*="document-bar"]' },
    { name: 'status-bar',       sel: '.status-bar, [class*="status-bar"]' },
    { name: 'left-panel',       sel: '.left-panel, .oa-side-panel--left' },
    { name: 'right-panel',      sel: '.right-panel, .oa-side-panel--right' },
  ];
  return probes.map(p => {
    const el = document.querySelector(p.sel);
    if (!el) return { name: p.name, exists: false };
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      name: p.name,
      exists: true,
      actualClass: el.className.split(' ').slice(0, 3).join(' '),
      bg: s.backgroundColor,
      color: s.color,
      borderTop: s.borderTopColor + ' ' + s.borderTopWidth,
      borderBottom: s.borderBottomColor + ' ' + s.borderBottomWidth,
      font: s.fontSize + ' ' + s.fontWeight + ' ' + s.fontFamily.split(',')[0],
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
});

console.log('=== CHROME ELEMENT AUDIT ===');
audit.forEach(a => {
  if (!a.exists) { console.log(`✗ ${a.name}: NOT FOUND`); return; }
  console.log(`✓ ${a.name} [${a.actualClass}] ${a.width}x${a.height} bg=${a.bg} color=${a.color} font=${a.font}`);
});

// What's in our vendored CSS for ribbon-tab?
const cssRules = await page.evaluate(() => {
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules || []) {
        if (r.selectorText && /ribbon-tab|ribbon-container|ribbon-group/.test(r.selectorText)) {
          rules.push({
            selector: r.selectorText.slice(0, 80),
            background: r.style.background || r.style.backgroundColor,
            color: r.style.color,
            href: sheet.href ? sheet.href.split('/').pop() : 'inline',
          });
        }
      }
    } catch (e) { /* cross-origin */ }
  }
  return rules.slice(0, 30);
});
console.log('\n=== RIBBON CSS RULES IN PAGE ===');
cssRules.forEach(r => console.log(`  [${r.href}] ${r.selector}  bg=${r.background || '-'}  color=${r.color || '-'}`));

await browser.close();
