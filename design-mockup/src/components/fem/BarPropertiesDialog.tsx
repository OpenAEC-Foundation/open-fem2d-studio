/**
 * BarPropertiesDialog — modal dialog opened by double-clicking a beam.
 *
 * Floating modal with tabs to edit beam properties:
 * (Algemeen / EN 1993 of EN 1995 op basis van het materiaal), footer met
 * Annuleer/OK. OK persists edits via onUpdate → updateBeam: materiaal,
 * profiel, releases én de per-staaf toetsconfiguratie (Beam.checkConfig).
 *
 * Toetsconfiguratie-conventies:
 *  - Kniklengte-velden leeg = systeemlengte (builder-default).
 *  - Kipsteunen: fracties 0..1 van de staaflengte (bovenflens), gescheiden
 *    door komma's en/of spaties — bijv. "0.5" of "0.25 0.5 0.75". Dit is
 *    dezelfde conventie als LateralBracing.top_flange_positions in de
 *    Rust-kern. Ongeldige waarden (buiten 0..1) worden bij OK verwijderd.
 *  - Hout toont géén zeeg-veld: de EN 1995-kern consumeert geen zeeg, dus
 *    dat veld zou schijninvoer zijn.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Beam, BeamCheckConfig, BeamReleases, Node } from "./femTypes";
import { useCheckStore } from "../../stores/checkStore";
import { isSteelCheckResult } from "../../lib/checkTypes";
import { matchSupportedTimberGrade } from "../../lib/timberCheckBuilder";
import { sanitizeRestraintFractions } from "../../lib/steelCheckBuilder";
import ProfielKiezer from "./ProfielKiezer";
import "./BarPropertiesDialog.css";

export const STEEL_GRADES = ["S235", "S275", "S355", "S420", "S460"];

/** Suggesties voor de profiel-combobox: staalprofielen + houtdoorsneden. */
export const PROFILE_SUGGESTIONS = [
  "HEA100", "HEA140", "HEA160", "HEA200", "HEA240", "HEA300",
  "HEB160", "HEB200", "HEB240", "HEB300",
  "IPE160", "IPE200", "IPE240", "IPE300", "IPE360",
  "UNP160", "UNP200", "UNP240",
  // Houtdoorsneden — conventie b×h in mm; vrij typbaar (bijv. "96x450 GL").
  "38x89", "44x146", "60x100", "71x171", "96x281", "96x450 GL",
];

/** Kipsteun-invoer ("0.25, 0.5 0.75") → fracties; filtering/sortering bij OK. */
export function parseRestraintInput(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .filter((s) => s.length > 0)
    .map((s) => parseFloat(s.replace(",", ".")))
    .filter((f) => Number.isFinite(f));
}

interface Props {
  beam: Beam;
  nodes: Node[];
  /** Element forces from the most-recent solver result, if any. */
  beamForces?: { N: number; V: number; M_start: number; M_end: number } | null;
  /** Persist material/profile/releases/checkConfig edits back to the store. */
  onUpdate?: (updates: Partial<Beam>) => void;
  onClose: () => void;
}

