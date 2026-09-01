import React from 'react';
import { useFEM, isSteelCheckResult } from '../../../context/FEMContext';
import { ReportSectionProps } from '../ReportPreview';

export const EN1993SummarySection: React.FC<ReportSectionProps> = (props) => {
  const { state } = useFEM();
  const results = state.steelCheckResults;
  const sectionNumber = props.sectionNumber ?? 0;

  if (!results || results.length === 0) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">{sectionNumber}. EN 1993 / EN 1995 Member Checks – Summary</h2>
        <p style={{ fontStyle: 'italic', color: '#666' }}>
          No member check results yet. Run the solver and click Run Checks.
        </p>
      </div>
    );
  }

  return (
    <div className="report-section">
      <h2 className="report-section-title">{sectionNumber}. EN 1993 / EN 1995 Member Checks – Summary</h2>
      <table className="report-table">
        <thead>
          <tr>
            <th>Beam</th>
            <th>Profile</th>
            <th>Grade</th>
            <th>Class</th>
            <th>UC<sub>max</sub></th>
            <th>Governing</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr
              key={r.beam_id}
              style={r.status === 'NotOk' ? { backgroundColor: 'rgba(220, 38, 38, 0.08)' } : undefined}
            >
              <td>{r.beam_id}</td>
              <td>{isSteelCheckResult(r) ? r.profile_name : r.section_name}</td>
              <td>{isSteelCheckResult(r) ? r.steel_grade : r.strength_class}</td>
              <td>{isSteelCheckResult(r) ? r.classification.replace('Class', 'Class ') : '—'}</td>
              <td className="numeric"><strong>{r.uc_max.toFixed(2)}</strong></td>
              <td>{r.governing_check_id}</td>
              <td>
                {r.status === 'Ok' && <span style={{ color: '#16A34A' }}>✓ OK</span>}
                {r.status === 'NotOk' && <span style={{ color: '#DC2626' }}>✗ NOT OK</span>}
                {r.status === 'NotApplicable' && <span style={{ color: '#888' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
