/**
 * DiagramsSection — krachtsverdeling per staaf: M, V, N en w als gevulde
 * krommen langs de (uitgerolde) staafas, rechtstreeks uit de 21-station-
 * arrays van de solver (zelfde databron als FemResultsOverlay, maar dan
 * statisch en zwart-wit-vriendelijk voor de print).
 *
 * Tekenconventies (identiek aan de canvas-overlay):
 *  - M sagging-positief, getekend aan de TREKzijde → positief M onder de
 *    staafas;
 *  - V en N in ruwe tekenrichting (positief boven de as);
 *  - w is de LOKALE veldzakking (negatief = doorhangen) → negatief onder de
 *    as, consistent met het M-beeld.
 *
 * Combinatie-keuze via de gedeelde ScopeSelector (reportStore.resultCombo);
 * default de omhullende: per station het min/max over alle combinaties als
 * band (de Envelope van de solver kent geen stationsverloop, dus die band
 * wordt hier station-voor-station uit de combinatieresultaten opgebouwd).
 * In de print staat de gekozen combinatie als tekstregel onder de kop.
 */
import { useTranslation } from "react-i18next";
import type { Beam } from "../../fem/femTypes";
import type { ElementForces } from "../../fem/solver/types";
import { beamLengthMm } from "../../../lib/steelCheckBuilder";
import { useReportData } from "../ReportDataContext";
import { fmtLenM, fmtNum } from "../reportFormat";
import {
  NotComputedNote,
  ScopePrintLine,
  ScopeSelector,
  useResultScope,
} from "../resultScope";

/** Min/max per station; bij één combinatie zijn min en max identiek. */
interface Series {
  min: number[];
  max: number[];
}

