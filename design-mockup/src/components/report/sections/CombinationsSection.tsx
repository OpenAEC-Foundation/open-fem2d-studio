/**
 * CombinationsSection — de factormatrix van de belastingcombinaties:
 * rijen = combinaties (met type UGT/BGT), kolommen = belastinggevallen,
 * cellen = de factor (leeg gelaten waar een geval niet meedoet).
 *
 * Een combinatie die dit model niet nodig heeft (zie lib/combinatieSelectie)
 * verdwijnt hier NIET uit de tabel: hij staat er gemarkeerd bij, met de reden
 * eronder. Het rapport hoort te verantwoorden welke combinaties gehanteerd
 * zijn — en dat kan niet als er zonder uitleg twee ontbreken.
 *
 * Sinds september 2026 zegt de sectie ook WAAR de factoren vandaan komen
 * (standaardcombinatie volgens de NB-tabellen, of een eigen combinatie), en
 * meldt ze elk belastinggeval dat in de doorgerekende combinaties niet
 * meetelt. Voorheen was een geval zonder factor alleen te herkennen aan een
 * kolom met streepjes.
 */
import { useTranslation } from "react-i18next";
import { useReportData } from "../ReportDataContext";
import { fmtFactor } from "../reportFormat";
import { meldingenBelastinggevallen } from "../../../lib/combinatieBeheer";
import { PARTIELE_FACTOREN } from "../../fem/solver/normcombinaties";

export default function CombinationsSection() {
  const { t } = useTranslation("ribbon");
  const { combinations, overgeslagenCombinaties, loadCases, loads, selfWeightEnabled, gevolgklasse } =
    useReportData();
  const overgeslagen = new Map(overgeslagenCombinaties.map((o) => [o.id, o] as const));
  const actief = combinations.filter((c) => !overgeslagen.has(c.id));
  // Dezelfde regel als de projectboom en de MCP-antwoorden: één functie — ook
  // voor een ontbrekende standaardcombinatie en een blijvend geval met
  // factoren die niet bij zijn type passen.
  const meldingen = meldingenBelastinggevallen({
    loadCases, combinations: actief, alleCombinaties: combinations, gevolgklasse, loads, selfWeightEnabled,
  });
  const klassen = [...new Set(combinations.flatMap((c) => (c.standaard ? [c.standaard.gevolgklasse] : [])))];
  const aantalEigen = combinations.filter((c) => !c.standaard).length;

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
                      {c.standaard ? "" : " (eigen)"}
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

          <p className="rpt-note">
            {klassen.length > 0
              ? `Standaardcombinaties: afgeleid uit de belastinggevallen, met γ uit NEN-EN 1990 ` +
                `${klassen.map((k) => PARTIELE_FACTOREN[k].bron).join(" en ")} en ψ uit tabel ` +
                "NB.2–A1.1 (veranderlijke belasting per gebruikscategorie, zonder categorie A). " +
                "Elk veranderlijk belastinggeval staat in combinaties mét en zonder dat geval " +
                "(\"zonder …\"): een veranderlijke belasting telt alleen waar ze ongunstig werkt " +
                "(vrije belasting, NEN-EN 1991-1-1 6.2.1(1)P)."
              : "Geen van de combinaties is een standaardcombinatie."}
            {aantalEigen > 0
              ? ` ${aantalEigen} combinatie(s) gemarkeerd met "(eigen)" zijn door de gebruiker ` +
                "opgesteld of komen uit een ouder projectbestand; hun factoren zijn niet door " +
                "het programma afgeleid."
              : ""}
          </p>

          {meldingen.length > 0 && (
            <div className="rpt-note rpt-melding-fout">
              <ul>
                {meldingen.map((m, i) => (
                  <li key={i}>{m.niveau === "fout" ? "FOUT: " : "Let op: "}{m.tekst}</li>
                ))}
              </ul>
            </div>
          )}

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
