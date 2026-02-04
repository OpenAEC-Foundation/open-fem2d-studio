/**
 * InputLoadCasesSection — Load case definitions with tables
 * Uses canvas captures for diagrams when available
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useFEM } from '../../../context/FEMContext';

export const InputLoadCasesSection: React.FC<ReportSectionProps> = ({ config, loadCases, sectionNumber }) => {
  const { state } = useFEM();

  // Get canvas captures for load cases (captured from canvas when viewing each load case)
  const getLoadCaseCapture = (lcId: number): string | undefined => {
    return state.canvasCaptures.get(`loadcase_${lcId}`);
  };

  if (loadCases.length === 0) {
    return (
      <div className="report-section" id="section-input_loadcases">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber}. Load Cases
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No load cases defined.
        </p>
      </div>
    );
  }

  const formatLoadType = (type: string): string => {
    const types: Record<string, string> = {
      dead: 'Dead Load (G)',
      live: 'Live Load (Q)',
      wind: 'Wind (W)',
      snow: 'Snow (S)',
      other: 'Other',
    };
    return types[type] || type;
  };

  return (
    <div className="report-section" id="section-input_loadcases">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber}. Load Cases
      </h2>

      <p style={{ marginBottom: 16 }}>
        The following load cases are defined for the structural analysis.
      </p>

      {/* Summary table */}
      <table className="report-table">
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Point Loads</th>
            <th>Distributed Loads</th>
          </tr>
        </thead>
        <tbody>
          {loadCases.map(lc => (
            <tr key={lc.id}>
              <td>{lc.id}</td>
              <td>{lc.name}</td>
              <td>{formatLoadType(lc.type)}</td>
              <td className="numeric">{lc.pointLoads.length}</td>
              <td className="numeric">{lc.distributedLoads.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detail per load case with diagram */}
      {loadCases.map(lc => (
        <div key={lc.id} style={{ marginTop: 32, pageBreakInside: 'avoid' }}>
          <h3 className="report-subsection-title" style={{ color: config.primaryColor }}>
            {lc.name} ({formatLoadType(lc.type)})
          </h3>

          {/* Load diagram from canvas capture */}
          {(lc.pointLoads.length > 0 || lc.distributedLoads.length > 0) && (
            getLoadCaseCapture(lc.id) ? (
              <div className="diagram-container" style={{ marginBottom: 16 }}>
                <img
                  src={getLoadCaseCapture(lc.id)}
                  alt={`Load Case ${lc.name}`}
                  style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }}
                />
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic', marginBottom: 16 }}>
                No diagram captured for this load case. View the load case in the editor to capture it.
              </p>
            )
          )}

          {/* Point loads table */}
          {lc.pointLoads.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: '10pt' }}>Point Loads</p>
              <table className="report-table">
                <thead>
                  <tr style={{ background: config.primaryColor }}>
                    <th>Node</th>
                    <th>Fx (kN)</th>
                    <th>Fy (kN)</th>
                    <th>Mz (kNm)</th>
                  </tr>
                </thead>
                <tbody>
                  {lc.pointLoads.map((pl, idx) => (
                    <tr key={idx}>
                      <td>{pl.nodeId}</td>
                      <td className="numeric">{(pl.fx / 1000).toFixed(2)}</td>
                      <td className="numeric">{(pl.fy / 1000).toFixed(2)}</td>
                      <td className="numeric">{(pl.mz / 1000).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Distributed loads table */}
          {lc.distributedLoads.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: 8, marginTop: 12, fontSize: '10pt' }}>Distributed Loads</p>
              <table className="report-table">
                <thead>
                  <tr style={{ background: config.primaryColor }}>
                    <th>Element</th>
                    <th>qy Start (kN/m)</th>
                    <th>qy End (kN/m)</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Coord.</th>
                  </tr>
                </thead>
                <tbody>
                  {lc.distributedLoads.map((dl, idx) => (
                    <tr key={idx}>
                      <td>{dl.edgeId !== undefined ? `Edge ${dl.edgeId}` : `Beam ${dl.elementId}`}</td>
                      <td className="numeric">{(dl.qy / 1000).toFixed(2)}</td>
                      <td className="numeric">{((dl.qyEnd ?? dl.qy) / 1000).toFixed(2)}</td>
                      <td className="numeric">{((dl.startT ?? 0) * 100).toFixed(0)}%</td>
                      <td className="numeric">{((dl.endT ?? 1) * 100).toFixed(0)}%</td>
                      <td>{dl.coordSystem === 'global' ? 'Global' : 'Local'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {lc.pointLoads.length === 0 && lc.distributedLoads.length === 0 && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No loads in this load case.</p>
          )}
        </div>
      ))}
    </div>
  );
};
