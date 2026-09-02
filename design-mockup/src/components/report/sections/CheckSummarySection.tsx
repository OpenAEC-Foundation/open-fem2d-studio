/**
 * CheckSummarySection — tabellarische samenvatting van de normtoetsing.
 *
 * Leest live uit de checkStore (EN 1993 staal + EN 1995 hout gemerged): rij
 * per staaf met profiel/klasse, norm, maatgevende toets + artikel en UC.
 * Zonder resultaten toont de sectie expliciet "nog niet getoetst" — geen
 * verzonnen inhoud. Niet-toetsbare staven staan er met reden onder.
 */
import { useTranslation } from "react-i18next";
import { useCheckStore } from "../../../stores/checkStore";
import { isSteelCheckResult, type MemberCheckResult } from "../../../lib/checkTypes";

function governingInfo(r: MemberCheckResult): { title: string; article: string } {
  const named = r.checks.find((c) => c.id === r.governing_check_id);
  if (!named) return { title: r.governing_check_id, article: "" };
  return { title: named.kind.data.title, article: named.kind.data.article };
}

export default function CheckSummarySection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);

  const checkedTime = lastRunAt
    ? new Date(lastRunAt).toLocaleString("nl-NL", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionCheckSummary", "Toetsingssamenvatting")}</h2>

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
                <th>{t("report.colArticle", "Artikel")}</th>
                <th className="rpt-num">{t("report.colUc", "UC")}</th>
                <th>{t("report.colStatus", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const steel = isSteelCheckResult(r);
                const gov = governingInfo(r);
                const failed = r.status === "NotOk";
                return (
                  <tr key={`${steel ? "s" : "t"}-${r.beam_id}`}>
                    <td>{r.beam_id}</td>
                    <td>{steel ? r.profile_name : r.section_name}</td>
                    <td>{steel ? r.steel_grade : r.strength_class}</td>
                    <td>{steel ? "EN 1993" : "EN 1995"}</td>
                    <td>{gov.title}</td>
                    <td>{gov.article || "—"}</td>
                    <td className={`rpt-num${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
                      {r.uc_max.toFixed(2)}
                    </td>
                    <td className={failed ? "rpt-status-fail" : "rpt-status-ok"}>
                      {r.status === "Ok"
                        ? t("report.statusOk", "Voldoet")
                        : failed
                          ? t("report.statusNotOk", "Voldoet niet")
                          : t("report.statusNa", "N.v.t.")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {skipped.length > 0 && (
            <div className="rpt-skipped">
              <h3 className="rpt-h3">
                {t("report.skippedTitle", "Niet-getoetste staven")} ({skipped.length})
              </h3>
              <ul>
                {skipped.map((s) => (
                  <li key={s.beamId}>
                    <strong>{t("report.colBeam", "Staaf")} {s.beamId}</strong> — {s.reason}
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
