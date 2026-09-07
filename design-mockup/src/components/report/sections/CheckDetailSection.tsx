/**
 * CheckDetailSection — de toetsing per staaf, uitgeschreven.
 *
 * Per staaf een genummerd hoofdstukje met de toetsen, elk als volledige
 * afleiding: de formule symbolisch, dan met ingevulde getallen, dan de
 * uitkomst met eenheid — de is-gelijktekens onder elkaar — en tot slot de
 * unity check met de vergelijking tegen 1,0. Die opmaak volgt het
 * referentie-rapport; de LaTeX ervoor wordt gebouwd in checkReportUtils
 * (afleidingLatex / unityCheckLatex).
 *
 * Detailniveau (reportStore.toetsingDetail):
 *  - 'gedetailleerd' — álle toetsen per staaf, inclusief tussenwaarden en de
 *    volledig uitgeschreven afleiding (de deelstappen);
 *  - 'beknopt'       — alleen de maatgevende toets per staaf, zonder de
 *    tussenwaarden en zonder die afleiding. Dat is nog steeds een volwaardige
 *    verantwoording van de UC die telt, maar zonder de acht toetsen die er niet
 *    toe deden en zonder de tien tot twaalf tussenstappen die het beknopte
 *    niveau meteen weer zouden opblazen.
 *
 * Staafkeuze (reportStore.verborgenToetsStaven): welke staven hier úberhaupt
 * uitgeschreven worden, kiest de lezer per staaf in de rapportzijbalk. Een
 * staaf die uit staat verdwijnt alleen HIER; in het toetsingsoverzicht blijft
 * hij met zijn maatgevende toets staan, want dat is de conclusie van het
 * rapport. Onder de sectiekop staat dan hoeveel staven zijn weggelaten — een
 * weglating hoort zichtbaar te zijn, niet stil.
 *
 * Materiaal-neutraal: staal (EN 1993), hout (EN 1995) en beton (EN 1992) delen
 * het NamedCheck-contract; alleen de regel onder de staafkop verschilt
 * (doorsnedeklasse vs. korf en rekensterkten vs. klimaatklasse +
 * belastingduur). Dat geldt ook voor de afleiding: de deelstappen van de
 * kiptoetsing en die van de betonnen doorsnedetoetsing worden door hetzelfde
 * blok hieronder gezet.
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { isToetsStaafZichtbaar, useReportStore } from "../../../stores/reportStore";
import {
  gradeLabel,
  isConcreteCheckResult,
  isSteelCheckResult,
  isStressCheckResult,
  sectionLabel,
  type MemberCheckResult,
} from "../../../lib/checkTypes";
// Eén renderer voor élke uitgeschreven keten in het rapport — kip, beton en de
// meewerkende flensbreedte van 5.3.2.1. Zie `../Deelstappen`.
import Deelstappen, { Waarden } from "../Deelstappen";
import {
  CHECK_REPORT_CSS,
  LOAD_DURATION_LABELS,
  afleidingLatex,
  basisText,
  crossSectionClassLabel,
  deelstappenVan,
  fmtCheckedAt,
  fmtUc,
  fmtValue,
  isStabilityCalc,
  ketenHerkomst,
  renderLatexHtml,
  serviceClassLabel,
  splitsArtikel,
  statusClass,
  statusLabel,
  unityCheckLatex,
  type CheckCalc,
} from "../checkReportUtils";

/** Eén toets, volledig afgeleid — de opmaak van het referentie-rapport. */
function DerivationBlock({
  check,
  governing,
  metTussenwaarden,
}: {
  check: CheckCalc;
  governing: boolean;
  metTussenwaarden: boolean;
}) {
  const { t } = useTranslation("ribbon");
  const cls = statusClass(check.status);
  // De keten hoort bij het gedetailleerde niveau: op beknopt niveau staat per
  // staaf alleen de maatgevende toets, en veertien tussenstappen zouden dat
  // niveau meteen weer opblazen.
  const stappen = metTussenwaarden ? deelstappenVan(check) : [];
  // Staat de keten er, dan zijn de tussenwaarden precies dezelfde getallen —
  // maar dan zónder formule en zonder vindplaats. Ze dan nóg eens als losse
  // rij herhalen maakt het rapport alleen langer.
  const tussenwaarden =
    metTussenwaarden && stappen.length === 0 && isStabilityCalc(check)
      ? check.intermediate_values
      : [];
  const { artikel, vergelijking } = splitsArtikel(check.article);
  const { latex, ongebruikt } = afleidingLatex(check);
  const f = check.force_state.forces;

  return (
    <div className="rpt-chk-block">
      <div className="rpt-chk-head">
        <h4 className="rpt-chk-title">
          {check.title}
          {governing && (
            <span className="rpt-chk-gov-tag">
              — {t("report.governingTag", "maatgevend")}
            </span>
          )}
        </h4>
        <span className="rpt-chk-article">{artikel}</span>
      </div>

      {/* Krachtstoestand op de getoetste plek — combinatie, x en de
          snedekrachten. Getallen in nl-notatie, net als de rest van het
          rapport (decimaalkomma, geen punt). */}
      <div className="rpt-chk-forces">
        {t("report.combination", "Combinatie")} {check.force_state.combination_id}
        {"   x = "}
        {fmtValue(check.force_state.position_mm, 0)} mm
        {"   N = "}
        {fmtValue(f.n_ed, 2)} kN
        {"   V"}
        <sub>z</sub>
        {" = "}
        {fmtValue(f.vz_ed, 2)} kN
        {"   M"}
        <sub>y</sub>
        {" = "}
        {fmtValue(f.my_ed, 2)} kNm
      </div>

      {/* De aanloop: de keten die de rekenkern doorliep om aan deze toets toe
          te komen. Staat vóór de toets zelf, want dat is de volgorde waarin
          de norm hem afwerkt. */}
      <Deelstappen
        stappen={stappen}
        kop={
          ketenHerkomst(check) === "nb"
            ? t(
                "report.ketenKop",
                "Afleiding volgens de nationale bijlage, stap voor stap:",
              )
            : t("report.ketenKopAlgemeen", "Afleiding, stap voor stap:")
        }
      />

      {/* Symbolisch → ingevuld → uitkomst, met het vergelijkingsnummer rechts. */}
      <div className="rpt-chk-afleiding">
        <div
          className="rpt-chk-afleiding-formule"
          dangerouslySetInnerHTML={{ __html: renderLatexHtml(latex, true) }}
        />
        {vergelijking && <span className="rpt-chk-eq">({vergelijking})</span>}
      </div>

      {/* Wat niet in de formule ingevuld kon worden, staat hier alsnog. */}
      <Waarden vars={ongebruikt} />

      {tussenwaarden.length > 0 && (
        <Waarden
          kop={`${t("report.intermediateValues", "Tussenwaarden")}:`}
          vars={tussenwaarden}
        />
      )}

      {check.uc && (
        <div className="rpt-chk-ucline">
          <div
            className="rpt-chk-ucline-formule"
            dangerouslySetInnerHTML={{
              __html: renderLatexHtml(unityCheckLatex(check.uc), true),
            }}
          />
          <span className={`rpt-chk-status ${cls}`}>{statusLabel(t, check.status)}</span>
        </div>
      )}

      {check.notes.length > 0 && (
        <ul className="rpt-chk-notes">
          {check.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Alle toetsen van één staaf, als genummerde subsectie. */
function MemberBlock({
  result,
  gedetailleerd,
}: {
  result: MemberCheckResult;
  gedetailleerd: boolean;
}) {
  const { t } = useTranslation("ribbon");
  const { t: tCheck } = useTranslation("check");
  const steel = isSteelCheckResult(result);

  // De regel onder de staafkop: per materiaal wat de toetsing bepaalt —
  // doorsnedeklasse (staal), korf en rekensterkten (beton), klimaatklasse en
  // belastingduur (hout en kruislaaghout), en bij de vrije spanningstoets de
  // toelaatbare spanning met de materiaalfactor (daar is geen norm).
  const meta = steel
    ? `EN 1993 · ${t("report.crossSectionClass", "doorsnedeklasse")} ${crossSectionClassLabel(result.classification)}`
    : isConcreteCheckResult(result)
      ? `EN 1992 · ${result.reinforcement_summary} · f_cd = ${result.f_cd_mpa.toFixed(1)} N/mm² · f_yd = ${result.f_yd_mpa.toFixed(0)} N/mm²`
      : isStressCheckResult(result)
        ? `${t("report.spanningGeenNorm", "vrije spanningstoets (geen norm)")} · f_toel = ${fmtValue(result.f_toel_mpa, 2)} N/mm² · γ_M = ${fmtValue(result.gamma_m, 2)} · f_d = ${fmtValue(result.f_d_mpa, 2)} N/mm²`
        : `EN 1995 · ${t("report.serviceClass", "klimaatklasse")} ${serviceClassLabel(result.service_class)} · ${t("report.loadDuration", "belastingduur")} ${tCheck(
            LOAD_DURATION_LABELS[result.load_duration].key,
            LOAD_DURATION_LABELS[result.load_duration].fallback,
          ).toLowerCase()}`;

  // Beknopt: alleen de maatgevende toets — de UC die telt, met dezelfde
  // volledige afleiding, maar zonder de toetsen die niet maatgevend waren.
  const toetsen = gedetailleerd
    ? result.checks
    : result.checks.filter((c) => c.id === result.governing_check_id);

  return (
    <div className="rpt-chk-member">
      {/* Echte .rpt-h3: doet mee met de sectienummering én komt zo in de
          inhoudsopgave te staan, net als in het referentie-rapport. */}
      <h3 className="rpt-h3">
        {t("report.colBeam", "Staaf")} {result.beam_id} —{" "}
        {sectionLabel(result)} ({gradeLabel(result)})
      </h3>

      <div className="rpt-chk-member-meta">
        <span>{meta}</span>
        <span className={`rpt-chk-member-uc${result.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
          {t("report.colUc", "UC")} = {fmtUc(result.uc_max)}
        </span>
        <span className={`rpt-chk-status ${statusClass(result.status)}`}>
          {statusLabel(t, result.status)}
        </span>
      </div>

      {toetsen.map((named) => (
        <DerivationBlock
          key={named.id}
          check={named.kind.data}
          governing={named.id === result.governing_check_id}
          metTussenwaarden={gedetailleerd}
        />
      ))}
    </div>
  );
}

export default function CheckDetailSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const gedetailleerd = useReportStore((s) => s.toetsingDetail === "gedetailleerd");
  const verborgenToetsStaven = useReportStore((s) => s.verborgenToetsStaven);

  const checkedTime = fmtCheckedAt(lastRunAt);
  const basis = basisText(t, results);

  // Alleen de aangevinkte staven worden hier uitgeschreven; de rest telt
  // gewoon mee in het toetsingsoverzicht (zie de sectiedocumentatie).
  const getoond = results.filter((r) => isToetsStaafZichtbaar(verborgenToetsStaven, r.beam_id));
  const weggelaten = results.length - getoond.length;

  return (
    <div className="rpt-block rpt-chk-detail">
      <style>{CHECK_REPORT_CSS}</style>
      <h2 className="rpt-h2">{t("report.sectionCheckDetail", "Toetsing per staaf")}</h2>

      {results.length === 0 ? (
        <p className="rpt-empty-note">
          {t(
            "report.notChecked",
            "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.",
          )}
        </p>
      ) : (
        <>
          <p className="rpt-note">
            {checkedTime && `${t("report.checkedAt", "Toetsing uitgevoerd op")} ${checkedTime}. `}
            {!gedetailleerd &&
              `${t(
                "report.detailBeknoptNoot",
                "Beknopt niveau: per staaf is alleen de maatgevende toets uitgeschreven.",
              )} `}
            {weggelaten > 0 &&
              `${t("report.staafKeuzeNoot", {
                defaultValue:
                  "Van {{aantal}} van de {{totaal}} getoetste staven is de uitgebreide uitvoer op verzoek weggelaten; die staven staan wel in het toetsingsoverzicht.",
                aantal: weggelaten,
                totaal: results.length,
              })} `}
            {basis ?? ""}
          </p>

          {getoond.length === 0 && (
            <p className="rpt-empty-note">
              {t(
                "report.staafKeuzeLeeg",
                "Van geen enkele staaf is de uitgebreide uitvoer gekozen — vink in de rapportzijbalk minstens één staaf aan.",
              )}
            </p>
          )}

          {getoond.map((r) => (
            <MemberBlock
              key={`${isSteelCheckResult(r) ? "s" : "t"}-${r.beam_id}`}
              result={r}
              gedetailleerd={gedetailleerd}
            />
          ))}

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
