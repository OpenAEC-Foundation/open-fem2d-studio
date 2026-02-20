import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { Tool } from '../../core/fem/types';
import {
  MousePointer2, CircleDot,
  RotateCcw, Square,
  ArrowDown, Move, Thermometer,
  CheckCircle,
  FileText, Copy,
  Undo2, Redo2, Layers,
  Settings, Info, Save, FolderOpen, Grid3X3, Bot,
  Sun, Moon, BarChart3,
  Search, AlertTriangle, Terminal, Table2, Network, Filter, X
} from 'lucide-react';
import { serializeProject } from '../../core/io/ProjectSerializer';
import { deserializeProject } from '../../core/io/ProjectSerializer';
import { Mesh } from '../../core/fem/Mesh';
import { useI18n } from '../../i18n/i18n';
import type { Locale } from '../../i18n/i18n';
import './Ribbon.css';

type RibbonTab = 'home' | 'settings' | 'table' | 'insights' | 'ifc';

interface RibbonProps {
  onShowLoadCaseDialog?: () => void;
  onShowProjectInfoDialog?: () => void;
  onShowGridsDialog?: () => void;
  onShowReinforcementDialog?: () => void;
  onShowMaterialsDialog?: () => void;
  onShowCalculationSettings?: () => void;
  onToggleAgent?: () => void;
  showAgentPanel?: boolean;
  onToggleConsole?: () => void;
  showConsolePanel?: boolean;
  onToggleGraphSplit?: () => void;
  showGraphSplit?: boolean;
  activeRibbonTab?: RibbonTab;
  onRibbonTabChange?: (tab: RibbonTab) => void;
}

export function Ribbon({ onShowLoadCaseDialog, onShowProjectInfoDialog, onShowGridsDialog, onShowMaterialsDialog, onShowCalculationSettings, onToggleAgent, showAgentPanel, onToggleConsole, showConsolePanel, onToggleGraphSplit, showGraphSplit, activeRibbonTab, onRibbonTabChange }: RibbonProps) {
  const { state, dispatch } = useFEM();
  const { t, locale, setLocale } = useI18n();
  const { selectedTool, mesh, undoStack, redoStack, loadCases,
    plateEditMode, selection } = state;
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
      [],
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
            description: 'FEM Project',
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
        <button className={`ribbon-tab ${activeTab === 'table' ? 'active' : ''}`} onClick={() => handleTabClick('table')}>
          {t('ribbon.table')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabClick('settings')}>
          {t('ribbon.settings')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'insights' ? 'active' : ''}`} onClick={() => handleTabClick('insights')}>
          {t('ribbon.insights')}
        </button>
        <button className={`ribbon-tab ${activeTab === 'ifc' ? 'active' : ''}`} onClick={() => handleTabClick('ifc')}>
          IFC
        </button>
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
                  <span className="ribbon-icon">
                    {/* Pinned: triangle with ground line and hatches */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <polygon points="8,1 2,11 14,11" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <line x1="1" y1="13" x2="15" y2="13" stroke="#333" strokeWidth="1.5"/>
                      <line x1="3" y1="13" x2="1" y2="15" stroke="#333" strokeWidth="1"/>
                      <line x1="6" y1="13" x2="4" y2="15" stroke="#333" strokeWidth="1"/>
                      <line x1="9" y1="13" x2="7" y2="15" stroke="#333" strokeWidth="1"/>
                      <line x1="12" y1="13" x2="10" y2="15" stroke="#333" strokeWidth="1"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.pinned')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addXRoller')}
                  title={t('ribbon.xRoller.title')}
                >
                  <span className="ribbon-icon">
                    {/* X-Roller: vertical triangle with circles on left */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <polygon points="14,8 5,2 5,14" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <circle cx="3" cy="5" r="2" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <circle cx="3" cy="11" r="2" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <line x1="1" y1="1" x2="1" y2="15" stroke="#333" strokeWidth="1.5"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.xRoller')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZRoller' ? 'active' : ''}`}
                  onClick={() => selectTool('addZRoller')}
                  title={t('ribbon.zRoller.title')}
                >
                  <span className="ribbon-icon">
                    {/* Z-Roller: triangle with two circles below and ground */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <polygon points="8,1 3,8 13,8" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <circle cx="5" cy="11" r="2" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <circle cx="11" cy="11" r="2" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <line x1="1" y1="14" x2="15" y2="14" stroke="#333" strokeWidth="1.5"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.zRoller')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addZSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addZSpring')}
                  title={t('ribbon.zSpring.title')}
                >
                  <span className="ribbon-icon">
                    {/* Z-Spring: vertical zigzag spring */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8,1 L8,3 L12,4.5 L4,6.5 L12,8.5 L4,10.5 L8,12 L8,13"/>
                      <line x1="2" y1="15" x2="14" y2="15" stroke="#333"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.zSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addRotSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addRotSpring')}
                  title={t('ribbon.rotSpring.title')}
                >
                  <span className="ribbon-icon">
                    {/* Rot-Spring: curved arcs */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4,4 A5,5 0 0,1 12,4"/>
                      <path d="M12,12 A5,5 0 0,1 4,12"/>
                      <circle cx="8" cy="8" r="1.5" fill="#f59e0b"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.rotSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addXSpring' ? 'active' : ''}`}
                  onClick={() => selectTool('addXSpring')}
                  title={t('ribbon.xSpring.title')}
                >
                  <span className="ribbon-icon">
                    {/* X-Spring: horizontal zigzag spring */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15,8 L13,8 L11.5,4 L9.5,12 L7.5,4 L5.5,12 L4,8 L3,8"/>
                      <line x1="1" y1="2" x2="1" y2="14" stroke="#333"/>
                    </svg>
                  </span>
                  <span>{t('ribbon.xSpring')}</span>
                </button>
                <button
                  className={`ribbon-button small ${selectedTool === 'addFixed' ? 'active' : ''}`}
                  onClick={() => selectTool('addFixed')}
                  title={t('ribbon.fixed.title')}
                >
                  <span className="ribbon-icon">
                    {/* Fixed: filled rectangle with hatch pattern */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="4" width="12" height="6" fill="#f59e0b" stroke="#333" strokeWidth="1"/>
                      <line x1="3" y1="10" x2="1" y2="14" stroke="#333" strokeWidth="1"/>
                      <line x1="6" y1="10" x2="4" y2="14" stroke="#333" strokeWidth="1"/>
                      <line x1="9" y1="10" x2="7" y2="14" stroke="#333" strokeWidth="1"/>
                      <line x1="12" y1="10" x2="10" y2="14" stroke="#333" strokeWidth="1"/>
                    </svg>
                  </span>
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


      </div>
    </div>
  );
}
