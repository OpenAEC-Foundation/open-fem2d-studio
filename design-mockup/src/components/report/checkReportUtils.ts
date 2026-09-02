/**
 * checkReportUtils — gedeelde hulpjes voor de toetsingssecties van het
 * live rapport (CheckTableSection + CheckDetailSection).
 *
 * Materiaal-neutraal: staal (EN 1993) en hout (EN 1995) lopen door hetzelfde
 * NamedCheck-contract; alleen de kopregels verschillen. KaTeX rendert hier
 * naar een HTML-string (renderToString is puur — geen refs/effects nodig),
 * en de CSS voor beide secties staat als string klaar zodat de secties hem
 * zelf injecteren zonder aan report.css (eigendom van het raamwerk) te komen.
 */
import katex from "katex";
import type { TFunction } from "i18next";
import type { MemberCheckResult } from "../../lib/checkTypes";
import { isSteelCheckResult } from "../../lib/checkTypes";
import type { NamedValue } from "../../lib/types/steel/NamedValue";
import type { ResistanceCalc } from "../../lib/types/steel/ResistanceCalc";
import type { StabilityCalc } from "../../lib/types/steel/StabilityCalc";
import type { CrossSectionClass } from "../../lib/types/steel/CrossSectionClass";
import type { CheckStatus } from "../../lib/types/steel/CheckStatus";
import type { ServiceClass } from "../../lib/types/timber/ServiceClass";
import type { LoadDurationClass } from "../../lib/types/timber/LoadDurationClass";

/** Eén toetsberekening — weerstand of stabiliteit, staal of hout. */
export type CheckCalc = ResistanceCalc | StabilityCalc;

/** Stabiliteitstoetsen dragen tussenwaarden (kniklengtes, chi, kip, …). */
export function isStabilityCalc(c: CheckCalc): c is StabilityCalc {
  return "intermediate_values" in c;
}

/** Normaanduidingen zoals de Rust-kernen ze hanteren. */
export const STEEL_NORM_FULL = "NEN-EN 1993-1-1+C2+A1/NB:2016";
export const TIMBER_NORM_FULL = "NEN-EN 1995-1-1+C1+A1:2011/NB:2013";

/** KaTeX → HTML-string; faalt zacht naar <code> zodat het rapport nooit breekt. */
export function renderLatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false });
  } catch {
    return `<code>${latex}</code>`;
  }
}

/** Getalnotatie zoals het toetsingspaneel: nl-NL, max. 3 decimalen. */
export function fmtValue(v: number, maxDigits = 3): string {
  return v.toLocaleString("nl-NL", { maximumFractionDigits: maxDigits });
}

// ═══════════════════════════════════════════════════════════════════════
// Afleidingen zetten zoals het referentie-rapport
// ═══════════════════════════════════════════════════════════════════════
//
// Het referentie-rapport zet elke toets in drie stappen onder elkaar, met
// de is-gelijktekens onder elkaar uitgelijnd:
//
//     M_y,c,Rd = W_pl,y · f_y / γ_M0
//              = 354113 · 235 / 1,00
//              = 83,217 kNm                                        (6.13)
//
// en sluit af met de unity check als échte breuk, gevolgd door de
// vergelijking met 1,0:
//
//     M_y,Ed / M_y,c,Rd = 66,036 / 83,217 = 0,79 ≤ 1,0             (6.12)
//
// Onze rekenkernen leveren de formule symbolisch (`formula_latex`) plus de
// variabelen met hun waarden. De middelste regel — "de formule met getallen"
// — bestaat dus nog niet en wordt hier gemaakt door de symbolen in de
// formule te vervangen door hun waarde. Dat is de kern van deze hulpjes.

/** Getal in mathmodus: decimaalkomma zonder de spatie die LaTeX er van maakt. */
export function latexGetal(v: number, maxDigits = 3): string {
  const s = v.toLocaleString("nl-NL", {
    maximumFractionDigits: maxDigits,
    useGrouping: false,
  });
  return s.replace(",", "{,}").replace("−", "-");
}

const MACHTEN: Record<string, string> = {
  "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6",
};

