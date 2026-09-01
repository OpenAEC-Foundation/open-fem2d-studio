/**
 * FemProjectTree — live project browser, driven by the lifted store.
 *
 * Renders counts & leaves from the actual canvas state (nodes, beams,
 * supports, plates, load cases). Selecting a leaf updates the central
 * selection so the right Properties panel reacts.
 */
import { useState } from "react";
import "./FemProjectTree.css";
import type { Node, Beam, Plate, Support, Load, LoadCase, Selection } from "./femTypes";
import type { LoadCombination, Envelope } from "./solver/combinations";
import type { DisplayFlags } from "./FemResultsOverlay";

interface TreeNodeProps {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}

function TreeNode({ label, count, defaultOpen = false, children, icon }: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!children;
  return (
    <div className="fem-tree-node">
      <button
        className="fem-tree-row"
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <span className={`fem-tree-chevron${open ? " open" : ""}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3 2l4 3-4 3z" />
            </svg>
          </span>
        ) : (
          <span className="fem-tree-chevron-spacer" />
        )}
        {icon && <span className="fem-tree-icon">{icon}</span>}
        <span className="fem-tree-label">{label}</span>
        {count !== undefined && <span className="fem-tree-count">{count}</span>}
      </button>
      {hasChildren && open && (
        <div className="fem-tree-children">{children}</div>
      )}
    </div>
  );
}

interface LeafProps {
  label: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
}
/**
 * ResultsTab — sidebar pane shown under the "Resultaten" tab.
 * Hosts the M-lijn / V-lijn / N-lijn / Δu / R toggles that drive the canvas
 * overlay (lifted state — same flags as the floating HUD on the canvas).
 */
function ResultsTab({
  displayFlags, setDisplayFlags, hasResults,
  loadCases = [], activeLoadCaseId,
  combinations = [], activeCombinationId,
  envelopeView = false,
  onSelectScope,
}: {
  displayFlags?: DisplayFlags;
  setDisplayFlags?: React.Dispatch<React.SetStateAction<DisplayFlags>>;
  hasResults: boolean;
  loadCases?: LoadCase[];
  activeLoadCaseId?: number;
  combinations?: LoadCombination[];
  activeCombinationId?: number | null;
  envelopeView?: boolean;
  /** Called when user picks a scope. Encodes which one was chosen so App
   * can set the right state (single LC / combination / envelope). */
  onSelectScope?: (scope:
    | { kind: "lc"; id: number }
    | { kind: "combo"; id: number }
    | { kind: "envelope" }) => void;
}) {
  if (!displayFlags || !setDisplayFlags) {
    return (
      <div className="fem-results-empty">
        Voer "Berekenen" uit om resultaten te zien.
      </div>
    );
  }
  const toggle = (key: keyof DisplayFlags) =>
    setDisplayFlags(f => ({ ...f, [key]: !f[key] }));

  type Row = {
    key: keyof DisplayFlags;
    label: string;
    hint: string;
    swatch: string;
    /** Optional companion scale-flag key for a slider next to this toggle. */
    scaleKey?: keyof DisplayFlags;
  };
  const ROWS: Row[] = [
    { key: "deflection", label: "Verplaatsing", hint: "Vervormde stand — Hermite-curve van knoopverplaatsingen", swatch: "var(--theme-accent)", scaleKey: "scaleU" },
    { key: "M",          label: "My",            hint: "Buigend moment om y-as (sagging+) loodrecht op balk",     swatch: "#2563eb",            scaleKey: "scaleM" },
    { key: "V",          label: "Vz",            hint: "Dwarskracht in z-richting — lineair aflopend onder UDL",  swatch: "#10b981",            scaleKey: "scaleV" },
    { key: "N",          label: "N",             hint: "Normaalkracht — constant per element",                    swatch: "#f59e0b",            scaleKey: "scaleN" },
    { key: "reactions",  label: "R",             hint: "Reactiekrachten — Fx + Fz pijlen op opleggingen",         swatch: "var(--theme-text)" },
  ];

  // Build current "scope" value for the dropdown.
  const currentValue =
    envelopeView                            ? "envelope"
    : activeCombinationId != null           ? `combo:${activeCombinationId}`
    : activeLoadCaseId != null              ? `lc:${activeLoadCaseId}`
    :                                          "";

  const handleScopeChange = (value: string) => {
    if (!onSelectScope) return;
    if (value === "envelope")             onSelectScope({ kind: "envelope" });
    else if (value.startsWith("combo:"))  onSelectScope({ kind: "combo", id: Number(value.slice(6)) });
    else if (value.startsWith("lc:"))     onSelectScope({ kind: "lc", id: Number(value.slice(3)) });
  };

  return (
    <div className="fem-results-tab">
      {/* Scope picker — choose which case / combination / envelope is shown */}
      <div className="fem-results-section-title">Toon resultaat voor</div>
      <select
        className="fem-results-scope-select"
        value={currentValue}
        onChange={(e) => handleScopeChange(e.target.value)}
      >
        {loadCases.length > 0 && (
          <optgroup label="Belastinggevallen">
            {loadCases.map(lc => (
              <option key={`lc-${lc.id}`} value={`lc:${lc.id}`}>{lc.name}</option>
            ))}
          </optgroup>
        )}
        {combinations.length > 0 && (
          <optgroup label="Combinaties">
            {combinations.map(c => (
              <option key={`co-${c.id}`} value={`combo:${c.id}`}>{c.name}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Overig">
          <option value="envelope">Envelope (min/max alle combinaties)</option>
        </optgroup>
      </select>

      <div className="fem-results-section-title">Weergave op canvas</div>
      <div className="fem-results-toggle-list">
        {ROWS.map(row => {
          const active = !!displayFlags[row.key];
          const scaleVal = row.scaleKey ? (Number(displayFlags[row.scaleKey] ?? 1)) : 1;
          return (
            <div key={row.key} className="fem-results-row">
              <button
                className={`fem-results-toggle${active ? " active" : ""}`}
                onClick={() => toggle(row.key)}
                title={row.hint}
              >
                <span className="fem-results-toggle-swatch" style={{ background: row.swatch }} />
                <span className="fem-results-toggle-label">{row.label}</span>
                <span className={`fem-results-toggle-state${active ? " on" : ""}`}>
                  {active ? "AAN" : "uit"}
                </span>
              </button>
              {row.scaleKey && active && (
                <div className="fem-results-scale-row" title="Schaalfactor — pas de visuele grootte van dit diagram aan">
                  <input
                    type="range"
                    className="fem-results-scale-slider"
                    min={0.1} max={5} step={0.1}
                    value={scaleVal}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setDisplayFlags(f => ({ ...f, [row.scaleKey as keyof DisplayFlags]: v }));
                    }}
                  />
                  <span className="fem-results-scale-value">{scaleVal.toFixed(1)}×</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Extra toggles: extreme waarden + omhullende */}
      <div className="fem-results-section-title">Opties</div>
      <div className="fem-results-toggle-list">
        <button
          className={`fem-results-toggle${displayFlags.showExtremes ? " active" : ""}`}
          onClick={() => toggle("showExtremes")}
          title="Toon Mmax/Vmax/Nmax labels per staaf"
        >
          <span className="fem-results-toggle-swatch" style={{ background: "#f59e0b" }} />
          <span className="fem-results-toggle-label">Extreme waarden tonen</span>
          <span className={`fem-results-toggle-state${displayFlags.showExtremes ? " on" : ""}`}>
            {displayFlags.showExtremes ? "AAN" : "uit"}
          </span>
        </button>
        <button
          className={`fem-results-toggle${envelopeView ? " active" : ""}`}
          onClick={() => onSelectScope?.(envelopeView
            ? (loadCases.length > 0 ? { kind: "lc", id: activeLoadCaseId ?? loadCases[0].id } : { kind: "envelope" })
            : { kind: "envelope" })}
          title="Toon min/max over alle combinaties"
        >
          <span className="fem-results-toggle-swatch" style={{ background: "#9333ea" }} />
          <span className="fem-results-toggle-label">Omhullende</span>
          <span className={`fem-results-toggle-state${envelopeView ? " on" : ""}`}>
            {envelopeView ? "AAN" : "uit"}
          </span>
        </button>
      </div>

      {!hasResults && (
        <div className="fem-results-hint">
          Klik op <strong>Berekenen</strong> in de Start-tab om diagrammen te tonen.
        </div>
      )}
    </div>
  );
}

function Leaf({ label, value, active, onClick }: LeafProps) {
  return (
    <div
      className={`fem-tree-leaf${active ? " active" : ""}${onClick ? " clickable" : ""}`}
      onClick={onClick}
    >
      <span className="fem-tree-leaf-label">{label}</span>
      {value && <span className="fem-tree-leaf-value">{value}</span>}
    </div>
  );
}

interface FemProjectTreeProps {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  selection: Selection;
  setSelection: (s: Selection) => void;
  setActiveLoadCaseId: (id: number) => void;
  addLoadCase: (name: string) => void;
  // Combinations + envelope (step 2d/2e)
  combinations: LoadCombination[];
  activeCombinationId: number | null;
  setActiveCombinationId: (id: number | null) => void;
  envelopeView: boolean;
  setEnvelopeView: (v: boolean) => void;
  envelope: Envelope | null;
  /** Display toggles for the canvas overlay — shown in the Resultaten tab. */
  displayFlags?: DisplayFlags;
  setDisplayFlags?: React.Dispatch<React.SetStateAction<DisplayFlags>>;
  /** True when any solver result is available — gates the toggle hint. */
  hasResults?: boolean;
  /** Optional controlled tab — when supplied, App.tsx drives which tab is open. */
  activeTab?: "project" | "results";
  setActiveTab?: (t: "project" | "results") => void;
}

export default function FemProjectTree(props: FemProjectTreeProps) {
  const {
    nodes, beams, supports, plates, loads,
    loadCases, activeLoadCaseId, selection,
    setSelection, setActiveLoadCaseId, addLoadCase,
    combinations, activeCombinationId, setActiveCombinationId,
    envelopeView, setEnvelopeView, envelope,
    displayFlags, setDisplayFlags, hasResults,
    activeTab, setActiveTab,
  } = props;
  const [internalTab, setInternalTab] = useState<"project" | "results">("project");
  // If controlled (activeTab supplied), use it; otherwise fall back to local.
  const tab    = activeTab    ?? internalTab;
  const setTab = setActiveTab ?? setInternalTab;
  /** governingCombinationId picked by envelope (for amber highlight). */
  const envelopeGoverningIds = envelope
    ? new Set(Array.from(envelope.elements.values()).map(v => v.governingCombinationId))
    : new Set<number>();

  const supportTypeLabel: Record<string, string> = {
    pinned: "Scharnier", fixed: "Inklemming",
    xRoller: "X-Rol", zRoller: "Z-Rol",
    zSpring: "Z-Veer", xSpring: "X-Veer", rotSpring: "Rot-Veer",
  };

  return (
    <div className="fem-project-tree">
      {/* Tabs */}
      <div className="fem-tree-tabs">
        <button className={`fem-tree-tab${tab === "project" ? " active" : ""}`} onClick={() => setTab("project")}>Project</button>
        <button className={`fem-tree-tab${tab === "results" ? " active" : ""}`} onClick={() => setTab("results")}>Resultaten</button>
      </div>

      {/* Tree */}
      <div className="fem-tree-body">
        {tab === "project" ? (
          <>
            <TreeNode label="Model" defaultOpen icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v12H2z" opacity="0.2"/><path d="M2 2h12v12H2zM2 8h12M8 2v12" fill="none" stroke="currentColor" strokeWidth="1"/></svg>}>
              <TreeNode label="Knopen" count={nodes.length} defaultOpen icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="5" r="2.5" /></svg>}>
                {nodes.map(n => (
                  <Leaf
                    key={`tn${n.id}`}
                    label={`Knoop ${n.id}`}
                    value={`X:${n.x} Z:${n.z}`}
                    active={selection?.type === "node" && selection.id === n.id}
                    onClick={() => setSelection({ type: "node", id: n.id })}
                  />
                ))}
              </TreeNode>
              <TreeNode label="Elementen" count={beams.length} defaultOpen icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="5" x2="9" y2="5" /></svg>}>
                {beams.map(b => (
                  <Leaf
                    key={`tb${b.id}`}
                    label={`Balk ${b.id}`}
                    value={`${b.from}-${b.to}`}
                    active={selection?.type === "beam" && selection.id === b.id}
                    onClick={() => setSelection({ type: "beam", id: b.id })}
                  />
                ))}
              </TreeNode>
              <TreeNode label="Opleggingen" count={supports.length} icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,1 1,9 9,9" /></svg>}>
                {supports.map(s => (
                  <Leaf
                    key={`ts${s.nodeId}`}
                    label={`Knoop ${s.nodeId}`}
                    value={supportTypeLabel[s.type] ?? s.type}
                    onClick={() => setSelection({ type: "node", id: s.nodeId })}
                  />
                ))}
              </TreeNode>
              {plates.length > 0 && (
                <TreeNode label="Platen" count={plates.length} icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="7" height="7" /></svg>}>
                  {plates.map(p => (
                    <Leaf
                      key={`tp${p.id}`}
                      label={`Plaat ${p.id}`}
                      value={`${p.nodeIds.length} hoeken`}
                      active={selection?.type === "plate" && selection.id === p.id}
                      onClick={() => setSelection({ type: "plate", id: p.id })}
                    />
                  ))}
                </TreeNode>
              )}
              <TreeNode label="Materialen" count={5} icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>}>
                <Leaf label="S235" />
                <Leaf label="S275" />
                <Leaf label="S355" />
                <Leaf label="S420" />
                <Leaf label="S460" />
              </TreeNode>
              <TreeNode label="Profielen" count={8} icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 1h6M5 1v8M2 9h6" /></svg>}>
                <Leaf label="HEA 160" />
                <Leaf label="HEA 200" />
                <Leaf label="HEB 160" />
                <Leaf label="HEB 300" />
                <Leaf label="IPE 200" />
                <Leaf label="IPE 360" />
              </TreeNode>
            </TreeNode>

            <TreeNode label="Belastingen" defaultOpen icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l-3 3h2v8h2V4h2z"/></svg>}>
              {loadCases.map(lc => {
                const count = loads.filter(l => l.caseId === lc.id).length;
                const isActive = lc.id === activeLoadCaseId;
                return (
                  <div
                    key={`lc${lc.id}`}
                    className={`fem-tree-leaf clickable${isActive ? " active" : ""}`}
                    onClick={() => setActiveLoadCaseId(lc.id)}
                  >
                    <span className="fem-tree-leaf-label">
                      {isActive && <span style={{ color: "var(--theme-accent)", marginRight: 4 }}>●</span>}
                      {lc.name}
                    </span>
                    <span className="fem-tree-leaf-value">{count}</span>
                  </div>
                );
              })}
              <div
                className="fem-tree-leaf clickable"
                style={{ color: "var(--theme-accent)", fontStyle: "italic" }}
                onClick={() => addLoadCase(`Geval ${loadCases.length + 1}`)}
              >
                <span className="fem-tree-leaf-label">+ Nieuw belastinggeval</span>
              </div>
            </TreeNode>

            <TreeNode label="Combinaties" count={combinations.length} defaultOpen icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h12M2 12h12" /></svg>}>
              {/* Envelope header — click to view envelope across all combos */}
              <div
                className={`fem-tree-leaf clickable${envelopeView ? " active" : ""}`}
                onClick={() => {
                  setEnvelopeView(!envelopeView);
                  if (!envelopeView) setActiveCombinationId(null);
                }}
                title="Toon enveloppe (alle combinaties)"
              >
                <span className="fem-tree-leaf-label" style={{ fontWeight: 600 }}>
                  {envelopeView && <span style={{ color: "var(--theme-accent)", marginRight: 4 }}>●</span>}
                  Enveloppe
                </span>
                <span
                  className="fem-tree-leaf-value"
                  style={{
                    background: "var(--theme-accent)",
                    color: "var(--theme-bg)",
                    padding: "1px 6px",
                    borderRadius: 2,
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                >
                  MAX
                </span>
              </div>
              {combinations.map(c => {
                const isActive = !envelopeView && c.id === activeCombinationId;
                const isGoverning = envelopeView && envelopeGoverningIds.has(c.id);
                return (
                  <div
                    key={`combo${c.id}`}
                    className={`fem-tree-leaf clickable${isActive ? " active" : ""}`}
                    onClick={() => {
                      setActiveCombinationId(c.id);
                      setEnvelopeView(false);
                    }}
                    title={c.formula}
                    style={isGoverning ? { background: "rgba(255, 176, 0, 0.15)" } : undefined}
                  >
                    <span className="fem-tree-leaf-label">
                      {isActive && <span style={{ color: "var(--theme-accent)", marginRight: 4 }}>●</span>}
                      {isGoverning && <span style={{ color: "#ffb000", marginRight: 4 }} title="Maatgevend voor minstens 1 element">★</span>}
                      {c.name}
                    </span>
                    <span
                      className="fem-tree-leaf-value"
                      style={{
                        background: c.type === "uls" ? "var(--theme-accent)" : "var(--theme-text-faint)",
                        color: "var(--theme-bg)",
                        padding: "1px 5px",
                        borderRadius: 2,
                        fontSize: 9,
                        fontWeight: 600,
                      }}
                    >
                      {c.type === "uls" ? "U" : "S"}
                    </span>
                  </div>
                );
              })}
            </TreeNode>
            <TreeNode label="Versies" count={0} icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" /></svg>} />
          </>
        ) : (
          <ResultsTab
            displayFlags={displayFlags}
            setDisplayFlags={setDisplayFlags}
            hasResults={hasResults ?? false}
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            combinations={combinations}
            activeCombinationId={activeCombinationId}
            envelopeView={envelopeView}
            onSelectScope={(scope) => {
              if (scope.kind === "envelope") {
                setEnvelopeView?.(true);
                setActiveCombinationId?.(null);
              } else if (scope.kind === "combo") {
                setEnvelopeView?.(false);
                setActiveCombinationId?.(scope.id);
              } else if (scope.kind === "lc") {
                setEnvelopeView?.(false);
                setActiveCombinationId?.(null);
                setActiveLoadCaseId(scope.id);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
