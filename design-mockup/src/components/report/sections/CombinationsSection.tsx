/**
 * CombinationsSection — de factormatrix van de belastingcombinaties:
 * rijen = combinaties (met type UGT/BGT), kolommen = belastinggevallen,
 * cellen = de factor (leeg gelaten waar een geval niet meedoet).
 */
import { useTranslation } from "react-i18next";
import { useReportData } from "../ReportDataContext";
import { fmtFactor } from "../reportFormat";

export default function CombinationsSection() {
  const { t } = useTranslation("ribbon");
  const { combinations, loadCases } = useReportData();

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionCombinations", "Belastingcombinaties")}</h2>

      {combinations.length === 0 || loadCases.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noCombinations", "Geen belastingcombinaties in het model.")}
        </p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>{t("report.colCombination", "Combinatie")}</th>
              <th>{t("report.colComboType", "Type")}</th>
              {loadCases.map((lc) => (
                <th key={lc.id} className="rpt-num">{lc.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {combinations.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  {c.type === "uls"
                    ? t("report.comboUls", "UGT")
                    : t("report.comboSls", "BGT")}
                </td>
                {loadCases.map((lc) => {
                  const f = c.factors.get(lc.id);
                  return (
                    <td key={lc.id} className="rpt-num">
                      {f !== undefined && f !== 0 ? fmtFactor(f) : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
