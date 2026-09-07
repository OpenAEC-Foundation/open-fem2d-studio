/**
 * BetonStijfheidSection — de fysisch niet-lineaire tweede orde in het rapport:
 * per betonstaaf de segmentindeling, de secante buigstijfheid per segment en
 * het spoor waarmee een constructeur de berekening kan navertellen.
 *
 * WAAROM DIT EEN EIGEN HOOFDSTUK IS EN NIET EEN BLOK IN BetonSection
 * ------------------------------------------------------------------
 * `BetonSection` gaat over de DOORSNEDE: de korf, het M-κ-diagram en het
 * N-M-interactiediagram van de toetsing. Die sectie leest de `checkStore` en
 * staat er ook zonder tweede orde. Dit hoofdstuk gaat over de
 * KRACHTSVERDELING: het bestaat alleen wanneer er met het analysetype
 * "tweede orde, geometrisch én fysisch niet-lineair" gerekend is, het is per
 * BELASTINGCOMBINATIE ingedeeld in plaats van per staaf, en het leest een
 * andere bron (`betonStijfheidStore`). Twee verschillende onderwerpen, twee
 * verschillende bronnen, twee verschillende levensduren — dus twee
 * hoofdstukken, elk met een eigen schakelaar in de zijbalk. Wie de
 * doorsnedetoetsing wil zonder de tientallen segmentregels, kan dat dan ook
 * krijgen.
 *
 * PER COMBINATIE, NOOIT EEN OMHULLENDE
 * ------------------------------------
 * De stijfheid volgt uit de krachten van één belastingtoestand, dus elke
 * combinatie heeft haar eigen EI-verdeling en superpositie is in dit pad
 * dubbel ongeldig (geometrisch én fysisch). Een "omhullende stijfheid"
 * bestaat niet. Staat de combinatiekeuze van het rapport op één combinatie,
 * dan toont dit hoofdstuk die; staat hij op de omhullende of op automatisch,
 * dan staan ze er allemaal — met die reden erbij.
 *
 * ALLES WAT DE KERN ZEGT, KOMT HIER TERECHT
 * -----------------------------------------
 * De verplichte kruipvermelding (besluit B1), de gebruikte variant per segment
 * (besluit B2), de indelingsregel, de meldingen over geklemde segmenten,
 * relaxatie en overschrijding van ε_cu1: die teksten komen woordelijk uit het
 * kernantwoord (`creep_note`, `notes`, `message`) en worden hier niet
 * geherformuleerd. Een geklemde waarde die stilzwijgend in de tabel staat is
 * een verzonnen antwoord.
 */
import { useTranslation } from "react-i18next";
import { useBetonStijfheidStore, type StijfheidCombinatie } from "../../../stores/betonStijfheidStore";
import { useReportStore } from "../../../stores/reportStore";
import { ANALYSETYPE_OMSCHRIJVING } from "../../fem/femTypes";
import type { SegmentStiffness } from "../../../lib/types/concrete/SegmentStiffness";
import type { SegmentStiffnessResponse } from "../../../lib/types/concrete/SegmentStiffnessResponse";
import EiVerloopGrafiek from "../../beton/EiVerloopGrafiek";
import { RAPPORT_KLEUREN } from "../../beton/tekenkleuren";
// `nl` houdt het aantal decimalen VAST (min = max). In een kolom getallen is
// dat het verschil tussen 1,000 en 1: alleen met vaste decimalen staan de
// komma's onder elkaar en is te zien hoe nauwkeurig een waarde is.
import { nl } from "../../beton/wapeningskorf";
import { CHECK_REPORT_CSS, fmtCheckedAt, fmtValue } from "../checkReportUtils";

// ═══════════════════════════════════════════════════════════════════════
// Hulpjes
// ═══════════════════════════════════════════════════════════════════════

/** Korte aanduiding van de variant per segment (besluit B2). */
function variantKort(basis: SegmentStiffness["basis"]): string {
  return basis === "DesignValues" ? "UGT" : "BGT";
}

/**
 * De ingrepen van de kern op één segment, als korte merktekens. Leeg wanneer
 * er niets bijzonders is; de volledige melding staat onder de tabel.
 */
function merktekens(s: SegmentStiffness): string[] {
  const uit: string[] = [];
  if (s.clamped) uit.push("geklemd");
  if (s.relaxed) uit.push("gerelaxeerd");
  if (s.beyond_eps_cu1) uit.push("ε_cu1 overschreden");
  if (s.method === "Bisection") uit.push("insluiting");
  if (s.status === "Failed") uit.push("geen stijfheid");
  return uit;
}

