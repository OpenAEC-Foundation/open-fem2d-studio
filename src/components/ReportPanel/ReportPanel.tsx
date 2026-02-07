/**
 * ReportPanel — Main report preview panel with navigation and A4-styled preview
 */

import React, { useState, useRef } from 'react';
import { useFEM } from '../../context/FEMContext';
import { ReportPreview } from './ReportPreview';
import { getEnabledSections, CATEGORY_NAMES, ReportSectionCategory, IReportSection } from '../../core/report/ReportConfig';
import { FileText, Settings, ChevronRight } from 'lucide-react';
import './ReportPanel.css';

export const ReportPanel: React.FC = () => {
  const { state, dispatch } = useFEM();
  const { reportConfig, mesh, result, projectInfo, loadCases, loadCombinations } = state;
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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

  // Settings sidebar handlers
  const handleSectionToggle = (id: string) => {
    dispatch({
      type: 'SET_REPORT_CONFIG',
      payload: {
        ...reportConfig,
        sections: reportConfig.sections.map(s =>
          s.id === id ? { ...s, enabled: !s.enabled } : s
        ),
      },
    });
  };

  const handleToggleCategory = (category: ReportSectionCategory, enabled: boolean) => {
    dispatch({
      type: 'SET_REPORT_CONFIG',
      payload: {
        ...reportConfig,
        sections: reportConfig.sections.map(s =>
          s.category === category ? { ...s, enabled } : s
        ),
      },
    });
  };

  const updateConfig = (updates: Partial<typeof reportConfig>) => {
    dispatch({
      type: 'SET_REPORT_CONFIG',
      payload: { ...reportConfig, ...updates },
    });
  };

  // Group sections by category for settings sidebar
  const settingsSectionsByCategory = reportConfig.sections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<ReportSectionCategory, IReportSection[]>);

  const categories: ReportSectionCategory[] = ['header', 'input', 'results', 'checks'];

  // Settings sidebar component
  const SettingsSidebar = () => (
    <div className={`report-settings-sidebar ${showSettings ? 'open' : ''}`}>
      <div className="report-settings-sidebar-header">
        <h3>Report Settings</h3>
        <button
          className="report-settings-close"
          onClick={() => setShowSettings(false)}
          title="Close settings"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="report-settings-sidebar-content">
        {/* Section toggles */}
        <div className="settings-group">
          <h4>Report Sections</h4>
          {categories.map(category => {
            const sections = settingsSectionsByCategory[category] || [];
            const enabledCount = sections.filter(s => s.enabled).length;
            const allEnabled = enabledCount === sections.length;
            const noneEnabled = enabledCount === 0;

            return (
              <div key={category} className="section-category">
                <div className="section-category-header">
                  <label className="section-category-toggle">
                    <input
                      type="checkbox"
                      checked={!noneEnabled}
                      ref={(el) => {
                        if (el) el.indeterminate = !allEnabled && !noneEnabled;
                      }}
                      onChange={e => handleToggleCategory(category, e.target.checked)}
                    />
                    <span className="section-category-name">{CATEGORY_NAMES[category]}</span>
                  </label>
                  <span className="section-category-count">
                    {enabledCount}/{sections.length}
                  </span>
                </div>
                <div className="section-items">
                  {sections
                    .sort((a, b) => a.order - b.order)
                    .map(section => (
                      <label key={section.id} className="section-toggle">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={() => handleSectionToggle(section.id)}
                        />
                        <span>{section.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Company Info */}
        <div className="settings-group">
          <h4>Company Info</h4>
          <label className="settings-field">
            <span>Company Name</span>
            <input
              type="text"
              value={reportConfig.companyName}
              onChange={e => updateConfig({ companyName: e.target.value })}
            />
          </label>
        </div>

        {/* Styling */}
        <div className="settings-group">
          <h4>Styling</h4>
          <div className="settings-row">
            <label className="settings-field">
              <span>Primary Color</span>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={reportConfig.primaryColor}
                  onChange={e => updateConfig({ primaryColor: e.target.value })}
                />
                <span className="color-value">{reportConfig.primaryColor}</span>
              </div>
            </label>
            <label className="settings-field">
              <span>Accent Color</span>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={reportConfig.accentColor}
                  onChange={e => updateConfig({ accentColor: e.target.value })}
                />
                <span className="color-value">{reportConfig.accentColor}</span>
              </div>
            </label>
          </div>
        </div>

        {/* Content Options */}
        <div className="settings-group">
          <h4>Content Options</h4>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={reportConfig.includeFormulas}
              onChange={e => updateConfig({ includeFormulas: e.target.checked })}
            />
            <span>Include detailed formulas</span>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={reportConfig.includeGraphics}
              onChange={e => updateConfig({ includeGraphics: e.target.checked })}
            />
            <span>Include diagrams</span>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={reportConfig.showPageNumbers}
              onChange={e => updateConfig({ showPageNumbers: e.target.checked })}
            />
            <span>Show page numbers</span>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={reportConfig.showHeader}
              onChange={e => updateConfig({ showHeader: e.target.checked })}
            />
            <span>Show page header</span>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={reportConfig.showFooter}
              onChange={e => updateConfig({ showFooter: e.target.checked })}
            />
            <span>Show page footer</span>
          </label>
        </div>

        {/* Check Settings */}
        <div className="settings-group">
          <h4>Check Settings</h4>
          <label className="settings-field">
            <span>Steel Grade</span>
            <select
              value={reportConfig.steelGrade}
              onChange={e => updateConfig({ steelGrade: e.target.value })}
            >
              <option value="S235">S235 (fy = 235 MPa)</option>
              <option value="S275">S275 (fy = 275 MPa)</option>
              <option value="S355">S355 (fy = 355 MPa)</option>
              <option value="S450">S450 (fy = 440 MPa)</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Deflection Limit (L/n)</span>
            <select
              value={reportConfig.deflectionLimit}
              onChange={e => updateConfig({ deflectionLimit: parseInt(e.target.value) })}
            >
              <option value="150">L/150 (Industrial)</option>
              <option value="200">L/200 (Normal)</option>
              <option value="250">L/250 (Standard)</option>
              <option value="300">L/300 (Strict)</option>
              <option value="350">L/350 (Very Strict)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );

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
        {/* Settings toggle button */}
        <button
          className={`report-settings-toggle ${showSettings ? 'hidden' : ''}`}
          onClick={() => setShowSettings(true)}
          title="Report Settings"
        >
          <Settings size={16} />
        </button>
        <SettingsSidebar />
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

      {/* Center: Preview (A4 paper style) */}
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

      {/* Settings toggle button */}
      <button
        className={`report-settings-toggle ${showSettings ? 'hidden' : ''}`}
        onClick={() => setShowSettings(true)}
        title="Report Settings"
      >
        <Settings size={16} />
      </button>

      {/* Right: Settings sidebar */}
      <SettingsSidebar />
    </div>
  );
};
