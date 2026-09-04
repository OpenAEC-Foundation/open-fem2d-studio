/**
 * SpanningSection — de vrije spanningstoets in het rapport: per staaf de
 * doorsnede met het spanningsverloop als figuur, de doorsnedegrootheden, de
 * maatgevende vezel en de aannames.
 *
 * De drie toetsen (vergelijkspanning, normaalspanning, schuifspanning) zijn
 * gewone NamedChecks in de checkStore; hun volledige afleidingen staan daarom
 * óók in "Toetsing per staaf", net als bij staal, hout en beton. Deze sectie
 * voegt toe wat daar niet past: het BEELD — de doorsnede met σ_x, τ en σ_eq
 * over de hoogte naast elkaar op één hoogteschaal — plus de tabel met de
 * doorsnedegrootheden en de vindplaats van het maximum.
 *
 * Staafkeuze volgt reportStore.verborgenToetsStaven, dezelfde schakelaar als
 * de uitgebreide uitvoer per staaf.
 *
 * Zonder spanningsresultaten toont de sectie een expliciete melding; de
 * hoofdsessie bepaalt via reportSections.ts of de sectie in het rapport staat.
 */
import { useTranslation } from "react-i18next";
import { useCheckStore } from "../../../stores/checkStore";
import { isToetsStaafZichtbaar, useReportStore } from "../../../stores/reportStore";
import type { SpanningBeamCheckResult } from "../../../lib/types/spanning/SpanningBeamCheckResult";
import { isStressCheckResult } from "../../../lib/checkTypes";
import SpanningDoorsnedeTekening from "../../spanning/SpanningDoorsnedeTekening";
import {
  CHECK_REPORT_CSS,
  fmtCheckedAt,
  fmtUc,
  fmtValue,
  statusClass,
  statusLabel,
} from "../checkReportUtils";

/** De maatgevende vezel uit het verloop: waar σ_eq het grootst is. */
function maatgevendeVezel(r: SpanningBeamCheckResult) {
  const v = r.verloop;
  if (!v || v.vezels.length === 0) return null;
  let best = v.vezels[0];
  for (const f of v.vezels) if (f.sigma_eq_mpa > best.sigma_eq_mpa) best = f;
  return best;
}

