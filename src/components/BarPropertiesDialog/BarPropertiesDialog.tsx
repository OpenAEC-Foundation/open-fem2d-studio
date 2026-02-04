import { useState, useMemo } from 'react';
import { IBeamElement, IBeamSection, IBeamForces, IMaterial, DofConstraintType, IDofConstraint } from '../../core/fem/types';
import { SectionPropertiesDialog } from '../SectionPropertiesDialog/SectionPropertiesDialog';
import { checkSteelSection, ISteelCheckResult } from '../../core/standards/SteelCheck';
import { STEEL_GRADES, ISteelGrade } from '../../core/standards/EurocodeNL';
import { SteelCheckReport } from '../SteelCheckReport/SteelCheckReport';
import './BarPropertiesDialog.css';

type BarDialogTab = 'properties' | 'en1993';

// DOF constraint options
const DOF_OPTIONS: { value: DofConstraintType; label: string; description: string }[] = [
  { value: ' ', label: ' ', description: 'Free - no limitation' },
  { value: 'A', label: 'A', description: 'Fully limited (Absolute)' },
  { value: 'P', label: 'P', description: 'Limited for Positive reaction' },
  { value: 'N', label: 'N', description: 'Limited for Negative reaction' },
  { value: 'S', label: 'S', description: 'Spring' },
];

