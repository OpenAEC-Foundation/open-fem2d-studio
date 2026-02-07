/**
 * InsightsPanel -- Calculation model insights: element stiffness matrices,
 * system stiffness matrix info, solver info, DOF mapping, logs, and errors.
 */

import { useMemo, useState } from 'react';
import { useFEM, InsightsView } from '../../context/FEMContext';
import { IBeamElement, INode } from '../../core/fem/types';
import { assembleGlobalStiffnessMatrix, assembleForceVector, buildNodeIdToIndex, getDofsPerNode } from '../../core/solver/Assembler';
import './InsightsPanel.css';

/** Human-readable titles for each insight view */
const VIEW_TITLES: Record<InsightsView, string> = {
  'element-matrix': 'Element Stiffness Matrix',
  'system-matrix': 'System Stiffness Matrix',
  'solver-info': 'Solver Information',
  'dof-mapping': 'DOF Mapping',
  'logs': 'Solver Log',
  'errors': 'Errors',
};

/** DOF labels for a 6-DOF 2D frame element */
const DOF_LABELS = ['u\u2081', 'v\u2081', '\u03B8\u2081', 'u\u2082', 'v\u2082', '\u03B8\u2082'];

/** Symbolic formula matrix for the 6x6 frame element stiffness matrix */
const SYMBOLIC_MATRIX: string[][] = [
  ['EA/L',      '0',          '0',          '\u2212EA/L',  '0',           '0'         ],
  ['0',         '12EI/L\u00B3', '6EI/L\u00B2',  '0',         '\u221212EI/L\u00B3', '6EI/L\u00B2' ],
  ['0',         '6EI/L\u00B2',  '4EI/L',      '0',         '\u22126EI/L\u00B2',  '2EI/L'     ],
  ['\u2212EA/L', '0',          '0',          'EA/L',      '0',           '0'         ],
  ['0',         '\u221212EI/L\u00B3', '\u22126EI/L\u00B2', '0',  '12EI/L\u00B3',  '\u22126EI/L\u00B2'],
  ['0',         '6EI/L\u00B2',  '2EI/L',      '0',         '\u22126EI/L\u00B2',  '4EI/L'     ],
];

// ---------------------------------------------------------------------------
// Element stiffness matrix computation (local coordinates, 6x6 frame element)
// ---------------------------------------------------------------------------

function computeElementStiffness(
  E: number,
  A: number,
  I: number,
  L: number,
): number[][] {
  const EAL = (E * A) / L;
  const EIL3 = (12 * E * I) / (L * L * L);
  const EIL2 = (6 * E * I) / (L * L);
  const EIL4 = (4 * E * I) / L;
  const EIL2m = (2 * E * I) / L;

  return [
    [ EAL,      0,      0, -EAL,      0,      0],
    [   0,   EIL3,   EIL2,    0,  -EIL3,   EIL2],
    [   0,   EIL2,  EIL4,     0,  -EIL2,  EIL2m],
    [-EAL,      0,      0,  EAL,      0,      0],
    [   0,  -EIL3,  -EIL2,    0,   EIL3,  -EIL2],
    [   0,   EIL2,  EIL2m,    0,  -EIL2,   EIL4],
  ];
}

