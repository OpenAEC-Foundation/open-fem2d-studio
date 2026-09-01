/**
 * PlateProperties — OpenAEC-styled inline plate editor.
 *
 * From-scratch fresh-JSX rewrite. Inventory taken from the legacy
 * PlatePropertiesDialog: Geometry, Mesh, Properties (thickness + material).
 * The "Add Void" button stays as an `.oa-props-btn` next to the void count.
 */
import { useState, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import { polygonArea } from '../../core/fem/PlateRegion';
import './PropertiesPanel.css';

export interface PlatePropertiesProps {
  plateId: number;
  onAddVoid?: (plateId: number) => void;
}

export function PlateProperties({ plateId, onAddVoid }: PlatePropertiesProps) {
  const { state, dispatch, pushUndo } = useFEM();
  const { mesh } = state;
  const plate = mesh.plateRegions.get(plateId);

  const currentMeshSize = plate
    ? (plate.isPolygon
        ? (plate.meshSize ?? 0.5)
        : (plate.divisionsX > 0 ? plate.width / plate.divisionsX : 0.5))
    : 0.5;

  const [thickness, setThickness] = useState(plate ? (plate.thickness * 1000).toFixed(0) : '0');
  const [materialId, setMaterialId] = useState(plate ? plate.materialId : 1);
  const [meshSize, setMeshSize] = useState((currentMeshSize * 1000).toFixed(0));

  useEffect(() => {
    if (!plate) return;
    setThickness((plate.thickness * 1000).toFixed(0));
    setMaterialId(plate.materialId);
    const ms = plate.isPolygon
      ? (plate.meshSize ?? 0.5)
      : (plate.divisionsX > 0 ? plate.width / plate.divisionsX : 0.5);
    setMeshSize((ms * 1000).toFixed(0));
  }, [plateId, plate]);

  if (!plate) return <div className="properties-empty">Plate not found.</div>;

  const materials = Array.from(mesh.materials.values());
  const material = materials.find(m => m.id === materialId);
  const area = plate.isPolygon && plate.polygon
    ? polygonArea(plate.polygon)
    : plate.width * plate.height;

  const commitThickness = () => {
    const t = parseFloat(thickness) / 1000;
    if (isNaN(t) || t <= 0) return;
    pushUndo();
    plate.thickness = t;
    for (const eid of plate.elementIds) {
      const el = mesh.elements.get(eid);
      if (el) el.thickness = t;
    }
    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  };

  const commitMaterial = (mid: number) => {
    pushUndo();
    plate.materialId = mid;
    for (const eid of plate.elementIds) {
      const el = mesh.elements.get(eid);
      if (el) el.materialId = mid;
    }
    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  };

  const commitMeshSize = () => {
    const ms = parseFloat(meshSize) / 1000;
    if (!isNaN(ms) && ms > 0 && Math.abs(ms - currentMeshSize) > 1e-6 && plate.isPolygon) {
      pushUndo();
      plate.meshSize = ms;
      dispatch({ type: 'REFRESH_MESH' });
      dispatch({ type: 'SET_RESULT', payload: null });
    }
  };

  return (
    <div className="properties-panel">
      <section className="oa-props-section">
        <div className="oa-props-section-title">Geometry</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row">
            <span className="oa-props-label">Type</span>
            <span className="oa-props-value">{plate.isPolygon ? 'Polygon' : 'Rectangular'}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Area</span>
            <span className="oa-props-value">{area.toFixed(3)} m²</span>
          </div>
          {!plate.isPolygon && (
            <>
              <div className="oa-props-row">
                <span className="oa-props-label">Width</span>
                <span className="oa-props-value">{plate.width.toFixed(3)} m</span>
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">Height</span>
                <span className="oa-props-value">{plate.height.toFixed(3)} m</span>
              </div>
            </>
          )}
          {plate.isPolygon && plate.polygon && (
            <div className="oa-props-row">
              <span className="oa-props-label">Vertices</span>
              <span className="oa-props-value">{plate.polygon.length}</span>
            </div>
          )}
          {plate.isPolygon && (
            <div className="oa-props-row">
              <span className="oa-props-label">Voids</span>
              <span className="oa-props-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {plate.voids?.length ?? 0}
                {onAddVoid && (
                  <button
                    className="oa-props-btn"
                    onClick={() => onAddVoid(plateId)}
                    title="Add void opening"
                  >+ Add void</button>
                )}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="oa-props-section">
        <div className="oa-props-section-title">Mesh</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row">
            <span className="oa-props-label">Elements</span>
            <span className="oa-props-value">{plate.elementIds.length} {plate.elementType ?? 'triangle'}</span>
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Nodes</span>
            <span className="oa-props-value">{plate.nodeIds.length}</span>
          </div>
          {!plate.isPolygon && (
            <div className="oa-props-row">
              <span className="oa-props-label">Divisions</span>
              <span className="oa-props-value">{plate.divisionsX} × {plate.divisionsY}</span>
            </div>
          )}
          <div className="oa-props-row">
            <span className="oa-props-label">Size (mm)</span>
            <input
              className="oa-props-input"
              type="text"
              value={meshSize}
              onChange={e => setMeshSize(e.target.value)}
              onBlur={commitMeshSize}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        </div>
      </section>

      <section className="oa-props-section">
        <div className="oa-props-section-title">Properties</div>
        <div className="oa-props-section-body">
          <div className="oa-props-row">
            <span className="oa-props-label">Thickness (mm)</span>
            <input
              className="oa-props-input"
              type="text"
              value={thickness}
              onChange={e => setThickness(e.target.value)}
              onBlur={commitThickness}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="oa-props-row">
            <span className="oa-props-label">Material</span>
            <select
              className="oa-props-select"
              value={materialId}
              onChange={e => {
                const mid = parseInt(e.target.value);
                setMaterialId(mid);
                commitMaterial(mid);
              }}
            >
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {material && (
            <div className="oa-props-facts">
              <p><strong>E</strong><span>{(material.E / 1e9).toFixed(1)} GPa</span></p>
              <p><strong>ν</strong><span>{material.nu.toFixed(2)}</span></p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default PlateProperties;
