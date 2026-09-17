/**
 * PlaatWapeningVenster — invoer van de aanwezige wapening van een betonwand
 * in het plaat-eigenschappenvenster (issue #25).
 *
 * Per richting (horizontaal = model-x, verticaal = model-z) en per zijde één
 * laag: Ø met h.o.h., of mm²/m, steeds met de dekking op die staven. Daarbij
 * de betonstaalsoort en de milieuklasse (de ingang van tabel 7.1N voor de
 * scheurwijdte). Dit venster rekent niets: de waarden gaan ongewijzigd naar de
 * plaattoets in de Rust-kern, die ook een onvolledige laag met reden weigert.
 */
import { useTranslation } from "react-i18next";
import type { Plate } from "./femTypes";
import type { PlaatWapeningInvoer } from "../../lib/types/plaat/PlaatWapeningInvoer";
import type { PlaatWapeningLaag } from "../../lib/types/plaat/PlaatWapeningLaag";
import type { PlaatWapeningRichting } from "../../lib/types/plaat/PlaatWapeningRichting";
import { keurPlaatWapening, legePlaatWapening, PLAAT_MILIEUKLASSEN, PLAAT_STAALSOORTEN } from "../../lib/plaatWapening";
import { withPlateDefaults } from "./femTypes";

type Richting = "horizontaal" | "verticaal";
type Zijde = "zijde_1" | "zijde_2";

function Regel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fem-prop-row">
      <span className="fem-prop-row-label">{label}</span>
      <span className="fem-prop-row-value">{children}</span>
    </div>
  );
}

/** Een getalveld: leeg of ongeldig = veld weg (geen aangenomen waarde). */
function Getal({ waarde, onWijzig, titel }: { waarde?: number; onWijzig: (v?: number) => void; titel: string }) {
  return (
    <input
      type="number"
      className="fem-prop-input"
      min="0"
      step="any"
      title={titel}
      value={waarde ?? ""}
      onChange={(e) => {
        const v = e.target.value === "" ? undefined : Number(e.target.value);
        onWijzig(v !== undefined && Number.isFinite(v) ? v : undefined);
      }}
    />
  );
}

