/**
 * zichtbaarheid.ts — het venster Zichtbaarheid (issue #47): welke
 * weergave-instellingen er zijn, in welke groep, en welke per gebruiker
 * onthouden worden.
 *
 * ÉÉN BRON. Elke rij in het venster is een vlag in `displayFlags` — dezelfde
 * vlag die de schakelaar in de verkenner (Resultaten → Weergave op canvas)
 * zet en die het tekenvlak leest. Het venster heeft geen eigen toestand; twee
 * plekken tonen dus altijd hetzelfde. De enige uitzondering is "Stramien": dat
 * is een eigenschap van het PROJECT (`structuralGrid.enabled`, ook in het
 * stramienvenster) en wordt alleen meegeschakeld.
 *
 * ONTHOUDEN. De model-lagen (groepen Labels en Geometrie) worden per gebruiker
 * bewaard in de bestaande voorkeuren (`store.ts`, preferences.json), niet in
 * het projectbestand: wie de knoopnummers uitzet, wil dat ook in het volgende
 * project. De resultaatlagen worden NIET bewaard; die zetten de tabs Model en
 * Resultaten zelf aan en uit (lib/weergaveModel.ts).
 */
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "../components/fem/FemResultsOverlay";

/** De vlaggen van displayFlags die aan/uit zijn (geen schalen of keuzelijsten). */
export type AanUitVlag = {
  [K in keyof DisplayFlags]-?: DisplayFlags[K] extends boolean ? K : never;
}[keyof DisplayFlags];

export type ZichtbaarheidGroep = "labels" | "geometrie" | "resultaten";

export interface ZichtbaarheidRij {
  /** Een vlag van displayFlags, of "stramien" (projectinstelling). */
  sleutel: AanUitVlag | "stramien";
  /** i18n-sleutel (namespace common) van het label, of `letterlijk`. */
  label: string;
  /** Vaste tekst in plaats van een vertaling (My, Vz, N, φy). */
  letterlijk?: string;
  /** i18n-sleutel van de toelichting. */
  hint: string;
  /** Subinstelling: alleen van betekenis als deze vlag aan staat. */
  onder?: AanUitVlag;
  /** Alleen tonen als het model platen heeft. */
  alleenMetPlaten?: boolean;
}

export const ZICHTBAARHEID_GROEPEN: ZichtbaarheidGroep[] = ["labels", "geometrie", "resultaten"];

export const ZICHTBAARHEID: Record<ZichtbaarheidGroep, ZichtbaarheidRij[]> = {
  labels: [
    { sleutel: "knoopnummers", label: "zichtbaarheid.knoopnummers", hint: "zichtbaarheid.knoopnummersHint" },
    { sleutel: "staafnummers", label: "zichtbaarheid.staafnummers", hint: "zichtbaarheid.staafnummersHint" },
    { sleutel: "profielLabels", label: "tree.rowProfileName", hint: "tree.rowProfileNameHint" },
    { sleutel: "lastWaarden", label: "zichtbaarheid.lastWaarden", hint: "zichtbaarheid.lastWaardenHint" },
    { sleutel: "peilmaten", label: "zichtbaarheid.peilmaten", hint: "zichtbaarheid.peilmatenHint" },
    { sleutel: "maatlijnen", label: "zichtbaarheid.maatlijnen", hint: "zichtbaarheid.maatlijnenHint" },
  ],
  geometrie: [
    { sleutel: "aanzicht", label: "tree.rowAanzicht", hint: "tree.rowAanzichtHint" },
    { sleutel: "aanzichtBreedte", label: "zichtbaarheid.aanzichtBreedte", hint: "zichtbaarheid.aanzichtBreedteHint", onder: "aanzicht" },
    { sleutel: "kipsteunen", label: "tree.rowKipsteunen", hint: "tree.rowKipsteunenHint" },
    { sleutel: "opleggingen", label: "zichtbaarheid.opleggingen", hint: "zichtbaarheid.opleggingenHint" },
    { sleutel: "scharnieren", label: "zichtbaarheid.scharnieren", hint: "zichtbaarheid.scharnierenHint" },
    { sleutel: "stramien", label: "zichtbaarheid.stramien", hint: "zichtbaarheid.stramienHint" },
  ],
  resultaten: [
    { sleutel: "deflection", label: "tree.rowDeflection", hint: "tree.rowDeflectionHint" },
    { sleutel: "M", label: "", letterlijk: "My", hint: "tree.rowMomentHint" },
    { sleutel: "V", label: "", letterlijk: "Vz", hint: "tree.rowShearHint" },
    { sleutel: "N", label: "", letterlijk: "N", hint: "tree.rowAxialHint" },
    { sleutel: "rotation", label: "", letterlijk: "φy", hint: "tree.rowRotationHint" },
    { sleutel: "EI", label: "tree.rowEI", hint: "tree.rowEIHint" },
    { sleutel: "reactions", label: "tree.rowReactions", hint: "tree.rowReactionsHint" },
    { sleutel: "uc", label: "resultView.ucLabel", hint: "resultView.ucCombinations" },
    { sleutel: "plaatContour", label: "tree.rowPlateStress", hint: "tree.rowPlateStressHint", alleenMetPlaten: true },
    { sleutel: "showExtremes", label: "tree.extremes", hint: "tree.extremesTitle" },
    { sleutel: "snedeTekens", label: "tree.signConvention", hint: "tree.signConventionTitle" },
  ],
};

