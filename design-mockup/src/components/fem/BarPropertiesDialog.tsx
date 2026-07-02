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
import "./BarPropertiesDialog.css";

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
          >EN 1993</button>
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
                    <option value="S235">S235</option>
                    <option value="S275">S275</option>
                    <option value="S355">S355</option>
                    <option value="S420">S420</option>
                    <option value="S460">S460</option>
                  </select>
                </div>
                <div className="bar-props-row">
                  <span>Profiel</span>
                  <select className="bar-props-select" value={profile}
                    onChange={(e) => setProfile(e.target.value)}>
                    <option value="HEA100">HEA 100</option>
                    <option value="HEA140">HEA 140</option>
                    <option value="HEA160">HEA 160</option>
                    <option value="HEA200">HEA 200</option>
                    <option value="HEA240">HEA 240</option>
                    <option value="HEB200">HEB 200</option>
                    <option value="HEB240">HEB 240</option>
                    <option value="IPE200">IPE 200</option>
                    <option value="IPE240">IPE 240</option>
                    <option value="IPE300">IPE 300</option>
                    <option value="UNP200">UNP 200</option>
                  </select>
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
                <div className="bar-props-section-title">Staalsoort + partiële factoren</div>
                <div className="bar-props-row"><span>fy</span><code>235 N/mm²</code></div>
                <div className="bar-props-row"><span>fu</span><code>360 N/mm²</code></div>
                <div className="bar-props-row"><span>γM0</span><code>1.00</code></div>
                <div className="bar-props-row"><span>γM1</span><code>1.00</code></div>
                <div className="bar-props-row"><span>γM2</span><code>1.25</code></div>
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
                <table className="bar-props-uc-table">
                  <thead><tr><th>Toets</th><th>UC</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td>Druk Nc,Rd (6.46)</td><td>—</td><td className="bar-props-uc-pending">⊘ wacht op Stap 3</td></tr>
                    <tr><td>Buiging Mc,Rd (6.12)</td><td>—</td><td className="bar-props-uc-pending">⊘ wacht op Stap 3</td></tr>
                    <tr><td>Dwarskracht Vc,Rd (6.17)</td><td>—</td><td className="bar-props-uc-pending">⊘ wacht op Stap 3</td></tr>
                    <tr><td>Kip Mb,Rd (6.55)</td><td>—</td><td className="bar-props-uc-pending">⊘ wacht op Stap 3</td></tr>
                    <tr><td>M+N interactie (6.61)</td><td>—</td><td className="bar-props-uc-pending">⊘ wacht op Stap 3</td></tr>
                  </tbody>
                </table>
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
