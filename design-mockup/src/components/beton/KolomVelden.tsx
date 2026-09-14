/**
 * KolomVelden — de invoer van §5.8 voor een betonnen staaf: geschoord of
 * ongeschoord, de kniklengte, de kruipcoëfficiënt, de twee keuzen die §9.5
 * nodig heeft, en de gegevens om de TWEEDE as voor §5.8.9.
 *
 * WAAROM SCHORING DE EERSTE VRAAG IS
 * §5.8.1 definieert geschoord twee keer letterlijk als iets dat "in de
 * berekeningen is aangenomen", en niet als een eigenschap van de constructie:
 * een raamwerk met een windverband ziet er in dit 2D-model niet anders uit dan
 * hetzelfde raamwerk zonder. Er is daarom géén standaardwaarde. Wie niets
 * kiest, krijgt geen toets maar een melding met de reden — en dat is beter dan
 * een groene kolom die in werkelijkheid twee keer zo slank is.
 *
 * Dat het uitmaakt is geen theorie. Dezelfde kolom van 300 × 300 mm over 3 m
 * met 600 kN druk krijgt geschoord (figuur 5.7 a) λ_lim ≈ 63 en ongeschoord als
 * console (figuur 5.7 b) λ_lim ≈ 20 bij een λ die van 35 naar 69 gaat: bijna
 * een factor tien in de unity check.
 *
 * WAAROM DE KNIKLENGTE UIT FIGUUR 5.7 KOMT
 * §5.8.3.2 kent vier wegen naar l₀. Twee ervan — (5.15) voor een geschoord en
 * (5.16) voor een ongeschoord raamwerk — vragen k = (θ/M)·(EI/l) per staafeind,
 * mét het effect van scheurvorming in de verhinderende elementen
 * (§5.8.3.2(5)). Dat getal is uit een raamwerkmodel niet af te lezen, en een k
 * die de app zelf zou verzinnen stuurt l₀ recht evenredig — onzichtbaar.
 *
 * Daarom staan hier de vijf vakjes van figuur 5.7 met een VASTE l₀, plus "l₀
 * zelf opgeven" voor wie (5.15), (5.16) of (5.17) heeft doorgerekend. Zes
 * keuzen, en een constructeur herkent ze alle vijf uit de tekening.
 *
 * DE LIJST VOLGT DE SCHORING
 * Elk vakje van figuur 5.7 hoort bij één van de twee: a), c) en d) tekenen een
 * bovenste einde dat zijdelings wordt gehouden, b), e) en g) niet. De kern
 * WEIGERT een tegenspraak (geval b) met "geschoord" levert een leesbare fout en
 * geen getal). Dit scherm laat die tegenspraak niet ontstaan: kiezen van de
 * schoring bepaalt welke vakjes er te kiezen zijn, en wisselt de schoring, dan
 * springt de kniklengte mee naar het eerste geval van de nieuwe lijst. De
 * weigering in de kern blijft staan voor de andere twee wegen (toetsbrug en
 * MCP), die dit scherm niet gebruiken.
 *
 * TWEE ASSEN
 * De eerste drie velden gelden voor de as waarin dit model rekent: buiging om
 * de y-as, in het vlak van het raamwerk. Een kolom heeft ook een tweede as en
 * knikt daar even goed om uit — de raamwerkoplosser levert M_z = 0, maar de
 * imperfectie van art. 5.2 en het tweede-orde-effect om z hangen niet van het
 * model af. Daarom vraagt het blok "Om de z-as" een EIGEN schoring en
 * kniklengte voor die richting (een kolom kan in het vlak geschoord zijn en er
 * loodrecht op niet) en een extern M₀Edz met nul als beginwaarde. Blijven de
 * twee keuzen leeg, dan neemt de kern die van het vlak over en zegt dat in het
 * rapport. Ook hier mag geen tegenspraak ontstaan: `maakZConsistent` in
 * `kolomgegevens.ts` houdt het vakje om z bij de schoring om z.
 */
