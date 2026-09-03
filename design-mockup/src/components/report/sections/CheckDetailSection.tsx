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
 *  - 'gedetailleerd' — álle toetsen per staaf, inclusief tussenwaarden;
 *  - 'beknopt'       — alleen de maatgevende toets per staaf, zonder de
 *    tussenwaarden. Dat is nog steeds een volwaardige verantwoording van de
 *    UC die telt, maar zonder de acht toetsen die er niet toe deden.
 *
 * Materiaal-neutraal: staal (EN 1993) en hout (EN 1995) delen het
 * NamedCheck-contract; alleen de regel onder de staafkop verschilt
 * (doorsnedeklasse vs. klimaatklasse + belastingduur).
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { useReportStore } from "../../../stores/reportStore";
import { isSteelCheckResult, type MemberCheckResult } from "../../../lib/checkTypes";
import type { NamedValue } from "../../../lib/types/steel/NamedValue";
import {
  CHECK_REPORT_CSS,
  LOAD_DURATION_LABELS,
  afleidingLatex,
  basisText,
  crossSectionClassLabel,
  fmtCheckedAt,
  fmtUc,
  fmtValue,
  isStabilityCalc,
  renderLatexHtml,
  serviceClassLabel,
  splitsArtikel,
  statusClass,
  statusLabel,
  unityCheckLatex,
  type CheckCalc,
} from "../checkReportUtils";

/**
 * Waarden die naast de afleiding horen, als één doorlopende regel.
 *
 * Dit stond eerder als een driekolomsraster (symbool, "=", waarde) onder de
 * formule. Dat leverde per toets een blokje tabel op en dat is precies wat het
 * referentie-rapport níét doet: daar loopt een toets als wiskunde door, met de
 * getallen ingevuld in de formule zelf en de losse grootheden achter elkaar op
 * één regel. Een reeks ingesprongen kolommetjes onder elke formule maakt van
 * een afleiding een opsomming.
 *
 * De waarden verdwijnen niet — een grootheid die niet in de formule ingevuld
 * kon worden, hoort zichtbaar te blijven — maar ze staan nu achter elkaar
 * gescheiden door een dunne spatie, zoals de krachtenregel erboven.
 */
function Waarden({ kop, vars }: { kop?: string; vars: NamedValue[] }) {
  if (vars.length === 0) return null;
  return (
    <div className="rpt-chk-waarden">
      {kop && <span className="rpt-chk-waarden-kop">{kop}</span>}
      {vars.map((v, i) => (
        <span className="rpt-chk-waarde" key={i}>
          <span
            className="rpt-chk-waarde-symbool"
            dangerouslySetInnerHTML={{ __html: renderLatexHtml(v.symbol, false) }}
          />
          <span className="rpt-chk-waarde-eq">=</span>
          <span className="rpt-chk-waarde-getal">{fmtValue(v.value)}</span>
          {v.unit && v.unit !== "-" && (
            <span className="rpt-chk-waarde-eenheid">&nbsp;{v.unit}</span>
          )}
        </span>
      ))}
    </div>
  );
}

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
  const tussenwaarden =
    metTussenwaarden && isStabilityCalc(check) ? check.intermediate_values : [];
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

  const meta = steel
    ? `EN 1993 · ${t("report.crossSectionClass", "doorsnedeklasse")} ${crossSectionClassLabel(result.classification)}`
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
        {steel ? result.profile_name : result.section_name} (
        {steel ? result.steel_grade : result.strength_class})
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

  const checkedTime = fmtCheckedAt(lastRunAt);
  const basis = basisText(t, results);

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
            {basis ?? ""}
          </p>

          {results.map((r) => (
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
