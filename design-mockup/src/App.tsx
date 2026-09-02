import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import Ribbon from "./components/ribbon/Ribbon";
import DocumentBar from "./components/DocumentBar";
import StatusBar, { type SolverStatus } from "./components/StatusBar";
import Backstage from "./components/backstage/Backstage";
import ToastHost from "./components/feedback/Toast";
import { useRecentFiles } from "./hooks/useRecentFiles";
import SettingsDialog, { applyTheme } from "./components/settings/SettingsDialog";
import FeedbackDialog from "./components/feedback/FeedbackDialog";
import WelcomeScreen from "./components/welcome/WelcomeScreen";
import ProjectSettingsDialog from "./components/project/ProjectSettingsDialog";
import IfcViewerPanel from "./components/panels/IfcViewerPanel";
import ReportPreview, { DetachedReportPreview } from "./components/panels/ReportPreview";
import { ReportWindowSync } from "./components/report/reportSync";
import type { ReportData } from "./components/report/ReportDataContext";
import InsightsView from "./components/panels/InsightsView";
import CheckPanel from "./components/panels/CheckPanel";
import FemProjectTree from "./components/fem/FemProjectTree";
import FemProperties from "./components/fem/FemProperties";
import FemCanvas from "./components/fem/FemCanvas";
import LoadCaseTabBar from "./components/fem/LoadCaseTabBar";
import LoadCasesDialog from "./components/fem/LoadCasesDialog";
import Sheet from "./components/openaec/Sheet";
import { getDetachedParams, useWindowManager } from "./hooks/useWindowManager";
import { useFemStore } from "./hooks/useFemStore";
import type { GridSettings, Tool } from "./components/fem/femTypes";
import { DEFAULT_GRID } from "./components/fem/femTypes";
import type { SolverResult, MultiInput } from "./components/fem/solver/types";
import { solveAllCases, solveAllCasesNonlinear } from "./components/fem/solver/solver";
import { combineResults, computeEnvelope } from "./components/fem/solver/combinations";
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "./components/fem/FemResultsOverlay";
import { selfWeightPerMeter } from "./components/fem/profileData";
import { resolveSection } from "./lib/sectionResolver";
import { useCheckStore, anyCheckableBeams } from "./stores/checkStore";
import { combinationsToFile, combinationsFromFile } from "./io/projectFile";
import { isTauriApp, DESKTOP_ONLY_MSG } from "./lib/tauri";
import { getSetting } from "./store";
import "./themes.css";
import "./App.css";

const ThreeViewer = lazy(() => import("./components/panels/ThreeViewer"));

/**
 * Detached window — shows only one view, no ribbon/backstage/etc.
 * Has a "dock back" button to re-attach to the main window.
 */
function DetachedApp({ view, title }: { view: string; title: string }) {
  const { requestDockBack } = useWindowManager();

  useEffect(() => {
    getSetting("theme", "light").then((saved) => applyTheme(saved));
    // Browservenster (window.open-fallback): venstertitel zelf zetten.
    document.title = `${title} — Open FEM2D Studio`;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().show();
    }).catch(() => {});
  }, [title]);

  const handleDockBack = () => {
    // Browser-fallback: het venster is met window.open geopend en mag
    // zichzelf sluiten — het rapport leeft gewoon door in het hoofdvenster.
    if (!isTauriApp()) {
      window.close();
      return;
    }
    requestDockBack(title, view);
  };

  const renderView = () => {
    switch (view) {
      case "ifc":
        return <IfcViewerPanel />;
      case "report":
        // R5 — live gesynchroniseerd rapport (snapshot-push via reportSync).
        return <DetachedReportPreview />;
      case "viewer":
        return (
          <Suspense fallback={<div className="placeholder"><p>Loading 3D Viewer...</p></div>}>
            <ThreeViewer />
          </Suspense>
        );
      default:
        return <div className="placeholder"><p>Detached view</p></div>;
    }
  };

  return (
    <>
      <TitleBar onSettingsClick={() => {}} onFeedbackClick={() => {}} />
      {/* Dock-back bar */}
      <div className="detached-dock-bar">
        <span className="detached-dock-title">{title}</span>
        <button className="detached-dock-btn" onClick={handleDockBack} title="Dock back to main window">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          <span>Dock back</span>
        </button>
      </div>
      <main className="main-view" style={{ flex: 1 }}>
        {renderView()}
      </main>
      <StatusBar />
    </>
  );
}

/**
 * Convert UI-side spring stiffness (kN/mm, kNm/rad) to solver units (N/mm, N·mm/rad).
 *  - zSpring/xSpring: k_ui [kN/mm] × 1000 → N/mm
 *  - rotSpring:       k_ui [kNm/rad] × 1e6 → N·mm/rad
 * Returns undefined for non-spring supports (the solver ignores `k` for rigid types).
 */
function liftSpringK(s: { type: string; k?: number }): number | undefined {
  if (s.k === undefined) return undefined;
  if (s.type === "zSpring" || s.type === "xSpring") return s.k * 1000;
  if (s.type === "rotSpring") return s.k * 1e6;
  return undefined;
}

