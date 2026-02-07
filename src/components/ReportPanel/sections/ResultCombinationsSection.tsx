/**
 * ResultCombinationsSection — Load combination definitions
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';

export const ResultCombinationsSection: React.FC<ReportSectionProps> = ({ config, loadCases, loadCombinations, sectionNumber }) => {
  if (loadCombinations.length === 0) {
    return (
      <div className="report-section" id="section-result_combinations">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Load Combinations
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No load combinations defined.
        </p>
      </div>
    );
  }

  // Create a map from load case ID to name
  const lcNames = new Map<number, string>();
  loadCases.forEach(lc => lcNames.set(lc.id, lc.name));

  return (
    <div className="report-section" id="section-result_combinations">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Load Combinations
      </h2>

      <p style={{ marginBottom: 16 }}>
        Load combinations according to EN 1990 (Eurocode 0).
      </p>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Name</th>
            <th>Eurocode</th>
            <th>Combination Expression</th>
          </tr>
        </thead>
        <tbody>
          {loadCombinations.map(combo => {
            // Build combination expression
            const terms: string[] = [];
            combo.factors.forEach((factor, lcId) => {
              if (factor !== 0) {
                const lcName = lcNames.get(lcId) || `LC${lcId}`;
                // Extract short name (e.g., "G" from "Dead Load (G)")
                const match = lcName.match(/\(([^)]+)\)/);
                const shortName = match ? match[1] : lcName;
                terms.push(`${factor.toFixed(2)} × ${shortName}`);
              }
            });

            // Map combo type to Eurocode reference
            const getEurocodeRef = (type: string, name: string): string => {
              const nameLower = name.toLowerCase();
              if (nameLower.includes('6.10a')) return 'EN 1990, 6.10a';
              if (nameLower.includes('6.10b')) return 'EN 1990, 6.10b';
              if (nameLower.includes('6.14')) return 'EN 1990, 6.14';
              if (nameLower.includes('6.16')) return 'EN 1990, 6.16';
              if (type === 'ULS') return 'EN 1990, 6.10';
              if (type === 'SLS') return 'EN 1990, 6.14';
              return type;
            };

            return (
              <tr key={combo.id}>
                <td>{combo.name}</td>
                <td>
                  <span style={{ fontSize: '9pt', color: '#475569' }}>
                    {getEurocodeRef(combo.type, combo.name)}
                  </span>
                </td>
                <td>{terms.join(' + ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="report-subsection-title" style={{ color: config.primaryColor }}>
        Combination Factors
      </h3>

      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>Combination</th>
            {loadCases.map(lc => (
              <th key={lc.id}>{lc.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loadCombinations.map(combo => (
            <tr key={combo.id}>
              <td>{combo.name}</td>
              {loadCases.map(lc => (
                <td key={lc.id} className="numeric">
                  {(combo.factors.get(lc.id) ?? 0).toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
