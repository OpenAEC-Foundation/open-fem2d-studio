/**
 * InputMembersSection — Member/beam element table
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { calculateBeamLength } from '../../../core/fem/Beam';

export const InputMembersSection: React.FC<ReportSectionProps> = ({ config, mesh, sectionNumber }) => {
  const beams = Array.from(mesh.beamElements.values());

  if (beams.length === 0) {
    return (
      <div className="report-section" id="section-input_members">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Members
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No beam/member elements in this model.
        </p>
      </div>
    );
  }

  return (
    <div className="report-section" id="section-input_members">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Members
      </h2>

      <p style={{ marginBottom: 16 }}>
        The structure consists of {beams.length} beam element{beams.length !== 1 ? 's' : ''}.
      </p>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>ID</th>
            <th>Start Node</th>
            <th>End Node</th>
            <th>Length (m)</th>
            <th>Profile</th>
            <th>Releases</th>
          </tr>
        </thead>
        <tbody>
          {beams.map(beam => {
            const nodes = mesh.getBeamElementNodes(beam);
            const length = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;

            // Format end releases
            const releases: string[] = [];
            if (beam.endReleases?.startMoment) releases.push('Mi');
            if (beam.endReleases?.endMoment) releases.push('Mj');
            if (beam.endReleases?.startAxial) releases.push('Ni');
            if (beam.endReleases?.endAxial) releases.push('Nj');

            return (
              <tr key={beam.id}>
                <td>{beam.id}</td>
                <td className="numeric">{beam.nodeIds[0]}</td>
                <td className="numeric">{beam.nodeIds[1]}</td>
                <td className="numeric">{length.toFixed(3)}</td>
                <td>{beam.profileName || '—'}</td>
                <td>{releases.length > 0 ? releases.join(', ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ color: '#666', fontSize: '9pt' }}>
        Releases: Mi/Mj = moment release at start/end, Ni/Nj = axial release at start/end
      </p>
    </div>
  );
};
