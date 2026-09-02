/**
 * CheckTableSection — toetsing op tabellarisch detailniveau.
 *
 * Eén rij per getoetste staaf: staafnummer, profiel/klasse, norm, de
 * maatgevende toets (artikel + titel, met de UC-formule als KaTeX inline)
 * en de hoogste unity check met status. Bij tien staven dus tien rijen.
 * Onder de tabel een voetregel met de toetsbasis (alleen de normen die
 * daadwerkelijk in de resultaten voorkomen).
 *
 * Leest live uit de checkStore — staal (EN 1993) en hout (EN 1995) lopen
 * door hetzelfde pad. Zonder resultaten: expliciet "nog niet getoetst";
 * niet-toetsbare staven staan er met reden onder.
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { isSteelCheckResult } from "../../../lib/checkTypes";
import {
  CHECK_REPORT_CSS,
  basisText,
  fmtCheckedAt,
  governingInfo,
  renderLatexHtml,
} from "../checkReportUtils";

export default function CheckTableSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);

  const checkedTime = fmtCheckedAt(lastRunAt);
  const basis = basisText(t, results);

  return (
    <div className="rpt-block">
      <style>{CHECK_REPORT_CSS}</style>
      <h2 className="rpt-h2">{t("report.sectionCheckTable", "Toetsingsoverzicht")}</h2>

      {results.length === 0 ? (
        <p className="rpt-empty-note">
          {t(
            "report.notChecked",
            "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.",
          )}
        </p>
      ) : (
        <>
          {checkedTime && (
            <p className="rpt-note">
              {t("report.checkedAt", "Toetsing uitgevoerd op")} {checkedTime}.
            </p>
          )}

          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colBeam", "Staaf")}</th>
                <th>{t("report.colSection", "Profiel / doorsnede")}</th>
                <th>{t("report.colGrade", "Klasse")}</th>
                <th>{t("report.colCode", "Norm")}</th>
                <th>{t("report.colGoverning", "Maatgevende toets")}</th>
                <th className="rpt-num">{t("report.colUc", "UC")}</th>
                <th>{t("report.colStatus", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const steel = isSteelCheckResult(r);
                const gov = governingInfo(r);
                const statusCls =
                  r.status === "Ok"
                    ? "rpt-status-ok"
                    : r.status === "NotOk"
                      ? "rpt-status-fail"
                      : "rpt-status-na";
                return (
                  <tr key={`${steel ? "s" : "t"}-${r.beam_id}`}>
                    <td>{r.beam_id}</td>
                    <td>{steel ? r.profile_name : r.section_name}</td>
                    <td>{steel ? r.steel_grade : r.strength_class}</td>
                    <td>{steel ? "EN 1993" : "EN 1995"}</td>
                    <td>
                      <div className="rpt-gov-title">
                        {gov.article ? `${gov.article} — ` : ""}
                        {gov.title}
                      </div>
                      {gov.ucFormulaLatex && (
                        <div
                          className="rpt-gov-formula"
                          dangerouslySetInnerHTML={{
                            __html: renderLatexHtml(gov.ucFormulaLatex, false),
                          }}
                        />
                      )}
                    </td>
                    <td className={`rpt-num${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
                      {r.uc_max.toFixed(2)}
                    </td>
                    <td className={statusCls}>
                      {r.status === "Ok"
                        ? t("report.statusOk", "Voldoet")
                        : r.status === "NotOk"
                          ? t("report.statusNotOk", "Voldoet niet")
                          : t("report.statusNa", "N.v.t.")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {basis && <p className="rpt-note rpt-check-basis">{basis}</p>}

          {skipped.length > 0 && (
            <div className="rpt-skipped">
              <h3 className="rpt-h3">
                {t("report.skippedTitle", "Niet-getoetste staven")} ({skipped.length})
              </h3>
              <ul>
                {skipped.map((s) => (
                  <li key={s.beamId}>
                    <strong>
                      {t("report.colBeam", "Staaf")} {s.beamId}
                    </strong>{" "}
                    — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
