/**
 * ProjectSection — rapportkop met projectgegevens.
 *
 * Leest live uit de projectinfo-instelling (Instellingen → Projectgegevens);
 * wijzig je die, dan rendert de kop direct mee (useProjectInfo abonneert op
 * het plugin-store event).
 */
import { useTranslation } from "react-i18next";
import { useProjectInfo } from "../useProjectInfo";

/** yyyy-mm-dd → nl-notatie; alles wat niet parsebaar is blijft zoals het is. */
function formatDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function ProjectSection() {
  const { t } = useTranslation("ribbon");
  const info = useProjectInfo();

  const rows: Array<{ label: string; value: string }> = [
    { label: t("report.fieldProjectNumber", "Projectnummer"), value: info.projectNumber || "—" },
    { label: t("report.fieldEngineer", "Constructeur"), value: info.engineer || "—" },
    { label: t("report.fieldCompany", "Bedrijf"), value: info.company || "—" },
    { label: t("report.fieldDate", "Datum"), value: formatDate(info.date) },
  ];

  return (
    <header className="rpt-project rpt-block">
      <div className="rpt-doc-kind">{t("report.docKind", "Rekenrapport")}</div>
      <h1 className="rpt-project-title">
        {info.name || t("report.unnamedProject", "Naamloos project")}
      </h1>
      {info.location && <div className="rpt-project-location">{info.location}</div>}
      <table className="rpt-meta-table">
        <tbody>
          {rows.map(({ label, value }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {info.description && <p className="rpt-project-description">{info.description}</p>}
    </header>
  );
}
