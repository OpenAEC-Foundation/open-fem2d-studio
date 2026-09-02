/**
 * CheckDetailSection — toetsing op uitgebreid detailniveau.
 *
 * Per staaf een blok met ALLE toetsen, elk als volledig ingevulde
 * normformule op de maatgevende plek — dezelfde afleiding die het
 * toetsingspaneel (CheckBlock) toont, maar als print-variant: op papier
 * bestaat uitklappen niet, dus alles staat uitgeklapt (inclusief
 * tussenwaarden), in vaste zwart-op-wit-typografie met `break-inside:
 * avoid` per toets. KaTeX rendert via renderToString (puur, geen effects).
 *
 * Materiaal-neutraal: staal (EN 1993) en hout (EN 1995) delen het
 * NamedCheck-contract; alleen de kopregel per staaf verschilt
 * (doorsnedeklasse vs. klimaatklasse + belastingduur).
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { isSteelCheckResult, type MemberCheckResult } from "../../../lib/checkTypes";
import type { NamedValue } from "../../../lib/types/steel/NamedValue";
import {
  CHECK_REPORT_CSS,
  LOAD_DURATION_LABELS,
  basisText,
  crossSectionClassLabel,
  fmtCheckedAt,
  fmtValue,
  isStabilityCalc,
  renderLatexHtml,
  serviceClassLabel,
  statusClass,
  statusLabel,
  type CheckCalc,
} from "../checkReportUtils";

/** Ingevulde variabelen (of tussenwaarden) als doorlopende regel. */
function ValueLine({ vars }: { vars: NamedValue[] }) {
  if (vars.length === 0) return null;
  return (
    <span>
      {vars.map((v, i) => (
        <span key={i} className="rpt-chk-var">
          <span dangerouslySetInnerHTML={{ __html: renderLatexHtml(v.symbol, false) }} />
          {" = "}
          <span className="rpt-chk-var-value">{fmtValue(v.value)}</span>
          {v.unit && v.unit !== "-" && <span className="rpt-chk-var-unit"> {v.unit}</span>}
          {i < vars.length - 1 && <span className="rpt-chk-var-sep">, </span>}
        </span>
      ))}
    </span>
  );
}

/** Print-variant van CheckBlock: één toets, volledig uitgeklapt. */
function DerivationBlock({ check, governing }: { check: CheckCalc; governing: boolean }) {
  const { t } = useTranslation("ribbon");
  const cls = statusClass(check.status);
  const intermediates = isStabilityCalc(check) ? check.intermediate_values : [];

  return (
    <div className={`rpt-chk-block ${cls}`}>
      <div className="rpt-chk-head">
        <h4 className="rpt-chk-title">
          {check.title}
          {governing && (
            <span className="rpt-chk-gov-tag">{t("report.governingTag", "maatgevend")}</span>
          )}
        </h4>
        <span className="rpt-chk-article">{check.article}</span>
      </div>

      <div className="rpt-chk-forces">
        {t("report.combination", "Combinatie")} {check.force_state.combination_id}
        {" · x = "}
        {check.force_state.position_mm.toFixed(0)} mm
        {" · N = "}
        {check.force_state.forces.n_ed.toFixed(2)} kN
        {" · V"}
        <sub>z</sub>
        {" = "}
        {check.force_state.forces.vz_ed.toFixed(2)} kN
        {" · M"}
        <sub>y</sub>
        {" = "}
        {check.force_state.forces.my_ed.toFixed(2)} kNm
      </div>

      {check.formula_latex && (
        <div
          className="rpt-chk-formula"
          dangerouslySetInnerHTML={{ __html: renderLatexHtml(check.formula_latex, true) }}
        />
      )}

      {check.variables.length > 0 && (
        <div className="rpt-chk-vars">
          <ValueLine vars={check.variables} />
        </div>
      )}

      <div className="rpt-chk-result">
        {"= "}
        <strong>{fmtValue(check.value)}</strong>
        {check.unit && check.unit !== "-" && <span> {check.unit}</span>}
      </div>

      {check.uc && (
        <div className="rpt-chk-ucline">
          <span
            dangerouslySetInnerHTML={{ __html: renderLatexHtml(check.uc.formula_latex, false) }}
          />
          <span>
            {" "}= {fmtValue(check.uc.ed)} / {fmtValue(check.uc.rd)} ={" "}
          </span>
          <strong className="rpt-chk-uc-value">{check.uc.uc.toFixed(2)}</strong>
          <span className={`rpt-chk-status ${cls}`}>{statusLabel(t, check.status)}</span>
        </div>
      )}

      {intermediates.length > 0 && (
        <div className="rpt-chk-intermediates">
          <span className="rpt-chk-intermediates-label">
            {t("report.intermediateValues", "Tussenwaarden")}:
          </span>
          <ValueLine vars={intermediates} />
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

/** Alle toetsen van één staaf, met materiaal-specifieke kopregel. */
function MemberBlock({ result }: { result: MemberCheckResult }) {
  const { t } = useTranslation("ribbon");
  const { t: tCheck } = useTranslation("check");
  const steel = isSteelCheckResult(result);

  const meta = steel
    ? `EN 1993 · ${t("report.crossSectionClass", "doorsnedeklasse")} ${crossSectionClassLabel(result.classification)}`
    : `EN 1995 · ${t("report.serviceClass", "klimaatklasse")} ${serviceClassLabel(result.service_class)} · ${t("report.loadDuration", "belastingduur")} ${tCheck(
        LOAD_DURATION_LABELS[result.load_duration].key,
        LOAD_DURATION_LABELS[result.load_duration].fallback,
      ).toLowerCase()}`;

  return (
    <div className="rpt-chk-member">
      <div className="rpt-chk-member-head">
        <h3 className="rpt-chk-member-title">
          {t("report.colBeam", "Staaf")} {result.beam_id} —{" "}
          {steel ? result.profile_name : result.section_name} (
          {steel ? result.steel_grade : result.strength_class})
        </h3>
        <span className="rpt-chk-member-meta">{meta}</span>
        <span className={`rpt-chk-member-uc${result.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
          {t("report.colUc", "UC")} = {result.uc_max.toFixed(2)}
        </span>
        <span className={`rpt-chk-status ${statusClass(result.status)}`}>
          {statusLabel(t, result.status)}
        </span>
      </div>

      {result.checks.map((named) => (
        <DerivationBlock
          key={named.id}
          check={named.kind.data}
          governing={named.id === result.governing_check_id}
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
          {checkedTime && (
            <p className="rpt-note">
              {t("report.checkedAt", "Toetsing uitgevoerd op")} {checkedTime}.
              {basis ? ` ${basis}` : ""}
            </p>
          )}

          {results.map((r) => (
            <MemberBlock key={`${isSteelCheckResult(r) ? "s" : "t"}-${r.beam_id}`} result={r} />
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
