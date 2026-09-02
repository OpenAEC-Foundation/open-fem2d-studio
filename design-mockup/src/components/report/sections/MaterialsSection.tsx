/**
 * MaterialsSection — unieke materialen in het model met kernwaarden.
 *
 *  - Staal: E = 210 000 N/mm² en fy uit de naam (S235 → 235), conform
 *    EN 1993-1-1 tab. 3.1 — tabellen geïmporteerd uit profileData/
 *    sectionResolver, niet gedupliceerd.
 *  - Hout: sterkteklasse + E₀,mean met verwijzing naar EN 338 (C-klassen)
 *    resp. EN 14080 (GL-klassen); sterktewaarden komen uit de Rust-kern van
 *    de normtoetsing — hier géén verzonnen getallen.
 * Onbekende materialen staan er eerlijk bij met "—".
 */
import { useTranslation } from "react-i18next";
import { TIMBER_E_MEAN, E_STAAL } from "../../../lib/sectionResolver";
import { STEEL_FY } from "../../fem/profileData";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";

interface MaterialRow {
  name: string;
  kind: "steel" | "timber" | "unknown";
  e: number | null;
  fy: number | null;
  reference: string;
}

function materialRow(name: string): MaterialRow {
  const fy = STEEL_FY[name.toUpperCase()];
  if (fy !== undefined) {
    return { name, kind: "steel", e: E_STAAL, fy, reference: "EN 1993-1-1 tab. 3.1" };
  }
  const eTimber = TIMBER_E_MEAN[name];
  if (eTimber !== undefined) {
    const isGl = name.toUpperCase().startsWith("GL");
    return {
      name,
      kind: "timber",
      e: eTimber,
      fy: null,
      reference: isGl ? "EN 14080" : "EN 338",
    };
  }
  return { name, kind: "unknown", e: null, fy: null, reference: "—" };
}

export default function MaterialsSection() {
  const { t } = useTranslation("ribbon");
  const { beams } = useReportData();

  const names = [...new Set(beams.map((b) => b.material ?? "S235"))];
  const rows = names.map(materialRow);
  const hasTimber = rows.some((r) => r.kind === "timber");

  const kindLabel = (kind: MaterialRow["kind"]): string => {
    if (kind === "steel") return t("report.matSteel", "Staal");
    if (kind === "timber") return t("report.matTimber", "Hout");
    return "—";
  };

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionMaterials", "Materialen")}</h2>

      {rows.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noBeams", "Geen staven in het model.")}
        </p>
      ) : (
        <>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colMaterial", "Materiaal")}</th>
                <th>{t("report.colType", "Type")}</th>
                <th className="rpt-num">E [N/mm²]</th>
                <th className="rpt-num">fy [N/mm²]</th>
                <th>{t("report.colReference", "Norm")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{kindLabel(r.kind)}</td>
                  <td className="rpt-num">{r.e !== null ? fmtNum(r.e, 0) : "—"}</td>
                  <td className="rpt-num">{r.fy !== null ? fmtNum(r.fy, 0) : "—"}</td>
                  <td>{r.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasTimber && (
            <p className="rpt-note" style={{ marginTop: "2mm" }}>
              {t(
                "report.timberNote",
                "Hout: E = E₀,mean (stijfheid in de berekening); sterktewaarden per klasse volgen uit EN 338 / EN 14080 en worden door de normtoetsing (EN 1995) toegepast.",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
