/**
 * belastingduur.ts — de belastingduurklasse per UGT-combinatie voor de
 * houttoetsing (NEN-EN 1995-1-1 3.1.3(2) en tabel 2.2 van de NB).
 *
 * WAAROM DIT BESTAAT
 * k_mod hangt af van de belastingsduur. Tot september 2026 kreeg elke houten
 * staaf één klasse voor alle combinaties, standaard "middellang". 3.1.3(2)
 * zegt: bij een combinatie van belastingen uit verschillende duurklassen
 * "behoort voor k mod de waarde te zijn gekozen die overeenstemt met de
 * kortste belastingsduur" — per combinatie dus. Eén klasse maakt de
 * combinatie met alleen de blijvende belasting te gunstig (k_mod 0,80 waar
 * 0,60 hoort; basisaudit nr 18) en een combinatie met sneeuw of wind leidend te
 * streng (0,80 waar 0,90 hoort; nr 15).
 *
 * Deze afleiding staat in TypeScript en niet in de kern, omdat alleen hier de
 * belastinggevallen bekend zijn. App, sidecar (check_fem_model) en de
 * profielvarianten roepen dezelfde functie aan.
 *
 * DE TOEWIJZING — TABEL 2.2 IN DE VERSIE VAN DE NB
 * In NEN-EN 1995-1-1+C1+A1:2011/NB:2013 is de EN-tabel 2.2 (middellang =
 * opgelegde vloerbelasting en sneeuw; kort = sneeuw en wind; zeer kort = wind
 * en bijzondere belasting) doorgestreept en vervangen door de NB-tabel, en de
 * zin in de opmerking bij 2.3.1.2(2) dat de nationale bijlage de toewijzing van
 * sneeuw en wind mag geven, is geschrapt. Bevestigd in de paginaweergave van de
 * PDF (blz. 30-31), niet alleen in de platte tekst. De NB-tabel:
 *   blijvend    — eigen gewicht
 *   lang        — opslag
 *   middellang  — opgelegde vloerbelasting
 *   kort        — sneeuw, wind
 *   zeer kort   — bijzondere belasting
 *
 * Wat de tabel NIET noemt, en wat hier dus een keuze is (in de basis zichtbaar):
 *   - gebruikscategorie H (daken): KORT. Besluit van de constructeur
 *     (september 2026): onderhoudsbelasting op daken is kortdurend;
 *   - F, G, C-menigte en industrie-kort: middellang. De tabel geeft er geen
 *     klasse voor; de langere van de twee kandidaten (middellang of kort) is de
 *     veilige kant, want een langere klasse geeft een lagere k_mod;
 *   - type "overig" (of geen type): geen klasse. Zo'n geval maakt de duur niet
 *     korter; het staat als notitie in de basis. Het heeft in de
 *     standaardcombinaties ook geen factor (zie meldingenBelastinggevallen).
 * Categorie A t/m D is "opgelegde vloerbelasting" (middellang); E en
 * industrie-lang zijn "opslag" (lang).
 *
 * LEGE GEVALLEN
 * Een belastinggeval zonder werkzame last wordt door de solve overgeslagen
 * (engine.ts, `solveAllCases`); het draagt niets bij en mag de combinatie dus
 * niet korter maken. Anders zou "G + 1,5·W" met een leeg windgeval kort worden
 * terwijl er alleen G werkt.
 *
 * EEN OPGEGEVEN KLASSE IS EEN ONDERGRENS
 * `checkConfig.loadDuration` op de staaf mag de afgeleide duur alleen
 * VERLENGEN. Een opgegeven "kort" op de combinatie met alleen G zou precies de
 * fout uit de audit terugbrengen (k_mod 0,90 op 1,35·G).
 */
import type { LoadCase } from "../components/fem/femTypes";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { LoadDurationClass } from "./types/timber/LoadDurationClass";
import type { CombinationLoadDuration } from "./types/timber/CombinationLoadDuration";

/** Van lang naar kort; de index is de rangorde. */
export const DUURKLASSEN: readonly LoadDurationClass[] = [
  "Permanent", "LongTerm", "MediumTerm", "ShortTerm", "Instantaneous",
];

/** Dezelfde woorden als het rapport (LOAD_DURATION_LABELS, houthoofdstuk.rs). */
export const DUURKLASSE_NAAM: Record<LoadDurationClass, string> = {
  Permanent: "blijvend",
  LongTerm: "lang",
  MediumTerm: "middellang",
  ShortTerm: "kort",
  Instantaneous: "zeer kort",
};

