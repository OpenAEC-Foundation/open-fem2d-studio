/**
 * Report footer generator.
 * Per OpenAEC §4.3:
 * - Background: deep-forge
 * - Top border: 3px amber gradient
 * - Left: brand wordmark "Open" + "AEC"
 * - Center: 4 SVG icons (building, code, BIM cube, git-branch)
 * - Right: document title + page number (JetBrains Mono, amber)
 */

import { IReportConfig } from './ReportConfig';
import { ReportColors, ReportFonts, FooterIcons } from './ReportTheme';

export function generateFooterHTML(config: IReportConfig): string {
  const docTitle = (config as any).documentTitle ?? 'Constructieadvies';

  return `
  <footer class="report-footer" style="
    position: fixed; bottom: 0; left: 0; right: 0;
    height: 15mm;
    background: ${ReportColors.deepForge};
    color: ${ReportColors.scaffoldGray};
    padding: 5mm 12mm;
    box-sizing: border-box;
    display: flex; justify-content: space-between; align-items: center;
    z-index: 100;
  ">
    <div style="
      position: absolute; top: 0; left: 0; right: 0;
      height: 3px;
      background: ${ReportColors.gradient};
    "></div>

    <div style="
      font-family: ${ReportFonts.heading};
      font-weight: 700;
      font-size: 0.75rem;
    ">
      <span style="color: ${ReportColors.blueprintWhite};">Open</span><span style="color: ${ReportColors.amber};">AEC</span>
    </div>

    <div style="display: flex; gap: 8mm; align-items: center;">
      ${FooterIcons.building}
      ${FooterIcons.code}
      ${FooterIcons.bimCube}
      ${FooterIcons.gitBranch}
    </div>

    <div style="
      font-family: ${ReportFonts.mono};
      font-size: 0.7rem;
      color: ${ReportColors.amber};
    ">
      ${escape(docTitle)} · <span class="page-number">p. <span class="pgnum"></span></span>
    </div>
  </footer>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
