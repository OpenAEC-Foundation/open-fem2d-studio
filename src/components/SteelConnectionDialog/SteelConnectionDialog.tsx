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
  const [beamProfileName, setBeamProfileName] = useState('HEA 200');
  const [colProfileName, setColProfileName] = useState('HEB 200');

  // Bolt config
  const [boltDiameter, setBoltDiameter] = useState(24);
  const [boltClass, setBoltClass] = useState('10.9');
  const [boltRows, setBoltRows] = useState(2);

  // End plate
  const [plateThickness, setPlateThickness] = useState(20);
  const [plateWidth, setPlateWidth] = useState(200);
  const [plateHeight, setPlateHeight] = useState(400);

  // Design forces
  const [M_Ed, setM_Ed] = useState(100);
  const [V_Ed, setV_Ed] = useState(50);

  // Steel grade
  const [fy, setFy] = useState(355);

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

    const cfg: IMomentConnectionConfig = {
      beam_h: sc[0],
      beam_b: sc[1],
      beam_tw: sc[2],
      beam_tf: sc[3],
      beam_fy: fy,
      beamProfileName,
      col_h: cc[0],
      col_b: cc[1],
      col_tw: cc[2],
      col_tf: cc[3],
      col_fy: fy,
      colProfileName,
      boltDiameter,
      boltClass,
      boltRows,
      plate_tp: plateThickness,
      plate_bp: plateWidth,
      plate_hp: plateHeight,
      plate_fy: fy,
      M_Ed,
      V_Ed,
    };

    try {
      return designMomentConnection(cfg);
    } catch {
      return null;
    }
  }, [beamProfile, colProfile, boltDiameter, boltClass, boltRows, plateThickness, plateWidth, plateHeight, fy, M_Ed, V_Ed, beamProfileName, colProfileName]);

  const ucColor = (uc: number) => uc <= 1.0 ? 'var(--success)' : 'var(--danger)';

  const renderUCBar = (label: string, uc: number) => (
    <div className="steel-conn-uc-row">
      <span className="steel-conn-uc-label">{label}</span>
      <div className="steel-conn-uc-track">
        <div
          className="steel-conn-uc-fill"
          style={{ width: `${Math.min(uc * 100, 100)}%`, background: ucColor(uc) }}
        />
      </div>
      <span className="steel-conn-uc-value" style={{ color: ucColor(uc) }}>
        {uc.toFixed(3)}
      </span>
    </div>
  );

  // SVG preview of the connection
  const renderPreview = () => {
    if (!beamProfile || !colProfile) return null;
    const sc = beamProfile.data.shape_coords;
    const cc = colProfile.data.shape_coords;

    const beamH = sc[0];
    const beamTf = sc[3];
    const colH = cc[0];
    const colTw = cc[2];
    const colTf = cc[3];

    // Scale to fit in SVG
    const scale = 0.5;
    const ox = 20;
    const oy = 20;
    const svgW = 250;
    const svgH = Math.max(beamH, colH) * scale + 80;

    const colLeft = ox;
    const colRight = colLeft + colH * scale;
    const plateLeft = colRight;
    const plateRight = plateLeft + plateThickness * scale;
    const beamLeft = plateRight;
    const beamRight = beamLeft + 100;

    const midY = oy + svgH / 2 - 20;
    const beamTop = midY - beamH * scale / 2;
    const beamBot = midY + beamH * scale / 2;
    const colTop = midY - colH * scale / 2;
    const colBot = midY + colH * scale / 2;
    const plateTop = midY - plateHeight * scale / 2;
    const plateBot = midY + plateHeight * scale / 2;

    // Bolt positions
    const bolts: { x: number; y: number }[] = [];
    const boltX = plateLeft + plateThickness * scale / 2;
    const e_x = 40 * scale;
    const p = 70 * scale;
    // Row 1 above beam
    bolts.push({ x: boltX, y: beamTop - e_x * 0.5 });
    // Row 2 below top flange
    bolts.push({ x: boltX, y: beamTop + beamTf * scale + 15 * scale });
    for (let i = 2; i < boltRows; i++) {
      bolts.push({ x: boltX, y: beamTop + beamTf * scale + 15 * scale + (i - 1) * p });
    }

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ background: 'var(--bg-secondary)', borderRadius: 4 }}>
        {/* Column */}
        <rect x={colLeft} y={colTop} width={colTf * scale} height={(colBot - colTop)} fill="var(--accent)" opacity={0.3} stroke="var(--accent)" strokeWidth={0.5} />
        <rect x={colLeft} y={colTop} width={colH * scale} height={colTf * scale} fill="var(--accent)" opacity={0.3} stroke="var(--accent)" strokeWidth={0.5} />
        <rect x={colLeft} y={colBot - colTf * scale} width={colH * scale} height={colTf * scale} fill="var(--accent)" opacity={0.3} stroke="var(--accent)" strokeWidth={0.5} />
        <rect x={colLeft + (colH - colTw) * scale / 2} y={colTop + colTf * scale} width={colTw * scale} height={(colBot - colTop - 2 * colTf * scale)} fill="var(--accent)" opacity={0.2} stroke="var(--accent)" strokeWidth={0.5} />

        {/* End plate */}
        <rect x={plateLeft} y={plateTop} width={plateThickness * scale} height={(plateBot - plateTop)} fill="#fbbf24" opacity={0.4} stroke="#f59e0b" strokeWidth={0.8} />

        {/* Beam */}
        <rect x={beamLeft} y={beamTop} width={(beamRight - beamLeft)} height={beamTf * scale} fill="var(--accent)" opacity={0.5} stroke="var(--accent)" strokeWidth={0.5} />
        <rect x={beamLeft} y={beamBot - beamTf * scale} width={(beamRight - beamLeft)} height={beamTf * scale} fill="var(--accent)" opacity={0.5} stroke="var(--accent)" strokeWidth={0.5} />
        <rect x={beamLeft} y={beamTop + beamTf * scale} width={sc[2] * scale} height={(beamBot - beamTop - 2 * beamTf * scale)} fill="var(--accent)" opacity={0.3} stroke="var(--accent)" strokeWidth={0.5} />

        {/* Bolts */}
        {bolts.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={boltDiameter * scale / 4} fill="#ef4444" stroke="#dc2626" strokeWidth={0.5} />
        ))}

        {/* Labels */}
        <text x={colLeft + colH * scale / 2} y={colBot + 14} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{colProfileName}</text>
        <text x={beamLeft + 50} y={beamTop - 6} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{beamProfileName}</text>
        <text x={plateLeft + plateThickness * scale / 2} y={plateBot + 14} fontSize={7} fill="#f59e0b" textAnchor="middle">tp={plateThickness}</text>
      </svg>
    );
  };

  return (
    <>
      <div className="steel-conn-overlay" onClick={onClose} />
      <div className="steel-conn-dialog">
        <h3>{t('steelConn.title')}</h3>

        <div className="steel-conn-layout">
          <div className="steel-conn-inputs">
            {/* Beam profile */}
            <div className="steel-conn-section">
              <h4>{t('steelConn.beamProfile')}</h4>
              <div className="steel-conn-row">
                <label>{t('barProps.profile')}</label>
                <select value={beamProfileName} onChange={e => setBeamProfileName(e.target.value)}>
                  {iProfiles.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Column profile */}
            <div className="steel-conn-section">
              <h4>{t('steelConn.columnProfile')}</h4>
              <div className="steel-conn-row">
                <label>{t('barProps.profile')}</label>
                <select value={colProfileName} onChange={e => setColProfileName(e.target.value)}>
                  {iProfiles.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Bolts */}
            <div className="steel-conn-section">
              <h4>{t('steelConn.boltConfig')}</h4>
              <div className="steel-conn-row">
                <label>{t('steelConn.boltDiameter')}</label>
                <select value={boltDiameter} onChange={e => setBoltDiameter(Number(e.target.value))}>
                  {getAvailableBoltDiameters().map(d => <option key={d} value={d}>M{d}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>{t('steelConn.boltClass')}</label>
                <select value={boltClass} onChange={e => setBoltClass(e.target.value)}>
                  {getAvailableBoltClasses().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="steel-conn-row">
                <label>{t('steelConn.boltRows')}</label>
                <input type="number" min={1} max={4} value={boltRows} onChange={e => setBoltRows(Number(e.target.value))} />
              </div>
            </div>

            {/* End Plate */}
            <div className="steel-conn-section">
              <h4>{t('steelConn.endPlate')}</h4>
              <div className="steel-conn-row">
                <label>{t('steelConn.plateThickness')}</label>
                <input type="number" value={plateThickness} onChange={e => setPlateThickness(Number(e.target.value))} />
              </div>
              <div className="steel-conn-row">
                <label>{t('steelConn.plateWidth')}</label>
                <input type="number" value={plateWidth} onChange={e => setPlateWidth(Number(e.target.value))} />
              </div>
              <div className="steel-conn-row">
                <label>{t('steelConn.plateHeight')}</label>
                <input type="number" value={plateHeight} onChange={e => setPlateHeight(Number(e.target.value))} />
              </div>
              <div className="steel-conn-row">
                <label>fy (MPa)</label>
                <select value={fy} onChange={e => setFy(Number(e.target.value))}>
                  <option value={235}>S235</option>
                  <option value={275}>S275</option>
                  <option value={355}>S355</option>
                  <option value={460}>S460</option>
                </select>
              </div>
            </div>

            {/* Design Forces */}
            <div className="steel-conn-section">
              <h4>Ed</h4>
              <div className="steel-conn-row">
                <label>M_Ed (kNm)</label>
                <input type="number" value={M_Ed} onChange={e => setM_Ed(Number(e.target.value))} />
              </div>
              <div className="steel-conn-row">
                <label>V_Ed (kN)</label>
                <input type="number" value={V_Ed} onChange={e => setV_Ed(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="steel-conn-preview">
            <h4>Preview</h4>
            {renderPreview()}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="steel-conn-results">
            <h4>{t('steelConn.results')}</h4>

            <div className="steel-conn-row">
              <label>{t('steelConn.momentCapacity')}</label>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{result.M_jRd.toFixed(1)} kNm</span>
            </div>
            <div className="steel-conn-row">
              <label>{t('steelConn.shearCapacity')}</label>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{result.V_wpRd.toFixed(1)} kN</span>
            </div>

            {renderUCBar('M_Ed / M_jRd', result.UC_M)}
            {renderUCBar('V_Ed / V_wpRd', result.UC_V)}

            {/* Bolt row table */}
            {result.boltRows.length > 0 && (
              <table className="steel-conn-bolt-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>h_r (mm)</th>
                    <th>Mode 1</th>
                    <th>Mode 2</th>
                    <th>Mode 3</th>
                    <th>F_tRd (kN)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.boltRows.map(row => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      <td>{row.h_r.toFixed(0)}</td>
                      <td>{row.F_tRd_mode1.toFixed(1)}</td>
                      <td>{row.F_tRd_mode2.toFixed(1)}</td>
                      <td>{row.F_tRd_mode3.toFixed(1)}</td>
                      <td style={{ fontWeight: 600 }}>{row.F_tRd.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className={`steel-conn-status ${result.status === 'OK' ? 'pass' : 'fail'}`}>
              UC = {result.UC_max.toFixed(3)} — {result.status === 'OK' ? t('ribbon.codeCheck.pass') : t('ribbon.codeCheck.fail')}
              <br />
              <small>{result.governingMode}</small>
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
