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
import { useBetonStijfheidStore } from "../../../stores/betonStijfheidStore";
import { isToetsStaafZichtbaar, useReportStore } from "../../../stores/reportStore";
import { useReportData } from "../ReportDataContext";
import { isConcreteCheckResult } from "../../../lib/checkTypes";
import { parseSectionNaam, DEFAULT_N_STRIPS } from "../../../lib/betonCheckBuilder";
import { breedteOpHoogteMm, asAfstandMm } from "../../beton/wapeningskorf";
import type { ConcreteBeamCheckResult } from "../../../lib/types/concrete/ConcreteBeamCheckResult";
import type { ReinforcementCage } from "../../../lib/types/concrete/ReinforcementCage";
import type { RebarRow } from "../../../lib/types/concrete/RebarRow";
import type { BeffStaafUitkomst } from "../../../lib/beffLiggerlijn";
import BeffAfleiding, { BEFF_REPORT_CSS } from "../BeffAfleiding";
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
  // De doorsnedenaam van de KERN — die draagt bij een T ook de flensmaten en
  // daarmee de b_eff waarmee werkelijk gerekend is.
  const doorsnede = parseSectionNaam(r.section_name);
  const cage = uitModel ?? korfUitSamenvatting(r.reinforcement_summary);
  if (!doorsnede || !cage) return null;
  return {
    doorsnede,
    betonklasse: r.concrete_class,
    staalsoort: r.reinforcement_grade,
    korf: cage,
    // De tekening kent geen milieuklasse — die staat niet in het toetsresultaat
    // en de tekening doet er niets mee. Zie het beperkingenblok bij 4.4.1.2.
    milieuklasse: null,
    constructieklasse: null,
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
  beff,
}: {
  r: ConcreteBeamCheckResult;
  korfUitModel: ReinforcementCage | undefined;
  /** De b_eff-afleiding van deze staaf, of `undefined` bij een rechthoek. */
  beff: BeffStaafUitkomst | undefined;
}) {
  const { t } = useTranslation("ribbon");
  const fout = r.checks.length === 0 || r.governing_check_id.startsWith("ERROR:");
  const korf = korfVoorTekening(r, korfUitModel);
  // De doorsnede zoals de KERN hem heeft gebruikt — bij een T of L draagt die
  // de b_eff waarmee gerekend is, en niet de ingevoerde flensbreedte.
  const vorm = parseSectionNaam(r.section_name);
  const heeftFlens = vorm !== null && vorm.shape !== "Rectangle";
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
  // ρ rekent met de breedte waarin de trekwapening LIGT: bij een T-lijf b_w
  // en niet de flensbreedte.
  const bOnder = korf
    ? breedteOpHoogteMm(korf.doorsnede, asAfstandMm(korf.korf, korf.korf.bottom))
    : 0;
  const rho = korf && r.d_mm > 0 && bOnder > 0 ? (aOnder / (bOnder * r.d_mm)) * 100 : null;

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
                  <th>
                    {heeftFlens
                      ? t("report.betonAfmetingenFlens", "Doorsnede b_eff × h")
                      : t("report.betonAfmetingen", "Doorsnede b × h")}
                  </th>
                  <td>{r.section_name} mm</td>
                </tr>
                {/* Bij een T of L is de eerste maat de flensbreedte waarmee
                    gerekend is; zonder het lijf en de flensdikte erbij is de
                    doorsnede uit die ene regel niet na te tekenen. */}
                {heeftFlens && vorm && (
                  <>
                    <tr>
                      <th>{t("report.betonLijfbreedte", "Lijfbreedte b_w")}</th>
                      <td>{fmtValue(vorm.b_w_mm ?? 0, 0)} mm</td>
                    </tr>
                    <tr>
                      <th>{t("report.betonFlensdikte", "Flensdikte h_f")}</th>
                      <td>
                        {fmtValue(vorm.h_f_mm ?? 0, 0)} mm —{" "}
                        {vorm.flange_at_bottom
                          ? t("report.betonFlensOnder", "flens aan de onderzijde")
                          : t("report.betonFlensBoven", "flens aan de bovenzijde")}
                      </td>
                    </tr>
                  </>
                )}
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

          {/* De afleiding van de gebruikte b_eff. Alleen bij een T of L: bij
              een rechthoek bestaat 5.3.2.1 niet en zou dit blok ruis zijn. */}
          {heeftFlens && <BeffAfleiding uitkomst={beff} />}

          {/* De aannamen die bij de VORM horen, woordelijk uit de rekenkern.
              Ze staan óók vooraan in de notes van elke toets — daar horen ze,
              want ze gelden voor die toets — maar per toets herhaald zou een
              lezer ze twee tot drie keer zien en niet als aanname herkennen.
              Hier staan ze één keer, en de notitielijst onderaan filtert ze
              eruit. De tekst is NIET vertaald en niet geherformuleerd: dat een
              L in dit model exact een T is omdat de zijdelingse kromming
              verhinderd wordt verondersteld, en dat de norm daar geen artikel
              voor geeft, is geen zin die in een tweede versie mag bestaan. */}
          {r.shape_assumptions.length > 0 && (
            <div className="rpt-bet-aannamen">
              <p className="rpt-bet-kopje">
                {t("report.betonAannamenKop", "Aannamen bij deze doorsnedevorm")}
              </p>
              <ul className="rpt-bet-aannamen-lijst">
                {r.shape_assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

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
              getallen ingevuld, en de uitkomst.

              Bewust NIET de volledige stap-voor-stap-afleiding. Die bestaat —
              de rekenkern levert per betontoets ruim tien deelstappen met
              formule, ingevulde waarden, vindplaats en de aannamen die eronder
              liggen — maar zij hoort in "Toetsing per staaf", waar zij op het
              gedetailleerde niveau staat en waar ook de kipketen van staal
              staat. Haar hier hérhalen zou hetzelfde twee keer in één rapport
              zetten; dit hoofdstuk gaat over het BEELD (de korf in de
              doorsnede, de twee diagrammen) en de invoer. */}
          {(() => {
            const named = r.checks.find((c) => c.id === r.governing_check_id);
            if (!named) return null;
            const c = named.kind.data;
            const { latex } = afleidingLatex(c);
            const heeftKeten = (c.deelstappen?.length ?? 0) > 0;
            return (
              <div className="rpt-bet-afleiding">
                <p className="rpt-bet-kopje">
                  {t("report.betonAfleidingKop", "Maatgevende toets, uitgeschreven")}: {c.title}
                </p>
                <div
                  className="rpt-bet-formuleblok"
                  dangerouslySetInnerHTML={{ __html: renderLatexHtml(latex, true) }}
                />
                {heeftKeten && (
                  <p className="rpt-bet-verwijzing">
                    {t("report.betonKetenVerwijzing", {
                      defaultValue:
                        "De volledige afleiding van deze toets — {{aantal}} stappen, elk met formule, ingevulde waarden, vindplaats en de aannamen die eronder liggen — staat in het hoofdstuk “Toetsing per staaf”, op het gedetailleerde niveau.",
                      aantal: c.deelstappen.length,
                    })}
                  </p>
                )}
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
              rekken. Die dragen de inhoud en horen niet weggelaten te worden.

              De vormaannamen staan hier NIET meer bij: die staan al één keer
              in het blok hierboven, woordelijk. Ze hier per toets herhalen zou
              dezelfde alinea drie keer in één staafblok zetten. Het filter
              vergelijkt op de tekst uit `shape_assumptions`, dus het is precies
              dezelfde string en geen benadering. */}
          {(() => {
            const aannamen = new Set(r.shape_assumptions);
            const overige = r.checks.flatMap((named) =>
              named.kind.data.notes
                .filter((n) => !aannamen.has(n))
                .map((n, i) => ({ id: `${named.id}-${i}`, titel: named.kind.data.title, n })),
            );
            if (overige.length === 0) return null;
            return (
              <ul className="rpt-bet-notes">
                {overige.map((o) => (
                  <li key={o.id}>
                    <em>{o.titel}:</em> {o.n}
                  </li>
                ))}
              </ul>
            );
          })()}
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
 *
 * TWEE PUNTEN HANGEN AF VAN DE BEREKENING. Zodra er fysisch niet-lineair
 * gerekend is (analysetype "2e orde + fysisch"), is 5.8 niet meer overgeslagen
 * en komen N_Ed en M_Ed niet meer uit een eerste-orde-berekening; en dan hoort
 * de kruipvermelding van besluit B1 hier woordelijk zoals de rekenkern hem
 * geeft. Zie [`nietGetoetst`].
 */
interface Beperking {
  artikel: string;
  key: string;
  nl: string;
  /**
   * Tekst die WOORDELIJK uit de rekenkern komt en dus niet door een vertaling
   * vervangen mag worden. Een tweede versie van een verplichte waarschuwing is
   * een tweede waarheid.
   */
  letterlijk?: boolean;
}

/** De punten vóór het tweede-orde-punt. */
const NIET_GETOETST_VOOR: Beperking[] = [
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
];

/** Tussen het tweede-orde-punt en het kruippunt. */
const NIET_GETOETST_MIDDEN: Beperking[] = [
  {
    artikel: "5.2 / 5.9",
    key: "report.betonNietImperfecties",
    nl: "Geometrische imperfecties en kip van slanke liggers.",
  },
];

/** De punten ná het kruippunt. */
const NIET_GETOETST_NA: Beperking[] = [
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
      "De minimale dekking c_min bij een milieuklasse wordt WÉL aan de norm getoetst, " +
      "maar bij de invoer en niet in deze staaftoetsing: de profielkiezer en het " +
      "tabblad Norm leggen de opgegeven c_nom naast c_min,dur uit tabel 4.4N (in de " +
      "versie van de nationale bijlage) en de aanhechtingseis van tabel 4.2. Die " +
      "uitkomst staat niet in dit rapport, en zonder gekozen milieuklasse is er geen " +
      "toets. Buiten beschouwing blijven bovendien: de constructieklasse volgens " +
      "tabel 4.3N (die is invoer en wordt niet afgeleid), de toeslag bij een " +
      "korrelafmeting groter dan 32 mm, oneffen oppervlakken (4.4.1.2(11)) en de " +
      "afslijtingsklassen XM1 tot en met XM3.",
  },
  {
    artikel: "6.8",
    key: "report.betonNietVermoeiing",
    nl: "Vermoeiing. Brandwerendheid (EN 1992-1-2) evenmin.",
  },
];

/**
 * De volledige lijst, met de twee punten die van de gedraaide berekening
 * afhangen op hun plaats.
 *
 * `fysisch` = er is met het analysetype "2e orde + fysisch" gerekend en er
 * staat een segmentspoor van de rekenkern. Dan is 5.8 niet overgeslagen maar
 * uitgevoerd — met de algemene methode van 5.8.6 — en zou de oude tekst ("N_Ed
 * en M_Ed komen uit de eerste-orde-berekening") onwaar zijn. `creepNote` is de
 * verplichte vermelding van besluit B1, woordelijk uit het kernantwoord: hier
 * niet geherformuleerd, want dan zouden er twee versies van dezelfde
 * waarschuwing bestaan.
 */
function nietGetoetst(fysisch: boolean, creepNote: string | null): Beperking[] {
  const tweedeOrde: Beperking = fysisch
    ? {
        artikel: "5.8",
        key: "report.betonTweedeOrdeGedaan",
        nl:
          "Tweede-orde-effecten bij aanwezigheid van axiale belastingen zijn WÉL " +
          "meegenomen: de krachtsverdeling is bepaald met de algemene methode van " +
          "5.8.6 — geometrisch én fysisch niet-lineair, met per segment de secante " +
          "buigstijfheid uit het M-N-κ-diagram. N_Ed en M_Ed in deze " +
          "doorsnedetoetsing komen dus uit die berekening en niet uit een " +
          "eerste-orde-berekening. De vereenvoudigde methoden op basis van de " +
          "nominale stijfheid (5.8.7) en de nominale kromming (5.8.8) zijn daarom " +
          "niet gebruikt. De segmenttabellen, het convergentiespoor en de " +
          "uitgangspunten staan in het hoofdstuk “Beton — fysisch " +
          "niet-lineaire tweede orde”.",
      }
    : {
        artikel: "5.8",
        key: "report.betonNietTweedeOrde",
        nl:
          "Tweede-orde-effecten bij aanwezigheid van axiale belastingen. N_Ed en M_Ed komen " +
          "uit de eerste-orde-berekening; er is geen slankheidscriterium, geen methode " +
          "gebaseerd op de nominale stijfheid (5.8.7) en geen methode gebaseerd op de " +
          "nominale kromming (5.8.8). Voor een slanke gedrukte staaf is deze toetsing " +
          "daarmee aan de ONVEILIGE kant.",
      };
  const kruip: Beperking =
    fysisch && creepNote
      ? {
          artikel: "3.1.4 / 5.8.4",
          key: "report.betonKruipVermelding",
          nl: `Kruip en krimp. ${creepNote}`,
          letterlijk: true,
        }
      : {
          artikel: "3.1.4",
          key: "report.betonNietKruip",
          nl:
            "Kruip en krimp. Er wordt met φ = 0 gerekend. In deze doorsnedetoetsing op " +
            "bezwijken speelt kruip geen rol, maar zodra de krachtsverdeling van de kruip " +
            "afhangt (tweede orde, blijvend belaste kolommen) is die aanname niet meer veilig.",
        };
  return [...NIET_GETOETST_VOOR, tweedeOrde, ...NIET_GETOETST_MIDDEN, kruip, ...NIET_GETOETST_NA];
}

/**
 * Wat er bij een T of L bovenop komt.
 *
 * Alleen tonen wanneer er werkelijk een doorsnede met flens in het rapport
 * staat — in een rapport met alleen rechthoeken zijn dit twee alinea's over
 * iets dat er niet is, en dat maakt het blok minder in plaats van meer
 * geloofwaardig.
 *
 * De eerste vindplaats is opgezocht in de norm: **9.2.1.2(1), OPMERKING 2**
 * luidt dat bij tussenopleggingen van doorgaande liggers de totale oppervlakte
 * van de trekwapening A_s van een dwarsdoorsnede met flenzen gespreid behoort
 * te zijn over de meewerkende flensbreedte (zie 5.3.2), en dat een deel ervan
 * geconcentreerd mag zijn over de breedte van het lijf (figuur 9.1). De tweede
 * is 5.3.2.1(4), die letterlijk in `beff.rs` staat.
 */
const NIET_GETOETST_FLENS: Beperking[] = [
  {
    artikel: "9.2.1.2(1)",
    key: "report.betonNietSpreidingTrekwapening",
    nl:
      "De SPREIDING van de trekwapening over de meewerkende flensbreedte. OPMERKING 2 bij " +
      "9.2.1.2(1) zegt dat bij tussenopleggingen van doorgaande liggers de totale " +
      "oppervlakte van de trekwapening A_s van een doorsnede met flenzen gespreid behoort " +
      "te zijn over de meewerkende flensbreedte (zie 5.3.2), waarbij een deel geconcentreerd " +
      "mag zijn over de breedte van het lijf (figuur 9.1). De wapeningskorf in dit model " +
      "kent twee rijen — één boven en één onder, elk over de breedte die op hun eigen hoogte " +
      "aanwezig is — en kan die spreiding dus principieel niet uitdrukken. Boven een " +
      "steunpunt is de getoetste korf daarmee een andere korf dan 9.2.1.2 voorschrijft.",
  },
  {
    artikel: "5.3.2.1(4)",
    key: "report.betonNietBeffPerSegment",
    nl:
      "b_eff springt NIET binnen een staaf. Er is één waarde per staaf gebruikt: die van het " +
      "gebied waarin het staafmidden ligt. 5.3.2.1(4) staat dat toe — “voor constructieve " +
      "berekeningen, waarin geen grote nauwkeurigheid is vereist, mag een constante breedte " +
      "over de gehele overspanning zijn aangenomen” — maar boven een steunpunt is b_eff " +
      "volgens figuur 5.2 aanzienlijk kleiner, en daar is de doorsnede dus TE STIJF gerekend. " +
      "Te stijf geeft te weinig doorbuiging en te weinig tweede-orde-effect: de onveilige " +
      "kant. De gebiedstabel per staaf laat zien hoeveel het scheelt.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
// De sectie
// ═══════════════════════════════════════════════════════════════════════

export default function BetonSection() {
  const { t } = useTranslation("ribbon");
  const results = useCheckStore((s) => s.results);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  // De b_eff-afleiding per staaf, uit dezelfde run als de toetsresultaten.
  const beffUitkomsten = useCheckStore((s) => s.beff);
  const verborgenToetsStaven = useReportStore((s) => s.verborgenToetsStaven);
  const { beams } = useReportData();
  // Is er fysisch niet-lineair gerekend? Zo ja, dan is 5.8 niet overgeslagen
  // en draagt de kern de kruipvermelding van besluit B1 — beide bepalen de
  // tekst van het beperkingenblok hieronder.
  const stijfheidCombinaties = useBetonStijfheidStore((s) => s.combinaties);
  const fysischGerekend = stijfheidCombinaties.length > 0;
  const creepNote = stijfheidCombinaties[0]?.staven[0]?.creep_note ?? null;

  const beton = results.filter(isConcreteCheckResult);
  const getoond = beton.filter((r) => isToetsStaafZichtbaar(verborgenToetsStaven, r.beam_id));
  const weggelaten = beton.length - getoond.length;
  const checkedTime = fmtCheckedAt(lastRunAt);
  // Staat er werkelijk een T of L in dit rapport? Bepaalt of het
  // beperkingenblok de twee flenspunten toont. `shape_assumptions` is leeg bij
  // een rechthoek, dus dat is de directe maat — geen naamvergelijking.
  const heeftFlensDoorsnede = getoond.some((r) => r.shape_assumptions.length > 0);

  return (
    <div className="rpt-block rpt-bet">
      <style>{CHECK_REPORT_CSS}</style>
      <style>{BETON_REPORT_CSS}</style>
      <style>{BEFF_REPORT_CSS}</style>
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
              beff={beffUitkomsten.find((u) => u.beamId === r.beam_id)}
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
              )}{" "}
              {fysischGerekend &&
                t(
                  "report.betonBeperkingenTweedeOrdeUitzondering",
                  "Op één punt na: de tweede-orde-effecten van 5.8 zijn in deze berekening wél meegenomen — zie het punt 5.8 hieronder en het hoofdstuk met de segmenttabellen.",
                )}
            </p>
            <ul className="rpt-bet-beperking-lijst">
              {nietGetoetst(fysischGerekend, creepNote).map((b) => (
                <li key={b.artikel}>
                  <strong>{b.artikel}</strong> — {b.letterlijk ? b.nl : t(b.key, b.nl)}
                </li>
              ))}
              {/* De twee punten die alleen bij een flens spelen. In een rapport
                  met alleen rechthoeken zijn dit alinea's over iets dat er niet
                  is. */}
              {heeftFlensDoorsnede &&
                NIET_GETOETST_FLENS.map((b) => (
                  <li key={b.artikel}>
                    <strong>{b.artikel}</strong> — {t(b.key, b.nl)}
                  </li>
                ))}
              <li>
                <strong>{t("report.betonBeperkingVormLabel", "Toepassingsgebied")}</strong> —{" "}
                {t(
                  "report.betonBeperkingVorm",
                  "een rechthoek b × h, een T of een L, met buiging om de sterke as. Scheve buiging (M_y en M_z samen) en andere doorsnedevormen worden niet getoetst. Bij een T of L rust de berekening bovendien op de aannamen die per staaf bij de doorsnede staan.",
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

/* De verwijzing naar de volledige afleiding: een terzijde, geen kop. */
.rpt-bet-verwijzing {
  margin: 1mm 0 0 6mm;
  font-size: calc(var(--rpt-basis) * 0.78);
  font-style: italic;
  color: #555;
}

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

/* Vormaannamen: geen terzijde maar een voorwaarde waaronder de getallen
   gelden. Een zijbalk in plaats van een kader, zodat het blok binnen het
   staafblok blijft passen en niet met het beperkingenkader concurreert. */
.rpt-bet-aannamen {
  margin: 3mm 0 1mm;
  padding: 1.5mm 0 1.5mm 3mm;
  border-left: 0.6mm solid #64748b;
  background: #f6f7f9;
  break-inside: avoid;
}

.rpt-bet-aannamen .rpt-bet-kopje { margin-top: 0; }

.rpt-bet-aannamen-lijst {
  margin: 0;
  padding-left: 4mm;
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #333;
}
.rpt-bet-aannamen-lijst li { margin-bottom: 1mm; }

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
