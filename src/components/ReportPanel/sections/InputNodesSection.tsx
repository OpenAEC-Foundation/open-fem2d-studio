/**
 * InputNodesSection — Node coordinates table
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';

export const InputNodesSection: React.FC<ReportSectionProps> = ({ config, mesh, sectionNumber }) => {
  const nodes = Array.from(mesh.nodes.values());

  const formatSupport = (node: typeof nodes[0]): string => {
    const constraints: string[] = [];
    if (node.constraints.x) constraints.push('X');
    if (node.constraints.y) constraints.push('Y');
    if (node.constraints.rotation) constraints.push('Rz');
    return constraints.length > 0 ? constraints.join(', ') : '—';
  };

  return (
    <div className="report-section" id="section-input_nodes">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Node Coordinates
      </h2>

      <p style={{ marginBottom: 16 }}>
        The model consists of {nodes.length} nodes. Coordinates are given in meters relative to the global origin.
      </p>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Node</th>
            <th>X (m)</th>
            <th>Y (m)</th>
            <th>Supports</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map(node => (
            <tr key={node.id}>
              <td>{node.id}</td>
              <td className="numeric">{node.x.toFixed(3)}</td>
              <td className="numeric">{node.y.toFixed(3)}</td>
              <td>{formatSupport(node)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: '#666', fontSize: '9pt' }}>
        Support legend: X = horizontal restraint, Y = vertical restraint, Rz = rotational restraint
      </p>
    </div>
  );
};