/** De grootste relatieve verandering van de laatste ronde over alle staven. */
function maxVerandering(c: StijfheidCombinatie): { waarde: number | null; staaf: number | null; segment: number | null } {
  let waarde: number | null = null;
  let staaf: number | null = null;
  let segment: number | null = null;
  for (const r of c.staven) {
    if (r.max_relative_change === null) continue;
    if (waarde === null || r.max_relative_change > waarde) {
      waarde = r.max_relative_change;
      staaf = r.beam_id;
      segment = r.governing_segment;
    }
  }
  return { waarde, staaf, segment };
}

/** Zeggen alle staven van de kern dat de laatste ronde geconvergeerd is? */
function geconvergeerd(c: StijfheidCombinatie): boolean {
  return c.staven.length > 0 && c.staven.every((r) => r.converged);
}

// ═══════════════════════════════════════════════════════════════════════
// Eén staaf: figuur, segmenttabel en de meldingen van de kern
// ═══════════════════════════════════════════════════════════════════════

function StaafBlok({ r }: { r: SegmentStiffnessResponse }) {
  const { t } = useTranslation("ribbon");
  const eiRef = r.ei_uncracked_knm2;
  const gescheurdAantal = r.segments.filter((s) => s.cracked === true).length;
  /** De laagste EI van de staaf — de maatgevende plek in de figuur. */
  const laagsteEi = r.segments.reduce<number | null>((min, s) => {
    if (s.ei_knm2 === null) return min;
    return min === null || s.ei_knm2 < min ? s.ei_knm2 : min;
  }, null);
  const meldingen = r.segments
    .map((s) => ({ s, m: s.message }))
    .filter((x): x is { s: SegmentStiffness; m: string } => typeof x.m === "string" && x.m.length > 0);

  return (
    <div className="rpt-eis-staaf">
      <p className="rpt-eis-staafkop">
        {t("report.colBeam", "Staaf")} {r.beam_id} — {r.section_name} ({r.concrete_class},{" "}
        {r.reinforcement_grade}) · {r.reinforcement_summary}
      </p>
      <p className="rpt-eis-staafmeta">
        L = {fmtValue(r.length_m, 3)} m · {r.segment_count}{" "}
        {t("report.eisSegmenten", "segmenten")} van {nl(r.segment_length_mm, 1)} mm ·{" "}
        f<sub>c</sub> = {nl(r.f_c_mpa, 2)} N/mm² · E<sub>c</sub> = {nl(r.e_c_mpa, 0)} N/mm² ·
        f<sub>ctm</sub> = {nl(r.f_ctm_mpa, 2)} N/mm² · E<sub>c</sub>·I<sub>c</sub> ={" "}
        {nl(eiRef, 0)} kNm² · {r.limit_state_label}
      </p>

      <div className="rpt-figuur rpt-eis-figuur">
        <EiVerloopGrafiek
          className="rpt-figuur-svg rpt-eis-svg"
          segmenten={r.segments.map((s) => ({
            xStartMm: s.x_start_mm,
            xEndMm: s.x_end_mm,
            eiKnm2: s.ei_knm2,
            gescheurd: s.cracked,
            geklemd: s.clamped,
          }))}
          eiOngescheurdKnm2={eiRef}
          lengteMm={r.length_m * 1000}
          kleuren={RAPPORT_KLEUREN}
          titel={`Buigstijfheid EI langs staaf ${r.beam_id}, met de ongescheurde E_c·I_c als referentielijn`}
        />
        <div className="rpt-figuur-bijschrift">
          {t("report.eisFiguurBijschrift", {
            defaultValue:
              "Buigstijfheid EI per segment langs staaf {{staaf}}. De streeplijn is de ongescheurde E_c·I_c = {{ei0}} kNm²; {{gescheurd}} van de {{totaal}} segmenten is gescheurd. Laagste waarde {{min}} kNm² ({{factor}}·E_c·I_c).",
            staaf: r.beam_id,
            ei0: fmtValue(eiRef, 0),
            gescheurd: gescheurdAantal,
            totaal: r.segment_count,
            min: laagsteEi === null ? "—" : nl(laagsteEi, 0),
            factor: laagsteEi !== null && eiRef > 0 ? nl(laagsteEi / eiRef, 2) : "—",
          })}
        </div>
      </div>

      <table className="rpt-table rpt-eis-tabel">
        <thead>
          <tr>
            <th>#</th>
            <th>x [m]</th>
            <th>
              N<sub>Ed</sub> [kN]
            </th>
            <th>
              M<sub>Ed</sub> [kNm]
            </th>
            <th>M₀ [kNm]</th>
            <th>
              M<sub>cr</sub> [kNm]
            </th>
            <th>κ [10⁻³/m]</th>
            <th>EI [kNm²]</th>
            <th>
              EI / E<sub>c</sub>I<sub>c</sub>
            </th>
            <th>ΔEI [%]</th>
            <th>{t("report.eisToestand", "Toestand")}</th>
            <th>{t("report.eisVariant", "Variant")}</th>
          </tr>
        </thead>
        <tbody>
          {r.segments.map((s) => {
            const marks = merktekens(s);
            return (
              <tr
                key={s.index}
                className={`${s.cracked ? "rpt-eis-rij-gescheurd" : ""}${
                  s.clamped || s.status === "Failed" ? " rpt-eis-rij-let-op" : ""
                }`}
              >
                <td className="rpt-num">{s.index + 1}</td>
                <td className="rpt-num">
                  {nl(s.x_start_mm / 1000, 2)}–{nl(s.x_end_mm / 1000, 2)}
                </td>
                <td className="rpt-num">{s.n_ed_kn === null ? "—" : nl(s.n_ed_kn, 1)}</td>
                <td className="rpt-num">{s.m_ed_knm === null ? "—" : nl(s.m_ed_knm, 2)}</td>
                <td className="rpt-num">{s.m0_knm === null ? "—" : nl(s.m0_knm, 2)}</td>
                <td className="rpt-num">{s.m_cr_knm === null ? "—" : nl(s.m_cr_knm, 2)}</td>
                <td className="rpt-num">
                  {s.kappa_per_m === null ? "—" : nl(s.kappa_per_m * 1e3, 3)}
                </td>
                <td className="rpt-num">{s.ei_knm2 === null ? "—" : nl(s.ei_knm2, 0)}</td>
                <td className="rpt-num">
                  {s.ei_knm2 === null || !(eiRef > 0) ? "—" : nl(s.ei_knm2 / eiRef, 3)}
                </td>
                <td className="rpt-num">
                  {s.relative_change === null ? "—" : nl(100 * s.relative_change, 2)}
                </td>
                <td>
                  {s.cracked === null
                    ? "—"
                    : s.cracked
                      ? t("report.eisGescheurd", "gescheurd")
                      : t("report.eisOngescheurd", "ongescheurd")}
                  {s.zeta !== null && <> · ζ = {nl(s.zeta, 2)}</>}
                  {marks.length > 0 && <span className="rpt-eis-mark"> · {marks.join(", ")}</span>}
                </td>
                <td>{variantKort(s.basis)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="rpt-eis-uitleg">
        {r.limit_state === "DesignValues"
          ? t(
              "report.eisUgtToelichting",
              "In deze variant zegt de kolom Toestand alleen of |M_Ed| boven het scheurmoment |M_cr| ligt. De stijfheid zelf wordt in beide gevallen zonder betontrek bepaald (5.8.6(5)): zodra er trek in de doorsnede optreedt ligt EI daarom onder E_c·I_c, ook bij een segment dat als ongescheurd staat aangemerkt, terwijl een segment waarin de normaalkracht de hele doorsnede op druk houdt vlak bij E_c·I_c blijft.",
            )
          : t(
              "report.eisBgtToelichting",
              "In deze variant interpoleert ζ van (7.19) tussen de ongescheurde en de volledig gescheurde toestand (7.4.3): ζ = 0 is ongescheurd, ζ → 1 volledig gescheurd.",
            )}{" "}
        {t(
          "report.eisRatioBoven1",
          "Een verhouding boven 1 kan voorkomen: E_c·I_c is alleen de bruto betondoorsnede, terwijl de wapening in de ongescheurde toestand meedraagt.",
        )}{" "}
        {t("report.eisM0Uitleg", {
          defaultValue:
            "M₀ is het moment bij κ = 0. Het moment wordt om de geometrische middenvezel h/2 genomen en niet om het plastisch zwaartepunt, dus bij een asymmetrische wapeningskorf onder druk is M(κ = 0) niet nul; de secans is daarom EI = (M_Ed − M₀)/κ en niet M_Ed/κ. De kolom EI / E_cI_c zet die stijfheid af tegen de ongescheurde E_c·I_c = {{ei0}} kNm² — in de uiterste grenstoestand een vergelijkingswaarde en geen rekenwaarde, want 5.8.6(5) laat de betontrek weg en dan bestaat er geen ongescheurde tak.",
          ei0: fmtValue(eiRef, 0),
        })}
      </p>

      {(r.notes.length > 0 || meldingen.length > 0) && (
        <ul className="rpt-eis-notes">
          {r.notes.map((n, i) => (
            <li key={`n${i}`}>{n}</li>
          ))}
          {meldingen.map(({ s, m }) => (
            <li key={`m${s.index}`} className="rpt-eis-note-let-op">
              <strong>
                {t("report.eisSegment", "Segment")} {s.index + 1}
              </strong>{" "}
              — {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Eén combinatie: uitgangspunten, convergentie en de staven
// ═══════════════════════════════════════════════════════════════════════

function CombinatieBlok({ c, segmentLengteMm }: { c: StijfheidCombinatie; segmentLengteMm: number }) {
  const { t } = useTranslation("ribbon");
  const eerste = c.staven[0];
  const conv = geconvergeerd(c);
  const { waarde, staaf, segment } = maxVerandering(c);
  const tolerantie = eerste?.convergence_tolerance ?? null;
  const geklemd = c.staven.reduce((n, r) => n + r.clamped_count, 0);

  return (
    <div className="rpt-eis-combi">
      <h3 className="rpt-h3">
        {t("report.eisCombinatieKop", "Combinatie")} {c.combinatieNaam} —{" "}
        {eerste ? eerste.limit_state_label : variantKort(c.grenstoestand)}
      </h3>

      <table className="rpt-table rpt-eis-uitgangspunten">
        <tbody>
          <tr>
            <th>{t("report.eisAnalysetype", "Analysetype")}</th>
            <td>{ANALYSETYPE_OMSCHRIJVING.tweedeOrdeFysisch}</td>
          </tr>
          <tr>
            <th>{t("report.eisGrenstoestand", "Grenstoestand en diagram")}</th>
            <td>{eerste ? eerste.limit_state_label : "—"}</td>
          </tr>
          <tr>
            <th>{t("report.eisSegmentlengte", "Segmentlengte")}</th>
            <td>
              {t("report.eisSegmentlengteWaarde", {
                defaultValue:
                  "gewenst {{doel}} mm; werkelijk {{echt}} mm ({{aantal}} segmenten op de langste staaf). Indelingsregel: {{regel}}",
                doel: nl(segmentLengteMm, 0),
                echt: eerste ? nl(eerste.segment_length_mm, 1) : "—",
                aantal: c.staven.reduce((n, r) => Math.max(n, r.segment_count), 0),
                regel: eerste ? eerste.segmentation_rule : "—",
              })}
            </td>
          </tr>
          <tr>
            <th>{t("report.eisRonden", "Aantal ronden")}</th>
            <td>
              {t("report.eisRondenWaarde", {
                defaultValue:
                  "{{n}} raamwerkoplossing(en) na de segmentindeling (ronde 0). Elke ronde: oplossen, per segment (N, M) naar de rekenkern, nieuwe EI terug. De tabellen hieronder tonen de LAATSTE ronde — de krachten waarmee is opgelost, en de EI die daaruit volgt; die wijkt hoogstens de tolerantie af van de EI waarmee diezelfde krachten zijn bepaald.",
                n: c.ronden,
              })}
            </td>
          </tr>
          <tr>
            <th>{t("report.eisCriterium", "Convergentiecriterium")}</th>
            <td>
              max |ΔEI| / max(|EI|, |EI<sub>vorig</sub>|) ≤{" "}
              {tolerantie === null ? "—" : `${nl(100 * tolerantie, 2)} %`}
              {" — "}
              <span className={conv ? "rpt-eis-ok" : "rpt-eis-nok"}>
                {waarde === null
                  ? t("report.eisGeenMaat", "geen maat beschikbaar")
                  : t("report.eisGehaald", {
                      defaultValue:
                        "gehaald: {{waarde}} % in de laatste ronde (staaf {{staaf}}, segment {{segment}})",
                      waarde: nl(100 * waarde, 3),
                      staaf: staaf ?? "—",
                      segment: segment === null ? "—" : segment + 1,
                    })}
                {conv
                  ? ` — ${t("report.eisGeconvergeerd", "geconvergeerd")}`
                  : ` — ${t("report.eisNietGeconvergeerd", "NIET geconvergeerd")}`}
              </span>
            </td>
          </tr>
          <tr>
            <th>{t("report.eisVerloop", "Verloop per ronde")}</th>
            <td>
              {c.verloop.length === 0
                ? "—"
                : c.verloop
                    .map((v) =>
                      v.maxRelatieveVerandering === null
                        ? `${v.ronde}: —`
                        : `${v.ronde}: ${nl(100 * v.maxRelatieveVerandering, 3)} %`,
                    )
                    .join(" · ")}
            </td>
          </tr>
          <tr>
            <th>{t("report.eisRelaxatie", "Onderrelaxatie ω / ondergrens EI")}</th>
            <td>
              ω = {eerste ? nl(eerste.relaxation, 3) : "—"} ·{" "}
              {t("report.eisOndergrens", "ondergrens")} EI ={" "}
              {eerste ? nl(eerste.min_ei_knm2, 0) : "—"} kNm²
              {eerste && eerste.ei_uncracked_knm2 > 0 && (
                <> ({nl((100 * eerste.min_ei_knm2) / eerste.ei_uncracked_knm2, 1)} % van E<sub>c</sub>·I<sub>c</sub>)</>
              )}
              {geklemd > 0 && (
                <span className="rpt-eis-nok">
                  {" "}
                  — {t("report.eisGeklemd", {
                    defaultValue:
                      "{{n}} segment(en) op die ondergrens geklemd; een geklemde waarde is een numerieke ondergrens en geen rekenuitkomst.",
                    n: geklemd,
                  })}
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th>{t("report.eisKruip", "Kruip")}</th>
            <td>
              φ<sub>ef</sub> = {eerste ? nl(eerste.phi_ef, 2) : "—"}
              {eerste && <span className="rpt-eis-kruip"> — {eerste.creep_note}</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {c.staven.map((r) => (
        <StaafBlok key={r.beam_id} r={r} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// De sectie
// ═══════════════════════════════════════════════════════════════════════

export default function BetonStijfheidSection() {
  const { t } = useTranslation("ribbon");
  const combinaties = useBetonStijfheidStore((s) => s.combinaties);
  const overgeslagen = useBetonStijfheidStore((s) => s.overgeslagen);
  const segmentLengteMm = useBetonStijfheidStore((s) => s.segmentLengteMm);
  const berekendOp = useBetonStijfheidStore((s) => s.berekendOp);
  const resultCombo = useReportStore((s) => s.resultCombo);

  // Combinatiekeuze: één gekozen combinatie als die fysisch gerekend is,
  // anders alle. Een omhullende bestaat hier niet — zie de kop van dit
  // bestand.
  const gekozen =
    typeof resultCombo === "number"
      ? combinaties.filter((c) => c.combinatieId === resultCombo)
      : [];
  const getoond = gekozen.length > 0 ? gekozen : combinaties;
  const alle = getoond.length === combinaties.length && combinaties.length > 1;
  const berekendTijd = fmtCheckedAt(berekendOp);

  return (
    <div className="rpt-block rpt-eis">
      <style>{CHECK_REPORT_CSS}</style>
      <style>{EIS_REPORT_CSS}</style>
      <h2 className="rpt-h2">
        {t("report.sectionBetonStijfheid", "Beton — fysisch niet-lineaire tweede orde")}
      </h2>

      {combinaties.length === 0 ? (
        <p className="rpt-empty-note">
          {t(
            "report.eisNietGerekend",
            'Er is niet fysisch niet-lineair gerekend. Dit hoofdstuk vult zich zodra het analysetype "2e orde + fysisch" is gekozen én het model betonstaven met een wapeningskorf bevat; de segmentstijfheden komen dan uit de rekenkern.',
          )}
        </p>
      ) : (
        <>
          <p className="rpt-note">
            {berekendTijd && `${t("report.eisBerekendOp", "Berekend op")} ${berekendTijd}. `}
            {t(
              "report.eisMethodeNoot",
              "Methode: de algemene methode van NEN-EN 1992-1-1 5.8.6. Elke betonstaaf is in segmenten geknipt en in het midden van elk segment (5.8.6(6)) is aan evenwicht en compatibiliteit voldaan; daaruit volgt per segment de kromming κ bij de gevonden (N_Ed, M_Ed) en de secante buigstijfheid EI = (M_Ed − M₀)/κ, waarmee het raamwerk opnieuw wordt opgelost tot de stijfheden niet meer veranderen. Tekenconventie: N positief is trek, M positief is trek in de onderste vezel.",
            )}{" "}
            {t(
              "report.eisGeenOmhullende",
              "De stijfheid volgt uit de krachten van één belastingtoestand, dus elke combinatie heeft haar eigen EI-verdeling en er bestaat geen omhullende stijfheid: superpositie is in dit pad geometrisch én fysisch ongeldig.",
            )}{" "}
            {alle &&
              t("report.eisAlleCombinaties", {
                defaultValue:
                  "Alle {{n}} fysisch gerekende combinaties staan hieronder; kies in de zijbalk één combinatie om alleen die te tonen.",
                n: combinaties.length,
              })}
          </p>

          {overgeslagen.length > 0 && (
            <div className="rpt-eis-overgeslagen">
              <p>
                {t("report.eisOvergeslagenKop", {
                  defaultValue:
                    "{{n}} betonstaaf/-staven rekende NIET fysisch niet-lineair mee en hield de ongescheurde stijfheid E_cm·I_c van de bruto doorsnede — voor die staven is de uitkomst die van de tweede orde P-Δ alleen:",
                  n: overgeslagen.length,
                })}
              </p>
              <ul>
                {overgeslagen.map((o) => (
                  <li key={o.beamId}>
                    {t("report.colBeam", "Staaf")} {o.beamId} — {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {getoond.map((c) => (
            <CombinatieBlok key={c.combinatieId} c={c} segmentLengteMm={segmentLengteMm} />
          ))}
        </>
      )}
    </div>
  );
}

/** Stijlen van dit hoofdstuk — vaste papieropmaak, zoals de andere secties. */
const EIS_REPORT_CSS = `
.rpt-eis-combi { margin: 0 0 6mm; }

.rpt-eis-uitgangspunten {
  font-size: calc(var(--rpt-basis) * 0.82);
  margin: 2mm 0 3mm;
  break-inside: avoid;
}
.rpt-eis-uitgangspunten th {
  white-space: nowrap;
  text-align: left;
  font-weight: 600;
  width: 34%;
  vertical-align: top;
}

.rpt-eis-ok { color: #166534; }
.rpt-eis-nok { color: #b91c1c; font-weight: 600; }
.rpt-eis-kruip { color: #7c2d12; }

.rpt-eis-staaf { margin: 3mm 0 5mm; }

.rpt-eis-staafkop {
  font-size: calc(var(--rpt-basis) * 0.9);
  font-weight: 600;
  margin: 0 0 0.5mm;
  color: #222;
  break-after: avoid;
}

.rpt-eis-staafmeta {
  font-size: calc(var(--rpt-basis) * 0.78);
  color: #444;
  margin: 0 0 2mm;
}

.rpt-eis-figuur { margin: 2mm 0 3mm; break-inside: avoid; }

.rpt-eis-svg {
  display: block;
  width: 160mm;
  max-width: 100%;
  height: auto;
}

.rpt-eis-tabel { font-size: calc(var(--rpt-basis) * 0.76); }
.rpt-eis-tabel th { white-space: nowrap; }
.rpt-eis-tabel td.rpt-num { white-space: nowrap; }

/* Gescheurde segmenten: licht getint, zodat het beeld van de tabel hetzelfde
   verhaal vertelt als de figuur erboven — ook in grijstinten. */
.rpt-eis-rij-gescheurd td { background: #f3ede4; }
/* Een ingreep van de kern (klem, geen stijfheid) mag niet wegvallen. */
.rpt-eis-rij-let-op td { color: #7f1d1d; font-weight: 600; }

.rpt-eis-mark { font-style: italic; }

.rpt-eis-uitleg {
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #333;
  margin: 1.5mm 0 0;
}

.rpt-eis-notes {
  margin: 2mm 0 0;
  padding-left: 4mm;
  font-size: calc(var(--rpt-basis) * 0.78);
  color: #444;
}
.rpt-eis-notes li { margin-bottom: 0.7mm; }
.rpt-eis-note-let-op { color: #7f1d1d; }

.rpt-eis-overgeslagen {
  margin: 2mm 0 3mm;
  padding: 2mm 3mm;
  border-left: 0.6mm solid #b45309;
  background: #fdf6ec;
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #333;
}
.rpt-eis-overgeslagen p { margin: 0 0 1mm; }
.rpt-eis-overgeslagen ul { margin: 0; padding-left: 4mm; }
`;
