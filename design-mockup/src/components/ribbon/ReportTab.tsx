import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  reportNewIcon,
  reportTemplateIcon,
  reportGenerateIcon,
  reportPreviewIcon,
  reportCoverIcon,
  reportSectionsIcon,
  reportConfigIcon,
} from "./icons";
import { useReportStore } from "../../stores/reportStore";
import { createBlankReport } from "../../types/report";

const a4Icon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5" stroke-width="2"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">A4</text></svg>`;
const a3Icon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5" stroke-width="2"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">A3</text></svg>`;
const portraitIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1.5" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h4" stroke-width="1.5"/></svg>`;
const landscapeIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="1.5" stroke-width="2"/><path d="M6 10h12M6 14h8" stroke-width="1.5"/></svg>`;
const downloadIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 10 12 15 17 10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke-width="2" stroke-linecap="round"/></svg>`;

const stub = (label: string) => () => console.log(`TODO: ${label}`);

interface ReportTabProps {
  /** Export a standalone print-friendly HTML report (works in browser + Tauri). */
  onExportHtml?: () => void;
}

export default function ReportTab({ onExportHtml }: ReportTabProps) {
  const { t } = useTranslation("ribbon");

  const setReport = useReportStore((s) => s.setReport);
  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const setPageSize = useReportStore((s) => s.setPageSize);
  const setOrientation = useReportStore((s) => s.setOrientation);
  const generatePdf = useReportStore((s) => s.generatePdf);
  const savePdf = useReportStore((s) => s.savePdf);
  const pdfBlobUrl = useReportStore((s) => s.pdfBlobUrl);
  const isGenerating = useReportStore((s) => s.isGenerating);
  const report = useReportStore((s) => s.report);

  const handleNew = () => setReport(createBlankReport());
  const handleGenerate = () => generatePdf();
  const handleDownload = async () => {
    if (pdfBlobUrl) {
      const a = document.createElement("a");
      a.href = pdfBlobUrl;
      a.download = `${report.project || "rapport"}.pdf`;
      a.click();
    }
  };
  const handleSaveAs = async () => {
    try {
      const path = await save({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        defaultPath: `${report.project || "rapport"}.pdf`,
      });
      if (path) await savePdf(path);
    } catch {
      // ignore (browser-only env)
    }
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Document */}
        <RibbonGroup label={t("report.document")}>
          <RibbonButton icon={reportNewIcon} label={t("report.newReport")} size="large" onClick={handleNew} />
          <RibbonButtonStack>
            <RibbonButton icon={reportTemplateIcon} label={t("report.templates")} size="small" onClick={stub("Open templates")} />
            <RibbonButton icon={reportConfigIcon} label={t("report.configure")} size="small" onClick={stub("Configure report")} />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Report — generate + download */}
        <RibbonGroup label={t("report.report")}>
          <RibbonButton
            icon={reportGenerateIcon}
            label={isGenerating ? t("report.generating") : t("report.generate")}
            size="large"
            onClick={handleGenerate}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={downloadIcon}
              label={t("report.downloadPdf")}
              size="small"
              disabled={!pdfBlobUrl}
              onClick={handleDownload}
            />
            <RibbonButton
              icon={reportPreviewIcon}
              label={t("report.saveAs")}
              size="small"
              onClick={handleSaveAs}
            />
            <RibbonButton
              icon={downloadIcon}
              label="Export HTML"
              size="small"
              onClick={onExportHtml ?? stub("Export HTML (no handler)")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Display — page size + orientation */}
        <RibbonGroup label={t("report.display")}>
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
              label={t("report.portrait")}
              size="small"
              active={orientation === "portrait"}
              onClick={() => setOrientation("portrait")}
            />
            <RibbonButton
              icon={landscapeIcon}
              label={t("report.landscape")}
              size="small"
              active={orientation === "landscape"}
              onClick={() => setOrientation("landscape")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Sections */}
        <RibbonGroup label={t("report.sections")}>
          <RibbonButton icon={reportCoverIcon} label={t("report.cover")} size="large" onClick={stub("Edit cover")} />
          <RibbonButton icon={reportSectionsIcon} label={t("report.sectionsList")} size="large" onClick={stub("Edit sections")} />
        </RibbonGroup>
      </div>
    </div>
  );
}
