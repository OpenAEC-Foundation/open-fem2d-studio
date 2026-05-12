/**
 * CoverSection — Title page with project information
 */

import React from 'react';
import { ReportSectionProps } from '../ReportPreview';
import { useI18n } from '../../../i18n/i18n';

export const CoverSection: React.FC<ReportSectionProps> = ({ config, projectInfo }) => {
  const { t } = useI18n();
  const today = projectInfo.date || new Date().toLocaleDateString('nl-NL');

  return (
    <>
      {/* Header stripe */}
      <div className="cover-stripe" style={{ background: config.primaryColor }} />

      <h1 className="cover-title" style={{ color: config.primaryColor }}>
        {t('report.coverTitle')} &amp; {t('report.coverSubtitle')}
      </h1>
      <h2 className="cover-subtitle" style={{ color: config.accentColor }}>
        {projectInfo.name || 'Untitled Project'}
      </h2>

      <table className="cover-table" style={{ marginBottom: 40 }}>
        <tbody>
          <tr>
            <td style={{ color: config.primaryColor }}>{t('report.project')}</td>
            <td>{projectInfo.projectNumber ? `${projectInfo.projectNumber} - ` : ''}{projectInfo.name || 'Untitled Project'}</td>
          </tr>
          {projectInfo.company && (
            <tr>
              <td style={{ color: config.primaryColor }}>{t('report.client')}</td>
              <td>{projectInfo.company}</td>
            </tr>
          )}
          {projectInfo.location && (
            <tr>
              <td></td>
              <td>{projectInfo.location}</td>
            </tr>
          )}
          {projectInfo.description && (
            <tr>
              <td style={{ color: config.primaryColor }}>{t('report.description')}</td>
              <td>{projectInfo.description}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="cover-table" style={{ marginBottom: 40 }}>
        <tbody>
          <tr>
            <td style={{ color: config.primaryColor }}>{t('report.consultant')}</td>
            <td>{config.companyName}</td>
          </tr>
          {projectInfo.engineer && (
            <tr>
              <td style={{ color: config.primaryColor }}>{t('report.engineer')}</td>
              <td>{projectInfo.engineer}</td>
            </tr>
          )}
          <tr>
            <td style={{ color: config.primaryColor }}>{t('report.appliedStandards')}</td>
            <td>NEN-EN 1990 t/m 1997</td>
          </tr>
        </tbody>
      </table>

      <div style={{ borderTop: `1px solid ${config.primaryColor}`, paddingTop: 16 }}>
        <table className="cover-table">
          <tbody>
            <tr>
              <td style={{ color: config.primaryColor }}>{t('report.date')}</td>
              <td>{today}</td>
            </tr>
            <tr>
              <td style={{ color: config.primaryColor }}>{t('report.status')}</td>
              <td>{t('report.statusForApproval')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer with company name/logo */}
      <div className="cover-footer">
        {config.companyLogo ? (
          <img src={config.companyLogo} alt="Logo" style={{ height: 40 }} />
        ) : (
          <span style={{ color: config.primaryColor, fontWeight: 'bold', fontSize: '14pt' }}>
            {config.companyName}
          </span>
        )}
      </div>
    </>
  );
};
