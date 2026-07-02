/**
 * InsightsView — inspectie-panel voor systeem-K + element-K + DOF mapping.
 * Wordt getoond als activeView === "insights".
 */
import { useState, useMemo } from "react";
import { buildMatricesOnly, type ExposedBeamCache } from "../fem/solver/solver";
import type { Node, Beam, Support } from "../fem/femTypes";
import "./InsightsView.css";

interface Props {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  /** Controlled initial view-mode — when set, overrides the internal default. */
  initialMode?: "element" | "system" | "dof" | "logs" | "errors";
  /** Solver error text from App (so Errors tab can show it). */
  solverError?: string | null;
}

const FMT = (v: number) => {
  if (Math.abs(v) < 1e-9) return "0";
  if (Math.abs(v) > 1e6 || Math.abs(v) < 1e-3) return v.toExponential(2);
  return v.toFixed(2);
};

/** Render a 2D number-matrix as a compact monospace table. */
function MatrixTable({ M, rowLabels, colLabels, max = 60 }:
  { M: number[][]; rowLabels?: string[]; colLabels?: string[]; max?: number }) {
  if (M.length === 0 || M[0].length === 0) return <div className="insights-empty">— leeg —</div>;
  const rows = Math.min(M.length, max);
  const cols = Math.min(M[0].length, max);
  const truncated = rows < M.length || cols < M[0].length;
  return (
    <div className="insights-matrix-wrap">
      <table className="insights-matrix">
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, j) => (
              <th key={j}>{colLabels?.[j] ?? j}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <th>{rowLabels?.[i] ?? i}</th>
              {Array.from({ length: cols }, (_, j) => {
                const v = M[i][j];
                const cls = v === 0 ? "zero" : Math.abs(v) > 1e8 ? "huge" : "";
                return <td key={j} className={cls}>{FMT(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="insights-truncated">
          Matrix is {M.length}×{M[0].length}, eerste {rows}×{cols} getoond. Gebruik Export CSV voor volledig.
        </div>
      )}
    </div>
  );
}

type ViewMode = "element" | "system" | "dof" | "logs" | "errors";

export default function InsightsView({ nodes, beams, supports, initialMode, solverError }: Props) {
  const [mode, setMode] = useState<ViewMode>(initialMode ?? "element");
  // Sync mode when parent passes a new initialMode (= user clicked a different
  // ribbon-button while panel is already open).
  useMemo(() => { if (initialMode && initialMode !== mode) setMode(initialMode); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [initialMode]);
  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(beams[0]?.id ?? null);

  const asm = useMemo(() => {
    try {
      return buildMatricesOnly({ nodes, beams, supports });
    } catch (e) {
      return { error: (e as Error).message } as { error: string };
    }
  }, [nodes, beams, supports]);

  if ("error" in asm) {
    return (
      <div className="insights-view">
        <div className="insights-header">
          <h2>Inzicht — assembly fout</h2>
        </div>
        <div className="insights-empty">{asm.error}</div>
      </div>
    );
  }

  const beamLabels = (k: number) => {
    // For element K: row/col labels = uX1, uZ1, ry1, uX2, uZ2, ry2
    const names = ["u_x1", "u_z1", "ry_1", "u_x2", "u_z2", "ry_2"];
    return names[k] ?? `${k}`;
  };

  const sysLabels = (i: number) => {
    // For system K: label per node + DOF — find which node owns this index
    const k = Math.floor(i / 3);
    const off = i % 3;
    const tags = ["ux", "uz", "ry"];
    const entry = Array.from(asm.nodeIndex.entries()).find(([, idx]) => idx === k);
    const nodeId = entry?.[0] ?? "?";
    return `n${nodeId}.${tags[off]}`;
  };

  const constrainedDofs = new Set(asm.rigidConstraints.map(r => r.dof));
  const springDofs = new Map(asm.springs.map(s => [s.dof, s.k]));

  const selectedBeam: ExposedBeamCache | undefined = asm.beams.find(b => b.id === selectedBeamId);

  return (
    <div className="insights-view">
      <div className="insights-header">
        <h2>Inzicht — Stijfheidsmatrices</h2>
        <div className="insights-meta">
          {nodes.length} knopen · {beams.length} balken · {asm.nDof} DOF's · {constrainedDofs.size} constrained · {asm.springs.length} springs
        </div>
      </div>

      <div className="insights-tabs">
        <button className={`insights-tab${mode === "element" ? " active" : ""}`} onClick={() => setMode("element")}>
          Element K
        </button>
        <button className={`insights-tab${mode === "system" ? " active" : ""}`} onClick={() => setMode("system")}>
          Systeem K
        </button>
        <button className={`insights-tab${mode === "dof" ? " active" : ""}`} onClick={() => setMode("dof")}>
          DOF mapping
        </button>
        <button className={`insights-tab${mode === "logs" ? " active" : ""}`} onClick={() => setMode("logs")}>
          Logs
        </button>
        <button className={`insights-tab${mode === "errors" ? " active" : ""}`} onClick={() => setMode("errors")}>
          Errors
        </button>
      </div>

      <div className="insights-body">
        {mode === "element" && (
          <>
            <div className="insights-controls">
              <label>
                Balk:
                <select value={selectedBeamId ?? ""} onChange={e => setSelectedBeamId(+e.target.value)}>
                  {asm.beams.map(b => (
                    <option key={b.id} value={b.id}>Balk {b.id} (knopen {beams.find(bb => bb.id === b.id)?.from}-{beams.find(bb => bb.id === b.id)?.to})</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedBeam ? (
              <>
                <div className="insights-section">
                  <h3>Geometrie + materiaal</h3>
                  <div className="insights-props">
                    <span>L = <code>{selectedBeam.L.toFixed(1)} mm</code></span>
                    <span>c = <code>{selectedBeam.c.toFixed(4)}</code></span>
                    <span>s = <code>{selectedBeam.s.toFixed(4)}</code></span>
                    <span>E = <code>{selectedBeam.E} N/mm²</code></span>
                    <span>A = <code>{selectedBeam.A} mm²</code></span>
                  </div>
                </div>
                <div className="insights-section">
                  <h3>Lokale stijfheidsmatrix k_local (6×6) — Euler-Bernoulli + axiaal</h3>
                  <div className="insights-formulas">
                    <p>EA/L = <code>{FMT(selectedBeam.E * selectedBeam.A / selectedBeam.L)}</code>{" · "}
                       12EI/L³ = <code>{FMT(12 * selectedBeam.E * 1.673e7 / Math.pow(selectedBeam.L, 3))}</code>{" · "}
                       4EI/L = <code>{FMT(4 * selectedBeam.E * 1.673e7 / selectedBeam.L)}</code></p>
                  </div>
                  <MatrixTable M={selectedBeam.kLocal} rowLabels={Array.from({length: 6}, (_, k) => beamLabels(k))} colLabels={Array.from({length: 6}, (_, k) => beamLabels(k))} />
                </div>
                <div className="insights-section">
                  <h3>Transformatie T (6×6) — global → local</h3>
                  <MatrixTable M={selectedBeam.T} />
                </div>
              </>
            ) : (
              <div className="insights-empty">Geen balk geselecteerd</div>
            )}
          </>
        )}

        {mode === "system" && (
          <>
            <div className="insights-section">
              <h3>Systeem K ({asm.nDof}×{asm.nDof}) — globale geassembleerde stijfheidsmatrix</h3>
              <div className="insights-props">
                <span>DOF's: <code>{asm.nDof}</code></span>
                <span>Rigid constrained: <code>{constrainedDofs.size}</code></span>
                <span>Spring DOF's: <code>{asm.springs.length}</code></span>
                <span>Symmetrie check: <code>{checkSymmetric(asm.K) ? "OK" : "ASYMMETRIC"}</code></span>
              </div>
              <MatrixTable
                M={asm.K}
                rowLabels={Array.from({length: asm.nDof}, (_, i) => sysLabels(i))}
                colLabels={Array.from({length: asm.nDof}, (_, i) => sysLabels(i))}
              />
            </div>
          </>
        )}

        {mode === "dof" && (
          <div className="insights-section">
            <h3>DOF mapping ({asm.nDof} totaal)</h3>
            <table className="insights-doftable">
              <thead>
                <tr><th>DOF #</th><th>Knoop</th><th>Component</th><th>Constraint</th><th>Spring k</th></tr>
              </thead>
              <tbody>
                {Array.from({length: asm.nDof}, (_, i) => {
                  const k = Math.floor(i / 3);
                  const off = i % 3;
                  const tag = ["ux", "uz", "ry"][off];
                  const entry = Array.from(asm.nodeIndex.entries()).find(([, idx]) => idx === k);
                  const nodeId = entry?.[0] ?? "?";
                  const isConstrained = constrainedDofs.has(i);
                  const springK = springDofs.get(i);
                  return (
                    <tr key={i} className={isConstrained ? "constrained" : springK !== undefined ? "spring" : "free"}>
                      <td>{i}</td>
                      <td>n{nodeId}</td>
                      <td>{tag}</td>
                      <td>{isConstrained ? "rigid" : springK !== undefined ? "—" : "free"}</td>
                      <td>{springK !== undefined ? `${springK.toExponential(2)} N/mm` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mode === "logs" && (
          <div className="insights-section">
            <h3>Solver log</h3>
            <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre", padding: 8 }}>
{`[OK]  Mesh built: ${nodes.length} knopen, ${beams.length} balken
[OK]  DOFs: ${asm.nDof} (${asm.springs.length} spring DOFs)
[OK]  Stiffness matrix assembled (${asm.K.length}×${asm.K[0]?.length ?? 0})
[OK]  Constraints applied: ${constrainedDofs.size} rigid
[--]  Solver log streaming not yet wired — values above reflect the last
      buildMatricesOnly call. For full step-by-step iteration history,
      run with debug: true (komt in volgende sessie).`}
            </div>
          </div>
        )}

        {mode === "errors" && (
          <div className="insights-section">
            <h3>Solver errors</h3>
            {solverError ? (
              <div style={{ padding: 12, color: "#dc2626", background: "rgba(220,38,38,0.08)", borderRadius: 4, fontSize: 13 }}>
                <strong>Laatste fout:</strong>
                <pre style={{ marginTop: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>{solverError}</pre>
              </div>
            ) : (
              <div style={{ padding: 12, color: "var(--theme-text-faint)", fontSize: 13 }}>
                ✓ Geen actieve solver-fouten. Een eerdere succesvolle run staat in de Logs-tab.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function checkSymmetric(K: number[][], tol = 1e-6): boolean {
  for (let i = 0; i < K.length; i++) {
    for (let j = i + 1; j < K[i].length; j++) {
      if (Math.abs(K[i][j] - K[j][i]) > tol) return false;
    }
  }
  return true;
}
