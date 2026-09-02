/**
 * InsightsView — dashboard-inspectie voor de assembly: alles in één scherm.
 *
 * Indeling (grid):
 *   links   — klikbare stavenlijst (staafnr, knopen, profiel/materiaal)
 *   midden  — element-K (6×6) + transformatie T van de geselecteerde staaf
 *   groot   — systeem-K met rij/kolom-labels per knoop-DOF; de zes rijen en
 *             kolommen van de geselecteerde staaf worden gehighlight, met
 *             extra accent op de 6×6-kruispunten
 *   rechts  — DOF-mapping (knoop → DOF-indices, star/veer-markering)
 *   onderin — inklapbare strip met logboek en fouten
 *
 * De `initialMode`-prop blijft geaccepteerd (Ribbon-knoppen): element/system/dof
 * geven het bijbehorende paneel een korte focus-flits, logs/errors klappen de
 * onderste strip open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { buildMatricesOnly, type ExposedBeamCache } from "../fem/solver/solver";
import type { Node, Beam, Support } from "../fem/femTypes";
import "./InsightsView.css";

interface Props {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  /** Ribbon-keuze — bepaalt welk paneel focus/scroll krijgt (dashboard toont alles). */
  initialMode?: "element" | "system" | "dof" | "logs" | "errors";
  /** Solver-fouttekst uit App (getoond in de fouten-strip). */
  solverError?: string | null;
}

/** Verkorte notatie met NL-decimaalkomma, bv. 2,1e8 · 12,50 · 0. */
const fmtShort = (v: number): string => {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a < 1e-12) return "0";
  let s: string;
  if (a >= 1e5 || a < 1e-2) s = v.toExponential(1);
  else if (a >= 100) s = v.toFixed(0);
  else s = v.toFixed(2);
  return s.replace("e+", "e").replace(".", ",");
};

/** Volle waarde voor tooltips. */
const fmtFull = (v: number): string => (Number.isFinite(v) ? String(v) : "—");

/** DOF-labels voor de element-K van een 2D-raamwerkstaaf. */
const ELEMENT_DOF_LABELS = ["uX1", "uZ1", "φ1", "uX2", "uZ2", "φ2"];
const DOF_TAGS = ["ux", "uz", "φ"];

