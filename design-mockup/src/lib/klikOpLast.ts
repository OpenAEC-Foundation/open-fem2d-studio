/**
 * Valt een klik op het tekenvlak op een getekende last (puntlast of lijnlast)?
 * Die elementen dragen `data-last-id`. Het tekenvlak selecteert dan de last al
 * bij het indrukken, en selecteert of versleept geen knoop of staaf eronder.
 *
 * Aanleiding: een puntlast in het verlengde van een staaf (bv. op een kolomkop)
 * was nauwelijks te selecteren; de staaf eronder won, en met een paar pixels
 * handbeweging tijdens de klik werd die staaf zelfs 500 mm versleept.
 */
export const LAST_SELECTOR = ".fem-pointload-group, .fem-lineload-group";

type Doel = { closest?: (s: string) => unknown } | null | undefined;

/** Het id van de aangeklikte last, of null als de klik niet op een last valt. */
export function lastIdVanKlik(doel: Doel): number | null {
  const groep = doel?.closest?.(LAST_SELECTOR) as { getAttribute?: (n: string) => string | null } | null | undefined;
  const ruw = groep?.getAttribute?.("data-last-id");
  if (ruw === null || ruw === undefined || ruw === "") return null;
  const id = Number(ruw);
  return Number.isFinite(id) ? id : null;
}
