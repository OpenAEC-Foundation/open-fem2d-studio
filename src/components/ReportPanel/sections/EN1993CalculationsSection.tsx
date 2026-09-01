import React from 'react';
import { useFEM, isSteelCheckResult } from '../../../context/FEMContext';
import { ReportSectionProps } from '../ReportPreview';
import { CheckBlock } from './CheckBlock';
import type { ResistanceCalc } from '../../../lib/types/steel/ResistanceCalc';
import type { StabilityCalc } from '../../../lib/types/steel/StabilityCalc';

export const EN1993CalculationsSection: React.FC<ReportSectionProps> = (props) => {
  const { state } = useFEM();
  const results = state.steelCheckResults;
  const sectionNumber = props.sectionNumber ?? 0;

  if (!results || results.length === 0) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">{sectionNumber}. EN 1993 / EN 1995 Member Checks – Calculations</h2>
        <p style={{ fontStyle: 'italic', color: '#666' }}>
          No member check results yet. Run the solver and click Run Checks.
        </p>
      </div>
    );
  }

  return (
    <>
      {results.map((r, beamIdx) => (
        <div
          key={r.beam_id}
          className="report-content-section"
          id={`section-en1993-calc-${r.beam_id}`}
        >
          <h2 className="report-section-title">
            {sectionNumber}.{beamIdx + 1} Beam {r.beam_id} –{' '}
            {isSteelCheckResult(r)
              ? `${r.profile_name} (${r.steel_grade})`
              : `${r.section_name} (${r.strength_class})`}
          </h2>
          {r.checks.map((nc, i) => {
            const checkData: ResistanceCalc | StabilityCalc = nc.kind.data;
            return <CheckBlock key={`${nc.id}-${i}`} check={checkData} />;
          })}
        </div>
      ))}
    </>
  );
};
