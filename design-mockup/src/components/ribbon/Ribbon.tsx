import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import RibbonTab from "./RibbonTab";
import HomeTab from "./HomeTab";
import TableTab from "./TableTab";
import SettingsTab from "./SettingsTab";
import InsightsTab from "./InsightsTab";
import IfcTab from "./IfcTab";
import CheckTab from "./CheckTab";
import ReportTab from "./ReportTab";
import "./Ribbon.css";

interface RibbonProps {
  onFileTabClick?: () => void;
  onSettingsClick?: () => void;
  onProjectSettingsClick?: () => void;
  /** Actieve app-thema ("light" / "openaec" / …) — voor de Instellingen-tab. */
  theme?: string;
  /** Themawissel vanaf de Instellingen-tab (direct toepassen + persist). */
  onThemeSelect?: (theme: string) => void;
  /** Open de alleen-lezen bibliotheek-dialoog (profielen / materialen). */
  onOpenLibrary?: (tab: "sections" | "materials") => void;
  activeView: string;
  onViewChange: (view: string) => void;
  /** Active FEM canvas tool. Routed into HomeTab so draw buttons can highlight + dispatch. */
  femTool?: import("../fem/femTypes").Tool;
  onFemToolChange?: (t: import("../fem/femTypes").Tool) => void;
  /** Fires when the user clicks the "Toetsen uitvoeren" button on the Toetsing tab. */
  onSolve?: () => void;
  /** Fires when the user clicks the "Maatgevend (envelope)" button. */
  onShowEnvelope?: () => void;
  /** True when the multi-LC solver run has completed; gates the envelope button. */
  hasEnvelope?: boolean;
  /** True when any solver result is available; lights up the Berekenen button on Home. */
  hasResults?: boolean;
  /** Delete currently-selected node/beam/plate from the store. */
  onDelete?: () => void;
  /** Undo / Redo callbacks + availability flags. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Opens the Stramien / Grids dialog. */
  onOpenGrids?: () => void;
  /** Opens the load-cases + combinations dialog. */
  onOpenLoadCases?: () => void;
  /** Opens the same dialog on the Combinaties tab. */
  onOpenLoadCombinations?: () => void;
  /** Show a specific Insights sub-view (element-K / system-K / dof / logs / errors). */
  onShowInsightsMode?: (mode: "element" | "system" | "dof" | "logs" | "errors") => void;
  /** Export all stiffness matrices as CSV. */
  onExportMatrixCsv?: () => void;
  // ── Check-tab wiring ──────────────────────────────────────────────────
  /** Normtoetsing: EN 1993 + EN 1995 samen in één run (Rust-backend). */
  onRunMemberChecks?: () => void;
  checksRunning?: boolean;
  onOpenCheckPanel?: () => void;
  checkPanelActive?: boolean;
  activeCode?: "EN1993" | "EN1995" | "EN1992";
  onSelectCode?: (c: "EN1993" | "EN1995" | "EN1992") => void;
  onToggleResultsPanel?: () => void;
  resultsPanelActive?: boolean;
  onExportCheck?: () => void;
  onFilterSelection?: () => void;
  /** Export standalone HTML report (browser + Tauri). */
  onExportHtml?: () => void;
  /** IFC4-export van het rekenmodel (Structural Analysis Domain). */
  onExportIfc?: () => void;
  /** File-menu actions (Home tab + Backstage). */
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
  /** @deprecated — read from useReportStore in the Report tab/preview. Kept for prop-compat. */
  pageSize?: "A4" | "A3";
  /** @deprecated */
  orientation?: "portrait" | "landscape";
  /** @deprecated */
  onPageSizeChange?: (size: "A4" | "A3") => void;
  /** @deprecated */
  onOrientationChange?: (orientation: "portrait" | "landscape") => void;
  // ── Tabel-tab wiring ──────────────────────────────────────────────────
  /** Actieve dataset van de tabel-editor (highlight op de Tabel-tab). */
  tableDataset?: import("../table/tableTypes").TableDataset;
  /** Dataset kiezen — App schakelt daarbij ook de hoofdweergave om. */
  onTableDataset?: (d: import("../table/tableTypes").TableDataset) => void;
  /** Actieve tabel als CSV downloaden. */
  onTableExportCsv?: () => void;
  /** Actieve tabel als TSV naar het klembord. */
  onTableCopy?: () => void;
  /** Filterveld boven de tabel focussen. */
  onTableFocusFilter?: () => void;
}

const TABS = ["home", "table", "settings", "insights", "ifc", "check", "report"] as const;
type TabId = (typeof TABS)[number];

