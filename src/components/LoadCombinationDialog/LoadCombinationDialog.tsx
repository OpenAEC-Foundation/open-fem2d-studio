import { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { ILoadCombination, createLoadCombination, LoadCombinationType } from '../../core/fem/LoadCase';
import './LoadCombinationDialog.css';

interface LoadCombinationDialogProps {
  onClose: () => void;
}

export function LoadCombinationDialog({ onClose }: LoadCombinationDialogProps) {
  const { state, dispatch } = useFEM();
  const { loadCases, loadCombinations } = state;

  // Local working copy so we can batch-commit on close
  const [combinations, setCombinations] = useState<ILoadCombination[]>(
    () => loadCombinations.map(c => ({
      ...c,
      factors: new Map(c.factors)
    }))
  );

  const [selectedId, setSelectedId] = useState<number | null>(
    combinations.length > 0 ? combinations[0].id : null
  );

  const selectedCombo = combinations.find(c => c.id === selectedId) ?? null;

  // ── Helpers ──────────────────────────────────────────────────────────

  function nextId(): number {
    const ids = combinations.map(c => c.id);
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }

  function updateCombination(id: number, patch: Partial<ILoadCombination>) {
    setCombinations(prev =>
      prev.map(c => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function setFactor(comboId: number, lcId: number, value: number) {
    setCombinations(prev =>
      prev.map(c => {
        if (c.id !== comboId) return c;
        const newFactors = new Map(c.factors);
        newFactors.set(lcId, value);
        return { ...c, factors: newFactors };
      })
    );
  }

  // ── Actions ──────────────────────────────────────────────────────────

  function handleAdd() {
    const id = nextId();
    const combo = createLoadCombination(id, `Combination ${id}`, '6.10b');
    // Initialise every existing load case with factor 1.0
    for (const lc of loadCases) {
      combo.factors.set(lc.id, 1.0);
    }
    setCombinations(prev => [...prev, combo]);
    setSelectedId(id);
  }

  function handleDelete() {
    if (selectedId === null) return;
    setCombinations(prev => {
      const filtered = prev.filter(c => c.id !== selectedId);
      return filtered;
    });
    setSelectedId(combinations.length > 1
      ? (combinations.find(c => c.id !== selectedId)?.id ?? null)
      : null
    );
  }

  function handleApply() {
    dispatch({ type: 'SET_LOAD_COMBINATIONS', payload: combinations });
  }

  function handleOk() {
    handleApply();
    onClose();
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="lc-combo-overlay" onClick={onClose}>
      <div className="lc-combo-dialog" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lc-combo-header">Load Combinations</div>

        <div className="lc-combo-body">
          {/* Left: combination list */}
          <div className="lc-combo-sidebar">
            <div className="lc-combo-list">
              {combinations.map(c => (
                <button
                  key={c.id}
                  className={`lc-combo-list-item ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="lc-combo-list-name">{c.name}</span>
                  <span className={`lc-combo-list-badge ${c.type.toLowerCase()}`}>
                    {c.type}
                  </span>
                </button>
              ))}
              {combinations.length === 0 && (
                <div className="lc-combo-empty">No combinations defined.</div>
              )}
            </div>

            <div className="lc-combo-sidebar-actions">
              <button className="lc-combo-btn add" onClick={handleAdd}>+ Add</button>
              <button
                className="lc-combo-btn delete"
                onClick={handleDelete}
                disabled={selectedId === null}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Right: detail editor */}
          <div className="lc-combo-detail">
            {selectedCombo ? (
              <>
                {/* Name + type row */}
                <div className="lc-combo-detail-row">
                  <label className="lc-combo-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={selectedCombo.name}
                      onChange={e => updateCombination(selectedCombo.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="lc-combo-field type-field">
                    <span>Type</span>
                    <select
                      value={selectedCombo.type}
                      onChange={e =>
                        updateCombination(selectedCombo.id, {
                          type: e.target.value as LoadCombinationType
                        })
                      }
                    >
                      <optgroup label="ULS">
                        <option value="6.10a">6.10a (permanent dominant)</option>
                        <option value="6.10b">6.10b (variable dominant)</option>
                        <option value="6.14">6.14 (accidental)</option>
                        <option value="6.15">6.15 (seismic)</option>
                      </optgroup>
                      <optgroup label="SLS">
                        <option value="6.16">6.16 (characteristic)</option>
                        <option value="6.17">6.17 (frequent)</option>
                        <option value="6.18">6.18 (quasi-permanent)</option>
                      </optgroup>
                    </select>
                  </label>
                </div>

                {/* Factor table */}
                <div className="lc-combo-factors-label">Load case factors</div>
                <div className="lc-combo-factors-table-wrap">
                  <table className="lc-combo-factors-table">
                    <thead>
                      <tr>
                        <th>Load Case</th>
                        <th>Type</th>
                        <th>Factor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadCases.map(lc => {
                        const factor = selectedCombo.factors.get(lc.id) ?? 0;
                        return (
                          <tr key={lc.id}>
                            <td className="lc-combo-factor-name">
                              <span
                                className="lc-combo-color-dot"
                                style={{ background: lc.color }}
                              />
                              {lc.name}
                            </td>
                            <td className="lc-combo-factor-type">{lc.type}</td>
                            <td className="lc-combo-factor-input-cell">
                              <input
                                type="number"
                                step="0.01"
                                value={factor}
                                onChange={e => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    setFactor(selectedCombo.id, lc.id, val);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {loadCases.length === 0 && (
                        <tr>
                          <td colSpan={3} className="lc-combo-empty-row">
                            No load cases defined.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="lc-combo-no-selection">
                Select a combination from the list, or click <strong>+ Add</strong> to create one.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="lc-combo-footer">
          <button className="lc-combo-btn cancel" onClick={onClose}>Cancel</button>
          <button className="lc-combo-btn apply" onClick={handleApply}>Apply</button>
          <button className="lc-combo-btn confirm" onClick={handleOk}>OK</button>
        </div>
      </div>
    </div>
  );
}
