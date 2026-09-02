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

export default function ReportShell() {
  const { t } = useTranslation("ribbon");
  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const zoom = useReportStore((s) => s.zoom);
  const setZoom = useReportStore((s) => s.setZoom);
  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const info = useProjectInfo();

  const dims = pageDimsMm(pageSize, orientation);
  const headerText = info.name || t("report.unnamedProject", "Naamloos project");

  // Dynamische print-regel: formaat/oriëntatie + kop-/voettekst. De marge
  // hier is de print-marge; report.css simuleert dezelfde marge op scherm
  // als padding van het vel.
  const pageCss = `
@page {
  size: ${pageSize} ${orientation};
  margin: 18mm 15mm 20mm 15mm;
  @top-left {
    content: ${cssString(headerText)};
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
        <button
          className="report-print-btn"
          onClick={() => window.print()}
          title={t("report.printHint", "Opent de printdialoog — kies daar 'Opslaan als PDF' voor een PDF.")}
        >
          {printIcon}
          {t("report.print", "Afdrukken / PDF")}
        </button>
      </div>

      <div className="report-scroll">
        <div className="report-zoom" style={zoomStyle}>
          {sections.map(({ id, Component }) => (
            <section key={id} className="report-page" data-section={id}>
              <Component />
            </section>
          ))}
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
