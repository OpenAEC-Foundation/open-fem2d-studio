/**
 * InputProfilesSection — Section/profile properties table
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';

export const InputProfilesSection: React.FC<ReportSectionProps> = ({ config, mesh, sectionNumber }) => {
  const beams = Array.from(mesh.beamElements.values());

  // Collect unique profiles
  const profiles = new Map<string, {
    profileName: string;
    A: number;
    I: number;
    h: number;
    count: number;
  }>();

  for (const beam of beams) {
    const key = beam.profileName || `Custom-${beam.section.A.toExponential(2)}`;
    const existing = profiles.get(key);
    if (existing) {
      existing.count++;
    } else {
      profiles.set(key, {
        profileName: beam.profileName || 'Custom',
        A: beam.section.A,
        I: beam.section.I,
        h: beam.section.h,
        count: 1,
      });
    }
  }

  const profileList = Array.from(profiles.values());

  if (profileList.length === 0) {
    return (
      <div className="report-section" id="section-input_profiles">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Profile Properties
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No profiles defined in this model.
        </p>
      </div>
    );
  }

  return (
    <div className="report-section" id="section-input_profiles">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Profile Properties
      </h2>

      <p style={{ marginBottom: 16 }}>
        The following section profiles are used in the structural model.
      </p>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Profile</th>
            <th>A (cm²)</th>
            <th>I (cm⁴)</th>
            <th>h (mm)</th>
            <th>Used</th>
          </tr>
        </thead>
        <tbody>
          {profileList.map((profile, idx) => (
            <tr key={idx}>
              <td>{profile.profileName}</td>
              <td className="numeric">{(profile.A * 1e4).toFixed(2)}</td>
              <td className="numeric">{(profile.I * 1e8).toFixed(1)}</td>
              <td className="numeric">{(profile.h * 1000).toFixed(0)}</td>
              <td className="numeric">{profile.count}×</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: '#666', fontSize: '9pt', marginTop: 8 }}>
        A = cross-sectional area, I = second moment of area (strong axis), h = section height
      </p>
    </div>
  );
};
