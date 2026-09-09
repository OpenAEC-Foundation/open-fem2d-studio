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
 *
 * MILIEUKLASSE EN DEKKING PER ZIJDE — hoe de invoer compact blijft
 * 4.4.1.1(1)P meet de dekking tot "het dichtstbijzijnde betonoppervlak", en een
 * element heeft er meer dan één: een vloer kan van boven binnen (XC1) en van
 * onder buiten (XC4) liggen. Dat zijn twee verschillende c_min,dur, twee
 * verschillende dekkingen en dus twee verschillende nuttige hoogtes.
 *
 * De kolom in de app is smal, dus dit mag geen formulier van acht velden
 * worden. De oplossing is een BASIS met UITZONDERINGEN, precies zoals het
 * datamodel het ook doet: bovenaan staan één milieuklasse en één dekking voor
 * het hele element, en die zijn genoeg — verreweg de meeste balken hebben
 * rondom hetzelfde milieu. Wie ze per zijde nodig heeft, klapt "Per zijde"
 * open en krijgt drie regels van elk twee velden; wat leeg blijft, volgt de
 * basis. Zo hoeft niemand vier keer XC1 in te tikken, en is er tegelijk geen
 * enkele zijde die stilzwijgend iets anders krijgt dan er staat. Het paneel
 * klapt vanzelf open als er al iets per zijde is ingevuld, want een verstopte
 * afwijking is erger dan een extra regel.
 *
 * De dekkingstoets draait dan drie keer — één keer per betonoppervlak, want dat
 * is de eenheid van de norm — en de kop toont de zwaarste van de drie.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CoverSide } from "../../lib/types/concrete/CoverSide";
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
  ZIJDEN,
  ZIJDE_KORT,
  ZIJDE_LABEL,
  beugelDwarsafstandMm,
  dekkingVanZijdeMm,
  grootsteStaafdiameterMm,
  maat,
  milieuklasseVanZijde,
  zetZijde,
  zijdeVanKorf,
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
 * De grootste staafdiameter die aan één zijde werkelijk ligt — de maat die de
 * aanhechtingseis c_min,b van tabel 4.2 stelt.
 *
 * Boven telt de bovenwapening, onder de onderwapening; bij de zijkanten de
 * dikste van de twee, want beide rijen raken met hun buitenste staaf de
 * zijkant. Spiegel van `ConcreteBeamCheckInput::cover_requests` in de kern.
 */
function staafdiameterVanZijde(korf: ReinforcementCage, zijde: CoverSide): number {
  if (zijde === "Top") return korf.top.count > 0 ? korf.top.diameter_mm : 0;
  if (zijde === "Bottom") return korf.bottom.count > 0 ? korf.bottom.diameter_mm : 0;
  return grootsteStaafdiameterMm(korf);
}

/** Eén dekkingstoets, met de zijde erbij. */
export interface ZijdeToets {
  zijde: CoverSide;
  antwoord: ConcreteCoverResponse;
}

/**
 * De dekkingstoets uit de kern, met vertraging en bescherming tegen
 * verouderde antwoorden — hetzelfde patroon als het M-κ-diagram in
 * `BetonKorfPaneel`. Zonder milieuklasse wordt er niets gevraagd.
 *
 * De toets draait PER BETONOPPERVLAK. 4.4.1.1(1)P meet de dekking tot "het
 * dichtstbijzijnde betonoppervlak", en (4.2) leidt c_min,dur uit de
 * milieuklasse van dát oppervlak af; drie zijden zijn dus drie verzoeken aan
 * dezelfde rekengang, met de zijde als opschrift. Een zijde zonder klasse —
 * ook niet op het element — levert geen verzoek: dan is er niets te toetsen,
 * en er wordt niets aangenomen.
 */
