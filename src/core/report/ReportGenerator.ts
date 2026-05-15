/**
 * Report Generator — HTML/PDF export with configurable sections
 * Generates professional structural engineering reports
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult } from '../fem/types';
import { IProjectInfo } from '../../context/FEMContext';
import { ILoadCase, ILoadCombination } from '../fem/LoadCase';
import { IReportConfig, getEnabledSections, ReportSectionType } from './ReportConfig';
import { calculateBeamLength } from '../fem/Beam';
import { renderGeometry, renderForceDiagram } from './DiagramRenderer';
import { generateHeaderHTML } from './ReportHeader';
import { generateFooterHTML } from './ReportFooter';
import { ReportColors, ReportFonts } from './ReportTheme';
import type { BeamCheckResult } from '../../lib/types/steel/BeamCheckResult';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export interface ReportData {
  config: IReportConfig;
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
  /** i18n function — added in D.10. Falls back to NL if absent. */
  t?: (key: string) => string;
  /** EN 1993-1-1 steel check results — Phase 14 */
  steelCheckResults?: BeamCheckResult[] | null;
}

/** Translate a key via data.t if present; otherwise return the NL fallback string. */
function tr(data: ReportData, key: string, fallback: string): string {
  if (!data.t) return fallback;
  const translated = data.t(key);
  // If the key is returned verbatim (untranslated), use the fallback
  return translated !== key ? translated : fallback;
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

// Section generators
function generateCoverHTML(data: ReportData): string {
  const { config, projectInfo } = data;
  const today = projectInfo.date || new Date().toLocaleDateString('nl-NL');

  return `
  <div class="report-page cover-page">
    <div style="background:${config.primaryColor};height:8px;margin:-20mm -20mm 40px -20mm;width:calc(100% + 40mm)"></div>
    <h1 style="color:${config.primaryColor};font-size:24pt;margin-bottom:8px">${tr(data, 'report.coverTitle', 'Constructieadvies')} &amp; ${tr(data, 'report.coverSubtitle', 'berekeningen')}</h1>
    <h2 style="color:${config.accentColor};font-size:16pt;margin-bottom:60px">${projectInfo.name || 'Untitled Project'}</h2>

    <table class="cover-table" style="margin-bottom:40px">
      <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">${tr(data, 'report.project', 'Project')}</td><td>${projectInfo.projectNumber ? `${projectInfo.projectNumber} - ` : ''}${projectInfo.name || 'Untitled Project'}</td></tr>
      ${projectInfo.company ? `<tr><td style="color:${config.primaryColor};font-weight:600">${tr(data, 'report.client', 'In opdracht van')}</td><td>${projectInfo.company}</td></tr>` : ''}
      ${projectInfo.location ? `<tr><td></td><td>${projectInfo.location}</td></tr>` : ''}
      ${projectInfo.description ? `<tr><td style="color:${config.primaryColor};font-weight:600">${tr(data, 'report.description', 'Omschrijving')}</td><td>${projectInfo.description}</td></tr>` : ''}
    </table>

    <table class="cover-table" style="margin-bottom:40px">
      <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">${tr(data, 'report.consultant', 'Adviseur')}</td><td>${config.companyName}</td></tr>
      ${projectInfo.engineer ? `<tr><td style="color:${config.primaryColor};font-weight:600">${tr(data, 'report.engineer', 'Verantwoordelijk constructeur')}</td><td>${projectInfo.engineer}</td></tr>` : ''}
      <tr><td style="color:${config.primaryColor};font-weight:600">${tr(data, 'report.appliedStandards', 'Toegepaste Normen')}</td><td>NEN-EN 1990 t/m 1997</td></tr>
    </table>

    <div style="border-top:1px solid ${config.primaryColor};padding-top:16px">
      <table class="cover-table">
        <tr><td style="color:${config.primaryColor};width:180px;font-weight:600">${tr(data, 'report.date', 'Datum rapport')}</td><td>${today}</td></tr>
        <tr><td style="color:${config.primaryColor};font-weight:600">${tr(data, 'report.status', 'Rapportstatus')}</td><td>${tr(data, 'report.statusForApproval', 'Ter goedkeuring')}</td></tr>
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
    <h2 class="section-title" style="color:${config.primaryColor}">${tr(data, 'report.toc', 'Inhoudsopgave')}</h2>
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
          const isULS = c.type.startsWith('6.10') || c.type === '6.14' || c.type === '6.15';
          return `<tr><td>${c.id}</td><td>${c.name}</td><td><span class="status-badge ${isULS ? 'fail' : 'ok'}">${c.type}</span></td><td>${terms.join(' + ')}</td></tr>`;
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

// ---------------------------------------------------------------------------
// EN 1993-1-1 section generators
// ---------------------------------------------------------------------------

function generateEN1993SummaryHTML(steelResults: BeamCheckResult[] | null, sectionNum: number): string {
  if (!steelResults || steelResults.length === 0) {
    return `<div class="report-page" id="section-en1993-summary">
      <h2 class="section-title" style="color:#D97706">${sectionNum}. EN 1993 Steel Checks – Summary</h2>
      <p><em>No steel check results. Run the solver and click Run all checks.</em></p>
    </div>`;
  }
  const rows = steelResults.map(r => `
    <tr style="background-color:${r.status === 'NotOk' ? 'rgba(220,38,38,0.08)' : 'transparent'}">
      <td style="padding:5px 8px">${r.beam_id}</td>
      <td style="padding:5px 8px">${escapeHtml(r.profile_name)}</td>
      <td style="padding:5px 8px">${escapeHtml(r.steel_grade)}</td>
      <td style="padding:5px 8px">${escapeHtml(r.classification.replace('Class', 'Class '))}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace"><strong>${r.uc_max.toFixed(2)}</strong></td>
      <td style="padding:5px 8px">${escapeHtml(r.governing_check_id)}</td>
      <td style="padding:5px 8px">${
        r.status === 'Ok'
          ? '<span style="color:#16A34A">&#x2713; OK</span>'
          : r.status === 'NotOk'
          ? '<span style="color:#DC2626">&#x2717; NOT OK</span>'
          : '<span style="color:#888">&#x2014;</span>'
      }</td>
    </tr>`).join('');
  return `
    <div class="report-page" id="section-en1993-summary">
      <h2 class="section-title" style="color:#D97706">${sectionNum}. EN 1993 Steel Checks – Summary</h2>
      <table class="data-table" style="font-size:9pt">
        <thead>
          <tr style="background:#D97706">
            <th style="padding:6px 8px;color:white">Beam</th>
            <th style="padding:6px 8px;color:white">Profile</th>
            <th style="padding:6px 8px;color:white">Grade</th>
            <th style="padding:6px 8px;color:white">Class</th>
            <th style="padding:6px 8px;color:white;text-align:right">UC<sub>max</sub></th>
            <th style="padding:6px 8px;color:white">Governing</th>
            <th style="padding:6px 8px;color:white">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Renders per-beam derivation blocks for one or more beams (used by both full report and single-beam popup). */
function generateEN1993CalculationsHTML(steelResults: BeamCheckResult[], sectionNum: number, sectionOffset: number = 0): string {
  return steelResults.map((r, idx) => {
    const checks = r.checks.map(nc => {
      const c = nc.kind.data as any;
      const varsLine = (c.variables as any[]).map((v: any) =>
        `<span style="margin-right:12px;display:inline-block"><em>${escapeHtml(v.symbol)}</em> = ${(v.value as number).toFixed(3)}${v.unit && v.unit !== '-' ? ' ' + escapeHtml(v.unit) : ''}</span>`
      ).join('');
      const intermediates: any[] = c.intermediate_values ?? [];
      const intermediatesLine = intermediates.map((v: any) =>
        `<span style="margin-right:12px;display:inline-block"><em>${escapeHtml(v.symbol)}</em> = ${(v.value as number).toFixed(3)}${v.unit && v.unit !== '-' ? ' ' + escapeHtml(v.unit) : ''}</span>`
      ).join('');
      const ucBlock = c.uc ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #E7E5E4;font-family:monospace;font-size:0.85rem">
          ${escapeHtml(c.uc.formula_latex)} = ${(c.uc.ed as number).toFixed(3)} / ${(c.uc.rd as number).toFixed(3)} = <strong>${(c.uc.uc as number).toFixed(2)}</strong>
          ${c.status === 'Ok'
            ? '<span style="color:#16A34A;margin-left:8px">&#x2713; OK</span>'
            : c.status === 'NotOk'
            ? '<span style="color:#DC2626;margin-left:8px">&#x2717; NOT OK</span>'
            : '<span style="color:#888;margin-left:8px">N.A.</span>'}
        </div>` : '';
      const forceState = c.force_state;
      const forces = forceState.forces;
      return `
        <div style="border-left:4px solid #D97706;padding:10px 12px;margin:10px 0;background:#FAFAF9;font-size:0.85rem;page-break-inside:avoid">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <strong style="font-size:0.9rem">${escapeHtml(c.title)}</strong>
            <span style="font-family:monospace;color:#D97706;font-size:0.72rem">${escapeHtml(c.article)}</span>
          </div>
          <div style="font-family:monospace;font-size:0.75rem;color:#57534E;background:#F5F5F4;padding:3px 6px;margin-bottom:6px">
            Comb: ${escapeHtml(String(forceState.combination_id))}, x = ${(forceState.position_mm as number).toFixed(0)} mm,
            N<sub>x</sub> = ${(forces.n_ed as number).toFixed(2)} kN,
            V<sub>z</sub> = ${(forces.vz_ed as number).toFixed(2)} kN,
            M<sub>y</sub> = ${(forces.my_ed as number).toFixed(2)} kNm
          </div>
          ${varsLine ? `<div style="font-family:monospace;font-size:0.8rem;margin-bottom:4px">${varsLine}</div>` : ''}
          <div style="font-family:monospace;font-size:0.9rem">=&nbsp;<strong style="color:#D97706">${(c.value as number).toFixed(3)} ${escapeHtml(c.unit)}</strong></div>
          ${ucBlock}
          ${intermediates.length > 0 ? `<details style="margin-top:6px;font-size:0.78rem"><summary style="cursor:pointer">Intermediate values (${intermediates.length})</summary><div style="margin-top:4px">${intermediatesLine}</div></details>` : ''}
          ${(c.notes as string[]).length > 0 ? `<ul style="font-size:0.78rem;font-style:italic;color:#666;margin:6px 0 0 0;padding-left:16px">${(c.notes as string[]).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="report-page" id="section-en1993-calc-${r.beam_id}">
        <h2 class="section-title" style="color:#D97706">${sectionNum}.${sectionOffset + idx + 1}. Beam ${r.beam_id} – ${escapeHtml(r.profile_name)} (${escapeHtml(r.steel_grade)})</h2>
        ${checks || '<p><em>No checks available.</em></p>'}
      </div>`;
  }).join('\n');
}

/**
 * Dispatch a section id to its HTML generator function and wrap it in a page div.
 */
function generateSectionHTML(id: ReportSectionType, data: ReportData, sectionNum: number): string {
  const inner = (() => {
    switch (id) {
      case 'cover':                return generateCoverHTML(data);
      case 'toc':                  return generateTocHTML(data);
      case 'summary':              return generateSummaryHTML(data);
      case 'input_geometry':       return generateInputGeometryHTML(data, sectionNum);
      case 'input_nodes':          return generateInputNodesHTML(data, sectionNum);
      case 'input_members':        return generateInputMembersHTML(data, sectionNum);
      case 'input_profiles':       return generateInputProfilesHTML(data, sectionNum);
      case 'input_loadcases':      return generateInputLoadCasesHTML(data, sectionNum);
      case 'input_loads':          return '';
      case 'result_combinations':  return generateResultCombinationsHTML(data, sectionNum);
      case 'result_reactions':     return generateResultReactionsHTML(data, sectionNum);
      case 'result_displacements': return generateResultDisplacementsHTML(data, sectionNum);
      case 'result_forces_M':      return generateResultForcesHTML(data, sectionNum, 'M');
      case 'result_forces_V':      return generateResultForcesHTML(data, sectionNum, 'V');
      case 'result_forces_N':      return generateResultForcesHTML(data, sectionNum, 'N');
      case 'result_envelope':      return '';
      case 'en1993_summary':       return generateEN1993SummaryHTML(data.steelCheckResults ?? null, sectionNum);
      case 'en1993_calculations':  return data.steelCheckResults && data.steelCheckResults.length > 0
                                     ? generateEN1993CalculationsHTML(data.steelCheckResults, sectionNum)
                                     : `<div class="report-page"><h2 class="section-title" style="color:#D97706">${sectionNum}. EN 1993 Calculations</h2><p><em>No results.</em></p></div>`;
      default:                     return '';
    }
  })();
  if (!inner) return '';
  // EN 1993 sections already produce their own .report-page wrappers with correct ids
  if (id === 'en1993_summary' || id === 'en1993_calculations') return inner;
  return `<div class="report-page" id="section-${id}"><div class="report-content">${inner}</div></div>`;
}

/**
 * Generate complete report HTML
 */
export function generateReportHTML(data: ReportData): string {
  const { config, projectInfo } = data;
  const sections = getEnabledSections(config);

  let sectionNum = 0;
  const sectionHTMLs = sections.map(s => {
    if (s.category !== 'header') sectionNum++;
    return generateSectionHTML(s.id, data, sectionNum);
  }).filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(projectInfo.name || 'Untitled Project')} — Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: ${ReportFonts.body};
      font-size: 0.9rem;
      line-height: 1.7;
      color: ${ReportColors.deepForge};
      background: ${ReportColors.blueprintWhite};
    }
    body {
      counter-reset: page;
    }
    h1, h2, h3 {
      font-family: ${ReportFonts.heading};
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: ${ReportColors.deepForge};
    }
    h2 { font-size: 1.5rem; margin-top: 8mm; }
    h3 { font-size: 1.1rem; margin-top: 6mm; }
    code, pre { font-family: ${ReportFonts.mono}; }

    .report-page {
      page-break-after: always;
      padding: 50mm 12mm 25mm 12mm;
      min-height: calc(297mm - 53mm - 25mm);
    }
    .report-page:last-child { page-break-after: auto; }

    .report-content p {
      text-align: justify;
      hyphens: auto;
      -webkit-hyphens: auto;
    }

    /* Legacy section generator classes */
    .cover-page { position: relative; }
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

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid ${ReportColors.borderLight};
      border-radius: 8px;
      overflow: hidden;
      font-size: 0.85rem;
      margin: 4mm 0;
    }
    table.report-table thead {
      background: ${ReportColors.concrete};
      border-bottom: 2px solid ${ReportColors.borderLight};
    }
    table.report-table th {
      padding: 3mm 4mm;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${ReportColors.textMuted};
      font-weight: 600;
      text-align: left;
    }
    table.report-table td {
      padding: 3mm 4mm;
      border-bottom: 1px solid ${ReportColors.concrete};
    }
    table.report-table tr:hover td { background: ${ReportColors.blueprintWhite}; }

    .section-number {
      font-family: ${ReportFonts.mono};
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${ReportColors.amber};
    }

    /* Page counter for footer (Chromium-only) */
    .pgnum::before { content: counter(page); }

    @media print {
      .report-page { padding-top: 50mm; padding-bottom: 25mm; }
    }
  </style>
</head>
<body>
  ${generateHeaderHTML(config, projectInfo)}
  ${generateFooterHTML(config)}
  <main>
    ${sectionHTMLs}
  </main>
</body>
</html>`;
}

/**
 * Generate a standalone HTML document for a single beam's full EN 1993 derivation.
 * Used by SteelCheckPanel double-click → opens in a new window with auto-print.
 */
export function generateSingleBeamReportHTML(
  beamResult: BeamCheckResult,
  config: IReportConfig,
  projectInfo: IProjectInfo,
): string {
  const headerHtml = generateHeaderHTML(config, projectInfo, 'fixed');
  const footerHtml = generateFooterHTML(config, 'fixed');
  const beamHtml = generateEN1993CalculationsHTML([beamResult], 1, 0);

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>EN 1993 Beam ${beamResult.beam_id} – ${escapeHtml(beamResult.profile_name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: ${ReportFonts.body};
      font-size: 0.9rem;
      line-height: 1.7;
      color: ${ReportColors.deepForge};
      background: ${ReportColors.blueprintWhite};
    }
    body { counter-reset: page; }
    .report-page {
      page-break-after: always;
      padding: 50mm 12mm 25mm 12mm;
      min-height: calc(297mm - 65mm);
    }
    .report-page:last-child { page-break-after: auto; }
    h2.section-title {
      font-family: ${ReportFonts.heading};
      font-weight: 700;
      font-size: 1.4rem;
      margin-top: 4mm;
      padding-bottom: 4px;
      border-bottom: 2px solid #D97706;
    }
    .pgnum::before { content: counter(page); }
    @media print {
      .report-page { padding-top: 50mm; padding-bottom: 25mm; }
    }
  </style>
</head>
<body>
  ${headerHtml}
  ${footerHtml}
  <main>${beamHtml}</main>
  <script>
    // Auto-trigger print after fonts have had time to load
    setTimeout(function() { window.print(); }, 600);
  </script>
</body>
</html>`;
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
