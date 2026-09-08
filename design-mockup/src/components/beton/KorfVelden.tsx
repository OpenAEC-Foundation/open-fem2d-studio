/**
 * KorfVelden — de invoervelden van de wapeningskorf, plus de milieuklasse en
 * de dekkingstoets van 4.4.1.
 *
 * WAAROM DIT EEN EIGEN COMPONENT IS
 * Dezelfde korf is nu op twee plaatsen te kiezen: in de profielkiezer, waar je
 * de doorsnede toewijst, en in de staafeigenschappen, waar het M-N-κ-diagram
 * naast de korf staat. Twee invoerschermen voor hetzelfde gegeven is een
 * valkuil — ze lopen uiteen zodra er een veld bijkomt. Daarom is er hier één
 * component en niet twee: beide plaatsen renderen déze velden, schrijven naar
 * hetzelfde veld op de staaf (`checkConfig.betonKorf`) en tonen dus altijd
 * hetzelfde. Wat de profielkiezer NIET heeft is het M-N-κ-diagram; dat is een
 * uitkomst en geen invoer, en hoort bij de eigenschappen.
 *
 * DE DEKKINGSTOETS
 * De opgegeven dekking c_nom wordt live aan de milieuklasse getoetst. Er wordt
 * hier niets gerekend: c_min,dur (tabel 4.4N in de versie van de nationale
 * bijlage), c_min uit (4.2) en de vereiste c_nom uit (4.1) komen uit de
 * rekenkern (`concrete_cover_check`), langs dezelfde weg als de rest van de
 * toetsing. Zonder rekenkern staat er dat de toets niet kon draaien — en géén
 * eigen benadering, want een dekking die de app zelf goedkeurt terwijl de norm
 * hem afkeurt is precies het soort fout dat pas op de bouwplaats opvalt.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExposureClass } from "../../lib/types/concrete/ExposureClass";
import type { ExposureClassInfo } from "../../lib/types/concrete/ExposureClassInfo";
import type { StructuralClass } from "../../lib/types/concrete/StructuralClass";
import type { ConcreteSectionInput } from "../../lib/types/concrete/ConcreteSectionInput";
import type { RebarRow } from "../../lib/types/concrete/RebarRow";
import type { ReinforcementCage } from "../../lib/types/concrete/ReinforcementCage";
import type { ConcreteCoverResponse } from "../../lib/types/concrete/ConcreteCoverResponse";
import { toetsDekking } from "./betonKern";
import {
  BEUGELDIAMETERS,
  CONSTRUCTIEKLASSEN,
  MILIEUKLASSEN,
  STAAFDIAMETERS,
  beugelDwarsafstandMm,
  grootsteStaafdiameterMm,
  maat,
} from "./wapeningskorf";
import "./beton.css";

/** Eén getalveld met label en eenheid. */
export function Getal({
  id,
  label,
  eenheid,
  waarde,
  onChange,
  min,
  max,
  stap,
}: {
  id: string;
  label: string;
  eenheid?: string;
  waarde: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  stap?: number;
}) {
  return (
    <label className="beton-rij" htmlFor={id}>
      <span className="beton-label">{label}</span>
      <span className="beton-invoer-met-eenheid">
        <input
          id={id}
          className="beton-invoer"
          type="number"
          value={Number.isFinite(waarde) ? waarde : ""}
          min={min}
          max={max}
          step={stap ?? 1}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {eenheid && <span className="beton-eenheid">{eenheid}</span>}
      </span>
    </label>
  );
}

/**
 * Eén OPTIONEEL getalveld: leeg betekent "niet opgegeven".
 *
 * Waarom een eigen component naast [`Getal`]: die laatste stuurt bij een lege
 * invoer niets door en houdt dus de vorige waarde vast. Voor de beugelvelden
 * moet leeg juist een betekenis hébben — de norm geeft voor s, n en s_t geen
 * aanbevolen waarde (§9.2.2(6) en (8) geven alleen bovengrenzen), dus elk
 * ingevuld getal is een ontwerpkeuze van de constructeur. Wissen moet daarom
 * `undefined` opleveren en niet 0: nul zou "een beugelafstand van niets"
 * betekenen, en dat is een andere balk dan "onbekend".
 */
