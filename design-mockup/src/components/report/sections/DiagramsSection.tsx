/**
 * DiagramsSection — constructiebrede krachtsverdelingsfiguren, zoals het
 * referentie-rapport: per grootheid (M, V, N en de vervormde stand) één
 * figuur over de HELE constructie. Per staaf wordt de kromme uit de
 * 21-station-arrays van de solver als offset loodrecht op de staafas gezet:
 *
 *  - M sagging-positief, getekend aan de TREKZIJDE (positief veldmoment aan
 *    de doorhang-kant van de staaf);
 *  - V en N aan de lokale +y-zijde (positief "boven" de staafas);
 *  - de vervormde stand als u(x)/w(x)-kromme over de constructie, zichtbaar
 *    uitvergroot met een vermelde schaalfactor ("vervorming ×150").
 *
 * Waarden MET TEKEN ("+273,1 kNm", Nederlandse komma) bij staafeinden en
 * veldextremen, tekst meegeroteerd met de staafrichting; reactiepijlen met
 * waarde bij de opleggingen (alleen in de krachtenfiguren). Bij de
 * omhullende-keuze worden min- én max-kromme beide licht gevuld getekend
 * (per station over alle combinaties opgebouwd). Combinatie-keuze via de
 * gedeelde ScopeSelector (reportStore.resultCombo). Lichte vullingen met
 * donkere contouren — leesbaar in grijstinten op wit A4-papier.
 */
import { useTranslation } from "react-i18next";
import type { Beam, Node, StructuralGrid, Support } from "../../fem/femTypes";
import type { ElementForces, SolverResult } from "../../fem/solver/types";
import { useReportData } from "../ReportDataContext";
import {
  buildSchemaTransform,
  renderBeamLines,
  renderGridAxisLines,
  renderNodeDots,
  renderSupportSymbols,
  type SchemaTransform,
} from "../reportGeometry";
import {
  NotComputedNote,
  ScopePrintLine,
  ScopeSelector,
  useResultScope,
  type ResultScope,
} from "../resultScope";

// ── Kleuren per figuur (licht gevuld, donkere contour — grijstint-proof) ──
const STRUCT_STROKE = "#9fb6d4"; // constructie lichtblauw (referentiestijl)
const STRUCT_NODE = "#5b7aa6";
const REACT = "#1e3a8a";         // reactiepijlen donkerblauw
const COLOR_M = { fill: "#f6dada", stroke: "#a33636" };
const COLOR_V = { fill: "#dcdcef", stroke: "#4a4a94" };
const COLOR_N = { fill: "#d9e4da", stroke: "#41684d" };
const DEFORM_STROKE = "#33518a";
const DEFORM_GHOST = "#c6c6c6";  // onvervormde geometrie licht

/** Min/max per station; bij één combinatie zijn min en max identiek. */
interface Series {
  min: number[];
  max: number[];
}

interface BeamSeriesData {
  beam: Beam;
  L_mm: number;
  stations: number[];
  M: Series;
  V: Series;
  N: Series;
}

function seriesFrom(values: number[]): Series {
  return { min: values, max: values };
}

/** Station-voor-station min/max over meerdere ElementForces (omhullende). */
function envelopeSeries(efs: ElementForces[], pick: (ef: ElementForces) => number[]): Series {
  const n = Math.min(...efs.map((ef) => pick(ef)?.length ?? 0));
  const min = new Array(n).fill(Infinity);
  const max = new Array(n).fill(-Infinity);
  for (const ef of efs) {
    const arr = pick(ef);
    for (let i = 0; i < n; i++) {
      const v = arr[i] ?? 0;
      if (v < min[i]) min[i] = v;
      if (v > max[i]) max[i] = v;
    }
  }
  return { min, max };
}

/** Getal met expliciet teken en Nederlandse komma: "+273,1" / "-19,7". */
function fmtSignedNl(v: number, decimals: number): string {
  const s = Math.abs(v).toFixed(decimals).replace(".", ",");
  return `${v < 0 ? "-" : "+"}${s}`;
}

