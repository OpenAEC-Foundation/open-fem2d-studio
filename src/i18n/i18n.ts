import { createContext, useContext } from 'react';
import { en } from './en';
import { nl } from './nl';
import { fr } from './fr';
import { es } from './es';
import { zh } from './zh';
import { it } from './it';

export type Locale = 'en' | 'nl' | 'fr' | 'es' | 'zh' | 'it';

export type TranslationKeys = typeof en;

const translations: Record<Locale, TranslationKeys> = { en, nl, fr, es, zh, it };

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
});

export function useI18n(): I18nContextType {
  return useContext(I18nContext);
}

export function getTranslation(locale: Locale, key: string): string {
  const dict = translations[locale] as Record<string, string>;
  return dict[key] ?? key;
}

export function getStoredLocale(): Locale {
  const stored = localStorage.getItem('fem2d-locale');
  if (stored === 'en' || stored === 'nl' || stored === 'fr' || stored === 'es' || stored === 'zh' || stored === 'it') return stored;
  return 'en';
}
