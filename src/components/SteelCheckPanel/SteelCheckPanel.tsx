import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { BeamCheckResult } from '../../lib/types/steel/BeamCheckResult';
import { SidePanel } from '../openaec/SidePanel';
import { usePersistedDockSize, DOCK_KEYS } from '../openaec/DockSplitter';
import './SteelCheckPanel.css';

interface SteelCheckPanelProps {
  onClose: () => void;
}

export const SteelCheckPanel: React.FC<SteelCheckPanelProps> = ({ onClose }) => {
  const { state, dispatch } = useFEM();
  const { t } = useI18n();
  const results = state.steelCheckResults;

  // Right-dock width persistence per Phase 3 spec
  const [width, setWidth] = usePersistedDockSize(DOCK_KEYS.rightPanelWidth, 320);

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

  const handleDoubleClick = async (beamResult: BeamCheckResult) => {
    const reportInput = {
      project_name:        state.projectInfo.name         || 'Untitled',
      project_number:      state.projectInfo.projectNumber || '',
      engineer:            state.projectInfo.engineer      || '',
      company:             state.projectInfo.company       || '',
      date:                state.projectInfo.date          || new Date().toISOString().slice(0, 10),
      steel_check_results: [beamResult],
    };
    try {
      const bytes = await invoke<number[]>('generate_steel_report_pdf', { input: reportInput });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'width=900,height=1200');
      if (!win) {
        alert('Pop-up blocked. Please allow pop-ups for this app to view the PDF.');
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert(`PDF generation failed: ${err}`);
    }
  };

  const renderBody = () => {
    if (!results || results.length === 0) {
      return <div className="scp-empty">{t('check.panel.empty')}</div>;
    }
    const okCount = results.filter(r => r.status === 'Ok').length;
    const notOkCount = results.filter(r => r.status === 'NotOk').length;

    return (
      <>
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
              onDoubleClick={() => handleDoubleClick(r)}
              role="button"
              tabIndex={0}
              title="Single-click: select beam  ·  Double-click: open EN 1993 PDF"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleClick(r.beam_id);
              }}
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
      </>
    );
  };

  return (
    <SidePanel
      side="right"
      title={t('check.panel.title')}
      width={width}
      onWidthChange={setWidth}
      onClose={onClose}
    >
      {renderBody()}
    </SidePanel>
  );
};
