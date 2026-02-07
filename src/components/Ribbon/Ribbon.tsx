import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { Tool } from '../../core/fem/types';
import { STEEL_GRADES } from '../../core/standards/EurocodeNL';
import { checkSteelSection } from '../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../core/fem/Beam';
import {
  MousePointer2, CircleDot,
  Triangle, ArrowLeftFromLine, Circle, ArrowDownUp, RotateCcw, ArrowLeftRight, Square,
  ArrowDown, Move, Thermometer,
  CheckCircle,
  FileText, Copy, FileDown, Printer,
  Undo2, Redo2, Layers,
  Settings, Info, Save, FolderOpen, Grid3X3, Bot,
  Sun, Moon, Maximize2, Box, BarChart3, Zap,
  Search, AlertTriangle, Terminal, Table2, Network, Link2, Filter, X,
  Ruler, Type, PenLine, Eye, Pencil
} from 'lucide-react';
import { serializeProject } from '../../core/io/ProjectSerializer';
import { deserializeProject } from '../../core/io/ProjectSerializer';
import { Mesh } from '../../core/fem/Mesh';
import { useI18n } from '../../i18n/i18n';
import type { Locale } from '../../i18n/i18n';
import './Ribbon.css';

type RibbonTab = 'home' | 'settings' | 'code-check' | '3d' | 'report' | 'table' | 'insights' | 'steel' | 'concrete' | 'timber' | 'other-materials' | 'versions' | 'extensions' | 'drawing';

interface RibbonProps {
  onShowLoadCaseDialog?: () => void;
  onShowProjectInfoDialog?: () => void;
  onShowStandardsDialog?: () => void;
  onShowGridsDialog?: () => void;
  onShowSteelCheck?: () => void;
  onShowSteelConnection?: () => void;
  onShowConcreteCheck?: () => void;
  onShowConcreteDesign?: () => void;
  onShowReinforcementDialog?: () => void;
  onShowMaterialsDialog?: () => void;
  onShowCalculationSettings?: () => void;
  onShowCombinationDialog?: () => void;
  onShowLoadGenerator?: () => void;
  onToggleAgent?: () => void;
  showAgentPanel?: boolean;
  onToggleConsole?: () => void;
  showConsolePanel?: boolean;
  onToggleGraphSplit?: () => void;
  showGraphSplit?: boolean;
  onShowReportSettings?: () => void;
  onExportReportHTML?: () => void;
  onExportReportPDF?: () => void;
  onPrintReport?: () => void;
  activeRibbonTab?: RibbonTab;
  onRibbonTabChange?: (tab: RibbonTab) => void;
}

