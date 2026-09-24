// Eén startpunt voor de headless Chromium/Edge van de UI-tests.
//
// Edge headless blijft op Windows af en toe hangen (component-updater,
// achtergrondnetwerk van het profiel): dezelfde test deed er de ene keer 1 s over
// en de andere keer liep hij tegen de tijdslimiet aan zonder één check. Daarom:
//   - de achtergronddiensten uit (netwerk, componentupdates, extensies, sync);
//   - per poging een eigen, korte klok (90 s);
//   - bij een verlopen klok nog twee pogingen, met een vers profiel.
// Een echte fout (exitcode ≠ 0 zonder klok) wordt NIET herhaald: die hoort
// zichtbaar te falen.
import { spawnSync } from "node:child_process";

const STIL = [
  "--disable-background-networking", "--disable-component-update", "--disable-extensions",
  "--disable-sync", "--disable-default-apps", "--no-pings", "--metrics-recording-only",
];
export const KLOK_PER_POGING_MS = 90_000;
const POGINGEN = 3;

/** Zelfde vorm als `spawnSync(browser, args, opties)`, met herkansing bij een hang. */
export function startBrowser(browser, args, opties = {}) {
  let laatste;
  for (let poging = 1; poging <= POGINGEN; poging++) {
    // Een vers profiel per herkansing: een half geschreven profiel kan de volgende start ook laten hangen.
    const a = args.map((x) => (poging > 1 && x.startsWith("--user-data-dir=") ? `${x}-poging${poging}` : x));
    laatste = spawnSync(browser, [...STIL, ...a], { ...opties, timeout: KLOK_PER_POGING_MS });
    const verlopen = laatste.error?.code === "ETIMEDOUT" || (laatste.signal && laatste.status === null);
    if (!verlopen) return laatste;
    process.stderr.write(`[headless] poging ${poging} bleef hangen na ${KLOK_PER_POGING_MS / 1000} s; opnieuw\n`);
  }
  return laatste;
}
