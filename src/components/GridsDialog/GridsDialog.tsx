import { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { IGridLine, IStructuralGrid } from '../../core/fem/StructuralGrid';
import { Plus, Minus, Trash2, Lock, Unlock } from 'lucide-react';
import './GridsDialog.css';

interface GridsDialogProps {
  onClose: () => void;
}

function nextLetter(existing: IGridLine[]): string {
  const used = new Set(existing.map(l => l.name));
  for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i); // A, B, C, ...
    if (!used.has(name)) return name;
  }
  return `G${existing.length + 1}`;
}

function nextLevel(existing: IGridLine[]): string {
  if (existing.length === 0) return '+0.000';
  const maxPos = Math.max(...existing.map(l => l.position));
  return `+${(maxPos + 3).toFixed(3)}`;
}

export function GridsDialog({ onClose }: GridsDialogProps) {
  const { state, dispatch } = useFEM();
  const [grid, setGrid] = useState<IStructuralGrid>({ ...state.structuralGrid });
  const [editingSpacing, setEditingSpacing] = useState<{ type: 'vertical' | 'horizontal'; index: number } | null>(null);
  const [spacingValue, setSpacingValue] = useState<string>('');

  // Display in mm, store in meters
  const toMm = (m: number) => Math.round(m * 1000);
  const toM = (mm: number) => mm / 1000;

  const addVertical = () => {
    const lastPos = grid.verticalLines.length > 0
      ? Math.max(...grid.verticalLines.map(l => l.position)) + 3
      : 0;
    const newLine: IGridLine = {
      id: Date.now(),
      name: nextLetter(grid.verticalLines),
      position: lastPos,
      orientation: 'vertical'
    };
    setGrid({ ...grid, verticalLines: [...grid.verticalLines, newLine] });
  };

  const addHorizontal = () => {
    const lastPos = grid.horizontalLines.length > 0
      ? Math.max(...grid.horizontalLines.map(l => l.position)) + 3
      : 0;
    const newLine: IGridLine = {
      id: Date.now() + 1,
      name: nextLevel(grid.horizontalLines),
      position: lastPos,
      orientation: 'horizontal'
    };
    setGrid({ ...grid, horizontalLines: [...grid.horizontalLines, newLine] });
  };

  const removeLastVertical = () => {
    if (grid.verticalLines.length === 0) return;
    const sorted = [...grid.verticalLines].sort((a, b) => a.position - b.position);
    const lastId = sorted[sorted.length - 1].id;
    setGrid({ ...grid, verticalLines: grid.verticalLines.filter(l => l.id !== lastId) });
  };

  const removeLastHorizontal = () => {
    if (grid.horizontalLines.length === 0) return;
    const sorted = [...grid.horizontalLines].sort((a, b) => a.position - b.position);
    const lastId = sorted[sorted.length - 1].id;
    setGrid({ ...grid, horizontalLines: grid.horizontalLines.filter(l => l.id !== lastId) });
  };

  const removeVertical = (id: number) => {
    setGrid({ ...grid, verticalLines: grid.verticalLines.filter(l => l.id !== id) });
  };

  const removeHorizontal = (id: number) => {
    setGrid({ ...grid, horizontalLines: grid.horizontalLines.filter(l => l.id !== id) });
  };

  const updateVertical = (id: number, updates: Partial<IGridLine>) => {
    setGrid({
      ...grid,
      verticalLines: grid.verticalLines.map(l => l.id === id ? { ...l, ...updates } : l)
    });
  };

  const updateHorizontal = (id: number, updates: Partial<IGridLine>) => {
    setGrid({
      ...grid,
      horizontalLines: grid.horizontalLines.map(l => l.id === id ? { ...l, ...updates } : l)
    });
  };

  const distributeVertical = () => {
    if (grid.verticalLines.length < 2) return;
    const sorted = [...grid.verticalLines].sort((a, b) => a.position - b.position);
    const unlocked = sorted.filter(l => !l.locked);
    if (unlocked.length < 2) return;
    const start = sorted[0].position;
    const end = sorted[sorted.length - 1].position;
    const spacing = (end - start) / (sorted.length - 1);
    const updated = sorted.map((l, i) => l.locked ? l : { ...l, position: start + i * spacing });
    setGrid({ ...grid, verticalLines: updated });
  };

  /** Click on a spacing indicator to edit the distance between two consecutive grid lines */
  const handleSpacingClick = (type: 'vertical' | 'horizontal', index: number, currentSpacingMm: number) => {
    setEditingSpacing({ type, index });
    setSpacingValue(String(currentSpacingMm));
  };

  /** Commit the edited spacing: shift all subsequent grid lines so the gap matches */
  const commitSpacing = () => {
    if (!editingSpacing) return;
    const newSpacingMm = parseFloat(spacingValue);
    if (isNaN(newSpacingMm) || newSpacingMm <= 0) {
      setEditingSpacing(null);
      return;
    }
    const newSpacingM = toM(newSpacingMm);
    const { type, index } = editingSpacing;

    if (type === 'vertical') {
      const sorted = [...grid.verticalLines].sort((a, b) => a.position - b.position);
      const oldSpacing = sorted[index + 1].position - sorted[index].position;
      const delta = newSpacingM - oldSpacing;
      // Shift all lines after index by delta (skip locked)
      const shiftedIds = new Set(sorted.slice(index + 1).filter(l => !l.locked).map(l => l.id));
      setGrid({
        ...grid,
        verticalLines: grid.verticalLines.map(l =>
          shiftedIds.has(l.id) ? { ...l, position: l.position + delta } : l
        )
      });
    } else {
      const sorted = [...grid.horizontalLines].sort((a, b) => a.position - b.position);
      const oldSpacing = sorted[index + 1].position - sorted[index].position;
      const delta = newSpacingM - oldSpacing;
      const shiftedIds = new Set(sorted.slice(index + 1).filter(l => !l.locked).map(l => l.id));
      setGrid({
        ...grid,
        horizontalLines: grid.horizontalLines.map(l =>
          shiftedIds.has(l.id) ? { ...l, position: l.position + delta } : l
        )
      });
    }
    setEditingSpacing(null);
  };

  const handleSpacingKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitSpacing();
    } else if (e.key === 'Escape') {
      setEditingSpacing(null);
    }
  };

  const handleApply = () => {
    // Enable showGridLines automatically after using the grid dialog
    const updatedGrid = { ...grid, showGridLines: true };
    dispatch({ type: 'SET_STRUCTURAL_GRID', payload: updatedGrid });
    dispatch({ type: 'REFRESH_MESH' });
    onClose();
  };

  /** Render table rows with spacing indicators between consecutive lines */
  const renderGridRows = (
    lines: IGridLine[],
    type: 'vertical' | 'horizontal',
    updateFn: (id: number, updates: Partial<IGridLine>) => void,
    removeFn: (id: number) => void
  ) => {
    const sorted = [...lines].sort((a, b) => a.position - b.position);
    const rows: React.ReactNode[] = [];

    sorted.forEach((line, i) => {
      // Grid line row
      rows.push(
        <tr key={line.id}>
          <td>
            <input
              type="text"
              value={line.name}
              onChange={e => updateFn(line.id, { name: e.target.value })}
              className="grids-input name-input"
            />
          </td>
          <td>
            <input
              type="number"
              value={toMm(line.position)}
              onChange={e => updateFn(line.id, { position: toM(parseFloat(e.target.value) || 0) })}
              className="grids-input"
              step="500"
              disabled={line.locked}
            />
          </td>
          <td>
            <button
              className={`grids-lock-btn ${line.locked ? 'locked' : ''}`}
              onClick={() => updateFn(line.id, { locked: !line.locked })}
              title={line.locked ? 'Unlock position' : 'Lock position'}
            >
              {line.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          </td>
          <td>
            <button className="grids-delete-btn" onClick={() => removeFn(line.id)}>
              <Trash2 size={12} />
            </button>
          </td>
        </tr>
      );

      // Spacing indicator row between this line and the next
      if (i < sorted.length - 1) {
        const spacingM = sorted[i + 1].position - line.position;
        const spacingMm = toMm(spacingM);
        const isEditing = editingSpacing?.type === type && editingSpacing?.index === i;

        rows.push(
          <tr key={`spacing-${line.id}`} className="grids-spacing-row">
            <td colSpan={4}>
              {isEditing ? (
                <div className="grids-spacing-indicator">
                  <span className="grids-spacing-line" />
                  <input
                    type="number"
                    className="grids-spacing-input"
                    value={spacingValue}
                    onChange={e => setSpacingValue(e.target.value)}
                    onBlur={commitSpacing}
                    onKeyDown={handleSpacingKeyDown}
                    autoFocus
                    step="100"
                  />
                  <span className="grids-spacing-line" />
                </div>
              ) : (
                <div
                  className="grids-spacing-indicator"
                  onClick={() => handleSpacingClick(type, i, spacingMm)}
                  title="Click to edit spacing"
                >
                  <span className="grids-spacing-line" />
                  <span className="grids-spacing-label">{spacingMm} mm</span>
                  <span className="grids-spacing-line" />
                </div>
              )}
            </td>
          </tr>
        );
      }
    });

    return rows;
  };

  return (
    <div className="grids-dialog-overlay" onClick={onClose}>
      <div className="grids-dialog" onClick={e => e.stopPropagation()}>
        <div className="grids-dialog-header">Structural Grids</div>
        <div className="grids-dialog-body">
          {/* Vertical grid lines (stramienen) */}
          <div className="grids-section">
            <div className="grids-section-header">
              <span>Grids (Vertical)</span>
              <div className="grids-section-actions">
                <button className="grids-action-btn add-btn" onClick={addVertical} title="Add grid line">
                  <Plus size={12} />
                </button>
                <button className="grids-action-btn remove-btn" onClick={removeLastVertical} title="Remove last grid line">
                  <Minus size={12} />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px 0' }}>
              <button className="grids-action-btn distribute-btn" onClick={distributeVertical} title="Distribute evenly">
                Distribute
              </button>
            </div>
            <table className="grids-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>X-position (mm)</th>
                  <th style={{width: 28}}></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grid.verticalLines.length > 0
                  ? renderGridRows(grid.verticalLines, 'vertical', updateVertical, removeVertical)
                  : <tr><td colSpan={4} className="grids-empty">No grid lines. Click + to create.</td></tr>
                }
              </tbody>
            </table>
          </div>

          {/* Horizontal grid lines (levels) */}
          <div className="grids-section">
            <div className="grids-section-header">
              <span>Elevations (Horizontal)</span>
              <div className="grids-section-actions">
                <button className="grids-action-btn add-btn" onClick={addHorizontal} title="Add elevation">
                  <Plus size={12} />
                </button>
                <button className="grids-action-btn remove-btn" onClick={removeLastHorizontal} title="Remove last elevation">
                  <Minus size={12} />
                </button>
              </div>
            </div>
            <table className="grids-table">
              <thead>
                <tr>
                  <th>Elevation</th>
                  <th>Z-elevation (mm)</th>
                  <th style={{width: 28}}></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grid.horizontalLines.length > 0
                  ? renderGridRows(grid.horizontalLines, 'horizontal', updateHorizontal, removeHorizontal)
                  : <tr><td colSpan={4} className="grids-empty">No levels. Click + to create.</td></tr>
                }
              </tbody>
            </table>
          </div>

        </div>
        <div className="grids-dialog-footer">
          <button className="grids-btn cancel" onClick={onClose}>Cancel</button>
          <button className="grids-btn confirm" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
