import { useState, useMemo } from 'react';
import { ULS_LOAD_FACTORS, PSI_FACTORS, STEEL_GRADES, CONSEQUENCE_CLASSES } from '../../core/standards/EurocodeNL';
import './StandardsDialog.css';

type StandardsTab = 'loadFactors' | 'psiFactors' | 'steelGrades' | 'consequences' | 'windLoad';

interface StandardsDialogProps {
  onClose: () => void;
}

// --- Wind zone data per NEN-EN 1991-1-4 NL National Annex ---

type WindZoneId = 'I' | 'II' | 'III';

interface WindZone {
  id: WindZoneId;
  label: string;
  vb0: number; // fundamental basic wind velocity (m/s)
}

const WIND_ZONES: WindZone[] = [
  { id: 'I',   label: 'Zone I \u2014 Kustgebied (coastal)',          vb0: 29.5 },
  { id: 'II',  label: 'Zone II \u2014 Binnenland (inland)',          vb0: 27.0 },
  { id: 'III', label: 'Zone III \u2014 Beschut binnenland (sheltered)', vb0: 24.5 },
];

type TerrainCategoryId = 'II' | 'IV';

interface TerrainCategory {
  id: TerrainCategoryId;
  label: string;
  z0: number;   // roughness length (m)
  zmin: number;  // minimum height (m)
}

const TERRAIN_CATEGORIES: TerrainCategory[] = [
  { id: 'II',  label: 'Onbebouwd (Open terrain) \u2014 Cat. II',  z0: 0.05, zmin: 4  },
  { id: 'IV',  label: 'Bebouwd (Built-up / Urban) \u2014 Cat. IV', z0: 1.0,  zmin: 10 },
];

// --- Wind pressure calculation per NEN-EN 1991-1-4 ---

interface WindCalcResult {
  vb0: number;     // fundamental basic wind velocity (m/s)
  cDir: number;    // directional factor
  cSeason: number; // season factor
  vb: number;      // basic wind velocity (m/s)
  z0: number;      // roughness length (m)
  zmin: number;    // minimum height (m)
  zCalc: number;   // effective height used in calc (m)
  kr: number;      // terrain factor
  cr: number;      // roughness factor
  c0: number;      // orography factor
  vm: number;      // mean wind velocity (m/s)
  kl: number;      // turbulence factor
  Iv: number;      // turbulence intensity
  rho: number;     // air density (kg/m3)
  qp: number;      // peak velocity pressure (N/m2)
  qpKN: number;    // peak velocity pressure (kN/m2)
}

function calcWindPressure(
  zone: WindZone,
  terrain: TerrainCategory,
  height: number,
): WindCalcResult {
  const cDir = 1.0;
  const cSeason = 1.0;
  const vb0 = zone.vb0;
  const vb = cDir * cSeason * vb0;

  const { z0, zmin } = terrain;
  const z0ref = 0.05; // reference roughness length (m)

  // effective height: use zmin when height < zmin
  const zCalc = Math.max(height, zmin);

  // terrain factor
  const kr = 0.19 * Math.pow(z0 / z0ref, 0.07);

  // roughness factor
  const cr = kr * Math.log(zCalc / z0);

  // orography factor
  const c0 = 1.0;

  // mean wind velocity
  const vm = cr * c0 * vb;

  // turbulence factor & intensity
  const kl = 1.0;
  const Iv = kl / (c0 * Math.log(zCalc / z0));

  // air density
  const rho = 1.25;

  // peak velocity pressure (N/m2)
  const qp = (1 + 7 * Iv) * 0.5 * rho * vm * vm;
  const qpKN = qp / 1000;

  return { vb0, cDir, cSeason, vb, z0, zmin, zCalc, kr, cr, c0, vm, kl, Iv, rho, qp, qpKN };
}

