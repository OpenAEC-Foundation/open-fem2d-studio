import { useState, useEffect, useRef, useCallback } from 'react';
import { FEMProvider, useFEM, applyLoadCaseToMesh, applyAllLoadCasesToMesh, hasMultipleActiveLoadCases } from './context/FEMContext';
import { solve } from './core/solver/SolverService';
import { Ribbon } from './components/Ribbon/Ribbon';
import { ProjectBrowser } from './components/ProjectBrowser/ProjectBrowser';
import { MeshEditor } from './components/MeshEditor/MeshEditor';
import { VisibilityPanel } from './components/VisibilityPanel/VisibilityPanel';
import { LoadCaseDialog } from './components/LoadCaseDialog/LoadCaseDialog';
import { ProjectInfoDialog } from './components/ProjectInfoDialog/ProjectInfoDialog';
import { GridsDialog } from './components/GridsDialog/GridsDialog';
import { AgentPanel } from './components/AgentPanel/AgentPanel';
import { ConsolePanel } from './components/ConsolePanel/ConsolePanel';
import { MaterialsDialog } from './components/MaterialsDialog/MaterialsDialog';
import { CalculationSettingsDialog } from './components/CalculationSettingsDialog/CalculationSettingsDialog';
import { AppDocumentBar } from './components/openaec/AppDocumentBar';
import type { FileTab } from './components/openaec/types';
import { AppStatusBar } from './components/openaec/AppStatusBar';
import { CommandPalette } from './components/CommandPalette/CommandPalette';


import { TableEditorPanel } from './components/TableEditorPanel/TableEditorPanel';
import { NodeEditorPanel } from './components/NodeEditorPanel/NodeEditorPanel';
import { InsightsPanel } from './components/InsightsPanel/InsightsPanel';
import { ReportPanel } from './components/ReportPanel/ReportPanel';

import { ConcreteReinforcementDialog } from './components/ConcreteReinforcementDialog/ConcreteReinforcementDialog';
import { IFCPanel } from './components/IFCPanel/IFCPanel';
import { AppPropertiesPanel } from './components/openaec/AppPropertiesPanel';

import { serializeProject, deserializeProject } from './core/io/ProjectSerializer';
import { AppTitleBar } from './components/openaec/AppTitleBar';
import { I18nProvider } from './i18n/I18nProvider';
import { Backstage, BackstageAction } from './components/openaec/Backstage/Backstage';
import { SettingsDialog, Theme, Locale } from './components/openaec/SettingsDialog/SettingsDialog';
import { AboutDialog } from './components/openaec/AboutDialog/AboutDialog';
import { useI18n } from './i18n/i18n';
import { fileApi } from './lib/fileApi';
import { windowApi } from './lib/windowApi';
import { migrateLocalStorageToTauriStore } from './lib/migrateLocalStorage';
import { Mesh } from './core/fem/Mesh';
import { invoke } from '@tauri-apps/api/core';
import { buildSteelCheckInputs } from './lib/steelCheckBuilder';
import type { BeamCheckResult } from './lib/types/steel/BeamCheckResult';
import { SteelCheckPanel } from './components/SteelCheckPanel/SteelCheckPanel';

/** Hook used inside FEMProvider to serialize current project state */
function useProjectSnapshot() {
  const { state } = useFEM();
  return useCallback(() => {
    return serializeProject(
      state.mesh,
      state.loadCases,
      [],
      state.projectInfo,
      state.structuralGrid,
      state.graphState,
      state.versioning
    );
  }, [state.mesh, state.loadCases, state.projectInfo, state.structuralGrid, state.graphState, state.versioning]);
}

interface AppContentProps {
  onSnapshotRef: React.MutableRefObject<(() => string) | null>;
  fileTabs: React.ReactNode;
}

