/**
 * infoTipPlaats.ts — waar de tip van een InfoTip komt (issue #43).
 *
 * De tip hangt met `position: fixed` aan `document.body` (zie
 * components/InfoTip.tsx) en moet binnen het venster blijven, ook als het
 * icoon aan de rand van het eigenschappenpaneel staat: het paneel zit tegen de
 * rechterrand van het venster. Daarom:
 *  - horizontaal gecentreerd op het icoon, maar nooit dichter dan MARGE bij
 *    een vensterrand;
 *  - onder het icoon; erboven als hij onder niet past en erboven wel; past hij
 *    nergens, dan onder, tegen de onderrand geschoven maar nooit boven MARGE.
 * Pure functie, zonder DOM: test-infotip-plaats.mjs rekent hem na.
 */

/** Afstand tot de vensterrand, in px. */
export const INFOTIP_MARGE = 8;
/** Afstand tussen icoon en tip, in px. */
export const INFOTIP_AFSTAND = 6;

export interface InfoTipPlaats {
  left: number;
  top: number;
  /** De tip staat boven het icoon. */
  boven: boolean;
}

export function infoTipPlaats(
  icoon: { left: number; top: number; bottom: number; width: number },
  tip: { width: number; height: number },
  venster: { width: number; height: number },
): InfoTipPlaats {
  const midden = icoon.left + icoon.width / 2;
  const maxLinks = Math.max(INFOTIP_MARGE, venster.width - tip.width - INFOTIP_MARGE);
  const left = Math.min(Math.max(midden - tip.width / 2, INFOTIP_MARGE), maxLinks);
  const onder = icoon.bottom + INFOTIP_AFSTAND;
  const pastOnder = onder + tip.height + INFOTIP_MARGE <= venster.height;
  const erboven = icoon.top - INFOTIP_AFSTAND - tip.height;
  if (!pastOnder && erboven >= INFOTIP_MARGE) return { left, top: erboven, boven: true };
  return {
    left,
    top: Math.max(INFOTIP_MARGE, Math.min(onder, venster.height - tip.height - INFOTIP_MARGE)),
    boven: false,
  };
}
