import { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Unlock, Plus, Trash2 } from 'lucide-react';
import { ILayer } from '../../core/fem/types';
import './VisibilityPanel.css';

interface VisibilityPanelProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function VisibilityPanel({ collapsed, onToggleCollapse }: VisibilityPanelProps) {
  const { t } = useI18n();
  const { state, dispatch } = useFEM();
  const {
    showDeformed,
    result,
    gridSize,
    snapToGrid,
    showProfileNames,
    showDimensions,
    showNodes,
    showMembers,
    showSupports,
    showLoads,
    showNodeLabels,
    showMemberLabels,
    showElementTypes,
    forceUnit,
    displacementUnit,
    structuralGrid,
    activeLayerId,
    mesh
  } = state;

  const [newLayerName, setNewLayerName] = useState('');
  const layers: ILayer[] = Array.from(mesh.layers.values());

  if (collapsed) {
    return (
      <div className="visibility-panel collapsed-panel" onClick={onToggleCollapse}>
        <span className="collapsed-label">{t('display.title')}</span>
        <ChevronLeft size={14} />
      </div>
    );
  }

  return (
    <div className="visibility-panel">
      <div className="panel-header">
        <span className="panel-title">{t('display.title')}</span>
        {onToggleCollapse && (
          <button className="panel-collapse-btn" onClick={onToggleCollapse} title={t('display.collapse')}>
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="panel-content">
        {/* Grid Settings */}
        <div className="panel-section">
          <div className="section-title">{t('display.grid')}</div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.snapToGrid')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={structuralGrid.showGridLines}
                onChange={(e) => dispatch({ type: 'SET_SHOW_GRID_LINES', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.showGridLines')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={structuralGrid.snapToGridLines}
                onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID_LINES', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.snapToGridLines')}</span>
            </label>
          </div>
          <div className="slider-row">
            <span className="slider-label">{t('display.gridSize')}</span>
            <input
              type="number"
              min="10"
              max="1000"
              step="10"
              value={Math.round(gridSize * 1000)}
              onChange={(e) => {
                const mm = parseInt(e.target.value);
                if (!isNaN(mm) && mm >= 10 && mm <= 1000) {
                  dispatch({ type: 'SET_GRID_SIZE', payload: mm / 1000 });
                }
              }}
              className="grid-size-input"
            />
            <span className="slider-value">mm</span>
          </div>
        </div>

        {/* Display Elements */}
        <div className="panel-section">
          <div className="section-title">{t('display.showElements')}</div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showNodes}
                onChange={(e) => dispatch({ type: 'SET_SHOW_NODES', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.nodes')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showMembers}
                onChange={(e) => dispatch({ type: 'SET_SHOW_MEMBERS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.members')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showSupports}
                onChange={(e) => dispatch({ type: 'SET_SHOW_SUPPORTS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.supports')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showLoads}
                onChange={(e) => dispatch({ type: 'SET_SHOW_LOADS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.loads')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showNodeLabels}
                onChange={(e) => dispatch({ type: 'SET_SHOW_NODE_LABELS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.nodeLabels')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showMemberLabels}
                onChange={(e) => dispatch({ type: 'SET_SHOW_MEMBER_LABELS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.memberLabels')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showElementTypes}
                onChange={(e) => dispatch({ type: 'SET_SHOW_ELEMENT_TYPES', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.elementTypes')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showProfileNames}
                onChange={(e) => dispatch({ type: 'SET_SHOW_PROFILE_NAMES', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.profileNames')}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => dispatch({ type: 'SET_SHOW_DIMENSIONS', payload: e.target.checked })}
              />
              <span className="toggle-text">{t('display.dimensions')}</span>
            </label>
          </div>
        </div>

        {/* Layers */}
        <div className="panel-section">
          <div className="section-title">{t('display.layers')}</div>
          <div className="layers-list">
            {layers.map(layer => (
              <div
                key={layer.id}
                className={`layer-row${layer.id === activeLayerId ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', payload: layer.id })}
              >
                <span className="layer-color-dot" style={{ background: layer.color }} />
                <span className="layer-name">{layer.name}</span>
                <button
                  className="layer-icon-btn"
                  title={layer.visible ? t('display.hiddenLayer') : t('display.showLayer')}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'UPDATE_LAYER', payload: { id: layer.id, updates: { visible: !layer.visible } } });
                  }}
                >
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  className="layer-icon-btn"
                  title={layer.locked ? t('display.unlockLayer') : t('display.lockLayer')}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'UPDATE_LAYER', payload: { id: layer.id, updates: { locked: !layer.locked } } });
                  }}
                >
                  {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                {layer.id !== 0 && (
                  <button
                    className="layer-icon-btn danger"
                    title={t('display.deleteLayer')}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'REMOVE_LAYER', payload: layer.id });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="layer-add-row">
            <input
              className="layer-add-input"
              type="text"
              placeholder={t('display.newLayerPlaceholder')}
              value={newLayerName}
              onChange={e => setNewLayerName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newLayerName.trim()) {
                  dispatch({ type: 'ADD_LAYER', payload: { name: newLayerName.trim() } });
                  setNewLayerName('');
                }
              }}
            />
            <button
              className="layer-add-btn"
              disabled={!newLayerName.trim()}
              onClick={() => {
                if (newLayerName.trim()) {
                  dispatch({ type: 'ADD_LAYER', payload: { name: newLayerName.trim() } });
                  setNewLayerName('');
                }
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Units */}
        <div className="panel-section">
          <div className="section-title">{t('display.units')}</div>
          <div className="slider-row">
            <span className="slider-label">{t('display.force')}</span>
            <select
              className="unit-select"
              value={forceUnit}
              onChange={(e) => dispatch({ type: 'SET_FORCE_UNIT', payload: e.target.value as 'N' | 'kN' | 'MN' })}
            >
              <option value="kN">kN</option>
              <option value="N">N</option>
              <option value="MN">MN</option>
            </select>
          </div>
          <div className="slider-row">
            <span className="slider-label">{t('display.displacement')}</span>
            <select
              className="unit-select"
              value={displacementUnit}
              onChange={(e) => dispatch({ type: 'SET_DISPLACEMENT_UNIT', payload: e.target.value as 'mm' | 'm' })}
            >
              <option value="mm">mm</option>
              <option value="m">m</option>
            </select>
          </div>
        </div>

        {/* Results Visibility */}
        {result && (
          <div className="panel-section">
            <div className="section-title">{t('display.results')}</div>

            <div className="toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showDeformed}
                  onChange={(e) => dispatch({ type: 'SET_SHOW_DEFORMED', payload: e.target.checked })}
                />
                <span className="toggle-text">{t('display.deformedShape')}</span>
              </label>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
