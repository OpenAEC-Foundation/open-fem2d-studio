/**
 * BetonSection — gewapend beton in het rapport: per betonstaaf de doorsnede
 * mét wapeningskorf, de invoer waarmee getoetst is, de toetsen die de kern
 * teruggeeft, het M-κ-diagram en het N-M-interactiediagram.
 *
 * Naar het model van SpanningSection en CltSection: de toetsen zelf zijn
 * gewone NamedChecks in de checkStore en hun volledige afleiding staat óók in
 * "Toetsing per staaf". Deze sectie voegt toe wat daar niet past — het BEELD
 * (de korf in de doorsnede, de twee diagrammen), de invoer die anders alleen
 * als samenvattingsregel bestaat, en het beperkingenblok.
 *
 * DAT BEPERKINGENBLOK IS GEEN SIERAAD. De betonkern toetst uitsluitend de
 * doorsnede op buiging met normaalkracht. Dwarskracht, wringing, pons,
 * tweede orde, scheurwijdte, doorbuiging en de detailleringsregels zitten er
 * niet in. Een lezer die dit hoofdstuk ziet moet niet kunnen denken dat een
 * betonnen staaf hiermee "af" is; daarom staat wat er níét getoetst is
 * uitgeschreven, met artikelnummer, en niet weggemoffeld in een voetnoot.
 *
 * Bron van de wapeningskorf voor de tekening: bij voorkeur de
 * staafeigenschappen uit het model (exacte getallen), en anders de
 * samenvattingsregel die de kern zelf meestuurt — zo werkt de sectie ook in
 * het losgekoppelde rapportvenster, waar geen modelstate is.
 *
 * Zonder betonresultaten toont de sectie een expliciete melding; de
 * hoofdsessie bepaalt via reportSections.ts of de sectie in het rapport staat.
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { isToetsStaafZichtbaar, useReportStore } from "../../../stores/reportStore";
import { useReportData } from "../ReportDataContext";
import { isConcreteCheckResult } from "../../../lib/checkTypes";
import { parseConcreteRectMm, DEFAULT_N_STRIPS } from "../../../lib/betonCheckBuilder";
import type { ConcreteBeamCheckResult } from "../../../lib/types/concrete/ConcreteBeamCheckResult";
import type { ReinforcementCage } from "../../../lib/types/concrete/ReinforcementCage";
import type { RebarRow } from "../../../lib/types/concrete/RebarRow";
import DoorsnedeTekening from "../../beton/DoorsnedeTekening";
import MNKappaGrafiek from "../../beton/MNKappaGrafiek";
import InteractieGrafiek from "../../beton/InteractieGrafiek";
import { RAPPORT_KLEUREN } from "../../beton/tekenkleuren";
import { rijLabel, rijOppervlakMm2, type Wapeningskorf } from "../../beton/wapeningskorf";
import {
  CHECK_REPORT_CSS,
  CONCRETE_NORM_FULL,
  afleidingLatex,
  fmtCheckedAt,
  fmtUc,
  fmtValue,
  renderLatexHtml,
  splitsArtikel,
  statusClass,
  statusLabel,
  type CheckCalc,
} from "../checkReportUtils";

// ═══════════════════════════════════════════════════════════════════════
// De korf terugvinden voor de tekening
// ═══════════════════════════════════════════════════════════════════════

/** "3Ø16" (of "—") uit de samenvattingsregel van de kern. */
function rijUitTekst(s: string | undefined): RebarRow {
  const m = s ? /(\d+)\s*Ø\s*([\d.,]+)/.exec(s) : null;
  if (!m) return { count: 0, diameter_mm: 0 };
  return { count: parseInt(m[1], 10), diameter_mm: parseFloat(m[2].replace(",", ".")) };
}

