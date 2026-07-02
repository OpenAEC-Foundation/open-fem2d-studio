/**
 * FemResultsOverlay — renders deflected shape + reactions + per-element
 * internal-force labels for the most recent solver result.
 *
 * Drawn as SVG over the existing FemCanvas SVG geometry; reuses the same
 * world→screen mapping so the overlay registers pixel-perfect with the model.
 *
 * Deflected shape: each beam is sampled at 12 intermediate stations using
 * Euler-Bernoulli Hermite shape functions in element-local coordinates
 * (so the curve actually bulges between nodes — matters most for the
 * uniformly-loaded top beam where the nodal disp is tiny but mid-span sags).
 */
import type { SolverResult } from "./solver/types";
import type { Node, Beam, Support, Load } from "./femTypes";

/** Per-result display toggles — multi-active diagram picker. */
export interface DisplayFlags {
  deflection: boolean;
  N: boolean;
  V: boolean;
  M: boolean;
  reactions: boolean;
  /** Show extreme-value labels (Mmax, Vmax, Nmax, umax) at peak locations. */
  showExtremes: boolean;
  /** Per-component scale multipliers — 1.0 = auto, slider 0.1–5.0. */
  scaleN: number;
  scaleV: number;
  scaleM: number;
  scaleU: number;
}

export const DEFAULT_DISPLAY_FLAGS: DisplayFlags = {
  deflection: true, N: false, V: false, M: true, reactions: true,
  showExtremes: true,
  scaleN: 1, scaleV: 1, scaleM: 1, scaleU: 1,
};

interface Props {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  result: SolverResult;
  worldToScreen: (x: number, z: number) => { x: number; y: number };
  /** Canvas pixel size — used for auto-scaling deflection. */
  canvasW: number;
  canvasH: number;
  /** Which result components to render. Defaults to DEFAULT_DISPLAY_FLAGS. */
  displayFlags?: DisplayFlags;
  /** All loads — used to add UDL parabolic bulge to M-diagram. */
  loads?: Load[];
  /** Active load case id — filters which UDLs to apply. */
  activeLoadCaseId?: number;
}

const SAMPLES_PER_BEAM = 12;

