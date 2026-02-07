/**
 * Report Generator — HTML report with project info, results, and steel checks
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult } from '../fem/types';
import { IProjectInfo } from '../../context/FEMContext';
import { ISteelGrade } from '../standards/EurocodeNL';
import { checkAllBeams, ISectionProperties, ISteelCheckResult } from '../standards/SteelCheck';
import { calculateBeamLength } from '../fem/Beam';

interface ReportOptions {
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
  steelGrade: ISteelGrade;
  forceUnit: 'N' | 'kN' | 'MN';
}

function fmtForce(n: number, unit: 'N' | 'kN' | 'MN'): string {
  if (unit === 'MN') return (n / 1e6).toFixed(3) + ' MN';
  if (unit === 'kN') return (n / 1000).toFixed(1) + ' kN';
  return n.toFixed(0) + ' N';
}

function fmtMoment(nm: number, unit: 'N' | 'kN' | 'MN'): string {
  if (unit === 'MN') return (nm / 1e6).toFixed(3) + ' MNm';
  if (unit === 'kN') return (nm / 1000).toFixed(2) + ' kNm';
  return nm.toFixed(0) + ' Nm';
}

function fmtDisp(val: number): string {
  return (val * 1000).toFixed(3); // m -> mm
}

function ucColor(uc: number): string {
  if (uc <= 0.85) return '#22c55e';
  if (uc <= 1.0) return '#f59e0b';
  return '#ef4444';
}

function ucBar(uc: number): string {
  const pct = Math.min(uc * 100, 100);
  const color = ucColor(uc);
  return `<div style="display:inline-flex;align-items:center;gap:6px;width:120px">
    <div style="flex:1;height:8px;background:#333;border-radius:4px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
    </div>
    <span style="font-weight:700;color:${color}">${uc.toFixed(2)}</span>
  </div>`;
}

function fmtVal(v: number, decimals: number = 2): string {
  return v.toFixed(decimals);
}

/**
 * Render a transparent steel check detail block for one member,
 * showing NEN-EN 1993-1-1 norm formulas with filled-in values.
 */
