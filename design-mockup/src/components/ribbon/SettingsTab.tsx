import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
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
}

const stub = (label: string) => () => console.log(`TODO: ${label}`);

export default function SettingsTab({ onSettingsClick, onProjectSettingsClick }: SettingsTabProps) {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Project */}
        <RibbonGroup label={t("settings.project")}>
          <RibbonButton
            icon={projectInfoIcon}
            label={t("settings.projectInfo")}
            size="large"
            onClick={onProjectSettingsClick ?? stub("Project info dialog")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={materialsIcon}
              label={t("settings.materials")}
              size="small"
              onClick={stub("Materials dialog")}
            />
            <RibbonButton
              icon={sectionsIcon}
              label={t("settings.sections")}
              size="small"
              onClick={stub("Sections library")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Calculation */}
        <RibbonGroup label={t("settings.calculation")}>
          <RibbonButton
            icon={calcSettingsIcon}
            label={t("settings.calcSettings")}
            size="large"
            onClick={onSettingsClick ?? stub("Calculation settings")}
          />
        </RibbonGroup>

        {/* Appearance — theme toggle */}
        <RibbonGroup label={t("settings.appearance")}>
          <RibbonButton
            icon={themeMoonIcon}
            label={t("settings.darkMode")}
            size="large"
            active
            onClick={stub("Set dark theme")}
          />
          <RibbonButton
            icon={themeSunIcon}
            label={t("settings.lightMode")}
            size="large"
            onClick={stub("Set light theme")}
          />
        </RibbonGroup>

        {/* Language */}
        <RibbonGroup label={t("settings.language")}>
          <RibbonButton
            icon={languageIcon}
            label={t("settings.languageSelect")}
            size="large"
            onClick={stub("Open language picker")}
          />
          <RibbonButtonStack>
            <RibbonButton icon={languageIcon} label="NL" size="small" active onClick={stub("Set NL")} />
            <RibbonButton icon={languageIcon} label="EN" size="small" onClick={stub("Set EN")} />
            <RibbonButton icon={languageIcon} label="FR" size="small" onClick={stub("Set FR")} />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