export default function BarPropertiesDialog({ beam, nodes, beamForces, onUpdate, onClose }: Props) {
  const { t } = useTranslation("check");
  const [tab, setTab] = useState<"general" | "norm">("general");
  // Normtoetsingsresultaat van deze staaf (staal of hout) uit de laatste run.
  const memberResult = useCheckStore(
    (s) => s.results.find((r) => r.beam_id === beam.id) ?? null,
  );
  // Hydrate from the beam so re-opening shows previously-saved values.
  const [material, setMaterial] = useState(beam.material ?? "S235");
  const [profile, setProfile]   = useState(beam.profile  ?? "HEA160");
  // ProfielKiezer-wizard (profiel + materiaal als één combinatie) — de keuze
  // landt in de lokale dialoogstate en wordt pas bij OK gecommit.
  const [kiezerOpen, setKiezerOpen] = useState(false);
  const [releases, setReleases] = useState<Required<BeamReleases>>({
    startTx: beam.releases?.startTx ?? false,
    startTz: beam.releases?.startTz ?? false,
    startRy: beam.releases?.startRy ?? false,
    endTx:   beam.releases?.endTx   ?? false,
    endTz:   beam.releases?.endTz   ?? false,
    endRy:   beam.releases?.endRy   ?? false,
  });

  // ── Toetsconfiguratie (Beam.checkConfig) ─────────────────────────────────
  // Getalvelden als string zodat "leeg" = builder-default kan blijven.
  const cfg0 = beam.checkConfig ?? {};
  const [lcyStr, setLcyStr] = useState(cfg0.bucklingLengthY_m?.toString() ?? "");
  const [lczStr, setLczStr] = useState(cfg0.bucklingLengthZ_m?.toString() ?? "");
  const [restraintsStr, setRestraintsStr] = useState(
    cfg0.lateralRestraints?.join(", ") ?? "",
  );
  const [deflClass, setDeflClass] = useState<NonNullable<BeamCheckConfig["deflectionClass"]>>(
    cfg0.deflectionClass ?? "floor",
  );
  const [deflNStr, setDeflNStr] = useState(cfg0.deflectionLimitNumerator?.toString() ?? "");
  const [preCamberStr, setPreCamberStr] = useState(
    cfg0.preCamber_mm !== undefined && cfg0.preCamber_mm !== 0
      ? cfg0.preCamber_mm.toString() : "",
  );
  const [serviceClass, setServiceClass] = useState<1 | 2 | 3>(cfg0.serviceClass ?? 1);
  const [loadDuration, setLoadDuration] = useState<NonNullable<BeamCheckConfig["loadDuration"]>>(
    cfg0.loadDuration ?? "medium",
  );

  // Welke norm-velden tonen we? Live op het materiaal in de dialoog, zodat
  // wisselen van materiaal in het Algemeen-tabblad meteen doorwerkt.
  const isTimber = matchSupportedTimberGrade(material) !== null;

  /**
   * Bouw een schone checkConfig: alleen expliciet ingevulde waarden; alles
   * op default → undefined zodat het Beam-object (en het projectbestand)
   * geen dode velden meesleept. Verborgen velden (bijv. kniklengtes bij
   * hout) behouden hun eerdere waarde — wisselen van materiaal gooit geen
   * configuratie weg.
   */
  const buildCheckConfig = (): BeamCheckConfig | undefined => {
    const cfg: BeamCheckConfig = {};
    const lcy = parseFloat(lcyStr.replace(",", "."));
    if (lcyStr.trim() !== "" && Number.isFinite(lcy) && lcy > 0) cfg.bucklingLengthY_m = lcy;
    const lcz = parseFloat(lczStr.replace(",", "."));
    if (lczStr.trim() !== "" && Number.isFinite(lcz) && lcz > 0) cfg.bucklingLengthZ_m = lcz;
    const restraints = sanitizeRestraintFractions(parseRestraintInput(restraintsStr));
    if (restraints.length > 0) cfg.lateralRestraints = restraints;
    if (deflClass !== "floor") cfg.deflectionClass = deflClass;
    if (deflClass === "custom") {
      const n = parseFloat(deflNStr.replace(",", "."));
      if (Number.isFinite(n) && n > 0) cfg.deflectionLimitNumerator = n;
    }
    const camber = parseFloat(preCamberStr.replace(",", "."));
    if (preCamberStr.trim() !== "" && Number.isFinite(camber) && camber !== 0) {
      cfg.preCamber_mm = camber;
    }
    if (serviceClass !== 1) cfg.serviceClass = serviceClass;
    if (loadDuration !== "medium") cfg.loadDuration = loadDuration;
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  };

  const handleConfirm = () => {
    onUpdate?.({ material, profile, releases, checkConfig: buildCheckConfig() });
    onClose();
  };

  const nA = nodes.find(n => n.id === beam.from);
  const nB = nodes.find(n => n.id === beam.to);
  const length = nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) : 0;
  const angle  = nA && nB ? (Math.atan2(nB.z - nA.z, nB.x - nA.x) * 180 / Math.PI) : 0;
  const systemLengthM = (length / 1000).toFixed(2);

  const deflClassOptions: Array<{ value: NonNullable<BeamCheckConfig["deflectionClass"]>; label: string }> = [
    { value: "floor",      label: t("cfg.deflFloor") },
    { value: "roof",       label: t("cfg.deflRoof") },
    { value: "cantilever", label: t("cfg.deflCantilever") },
    { value: "custom",     label: t("cfg.deflCustom") },
  ];

  const durationOptions: Array<{ value: NonNullable<BeamCheckConfig["loadDuration"]>; label: string }> = [
    { value: "permanent",     label: t("cfg.durPermanent") },
    { value: "long",          label: t("cfg.durLong") },
    { value: "medium",        label: t("cfg.durMedium") },
    { value: "short",         label: t("cfg.durShort") },
    { value: "instantaneous", label: t("cfg.durInstantaneous") },
  ];

  /** Gedeelde doorbuigingssectie (klasse + L/n; zeeg alleen voor staal). */
  const deflectionSection = (
    <div className="bar-props-section">
      <div className="bar-props-section-title">{t("cfg.deflectionTitle")}</div>
      <div className="bar-props-row">
        <span>{t("cfg.deflClass")}</span>
        <select
          className="bar-props-select"
          value={deflClass}
          onChange={(e) => setDeflClass(e.target.value as NonNullable<BeamCheckConfig["deflectionClass"]>)}
        >
          {deflClassOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {deflClass === "custom" && (
        <div className="bar-props-row">
          <span>{t("cfg.deflNumerator")}</span>
          <input
            type="number" className="bar-props-input" step="1" min="1"
            placeholder="333"
            value={deflNStr}
            onChange={(e) => setDeflNStr(e.target.value)}
          />
        </div>
      )}
      {deflClass === "custom" && isTimber && (
        <div className="bar-props-hint">{t("cfg.deflCustomTimberHint")}</div>
      )}
      {!isTimber && (
        <div className="bar-props-row">
          <span>{t("cfg.preCamber")}</span>
          <input
            type="number" className="bar-props-input" step="1"
            placeholder="0"
            value={preCamberStr}
            onChange={(e) => setPreCamberStr(e.target.value)}
          />
        </div>
      )}
      {!isTimber && <div className="bar-props-hint">{t("cfg.preCamberHint")}</div>}
    </div>
  );

  return (
    <div className="bar-props-overlay" onClick={onClose}>
      <div className="bar-props-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="bar-props-header">
          <h2 className="bar-props-title">Eigenschappen balk #{beam.id}</h2>
          <button className="bar-props-close" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="bar-props-tabs">
          <button
            className={`bar-props-tab${tab === "general" ? " active" : ""}`}
            onClick={() => setTab("general")}
          >Algemeen</button>
          <button
            className={`bar-props-tab${tab === "norm" ? " active" : ""}`}
            onClick={() => setTab("norm")}
          >{isTimber ? "EN 1995" : "EN 1993"}</button>
        </div>

        <div className="bar-props-body">
          {tab === "general" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">Geometrie</div>
                <div className="bar-props-row"><span>ID</span><code>{beam.id}</code></div>
                <div className="bar-props-row"><span>Knoop A</span><code>{beam.from}</code></div>
                <div className="bar-props-row"><span>Knoop B</span><code>{beam.to}</code></div>
                <div className="bar-props-row"><span>Lengte</span><code>{(length / 1000).toFixed(3)} m</code></div>
                <div className="bar-props-row"><span>Hoek</span><code>{angle.toFixed(1)}°</code></div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Doorsnede</div>
                {/* Profiel en materiaal zijn één combinatie — de wizard
                    (ProfielKiezer) vervangt de losse invoervelden. */}
                <div className="bar-props-row">
                  <span>Profiel</span>
                  <code>{profile} — {material}</code>
                </div>
                <div className="bar-props-row">
                  <span></span>
                  <button
                    className="bar-props-btn-secondary"
                    onClick={() => setKiezerOpen(true)}
                    title="Kies profiel én materiaal in één stap (wizard)"
                  >
                    Profiel kiezen…
                  </button>
                </div>
                {kiezerOpen && (
                  <ProfielKiezer
                    open
                    onClose={() => setKiezerOpen(false)}
                    huidig={{ material, profile }}
                    onApply={(keuze) => {
                      setMaterial(keuze.material);
                      setProfile(keuze.profile);
                    }}
                  />
                )}
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">Scharnieren (releases)</div>
                <table className="bar-props-release-table">
                  <thead>
                    <tr><th></th><th>uX</th><th>uZ</th><th>φY</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Start A</td>
                      <td><input type="checkbox" checked={releases.startTx}
                        onChange={(e) => setReleases(r => ({ ...r, startTx: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.startTz}
                        onChange={(e) => setReleases(r => ({ ...r, startTz: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.startRy}
                        onChange={(e) => setReleases(r => ({ ...r, startRy: e.target.checked }))} /></td>
                    </tr>
                    <tr>
                      <td>Eind B</td>
                      <td><input type="checkbox" checked={releases.endTx}
                        onChange={(e) => setReleases(r => ({ ...r, endTx: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.endTz}
                        onChange={(e) => setReleases(r => ({ ...r, endTz: e.target.checked }))} /></td>
                      <td><input type="checkbox" checked={releases.endRy}
                        onChange={(e) => setReleases(r => ({ ...r, endRy: e.target.checked }))} /></td>
                    </tr>
                  </tbody>
                </table>
                <div className="bar-props-hint">Aangevinkt = vrijheidsgraad ontkoppeld (scharnier)</div>
              </div>

              {beamForces && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">Krachten (huidige resultaat)</div>
                  <div className="bar-props-row"><span>N</span><code>{(beamForces.N / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>V</span><code>{(beamForces.V / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>M_start</span><code>{(beamForces.M_start / 1e6).toFixed(2)} kNm</code></div>
                  <div className="bar-props-row"><span>M_end</span><code>{(beamForces.M_end / 1e6).toFixed(2)} kNm</code></div>
                </div>
              )}
            </>
          )}

          {tab === "norm" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">Materiaal + doorsnede</div>
                <div className="bar-props-row"><span>Materiaal</span><code>{material}</code></div>
                <div className="bar-props-row"><span>Profiel</span><code>{profile}</code></div>
                <div className="bar-props-row">
                  <span>Norm</span>
                  <code>{isTimber ? "NEN-EN 1995-1-1" : "NEN-EN 1993-1-1"}</code>
                </div>
              </div>

              {!isTimber && (
                <>
                  <div className="bar-props-section">
                    <div className="bar-props-section-title">{t("cfg.bucklingTitle")}</div>
                    <div className="bar-props-row">
                      <span>L_cr,y (m)</span>
                      <input
                        type="number" className="bar-props-input" step="0.1" min="0"
                        placeholder={systemLengthM}
                        value={lcyStr}
                        onChange={(e) => setLcyStr(e.target.value)}
                      />
                    </div>
                    <div className="bar-props-row">
                      <span>L_cr,z (m)</span>
                      <input
                        type="number" className="bar-props-input" step="0.1" min="0"
                        placeholder={systemLengthM}
                        value={lczStr}
                        onChange={(e) => setLczStr(e.target.value)}
                      />
                    </div>
                    <div className="bar-props-hint">{t("cfg.bucklingHint")}</div>
                  </div>

                  <div className="bar-props-section">
                    <div className="bar-props-section-title">{t("cfg.bracingTitle")}</div>
                    <div className="bar-props-row">
                      <span>{t("cfg.bracingLabel")}</span>
                      <input
                        type="text" className="bar-props-input"
                        placeholder="0.25, 0.5, 0.75"
                        value={restraintsStr}
                        onChange={(e) => setRestraintsStr(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                    <div className="bar-props-hint">{t("cfg.bracingHint")}</div>
                  </div>
                </>
              )}

              {isTimber && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">{t("cfg.timberTitle")}</div>
                  <div className="bar-props-row">
                    <span>{t("cfg.serviceClass")}</span>
                    <select
                      className="bar-props-select"
                      value={serviceClass}
                      onChange={(e) => setServiceClass(Number(e.target.value) as 1 | 2 | 3)}
                    >
                      <option value={1}>{t("cfg.sc1")}</option>
                      <option value={2}>{t("cfg.sc2")}</option>
                      <option value={3}>{t("cfg.sc3")}</option>
                    </select>
                  </div>
                  <div className="bar-props-row">
                    <span>{t("cfg.loadDuration")}</span>
                    <select
                      className="bar-props-select"
                      value={loadDuration}
                      onChange={(e) => setLoadDuration(e.target.value as NonNullable<BeamCheckConfig["loadDuration"]>)}
                    >
                      {durationOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bar-props-hint">{t("cfg.timberHint")}</div>
                </div>
              )}

              {deflectionSection}

              <div className="bar-props-section">
                <div className="bar-props-section-title">Toetsing (UC)</div>
                {memberResult ? (
                  <>
                    <table className="bar-props-uc-table">
                      <thead><tr><th>Toets</th><th>UC</th><th>Status</th></tr></thead>
                      <tbody>
                        {memberResult.checks.map((named) => {
                          const calc = named.kind.data;
                          const uc = calc.uc?.uc ?? null;
                          const status = calc.status;
                          return (
                            <tr key={named.id}>
                              <td>{calc.title} ({calc.article})</td>
                              <td>{uc !== null ? uc.toFixed(2) : "—"}</td>
                              <td className={
                                status === "Ok" ? "bar-props-uc-ok" :
                                status === "NotOk" ? "bar-props-uc-notok" : "bar-props-uc-pending"
                              }>
                                {status === "Ok" ? "✓ OK" : status === "NotOk" ? "✗ Niet OK" : "N.v.t."}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="bar-props-hint">
                      Maatgevend: {memberResult.governing_check_id} — UC {memberResult.uc_max.toFixed(2)}.
                      Volledige afleiding: tabblad Toetsing → Toetsingspaneel.
                    </div>
                    {(isTimber === isSteelCheckResult(memberResult)) && (
                      <div className="bar-props-hint">{t("cfg.staleResultHint")}</div>
                    )}
                  </>
                ) : (
                  <div className="bar-props-hint">
                    Nog niet getoetst — draai de normtoetsing via het ribbon-tabblad
                    "Toetsing" (knop "Staal + hout toetsen").
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bar-props-footer">
          <button className="bar-props-btn-secondary" onClick={onClose}>Annuleer</button>
          <button className="bar-props-btn-primary" onClick={handleConfirm}>OK</button>
        </div>
      </div>
    </div>
  );
}
