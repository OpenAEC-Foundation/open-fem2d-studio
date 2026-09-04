/** Korte unieke id voor lamellen, delen, gaten en bewaarde doorsneden. */
export function nieuwId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
