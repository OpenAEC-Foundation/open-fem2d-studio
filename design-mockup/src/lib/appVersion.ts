/**
 * appVersion — één bron voor het versienummer van de app.
 *
 * - Desktop (Tauri): de bundelversie uit tauri.conf.json via `getVersion()`.
 * - Browser/dev: fallback op de versie in package.json.
 *
 * TitleBar en StatusBar consumeren allebei deze functie zodat er nooit twee
 * verschillende (hardcoded) versienummers in de UI kunnen staan.
 */
import pkg from "../../package.json";

export async function fetchAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return (pkg as { version?: string }).version ?? "";
  }
}
