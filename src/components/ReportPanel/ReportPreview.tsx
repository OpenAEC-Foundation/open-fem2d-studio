/**
 * ReportPreview — Renders all enabled report sections in A4 paper format
 */

import React from 'react';
import { Mesh } from '../../core/fem/Mesh';
import { ISolverResult } from '../../core/fem/types';
import { IProjectInfo } from '../../context/FEMContext';
import { ILoadCase, ILoadCombination } from '../../core/fem/LoadCase';
import { IReportConfig, getEnabledSections, ReportSectionType } from '../../core/report/ReportConfig';

// Import section components
import { CoverSection } from './sections/CoverSection';
import { TocSection } from './sections/TocSection';
import { InputGeometrySection } from './sections/InputGeometrySection';
import { InputNodesSection } from './sections/InputNodesSection';
import { InputMembersSection } from './sections/InputMembersSection';
import { InputProfilesSection } from './sections/InputProfilesSection';
import { InputLoadCasesSection } from './sections/InputLoadCasesSection';
import { ResultCombinationsSection } from './sections/ResultCombinationsSection';
import { ResultReactionsSection } from './sections/ResultReactionsSection';
import { ResultDisplacementsSection } from './sections/ResultDisplacementsSection';
import { ResultForcesSection } from './sections/ResultForcesSection';
import { SteelCheckOverviewSection } from './sections/SteelCheckOverviewSection';
import { SteelCheckDetailedSection } from './sections/SteelCheckDetailedSection';

export interface ReportSectionProps {
  config: IReportConfig;
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
  sectionNumber?: number;
}

interface ReportPreviewProps {
  config: IReportConfig;
  mesh: Mesh;
  result: ISolverResult | null;
  projectInfo: IProjectInfo;
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
}

// Map section IDs to their React components
const SECTION_COMPONENTS: Partial<Record<ReportSectionType, React.FC<ReportSectionProps>>> = {
  'cover': CoverSection,
  'toc': TocSection,
  'input_geometry': InputGeometrySection,
  'input_nodes': InputNodesSection,
  'input_members': InputMembersSection,
  'input_profiles': InputProfilesSection,
  'input_loadcases': InputLoadCasesSection,
  'result_combinations': ResultCombinationsSection,
  'result_reactions': ResultReactionsSection,
  'result_displacements': ResultDisplacementsSection,
  'result_forces_M': (props) => <ResultForcesSection {...props} forceType="M" />,
  'result_forces_V': (props) => <ResultForcesSection {...props} forceType="V" />,
  'result_forces_N': (props) => <ResultForcesSection {...props} forceType="N" />,
  'check_steel_overview': SteelCheckOverviewSection,
  'check_steel_detailed': SteelCheckDetailedSection,
};

export const ReportPreview: React.FC<ReportPreviewProps> = ({
  config,
  mesh,
  result,
  projectInfo,
  loadCases,
  loadCombinations,
}) => {
  const enabledSections = getEnabledSections(config);

  // Track section numbers (skip cover and TOC)
  let sectionNumber = 0;

  // Separate cover from other sections
  const coverSection = enabledSections.find(s => s.id === 'cover');
  const tocSection = enabledSections.find(s => s.id === 'toc');
  const contentSections = enabledSections.filter(s => s.id !== 'cover' && s.id !== 'toc');

  const sharedProps = {
    config,
    mesh,
    result,
    projectInfo,
    loadCases,
    loadCombinations,
  };

  return (
    <>
      {/* Cover Page - separate page */}
      {coverSection && (
        <div className="report-page cover-page" id="section-cover">
          <CoverSection {...sharedProps} />
        </div>
      )}

      {/* Table of Contents - separate page */}
      {tocSection && (
        <div className="report-page" id="section-toc">
          <TocSection {...sharedProps} />
        </div>
      )}

      {/* Content sections - each section can trigger page breaks */}
      {contentSections.map((section, index) => {
        const Component = SECTION_COMPONENTS[section.id];
        sectionNumber++;
        const isFirstContent = index === 0;

        return (
          <div
            key={section.id}
            className={`report-page ${isFirstContent ? 'first-content-page' : ''}`}
            id={`section-${section.id}`}
          >
            {/* Page header */}
            {config.showHeader && (
              <div className="report-page-header">
                <span>{projectInfo.name || 'Structural Report'}</span>
                <span>{config.companyName}</span>
              </div>
            )}

            {/* Content wrapper */}
            <div className="report-page-content">
              {!Component ? (
                <div className="report-section">
                  <h2 className="report-section-title" style={{ color: config.primaryColor }}>
                    {sectionNumber}. {section.name}
                  </h2>
                  <p style={{ color: '#666', fontStyle: 'italic' }}>
                    This section is not yet implemented.
                  </p>
                </div>
              ) : (
                <Component
                  {...sharedProps}
                  sectionNumber={sectionNumber}
                />
              )}
            </div>

            {/* Page footer */}
            {config.showFooter && (
              <div className="report-page-footer">
                <span>{projectInfo.date || new Date().toLocaleDateString('nl-NL')}</span>
                <span>Generated with Open FEM2D Studio</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
