/**
 * BarPropertiesDialog — modal dialog opened by double-clicking a beam.
 *
 * Floating modal with tabs to edit beam properties:
 * (Algemeen / EN 1993), section accordion-style content, footer with
 * Annuleer/OK. OK persists edits via onUpdate → updateBeam (releases/material/profile
 * aren't yet stored on the Beam type in v2).
 */
import { useState } from "react";
import type { Beam, BeamReleases, Node } from "./femTypes";
import { useCheckStore } from "../../stores/checkStore";
import { isSteelCheckResult } from "../../lib/checkTypes";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import "./BarPropertiesDialog.css";

export const STEEL_GRADES = ["S235", "S275", "S355", "S420", "S460"];

/** Suggesties voor de profiel-combobox: staalprofielen + houtdoorsneden. */
export const PROFILE_SUGGESTIONS = [
  "HEA100", "HEA140", "HEA160", "HEA200", "HEA240", "HEA300",
  "HEB160", "HEB200", "HEB240", "HEB300",
  "IPE160", "IPE200", "IPE240", "IPE300", "IPE360",
  "UNP160", "UNP200", "UNP240",
  // Houtdoorsneden — conventie b×h in mm; vrij typbaar (bijv. "96x450 GL").
  "38x89", "44x146", "60x100", "71x171", "96x281", "96x450 GL",
];

interface Props {
  beam: Beam;
  nodes: Node[];
  /** Element forces from the most-recent solver result, if any. */
  beamForces?: { N: number; V: number; M_start: number; M_end: number } | null;
  /** Persist material/profile/releases edits back to the store. */
  onUpdate?: (updates: Partial<Beam>) => void;
  onClose: () => void;
}