export default function Ribbon({
  onFileTabClick, onSettingsClick, onProjectSettingsClick, activeView, onViewChange,
  theme, onThemeSelect, onOpenLibrary,
  femTool, onFemToolChange, onSolve, onShowEnvelope, hasEnvelope, hasResults,
  onDelete, onUndo, onRedo, canUndo, canRedo, onOpenGrids,
  onOpenLoadCases, onOpenLoadCombinations, onNewProject, onOpenProject,
  onSaveProject, onSaveProjectAs,
  onShowInsightsMode, onExportMatrixCsv,
  onRunMemberChecks, checksRunning, onOpenCheckPanel, checkPanelActive,
  activeCode, onSelectCode, onToggleResultsPanel, resultsPanelActive,
  onExportCheck,
  onFilterSelection,
  onExportHtml,
  onExportIfc,
  tableDataset, onTableDataset, onTableExportCsv, onTableCopy, onTableFocusFilter,
}: RibbonProps) {
  const { t, i18n } = useTranslation("ribbon");
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [prevTab, setPrevTab] = useState<TabId | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const tabsRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);

  const updateHighlight = useCallback(() => {
    const tabsEl = tabsRef.current;
    const borderEl = borderRef.current;
    const gapEl = gapRef.current;
    if (!tabsEl || !borderEl || !gapEl) return;

    const activeEl = tabsEl.querySelector(".ribbon-tab.active") as HTMLElement | null;
    if (!activeEl) {
      borderEl.style.opacity = "0";
      gapEl.style.opacity = "0";
      return;
    }

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = activeRect.left - tabsRect.left;
    const top = activeRect.top - tabsRect.top;
    const width = activeRect.width;
    const height = activeRect.height;

    borderEl.style.opacity = "1";
    borderEl.style.left = `${left}px`;
    borderEl.style.top = `${top}px`;
    borderEl.style.width = `${width}px`;
    borderEl.style.height = `${height}px`;

    gapEl.style.opacity = "1";
    gapEl.style.left = `${left + 1}px`;
    gapEl.style.width = `${width - 2}px`;
  }, []);

  const switchTab = useCallback((newTab: TabId) => {
    if (newTab === activeTab) return;
    const oldIndex = TABS.indexOf(activeTab);
    const newIndex = TABS.indexOf(newTab);
    setDirection(newIndex > oldIndex ? "right" : "left");
    setPrevTab(activeTab);
    setActiveTab(newTab);
    setAnimating(true);

    // Switch main content view based on tab
    if (newTab === "ifc") onViewChange("ifc");
    else if (newTab === "report") onViewChange("report");
    else if (newTab === "insights") onViewChange("insights");
    else if (newTab === "table") onViewChange("table");
    else onViewChange("default");
  }, [activeTab, onViewChange]);

  // Houd de ribbon-tab in sync wanneer App de hoofdview programmatisch
  // wisselt (bv. TitleBar-Afdrukken → rapportweergave). Alleen voor views
  // die 1-op-1 bij een tab horen; "default" hoort bij meerdere tabs
  // (Start/Tabel/Instellingen) en blijft daarom ongemoeid.
  useEffect(() => {
    if (
      (activeView === "report" || activeView === "ifc" ||
       activeView === "insights" || activeView === "check" ||
       activeView === "table") &&
      activeTab !== activeView
    ) {
      switchTab(activeView as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeTab, i18n.language, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => {
      setAnimating(false);
      setPrevTab(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [animating]);

  const renderContent = (tab: TabId) => {
    switch (tab) {
      case "home":
        return <HomeTab
          onSettingsClick={onSettingsClick}
          onProjectSettingsClick={onProjectSettingsClick}
          femTool={femTool}
          onFemToolChange={onFemToolChange}
          onDelete={onDelete}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onOpenGrids={onOpenGrids}
          onSolve={onSolve}
          hasResults={hasResults}
          onOpenLoadCases={onOpenLoadCases}
          onOpenLoadCombinations={onOpenLoadCombinations}
          onFilterSelection={onFilterSelection}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onSaveProject={onSaveProject}
          onSaveProjectAs={onSaveProjectAs}
        />;
      case "table":
        return <TableTab
          activeDataset={tableDataset}
          onSelectDataset={onTableDataset}
          onExportCsv={onTableExportCsv}
          onCopyTable={onTableCopy}
          onFocusFilter={onTableFocusFilter}
        />;
      case "settings":
        return <SettingsTab
          onSettingsClick={onSettingsClick}
          onProjectSettingsClick={onProjectSettingsClick}
          theme={theme}
          onThemeSelect={onThemeSelect}
          onOpenLibrary={onOpenLibrary}
        />;
      case "insights":
        return <InsightsTab onShowInsights={() => onViewChange("insights")} onShowInsightsMode={onShowInsightsMode} onExportMatrixCsv={onExportMatrixCsv} />;
      case "ifc":
        return <IfcTab onExportIfc={onExportIfc} />;
      case "check":
        return <CheckTab
          onSolve={onSolve}
          onShowEnvelope={onShowEnvelope}
          hasEnvelope={hasEnvelope}
          onRunMemberChecks={onRunMemberChecks}
          checksRunning={checksRunning}
          onOpenCheckPanel={onOpenCheckPanel}
          checkPanelActive={checkPanelActive}
          activeCode={activeCode}
          onSelectCode={onSelectCode}
          onToggleResultsPanel={onToggleResultsPanel}
          resultsPanelActive={resultsPanelActive}
          onExportCheck={onExportCheck}
        />;
      case "report":
        return <ReportTab onExportHtml={onExportHtml} />;
    }
  };

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs" ref={tabsRef}>
        <RibbonTab label={t("tabs.file")} isFileTab onClick={() => onFileTabClick?.()} />
        {TABS.map((tab) => (
          <RibbonTab
            key={tab}
            label={t(`tabs.${tab}`)}
            isActive={activeTab === tab}
            onClick={() => switchTab(tab)}
          />
        ))}
        <div className="ribbon-tab-border" ref={borderRef} />
        <div className="ribbon-tab-gap" ref={gapRef} />
      </div>

      <div className="ribbon-content-wrapper">
        {animating && prevTab && (
          <div
            className={`ribbon-content-panel ribbon-panel-exit-${direction}`}
            key={`prev-${prevTab}`}
          >
            {renderContent(prevTab)}
          </div>
        )}
        <div
          className={`ribbon-content-panel${animating ? ` ribbon-panel-enter-${direction}` : ""}`}
          key={`active-${activeTab}`}
        >
          {renderContent(activeTab)}
        </div>
      </div>
    </div>
  );
}
