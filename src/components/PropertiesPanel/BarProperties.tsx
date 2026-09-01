/**
 * BarProperties — OpenAEC-styled inline beam editor.
 *
 * This is a from-scratch fresh-JSX rewrite. Inventory was taken from the
 * legacy BarPropertiesDialog (General tab + EN1993Tab) — same fields, same
 * dispatches, same validation — but every element is now built from
 * OpenAEC `.oa-props-*` primitives styled by `--theme-*` tokens.
 *
 * No reference to the legacy `BarPropertiesDialog` JSX, no `bar-props-*`
 * class names, no `inline` wrapper hack. Single source of truth for editing
 * a beam selected on the canvas.
 */
import { useState, useMemo, useEffect, Fragment } from 'react';
import { useFEM } from '../../context/FEMContext';
import type { IBeamSteelConfig } from '../../context/FEMContext';
import { calculateBeamLength } from '../../core/fem/Beam';
import {
  ConnectionType,
  IDOFConnections,
  StructuralElementType,
  IBeamSection,
  INode,
  getDOFConnectionTypes,
} from '../../core/fem/types';
import './PropertiesPanel.css';

const CONNECTION_OPTIONS: { value: ConnectionType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hinge', label: 'Free / Hinge' },
  { value: 'spring', label: 'Spring' },
  { value: 'tension_only', label: 'Tension only' },
  { value: 'pressure_only', label: 'Pressure only' },
];

const ELEMENT_TYPE_OPTIONS: { value: StructuralElementType; label: string }[] = [
  { value: 'none', label: '— None —' },
  { value: 'roof_left', label: 'Roof Left' },
  { value: 'roof_right', label: 'Roof Right' },
  { value: 'flat_roof', label: 'Flat Roof' },
  { value: 'facade_left', label: 'Facade Left' },
  { value: 'facade_right', label: 'Facade Right' },
  { value: 'floor', label: 'Floor' },
  { value: 'column', label: 'Column' },
];

const STEEL_GRADES = ['S235', 'S275', 'S355', 'S420', 'S460'];

const DEFLECTION_CLASSES = [
  { value: 'floor', label: 'Floor', defaultLimit: 333 },
  { value: 'roof', label: 'Roof', defaultLimit: 250 },
  { value: 'cantilever', label: 'Cantilever', defaultLimit: 150 },
  { value: 'custom', label: 'Custom', defaultLimit: 200 },
] as const;

export interface BarPropertiesProps {
  beamId: number;
}