// Default constraint (fixed/absolute)
const defaultConstraint = (): IDofConstraint => ({ type: 'A' });

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

  // Initialize DOF constraints from beam or default to 'A' (Absolute/fixed)
  const getInitialConstraint = (end: 'start' | 'end', dof: 'Tx' | 'Tz' | 'Rx' | 'Rz'): IDofConstraint => {
    if (beam.dofConstraints?.[end]?.[dof]) {
      return beam.dofConstraints[end][dof];
    }
    // Legacy conversion from old boolean releases
    if (beam.endReleases) {
      if (end === 'start') {
        if (dof === 'Rz' && beam.endReleases.startMoment) return { type: ' ' };
        if (dof === 'Tx' && beam.endReleases.startAxial) return { type: ' ' };
        if (dof === 'Tz' && beam.endReleases.startShear) return { type: ' ' };
      } else {
        if (dof === 'Rz' && beam.endReleases.endMoment) return { type: ' ' };
        if (dof === 'Tx' && beam.endReleases.endAxial) return { type: ' ' };
        if (dof === 'Tz' && beam.endReleases.endShear) return { type: ' ' };
      }
    }
    return defaultConstraint();
  };

  // DOF constraint states
  const [startTx, setStartTx] = useState<IDofConstraint>(getInitialConstraint('start', 'Tx'));
  const [startTz, setStartTz] = useState<IDofConstraint>(getInitialConstraint('start', 'Tz'));
  const [startRx, setStartRx] = useState<IDofConstraint>(getInitialConstraint('start', 'Rx'));
  const [startRz, setStartRz] = useState<IDofConstraint>(getInitialConstraint('start', 'Rz'));
  const [endTx, setEndTx] = useState<IDofConstraint>(getInitialConstraint('end', 'Tx'));
  const [endTz, setEndTz] = useState<IDofConstraint>(getInitialConstraint('end', 'Tz'));
  const [endRx, setEndRx] = useState<IDofConstraint>(getInitialConstraint('end', 'Rx'));
  const [endRz, setEndRz] = useState<IDofConstraint>(getInitialConstraint('end', 'Rz'));

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

  // Preset functions
  const setAllFixed = () => {
    const fixed: IDofConstraint = { type: 'A' };
    setStartTx(fixed); setStartTz(fixed); setStartRx(fixed); setStartRz(fixed);
    setEndTx(fixed); setEndTz(fixed); setEndRx(fixed); setEndRz(fixed);
  };

  const setAllFree = () => {
    const free: IDofConstraint = { type: ' ' };
    setStartTx(free); setStartTz(free); setStartRx(free); setStartRz(free);
    setEndTx(free); setEndTz(free); setEndRx(free); setEndRz(free);
  };

  const applyHingePreset = () => {
    // Hinge: moment (Rz) free at both ends, rest fixed
    const fixed: IDofConstraint = { type: 'A' };
    const free: IDofConstraint = { type: ' ' };
    setStartTx(fixed); setStartTz(fixed); setStartRx(fixed); setStartRz(free);
    setEndTx(fixed); setEndTz(fixed); setEndRx(fixed); setEndRz(free);
  };

  const handleApply = () => {
    onUpdate({
      section,
      dofConstraints: {
        start: { Tx: startTx, Tz: startTz, Rx: startRx, Rz: startRz },
        end: { Tx: endTx, Tz: endTz, Rx: endRx, Rz: endRz },
      },
      // Also update legacy format for backward compatibility
      endReleases: {
        startMoment: startRz.type === ' ',
        endMoment: endRz.type === ' ',
        startAxial: startTx.type === ' ',
        endAxial: endTx.type === ' ',
        startShear: startTz.type === ' ',
        endShear: endTz.type === ' ',
      }
    });
    onClose();
  };

  if (showSectionPicker) {
    return (
      <SectionPropertiesDialog
        isNew
        onSave={(profileName, newSection) => {
          setSection(newSection);
          onUpdate({ profileName });
          setShowSectionPicker(false);
        }}
        onClose={() => setShowSectionPicker(false)}
      />
    );
  }

  // Helper to render a DOF constraint dropdown with optional spring input
  const renderDofSelect = (
    value: IDofConstraint,
    onChange: (c: IDofConstraint) => void
  ) => (
    <div className="bar-props-dof-cell">
      <select
        className="bar-props-dof-select"
        value={value.type}
        onChange={e => onChange({ type: e.target.value as DofConstraintType, springValue: value.springValue })}
        title={DOF_OPTIONS.find(o => o.value === value.type)?.description}
      >
        {DOF_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value} title={opt.description}>
            {opt.label}
          </option>
        ))}
      </select>
      {value.type === 'S' && (
        <input
          type="number"
          className="bar-props-spring-input"
          placeholder="k"
          value={value.springValue ?? ''}
          onChange={e => onChange({ type: 'S', springValue: parseFloat(e.target.value) || 0 })}
          title="Spring stiffness (N/m or Nm/rad)"
        />
      )}
    </div>
  );

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

      {/* DOF Constraints */}
      <div className="bar-props-section-title">DOF Constraints</div>
      <div className="bar-props-preset-row">
        <button className="bar-props-preset-btn" onClick={setAllFixed} title="All DOFs fixed (Absolute)">
          All Fixed
        </button>
        <button className="bar-props-preset-btn" onClick={setAllFree} title="All DOFs free">
          All Free
        </button>
        <button className="bar-props-preset-btn" onClick={applyHingePreset} title="Moment (Rz) free at both ends">
          Hinge
        </button>
      </div>

      <div className="bar-props-dof-legend">
        <span title="Free - no limitation">' ' Free</span>
        <span title="Fully limited (Absolute)">A Fixed</span>
        <span title="Limited for Positive reaction">P Pos</span>
        <span title="Limited for Negative reaction">N Neg</span>
        <span title="Spring">S Spring</span>
      </div>

      <div className="bar-props-dof-grid">
        <div className="bar-props-dof-header">
          <span></span>
          <span title="Translation X (axial)">Tx</span>
          <span title="Translation Z (shear)">Tz</span>
          <span title="Rotation about X (torsion)">Rx</span>
          <span title="Rotation about Z (moment)">Rz</span>
        </div>
        <div className="bar-props-dof-row">
          <span className="bar-props-dof-row-label">Start</span>
          {renderDofSelect(startTx, setStartTx)}
          {renderDofSelect(startTz, setStartTz)}
          {renderDofSelect(startRx, setStartRx)}
          {renderDofSelect(startRz, setStartRz)}
        </div>
        <div className="bar-props-dof-row">
          <span className="bar-props-dof-row-label">End</span>
          {renderDofSelect(endTx, setEndTx)}
          {renderDofSelect(endTz, setEndTz)}
          {renderDofSelect(endRx, setEndRx)}
          {renderDofSelect(endRz, setEndRz)}
        </div>
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
        <span className="bar-props-label">fy</span>
        <span className="bar-props-value">{selectedGrade.fy} MPa</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">fu</span>
        <span className="bar-props-value">{selectedGrade.fu} MPa</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;M0</span>
        <span className="bar-props-value">{selectedGrade.gammaM0.toFixed(2)}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;M1</span>
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
