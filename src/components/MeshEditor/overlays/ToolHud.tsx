/**
 * ToolHud — top-left chip showing the active tool.
 * Phase 7 of OpenAEC UI big-bang.
 */
import { useFEM } from "../../../context/FEMContext";
import { useI18n } from "../../../i18n/i18n";

const TOOL_LABELS: Record<string, string> = {
  select: "Select",
  addNode: "Add Node",
  addBeam: "Add Bar",
  addPlate: "Add Plate",
  addLoad: "Point Load",
  addLineLoad: "Line Load",
  addThermalLoad: "Thermal",
  addPinned: "Pinned Support",
  addFixed: "Fixed Support",
  addXRoller: "X-Roller",
  addZRoller: "Z-Roller",
  addXSpring: "X-Spring",
  addZSpring: "Z-Spring",
  addRotSpring: "Rot. Spring",
  rotate: "Rotate",
  addSubNode: "Sub-node",
  delete: "Delete",
  pan: "Pan",
};

export function ToolHud() {
  const { state } = useFEM();
  const { t } = useI18n();
  const label = TOOL_LABELS[state.selectedTool] ?? state.selectedTool;

  return (
    <div className="oa-mesh-hud oa-mesh-hud-tl">
      <div className="oa-mesh-hud-card">
        <span style={{ color: "var(--theme-fg-muted)" }}>{t("status.tool")}</span>
        <strong>{label}</strong>
      </div>
    </div>
  );
}
