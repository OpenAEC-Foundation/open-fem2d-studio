/**
 * rapportDatum.ts — de rapportdatum voluit, in de taal van de app (issue #20).
 *
 * WAT HIER MISGING
 * ----------------
 * Het titelblad van het live rapport zette de datum voluit ("16 september
 * 2026"), de kop van elke pagina ruw ("2026-09-16"). Twee notaties voor één
 * gegeven. Titelblad (`sections/ProjectSection`) en paginakop (`ReportShell`)
 * roepen nu allebei [`datumVoluit`] aan.
 *
 * ÉÉN BRON VOOR DE MAANDNAMEN
 * ---------------------------
 * Het scherm gebruikt `Intl.DateTimeFormat`; hier staat geen eigen lijst met
 * maandnamen. De PDF wordt in Rust gezet en heeft die lijst wél nodig: die
 * staat uitsluitend in `report::datum` (src-tauri/crates/report/src/datum.rs).
 * Dat beide dezelfde notatie opleveren, bewaakt de gedeelde proeftabel
 * `src-tauri/crates/report/tests/data/datumnotatie.json`, gelezen door
 * `test-rapport-datum.mjs` én `report/tests/datum_kop_pdf.rs`.
 *
 * WAT NIET TE LEZEN IS, BLIJFT STAAN
 * ----------------------------------
 * Alleen een bestaande kalenderdatum `JJJJ-MM-DD` (wat het datumveld van de
 * projectgegevens oplevert) wordt omgezet, precies zoals aan de Rust-kant.
 * Vroeger ging de tekst door `new Date(...)`, en die leest ook "2026-02-31"
 * (als 3 maart) en rekende in de tijdzone van de computer — ten westen van
 * Greenwich stond er dan de dag ervoor. Hier wordt in UTC geformatteerd.
 */

/** De vier talen van de app; dezelfde codes als `report::RapportTaal`. */
export const RAPPORT_TALEN = ["nl", "en", "de", "fr"] as const;
export type RapportTaalCode = (typeof RAPPORT_TALEN)[number];

/**
 * De taal van het rapport uit de taal van i18next ("nl", "en-GB", …).
 *
 * Een taal buiten de vier wordt Engels: dat is `fallbackLng` in
 * `i18n/config.ts`, dus de taal waarin de rest van het rapport dan ook staat.
 */
export function rapportTaal(taal: string | undefined): RapportTaalCode {
  const basis = (taal ?? "").toLowerCase().split("-")[0];
  return (RAPPORT_TALEN as readonly string[]).includes(basis)
    ? (basis as RapportTaalCode)
    : "en";
}

/** `JJJJ-MM-DD` → UTC-tijdstip, alleen als die dag in de kalender bestaat. */
function leesIso(ruw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ruw);
  if (!m) return null;
  const [jaar, maand, dag] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  // Date.UTC rolt een dag die niet bestaat door naar de volgende maand; dan
  // klopt de teruggelezen datum niet meer met de invoer.
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) {
    return null;
  }
  return d;
}

/**
 * De datum voluit in de taal van het rapport: "16 september 2026",
 * "September 16, 2026", "16. September 2026", "16 septembre 2026".
 *
 * Leeg blijft leeg; wat geen kalenderdatum `JJJJ-MM-DD` is, komt woordelijk
 * terug.
 */
export function datumVoluit(ruw: string, taal: string | undefined): string {
  const d = leesIso(ruw);
  if (!d) return ruw;
  return d.toLocaleDateString(rapportTaal(taal), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
