/**
 * ReportShell — het live HTML-rapport.
 *
 * Rendert de aangezette secties uit de registry (reportSections.ts) als
 * A4/A3-vellen in een scrollbare, zoombare schermweergave. Het rapport ís de
 * afdruk: window.print() opent de printdialoog van de webview ("Opslaan als
 * PDF") en de print-CSS in report.css laat exact dezelfde inhoud op
 * `@page`-pagina's vallen — de scherm-chrome (toolbar, zijbalk, zoom)
 * verdwijnt met `@media print`.
 *
 * De `@page`-regel wordt hier dynamisch geïnjecteerd zodat papierformaat en
 * oriëntatie uit de reportStore écht doorwerken in de print, inclusief kop-
 * (projectnaam) en voettekst (paginanummers via CSS counters in
 * @page-margin-boxes — Chromium ≥ 131; oudere WebView2-runtimes laten de
 * kop-/voettekst weg maar printen de inhoud gewoon).
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  useReportStore,
  isSectionEnabled,
  pageDimsMm,
  REPORT_ZOOM_MIN,
  REPORT_ZOOM_MAX,
} from "../../stores/reportStore";
import { REPORT_SECTIONS } from "./reportSections";
import { useProjectInfo } from "./useProjectInfo";
import { useReportData } from "./ReportDataContext";
import "./report.css";

/** Veilige CSS-string (dubbelquoted, met escapes) voor content:-waarden. */
function cssString(s: string): string {
  return JSON.stringify(s);
}

const printIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const detachWindowIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="7" width="13" height="13" rx="1.5" />
    <path d="M8 7V4.5A1.5 1.5 0 019.5 3h10A1.5 1.5 0 0121 4.5v10a1.5 1.5 0 01-1.5 1.5H16" />
  </svg>
);

interface ReportShellProps {
  /** Aanwezig in het hoofdvenster: toont de knop "Naast je scherm". */
  onDetach?: () => void;
}

