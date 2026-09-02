/**
 * NodesSection — invoertabel knopen: id, X, Z (mm) en oplegging
 * (type + veerstijfheid waar van toepassing). Leest live uit de
 * ReportDataContext; zonder knopen een eerlijke lege-modelmelding.
 */
import { useTranslation } from "react-i18next";
import { useReportData } from "../ReportDataContext";
import { fmtMm, fmtNum, SUPPORT_LABEL_KEYS, springUnit } from "../reportFormat";

export default function NodesSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, supports } = useReportData();

  const sorted = [...nodes].sort((a, b) => a.id - b.id);

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionNodes", "Knopen")}</h2>

      {sorted.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noNodes", "Geen knopen in het model.")}
        </p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>{t("report.colId", "Id")}</th>
              <th className="rpt-num">X [mm]</th>
              <th className="rpt-num">Z [mm]</th>
              <th>{t("report.colSupport", "Oplegging")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((n) => {
              const sup = supports.find((s) => s.nodeId === n.id);
              let supText = "—";
              if (sup) {
                supText = t(SUPPORT_LABEL_KEYS[sup.type], sup.type);
                const unit = springUnit(sup.type);
                if (unit && sup.k !== undefined) {
                  supText += ` (k = ${fmtNum(sup.k, 1)} ${unit})`;
                }
              }
              return (
                <tr key={n.id}>
                  <td>{n.id}</td>
                  <td className="rpt-num">{fmtMm(n.x)}</td>
                  <td className="rpt-num">{fmtMm(n.z)}</td>
                  <td>{supText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