interface BeamDiagramData {
  beam: Beam;
  L_mm: number;
  stations: number[];
  M: Series;
  V: Series;
  N: Series;
  w: Series;
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

/** Eén mini-diagram: baseline = staafas, gevulde kromme (of min/max-band). */
function Diagram({
  series,
  stations,
  L_mm,
  band,
  flip,
  unitDiv,
  decimals,
}: {
  series: Series;
  stations: number[];
  L_mm: number;
  /** True = omhullende: teken min- en max-kromme met vulling ertussen. */
  band: boolean;
  /** True = positieve waarden ONDER de as (M aan de trekzijde). */
  flip: boolean;
  /** Deler ruwe eenheid → rapporteenheid (1e6 voor kNm, 1e3 voor kN, 1 voor mm). */
  unitDiv: number;
  decimals: number;
}) {
  const VW = 340, VH = 130;
  const PL = 14, PR = 326;      // plotbereik x
  const BASE = VH / 2;          // staafas
  const AMP = 42;               // max uitslag in px

  const n = Math.min(stations.length, series.min.length, series.max.length);
  if (n < 2 || L_mm <= 0) return null;

  let vAbs = 0;
  for (let i = 0; i < n; i++) {
    vAbs = Math.max(vAbs, Math.abs(series.min[i]), Math.abs(series.max[i]));
  }
  const eps = 0.005 * unitDiv; // < 0.005 rapporteenheid = tekenruis
  const sx = (i: number) => PL + (stations[i] / L_mm) * (PR - PL);
  const dir = flip ? 1 : -1;   // SVG-y omlaag: -1 = positief boven de as
  const k = vAbs > eps ? AMP / vAbs : 0;
  const sy = (v: number) => BASE + dir * v * k;

  const minPts = Array.from({ length: n }, (_, i) => `${sx(i).toFixed(1)},${sy(series.min[i]).toFixed(1)}`);
  const maxPts = Array.from({ length: n }, (_, i) => `${sx(i).toFixed(1)},${sy(series.max[i]).toFixed(1)}`);

  // Vulling: single → kromme tegen de as; band → tussen min- en max-kromme.
  const fillPts = band
    ? [...maxPts, ...[...minPts].reverse()].join(" ")
    : [...maxPts, `${sx(n - 1).toFixed(1)},${BASE}`, `${sx(0).toFixed(1)},${BASE}`].join(" ");

  // Extreme waarden: globaal maximum en minimum met station-positie.
  let iMax = 0, iMin = 0;
  for (let i = 1; i < n; i++) {
    if (series.max[i] > series.max[iMax]) iMax = i;
    if (series.min[i] < series.min[iMin]) iMin = i;
  }
  const labels: React.ReactNode[] = [];
  const addLabel = (i: number, v: number, key: string) => {
    if (Math.abs(v) <= Math.max(eps, vAbs * 0.02)) return;
    const x = Math.min(Math.max(sx(i), 30), VW - 30);
    const plotY = sy(v);
    // Label net buiten de kromme, weg van de as; binnen het tekenvlak houden.
    const y = Math.min(Math.max(plotY + (plotY >= BASE ? 14 : -8), 11), VH - 4);
    labels.push(
      <text key={key} x={x} y={y} textAnchor="middle" fontSize={11}
        fontWeight={600} fill="#1a1a1a">
        {fmtNum(v / unitDiv, decimals)}
      </text>,
    );
  };
  addLabel(iMax, series.max[iMax], "max");
  if (iMin !== iMax || series.min[iMin] !== series.max[iMax]) {
    addLabel(iMin, series.min[iMin], "min");
  }

  return (
    <svg className="rpt-diagram-svg" viewBox={`0 0 ${VW} ${VH}`} role="img">
      {vAbs > eps ? (
        <>
          <polygon points={fillPts} fill="#e2e2e2" stroke="none" />
          <polyline points={maxPts.join(" ")} fill="none" stroke="#1a1a1a" strokeWidth={1.3} />
          {band && (
            <polyline points={minPts.join(" ")} fill="none" stroke="#1a1a1a" strokeWidth={1.3} />
          )}
        </>
      ) : (
        <text x={VW / 2} y={BASE - 8} textAnchor="middle" fontSize={11} fill="#999">
          ≈ 0
        </text>
      )}
      {/* Staafas + eindmarkeringen bovenop de vulling */}
      <line x1={PL} y1={BASE} x2={PR} y2={BASE} stroke="#1a1a1a" strokeWidth={1} />
      <line x1={PL} y1={BASE - 5} x2={PL} y2={BASE + 5} stroke="#1a1a1a" strokeWidth={1} />
      <line x1={PR} y1={BASE - 5} x2={PR} y2={BASE + 5} stroke="#1a1a1a" strokeWidth={1} />
      {labels}
    </svg>
  );
}

export default function DiagramsSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, beams, combinationResults } = useReportData();
  const rs = useResultScope();

  if (!rs.hasResults || !combinationResults) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionDiagrams", "Krachtsverdeling")}</h2>
        <NotComputedNote />
      </div>
    );
  }

  const isEnvelope = rs.scope === "envelope";

  // Per staaf de diagramdata verzamelen (staven zonder resultaat overslaan).
  const data: BeamDiagramData[] = [];
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
        w: envelopeSeries(efs, (ef) => ef.deflection ?? []),
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
        w: seriesFrom(ef.deflection ?? []),
      });
    }
  }

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionDiagrams", "Krachtsverdeling")}</h2>
      <ScopeSelector rs={rs} />
      <ScopePrintLine rs={rs} />
      {isEnvelope && (
        <p className="rpt-note">
          {t(
            "report.envelopeBandNote",
            "Omhullende: per staaf de band tussen minimum en maximum over alle combinaties.",
          )}
        </p>
      )}

      {data.length === 0 ? (
        <p className="rpt-empty-note">{t("report.noBeams", "Geen staven in het model.")}</p>
      ) : (
        data.map(({ beam, L_mm, stations, M, V, N, w }) => (
          <div className="rpt-diagram-beam" key={beam.id}>
            <h3 className="rpt-h3">
              {t("report.beamWord", "staaf")} {beam.id}
              <span className="rpt-h3-tag">
                {beam.material ?? "S235"} {beam.profile ?? "HEA160"}
                {" · "}L = {fmtLenM(beamLengthMm(beam, nodes))} m
                {" · "}{beam.from} → {beam.to}
              </span>
            </h3>
            <div className="rpt-diagram-grid">
              <div className="rpt-diagram-cell">
                <div className="rpt-diagram-title">M [kNm]</div>
                <Diagram series={M} stations={stations} L_mm={L_mm}
                  band={isEnvelope} flip unitDiv={1e6} decimals={1} />
              </div>
              <div className="rpt-diagram-cell">
                <div className="rpt-diagram-title">V [kN]</div>
                <Diagram series={V} stations={stations} L_mm={L_mm}
                  band={isEnvelope} flip={false} unitDiv={1e3} decimals={1} />
              </div>
              <div className="rpt-diagram-cell">
                <div className="rpt-diagram-title">N [kN]</div>
                <Diagram series={N} stations={stations} L_mm={L_mm}
                  band={isEnvelope} flip={false} unitDiv={1e3} decimals={1} />
              </div>
              <div className="rpt-diagram-cell">
                <div className="rpt-diagram-title">w [mm]</div>
                <Diagram series={w} stations={stations} L_mm={L_mm}
                  band={isEnvelope} flip={false} unitDiv={1} decimals={2} />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
