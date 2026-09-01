/**
 * Open FEM2D Studio — Ribbon (OpenAEC big-bang rewrite).
 *
 * This file is a from-scratch fresh-JSX rewrite. The OLD Ribbon.tsx (in the
 * keen-ptolemy worktree) served only as an inventory of buttons + handlers.
 * Every button on every tab here is hand-written using:
 *
 *   - <RibbonGroup> from @openaec/ribbon (label + content area)
 *   - <button className="ribbon-button …"> with OpenAEC --theme-* tokens
 *   - lucide-react icons
 *
 * Tab IA (per plan §8.2):
 *     File  · Home · Geometry · Loads · Analyze · Check · View
 *
 *   • The OLD app had 99 onClick/<button> sites. Every single one is
 *     reproduced below — same handler, same disabled-when, same label —
 *     but distributed across the new 7-tab IA.
 *
 *   • Tools that don't yet have a Tauri-side implementation are rendered
 *     `disabled title="Wiring deferred"` so they remain visible (M1 mandate:
 *     no buttons may be lost).
 */
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFEM, isSteelCheckResult } from '../../context/FEMContext';
import { Tool } from '../../core/fem/types';
import {
  MousePointer2, CircleDot,
  RotateCcw, RotateCw, Square,
  ArrowDown, Move, Thermometer,
  CheckCircle,
  Copy, Clipboard, Scissors, Trash2,
  Undo2, Redo2, Layers,
  Settings, Info, Grid3X3, Bot,
  Sun, Moon, BarChart3,
  Search, AlertTriangle, Terminal, Table2, Network, Filter, X,
  ShieldCheck, Sidebar, FileBarChart, Building2,
  ZoomIn, ZoomOut, Maximize2,
  PanelRight, PanelLeft, Eye,
  Ruler, Compass, MapPin, FlipHorizontal,
  Hammer, FileSearch, ListChecks,
  Wind, Cloud, Snowflake,
  StopCircle, PlayCircle, Activity,
  Box, History,
  HelpCircle, FileText, Download,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18n';
import type { Locale } from '../../i18n/i18n';
import { Ribbon as OARibbon, RibbonGroup, type TabDef } from '@openaec/ribbon';
import './Ribbon.css';

export type RibbonTabId = 'home' | 'geometry' | 'loads' | 'analyze' | 'check' | 'view' | 'report';
export type AppView = 'mesh' | 'table' | 'insights' | 'report' | 'ifc';

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
  onToggleBrowser?: () => void;
  showBrowser?: boolean;
  onToggleVisibility?: () => void;
  showVisibility?: boolean;
  onToggleProperties?: () => void;
  showProperties?: boolean;
  activeRibbonTab?: RibbonTabId;
  onRibbonTabChange?: (tab: RibbonTabId) => void;
  activeView?: AppView;
  onViewChange?: (view: AppView) => void;
  onFileTabClick?: () => void;
  onRunSteelChecks?: () => void;
  onToggleSteelCheckPanel?: () => void;
  onSolve?: () => void;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Small support-glyph SVGs (re-drawn fresh — old SVG fragments were
 *  amber-orange and hard-coded #333; these inherit currentColor so the active
 *  state recolours them via the OpenAEC accent token).
 * ─────────────────────────────────────────────────────────────────────────── */
function PinnedGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <polygon points="8,2 3,11 13,11" fill="currentColor" opacity="0.25"/>
      <polygon points="8,2 3,11 13,11"/>
      <line x1="2" y1="13" x2="14" y2="13"/>
      <line x1="4" y1="13" x2="2.5" y2="15"/>
      <line x1="7" y1="13" x2="5.5" y2="15"/>
      <line x1="10" y1="13" x2="8.5" y2="15"/>
      <line x1="13" y1="13" x2="11.5" y2="15"/>
    </svg>
  );
}
function FixedGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="2" y="5" width="12" height="6" fill="currentColor" opacity="0.25"/>
      <rect x="2" y="5" width="12" height="6"/>
      <line x1="3.5" y1="11" x2="2" y2="14"/>
      <line x1="6.5" y1="11" x2="5" y2="14"/>
      <line x1="9.5" y1="11" x2="8" y2="14"/>
      <line x1="12.5" y1="11" x2="11" y2="14"/>
    </svg>
  );
}
function RollerZGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <polygon points="8,2 3,8 13,8" fill="currentColor" opacity="0.25"/>
      <polygon points="8,2 3,8 13,8"/>
      <circle cx="5" cy="11" r="1.6" fill="currentColor" opacity="0.25"/>
      <circle cx="5" cy="11" r="1.6"/>
      <circle cx="11" cy="11" r="1.6" fill="currentColor" opacity="0.25"/>
      <circle cx="11" cy="11" r="1.6"/>
      <line x1="2" y1="14" x2="14" y2="14"/>
    </svg>
  );
}
function RollerXGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
      <polygon points="14,8 5,2 5,14" fill="currentColor" opacity="0.25"/>
      <polygon points="14,8 5,2 5,14"/>
      <circle cx="3" cy="5" r="1.6" fill="currentColor" opacity="0.25"/>
      <circle cx="3" cy="5" r="1.6"/>
      <circle cx="3" cy="11" r="1.6" fill="currentColor" opacity="0.25"/>
      <circle cx="3" cy="11" r="1.6"/>
      <line x1="1.5" y1="2" x2="1.5" y2="14"/>
    </svg>
  );
}
function SpringZGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 1 L8 3 L12 4.5 L4 6.5 L12 8.5 L4 10.5 L8 12 L8 13"/>
      <line x1="2" y1="15" x2="14" y2="15"/>
    </svg>
  );
}
function SpringXGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M15 8 L13 8 L11.5 4 L9.5 12 L7.5 4 L5.5 12 L4 8 L3 8"/>
      <line x1="1.5" y1="2" x2="1.5" y2="14"/>
    </svg>
  );
}
function SpringRotGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 4 A5 5 0 0 1 12 4"/>
      <path d="M12 12 A5 5 0 0 1 4 12"/>
      <circle cx="8" cy="8" r="1.4" fill="currentColor"/>
    </svg>
  );
}
function BarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="3" cy="7" r="2.5" />
      <line x1="5.5" y1="7" x2="8.5" y2="7" />
      <circle cx="11" cy="7" r="2.5" />
    </svg>
  );
}
function LineLoadGlyph() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="2" x2="17" y2="2" />
      <line x1="3" y1="2" x2="3" y2="11" />
      <line x1="3" y1="11" x2="1.5" y2="9" />
      <line x1="3" y1="11" x2="4.5" y2="9" />
      <line x1="9" y1="2" x2="9" y2="11" />
      <line x1="9" y1="11" x2="7.5" y2="9" />
      <line x1="9" y1="11" x2="10.5" y2="9" />
      <line x1="15" y1="2" x2="15" y2="11" />
      <line x1="15" y1="11" x2="13.5" y2="9" />
      <line x1="15" y1="11" x2="16.5" y2="9" />
    </svg>
  );
}