import type { Beugelzone } from "../../lib/types/concrete/Beugelzone";
import type { ConcreteColumnInput } from "../../lib/types/concrete/ConcreteColumnInput";
import type { Knikgeval } from "../../lib/types/concrete/Knikgeval";
import type { Kniklengtekeuze } from "../../lib/types/concrete/Kniklengtekeuze";
import type { Overlappingssituatie } from "../../lib/types/concrete/Overlappingssituatie";
import type { Schoring } from "../../lib/types/concrete/Schoring";
// De figuur 5.7-gevallen en de regel die een tegenspraak voorkomt staan in
// een module ZONDER React: het zijn uitspraken over de norm en geen
// schermlogica, en een test moet ze kunnen aanroepen zonder DOM en zonder de
// CSS-import die een component meebrengt. Dezelfde scheiding als
// `wapeningskorf.ts` naast `KorfVelden.tsx`.
import {
  effectieveSchoringZ,
  knikgevallenVoor,
  kniklengtePastBij,
  kniklengteVoorSchoring,
  l0FactorVan,
  maakZConsistent,
} from "./kolomgegevens";
import { Getal, GetalOptioneel } from "./KorfVelden";
import "./beton.css";

/**
 * De sleutel waarmee één keuze in de keuzelijst staat.
 *
 * Eén `<select>` draagt twee soorten keuze: een vakje van figuur 5.7 en "l₀
 * zelf opgeven". Een `value` is altijd een string, dus de eerste soort krijgt
 * het geval achter een voorvoegsel mee. Twee keuzelijsten zouden hetzelfde
 * kunnen, maar dan zou de gebruiker eerst een SOORT moeten kiezen voordat hij
 * ziet wat er te kiezen valt.
 */
function sleutelVan(keuze: Kniklengtekeuze | undefined): string {
  if (keuze === undefined) return "";
  return keuze.soort === "Opgegeven" ? "Opgegeven" : `Figuur57:${keuze.geval}`;
}

function keuzeVanSleutel(v: string, lengteMm: number): Kniklengtekeuze | undefined {
  if (v === "") return undefined;
  if (v === "Opgegeven") return { soort: "Opgegeven", l0_m: Math.round(lengteMm) / 1000 };
  return { soort: "Figuur57", geval: v.slice("Figuur57:".length) as Knikgeval };
}

function toonM(mm: number): string {
  return (mm / 1000).toFixed(2).replace(".", ",");
}

interface Props {
  /** De huidige §5.8-gegevens; `undefined` = niet opgegeven. */
  waarde: ConcreteColumnInput | undefined;
  /** `undefined` wist het blok en daarmee de hele §5.8-toets. */
  onChange: (k: ConcreteColumnInput | undefined) => void;
  /** Systeemlengte van de staaf in mm, om l₀ = factor·l te kunnen tónen. */
  lengteMm: number;
  /**
   * Is de staaf overwegend verticaal (≥ 75° t.o.v. de horizontaal)? Alleen
   * voor de toelichting: of §5.8 werkelijk van toepassing is, beslist de kern
   * uit de normaalDRUK en niet uit de meetkunde.
   */
  overwegendVerticaal: boolean;
  idPrefix?: string;
}

