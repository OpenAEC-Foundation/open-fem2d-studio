/**
 * ResultForcesSection — Internal forces (N, V, M) for beam elements
 * Uses canvas captures for accurate representation of user's view
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { calculateBeamLength } from '../../../core/fem/Beam';
import { useFEM } from '../../../context/FEMContext';

interface ResultForcesSectionProps extends ReportSectionProps {
  forceType: 'N' | 'V' | 'M';
}

const FORCE_TITLES: Record<string, { title: string; symbol: string; unit: string; captureKey: string }> = {
  N: { title: 'Axial Forces', symbol: 'N', unit: 'kN', captureKey: 'normal' },
  V: { title: 'Shear Forces', symbol: 'V', unit: 'kN', captureKey: 'shear' },
  M: { title: 'Bending Moments', symbol: 'M', unit: 'kNm', captureKey: 'moment' },
};

export const ResultForcesSection: React.FC<ResultForcesSectionProps> = ({
  config,
  mesh,
  result,
  sectionNumber,
  forceType,
}) => {
  const { state } = useFEM();
  const info = FORCE_TITLES[forceType];

  // Get canvas capture for this diagram type
  const diagramCapture = state.canvasCaptures.get(info.captureKey);

  if (!result || result.beamForces.size === 0) {
    return (
      <div className="report-section" id={`section-result_forces_${forceType}`}>
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. {info.title}
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No beam force results available. Run the solver first.
        </p>
      </div>
    );
  }

  const beamForces = Array.from(result.beamForces.values());

  const formatValue = (value: number): string => {
    if (forceType === 'M') {
      return (value / 1000).toFixed(2); // Nm -> kNm
    }
    return (value / 1000).toFixed(2); // N -> kN
  };

  // Find max values
  let maxValue = 0;
  let maxBeamId = 0;

  beamForces.forEach(forces => {
    const val = forceType === 'N' ? forces.maxN :
                forceType === 'V' ? forces.maxV : forces.maxM;
    if (Math.abs(val) > Math.abs(maxValue)) {
      maxValue = val;
      maxBeamId = forces.elementId;
    }
  });

  return (
    <div className="report-section" id={`section-result_forces_${forceType}`}>
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. {info.title}
      </h2>

      {/* Canvas Capture Diagram */}
      {diagramCapture ? (
        <div className="diagram-container" style={{ marginBottom: 16 }}>
          <img
            src={diagramCapture}
            alt={`${info.title} Diagram`}
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
          />
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic', marginBottom: 16 }}>
          No {info.title.toLowerCase()} diagram available. Enable the diagram in Results view first.
        </p>
      )}

      {/* Summary */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 4, display: 'inline-block' }}>
        <strong>Max |{info.symbol}| = {formatValue(Math.abs(maxValue))} {info.unit}</strong>
        <span style={{ color: '#666', marginLeft: 12 }}>at Beam {maxBeamId}</span>
      </div>

      {/* Force table */}
      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Beam</th>
            <th>Profile</th>
            <th>L (m)</th>
            <th>{info.symbol}<sub>1</sub> ({info.unit})</th>
            <th>{info.symbol}<sub>2</sub> ({info.unit})</th>
            <th>Max |{info.symbol}| ({info.unit})</th>
          </tr>
        </thead>
        <tbody>
          {beamForces.map(forces => {
            const beam = mesh.getBeamElement(forces.elementId);
            const nodes = beam ? mesh.getBeamElementNodes(beam) : null;
            const length = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;

            const val1 = forceType === 'N' ? forces.N1 :
                        forceType === 'V' ? forces.V1 : forces.M1;
            const val2 = forceType === 'N' ? forces.N2 :
                        forceType === 'V' ? forces.V2 : forces.M2;
            const maxVal = forceType === 'N' ? forces.maxN :
                          forceType === 'V' ? forces.maxV : forces.maxM;

            return (
              <tr key={forces.elementId}>
                <td>{forces.elementId}</td>
                <td>{beam?.profileName || '—'}</td>
                <td className="numeric">{length.toFixed(3)}</td>
                <td className="numeric">{formatValue(val1)}</td>
                <td className="numeric">{formatValue(val2)}</td>
                <td className="numeric" style={{ fontWeight: 600 }}>
                  {formatValue(Math.abs(maxVal))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Sign convention note */}
      <p style={{ color: '#666', fontSize: '9pt', marginTop: 8 }}>
        {forceType === 'N' && 'Sign convention: positive = tension, negative = compression'}
        {forceType === 'V' && 'Sign convention: positive = clockwise rotation of cross-section'}
        {forceType === 'M' && 'Sign convention: positive = tension at bottom fiber (sagging)'}
      </p>
    </div>
  );
};
