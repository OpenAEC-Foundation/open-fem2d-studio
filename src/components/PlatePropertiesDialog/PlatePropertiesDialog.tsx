import { useState } from 'react';
import { IPlateRegion, IMaterial } from '../../core/fem/types';
import { polygonArea } from '../../core/fem/PlateRegion';
import './PlatePropertiesDialog.css';

interface PlatePropertiesDialogProps {
  plate: IPlateRegion;
  materials: IMaterial[];
  onUpdate: (updates: { thickness?: number; materialId?: number; meshSize?: number }) => void;
  onClose: () => void;
  onAddVoid?: () => void;
}

export function PlatePropertiesDialog({ plate, materials, onUpdate, onClose, onAddVoid }: PlatePropertiesDialogProps) {
  const [thickness, setThickness] = useState((plate.thickness * 1000).toFixed(0));
  const [materialId, setMaterialId] = useState(plate.materialId);

  // Mesh size: for polygon plates use plate.meshSize, for rectangular use width/divisionsX
  const currentMeshSize = plate.isPolygon
    ? (plate.meshSize ?? 0.5)
    : (plate.divisionsX > 0 ? plate.width / plate.divisionsX : 0.5);
  const [meshSize, setMeshSize] = useState((currentMeshSize * 1000).toFixed(0));

  const material = materials.find(m => m.id === materialId);

  const area = plate.isPolygon && plate.polygon
    ? polygonArea(plate.polygon)
    : plate.width * plate.height;

  const numElements = plate.elementIds.length;
  const numNodes = plate.nodeIds.length;

  const handleApply = () => {
    const t = parseFloat(thickness) / 1000;
    if (isNaN(t) || t <= 0) return;
    const ms = parseFloat(meshSize) / 1000;
    const meshSizeChanged = !isNaN(ms) && ms > 0 && Math.abs(ms - currentMeshSize) > 1e-6;
    onUpdate({ thickness: t, materialId, meshSize: meshSizeChanged ? ms : undefined });
    onClose();
  };

  return (
    <div className="plate-props-overlay" onClick={onClose}>
      <div className="plate-props-dialog" onClick={e => e.stopPropagation()}>
        <div className="plate-props-header">Plate {plate.id}</div>
        <div className="plate-props-body">
          <div className="plate-props-section-title">Geometry</div>
          <div className="plate-props-row">
            <span className="plate-props-label">Type</span>
            <span className="plate-props-value">{plate.isPolygon ? 'Polygon' : 'Rectangular'}</span>
          </div>
          <div className="plate-props-row">
            <span className="plate-props-label">Area</span>
            <span className="plate-props-value">{area.toFixed(3)} m²</span>
          </div>
          {!plate.isPolygon && (
            <>
              <div className="plate-props-row">
                <span className="plate-props-label">Width</span>
                <span className="plate-props-value">{plate.width.toFixed(3)} m</span>
              </div>
              <div className="plate-props-row">
                <span className="plate-props-label">Height</span>
                <span className="plate-props-value">{plate.height.toFixed(3)} m</span>
              </div>
            </>
          )}
          {plate.isPolygon && plate.polygon && (
            <div className="plate-props-row">
              <span className="plate-props-label">Vertices</span>
              <span className="plate-props-value">{plate.polygon.length}</span>
            </div>
          )}
          {plate.isPolygon && (
            <div className="plate-props-row">
              <span className="plate-props-label">Voids</span>
              <span className="plate-props-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {plate.voids?.length ?? 0}
                {onAddVoid && (
                  <button
                    className="plate-props-add-void-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onAddVoid();
                    }}
                    title="Add void opening"
                  >+</button>
                )}
              </span>
            </div>
          )}

          <div className="plate-props-section-title">Mesh</div>
          <div className="plate-props-row">
            <span className="plate-props-label">Elements</span>
            <span className="plate-props-value">{numElements} {plate.elementType ?? 'triangle'}</span>
          </div>
          <div className="plate-props-row">
            <span className="plate-props-label">Nodes</span>
            <span className="plate-props-value">{numNodes}</span>
          </div>
          {!plate.isPolygon && (
            <div className="plate-props-row">
              <span className="plate-props-label">Divisions</span>
              <span className="plate-props-value">{plate.divisionsX} × {plate.divisionsY}</span>
            </div>
          )}

          <label className="plate-props-input-row">
            <span>Mesh Size (mm)</span>
            <input
              type="text"
              value={meshSize}
              onChange={e => setMeshSize(e.target.value)}
              onFocus={e => e.target.select()}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
            />
          </label>

          <div className="plate-props-section-title">Properties</div>
          <label className="plate-props-input-row">
            <span>Thickness (mm)</span>
            <input
              type="text"
              value={thickness}
              onChange={e => setThickness(e.target.value)}
              autoFocus
              onFocus={e => e.target.select()}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
            />
          </label>
          <label className="plate-props-input-row">
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

          {material && (
            <>
              <div className="plate-props-row">
                <span className="plate-props-label">E</span>
                <span className="plate-props-value">{(material.E / 1e9).toFixed(1)} GPa</span>
              </div>
              <div className="plate-props-row">
                <span className="plate-props-label">&nu;</span>
                <span className="plate-props-value">{material.nu.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
        <div className="plate-props-footer">
          <button className="plate-props-btn cancel" onClick={onClose}>Cancel</button>
          <button className="plate-props-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
    </div>
  );
}
