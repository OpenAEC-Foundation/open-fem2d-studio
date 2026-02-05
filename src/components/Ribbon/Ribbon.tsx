import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { applyLoadCaseToMesh } from '../../context/FEMContext';
import { Tool } from '../../core/fem/types';
import { solve } from '../../core/solver/SolverService';
import { STEEL_GRADES } from '../../core/standards/EurocodeNL';
import { checkSteelSection } from '../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../core/fem/Beam';
import {
  MousePointer2, CircleDot,
  Triangle, ArrowLeftFromLine, Circle, ArrowDownUp, RotateCcw, ArrowLeftRight, Square,
  ArrowDown, Move, Thermometer,
  Play, CheckCircle,
  FileText, Copy, FileDown, Printer,
  Undo2, Redo2, Layers,
  Settings, Info, Save, FolderOpen, Grid3X3, Bot,
  Sun, Moon, Maximize2, Box
} from 'lucide-react';
import { serializeProject } from '../../core/io/ProjectSerializer';
import { deserializeProject } from '../../core/io/ProjectSerializer';
import { Mesh } from '../../core/fem/Mesh';
import './Ribbon.css';

type RibbonTab = 'home' | 'settings' | 'code-check' | '3d' | 'report' | 'table' | 'graph' | 'steel' | 'concrete' | 'timber' | 'other-materials';

interface RibbonProps {
  onShowLoadCaseDialog?: () => void;
  onShowProjectInfoDialog?: () => void;
  onShowStandardsDialog?: () => void;
  onShowGridsDialog?: () => void;
  onShowSteelCheck?: () => void;
  onShowConcreteCheck?: () => void;
  onShowMaterialsDialog?: () => void;
  onShowCalculationSettings?: () => void;
  onToggleAgent?: () => void;
  showAgentPanel?: boolean;
  onShowReportSettings?: () => void;
  onExportReportHTML?: () => void;
  onExportReportPDF?: () => void;
  onPrintReport?: () => void;
  activeRibbonTab?: RibbonTab;
  onRibbonTabChange?: (tab: RibbonTab) => void;
}

