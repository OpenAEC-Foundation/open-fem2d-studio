/**
 * App-scoped wrapper around the @openaec/shell StatusBar.
 *
 * Surfaces tool hint + coords on the left, model stats in the center,
 * and zoom/solver state on the right.
 */
import { StatusBar, StatusItem, StatusSeparator } from "@openaec/shell";
import { useFEM } from "../../context/FEMContext";
import { useI18n } from "../../i18n/i18n";
import { formatStress } from "../../utils/colors";

export function AppStatusBar() {
  const { t } = useI18n();
  const { state } = useFEM();
  const { mesh, result, selectedTool, viewState, mouseWorldPos, solverError, stressUnit } = state;

  const toolHints: Record<string, string> = {
    select: t("status.clickSelect"),
    addNode: t("status.clickNode"),
    addElement: t("status.clickTriangle"),
    addConstraint: t("status.clickConstraint"),
    addLoad: t("status.clickForce"),
    delete: t("status.clickDelete"),
    pan: t("status.dragPan"),
    addBeam: t("status.clickBeam"),
    addLineLoad: t("status.clickDistLoad"),
    addPinned: t("status.clickPinned"),
    addXRoller: t("status.clickXRoller"),
    addZRoller: t("status.clickZRoller"),
    addZSpring: t("status.clickZSpring"),
    addRotSpring: t("status.clickRotSpring"),
    addXSpring: t("status.clickXSpring"),
    addFixed: t("status.clickFixed"),
    addPlate: t("status.clickPlate"),
    addThermalLoad: t("status.clickThermal"),
    addSubNode: t("status.clickSubNode"),
    rotate: t("status.clickRotate"),
  };

  const zoomPercent = Math.round(viewState.scale);

  const left = (
    <>
      <StatusItem label={t("status.tool")}>
        {toolHints[selectedTool] ?? selectedTool}
      </StatusItem>
      <StatusSeparator />
      <StatusItem>
        {mouseWorldPos ? (
          <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
            X: {mouseWorldPos.x.toFixed(3)} m | Z: {mouseWorldPos.y.toFixed(3)} m
          </span>
        ) : (
          <span style={{ fontFamily: "var(--font-mono, monospace)", opacity: 0.5 }}>
            X: --- | Z: ---
          </span>
        )}
      </StatusItem>
    </>
  );

  const center = (
    <>
      <StatusItem label={t("statusBar.nodes")}>{mesh.getNodeCount()}</StatusItem>
      <StatusSeparator />
      <StatusItem label={t("statusBar.beams")}>{mesh.getBeamCount()}</StatusItem>
      <StatusSeparator />
      <StatusItem label={t("status.elements")}>{mesh.getElementCount()}</StatusItem>
    </>
  );

  const right = (
    <>
      <StatusItem label="Zoom">{zoomPercent}%</StatusItem>
      {solverError && (
        <>
          <StatusSeparator />
          <StatusItem>
            <span style={{ color: "var(--theme-danger, #dc2626)" }}>{solverError}</span>
          </StatusItem>
        </>
      )}
      {result && !solverError && (
        <>
          <StatusSeparator />
          <StatusItem>
            <span style={{ color: "var(--theme-success, #16a34a)" }}>{t("browser.solved")}</span>
          </StatusItem>
          <StatusSeparator />
          <StatusItem label="Max stress">
            {formatStress(result.maxVonMises, stressUnit)}
          </StatusItem>
        </>
      )}
    </>
  );

  return <StatusBar left={left} center={center} right={right} />;
}
