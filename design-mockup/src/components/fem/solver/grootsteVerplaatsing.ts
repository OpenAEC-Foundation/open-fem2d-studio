import type { ElementForces, NodalDisp } from "./types";

/**
 * De grootste verplaatsing van een resultaat (mm): de lengte van de
 * verplaatsingsvector, in de knopen én langs de staven.
 *
 * WAAROM LANGS DE STAVEN. Tot issue #32 telden alleen de knopen mee. Een
 * ligger met alleen oplegknopen heeft daar u = 0; de melding boven het canvas
 * gaf dan "max |u| = 0.00 mm" terwijl de ligger 5qL⁴/(384EI) doorbuigt. De
 * stationsarrays `deflection` en `axialDisp` bevatten de volledige
 * veldverplaatsing (Hermite-deel op de eind-DOF's plus de particuliere
 * oplossing van de elementbelasting, zie `core/fem/BeamForces.ts`), in
 * LOKALE assen.
 *
 * WAAROM DE VECTORLENGTE. De vervormingsweergave (`FemResultsOverlay`) meet
 * per sample √(dx² + dz²); de lengte is ongevoelig voor de assendraaiing,
 * dus √(u² + w²) in lokale assen geeft hetzelfde getal zonder de staafstand
 * te kennen. Melding en weergave noemen zo dezelfde "max |u|". In een knoop
 * is dat √(ux² + uz²), niet meer het grootste van |ux| en |uz|.
 *
 * Een staaf zonder volledige stationsarrays draagt alleen via zijn knopen
 * bij — dezelfde voorwaarde waaronder de weergave op knoopwaarden terugvalt.
 */
export function grootsteVerplaatsing(
  displacements: Iterable<NodalDisp>,
  elements: Iterable<ElementForces>,
): number {
  let max = 0;
  for (const d of displacements) {
    const u = Math.hypot(d.ux, d.uz);
    if (u > max) max = u;
  }
  for (const ef of elements) {
    const n = ef.stations_mm?.length ?? 0;
    if (n < 2 || ef.deflection?.length !== n || ef.axialDisp?.length !== n) continue;
    for (let k = 0; k < n; k++) {
      const u = Math.hypot(ef.axialDisp[k], ef.deflection[k]);
      if (u > max) max = u;
    }
  }
  return max;
}
