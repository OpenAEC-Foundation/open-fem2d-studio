import { useState, useMemo, useRef, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import {
  CONCRETE_DESIGN_GRADES,
  REINFORCEMENT_DESIGN_GRADES,
  IConcreteDesignSection,
  IReinforcementConfig,
  ConcreteShapeType,
  designConcreteBeam,
  calculateEffectiveDepth,
} from '../../core/materials/ConcreteDesign';
import { IBeamForces } from '../../core/fem/types';
import { X } from 'lucide-react';
import './ConcreteBeamView.css';

interface ConcreteBeamViewProps {
  onClose: () => void;
}

export function ConcreteBeamView({ onClose }: ConcreteBeamViewProps) {
  const { state } = useFEM();
  const { result, selection, mesh } = state;

  // Panel height
  const [panelHeight, setPanelHeight] = useState(280);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    resizeRef.current = { startY: e.clientY, startHeight: panelHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [panelHeight]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startY - e.clientY;
    setPanelHeight(Math.max(150, Math.min(600, resizeRef.current.startHeight + delta)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // Section parameters
  const [shape, setShape] = useState<ConcreteShapeType>('rectangle');
  const [hMm, setHMm] = useState(500);
  const [bMm, setBMm] = useState(300);
  const [bfMm, setBfMm] = useState(600);
  const [hfMm, setHfMm] = useState(120);
  const [coverTop, setCoverTop] = useState(30);
  const [coverBottom, setCoverBottom] = useState(30);
  const [coverSide, setCoverSide] = useState(30);

  // Material selection
  const [concreteIdx, setConcreteIdx] = useState(2); // C30/37
  const [mainSteelIdx, setMainSteelIdx] = useState(1); // B500B
  const [stirrupSteelIdx, setStirrupSteelIdx] = useState(1); // B500B

  // Reinforcement config
  const [mainBarDia, setMainBarDia] = useState(16);
  const [nBarsBottom, setNBarsBottom] = useState(4);
  const [nBarsTop, setNBarsTop] = useState(2);
  const [stirrupDia, setStirrupDia] = useState(8);
  const [stirrupSpacing, setStirrupSpacing] = useState(200);

  const concrete = CONCRETE_DESIGN_GRADES[concreteIdx];
  const mainSteel = REINFORCEMENT_DESIGN_GRADES[mainSteelIdx];
  const stirrupSteel = REINFORCEMENT_DESIGN_GRADES[stirrupSteelIdx];

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

  // Get design forces from selected beam
  const selectedBeamForces = useMemo<IBeamForces | null>(() => {
    if (!result) return null;
    for (const elemId of selection.elementIds) {
      const forces = result.beamForces.get(elemId);
      if (forces) return forces;
    }
    return null;
  }, [result, selection.elementIds]);

  const designForces = useMemo(() => {
    if (!selectedBeamForces) return { MEd: 0, VEd: 0 };
    const MEd = Math.max(Math.abs(selectedBeamForces.maxM), Math.abs(selectedBeamForces.M1), Math.abs(selectedBeamForces.M2));
    const VEd = Math.max(Math.abs(selectedBeamForces.maxV), Math.abs(selectedBeamForces.V1), Math.abs(selectedBeamForces.V2));
    return { MEd, VEd };
  }, [selectedBeamForces]);

  // Run design calculation
  const designResult = useMemo(() => {
    return designConcreteBeam(
      designForces.MEd, designForces.VEd,
      section, reinforcement,
      concrete, mainSteel, stirrupSteel,
    );
  }, [designForces, section, reinforcement, concrete, mainSteel, stirrupSteel]);

  // Get beam length for the elevation drawing
  const beamLength = useMemo(() => {
    for (const elemId of selection.elementIds) {
      const beam = mesh.getBeamElement(elemId);
      if (beam) {
        const n1 = mesh.getNode(beam.nodeIds[0]);
        const n2 = mesh.getNode(beam.nodeIds[1]);
        if (n1 && n2) {
          return Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2) * 1000; // m -> mm
        }
      }
    }
    return 3000; // default 3m
  }, [selection.elementIds, mesh]);

  const d = calculateEffectiveDepth(section, reinforcement);

  return (
    <div className="concrete-beam-view" style={{ height: panelHeight }}>
      <div
        className="concrete-beam-resize-handle"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />
      <div className="concrete-beam-view-header">
        <div className="concrete-beam-view-header-left">
          Concrete Beam View — EN 1992-1-1
        </div>
        <div className="concrete-beam-view-header-right">
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {concrete.name} | {mainSteel.name} | d = {d.toFixed(0)} mm
          </span>
          <button onClick={onClose} title="Close"><X size={14} /></button>
        </div>
      </div>
      <div className="concrete-beam-view-body">
        {/* SVG Drawing Area — beam elevation + cross-section side by side */}
        <div className="concrete-beam-canvas-area">
          <div className="concrete-beam-drawings">
            <div className="concrete-beam-elevation">
              <BeamElevationSVG
                section={section}
                reinforcement={reinforcement}
                beamLength={beamLength}
                beamForces={selectedBeamForces}
                concrete={concrete}
                mainSteel={mainSteel}
              />
            </div>
            <div className="concrete-beam-cross-section">
              <CrossSectionStandalone
                section={section}
                reinforcement={reinforcement}
              />
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="concrete-beam-controls">
          {/* Shape Selection */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Cross-section Shape</div>
            <div className="concrete-beam-shape-selector">
              {(['rectangle', 'T', 'L'] as ConcreteShapeType[]).map(s => (
                <button
                  key={s}
                  className={`concrete-beam-shape-btn ${shape === s ? 'active' : ''}`}
                  onClick={() => setShape(s)}
                >
                  {s === 'rectangle' ? 'Rectangle' : s === 'T' ? 'T-Profile' : 'L-Profile'}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Dimensions</div>
            <div className="concrete-beam-input-row">
              <label>Height h</label>
              <input type="number" value={hMm} min={100} max={3000} step={10} onChange={e => setHMm(parseInt(e.target.value) || 500)} />
              <span className="unit">mm</span>
            </div>
            <div className="concrete-beam-input-row">
              <label>Width b</label>
              <input type="number" value={bMm} min={100} max={2000} step={10} onChange={e => setBMm(parseInt(e.target.value) || 300)} />
              <span className="unit">mm</span>
            </div>
            {shape !== 'rectangle' && (
              <>
                <div className="concrete-beam-input-row">
                  <label>Flange width bf</label>
                  <input type="number" value={bfMm} min={bMm} max={3000} step={10} onChange={e => setBfMm(parseInt(e.target.value) || 600)} />
                  <span className="unit">mm</span>
                </div>
                <div className="concrete-beam-input-row">
                  <label>Flange depth hf</label>
                  <input type="number" value={hfMm} min={50} max={500} step={10} onChange={e => setHfMm(parseInt(e.target.value) || 120)} />
                  <span className="unit">mm</span>
                </div>
              </>
            )}
          </div>

          {/* Material */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Materials</div>
            <div className="concrete-beam-input-row">
              <label>Concrete</label>
              <select value={concreteIdx} onChange={e => setConcreteIdx(parseInt(e.target.value))}>
                {CONCRETE_DESIGN_GRADES.map((g, i) => (
                  <option key={g.name} value={i}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="concrete-beam-input-row">
              <label>Main steel</label>
              <select value={mainSteelIdx} onChange={e => setMainSteelIdx(parseInt(e.target.value))}>
                {REINFORCEMENT_DESIGN_GRADES.map((g, i) => (
                  <option key={g.name} value={i}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="concrete-beam-input-row">
              <label>Stirrup steel</label>
              <select value={stirrupSteelIdx} onChange={e => setStirrupSteelIdx(parseInt(e.target.value))}>
                {REINFORCEMENT_DESIGN_GRADES.map((g, i) => (
                  <option key={g.name} value={i}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cover */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Cover (to stirrup)</div>
            <div className="concrete-beam-input-row">
              <label>Bottom</label>
              <input type="number" value={coverBottom} min={15} max={80} step={5} onChange={e => setCoverBottom(parseInt(e.target.value) || 30)} />
              <span className="unit">mm</span>
            </div>
            <div className="concrete-beam-input-row">
              <label>Side</label>
              <input type="number" value={coverSide} min={15} max={80} step={5} onChange={e => setCoverSide(parseInt(e.target.value) || 30)} />
              <span className="unit">mm</span>
            </div>
            <div className="concrete-beam-input-row">
              <label>Top</label>
              <input type="number" value={coverTop} min={15} max={80} step={5} onChange={e => setCoverTop(parseInt(e.target.value) || 30)} />
              <span className="unit">mm</span>
            </div>
          </div>

          {/* Reinforcement */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Reinforcement</div>
            <div className="concrete-beam-input-row">
              <label>Main bar dia</label>
              <select value={mainBarDia} onChange={e => setMainBarDia(parseInt(e.target.value))}>
                {[8, 10, 12, 16, 20, 25, 32, 40].map(d => (
                  <option key={d} value={d}>{d} mm</option>
                ))}
              </select>
            </div>
            <div className="concrete-beam-input-row">
              <label>Bars bottom</label>
              <input type="number" value={nBarsBottom} min={1} max={12} step={1} onChange={e => setNBarsBottom(parseInt(e.target.value) || 2)} />
              <span className="unit">pcs</span>
            </div>
            <div className="concrete-beam-input-row">
              <label>Bars top</label>
              <input type="number" value={nBarsTop} min={0} max={12} step={1} onChange={e => setNBarsTop(parseInt(e.target.value) || 0)} />
              <span className="unit">pcs</span>
            </div>
            <div className="concrete-beam-input-row">
              <label>Stirrup dia</label>
              <select value={stirrupDia} onChange={e => setStirrupDia(parseInt(e.target.value))}>
                {[6, 8, 10, 12].map(d => (
                  <option key={d} value={d}>{d} mm</option>
                ))}
              </select>
            </div>
            <div className="concrete-beam-input-row">
              <label>Stirrup spacing</label>
              <input type="number" value={stirrupSpacing} min={50} max={500} step={25} onChange={e => setStirrupSpacing(parseInt(e.target.value) || 200)} />
              <span className="unit">mm</span>
            </div>
          </div>

          {/* Results */}
          <div className="concrete-beam-controls-section">
            <div className="concrete-beam-controls-section-title">Design Results</div>
            <div className="concrete-beam-results">
              <div className="concrete-beam-result-row">
                <span className="label">M_Ed</span>
                <span className="value">{(designResult.MEd / 1000).toFixed(2)} kNm</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">V_Ed</span>
                <span className="value">{(designResult.VEd / 1000).toFixed(1)} kN</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">mu</span>
                <span className={`value ${designResult.mu <= designResult.muLim ? 'ok' : 'fail'}`}>
                  {designResult.mu.toFixed(4)}
                </span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">As,req (bottom)</span>
                <span className="value">{designResult.AsReqBottom.toFixed(0)} mm²</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">As,prov (bottom)</span>
                <span className={`value ${designResult.AsProvBottom >= designResult.AsReqBottom ? 'ok' : 'fail'}`}>
                  {designResult.AsProvBottom.toFixed(0)} mm²
                </span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">As,min</span>
                <span className="value">{designResult.AsMin.toFixed(0)} mm²</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">VRd,c</span>
                <span className="value">{(designResult.VRdc / 1000).toFixed(1)} kN</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">Asw/s req</span>
                <span className="value">{designResult.AsswReq.toFixed(0)} mm²/m</span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">Asw/s prov</span>
                <span className={`value ${designResult.AsswProv >= designResult.AsswReq ? 'ok' : 'fail'}`}>
                  {designResult.AsswProv.toFixed(0)} mm²/m
                </span>
              </div>
              <div className="concrete-beam-result-row" style={{ marginTop: 4, borderTop: '1px solid var(--border-light)', paddingTop: 4 }}>
                <span className="label">UC bending</span>
                <span className={`value ${designResult.UC_bending <= 0.85 ? 'ok' : designResult.UC_bending <= 1.0 ? 'warn' : 'fail'}`}>
                  {designResult.UC_bending.toFixed(3)}
                </span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">UC shear</span>
                <span className={`value ${designResult.UC_shear <= 0.85 ? 'ok' : designResult.UC_shear <= 1.0 ? 'warn' : 'fail'}`}>
                  {designResult.UC_shear.toFixed(3)}
                </span>
              </div>
              <div className="concrete-beam-result-row">
                <span className="label">Status</span>
                <span className={`value ${designResult.status === 'OK' ? 'ok' : designResult.status === 'WARN' ? 'warn' : 'fail'}`} style={{ fontWeight: 700 }}>
                  {designResult.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Beam Elevation Drawing
// ---------------------------------------------------------------------------

interface BeamElevationSVGProps {
  section: IConcreteDesignSection;
  reinforcement: IReinforcementConfig;
  beamLength: number; // mm
  beamForces: IBeamForces | null;
  concrete: { fcd: number; fctm: number; name: string };
  mainSteel: { fyd: number; name: string };
}

function BeamElevationSVG({ section, reinforcement, beamLength, beamForces, concrete, mainSteel }: BeamElevationSVGProps) {
  const svgPad = 40;
  const viewWidth = 800;
  const viewHeight = 420; // Increased to accommodate diagrams

  // Scale: fit beam into SVG area
  const drawWidth = viewWidth - 2 * svgPad;
  const drawHeight = viewHeight - 2 * svgPad;

  // Beam elevation: show side view (length x height)
  const scaleX = drawWidth / beamLength;
  const scaleY = drawHeight / section.h;
  const scale = Math.min(scaleX, scaleY) * 0.85;

  const beamDrawW = beamLength * scale;
  const beamDrawH = section.h * scale;
  const ox = (viewWidth - beamDrawW) / 2;
  const oy = (viewHeight - beamDrawH) / 2;

  // Cover lines
  const coverBottom = section.coverBottom * scale;
  const coverTop = section.coverTop * scale;
  const coverSide = section.coverSide * scale;

  // Bar positions
  const stirrupDia = reinforcement.stirrupDiameter * scale;
  const mainBarDia = reinforcement.mainBarDiameter * scale;
  const barRadius = mainBarDia / 2;

  // Y positions of bar centers
  const barBottomY = oy + beamDrawH - coverBottom - stirrupDia - barRadius;
  const barTopY = oy + coverTop + stirrupDia + barRadius;

  // Stirrup U-shape positions
  const stirrupTop = oy + coverTop;
  const stirrupBottom = oy + beamDrawH - coverBottom;

  // Number of stirrups along beam
  const spacingScaled = reinforcement.stirrupSpacing * scale;
  const nStirrups = Math.max(2, Math.floor(beamDrawW / spacingScaled) + 1);
  const actualSpacing = beamDrawW / (nStirrups - 1);

  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width={viewWidth} height={viewHeight} fill="transparent" />

      {/* Concrete outline — side elevation */}
      {section.shape === 'rectangle' ? (
        <rect
          x={ox} y={oy}
          width={beamDrawW} height={beamDrawH}
          fill="rgba(128,128,128,0.15)"
          stroke="var(--text-secondary)"
          strokeWidth={1.5}
        />
      ) : section.shape === 'T' ? (
        <>
          {/* Flange */}
          <rect
            x={ox} y={oy}
            width={beamDrawW}
            height={(section.hf || 0) * scale}
            fill="rgba(128,128,128,0.15)"
            stroke="var(--text-secondary)"
            strokeWidth={1.5}
          />
          {/* Web */}
          <rect
            x={ox + (beamDrawW - section.b * scale * (beamLength / (section.bf || section.b))) / 2}
            y={oy + (section.hf || 0) * scale}
            width={beamDrawW}
            height={beamDrawH - (section.hf || 0) * scale}
            fill="rgba(128,128,128,0.15)"
            stroke="var(--text-secondary)"
            strokeWidth={1.5}
          />
        </>
      ) : (
        /* L-section side view is same as rectangle in elevation */
        <rect
          x={ox} y={oy}
          width={beamDrawW} height={beamDrawH}
          fill="rgba(128,128,128,0.15)"
          stroke="var(--text-secondary)"
          strokeWidth={1.5}
        />
      )}

      {/* Cover lines (dashed) */}
      <line
        x1={ox + coverSide} y1={oy + coverTop}
        x2={ox + beamDrawW - coverSide} y2={oy + coverTop}
        stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.6}
      />
      <line
        x1={ox + coverSide} y1={oy + beamDrawH - coverBottom}
        x2={ox + beamDrawW - coverSide} y2={oy + beamDrawH - coverBottom}
        stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.6}
      />
      <line
        x1={ox + coverSide} y1={oy + coverTop}
        x2={ox + coverSide} y2={oy + beamDrawH - coverBottom}
        stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.6}
      />
      <line
        x1={ox + beamDrawW - coverSide} y1={oy + coverTop}
        x2={ox + beamDrawW - coverSide} y2={oy + beamDrawH - coverBottom}
        stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.6}
      />

      {/* Stirrups */}
      {Array.from({ length: nStirrups }, (_, i) => {
        const sx = ox + i * actualSpacing;
        return (
          <g key={`stirrup-${i}`}>
            {/* U-shape stirrup */}
            <polyline
              points={`${sx + stirrupDia / 2},${stirrupTop + stirrupDia} ${sx + stirrupDia / 2},${stirrupBottom - stirrupDia} ${sx + stirrupDia / 2},${stirrupBottom} ${sx + stirrupDia / 2},${stirrupTop}`}
              fill="none"
              stroke="#22c55e"
              strokeWidth={Math.max(stirrupDia, 1)}
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* Vertical lines of stirrup */}
            <line
              x1={sx + stirrupDia / 2} y1={stirrupTop}
              x2={sx + stirrupDia / 2} y2={stirrupBottom}
              stroke="#22c55e"
              strokeWidth={Math.max(stirrupDia * 0.8, 0.8)}
              opacity={0.7}
            />
          </g>
        );
      })}

      {/* Bottom reinforcement bars — continuous line */}
      <line
        x1={ox + coverSide + stirrupDia}
        y1={barBottomY}
        x2={ox + beamDrawW - coverSide - stirrupDia}
        y2={barBottomY}
        stroke="#3b82f6"
        strokeWidth={Math.max(mainBarDia * 0.8, 1.5)}
        strokeLinecap="round"
      />
      {/* Top reinforcement bars — continuous line */}
      {reinforcement.nBarsTop > 0 && (
        <line
          x1={ox + coverSide + stirrupDia}
          y1={barTopY}
          x2={ox + beamDrawW - coverSide - stirrupDia}
          y2={barTopY}
          stroke="#3b82f6"
          strokeWidth={Math.max(mainBarDia * 0.6, 1)}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* Dimension annotations */}
      {/* Beam length */}
      <DimensionLine
        x1={ox} y1={oy + beamDrawH + 16}
        x2={ox + beamDrawW} y2={oy + beamDrawH + 16}
        label={`${beamLength.toFixed(0)} mm`}
        color="var(--text-muted)"
      />
      {/* Height */}
      <DimensionLine
        x1={ox - 16} y1={oy}
        x2={ox - 16} y2={oy + beamDrawH}
        label={`${section.h} mm`}
        color="var(--text-muted)"
        vertical
      />
      {/* Stirrup spacing annotation */}
      {nStirrups > 2 && (
        <DimensionLine
          x1={ox + actualSpacing} y1={oy - 10}
          x2={ox + 2 * actualSpacing} y2={oy - 10}
          label={`s=${reinforcement.stirrupSpacing} mm`}
          color="#22c55e"
          fontSize={8}
        />
      )}

      {/* Labels */}
      <text x={ox + beamDrawW / 2} y={barBottomY + mainBarDia + 10} textAnchor="middle" fill="#3b82f6" fontSize={9}>
        {reinforcement.nBarsBottom}x dia {reinforcement.mainBarDiameter}
      </text>
      {reinforcement.nBarsTop > 0 && (
        <text x={ox + beamDrawW / 2} y={barTopY - mainBarDia - 4} textAnchor="middle" fill="#3b82f6" fontSize={9} opacity={0.7}>
          {reinforcement.nBarsTop}x dia {reinforcement.mainBarDiameter}
        </text>
      )}

      {/* Moment diagram M(x) below the beam */}
      {beamForces && (() => {
        const diagTop = oy + beamDrawH + 34;
        const diagH = 50;
        const diagAmpl = diagH / 20; // amplitude scale for M(x) curve
        const nPts = 21;
        // Interpolate M(x): linear from M1 to M2 (for uniform load: parabolic with maxM)
        const M1 = beamForces.M1;
        const M2 = beamForces.M2;
        const maxM = beamForces.maxM;
        const maxAbs = Math.max(Math.abs(M1), Math.abs(M2), Math.abs(maxM), 1);

        const pts: string[] = [];
        for (let i = 0; i <= nPts; i++) {
          const t = i / nPts;
          const x = ox + t * beamDrawW;
          // Parabolic interpolation: M(t) = M1*(1-t) + M2*t + 4*(maxM - (M1+M2)/2)*t*(1-t)
          const Mlin = M1 * (1 - t) + M2 * t;
          const Mpara = 4 * (maxM - (M1 + M2) / 2) * t * (1 - t);
          const M = Mlin + Mpara;
          const y = diagTop + diagH / 2 - (M / maxAbs) * diagAmpl;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }

        return (
          <g>
            <text x={ox - 4} y={diagTop + diagH / 2 + 3} textAnchor="end" fill="#a855f7" fontSize={8}>M(x)</text>
            {/* Zero line */}
            <line x1={ox} y1={diagTop + diagH / 2} x2={ox + beamDrawW} y2={diagTop + diagH / 2} stroke="#a855f7" strokeWidth={0.3} strokeDasharray="2,2" />
            {/* Moment curve */}
            <polyline points={pts.join(' ')} fill="none" stroke="#a855f7" strokeWidth={1.5} />
            {/* Fill */}
            <polygon
              points={`${ox},${diagTop + diagH / 2} ${pts.join(' ')} ${ox + beamDrawW},${diagTop + diagH / 2}`}
              fill="#a855f7"
              opacity={0.1}
            />
            {/* Max moment label */}
            <text x={ox + beamDrawW / 2} y={diagTop - 2} textAnchor="middle" fill="#a855f7" fontSize={8}>
              M_max = {(Math.abs(maxM) / 1e6).toFixed(1)} kNm
            </text>
          </g>
        );
      })()}

      {/* Coverage line: As,req vs As,prov below moment diagram */}
      {beamForces && (() => {
        const covTop = oy + beamDrawH + 94;
        const covH = 40;
        const covAmpl = covH * 0.09; // amplitude scale for As diagram (1/10 of original)
        const nPts = 21;

        const M1 = beamForces.M1;
        const M2 = beamForces.M2;
        const maxM = beamForces.maxM;

        const d_eff = calculateEffectiveDepth(section, reinforcement);
        const fcd = concrete.fcd;
        const fyd = mainSteel.fyd;
        const b_w = section.b;

        // As,prov
        const AsProvBottom = reinforcement.nBarsBottom * Math.PI * (reinforcement.mainBarDiameter / 2) ** 2;

        // Calculate As,req(x) along the beam
        const reqPts: string[] = [];
        let maxAsReq = 0;

        for (let i = 0; i <= nPts; i++) {
          const t = i / nPts;
          const Mlin = M1 * (1 - t) + M2 * t;
          const Mpara = 4 * (maxM - (M1 + M2) / 2) * t * (1 - t);
          const M = Math.abs(Mlin + Mpara);

          // mu = M / (b * d² * fcd)
          const mu = M / (b_w * d_eff * d_eff * fcd);
          // omega = 1 - sqrt(1 - 2*mu) (simplified)
          const omega = mu < 0.5 ? 1 - Math.sqrt(Math.max(0, 1 - 2 * mu)) : 1;
          // As,req = omega * b * d * fcd / fyd
          const AsReq = omega * b_w * d_eff * fcd / fyd;

          maxAsReq = Math.max(maxAsReq, AsReq, AsProvBottom);

          const x = ox + t * beamDrawW;
          const yReq = covTop + covH - (AsReq / Math.max(maxAsReq, 1)) * covAmpl;
          reqPts.push(`${x.toFixed(1)},${yReq.toFixed(1)}`);
        }

        // Recalculate with final maxAsReq
        const reqPtsFinal: string[] = [];
        const fillPts: { x: number; yReq: number; yProv: number }[] = [];

        const yProv = covTop + covH - (AsProvBottom / Math.max(maxAsReq, 1)) * covAmpl;

        for (let i = 0; i <= nPts; i++) {
          const t = i / nPts;
          const Mlin = M1 * (1 - t) + M2 * t;
          const Mpara = 4 * (maxM - (M1 + M2) / 2) * t * (1 - t);
          const M = Math.abs(Mlin + Mpara);
          const mu = M / (b_w * d_eff * d_eff * fcd);
          const omega = mu < 0.5 ? 1 - Math.sqrt(Math.max(0, 1 - 2 * mu)) : 1;
          const AsReq = omega * b_w * d_eff * fcd / fyd;

          const x = ox + t * beamDrawW;
          const yReqI = covTop + covH - (AsReq / Math.max(maxAsReq, 1)) * covAmpl;
          reqPtsFinal.push(`${x.toFixed(1)},${yReqI.toFixed(1)}`);
          fillPts.push({ x, yReq: yReqI, yProv });
        }

        return (
          <g>
            <text x={ox - 4} y={covTop + covH / 2 + 3} textAnchor="end" fill="var(--text-muted)" fontSize={7}>As</text>
            {/* As,prov horizontal line */}
            <line x1={ox} y1={yProv} x2={ox + beamDrawW} y2={yProv} stroke="#22c55e" strokeWidth={1.5} />
            {/* As,req curve */}
            <polyline points={reqPtsFinal.join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.2} />
            {/* Color fills: green where ok, red where insufficient */}
            {fillPts.map((pt, i) => {
              if (i === 0) return null;
              const prev = fillPts[i - 1];
              const insufficient = pt.yReq < yProv; // yReq above yProv means As,req > As,prov
              return (
                <polygon
                  key={i}
                  points={`${prev.x},${Math.min(prev.yReq, yProv)} ${pt.x},${Math.min(pt.yReq, yProv)} ${pt.x},${yProv} ${prev.x},${yProv}`}
                  fill={insufficient ? '#ef4444' : '#22c55e'}
                  opacity={0.15}
                />
              );
            })}
            {/* Labels */}
            <text x={ox + beamDrawW + 4} y={yProv + 3} fill="#22c55e" fontSize={7}>As,prov = {AsProvBottom.toFixed(0)} mm²</text>
            <text x={ox + beamDrawW / 2} y={covTop - 2} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>
              As,req / As,prov
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cross-section SVG (small inset)
// ---------------------------------------------------------------------------

interface CrossSectionSVGProps {
  section: IConcreteDesignSection;
  reinforcement: IReinforcementConfig;
  ox: number;
  oy: number;
  width: number;
  height: number;
}

function CrossSectionSVG({ section, reinforcement, ox, oy, width, height }: CrossSectionSVGProps) {
  const maxDim = Math.max(section.h, section.bf || section.b);
  const sc = Math.min(width, height) / maxDim * 0.9;
  const w = section.b * sc;
  const h = section.h * sc;
  const bf = (section.bf || section.b) * sc;
  const hf = (section.hf || 0) * sc;

  const cx = ox + width / 2;
  const cy = oy + height / 2;

  // Concrete outline
  let outlinePath: string;
  if (section.shape === 'rectangle') {
    outlinePath = `M ${cx - w / 2},${cy - h / 2} h ${w} v ${h} h ${-w} Z`;
  } else if (section.shape === 'T') {
    // T-profile: flange on top, web below
    outlinePath = [
      `M ${cx - bf / 2},${cy - h / 2}`,
      `h ${bf}`,
      `v ${hf}`,
      `h ${-(bf - w) / 2}`,
      `v ${h - hf}`,
      `h ${-w}`,
      `v ${-(h - hf)}`,
      `h ${-(bf - w) / 2}`,
      'Z',
    ].join(' ');
  } else {
    // L-profile: flange on top-left
    outlinePath = [
      `M ${cx - bf / 2},${cy - h / 2}`,
      `h ${bf}`,
      `v ${hf}`,
      `h ${-(bf - w)}`,
      `v ${h - hf}`,
      `h ${-w}`,
      'Z',
    ].join(' ');
  }

  // Bar positions in cross-section
  const barR = Math.max(reinforcement.mainBarDiameter * sc / 2, 2);
  const stirrupR = reinforcement.stirrupDiameter * sc;
  const cBot = section.coverBottom * sc + stirrupR;
  const cTop = section.coverTop * sc + stirrupR;
  const cSide = section.coverSide * sc + stirrupR;

  // Bottom bars
  const bottomBars: { x: number; y: number }[] = [];
  const barYBot = cy + h / 2 - cBot - barR;
  if (reinforcement.nBarsBottom > 0) {
    const barXStart = cx - w / 2 + cSide + barR;
    const barXEnd = cx + w / 2 - cSide - barR;
    if (reinforcement.nBarsBottom === 1) {
      bottomBars.push({ x: cx, y: barYBot });
    } else {
      const step = (barXEnd - barXStart) / (reinforcement.nBarsBottom - 1);
      for (let i = 0; i < reinforcement.nBarsBottom; i++) {
        bottomBars.push({ x: barXStart + i * step, y: barYBot });
      }
    }
  }

  // Top bars
  const topBars: { x: number; y: number }[] = [];
  const barYTop = cy - h / 2 + cTop + barR;
  const topWidth = section.shape === 'rectangle' ? w : bf;
  if (reinforcement.nBarsTop > 0) {
    const barXStart = cx - topWidth / 2 + cSide + barR;
    const barXEnd = cx + topWidth / 2 - cSide - barR;
    if (reinforcement.nBarsTop === 1) {
      topBars.push({ x: cx, y: barYTop });
    } else {
      const step = (barXEnd - barXStart) / (reinforcement.nBarsTop - 1);
      for (let i = 0; i < reinforcement.nBarsTop; i++) {
        topBars.push({ x: barXStart + i * step, y: barYTop });
      }
    }
  }

  // Stirrup outline (rectangle)
  const stirrupX = cx - w / 2 + section.coverSide * sc;
  const stirrupY = cy - h / 2 + section.coverTop * sc;
  const stirrupW = w - 2 * section.coverSide * sc;
  const stirrupH = h - section.coverTop * sc - section.coverBottom * sc;

  return (
    <g>
      {/* Concrete */}
      <path d={outlinePath} fill="rgba(128,128,128,0.2)" stroke="var(--text-secondary)" strokeWidth={1} />

      {/* Stirrup outline */}
      <rect
        x={stirrupX} y={stirrupY}
        width={stirrupW} height={stirrupH}
        fill="none"
        stroke="#22c55e"
        strokeWidth={Math.max(stirrupR * 0.6, 0.5)}
        rx={2}
        opacity={0.7}
      />

      {/* Bottom bars */}
      {bottomBars.map((bar, i) => (
        <circle key={`bot-${i}`} cx={bar.x} cy={bar.y} r={barR} fill="#3b82f6" />
      ))}

      {/* Top bars */}
      {topBars.map((bar, i) => (
        <circle key={`top-${i}`} cx={bar.x} cy={bar.y} r={barR} fill="#3b82f6" opacity={0.7} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Standalone cross-section SVG (placed side-by-side with beam elevation)
// ---------------------------------------------------------------------------

interface CrossSectionStandaloneProps {
  section: IConcreteDesignSection;
  reinforcement: IReinforcementConfig;
}

function CrossSectionStandalone({ section, reinforcement }: CrossSectionStandaloneProps) {
  const viewSize = 160;
  const pad = 20;
  const drawSize = viewSize - 2 * pad;
  const maxDim = Math.max(section.h, section.bf || section.b);
  const csH = (section.h / maxDim) * drawSize;

  return (
    <svg viewBox={`0 0 ${viewSize} ${viewSize}`} xmlns="http://www.w3.org/2000/svg">
      <text x={viewSize / 2} y={pad - 4} textAnchor="middle" fill="var(--text-muted)" fontSize={9}>
        Cross-section
      </text>
      <CrossSectionSVG
        section={section}
        reinforcement={reinforcement}
        ox={pad}
        oy={pad}
        width={drawSize}
        height={drawSize}
      />
      {/* Dimension labels */}
      <text x={viewSize / 2} y={pad + drawSize / 2 + csH / 2 + 14} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>
        {section.b} x {section.h} mm
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dimension line helper
// ---------------------------------------------------------------------------

interface DimensionLineProps {
  x1: number; y1: number;
  x2: number; y2: number;
  label: string;
  color?: string;
  vertical?: boolean;
  fontSize?: number;
}

function DimensionLine({ x1, y1, x2, y2, label, color = '#888', vertical = false, fontSize = 9 }: DimensionLineProps) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tickLen = 4;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.5} />
      {vertical ? (
        <>
          <line x1={x1 - tickLen} y1={y1} x2={x1 + tickLen} y2={y1} stroke={color} strokeWidth={0.5} />
          <line x1={x2 - tickLen} y1={y2} x2={x2 + tickLen} y2={y2} stroke={color} strokeWidth={0.5} />
          <text x={mx - 6} y={my} textAnchor="end" fill={color} fontSize={fontSize} transform={`rotate(-90, ${mx - 6}, ${my})`}>
            {label}
          </text>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tickLen} x2={x1} y2={y1 + tickLen} stroke={color} strokeWidth={0.5} />
          <line x1={x2} y1={y2 - tickLen} x2={x2} y2={y2 + tickLen} stroke={color} strokeWidth={0.5} />
          <text x={mx} y={my - 3} textAnchor="middle" fill={color} fontSize={fontSize}>
            {label}
          </text>
        </>
      )}
    </g>
  );
}
