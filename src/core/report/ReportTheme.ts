/**
 * Report theme constants — OpenAEC palette + inline SVG assets.
 * Static HTML in ReportGenerator can't use CSS vars, so hex literals are needed.
 */

import logoSvg from '../../../public/openaec-assets/logo/openaec-logo-amber-on-dark.svg?raw';
import headerIllustration from '../../../public/openaec-assets/illustrations/report-header-dark.svg?raw';

export const ReportColors = {
  amber:          '#D97706',
  deepForge:      '#36363E',
  signalOrange:   '#EA580C',
  warmGold:       '#F59E0B',
  scaffoldGray:   '#A1A1AA',
  blueprintWhite: '#FAFAF9',
  concrete:       '#F5F5F4',
  nightBuild:     '#2A2A32',
  borderLight:    '#E7E5E4',
  textMuted:      '#57534E',
  gradient:       'linear-gradient(90deg, #D97706 0%, #F59E0B 40%, #EA580C 100%)',
} as const;

export const ReportFonts = {
  heading: '"Space Grotesk", system-ui, sans-serif',
  body:    '"Inter", system-ui, sans-serif',
  mono:    '"JetBrains Mono", monospace',
} as const;

export const ReportAssets = {
  logoAmberOnDark: logoSvg,
  headerIllustration,
} as const;

/**
 * Footer icon SVGs (24×24 viewBox, stroke-based).
 * Per OpenAEC §4.3: building, code, BIM cube, git-branch.
 */
export const FooterIcons = {
  building: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><rect x="6" y="3" width="12" height="18"/><circle cx="9.5" cy="8" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="14.5" cy="8" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="9.5" cy="13" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="14.5" cy="13" r="0.5" fill="${ReportColors.scaffoldGray}"/><rect x="10.5" y="17" width="3" height="4"/></svg>`,
  code:     `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>`,
  bimCube:  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4l8-4M12 11v10"/></svg>`,
  gitBranch:`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><circle cx="6" cy="3" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="11" r="2"/><path d="M6 5v11"/><path d="M6 11h6a4 4 0 004-4V5"/></svg>`,
} as const;
