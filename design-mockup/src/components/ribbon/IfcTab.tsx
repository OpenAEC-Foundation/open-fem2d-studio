import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  ifcImportIcon,
  ifcExportIcon,
  ifcTreeIcon,
  ifcValidateIcon,
  ifcStatsIcon,
  ifcStructuralIcon,
  ifcMaterialMapIcon,
} from "./icons";

import { comingSoon } from "../../io/notify";

const soon = (label: string, hint?: string) => () => comingSoon(label, hint);

/** Open the user's IFC file via a hidden file-input; log basic stats. */
async function pickIfcFile(): Promise<void> {
  await new Promise<void>(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc,application/x-step";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(); return; }
      const head = await file.slice(0, 200).text();
      const sizeKb = (file.size / 1024).toFixed(1);
      comingSoon(
        "IFC import",
        `Bestand "${file.name}" (${sizeKb} kB) is herkend.\n\nVolledige IFC-parse + structuralisatie naar FEM-mesh komt in een vervolg-update — daarvoor wordt @thatopen IFC viewer geïntegreerd.\n\nEerste bytes:\n${head.slice(0, 100)}...`,
      );
      resolve();
    };
    input.click();
  });
}

interface IfcTabProps {
  /**
   * Exporteert het rekenmodel als IFC4-bestand (Structural Analysis Domain,
   * zie src/io/ifcExport.ts). Zonder prop valt de knop terug op de eerlijke
   * comingSoon-melding.
   */
  onExportIfc?: () => void;
}

export default function IfcTab({ onExportIfc }: IfcTabProps) {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* File ops — large Import, stacked Export */}
        <RibbonGroup label={t("ifc.fileOps")}>
          <RibbonButton
            icon={ifcImportIcon}
            label={t("ifc.import")}
            size="large"
            onClick={pickIfcFile}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={ifcExportIcon}
              label={t("ifc.export")}
              size="small"
              onClick={onExportIfc ?? soon("IFC-export", "Genereert een geldig IFC4 bestand uit het huidige model.")}
            />
            <RibbonButton
              icon={ifcExportIcon}
              label={t("ifc.exportStructural")}
              size="small"
              onClick={soon("IFC structural-only export", "Export beperkt tot dragend deel (kolommen, liggers, platen) volgens IFC4 STRUCTURAL_ANALYSIS_VIEW.")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Model — Structural model + Tree/Stats */}
        <RibbonGroup label={t("ifc.model")}>
          <RibbonButton
            icon={ifcStructuralIcon}
            label={t("ifc.structuralModel")}
            size="large"
            onClick={soon("IFC → structureel model", "Extraheert IfcColumn / IfcBeam / IfcSlab → FEM nodes + beams + plates.")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={ifcTreeIcon}
              label={t("ifc.structure")}
              size="small"
              onClick={soon("IFC entity-tree", "Toont hiërarchie van IFC-entities (Project → Site → Building → Storey → Elements).")}
            />
            <RibbonButton
              icon={ifcStatsIcon}
              label={t("ifc.statistics")}
              size="small"
              onClick={soon("IFC statistieken", "Telt entities per type + materialen + property sets.")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Mapping — IFC → FEM material/profile mapping */}
        <RibbonGroup label={t("ifc.mapping")}>
          <RibbonButton
            icon={ifcMaterialMapIcon}
            label={t("ifc.materialMap")}
            size="large"
            onClick={soon("Material-mapping editor", "Mapping van IFC-materialen → FEM grade (S235/S355/C30/37 etc.) + profielcatalogus-lookup.")}
          />
        </RibbonGroup>

        {/* Tools */}
        <RibbonGroup label={t("ifc.tools")}>
          <RibbonButton
            icon={ifcValidateIcon}
            label={t("ifc.validate")}
            size="large"
            onClick={soon("IFC validator", "Controleert geometrie-integriteit + IFC schema-conformiteit (IFC4 ADD2).")}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
