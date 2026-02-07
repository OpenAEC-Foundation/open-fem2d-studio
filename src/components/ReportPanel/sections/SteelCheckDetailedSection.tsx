/**
 * SteelCheckDetailedSection — Detailed steel checks with formulas per member
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useFEM } from '../../../context/FEMContext';
import { STEEL_GRADES } from '../../../core/standards/EurocodeNL';
import { checkAllBeams, ISectionProperties } from '../../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../../core/fem/Beam';

export const SteelCheckDetailedSection: React.FC<ReportSectionProps> = ({
  config,
  mesh,
  result,
  sectionNumber,
}) => {
  const { state } = useFEM();
  const { stressUnit, forceUnit, momentUnit, lengthUnit } = state;

  if (!result || result.beamForces.size === 0) {
    return (
      <div className="report-section" id="section-check_steel_detailed">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Steel Section Checks — Details
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No beam force results available.
        </p>
      </div>
    );
  }

  if (!config.includeFormulas) {
    return (
      <div className="report-section" id="section-check_steel_detailed">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Steel Section Checks — Details
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          Detailed formulas are disabled in report settings.
        </p>
      </div>
    );
  }

  const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2];

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

  const getUCColor = (uc: number): string => {
    if (uc <= 0.85) return '#22c55e';
    if (uc <= 1.0) return '#f59e0b';
    return '#ef4444';
  };

  const formatForce = (n: number): string => (n / 1000).toFixed(1);
  const formatMoment = (n: number): string => (n / 1000).toFixed(2);

  return (
    <>
      {steelResults.map((r, idx) => {
        const length = beamLengths.get(r.elementId) || 0;

        return (
          <div
            key={r.elementId}
            className="report-section"
            id={idx === 0 ? 'section-check_steel_detailed' : undefined}
          >
            {idx === 0 && (
              <h2 className="report-section-title" style={{ color: config.primaryColor }}>
                {sectionNumber}. Steel Section Checks — Details
              </h2>
            )}

            <div className="check-detail">
              <h4 style={{ color: config.primaryColor }}>
                Member {r.elementId} — {r.profileName} ({grade.name})
              </h4>

              <p style={{ fontSize: '9pt', color: '#666', marginBottom: 12 }}>
                L = {(length * 1000).toFixed(0)} {lengthUnit === 'm' ? 'mm' : lengthUnit} |{' '}
                f<sub>y</sub> = {grade.fy} {stressUnit} |{' '}
                γ<sub>M0</sub> = {grade.gammaM0}
              </p>

              {/* 6.2.4 Axial */}
              <div className="check-block">
                <div className="check-block-title">Axial Resistance — NEN-EN 1993-1-1, 6.2.4</div>
                <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                  N<sub>c,Rd</sub> = A · f<sub>y</sub> / γ<sub>M0</sub> = {formatForce(r.NcRd)} {forceUnit}
                </div>
                <p>
                  N<sub>Ed</sub> = {formatForce(r.NEd)} {forceUnit} →
                  UC = N<sub>Ed</sub> / N<sub>c,Rd</sub> ={' '}
                  <strong style={{ color: getUCColor(r.UC_N) }}>{r.UC_N.toFixed(3)}</strong>
                </p>
              </div>

              {/* 6.2.5 Bending */}
              <div className="check-block">
                <div className="check-block-title">Bending Resistance — NEN-EN 1993-1-1, 6.2.5</div>
                <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                  M<sub>c,Rd</sub> = W<sub>el</sub> · f<sub>y</sub> / γ<sub>M0</sub> = {formatMoment(r.McRd)} {momentUnit}
                </div>
                <p>
                  M<sub>Ed</sub> = {formatMoment(r.MEd)} {momentUnit} →
                  UC = M<sub>Ed</sub> / M<sub>c,Rd</sub> ={' '}
                  <strong style={{ color: getUCColor(r.UC_M) }}>{r.UC_M.toFixed(3)}</strong>
                </p>
              </div>

              {/* 6.2.6 Shear */}
              <div className="check-block">
                <div className="check-block-title">Shear Resistance — NEN-EN 1993-1-1, 6.2.6</div>
                <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                  V<sub>c,Rd</sub> = A<sub>v</sub> · (f<sub>y</sub> / √3) / γ<sub>M0</sub> = {formatForce(r.VcRd)} {forceUnit}
                </div>
                <p>
                  V<sub>Ed</sub> = {formatForce(r.VEd)} {forceUnit} →
                  UC = V<sub>Ed</sub> / V<sub>c,Rd</sub> ={' '}
                  <strong style={{ color: getUCColor(r.UC_V) }}>{r.UC_V.toFixed(3)}</strong>
                </p>
              </div>

              {/* 6.2.8 Combined M+N */}
              <div className="check-block">
                <div className="check-block-title">Combined Bending + Axial — NEN-EN 1993-1-1, 6.2.8</div>
                <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                  N<sub>Ed</sub>/N<sub>c,Rd</sub> + M<sub>Ed</sub>/M<sub>c,Rd</sub> ≤ 1.0
                </div>
                <p>
                  {r.UC_N.toFixed(3)} + {r.UC_M.toFixed(3)} ={' '}
                  <strong style={{ color: getUCColor(r.UC_MN) }}>{r.UC_MN.toFixed(3)}</strong>
                </p>
              </div>

              {/* 6.2.10 Combined M+V */}
              <div className="check-block">
                <div className="check-block-title">Combined Bending + Shear — NEN-EN 1993-1-1, 6.2.10</div>
                <p style={{ fontSize: '9pt' }}>
                  {r.VEd > 0.5 * r.VcRd
                    ? `V_Ed > 0.5·V_c,Rd → reduced bending resistance`
                    : `V_Ed ≤ 0.5·V_c,Rd → no reduction required`}
                </p>
                <p>
                  UC ={' '}
                  <strong style={{ color: getUCColor(r.UC_MV) }}>{r.UC_MV.toFixed(3)}</strong>
                </p>
              </div>

              {/* Buckling check (if applicable) */}
              {r.UC_buckling > 0 && (
                <div className="check-block">
                  <div className="check-block-title">Member Buckling — NEN-EN 1993-1-1, 6.3.1</div>
                  <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                    N<sub>b,Rd</sub> = χ · A · f<sub>y</sub> / γ<sub>M1</sub> = {formatForce(r.NbRd)} {forceUnit}
                  </div>
                  <p>
                    UC = N<sub>Ed</sub> / N<sub>b,Rd</sub> ={' '}
                    <strong style={{ color: getUCColor(r.UC_buckling) }}>{r.UC_buckling.toFixed(3)}</strong>
                  </p>
                </div>
              )}

              {/* LTB check (if applicable) */}
              {r.UC_LTB > 0 && (
                <div className="check-block">
                  <div className="check-block-title">Lateral Torsional Buckling — NEN-EN 1993-1-1, 6.3.2</div>
                  <div className="report-formula" style={{ borderLeftColor: config.primaryColor }}>
                    M<sub>b,Rd</sub> = χ<sub>LT</sub> · W<sub>y</sub> · f<sub>y</sub> / γ<sub>M1</sub> = {formatMoment(r.MbRd)} {momentUnit}
                  </div>
                  <p>
                    UC = M<sub>Ed</sub> / M<sub>b,Rd</sub> ={' '}
                    <strong style={{ color: getUCColor(r.UC_LTB) }}>{r.UC_LTB.toFixed(3)}</strong>
                  </p>
                </div>
              )}

              {/* Result */}
              <div className={`check-result ${r.status === 'OK' ? 'ok' : 'fail'}`}>
                Governing: {r.governingCheck}
                {r.governingLocation && (
                  <> at x = {(r.governingLocation.position * 1000).toFixed(0)}mm ({r.governingLocation.locationType})</>
                )} —
                UC<sub>max</sub> = {r.UC_max.toFixed(3)} —{' '}
                <strong>{r.status}</strong>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