/** Eenheid rechtop achter een getal ("kNm", "mm²" → \mathrm{mm}^{2}). */
export function latexEenheid(unit: string): string {
  if (!unit || unit === "-") return "";
  let uit = "";
  let rest = "";
  for (const ch of unit) {
    if (MACHTEN[ch]) {
      if (rest) uit += `\\mathrm{${rest}}`;
      uit += `^{${MACHTEN[ch]}}`;
      rest = "";
    } else {
      rest += ch;
    }
  }
  if (rest) uit += `\\mathrm{${rest}}`;
  return uit ? `\\;${uit}` : "";
}

/** Regex-veilige versie van een symbool. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits een formule op de is-gelijktekens op TOPNIVEAU (dus niet binnen
 * accolades). `V_{c,z,Rd} = V_{pl,z,Rd} = \frac{…}{…}` wordt zo drie delen.
 */
export function splitsOpIsgelijk(latex: string): string[] {
  const delen: string[] = [];
  let diepte = 0;
  let huidig = "";
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === "{") diepte++;
    else if (c === "}") diepte--;
    const isSplits =
      c === "=" &&
      diepte === 0 &&
      latex[i - 1] !== "\\" &&
      latex[i - 1] !== "<" &&
      latex[i - 1] !== ">" &&
      latex[i - 1] !== "!" &&
      latex[i + 1] !== "=";
    if (isSplits) {
      delen.push(huidig.trim());
      huidig = "";
      continue;
    }
    huidig += c;
  }
  delen.push(huidig.trim());
  return delen.filter((d) => d.length > 0);
}

/**
 * Vervang de symbolen in een formule door hun getalswaarde — "de formule met
 * ingevulde getallen" uit het referentie-rapport.
 *
 * Langste symbolen eerst (anders eet `A` de `A` van `A_v` op) en alleen waar
 * het symbool op zichzelf staat: niet midden in een ander symbool en niet
 * achter een backslash (dan is het een LaTeX-commando). Staat er een getal
 * vóór het symbool, dan komt er een maalteken tussen — `0,5a` wordt
 * `0,5 · 0,23`, net als in het referentie-rapport.
 */
export function vulGetallenIn(
  latex: string,
  vars: NamedValue[],
): { latex: string; gebruikt: Set<string> } {
  const gebruikt = new Set<string>();
  let uit = latex;
  const opLengte = [...vars].sort((a, b) => b.symbol.length - a.symbol.length);
  for (const v of opLengte) {
    if (!v.symbol || gebruikt.has(v.symbol)) continue;
    let re: RegExp;
    try {
      re = new RegExp(`(^|[^A-Za-z_\\\\])(${escapeRe(v.symbol)})(?![A-Za-z0-9_])`, "g");
    } catch {
      continue;
    }
    if (!re.test(uit)) continue;
    re.lastIndex = 0;
    gebruikt.add(v.symbol);
    uit = uit.replace(re, (_m, voor: string) => {
      const maal = /[0-9)]$/.test(voor) ? "\\cdot " : "";
      return `${voor}${maal}${latexGetal(v.value)}`;
    });
  }
  if (gebruikt.size > 0) {
    // Symbolen die naast elkaar stonden ("χ_y N_Rk") worden na invullen twee
    // getallen naast elkaar — dat leest als één getal. Zet er een maalteken
    // tussen, zoals het referentie-rapport doet.
    uit = uit.replace(/([0-9])\s+(?=[0-9]|\\frac|\\sqrt)/g, "$1 \\cdot ");
  }
  return { latex: uit, gebruikt };
}

/** `A / B` → `\frac{A}{B}`; samengestelde uitdrukkingen blijven zoals ze zijn. */
export function alsBreuk(latex: string): string {
  const s = latex.trim();
  if (s.includes("\\frac") || s.includes("+")) return s;
  const delen = s.split("/");
  if (delen.length !== 2) return s;
  return `\\frac{${delen[0].trim()}}{${delen[1].trim()}}`;
}

