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

  // Element counting available if needed for summary
  // const triangleCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 3).length;
  // const quadCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 4).length;

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

      {/* Axis system and sign conventions */}
      <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <p style={{ fontWeight: 600, fontSize: '10pt', marginBottom: 8, color: config.primaryColor }}>
          Coordinate System &amp; Sign Conventions
        </p>
        <div style={{ display: 'flex', gap: 24, fontSize: '9pt' }}>
          <div>
            <strong>Global Axes:</strong><br/>
            X = horizontal (positive right)<br/>
            Y = vertical (positive up)
          </div>
          <div>
            <strong>Sign Conventions:</strong><br/>
            Positive moment = tension at bottom<br/>
            Positive shear = clockwise rotation
          </div>
        </div>
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
