import { useState, useMemo, Fragment, useEffect } from 'react';
import { INode, IBeamElement, IBeamSection, IBeamForces, IMaterial, ILayer, ConnectionType, IDOFConnections, getDOFConnectionTypes, StructuralElementType } from '../../core/fem/types';
import { SectionPropertiesDialog } from '../SectionPropertiesDialog/SectionPropertiesDialog';
import { checkSteelSection, ISteelCheckResult } from '../../core/standards/SteelCheck';
import { STEEL_GRADES, ISteelGrade } from '../../core/standards/EurocodeNL';
import { SteelCheckReport } from '../SteelCheckReport/SteelCheckReport';
import { useFEM } from '../../context/FEMContext';
import './BarPropertiesDialog.css';

type BarDialogTab = 'properties' | 'en1993';

const CONNECTION_OPTIONS: { value: ConnectionType; label: string }[] = [
  { value: 'fixed', label: 'A (Fixed)' },
  { value: 'hinge', label: 'Free' },
  { value: 'spring', label: 'S (Spring)' },
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

interface BarPropertiesDialogProps {
  beam: IBeamElement;
  length: number;
  material?: IMaterial;
  beamForces?: IBeamForces;
  layers?: ILayer[];
  onUpdate: (updates: Partial<IBeamElement>) => void;
  onClose: () => void;
}

export function BarPropertiesDialog({ beam, length, beamForces, layers, onUpdate, onClose }: BarPropertiesDialogProps) {
  const { state } = useFEM();
  const { mesh, forceUnit, stressUnit, lengthUnit, momentUnit, steelCheckInterval } = state;

  const [activeTab, setActiveTab] = useState<BarDialogTab>('properties');
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [showNewSection, setShowNewSection] = useState(false);
  const [section, setSection] = useState<IBeamSection>(beam.section);
  const [profileName, setProfileName] = useState<string>(beam.profileName ?? '');
  const [startNodeId, setStartNodeId] = useState<number>(beam.nodeIds[0]);
  const [endNodeId, setEndNodeId] = useState<number>(beam.nodeIds[1]);
  const [elementType, setElementType] = useState<StructuralElementType>(beam.elementType ?? 'none');
  const [onGrade, setOnGrade] = useState(beam.onGrade?.enabled ?? false);
  const [gradeK, setGradeK] = useState(String((beam.onGrade?.k ?? 10000) / 1000)); // display in kN/m/m
  const [gradeB, setGradeB] = useState(String((beam.onGrade?.b ?? 1.0) * 1000)); // display in mm
  const [layerId, setLayerId] = useState(beam.layerId ?? 0);

  // Unit conversion helpers
  const convertLength = (lengthM: number): number => {
    switch (lengthUnit) {
      case 'm': return lengthM;
      case 'mm': return lengthM * 1000;
      case 'cm': return lengthM * 100;
      default: return lengthM;
    }
  };

  // Convert force from N to display unit
  const convertForce = (forceN: number): number => {
    switch (forceUnit) {
      case 'N': return forceN;
      case 'kN': return forceN / 1000;
      case 'MN': return forceN / 1e6;
      default: return forceN / 1000;
    }
  };

  // Convert moment from Nm to display unit
  const convertMoment = (momentNm: number): number => {
    switch (momentUnit) {
      case 'Nm': return momentNm;
      case 'kNm': return momentNm / 1000;
      default: return momentNm / 1000;
    }
  };

  // Convert stress from Pa to display unit
  const convertStress = (stressPa: number): number => {
    switch (stressUnit) {
      case 'Pa': return stressPa;
      case 'kPa': return stressPa / 1000;
      case 'MPa': return stressPa / 1e6;
      case 'N/mm²': return stressPa / 1e6;
      default: return stressPa / 1e6;
    }
  };

  // Per-DOF connection type state
  const dofConns = getDOFConnectionTypes(beam);
  const [startConns, setStartConns] = useState<IDOFConnections>(dofConns.start);
  const [endConns, setEndConns] = useState<IDOFConnections>(dofConns.end);

  // NEN-EN 1993-1 tab state
  const [steelGradeName, setSteelGradeName] = useState('S355');
  const [lcrY, setLcrY] = useState(length.toFixed(3));
  const [lcrZ, setLcrZ] = useState(length.toFixed(3));
  const [showReport, setShowReport] = useState(false);

  // Lateral bracing, camber, and deflection limit state
  const [bracingTop, setBracingTop] = useState<number[]>(beam.lateralBracing?.top ?? [0, 1]);
  const [bracingBottom, setBracingBottom] = useState<number[]>(beam.lateralBracing?.bottom ?? [0, 1]);
  const [camberMm, setCamberMm] = useState(String((beam.camber ?? 0) * 1000)); // store in mm
  const [deflectionLimit, setDeflectionLimit] = useState<'L/500' | 'L/333' | 'L/250'>(beam.deflectionLimit ?? 'L/250');
  const [newBracingTop, setNewBracingTop] = useState('');
  const [newBracingBottom, setNewBracingBottom] = useState('');

  // Thermal load state
  type ThermalLoadType = 'none' | 'uniform' | 'gradient';
  const initialThermalType: ThermalLoadType = beam.thermalLoad
    ? (beam.thermalLoad.deltaTTop !== undefined || beam.thermalLoad.deltaTBottom !== undefined)
      ? 'gradient'
      : beam.thermalLoad.deltaT !== undefined && beam.thermalLoad.deltaT !== 0
        ? 'uniform'
        : 'none'
    : 'none';
  const [thermalLoadType, setThermalLoadType] = useState<ThermalLoadType>(initialThermalType);
  const [uniformDeltaT, setUniformDeltaT] = useState(String(beam.thermalLoad?.deltaT ?? 0));
  const [deltaTTop, setDeltaTTop] = useState(String(beam.thermalLoad?.deltaTTop ?? 0));
  const [deltaTBottom, setDeltaTBottom] = useState(String(beam.thermalLoad?.deltaTBottom ?? 0));

  // Close dialog on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Get all available nodes sorted by ID
  const availableNodes = useMemo((): INode[] => {
    const nodes = Array.from(mesh.nodes.values()) as INode[];
    return nodes.sort((a, b) => a.id - b.id);
  }, [mesh.nodes]);

  // Get all available sections from the project
  const availableSections = useMemo((): { name: string; section: IBeamSection }[] => {
    const sections: { name: string; section: IBeamSection }[] = [];
    for (const [name, sect] of mesh.sections.entries()) {
      sections.push({ name, section: sect });
    }
    // Sort by name
    return sections.sort((a, b) => a.name.localeCompare(b.name));
  }, [mesh.sections]);

  // Calculate current beam length based on selected nodes
  const currentLength = useMemo(() => {
    const n1 = mesh.nodes.get(startNodeId);
    const n2 = mesh.nodes.get(endNodeId);
    if (!n1 || !n2) return length; // fallback to original length
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, [mesh.nodes, startNodeId, endNodeId, length]);

  // Check if nodes have changed from original
  const nodesChanged = startNodeId !== beam.nodeIds[0] || endNodeId !== beam.nodeIds[1];

  const selectedGrade: ISteelGrade = useMemo(
    () => STEEL_GRADES.find(g => g.name === steelGradeName) || STEEL_GRADES[2],
    [steelGradeName]
  );

  // Cross-section classification (simplified for I-sections based on c/t ratios)
  const crossSectionClass = useMemo(() => {
    const profileEntry = beam.profileName || '';
    // Simplified classification based on available section moduli ratios
    // If Wply is available and > Wy, likely Class 1 or 2
    if (section.Wply && section.Wy) {
      const ratio = section.Wply / section.Wy;
      if (ratio >= 1.10) return 1;
      if (ratio >= 1.05) return 2;
      return 3;
    }
    // Default: Class 2 for standard hot-rolled sections
    if (profileEntry.includes('IPE') || profileEntry.includes('HEA') || profileEntry.includes('HEB')) {
      return 1; // Standard hot-rolled I-sections are usually Class 1 or 2
    }
    return 3; // Conservative default
  }, [section, beam.profileName]);

  // Steel check results
  const steelCheck: ISteelCheckResult | null = useMemo(() => {
    if (!beamForces) return null;
    const sectionProps = {
      A: section.A,
      I: section.Iy ?? section.I,
      h: section.h,
      Wel: section.Wy,
      profileName: beam.profileName,
    };
    return checkSteelSection(sectionProps, beamForces, selectedGrade, length, 0, 250, false, steelCheckInterval);
  }, [section, beamForces, selectedGrade, beam.profileName, length, steelCheckInterval]);

  const handleApply = () => {
    const camberValue = parseFloat(camberMm) || 0;

    // Build thermalLoad based on type
    let thermalLoad: { deltaT?: number; deltaTTop?: number; deltaTBottom?: number } | undefined;
    if (thermalLoadType === 'uniform') {
      const dT = parseFloat(uniformDeltaT) || 0;
      if (dT !== 0) {
        thermalLoad = { deltaT: dT };
      }
    } else if (thermalLoadType === 'gradient') {
      const dTTop = parseFloat(deltaTTop) || 0;
      const dTBottom = parseFloat(deltaTBottom) || 0;
      if (dTTop !== 0 || dTBottom !== 0) {
        thermalLoad = { deltaTTop: dTTop, deltaTBottom: dTBottom };
      }
    }

    onUpdate({
      // Update nodeIds if changed
      ...(nodesChanged ? { nodeIds: [startNodeId, endNodeId] as [number, number] } : {}),
      section,
      profileName: profileName || undefined,
      elementType: elementType === 'none' ? undefined : elementType,
      onGrade: onGrade ? { enabled: true, k: (parseFloat(gradeK) || 10) * 1000, b: (parseFloat(gradeB) || 1000) / 1000 } : undefined,
      layerId,
      startConnections: startConns,
      endConnections: endConns,
      // Also update legacy formats for backward compatibility
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
      // Lateral bracing, camber, deflection limit
      lateralBracing: {
        top: [...bracingTop].sort((a, b) => a - b),
        bottom: [...bracingBottom].sort((a, b) => a - b),
      },
      camber: camberValue / 1000, // convert mm to m
      deflectionLimit,
      thermalLoad,
    });
    onClose();
  };

  if (showSectionPicker || showNewSection) {
    return (
      <SectionPropertiesDialog
        section={showNewSection ? undefined : (profileName ? { name: profileName, section } : undefined)}
        isNew={showNewSection}
        onSave={(newProfileName, newSection) => {
          // Add/update section in project
          mesh.sections.set(newProfileName, newSection);
          setSection(newSection);
          setProfileName(newProfileName);
          onUpdate({ profileName: newProfileName, section: newSection });
          setShowSectionPicker(false);
          setShowNewSection(false);
        }}
        onClose={() => {
          setShowSectionPicker(false);
          setShowNewSection(false);
        }}
      />
    );
  }

  const renderPropertiesTab = () => (
    <>
      <div className="bar-props-row">
        <span className="bar-props-label">ID</span>
        <span className="bar-props-value">{beam.id}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Length</span>
        <span className="bar-props-value">
          {convertLength(currentLength).toFixed(lengthUnit === 'm' ? 3 : 1)} {lengthUnit}
          {nodesChanged && <span style={{ color: '#f0ad4e', marginLeft: '4px' }} title="Length will be updated when applied">(modified)</span>}
        </span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Start Node</span>
        <span className="bar-props-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            className="bar-props-select"
            style={{ flex: 1 }}
            value={startNodeId}
            onChange={e => {
              const newId = parseInt(e.target.value);
              if (newId !== endNodeId) {
                setStartNodeId(newId);
              }
            }}
          >
            {availableNodes.map(node => (
              <option key={node.id} value={node.id} disabled={node.id === endNodeId}>
                {node.id} ({node.x.toFixed(2)}, {node.y.toFixed(2)})
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">End Node</span>
        <span className="bar-props-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            className="bar-props-select"
            style={{ flex: 1 }}
            value={endNodeId}
            onChange={e => {
              const newId = parseInt(e.target.value);
              if (newId !== startNodeId) {
                setEndNodeId(newId);
              }
            }}
          >
            {availableNodes.map(node => (
              <option key={node.id} value={node.id} disabled={node.id === startNodeId}>
                {node.id} ({node.x.toFixed(2)}, {node.y.toFixed(2)})
              </option>
            ))}
          </select>
          <button
            className="bar-props-btn-small"
            title="Swap start/end nodes"
            onClick={() => {
              // Swap nodes and connections
              const swappedConns = { start: endConns, end: startConns };
              setStartConns(swappedConns.start);
              setEndConns(swappedConns.end);
              setStartNodeId(endNodeId);
              setEndNodeId(startNodeId);
            }}
          >
            Swap
          </button>
        </span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">Element Type</span>
        <select
          className="bar-props-select"
          value={elementType}
          onChange={e => setElementType(e.target.value as StructuralElementType)}
        >
          {ELEMENT_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      {layers && layers.length > 1 && (
        <div className="bar-props-row">
          <span className="bar-props-label">Layer</span>
          <select
            className="bar-props-select"
            value={layerId}
            onChange={e => setLayerId(parseInt(e.target.value))}
          >
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Section - with project section selector */}
      <div className="bar-props-section-title">Section</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Profile</span>
        <select
          className="bar-props-select"
          value={profileName}
          onChange={e => {
            const selectedName = e.target.value;
            setProfileName(selectedName);
            const found = availableSections.find(s => s.name === selectedName);
            if (found) {
              setSection(found.section);
            }
          }}
        >
          {!profileName && <option value="">— Select —</option>}
          {availableSections.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="bar-props-section-buttons">
        <button
          className="bar-props-btn-small"
          title="New section"
          onClick={() => setShowNewSection(true)}
        >
          New
        </button>
        <button
          className="bar-props-btn-small"
          title="Duplicate current section"
          disabled={!profileName}
          onClick={() => {
            if (!profileName) return;
            // Find a unique name
            let newName = profileName + ' (copy)';
            let counter = 2;
            while (mesh.sections.has(newName)) {
              newName = `${profileName} (copy ${counter})`;
              counter++;
            }
            mesh.sections.set(newName, { ...section });
            setProfileName(newName);
          }}
        >
          Duplicate
        </button>
        <button
          className="bar-props-btn-small bar-props-btn-danger"
          title="Delete section from project"
          disabled={!profileName}
          onClick={() => {
            if (!profileName) return;
            // Check if other beams use this section
            let usageCount = 0;
            for (const b of mesh.beamElements.values()) {
              if (b.profileName === profileName && b.id !== beam.id) {
                usageCount++;
              }
            }
            if (usageCount > 0) {
              alert(`Cannot delete: ${usageCount} other beam(s) use this section.`);
              return;
            }
            mesh.sections.delete(profileName);
            // Select first available section or clear
            const remaining = Array.from(mesh.sections.keys());
            if (remaining.length > 0) {
              const firstSection = mesh.sections.get(remaining[0])!;
              setProfileName(remaining[0]);
              setSection(firstSection);
            } else {
              setProfileName('');
            }
          }}
        >
          Delete
        </button>
        <button
          className="bar-props-btn-small"
          title="Edit section properties"
          onClick={() => setShowSectionPicker(true)}
        >
          Edit...
        </button>
      </div>

      {/* Beam on elastic foundation */}
      <div className="bar-props-section-title">Foundation</div>
      <label className="bar-props-toggle">
        <input type="checkbox" checked={onGrade} onChange={e => setOnGrade(e.target.checked)} />
        Beam on grade (elastic foundation)
      </label>
      {onGrade && (
        <>
          <div className="bar-props-row">
            <span className="bar-props-label">k (kN/m/m)</span>
            <input
              className="bar-props-input"
              type="text"
              value={gradeK}
              onChange={e => setGradeK(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </div>
          <div className="bar-props-row">
            <span className="bar-props-label">Width (mm)</span>
            <input
              className="bar-props-input"
              type="text"
              value={gradeB}
              onChange={e => setGradeB(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </div>
        </>
      )}

      {/* Connection Type - per DOF */}
      <div className="bar-props-section-title">Connection Type</div>

      <div className="bar-props-dof-grid">
        {/* Header row with column labels */}
        <span className="bar-props-dof-header"></span>
        <span className="bar-props-dof-header">Start</span>
        <span className="bar-props-dof-header">End</span>

        {/* Preset buttons row directly under headers */}
        <span></span>
        <div className="bar-props-preset-btns">
          <button
            className="bar-props-btn-small"
            onClick={() => setStartConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' })}
            title="Fully Fixed (all DOFs fixed)"
          >Fixed</button>
          <button
            className="bar-props-btn-small"
            onClick={() => setStartConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'hinge' })}
            title="Hinge (rotation free)"
          >Hinge</button>
        </div>
        <div className="bar-props-preset-btns">
          <button
            className="bar-props-btn-small"
            onClick={() => setEndConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'fixed' })}
            title="Fully Fixed (all DOFs fixed)"
          >Fixed</button>
          <button
            className="bar-props-btn-small"
            onClick={() => setEndConns({ Tx: 'fixed', Tz: 'fixed', Rz: 'hinge' })}
            title="Hinge (rotation free)"
          >Hinge</button>
        </div>
        {(['Tx', 'Tz', 'Rz'] as const).map(dof => {
          const springKey = `spring${dof}` as 'springTx' | 'springTz' | 'springRz';
          const isRotation = dof === 'Rz';
          const unit = isRotation ? 'kNm/rad' : 'kN/m';
          // Convert from internal units (N/m or Nm/rad) to display units (kN/m or kNm/rad)
          const toDisplay = (val: number | undefined) => val !== undefined ? val / 1000 : '';
          const fromDisplay = (val: string) => (parseFloat(val) || 0) * 1000;

          return (
            <Fragment key={dof}>
              <span className="bar-props-dof-label">{dof}</span>
              <div className="bar-props-dof-cell">
                <select
                  className="bar-props-select bar-props-select-compact"
                  value={startConns[dof]}
                  onChange={e => setStartConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType }))}
                >
                  {CONNECTION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {startConns[dof] === 'spring' && (
                  <div className="bar-props-spring-input">
                    <input
                      type="number"
                      className="bar-props-spring-stiffness"
                      placeholder="k"
                      value={toDisplay(startConns[springKey])}
                      onChange={e => setStartConns(prev => ({ ...prev, [springKey]: fromDisplay(e.target.value) }))}
                      onFocus={e => e.target.select()}
                    />
                    <span className="bar-props-spring-unit">{unit}</span>
                  </div>
                )}
              </div>
              <div className="bar-props-dof-cell">
                <select
                  className="bar-props-select bar-props-select-compact"
                  value={endConns[dof]}
                  onChange={e => setEndConns(prev => ({ ...prev, [dof]: e.target.value as ConnectionType }))}
                >
                  {CONNECTION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {endConns[dof] === 'spring' && (
                  <div className="bar-props-spring-input">
                    <input
                      type="number"
                      className="bar-props-spring-stiffness"
                      placeholder="k"
                      value={toDisplay(endConns[springKey])}
                      onChange={e => setEndConns(prev => ({ ...prev, [springKey]: fromDisplay(e.target.value) }))}
                      onFocus={e => e.target.select()}
                    />
                    <span className="bar-props-spring-unit">{unit}</span>
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Thermal Load */}
      <div className="bar-props-section-title">Thermal Load</div>
      <div className="bar-props-thermal-type">
        <label className="bar-props-radio">
          <input
            type="radio"
            name="thermalType"
            checked={thermalLoadType === 'none'}
            onChange={() => setThermalLoadType('none')}
          />
          None
        </label>
        <label className="bar-props-radio">
          <input
            type="radio"
            name="thermalType"
            checked={thermalLoadType === 'uniform'}
            onChange={() => setThermalLoadType('uniform')}
          />
          Uniform
        </label>
        <label className="bar-props-radio">
          <input
            type="radio"
            name="thermalType"
            checked={thermalLoadType === 'gradient'}
            onChange={() => setThermalLoadType('gradient')}
          />
          Gradient
        </label>
      </div>
      {thermalLoadType === 'uniform' && (
        <div className="bar-props-input-row">
          <span>DT (C)</span>
          <input
            type="number"
            step="1"
            value={uniformDeltaT}
            onChange={e => setUniformDeltaT(e.target.value)}
            onFocus={e => e.target.select()}
            title="Uniform temperature change (positive = heating)"
          />
        </div>
      )}
      {thermalLoadType === 'gradient' && (
        <>
          <div className="bar-props-input-row">
            <span>DT top (C)</span>
            <input
              type="number"
              step="1"
              value={deltaTTop}
              onChange={e => setDeltaTTop(e.target.value)}
              onFocus={e => e.target.select()}
              title="Temperature change at top fiber"
            />
          </div>
          <div className="bar-props-input-row">
            <span>DT bottom (C)</span>
            <input
              type="number"
              step="1"
              value={deltaTBottom}
              onChange={e => setDeltaTBottom(e.target.value)}
              onFocus={e => e.target.select()}
              title="Temperature change at bottom fiber"
            />
          </div>
          <div className="bar-props-hint">
            Top hotter than bottom causes downward bending
          </div>
        </>
      )}
    </>
  );

  const formatUC = (uc: number) => uc.toFixed(3);

  const renderEN1993Tab = () => (
    <>
      {/* Steel grade selector */}
      <div className="bar-props-section-title">Steel Grade</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Grade</span>
        <select
          className="bar-props-select"
          value={steelGradeName}
          onChange={e => setSteelGradeName(e.target.value)}
        >
          {STEEL_GRADES.map(g => (
            <option key={g.name} value={g.name}>{g.name}</option>
          ))}
        </select>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">f<sub>y</sub></span>
        <span className="bar-props-value">{convertStress(selectedGrade.fy * 1e6).toFixed(stressUnit === 'Pa' ? 0 : stressUnit === 'kPa' ? 0 : 0)} {stressUnit}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">f<sub>u</sub></span>
        <span className="bar-props-value">{convertStress(selectedGrade.fu * 1e6).toFixed(stressUnit === 'Pa' ? 0 : stressUnit === 'kPa' ? 0 : 0)} {stressUnit}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;<sub>M0</sub></span>
        <span className="bar-props-value">{selectedGrade.gammaM0.toFixed(2)}</span>
      </div>
      <div className="bar-props-row">
        <span className="bar-props-label">&gamma;<sub>M1</sub></span>
        <span className="bar-props-value">{selectedGrade.gammaM1.toFixed(2)}</span>
      </div>

      {/* Cross-section classification */}
      <div className="bar-props-section-title">Cross-Section Classification</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Class</span>
        <span className={`bar-props-value bar-props-class bar-props-class-${crossSectionClass}`}>
          Class {crossSectionClass}
        </span>
      </div>

      {/* Buckling lengths */}
      <div className="bar-props-section-title">Buckling Length</div>
      <div className="bar-props-input-row">
        <span>Lcr,y (m)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={lcrY}
          onChange={e => setLcrY(e.target.value)}
        />
      </div>
      <div className="bar-props-input-row">
        <span>Lcr,z (m)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={lcrZ}
          onChange={e => setLcrZ(e.target.value)}
        />
      </div>

      {/* Lateral Bracing */}
      <div className="bar-props-section-title">Kipsteunen (Lateral Bracing)</div>
      <div className="bar-props-bracing-row">
        <span className="bar-props-label">Bovenzijde (Top)</span>
        <div className="bar-props-bracing-chips">
          {bracingTop.map((pos, i) => (
            <span
              key={i}
              className="bar-props-bracing-chip"
              title="Click to remove"
              onClick={() => setBracingTop(bracingTop.filter((_, j) => j !== i))}
            >
              {Math.round(pos * 100)}%
            </span>
          ))}
          <input
            type="number"
            className="bar-props-bracing-input"
            placeholder="%"
            min="0"
            max="100"
            value={newBracingTop}
            onChange={e => setNewBracingTop(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = parseFloat(newBracingTop);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                  const frac = val / 100;
                  if (!bracingTop.some(p => Math.abs(p - frac) < 0.001)) {
                    setBracingTop([...bracingTop, frac].sort((a, b) => a - b));
                  }
                  setNewBracingTop('');
                }
              }
            }}
          />
          <button
            className="bar-props-btn-small"
            onClick={() => {
              const val = parseFloat(newBracingTop);
              if (!isNaN(val) && val >= 0 && val <= 100) {
                const frac = val / 100;
                if (!bracingTop.some(p => Math.abs(p - frac) < 0.001)) {
                  setBracingTop([...bracingTop, frac].sort((a, b) => a - b));
                }
                setNewBracingTop('');
              }
            }}
          >+</button>
        </div>
      </div>
      <div className="bar-props-bracing-row">
        <span className="bar-props-label">Onderzijde (Bottom)</span>
        <div className="bar-props-bracing-chips">
          {bracingBottom.map((pos, i) => (
            <span
              key={i}
              className="bar-props-bracing-chip"
              title="Click to remove"
              onClick={() => setBracingBottom(bracingBottom.filter((_, j) => j !== i))}
            >
              {Math.round(pos * 100)}%
            </span>
          ))}
          <input
            type="number"
            className="bar-props-bracing-input"
            placeholder="%"
            min="0"
            max="100"
            value={newBracingBottom}
            onChange={e => setNewBracingBottom(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = parseFloat(newBracingBottom);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                  const frac = val / 100;
                  if (!bracingBottom.some(p => Math.abs(p - frac) < 0.001)) {
                    setBracingBottom([...bracingBottom, frac].sort((a, b) => a - b));
                  }
                  setNewBracingBottom('');
                }
              }
            }}
          />
          <button
            className="bar-props-btn-small"
            onClick={() => {
              const val = parseFloat(newBracingBottom);
              if (!isNaN(val) && val >= 0 && val <= 100) {
                const frac = val / 100;
                if (!bracingBottom.some(p => Math.abs(p - frac) < 0.001)) {
                  setBracingBottom([...bracingBottom, frac].sort((a, b) => a - b));
                }
                setNewBracingBottom('');
              }
            }}
          >+</button>
        </div>
      </div>

      {/* Deflection Limit */}
      <div className="bar-props-section-title">SLS - Doorbuiging</div>
      <div className="bar-props-row">
        <span className="bar-props-label">Max doorbuiging</span>
        <select
          className="bar-props-select"
          value={deflectionLimit}
          onChange={e => setDeflectionLimit(e.target.value as typeof deflectionLimit)}
        >
          <option value="L/500">L/500 (0.002L)</option>
          <option value="L/333">L/333 (0.003L)</option>
          <option value="L/250">L/250 (0.004L)</option>
        </select>
      </div>

      {/* Camber */}
      <div className="bar-props-input-row">
        <span>Pre-camber (mm)</span>
        <input
          type="number"
          min="0"
          step="1"
          value={camberMm}
          onChange={e => setCamberMm(e.target.value)}
          title="Voorwaartse bomming om doorbuiging te compenseren"
        />
      </div>
      <div className="bar-props-hint">
        Voorwaartse bomming om doorbuiging te compenseren
      </div>

      {/* Unity Checks */}
      <div className="bar-props-section-title">Unity Checks (NEN-EN 1993-1-1)</div>
      {!steelCheck ? (
        <div className="bar-props-no-results">
          No analysis results available. Run the solver first.
        </div>
      ) : (
        <>
          <div className={`bar-props-status ${steelCheck.status === 'OK' ? 'pass' : 'fail'}`}>
            {steelCheck.status === 'OK' ? 'PASS' : 'FAIL'} — UC max = {formatUC(steelCheck.UC_max)}
            <span className="bar-props-status-governing">
              ({steelCheck.governingCheck}
              {steelCheck.governingLocation && (
                <> @ x={(steelCheck.governingLocation.position * 1000).toFixed(0)}mm</>
              )})
            </span>
          </div>

          <table className="bar-props-uc-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Ed</th>
                <th>Rd</th>
                <th>UC</th>
              </tr>
            </thead>
            <tbody>
              <tr className={steelCheck.UC_M > 1 ? 'uc-fail' : ''}>
                <td>Bending (M)</td>
                <td>{convertMoment(steelCheck.MEd).toFixed(2)} {momentUnit}</td>
                <td>{convertMoment(steelCheck.McRd).toFixed(2)} {momentUnit}</td>
                <td className="uc-value">{formatUC(steelCheck.UC_M)}</td>
              </tr>
              <tr className={steelCheck.UC_V > 1 ? 'uc-fail' : ''}>
                <td>Shear (V)</td>
                <td>{convertForce(steelCheck.VEd).toFixed(2)} {forceUnit}</td>
                <td>{convertForce(steelCheck.VcRd).toFixed(2)} {forceUnit}</td>
                <td className="uc-value">{formatUC(steelCheck.UC_V)}</td>
              </tr>
              <tr className={steelCheck.UC_N > 1 ? 'uc-fail' : ''}>
                <td>Normal (N)</td>
                <td>{convertForce(steelCheck.NEd).toFixed(2)} {forceUnit}</td>
                <td>{convertForce(steelCheck.NcRd).toFixed(2)} {forceUnit}</td>
                <td className="uc-value">{formatUC(steelCheck.UC_N)}</td>
              </tr>
              <tr className={steelCheck.UC_MN > 1 ? 'uc-fail' : ''}>
                <td>M+N (6.2.8)</td>
                <td></td>
                <td></td>
                <td className="uc-value">{formatUC(steelCheck.UC_MN)}</td>
              </tr>
              <tr className={steelCheck.UC_MV > 1 ? 'uc-fail' : ''}>
                <td>M+V (6.2.10)</td>
                <td></td>
                <td></td>
                <td className="uc-value">{formatUC(steelCheck.UC_MV)}</td>
              </tr>
            </tbody>
          </table>

          {/* Detailed report button */}
          <button
            className="bar-props-change-btn"
            style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}
            onClick={() => setShowReport(true)}
          >
            Detailed Report (with formulas)...
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="bar-props-overlay" onClick={onClose}>
      <div className="bar-props-dialog bar-props-dialog-tabbed" onClick={e => e.stopPropagation()}>
        <div className="bar-props-header">Bar Properties</div>
        <div className="bar-props-tabs">
          <button
            className={`bar-props-tab ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button
            className={`bar-props-tab ${activeTab === 'en1993' ? 'active' : ''}`}
            onClick={() => setActiveTab('en1993')}
          >
            NEN-EN 1993-1
          </button>
        </div>
        <div className="bar-props-body bar-props-body-scrollable">
          {activeTab === 'properties' && renderPropertiesTab()}
          {activeTab === 'en1993' && renderEN1993Tab()}
        </div>
        <div className="bar-props-footer">
          <button className="bar-props-btn cancel" onClick={onClose}>Cancel</button>
          <button className="bar-props-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
      {showReport && (
        <SteelCheckReport
          initialBeamId={beam.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