/** "art. 6.2.4 (6.10)" → artikel + het vergelijkingsnummer los. */
export function splitsArtikel(article: string): {
  artikel: string;
  vergelijking: string | null;
} {
  const m = article.match(/^\s*(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return { artikel: article.trim(), vergelijking: null };
  return { artikel: m[1].trim(), vergelijking: m[2].trim() };
}

/**
 * De afleiding van één toets als uitgelijnd LaTeX-blok: symbolisch, dan met
 * ingevulde getallen, dan de uitkomst met eenheid. Retourneert daarnaast de
 * variabelen die NIET in de formule voorkwamen — die krijgen een eigen
 * waardenlijstje, zodat er niets stilzwijgend wegvalt.
 */
export function afleidingLatex(check: CheckCalc): {
  latex: string;
  ongebruikt: NamedValue[];
} {
  const resultaat = `${latexGetal(check.value)}${latexEenheid(check.unit)}`;
  const delen = splitsOpIsgelijk(check.formula_latex ?? "");

  if (delen.length === 0) {
    return { latex: `\\begin{aligned}&= ${resultaat}\\end{aligned}`, ongebruikt: check.variables };
  }

  const heeftLinkerlid = delen.length > 1;
  const linkerlid = heeftLinkerlid ? delen[0] : "";
  const rechts = heeftLinkerlid ? delen.slice(1) : delen;
  const laatste = rechts[rechts.length - 1];
  // Bij een stabiliteitstoets staan de reductiefactoren (chi, k_yy, …) in de
  // tussenwaarden en niet in `variables` — zonder die erbij zou de ingevulde
  // regel half symbolisch blijven. Ze krijgen daarnaast hun eigen lijstje.
  const invulbaar = isStabilityCalc(check)
    ? [...check.variables, ...check.intermediate_values]
    : check.variables;
  const { latex: ingevuld, gebruikt } = vulGetallenIn(laatste, invulbaar);

  const regels: string[] = [];
  regels.push(heeftLinkerlid ? `${linkerlid} &= ${rechts[0]}` : `&${rechts[0]}`);
  for (let i = 1; i < rechts.length; i++) regels.push(`&= ${rechts[i]}`);
  if (ingevuld !== laatste) regels.push(`&= ${ingevuld}`);
  regels.push(`&= ${resultaat}`);

  return {
    latex: `\\begin{aligned}${regels.join(" \\\\[1mm] ")}\\end{aligned}`,
    ongebruikt: check.variables.filter((v) => !gebruikt.has(v.symbol)),
  };
}

/**
 * De unity check als afsluitende regel: de breuk symbolisch, dan met
 * getallen, dan de waarde en de vergelijking met 1,0 — zoals het
 * referentie-rapport elke toets afsluit.
 */
export function unityCheckLatex(uc: {
  formula_latex: string;
  ed: number;
  rd: number;
  uc: number;
}): string {
  const symbolisch = alsBreuk(uc.formula_latex);
  // Een samengestelde toets (interactie) heeft geen echte noemer: de UC is
  // dan de som zelf, met 1,0 als grens. Dan geen schijnbreuk tonen — en ook
  // geen tussenstap die precies hetzelfde getal herhaalt.
  const echteBreuk = Math.abs(uc.rd - 1) > 1e-9;
  const vergelijking = uc.uc <= 1 ? "\\le" : ">";
  const uitkomst = `${latexGetal(uc.uc, 2)} ${vergelijking} 1{,}0`;
  if (!echteBreuk) return `${symbolisch} = ${uitkomst}`;
  return `${symbolisch} = \\frac{${latexGetal(uc.ed)}}{${latexGetal(uc.rd)}} = ${uitkomst}`;
}

/** Unity check als "0,79" — altijd twee decimalen, nl-notatie. */
export function fmtUc(v: number): string {
  return v.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Tijdstip van de laatste toetsrun, zelfde notatie als de samenvatting van R1. */
export function fmtCheckedAt(lastRunAt: number | null): string | null {
  if (!lastRunAt) return null;
  return new Date(lastRunAt).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export interface GoverningInfo {
  title: string;
  article: string;
  ucFormulaLatex: string | null;
}

/** Maatgevende toets van een staaf: titel, artikel en de UC-formule (LaTeX). */
export function governingInfo(r: MemberCheckResult): GoverningInfo {
  const named = r.checks.find((c) => c.id === r.governing_check_id);
  if (!named) return { title: r.governing_check_id, article: "", ucFormulaLatex: null };
  const d = named.kind.data;
  return { title: d.title, article: d.article, ucFormulaLatex: d.uc?.formula_latex ?? null };
}

/** Welke normen daadwerkelijk in de resultaten voorkomen. */
export function usedNorms(results: MemberCheckResult[]): { steel: boolean; timber: boolean } {
  let steel = false;
  let timber = false;
  for (const r of results) {
    if (isSteelCheckResult(r)) steel = true;
    else timber = true;
  }
  return { steel, timber };
}

/**
 * Voetregel met de toetsbasis — alleen de normen die echt gebruikt zijn.
 * `t` hoort bij de "ribbon"-namespace (report.*-sleutels).
 */
export function basisText(t: TFunction, results: MemberCheckResult[]): string | null {
  const { steel, timber } = usedNorms(results);
  const parts: string[] = [];
  if (steel) parts.push(t("report.basisSteel", `staal: ${STEEL_NORM_FULL}`));
  if (timber) parts.push(t("report.basisTimber", `hout: ${TIMBER_NORM_FULL}`));
  if (parts.length === 0) return null;
  const label = t("report.basisLabel", "Toetsbasis");
  const annex = t("report.basisAnnex", "inclusief Nederlandse nationale bijlage");
  return `${label}: ${parts.join("; ")} — ${annex}.`;
}

/** "Class1" → "1" (doorsnedeklasse, staal). */
export function crossSectionClassLabel(c: CrossSectionClass): string {
  return c.replace("Class", "");
}

/** "Sc2" → "2" (klimaatklasse, hout). */
export function serviceClassLabel(sc: ServiceClass): string {
  return sc.replace("Sc", "");
}

/** Belastingduurklasse → bestaande sleutel in de "check"-namespace + fallback. */
export const LOAD_DURATION_LABELS: Record<LoadDurationClass, { key: string; fallback: string }> = {
  Permanent: { key: "cfg.durPermanent", fallback: "Blijvend" },
  LongTerm: { key: "cfg.durLong", fallback: "Lang" },
  MediumTerm: { key: "cfg.durMedium", fallback: "Middellang" },
  ShortTerm: { key: "cfg.durShort", fallback: "Kort" },
  Instantaneous: { key: "cfg.durInstantaneous", fallback: "Zeer kort" },
};

/** Statuslabel via de bestaande report.*-sleutels. */
export function statusLabel(t: TFunction, status: CheckStatus): string {
  switch (status) {
    case "Ok": return t("report.statusOk", "Voldoet");
    case "NotOk": return t("report.statusNotOk", "Voldoet niet");
    default: return t("report.statusNa", "N.v.t.");
  }
}

/** CSS-modifierklasse per status (kleuren in CHECK_REPORT_CSS). */
export function statusClass(status: CheckStatus): string {
  switch (status) {
    case "Ok": return "rpt-chk-ok";
    case "NotOk": return "rpt-chk-notok";
    default: return "rpt-chk-na";
  }
}

/**
 * Stijlen voor beide toetsingssecties. Elke sectie rendert deze string in een
 * eigen <style>-element (idempotent — dubbel injecteren is onschadelijk),
 * zodat report.css onaangeroerd blijft. Alles is vaste zwart-op-wit-opmaak:
 * het rapport volgt bewust NIET het app-thema.
 *
 * OPMAAK VAN DE AFLEIDINGEN
 * -------------------------
 * Getypeerd naar het referentie-rapport: géén kaders, géén gekleurde balkjes,
 * géén badges — dat is schermgereedschap. Wat een rekenrapport doet is:
 * kopregel met het artikel rechts, daaronder de krachtstoestand, dan de
 * ingesprongen afleiding met uitgelijnde is-gelijktekens en het
 * vergelijkingsnummer in de rechtermarge, en tot slot de unity check.
 * Rustige witruimte tussen de stappen doet het werk dat kaders eerst deden.
 *
 * Alle tekstmaten zijn afgeleid van --rpt-basis, zodat de lettergrootte-
 * slider van het rapport ook de toetsing meeschaalt.
 */
export const CHECK_REPORT_CSS = `
/* ─── Toetsingsoverzicht (tabellarisch) ─── */
.rpt-gov-title { font-weight: 500; }

.rpt-gov-formula {
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #444;
  margin-top: 0.5mm;
}

.rpt-gov-formula .katex { font-size: 1.05em; }

.rpt-status-na { color: #555; }

.rpt-check-basis { margin-top: 3mm; }

/* Gedetailleerd overzicht: alle toetsen per staaf, gegroepeerd. De eerste
   regel van een groep krijgt een zwaardere bovenlijn, zodat de staven ook
   over een velgrens heen herkenbaar blijven. */
.rpt-chk-groep-start > td { border-top: 0.4mm solid #666 !important; }
.rpt-chk-rij-gov { font-weight: 600; }

/* ─── Toetsing per staaf (afleidingen) ───
   De sectie mag over vellen heen breken (kan lang zijn); de losse toetsen
   houden zichzelf bijeen. */
@media print {
  .rpt-chk-detail { break-inside: auto; }
}

.rpt-chk-member { margin: 0 0 5mm; }

/* Regel onder de staafkop: profiel/klasse links, norm en UC rechts. */
.rpt-chk-member-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 1mm 4mm;
  margin: -1mm 0 3mm;
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #444;
  break-after: avoid;
}

.rpt-chk-member-uc {
  margin-left: auto;
  font-weight: 700;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Eén toets. Geen kader: witruimte en uitlijning dragen de opmaak, zoals in
   het referentie-rapport. Blijft op papier bijeen. */
.rpt-chk-block {
  margin: 0 0 4mm;
  break-inside: avoid;
}

.rpt-chk-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 3mm;
}

.rpt-chk-title {
  font-size: var(--rpt-basis);
  font-weight: 700;
  margin: 0;
}

/* "maatgevend" — geen badge maar een terzijde, zoals een rapport het zet. */
.rpt-chk-gov-tag {
  margin-left: 1.5mm;
  font-size: calc(var(--rpt-basis) * 0.8);
  font-weight: 400;
  font-style: italic;
  color: #444;
  white-space: nowrap;
}

.rpt-chk-article {
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #444;
  white-space: nowrap;
}

.rpt-chk-forces {
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #444;
  margin: 0.5mm 0 1.5mm;
}

/* Afleiding: ingesprongen formuleblok links, vergelijkingsnummer rechts —
   precies de indeling van het referentie-rapport.
   overflow-y: hidden voorkomt de verticale scrollknopjes die KaTeX-struts
   anders uitlokken (scrollHeight loopt 2px voor op clientHeight). */
.rpt-chk-afleiding {
  display: flex;
  align-items: flex-start;
  gap: 4mm;
  margin: 0 0 1.5mm;
  padding-left: 6mm;
}

.rpt-chk-afleiding-formule {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* KaTeX centreert displayformules; een rekenrapport lijnt ze links uit. */
.rpt-chk-afleiding .katex-display {
  margin: 0;
  text-align: left;
}

.rpt-chk-afleiding .katex-display > .katex { text-align: left; }

.rpt-chk-eq {
  flex-shrink: 0;
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #555;
  white-space: nowrap;
  padding-top: 0.8mm;
}

/* Waardenlijst (niet-ingevulde variabelen, tussenwaarden): symbool rechts
   uitgelijnd zodat de is-gelijktekens onder elkaar staan. */
.rpt-chk-waarden {
  display: grid;
  grid-template-columns: max-content max-content 1fr;
  gap: 0.4mm 1.5mm;
  padding-left: 6mm;
  margin: 0 0 1.5mm;
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #333;
}

.rpt-chk-waarde-symbool { justify-self: end; }
.rpt-chk-waarde-eq { color: #666; }
.rpt-chk-waarde-getal { font-variant-numeric: tabular-nums; }
.rpt-chk-waarde-eenheid { color: #555; }

.rpt-chk-waarden-kop {
  grid-column: 1 / -1;
  font-style: italic;
  color: #555;
  margin-top: 0.5mm;
}

/* Afsluitende unity-checkregel. */
.rpt-chk-ucline {
  display: flex;
  align-items: flex-start;
  gap: 4mm;
  padding-left: 6mm;
  margin-top: 1mm;
}

.rpt-chk-ucline-formule {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.rpt-chk-ucline .katex-display {
  margin: 0;
  text-align: left;
}

.rpt-chk-ucline .katex-display > .katex { text-align: left; }

.rpt-chk-status {
  flex-shrink: 0;
  font-weight: 600;
  font-size: calc(var(--rpt-basis) * 0.85);
  white-space: nowrap;
  padding-top: 0.8mm;
}

.rpt-chk-status.rpt-chk-ok { color: #15803d; }
.rpt-chk-status.rpt-chk-notok { color: #b91c1c; }
.rpt-chk-status.rpt-chk-na { color: #555; }

.rpt-chk-notes {
  margin: 1mm 0 0;
  padding-left: 6mm;
  list-style: none;
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #444;
}

.rpt-chk-notes li { margin-bottom: 0.5mm; }
`;
