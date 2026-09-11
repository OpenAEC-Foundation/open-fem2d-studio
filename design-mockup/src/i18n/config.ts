import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";

// English
import enCommon from "./locales/en/common.json";
import enRibbon from "./locales/en/ribbon.json";
import enBackstage from "./locales/en/backstage.json";
import enSettings from "./locales/en/settings.json";
import enFeedback from "./locales/en/feedback.json";
import enCheck from "./locales/en/check.json";
// Dutch
import nlCommon from "./locales/nl/common.json";
import nlRibbon from "./locales/nl/ribbon.json";
import nlBackstage from "./locales/nl/backstage.json";
import nlSettings from "./locales/nl/settings.json";
import nlFeedback from "./locales/nl/feedback.json";
import nlCheck from "./locales/nl/check.json";
// German
import deCommon from "./locales/de/common.json";
import deRibbon from "./locales/de/ribbon.json";
import deBackstage from "./locales/de/backstage.json";
import deSettings from "./locales/de/settings.json";
import deFeedback from "./locales/de/feedback.json";
import deCheck from "./locales/de/check.json";
// French
import frCommon from "./locales/fr/common.json";
import frRibbon from "./locales/fr/ribbon.json";
import frBackstage from "./locales/fr/backstage.json";
import frSettings from "./locales/fr/settings.json";
import frFeedback from "./locales/fr/feedback.json";
import frCheck from "./locales/fr/check.json";

/**
 * De vier talen van de app. De naam staat in de taal zelf, zodat iemand die
 * de huidige taal niet leest zijn eigen taal toch herkent in de lijst.
 * test-i18n-talen.mjs bewaakt dat elke taal hier dezelfde sleutels draagt
 * als het Nederlands, per naamruimte.
 */
export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "nl", name: "Nederlands" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
];

const ns = ["common", "ribbon", "backstage", "settings", "feedback", "check"];

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, ribbon: enRibbon, backstage: enBackstage, settings: enSettings, feedback: enFeedback, check: enCheck },
      nl: { common: nlCommon, ribbon: nlRibbon, backstage: nlBackstage, settings: nlSettings, feedback: nlFeedback, check: nlCheck },
      de: { common: deCommon, ribbon: deRibbon, backstage: deBackstage, settings: deSettings, feedback: deFeedback, check: deCheck },
      fr: { common: frCommon, ribbon: frRibbon, backstage: frBackstage, settings: frSettings, feedback: frFeedback, check: frCheck },
    },
    ns,
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});

// Load saved language from Tauri store on startup
getSetting("language", "auto").then((lang) => {
  changeLanguage(lang);
});

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || "en";
    const supported = Object.keys(i18next.options.resources || {});
    const finalLang = supported.includes(detected) ? detected : "en";
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
