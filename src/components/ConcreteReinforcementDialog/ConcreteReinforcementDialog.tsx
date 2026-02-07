/**
 * ConcreteReinforcementDialog - Define mesh reinforcement for concrete plates
 * Allows specifying top/bottom mesh layers in X and Y directions,
 * plus additional individual bars.
 */

import { useState } from 'react';
import { useI18n } from '../../i18n/i18n';
import { useFEM } from '../../context/FEMContext';
import { IPlateReinforcement } from '../../core/fem/types';
import { X } from 'lucide-react';
import './ConcreteReinforcementDialog.css';

interface Props {
  plateId: number;
  onClose: () => void;
}

// Common bar diameters (mm)
const BAR_DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40];

// Common spacings (mm)
const SPACINGS = [100, 125, 150, 175, 200, 250, 300];

export function ConcreteReinforcementDialog({ plateId, onClose }: Props) {
  const { t } = useI18n();
  const { state, dispatch } = useFEM();
  const { mesh } = state;

  const plate = mesh.plateRegions.get(plateId);

  // Initialize from existing reinforcement or defaults
  const existing = plate?.reinforcement;

  const [topXEnabled, setTopXEnabled] = useState(!!existing?.topX);
  const [topYEnabled, setTopYEnabled] = useState(!!existing?.topY);
  const [bottomXEnabled, setBottomXEnabled] = useState(!!existing?.bottomX);
  const [bottomYEnabled, setBottomYEnabled] = useState(!!existing?.bottomY);

  // Top X
  const [topXDia, setTopXDia] = useState(existing?.topX?.barDiameter ?? 10);
  const [topXSpacing, setTopXSpacing] = useState(existing?.topX?.spacing ?? 150);
  const [topXCover, setTopXCover] = useState(existing?.topX?.cover ?? 35);

  // Top Y
  const [topYDia, setTopYDia] = useState(existing?.topY?.barDiameter ?? 10);
  const [topYSpacing, setTopYSpacing] = useState(existing?.topY?.spacing ?? 150);
  const [topYCover, setTopYCover] = useState(existing?.topY?.cover ?? 45);

  // Bottom X
  const [bottomXDia, setBottomXDia] = useState(existing?.bottomX?.barDiameter ?? 12);
  const [bottomXSpacing, setBottomXSpacing] = useState(existing?.bottomX?.spacing ?? 150);
  const [bottomXCover, setBottomXCover] = useState(existing?.bottomX?.cover ?? 35);

  // Bottom Y
  const [bottomYDia, setBottomYDia] = useState(existing?.bottomY?.barDiameter ?? 12);
  const [bottomYSpacing, setBottomYSpacing] = useState(existing?.bottomY?.spacing ?? 150);
  const [bottomYCover, setBottomYCover] = useState(existing?.bottomY?.cover ?? 47);

  // Calculate As values
  const calcAs = (dia: number, spacing: number): number => {
    return (Math.PI * (dia / 2) ** 2) / spacing * 1000; // mm²/m
  };

  const topXAs = topXEnabled ? calcAs(topXDia, topXSpacing) : 0;
  const topYAs = topYEnabled ? calcAs(topYDia, topYSpacing) : 0;
  const bottomXAs = bottomXEnabled ? calcAs(bottomXDia, bottomXSpacing) : 0;
  const bottomYAs = bottomYEnabled ? calcAs(bottomYDia, bottomYSpacing) : 0;

  // Build reinforcement config
  const buildConfig = (): IPlateReinforcement => {
    const cfg: IPlateReinforcement = {};

    if (topXEnabled) {
      cfg.topX = { direction: 'X', barDiameter: topXDia, spacing: topXSpacing, cover: topXCover, position: 'top' };
    }
    if (topYEnabled) {
      cfg.topY = { direction: 'Y', barDiameter: topYDia, spacing: topYSpacing, cover: topYCover, position: 'top' };
    }
    if (bottomXEnabled) {
      cfg.bottomX = { direction: 'X', barDiameter: bottomXDia, spacing: bottomXSpacing, cover: bottomXCover, position: 'bottom' };
    }
    if (bottomYEnabled) {
      cfg.bottomY = { direction: 'Y', barDiameter: bottomYDia, spacing: bottomYSpacing, cover: bottomYCover, position: 'bottom' };
    }

    return cfg;
  };

  const handleApply = () => {
    const reinforcement = buildConfig();
    dispatch({
      type: 'UPDATE_PLATE_REINFORCEMENT',
      plateId,
      reinforcement,
    });
    onClose();
  };

  // SVG Preview
  const renderPreview = () => {
    if (!plate) return null;

    const svgW = 280;
    const svgH = 200;
    const pad = 20;
    const thicknessMM = plate.thickness * 1000;

    // Cross-section view through plate thickness
    const scale = Math.min((svgW - 2 * pad) / 400, (svgH - 2 * pad) / thicknessMM);
    const plateW = 350 * scale;
    const plateH = thicknessMM * scale;
    const ox = (svgW - plateW) / 2;
    const oy = (svgH - plateH) / 2;

    // Bar sizes scaled
    const barScale = scale * 2;

    // Collect bars for drawing
    const bars: { x: number; y: number; r: number; color: string }[] = [];

    // Bottom layer bars (lower in drawing = higher y)
    if (bottomXEnabled) {
      const r = bottomXDia * barScale / 2;
      const y = oy + plateH - bottomXCover * scale;
      const nBars = Math.floor(plateW / (bottomXSpacing * scale)) + 1;
      for (let i = 0; i < Math.min(nBars, 20); i++) {
        bars.push({ x: ox + 15 + i * (plateW - 30) / Math.max(nBars - 1, 1), y, r, color: '#3b82f6' });
      }
    }
    if (bottomYEnabled) {
      const r = bottomYDia * barScale / 2;
      const y = oy + plateH - bottomYCover * scale;
      // Y-direction shown as dashed circles (perpendicular)
      bars.push({ x: ox + plateW / 2 - 40, y: y - 2, r, color: '#60a5fa' });
      bars.push({ x: ox + plateW / 2 + 40, y: y - 2, r, color: '#60a5fa' });
    }

    // Top layer bars
    if (topXEnabled) {
      const r = topXDia * barScale / 2;
      const y = oy + topXCover * scale;
      const nBars = Math.floor(plateW / (topXSpacing * scale)) + 1;
      for (let i = 0; i < Math.min(nBars, 20); i++) {
        bars.push({ x: ox + 15 + i * (plateW - 30) / Math.max(nBars - 1, 1), y, r, color: '#22c55e' });
      }
    }
    if (topYEnabled) {
      const r = topYDia * barScale / 2;
      const y = oy + topYCover * scale;
      bars.push({ x: ox + plateW / 2 - 40, y: y + 2, r, color: '#4ade80' });
      bars.push({ x: ox + plateW / 2 + 40, y: y + 2, r, color: '#4ade80' });
    }

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="reinforcement-preview-svg">
        {/* Background */}
        <rect width={svgW} height={svgH} fill="#ffffff" />

        {/* Plate cross-section */}
        <rect x={ox} y={oy} width={plateW} height={plateH}
              fill="rgba(128,128,128,0.15)" stroke="#64748b" strokeWidth="1" />

        {/* Bars */}
        {bars.map((bar, i) => (
          <circle key={i} cx={bar.x} cy={bar.y} r={Math.max(bar.r, 2)}
                  fill={bar.color} stroke="#1e293b" strokeWidth="0.5" />
        ))}

        {/* Dimension: thickness */}
        <line x1={ox + plateW + 10} y1={oy} x2={ox + plateW + 10} y2={oy + plateH}
              stroke="#94a3b8" strokeWidth="0.5" />
        <line x1={ox + plateW + 5} y1={oy} x2={ox + plateW + 15} y2={oy}
              stroke="#94a3b8" strokeWidth="0.5" />
        <line x1={ox + plateW + 5} y1={oy + plateH} x2={ox + plateW + 15} y2={oy + plateH}
              stroke="#94a3b8" strokeWidth="0.5" />
        <text x={ox + plateW + 18} y={oy + plateH / 2 + 3} fontSize="9" fill="#64748b">
          {thicknessMM.toFixed(0)} mm
        </text>

        {/* Labels */}
        <text x={ox + plateW / 2} y={oy - 6} textAnchor="middle" fontSize="9" fill="#64748b">
          Cross-section
        </text>
        <text x={ox + 5} y={oy + 12} fontSize="8" fill="#22c55e">Top</text>
        <text x={ox + 5} y={oy + plateH - 4} fontSize="8" fill="#3b82f6">Bottom</text>
      </svg>
    );
  };

  // Summary table
  const renderSummary = () => {
    const rows = [
      { layer: 'Top X', enabled: topXEnabled, dia: topXDia, spacing: topXSpacing, cover: topXCover, As: topXAs },
      { layer: 'Top Y', enabled: topYEnabled, dia: topYDia, spacing: topYSpacing, cover: topYCover, As: topYAs },
      { layer: 'Bottom X', enabled: bottomXEnabled, dia: bottomXDia, spacing: bottomXSpacing, cover: bottomXCover, As: bottomXAs },
      { layer: 'Bottom Y', enabled: bottomYEnabled, dia: bottomYDia, spacing: bottomYSpacing, cover: bottomYCover, As: bottomYAs },
    ].filter(r => r.enabled);

    if (rows.length === 0) {
      return <div className="reinforcement-summary-empty">No reinforcement defined</div>;
    }

    return (
      <table className="reinforcement-summary-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Dia</th>
            <th>Spacing</th>
            <th>Cover</th>
            <th>As</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.layer}>
              <td>{r.layer}</td>
              <td>{r.dia} mm</td>
              <td>{r.spacing} mm</td>
              <td>{r.cover} mm</td>
              <td>{r.As.toFixed(0)} mm²/m</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  if (!plate) {
    return (
      <>
        <div className="reinforcement-overlay" onClick={onClose} />
        <div className="reinforcement-dialog">
          <div className="reinforcement-dialog-header">
            <span>Plate Reinforcement</span>
            <button onClick={onClose}><X size={14} /></button>
          </div>
          <div className="reinforcement-dialog-body">
            <p>Plate not found.</p>
          </div>
        </div>
      </>
    );
  }

  const renderMeshRow = (
    label: string,
    enabled: boolean,
    setEnabled: (v: boolean) => void,
    dia: number, setDia: (v: number) => void,
    spacing: number, setSpacing: (v: number) => void,
    cover: number, setCover: (v: number) => void,
    As: number,
    colorClass: string
  ) => (
    <div className={`reinforcement-mesh-row ${enabled ? 'enabled' : 'disabled'}`}>
      <label className="reinforcement-checkbox">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span className={`reinforcement-label ${colorClass}`}>{label}</span>
      </label>
      <select value={dia} onChange={e => setDia(Number(e.target.value))} disabled={!enabled}>
        {BAR_DIAMETERS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={spacing} onChange={e => setSpacing(Number(e.target.value))} disabled={!enabled}>
        {SPACINGS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        type="number" min={20} max={100} step={5}
        value={cover} onChange={e => setCover(Number(e.target.value))}
        disabled={!enabled}
      />
      <span className="reinforcement-as">{enabled ? `${As.toFixed(0)} mm²/m` : '-'}</span>
    </div>
  );

  return (
    <>
      <div className="reinforcement-overlay" onClick={onClose} />
      <div className="reinforcement-dialog">
        <div className="reinforcement-dialog-header">
          <span>Plate Reinforcement — Plate #{plateId}</span>
          <button onClick={onClose}><X size={14} /></button>
        </div>

        <div className="reinforcement-dialog-body">
          <div className="reinforcement-layout">
            <div className="reinforcement-inputs">
              {/* Header row */}
              <div className="reinforcement-mesh-header">
                <span className="label-col">Layer</span>
                <span>Dia (mm)</span>
                <span>Spacing</span>
                <span>Cover</span>
                <span>As</span>
              </div>

              {/* Top layers */}
              <div className="reinforcement-section-title">Top Reinforcement</div>
              {renderMeshRow('X-direction', topXEnabled, setTopXEnabled, topXDia, setTopXDia, topXSpacing, setTopXSpacing, topXCover, setTopXCover, topXAs, 'top-color')}
              {renderMeshRow('Y-direction', topYEnabled, setTopYEnabled, topYDia, setTopYDia, topYSpacing, setTopYSpacing, topYCover, setTopYCover, topYAs, 'top-color')}

              {/* Bottom layers */}
              <div className="reinforcement-section-title">Bottom Reinforcement</div>
              {renderMeshRow('X-direction', bottomXEnabled, setBottomXEnabled, bottomXDia, setBottomXDia, bottomXSpacing, setBottomXSpacing, bottomXCover, setBottomXCover, bottomXAs, 'bottom-color')}
              {renderMeshRow('Y-direction', bottomYEnabled, setBottomYEnabled, bottomYDia, setBottomYDia, bottomYSpacing, setBottomYSpacing, bottomYCover, setBottomYCover, bottomYAs, 'bottom-color')}
            </div>

            <div className="reinforcement-preview">
              {renderPreview()}
            </div>
          </div>

          <div className="reinforcement-summary">
            <h4>Summary</h4>
            {renderSummary()}
          </div>
        </div>

        <div className="reinforcement-dialog-footer">
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={handleApply}>{t('common.apply')}</button>
        </div>
      </div>
    </>
  );
}
