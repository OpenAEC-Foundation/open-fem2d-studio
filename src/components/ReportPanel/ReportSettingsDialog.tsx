/**
 * ReportSettingsDialog — Configure report sections and styling
 */

import React, { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import {
  IReportConfig,
  IReportSection,
  CATEGORY_NAMES,
  ReportSectionCategory,
} from '../../core/report/ReportConfig';
import './ReportSettingsDialog.css';

interface Props {
  onClose: () => void;
}

export const ReportSettingsDialog: React.FC<Props> = ({ onClose }) => {
  const { state, dispatch } = useFEM();
  const [config, setConfig] = useState<IReportConfig>({ ...state.reportConfig });

  const handleSectionToggle = (id: string) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  };

  const handleToggleCategory = (category: ReportSectionCategory, enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.category === category ? { ...s, enabled } : s
      ),
    }));
  };

  const handleSave = () => {
    dispatch({ type: 'SET_REPORT_CONFIG', payload: config });
    onClose();
  };

  const categories: ReportSectionCategory[] = ['header', 'input', 'results'];

  // Group sections by category
  const sectionsByCategory = config.sections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<ReportSectionCategory, IReportSection[]>);

  return (
    <div className="dialog-overlay">
      <div className="dialog report-settings-dialog">
        <div className="dialog-header">
          <h2>Report Settings</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-content">
          <div className="settings-columns">
            {/* Left: Section toggles */}
            <div className="settings-sections">
              <h3>Report Sections</h3>

              {categories.map(category => {
                const sections = sectionsByCategory[category] || [];
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

            {/* Right: General settings */}
            <div className="settings-general">
              <h3>Company Info</h3>
              <label className="settings-field">
                <span>Company Name</span>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={e => setConfig({ ...config, companyName: e.target.value })}
                />
              </label>

              <h3>Styling</h3>
              <div className="settings-row">
                <label className="settings-field">
                  <span>Primary Color</span>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                    />
                    <span className="color-value">{config.primaryColor}</span>
                  </div>
                </label>
                <label className="settings-field">
                  <span>Accent Color</span>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                    />
                    <span className="color-value">{config.accentColor}</span>
                  </div>
                </label>
              </div>

              <h3>Content Options</h3>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={config.includeFormulas}
                  onChange={e => setConfig({ ...config, includeFormulas: e.target.checked })}
                />
                <span>Include detailed formulas</span>
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={config.includeGraphics}
                  onChange={e => setConfig({ ...config, includeGraphics: e.target.checked })}
                />
                <span>Include diagrams</span>
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={config.showPageNumbers}
                  onChange={e => setConfig({ ...config, showPageNumbers: e.target.checked })}
                />
                <span>Show page numbers</span>
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={config.showHeader}
                  onChange={e => setConfig({ ...config, showHeader: e.target.checked })}
                />
                <span>Show page header</span>
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={config.showFooter}
                  onChange={e => setConfig({ ...config, showFooter: e.target.checked })}
                />
                <span>Show page footer</span>
              </label>

            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};