export default function BarPropertiesDialog({ beam, nodes, beamForces, onUpdate, onClose }: Props) {
  const [tab, setTab] = useState<"general" | "en1993">("general");
  // Normtoetsingsresultaat van deze staaf (staal of hout) uit de laatste run.
  const memberResult = useCheckStore(
    (s) => s.results.find((r) => r.beam_id === beam.id) ?? null,
  );
  // Hydrate from the beam so re-opening shows previously-saved values.
  const [material, setMaterial] = useState(beam.material ?? "S235");
  const [profile, setProfile]   = useState(beam.profile  ?? "HEA160");
  const [releases, setReleases] = useState<Required<BeamReleases>>({
    startTx: beam.releases?.startTx ?? false,
    startTz: beam.releases?.startTz ?? false,
    startRy: beam.releases?.startRy ?? false,
    endTx:   beam.releases?.endTx   ?? false,
    endTz:   beam.releases?.endTz   ?? false,
    endRy:   beam.releases?.endRy   ?? false,
  });

  const handleConfirm = () => {
    onUpdate?.({ material, profile, releases });
    onClose();
  };

  const nA = nodes.find(n => n.id === beam.from);
  const nB = nodes.find(n => n.id === beam.to);
  const length = nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) : 0;
  const angle  = nA && nB ? (Math.atan2(nB.z - nA.z, nB.x - nA.x) * 180 / Math.PI) : 0;

  return (
    <div className="bar-props-overlay" onClick={onClose}>
      <div className="bar-props-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="bar-props-header">
          <h2 className="bar-props-title">Eigenschappen balk #{beam.id}</h2>
          <button className="bar-props-close" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="bar-props-tabs">
          <button
            className={`bar-props-tab${tab === "general" ? " active" : ""}`}
            onClick={() => setTab("general")}
          >Algemeen</button>
          <button
            className={`bar-props-tab${tab === "en1993" ? " active" : ""}`}
            onClick={() => setTab("en1993")}
          >{memberResult && !isSteelCheckResult(memberResult) ? "EN 1995" : "EN 1993"}</button>
        </div>

        <div className="bar-props-body">
          {tab === "general" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">Geometrie</div>
                <div className="bar-props-row"><span>ID</span><code>{beam.id}</code></div>
                <div className="bar-props-row"><span>Knoop A</span><code>{beam.from}</code></div>
                <div className="bar-props-row"><span>Knoop B</span><code>{beam.to}</code></div>
                <div className="bar-props-row"><span>Lengte</span><code>{(length / 1000).toFixed(3)} m</code></div>
                <div className="bar-props-row"><span>Hoek</span><code>{angle.toFixed(1)}°</code></div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Doorsnede</div>
                <div className="bar-props-row">
                  <span>Materiaal</span>
                  <select className="bar-props-select" value={material}
                    onChange={(e) => setMaterial(e.target.value)}>
                    <optgroup label="Staal (EN 1993)">
                      {STEEL_GRADES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Hout (EN 1995)">
                      {SUPPORTED_TIMBER_GRADES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="bar-props-row">
                  <span>Profiel</span>
                  {/* Combobox: staalprofiel (HEA160, IPE 200, …) of een
                      rechthoekige houtdoorsnede b×h ("60x100", "96x450 GL"). */}
                  <input
                    className="bar-props-select"
                    type="text"
                    list="bar-props-profile-list"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    spellCheck={false}
                  />
                  <datalist id="bar-props-profile-list">
                    {PROFILE_SUGGESTIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Scharnieren (releases)</div>
                <table className="bar-props-release-table">
                  <thead>
                    <tr><th></th><th>uX</th><th>uZ</th><th>φY</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Start A</td>
                      <td><input type="checkbox" checked={releases.startTx}
                        onChange={(e) => setReleases(r => ({ ...r, startTx: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.startTz}
                        onChange={(e) => setReleases(r => ({ ...r, startTz: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.startRy}
                        onChange={(e) => setReleases(r => ({ ...r, startRy: e.target.checked }))} /></td>
                    </tr>
                    <tr>
                      <td>Eind B</td>
                      <td><input type="checkbox" checked={releases.endTx}
                        onChange={(e) => setReleases(r => ({ ...r, endTx: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.endTz}
                        onChange={(e) => setReleases(r => ({ ...r, endTz: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.endRy}
                        onChange={(e) => setReleases(r => ({ ...r, endRy: e.target.checked }))} /></td>
                    </tr>
                  </tbody>
                </table>
                <div className="bar-props-hint">Aangevinkt = vrijheidsgraad ontkoppeld (scharnier)</div>
              </div>

              {beamForces && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">Krachten (huidige resultaat)</div>
                  <div className="bar-props-row"><span>N</span><code>{(beamForces.N / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>V</span><code>{(beamForces.V / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>M_start</span><code>{(beamForces.M_start / 1e6).toFixed(2)} kNm</code></div>
                  <div className="bar-props-row"><span>M_end</span><code>{(beamForces.M_end / 1e6).toFixed(2)} kNm</code></div>
                </div>
              )}
            </>
          )}

          {tab === "en1993" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">Materiaal + doorsnede</div>
                <div className="bar-props-row"><span>Materiaal</span><code>{material}</code></div>
                <div className="bar-props-row"><span>Profiel</span><code>{profile}</code></div>
                {memberResult && (
                  <div className="bar-props-row">
                    <span>Norm</span>
                    <code>{isSteelCheckResult(memberResult) ? "NEN-EN 1993-1-1" : "NEN-EN 1995-1-1"}</code>
                  </div>
                )}
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Kniklengtes</div>
                <div className="bar-props-row">
                  <span>L_cr,y (m)</span>
                  <input type="number" className="bar-props-input" step="0.1" defaultValue={(length / 1000).toFixed(2)} />
                </div>
                <div className="bar-props-row">
                  <span>L_cr,z (m)</span>
                  <input type="number" className="bar-props-input" step="0.1" defaultValue={(length / 1000).toFixed(2)} />
                </div>
                <div className="bar-props-row">
                  <span>L_LT (kip, m)</span>
                  <input type="number" className="bar-props-input" step="0.1" defaultValue={(length / 1000).toFixed(2)} />
                </div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Toetsing (UC)</div>
                {memberResult ? (
                  <>
                    <table className="bar-props-uc-table">
                      <thead><tr><th>Toets</th><th>UC</th><th>Status</th></tr></thead>
                      <tbody>
                        {memberResult.checks.map((named) => {
                          const calc = named.kind.data;
                          const uc = calc.uc?.uc ?? null;
                          const status = calc.status;
                          return (
                            <tr key={named.id}>
                              <td>{calc.title} ({calc.article})</td>
                              <td>{uc !== null ? uc.toFixed(2) : "—"}</td>
                              <td className={
                                status === "Ok" ? "bar-props-uc-ok" :
                                status === "NotOk" ? "bar-props-uc-notok" : "bar-props-uc-pending"
                              }>
                                {status === "Ok" ? "✓ OK" : status === "NotOk" ? "✗ Niet OK" : "N.v.t."}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="bar-props-hint">
                      Maatgevend: {memberResult.governing_check_id} — UC {memberResult.uc_max.toFixed(2)}.
                      Volledige afleiding: tabblad Toetsing → Toetsingspaneel.
                    </div>
                  </>
                ) : (
                  <div className="bar-props-hint">
                    Nog niet getoetst — draai de normtoetsing via het ribbon-tabblad
                    "Toetsing" (knop "Staal + hout toetsen").
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bar-props-footer">
          <button className="bar-props-btn-secondary" onClick={onClose}>Annuleer</button>
          <button className="bar-props-btn-primary" onClick={handleConfirm}>OK</button>
        </div>
      </div>
    </div>
  );
}
