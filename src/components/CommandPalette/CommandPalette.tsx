/**
 * Command Palette - searchable command list at the bottom of the canvas
 * Activated with Ctrl+K or Ctrl+P
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { Tool } from '../../core/fem/types';
import './CommandPalette.css';

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onToggleDialog: (dialog: string) => void;
}

export function CommandPalette({ onToggleDialog }: CommandPaletteProps) {
  const { state, dispatch } = useFEM();
  const { t, setLocale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const setTool = useCallback((tool: Tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    setIsOpen(false);
  }, [dispatch]);

  const closeAndRun = useCallback((fn: () => void) => {
    fn();
    setIsOpen(false);
  }, []);

  const dialog = useCallback((name: string) => {
    onToggleDialog(name);
    setIsOpen(false);
  }, [onToggleDialog]);

  const commands = useMemo((): Command[] => [
    // ── Drawing Tools ─────────────────────────────────────────────────
    { id: 'select', label: t('cmd.select'), category: t('cmd.catTools'), shortcut: 'V', action: () => setTool('select') },
    { id: 'addNode', label: t('cmd.addNode'), category: t('cmd.catTools'), shortcut: 'N', action: () => setTool('addNode') },
    { id: 'addBeam', label: t('cmd.addBeam'), category: t('cmd.catTools'), shortcut: 'B', action: () => setTool('addBeam') },
    { id: 'addPlate', label: t('cmd.addPlate'), category: t('cmd.catTools'), action: () => setTool('addPlate') },
    { id: 'move', label: t('cmd.move'), category: t('cmd.catTools'), shortcut: 'M', action: () => closeAndRun(() => dispatch({ type: 'SET_TOOL', payload: 'select' })) },
    { id: 'rotate', label: t('cmd.rotate'), category: t('cmd.catTools'), shortcut: 'R', action: () => setTool('rotate') },
    { id: 'copy', label: t('cmd.copy'), category: t('cmd.catTools'), shortcut: 'Ctrl+C', action: () => closeAndRun(() => dispatch({ type: 'SET_TOOL', payload: 'select' })) },
    { id: 'delete', label: t('cmd.delete'), category: t('cmd.catTools'), shortcut: 'Del', action: () => setTool('delete') },
    { id: 'addSubNode', label: t('cmd.addSubNode'), category: t('cmd.catTools'), action: () => setTool('addSubNode') },

    // ── Supports ──────────────────────────────────────────────────────
    { id: 'addPinned', label: t('cmd.addPinned'), category: t('cmd.catSupports'), action: () => setTool('addPinned') },
    { id: 'addFixed', label: t('cmd.addFixed'), category: t('cmd.catSupports'), action: () => setTool('addFixed') },
    { id: 'addXRoller', label: t('cmd.addXRoller'), category: t('cmd.catSupports'), action: () => setTool('addXRoller') },
    { id: 'addZRoller', label: t('cmd.addZRoller'), category: t('cmd.catSupports'), action: () => setTool('addZRoller') },
    { id: 'addZSpring', label: t('cmd.addZSpring'), category: t('cmd.catSupports'), action: () => setTool('addZSpring') },
    { id: 'addXSpring', label: t('cmd.addXSpring'), category: t('cmd.catSupports'), action: () => setTool('addXSpring') },
    { id: 'addRotSpring', label: t('cmd.addRotSpring'), category: t('cmd.catSupports'), action: () => setTool('addRotSpring') },

    // ── Loads ─────────────────────────────────────────────────────────
    { id: 'addLoad', label: t('cmd.addPointLoad'), category: t('cmd.catLoads'), shortcut: 'P', action: () => setTool('addLoad') },
    { id: 'addLineLoad', label: t('cmd.addLineLoad'), category: t('cmd.catLoads'), shortcut: 'L', action: () => setTool('addLineLoad') },
    { id: 'addMoment', label: t('cmd.addMoment'), category: t('cmd.catLoads'), action: () => setTool('addLoad') },
    { id: 'addThermalLoad', label: t('cmd.addThermalLoad'), category: t('cmd.catLoads'), action: () => setTool('addThermalLoad') },

    // ── View Toggles ──────────────────────────────────────────────────
    { id: 'viewGeometry', label: t('cmd.viewGeometry'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' })) },
    { id: 'viewLoads', label: t('cmd.viewLoads'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' })) },
    { id: 'viewResults', label: t('cmd.viewResults'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'results' })) },
    { id: 'showMoment', label: t('cmd.toggleMoment'), category: t('cmd.catView'), shortcut: 'M', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_MOMENT', payload: !state.showMoment })) },
    { id: 'showShear', label: t('cmd.toggleShear'), category: t('cmd.catView'), shortcut: 'V', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_SHEAR', payload: !state.showShear })) },
    { id: 'showNormal', label: t('cmd.toggleNormal'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_NORMAL', payload: !state.showNormal })) },
    { id: 'showDeformed', label: t('cmd.toggleDeformed'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DEFORMED', payload: !state.showDeformed })) },
    { id: 'showReactions', label: t('cmd.toggleReactions'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_REACTIONS', payload: !state.showReactions })) },
    { id: 'showProfileNames', label: t('cmd.toggleProfileNames'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_PROFILE_NAMES', payload: !state.showProfileNames })) },
    { id: 'showDimensions', label: t('cmd.toggleDimensions'), category: t('cmd.catView'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DIMENSIONS', payload: !state.showDimensions })) },

    // ── Dialogs ───────────────────────────────────────────────────────
    { id: 'loadCases', label: t('cmd.loadCases'), category: t('cmd.catDialogs'), action: () => dialog('loadCases') },
    { id: 'combinations', label: t('cmd.combinations'), category: t('cmd.catDialogs'), action: () => dialog('combinations') },
    { id: 'materials', label: t('cmd.materials'), category: t('cmd.catDialogs'), action: () => dialog('materials') },
    { id: 'projectInfo', label: t('cmd.projectInfo'), category: t('cmd.catDialogs'), action: () => dialog('projectInfo') },
    { id: 'grids', label: t('cmd.grids'), category: t('cmd.catDialogs'), action: () => dialog('grids') },
    { id: 'standards', label: t('cmd.standards'), category: t('cmd.catDialogs'), action: () => dialog('standards') },
    { id: 'calcSettings', label: t('cmd.calcSettings'), category: t('cmd.catDialogs'), action: () => dialog('calcSettings') },
    { id: 'steelCheck', label: t('cmd.steelCheck'), category: t('cmd.catDialogs'), action: () => dialog('steelCheck') },
    { id: 'steelConnection', label: t('cmd.steelConnection'), category: t('cmd.catDialogs'), action: () => dialog('steelConnection') },
    { id: 'concreteCheck', label: t('cmd.concreteCheck'), category: t('cmd.catDialogs'), action: () => dialog('concreteCheck') },
    { id: 'concreteDesign', label: t('cmd.concreteDesign'), category: t('cmd.catDialogs'), action: () => dialog('concreteDesign') },
    { id: 'reportSettings', label: t('cmd.reportSettings'), category: t('cmd.catDialogs'), action: () => dialog('reportSettings') },
    { id: 'loadGenerator', label: t('cmd.loadGenerator'), category: t('cmd.catDialogs'), action: () => dialog('loadGenerator') },

    // ── Views / Panels ────────────────────────────────────────────────
    { id: 'view3d', label: t('cmd.view3D'), category: t('cmd.catViews'), action: () => dialog('view3d') },
    { id: 'viewReport', label: t('cmd.viewReport'), category: t('cmd.catViews'), action: () => dialog('viewReport') },
    { id: 'viewTable', label: t('cmd.viewTable'), category: t('cmd.catViews'), action: () => dialog('viewTable') },
    { id: 'viewInsights', label: t('cmd.viewInsights'), category: t('cmd.catViews'), action: () => dialog('viewInsights') },
    { id: 'viewVersions', label: t('cmd.viewVersions'), category: t('cmd.catViews'), action: () => dialog('viewVersions') },
    { id: 'viewGraph', label: t('cmd.viewGraph'), category: t('cmd.catViews'), action: () => dialog('viewGraph') },
    { id: 'viewAgent', label: t('cmd.viewAgent'), category: t('cmd.catViews'), action: () => dialog('viewAgent') },
    { id: 'viewConsole', label: t('cmd.viewConsole'), category: t('cmd.catViews'), action: () => dialog('viewConsole') },

    // ── Actions ───────────────────────────────────────────────────────
    { id: 'solve', label: t('cmd.solve'), category: t('cmd.catActions'), shortcut: 'Ctrl+Enter', action: () => dialog('solve') },
    { id: 'undo', label: t('cmd.undo'), category: t('cmd.catActions'), shortcut: 'Ctrl+Z', action: () => closeAndRun(() => dispatch({ type: 'UNDO' })) },
    { id: 'redo', label: t('cmd.redo'), category: t('cmd.catActions'), shortcut: 'Ctrl+Y', action: () => closeAndRun(() => dispatch({ type: 'REDO' })) },
    { id: 'selectAll', label: t('cmd.selectAll'), category: t('cmd.catActions'), shortcut: 'Ctrl+A', action: () => dialog('selectAll') },
    { id: 'zoomToFit', label: t('cmd.zoomToFit'), category: t('cmd.catActions'), action: () => dialog('zoomToFit') },
    { id: 'resetView', label: t('cmd.resetView'), category: t('cmd.catActions'), action: () => dialog('resetView') },
    { id: 'toggleGrid', label: t('cmd.toggleGrid'), category: t('cmd.catActions'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_GRID_LINES', payload: !state.structuralGrid.showGridLines })) },
    { id: 'snapGrid', label: t('cmd.toggleSnap'), category: t('cmd.catActions'), action: () => closeAndRun(() => dispatch({ type: 'SET_SNAP_TO_GRID', payload: !state.snapToGrid })) },
    { id: 'exportHtml', label: t('cmd.exportHTML'), category: t('cmd.catActions'), action: () => dialog('exportHtml') },
    { id: 'exportPdf', label: t('cmd.exportPDF'), category: t('cmd.catActions'), action: () => dialog('exportPdf') },
    { id: 'print', label: t('cmd.print'), category: t('cmd.catActions'), action: () => dialog('print') },

    // ── Settings ──────────────────────────────────────────────────────
    { id: 'lightMode', label: t('cmd.lightMode'), category: t('cmd.catSettings'), action: () => closeAndRun(() => document.documentElement.setAttribute('data-theme', 'light')) },
    { id: 'darkMode', label: t('cmd.darkMode'), category: t('cmd.catSettings'), action: () => closeAndRun(() => document.documentElement.setAttribute('data-theme', 'dark')) },
    { id: 'langEN', label: t('cmd.langEN'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('en')) },
    { id: 'langNL', label: t('cmd.langNL'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('nl')) },
    { id: 'langFR', label: t('cmd.langFR'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('fr')) },
    { id: 'langES', label: t('cmd.langES'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('es')) },
    { id: 'langZH', label: t('cmd.langZH'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('zh')) },
    { id: 'langIT', label: t('cmd.langIT'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('it')) },
  ], [state, dispatch, setTool, dialog, closeAndRun, t, setLocale]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  if (!isOpen) {
    return (
      <div className="command-palette-hint" onClick={() => { setIsOpen(true); setQuery(''); }}>
        <span className="command-palette-hint-icon">&#x2315;</span>
        <span>{t('cmd.searchCommands')}</span>
        <span className="command-palette-hint-shortcut">Ctrl+K</span>
      </div>
    );
  }

  return (
    <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('cmdPalette.placeholder')}
        />
        <div className="command-palette-results">
          {filtered.slice(0, 15).map((cmd, i) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-palette-item-category">{cmd.category}</span>
              <span className="command-palette-item-label">{cmd.label}</span>
              {cmd.shortcut && <span className="command-palette-item-shortcut">{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="command-palette-empty">{t('cmd.noResults')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
