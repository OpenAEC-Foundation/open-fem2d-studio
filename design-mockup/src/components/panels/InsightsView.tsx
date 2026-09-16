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
import { useTranslation } from "react-i18next";
import { buildMatricesOnly, type ExposedBeamCache } from "../fem/solver/solver";
import {
  controleerDoorsneden, doorsnedeVeldenVoorSolver, staafLengteMm,
} from "../../lib/modelNaarSolverInput";
import type { Node, Beam, Support } from "../fem/femTypes";
import { useSolverLogStore } from "../../stores/solverLogStore";
import type { SolverLogRegel } from "../../core/solver/NonlinearSolver";
import "./InsightsView.css";

/** Het merkteken vóór elke logregel — dezelfde breedte als de assembly-regels. */
const LOG_TAG: Record<SolverLogRegel["soort"], string> = {
  info: "[OK]",
  iteratie: "[..]",
  waarschuwing: "[!!]",
  fout: "[XX]",
};

interface Props {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  /** Ribbon-keuze — bepaalt welk paneel focus/scroll krijgt (dashboard toont alles). */
  initialMode?: "element" | "system" | "dof" | "logs" | "errors";
  /** Solver-fouttekst uit App (getoond in de fouten-strip). */
  solverError?: string | null;
  /**
   * De blokkerende stabiliteitsmelding (eerste orde met α_cr < 10, basisaudit
   * nr 27): de rekengang slaagde, maar de norm staat haar niet toe.
   */
  stabiliteitsMelding?: string | null;
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
  const { t } = useTranslation("ribbon");
  if (M.length === 0 || M[0].length === 0) return <div className="insights-empty">{t("insights.matrixEmpty")}</div>;
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
          {t("insights.truncated", { totaalRijen: M.length, totaalKolommen: M[0].length, rijen: rows, kolommen: cols })}
        </div>
      )}
    </div>
  );
}

type PaneFocus = "element" | "system" | "dof";

