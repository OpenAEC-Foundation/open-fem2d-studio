/**
 * WindGeneratorDialog — invoerscherm van de windbelastinggenerator.
 *
 * Links de invoer, kort en met tekeningen in plaats van uitleg: een
 * plattegrond waarin het spant, de h.o.h., de kopgevel en de windrichtingen
 * te zien zijn, en de doorsnede van het spant zelf met de windpijl en per
 * staaf de druk- en zuigpijlen van het gekozen belastinggeval. De
 * afleidingen, de tabellen en de normkanttekeningen blijven beschikbaar
 * maar staan ingeklapt: wie wil controleren klapt ze open.
 *
 * Bij een vrijstaand dak (§7.3) wisselt het venster van gedaante: geen
 * gevels, geen c_pi en geen windrichtingen (tabel 7.6/7.7 gelden voor alle
 * richtingen), wel de dakvorm, de blokkering φ met een tekeningetje van wat
 * φ betekent, en de hoogte h.
 *
 * Pas bij "Genereren" wordt er iets in het model geschreven.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import LengthInput from "../../components/LengthInput";
import { formatLength } from "../lengthInput";
import {
  TERREIN_CATEGORIEEN, WINDGEBIEDEN, berekenE,
  type TerreinCategorie, type Windgebied,
} from "./windEurocode";
import type { WindGeneratorApi } from "../../stores/windStore";
import { vertaal } from "../vertaalbareTekst";
import { windGevalNaam, windGevalTab } from "./windGevalLabel";
import {
  BlokkeringSchema, DoorsnedeSchema, PlattegrondSchema,
  KLEUR_DRUK, KLEUR_RESULTANTE, KLEUR_WIND, KLEUR_ZUIGING, ROL_KLEUR, ZONE_KLEUR,
} from "./WindSchema";
import "./WindGeneratorDialog.css";

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

interface Props {
  open: boolean;
  onClose: () => void;
  wind: WindGeneratorApi;
}

/** Een ingeklapt blok met een kop; de inhoud rendert alleen open. */
function Klapblok({ kop, standaardOpen = false, children }: { kop: string; standaardOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(standaardOpen);
  return (
    <div className={`wgd-klap${open ? " open" : ""}`}>
      <button type="button" className="wgd-klap-kop" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="wgd-klap-pijl">{open ? "▾" : "▸"}</span>
        {kop}
      </button>
      {open && <div className="wgd-klap-inhoud">{children}</div>}
    </div>
  );
}

/** Een klein getalveld met label ernaast — de invoer blijft één regel. */
function Getal({
  label, value, onChange, step = 0.1, min = 0, eenheid = "m", leeg, required = false, breed = false,
}: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  step?: number; min?: number; eenheid?: string; leeg?: string; required?: boolean;
  /** Breed invoerveld, zodat een tekst als "(automatisch, tabel 7.4a)" leesbaar past. */
  breed?: boolean;
}) {
  return (
    <label className={`wgd-getal${breed ? " wgd-getal-breed" : ""}`}>
      <span>{label}</span>
      {eenheid === "m" || eenheid === "mm" ? (
        <LengthInput required={required} value={value} storedUnit={eenheid} min={min}
          placeholder={leeg} onChange={v => onChange(v ?? null)} />
      ) : (
        <input
          type="number" step={step} min={min}
          value={value ?? ""}
          placeholder={leeg}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      )}
      <span className="wgd-eenheid">{eenheid === "m" ? "mm" : eenheid}</span>
    </label>
  );
}

