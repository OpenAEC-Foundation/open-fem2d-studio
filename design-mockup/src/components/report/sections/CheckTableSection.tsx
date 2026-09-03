/**
 * CheckTableSection — het toetsingsoverzicht.
 *
 * Eén regel per getoetste staaf: profiel/klasse, norm, de maatgevende toets
 * (artikel + titel, met de UC-formule als KaTeX) en de hoogste unity check met
 * status. Bij tien staven dus tien regels.
 *
 * Bewust alléén de maatgevende toets. Er is hier ook een variant geweest die
 * álle toetsen per staaf opsomde — zoals het referentie-rapport dat doet —
 * maar dan wordt dit hoofdstuk een tweede, langere versie van "Toetsing per
 * staaf" zonder dat er iets bijkomt: de regel die ertoe doet, de maatgevende,
 * raakt zoek tussen de rest. Wie alle toetsen wil zien, vindt ze verderop mét
 * hun afleiding.
 *
 * Het detailniveau uit de rapportinstellingen stuurt daarom alleen de
 * afleidingen, niet deze tabel.
 *
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
import { isSteelCheckResult, type MemberCheckResult } from "../../../lib/checkTypes";
import {
  CHECK_REPORT_CSS,
  alsBreuk,
  basisText,
  fmtCheckedAt,
  fmtUc,
  governingInfo,
  renderLatexHtml,
  splitsArtikel,
  statusLabel,
} from "../checkReportUtils";
import type { CheckStatus } from "../../../lib/types/steel/CheckStatus";

/** Kleurklasse van een statuscel (tabelvariant van statusClass). */
function statusCel(status: CheckStatus): string {
  if (status === "Ok") return "rpt-status-ok";
  if (status === "NotOk") return "rpt-status-fail";
  return "rpt-status-na";
}

/** Beknopt: één regel per staaf met de maatgevende toets. */
function BeknopteRijen({ results }: { results: MemberCheckResult[] }) {
  const { t } = useTranslation("ribbon");
  return (
    <>
      {results.map((r) => {
        const steel = isSteelCheckResult(r);
        const gov = governingInfo(r);
        return (
          <tr key={`${steel ? "s" : "t"}-${r.beam_id}`}>
            <td>{r.beam_id}</td>
            <td>{steel ? r.profile_name : r.section_name}</td>
            <td>{steel ? r.steel_grade : r.strength_class}</td>
            <td>{steel ? "EN 1993" : "EN 1995"}</td>
            <td>
              <div className="rpt-gov-title">
                {/* Alleen het artikel; het vergelijkingsnummer hoort bij de
                    afleiding, niet in een overzichtsregel. */}
                {gov.article ? `${splitsArtikel(gov.article).artikel} — ` : ""}
                {gov.title}
              </div>
              {gov.ucFormulaLatex && (
                <div
                  className="rpt-gov-formula"
                  dangerouslySetInnerHTML={{
                    __html: renderLatexHtml(alsBreuk(gov.ucFormulaLatex), false),
                  }}
                />
              )}
            </td>
            <td className={`rpt-num${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
              {fmtUc(r.uc_max)}
            </td>
            <td className={statusCel(r.status)}>{statusLabel(t, r.status)}</td>
          </tr>
        );
      })}
    </>
  );
}


export default function CheckTableSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  // Het overzicht toont ALTIJD één regel per staaf: de maatgevende toets.
  // Dat is wat een overzicht hoort te zijn — wie alle toetsen wil zien, vindt
  // ze verderop bij "Toetsing per staaf", waar ze bovendien met hun afleiding
  // staan. Alle toetsen óók hier herhalen maakte de tabel lang zonder dat er
  // iets bij kwam, en de maatgevende regel ging erin verloren.
  //
  // Het detailniveau stuurt dus alleen nog de afleidingen, niet deze tabel.

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
              <BeknopteRijen results={results} />
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