function SpanningStaafBlok({ r }: { r: SpanningBeamCheckResult }) {
  const { t } = useTranslation("ribbon");
  const v = r.verloop;
  const vezel = maatgevendeVezel(r);
  const fout = r.checks.length === 0 || !v;

  return (
    <div className="rpt-spn-member">
      <h3 className="rpt-h3">
        {t("report.colBeam", "Staaf")} {r.beam_id} — {r.section_name} ({r.material_name})
      </h3>
      <div className="rpt-chk-member-meta">
        <span>
          {t("report.spanningGeenNorm", "vrije spanningstoets (geen norm)")} · f
          <sub>toel</sub> = {fmtValue(r.f_toel_mpa, 2)} N/mm² · γ<sub>M</sub> ={" "}
          {fmtValue(r.gamma_m, 2)} · f<sub>d</sub> = {fmtValue(r.f_d_mpa, 2)} N/mm²
        </span>
        {!fout && (
          <>
            <span className={`rpt-chk-member-uc${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
              {t("report.colUc", "UC")} = {fmtUc(r.uc_max)}
            </span>
            <span className={`rpt-chk-status ${statusClass(r.status)}`}>
              {statusLabel(t, r.status)}
            </span>
          </>
        )}
      </div>

      {fout ? (
        <p className="rpt-empty-note">{r.notes.join(" ")}</p>
      ) : (
        <>
          <div className="rpt-figuur rpt-spn-figuur">
            <SpanningDoorsnedeTekening
              className="rpt-figuur-svg rpt-spn-svg"
              naam={r.section.naam}
              lagen={r.section.lagen}
              hoogteMm={r.section.hoogte_mm}
              breedteMaxMm={r.section.breedte_max_mm}
              zCMm={r.section.z_c_mm}
              vezels={v!.vezels}
              zMaatgevendMm={v!.z_maatgevend_mm}
              fDMpa={r.f_d_mpa}
              titel={`${r.section.naam}: doorsnede en spanningsverloop`}
            />
            <div className="rpt-figuur-bijschrift">
              {t("report.spanningFiguurBijschrift", {
                defaultValue:
                  "Doorsnede met het spanningsverloop bij de maatgevende snede (x = {{x}} mm, combinatie {{combo}}): N = {{n}} kN, Vz = {{v}} kN, My = {{m}} kNm. Trek positief; de streeplijn in het rechterpaneel is fd = {{fd}} N/mm².",
                x: fmtValue(v!.position_mm, 0),
                combo: v!.combination_id,
                n: fmtValue(v!.n_ed_kn, 2),
                v: fmtValue(v!.vz_ed_kn, 2),
                m: fmtValue(v!.my_ed_knm, 2),
                fd: fmtValue(r.f_d_mpa, 2),
              })}
            </div>
          </div>

          <p className="rpt-spn-kopje">
            {t("report.spanningDoorsnedeKop", "Doorsnede en maatgevende vezel")}
          </p>
          <table className="rpt-table rpt-spn-tabel">
            <tbody>
              <tr>
                <th>A</th>
                <td className="rpt-num">{fmtValue(r.section.a_mm2, 0)} mm²</td>
                <th>I_y</th>
                <td className="rpt-num">{fmtValue(r.section.iy_mm4 / 1e6, 2)}·10⁶ mm⁴</td>
                <th>{t("report.spanningBron", "bron A, I_y")}</th>
                <td>{r.section.bron}</td>
              </tr>
              <tr>
                <th>h</th>
                <td className="rpt-num">{fmtValue(r.section.hoogte_mm, 1)} mm</td>
                <th>z_c</th>
                <td className="rpt-num">{fmtValue(r.section.z_c_mm, 1)} mm</td>
                <th>W_el (boven / onder)</th>
                <td className="rpt-num">
                  {fmtValue(r.section.wel_top_mm3 / 1e3, 1)} / {fmtValue(r.section.wel_bot_mm3 / 1e3, 1)}·10³ mm³
                </td>
              </tr>
              {vezel && (
                <tr className="rpt-spn-rij-gov">
                  <th>z (maatgevend)</th>
                  <td className="rpt-num">{fmtValue(vezel.z_mm, 1)} mm</td>
                  <th>σ_x / τ</th>
                  <td className="rpt-num">
                    {fmtValue(vezel.sigma_x_mpa, 2)} / {fmtValue(vezel.tau_mpa, 2)} N/mm²
                  </td>
                  <th>σ_eq</th>
                  <td className="rpt-num">{fmtValue(vezel.sigma_eq_mpa, 2)} N/mm²</td>
                </tr>
              )}
            </tbody>
          </table>

          {r.notes.length > 0 && (
            <ul className="rpt-spn-notes">
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function SpanningSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const verborgenToetsStaven = useReportStore((s) => s.verborgenToetsStaven);

  const spanning = results.filter(isStressCheckResult);
  const getoond = spanning.filter((r) => isToetsStaafZichtbaar(verborgenToetsStaven, r.beam_id));
  const weggelaten = spanning.length - getoond.length;
  const checkedTime = fmtCheckedAt(lastRunAt);

  return (
    <div className="rpt-block rpt-spn">
      <style>{CHECK_REPORT_CSS}</style>
      <style>{SPANNING_REPORT_CSS}</style>
      <h2 className="rpt-h2">
        {t("report.sectionSpanning", "Spanningstoets — doorsnede en spanningsverloop")}
      </h2>

      {spanning.length === 0 ? (
        <p className="rpt-empty-note">
          {results.length === 0
            ? t("report.notChecked", "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.")
            : t(
                "report.spanningGeen",
                "Geen staven met een vrij materiaal in het model (materiaalnaam \"VRIJ:…\").",
              )}
        </p>
      ) : (
        <>
          <p className="rpt-note">
            {checkedTime && `${t("report.checkedAt", "Toetsing uitgevoerd op")} ${checkedTime}. `}
            {t(
              "report.spanningMethodeNoot",
              "Methode: de spanningen volgen rechtstreeks uit de snedekrachten — σx = N/A + My·(z − zc)/Iy en τ = Vz·S(z)/(Iy·b(z)) — en worden per vezel over de hoogte samengenomen tot de vergelijkspanning van von Mises voor een vlakke spanningstoestand: σeq = √(σx² + σz² − σx·σz + 3·τ²). Bij σz = 0 vereenvoudigt die tot √(σx² + 3·τ²), de vorm van NEN-EN 1993-1-1 6.2.1(5). Dit is uitdrukkelijk GEEN normtoetsing: er is geen doorsnedeklassificatie en geen knik-, kip- of doorbuigingstoets, en de toelaatbare spanning komt van de gebruiker.",
            )}{" "}
            {weggelaten > 0 &&
              t("report.spanningStaafKeuzeNoot", {
                defaultValue:
                  "Van {{aantal}} van de {{totaal}} staven is de uitwerking op verzoek weggelaten; die staven staan wel in het toetsingsoverzicht.",
                aantal: weggelaten,
                totaal: spanning.length,
              })}
          </p>
          {getoond.map((r) => (
            <SpanningStaafBlok key={r.beam_id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}

/** Stijlen van de spanningssectie — vaste papieropmaak, zoals de CLT-sectie. */
const SPANNING_REPORT_CSS = `
.rpt-spn-member { margin: 0 0 6mm; }

.rpt-spn-figuur { margin: 2mm 0 3mm; }

.rpt-spn-svg {
  display: block;
  width: 165mm;
  max-width: 100%;
  height: auto;
}

.rpt-spn-kopje {
  font-size: calc(var(--rpt-basis) * 0.9);
  font-weight: 600;
  margin: 2mm 0 1mm;
  color: #222;
}

.rpt-spn-tabel { font-size: calc(var(--rpt-basis) * 0.82); width: auto; min-width: 80%; }
.rpt-spn-tabel th { white-space: nowrap; text-align: left; font-weight: 600; }
.rpt-spn-tabel td.rpt-num { white-space: nowrap; }

/* Maatgevende vezel: vet, met een lichte achtergrond zodat de markering ook
   in grijstinten leesbaar blijft. */
.rpt-spn-rij-gov td, .rpt-spn-rij-gov th { font-weight: 600; background: #f6ece2; }

.rpt-spn-notes {
  margin: 2mm 0 0;
  padding-left: 4mm;
  font-size: calc(var(--rpt-basis) * 0.82);
  color: #444;
}
.rpt-spn-notes li { margin-bottom: 0.5mm; }
`;
