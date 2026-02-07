/**
 * Report Generator — HTML/PDF export with configurable sections
 * Generates professional structural engineering reports
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult } from '../fem/types';
import { IProjectInfo } from '../../context/FEMContext';
import { ILoadCase, ILoadCombination } from '../fem/LoadCase';
import { IReportConfig, getEnabledSections, ReportSectionType } from './ReportConfig';
import { STEEL_GRADES } from '../standards/EurocodeNL';
import { checkAllBeams, ISectionProperties } from '../standards/SteelCheck';
import { calculateBeamLength } from '../fem/Beam';
import { renderGeometry, renderForceDiagram } from './DiagramRenderer';

export interface ReportData {
  config: IReportConfig;
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
}

// Format helpers
function formatForce(n: number): string {
  return (n / 1000).toFixed(2);
}

function formatMoment(n: number): string {
  return (n / 1000).toFixed(2);
}

function formatDisp(val: number): string {
  return (val * 1000).toFixed(3);
}

function ucColor(uc: number): string {
  if (uc <= 0.85) return '#22c55e';
  if (uc <= 1.0) return '#f59e0b';
  return '#ef4444';
}

function ucBar(uc: number): string {
  const pct = Math.min(uc * 100, 100);
  const color = ucColor(uc);
  return `<div style="display:inline-flex;align-items:center;gap:6px;width:140px">
    <div style="flex:1;height:14px;background:#e5e5e5;border-radius:2px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
    </div>
    <span style="font-weight:600;color:${color};min-width:40px;text-align:right">${uc.toFixed(2)}</span>
  </div>`;
}

// Section generators
function generateCoverHTML(data: ReportData): string {
  const { config, projectInfo } = data;
  const today = projectInfo.date || new Date().toLocaleDateString('nl-NL');

  return `
  <div class="report-page cover-page">
    <div style="background:${config.primaryColor};height:8px;margin:-20mm -20mm 40px -20mm;width:calc(100% + 40mm)"></div>
    <h1 style="color:${config.primaryColor};font-size:24pt;margin-bottom:8px">Constructieadvies & berekeningen</h1>
    <h2 style="color:${config.accentColor};font-size:16pt;margin-bottom:60px">${projectInfo.name || 'Untitled Project'}</h2>

    <table class="cover-table" style="margin-bottom:40px">
      <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">Project</td><td>${projectInfo.projectNumber ? `${projectInfo.projectNumber} - ` : ''}${projectInfo.name || 'Untitled Project'}</td></tr>
      ${projectInfo.company ? `<tr><td style="color:${config.primaryColor};font-weight:600">In opdracht van</td><td>${projectInfo.company}</td></tr>` : ''}
      ${projectInfo.location ? `<tr><td></td><td>${projectInfo.location}</td></tr>` : ''}
      ${projectInfo.description ? `<tr><td style="color:${config.primaryColor};font-weight:600">Omschrijving</td><td>${projectInfo.description}</td></tr>` : ''}
    </table>

    <table class="cover-table" style="margin-bottom:40px">
      <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">Adviseur</td><td>${config.companyName}</td></tr>
      ${projectInfo.engineer ? `<tr><td style="color:${config.primaryColor};font-weight:600">Verantwoordelijk constructeur</td><td>${projectInfo.engineer}</td></tr>` : ''}
      <tr><td style="color:${config.primaryColor};font-weight:600">Toegepaste Normen</td><td>NEN-EN 1990 t/m 1997</td></tr>
    </table>

    <div style="border-top:1px solid ${config.primaryColor};padding-top:16px">
      <table class="cover-table">
        <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">Datum rapport</td><td>${today}</td></tr>
        <tr><td style="color:${config.primaryColor};font-weight:600">Rapportstatus</td><td>Ter goedkeuring</td></tr>
      </table>
    </div>

    <div style="position:absolute;bottom:40px;right:40px">
      <span style="color:${config.primaryColor};font-weight:bold;font-size:14pt">${config.companyName}</span>
    </div>
  </div>`;
}

function generateTocHTML(data: ReportData): string {
  const { config } = data;
  const enabledSections = getEnabledSections(config);
  let sectionNum = 0;

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">Inhoudsopgave</h2>
    <div style="margin-top:20px">
      ${enabledSections.map(s => {
        if (s.category !== 'header') sectionNum++;
        const numStr = s.category !== 'header' ? `${sectionNum}. ` : '';
        return `<div style="padding:4px 0;border-bottom:1px dotted #ccc">${numStr}${s.name}</div>`;
      }).join('\n')}
    </div>
  </div>`;
}

function generateSummaryHTML(data: ReportData): string {
  const { config, mesh, result, loadCases } = data;
  if (!result || result.beamForces.size === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">Executive Summary</h2><p>No analysis results available.</p></div>`;
  }

  const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2];
  const fy = grade.fy * 1e6;
  const gammaM0 = grade.gammaM0;

  // Find max M, V, displacement
  let maxM = 0, maxMBeam = 0, maxV = 0, maxVBeam = 0;
  for (const [beamId, forces] of result.beamForces) {
    const absM = Math.max(Math.abs(forces.maxM), Math.abs(forces.M1), Math.abs(forces.M2));
    const absV = Math.max(Math.abs(forces.maxV), Math.abs(forces.V1), Math.abs(forces.V2));
    if (absM > maxM) { maxM = absM; maxMBeam = beamId; }
    if (absV > maxV) { maxV = absV; maxVBeam = beamId; }
  }

  const beams = Array.from(mesh.beamElements.values());
  const dofsPerNode = beams.length > 0 ? 3 : 2;
  const nodeIds = Array.from(mesh.nodes.keys());
  let maxDisp = 0, maxDispNode = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const uy = Math.abs(result.displacements[i * dofsPerNode + 1] ?? 0);
    if (uy > maxDisp) { maxDisp = uy; maxDispNode = nodeIds[i]; }
  }

  // Moment check
  const mBeam = mesh.getBeamElement(maxMBeam);
  let mUC = '—', mStatus = '';
  if (mBeam) {
    const Wy = mBeam.section.Wy ?? (mBeam.section.I / (mBeam.section.h / 2));
    const MRd = (Wy * fy) / gammaM0;
    const uc = MRd > 0 ? maxM / MRd : 0;
    mUC = uc.toFixed(2);
    mStatus = uc <= 1.0 ? 'ok' : 'fail';
  }

  // Shear check
  const vBeam = mesh.getBeamElement(maxVBeam);
  let vUC = '—', vStatus = '';
  if (vBeam) {
    const sec = vBeam.section;
    let Av: number;
    if (sec.tw && sec.h) {
      const twM = sec.tw; const tfM = sec.tf ?? 0; const hw = sec.h - 2 * tfM;
      Av = Math.max(hw * twM, sec.A * 0.5);
    } else { Av = sec.A * 0.6; }
    const VRd = (Av * (fy / Math.sqrt(3))) / gammaM0;
    const uc = VRd > 0 ? maxV / VRd : 0;
    vUC = uc.toFixed(2);
    vStatus = uc <= 1.0 ? 'ok' : 'fail';
  }

  // Displacement check
  let maxSpan = 0;
  for (const beam of beams) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (nodes) { const L = calculateBeamLength(nodes[0], nodes[1]); if (L > maxSpan) maxSpan = L; }
  }
  const dLimit = maxSpan / (config.deflectionLimit || 250);
  const dUC = dLimit > 0 ? (maxDisp / dLimit).toFixed(2) : '—';
  const dStatus = dLimit > 0 && maxDisp / dLimit <= 1.0 ? 'ok' : (dLimit > 0 ? 'fail' : '');

  // Collect loads
  let plRows = '', dlRows = '';
  for (const lc of loadCases) {
    for (const pl of lc.pointLoads) {
      plRows += `<tr><td>${pl.nodeId}</td><td class="numeric">${formatForce(pl.fx)}</td><td class="numeric">${formatForce(pl.fy)}</td><td class="numeric">${formatMoment(pl.mz)}</td></tr>`;
    }
    for (const dl of lc.distributedLoads) {
      dlRows += `<tr><td>${dl.edgeId !== undefined ? `Edge ${dl.edgeId}` : `Beam ${dl.elementId}`}</td><td class="numeric">${formatForce(dl.qy)}</td><td class="numeric">${formatForce(dl.qyEnd ?? dl.qy)}</td></tr>`;
    }
  }

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">Executive Summary</h2>

    <div style="padding:12px;border-radius:6px;margin-bottom:20px;background:${mStatus !== 'fail' && vStatus !== 'fail' && dStatus !== 'fail' ? '#f0fdf4' : '#fef2f2'};border:1px solid ${mStatus !== 'fail' && vStatus !== 'fail' && dStatus !== 'fail' ? '#bbf7d0' : '#fecaca'};color:${mStatus !== 'fail' && vStatus !== 'fail' && dStatus !== 'fail' ? '#166534' : '#991b1b'};font-weight:600;font-size:11pt;text-align:center">
      ${mStatus !== 'fail' && vStatus !== 'fail' && dStatus !== 'fail' ? 'ALL QUICK CHECKS PASSED' : 'ONE OR MORE CHECKS EXCEED UNITY'}
    </div>

    <div style="display:flex;gap:12px;margin-bottom:20px">
      <div style="flex:1;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:4px solid ${config.primaryColor}">
        <div style="font-size:8pt;color:#64748b;font-weight:600">MAX BENDING MOMENT</div>
        <div style="font-size:13pt;font-weight:700;color:#1e293b;margin-top:4px">${formatMoment(maxM)} kNm</div>
        <div style="font-size:8pt;color:#94a3b8;margin-top:2px">at Beam ${maxMBeam}</div>
      </div>
      <div style="flex:1;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:4px solid ${config.primaryColor}">
        <div style="font-size:8pt;color:#64748b;font-weight:600">MAX SHEAR FORCE</div>
        <div style="font-size:13pt;font-weight:700;color:#1e293b;margin-top:4px">${formatForce(maxV)} kN</div>
        <div style="font-size:8pt;color:#94a3b8;margin-top:2px">at Beam ${maxVBeam}</div>
      </div>
      <div style="flex:1;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:4px solid ${config.primaryColor}">
        <div style="font-size:8pt;color:#64748b;font-weight:600">MAX DISPLACEMENT</div>
        <div style="font-size:13pt;font-weight:700;color:#1e293b;margin-top:4px">${formatDisp(maxDisp)} mm</div>
        <div style="font-size:8pt;color:#94a3b8;margin-top:2px">at Node ${maxDispNode}</div>
      </div>
    </div>

    <h3 class="subsection-title" style="color:${config.primaryColor}">Applied Loads</h3>
    ${plRows ? `<p style="font-weight:600;font-size:9pt;margin-bottom:6px;color:#475569">Point Loads</p>
    <table class="data-table"><thead><tr style="background:${config.primaryColor}"><th>Node</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Mz (kNm)</th></tr></thead><tbody>${plRows}</tbody></table>` : ''}
    ${dlRows ? `<p style="font-weight:600;font-size:9pt;margin-bottom:6px;color:#475569">Distributed Loads</p>
    <table class="data-table"><thead><tr style="background:${config.primaryColor}"><th>Element</th><th>qy Start (kN/m)</th><th>qy End (kN/m)</th></tr></thead><tbody>${dlRows}</tbody></table>` : ''}
    ${!plRows && !dlRows ? '<p style="color:#666;font-style:italic">No loads applied.</p>' : ''}

    <h3 class="subsection-title" style="color:${config.primaryColor}">Quick Checks (${grade.name}, f<sub>y</sub> = ${grade.fy} MPa)</h3>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Check</th><th>Reference</th><th>Unity Check</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>M<sub>Ed</sub> / M<sub>el,Rd</sub></td><td>NEN-EN 1993-1-1, 6.2.5</td><td class="numeric">${mUC}</td><td><span class="status-badge ${mStatus}">${mStatus === 'ok' ? 'OK' : mStatus === 'fail' ? 'FAIL' : '—'}</span></td></tr>
        <tr><td>V<sub>Ed</sub> / V<sub>c,Rd</sub></td><td>NEN-EN 1993-1-1, 6.2.6</td><td class="numeric">${vUC}</td><td><span class="status-badge ${vStatus}">${vStatus === 'ok' ? 'OK' : vStatus === 'fail' ? 'FAIL' : '—'}</span></td></tr>
        <tr><td>&delta;<sub>max</sub> / (L/${config.deflectionLimit || 250})</td><td>SLS limit</td><td class="numeric">${dUC}</td><td><span class="status-badge ${dStatus}">${dStatus === 'ok' ? 'OK' : dStatus === 'fail' ? 'FAIL' : '—'}</span></td></tr>
      </tbody>
    </table>
    <p style="font-size:8pt;color:#94a3b8;margin-top:16px;font-style:italic">Note: Simplified quick check using elastic section properties. See detailed steel check section for full NEN-EN 1993-1-1 verification.</p>
  </div>`;
}

function generateInputNodesHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh } = data;
  const nodes = Array.from(mesh.nodes.values());

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Node Coordinates</h2>
    <p>The model consists of ${nodes.length} nodes.</p>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Node</th><th>X (m)</th><th>Y (m)</th><th>Supports</th></tr></thead>
      <tbody>
        ${nodes.map(n => {
          const sup = [];
          if (n.constraints.x) sup.push('X');
          if (n.constraints.y) sup.push('Y');
          if (n.constraints.rotation) sup.push('Rz');
          return `<tr><td>${n.id}</td><td class="numeric">${n.x.toFixed(3)}</td><td class="numeric">${n.y.toFixed(3)}</td><td>${sup.join(', ') || '—'}</td></tr>`;
        }).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateInputMembersHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh } = data;
  const beams = Array.from(mesh.beamElements.values());

  if (beams.length === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Members</h2><p>No beam elements in this model.</p></div>`;
  }

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Members</h2>
    <p>The structure consists of ${beams.length} beam element${beams.length !== 1 ? 's' : ''}.</p>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>ID</th><th>Start</th><th>End</th><th>Length (m)</th><th>Profile</th></tr></thead>
      <tbody>
        ${beams.map(b => {
          const nodes = mesh.getBeamElementNodes(b);
          const L = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;
          return `<tr><td>${b.id}</td><td>${b.nodeIds[0]}</td><td>${b.nodeIds[1]}</td><td class="numeric">${L.toFixed(3)}</td><td>${b.profileName || '—'}</td></tr>`;
        }).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateResultReactionsHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh, result } = data;
  if (!result) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Reaction Forces</h2><p>No analysis results available.</p></div>`;
  }

  const nodes = Array.from(mesh.nodes.values());
  const beams = Array.from(mesh.beamElements.values());
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  const supportNodes = nodes.filter(n => n.constraints.x || n.constraints.y || (isFrame && n.constraints.rotation));

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Reaction Forces</h2>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Node</th><th>R<sub>x</sub> (kN)</th><th>R<sub>y</sub> (kN)</th>${isFrame ? '<th>M<sub>z</sub> (kNm)</th>' : ''}</tr></thead>
      <tbody>
        ${supportNodes.map(n => {
          const idx = nodeIdToIndex.get(n.id);
          if (idx === undefined) return '';
          const rx = n.constraints.x ? result.reactions[idx * dofsPerNode] : 0;
          const ry = n.constraints.y ? result.reactions[idx * dofsPerNode + 1] : 0;
          const mz = isFrame && n.constraints.rotation ? result.reactions[idx * dofsPerNode + 2] : 0;
          return `<tr><td>${n.id}</td><td class="numeric">${n.constraints.x ? formatForce(rx) : '—'}</td><td class="numeric">${n.constraints.y ? formatForce(ry) : '—'}</td>${isFrame ? `<td class="numeric">${n.constraints.rotation ? formatMoment(mz) : '—'}</td>` : ''}</tr>`;
        }).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateResultDisplacementsHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh, result } = data;
  if (!result) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Displacements</h2><p>No analysis results available.</p></div>`;
  }

  const nodes = Array.from(mesh.nodes.values());
  const beams = Array.from(mesh.beamElements.values());
  const isFrame = beams.length > 0;
  const dofsPerNode = isFrame ? 3 : 2;
  const nodeIds = Array.from(mesh.nodes.keys());
  const nodeIdToIndex = new Map<number, number>();
  nodeIds.forEach((id, idx) => nodeIdToIndex.set(id, idx));

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Displacements</h2>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Node</th><th>u<sub>x</sub> (mm)</th><th>u<sub>y</sub> (mm)</th>${isFrame ? '<th>θ<sub>z</sub> (mrad)</th>' : ''}</tr></thead>
      <tbody>
        ${nodes.map(n => {
          const idx = nodeIdToIndex.get(n.id);
          if (idx === undefined) return '';
          const ux = result.displacements[idx * dofsPerNode] ?? 0;
          const uy = result.displacements[idx * dofsPerNode + 1] ?? 0;
          const rz = isFrame ? (result.displacements[idx * dofsPerNode + 2] ?? 0) : 0;
          return `<tr><td>${n.id}</td><td class="numeric">${formatDisp(ux)}</td><td class="numeric">${formatDisp(uy)}</td>${isFrame ? `<td class="numeric">${(rz * 1000).toFixed(3)}</td>` : ''}</tr>`;
        }).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateSteelCheckOverviewHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh, result } = data;
  if (!result || result.beamForces.size === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Steel Section Checks — Overview</h2><p>No beam force results available.</p></div>`;
  }

  const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2];
  const sectionMap = new Map<number, ISectionProperties>();
  const beamLengths = new Map<number, number>();

  for (const beam of mesh.beamElements.values()) {
    sectionMap.set(beam.id, {
      A: beam.section.A,
      I: beam.section.I,
      h: beam.section.h,
      profileName: beam.profileName,
    });
    const nodes = mesh.getBeamElementNodes(beam);
    if (nodes) beamLengths.set(beam.id, calculateBeamLength(nodes[0], nodes[1]));
  }

  const steelResults = checkAllBeams(result.beamForces, sectionMap, grade, beamLengths, undefined, config.deflectionLimit);
  const allOk = steelResults.every(r => r.status === 'OK');
  const worstUC = steelResults.length > 0 ? Math.max(...steelResults.map(r => r.UC_max)) : 0;

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Steel Section Checks — Overview</h2>
    <p>Cross-section resistance checks according to NEN-EN 1993-1-1. Steel grade: <strong>${grade.name}</strong> (f<sub>y</sub> = ${grade.fy} MPa)</p>

    <div class="${allOk ? 'result-ok' : 'result-fail'}" style="padding:12px;border-radius:4px;margin:16px 0">
      ${steelResults.length} member${steelResults.length !== 1 ? 's' : ''} checked — Max UC = ${worstUC.toFixed(2)} — <strong>${allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}</strong>
    </div>

    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Beam</th><th>Profile</th><th>N<sub>Ed</sub> (kN)</th><th>V<sub>Ed</sub> (kN)</th><th>M<sub>Ed</sub> (kNm)</th><th>UC max</th><th>Status</th></tr></thead>
      <tbody>
        ${steelResults.map(r => `
          <tr>
            <td>${r.elementId}</td>
            <td>${r.profileName}</td>
            <td class="numeric">${formatForce(r.NEd)}</td>
            <td class="numeric">${formatForce(r.VEd)}</td>
            <td class="numeric">${formatMoment(r.MEd)}</td>
            <td>${ucBar(r.UC_max)}</td>
            <td><span class="status-badge ${r.status === 'OK' ? 'ok' : 'fail'}">${r.status}</span></td>
          </tr>
        `).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateInputGeometryHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh } = data;
  if (mesh.nodes.size === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Model Geometry</h2><p>No geometry defined.</p></div>`;
  }

  const geometrySvg = renderGeometry(mesh, { width: 650, height: 300, showGrid: true, showDimensions: true });

  const triangleCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 3).length;
  const quadCount = Array.from(mesh.elements.values()).filter(e => e.nodeIds.length === 4).length;

  let summary = `${mesh.nodes.size} nodes, ${mesh.beamElements.size} beams`;
  if (triangleCount > 0) summary += `, ${triangleCount} triangles`;
  if (quadCount > 0) summary += `, ${quadCount} quads`;

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Model Geometry</h2>
    <div style="border:1px solid #e5e7eb;border-radius:4px;padding:8px;margin:12px 0;background:#fafbfc">
      ${geometrySvg}
    </div>
    <p style="font-size:9pt;color:#666"><strong>Model summary:</strong> ${summary}</p>
  </div>`;
}

function generateInputProfilesHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh } = data;
  const beams = Array.from(mesh.beamElements.values());

  if (beams.length === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Profile Properties</h2><p>No profiles defined.</p></div>`;
  }

  interface ProfileEntry {
    A: number; I: number; h: number; count: number;
    b?: number; tw?: number; tf?: number;
    Iy?: number; Iz?: number; Wy?: number; Wz?: number;
    Wply?: number; Wplz?: number; It?: number;
  }
  const profiles = new Map<string, ProfileEntry>();
  for (const beam of beams) {
    const key = beam.profileName || `Custom-${beam.section.A.toExponential(2)}`;
    const existing = profiles.get(key);
    if (existing) {
      existing.count++;
    } else {
      profiles.set(key, {
        A: beam.section.A, I: beam.section.I, h: beam.section.h, count: 1,
        b: beam.section.b, tw: beam.section.tw, tf: beam.section.tf,
        Iy: beam.section.Iy, Iz: beam.section.Iz,
        Wy: beam.section.Wy, Wz: beam.section.Wz,
        Wply: beam.section.Wply, Wplz: beam.section.Wplz,
        It: beam.section.It,
      });
    }
  }

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Profile Properties</h2>
    <p>The following section profiles are used in the structural model.</p>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Profile</th><th>A (cm²)</th><th>I<sub>y</sub> (cm⁴)</th><th>I<sub>z</sub> (cm⁴)</th><th>W<sub>el,y</sub> (cm³)</th><th>W<sub>pl,y</sub> (cm³)</th><th>h (mm)</th><th>Used</th></tr></thead>
      <tbody>
        ${Array.from(profiles.entries()).map(([name, p]) => {
          const Iy = ((p.Iy ?? p.I) * 1e8).toFixed(1);
          const Iz = p.Iz ? (p.Iz * 1e8).toFixed(1) : '—';
          const Wy = p.Wy ? (p.Wy * 1e6).toFixed(1) : '—';
          const Wply = p.Wply ? (p.Wply * 1e6).toFixed(1) : '—';
          return `<tr><td>${name}</td><td class="numeric">${(p.A * 1e4).toFixed(2)}</td><td class="numeric">${Iy}</td><td class="numeric">${Iz}</td><td class="numeric">${Wy}</td><td class="numeric">${Wply}</td><td class="numeric">${(p.h * 1000).toFixed(0)}</td><td class="numeric">${p.count}×</td></tr>`;
        }).join('\n')}
      </tbody>
    </table>
    <p style="font-size:9pt;color:#666">A = cross-sectional area, I<sub>y</sub>/I<sub>z</sub> = second moment of area (strong/weak axis), W<sub>el,y</sub> = elastic section modulus, W<sub>pl,y</sub> = plastic section modulus, h = section height</p>
  </div>`;
}

function generateInputLoadCasesHTML(data: ReportData, sectionNum: number): string {
  const { config, loadCases } = data;

  if (loadCases.length === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Load Cases</h2><p>No load cases defined.</p></div>`;
  }

  const formatType = (t: string) => ({ dead: 'Dead Load (G)', live: 'Live Load (Q)', wind: 'Wind (W)', snow: 'Snow (S)' }[t] || t);

  let html = `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Load Cases</h2>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>ID</th><th>Name</th><th>Type</th><th>Point Loads</th><th>Dist. Loads</th></tr></thead>
      <tbody>
        ${loadCases.map(lc => `<tr><td>${lc.id}</td><td>${lc.name}</td><td>${formatType(lc.type)}</td><td class="numeric">${lc.pointLoads.length}</td><td class="numeric">${lc.distributedLoads.length}</td></tr>`).join('\n')}
      </tbody>
    </table>`;

  for (const lc of loadCases) {
    html += `<h3 class="subsection-title" style="color:${config.primaryColor};margin-top:20px">${lc.name}</h3>`;
    if (lc.pointLoads.length > 0) {
      html += `
      <p style="font-weight:600;margin-bottom:8px">Point Loads</p>
      <table class="data-table">
        <thead><tr style="background:${config.primaryColor}"><th>Node</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Mz (kNm)</th></tr></thead>
        <tbody>
          ${lc.pointLoads.map(pl => `<tr><td>${pl.nodeId}</td><td class="numeric">${(pl.fx / 1000).toFixed(2)}</td><td class="numeric">${(pl.fy / 1000).toFixed(2)}</td><td class="numeric">${(pl.mz / 1000).toFixed(2)}</td></tr>`).join('\n')}
        </tbody>
      </table>`;
    }
    if (lc.distributedLoads.length > 0) {
      html += `
      <p style="font-weight:600;margin:12px 0 8px">Distributed Loads</p>
      <table class="data-table">
        <thead><tr style="background:${config.primaryColor}"><th>Element</th><th>qx (kN/m)</th><th>qy (kN/m)</th></tr></thead>
        <tbody>
          ${lc.distributedLoads.map(dl => `<tr><td>${dl.edgeId !== undefined ? `Edge ${dl.edgeId}` : `Beam ${dl.elementId}`}</td><td class="numeric">${(dl.qx / 1000).toFixed(2)}</td><td class="numeric">${(dl.qy / 1000).toFixed(2)}</td></tr>`).join('\n')}
        </tbody>
      </table>`;
    }
    if (lc.pointLoads.length === 0 && lc.distributedLoads.length === 0) {
      html += `<p style="color:#666;font-style:italic">No loads in this load case.</p>`;
    }
  }

  html += '</div>';
  return html;
}

function generateResultCombinationsHTML(data: ReportData, sectionNum: number): string {
  const { config, loadCases, loadCombinations } = data;

  if (loadCombinations.length === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Load Combinations</h2><p>No load combinations defined.</p></div>`;
  }

  const lcNames = new Map<number, string>();
  loadCases.forEach(lc => lcNames.set(lc.id, lc.name));

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Load Combinations</h2>
    <p>Load combinations according to EN 1990.</p>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>ID</th><th>Name</th><th>Type</th><th>Expression</th></tr></thead>
      <tbody>
        ${loadCombinations.map(c => {
          const terms: string[] = [];
          c.factors.forEach((factor, lcId) => {
            if (factor !== 0) {
              const name = lcNames.get(lcId) || `LC${lcId}`;
              const match = name.match(/\(([^)]+)\)/);
              terms.push(`${factor}${match ? match[1] : name}`);
            }
          });
          return `<tr><td>${c.id}</td><td>${c.name}</td><td><span class="status-badge ${c.type === 'ULS' ? 'fail' : 'ok'}">${c.type}</span></td><td>${terms.join(' + ')}</td></tr>`;
        }).join('\n')}
      </tbody>
    </table>
    <h3 class="subsection-title" style="color:${config.primaryColor}">Combination Factors</h3>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Combination</th>${loadCases.map(lc => `<th>${lc.name}</th>`).join('')}</tr></thead>
      <tbody>
        ${loadCombinations.map(c => `<tr><td>${c.name}</td>${loadCases.map(lc => `<td class="numeric">${(c.factors.get(lc.id) ?? 0).toFixed(2)}</td>`).join('')}</tr>`).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateResultForcesHTML(data: ReportData, sectionNum: number, forceType: 'M' | 'V' | 'N'): string {
  const { config, mesh, result } = data;
  const titles = { M: 'Bending Moments', V: 'Shear Forces', N: 'Axial Forces' };
  const diagramTypes = { M: 'moment', V: 'shear', N: 'normal' } as const;
  const units = { M: 'kNm', V: 'kN', N: 'kN' };
  const sectionTitle = `${sectionNum}. ${titles[forceType]}`;

  if (!result || result.beamForces.size === 0) {
    return `<div class="report-page"><h2 class="section-title" style="color:${config.primaryColor}">${sectionTitle}</h2><p>No beam force results available.</p></div>`;
  }

  const diagramSvg = renderForceDiagram(mesh, result, diagramTypes[forceType], { width: 650, height: 280, showGrid: true });
  const beamForces = Array.from(result.beamForces.values());

  // Find max
  let maxVal = 0, maxBeam = 0;
  beamForces.forEach(f => {
    const val = forceType === 'M' ? f.maxM : forceType === 'V' ? f.maxV : f.maxN;
    if (Math.abs(val) > Math.abs(maxVal)) { maxVal = val; maxBeam = f.elementId; }
  });

  const fmtVal = (v: number) => (v / 1000).toFixed(2);

  return `
  <div class="report-page">
    <h2 class="section-title" style="color:${config.primaryColor}">${sectionTitle}</h2>
    <div style="border:1px solid #e5e7eb;border-radius:4px;padding:8px;margin:12px 0;background:#fafbfc">
      ${diagramSvg}
    </div>
    <div style="padding:8px 12px;background:#f8fafc;border-radius:4px;display:inline-block;margin-bottom:12px">
      <strong>Max |${forceType}| = ${fmtVal(Math.abs(maxVal))} ${units[forceType]}</strong>
      <span style="color:#666;margin-left:12px">at Beam ${maxBeam}</span>
    </div>
    <table class="data-table">
      <thead><tr style="background:${config.primaryColor}"><th>Beam</th><th>Profile</th><th>L (m)</th><th>${forceType}<sub>1</sub> (${units[forceType]})</th><th>${forceType}<sub>2</sub> (${units[forceType]})</th><th>Max |${forceType}|</th></tr></thead>
      <tbody>
        ${beamForces.map(f => {
          const beam = mesh.getBeamElement(f.elementId);
          const nodes = beam ? mesh.getBeamElementNodes(beam) : null;
          const L = nodes ? calculateBeamLength(nodes[0], nodes[1]) : 0;
          const v1 = forceType === 'M' ? f.M1 : forceType === 'V' ? f.V1 : f.N1;
          const v2 = forceType === 'M' ? f.M2 : forceType === 'V' ? f.V2 : f.N2;
          const vMax = forceType === 'M' ? f.maxM : forceType === 'V' ? f.maxV : f.maxN;
          return `<tr><td>${f.elementId}</td><td>${beam?.profileName || '—'}</td><td class="numeric">${L.toFixed(3)}</td><td class="numeric">${fmtVal(v1)}</td><td class="numeric">${fmtVal(v2)}</td><td class="numeric" style="font-weight:600">${fmtVal(Math.abs(vMax))}</td></tr>`;
        }).join('\n')}
      </tbody>
    </table>
  </div>`;
}

function generateSteelCheckDetailedHTML(data: ReportData, sectionNum: number): string {
  const { config, mesh, result } = data;
  if (!result || result.beamForces.size === 0 || !config.includeFormulas) {
    return '';
  }

  const grade = STEEL_GRADES.find(g => g.name === config.steelGrade) || STEEL_GRADES[2];
  const sectionMap = new Map<number, ISectionProperties>();
  const beamLengths = new Map<number, number>();

  for (const beam of mesh.beamElements.values()) {
    sectionMap.set(beam.id, {
      A: beam.section.A,
      I: beam.section.I,
      h: beam.section.h,
      profileName: beam.profileName,
    });
    const nodes = mesh.getBeamElementNodes(beam);
    if (nodes) beamLengths.set(beam.id, calculateBeamLength(nodes[0], nodes[1]));
  }

  const steelResults = checkAllBeams(result.beamForces, sectionMap, grade, beamLengths, undefined, config.deflectionLimit);

  return steelResults.map((r, idx) => {
    const length = beamLengths.get(r.elementId) || 0;
    return `
    <div class="report-page">
      ${idx === 0 ? `<h2 class="section-title" style="color:${config.primaryColor}">${sectionNum}. Steel Section Checks — Details</h2>` : ''}
      <div class="check-detail">
        <h4 style="color:${config.primaryColor}">Member ${r.elementId} — ${r.profileName} (${grade.name})</h4>
        <p style="font-size:9pt;color:#666">L = ${(length * 1000).toFixed(0)} mm | f<sub>y</sub> = ${grade.fy} MPa | γ<sub>M0</sub> = ${grade.gammaM0}</p>

        <div class="check-block">
          <div class="check-block-title">Axial Resistance — NEN-EN 1993-1-1, 6.2.4</div>
          <div class="formula" style="border-left-color:${config.primaryColor}">N<sub>c,Rd</sub> = A · f<sub>y</sub> / γ<sub>M0</sub> = ${formatForce(r.NcRd)} kN</div>
          <p>UC = N<sub>Ed</sub> / N<sub>c,Rd</sub> = <strong style="color:${ucColor(r.UC_N)}">${r.UC_N.toFixed(3)}</strong></p>
        </div>

        <div class="check-block">
          <div class="check-block-title">Bending Resistance — NEN-EN 1993-1-1, 6.2.5</div>
          <div class="formula" style="border-left-color:${config.primaryColor}">M<sub>c,Rd</sub> = W<sub>el</sub> · f<sub>y</sub> / γ<sub>M0</sub> = ${formatMoment(r.McRd)} kNm</div>
          <p>UC = M<sub>Ed</sub> / M<sub>c,Rd</sub> = <strong style="color:${ucColor(r.UC_M)}">${r.UC_M.toFixed(3)}</strong></p>
        </div>

        <div class="check-block">
          <div class="check-block-title">Shear Resistance — NEN-EN 1993-1-1, 6.2.6</div>
          <div class="formula" style="border-left-color:${config.primaryColor}">V<sub>c,Rd</sub> = A<sub>v</sub> · (f<sub>y</sub> / √3) / γ<sub>M0</sub> = ${formatForce(r.VcRd)} kN</div>
          <p>UC = V<sub>Ed</sub> / V<sub>c,Rd</sub> = <strong style="color:${ucColor(r.UC_V)}">${r.UC_V.toFixed(3)}</strong></p>
        </div>

        <div class="${r.status === 'OK' ? 'result-ok' : 'result-fail'}" style="padding:8px 12px;border-radius:4px;margin-top:12px">
          Governing: ${r.governingCheck}${r.governingLocation ? ` at x = ${(r.governingLocation.position * 1000).toFixed(0)}mm (${r.governingLocation.locationType})` : ''} — UC<sub>max</sub> = ${r.UC_max.toFixed(3)} — <strong>${r.status}</strong>
        </div>
      </div>
    </div>`;
  }).join('\n');
}

// Main report header
function getReportHeader(_config: IReportConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Structural Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; background: #f8f9fa; color: #333; padding: 24px; font-size: 10pt; line-height: 1.5; }
  .report-page { max-width: 210mm; margin: 0 auto 24px; background: white; padding: 20mm; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .cover-page { min-height: 297mm; position: relative; }
  .cover-table { width: 100%; border-collapse: collapse; }
  .cover-table td { padding: 4px 0; vertical-align: top; }
  .section-title { font-size: 16pt; font-weight: bold; margin-bottom: 16px; padding-bottom: 4px; border-bottom: 2px solid currentColor; }
  .subsection-title { font-size: 12pt; font-weight: bold; margin: 20px 0 12px; }
  .data-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9pt; }
  .data-table th { color: white; padding: 6px 8px; text-align: left; font-weight: 500; }
  .data-table td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
  .data-table tr:nth-child(even) { background: #f9f9f9; }
  .numeric { text-align: right; font-feature-settings: "tnum"; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 9pt; font-weight: 600; }
  .status-badge.ok { background: #dcfce7; color: #166534; }
  .status-badge.fail { background: #fee2e2; color: #991b1b; }
  .result-ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .result-fail { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .check-detail { background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 12px 0; page-break-inside: avoid; }
  .check-detail h4 { font-size: 11pt; margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  .check-block { margin: 8px 0; padding: 6px 0; }
  .check-block-title { font-size: 10pt; font-weight: 600; color: #475569; margin-bottom: 4px; }
  .formula { font-family: 'Times New Roman', serif; font-size: 10pt; margin: 8px 0; padding: 8px 12px; background: #f5f5f5; border-left: 3px solid; border-radius: 0 4px 4px 0; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; background: white; } .report-page { box-shadow: none; margin: 0; page-break-after: always; } }
</style>
</head>
<body>`;
}

function getReportFooter(): string {
  return `
<div class="footer">
  Generated by Open FEM2D Studio | ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
</div>
</body>
</html>`;
}

// Section generator map
const SECTION_GENERATORS: Partial<Record<ReportSectionType, (data: ReportData, sectionNum: number) => string>> = {
  'cover': (data) => generateCoverHTML(data),
  'toc': (data) => generateTocHTML(data),
  'summary': (data) => generateSummaryHTML(data),
  'input_geometry': (data, num) => generateInputGeometryHTML(data, num),
  'input_nodes': (data, num) => generateInputNodesHTML(data, num),
  'input_members': (data, num) => generateInputMembersHTML(data, num),
  'input_profiles': (data, num) => generateInputProfilesHTML(data, num),
  'input_loadcases': (data, num) => generateInputLoadCasesHTML(data, num),
  'result_combinations': (data, num) => generateResultCombinationsHTML(data, num),
  'result_reactions': (data, num) => generateResultReactionsHTML(data, num),
  'result_displacements': (data, num) => generateResultDisplacementsHTML(data, num),
  'result_forces_M': (data, num) => generateResultForcesHTML(data, num, 'M'),
  'result_forces_V': (data, num) => generateResultForcesHTML(data, num, 'V'),
  'result_forces_N': (data, num) => generateResultForcesHTML(data, num, 'N'),
  'check_steel_overview': (data, num) => generateSteelCheckOverviewHTML(data, num),
  'check_steel_detailed': (data, num) => generateSteelCheckDetailedHTML(data, num),
};

/**
 * Generate complete report HTML
 */
export function generateReportHTML(data: ReportData): string {
  const { config } = data;
  const enabledSections = getEnabledSections(config);

  let html = getReportHeader(config);
  let sectionNum = 0;

  for (const section of enabledSections) {
    if (section.category !== 'header') {
      sectionNum++;
    }

    const generator = SECTION_GENERATORS[section.id];
    if (generator) {
      html += generator(data, sectionNum);
    }
  }

  html += getReportFooter();
  return html;
}

/**
 * Download report as HTML file
 */
export function downloadReportHTML(data: ReportData): void {
  const html = generateReportHTML(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.projectInfo.name || 'report'}_report.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open print dialog for PDF export
 */
export function printReport(data: ReportData): void {
  const html = generateReportHTML(data);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Give a moment for styles to load
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}

// Re-export the old interface for backward compatibility
export { generateReport, downloadReport } from './LegacyReportGenerator';