function AppContent({ onSnapshotRef, fileTabs }: AppContentProps) {
  const { state, dispatch } = useFEM();
  const { t, locale, setLocale } = useI18n();
  const [showLoadCaseDialog, setShowLoadCaseDialog] = useState(false);
  const [showProjectInfoDialog, setShowProjectInfoDialog] = useState(false);
  const [showGridsDialog, setShowGridsDialog] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showConsolePanel, setShowConsolePanel] = useState(false);
  const [showMaterialsDialog, setShowMaterialsDialog] = useState(false);
  const [showCalculationSettings, setShowCalculationSettings] = useState(false);

  const [showReinforcementDialog, setShowReinforcementDialog] = useState(false);
  const [showSteelCheckPanel, setShowSteelCheckPanel] = useState(true);
  const [showGraphSplit, setShowGraphSplit] = useState(false);
  const [graphSplitHeight, setGraphSplitHeight] = useState(280);
  const splitDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [displayCollapsed, setDisplayCollapsed] = useState(false);
  const [activeRibbonTab, setActiveRibbonTab] = useState<import('./components/Ribbon/Ribbon').RibbonTabId>('home');
  const [activeView, setActiveView] = useState<import('./components/Ribbon/Ribbon').AppView>('mesh');
  const [showProperties, setShowProperties] = useState(false);
  const [showBackstage, setShowBackstage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // Expose snapshot function to parent
  const getSnapshot = useProjectSnapshot();
  onSnapshotRef.current = getSnapshot;

  // One-shot localStorage → Tauri Store migration on first mount
  useEffect(() => {
    migrateLocalStorageToTauriStore().catch(err =>
      console.error('[OpenAEC] Migration failed:', err)
    );
  }, []);

  // Show Project Info dialog at startup for new projects
  const hasShownStartupDialog = useRef(false);
  useEffect(() => {
    if (!hasShownStartupDialog.current) {
      hasShownStartupDialog.current = true;
      // Check if this is a new/empty project
      const isNewProject = state.projectInfo.name === 'New Project' || state.projectInfo.name === '';
      const isEmpty = state.mesh.getNodeCount() === 0 && state.mesh.getBeamCount() === 0;
      if (isNewProject && isEmpty) {
        // Small delay to ensure UI is ready
        setTimeout(() => setShowProjectInfoDialog(true), 300);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect appropriate analysis type based on mesh content
  const getEffectiveAnalysisType = useCallback(() => {
    const hasPlateElements = state.mesh.elements.size > 0;
    const hasBeamElements = state.mesh.getBeamCount() > 0;

    // Mixed beam+plate analysis: both beams AND plates in same model
    if (hasBeamElements && hasPlateElements) {
      return 'mixed_beam_plate';
    }
    // If we only have plates, use plane_stress (unless plate_bending is explicitly set)
    if (hasPlateElements) {
      if (state.analysisType === 'plate_bending') return 'plate_bending';
      return 'plane_stress';
    }
    // If we only have beams, use frame
    if (hasBeamElements) {
      return 'frame';
    }
    // Default to whatever is set
    return state.analysisType;
  }, [state.mesh, state.analysisType]);

  // Ref kept current so solver callbacks can read the live autoRun flag without
  // creating circular callback dependencies.
  const steelCheckAutoRunRef = useRef(state.steelCheckAutoRun);
  steelCheckAutoRunRef.current = state.steelCheckAutoRun;

  // Steel check runner — invokes Tauri command.
  // Accepts an optional freshResult to avoid stale-closure issues when called
  // immediately after SET_RESULT (before React has re-rendered with the new value).
  const handleRunSteelChecks = useCallback(async (freshResult?: import('./core/fem/types').ISolverResult) => {
    const solverResult = freshResult ?? state.result;
    if (!solverResult) return;
    const inputs = buildSteelCheckInputs(
      state.mesh,
      state.beamSteelConfigs,
      solverResult,
      state.projectInfo,
    );
    if (inputs.length === 0) {
      dispatch({ type: 'SET_STEEL_CHECK_RESULTS', payload: [] });
      return;
    }
    try {
      const results = await invoke<BeamCheckResult[]>('check_steel_beams', { inputs });
      dispatch({ type: 'SET_STEEL_CHECK_RESULTS', payload: results });
    } catch (err) {
      dispatch({ type: 'SET_STEEL_CHECK_ERROR', payload: String(err) });
    }
  }, [state.mesh, state.beamSteelConfigs, state.result, state.projectInfo, dispatch]);

  // Keep a stable ref to handleRunSteelChecks so solver callbacks can call it
  // without needing it in their dep arrays (avoids re-creating solve callbacks
  // every time the steel check runner changes).
  const handleRunSteelChecksRef = useRef(handleRunSteelChecks);
  handleRunSteelChecksRef.current = handleRunSteelChecks;

  // Solve handler for on-demand solving (e.g. clicking Results tab)
  //
  // Multi-case behavior: when >1 load case has loads (e.g. "Dead" + "Wind"),
  // we automatically combine ALL cases (factor 1.0 each) so the resulting
  // diagram shows the full superposition. Single-case projects keep the
  // original active-case-only semantics.
  const handleSolve = useCallback(() => {
    if (state.mesh.getNodeCount() < 2) return;

    const combineAll = hasMultipleActiveLoadCases(state.loadCases);
    const applyForSolve = () => {
      if (combineAll) {
        applyAllLoadCasesToMesh(state.mesh, state.loadCases, false);
      } else {
        const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        if (activeLc) applyLoadCaseToMesh(state.mesh, activeLc, false);
      }
    };
    const applyForCanvas = () => {
      // After solving, restore mesh to ACTIVE case so canvas keeps showing
      // per-case load arrows (only the diagram reflects combined result).
      const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
      if (activeLc) applyLoadCaseToMesh(state.mesh, activeLc);
    };

    applyForSolve();

    const effectiveAnalysisType = getEffectiveAnalysisType();

    if (effectiveAnalysisType !== state.analysisType) {
      dispatch({ type: 'SET_ANALYSIS_TYPE', payload: effectiveAnalysisType });
    }

    solve(state.mesh, {
      analysisType: effectiveAnalysisType,
      geometricNonlinear: false
    })
      .then(result => {
        applyForCanvas();
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
        if (effectiveAnalysisType === 'frame') {
          dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
        }
        if (steelCheckAutoRunRef.current) {
          // fire-and-forget; pass result directly to avoid stale closure
          handleRunSteelChecksRef.current(result);
        }
      })
      .catch((err: Error) => {
        dispatch({ type: 'SET_SOLVER_ERROR', payload: err.message || 'Solver failed' });
      });
  }, [state.mesh, state.loadCases, state.activeLoadCase, state.analysisType, dispatch, getEffectiveAnalysisType]);

  // Auto-recalculate: debounced solver trigger on mesh changes
  const autoRecalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRecalcAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!state.autoRecalculate) return;
    if (state.mesh.getNodeCount() < 2) return;

    if (autoRecalcTimer.current) clearTimeout(autoRecalcTimer.current);
    if (autoRecalcAbort.current) autoRecalcAbort.current.abort();

    autoRecalcTimer.current = setTimeout(() => {
      const controller = new AbortController();
      autoRecalcAbort.current = controller;

      // Mirror handleSolve: combine all cases if multiple have loads.
      const combineAll = hasMultipleActiveLoadCases(state.loadCases);
      if (combineAll) {
        applyAllLoadCasesToMesh(state.mesh, state.loadCases, false);
      } else {
        const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        if (activeLc) applyLoadCaseToMesh(state.mesh, activeLc, false);
      }

      const effectiveAnalysisType = getEffectiveAnalysisType();

      solve(state.mesh, {
        analysisType: effectiveAnalysisType,
        geometricNonlinear: false
      }, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) {
            // Restore active case for canvas load display.
            const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
            if (activeLc) {
              applyLoadCaseToMesh(state.mesh, activeLc);
            }
            dispatch({ type: 'SET_RESULT', payload: result });
            if (effectiveAnalysisType !== state.analysisType) {
              dispatch({ type: 'SET_ANALYSIS_TYPE', payload: effectiveAnalysisType });
            }
            if (steelCheckAutoRunRef.current) {
              handleRunSteelChecksRef.current(result);
            }
          }
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted) {
            dispatch({ type: 'SET_SOLVER_ERROR', payload: err.message || 'Solver failed' });
          }
        });
    }, 300);

    return () => {
      if (autoRecalcTimer.current) clearTimeout(autoRecalcTimer.current);
      if (autoRecalcAbort.current) autoRecalcAbort.current.abort();
    };
  }, [state.meshVersion, state.autoRecalculate, state.activeLoadCase, state.analysisType, getEffectiveAnalysisType]);

  // ─── Escape key closes dialogs (outermost first) ────────────────────
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close first open dialog in z-index priority order (outermost first)
      if (showAbout)     { setShowAbout(false); return; }
      if (showSettings)  { setShowSettings(false); return; }
      if (showBackstage) { setShowBackstage(false); return; }
      if (showReinforcementDialog) { setShowReinforcementDialog(false); return; }

      if (showCalculationSettings) { setShowCalculationSettings(false); return; }
      if (showMaterialsDialog) { setShowMaterialsDialog(false); return; }
      if (showGridsDialog) { setShowGridsDialog(false); return; }
      if (showProjectInfoDialog) { setShowProjectInfoDialog(false); return; }
      if (showLoadCaseDialog) { setShowLoadCaseDialog(false); return; }
      if (showConsolePanel) { setShowConsolePanel(false); return; }
      if (showAgentPanel) { setShowAgentPanel(false); return; }
      if (showSteelCheckPanel && state.steelCheckResults) { setShowSteelCheckPanel(false); return; }
    };
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    showAbout, showSettings, showBackstage,
    showReinforcementDialog,
    showCalculationSettings, showMaterialsDialog,
    showGridsDialog, showProjectInfoDialog,
    showLoadCaseDialog, showConsolePanel, showAgentPanel,
    showSteelCheckPanel, state.steelCheckResults,
  ]);

  // Graph split-view drag handlers
  const handleSplitDragStart = useCallback((e: React.PointerEvent) => {
    splitDragRef.current = { startY: e.clientY, startHeight: graphSplitHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [graphSplitHeight]);

  const handleSplitDragMove = useCallback((e: React.PointerEvent) => {
    if (!splitDragRef.current) return;
    const delta = splitDragRef.current.startY - e.clientY;
    const newHeight = Math.max(120, Math.min(600, splitDragRef.current.startHeight + delta));
    setGraphSplitHeight(newHeight);
  }, []);

  const handleSplitDragEnd = useCallback(() => {
    splitDragRef.current = null;
  }, []);

  const handleBackstageAction = useCallback(async (action: BackstageAction) => {
    switch (action) {
      case 'new': {
        // Reset to blank project by loading an empty serialized snapshot
        const blankSnapshot = serializeProject(
          new Mesh(),
          [],
          [],
          { name: 'New Project', projectNumber: '', engineer: '', company: '', date: new Date().toISOString().slice(0, 10), description: '', notes: '', location: '' },
        );
        try {
          const project = deserializeProject(blankSnapshot);
          dispatch({ type: 'LOAD_PROJECT', payload: project });
        } catch (e) {
          console.error('[Backstage] Failed to reset to blank project:', e);
        }
        setCurrentFilePath(null);
        setShowBackstage(false);
        break;
      }
      case 'open': {
        const opened = await fileApi.openProject();
        if (opened) {
          try {
            const project = deserializeProject(opened.content);
            dispatch({ type: 'LOAD_PROJECT', payload: project });
            setCurrentFilePath(opened.path);
            setShowBackstage(false);
          } catch (e) {
            console.error('[Backstage] Failed to load project:', e);
          }
        }
        break;
      }
      case 'save': {
        const snapshot = getSnapshot();
        if (currentFilePath) {
          await fileApi.saveProject(snapshot, currentFilePath);
        } else {
          const path = await fileApi.saveProjectAs(snapshot, state.projectInfo.name || 'project.femp');
          if (path) setCurrentFilePath(path);
        }
        setShowBackstage(false);
        break;
      }
      case 'saveAs': {
        const snapshot = getSnapshot();
        const path = await fileApi.saveProjectAs(snapshot, state.projectInfo.name || 'project.femp');
        if (path) {
          setCurrentFilePath(path);
          setShowBackstage(false);
        }
        break;
      }
      case 'preferences': setShowSettings(true); break;
      case 'about':       setShowAbout(true); break;
      case 'exit':        windowApi.close(); break;
    }
  }, [currentFilePath, dispatch, getSnapshot, state.projectInfo.name]);


  const handleQuickSave = useCallback(async () => {
    const snapshot = getSnapshot();
    if (currentFilePath) {
      await fileApi.saveProject(snapshot, currentFilePath);
    } else {
      const path = await fileApi.saveProjectAs(snapshot, state.projectInfo.name || 'project.femp');
      if (path) setCurrentFilePath(path);
    }
  }, [currentFilePath, getSnapshot, state.projectInfo.name]);

  // Global shortcuts for File operations + Preferences (Phase 2.6).
  // We swallow keys only when no input/textarea/contenteditable has focus, so
  // typing in dialogs/panels still works normally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tgt = e.target as HTMLElement | null;
      const inEditable =
        tgt?.tagName === 'INPUT' ||
        tgt?.tagName === 'TEXTAREA' ||
        tgt?.tagName === 'SELECT' ||
        tgt?.isContentEditable;
      if (inEditable) return;

      const k = e.key.toLowerCase();
      if (k === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleBackstageAction('save');
      } else if (k === 's' && e.shiftKey) {
        e.preventDefault();
        void handleBackstageAction('saveAs');
      } else if (k === 'n') {
        e.preventDefault();
        void handleBackstageAction('new');
      } else if (k === 'o') {
        e.preventDefault();
        void handleBackstageAction('open');
      } else if (e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleBackstageAction]);

  return (
    <div className="oa-app-shell app" data-theme={document.documentElement.dataset.theme ?? 'openaec'}>
      <AppTitleBar onSave={handleQuickSave} />
      <Ribbon
        onShowLoadCaseDialog={() => setShowLoadCaseDialog(true)}
        onShowProjectInfoDialog={() => setShowProjectInfoDialog(true)}
        onShowGridsDialog={() => setShowGridsDialog(true)}
        onShowReinforcementDialog={() => setShowReinforcementDialog(true)}
        onShowMaterialsDialog={() => setShowMaterialsDialog(true)}
        onShowCalculationSettings={() => setShowCalculationSettings(true)}
        onToggleAgent={() => setShowAgentPanel(!showAgentPanel)}
        showAgentPanel={showAgentPanel}
        onToggleConsole={() => setShowConsolePanel(!showConsolePanel)}
        showConsolePanel={showConsolePanel}
        onToggleGraphSplit={() => setShowGraphSplit(!showGraphSplit)}
        showGraphSplit={showGraphSplit}
        onToggleBrowser={() => setBrowserCollapsed(c => !c)}
        showBrowser={!browserCollapsed}
        onToggleVisibility={() => setDisplayCollapsed(c => !c)}
        showVisibility={!displayCollapsed}
        onToggleProperties={() => setShowProperties(p => !p)}
        showProperties={showProperties}
        activeRibbonTab={activeRibbonTab}
        onRibbonTabChange={(tab) => {
          setActiveRibbonTab(tab);
          // Report tab also flips the central view to ReportPanel so the
          // ribbon controls match what's shown in the canvas area.
          if (tab === 'report') setActiveView('report');
        }}
        activeView={activeView}
        onViewChange={setActiveView}
        onFileTabClick={() => setShowBackstage(true)}
        onRunSteelChecks={handleRunSteelChecks}
        onToggleSteelCheckPanel={() => setShowSteelCheckPanel(s => !s)}
        onSolve={handleSolve}
      />
      <div className="main-content">
        {/* ProjectBrowser is hidden in report/ifc/insights/table views — those
            views own the full canvas area and have their own sub-panels. */}
        {activeView === 'mesh' && (
          <ProjectBrowser
            collapsed={browserCollapsed}
            onToggleCollapse={() => setBrowserCollapsed(!browserCollapsed)}
          />
        )}
        <div className="canvas-area">
          {fileTabs}
          {activeView === 'insights' ? (
            <InsightsPanel />
          ) : activeView === 'table' ? (
            <TableEditorPanel />
          ) : activeView === 'report' ? (
            <ReportPanel />
          ) : activeView === 'ifc' ? (
            <IFCPanel>
              <MeshEditor onShowGridsDialog={() => setShowGridsDialog(true)} />
            </IFCPanel>
          ) : showGraphSplit ? (
            <div className="split-view-container">
              <div className="split-view-top">
                <MeshEditor onShowGridsDialog={() => setShowGridsDialog(true)} />
              </div>
              <div
                className="split-view-divider"
                onPointerDown={handleSplitDragStart}
                onPointerMove={handleSplitDragMove}
                onPointerUp={handleSplitDragEnd}
              />
              <div className="split-view-bottom" style={{ height: graphSplitHeight }}>
                <NodeEditorPanel />
              </div>
            </div>
          ) : (
            <MeshEditor onShowGridsDialog={() => setShowGridsDialog(true)} />
          )}
          <CommandPalette onToggleDialog={(dialog) => {
            switch (dialog) {
              case 'loadCases': setShowLoadCaseDialog(true); break;

              case 'materials': setShowMaterialsDialog(true); break;
              case 'projectInfo': setShowProjectInfoDialog(true); break;
              case 'grids': setShowGridsDialog(true); break;
              case 'calcSettings': setShowCalculationSettings(true); break;

              case 'solve': handleSolve(); break;
              case 'selectAll': {
                const allNodeIds = new Set(state.mesh.nodes.keys());
                const allBeamIds = new Set(Array.from(state.mesh.beamElements.keys()));
                dispatch({ type: 'SET_SELECTION', payload: { nodeIds: allNodeIds, elementIds: allBeamIds, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), selectedDistLoadIds: new Set(), plateIds: new Set(), edgeIds: new Set() } });
                break;
              }
              case 'viewTable': setActiveView('table'); break;
              case 'viewInsights': setActiveView('insights'); break;
              case 'viewGraph': setShowGraphSplit(g => !g); break;
              case 'viewAgent': setShowAgentPanel(a => !a); break;
              case 'viewConsole': setShowConsolePanel(c => !c); break;
              case 'zoomToFit': dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } }); break;
              case 'resetView': dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } }); break;
            }
          }} />
        </div>
        {activeView === 'mesh' && !showProperties && (
          <VisibilityPanel
            collapsed={displayCollapsed}
            onToggleCollapse={() => setDisplayCollapsed(!displayCollapsed)}
          />
        )}
        {showAgentPanel && <AgentPanel onClose={() => setShowAgentPanel(false)} />}
        {showConsolePanel && <ConsolePanel onClose={() => setShowConsolePanel(false)} />}
        {showSteelCheckPanel && state.steelCheckResults && (
          <SteelCheckPanel onClose={() => setShowSteelCheckPanel(false)} />
        )}
        {showProperties && (
          <AppPropertiesPanel onClose={() => setShowProperties(false)} />
        )}
      </div>
      {/* LoadCaseTabs bar removed in OpenAEC big-bang — the workflow it
          gated (Geometry / Loads / Results) is now reached via the new
          ribbon tabs (Geometry, Loads, Analyze → Solve, Check). */}
      <AppStatusBar />

      {showLoadCaseDialog && (
        <LoadCaseDialog onClose={() => setShowLoadCaseDialog(false)} />
      )}

      {showProjectInfoDialog && (
        <ProjectInfoDialog onClose={() => setShowProjectInfoDialog(false)} />
      )}
      {showGridsDialog && (
        <GridsDialog onClose={() => setShowGridsDialog(false)} />
      )}

      {showReinforcementDialog && state.selection.plateIds.size > 0 && (
        <ConcreteReinforcementDialog
          plateId={Array.from(state.selection.plateIds)[0]}
          onClose={() => setShowReinforcementDialog(false)}
        />
      )}
      {showMaterialsDialog && (
        <MaterialsDialog
          materials={Array.from(state.mesh.materials.values())}
          onAdd={(material) => {
            state.mesh.addMaterial(material);
            dispatch({ type: 'REFRESH_MESH' });
          }}
          onUpdate={(id, updates) => {
            const mat = state.mesh.getMaterial(id);
            if (mat) {
              Object.assign(mat, updates);
              state.mesh.materials.set(id, mat);
              dispatch({ type: 'REFRESH_MESH' });
            }
          }}
          onDelete={(id) => {
            // Don't delete if any elements use this material
            const inUse = Array.from(state.mesh.elements.values()).some(e => e.materialId === id) ||
                          Array.from(state.mesh.beamElements.values()).some(e => e.materialId === id);
            if (inUse) {
              alert('Cannot delete: material is in use by one or more elements.');
              return;
            }
            state.mesh.materials.delete(id);
            dispatch({ type: 'REFRESH_MESH' });
          }}
          onClose={() => setShowMaterialsDialog(false)}
        />
      )}
      {showCalculationSettings && (
        <CalculationSettingsDialog onClose={() => setShowCalculationSettings(false)} />
      )}

      <Backstage
        isOpen={showBackstage}
        onClose={() => setShowBackstage(false)}
        onAction={handleBackstageAction}
        t={t}
      />
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        theme={(document.documentElement.dataset.theme as Theme) ?? 'light'}
        onThemeChange={(theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem('fem2d-theme', theme);
        }}
        locale={locale as Locale}
        onLocaleChange={(l) => setLocale(l)}
        t={t}
      />
      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        t={t}
      />
    </div>
  );
}

