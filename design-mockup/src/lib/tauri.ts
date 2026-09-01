/**
 * tauri.ts — runtime-detectie van de Tauri desktop-shell.
 *
 * De app draait in twee omgevingen:
 *  - browser (vite dev op :1440 of een statische build): geen Rust-backend,
 *    dus geen invoke-commands. Normtoetsing en PDF-generatie zijn dan niet
 *    beschikbaar en moeten een nette melding geven i.p.v. een kale
 *    invoke-fout.
 *  - Tauri (WebView2): window.__TAURI_INTERNALS__ bestaat en alle commands
 *    uit src-tauri/src/lib.rs zijn bereikbaar.
 */
export function isTauriApp(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

/** Nederlandse melding voor functies die de desktop-app vereisen. */
export const DESKTOP_ONLY_MSG =
  "Toetsing vereist de desktop-app. Start Open FEM2D Studio als desktop-applicatie (Tauri) om de EN 1993/EN 1995-rekenkern te gebruiken.";
