/**
 * ZoneEditor — waar de wapening begint en waar zij ophoudt.
 *
 * ── WAAROM HIJ HIER STAAT EN NIET IN DE KORFEDITOR ─────────────────────────
 *
 * De korfeditor (`WapeningskorfEditor`) beschrijft de DOORSNEDE: dekking,
 * beugel, hoeveel staven boven en onder. Daar is geen lengte-as, en dus geen
 * beeld waarin een maat van 1500 mm ergens op slaat — wie daar zones zou
 * intypen, typt blind. Hier ligt de aanzicht ernaast: je zet de aanwijzer op de
 * plaats waar de momentenlijn ruimte laat, splitst daar, haalt staven uit één
 * helft, en ziet het trapje meteen op de goede plaats verschijnen. Dat is de
 * reden dat de zone-invoer in DIT venster hoort.
 *
 * ── WAT DE KNOPPEN DOEN, EN WAT ZE MET OPZET NIET DOEN ─────────────────────
 *
 * "Zones aanmaken" zet één zone per zijde over de volle lengte neer — een
 * indeling die rekenkundig NIETS verandert (zie `standaardZonesUitKorf`). Het
 * openzetten van de lengte-as is dus geen ingreep in de constructie; pas
 * splitsen en staven weghalen is dat. Een knop die meteen een staffeling
 * verzint, zou wapening in het model zetten die niemand heeft ingevoerd.
 *
 * "Splits op de aanwijzer" knipt de zone waar de aanwijzer staat in tweeën, met
 * in beide helften nog dezelfde staven. "Samenvoegen" trekt een zone over haar
 * rechterbuur heen; de velden van de LINKER blijven staan, want anders zou de
 * knop stilzwijgend kiezen welke van twee wapeningen wint.
 *
 * Er wordt niets gerepareerd. Een indeling met een gat of een overlap wordt
 * gemeld en niet dichtgetrokken — zie `controleerZones`, dat de regels van
 * `ReinforcementZones::validate` in de rekenkern spiegelt. Zolang de melding
 * er staat, wordt er geen nieuwe dekkingslijn opgevraagd: de kern zou hem toch
 * weigeren, en een oude lijn naast een nieuwe indeling zetten is erger dan
 * geen lijn.
 */
import { useTranslation } from "react-i18next";
import type { ConcreteSectionInput } from "../../../lib/types/concrete/ConcreteSectionInput";
import type { LongitudinalZone } from "../../../lib/types/concrete/LongitudinalZone";
import type { ReinforcementCage } from "../../../lib/types/concrete/ReinforcementCage";
import type { ReinforcementZones } from "../../../lib/types/concrete/ReinforcementZones";
import type { Staafvorm } from "../../../lib/types/concrete/Staafvorm";
import type { StirrupZone } from "../../../lib/types/concrete/StirrupZone";
import type { Stortpositie } from "../../../lib/types/concrete/Stortpositie";
import { STAAFDIAMETERS, BEUGELDIAMETERS, maat, type Wapeningskorf } from "../wapeningskorf";
import {
  controleerZones,
  splitsOpX,
  standaardZonesUitKorf,
  voegSamenMetRechts,
  zonesZijnLeeg,
} from "./zoneModel";

/**
 * De uitvoeringsgegevens die §8.4 per staaf wil hebben en die uit geen enkel
 * modelgegeven volgen — zie de doc-tekst van `LongitudinalZone`.
 */
// Label en hint zijn i18n-sleutels (naamruimte "check"); vertaald bij het tonen.
const STAAFVORMEN: { id: Staafvorm; label: string; hint: string }[] = [
  { id: "Recht", label: "concrete.zones.shapeStraight", hint: "concrete.zones.shapeStraightHint" },
  {
    id: "AndersDanRecht",
    label: "concrete.zones.shapeBent",
    hint: "concrete.zones.shapeBentHint",
  },
];

const STORTPOSITIES: { id: Stortpositie; label: string }[] = [
  { id: "Onderzijde", label: "concrete.zones.castingGood" },
  { id: "Bovenzijde", label: "concrete.zones.castingPoor" },
  { id: "Glijbekisting", label: "concrete.zones.castingSlipForm" },
  { id: "GoedAangetoond", label: "concrete.zones.castingProvenGood" },
];

interface Props {
  zones: ReinforcementZones | undefined;
  /** De korf van de staaf; de basis waarop de zones hun rijen overschrijven. */
  korf: ReinforcementCage;
  doorsnede: ConcreteSectionInput;
  /** De overige korfvelden, alleen om `controleerKorf` te kunnen aanroepen. */
  restKorf: Omit<Wapeningskorf, "korf" | "doorsnede">;
  lengteMm: number;
  /** De aangewezen snede; `null` = geen aanwijzer, dan kan er niet gesplitst. */
  cursorXMm: number | null;
  onChange: (zones: ReinforcementZones | undefined) => void;
}