/** Inner component that loads a project snapshot into FEM context */
function ProjectLoader({ snapshot }: { snapshot: string | null }) {
  const { dispatch } = useFEM();
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (snapshot && snapshot !== loadedRef.current) {
      try {
        const project = deserializeProject(snapshot);
        dispatch({ type: 'LOAD_PROJECT', payload: project });
        loadedRef.current = snapshot;
      } catch {
        // Invalid snapshot, ignore
      }
    }
  }, [snapshot, dispatch]);

  return null;
}

let nextTabId = 2;

function App() {
  const [tabs, setTabs] = useState<FileTab[]>([
    { id: 1, name: 'Untitled Project', snapshot: '' }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [pendingSnapshot, setPendingSnapshot] = useState<string | null>(null);
  const snapshotRef = useRef<(() => string) | null>(null);

  const saveCurrentTab = useCallback(() => {
    if (snapshotRef.current) {
      const snap = snapshotRef.current();
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? { ...t, snapshot: snap } : t
      ));
      return snap;
    }
    return '';
  }, [activeTabId]);

  const handleSelectTab = useCallback((id: number) => {
    if (id === activeTabId) return;
    saveCurrentTab();
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    if (tab && tab.snapshot) {
      setPendingSnapshot(tab.snapshot);
    }
  }, [activeTabId, tabs, saveCurrentTab]);

  const handleNewTab = useCallback(() => {
    saveCurrentTab();
    const id = nextTabId++;
    const newTab: FileTab = { id, name: 'New Project', snapshot: '' };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setPendingSnapshot(null);
  }, [saveCurrentTab]);

  const handleCloseTab = useCallback((id: number) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (id === activeTabId) {
      const newActive = remaining[remaining.length - 1];
      setActiveTabId(newActive.id);
      if (newActive.snapshot) {
        setPendingSnapshot(newActive.snapshot);
      }
    }
  }, [tabs, activeTabId]);

  const updateTabName = useCallback((name: string) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, name: name || 'Untitled' } : t
    ));
  }, [activeTabId]);

  const fileTabsElement = (
    <AppDocumentBar
      tabs={tabs}
      activeTabId={activeTabId}
      onSelectTab={handleSelectTab}
      onCloseTab={handleCloseTab}
      onNewTab={handleNewTab}
    />
  );

  return (
    <I18nProvider>
      <FEMProvider>
        <TabNameSync onNameChange={updateTabName} />
        {pendingSnapshot && <ProjectLoader snapshot={pendingSnapshot} />}
        <AppContent onSnapshotRef={snapshotRef} fileTabs={fileTabsElement} />
      </FEMProvider>
    </I18nProvider>
  );
}

/** Syncs the project name from FEM state to the tab name */
function TabNameSync({ onNameChange }: { onNameChange: (name: string) => void }) {
  const { state } = useFEM();
  const prevName = useRef(state.projectInfo.name);

  useEffect(() => {
    if (state.projectInfo.name !== prevName.current) {
      prevName.current = state.projectInfo.name;
      onNameChange(state.projectInfo.name);
    }
  }, [state.projectInfo.name, onNameChange]);

  return null;
}

export default App;
