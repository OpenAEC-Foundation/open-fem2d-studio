/**
 * tableTypes — gedeelde typen voor de Tabel-weergave (tabel-editor).
 *
 * De ribbon-tab "Tabel" kiest welke dataset de hoofdweergave toont; de
 * ribbon-hulpknoppen (Export CSV / Kopiëren / Filter) werken op de actieve
 * tabel via de imperatieve TableViewApi die TableView registreert.
 */

/** Datasets die de Tabel-weergave kan tonen — gekozen via de ribbon-knoppen. */
export type TableDataset =
  | "nodes"          // knopen (bewerkbaar)
  | "elements"       // staven/elementen (bewerkbaar)
  | "plates"         // platen (alleen-lezen + verwijderen)
  | "pointLoads"     // puntlasten + puntmomenten (bewerkbaar)
  | "lineLoads"      // lijnlasten incl. deellast-kolommen (bewerkbaar)
  | "thermalLoads"   // temperatuurlasten (bewerkbaar)
  | "reactions"      // oplegreacties (alleen-lezen, per combinatie/omhullende)
  | "displacements"  // knoopverplaatsingen (alleen-lezen, per combinatie)
  | "forces";        // staafkrachten (alleen-lezen, per combinatie/omhullende)

/**
 * Imperatieve API van de gemonteerde TableView. App.tsx houdt hier een ref
 * op zodat de ribbon-knoppen de actieve tabel kunnen exporteren/kopiëren of
 * het filterveld kunnen focussen.
 */
export interface TableViewApi {
  /** Download de actieve (gefilterde) tabel als CSV-bestand. */
  exportCsv: () => void;
  /** Kopieer de actieve (gefilterde) tabel als TSV naar het klembord. */
  copyTable: () => void;
  /** Focus + selecteer het filterveld boven de tabel. */
  focusFilter: () => void;
}
