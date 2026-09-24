/**
 * Tweelettercommando's op het tekenvlak, zoals in CAD: de eerste letter zet
 * een prefix klaar, de tweede letter binnen `VENSTER_MS` kiest het gereedschap.
 *
 *   MV — verplaatsen
 *   CO — kopiëren (neemt de selectie mee, met de lasten die erop staan)
 */
export type CommandoTool = "move" | "copy";

export const COMMANDO_REEKSEN: Record<string, Record<string, CommandoTool>> = {
  m: { v: "move" },
  c: { o: "copy" },
};

export const VENSTER_MS = 1200;

export type Prefix = { key: string; t: number } | null;

/**
 * Verwerk één toets. Geeft het nieuwe prefix terug, en `tool` als de reeks
 * compleet is. `verbruikt` betekent dat de toets bij een reeks hoorde en niet
 * verder afgehandeld moet worden.
 */
export function verwerkToets(prefix: Prefix, toets: string, nu: number): { prefix: Prefix; tool?: CommandoTool; verbruikt: boolean } {
  const k = toets.toLowerCase();
  const vers = prefix !== null && nu - prefix.t < VENSTER_MS;
  if (vers) {
    const tool = COMMANDO_REEKSEN[prefix!.key]?.[k];
    if (tool) return { prefix: null, tool, verbruikt: true };
    // andere tweede toets: prefix vervalt, de toets zelf kan een nieuw prefix zijn
  }
  if (k in COMMANDO_REEKSEN) return { prefix: { key: k, t: nu }, verbruikt: true };
  return { prefix: null, verbruikt: false };
}
