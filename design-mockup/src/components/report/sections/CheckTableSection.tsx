/**
 * CheckTableSection — het toetsingsoverzicht.
 *
 * Twee detailniveaus (reportStore.toetsingDetail):
 *
 *  - 'beknopt'       — één regel per getoetste staaf: profiel/klasse, norm,
 *    de maatgevende toets (artikel + titel, met de UC-formule als KaTeX) en
 *    de hoogste unity check met status. Bij tien staven dus tien regels.
 *  - 'gedetailleerd' — álle toetsen per staaf onder elkaar, gegroepeerd per
 *    staaf, met per regel de maatgevende combinatie, het artikel en de UC.
 *    Die tabelvorm volgt het referentie-rapport, dat het toetsingsoverzicht
 *    ook per toets opsomt in plaats van per staaf.
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
import { useReportStore } from "../../../stores/reportStore";
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

/**
 * Gedetailleerd: alle toetsen per staaf. Het staafnummer staat op élke regel
 * (zo blijft de groep herkenbaar als de tabel over een velgrens breekt);
 * profiel en klasse alleen op de eerste regel van de groep, met een
 * zwaardere lijn erboven.
 */
function GedetailleerdeRijen({ results }: { results: MemberCheckResult[] }) {
  const { t } = useTranslation("ribbon");
  return (
    <>
      {results.flatMap((r) => {
        const steel = isSteelCheckResult(r);
        return r.checks.map((named, i) => {
          const c = named.kind.data;
          const { artikel } = splitsArtikel(c.article);
          const uc = c.uc?.uc ?? 0;
          const maatgevend = named.id === r.governing_check_id;
          return (
            <tr
              key={`${steel ? "s" : "t"}-${r.beam_id}-${named.id}`}
              className={`${i === 0 ? "rpt-chk-groep-start" : ""}${
                maatgevend ? " rpt-chk-rij-gov" : ""
              }`}
            >
              <td>{r.beam_id}</td>
              <td>{i === 0 ? (steel ? r.profile_name : r.section_name) : ""}</td>
              <td>{i === 0 ? (steel ? r.steel_grade : r.strength_class) : ""}</td>
              <td>{c.force_state.combination_id}</td>
              <td>{artikel}</td>
              <td>
                {c.title}
                {maatgevend && (
                  <span className="rpt-chk-gov-tag">
                    — {t("report.governingTag", "maatgevend")}
                  </span>
                )}
              </td>
              <td className={`rpt-num${uc > 1 ? " rpt-uc-fail" : ""}`}>{fmtUc(uc)}</td>
              <td className={statusCel(c.status)}>{statusLabel(t, c.status)}</td>
            </tr>
          );
        });
      })}
    </>
  );
}

export default function CheckTableSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const gedetailleerd = useReportStore((s) => s.toetsingDetail === "gedetailleerd");

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
              {gedetailleerd ? (
                <tr>
                  <th>{t("report.colBeam", "Staaf")}</th>
                  <th>{t("report.colSection", "Profiel / doorsnede")}</th>
                  <th>{t("report.colGrade", "Klasse")}</th>
                  <th>{t("report.colCombination", "Combinatie")}</th>
                  <th>{t("report.colArticle", "Artikel")}</th>
                  <th>{t("report.colCheck", "Toets")}</th>
                  <th className="rpt-num">{t("report.colUc", "UC")}</th>
                  <th>{t("report.colStatus", "Status")}</th>
                </tr>
              ) : (
                <tr>
                  <th>{t("report.colBeam", "Staaf")}</th>
                  <th>{t("report.colSection", "Profiel / doorsnede")}</th>
                  <th>{t("report.colGrade", "Klasse")}</th>
                  <th>{t("report.colCode", "Norm")}</th>
                  <th>{t("report.colGoverning", "Maatgevende toets")}</th>
                  <th className="rpt-num">{t("report.colUc", "UC")}</th>
                  <th>{t("report.colStatus", "Status")}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {gedetailleerd ? (
                <GedetailleerdeRijen results={results} />
              ) : (
                <BeknopteRijen results={results} />
              )}
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
