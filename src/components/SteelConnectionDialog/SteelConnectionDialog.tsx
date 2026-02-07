import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n/i18n';
import {
  designMomentConnection,
  getAvailableBoltDiameters,
  getAvailableBoltClasses,
  IMomentConnectionConfig,
  IMomentConnectionResult,
} from '../../core/standards/SteelConnection';
import { SteelProfileLibrary } from '../../core/section/SteelProfileLibrary';
import './SteelConnectionDialog.css';

interface Props {
  onClose: () => void;
}

export function SteelConnectionDialog({ onClose }: Props) {
  const { t } = useI18n();

  // Profile selection
  const [beamProfileName, setBeamProfileName] = useState('HEB 180');
  const [colProfileName, setColProfileName] = useState('HEB 120');

  // Bolt config
  const [boltDiameter, setBoltDiameter] = useState(16);
  const [boltClass, setBoltClass] = useState('8.8');
  const [nBoltRows, setNBoltRows] = useState(2);
  const [nBoltsPerRow] = useState(2);

  // Bolt geometry
  const [e_top, setETop] = useState(40);
  const [p_rows, setPRows] = useState(100);
  const [p_bolts, setPBolts] = useState(60);
  const [e_side, setESide] = useState(50);

  // End plate
  const [plateThickness, setPlateThickness] = useState(15);
  const [plateWidth, setPlateWidth] = useState(160);
  const [plateHeight, setPlateHeight] = useState(260);

  // Welds
  const [a_ef, setAef] = useState(7);
  const [a_ew, setAew] = useState(4);

  // Design forces
  const [M_Ed, setM_Ed] = useState(13.38);
  const [V_Ed, setV_Ed] = useState(121);

  // Steel grade
  const [fy, setFy] = useState(235);
  const fu = fy === 235 ? 360 : fy === 275 ? 430 : fy === 355 ? 510 : 540;

  // Beam length (for stiffness classification)
  const [beamLength, setBeamLength] = useState(3610);

  // Profile lookup
  const beamProfile = useMemo(() => SteelProfileLibrary.findProfile(beamProfileName), [beamProfileName]);
  const colProfile = useMemo(() => SteelProfileLibrary.findProfile(colProfileName), [colProfileName]);

  // Get I-profile names
  const iProfiles = useMemo(() => {
    const series = SteelProfileLibrary.getSeriesByCategory('I-Profiles');
    return series.flatMap(s => s.profiles.map(p => p.name));
  }, []);

  // Calculate result
  const result = useMemo<IMomentConnectionResult | null>(() => {
    if (!beamProfile || !colProfile) return null;
    const sc = beamProfile.data.shape_coords;
    const cc = colProfile.data.shape_coords;
    if (sc.length < 5 || cc.length < 5) return null;

    // Extract profile data
    const [beam_h, beam_b, beam_tw, beam_tf, beam_r] = sc;
    const [col_h, col_b, col_tw, col_tf, col_r] = cc;

    // Approximate section properties
    const beam_A = 2 * beam_b * beam_tf + (beam_h - 2 * beam_tf) * beam_tw;
    const beam_Iy = (beam_b * beam_h ** 3 - (beam_b - beam_tw) * (beam_h - 2 * beam_tf) ** 3) / 12;
    const beam_Wpl = beam_b * beam_tf * (beam_h - beam_tf) + beam_tw * ((beam_h - 2 * beam_tf) ** 2) / 4;

    const cfg: IMomentConnectionConfig = {
      beam_h, beam_b, beam_tw, beam_tf, beam_r,
      beam_fy: fy, beam_fu: fu,
      beam_A, beam_Iy, beam_Wpl,
      beamProfileName,
      beamLength,

      col_h, col_b, col_tw, col_tf, col_r,
      col_fy: fy, col_fu: fu,
      colProfileName,

      boltDiameter, boltClass,
      nBoltRows, nBoltsPerRow,
      e_top, p_rows, p_bolts, e_side,

      plate_tp: plateThickness,
      plate_bp: plateWidth,
      plate_hp: plateHeight,
      plate_fy: fy,
      plate_fu: fu,

      a_ef, a_ew,
      M_Ed, V_Ed,
    };

    try {
      return designMomentConnection(cfg);
    } catch (err) {
      console.error('Connection design error:', err);
      return null;
    }
  }, [beamProfile, colProfile, boltDiameter, boltClass, nBoltRows, nBoltsPerRow,
      e_top, p_rows, p_bolts, e_side, plateThickness, plateWidth, plateHeight,
      a_ef, a_ew, fy, fu, M_Ed, V_Ed, beamProfileName, colProfileName, beamLength]);

  const ucClass = (uc: number) => uc <= 0.9 ? 'ok' : uc <= 1.0 ? 'warn' : 'fail';

  // Parametric SVG drawing of the connection (side view + end plate view)
  const renderParametricDrawing = () => {
    if (!beamProfile || !colProfile) return null;
    const sc = beamProfile.data.shape_coords;
    const cc = colProfile.data.shape_coords;

    const [beam_h, beam_b, beam_tw, beam_tf] = sc;
    const [col_h, , , col_tf] = cc;

    // Drawing scale
    const scale = 1.2;
    const svgW = 500;
    const svgH = 320;
    const gap = 60; // gap between side view and front view

    // Side view (column + beam + plate)
    const sideOx = 40;
    const sideOy = 40;

    // Column is vertical, beam is horizontal
    const colW = col_h * scale;
    const colH = 200 * scale;
    const colX = sideOx;
    const colY = sideOy;

    // Beam connects to column
    const beamH = beam_h * scale;
    const beamW = 120 * scale;
    const beamX = colX + colW;
    const beamY = colY + colH / 2 - beamH / 2;

    // End plate
    const plateW = plateThickness * scale;
    const plateH = plateHeight * scale;
    const plateX = beamX;
    const plateY = colY + colH / 2 - plateH / 2;

    // Bolt positions (from top of plate)
    const boltPositions: number[] = [];
    for (let i = 0; i < nBoltRows; i++) {
      boltPositions.push(e_top + i * p_rows);
    }

    // Front view (end plate with bolts)
    const frontOx = sideOx + colW + beamW + gap;
    const frontOy = sideOy + 20;
    const frontScale = 1.5;

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="connection-svg">
        {/* Background */}
        <rect x="0" y="0" width={svgW} height={svgH} fill="#ffffff" />

        {/* Title */}
        <text x={svgW / 2} y="16" fontSize="11" fontWeight="600" fill="#334155" textAnchor="middle">
          Beam-to-Column Moment Connection
        </text>

        {/* === SIDE VIEW === */}
        <text x={sideOx + colW / 2} y={sideOy - 8} fontSize="9" fill="#64748b" textAnchor="middle">
          Side View
        </text>

        {/* Column (I-profile, horizontal in side view = shown as H) */}
        <g stroke="#1e40af" strokeWidth="0.8" fill="none">
          {/* Column outline */}
          <rect x={colX} y={colY} width={colW} height={colH} fill="#dbeafe" fillOpacity="0.5" />
          {/* Column flanges */}
          <line x1={colX + col_tf * scale} y1={colY} x2={colX + col_tf * scale} y2={colY + colH} />
          <line x1={colX + colW - col_tf * scale} y1={colY} x2={colX + colW - col_tf * scale} y2={colY + colH} />
        </g>

        {/* End plate (yellow/orange) */}
        <rect x={plateX} y={plateY} width={plateW} height={plateH}
              fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />

        {/* Beam (I-profile) */}
        <g stroke="#1e40af" strokeWidth="0.8" fill="#dbeafe" fillOpacity="0.5">
          {/* Top flange */}
          <rect x={beamX + plateW} y={beamY} width={beamW - plateW} height={beam_tf * scale} />
          {/* Bottom flange */}
          <rect x={beamX + plateW} y={beamY + beamH - beam_tf * scale} width={beamW - plateW} height={beam_tf * scale} />
          {/* Web */}
          <rect x={beamX + plateW} y={beamY + beam_tf * scale}
                width={beam_tw * scale} height={beamH - 2 * beam_tf * scale} />
        </g>

        {/* Welds (red triangles) */}
        <g fill="#ef4444" stroke="none">
          {/* Top flange weld */}
          <polygon points={`${plateX + plateW},${beamY} ${plateX + plateW + 6},${beamY} ${plateX + plateW},${beamY + 6}`} />
          {/* Bottom flange weld */}
          <polygon points={`${plateX + plateW},${beamY + beamH} ${plateX + plateW + 6},${beamY + beamH} ${plateX + plateW},${beamY + beamH - 6}`} />
        </g>

        {/* Bolts in side view (circles) */}
        <g fill="#475569" stroke="#1e293b" strokeWidth="0.5">
          {boltPositions.map((pos, i) => {
            const by = plateY + pos * scale;
            return (
              <g key={i}>
                <circle cx={plateX + plateW / 2} cy={by} r={boltDiameter * scale / 3} />
              </g>
            );
          })}
        </g>

        {/* Dimension lines */}
        <g stroke="#94a3b8" strokeWidth="0.5" fill="none" fontSize="8">
          {/* Plate thickness */}
          <line x1={plateX} y1={plateY + plateH + 15} x2={plateX + plateW} y2={plateY + plateH + 15} />
          <line x1={plateX} y1={plateY + plateH + 10} x2={plateX} y2={plateY + plateH + 20} />
          <line x1={plateX + plateW} y1={plateY + plateH + 10} x2={plateX + plateW} y2={plateY + plateH + 20} />
          <text x={plateX + plateW / 2} y={plateY + plateH + 25} textAnchor="middle" fill="#64748b">
            {plateThickness}
          </text>
        </g>

        {/* Labels */}
        <text x={colX + colW / 2} y={colY + colH + 15} fontSize="9" fill="#1e40af" textAnchor="middle">
          {colProfileName}
        </text>
        <text x={beamX + beamW / 2 + plateW / 2} y={beamY - 5} fontSize="9" fill="#1e40af" textAnchor="middle">
          {beamProfileName}
        </text>

        {/* === FRONT VIEW (End Plate) === */}
        <text x={frontOx + plateWidth * frontScale / 2} y={frontOy - 8} fontSize="9" fill="#64748b" textAnchor="middle">
          End Plate View
        </text>

        {/* End plate outline */}
        <rect x={frontOx} y={frontOy}
              width={plateWidth * frontScale} height={plateHeight * frontScale}
              fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />

        {/* Beam profile outline (dashed) */}
        <rect x={frontOx + (plateWidth - beam_b) * frontScale / 2}
              y={frontOy + (plateHeight - beam_h) * frontScale / 2}
              width={beam_b * frontScale} height={beam_h * frontScale}
              fill="none" stroke="#1e40af" strokeWidth="0.8" strokeDasharray="4,2" />

        {/* Beam flanges (solid) */}
        <rect x={frontOx + (plateWidth - beam_b) * frontScale / 2}
              y={frontOy + (plateHeight - beam_h) * frontScale / 2}
              width={beam_b * frontScale} height={beam_tf * frontScale}
              fill="#dbeafe" fillOpacity="0.8" stroke="#1e40af" strokeWidth="0.8" />
        <rect x={frontOx + (plateWidth - beam_b) * frontScale / 2}
              y={frontOy + (plateHeight + beam_h) * frontScale / 2 - beam_tf * frontScale}
              width={beam_b * frontScale} height={beam_tf * frontScale}
              fill="#dbeafe" fillOpacity="0.8" stroke="#1e40af" strokeWidth="0.8" />

        {/* Beam web (solid) */}
        <rect x={frontOx + (plateWidth - beam_tw) * frontScale / 2}
              y={frontOy + (plateHeight - beam_h) * frontScale / 2 + beam_tf * frontScale}
              width={beam_tw * frontScale} height={(beam_h - 2 * beam_tf) * frontScale}
              fill="#dbeafe" fillOpacity="0.6" stroke="#1e40af" strokeWidth="0.8" />

        {/* Bolts */}
        <g fill="#475569" stroke="#1e293b" strokeWidth="0.8">
          {boltPositions.map((yPos, i) => {
            const by = frontOy + yPos * frontScale;
            const bx1 = frontOx + e_side * frontScale;
            const bx2 = frontOx + (plateWidth - e_side) * frontScale;
            const boltR = boltDiameter * frontScale / 2.5;
            return (
              <g key={i}>
                <circle cx={bx1} cy={by} r={boltR} />
                <circle cx={bx2} cy={by} r={boltR} />
              </g>
            );
          })}
        </g>

        {/* Dimension lines for front view */}
        <g stroke="#94a3b8" strokeWidth="0.5" fill="none" fontSize="7">
          {/* Width */}
          <line x1={frontOx} y1={frontOy + plateHeight * frontScale + 10}
                x2={frontOx + plateWidth * frontScale} y2={frontOy + plateHeight * frontScale + 10} />
          <line x1={frontOx} y1={frontOy + plateHeight * frontScale + 5}
                x2={frontOx} y2={frontOy + plateHeight * frontScale + 15} />
          <line x1={frontOx + plateWidth * frontScale} y1={frontOy + plateHeight * frontScale + 5}
                x2={frontOx + plateWidth * frontScale} y2={frontOy + plateHeight * frontScale + 15} />
          <text x={frontOx + plateWidth * frontScale / 2} y={frontOy + plateHeight * frontScale + 22}
                textAnchor="middle" fill="#64748b">{plateWidth}</text>

          {/* Height */}
          <line x1={frontOx - 10} y1={frontOy}
                x2={frontOx - 10} y2={frontOy + plateHeight * frontScale} />
          <line x1={frontOx - 15} y1={frontOy} x2={frontOx - 5} y2={frontOy} />
          <line x1={frontOx - 15} y1={frontOy + plateHeight * frontScale}
                x2={frontOx - 5} y2={frontOy + plateHeight * frontScale} />
          <text x={frontOx - 18} y={frontOy + plateHeight * frontScale / 2}
                textAnchor="middle" fill="#64748b" transform={`rotate(-90, ${frontOx - 18}, ${frontOy + plateHeight * frontScale / 2})`}>
            {plateHeight}
          </text>

          {/* Bolt spacing */}
          {nBoltRows >= 2 && (
            <>
              <line x1={frontOx + plateWidth * frontScale + 8} y1={frontOy + e_top * frontScale}
                    x2={frontOx + plateWidth * frontScale + 8} y2={frontOy + (e_top + p_rows) * frontScale} />
              <text x={frontOx + plateWidth * frontScale + 15} y={frontOy + (e_top + p_rows / 2) * frontScale + 3}
                    textAnchor="start" fill="#64748b">{p_rows}</text>
            </>
          )}
        </g>

        {/* Bolt description */}
        <text x={frontOx + plateWidth * frontScale / 2} y={frontOy + plateHeight * frontScale + 38}
              fontSize="9" fill="#475569" textAnchor="middle">
          {nBoltRows * nBoltsPerRow}× M{boltDiameter} - {boltClass}
        </text>
      </svg>
    );
  };

  // M-φ diagram
  const renderMPhiDiagram = () => {
    if (!result) return null;

    const svgW = 200;
    const svgH = 100;
    const margin = { top: 15, right: 15, bottom: 25, left: 35 };
    const w = svgW - margin.left - margin.right;
    const h = svgH - margin.top - margin.bottom;

    const M_jRd = result.M_jRd;
    const phi_2_3 = result.phi_Xd * 1000; // mrad
    const phi_Rd = result.phi_Cd * 1000; // mrad

    const maxPhi = phi_Rd * 1.5;
    const maxM = M_jRd * 1.2;

    const xScale = (phi: number) => margin.left + (phi / maxPhi) * w;
    const yScale = (m: number) => margin.top + h - (m / maxM) * h;

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="m-phi-svg">
        {/* Axes */}
        <line x1={margin.left} y1={margin.top + h} x2={margin.left + w} y2={margin.top + h} stroke="#94a3b8" strokeWidth="1" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + h} stroke="#94a3b8" strokeWidth="1" />

        {/* Classification zones */}
        <rect x={margin.left} y={yScale(M_jRd)} width={w} height={yScale(2/3 * M_jRd) - yScale(M_jRd)}
              fill="#22c55e" fillOpacity="0.1" />

        {/* M-φ curve */}
        <path
          d={`M ${xScale(0)} ${yScale(0)} L ${xScale(phi_2_3)} ${yScale(2/3 * M_jRd)} L ${xScale(phi_Rd)} ${yScale(M_jRd)} L ${xScale(maxPhi)} ${yScale(M_jRd)}`}
          stroke="#2563eb" strokeWidth="2" fill="none" />

        {/* Operating point */}
        <circle cx={xScale(M_Ed / result.S_j_ini * 1000)} cy={yScale(M_Ed)} r="4" fill="#ef4444" />

        {/* Labels */}
        <text x={margin.left + w / 2} y={svgH - 5} fontSize="8" fill="#64748b" textAnchor="middle">φ [mrad]</text>
        <text x="8" y={margin.top + h / 2} fontSize="8" fill="#64748b" textAnchor="middle" transform={`rotate(-90, 8, ${margin.top + h / 2})`}>M [kNm]</text>

        {/* M_jRd line */}
        <line x1={margin.left} y1={yScale(M_jRd)} x2={margin.left + w} y2={yScale(M_jRd)} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />
        <text x={margin.left - 3} y={yScale(M_jRd) + 3} fontSize="7" fill="#64748b" textAnchor="end">{M_jRd.toFixed(1)}</text>

        {/* Classification label */}
        <text x={margin.left + w - 5} y={margin.top + 10} fontSize="8" fill="#22c55e" textAnchor="end" fontWeight="600">
          {result.classification}
        </text>
      </svg>
    );
  };

  return (
    <>
      <div className="steel-conn-overlay" onClick={onClose} />
      <div className="steel-conn-dialog">
        <h3>Moment Connection — NEN-EN 1993-1-8</h3>

        <div className="steel-conn-layout">
          <div className="steel-conn-inputs">
            {/* Profiles */}
            <div className="steel-conn-section">
              <h4>Profiles</h4>
              <div className="steel-conn-row">
                <label>Beam</label>
                <select value={beamProfileName} onChange={e => setBeamProfileName(e.target.value)}>
                  {iProfiles.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>Column</label>
                <select value={colProfileName} onChange={e => setColProfileName(e.target.value)}>
                  {iProfiles.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>Steel grade</label>
                <select value={fy} onChange={e => setFy(Number(e.target.value))}>
                  <option value={235}>S235</option>
                  <option value={275}>S275</option>
                  <option value={355}>S355</option>
                  <option value={460}>S460</option>
                </select>
              </div>
              <div className="steel-conn-row">
                <label>Beam length</label>
                <input type="number" value={beamLength} onChange={e => setBeamLength(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
            </div>

            {/* Bolts */}
            <div className="steel-conn-section">
              <h4>Bolts</h4>
              <div className="steel-conn-row">
                <label>Diameter</label>
                <select value={boltDiameter} onChange={e => setBoltDiameter(Number(e.target.value))}>
                  {getAvailableBoltDiameters().map(d => <option key={d} value={d}>M{d}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>Class</label>
                <select value={boltClass} onChange={e => setBoltClass(e.target.value)}>
                  {getAvailableBoltClasses().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>Bolt rows</label>
                <input type="number" min={1} max={4} value={nBoltRows} onChange={e => setNBoltRows(Number(e.target.value))} />
              </div>
              <div className="steel-conn-row">
                <label>e (top)</label>
                <input type="number" value={e_top} onChange={e => setETop(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>p (rows)</label>
                <input type="number" value={p_rows} onChange={e => setPRows(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>p (bolts)</label>
                <input type="number" value={p_bolts} onChange={e => setPBolts(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>e (side)</label>
                <input type="number" value={e_side} onChange={e => setESide(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
            </div>

            {/* End Plate */}
            <div className="steel-conn-section">
              <h4>End Plate</h4>
              <div className="steel-conn-row">
                <label>Thickness tp</label>
                <input type="number" value={plateThickness} onChange={e => setPlateThickness(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>Width bp</label>
                <input type="number" value={plateWidth} onChange={e => setPlateWidth(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>Height hp</label>
                <input type="number" value={plateHeight} onChange={e => setPlateHeight(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
            </div>

            {/* Welds */}
            <div className="steel-conn-section">
              <h4>Welds</h4>
              <div className="steel-conn-row">
                <label>a flange</label>
                <input type="number" value={a_ef} onChange={e => setAef(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
              <div className="steel-conn-row">
                <label>a web</label>
                <input type="number" value={a_ew} onChange={e => setAew(Number(e.target.value))} />
                <span className="unit">mm</span>
              </div>
            </div>

            {/* Design Forces */}
            <div className="steel-conn-section">
              <h4>Design Forces (Ed)</h4>
              <div className="steel-conn-row">
                <label>M_Ed</label>
                <input type="number" step="0.1" value={M_Ed} onChange={e => setM_Ed(Number(e.target.value))} />
                <span className="unit">kNm</span>
              </div>
              <div className="steel-conn-row">
                <label>V_Ed</label>
                <input type="number" step="0.1" value={V_Ed} onChange={e => setV_Ed(Number(e.target.value))} />
                <span className="unit">kN</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="steel-conn-preview">
            {renderParametricDrawing()}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="steel-conn-results">
            <h4>Results</h4>

            <div className="steel-conn-result-cards">
              <div className={`result-card ${result.status === 'OK' ? 'ok' : 'fail'}`}>
                <div className="value">{result.M_jRd.toFixed(2)}</div>
                <div className="label">M_j,Rd [kNm]</div>
              </div>
              <div className={`result-card ${result.UC_V <= 1 ? 'ok' : 'fail'}`}>
                <div className="value">{result.V_Rd.toFixed(1)}</div>
                <div className="label">V_Rd [kN]</div>
              </div>
              <div className={`result-card`}>
                <div className="value">{result.S_j_ini.toFixed(0)}</div>
                <div className="label">S_j,ini [kNm/rad]</div>
              </div>
              <div className={`result-card`}>
                <div className="value">{result.classification}</div>
                <div className="label">Classification</div>
              </div>
            </div>

            {/* Component checks */}
            <div className="component-checks">
              {result.components.map((comp, i) => (
                <div key={i} className="component-check">
                  <span className="name">{comp.name}</span>
                  <span className="article">{comp.article}</span>
                  <div className="uc-bar">
                    <div className={`uc-bar-fill ${ucClass(comp.UC)}`} style={{ width: `${Math.min(comp.UC * 100, 100)}%` }} />
                  </div>
                  <span className={`uc-value ${ucClass(comp.UC)}`}>{comp.UC.toFixed(2)}</span>
                  <span className={`status-icon ${comp.status === 'OK' ? 'ok' : 'fail'}`}>
                    {comp.status === 'OK' ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>

            {/* Bolt row table */}
            {result.boltRows.length > 0 && (
              <div className="bolt-row-table">
                <h5>Bolt Row Resistances</h5>
                <table className="steel-conn-bolt-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>h_r [mm]</th>
                      <th>F_cf [kN]</th>
                      <th>F_ep [kN]</th>
                      <th>F_wc [kN]</th>
                      <th>F_tr,Rd [kN]</th>
                      <th>Limiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.boltRows.map(row => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.h_r.toFixed(0)}</td>
                        <td>{row.F_T_cf_Rd.toFixed(1)} ({row.mode_cf})</td>
                        <td>{row.F_T_ep_Rd.toFixed(1)} ({row.mode_ep})</td>
                        <td>{row.F_t_wc_Rd.toFixed(1)}</td>
                        <td style={{ fontWeight: 600 }}>{row.F_tr_Rd.toFixed(1)}</td>
                        <td style={{ fontSize: 9 }}>{row.limitingComponent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* M-φ Diagram */}
            <div className="m-phi-section">
              <h5>M-φ Diagram</h5>
              {renderMPhiDiagram()}
            </div>

            <div className={`steel-conn-status ${result.status === 'OK' ? 'pass' : 'fail'}`}>
              UC = {result.UC_max.toFixed(3)} — {result.status === 'OK' ? 'PASS' : 'FAIL'}
              <br />
              <small>Governing: {result.governingCheck}</small>
            </div>
          </div>
        )}

        <div className="steel-conn-actions">
          <button onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </>
  );
}
