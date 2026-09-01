import { useMemo } from 'react';
import { INode } from '../../core/fem/types';
import { InlinePopover } from '../openaec/InlinePopover';
import './DimensionEditDialog.css';

interface DimensionEditDialogProps {
  beamId: number;
  node1: INode;
  node2: INode;
  currentLength: number;  // in meters
  /** Which node will be moved (the "end" node) */
  movingNodeId: number;
  /** Optional anchor rect for the popover (e.g. clicked dimension label). */
  anchorRect?: DOMRect | null;
  onApply: (newLengthMeters: number) => void;
  onClose: () => void;
}

export function DimensionEditDialog({
  beamId,
  currentLength,
  anchorRect,
  onApply,
  onClose,
}: DimensionEditDialogProps) {
  // Fallback to screen-center anchor if none provided
  const effectiveAnchor = useMemo<DOMRect | null>(() => {
    if (anchorRect) return anchorRect;
    if (typeof window === 'undefined') return null;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2 - 40;
    return new DOMRect(cx - 80, cy, 160, 24);
  }, [anchorRect]);

  return (
    <InlinePopover
      open
      anchorRect={effectiveAnchor}
      value={(currentLength * 1000).toFixed(0)}
      placeholder="mm"
      label={<span style={{ fontSize: 11, color: 'var(--theme-fg-muted)' }}>Beam {beamId} length (mm)</span>}
      onCommit={(v) => {
        const valMm = parseFloat(v);
        if (isNaN(valMm) || valMm <= 0) { onClose(); return; }
        onApply(valMm / 1000);
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