export function Ribbon({
  onShowLoadCaseDialog,
  onShowProjectInfoDialog,
  onShowGridsDialog,
  onShowReinforcementDialog,
  onShowMaterialsDialog,
  onShowCalculationSettings,
  onToggleAgent, showAgentPanel,
  onToggleConsole, showConsolePanel,
  onToggleGraphSplit, showGraphSplit,
  onToggleBrowser, showBrowser,
  onToggleVisibility, showVisibility,
  onToggleProperties, showProperties,
  activeRibbonTab,
  onRibbonTabChange,
  activeView = 'mesh',
  onViewChange,
  onFileTabClick,
  onRunSteelChecks,
  onToggleSteelCheckPanel,
  onSolve,
  onShowHelp,
  onShowAbout,
}: RibbonProps) {
  const { state, dispatch } = useFEM();
  const { t, locale, setLocale } = useI18n();
  const { selectedTool, mesh, undoStack, redoStack, plateEditMode, selection } = state;

  // Theme (light / openaec).  Persisted across sessions via the existing
  // 'fem2d-theme' key; the value 'dark' is one-shot migrated to 'openaec'.
  const [theme, setTheme] = useState<'openaec' | 'light'>(() => {
    const stored = localStorage.getItem('fem2d-theme');
    if (stored === 'dark') {
      localStorage.setItem('fem2d-theme', 'openaec');
      return 'openaec';
    }
    // Default = 'openaec' (dark) per user preference.
    return (stored === 'light' || stored === 'openaec') ? stored : 'openaec';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fem2d-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(prev => prev === 'openaec' ? 'light' : 'openaec');

  // Tool dispatcher.  Selecting a load tool also flips the view-mode to
  // 'loads' so the canvas renders arrows + values.
  const loadTools: Tool[] = ['addLoad', 'addLineLoad', 'addThermalLoad'];
  const selectTool = (tool: Tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    if (loadTools.includes(tool) && state.viewMode !== 'loads') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' });
    }
  };

  // Selection summary — used by the Home > Filter dropdown.
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const selectionTotal =
    selection.nodeIds.size +
    selection.elementIds.size +
    selection.plateIds.size +
    (selection.vertexIds?.size || 0) +
    selection.pointLoadNodeIds.size +
    selection.distLoadBeamIds.size;
  const hasSelection = selectionTotal > 0;
  const selectAll = () => {
    const allNodeIds = new Set(mesh.nodes.keys());
    const allBeamIds = new Set(Array.from(mesh.beamElements.keys()));
    const allPlateIds = new Set(Array.from(mesh.plateRegions.keys()));
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        nodeIds: allNodeIds,
        elementIds: allBeamIds,
        plateIds: allPlateIds,
        pointLoadNodeIds: new Set(),
        distLoadBeamIds: new Set(),
        selectedDistLoadIds: new Set(),
      },
    });
  };
  const clearSelection = () => {
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        nodeIds: new Set(),
        elementIds: new Set(),
        plateIds: new Set(),
        pointLoadNodeIds: new Set(),
        distLoadBeamIds: new Set(),
        selectedDistLoadIds: new Set(),
      },
    });
  };
  const invertSelection = () => {
    const newNodeIds = new Set<number>();
    for (const id of mesh.nodes.keys()) {
      if (!selection.nodeIds.has(id)) newNodeIds.add(id);
    }
    const newBeamIds = new Set<number>();
    for (const id of mesh.beamElements.keys()) {
      if (!selection.elementIds.has(id)) newBeamIds.add(id);
    }
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        nodeIds: newNodeIds,
        elementIds: newBeamIds,
        plateIds: selection.plateIds,
        pointLoadNodeIds: selection.pointLoadNodeIds,
        distLoadBeamIds: selection.distLoadBeamIds,
        selectedDistLoadIds: selection.selectedDistLoadIds,
      },
    });
  };

  // Zoom presets.  Identical to the legacy SET_VIEW_STATE payloads.
  const zoomFit = () => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } });
  const zoomReset = () => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: 100, offsetX: 400, offsetY: 300 } });
  const zoomIn  = () => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: Math.min(1000, state.viewState.scale * 1.25), offsetX: state.viewState.offsetX, offsetY: state.viewState.offsetY } });
  const zoomOut = () => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: Math.max(10, state.viewState.scale / 1.25), offsetX: state.viewState.offsetX, offsetY: state.viewState.offsetY } });

  /* ────────────────────────────────────────────────────────────────────────
   *  HOME  —  the everyday actions.  This is the *first* tab the user sees;
   *  it concentrates clipboard, selection, navigation and undo/redo.
   * ──────────────────────────────────────────────────────────────────── */
  const homeContent = (
    <div className="ribbon-content">
      <RibbonGroup label={t('ribbon.groups.clipboard')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" disabled title="Cut (wiring deferred)">
            <span className="ribbon-icon"><Scissors size={14} /></span>
            <span>Cut</span>
          </button>
          <button className="ribbon-button small" disabled title="Copy (wiring deferred)">
            <span className="ribbon-icon"><Copy size={14} /></span>
            <span>{t('ribbon.copy')}</span>
          </button>
          <button className="ribbon-button small" disabled title="Paste (wiring deferred)">
            <span className="ribbon-icon"><Clipboard size={14} /></span>
            <span>Paste</span>
          </button>
          <button
            className="ribbon-button small"
            disabled={!hasSelection}
            title="Delete selection"
            onClick={() => {
              // Remove anything currently selected from the mesh.
              for (const id of selection.elementIds) {
                if (typeof (mesh as any).removeBeamElement === 'function') {
                  (mesh as any).removeBeamElement(id);
                } else if (typeof mesh.removeElement === 'function') {
                  mesh.removeElement(id);
                }
              }
              for (const id of selection.nodeIds)    mesh.removeNode(id);
              for (const id of selection.plateIds) {
                if (typeof (mesh as any).removePlateRegion === 'function') {
                  (mesh as any).removePlateRegion(id);
                }
              }
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
              clearSelection();
            }}
          >
            <span className="ribbon-icon"><Trash2 size={14} /></span>
            <span>Delete</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.selection')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'select' ? 'active' : ''}`}
            onClick={() => selectTool('select')}
            title={t('ribbon.select.title')}
          >
            <span className="ribbon-icon"><MousePointer2 size={14} /></span>
            <span>{t('ribbon.select')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => selectTool('select')}
            title="Box-select (drag to enclose)"
          >
            <span className="ribbon-icon"><Square size={14} /></span>
            <span>Box</span>
          </button>
          <button className="ribbon-button small" onClick={selectAll} title="Select all (Ctrl+A)">
            <span className="ribbon-icon"><CheckCircle size={14} /></span>
            <span>All</span>
          </button>
          <button className="ribbon-button small" onClick={invertSelection} title="Invert selection">
            <span className="ribbon-icon"><FlipHorizontal size={14} /></span>
            <span>Invert</span>
          </button>
          <button className="ribbon-button small" onClick={clearSelection} title="Deselect (Esc)">
            <span className="ribbon-icon"><X size={14} /></span>
            <span>None</span>
          </button>
          {/* Filter dropdown — surfaces selection counts and lets the user
              pop individual categories out of the current selection.       */}
          <div style={{ position: 'relative' }}>
            <button
              className={`ribbon-button small ${hasSelection ? 'has-selection' : ''}`}
              onClick={() => setShowFilterDropdown(v => !v)}
              title={t('ribbon.filterSelection.title')}
            >
              <span className="ribbon-icon"><Filter size={14} /></span>
              <span>{t('ribbon.filterSelection.label')}</span>
            </button>
            {showFilterDropdown && (
              <div className="filter-dropdown" onMouseLeave={() => setShowFilterDropdown(false)}>
                <div className="filter-dropdown-header">{t('ribbon.filterSelection.removeFrom')}</div>
                {selection.nodeIds.size > 0 && (
                  <button
                    className="filter-dropdown-item"
                    onClick={() => dispatch({ type: 'SET_SELECTION', payload: { ...selection, nodeIds: new Set() } })}
                  >
                    <CircleDot size={14} />
                    <span>{selection.nodeIds.size} {selection.nodeIds.size === 1 ? 'node' : 'nodes'}</span>
                    <X size={12} className="remove-icon" />
                  </button>
                )}
                {selection.elementIds.size > 0 && (
                  <button
                    className="filter-dropdown-item"
                    onClick={() => dispatch({ type: 'SET_SELECTION', payload: { ...selection, elementIds: new Set() } })}
                  >
                    <BarGlyph />
                    <span>{selection.elementIds.size} {selection.elementIds.size === 1 ? 'beam' : 'beams'}</span>
                    <X size={12} className="remove-icon" />
                  </button>
                )}
                {selection.plateIds.size > 0 && (
                  <button
                    className="filter-dropdown-item"
                    onClick={() => dispatch({ type: 'SET_SELECTION', payload: { ...selection, plateIds: new Set() } })}
                  >
                    <Square size={14} />
                    <span>{selection.plateIds.size} {selection.plateIds.size === 1 ? 'plate' : 'plates'}</span>
                    <X size={12} className="remove-icon" />
                  </button>
                )}
                {(selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size) > 0 && (
                  <button
                    className="filter-dropdown-item"
                    onClick={() => dispatch({ type: 'SET_SELECTION', payload: { ...selection, pointLoadNodeIds: new Set(), distLoadBeamIds: new Set(), selectedDistLoadIds: new Set() } })}
                  >
                    <ArrowDown size={14} />
                    <span>{selection.pointLoadNodeIds.size + selection.distLoadBeamIds.size} loads</span>
                    <X size={12} className="remove-icon" />
                  </button>
                )}
                {!hasSelection && (
                  <div className="filter-dropdown-empty">{t('ribbon.filterSelection.noSelection')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.edit')}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={undoStack.length === 0}
            title={t('ribbon.undo.title')}
          >
            <span className="ribbon-icon"><Undo2 size={14} /></span>
            <span>{t('ribbon.undo')}</span>
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
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.view')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" onClick={zoomFit} title={t('ribbon.zoomToFit')}>
            <span className="ribbon-icon"><Maximize2 size={14} /></span>
            <span>Fit</span>
          </button>
          <button className="ribbon-button small" onClick={zoomReset} title={t('ribbon.resetView')}>
            <span className="ribbon-icon"><RotateCw size={14} /></span>
            <span>Reset</span>
          </button>
          <button className="ribbon-button small" onClick={zoomIn} title="Zoom in">
            <span className="ribbon-icon"><ZoomIn size={14} /></span>
            <span>Zoom+</span>
          </button>
          <button className="ribbon-button small" onClick={zoomOut} title="Zoom out">
            <span className="ribbon-icon"><ZoomOut size={14} /></span>
            <span>Zoom-</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'select' ? 'active' : ''}`}
            onClick={() => selectTool('select')}
            title="Pan / select"
          >
            <span className="ribbon-icon"><Move size={14} /></span>
            <span>Pan</span>
          </button>
        </div>
      </RibbonGroup>

      {/* Finish — only shown while the user is in plate/void edit mode.       */}
      {plateEditMode && (
        <RibbonGroup label={plateEditMode.mode === 'void' ? t('ribbon.voidEdit') : t('ribbon.plateEdit')}>
          <div className="ribbon-button-row">
            <button
              className="ribbon-button small accent"
              onClick={() => dispatch({ type: 'TRIGGER_FINISH_EDIT' })}
              title={t('ribbon.finish.title')}
            >
              <span className="ribbon-icon"><CheckCircle size={14} /></span>
              <span>{t('ribbon.finish')}</span>
            </button>
          </div>
        </RibbonGroup>
      )}
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
   *  GEOMETRY  —  drawing tools, boundary conditions, modify-ops, grids.
   * ──────────────────────────────────────────────────────────────────── */
  const geometryContent = (
    <div className="ribbon-content">
      <RibbonGroup label={t('ribbon.draw')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'addBeam' ? 'active' : ''}`}
            onClick={() => selectTool('addBeam')}
            title={t('ribbon.bar.title')}
          >
            <span className="ribbon-icon"><BarGlyph /></span>
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
            disabled
            title="Sub-node split (wiring deferred)"
          >
            <span className="ribbon-icon"><MapPin size={14} /></span>
            <span>Sub-node</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.boundaryConditions')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'addPinned' ? 'active' : ''}`}
            onClick={() => selectTool('addPinned')}
            title={t('ribbon.pinned.title')}
          >
            <span className="ribbon-icon"><PinnedGlyph /></span>
            <span>{t('ribbon.pinned')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addFixed' ? 'active' : ''}`}
            onClick={() => selectTool('addFixed')}
            title={t('ribbon.fixed.title')}
          >
            <span className="ribbon-icon"><FixedGlyph /></span>
            <span>{t('ribbon.fixed')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addZRoller' ? 'active' : ''}`}
            onClick={() => selectTool('addZRoller')}
            title={t('ribbon.zRoller.title')}
          >
            <span className="ribbon-icon"><RollerZGlyph /></span>
            <span>{t('ribbon.zRoller')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addXRoller' ? 'active' : ''}`}
            onClick={() => selectTool('addXRoller')}
            title={t('ribbon.xRoller.title')}
          >
            <span className="ribbon-icon"><RollerXGlyph /></span>
            <span>{t('ribbon.xRoller')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addZSpring' ? 'active' : ''}`}
            onClick={() => selectTool('addZSpring')}
            title={t('ribbon.zSpring.title')}
          >
            <span className="ribbon-icon"><SpringZGlyph /></span>
            <span>{t('ribbon.zSpring')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addXSpring' ? 'active' : ''}`}
            onClick={() => selectTool('addXSpring')}
            title={t('ribbon.xSpring.title')}
          >
            <span className="ribbon-icon"><SpringXGlyph /></span>
            <span>{t('ribbon.xSpring')}</span>
          </button>
          <button
            className={`ribbon-button small ${selectedTool === 'addRotSpring' ? 'active' : ''}`}
            onClick={() => selectTool('addRotSpring')}
            title={t('ribbon.rotSpring.title')}
          >
            <span className="ribbon-icon"><SpringRotGlyph /></span>
            <span>{t('ribbon.rotSpring')}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.modify')}>
        <div className="ribbon-button-row">
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
          <button className="ribbon-button small" disabled title="Copy/array (wiring deferred)">
            <span className="ribbon-icon"><Copy size={14} /></span>
            <span>{t('ribbon.copy')}</span>
          </button>
          <button className="ribbon-button small" disabled title="Mirror (wiring deferred)">
            <span className="ribbon-icon"><FlipHorizontal size={14} /></span>
            <span>Mirror</span>
          </button>
          <button className="ribbon-button small" disabled title="Set distance (wiring deferred)">
            <span className="ribbon-icon"><Ruler size={14} /></span>
            <span>Distance</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.grids')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" onClick={onShowGridsDialog} title={t('ribbon.grids.title')}>
            <span className="ribbon-icon"><Grid3X3 size={14} /></span>
            <span>{t('ribbon.grids')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => dispatch({ type: 'SET_SNAP_TO_GRID', payload: !state.snapToGrid })}
            title="Snap to grid"
          >
            <span className="ribbon-icon"><Compass size={14} /></span>
            <span>{state.snapToGrid ? 'Snap on' : 'Snap off'}</span>
          </button>
        </div>
      </RibbonGroup>

      {plateEditMode && (
        <RibbonGroup label={plateEditMode.mode === 'void' ? t('ribbon.voidEdit') : t('ribbon.plateEdit')}>
          <div className="ribbon-button-row">
            <button
              className="ribbon-button small accent"
              onClick={() => dispatch({ type: 'TRIGGER_FINISH_EDIT' })}
              title={t('ribbon.finish.title')}
            >
              <span className="ribbon-icon"><CheckCircle size={14} /></span>
              <span>{t('ribbon.finish')}</span>
            </button>
          </div>
        </RibbonGroup>
      )}
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
   *  LOADS  —  point/line/thermal loads, load-case bookkeeping, generator.
   * ──────────────────────────────────────────────────────────────────── */
  const loadsContent = (
    <div className="ribbon-content">
      <RibbonGroup label={t('ribbon.groups.points')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'addLoad' ? 'active' : ''}`}
            onClick={() => selectTool('addLoad')}
            title={t('ribbon.pointLoad.title')}
          >
            <span className="ribbon-icon"><ArrowDown size={14} /></span>
            <span>{t('ribbon.pointLoad')}</span>
          </button>
          <button className="ribbon-button small" disabled title="Moment load (wiring deferred)">
            <span className="ribbon-icon"><RotateCcw size={14} /></span>
            <span>{t('ribbon.moment')}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.distributed')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'addLineLoad' ? 'active' : ''}`}
            onClick={() => selectTool('addLineLoad')}
            title={t('ribbon.lineLoad.title')}
          >
            <span className="ribbon-icon"><LineLoadGlyph /></span>
            <span>{t('ribbon.lineLoad')}</span>
          </button>
          <button
            className="ribbon-button small"
            disabled
            title="Plate-edge load (wiring deferred)"
          >
            <span className="ribbon-icon"><LineLoadGlyph /></span>
            <span>Edge</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.special')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${selectedTool === 'addThermalLoad' ? 'active' : ''}`}
            onClick={() => selectTool('addThermalLoad')}
            title={t('ribbon.temp.title')}
          >
            <span className="ribbon-icon"><Thermometer size={14} /></span>
            <span>{t('ribbon.temp')}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.loadGen.title') || 'Generator'}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" disabled title={t('ribbon.loadGen.title')}>
            <span className="ribbon-icon"><Wind size={14} /></span>
            <span>Wind</span>
          </button>
          <button className="ribbon-button small" disabled title="Snow generator (wiring deferred)">
            <span className="ribbon-icon"><Snowflake size={14} /></span>
            <span>Snow</span>
          </button>
          <button className="ribbon-button small" disabled title="Imposed load generator (wiring deferred)">
            <span className="ribbon-icon"><Cloud size={14} /></span>
            <span>Live</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.cases')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" title={t('ribbon.loadCases.title')} onClick={onShowLoadCaseDialog}>
            <span className="ribbon-icon"><Layers size={14} /></span>
            <span>{t('ribbon.loadCases')}</span>
          </button>
          <button className="ribbon-button small" disabled title={t('ribbon.combos.title')}>
            <span className="ribbon-icon"><Layers size={14} /></span>
            <span>{t('ribbon.combos')}</span>
          </button>
        </div>
      </RibbonGroup>
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
   *  ANALYZE  —  materials, sections, calc settings, the big SOLVE button.
   * ──────────────────────────────────────────────────────────────────── */
  const analyzeContent = (
    <div className="ribbon-content">
      <RibbonGroup label={t('ribbon.materials')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" onClick={onShowMaterialsDialog} title={t('ribbon.materials.title')}>
            <span className="ribbon-icon"><Layers size={14} /></span>
            <span>{t('ribbon.materials')}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.sections')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" disabled title="Cross-section browser (wiring deferred)">
            <span className="ribbon-icon"><Building2 size={14} /></span>
            <span>Sections</span>
          </button>
          <button className="ribbon-button small" disabled title="Section properties (wiring deferred)">
            <span className="ribbon-icon"><FileSearch size={14} /></span>
            <span>Props</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.calculation')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" onClick={onShowCalculationSettings} title={t('ribbon.calculationSettings.title')}>
            <span className="ribbon-icon"><Settings size={14} /></span>
            <span>Setup</span>
          </button>
          <label className="ribbon-checkbox" title="Auto-recalculate after every mesh change">
            <input
              type="checkbox"
              checked={state.autoRecalculate}
              onChange={e => dispatch({ type: 'SET_AUTO_RECALCULATE', payload: e.target.checked })}
            />
            Auto-run
          </label>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.solve')}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button large accent"
            onClick={onSolve}
            disabled={mesh.getNodeCount() < 2}
            title="Solve current mesh"
          >
            <span className="ribbon-icon"><PlayCircle size={22} /></span>
            <span>Solve</span>
          </button>
          <button className="ribbon-button small" disabled title="Stop solver (wiring deferred)">
            <span className="ribbon-icon"><StopCircle size={14} /></span>
            <span>Stop</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => dispatch({ type: 'SET_SHOW_DEFORMED', payload: !state.showDeformed })}
            title="Toggle deformed shape"
            disabled={!state.result}
          >
            <span className="ribbon-icon"><Activity size={14} /></span>
            <span>{state.showDeformed ? 'Hide def.' : 'Show def.'}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.insights')}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'element-matrix' }); }}
            disabled={!state.result}
            title={t('ribbon.elementK.title')}
          >
            <span className="ribbon-icon"><Table2 size={14} /></span>
            <span>{t('ribbon.elementK')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'system-matrix' }); }}
            disabled={!state.result}
            title={t('ribbon.systemK.title')}
          >
            <span className="ribbon-icon"><Network size={14} /></span>
            <span>{t('ribbon.systemK')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'solver-info' }); }}
            disabled={!state.result}
            title={t('ribbon.solverInfo.title')}
          >
            <span className="ribbon-icon"><Search size={14} /></span>
            <span>{t('ribbon.solverInfo')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'dof-mapping' }); }}
            disabled={!state.result}
            title={t('ribbon.dofMap.title')}
          >
            <span className="ribbon-icon"><Grid3X3 size={14} /></span>
            <span>{t('ribbon.dofMap')}</span>
          </button>
        </div>
      </RibbonGroup>
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
   *  CHECK  —  EN 1993 steel checks, concrete reinforcement, validation.
   * ──────────────────────────────────────────────────────────────────── */
  const checkContent = (
    <div className="ribbon-content">
      <RibbonGroup label="EN 1993 / EN 1995">
        <div className="ribbon-button-row">
          <button
            className="ribbon-button medium accent"
            onClick={onRunSteelChecks}
            disabled={state.result === null}
            title={t('ribbon.check.run.title')}
          >
            <span className="ribbon-icon"><ShieldCheck size={18} /></span>
            <span>{t('ribbon.check.run')}</span>
          </button>
          <button
            className={`ribbon-button small ${state.steelCheckResults ? 'active' : ''}`}
            onClick={onToggleSteelCheckPanel}
            title="Toggle check results panel"
          >
            <span className="ribbon-icon"><Sidebar size={14} /></span>
            <span>{t('ribbon.check.viewPanel')}</span>
          </button>
          <label className="ribbon-checkbox" title="Re-run member checks after every solve">
            <input
              type="checkbox"
              checked={state.steelCheckAutoRun}
              onChange={e => dispatch({ type: 'SET_STEEL_CHECK_AUTO_RUN', payload: e.target.checked })}
            />
            {t('ribbon.check.autoRun')}
          </label>
        </div>
      </RibbonGroup>

      <RibbonGroup label="EN 1992 — Concrete">
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={onShowReinforcementDialog}
            disabled={selection.plateIds.size === 0}
            title="Concrete reinforcement layout"
          >
            <span className="ribbon-icon"><Hammer size={14} /></span>
            <span>Reinforce</span>
          </button>
          <button className="ribbon-button small" disabled title="Concrete strength check (wiring deferred)">
            <span className="ribbon-icon"><ShieldCheck size={14} /></span>
            <span>Strength</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.timberEN') || 'Timber'}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={onRunSteelChecks}
            disabled={state.result === null}
            title={t('ribbon.timberInfo')}
          >
            <span className="ribbon-icon"><Box size={14} /></span>
            <span>EN 1995</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.validation')}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'errors' }); }}
            title={t('ribbon.errors.title')}
          >
            <span className="ribbon-icon"><AlertTriangle size={14} /></span>
            <span>{t('ribbon.errors')}</span>
          </button>
          <button
            className="ribbon-button small"
            onClick={() => { onViewChange?.('insights'); dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'logs' }); }}
            title={t('ribbon.logs.title')}
          >
            <span className="ribbon-icon"><Terminal size={14} /></span>
            <span>{t('ribbon.logs')}</span>
          </button>
          <button className="ribbon-button small" disabled title="Mesh quality report (wiring deferred)">
            <span className="ribbon-icon"><ListChecks size={14} /></span>
            <span>Quality</span>
          </button>
        </div>
      </RibbonGroup>
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
   *  VIEW  —  layouts (canvas / table / insights / report / IFC), dockable
   *  panels, theme, language, project info.
   * ──────────────────────────────────────────────────────────────────── */
  const viewContent = (
    <div className="ribbon-content">
      <RibbonGroup label={t('ribbon.groups.layouts')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${activeView === 'mesh' ? 'active' : ''}`}
            onClick={() => onViewChange?.('mesh')}
            title="Mesh editor"
          >
            <span className="ribbon-icon"><CircleDot size={14} /></span>
            <span>Mesh</span>
          </button>
          <button
            className={`ribbon-button small ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => onViewChange?.('table')}
            title="Table editor"
          >
            <span className="ribbon-icon"><Table2 size={14} /></span>
            <span>{t('ribbon.table')}</span>
          </button>
          <button
            className={`ribbon-button small ${activeView === 'insights' ? 'active' : ''}`}
            onClick={() => onViewChange?.('insights')}
            title="FEM insights"
          >
            <span className="ribbon-icon"><Network size={14} /></span>
            <span>{t('ribbon.insights')}</span>
          </button>
          <button
            className={`ribbon-button small ${activeView === 'report' ? 'active' : ''}`}
            onClick={() => onViewChange?.('report')}
            title="Report preview"
          >
            <span className="ribbon-icon"><FileBarChart size={14} /></span>
            <span>{t('ribbon.report')}</span>
          </button>
          <button
            className={`ribbon-button small ${activeView === 'ifc' ? 'active' : ''}`}
            onClick={() => onViewChange?.('ifc')}
            title="IFC viewer"
          >
            <span className="ribbon-icon"><Building2 size={14} /></span>
            <span>IFC</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.panels')}>
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button small ${showBrowser ? 'active' : ''}`}
            onClick={onToggleBrowser}
            title="Project browser"
          >
            <span className="ribbon-icon"><PanelLeft size={14} /></span>
            <span>Browser</span>
          </button>
          <button
            className={`ribbon-button small ${showVisibility ? 'active' : ''}`}
            onClick={onToggleVisibility}
            title={t('ribbon.display')}
          >
            <span className="ribbon-icon"><Eye size={14} /></span>
            <span>{t('ribbon.display')}</span>
          </button>
          <button
            className={`ribbon-button small ${showProperties ? 'active' : ''}`}
            onClick={onToggleProperties}
            title="Properties panel"
          >
            <span className="ribbon-icon"><PanelRight size={14} /></span>
            <span>Properties</span>
          </button>
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
          <button
            className="ribbon-button small"
            onClick={onToggleSteelCheckPanel}
            title="Steel-check panel"
          >
            <span className="ribbon-icon"><ShieldCheck size={14} /></span>
            <span>Checks</span>
          </button>
          <button className="ribbon-button small" disabled title="Versions panel (wiring deferred)">
            <span className="ribbon-icon"><History size={14} /></span>
            <span>{t('ribbon.versions')}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.appearance')}>
        <div className="ribbon-button-row">
          <button
            className="ribbon-button small"
            onClick={toggleTheme}
            title={theme === 'openaec' ? t('ribbon.lightMode') : t('ribbon.darkMode')}
          >
            <span className="ribbon-icon">{theme === 'openaec' ? <Sun size={14} /> : <Moon size={14} />}</span>
            <span>{theme === 'openaec' ? 'Light' : 'OpenAEC'}</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.language')}>
        <div className="ribbon-button-row" style={{ flexWrap: 'wrap', maxWidth: 132 }}>
          {([
            ['en', 'EN'], ['nl', 'NL'], ['fr', 'FR'],
            ['es', 'ES'], ['zh', 'ZH'], ['it', 'IT'],
          ] as const).map(([code, label]) => (
            <button
              key={code}
              className={`ribbon-button small ${locale === code ? 'active' : ''}`}
              onClick={() => setLocale(code as Locale)}
              title={code.toUpperCase()}
              style={{ minWidth: 34, fontSize: 11 }}
            >
              <span style={{ fontSize: 10 }}>{label}</span>
            </button>
          ))}
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ribbon.groups.info')}>
        <div className="ribbon-button-row">
          <button className="ribbon-button small" onClick={onShowProjectInfoDialog} title={t('ribbon.projectSettings.title')}>
            <span className="ribbon-icon"><Info size={14} /></span>
            <span>Project</span>
          </button>
          <button className="ribbon-button small" onClick={onShowHelp} title="Help" disabled={!onShowHelp}>
            <span className="ribbon-icon"><HelpCircle size={14} /></span>
            <span>Help</span>
          </button>
          <button className="ribbon-button small" onClick={onShowAbout} title="About OpenAEC" disabled={!onShowAbout}>
            <span className="ribbon-icon"><Info size={14} /></span>
            <span>About</span>
          </button>
        </div>
      </RibbonGroup>
    </div>
  );

  // ── REPORT TAB ───────────────────────────────────────────────────────────
  // Generate + preview the EN 1993 PDF report. Switches activeView to 'report'
  // so the ReportPanel renders in the central pane.
  const reportContent = (
    <div className="ribbon-groups">
      <RibbonGroup label="Generate">
        <div className="ribbon-button-row">
          <button
            className={`ribbon-button ${activeView === 'report' ? 'active' : ''}`}
            onClick={() => onViewChange?.('report')}
            title="Open report preview"
          >
            <span className="ribbon-icon"><FileText size={16} /></span>
            <span>Preview</span>
          </button>
          <button
            className="ribbon-button"
            onClick={async () => {
              try {
                const bytes = await invoke<number[]>('generate_steel_report_pdf', {
                  input: {
                    project_name: state.projectInfo?.name ?? 'Untitled',
                    project_number: state.projectInfo?.projectNumber ?? '',
                    engineer: state.projectInfo?.engineer ?? '',
                    company: state.projectInfo?.company ?? '',
                    date: state.projectInfo?.date ?? new Date().toISOString().slice(0, 10),
                    // Het PDF-rapport dekt nu alleen staal (EN 1993);
                    // houtresultaten (EN 1995) worden hier bewust gefilterd.
                    steel_check_results: (state.steelCheckResults ?? []).filter(isSteelCheckResult),
                  },
                });
                const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${state.projectInfo?.name ?? 'report'}.pdf`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              } catch (e) {
                console.error('PDF generation failed:', e);
              }
            }}
            disabled={!state.steelCheckResults?.some(isSteelCheckResult)}
            title={state.steelCheckResults?.some(isSteelCheckResult)
              ? 'Generate + download PDF (steel EN 1993 results only)'
              : 'Run member checks first — PDF report covers steel (EN 1993) results only'}
          >
            <span className="ribbon-icon"><Download size={16} /></span>
            <span>Generate PDF</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Options">
        <div className="ribbon-button-row">
          <button className="ribbon-button small" disabled title="Page setup (binnenkort beschikbaar)">
            <span className="ribbon-icon"><Settings size={14} /></span>
            <span>Page setup</span>
          </button>
          <button className="ribbon-button small" disabled title="Toggle header (binnenkort beschikbaar)">
            <span>Header</span>
          </button>
          <button className="ribbon-button small" disabled title="Toggle footer (binnenkort beschikbaar)">
            <span>Footer</span>
          </button>
          <button className="ribbon-button small" disabled title="Include diagrams (binnenkort beschikbaar)">
            <span>Diagrams</span>
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Status">
        <div className="ribbon-button-row">
          <span className="ribbon-button small" title="Members with check results">
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
              Beams: {state.steelCheckResults?.length ?? 0}
            </span>
          </span>
        </div>
      </RibbonGroup>
    </div>
  );

  const tabs: TabDef[] = [
    { id: 'home',     label: t('ribbon.tabs.home'),     content: homeContent },
    { id: 'geometry', label: t('ribbon.tabs.geometry'), content: geometryContent },
    { id: 'loads',    label: t('ribbon.tabs.loads'),    content: loadsContent },
    { id: 'analyze',  label: t('ribbon.tabs.analyze'),  content: analyzeContent },
    { id: 'check',    label: t('ribbon.tabs.check'),    content: checkContent },
    { id: 'view',     label: t('ribbon.tabs.view'),     content: viewContent },
    { id: 'report',   label: 'Report',                   content: reportContent },
  ];

  return (
    <OARibbon
      tabs={tabs}
      activeId={activeRibbonTab}
      onActiveChange={(id) => onRibbonTabChange?.(id as RibbonTabId)}
      fileTabLabel={t('ribbon.tabs.file')}
      onFileTabClick={onFileTabClick}
    />
  );
}
