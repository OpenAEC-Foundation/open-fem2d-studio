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
