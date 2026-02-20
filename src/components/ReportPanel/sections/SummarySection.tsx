/**
 * SummarySection — 1-page executive summary with loads, max results, and quick checks
 */

import React, { useMemo } from 'react';
import { ReportSectionProps } from '../ReportPreview';

interface SummaryData {
  // Loads
  pointLoads: { nodeId: number; fx: number; fy: number; mz: number }[];
  distributedLoads: { elementId: number; qy: number; qyEnd?: number; edgeId?: number }[];
  // Max results
  maxMoment: number;
  maxMomentBeamId: number;
  maxShear: number;
  maxShearBeamId: number;
  maxDisplacement: number;
  maxDisplacementNodeId: number;
}

export const SummarySection: React.FC<ReportSectionProps> = ({ config, mesh, result, loadCases, sectionNumber }) => {
  const summary = useMemo((): SummaryData | null => {
    // Collect all loads from all load cases
    const allPointLoads: SummaryData['pointLoads'] = [];
    const allDistLoads: SummaryData['distributedLoads'] = [];

    for (const lc of loadCases) {
      for (const pl of lc.pointLoads) {
        allPointLoads.push({ nodeId: pl.nodeId, fx: pl.fx, fy: pl.fy, mz: pl.mz });
      }
      for (const dl of lc.distributedLoads) {
        allDistLoads.push({ elementId: dl.elementId, qy: dl.qy, qyEnd: dl.qyEnd, edgeId: dl.edgeId });
      }
    }

    if (!result || result.beamForces.size === 0) return null;

    // Find max moment, shear, displacement
    let maxMoment = 0, maxMomentBeamId = 0;
    let maxShear = 0, maxShearBeamId = 0;
    for (const [beamId, forces] of result.beamForces) {
      const absM = Math.max(Math.abs(forces.maxM), Math.abs(forces.M1), Math.abs(forces.M2));
      const absV = Math.max(Math.abs(forces.maxV), Math.abs(forces.V1), Math.abs(forces.V2));
      if (absM > maxMoment) { maxMoment = absM; maxMomentBeamId = beamId; }
      if (absV > maxShear) { maxShear = absV; maxShearBeamId = beamId; }
    }

    // Max displacement
    const beams = Array.from(mesh.beamElements.values());
    const isFrame = beams.length > 0;
    const dofsPerNode = isFrame ? 3 : 2;
    const nodeIds = Array.from(mesh.nodes.keys());
    let maxDisplacement = 0, maxDisplacementNodeId = 0;
    for (let i = 0; i < nodeIds.length; i++) {
      const uy = Math.abs(result.displacements[i * dofsPerNode + 1] ?? 0);
      if (uy > maxDisplacement) {
        maxDisplacement = uy;
        maxDisplacementNodeId = nodeIds[i];
      }
    }

    return {
      pointLoads: allPointLoads,
      distributedLoads: allDistLoads,
      maxMoment,
      maxMomentBeamId,
      maxShear,
      maxShearBeamId,
      maxDisplacement,
      maxDisplacementNodeId,
    };
  }, [mesh, result, loadCases]);

  if (!summary) {
    return (
      <div className="report-section" id="section-summary">
        <h2 className="report-section-title" style={{ color: config.primaryColor }}>
          {sectionNumber ? `${sectionNumber}. ` : ''}Executive Summary
        </h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No analysis results available. Run the analysis to generate the summary.
        </p>
      </div>
    );
  }

  const fmtForce = (n: number) => (n / 1000).toFixed(2);
  const fmtMoment = (n: number) => (n / 1000).toFixed(2);
  const fmtDisp = (n: number) => (n * 1000).toFixed(2);

  return (
    <div className="report-section" id="section-summary">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        {sectionNumber ? `${sectionNumber}. ` : ''}Executive Summary
      </h2>

      {/* Key results grid */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <ResultCard
          label="Max Bending Moment"
          value={`${fmtMoment(summary.maxMoment)} kNm`}
          detail={`at Beam ${summary.maxMomentBeamId}`}
          color={config.primaryColor}
        />
        <ResultCard
          label="Max Shear Force"
          value={`${fmtForce(summary.maxShear)} kN`}
          detail={`at Beam ${summary.maxShearBeamId}`}
          color={config.primaryColor}
        />
        <ResultCard
          label="Max Displacement"
          value={`${fmtDisp(summary.maxDisplacement)} mm`}
          detail={`at Node ${summary.maxDisplacementNodeId}`}
          color={config.primaryColor}
        />
      </div>

      {/* Loads overview */}
      <h3 className="report-subsection-title" style={{ color: config.primaryColor }}>
        Applied Loads
      </h3>

      {summary.pointLoads.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, fontSize: '9pt', marginBottom: 6, color: '#475569' }}>
            Point Loads ({summary.pointLoads.length})
          </p>
          <table className="report-table" style={{ fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th>Node</th>
                <th>Fx (kN)</th>
                <th>Fy (kN)</th>
                <th>Mz (kNm)</th>
              </tr>
            </thead>
            <tbody>
              {summary.pointLoads.map((pl, idx) => (
                <tr key={idx}>
                  <td>{pl.nodeId}</td>
                  <td className="numeric">{fmtForce(pl.fx)}</td>
                  <td className="numeric">{fmtForce(pl.fy)}</td>
                  <td className="numeric">{fmtMoment(pl.mz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.distributedLoads.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, fontSize: '9pt', marginBottom: 6, color: '#475569' }}>
            Distributed Loads ({summary.distributedLoads.length})
          </p>
          <table className="report-table" style={{ fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th>Element</th>
                <th>qy Start (kN/m)</th>
                <th>qy End (kN/m)</th>
              </tr>
            </thead>
            <tbody>
              {summary.distributedLoads.map((dl, idx) => (
                <tr key={idx}>
                  <td>{dl.edgeId !== undefined ? `Edge ${dl.edgeId}` : `Beam ${dl.elementId}`}</td>
                  <td className="numeric">{fmtForce(dl.qy)}</td>
                  <td className="numeric">{fmtForce(dl.qyEnd ?? dl.qy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.pointLoads.length === 0 && summary.distributedLoads.length === 0 && (
        <p style={{ color: '#666', fontStyle: 'italic', marginBottom: 12 }}>No loads applied.</p>
      )}

    </div>
  );
};


/* --- Sub-components --- */

function ResultCard({ label, value, detail, color }: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        padding: '10px 14px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: '8pt', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: '13pt', fontWeight: 700, color: '#1e293b', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: '8pt', color: '#94a3b8', marginTop: 2 }}>
        {detail}
      </div>
    </div>
  );
}

