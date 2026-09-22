/**
 * LoadCasesDialog — manage belastinggevallen + combinaties from a single
 * modal. Two tabs:
 *   1. Gevallen — list of LoadCase with name + type editor, add / remove.
 *   2. Combinaties — list of LoadCombination with name/type editor and a
 *      per-case factor matrix. Add / remove combinations.
 *
 * Sinds september 2026 houdt de app de STANDAARDcombinaties bij wanneer een
 * geval wordt toegevoegd, van type verandert of verdwijnt (zie
 * lib/combinatieBeheer). Dit venster laat daarom zien welke combinatie
 * standaard is en welke eigen, en meldt in rood elk geval dat nergens meetelt
 * en elke fout in de combinaties zelf, met de actie die het oplost.
 *
 * Bij het openen van een ouder projectbestand vervangt de app verouderde
 * combinaties (besluit van september 2026; tot dan: melden, niet
 * overschrijven). Dit venster zegt dan wat er is vervangen, en draagt de knop
 * "Ongedaan maken" zolang dat kan.
 */
import { Fragment, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LoadCase } from "./femTypes";
import { GEBRUIKSCATEGORIEEN } from "./femTypes";
import type { LoadCombination } from "./solver/combinations";
import {
  partieleFactoren, psiGebruik, STANDAARD_CATEGORIE, type Gevolgklasse,
} from "./solver/normcombinaties";
import { STANDAARD_BIJLAGE, type NationaleBijlageCode } from "../../lib/normAanduidingen";
import type { OvergeslagenCombinatie } from "../../lib/combinatieSelectie";
import { isEigenGewichtGeval } from "../../lib/eigenGewicht";
import type {
  CombinatieAfwijking, CombinatieVervanging, GevalMelding,
} from "../../lib/combinatieBeheer";
import "./LoadCasesDialog.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional initial tab — defaults to "cases". */
  initialTab?: "cases" | "combos";
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  /**
   * Combinaties die dit model niet nodig heeft, met reden (zie
   * lib/combinatieSelectie). Ze blijven hier gewoon bewerkbaar — wie er iets
   * aan verandert, maakt er zijn eigen combinatie van en dan wordt hij weer
   * meegenomen. De regel eronder zegt waarom hij nu wegblijft.
   */
  overgeslagenCombinaties?: OvergeslagenCombinatie[];
  /** Wat er aan de gevallen niet meetelt (lib/combinatieBeheer). */
  belastingMeldingen?: GevalMelding[];
  /** Wat er bij het openen verder te melden was (wees-factoren e.d.); null = niets. */
  combinatieAfwijking?: CombinatieAfwijking | null;
  /** Wat er bij het openen aan combinaties is vervangen; null = niets. */
  combinatieVervanging?: CombinatieVervanging | null;
  /** Zet de combinaties uit het bestand terug. */
  onMaakVervangingOngedaan?: () => void;
  /** Vervang alle combinaties door de standaardset (de expliciete actie). */
  onVervangDoorStandaard?: () => void;
  /** Sluit de melding bij het openen zonder iets te veranderen. */
  onSluitAfwijking?: () => void;
  /** Open de windbelastinggenerator om verouderde windcombinaties opnieuw te maken. */
  onWindOpnieuw?: () => void;
  /** Gevolgklasse van het project, voor de uitleg bij de combinaties. */
  gevolgklasse?: Gevolgklasse;
  /**
   * Nationale bijlage waarmee de standaardcombinaties rekenen (normnaad); de
   * ψ-waarden in de keuzelijst en de bron bij de combinaties komen uit die rij.
   */
  bijlage?: NationaleBijlageCode;
  addLoadCase: (name: string) => void;
  updateLoadCase: (id: number, patch: Partial<Omit<LoadCase, "id">>) => void;
  removeLoadCase: (id: number) => void;
  addCombination: (combo: Omit<LoadCombination, "id">) => void;
  updateCombination: (id: number, patch: Partial<Omit<LoadCombination, "id">>) => void;
  removeCombination: (id: number) => void;
}

const TYPE_OPTIONS: LoadCase["type"][] = ["dead", "live", "snow", "wind", "other"];