/** Sleutel in de gebruikersvoorkeuren (store.ts). */
export const WEERGAVE_VOORKEUREN_SLEUTEL = "weergaveVoorkeuren";

/** De vlaggen die per gebruiker onthouden worden: Labels en Geometrie. */
export const WEERGAVE_VOORKEUREN: AanUitVlag[] = [...ZICHTBAARHEID.labels, ...ZICHTBAARHEID.geometrie]
  .map((r) => r.sleutel)
  .filter((k): k is AanUitVlag => k !== "stramien");

/**
 * Staat een vlag aan? Een vlag die standaard AAN staat, telt als aan zolang
 * hij niet expliciet `false` is (een oudere toestand zonder het veld leest
 * als aan); een vlag die standaard UIT staat, alleen bij `true`. Zo lezen het
 * tekenvlak, de verkenner en het venster dezelfde vlag hetzelfde.
 */
export function vlagAan(flags: DisplayFlags, k: AanUitVlag): boolean {
  return DEFAULT_DISPLAY_FLAGS[k] ? flags[k] !== false : flags[k] === true;
}

/** Dezelfde vlaggen met één vlag aan of uit. */
export function zetVlag(flags: DisplayFlags, k: AanUitVlag, aan: boolean): DisplayFlags {
  return { ...flags, [k]: aan };
}

/** Wat er onthouden wordt: de model-lagen, als platte booleans. */
export function voorkeurenVan(flags: DisplayFlags): Record<string, boolean> {
  const uit: Record<string, boolean> = {};
  for (const k of WEERGAVE_VOORKEUREN) uit[k] = vlagAan(flags, k);
  return uit;
}

/**
 * De bewaarde voorkeuren over de vlaggen heen gelegd. Alleen bekende sleutels
 * met een booleaanse waarde tellen; iets anders (een oudere of beschadigde
 * opslag) wordt genegeerd, en dan geldt de standaard.
 */
export function metVoorkeuren(flags: DisplayFlags, opgeslagen: unknown): DisplayFlags {
  if (!opgeslagen || typeof opgeslagen !== "object" || Array.isArray(opgeslagen)) return flags;
  const o = opgeslagen as Record<string, unknown>;
  let uit = flags;
  for (const k of WEERGAVE_VOORKEUREN) {
    if (typeof o[k] === "boolean") uit = zetVlag(uit, k, o[k] as boolean);
  }
  return uit;
}