/**
 * De korf uit `reinforcement_summary`: "onder 3Ø16, boven 2Ø12, beugel Ø8,
 * dekking 30 mm". Die regel komt uit `ReinforcementCage::summary()` in de
 * kern en heeft dus een vaste vorm; dit is de terugvaloptie voor wanneer de
 * modelstate er niet is (losgekoppeld rapportvenster). `null` = niet te
 * herleiden, dan blijft de tekening weg in plaats van een verzonnen korf.
 */
function korfUitSamenvatting(s: string): ReinforcementCage | null {
  const dekking = /dekking\s+([\d.,]+)\s*mm/.exec(s);
  if (!dekking) return null;
  const beugel = /beugel\s*Ø\s*([\d.,]+)/.exec(s);
  const cage: ReinforcementCage = {
    cover_mm: parseFloat(dekking[1].replace(",", ".")),
    stirrup_diameter_mm: beugel ? parseFloat(beugel[1].replace(",", ".")) : 0,
    top: rijUitTekst(/boven\s+([^,]+)/.exec(s)?.[1]),
    bottom: rijUitTekst(/onder\s+([^,]+)/.exec(s)?.[1]),
  };
  if (cage.bottom.count === 0 && cage.top.count === 0) return null;
  return cage;
}

/**
 * De `Wapeningskorf` waarmee de tekening gemaakt wordt. `aantalStroken` en
 * `staaltak` doen in de tekening niet mee, maar horen bij het type; ze krijgen
 * de standaardwaarden en worden nergens als getoetste invoer getoond.
 */
