/**
 * SchemaSection — de constructieschets: het model op schaal als SVG.
 *
 * Getekend worden: staven, knopen met nummers (staafnummers grijs tussen
 * haakjes), opleggingssymbolen (vereenvoudigde vorm van de canvas-symbolen
 * uit FemCanvas.renderSupport), lastpijlen met q-/F-labels (deellasten alleen
 * over hun belaste bereik, met belastinggeval-tag G/Q/S/W) en maatvoering
 * van de overspanningen (stramienposities indien bruikbaar, anders
 * knoopafstanden). Puur modelweergave — geen resultaten nodig.
 *
 * De model→SVG-transformatie en de staaf-/knoop-/opleggingstekening leven in
 * reportGeometry.tsx (gedeeld met de krachtsverdelingsfiguren); dit bestand
 * voegt de lasten en de maatvoering toe. Max. één vel via max-height in
 * report.css (.rpt-schema-svg).
 */
import { useTranslation } from "react-i18next";
import type { Load, LoadCase } from "../../fem/femTypes";
import { useReportData } from "../ReportDataContext";
import { fmtLenM, fmtNum } from "../reportFormat";
import {
  DIM,
  INK,
  MUTED,
  buildSchemaTransform,
  modelExtent,
  renderBeamLines,
  renderNodeDots,
  renderSupportSymbols,
} from "../reportGeometry";

/** Korte tag per belastinggeval-type voor in de lastlabels. */
const CASE_TAGS: Record<LoadCase["type"], string> = {
  dead: "G",
  live: "Q",
  snow: "S",
  wind: "W",
  other: "O",
};