export default function LoadCasesDialog({
  open, onClose, initialTab = "cases",
  loadCases, combinations, overgeslagenCombinaties = [],
  belastingMeldingen = [], combinatieAfwijking = null, combinatieVervanging = null,
  onMaakVervangingOngedaan, onVervangDoorStandaard, onSluitAfwijking, onWindOpnieuw,
  gevolgklasse = "CC2",
  bijlage = STANDAARD_BIJLAGE,
  addLoadCase, updateLoadCase, removeLoadCase,
  addCombination, updateCombination, removeCombination,
}: Props) {
  const { t } = useTranslation("common");
  const overgeslagenReden = new Map(
    overgeslagenCombinaties.map((o) => [o.id, o.reden] as const),
  );
  const [tab, setTab] = useState<"cases" | "combos">(initialTab);
  // Sync tab when dialog re-opens with a different initialTab.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const [newCaseName, setNewCaseName] = useState("");
  const [newComboName, setNewComboName] = useState("");

  if (!open) return null;

  const meldingenVan = (id: number) => belastingMeldingen.filter((m) => m.caseId === id);
  const modelMeldingen = belastingMeldingen.filter((m) => m.caseId === null);
  const aantalFouten = belastingMeldingen.filter((m) => m.niveau === "fout").length;
  // Meldingen over de combinaties zelf, met de actie die ze oplost.
  const adviesMeldingen = belastingMeldingen.filter((m) => m.vervangAdvies || m.windOpnieuwAdvies);

  const handleAddCase = () => {
    const name = newCaseName.trim() || t("loadCases.defaultCaseName", { n: loadCases.length + 1 });
    addLoadCase(name);
    setNewCaseName("");
  };

  const handleAddCombo = () => {
    const name = newComboName.trim() || t("loadCases.defaultComboName", { n: combinations.length + 1 });
    addCombination({
      name,
      type: "uls",
      formula: name,
      factors: new Map(),
    });
    setNewComboName("");
  };

  const bron = partieleFactoren(gevolgklasse, bijlage).bron;

  return (
    <div className="lcd-overlay" onClick={onClose}>
      <div className="lcd-dialog" onClick={e => e.stopPropagation()}>
        <div className="lcd-header">
          <span className="lcd-title">{t("loadCases.dialogTitle")}</span>
          <button className="lcd-close" onClick={onClose} aria-label={t("close")}>×</button>
        </div>

        <div className="lcd-tabs">
          <button className={`lcd-tab${tab === "cases" ? " active" : ""}`} onClick={() => setTab("cases")}>
            {t("loadCases.casesTab", { aantal: loadCases.length })}{aantalFouten > 0 ? ` — ${t("loadCases.errorCount", { count: aantalFouten })}` : ""}
          </button>
          <button className={`lcd-tab${tab === "combos" ? " active" : ""}`} onClick={() => setTab("combos")}>
            {t("loadCases.combosTab", { aantal: combinations.length })}
            {combinatieVervanging ? ` — ${t("loadCases.replacedOnOpen")}` : combinatieAfwijking ? ` — ${t("loadCases.notice")}` : ""}
          </button>
        </div>

        <div className="lcd-body">
          {tab === "cases" && (
            <>
              {modelMeldingen.map((m, i) => (
                <p key={`model-${i}`} className={`lcd-melding lcd-melding-${m.niveau}`}>{m.tekst}</p>
              ))}
              <table className="lcd-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>{t("loadCases.name")}</th>
                    <th style={{ width: 140 }}>{t("loadCases.type")}</th>
                    <th style={{ width: 170 }} title={t("loadCases.categoryTitle")}>
                      {t("loadCases.category")}
                    </th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadCases.map(lc => {
                    const meldingen = meldingenVan(lc.id);
                    return (
                    <Fragment key={lc.id}>
                    <tr>
                      <td className="lcd-td-id">{lc.id}</td>
                      <td>
                        <input
                          className="lcd-input"
                          value={lc.name}
                          onChange={(e) => updateLoadCase(lc.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="lcd-input"
                          value={lc.type}
                          onChange={(e) => updateLoadCase(lc.id, { type: e.target.value as LoadCase["type"] })}
                        >
                          {TYPE_OPTIONS.map(o => (
                            <option key={o} value={o}>{t(`loadCases.caseType.${o}`)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {lc.type === "live" ? (
                          <select
                            className="lcd-input"
                            value={lc.categorie ?? STANDAARD_CATEGORIE}
                            title={psiGebruik(lc.categorie ?? STANDAARD_CATEGORIE, bijlage).omschrijving}
                            onChange={(e) => updateLoadCase(lc.id, { categorie: e.target.value as LoadCase["categorie"] })}
                          >
                            {GEBRUIKSCATEGORIEEN.map((cat) => {
                              const ψ = psiGebruik(cat, bijlage);
                              return (
                                <option key={cat} value={cat} title={ψ.omschrijving}>
                                  {cat} — ψ {String(ψ.psi0).replace(".", ",")}/{String(ψ.psi1).replace(".", ",")}/{String(ψ.psi2).replace(".", ",")}
                                </option>
                              );
                            })}
                          </select>
                        ) : isEigenGewichtGeval(lc) ? (
                          <span className="lcd-td-leeg" title={t("loadCases.selfWeightCaseHint")}>
                            {t("loadCases.autoTag")}
                          </span>
                        ) : (
                          <span className="lcd-td-leeg">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="lcd-row-btn lcd-row-btn-danger"
                          title={t("loadCases.deleteCaseTitle")}
                          onClick={() => {
                            if (loadCases.length <= 1) {
                              alert(t("loadCases.atLeastOneCase"));
                              return;
                            }
                            if (confirm(t("loadCases.deleteCaseConfirm", { naam: lc.name }))) {
                              removeLoadCase(lc.id);
                            }
                          }}
                        >×</button>
                      </td>
                    </tr>
                    {meldingen.map((m, i) => (
                      <tr key={`m-${lc.id}-${i}`}>
                        <td colSpan={5} className={`lcd-melding lcd-melding-${m.niveau}`}>{m.tekst}</td>
                      </tr>
                    ))}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>

              <div className="lcd-add-row">
                <input
                  className="lcd-input lcd-add-input"
                  placeholder={t("loadCases.newCasePlaceholder", { voorbeeld: t("loadCases.defaultCaseName", { n: loadCases.length + 1 }) })}
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCase(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCase}>+ {t("loadCases.add")}</button>
              </div>

              <p className="lcd-hint">
                {t("loadCases.casesHintBeforeGamma")}<sub>G</sub>{t("loadCases.casesHintAfterGamma", { bron })}
              </p>
            </>
          )}

          {tab === "combos" && (
            <>
              {/* Bij het openen vervangen: wat, waarom, en de weg terug. Blijft
                  staan tot het ongedaan is gemaakt of een ander project wordt
                  geopend — de melding rechtsboven verdwijnt na een halve minuut. */}
              {combinatieVervanging && (
                <div className="lcd-afwijking">
                  <p><strong>{t("loadCases.replacedOnOpenTitle")}</strong> {combinatieVervanging.samenvatting}</p>
                  <div className="lcd-afwijking-knoppen">
                    <button
                      className="lcd-btn-secondary"
                      title={t("loadCases.undoReplaceTitle")}
                      onClick={() => onMaakVervangingOngedaan?.()}
                    >
                      {t("undo")}
                    </button>
                  </div>
                </div>
              )}
              {combinatieAfwijking && (
                <div className="lcd-afwijking">
                  <p>{combinatieAfwijking.samenvatting}</p>
                  <div className="lcd-afwijking-knoppen">
                    <button className="lcd-btn-secondary" onClick={() => onSluitAfwijking?.()}>
                      {t("close")}
                    </button>
                  </div>
                </div>
              )}
              {/* Een FOUT in de combinaties zelf (een ontbrekende standaard-
                  combinatie, delen van één veranderlijke belasting met
                  verschillende factoren, een belasting die nergens overheerst,
                  verouderde windcombinaties) staat hier met de actie die hem
                  oplost — altijd, ook in een project dat nooit een ouder bestand
                  was. */}
              {adviesMeldingen.length > 0 && (
                <div className="lcd-afwijking">
                  {adviesMeldingen.map((m, i) => (
                    <p key={`v-${i}`} className={`lcd-melding lcd-melding-${m.niveau}`}>{m.tekst}</p>
                  ))}
                  <div className="lcd-afwijking-knoppen">
                    {adviesMeldingen.some((m) => m.vervangAdvies) && (
                      <button
                        className="lcd-btn-primary"
                        onClick={() => {
                          if (confirm(t("loadCases.replaceConfirm"))) {
                            onVervangDoorStandaard?.();
                          }
                        }}
                      >
                        {t("loadCases.replaceWithStandard")}
                      </button>
                    )}
                    {adviesMeldingen.some((m) => m.windOpnieuwAdvies) && onWindOpnieuw && (
                      <button className="lcd-btn-primary" onClick={() => onWindOpnieuw()}>
                        {t("loadCases.regenerateWind")}
                      </button>
                    )}
                  </div>
                </div>
              )}
              <table className="lcd-table lcd-table-combo">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>{t("loadCases.name")}</th>
                    <th style={{ width: 80 }}>{t("loadCases.type")}</th>
                    <th style={{ width: 70 }} title={t("loadCases.originTitle")}>{t("loadCases.origin")}</th>
                    {loadCases.map(lc => (
                      <th key={lc.id} style={{ width: 70 }} title={lc.name}>
                        γ·{lc.name}
                      </th>
                    ))}
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {combinations.map(c => {
                    const reden = overgeslagenReden.get(c.id);
                    return (
                    <Fragment key={c.id}>
                    <tr style={reden ? { opacity: 0.6 } : undefined}>
                      <td className="lcd-td-id">{c.id}</td>
                      <td>
                        <input
                          className="lcd-input"
                          value={c.name}
                          title={c.formula}
                          onChange={(e) => updateCombination(c.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="lcd-input"
                          value={c.type}
                          onChange={(e) => updateCombination(c.id, { type: e.target.value as LoadCombination["type"] })}
                        >
                          <option value="uls">{t("loadCases.uls")}</option>
                          <option value="sls">{t("loadCases.sls")}</option>
                        </select>
                      </td>
                      <td className="lcd-td-id" title={c.formula}>
                        {c.standaard ? t("loadCases.originStandard") : t("loadCases.originCustom")}
                      </td>
                      {loadCases.map(lc => {
                        const f = c.factors.get(lc.id) ?? 0;
                        return (
                          <td key={lc.id}>
                            <input
                              className="lcd-input lcd-input-factor"
                              type="number" step="0.05"
                              value={f}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                const next = new Map(c.factors);
                                if (isNaN(v) || v === 0) next.delete(lc.id);
                                else next.set(lc.id, v);
                                updateCombination(c.id, { factors: next });
                              }}
                            />
                          </td>
                        );
                      })}
                      <td>
                        <button
                          className="lcd-row-btn lcd-row-btn-danger"
                          title={t("loadCases.deleteComboTitle")}
                          onClick={() => {
                            if (confirm(t("loadCases.deleteComboConfirm", { naam: c.name }))) {
                              removeCombination(c.id);
                            }
                          }}
                        >×</button>
                      </td>
                    </tr>
                    {reden && (
                      <tr>
                        <td colSpan={5 + loadCases.length} className="lcd-combo-note">
                          {reden}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>

              <div className="lcd-add-row">
                <input
                  className="lcd-input lcd-add-input"
                  placeholder={t("loadCases.newComboPlaceholder")}
                  value={newComboName}
                  onChange={(e) => setNewComboName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCombo(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCombo}>+ {t("loadCases.add")}</button>
              </div>

              <p className="lcd-hint">
                {t("loadCases.combosHint", { klasse: gevolgklasse, bron })}{" "}
                <code>0.9·G + 1.5·W</code> {t("loadCases.combosHintUplift")}
              </p>
            </>
          )}
        </div>

        <div className="lcd-footer">
          <button className="lcd-btn-secondary" onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
