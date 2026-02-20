import { useState, useEffect, useRef, useCallback } from 'react';
import { FEMProvider, useFEM, applyLoadCaseToMesh } from './context/FEMContext';
import { solve } from './core/solver/SolverService';
import { Ribbon } from './components/Ribbon/Ribbon';
import { ProjectBrowser } from './components/ProjectBrowser/ProjectBrowser';
import { MeshEditor } from './components/MeshEditor/MeshEditor';
import { VisibilityPanel } from './components/VisibilityPanel/VisibilityPanel';
import { LoadCaseTabs } from './components/LoadCaseTabs/LoadCaseTabs';
import { LoadCaseDialog } from './components/LoadCaseDialog/LoadCaseDialog';
import { ProjectInfoDialog } from './components/ProjectInfoDialog/ProjectInfoDialog';
import { GridsDialog } from './components/GridsDialog/GridsDialog';
import { AgentPanel } from './components/AgentPanel/AgentPanel';
import { ConsolePanel } from './components/ConsolePanel/ConsolePanel';
import { MaterialsDialog } from './components/MaterialsDialog/MaterialsDialog';
import { CalculationSettingsDialog } from './components/CalculationSettingsDialog/CalculationSettingsDialog';
import { FileTabs, FileTab } from './components/FileTabs/FileTabs';
import { StatusBar } from './components/StatusBar/StatusBar';
import { CommandPalette } from './components/CommandPalette/CommandPalette';


import { TableEditorPanel } from './components/TableEditorPanel/TableEditorPanel';
import { NodeEditorPanel } from './components/NodeEditorPanel/NodeEditorPanel';
import { InsightsPanel } from './components/InsightsPanel/InsightsPanel';

import { ConcreteReinforcementDialog } from './components/ConcreteReinforcementDialog/ConcreteReinforcementDialog';
import { IFCPanel } from './components/IFCPanel/IFCPanel';

import { serializeProject, deserializeProject } from './core/io/ProjectSerializer';
import { Box } from 'lucide-react';
import { I18nProvider } from './i18n/I18nProvider';

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
  const [showLoadCaseDialog, setShowLoadCaseDialog] = useState(false);
  const [showProjectInfoDialog, setShowProjectInfoDialog] = useState(false);
  const [showGridsDialog, setShowGridsDialog] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showConsolePanel, setShowConsolePanel] = useState(false);
  const [showMaterialsDialog, setShowMaterialsDialog] = useState(false);
  const [showCalculationSettings, setShowCalculationSettings] = useState(false);

  const [showReinforcementDialog, setShowReinforcementDialog] = useState(false);
  const [showGraphSplit, setShowGraphSplit] = useState(false);
  const [graphSplitHeight, setGraphSplitHeight] = useState(280);
  const splitDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [displayCollapsed, setDisplayCollapsed] = useState(false);
  const [activeRibbonTab, setActiveRibbonTab] = useState<string>('home');


  // Expose snapshot function to parent
  const getSnapshot = useProjectSnapshot();
  onSnapshotRef.current = getSnapshot;

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

  // Solve handler for on-demand solving (e.g. clicking Results tab)
  const handleSolve = useCallback(() => {
    if (state.mesh.getNodeCount() < 2) return;

    const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
    if (activeLc) {
      applyLoadCaseToMesh(state.mesh, activeLc, false);
    }

    const effectiveAnalysisType = getEffectiveAnalysisType();

    if (effectiveAnalysisType !== state.analysisType) {
      dispatch({ type: 'SET_ANALYSIS_TYPE', payload: effectiveAnalysisType });
    }

    solve(state.mesh, {
      analysisType: effectiveAnalysisType,
      geometricNonlinear: false
    })
      .then(result => {
        const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
        if (activeLc) {
          applyLoadCaseToMesh(state.mesh, activeLc);
        }
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
        if (effectiveAnalysisType === 'frame') {
          dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
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

      const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
      if (activeLc) {
        applyLoadCaseToMesh(state.mesh, activeLc, false);
      }

      const effectiveAnalysisType = getEffectiveAnalysisType();

      solve(state.mesh, {
        analysisType: effectiveAnalysisType,
        geometricNonlinear: false
      }, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) {
            const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
            if (activeLc) {
              applyLoadCaseToMesh(state.mesh, activeLc);
            }
            dispatch({ type: 'SET_RESULT', payload: result });
            if (effectiveAnalysisType !== state.analysisType) {
              dispatch({ type: 'SET_ANALYSIS_TYPE', payload: effectiveAnalysisType });
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
      if (showReinforcementDialog) { setShowReinforcementDialog(false); return; }

      if (showCalculationSettings) { setShowCalculationSettings(false); return; }
      if (showMaterialsDialog) { setShowMaterialsDialog(false); return; }
      if (showGridsDialog) { setShowGridsDialog(false); return; }
      if (showProjectInfoDialog) { setShowProjectInfoDialog(false); return; }
      if (showLoadCaseDialog) { setShowLoadCaseDialog(false); return; }
      if (showConsolePanel) { setShowConsolePanel(false); return; }
      if (showAgentPanel) { setShowAgentPanel(false); return; }
    };
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    showReinforcementDialog,
    showCalculationSettings, showMaterialsDialog,
    showGridsDialog, showProjectInfoDialog,
    showLoadCaseDialog, showConsolePanel, showAgentPanel,
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


  return (
    <div className="app">
      <div className="title-bar">
        <div className="title-bar-left">
          <Box size={14} />
          <span>Open FEM Studio</span>
        </div>
        <div className="title-bar-center">{state.projectInfo.name || 'Untitled Project'}</div>
        <div className="title-bar-right" />
      </div>
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
        activeRibbonTab={activeRibbonTab as any}
        onRibbonTabChange={setActiveRibbonTab}
      />
      <div className="main-content">
        <ProjectBrowser
          collapsed={browserCollapsed}
          onToggleCollapse={() => setBrowserCollapsed(!browserCollapsed)}
        />
        <div className="canvas-area">
          {fileTabs}
          {activeRibbonTab === 'insights' ? (
            <InsightsPanel />
          ) : activeRibbonTab === 'table' ? (
            <TableEditorPanel />
          ) : activeRibbonTab === 'ifc' ? (
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
              case 'viewTable': setActiveRibbonTab('table'); break;
              case 'viewInsights': setActiveRibbonTab('insights'); break;
              case 'viewGraph': setShowGraphSplit(g => !g); break;
              case 'viewAgent': setShowAgentPanel(a => !a); break;
              case 'viewConsole': setShowConsolePanel(c => !c); break;
              case 'zoomToFit': dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } }); break;
              case 'resetView': dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } }); break;
            }
          }} />
        </div>
        {activeRibbonTab !== 'table' && activeRibbonTab !== 'insights' && activeRibbonTab !== 'ifc' && (
          <VisibilityPanel
            collapsed={displayCollapsed}
            onToggleCollapse={() => setDisplayCollapsed(!displayCollapsed)}
          />
        )}
        {showAgentPanel && <AgentPanel onClose={() => setShowAgentPanel(false)} />}
        {showConsolePanel && <ConsolePanel onClose={() => setShowConsolePanel(false)} />}
      </div>
      <LoadCaseTabs onSolve={handleSolve} />
      <StatusBar />

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
    <FileTabs
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