export function PlaatWapeningVenster({ plate, updatePlate }: {
  plate: Plate;
  updatePlate?: (id: number, updates: Partial<Plate>) => void;
}) {
  const { t } = useTranslation("check");
  const w = plate.wapening;
  const zet = (nieuw: PlaatWapeningInvoer | undefined) => updatePlate?.(plate.id, { wapening: nieuw });
  const fouten = w ? keurPlaatWapening(w, "wapening", withPlateDefaults(plate).thickness) : [];

  const zetLaag = (richting: Richting, zijde: Zijde, laag: PlaatWapeningLaag | undefined) => {
    if (!w) return;
    const r: PlaatWapeningRichting = { ...w[richting] };
    if (laag) r[zijde] = laag;
    else delete r[zijde];
    zet({ ...w, [richting]: r });
  };

  const laagInvoer = (richting: Richting, zijde: Zijde) => {
    const laag = w?.[richting][zijde];
    const modus = !laag ? "geen" : laag.as_mm2_per_m !== undefined ? "as" : "staaf";
    const wijzig = (deel: Partial<PlaatWapeningLaag>) => {
      if (!laag) return;
      const nieuw: PlaatWapeningLaag = { ...laag, ...deel };
      for (const k of Object.keys(nieuw) as (keyof PlaatWapeningLaag)[]) {
        if (nieuw[k] === undefined) delete nieuw[k];
      }
      zetLaag(richting, zijde, nieuw);
    };
    return (
      <div key={`${richting}-${zijde}`}>
        <Regel label={t(`props.plate.wapening.${richting}`) + " · " + t(`props.plate.wapening.${zijde}`)}>
          <select
            className="fem-prop-select"
            value={modus}
            onChange={(e) => {
              const m = e.target.value;
              const dekking = laag?.dekking_mm;
              if (m === "geen") zetLaag(richting, zijde, undefined);
              // 0 is geen geldige oppervlakte: tot er een getal staat, weigert
              // de kern deze laag met reden in plaats van iets aan te nemen.
              else if (m === "as") zetLaag(richting, zijde, { dekking_mm: dekking as number, as_mm2_per_m: 0 });
              else zetLaag(richting, zijde, { dekking_mm: dekking as number });
            }}
          >
            <option value="geen">{t("props.plate.wapening.geen")}</option>
            <option value="staaf">{t("props.plate.wapening.staaf")}</option>
            <option value="as">{t("props.plate.wapening.oppervlak")}</option>
          </select>
        </Regel>
        {laag && modus === "staaf" && (
          <>
            <Regel label={t("props.plate.wapening.diameter")}>
              <Getal waarde={laag.diameter_mm} titel={t("props.plate.wapening.diameter")} onWijzig={(v) => wijzig({ diameter_mm: v })} />
            </Regel>
            <Regel label={t("props.plate.wapening.hoh")}>
              <Getal waarde={laag.hoh_mm} titel={t("props.plate.wapening.hoh")} onWijzig={(v) => wijzig({ hoh_mm: v })} />
            </Regel>
          </>
        )}
        {laag && modus === "as" && (
          <Regel label={t("props.plate.wapening.oppervlakWaarde")}>
            <Getal waarde={laag.as_mm2_per_m} titel={t("props.plate.wapening.oppervlakWaarde")} onWijzig={(v) => wijzig({ as_mm2_per_m: v })} />
          </Regel>
        )}
        {laag && (
          <Regel label={t("props.plate.wapening.dekking")}>
            <Getal waarde={laag.dekking_mm} titel={t("props.plate.wapening.dekking")} onWijzig={(v) => wijzig({ dekking_mm: v })} />
          </Regel>
        )}
      </div>
    );
  };

  return (
    <>
      <Regel label={t("props.plate.wapening.titel")}>
        <input
          type="checkbox"
          checked={w !== undefined}
          title={t("props.plate.wapening.hint")}
          onChange={(e) => zet(e.target.checked ? legePlaatWapening() : undefined)}
        />
      </Regel>
      {w && (
        <>
          <Regel label={t("props.plate.wapening.staalsoort")}>
            <select className="fem-prop-select" value={w.staalsoort} onChange={(e) => zet({ ...w, staalsoort: e.target.value })}>
              {PLAAT_STAALSOORTEN.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Regel>
          <Regel label={t("props.plate.wapening.milieuklasse")}>
            <select
              className="fem-prop-select"
              value={w.milieuklasse ?? ""}
              title={t("props.plate.wapening.milieuklasseHint")}
              onChange={(e) => {
                const nieuw: PlaatWapeningInvoer = { ...w };
                if (e.target.value === "") delete nieuw.milieuklasse;
                else nieuw.milieuklasse = e.target.value as PlaatWapeningInvoer["milieuklasse"];
                zet(nieuw);
              }}
            >
              <option value="">{t("props.plate.wapening.geenKlasse")}</option>
              {PLAAT_MILIEUKLASSEN.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Regel>
          <Regel label={t("props.plate.wapening.fct")}>
            <Getal waarde={w.f_ct_eff_mpa} titel={t("props.plate.wapening.fctHint")} onWijzig={(waarde) => {
              const nieuw = { ...w };
              if (waarde === undefined) delete nieuw.f_ct_eff_mpa;
              else nieuw.f_ct_eff_mpa = waarde;
              zet(nieuw);
            }} />
          </Regel>
          {(["langdurend", "hoge_aanhechting"] as const).map((veld) => (
            <Regel key={veld} label={t(`props.plate.wapening.${veld}`)}>
              <select className="fem-prop-select" value={w[veld] === undefined ? "" : String(w[veld])} onChange={(e) => {
                const nieuw = { ...w };
                if (e.target.value === "") delete nieuw[veld];
                else nieuw[veld] = e.target.value === "true";
                zet(nieuw);
              }}>
                <option value="">{t("props.plate.wapening.geenKlasse")}</option>
                <option value="true">{t(`props.plate.wapening.${veld}Ja`)}</option>
                <option value="false">{t(`props.plate.wapening.${veld}Nee`)}</option>
              </select>
            </Regel>
          ))}
          <div className="fem-prop-hint">{t("props.plate.wapening.scheurGrens")}</div>
          {laagInvoer("horizontaal", "zijde_1")}
          {laagInvoer("horizontaal", "zijde_2")}
          {laagInvoer("verticaal", "zijde_1")}
          {laagInvoer("verticaal", "zijde_2")}
          <div className="fem-prop-hint">{t("props.plate.wapening.hint")}</div>
          {fouten.map((fout) => <div key={fout} role="alert" className="fem-prop-hint">{fout}</div>)}
        </>
      )}
    </>
  );
}
