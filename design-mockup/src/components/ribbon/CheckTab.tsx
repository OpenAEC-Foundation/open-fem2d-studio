import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  checkRunIcon,
  checkPanelIcon,
  checkRulesIcon,
  exportCsvIcon,
  settingsIcon,
} from "./icons";

const stub = (label: string) => () => console.log(`TODO: ${label}`);

export type StandardCode = "EN1993" | "EN1995" | "EN1992";

interface CheckTabProps {
  /** Fires when the user clicks the "Toetsen uitvoeren" button — runs FEM solver. */
  onSolve?: () => void;
  /** Fires when the user clicks the "Maatgevend (envelope)" button. */
  onShowEnvelope?: () => void;
  /** True after `onSolve` has produced multi-LC results. */
  hasEnvelope?: boolean;
  /** Currently-selected design code (default EN 1993). */
  activeCode?: StandardCode;
  onSelectCode?: (code: StandardCode) => void;
  /** Toggle the Resultaten-tab in sidebar + bottom. */
  onToggleResultsPanel?: () => void;
  resultsPanelActive?: boolean;
  /** Auto-run checks after every solve. */
  autoRunEnabled?: boolean;
  onToggleAutoRun?: () => void;
  /** Export the steel-check unity-check results as CSV. */
  onExportCheck?: () => void;
}

export default function CheckTab({
  onSolve, onShowEnvelope, hasEnvelope,
  activeCode = "EN1993", onSelectCode,
  onToggleResultsPanel, resultsPanelActive,
  autoRunEnabled, onToggleAutoRun,
  onExportCheck,
}: CheckTabProps) {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Run — primary action: wired to the plane-frame solver + envelope */}
        <RibbonGroup label={t("check.runGroup")}>
          <RibbonButton
            icon={checkRunIcon}
            label={t("check.run")}
            size="large"
            active
            onClick={onSolve ?? stub("Run EN 1993 checks")}
          />
          <RibbonButton
            icon={checkRunIcon}
            label="Maatgevend (envelope)"
            size="large"
            active={hasEnvelope}
            disabled={!hasEnvelope}
            onClick={onShowEnvelope ?? stub("Show envelope")}
          />
        </RibbonGroup>

        {/* Standards */}
        <RibbonGroup label={t("check.standards")}>
          <RibbonButton
            icon={checkRulesIcon}
            label={t("check.en1993")}
            size="large"
            active={activeCode === "EN1993"}
            onClick={onSelectCode ? () => onSelectCode("EN1993") : stub("Select EN 1993-1-1")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={checkRulesIcon}
              label={t("check.en1995")}
              size="small"
              active={activeCode === "EN1995"}
              onClick={onSelectCode ? () => onSelectCode("EN1995") : stub("Select EN 1995")}
            />
            <RibbonButton
              icon={checkRulesIcon}
              label={t("check.en1992")}
              size="small"
              active={activeCode === "EN1992"}
              onClick={onSelectCode ? () => onSelectCode("EN1992") : stub("Select EN 1992")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* View */}
        <RibbonGroup label={t("check.viewGroup")}>
          <RibbonButton
            icon={checkPanelIcon}
            label={t("check.viewPanel")}
            size="large"
            active={resultsPanelActive}
            onClick={onToggleResultsPanel ?? stub("Toggle results panel")}
          />
        </RibbonGroup>

        {/* Options + Export */}
        <RibbonGroup label={t("check.options")}>
          <RibbonButtonStack>
            <RibbonButton
              icon={settingsIcon}
              label={t("check.autoRun")}
              size="small"
              active={autoRunEnabled}
              onClick={onToggleAutoRun ?? stub("Toggle auto-run")}
            />
            <RibbonButton
              icon={exportCsvIcon}
              label={t("check.export")}
              size="small"
              onClick={onExportCheck ?? stub("Export check results")}
            />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
