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
import { anyCheckableBeams, useCheckStore } from "../../../stores/checkStore";
import {
  gradeLabel,
  normLabel,
  sectionLabel,
  type CheckSkip,
  type MemberCheckResult,
} from "../../../lib/checkTypes";
import { nietUitgevoerdOverzicht, nietUitgevoerdToetsen } from "../../../lib/nietUitgevoerd";
import { useReportData } from "../ReportDataContext";
import { useRapportProjectInfo } from "../useProjectInfo";
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
        const gov = governingInfo(r);
        return (
          // Eén resultaat per staaf, dus het staafnummer volstaat als sleutel.
          <tr key={r.beam_id}>
            <td>{r.beam_id}</td>
            <td>{sectionLabel(r)}</td>
            <td>{gradeLabel(r)}</td>
            <td>{normLabel(r)}</td>
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


/** De staven die niet getoetst konden worden, met hun reden. */
function OvergeslagenStaven({ skipped }: { skipped: CheckSkip[] }) {
  const { t } = useTranslation("ribbon");
  if (skipped.length === 0) return null;
  return (
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
  );
}

/**
 * De toetsen die de kern niet kon afrekenen, per staaf (issue #18). De status
 * in de tabel zegt alleen DAT er iets ontbrak ("N.v.t."); dit zegt WAT. Blijft
 * weg als er niets overgeslagen is, net als het overzicht in de PDF.
 */
function NietUitgevoerdeToetsen({ results }: { results: MemberCheckResult[] }) {
  const { t } = useTranslation("ribbon");
  const regels = nietUitgevoerdOverzicht(results);
  if (regels.length === 0) return null;
  const detailleringseis = t("report.detailleringseis", "detailleringseis");
  return (
    <div className="rpt-skipped rpt-niet-uitgevoerd">
      <h3 className="rpt-h3">{t("report.nietUitgevoerdTitel", "Niet uitgevoerd")}</h3>
      <p className="rpt-note">
        {t(
          "report.nietUitgevoerdToelichting",
          "Deze toetsen konden niet worden afgerekend; de reden staat bij de toetsing van de staaf. Ontbreekt een toets die de draagkracht bepaalt, dan is de status van de staaf N.v.t. en niet Voldoet. Een detailleringseis bepaalt de status niet.",
        )}
      </p>
      <ul>
        {regels.map((r) => (
          <li key={r.beamId}>
            <strong>
              {t("report.colBeam", "Staaf")} {r.beamId}
            </strong>{" "}
            ({r.sectie}, {r.klasse}): {nietUitgevoerdToetsen(r, detailleringseis)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CheckTableSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const { beams } = useReportData();
  // WAAROM DRIE LEEG-MELDINGEN. "Nog niet getoetst — voer de toetsing uit" stond
  // hier ook bij een model zonder één toetsbare staaf (de toetsing keert dan
  // terug zonder te draaien, `lastRunAt` blijft leeg) en bij een ronde waarin
  // élke staaf is overgeslagen. Op papier las dat als een vergeten handeling,
  // terwijl er niets te toetsen viel of alles met reden is overgeslagen. Het
  // rapport — ook de PDF via het bedieningskanaal — hoort zelf te zeggen welk
  // van de drie het is, en in het laatste geval ook waarom per staaf.
  const geenToetsbareStaven = beams.length > 0 && !anyCheckableBeams([...beams]);
  const leegMelding =
    lastRunAt !== null
      ? t(
          "report.nietsGetoetstNaRun",
          "Er is getoetst, maar geen enkele staaf kon worden getoetst — zie de niet-getoetste staven hieronder.",
        )
      : geenToetsbareStaven
        ? t(
            "report.geenToetsbareStaven",
            "Niets getoetst: dit model bevat geen toetsbare staven (geen staalprofiel, houtklasse, kruislaaghout, betonklasse of vrij materiaal).",
          )
        : t(
            "report.notChecked",
            "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.",
          );
  // Het overzicht toont ALTIJD één regel per staaf: de maatgevende toets.
  // Dat is wat een overzicht hoort te zijn — wie alle toetsen wil zien, vindt
  // ze verderop bij "Toetsing per staaf", waar ze bovendien met hun afleiding
  // staan. Alle toetsen óók hier herhalen maakte de tabel lang zonder dat er
  // iets bij kwam, en de maatgevende regel ging erin verloren.
  //
  // Het detailniveau stuurt dus alleen nog de afleidingen, niet deze tabel.

  const checkedTime = fmtCheckedAt(lastRunAt);
  // De toetsbasis noemt de uitgaven van de bijlage van HET PROJECT (normnaad).
  const basis = basisText(t, results, useRapportProjectInfo().uitgangspunten?.nationaleBijlage);

  return (
    <div className="rpt-block">
      <style>{CHECK_REPORT_CSS}</style>
      <h2 className="rpt-h2">{t("report.sectionCheckTable", "Toetsingsoverzicht")}</h2>

      {results.length === 0 ? (
        <>
          <p className="rpt-empty-note">{leegMelding}</p>
          <OvergeslagenStaven skipped={skipped} />
        </>
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

          <NietUitgevoerdeToetsen results={results} />

          <OvergeslagenStaven skipped={skipped} />
        </>
      )}
    </div>
  );
}
