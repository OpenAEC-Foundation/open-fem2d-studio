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
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { Plate } from "./femTypes";
import type { PlaatWapeningInvoer } from "../../lib/types/plaat/PlaatWapeningInvoer";
import type { PlaatWapeningLaag } from "../../lib/types/plaat/PlaatWapeningLaag";
import type { PlaatWapeningRichting } from "../../lib/types/plaat/PlaatWapeningRichting";
import { keurPlaatWapening, legePlaatWapening, PLAAT_MILIEUKLASSEN, PLAAT_STAALSOORTEN } from "../../lib/plaatWapening";
import { withPlateDefaults } from "./femTypes";
import "./PlaatWapeningVenster.css";

type Richting = "horizontaal" | "verticaal";
type Zijde = "zijde_1" | "zijde_2";

function Regel({ label, id, fouten = [], hint, children }: {
  label: string; id: string; fouten?: string[]; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="fem-prop-row plaat-wapening-veld">
      <label className="fem-prop-row-label" htmlFor={id}>{label}</label>
      <span className="fem-prop-row-value">{children}</span>
      {hint && <p id={`${id}-hint`} className="plaat-wapening-hint">{hint}</p>}
      {fouten.length > 0 && <p id={`${id}-fout`} role="alert" className="plaat-wapening-fout">{fouten.join(" ")}</p>}
    </div>
  );
}