export function BarProperties({ beamId }: BarPropertiesProps) {
  const { state, dispatch, pushUndo } = useFEM();
  const { mesh, lengthUnit, meshVersion, result, beamSteelConfigs } = state;

  // ─── Beam-source-of-truth lookup (uses meshVersion for re-reactive sync)
  const beam = mesh.getBeamElement(beamId);
  const beamData = useMemo(() => {
    if (!beam) return null;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) return null;
    const length = calculateBeamLength(nodes[0], nodes[1]);
    return { length, nodes };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beam, mesh, beamId, meshVersion]);

  // ─── Tab state (General | EN 1993)
  const [activeTab, setActiveTab] = useState<'general' | 'en1993'>('general');

  // ─── Local editing state (mirrors beam, written back via commit())
  const [profileName, setProfileName] = useState(beam?.profileName ?? '');
  const [section, setSection] = useState<IBeamSection | null>(beam?.section ?? null);
  const [startNodeId, setStartNodeId] = useState<number>(beam?.nodeIds[0] ?? 0);
  const [endNodeId, setEndNodeId] = useState<number>(beam?.nodeIds[1] ?? 0);
  const [elementType, setElementType] = useState<StructuralElementType>(beam?.elementType ?? 'none');
  const [onGrade, setOnGrade] = useState(beam?.onGrade?.enabled ?? false);
  const [gradeK, setGradeK] = useState(String((beam?.onGrade?.k ?? 10000) / 1000));
  const [gradeB, setGradeB] = useState(String((beam?.onGrade?.b ?? 1.0) * 1000));

  const dofInit = beam ? getDOFConnectionTypes(beam) : { start: { Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' } as IDOFConnections, end: { Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' } as IDOFConnections };
  const [startConns, setStartConns] = useState<IDOFConnections>(dofInit.start);
  const [endConns, setEndConns] = useState<IDOFConnections>(dofInit.end);

  type ThermalLoadType = 'none' | 'uniform' | 'gradient';
  const initialThermal: ThermalLoadType = beam?.thermalLoad
    ? (beam.thermalLoad.deltaTTop !== undefined || beam.thermalLoad.deltaTBottom !== undefined)
      ? 'gradient'
      : beam.thermalLoad.deltaT !== undefined && beam.thermalLoad.deltaT !== 0
        ? 'uniform' : 'none'
    : 'none';
  const [thermalType, setThermalType] = useState<ThermalLoadType>(initialThermal);
  const [uniformDeltaT, setUniformDeltaT] = useState(String(beam?.thermalLoad?.deltaT ?? 0));
  const [deltaTTop, setDeltaTTop] = useState(String(beam?.thermalLoad?.deltaTTop ?? 0));
  const [deltaTBottom, setDeltaTBottom] = useState(String(beam?.thermalLoad?.deltaTBottom ?? 0));

  // ─── EN 1993 state
  const existingSteel = beamSteelConfigs.get(beamId);
  const [steelGrade, setSteelGrade] = useState(existingSteel?.steelGrade ?? 'S235');
  const [isCantilever, setIsCantilever] = useState(existingSteel?.isCantilever ?? false);
  const [topSupports, setTopSupports] = useState(existingSteel?.lateralBracing?.topFlangePositions?.length ?? 0);
  const [bottomSupports, setBottomSupports] = useState(existingSteel?.lateralBracing?.bottomFlangePositions?.length ?? 0);
  const [bottomAsTop, setBottomAsTop] = useState(false);
  const [bucklingY, setBucklingY] = useState(existingSteel?.bucklingLengthY ?? 5000);
  const [bucklingZ, setBucklingZ] = useState(existingSteel?.bucklingLengthZ ?? 5000);
  const [deflectionEnabled, setDeflectionEnabled] = useState(true);
  const [deflectionClass, setDeflectionClass] = useState<IBeamSteelConfig['deflectionClass']>(existingSteel?.deflectionClass ?? 'floor');
  const [deflectionLimit, setDeflectionLimit] = useState(existingSteel?.deflectionLimitNumerator ?? 333);

  // Reset local state when the user selects a different beam
  useEffect(() => {
    if (!beam) return;
    setProfileName(beam.profileName ?? '');
    setSection(beam.section);
    setStartNodeId(beam.nodeIds[0]);
    setEndNodeId(beam.nodeIds[1]);
    setElementType(beam.elementType ?? 'none');
    setOnGrade(beam.onGrade?.enabled ?? false);
    setGradeK(String((beam.onGrade?.k ?? 10000) / 1000));
    setGradeB(String((beam.onGrade?.b ?? 1.0) * 1000));
    const dof = getDOFConnectionTypes(beam);
    setStartConns(dof.start);
    setEndConns(dof.end);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beamId]);

  // Available nodes for start/end picker
  const availableNodes = useMemo((): INode[] => {
    return Array.from(mesh.nodes.values() as Iterable<INode>).sort((a, b) => a.id - b.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.nodes, meshVersion]);

  // Available sections by name
  const availableSections = useMemo((): { name: string; section: IBeamSection }[] => {
    const out: { name: string; section: IBeamSection }[] = [];
    for (const [name, s] of mesh.sections.entries()) out.push({ name, section: s });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.sections, meshVersion]);

  if (!beam || !beamData) return <div className="properties-empty">Beam not found.</div>;

  const length = beamData.length;
  const material = mesh.getMaterial(beam.materialId);
  const beamForces = result?.beamForces.get(beamId);

  // ─── Commit helper.  Writes everything in local state back to the mesh.
  const commitGeneral = (overrides: { startNodeId?: number; endNodeId?: number; section?: IBeamSection } = {}) => {
    pushUndo();
    const sn = overrides.startNodeId ?? startNodeId;
    const en = overrides.endNodeId ?? endNodeId;
    const sec = overrides.section ?? section ?? beam.section;
    let thermal: { deltaT?: number; deltaTTop?: number; deltaTBottom?: number } | undefined;
    if (thermalType === 'uniform') {
      const dT = parseFloat(uniformDeltaT) || 0;
      if (dT !== 0) thermal = { deltaT: dT };
    } else if (thermalType === 'gradient') {
      const a = parseFloat(deltaTTop) || 0;
      const b = parseFloat(deltaTBottom) || 0;
      if (a !== 0 || b !== 0) thermal = { deltaTTop: a, deltaTBottom: b };
    }
    mesh.updateBeamElement(beam.id, {
      ...(sn !== beam.nodeIds[0] || en !== beam.nodeIds[1] ? { nodeIds: [sn, en] as [number, number] } : {}),
      section: sec,
      profileName: profileName || undefined,
      elementType: elementType === 'none' ? undefined : elementType,
      onGrade: onGrade
        ? { enabled: true, k: (parseFloat(gradeK) || 10) * 1000, b: (parseFloat(gradeB) || 1000) / 1000 }
        : undefined,
      startConnections: startConns,
      endConnections: endConns,
      startConnection: startConns.Rz,
      endConnection: endConns.Rz,
      endReleases: {
        startMoment: startConns.Rz === 'hinge',
        endMoment: endConns.Rz === 'hinge',
        startAxial: startConns.Tx !== 'fixed',
        endAxial: endConns.Tx !== 'fixed',
        startShear: startConns.Tz !== 'fixed',
        endShear: endConns.Tz !== 'fixed',
      },
      thermalLoad: thermal,
    });
    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  };

  const commitSteel = () => {
    const config: IBeamSteelConfig = {
      beamId,
      profileName: beam.profileName ?? '',
      steelGrade,
      lateralBracing: {
        topFlangePositions: distributeEvenly(topSupports),
        bottomFlangePositions: bottomAsTop ? distributeEvenly(topSupports) : distributeEvenly(bottomSupports),
      },
      bucklingLengthY: bucklingY,
      bucklingLengthZ: bucklingZ,
      deflectionClass,
      deflectionLimitNumerator: deflectionLimit,
      isCantilever,
    };
    dispatch({ type: 'SET_BEAM_STEEL_CONFIG', payload: config });
  };

  const convertLength = (m: number) =>
    lengthUnit === 'mm' ? m * 1000 : lengthUnit === 'cm' ? m * 100 : m;

  return (
    <div className="properties-panel">
      {/* tab bar */}
      <div className="oa-props-tabs">
        <button
          className={`oa-props-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`oa-props-tab ${activeTab === 'en1993' ? 'active' : ''}`}
          onClick={() => setActiveTab('en1993')}
        >
          EN 1993
        </button>
      </div>

      {activeTab === 'general' && (
        <>
          <section className="oa-props-section">
            <div className="oa-props-section-title">Beam</div>
            <div className="oa-props-section-body">
              <div className="oa-props-row">
                <span className="oa-props-label">ID</span>
                <span className="oa-props-value">{beam.id}</span>
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">Length</span>
                <span className="oa-props-value">
                  {convertLength(length).toFixed(lengthUnit === 'm' ? 3 : 1)} {lengthUnit}
                </span>
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">Start</span>
                <select
                  className="oa-props-select"
                  value={startNodeId}
                  onChange={e => {
                    const nid = parseInt(e.target.value);
                    if (nid !== endNodeId) {
                      setStartNodeId(nid);
                      commitGeneral({ startNodeId: nid });
                    }
                  }}
                >
                  {availableNodes.map(n => (
                    <option key={n.id} value={n.id} disabled={n.id === endNodeId}>
                      {n.id} ({n.x.toFixed(2)}, {n.y.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">End</span>
                <select
                  className="oa-props-select"
                  value={endNodeId}
                  onChange={e => {
                    const nid = parseInt(e.target.value);
                    if (nid !== startNodeId) {
                      setEndNodeId(nid);
                      commitGeneral({ endNodeId: nid });
                    }
                  }}
                >
                  {availableNodes.map(n => (
                    <option key={n.id} value={n.id} disabled={n.id === startNodeId}>
                      {n.id} ({n.x.toFixed(2)}, {n.y.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">Type</span>
                <select
                  className="oa-props-select"
                  value={elementType}
                  onChange={e => { setElementType(e.target.value as StructuralElementType); }}
                  onBlur={() => commitGeneral()}
                >
                  {ELEMENT_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="oa-props-actions">
                <button
                  className="oa-props-btn"
                  onClick={() => {
                    // Swap start/end
                    const newStart = endNodeId;
                    const newEnd = startNodeId;
                    setStartNodeId(newStart);
                    setEndNodeId(newEnd);
                    const swap = startConns; setStartConns(endConns); setEndConns(swap);
                    commitGeneral({ startNodeId: newStart, endNodeId: newEnd });
                  }}
                  title="Swap start/end"
                >Swap</button>
              </div>
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Section</div>
            <div className="oa-props-section-body">
              <div className="oa-props-row">
                <span className="oa-props-label">Profile</span>
                <select
                  className="oa-props-select"
                  value={profileName}
                  onChange={e => {
                    const name = e.target.value;
                    setProfileName(name);
                    const found = availableSections.find(s => s.name === name);
                    if (found) {
                      setSection(found.section);
                      commitGeneral({ section: found.section });
                    }
                  }}
                >
                  {!profileName && <option value="">— Select —</option>}
                  {availableSections.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              {material && (
                <div className="oa-props-facts">
                  <p><strong>Material</strong><span>{material.name}</span></p>
                  <p><strong>E</strong><span>{(material.E / 1e9).toFixed(1)} GPa</span></p>
                  <p><strong>ν</strong><span>{material.nu.toFixed(2)}</span></p>
                </div>
              )}
              {beam.section && (
                <div className="oa-props-facts">
                  <p><strong>A</strong><span>{beam.section.A.toExponential(3)} m²</span></p>
                  <p><strong>Iy</strong><span>{(beam.section.Iy ?? beam.section.I).toExponential(3)} m⁴</span></p>
                  {beam.section.Iz != null && <p><strong>Iz</strong><span>{beam.section.Iz.toExponential(3)} m⁴</span></p>}
                </div>
              )}
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Foundation</div>
            <div className="oa-props-section-body">
              <label className="oa-props-checkbox">
                <input
                  type="checkbox"
                  checked={onGrade}
                  onChange={e => { setOnGrade(e.target.checked); }}
                  onBlur={() => commitGeneral()}
                />
                Beam on grade (elastic foundation)
              </label>
              {onGrade && (
                <>
                  <div className="oa-props-row">
                    <span className="oa-props-label">k</span>
                    <input
                      className="oa-props-input"
                      type="number"
                      value={gradeK}
                      onChange={e => setGradeK(e.target.value)}
                      onBlur={() => commitGeneral()}
                      placeholder="kN/m/m"
                    />
                  </div>
                  <div className="oa-props-row">
                    <span className="oa-props-label">b</span>
                    <input
                      className="oa-props-input"
                      type="number"
                      value={gradeB}
                      onChange={e => setGradeB(e.target.value)}
                      onBlur={() => commitGeneral()}
                      placeholder="mm"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Connections</div>
            <div className="oa-props-section-body">
              <div className="oa-dof-grid">
                <span></span>
                <span className="oa-dof-label">Start</span>
                <span className="oa-dof-label">End</span>

                <span></span>
                <div className="oa-props-actions">
                  <button className="oa-props-btn" onClick={() => { setStartConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' }); commitGeneral(); }}>Fixed</button>
                  <button className="oa-props-btn" onClick={() => { setStartConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'hinge' }); commitGeneral(); }}>Hinge</button>
                </div>
                <div className="oa-props-actions">
                  <button className="oa-props-btn" onClick={() => { setEndConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' }); commitGeneral(); }}>Fixed</button>
                  <button className="oa-props-btn" onClick={() => { setEndConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'hinge' }); commitGeneral(); }}>Hinge</button>
                </div>

                {(['Tx', 'Tz', 'Rz'] as const).map(dof => {
                  const isRot = dof === 'Rz';
                  const springKey = `spring${dof}` as 'springTx' | 'springTz' | 'springRz';
                  const unit = isRot ? 'kNm/rad' : 'kN/m';
                  const toDisp = (v: number | undefined) => v !== undefined ? v / 1000 : '';
                  const fromDisp = (s: string) => (parseFloat(s) || 0) * 1000;
                  return (
                    <Fragment key={dof}>
                      <span className="oa-dof-label">{dof}</span>
                      <div className="oa-dof-cell">
                        <select
                          className="oa-props-select"
                          value={startConns[dof]}
                          onChange={e => { setStartConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType })); commitGeneral(); }}
                        >
                          {CONNECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {startConns[dof] === 'spring' && (
                          <div className="oa-dof-spring-row">
                            <input
                              className="oa-props-input"
                              type="number"
                              placeholder="k"
                              value={toDisp(startConns[springKey])}
                              onChange={e => setStartConns(prev => ({ ...prev, [springKey]: fromDisp(e.target.value) }))}
                              onBlur={() => commitGeneral()}
                            />
                            <span className="oa-dof-spring-unit">{unit}</span>
                          </div>
                        )}
                      </div>
                      <div className="oa-dof-cell">
                        <select
                          className="oa-props-select"
                          value={endConns[dof]}
                          onChange={e => { setEndConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType })); commitGeneral(); }}
                        >
                          {CONNECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {endConns[dof] === 'spring' && (
                          <div className="oa-dof-spring-row">
                            <input
                              className="oa-props-input"
                              type="number"
                              placeholder="k"
                              value={toDisp(endConns[springKey])}
                              onChange={e => setEndConns(prev => ({ ...prev, [springKey]: fromDisp(e.target.value) }))}
                              onBlur={() => commitGeneral()}
                            />
                            <span className="oa-dof-spring-unit">{unit}</span>
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Thermal load</div>
            <div className="oa-props-section-body">
              <div className="oa-props-radio-row">
                <label className="oa-props-radio">
                  <input type="radio" name="bp-thermal" checked={thermalType === 'none'} onChange={() => { setThermalType('none'); commitGeneral(); }} />
                  None
                </label>
                <label className="oa-props-radio">
                  <input type="radio" name="bp-thermal" checked={thermalType === 'uniform'} onChange={() => { setThermalType('uniform'); commitGeneral(); }} />
                  Uniform
                </label>
                <label className="oa-props-radio">
                  <input type="radio" name="bp-thermal" checked={thermalType === 'gradient'} onChange={() => { setThermalType('gradient'); commitGeneral(); }} />
                  Gradient
                </label>
              </div>
              {thermalType === 'uniform' && (
                <div className="oa-props-row">
                  <span className="oa-props-label">ΔT (°C)</span>
                  <input
                    className="oa-props-input"
                    type="number"
                    value={uniformDeltaT}
                    onChange={e => setUniformDeltaT(e.target.value)}
                    onBlur={() => commitGeneral()}
                  />
                </div>
              )}
              {thermalType === 'gradient' && (
                <>
                  <div className="oa-props-row">
                    <span className="oa-props-label">ΔT top</span>
                    <input
                      className="oa-props-input"
                      type="number"
                      value={deltaTTop}
                      onChange={e => setDeltaTTop(e.target.value)}
                      onBlur={() => commitGeneral()}
                    />
                  </div>
                  <div className="oa-props-row">
                    <span className="oa-props-label">ΔT bottom</span>
                    <input
                      className="oa-props-input"
                      type="number"
                      value={deltaTBottom}
                      onChange={e => setDeltaTBottom(e.target.value)}
                      onBlur={() => commitGeneral()}
                    />
                  </div>
                  <div className="oa-props-hint">Top hotter than bottom causes downward bending.</div>
                </>
              )}
            </div>
          </section>

          {beamForces && (
            <section className="oa-props-section">
              <div className="oa-props-section-title">Internal forces</div>
              <div className="oa-props-section-body">
                <div className="oa-props-facts">
                  <p><strong>M_max</strong><span>{((beamForces.maxM ?? 0) / 1000).toFixed(2)} kNm</span></p>
                  <p><strong>V_max</strong><span>{((beamForces.maxV ?? 0) / 1000).toFixed(2)} kN</span></p>
                  <p><strong>N_max</strong><span>{((beamForces.maxN ?? 0) / 1000).toFixed(2)} kN</span></p>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {activeTab === 'en1993' && (
        <>
          <section className="oa-props-section">
            <div className="oa-props-section-title">EN 1993-1-1</div>
            <div className="oa-props-section-body">
              <div className="oa-props-row">
                <span className="oa-props-label">Steel grade</span>
                <select
                  className="oa-props-select"
                  value={steelGrade}
                  onChange={e => { setSteelGrade(e.target.value); }}
                  onBlur={commitSteel}
                >
                  {STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <label className="oa-props-checkbox">
                <input
                  type="checkbox"
                  checked={isCantilever}
                  onChange={e => { setIsCantilever(e.target.checked); commitSteel(); }}
                />
                Cantilever
              </label>
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Lateral-torsional buckling</div>
            <div className="oa-props-section-body">
              <div className="oa-props-row">
                <span className="oa-props-label">Top supports</span>
                <input
                  className="oa-props-input"
                  type="number"
                  min={0}
                  value={topSupports}
                  onChange={e => setTopSupports(Math.max(0, parseInt(e.target.value) || 0))}
                  onBlur={commitSteel}
                />
              </div>
              <label className="oa-props-checkbox">
                <input
                  type="checkbox"
                  checked={bottomAsTop}
                  onChange={e => { setBottomAsTop(e.target.checked); commitSteel(); }}
                />
                Bottom as top
              </label>
              {!bottomAsTop && (
                <div className="oa-props-row">
                  <span className="oa-props-label">Bottom supports</span>
                  <input
                    className="oa-props-input"
                    type="number"
                    min={0}
                    value={bottomSupports}
                    onChange={e => setBottomSupports(Math.max(0, parseInt(e.target.value) || 0))}
                    onBlur={commitSteel}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Buckling lengths</div>
            <div className="oa-props-section-body">
              <div className="oa-props-row">
                <span className="oa-props-label">L_y (mm)</span>
                <input
                  className="oa-props-input"
                  type="number"
                  value={bucklingY}
                  onChange={e => setBucklingY(parseFloat(e.target.value) || 0)}
                  onBlur={commitSteel}
                />
              </div>
              <div className="oa-props-row">
                <span className="oa-props-label">L_z (mm)</span>
                <input
                  className="oa-props-input"
                  type="number"
                  value={bucklingZ}
                  onChange={e => setBucklingZ(parseFloat(e.target.value) || 0)}
                  onBlur={commitSteel}
                />
              </div>
            </div>
          </section>

          <section className="oa-props-section">
            <div className="oa-props-section-title">Deflection (SLS)</div>
            <div className="oa-props-section-body">
              <label className="oa-props-checkbox">
                <input
                  type="checkbox"
                  checked={deflectionEnabled}
                  onChange={e => setDeflectionEnabled(e.target.checked)}
                />
                Check deflection
              </label>
              {deflectionEnabled && (
                <>
                  <div className="oa-props-row">
                    <span className="oa-props-label">Class</span>
                    <select
                      className="oa-props-select"
                      value={deflectionClass}
                      onChange={e => {
                        const cls = e.target.value as IBeamSteelConfig['deflectionClass'];
                        setDeflectionClass(cls);
                        const found = DEFLECTION_CLASSES.find(d => d.value === cls);
                        if (found) setDeflectionLimit(found.defaultLimit);
                        commitSteel();
                      }}
                    >
                      {DEFLECTION_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="oa-props-row">
                    <span className="oa-props-label">L /</span>
                    <input
                      className="oa-props-input"
                      type="number"
                      min={1}
                      value={deflectionLimit}
                      onChange={e => setDeflectionLimit(parseInt(e.target.value) || 1)}
                      onBlur={commitSteel}
                    />
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function distributeEvenly(count: number): number[] {
  if (count <= 0) return [];
  const step = 1 / (count + 1);
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}

export default BarProperties;
