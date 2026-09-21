/**
 * Eén klik (of Tab) in een invoerveld selecteert de hele waarde, zodat typen de
 * oude waarde meteen vervangt. Geldt voor alle tekst- en getalvelden van de app;
 * een tweede klik in een veld dat al de focus heeft zet gewoon de cursor.
 *
 * Eén plek in plaats van `onFocus` per veld: de eigenschappenpanelen tellen
 * tientallen velden en een vergeten veld gedraagt zich dan anders dan de rest.
 *
 * Uitzetten per veld: `data-geen-selectie` op het element of op een voorouder.
 */

/** Invoertypen waarvan de waarde in één keer vervangen wordt. */
const TYPEN = new Set(["", "text", "number", "search", "tel", "url"]);

/** Het deel van een element dat deze module nodig heeft (ook voor de test). */
export interface VeldAchtig {
  tagName: string;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  value?: string;
  select?: () => void;
  closest?: (selector: string) => unknown;
}

/** Hoort dit element bij focus in zijn geheel geselecteerd te worden? */
export function moetSelecteren(el: VeldAchtig | null | undefined): boolean {
  if (!el || el.tagName !== "INPUT") return false;
  if (!TYPEN.has((el.type ?? "").toLowerCase())) return false;
  if (el.readOnly || el.disabled) return false;
  if (!el.value) return false;
  if (el.closest?.("[data-geen-selectie]")) return false;
  return typeof el.select === "function";
}

/**
 * Zet de luisteraar op het document. Geeft de opruimfunctie terug.
 *
 * De selectie gebeurt een tik later: bij een muisklik plaatst de browser de
 * cursor ná de focusgebeurtenis, en een directe `select()` zou daardoor meteen
 * weer ongedaan gemaakt worden.
 */
export function installeerSelecteerBijFocus(
  doc: Pick<Document, "addEventListener" | "removeEventListener"> & { activeElement?: unknown } = document,
  straks: (f: () => void) => void = (f) => setTimeout(f, 0),
): () => void {
  const opFocus = (e: Event) => {
    const el = e.target as unknown as VeldAchtig;
    if (!moetSelecteren(el)) return;
    straks(() => {
      // Alleen als het veld de focus nog heeft: anders steelt een snelle Tab
      // de selectie van het volgende veld.
      if (doc.activeElement === undefined || doc.activeElement === el) el.select?.();
    });
  };
  doc.addEventListener("focusin", opFocus);
  return () => doc.removeEventListener("focusin", opFocus);
}
