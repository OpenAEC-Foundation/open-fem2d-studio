/**
 * ResultDisplacementsSection — Node displacements
 * Uses canvas captures for accurate representation of user's view
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useFEM } from '../../../context/FEMContext';

export const ResultDisplacementsSection: React.FC<ReportSectionProps> = ({ config, mesh, result, sectionNumber }) => {
  const { state } = useFEM();

  // Get canvas capture for deformed shape
  const deformedCapture = state.canvasCaptures.get('deformed');

  if (!result) {
    return (
      <div className="report-section" id="section-result_displacements">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Displacements (SLS)
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No analysis results available. Run the solver first.
        </p>
      </div>
    );
  }

  const nodes = Array.from(mesh.nodes.values());
  const beams = Array.from(mesh.beamElements.values());
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;

  // Build node index map
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  // Find max displacements at nodes
  let maxUy = 0;
  let maxUyNode = 0;

  // Only consider regular nodes (not plate mesh nodes)
  const regularNodes = nodes.filter(n => n.id < 1000);

  regularNodes.forEach(node => {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) return;

    const uy = Math.abs(result.displacements[idx * dofsPerNode + 1] ?? 0);
    if (uy > maxUy) { maxUy = uy; maxUyNode = node.id; }
  });

  // Find max displacement along beams (interpolated)
  let maxBeamDisp = 0;

  beams.forEach(beam => {
    const beamNodes = mesh.getBeamElementNodes(beam);
    if (!beamNodes) return;

    const idx1 = nodeIdToIndex.get(beamNodes[0].id);
    const idx2 = nodeIdToIndex.get(beamNodes[1].id);
    if (idx1 === undefined || idx2 === undefined) return;

    const uy1 = Math.abs(result.displacements[idx1 * dofsPerNode + 1] ?? 0);
    const uy2 = Math.abs(result.displacements[idx2 * dofsPerNode + 1] ?? 0);

    // Approximate mid-span displacement (parabolic for uniform load)
    // Max is typically at mid-span for simply supported beams
    const midDisp = Math.max(uy1, uy2, (uy1 + uy2) / 2 * 1.25); // Approximate

    if (midDisp > maxBeamDisp) {
      maxBeamDisp = midDisp;
    }
  });

  const formatDisp = (value: number): string => {
    return (value * 1000).toFixed(3);
  };

  const formatRot = (value: number): string => {
    return (value * 1000).toFixed(3);
  };

  return (
    <div className="report-section" id="section-result_displacements">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Displacements (SLS)
      </h2>

      {/* Canvas Capture Diagram */}
      {deformedCapture ? (
        <div className="diagram-container" style={{ marginBottom: 16 }}>
          <img
            src={deformedCapture}
            alt="Deformed Shape"
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
          />
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic', marginBottom: 16 }}>
          No deformed shape available. Enable "Show Deformed" in Results view first.
        </p>
      )}

      {/* Summary */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 4, display: 'inline-block' }}>
        <strong>Max |u<sub>y</sub>| = {formatDisp(maxUy)} mm</strong>
        <span style={{ color: '#666', marginLeft: 12 }}>at Node {maxUyNode}</span>
      </div>

      {/* Full table */}
      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Node</th>
            <th>u<sub>x</sub> (mm)</th>
            <th>u<sub>y</sub> (mm)</th>
            {isFrame && <th>θ<sub>z</sub> (mrad)</th>}
          </tr>
        </thead>
        <tbody>
          {nodes.map(node => {
            const idx = nodeIdToIndex.get(node.id);
            if (idx === undefined) return null;

            const ux = result.displacements[idx * dofsPerNode] ?? 0;
            const uy = result.displacements[idx * dofsPerNode + 1] ?? 0;
            const rz = isFrame ? (result.displacements[idx * dofsPerNode + 2] ?? 0) : 0;

            return (
              <tr key={node.id}>
                <td>{node.id}</td>
                <td className="numeric">{formatDisp(ux)}</td>
                <td className="numeric">{formatDisp(uy)}</td>
                {isFrame && <td className="numeric">{formatRot(rz)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