function renderSteelCheckDetail(r: ISteelCheckResult, grade: ISteelGrade, forceUnit: 'N' | 'kN' | 'MN'): string {
  const fy = grade.fy;
  const gM0 = grade.gammaM0;

  // Convert to display units
  const divisor = forceUnit === 'MN' ? 1e6 : forceUnit === 'kN' ? 1000 : 1;
  const NEd_d = r.NEd / divisor;
  const VEd_d = r.VEd / divisor;
  const MEd_d = r.MEd / divisor;
  const NcRd_d = r.NcRd / divisor;
  const VcRd_d = r.VcRd / divisor;
  const McRd_d = r.McRd / divisor;
  const fUnit = forceUnit === 'MN' ? 'MN' : forceUnit === 'kN' ? 'kN' : 'N';
  const mUnit = forceUnit === 'MN' ? 'MNm' : forceUnit === 'kN' ? 'kNm' : 'Nm';

  return `
  <div class="steel-detail">
    <h4>Member ${r.elementId} — ${r.profileName} (${grade.name})</h4>

    <div class="check-block">
      <div class="check-title">Axial Resistance — NEN-EN 1993-1-1, 6.2.4</div>
      <div class="formula">N<sub>c,Rd</sub> = A &middot; f<sub>y</sub> / &gamma;<sub>M0</sub></div>
      <div class="formula-filled">N<sub>c,Rd</sub> = ${fmtVal(NcRd_d, 1)} ${fUnit} &nbsp; (f<sub>y</sub> = ${fy} MPa, &gamma;<sub>M0</sub> = ${gM0})</div>
      <div class="formula">UC = N<sub>Ed</sub> / N<sub>c,Rd</sub> = ${fmtVal(NEd_d, 1)} / ${fmtVal(NcRd_d, 1)} = <strong style="color:${ucColor(r.UC_N)}">${fmtVal(r.UC_N)}</strong></div>
    </div>

    <div class="check-block">
      <div class="check-title">Bending Resistance — NEN-EN 1993-1-1, 6.2.5</div>
      <div class="formula">M<sub>c,Rd</sub> = W<sub>el</sub> &middot; f<sub>y</sub> / &gamma;<sub>M0</sub></div>
      <div class="formula-filled">M<sub>c,Rd</sub> = ${fmtVal(McRd_d, 2)} ${mUnit}</div>
      <div class="formula">UC = M<sub>Ed</sub> / M<sub>c,Rd</sub> = ${fmtVal(MEd_d, 2)} / ${fmtVal(McRd_d, 2)} = <strong style="color:${ucColor(r.UC_M)}">${fmtVal(r.UC_M)}</strong></div>
    </div>

    <div class="check-block">
      <div class="check-title">Shear Resistance — NEN-EN 1993-1-1, 6.2.6</div>
      <div class="formula">V<sub>c,Rd</sub> = A<sub>v</sub> &middot; (f<sub>y</sub> / &radic;3) / &gamma;<sub>M0</sub></div>
      <div class="formula-filled">V<sub>c,Rd</sub> = ${fmtVal(VcRd_d, 1)} ${fUnit}</div>
      <div class="formula">UC = V<sub>Ed</sub> / V<sub>c,Rd</sub> = ${fmtVal(VEd_d, 1)} / ${fmtVal(VcRd_d, 1)} = <strong style="color:${ucColor(r.UC_V)}">${fmtVal(r.UC_V)}</strong></div>
    </div>

    <div class="check-block">
      <div class="check-title">Combined M + N — NEN-EN 1993-1-1, 6.2.8</div>
      <div class="formula">N<sub>Ed</sub> / N<sub>c,Rd</sub> + M<sub>Ed</sub> / M<sub>c,Rd</sub> &le; 1.0</div>
      <div class="formula-filled">${fmtVal(r.UC_N)} + ${fmtVal(r.UC_M)} = <strong style="color:${ucColor(r.UC_MN)}">${fmtVal(r.UC_MN)}</strong></div>
    </div>

    <div class="check-block">
      <div class="check-title">Combined M + V — NEN-EN 1993-1-1, 6.2.10</div>
      <div class="formula">${r.UC_MV > r.UC_M ? `V<sub>Ed</sub> &gt; 0.5 V<sub>c,Rd</sub> &rarr; reduced M<sub>v,Rd</sub>` : `V<sub>Ed</sub> &le; 0.5 V<sub>c,Rd</sub> &rarr; no reduction needed`}</div>
      <div class="formula-filled">UC = <strong style="color:${ucColor(r.UC_MV)}">${fmtVal(r.UC_MV)}</strong></div>
    </div>

    <div class="check-result ${r.status === 'OK' ? 'result-ok' : 'result-fail'}">
      Governing: ${r.governingCheck}${r.governingLocation ? ` at x = ${(r.governingLocation.position * 1000).toFixed(0)}mm (${r.governingLocation.locationType})` : ''} &mdash; UC<sub>max</sub> = ${fmtVal(r.UC_max)} &mdash; <strong>${r.status}</strong>
    </div>
  </div>`;
}

