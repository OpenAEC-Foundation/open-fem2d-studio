// De rekenregels achter het scrollen van de belastinggevallen (issue #51):
// `lib/tabbalkScroll.ts`. Het gedrag in de echte tabbalk (pijlen, lijst,
// wiel, slepen, actief geval in beeld) bewaakt test-tabbalk-ui.mjs.
import assert from "node:assert/strict";

const {
  tabbalkOverloop, maxScroll, begrensScroll, scrollVoorZichtbaar, scrollStap,
  naburigGeval, wielNaarScroll, isSleep, SCROLL_TOLERANTIE, PIXELS_PER_REGEL, SLEEP_DREMPEL, MARGE_ACTIEF,
} = await import("./src/lib/tabbalkScroll.ts");

let geslaagd = 0;
function geval(naam, fn) {
  fn();
  geslaagd++;
  console.log(`  ok ${naam}`);
}

// Twaalf tabs van 100 px met 3 px tussenruimte in een strook van 400 px.
const tabs = Array.from({ length: 12 }, (_, i) => ({ links: i * 103, breedte: 100 }));
const inhoud = 12 * 103 - 3; // 1233
const stand = (scrollLeft, clientWidth = 400, scrollWidth = inhoud) => ({ scrollLeft, scrollWidth, clientWidth });

geval("past alles: geen overloop, geen pijlen", () => {
  assert.deepEqual(tabbalkOverloop(stand(0, 1300)), { overloop: false, kanLinks: false, kanRechts: false });
  assert.equal(maxScroll(stand(0, 1300)), 0);
});

geval("afronding: een halve pixel te breed is geen overloop", () => {
  assert.equal(tabbalkOverloop({ scrollLeft: 0, scrollWidth: 400.5, clientWidth: 400 }).overloop, false);
  assert.equal(tabbalkOverloop({ scrollLeft: 0, scrollWidth: 400 + SCROLL_TOLERANTIE + 1, clientWidth: 400 }).overloop, true);
});

geval("overloop aan het begin: alleen rechts kan", () => {
  assert.deepEqual(tabbalkOverloop(stand(0)), { overloop: true, kanLinks: false, kanRechts: true });
});

geval("overloop in het midden: beide kanten", () => {
  assert.deepEqual(tabbalkOverloop(stand(300)), { overloop: true, kanLinks: true, kanRechts: true });
});

geval("overloop aan het eind (ook net ervoor door subpixels): alleen links", () => {
  assert.deepEqual(tabbalkOverloop(stand(inhoud - 400)), { overloop: true, kanLinks: true, kanRechts: false });
  assert.deepEqual(tabbalkOverloop(stand(inhoud - 400 - 0.6)), { overloop: true, kanLinks: true, kanRechts: false });
});

geval("begrenzen: nooit onder 0 of voorbij het eind", () => {
  assert.equal(begrensScroll(-50, stand(0)), 0);
  assert.equal(begrensScroll(5000, stand(0)), inhoud - 400);
  assert.equal(begrensScroll(120, stand(0)), 120);
});

geval("actief geval al in beeld: niet schuiven", () => {
  assert.equal(scrollVoorZichtbaar(tabs[1], stand(0)), 0);
  assert.equal(scrollVoorZichtbaar(tabs[4], stand(300)), 300);
});

geval("actief geval rechts buiten beeld: tegen de rechterrand (nearest)", () => {
  // tab 11: 1133–1233; zicht 400 breed → scrollLeft 833 (= het eind).
  assert.equal(scrollVoorZichtbaar(tabs[11], stand(0)), 833);
  // tab 5: 515–615 → 215.
  assert.equal(scrollVoorZichtbaar(tabs[5], stand(0)), 215);
});

geval("actief geval links buiten beeld: tegen de linkerrand", () => {
  assert.equal(scrollVoorZichtbaar(tabs[2], stand(600)), 206);
  // deels verborgen aan de linkerkant telt ook
  assert.equal(scrollVoorZichtbaar(tabs[5], stand(560)), 515);
});

geval("marge naast de tab, begrensd op het begin", () => {
  assert.equal(scrollVoorZichtbaar(tabs[5], stand(0), 8), 223);
  assert.equal(scrollVoorZichtbaar(tabs[0], stand(300), 8), 0);
});

