import { useState, useMemo, Fragment } from 'react';
import { IBeamElement, IBeamSection, IBeamForces, IMaterial, ConnectionType, IDOFConnections, getDOFConnectionTypes } from '../../core/fem/types';
import { SectionPropertiesDialog } from '../SectionPropertiesDialog/SectionPropertiesDialog';
import { checkSteelSection, ISteelCheckResult } from '../../core/standards/SteelCheck';
import { STEEL_GRADES, ISteelGrade } from '../../core/standards/EurocodeNL';
import { SteelCheckReport } from '../SteelCheckReport/SteelCheckReport';
import './BarPropertiesDialog.css';

type BarDialogTab = 'properties' | 'en1993';

const CONNECTION_OPTIONS: { value: ConnectionType; label: string }[] = [
  { value: 'fixed', label: 'Fully Fixed' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'tension_only', label: 'Tension only' },
  { value: 'pressure_only', label: 'Pressure only' },
];

interface BarPropertiesDialogProps {
  beam: IBeamElement;
  length: number;
  material?: IMaterial;
  beamForces?: IBeamForces;
  onUpdate: (updates: Partial<IBeamElement>) => void;
  onClose: () => void;
}

export function BarPropertiesDialog({ beam, length, beamForces, onUpdate, onClose }: BarPropertiesDialogProps) {
  const [activeTab, setActiveTab] = useState<BarDialogTab>('properties');
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [section, setSection] = useState<IBeamSection>(beam.section);

  // Per-DOF connection type state
  const dofConns = getDOFConnectionTypes(beam);
  const [startConns, setStartConns] = useState<IDOFConnections>(dofConns.start);
  const [endConns, setEndConns] = useState<IDOFConnections>(dofConns.end);

  // EN 1993-1 tab state
  const [steelGradeName, setSteelGradeName] = useState('S355');
  const [lcrY, setLcrY] = useState(length.toFixed(3));
  const [lcrZ, setLcrZ] = useState(length.toFixed(3));
  const [showReport, setShowReport] = useState(false);

  const selectedGrade: ISteelGrade = useMemo(
    () => STEEL_GRADES.find(g => g.name === steelGradeName) || STEEL_GRADES[2],
    [steelGradeName]
  );

  // Cross-section classification (simplified for I-sections based on c/t ratios)
  const crossSectionClass = useMemo(() => {
    const profileEntry = beam.profileName || '';
    // Simplified classification based on available section moduli ratios
    // If Wply is available and > Wy, likely Class 1 or 2
    if (section.Wply && section.Wy) {
      const ratio = section.Wply / section.Wy;
      if (ratio >= 1.10) return 1;
      if (ratio >= 1.05) return 2;
      return 3;
    }
    // Default: Class 2 for standard hot-rolled sections
    if (profileEntry.includes('IPE') || profileEntry.includes('HEA') || profileEntry.includes('HEB')) {
      return 1; // Standard hot-rolled I-sections are usually Class 1 or 2
    }
    return 3; // Conservative default
  }, [section, beam.profileName]);

  // Steel check results
  const steelCheck: ISteelCheckResult | null = useMemo(() => {
    if (!beamForces) return null;
    const sectionProps = {
      A: section.A,
      I: section.Iy ?? section.I,
      h: section.h,
      Wel: section.Wy,
      profileName: beam.profileName,
    };
    return checkSteelSection(sectionProps, beamForces, selectedGrade);
  }, [section, beamForces, selectedGrade, beam.profileName]);

  const handleApply = () => {
    onUpdate({
      section,
      startConnections: startConns,
      endConnections: endConns,
      // Also update legacy formats for backward compatibility
      startConnection: startConns.Rz,
      endConnection: endConns.Rz,
      endReleases: {
        startMoment: startConns.Rz === 'hinge',
        endMoment: endConns.Rz === 'hinge',
        startAxial: startConns.Tx !== 'fixed',
        endAxial: endConns.Tx !== 'fixed',
        startShear: startConns.Tz !== 'fixed',
        endShear: endConns.Tz !== 'fixed',
      }
    });
    onClose();
  };

  if (showSectionPicker) {
    return (
      <SectionPropertiesDialog
        section={beam.profileName ? { name: beam.profileName, section } : undefined}
        onSave={(profileName, newSection) => {
          setSection(newSection);
          onUpdate({ profileName, section: newSection });
          setShowSectionPicker(false);
        }}
        onClose={() => setShowSectionPicker(false)}
      />
    );
  }

  const renderPropertiesTab = () => (
    <>
      <div className="bar-props-row">
        <span className="bar-props-label">ID</span>
        <span className="bar-props-value">{beam.id}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Length</span>
        <span className="bar-props-value">{length.toFixed(3)} m</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Nodes</span>
        <span className="bar-props-value">{beam.nodeIds[0]} — {beam.nodeIds[1]}</span>
      </div>

      {/* Section - simplified: Name, A, Iy only */}
      <div className="bar-props-section-title">Section</div>
      {beam.profileName && (
        <div className="bar-props-row">
          <span className="bar-props-label">Name</span>
          <span className="bar-props-value">{beam.profileName}</span>
        </div>
      )}
      <div className="bar-props-row">
        <span className="bar-props-label">A</span>
        <span className="bar-props-value">{(section.A * 1e6).toFixed(0)} mm²</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Iy</span>
        <span className="bar-props-value">{((section.Iy ?? section.I) * 1e12).toExponential(3)} mm⁴</span>
      </div>
      <button className="bar-props-change-btn" onClick={() => setShowSectionPicker(true)}>
        Change Section...
      </button>

      {/* Connection Type - per DOF */}
      <div className="bar-props-section-title">Connection Type</div>
      <div className="bar-props-dof-grid">
        <span className="bar-props-dof-header"></span>
        <span className="bar-props-dof-header">Start</span>
        <span className="bar-props-dof-header">End</span>
        {(['Tx', 'Tz', 'Rx', 'Rz'] as const).map(dof => (
          <Fragment key={dof}>
            <span className="bar-props-dof-label">{dof}</span>
            <select
              className="bar-props-select bar-props-select-compact"
              value={startConns[dof]}
              onChange={e => setStartConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType }))}
            >
              {CONNECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              className="bar-props-select bar-props-select-compact"
              value={endConns[dof]}
              onChange={e => setEndConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType }))}
            >
              {CONNECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Fragment>
        ))}
      </div>
    </>
  );

  const formatUC = (uc: number) => uc.toFixed(3);

  const renderEN1993Tab = () => (
    <>
      {/* Steel grade selector */}
      <div className="bar-props-section-title">Steel Grade</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Grade</span>
        <select
          className="bar-props-select"
          value={steelGradeName}
          onChange={e => setSteelGradeName(e.target.value)}
        >
          {STEEL_GRADES.map(g => (
            <option key={g.name} value={g.name}>{g.name}</option>
          ))}
        </select>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">f<sub>y</sub></span>
        <span className="bar-props-value">{selectedGrade.fy} MPa</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">f<sub>u</sub></span>
        <span className="bar-props-value">{selectedGrade.fu} MPa</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;<sub>M0</sub></span>
        <span className="bar-props-value">{selectedGrade.gammaM0.toFixed(2)}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;<sub>M1</sub></span>
        <span className="bar-props-value">{selectedGrade.gammaM1.toFixed(2)}</span>
      </div>

      {/* Cross-section classification */}
      <div className="bar-props-section-title">Cross-Section Classification</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Class</span>
        <span className={`bar-props-value bar-props-class bar-props-class-${crossSectionClass}`}>
          Class {crossSectionClass}
        </span>
      </div>

      {/* Buckling lengths */}
      <div className="bar-props-section-title">Buckling Length</div>
      <div className="bar-props-input-row">
        <span>Lcr,y (m)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={lcrY}
          onChange={e => setLcrY(e.target.value)}
        />
      </div>
      <div className="bar-props-input-row">
        <span>Lcr,z (m)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={lcrZ}
          onChange={e => setLcrZ(e.target.value)}
        />
      </div>

      {/* Unity Checks */}
      <div className="bar-props-section-title">Unity Checks (EN 1993-1-1)</div>
      {!steelCheck ? (
        <div className="bar-props-no-results">
          No analysis results available. Run the solver first.
        </div>
      ) : (
        <>
          <div className={`bar-props-status ${steelCheck.status === 'OK' ? 'pass' : 'fail'}`}>
            {steelCheck.status === 'OK' ? 'PASS' : 'FAIL'} — UC max = {formatUC(steelCheck.UC_max)}
            <span className="bar-props-status-governing">({steelCheck.governingCheck})</span>
          </div>

          <table className="bar-props-uc-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Ed</th>
                <th>Rd</th>
                <th>UC</th>
              </tr>
            </thead>
            <tbody>
              <tr className={steelCheck.UC_M > 1 ? 'uc-fail' : ''}>
                <td>Bending (M)</td>
                <td>{(steelCheck.MEd / 1000).toFixed(2)} kNm</td>
                <td>{(steelCheck.McRd / 1000).toFixed(2)} kNm</td>
                <td className="uc-value">{formatUC(steelCheck.UC_M)}</td>
              </tr>
              <tr className={steelCheck.UC_V > 1 ? 'uc-fail' : ''}>
                <td>Shear (V)</td>
                <td>{(steelCheck.VEd / 1000).toFixed(2)} kN</td>
                <td>{(steelCheck.VcRd / 1000).toFixed(2)} kN</td>
                <td className="uc-value">{formatUC(steelCheck.UC_V)}</td>
              </tr>
              <tr className={steelCheck.UC_N > 1 ? 'uc-fail' : ''}>
                <td>Normal (N)</td>
                <td>{(steelCheck.NEd / 1000).toFixed(2)} kN</td>
                <td>{(steelCheck.NcRd / 1000).toFixed(2)} kN</td>
                <td className="uc-value">{formatUC(steelCheck.UC_N)}</td>
              </tr>
              <tr className={steelCheck.UC_MN > 1 ? 'uc-fail' : ''}>
                <td>M+N (6.2.8)</td>
                <td></td>
                <td></td>
                <td className="uc-value">{formatUC(steelCheck.UC_MN)}</td>
              </tr>
              <tr className={steelCheck.UC_MV > 1 ? 'uc-fail' : ''}>
                <td>M+V (6.2.10)</td>
                <td></td>
                <td></td>
                <td className="uc-value">{formatUC(steelCheck.UC_MV)}</td>
              </tr>
            </tbody>
          </table>

          {/* Detailed report button */}
          <button
            className="bar-props-change-btn"
            style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}
            onClick={() => setShowReport(true)}
          >
            Detailed Report (with formulas)...
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="bar-props-overlay" onClick={onClose}>
      <div className="bar-props-dialog bar-props-dialog-tabbed" onClick={e => e.stopPropagation()}>
        <div className="bar-props-header">Bar Properties</div>
        <div className="bar-props-tabs">
          <button
            className={`bar-props-tab ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button
            className={`bar-props-tab ${activeTab === 'en1993' ? 'active' : ''}`}
            onClick={() => setActiveTab('en1993')}
          >
            EN 1993-1
          </button>
        </div>
        <div className="bar-props-body bar-props-body-scrollable">
          {activeTab === 'properties' && renderPropertiesTab()}
          {activeTab === 'en1993' && renderEN1993Tab()}
        </div>
        <div className="bar-props-footer">
          <button className="bar-props-btn cancel" onClick={onClose}>Cancel</button>
          <button className="bar-props-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
      {showReport && (
        <SteelCheckReport
          initialBeamId={beam.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
