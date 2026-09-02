/**
 * ReportPreview — het live HTML-rapport achter het ribbon-tabblad "Rapport"
 * (en in het detached venster, view "report").
 *
 * Links een inklapbare zijbalk met sectie-toggles (registry-gedreven —
 * reportSections.ts), rechts de ReportShell: de zoombare A4/A3-weergave die
 * direct uit de stores rendert. Geen genereer-stap: modelwijziging →
 * rapport volgt. PDF via de Afdrukken/PDF-knop (webview-printdialoog).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReportStore, isSectionEnabled } from "../../stores/reportStore";
import { REPORT_SECTIONS } from "../report/reportSections";
import ReportShell from "../report/ReportShell";
import "./ReportPreview.css";

export default function ReportPreview() {
  const { t } = useTranslation("ribbon");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const setSectionEnabled = useReportStore((s) => s.setSectionEnabled);
  const resetSections = useReportStore((s) => s.resetSections);

  return (
    <div className="report-preview">
      {/* ─── Zijbalk: sectie-toggles (scherm-chrome, print niet mee) ─── */}
      {sidebarOpen ? (
        <aside className="report-sidebar">
          <div className="report-sidebar-header">
            <span className="report-sidebar-title">{t("report.sections", "Secties")}</span>
            <button
              className="report-sidebar-toggle"
              onClick={() => setSidebarOpen(false)}
              title={t("report.collapse", "Inklappen")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          <div className="report-sidebar-body">
            <p className="report-sidebar-hint">
              {t("report.sectionsHint", "Kies welke onderdelen in het rapport komen.")}
            </p>

            <div className="report-section-list">
              {REPORT_SECTIONS.map(({ id, titleKey, defaultTitle }) => (
                <label key={id} className="report-section-toggle">
                  <input
                    type="checkbox"
                    checked={isSectionEnabled(hiddenSections, id)}
                    onChange={(e) => setSectionEnabled(id, e.target.checked)}
                  />
                  <span>{t(titleKey, defaultTitle)}</span>
                </label>
              ))}
            </div>

            <button className="report-reset-btn" onClick={resetSections}>
              {t("report.resetSections", "Alles aan")}
            </button>
          </div>
        </aside>
      ) : (
        <button
          className="report-sidebar-collapsed"
          onClick={() => setSidebarOpen(true)}
          title={t("report.sections", "Secties")}
        >
          <span>{t("report.sections", "Secties")}</span>
        </button>
      )}

      {/* ─── Het rapport zelf ─── */}
      <ReportShell />
    </div>
  );
}
