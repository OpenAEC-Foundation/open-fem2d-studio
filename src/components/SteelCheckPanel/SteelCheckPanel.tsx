import React from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { ShieldCheck, ShieldAlert, X } from 'lucide-react';
import './SteelCheckPanel.css';

interface SteelCheckPanelProps {
  onClose: () => void;
}

export const SteelCheckPanel: React.FC<SteelCheckPanelProps> = ({ onClose }) => {
  const { state, dispatch } = useFEM();
  const { t } = useI18n();
  const results = state.steelCheckResults;

  if (!results || results.length === 0) {
    return (
      <div className="steel-check-panel">
        <div className="scp-header">
          <h2>{t('check.panel.title')}</h2>
          <button onClick={onClose} className="scp-close" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="scp-empty">
          {t('check.panel.empty')}
        </div>
      </div>
    );
  }

  const okCount = results.filter(r => r.status === 'Ok').length;
  const notOkCount = results.filter(r => r.status === 'NotOk').length;

  const handleClick = (beamId: number) => {
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        nodeIds: new Set(),
        elementIds: new Set([beamId]),
        pointLoadNodeIds: new Set(),
        distLoadBeamIds: new Set(),
        selectedDistLoadIds: new Set(),
        plateIds: new Set(),
        edgeIds: new Set(),
      },
    });
  };

  return (
    <div className="steel-check-panel">
      <div className="scp-header">
        <h2>{t('check.panel.title')}</h2>
        <button onClick={onClose} className="scp-close" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="scp-stats">
        <span>{t('check.panel.totalBeams')}: <strong>{results.length}</strong></span>
        <span className="scp-ok">&#x2713; {t('check.status.ok')}: <strong>{okCount}</strong></span>
        <span className="scp-notok">&#x2717; {t('check.status.notOk')}: <strong>{notOkCount}</strong></span>
      </div>

      <div className="scp-list">
        {results.map(r => (
          <div
            key={r.beam_id}
            className={`scp-card scp-status-${r.status.toLowerCase()}`}
            onClick={() => handleClick(r.beam_id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(r.beam_id); }}
          >
            <div className="scp-card-main">
              <div className="scp-card-id">Beam {r.beam_id}</div>
              <div className="scp-card-profile">{r.profile_name} <span className="scp-grade">({r.steel_grade})</span></div>
              <div className="scp-card-governing">
                {r.status === 'Ok' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                {' '}{t('check.governing')} {r.governing_check_id}
              </div>
            </div>
            <div className="scp-card-uc">
              {r.uc_max.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
