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
 * DATAROUTE: de combinatiepijplijn (`combineResults` in combinations.ts)
 * combineert `plateElements` zelf: de componenten σx, σy, τxy en nx/ny/nxy per
 * elementINDEX lineair, von Mises en hoofdspanningen daarna opnieuw uit de
 * gecombineerde componenten (von Mises zelf mag niet gesuperponeerd worden).
 * Dat vraagt hetzelfde rekenmesh in elk belastinggeval; de engine meshet
 * lastonafhankelijk, en randlasten en randpuntlasten veranderen het mesh niet.
 * Deze sectie leest dus in de eerste plaats `comboResult.plateElements`, en
 * superponeert alleen zelf over de per-belastinggeval-resultaten (caseResults)
 * als een combinatieresultaat dat veld niet draagt.
 * Voor het enkelgeval-equivalent (bijv. een combinatie met alleen factor 1,0
 * op één geval) zijn de waarden identiek aan de canvas-contourlegenda.
 *
 * MATERIAALASSEN. Een richtingsafhankelijke plaat (hout, kruislaaghout) krijgt
 * een derde en vierde tabel met σ₁, σ₂ en τ₁₂ in de hoofdrichting van het
 * materiaal (`lib/plaatMateriaal.spanningInMateriaalassen`): de spanningen die
 * een houttoets vraagt. Isotrope platen staan daar niet in; hun tabellen
 * blijven zoals ze waren.
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
import { spanningInMateriaalassen } from "../../../lib/plaatMateriaal";
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
  /** Alleen bij een richtingsafhankelijke plaat: σ₁/σ₂/τ₁₂ in de materiaalassen. */
  materiaal?: MateriaalMinMax;
}

/** Min/max in de materiaalassen, met de hoofdrichting waarin ze gelden. */
interface MateriaalMinMax {
  hoekGraden: number;
  sigma1: MinMax;
  sigma2: MinMax;
  tau12: MinMax;
}

/** Nieuwe min/max-grenzen of bestaande verruimen met één waarde. */
function verruim(r: MinMax | undefined, v: number): MinMax {
  return r ? { min: Math.min(r.min, v), max: Math.max(r.max, v) } : { min: v, max: v };
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
    ...(pr.materiaalassen
      ? {
          materiaal: {
            hoekGraden: pr.materiaalassen.hoekGraden,
            sigma1: { ...pr.materiaalassen.ranges.sigma1 },
            sigma2: { ...pr.materiaalassen.ranges.sigma2 },
            tau12: { ...pr.materiaalassen.ranges.tau12 },
          },
        }
      : {}),
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
  // De hoofdrichting hoort bij de plaat en is in elk geval dezelfde.
  let hoekGraden: number | undefined;
  for (const [caseId, factor] of combo.factors) {
    if (factor === 0) continue;
    const pr = caseResults.get(caseId)?.plateElements?.find((r) => r.plateId === plateId);
    if (!pr) continue;
    if (pr.materiaalassen) hoekGraden = pr.materiaalassen.hoekGraden;
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
    const m = hoekGraden !== undefined
      ? spanningInMateriaalassen(a.sx, a.sy, a.txy, hoekGraden)
      : null;
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
    if (m && hoekGraden !== undefined) {
      row.materiaal = {
        hoekGraden,
        sigma1: verruim(row.materiaal?.sigma1, m.sigma1),
        sigma2: verruim(row.materiaal?.sigma2, m.sigma2),
        tau12: verruim(row.materiaal?.tau12, m.tau12),
      };
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
      if (r.materiaal) {
        const m = row.materiaal;
        const samen = (a: MinMax | undefined, b: MinMax): MinMax =>
          a ? { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) } : { ...b };
        row.materiaal = {
          hoekGraden: r.materiaal.hoekGraden,
          sigma1: samen(m === r.materiaal ? undefined : m?.sigma1, r.materiaal.sigma1),
          sigma2: samen(m === r.materiaal ? undefined : m?.sigma2, r.materiaal.sigma2),
          tau12: samen(m === r.materiaal ? undefined : m?.tau12, r.materiaal.tau12),
        };
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

  // Materiaalassen: alleen platen met een richtingsafhankelijk materiaal.
  const matHeads = (
    <>
      <th className="rpt-num">{t("report.colMainDirection", "Hoofdrichting [°]")}</th>
      <th className="rpt-num">σ₁,min [N/mm²]</th>
      <th className="rpt-num">σ₁,max [N/mm²]</th>
      <th className="rpt-num">σ₂,min [N/mm²]</th>
      <th className="rpt-num">σ₂,max [N/mm²]</th>
      <th className="rpt-num">τ₁₂,min [N/mm²]</th>
      <th className="rpt-num">τ₁₂,max [N/mm²]</th>
    </>
  );
  const matCells = (m: MateriaalMinMax) => (
    <>
      <td className="rpt-num">{fmtNum(m.hoekGraden, 1)}</td>
      <td className="rpt-num">{fmtNum(m.sigma1.min, 2)}</td>
      <td className="rpt-num">{fmtNum(m.sigma1.max, 2)}</td>
      <td className="rpt-num">{fmtNum(m.sigma2.min, 2)}</td>
      <td className="rpt-num">{fmtNum(m.sigma2.max, 2)}</td>
      <td className="rpt-num">{fmtNum(m.tau12.min, 2)}</td>
      <td className="rpt-num">{fmtNum(m.tau12.max, 2)}</td>
    </>
  );
  const comboMatRows = rs.scope !== "envelope" && rs.combo
    ? sortedPlates.flatMap((p) => {
        const r = plateRowForCombo(rs.combo!, rs.result, caseResults, p.id);
        return r?.materiaal ? [{ id: p.id, m: r.materiaal }] : [];
      })
    : [];
  const envMatRows = sortedPlates.flatMap((p) => {
    const m = envRows.get(p.id)?.materiaal;
    return m ? [{ id: p.id, m }] : [];
  });

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

      {/* ── Tabel 3 en 4: in de materiaalassen (hout, kruislaaghout) ── */}
      {comboMatRows.length > 0 && rs.combo && (
        <>
          <h3 className="rpt-h3">
            {t("report.plateStressMaterialTitle", "In de materiaalassen")}: {rs.combo.name}
          </h3>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colPlate", "Plaat")}</th>
                {matHeads}
              </tr>
            </thead>
            <tbody>
              {comboMatRows.map(({ id, m }) => (
                <tr key={id}>
                  <td>{id}</td>
                  {matCells(m)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {envMatRows.length > 0 && (
        <>
          <h3 className="rpt-h3">
            {t("report.plateStressMaterialEnvelopeTitle", "In de materiaalassen — omhullende")}
          </h3>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colPlate", "Plaat")}</th>
                {matHeads}
              </tr>
            </thead>
            <tbody>
              {envMatRows.map(({ id, m }) => (
                <tr key={id}>
                  <td>{id}</td>
                  {matCells(m)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t("report.plateStressMaterialNote")}
          </p>
        </>
      )}
      <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
        {t(
          "report.plateStressNote",
          "Spanningen in N/mm², elementgemiddeld over het rekenmesh; min/max per plaat — dezelfde waarden als de contourlegenda op het canvas. Het maatgevende element is het element met de grootste von Mises-spanning.",
        )}
      </p>
    </div>
  );
}