export default function FemResultsOverlay({
  nodes, beams, supports, result, worldToScreen, canvasW, canvasH,
  displayFlags = DEFAULT_DISPLAY_FLAGS,
  loads: _loads = [], activeLoadCaseId: _activeLoadCaseId,
}: Props) {
  // `loads` and `activeLoadCaseId` are kept in Props for API stability but
  // are no longer read here — diagrams come straight from the solver's
  // station arrays (which already account for all loads + combinations).
  void _loads; void _activeLoadCaseId;
  const showDeflection = displayFlags.deflection;
  const showReactions  = displayFlags.reactions;
  const showN = displayFlags.N;
  const showV = displayFlags.V;
  const showM = displayFlags.M;
  const anyForceLabel = showN || showV || showM;
  // ── Auto-scale the deflection so the biggest sample is visible. ─────────
  // We sample every beam and find the max curve offset (mm), then scale so
  // it shows as ~60px on screen.
  type Sample = { sx: number; sy: number; dx_mm: number; dz_mm: number };
  type BeamSamples = { beam: Beam; samples: Sample[] };

  const allBeamSamples: BeamSamples[] = [];
  let maxOffsetMm = 0;

  for (const beam of beams) {
    const nA = nodes.find(n => n.id === beam.from);
    const nB = nodes.find(n => n.id === beam.to);
    if (!nA || !nB) continue;
    const dA = result.displacements.get(beam.from);
    const dB = result.displacements.get(beam.to);
    if (!dA || !dB) continue;

    const dx = nB.x - nA.x, dz = nB.z - nA.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    const c = dx / L, s = dz / L;
    // Transform global node disps into element-local
    // local x = (c, s) ; local y = (-s, c)
    const u1L = dA.ux * c + dA.uz * s;          // axial at A
    const v1L = -dA.ux * s + dA.uz * c;         // transverse at A
    const t1  = dA.ry;                          // rotation at A
    const u2L = dB.ux * c + dB.uz * s;
    const v2L = -dB.ux * s + dB.uz * c;
    const t2  = dB.ry;

    const samples: Sample[] = [];
    for (let k = 0; k <= SAMPLES_PER_BEAM; k++) {
      const xi = k / SAMPLES_PER_BEAM;                  // 0..1 along element
      // Linear interp for axial; Hermite for transverse
      const uL = u1L + (u2L - u1L) * xi;
      const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
      const N2 = L * (xi - 2 * xi * xi + xi * xi * xi);
      const N3 = 3 * xi * xi - 2 * xi * xi * xi;
      const N4 = L * (-xi * xi + xi * xi * xi);
      const vL = N1 * v1L + N2 * t1 + N3 * v2L + N4 * t2;
      // Back to global
      const dxG = uL * c + vL * (-s);
      const dzG = uL * s + vL * c;
      const px = nA.x + dx * xi;
      const pz = nA.z + dz * xi;
      const screen = worldToScreen(px, pz);
      samples.push({ sx: screen.x, sy: screen.y, dx_mm: dxG, dz_mm: dzG });
      const off = Math.hypot(dxG, dzG);
      if (off > maxOffsetMm) maxOffsetMm = off;
    }
    allBeamSamples.push({ beam, samples });
  }

  // Pick deflection magnification: target ~60 px on screen for the max sample.
  const TARGET_PX = 60;
  const dispScale = maxOffsetMm > 1e-9 ? (TARGET_PX / maxOffsetMm) * (displayFlags.scaleU ?? 1) : 0;

  // Reaction arrow scale: target ~50 px for the max reaction COMPONENT
  // (so Fx and Fz arrows share a single scale and you can compare their
  // lengths visually). Each component gets its own arrow.
  let maxReactionComp = 0;
  result.reactions.forEach(r => {
    if (Math.abs(r.fx) > maxReactionComp) maxReactionComp = Math.abs(r.fx);
    if (Math.abs(r.fz) > maxReactionComp) maxReactionComp = Math.abs(r.fz);
  });
  const REACTION_TARGET_PX = 50;
  const reactionScale = maxReactionComp > 1e-9 ? REACTION_TARGET_PX / maxReactionComp : 0;

  // The screen-y axis is flipped (positive down), so we must invert dz_mm.
  // worldToScreen embeds the (size.h − ORIGIN_Y_FROM_BOTTOM − mz·SCALE) mapping;
  // displaced screen position = worldToScreen(x + dx, z + dz). But to keep
  // dispScale independent of canvas-coord SCALE we just shift screen pixels.
  // The canvas scale is 1/25 mm→px; we shift by dispScale·dx_mm in screen px
  // for x (right is +) and -dispScale·dz_mm for y (up is +z → up is −y in svg).
  const renderDeflection = () => allBeamSamples.map(({ beam, samples }) => {
    const points = samples.map(p => {
      const x = p.sx + p.dx_mm * dispScale;
      const y = p.sy - p.dz_mm * dispScale;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return (
      <polyline
        key={`def${beam.id}`}
        points={points}
        className="fem-deflected"
      />
    );
  });

  // Reactions — twee aparte pijlen per oplegging: horizontaal (Fx) en
  // verticaal (Fz). Pijl wijst in de richting van de KRACHT (head richting
  // knoop, tail aan de andere kant). Pijl-tip stopt op REACTION_GAP px van
  // het knoop-punt zodat het niet door het support-symbool heen loopt.
  const REACTION_MIN_KN = 0.05;  // < 0.05 kN (= 50 N) wordt niet getekend
  const REACTION_GAP_PX = 14;     // afstand tussen pijl-tip en steunpunt
  const renderReactions = () => Array.from(result.reactions.entries()).flatMap(([nodeId, r]) => {
    const n = nodes.find(nn => nn.id === nodeId);
    if (!n) return [];
    const p = worldToScreen(n.x, n.z);
    const out: React.ReactNode[] = [];

    // ── Horizontaal (Fx) ──────────────────────────────────────────────
    if (Math.abs(r.fx) / 1000 > REACTION_MIN_KN) {
      const ax = r.fx * reactionScale;   // screen-px in x direction
      const dirX = Math.sign(ax) || 1;
      // Head zit GAP weg van p in tail-richting (= weg van het support).
      const headX = p.x - dirX * REACTION_GAP_PX;
      const tailX = headX - ax;
      const midX = (tailX + headX) / 2;
      const labelY = p.y + 16;
      const kN = (r.fx / 1000).toFixed(1);
      out.push(
        <g key={`rx-fx-${nodeId}`}>
          <line x1={tailX} y1={p.y} x2={headX} y2={p.y}
            className="fem-reaction-arrow"
            markerEnd="url(#fem-reaction-head)" />
          <rect x={midX - 24} y={labelY - 8} width={48} height={15} rx={3}
            className="fem-result-label-bg" />
          <text x={midX} y={labelY + 3} className="fem-reaction-label">
            Fx {kN} kN
          </text>
        </g>
      );
    }

    // ── Verticaal (Fz) ────────────────────────────────────────────────
    if (Math.abs(r.fz) / 1000 > REACTION_MIN_KN) {
      const ay = -r.fz * reactionScale;     // flip for screen-y
      // Head zit altijd GAP BOVEN het support (negatieve screen-y), zodat
      // de pijl-tip nooit door de driehoek/hatching heen loopt.
      const headY = p.y - REACTION_GAP_PX;
      const tailY = headY - ay;
      const midY = (tailY + headY) / 2;
      const labelX = p.x + 30;
      const kN = (r.fz / 1000).toFixed(1);
      out.push(
        <g key={`rx-fz-${nodeId}`}>
          <line x1={p.x} y1={tailY} x2={p.x} y2={headY}
            className="fem-reaction-arrow"
            markerEnd="url(#fem-reaction-head)" />
          <rect x={labelX - 24} y={midY - 8} width={48} height={15} rx={3}
            className="fem-result-label-bg" />
          <text x={labelX} y={midY + 3} className="fem-reaction-label">
            Fz {kN} kN
          </text>
        </g>
      );
    }

    return out;
  });

  // ── Internal-force diagrams (M-line, V-line, N-line) ──────────────────
  // Use the 21-station arrays from the solver directly. The solver runs
  // BeamForces.calculateBeamInternalForces() which produces a true
  // parabola under UDL, a true linear shape under point loads (with steps
  // at the load), and constant N. No re-computation in the UI — that
  // double-counted loads when multi-case combinations were active.
  // Auto-scale per force type so the largest value reaches ~TARGET_PX pixels.
  const TARGET_PX_DIAGRAM = 50;
  // (Solver-station data is already combination-aware; no per-LC re-projection here.)

  type DiagramSample = {
    px: number; py: number;        // screen position of point ON beam axis
    nxW: number; nzW: number;      // perpendicular direction in WORLD
    N: number; V: number; M: number;
  };
  type BeamDiagram = {
    beam: Beam;
    samples: DiagramSample[];
  };

  const beamDiagrams: BeamDiagram[] = [];
  let dgMaxN = 0, dgMaxV = 0, dgMaxM = 0;
  const anyDiagram = showN || showV || showM;

  if (anyDiagram) {
    for (const beam of beams) {
      const nA = nodes.find(n => n.id === beam.from);
      const nB = nodes.find(n => n.id === beam.to);
      const ef = result.elements.get(beam.id);
      if (!nA || !nB || !ef) continue;
      const dx = nB.x - nA.x, dz = nB.z - nA.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const s = dz / L;
      // Perpendicular = CCW 90° rotation of beam axis: (-s, c) in world
      const c2 = dx / L;
      const nxW = -s, nzW = c2;

      const samples: DiagramSample[] = [];

      // Use the engine's station arrays directly. Fallback to a simple
      // linear interpolation between endpoints only if no stations came
      // through (shouldn't happen with the new pipeline).
      const stations = ef.stations_mm;
      const hasStations = stations.length > 0 && ef.L_mm > 0 &&
        ef.bendingMoment.length === stations.length &&
        ef.shearForce.length    === stations.length &&
        ef.normalForce.length   === stations.length;

      if (hasStations) {
        for (let k = 0; k < stations.length; k++) {
          const xi = stations[k] / ef.L_mm;
          const px = nA.x + dx * xi;
          const pz = nA.z + dz * xi;
          const screen = worldToScreen(px, pz);
          const N_val = ef.normalForce[k];
          const V_val = ef.shearForce[k];
          const M_val = ef.bendingMoment[k];
          samples.push({ px: screen.x, py: screen.y, nxW, nzW, N: N_val, V: V_val, M: M_val });
          if (Math.abs(N_val) > dgMaxN) dgMaxN = Math.abs(N_val);
          if (Math.abs(V_val) > dgMaxV) dgMaxV = Math.abs(V_val);
          if (Math.abs(M_val) > dgMaxM) dgMaxM = Math.abs(M_val);
        }
      } else {
        // Fallback: 13 linear samples between endpoint values only.
        const FALLBACK_SAMPLES = 12;
        for (let k = 0; k <= FALLBACK_SAMPLES; k++) {
          const xi = k / FALLBACK_SAMPLES;
          const px = nA.x + dx * xi;
          const pz = nA.z + dz * xi;
          const screen = worldToScreen(px, pz);
          const N_val = ef.N;
          const V_val = ef.V;
          const M_val = (1 - xi) * ef.M_start + xi * ef.M_end;
          samples.push({ px: screen.x, py: screen.y, nxW, nzW, N: N_val, V: V_val, M: M_val });
          if (Math.abs(N_val) > dgMaxN) dgMaxN = Math.abs(N_val);
          if (Math.abs(V_val) > dgMaxV) dgMaxV = Math.abs(V_val);
          if (Math.abs(M_val) > dgMaxM) dgMaxM = Math.abs(M_val);
        }
      }

      beamDiagrams.push({ beam, samples });
    }
  }

  // Auto-scale per component; user-controlled multiplier (slider) applied on top.
  const scaleN = dgMaxN > 0 ? (TARGET_PX_DIAGRAM / dgMaxN) * (displayFlags.scaleN ?? 1) : 0;
  const scaleV = dgMaxV > 0 ? (TARGET_PX_DIAGRAM / dgMaxV) * (displayFlags.scaleV ?? 1) : 0;
  const scaleM = dgMaxM > 0 ? (TARGET_PX_DIAGRAM / dgMaxM) * (displayFlags.scaleM ?? 1) : 0;

  /** Draw a diagram (filled polygon + outline) for one force component.
   *
   * M is computed in engineering convention (sagging-positive).
   * To plot on the TENSION SIDE we flip the offset sign for M — sagging M > 0
   * pushes the diagram in the -y_local direction (= bottom of a horizontal beam,
   * = world-RIGHT for the left column, etc.). N and V keep raw signs.
   */
  const renderForceDiagram = (which: "N" | "V" | "M", scale: number, classKey: string) => {
    if (scale === 0) return null;
    return beamDiagrams.map(({ beam, samples }) => {
      if (samples.length === 0) return null;
      const offset: string[] = [];
      for (const sm of samples) {
        const raw = which === "N" ? sm.N : which === "V" ? sm.V : sm.M;
        // M flips for tension-side rendering; N/V plot in raw direction.
        const v = which === "M" ? -raw : raw;
        const ox = sm.px + sm.nxW * v * scale;
        const oy = sm.py - sm.nzW * v * scale;
        offset.push(`${ox.toFixed(2)},${oy.toFixed(2)}`);
      }
      // Closing polygon: back to beam (endpoint → startpoint along axis)
      const startBase = `${samples[0].px.toFixed(2)},${samples[0].py.toFixed(2)}`;
      const endBase   = `${samples[samples.length - 1].px.toFixed(2)},${samples[samples.length - 1].py.toFixed(2)}`;
      const beamClose: string[] = [endBase, startBase];
      const polyPts = [...offset, ...beamClose].join(" ");
      // Outline volgt OOK de zijkanten: vanaf baseline-start, omhoog naar
      // diagram-top, langs de top, naar diagram-eind, en terug naar baseline-
      // eind. Zo sluit de lijn netjes aan op de staaf bij hoeken / knopen.
      const linePts = [startBase, ...offset, endBase].join(" ");
      return (
        <g key={`dgm-${which}-${beam.id}`}>
          <polygon points={polyPts} className={`fem-diagram-fill ${classKey}`} />
          <polyline points={linePts} className={`fem-diagram-line ${classKey}`} fill="none" />
        </g>
      );
    });
  };

  // Per-element label at midspan: shows only the toggled-on force components.
  const renderForceLabels = () => {
    if (!anyForceLabel || !(displayFlags.showExtremes ?? true)) return null;
    return beams.map(beam => {
      const nA = nodes.find(n => n.id === beam.from);
      const nB = nodes.find(n => n.id === beam.to);
      const ef = result.elements.get(beam.id);
      if (!nA || !nB || !ef) return null;
      const midX = (nA.x + nB.x) / 2;
      const midZ = (nA.z + nB.z) / 2;
      const p = worldToScreen(midX, midZ);
      // Offset perpendicular to beam axis a bit
      const dx = nB.x - nA.x, dz = nB.z - nA.z;
      const L = Math.hypot(dx, dz);
      const nx = L > 0 ? -dz / L : 0;
      const nz = L > 0 ?  dx / L : 1;
      const offsetPx = 18;
      const labelX = p.x + nx * offsetPx;
      const labelY = p.y - nz * offsetPx;

      // Per-component peak uit de echte stations-arrays (niet endpoint
      // benadering — die zou voor staven met UDL de midden-bulge missen,
      // en voor combinaties zou het verschil tussen LCs onzichtbaar zijn).
      const peakFromArr = (arr: number[] | undefined, fallback: number): number => {
        if (arr && arr.length > 0) {
          let m = 0;
          for (const v of arr) if (Math.abs(v) > m) m = Math.abs(v);
          return m;
        }
        return Math.abs(fallback);
      };
      const Npeak = peakFromArr(ef.normalForce,  ef.N);
      const Vpeak = peakFromArr(ef.shearForce,   ef.V);
      const Mpeak = peakFromArr(ef.bendingMoment, Math.max(Math.abs(ef.M_start), Math.abs(ef.M_end)));

      // Collect only the active lines
      const lines: { text: string }[] = [];
      if (showN) lines.push({ text: `|N|ₘₐₓ = ${(Npeak / 1000).toFixed(2)} kN` });
      if (showV) lines.push({ text: `|V|ₘₐₓ = ${(Vpeak / 1000).toFixed(2)} kN` });
      if (showM) lines.push({ text: `|M|ₘₐₓ = ${(Mpeak / 1e6).toFixed(2)} kNm` });
      if (lines.length === 0) return null;

      const lineHeight = 11;
      const boxHeight = lines.length * lineHeight + 10;
      const boxTop = labelY - boxHeight / 2;
      const textBaseline = boxTop + 14;   // first line baseline

      return (
        <g key={`forces${beam.id}`}>
          <rect
            x={labelX - 56} y={boxTop}
            width={112} height={boxHeight}
            rx={3}
            className="fem-result-label-bg"
          />
          {lines.map((l, i) => (
            <text key={i} x={labelX} y={textBaseline + i * lineHeight} className="fem-force-label">
              {l.text}
            </text>
          ))}
        </g>
      );
    });
  };

  return (
    <g className="fem-results-overlay" pointerEvents="none">
      {/* Arrow marker — defined once */}
      <defs>
        <marker
          id="fem-reaction-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fem-reaction-marker-fill" />
        </marker>
      </defs>
      {showDeflection && renderDeflection()}
      {/* Internal-force diagrams drawn under reactions/labels so they don't
          occlude annotation text. */}
      {showM && renderForceDiagram("M", scaleM, "fem-diagram-M")}
      {showV && renderForceDiagram("V", scaleV, "fem-diagram-V")}
      {showN && renderForceDiagram("N", scaleN, "fem-diagram-N")}
      {showReactions && renderReactions()}
      {renderForceLabels()}

      {/* HUD-like banner so the user knows scale used — only when deflection shown */}
      {showDeflection && maxOffsetMm > 0 && (
        <g transform={`translate(${canvasW - 220}, ${canvasH - 90})`}>
          <rect width={210} height={36} rx={4} className="fem-result-label-bg" />
          <text x={10} y={15} className="fem-scale-label">Deflection scale: {dispScale.toFixed(1)}×</text>
          <text x={10} y={28} className="fem-scale-label">max |u| = {maxOffsetMm.toFixed(2)} mm</text>
        </g>
      )}

      {/* Supports list (used to satisfy props lint) — render nothing visually,
          but keep the prop in the signature so callers stay consistent. */}
      <g style={{ display: "none" }}>{supports.map(s => <text key={s.nodeId}>{s.nodeId}</text>)}</g>
    </g>
  );
}
