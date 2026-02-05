import { useState } from 'react';
import { useFEM, applyLoadCaseToMesh } from '../../context/FEMContext';
import { solve } from '../../core/solver/SolverService';
import type { AnalysisType } from '../../core/fem/types';
import './CalculationSettingsDialog.css';

interface CalculationSettingsDialogProps {
  onClose: () => void;
}

export function CalculationSettingsDialog({ onClose }: CalculationSettingsDialogProps) {
  const { state, dispatch } = useFEM();

  const [analysisType, setAnalysisType] = useState<AnalysisType>(state.analysisType);
  const [solverMethod, setSolverMethod] = useState<'linear' | 'pdelta'>(
    'linear'
  );
  const [forceUnit, setForceUnit] = useState<'kN' | 'N' | 'MN'>(state.forceUnit);
  const [lengthUnit, setLengthUnit] = useState<'m' | 'mm' | 'cm'>(state.lengthUnit);
  const [displacementUnit, setDisplacementUnit] = useState<'mm' | 'm'>(state.displacementUnit);
  const [stressUnit, setStressUnit] = useState<'MPa' | 'kPa' | 'Pa' | 'N/mm\u00B2'>(state.stressUnit);
  const [momentOfInertiaUnit, setMomentOfInertiaUnit] = useState<'mm\u2074' | 'cm\u2074' | 'm\u2074'>(state.momentOfInertiaUnit);
  const [sectionModulusUnit, setSectionModulusUnit] = useState<'mm\u00B3' | 'cm\u00B3' | 'm\u00B3'>(state.sectionModulusUnit);
  const [areaUnit, setAreaUnit] = useState<'mm\u00B2' | 'cm\u00B2' | 'm\u00B2'>(state.areaUnit);
  const [momentUnit, setMomentUnit] = useState<'kNm' | 'Nm'>(state.momentUnit);
  const [distributedLoadUnit, setDistributedLoadUnit] = useState<'kN/m' | 'N/m'>(state.distributedLoadUnit);
  const [plateBendingMomentUnit, setPlateBendingMomentUnit] = useState<'kNm/m' | 'Nm/m'>(state.plateBendingMomentUnit);
  const [plateShearForceUnit, setPlateShearForceUnit] = useState<'kN/m' | 'N/m'>(state.plateShearForceUnit);
  const [plateMembraneForceUnit, setPlateMembraneForceUnit] = useState<'kN/m' | 'N/m'>(state.plateMembraneForceUnit);
  const [autoRecalculate, setAutoRecalculate] = useState(state.autoRecalculate);
  const [convergenceTolerance, setConvergenceTolerance] = useState(1e-6);
  const [maxIterations, setMaxIterations] = useState(10);

  const handleApply = async () => {
    dispatch({ type: 'SET_ANALYSIS_TYPE', payload: analysisType });
    dispatch({ type: 'SET_FORCE_UNIT', payload: forceUnit });
    dispatch({ type: 'SET_LENGTH_UNIT', payload: lengthUnit });
    dispatch({ type: 'SET_DISPLACEMENT_UNIT', payload: displacementUnit });
    dispatch({ type: 'SET_STRESS_UNIT', payload: stressUnit });
    dispatch({ type: 'SET_MOMENT_OF_INERTIA_UNIT', payload: momentOfInertiaUnit });
    dispatch({ type: 'SET_SECTION_MODULUS_UNIT', payload: sectionModulusUnit });
    dispatch({ type: 'SET_AREA_UNIT', payload: areaUnit });
    dispatch({ type: 'SET_MOMENT_UNIT', payload: momentUnit });
    dispatch({ type: 'SET_DISTRIBUTED_LOAD_UNIT', payload: distributedLoadUnit });
    dispatch({ type: 'SET_PLATE_BENDING_MOMENT_UNIT', payload: plateBendingMomentUnit });
    dispatch({ type: 'SET_PLATE_SHEAR_FORCE_UNIT', payload: plateShearForceUnit });
    dispatch({ type: 'SET_PLATE_MEMBRANE_FORCE_UNIT', payload: plateMembraneForceUnit });
    dispatch({ type: 'SET_AUTO_RECALCULATE', payload: autoRecalculate });
    dispatch({ type: 'REFRESH_MESH' });

    // If we have results and autoRecalculate is on, re-solve with new settings
    if (state.result && autoRecalculate) {
      const activeLc = state.loadCases.find(lc => lc.id === state.activeLoadCase);
      if (activeLc) {
        try {
          applyLoadCaseToMesh(state.mesh, activeLc, false);
          const newResult = await solve(state.mesh, {
            analysisType: analysisType, // Use the NEW analysis type
            geometricNonlinear: false
          });
          // Reset loads for visualization (don't show edge-converted nodal forces as point loads)
          applyLoadCaseToMesh(state.mesh, activeLc); // default: skip edge-to-node conversion
          dispatch({ type: 'SET_RESULT', payload: newResult });
        } catch (e) {
          dispatch({ type: 'SET_SOLVER_ERROR', payload: e instanceof Error ? e.message : 'Solve failed' });
        }
      }
    }

    onClose();
  };

  return (
    <div className="calc-settings-overlay" onClick={onClose}>
      <div className="calc-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="calc-settings-header">
          Calculation Settings
        </div>

        <div className="calc-settings-body">
          {/* Left Column */}
          <div className="calc-settings-column">
            {/* Analysis Type */}
            <div className="calc-settings-section">
              <div className="calc-settings-section-title">Analysis</div>
              <div className="calc-settings-field">
                <span>Analysis Type</span>
                <select
                  value={analysisType}
                  onChange={e => setAnalysisType(e.target.value as AnalysisType)}
                >
                  <option value="frame">2D Frame</option>
                  <option value="plane_stress">Plane Stress</option>
                  <option value="plane_strain">Plane Strain</option>
                  <option value="plate_bending">Plate Bending (DKT)</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Solver Method</span>
                <select
                  value={solverMethod}
                  onChange={e => setSolverMethod(e.target.value as 'linear' | 'pdelta')}
                >
                  <option value="linear">Linear (GL - Geometrisch Lineair)</option>
                  <option value="pdelta">P-Delta (2nd order, GNL)</option>
                </select>
              </div>
            </div>

            {/* Units */}
            <div className="calc-settings-section">
              <div className="calc-settings-section-title">Units</div>
              <div className="calc-settings-field">
                <span>Force</span>
                <select
                  value={forceUnit}
                  onChange={e => setForceUnit(e.target.value as 'kN' | 'N' | 'MN')}
                >
                  <option value="kN">kN</option>
                  <option value="N">N</option>
                  <option value="MN">MN</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Length</span>
                <select
                  value={lengthUnit}
                  onChange={e => setLengthUnit(e.target.value as 'm' | 'mm' | 'cm')}
                >
                  <option value="m">m</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Displacement</span>
                <select
                  value={displacementUnit}
                  onChange={e => setDisplacementUnit(e.target.value as 'mm' | 'm')}
                >
                  <option value="mm">mm</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Stress</span>
                <select
                  value={stressUnit}
                  onChange={e => setStressUnit(e.target.value as 'MPa' | 'kPa' | 'Pa' | 'N/mm²')}
                >
                  <option value="MPa">MPa</option>
                  <option value="kPa">kPa</option>
                  <option value="Pa">Pa</option>
                  <option value="N/mm²">N/mm²</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Moment of Inertia</span>
                <select
                  value={momentOfInertiaUnit}
                  onChange={e => setMomentOfInertiaUnit(e.target.value as 'mm⁴' | 'cm⁴' | 'm⁴')}
                >
                  <option value="mm⁴">mm⁴</option>
                  <option value="cm⁴">cm⁴</option>
                  <option value="m⁴">m⁴</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Section Modulus</span>
                <select
                  value={sectionModulusUnit}
                  onChange={e => setSectionModulusUnit(e.target.value as 'mm³' | 'cm³' | 'm³')}
                >
                  <option value="mm³">mm³</option>
                  <option value="cm³">cm³</option>
                  <option value="m³">m³</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="calc-settings-column">
            {/* More Units */}
            <div className="calc-settings-section">
              <div className="calc-settings-section-title">Units (continued)</div>
              <div className="calc-settings-field">
                <span>Area</span>
                <select
                  value={areaUnit}
                  onChange={e => setAreaUnit(e.target.value as 'mm²' | 'cm²' | 'm²')}
                >
                  <option value="mm²">mm²</option>
                  <option value="cm²">cm²</option>
                  <option value="m²">m²</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Moment</span>
                <select
                  value={momentUnit}
                  onChange={e => setMomentUnit(e.target.value as 'kNm' | 'Nm')}
                >
                  <option value="kNm">kNm</option>
                  <option value="Nm">Nm</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Distributed Load</span>
                <select
                  value={distributedLoadUnit}
                  onChange={e => setDistributedLoadUnit(e.target.value as 'kN/m' | 'N/m')}
                >
                  <option value="kN/m">kN/m</option>
                  <option value="N/m">N/m</option>
                </select>
              </div>
            </div>

            {/* Plate Stress Units */}
            <div className="calc-settings-section">
              <div className="calc-settings-section-title">Plate Stress Units</div>
              <div className="calc-settings-field">
                <span>Bending Moment (mxx, myy, mxy)</span>
                <select
                  value={plateBendingMomentUnit}
                  onChange={e => setPlateBendingMomentUnit(e.target.value as 'kNm/m' | 'Nm/m')}
                >
                  <option value="kNm/m">kNm/m</option>
                  <option value="Nm/m">Nm/m</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Shear Force (vx, vy)</span>
                <select
                  value={plateShearForceUnit}
                  onChange={e => setPlateShearForceUnit(e.target.value as 'kN/m' | 'N/m')}
                >
                  <option value="kN/m">kN/m</option>
                  <option value="N/m">N/m</option>
                </select>
              </div>
              <div className="calc-settings-field">
                <span>Membrane Force (nxx, nyy, nxy)</span>
                <select
                  value={plateMembraneForceUnit}
                  onChange={e => setPlateMembraneForceUnit(e.target.value as 'kN/m' | 'N/m')}
                >
                  <option value="kN/m">kN/m</option>
                  <option value="N/m">N/m</option>
                </select>
              </div>
            </div>

            {/* Solver Options */}
            <div className="calc-settings-section">
              <div className="calc-settings-section-title">Solver Options</div>
              <div className="calc-settings-toggle">
                <input
                  type="checkbox"
                  id="autoRecalc"
                  checked={autoRecalculate}
                  onChange={e => setAutoRecalculate(e.target.checked)}
                />
                <label htmlFor="autoRecalc">Auto-recalculate on model changes</label>
              </div>
              <div className="calc-settings-field">
                <span>Convergence Tolerance</span>
                <input
                  type="number"
                  value={convergenceTolerance}
                  onChange={e => setConvergenceTolerance(parseFloat(e.target.value) || 1e-6)}
                  step="1e-7"
                  min="1e-12"
                  max="1e-2"
                />
              </div>
              <div className="calc-settings-field">
                <span>Max Iterations</span>
                <input
                  type="number"
                  value={maxIterations}
                  onChange={e => setMaxIterations(parseInt(e.target.value) || 10)}
                  step="1"
                  min="1"
                  max="100"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="calc-settings-footer">
          <button className="calc-settings-btn cancel" onClick={onClose}>Cancel</button>
          <button className="calc-settings-btn confirm" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
