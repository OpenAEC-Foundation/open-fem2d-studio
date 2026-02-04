/**
 * TocSection — Table of Contents
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { getEnabledSections, CATEGORY_NAMES, ReportSectionCategory } from '../../../core/report/ReportConfig';

export const TocSection: React.FC<ReportSectionProps> = ({ config }) => {
  const enabledSections = getEnabledSections(config);

  // Group sections by category
  const sectionsByCategory = enabledSections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<ReportSectionCategory, typeof enabledSections>);

  // Generate section numbers
  let sectionNumber = 0;
  const getSectionNumber = (category: ReportSectionCategory) => {
    if (category === 'header') return null;
    sectionNumber++;
    return sectionNumber;
  };

  return (
    <div className="report-section">
      <h2 className="report-section-title" style={{ color: config.primaryColor }}>
        Inhoudsopgave
      </h2>

      {(['header', 'input', 'results', 'checks'] as ReportSectionCategory[]).map(category => {
        const sections = sectionsByCategory[category];
        if (!sections || sections.length === 0) return null;

        return (
          <div key={category} className="toc-section">
            <div className="toc-section-title" style={{ color: config.primaryColor }}>
              {CATEGORY_NAMES[category]}
            </div>
            {sections.map(section => {
              const num = getSectionNumber(category);
              return (
                <div key={section.id} className="toc-entry">
                  <span className="toc-entry-title">
                    {num !== null && `${num}. `}{section.name}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