/** Compacte monospaced matrix-tabel met optionele rij/kolom-highlight. */
function MatrixTable({ M, rowLabels, colLabels, max = 72, hl, wrapRef }: {
  M: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  max?: number;
  /** DOF-indices die gehighlight worden (rijen én kolommen). */
  hl?: Set<number>;
  wrapRef?: React.RefObject<HTMLDivElement | null>;
}) {
  if (M.length === 0 || M[0].length === 0) return <div className="insights-empty">— leeg —</div>;
  const rows = Math.min(M.length, max);
  const cols = Math.min(M[0].length, max);
  const truncated = rows < M.length || cols < M[0].length;
  const isHl = (k: number) => hl?.has(k) ?? false;
  const rLab = (i: number) => rowLabels?.[i] ?? `${i}`;
  const cLab = (j: number) => colLabels?.[j] ?? `${j}`;
  return (
    <div className="insights-matrix-wrap" ref={wrapRef}>
      <table className="insights-matrix">
        <thead>
          <tr>
            <th className="corner" />
            {Array.from({ length: cols }, (_, j) => (
              <th key={j} className={isHl(j) ? "hl-head" : undefined}>{cLab(j)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <th className={isHl(i) ? "hl-head" : undefined}>{rLab(i)}</th>
              {Array.from({ length: cols }, (_, j) => {
                const v = M[i][j];
                const r = isHl(i), c = isHl(j);
                const cls = [
                  Math.abs(v) < 1e-12 ? "zero" : "",
                  r && c ? "hl-x" : r || c ? "hl" : "",
                ].filter(Boolean).join(" ") || undefined;
                return (
                  <td key={j} className={cls} title={`${rLab(i)} × ${cLab(j)} = ${fmtFull(v)}`}>
                    {fmtShort(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="insights-truncated">
          Matrix is {M.length}×{M[0].length}, eerste {rows}×{cols} getoond.
          Gebruik Inzicht → Export matrix voor de volledige CSV.
        </div>
      )}
    </div>
  );
}

type PaneFocus = "element" | "system" | "dof";

export default function InsightsView({ nodes, beams, supports, initialMode, solverError }: Props) {
  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(beams[0]?.id ?? null);
  const [bottomOpen, setBottomOpen] = useState<"logs" | "errors" | null>(
    solverError ? "errors" : null
  );
  const [focusPane, setFocusPane] = useState<PaneFocus | null>(null);
  const firstModeRun = useRef(true);
  const systemWrapRef = useRef<HTMLDivElement>(null);

  const asm = useMemo(() => {
    try {
      return buildMatricesOnly({ nodes, beams, supports });
    } catch (e) {
      return { error: (e as Error).message } as { error: string };
    }
  }, [nodes, beams, supports]);

  // Ribbon-knop (initialMode): element/system/dof → focus-flits; logs/errors → strip open.
  useEffect(() => {
    const first = firstModeRun.current;
    firstModeRun.current = false;
    if (!initialMode) return;
    if (initialMode === "logs" || initialMode === "errors") {
      setBottomOpen(initialMode);
      return;
    }
    if (first) return; // geen flits bij eerste render
    setFocusPane(initialMode);
    const t = window.setTimeout(() => setFocusPane(null), 1600);
    return () => window.clearTimeout(t);
  }, [initialMode]);

  // Houd de selectie geldig als de stavenlijst wijzigt.
  useEffect(() => {
    if (beams.length === 0) {
      if (selectedBeamId !== null) setSelectedBeamId(null);
      return;
    }
    if (selectedBeamId === null || !beams.some(b => b.id === selectedBeamId)) {
      setSelectedBeamId(beams[0].id);
    }
  }, [beams, selectedBeamId]);

  // Scroll het eerste kruispunt van de geselecteerde staaf in beeld in systeem-K.
  useEffect(() => {
    const cross = systemWrapRef.current?.querySelector("td.hl-x");
    cross?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedBeamId, asm]);

  if ("error" in asm) {
    return (
      <div className="insights-view">
        <div className="insights-header">
          <h2>Inzicht — assembly-fout</h2>
        </div>
        <div className="insights-empty">{asm.error}</div>
      </div>
    );
  }

  // Reverse map: matrix-index → UI-knoopnummer (voor rij/kolom-labels).
  const idxToNode: (number | undefined)[] = [];
  for (const [uiId, idx] of asm.nodeIndex) idxToNode[idx] = uiId;
  const sysLabel = (i: number) =>
    `n${idxToNode[Math.floor(i / 3)] ?? "?"}·${DOF_TAGS[i % 3]}`;
  const sysLabels = Array.from({ length: asm.nDof }, (_, i) => sysLabel(i));

  const constrainedDofs = new Set(asm.rigidConstraints.map(r => r.dof));
  const springDofs = new Map(asm.springs.map(s => [s.dof, s.k]));

  const selectedBeam: ExposedBeamCache | undefined = asm.beams.find(b => b.id === selectedBeamId);
  const selectedUiBeam: Beam | undefined = beams.find(b => b.id === selectedBeamId);

  // Highlight-set: de zes globale DOF-indices waaraan de staaf bijdraagt.
  const hlDofs = new Set<number>();
  if (selectedBeam) {
    for (let k = 0; k < 3; k++) {
      hlDofs.add(selectedBeam.fromIdx + k);
      hlDofs.add(selectedBeam.toIdx + k);
    }
  }
  const hlNodes = new Set<number>(
    selectedUiBeam ? [selectedUiBeam.from, selectedUiBeam.to] : []
  );

  const symmetric = checkSymmetric(asm.K);

  const toggleBottom = (which: "logs" | "errors") =>
    setBottomOpen(prev => (prev === which ? null : which));

  return (
    <div className="insights-view">
      <div className="insights-header">
        <h2>Inzicht — Stijfheidsmatrices</h2>
        <div className="insights-meta">
          {nodes.length} knopen · {beams.length} staven · {asm.nDof} DOF's ·{" "}
          {constrainedDofs.size} star · {asm.springs.length} veren ·{" "}
          symmetrie: <strong className={symmetric ? "ok" : "bad"}>{symmetric ? "OK" : "ASYMMETRISCH"}</strong>
        </div>
      </div>

      <div className="insights-grid">
        {/* ── Links: stavenlijst ─────────────────────────────────────── */}
        <aside className="insights-pane insights-beams">
          <div className="insights-pane-head"><h3>Staven</h3></div>
          {asm.beams.length === 0 ? (
            <div className="insights-empty">Geen staven in het model</div>
          ) : (
            <ul className="insights-beamlist">
              {asm.beams.map(cache => {
                const ui = beams.find(b => b.id === cache.id);
                const active = cache.id === selectedBeamId;
                return (
                  <li key={cache.id}>
                    <button
                      type="button"
                      className={`insights-beam-btn${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setSelectedBeamId(cache.id)}
                    >
                      <span className="beam-title">Staaf {cache.id}</span>
                      <span className="beam-nodes">n{ui?.from ?? "?"} → n{ui?.to ?? "?"}</span>
                      {(ui?.profile || ui?.material) && (
                        <span className="beam-props">
                          {[ui?.profile, ui?.material].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Midden-links: element-K van de geselecteerde staaf ─────── */}
        <section className={`insights-pane insights-element${focusPane === "element" ? " focus-flash" : ""}`}>
          <div className="insights-pane-head">
            <h3>{selectedBeam ? `Element-K — Staaf ${selectedBeam.id}` : "Element-K"}</h3>
          </div>
          {selectedBeam ? (
            <div className="insights-pane-body">
              <div className="insights-props">
                <span>L = <code>{selectedBeam.L.toFixed(2).replace(".", ",")} m</code></span>
                <span>E = <code>{fmtShort(selectedBeam.E)} N/m²</code></span>
                <span>A = <code>{fmtShort(selectedBeam.A)} m²</code></span>
                <span>c = <code>{selectedBeam.c.toFixed(4).replace(".", ",")}</code></span>
                <span>s = <code>{selectedBeam.s.toFixed(4).replace(".", ",")}</code></span>
              </div>
              <div className="insights-formulas">
                {/* Termen direct uit k_local, dus altijd consistent met de tabel. */}
                <span>EA/L = <code>{fmtShort(selectedBeam.kLocal[0][0])}</code></span>
                <span>12EI/L³ = <code>{fmtShort(selectedBeam.kLocal[1][1])}</code></span>
                <span>4EI/L = <code>{fmtShort(selectedBeam.kLocal[2][2])}</code></span>
              </div>
              <h4>k_local (6×6) — Euler-Bernoulli + axiaal</h4>
              <MatrixTable
                M={selectedBeam.kLocal}
                rowLabels={ELEMENT_DOF_LABELS}
                colLabels={ELEMENT_DOF_LABELS}
              />
              <h4>Transformatie T (6×6) — globaal → lokaal</h4>
              <MatrixTable
                M={selectedBeam.T}
                rowLabels={ELEMENT_DOF_LABELS}
                colLabels={ELEMENT_DOF_LABELS}
              />
            </div>
          ) : (
            <div className="insights-empty">Selecteer een staaf in de lijst</div>
          )}
        </section>

        {/* ── Groot: systeem-K met highlight van de staafbijdrage ────── */}
        <section className={`insights-pane insights-system${focusPane === "system" ? " focus-flash" : ""}`}>
          <div className="insights-pane-head">
            <h3>Systeem-K ({asm.nDof}×{asm.nDof})</h3>
            {selectedBeam && (
              <span className="insights-pane-note">
                bijdrage staaf {selectedBeam.id} gehighlight
              </span>
            )}
          </div>
          <div className="insights-pane-body">
            <MatrixTable
              M={asm.K}
              rowLabels={sysLabels}
              colLabels={sysLabels}
              hl={hlDofs}
              wrapRef={systemWrapRef}
            />
          </div>
        </section>

        {/* ── Rechts: DOF-mapping ────────────────────────────────────── */}
        <aside className={`insights-pane insights-dof${focusPane === "dof" ? " focus-flash" : ""}`}>
          <div className="insights-pane-head"><h3>DOF-mapping</h3></div>
          <div className="insights-pane-body">
            <table className="insights-doftable">
              <thead>
                <tr><th>DOF</th><th>Knoop</th><th>Comp.</th><th>Type</th></tr>
              </thead>
              <tbody>
                {Array.from({ length: asm.nDof }, (_, i) => {
                  const nodeId = idxToNode[Math.floor(i / 3)];
                  const tag = DOF_TAGS[i % 3];
                  const isConstrained = constrainedDofs.has(i);
                  const springK = springDofs.get(i);
                  const involved = hlDofs.has(i) || (nodeId !== undefined && hlNodes.has(nodeId));
                  const rowCls = [
                    isConstrained ? "constrained" : springK !== undefined ? "spring" : "free",
                    involved ? "hl" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <tr key={i} className={rowCls}>
                      <td>{i}</td>
                      <td>n{nodeId ?? "?"}</td>
                      <td>{tag}</td>
                      <td>
                        {isConstrained
                          ? <span className="dof-badge rigid">star</span>
                          : springK !== undefined
                            ? <span className="dof-badge spring" title={`k = ${fmtFull(springK)}`}>veer {fmtShort(springK)}</span>
                            : <span className="dof-badge free">vrij</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      {/* ── Onderin: inklapbare log/fouten-strip ─────────────────────── */}
      <div className="insights-bottom">
        <div className="insights-bottom-bar">
          <button
            type="button"
            className={`insights-bottom-toggle${bottomOpen === "logs" ? " active" : ""}`}
            onClick={() => toggleBottom("logs")}
            aria-expanded={bottomOpen === "logs"}
          >
            Logboek
          </button>
          <button
            type="button"
            className={`insights-bottom-toggle${bottomOpen === "errors" ? " active" : ""}`}
            onClick={() => toggleBottom("errors")}
            aria-expanded={bottomOpen === "errors"}
          >
            Fouten{solverError && <span className="insights-err-dot" aria-label="actieve fout" />}
          </button>
          <span className="insights-bottom-hint">
            {bottomOpen === null ? "klik om open te klappen" : ""}
          </span>
        </div>
        {bottomOpen === "logs" && (
          <div className="insights-bottom-body">
            <pre className="insights-log">
{`[OK]  Mesh opgebouwd: ${nodes.length} knopen, ${beams.length} staven
[OK]  DOF's: ${asm.nDof} (${asm.springs.length} veer-DOF's)
[OK]  Stijfheidsmatrix geassembleerd (${asm.K.length}×${asm.K[0]?.length ?? 0})
[OK]  Randvoorwaarden toegepast: ${constrainedDofs.size} star
[--]  Solver-logstreaming nog niet aangesloten — waarden hierboven komen uit
      de laatste assembly. Volledige iteratiehistorie volgt in een latere sessie.`}
            </pre>
          </div>
        )}
        {bottomOpen === "errors" && (
          <div className="insights-bottom-body">
            {solverError ? (
              <div className="insights-error-box">
                <strong>Laatste fout:</strong>
                <pre>{solverError}</pre>
              </div>
            ) : (
              <div className="insights-noerror">
                ✓ Geen actieve solver-fouten. De laatste succesvolle assembly staat in het logboek.
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
