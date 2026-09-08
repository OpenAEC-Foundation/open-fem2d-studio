/**
 * ReportTab — ribbonknoppen bij het rapport.
 *
 * TWEE UITDRAAIEN, MET EEN DUIDELIJK VERSCHIL
 * -------------------------------------------
 * "Afdrukken / PDF" print het LIVE rapport: de weergave op het Rapport-tabblad
 * (ReportPreview / ReportShell), via de printdialoog van de webview. Dat is het
 * volledige document — alle hoofdstukken, in de taal van de app, met de
 * sectiekeuze uit de zijbalk.
 *
 * "Rekenrapport" laat de REKENKERN de PDF zetten (`generate_steel_report_pdf`).
 * Die uitdraai draagt de toetsingen van staal, hout en beton plus het
 * betonhoofdstuk met de segmenttabellen en de vier betonfiguren, en hij wordt
 * vectorieel getekend in plaats van door de browser gerasterd. Wat hij (nog)
 * niet draagt staat opgesomd in `NIET_IN_PDF` in `lib/rapportPdfInvoer.ts`;
 * daarvoor blijft het live rapport de weg.
 */
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { useReportStore } from "../../stores/reportStore";
import { useCheckStore } from "../../stores/checkStore";
import { useBetonStijfheidStore } from "../../stores/betonStijfheidStore";
import { useWindowManager } from "../../hooks/useWindowManager";
import { useProjectInfo } from "../report/useProjectInfo";
import { bouwRapportInvoer, genereerRapportPdf } from "../../lib/rapportPdfInvoer";
import { isTauriApp } from "../../lib/tauri";

const printIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="6" y="14" width="12" height="8" stroke-width="2"/></svg>`;
const detachIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="13" rx="1.5" stroke-width="2"/><path d="M8 7V4.5A1.5 1.5 0 019.5 3h10A1.5 1.5 0 0121 4.5v10a1.5 1.5 0 01-1.5 1.5H16" stroke-width="2" stroke-linecap="round"/></svg>`;
const kernPdfIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6" stroke-width="2" stroke-linejoin="round"/><path d="M8 13h8M8 17h5" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const a4Icon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5" stroke-width="2"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">A4</text></svg>`;
const a3Icon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5" stroke-width="2"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">A3</text></svg>`;
const portraitIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1.5" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h4" stroke-width="1.5"/></svg>`;
const landscapeIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="1.5" stroke-width="2"/><path d="M6 10h12M6 14h8" stroke-width="1.5"/></svg>`;

interface ReportTabProps {
  /** @deprecated Ongebruikt — de losse HTML-export is vervangen door het live rapport zelf. */
  onExportHtml?: () => void;
}

export default function ReportTab(_props: ReportTabProps) {
  const { t } = useTranslation("ribbon");

  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const setPageSize = useReportStore((s) => s.setPageSize);
  const setOrientation = useReportStore((s) => s.setOrientation);
  const { createDetachedWindow } = useWindowManager();

  const project = useProjectInfo();
  const checkResults = useCheckStore((s) => s.results);
  const segmentLengteMm = useBetonStijfheidStore((s) => s.segmentLengteMm);
  const combinaties = useBetonStijfheidStore((s) => s.combinaties);
  const overgeslagen = useBetonStijfheidStore((s) => s.overgeslagen);
  const staafdoorsneden = useBetonStijfheidStore((s) => s.staafdoorsneden);

  // De Rapport-tab is alleen actief wanneer de rapportview getoond wordt
  // (Ribbon koppelt tab ↔ view), dus window.print() print het rapport.
  const handlePrint = () => window.print();

  /**
   * Laat de rekenkern de PDF zetten en schrijf hem weg.
   *
   * Alleen in de desktop-app: het PDF-pad is een Tauri-command en heeft geen
   * dev-brug. In de browser volgt een nette melding in plaats van een kale
   * invoke-fout.
   */
  const handleRekenrapport = async () => {
    const { notifyInfo, notifySuccess, notifyWarning } = await import("../../io/notify");
    if (!isTauriApp()) {
      notifyInfo(
        t("report.kernPdf", "Rekenrapport"),
        t(
          "report.kernPdfGeenTauri",
          "Het rekenrapport wordt door de rekenkern gezet en is daarom alleen in de desktop-app beschikbaar. Gebruik in de browser Afdrukken / PDF.",
        ),
      );
      return;
    }
    if (checkResults.length === 0) {
      notifyInfo(
        t("report.kernPdf", "Rekenrapport"),
        t(
          "report.kernPdfNietGetoetst",
          "Er zijn nog geen toetsresultaten. Druk eerst op Toetsen; het rekenrapport bevat de toetsingen en het betonhoofdstuk.",
        ),
      );
      return;
    }
    try {
      const invoer = bouwRapportInvoer({
        project: {
          name: project.name,
          projectNumber: project.projectNumber,
          engineer: project.engineer,
          company: project.company,
          date: project.date,
        },
        checkResults,
        stijfheid: { segmentLengteMm, combinaties, overgeslagen, staafdoorsneden },
      });
      const bytes = await genereerRapportPdf(invoer);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const pad = await save({
        defaultPath: `${invoer.project_name}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!pad) return; // afgebroken door de gebruiker
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      await writeFile(pad as string, bytes);
      notifySuccess(t("report.kernPdf", "Rekenrapport"), pad as string);
    } catch (e) {
      notifyWarning(
        t("report.kernPdf", "Rekenrapport"),
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  const handleDetach = () => {
    void createDetachedWindow({
      view: "report",
      title: t("report.report", "Rapport"),
      width: 860,
      height: 1100,
    });
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Rapport — afdrukken/PDF + eigen venster */}
        <RibbonGroup label={t("report.report", "Rapport")}>
          <RibbonButton
            icon={printIcon}
            label={t("report.print", "Afdrukken / PDF")}
            size="large"
            onClick={handlePrint}
          />
          {/* R5 — werkt óók in de browser: createDetachedWindow valt daar
              terug op window.open op dezelfde origin (BroadcastChannel-sync). */}
          <RibbonButton
            icon={detachIcon}
            label={t("report.detach", "Naast je scherm")}
            size="large"
            onClick={handleDetach}
          />
          <RibbonButton
            icon={kernPdfIcon}
            label={t("report.kernPdf", "Rekenrapport")}
            size="large"
            title={t(
              "report.kernPdfHint",
              "Laat de rekenkern de PDF zetten: de toetsingen plus het betonhoofdstuk met de segmenttabellen en de vier figuren, vectorieel getekend.",
            )}
            onClick={() => void handleRekenrapport()}
          />
        </RibbonGroup>

        {/* Weergave — papierformaat + oriëntatie (werken door in @page) */}
        <RibbonGroup label={t("report.display", "Weergave")}>
          <RibbonButtonStack>
            <RibbonButton
              icon={a4Icon}
              label="A4"
              size="small"
              active={pageSize === "A4"}
              onClick={() => setPageSize("A4")}
            />
            <RibbonButton
              icon={a3Icon}
              label="A3"
              size="small"
              active={pageSize === "A3"}
              onClick={() => setPageSize("A3")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon={portraitIcon}
              label={t("report.portrait", "Staand")}
              size="small"
              active={orientation === "portrait"}
              onClick={() => setOrientation("portrait")}
            />
            <RibbonButton
              icon={landscapeIcon}
              label={t("report.landscape", "Liggend")}
              size="small"
              active={orientation === "landscape"}
              onClick={() => setOrientation("landscape")}
            />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
