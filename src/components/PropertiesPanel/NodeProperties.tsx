/**
 * NodeProperties — OpenAEC-styled inline node editor.
 *
 * From-scratch fresh-JSX rewrite — inventory taken from the legacy
 * NodePropertiesDialog (Coordinates, Support Type, Spring stiffness),
 * rendered with only `.oa-props-*` primitives and `--theme-*` tokens.
 */
import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { INode } from '../../core/fem/types';
import './PropertiesPanel.css';

type SupportType =
  | 'none' | 'pinned' | 'rollerX' | 'rollerZ' | 'fixed'
  | 'springZ' | 'springX' | 'springRot';

function getSupportType(node: INode): SupportType {
  const { x, y, rotation, springX, springY, springRot } = node.constraints;
  if (springY != null && y) return 'springZ';
  if (springX != null && x) return 'springX';
  if (springRot != null && rotation) return 'springRot';
  if (x && y && rotation) return 'fixed';
  if (x && y) return 'pinned';
  if (y) return 'rollerZ';
  if (x) return 'rollerX';
  return 'none';
}

function getConstraints(type: SupportType, springVal: number) {
  switch (type) {
    case 'fixed':    return { x: true,  y: true,  rotation: true };
    case 'pinned':   return { x: true,  y: true,  rotation: false };
    case 'rollerZ':  return { x: false, y: true,  rotation: false };
    case 'rollerX':  return { x: true,  y: false, rotation: false };
    case 'springZ':  return { x: false, y: true,  rotation: false, springY: springVal };
    case 'springX':  return { x: true,  y: false, rotation: false, springX: springVal };
    case 'springRot':return { x: false, y: false, rotation: true,  springRot: springVal };
    default:         return { x: false, y: false, rotation: false };
  }
}

const isSpring = (t: SupportType) =>
  t === 'springZ' || t === 'springX' || t === 'springRot';
const springUnit = (t: SupportType) =>
  t === 'springRot' ? 'kNm/rad' : 'kN/m';

export interface NodePropertiesProps {
  nodeId: number;
}

export function NodeProperties({ nodeId }: NodePropertiesProps) {
  const { state, dispatch, pushUndo } = useFEM();
  const node = state.mesh.getNode(nodeId);

  const [xVal, setXVal] = useState(node ? (node.x * 1000).toFixed(0) : '0');
  const [zVal, setZVal] = useState(node ? (node.y * 1000).toFixed(0) : '0');
  const [supportType, setSupportType] = useState<SupportType>(node ? getSupportType(node) : 'none');
  const initSpring = node?.constraints.springY ?? node?.constraints.springX ?? node?.constraints.springRot ?? 1e5;
  const [springVal, setSpringVal] = useState(String(initSpring / 1000));

  useEffect(() => {
    if (!node) return;
    setXVal((node.x * 1000).toFixed(0));
    setZVal((node.y * 1000).toFixed(0));
    setSupportType(getSupportType(node));
  }, [nodeId, node]);

  if (!node) return <div className="properties-empty">Node not found.</div>;

  const apply = (overrides: { xMm?: string; zMm?: string; type?: SupportType; spring?: string }) => {
    pushUndo();
    const x = parseFloat(overrides.xMm ?? xVal) / 1000;
    const z = parseFloat(overrides.zMm ?? zVal) / 1000;
    const type = overrides.type ?? supportType;
    const spring = (parseFloat(overrides.spring ?? springVal) || 100) * 1000;
    if (!isNaN(x) && !isNaN(z)) {
      state.mesh.updateNode(node.id, { x, y: z, constraints: getConstraints(type, spring) });
      dispatch({ type: 'REFRESH_MESH' });
      dispatch({ type: 'SET_RESULT', payload: null });
    }
  };

  return (
    <div className="properties-panel">
      <section className="oa-props-section">
        <div className="oa-props-section-title">Coordinates</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row-2">
            <label className="oa-props-row">
              <span className="oa-props-label">X (mm)</span>
              <input
                className="oa-props-input"
                type="text"
                value={xVal}
                onChange={e => setXVal(e.target.value)}
                onBlur={() => apply({})}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </label>
            <label className="oa-props-row">
              <span className="oa-props-label">Z (mm)</span>
              <input
                className="oa-props-input"
                type="text"
                value={zVal}
                onChange={e => setZVal(e.target.value)}
                onBlur={() => apply({})}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="oa-props-section">
        <div className="oa-props-section-title">Support type</div>
        <div className="oa-props-section-body">
          <select
            className="oa-props-select"
            value={supportType}
            onChange={e => {
              const t = e.target.value as SupportType;
              setSupportType(t);
              apply({ type: t });
            }}
          >
            <option value="none">None (Free)</option>
            <option value="pinned">Pinned (X + Z)</option>
            <option value="rollerZ">Roller Z</option>
            <option value="rollerX">Roller X</option>
            <option value="fixed">Fixed (X + Z + Rotation)</option>
            <option value="springZ">Spring Z</option>
            <option value="springX">Spring X</option>
            <option value="springRot">Spring rotation</option>
          </select>
          {isSpring(supportType) && (
            <div className="oa-props-row">
              <span className="oa-props-label">k ({springUnit(supportType)})</span>
              <input
                className="oa-props-input"
                type="text"
                value={springVal}
                onChange={e => setSpringVal(e.target.value)}
                onBlur={() => apply({})}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          )}
        </div>
      </section>

      <section className="oa-props-section">
        <div className="oa-props-section-title">Loads at this node</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row-2">
            <label className="oa-props-row">
              <span className="oa-props-label">Fx (kN)</span>
              <input
                className="oa-props-input"
                type="number"
                value={((node.loads?.fx ?? 0) / 1000).toFixed(1)}
                onChange={e => {
                  const v = (parseFloat(e.target.value) || 0) * 1000;
                  pushUndo();
                  state.mesh.updateNode(node.id, { loads: { ...node.loads, fx: v } });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
            </label>
            <label className="oa-props-row">
              <span className="oa-props-label">Fy (kN)</span>
              <input
                className="oa-props-input"
                type="number"
                value={((node.loads?.fy ?? 0) / 1000).toFixed(1)}
                onChange={e => {
                  const v = (parseFloat(e.target.value) || 0) * 1000;
                  pushUndo();
                  state.mesh.updateNode(node.id, { loads: { ...node.loads, fy: v } });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
            </label>
          </div>
          <label className="oa-props-row">
            <span className="oa-props-label">M (kNm)</span>
            <input
              className="oa-props-input"
              type="number"
              value={((node.loads?.moment ?? 0) / 1000).toFixed(1)}
              onChange={e => {
                const v = (parseFloat(e.target.value) || 0) * 1000;
                pushUndo();
                state.mesh.updateNode(node.id, { loads: { ...node.loads, moment: v } });
                dispatch({ type: 'REFRESH_MESH' });
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

export default NodeProperties;
