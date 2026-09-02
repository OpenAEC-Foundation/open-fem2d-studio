import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { changeLanguage } from "../../i18n/config";
import { setSetting } from "../../store";
import {
  projectInfoIcon,
  materialsIcon,
  sectionsIcon,
  calcSettingsIcon,
  themeSunIcon,
  themeMoonIcon,
  languageIcon,
} from "./icons";

interface SettingsTabProps {
  onSettingsClick?: () => void;
  onProjectSettingsClick?: () => void;
  /** Actieve app-thema — bepaalt de active-markering op de themaknoppen. */
  theme?: string;
  /** Themawissel (direct toepassen + persist) — geleverd door App via Ribbon. */
  onThemeSelect?: (theme: string) => void;
  /** Open de alleen-lezen bibliotheek-dialoog op het gegeven tabblad. */
  onOpenLibrary?: (tab: "sections" | "materials") => void;
}

export default function SettingsTab({
  onSettingsClick, onProjectSettingsClick,
  theme, onThemeSelect, onOpenLibrary,
}: SettingsTabProps) {
  const { t, i18n } = useTranslation("ribbon");
  // Actieve taal — resolvedLanguage vangt varianten als "en-US" af.
  const activeLang = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0];

  // Taalwissel: zelfde route als SettingsDialog (changeLanguage + persist),
  // maar direct — de ribbon-knop is een sneltoets, geen draft-dialoog.
  const selectLanguage = (lang: "nl" | "en") => {
    void changeLanguage(lang);
    void setSetting("language", lang);
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Project */}
        <RibbonGroup label={t("settings.project")}>
          <RibbonButton
            icon={projectInfoIcon}
            label={t("settings.projectInfo")}
            size="large"
            onClick={onProjectSettingsClick}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={materialsIcon}
              label={t("settings.materials")}
              size="small"
              onClick={() => onOpenLibrary?.("materials")}
            />
            <RibbonButton
              icon={sectionsIcon}
              label={t("settings.sections")}
              size="small"
              onClick={() => onOpenLibrary?.("sections")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Berekening */}
        <RibbonGroup label={t("settings.calculation")}>
          <RibbonButton
            icon={calcSettingsIcon}
            label={t("settings.calcSettings")}
            size="large"
            onClick={onSettingsClick}
          />
        </RibbonGroup>

        {/* Weergave — themawissel. "Donker" = het OpenAEC-huisstijlthema;
            bij een ander donker thema (forge/blueprint/contrast) licht geen
            van beide knoppen op. */}
        <RibbonGroup label={t("settings.appearance")}>
          <RibbonButton
            icon={themeMoonIcon}
            label={t("settings.darkMode")}
            size="large"
            active={theme === "openaec"}
            onClick={() => onThemeSelect?.("openaec")}
          />
          <RibbonButton
            icon={themeSunIcon}
            label={t("settings.lightMode")}
            size="large"
            active={theme === "light"}
            onClick={() => onThemeSelect?.("light")}
          />
        </RibbonGroup>

        {/* Taal — alleen talen met een echte locale (nl/en). */}
        <RibbonGroup label={t("settings.language")}>
          <RibbonButton
            icon={languageIcon}
            label="NL"
            size="large"
            title="Nederlands"
            active={activeLang === "nl"}
            onClick={() => selectLanguage("nl")}
          />
          <RibbonButton
            icon={languageIcon}
            label="EN"
            size="large"
            title="English"
            active={activeLang === "en"}
            onClick={() => selectLanguage("en")}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
