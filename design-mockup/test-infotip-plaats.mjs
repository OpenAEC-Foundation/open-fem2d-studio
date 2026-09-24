// Waar de tip van een InfoTip komt (issue #43): `lib/infoTipPlaats.ts`.
// Het eigenschappenpaneel staat tegen de rechterrand van het venster; een tip
// bij een label daar mag niet buiten beeld vallen. Het gedrag in de browser
// (hover, focus, Esc) bewaakt test-eigenschappen-ui.mjs.
import assert from "node:assert/strict";

const { infoTipPlaats, INFOTIP_MARGE: M, INFOTIP_AFSTAND: A } = await import("./src/lib/infoTipPlaats.ts");

const venster = { width: 1200, height: 800 };
const tip = { width: 280, height: 90 };
const icoon = (left, top) => ({ left, top, bottom: top + 15, width: 15 });
let geslaagd = 0;
function geval(naam, fn) {
  fn();
  geslaagd++;
  console.log(`  ok ${naam}`);
}

geval("midden in het venster: gecentreerd onder het icoon", () => {
  const p = infoTipPlaats(icoon(500, 100), tip, venster);
  assert.deepEqual(p, { left: 500 + 7.5 - 140, top: 115 + A, boven: false });
});

geval("aan de rechterrand (paneel rechts): tegen de rand geschoven, niet erbuiten", () => {
  const p = infoTipPlaats(icoon(1180, 100), tip, venster);
  assert.equal(p.left, 1200 - 280 - M);
  assert.ok(p.left + tip.width <= venster.width - M);
});

geval("aan de linkerrand: niet voorbij de marge", () => {
  assert.equal(infoTipPlaats(icoon(2, 100), tip, venster).left, M);
});

geval("onderaan: erboven als daar plaats is", () => {
  const p = infoTipPlaats(icoon(500, 760), tip, venster);
  assert.deepEqual([p.top, p.boven], [760 - A - 90, true]);
});

geval("geen plaats onder én boven: onder, tegen de onderrand, nooit boven de marge", () => {
  const hoog = { width: 280, height: 750 };
  const p = infoTipPlaats(icoon(500, 60), hoog, venster);
  assert.equal(p.boven, false);
  assert.equal(p.top, 800 - 750 - M);
  const nogHoger = infoTipPlaats(icoon(500, 60), { width: 280, height: 900 }, venster);
  assert.equal(nogHoger.top, M);
});

geval("venster smaller dan de tip: links op de marge", () => {
  assert.equal(infoTipPlaats(icoon(100, 100), tip, { width: 200, height: 800 }).left, M);
});

console.log(`${geslaagd} geslaagd, 0 gefaald`);
