/**
 * CoordsHud — bottom-left chip with cursor world coordinates (m).
 * Phase 7 of OpenAEC UI big-bang.
 */
import { useFEM } from "../../../context/FEMContext";

export function CoordsHud() {
  const { state } = useFEM();
  const p = state.mouseWorldPos;

  return (
    <div className="oa-mesh-hud oa-mesh-hud-bl">
      <div className="oa-mesh-hud-card oa-mesh-hud-card--mono">
        {p ? (
          <span>
            ({p.x.toFixed(3)}, {p.y.toFixed(3)}) m
          </span>
        ) : (
          <span style={{ opacity: 0.5 }}>(---, ---) m</span>
        )}
      </div>
    </div>
  );
}
