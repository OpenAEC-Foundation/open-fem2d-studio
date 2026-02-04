import { useState, useMemo } from 'react';
import './PlateDialog.css';

interface PlateDialogProps {
  polygonVertices: {x: number, y: number}[];
  polygonVoids?: {x: number, y: number}[][];
  materials: { id: number; name: string }[];
  onConfirm: (config: {
    divisionsX: number;
    divisionsY: number;
    thickness: number;
    materialId: number;
    elementType: 'quad';
    meshSize: number;
  }) => void;
  onCancel: () => void;
}

/** Compute polygon area using shoelace formula */
function computePolygonArea(vertices: {x: number, y: number}[]): number {
  let area = 0;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    area += vertices[j].x * vertices[i].y - vertices[i].x * vertices[j].y;
  }
  return Math.abs(area * 0.5);
}

export function PlateDialog({
  polygonVertices,
  polygonVoids,
  materials,
  onConfirm,
  onCancel,
}: PlateDialogProps) {
  const [thickness, setThickness] = useState('200');
  const [materialId, setMaterialId] = useState(materials.length > 0 ? materials[0].id : 1);

  // Compute polygon area
  const polyArea = useMemo(() => {
    if (polygonVertices && polygonVertices.length >= 3) {
      return computePolygonArea(polygonVertices);
    }
    return 0;
  }, [polygonVertices]);

  // Default mesh size: sqrt(area / 100) gives element edge length
  const defaultMeshSize = polyArea > 0 ? Math.sqrt(polyArea / 100) : 0.1;

  const [meshSize, setMeshSize] = useState(() => defaultMeshSize.toPrecision(3));

  const handleConfirm = () => {
    const t = parseFloat(thickness);
    if (isNaN(t) || t <= 0) return;

    const ms = parseFloat(meshSize);
    if (isNaN(ms) || ms <= 0) return;

    onConfirm({
      divisionsX: 0,
      divisionsY: 0,
      thickness: t / 1000,
      materialId,
      elementType: 'quad',
      meshSize: ms,
    });
  };

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  // Estimate element count
  const estimatedElements = useMemo(() => {
    const ms = parseFloat(meshSize);
    if (isNaN(ms) || ms <= 0 || polyArea <= 0) return 0;
    // Subtract void areas
    let voidArea = 0;
    if (polygonVoids) {
      for (const v of polygonVoids) {
        voidArea += computePolygonArea(v);
      }
    }
    const netArea = Math.max(0, polyArea - voidArea);
    const elemArea = ms * ms;
    return Math.round(netArea / elemArea);
  }, [meshSize, polyArea, polygonVoids]);

  return (
    <div className="plate-dialog-overlay" onClick={onCancel}>
      <div className="plate-dialog" onClick={e => e.stopPropagation()}>
        <div className="plate-dialog-header">Plate Element</div>
        <div className="plate-dialog-body">
          <div className="plate-dialog-polygon-info">
            <p className="plate-dialog-hint">
              Polygon outline: {polygonVertices.length} vertices, area {(polyArea * 1e6).toFixed(0)} mm² ({polyArea.toFixed(4)} m²)
            </p>
            {polygonVoids && polygonVoids.length > 0 && (
              <p className="plate-dialog-hint plate-dialog-void-info">
                Voids: {polygonVoids.length} opening(s) ({polygonVoids.map(v => `${v.length} pts`).join(', ')})
              </p>
            )}
          </div>

          <div className="plate-dialog-row">
            <label>
              <span>Mesh size (m)</span>
              <input
                type="text"
                value={meshSize}
                onChange={e => setMeshSize(e.target.value)}
                autoFocus
                onFocus={e => e.target.select()}
                onKeyDown={keyHandler}
              />
            </label>
          </div>

          <label>
            <span>Thickness (mm)</span>
            <input
              type="text"
              value={thickness}
              onChange={e => setThickness(e.target.value)}
              onFocus={e => e.target.select()}
              onKeyDown={keyHandler}
            />
          </label>

          <label>
            <span>Material</span>
            <select
              value={materialId}
              onChange={e => setMaterialId(parseInt(e.target.value))}
            >
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          <p className="plate-dialog-hint">
            Estimated ~{estimatedElements} elements (boundary-conforming mixed quad/tri mesh, size {parseFloat(meshSize || '0').toPrecision(3)} m).
            {' '}Use "Plane Stress" for membrane or "Plate Bending (DKT)" for bending analysis.
          </p>
        </div>
        <div className="plate-dialog-footer">
          <button className="plate-dialog-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="plate-dialog-btn confirm" onClick={handleConfirm}>OK</button>
        </div>
      </div>
    </div>
  );
}
