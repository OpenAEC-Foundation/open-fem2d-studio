import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  matrixIcon,
  networkIcon,
  solverInfoIcon,
  dofMapIcon,
  logsIcon,
  errorsIcon,
  exportCsvIcon,
} from "./icons";

interface Props {
  /** Open de Inzicht-view (zelfde als klikken op de Inzicht-ribbon-tab). */
  onShowInsights?: () => void;
  /** Show specific Insights sub-view (element-K / system-K / dof-map / logs / errors). */
  onShowInsightsMode?: (mode: "element" | "system" | "dof" | "logs" | "errors") => void;
  /** Export K matrices as CSV. */
  onExportMatrixCsv?: () => void;
}

const stub = (label: string) => () => console.log(`TODO: ${label}`);

export default function InsightsTab({ onShowInsights, onShowInsightsMode, onExportMatrixCsv }: Props) {
  const { t } = useTranslation("ribbon");
  const openInsights = () => onShowInsights?.();
  const goto = (mode: "element" | "system" | "dof" | "logs" | "errors") => () => {
    onShowInsightsMode ? onShowInsightsMode(mode) : openInsights();
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Matrices */}
        <RibbonGroup label={t("insights.matrices")}>
          <RibbonButton
            icon={matrixIcon}
            label={t("insights.elementK")}
            size="large"
            onClick={goto("element")}
          />
          <RibbonButton
            icon={networkIcon}
            label={t("insights.systemK")}
            size="large"
            onClick={goto("system")}
          />
        </RibbonGroup>

        {/* Solver */}
        <RibbonGroup label={t("insights.solver")}>
          <RibbonButton
            icon={solverInfoIcon}
            label={t("insights.solverInfo")}
            size="large"
            onClick={openInsights}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={dofMapIcon}
              label={t("insights.dofMap")}
              size="small"
              onClick={goto("dof")}
            />
            <RibbonButton
              icon={exportCsvIcon}
              label={t("insights.exportMatrix")}
              size="small"
              onClick={onExportMatrixCsv ?? stub("Export matrix to CSV (handler not wired)")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Diagnostics */}
        <RibbonGroup label={t("insights.diagnostics")}>
          <RibbonButtonStack>
            <RibbonButton
              icon={logsIcon}
              label={t("insights.logs")}
              size="small"
              onClick={goto("logs")}
            />
            <RibbonButton
              icon={errorsIcon}
              label={t("insights.errors")}
              size="small"
              onClick={goto("errors")}
            />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
