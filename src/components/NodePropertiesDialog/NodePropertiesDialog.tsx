import { useState } from 'react';
import { INode } from '../../core/fem/types';
import './NodePropertiesDialog.css';

type SupportType = 'none' | 'pinned' | 'rollerX' | 'rollerZ' | 'fixed' | 'springZ' | 'springX' | 'springRot';

export interface NodeUpdatePayload {
  x?: number;
  y?: number;
  constraints?: {
    x: boolean;
    y: boolean;
    rotation: boolean;
    springX?: number;
    springY?: number;
    springRot?: number;
  };
}

interface NodePropertiesDialogProps {
  node: INode;
  onUpdate: (updates: NodeUpdatePayload) => void;
  onClose: () => void;
}

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
    case 'fixed': return { x: true, y: true, rotation: true };
    case 'pinned': return { x: true, y: true, rotation: false };
    case 'rollerZ': return { x: false, y: true, rotation: false };
    case 'rollerX': return { x: true, y: false, rotation: false };
    case 'springZ': return { x: false, y: true, rotation: false, springY: springVal };
    case 'springX': return { x: true, y: false, rotation: false, springX: springVal };
    case 'springRot': return { x: false, y: false, rotation: true, springRot: springVal };
    default: return { x: false, y: false, rotation: false };
  }
}

function isSpringType(type: SupportType): boolean {
  return type === 'springZ' || type === 'springX' || type === 'springRot';
}

function getSpringUnit(type: SupportType): string {
  if (type === 'springRot') return 'kNm/rad';
  return 'kN/m';
}

export function NodePropertiesDialog({ node, onUpdate, onClose }: NodePropertiesDialogProps) {
  const [xVal, setXVal] = useState((node.x * 1000).toFixed(0));
  const [zVal, setZVal] = useState((node.y * 1000).toFixed(0));
  const [supportType, setSupportType] = useState<SupportType>(getSupportType(node));

  // Get initial spring value from the node (convert N/m to kN/m for display)
  const initSpring = node.constraints.springY ?? node.constraints.springX ?? node.constraints.springRot ?? 1e5;
  const [springVal, setSpringVal] = useState(String(initSpring / 1000));

  const handleApply = () => {
    const x = parseFloat(xVal) / 1000;
    const z = parseFloat(zVal) / 1000;
    if (isNaN(x) || isNaN(z)) return;

    // Convert kN/m to N/m for storage
    const springStiffness = (parseFloat(springVal) || 100) * 1000;

    onUpdate({
      x,
      y: z,
      constraints: getConstraints(supportType, springStiffness)
    });
    onClose();
  };

  return (
    <div className="node-props-overlay" onClick={onClose}>
      <div className="node-props-dialog" onClick={e => e.stopPropagation()}>
        <div className="node-props-header">Node {node.id}</div>
        <div className="node-props-body">
          <div className="node-props-section-title">Coordinates</div>
          <label className="node-props-input-row">
            <span>X (mm)</span>
            <input
              type="text"
              value={xVal}
              onChange={e => setXVal(e.target.value)}
              autoFocus
              onFocus={e => e.target.select()}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
            />
          </label>
          <label className="node-props-input-row">
            <span>Z (mm)</span>
            <input
              type="text"
              value={zVal}
              onChange={e => setZVal(e.target.value)}
              onFocus={e => e.target.select()}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
            />
          </label>

          <div className="node-props-section-title">Support Type</div>
          <select
            className="node-props-select"
            value={supportType}
            onChange={e => setSupportType(e.target.value as SupportType)}
          >
            <option value="none">None (Free)</option>
            <option value="pinned">Pinned (X + Z)</option>
            <option value="rollerZ">Roller Z</option>
            <option value="rollerX">Roller X</option>
            <option value="fixed">Fixed (X + Z + Rotation)</option>
            <option value="springZ">Spring Z</option>
            <option value="springX">Spring X</option>
            <option value="springRot">Spring Rotation</option>
          </select>

          {isSpringType(supportType) && (
            <label className="node-props-input-row">
              <span>k ({getSpringUnit(supportType)})</span>
              <input
                type="text"
                value={springVal}
                onChange={e => setSpringVal(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
              />
            </label>
          )}
        </div>
        <div className="node-props-footer">
          <button className="node-props-btn cancel" onClick={onClose}>Cancel</button>
          <button className="node-props-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
    </div>
  );
}