export default function SchemaSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, beams, supports, loads, loadCases, structuralGrid } =
    useReportData();

  if (nodes.length === 0) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionSchema", "Constructieschets")}</h2>
        <p className="rpt-empty-note">{t("report.noNodes", "Geen knopen in het model.")}</p>
      </div>
    );
  }

  // ── Model-bbox + schaal (gedeelde transformatie) ─────────────────────────
  const xs = nodes.map((n) => n.x);
  const zs = nodes.map((n) => n.z);
  const { hasHeight } = modelExtent(nodes);
  const hasLoads = loads.length > 0;
  const ML = hasHeight ? 150 : 100; // ruimte links (verticale maatvoering)
  const MR = 100;
  const MT = hasLoads ? 160 : 70;   // ruimte boven (lastpijlen + labels)
  const MB = 170;                   // supports + horizontale maatvoering

  const tr = buildSchemaTransform(nodes, { left: ML, right: MR, top: MT, bottom: MB });
  const { W, H, X, Y, minX, maxX, minZ, maxZ } = tr;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const caseById = new Map(loadCases.map((c) => [c.id, c]));
  const caseTag = (caseId: number): string => {
    const c = caseById.get(caseId);
    return c ? CASE_TAGS[c.type] : "";
  };

  // ── Lasten ───────────────────────────────────────────────────────────────
  // Lijnlasten: per staaf gestapeld (meerdere gevallen boven elkaar), pijlen
  // alleen over het belaste bereik [startFrac, endFrac]. Conventie identiek
  // aan de canvas: q < 0 (zwaartekracht) → pijlen wijzen op de staaf af
  // vanaf de tegenoverliggende kant.
  const loadEls: React.ReactNode[] = [];
  const BAND = 44;      // pijllengte in viewBox-eenheden
  const BAND_GAP = 30;  // extra ruimte tussen gestapelde lastbanden

  const lineLoadsByBeam = new Map<number, Load[]>();
  for (const l of loads) {
    if (l.type === "lineLoad" && l.beamId !== undefined) {
      const arr = lineLoadsByBeam.get(l.beamId) ?? [];
      arr.push(l);
      lineLoadsByBeam.set(l.beamId, arr);
    }
  }

  lineLoadsByBeam.forEach((beamLoads, beamId) => {
    const b = beams.find((bb) => bb.id === beamId);
    if (!b) return;
    const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
    if (!nA || !nB) return;
    const pA = { x: X(nA.x), y: Y(nA.z) };
    const pB = { x: X(nB.x), y: Y(nB.z) };
    const dxS = pB.x - pA.x, dyS = pB.y - pA.y;
    const L = Math.hypot(dxS, dyS);
    if (L < 1) return;
    // Loodrecht "links" van de staafrichting (zelfde formule als de canvas).
    const nx = -dyS / L, ny = dxS / L;

    const sorted = [...beamLoads].sort((a, c) => a.caseId - c.caseId);
    sorted.forEach((l, stackIdx) => {
      const aF = Math.min(1, Math.max(0, l.startFrac ?? 0));
      const bF = Math.min(1, Math.max(aF, l.endFrac ?? 1));
      const qa = l.qStart ?? l.q ?? 0;
      const qb = l.qEnd ?? l.q ?? 0;
      if (Math.abs(qa) < 1e-9 && Math.abs(qb) < 1e-9) return;
      const isTrap = l.qStart !== undefined || l.qEnd !== undefined;
      const maxAbs = Math.max(Math.abs(qa), Math.abs(qb), 1e-9);
      const off = stackIdx * (BAND + BAND_GAP); // afstand kop t.o.v. staaf
      const pS = { x: pA.x + dxS * aF, y: pA.y + dyS * aF };
      const pE = { x: pA.x + dxS * bF, y: pA.y + dyS * bF };
      const sdx = pE.x - pS.x, sdy = pE.y - pS.y;
      const nArrows = Math.max(2, Math.round(8 * (bF - aF)));
      const arrows: React.ReactNode[] = [];
      const tails: string[] = [];
      for (let i = 0; i <= nArrows; i++) {
        const tt = i / nArrows;
        const cx0 = pS.x + sdx * tt, cy0 = pS.y + sdy * tt;
        const qT = qa + (qb - qa) * tt;
        const dirSign = qT < 0 ? 1 : -1; // canvas-conventie
        const len = BAND * Math.max(0.4, Math.abs(qT) / maxAbs);
        const hx = cx0 + nx * off * -dirSign;
        const hy = cy0 + ny * off * -dirSign;
        const sx0 = cx0 + nx * (off + len) * -dirSign;
        const sy0 = cy0 + ny * (off + len) * -dirSign;
        tails.push(`${sx0.toFixed(1)},${sy0.toFixed(1)}`);
        arrows.push(
          <line key={i} x1={sx0} y1={sy0} x2={hx} y2={hy}
            stroke={INK} strokeWidth={1.5} markerEnd="url(#rpt-arrow)" />,
        );
      }
      const midX = (pS.x + pE.x) / 2, midY = (pS.y + pE.y) / 2;
      const avgDir = (qa + qb) / 2 < 0 ? 1 : -1;
      const lx = midX + nx * (off + BAND + 22) * -avgDir;
      const ly = midY + ny * (off + BAND + 22) * -avgDir;
      const tag = caseTag(l.caseId);
      const qText = isTrap
        ? `q = ${fmtNum(qa, 2)} → ${fmtNum(qb, 2)} kN/m`
        : `q = ${fmtNum(l.q ?? 0, 2)} kN/m`;
      loadEls.push(
        <g key={`ll${l.id}`}>
          <polyline points={tails.join(" ")} fill="none" stroke={INK} strokeWidth={1.5} />
          {arrows}
          <text x={lx} y={ly} textAnchor="middle" fontSize={16} fill={INK}>
            {qText}{tag ? ` (${tag})` : ""}
          </text>
        </g>,
      );
    });
  });

  for (const l of loads) {
    if (l.type === "pointForce" && l.nodeId !== undefined) {
      const n = nodeById.get(l.nodeId);
      if (!n) continue;
      const fx = l.fx ?? 0, fz = l.fz ?? 0;
      const mag = Math.hypot(fx, fz);
      if (mag < 1e-9) continue;
      const px = X(n.x), py = Y(n.z);
      const s2 = 55 / mag;
      const ax = fx * s2, ay = -fz * s2; // SVG-y omlaag → fz flipt
      const tail = { x: px - ax, y: py - ay };
      const tag = caseTag(l.caseId);
      loadEls.push(
        <g key={`pf${l.id}`}>
          <line x1={tail.x} y1={tail.y} x2={px} y2={py}
            stroke={INK} strokeWidth={2} markerEnd="url(#rpt-arrow)" />
          <text x={tail.x} y={tail.y - 8} textAnchor="middle" fontSize={16} fill={INK}>
            {fmtNum(mag, 1)} kN{tag ? ` (${tag})` : ""}
          </text>
        </g>,
      );
    } else if (l.type === "pointMoment" && l.nodeId !== undefined) {
      const n = nodeById.get(l.nodeId);
      if (!n) continue;
      const m = l.my ?? 0;
      if (Math.abs(m) < 1e-9) continue;
      const px = X(n.x), py = Y(n.z);
      const r = 20;
      const sweep = m > 0 ? 1 : 0;
      const tag = caseTag(l.caseId);
      loadEls.push(
        <g key={`pm${l.id}`}>
          <path d={`M ${px + r} ${py} A ${r} ${r} 0 1 ${sweep} ${px - r} ${py}`}
            fill="none" stroke={INK} strokeWidth={2} markerEnd="url(#rpt-arrow)" />
          <text x={px} y={py - r - 8} textAnchor="middle" fontSize={16} fill={INK}>
            {fmtNum(Math.abs(m), 1)} kNm{tag ? ` (${tag})` : ""}
          </text>
        </g>,
      );
    } else if (l.type === "thermal" && l.beamId !== undefined && l.deltaT !== undefined) {
      const b = beams.find((bb) => bb.id === l.beamId);
      if (!b) continue;
      const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
      if (!nA || !nB) continue;
      const mx = (X(nA.x) + X(nB.x)) / 2, my2 = (Y(nA.z) + Y(nB.z)) / 2;
      loadEls.push(
        <text key={`th${l.id}`} x={mx} y={my2 - 12} textAnchor="middle"
          fontSize={15} fill={MUTED} fontStyle="italic">
          ΔT = {l.deltaT > 0 ? "+" : ""}{fmtNum(l.deltaT, 1)} K
        </text>,
      );
    }
  }

  // ── Maatvoering ──────────────────────────────────────────────────────────
  // Voorkeur: stramienposities (indien aan en binnen de modelomvang),
  // anders de unieke knoopcoördinaten.
  const uniqSorted = (vals: number[]): number[] => {
    const out: number[] = [];
    for (const v of [...vals].sort((a, b) => a - b)) {
      if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 1) out.push(v);
    }
    return out;
  };
  const pickPositions = (
    gridAxes: { position: number }[],
    nodeVals: number[],
    lo: number,
    hi: number,
  ): number[] => {
    if (structuralGrid.enabled && gridAxes.length >= 2) {
      const g = uniqSorted(
        gridAxes.map((a) => a.position).filter((p) => p >= lo - 1 && p <= hi + 1),
      );
      if (g.length >= 2) return g;
    }
    return uniqSorted(nodeVals);
  };

  const dimEls: React.ReactNode[] = [];
  const tick = (cx: number, cy: number, key: string) => (
    <line key={key} x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6}
      stroke={DIM} strokeWidth={1.5} />
  );

  // Horizontaal (overspanningen), onder het model.
  const dimXs = pickPositions(structuralGrid.xAxes, xs, minX, maxX);
  if (dimXs.length >= 2) {
    const yDim = MT + tr.dzMm * tr.scale + 115;
    dimEls.push(
      <line key="hdim" x1={X(dimXs[0])} y1={yDim} x2={X(dimXs[dimXs.length - 1])} y2={yDim}
        stroke={DIM} strokeWidth={1.2} />,
    );
    dimXs.forEach((x, i) => {
      const sx0 = X(x);
      dimEls.push(
        <line key={`hext${i}`} x1={sx0} y1={yDim - 24} x2={sx0} y2={yDim + 8}
          stroke={MUTED} strokeWidth={0.8} />,
        tick(sx0, yDim, `htick${i}`),
      );
      if (i > 0) {
        const mx = (X(dimXs[i - 1]) + sx0) / 2;
        dimEls.push(
          <text key={`hlbl${i}`} x={mx} y={yDim - 8} textAnchor="middle" fontSize={15} fill={DIM}>
            {fmtLenM(x - dimXs[i - 1])}
          </text>,
        );
      }
    });
  }

  // Verticaal (verdiepings-/kolomhoogten), links van het model.
  if (hasHeight) {
    const dimZs = pickPositions(structuralGrid.zAxes, zs, minZ, maxZ);
    if (dimZs.length >= 2) {
      const xDim = ML - 70;
      dimEls.push(
        <line key="vdim" x1={xDim} y1={Y(dimZs[0])} x2={xDim} y2={Y(dimZs[dimZs.length - 1])}
          stroke={DIM} strokeWidth={1.2} />,
      );
      dimZs.forEach((z, i) => {
        const sy0 = Y(z);
        dimEls.push(
          <line key={`vext${i}`} x1={xDim - 8} y1={sy0} x2={xDim + 24} y2={sy0}
            stroke={MUTED} strokeWidth={0.8} />,
          tick(xDim, sy0, `vtick${i}`),
        );
        if (i > 0) {
          const my2 = (Y(dimZs[i - 1]) + sy0) / 2;
          dimEls.push(
            <text key={`vlbl${i}`} x={xDim - 8} y={my2} textAnchor="middle" fontSize={15}
              fill={DIM} transform={`rotate(-90 ${xDim - 8} ${my2})`}>
              {fmtLenM(z - dimZs[i - 1])}
            </text>,
          );
        }
      });
    }
  }

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionSchema", "Constructieschets")}</h2>
      <p className="rpt-note">
        {t(
          "report.schemaLegend",
          "Knoopnummers zwart, staafnummers grijs tussen haakjes; maten in m, lasten karakteristiek per belastinggeval (G/Q/S/W).",
        )}
      </p>

      {/* Generieke figuurconventie: figuurblok + vet bijschrift eronder. */}
      <div className="rpt-figuur">
        <svg
          className="rpt-figuur-svg rpt-schema-svg"
          viewBox={`0 0 ${Math.round(W)} ${Math.round(H)}`}
          role="img"
        >
          <defs>
            <marker id="rpt-arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
            </marker>
          </defs>

          {/* Opleggingen onder de staven zodat de staaflijn zichtbaar blijft */}
          {renderSupportSymbols(supports, nodeById, tr)}

          {/* Staven + staafnummers */}
          {renderBeamLines(beams, nodeById, tr)}

          {/* Lasten */}
          {loadEls}

          {/* Knopen + nummers */}
          {renderNodeDots(nodes, tr)}

          {/* Maatvoering */}
          {dimEls}
        </svg>
        <div className="rpt-figuur-bijschrift">
          {t("report.sectionSchema", "Constructieschets")}
        </div>
      </div>
    </div>
  );
}
