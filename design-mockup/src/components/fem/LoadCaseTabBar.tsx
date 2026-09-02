/**
 * LoadCaseTabBar — Excel-style horizontal tab strip at the bottom of the
 * main view. Each tab represents one belastinggeval; click to switch the
 * active load case (drives the canvas overlay + solver-result selection).
 *
 * The bar renders inline between the canvas/content area and the StatusBar.
 * Hidden on full-width views (IFC, report) since those don't use LCs.
 */
import { useState } from "react";
import type { LoadCase, Load } from "./femTypes";
import "./LoadCaseTabBar.css";

interface Props {
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  setActiveLoadCaseId: (id: number) => void;
  addLoadCase: (name: string) => void;
  /** All loads — used to show count badges per tab. */
  loads: Load[];
  /** Solver toggles — surfaced on the right side of the bar. */
  selfWeightEnabled?: boolean;
  setSelfWeightEnabled?: (v: boolean) => void;
  nonlinearEnabled?: boolean;
  setNonlinearEnabled?: (v: boolean) => void;
  /** Scheefstand (initiële imperfectie): H = φ·V per verticale last. */
  scheefstandEnabled?: boolean;
  setScheefstandEnabled?: (v: boolean) => void;
  /** Noemer x in φ = 1/x (default 200). */
  scheefstandNoemer?: number;
  setScheefstandNoemer?: (v: number) => void;
  /** Richting van de equivalente horizontale krachten: +1 = +x, −1 = −x. */
  scheefstandRichting?: 1 | -1;
  setScheefstandRichting?: (v: 1 | -1) => void;
  /** Model-view tab: when false, no LC loads are drawn on the canvas. */
  showLoads?: boolean;
  setShowLoads?: (v: boolean) => void;
  /** Results tab: only visible after the solver has produced output. */
  hasResults?: boolean;
  /** True when the user has clicked the Resultaten-tab — drives styling. */
  resultsActive?: boolean;
  /** Click handler for the Resultaten-tab; supplied by App.tsx. */
  onShowResults?: () => void;
}

/** Two-character tag for the load-case type chip. */
function typeTag(type: LoadCase["type"]): string {
  switch (type) {
    case "dead": return "G";
    case "live": return "Q";
    case "snow": return "S";
    case "wind": return "W";
    default:     return "—";
  }
}

