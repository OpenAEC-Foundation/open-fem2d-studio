import { useFEM } from '../../context/FEMContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './VisibilityPanel.css';

interface VisibilityPanelProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function VisibilityPanel({ collapsed, onToggleCollapse }: VisibilityPanelProps) {
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
    forceUnit,
    displacementUnit,
    structuralGrid
  } = state;

  if (collapsed) {
    return (
      <div className="visibility-panel collapsed-panel" onClick={onToggleCollapse}>
        <span className="collapsed-label">Display Settings</span>
        <ChevronLeft size={14} />
      </div>
    );
  }

  return (
    <div className="visibility-panel">
      <div className="panel-header">
        <span className="panel-title">Display Settings</span>
        {onToggleCollapse && (
          <button className="panel-collapse-btn" onClick={onToggleCollapse} title="Collapse">
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="panel-content">
        {/* Grid Settings */}
        <div className="panel-section">
          <div className="section-title">Grid</div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID', payload: e.target.checked })}
              />
              <span className="toggle-text">Snap to Grid</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={structuralGrid.showGridLines}
                onChange={(e) => dispatch({ type: 'SET_SHOW_GRID_LINES', payload: e.target.checked })}
              />
              <span className="toggle-text">Show Grid Lines</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={structuralGrid.snapToGridLines}
                onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID_LINES', payload: e.target.checked })}
              />
              <span className="toggle-text">Snap to Grid Lines</span>
            </label>
          </div>
          <div className="slider-row">
            <span className="slider-label">Grid Size</span>
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
          <div className="section-title">Show Elements</div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showNodes}
                onChange={(e) => dispatch({ type: 'SET_SHOW_NODES', payload: e.target.checked })}
              />
              <span className="toggle-text">Nodes</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showMembers}
                onChange={(e) => dispatch({ type: 'SET_SHOW_MEMBERS', payload: e.target.checked })}
              />
              <span className="toggle-text">Members</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showSupports}
                onChange={(e) => dispatch({ type: 'SET_SHOW_SUPPORTS', payload: e.target.checked })}
              />
              <span className="toggle-text">Supports</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showLoads}
                onChange={(e) => dispatch({ type: 'SET_SHOW_LOADS', payload: e.target.checked })}
              />
              <span className="toggle-text">Loads</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showNodeLabels}
                onChange={(e) => dispatch({ type: 'SET_SHOW_NODE_LABELS', payload: e.target.checked })}
              />
              <span className="toggle-text">Node Labels</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showMemberLabels}
                onChange={(e) => dispatch({ type: 'SET_SHOW_MEMBER_LABELS', payload: e.target.checked })}
              />
              <span className="toggle-text">Member Labels</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showProfileNames}
                onChange={(e) => dispatch({ type: 'SET_SHOW_PROFILE_NAMES', payload: e.target.checked })}
              />
              <span className="toggle-text">Profile Names</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => dispatch({ type: 'SET_SHOW_DIMENSIONS', payload: e.target.checked })}
              />
              <span className="toggle-text">Dimensions</span>
            </label>
          </div>
        </div>

        {/* Units */}
        <div className="panel-section">
          <div className="section-title">Units</div>
          <div className="slider-row">
            <span className="slider-label">Force</span>
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
            <span className="slider-label">Displacement</span>
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
            <div className="section-title">Results</div>

            <div className="toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showDeformed}
                  onChange={(e) => dispatch({ type: 'SET_SHOW_DEFORMED', payload: e.target.checked })}
                />
                <span className="toggle-text">Deformed Shape</span>
              </label>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
