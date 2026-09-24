/**
 * kipsteunenGelijk.ts — het vinkje "Onder en boven gelijk" bij de kipsteunen
 * (issue #44).
 *
 * Kipsteunen staan per flens in de toetsconfiguratie: `lateralRestraints`
 * (bovenflens, bij hout bovenrand) en `lateralRestraintsBottom` (onderflens).
 * Meestal zitten ze aan beide flenzen op dezelfde plaats, en dan moest alles
 * twee keer worden ingevuld; een vergissing tussen de twee rijen verandert de
 * toets, want voor L_cr,z telt een steun alleen waar boven- én onderflens op
 * dezelfde plaats gesteund zijn (`lib/kniklengte.ts`).
 *
 * Het vinkje is GEEN opgeslagen veld: het volgt bij het openen uit de posities
 * zelf (`kipsteunenGelijk`). De opslag blijft `lateralRestraints` en
 * `lateralRestraintsBottom`, zodat de tekening (`lib/kipsteunen.ts`, #40) en
 * de toetsinvoer (`lateral_bracing`) vanzelf volgen. Met het vinkje aan
 * schrijft het paneel beide velden in ÉÉN wijziging (`kipsteunenPatch`), dus
 * één undo-stap. Uitzetten schrijft niets.
 *
 * Pure functies zonder React; test-kipsteunen-gelijk.mjs rekent ze na.
 */
import type { BeamCheckConfig } from "../components/fem/femTypes";
import { sanitizeRestraintFractions } from "./kipsteunen";
import { TOLERANTIE_STEUNPAAR_MM } from "./kniklengte";

/**
 * Tolerantie op de fractie als de staaflengte onbekend of 0 is. Met een
 * lengte geldt de tolerantie van de kern voor een steunpaar (1 mm).
 */
export const TOLERANTIE_FRACTIE = 1e-6;

/**
 * Staan de kipsteunen aan boven- en onderflens op dezelfde plaatsen, binnen
 * afronding? Vergeleken na dezelfde opschoning als de toetsinvoer (alleen
 * 0 < f < 1, gesorteerd, ontdubbeld), met de tolerantie van de kern: 1 mm
 * langs de staaf. Twee lege rijen zijn gelijk — een nieuwe staaf opent dus met
 * het vinkje aan, en wie dan een aantal invult, steunt beide flenzen.
 */
export function kipsteunenGelijk(
  boven: readonly number[] | undefined,
  onder: readonly number[] | undefined,
  lengteMm: number,
): boolean {
  const a = sanitizeRestraintFractions(boven ? [...boven] : undefined);
  const b = sanitizeRestraintFractions(onder ? [...onder] : undefined);
  if (a.length !== b.length) return false;
  const tol = Number.isFinite(lengteMm) && lengteMm > 0
    ? TOLERANTIE_STEUNPAAR_MM / lengteMm
    : TOLERANTIE_FRACTIE;
  return a.every((f, i) => Math.abs(f - b[i]) <= tol);
}

/**
 * De posities die bij het AANzetten van het vinkje voor beide flenzen gaan
 * gelden: die van de bovenflens (de bovenste rij in het paneel), of die van
 * de onderflens als de bovenflens er geen heeft. Zo wist aanzetten nooit de
 * enige rij die ingevuld was.
 */
export function gelijkTrekken(
  boven: readonly number[] | undefined,
  onder: readonly number[] | undefined,
): number[] {
  return [...((boven?.length ?? 0) > 0 ? boven! : (onder ?? []))];
}

/** Welke flens(en) een invoer in het paneel beschrijft. */
export type KipsteunRij = "boven" | "onder" | "beide";

/**
 * De wijziging van de toetsconfiguratie voor een invoer in één rij: bij
 * `beide` staan beide velden in hetzelfde object, zodat één `updateBeam` —
 * en dus één undo-stap — ze samen zet.
 */
export function kipsteunenPatch(rij: KipsteunRij, posities: readonly number[]): Partial<BeamCheckConfig> {
  const p = [...posities];
  if (rij === "boven") return { lateralRestraints: p };
  if (rij === "onder") return { lateralRestraintsBottom: p };
  return { lateralRestraints: p, lateralRestraintsBottom: [...posities] };
}
