/**
 * ReportPanel — WYSIWYG iframe preview (Phase 14)
 * The preview is an iframe loaded with the actual generateReportHTML output,
 * so preview === printed PDF. Save-as-PDF triggers iframe.contentWindow.print().
 */

import React, { useState, useRef, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { generateReportHTML } from '../../core/report/ReportGenerator';
import { getEnabledSections, CATEGORY_NAMES, ReportSectionCategory, IReportSection } from '../../core/report/ReportConfig';
import { FileText, Printer } from 'lucide-react';
import './ReportPanel.css';

export const ReportPanel: React.FC = () => {
  const { state, dispatch } = useFEM();
  const { t } = useI18n();
  const { reportConfig, mesh, result, projectInfo, loadCases, loadCombinations } = state;
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const enabledSections = getEnabledSections(reportConfig);

  // Group sections by category for navigation
  const sectionsByCategory = enabledSections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<ReportSectionCategory, typeof enabledSections>);

  // Check if we have enough data to show a report
  const hasData = mesh.getNodeCount() > 0;

  // Generate the actual print-ready HTML (WYSIWYG)
  const reportHtml = useMemo(() => {
    if (!hasData) return '';
    return generateReportHTML({
      config: reportConfig,
      mesh,
      result,
      projectInfo,
      loadCases,
      loadCombinations,
      t,
      steelCheckResults: state.steelCheckResults,
    });
  }, [reportConfig, mesh, result, projectInfo, loadCases, loadCombinations, t, state.steelCheckResults, hasData]);

  // Navigate to a section inside the iframe
  const handleNavClick = (sectionId: string) => {
    setActiveSection(sectionId);
    const iframeDoc = iframeRef.current?.contentDocument;
    if (iframeDoc) {
      const el = iframeDoc.getElementById(`section-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handlePrintPdf = () => {
    iframeRef.current?.contentWindow?.print();
  };

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

  const categories: ReportSectionCategory[] = ['header', 'input', 'results'];

  // Settings sidebar component - always visible
  const SettingsSidebar = () => (
    <div className="report-settings-sidebar visible">
      <div className="report-settings-sidebar-header">
        <h3>Report Settings</h3>
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

      {/* Center: WYSIWYG iframe preview */}
      <div className="report-preview-container" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div className="report-iframe-toolbar">
          <button
            className="rp-print-btn"
            onClick={handlePrintPdf}
            title="Open print dialog — save as PDF from there"
          >
            <Printer size={14} style={{ marginRight: 6 }} />
            Save as PDF
          </button>
          <span className="rp-wysiwyg-hint">Preview matches printed output</span>
        </div>

        {/* Iframe: loads actual generated HTML */}
        <iframe
          ref={iframeRef}
          className="report-iframe"
          srcDoc={reportHtml}
          title="Report preview"
          sandbox="allow-same-origin allow-popups allow-scripts"
        />
      </div>

      {/* Right: Settings sidebar - always visible */}
      <SettingsSidebar />
    </div>
  );
};