export default function ReportShell({ onDetach }: ReportShellProps) {
  const { t } = useTranslation("ribbon");
  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const zoom = useReportStore((s) => s.zoom);
  const setZoom = useReportStore((s) => s.setZoom);
  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const info = useProjectInfo();
  const data = useReportData();

  // R5 — "verouderd"-signaal: er ís een model, maar (nog) geen resultaten.
  // useFemStore nult de solver-uitkomsten bij elke modelwijziging, dus deze
  // balk verschijnt vanzelf zodra het rapport achterloopt — in het hoofd-
  // venster én (via de snapshot-sync) in het losgekoppelde venster. De balk
  // is scherm-chrome en print nooit mee (@media print in report.css).
  const hasModel = data.nodes.length > 0 || data.beams.length > 0;
  const showStale = hasModel && data.combinationResults === null;

  const dims = pageDimsMm(pageSize, orientation);
  const headerText = info.name || t("report.unnamedProject", "Naamloos project");

  // Dynamische print-regel: formaat/oriëntatie + voettekst. De koptekst is
  // géén @page-margin-box meer maar een echt kopblok in het document (thead —
  // herhaalt in print op elke pagina, zie .rpt-doc in report.css); alleen de
  // paginanummers en het app-merk staan in de margin-boxes (CSS counters
  // kunnen niet in gewone content; Chromium ≥ 131 voor de boxes).
  const pageCss = `
@page {
  size: ${pageSize} ${orientation};
  margin: 12mm 15mm 20mm 15mm;
  @bottom-left {
    content: "Open FEM2D Studio";
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8pt;
    color: #666;
  }
  @bottom-right {
    content: ${cssString(t("report.pagePrefix", "Pagina") + " ")} counter(page) " / " counter(pages);
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8pt;
    color: #666;
  }
}`;

  // Kopblok in referentiestijl: bedrijfsregel cursief, daaronder het
  // projectblok in twee kolommen, afgesloten met een lijn. Lege velden
  // worden weggelaten. Herhaalt in print op elke pagina via de thead.
  const kopRegels: Array<[string, string]> = [
    [t("report.kopProjectnummer", "Projectnummer"), info.projectNumber],
    [t("report.kopProject", "Project"), headerText],
    [t("report.kopOmschrijving", "Omschrijving"), info.description],
  ].filter((r): r is [string, string] => !!r[1]);
  const kopRechts: Array<[string, string]> = [
    [t("report.kopDatum", "Datum"), info.date],
    [t("report.kopConstructeur", "Constructeur"), info.engineer],
  ].filter((r): r is [string, string] => !!r[1]);
  const kopBedrijf = info.reportHeader || info.company;

  const sections = REPORT_SECTIONS.filter((s) => isSectionEnabled(hiddenSections, s.id));

  const zoomStyle = {
    "--rpt-zoom": String(zoom),
    "--rpt-page-w": `${dims.w}mm`,
    "--rpt-page-h": `${dims.h}mm`,
  } as CSSProperties;

  return (
    <div className="report-shell">
      <style>{pageCss}</style>

      {/* Scherm-chrome — verdwijnt bij print (@media print in report.css). */}
      <div className="report-shell-toolbar">
        <span className="report-shell-info">
          {pageSize} · {orientation === "portrait"
            ? t("report.portrait", "Staand")
            : t("report.landscape", "Liggend")}
          {" · "}{headerText}
        </span>
        <label className="report-zoom-control">
          <span>{t("report.zoom", "Zoom")}</span>
          <input
            type="range"
            min={Math.round(REPORT_ZOOM_MIN * 100)}
            max={Math.round(REPORT_ZOOM_MAX * 100)}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          />
          <span className="report-zoom-pct">{Math.round(zoom * 100)}%</span>
        </label>
        {onDetach && (
          <button
            className="report-detach-btn"
            onClick={onDetach}
            title={t("report.detachHint", "Opent het rapport in een eigen venster dat live met het model meebeweegt.")}
          >
            {detachWindowIcon}
            {t("report.detach", "Naast je scherm")}
          </button>
        )}
        <button
          className="report-print-btn"
          onClick={() => window.print()}
          title={t("report.printHint", "Opent de printdialoog — kies daar 'Opslaan als PDF' voor een PDF.")}
        >
          {printIcon}
          {t("report.print", "Afdrukken / PDF")}
        </button>
      </div>

      {showStale && (
        <div className="report-stale-banner" role="status">
          {t("report.staleBanner", "Model gewijzigd — druk op Berekenen om het rapport bij te werken.")}
        </div>
      )}

      <div className="report-scroll">
        <div className="report-zoom" style={zoomStyle}>
          {/* Eén doorlopend document: hoofdstukken sluiten op elkaar aan en
              printpagina's breken waar het papier vol is (referentiestijl).
              De tabelconstructie is functioneel: een thead herhaalt in
              Chromium-print op élke pagina — dat is de terugkerende kop. */}
          {sections.length > 0 && (
            <div className="report-page report-doorlopend">
              <table className="rpt-doc">
                <thead>
                  <tr>
                    <td>
                      <div className="rpt-kop">
                        {kopBedrijf && <div className="rpt-kop-bedrijf">{kopBedrijf}</div>}
                        {(kopRegels.length > 0 || kopRechts.length > 0) && (
                          <div className="rpt-kop-grid">
                            <div>
                              {kopRegels.map(([label, waarde]) => (
                                <div key={label} className="rpt-kop-regel">
                                  <span className="rpt-kop-label">{label}</span>
                                  <span>: {waarde}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              {kopRechts.map(([label, waarde]) => (
                                <div key={label} className="rpt-kop-regel">
                                  <span className="rpt-kop-label">{label}</span>
                                  <span>: {waarde}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {sections.map(({ id, Component }) => (
                        <section key={id} className="rpt-hoofdstuk" data-section={id}>
                          <Component />
                        </section>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="rpt-voet">
                <span>Open FEM2D Studio</span>
                {info.date && <span>{info.date}</span>}
              </div>
            </div>
          )}
          {sections.length === 0 && (
            <div className="report-no-sections">
              {t("report.noSections", "Alle secties staan uit — zet een sectie aan in de zijbalk.")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
