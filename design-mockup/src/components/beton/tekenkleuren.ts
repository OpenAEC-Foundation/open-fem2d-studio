/**
 * tekenkleuren.ts — het kleurenpalet van de betonfiguren, in twee smaken.
 *
 * `DoorsnedeTekening`, `MNKappaGrafiek` en `InteractieGrafiek` worden op twee
 * plaatsen getekend die tegengestelde eisen stellen:
 *
 *  - het staafeigenschappen-paneel volgt het app-thema (licht én donker), dus
 *    daar moeten de kleuren uit de theme-tokens komen — [`THEMA_KLEUREN`];
 *  - het rapport is bewust géén schermweergave maar papier: vaste
 *    documentkleuren op wit, ook wanneer de app in donker staat, en ook
 *    leesbaar in grijstinten — [`RAPPORT_KLEUREN`].
 *
 * De rapportkleuren zijn dezelfde als in de overige rapportfiguren
 * (CltOpbouwTekening, SpanningDoorsnedeTekening), zodat de figuren in één
 * document niet uit elkaar vallen.
 */

export interface BetonTekenKleuren {
  /** Vlak van het beton in de doorsnede. */
  betonVlak: string;
  /**
   * Omtrek van de doorsnede en de hoofdwapening — alles wat ÓP `betonVlak`
   * ligt. Apart van [`lijn`] omdat dat vlak een vaste lichte kleur heeft: een
   * omtrek in de themakleur zou in het donkere thema bijna wit op lichtgrijs
   * staan en de staven onzichtbaar maken.
   */
  betonLijn: string;
  /** Lijn op de ACHTERGROND van het paneel (grafiekas, referentielijn). */
  lijn: string;
  /** Beugel; ligt eveneens op `betonVlak`. */
  beugel: string;
  /** Gewone tekst (waarden in het aanwijskader). */
  tekst: string;
  /** Rijlabels ("3Ø16") en puntlabels bij een grafiek. */
  tekstZwak: string;
  /** Maatteksten en aslabels — één stap lichter dan `tekstZwak`. */
  tekstMaat: string;
  /** Maatlijnen, pijlen en hulplijnen. */
  maatlijn: string;
  /** Rasterlijnen en assen van een grafiek. */
  raster: string;
  /** De reeks zelf: de M-κ-kromme en de interactie-omhullende. */
  reeks: string;
  /** Vlak áchter een markering (open punt, aanwijskader). */
  vlak: string;
  /** Het rekenpunt (N_Ed, M_Ed) en de M_Ed-referentielijn. */
  rekenpunt: string;
}

/**
 * Schermweergave: alles uit de theme-tokens, met de oude vaste terugval.
 *
 * `betonVlak` is de enige die géén themakleur is: `--theme-beton-vlak` staat
 * in `themes.css` op #C0C0C0 (192-192-192) en is in élk thema hetzelfde, want
 * beton is een materiaal en geen thema. Diezelfde token gebruikt
 * `ProfielMiniatuur` in de profielkiezer, zodat dezelfde doorsnede daar en
 * hier dezelfde kleur heeft.
 */
export const THEMA_KLEUREN: BetonTekenKleuren = {
  betonVlak: "var(--theme-beton-vlak, #C0C0C0)",
  betonLijn: "var(--theme-materiaal-lijn, #2A2A30)",
  lijn: "var(--theme-text, #39424e)",
  beugel: "var(--theme-materiaal-beugel, #55555E)",
  tekst: "var(--theme-text, #333)",
  tekstZwak: "var(--theme-text-secondary, #555)",
  tekstMaat: "var(--theme-text-muted, #666)",
  maatlijn: "var(--theme-text-faint, #888)",
  raster: "var(--theme-border, #ddd)",
  reeks: "var(--theme-accent, #D97706)",
  vlak: "var(--theme-surface, #fff)",
  rekenpunt: "var(--theme-text-muted, #666)",
};

/** Papierweergave: vaste documentkleuren, onafhankelijk van het app-thema. */
export const RAPPORT_KLEUREN: BetonTekenKleuren = {
  betonVlak: "#dfe4ea",
  betonLijn: "#39424e",
  lijn: "#39424e",
  beugel: "#5b6470",
  tekst: "#333",
  tekstZwak: "#555",
  tekstMaat: "#555",
  maatlijn: "#5b6470",
  raster: "#c8ccd2",
  // Donkerder dan de scherm-amber (#D97706): op wit papier en in grijstinten
  // blijft die te licht tegenover de zwarte tekst.
  reeks: "#b45309",
  vlak: "#ffffff",
  rekenpunt: "#b91c1c",
};
