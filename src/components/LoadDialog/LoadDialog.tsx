import { useState } from 'react';
import { ILoadCase } from '../../core/fem/LoadCase';
import './LoadDialog.css';

interface LoadDialogProps {
  initialFx: number;
  initialFy: number;
  initialMoment: number;
  loadCases: ILoadCase[];
  activeLoadCase: number;
  onApply: (fx: number, fy: number, moment: number, lcId: number, beamId?: number, position?: number) => void;
  onCancel: () => void;
  // For beam point loads
  beamId?: number;
  beamLength?: number;   // Length of beam in meters (for display)
  initialPosition?: number;  // 0-1 fraction along beam
}

export function LoadDialog({ initialFx, initialFy, initialMoment, loadCases, activeLoadCase, onApply, onCancel, beamId, beamLength, initialPosition }: LoadDialogProps) {
  // Display in kN / kNm
  const [fx, setFx] = useState((initialFx / 1000).toString());
  const [fz, setFz] = useState((initialFy / 1000).toString());
  const [moment, setMoment] = useState((initialMoment / 1000).toString());
  const [selectedLC, setSelectedLC] = useState(activeLoadCase);
  const [position, setPosition] = useState(initialPosition !== undefined ? (initialPosition * 100).toFixed(1) : '50.0');

  const isBeamLoad = beamId !== undefined;

  const handleApply = () => {
    const fxVal = parseFloat(fx);
    const fzVal = parseFloat(fz);
    const mVal = parseFloat(moment);
    if (isNaN(fxVal) || isNaN(fzVal) || isNaN(mVal)) return;

    if (isBeamLoad) {
      const posVal = parseFloat(position) / 100;
      if (isNaN(posVal) || posVal < 0 || posVal > 1) return;
      // Convert back to N / Nm
      onApply(fxVal * 1000, fzVal * 1000, mVal * 1000, selectedLC, beamId, posVal);
    } else {
      // Convert back to N / Nm
      onApply(fxVal * 1000, fzVal * 1000, mVal * 1000, selectedLC);
    }
  };

  const distanceFromStart = isBeamLoad && beamLength ? (parseFloat(position) / 100 * beamLength) : null;

  return (
    <div className="load-dialog-overlay" onClick={onCancel}>
      <div className="load-dialog" onClick={e => e.stopPropagation()}>
        <div className="load-dialog-header">{isBeamLoad ? 'Point Load on Beam' : 'Point Load'}</div>
        <div className="load-dialog-body">
          <label>
            <span>Load Case</span>
            <select
              className="load-dialog-select"
              value={selectedLC}
              onChange={e => setSelectedLC(parseInt(e.target.value))}
            >
              {loadCases.map(lc => (
                <option key={lc.id} value={lc.id}>{lc.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Fx (kN)</span>
            <input
              type="text"
              value={fx}
              onChange={e => setFx(e.target.value)}
              autoFocus
              onFocus={e => e.target.select()}
            />
          </label>
          <label>
            <span>Fz (kN)</span>
            <input
              type="text"
              value={fz}
              onChange={e => setFz(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </label>
          <label>
            <span>M (kNm)</span>
            <input
              type="text"
              value={moment}
              onChange={e => setMoment(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </label>
          {isBeamLoad && (
            <label>
              <span>Position (%)</span>
              <input
                type="text"
                value={position}
                onChange={e => setPosition(e.target.value)}
                onFocus={e => e.target.select()}
              />
              {distanceFromStart !== null && (
                <span className="load-dialog-distance">
                  = {distanceFromStart >= 1 ? `${distanceFromStart.toFixed(3)} m` : `${(distanceFromStart * 1000).toFixed(0)} mm`} from start
                </span>
              )}
            </label>
          )}
          <p className="load-dialog-hint">
            Positive Fz = upward, positive Fx = rightward
            {isBeamLoad && <><br/>Position: 0% = start node, 100% = end node</>}
          </p>
        </div>
        <div className="load-dialog-footer">
          <button className="load-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="load-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
    </div>
  );
}
