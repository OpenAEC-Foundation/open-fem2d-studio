/**
 * i18n voor tests die componenten renderen (react-dom/server).
 *
 * Waarom: de app initialiseert i18next in src/i18n/config.ts, maar dat bestand
 * leest de taalkeuze uit de Tauri-store en de browser (navigator) en draait dus
 * niet onder kaal node. Zonder initialisatie geeft `t("sleutel")` de SLEUTEL
 * terug, en een test die in de gerenderde SVG op de zichtbare tekst meet
 * ("…wapening niet getekend", "per zijde") ziet dan iets anders dan de
 * gebruiker. Deze module zet dezelfde zes naamruimten uit de locales klaar,
 * synchroon, in de gevraagde taal (standaard Nederlands — de taal waarin de
 * tests hun verwachtingen schrijven).
 *
 * Gebruik (vóór het importeren van de component):
 *   await import("./scripts/i18n-voor-tests.mjs");
 * of met een taal:
 *   const { zetTaal } = await import("./scripts/i18n-voor-tests.mjs"); await zetTaal("de");
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const LOCALES = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "src", "i18n", "locales");
const NAAMRUIMTEN = ["common", "ribbon", "backstage", "settings", "feedback", "check"];
const TALEN = ["nl", "en", "de", "fr"];

const resources = {};
for (const taal of TALEN) {
  resources[taal] = {};
  for (const ns of NAAMRUIMTEN) {
    resources[taal][ns] = JSON.parse(readFileSync(join(LOCALES, taal, `${ns}.json`), "utf8"));
  }
}

if (!i18next.isInitialized) {
  await i18next.use(initReactI18next).init({
    resources,
    lng: "nl",
    ns: NAAMRUIMTEN,
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    initAsync: false,
    initImmediate: false,
  });
}

/** Wisselt de taal voor de volgende render. */
export async function zetTaal(taal) {
  await i18next.changeLanguage(taal);
}

export default i18next;