/** Een getalveld: leeg of ongeldig = veld weg (geen aangenomen waarde). */
function Getal({ waarde, onWijzig, titel, ...props }: {
  waarde?: number; onWijzig: (v?: number) => void; titel: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
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
  const prefix = useId();
  const w = plate.wapening;
  const zet = (nieuw: PlaatWapeningInvoer | undefined) => updatePlate?.(plate.id, { wapening: nieuw });
  const dikte = withPlateDefaults(plate).thickness;
  const fouten = w ? keurPlaatWapening(w, "wapening", dikte) : [];
  const naam = (veld: string) => t(`props.plate.wapening.${veld}`);
  const richtingen = ["horizontaal", "verticaal"] as const;
  const zijden = ["zijde_1", "zijde_2"] as const;
  const veldnamen: Record<string, string> = {
    diameter_mm: "diameter", hoh_mm: "hoh", as_mm2_per_m: "oppervlakWaarde",
    dekking_mm: "dekking", f_ct_eff_mpa: "fct",
  };
  const veldNaam = (pad: string) => pad.split(".").map(deel => naam(veldnamen[deel] ?? deel)).join(" · ");
  const veldFouten: Record<string, string[]> = {};
  const overigeFouten: string[] = [];
  const voegFoutToe = (veld: string, tekst: string) => {
    const lijst = veldFouten[veld] ??= [];
    if (!lijst.includes(tekst)) lijst.push(tekst);
  };
  // Alleen presentatie van de bestaande poortcontrole: geen aanvullende normtoets.
  for (const fout of fouten) {
    const [adres, reden] = fout.split(": ");
    const pad = adres.replace(/^wapening\.?/, "");
    const delen = pad.split(".");
    if (reden.startsWith("positief") || reden.startsWith("positieve")) {
      voegFoutToe(pad, `${veldNaam(pad)}: > 0`);
    } else if (reden.startsWith("geef diameter_mm")) {
      for (const veld of ["diameter_mm", "hoh_mm"]) voegFoutToe(`${pad}.${veld}`, `${veldNaam(`${pad}.${veld}`)}: > 0`);
    } else if (reden.startsWith("óf diameter_mm")) {
      voegFoutToe(`${pad}.modus`, `${naam("staaf")} ${t("profilePicker.or")} ${naam("oppervlak")}`);
    } else if (pad === "staalsoort") {
      voegFoutToe(pad, `${naam(pad)}: ${PLAAT_STAALSOORTEN.join(", ")}`);
    } else if (pad === "milieuklasse") {
      voegFoutToe(pad, naam("milieuklasseHint"));
    } else if (pad === "langdurend" || pad === "hoge_aanhechting") {
      voegFoutToe(pad, `${naam(pad)}: ${naam(`${pad}Ja`)} / ${naam(`${pad}Nee`)}`);
    } else if (w && zijden.includes(pad as Zijde)) {
      const zijde = pad as Zijde;
      for (const richting of richtingen) {
        const laag = w[richting][zijde];
        if (!laag) continue;
        const basis = `${richting}.${zijde}`;
        if (reden.startsWith("h.o.h.") && laag.hoh_mm! <= laag.diameter_mm!) {
          voegFoutToe(`${basis}.hoh_mm`, `${naam("hoh")} > ${naam("diameter")} (${laag.diameter_mm})`);
        } else if (reden.startsWith("laag past") && dikte !== undefined && laag.dekking_mm + (laag.diameter_mm ?? 0) >= dikte) {
          voegFoutToe(`${basis}.dekking_mm`, `${naam("dekking")}${laag.diameter_mm !== undefined ? " + Ø" : ""} < ${t("props.plate.thickness")} (${dikte})`);
        } else if (reden.startsWith("kruisende")) {
          const h = w.horizontaal[zijde]!, v = w.verticaal[zijde]!;
          const tekst = t("concrete.zoneCheck.overlap", {
            reeks: `${naam("horizontaal")} / ${naam("verticaal")} · ${naam(zijde)}`,
            van: Math.max(h.dekking_mm, v.dekking_mm),
            tot: Math.min(h.dekking_mm + h.diameter_mm!, v.dekking_mm + v.diameter_mm!),
          });
          voegFoutToe(`${basis}.dekking_mm`, tekst);
          voegFoutToe(`${basis}.diameter_mm`, tekst);
        }
      }
    } else if (w && reden.startsWith("lagen aan beide")) {
      const dieptes = zijden.map(zijde => Math.max(...richtingen.map(richting => {
        const laag = w[richting][zijde];
        return laag ? laag.dekking_mm + (laag.diameter_mm ?? 0) : 0;
      })));
      for (const richting of richtingen) for (const zijde of zijden) {
        if (w[richting][zijde]) voegFoutToe(`${richting}.${zijde}.dekking_mm`,
          `${naam("zijde_1")} (${dieptes[0]} mm) + ${naam("zijde_2")} (${dieptes[1]} mm) < ${t("props.plate.thickness")} (${dikte})`);
      }
    } else {
      // Onbekende velden of onleesbare import: zichtbaar houden zonder modelpaden.
      const context = delen.filter(deel => ([...richtingen, ...zijden] as readonly string[]).includes(deel)).map(naam).join(" · ");
      overigeFouten.push(`${t("props.plate.warning")} ${context || naam("titel")}`);
    }
  }
  const id = (veld: string) => `${prefix}-${veld}`;
  const hints: Record<string, string> = {
    actief: naam("hint"), milieuklasse: naam("milieuklasseHint"), f_ct_eff_mpa: naam("fctHint"),
  };
  const regelProps = (veld: string, label: string) => ({ id: id(veld), label, fouten: veldFouten[veld], hint: hints[veld] });
  const invoerProps = (veld: string) => ({
    id: id(veld),
    "aria-invalid": veldFouten[veld]?.length ? true as const : undefined,
    "aria-describedby": [hints[veld] ? `${id(veld)}-hint` : "", veldFouten[veld]?.length ? `${id(veld)}-fout` : ""].filter(Boolean).join(" ") || undefined,
  });

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
    const pad = `${richting}.${zijde}`;
    const wijzig = (deel: Partial<PlaatWapeningLaag>) => {
      if (!laag) return;
      const nieuw: PlaatWapeningLaag = { ...laag, ...deel };
      for (const k of Object.keys(nieuw) as (keyof PlaatWapeningLaag)[]) {
        if (nieuw[k] === undefined) delete nieuw[k];
      }
      zetLaag(richting, zijde, nieuw);
    };
    return (
      <fieldset className="plaat-wapening-zijde" key={zijde}>
        <legend>{naam(zijde)}</legend>
        <Regel {...regelProps(`${pad}.modus`, naam("titel"))}>
          <select
            {...invoerProps(`${pad}.modus`)}
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
            <Regel {...regelProps(`${pad}.diameter_mm`, naam("diameter"))}>
              <Getal {...invoerProps(`${pad}.diameter_mm`)} waarde={laag.diameter_mm} titel={naam("diameter")} onWijzig={(v) => wijzig({ diameter_mm: v })} />
            </Regel>
            <Regel {...regelProps(`${pad}.hoh_mm`, naam("hoh"))}>
              <Getal {...invoerProps(`${pad}.hoh_mm`)} waarde={laag.hoh_mm} titel={naam("hoh")} onWijzig={(v) => wijzig({ hoh_mm: v })} />
            </Regel>
          </>
        )}
        {laag && modus === "as" && (
          <Regel {...regelProps(`${pad}.as_mm2_per_m`, naam("oppervlakWaarde"))}>
            <Getal {...invoerProps(`${pad}.as_mm2_per_m`)} waarde={laag.as_mm2_per_m} titel={naam("oppervlakWaarde")} onWijzig={(v) => wijzig({ as_mm2_per_m: v })} />
          </Regel>
        )}
        {laag && (
          <Regel {...regelProps(`${pad}.dekking_mm`, naam("dekking"))}>
            <Getal {...invoerProps(`${pad}.dekking_mm`)} waarde={laag.dekking_mm} titel={naam("dekking")} onWijzig={(v) => wijzig({ dekking_mm: v })} />
          </Regel>
        )}
      </fieldset>
    );
  };

  return (
    <div className="plaat-wapening">
      <Regel {...regelProps("actief", naam("titel"))}>
        <input
          {...invoerProps("actief")}
          type="checkbox"
          checked={w !== undefined}
          title={t("props.plate.wapening.hint")}
          onChange={(e) => zet(e.target.checked ? legePlaatWapening() : undefined)}
        />
      </Regel>
      {w && (
        <>
          <div className="plaat-wapening-basis">
          <Regel {...regelProps("staalsoort", naam("staalsoort"))}>
            <select {...invoerProps("staalsoort")} className="fem-prop-select" value={w.staalsoort} onChange={(e) => zet({ ...w, staalsoort: e.target.value })}>
              {PLAAT_STAALSOORTEN.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Regel>
          <Regel {...regelProps("milieuklasse", naam("milieuklasse"))}>
            <select
              {...invoerProps("milieuklasse")}
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
          <Regel {...regelProps("f_ct_eff_mpa", naam("fct"))}>
            <Getal {...invoerProps("f_ct_eff_mpa")} waarde={w.f_ct_eff_mpa} titel={t("props.plate.wapening.fctHint")} onWijzig={(waarde) => {
              const nieuw = { ...w };
              if (waarde === undefined) delete nieuw.f_ct_eff_mpa;
              else nieuw.f_ct_eff_mpa = waarde;
              zet(nieuw);
            }} />
          </Regel>
          {(["langdurend", "hoge_aanhechting"] as const).map((veld) => (
            <Regel key={veld} {...regelProps(veld, naam(veld))}>
              <select {...invoerProps(veld)} className="fem-prop-select" value={w[veld] === undefined ? "" : String(w[veld])} onChange={(e) => {
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
          </div>
          <div className="plaat-wapening-richtingen">
            {richtingen.map(richting => <fieldset key={richting} className="plaat-wapening-richting">
              <legend>{naam(richting)}</legend>
              <div className="plaat-wapening-zijden">{zijden.map(zijde => laagInvoer(richting, zijde))}</div>
            </fieldset>)}
          </div>
          <p className="plaat-wapening-hint plaat-wapening-domein">{naam("scheurGrens")}</p>
          {overigeFouten.map((fout, i) => <p key={i} role="alert" className="plaat-wapening-fout">{fout}</p>)}
        </>
      )}
    </div>
  );
}
