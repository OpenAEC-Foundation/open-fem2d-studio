import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  checkRunIcon,
  checkPanelIcon,
  checkRulesIcon,
  exportCsvIcon,
} from "./icons";

const stub = (label: string) => () => console.log(`TODO: ${label}`);

export type StandardCode = "EN1993" | "EN1995" | "EN1992";

interface CheckTabProps {
  /** Fires when the user clicks the "Berekenen (FEM)" button — runs FEM solver. */
  onSolve?: () => void;
  /**
   * Draait de gecombineerde normtoetsing (EN 1993 staal + EN 1995 hout)
   * tegen de Rust-backend en opent het toetsingspaneel.
   */
  onRunMemberChecks?: () => void;
  /** True zolang de normtoetsing loopt (invoke onderweg). */
  checksRunning?: boolean;
  /** Opent/sluit het toetsingspaneel (volledige-breedte weergave). */
  onOpenCheckPanel?: () => void;
  /** True wanneer het toetsingspaneel de actieve weergave is. */
  checkPanelActive?: boolean;
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
  /** Export the steel-check unity-check results as CSV. */
  onExportCheck?: () => void;
}

export default function CheckTab({
  onSolve, onShowEnvelope, hasEnvelope,
  onRunMemberChecks, checksRunning, onOpenCheckPanel, checkPanelActive,
  activeCode = "EN1993", onSelectCode,
  onToggleResultsPanel, resultsPanelActive,
  onExportCheck,
}: CheckTabProps) {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Normtoetsing — primary action: EN 1993 + EN 1995 in één run
            tegen de Rust-backend (desktop-app). */}
        <RibbonGroup label={t("check.memberChecks")}>
          <RibbonButton
            icon={checkRunIcon}
            label={checksRunning ? "…" : t("check.memberChecksRun")}
            size="large"
            active
            disabled={checksRunning}
            onClick={onRunMemberChecks ?? stub("Run member checks")}
          />
          <RibbonButton
            icon={checkPanelIcon}
            label={t("check.checkPanel")}
            size="large"
            active={checkPanelActive}
            onClick={onOpenCheckPanel ?? stub("Open check panel")}
          />
        </RibbonGroup>

        {/* Run — FEM solver + envelope */}
        <RibbonGroup label={t("check.runGroup")}>
          <RibbonButton
            icon={checkRunIcon}
            label={t("check.run")}
            size="large"
            onClick={onSolve ?? stub("Run FEM solve")}
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

        {/* Export — de toetsing zelf loopt altijd mee met de berekening en
            heeft daarom geen aan/uit-knop meer. */}
        <RibbonGroup label={t("check.options")}>
          <RibbonButtonStack>
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