const rang = (d: LoadDurationClass) => DUURKLASSEN.indexOf(d);

/** De langste (veilige kant, laagste k_mod) van een lijst klassen. */
export function langsteKlasse(klassen: readonly LoadDurationClass[]): LoadDurationClass {
  return klassen.reduce((a, b) => (rang(b) < rang(a) ? b : a), "Instantaneous" as LoadDurationClass);
}

type GevalInvoer = Pick<LoadCase, "id" | "name" | "type"> & Partial<Pick<LoadCase, "categorie">>;

/** De klasse van één belastinggeval, of `null` als het geen klasse heeft. */
export interface GevalDuur {
  klasse: LoadDurationClass | null;
  /** Waarom, leesbaar: "sneeuw (NB tabel 2.2)". */
  reden: string;
}

/** De klasse van één belastinggeval volgens de NB-tabel 2.2 (zie de kop). */
export function duurklasseVanGeval(lc: Pick<LoadCase, "type"> & Partial<Pick<LoadCase, "categorie">>): GevalDuur {
  switch (lc.type) {
    case "dead":
      return { klasse: "Permanent", reden: "blijvend: eigen gewicht (NB tabel 2.2)" };
    case "snow":
      return { klasse: "ShortTerm", reden: "kort: sneeuw (NB tabel 2.2)" };
    case "wind":
      return { klasse: "ShortTerm", reden: "kort: wind (NB tabel 2.2)" };
    case "live": {
      const cat = lc.categorie ?? "A";
      switch (cat) {
        case "A": case "B": case "C": case "D":
          return {
            klasse: "MediumTerm",
            reden: `middellang: opgelegde vloerbelasting, categorie ${cat}${lc.categorie ? "" : " (geen categorie = A)"} (NB tabel 2.2)`,
          };
        case "E": case "industrie-lang":
          return { klasse: "LongTerm", reden: `lang: opslag, categorie ${cat} (NB tabel 2.2)` };
        case "H":
          return {
            klasse: "ShortTerm",
            reden:
              "kort: onderhoudsbelasting op daken, categorie H — tabel 2.2 noemt daken niet; " +
              "kortdurend is een besluit van de constructeur (september 2026)",
          };
        default:
          return {
            klasse: "MediumTerm",
            reden:
              `middellang: categorie ${cat} staat niet in tabel 2.2; veilig-zijdig de langere ` +
              "klasse aangehouden (een langere klasse geeft een lagere k_mod)",
          };
      }
    }
    default:
      return {
        klasse: null,
        reden: `type ${lc.type === "other" ? '"overig"' : "onbekend"} heeft geen belastingduurklasse en maakt de duur niet korter`,
      };
  }
}

const gevalNaam = (lc: GevalInvoer) => `geval ${lc.id} "${lc.name}"`;

/** Tussenuitkomst voor één combinatie: klasse, basis en of er blijvend in zit. */
interface Afleiding {
  klasse: LoadDurationClass;
  basis: string;
  /** Alleen blijvende belasting met werkzame last draagt bij. */
  alleenBlijvend: boolean;
}

function leidAf(
  combinatie: LoadCombination,
  gevallen: ReadonlyMap<number, GevalInvoer>,
  gevuld: ((id: number) => boolean) | undefined,
): Afleiding {
  const dragend: { lc: GevalInvoer; duur: GevalDuur }[] = [];
  const notities: string[] = [];
  for (const [id, factor] of combinatie.factors) {
    if (factor === 0) continue;
    const lc = gevallen.get(id);
    if (!lc) {
      notities.push(`geval ${id} bestaat niet en telt niet mee`);
      continue;
    }
    if (gevuld && !gevuld(id)) {
      notities.push(`${gevalNaam(lc)} heeft geen werkzame last en telt niet mee`);
      continue;
    }
    const duur = duurklasseVanGeval(lc);
    if (duur.klasse === null) {
      notities.push(`${gevalNaam(lc)}: ${duur.reden}`);
      continue;
    }
    dragend.push({ lc, duur });
  }
  if (!gevuld) {
    notities.push(
      "of een geval een werkzame last heeft is niet meegegeven; elk geval met een factor telt mee",
    );
  }

  let klasse: LoadDurationClass;
  let basis: string;
  if (dragend.length === 0) {
    klasse = "Permanent";
    basis =
      "geen belastinggeval met werkzame last en een duurklasse; blijvend aangehouden " +
      "(de langste klasse, veilig-zijdig)";
  } else {
    klasse = dragend.reduce((a, d) => (rang(d.duur.klasse!) > rang(a) ? d.duur.klasse! : a), "Permanent" as LoadDurationClass);
    const bepalend = dragend.find((d) => d.duur.klasse === klasse)!;
    basis =
      klasse === "Permanent"
        ? `alleen blijvende belasting: ${gevalNaam(bepalend.lc)}, ${bepalend.duur.reden}`
        : `kortste: ${gevalNaam(bepalend.lc)}, ${bepalend.duur.reden}`;
  }
  if (notities.length > 0) basis += `; ${notities.join("; ")}`;
  const alleenBlijvend = dragend.length > 0 && dragend.every((d) => d.duur.klasse === "Permanent");
  return { klasse, basis, alleenBlijvend };
}

