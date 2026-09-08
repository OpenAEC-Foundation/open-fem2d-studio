/**
 * CombinationsSection — de factormatrix van de belastingcombinaties:
 * rijen = combinaties (met type UGT/BGT), kolommen = belastinggevallen,
 * cellen = de factor (leeg gelaten waar een geval niet meedoet).
 *
 * Een combinatie die dit model niet nodig heeft (zie lib/combinatieSelectie)
 * verdwijnt hier NIET uit de tabel: hij staat er gemarkeerd bij, met de reden
 * eronder. Het rapport hoort te verantwoorden welke combinaties gehanteerd
 * zijn — en dat kan niet als er zonder uitleg twee ontbreken.
 */
import { useTranslation } from "react-i18next";
import { useReportData } from "../ReportDataContext";
import { fmtFactor } from "../reportFormat";

export default function CombinationsSection() {
  const { t } = useTranslation("ribbon");
  const { combinations, overgeslagenCombinaties, loadCases } = useReportData();
  const overgeslagen = new Map(overgeslagenCombinaties.map((o) => [o.id, o] as const));

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionCombinations", "Belastingcombinaties")}</h2>

      {combinations.length === 0 || loadCases.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noCombinations", "Geen belastingcombinaties in het model.")}
        </p>
      ) : (
        <>
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
              {combinations.map((c) => {
                const weg = overgeslagen.get(c.id);
                return (
                  <tr key={c.id} className={weg ? "rpt-rij-gedempt" : undefined}>
                    <td>
                      {c.name}
                      {weg ? ` — ${weg.label}` : ""}
                    </td>
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
                );
              })}
            </tbody>
          </table>

          {overgeslagenCombinaties.length > 0 && (
            <div className="rpt-note">
              {t(
                "report.comboSkippedHeading",
                "Niet in de berekening meegenomen:",
              )}
              <ul>
                {overgeslagenCombinaties.map((o) => (
                  <li key={o.id}>{o.reden}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
