/**
 * DisplacementsSection — verplaatsingen voor de gekozen combinatie:
 *  1. per knoop ux, uz (mm) en rotatie φy (mrad);
 *  2. per staaf het veldmaximum van de lokale zakking |w| met de positie x
 *     vanaf de beginknoop (uit de 21 deflection-stations van de solver).
 *
 * Verplaatsingen zijn niet zinvol te "omhullen" per knoop (min/max van
 * componenten hoort niet bij één vervormingsfiguur); is de omhullende
 * gekozen, dan toont deze sectie daarom de MAATGEVENDE combinatie — die met
 * de grootste verplaatsing (Envelope.maxDisplacementCombinationId) — met
 * een expliciete vermelding daarvan.
 *
 * Zonder (actuele) resultaten: de "Nog niet berekend"-melding (invalidatie
 * via useFemStore, zie ReportDataContext).
 */
import { useTranslation } from "react-i18next";
import { useReportData } from "../ReportDataContext";
import { fmtLenM, fmtNum } from "../reportFormat";
import {
  NotComputedNote,
  ScopePrintLine,
  ScopeSelector,
  useResultScope,
} from "../resultScope";

export default function DisplacementsSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, beams, combinationResults, envelope } = useReportData();
  const rs = useResultScope();

  if (!rs.hasResults || !combinationResults) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionDisplacements", "Verplaatsingen")}</h2>
        <NotComputedNote />
      </div>
    );
  }

  // Omhullende gekozen → val terug op de maatgevende combinatie.
  let combo = rs.combo;
  let result = rs.result;
  let governingNote = false;
  if (rs.scope === "envelope") {
    const govId = envelope?.maxDisplacementCombinationId ?? null;
    combo =
      rs.combosWithResults.find((c) => c.id === govId) ?? rs.combosWithResults[0];
    result = combinationResults.get(combo.id);
    governingNote = true;
  }

  if (!combo || !result) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionDisplacements", "Verplaatsingen")}</h2>
        <NotComputedNote />
      </div>
    );
  }

  const sortedNodes = [...nodes].sort((a, b) => a.id - b.id);
  const sortedBeams = [...beams].sort((a, b) => a.id - b.id);

  // Veldmaximum |w| per staaf uit de deflection-stations.
  const fieldRows = sortedBeams.flatMap((beam) => {
    const ef = result!.elements.get(beam.id);
    if (!ef || !ef.deflection || ef.deflection.length !== ef.stations_mm.length) {
      return [];
    }
    let iMax = 0;
    for (let i = 1; i < ef.deflection.length; i++) {
      if (Math.abs(ef.deflection[i]) > Math.abs(ef.deflection[iMax])) iMax = i;
    }
    return [{
      beamId: beam.id,
      w: ef.deflection[iMax],
      x_mm: ef.stations_mm[iMax],
      L_mm: ef.L_mm,
    }];
  });

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionDisplacements", "Verplaatsingen")}</h2>
      <ScopeSelector rs={rs} />
      <ScopePrintLine rs={rs} />
      {governingNote && (
        <p className="rpt-note">
          {t(
            "report.governingDispNote",
            "Omhullende gekozen — getoond is de maatgevende combinatie (grootste verplaatsing):",
          )}{" "}
          <strong>{combo.name}</strong>.
        </p>
      )}

      {/* ── Knoopverplaatsingen ── */}
      <h3 className="rpt-h3">{t("report.nodalDispTitle", "Knoopverplaatsingen")}</h3>
      {sortedNodes.length === 0 ? (
        <p className="rpt-empty-note">{t("report.noNodes", "Geen knopen in het model.")}</p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>{t("report.colNode", "Knoop")}</th>
              <th className="rpt-num">ux [mm]</th>
              <th className="rpt-num">uz [mm]</th>
              <th className="rpt-num">φy [mrad]</th>
            </tr>
          </thead>
          <tbody>
            {sortedNodes.map((n) => {
              const d = result!.displacements.get(n.id);
              return (
                <tr key={n.id}>
                  <td>{n.id}</td>
                  <td className="rpt-num">{d ? fmtNum(d.ux, 2) : "—"}</td>
                  <td className="rpt-num">{d ? fmtNum(d.uz, 2) : "—"}</td>
                  <td className="rpt-num">{d ? fmtNum(d.ry * 1000, 2) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── Veldzakking per staaf ── */}
      {fieldRows.length > 0 && (
        <>
          <h3 className="rpt-h3">
            {t("report.fieldDeflTitle", "Veldzakking per staaf (max |w|)")}
          </h3>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colBeam", "Staaf")}</th>
                <th className="rpt-num">w [mm]</th>
                <th className="rpt-num">{t("report.colPosition", "x [m]")}</th>
                <th className="rpt-num">x/L [—]</th>
              </tr>
            </thead>
            <tbody>
              {fieldRows.map((row) => (
                <tr key={row.beamId}>
                  <td>{row.beamId}</td>
                  <td className="rpt-num">{fmtNum(row.w, 2)}</td>
                  <td className="rpt-num">{fmtLenM(row.x_mm)}</td>
                  <td className="rpt-num">
                    {row.L_mm > 0 ? fmtNum(row.x_mm / row.L_mm, 2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t(
              "report.fieldDeflNote",
              "w = lokale zakking loodrecht op de staafas (negatief = doorhangen); x gemeten vanaf de beginknoop.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