export function Ribbon({ onShowLoadCaseDialog, onShowProjectInfoDialog, onShowStandardsDialog, onShowGridsDialog, onShowSteelCheck, onShowConcreteCheck, onShowMaterialsDialog, onShowCalculationSettings, onToggleAgent, showAgentPanel, onShowReportSettings, onExportReportHTML, onExportReportPDF, onPrintReport, activeRibbonTab, onRibbonTabChange }: RibbonProps) {
  const { state, dispatch } = useFEM();
  const { selectedTool, mesh, analysisType, undoStack, redoStack, loadCases, activeLoadCase,
    result, codeCheckBeamId, plateEditMode } = state;
  const [localActiveTab, setLocalActiveTab] = useState<RibbonTab>('home');
  const activeTab = activeRibbonTab ?? localActiveTab;
  const setActiveTab = (tab: RibbonTab) => {
    setLocalActiveTab(tab);
    onRibbonTabChange?.(tab);
  };
  const [solving, setSolving] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('fem2d-theme');
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fem2d-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleTabClick = (tab: RibbonTab) => {
    setActiveTab(tab);
    if (tab === '3d') {
      dispatch({ type: 'SET_VIEW_MODE', payload: '3d' });
    } else if (tab === 'report') {
      // Report tab has its own view, don't change viewMode
    } else if (state.viewMode === '3d') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });
    } else if (state.viewMode === 'results' && tab !== 'code-check') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });
    }
  };

  // When code-check beam ID changes externally, switch to code-check tab
  if (codeCheckBeamId !== null && activeTab !== 'code-check') {
    setActiveTab('code-check');
  }

  const handleSolve = async (geometric: boolean = false) => {
    setSolving(true);
    try {
      // Apply active load case to mesh before solving (include edge→nodal conversion)
      const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
      if (activeLc) {
        applyLoadCaseToMesh(mesh, activeLc, false);
      }

      const result = await solve(mesh, {
        analysisType,
        geometricNonlinear: geometric
      });

      // Reset loads for visualization (don't show edge-converted nodal forces as point loads)
      if (activeLc) {
        applyLoadCaseToMesh(mesh, activeLc); // default: skip edge-to-node conversion
      }

      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
      dispatch({ type: 'SET_BROWSER_TAB', payload: 'results' });
      if (analysisType === 'frame') {
        dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
      }
      if (analysisType === 'plane_stress' || analysisType === 'plane_strain') {
        dispatch({ type: 'SET_SHOW_STRESS', payload: true });
        dispatch({ type: 'SET_STRESS_TYPE', payload: 'vonMises' });
      }
      if (analysisType === 'plate_bending') {
        dispatch({ type: 'SET_SHOW_STRESS', payload: true });
        dispatch({ type: 'SET_STRESS_TYPE', payload: 'mx' });
      }
    } catch (e) {
      alert(`Solver error: ${(e as Error).message}`);
    } finally {
      setSolving(false);
    }
  };

  const loadTools: Tool[] = ['addLoad', 'addLineLoad', 'addThermalLoad'];

  const selectTool = (tool: Tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    // Auto-switch to loads view when selecting a load tool
    if (loadTools.includes(tool) && state.viewMode !== 'loads') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
    }
  };


  const handleSaveProject = async () => {
    const json = serializeProject(
      mesh,
      loadCases,
      state.loadCombinations,
      state.projectInfo,
      state.structuralGrid
    );
    const filename = (state.projectInfo.name || 'project').replace(/\s+/g, '-').toLowerCase() + '.fem2d.json';

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'FEM2D Project',
            accept: { 'application/json': ['.fem2d.json', '.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          alert('Could not save file. Please use Chrome or the Electron desktop app.');
        }
      }
    } else {
      alert('Save dialog not supported in this browser. Please use Chrome or the Electron desktop app.');
    }
  };

  const handleOpenProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fem2d.json,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = deserializeProject(reader.result as string);
          dispatch({ type: 'LOAD_PROJECT', payload: result });
        } catch (err) {
          alert(`Failed to open project: ${(err as Error).message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleNewProject = () => {
    if (confirm('Start a new project? Unsaved changes will be lost.')) {
      const newMesh = new Mesh();
      dispatch({ type: 'LOAD_PROJECT', payload: {
        mesh: newMesh,
        loadCases: [{ id: 1, name: 'Dead Load (G)', type: 'dead' as const, pointLoads: [], distributedLoads: [], thermalLoads: [], color: '#6b7280' }],
        loadCombinations: [],
        projectInfo: { name: 'New Project', projectNumber: '', engineer: '', company: '', date: new Date().toISOString().slice(0, 10), description: '', notes: '', location: '' },
      }});
    }
  };

  return (
    <div className="ribbon">
      {/* Ribbon Tabs */}
      <div className="ribbon-tabs">
        <button className={`ribbon-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => handleTabClick('home')}>
          Home
        </button>
        <button className={`ribbon-tab ${activeTab === '3d' ? 'active' : ''}`} onClick={() => handleTabClick('3d')}>
          3D
        </button>
        <button className={`ribbon-tab ${activeTab === 'table' ? 'active' : ''}`} onClick={() => handleTabClick('table')}>
          Table
        </button>
        <button className={`ribbon-tab ${activeTab === 'graph' ? 'active' : ''}`} onClick={() => handleTabClick('graph')}>
          Graph
        </button>
        <button className={`ribbon-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabClick('settings')}>
          Settings
        </button>
        <button className={`ribbon-tab ${activeTab === 'steel' ? 'active' : ''}`} onClick={() => handleTabClick('steel')}>
          Steel
        </button>
        <button className={`ribbon-tab ${activeTab === 'concrete' ? 'active' : ''}`} onClick={() => handleTabClick('concrete')}>
          Concrete
        </button>
        <button className={`ribbon-tab ${activeTab === 'timber' ? 'active' : ''}`} onClick={() => handleTabClick('timber')}>
          Timber
        </button>
        <button className={`ribbon-tab ${activeTab === 'other-materials' ? 'active' : ''}`} onClick={() => handleTabClick('other-materials')}>
          Other Materials
        </button>
        <button className={`ribbon-tab ${activeTab === 'report' ? 'active' : ''}`} onClick={() => handleTabClick('report')}>
          Report
        </button>
        {codeCheckBeamId && (
          <button className={`ribbon-tab ${activeTab === 'code-check' ? 'active' : ''}`} onClick={() => handleTabClick('code-check')}>
            Code-Check
          </button>
        )}
      </div>

      {/* Ribbon Content */}
      <div className="ribbon-content">
        {activeTab === 'home' && (
          <>
            {/* File */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">File</div>
              <div className="ribbon-group-content grid-2x2">
                <button className="ribbon-button small" onClick={handleNewProject} title="New Project">
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>New</span>
                </button>
                <button className="ribbon-button small" onClick={handleSaveProject} title="Save Project">
                  <span className="ribbon-icon"><Save size={14} /></span>
                  <span>Save As</span>
                </button>
                <button className="ribbon-button small" onClick={handleOpenProject} title="Open Project">
                  <span className="ribbon-icon"><FolderOpen size={14} /></span>
                  <span>Open</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Draw */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Draw</div>
              <div className="ribbon-group-content wrap">
                <button
                  className={`ribbon-button small ${selectedTool === 'select' ? 'active' : ''}`}
                  onClick={() => selectTool('select')}
                  title="Select (V)"
                >
                  <span className="ribbon-icon"><MousePointer2 size={14} /></span>
                  <span>Select</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addBeam' ? 'active' : ''}`}
                  onClick={() => selectTool('addBeam')}
                  title="Draw Bar (B)"
                >
                  <span className="ribbon-icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="3" cy="7" r="2.5" />
                      <line x1="5.5" y1="7" x2="8.5" y2="7" />
                      <circle cx="11" cy="7" r="2.5" />
                    </svg>
                  </span>
                  <span>Bar</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addNode' ? 'active' : ''}`}
                  onClick={() => selectTool('addNode')}
                  title="Add Node (N)"
                >
                  <span className="ribbon-icon"><CircleDot size={14} /></span>
                  <span>Node</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addPlate' ? 'active' : ''}`}
                  onClick={() => selectTool('addPlate')}
                  title="Draw Plate Element"
                >
                  <span className="ribbon-icon"><Square size={14} /></span>
                  <span>Plate</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowGridsDialog}
                  title="Structural Grids"
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>Grids</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Boundary Conditions */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Boundary Conditions</div>
              <div className="ribbon-group-content wrap">
                <button
                  className={`ribbon-button small ${selectedTool === 'addPinned' ? 'active' : ''}`}
                  onClick={() => selectTool('addPinned')}
                  title="Pinned support"
                >
                  <span className="ribbon-icon"><Triangle size={14} /></span>
                  <span>Pinned</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addXRoller')}
                  title="X-Roller"
                >
                  <span className="ribbon-icon"><ArrowLeftFromLine size={14} /></span>
                  <span>X-Roller</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addZRoller')}
                  title="Z-Roller"
                >
                  <span className="ribbon-icon"><Circle size={14} /></span>
                  <span>Z-Roller</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addZSpring')}
                  title="Z-Spring"
                >
                  <span className="ribbon-icon"><ArrowDownUp size={14} /></span>
                  <span>Z-Spring</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addRotSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addRotSpring')}
                  title="Rotational Spring"
                >
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>Rot.Spring</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addXSpring')}
                  title="X-Spring"
                >
                  <span className="ribbon-icon"><ArrowLeftRight size={14} /></span>
                  <span>X-Spring</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addFixed' ? 'active' : ''}`}
                  onClick={() => selectTool('addFixed')}
                  title="Fixed support"
                >
                  <span className="ribbon-icon"><Square size={14} /></span>
                  <span>Fixed</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Loads */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Loads</div>
              <div className="ribbon-group-content grid-3x2">
                <button
                  className={`ribbon-button small ${selectedTool === 'addLineLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addLineLoad')}
                  title="Distributed Load - beam or plate edge (L)"
                >
                  <span className="ribbon-icon line-load-icon">
                    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="17" y2="1" />
                      <line x1="3" y1="1" x2="3" y2="11" />
                      <line x1="3" y1="11" x2="1" y2="8.5" />
                      <line x1="3" y1="11" x2="5" y2="8.5" />
                      <line x1="9" y1="1" x2="9" y2="11" />
                      <line x1="9" y1="11" x2="7" y2="8.5" />
                      <line x1="9" y1="11" x2="11" y2="8.5" />
                      <line x1="15" y1="1" x2="15" y2="11" />
                      <line x1="15" y1="11" x2="13" y2="8.5" />
                      <line x1="15" y1="11" x2="17" y2="8.5" />
                    </svg>
                  </span>
                  <span>Line Load</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addLoad')}
                  title="Point Load (P)"
                >
                  <span className="ribbon-icon"><ArrowDown size={14} /></span>
                  <span>Point Load</span>
                </button>
                <button className="ribbon-button small" title="Moment Load">
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>Moment</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addThermalLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addThermalLoad')}
                  title="Thermal Load"
                >
                  <span className="ribbon-icon"><Thermometer size={14} /></span>
                  <span>Temp</span>
                </button>
                <button
                  className="ribbon-button small"
                  title="Load Cases"
                  onClick={onShowLoadCaseDialog}
                >
                  <span className="ribbon-icon"><Layers size={14} /></span>
                  <span>Load Cases</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Edit */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Edit</div>
              <div className="ribbon-group-content grid-3x2">
                <button className="ribbon-button small" onClick={() => selectTool('select')} title="Move (M)">
                  <span className="ribbon-icon"><Move size={14} /></span>
                  <span>Move</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'rotate' ? 'active' : ''}`}
                  onClick={() => selectTool('rotate')}
                  title="Rotate (R)"
                >
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>Rotate</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'UNDO' })}
                  disabled={undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                >
                  <span className="ribbon-icon"><Undo2 size={14} /></span>
                  <span>Undo</span>
                </button>
                <button className="ribbon-button small" title="Copy (Ctrl+C)">
                  <span className="ribbon-icon"><Copy size={14} /></span>
                  <span>Copy</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'REDO' })}
                  disabled={redoStack.length === 0}
                  title="Redo (Ctrl+Y)"
                >
                  <span className="ribbon-icon"><Redo2 size={14} /></span>
                  <span>Redo</span>
                </button>
              </div>
            </div>

            {/* Finish button - shown when editing plate/void */}
            {plateEditMode && (
              <>
                <div className="ribbon-separator" />
                <div className="ribbon-group highlight">
                  <div className="ribbon-group-title">
                    {plateEditMode.mode === 'void' ? 'Void Edit' : 'Plate Edit'}
                  </div>
                  <div className="ribbon-group-content">
                    <button
                      className="ribbon-button small accent"
                      onClick={() => dispatch({ type: 'TRIGGER_FINISH_EDIT' })}
                      title="Finish editing (Tab/Enter)"
                    >
                      <span className="ribbon-icon"><CheckCircle size={14} /></span>
                      <span>Finish</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="ribbon-separator" />

            {/* AI */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">AI</div>
              <div className="ribbon-group-content">
                <button
                  className={`ribbon-button small ${showAgentPanel ? 'active' : ''}`}
                  onClick={onToggleAgent}
                  title="AI Agent"
                >
                  <span className="ribbon-icon"><Bot size={14} /></span>
                  <span>Agent</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Calculate */}
            <div className="ribbon-group highlight">
              <div className="ribbon-group-title">Calculate</div>
              <div className="ribbon-group-content">
                <button className="ribbon-button primary" onClick={() => handleSolve(false)} disabled={solving} title="Run Analysis (F5)">
                  <span className="ribbon-icon"><Play size={18} /></span>
                  <span>{solving ? 'Solving...' : 'Solve'}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            {/* Project */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Project</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowProjectInfoDialog}
                  title="Project Settings"
                >
                  <span className="ribbon-icon"><Info size={14} /></span>
                  <span>Project Settings</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowMaterialsDialog}
                  title="Manage Materials"
                >
                  <span className="ribbon-icon"><Layers size={14} /></span>
                  <span>Materials</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Standards */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Standards</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowStandardsDialog}
                  title="Standards & National Annex"
                >
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>Standards</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Calculation */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Calculation</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowCalculationSettings}
                  title="Calculation Settings"
                >
                  <span className="ribbon-icon"><Settings size={14} /></span>
                  <span>Calculation Settings</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Appearance */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">Appearance</div>
              <div className="ribbon-group-content">
                <button
                  className="theme-toggle-btn"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>
            </div>

          </>
        )}

        {activeTab === 'code-check' && codeCheckBeamId !== null && (() => {
          const beam = mesh.getBeamElement(codeCheckBeamId);
          if (!beam || !result || !result.beamForces.has(codeCheckBeamId)) {
            return (
              <div className="ribbon-group">
                <div className="ribbon-group-title">Code-Check</div>
                <div className="ribbon-group-content">
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, padding: '0 8px' }}>
                    No results available. Run analysis first.
                  </span>
                  <button className="ribbon-button small" onClick={() => dispatch({ type: 'SET_CODE_CHECK_BEAM', payload: null })}>
                    <span>Close</span>
                  </button>
                </div>
              </div>
            );
          }

          const forces = result.beamForces.get(codeCheckBeamId)!;
          const grade = STEEL_GRADES[2]; // S355
          const section = beam.section;
          const check = checkSteelSection(
            { A: section.A, I: section.I, h: section.h, profileName: beam.profileName },
            forces,
            grade
          );
          const nodes = mesh.getBeamElementNodes(beam);
          const L = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;
          const fmtN = (v: number) => `${(v / 1000).toFixed(1)} kN`;
          const fmtM = (v: number) => `${(v / 1000).toFixed(1)} kNm`;
          const ucColor = (uc: number) => uc <= 1.0 ? 'var(--success)' : 'var(--danger)';
          const ucBar = (uc: number, label: string) => (
            <div className="code-check-row">
              <span className="code-check-label">{label}</span>
              <div className="code-check-bar-track">
                <div className="code-check-bar-fill" style={{ width: `${Math.min(uc * 100, 100)}%`, background: ucColor(uc) }} />
              </div>
              <span className="code-check-uc" style={{ color: ucColor(uc) }}>{uc.toFixed(3)}</span>
            </div>
          );

          return (
            <>
              {/* Beam Info */}
              <div className="ribbon-group">
                <div className="ribbon-group-title">Beam {codeCheckBeamId}</div>
                <div className="ribbon-group-content code-check-info">
                  <span>{beam.profileName || 'Unknown'} | L = {(L * 1000).toFixed(0)} mm | {grade.name} (fy = {grade.fy} MPa)</span>
                </div>
              </div>

              <div className="ribbon-separator" />

              {/* Design Forces */}
              <div className="ribbon-group">
                <div className="ribbon-group-title">Ed (Design Forces)</div>
                <div className="ribbon-group-content code-check-forces">
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">N<sub>Ed</sub></span>
                    <span className="code-check-force-value">{fmtN(check.NEd)}</span>
                  </div>
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">V<sub>Ed</sub></span>
                    <span className="code-check-force-value">{fmtN(check.VEd)}</span>
                  </div>
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">M<sub>Ed</sub></span>
                    <span className="code-check-force-value">{fmtM(check.MEd)}</span>
                  </div>
                </div>
              </div>

              <div className="ribbon-separator" />

              {/* Design Resistances */}
              <div className="ribbon-group">
                <div className="ribbon-group-title">Rd (Resistance)</div>
                <div className="ribbon-group-content code-check-forces">
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">N<sub>c,Rd</sub></span>
                    <span className="code-check-force-value">{fmtN(check.NcRd)}</span>
                  </div>
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">V<sub>c,Rd</sub></span>
                    <span className="code-check-force-value">{fmtN(check.VcRd)}</span>
                  </div>
                  <div className="code-check-force-item">
                    <span className="code-check-force-label">M<sub>c,Rd</sub></span>
                    <span className="code-check-force-value">{fmtM(check.McRd)}</span>
                  </div>
                </div>
              </div>

              <div className="ribbon-separator" />

              {/* Unity Checks */}
              <div className="ribbon-group" style={{ minWidth: 220 }}>
                <div className="ribbon-group-title">Unity Checks (EN 1993-1-1)</div>
                <div className="ribbon-group-content code-check-ucs">
                  {ucBar(check.UC_N, 'N (6.2.4)')}
                  {ucBar(check.UC_V, 'V (6.2.6)')}
                  {ucBar(check.UC_M, 'M (6.2.5)')}
                  {ucBar(check.UC_MN, 'M+N (6.2.8)')}
                  {ucBar(check.UC_MV, 'M+V (6.2.10)')}
                </div>
              </div>

              <div className="ribbon-separator" />

              {/* Result */}
              <div className="ribbon-group">
                <div className="ribbon-group-title">Result</div>
                <div className="ribbon-group-content code-check-result">
                  <div className={`code-check-status ${check.status === 'OK' ? 'pass' : 'fail'}`}>
                    UC = {check.UC_max.toFixed(3)}
                    <br />
                    <strong>{check.status === 'OK' ? 'PASS' : 'FAIL'}</strong>
                    <br />
                    <small>{check.governingCheck}</small>
                  </div>
                  <button className="ribbon-button small" onClick={() => dispatch({ type: 'SET_CODE_CHECK_BEAM', payload: null })} title="Close Code-Check">
                    <span>Close</span>
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {activeTab === 'steel' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">EN 1993 - Steel</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowSteelCheck}
                  title="Steel section check (EN 1993-1-1)"
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><CheckCircle size={14} /></span>
                  <span>Steel Check</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Info</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  EN 1993-1-1 cross-section checks.<br />
                  Run analysis first, then check beams.
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'concrete' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">EN 1992 - Concrete</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowConcreteCheck}
                  title="Concrete section design (EN 1992-1-1)"
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><CheckCircle size={14} /></span>
                  <span>Concrete Check</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Info</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  EN 1992-1-1 section design.<br />
                  Run analysis first, then check sections.
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'timber' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">EN 1995 - Timber</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  Timber checks according to EN 1995-1-1.<br />
                  Coming soon.
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'other-materials' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">Other Materials</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  Aluminium (EN 1999), Masonry (EN 1996),<br />
                  and other material checks. Coming soon.
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === '3d' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">View</div>
              <div className="ribbon-group-content">
                <button className="ribbon-button icon-only" title="Zoom to Fit">
                  <Maximize2 size={18} />
                </button>
                <button className="ribbon-button icon-only" title="Reset View">
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Display</div>
              <div className="ribbon-group-content">
                <button className="ribbon-button icon-only" title="Wireframe">
                  <Grid3X3 size={18} />
                </button>
                <button className="ribbon-button icon-only" title="Shaded">
                  <Box size={18} />
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Info</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  <b>Rotate:</b> Left-click drag<br />
                  <b>Pan:</b> Right-click drag<br />
                  <b>Zoom:</b> Scroll wheel
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'report' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">Report Sections</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowReportSettings}
                  title="Configure report sections and styling"
                >
                  <span className="ribbon-icon"><Settings size={14} /></span>
                  <span>Report Settings</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Export</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onExportReportHTML}
                  title="Download report as HTML file"
                >
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>HTML</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onExportReportPDF}
                  title="Download report as PDF file"
                >
                  <span className="ribbon-icon"><FileDown size={14} /></span>
                  <span>PDF</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onPrintReport}
                  title="Print report"
                >
                  <span className="ribbon-icon"><Printer size={14} /></span>
                  <span>Print</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">Info</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  Live preview shows your report.<br />
                  Configure sections using Settings.
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
