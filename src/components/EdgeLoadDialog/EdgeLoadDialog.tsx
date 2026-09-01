import { useState } from 'react';
import { Sheet } from '../openaec/Sheet';
import './EdgeLoadDialog.css';

interface EdgeLoadDialogProps {
  edge: 'top' | 'bottom' | 'left' | 'right' | number;
  loadCases: { id: number; name: string }[];
  activeLoadCase: number;
  /** polygon vertices (provided when the plate is a polygon plate) */
  polygon?: { x: number; y: number }[];
  onApply: (px: number, py: number, lcId: number, edge: 'top' | 'bottom' | 'left' | 'right' | number) => void;
  onCancel: () => void;
}

export function EdgeLoadDialog({
  edge,
  loadCases,
  activeLoadCase,
  polygon,
  onApply,
  onCancel,
}: EdgeLoadDialogProps) {
  const [selectedEdge, setSelectedEdge] = useState<'top' | 'bottom' | 'left' | 'right' | number>(edge);
  const [px, setPx] = useState('0');
  const [py, setPy] = useState('-10');
  const [selectedLC, setSelectedLC] = useState(activeLoadCase);

  const isPolygonMode = polygon && polygon.length >= 3;

  const handleApply = () => {
    const valPx = parseFloat(px);
    const valPy = parseFloat(py);
    if (isNaN(valPx) && isNaN(valPy)) return;
    onApply(isNaN(valPx) ? 0 : valPx, isNaN(valPy) ? 0 : valPy, selectedLC, selectedEdge);
  };

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply();
    if (e.key === 'Escape') onCancel();
  };

  /** Format a coordinate value for display */
  const fmtCoord = (v: number) => v.toFixed(2);

  return (
    <Sheet
      open
      onClose={onCancel}
      title="Edge Load"
      footer={
        <button className="edge-load-btn confirm" onClick={handleApply}>Add Edge Load</button>
      }
    >
      <div className="edge-load-dialog-body">
          <label>
            <span>Load Case</span>
            <select
              value={selectedLC}
              onChange={e => setSelectedLC(parseInt(e.target.value))}
            >
              {loadCases.map(lc => (
                <option key={lc.id} value={lc.id}>{lc.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Edge</span>
            <select
              value={typeof selectedEdge === 'number' ? selectedEdge.toString() : selectedEdge}
              onChange={e => {
                const v = e.target.value;
                if (v === 'top' || v === 'bottom' || v === 'left' || v === 'right') {
                  setSelectedEdge(v);
                } else {
                  setSelectedEdge(parseInt(v));
                }
              }}
            >
              {isPolygonMode
                ? polygon!.map((v, i) => {
                    const next = polygon![(i + 1) % polygon!.length];
                    return (
                      <option key={i} value={i}>
                        Edge {i} ({fmtCoord(v.x)},{fmtCoord(v.y)}) - ({fmtCoord(next.x)},{fmtCoord(next.y)})
                      </option>
                    );
                  })
                : <>
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </>
              }
            </select>
          </label>

          <div className="edge-load-row">
            <label>
              <span>px (kN/m)</span>
              <input
                type="text"
                value={px}
                onChange={e => setPx(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={keyHandler}
              />
            </label>
            <label>
              <span>pz (kN/m)</span>
              <input
                type="text"
                value={py}
                onChange={e => setPy(e.target.value)}
                autoFocus
                onFocus={e => e.target.select()}
                onKeyDown={keyHandler}
              />
            </label>
          </div>

          <p className="edge-load-hint">
            Negative pz = downward. Load is applied uniformly along the selected edge.
          </p>
        </div>
    </Sheet>
  );
}
