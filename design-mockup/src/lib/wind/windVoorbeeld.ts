/**
 * windVoorbeeld — wat het venster van de windgenerator toont en of
 * "Genereren" aan mag, afgeleid uit de invoer die op het scherm staat.
 *
 * WAAROM EEN APARTE, PURE FUNCTIE (issue #29)
 *  Het venster rekende zijn voorbeeld tijdens de render uit, maar de store las
 *  de instellingen uit een ref die pas NA de render (in een effect) werd
 *  bijgewerkt. Het voorbeeld hoorde daardoor steeds bij de vorige invoer, en
 *  een fout die niet meer gold hield "Genereren" uitgeschakeld. De afleiding
 *  krijgt de instellingen nu expliciet mee, zodat voorbeeld, meldingen en de
 *  knop per definitie bij dezelfde invoer horen — en dat is buiten React te
 *  toetsen (test-wind-voorbeeld.mjs).
 */
import {
  genereerWindbelasting,
  type WindGeneratieResultaat, type WindInstellingen, type WindMelding, type WindModelInvoer,
} from "./windGenerator";

export interface WindVoorbeeld {
  /** De generatie-uitkomst, zonder iets in het model te schrijven. */
  resultaat: WindGeneratieResultaat;
  /** Meldingen met niveau "fout": die blokkeren het genereren. */
  fouten: WindMelding[];
  /** Overige meldingen (info en waarschuwing). */
  overige: WindMelding[];
  /** true ⇒ de knop Genereren mag aan. */
  kanGenereren: boolean;
}

export function windVoorbeeld(model: WindModelInvoer, instellingen: WindInstellingen): WindVoorbeeld {
  const resultaat = genereerWindbelasting(model, instellingen);
  const fouten = resultaat.meldingen.filter((m) => m.niveau === "fout");
  const overige = resultaat.meldingen.filter((m) => m.niveau !== "fout");
  return { resultaat, fouten, overige, kanGenereren: resultaat.ok && fouten.length === 0 };
}
