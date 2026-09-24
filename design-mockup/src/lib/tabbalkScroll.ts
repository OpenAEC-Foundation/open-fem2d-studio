/**
 * tabbalkScroll — de rekenregels achter het scrollen van de belastinggevallen
 * in de tabbalk onder het tekenvlak (issue #51).
 *
 * WAAROM. Bij veel gevallen (bijvoorbeeld na de windgenerator) liep de balk
 * buiten het venster en waren de gevallen rechts niet meer te bereiken. Nu
 * scrollen alleen de gevallen; de vaste onderdelen (Model, Resultaten, +, eigen
 * gewicht, analyse, φ, scheefstand) blijven staan. Deze module beslist, los van
 * React en de DOM:
 *  - of de gevallen overlopen en welke pijl iets te doen heeft;
 *  - waar een pijlklik naartoe scrolt (het eerstvolgende deels verborgen
 *    geval helemaal in beeld);
 *  - hoever de strook moet schuiven om het actieve geval in beeld te krijgen
 *    ("nearest": zo min mogelijk, en niets als het al in beeld staat);
 *  - welk geval de pijltoetsen kiezen;
 *  - hoeveel een verticaal muiswiel horizontaal scrolt.
 *
 * Alle maten in CSS-pixels. `links` van een tab is zijn plaats in de inhoud van
 * de strook (offsetLeft), dus los van de huidige scrollstand.
 */

/** De scrollstand van de strook met gevallen. */
export interface ScrollStand {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** De plaats van één tab in de inhoud van de strook. */
export interface TabPlek {
  links: number;
  breedte: number;
}

/** Afrondingsruimte: subpixel-breedtes laten scrollLeft net naast het eind stoppen. */
export const SCROLL_TOLERANTIE = 1;

/** Pixels per regel bij een muiswiel dat in regels meldt (deltaMode 1). */
export const PIXELS_PER_REGEL = 16;

/**
 * Zoveel pixels moet de muis bewegen voordat een ingedrukte knop een sleep is
 * en geen klik: een trillende hand kiest dan nog gewoon een tab.
 */
export const SLEEP_DREMPEL = 5;

/** Ruimte die naast het actieve geval vrij blijft als het in beeld schuift. */
export const MARGE_ACTIEF = 4;

/** De grootste scrollstand: tot waar de strook kan schuiven. */
export function maxScroll(s: ScrollStand): number {
  return Math.max(0, s.scrollWidth - s.clientWidth);
}

/** Houd een scrollstand binnen [0, maxScroll]. */
export function begrensScroll(links: number, s: ScrollStand): number {
  return Math.min(maxScroll(s), Math.max(0, links));
}

/**
 * Lopen de gevallen over, en kan de strook naar links of naar rechts?
 * De pijlknoppen staan er alleen bij overloop; een pijl zonder werk is
 * uitgeschakeld.
 */
export function tabbalkOverloop(s: ScrollStand): { overloop: boolean; kanLinks: boolean; kanRechts: boolean } {
  const overloop = maxScroll(s) > SCROLL_TOLERANTIE;
  return {
    overloop,
    kanLinks: overloop && s.scrollLeft > SCROLL_TOLERANTIE,
    kanRechts: overloop && s.scrollLeft < maxScroll(s) - SCROLL_TOLERANTIE,
  };
}

/**
 * De scrollstand waarbij `tab` helemaal in beeld staat, met zo min mogelijk
 * beweging (zoals `scrollIntoView({ inline: "nearest" })`, maar alleen voor de
 * strook zelf — niet voor de pagina eromheen). `marge` houdt ruimte vrij naast
 * de tab. Een tab die breder is dan de strook komt met zijn begin in beeld.
 */
export function scrollVoorZichtbaar(tab: TabPlek, s: ScrollStand, marge = 0): number {
  const begin = tab.links - marge;
  const eind = tab.links + tab.breedte + marge;
  let links = s.scrollLeft;
  if (eind - begin >= s.clientWidth || begin < s.scrollLeft) links = begin;
  else if (eind > s.scrollLeft + s.clientWidth) links = eind - s.clientWidth;
  return begrensScroll(links, s);
}

/**
 * Waar een pijlklik naartoe scrolt. Rechts: het eerste geval dat rechts
 * (deels) buiten beeld valt, komt er helemaal in, tegen de rechterrand. Links:
 * het laatste geval dat links (deels) buiten beeld valt, komt er helemaal in,
 * tegen de linkerrand. Is er geen tab te vinden (lege lijst), dan een stap van
 * een driekwart strookbreedte.
 */
export function scrollStap(richting: 1 | -1, tabs: readonly TabPlek[], s: ScrollStand): number {
  const zichtLinks = s.scrollLeft;
  const zichtRechts = s.scrollLeft + s.clientWidth;
  if (richting > 0) {
    const volgende = tabs.find((t) => t.links + t.breedte > zichtRechts + SCROLL_TOLERANTIE);
    if (volgende) return begrensScroll(volgende.links + volgende.breedte - s.clientWidth, s);
  } else {
    const vorige = [...tabs].reverse().find((t) => t.links < zichtLinks - SCROLL_TOLERANTIE);
    if (vorige) return begrensScroll(vorige.links, s);
  }
  return begrensScroll(s.scrollLeft + richting * s.clientWidth * 0.75, s);
}

/**
 * Het geval dat een toets kiest vanuit het actieve geval: de vorige of de
 * volgende (zonder rondgaan), het eerste of het laatste. Staat het actieve
 * geval niet in de lijst, dan het eerste (of bij "vorige" het laatste).
 * `undefined` bij een lege lijst.
 */
export function naburigGeval(
  ids: readonly number[],
  actief: number,
  stap: "vorige" | "volgende" | "eerste" | "laatste",
): number | undefined {
  if (ids.length === 0) return undefined;
  if (stap === "eerste") return ids[0];
  if (stap === "laatste") return ids[ids.length - 1];
  const i = ids.indexOf(actief);
  if (i < 0) return stap === "vorige" ? ids[ids.length - 1] : ids[0];
  const j = stap === "vorige" ? Math.max(0, i - 1) : Math.min(ids.length - 1, i + 1);
  return ids[j];
}

/** Is een muisbeweging van `dx` pixels sinds het indrukken een sleep? */
export function isSleep(dx: number): boolean {
  return Math.abs(dx) >= SLEEP_DREMPEL;
}

/**
 * Hoeveel pixels een wielbeweging de strook horizontaal verschuift. Een
 * touchpad of kantelwiel geeft zelf al een horizontale beweging (deltaX); die
 * laat de browser gewoon doen, dus 0. Een gewoon (verticaal) muiswiel wordt
 * omgezet naar horizontaal. deltaMode 1 = regels, 2 = pagina's.
 */
export function wielNaarScroll(deltaX: number, deltaY: number, deltaMode: number, clientWidth: number): number {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return 0;
  if (deltaMode === 1) return deltaY * PIXELS_PER_REGEL;
  if (deltaMode === 2) return deltaY * clientWidth;
  return deltaY;
}
