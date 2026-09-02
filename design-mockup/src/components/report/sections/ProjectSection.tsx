/**
 * ProjectSection — rapportkop met projectgegevens.
 *
 * Leest live uit de projectinfo-instelling (Instellingen → Projectgegevens);
 * wijzig je die, dan rendert de kop direct mee (useProjectInfo abonneert op
 * het plugin-store event).
 *
 * Koptekst-regel (R2): vrije tekst bovenaan het rapport (bedrijfsregel/
 * briefhoofd), direct in het rapport te bewerken. Het invoerveld is
 * scherm-chrome: bij print rendert alleen de tekst (of niets als hij leeg
 * is). Opslag: extra veld `reportHeader` in de projectinfo-setting.
 * Logo-upload is bewust R5+ — nu alleen tekst.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setSetting } from "../../../store";
import { useProjectInfo } from "../useProjectInfo";
import {
  DEFAULT_UITGANGSPUNTEN,
  K_FI,
  LEVENSDUUR_OMSCHRIJVING,
} from "../../project/ProjectSettingsDialog";

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

  // Koptekst-regel: lokale draft tijdens het typen; commit (blur/Enter) →
  // projectinfo-setting. In de browser (zonder Tauri) faalt setSetting stil
  // en blijft de regel alleen voor deze sessie staan — in de desktop-app
  // persisteert hij en volgt useProjectInfo het store-event.
  const [headerDraft, setHeaderDraft] = useState<string | null>(null);
  const [sessionHeader, setSessionHeader] = useState<string | null>(null);
  useEffect(() => {
    // Zodra de setting daadwerkelijk verandert, wint de opgeslagen waarde.
    setSessionHeader(null);
  }, [info.reportHeader]);
  const headerValue = headerDraft ?? sessionHeader ?? info.reportHeader ?? "";

  const commitHeader = () => {
    if (headerDraft === null) return;
    const value = headerDraft.trim();
    setHeaderDraft(null);
    setSessionHeader(value);
    void setSetting("projectInfo", { ...info, reportHeader: value });
  };

  const rows: Array<{ label: string; value: string }> = [
    { label: t("report.fieldProjectNumber", "Projectnummer"), value: info.projectNumber || "—" },
    { label: t("report.fieldEngineer", "Constructeur"), value: info.engineer || "—" },
    { label: t("report.fieldCompany", "Bedrijf"), value: info.company || "—" },
    { label: t("report.fieldDate", "Datum"), value: formatDate(info.date) },
  ];

  return (
    <header className="rpt-project rpt-block">
      {/* Koptekst-regel: op scherm een subtiel invoerveld, in de print
          alleen de tekst (leeg → niets). */}
      <input
        className="rpt-header-input rpt-screen-only"
        type="text"
        value={headerValue}
        placeholder={t("report.headerPlaceholder", "Koptekst-regel (klik om te bewerken)")}
        onChange={(e) => setHeaderDraft(e.target.value)}
        onBlur={commitHeader}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setHeaderDraft(null);
        }}
        aria-label={t("report.headerLine", "Koptekst")}
      />
      {headerValue.trim() !== "" && (
        <div className="rpt-header-line rpt-print-only">{headerValue}</div>
      )}
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

      {/* Uitgangspunten: toegepaste normen, gevolgklasse en ontwerplevensduur.
          Horen vooraan in elk rekenrapport, vóór de invoergegevens. */}
      {(() => {
        const u = info.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN;
        const normen = [
          u.en1993 && "Eurocode 3 — Staal (EN 1993-1-1)",
          u.en1995 && "Eurocode 5 — Hout (EN 1995-1-1)",
          u.en1992 && "Eurocode 2 — Beton (EN 1992-1-1)",
        ].filter(Boolean) as string[];
        const kfi = K_FI[u.gevolgklasse].toFixed(2).replace(".", ",");
        const levensduur = LEVENSDUUR_OMSCHRIJVING[u.levensduurklasse]
          .replace(/^Klasse \d+ — /, "");
        const rijen: Array<[string, string]> = [
          [t("report.fieldNormen", "Toegepaste normen"), normen.length > 0 ? normen.join("; ") : "—"],
          [t("report.fieldNationaleBijlage", "Nationale bijlage"), "Nederland"],
          [t("report.fieldGevolgklasse", "Gevolgklasse"), `${u.gevolgklasse} (K_FI = ${kfi})`],
          [t("report.fieldLevensduur", "Ontwerplevensduur"), levensduur],
        ];
        return (
          <>
            <div className="rpt-uitgangspunten-kop">
              {t("report.uitgangspunten", "Uitgangspunten")}
            </div>
            <table className="rpt-meta-table">
              <tbody>
                {rijen.map(([label, waarde]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{waarde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      })()}
    </header>
  );
}
