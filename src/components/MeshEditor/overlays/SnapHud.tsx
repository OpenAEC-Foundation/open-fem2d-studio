/**
 * SnapHud — bottom-right chip with snap toggles.
 * Phase 7 of OpenAEC UI big-bang.
 *
 * Currently surfaces the two snap settings the FEM state actually has
 * (snapToGrid + structuralGrid.snapToGridLines). Endpoint / Midpoint /
 * Intersection snaps are NOT wired in the underlying solver — they're
 * shown as disabled placeholders matching the plan §10 spec.
 */
import { useFEM } from "../../../context/FEMContext";

export function SnapHud() {
  const { state, dispatch } = useFEM();

  return (
    <div className="oa-mesh-hud oa-mesh-hud-br">
      <div className="oa-mesh-hud-card">
        <button
          className={state.snapToGrid ? "is-active" : ""}
          onClick={() => dispatch({ type: "SET_SNAP_TO_GRID", payload: !state.snapToGrid })}
          title="Snap to grid"
        >
          Grid
        </button>
        <button
          className={state.structuralGrid.snapToGridLines ? "is-active" : ""}
          onClick={() =>
            dispatch({
              type: "SET_SNAP_TO_GRID_LINES",
              payload: !state.structuralGrid.snapToGridLines,
            })
          }
          title="Snap to structural grid lines"
        >
          Lines
        </button>
        <button disabled title="Endpoint snap (binnenkort beschikbaar)">End</button>
        <button disabled title="Midpoint snap (binnenkort beschikbaar)">Mid</button>
        <button disabled title="Intersection snap (binnenkort beschikbaar)">Inter</button>
      </div>
    </div>
  );
}
