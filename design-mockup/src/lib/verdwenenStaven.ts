/**
 * Keuzes die aan een STAAFNUMMER hangen, opruimen zodra die staaf verdwijnt.
 *
 * WAAROM (issue #18, basisaudit ruw 31). Staafnummers worden uitgedeeld als
 * `Math.max(bestaande) + 1`. Verwijder de staaf met het hoogste nummer en
 * teken een nieuwe, dan krijgt die hetzelfde nummer terug. Alles wat op dat
 * nummer sleutelt, erft dan stil mee naar een staaf die er niets mee te maken
 * heeft:
 *
 *  - `verborgenToetsStaven` (rapportinstellingen): de nieuwe staaf 6 ontbrak in
 *    het hoofdstuk "Toetsing per staaf", omdat de gebruiker de OUDE staaf 6
 *    daar had uitgezet — en dat gaat zelfs mee in het projectbestand;
 *  - de focus van het toetsingspaneel (een aangeklikte UC-badge): na de
 *    volgende toetsronde klapte de kaart van de nieuwe staaf 6 vanzelf open en
 *    scrolde hij in beeld.
 *
 * Voor geplakte lasten is dit opgelost met een geometrische herkomst
 * (`lastHerkomst` in hooks/useFemStore.ts): een klembord moet een staaf
 * HERKENNEN die er misschien nog is. Hier is dat niet nodig en ook niet
 * gewenst. Een verborgen staaf die de gebruiker verschuift, blijft dezelfde
 * staaf en hoort verborgen te blijven; een staaf die weg is, heeft geen keuze
 * meer nodig. Daarom wist het model de keuze op het moment dat het nummer uit
 * het model verdwijnt — en krijgt een nieuwe staaf met dat nummer een schone
 * lei. De prijs: na Ctrl+Z van het verwijderen staat de staaf weer aan in het
 * rapport. Dat is zichtbaar en in één klik hersteld; het omgekeerde (een
 * staaf die stil ontbreekt) is dat niet.
 *
 * Pure functies zonder React of store, zodat de test ze direct kan aanroepen.
 */

/**
 * `keuze` zonder de staafnummers die niet meer in het model staan.
 *
 * Geeft HETZELFDE object terug als er niets te wissen valt: de aanroeper zet
 * de store dan niet, en de rapport-synchronisatie (die op identiteit
 * vergelijkt) stuurt geen overbodige update naar het losse venster.
 *
 * Sleutels die geen staafnummer zijn, worden ook gewist — ze kunnen nergens
 * bij horen.
 */
export function snoeiToetsStaafKeuze<T>(
  keuze: Record<string, T>,
  bestaandeStaven: ReadonlySet<number>,
): Record<string, T> {
  const weg = Object.keys(keuze).filter((k) => !bestaandeStaven.has(Number(k)));
  if (weg.length === 0) return keuze;
  const rest: Record<string, T> = { ...keuze };
  for (const k of weg) delete rest[k];
  return rest;
}

/**
 * De focus van het toetsingspaneel, of `null` als zijn staaf verdwenen is.
 * Zelfde object terug als hij blijft staan (React slaat de update dan over).
 */
export function snoeiCheckFocus<F extends { beamId: number }>(
  focus: F | null,
  bestaandeStaven: ReadonlySet<number>,
): F | null {
  if (focus === null) return null;
  return bestaandeStaven.has(focus.beamId) ? focus : null;
}
