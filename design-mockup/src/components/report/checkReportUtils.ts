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
 */
export const CHECK_REPORT_CSS = `
/* ─── Toetsingsoverzicht (tabellarisch) ─── */
.rpt-gov-title { font-weight: 500; }

.rpt-gov-formula {
  font-size: 8pt;
  color: #444;
  margin-top: 0.5mm;
}

.rpt-gov-formula .katex { font-size: 1.05em; }

.rpt-status-na { color: #555; }

.rpt-check-basis { margin-top: 3mm; }

/* ─── Toetsing per staaf (uitgebreid) ─── */
/* De sectie mag over pagina's heen breken (kan lang zijn); de blokken
   binnenin houden zichzelf bijeen. */
@media print {
  .rpt-chk-detail { break-inside: auto; }
}

.rpt-chk-member { margin: 0 0 7mm; }

.rpt-chk-member-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2mm 4mm;
  border-bottom: 0.3mm solid #1a1a1a;
  padding-bottom: 1mm;
  margin-bottom: 2.5mm;
  break-inside: avoid;
  break-after: avoid;
}

.rpt-chk-member-title {
  font-size: 11pt;
  font-weight: 700;
  margin: 0;
}

.rpt-chk-member-meta {
  font-size: 8.5pt;
  color: #444;
}

.rpt-chk-member-uc {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Eén toets: volledig uitgeklapte afleiding, blijft bijeen op papier. */
.rpt-chk-block {
  border: 0.2mm solid #bbb;
  border-left: 1mm solid #888;
  border-radius: 1mm;
  padding: 2.5mm 3mm;
  margin: 0 0 2.5mm;
  break-inside: avoid;
}

.rpt-chk-block.rpt-chk-ok { border-left-color: #15803d; }
.rpt-chk-block.rpt-chk-notok { border-left-color: #b91c1c; }

.rpt-chk-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 3mm;
}

.rpt-chk-title {
  font-size: 10pt;
  font-weight: 700;
  margin: 0;
}

.rpt-chk-gov-tag {
  margin-left: 2mm;
  padding: 0 1.5mm;
  border: 0.2mm solid #888;
  border-radius: 2mm;
  font-size: 7pt;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #444;
  vertical-align: 0.3mm;
  white-space: nowrap;
}

.rpt-chk-article {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 8.5pt;
  color: #555;
  white-space: nowrap;
}

.rpt-chk-forces {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 8pt;
  color: #555;
  margin: 1mm 0;
}

/* overflow-y: hidden voorkomt de verticale scrollknopjes die KaTeX-struts
   anders uitlokken (scrollHeight loopt 2px voor op clientHeight). */
.rpt-chk-formula {
  margin: 1mm 0;
  padding: 1mm 0;
  text-align: center;
  font-size: 10pt;
  overflow-x: auto;
  overflow-y: hidden;
}

.rpt-chk-formula .katex-display { margin: 0; }

.rpt-chk-vars {
  font-size: 8.5pt;
  color: #333;
  line-height: 1.7;
}

.rpt-chk-vars .katex,
.rpt-chk-ucline .katex { font-size: 1.05em; }

.rpt-chk-var { display: inline-block; margin-right: 1.5mm; }
.rpt-chk-var-value { font-weight: 600; color: #1a1a1a; }
.rpt-chk-var-unit { color: #666; }
.rpt-chk-var-sep { color: #999; }

.rpt-chk-result {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 9pt;
  margin: 1mm 0;
}

.rpt-chk-ucline {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 1.5mm;
  margin-top: 1.5mm;
  padding-top: 1mm;
  border-top: 0.2mm solid #ccc;
  font-size: 9pt;
}

.rpt-chk-uc-value { font-size: 10.5pt; font-weight: 700; }

.rpt-chk-status {
  margin-left: auto;
  font-weight: 700;
  font-size: 8.5pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.rpt-chk-status.rpt-chk-ok { color: #15803d; }
.rpt-chk-status.rpt-chk-notok { color: #b91c1c; }
.rpt-chk-status.rpt-chk-na { color: #555; }

.rpt-chk-intermediates {
  margin-top: 1.5mm;
  font-size: 8pt;
  color: #444;
}

.rpt-chk-intermediates-label {
  font-weight: 600;
  margin-right: 1.5mm;
}

.rpt-chk-notes {
  margin: 1.5mm 0 0;
  padding-left: 4mm;
  font-size: 8pt;
  font-style: italic;
  color: #444;
}
`;
