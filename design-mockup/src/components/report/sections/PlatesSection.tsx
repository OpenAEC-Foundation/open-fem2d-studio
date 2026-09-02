/**
 * PlatesSection — invoertabel platen (wandschijven): id, hoekknopen, dikte,
 * materiaal (E/ν/ρ) en meshgrootte, plus het aantal elementen van het
 * rekenmesh uit de laatste berekening (elk combinatieresultaat draagt
 * hetzelfde mesh; zonder actueel resultaat blijft de kolom "—").
 *
 * Leest live uit de ReportDataContext; zonder platen een eerlijke
 * lege-modelmelding. Eenheden zoals het eigenschappenpaneel: mm, N/mm²,
 * kg/m³.
 */
import { useTranslation } from "react-i18next";
import { withPlateDefaults, type Plate } from "../../fem/femTypes";
import type { SolverResult } from "../../fem/solver/types";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";

/**
 * Aantal mesh-elementen van een plaat uit het laatste resultaat, of null.
 * De per-belastinggeval-resultaten dragen de `plateElements`; de
 * combinatieresultaten dienen defensief als tweede bron.
 */
function plateElemCount(
  p: Plate,
  bronnen: (Map<number, SolverResult> | null)[],
): number | null {
  for (const bron of bronnen) {
    if (!bron) continue;
    for (const res of bron.values()) {
      const pr = res.plateElements?.find((r) => r.plateId === p.id);
      if (pr && pr.elements.length > 0) return pr.elements.length;
    }
  }
  return null;
}

export default function PlatesSection() {
  const { t } = useTranslation("ribbon");
  const { plates, combinationResults, caseResults } = useReportData();

  const sorted = [...plates].sort((a, b) => a.id - b.id);

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionPlates", "Platen")}</h2>

      {sorted.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noPlates", "Geen platen in het model.")}
        </p>
      ) : (
        <>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colId", "Id")}</th>
                <th>{t("report.colCorners", "Hoekknopen")}</th>
                <th className="rpt-num">t [mm]</th>
                <th className="rpt-num">E [N/mm²]</th>
                <th className="rpt-num">ν [—]</th>
                <th className="rpt-num">ρ [kg/m³]</th>
                <th className="rpt-num">{t("report.colMeshSize", "Meshgrootte [mm]")}</th>
                <th className="rpt-num">{t("report.colElemCount", "Elementen")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const d = withPlateDefaults(p);
                const nElems = plateElemCount(p, [caseResults, combinationResults]);
                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.nodeIds.join(", ")}</td>
                    <td className="rpt-num">{fmtNum(d.thickness!, 1)}</td>
                    <td className="rpt-num">{fmtNum(d.E!, 0)}</td>
                    <td className="rpt-num">{fmtNum(d.nu!, 2)}</td>
                    <td className="rpt-num">{fmtNum(d.rho!, 0)}</td>
                    <td className="rpt-num">{fmtNum(d.meshSize!, 0)}</td>
                    <td className="rpt-num">{nElems !== null ? nElems : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t(
              "report.plateKindNote",
              "Platen rekenen mee als wandschijf (membraan, in het vlak); het rekenmesh wordt bij elke berekening opnieuw uit de meshgrootte gegenereerd.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