export default function WindGeneratorDialog({ open, onClose, wind }: Props) {
  const { t } = useTranslation("common");
  const { instellingen: i, setInstellingen: set } = wind;
  const [gevalIndex, setGevalIndex] = useState(0);

  // Voorbeeld: puur rekenen, niets wegschrijven. Herrekent bij een wijziging
  // in de instellingen of in de constructie. De instellingen `i` gaan
  // expliciet mee, zodat voorbeeld, meldingen en de knop Genereren altijd bij
  // de invoer op het scherm horen (issue #29).
  const vb = useMemo(
    () => (open ? wind.voorbeeld(i) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, i, wind.modelVersie],
  );

  if (!open) return null;
  const res = vb?.resultaat ?? null;
  const s = res?.samenvatting ?? null;
  const geo = res?.geometrie ?? null;
  const gevallen = s?.perGeval ?? [];
  const geval = gevallen[Math.min(gevalIndex, Math.max(0, gevallen.length - 1))] ?? null;
  const richtingVanGeval = geval
    ? (res?.gevallen.find((g) => g.sleutel === geval.sleutel)?.richting ?? null)
    : i.vorm === "vrijstaandDak" ? "alle"
      : (i.richtingLinks ? "links" : i.richtingRechts ? "rechts" : i.richtingHaaks ? "haaks" : null);
  const fouten = vb?.fouten ?? [];
  const overige = vb?.overige ?? [];
  const vrijstaand = i.vorm === "vrijstaandDak";
  const toonGevelhoogte = !vrijstaand && geo !== null && !geo.heeftGevels;
  const e_m = geo ? berekenE(i.gebouwlengte_m, geo.h_m) : undefined;
  const vrijGeo = geo?.vrijstaand ?? null;
  // De namen van de gevallen zijn Nederlands (ze gaan het model en het rapport
  // in); het venster toont ze vertaald, afgeleid uit de sleutel (issue #33).
  // Een onbekende sleutel valt terug op de naam zelf.
  const dakvorm = s?.vrijstaand?.dakvorm ?? null;
  const tabLabel = (gv: { sleutel: string; naam: string }) => {
    const v = windGevalTab(gv, dakvorm);
    return v ? vertaal(t, v) : gv.naam;
  };
  const gevalNaam = (gv: { sleutel: string; naam: string }) => {
    const v = windGevalNaam(gv, dakvorm);
    return v ? vertaal(t, v) : gv.naam;
  };

  const richtingKnop = (sleutel: "richtingLinks" | "richtingRechts" | "richtingHaaks", tekst: string, titel: string) => (
    <button
      type="button"
      className={`wgd-toggle${i[sleutel] ? " aan" : ""}`}
      onClick={() => set({ [sleutel]: !i[sleutel] } as Partial<typeof i>)}
      title={titel}
      aria-pressed={i[sleutel]}
    >
      {tekst}
    </button>
  );

  return (
    <div className="wgd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wgd-dialog">
        <div className="wgd-header">
          <span className="wgd-title">{t("wind.title")}</span>
          <button className="wgd-close" onClick={onClose} aria-label={t("close")}>×</button>
        </div>

        <div className="wgd-body">
          <div className="wgd-cols">
            {/* ── Invoer ──────────────────────────────────────────────── */}
            <div>
              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secForm")}</div>
                <div className="wgd-toggles">
                  <button type="button" className={`wgd-toggle${!vrijstaand ? " aan" : ""}`}
                    onClick={() => set({ vorm: "gebouw" })} aria-pressed={!vrijstaand}>
                    {t("wind.formBuilding")}
                  </button>
                  <button type="button" className={`wgd-toggle${vrijstaand ? " aan" : ""}`}
                    onClick={() => set({ vorm: "vrijstaandDak" })} aria-pressed={vrijstaand} title={t("wind.formHint")}>
                    {t("wind.formCanopy")}
                  </button>
                </div>
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secPressure")}</div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>{t("wind.windZone")}</label>
                    <select value={i.windgebied} onChange={(e) => set({ windgebied: e.target.value as Windgebied })}>
                      {(Object.keys(WINDGEBIEDEN) as Windgebied[]).map((g) => (
                        <option key={g} value={g}>{t(`wind.regionOption.${g}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="wgd-field">
                    <label>{t("wind.terrainCategory")}</label>
                    <select value={i.terreincategorie} onChange={(e) => set({ terreincategorie: e.target.value as TerreinCategorie })}>
                      {(Object.keys(TERREIN_CATEGORIEEN) as TerreinCategorie[]).map((c) => (
                        <option key={c} value={c}>{t(`wind.terrainOption.${c}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="wgd-toggles">
                  <button type="button" className={`wgd-toggle${i.stuwdrukBron === "berekend" ? " aan" : ""}`}
                    onClick={() => set({ stuwdrukBron: "berekend" })} title={t("wind.qpCalculated")}>
                    q_p §4
                  </button>
                  <button type="button" className={`wgd-toggle${i.stuwdrukBron === "handmatig" ? " aan" : ""}`}
                    onClick={() => set({ stuwdrukBron: "handmatig" })} title={t("wind.qpManual")}>
                    q_p NB
                  </button>
                  {i.stuwdrukBron === "handmatig" && (
                    <Getal label="q_p" value={i.qpHandmatig_kNm2} step={0.01} eenheid="kN/m²"
                      onChange={(v) => set({ qpHandmatig_kNm2: v ?? 0 })} />
                  )}
                  {s && i.stuwdrukBron === "berekend" && (
                    <span className="wgd-uitkomst">{`q_p = ${nl(s.stuwdruk.qp_kNm2, 3)} kN/m²`}</span>
                  )}
                </div>
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t(vrijstaand ? "wind.secFrameCanopy" : "wind.secFrame")}</div>
                <PlattegrondSchema lengthUnit="mm"
                  gebouwlengte_m={i.gebouwlengte_m}
                  d_m={geo?.d_m ?? 10}
                  hoh_m={i.hohSpant_m}
                  positie={i.positieSpant}
                  afstandTotKopgevel_m={i.afstandTotKopgevel_m}
                  richtingLinks={i.richtingLinks}
                  richtingRechts={i.richtingRechts}
                  richtingHaaks={i.richtingHaaks}
                  e_m={e_m}
                  vrijstaand={vrijGeo ? {
                    nokFractie: vrijGeo.xNok_m !== null && geo && geo.d_m > 0
                      ? (vrijGeo.xNok_m - geo.xLinks_m) / geo.d_m : null,
                  } : undefined}
                  breedtePx={320}
                />
                <div className="wgd-toggles">
                  <button type="button" className={`wgd-toggle${i.positieSpant === "tussenspant" ? " aan" : ""}`}
                    onClick={() => set({ positieSpant: "tussenspant" })} title={t("wind.positionHint")}>
                    {t("wind.positionInner")}
                  </button>
                  <button type="button" className={`wgd-toggle${i.positieSpant === "kopgevelspant" ? " aan" : ""}`}
                    onClick={() => set({ positieSpant: "kopgevelspant" })} title={t("wind.positionHint")}>
                    {t("wind.positionGable")}
                  </button>
                </div>
                <div className="wgd-getallen">
                  <Getal required label="h.o.h." value={i.hohSpant_m} onChange={(v) => set({ hohSpant_m: v ?? 0 })} />
                  <Getal required label="b" value={i.gebouwlengte_m} step={0.5} onChange={(v) => set({ gebouwlengte_m: v ?? 0 })} />
                  {i.positieSpant === "tussenspant" && (
                    <Getal required label={t("wind.distanceShort")} value={i.afstandTotKopgevel_m} step={0.5}
                      onChange={(v) => set({ afstandTotKopgevel_m: v ?? 0 })} />
                  )}
                  <Getal label={t("wind.loadWidthShort")} value={i.belastingbreedteOverride_m}
                    leeg={s ? formatLength(s.belastingbreedte_m, "m") : "auto"}
                    onChange={(v) => set({ belastingbreedteOverride_m: v })} />
                  {toonGevelhoogte && (
                    <Getal label={t("wind.gevelhoogte")} value={i.gevelhoogte_m} step={0.1}
                      leeg="0" onChange={(v) => set({ gevelhoogte_m: v })} />
                  )}
                </div>
                {toonGevelhoogte && <div className="wgd-hint">{t("wind.gevelhoogteHint")}</div>}
              </div>

              {vrijstaand && (
                <div className="wgd-section">
                  <div className="wgd-section-title">
                    {t("wind.secCanopy")}
                    {vrijGeo && <span className="wgd-section-sub">{` α = ${nl(vrijGeo.alpha_graden, 1).replace("-", "−")}° (${t("wind.canopySlope")})`}</span>}
                  </div>
                  <div className="wgd-toggles">
                    <button type="button" className={`wgd-toggle${i.vrijstaandDakvorm === "lessenaar" ? " aan" : ""}`}
                      onClick={() => set({ vrijstaandDakvorm: "lessenaar" })}>
                      {t("wind.canopyMono")}
                    </button>
                    <button type="button" className={`wgd-toggle${i.vrijstaandDakvorm === "zadel" ? " aan" : ""}`}
                      onClick={() => set({ vrijstaandDakvorm: "zadel" })}>
                      {t("wind.canopyDuo")}
                    </button>
                  </div>
                  <BlokkeringSchema phi={i.blokkering_phi} dakvorm={i.vrijstaandDakvorm} breedtePx={320} />
                  <div className="wgd-getallen">
                    <Getal label={t("wind.blockage")} value={i.blokkering_phi} step={0.1} eenheid=""
                      onChange={(v) => set({ blokkering_phi: v ?? 0 })} />
                    <Getal label={t("wind.canopyHeight")} value={i.vrijstaandHoogte_m} step={0.1}
                      leeg={geo ? formatLength(geo.modelhoogte_m, "m") : t("wind.canopyHeightEmpty")}
                      onChange={(v) => set({ vrijstaandHoogte_m: v })} />
                  </div>
                  <div className="wgd-hint">{t("wind.blockageHint")}</div>
                  <div className="wgd-hint">{t("wind.canopyDirections")}</div>
                </div>
              )}

              {vrijstaand && (
                <div className="wgd-section">
                  <div className="wgd-section-title">{t("wind.secCanopyExtra")}</div>
                  <div className="wgd-row">
                    <div className="wgd-field">
                      <label>{t("wind.friction")}</label>
                      <select value={i.wrijving ?? "geen"}
                        onChange={(e) => set({ wrijving: e.target.value as NonNullable<typeof i.wrijving> })}>
                        <option value="geen">{t("wind.frictionNone")}</option>
                        <option value="glad">{t("wind.frictionSmooth")}</option>
                        <option value="ruw">{t("wind.frictionRough")}</option>
                        <option value="zeerRuw">{t("wind.frictionVeryRough")}</option>
                      </select>
                    </div>
                    <div className="wgd-field">
                      <label>{t("wind.columns")}</label>
                      <select value={i.kolomDoorsnede ?? "geen"}
                        onChange={(e) => set({ kolomDoorsnede: e.target.value as NonNullable<typeof i.kolomDoorsnede> })}>
                        <option value="geen">{t("wind.columnsNone")}</option>
                        <option value="scherphoekig">{t("wind.columnsSharp")}</option>
                        <option value="rechthoekig">{t("wind.columnsRect")}</option>
                      </select>
                    </div>
                  </div>
                  {(i.kolomDoorsnede ?? "geen") !== "geen" && (
                    <div className="wgd-getallen">
                      <Getal required label="b" value={i.kolomBreedte_mm ?? null} step={10} eenheid="mm"
                        onChange={(v) => set({ kolomBreedte_mm: v ?? 0 })} />
                      {i.kolomDoorsnede === "rechthoekig" && (
                        <Getal required label="d" value={i.kolomDiepte_mm ?? null} step={10} eenheid="mm"
                          onChange={(v) => set({ kolomDiepte_mm: v ?? 0 })} />
                      )}
                    </div>
                  )}
                  <div className="wgd-getallen">
                    <Getal label={t("wind.canopyCount")} value={i.aantalOverkappingen ?? 1} step={1} min={1} eenheid=""
                      onChange={(v) => set({ aantalOverkappingen: v ?? 1 })} />
                    {(i.aantalOverkappingen ?? 1) > 1 && (
                      <Getal label={t("wind.canopyPosition")} value={i.positieOverkapping ?? 1} step={1} min={1} eenheid=""
                        onChange={(v) => set({ positieOverkapping: v ?? 1 })} />
                    )}
                  </div>
                  <div className="wgd-hint">{t("wind.canopyExtraHint")}</div>
                </div>
              )}

              {!vrijstaand && (
              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secDirections")}</div>
                <div className="wgd-toggles">
                  {richtingKnop("richtingLinks", "→ " + t("wind.dirLeftShort"), t("wind.windLeft"))}
                  {richtingKnop("richtingRechts", "← " + t("wind.dirRightShort"), t("wind.windRight"))}
                  {richtingKnop("richtingHaaks", "⊗ " + t("wind.dirPerpShort"), t("wind.windPerpendicular"))}
                </div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>c_pi</label>
                    <select value={i.cpiKeuze} onChange={(e) => set({ cpiKeuze: e.target.value as typeof i.cpiKeuze })}>
                      <option value="beide">{t("wind.cpiBoth")}</option>
                      <option value="plus">{t("wind.cpiPlus")}</option>
                      <option value="min">{t("wind.cpiMinus")}</option>
                      <option value="handmatig">{t("wind.cpiManual")}</option>
                    </select>
                  </div>
                  {i.cpiKeuze === "handmatig" && (
                    <Getal label="c_pi" value={i.cpiHandmatig} step={0.05} min={-1} eenheid=""
                      onChange={(v) => set({ cpiHandmatig: v ?? 0 })} />
                  )}
                </div>
              </div>
              )}

              {!vrijstaand && geo?.heeftHellendDak && (() => {
                // Issue #49: c_pe,10 per zone automatisch uit tabel 7.3/7.4;
                // een ingevulde waarde gaat voor (leeg maken = weer de tabel).
                const hd = geo.hellendDak;
                const opz = hd?.opzoeking ?? {};
                const tabel0 = hd?.vorm === "lessenaar" ? "7.3a" : "7.4a";
                const tabel90 = hd?.vorm === "lessenaar" ? "7.3b" : "7.4b";
                const auto = (o: typeof opz.links) => (o?.ok ? t("wind.cpeAuto", { tabel: o.tabel }) : undefined);
                // Lessenaarsdak: "loef" = wind op de lage dakrand (θ = 0°), "lij" = op de hoge (θ = 180°).
                const opzLoef = hd?.vorm === "lessenaar" ? [opz.links, opz.rechts].find((o) => o?.theta === 0) : opz.links;
                const opzLij = hd?.vorm === "lessenaar" ? [opz.links, opz.rechts].find((o) => o?.theta === 180) : opz.links;
                const rijen = [opzLoef, ...(hd?.vorm === "lessenaar" ? [opzLij] : []), opz.haaks]
                  .filter((o): o is NonNullable<typeof o> => !!o && o.ok);
                const cel = (c: { neg?: number; pos?: number }) => [c.neg, c.pos]
                  .filter((v): v is number => v !== undefined)
                  .map((v) => (v < 0 || Object.is(v, -0) ? "−" : "+") + nl(Math.abs(v), 2)).join(" / ");
                const zoneNaam = (z: string) => (z === "Fhoog" ? "F_hoog" : z === "Flaag" ? "F_laag" : z);
                const reden = hd?.reden ?? [opz.links, opz.rechts, opz.haaks].find((o) => o && !o.ok)?.reden;
                return (
                  <div className="wgd-section">
                    <div className="wgd-section-title">
                      {t("wind.secSlopedRoof")}
                      <span className="wgd-section-sub">
                        {` α ≈ ${nl(Math.abs(hd?.alpha_graden ?? geo.dakhelling_graden), 0)}°`}
                        {hd?.vorm ? ` · ${t(`wind.roofShape.${hd.vorm === "zadel" && hd.alpha_graden < 0 ? "kiel" : hd.vorm}`)}` : ""}
                      </span>
                    </div>
                    <div className="wgd-getallen wgd-cpe-velden">
                      <Getal breed label={t("wind.cpeWindwardShort")} value={i.cpeDakLoef} step={0.05} min={-3} eenheid={tabel0}
                        leeg={auto(opzLoef)} onChange={(v) => set({ cpeDakLoef: v })} />
                      <Getal breed label={t("wind.cpeLeewardShort")} value={i.cpeDakLij} step={0.05} min={-3} eenheid={tabel0}
                        leeg={auto(opzLij)} onChange={(v) => set({ cpeDakLij: v })} />
                      {i.richtingHaaks && (
                        <Getal breed label={t("wind.cpePerpShort")} value={i.cpeDakHaaks} step={0.05} min={-3} eenheid={tabel90}
                          leeg={auto(opz.haaks)} onChange={(v) => set({ cpeDakHaaks: v })} />
                      )}
                    </div>
                    {rijen.length > 0 && (
                      <div className="wgd-cpe-auto">
                        {rijen.map((o) => (
                          <div key={`${o.theta}`} className="wgd-cpe-rij">
                            <div className="wgd-cpe-kop">
                              {`θ = ${o.theta}° · ${o.tabel}`}
                              <span className="wgd-bron">
                                {` ${o.rijOnder === o.rijBoven
                                  ? t("wind.cpeRow", { alpha: nl(o.rijOnder, 0) })
                                  : t("wind.cpeInterp", { van: nl(o.rijOnder, 0), tot: nl(o.rijBoven, 0) })}`}
                              </span>
                            </div>
                            <div className="wgd-cpe-zones">
                              {Object.entries(o.zones).map(([z, c]) => (
                                <span key={z} className="wgd-cpe-zone"><strong>{zoneNaam(z)}</strong> {cel(c)}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {reden && <div className="wgd-melding waarschuwing">{reden}</div>}
                    <div className="wgd-hint">{t("wind.slopedRoofAuto")}</div>
                  </div>
                );
              })()}

              <label className="wgd-check">
                <input type="checkbox" checked={i.combinatiesGenereren}
                  onChange={(e) => set({ combinatiesGenereren: e.target.checked })} />
                {t("wind.generateCombos")}
              </label>
            </div>

            {/* ── Tekening en uitkomst ────────────────────────────────── */}
            <div>
              {fouten.map((m, k) => (
                <div key={k} className="wgd-melding fout">{m.tekst}</div>
              ))}

              {geo && (
                <div className="wgd-section">
                  {gevallen.length > 0 && (
                    <div className="wgd-tabs" role="tablist">
                      {gevallen.map((gv, k) => (
                        <button
                          key={gv.sleutel}
                          type="button"
                          role="tab"
                          aria-selected={gv === geval}
                          className={`wgd-tab${gv === geval ? " actief" : ""}`}
                          onClick={() => setGevalIndex(k)}
                        >
                          {tabLabel(gv)}
                        </button>
                      ))}
                    </div>
                  )}
                  <DoorsnedeSchema lengthUnit="mm"
                    geometrie={geo}
                    richting={richtingVanGeval}
                    regels={geval?.regels ?? []}
                    gevelhoogte_m={i.gevelhoogte_m}
                    resultanten={vrijstaand ? (geval?.resultanten ?? []) : []}
                    breedtePx={560}
                  />
                  <div className="wgd-legenda">
                    {!vrijstaand && <span><i style={{ background: ROL_KLEUR.gevelLinks }} />{t("wind.legendWall")}</span>}
                    <span><i style={{ background: ROL_KLEUR.dakPlat }} />{t("wind.legendRoof")}</span>
                    {!vrijstaand && <span><i style={{ background: ROL_KLEUR.overstek }} />{t("wind.legendOverhang")}</span>}
                    {vrijstaand && (i.vrijstaandDakvorm === "zadel" ? ["A", "B", "C", "D"] as const : ["A", "B", "C"] as const).map((z) => (
                      <span key={z}><i style={{ background: ZONE_KLEUR[z] }} />{`${t("wind.colZone")} ${z}`}</span>
                    ))}
                    {vrijstaand && <span><i style={{ background: KLEUR_RESULTANTE }} />{t("wind.legendResultant")}</span>}
                    <span><i style={{ background: KLEUR_DRUK }} />{t("wind.legendPressure")}</span>
                    <span><i style={{ background: KLEUR_ZUIGING }} />{t("wind.legendSuction")}</span>
                    <span><i style={{ background: KLEUR_WIND }} />{t("wind.legendWind")}</span>
                  </div>
                  {s && (
                    <div className="wgd-uitkomst-regel">
                      {t(i.combinatiesGenereren ? "wind.summaryCountsCombos" : "wind.summaryCounts", {
                        cases: s.perGeval.length,
                        loads: res?.lasten.length ?? 0,
                        combos: res?.combinaties.length ?? 0,
                      })}
                      {` · h/d = ${nl(s.hOverD, 2)} · ${t("wind.loadWidthShort")} ${formatLength(s.belastingbreedte_m, "m")} mm`}
                    </div>
                  )}
                </div>
              )}

              {geval && (
                <Klapblok kop={`${t("wind.showTable")} — ${gevalNaam(geval)}`}>
                  <table className="wgd-table">
                    <thead>
                      <tr>
                        <th>{t("wind.colBeam")}</th><th>{t("wind.colZone")}</th>
                        <th>{vrijstaand ? t("wind.colCoef") : "c_pe"}</th>{!vrijstaand && <th>c_pi</th>}
                        <th>{t("wind.colW")}</th><th>{t("wind.colQ")}</th>
                        <th>{t("wind.colSource")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geval.regels.map((r, k) => (
                        <tr key={k}>
                          <td className="num">{r.beamId}</td>
                          <td>{r.zone}</td>
                          <td className="num">{nl(r.cpe, 2)}</td>
                          {!vrijstaand && <td className="num">{nl(r.cpi, 2)}</td>}
                          <td className="num">{nl(r.w_kNm2, 3)}</td>
                          <td className="num">{nl(r.q_kNm, 3)}</td>
                          <td className="wgd-bron">{r.bron}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Klapblok>
              )}

              {s && (
                <Klapblok kop={`${t("wind.secDerivation")} — q_p = ${nl(s.stuwdruk.qp_kNm2, 3)} kN/m², z_e = ${formatLength(s.hoogte_m, "m")} mm`}>
                  <table className="wgd-table">
                    <tbody>
                      {s.stuwdruk.afleiding.map((r, k) => (
                        <tr key={k}>
                          <td style={{ whiteSpace: "nowrap" }}><strong>{r.symbool}</strong></td>
                          <td>{r.waarde}</td>
                          <td className="wgd-bron">{r.bron}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Klapblok>
              )}

              {overige.length > 0 && (
                <Klapblok kop={`${t("wind.secMessages")} (${overige.length})`}>
                  {overige.map((m, k) => (
                    <div key={k} className={`wgd-melding ${m.niveau}`}>{m.tekst}</div>
                  ))}
                </Klapblok>
              )}
            </div>
          </div>
        </div>

        <div className="wgd-footer">
          <span className="wgd-status">
            {wind.actief
              ? t("wind.statusActive", {
                  runs: wind.statistiek.regeneraties,
                  applied: wind.statistiek.toegepast,
                  skipped: wind.statistiek.overgeslagen,
                })
              : t("wind.statusIdle")}
          </span>
          <div className="wgd-knoppen">
            <button className="wgd-btn" onClick={() => wind.wis()}>{t("wind.btnClear")}</button>
            <button className="wgd-btn" onClick={onClose}>{t("close")}</button>
            <button className="wgd-btn primary" disabled={!vb?.kanGenereren} onClick={() => { wind.genereer(); onClose(); }}>
              {t("wind.btnGenerate")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
