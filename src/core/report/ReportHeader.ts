/**
 * Report header banner generator.
 * Produces HTML for the 38mm A4 header per OpenAEC §4.3:
 * - Left: OpenAEC logo + "Build free. Build together." tagline
 * - Right: project metadata (project number, engineer, date)
 * - Background: deep-forge with illustration overlay at 35% opacity
 * - Bottom border: 4px amber gradient
 */

import { IReportConfig } from './ReportConfig';
import { IProjectInfo } from '../../context/FEMContext';
import { ReportColors, ReportFonts, ReportAssets } from './ReportTheme';

export type HeaderPosition = 'fixed' | 'static';

export function generateHeaderHTML(
  config: IReportConfig,
  projectInfo: IProjectInfo,
  position: HeaderPosition = 'fixed',
): string {
  const projNumber = projectInfo.projectNumber ?? '';
  const engineer = projectInfo.engineer ?? '';
  const date = projectInfo.date ?? new Date().toLocaleDateString();
  const projectName = projectInfo.name || 'Untitled Project';
  const tagline = (config as any).tagline ?? 'Build free. Build together.';
  const positionStyle = position === 'fixed'
    ? 'position: fixed; top: 0; left: 0; right: 0; z-index: 100;'
    : 'position: relative; width: 100%;';

  return `
  <header class="report-header" style="
    ${positionStyle}
    height: 38mm;
    background: ${ReportColors.deepForge};
    color: ${ReportColors.blueprintWhite};
    overflow: hidden;
  ">
    <div style="
      position: absolute; right: 0; top: 0; bottom: 0;
      width: 50%;
      opacity: 0.35;
      pointer-events: none;
    ">${ReportAssets.headerIllustration}</div>

    <div style="
      position: relative;
      display: flex; justify-content: space-between; align-items: center;
      padding: 5mm 12mm;
      height: 100%;
      box-sizing: border-box;
    ">
      <div style="display: flex; flex-direction: column; gap: 2mm; max-width: 80mm;">
        <div style="height: 14mm; display: flex; align-items: center;">
          ${ReportAssets.logoAmberOnDark}
        </div>
        <div style="
          font-family: ${ReportFonts.body};
          font-size: 0.7rem;
          color: ${ReportColors.scaffoldGray};
          font-style: italic;
        ">${escape(tagline)}</div>
      </div>

      <div style="
        font-family: ${ReportFonts.body};
        font-size: 0.7rem;
        color: ${ReportColors.scaffoldGray};
        text-align: right;
        line-height: 1.6;
      ">
        ${projNumber ? `<div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Project:</span> ${escape(projNumber)}</div>` : ''}
        <div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Name:</span> ${escape(projectName)}</div>
        ${engineer ? `<div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Engineer:</span> ${escape(engineer)}</div>` : ''}
        <div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Date:</span> ${escape(date)}</div>
      </div>
    </div>

    <div style="
      position: absolute; bottom: 0; left: 0; right: 0;
      height: 4px;
      background: ${ReportColors.gradient};
    "></div>
  </header>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
