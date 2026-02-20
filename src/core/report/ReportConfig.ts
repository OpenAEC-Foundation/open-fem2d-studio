/**
 * Report Configuration — Section definitions and defaults
 * Supports extensible section-based report generation with live preview
 */

export type ReportSectionType =
  // Header & Metadata
  | 'cover'           // Title page with project info
  | 'toc'             // Table of contents
  | 'summary'         // Executive summary with key results and quick checks

  // Input Data
  | 'input_geometry'  // Model geometry graphic
  | 'input_nodes'     // Node table
  | 'input_members'   // Member table
  | 'input_profiles'  // Profile properties
  | 'input_loadcases' // Load case definitions
  | 'input_loads'     // Load graphics per load case

  // Results
  | 'result_combinations' // ULS/SLS combinations
  | 'result_reactions'    // Reaction forces
  | 'result_displacements'// Node displacements
  | 'result_forces_N'     // Axial force diagram
  | 'result_forces_V'     // Shear force diagram
  | 'result_forces_M'     // Bending moment diagram
  | 'result_envelope'     // Envelope diagrams

  // Future
  | 'plates_stress'         // Plate stress contours
  | 'plates_reinforcement'; // Plate reinforcement design

export type ReportSectionCategory = 'header' | 'input' | 'results';

export interface IReportSection {
  id: ReportSectionType;
  name: string;
  category: ReportSectionCategory;
  enabled: boolean;
  order: number;
}

export interface IReportConfig {
  sections: IReportSection[];

  // Header settings
  companyName: string;
  companyLogo?: string;  // Base64 or URL
  showPageNumbers: boolean;
  showHeader: boolean;
  showFooter: boolean;

  // Content settings
  includeFormulas: boolean;
  includeGraphics: boolean;
  unitSystem: 'metric' | 'imperial';

  // Styling
  primaryColor: string;  // For headers, accents
  accentColor: string;   // For highlights
}

export const DEFAULT_REPORT_CONFIG: IReportConfig = {
  sections: [
    // Header sections
    { id: 'cover', name: 'Cover Page', category: 'header', enabled: true, order: 0 },
    { id: 'toc', name: 'Table of Contents', category: 'header', enabled: true, order: 1 },
    { id: 'summary', name: 'Executive Summary', category: 'header', enabled: true, order: 2 },

    // Input sections
    { id: 'input_geometry', name: 'Model Geometry', category: 'input', enabled: true, order: 10 },
    { id: 'input_nodes', name: 'Node Coordinates', category: 'input', enabled: true, order: 11 },
    { id: 'input_members', name: 'Members', category: 'input', enabled: true, order: 12 },
    { id: 'input_profiles', name: 'Profile Properties', category: 'input', enabled: true, order: 13 },
    { id: 'input_loadcases', name: 'Load Cases', category: 'input', enabled: true, order: 14 },
    { id: 'input_loads', name: 'Load Graphics', category: 'input', enabled: false, order: 15 },

    // Results sections
    { id: 'result_combinations', name: 'Load Combinations', category: 'results', enabled: true, order: 20 },
    { id: 'result_reactions', name: 'Reactions', category: 'results', enabled: true, order: 21 },
    { id: 'result_displacements', name: 'Displacements', category: 'results', enabled: true, order: 22 },
    { id: 'result_forces_M', name: 'Bending Moments', category: 'results', enabled: true, order: 23 },
    { id: 'result_forces_V', name: 'Shear Forces', category: 'results', enabled: true, order: 24 },
    { id: 'result_forces_N', name: 'Axial Forces', category: 'results', enabled: true, order: 25 },
    { id: 'result_envelope', name: 'Envelope Diagrams', category: 'results', enabled: false, order: 26 },

  ],

  companyName: '3BM Bouwtechniek V.O.F.',
  showPageNumbers: true,
  showHeader: true,
  showFooter: true,
  includeFormulas: true,
  includeGraphics: true,
  unitSystem: 'metric',
  primaryColor: '#00a8a8',  // Teal
  accentColor: '#8b5cf6',   // Purple
};

/**
 * Get enabled sections sorted by order
 */
export function getEnabledSections(config: IReportConfig): IReportSection[] {
  return config.sections
    .filter(s => s.enabled)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get sections by category
 */
export function getSectionsByCategory(
  config: IReportConfig,
  category: ReportSectionCategory
): IReportSection[] {
  return config.sections
    .filter(s => s.category === category)
    .sort((a, b) => a.order - b.order);
}

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<ReportSectionCategory, string> = {
  header: 'Header',
  input: 'Input Data',
  results: 'Results',
};