function App() {
  // Check if this is a detached window
  const detachedParams = getDetachedParams();
  if (detachedParams.detached && detachedParams.view) {
    return <DetachedApp view={detachedParams.view} title={detachedParams.title ?? "Untitled"} />;
  }
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  // Currently-open project path (Tauri only; empty string = unsaved).
  // Save → write back to this path; Save As → always opens dialog and updates this.
  const [projectPath, setProjectPath] = useState<string>("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [activeView, setActiveView] = useState("default");
  // FEM tool state — shared between Ribbon (active highlight) + FemCanvas (action)
  const [femTool, setFemTool] = useState<Tool>("select");
  // FEM model state lifted to App.tsx via useFemStore.
  const fem = useFemStore();
  const { addRecentFile } = useRecentFiles();
  // Normtoetsing (EN 1993 staal + EN 1995 hout) — resultaten in checkStore.
  const checkRun = useCheckStore((s) => s.run);
  const checksRunning = useCheckStore((s) => s.isRunning);
  const checkClear = useCheckStore((s) => s.clear);
  // R5 — losgekoppeld rapportvenster ("Naast je scherm").
  const { createDetachedWindow } = useWindowManager();
  const { t: tRibbon } = useTranslation("ribbon");
  const handleDetachReport = useCallback(() => {
    void createDetachedWindow({
      view: "report",
      title: tRibbon("report.report", "Rapport"),
      width: 860,
      height: 1100,
    });
  }, [createDetachedWindow, tRibbon]);

  // R5 — doorgeef-regels naar het live rapport (ReportDataContext): één
  // object voor het Rapport-tabblad én de snapshot-sync naar losgekoppelde
  // vensters. useMemo op veld-identiteiten: alleen echte mutaties leveren
  // een nieuw object (en dus een nieuw snapshot) op.
  const reportData: ReportData = useMemo(() => ({
    nodes: fem.nodes,
    beams: fem.beams,
    supports: fem.supports,
    loads: fem.loads,
    loadCases: fem.loadCases,
    combinations: fem.combinations,
    structuralGrid: fem.structuralGrid,
    selfWeightEnabled: fem.selfWeightEnabled,
    // R3 — resultaten voor de resultaatsecties. useFemStore zet deze op null
    // bij elke modelwijziging, dus het rapport valt dan automatisch terug op
    // "Nog niet berekend" (nooit verouderd).
    combinationResults: fem.combinationResults,
    envelope: fem.envelope,
  }), [
    fem.nodes, fem.beams, fem.supports, fem.loads, fem.loadCases,
    fem.combinations, fem.structuralGrid, fem.selfWeightEnabled,
    fem.combinationResults, fem.envelope,
  ]);

  // ── File-menu handlers (after `fem` is declared) ────────────────────────
  const buildProjectSnapshot = useCallback(() => ({
    nodes: fem.nodes,
    beams: fem.beams,
    supports: fem.supports,
    plates: fem.plates,
    loads: fem.loads,
    loadCases: fem.loadCases,
    activeLoadCaseId: fem.activeLoadCaseId,
    selfWeightEnabled: fem.selfWeightEnabled,
    nonlinearEnabled: fem.nonlinearEnabled,
    // v2: combinaties (Map-factoren → JSON-object) + stramien.
    combinations: combinationsToFile(fem.combinations),
    structuralGrid: fem.structuralGrid,
  }), [fem]);

  // ── C2: dirty-vlag ("niet-opgeslagen wijzigingen") ──────────────────────
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => {
    isDirtyRef.current = v;
    setIsDirty(v);
  }, []);
  // JSON van de laatst opgeslagen/geladen snapshot; null = nog geen baseline.
  const lastSavedRef = useRef<string | null>(null);
  // Na Openen/Nieuw is de fem-state in de handler zelf nog oud (React-flush) —
  // deze vlag vraagt de dirty-check-effect om de eerstvolgende run als nieuwe
  // baseline te nemen.
  const baselineResetRef = useRef(false);

  /** Opslaan als — retourneert true als er daadwerkelijk is opgeslagen. */
  const handleSaveProjectAs = useCallback(async (): Promise<boolean> => {
    const { serializeProject, saveProjectAs } = await import("./io/projectFile");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    try {
      const snap = buildProjectSnapshot();
      const text = serializeProject(snap);
      const suggested = projectPath || "project.ifcfem2d";
      const newPath = await saveProjectAs(text, suggested);
      if (newPath) {
        setProjectPath(newPath);
        addRecentFile(newPath);
      } else if (isTauriApp()) {
        // Native dialoog geannuleerd — er is niets weggeschreven.
        return false;
      }
      lastSavedRef.current = JSON.stringify(snap);
      setDirty(false);
      notifySuccess("Bestand opgeslagen", newPath || "Download gestart in browser.");
      return true;
    } catch (e) {
      notifyWarning("Opslaan mislukt", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [buildProjectSnapshot, projectPath, addRecentFile, setDirty]);

  /** Opslaan — naar het bekende pad, of via Opslaan-als zonder pad. */
  const handleSaveProject = useCallback(async (): Promise<boolean> => {
    if (!projectPath) {
      return handleSaveProjectAs();
    }
    const { serializeProject, saveProjectTo } = await import("./io/projectFile");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    try {
      const snap = buildProjectSnapshot();
      const text = serializeProject(snap);
      await saveProjectTo(projectPath, text);
      lastSavedRef.current = JSON.stringify(snap);
      setDirty(false);
      notifySuccess("Bestand opgeslagen", projectPath.split(/[\\/]/).pop());
      return true;
    } catch (e) {
      notifyWarning("Opslaan mislukt", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [buildProjectSnapshot, projectPath, handleSaveProjectAs, setDirty]);

  /**
   * C2: sluitbeveiliging. Vraagt bij niet-opgeslagen wijzigingen wat er moet
   * gebeuren: Opslaan / Niet opslaan / Annuleren (twee dialogen, want de
   * Tauri dialog-plugin kent alleen twee-knops dialogen). Retourneert true
   * wanneer de aanroeper mag doorgaan (schoon, opgeslagen of bewust
   * weggegooid), false bij Annuleren of mislukt opslaan.
   */
  const confirmUnsavedAction = useCallback(async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    if (isTauriApp()) {
      const { ask, confirm } = await import("@tauri-apps/plugin-dialog");
      const wantsSave = await ask(t("unsaved.askSave"), {
        title: t("unsaved.title"),
        kind: "warning",
        okLabel: t("unsaved.saveBtn"),
        cancelLabel: t("unsaved.dontSaveBtn"),
      });
      if (wantsSave) return handleSaveProject();
      // "Niet opslaan" → één extra bevestiging zodat Esc of een misklik geen
      // werk weggooit.
      return confirm(t("unsaved.confirmDiscard"), {
        title: t("unsaved.title"),
        kind: "warning",
        okLabel: t("unsaved.proceedBtn"),
        cancelLabel: t("unsaved.cancelBtn"),
      });
    }
    // Browser-fallback: window.confirm kent maar twee knoppen.
    return window.confirm(t("unsaved.confirmDiscard"));
  }, [handleSaveProject, t]);

  const handleOpenProject = useCallback(async () => {
    if (!(await confirmUnsavedAction())) return;
    const { openProject, deserializeProject } = await import("./io/projectFile");
    const opened = await openProject();
    if (!opened) return;
    try {
      const parsed = deserializeProject(opened.text);
      baselineResetRef.current = true;
      fem.loadProjectState({
        nodes: parsed.nodes,
        beams: parsed.beams,
        supports: parsed.supports,
        plates: parsed.plates,
        loads: parsed.loads,
        loadCases: parsed.loadCases,
        activeLoadCaseId: parsed.activeLoadCaseId,
        selfWeightEnabled: parsed.selfWeightEnabled,
        nonlinearEnabled: parsed.nonlinearEnabled,
        // v2-velden; undefined bij v1-bestanden → store-defaults.
        combinations: combinationsFromFile(parsed.combinations),
        structuralGrid: parsed.structuralGrid,
      });
      setProjectPath(opened.path);
      addRecentFile(opened.path);
      const { notifySuccess } = await import("./io/notify");
      notifySuccess("Project geopend", opened.path.split(/[\\/]/).pop());
    } catch (e) {
      const { notifyWarning } = await import("./io/notify");
      notifyWarning("Kan bestand niet openen", e instanceof Error ? e.message : String(e));
    }
  }, [fem, confirmUnsavedAction, addRecentFile]);

  /**
   * Open een project via een bekend pad (recente bestanden — backstage én
   * welkomstscherm). Zelfde route en sluitbeveiliging als Openen/Nieuw.
   */
  const handleOpenFilePath = useCallback(async (path: string) => {
    if (!(await confirmUnsavedAction())) return;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const { deserializeProject } = await import("./io/projectFile");
    const { notifyWarning, notifySuccess } = await import("./io/notify");
    try {
      const text = await readTextFile(path);
      const parsed = deserializeProject(text);
      baselineResetRef.current = true;
      fem.loadProjectState({
        nodes: parsed.nodes, beams: parsed.beams, supports: parsed.supports,
        plates: parsed.plates, loads: parsed.loads,
        loadCases: parsed.loadCases, activeLoadCaseId: parsed.activeLoadCaseId,
        selfWeightEnabled: parsed.selfWeightEnabled,
        nonlinearEnabled: parsed.nonlinearEnabled,
        // v2-velden; undefined bij v1-bestanden → store-defaults.
        combinations: combinationsFromFile(parsed.combinations),
        structuralGrid: parsed.structuralGrid,
      });
      setProjectPath(path);
      addRecentFile(path);
      notifySuccess("Project geopend", path.split(/[\\/]/).pop());
    } catch (e) {
      notifyWarning("Kan bestand niet openen", e instanceof Error ? e.message : String(e));
    }
  }, [fem, confirmUnsavedAction, addRecentFile]);

  // Bestand → Nieuw: direct een LEEG project (geen confirm, geen reload,
  // geen demo-model). Standaard belastinggevallen blijven beschikbaar zodat
  // de tab-bar en de solver-flow meteen bruikbaar zijn; undo-history wordt
  // door loadProjectState gereset. Ctrl+Z kan dus niet terug — maar het oude
  // model is via Recent/opslaan altijd nog te openen.
  const handleNewProject = useCallback(async () => {
    if (!(await confirmUnsavedAction())) return;
    baselineResetRef.current = true;
    fem.loadProjectState({
      nodes: [], beams: [], supports: [], plates: [], loads: [],
      loadCases: [
        { id: 1, name: "Permanent (G)", type: "dead" },
        { id: 2, name: "Variabel (Q)",  type: "live" },
        { id: 3, name: "Sneeuw (S)",    type: "snow" },
        { id: 4, name: "Wind (W)",      type: "wind" },
      ],
      activeLoadCaseId: 1,
      selfWeightEnabled: false,
      nonlinearEnabled: false,
    });
    setProjectPath("");
    setActiveView("default");
  }, [fem, setActiveView, confirmUnsavedAction]);

  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  // Solverstatus voor de StatusBar: Gereed / Berekend om HH:MM / Fout.
  const [solverStatus, setSolverStatus] = useState<SolverStatus>({ kind: "ready" });
  // Actuele canvas-zoom in % (gemeld door FemCanvas) — getoond in de StatusBar.
  const [zoomPct, setZoomPct] = useState(100);

  // HTML-rapport export — altijd werkend (browser + Tauri). Kiest het actieve
  // resultaat: combinatie indien geselecteerd, anders single-LC solverResult.
  const handleExportHtmlReport = useCallback(async () => {
    const { openReportWindow } = await import("./io/reportExport");
    let result = solverResult;
    let scopeName: string | undefined;
    if (fem.activeCombinationId != null && fem.combinationResults) {
      const r = fem.combinationResults.get(fem.activeCombinationId);
      if (r) {
        result = r;
        scopeName = fem.combinations.find(c => c.id === fem.activeCombinationId)?.name;
      }
    } else if (result) {
      scopeName = fem.loadCases.find(lc => lc.id === fem.activeLoadCaseId)?.name;
    }
    openReportWindow({
      projectName: projectPath ? projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") : undefined,
      nodes: fem.nodes,
      beams: fem.beams,
      supports: fem.supports,
      loads: fem.loads,
      loadCases: fem.loadCases,
      result,
      scopeName,
    });
  }, [fem, solverResult, projectPath]);
  // Auto-invalidate solver results zodra het model OF de belastingen wijzigen.
  // (useFemStore doet dit al voor multi-LC outputs; hier hetzelfde voor de
  // single-LC solverResult uit FemCanvas.)
  useEffect(() => {
    setSolverResult(null);
    // Also flip the envelope-view off; otherwise the user lingers on stale
    // envelope colors after editing the model.
    fem.setEnvelopeView(false);
    fem.setActiveCombinationId(null);
    // Normtoetsingsresultaten horen bij het oude model → wissen.
    checkClear();
    // Model gewijzigd → oude berekening telt niet meer, status terug naar Gereed.
    setSolverStatus({ kind: "ready" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fem.nodes, fem.beams, fem.supports, fem.loads]);

  // Result display toggles — lifted so both the FemCanvas HUD and the
  // FemProjectTree "Resultaten" tab can mutate the same flags.
  const [displayFlags, setDisplayFlags] = useState<DisplayFlags>(DEFAULT_DISPLAY_FLAGS);
  // Results-tab active flag — toggled door de Resultaten-tab onderaan.
  // Wanneer true: alle krachten-overlays aan (M+V+N+vervorming+reacties).
  // Wordt uit-gezet zodra de gebruiker op Model of een LC-tab klikt.
  const [resultsTabActive, setResultsTabActive] = useState(false);
  // Tab in the project-tree (verkenner) — controlled door App zodat Berekenen
  // automatisch naar "results" springt.
  const [treeTab, setTreeTab] = useState<"project" | "results">("project");
  // Grid settings (mutated by Grids dialog)
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID);
  const [gridsOpen, setGridsOpen] = useState(false);
  const [loadCasesOpen, setLoadCasesOpen] = useState(false);
  // Check-tab state.
  const [activeCode, setActiveCode] = useState<"EN1993" | "EN1995" | "EN1992">("EN1993");
  const [autoRunCheck, setAutoRunCheck] = useState(false);
  // Insights view mode (element-K / system-K / dof / logs / errors), controlled from Ribbon.
  const [insightsMode, setInsightsMode] = useState<"element" | "system" | "dof" | "logs" | "errors">("element");
  // Last solver error text — shown in InsightsView Errors-tab.
  const [solverErrorText] = useState<string | null>(null);
  const [loadCasesTab, setLoadCasesTab] = useState<"cases" | "combos">("cases");
  // FEM solve trigger — increments on each "Berekenen" click. FemCanvas
  // watches this and re-runs the solver against the current model.
  const [solveTrigger, setSolveTrigger] = useState(0);
  /**
   * Draai de multi-LC pipeline (alle belastinggevallen + combinaties +
   * envelope) en schrijf de uitkomst in de fem-store. Retourneert de verse
   * outputs zodat aanroepers (normtoetsing) niet op een React re-render
   * hoeven te wachten. Fouten zijn non-fataal → null.
   */
  const computeAndStoreSolverOutputs = useCallback(() => {
    try {
      const multiInput: MultiInput = {
        nodes: fem.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
        beams: fem.beams.map(b => {
          // Stijfheid uit materiaal + profiel — zelfde route als het canvas-pad
          // (FemCanvas → resolveSection). Zonder dit rekende het multi-LC-pad
          // (combinaties/envelope/toetsing) élke staaf met de solver-default
          // (HEA 160 / S235) en kreeg de toetsing krachten en zakkingen van
          // het verkeerde model.
          const sec = resolveSection(b.material, b.profile);
          return {
            id: b.id, from: b.from, to: b.to,
            E: sec.E, A: sec.A, I: sec.I,
            // Scharnier-aansluiting: forward rotational releases to the engine.
            // The solver condenses moment at hinged ends via applyEndReleases.
            // (Pure translation releases — startTx/endTx/startTz/endTz — are not
            //  yet wired through; rotational hinges cover the typical column-beam case.)
            startConnection: b.releases?.startRy ? 'hinge' as const : 'fixed' as const,
            endConnection:   b.releases?.endRy   ? 'hinge' as const : 'fixed' as const,
          };
        }),
        supports: fem.supports.map(s => ({ nodeId: s.nodeId, type: s.type, k: liftSpringK(s) })),
        cases: fem.loadCases.map(lc => ({ id: lc.id, name: lc.name })),
        loads: [], pointLoads: [], thermalLoads: [],
      };
      // Optional: append self-weight as extra distributed loads on the first
      // permanent (dead) load case. Each beam → q = -ρ·A·g (downward in +Z).
      if (fem.selfWeightEnabled) {
        const deadCase = fem.loadCases.find(c => c.type === "dead") ?? fem.loadCases[0];
        if (deadCase) {
          for (const b of fem.beams) {
            const q = selfWeightPerMeter(b.material ?? "S235", b.profile ?? "HEA160");
            if (Math.abs(q) > 1e-9) {
              multiInput.loads.push({
                beamId: b.id,
                q,
                caseId: deadCase.id,
              });
            }
          }
        }
      }

      for (const l of fem.loads) {
        if (l.type === "lineLoad" && l.beamId !== undefined && l.q !== undefined) {
          multiInput.loads.push({
            beamId: l.beamId,
            q: l.q,
            qStart: l.qStart,
            qEnd: l.qEnd,
            qDir: l.qDir,
            startFrac: l.startFrac,
            endFrac: l.endFrac,
            caseId: l.caseId,
          });
        } else if (l.type === "pointForce" && l.nodeId !== undefined) {
          multiInput.pointLoads!.push({
            nodeId: l.nodeId,
            fx: (l.fx ?? 0) * 1000,
            fz: (l.fz ?? 0) * 1000,
            caseId: l.caseId,
          });
        } else if (l.type === "pointMoment" && l.nodeId !== undefined) {
          multiInput.pointLoads!.push({
            nodeId: l.nodeId,
            my: (l.my ?? 0) * 1e6,
            caseId: l.caseId,
          });
        } else if (l.type === "thermal" && l.beamId !== undefined && l.deltaT !== undefined) {
          multiInput.thermalLoads!.push({
            beamId: l.beamId,
            deltaT: l.deltaT,
            caseId: l.caseId,
          });
        }
      }
      const { perCase } = fem.nonlinearEnabled
        ? solveAllCasesNonlinear(multiInput)
        : solveAllCases(multiInput);
      const combinationResults = new Map(
        fem.combinations.map(c => [c.id, combineResults(c, perCase)])
      );
      const envelope = computeEnvelope(fem.combinations, perCase);
      const outputs = { perCase, combinationResults, envelope };
      fem.setSolverOutputs(outputs);
      return outputs;
    } catch (e) {
      console.warn("[FEM multi-LC]", e);
      fem.setSolverOutputs(null);
      return null;
    }
  }, [fem]);

  /**
   * Eén run voor staal én hout: zorgt eerst voor verse combinatieresultaten
   * (zo nodig wordt het model direct doorgerekend), bouwt daarna de
   * check-inputs en invoket beide Rust-commands parallel (checkStore.run).
   * In de browser (zonder Tauri) volgt een nette melding i.p.v. een kale
   * invoke-fout.
   */
  const handleRunMemberChecks = useCallback(async (opts?: {
    openPanel?: boolean;
    outputs?: { combinationResults: Map<number, SolverResult> } | null;
  }) => {
    const openPanel = opts?.openPanel ?? true;
    const { notifyWarning, notifyInfo } = await import("./io/notify");
    if (!isTauriApp()) {
      notifyWarning("Toetsing vereist de desktop-app", DESKTOP_ONLY_MSG);
      if (openPanel) setActiveView("check");
      return;
    }
    if (!anyCheckableBeams(fem.beams)) {
      notifyInfo(
        "Geen toetsbare staven",
        "Het model bevat geen staalprofielen (HEA/HEB/IPE/…) en geen houtklassen (C24, GL28h, …).",
      );
      if (openPanel) setActiveView("check");
      return;
    }
    let combinationResults = opts?.outputs?.combinationResults ?? fem.combinationResults;
    if (!combinationResults) {
      combinationResults = computeAndStoreSolverOutputs()?.combinationResults ?? null;
    }
    if (!combinationResults) {
      notifyWarning(
        "Toetsing",
        "Doorrekenen mislukt — controleer het model (opleggingen, belastingen).",
      );
      return;
    }
    if (openPanel) setActiveView("check");
    await checkRun({
      nodes: fem.nodes,
      beams: fem.beams,
      combinations: fem.combinations,
      combinationResults,
    });
  }, [fem, computeAndStoreSolverOutputs, checkRun]);

  const handleSolve = useCallback(() => {
    setSolveTrigger((n) => n + 1);
    // Make sure the user is looking at the canvas (not the report/IFC view).
    setActiveView("default");
    // Spring direct naar de Resultaten-tab in BEIDE plekken:
    //   1. verkenner (FemProjectTree) — links
    //   2. belastinggevallen-strip (LoadCaseTabBar) — onder
    setTreeTab("results");
    setResultsTabActive(true);
    // Zet alle resultaten-overlays standaard aan zodat M/V/N + reacties +
    // vervorming meteen zichtbaar zijn op de canvas.
    setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true }));
    // Clear selection so the results overlay isn't visually competing with
    // selection-halos. User wants a clean view after computing.
    fem.setSelection(null);
    // Multi-LC pipeline zodat Combinaties + Envelope direct bruikbaar zijn.
    const outputs = computeAndStoreSolverOutputs();
    // Solverstatus voor de StatusBar: gelukt → tijdstip; mislukt → Fout.
    setSolverStatus(outputs ? { kind: "solved", at: Date.now() } : { kind: "error" });
    // Auto-uitvoeren: normtoetsing meteen achter de berekening aan (zonder
    // van weergave te wisselen — de gebruiker kijkt naar de canvas).
    if (autoRunCheck && outputs && isTauriApp()) {
      void handleRunMemberChecks({ openPanel: false, outputs });
    }
  }, [fem, computeAndStoreSolverOutputs, autoRunCheck, handleRunMemberChecks]);

  // Keyboard: Ctrl+Z / Ctrl+Y for undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        fem.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        fem.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fem]);

  // C1: Ctrl+S / Cmd+S = Opslaan, Ctrl+Shift+S = Opslaan als. Altijd
  // preventDefault zodat de browser-save-dialoog nooit verschijnt; opslaan
  // mag óók vuren terwijl een input/dialog focus heeft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) void handleSaveProjectAs();
        else void handleSaveProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSaveProject, handleSaveProjectAs]);

  // C2: dirty-detectie. Draait alléén wanneer persisteerbare modelstate
  // wijzigt (array-identiteiten veranderen per mutatie), nooit per render —
  // de JSON-vergelijking is dus event-gedreven en goedkoop.
  useEffect(() => {
    const json = JSON.stringify(buildProjectSnapshot());
    if (baselineResetRef.current || lastSavedRef.current === null) {
      baselineResetRef.current = false;
      lastSavedRef.current = json;
      setDirty(false);
      return;
    }
    setDirty(json !== lastSavedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fem.nodes, fem.beams, fem.supports, fem.plates, fem.loads,
      fem.loadCases, fem.activeLoadCaseId, fem.selfWeightEnabled, fem.nonlinearEnabled,
      // v2: combinaties + stramien reizen mee in de snapshot-JSON.
      fem.combinations, fem.structuralGrid]);

  // C2: sluitbeveiliging. Tauri: onCloseRequested + native dialoog (dekt de
  // titelbalk-sluitknop, Bestand → Afsluiten en Alt+F4). Browser: beforeunload.
  const confirmUnsavedRef = useRef(confirmUnsavedAction);
  useEffect(() => { confirmUnsavedRef.current = confirmUnsavedAction; });
  useEffect(() => {
    if (isTauriApp()) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested(async (event) => {
            if (!isDirtyRef.current) return;
            const proceed = await confirmUnsavedRef.current();
            if (!proceed) event.preventDefault();
          })
        )
        .then((u) => { if (disposed) u(); else unlisten = u; })
        .catch(() => {});
      return () => { disposed = true; unlisten?.(); };
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // C2: wijzigingsindicator in de venster-/tabtitel ("● bestandsnaam").
  useEffect(() => {
    const name = projectPath ? projectPath.split(/[\\/]/).pop() : "project 1.ifcfem2d";
    document.title = `${isDirty ? "● " : ""}${name} — Open FEM2D Studio`;
  }, [isDirty, projectPath]);

  // Startvenster verwijderd op verzoek: de app opent direct in het model.

  // Left panel state (Explorer)
  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const isLeftResizing = useRef(false);

  // Right panel state (Properties)
  const [rightPanelWidth, setRightPanelWidth] = useState(240);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const isRightResizing = useRef(false);

  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
    // Welcome modal is no longer auto-shown — the persistent StartSidebar
    // replaces it. Users can still open it via the help menu.
    getSetting("showWelcome", false).then((show) => {
      if (show) setWelcomeOpen(true);
    });
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().show();
    }).catch(() => {});
  }, []);

  // Left panel resize handler
  const handleLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isLeftResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isLeftResizing.current) return;
      const newWidth = Math.max(160, Math.min(480, ev.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isLeftResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Right panel resize handler
  const handleRightResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isRightResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isRightResizing.current) return;
      const newWidth = Math.max(160, Math.min(480, window.innerWidth - ev.clientX));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isRightResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Full-width views (3D viewer, IFC viewer, report, insights, toetsing) hide the side panels
  const isFullWidthView = activeView === "viewer" || activeView === "ifc" || activeView === "report" || activeView === "insights" || activeView === "check";

  const renderMainContent = () => {
    switch (activeView) {
      case "ifc":
        return <IfcViewerPanel />;
      case "report":
        // Doorgeef-regels naar het live rapport (ReportDataContext) — de
        // secties lezen deze modelstate en volgen elke wijziging direct.
        return <ReportPreview data={reportData} onDetach={handleDetachReport} />;
      case "check":
        return <CheckPanel onRun={() => { void handleRunMemberChecks(); }} />;
      case "insights":
        return <InsightsView nodes={fem.nodes} beams={fem.beams} supports={fem.supports} initialMode={insightsMode} solverError={solverErrorText} />;
      case "viewer":
        return (
          <Suspense fallback={<div className="placeholder"><p>Loading 3D Viewer...</p></div>}>
            <ThreeViewer />
          </Suspense>
        );
      default:
        // FEM canvas (Start tab) — v2 implementation of the FEM editor
        return <FemCanvas
          tool={femTool}
          onToolChange={setFemTool}
          solveTrigger={solveTrigger}
          onSolveResult={(r) => {
            setSolverResult(r);
            // Single-LC solve geslaagd → de canvas toont resultaten, dus de
            // StatusBar meldt "Berekend om ..." — ook als de multi-LC-pipeline
            // (combinaties/envelope) faalde. r === null laat de status met
            // rust: invalidatie zet hem al op "Gereed", een solve-fout op
            // "Fout" (via handleSolve).
            if (r) setSolverStatus({ kind: "solved", at: Date.now() });
          }}
          nodes={fem.nodes}
          beams={fem.beams}
          supports={fem.supports}
          plates={fem.plates}
          loads={fem.loads}
          selection={fem.selection}
          activeLoadCaseId={fem.activeLoadCaseId}
          showLoads={fem.showLoads}
          setPendingLoadFocus={fem.setPendingLoadFocus}
          setSelection={fem.setSelection}
          addNode={fem.addNode}
          updateNode={fem.updateNode}
          addBeam={fem.addBeam}
          updateBeam={fem.updateBeam}
          addPlate={fem.addPlate}
          addSupport={fem.addSupport}
          addLoad={fem.addLoad}
          deleteSelected={fem.deleteSelected}
          splitBeamAt={fem.splitBeamAt}
          translateSelection={fem.translateSelection}
          copySelection={fem.copySelection}
          rotateSelection={fem.rotateSelection}
          mirrorSelection={fem.mirrorSelection}
          translateNodes={fem.translateNodes}
          structuralGrid={fem.structuralGrid}
          setStructuralGrid={fem.setStructuralGrid}
          grid={grid}
          combinations={fem.combinations}
          activeCombinationId={fem.activeCombinationId}
          envelopeView={fem.envelopeView}
          combinationResults={fem.combinationResults}
          envelope={fem.envelope}
          displayFlags={displayFlags}
          setDisplayFlags={setDisplayFlags}
          resultsMode={resultsTabActive}
          onZoomChange={setZoomPct}
        />;
    }
  };

  return (
    <>
      <TitleBar
        onSettingsClick={() => setSettingsOpen(true)}
        onFeedbackClick={() => setFeedbackOpen(true)}
        onSaveClick={() => { void handleSaveProject(); }}
        onUndoClick={fem.undo}
        onRedoClick={fem.redo}
        canUndo={fem.canUndo}
        canRedo={fem.canRedo}
        onPrintClick={() => setActiveView("report")}
      />
      <ToastHost />
      {/* R5 — houdt losgekoppelde rapportvensters synchroon met het model,
          de solver-uitkomsten, de toetsresultaten en de rapportinstellingen.
          Altijd gemonteerd (ook buiten het Rapport-tabblad), zodat het
          losgekoppelde venster live blijft terwijl hier gemodelleerd wordt. */}
      <ReportWindowSync data={reportData} />
      <Ribbon
        onFileTabClick={() => setBackstageOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        onProjectSettingsClick={() => setProjectSettingsOpen(true)}
        activeView={activeView}
        onViewChange={setActiveView}
        femTool={femTool}
        onFemToolChange={setFemTool}
        onSolve={handleSolve}
        onShowEnvelope={() => {
          fem.setEnvelopeView(true);
          fem.setActiveCombinationId(null);
          setActiveView("default");
        }}
        hasEnvelope={fem.envelope !== null}
        hasResults={solverResult !== null || fem.envelope !== null}
        onDelete={fem.deleteSelected}
        onUndo={fem.undo}
        onRedo={fem.redo}
        canUndo={fem.canUndo}
        canRedo={fem.canRedo}
        onOpenGrids={() => setGridsOpen(true)}
        onOpenLoadCases={() => { setLoadCasesTab("cases"); setLoadCasesOpen(true); }}
        onOpenLoadCombinations={() => { setLoadCasesTab("combos"); setLoadCasesOpen(true); }}
        onExportHtml={handleExportHtmlReport}
        onFilterSelection={() => {
          // Filter current selection: if multi-selection, keep only the first
          // type (nodes / beams / plates) — quickest visible effect for now.
          const sel = fem.selection as any;
          if (sel && sel.type === "multi") {
            if (sel.nodeIds.length > 0)        fem.setSelection({ type: "node", id: sel.nodeIds[0] } as any);
            else if (sel.beamIds.length > 0)   fem.setSelection({ type: "beam", id: sel.beamIds[0] } as any);
            else if (sel.plateIds.length > 0)  fem.setSelection({ type: "plate", id: sel.plateIds[0] } as any);
          }
        }}
        onRunMemberChecks={() => { void handleRunMemberChecks(); }}
        checksRunning={checksRunning}
        onOpenCheckPanel={() => setActiveView(activeView === "check" ? "default" : "check")}
        checkPanelActive={activeView === "check"}
        activeCode={activeCode}
        onSelectCode={setActiveCode}
        resultsPanelActive={resultsTabActive}
        onToggleResultsPanel={() => {
          const next = !resultsTabActive;
          setResultsTabActive(next);
          setTreeTab(next ? "results" : "project");
          if (next) setDisplayFlags(f => ({ ...f, M: true, V: true, N: true, deflection: true, reactions: true }));
        }}
        autoRunEnabled={autoRunCheck}
        onToggleAutoRun={() => setAutoRunCheck(v => !v)}
        onExportCheck={async () => {
          const { runMinimalSteelCheck, exportCheckResultsCsv } = await import("./io/steelCheck");
          // Pick scope: active combination > envelope > active LC > single-LC result
          let r: SolverResult | null = solverResult;
          if (fem.activeCombinationId != null && fem.combinationResults)
            r = fem.combinationResults.get(fem.activeCombinationId) ?? r;
          if (!r) {
            alert("Voer eerst Berekenen uit voordat je een Check exporteert.");
            return;
          }
          const rows = runMinimalSteelCheck(fem.beams, r);
          exportCheckResultsCsv(rows);
        }}
        onShowInsightsMode={(m) => { setInsightsMode(m); setActiveView("insights"); }}
        onExportMatrixCsv={async () => {
          try {
            const { exportMatricesAsCsv } = await import("./io/matrixExport");
            exportMatricesAsCsv(fem.nodes, fem.beams, fem.supports);
          } catch (e) { console.error("CSV export failed:", e); }
        }}
        onNewProject={() => { void handleNewProject(); }}
        onOpenProject={() => { void handleOpenProject(); }}
        onSaveProject={() => { void handleSaveProject(); }}
        onSaveProjectAs={() => { void handleSaveProjectAs(); }}
      />
      <DocumentBar
        fileName={projectPath ? projectPath.split(/[\\/]/).pop() : undefined}
        modified={isDirty}
      />
      <div className="content">
        {/* Left panel — Explorer (hidden in full-width views) */}
        {!isFullWidthView && (
          <aside className={`left-panel${leftPanelOpen ? "" : " collapsed"}${isResizing ? " no-transition" : ""}`} style={{ width: leftPanelOpen ? leftPanelWidth : 28 }}>
            {leftPanelOpen ? (
              <>
                <div className="left-panel-toolbar">
                  <span className="left-panel-title">{t("explorer")}</span>
                  <button className="left-panel-close-btn" onClick={() => setLeftPanelOpen(false)} title={t("close")}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A1.5 1.5 0 013.5 1h9A1.5 1.5 0 0114 2.5v11a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5v-11zM3.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5H6V2H3.5zM7 2v12h5.5a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5H7z" /></svg>
                  </button>
                </div>
                <div className="left-panel-body">
                  <FemProjectTree
                    nodes={fem.nodes}
                    beams={fem.beams}
                    supports={fem.supports}
                    plates={fem.plates}
                    loads={fem.loads}
                    loadCases={fem.loadCases}
                    activeLoadCaseId={fem.activeLoadCaseId}
                    selection={fem.selection}
                    setSelection={fem.setSelection}
                    setActiveLoadCaseId={(id) => {
                      // Selecting an LC = leave combination/envelope view, show LC's loads
                      fem.setActiveLoadCaseId(id);
                      fem.setActiveCombinationId(null);
                      fem.setEnvelopeView(false);
                      fem.setShowLoads(true);
                      setResultsTabActive(false);
                    }}
                    addLoadCase={fem.addLoadCase}
                    combinations={fem.combinations}
                    activeCombinationId={fem.activeCombinationId}
                    setActiveCombinationId={(id) => {
                      // Picking a combination must enable the results overlay
                      // path: ensure showLoads is true and the bottom Resultaten-
                      // tab is highlighted so the user sees the change land.
                      fem.setActiveCombinationId(id);
                      if (id !== null) {
                        fem.setEnvelopeView(false);
                        fem.setShowLoads(true);
                        setResultsTabActive(true);
                        // Default all relevant overlays on so the change is visible.
                        setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true }));
                      }
                    }}
                    envelopeView={fem.envelopeView}
                    setEnvelopeView={(v) => {
                      fem.setEnvelopeView(v);
                      if (v) {
                        fem.setActiveCombinationId(null);
                        fem.setShowLoads(true);
                        setResultsTabActive(true);
                        setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true }));
                      }
                    }}
                    envelope={fem.envelope}
                    displayFlags={displayFlags}
                    setDisplayFlags={setDisplayFlags}
                    hasResults={solverResult !== null || fem.envelope !== null}
                    activeTab={treeTab}
                    setActiveTab={setTreeTab}
                  />
                </div>
                <div className="left-panel-resize" onMouseDown={handleLeftResizeMouseDown} />
              </>
            ) : (
              <button className="left-panel-collapsed-tab" onClick={() => setLeftPanelOpen(true)} title={t("explorer")}>
                <span>{t("explorer")}</span>
              </button>
            )}
          </aside>
        )}

        <main className="main-view">
          {renderMainContent()}
        </main>

        {/* Right panel — Properties (hidden in full-width views) */}
        {!isFullWidthView && (
          <aside className={`right-panel${rightPanelOpen ? "" : " collapsed"}${isResizing ? " no-transition" : ""}`} style={{ width: rightPanelOpen ? rightPanelWidth : 28 }}>
            {rightPanelOpen ? (
              <>
                <div className="right-panel-resize" onMouseDown={handleRightResizeMouseDown} />
                <div className="right-panel-toolbar">
                  <span className="right-panel-title">{t("properties")}</span>
                  <button className="right-panel-close-btn" onClick={() => setRightPanelOpen(false)} title={t("close")}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A1.5 1.5 0 013.5 1h9A1.5 1.5 0 0114 2.5v11a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5v-11zM3.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5H9V2H3.5zM10 2v12h2.5a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5H10z" /></svg>
                  </button>
                </div>
                <div className="right-panel-body">
                  <FemProperties
                    selection={fem.selection}
                    nodes={fem.nodes}
                    beams={fem.beams}
                    plates={fem.plates}
                    supports={fem.supports}
                    loads={fem.loads}
                    updateNode={fem.updateNode}
                    updateBeam={fem.updateBeam}
                    addSupport={fem.addSupport}
                    removeSupport={fem.removeSupport}
                    updateLoad={fem.updateLoad}
                    pendingLoadFocus={fem.pendingLoadFocus}
                    clearPendingLoadFocus={() => fem.setPendingLoadFocus(null)}
                    results={solverResult}
                  />
                </div>
              </>
            ) : (
              <button className="right-panel-collapsed-tab" onClick={() => setRightPanelOpen(true)} title={t("properties")}>
                <span>{t("properties")}</span>
              </button>
            )}
          </aside>
        )}
      </div>
      {/* Load case tab strip — hidden on full-width IFC/Report views. */}
      {!isFullWidthView && (
        <LoadCaseTabBar
          loadCases={fem.loadCases}
          activeLoadCaseId={fem.activeLoadCaseId}
          setActiveLoadCaseId={(id) => { fem.setActiveLoadCaseId(id); setResultsTabActive(false); }}
          addLoadCase={fem.addLoadCase}
          loads={fem.loads}
          selfWeightEnabled={fem.selfWeightEnabled}
          setSelfWeightEnabled={fem.setSelfWeightEnabled}
          nonlinearEnabled={fem.nonlinearEnabled}
          setNonlinearEnabled={fem.setNonlinearEnabled}
          showLoads={fem.showLoads}
          setShowLoads={(v) => { fem.setShowLoads(v); setResultsTabActive(false); }}
          hasResults={solverResult !== null || fem.envelope !== null}
          resultsActive={resultsTabActive}
          onShowResults={() => {
            setResultsTabActive(true);
            fem.setShowLoads(true);
            setDisplayFlags({
              ...displayFlags,
              M: true, V: true, N: true,
              deflection: true,
              reactions: true,
            });
          }}
        />
      )}
      <StatusBar
        nodeCount={fem.nodes.length}
        beamCount={fem.beams.length}
        loadCount={fem.loads.length}
        zoomPct={activeView === "default" ? zoomPct : undefined}
        solverStatus={solverStatus}
      />
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFile={(path) => { void handleOpenFilePath(path); }}
        onNew={() => { void handleNewProject(); }}
        onOpen={() => { void handleOpenProject(); }}
        onSave={() => { void handleSaveProject(); }}
        onSaveAs={() => { void handleSaveProjectAs(); }}
      />
      <LoadCasesDialog
        open={loadCasesOpen}
        onClose={() => setLoadCasesOpen(false)}
        initialTab={loadCasesTab}
        loadCases={fem.loadCases}
        combinations={fem.combinations}
        addLoadCase={fem.addLoadCase}
        updateLoadCase={fem.updateLoadCase}
        removeLoadCase={fem.removeLoadCase}
        addCombination={fem.addCombination}
        updateCombination={fem.updateCombination}
        removeCombination={fem.removeCombination}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} onThemeChange={setTheme} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <ProjectSettingsDialog open={projectSettingsOpen} onClose={() => setProjectSettingsOpen(false)} />
      {welcomeOpen && (
        <WelcomeScreen
          onClose={() => setWelcomeOpen(false)}
          onNewProject={() => { void handleNewProject(); }}
          onOpenProject={() => { void handleOpenProject(); }}
          onOpenFile={(path) => { void handleOpenFilePath(path); }}
        />
      )}
      {/* Grids dialog — right-docked sheet, controls grid show/hide/spacing + stramien */}
      {!isFullWidthView && (
        <Sheet open={gridsOpen} title="Stramien" onClose={() => setGridsOpen(false)}>
          <div className="oa-grid-form">
            <div className="oa-grid-section-title">Achtergrondgrid</div>
            <label className="oa-grid-row">
              <span>Toon grid</span>
              <input type="checkbox" checked={grid.show}
                onChange={e => setGrid(g => ({ ...g, show: e.target.checked }))} />
            </label>
            <label className="oa-grid-row">
              <span>Toon gridlijnen</span>
              <input type="checkbox" checked={grid.showLines}
                onChange={e => setGrid(g => ({ ...g, showLines: e.target.checked }))} />
            </label>
            <label className="oa-grid-row">
              <span>Spacing (mm)</span>
              <input type="number" step="50" min="50" value={grid.spacingMm}
                onChange={e => {
                  const v = Math.max(50, Number(e.target.value) || 500);
                  setGrid(g => ({ ...g, spacingMm: v }));
                }} />
            </label>

            <div className="oa-grid-section-title" style={{ marginTop: 14 }}>Stramien (structureel)</div>
            <label className="oa-grid-row">
              <span>Stramien actief</span>
              <input type="checkbox" checked={fem.structuralGrid.enabled}
                onChange={e => fem.setStructuralGrid(prev => ({ ...prev, enabled: e.target.checked }))} />
            </label>

            <div className="oa-grid-subtitle">X-as (verticale lijnen)</div>
            <table className="oa-grid-table">
              <thead><tr><th>Label</th><th>X (mm)</th><th></th></tr></thead>
              <tbody>
                {fem.structuralGrid.xAxes.map((ax, i) => (
                  <tr key={ax.id}>
                    <td><input type="text" value={ax.label}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.map((a, j) => j === i ? { ...a, label: e.target.value } : a) }))} /></td>
                    <td><input type="number" step="100" value={ax.position}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.map((a, j) => j === i ? { ...a, position: Number(e.target.value) || 0 } : a) }))} /></td>
                    <td><button className="oa-grid-x-btn"
                      onClick={() => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.filter((_, j) => j !== i) }))}
                      title="Verwijderen">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="oa-grid-add-btn"
              onClick={() => fem.setStructuralGrid(p => {
                const used = new Set(p.xAxes.map(a => a.label));
                let lbl = "";
                for (let k = 0; k < 26; k++) {
                  const l = String.fromCharCode(65 + k);
                  if (!used.has(l)) { lbl = l; break; }
                }
                const maxPos = p.xAxes.length ? Math.max(...p.xAxes.map(a => a.position)) : 0;
                return { ...p, xAxes: [...p.xAxes, { id: `x-${Date.now()}`, label: lbl || `X${p.xAxes.length + 1}`, position: maxPos + 3000 }] };
              })}
            >+ Toevoegen</button>

            <div className="oa-grid-subtitle">Z-as (horizontale lijnen)</div>
            <table className="oa-grid-table">
              <thead><tr><th>Label</th><th>Z (mm)</th><th></th></tr></thead>
              <tbody>
                {fem.structuralGrid.zAxes.map((ax, i) => (
                  <tr key={ax.id}>
                    <td><input type="text" value={ax.label}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.map((a, j) => j === i ? { ...a, label: e.target.value } : a) }))} /></td>
                    <td><input type="number" step="100" value={ax.position}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.map((a, j) => j === i ? { ...a, position: Number(e.target.value) || 0 } : a) }))} /></td>
                    <td><button className="oa-grid-x-btn"
                      onClick={() => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.filter((_, j) => j !== i) }))}
                      title="Verwijderen">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="oa-grid-add-btn"
              onClick={() => fem.setStructuralGrid(p => {
                const used = new Set(p.zAxes.map(a => a.label));
                let lbl = "";
                for (let k = 1; k <= 99; k++) {
                  const l = String(k);
                  if (!used.has(l)) { lbl = l; break; }
                }
                const maxPos = p.zAxes.length ? Math.max(...p.zAxes.map(a => a.position)) : 0;
                return { ...p, zAxes: [...p.zAxes, { id: `z-${Date.now()}`, label: lbl || `Z${p.zAxes.length + 1}`, position: maxPos + 3000 }] };
              })}
            >+ Toevoegen</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// @ts-expect-error — kept for future use (collapsible accordion primitive)
function PanelSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <button className="panel-section-header" onClick={() => setOpen(!open)}>
        <svg className={`panel-section-chevron${open ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,3 5,6 8,3" /></svg>
        <span className="panel-section-title">{title}</span>
      </button>
      {open && <div className="panel-section-body">{children}</div>}
    </div>
  );
}

export default App;
