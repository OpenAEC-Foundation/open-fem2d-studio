/**
 * normAanduidingen — de normnaad aan de frontendkant.
 *
 * WAT HIER STAAT
 * De keuze van de nationale bijlage, en de normaanduidingen die bij die keuze
 * horen. Eén plaats, in plaats van de acht waarop ze tot september 2026 stonden
 * (drie constanten hier, drie in `report/src/lib.rs`, vier i18n-kopieën en een
 * derde schrijfwijze in een crate-doc). Hout en beton waren daardoor al
 * uiteengelopen: het scherm noemde "NEN-EN 1995-1-1+C1+A1:2011/NB:2013" en het
 * PDF-omslag "NEN-EN 1995-1-1:2005+A2:2014+NB:2013 nl" — twee uitgaven van
 * dezelfde norm, in hetzelfde rapport.
 *
 * WAAROM DE GETALLEN NIET HIER STAAN
 * De nationaal bepaalde parameters (γ_M, ψ, doorbuigingsgrenzen, k_cr,
 * dekkingseisen) horen in de rekenkern en staan in de Rust-crate
 * `nationale-bijlage`. Deze module draagt alleen wat de frontend zelf nodig
 * heeft: de KEUZE, en de TEKST die bij die keuze hoort.
 *
 * HOE DIT NIET UIT DE PAS KAN LOPEN
 * `test-rapportnormen.mjs` leest
 * `src-tauri/crates/nationale-bijlage/src/aanduiding.rs` als bronbestand en
 * legt de waarden hieronder ernaast. Wie hier een aanduiding wijzigt zonder de
 * crate, krijgt een rood testresultaat in plaats van een rapport dat zichzelf
 * tegenspreekt.
 */

/** De landcode van een nationale bijlage, zoals hij in het projectbestand staat. */
export type NationaleBijlageCode = "NL";

/**
 * De bijlagen waarvan de rekenwaarden werkelijk gevuld zijn.
 *
 * Eén rij vandaag. De naad is op meer gebouwd: alles wat de keuze door de
 * keten draagt (projectbestand, rekeninstellingen, toetsinvoer, MCP-schema)
 * werkt met deze lijst en niet met de aanname "het is altijd NL". Een tweede
 * rij vullen betekent: de NDP's in de Rust-crate `nationale-bijlage` en de
 * aanduidingen hieronder.
 */
export const BIJLAGEN_GEVULD: readonly NationaleBijlageCode[] = ["NL"];

/** De bijlage die geldt als een project er geen noemt (bestanden van vóór de naad). */
export const STANDAARD_BIJLAGE: NationaleBijlageCode = "NL";

/** De normaanduidingen die bij één nationale bijlage horen. */
export interface NormAanduidingen {
  /** Land, zoals het in de projectgegevens van het rapport staat. */
  land: string;
  /** Hoe de bijlage in lopende tekst heet. */
  bijlageNaam: string;
  /** Wat er in de keuzelijst van de projectinstellingen staat. */
  keuzelabel: string;
  /** Korte normlabels, voor tabelkolommen. */
  staalKort: string;
  houtKort: string;
  betonKort: string;
  /** Volledige aanduidingen, zonder taalaanduiding. */
  staalVol: string;
  houtVol: string;
  betonVol: string;
}

/**
 * De Nederlandse rij. Woordelijk gelijk aan `AANDUIDINGEN_NL` in
 * `src-tauri/crates/nationale-bijlage/src/aanduiding.rs`.
 */
const NL: NormAanduidingen = {
  land: "Nederland",
  bijlageNaam: "Nederlandse nationale bijlage",
  keuzelabel: "Nederland (NB)",
  staalKort: "EN 1993-1-1",
  houtKort: "EN 1995-1-1",
  betonKort: "EN 1992-1-1",
  staalVol: "NEN-EN 1993-1-1+C2+A1/NB:2016",
  houtVol: "NEN-EN 1995-1-1:2005+A2:2014+NB:2013",
  betonVol: "NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020",
};

const RIJEN: Record<NationaleBijlageCode, NormAanduidingen> = { NL };

/**
 * De aanduidingen bij een bijlage.
 *
 * GEEN stille terugval: een code die niet gevuld is levert een fout op en niet
 * de Nederlandse rij. Zou hij dat wel doen, dan kon een rapport een bijlage
 * noemen en de aanduidingen van een andere tonen. Dezelfde regel als in de
 * Rust-crate `nationale-bijlage`.
 */
export function aanduidingen(code: NationaleBijlageCode): NormAanduidingen {
  const rij = RIJEN[code];
  if (!rij) {
    throw new Error(
      `nationale bijlage "${code}" is niet gevuld: deze uitgave kent alleen ` +
        `${BIJLAGEN_GEVULD.join(", ")}. Er wordt niet teruggevallen op een andere bijlage, ` +
        `want dan zou het rapport getallen dragen die niet bij de genoemde bijlage horen.`,
    );
  }
  return rij;
}

/**
 * De bijlage uit een projectbestand of een instelling, of `null` als er geen
 * staat.
 *
 * Een ONBEKENDE waarde geeft een fout in plaats van `null`: "niets gekozen" en
 * "iets gekozen dat deze uitgave niet kan" zijn verschillende gevallen, en het
 * tweede mag niet stil op Nederland uitkomen.
 */
export function bijlageUitBestand(waarde: unknown): NationaleBijlageCode | null {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const code = String(waarde);
  if ((BIJLAGEN_GEVULD as readonly string[]).includes(code)) {
    return code as NationaleBijlageCode;
  }
  throw new Error(
    `nationale bijlage "${code}" is niet gevuld: deze uitgave kent alleen ` +
      `${BIJLAGEN_GEVULD.join(", ")}.`,
  );
}
