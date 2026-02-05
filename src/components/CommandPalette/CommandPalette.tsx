/**
 * Command Palette - searchable command list at the bottom of the canvas
 * Activated with Ctrl+K or Ctrl+P
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const setTool = useCallback((tool: Tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    setIsOpen(false);
  }, [dispatch]);

  const commands = useMemo((): Command[] => [
    // Tools
    { id: 'select', label: 'Select', category: 'Tools', shortcut: 'Esc', action: () => setTool('select') },
    { id: 'addNode', label: 'Add Node', category: 'Tools', shortcut: 'N', action: () => setTool('addNode') },
    { id: 'addBeam', label: 'Add Beam', category: 'Tools', shortcut: 'B', action: () => setTool('addBeam') },
    { id: 'delete', label: 'Delete', category: 'Tools', shortcut: 'Del', action: () => setTool('delete') },
    { id: 'addPlate', label: 'Add Plate', category: 'Tools', action: () => setTool('addPlate') },
    { id: 'addSubNode', label: 'Add Sub-Node', category: 'Tools', action: () => setTool('addSubNode') },
    { id: 'rotate', label: 'Rotate', category: 'Tools', shortcut: 'R', action: () => setTool('rotate') },
    // Supports
    { id: 'addPinned', label: 'Add Pinned Support', category: 'Supports', action: () => setTool('addPinned') },
    { id: 'addFixed', label: 'Add Fixed Support', category: 'Supports', action: () => setTool('addFixed') },
    { id: 'addXRoller', label: 'Add X-Roller', category: 'Supports', action: () => setTool('addXRoller') },
    { id: 'addZRoller', label: 'Add Z-Roller', category: 'Supports', action: () => setTool('addZRoller') },
    { id: 'addZSpring', label: 'Add Z-Spring', category: 'Supports', action: () => setTool('addZSpring') },
    { id: 'addXSpring', label: 'Add X-Spring', category: 'Supports', action: () => setTool('addXSpring') },
    { id: 'addRotSpring', label: 'Add Rotational Spring', category: 'Supports', action: () => setTool('addRotSpring') },
    // Loads
    { id: 'addLoad', label: 'Add Point Load', category: 'Loads', action: () => setTool('addLoad') },
    { id: 'addLineLoad', label: 'Add Line Load', category: 'Loads', action: () => setTool('addLineLoad') },
    { id: 'addThermalLoad', label: 'Add Thermal Load', category: 'Loads', action: () => setTool('addThermalLoad') },
    // View
    { id: 'viewGeometry', label: 'View: Geometry', category: 'View', action: () => { dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' }); setIsOpen(false); } },
    { id: 'viewLoads', label: 'View: Loads', category: 'View', action: () => { dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' }); setIsOpen(false); } },
    { id: 'viewResults', label: 'View: Results', category: 'View', action: () => { dispatch({ type: 'SET_VIEW_MODE', payload: 'results' }); setIsOpen(false); } },
    { id: 'showMoment', label: 'Toggle Moment Diagram', category: 'View', shortcut: 'M', action: () => { dispatch({ type: 'SET_SHOW_MOMENT', payload: !state.showMoment }); setIsOpen(false); } },
    { id: 'showShear', label: 'Toggle Shear Diagram', category: 'View', shortcut: 'V', action: () => { dispatch({ type: 'SET_SHOW_SHEAR', payload: !state.showShear }); setIsOpen(false); } },
    { id: 'showNormal', label: 'Toggle Normal Diagram', category: 'View', action: () => { dispatch({ type: 'SET_SHOW_NORMAL', payload: !state.showNormal }); setIsOpen(false); } },
    { id: 'showDeformed', label: 'Toggle Deformed Shape', category: 'View', action: () => { dispatch({ type: 'SET_SHOW_DEFORMED', payload: !state.showDeformed }); setIsOpen(false); } },
    { id: 'showReactions', label: 'Toggle Reactions', category: 'View', action: () => { dispatch({ type: 'SET_SHOW_REACTIONS', payload: !state.showReactions }); setIsOpen(false); } },
    { id: 'showProfileNames', label: 'Toggle Profile Names', category: 'View', action: () => { dispatch({ type: 'SET_SHOW_PROFILE_NAMES', payload: !state.showProfileNames }); setIsOpen(false); } },
    { id: 'showDimensions', label: 'Toggle Dimensions', category: 'View', action: () => { dispatch({ type: 'SET_SHOW_DIMENSIONS', payload: !state.showDimensions }); setIsOpen(false); } },
    // Dialogs
    { id: 'loadCases', label: 'Load Cases & Combinations', category: 'Dialogs', action: () => { onToggleDialog('loadCases'); setIsOpen(false); } },
    { id: 'materials', label: 'Materials', category: 'Dialogs', action: () => { onToggleDialog('materials'); setIsOpen(false); } },
    { id: 'projectInfo', label: 'Project Info', category: 'Dialogs', action: () => { onToggleDialog('projectInfo'); setIsOpen(false); } },
    { id: 'grids', label: 'Structural Grids', category: 'Dialogs', action: () => { onToggleDialog('grids'); setIsOpen(false); } },
    { id: 'standards', label: 'Standards & Checks', category: 'Dialogs', action: () => { onToggleDialog('standards'); setIsOpen(false); } },
    { id: 'calcSettings', label: 'Calculation Settings', category: 'Dialogs', action: () => { onToggleDialog('calcSettings'); setIsOpen(false); } },
    { id: 'steelCheck', label: 'Steel Check (EN 1993-1)', category: 'Dialogs', action: () => { onToggleDialog('steelCheck'); setIsOpen(false); } },
    // Actions
    { id: 'solve', label: 'Run Solver', category: 'Actions', shortcut: 'Ctrl+Enter', action: () => { onToggleDialog('solve'); setIsOpen(false); } },
    { id: 'undo', label: 'Undo', category: 'Actions', shortcut: 'Ctrl+Z', action: () => { dispatch({ type: 'UNDO' }); setIsOpen(false); } },
    { id: 'redo', label: 'Redo', category: 'Actions', shortcut: 'Ctrl+Y', action: () => { dispatch({ type: 'REDO' }); setIsOpen(false); } },
    { id: 'selectAll', label: 'Select All', category: 'Actions', shortcut: 'Ctrl+A', action: () => { onToggleDialog('selectAll'); setIsOpen(false); } },
    { id: 'snapGrid', label: 'Toggle Snap to Grid', category: 'Settings', action: () => { dispatch({ type: 'SET_SNAP_TO_GRID', payload: !state.snapToGrid }); setIsOpen(false); } },
  ], [state, dispatch, setTool, onToggleDialog]);

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
        <span>Search commands...</span>
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
          placeholder="Type a command..."
        />
        <div className="command-palette-results">
          {filtered.slice(0, 12).map((cmd, i) => (
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
            <div className="command-palette-empty">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