export default function InsightsView({ nodes, beams, supports, initialMode, solverError, stabiliteitsMelding }: Props) {
  const { t } = useTranslation("ribbon");
  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(beams[0]?.id ?? null);
  const [bottomOpen, setBottomOpen] = useState<"logs" | "errors" | null>(
    solverError || stabiliteitsMelding ? "errors" : null
  );
  const [focusPane, setFocusPane] = useState<PaneFocus | null>(null);
  const firstModeRun = useRef(true);
  const systemWrapRef = useRef<HTMLDivElement>(null);

  // Twee losse selectors, geen object: een selector die `{regels, verloren}`
  // teruggeeft maakt elke render een nieuw object en laat zustand het paneel
  // bij élke store-aanraking hertekenen.
  const solverLog = useSolverLogStore((s) => s.regels);
  const verlorenRegels = useSolverLogStore((s) => s.verlorenRegels);

  // De matrices met de STIJFHEID VAN HET MODEL. Hier gingen de staven zonder
  // E, A en I naar de engine, die dan terugviel op HEA 160 / S235 — de getoonde
  // K hoorde bij geen enkele staaf (gemeten: GL24h 160×400, L = 4 m gaf
  // EA/L = 2,035e8 N/m in plaats van 1,840e8). Nu dezelfde doorsnedebepaling
  // en dezelfde scharnieren als het rekenpad; een doorsnede die niet te bepalen
  // is, levert de melding van dat pad en geen matrix.
  const asm = useMemo(() => {
    try {
      controleerDoorsneden(beams);
      return buildMatricesOnly({
        nodes,
        beams: beams.map((b) => {
          return {
            ...b,
            // Zelfde doorsnedebepaling als het rekenpad, inclusief de
            // segmenten van een verlopend profiel.
            ...doorsnedeVeldenVoorSolver(b, staafLengteMm(b, nodes)),
            startConnection: b.releases?.startRy ? "hinge" : "fixed",
            endConnection: b.releases?.endRy ? "hinge" : "fixed",
            releases: b.releases,
          };
        }),
        supports,
      });
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
    const timer = window.setTimeout(() => setFocusPane(null), 1600);
    return () => window.clearTimeout(timer);
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
          <h2>{t("insights.assemblyErrorTitle")}</h2>
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
        <h2>{t("insights.headerTitle")}</h2>
        <div className="insights-meta">
          {t("insights.metaCounts", {
            knopen: nodes.length, staven: beams.length, dofs: asm.nDof,
            star: constrainedDofs.size, veren: asm.springs.length,
          })}{" "}
          {t("insights.symmetry")} <strong className={symmetric ? "ok" : "bad"}>{symmetric ? "OK" : t("insights.asymmetric")}</strong>
        </div>
      </div>

      <div className="insights-grid">
        {/* ── Links: stavenlijst ─────────────────────────────────────── */}
        <aside className="insights-pane insights-beams">
          <div className="insights-pane-head"><h3>{t("insights.beamsHead")}</h3></div>
          {asm.beams.length === 0 ? (
            <div className="insights-empty">{t("insights.noBeams")}</div>
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
                      <span className="beam-title">{t("insights.beamTitle", { id: cache.id })}</span>
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
            <h3>{selectedBeam ? t("insights.elementKBeam", { id: selectedBeam.id }) : "Element-K"}</h3>
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
              <h4>{t("insights.kLocalHead")}</h4>
              <MatrixTable
                M={selectedBeam.kLocal}
                rowLabels={ELEMENT_DOF_LABELS}
                colLabels={ELEMENT_DOF_LABELS}
              />
              <h4>{t("insights.transformHead")}</h4>
              <MatrixTable
                M={selectedBeam.T}
                rowLabels={ELEMENT_DOF_LABELS}
                colLabels={ELEMENT_DOF_LABELS}
              />
            </div>
          ) : (
            <div className="insights-empty">{t("insights.selectBeam")}</div>
          )}
        </section>

        {/* ── Groot: systeem-K met highlight van de staafbijdrage ────── */}
        <section className={`insights-pane insights-system${focusPane === "system" ? " focus-flash" : ""}`}>
          <div className="insights-pane-head">
            <h3>{t("insights.systemKHead", { n: asm.nDof })}</h3>
            {selectedBeam && (
              <span className="insights-pane-note">
                {t("insights.contribution", { id: selectedBeam.id })}
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
          <div className="insights-pane-head"><h3>{t("insights.dofMappingHead")}</h3></div>
          <div className="insights-pane-body">
            <table className="insights-doftable">
              <thead>
                <tr><th>DOF</th><th>{t("insights.colNode")}</th><th>{t("insights.colComp")}</th><th>{t("insights.colType")}</th></tr>
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
                          ? <span className="dof-badge rigid">{t("insights.rigid")}</span>
                          : springK !== undefined
                            ? <span className="dof-badge spring" title={`k = ${fmtFull(springK)}`}>{t("insights.spring", { k: fmtShort(springK) })}</span>
                            : <span className="dof-badge free">{t("insights.free")}</span>}
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
            {t("insights.logbook")}
          </button>
          <button
            type="button"
            className={`insights-bottom-toggle${bottomOpen === "errors" ? " active" : ""}`}
            onClick={() => toggleBottom("errors")}
            aria-expanded={bottomOpen === "errors"}
          >
            {t("insights.errors")}{(solverError || stabiliteitsMelding) && <span className="insights-err-dot" aria-label={t("insights.activeError")} />}
          </button>
          <span className="insights-bottom-hint">
            {bottomOpen === null ? t("insights.expandHint") : ""}
          </span>
        </div>
        {bottomOpen === "logs" && (
          <div className="insights-bottom-body">
            <pre className="insights-log">
{t("insights.assemblyLog", {
  knopen: nodes.length, staven: beams.length, dofs: asm.nDof, veerDofs: asm.springs.length,
  rijen: asm.K.length, kolommen: asm.K[0]?.length ?? 0, star: constrainedDofs.size,
})}
            </pre>
            {/* Hierboven staat de assembly die DIT paneel zelf opbouwt (de
                matrices die je ernaast ziet); hieronder wat de SOLVER meldde
                tijdens de laatste berekening. Twee bronnen, dus twee blokken —
                ze door elkaar zetten zou suggereren dat het één reeks is. */}
            {solverLog.length === 0 ? (
              <div className="insights-noerror">
                {t("insights.notComputed")}
              </div>
            ) : (
              <pre className="insights-log">
                {verlorenRegels > 0
                  ? `${t("insights.olderLinesOmitted", { count: verlorenRegels })}\n`
                  : ""}
                {solverLog.map((r) => `${LOG_TAG[r.soort]}  ${r.tekst}`).join("\n")}
              </pre>
            )}
          </div>
        )}
        {bottomOpen === "errors" && (
          <div className="insights-bottom-body">
            {stabiliteitsMelding && (
              <div className="insights-error-box">
                <strong>{t("insights.stabilityLabel")}</strong>
                <pre>{stabiliteitsMelding}</pre>
              </div>
            )}
            {solverError ? (
              <div className="insights-error-box">
                <strong>{t("insights.lastError")}</strong>
                <pre>{solverError}</pre>
              </div>
            ) : !stabiliteitsMelding ? (
              <div className="insights-noerror">
                {t("insights.noErrors")}
              </div>
            ) : null}
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
