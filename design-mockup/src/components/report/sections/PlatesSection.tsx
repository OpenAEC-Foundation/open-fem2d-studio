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
import { withPlateDefaults, effectiefPlaatMeshType, type Plate, type Node } from "../../fem/femTypes";
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

/** Maten van een opening voor de tabel: "b × h mm" bij een rechthoek, anders het aantal hoeken. */
function openingOmschrijving(punten: { x: number; z: number }[]): string {
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const b = Math.max(...xs) - Math.min(...xs), h = Math.max(...zs) - Math.min(...zs);
  return punten.length === 4 ? `${fmtNum(b, 0)} × ${fmtNum(h, 0)} mm` : `${punten.length}-hoek`;
}

/** Elementkeuze zoals de plaat werkelijk rekent (eigen keuze of de standaard voor de vorm). */
function meshTypeTekst(p: Plate, nodes: Node[]): string {
  const hoeken = p.nodeIds.map((id) => nodes.find((n) => n.id === id));
  if (hoeken.some((h) => !h)) return "—";
  const soort = effectiefPlaatMeshType(p, hoeken.map((h) => ({ x: h!.x, z: h!.z })));
  return p.meshType ? soort : `${soort} (standaard)`;
}

export default function PlatesSection() {
  const { t } = useTranslation("ribbon");
  const { plates, nodes, combinationResults, caseResults } = useReportData();

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
                <th>{t("report.colMeshType", "Elementen (type)")}</th>
                <th className="rpt-num">{t("report.colElemCount", "Elementen")}</th>
                <th>{t("report.colOpenings", "Openingen")}</th>
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
                    <td>{meshTypeTekst(p, nodes)}</td>
                    <td className="rpt-num">{nElems !== null ? nElems : "—"}</td>
                    <td>
                      {p.openingen && p.openingen.length > 0
                        ? p.openingen.map((o) => `${o.id}: ${openingOmschrijving(o.punten)}`).join("; ")
                        : t("report.noOpenings", "geen")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t(
              "report.plateKindNote",
              "Platen rekenen mee als wandschijf (membraan, in het vlak); het rekenmesh wordt bij elke berekening opnieuw uit de meshgrootte gegenereerd. Vierhoeken zijn bilineaire Quad4-elementen, driehoeken CST-elementen (constante rek); een polygoonplaat met vierhoeken kan een gemengd net geven waar de koppeling van driehoeken niet lukt. Openingen blijven vrij van elementen; het net legt knopen op de openingsrand.",
            )}
          </p>
          <p className="rpt-note" style={{ marginTop: "1mm" }}>
            {t(
              "report.plateLoadNote",
              "Randlasten (ook deel- en trapeziumlasten) en puntlasten op een plaatrand worden volgens de lineaire vormfuncties van de randelementen omgezet in knoopkrachten op de randknopen; een staafeinde dat tussen twee randknopen op een plaatrand ligt, wordt kinematisch aan die rand gekoppeld (lineaire interpolatie).",
            )}
          </p>
        </>
      )}
    </div>
  );
}
