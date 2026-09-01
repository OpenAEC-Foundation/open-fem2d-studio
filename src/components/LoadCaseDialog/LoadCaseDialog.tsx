import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { ILoadCase, createLoadCase } from '../../core/fem/LoadCase';
import { Sheet } from '../openaec/Sheet';
import './LoadCaseDialog.css';

interface LoadCaseDialogProps {
  onClose: () => void;
}

const LOAD_CASE_TYPES: { value: ILoadCase['type']; label: string }[] = [
  { value: 'dead', label: 'Dead' },
  { value: 'live', label: 'Live' },
  { value: 'wind', label: 'Wind' },
  { value: 'snow', label: 'Snow' },
  { value: 'other', label: 'Other' },
];

export function LoadCaseDialog({ onClose }: LoadCaseDialogProps) {
  const { state, dispatch } = useFEM();
  const [loadCases, setLoadCases] = useState<ILoadCase[]>([...state.loadCases]);
  const [selectedId, setSelectedId] = useState<number | null>(
    loadCases.length > 0 ? loadCases[0].id : null
  );
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const selectedCase = loadCases.find(lc => lc.id === selectedId) ?? null;

  const handleAdd = () => {
    const nextId = loadCases.length > 0
      ? Math.max(...loadCases.map(lc => lc.id)) + 1
      : 1;
    const newCase = createLoadCase(nextId, `Load Case ${nextId}`, 'other');
    const updated = [...loadCases, newCase];
    setLoadCases(updated);
    setSelectedId(newCase.id);
  };

  const handleDelete = () => {
    if (selectedId === null || loadCases.length <= 1) return;
    const updated = loadCases.filter(lc => lc.id !== selectedId);
    setLoadCases(updated);
    setSelectedId(updated.length > 0 ? updated[0].id : null);
  };

  const handleStartRename = () => {
    if (!selectedCase) return;
    setRenamingId(selectedCase.id);
    setRenameValue(selectedCase.name);
  };

  const handleFinishRename = () => {
    if (renamingId === null) return;
    const trimmed = renameValue.trim();
    if (trimmed.length > 0) {
      setLoadCases(prev =>
        prev.map(lc => lc.id === renamingId ? { ...lc, name: trimmed } : lc)
      );
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setRenamingId(null);
      setRenameValue('');
    }
  };

  const handleTypeChange = (id: number, newType: ILoadCase['type']) => {
    const colors: Record<ILoadCase['type'], string> = {
      dead: '#6b7280',
      live: '#3b82f6',
      wind: '#22c55e',
      snow: '#06b6d4',
      other: '#f59e0b',
    };
    setLoadCases(prev =>
      prev.map(lc =>
        lc.id === id ? { ...lc, type: newType, color: colors[newType] } : lc
      )
    );
  };

  // Auto-apply on every change (sheet has no OK button)
  useEffect(() => {
    dispatch({ type: 'SET_LOAD_CASES', payload: loadCases });
  }, [loadCases, dispatch]);

  return (
    <Sheet open onClose={onClose} title="Load Cases">
      <div className="lc-dialog-body">
          {/* Action buttons */}
          <div className="lc-actions">
            <button className="lc-action-btn" onClick={handleAdd}>Add</button>
            <button
              className="lc-action-btn"
              onClick={handleStartRename}
              disabled={selectedId === null}
            >
              Rename
            </button>
            <button
              className="lc-action-btn danger"
              onClick={handleDelete}
              disabled={selectedId === null || loadCases.length <= 1}
              title={loadCases.length <= 1 ? 'Cannot delete the last load case' : ''}
            >
              Delete
            </button>
          </div>

          {/* Load case list */}
          <div className="lc-list">
            {loadCases.map(lc => (
              <div
                key={lc.id}
                className={`lc-list-item ${selectedId === lc.id ? 'active' : ''}`}
                onClick={() => setSelectedId(lc.id)}
              >
                <span
                  className="lc-color-dot"
                  style={{ background: lc.color }}
                />
                {renamingId === lc.id ? (
                  <input
                    className="lc-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={handleRenameKeyDown}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="lc-item-name">{lc.name}</span>
                )}
                <span className="lc-item-type">{lc.type}</span>
              </div>
            ))}
          </div>

          {/* Selected load case details */}
          {selectedCase && renamingId === null && (
            <div className="lc-details">
              <div className="lc-detail-row">
                <span className="lc-detail-label">Type</span>
                <select
                  className="lc-detail-select"
                  value={selectedCase.type}
                  onChange={e =>
                    handleTypeChange(selectedCase.id, e.target.value as ILoadCase['type'])
                  }
                >
                  {LOAD_CASE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lc-detail-row">
                <span className="lc-detail-label">Point loads</span>
                <span className="lc-detail-value">{selectedCase.pointLoads.length}</span>
              </div>
              <div className="lc-detail-row">
                <span className="lc-detail-label">Distributed loads</span>
                <span className="lc-detail-value">{selectedCase.distributedLoads.length}</span>
              </div>
            </div>
          )}
        </div>
    </Sheet>
  );
}