function useDekkingstoets(
  korf: ReinforcementCage,
  milieuklasse: ExposureClass | null,
  constructieklasse: StructuralClass | null,
): { toetsen: ZijdeToets[]; fout: string | null } {
  const [toetsen, setToetsen] = useState<ZijdeToets[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const volgnummer = useRef(0);

  // De verzoeken als één stabiele sleutel: zo draait het effect alleen als er
  // werkelijk iets aan de invoer verandert, en niet bij elke render.
  const verzoeken = useMemo(
    () =>
      ZIJDEN.flatMap((zijde) => {
        const klasse = milieuklasseVanZijde(korf, zijde, milieuklasse);
        if (!klasse) return [];
        return [
          {
            zijde,
            verzoek: {
              beam_id: 0,
              side: zijde,
              exposure_class: klasse,
              structural_class: constructieklasse,
              cover_mm: dekkingVanZijdeMm(korf, zijde),
              stirrup_diameter_mm: korf.stirrup_diameter_mm,
              max_bar_diameter_mm: staafdiameterVanZijde(korf, zijde),
            },
          },
        ];
      }),
    [korf, milieuklasse, constructieklasse],
  );
  const sleutel = JSON.stringify(verzoeken);

  useEffect(() => {
    const lijst: typeof verzoeken = JSON.parse(sleutel);
    if (lijst.length === 0) {
      setToetsen([]);
      setFout(null);
      return;
    }
    const nummer = ++volgnummer.current;
    const timer = window.setTimeout(() => {
      Promise.all(lijst.map((v) => toetsDekking(v.verzoek)))
        .then((antwoorden) => {
          if (nummer !== volgnummer.current) return;
          setToetsen(antwoorden.map((antwoord, i) => ({ zijde: lijst[i].zijde, antwoord })));
          setFout(null);
        })
        .catch((e: unknown) => {
          if (nummer !== volgnummer.current) return;
          setToetsen([]);
          setFout(e instanceof Error ? e.message : String(e));
        });
    }, 200);
    return () => window.clearTimeout(timer);
    // `sleutel` draagt de hele invoer; `verzoeken` zelf is elke render een
    // nieuw object en zou het effect anders bij elke toetsaanslag opnieuw
    // starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  return { toetsen, fout };
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
  const { toetsen, fout } = useDekkingstoets(korf, milieuklasse, constructieklasse);
  const heeftBeugel = korf.stirrup_diameter_mm > 0;
  // De afgeleide s_t, om te laten zien wat er gebeurt als het veld leeg blijft.
  const stAfgeleid = doorsnede ? beugelDwarsafstandMm(korf, doorsnede) : null;

  // Het zijdepaneel staat open zodra er iets per zijde is ingevuld: een
  // afwijking die verstopt zit achter een dichtgeklapt kopje is erger dan een
  // extra regel in beeld.
  const heeftAfwijkendeZijde = ZIJDEN.some((z) => {
    const eigen = zijdeVanKorf(korf, z);
    return (
      (eigen.cover_mm ?? null) !== null || (eigen.exposure_class ?? null) !== null
    );
  });
  const [zijdenOpen, setZijdenOpen] = useState(heeftAfwijkendeZijde);
  // Wordt er van buitenaf een andere korf gekozen die wél zijden draagt, dan
  // moet het paneel alsnog opengaan; dichtklappen doet de gebruiker zelf.
  useEffect(() => {
    if (heeftAfwijkendeZijde) setZijdenOpen(true);
  }, [heeftAfwijkendeZijde]);

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
  // De maatgevende zijde: de grootste unity check. Die staat in de kop; de
  // andere twee staan in de uitklap eronder, zodat een smalle kolom niet
  // volloopt met drie alinea's.
  const maatgevend =
    toetsen.length === 0
      ? null
      : toetsen.reduce((a, b) => (b.antwoord.unity_check > a.antwoord.unity_check ? b : a));
  const teDun = maatgevend !== null && maatgevend.antwoord.status !== "Ok";

  /** Eén keuzelijst met de milieuklassen van tabel 4.1. */
  const klasseOpties = (leegLabel: string) => (
    <>
      <option value="">{leegLabel}</option>
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
    </>
  );

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
          {klasseOpties("— kies —")}
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

      {/*
        MILIEUKLASSE EN DEKKING PER ZIJDE (4.4.1.1(1)P).

        Dichtgeklapt zolang er niets per zijde is ingevuld: de balk met één
        milieu rondom — het gewone geval — houdt daarmee precies de twee velden
        die hij altijd had. Wie hem openklapt, ziet drie regels van elk twee
        velden; leeg betekent daar "volg het element", en dat staat er ook. Zo
        hoeft niemand vier keer dezelfde klasse in te tikken.
      */}
      <div className="beton-zijden">
        <button
          type="button"
          className="beton-zijden-knop"
          aria-expanded={zijdenOpen}
          aria-controls={`${idPrefix}-zijden`}
          onClick={() => setZijdenOpen((o) => !o)}
        >
          <span aria-hidden="true">{zijdenOpen ? "▾" : "▸"}</span> Per zijde
          {!zijdenOpen && heeftAfwijkendeZijde ? " (afwijkend)" : ""}
        </button>
        {zijdenOpen && (
          <div id={`${idPrefix}-zijden`} className="beton-zijden-lijst">
            {ZIJDEN.map((zijde) => {
              const eigen = zijdeVanKorf(korf, zijde);
              const klasse = milieuklasseVanZijde(korf, zijde, milieuklasse);
              return (
                <div className="beton-zijde-rij" key={zijde}>
                  <span className="beton-zijde-naam" title={ZIJDE_LABEL[zijde]}>
                    {ZIJDE_KORT[zijde]}
                  </span>
                  <select
                    id={`${idPrefix}-zijde-${zijde}-klasse`}
                    className="beton-invoer beton-invoer-zijde"
                    aria-label={`Milieuklasse ${ZIJDE_LABEL[zijde]}`}
                    value={eigen.exposure_class ?? ""}
                    onChange={(e) =>
                      onKorfChange(
                        zetZijde(korf, zijde, {
                          exposure_class:
                            e.target.value === ""
                              ? undefined
                              : (e.target.value as ExposureClass),
                        }),
                      )
                    }
                  >
                    {klasseOpties(milieuklasse ? `= ${milieuklasse}` : "— als element —")}
                  </select>
                  <input
                    id={`${idPrefix}-zijde-${zijde}-dekking`}
                    className="beton-invoer beton-invoer-kort"
                    type="number"
                    min={0}
                    max={200}
                    step={5}
                    placeholder={String(maat(korf.cover_mm))}
                    aria-label={`Dekking ${ZIJDE_LABEL[zijde]} in mm`}
                    value={eigen.cover_mm ?? ""}
                    onChange={(e) => {
                      const t = e.target.value.trim();
                      const v = parseFloat(t);
                      onKorfChange(
                        zetZijde(korf, zijde, {
                          cover_mm: t === "" || !Number.isFinite(v) ? undefined : v,
                        }),
                      );
                    }}
                  />
                  <span className="beton-eenheid">mm</span>
                  <span className="beton-zijde-uitkomst">
                    {klasse ? `${klasse} · ${maat(dekkingVanZijdeMm(korf, zijde))}` : "—"}
                  </span>
                </div>
              );
            })}
            <div className="beton-hint">
              4.4.1.1(1)P meet de dekking tot <em>het dichtstbijzijnde</em>{" "}
              betonoppervlak, dus per zijde. Leeg = die zijde volgt de milieuklasse
              en de dekking van het element hierboven; er wordt niets aangenomen.
              De bovenzijde bepaalt de ligging van de bovenwapening (d₂), de
              onderzijde die van de onderwapening (d), en de zijkanten de
              dwarsafstand van de beugelbenen (§9.2.2(8)) en de vrije staafafstand
              (§8.2). Links en rechts staan niet apart: zij komen in elke formule
              alleen als paar voor (b_w − 2c), dus een splitsing zou geen getal
              veranderen — verschillen ze werkelijk van milieu, neem dan de
              zwaarste. De constructieklasse blijft er één voor het hele element:
              alle vijf de criteria van de door de nationale bijlage vervangen
              tabel 4.3N zijn eigenschappen van het element.
            </div>
          </div>
        )}
      </div>

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

      {/*
        De uitkomst. De kop toont de MAATGEVENDE zijde — de grootste unity
        check — want dat is het getal waarop de balk staat of valt. De hele
        keten per zijde staat eronder in de uitklap; drie alinea's in een
        smalle kolom zou onleesbaar zijn, en de twee niet-maatgevende zijden
        weglaten zou verbergen wat er getoetst is.
      */}
      {maatgevend && (
        <div
          className={teDun ? "beton-fout" : "beton-hint"}
          role={teDun ? "alert" : undefined}
        >
          {teDun ? (
            <>
              <strong>
                Dekking te klein aan de {ZIJDE_LABEL[maatgevend.zijde]}:{" "}
                {maat(maatgevend.antwoord.c_nom_provided_mm)} mm terwijl{" "}
                {maat(maatgevend.antwoord.c_nom_required_mm)} mm nodig is
              </strong>{" "}
              (UC = {maatgevend.antwoord.unity_check.toFixed(2).replace(".", ",")}).{" "}
            </>
          ) : (
            <>
              Dekking in orde{toetsen.length > 1 ? " aan alle zijden" : ""}; maatgevend
              is de {ZIJDE_LABEL[maatgevend.zijde]}:{" "}
              {maat(maatgevend.antwoord.c_nom_provided_mm)} mm ≥{" "}
              {maat(maatgevend.antwoord.c_nom_required_mm)} mm.{" "}
            </>
          )}
          <details className="beton-notities">
            <summary>De keten per zijde (4.1 en 4.2)</summary>
            {toetsen.map(({ zijde, antwoord }) => (
              <div key={zijde} className="beton-zijde-uitleg">
                <strong>{ZIJDE_LABEL[zijde]}</strong> — {antwoord.exposure_class}, c
                <sub>nom</sub> = {maat(antwoord.c_nom_provided_mm)} mm. c
                <sub>min,dur</sub> ={" "}
                {antwoord.c_min_dur_mm === null
                  ? "— (tabel 4.4N kent deze klasse niet)"
                  : `${maat(antwoord.c_min_dur_mm)} mm`}
                , c<sub>min,b</sub> = {maat(antwoord.c_min_b_mm)} mm → c<sub>min</sub> ={" "}
                {maat(antwoord.c_min_mm)} mm; c<sub>nom,vereist</sub> = c<sub>min</sub> +
                Δc<sub>dev</sub> = {maat(antwoord.c_min_mm)} +{" "}
                {maat(antwoord.delta_c_dev_mm)} = {maat(antwoord.c_nom_required_mm)} mm
                (constructieklasse {antwoord.structural_class}
                {antwoord.cover_column ? `, kolom ${antwoord.cover_column}` : ""}, UC ={" "}
                {antwoord.unity_check.toFixed(2).replace(".", ",")}).
                <ul>
                  {antwoord.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
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
