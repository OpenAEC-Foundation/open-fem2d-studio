/**
 * Waar hoort Ctrl+Z / Ctrl+Y heen als de focus in een bedieningselement staat?
 *
 * - "veld":  de browser maakt het typen in het veld ongedaan (vrije tekst:
 *            projectnaam, notities, zoekveld) — daar verwacht je tekst-undo.
 * - "model": de modelhistorie. Geldt ook voor getalvelden, keuzelijsten,
 *            vinkjes en schuifregelaars: daar is tekst-undo betekenisloos, en
 *            wie net een coördinaat heeft ingetypt en Ctrl+Z drukt, bedoelt
 *            "zet de knoop terug". Vroeger viel élk invoerveld onder "veld",
 *            waardoor een verplaatsing via het eigenschappenpaneel niet met
 *            Ctrl+Z terug te draaien leek zolang de cursor nog in het veld stond.
 *
 * Bij "model" vanuit een veld moet de aanroeper het veld eerst laten vastleggen
 * (blur): een half ingetypte waarde wordt dan eerst een historiestap en daarna
 * teruggedraaid, wat hetzelfde oplevert als het typen ongedaan maken.
 */
export type UndoRoute = "model" | "veld";

const TEKSTTYPEN = new Set(["", "text", "search", "email", "url", "tel", "password"]);

export function undoRoute(doel: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): UndoRoute {
  if (!doel) return "model";
  if (doel.isContentEditable) return "veld";
  const tag = (doel.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return "veld";
  if (tag === "INPUT") return TEKSTTYPEN.has((doel.type ?? "").toLowerCase()) ? "veld" : "model";
  return "model";
}

/** Moet het element eerst vastleggen (blur) voordat de modelhistorie draait? */
export function moetEerstVastleggen(doel: { tagName?: string } | null | undefined): boolean {
  return (doel?.tagName ?? "").toUpperCase() === "INPUT";
}

/**
 * Een klik op het tekenvlak laat een invoerveld buiten het tekenvlak los.
 *
 * Het tekenvlak roept `preventDefault()` aan op mousedown (slepen, kaderselectie),
 * waardoor de browser de focus níet verplaatst: de cursor bleef in het laatst
 * gebruikte veld staan. Gevolgen: Ctrl+Z na het verslepen van een staaf ging naar
 * dat veld in plaats van naar het model, en getypte cijfers kwamen in het veld.
 *
 * `blur()` laat het veld eerst zijn waarde vastleggen (onBlur-commit), daarna
 * horen sneltoetsen weer bij het model. Velden binnen `binnen` (popovers op het
 * tekenvlak zelf, zoals het maatlijnformulier) blijven staan.
 */
export function laatVeldLos(
  actief: (Element & { blur?: () => void; isContentEditable?: boolean }) | null | undefined,
  binnen?: { contains: (e: Element) => boolean } | null,
): boolean {
  if (!actief || typeof actief.blur !== "function") return false;
  const tag = (actief.tagName ?? "").toUpperCase();
  const isVeld = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || actief.isContentEditable === true;
  if (!isVeld) return false;
  if (binnen?.contains(actief)) return false;
  actief.blur();
  return true;
}
