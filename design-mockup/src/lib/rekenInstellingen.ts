/**
 * rekenInstellingen — de "versie" van alles buiten het model zelf dat de
 * uitkomst van een berekening bepaalt.
 *
 * WAAROM DIT BESTAAT
 * Resultaten en unity checks werden alleen gewist als knopen, staven,
 * opleggingen, lasten of platen veranderden. Na een wijziging van een
 * combinatiefactor, het type van een belastinggeval, het eigen gewicht, de
 * scheefstand, het analysetype of de segmentlengte bleven de oude UC-badges en
 * "Berekend om" gewoon staan. Gemeten in de draaiende app: Q-factor in 6.10b van
 * 1,5 naar 3,0 — badges ongewijzigd; pas na Berekenen hout 0,39 → 0,56. Het
 * rapport en de IFC-export kregen de oude getallen naast de nieuwe
 * uitgangspunten.
 *
 * Er waren TWEE invalidatie-effecten (in `App.tsx` en in `useFemStore.ts`) met
 * elk een eigen, handgeschreven lijst afhankelijkheden, en beide misten
 * dezelfde velden. Een derde lijst naast die twee zou dezelfde fout opnieuw
 * mogelijk maken. Daarom één versie die beide effecten lezen.
 *
 * WAAROM EEN NIEUW VELD NIET VERGETEN KAN WORDEN
 * `VELDEN` is een `Record<keyof RekenInstellingen, true>`: voeg je een veld
 * toe aan de interface zonder het hier te noemen, dan compileert dit bestand
 * niet meer. En elke aanroeper moet elk veld opgeven, want ze zijn verplicht.
 *
 * Een wijziging die de uitkomst NIET verandert (bijvoorbeeld een andere naam
 * van een belastinggeval) kan hier ook een nieuwe versie geven. Dat kost
 * hooguit een herberekening; een vergeten veld kost een verkeerde UC.
 */
import type { Analysetype, LoadCase } from "../components/fem/femTypes";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { ScheefstandBron } from "./scheefstandNorm";

/** Alles buiten de modelgeometrie en de lasten dat de uitkomst bepaalt. */
export interface RekenInstellingen {
  /** Type per geval bepaalt de standaardcombinaties en waar het eigen gewicht landt. */
  loadCases: readonly LoadCase[];
  /** De factoren per combinatie (6.10a/b, 6.14b–6.16b). */
  combinations: readonly LoadCombination[];
  selfWeightEnabled: boolean;
  analysetype: Analysetype;
  /** Segmentlengte van de fysisch niet-lineaire betonberekening. */
  betonSegmentLengteMm: number;
  scheefstandEnabled: boolean;
  scheefstandNoemer: number;
  scheefstandRichting: 1 | -1;
  scheefstandBron: ScheefstandBron;
  scheefstandHoogteM: number | null;
  scheefstandAantalElementen: number | null;
  /**
   * Gevolgklasse, CC1/CC2/CC3: de klasse waarmee de standaardcombinaties
   * rekenen (in de app die uit de projectinstellingen). Volgens NEN-EN 1990 NB
   * tabel NB.4/NB.5 bepaalt zij de partiële factoren, en de staalkern krijgt
   * haar als `consequence_class`; een wijziging laat de resultaten vervallen.
   * `null` = niet ingesteld.
   */
  gevolgklasse: string | null;
}

/** Elk veld van `RekenInstellingen` — zie de kop voor waarom dit een Record is. */
const VELDEN: Record<keyof RekenInstellingen, true> = {
  loadCases: true,
  combinations: true,
  selfWeightEnabled: true,
  analysetype: true,
  betonSegmentLengteMm: true,
  scheefstandEnabled: true,
  scheefstandNoemer: true,
  scheefstandRichting: true,
  scheefstandBron: true,
  scheefstandHoogteM: true,
  scheefstandAantalElementen: true,
  gevolgklasse: true,
};

/** De veldnamen, voor tests die elk veld afzonderlijk willen wijzigen. */
export const REKENINSTELLINGEN_VELDEN = Object.keys(VELDEN) as (keyof RekenInstellingen)[];

/**
 * Een tekst die verandert zodra één van de instellingen verandert. Maps (de
 * factoren van een combinatie) worden als gesorteerde paren geschreven, zodat
 * de volgorde waarin factoren zijn gezet niet meetelt.
 */
export function rekenInstellingenVersie(instellingen: RekenInstellingen): string {
  const geordend = REKENINSTELLINGEN_VELDEN.map((k) => [k, instellingen[k]] as const);
  return JSON.stringify(geordend, (_sleutel, waarde) =>
    waarde instanceof Map
      ? [...waarde.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      : waarde,
  );
}