/**
 * De belastingduurklasse per UGT-combinatie, met de basis erbij.
 *
 * - `combinaties`: alleen de UGT-combinaties tellen; BGT-combinaties worden
 *   overgeslagen (k_mod hoort bij de sterktetoets).
 * - `gevuld`: geeft `true` voor een geval met een werkzame last — de sleutels
 *   van `perCase` uit de solve. Ontbreekt de functie, dan telt elk geval met
 *   een factor mee en zegt de basis dat.
 * - `ondergrens`: een op de staaf opgegeven klasse (`checkConfig.loadDuration`).
 *   Die maakt de duur alleen langer, nooit korter; beide staan in de basis.
 */
export function belastingduurPerCombinatie(p: {
  combinaties: readonly LoadCombination[];
  loadCases: readonly GevalInvoer[];
  gevuld?: (caseId: number) => boolean;
  ondergrens?: LoadDurationClass;
}): CombinationLoadDuration[] {
  const gevallen = new Map(p.loadCases.map((lc) => [lc.id, lc] as const));
  const uit: CombinationLoadDuration[] = [];
  for (const c of p.combinaties) {
    if (c.type !== "uls") continue;
    const a = leidAf(c, gevallen, p.gevuld);
    let klasse = a.klasse;
    let basis = a.basis;
    if (p.ondergrens !== undefined) {
      const naam = DUURKLASSE_NAAM[p.ondergrens];
      if (rang(p.ondergrens) < rang(klasse)) {
        klasse = p.ondergrens;
        basis +=
          `; verlengd tot ${naam} door de opgegeven belastingduur van de staaf ` +
          "(een opgegeven klasse werkt als ondergrens)";
      } else if (rang(p.ondergrens) > rang(klasse)) {
        basis +=
          `; de opgegeven belastingduur "${naam}" van de staaf is korter en telt niet: ` +
          "een opgegeven klasse mag de duur nooit korter maken dan de belasting in de " +
          "combinatie (3.1.3(2))";
      }
    }
    uit.push({ combination_id: c.id, load_duration: klasse, basis: `${c.name}: ${basis}` });
  }
  return uit;
}

/**
 * De blijvende gevallen met een werkzame last, als er GEEN UGT-combinatie is
 * waarin alleen blijvende belasting werkt; anders `null`.
 *
 * Bij hout is zo'n combinatie nodig: zonder 1,35·G (6.10a zonder veranderlijke
 * belasting) wordt de houttoets nooit met k_mod "blijvend" uitgevoerd, terwijl
 * juist die combinatie bij een kleine veranderlijke belasting maatgevend is
 * (basisaudit nr 18: G = 22 en Q = 2 kN/m, UC 0,713 waar 0,888 hoort). De
 * standaardset heeft haar altijd; een eigen set mogelijk niet.
 */
export function ontbrekendeBlijvendeCombinatie(p: {
  combinaties: readonly LoadCombination[];
  loadCases: readonly GevalInvoer[];
  gevuld?: (caseId: number) => boolean;
}): GevalInvoer[] | null {
  const gevallen = new Map(p.loadCases.map((lc) => [lc.id, lc] as const));
  const blijvend = p.loadCases.filter((lc) => lc.type === "dead" && (!p.gevuld || p.gevuld(lc.id)));
  if (blijvend.length === 0) return null;
  const uls = p.combinaties.filter((c) => c.type === "uls");
  if (uls.length === 0) return null;
  const heeft = uls.some((c) => leidAf(c, gevallen, p.gevuld).alleenBlijvend);
  return heeft ? null : blijvend;
}