geval("tab breder dan de strook: zijn begin in beeld", () => {
  const breed = { links: 500, breedte: 600 };
  assert.equal(scrollVoorZichtbaar(breed, { scrollLeft: 0, scrollWidth: 2000, clientWidth: 400 }), 500);
});

geval("pijl rechts: het eerste deels verborgen geval helemaal in beeld", () => {
  // Zicht 0–400: tab 3 (309–409) steekt uit → scrollLeft 9.
  assert.equal(scrollStap(1, tabs, stand(0)), 9);
  // Zicht 9–409: tab 4 (412–512) → 112.
  assert.equal(scrollStap(1, tabs, stand(9)), 112);
});

geval("pijl rechts herhaald: bereikt het laatste geval en stopt daar", () => {
  let s = stand(0);
  for (let i = 0; i < 20; i++) s = stand(scrollStap(1, tabs, s));
  assert.equal(s.scrollLeft, inhoud - 400);
  const laatste = tabs[11];
  assert.ok(laatste.links >= s.scrollLeft && laatste.links + laatste.breedte <= s.scrollLeft + 400);
  assert.equal(tabbalkOverloop(s).kanRechts, false);
});

geval("pijl links: het laatste deels verborgen geval tegen de linkerrand", () => {
  // Zicht 833–1233: tab 8 (824–924) steekt links uit → 824.
  assert.equal(scrollStap(-1, tabs, stand(833)), 824);
  assert.equal(scrollStap(-1, tabs, stand(824)), 721);
});

geval("pijl links herhaald: terug naar het begin", () => {
  let s = stand(833);
  for (let i = 0; i < 20; i++) s = stand(scrollStap(-1, tabs, s));
  assert.equal(s.scrollLeft, 0);
});

geval("pijl zonder tabs: een driekwart strook, begrensd", () => {
  assert.equal(scrollStap(1, [], stand(0)), 300);
  assert.equal(scrollStap(-1, [], stand(100)), 0);
});

geval("toetsen: vorige/volgende zonder rondgaan, eerste/laatste", () => {
  const ids = [1, 4, 7, 9];
  assert.equal(naburigGeval(ids, 4, "volgende"), 7);
  assert.equal(naburigGeval(ids, 4, "vorige"), 1);
  assert.equal(naburigGeval(ids, 9, "volgende"), 9);
  assert.equal(naburigGeval(ids, 1, "vorige"), 1);
  assert.equal(naburigGeval(ids, 7, "eerste"), 1);
  assert.equal(naburigGeval(ids, 7, "laatste"), 9);
});

geval("toetsen: actief geval onbekend of lege lijst", () => {
  assert.equal(naburigGeval([3, 5], 99, "volgende"), 3);
  assert.equal(naburigGeval([3, 5], 99, "vorige"), 5);
  assert.equal(naburigGeval([], 1, "volgende"), undefined);
});

geval("wiel: verticaal wiel wordt horizontaal, in pixels, regels en pagina's", () => {
  assert.equal(wielNaarScroll(0, 120, 0, 400), 120);
  assert.equal(wielNaarScroll(0, -3, 1, 400), -3 * PIXELS_PER_REGEL);
  assert.equal(wielNaarScroll(0, 1, 2, 400), 400);
});

geval("wiel: horizontale beweging (touchpad) laat de browser zelf doen", () => {
  assert.equal(wielNaarScroll(40, 10, 0, 400), 0);
  assert.equal(wielNaarScroll(-30, 30, 0, 400), 0);
  assert.equal(wielNaarScroll(0, 0, 0, 400), 0);
});

geval("slepen: pas vanaf de drempel een sleep, in beide richtingen", () => {
  assert.equal(isSleep(0), false);
  assert.equal(isSleep(SLEEP_DREMPEL - 1), false);
  assert.equal(isSleep(SLEEP_DREMPEL), true);
  assert.equal(isSleep(-SLEEP_DREMPEL - 3), true);
});

geval("actief geval met marge: de eerste tab gaat helemaal naar het begin", () => {
  assert.equal(scrollVoorZichtbaar(tabs[0], stand(200), MARGE_ACTIEF), 0);
  assert.equal(scrollVoorZichtbaar(tabs[11], stand(0), MARGE_ACTIEF), inhoud - 400);
});

console.log(`${geslaagd} geslaagd, 0 gefaald`);
