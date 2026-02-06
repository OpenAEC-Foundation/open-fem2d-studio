import { useFEM, ViewMode } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { Ruler, ArrowDown, BarChart3 } from 'lucide-react';
import './LoadCaseTabs.css';

interface LoadCaseTabsProps {
  onSolve?: () => void;
}

export function LoadCaseTabs({ onSolve }: LoadCaseTabsProps) {
  const { t } = useI18n();
  const { state, dispatch } = useFEM();
  const {
    viewMode, activeLoadCase, mesh, result, loadCases
  } = state;

  const setViewMode = (mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });
  };

  const handleResultsClick = () => {
    if (!result && onSolve) {
      onSolve();
    }
    setViewMode('results');
  };

  const setActiveLoadCase = (id: number) => {
    dispatch({ type: 'SET_ACTIVE_LOAD_CASE', payload: id });
  };

  const nodes = Array.from(mesh.nodes.values());
  const nodeCount = nodes.length;
  const elementCount = mesh.beamElements.size + mesh.elements.size;
  const supportCount = nodes.filter(n =>
    n.constraints && (n.constraints.x || n.constraints.y || n.constraints.rotation)
  ).length;

  return (
    <div className="loadcase-tabs">
      {/* View Mode Switcher */}
      <div className="view-mode-tabs">
        <button
          className={`view-mode-tab ${viewMode === 'geometry' ? 'active' : ''}`}
          onClick={() => setViewMode('geometry')}
        >
          <span className="tab-icon"><Ruler size={14} /></span>
          <span className="tab-name">{t('tabs.geometry')}</span>
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'loads' ? 'active' : ''}`}
          onClick={() => setViewMode('loads')}
        >
          <span className="tab-icon"><ArrowDown size={14} /></span>
          <span className="tab-name">{t('tabs.loads')}</span>
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'results' ? 'active' : ''}`}
          onClick={handleResultsClick}
          disabled={mesh.getNodeCount() < 2}
          title={t('tabs.viewResults')}
        >
          <span className="tab-icon"><BarChart3 size={14} /></span>
          <span className="tab-name">{t('tabs.resultsCalc')}</span>
        </button>
      </div>

      {/* Load Case Tabs - only show when in loads view */}
      {viewMode === 'loads' && (
        <div className="tabs-container">
          {loadCases.map(lc => (
            <button
              key={lc.id}
              className={`loadcase-tab ${activeLoadCase === lc.id ? 'active' : ''}`}
              onClick={() => setActiveLoadCase(lc.id)}
              style={{ borderLeftColor: lc.color }}
            >
              <span className="tab-name">{lc.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Status Info */}
      <div className="tabs-info">
        <span className="info-item">
          <span className="info-label">{t('browser.nodes')}:</span>
          <span className="info-value">{nodeCount}</span>
        </span>
        <span className="info-separator">|</span>
        <span className="info-item">
          <span className="info-label">{t('tabs.members')}</span>
          <span className="info-value">{elementCount}</span>
        </span>
        <span className="info-separator">|</span>
        <span className="info-item">
          <span className="info-label">{t('tabs.supports')}</span>
          <span className="info-value">{supportCount}</span>
        </span>
        <span className="info-separator">|</span>
        <span className="info-item status-ready">
          <span className="status-dot" style={{ background: result ? 'var(--success)' : 'var(--warning)' }} />
          <span>{result ? t('browser.solved') : t('tabs.ready')}</span>
        </span>
      </div>
    </div>
  );
}
