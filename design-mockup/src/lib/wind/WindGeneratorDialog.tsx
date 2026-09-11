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
 * Pas bij "Genereren" wordt er iets in het model geschreven.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  TERREIN_CATEGORIEEN, WINDGEBIEDEN, berekenE,
  type TerreinCategorie, type Windgebied,
} from "./windEurocode";
import type { WindGeneratorApi } from "../../stores/windStore";
import { DoorsnedeSchema, PlattegrondSchema, KLEUR_DRUK, KLEUR_WIND, KLEUR_ZUIGING, ROL_KLEUR } from "./WindSchema";
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
  label, value, onChange, step = 0.1, min = 0, eenheid = "m", leeg,
}: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  step?: number; min?: number; eenheid?: string; leeg?: string;
}) {
  return (
    <label className="wgd-getal">
      <span>{label}</span>
      <input
        type="number" step={step} min={min}
        value={value ?? ""}
        placeholder={leeg}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      <span className="wgd-eenheid">{eenheid}</span>
    </label>
  );
}

export default function WindGeneratorDialog({ open, onClose, wind }: Props) {
  const { t } = useTranslation("common");
  const { instellingen: i, setInstellingen: set } = wind;
  const [gevalIndex, setGevalIndex] = useState(0);

  // Voorbeeld: puur rekenen, niets wegschrijven. Herrekent bij een wijziging
  // in de instellingen of in de constructie.
  const res = useMemo(
    () => (open ? wind.voorbeeld() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, i, wind.modelVersie],
  );

  if (!open) return null;
  const s = res?.samenvatting ?? null;
  const geo = res?.geometrie ?? null;
  const gevallen = s?.perGeval ?? [];
  const geval = gevallen[Math.min(gevalIndex, Math.max(0, gevallen.length - 1))] ?? null;
  const richtingVanGeval = geval
    ? (res?.gevallen.find((g) => g.sleutel === geval.sleutel)?.richting ?? null)
    : (i.richtingLinks ? "links" : i.richtingRechts ? "rechts" : i.richtingHaaks ? "haaks" : null);
  const fouten = res?.meldingen.filter((m) => m.niveau === "fout") ?? [];
  const overige = res?.meldingen.filter((m) => m.niveau !== "fout") ?? [];
  const toonGevelhoogte = geo !== null && !geo.heeftGevels;
  const e_m = geo ? berekenE(i.gebouwlengte_m, geo.h_m) : undefined;

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
                <div className="wgd-section-title">{t("wind.secPressure")}</div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>{t("wind.windZone")}</label>
                    <select value={i.windgebied} onChange={(e) => set({ windgebied: e.target.value as Windgebied })}>
                      {(Object.keys(WINDGEBIEDEN) as Windgebied[]).map((g) => (
                        <option key={g} value={g}>{WINDGEBIEDEN[g].omschrijving}</option>
                      ))}
                    </select>
                  </div>
                  <div className="wgd-field">
                    <label>{t("wind.terrainCategory")}</label>
                    <select value={i.terreincategorie} onChange={(e) => set({ terreincategorie: e.target.value as TerreinCategorie })}>
                      {(Object.keys(TERREIN_CATEGORIEEN) as TerreinCategorie[]).map((c) => (
                        <option key={c} value={c}>{TERREIN_CATEGORIEEN[c].omschrijving}</option>
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
                <div className="wgd-section-title">{t("wind.secFrame")}</div>
                <PlattegrondSchema
                  gebouwlengte_m={i.gebouwlengte_m}
                  d_m={geo?.d_m ?? 10}
                  hoh_m={i.hohSpant_m}
                  positie={i.positieSpant}
                  afstandTotKopgevel_m={i.afstandTotKopgevel_m}
                  richtingLinks={i.richtingLinks}
                  richtingRechts={i.richtingRechts}
                  richtingHaaks={i.richtingHaaks}
                  e_m={e_m}
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
                  <Getal label="h.o.h." value={i.hohSpant_m} onChange={(v) => set({ hohSpant_m: v ?? 0 })} />
                  <Getal label="b" value={i.gebouwlengte_m} step={0.5} onChange={(v) => set({ gebouwlengte_m: v ?? 0 })} />
                  {i.positieSpant === "tussenspant" && (
                    <Getal label={t("wind.distanceShort")} value={i.afstandTotKopgevel_m} step={0.5}
                      onChange={(v) => set({ afstandTotKopgevel_m: v ?? 0 })} />
                  )}
                  <Getal label={t("wind.loadWidthShort")} value={i.belastingbreedteOverride_m}
                    leeg={s ? nl(s.belastingbreedte_m, 2) : "auto"}
                    onChange={(v) => set({ belastingbreedteOverride_m: v })} />
                  {toonGevelhoogte && (
                    <Getal label={t("wind.gevelhoogte")} value={i.gevelhoogte_m} step={0.1}
                      leeg="0" onChange={(v) => set({ gevelhoogte_m: v })} />
                  )}
                </div>
                {toonGevelhoogte && <div className="wgd-hint">{t("wind.gevelhoogteHint")}</div>}
              </div>

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

              {geo?.heeftHellendDak && (
                <div className="wgd-section">
                  <div className="wgd-section-title">
                    {t("wind.secSlopedRoof")}
                    <span className="wgd-section-sub">{` α ≈ ${nl(geo.dakhelling_graden, 0)}°`}</span>
                  </div>
                  <div className="wgd-getallen">
                    <Getal label={t("wind.cpeWindwardShort")} value={i.cpeDakLoef} step={0.05} min={-3} eenheid="7.4a"
                      onChange={(v) => set({ cpeDakLoef: v })} />
                    <Getal label={t("wind.cpeLeewardShort")} value={i.cpeDakLij} step={0.05} min={-3} eenheid="7.4a"
                      onChange={(v) => set({ cpeDakLij: v })} />
                    {i.richtingHaaks && (
                      <Getal label={t("wind.cpePerpShort")} value={i.cpeDakHaaks} step={0.05} min={-3} eenheid="7.4b"
                        onChange={(v) => set({ cpeDakHaaks: v })} />
                    )}
                  </div>
                  <div className="wgd-hint">{t("wind.slopedRoofShort")}</div>
                </div>
              )}

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
                          {gv.naam.replace("Wind ", "").replace("wind ", "")}
                        </button>
                      ))}
                    </div>
                  )}
                  <DoorsnedeSchema
                    geometrie={geo}
                    richting={richtingVanGeval}
                    regels={geval?.regels ?? []}
                    gevelhoogte_m={i.gevelhoogte_m}
                    breedtePx={560}
                  />
                  <div className="wgd-legenda">
                    <span><i style={{ background: ROL_KLEUR.gevelLinks }} />{t("wind.legendWall")}</span>
                    <span><i style={{ background: ROL_KLEUR.dakPlat }} />{t("wind.legendRoof")}</span>
                    <span><i style={{ background: ROL_KLEUR.overstek }} />{t("wind.legendOverhang")}</span>
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
                      {` · h/d = ${nl(s.hOverD, 2)} · ${t("wind.loadWidthShort")} ${nl(s.belastingbreedte_m, 2)} m`}
                    </div>
                  )}
                </div>
              )}

              {geval && (
                <Klapblok kop={`${t("wind.showTable")} — ${geval.naam}`}>
                  <table className="wgd-table">
                    <thead>
                      <tr>
                        <th>{t("wind.colBeam")}</th><th>{t("wind.colZone")}</th>
                        <th>c_pe</th><th>c_pi</th>
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
                          <td className="num">{nl(r.cpi, 2)}</td>
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
                <Klapblok kop={`${t("wind.secDerivation")} — q_p = ${nl(s.stuwdruk.qp_kNm2, 3)} kN/m², z_e = ${nl(s.hoogte_m, 2)} m`}>
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
            <button className="wgd-btn primary" disabled={!res?.ok} onClick={() => { wind.genereer(); onClose(); }}>
              {t("wind.btnGenerate")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