export function GetalOptioneel({
  id,
  label,
  eenheid,
  waarde,
  onChange,
  min,
  stap,
  geheel,
}: {
  id: string;
  label: ReactNode;
  eenheid?: string;
  waarde: number | null | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  stap?: number;
  geheel?: boolean;
}) {
  return (
    <label className="beton-rij" htmlFor={id}>
      <span className="beton-label">{label}</span>
      <span className="beton-invoer-met-eenheid">
        <input
          id={id}
          className="beton-invoer"
          type="number"
          placeholder="niet opgegeven"
          value={waarde === null || waarde === undefined ? "" : waarde}
          min={min}
          step={stap ?? 1}
          onChange={(e) => {
            const t = e.target.value.trim();
            if (t === "") {
              onChange(undefined);
              return;
            }
            const v = geheel ? parseInt(t, 10) : parseFloat(t);
            onChange(Number.isFinite(v) ? v : undefined);
          }}
        />
        {eenheid && <span className="beton-eenheid">{eenheid}</span>}
      </span>
    </label>
  );
}

/** Eén rij hoofdwapening: aantal × diameter. */
export function Rij({
  id,
  label,
  rij,
  onChange,
}: {
  id: string;
  label: string;
  rij: RebarRow;
  onChange: (rij: RebarRow) => void;
}) {
  return (
    <div className="beton-rij">
      <span className="beton-label">{label}</span>
      <span className="beton-invoer-groep">
        <input
          id={`${id}-aantal`}
          className="beton-invoer beton-invoer-kort"
          type="number"
          min={0}
          max={30}
          step={1}
          value={rij.count}
          aria-label={`${label}: aantal staven`}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v >= 0) onChange({ ...rij, count: v });
          }}
        />
        <span className="beton-eenheid">×</span>
        <select
          id={`${id}-diameter`}
          className="beton-invoer beton-invoer-kort"
          value={rij.diameter_mm}
          aria-label={`${label}: staafdiameter`}
          onChange={(e) => onChange({ ...rij, diameter_mm: parseFloat(e.target.value) })}
        >
          {STAAFDIAMETERS.map((d) => (
            <option key={d} value={d}>
              Ø{d}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

/**
 * De dekkingstoets uit de kern, met vertraging en bescherming tegen
 * verouderde antwoorden — hetzelfde patroon als het M-κ-diagram in
 * `BetonKorfPaneel`. Zonder milieuklasse wordt er niets gevraagd.
 */
function useDekkingstoets(
  korf: ReinforcementCage,
  milieuklasse: ExposureClass | null,
  constructieklasse: StructuralClass | null,
): { antwoord: ConcreteCoverResponse | null; fout: string | null } {
  const [antwoord, setAntwoord] = useState<ConcreteCoverResponse | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const volgnummer = useRef(0);
  const staafdiameter = grootsteStaafdiameterMm(korf);

  useEffect(() => {
    if (!milieuklasse) {
      setAntwoord(null);
      setFout(null);
      return;
    }
    const nummer = ++volgnummer.current;
    const timer = window.setTimeout(() => {
      toetsDekking({
        beam_id: 0,
        exposure_class: milieuklasse,
        structural_class: constructieklasse,
        cover_mm: korf.cover_mm,
        stirrup_diameter_mm: korf.stirrup_diameter_mm,
        max_bar_diameter_mm: staafdiameter,
      })
        .then((r) => {
          if (nummer !== volgnummer.current) return;
          setAntwoord(r);
          setFout(null);
        })
        .catch((e: unknown) => {
          if (nummer !== volgnummer.current) return;
          setAntwoord(null);
          setFout(e instanceof Error ? e.message : String(e));
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    milieuklasse,
    constructieklasse,
    korf.cover_mm,
    korf.stirrup_diameter_mm,
    staafdiameter,
  ]);

  return { antwoord, fout };
}

interface Props {
  korf: ReinforcementCage;
  onKorfChange: (korf: ReinforcementCage) => void;
  milieuklasse: ExposureClass | null;
  onMilieuklasseChange: (m: ExposureClass | null) => void;
  constructieklasse: StructuralClass | null;
  onConstructieklasseChange: (s: StructuralClass | null) => void;
  /**
   * Tabel 4.1 uit de kern; ontbreekt → alleen de aanduidingen, zonder de
   * omschrijving. De teksten staan bewust niet in de frontend.
   */
  milieuklassen?: ExposureClassInfo[];
  /**
   * De doorsnede, alleen om de afgeleide dwarsafstand s_t te kunnen tónen.
   * Ontbreekt hij, dan blijft dat veld gewoon leeg-met-uitleg.
   */
  doorsnede?: ConcreteSectionInput;
  /** Voorvoegsel voor de veld-id's; nodig omdat de velden op twee plaatsen staan. */
  idPrefix?: string;
}

export default function KorfVelden({
  korf,
  onKorfChange,
  milieuklasse,
  onMilieuklasseChange,
  constructieklasse,
  onConstructieklasseChange,
  milieuklassen,
  doorsnede,
  idPrefix = "beton",
}: Props) {
  const zet = (patch: Partial<ReinforcementCage>) => onKorfChange({ ...korf, ...patch });
  const { antwoord, fout } = useDekkingstoets(korf, milieuklasse, constructieklasse);
  const heeftBeugel = korf.stirrup_diameter_mm > 0;
  // De afgeleide s_t, om te laten zien wat er gebeurt als het veld leeg blijft.
  const stAfgeleid = doorsnede ? beugelDwarsafstandMm(korf, doorsnede) : null;

  // De klassen gegroepeerd zoals tabel 4.1 ze groepeert, zodat de keuzelijst
  // dezelfde indeling heeft als de tabel waaruit je kiest.
  const groepen = useMemo(() => {
    if (!milieuklassen || milieuklassen.length === 0) return null;
    const uit: Array<{ groep: string; klassen: ExposureClassInfo[] }> = [];
    for (const info of milieuklassen) {
      const laatste = uit[uit.length - 1];
      if (laatste && laatste.groep === info.group) laatste.klassen.push(info);
      else uit.push({ groep: info.group, klassen: [info] });
    }
    return uit;
  }, [milieuklassen]);

  const gekozen = milieuklassen?.find((i) => i.class === milieuklasse) ?? null;
  const teDun = antwoord !== null && antwoord.status !== "Ok";

  return (
    <>
      <label className="beton-rij" htmlFor={`${idPrefix}-milieuklasse`}>
        <span className="beton-label">Milieuklasse</span>
        <select
          id={`${idPrefix}-milieuklasse`}
          className="beton-invoer"
          value={milieuklasse ?? ""}
          onChange={(e) =>
            onMilieuklasseChange(e.target.value === "" ? null : (e.target.value as ExposureClass))
          }
        >
          <option value="">— kies —</option>
          {groepen
            ? groepen.map((g) => (
                <optgroup key={g.groep} label={g.groep}>
                  {g.klassen.map((i) => (
                    <option key={i.name} value={i.class}>
                      {i.name} — {i.description}
                    </option>
                  ))}
                </optgroup>
              ))
            : MILIEUKLASSEN.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
        </select>
      </label>
      {gekozen && (
        <div className="beton-hint">
          {gekozen.description}. Voorbeelden uit tabel 4.1: {gekozen.examples.toLowerCase()}.
        </div>
      )}
      {!milieuklasse && (
        <div className="beton-hint">
          Zonder milieuklasse wordt de dekking niet aan de norm getoetst. Tabel 4.1
          van NEN-EN 1992-1-1 beschrijft de klassen; 4.4.1.2 leidt daaruit de
          minimale dekking af.
        </div>
      )}

      <label className="beton-rij" htmlFor={`${idPrefix}-constructieklasse`}>
        <span className="beton-label">Constructieklasse</span>
        <select
          id={`${idPrefix}-constructieklasse`}
          className="beton-invoer"
          value={constructieklasse ?? ""}
          onChange={(e) =>
            onConstructieklasseChange(
              e.target.value === "" ? null : (e.target.value as StructuralClass),
            )
          }
        >
          <option value="">S4 — 50 jaar (nationale bijlage)</option>
          {CONSTRUCTIEKLASSEN.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <Getal
        id={`${idPrefix}-dekking`}
        label="Dekking c_nom"
        eenheid="mm"
        waarde={korf.cover_mm}
        min={0}
        max={100}
        stap={5}
        onChange={(v) => zet({ cover_mm: v })}
      />
      <label className="beton-rij" htmlFor={`${idPrefix}-beugel`}>
        <span className="beton-label">Beugel</span>
        <select
          id={`${idPrefix}-beugel`}
          className="beton-invoer"
          value={korf.stirrup_diameter_mm}
          onChange={(e) => zet({ stirrup_diameter_mm: parseFloat(e.target.value) })}
        >
          {BEUGELDIAMETERS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "geen" : `Ø${d}`}
            </option>
          ))}
        </select>
      </label>

      {/*
        De beugelgegevens voor §6.2.3 (dwarskracht) en §9.2.2 (detaillering).
        Leeg = niet opgegeven; er wordt niets aangenomen. De norm kent hier
        geen standaardwaarde — zij geeft in §9.2.2(6) en (8) alleen
        bovengrenzen — dus elk getal hier is een ontwerpkeuze.
      */}
      {heeftBeugel && (
        <>
          <GetalOptioneel
            id={`${idPrefix}-beugelafstand`}
            label="Beugelafstand s"
            eenheid="mm"
            waarde={korf.stirrup_spacing_mm}
            min={1}
            stap={10}
            onChange={(v) => zet({ stirrup_spacing_mm: v })}
          />
          <GetalOptioneel
            id={`${idPrefix}-beugelbenen`}
            label="Beugelbenen n"
            waarde={korf.stirrup_legs}
            min={1}
            stap={1}
            geheel
            onChange={(v) => zet({ stirrup_legs: v })}
          />
          <GetalOptioneel
            id={`${idPrefix}-beugel-st`}
            label={
              <>
                Dwarsafstand benen s<sub>t</sub>
              </>
            }
            eenheid="mm"
            waarde={korf.stirrup_leg_spacing_mm}
            min={1}
            stap={10}
            onChange={(v) => zet({ stirrup_leg_spacing_mm: v })}
          />
          <GetalOptioneel
            id={`${idPrefix}-beugel-fywk`}
            label={
              <>
                Beugelstaal f<sub>ywk</sub>
              </>
            }
            eenheid="N/mm²"
            waarde={korf.stirrup_fywk_mpa}
            min={1}
            stap={10}
            onChange={(v) => zet({ stirrup_fywk_mpa: v })}
          />
          <div className="beton-hint">
            {(korf.stirrup_spacing_mm ?? null) === null || (korf.stirrup_legs ?? null) === null ? (
              <>
                <strong>Zonder beugelafstand s en aantal benen n kan de dwarskrachttoets
                niet draaien.</strong>{" "}
                A<sub>sw</sub>/s uit (6.8) en ρ<sub>w</sub> uit (9.4) zijn dan onbepaald. De
                norm kent hier geen standaardwaarde — §9.2.2(6) en (8) geven alleen
                bovengrenzen — dus er wordt niets aangenomen.{" "}
              </>
            ) : null}
            De hoek α van de beugels ligt vast op 90° (rechte beugels); §9.2.2(1) laat
            45°–90° toe, maar hellende beugels en opgebogen staven zijn niet
            gemodelleerd. s<sub>t</sub> leeg laten mag:{" "}
            {stAfgeleid?.afgeleid
              ? `bij deze tweebenige beugel volgt s_t = ${maat(stAfgeleid.mm)} mm uit b_w, dekking en beugeldiameter.`
              : "bij een tweebenige beugel leidt de kern hem meetkundig af uit b_w, dekking en beugeldiameter; bij meer benen blijft §9.2.2(8) ongetoetst."}{" "}
            f<sub>ywk</sub> leeg laten betekent: dezelfde staalsoort als de langswapening.
          </div>
        </>
      )}

      <Rij
        id={`${idPrefix}-boven`}
        label="Bovenwapening"
        rij={korf.top}
        onChange={(top) => zet({ top })}
      />
      <Rij
        id={`${idPrefix}-onder`}
        label="Onderwapening"
        rij={korf.bottom}
        onChange={(bottom) => zet({ bottom })}
      />

      {antwoord && (
        <div
          className={teDun ? "beton-fout" : "beton-hint"}
          role={teDun ? "alert" : undefined}
        >
          {teDun ? (
            <>
              <strong>
                Dekking te klein: {maat(antwoord.c_nom_provided_mm)} mm terwijl{" "}
                {maat(antwoord.c_nom_required_mm)} mm nodig is
              </strong>{" "}
              (UC = {antwoord.unity_check.toFixed(2).replace(".", ",")}).{" "}
            </>
          ) : (
            <>
              Dekking in orde: {maat(antwoord.c_nom_provided_mm)} mm ≥{" "}
              {maat(antwoord.c_nom_required_mm)} mm.{" "}
            </>
          )}
          c<sub>min,dur</sub> ={" "}
          {antwoord.c_min_dur_mm === null
            ? "— (tabel 4.4N kent deze klasse niet)"
            : `${maat(antwoord.c_min_dur_mm)} mm`}
          , c<sub>min,b</sub> = {maat(antwoord.c_min_b_mm)} mm → c<sub>min</sub> ={" "}
          {maat(antwoord.c_min_mm)} mm; c<sub>nom</sub> = c<sub>min</sub> + Δc
          <sub>dev</sub> = {maat(antwoord.c_min_mm)} + {maat(antwoord.delta_c_dev_mm)} ={" "}
          {maat(antwoord.c_nom_required_mm)} mm (4.1/4.2, constructieklasse{" "}
          {antwoord.structural_class}
          {antwoord.cover_column ? `, kolom ${antwoord.cover_column}` : ""}).
          <details className="beton-notities">
            <summary>Waar dit vandaan komt</summary>
            <ul>
              {antwoord.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {fout && (
        <div className="beton-hint">
          De dekkingstoets kon niet draaien ({fout}). De dekking is dus niet aan de
          milieuklasse getoetst.
        </div>
      )}
    </>
  );
}