export default function KolomVelden({
  waarde,
  onChange,
  lengteMm,
  overwegendVerticaal,
  idPrefix = "kolom",
}: Props) {
  // Elke wijziging loopt door `maakZConsistent`: het vakje om z mag nooit in
  // tegenspraak raken met de schoring om z — ook niet als de gebruiker de
  // schoring in het VLAK wisselt terwijl z die overneemt.
  const zet = (patch: Partial<ConcreteColumnInput>) => {
    if (!waarde) return;
    onChange(maakZConsistent({ ...waarde, ...patch }));
  };

  const kiesSchoring = (s: Schoring | null) => {
    if (s === null) {
      onChange(undefined);
      return;
    }
    onChange(
      maakZConsistent({
        bracing: s,
        buckling_length: kniklengteVoorSchoring(waarde?.buckling_length, s),
        ...(waarde?.phi_inf_t0 !== undefined ? { phi_inf_t0: waarde.phi_inf_t0 } : {}),
        ...(waarde?.stirrup_zone !== undefined ? { stirrup_zone: waarde.stirrup_zone } : {}),
        ...(waarde?.lap_situation !== undefined ? { lap_situation: waarde.lap_situation } : {}),
        ...(waarde?.bracing_z !== undefined ? { bracing_z: waarde.bracing_z } : {}),
        ...(waarde?.buckling_length_z !== undefined
          ? { buckling_length_z: waarde.buckling_length_z }
          : {}),
        ...(waarde?.m0_edz_knm !== undefined ? { m0_edz_knm: waarde.m0_edz_knm } : {}),
      }),
    );
  };

  const gevallen = waarde ? knikgevallenVoor(waarde.bracing) : [];
  const keuze = waarde?.buckling_length;
  // l₀ zoals de gebruiker hem hier kiest, alleen om te TONEN. Gerekend wordt er
  // in de Rust-kern; deze regel mag daar nooit een tweede bron naast worden.
  const l0Van = (k: Kniklengtekeuze | undefined): number | null =>
    k === undefined
      ? null
      : k.soort === "Opgegeven"
        ? k.l0_m * 1000
        : (l0FactorVan(k.geval) ?? 0) * lengteMm;
  const l0Mm = l0Van(keuze);

  // De tweede as: wat er WERKELIJK geldt, ook als de velden leeg zijn.
  const schoringZ = waarde ? effectieveSchoringZ(waarde) : undefined;
  const gevallenZ = schoringZ ? knikgevallenVoor(schoringZ) : [];
  const keuzeZ = waarde?.buckling_length_z ?? waarde?.buckling_length;
  const l0zMm = l0Van(keuzeZ);

  return (
    <>
      <label className="beton-rij" htmlFor={`${idPrefix}-schoring`}>
        <span className="beton-label">Schoring</span>
        <select
          id={`${idPrefix}-schoring`}
          className="beton-invoer"
          value={waarde?.bracing ?? ""}
          onChange={(e) =>
            kiesSchoring(e.target.value === "" ? null : (e.target.value as Schoring))
          }
        >
          <option value="">— niet opgegeven, §5.8 wordt niet getoetst —</option>
          <option value="Geschoord">
            Geschoord — draagt NIET bij aan de horizontale stabiliteit
          </option>
          <option value="Ongeschoord">
            Ongeschoord (schorend) — draagt WEL bij aan de stabiliteit
          </option>
        </select>
      </label>

      {!waarde && (
        <div className="beton-hint">
          Geschoord of ongeschoord is een ontwerpbesluit (art. 5.8.1) en wordt niet
          uit het model afgeleid: een raamwerk mét windverband ziet er hier niet
          anders uit dan hetzelfde raamwerk zonder. Zonder deze keuze blijft de
          slankheidsgrens van 5.8.3.1 ongetoetst, met die reden in het rapport.
          {overwegendVerticaal &&
            " Deze staaf staat vrijwel verticaal; draagt hij normaaldruk, dan is 5.8 op hem van toepassing."}
        </div>
      )}

      {waarde && (
        <>
          <label className="beton-rij" htmlFor={`${idPrefix}-knikgeval`}>
            <span className="beton-label">Kniklengte l₀</span>
            <select
              id={`${idPrefix}-knikgeval`}
              className="beton-invoer"
              value={sleutelVan(waarde.buckling_length)}
              onChange={(e) => {
                const k = keuzeVanSleutel(e.target.value, lengteMm);
                if (k) zet({ buckling_length: k });
              }}
            >
              {gevallen.map((g) => (
                <option key={g.geval} value={`Figuur57:${g.geval}`}>
                  {g.label}
                </option>
              ))}
              <option value="Opgegeven">l₀ zelf opgeven…</option>
            </select>
          </label>

          {waarde.buckling_length.soort === "Opgegeven" && (
            <Getal
              id={`${idPrefix}-l0`}
              label="l₀"
              eenheid="m"
              waarde={waarde.buckling_length.l0_m}
              min={0}
              stap={0.1}
              onChange={(v) => zet({ buckling_length: { soort: "Opgegeven", l0_m: v } })}
            />
          )}

          <div className="beton-hint">
            {l0Mm !== null && lengteMm > 0 && (
              <>
                l₀ = {toonM(l0Mm)} m bij een vrije lengte l = {toonM(lengteMm)} m.{" "}
              </>
            )}
            De gevallen f) en g) van figuur 5.7 — gedeeltelijke inklemming — staan
            er niet bij: die vragen de relatieve flexibiliteit k = (θ/M)·(EI/l) van
            elk staafeind, die uit een raamwerkmodel niet is af te lezen. Reken
            (5.15) of (5.16) zelf door en kies dan "l₀ zelf opgeven".
          </div>

          {/* GetalOptioneel en niet Getal: leeg moet hier een BETEKENIS hebben.
              De norm kent voor φ(∞,t₀) geen aanbevolen waarde — hij volgt uit
              art. 3.1.4 met de luchtvochtigheid, h₀, de cementklasse en t₀ — en
              een 0 zou "geen kruip" betekenen, wat een andere kolom is dan
              "kruip onbekend". */}
          <GetalOptioneel
            id={`${idPrefix}-phi`}
            label="φ(∞,t₀)"
            eenheid="–"
            waarde={waarde.phi_inf_t0}
            min={0}
            stap={0.1}
            onChange={(v) => zet({ phi_inf_t0: v })}
          />
          <div className="beton-hint">
            Eindwaarde van de kruipcoëfficiënt volgens art. 3.1.4. Leeg = niet
            opgegeven; art. 3.1.4 wordt hier niet gerekend, want dat vraagt de
            relatieve luchtvochtigheid, de fictieve dikte h₀, de cementklasse en de
            ouderdom t₀ bij eerste belasting. Zonder deze waarde blijft φ_ef
            onbekend en rekent 5.8.3.1(1) met A = 0,7 — dat is niet de veilige
            kant maar de waarde bij φ_ef ≈ 2,14. Om de z-as wordt e₂ dan zonder
            kruip bepaald, en ook dat meldt het rapport.
          </div>

          {/* ── De tweede as ─────────────────────────────────────────── */}
          <div className="beton-groep-kop">Om de z-as (loodrecht op het vlak) — art. 5.8.9</div>

          <label className="beton-rij" htmlFor={`${idPrefix}-schoring-z`}>
            <span className="beton-label">Schoring om z</span>
            <select
              id={`${idPrefix}-schoring-z`}
              className="beton-invoer"
              value={waarde.bracing_z ?? ""}
              onChange={(e) =>
                zet({
                  bracing_z:
                    e.target.value === "" ? undefined : (e.target.value as Schoring),
                })
              }
            >
              <option value="">
                — gelijk aan in het vlak ({waarde.bracing.toLowerCase()}) —
              </option>
              <option value="Geschoord">Geschoord om z</option>
              <option value="Ongeschoord">Ongeschoord (schorend) om z</option>
            </select>
          </label>

          <label className="beton-rij" htmlFor={`${idPrefix}-knikgeval-z`}>
            <span className="beton-label">Kniklengte l₀,z</span>
            <select
              id={`${idPrefix}-knikgeval-z`}
              className="beton-invoer"
              value={sleutelVan(waarde.buckling_length_z)}
              onChange={(e) => zet({ buckling_length_z: keuzeVanSleutel(e.target.value, lengteMm) })}
            >
              {/* "Gelijk aan in het vlak" is alleen te kiezen als de keuze
                  van het vlak bij de schoring om z past; anders zou dit
                  scherm een tegenspraak aanbieden die de kern weigert. */}
              {schoringZ !== undefined && kniklengtePastBij(waarde.buckling_length, schoringZ) && (
                <option value="">— gelijk aan in het vlak —</option>
              )}
              {gevallenZ.map((g) => (
                <option key={g.geval} value={`Figuur57:${g.geval}`}>
                  {g.label}
                </option>
              ))}
              <option value="Opgegeven">l₀,z zelf opgeven…</option>
            </select>
          </label>

          {waarde.buckling_length_z?.soort === "Opgegeven" && (
            <Getal
              id={`${idPrefix}-l0-z`}
              label="l₀,z"
              eenheid="m"
              waarde={waarde.buckling_length_z.l0_m}
              min={0}
              stap={0.1}
              onChange={(v) => zet({ buckling_length_z: { soort: "Opgegeven", l0_m: v } })}
            />
          )}

          <Getal
            id={`${idPrefix}-m0edz`}
            label="M₀Ed,z extern"
            eenheid="kNm"
            waarde={waarde.m0_edz_knm ?? 0}
            stap={1}
            onChange={(v) => zet({ m0_edz_knm: v })}
          />

          <div className="beton-hint">
            {l0zMm !== null && lengteMm > 0 && <>l₀,z = {toonM(l0zMm)} m. </>}
            De raamwerkoplosser rekent in één vlak en levert M_z = 0, maar een kolom
            knikt ook om de z-as: de imperfectie van art. 5.2 (θ₀ = 1/300, nationale
            bijlage) en het tweede-orde-effect in die richting hangen niet van het
            model af. De kern rekent daarom altijd M_Ed,z = M₀Ed,z + N_Ed·(e_i + e₂)
            uit, toetst hem aan M_Rd,z met de staven op hun plaats over de breedte,
            en gaat dan art. 5.8.9 na: mogen de richtingen apart ((5.38a) en
            (5.38b)), en zo niet, dan de interactie (5.39). De schoring en de
            kniklengte om z zijn EIGEN gegevens — een kolom kan in het vlak
            geschoord zijn en er loodrecht op niet; leeg = de keuze van het vlak
            wordt overgenomen, met die melding in het rapport. M₀Ed,z extern is een
            eerste-orde-moment om z uit een ruimtelijk model of een handberekening;
            0 = geen.
          </div>

          {/* ── §9.5 ──────────────────────────────────────────────────── */}
          <label className="beton-rij" htmlFor={`${idPrefix}-zone`}>
            <span className="beton-label">Beugelzone</span>
            <select
              id={`${idPrefix}-zone`}
              className="beton-invoer"
              value={waarde.stirrup_zone ?? ""}
              onChange={(e) =>
                zet({
                  stirrup_zone:
                    e.target.value === "" ? undefined : (e.target.value as Beugelzone),
                })
              }
            >
              <option value="">— niet opgegeven, s_cl,tmax wordt niet getoetst —</option>
              <option value="Regulier">Regulier — volle s_cl,tmax van 9.5.3(3)</option>
              <option value="BijBalkOfPlaat">
                Bij een balk of plaat — 9.5.3(4)i, ×0,6
              </option>
              <option value="BijOverlappingslas">
                Bij een overlappingslas met Ø &gt; 14 mm — 9.5.3(4)ii, ×0,6
              </option>
            </select>
          </label>

          <label className="beton-rij" htmlFor={`${idPrefix}-lassen`}>
            <span className="beton-label">Overlappingslassen</span>
            <select
              id={`${idPrefix}-lassen`}
              className="beton-invoer"
              value={waarde.lap_situation ?? ""}
              onChange={(e) =>
                zet({
                  lap_situation:
                    e.target.value === ""
                      ? undefined
                      : (e.target.value as Overlappingssituatie),
                })
              }
            >
              <option value="">— niet opgegeven, A_s,max wordt niet getoetst —</option>
              <option value="GeenLassen">Geen lassen — A_s,max = 0,08·A_c</option>
              <option value="LassenBuitenDezeDoorsnede">
                Lassen elders in de kolom — A_s,max = 0,04·A_c
              </option>
              <option value="TerPlaatseVanLas">
                Ter plaatse van een las — A_s,max = 0,08·A_c
              </option>
            </select>
          </label>

          <div className="beton-hint">
            Deze twee keuzen horen bij art. 9.5. Ze worden niet aangenomen: de
            reguliere beugelzone en "geen lassen" zijn allebei de RUIMSTE tak, en
            die stilzwijgend aanhouden zou een te grote beugelafstand of een te
            zware wapening kunnen goedkeuren. Blijven ze leeg, dan komen s_cl,tmax
            en A_s,max als niet-uitgevoerd in het rapport, met de reden.
          </div>

          <div className="beton-hint">
            Art. 9.5.2(4) (een staaf in iedere hoek) en 9.5.3(6) (elke hoekstaaf
            opgesloten, geen staaf verder dan 150 mm van een opgesloten staaf)
            worden getoetst met de ligging van elke staaf uit de korf — ook de
            zijstaven. A_s in ω en in 9.5.2 is de TOTALE langswapening.
          </div>
        </>
      )}
    </>
  );
}
