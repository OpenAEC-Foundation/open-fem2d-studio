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
  activeCode?: "EN1993" | "EN1995" | "EN1992";
  onSelectCode?: (c: "EN1993" | "EN1995" | "EN1992") => void;
  onToggleResultsPanel?: () => void;
  resultsPanelActive?: boolean;
  autoRunEnabled?: boolean;
  onToggleAutoRun?: () => void;
  onExportCheck?: () => void;
  // ── HomeTab view-toggles ───────────────────────────────────────────────
  onFilterSelection?: () => void;
  graphSplitOn?: boolean;
  onToggleGraphSplit?: () => void;
  agentPanelOn?: boolean;
  onToggleAgentPanel?: () => void;
  consoleOn?: boolean;
  onToggleConsole?: () => void;
  /** Export standalone HTML report (browser + Tauri). */
  onExportHtml?: () => void;
  /** File-menu actions (Home tab + Backstage). */
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProjectAs?: () => void;
  /** @deprecated — read from useReportStore in the Report tab/preview. Kept for prop-compat. */
  pageSize?: "A4" | "A3";
  /** @deprecated */
  orientation?: "portrait" | "landscape";
  /** @deprecated */
  onPageSizeChange?: (size: "A4" | "A3") => void;
  /** @deprecated */
  onOrientationChange?: (orientation: "portrait" | "landscape") => void;
}

const TABS = ["home", "table", "settings", "insights", "ifc", "check", "report"] as const;
type TabId = (typeof TABS)[number];

export default function Ribbon({
  onFileTabClick, onSettingsClick, onProjectSettingsClick, onViewChange,
  femTool, onFemToolChange, onSolve, onShowEnvelope, hasEnvelope, hasResults,
  onDelete, onUndo, onRedo, canUndo, canRedo, onOpenGrids,
  onOpenLoadCases, onOpenLoadCombinations, onNewProject, onOpenProject, onSaveProjectAs,
  onShowInsightsMode, onExportMatrixCsv,
  activeCode, onSelectCode, onToggleResultsPanel, resultsPanelActive,
  autoRunEnabled, onToggleAutoRun, onExportCheck,
  onFilterSelection, graphSplitOn, onToggleGraphSplit,
  agentPanelOn, onToggleAgentPanel, consoleOn, onToggleConsole,
  onExportHtml,
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
    else onViewChange("default");
  }, [activeTab, onViewChange]);

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
          graphSplitOn={graphSplitOn} onToggleGraphSplit={onToggleGraphSplit}
          agentPanelOn={agentPanelOn} onToggleAgentPanel={onToggleAgentPanel}
          consoleOn={consoleOn} onToggleConsole={onToggleConsole}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onSaveProjectAs={onSaveProjectAs}
        />;
      case "table":
        return <TableTab />;
      case "settings":
        return <SettingsTab onSettingsClick={onSettingsClick} onProjectSettingsClick={onProjectSettingsClick} />;
      case "insights":
        return <InsightsTab onShowInsights={() => onViewChange("insights")} onShowInsightsMode={onShowInsightsMode} onExportMatrixCsv={onExportMatrixCsv} />;
      case "ifc":
        return <IfcTab />;
      case "check":
        return <CheckTab
          onSolve={onSolve}
          onShowEnvelope={onShowEnvelope}
          hasEnvelope={hasEnvelope}
          activeCode={activeCode}
          onSelectCode={onSelectCode}
          onToggleResultsPanel={onToggleResultsPanel}
          resultsPanelActive={resultsPanelActive}
          autoRunEnabled={autoRunEnabled}
          onToggleAutoRun={onToggleAutoRun}
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
