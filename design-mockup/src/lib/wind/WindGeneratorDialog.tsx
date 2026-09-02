/**
 * WindGeneratorDialog — invoerscherm + controleerbare samenvatting van de
 * windbelastinggenerator.
 *
 * Links de invoer (windrichting, belastingbreedte, positie van het spant,
 * inwendige druk, stuwdrukbron), rechts een LIVE voorbeeld: de stuwdruk met
 * de volledige afleiding, per belastinggeval de vlakken met hun vormfactor en
 * de resulterende lijnlast, en alle meldingen. Pas bij "Genereren" wordt er
 * iets in het model geschreven.
 *
 * Het scherm woont bewust naast de generator in src/lib/wind: invoer,
 * berekening en verantwoording horen bij elkaar.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  TERREIN_CATEGORIEEN, WINDGEBIEDEN,
  type TerreinCategorie, type Windgebied,
} from "./windEurocode";
import type { WindGeneratorApi } from "../../stores/windStore";
import "./WindGeneratorDialog.css";

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

interface Props {
  open: boolean;
  onClose: () => void;
  wind: WindGeneratorApi;
}

export default function WindGeneratorDialog({ open, onClose, wind }: Props) {
  const { t } = useTranslation("common");
  const { instellingen: i, setInstellingen: set } = wind;

  // Voorbeeld: puur rekenen, niets wegschrijven (voorbeeld() schrijft bewust
  // geen state — dit draait tijdens de render). Herrekent bij een wijziging
  // in de instellingen of in de constructie.
  const res = useMemo(
    () => (open ? wind.voorbeeld() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, i, wind.modelVersie],
  );

  if (!open) return null;
  const s = res?.samenvatting ?? null;

  return (
    <div className="wgd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wgd-dialog">
        <div className="wgd-header">
          <span className="wgd-title">{t("wind.title")}</span>
          <button className="wgd-close" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="wgd-body">
          <div className="wgd-cols">
            {/* ── Invoer ──────────────────────────────────────────────── */}
            <div>
              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secPressure")}</div>
                <div className="wgd-field">
                  <label>{t("wind.windZoneFromProject")}</label>
                  <select
                    value={i.windgebied}
                    onChange={(e) => set({ windgebied: e.target.value as Windgebied })}
                  >
                    {(Object.keys(WINDGEBIEDEN) as Windgebied[]).map((g) => (
                      <option key={g} value={g}>{WINDGEBIEDEN[g].omschrijving}</option>
                    ))}
                  </select>
                </div>
                <div className="wgd-field">
                  <label>{t("wind.terrainCategory")}</label>
                  <select
                    value={i.terreincategorie}
                    onChange={(e) => set({ terreincategorie: e.target.value as TerreinCategorie })}
                  >
                    {(Object.keys(TERREIN_CATEGORIEEN) as TerreinCategorie[]).map((c) => (
                      <option key={c} value={c}>{TERREIN_CATEGORIEEN[c].omschrijving}</option>
                    ))}
                  </select>
                </div>
                <div className="wgd-field">
                  <label>{t("wind.qpSource")}</label>
                  <select
                    value={i.stuwdrukBron}
                    onChange={(e) => set({ stuwdrukBron: e.target.value as "berekend" | "handmatig" })}
                  >
                    <option value="berekend">{t("wind.qpCalculated")}</option>
                    <option value="handmatig">{t("wind.qpManual")}</option>
                  </select>
                </div>
                {i.stuwdrukBron === "handmatig" && (
                  <div className="wgd-field">
                    <label>{t("wind.qpValue")}</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={i.qpHandmatig_kNm2}
                      onChange={(e) => set({ qpHandmatig_kNm2: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secDirections")}</div>
                <label className="wgd-check">
                  <input type="checkbox" checked={i.richtingLinks}
                    onChange={(e) => set({ richtingLinks: e.target.checked })} />
                  {t("wind.windLeft")}
                </label>
                <label className="wgd-check">
                  <input type="checkbox" checked={i.richtingRechts}
                    onChange={(e) => set({ richtingRechts: e.target.checked })} />
                  {t("wind.windRight")}
                </label>
                <label className="wgd-check">
                  <input type="checkbox" checked={i.richtingHaaks}
                    onChange={(e) => set({ richtingHaaks: e.target.checked })} />
                  {t("wind.windPerpendicular")}
                </label>
                <div className="wgd-field">
                  <label>{t("wind.cpi")}</label>
                  <select
                    value={i.cpiKeuze}
                    onChange={(e) => set({ cpiKeuze: e.target.value as typeof i.cpiKeuze })}
                  >
                    <option value="beide">{t("wind.cpiBoth")}</option>
                    <option value="plus">{t("wind.cpiPlus")}</option>
                    <option value="min">{t("wind.cpiMinus")}</option>
                    <option value="handmatig">{t("wind.cpiManual")}</option>
                  </select>
                </div>
                {i.cpiKeuze === "handmatig" && (
                  <div className="wgd-field">
                    <label>c_pi</label>
                    <input type="number" step="0.05" value={i.cpiHandmatig}
                      onChange={(e) => set({ cpiHandmatig: Number(e.target.value) })} />
                  </div>
                )}
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secFrame")}</div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>{t("wind.spacing")}</label>
                    <input type="number" step="0.1" min="0" value={i.hohSpant_m}
                      onChange={(e) => set({ hohSpant_m: Number(e.target.value) })} />
                  </div>
                  <div className="wgd-field">
                    <label>{t("wind.position")}</label>
                    <select
                      value={i.positieSpant}
                      onChange={(e) => set({ positieSpant: e.target.value as "tussenspant" | "kopgevelspant" })}
                    >
                      <option value="tussenspant">{t("wind.positionInner")}</option>
                      <option value="kopgevelspant">{t("wind.positionGable")}</option>
                    </select>
                  </div>
                </div>
                <div className="wgd-hint">{t("wind.positionHint")}</div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>{t("wind.loadWidth")}</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={i.belastingbreedteOverride_m ?? ""}
                      onChange={(e) => set({
                        belastingbreedteOverride_m: e.target.value === "" ? null : Number(e.target.value),
                      })}
                    />
                  </div>
                  <div className="wgd-field">
                    <label>{t("wind.buildingLength")}</label>
                    <input type="number" step="0.5" min="0" value={i.gebouwlengte_m}
                      onChange={(e) => set({ gebouwlengte_m: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="wgd-field">
                  <label>{t("wind.distanceToGable")}</label>
                  <input type="number" step="0.5" min="0" value={i.afstandTotKopgevel_m}
                    onChange={(e) => set({ afstandTotKopgevel_m: Number(e.target.value) })} />
                </div>
                <div className="wgd-hint">{t("wind.distanceHint")}</div>
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secSlopedRoof")}</div>
                <div className="wgd-hint">{t("wind.slopedRoofHint")}</div>
                <div className="wgd-row">
                  <div className="wgd-field">
                    <label>{t("wind.cpeWindward")}</label>
                    <input type="number" step="0.05" value={i.cpeDakLoef ?? ""}
                      onChange={(e) => set({ cpeDakLoef: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div className="wgd-field">
                    <label>{t("wind.cpeLeeward")}</label>
                    <input type="number" step="0.05" value={i.cpeDakLij ?? ""}
                      onChange={(e) => set({ cpeDakLij: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                </div>
                {i.richtingHaaks && (
                  <div className="wgd-field">
                    <label>{t("wind.cpePerpendicular")}</label>
                    <input type="number" step="0.05" value={i.cpeDakHaaks ?? ""}
                      onChange={(e) => set({ cpeDakHaaks: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                )}
              </div>

              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secOutput")}</div>
                <label className="wgd-check">
                  <input type="checkbox" checked={i.combinatiesGenereren}
                    onChange={(e) => set({ combinatiesGenereren: e.target.checked })} />
                  {t("wind.generateCombos")}
                </label>
              </div>
            </div>

            {/* ── Samenvatting ────────────────────────────────────────── */}
            <div>
              <div className="wgd-section">
                <div className="wgd-section-title">{t("wind.secMessages")}</div>
                {res?.meldingen.length === 0 && <div className="wgd-hint">{t("wind.noMessages")}</div>}
                {res?.meldingen.map((m, k) => (
                  <div key={k} className={`wgd-melding ${m.niveau}`}>{m.tekst}</div>
                ))}
              </div>

              {s && (
                <>
                  <div className="wgd-section">
                    <div className="wgd-section-title">{t("wind.secDerivation")}</div>
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
                    <div className="wgd-hint">
                      {t("wind.summaryGeometry", {
                        h: nl(s.hoogte_m, 2), d: nl(s.spanwijdte_m, 2),
                        hd: nl(s.hOverD, 3), b: nl(s.belastingbreedte_m, 2),
                      })}
                    </div>
                  </div>

                  <div className="wgd-section">
                    <div className="wgd-section-title">
                      {t("wind.secSurfaces")} — {t(
                        i.combinatiesGenereren ? "wind.summaryCountsCombos" : "wind.summaryCounts",
                        {
                          cases: s.perGeval.length,
                          loads: res?.lasten.length ?? 0,
                          combos: res?.combinaties.length ?? 0,
                        },
                      )}
                    </div>
                    {s.perGeval.map((gv) => (
                      <div key={gv.sleutel}>
                        <div className="wgd-geval-kop">{gv.naam}</div>
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
                            {gv.regels.map((r, k) => (
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
                      </div>
                    ))}
                  </div>
                </>
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
            <button className="wgd-btn" onClick={() => wind.wis()}>
              {t("wind.btnClear")}
            </button>
            <button className="wgd-btn" onClick={onClose}>{t("close")}</button>
            <button
              className="wgd-btn primary"
              disabled={!res?.ok}
              onClick={() => { wind.genereer(); onClose(); }}
            >
              {t("wind.btnGenerate")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