export function generateReport(opts: ReportOptions): string {
  const { mesh, result, projectInfo, steelGrade, forceUnit } = opts;

  // Steel checks
  let steelResults: ISteelCheckResult[] = [];
  if (result && result.beamForces.size > 0) {
    const sectionMap = new Map<number, ISectionProperties>();
    for (const beam of mesh.beamElements.values()) {
      sectionMap.set(beam.id, {
        A: beam.section.A,
        I: beam.section.I,
        h: beam.section.h,
        profileName: beam.profileName,
      });
    }
    steelResults = checkAllBeams(result.beamForces, sectionMap, steelGrade);
  }

  const allOk = steelResults.every(r => r.status === 'OK');
  const worstUC = steelResults.length > 0 ? Math.max(...steelResults.map(r => r.UC_max)) : 0;

  // Node summary
  const nodes = Array.from(mesh.nodes.values());
  const beams = Array.from(mesh.beamElements.values());

  // Build node index map for displacements
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  // Determine DOFs per node (frame = 3)
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;

  // Section counter
  let sectionNum = 0;
  const nextSection = () => ++sectionNum;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Structural Report — ${projectInfo.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; background: #f8f9fa; color: #1a1a2e; padding: 24px; font-size: 12px; line-height: 1.5; }
  .page { max-width: 850px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 28px 0 8px; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 16px 0 6px; color: #555; }
  h4 { font-size: 12px; margin: 12px 0 4px; color: #1a1a2e; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  th, td { padding: 5px 8px; text-align: right; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  th { background: #f1f5f9; font-weight: 600; color: #475569; }
  th:first-child, td:first-child { text-align: left; }
  .ok { color: #22c55e; font-weight: 700; }
  .fail { color: #ef4444; font-weight: 700; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 8px 0 16px; }
  .meta-label { color: #64748b; font-weight: 600; }
  .meta-value { color: #1a1a2e; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
  .summary-box { padding: 10px 16px; border-radius: 6px; margin: 12px 0; font-weight: 600; font-size: 13px; }
  .summary-ok { background: #f0fdf4; border: 1px solid #22c55e; color: #166534; }
  .summary-fail { background: #fef2f2; border: 1px solid #ef4444; color: #991b1b; }
  .steel-detail { background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 12px 0; page-break-inside: avoid; }
  .check-block { margin: 8px 0; padding: 6px 0; }
  .check-title { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 2px; }
  .formula { font-size: 11px; color: #64748b; font-style: italic; margin: 1px 0; padding-left: 12px; }
  .formula-filled { font-size: 11px; color: #1a1a2e; margin: 1px 0; padding-left: 12px; }
  .check-result { padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 8px; }
  .result-ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .result-fail { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .beam-forces-detail { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 10px 0; page-break-inside: avoid; }
  .beam-forces-detail h4 { border-bottom: none; margin-bottom: 6px; }
  .inline-table { width: auto; margin: 4px 0 8px; }
  .inline-table th, .inline-table td { padding: 3px 10px; font-size: 10px; }
  @media print { body { padding: 0; background: white; } .page { box-shadow: none; padding: 20px; } .steel-detail, .beam-forces-detail { break-inside: avoid; } }
</style>
</head>
<body>
<div class="page">

<h1>${projectInfo.name || 'Untitled Project'}</h1>
<p style="color:#64748b;margin-bottom:16px">Structural Calculation Report</p>

<h2>${nextSection()}. Project Information</h2>
<div class="meta-grid">
  <span class="meta-label">Engineer:</span><span class="meta-value">${projectInfo.engineer || '—'}</span>
  <span class="meta-label">Company:</span><span class="meta-value">${projectInfo.company || '—'}</span>
  <span class="meta-label">Date:</span><span class="meta-value">${projectInfo.date || '—'}</span>
  <span class="meta-label">Location:</span><span class="meta-value">${projectInfo.location || '—'}</span>
  <span class="meta-label">Description:</span><span class="meta-value">${projectInfo.description || '—'}</span>
  <span class="meta-label">Steel Grade:</span><span class="meta-value">${steelGrade.name} (f<sub>y</sub> = ${steelGrade.fy} MPa)</span>
</div>

<h2>${nextSection()}. Model Summary</h2>
<div class="meta-grid">
  <span class="meta-label">Nodes:</span><span class="meta-value">${nodes.length}</span>
  <span class="meta-label">Members:</span><span class="meta-value">${beams.length}</span>
  <span class="meta-label">Supports:</span><span class="meta-value">${nodes.filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation).length}</span>
</div>

<h3>Node Coordinates</h3>
<table>
  <tr><th>Node</th><th>X (m)</th><th>Y (m)</th><th>Supports</th></tr>
  ${nodes.map(n => {
    const sup = [];
    if (n.constraints.x) sup.push('X');
    if (n.constraints.y) sup.push('Y');
    if (n.constraints.rotation) sup.push('Rz');
    return `<tr><td>${n.id}</td><td>${n.x.toFixed(3)}</td><td>${n.y.toFixed(3)}</td><td>${sup.join(', ') || '—'}</td></tr>`;
  }).join('\n  ')}
</table>

<h3>Members</h3>
<table>
  <tr><th>ID</th><th>Nodes</th><th>Length (m)</th><th>Profile</th><th>A (cm²)</th><th>I (cm⁴)</th></tr>
  ${beams.map(b => {
    const ns = mesh.getBeamElementNodes(b);
    const L = ns ? calculateBeamLength(ns[0], ns[1]) : 0;
    return `<tr><td>${b.id}</td><td>${b.nodeIds.join('–')}</td><td>${L.toFixed(3)}</td><td>${b.profileName || '—'}</td><td>${(b.section.A * 1e4).toFixed(2)}</td><td>${(b.section.I * 1e8).toFixed(1)}</td></tr>`;
  }).join('\n  ')}
</table>

${result ? `
<h2>${nextSection()}. Reactions</h2>
<table>
  <tr><th>Node</th><th>R<sub>x</sub></th><th>R<sub>y</sub></th>${isFrame ? '<th>M<sub>z</sub></th>' : ''}</tr>
  ${(() => {
    let idx = 0;
    return nodes.map(n => {
      const i = idx++;
      const rx = n.constraints.x ? result.reactions[i * dofsPerNode] : 0;
      const ry = n.constraints.y ? result.reactions[i * dofsPerNode + 1] : 0;
      const mz = (isFrame && n.constraints.rotation) ? result.reactions[i * dofsPerNode + 2] : 0;
      if (!n.constraints.x && !n.constraints.y && !(isFrame && n.constraints.rotation)) return '';
      return `<tr><td>${n.id}</td><td>${fmtForce(rx, forceUnit)}</td><td>${fmtForce(ry, forceUnit)}</td>${isFrame ? `<td>${fmtMoment(mz, forceUnit)}</td>` : ''}</tr>`;
    }).filter(s => s).join('\n  ');
  })()}
</table>

<h2>${nextSection()}. Displacements</h2>
<table>
  <tr><th>Node</th><th>u<sub>x</sub> (mm)</th><th>u<sub>y</sub> (mm)</th>${isFrame ? '<th>&theta;<sub>z</sub> (mrad)</th>' : ''}</tr>
  ${nodes.map(n => {
    const idx = nodeIdToIndex.get(n.id);
    if (idx === undefined) return '';
    const ux = result.displacements[idx * dofsPerNode] ?? 0;
    const uy = result.displacements[idx * dofsPerNode + 1] ?? 0;
    const rz = isFrame ? (result.displacements[idx * dofsPerNode + 2] ?? 0) : 0;
    return `<tr><td>${n.id}</td><td>${fmtDisp(ux)}</td><td>${fmtDisp(uy)}</td>${isFrame ? `<td>${(rz * 1000).toFixed(3)}</td>` : ''}</tr>`;
  }).filter(s => s).join('\n  ')}
</table>

<h2>${nextSection()}. Member Internal Forces</h2>

<h3>Summary</h3>
<table>
  <tr><th>ID</th><th>N<sub>1</sub></th><th>V<sub>1</sub></th><th>M<sub>1</sub></th><th>N<sub>2</sub></th><th>V<sub>2</sub></th><th>M<sub>2</sub></th></tr>
  ${Array.from(result.beamForces.values()).map(f =>
    `<tr><td>${f.elementId}</td><td>${fmtForce(f.N1, forceUnit)}</td><td>${fmtForce(f.V1, forceUnit)}</td><td>${fmtMoment(f.M1, forceUnit)}</td><td>${fmtForce(f.N2, forceUnit)}</td><td>${fmtForce(f.V2, forceUnit)}</td><td>${fmtMoment(f.M2, forceUnit)}</td></tr>`
  ).join('\n  ')}
</table>

<h3>Per-Member Detail</h3>
${Array.from(result.beamForces.values()).map(f => {
  const beam = mesh.getBeamElement(f.elementId);
  const bNodes = beam ? mesh.getBeamElementNodes(beam) : null;
  const L = bNodes ? calculateBeamLength(bNodes[0], bNodes[1]) : 0;
  return `<div class="beam-forces-detail">
    <h4>Member ${f.elementId}${beam?.profileName ? ` — ${beam.profileName}` : ''} (L = ${L.toFixed(3)} m)</h4>
    <table class="inline-table">
      <tr><th>Location</th><th>N</th><th>V</th><th>M</th></tr>
      <tr><td>Node ${beam?.nodeIds[0] ?? '?'} (start)</td><td>${fmtForce(f.N1, forceUnit)}</td><td>${fmtForce(f.V1, forceUnit)}</td><td>${fmtMoment(f.M1, forceUnit)}</td></tr>
      <tr><td>Node ${beam?.nodeIds[1] ?? '?'} (end)</td><td>${fmtForce(f.N2, forceUnit)}</td><td>${fmtForce(f.V2, forceUnit)}</td><td>${fmtMoment(f.M2, forceUnit)}</td></tr>
      <tr style="font-weight:600"><td>Max |value|</td><td>${fmtForce(f.maxN, forceUnit)}</td><td>${fmtForce(f.maxV, forceUnit)}</td><td>${fmtMoment(f.maxM, forceUnit)}</td></tr>
    </table>
  </div>`;
}).join('\n')}
` : `<h2>${nextSection()}. Analysis Results</h2><p style="color:#94a3b8">No analysis results available. Run the solver first.</p>`}

${steelResults.length > 0 ? `
<h2>${nextSection()}. Steel Section Check — NEN-EN 1993-1-1</h2>
<p style="color:#64748b;margin-bottom:8px">Steel grade: ${steelGrade.name}, f<sub>y</sub> = ${steelGrade.fy} MPa, &gamma;<sub>M0</sub> = ${steelGrade.gammaM0}</p>

<h3>Summary</h3>
<table>
  <tr><th>ID</th><th>Profile</th><th>N<sub>Ed</sub></th><th>V<sub>Ed</sub></th><th>M<sub>Ed</sub></th><th>UC M</th><th>UC V</th><th>UC M+N</th><th>UC max</th><th>Governing</th><th>Status</th></tr>
  ${steelResults.map(r =>
    `<tr><td>${r.elementId}</td><td>${r.profileName}</td><td>${fmtForce(r.NEd, forceUnit)}</td><td>${fmtForce(r.VEd, forceUnit)}</td><td>${fmtMoment(r.MEd, forceUnit)}</td><td>${r.UC_M.toFixed(2)}</td><td>${r.UC_V.toFixed(2)}</td><td>${r.UC_MN.toFixed(2)}</td><td>${ucBar(r.UC_max)}</td><td>${r.governingCheck}</td><td class="${r.status === 'OK' ? 'ok' : 'fail'}">${r.status}</td></tr>`
  ).join('\n  ')}
</table>

<div class="summary-box ${allOk ? 'summary-ok' : 'summary-fail'}">
  ${steelResults.length} members checked — Max UC = ${worstUC.toFixed(2)} — ${allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}
</div>

<h3>Detailed Checks per Member</h3>
${steelResults.map(r => renderSteelCheckDetail(r, steelGrade, forceUnit)).join('\n')}
` : ''}

${projectInfo.notes ? `<h2>Notes</h2><p style="white-space:pre-wrap;color:#475569">${projectInfo.notes}</p>` : ''}

<div class="footer">
  Generated by Open FEM2D Studio | ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
</div>

</div>
</body>
</html>`;

  return html;
}

/**
 * Download the report as an HTML file
 */
export function downloadReport(opts: ReportOptions): void {
  const html = generateReport(opts);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.projectInfo.name || 'report'}_report.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
