import { useState, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import { STEEL_GRADES, ISteelGrade } from '../../core/standards/EurocodeNL';
import { checkAllBeams, ISectionProperties, ISteelCheckResult } from '../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../core/fem/Beam';
import { SteelCheckReport } from '../SteelCheckReport/SteelCheckReport';
import './SteelCheckPanel.css';

interface SteelCheckPanelProps {
  onClose: () => void;
}

export function SteelCheckPanel({ onClose }: SteelCheckPanelProps) {
  const { state } = useFEM();
  const { mesh, result, forceUnit } = state;
  const [gradeIdx, setGradeIdx] = useState(2); // Default S355
  const [deflLimitDivisor, setDeflLimitDivisor] = useState(250);
  const [showReport, setShowReport] = useState(false);
  const [reportBeamId, setReportBeamId] = useState<number | undefined>(undefined);
  const grade: ISteelGrade = STEEL_GRADES[gradeIdx];

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

  const results = useMemo<ISteelCheckResult[]>(() => {
    if (!result || !result.beamForces || result.beamForces.size === 0) return [];

    // Build section map from mesh beam elements
    const sectionMap = new Map<number, ISectionProperties>();
    const beamLengths = new Map<number, number>();
    const beamDeflections = new Map<number, number>();

    for (const beam of mesh.beamElements.values()) {
      // Look up section properties including Iz from the section catalog
      const sectionFromCatalog = mesh.sections.get(beam.profileName || '');

      sectionMap.set(beam.id, {
        A: beam.section.A,
        I: beam.section.I,
        h: beam.section.h,
        Iz: sectionFromCatalog?.Iz ?? beam.section.Iz,
        profileName: beam.profileName,
      });

      // Calculate beam length
      const n1 = mesh.nodes.get(beam.nodeIds[0]);
      const n2 = mesh.nodes.get(beam.nodeIds[1]);
      if (n1 && n2) {
        const L = calculateBeamLength(n1, n2);
        beamLengths.set(beam.id, L);

        // Calculate max vertical deflection along the beam
        // For frame analysis: displacements array is [u1, v1, theta1, u2, v2, theta2, ...]
        // We need the vertical (v) displacement for nodes of this beam
        // Use the transverse displacements relative to the beam endpoints
        if (result.displacements && result.displacements.length > 0) {
          const dofsPerNode = state.analysisType === 'frame' ? 3 : 2;
          // Build nodeIdToIndex map for displacement lookup
          let nodeIndex1 = -1;
          let nodeIndex2 = -1;
          let idx = 0;
          for (const nodeId of mesh.nodes.keys()) {
            if (nodeId === beam.nodeIds[0]) nodeIndex1 = idx;
            if (nodeId === beam.nodeIds[1]) nodeIndex2 = idx;
            idx++;
          }

          if (nodeIndex1 >= 0 && nodeIndex2 >= 0) {
            // Get vertical displacements at beam endpoints
            const v1 = result.displacements[nodeIndex1 * dofsPerNode + 1] || 0;
            const v2 = result.displacements[nodeIndex2 * dofsPerNode + 1] || 0;

            // Average support displacement (chord line)
            const vAvg = (v1 + v2) / 2;

            // The max deflection relative to the chord is the max displacement
            // minus the interpolated chord displacement.
            // For beams with intermediate nodes, we would check those too.
            // Since we only have end nodes, use the beam forces to estimate mid-span deflection.
            // For a simply-supported beam: delta_max ~ 5*q*L^4/(384*EI) but we can
            // also check the difference between mid-span and chord.
            //
            // Better approach: use end displacements to compute relative deflection.
            // The relative deflection at midpoint of the chord = |v_mid - (v1+v2)/2|
            // For Euler-Bernoulli beams, we can interpolate using the shape functions.
            // v(x) = N1*v1 + N2*theta1 + N3*v2 + N4*theta2 at x = L/2

            if (dofsPerNode === 3) {
              const theta1 = result.displacements[nodeIndex1 * dofsPerNode + 2] || 0;
              const theta2 = result.displacements[nodeIndex2 * dofsPerNode + 2] || 0;

              // Hermite shape functions at x = L/2 (xi = 0.5)
              const xi = 0.5;
              const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;   // = 0.5
              const N2 = L * xi * (1 - xi) * (1 - xi);          // = L * 0.125
              const N3 = 3 * xi * xi - 2 * xi * xi * xi;        // = 0.5
              const N4 = L * xi * xi * (xi - 1);                 // = -L * 0.125

              const vMid = N1 * v1 + N2 * theta1 + N3 * v2 + N4 * theta2;

              // Relative deflection = displacement at mid minus chord
              const relativeDeflection = Math.abs(vMid - vAvg);
              beamDeflections.set(beam.id, relativeDeflection);
            } else {
              // For 2-DOF analysis, just use the difference from average
              const relativeDeflection = Math.abs(v1 - vAvg);
              beamDeflections.set(beam.id, relativeDeflection);
            }
          }
        }
      }
    }

    return checkAllBeams(result.beamForces, sectionMap, grade, beamLengths, beamDeflections, deflLimitDivisor);
  }, [result, mesh, grade, deflLimitDivisor, state.analysisType]);

  const allOk = results.every(r => r.status === 'OK');
  const worstUC = results.length > 0 ? Math.max(...results.map(r => r.UC_max)) : 0;

  function UCBar({ value }: { value: number }) {
    const pct = Math.min(value * 100, 100);
    const bgColor = value <= 0.85 ? 'var(--success)' : value <= 1.0 ? 'var(--warning)' : '#ef4444';
    return (
      <span className="uc-bar">
        <span className="uc-bar-track">
          <span className="uc-bar-fill" style={{ width: `${pct}%`, background: bgColor }} />
        </span>
        <span className={`uc-value ${ucClass(value)}`}>{value.toFixed(2)}</span>
      </span>
    );
  }

  /** Return CSS class for a UC value */
  function ucClass(value: number): string {
    if (value <= 0) return 'uc-na';
    if (value <= 0.85) return 'uc-ok';
    if (value <= 1.0) return 'uc-warn';
    return 'uc-fail';
  }

  /** Render a UC cell with color coding; gray if not applicable (value === 0) */
  function UCCell({ value, isGoverning }: { value: number; isGoverning: boolean }) {
    const cls = ucClass(value);
    return (
      <td className={`uc-cell ${cls} ${isGoverning ? 'uc-governing' : ''}`}>
        {value > 0 ? value.toFixed(2) : '\u2014'}
      </td>
    );
  }

  return (
    <div className="steel-check-overlay" onClick={onClose}>
      <div className="steel-check-dialog" onClick={e => e.stopPropagation()}>
        <div className="steel-check-header">
          <span>Steel Section Check — EN 1993-1-1</span>
          <div className="steel-check-controls">
            <select
              className="steel-check-grade-select"
              value={gradeIdx}
              onChange={e => setGradeIdx(parseInt(e.target.value))}
            >
              {STEEL_GRADES.map((g, i) => (
                <option key={g.name} value={i}>{g.name} (fy={g.fy} MPa)</option>
              ))}
            </select>
            <label className="defl-limit-label">
              L/
              <input
                type="number"
                className="defl-limit-input"
                value={deflLimitDivisor}
                min={100}
                max={1000}
                step={50}
                onChange={e => setDeflLimitDivisor(parseInt(e.target.value) || 250)}
              />
            </label>
          </div>
        </div>
        <div className="steel-check-body">
          {results.length === 0 ? (
            <div className="steel-check-no-result">
              Run the analysis first to see steel section check results.
            </div>
          ) : (
            <table className="steel-check-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Profile</th>
                  <th>N<sub>Ed</sub> ({forceUnit})</th>
                  <th>V<sub>Ed</sub> ({forceUnit})</th>
                  <th>M<sub>Ed</sub> ({forceUnit}m)</th>
                  <th title="UC Buiging — MEd / Mc,Rd (6.2.5)">UC Buiging</th>
                  <th title="UC Kip — MEd / Mb,Rd (6.3.2 LTB)">UC Kip</th>
                  <th title="UC Doorbuiging — delta / delta_limit (SLS)">UC Doorb.</th>
                  <th title="UC Knik — NEd / Nb,Rd (6.3.1)">UC Knik</th>
                  <th>UC max</th>
                  <th>Governing</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => {
                  // Determine which check is governing for highlighting
                  const governingMap: Record<string, string> = {
                    'Bending (6.2.5)': 'bending',
                    'LTB (6.3.2)': 'ltb',
                    'Deflection (SLS)': 'deflection',
                    'Buckling (6.3.1)': 'buckling',
                  };
                  const gov = governingMap[r.governingCheck] || '';

                  return (
                    <tr
                      key={r.elementId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setReportBeamId(r.elementId); setShowReport(true); }}
                      title="Click to open detailed report"
                    >
                      <td>{r.elementId}</td>
                      <td>{r.profileName}</td>
                      <td>{formatForce(r.NEd)}</td>
                      <td>{formatForce(r.VEd)}</td>
                      <td>{formatMoment(r.MEd)}</td>
                      <UCCell value={r.UC_M} isGoverning={gov === 'bending'} />
                      <UCCell value={r.UC_LTB} isGoverning={gov === 'ltb'} />
                      <UCCell value={r.UC_deflection} isGoverning={gov === 'deflection'} />
                      <UCCell value={r.UC_buckling} isGoverning={gov === 'buckling'} />
                      <td><UCBar value={r.UC_max} /></td>
                      <td className="governing-label">{r.governingCheck}</td>
                      <td style={{ color: r.status === 'OK' ? 'var(--success)' : '#ef4444', fontWeight: 600 }}>
                        {r.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="steel-check-footer">
          <span className="summary">
            {results.length > 0 && (
              <>
                {results.length} members checked | Max UC: {worstUC.toFixed(2)} |{' '}
                <span style={{ color: allOk ? 'var(--success)' : '#ef4444', fontWeight: 600 }}>
                  {allOk ? 'All OK' : 'FAIL'}
                </span>
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {results.length > 0 && (
              <button
                onClick={() => { setReportBeamId(undefined); setShowReport(true); }}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
              >
                Generate Report
              </button>
            )}
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
      {showReport && (
        <SteelCheckReport
          initialBeamId={reportBeamId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
