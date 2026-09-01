/**
 * AppPropertiesPanel — wraps the existing PropertiesPanel in the new
 * SidePanel chrome. Routes content on `state.selection` (already does so
 * inside PropertiesPanel.tsx). Phase 6 scaffold; full merge of
 * BarPropertiesDialog / NodePropertiesDialog / PlatePropertiesDialog
 * content sections is deferred to Phase 8 (the existing PropertiesPanel
 * already covers most of the fields).
 */
import { useFEM } from "../../context/FEMContext";
import { useI18n } from "../../i18n/i18n";
import { PropertiesPanel } from "../PropertiesPanel/PropertiesPanel";
import { SidePanel } from "./SidePanel";
import { usePersistedDockSize, DOCK_KEYS } from "./DockSplitter";

interface AppPropertiesPanelProps {
  onClose?: () => void;
}

export function AppPropertiesPanel({ onClose }: AppPropertiesPanelProps) {
  const { state } = useFEM();
  const { t } = useI18n();
  const [width, setWidth] = usePersistedDockSize(DOCK_KEYS.rightPanelWidth, 280);

  const sel = state.selection;
  const beamCount = sel.elementIds.size;
  const nodeCount = sel.nodeIds.size;
  const plateCount = sel.plateIds.size;
  const total = beamCount + nodeCount + plateCount;

  let title = t("nodeProps.title") || "Properties";
  if (total === 0) title = "Properties";
  else if (total > 1) title = `${total} elements selected`;
  else if (beamCount === 1) title = `Beam #${Array.from(sel.elementIds)[0]}`;
  else if (nodeCount === 1) title = `Node #${Array.from(sel.nodeIds)[0]}`;
  else if (plateCount === 1) title = `Plate #${Array.from(sel.plateIds)[0]}`;

  return (
    <SidePanel
      side="right"
      title={title}
      width={width}
      onWidthChange={setWidth}
      onClose={onClose}
    >
      <PropertiesPanel />
    </SidePanel>
  );
}
