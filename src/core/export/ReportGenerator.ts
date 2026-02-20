/**
 * Report Generator — HTML report with project info and results
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult } from '../fem/types';
import { IProjectInfo } from '../../context/FEMContext';
import { calculateBeamLength } from '../fem/Beam';

interface ReportOptions {
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
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

export function generateReport(opts: ReportOptions): string {
  const { mesh, result, projectInfo, forceUnit } = opts;

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

${projectInfo.notes ? `<h2>Notes</h2><p style="white-space:pre-wrap;color:#475569">${projectInfo.notes}</p>` : ''}

<div class="footer">
  Generated by Open FEM Studio | ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
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
