/**
 * CltSection — kruislaaghout in het rapport: per CLT-staaf de opbouw als
 * figuur (doorsnede + spanningsverloop) en de toetsing per lamel als tabel,
 * met de maatgevende laag gemarkeerd.
 *
 * De toetsen per laag zijn gewone NamedChecks in de checkStore; hun volledige
 * afleidingen staan daarom óók in "Toetsing per staaf" (CheckDetailSection),
 * net als bij staal en massief hout. Deze sectie voegt toe wat daar niet
 * past: het beeld van de opbouw, de tabel die alle lagen naast elkaar zet,
 * en de afleiding van de effectieve stijfheid (EI)_ef die aan alle toetsen
 * voorafgaat.
 *
 * Staafkeuze volgt reportStore.verborgenToetsStaven, dezelfde schakelaar als
 * de uitgebreide uitvoer per staaf: wie een staaf daar uitzet, krijgt hier
 * ook geen uitwerking (wel een telling van wat is weggelaten).
 *
 * Zonder CLT-resultaten toont de sectie een expliciete melding; de
 * hoofdsessie bepaalt via reportSections.ts of de sectie überhaupt in het
 * rapport staat.
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { isToetsStaafZichtbaar, useReportStore } from "../../../stores/reportStore";
import type { CltBeamCheckResult } from "../../../lib/types/timber/CltBeamCheckResult";
import type { CltLayerResult } from "../../../lib/types/timber/CltLayerResult";
import {
  cltMechanicaUitResultaat,
  cltTauOpZ,
  isCltCheckResult,
  richtingLabel,
} from "../../../lib/cltCheckBuilder";
import CltOpbouwTekening, { type Verloop } from "../../clt/CltOpbouwTekening";
import {
  CHECK_REPORT_CSS,
  LOAD_DURATION_LABELS,
  fmtCheckedAt,
  fmtUc,
  fmtValue,
  renderLatexHtml,
  serviceClassLabel,
  statusClass,
  statusLabel,
} from "../checkReportUtils";

/** Krachten waarop de kern de lagen getoetst heeft, uit de toetsen zelf. */
function toetskrachten(r: CltBeamCheckResult): { m: number; v: number; kCr: number } {
  let m = 0;
  let v = 0;
  let kCr = 1;
  for (const c of r.checks) {
    const d = c.kind.data;
    if (c.id.startsWith("clt_6.1.6_")) {
      m = d.force_state.forces.my_ed;
    } else if (c.id.startsWith("clt_6.1.7_") || c.id.startsWith("clt_rolschuif_")) {
      v = d.force_state.forces.vz_ed;
      const k = d.variables.find((x) => x.symbol === "k_{cr}");
      if (k) kCr = k.value;
    }
  }
  return { m, v, kCr };
}

/** σ per laag: lineair van boven- naar onderkant; dwarslagen nul. */
function sigmaVerloop(r: CltBeamCheckResult): Verloop {
  return {
    segmenten: r.layup.layers.map((l) => [
      { z: l.z_top_mm, v: l.sigma_top_mpa },
      { z: l.z_bot_mm, v: l.sigma_bot_mpa },
    ]),
    label: "σm,d",
    eenheid: "N/mm²",
  };
}

/** τ over de hoogte, opnieuw uitgerekend uit de opbouw (parabolisch per lengtelaag). */
function tauVerloop(r: CltBeamCheckResult, v: number, kCr: number): Verloop {
  const mech = cltMechanicaUitResultaat(r.layup);
  const punten: Array<{ z: number; v: number }> = [];
  mech.lagen.forEach((l, i) => {
    const n = l.richting === "Longitudinal" ? 9 : 2;
    for (let k = 0; k < n; k++) {
      // De gedeelde laaggrens één keer.
      if (i > 0 && k === 0) continue;
      const z = l.zBoven + ((l.zOnder - l.zBoven) * k) / (n - 1);
      punten.push({ z, v: cltTauOpZ(mech, z, v, kCr) });
    }
  });
  if (punten.length === 0 || punten[0].z > 0) punten.unshift({ z: 0, v: 0 });
  return { segmenten: [punten], label: "τd", eenheid: "N/mm²" };
}

