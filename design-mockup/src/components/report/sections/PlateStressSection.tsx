/**
 * PlateStressSection — plaatspanningen (wandschijven) per combinatie en als
 * omhullende.
 *
 * Twee tabellen (zelfde opzet als de oplegreacties-sectie):
 *  1. de gekozen combinatie: per plaat min/max van σx, σy en τxy plus de
 *     maximale von Mises-spanning met het maatgevende element (het element
 *     waar die maximale von Mises optreedt);
 *  2. de omhullende: min/max per component over ALLE combinaties, met het
 *     maatgevende element én de maatgevende combinatie (grootste von Mises).
 *
 * DATAROUTE: de combinatiepijplijn (combineResults) combineert (nog) geen
 * `plateElements` — die zitten alleen op de per-belastinggeval-resultaten
 * (caseResults in de ReportDataContext). Deze sectie superponeert daarom
 * zelf lineair per element: σ-componenten zijn 1e-orde lineair in de lasten
 * (zelfde mesh per geval — deterministisch grid), en von Mises wordt ná
 * combinatie uit de gecombineerde componenten herberekend (von Mises zelf
 * mag niet gesuperponeerd worden). Draagt een combinatieresultaat het veld
 * `plateElements` wél (toekomstige pijplijn-uitbreiding), dan gaat dat vóór.
 * Voor het enkelgeval-equivalent (bijv. een combinatie met alleen factor 1,0
 * op één geval) zijn de waarden identiek aan de canvas-contourlegenda.
 *
 * Eenheden: spanningen N/mm², elementgemiddeld (constante-rek-elementen).
 * Zonder (actuele) resultaten: de "Nog niet berekend"-melding; zonder platen
 * een eerlijke lege-modelmelding.
 */
import { useTranslation } from "react-i18next";
import type { LoadCombination } from "../../fem/solver/combinations";
import type { PlateResult, SolverResult } from "../../fem/solver/types";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";
import {
  NotComputedNote,
  ScopePrintLine,
  ScopeSelector,
  useResultScope,
} from "../resultScope";

interface MinMax {
  min: number;
  max: number;
}

/** Eén rapportrij voor één plaat binnen één combinatie. */
interface PlateComboRow {
  sigmaX: MinMax;
  sigmaY: MinMax;
  tauXY: MinMax;
  vonMisesMax: number;
  /** Element-id waar de maximale von Mises-spanning optreedt. */
  governingElementId: number;
}

/** Rij voor de omhullende: extremen over alle combinaties. */
interface PlateEnvelopeRow extends PlateComboRow {
  governingCombinationId: number;
}

/** Von Mises-spanning (vlakspanning) uit de gecombineerde componenten. */
function vonMises(sx: number, sy: number, txy: number): number {
  return Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy);
}

/** Rapportrij rechtstreeks uit een aanwezig PlateResult (voorkeursroute). */
function rowFromPlateResult(pr: PlateResult): PlateComboRow | null {
  if (pr.elements.length === 0) return null;
  let gov = pr.elements[0];
  for (const el of pr.elements) {
    if (el.vonMises > gov.vonMises) gov = el;
  }
  return {
    sigmaX: { ...pr.ranges.sigmaX },
    sigmaY: { ...pr.ranges.sigmaY },
    tauXY: { ...pr.ranges.tauXY },
    vonMisesMax: pr.ranges.vonMises.max,
    governingElementId: gov.elementId,
  };
}

/**
 * Gecombineerde plaatspanningen voor één combinatie — zie de dataroute in
 * het bestandscommentaar. Retourneert null zonder bruikbare gegevens.
 */
function plateRowForCombo(
  combo: LoadCombination,
  comboResult: SolverResult | undefined,
  caseResults: Map<number, SolverResult> | null,
  plateId: number,
): PlateComboRow | null {
  // 1) Voorkeursroute: het gecombineerde resultaat draagt de plaatspanningen.
  const direct = comboResult?.plateElements?.find((r) => r.plateId === plateId);
  if (direct) return rowFromPlateResult(direct);

  // 2) Superpositie per element over de per-belastinggeval-resultaten;
  //    een leeg/ontbrekend geval telt als nulbijdrage (zelfde afspraak als
  //    combineResults voor staven).
  if (!caseResults) return null;
  const acc = new Map<number, { sx: number; sy: number; txy: number }>();
  for (const [caseId, factor] of combo.factors) {
    if (factor === 0) continue;
    const pr = caseResults.get(caseId)?.plateElements?.find((r) => r.plateId === plateId);
    if (!pr) continue;
    for (const el of pr.elements) {
      const a = acc.get(el.elementId) ?? { sx: 0, sy: 0, txy: 0 };
      a.sx += factor * el.sigmaX;
      a.sy += factor * el.sigmaY;
      a.txy += factor * el.tauXY;
      acc.set(el.elementId, a);
    }
  }
  if (acc.size === 0) return null;

  let row: PlateComboRow | null = null;
  for (const [elementId, a] of acc) {
    const vm = vonMises(a.sx, a.sy, a.txy);
    if (!row) {
      row = {
        sigmaX: { min: a.sx, max: a.sx },
        sigmaY: { min: a.sy, max: a.sy },
        tauXY: { min: a.txy, max: a.txy },
        vonMisesMax: vm,
        governingElementId: elementId,
      };
    } else {
      row.sigmaX.min = Math.min(row.sigmaX.min, a.sx);
      row.sigmaX.max = Math.max(row.sigmaX.max, a.sx);
      row.sigmaY.min = Math.min(row.sigmaY.min, a.sy);
      row.sigmaY.max = Math.max(row.sigmaY.max, a.sy);
      row.tauXY.min = Math.min(row.tauXY.min, a.txy);
      row.tauXY.max = Math.max(row.tauXY.max, a.txy);
      if (vm > row.vonMisesMax) {
        row.vonMisesMax = vm;
        row.governingElementId = elementId;
      }
    }
  }
  return row;
}

