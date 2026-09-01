import { useState } from 'react';
import { Sheet } from '../openaec/Sheet';
import './ThermalLoadDialog.css';

interface ThermalLoadDialogProps {
  elementIds: number[];
  plateId?: number;
  onConfirm: (deltaT: number) => void;
  onCancel: () => void;
}

export function ThermalLoadDialog({
  elementIds,
  plateId,
  onConfirm,
  onCancel,
}: ThermalLoadDialogProps) {
  const [deltaT, setDeltaT] = useState('50');

  const handleConfirm = () => {
    const val = parseFloat(deltaT);
    if (isNaN(val)) return;
    onConfirm(val);
  };

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <Sheet
      open
      onClose={onCancel}
      title="Thermal Load"
      footer={
        <button className="thermal-dialog-btn confirm" onClick={handleConfirm}>Apply</button>
      }
    >
      <div className="thermal-dialog-body">
        <p className="thermal-dialog-hint">
          {plateId
            ? `Plate ${plateId} (${elementIds.length} elements)`
            : `${elementIds.length} element(s)`}
        </p>
        <label>
          <span>ΔT (°C)</span>
          <input
            type="number"
            value={deltaT}
            onChange={e => setDeltaT(e.target.value)}
            autoFocus
            onFocus={e => e.target.select()}
            onKeyDown={keyHandler}
          />
        </label>
        <p className="thermal-dialog-hint">
          Positive ΔT = heating (expansion). Applied to active load case.
        </p>
      </div>
    </Sheet>
  );
}