/** Status van één laag: hoogste van de twee UC's; dwarslaag = ter informatie. */
function laagStatus(l: CltLayerResult): "Ok" | "NotOk" | "NotApplicable" {
  if (l.orientation === "Transverse") return "NotApplicable";
  const ucs = [l.uc_bending, l.uc_shear].filter((u): u is number => u !== null && u !== undefined);
  if (ucs.length === 0) return "NotApplicable";
  return Math.max(...ucs) <= 1 ? "Ok" : "NotOk";
}

function StijfheidsAfleiding({ r }: { r: CltBeamCheckResult }) {
  const { t } = useTranslation("ribbon");
  const b = r.layup.width_mm;
  const lengte = r.layup.layers.filter((l) => l.orientation === "Longitudinal");
  const rijen = lengte.map((l) => {
    const tk = l.thickness_mm;
    const a = b * tk;
    const i = (b * tk * tk * tk) / 12;
    const arm = (l.z_top_mm + l.z_bot_mm) / 2 - r.layup.z0_mm;
    const bijdrage = (l.e_mpa * (i + a * arm * arm)) * 1e-9; // N·mm² → kNm²
    return { l, a, i, arm, bijdrage };
  });
  return (
    <div className="rpt-clt-stijfheid">
      <p className="rpt-clt-kopje">
        {t("report.cltStijfheidKop", "Effectieve buigstijfheid (bijlage B, starre verbinding: γ = 1)")}
      </p>
      <div
        className="rpt-clt-formule"
        dangerouslySetInnerHTML={{
          __html: renderLatexHtml(
            String.raw`z_0 = \frac{\sum_i E_i A_i z_i}{\sum_i E_i A_i} = ${fmtValue(r.layup.z0_mm, 1).replace(",", "{,}")}\;\mathrm{mm} \qquad (EI)_{ef} = \sum_i E_i \left( I_i + A_i\, a_i^{2} \right) = ${fmtValue(r.layup.ei_ef_knm2, 0).replace(/\./g, "")}\;\mathrm{kNm}^{2}`,
            true,
          ),
        }}
      />
      <table className="rpt-table rpt-clt-tabel rpt-clt-stijfheidstabel">
        <thead>
          <tr>
            <th>{t("report.cltLaag", "Laag")}</th>
            <th>E_i (N/mm²)</th>
            <th>A_i = b·t_i (mm²)</th>
            <th>I_i = b·t_i³/12 (10⁶ mm⁴)</th>
            <th>a_i (mm)</th>
            <th>E_i·(I_i + A_i·a_i²) (kNm²)</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map(({ l, a, i, arm, bijdrage }) => (
            <tr key={l.index}>
              <td>{l.index}</td>
              <td className="rpt-num">{fmtValue(l.e_mpa, 0)}</td>
              <td className="rpt-num">{fmtValue(a, 0)}</td>
              <td className="rpt-num">{fmtValue(i / 1e6, 3)}</td>
              <td className="rpt-num">{fmtValue(arm, 1)}</td>
              <td className="rpt-num">{fmtValue(bijdrage, 0)}</td>
            </tr>
          ))}
          <tr className="rpt-clt-rij-som">
            <td colSpan={5}>(EI)_ef</td>
            <td className="rpt-num">{fmtValue(r.layup.ei_ef_knm2, 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CltStaafBlok({ r }: { r: CltBeamCheckResult }) {
  const { t } = useTranslation("ribbon");
  const { t: tCheck } = useTranslation("check");
  const { m, v, kCr } = toetskrachten(r);
  const fout = r.checks.length === 0;

  const meta =
    `EN 1995 · ${t("report.serviceClass", "klimaatklasse")} ${serviceClassLabel(r.service_class)}` +
    ` · ${t("report.loadDuration", "belastingduur")} ${tCheck(
      LOAD_DURATION_LABELS[r.load_duration].key,
      LOAD_DURATION_LABELS[r.load_duration].fallback,
    ).toLowerCase()}` +
    (fout
      ? ""
      : ` · (EI)ef = ${fmtValue(r.layup.ei_ef_knm2, 0)} kNm² · z₀ = ${fmtValue(r.layup.z0_mm, 1)} mm · L/h = ${fmtValue(r.layup.slenderness, 1)}`);

  return (
    <div className="rpt-clt-member">
      <h3 className="rpt-h3">
        {t("report.colBeam", "Staaf")} {r.beam_id} — {r.section_name} ({r.strength_class})
      </h3>
      <div className="rpt-chk-member-meta">
        <span>{meta}</span>
        {!fout && (
          <>
            <span className={`rpt-chk-member-uc${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
              {t("report.colUc", "UC")} = {fmtUc(r.uc_max)}
            </span>
            <span className={`rpt-chk-status ${statusClass(r.status)}`}>{statusLabel(t, r.status)}</span>
          </>
        )}
      </div>

      {fout ? (
        <p className="rpt-empty-note">{r.notes.join(" ")}</p>
      ) : (
        <>
          <div className="rpt-figuur rpt-clt-figuur">
            <CltOpbouwTekening
              className="rpt-figuur-svg rpt-clt-svg"
              lagen={r.layup.layers.map((l) => ({
                dikte: l.thickness_mm,
                richting: l.orientation,
                klasse: l.strength_class,
                maatgevend: l.governing,
              }))}
              breedteMm={r.layup.width_mm}
              z0Mm={r.layup.z0_mm}
              sigma={sigmaVerloop(r)}
              tau={tauVerloop(r, v, kCr)}
              titel={`${r.section_name}: opbouw en spanningsverloop`}
            />
            <div className="rpt-figuur-bijschrift">
              {t("report.cltFiguurBijschrift", {
                defaultValue:
                  "Opbouw van boven naar beneden, buigspanning σm,d (trek positief) en schuifspanning τd over de hoogte bij My,Ed = {{m}} kNm en Vz,Ed = {{v}} kN.",
                m: fmtValue(m, 2),
                v: fmtValue(v, 2),
              })}
            </div>
          </div>

          <p className="rpt-clt-kopje">{t("report.cltToetsKop", "Toetsing per lamel (van boven naar beneden)")}</p>
          <table className="rpt-table rpt-clt-tabel">
            <thead>
              <tr>
                <th>{t("report.cltLaag", "Laag")}</th>
                <th>{t("report.cltRichting", "Richting")}</th>
                <th>t (mm)</th>
                <th>{t("report.cltKlasse", "Klasse")}</th>
                <th>z (mm)</th>
                <th>σm,d boven / onder (N/mm²)</th>
                <th>fm,d (N/mm²)</th>
                <th>UC buiging</th>
                <th>τd (N/mm²)</th>
                <th>fv,d (N/mm²)</th>
                <th>UC dwarskracht</th>
                <th>{t("report.colStatus", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {r.layup.layers.map((l) => {
                const dwars = l.orientation === "Transverse";
                const st = laagStatus(l);
                return (
                  <tr
                    key={l.index}
                    className={`${l.governing ? "rpt-clt-rij-gov" : ""}${dwars ? " rpt-clt-rij-dwars" : ""}`}
                  >
                    <td>
                      {l.index}
                      {l.governing && (
                        <span className="rpt-clt-gov-mark">◂ {t("report.governingTag", "maatgevend")}</span>
                      )}
                    </td>
                    <td>{richtingLabel(l.orientation)}</td>
                    <td className="rpt-num">{fmtValue(l.thickness_mm, 0)}</td>
                    <td>{l.strength_class}</td>
                    <td className="rpt-num">
                      {fmtValue(l.z_top_mm, 0)}–{fmtValue(l.z_bot_mm, 0)}
                    </td>
                    <td className="rpt-num">
                      {dwars ? "—" : `${fmtValue(l.sigma_top_mpa, 2)} / ${fmtValue(l.sigma_bot_mpa, 2)}`}
                    </td>
                    <td className="rpt-num">{dwars ? "—" : fmtValue(l.f_md_mpa, 2)}</td>
                    <td className="rpt-num">{l.uc_bending == null ? "—" : fmtUc(l.uc_bending)}</td>
                    <td className="rpt-num">
                      {fmtValue(l.tau_max_mpa, 3)}
                      {dwars && <span className="rpt-clt-info"> ({t("report.cltRolschuif", "rolschuif, ter info")})</span>}
                    </td>
                    <td className="rpt-num">{dwars ? t("report.cltNietBeschikbaar", "n.b.") : fmtValue(l.f_vd_mpa, 2)}</td>
                    <td className="rpt-num">{l.uc_shear == null ? "—" : fmtUc(l.uc_shear)}</td>
                    <td className={`rpt-chk-status ${statusClass(st)}`}>
                      {dwars ? t("report.cltTerInfo", "ter info") : statusLabel(t, st)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <StijfheidsAfleiding r={r} />

          {r.notes.length > 0 && (
            <ul className="rpt-clt-notes">
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

export default function CltSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const verborgenToetsStaven = useReportStore((s) => s.verborgenToetsStaven);

  const clt = results.filter(isCltCheckResult);
  const getoond = clt.filter((r) => isToetsStaafZichtbaar(verborgenToetsStaven, r.beam_id));
  const weggelaten = clt.length - getoond.length;
  const checkedTime = fmtCheckedAt(lastRunAt);

  return (
    <div className="rpt-block rpt-clt">
      <style>{CHECK_REPORT_CSS}</style>
      <style>{CLT_REPORT_CSS}</style>
      <h2 className="rpt-h2">{t("report.sectionClt", "Kruislaaghout — opbouw en toetsing per lamel")}</h2>

      {clt.length === 0 ? (
        <p className="rpt-empty-note">
          {results.length === 0
            ? t("report.notChecked", "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.")
            : t("report.cltGeen", "Geen staven van kruislaaghout in het model (profielnaam \"CLT …\").")}
        </p>
      ) : (
        <>
          <p className="rpt-note">
            {checkedTime && `${t("report.checkedAt", "Toetsing uitgevoerd op")} ${checkedTime}. `}
            {t(
              "report.cltMethodeNoot",
              "Methode: samengestelde doorsnede met starre verbinding (NEN-EN 1995-1-1 bijlage B met γ = 1) — alleen de lengtelagen dragen in de spanrichting, de dwarslagen vormen de schuifverbinding. Toetsing per lamel: buiging art. 6.1.6 en dwarskracht art. 6.1.7 op de rekenwaarden van de sterkteklasse van die laag; rolschuiving in de dwarslagen ter informatie.",
            )}{" "}
            {weggelaten > 0 &&
              t("report.cltStaafKeuzeNoot", {
                defaultValue:
                  "Van {{aantal}} van de {{totaal}} CLT-staven is de uitwerking op verzoek weggelaten; die staven staan wel in het toetsingsoverzicht.",
                aantal: weggelaten,
                totaal: clt.length,
              })}
          </p>
          {getoond.map((r) => (
            <CltStaafBlok key={r.beam_id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}

/** Stijlen van de CLT-sectie — vaste papieropmaak, zoals de toetsingssecties. */
const CLT_REPORT_CSS = `
.rpt-clt-member { margin: 0 0 6mm; }

.rpt-clt-figuur { margin: 2mm 0 3mm; }

.rpt-clt-svg {
  display: block;
  width: 160mm;
  max-width: 100%;
  height: auto;
}

.rpt-clt-kopje {
  font-size: calc(var(--rpt-basis) * 0.9);
  font-weight: 600;
  margin: 2mm 0 1mm;
  color: #222;
}

.rpt-clt-tabel { font-size: calc(var(--rpt-basis) * 0.82); }
.rpt-clt-tabel th { white-space: nowrap; }
.rpt-clt-tabel td.rpt-num { white-space: nowrap; }

/* Maatgevende laag: vet, met een lichte houtkleurige achtergrond zodat de
   markering ook in grijstinten leesbaar blijft. */
.rpt-clt-rij-gov td { font-weight: 600; background: #f5efe3; }

/* Dwarslagen: ter informatie, dus ingetogen. */
.rpt-clt-rij-dwars td { color: #555; }

.rpt-clt-gov-mark {
  font-style: italic;
  font-weight: 400;
  color: #7f1d1d;
  margin-left: 1mm;
  white-space: nowrap;
}

.rpt-clt-info { font-size: 0.9em; color: #666; white-space: nowrap; }

.rpt-clt-stijfheid { margin: 3mm 0 0; }
.rpt-clt-stijfheidstabel { width: auto; min-width: 60%; }
.rpt-clt-rij-som td { font-weight: 600; border-top: 0.3mm solid #666; }

.rpt-clt-formule {
  padding-left: 6mm;
  margin: 0 0 1.5mm;
  overflow-x: auto;
  overflow-y: hidden;
}
.rpt-clt-formule .katex-display { margin: 0; text-align: left; }
.rpt-clt-formule .katex-display > .katex { text-align: left; }

.rpt-clt-notes {
  margin: 2mm 0 0;
  padding-left: 4mm;
  font-size: calc(var(--rpt-basis) * 0.82);
  color: #444;
}
.rpt-clt-notes li { margin-bottom: 0.5mm; }
`;
