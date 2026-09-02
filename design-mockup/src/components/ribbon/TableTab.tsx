/**
 * TableTab — ribbon-tab "Tabel": kiest welke dataset de tabel-editor
 * (TableView) toont en biedt de tabel-hulpmiddelen (Export CSV, Kopiëren,
 * Filter). De dataset-knoppen lichten op via `active` zodat zichtbaar is
 * welke tabel er in de hoofdweergave staat.
 */
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import type { TableDataset } from "../table/tableTypes";
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

interface TableTabProps {
  /** De dataset die de tabel-editor nu toont (voor de active-highlight). */
  activeDataset?: TableDataset;
  /** Kies een dataset — App schakelt daarbij ook de hoofdweergave om. */
  onSelectDataset?: (d: TableDataset) => void;
  /** Download de actieve (gefilterde) tabel als CSV. */
  onExportCsv?: () => void;
  /** Kopieer de actieve tabel als TSV naar het klembord (Excel-plakbaar). */
  onCopyTable?: () => void;
  /** Focus het filterveld boven de tabel. */
  onFocusFilter?: () => void;
}

export default function TableTab({
  activeDataset, onSelectDataset, onExportCsv, onCopyTable, onFocusFilter,
}: TableTabProps) {
  const { t } = useTranslation("ribbon");

  const pick = (d: TableDataset) => () => onSelectDataset?.(d);
  const isActive = (d: TableDataset) => activeDataset === d;

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Model — Knopen / Elementen / Platen */}
        <RibbonGroup label={t("table.model")}>
          <RibbonButton
            icon={tableNodesIcon}
            label={t("table.nodes")}
            size="large"
            active={isActive("nodes")}
            onClick={pick("nodes")}
          />
          <RibbonButton
            icon={tableElementsIcon}
            label={t("table.elements")}
            size="large"
            active={isActive("elements")}
            onClick={pick("elements")}
          />
          <RibbonButton
            icon={plateIcon}
            label={t("table.plates")}
            size="large"
            active={isActive("plates")}
            onClick={pick("plates")}
          />
        </RibbonGroup>

        {/* Belastingen — Puntlasten / Verdeelde lasten / Thermisch */}
        <RibbonGroup label={t("table.loads")}>
          <RibbonButton
            icon={tableLoadsIcon}
            label={t("table.pointLoads")}
            size="large"
            active={isActive("pointLoads")}
            onClick={pick("pointLoads")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={tableLoadsIcon}
              label={t("table.distLoads")}
              size="small"
              active={isActive("lineLoads")}
              onClick={pick("lineLoads")}
            />
            <RibbonButton
              icon={tableLoadsIcon}
              label={t("table.thermalLoads")}
              size="small"
              active={isActive("thermalLoads")}
              onClick={pick("thermalLoads")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Resultaten — alleen-lezen tabellen */}
        <RibbonGroup label={t("table.results")}>
          <RibbonButton
            icon={tableResultsIcon}
            label={t("table.reactions")}
            size="large"
            active={isActive("reactions")}
            onClick={pick("reactions")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={tableResultsIcon}
              label={t("table.displacements")}
              size="small"
              active={isActive("displacements")}
              onClick={pick("displacements")}
            />
            <RibbonButton
              icon={tableResultsIcon}
              label={t("table.internalForces")}
              size="small"
              active={isActive("forces")}
              onClick={pick("forces")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Hulpmiddelen — Export / Filter / Kopiëren */}
        <RibbonGroup label={t("table.tools")}>
          <RibbonButton
            icon={exportCsvIcon}
            label={t("table.exportCsv")}
            size="large"
            onClick={() => onExportCsv?.()}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={filterIcon}
              label={t("table.filter")}
              size="small"
              onClick={() => onFocusFilter?.()}
            />
            <RibbonButton
              icon={copyIcon}
              label={t("table.copy")}
              size="small"
              onClick={() => onCopyTable?.()}
            />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