/** Schaalfactor-weergave: "×150" of "×2,5". */
function fmtScaleNl(F: number): string {
  return F >= 10 ? String(Math.round(F)) : String(F).replace(".", ",");
}

/** Grootste "nette" waarde (1/1,5/2/2,5/3/4/5/7,5 × 10ⁿ) ≤ x. */
function niceDown(x: number): number {
  if (!isFinite(x) || x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const b = x / 10 ** exp;
  const steps = [7.5, 5, 4, 3, 2.5, 2, 1.5, 1];
  for (const s of steps) {
    if (b >= s - 1e-9) return s * 10 ** exp;
  }
  return 10 ** exp;
}

/** Max ordinaat in viewBox-eenheden ≈ 12 mm op papier (A4-contentbreedte). */
function ampFor(tr: SchemaTransform): number {
  return Math.max(50, Math.min(120, 0.067 * tr.W));
}

/** Staafhoek in graden, genormaliseerd zodat tekst nooit ondersteboven staat. */
function beamAngleDeg(dxS: number, dyS: number): number {
  let a = (Math.atan2(dyS, dxS) * 180) / Math.PI;
  if (a >= 90) a -= 180;
  else if (a < -90) a += 180;
  return a;
}

/** Figuurwrapper: SVG + vet gecentreerd bijschrift eronder — de generieke
 *  figuurconventie uit report.css (.rpt-figuur, blijft bijeen bij print). */
function FigureBlock({
  tr,
  caption,
  children,
}: {
  tr: SchemaTransform;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rpt-figuur">
      <svg
        className="rpt-figuur-svg"
        viewBox={`0 0 ${Math.round(tr.W)} ${Math.round(tr.H)}`}
        role="img"
      >
        {children}
      </svg>
      <div className="rpt-figuur-bijschrift">{caption}</div>
    </div>
  );
}

interface FigureSceneProps {
  tr: SchemaTransform;
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  structuralGrid: StructuralGrid;
  nodeById: Map<number, Node>;
}

interface ForceFigureProps extends FigureSceneProps {
  /** Unieke sleutel voor de marker-id (ids zijn document-globaal). */
  figKey: string;
  caption: string;
  data: BeamSeriesData[];
  pick: (d: BeamSeriesData) => Series;
  /** +1 = positief aan lokale +y; -1 = positief aan de trekzijde (M). */
  sign: 1 | -1;
  /** Deler ruwe eenheid → rapporteenheid (1e6 voor kNm, 1e3 voor kN). */
  unitDiv: number;
  decimals: number;
  unit: string;
  fill: string;
  stroke: string;
  /** True = omhullende: min- én max-kromme, beide gevuld. */
  band: boolean;
  /** Reactie per opgelegde knoop (N); null = geen reactiepijlen. */
  reactions: Map<number, { fx: number; fz: number }> | null;
}

/** Eén krachtenfiguur over de hele constructie (M, V of N). */
function ForceFigure({
  figKey, caption, data, pick, sign, unitDiv, decimals, unit, fill, stroke, band,
  tr, nodes, beams, supports, structuralGrid, nodeById, reactions,
}: ForceFigureProps) {
  const AMP = ampFor(tr);
  const markerId = `rpt-fig-arrow-${figKey}`;

  // Eén gezamenlijke schaal per figuur: grootste ordinaat over alle staven.
  let vMax = 0;
  for (const d of data) {
    const s = pick(d);
    const n = Math.min(d.stations.length, s.min.length, s.max.length);
    for (let i = 0; i < n; i++) {
      vMax = Math.max(vMax, Math.abs(s.min[i]), Math.abs(s.max[i]));
    }
  }
  const rawEps = 0.05 * unitDiv; // < 0,05 rapporteenheid = tekenruis
  const k = vMax > rawEps ? AMP / vMax : 0;
  const labelEps = Math.max(rawEps, 0.02 * vMax); // relevantiedrempel 2%

  const fillEls: React.ReactNode[] = [];
  const strokeEls: React.ReactNode[] = [];
  const labelEls: React.ReactNode[] = [];
  const placed: { x: number; y: number; text: string }[] = [];

  for (const d of data) {
    const s = pick(d);
    const n = Math.min(d.stations.length, s.min.length, s.max.length);
    if (n < 2 || d.L_mm <= 0 || k === 0) continue;
    const nA = nodeById.get(d.beam.from), nB = nodeById.get(d.beam.to);
    if (!nA || !nB) continue;
    const x1 = tr.X(nA.x), y1 = tr.Y(nA.z), x2 = tr.X(nB.x), y2 = tr.Y(nB.z);
    const dxS = x2 - x1, dyS = y2 - y1;
    const Ls = Math.hypot(dxS, dyS);
    if (Ls < 1) continue;
    // Lokale +y in SVG (90° CCW vanaf de staafas in modelcoördinaten).
    const pxU = dyS / Ls, pyU = -dxS / Ls;
    const angle = beamAngleDeg(dxS, dyS);

    const baseAt = (i: number): [number, number] => {
      const t = d.stations[i] / d.L_mm;
      return [x1 + dxS * t, y1 + dyS * t];
    };
    const curveAt = (i: number, v: number): [number, number] => {
      const [bx, by] = baseAt(i);
      const off = sign * v * k;
      return [bx + pxU * off, by + pyU * off];
    };
    const ptsOf = (arr: number[]): string[] =>
      Array.from({ length: n }, (_, i) => {
        const [cx, cy] = curveAt(i, arr[i]);
        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
      });
    const basePts = Array.from({ length: n }, (_, i) => {
      const [bx, by] = baseAt(i);
      return `${bx.toFixed(1)},${by.toFixed(1)}`;
    });

    const maxPts = ptsOf(s.max);
    fillEls.push(
      <polygon key={`fmax${d.beam.id}`} points={[...maxPts, ...[...basePts].reverse()].join(" ")}
        fill={fill} stroke="none" />,
    );
    strokeEls.push(
      <polyline key={`smax${d.beam.id}`} points={maxPts.join(" ")}
        fill="none" stroke={stroke} strokeWidth={1.6} />,
    );
    if (band) {
      const minPts = ptsOf(s.min);
      fillEls.push(
        <polygon key={`fmin${d.beam.id}`} points={[...minPts, ...[...basePts].reverse()].join(" ")}
          fill={fill} stroke="none" />,
      );
      strokeEls.push(
        <polyline key={`smin${d.beam.id}`} points={minPts.join(" ")}
          fill="none" stroke={stroke} strokeWidth={1.6} />,
      );
    }

    // ── Labels met teken: staafeinden + veldextremen, meegeroteerd ──
    const tryLabel = (i: number, v: number, key: string) => {
      if (Math.abs(v) <= labelEps) return;
      const [cx, cy] = curveAt(i, v);
      const side = sign * v >= 0 ? 1 : -1; // net voorbij de kromme, weg van de as
      const lx = cx + pxU * side * 15;
      const ly = cy + pyU * side * 15;
      const text = `${fmtSignedNl(v / unitDiv, decimals)} ${unit}`;
      for (const p of placed) {
        if (p.text === text && Math.hypot(p.x - lx, p.y - ly) < 22) return; // dubbel label
      }
      placed.push({ x: lx, y: ly, text });
      labelEls.push(
        <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize={15} fontWeight={600} fill={stroke}
          transform={`rotate(${angle.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}>
          {text}
        </text>,
      );
    };

    // Staafeinden (bij omhullende beide krommen; dubbele labels dedupet tryLabel).
    tryLabel(0, s.max[0], `l${d.beam.id}a`);
    tryLabel(n - 1, s.max[n - 1], `l${d.beam.id}b`);
    if (band) {
      tryLabel(0, s.min[0], `l${d.beam.id}c`);
      tryLabel(n - 1, s.min[n - 1], `l${d.beam.id}d`);
    }
    // Veldextremen: meest positieve (max-kromme) en meest negatieve (min-kromme).
    let iMax = 0, iMin = 0;
    for (let i = 1; i < n; i++) {
      if (s.max[i] > s.max[iMax]) iMax = i;
      if (s.min[i] < s.min[iMin]) iMin = i;
    }
    if (iMax > 0 && iMax < n - 1) tryLabel(iMax, s.max[iMax], `l${d.beam.id}e`);
    if (iMin > 0 && iMin < n - 1) tryLabel(iMin, s.min[iMin], `l${d.beam.id}f`);
  }

  // ── Reactiepijlen met waarde bij de opleggingen ──
  const reactionEls: React.ReactNode[] = [];
  if (reactions) {
    for (const s of supports) {
      const nd = nodeById.get(s.nodeId);
      const r = reactions.get(s.nodeId);
      if (!nd || !r) continue;
      const px = tr.X(nd.x), py = tr.Y(nd.z);
      if (Math.abs(r.fz) > 50) {
        // Verticale reactie: pijl onder de oplegging, in de krachtrichting.
        const up = r.fz > 0;
        const yHead = up ? py + 52 : py + 107;
        const yTail = up ? py + 107 : py + 52;
        const midY = (yHead + yTail) / 2;
        reactionEls.push(
          <g key={`rz${s.nodeId}`}>
            <line x1={px} y1={yTail} x2={px} y2={yHead}
              stroke={REACT} strokeWidth={2.2} markerEnd={`url(#${markerId})`} />
            <text x={px + 16} y={midY} textAnchor="middle" dominantBaseline="middle"
              fontSize={15} fontWeight={600} fill={REACT}
              transform={`rotate(-90 ${px + 16} ${midY})`}>
              {fmtSignedNl(r.fz / 1e3, 1)} kN
            </text>
          </g>,
        );
      }
      if (Math.abs(r.fx) > 50) {
        // Horizontale reactie: pijl naast de knoop, in de krachtrichting.
        const toRight = r.fx > 0;
        const xHead = toRight ? px - 10 : px + 10;
        const xTail = toRight ? xHead - 55 : xHead + 55;
        reactionEls.push(
          <g key={`rx${s.nodeId}`}>
            <line x1={xTail} y1={py} x2={xHead} y2={py}
              stroke={REACT} strokeWidth={2.2} markerEnd={`url(#${markerId})`} />
            <text x={(xHead + xTail) / 2} y={py - 10} textAnchor="middle"
              fontSize={15} fontWeight={600} fill={REACT}>
              {fmtSignedNl(r.fx / 1e3, 1)} kN
            </text>
          </g>,
        );
      }
    }
  }

  return (
    <FigureBlock tr={tr} caption={caption}>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={REACT} />
        </marker>
      </defs>
      {renderGridAxisLines(structuralGrid, tr)}
      {fillEls}
      {renderBeamLines(beams, nodeById, tr, { stroke: STRUCT_STROKE, strokeWidth: 3.5, withIds: false })}
      {strokeEls}
      {renderSupportSymbols(supports, nodeById, tr)}
      {renderNodeDots(nodes, tr, { withNumbers: false, r: 3.5, fill: STRUCT_NODE, stroke: STRUCT_NODE, strokeWidth: 1 })}
      {reactionEls}
      {k === 0 && (
        <text x={tr.W / 2} y={tr.Y(tr.maxZ) - 60} textAnchor="middle" fontSize={15} fill="#999">
          ≈ 0
        </text>
      )}
      {labelEls}
    </FigureBlock>
  );
}

interface DeformFigureProps extends FigureSceneProps {
  /** Bijschrift zonder schaalfactor-suffix (wordt hier aangevuld). */
  captionBase: string;
  result: SolverResult;
}

/** Vervormde stand: uitvergrote u(x)/w(x)-kromme + knoopextreem-labels. */
function DeformFigure({
  captionBase, result, tr, nodes, beams, supports, structuralGrid, nodeById,
}: DeformFigureProps) {
  const { t } = useTranslation("ribbon");
  const AMP = ampFor(tr);

  // Grootste verplaatsing: knopen én stationswaarden (veldzakking kan de
  // knoopverplaatsingen overtreffen, bv. de zeeg van een ligger).
  let maxDisp = result.maxDisplacement;
  for (const b of beams) {
    const ef = result.elements.get(b.id);
    if (!ef) continue;
    for (const w of ef.deflection ?? []) maxDisp = Math.max(maxDisp, Math.abs(w));
    for (const u of ef.axialDisp ?? []) maxDisp = Math.max(maxDisp, Math.abs(u));
  }
  const tiny = maxDisp < 0.01;
  const F = tiny ? 1 : niceDown(AMP / (tr.scale * maxDisp));

  const curveEls: React.ReactNode[] = [];
  // Grootste veldzakking |w| op de kromme (loodrecht op de staafas): apart
  // gelabeld, want die kan de knoopverplaatsingen ver overtreffen.
  let extW = 0;
  let extWPt: { x: number; y: number; angle: number; sx: number; sy: number } | null = null;
  for (const b of beams) {
    const ef = result.elements.get(b.id);
    if (!ef || ef.stations_mm.length < 2 || ef.L_mm <= 0) continue;
    const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
    if (!nA || !nB) continue;
    const x1 = tr.X(nA.x), y1 = tr.Y(nA.z), x2 = tr.X(nB.x), y2 = tr.Y(nB.z);
    const dxS = x2 - x1, dyS = y2 - y1;
    const Ls = Math.hypot(dxS, dyS);
    if (Ls < 1) continue;
    const uxU = dxS / Ls, uyU = dyS / Ls;      // as-richting in SVG
    const pxU = dyS / Ls, pyU = -dxS / Ls;     // lokale +y in SVG
    const angle = beamAngleDeg(dxS, dyS);
    const defl = ef.deflection ?? [];
    const axial = ef.axialDisp ?? [];
    const n = ef.stations_mm.length;
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const tFrac = ef.stations_mm[i] / ef.L_mm;
      const bx = x1 + dxS * tFrac, by = y1 + dyS * tFrac;
      const u = axial[i] ?? 0, w = defl[i] ?? 0;
      const ox = (uxU * u + pxU * w) * tr.scale * F;
      const oy = (uyU * u + pyU * w) * tr.scale * F;
      pts.push(`${(bx + ox).toFixed(1)},${(by + oy).toFixed(1)}`);
      if (i > 0 && i < n - 1 && Math.abs(w) > Math.abs(extW)) {
        const side = Math.sign(w) || 1;
        extW = w;
        extWPt = {
          x: bx + ox, y: by + oy, angle,
          sx: pxU * side, sy: pyU * side,
        };
      }
    }
    curveEls.push(
      <polyline key={`def${b.id}`} points={pts.join(" ")}
        fill="none" stroke={DEFORM_STROKE} strokeWidth={2.4} />,
    );
  }

  // Vervormde knoopposities + labels bij de extremen (mm, met teken).
  const nodeEls: React.ReactNode[] = [];
  const labelEls: React.ReactNode[] = [];
  let extUxNode: Node | null = null, extUx = 0;
  let extUzNode: Node | null = null, extUz = 0;
  for (const nd of nodes) {
    const d = result.displacements.get(nd.id);
    if (!d) continue;
    const dx = tr.X(nd.x) + d.ux * tr.scale * F;
    const dy = tr.Y(nd.z) - d.uz * tr.scale * F; // SVG-y omlaag → uz flipt
    nodeEls.push(
      <circle key={`dn${nd.id}`} cx={dx} cy={dy} r={3.5}
        fill={DEFORM_STROKE} stroke={DEFORM_STROKE} strokeWidth={1} />,
    );
    if (Math.abs(d.ux) > Math.abs(extUx)) { extUx = d.ux; extUxNode = nd; }
    if (Math.abs(d.uz) > Math.abs(extUz)) { extUz = d.uz; extUzNode = nd; }
  }
  const nodeLabel = (nd: Node, comp: "ux" | "uz", vMm: number, dyOff: number, key: string) => {
    const d = result.displacements.get(nd.id);
    if (!d) return;
    const lx = tr.X(nd.x) + d.ux * tr.scale * F;
    const ly = tr.Y(nd.z) - d.uz * tr.scale * F + dyOff;
    labelEls.push(
      <text key={key} x={lx} y={ly} textAnchor="middle" fontSize={15}
        fontWeight={600} fill={DEFORM_STROKE}>
        {comp} = {fmtSignedNl(vMm, 1)} mm
      </text>,
    );
  };
  if (extUxNode && Math.abs(extUx) > 0.05) nodeLabel(extUxNode, "ux", extUx, -24, "lux");
  if (extUzNode && Math.abs(extUz) > 0.05) nodeLabel(extUzNode, "uz", extUz, 38, "luz");
  // Veldextreem op de kromme, meegeroteerd met de staafrichting.
  if (extWPt && Math.abs(extW) > 0.05) {
    const lx = extWPt.x + extWPt.sx * 20;
    const ly = extWPt.y + extWPt.sy * 20;
    labelEls.push(
      <text key="lw" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
        fontSize={15} fontWeight={600} fill={DEFORM_STROKE}
        transform={`rotate(${extWPt.angle.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}>
        w = {fmtSignedNl(extW, 1)} mm
      </text>,
    );
  }

  const caption = tiny
    ? `${captionBase} (≈ 0)`
    : `${captionBase} (${t("report.deformScaleWord", "vervorming")} ×${fmtScaleNl(F)})`;

  return (
    <FigureBlock tr={tr} caption={caption}>
      {renderGridAxisLines(structuralGrid, tr)}
      {renderBeamLines(beams, nodeById, tr, { stroke: DEFORM_GHOST, strokeWidth: 2, withIds: false })}
      {renderSupportSymbols(supports, nodeById, tr)}
      {curveEls}
      {nodeEls}
      {labelEls}
    </FigureBlock>
  );
}

/** Reactie-weergave per knoop: gekozen combinatie, of bij de omhullende per
 *  component de waarde met de grootste absolute waarde over alle combinaties. */
function buildReactionDisplay(
  rs: ResultScope,
  combinationResults: Map<number, SolverResult>,
): Map<number, { fx: number; fz: number }> {
  const out = new Map<number, { fx: number; fz: number }>();
  if (rs.scope !== "envelope") {
    rs.result?.reactions.forEach((r, id) => out.set(id, { fx: r.fx, fz: r.fz }));
    return out;
  }
  for (const c of rs.combosWithResults) {
    const res = combinationResults.get(c.id);
    if (!res) continue;
    res.reactions.forEach((r, id) => {
      const cur = out.get(id) ?? { fx: 0, fz: 0 };
      if (Math.abs(r.fx) > Math.abs(cur.fx)) cur.fx = r.fx;
      if (Math.abs(r.fz) > Math.abs(cur.fz)) cur.fz = r.fz;
      out.set(id, cur);
    });
  }
  return out;
}

export default function DiagramsSection() {
  const { t } = useTranslation("ribbon");
  const {
    nodes, beams, supports, structuralGrid, combinations, combinationResults, envelope,
  } = useReportData();
  const rs = useResultScope();

  if (!rs.hasResults || !combinationResults || nodes.length === 0) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionDiagrams", "Krachtsverdeling")}</h2>
        <NotComputedNote />
      </div>
    );
  }

  const isEnvelope = rs.scope === "envelope";

  // Per staaf de stationsreeksen verzamelen (staven zonder resultaat overslaan).
  const data: BeamSeriesData[] = [];
  for (const beam of [...beams].sort((a, b) => a.id - b.id)) {
    if (isEnvelope) {
      const efs = rs.combosWithResults
        .map((c) => combinationResults.get(c.id)?.elements.get(beam.id))
        .filter((ef): ef is ElementForces => !!ef && ef.stations_mm.length > 1);
      if (efs.length === 0) continue;
      const ref = efs[0];
      data.push({
        beam,
        L_mm: ref.L_mm,
        stations: ref.stations_mm,
        M: envelopeSeries(efs, (ef) => ef.bendingMoment),
        V: envelopeSeries(efs, (ef) => ef.shearForce),
        N: envelopeSeries(efs, (ef) => ef.normalForce),
      });
    } else {
      const ef = rs.result?.elements.get(beam.id);
      if (!ef || ef.stations_mm.length < 2) continue;
      data.push({
        beam,
        L_mm: ef.L_mm,
        stations: ef.stations_mm,
        M: seriesFrom(ef.bendingMoment),
        V: seriesFrom(ef.shearForce),
        N: seriesFrom(ef.normalForce),
      });
    }
  }

  // Gedeelde figuurscène: transformatie met ruimte voor krommen, labels,
  // stramiencirkels en reactiepijlen.
  const tr = buildSchemaTransform(nodes, { left: 170, right: 170, top: 150, bottom: 190 });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const scene = { tr, nodes, beams, supports, structuralGrid, nodeById };
  const reactions = buildReactionDisplay(rs, combinationResults);

  // Bijschriften: "Momentenlijn — ULS 6.10a" of "Omhullende momentenlijn".
  const comboName = rs.combo?.name ?? "";
  const capM = isEnvelope
    ? t("report.figEnvMomentLine", "Omhullende momentenlijn")
    : `${t("report.figMomentLine", "Momentenlijn")} — ${comboName}`;
  const capV = isEnvelope
    ? t("report.figEnvShearLine", "Omhullende dwarskrachtenlijn")
    : `${t("report.figShearLine", "Dwarskrachtenlijn")} — ${comboName}`;
  const capN = isEnvelope
    ? t("report.figEnvNormalLine", "Omhullende normaalkrachtenlijn")
    : `${t("report.figNormalLine", "Normaalkrachtenlijn")} — ${comboName}`;

  // Vervormde stand: bij de omhullende de maatgevende combinatie (grootste
  // verplaatsing) — de omhullende zelf kent geen vervormingsverloop.
  let defResult: SolverResult | undefined;
  let defCaption = "";
  if (isEnvelope) {
    const govId = envelope?.maxDisplacementCombinationId ?? rs.combosWithResults[0]?.id;
    defResult = govId != null ? combinationResults.get(govId) : undefined;
    const govName = combinations.find((c) => c.id === govId)?.name ?? String(govId ?? "");
    defCaption = `${t("report.figDeformed", "Vervormde stand")} — ${t("report.figGoverning", "maatgevend")}: ${govName}`;
  } else {
    defResult = rs.result;
    defCaption = `${t("report.figDeformed", "Vervormde stand")} — ${comboName}`;
  }

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionDiagrams", "Krachtsverdeling")}</h2>
      <ScopeSelector rs={rs} />
      <ScopePrintLine rs={rs} />
      {isEnvelope && (
        <p className="rpt-note">
          {t(
            "report.envelopeCurvesNote",
            "Omhullende: per figuur zijn de minimum- én maximumkromme over alle combinaties getekend; reactiewaarden zijn per component de grootste absolute waarde.",
          )}
        </p>
      )}
      <p className="rpt-note">
        {t(
          "report.diagramsConvention",
          "Tekenconventie: momenten aan de trekzijde getekend, waarden met teken (sagging-positief); eenheden kNm, kN en mm.",
        )}
      </p>

      {data.length === 0 ? (
        <p className="rpt-empty-note">{t("report.noBeams", "Geen staven in het model.")}</p>
      ) : (
        <>
          <ForceFigure {...scene} figKey="M" caption={capM} data={data}
            pick={(d) => d.M} sign={-1} unitDiv={1e6} decimals={1} unit="kNm"
            fill={COLOR_M.fill} stroke={COLOR_M.stroke} band={isEnvelope}
            reactions={reactions} />
          <ForceFigure {...scene} figKey="V" caption={capV} data={data}
            pick={(d) => d.V} sign={1} unitDiv={1e3} decimals={1} unit="kN"
            fill={COLOR_V.fill} stroke={COLOR_V.stroke} band={isEnvelope}
            reactions={reactions} />
          <ForceFigure {...scene} figKey="N" caption={capN} data={data}
            pick={(d) => d.N} sign={1} unitDiv={1e3} decimals={1} unit="kN"
            fill={COLOR_N.fill} stroke={COLOR_N.stroke} band={isEnvelope}
            reactions={reactions} />
          {defResult && (
            <DeformFigure {...scene} captionBase={defCaption} result={defResult} />
          )}
        </>
      )}
    </div>
  );
}
