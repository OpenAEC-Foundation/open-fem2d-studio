/**
 * ZoomHud — top-right chip with zoom% + Fit/Reset buttons.
 * Phase 7 of OpenAEC UI big-bang.
 */
import { useFEM } from "../../../context/FEMContext";
import { ZoomIn, RotateCw } from "lucide-react";

const FIT_VIEW = { scale: 100, offsetX: 400, offsetY: 300 };

export function ZoomHud() {
  const { state, dispatch } = useFEM();
  const zoomPct = Math.round(state.viewState.scale);

  return (
    <div className="oa-mesh-hud oa-mesh-hud-tr">
      <div className="oa-mesh-hud-card oa-mesh-hud-card--mono">
        <strong>{zoomPct}%</strong>
        <button
          onClick={() => dispatch({ type: "SET_VIEW_STATE", payload: FIT_VIEW })}
          title="Zoom to fit"
          aria-label="Zoom to fit"
        >
          <ZoomIn size={12} />
        </button>
        <button
          onClick={() => dispatch({ type: "SET_VIEW_STATE", payload: FIT_VIEW })}
          title="Reset view"
          aria-label="Reset view"
        >
          <RotateCw size={12} />
        </button>
      </div>
    </div>
  );
}
