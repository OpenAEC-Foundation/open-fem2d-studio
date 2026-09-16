/**
 * PlatesSection — invoertabel platen (wandschijven): id, hoekknopen, dikte,
 * materiaal (naam, E/ν/ρ met de BRON erbij, en de hoofdrichting bij een
 * richtingsafhankelijk materiaal) en meshgrootte, plus het aantal elementen
 * van het rekenmesh uit de laatste berekening (elk combinatieresultaat draagt
 * hetzelfde mesh; zonder actueel resultaat blijft de kolom "—").
 *
 * WAAROM DE BRON IN HET RAPPORT STAAT. E, ν en ρ kunnen uit het gekozen
 * materiaal komen of met de hand zijn ingevuld, en die twee zijn aan het
 * getal alleen niet te onderscheiden. Wie het rapport naleest moet kunnen
 * zien welke van de twee gold: een handmatige E maakt een houten of
 * kruislaaghouten plaat bovendien isotroop, en dat is een rekenkundig
 * verschil dat niet stil mag blijven.
 *
 * Leest live uit de ReportDataContext; zonder platen een eerlijke
 * lege-modelmelding. Eenheden zoals het eigenschappenpaneel: mm, N/mm²,
 * kg/m³.
 */
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { withPlateDefaults, effectiefPlaatMeshType, type Plate, type Node } from "../../fem/femTypes";
import { bepaalPlaatStijfheid, plaatMateriaalLabel } from "../../../lib/plaatMateriaal";
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

/** Korte bronaanduiding in de tabel; de volle uitleg staat in de regels eronder. */
const BRON_KORT: Record<string, string> = {
  materiaal: "report.plateBron_materiaal",
  handmatig: "report.plateBron_handmatig",
  standaard: "report.plateBron_standaard",
};

/** Maten van een opening voor de tabel: "b × h mm" bij een rechthoek, anders het aantal hoeken. */
function openingOmschrijving(t: TFunction, punten: { x: number; z: number }[]): string {
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const b = Math.max(...xs) - Math.min(...xs), h = Math.max(...zs) - Math.min(...zs);
  return punten.length === 4 ? `${fmtNum(b, 0)} × ${fmtNum(h, 0)} mm` : t("report.plateNHoek", { n: punten.length });
}

/** Elementkeuze zoals de plaat werkelijk rekent (eigen keuze of de standaard voor de vorm). */
function meshTypeTekst(t: TFunction, p: Plate, nodes: Node[]): string {
  const hoeken = p.nodeIds.map((id) => nodes.find((n) => n.id === id));
  if (hoeken.some((h) => !h)) return "—";
  const soort = effectiefPlaatMeshType(p, hoeken.map((h) => ({ x: h!.x, z: h!.z })));
  return p.meshType ? soort : t("report.plateMeshStandaard", { soort });
}

