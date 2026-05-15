import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { useFEM } from '../../context/FEMContext';
import './SettingsDialog.css';

export type Theme = 'light' | 'openaec';
export type Locale = 'en' | 'nl' | 'es' | 'fr' | 'it' | 'zh';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  t: (key: string) => string;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  nl: 'Nederlands',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  zh: '中文',
};

export function SettingsDialog({
  isOpen, onClose, theme, onThemeChange, locale, onLocaleChange, t,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<'appearance' | 'language' | 'checks'>('appearance');
  const { state, dispatch } = useFEM();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} size="md">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === 'appearance' ? 'is-active' : ''}`}
          onClick={() => setTab('appearance')}
        >
          {t('settings.appearance')}
        </button>
        <button
          className={`settings-tab ${tab === 'language' ? 'is-active' : ''}`}
          onClick={() => setTab('language')}
        >
          {t('settings.language')}
        </button>
        <button
          className={`settings-tab ${tab === 'checks' ? 'is-active' : ''}`}
          onClick={() => setTab('checks')}
        >
          {t('settings.checks.title')}
        </button>
      </div>

      {tab === 'appearance' && (
        <div className="settings-section">
          <h3>{t('settings.theme.label')}</h3>
          <div className="settings-row">
            <span className="settings-label">{t('settings.theme.help')}</span>
            <div className="settings-radio-group">
              <button
                className={`settings-radio ${theme === 'light' ? 'is-selected' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                {t('settings.theme.light')}
              </button>
              <button
                className={`settings-radio ${theme === 'openaec' ? 'is-selected' : ''}`}
                onClick={() => onThemeChange('openaec')}
              >
                {t('settings.theme.openaec')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'language' && (
        <div className="settings-section">
          <h3>{t('settings.language')}</h3>
          <div className="settings-row">
            <span className="settings-label">{t('settings.languageHelp')}</span>
            <select
              className="settings-select"
              value={locale}
              onChange={e => onLocaleChange(e.target.value as Locale)}
            >
              {(Object.keys(LOCALE_LABELS) as Locale[]).map(l => (
                <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {tab === 'checks' && (
        <div className="settings-section">
          <h3>{t('settings.checks.title')}</h3>
          <div className="settings-row">
            <span className="settings-label">{t('settings.checks.autoRun')}</span>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={state.steelCheckAutoRun}
                onChange={e => dispatch({ type: 'SET_STEEL_CHECK_AUTO_RUN', payload: e.target.checked })}
              />
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
