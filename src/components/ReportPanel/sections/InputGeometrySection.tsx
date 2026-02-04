/**
 * InputGeometrySection — Model geometry diagram with loads and supports
 * Uses canvas capture for accurate representation of user's view
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useFEM } from '../../../context/FEMContext';

export const InputGeometrySection: React.FC<ReportSectionProps & { canvasCapture?: string }> = ({
  config,
  mesh,
  sectionNumber,
}) => {
  const { state } = useFEM();
  const geometryCapture = state.canvasCaptures.get('geometry');

  // Count elements
  const triangleCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 3).length;
  const quadCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 4).length;

  // Count loads
  let pointLoadCount = 0;
  let distLoadCount = 0;
  for (const node of mesh.nodes.values()) {
    if (node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment !== 0) {
      pointLoadCount++;
    }
  }
  for (const beam of mesh.beamElements.values()) {
    if (beam.distributedLoad && (beam.distributedLoad.qy !== 0 || beam.distributedLoad.qx !== 0)) {
      distLoadCount++;
    }
  }
  // Note: loadCases not available in this component props anymore

  // Count supports
  let supportCount = 0;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      supportCount++;
    }
  }

  return (
    <div className="report-section" id="section-input_geometry">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Model Geometry
      </h2>

      {geometryCapture ? (
        <div className="diagram-container">
          <img
            src={geometryCapture}
            alt="Model Geometry"
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
          />
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No geometry capture available. View the model in Geometry tab first.
        </p>
      )}

      {/* Model summary */}
      <div style={{ marginTop: 16 }}>
        <table className="report-table" style={{ maxWidth: 400 }}>
          <thead>
            <tr style={{ background: config.primaryColor }}>
              <th colSpan={2}>Model Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nodes</td>
              <td className="numeric">{mesh.nodes.size}</td>
            </tr>
            {mesh.beamElements.size > 0 && (
              <tr>
                <td>Beam Elements</td>
                <td className="numeric">{mesh.beamElements.size}</td>
              </tr>
            )}
            {triangleCount > 0 && (
              <tr>
                <td>Triangle Elements</td>
                <td className="numeric">{triangleCount}</td>
              </tr>
            )}
            {quadCount > 0 && (
              <tr>
                <td>Quad Elements</td>
                <td className="numeric">{quadCount}</td>
              </tr>
            )}
            <tr>
              <td>Supports</td>
              <td className="numeric">{supportCount}</td>
            </tr>
            {pointLoadCount > 0 && (
              <tr>
                <td>Point Loads</td>
                <td className="numeric">{pointLoadCount}</td>
              </tr>
            )}
            {distLoadCount > 0 && (
              <tr>
                <td>Distributed Loads</td>
                <td className="numeric">{distLoadCount}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, fontSize: '9pt', color: '#666' }}>
        <strong>Legend:</strong>{' '}
        <span style={{ color: '#1e3a5f' }}>— Beam elements</span>{' | '}
        <span style={{ color: '#fbbf24' }}>▲ Supports</span>{' | '}
        <span style={{ color: '#f59e0b' }}>○ Hinges</span>{' | '}
        <span style={{ color: '#ef4444' }}>→ Point loads</span>{' | '}
        <span style={{ color: '#3b82f6' }}>↓↓ Distributed loads</span>
      </div>
    </div>
  );
};