export default function ZoneEditor({
  zones,
  korf,
  doorsnede,
  restKorf,
  lengteMm,
  cursorXMm,
  onChange,
}: Props) {
  const { t } = useTranslation("check");
  const leeg = zonesZijnLeeg(zones);
  const fout = controleerZones(zones, korf, doorsnede, lengteMm, restKorf);

  if (leeg) {
    return (
      <div className="dek-zones dek-zones-leeg">
        <p className="beton-hint">
          {t("concrete.zones.noZonesHint")}
        </p>
        <button
          type="button"
          className="dek-knop dek-knop-primair"
          onClick={() => onChange(standaardZonesUitKorf(korf, lengteMm))}
          title={t("concrete.zones.createTitle")}
        >
          {t("concrete.zones.create")}
        </button>
      </div>
    );
  }

  const z = zones as ReinforcementZones;

  const zetLangs = (i: number, patch: Partial<LongitudinalZone>) =>
    onChange({
      ...z,
      longitudinal: z.longitudinal.map((k, j) => (j === i ? { ...k, ...patch } : k)),
    });
  const zetBeugel = (i: number, patch: Partial<StirrupZone>) =>
    onChange({ ...z, stirrups: z.stirrups.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  const splits = (soort: "langs" | "beugel", i: number) => {
    if (cursorXMm === null) return;
    const nieuw = splitsOpX(z, soort, i, Math.round(cursorXMm));
    if (nieuw) onChange(nieuw);
  };
  const samen = (soort: "langs" | "beugel", i: number) => {
    const nieuw = voegSamenMetRechts(z, soort, i);
    if (nieuw) onChange(nieuw);
  };

  /** Ligt de aanwijzer binnen deze zone, zodat splitsen zin heeft? */
  const kanSplitsen = (k: { x_start_mm: number; x_end_mm: number }) =>
    cursorXMm !== null && cursorXMm > k.x_start_mm + 1 && cursorXMm < k.x_end_mm - 1;

  const splitsTitel =
    cursorXMm === null
      ? t("concrete.zones.splitTitle")
      : t("concrete.zones.splitTitleAt", { x: maat(Math.round(cursorXMm)) });
  const splitsBeugelTitel =
    cursorXMm === null
      ? t("concrete.zones.splitStirrupTitle")
      : t("concrete.zones.splitStirrupTitleAt", { x: maat(Math.round(cursorXMm)) });

  return (
    <div className="dek-zones">
      <div className="dek-zones-kop">
        <span className="dek-zones-titel">{t("concrete.zones.longitudinalTitle")}</span>
        <button
          type="button"
          className="dek-knop"
          onClick={() => onChange(undefined)}
          title={t("concrete.zones.removeTitle")}
        >
          {t("concrete.zones.remove")}
        </button>
      </div>

      <table className="dek-zonetabel">
        <thead>
          <tr>
            <th>{t("concrete.zones.colSide")}</th>
            <th>n</th>
            <th>Ø</th>
            <th>{t("concrete.zones.colFrom")}</th>
            <th>{t("concrete.zones.colTo")}</th>
            <th>{t("concrete.zones.colBarEnds")}</th>
            <th>{t("concrete.zones.colCasting")}</th>
            <th aria-label={t("concrete.zones.colActions")} />
          </tr>
        </thead>
        <tbody>
          {z.longitudinal.map((k, i) => (
            <tr key={`l${i}`}>
              <td>
                <select
                  className="beton-invoer beton-invoer-kort"
                  value={k.side}
                  onChange={(e) => zetLangs(i, { side: e.target.value as LongitudinalZone["side"] })}
                >
                  <option value="Bottom">{t("concrete.zones.sideBottom")}</option>
                  <option value="Top">{t("concrete.zones.sideTop")}</option>
                </select>
              </td>
              <td>
                <input
                  className="beton-invoer beton-invoer-kort"
                  type="number"
                  min={0}
                  step={1}
                  value={k.row.count}
                  title={t("concrete.zones.countTitle")}
                  onChange={(e) =>
                    zetLangs(i, { row: { ...k.row, count: Math.max(0, Math.round(Number(e.target.value))) } })
                  }
                />
              </td>
              <td>
                <select
                  className="beton-invoer beton-invoer-kort"
                  value={k.row.diameter_mm}
                  onChange={(e) => zetLangs(i, { row: { ...k.row, diameter_mm: Number(e.target.value) } })}
                >
                  {STAAFDIAMETERS.map((d) => (
                    <option key={d} value={d}>{`Ø${d}`}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="beton-invoer beton-invoer-kort"
                  type="number"
                  step={10}
                  value={afgerond(k.x_start_mm)}
                  onChange={(e) => zetLangs(i, { x_start_mm: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className="beton-invoer beton-invoer-kort"
                  type="number"
                  step={10}
                  value={afgerond(k.x_end_mm)}
                  onChange={(e) => zetLangs(i, { x_end_mm: Number(e.target.value) })}
                />
              </td>
              <td>
                <select
                  className="beton-invoer"
                  style={{ width: 92 }}
                  value={k.bar_shape}
                  title={(() => {
                    const vorm = STAAFVORMEN.find((v) => v.id === k.bar_shape);
                    return vorm ? t(vorm.hint) : undefined;
                  })()}
                  onChange={(e) => zetLangs(i, { bar_shape: e.target.value as Staafvorm })}
                >
                  {STAAFVORMEN.map((v) => (
                    <option key={v.id} value={v.id}>
                      {t(v.label)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  className="beton-invoer"
                  style={{ width: 132 }}
                  value={k.casting_position}
                  title={t("concrete.zones.castingTitle")}
                  onChange={(e) => zetLangs(i, { casting_position: e.target.value as Stortpositie })}
                >
                  {STORTPOSITIES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {t(v.label)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="dek-zone-acties">
                <button
                  type="button"
                  className="dek-knop"
                  disabled={!kanSplitsen(k)}
                  onClick={() => splits("langs", i)}
                  title={splitsTitel}
                >
                  {t("concrete.zones.split")}
                </button>
                <button
                  type="button"
                  className="dek-knop"
                  onClick={() => samen("langs", i)}
                  title={t("concrete.zones.mergeTitle")}
                >
                  {t("concrete.zones.merge")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dek-zones-kop">
        <span className="dek-zones-titel">{t("concrete.zones.stirrupsTitle")}</span>
        <button
          type="button"
          className="dek-knop"
          onClick={() =>
            onChange({
              ...z,
              stirrups:
                z.stirrups.length > 0
                  ? []
                  : standaardZonesUitKorf(korf, lengteMm).stirrups,
            })
          }
          title={t("concrete.zones.stirrupToggleTitle")}
        >
          {z.stirrups.length > 0
            ? t("concrete.zones.stirrupZonesRemove")
            : t("concrete.zones.stirrupZonesFromCage")}
        </button>
      </div>

      {z.stirrups.length === 0 ? (
        <p className="beton-hint">
          {t("concrete.zones.noStirrupZonesHint")}
        </p>
      ) : (
        <table className="dek-zonetabel">
          <thead>
            <tr>
              <th>{t("concrete.zones.colFrom")}</th>
              <th>{t("concrete.zones.colTo")}</th>
              <th>s [mm]</th>
              <th>{t("concrete.zones.colLegs")}</th>
              <th>Ø</th>
              <th aria-label={t("concrete.zones.colActions")} />
            </tr>
          </thead>
          <tbody>
            {z.stirrups.map((k, i) => (
              <tr key={`b${i}`}>
                <td>
                  <input
                    className="beton-invoer beton-invoer-kort"
                    type="number"
                    step={10}
                    value={afgerond(k.x_start_mm)}
                    onChange={(e) => zetBeugel(i, { x_start_mm: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="beton-invoer beton-invoer-kort"
                    type="number"
                    step={10}
                    value={afgerond(k.x_end_mm)}
                    onChange={(e) => zetBeugel(i, { x_end_mm: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="beton-invoer beton-invoer-kort"
                    type="number"
                    step={10}
                    min={1}
                    value={afgerond(k.spacing_mm)}
                    title={t("concrete.zones.spacingTitle")}
                    onChange={(e) => zetBeugel(i, { spacing_mm: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="beton-invoer beton-invoer-kort"
                    type="number"
                    min={1}
                    step={1}
                    value={k.legs}
                    title={t("concrete.zones.legsTitle")}
                    onChange={(e) => zetBeugel(i, { legs: Math.max(1, Math.round(Number(e.target.value))) })}
                  />
                </td>
                <td>
                  <select
                    className="beton-invoer beton-invoer-kort"
                    value={k.diameter_mm}
                    onChange={(e) => zetBeugel(i, { diameter_mm: Number(e.target.value) })}
                  >
                    {BEUGELDIAMETERS.filter((d) => d > 0).map((d) => (
                      <option key={d} value={d}>{`Ø${d}`}</option>
                    ))}
                  </select>
                </td>
                <td className="dek-zone-acties">
                  <button
                    type="button"
                    className="dek-knop"
                    disabled={!kanSplitsen(k)}
                    onClick={() => splits("beugel", i)}
                    title={splitsBeugelTitel}
                  >
                    {t("concrete.zones.split")}
                  </button>
                  <button
                    type="button"
                    className="dek-knop"
                    onClick={() => samen("beugel", i)}
                    title={t("concrete.zones.mergeStirrupTitle")}
                  >
                    {t("concrete.zones.merge")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {fout && <div className="beton-fout dek-zonefout">{fout}</div>}
    </div>
  );
}

/** Millimeters in het invoerveld: heel waar het kan, anders één decimaal. */
function afgerond(v: number): number {
  return Math.round(v * 10) / 10;
}