export function Ribbon({ onShowLoadCaseDialog, onShowProjectInfoDialog, onShowStandardsDialog, onShowGridsDialog, onShowSteelCheck, onShowSteelConnection, onShowConcreteCheck, onShowConcreteDesign, onShowReinforcementDialog, onShowMaterialsDialog, onShowCalculationSettings, onShowCombinationDialog, onShowLoadGenerator, onToggleAgent, showAgentPanel, onToggleConsole, showConsolePanel, onToggleGraphSplit, showGraphSplit, onShowReportSettings, onExportReportHTML, onExportReportPDF, onPrintReport, activeRibbonTab, onRibbonTabChange }: RibbonProps) {
  const { state, dispatch } = useFEM();
  const { t, locale, setLocale } = useI18n();
  const { selectedTool, mesh, undoStack, redoStack, loadCases,
    result, codeCheckBeamId, plateEditMode, selection } = state;
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [localActiveTab, setLocalActiveTab] = useState<RibbonTab>('home');
  const activeTab = activeRibbonTab ?? localActiveTab;
  const setActiveTab = (tab: RibbonTab) => {
    setLocalActiveTab(tab);
    onRibbonTabChange?.(tab);
  };
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
    } else if (tab === 'drawing') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'drawing' });
    } else if (tab === 'report') {
      // Report tab has its own view, don't change viewMode
    } else if (state.viewMode === '3d' || state.viewMode === 'drawing') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });
    } else if (state.viewMode === 'results' && tab !== 'code-check') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' });
    }
  };

  // When code-check beam ID changes externally, switch to code-check tab
  if (codeCheckBeamId !== null && activeTab !== 'code-check') {
    setActiveTab('code-check');
  }

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
      state.structuralGrid,
      state.graphState,
      state.versioning
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
    if (confirm(t('confirm.newProject'))) {
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
          {t('ribbon.home')}
        </button>
        <button className={`ribbon-tab ${activeTab === '3d' ? 'active' : ''}`} onClick={() => handleTabClick('3d')}>
          {t('ribbon.3d')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'table' ? 'active' : ''}`} onClick={() => handleTabClick('table')}>
          {t('ribbon.table')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabClick('settings')}>
          {t('ribbon.settings')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'steel' ? 'active' : ''}`} onClick={() => handleTabClick('steel')}>
          {t('ribbon.steel')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'concrete' ? 'active' : ''}`} onClick={() => handleTabClick('concrete')}>
          {t('ribbon.concrete')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'timber' ? 'active' : ''}`} onClick={() => handleTabClick('timber')}>
          {t('ribbon.timber')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'other-materials' ? 'active' : ''}`} onClick={() => handleTabClick('other-materials')}>
          {t('ribbon.otherMaterials')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'report' ? 'active' : ''}`} onClick={() => handleTabClick('report')}>
          {t('ribbon.report')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'drawing' ? 'active' : ''}`} onClick={() => handleTabClick('drawing')}>
          {t('ribbon.drawing')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'insights' ? 'active' : ''}`} onClick={() => handleTabClick('insights')}>
          {t('ribbon.insights')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => handleTabClick('versions')}>
          {t('ribbon.versions')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'extensions' ? 'active' : ''}`} onClick={() => handleTabClick('extensions')}>
          {t('ribbon.extensions')}
        </button>
        {codeCheckBeamId && (
          <button className={`ribbon-tab ${activeTab === 'code-check' ? 'active' : ''}`} onClick={() => handleTabClick('code-check')}>
            {t('ribbon.codeCheck')}
          </button>
        )}
      </div>

      {/* Ribbon Content */}
      <div className="ribbon-content">
        {activeTab === 'home' && (
          <>
            {/* File */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.file')}</div>
              <div className="ribbon-group-content grid-2x2">
                <button className="ribbon-button small" onClick={handleNewProject} title={t('ribbon.newProject.title')}>
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>{t('ribbon.new')}</span>
                </button>
                <button className="ribbon-button small" onClick={handleSaveProject} title={t('ribbon.saveProject.title')}>
                  <span className="ribbon-icon"><Save size={14} /></span>
                  <span>{t('ribbon.saveAs')}</span>
                </button>
                <button className="ribbon-button small" onClick={handleOpenProject} title={t('ribbon.openProject.title')}>
                  <span className="ribbon-icon"><FolderOpen size={14} /></span>
                  <span>{t('ribbon.open')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Draw */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.draw')}</div>
              <div className="ribbon-group-content wrap">
                <button
                  className={`ribbon-button small ${selectedTool === 'select' ? 'active' : ''}`}
                  onClick={() => selectTool('select')}
                  title={t('ribbon.select.title')}
                >
                  <span className="ribbon-icon"><MousePointer2 size={14} /></span>
                  <span>{t('ribbon.select')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addBeam' ? 'active' : ''}`}
                  onClick={() => selectTool('addBeam')}
                  title={t('ribbon.bar.title')}
                >
                  <span className="ribbon-icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="3" cy="7" r="2.5" />
                      <line x1="5.5" y1="7" x2="8.5" y2="7" />
                      <circle cx="11" cy="7" r="2.5" />
                    </svg>
                  </span>
                  <span>{t('ribbon.bar')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addNode' ? 'active' : ''}`}
                  onClick={() => selectTool('addNode')}
                  title={t('ribbon.node.title')}
                >
                  <span className="ribbon-icon"><CircleDot size={14} /></span>
                  <span>{t('ribbon.node')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addPlate' ? 'active' : ''}`}
                  onClick={() => selectTool('addPlate')}
                  title={t('ribbon.plate.title')}
                >
                  <span className="ribbon-icon"><Square size={14} /></span>
                  <span>{t('ribbon.plate')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowGridsDialog}
                  title={t('ribbon.grids.title')}
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>{t('ribbon.grids')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Boundary Conditions */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.boundaryConditions')}</div>
              <div className="ribbon-group-content wrap">
                <button
                  className={`ribbon-button small ${selectedTool === 'addPinned' ? 'active' : ''}`}
                  onClick={() => selectTool('addPinned')}
                  title={t('ribbon.pinned.title')}
                >
                  <span className="ribbon-icon"><Triangle size={14} /></span>
                  <span>{t('ribbon.pinned')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addXRoller')}
                  title={t('ribbon.xRoller.title')}
                >
                  <span className="ribbon-icon"><ArrowLeftFromLine size={14} /></span>
                  <span>{t('ribbon.xRoller')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addZRoller')}
                  title={t('ribbon.zRoller.title')}
                >
                  <span className="ribbon-icon"><Circle size={14} /></span>
                  <span>{t('ribbon.zRoller')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addZSpring')}
                  title={t('ribbon.zSpring.title')}
                >
                  <span className="ribbon-icon"><ArrowDownUp size={14} /></span>
                  <span>{t('ribbon.zSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addRotSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addRotSpring')}
                  title={t('ribbon.rotSpring.title')}
                >
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>{t('ribbon.rotSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addXSpring')}
                  title={t('ribbon.xSpring.title')}
                >
                  <span className="ribbon-icon"><ArrowLeftRight size={14} /></span>
                  <span>{t('ribbon.xSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addFixed' ? 'active' : ''}`}
                  onClick={() => selectTool('addFixed')}
                  title={t('ribbon.fixed.title')}
                >
                  <span className="ribbon-icon"><Square size={14} /></span>
                  <span>{t('ribbon.fixed')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Loads */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.loads')}</div>
              <div className="ribbon-group-content grid-3x2">
                <button
                  className={`ribbon-button small ${selectedTool === 'addLineLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addLineLoad')}
                  title={t('ribbon.lineLoad.title')}
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
                  <span>{t('ribbon.lineLoad')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addLoad')}
                  title={t('ribbon.pointLoad.title')}
                >
                  <span className="ribbon-icon"><ArrowDown size={14} /></span>
                  <span>{t('ribbon.pointLoad')}</span>
                </button>
                <button className="ribbon-button small" title={t('ribbon.moment.title')}>
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>{t('ribbon.moment')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addThermalLoad' ? 'active' : ''}`}
                  onClick={() => selectTool('addThermalLoad')}
                  title={t('ribbon.temp.title')}
                >
                  <span className="ribbon-icon"><Thermometer size={14} /></span>
                  <span>{t('ribbon.temp')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('ribbon.loadCases.title')}
                  onClick={onShowLoadCaseDialog}
                >
                  <span className="ribbon-icon"><Layers size={14} /></span>
                  <span>{t('ribbon.loadCases')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('ribbon.combos.title')}
                  onClick={onShowCombinationDialog}
                >
                  <span className="ribbon-icon"><Copy size={14} /></span>
                  <span>{t('ribbon.combos')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Load Generator */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.generator')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button large"
                  title={t('ribbon.loadGen.title')}
                  onClick={onShowLoadGenerator}
                >
                  <span className="ribbon-icon"><Zap size={20} /></span>
                  <span>{t('ribbon.loadGen')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Edit */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.edit')}</div>
              <div className="ribbon-group-content grid-3x2">
                <button className="ribbon-button small" onClick={() => selectTool('select')} title={t('ribbon.move.title')}>
                  <span className="ribbon-icon"><Move size={14} /></span>
                  <span>{t('ribbon.move')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'rotate' ? 'active' : ''}`}
                  onClick={() => selectTool('rotate')}
                  title={t('ribbon.rotate.title')}
                >
                  <span className="ribbon-icon"><RotateCcw size={14} /></span>
                  <span>{t('ribbon.rotate')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'UNDO' })}
                  disabled={undoStack.length === 0}
                  title={t('ribbon.undo.title')}
                >
                  <span className="ribbon-icon"><Undo2 size={14} /></span>
                  <span>{t('ribbon.undo')}</span>
                </button>
                <button className="ribbon-button small" title={t('ribbon.copy.title')}>
                  <span className="ribbon-icon"><Copy size={14} /></span>
                  <span>{t('ribbon.copy')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'REDO' })}
                  disabled={redoStack.length === 0}
                  title={t('ribbon.redo.title')}
                >
                  <span className="ribbon-icon"><Redo2 size={14} /></span>
                  <span>{t('ribbon.redo')}</span>
                </button>
              </div>
            </div>

            {/* Finish button - shown when editing plate/void */}
            {plateEditMode && (
              <>
                <div className="ribbon-separator" />
                <div className="ribbon-group highlight">
                  <div className="ribbon-group-title">
                    {plateEditMode.mode === 'void' ? t('ribbon.voidEdit') : t('ribbon.plateEdit')}
                  </div>
                  <div className="ribbon-group-content">
                    <button
                      className="ribbon-button small accent"
                      onClick={() => dispatch({ type: 'TRIGGER_FINISH_EDIT' })}
                      title={t('ribbon.finish.title')}
                    >
                      <span className="ribbon-icon"><CheckCircle size={14} /></span>
                      <span>{t('ribbon.finish')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="ribbon-separator" />

            {/* Selection Filter */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.filter')}</div>
              <div className="ribbon-group-content" style={{ position: 'relative' }}>
                <button
                  className={`ribbon-button small ${(selection.nodeIds.size + selection.elementIds.size + selection.plateIds.size + (selection.vertexIds?.size || 0) + selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size) > 0 ? 'has-selection' : ''}`}
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  title={t('ribbon.filterSelection.title')}
                >
                  <span className="ribbon-icon"><Filter size={16} /></span>
                  <span className="ribbon-label">{t('ribbon.filterSelection.label')}</span>
                </button>
                {showFilterDropdown && (
                  <div className="filter-dropdown" onMouseLeave={() => setShowFilterDropdown(false)}>
                    <div className="filter-dropdown-header">{t('ribbon.filterSelection.removeFrom')}</div>
                    {selection.nodeIds.size > 0 && (
                      <button
                        className="filter-dropdown-item"
                        onClick={() => {
                          dispatch({ type: 'SET_SELECTION', payload: { ...selection, nodeIds: new Set() } });
                        }}
                      >
                        <CircleDot size={14} />
                        <span>{selection.nodeIds.size} {selection.nodeIds.size === 1 ? 'node' : 'nodes'}</span>
                        <X size={12} className="remove-icon" />
                      </button>
                    )}
                    {selection.elementIds.size > 0 && (
                      <button
                        className="filter-dropdown-item"
                        onClick={() => {
                          dispatch({ type: 'SET_SELECTION', payload: { ...selection, elementIds: new Set() } });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <line x1="2" y1="7" x2="12" y2="7" />
                        </svg>
                        <span>{selection.elementIds.size} {selection.elementIds.size === 1 ? 'beam' : 'beams'}</span>
                        <X size={12} className="remove-icon" />
                      </button>
                    )}
                    {selection.plateIds.size > 0 && (
                      <button
                        className="filter-dropdown-item"
                        onClick={() => {
                          dispatch({ type: 'SET_SELECTION', payload: { ...selection, plateIds: new Set() } });
                        }}
                      >
                        <Square size={14} />
                        <span>{selection.plateIds.size} {selection.plateIds.size === 1 ? 'plate' : 'plates'}</span>
                        <X size={12} className="remove-icon" />
                      </button>
                    )}
                    {(selection.vertexIds?.size || 0) > 0 && (
                      <button
                        className="filter-dropdown-item"
                        onClick={() => {
                          dispatch({ type: 'SET_SELECTION', payload: { ...selection, vertexIds: new Set() } });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="4" y="4" width="6" height="6" />
                        </svg>
                        <span>{selection.vertexIds?.size || 0} {(selection.vertexIds?.size || 0) === 1 ? 'vertex' : 'vertices'}</span>
                        <X size={12} className="remove-icon" />
                      </button>
                    )}
                    {(selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size) > 0 && (
                      <button
                        className="filter-dropdown-item"
                        onClick={() => {
                          dispatch({ type: 'SET_SELECTION', payload: { ...selection, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), selectedDistLoadIds: new Set() } });
                        }}
                      >
                        <ArrowDown size={14} />
                        <span>{selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size} {(selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size) === 1 ? 'load' : 'loads'}</span>
                        <X size={12} className="remove-icon" />
                      </button>
                    )}
                    {(selection.nodeIds.size + selection.elementIds.size + selection.plateIds.size + (selection.vertexIds?.size || 0) + selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size) === 0 && (
                      <div className="filter-dropdown-empty">{t('ribbon.filterSelection.noSelection')}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* View */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.view')}</div>
              <div className="ribbon-group-content">
                <button
                  className={`ribbon-button small ${showGraphSplit ? 'active' : ''}`}
                  onClick={onToggleGraphSplit}
                  title={t('ribbon.graph.title')}
                >
                  <span className="ribbon-icon"><BarChart3 size={14} /></span>
                  <span>{t('ribbon.graph')}</span>
                </button>
                <button
                  className={`ribbon-button small ${showAgentPanel ? 'active' : ''}`}
                  onClick={onToggleAgent}
                  title={t('ribbon.agent.title')}
                >
                  <span className="ribbon-icon"><Bot size={14} /></span>
                  <span>{t('ribbon.agent')}</span>
                </button>
                <button
                  className={`ribbon-button small ${showConsolePanel ? 'active' : ''}`}
                  onClick={onToggleConsole}
                  title={t('ribbon.console.title')}
                >
                  <span className="ribbon-icon"><Terminal size={14} /></span>
                  <span>{t('ribbon.console')}</span>
                </button>
              </div>
            </div>

          </>
        )}

        {activeTab === 'settings' && (
          <>
            {/* Project */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.project')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowProjectInfoDialog}
                  title={t('ribbon.projectSettings.title')}
                >
                  <span className="ribbon-icon"><Info size={14} /></span>
                  <span>{t('ribbon.projectSettings')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowMaterialsDialog}
                  title={t('ribbon.materials.title')}
                >
                  <span className="ribbon-icon"><Layers size={14} /></span>
                  <span>{t('ribbon.materials')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Standards */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.standards')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowStandardsDialog}
                  title={t('ribbon.standards.title')}
                >
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>{t('ribbon.standards')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Calculation */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.calculation')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowCalculationSettings}
                  title={t('ribbon.calculationSettings.title')}
                >
                  <span className="ribbon-icon"><Settings size={14} /></span>
                  <span>{t('ribbon.calculationSettings')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Appearance */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.appearance')}</div>
              <div className="ribbon-group-content">
                <button
                  className="theme-toggle-btn"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? t('ribbon.lightMode') : t('ribbon.darkMode')}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{theme === 'dark' ? t('ribbon.lightMode') : t('ribbon.darkMode')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Language */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.language')}</div>
              <div className="ribbon-group-content" style={{ flexWrap: 'wrap', maxWidth: 200 }}>
                {([
                  ['en', '\u{1F1EC}\u{1F1E7}', 'English'],
                  ['nl', '\u{1F1F3}\u{1F1F1}', 'Nederlands'],
                  ['fr', '\u{1F1EB}\u{1F1F7}', 'Fran\u00e7ais'],
                  ['es', '\u{1F1EA}\u{1F1F8}', 'Espa\u00f1ol'],
                  ['zh', '\u{1F1E8}\u{1F1F3}', '\u4E2D\u6587'],
                  ['it', '\u{1F1EE}\u{1F1F9}', 'Italiano'],
                ] as const).map(([code, flag, label]) => (
                  <button
                    key={code}
                    className={`ribbon-button small ${locale === code ? 'active' : ''}`}
                    onClick={() => setLocale(code as Locale)}
                    title={label}
                    style={{ minWidth: 52, fontSize: 12 }}
                  >
                    <span>{flag} {code.toUpperCase()}</span>
                  </button>
                ))}
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
          const nodes = mesh.getBeamElementNodes(beam);
          const beamLength = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;
          const check = checkSteelSection(
            { A: section.A, I: section.I, h: section.h, profileName: beam.profileName },
            forces,
            grade,
            beamLength,
            0,
            250,
            false,
            state.steelCheckInterval
          );
          const L = beamLength;
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
                <div className="ribbon-group-title">Unity Checks (NEN-EN 1993-1-1)</div>
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
              <div className="ribbon-group-title">{t('ribbon.steelEN')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowSteelCheck}
                  title={t('ribbon.steelCheck.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><CheckCircle size={14} /></span>
                  <span>{t('ribbon.steelCheck')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowSteelConnection}
                  title={t('ribbon.steelConnection.title')}
                >
                  <span className="ribbon-icon"><Link2 size={14} /></span>
                  <span>{t('ribbon.steelConnection')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.steelInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'concrete' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.concreteEN')}</div>
              <div className="ribbon-group-content grid-2x2">
                <button
                  className="ribbon-button small"
                  onClick={onShowConcreteCheck}
                  title={t('ribbon.concreteCheck.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><CheckCircle size={14} /></span>
                  <span>{t('ribbon.concreteCheck')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowConcreteDesign}
                  title={t('ribbon.concreteDesign.title')}
                >
                  <span className="ribbon-icon"><Settings size={14} /></span>
                  <span>{t('ribbon.concreteDesign')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onShowReinforcementDialog}
                  title={t('ribbon.reinforcement.title')}
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>{t('ribbon.reinforcement')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.beamView')}</div>
              <div className="ribbon-group-content">
                <button
                  className={`ribbon-button small ${state.showConcreteBeamView ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_SHOW_CONCRETE_BEAM_VIEW', payload: !state.showConcreteBeamView })}
                  title={t('ribbon.beamView.title')}
                >
                  <span className="ribbon-icon"><BarChart3 size={14} /></span>
                  <span>{t('ribbon.beamView')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.concreteGrade')}</div>
              <div className="ribbon-group-content">
                <select
                  className="ribbon-select"
                  style={{ minWidth: 100 }}
                  title={t('ribbon.concreteGrade.title')}
                  defaultValue="C30/37"
                >
                  <option value="C20/25">C20/25</option>
                  <option value="C25/30">C25/30</option>
                  <option value="C30/37">C30/37</option>
                  <option value="C35/45">C35/45</option>
                  <option value="C40/50">C40/50</option>
                  <option value="C45/55">C45/55</option>
                  <option value="C50/60">C50/60</option>
                </select>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.concreteInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'timber' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.timberEN')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.timberInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'other-materials' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.otherMaterials')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.otherMaterialsInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === '3d' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.view')}</div>
              <div className="ribbon-group-content">
                <button className="ribbon-button icon-only" title={t('ribbon.zoomToFit')}>
                  <Maximize2 size={18} />
                </button>
                <button className="ribbon-button icon-only" title={t('ribbon.resetView')}>
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.display')}</div>
              <div className="ribbon-group-content">
                <button className="ribbon-button icon-only" title={t('ribbon.wireframe')}>
                  <Grid3X3 size={18} />
                </button>
                <button className="ribbon-button icon-only" title={t('ribbon.shaded')}>
                  <Box size={18} />
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.3dInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'report' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.reportSections')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onShowReportSettings}
                  title={t('ribbon.reportSettings.title')}
                >
                  <span className="ribbon-icon"><Settings size={14} /></span>
                  <span>{t('ribbon.reportSettings')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.export')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  onClick={onExportReportHTML}
                  title={t('ribbon.html.title')}
                >
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>{t('ribbon.html')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onExportReportPDF}
                  title={t('ribbon.pdf.title')}
                >
                  <span className="ribbon-icon"><FileDown size={14} /></span>
                  <span>{t('ribbon.pdf')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={onPrintReport}
                  title={t('ribbon.print.title')}
                >
                  <span className="ribbon-icon"><Printer size={14} /></span>
                  <span>{t('ribbon.print')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.reportInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'insights' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.matrices')}</div>
              <div className="ribbon-group-content grid-2x2">
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'element-matrix' })}
                  title={t('ribbon.elementK.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><Table2 size={14} /></span>
                  <span>{t('ribbon.elementK')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'system-matrix' })}
                  title={t('ribbon.systemK.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><Network size={14} /></span>
                  <span>{t('ribbon.systemK')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.solver')}</div>
              <div className="ribbon-group-content grid-2x2">
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'solver-info' })}
                  title={t('ribbon.solverInfo.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><Search size={14} /></span>
                  <span>{t('ribbon.solverInfo')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'dof-mapping' })}
                  title={t('ribbon.dofMap.title')}
                  disabled={!state.result}
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>{t('ribbon.dofMap')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.diagnostics')}</div>
              <div className="ribbon-group-content grid-2x2">
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'logs' })}
                  title={t('ribbon.logs.title')}
                >
                  <span className="ribbon-icon"><Terminal size={14} /></span>
                  <span>{t('ribbon.logs')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  onClick={() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'errors' })}
                  title={t('ribbon.errors.title')}
                >
                  <span className="ribbon-icon"><AlertTriangle size={14} /></span>
                  <span>{t('ribbon.errors')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('ribbon.insightsInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'versions' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('versions.title')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6 }}>
                  {t('versions.title')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'extensions' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('extensions.title')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('extensions.info')}
                </span>
              </div>
            </div>

            <div className="ribbon-separator" />

            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('extensions.graphSync')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('extensions.graphSyncInfo')}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'drawing' && (
          <>
            {/* View - Toggle element visibility */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('drawing.view')}</div>
              <div className="ribbon-group-content grid-3x2">
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleSteel.title')}
                >
                  <span className="ribbon-icon"><Eye size={14} /></span>
                  <span>{t('drawing.steel')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleConcrete.title')}
                >
                  <span className="ribbon-icon"><Eye size={14} /></span>
                  <span>{t('drawing.concrete')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleTimber.title')}
                >
                  <span className="ribbon-icon"><Eye size={14} /></span>
                  <span>{t('drawing.timber')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleGridLines.title')}
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>{t('drawing.gridLines')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleDimensions.title')}
                >
                  <span className="ribbon-icon"><Ruler size={14} /></span>
                  <span>{t('drawing.dimensions')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.toggleCenterlines.title')}
                >
                  <span className="ribbon-icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2">
                      <line x1="1" y1="7" x2="13" y2="7" />
                    </svg>
                  </span>
                  <span>{t('drawing.centerlines')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Dimensions */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('drawing.dimensionsGroup')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  title={t('drawing.addDimension.title')}
                >
                  <span className="ribbon-icon"><Ruler size={14} /></span>
                  <span>{t('drawing.addDimension')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.addGridDimension.title')}
                >
                  <span className="ribbon-icon"><Grid3X3 size={14} /></span>
                  <span>{t('drawing.gridDimension')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Annotation */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('drawing.annotation')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  title={t('drawing.addText.title')}
                >
                  <span className="ribbon-icon"><Type size={14} /></span>
                  <span>{t('drawing.addText')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.addLeader.title')}
                >
                  <span className="ribbon-icon"><PenLine size={14} /></span>
                  <span>{t('drawing.addLeader')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.profileAnnotation.title')}
                >
                  <span className="ribbon-icon"><Pencil size={14} /></span>
                  <span>{t('drawing.profileAnnotation')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Export */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('drawing.export')}</div>
              <div className="ribbon-group-content">
                <button
                  className="ribbon-button small"
                  title={t('drawing.exportDXF.title')}
                >
                  <span className="ribbon-icon"><FileDown size={14} /></span>
                  <span>{t('drawing.dxf')}</span>
                </button>
                <button
                  className="ribbon-button small"
                  title={t('drawing.exportPDF.title')}
                >
                  <span className="ribbon-icon"><FileText size={14} /></span>
                  <span>{t('drawing.pdf')}</span>
                </button>
              </div>
            </div>

            <div className="ribbon-separator" />

            {/* Info */}
            <div className="ribbon-group">
              <div className="ribbon-group-title">{t('ribbon.info')}</div>
              <div className="ribbon-group-content">
                <span style={{ color: 'var(--text-muted)', fontSize: 10, padding: '0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {t('drawing.info')}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
