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
import type { LoadCase } from "./femTypes";
import { GEBRUIKSCATEGORIEEN } from "./femTypes";
import type { LoadCombination } from "./solver/combinations";
import {
  PARTIELE_FACTOREN, PSI_GEBRUIK, STANDAARD_CATEGORIE, type Gevolgklasse,
} from "./solver/normcombinaties";
import type { OvergeslagenCombinatie } from "../../lib/combinatieSelectie";
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
  addLoadCase: (name: string) => void;
  updateLoadCase: (id: number, patch: Partial<Omit<LoadCase, "id">>) => void;
  removeLoadCase: (id: number) => void;
  addCombination: (combo: Omit<LoadCombination, "id">) => void;
  updateCombination: (id: number, patch: Partial<Omit<LoadCombination, "id">>) => void;
  removeCombination: (id: number) => void;
}

const TYPE_OPTIONS: LoadCase["type"][] = ["dead", "live", "snow", "wind", "other"];
const TYPE_LABEL: Record<LoadCase["type"], string> = {
  dead: "Permanent (G)", live: "Variabel (Q)", snow: "Sneeuw (S)",
  wind: "Wind (W)", other: "Overig",
};

export default function LoadCasesDialog({
  open, onClose, initialTab = "cases",
  loadCases, combinations, overgeslagenCombinaties = [],
  belastingMeldingen = [], combinatieAfwijking = null, combinatieVervanging = null,
  onMaakVervangingOngedaan, onVervangDoorStandaard, onSluitAfwijking, onWindOpnieuw,
  gevolgklasse = "CC2",
  addLoadCase, updateLoadCase, removeLoadCase,
  addCombination, updateCombination, removeCombination,
}: Props) {
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
    const name = newCaseName.trim() || `Geval ${loadCases.length + 1}`;
    addLoadCase(name);
    setNewCaseName("");
  };

  const handleAddCombo = () => {
    const name = newComboName.trim() || `Combinatie ${combinations.length + 1}`;
    addCombination({
      name,
      type: "uls",
      formula: name,
      factors: new Map(),
    });
    setNewComboName("");
  };

  const bron = PARTIELE_FACTOREN[gevolgklasse].bron;

  return (
    <div className="lcd-overlay" onClick={onClose}>
      <div className="lcd-dialog" onClick={e => e.stopPropagation()}>
        <div className="lcd-header">
          <span className="lcd-title">Belastinggevallen & combinaties</span>
          <button className="lcd-close" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="lcd-tabs">
          <button className={`lcd-tab${tab === "cases" ? " active" : ""}`} onClick={() => setTab("cases")}>
            Gevallen ({loadCases.length}){aantalFouten > 0 ? ` — ${aantalFouten} fout` : ""}
          </button>
          <button className={`lcd-tab${tab === "combos" ? " active" : ""}`} onClick={() => setTab("combos")}>
            Combinaties ({combinations.length})
            {combinatieVervanging ? " — vervangen bij openen" : combinatieAfwijking ? " — melding" : ""}
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
                    <th>Naam</th>
                    <th style={{ width: 140 }}>Type</th>
                    <th style={{ width: 170 }} title="Gebruikscategorie volgens NEN-EN 1990 NB tabel NB.2–A1.1 — alleen voor veranderlijke belasting">
                      Categorie (ψ)
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
                          {TYPE_OPTIONS.map(t => (
                            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {lc.type === "live" ? (
                          <select
                            className="lcd-input"
                            value={lc.categorie ?? STANDAARD_CATEGORIE}
                            title={PSI_GEBRUIK[lc.categorie ?? STANDAARD_CATEGORIE].omschrijving}
                            onChange={(e) => updateLoadCase(lc.id, { categorie: e.target.value as LoadCase["categorie"] })}
                          >
                            {GEBRUIKSCATEGORIEEN.map((cat) => {
                              const ψ = PSI_GEBRUIK[cat];
                              return (
                                <option key={cat} value={cat} title={ψ.omschrijving}>
                                  {cat} — ψ {String(ψ.psi0).replace(".", ",")}/{String(ψ.psi1).replace(".", ",")}/{String(ψ.psi2).replace(".", ",")}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span className="lcd-td-leeg">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="lcd-row-btn lcd-row-btn-danger"
                          title="Verwijder belastinggeval, al zijn lasten en zijn factor in elke combinatie"
                          onClick={() => {
                            if (loadCases.length <= 1) {
                              alert("Minstens één belastinggeval is verplicht.");
                              return;
                            }
                            if (confirm(`Verwijder "${lc.name}"? Alle lasten in deze case worden ook verwijderd, en zijn factor verdwijnt uit elke combinatie.`)) {
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
                  placeholder={`Nieuw geval (bijv. "Geval ${loadCases.length + 1}")`}
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCase(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCase}>+ Toevoegen</button>
              </div>

              <p className="lcd-hint">
                Een nieuw geval heeft type “Overig” en telt pas mee als u het een type
                geeft: dan vullen de standaardcombinaties het aan (blijvend → γ<sub>G</sub>,
                veranderlijk, sneeuw en wind → een eigen beurt als leidende last en ψ als
                begeleidende). Elk veranderlijk geval komt daarbij voor in combinaties mét en
                zonder dat geval: een veranderlijke belasting telt alleen waar ze ongunstig
                werkt (vrije belasting, NEN-EN 1991-1-1 6.2.1(1)P), zodat een per veld verdeelde
                vloerlast ook op één veld staat. De factoren volgen NEN-EN 1990 {bron} en tabel
                NB.2–A1.1.
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
                  <p><strong>Combinaties vervangen bij het openen.</strong> {combinatieVervanging.samenvatting}</p>
                  <div className="lcd-afwijking-knoppen">
                    <button
                      className="lcd-btn-secondary"
                      title="Zet de combinaties terug zoals ze in het projectbestand stonden"
                      onClick={() => onMaakVervangingOngedaan?.()}
                    >
                      Ongedaan maken
                    </button>
                  </div>
                </div>
              )}
              {combinatieAfwijking && (
                <div className="lcd-afwijking">
                  <p>{combinatieAfwijking.samenvatting}</p>
                  <div className="lcd-afwijking-knoppen">
                    <button className="lcd-btn-secondary" onClick={() => onSluitAfwijking?.()}>
                      Sluiten
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
                          if (confirm("Alle combinaties (behalve die van de windgenerator) vervangen door de standaardset? Uw eigen combinaties gaan daarbij verloren.")) {
                            onVervangDoorStandaard?.();
                          }
                        }}
                      >
                        Vervang door standaardcombinaties
                      </button>
                    )}
                    {adviesMeldingen.some((m) => m.windOpnieuwAdvies) && onWindOpnieuw && (
                      <button className="lcd-btn-primary" onClick={() => onWindOpnieuw()}>
                        Windbelasting opnieuw genereren
                      </button>
                    )}
                  </div>
                </div>
              )}
              <table className="lcd-table lcd-table-combo">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Naam</th>
                    <th style={{ width: 80 }}>Type</th>
                    <th style={{ width: 70 }} title="Standaard = afgeleid uit de gevallen en de gevolgklasse; eigen = door u opgesteld of aangepast">Herkomst</th>
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
                          <option value="uls">ULS</option>
                          <option value="sls">SLS</option>
                        </select>
                      </td>
                      <td className="lcd-td-id" title={c.formula}>
                        {c.standaard ? "standaard" : "eigen"}
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
                          title="Verwijder combinatie"
                          onClick={() => {
                            if (confirm(`Verwijder combinatie "${c.name}"?`)) {
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
                  placeholder={`Nieuwe combinatie (bijv. "ULS eigen")`}
                  value={newComboName}
                  onChange={(e) => setNewComboName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCombo(); }}
                />
                <button className="lcd-btn-primary" onClick={handleAddCombo}>+ Toevoegen</button>
              </div>

              <p className="lcd-hint">
                Standaardcombinaties worden afgeleid uit de belastinggevallen en gevolgklasse{" "}
                {gevolgklasse} (γ uit NEN-EN 1990 {bron}, ψ uit tabel NB.2–A1.1) en lopen mee
                als u gevallen toevoegt, van type verandert of verwijdert; de combinaties van de
                windgenerator lopen op dezelfde manier mee. Wijzigt u een factor, naam of type,
                dan wordt het een eigen combinatie: die past de app daarna niet meer aan, maar
                controleert haar wel na elke wijziging. Bij het openen van een project van versie
                0.3.11 of ouder vervangt de app de oude standaardcombinaties door deze set, met een
                melding en Ongedaan maken; eigen combinaties blijven staan.
                Factor 0 (of leeg) = dat belastinggeval doet niet mee in deze combinatie.
                Negatieve factor mag — bijvoorbeeld <code>0.9·G + 1.5·W</code> voor uplift.
              </p>
            </>
          )}
        </div>

        <div className="lcd-footer">
          <button className="lcd-btn-secondary" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
