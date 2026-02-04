/**
 * ReportPanel — Main report preview panel with navigation and A4-styled preview
 */

import React, { useState, useRef } from 'react';
import { useFEM } from '../../context/FEMContext';
import { ReportPreview } from './ReportPreview';
import { getEnabledSections, CATEGORY_NAMES, ReportSectionCategory } from '../../core/report/ReportConfig';
import { FileText } from 'lucide-react';
import './ReportPanel.css';

export const ReportPanel: React.FC = () => {
  const { state } = useFEM();
  const { reportConfig, mesh, result, projectInfo, loadCases, loadCombinations } = state;
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const enabledSections = getEnabledSections(reportConfig);

  // Group sections by category for navigation
  const sectionsByCategory = enabledSections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<ReportSectionCategory, typeof enabledSections>);

  const handleNavClick = (sectionId: string) => {
    setActiveSection(sectionId);
    // Scroll to section in preview
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Check if we have enough data to show a report
  const hasData = mesh.getNodeCount() > 0;

  if (!hasData) {
    return (
      <div className="report-panel">
        <div className="report-nav">
          <h3>Report Sections</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            No model data available
          </p>
        </div>
        <div className="report-preview-container">
          <div className="report-empty">
            <FileText size={48} />
            <h3>No Model Data</h3>
            <p>Create a structural model to generate a report.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-panel">
      {/* Left: Section navigation */}
      <div className="report-nav">
        <h3>Report Sections</h3>
        {(['header', 'input', 'results', 'checks'] as ReportSectionCategory[]).map(category => {
          const sections = sectionsByCategory[category];
          if (!sections || sections.length === 0) return null;

          return (
            <div key={category} className="report-nav-category">
              <div className="report-nav-category-title">
                {CATEGORY_NAMES[category]}
              </div>
              {sections.map(section => (
                <a
                  key={section.id}
                  className={`report-nav-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => handleNavClick(section.id)}
                >
                  {section.name}
                </a>
              ))}
            </div>
          );
        })}
      </div>

      {/* Right: Preview (A4 paper style) */}
      <div className="report-preview-container" ref={previewRef}>
        <ReportPreview
          config={reportConfig}
          mesh={mesh}
          result={result}
          projectInfo={projectInfo}
          loadCases={loadCases}
          loadCombinations={loadCombinations}
        />
      </div>
    </div>
  );
};
