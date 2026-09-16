import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
        i18next.t("ribbon:ifc.importTitle"),
        i18next.t("ribbon:ifc.importRecognized", { naam: file.name, grootte: sizeKb, kop: head.slice(0, 100) }),
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
  /** Idem, maar alleen het draagsysteem — zonder belastinggevallen. */
  onExportIfcStructural?: () => void;
  /** Controleert de export en meldt fouten, waarschuwingen en beperkingen. */
  onValidateIfc?: () => void;
  /** Opent het IFC-tabblad (boomstructuur, STEP-tekst, statistieken). */
  onOpenIfcView?: () => void;
}

export default function IfcTab({
  onExportIfc, onExportIfcStructural, onValidateIfc, onOpenIfcView,
}: IfcTabProps) {
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
              onClick={onExportIfc ?? soon(t("ifc.soonExportTitle"), t("ifc.soonExportHint"))}
            />
            <RibbonButton
              icon={ifcExportIcon}
              label={t("ifc.exportStructural")}
              size="small"
              onClick={onExportIfcStructural ?? soon(
                t("ifc.soonExportStructuralTitle"),
                t("ifc.soonExportStructuralHint"),
              )}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Model — Structural model + Tree/Stats */}
        <RibbonGroup label={t("ifc.model")}>
          <RibbonButton
            icon={ifcStructuralIcon}
            label={t("ifc.structuralModel")}
            size="large"
            onClick={soon(t("ifc.soonStructuralModelTitle"), t("ifc.soonStructuralModelHint"))}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={ifcTreeIcon}
              label={t("ifc.structure")}
              size="small"
              onClick={onOpenIfcView ?? soon(t("ifc.soonTreeTitle"), t("ifc.soonTreeHint"))}
            />
            <RibbonButton
              icon={ifcStatsIcon}
              label={t("ifc.statistics")}
              size="small"
              onClick={onOpenIfcView ?? soon(t("ifc.soonStatsTitle"), t("ifc.soonStatsHint"))}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Mapping — IFC → FEM material/profile mapping */}
        <RibbonGroup label={t("ifc.mapping")}>
          <RibbonButton
            icon={ifcMaterialMapIcon}
            label={t("ifc.materialMap")}
            size="large"
            onClick={soon(t("ifc.soonMaterialMapTitle"), t("ifc.soonMaterialMapHint"))}
          />
        </RibbonGroup>

        {/* Tools */}
        <RibbonGroup label={t("ifc.tools")}>
          <RibbonButton
            icon={ifcValidateIcon}
            label={t("ifc.validate")}
            size="large"
            onClick={onValidateIfc ?? soon(
              t("ifc.soonValidatorTitle"),
              t("ifc.soonValidatorHint"),
            )}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
