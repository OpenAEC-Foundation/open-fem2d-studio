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
  cltLaagStijfheden,
  cltLagenZelfdeE,
  cltMechanicaUitResultaat,
  cltReferentieEMpa,
  cltTauVerloop,
  isCltCheckResult,
  richtingLabel,
  type CltMechanica,
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

/**
 * De twee krachtstoestanden waarop de kern getoetst heeft, uit de toetsen
 * zelf — INCLUSIEF de plaats waar ze vandaan komen.
 *
 * Het zijn er TWEE: art. 6.1.6 rekent op het punt met de grootste |M_y| in de
 * omhullende, art. 6.1.7 op het punt met de grootste |V_z|. Alleen bij een
 * uitkraging vallen die samen. De positie reist daarom mee, zodat de figuur
 * en het bijschrift kunnen zeggen dat de twee panelen niet één toestand van
 * de doorsnede tonen.
 */
interface Toetskrachten {
  m: number;
  /** Plaats van het maatgevende momentpunt (mm langs de staaf), of null. */
  mX: number | null;
  v: number;
  /** Plaats van het maatgevende dwarskrachtpunt (mm langs de staaf), of null. */
  vX: number | null;
  kCr: number;
}

function toetskrachten(r: CltBeamCheckResult): Toetskrachten {
  let m = 0;
  let mX: number | null = null;
  let v = 0;
  let vX: number | null = null;
  let kCr = 1;
  for (const c of r.checks) {
    const d = c.kind.data;
    if (c.id.startsWith("clt_6.1.6_")) {
      m = d.force_state.forces.my_ed;
      mX = d.force_state.position_mm;
    } else if (c.id.startsWith("clt_6.1.7_") || c.id.startsWith("clt_rolschuif_")) {
      v = d.force_state.forces.vz_ed;
      vX = d.force_state.position_mm;
      const k = d.variables.find((x) => x.symbol === "k_{cr}");
      if (k) kCr = k.value;
    }
  }
  return { m, mX, v, vX, kCr };
}

/** "bij x = 2,50 m", of niets als de plaats niet bekend is. */
function plaatsNoot(xMm: number | null): string | undefined {
  return xMm === null ? undefined : `bij x = ${fmtValue(xMm / 1000, 2)} m`;
}

/**
 * σ per laag: lineair van boven- naar onderkant, dwarslagen nul.
 *
 * De waarden komen RECHTSTREEKS uit het kernresultaat en worden hier niet
 * nagerekend — de tabel ernaast toont dezelfde velden, dus twee getallen uit
 * één bron.
 */
function sigmaVerloop(r: CltBeamCheckResult, k: Toetskrachten): Verloop {
  return {
    segmenten: r.layup.layers.map((l) => [
      { z: l.z_top_mm, v: l.sigma_top_mpa },
      { z: l.z_bot_mm, v: l.sigma_bot_mpa },
    ]),
    label: "σm,d",
    eenheid: "N/mm²",
    noot: plaatsNoot(k.mX),
  };
}

/**
 * τ over de hoogte, uit de opbouw bemonsterd (parabolisch per lengtelaag).
 *
 * De bemonstering zelf staat in `cltTauVerloop`: die neemt de zwaartelijn als
 * VAST monsterpunt mee, net als de kern doet bij het bepalen van τ_d per laag.
 * Zonder dat punt lag de getekende piek bij een asymmetrische opbouw onder de
 * τ_d uit de tabel ernaast.
 */
function tauVerloop(mech: CltMechanica, k: Toetskrachten): Verloop {
  return {
    segmenten: [cltTauVerloop(mech, k.v, k.kCr)],
    label: "τd",
    eenheid: "N/mm²",
    noot: plaatsNoot(k.vX),
  };
}

/** Status van één laag: hoogste van de twee UC's; dwarslaag = ter informatie. */
function laagStatus(l: CltLayerResult): "Ok" | "NotOk" | "NotApplicable" {
  if (l.orientation === "Transverse") return "NotApplicable";
  const ucs = [l.uc_bending, l.uc_shear].filter((u): u is number => u !== null && u !== undefined);
  if (ucs.length === 0) return "NotApplicable";
  return Math.max(...ucs) <= 1 ? "Ok" : "NotOk";
}

