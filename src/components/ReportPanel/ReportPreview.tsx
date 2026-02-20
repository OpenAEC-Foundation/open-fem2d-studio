/**
 * ReportPreview — Renders all enabled report sections as one continuous document
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
import { SummarySection } from './sections/SummarySection';
import { InputGeometrySection } from './sections/InputGeometrySection';
import { InputNodesSection } from './sections/InputNodesSection';
import { InputMembersSection } from './sections/InputMembersSection';
import { InputProfilesSection } from './sections/InputProfilesSection';
import { InputLoadCasesSection } from './sections/InputLoadCasesSection';
import { ResultCombinationsSection } from './sections/ResultCombinationsSection';
import { ResultReactionsSection } from './sections/ResultReactionsSection';
import { ResultDisplacementsSection } from './sections/ResultDisplacementsSection';
import { ResultForcesSection } from './sections/ResultForcesSection';
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
  'summary': SummarySection,
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

  // Track section numbers (skip cover, TOC, and summary)
  let sectionNumber = 0;

  // Separate header pages from numbered content sections
  const coverSection = enabledSections.find(s => s.id === 'cover');
  const tocSection = enabledSections.find(s => s.id === 'toc');
  const summarySection = enabledSections.find(s => s.id === 'summary');
  const contentSections = enabledSections.filter(s => s.id !== 'cover' && s.id !== 'toc' && s.id !== 'summary');

  const sharedProps = {
    config,
    mesh,
    result,
    projectInfo,
    loadCases,
    loadCombinations,
  };

  return (
    <div className="report-document">
      {/* Document header - only at the very top if enabled */}
      {config.showHeader && (
        <div className="report-document-header">
          <span>{projectInfo.name || 'Structural Report'}</span>
          <span>{config.companyName}</span>
        </div>
      )}

      {/* Cover Section */}
      {coverSection && (
        <div className="report-content-section" id="section-cover">
          <CoverSection {...sharedProps} />
        </div>
      )}

      {/* Table of Contents */}
      {tocSection && (
        <div className="report-content-section" id="section-toc">
          <TocSection {...sharedProps} />
        </div>
      )}

      {/* Executive Summary */}
      {summarySection && (
        <div className="report-content-section" id="section-summary">
          <SummarySection {...sharedProps} sectionNumber={0} />
        </div>
      )}

      {/* Content sections - continuous flow */}
      {contentSections.map((section) => {
        const Component = SECTION_COMPONENTS[section.id];
        sectionNumber++;

        return (
          <div
            key={section.id}
            className="report-content-section"
            id={`section-${section.id}`}
          >
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
        );
      })}

      {/* Document footer - only at the very bottom if enabled */}
      {config.showFooter && (
        <div className="report-document-footer">
          <span>{projectInfo.date || new Date().toLocaleDateString('nl-NL')}</span>
          <span>Generated with Open FEM Studio</span>
        </div>
      )}
    </div>
  );
};
