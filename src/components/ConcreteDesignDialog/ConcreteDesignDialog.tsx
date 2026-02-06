import { useState, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import { X } from 'lucide-react';
import {
  CONCRETE_DESIGN_GRADES,
  REINFORCEMENT_DESIGN_GRADES,
  IConcreteDesignSection,
  IReinforcementConfig,
  ConcreteShapeType,
  designConcreteBeam,
  calculateEffectiveDepth,
  suggestBarArrangement,
  IConcreteDesignResult,
} from '../../core/materials/ConcreteDesign';
import './ConcreteDesignDialog.css';

interface ConcreteDesignDialogProps {
  onClose: () => void;
}

export function ConcreteDesignDialog({ onClose }: ConcreteDesignDialogProps) {
  const { state } = useFEM();
  const { result, mesh } = state;

  // Shape
  const [shape, setShape] = useState<ConcreteShapeType>('rectangle');

  // Dimensions
  const [hMm, setHMm] = useState(500);
  const [bMm, setBMm] = useState(300);
  const [bfMm, setBfMm] = useState(600);
  const [hfMm, setHfMm] = useState(120);

  // Cover
  const [coverTop, setCoverTop] = useState(30);
  const [coverBottom, setCoverBottom] = useState(30);
  const [coverSide, setCoverSide] = useState(30);

  // Materials
  const [concreteIdx, setConcreteIdx] = useState(2); // C30/37
  const [mainSteelIdx, setMainSteelIdx] = useState(1); // B500B
  const [stirrupSteelIdx, setStirrupSteelIdx] = useState(1); // B500B

  // Reinforcement
  const [mainBarDia, setMainBarDia] = useState(16);
  const [nBarsBottom, setNBarsBottom] = useState(4);
  const [nBarsTop, setNBarsTop] = useState(2);
  const [stirrupDia, setStirrupDia] = useState(8);
  const [stirrupSpacing, setStirrupSpacing] = useState(200);

  // Selected beam
  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(null);

  const concrete = CONCRETE_DESIGN_GRADES[concreteIdx];
  const mainSteel = REINFORCEMENT_DESIGN_GRADES[mainSteelIdx];
  const stirrupSteel = REINFORCEMENT_DESIGN_GRADES[stirrupSteelIdx];

  // List of beams in the model
  const beamList = useMemo(() => {
    const beams: { id: number; name: string; MEd: number; VEd: number }[] = [];
    for (const beam of mesh.beamElements.values()) {
      let MEd = 0;
      let VEd = 0;
      if (result) {
        const forces = result.beamForces.get(beam.id);
        if (forces) {
          MEd = Math.max(Math.abs(forces.maxM), Math.abs(forces.M1), Math.abs(forces.M2));
          VEd = Math.max(Math.abs(forces.maxV), Math.abs(forces.V1), Math.abs(forces.V2));
        }
      }
      beams.push({
        id: beam.id,
        name: beam.profileName || `Beam ${beam.id}`,
        MEd,
        VEd,
      });
    }
    return beams;
  }, [mesh, result]);

  const section: IConcreteDesignSection = {
    shape,
    h: hMm,
    b: bMm,
    bf: shape !== 'rectangle' ? bfMm : undefined,
    hf: shape !== 'rectangle' ? hfMm : undefined,
    coverTop,
    coverBottom,
    coverSide,
  };

  const reinforcement: IReinforcementConfig = {
    mainBarDiameter: mainBarDia,
    nBarsBottom,
    nBarsTop,
    stirrupDiameter: stirrupDia,
    stirrupSpacing,
  };

  // Get forces for selected beam (or use max across all beams)
  const designForces = useMemo(() => {
    if (selectedBeamId !== null) {
      const entry = beamList.find(b => b.id === selectedBeamId);
      if (entry) return { MEd: entry.MEd, VEd: entry.VEd };
    }
    // Use maximum forces across all beams
    if (beamList.length > 0) {
      const maxMEd = Math.max(...beamList.map(b => b.MEd));
      const maxVEd = Math.max(...beamList.map(b => b.VEd));
      return { MEd: maxMEd, VEd: maxVEd };
    }
    return { MEd: 0, VEd: 0 };
  }, [selectedBeamId, beamList]);

  // Run design
  const designResult: IConcreteDesignResult = useMemo(() => {
    return designConcreteBeam(
      designForces.MEd, designForces.VEd,
      section, reinforcement,
      concrete, mainSteel, stirrupSteel,
    );
  }, [designForces, section, reinforcement, concrete, mainSteel, stirrupSteel]);

  // Suggest optimal reinforcement
  const suggestion = useMemo(() => {
    return suggestBarArrangement(designResult.AsReqBottom);
  }, [designResult.AsReqBottom]);

  const d = calculateEffectiveDepth(section, reinforcement);

  const ucColor = (uc: number) =>
    uc <= 0.85 ? 'var(--success)' : uc <= 1.0 ? 'var(--warning)' : '#ef4444';
  const ucClass = (uc: number) =>
    uc <= 0.85 ? 'ok' : uc <= 1.0 ? 'warn' : 'fail';

  return (
    <div className="concrete-design-overlay" onClick={onClose}>
      <div className="concrete-design-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="concrete-design-header">
          <div className="concrete-design-header-title">
            Concrete Reinforcement Design — EN 1992-1-1
          </div>
          <button onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="concrete-design-body">
          {/* Left column — Input parameters */}
          <div className="concrete-design-left">
            {/* Beam Selection */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Beam Selection</div>
              {beamList.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>
                  No beam elements in model. Run analysis first.
                </div>
              ) : (
                <div className="concrete-design-beam-list">
                  <div
                    className={`concrete-design-beam-item ${selectedBeamId === null ? 'selected' : ''}`}
                    onClick={() => setSelectedBeamId(null)}
                  >
                    <span>All beams (envelope)</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      Max M/V
                    </span>
                  </div>
                  {beamList.map(b => (
                    <div
                      key={b.id}
                      className={`concrete-design-beam-item ${selectedBeamId === b.id ? 'selected' : ''}`}
                      onClick={() => setSelectedBeamId(b.id)}
                    >
                      <span>{b.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                        M={(b.MEd / 1000).toFixed(1)} kNm | V={(b.VEd / 1000).toFixed(0)} kN
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cross-section shape */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Cross-section</div>
              <div className="concrete-design-shape-btns">
                {(['rectangle', 'T', 'L'] as ConcreteShapeType[]).map(s => (
                  <button
                    key={s}
                    className={`concrete-design-shape-btn ${shape === s ? 'active' : ''}`}
                    onClick={() => setShape(s)}
                  >
                    {s === 'rectangle' ? 'Rectangle' : s === 'T' ? 'T-Profile' : 'L-Profile'}
                  </button>
                ))}
              </div>

              {/* Shape preview */}
              <div className="concrete-design-shape-preview">
                <ShapePreviewSVG shape={shape} h={hMm} b={bMm} bf={bfMm} hf={hfMm} />
              </div>

              {/* Dimensions */}
              <div className="concrete-design-row">
                <label>Height (h)</label>
                <input type="number" value={hMm} min={100} max={3000} step={10} onChange={e => setHMm(parseInt(e.target.value) || 500)} />
                <span className="unit">mm</span>
              </div>
              <div className="concrete-design-row">
                <label>Width (b)</label>
                <input type="number" value={bMm} min={100} max={2000} step={10} onChange={e => setBMm(parseInt(e.target.value) || 300)} />
                <span className="unit">mm</span>
              </div>
              {shape !== 'rectangle' && (
                <>
                  <div className="concrete-design-row">
                    <label>Flange width (bf)</label>
                    <input type="number" value={bfMm} min={bMm} max={3000} step={10} onChange={e => setBfMm(parseInt(e.target.value) || 600)} />
                    <span className="unit">mm</span>
                  </div>
                  <div className="concrete-design-row">
                    <label>Flange depth (hf)</label>
                    <input type="number" value={hfMm} min={50} max={500} step={10} onChange={e => setHfMm(parseInt(e.target.value) || 120)} />
                    <span className="unit">mm</span>
                  </div>
                </>
              )}
            </div>

            {/* Materials */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Materials</div>
              <div className="concrete-design-row">
                <label>Concrete grade</label>
                <select value={concreteIdx} onChange={e => setConcreteIdx(parseInt(e.target.value))}>
                  {CONCRETE_DESIGN_GRADES.map((g, i) => (
                    <option key={g.name} value={i}>{g.name} (fcd={g.fcd.toFixed(1)} MPa)</option>
                  ))}
                </select>
              </div>
              <div className="concrete-design-row">
                <label>Main rebar steel</label>
                <select value={mainSteelIdx} onChange={e => setMainSteelIdx(parseInt(e.target.value))}>
                  {REINFORCEMENT_DESIGN_GRADES.map((g, i) => (
                    <option key={g.name} value={i}>{g.name} (fyd={g.fyd.toFixed(0)} MPa)</option>
                  ))}
                </select>
              </div>
              <div className="concrete-design-row">
                <label>Stirrup steel</label>
                <select value={stirrupSteelIdx} onChange={e => setStirrupSteelIdx(parseInt(e.target.value))}>
                  {REINFORCEMENT_DESIGN_GRADES.map((g, i) => (
                    <option key={g.name} value={i}>{g.name} (fyd={g.fyd.toFixed(0)} MPa)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cover */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Cover (to stirrup)</div>
              <div className="concrete-design-row">
                <label>Bottom</label>
                <input type="number" value={coverBottom} min={15} max={80} step={5} onChange={e => setCoverBottom(parseInt(e.target.value) || 30)} />
                <span className="unit">mm</span>
              </div>
              <div className="concrete-design-row">
                <label>Side</label>
                <input type="number" value={coverSide} min={15} max={80} step={5} onChange={e => setCoverSide(parseInt(e.target.value) || 30)} />
                <span className="unit">mm</span>
              </div>
              <div className="concrete-design-row">
                <label>Top</label>
                <input type="number" value={coverTop} min={15} max={80} step={5} onChange={e => setCoverTop(parseInt(e.target.value) || 30)} />
                <span className="unit">mm</span>
              </div>
            </div>

            {/* Reinforcement */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Reinforcement</div>
              <div className="concrete-design-row">
                <label>Main bar dia</label>
                <select value={mainBarDia} onChange={e => setMainBarDia(parseInt(e.target.value))}>
                  {[8, 10, 12, 16, 20, 25, 32, 40].map(d => (
                    <option key={d} value={d}>{d} mm</option>
                  ))}
                </select>
              </div>
              <div className="concrete-design-row">
                <label>Bars bottom</label>
                <input type="number" value={nBarsBottom} min={1} max={16} step={1} onChange={e => setNBarsBottom(parseInt(e.target.value) || 2)} />
                <span className="unit">pcs</span>
              </div>
              <div className="concrete-design-row">
                <label>Bars top</label>
                <input type="number" value={nBarsTop} min={0} max={16} step={1} onChange={e => setNBarsTop(parseInt(e.target.value) || 0)} />
                <span className="unit">pcs</span>
              </div>
              <div className="concrete-design-row">
                <label>Stirrup dia</label>
                <select value={stirrupDia} onChange={e => setStirrupDia(parseInt(e.target.value))}>
                  {[6, 8, 10, 12].map(d => (
                    <option key={d} value={d}>{d} mm</option>
                  ))}
                </select>
              </div>
              <div className="concrete-design-row">
                <label>Stirrup spacing</label>
                <input type="number" value={stirrupSpacing} min={50} max={500} step={25} onChange={e => setStirrupSpacing(parseInt(e.target.value) || 200)} />
                <span className="unit">mm</span>
              </div>
            </div>
          </div>

          {/* Right column — Results */}
          <div className="concrete-design-right">
            {/* Effective depth */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Effective Depth</div>
              <div className="concrete-design-result-item">
                <span className="label">d = h - c_bot - dia_stirrup - dia_main/2</span>
                <span className="value">{d.toFixed(0)} mm</span>
              </div>
            </div>

            {/* Design forces */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Design Forces</div>
              <div className="concrete-design-results">
                <div className="concrete-design-result-item">
                  <span className="label">M_Ed</span>
                  <span className="value">{(designResult.MEd / 1000).toFixed(2)} kNm</span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">V_Ed</span>
                  <span className="value">{(designResult.VEd / 1000).toFixed(1)} kN</span>
                </div>
              </div>
            </div>

            {/* Bending results */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Bending Design (EC2 6.1)</div>
              <div className="concrete-design-results">
                <div className="concrete-design-result-item">
                  <span className="label">mu = M / (b*d²*fcd)</span>
                  <span className={`value ${ucClass(designResult.UC_bending)}`}>
                    {designResult.mu.toFixed(4)}
                  </span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">mu_lim</span>
                  <span className="value">{designResult.muLim.toFixed(3)}</span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">omega</span>
                  <span className="value">{designResult.omega.toFixed(4)}</span>
                </div>
                <div className="concrete-design-result-divider" />
                <div className="concrete-design-result-item">
                  <span className="label">As,req (bottom)</span>
                  <span className="value">{designResult.AsReqBottom.toFixed(0)} mm²</span>
                </div>
                {designResult.AsReqTop > 0 && (
                  <div className="concrete-design-result-item">
                    <span className="label">As,req (top/compr.)</span>
                    <span className="value">{designResult.AsReqTop.toFixed(0)} mm²</span>
                  </div>
                )}
                <div className="concrete-design-result-item">
                  <span className="label">As,min</span>
                  <span className="value">{designResult.AsMin.toFixed(0)} mm²</span>
                </div>
                <div className="concrete-design-result-divider" />
                <div className="concrete-design-result-item">
                  <span className="label">Suggestion</span>
                  <span className="value" style={{ color: 'var(--accent)' }}>
                    {suggestion.count}x dia {suggestion.diameter} = {suggestion.asProv.toFixed(0)} mm²
                  </span>
                </div>
                <div className="concrete-design-result-divider" />
                <div className="concrete-design-result-item">
                  <span className="label">As,prov (bottom)</span>
                  <span className={`value ${designResult.AsProvBottom >= designResult.AsReqBottom ? 'ok' : 'fail'}`}>
                    {designResult.AsProvBottom.toFixed(0)} mm²
                  </span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">As,prov (top)</span>
                  <span className="value">{designResult.AsProvTop.toFixed(0)} mm²</span>
                </div>

                {/* UC bending bar */}
                <div className="concrete-design-uc-bar">
                  <span className="concrete-design-uc-label">UC bending</span>
                  <div className="concrete-design-uc-track">
                    <div
                      className="concrete-design-uc-fill"
                      style={{
                        width: `${Math.min(designResult.UC_bending * 100, 100)}%`,
                        background: ucColor(designResult.UC_bending),
                      }}
                    />
                  </div>
                  <span
                    className="concrete-design-uc-value"
                    style={{ color: ucColor(designResult.UC_bending) }}
                  >
                    {designResult.UC_bending.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {/* Shear results */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Shear Design (EC2 6.2)</div>
              <div className="concrete-design-results">
                <div className="concrete-design-result-item">
                  <span className="label">VRd,c (no stirrups)</span>
                  <span className="value">{(designResult.VRdc / 1000).toFixed(1)} kN</span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">VRd,max (strut)</span>
                  <span className="value">{(designResult.VRdMax / 1000).toFixed(1)} kN</span>
                </div>
                <div className="concrete-design-result-divider" />
                <div className="concrete-design-result-item">
                  <span className="label">Asw/s required</span>
                  <span className="value">{designResult.AsswReq.toFixed(0)} mm²/m</span>
                </div>
                <div className="concrete-design-result-item">
                  <span className="label">Asw/s provided</span>
                  <span className={`value ${designResult.AsswProv >= designResult.AsswReq ? 'ok' : 'fail'}`}>
                    {designResult.AsswProv.toFixed(0)} mm²/m
                  </span>
                </div>

                {/* UC shear bar */}
                <div className="concrete-design-uc-bar">
                  <span className="concrete-design-uc-label">UC shear</span>
                  <div className="concrete-design-uc-track">
                    <div
                      className="concrete-design-uc-fill"
                      style={{
                        width: `${Math.min(designResult.UC_shear * 100, 100)}%`,
                        background: ucColor(designResult.UC_shear),
                      }}
                    />
                  </div>
                  <span
                    className="concrete-design-uc-value"
                    style={{ color: ucColor(designResult.UC_shear) }}
                  >
                    {designResult.UC_shear.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {/* Overall status */}
            <div className="concrete-design-section">
              <div className="concrete-design-section-title">Status</div>
              <div style={{
                textAlign: 'center',
                padding: '8px 0',
                fontSize: 14,
                fontWeight: 700,
                color: designResult.status === 'OK' ? 'var(--success)' : designResult.status === 'WARN' ? 'var(--warning)' : '#ef4444',
              }}>
                {designResult.status === 'OK' ? 'ADEQUATE' : designResult.status === 'WARN' ? 'WARNING' : 'INSUFFICIENT'}
              </div>
              {designResult.notes.length > 0 && (
                <div className="concrete-design-notes">
                  {designResult.notes.map((note, i) => (
                    <div key={i} className={
                      note.includes('FAIL') || note.includes('Insufficient') || note.includes('mu >') ? 'note-fail' :
                      note.includes('WARN') || note.includes('High') || note.includes('insufficient') ? 'note-warn' : ''
                    }>
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="concrete-design-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shape preview SVG
// ---------------------------------------------------------------------------

function ShapePreviewSVG({ shape, h, b, bf, hf }: {
  shape: ConcreteShapeType;
  h: number; b: number; bf: number; hf: number;
}) {
  const svgW = 160;
  const svgH = 100;
  const pad = 10;

  const scale = Math.min((svgW - 2 * pad) / (bf || b), (svgH - 2 * pad) / h) * 0.9;

  const sw = b * scale;
  const sh = h * scale;
  const sbf = (bf || b) * scale;
  const shf = (hf || 0) * scale;

  const cx = svgW / 2;
  const cy = svgH / 2;

  let path: string;
  if (shape === 'rectangle') {
    path = `M ${cx - sw / 2},${cy - sh / 2} h ${sw} v ${sh} h ${-sw} Z`;
  } else if (shape === 'T') {
    path = [
      `M ${cx - sbf / 2},${cy - sh / 2}`,
      `h ${sbf}`,
      `v ${shf}`,
      `h ${-(sbf - sw) / 2}`,
      `v ${sh - shf}`,
      `h ${-sw}`,
      `v ${-(sh - shf)}`,
      `h ${-(sbf - sw) / 2}`,
      'Z',
    ].join(' ');
  } else {
    // L-profile
    path = [
      `M ${cx - sbf / 2},${cy - sh / 2}`,
      `h ${sbf}`,
      `v ${shf}`,
      `h ${-(sbf - sw)}`,
      `v ${sh - shf}`,
      `h ${-sw}`,
      'Z',
    ].join(' ');
  }

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
      <path
        d={path}
        fill="rgba(128,128,128,0.2)"
        stroke="var(--text-secondary)"
        strokeWidth={1.5}
      />
      {/* Dimension labels */}
      <text x={cx} y={cy + sh / 2 + 12} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>
        b={b}
      </text>
      <text x={cx + (sbf || sw) / 2 + 8} y={cy} textAnchor="start" fill="var(--text-muted)" fontSize={8}>
        h={h}
      </text>
      {shape !== 'rectangle' && (
        <>
          <text x={cx} y={cy - sh / 2 - 4} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>
            bf={bf}
          </text>
          <text x={cx - sbf / 2 - 4} y={cy - sh / 2 + shf / 2 + 3} textAnchor="end" fill="var(--text-muted)" fontSize={7}>
            hf={hf}
          </text>
        </>
      )}
    </svg>
  );
}
