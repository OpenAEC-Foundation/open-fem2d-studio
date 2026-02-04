/**
 * SteelCheckOverviewSection — Steel section check summary with UC bars
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { STEEL_GRADES } from '../../../core/standards/EurocodeNL';
import { checkAllBeams, ISectionProperties } from '../../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../../core/fem/Beam';

export const SteelCheckOverviewSection: React.FC<ReportSectionProps> = ({
  config,
  mesh,
  result,
  sectionNumber,
}) => {
  if (!result || result.beamForces.size === 0) {
    return (
      <div className="report-section" id="section-check_steel_overview">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Steel Section Checks — Overview
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No beam force results available. Run the solver first.
        </p>
      </div>
    );
  }

  // Get steel grade from config
  const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2]; // Default to S355

  // Build section map and beam lengths
  const sectionMap = new Map<number, ISectionProperties>();
  const beamLengths = new Map<number, number>();

  for (const beam of mesh.beamElements.values()) {
    sectionMap.set(beam.id, {
      A: beam.section.A,
      I: beam.section.I,
      h: beam.section.h,
      b: beam.section.b ? beam.section.b * 1000 : undefined,
      tf: beam.section.tf ? beam.section.tf * 1000 : undefined,
      tw: beam.section.tw ? beam.section.tw * 1000 : undefined,
      Iz: beam.section.Iz,
      It: beam.section.It,
      Iw: beam.section.Iw,
      profileName: beam.profileName,
    });

    const nodes = mesh.getBeamElementNodes(beam);
    if (nodes) {
      beamLengths.set(beam.id, calculateBeamLength(nodes[0], nodes[1]));
    }
  }

  const steelResults = checkAllBeams(
    result.beamForces,
    sectionMap,
    grade,
    beamLengths,
    undefined,
    config.deflectionLimit
  );

  const allOk = steelResults.every(r => r.status === 'OK');
  const worstUC = steelResults.length > 0 ? Math.max(...steelResults.map(r => r.UC_max)) : 0;

  const getUCStatus = (uc: number): 'ok' | 'warning' | 'fail' => {
    if (uc <= 0.85) return 'ok';
    if (uc <= 1.0) return 'warning';
    return 'fail';
  };

  return (
    <div className="report-section" id="section-check_steel_overview">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Steel Section Checks — Overview
      </h2>

      <p style={{ marginBottom: 16 }}>
        Cross-section resistance checks according to EN 1993-1-1.
        Steel grade: <strong>{grade.name}</strong> (f<sub>y</sub> = {grade.fy} MPa, γ<sub>M0</sub> = {grade.gammaM0})
      </p>

      {/* Summary box */}
      <div
        className={`check-result ${allOk ? 'ok' : 'fail'}`}
        style={{ marginBottom: 24, fontSize: '11pt' }}
      >
        {steelResults.length} member{steelResults.length !== 1 ? 's' : ''} checked —
        Max UC = {worstUC.toFixed(2)} —{' '}
        <strong>{allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}</strong>
      </div>

      {/* Summary table */}
      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Beam</th>
            <th>Profile</th>
            <th>N<sub>Ed</sub> (kN)</th>
            <th>V<sub>Ed</sub> (kN)</th>
            <th>M<sub>Ed</sub> (kNm)</th>
            <th style={{ width: 150 }}>UC max</th>
            <th>Governing</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {steelResults.map(r => {
            const status = getUCStatus(r.UC_max);
            return (
              <tr key={r.elementId}>
                <td>{r.elementId}</td>
                <td>{r.profileName}</td>
                <td className="numeric">{(r.NEd / 1000).toFixed(1)}</td>
                <td className="numeric">{(r.VEd / 1000).toFixed(1)}</td>
                <td className="numeric">{(r.MEd / 1000).toFixed(2)}</td>
                <td>
                  <div className="uc-bar">
                    <div className="uc-bar-track">
                      <div
                        className={`uc-bar-fill ${status}`}
                        style={{ width: `${Math.min(r.UC_max * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`uc-value ${status}`}>
                      {r.UC_max.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td style={{ fontSize: '9pt' }}>{r.governingCheck}</td>
                <td>
                  <span className={`status-badge ${r.status === 'OK' ? 'ok' : 'fail'}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, marginTop: 16, fontSize: '9pt', color: '#666' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, background: '#22c55e', borderRadius: 2 }} />
          <span>UC ≤ 0.85</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, background: '#f59e0b', borderRadius: 2 }} />
          <span>0.85 &lt; UC ≤ 1.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: 2 }} />
          <span>UC &gt; 1.0 (FAIL)</span>
        </div>
      </div>
    </div>
  );
};