export default function LoadCaseTabBar({
  loadCases, activeLoadCaseId, setActiveLoadCaseId, addLoadCase, loads,
  selfWeightEnabled, setSelfWeightEnabled,
  nonlinearEnabled, setNonlinearEnabled,
  scheefstandEnabled, setScheefstandEnabled,
  scheefstandNoemer, setScheefstandNoemer,
  scheefstandRichting, setScheefstandRichting,
  showLoads = true, setShowLoads,
  hasResults = false, resultsActive = false, onShowResults,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const name = newName.trim() || `Geval ${loadCases.length + 1}`;
    addLoadCase(name);
    setAdding(false);
    setNewName("");
  };

  return (
    <div className="lc-tab-bar" role="tablist" aria-label="Belastinggevallen">
      {/* Model tab — leftmost, hides loads when active. */}
      <button
        role="tab"
        aria-selected={!showLoads}
        className={`lc-tab lc-tab-model${!showLoads ? " active" : ""}`}
        onClick={() => setShowLoads?.(false)}
        title="Model-view — toon alleen structuur, geen lasten"
      >
        <span className="lc-tab-type lc-tab-type-model">M</span>
        <span className="lc-tab-name">Model</span>
      </button>

      {loadCases.map(lc => {
        const isActive = showLoads && lc.id === activeLoadCaseId;
        const count = loads.filter(l => l.caseId === lc.id).length;
        return (
          <button
            key={lc.id}
            role="tab"
            aria-selected={isActive}
            className={`lc-tab${isActive ? " active" : ""}`}
            onClick={() => {
              setActiveLoadCaseId(lc.id);
              setShowLoads?.(true);    // any LC click leaves model-only view
            }}
            title={`${lc.name} — ${count} belasting${count === 1 ? "" : "en"}`}
          >
            <span className={`lc-tab-type lc-tab-type-${lc.type}`}>{typeTag(lc.type)}</span>
            <span className="lc-tab-name">{lc.name}</span>
            {count > 0 && <span className="lc-tab-count">{count}</span>}
          </button>
        );
      })}

      {/* Resultaten-tab — verschijnt aan het einde nadat Bereken is gedraaid. */}
      {hasResults && (
        <button
          role="tab"
          aria-selected={resultsActive}
          className={`lc-tab lc-tab-results${resultsActive ? " active" : ""}`}
          onClick={() => onShowResults?.()}
          title="Toon krachtsverdeling en vervormingen"
        >
          <span className="lc-tab-type lc-tab-type-results">R</span>
          <span className="lc-tab-name">Resultaten</span>
        </button>
      )}

      {adding ? (
        <span className="lc-tab-add-form">
          <input
            type="text"
            className="lc-tab-add-input"
            autoFocus
            placeholder={`Geval ${loadCases.length + 1}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              else if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            onBlur={handleAdd}
          />
        </span>
      ) : (
        <button
          className="lc-tab-add"
          onClick={() => setAdding(true)}
          title="Nieuw belastinggeval toevoegen"
          aria-label="Nieuw belastinggeval"
        >
          +
        </button>
      )}

      {/* Flex spacer pushes solver toggles to the right. */}
      <span className="lc-tab-spacer" />

      {setSelfWeightEnabled && (
        <label
          className={`lc-tab-toggle${selfWeightEnabled ? " active" : ""}`}
          title="Voeg eigen gewicht (ρ·A·g) toe aan het permanente belastinggeval"
        >
          <input
            type="checkbox"
            checked={!!selfWeightEnabled}
            onChange={(e) => setSelfWeightEnabled(e.target.checked)}
          />
          <span>Eigen gewicht</span>
        </label>
      )}

      {setNonlinearEnabled && (
        <label
          className={`lc-tab-toggle${nonlinearEnabled ? " active" : ""}`}
          title="Niet-lineair (P-Δ) analyse — geometrische stijfheid + Newton-Raphson"
        >
          <input
            type="checkbox"
            checked={!!nonlinearEnabled}
            onChange={(e) => setNonlinearEnabled(e.target.checked)}
          />
          <span>P-Δ</span>
        </label>
      )}

      {/* Scheefstand — zelfde toggle-patroon; bij aan verschijnen φ (1/x) en
          de richtingskeuze inline. */}
      {setScheefstandEnabled && (
        <label
          className={`lc-tab-toggle${scheefstandEnabled ? " active" : ""}`}
          title="Scheefstand meenemen: elke verticale last krijgt een horizontale metgezel H = φ·V (EN 1993-1-1 §5.3.2)"
        >
          <input
            type="checkbox"
            checked={!!scheefstandEnabled}
            onChange={(e) => setScheefstandEnabled(e.target.checked)}
          />
          <span>Scheefstand</span>
        </label>
      )}
      {setScheefstandEnabled && scheefstandEnabled && (
        <span className="lc-tab-phi" title="Scheefstand φ als 1/x (default 1/200) en richting van de horizontale krachten">
          <span className="lc-tab-phi-label">φ = 1/</span>
          <input
            type="number"
            className="lc-tab-phi-input"
            min={1}
            step={50}
            value={scheefstandNoemer ?? 200}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setScheefstandNoemer?.(v);
            }}
          />
          <select
            className="lc-tab-phi-dir"
            value={scheefstandRichting ?? 1}
            onChange={(e) => setScheefstandRichting?.(Number(e.target.value) === -1 ? -1 : 1)}
            title="Richting van de equivalente horizontale krachten"
          >
            <option value={1}>+X</option>
            <option value={-1}>−X</option>
          </select>
        </span>
      )}
    </div>
  );
}