function korfVoorTekening(
  r: ConcreteBeamCheckResult,
  uitModel: ReinforcementCage | undefined,
): Wapeningskorf | null {
  const rect = parseConcreteRectMm(r.section_name);
  const cage = uitModel ?? korfUitSamenvatting(r.reinforcement_summary);
  if (!rect || !cage) return null;
  return {
    breedteMm: rect.bMm,
    hoogteMm: rect.hMm,
    betonklasse: r.concrete_class,
    staalsoort: r.reinforcement_grade,
    korf: cage,
    aantalStroken: DEFAULT_N_STRIPS,
    staaltak: "Horizontal",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Eén betonstaaf
// ═══════════════════════════════════════════════════════════════════════

/** De M-N-κ-toets van deze staaf — die draagt het maatgevende krachtspunt. */
function mnKappaToets(r: ConcreteBeamCheckResult): CheckCalc | null {
  const named = r.checks.find((c) => c.id === "6.1_mn_kappa");
  return named ? named.kind.data : null;
}

function BetonStaafBlok({
  r,
  korfUitModel,
}: {
  r: ConcreteBeamCheckResult;
  korfUitModel: ReinforcementCage | undefined;
}) {
  const { t } = useTranslation("ribbon");
  const fout = r.checks.length === 0 || r.governing_check_id.startsWith("ERROR:");
  const korf = korfVoorTekening(r, korfUitModel);
  const mn = mnKappaToets(r);
  const diagram = r.mn_kappa;

  // Het maatgevende punt van de M-N-κ-toets. `uc.ed` is het moment waarop
  // getoetst is — dat kan hoger zijn dan |M_y,Ed| door de minimale
  // excentriciteit van 6.1(4); daarom uc.ed en niet de snedekracht zelf.
  // Bij het uitzonderingsgeval "geen evenwicht bij κ = 0" toetst de kern op N
  // in plaats van op M; dan is er geen M_Ed om te markeren.
  const opN = mn?.uc?.formula_latex.includes("N_{Rd}") ?? false;
  const nEd = mn ? mn.force_state.forces.n_ed : undefined;
  const mEdAbs = !opN && mn?.uc ? mn.uc.ed : undefined;
  const mTeken = mn && mn.force_state.forces.my_ed < 0 ? -1 : 1;
  const mEd = mEdAbs === undefined ? undefined : mTeken * mEdAbs;

  const heeftInteractie = r.interaction_positive.length > 1 || r.interaction_negative.length > 1;

  const aOnder = korf ? rijOppervlakMm2(korf.korf.bottom) : r.a_s_bottom_mm2;
  const rho = korf && r.d_mm > 0 ? (aOnder / (korf.breedteMm * r.d_mm)) * 100 : null;

  return (
    <div className="rpt-bet-member">
      <h3 className="rpt-h3">
        {t("report.colBeam", "Staaf")} {r.beam_id} — {r.section_name} ({r.concrete_class})
      </h3>
      <div className="rpt-chk-member-meta">
        <span>
          EN 1992 · {r.reinforcement_summary} · f<sub>cd</sub> = {fmtValue(r.f_cd_mpa, 2)} N/mm² ·
          f<sub>yd</sub> = {fmtValue(r.f_yd_mpa, 1)} N/mm²
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
        <p className="rpt-empty-note">
          {r.governing_check_id.replace(/^ERROR:\s*/, "") ||
            t("report.betonGeenToets", "De rekenkern heeft voor deze staaf geen toets geleverd.")}
        </p>
      ) : (
        <>
          {/* Doorsnede + invoer naast elkaar: het beeld en de getallen waarmee
              het beeld gemaakt is, horen op één regel. */}
          <div className="rpt-bet-invoer">
            {korf ? (
              <div className="rpt-figuur rpt-bet-figuur-doorsnede">
                <DoorsnedeTekening
                  className="rpt-figuur-svg rpt-bet-svg-doorsnede"
                  korf={korf}
                  kleuren={RAPPORT_KLEUREN}
                  titel={`Doorsnede ${r.section_name} met wapeningskorf: ${r.reinforcement_summary}`}
                />
                <div className="rpt-figuur-bijschrift">
                  {t("report.betonDoorsnedeBijschrift", {
                    defaultValue: "Doorsnede {{naam}} mm met wapeningskorf (ware schaal).",
                    naam: r.section_name,
                  })}
                </div>
              </div>
            ) : (
              <p className="rpt-empty-note">
                {t(
                  "report.betonGeenKorf",
                  "De wapeningskorf kon niet uit het model of uit de samenvattingsregel worden herleid; de doorsnedetekening is daarom weggelaten.",
                )}
              </p>
            )}

            <table className="rpt-table rpt-bet-invoertabel">
              <tbody>
                <tr>
                  <th>{t("report.betonSterkteklasse", "Sterkteklasse beton")}</th>
                  <td>{r.concrete_class}</td>
                </tr>
                <tr>
                  <th>{t("report.betonStaalsoort", "Wapeningsstaal")}</th>
                  <td>{r.reinforcement_grade}</td>
                </tr>
                <tr>
                  <th>{t("report.betonAfmetingen", "Doorsnede b × h")}</th>
                  <td>{r.section_name} mm</td>
                </tr>
                <tr>
                  <th>{t("report.betonDekking", "Dekking c")}</th>
                  <td>{korf ? `${fmtValue(korf.korf.cover_mm, 0)} mm` : "—"}</td>
                </tr>
                <tr>
                  <th>{t("report.betonBeugel", "Beugeldiameter")}</th>
                  <td>
                    {korf
                      ? korf.korf.stirrup_diameter_mm > 0
                        ? `Ø${fmtValue(korf.korf.stirrup_diameter_mm, 0)} mm`
                        : t("report.betonGeenBeugel", "geen beugel")
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th>{t("report.betonOnderwapening", "Onderwapening")}</th>
                  <td>
                    {korf ? rijLabel(korf.korf.bottom) : "—"} — A<sub>s1</sub> ={" "}
                    {fmtValue(r.a_s_bottom_mm2, 0)} mm²
                  </td>
                </tr>
                <tr>
                  <th>{t("report.betonBovenwapening", "Bovenwapening")}</th>
                  <td>
                    {korf ? rijLabel(korf.korf.top) : "—"} — A<sub>s2</sub> ={" "}
                    {fmtValue(r.a_s_top_mm2, 0)} mm²
                  </td>
                </tr>
                <tr>
                  <th>
                    {t("report.betonNuttigeHoogte", "Nuttige hoogte d")}
                    {rho !== null && <> / ρ</>}
                  </th>
                  <td>
                    {fmtValue(r.d_mm, 0)} mm
                    {rho !== null && <> / {fmtValue(rho, 2)} %</>}
                  </td>
                </tr>
                <tr>
                  <th>
                    {t("report.betonRekenwaarden", "Rekenwaarden")} f<sub>cd</sub> / f<sub>yd</sub>
                  </th>
                  <td>
                    {fmtValue(r.f_cd_mpa, 2)} / {fmtValue(r.f_yd_mpa, 1)} N/mm²
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* De toetsen die de kern teruggeeft, met formule en vindplaats. */}
          <p className="rpt-bet-kopje">{t("report.betonToetsKop", "Toetsen op de doorsnede")}</p>
          <table className="rpt-table rpt-bet-toetstabel">
            <thead>
              <tr>
                <th>{t("report.betonToets", "Toets en formule")}</th>
                <th>{t("report.betonArtikel", "Vindplaats")}</th>
                <th>{t("report.betonKrachten", "Combinatie / x")}</th>
                <th>E_d</th>
                <th>R_d</th>
                <th>{t("report.colUc", "UC")}</th>
                <th>{t("report.colStatus", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {r.checks.map((named) => {
                const c = named.kind.data;
                const { artikel, vergelijking } = splitsArtikel(c.article);
                const gov = named.id === r.governing_check_id;
                return (
                  <tr key={named.id} className={gov ? "rpt-bet-rij-gov" : undefined}>
                    <td>
                      {c.title}
                      {gov && (
                        <span className="rpt-bet-gov-mark">
                          ◂ {t("report.governingTag", "maatgevend")}
                        </span>
                      )}
                      <div
                        className="rpt-bet-formule"
                        dangerouslySetInnerHTML={{
                          __html: renderLatexHtml(c.formula_latex, false),
                        }}
                      />
                    </td>
                    <td>
                      {artikel}
                      {vergelijking && <> ({vergelijking})</>}
                    </td>
                    <td className="rpt-num">
                      {c.force_state.combination_id} / {fmtValue(c.force_state.position_mm, 0)} mm
                    </td>
                    <td className="rpt-num">
                      {c.uc ? `${fmtValue(c.uc.ed, 2)} ${c.unit}` : "—"}
                    </td>
                    <td className="rpt-num">
                      {fmtValue(c.value, 2)} {c.unit}
                    </td>
                    <td className="rpt-num">{c.uc ? fmtUc(c.uc.uc) : "—"}</td>
                    <td className={`rpt-chk-status ${statusClass(c.status)}`}>
                      {statusLabel(t, c.status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* De maatgevende toets één keer uitgeschreven: symbolisch, met de
              getallen ingevuld, en de uitkomst. De overige toetsen staan
              volledig in "Toetsing per staaf". */}
          {(() => {
            const named = r.checks.find((c) => c.id === r.governing_check_id);
            if (!named) return null;
            const c = named.kind.data;
            const { latex } = afleidingLatex(c);
            return (
              <div className="rpt-bet-afleiding">
                <p className="rpt-bet-kopje">
                  {t("report.betonAfleidingKop", "Maatgevende toets, uitgeschreven")}: {c.title}
                </p>
                <div
                  className="rpt-bet-formuleblok"
                  dangerouslySetInnerHTML={{ __html: renderLatexHtml(latex, true) }}
                />
              </div>
            );
          })()}

          {/* De twee diagrammen naast elkaar: hetzelfde rekenpunt, twee
              gezichtspunten — M-κ bij vaste N, en de omhullende in het
              (M, N)-vlak. */}
          <div className="rpt-bet-diagrammen">
            <div className="rpt-figuur rpt-bet-figuur-grafiek">
              <MNKappaGrafiek
                className="rpt-figuur-svg rpt-bet-svg-grafiek"
                diagram={diagram}
                mEdKnm={mEdAbs}
                markeerMEd
                interactief={false}
                kleuren={RAPPORT_KLEUREN}
              />
              <div className="rpt-figuur-bijschrift">
                {diagram
                  ? t("report.betonMKappaBijschrift", {
                      defaultValue:
                        "M-κ-diagram bij N_Ed = {{n}} kN. M_Rd = {{mrd}} kNm bij κ_u = {{ku}}·10⁻³/m.",
                      n: fmtValue(diagram.n_kn, 1),
                      mrd: fmtValue(diagram.m_max_knm, 1),
                      ku: fmtValue(diagram.kappa_u_per_m * 1e3, 2),
                    })
                  : t("report.betonGeenMKappa", "Geen M-κ-diagram beschikbaar.")}
              </div>
            </div>

            <div className="rpt-figuur rpt-bet-figuur-grafiek">
              {heeftInteractie ? (
                <>
                  <InteractieGrafiek
                    className="rpt-figuur-svg rpt-bet-svg-grafiek"
                    positief={r.interaction_positive}
                    negatief={r.interaction_negative}
                    nEdKn={nEd}
                    mEdKnm={mEd}
                    mRdKnm={opN ? undefined : mn?.value}
                    kleuren={RAPPORT_KLEUREN}
                  />
                  <div className="rpt-figuur-bijschrift">
                    {t("report.betonInteractieBijschrift", {
                      defaultValue:
                        "N-M-interactiediagram (bezwijkomhullende) met het rekenpunt (N_Ed; M_Ed) = ({{n}} kN; {{m}} kNm). De streeplijn is de horizontale snede M_Rd(N_Ed) waarop de unity check rust.",
                      n: nEd === undefined ? "—" : fmtValue(nEd, 1),
                      m: mEd === undefined ? "—" : fmtValue(mEd, 1),
                    })}
                  </div>
                </>
              ) : (
                <p className="rpt-empty-note">
                  {t(
                    "report.betonGeenInteractie",
                    "Geen interactiediagram beschikbaar voor deze staaf.",
                  )}
                </p>
              )}
            </div>
          </div>

          {/* De opmerkingen van de kern: minimale excentriciteit, bezwijkwijze,
              rekken. Die dragen de inhoud en horen niet weggelaten te worden. */}
          {r.checks.some((c) => c.kind.data.notes.length > 0) && (
            <ul className="rpt-bet-notes">
              {r.checks.flatMap((named) =>
                named.kind.data.notes.map((n, i) => (
                  <li key={`${named.id}-${i}`}>
                    <em>{named.kind.data.title}:</em> {n}
                  </li>
                )),
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Het beperkingenblok
// ═══════════════════════════════════════════════════════════════════════

/**
 * Wat er NIET getoetst is, met de vindplaats in NEN-EN 1992-1-1 erbij.
 *
 * De artikelnummers zijn de hoofdstuk- en artikeltitels van de norm zelf; ze
 * staan hier zodat een lezer kan nagaan welk deel van de norm níét doorlopen
 * is. Er is bewust geen enkele rekenwaarde of formule uit die artikelen
 * overgenomen — dit blok zegt alleen dat ze ontbreken.
 *
 * De Nederlandse tekst is de bron (`nl`); `key` verwijst naar de vertaling in
 * de "ribbon"-namespace. Een ontbrekende sleutel valt terug op `nl`, zodat
 * een niet-vertaalde regel zichtbaar blijft in plaats van te verdwijnen.
 */
const NIET_GETOETST: Array<{ artikel: string; key: string; nl: string }> = [
  {
    artikel: "6.2",
    key: "report.betonNietDwarskracht",
    nl:
      "Dwarskracht. Er is geen toets op V_Rd,c of V_Rd,s en er is geen beugelberekening. " +
      "De beugel in de tekening bepaalt alleen de ligging van de hoofdwapening; hij is " +
      "niet op dwarskracht getoetst.",
  },
  {
    artikel: "6.3 / 6.4",
    key: "report.betonNietWringingPons",
    nl: "Wringing en pons.",
  },
  {
    artikel: "5.8",
    key: "report.betonNietTweedeOrde",
    nl:
      "Tweede-orde-effecten bij aanwezigheid van axiale belastingen. N_Ed en M_Ed komen " +
      "uit de eerste-orde-berekening; er is geen slankheidscriterium, geen methode " +
      "gebaseerd op de nominale stijfheid (5.8.7) en geen methode gebaseerd op de " +
      "nominale kromming (5.8.8). Voor een slanke gedrukte staaf is deze toetsing " +
      "daarmee aan de ONVEILIGE kant.",
  },
  {
    artikel: "5.2 / 5.9",
    key: "report.betonNietImperfecties",
    nl: "Geometrische imperfecties en kip van slanke liggers.",
  },
  {
    artikel: "3.1.4",
    key: "report.betonNietKruip",
    nl:
      "Kruip en krimp. Er wordt met φ = 0 gerekend. In deze doorsnedetoetsing op " +
      "bezwijken speelt kruip geen rol, maar zodra de krachtsverdeling van de kruip " +
      "afhangt (tweede orde, blijvend belaste kolommen) is die aanname niet meer veilig.",
  },
  {
    artikel: "7.2 / 7.3 / 7.4",
    key: "report.betonNietBgt",
    nl:
      "De volledige bruikbaarheidsgrenstoestand: spanningsbeperking, scheurbeheersing " +
      "en doorbuigingscontrole. Er wordt GEEN scheurwijdte berekend en er is geen " +
      "doorbuigingstoets voor beton.",
  },
  {
    artikel: "8.2 / 8.4 / 9.2.1.1 / 9.5.2",
    key: "report.betonNietDetaillering",
    nl:
      "Detaillering: staafafstanden, verankering van de langswapening en de minimum- " +
      "en maximumwapeningsdoorsneden voor balken (9.2.1.1) en kolommen (9.5.2). " +
      "Een korf die de doorsnedetoets haalt kan dus nog steeds te weinig of te veel " +
      "wapening bevatten.",
  },
  {
    artikel: "4.4.1.2",
    key: "report.betonNietDekking",
    nl:
      "De minimale dekking c_min bij een milieuklasse. De dekking is invoer van de " +
      "gebruiker en wordt niet aan de norm getoetst.",
  },
  {
    artikel: "6.8",
    key: "report.betonNietVermoeiing",
    nl: "Vermoeiing. Brandwerendheid (EN 1992-1-2) evenmin.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
// De sectie
// ═══════════════════════════════════════════════════════════════════════

export default function BetonSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const verborgenToetsStaven = useReportStore((s) => s.verborgenToetsStaven);
  const { beams } = useReportData();

  const beton = results.filter(isConcreteCheckResult);
  const getoond = beton.filter((r) => isToetsStaafZichtbaar(verborgenToetsStaven, r.beam_id));
  const weggelaten = beton.length - getoond.length;
  const checkedTime = fmtCheckedAt(lastRunAt);

  return (
    <div className="rpt-block rpt-bet">
      <style>{CHECK_REPORT_CSS}</style>
      <style>{BETON_REPORT_CSS}</style>
      <h2 className="rpt-h2">
        {t("report.sectionBeton", "Beton — doorsnede, M-κ-diagram en N-M-interactiediagram")}
      </h2>

      {beton.length === 0 ? (
        <p className="rpt-empty-note">
          {results.length === 0
            ? t(
                "report.notChecked",
                "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.",
              )
            : t(
                "report.betonGeen",
                'Geen betonstaven in het model (materiaal een sterkteklasse zoals "C30/37", profiel een rechthoek zoals "300x500", plus een wapeningskorf bij de staafeigenschappen).',
              )}
        </p>
      ) : (
        <>
          <p className="rpt-note">
            {checkedTime && `${t("report.checkedAt", "Toetsing uitgevoerd op")} ${checkedTime}. `}
            {t("report.betonMethodeNoot", {
              defaultValue:
                "Methode: doorsnedetoetsing op buiging met normaalkracht volgens {{norm}}, in de uiterste grenstoestand. Twee toetsen op hetzelfde punt: de rechthoekige spanningsverdeling van 3.1.7(3) (de klassieke handberekening) en de M-N-κ-berekening met het parabool-rechthoekdiagram van 3.1.7(1), waarbij M_Rd(N_Ed) het grootste moment op het M-κ-diagram bij N_Ed is. Bij druk geldt de minimale excentriciteit van 6.1(4). Tekenconventie: N positief is trek, M positief is trek in de onderste vezel.",
              norm: CONCRETE_NORM_FULL,
            })}{" "}
            {weggelaten > 0 &&
              t("report.betonStaafKeuzeNoot", {
                defaultValue:
                  "Van {{aantal}} van de {{totaal}} betonstaven is de uitwerking op verzoek weggelaten; die staven staan wel in het toetsingsoverzicht.",
                aantal: weggelaten,
                totaal: beton.length,
              })}
          </p>

          {getoond.map((r) => (
            <BetonStaafBlok
              key={r.beam_id}
              r={r}
              korfUitModel={beams.find((b) => b.id === r.beam_id)?.checkConfig?.betonKorf}
            />
          ))}

          {/* Het beperkingenblok — na de staven, want het gaat over álle
              betonstaven in dit rapport. */}
          <div className="rpt-bet-beperkingen">
            <h3 className="rpt-h3">
              {t("report.betonBeperkingenKop", "Wat deze betontoetsing niet omvat")}
            </h3>
            <p className="rpt-bet-beperking-inleiding">
              {t(
                "report.betonBeperkingenInleiding",
                "Getoetst is uitsluitend de DOORSNEDE op buiging met normaalkracht in de uiterste grenstoestand, op het maatgevende punt van de omhullende van de UGT-combinaties. Alles hieronder is NIET getoetst; een betonstaaf die hier voldoet, is daarmee niet compleet nagerekend.",
              )}
            </p>
            <ul className="rpt-bet-beperking-lijst">
              {NIET_GETOETST.map((b) => (
                <li key={b.artikel}>
                  <strong>{b.artikel}</strong> — {t(b.key, b.nl)}
                </li>
              ))}
              <li>
                <strong>{t("report.betonBeperkingVormLabel", "Toepassingsgebied")}</strong> —{" "}
                {t(
                  "report.betonBeperkingVorm",
                  "alleen een rechthoekige doorsnede b × h met buiging om de sterke as. Scheve buiging (M_y en M_z samen) en andere doorsnedevormen worden niet getoetst.",
                )}
              </li>
            </ul>
            <p className="rpt-bet-beperking-uc">
              {t(
                "report.betonBeperkingUc",
                "Over de unity check zelf: die is bepaald als M_Ed / M_Rd(N_Ed) — een horizontale snede door het interactiediagram bij de rekenwaarde van de normaalkracht — en NIET als de afstand van het rekenpunt tot de bezwijkomhullende. Bij een staaf waarvan N en M in dezelfde combinatie samen toenemen, geeft die maat een gunstiger beeld dan een radiale maat zou doen. Het interactiediagram is er om die verhouding te kunnen zien, niet om de UC uit af te lezen.",
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Stijlen van de betonsectie — vaste papieropmaak, zoals de CLT-sectie. */
const BETON_REPORT_CSS = `
.rpt-bet-member { margin: 0 0 6mm; }

/* Doorsnede links, invoertabel rechts. Blijft op papier bijeen: de tekening
   zonder haar getallen (of andersom) is een halve mededeling. */
.rpt-bet-invoer {
  display: flex;
  align-items: flex-start;
  gap: 6mm;
  margin: 2mm 0 3mm;
  break-inside: avoid;
}

.rpt-bet-figuur-doorsnede { flex: 0 0 62mm; margin: 0; }

.rpt-bet-svg-doorsnede {
  display: block;
  width: 62mm;
  max-width: 100%;
  height: auto;
}

.rpt-bet-invoertabel {
  flex: 1;
  min-width: 0;
  font-size: calc(var(--rpt-basis) * 0.82);
}
.rpt-bet-invoertabel th { white-space: nowrap; text-align: left; font-weight: 600; width: 42%; }

.rpt-bet-kopje {
  font-size: calc(var(--rpt-basis) * 0.9);
  font-weight: 600;
  margin: 2mm 0 1mm;
  color: #222;
  break-after: avoid;
}

.rpt-bet-toetstabel { font-size: calc(var(--rpt-basis) * 0.8); }
.rpt-bet-toetstabel th { white-space: nowrap; }
.rpt-bet-toetstabel td.rpt-num { white-space: nowrap; }

/* Maatgevende toets: vet, met een lichte achtergrond zodat de markering ook
   in grijstinten leesbaar blijft (zelfde greep als de CLT-sectie). */
.rpt-bet-rij-gov td { font-weight: 600; background: #eceff3; }

.rpt-bet-gov-mark {
  font-style: italic;
  font-weight: 400;
  color: #7f1d1d;
  margin-left: 1mm;
  white-space: nowrap;
}

.rpt-bet-formule {
  margin-top: 0.6mm;
  color: #444;
  overflow-x: auto;
  overflow-y: hidden;
}
.rpt-bet-formule .katex { font-size: 0.95em; }

.rpt-bet-afleiding { margin: 2mm 0 1mm; }

.rpt-bet-formuleblok {
  padding-left: 6mm;
  overflow-x: auto;
  overflow-y: hidden;
}
.rpt-bet-formuleblok .katex-display { margin: 0; text-align: left; }
.rpt-bet-formuleblok .katex-display > .katex { text-align: left; }

/* De twee diagrammen naast elkaar; bij een smal vel onder elkaar. */
.rpt-bet-diagrammen {
  display: flex;
  flex-wrap: wrap;
  gap: 4mm;
  margin: 3mm 0 0;
}

.rpt-bet-figuur-grafiek { flex: 1 1 78mm; min-width: 0; margin: 0; }

.rpt-bet-svg-grafiek {
  display: block;
  width: 100%;
  height: auto;
}

.rpt-bet-notes {
  margin: 3mm 0 0;
  padding-left: 4mm;
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #444;
}
.rpt-bet-notes li { margin-bottom: 0.5mm; }

/* Beperkingenblok: nadrukkelijk, met een kader — dit is geen terzijde maar
   een waarschuwing, en moet ook bij snel doorbladeren opvallen. */
.rpt-bet-beperkingen {
  margin: 5mm 0 0;
  padding: 3mm 4mm;
  border: 0.3mm solid #b45309;
  background: #fdf6ec;
  break-inside: avoid;
}

.rpt-bet-beperkingen .rpt-h3 { margin-top: 0; }

.rpt-bet-beperking-inleiding {
  font-size: calc(var(--rpt-basis) * 0.85);
  margin: 0 0 2mm;
  color: #222;
}

.rpt-bet-beperking-lijst {
  margin: 0;
  padding-left: 5mm;
  font-size: calc(var(--rpt-basis) * 0.82);
  color: #333;
}
.rpt-bet-beperking-lijst li { margin-bottom: 1mm; }

.rpt-bet-beperking-uc {
  margin: 2mm 0 0;
  font-size: calc(var(--rpt-basis) * 0.82);
  color: #333;
}
`;
