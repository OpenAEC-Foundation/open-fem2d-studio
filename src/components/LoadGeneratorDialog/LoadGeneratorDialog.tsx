import { useState, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import { IBeamElement, StructuralElementType } from '../../core/fem/types';
import { ILoadCase, createLoadCase } from '../../core/fem/LoadCase';
import { calculateBeamLength, calculateBeamAngle } from '../../core/fem/Beam';
import './LoadGeneratorDialog.css';

interface LoadGeneratorDialogProps {
  onClose: () => void;
}

/** Human-readable labels for structural element types */
const ELEMENT_TYPE_LABELS: Record<StructuralElementType, string> = {
  none: 'None',
  roof_left: 'Roof (left slope)',
  roof_right: 'Roof (right slope)',
  flat_roof: 'Flat roof',
  facade_left: 'Facade (left)',
  facade_right: 'Facade (right)',
  floor: 'Floor',
  column: 'Column',
};

/** Wind pressure coefficients (Cpe) for simple structures per NEN-EN 1991-1-4 */
const WIND_CPE: Partial<Record<StructuralElementType, number>> = {
  facade_left: 0.8,    // windward wall: pressure
  facade_right: -0.5,  // leeward wall: suction
  roof_left: -0.9,     // windward roof slope: suction (for typical angles)
  roof_right: -0.5,    // leeward roof slope: suction
  flat_roof: -0.7,     // flat roof: suction
};

/** Snow shape coefficients (mu) per NEN-EN 1991-1-3 */
const SNOW_MU: Partial<Record<StructuralElementType, number>> = {
  roof_left: 0.8,
  roof_right: 0.8,
  flat_roof: 0.8,
};

interface BeamLoadPreview {
  beam: IBeamElement;
  length: number;
  angle: number;     // radians
  type: StructuralElementType;
  windLoad: number;  // kN/m in applicable direction
  snowLoad: number;  // kN/m perpendicular to roof / vertical
  liveLoad: number;  // kN/m vertical (floors only)
  loadCase: 'wind' | 'snow' | 'live';
  description: string;
}

export function LoadGeneratorDialog({ onClose }: LoadGeneratorDialogProps) {
  const { state, dispatch, pushUndo } = useFEM();

  // Input values (kN/m2)
  const [qp, setQp] = useState('0.78');           // peak velocity pressure
  const [sk, setSk] = useState('0.70');            // characteristic snow load
  const [qk, setQk] = useState('1.75');            // live load for floors
  const [tributaryWidth, setTributaryWidth] = useState('1.0');

  // Enable toggles
  const [enableWind, setEnableWind] = useState(true);
  const [enableSnow, setEnableSnow] = useState(true);
  const [enableLive, setEnableLive] = useState(true);

  const tw = parseFloat(tributaryWidth) || 1.0;
  const qpVal = parseFloat(qp) || 0;
  const skVal = parseFloat(sk) || 0;
  const qkVal = parseFloat(qk) || 0;

  // Collect beams with an elementType assigned
  const taggedBeams = useMemo(() => {
    const result: { beam: IBeamElement; length: number; angle: number }[] = [];
    for (const beam of state.mesh.beamElements.values()) {
      if (!beam.elementType || beam.elementType === 'none' || beam.elementType === 'column') continue;
      const n1 = state.mesh.getNode(beam.nodeIds[0]);
      const n2 = state.mesh.getNode(beam.nodeIds[1]);
      if (!n1 || !n2) continue;
      result.push({
        beam,
        length: calculateBeamLength(n1, n2),
        angle: calculateBeamAngle(n1, n2),
      });
    }
    return result;
  }, [state.mesh]);

  // Compute load previews
  const loadPreviews = useMemo(() => {
    const previews: BeamLoadPreview[] = [];

    for (const { beam, length, angle } of taggedBeams) {
      const elType = beam.elementType!;

      // Wind loads
      if (enableWind && qpVal > 0) {
        const cpe = WIND_CPE[elType];
        if (cpe !== undefined) {
          // Wind pressure: w = qp * Cpe * tributary_width (kN/m)
          const w = qpVal * cpe * tw;
          if (Math.abs(w) > 1e-6) {
            previews.push({
              beam,
              length,
              angle,
              type: elType,
              windLoad: w,
              snowLoad: 0,
              liveLoad: 0,
              loadCase: 'wind',
              description: `Wind qp=${qpVal} Cpe=${cpe} => ${w.toFixed(3)} kN/m`,
            });
          }
        }
      }

      // Snow loads (roofs only)
      if (enableSnow && skVal > 0) {
        const mu = SNOW_MU[elType];
        if (mu !== undefined) {
          // Snow: s = mu * sk * tributary_width (kN/m, projected horizontally)
          const s = mu * skVal * tw;
          if (Math.abs(s) > 1e-6) {
            previews.push({
              beam,
              length,
              angle,
              type: elType,
              windLoad: 0,
              snowLoad: s,
              liveLoad: 0,
              loadCase: 'snow',
              description: `Snow sk=${skVal} mu=${mu} => ${s.toFixed(3)} kN/m`,
            });
          }
        }
      }

      // Live load (floors only)
      if (enableLive && qkVal > 0 && elType === 'floor') {
        const q = qkVal * tw;
        previews.push({
          beam,
          length,
          angle,
          type: elType,
          windLoad: 0,
          snowLoad: 0,
          liveLoad: q,
          loadCase: 'live',
          description: `Live load qk=${qkVal} => ${q.toFixed(3)} kN/m`,
        });
      }
    }

    return previews;
  }, [taggedBeams, qpVal, skVal, qkVal, tw, enableWind, enableSnow, enableLive]);

  // Group previews by element type for display
  const groupedPreviews = useMemo(() => {
    const groups = new Map<StructuralElementType, BeamLoadPreview[]>();
    for (const p of loadPreviews) {
      if (!groups.has(p.type)) groups.set(p.type, []);
      groups.get(p.type)!.push(p);
    }
    return groups;
  }, [loadPreviews]);

  /** Find or create a load case by type */
  function findOrCreateLoadCase(type: ILoadCase['type'], name: string): number {
    const existing = state.loadCases.find(lc => lc.type === type);
    if (existing) return existing.id;

    // Create a new load case
    const maxId = state.loadCases.reduce((max, lc) => Math.max(max, lc.id), 0);
    const newId = maxId + 1;
    const newLC = createLoadCase(newId, name, type);
    dispatch({ type: 'SET_LOAD_CASES', payload: [...state.loadCases, newLC] });
    return newId;
  }

  /** Generate all loads */
  function handleGenerate() {
    if (loadPreviews.length === 0) return;

    pushUndo();

    // Find or create load cases
    const windLCId = enableWind && loadPreviews.some(p => p.loadCase === 'wind')
      ? findOrCreateLoadCase('wind', 'Wind Load (W)')
      : null;
    const snowLCId = enableSnow && loadPreviews.some(p => p.loadCase === 'snow')
      ? findOrCreateLoadCase('snow', 'Snow Load (S)')
      : null;
    const liveLCId = enableLive && loadPreviews.some(p => p.loadCase === 'live')
      ? findOrCreateLoadCase('live', 'Live Load (Q)')
      : null;

    for (const preview of loadPreviews) {
      let lcId: number | null = null;
      let qx = 0;
      let qy = 0;
      let coordSystem: 'local' | 'global' = 'global';

      if (preview.loadCase === 'wind' && windLCId !== null) {
        lcId = windLCId;
        const elType = preview.type;

        if (elType === 'facade_left' || elType === 'facade_right') {
          // Facades: horizontal wind pressure (global X)
          // facade_left: wind from left (positive X)
          // facade_right: wind pushes leftward on leeward side (suction pulls outward)
          if (elType === 'facade_left') {
            // Windward: pressure acts inward (positive X direction)
            qx = preview.windLoad * 1000; // convert kN/m to N/m
          } else {
            // Leeward: suction acts outward (negative X for right facade)
            qx = preview.windLoad * 1000;
          }
          qy = 0;
        } else {
          // Roofs: wind suction perpendicular to surface
          // Apply as local Y (perpendicular to beam), suction = negative qy
          coordSystem = 'local';
          qx = 0;
          qy = preview.windLoad * 1000;
        }
      } else if (preview.loadCase === 'snow' && snowLCId !== null) {
        lcId = snowLCId;
        // Snow load acts vertically downward (global Y negative)
        qx = 0;
        qy = -preview.snowLoad * 1000; // convert kN/m to N/m, negative = downward
        coordSystem = 'global';
      } else if (preview.loadCase === 'live' && liveLCId !== null) {
        lcId = liveLCId;
        // Floor live load acts vertically downward
        qx = 0;
        qy = -preview.liveLoad * 1000; // convert kN/m to N/m, negative = downward
        coordSystem = 'global';
      }

      if (lcId !== null) {
        dispatch({
          type: 'ADD_DISTRIBUTED_LOAD',
          payload: {
            lcId,
            beamId: preview.beam.id,
            qx,
            qy,
            coordSystem,
            description: preview.description,
          },
        });
      }
    }

    dispatch({ type: 'REFRESH_MESH' });
    onClose();
  }

  const totalLoads = loadPreviews.length;

  return (
    <div className="loadgen-overlay" onClick={onClose}>
      <div className="loadgen-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="loadgen-header">
          <span>Load Generator (EC-NL)</span>
          <button className="loadgen-close-x" onClick={onClose} title="Close">&times;</button>
        </div>

        {/* Body */}
        <div className="loadgen-body">
          {/* Wind Load Section */}
          <div className="loadgen-section">
            <div className="loadgen-section-title">Wind Load</div>
            <p className="loadgen-section-info">Based on NEN-EN 1991-1-4</p>
            <label className="loadgen-toggle">
              <input
                type="checkbox"
                checked={enableWind}
                onChange={e => setEnableWind(e.target.checked)}
              />
              Enable wind load generation
            </label>
            <div className="loadgen-input-row">
              <label>q<sub>p</sub> (peak velocity)</label>
              <input
                type="text"
                value={qp}
                onChange={e => setQp(e.target.value)}
                onFocus={e => e.target.select()}
                disabled={!enableWind}
              />
              <span className="loadgen-input-unit">kN/m&sup2;</span>
            </div>
          </div>

          {/* Snow Load Section */}
          <div className="loadgen-section">
            <div className="loadgen-section-title">Snow Load</div>
            <p className="loadgen-section-info">Based on NEN-EN 1991-1-3</p>
            <label className="loadgen-toggle">
              <input
                type="checkbox"
                checked={enableSnow}
                onChange={e => setEnableSnow(e.target.checked)}
              />
              Enable snow load generation
            </label>
            <div className="loadgen-input-row">
              <label>s<sub>k</sub> (characteristic)</label>
              <input
                type="text"
                value={sk}
                onChange={e => setSk(e.target.value)}
                onFocus={e => e.target.select()}
                disabled={!enableSnow}
              />
              <span className="loadgen-input-unit">kN/m&sup2;</span>
            </div>
          </div>

          {/* Live Load Section */}
          <div className="loadgen-section">
            <div className="loadgen-section-title">Live Load (Floor)</div>
            <p className="loadgen-section-info">Based on NEN-EN 1991-1-1</p>
            <label className="loadgen-toggle">
              <input
                type="checkbox"
                checked={enableLive}
                onChange={e => setEnableLive(e.target.checked)}
              />
              Enable live load generation
            </label>
            <div className="loadgen-input-row">
              <label>q<sub>k</sub> (characteristic)</label>
              <input
                type="text"
                value={qk}
                onChange={e => setQk(e.target.value)}
                onFocus={e => e.target.select()}
                disabled={!enableLive}
              />
              <span className="loadgen-input-unit">kN/m&sup2;</span>
            </div>
          </div>

          {/* Tributary Width */}
          <div className="loadgen-section">
            <div className="loadgen-section-title">Tributary Width</div>
            <div className="loadgen-input-row">
              <label>Tributary width</label>
              <input
                type="text"
                value={tributaryWidth}
                onChange={e => setTributaryWidth(e.target.value)}
                onFocus={e => e.target.select()}
              />
              <span className="loadgen-input-unit">m</span>
            </div>
          </div>

          {/* Preview Section */}
          <div className="loadgen-section">
            <div className="loadgen-section-title">Preview</div>
            {taggedBeams.length === 0 ? (
              <div className="loadgen-empty">
                No beams with element type assigned.<br />
                Set element types in Bar Properties first.
              </div>
            ) : loadPreviews.length === 0 ? (
              <div className="loadgen-empty">
                No loads to generate. Enable at least one load type and enter non-zero values.
              </div>
            ) : (
              <>
                <table className="loadgen-preview-table">
                  <thead>
                    <tr>
                      <th>Beam</th>
                      <th>Type</th>
                      <th>Load Case</th>
                      <th className="num">q (kN/m)</th>
                      <th className="num">L (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(groupedPreviews.entries()).map(([elType, previews]) => (
                      <>
                        <tr key={`group-${elType}`} className="loadgen-group-header">
                          <td colSpan={5}>{ELEMENT_TYPE_LABELS[elType]}</td>
                        </tr>
                        {previews.map((p, idx) => {
                          const loadValue = p.loadCase === 'wind' ? p.windLoad
                            : p.loadCase === 'snow' ? p.snowLoad
                            : p.liveLoad;
                          return (
                            <tr key={`${elType}-${p.beam.id}-${p.loadCase}-${idx}`}>
                              <td>{p.beam.id}</td>
                              <td className="type-cell">{p.loadCase}</td>
                              <td>{p.description}</td>
                              <td className="num">{loadValue.toFixed(3)}</td>
                              <td className="num">{p.length.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
                <div className="loadgen-summary">
                  Total: <strong>{totalLoads}</strong> distributed load{totalLoads !== 1 ? 's' : ''} on{' '}
                  <strong>{new Set(loadPreviews.map(p => p.beam.id)).size}</strong> beam{new Set(loadPreviews.map(p => p.beam.id)).size !== 1 ? 's' : ''}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="loadgen-footer">
          <span className="loadgen-footer-info">
            Loads are added as distributed loads in separate load cases
          </span>
          <div className="loadgen-footer-buttons">
            <button className="loadgen-btn cancel" onClick={onClose}>Cancel</button>
            <button
              className="loadgen-btn generate"
              onClick={handleGenerate}
              disabled={loadPreviews.length === 0}
            >
              Generate ({totalLoads})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
