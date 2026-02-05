/**
 * InputProfilesSection — Section/profile properties with SVG preview
 */

import React, { useMemo } from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { ProfileSvgPreview } from '../../SectionPropertiesDialog/ProfileSvgPreview';
import { SteelProfileLibrary } from '../../../core/section/SteelProfileLibrary';
import { ProfileGeometry } from '../../../core/section/SteelProfiles';
import { IBeamSection } from '../../../core/fem/types';

interface ProfileInfo {
  profileName: string;
  section: IBeamSection;
  count: number;
  geometry: ProfileGeometry | null;
}

export const InputProfilesSection: React.FC<ReportSectionProps> = ({ config, mesh, sectionNumber }) => {
  const beams = Array.from(mesh.beamElements.values());

  const profileList = useMemo((): ProfileInfo[] => {
    const profiles = new Map<string, ProfileInfo>();

    for (const beam of beams) {
      const key = beam.profileName || 'Custom_' + beam.section.A.toExponential(2);
      const existing = profiles.get(key);

      if (existing) {
        existing.count++;
      } else {
        const name = beam.profileName || 'Custom';
        let geometry: ProfileGeometry | null = null;

        const entry = SteelProfileLibrary.findProfile(name);
        if (entry) {
          geometry = SteelProfileLibrary.createProfileGeometry(entry);
        }

        profiles.set(key, {
          profileName: name,
          section: beam.section,
          count: 1,
          geometry,
        });
      }
    }

    return Array.from(profiles.values());
  }, [beams]);

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

      {profileList.map((profile, idx) => (
        <ProfileCard key={idx} profile={profile} primaryColor={config.primaryColor} />
      ))}

      <p style={{ color: '#666', fontSize: '9pt', marginTop: 8 }}>
        A = cross-sectional area, I<sub>y</sub> = second moment of area (strong axis),
        I<sub>z</sub> = second moment of area (weak axis),
        W<sub>y</sub> = elastic section modulus (strong axis),
        W<sub>z</sub> = elastic section modulus (weak axis),
        h = section height, b = flange width, t<sub>f</sub> = flange thickness,
        t<sub>w</sub> = web thickness
      </p>
    </div>
  );
};

function ProfileCard({ profile, primaryColor }: { profile: ProfileInfo; primaryColor: string }) {
  const { section } = profile;

  const A_cm2 = section.A * 1e4;
  const Iy_cm4 = (section.Iy ?? section.I) * 1e8;
  const Iz_cm4 = (section.Iz ?? 0) * 1e8;
  const Wy_cm3 = (section.Wy ?? 0) * 1e6;
  const Wz_cm3 = (section.Wz ?? 0) * 1e6;
  const h_mm = section.h * 1000;
  const b_mm = (section.b ?? 0) * 1000;
  const tf_mm = (section.tf ?? 0) * 1000;
  const tw_mm = (section.tw ?? 0) * 1000;

  const rows: { label: React.ReactNode; value: string; unit: string }[] = [
    { label: 'A', value: A_cm2.toFixed(2), unit: 'cm\u00B2' },
    { label: <span>I<sub>y</sub></span>, value: Iy_cm4.toFixed(1), unit: 'cm\u2074' },
    ...(Iz_cm4 > 0 ? [{ label: <span>I<sub>z</sub></span> as React.ReactNode, value: Iz_cm4.toFixed(1), unit: 'cm\u2074' }] : []),
    ...(Wy_cm3 > 0 ? [{ label: <span>W<sub>el,y</sub></span> as React.ReactNode, value: Wy_cm3.toFixed(1), unit: 'cm\u00B3' }] : []),
    ...(Wz_cm3 > 0 ? [{ label: <span>W<sub>el,z</sub></span> as React.ReactNode, value: Wz_cm3.toFixed(1), unit: 'cm\u00B3' }] : []),
    { label: 'h', value: h_mm.toFixed(0), unit: 'mm' },
    ...(b_mm > 0 ? [{ label: 'b' as React.ReactNode, value: b_mm.toFixed(0), unit: 'mm' }] : []),
    ...(tf_mm > 0 ? [{ label: <span>t<sub>f</sub></span> as React.ReactNode, value: tf_mm.toFixed(1), unit: 'mm' }] : []),
    ...(tw_mm > 0 ? [{ label: <span>t<sub>w</sub></span> as React.ReactNode, value: tw_mm.toFixed(1), unit: 'mm' }] : []),
  ];

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 6,
        marginBottom: 14,
        padding: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        pageBreakInside: 'avoid',
      }}
    >
      <div style={{ flexShrink: 0 }}>
        {profile.geometry ? (
          <ProfileSvgPreview
            profile={profile.geometry}
            width={120}
            height={120}
            showDimensions={true}
            showAxes={false}
            showNeutralAxes={false}
            showFilletLines={false}
            strokeColor={primaryColor}
            fillColor={primaryColor + '18'}
          />
        ) : (
          <div
            style={{
              width: 120,
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f5f5f5',
              borderRadius: 4,
              color: '#999',
              fontSize: '9pt',
            }}
          >
            No preview
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '11pt',
            marginBottom: 6,
            color: primaryColor,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span>{profile.profileName}</span>
          <span style={{ fontSize: '9pt', color: '#888', fontWeight: 400 }}>
            used {profile.count}&times;
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '2px 8px 2px 0', color: '#555', whiteSpace: 'nowrap', width: '30%' }}>
                  {row.label}
                </td>
                <td style={{ padding: '2px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.value}
                </td>
                <td style={{ padding: '2px 0 2px 4px', color: '#888', whiteSpace: 'nowrap' }}>
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