/**
 * De opbouw van I_y: per laag A_i, het eigen traagheidsmoment I_i, de arm a_i
 * tot de zwaartelijn en de Steiner-term A_i·a_i², met I_ef,net als somregel —
 * en er direct naast de E-GEWOGEN kolom, want (EI)_ef is wat de toetsing
 * werkelijk gebruikt.
 *
 * Waarom hier geen weerstandsmoment W_y staat: in een samengestelde doorsnede
 * met verschillende E per laag bestaat "de" randspanning niet als M/W. De
 * norm geeft in bijlage B (B.7)+(B.8) de spanning per laag rechtstreeks
 * (σ_i = E_i·M·(z − z_0)/(EI)_ef), en de hele keten — kern, solver, tabel —
 * rekent daarmee. Een W_y zou hier voor het eerst bedacht moeten worden, en
 * een bedachte definitie in een rekenrapport is een verzonnen grootheid.
 *
 * DWARSLAGEN STAAN ER WÉL IN. Hun A_i en I_i bestaan; met E_i = 0 dragen ze
 * alleen niets bij, en dat is precies wat een lezer moet zien om te begrijpen
 * waarom de som niet op b·h³/12 uitkomt.
 */
function OpbouwVanIy({ r, mech }: { r: CltBeamCheckResult; mech: CltMechanica }) {
  const { t } = useTranslation("ribbon");
  const rijen = cltLaagStijfheden(mech);
  const somI = rijen.reduce((s, x) => s + (x.draagt ? x.iTotaal : 0), 0);
  const zelfdeE = cltLagenZelfdeE(mech);
  const eRef = cltReferentieEMpa(mech);
  const komma = (v: number, d: number) => fmtValue(v, d).replace(",", "{,}");

  return (
    <div className="rpt-clt-stijfheid">
      <p className="rpt-clt-kopje">
        {t(
          "report.cltIyKop",
          "Opbouw van I_y en de effectieve buigstijfheid (bijlage B, starre verbinding: γ = 1)",
        )}
      </p>
      <div
        className="rpt-clt-formule"
        dangerouslySetInnerHTML={{
          __html: renderLatexHtml(
            String.raw`z_0 = \frac{\sum_i E_i A_i z_i}{\sum_i E_i A_i} = ${komma(r.layup.z0_mm, 1)}\;\mathrm{mm} \qquad I_{ef,net} = \frac{(EI)_{ef}}{E_{ref}} = ${komma(r.layup.i_ef_net_mm4 / 1e6, 1)}\cdot 10^{6}\;\mathrm{mm}^{4} \qquad (EI)_{ef} = \sum_i E_i \left( I_i + A_i\, a_i^{2} \right) = ${fmtValue(r.layup.ei_ef_knm2, 0).replace(/\./g, "")}\;\mathrm{kNm}^{2}`,
            true,
          ),
        }}
      />
      <table className="rpt-table rpt-clt-tabel rpt-clt-stijfheidstabel">
        <thead>
          <tr>
            <th>{t("report.cltLaag", "Laag")}</th>
            <th>{t("report.cltRichting", "Richting")}</th>
            <th>A_i = b·t_i (10³ mm²)</th>
            <th>I_i = b·t_i³/12 (10⁶ mm⁴)</th>
            <th>a_i (mm)</th>
            <th>A_i·a_i² (10⁶ mm⁴)</th>
            <th>I_i + A_i·a_i² (10⁶ mm⁴)</th>
            <th>E_i (N/mm²)</th>
            <th>E_i·(I_i + A_i·a_i²) (kNm²)</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((x) => (
            <tr key={x.index} className={x.draagt ? "" : "rpt-clt-rij-dwars"}>
              <td>{x.index}</td>
              <td>{richtingLabel(x.richting)}</td>
              <td className="rpt-num">{fmtValue(x.a / 1e3, 1)}</td>
              <td className="rpt-num">{fmtValue(x.iEigen / 1e6, 3)}</td>
              <td className="rpt-num">{fmtValue(x.arm, 1)}</td>
              <td className="rpt-num">{fmtValue(x.steiner / 1e6, 1)}</td>
              <td className="rpt-num">{x.draagt ? fmtValue(x.iTotaal / 1e6, 1) : "—"}</td>
              <td className="rpt-num">{fmtValue(x.e, 0)}</td>
              <td className="rpt-num">{x.draagt ? fmtValue(x.eiBijdrage * 1e-9, 0) : "—"}</td>
            </tr>
          ))}
          <tr className="rpt-clt-rij-som">
            <td colSpan={6}>
              {zelfdeE
                ? t("report.cltSomIefNet", "Σ over de lengtelagen = I_ef,net")
                : t("report.cltSomMeetkundig", "Σ over de lengtelagen (meetkundig)")}
            </td>
            <td className="rpt-num">{fmtValue(somI / 1e6, 1)}</td>
            <td />
            <td className="rpt-num">{fmtValue(r.layup.ei_ef_knm2, 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="rpt-clt-somnoot">
        {zelfdeE
          ? t("report.cltIefNetGelijk", {
              defaultValue:
                "Alle lengtelagen hebben dezelfde E-modulus (E_ref = {{e}} N/mm²), dus de meetkundige som Σ(I_i + A_i·a_i²) is gelijk aan I_ef,net = (EI)_ef/E_ref. I_ef,net is een vergelijkingsgrootheid met een massieve doorsnede; de toetsing rekent met (EI)_ef zelf.",
              e: fmtValue(eRef ?? 0, 0),
            })
          : t("report.cltIefNetAfwijkend", {
              defaultValue:
                "De lengtelagen hebben NIET dezelfde E-modulus, dus de meetkundige som Σ(I_i + A_i·a_i²) = {{som}}·10⁶ mm⁴ is niet gelijk aan I_ef,net = (EI)_ef/E_ref = {{ief}}·10⁶ mm⁴ met E_ref = {{e}} N/mm² (de bovenste lengtelaag). I_ef,net is een vergelijkingsgrootheid; de toetsing rekent met (EI)_ef zelf.",
              som: fmtValue(somI / 1e6, 1),
              ief: fmtValue(r.layup.i_ef_net_mm4 / 1e6, 1),
              e: fmtValue(eRef ?? 0, 0),
            })}
      </p>
    </div>
  );
}

function CltStaafBlok({ r }: { r: CltBeamCheckResult }) {
  const { t } = useTranslation("ribbon");
  const { t: tCheck } = useTranslation("check");
  const krachten = toetskrachten(r);
  const { m, v } = krachten;
  const fout = r.checks.length === 0;
  // Alleen opbouwen die de kern hééft doorgerekend hebben een mechanica; bij
  // een foutresultaat zijn de lagen leeg en is er niets om te spiegelen.
  const mech = fout ? null : cltMechanicaUitResultaat(r.layup);

  const meta =
    `EN 1995 · ${t("report.serviceClass", "klimaatklasse")} ${serviceClassLabel(r.service_class)}` +
    ` · ${t("report.loadDuration", "belastingduur")} ${tCheck(
      LOAD_DURATION_LABELS[r.load_duration].key,
      LOAD_DURATION_LABELS[r.load_duration].fallback,
    ).toLowerCase()}` +
    (fout
      ? ""
      : ` · (EI)ef = ${fmtValue(r.layup.ei_ef_knm2, 0)} kNm² · Ief,net = ${fmtValue(
          r.layup.i_ef_net_mm4 / 1e6,
          1,
        )}·10⁶ mm⁴ · (EA)ef = ${fmtValue(
          r.layup.ea_ef_kn,
          0,
        )} kN · z₀ = ${fmtValue(r.layup.z0_mm, 1)} mm · L/h = ${fmtValue(r.layup.slenderness, 1)}`);

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

      {fout || !mech ? (
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
              sigma={sigmaVerloop(r, krachten)}
              tau={tauVerloop(mech, krachten)}
              titel={`${r.section_name}: opbouw en spanningsverloop`}
            />
            <div className="rpt-figuur-bijschrift">
              {t("report.cltFiguurBijschrift", {
                defaultValue:
                  "Opbouw van boven naar beneden, met de buigspanning σm,d (trek positief) en de schuifspanning τd over de hoogte. LET OP: de twee spanningspanelen horen bij TWEE VERSCHILLENDE punten in de omhullende — σm,d bij het maatgevende momentpunt (My,Ed = {{m}} kNm{{mx}}), τd bij het maatgevende dwarskrachtpunt (Vz,Ed = {{v}} kN{{vx}}). Naast elkaar getekend, maar samen géén toestand van één doorsnede.",
                m: fmtValue(m, 2),
                mx: krachten.mX === null ? "" : ` op x = ${fmtValue(krachten.mX / 1000, 2)} m`,
                v: fmtValue(v, 2),
                vx: krachten.vX === null ? "" : ` op x = ${fmtValue(krachten.vX / 1000, 2)} m`,
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

          <OpbouwVanIy r={r} mech={mech} />

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
/* De I_y-tabel telt negen kolommen en moet de volle breedte pakken; met
   width:auto viel hij terug op de tekstbreedte en liepen de kopregels over
   twee regels. (Geen accenttekens in dit blok: het staat in een JS-template
   en een accent zou de literal sluiten.) */
.rpt-clt-stijfheidstabel { width: 100%; }

.rpt-clt-somnoot {
  margin: 1mm 0 0;
  font-size: calc(var(--rpt-basis) * 0.78);
  color: #555;
}
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