export function StandardsDialog({ onClose }: StandardsDialogProps) {
  const [activeTab, setActiveTab] = useState<StandardsTab>('loadFactors');

  // Wind load state
  const [windZoneId, setWindZoneId] = useState<WindZoneId>('II');
  const [terrainId, setTerrainId] = useState<TerrainCategoryId>('II');
  const [buildingHeight, setBuildingHeight] = useState(10);

  const windZone = WIND_ZONES.find(z => z.id === windZoneId)!;
  const terrain = TERRAIN_CATEGORIES.find(t => t.id === terrainId)!;

  const windResult = useMemo(
    () => calcWindPressure(windZone, terrain, buildingHeight),
    [windZone, terrain, buildingHeight],
  );

  return (
    <div className="standards-dialog-overlay" onClick={onClose}>
      <div className="standards-dialog standards-dialog-wide" onClick={e => e.stopPropagation()}>
        <div className="standards-dialog-header">
          Eurocode NL — NEN-EN Reference Tables
        </div>

        <div className="standards-tabs">
          <button className={activeTab === 'loadFactors' ? 'active' : ''} onClick={() => setActiveTab('loadFactors')}>
            Load Factors
          </button>
          <button className={activeTab === 'psiFactors' ? 'active' : ''} onClick={() => setActiveTab('psiFactors')}>
            Psi Factors
          </button>
          <button className={activeTab === 'steelGrades' ? 'active' : ''} onClick={() => setActiveTab('steelGrades')}>
            Steel Grades
          </button>
          <button className={activeTab === 'consequences' ? 'active' : ''} onClick={() => setActiveTab('consequences')}>
            CC Classes
          </button>
          <button className={activeTab === 'windLoad' ? 'active' : ''} onClick={() => setActiveTab('windLoad')}>
            Wind Load
          </button>
        </div>

        <div className="standards-dialog-body">
          {activeTab === 'loadFactors' && (
            <table className="standards-table">
              <thead>
                <tr>
                  <th>Combination</th>
                  <th>Description</th>
                  <th>γ_G</th>
                  <th>γ_Q</th>
                </tr>
              </thead>
              <tbody>
                {ULS_LOAD_FACTORS.map(f => (
                  <tr key={f.name}>
                    <td className="std-name">{f.name}</td>
                    <td>{f.description}</td>
                    <td className="std-num">{f.gammaG.toFixed(2)}</td>
                    <td className="std-num">{f.gammaQ.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'psiFactors' && (
            <table className="standards-table">
              <thead>
                <tr>
                  <th>Cat.</th>
                  <th>Description</th>
                  <th>ψ₀</th>
                  <th>ψ₁</th>
                  <th>ψ₂</th>
                </tr>
              </thead>
              <tbody>
                {PSI_FACTORS.map(p => (
                  <tr key={p.category}>
                    <td className="std-name">{p.category}</td>
                    <td>{p.description}</td>
                    <td className="std-num">{p.psi0.toFixed(1)}</td>
                    <td className="std-num">{p.psi1.toFixed(1)}</td>
                    <td className="std-num">{p.psi2.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'steelGrades' && (
            <table className="standards-table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>f_y (MPa)</th>
                  <th>f_u (MPa)</th>
                  <th>γ_M0</th>
                  <th>γ_M1</th>
                  <th>γ_M2</th>
                </tr>
              </thead>
              <tbody>
                {STEEL_GRADES.map(s => (
                  <tr key={s.name}>
                    <td className="std-name">{s.name}</td>
                    <td className="std-num">{s.fy}</td>
                    <td className="std-num">{s.fu}</td>
                    <td className="std-num">{s.gammaM0.toFixed(2)}</td>
                    <td className="std-num">{s.gammaM1.toFixed(2)}</td>
                    <td className="std-num">{s.gammaM2.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'consequences' && (
            <table className="standards-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Description</th>
                  <th>K_FI</th>
                  <th>Examples</th>
                </tr>
              </thead>
              <tbody>
                {CONSEQUENCE_CLASSES.map(c => (
                  <tr key={c.name}>
                    <td className="std-name">{c.name}</td>
                    <td>{c.description}</td>
                    <td className="std-num">{c.KFI.toFixed(1)}</td>
                    <td className="std-examples">{c.examples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'windLoad' && (
            <div className="wind-load-content">
              {/* Norm selection */}
              <div className="wind-section">
                <div className="wind-section-title">Norm</div>
                <div className="wind-form-row">
                  <label>Standard</label>
                  <select className="wind-select" value="ec-nl" disabled>
                    <option value="ec-nl">Eurocode - NL (NEN-EN)</option>
                  </select>
                </div>
              </div>

              {/* Wind zone */}
              <div className="wind-section">
                <div className="wind-section-title">Windzone (NEN-EN 1991-1-4 NB)</div>
                <div className="wind-form-row">
                  <label>Wind region</label>
                  <select
                    className="wind-select"
                    value={windZoneId}
                    onChange={e => setWindZoneId(e.target.value as WindZoneId)}
                  >
                    {WIND_ZONES.map(z => (
                      <option key={z.id} value={z.id}>
                        {z.label} (v_b,0 = {z.vb0} m/s)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Terrain category */}
              <div className="wind-section">
                <div className="wind-section-title">Terrein categorie</div>
                <div className="wind-form-row">
                  <label>Terrain</label>
                  <select
                    className="wind-select"
                    value={terrainId}
                    onChange={e => setTerrainId(e.target.value as TerrainCategoryId)}
                  >
                    {TERRAIN_CATEGORIES.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.label} (z0 = {t.z0} m, zmin = {t.zmin} m)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Building height */}
              <div className="wind-section">
                <div className="wind-section-title">Gebouwhoogte</div>
                <div className="wind-form-row">
                  <label>Hoogte z (m)</label>
                  <input
                    className="wind-input"
                    type="number"
                    min={1}
                    max={200}
                    step={0.5}
                    value={buildingHeight}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setBuildingHeight(v);
                    }}
                  />
                </div>
                {buildingHeight < terrain.zmin && (
                  <div className="wind-note">
                    z &lt; z_min ({terrain.zmin} m) — berekening gebruikt z = {terrain.zmin} m
                  </div>
                )}
              </div>

              {/* Results */}
              <div className="wind-section wind-results">
                <div className="wind-section-title">Berekende stuwdruk q_p(z)</div>

                <table className="wind-results-table">
                  <tbody>
                    <tr>
                      <td className="wind-param">v_b,0</td>
                      <td className="wind-desc">Fundamentele basiswindsnelheid</td>
                      <td className="wind-val">{windResult.vb0.toFixed(1)}</td>
                      <td className="wind-unit">m/s</td>
                    </tr>
                    <tr>
                      <td className="wind-param">c_dir</td>
                      <td className="wind-desc">Richtingsfactor</td>
                      <td className="wind-val">{windResult.cDir.toFixed(1)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr>
                      <td className="wind-param">c_season</td>
                      <td className="wind-desc">Seizoensfactor</td>
                      <td className="wind-val">{windResult.cSeason.toFixed(1)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr className="wind-row-highlight">
                      <td className="wind-param">v_b</td>
                      <td className="wind-desc">Basiswindsnelheid</td>
                      <td className="wind-val">{windResult.vb.toFixed(2)}</td>
                      <td className="wind-unit">m/s</td>
                    </tr>
                    <tr className="wind-row-sep">
                      <td className="wind-param">z0</td>
                      <td className="wind-desc">Ruwheidslengte</td>
                      <td className="wind-val">{windResult.z0.toFixed(2)}</td>
                      <td className="wind-unit">m</td>
                    </tr>
                    <tr>
                      <td className="wind-param">z_min</td>
                      <td className="wind-desc">Minimale hoogte</td>
                      <td className="wind-val">{windResult.zmin.toFixed(1)}</td>
                      <td className="wind-unit">m</td>
                    </tr>
                    <tr>
                      <td className="wind-param">z_calc</td>
                      <td className="wind-desc">Effectieve hoogte</td>
                      <td className="wind-val">{windResult.zCalc.toFixed(1)}</td>
                      <td className="wind-unit">m</td>
                    </tr>
                    <tr>
                      <td className="wind-param">k_r</td>
                      <td className="wind-desc">Terreinfactor</td>
                      <td className="wind-val">{windResult.kr.toFixed(4)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr>
                      <td className="wind-param">c_r(z)</td>
                      <td className="wind-desc">Ruwheidsfactor</td>
                      <td className="wind-val">{windResult.cr.toFixed(4)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr>
                      <td className="wind-param">c_0(z)</td>
                      <td className="wind-desc">Orografiefactor</td>
                      <td className="wind-val">{windResult.c0.toFixed(1)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr className="wind-row-highlight">
                      <td className="wind-param">v_m(z)</td>
                      <td className="wind-desc">Gemiddelde windsnelheid</td>
                      <td className="wind-val">{windResult.vm.toFixed(2)}</td>
                      <td className="wind-unit">m/s</td>
                    </tr>
                    <tr className="wind-row-sep">
                      <td className="wind-param">k_l</td>
                      <td className="wind-desc">Turbulentiefactor</td>
                      <td className="wind-val">{windResult.kl.toFixed(1)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr>
                      <td className="wind-param">I_v(z)</td>
                      <td className="wind-desc">Turbulentie-intensiteit</td>
                      <td className="wind-val">{windResult.Iv.toFixed(4)}</td>
                      <td className="wind-unit">-</td>
                    </tr>
                    <tr>
                      <td className="wind-param">ρ</td>
                      <td className="wind-desc">Luchtdichtheid</td>
                      <td className="wind-val">{windResult.rho.toFixed(2)}</td>
                      <td className="wind-unit">kg/m³</td>
                    </tr>
                  </tbody>
                </table>

                <div className="wind-qp-result">
                  <span className="wind-qp-label">q_p(z) =</span>
                  <span className="wind-qp-value">{windResult.qpKN.toFixed(3)}</span>
                  <span className="wind-qp-unit">kN/m²</span>
                  <span className="wind-qp-alt">({windResult.qp.toFixed(1)} N/m²)</span>
                </div>

                <div className="wind-formula-note">
                  q_p(z) = [1 + 7 · I_v(z)] · ½ · ρ · v_m(z)²
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="standards-dialog-footer">
          <button className="standards-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
