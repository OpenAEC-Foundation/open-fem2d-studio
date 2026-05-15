import React, { useState } from 'react';
import { useFEM, IBeamSteelConfig } from '../../context/FEMContext';
import './EN1993Tab.css';

interface EN1993TabProps {
  beamId: number;
  onClose: () => void;
}

const STEEL_GRADES = ['S235', 'S275', 'S355', 'S420', 'S460'];

const DEFLECTION_CLASSES = [
  { value: 'floor', label: 'Floor', defaultLimit: 333 },
  { value: 'roof', label: 'Roof', defaultLimit: 250 },
  { value: 'cantilever', label: 'Cantilever', defaultLimit: 150 },
  { value: 'custom', label: 'Custom', defaultLimit: 200 },
] as const;

export const EN1993Tab: React.FC<EN1993TabProps> = ({ beamId, onClose }) => {
  const { state, dispatch } = useFEM();
  const existing = state.beamSteelConfigs.get(beamId);

  const [steelGrade, setSteelGrade] = useState(existing?.steelGrade ?? 'S235');
  const [isCantilever, setIsCantilever] = useState(existing?.isCantilever ?? false);
  const [topSupportsCount, setTopSupportsCount] = useState(
    existing?.lateralBracing?.topFlangePositions?.length ?? 0
  );
  const [bottomSupportsCount, setBottomSupportsCount] = useState(
    existing?.lateralBracing?.bottomFlangePositions?.length ?? 0
  );
  const [bottomAsTop, setBottomAsTop] = useState(false);
  const [bucklingY, setBucklingY] = useState(existing?.bucklingLengthY ?? 5000);
  const [bucklingZ, setBucklingZ] = useState(existing?.bucklingLengthZ ?? 5000);
  const [deflectionEnabled, setDeflectionEnabled] = useState(true);
  const [deflectionClass, setDeflectionClass] = useState<IBeamSteelConfig['deflectionClass']>(
    existing?.deflectionClass ?? 'floor'
  );
  const [deflectionLimit, setDeflectionLimit] = useState(
    existing?.deflectionLimitNumerator ?? 333
  );

  const handleSave = () => {
    // Get profile name from the beam element
    const beam = state.mesh.beamElements.get(beamId);
    const config: IBeamSteelConfig = {
      beamId,
      profileName: existing?.profileName ?? beam?.profileName ?? '',
      steelGrade,
      lateralBracing: {
        topFlangePositions: distributeEvenly(topSupportsCount),
        bottomFlangePositions: bottomAsTop
          ? distributeEvenly(topSupportsCount)
          : distributeEvenly(bottomSupportsCount),
      },
      bucklingLengthY: bucklingY,
      bucklingLengthZ: bucklingZ,
      deflectionClass,
      deflectionLimitNumerator: deflectionLimit,
      isCantilever,
    };
    dispatch({ type: 'SET_BEAM_STEEL_CONFIG', payload: config });
    onClose();
  };

  return (
    <div className="en1993-tab">
      <h3 className="en1993-section-title">EN 1993-1-1</h3>

      <div className="en1993-row">
        <label>Steel grade</label>
        <select value={steelGrade} onChange={e => setSteelGrade(e.target.value)}>
          {STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="en1993-row">
        <label>
          <input
            type="checkbox"
            checked={isCantilever}
            onChange={e => setIsCantilever(e.target.checked)}
          />
          Cantilever
        </label>
      </div>

      <h3 className="en1993-section-title">Lateral-torsional buckling (art. 6.3.2)</h3>

      <div className="en1993-row">
        <label>Lateral supports at top flange (number)</label>
        <input
          type="number"
          min={0}
          value={topSupportsCount}
          onChange={e => setTopSupportsCount(Math.max(0, parseInt(e.target.value) || 0))}
        />
      </div>

      <div className="en1993-row">
        <label>
          <input
            type="checkbox"
            checked={bottomAsTop}
            onChange={e => setBottomAsTop(e.target.checked)}
          />
          Bottom as top flange
        </label>
      </div>

      {!bottomAsTop && (
        <div className="en1993-row">
          <label>Lateral supports at bottom flange (number)</label>
          <input
            type="number"
            min={0}
            value={bottomSupportsCount}
            onChange={e => setBottomSupportsCount(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>
      )}

      <h3 className="en1993-section-title">Buckling (art. 6.3.3)</h3>

      <div className="en1993-row">
        <label>Buckling length Y-axis (mm)</label>
        <input
          type="number"
          value={bucklingY}
          onChange={e => setBucklingY(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="en1993-row">
        <label>Buckling length Z-axis (mm)</label>
        <input
          type="number"
          value={bucklingZ}
          onChange={e => setBucklingZ(parseFloat(e.target.value) || 0)}
        />
      </div>

      <h3 className="en1993-section-title">Deflection (SLS)</h3>

      <div className="en1993-row">
        <label>
          <input
            type="checkbox"
            checked={deflectionEnabled}
            onChange={e => setDeflectionEnabled(e.target.checked)}
          />
          Check deflection
        </label>
      </div>

      {deflectionEnabled && (
        <>
          <div className="en1993-row">
            <label>Type</label>
            <select
              value={deflectionClass}
              onChange={e => {
                const cls = e.target.value as IBeamSteelConfig['deflectionClass'];
                setDeflectionClass(cls);
                const def = DEFLECTION_CLASSES.find(d => d.value === cls);
                if (def) setDeflectionLimit(def.defaultLimit);
              }}
            >
              {DEFLECTION_CLASSES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="en1993-row">
            <label>Limit L /</label>
            <input
              type="number"
              min={1}
              value={deflectionLimit}
              onChange={e => setDeflectionLimit(parseInt(e.target.value) || 1)}
            />
          </div>
        </>
      )}

      <div className="en1993-actions">
        <button className="en1993-btn cancel" onClick={onClose}>Cancel</button>
        <button className="en1993-btn confirm" onClick={handleSave}>OK</button>
      </div>
    </div>
  );
};

function distributeEvenly(count: number): number[] {
  if (count <= 0) return [];
  const step = 1 / (count + 1);
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}