export default function PlateStressSection() {
  const { t } = useTranslation("ribbon");
  const { plates, combinationResults, caseResults } = useReportData();
  const rs = useResultScope();

  const title = t("report.sectionPlateStresses", "Plaatspanningen");

  if (plates.length === 0) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{title}</h2>
        <p className="rpt-empty-note">
          {t("report.noPlates", "Geen platen in het model.")}
        </p>
      </div>
    );
  }

  if (!rs.hasResults || !combinationResults) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{title}</h2>
        <NotComputedNote />
      </div>
    );
  }

  const sortedPlates = [...plates].sort((a, b) => a.id - b.id);

  // Omhullende: per plaat extremen over alle combinaties; maatgevende
  // combinatie = die met de grootste von Mises-spanning.
  const envRows = new Map<number, PlateEnvelopeRow>();
  for (const p of sortedPlates) {
    let row: PlateEnvelopeRow | null = null;
    for (const c of rs.combosWithResults) {
      const r = plateRowForCombo(c, combinationResults.get(c.id), caseResults, p.id);
      if (!r) continue;
      if (!row) {
        row = { ...r, governingCombinationId: c.id };
      } else {
        if (r.vonMisesMax > row.vonMisesMax) {
          // Nieuwe maatgevende combinatie (grootste von Mises).
          row.vonMisesMax = r.vonMisesMax;
          row.governingElementId = r.governingElementId;
          row.governingCombinationId = c.id;
        }
        row.sigmaX.min = Math.min(row.sigmaX.min, r.sigmaX.min);
        row.sigmaX.max = Math.max(row.sigmaX.max, r.sigmaX.max);
        row.sigmaY.min = Math.min(row.sigmaY.min, r.sigmaY.min);
        row.sigmaY.max = Math.max(row.sigmaY.max, r.sigmaY.max);
        row.tauXY.min = Math.min(row.tauXY.min, r.tauXY.min);
        row.tauXY.max = Math.max(row.tauXY.max, r.tauXY.max);
      }
    }
    if (row) envRows.set(p.id, row);
  }

  const comboNaam = (id: number) =>
    rs.combosWithResults.find((c) => c.id === id)?.name ?? String(id);

  // Kolomkoppen van de gedeelde min/max-kolommen (beide tabellen).
  const stressHeads = (
    <>
      <th className="rpt-num">σx,min [N/mm²]</th>
      <th className="rpt-num">σx,max [N/mm²]</th>
      <th className="rpt-num">σy,min [N/mm²]</th>
      <th className="rpt-num">σy,max [N/mm²]</th>
      <th className="rpt-num">τxy,min [N/mm²]</th>
      <th className="rpt-num">τxy,max [N/mm²]</th>
      <th className="rpt-num">σvM,max [N/mm²]</th>
    </>
  );
  const stressCells = (r: PlateComboRow) => (
    <>
      <td className="rpt-num">{fmtNum(r.sigmaX.min, 2)}</td>
      <td className="rpt-num">{fmtNum(r.sigmaX.max, 2)}</td>
      <td className="rpt-num">{fmtNum(r.sigmaY.min, 2)}</td>
      <td className="rpt-num">{fmtNum(r.sigmaY.max, 2)}</td>
      <td className="rpt-num">{fmtNum(r.tauXY.min, 2)}</td>
      <td className="rpt-num">{fmtNum(r.tauXY.max, 2)}</td>
      <td className="rpt-num">{fmtNum(r.vonMisesMax, 2)}</td>
    </>
  );

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{title}</h2>
      <ScopeSelector rs={rs} />
      <ScopePrintLine rs={rs} />

      {/* ── Tabel 1: de gekozen combinatie ── */}
      {rs.scope !== "envelope" && rs.combo && (
        <>
          <h3 className="rpt-h3">{rs.combo.name}</h3>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colPlate", "Plaat")}</th>
                {stressHeads}
                <th>{t("report.colGoverningElem", "Maatgevend element")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlates.map((p) => {
                const r = plateRowForCombo(rs.combo!, rs.result, caseResults, p.id);
                if (!r) return null;
                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    {stressCells(r)}
                    <td className="rpt-num">{r.governingElementId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ── Tabel 2: omhullende min/max over alle combinaties ── */}
      <h3 className="rpt-h3">
        {t("report.envelopePlatesTitle", "Omhullende (min/max over alle combinaties)")}
      </h3>
      <table className="rpt-table">
        <thead>
          <tr>
            <th>{t("report.colPlate", "Plaat")}</th>
            {stressHeads}
            <th>{t("report.colGoverningElem", "Maatgevend element")}</th>
            <th>{t("report.colGoverningCombo", "Maatgevende combinatie")}</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlates.map((p) => {
            const row = envRows.get(p.id);
            if (!row) return null;
            return (
              <tr key={p.id}>
                <td>{p.id}</td>
                {stressCells(row)}
                <td className="rpt-num">{row.governingElementId}</td>
                <td>{comboNaam(row.governingCombinationId)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
        {t(
          "report.plateStressNote",
          "Spanningen in N/mm², elementgemiddeld over het rekenmesh; min/max per plaat — dezelfde waarden als de contourlegenda op het canvas. Het maatgevende element is het element met de grootste von Mises-spanning.",
        )}
      </p>
    </div>
  );
}
