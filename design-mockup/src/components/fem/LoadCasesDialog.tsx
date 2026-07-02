/**
 * LoadCasesDialog — manage belastinggevallen + combinaties from a single
 * modal. Two tabs:
 *   1. Gevallen — list of LoadCase with name + type editor, add / remove.
 *   2. Combinaties — list of LoadCombination with name/type editor and a
 *      per-case factor matrix. Add / remove combinations.
 */
import { useState, useEffect } from "react";
import type { LoadCase } from "./femTypes";
import type { LoadCombination } from "./solver/combinations";
import "./LoadCasesDialog.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional initial tab — defaults to "cases". */
  initialTab?: "cases" | "combos";
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  addLoadCase: (name: string) => void;
  updateLoadCase: (id: number, patch: Partial<Omit<LoadCase, "id">>) => void;
  removeLoadCase: (id: number) => void;
  addCombination: (combo: Omit<LoadCombination, "id">) => void;
  updateCombination: (id: number, patch: Partial<Omit<LoadCombination, "id">>) => void;
  removeCombination: (id: number) => void;
}

const TYPE_OPTIONS: LoadCase["type"][] = ["dead", "live", "snow", "wind", "other"];
const TYPE_LABEL: Record<LoadCase["type"], string> = {
  dead: "Permanent (G)", live: "Variabel (Q)", snow: "Sneeuw (S)",
  wind: "Wind (W)", other: "Overig",
};

export default function LoadCasesDialog({
  open, onClose, initialTab = "cases",
  loadCases, combinations,
  addLoadCase, updateLoadCase, removeLoadCase,
  addCombination, updateCombination, removeCombination,
}: Props) {
  const [tab, setTab] = useState<"cases" | "combos">(initialTab);
  // Sync tab when dialog re-opens with a different initialTab.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const [newCaseName, setNewCaseName] = useState("");
  const [newComboName, setNewComboName] = useState("");

  if (!open) return null;

  const handleAddCase = () => {
    const name = newCaseName.trim() || `Geval ${loadCases.length + 1}`;
    addLoadCase(name);
    setNewCaseName("");
  };

  const handleAddCombo = () => {
    const name = newComboName.trim() || `Combinatie ${combinations.length + 1}`;
    addCombination({
      name,
      type: "uls",
      formula: name,
      factors: new Map(),
    });
    setNewComboName("");
  };

  return (
    <div className="lcd-overlay" onClick={onClose}>
      <div className="lcd-dialog" onClick={e => e.stopPropagation()}>
        <div className="lcd-header">
          <span className="lcd-title">Belastinggevallen & combinaties</span>
          <button className="lcd-close" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="lcd-tabs">
          <button className={`lcd-tab${tab === "cases" ? " active" : ""}`} onClick={() => setTab("cases")}>
            Gevallen ({loadCases.length})
          </button>
          <button className={`lcd-tab${tab === "combos" ? " active" : ""}`} onClick={() => setTab("combos")}>
            Combinaties ({combinations.length})
          </button>
        </div>

        <div className="lcd-body">
          {tab === "cases" && (
            <>
              <table className="lcd-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Naam</th>
                    <th style={{ width: 140 }}>Type</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadCases.map(lc => (
                    <tr key={lc.id}>
                      <td className="lcd-td-id">{lc.id}</td>
                      <td>
                        <input
                          className="lcd-input"
                          value={lc.name}
                          onChange={(e) => updateLoadCase(lc.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="lcd-input"
                          value={lc.type}
                          onChange={(e) => updateLoadCase(lc.id, { type: e.target.value as LoadCase["type"] })}
                        >
                          {TYPE_OPTIONS.map(t => (
                            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="lcd-row-btn lcd-row-btn-danger"
                          title="Verwijder belastinggeval (én alle bijbehorende lasten)"
                          onClick={() => {
                            if (loadCases.length <= 1) {
                              alert("Minstens één belastinggeval is verplicht.");
                              return;
                            }
                            if (confirm(`Verwijder "${lc.name}"? Alle lasten in deze case worden ook verwijderd.`)) {
                              removeLoadCase(lc.id);
                            }
                          }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="lcd-add-row">
                <input
                  className="lcd-input lcd-add-input"
                  placeholder={`Nieuw geval (bijv. "Geval ${loadCases.length + 1}")`}
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCase(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCase}>+ Toevoegen</button>
              </div>
            </>
          )}

          {tab === "combos" && (
            <>
              <table className="lcd-table lcd-table-combo">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Naam</th>
                    <th style={{ width: 80 }}>Type</th>
                    {loadCases.map(lc => (
                      <th key={lc.id} style={{ width: 70 }} title={lc.name}>
                        γ·{lc.name}
                      </th>
                    ))}
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {combinations.map(c => (
                    <tr key={c.id}>
                      <td className="lcd-td-id">{c.id}</td>
                      <td>
                        <input
                          className="lcd-input"
                          value={c.name}
                          onChange={(e) => updateCombination(c.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="lcd-input"
                          value={c.type}
                          onChange={(e) => updateCombination(c.id, { type: e.target.value as LoadCombination["type"] })}
                        >
                          <option value="uls">ULS</option>
                          <option value="sls">SLS</option>
                        </select>
                      </td>
                      {loadCases.map(lc => {
                        const f = c.factors.get(lc.id) ?? 0;
                        return (
                          <td key={lc.id}>
                            <input
                              className="lcd-input lcd-input-factor"
                              type="number" step="0.05"
                              value={f}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                const next = new Map(c.factors);
                                if (isNaN(v) || v === 0) next.delete(lc.id);
                                else next.set(lc.id, v);
                                updateCombination(c.id, { factors: next });
                              }}
                            />
                          </td>
                        );
                      })}
                      <td>
                        <button
                          className="lcd-row-btn lcd-row-btn-danger"
                          title="Verwijder combinatie"
                          onClick={() => {
                            if (confirm(`Verwijder combinatie "${c.name}"?`)) {
                              removeCombination(c.id);
                            }
                          }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="lcd-add-row">
                <input
                  className="lcd-input lcd-add-input"
                  placeholder={`Nieuwe combinatie (bijv. "ULS eigen")`}
                  value={newComboName}
                  onChange={(e) => setNewComboName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCombo(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCombo}>+ Toevoegen</button>
              </div>

              <p className="lcd-hint">
                Tip: factor 0 (of leeg) = die belastinggeval doet niet mee in deze combinatie.
                Negatieve factor mag — bijvoorbeeld <code>0.9·G + 1.5·W</code> voor uplift.
              </p>
            </>
          )}
        </div>

        <div className="lcd-footer">
          <button className="lcd-btn-secondary" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
