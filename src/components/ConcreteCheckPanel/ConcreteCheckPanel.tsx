import { useState, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import {
  CONCRETE_GRADES, REINFORCEMENT_GRADES,
  checkConcreteSection, IConcreteSection, IConcreteCheckResult
} from '../../core/standards/ConcreteCheck';
import './ConcreteCheckPanel.css';

interface ConcreteCheckPanelProps {
  onClose: () => void;
}

export function ConcreteCheckPanel({ onClose }: ConcreteCheckPanelProps) {
  const { state } = useFEM();
  const { result, forceUnit } = state;

  const [concreteIdx, setConcreteIdx] = useState(2); // C30/37
  const [rebarIdx, setRebarIdx] = useState(0); // B500B
  const [bMm, setBMm] = useState(300); // width in mm
  const [hMm, setHMm] = useState(500); // height in mm
  const [coverMm, setCoverMm] = useState(30); // cover in mm

  const concrete = CONCRETE_GRADES[concreteIdx];
  const rebar = REINFORCEMENT_GRADES[rebarIdx];

  const section: IConcreteSection = {
    b: bMm / 1000,
    h: hMm / 1000,
    d: (hMm - coverMm - 16) / 1000, // assume φ16 main bar + cover
    cover: coverMm,
  };

  const formatForce = (n: number): string => {
    if (forceUnit === 'MN') return (n / 1e6).toFixed(3);
    if (forceUnit === 'kN') return (n / 1000).toFixed(1);
    return n.toFixed(0);
  };

  const formatMoment = (nm: number): string => {
    if (forceUnit === 'MN') return (nm / 1e6).toFixed(4);
    if (forceUnit === 'kN') return (nm / 1000).toFixed(2);
    return nm.toFixed(0);
  };

  const results = useMemo<IConcreteCheckResult[]>(() => {
    if (!result || !result.beamForces || result.beamForces.size === 0) return [];

    const checks: IConcreteCheckResult[] = [];
    for (const forces of result.beamForces.values()) {
      checks.push(checkConcreteSection(section, forces, concrete, rebar));
    }
    return checks;
  }, [result, section, concrete, rebar]);

  return (
    <div className="concrete-check-overlay" onClick={onClose}>
      <div className="concrete-check-dialog" onClick={e => e.stopPropagation()}>
        <div className="concrete-check-header">
          <span>Concrete Check — EN 1992-1-1</span>
          <select value={concreteIdx} onChange={e => setConcreteIdx(parseInt(e.target.value))}>
            {CONCRETE_GRADES.map((g, i) => (
              <option key={g.name} value={i}>{g.name}</option>
            ))}
          </select>
          <select value={rebarIdx} onChange={e => setRebarIdx(parseInt(e.target.value))}>
            {REINFORCEMENT_GRADES.map((g, i) => (
              <option key={g.name} value={i}>{g.name}</option>
            ))}
          </select>
          <div className="section-inputs">
            <label>b: <input type="number" value={bMm} onChange={e => setBMm(parseInt(e.target.value) || 300)} /> mm</label>
            <label>h: <input type="number" value={hMm} onChange={e => setHMm(parseInt(e.target.value) || 500)} /> mm</label>
            <label>c: <input type="number" value={coverMm} onChange={e => setCoverMm(parseInt(e.target.value) || 30)} /> mm</label>
          </div>
        </div>
        <div className="concrete-check-body">
          {results.length === 0 ? (
            <div className="concrete-check-no-result">
              Run the analysis first to see concrete design results.
            </div>
          ) : (
            <table className="concrete-check-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>M<sub>Ed</sub> ({forceUnit}m)</th>
                  <th>V<sub>Ed</sub> ({forceUnit})</th>
                  <th>μ</th>
                  <th>A<sub>s,req</sub> (mm²)</th>
                  <th>A<sub>s,min</sub> (mm²)</th>
                  <th>Reinforcement</th>
                  <th>V<sub>Rd,c</sub> ({forceUnit})</th>
                  <th>w<sub>k</sub> (mm)</th>
                  <th>UC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.elementId}>
                    <td>{r.elementId}</td>
                    <td>{formatMoment(r.MEd)}</td>
                    <td>{formatForce(r.VEd)}</td>
                    <td>{r.mu.toFixed(3)}</td>
                    <td>{r.AsReq.toFixed(0)}</td>
                    <td>{r.AsMin.toFixed(0)}</td>
                    <td style={{ textAlign: 'left' }}>{r.AsProvided}</td>
                    <td>{formatForce(r.VRdc)}</td>
                    <td style={{
                      color: r.crackWidth
                        ? (r.crackWidth.wk <= r.crackWidth.wkLimit ? 'var(--success)' : '#ef4444')
                        : 'var(--text-secondary)',
                      fontWeight: 500
                    }}>
                      {r.crackWidth ? r.crackWidth.wk.toFixed(2) : '—'}
                    </td>
                    <td style={{ color: r.UC_M <= 0.85 ? 'var(--success)' : r.UC_M <= 1.0 ? 'var(--warning)' : '#ef4444', fontWeight: 600 }}>
                      {r.UC_M.toFixed(2)}
                    </td>
                    <td style={{
                      color: r.status === 'OK' ? 'var(--success)' : r.status === 'WARN' ? 'var(--warning)' : '#ef4444',
                      fontWeight: 600
                    }}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="concrete-check-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
