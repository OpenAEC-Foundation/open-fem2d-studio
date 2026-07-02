import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  tableNodesIcon,
  tableElementsIcon,
  plateIcon,
  tableLoadsIcon,
  tableResultsIcon,
  exportCsvIcon,
  copyIcon,
  filterIcon,
} from "./icons";

const stub = (label: string) => () => console.log(`TODO: ${label}`);

export default function TableTab() {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Model — Nodes / Elements / Plates */}
        <RibbonGroup label={t("table.model")}>
          <RibbonButton
            icon={tableNodesIcon}
            label={t("table.nodes")}
            size="large"
            onClick={stub("Table: nodes")}
          />
          <RibbonButton
            icon={tableElementsIcon}
            label={t("table.elements")}
            size="large"
            onClick={stub("Table: elements")}
          />
          <RibbonButton
            icon={plateIcon}
            label={t("table.plates")}
            size="large"
            onClick={stub("Table: plates")}
          />
        </RibbonGroup>

        {/* Loads — Point / Distributed / Thermal */}
        <RibbonGroup label={t("table.loads")}>
          <RibbonButton
            icon={tableLoadsIcon}
            label={t("table.pointLoads")}
            size="large"
            onClick={stub("Table: point loads")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={tableLoadsIcon}
              label={t("table.distLoads")}
              size="small"
              onClick={stub("Table: dist loads")}
            />
            <RibbonButton
              icon={tableLoadsIcon}
              label={t("table.thermalLoads")}
              size="small"
              onClick={stub("Table: thermal loads")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Results */}
        <RibbonGroup label={t("table.results")}>
          <RibbonButton
            icon={tableResultsIcon}
            label={t("table.reactions")}
            size="large"
            onClick={stub("Table: reactions")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={tableResultsIcon}
              label={t("table.displacements")}
              size="small"
              onClick={stub("Table: displacements")}
            />
            <RibbonButton
              icon={tableResultsIcon}
              label={t("table.internalForces")}
              size="small"
              onClick={stub("Table: internal forces")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Tools — Filter / Copy / Export */}
        <RibbonGroup label={t("table.tools")}>
          <RibbonButton
            icon={exportCsvIcon}
            label={t("table.exportCsv")}
            size="large"
            onClick={stub("Export CSV")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={filterIcon}
              label={t("table.filter")}
              size="small"
              onClick={stub("Filter table")}
            />
            <RibbonButton
              icon={copyIcon}
              label={t("table.copy")}
              size="small"
              onClick={stub("Copy table")}
            />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
