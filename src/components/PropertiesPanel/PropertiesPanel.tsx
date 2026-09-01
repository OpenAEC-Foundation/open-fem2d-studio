/**
 * PropertiesPanel — selection-driven router for the right-side panel.
 *
 * Routes single-element selections to the freshly-rewritten BarProperties /
 * NodeProperties / PlateProperties components. Multi-selection or
 * no-selection states show OpenAEC-styled helper bodies. The legacy
 * Dist-Load editor block stays here (selectedDistLoadIds path) but is
 * rendered with `.oa-props-*` primitives.
 */
import { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { IDistributedLoad } from '../../core/fem/LoadCase';
import { BarProperties } from './BarProperties';
import { NodeProperties } from './NodeProperties';
import { PlateProperties } from './PlateProperties';
import './PropertiesPanel.css';

// Inline sub-component: editor for the currently-selected distributed load.
function DistLoadProperties({
  load,
  lcId,
  dispatch,
  pushUndo,
}: {
  load: IDistributedLoad;
  lcId: number;
  dispatch: (action: any) => void;
  pushUndo: () => void;
}) {
  const [qz1, setQz1] = useState(() => ((load.qy || 0) / 1000).toFixed(2));
  const [qz2, setQz2] = useState(() => (((load.qyEnd ?? load.qy) || 0) / 1000).toFixed(2));
  const [startT, setStartT] = useState(() => (load.startT ?? 0).toFixed(3));
  const [endT, setEndT] = useState(() => (load.endT ?? 1).toFixed(3));
  const [coordSystem, setCoordSystem] = useState<'local' | 'global'>(load.coordSystem ?? 'local');
  const [description, setDescription] = useState(load.description ?? '');

  // Re-sync when the load identity changes
  const [prevLoadId, setPrevLoadId] = useState(load.id);
  if (load.id !== prevLoadId) {
    setPrevLoadId(load.id);
    setQz1(((load.qy || 0) / 1000).toFixed(2));
    setQz2((((load.qyEnd ?? load.qy) || 0) / 1000).toFixed(2));
    setStartT((load.startT ?? 0).toFixed(3));
    setEndT((load.endT ?? 1).toFixed(3));
    setCoordSystem(load.coordSystem ?? 'local');
    setDescription(load.description ?? '');
  }

  const commit = (overrides: Partial<{
    qy: number; qyEnd: number; startT: number; endT: number;
    coordSystem: 'local' | 'global'; description: string;
  }>) => {
    if (load.id == null) return;
    pushUndo();
    dispatch({
      type: 'UPDATE_DISTRIBUTED_LOAD',
      payload: {
        lcId,
        loadId: load.id,
        qx: load.qx,
        qy: overrides.qy ?? (parseFloat(qz1) || 0) * 1000,
        qxEnd: load.qxEnd,
        qyEnd: overrides.qyEnd ?? (parseFloat(qz2) || 0) * 1000,
        startT: overrides.startT ?? (parseFloat(startT) || 0),
        endT: overrides.endT ?? (parseFloat(endT) || 1),
        coordSystem: overrides.coordSystem ?? coordSystem,
        description: overrides.description ?? description,
      },
    });
  };

  return (
    <section className="oa-props-section">
      <div className="oa-props-section-title">Distributed load #{load.id}</div>
      <div className="oa-props-section-body">
        <div className="oa-props-row">
          <span className="oa-props-label">Beam</span>
          <span className="oa-props-value">#{load.elementId}</span>
        </div>
        <div className="oa-props-row-2">
          <label className="oa-props-row">
            <span className="oa-props-label">q₁ (kN/m)</span>
            <input
              className="oa-props-input"
              type="number" step="0.1"
              value={qz1}
              onChange={e => setQz1(e.target.value)}
              onBlur={() => commit({ qy: (parseFloat(qz1) || 0) * 1000 })}
            />
          </label>
          <label className="oa-props-row">
            <span className="oa-props-label">q₂ (kN/m)</span>
            <input
              className="oa-props-input"
              type="number" step="0.1"
              value={qz2}
              onChange={e => setQz2(e.target.value)}
              onBlur={() => commit({ qyEnd: (parseFloat(qz2) || 0) * 1000 })}
            />
          </label>
        </div>
        <div className="oa-props-row-2">
          <label className="oa-props-row">
            <span className="oa-props-label">Start (0–1)</span>
            <input
              className="oa-props-input"
              type="number" step="0.01" min="0" max="1"
              value={startT}
              onChange={e => setStartT(e.target.value)}
              onBlur={() => commit({ startT: Math.max(0, Math.min(1, parseFloat(startT) || 0)) })}
            />
          </label>
          <label className="oa-props-row">
            <span className="oa-props-label">End (0–1)</span>
            <input
              className="oa-props-input"
              type="number" step="0.01" min="0" max="1"
              value={endT}
              onChange={e => setEndT(e.target.value)}
              onBlur={() => commit({ endT: Math.max(0, Math.min(1, parseFloat(endT) || 1)) })}
            />
          </label>
        </div>
        <div className="oa-props-row">
          <span className="oa-props-label">Direction</span>
          <select
            className="oa-props-select"
            value={coordSystem}
            onChange={e => {
              const cs = e.target.value as 'local' | 'global';
              setCoordSystem(cs);
              commit({ coordSystem: cs });
            }}
          >
            <option value="local">Perpendicular to beam</option>
            <option value="global">Global Z-axis</option>
          </select>
        </div>
        <div className="oa-props-row">
          <span className="oa-props-label">Description</span>
          <input
            className="oa-props-input"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={() => commit({ description })}
            placeholder="e.g. Self-weight"
          />
        </div>
      </div>
    </section>
  );
}

export function PropertiesPanel() {
  const { state, dispatch, pushUndo } = useFEM();
  const { mesh, selection, loadCases } = state;

  const totalSelected =
    selection.nodeIds.size + selection.elementIds.size + selection.plateIds.size;

  // Locate the optional distributed load selection
  const selectedDistLoadId = selection.selectedDistLoadIds.size === 1
    ? Array.from(selection.selectedDistLoadIds)[0]
    : null;
  let selectedDistLoad: IDistributedLoad | null = null;
  let selectedDistLoadLcId: number | null = null;
  if (selectedDistLoadId !== null) {
    for (const lc of loadCases) {
      const found = lc.distributedLoads.find(dl => dl.id === selectedDistLoadId);
      if (found) {
        selectedDistLoad = found;
        selectedDistLoadLcId = lc.id;
        break;
      }
    }
  }

  // ─── single-element routing ──────────────────────────────────────
  const single =
    totalSelected === 1 && selection.selectedDistLoadIds.size === 0
      ? (selection.elementIds.size === 1
          ? { kind: 'beam' as const, id: Array.from(selection.elementIds)[0] }
          : selection.nodeIds.size === 1
            ? { kind: 'node' as const, id: Array.from(selection.nodeIds)[0] }
            : selection.plateIds.size === 1
              ? { kind: 'plate' as const, id: Array.from(selection.plateIds)[0] }
              : null)
      : null;

  if (totalSelected > 1) {
    return (
      <div className="properties-panel">
        <div className="properties-multi-select">
          {totalSelected} elements selected
          <div className="properties-multi-hint">Select a single element to edit its properties.</div>
        </div>
      </div>
    );
  }

  if (single?.kind === 'beam')  return <BarProperties beamId={single.id} />;
  if (single?.kind === 'node')  return <NodeProperties nodeId={single.id} />;
  if (single?.kind === 'plate') return <PlateProperties plateId={single.id} />;

  if (selectedDistLoad && selectedDistLoadLcId !== null) {
    return (
      <div className="properties-panel">
        <DistLoadProperties
          load={selectedDistLoad}
          lcId={selectedDistLoadLcId}
          dispatch={dispatch}
          pushUndo={pushUndo}
        />
      </div>
    );
  }

  // ─── empty state: project-level hints ─────────────────────────────
  return (
    <div className="properties-panel">
      <section className="oa-props-section">
        <div className="oa-props-section-title">Project</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row">
            <span className="oa-props-label">Name</span>
            <span className="oa-props-value">{state.projectInfo.name || 'Untitled'}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Nodes</span>
            <span className="oa-props-value">{mesh.getNodeCount()}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Beams</span>
            <span className="oa-props-value">{mesh.getBeamCount()}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Plates</span>
            <span className="oa-props-value">{mesh.plateRegions.size}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Materials</span>
            <span className="oa-props-value">{mesh.materials.size}</span>
          </div>
        </div>
      </section>

      <section className="oa-props-section">
        <div className="oa-props-section-title">Hint</div>
        <div className="oa-props-section-body">
          <div className="oa-props-hint">
            Click a beam, node, or plate on the canvas to edit its properties here.
          </div>
        </div>
      </section>
    </div>
  );
}
