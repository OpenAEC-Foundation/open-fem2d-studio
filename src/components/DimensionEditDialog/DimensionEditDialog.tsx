import { useState, useRef, useEffect } from 'react';
import { INode } from '../../core/fem/types';
import './DimensionEditDialog.css';

interface DimensionEditDialogProps {
  beamId: number;
  node1: INode;
  node2: INode;
  currentLength: number;  // in meters
  /** Which node will be moved (the "end" node) */
  movingNodeId: number;
  onApply: (newLengthMeters: number) => void;
  onClose: () => void;
}

export function DimensionEditDialog({
  beamId,
  node1,
  node2,
  currentLength,
  movingNodeId,
  onApply,
  onClose,
}: DimensionEditDialogProps) {
  const [value, setValue] = useState((currentLength * 1000).toFixed(0));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select the input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleApply = () => {
    const valMm = parseFloat(value);
    if (isNaN(valMm) || valMm <= 0) return;
    onApply(valMm / 1000);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const fixedNode = movingNodeId === node2.id ? node1 : node2;
  const movingNode = movingNodeId === node2.id ? node2 : node1;

  return (
    <div className="dim-edit-overlay" onClick={onClose}>
      <div className="dim-edit-dialog" onClick={e => e.stopPropagation()}>
        <div className="dim-edit-header">Edit Dimension - Beam {beamId}</div>
        <div className="dim-edit-body">
          <div className="dim-edit-info">
            Node {node1.id} (<span>{(node1.x * 1000).toFixed(0)}</span>, <span>{(node1.y * 1000).toFixed(0)}</span>)
            {' '}&rarr;{' '}
            Node {node2.id} (<span>{(node2.x * 1000).toFixed(0)}</span>, <span>{(node2.y * 1000).toFixed(0)}</span>)
          </div>

          <div className="dim-edit-input-row">
            <label>New length</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="dim-edit-unit">mm</span>
          </div>

          <div className="dim-edit-node-info">
            Fixed node: <strong>Node {fixedNode.id}</strong>
            {(fixedNode.constraints.x || fixedNode.constraints.y) && ' (constrained)'}
            <br />
            <span className="dim-edit-move-indicator">Moving node: Node {movingNode.id}</span>
            {' '}&mdash; will be repositioned along beam direction
          </div>
        </div>
        <div className="dim-edit-footer">
          <button className="dim-edit-btn cancel" onClick={onClose}>Cancel</button>
          <button className="dim-edit-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
    </div>
  );
}
