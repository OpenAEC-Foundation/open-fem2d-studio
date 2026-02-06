/**
 * SummarySection — 1-page executive summary with loads, max results, and quick checks
 */

import React, { useMemo } from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { STEEL_GRADES } from '../../../core/standards/EurocodeNL';
import { calculateBeamLength } from '../../../core/fem/Beam';

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
  // Checks
  momentCheck: { MEd: number; MRd: number; UC: number } | null;
  shearCheck: { VEd: number; VRd: number; UC: number } | null;
  displacementCheck: { delta: number; limit: number; span: number; UC: number } | null;
  // Info
  steelGrade: string;
  fy: number;
  allOk: boolean;
}

function ucColorClass(uc: number): string {
  if (uc <= 0.85) return 'ok';
  if (uc <= 1.0) return 'warning';
  return 'fail';
}

function ucColor(uc: number): string {
  if (uc <= 0.85) return '#22c55e';
  if (uc <= 1.0) return '#f59e0b';
  return '#ef4444';
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

    // Steel grade
    const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2]; // S355 default
    const fy = grade.fy * 1e6; // Pa
    const gammaM0 = grade.gammaM0;

    // Find the beam with the max moment for M check
    const maxMBeam = mesh.getBeamElement(maxMomentBeamId);
    let momentCheck: SummaryData['momentCheck'] = null;
    if (maxMBeam) {
      const section = maxMBeam.section;
      // Elastic section modulus Wy = I / (h/2)
      const Wy = section.Wy ?? (section.I / (section.h / 2));
      const MRd = (Wy * fy) / gammaM0;
      momentCheck = {
        MEd: maxMoment,
        MRd,
        UC: MRd > 0 ? maxMoment / MRd : 0,
      };
    }

    // Find the beam with the max shear for V check
    const maxVBeam = mesh.getBeamElement(maxShearBeamId);
    let shearCheck: SummaryData['shearCheck'] = null;
    if (maxVBeam) {
      const section = maxVBeam.section;
      // Shear area estimation
      let Av: number;
      if (section.tw && section.h) {
        const twM = section.tw;
        const tfM = section.tf ?? 0;
        const hw = section.h - 2 * tfM;
        Av = Math.max(hw * twM, section.A * 0.5);
      } else {
        Av = section.A * 0.6;
      }
      const VRd = (Av * (fy / Math.sqrt(3))) / gammaM0;
      shearCheck = {
        VEd: maxShear,
        VRd,
        UC: VRd > 0 ? maxShear / VRd : 0,
      };
    }

    // Displacement check: find longest span
    let maxSpan = 0;
    for (const beam of beams) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (nodes) {
        const L = calculateBeamLength(nodes[0], nodes[1]);
        if (L > maxSpan) maxSpan = L;
      }
    }
    const deflLimit = config.deflectionLimit || 250;
    const displacementLimit = maxSpan / deflLimit;
    let displacementCheck: SummaryData['displacementCheck'] = null;
    if (maxSpan > 0) {
      displacementCheck = {
        delta: maxDisplacement,
        limit: displacementLimit,
        span: maxSpan,
        UC: displacementLimit > 0 ? maxDisplacement / displacementLimit : 0,
      };
    }

    // Overall pass/fail
    const allOk = (
      (!momentCheck || momentCheck.UC <= 1.0) &&
      (!shearCheck || shearCheck.UC <= 1.0) &&
      (!displacementCheck || displacementCheck.UC <= 1.0)
    );

    return {
      pointLoads: allPointLoads,
      distributedLoads: allDistLoads,
      maxMoment,
      maxMomentBeamId,
      maxShear,
      maxShearBeamId,
      maxDisplacement,
      maxDisplacementNodeId,
      momentCheck,
      shearCheck,
      displacementCheck,
      steelGrade: grade.name,
      fy: grade.fy,
      allOk,
    };
  }, [mesh, result, loadCases, config]);

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

      {/* Overall status banner */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 6,
          marginBottom: 20,
          background: summary.allOk ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${summary.allOk ? '#bbf7d0' : '#fecaca'}`,
          color: summary.allOk ? '#166534' : '#991b1b',
          fontWeight: 600,
          fontSize: '11pt',
          textAlign: 'center',
        }}
      >
        {summary.allOk
          ? 'ALL QUICK CHECKS PASSED'
          : 'ONE OR MORE CHECKS EXCEED UNITY'}
      </div>

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

      {/* Quick checks */}
      <h3 className="report-subsection-title" style={{ color: config.primaryColor }}>
        Quick Checks ({summary.steelGrade}, f<sub>y</sub> = {summary.fy} MPa)
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Moment check */}
        {summary.momentCheck && (
          <CheckRow
            title="Bending Resistance"
            formula={
              <>
                M<sub>Ed</sub> / M<sub>el,Rd</sub> = {fmtMoment(summary.momentCheck.MEd)} / {fmtMoment(summary.momentCheck.MRd)} kNm
              </>
            }
            uc={summary.momentCheck.UC}
            reference="EN 1993-1-1, 6.2.5"
            primaryColor={config.primaryColor}
          />
        )}

        {/* Shear check */}
        {summary.shearCheck && (
          <CheckRow
            title="Shear Resistance"
            formula={
              <>
                V<sub>Ed</sub> / V<sub>c,Rd</sub> = {fmtForce(summary.shearCheck.VEd)} / {fmtForce(summary.shearCheck.VRd)} kN
              </>
            }
            uc={summary.shearCheck.UC}
            reference={<>EN 1993-1-1, 6.2.6 (A<sub>v</sub> &middot; f<sub>y</sub> / &radic;3)</>}
            primaryColor={config.primaryColor}
          />
        )}

        {/* Displacement check */}
        {summary.displacementCheck && (
          <CheckRow
            title="Deflection (SLS)"
            formula={
              <>
                &delta;<sub>max</sub> / (L/{config.deflectionLimit || 250}) = {fmtDisp(summary.displacementCheck.delta)} / {fmtDisp(summary.displacementCheck.limit)} mm
              </>
            }
            uc={summary.displacementCheck.UC}
            reference={`L = ${(summary.displacementCheck.span * 1000).toFixed(0)} mm, limit = L/${config.deflectionLimit || 250}`}
            primaryColor={config.primaryColor}
          />
        )}
      </div>

      <p style={{ color: '#888', fontSize: '8pt', marginTop: 16, fontStyle: 'italic' }}>
        Note: This is a simplified quick check using elastic section properties.
        Refer to the detailed steel check section for full EN 1993-1-1 verification including
        buckling and lateral torsional buckling.
      </p>
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

function CheckRow({ title, formula, uc, reference, primaryColor }: {
  title: string;
  formula: React.ReactNode;
  uc: number;
  reference: React.ReactNode;
  primaryColor: string;
}) {
  const cls = ucColorClass(uc);
  const color = ucColor(uc);
  const pct = Math.min(uc * 100, 100);

  return (
    <div
      style={{
        padding: '10px 14px',
        background: '#fafbfc',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        pageBreakInside: 'avoid',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: '10pt', color: primaryColor }}>{title}</span>
        <span className={`status-badge ${cls === 'warning' ? 'ok' : cls}`}>
          {uc <= 1.0 ? 'OK' : 'FAIL'}
        </span>
      </div>

      {/* Formula line */}
      <div
        style={{
          fontFamily: "'Times New Roman', serif",
          fontSize: '9.5pt',
          padding: '6px 10px',
          background: '#f5f5f5',
          borderLeft: `3px solid ${primaryColor}`,
          borderRadius: '0 4px 4px 0',
          marginBottom: 8,
        }}
      >
        {formula}
      </div>

      {/* UC bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 14, background: '#e5e5e5', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: color,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span
          style={{
            minWidth: 50,
            textAlign: 'right',
            fontWeight: 600,
            fontSize: '10pt',
            color,
          }}
        >
          {uc.toFixed(2)}
        </span>
      </div>

      {/* Reference */}
      <div style={{ fontSize: '7.5pt', color: '#94a3b8', marginTop: 4 }}>
        {reference}
      </div>
    </div>
  );
}