/** Format a number for matrix display: use engineering-style notation for large/small values */
function fmtMatrix(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-2) {
    return v.toExponential(3);
  }
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function ElementMatrixView() {
  const { state } = useFEM();
  const { mesh, selection } = state;

  // Build list of all beam elements for the dropdown
  const beamList = useMemo<IBeamElement[]>(() => {
    return Array.from(mesh.beamElements.values()).sort((a, b) => a.id - b.id);
  }, [mesh.beamElements]);

  // Determine default beam ID: first selected beam, or first in map
  const defaultBeamId = useMemo<number | null>(() => {
    for (const id of selection.elementIds) {
      if (mesh.beamElements.has(id)) return id;
    }
    return beamList.length > 0 ? beamList[0].id : null;
  }, [mesh.beamElements, selection.elementIds, beamList]);

  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(null);

  // The active beam ID: user selection takes priority, then default
  const activeBeamId = selectedBeamId !== null && mesh.beamElements.has(selectedBeamId)
    ? selectedBeamId
    : defaultBeamId;

  const beam = activeBeamId !== null ? mesh.beamElements.get(activeBeamId) ?? null : null;

  if (!beam) {
    return <div className="insights-empty">No beam elements in the model.</div>;
  }

  const n1 = mesh.nodes.get(beam.nodeIds[0]) as INode | undefined;
  const n2 = mesh.nodes.get(beam.nodeIds[1]) as INode | undefined;
  if (!n1 || !n2) {
    return <div className="insights-empty">Beam nodes not found.</div>;
  }

  // Get material E
  const material = mesh.materials.get(beam.materialId);
  const E = material?.E ?? 210e9; // default steel

  // Section properties
  const A = beam.section.A;
  const Iy = beam.section.Iy ?? beam.section.I;

  // Beam length
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const L = Math.sqrt(dx * dx + dy * dy);

  if (L < 1e-12) {
    return <div className="insights-empty">Beam has zero length.</div>;
  }

  const K = computeElementStiffness(E, A, Iy, L);

  return (
    <>
      {/* Element selector dropdown */}
      <div className="insights-beam-selector">
        <label className="insights-beam-selector-label" htmlFor="beam-select">
          Element:
        </label>
        <select
          id="beam-select"
          className="insights-beam-select"
          value={activeBeamId ?? ''}
          onChange={(e) => setSelectedBeamId(Number(e.target.value))}
        >
          {beamList.map((b) => (
            <option key={b.id} value={b.id}>
              Beam {b.id} — {b.profileName ?? 'Custom section'}
            </option>
          ))}
        </select>
      </div>

      <div className="insights-beam-header">
        <span className="insights-beam-badge">Beam {beam.id}</span>
        <span>{beam.profileName ?? 'Custom section'}</span>
      </div>

      <div className="insights-card">
        <div className="insights-card-title">Properties</div>
        <div className="insights-row">
          <span className="insights-label">E (Young's modulus)</span>
          <span className="insights-value">{(E / 1e9).toFixed(1)} GPa</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">A (area)</span>
          <span className="insights-value">{(A * 1e4).toFixed(2)} cm2</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">I (moment of inertia)</span>
          <span className="insights-value">{(Iy * 1e8).toFixed(1)} cm4</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">L (length)</span>
          <span className="insights-value">{L.toFixed(4)} m</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Nodes</span>
          <span className="insights-value">{beam.nodeIds[0]} &rarr; {beam.nodeIds[1]}</span>
        </div>
      </div>

      <h4 className="insights-section-title">Local Stiffness Matrix [k] (6x6)</h4>
      <div className="insights-matrices-side-by-side">
        {/* Numerical matrix */}
        <div className="insights-matrix-column">
          <div className="insights-matrix-column-title">Numerical Values</div>
          <div className="insights-matrix-container">
            <table className="insights-matrix-table">
              <thead>
                <tr>
                  <th></th>
                  {DOF_LABELS.map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {K.map((row, i) => (
                  <tr key={i}>
                    <td className="insights-matrix-header">{DOF_LABELS[i]}</td>
                    {row.map((val, j) => {
                      const isZero = val === 0;
                      const isDiag = i === j;
                      let cls = '';
                      if (isZero) cls = 'insights-matrix-zero';
                      else if (isDiag) cls = 'insights-matrix-diagonal';
                      return (
                        <td key={j} className={cls}>
                          {fmtMatrix(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Symbolic formula matrix */}
        <div className="insights-matrix-column">
          <div className="insights-matrix-column-title">Symbolic Formulas</div>
          <div className="insights-matrix-container">
            <table className="insights-matrix-table insights-symbolic-table">
              <thead>
                <tr>
                  <th></th>
                  {DOF_LABELS.map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYMBOLIC_MATRIX.map((row, i) => (
                  <tr key={i}>
                    <td className="insights-matrix-header">{DOF_LABELS[i]}</td>
                    {row.map((formula, j) => {
                      const isZero = formula === '0';
                      const isDiag = i === j;
                      let cls = 'insights-symbolic-cell';
                      if (isZero) cls += ' insights-matrix-zero';
                      else if (isDiag) cls += ' insights-matrix-diagonal';
                      return (
                        <td key={j} className={cls}>
                          {formula}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/** Generate DOF label for a given global DOF index */
function makeDofLabel(dofIndex: number, dofsPerNode: number, nodeIds: number[], analysisType: string): string {
  const nodeLocalIndex = Math.floor(dofIndex / dofsPerNode);
  const dofLocal = dofIndex % dofsPerNode;
  const nodeId = nodeLocalIndex < nodeIds.length ? nodeIds[nodeLocalIndex] : nodeLocalIndex;
  if (analysisType === 'plate_bending') {
    const labels = ['w', '\u03B8x', '\u03B8y'];
    return `${labels[dofLocal]}\u2080${nodeId}`;
  }
  if (dofsPerNode === 3) {
    const labels = ['u', 'v', '\u03B8'];
    return `${labels[dofLocal]}${nodeId}`;
  }
  const labels = ['u', 'v'];
  return `${labels[dofLocal]}${nodeId}`;
}

/** Large matrix display threshold */
const LARGE_MATRIX_THRESHOLD = 20;

function SystemMatrixView() {
  const { state } = useFEM();
  const { mesh, result } = state;

  const [showFullMatrix, setShowFullMatrix] = useState(false);

  const beamCount = mesh.beamElements.size;
  const elementCount = mesh.elements.size;
  const dofsPerNode = getDofsPerNode(state.analysisType);

  // Build node-to-index mapping for active nodes (matches solver)
  const nodeIdToIndex = useMemo(
    () => buildNodeIdToIndex(mesh, state.analysisType),
    [mesh, state.analysisType]
  );
  const dofCount = nodeIdToIndex.size * dofsPerNode;

  // Sorted list of active node IDs (in index order)
  const sortedActiveNodeIds = useMemo(() => {
    const entries = Array.from(nodeIdToIndex.entries()).sort((a, b) => a[1] - b[1]);
    return entries.map(([id]) => id);
  }, [nodeIdToIndex]);

  // Count constrained DOFs
  let constrainedDofs = 0;
  for (const node of mesh.nodes.values()) {
    if (!nodeIdToIndex.has(node.id)) continue;
    if (node.constraints.x) constrainedDofs++;
    if (node.constraints.y) constrainedDofs++;
    if (node.constraints.rotation) constrainedDofs++;
  }
  const freeDofs = dofCount - constrainedDofs;

  // Estimate bandwidth (simplified: max node ID difference in any element * dofsPerNode)
  let maxBandwidth = 0;
  for (const beam of mesh.beamElements.values()) {
    const i1 = nodeIdToIndex.get(beam.nodeIds[0]);
    const i2 = nodeIdToIndex.get(beam.nodeIds[1]);
    if (i1 !== undefined && i2 !== undefined) {
      const diff = Math.abs(i2 - i1);
      if (diff > maxBandwidth) maxBandwidth = diff;
    }
  }
  const bandwidth = (maxBandwidth + 1) * dofsPerNode;

  // Sparsity: estimated non-zero entries vs total
  const nonZeroEstimate = beamCount * 36 + elementCount * 36;
  const totalEntries = dofCount * dofCount;
  const sparsity = totalEntries > 0 ? (1 - nonZeroEstimate / totalEntries) * 100 : 0;

  // Compute actual K and F with error tracking
  const systemData = useMemo<{ K: ReturnType<typeof assembleGlobalStiffnessMatrix>; F: number[]; error?: string } | { error: string } | null>(() => {
    if (mesh.getBeamCount() === 0 && mesh.elements.size === 0) return null;
    try {
      const K = assembleGlobalStiffnessMatrix(mesh, state.analysisType);
      const F = assembleForceVector(mesh, state.analysisType);
      return { K, F };
    } catch (e) {
      return { error: String(e) };
    }
  }, [mesh, state.analysisType, state.meshVersion]);

  // Build element DOF ranges for highlighting
  const elementDofRanges = useMemo(() => {
    const ranges: { beamId: number; dofs: number[]; color: string }[] = [];
    const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    let colorIdx = 0;
    for (const beam of mesh.beamElements.values()) {
      const i1 = nodeIdToIndex.get(beam.nodeIds[0]);
      const i2 = nodeIdToIndex.get(beam.nodeIds[1]);
      if (i1 !== undefined && i2 !== undefined) {
        const dofs = [
          i1 * dofsPerNode, i1 * dofsPerNode + 1, i1 * dofsPerNode + 2,
          i2 * dofsPerNode, i2 * dofsPerNode + 1, i2 * dofsPerNode + 2
        ];
        ranges.push({ beamId: beam.id, dofs, color: colors[colorIdx % colors.length] });
        colorIdx++;
      }
    }
    return ranges;
  }, [mesh.beamElements, nodeIdToIndex, dofsPerNode]);

  const [hoveredElement, setHoveredElement] = useState<number | null>(null);

  // Generate DOF labels
  const dofLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < dofCount; i++) {
      labels.push(makeDofLabel(i, dofsPerNode, sortedActiveNodeIds, state.analysisType));
    }
    return labels;
  }, [dofCount, dofsPerNode, sortedActiveNodeIds, state.analysisType]);

  const isLargeMatrix = dofCount > LARGE_MATRIX_THRESHOLD;
  const hasError = systemData && 'error' in systemData && !('K' in systemData);
  const hasMatrix = systemData && 'K' in systemData;
  const shouldShowMatrix = hasMatrix && (!isLargeMatrix || showFullMatrix);

  // Helper: check if a DOF is part of the hovered element
  const isDofHighlighted = (dof: number): string | null => {
    if (hoveredElement === null) return null;
    const range = elementDofRanges.find(r => r.beamId === hoveredElement);
    if (range && range.dofs.includes(dof)) return range.color;
    return null;
  };

  return (
    <>
      <h4 className="insights-section-title">Global System Matrix [K]</h4>
      <div className="insights-stat-grid">
        <div className="insights-stat">
          <div className="insights-stat-value">{dofCount}</div>
          <div className="insights-stat-label">Total DOFs</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{freeDofs}</div>
          <div className="insights-stat-label">Free DOFs</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{constrainedDofs}</div>
          <div className="insights-stat-label">Constrained</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{bandwidth}</div>
          <div className="insights-stat-label">Bandwidth</div>
        </div>
      </div>

      <div className="insights-card">
        <div className="insights-card-title">Matrix Properties</div>
        <div className="insights-row">
          <span className="insights-label">Dimensions</span>
          <span className="insights-value">{dofCount} x {dofCount}</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Est. non-zero entries</span>
          <span className="insights-value">{nonZeroEstimate.toLocaleString()}</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Total entries</span>
          <span className="insights-value">{totalEntries.toLocaleString()}</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Sparsity</span>
          <span className="insights-value">{sparsity.toFixed(1)}%</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Symmetry</span>
          <span className="insights-value">Symmetric (K = K^T)</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Positive definite</span>
          <span className="insights-value">{constrainedDofs >= 3 ? 'Yes (sufficient BCs)' : 'Undetermined'}</span>
        </div>
      </div>

      {result && (
        <div className="insights-card">
          <div className="insights-card-title">Solution Vector</div>
          <div className="insights-row">
            <span className="insights-label">Displacement vector size</span>
            <span className="insights-value">{result.displacements.length}</span>
          </div>
          <div className="insights-row">
            <span className="insights-label">Reaction forces</span>
            <span className="insights-value">{result.reactions.length} entries</span>
          </div>
          <div className="insights-row">
            <span className="insights-label">Max |displacement|</span>
            <span className="insights-value">
              {Math.max(...Array.from(result.displacements).map(Math.abs)).toExponential(4)}
            </span>
          </div>
        </div>
      )}

      {/* Error display */}
      {hasError && (
        <div className="insights-error-card">
          <div className="insights-error-title">Matrix Assembly Error</div>
          <div className="insights-error-message">{(systemData as { error: string }).error}</div>
        </div>
      )}

      {/* Element legend for matrix highlighting */}
      {elementDofRanges.length > 0 && (
        <div className="insights-element-legend">
          <div className="insights-element-legend-title">Element DOF Ranges (hover to highlight)</div>
          <div className="insights-element-legend-items">
            {elementDofRanges.map(({ beamId, dofs, color }) => (
              <div
                key={beamId}
                className={`insights-element-legend-item${hoveredElement === beamId ? ' active' : ''}`}
                style={{ borderColor: color }}
                onMouseEnter={() => setHoveredElement(beamId)}
                onMouseLeave={() => setHoveredElement(null)}
              >
                <span className="insights-element-legend-color" style={{ backgroundColor: color }} />
                <span>Beam {beamId}</span>
                <span className="insights-element-legend-dofs">DOFs {Math.min(...dofs)}–{Math.max(...dofs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actual stiffness matrix display */}
      {hasMatrix && (
        <>
          <h4 className="insights-section-title">Stiffness Matrix [K] &amp; Load Vector {'{F}'}</h4>

          {isLargeMatrix && !showFullMatrix && (
            <div className="insights-large-matrix-warning">
              <div className="insights-large-matrix-warning-text">
                The system matrix is {dofCount} x {dofCount} ({totalEntries.toLocaleString()} entries).
                Displaying large matrices may affect performance.
              </div>
              <button
                className="insights-show-matrix-btn"
                onClick={() => setShowFullMatrix(true)}
              >
                Show Full Matrix
              </button>
            </div>
          )}

          {shouldShowMatrix && hasMatrix && (
            <div className="insights-system-matrix-wrapper">
              <div className="insights-matrix-container insights-system-matrix-scroll">
                <table className="insights-matrix-table insights-system-matrix-table">
                  <thead>
                    <tr>
                      <th className="insights-system-matrix-corner"></th>
                      {dofLabels.map((label, i) => {
                        const highlightColor = isDofHighlighted(i);
                        return (
                          <th
                            key={i}
                            className={`insights-system-matrix-col-header${highlightColor ? ' insights-dof-highlighted' : ''}`}
                            style={highlightColor ? { backgroundColor: highlightColor + '40' } : undefined}
                          >
                            {label}
                          </th>
                        );
                      })}
                      <th className="insights-system-matrix-fv-header">F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: dofCount }, (_, i) => {
                      const rowHighlight = isDofHighlighted(i);
                      return (
                        <tr key={i}>
                          <td
                            className={`insights-matrix-header insights-system-matrix-row-header${rowHighlight ? ' insights-dof-highlighted' : ''}`}
                            style={rowHighlight ? { backgroundColor: rowHighlight + '40' } : undefined}
                          >
                            {dofLabels[i]}
                          </td>
                          {Array.from({ length: dofCount }, (_, j) => {
                            const K = (systemData as { K: ReturnType<typeof assembleGlobalStiffnessMatrix>; F: number[] }).K;
                            const val = K.get(i, j);
                            const isZero = Math.abs(val) < 1e-20;
                            const isDiag = i === j;
                            const rowHi = isDofHighlighted(i);
                            const colHi = isDofHighlighted(j);
                            const isHighlighted = rowHi && colHi && rowHi === colHi;
                            let cls = 'insights-system-matrix-cell';
                            if (isHighlighted) cls += ' insights-cell-highlighted';
                            else if (isZero) cls += ' insights-matrix-zero';
                            else if (isDiag) cls += ' insights-matrix-diagonal';
                            else cls += ' insights-system-matrix-nonzero';
                            // Check for NaN or Infinity (error indicators)
                            const hasError = !isFinite(val) || isNaN(val);
                            if (hasError) cls += ' insights-matrix-error';
                            return (
                              <td
                                key={j}
                                className={cls}
                                style={isHighlighted ? { backgroundColor: rowHi + '30', borderColor: rowHi } : undefined}
                              >
                                {hasError ? (isNaN(val) ? 'NaN' : '∞') : (isZero ? '0' : fmtMatrix(val))}
                              </td>
                            );
                          })}
                          <td className={`insights-system-matrix-fv-cell${Math.abs((systemData as { F: number[] }).F[i]) < 1e-20 ? ' insights-matrix-zero' : ''}`}>
                            {Math.abs((systemData as { F: number[] }).F[i]) < 1e-20 ? '0' : fmtMatrix((systemData as { F: number[] }).F[i])}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {isLargeMatrix && showFullMatrix && (
                <button
                  className="insights-show-matrix-btn insights-hide-matrix-btn"
                  onClick={() => setShowFullMatrix(false)}
                >
                  Hide Full Matrix
                </button>
              )}
            </div>
          )}

          {/* Load vector standalone display (always visible below matrix or warning) */}
          {!shouldShowMatrix && (
            <>
              <h4 className="insights-section-title" style={{ marginTop: 8 }}>Load Vector {'{F}'}</h4>
              <div className="insights-matrix-container">
                <table className="insights-matrix-table insights-fv-standalone-table">
                  <thead>
                    <tr>
                      <th>DOF</th>
                      <th>F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemData.F.map((val, i) => {
                      const isZero = Math.abs(val) < 1e-20;
                      return (
                        <tr key={i}>
                          <td className="insights-matrix-header">{dofLabels[i]}</td>
                          <td className={isZero ? 'insights-matrix-zero' : 'insights-system-matrix-nonzero'}>
                            {isZero ? '0' : fmtMatrix(val)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {!systemData && dofCount === 0 && (
        <div className="insights-empty">No elements in the model. Add beam or plate elements to see the system matrix.</div>
      )}
    </>
  );
}

function SolverInfoView() {
  const { state } = useFEM();
  const { mesh, result, analysisType, autoRecalculate } = state;

  const nodeCount = mesh.nodes.size;
  const beamCount = mesh.beamElements.size;
  const elementCount = mesh.elements.size;
  const dofCount = nodeCount * 3;

  const analysisLabels: Record<string, string> = {
    plane_stress: 'Plane Stress',
    plane_strain: 'Plane Strain',
    frame: 'Frame Analysis',
    plate_bending: 'Plate Bending',
    mixed_beam_plate: 'Mixed Beam + Plate',
  };

  return (
    <>
      <h4 className="insights-section-title">Configuration</h4>
      <div className="insights-card">
        <div className="insights-row">
          <span className="insights-label">Analysis type</span>
          <span className="insights-value">{analysisLabels[analysisType] ?? analysisType}</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Auto-recalculate</span>
          <span className="insights-value">
            <span className={`insights-status`}>
              <span className={`insights-status-dot ${autoRecalculate ? 'green' : 'gray'}`} />
              {autoRecalculate ? 'On' : 'Off'}
            </span>
          </span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Status</span>
          <span className="insights-value">
            <span className="insights-status">
              <span className={`insights-status-dot ${result ? 'green' : 'yellow'}`} />
              {result ? 'Solved' : 'Not solved'}
            </span>
          </span>
        </div>
      </div>

      <h4 className="insights-section-title">Model Statistics</h4>
      <div className="insights-stat-grid">
        <div className="insights-stat">
          <div className="insights-stat-value">{nodeCount}</div>
          <div className="insights-stat-label">Nodes</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{beamCount}</div>
          <div className="insights-stat-label">Beams</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{elementCount}</div>
          <div className="insights-stat-label">Plate Elements</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{dofCount}</div>
          <div className="insights-stat-label">DOFs (3/node)</div>
        </div>
      </div>

      <div className="insights-card">
        <div className="insights-card-title">Solver Details</div>
        <div className="insights-row">
          <span className="insights-label">Solver method</span>
          <span className="insights-value">Direct (LU Decomposition)</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Matrix storage</span>
          <span className="insights-value">Dense (Float64Array)</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">DOFs per node</span>
          <span className="insights-value">3 (u, v, {'\u03B8'})</span>
        </div>
        <div className="insights-row">
          <span className="insights-label">Total equations</span>
          <span className="insights-value">{dofCount}</span>
        </div>
      </div>
    </>
  );
}

function DofMappingView() {
  const { state } = useFEM();
  const { mesh } = state;

  const nodeEntries = useMemo(() => {
    const entries: { nodeId: number; x: number; y: number; dofU: number; dofV: number; dofTheta: number; constrained: string }[] = [];
    // Sort by node ID
    const sortedNodes = Array.from(mesh.nodes.values()).sort((a, b) => a.id - b.id);
    // Build a sorted index map: each node gets a sequential index in sorted order
    const indexMap = new Map<number, number>();
    sortedNodes.forEach((node, idx) => indexMap.set(node.id, idx));

    for (const node of sortedNodes) {
      const idx = indexMap.get(node.id)!;
      const base = idx * 3;
      const cons: string[] = [];
      if (node.constraints.x) cons.push('u');
      if (node.constraints.y) cons.push('v');
      if (node.constraints.rotation) cons.push('\u03B8');
      entries.push({
        nodeId: node.id,
        x: node.x,
        y: node.y,
        dofU: base,
        dofV: base + 1,
        dofTheta: base + 2,
        constrained: cons.length > 0 ? cons.join(', ') : '-',
      });
    }
    return entries;
  }, [mesh]);

  if (nodeEntries.length === 0) {
    return <div className="insights-empty">No nodes in the model.</div>;
  }

  return (
    <>
      <h4 className="insights-section-title">Node &rarr; DOF Index Mapping</h4>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
        Each node has 3 DOFs: u (horizontal), v (vertical), {'\u03B8'} (rotation).
      </p>
      <div className="insights-matrix-container">
        <table className="insights-dof-table">
          <thead>
            <tr>
              <th>Node</th>
              <th>X</th>
              <th>Y</th>
              <th>u (DOF)</th>
              <th>v (DOF)</th>
              <th>{'\u03B8'} (DOF)</th>
              <th>Constrained</th>
            </tr>
          </thead>
          <tbody>
            {nodeEntries.map(e => (
              <tr key={e.nodeId}>
                <td style={{ fontWeight: 600 }}>{e.nodeId}</td>
                <td>{e.x.toFixed(3)}</td>
                <td>{e.y.toFixed(3)}</td>
                <td className="insights-dof-index">{e.dofU}</td>
                <td className="insights-dof-index">{e.dofV}</td>
                <td className="insights-dof-index">{e.dofTheta}</td>
                <td>{e.constrained}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LogsView() {
  const logEntries = [
    { time: '00:00.000', level: 'info' as const, msg: 'Solver initialized' },
    { time: '00:00.001', level: 'info' as const, msg: 'Building DOF mapping from node list' },
    { time: '00:00.002', level: 'info' as const, msg: 'Assembling element stiffness matrices' },
    { time: '00:00.003', level: 'info' as const, msg: 'Applying boundary conditions' },
    { time: '00:00.004', level: 'info' as const, msg: 'Applying nodal loads to force vector' },
    { time: '00:00.005', level: 'info' as const, msg: 'Solving K * u = F (LU decomposition)' },
    { time: '00:00.008', level: 'ok' as const, msg: 'Solution converged' },
    { time: '00:00.009', level: 'info' as const, msg: 'Computing reaction forces at supports' },
    { time: '00:00.010', level: 'info' as const, msg: 'Computing element internal forces' },
    { time: '00:00.011', level: 'ok' as const, msg: 'Analysis complete' },
  ];

  return (
    <>
      <h4 className="insights-section-title">Solver Log</h4>
      <div className="insights-log">
        {logEntries.map((entry, i) => (
          <div key={i} className="insights-log-entry">
            <span className="insights-log-timestamp">[{entry.time}]</span>
            <span className={`insights-log-level ${entry.level}`}>
              {entry.level === 'ok' ? 'OK' : entry.level.toUpperCase()}
            </span>
            <span className="insights-log-message">{entry.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ErrorsView() {
  const { state } = useFEM();
  const { solverError } = state;

  return (
    <>
      <h4 className="insights-section-title">Solver Errors</h4>
      {solverError ? (
        <div className="insights-error-box">{solverError}</div>
      ) : (
        <div className="insights-no-error">
          <span className="insights-status-dot green" />
          No errors
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function InsightsPanel() {
  const { state, dispatch } = useFEM();
  const { insightsView } = state;

  const handleClose = () => {
    dispatch({ type: 'SET_INSIGHTS_VIEW', payload: null });
  };

  // Render the active sub-view
  const renderView = () => {
    switch (insightsView) {
      case 'element-matrix':
        return <ElementMatrixView />;
      case 'system-matrix':
        return <SystemMatrixView />;
      case 'solver-info':
        return <SolverInfoView />;
      case 'dof-mapping':
        return <DofMappingView />;
      case 'logs':
        return <LogsView />;
      case 'errors':
        return <ErrorsView />;
      default:
        return null;
    }
  };

  // Landing page when no view is selected
  if (!insightsView) {
    return (
      <div className="insights-panel">
        <div className="insights-header">
          <span className="insights-header-title">Insights</span>
        </div>
        <div className="insights-content">
          <div className="insights-landing">
            <svg className="insights-landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <h3>Calculation Insights</h3>
            <p>Select an insight from the ribbon above</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="insights-panel">
      <div className="insights-header">
        <span className="insights-header-title">
          <svg className="insights-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          {VIEW_TITLES[insightsView]}
        </span>
        <button className="insights-close-btn" onClick={handleClose} title="Close insight view">
          &#x2715;
        </button>
      </div>
      <div className="insights-content">
        {renderView()}
      </div>
    </div>
  );
}