export default function PlatesSection() {
  const { t } = useTranslation("ribbon");
  const { plates, nodes, combinationResults, caseResults } = useReportData();

  const sorted = [...plates].sort((a, b) => a.id - b.id);
  // Eén regel per plaat MET materiaal: waar E₁, E₂, G₁₂, ν en ρ vandaan
  // komen, met het normartikel erbij, en welke velden met de hand zijn
  // overschreven. Platen zonder materiaal krijgen geen regel — daar staat
  // alles al in de tabel.
  // Waarschuwingen (bijvoorbeeld de niet-gereduceerde G₁₂ van kruislaaghout,
  // issue #14) krijgen een eigen regel, zodat ze niet in de herkomst
  // verdwijnen.
  const herkomstRegels: [string, number, string][] = [];
  for (const p of sorted) {
    const uit = bepaalPlaatStijfheid(withPlateDefaults(p));
    if (uit.ok && uit.stijfheid.soort !== null) {
      herkomstRegels.push([`h${p.id}`, p.id, uit.stijfheid.herkomst]);
      uit.stijfheid.waarschuwingen.forEach((w, i) =>
        herkomstRegels.push([`w${p.id}-${i}`, p.id, t("report.plateWaarschuwing", { tekst: w })]));
    }
    if (!uit.ok) herkomstRegels.push([`g${p.id}`, p.id, t("report.plateMateriaalGeweigerd", { reden: uit.reden })]);
  }

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
                <th>{t("report.colPlateMaterial", "Materiaal")}</th>
                <th className="rpt-num">E₁ [N/mm²]</th>
                <th className="rpt-num">E₂ [N/mm²]</th>
                <th className="rpt-num">G₁₂ [N/mm²]</th>
                <th className="rpt-num">ν [—]</th>
                <th className="rpt-num">ρ [kg/m³]</th>
                <th>{t("report.colPlateSource", "Bron E / ν / ρ")}</th>
                <th className="rpt-num">{t("report.colPlateAngle", "Hoofdrichting [°]")}</th>
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
                // Dezelfde bepaling als de solver. Wordt het materiaal niet
                // herkend, dan weigert de berekening ook; het rapport zet dan
                // de reden in de kolom in plaats van getallen te verzinnen.
                const uit = bepaalPlaatStijfheid(d);
                const st = uit.ok ? uit.stijfheid : null;
                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.nodeIds.join(", ")}</td>
                    <td className="rpt-num">{fmtNum(d.thickness!, 1)}</td>
                    <td>
                      {st
                        ? plaatMateriaalLabel(st)
                        : t("report.plateGeweigerd", { reden: uit.ok ? "" : uit.reden })}
                    </td>
                    <td className="rpt-num">{st ? fmtNum(st.E1, 0) : "—"}</td>
                    <td className="rpt-num">{st ? fmtNum(st.E2, 0) : "—"}</td>
                    <td className="rpt-num">
                      {st ? fmtNum(st.G12, 0) : "—"}
                      {st?.bronG12 === "bovengrens" ? ` ${t("report.plateG12Bovengrens")}` : ""}
                    </td>
                    <td className="rpt-num">{st ? fmtNum(st.nu12, 2) : "—"}</td>
                    <td className="rpt-num">{st ? fmtNum(st.rho, 0) : "—"}</td>
                    <td>
                      {st
                        ? `${t(BRON_KORT[st.bronE])} / ${t(BRON_KORT[st.bronNu])} / ${t(BRON_KORT[st.bronRho])}`
                        : "—"}
                    </td>
                    <td className="rpt-num">{st?.orthotroop ? fmtNum(st.hoekGraden, 1) : "—"}</td>
                    <td className="rpt-num">{fmtNum(d.meshSize!, 0)}</td>
                    <td>{meshTypeTekst(t, p, nodes)}</td>
                    <td className="rpt-num">{nElems !== null ? nElems : "—"}</td>
                    <td>
                      {p.openingen && p.openingen.length > 0
                        ? p.openingen.map((o) => `${o.id}: ${openingOmschrijving(t, o.punten)}`).join("; ")
                        : t("report.noOpenings", "geen")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {herkomstRegels.length > 0 && (
            <ul className="rpt-note" style={{ marginTop: "1.5mm" }}>
              {herkomstRegels.map(([sleutel, id, tekst]) => (
                <li key={sleutel}>
                  {t("report.colPlate", "Plaat")} {id}: {tekst}
                </li>
              ))}
            </ul>
          )}
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t("report.plateKindNoteMesh")}
          </p>
          <p className="rpt-note" style={{ marginTop: "1mm" }}>
            {t(
              "report.plateLoadNote",
              "Randlasten (ook deel- en trapeziumlasten) en puntlasten op een plaatrand worden volgens de lineaire vormfuncties van de randelementen omgezet in knoopkrachten op de randknopen; een staafeinde dat tussen twee randknopen op een plaatrand ligt — de omtrek of de rand van een opening — wordt kinematisch aan die rand gekoppeld (lineaire interpolatie). Een vrij staafeinde tussen 1 en 50 mm van een plaatrand wordt niet gekoppeld maar geweigerd.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
