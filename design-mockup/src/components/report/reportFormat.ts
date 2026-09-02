/**
 * reportFormat — kleine formatteerhulpen voor de rapportsecties.
 *
 * Conventies:
 *  - getallen met punt als decimaalteken (consistent met de rest van het
 *    rapport, o.a. de UC-kolom in de toetsingssamenvatting);
 *  - coördinaten in mm (integer), lengtes afgeleid in m (3 decimalen);
 *  - factoren compact: 1.35, 0.9 — geen trailing nullen-parade.
 */
import type { SupportType } from "../fem/femTypes";

/** mm-coördinaat: integer, zonder eenheid (de kolomkop draagt "mm"). */
export function fmtMm(v: number): string {
  return String(Math.round(v));
}

/** Lengte in m uit mm, 3 decimalen ("2.500"). */
export function fmtLenM(mm: number): string {
  return (mm / 1000).toFixed(3);
}

/** Algemeen getal met vast aantal decimalen. */
export function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

/** Combinatiefactor: max 2 decimalen, zonder overbodige nullen ("1.35", "0.9", "1"). */
export function fmtFactor(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/**
 * i18n-sleutels (namespace "ribbon") voor opleggingstypen — hergebruikt de
 * bestaande Home-tab-labels zodat rapport en editor dezelfde termen tonen.
 */
export const SUPPORT_LABEL_KEYS: Record<SupportType, string> = {
  pinned: "home.pinned",
  fixed: "home.fixed",
  xRoller: "home.xRoller",
  zRoller: "home.zRoller",
  zSpring: "home.zSpring",
  xSpring: "home.xSpring",
  rotSpring: "home.rotSpring",
};

/** Eenheid van de veerstijfheid per opleggingstype (alleen veren). */
export function springUnit(type: SupportType): string | null {
  if (type === "zSpring" || type === "xSpring") return "kN/mm";
  if (type === "rotSpring") return "kNm/rad";
  return null;
}
