import { useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { formatModulus } from '../../core/fem/Material';
import { formatStress, formatDisplacement, formatMomentPerLength, generateColorScale } from '../../utils/colors';
import { formatForce, formatMoment } from '../../core/fem/BeamForces';
import { convertArea, convertMomentOfInertia, convertSectionModulus } from '../../utils/units';
import { DEFAULT_SECTIONS } from '../../core/fem/Beam';
import { buildNodeIdToIndex } from '../../core/solver/Assembler';
import { IDistributedLoad } from '../../core/fem/LoadCase';
import './PropertiesPanel.css';

// Inline sub-component: editable properties for a selected distributed load
function DistLoadProperties({
  load,
  lcId,
  dispatch,
  pushUndo
}: {
  load: IDistributedLoad;
  lcId: number;
  dispatch: (action: any) => void;
  pushUndo: () => void;
}) {
  // Local editing state, initialised from the load
  const [qz1, setQz1] = useState(() => ((load.qy || 0) / 1000).toFixed(2));
  const [qz2, setQz2] = useState(() => (((load.qyEnd ?? load.qy) || 0) / 1000).toFixed(2));
  const [startT, setStartT] = useState(() => (load.startT ?? 0).toFixed(3));
  const [endT, setEndT] = useState(() => (load.endT ?? 1).toFixed(3));
  const [coordSystem, setCoordSystem] = useState<'local' | 'global'>(load.coordSystem ?? 'local');
  const [description, setDescription] = useState(load.description ?? '');

  // Re-sync local state when the load identity changes
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

  const dispatchUpdate = (overrides: Partial<{
    qy: number; qyEnd: number; qx: number; qxEnd: number;
    startT: number; endT: number; coordSystem: 'local' | 'global'; description: string;
  }>) => {
    if (load.id == null) return;
    pushUndo();

    const qyVal = overrides.qy ?? (parseFloat(qz1) || 0) * 1000;
    const qyEndVal = overrides.qyEnd ?? (parseFloat(qz2) || 0) * 1000;
    const startTVal = overrides.startT ?? (parseFloat(startT) || 0);
    const endTVal = overrides.endT ?? (parseFloat(endT) || 1);
    const cs = overrides.coordSystem ?? coordSystem;
    const desc = overrides.description ?? description;

    dispatch({
      type: 'UPDATE_DISTRIBUTED_LOAD',
      payload: {
        lcId,
        loadId: load.id,
        qx: load.qx,
        qy: qyVal,
        qxEnd: load.qxEnd,
        qyEnd: qyEndVal,
        startT: startTVal,
        endT: endTVal,
        coordSystem: cs,
        description: desc || undefined
      }
    });
  };

  const commitQz1 = () => {
    const val = parseFloat(qz1);
    if (isNaN(val)) return;
    dispatchUpdate({ qy: val * 1000 });
  };

  const commitQz2 = () => {
    const val = parseFloat(qz2);
    if (isNaN(val)) return;
    dispatchUpdate({ qyEnd: val * 1000 });
  };

  const commitStartT = () => {
    const val = parseFloat(startT);
    if (isNaN(val)) return;
    dispatchUpdate({ startT: Math.max(0, Math.min(1, val)) });
  };

  const commitEndT = () => {
    const val = parseFloat(endT);
    if (isNaN(val)) return;
    dispatchUpdate({ endT: Math.max(0, Math.min(1, val)) });
  };

  const commitCoordSystem = (cs: 'local' | 'global') => {
    setCoordSystem(cs);
    dispatchUpdate({ coordSystem: cs });
  };

  const commitDescription = () => {
    dispatchUpdate({ description });
  };

  const keyHandler = (e: React.KeyboardEvent, commitFn: () => void) => {
    if (e.key === 'Enter') commitFn();
  };

  return (
    <div className="panel-section">
      <h3>Distributed Load #{load.id}</h3>
      <div className="form-group">
        <label>Beam #{load.elementId}</label>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>q{'\u2081'} (kN/m)</label>
          <input
            type="number"
            step="0.1"
            value={qz1}
            onChange={(e) => setQz1(e.target.value)}
            onBlur={commitQz1}
            onKeyDown={(e) => keyHandler(e, commitQz1)}
          />
        </div>
        <div className="form-group">
          <label>q{'\u2082'} (kN/m)</label>
          <input
            type="number"
            step="0.1"
            value={qz2}
            onChange={(e) => setQz2(e.target.value)}
            onBlur={commitQz2}
            onKeyDown={(e) => keyHandler(e, commitQz2)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Start (0-1)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={startT}
            onChange={(e) => setStartT(e.target.value)}
            onBlur={commitStartT}
            onKeyDown={(e) => keyHandler(e, commitStartT)}
          />
        </div>
        <div className="form-group">
          <label>End (0-1)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={endT}
            onChange={(e) => setEndT(e.target.value)}
            onBlur={commitEndT}
            onKeyDown={(e) => keyHandler(e, commitEndT)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Direction</label>
        <select
          value={coordSystem}
          onChange={(e) => commitCoordSystem(e.target.value as 'local' | 'global')}
        >
          <option value="local">Perpendicular to beam</option>
          <option value="global">Global Z-axis</option>
        </select>
      </div>
      <div className="form-group">
        <label>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          onKeyDown={(e) => keyHandler(e, commitDescription)}
          placeholder="e.g. Self-weight, Wind load..."
        />
      </div>
    </div>
  );
}

// This component is now largely replaced by ProjectBrowser and VisibilityPanel
// but kept for backward compatibility

export function PropertiesPanel() {
  const { state, dispatch, pushUndo } = useFEM();
  const {
    mesh,
    result,
    selection,
    analysisType,
    showDeformed,
    deformationScale,
    showStress,
    stressType,
    gridSize,
    snapToGrid,
    diagramScale,
    loadCases,
    stressUnit,
    plateBendingMomentUnit,
    areaUnit,
    momentOfInertiaUnit,
    sectionModulusUnit
  } = state;

  const selectedNodeId = selection.nodeIds.size === 1 ? Array.from(selection.nodeIds)[0] : null;
  const selectedElementId = selection.elementIds.size === 1 ? Array.from(selection.elementIds)[0] : null;

  const selectedNode = selectedNodeId ? mesh.getNode(selectedNodeId) : null;
  const selectedElement = selectedElementId ? mesh.getElement(selectedElementId) : null;
  const selectedBeam = selectedElementId ? mesh.getBeamElement(selectedElementId) : null;

  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);

  const dofsPerNode = analysisType === 'frame' ? 3 : analysisType === 'plate_bending' ? 3 : 2;

  // Find selected distributed load (from selectedDistLoadIds)
  const selectedDistLoadId = selection.selectedDistLoadIds.size === 1
    ? Array.from(selection.selectedDistLoadIds)[0]
    : null;

  // Look up the load data across all load cases
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

  return (
    <div className="properties-panel">
      <div className="panel-section">
        <h3>Settings</h3>
        <div className="form-group">
          <label>Grid (m)</label>
          <input
            type="number"
            value={gridSize}
            step="0.5"
            min="0.1"
            onChange={(e) => dispatch({ type: 'SET_GRID_SIZE', payload: parseFloat(e.target.value) || 0.5 })}
          />
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID', payload: e.target.checked })}
          />
          <label>Snap to Grid</label>
        </div>
      </div>

      {selectedNode && (
        <div className="panel-section">
          <h3>Node #{selectedNode.id}</h3>
          <div className="form-row">
            <div className="form-group">
              <label>X: {selectedNode.x.toFixed(3)} m</label>
              <input
                type="number"
                value={parseFloat(selectedNode.x.toFixed(3))}
                step="0.001"
                min="-1000"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    mesh.updateNode(selectedNode.id, { x: Math.round(val * 1000) / 1000 });
                    dispatch({ type: 'REFRESH_MESH' });
                  }
                }}
              />
            </div>
            <div className="form-group">
              <label>Y: {selectedNode.y.toFixed(3)} m</label>
              <input
                type="number"
                value={parseFloat(selectedNode.y.toFixed(3))}
                step="0.001"
                min="-1000"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    mesh.updateNode(selectedNode.id, { y: Math.round(val * 1000) / 1000 });
                    dispatch({ type: 'REFRESH_MESH' });
                  }
                }}
              />
            </div>
          </div>

          <h4>Support</h4>
          <div className="constraint-grid">
            <div className="checkbox-group">
              <input
                type="checkbox"
                checked={selectedNode.constraints.x}
                onChange={(e) => {
                  mesh.updateNode(selectedNode.id, {
                    constraints: { ...selectedNode.constraints, x: e.target.checked }
                  });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
              <label>X</label>
            </div>
            <div className="checkbox-group">
              <input
                type="checkbox"
                checked={selectedNode.constraints.y}
                onChange={(e) => {
                  mesh.updateNode(selectedNode.id, {
                    constraints: { ...selectedNode.constraints, y: e.target.checked }
                  });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
              <label>Y</label>
            </div>
            {analysisType === 'frame' && (
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  checked={selectedNode.constraints.rotation}
                  onChange={(e) => {
                    mesh.updateNode(selectedNode.id, {
                      constraints: { ...selectedNode.constraints, rotation: e.target.checked }
                    });
                    dispatch({ type: 'REFRESH_MESH' });
                  }}
                />
                <label>Rotation</label>
              </div>
            )}
          </div>

          <h4>Loads</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Fx (kN)</label>
              <input
                type="number"
                value={(selectedNode.loads.fx / 1000).toFixed(1)}
                step="1"
                onChange={(e) => {
                  mesh.updateNode(selectedNode.id, {
                    loads: { ...selectedNode.loads, fx: (parseFloat(e.target.value) || 0) * 1000 }
                  });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
            </div>
            <div className="form-group">
              <label>Fy (kN)</label>
              <input
                type="number"
                value={(selectedNode.loads.fy / 1000).toFixed(1)}
                step="1"
                onChange={(e) => {
                  mesh.updateNode(selectedNode.id, {
                    loads: { ...selectedNode.loads, fy: (parseFloat(e.target.value) || 0) * 1000 }
                  });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
            </div>
          </div>
          {analysisType === 'frame' && (
            <div className="form-group">
              <label>Moment (kNm)</label>
              <input
                type="number"
                value={(selectedNode.loads.moment / 1000).toFixed(1)}
                step="1"
                onChange={(e) => {
                  mesh.updateNode(selectedNode.id, {
                    loads: { ...selectedNode.loads, moment: (parseFloat(e.target.value) || 0) * 1000 }
                  });
                  dispatch({ type: 'REFRESH_MESH' });
                }}
              />
            </div>
          )}

          {result && (
            <div className="result-info">
              <h4>Results</h4>
              <p>
                <strong>u:</strong> {formatDisplacement(result.displacements[nodeIdToIndex.get(selectedNode.id)! * dofsPerNode] || 0)}
              </p>
              <p>
                <strong>v:</strong> {formatDisplacement(result.displacements[nodeIdToIndex.get(selectedNode.id)! * dofsPerNode + 1] || 0)}
              </p>
              {analysisType === 'frame' && (
                <p>
                  <strong>rot:</strong> {((result.displacements[nodeIdToIndex.get(selectedNode.id)! * dofsPerNode + 2] || 0) * 1000).toFixed(3)} mrad
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {selectedBeam && (
        <div className="panel-section">
          <h3>Beam #{selectedBeam.id}</h3>
          <div className="form-group">
            <label>Material</label>
            <select
              value={selectedBeam.materialId}
              onChange={(e) => {
                mesh.updateBeamElement(selectedBeam.id, { materialId: parseInt(e.target.value) });
                dispatch({ type: 'REFRESH_MESH' });
              }}
            >
              {Array.from(mesh.materials.values()).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Material properties */}
          {(() => {
            const mat = mesh.getMaterial(selectedBeam.materialId);
            if (!mat) return null;
            return (
              <div className="result-info">
                <p><strong>E:</strong> {(mat.E / 1e9).toFixed(1)} GPa</p>
                <p><strong>&nu;:</strong> {mat.nu.toFixed(2)}</p>
              </div>
            );
          })()}

          <div className="form-group">
            <label>Section Profile</label>
            <select
              value={`${selectedBeam.section.A.toExponential(2)}`}
              onChange={(e) => {
                const section = DEFAULT_SECTIONS.find(s => s.section.A.toExponential(2) === e.target.value);
                if (section) {
                  mesh.updateBeamElement(selectedBeam.id, { section: section.section });
                  dispatch({ type: 'REFRESH_MESH' });
                }
              }}
            >
              {DEFAULT_SECTIONS.map(s => (
                <option key={s.name} value={s.section.A.toExponential(2)}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Extended section properties */}
          {selectedBeam.profileName && (
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}><strong>Profile:</strong> {selectedBeam.profileName}</p>
          )}
          <div className="result-info">
            <p><strong>A:</strong> {convertArea(selectedBeam.section.A, areaUnit).toExponential(3)} {areaUnit}</p>
            <p><strong>Iy:</strong> {convertMomentOfInertia(selectedBeam.section.Iy ?? selectedBeam.section.I, momentOfInertiaUnit).toExponential(3)} {momentOfInertiaUnit}</p>
            {selectedBeam.section.Iz != null && <p><strong>Iz:</strong> {convertMomentOfInertia(selectedBeam.section.Iz, momentOfInertiaUnit).toExponential(3)} {momentOfInertiaUnit}</p>}
            {selectedBeam.section.Wy != null && <p><strong>Wy:</strong> {convertSectionModulus(selectedBeam.section.Wy, sectionModulusUnit).toExponential(3)} {sectionModulusUnit}</p>}
            {selectedBeam.section.Wz != null && <p><strong>Wz:</strong> {convertSectionModulus(selectedBeam.section.Wz, sectionModulusUnit).toExponential(3)} {sectionModulusUnit}</p>}
          </div>

          {/* Distributed loads from active load case */}
          {(() => {
            const activeLc = loadCases.find(lc => lc.id === state.activeLoadCase);
            const beamLoads = activeLc?.distributedLoads.filter(dl => dl.elementId === selectedBeam.id) ?? [];
            if (beamLoads.length === 0) return <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>No distributed loads</p>;
            return (
              <>
                <h4>Distributed Loads ({beamLoads.length})</h4>
                {beamLoads.map((dl, idx) => {
                  const isIndSel = dl.id != null && selection.selectedDistLoadIds.has(dl.id);
                  return (
                    <div
                      key={dl.id ?? idx}
                      className={`result-info${isIndSel ? ' selected-load' : ''}`}
                      style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: '3px', background: isIndSel ? 'var(--bg-tertiary)' : 'transparent', marginBottom: '2px' }}
                      onClick={() => {
                        dispatch({
                          type: 'SET_SELECTION',
                          payload: {
                            nodeIds: new Set(),
                            elementIds: new Set(),
                            pointLoadNodeIds: new Set(),
                            distLoadBeamIds: new Set([dl.elementId]),
                            selectedDistLoadIds: new Set(dl.id != null ? [dl.id] : [])
                          }
                        });
                      }}
                    >
                      <p><strong>{dl.description || `Load #${dl.id ?? idx + 1}`}:</strong> qy={(dl.qy / 1000).toFixed(1)} kN/m
                        {dl.qyEnd != null && dl.qyEnd !== dl.qy ? ` → ${(dl.qyEnd / 1000).toFixed(1)} kN/m` : ''}
                        {(dl.startT != null && dl.startT > 0) || (dl.endT != null && dl.endT < 1)
                          ? ` (${((dl.startT ?? 0) * 100).toFixed(0)}%-${((dl.endT ?? 1) * 100).toFixed(0)}%)`
                          : ''}
                      </p>
                    </div>
                  );
                })}
              </>
            );
          })()}

          {result && result.beamForces.has(selectedBeam.id) && (
            <div className="result-info">
              <h4>Internal Forces</h4>
              {(() => {
                const forces = result.beamForces.get(selectedBeam.id)!;
                return (
                  <>
                    <p><strong>M_max:</strong> {formatMoment(forces.maxM)}</p>
                    <p><strong>V_max:</strong> {formatForce(forces.maxV)}</p>
                    <p><strong>N_max:</strong> {formatForce(forces.maxN)}</p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {selectedDistLoad && selectedDistLoadLcId !== null && (
        <DistLoadProperties
          load={selectedDistLoad}
          lcId={selectedDistLoadLcId}
          dispatch={dispatch}
          pushUndo={pushUndo}
        />
      )}

      {selectedElement && !selectedBeam && (
        <div className="panel-section">
          <h3>Element #{selectedElement.id}</h3>
          <div className="form-group">
            <label>Material</label>
            <select
              value={selectedElement.materialId}
              onChange={(e) => {
                mesh.updateElement(selectedElement.id, { materialId: parseInt(e.target.value) });
                dispatch({ type: 'REFRESH_MESH' });
              }}
            >
              {Array.from(mesh.materials.values()).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Thickness (m)</label>
            <input
              type="number"
              value={selectedElement.thickness}
              step="0.001"
              min="0.001"
              onChange={(e) => {
                mesh.updateElement(selectedElement.id, { thickness: parseFloat(e.target.value) || 0.01 });
                dispatch({ type: 'REFRESH_MESH' });
              }}
            />
          </div>

          {result && result.elementStresses.has(selectedElement.id) && (
            <div className="result-info">
              <h4>{analysisType === 'plate_bending' ? 'Moments' : 'Stresses'}</h4>
              {(() => {
                const stress = result.elementStresses.get(selectedElement.id)!;
                if (analysisType === 'plate_bending') {
                  return (
                    <>
                      <p><strong>mx:</strong> {formatMomentPerLength(stress.mx ?? 0, plateBendingMomentUnit)}</p>
                      <p><strong>my:</strong> {formatMomentPerLength(stress.my ?? 0, plateBendingMomentUnit)}</p>
                      <p><strong>mxy:</strong> {formatMomentPerLength(stress.mxy ?? 0, plateBendingMomentUnit)}</p>
                    </>
                  );
                }
                return (
                  <>
                    <p><strong>sigma_x:</strong> {formatStress(stress.sigmaX, stressUnit)}</p>
                    <p><strong>sigma_y:</strong> {formatStress(stress.sigmaY, stressUnit)}</p>
                    <p><strong>tau_xy:</strong> {formatStress(stress.tauXY, stressUnit)}</p>
                    <p><strong>Von Mises:</strong> {formatStress(stress.vonMises, stressUnit)}</p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="panel-section">
          <h3>Visualization</h3>
          <div className="checkbox-group">
            <input
              type="checkbox"
              checked={showDeformed}
              onChange={(e) => dispatch({ type: 'SET_SHOW_DEFORMED', payload: e.target.checked })}
            />
            <label>Show Deformed</label>
          </div>
          <div className="form-group">
            <label>Deformation Scale</label>
            <input
              type="range"
              min="1"
              max="1000"
              value={deformationScale}
              onChange={(e) => dispatch({ type: 'SET_DEFORMATION_SCALE', payload: parseInt(e.target.value) })}
            />
            <span className="scale-value">{deformationScale}x</span>
          </div>

          {analysisType === 'frame' && (
            <div className="form-group">
              <label>Diagram Scale</label>
              <input
                type="range"
                min="10"
                max="200"
                value={diagramScale}
                onChange={(e) => dispatch({ type: 'SET_DIAGRAM_SCALE', payload: parseInt(e.target.value) })}
              />
              <span className="scale-value">{diagramScale}</span>
            </div>
          )}

          {analysisType !== 'frame' && (
            <>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  checked={showStress}
                  onChange={(e) => dispatch({ type: 'SET_SHOW_STRESS', payload: e.target.checked })}
                />
                <label>Show Stresses</label>
              </div>
              <div className="form-group">
                <label>Component</label>
                <select
                  value={stressType}
                  onChange={(e) => dispatch({
                    type: 'SET_STRESS_TYPE',
                    payload: e.target.value as any
                  })}
                >
                  {analysisType === 'plate_bending' ? (
                    <>
                      <option value="mx">mx (bending)</option>
                      <option value="my">my (bending)</option>
                      <option value="mxy">mxy (twist)</option>
                    </>
                  ) : (
                    <>
                      <option value="vonMises">Von Mises</option>
                      <option value="sigmaX">sigma_x</option>
                      <option value="sigmaY">sigma_y</option>
                      <option value="tauXY">tau_xy</option>
                      <option value="nx">Membrane Force Nx (kN/m)</option>
                      <option value="ny">Membrane Force Ny (kN/m)</option>
                      <option value="nxy">Membrane Force Nxy (kN/m)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="color-scale">
                <div className="scale-bar">
                  {generateColorScale(result.minVonMises, result.maxVonMises, 10).map((item, i) => (
                    <div
                      key={i}
                      className="scale-segment"
                      style={{ background: item.color }}
                    />
                  ))}
                </div>
                <div className="scale-labels">
                  <span>{formatStress(result.minVonMises, stressUnit)}</span>
                  <span>{formatStress(result.maxVonMises, stressUnit)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {result && analysisType === 'frame' && (
        <div className="panel-section">
          <h3>Reactions</h3>
          {Array.from(mesh.nodes.values())
            .filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation)
            .map(node => {
              const idx = nodeIdToIndex.get(node.id);
              if (idx === undefined) return null;

              const Rx = node.constraints.x ? result.reactions[idx * 3] : 0;
              const Ry = node.constraints.y ? result.reactions[idx * 3 + 1] : 0;
              const Rm = node.constraints.rotation ? result.reactions[idx * 3 + 2] : 0;

              return (
                <div key={node.id} className="reaction-item">
                  <strong>Node {node.id}:</strong>
                  {node.constraints.x && <span> Rx = {formatForce(Rx)}</span>}
                  {node.constraints.y && <span> Ry = {formatForce(Ry)}</span>}
                  {node.constraints.rotation && <span> Rm = {formatMoment(Rm)}</span>}
                </div>
              );
            })}
        </div>
      )}

      <div className="panel-section">
        <h3>Materials</h3>
        {Array.from(mesh.materials.values()).slice(0, 5).map(m => (
          <div key={m.id} className="material-item">
            <div
              className="material-color"
              style={{ background: m.color }}
            />
            <div className="material-info">
              <span className="material-name">{m.name}</span>
              <span className="material-props">
                E: {formatModulus(m.E)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
