/**
 * ResultReactionsSection — Reaction forces at supports
 * Uses canvas captures for accurate representation of user's view
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useFEM } from '../../../context/FEMContext';

export const ResultReactionsSection: React.FC<ReportSectionProps> = ({ config, mesh, result, sectionNumber }) => {
  const { state } = useFEM();

  // Get canvas capture for reactions (captured when reactions are shown in results view)
  const reactionsCapture = state.canvasCaptures.get('reactions');

  if (!result) {
    return (
      <div className="report-section" id="section-result_reactions">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Reaction Forces
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

  // Filter nodes with constraints (supports)
  const supportNodes = nodes.filter(n =>
    n.constraints.x || n.constraints.y || (isFrame && n.constraints.rotation)
  );

  const formatForce = (value: number): string => {
    const kN = value / 1000;
    return kN.toFixed(2);
  };

  const formatMoment = (value: number): string => {
    const kNm = value / 1000;
    return kNm.toFixed(2);
  };

  // Calculate sum of reactions
  let sumRx = 0, sumRy = 0, sumMz = 0;
  supportNodes.forEach(node => {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === undefined) return;
    if (node.constraints.x) sumRx += result.reactions[idx * dofsPerNode];
    if (node.constraints.y) sumRy += result.reactions[idx * dofsPerNode + 1];
    if (isFrame && node.constraints.rotation) {
      sumMz += result.reactions[idx * dofsPerNode + 2];
    }
  });

  return (
    <div className="report-section" id="section-result_reactions">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Reaction Forces
      </h2>

      {/* Canvas Capture Diagram */}
      {reactionsCapture ? (
        <div className="diagram-container" style={{ marginBottom: 16 }}>
          <img
            src={reactionsCapture}
            alt="Reaction Forces"
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
          />
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic', marginBottom: 16 }}>
          No reactions diagram available. Enable "Show Reactions" in Results view first.
        </p>
      )}

      {/* Equilibrium check note */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 4, border: '1px solid #86efac', display: 'inline-block' }}>
        <strong style={{ color: '#16a34a' }}>Equilibrium check:</strong>
        <span style={{ marginLeft: 8 }}>
          ΣRx = {formatForce(sumRx)} kN, ΣRy = {formatForce(sumRy)} kN
          {isFrame && <>, ΣMz = {formatMoment(sumMz)} kNm</>}
        </span>
      </div>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Node</th>
            <th>R<sub>x</sub> (kN)</th>
            <th>R<sub>y</sub> (kN)</th>
            {isFrame && <th>M<sub>z</sub> (kNm)</th>}
          </tr>
        </thead>
        <tbody>
          {supportNodes.map(node => {
            const idx = nodeIdToIndex.get(node.id);
            if (idx === undefined) return null;

            const rx = node.constraints.x ? result.reactions[idx * dofsPerNode] : 0;
            const ry = node.constraints.y ? result.reactions[idx * dofsPerNode + 1] : 0;
            const mz = isFrame && node.constraints.rotation
              ? result.reactions[idx * dofsPerNode + 2]
              : 0;

            return (
              <tr key={node.id}>
                <td>{node.id}</td>
                <td className="numeric">{node.constraints.x ? formatForce(rx) : '—'}</td>
                <td className="numeric">{node.constraints.y ? formatForce(ry) : '—'}</td>
                {isFrame && (
                  <td className="numeric">
                    {node.constraints.rotation ? formatMoment(mz) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
          {/* Sum row */}
          <tr style={{ fontWeight: 600, borderTop: '2px solid #ccc' }}>
            <td>Σ</td>
            <td className="numeric">{formatForce(sumRx)}</td>
            <td className="numeric">{formatForce(sumRy)}</td>
            {isFrame && <td className="numeric">{formatMoment(sumMz)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
};
