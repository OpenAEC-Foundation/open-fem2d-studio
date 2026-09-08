import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, setSetting } from "../../store";
import {
  WINDGEBIEDEN, TERREIN_CATEGORIEEN,
  type Windgebied, type TerreinCategorie,
} from "../../lib/wind/windEurocode";
import {
  normOordelen, normStanden, normenUitToetsen, zetNormStand,
  type NormOordeel, type NormSleutel, type NormStand,
} from "../../lib/normenInRapport";
import { useCheckStore } from "../../stores/checkStore";
import { usedNorms } from "../report/checkReportUtils";
import "./ProjectSettingsDialog.css";

interface ProjectSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Gevolgklasse volgens EN 1990 bijlage B: bepaalt de betrouwbaarheidsfactor
 * K_FI waarmee de ongunstige belastingen in de UGT worden vermenigvuldigd.
 * CC1 = 0,9 (geringe gevolgen), CC2 = 1,0 (normaal, standaard),
 * CC3 = 1,1 (grote gevolgen).
 */
export type Gevolgklasse = "CC1" | "CC2" | "CC3";

export const K_FI: Record<Gevolgklasse, number> = { CC1: 0.9, CC2: 1.0, CC3: 1.1 };

export const GEVOLGKLASSE_OMSCHRIJVING: Record<Gevolgklasse, string> = {
  CC1: "Geringe gevolgen — K_FI = 0,90",
  CC2: "Normale gevolgen — K_FI = 1,00",
  CC3: "Grote gevolgen — K_FI = 1,10",
};

/**
 * Ontwerplevensduurklasse volgens EN 1990 tabel 2.1 — bepaalt de beoogde
 * gebruiksduur en werkt door in o.a. vermoeiing, duurzaamheidseisen en (bij
 * hout) de klimaat-/belastingduurfactoren.
 */
export type Levensduurklasse = "1" | "2" | "3" | "4" | "5";

export const LEVENSDUUR_OMSCHRIJVING: Record<Levensduurklasse, string> = {
  "1": "Klasse 1 — 10 jaar: tijdelijke constructies",
  "2": "Klasse 2 — 10 tot 25 jaar: vervangbare constructiedelen",
  "3": "Klasse 3 — 15 tot 30 jaar: agrarische en soortgelijke constructies",
  "4": "Klasse 4 — 50 jaar: gebouwen en andere gewone constructies",
  "5": "Klasse 5 — 100 jaar: monumentale gebouwen, bruggen en infrastructuur",
};

/**
 * Windgebied (NEN-EN 1991-1-4/NB tabel NB.1) en terreincategorie
 * (NEN-EN 1991-1-4 tabel 4.1). Ze horen bij de uitgangspunten van het project
 * en worden door de windbelastinggenerator hier uitgelezen. De omschrijvingen
 * en getalswaarden staan — met vindplaats — in de windmodule.
 */
export type WindgebiedId = Windgebied;
export type TerreinCategorieId = TerreinCategorie;

/**
 * Normen die het project toepast (uitgangspunten van de berekening).
 *
 * Deze twee velden samen dragen per norm ÉÉN van drie standen — "volgt het
 * model", "altijd vermelden", "niet vermelden". De boolean alleen zegt niets:
 * hij telt pas als de sleutel ook in `normenHandmatig` staat. De regels, en de
 * reden dat dit geen aan/uit-vinkje meer is, staan in `lib/normenInRapport`.
 */
export interface Uitgangspunten {
  /** EN 1993 — staalconstructies. Alleen betekenisvol via `normenHandmatig`. */
  en1993: boolean;
  /** EN 1995 — houtconstructies (inclusief kruislaaghout). */
  en1995: boolean;
  /** EN 1992 — betonconstructies. */
  en1992: boolean;
  /**
   * De normen waarover de gebruiker zelf een uitspraak heeft gedaan. Zonder
   * dit spoor is aan `en1995: true` niet te zien of het een keuze was of de
   * standaardstand, en dan meldt een zuiver stalen rapport doodleuk dat
   * EN 1995 is toegepast. Ontbreekt het veld (projecten van vóór deze
   * wijziging), dan volgen alle normen het model — dat laadt zonder migratie.
   */
  normenHandmatig?: readonly NormSleutel[];
  /** Gevolgklasse volgens EN 1990. */
  gevolgklasse: Gevolgklasse;
  /** Ontwerplevensduurklasse volgens EN 1990 tabel 2.1. */
  levensduurklasse: Levensduurklasse;
  /** Nationale bijlage — vandaag alleen de Nederlandse. */
  nationaleBijlage: "NL";
  /**
   * Windgebied volgens NEN-EN 1991-1-4/NB tabel NB.1 — bepaalt v_b,0.
   * Ontbreekt bij projecten van vóór de windgenerator → default "II".
   */
  windgebied?: WindgebiedId;
  /**
   * Terreincategorie volgens NEN-EN 1991-1-4 tabel 4.1 — bepaalt de
   * ruwheidslengte z₀ en daarmee het snelheidsprofiel.
   */
  terreincategorie?: TerreinCategorieId;
}

/**
 * De stand van een project waar niemand iets aan heeft gekozen. `normenHandmatig`
 * is leeg, dus alle drie de normen staan op "volgt het model" — staal in het
 * model levert EN 1993, hout levert EN 1995. De drie booleans staan op false
 * omdat ze in die stand toch niet meetellen; een `true` zou alleen maar
 * verwarrend in het projectbestand staan.
 */
export const DEFAULT_UITGANGSPUNTEN: Uitgangspunten = {
  en1993: false,
  en1995: false,
  en1992: false,
  normenHandmatig: [],
  gevolgklasse: "CC2",
  levensduurklasse: "4",
  nationaleBijlage: "NL",
  windgebied: "II",
  terreincategorie: "II",
};

export interface ProjectInfo {
  name: string;
  projectNumber: string;
  engineer: string;
  company: string;
  date: string;
  description: string;
  notes: string;
  location: string;
  latitude?: number;
  longitude?: number;
  /** Uitgangspunten: toegepaste normen + gevolgklasse. */
  uitgangspunten?: Uitgangspunten;
}

interface ErpProject {
  name: string;
  project_name: string;
  customer: string;
  status: string;
}

const emptyProject: ProjectInfo = {
  name: "",
  projectNumber: "",
  engineer: "",
  company: "",
  date: new Date().toISOString().slice(0, 10),
  description: "",
  notes: "",
  location: "",
  uitgangspunten: DEFAULT_UITGANGSPUNTEN,
};

/**
 * De drie normen zoals ze in de uitgangspunten staan. `materiaal` is de soort
 * die deze norm in het model aandraagt — nodig om per stand in gewone taal te
 * zeggen wat er gebeurt, in plaats van de gebruiker de regel te laten raden.
 * EN 1992 staat hier gelijkwaardig bij: de betontoetsing draait mee in
 * `checkStore` en heeft een eigen rapporthoofdstuk, dus een uitgeschakeld
 * hokje met "volgt later" zou nu een onwaarheid zijn.
 */
const NORMEN: ReadonlyArray<{ sleutel: NormSleutel; label: string; materiaal: string }> = [
  { sleutel: "en1993", label: "Eurocode 3 — Staal (EN 1993)", materiaal: "staal" },
  { sleutel: "en1995", label: "Eurocode 5 — Hout (EN 1995)", materiaal: "hout of kruislaaghout" },
  { sleutel: "en1992", label: "Eurocode 2 — Beton (EN 1992)", materiaal: "beton" },
];

/** De drie standen, in de volgorde waarin de keuzelijst ze aanbiedt. */
const STAND_LABEL: ReadonlyArray<{ stand: NormStand; label: string }> = [
  { stand: "model", label: "Volgt het model" },
  { stand: "aan", label: "Altijd vermelden" },
  { stand: "uit", label: "Niet vermelden" },
];

/**
 * Wat de gekozen stand voor het rapport betekent, in één zin onder de
 * keuzelijst.
 *
 * Dit regeltje is de kern van de reparatie. Het lege hokje van vroeger stond
 * zowel voor "ik wil deze norm niet zien" als voor "ik heb er nooit iets mee
 * gedaan", en het zweeg helemaal wanneer een uitgevoerde toetsing de keuze
 * overrulede. Nu zegt het scherm per norm wat er werkelijk gebeurt — inclusief
 * het geval waarin de keuze van de gebruiker het aflegt tegen een feit over de
 * berekening.
 */
function normGevolg(oordeel: NormOordeel, stand: NormStand, materiaal: string): string {
  switch (oordeel) {
    case "getoetst":
      return stand === "uit"
        ? "Staat tóch in het rapport: er is op deze norm getoetst. Een uitgevoerde"
          + " toetsing is een feit over de berekening en geen voorkeur; uw keuze telt"
          + " weer zodra die toetsresultaten er niet meer zijn."
        : "Staat in het rapport: er is op deze norm getoetst.";
    case "keuze-aan":
      return `Staat in het rapport, ook zolang er nog geen ${materiaal} in het model zit.`;
    case "keuze-uit":
      return `Staat niet in het rapport, ook niet als er ${materiaal} in het model zit.`;
    case "model":
      return `Staat in het rapport zodra er ${materiaal} in het model zit of erop`
        + " getoetst is — anders niet.";
  }
}

export default function ProjectSettingsDialog({ open, onClose }: ProjectSettingsDialogProps) {
  const { t } = useTranslation("common");
  const [project, setProject] = useState<ProjectInfo>(emptyProject);
  const [erpEnabled, setErpEnabled] = useState(false);
  const [erpUrl, setErpUrl] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [erpResults, setErpResults] = useState<ErpProject[]>([]);
  const [erpLoading, setErpLoading] = useState(false);
  // Waarop daadwerkelijk getoetst is. Dat is de enige regel die de keuze van
  // de gebruiker overrulet, dus de enige die de dialoog erbij moet kunnen
  // vertellen. Wélk materiaal er in het model zit blijft hier bewust buiten
  // beeld: de uitgangspunten hebben de staven niet in handen, en een uit de
  // toetsing gereconstrueerd model zou verouderen zodra er een staaf bij komt
  // — dan stond er weer iets op het scherm dat niet waar is.
  const toetsResultaten = useCheckStore((s) => s.results);

  useEffect(() => {
    if (!open) return;
    getSetting<ProjectInfo>("projectInfo", emptyProject).then(setProject);
    getSetting("erpNextUrl", "").then(setErpUrl);
    getSetting("erpNextEnabled", false).then(setErpEnabled);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Uitgangspunten met terugval op de defaults, zodat projecten van vóór deze
  // uitbreiding gewoon laden (gevolgklasse CC2, normen volgen het model).
  const uitgangspunten: Uitgangspunten = project.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN;
  // De keuzelijsten tonen de stand zoals het rapport hem leest — inclusief
  // "volgt het model" voor een bestaand projectbestand, waarin `en1995: true`
  // staat zonder dat te achterhalen is wie dat deed. `normOordelen` zegt er
  // per norm bij welke regel wint, zodat het scherm kan melden dat een
  // uitgevoerde toetsing de keuze overrulet in plaats van erover te zwijgen.
  const standen = normStanden(uitgangspunten);
  const oordelen = normOordelen(uitgangspunten, normenUitToetsen(usedNorms(toetsResultaten)));
  const updateUitgangspunt = <K extends keyof Uitgangspunten>(
    sleutel: K,
    waarde: Uitgangspunten[K],
  ) => {
    setProject((prev) => ({
      ...prev,
      uitgangspunten: { ...(prev.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN), [sleutel]: waarde },
    }));
  };

  /**
   * Een norm op een andere stand zetten. Alle drie de standen lopen hier
   * langs, óók "volgt het model": dat is de weg terug die er eerst niet was,
   * want een vinkje kon zijn eigen spoor in `normenHandmatig` niet meer
   * uitwissen en de gebruiker zat na één klik vast aan zijn eigen keuze.
   * `zetNormStand` houdt de twee opgeslagen velden consistent.
   */
  const updateNormStand = (sleutel: NormSleutel, stand: NormStand) => {
    setProject((prev) => {
      const vorige = prev.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN;
      return {
        ...prev,
        uitgangspunten: { ...vorige, ...zetNormStand(vorige, sleutel, stand) },
      };
    });
  };

  const updateField = (field: keyof ProjectInfo, value: string) => {
    setProject((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    await setSetting("projectInfo", project);
    await setSetting("erpNextUrl", erpUrl);
    await setSetting("erpNextEnabled", erpEnabled);
    onClose();
  };

  const handleErpSearch = async () => {
    if (!erpUrl || !erpSearch.trim()) return;
    setErpLoading(true);
    try {
      const res = await fetch(
        `${erpUrl}/api/resource/Project?filters=[["status","=","Open"],["name","like","%${erpSearch}%"]]&fields=["name","project_name","customer","status"]&limit_page_length=10`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (res.ok) {
        const data = await res.json();
        setErpResults(data.data || []);
      }
    } catch {
      setErpResults([]);
    } finally {
      setErpLoading(false);
    }
  };

  const handleErpSelect = (ep: ErpProject) => {
    setProject((prev) => ({
      ...prev,
      name: ep.project_name || ep.name,
      projectNumber: ep.name,
      company: ep.customer || prev.company,
    }));
    setErpResults([]);
    setErpSearch("");
  };

  return (
    <div className="proj-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="proj-dialog">
        <div className="proj-header">
          <h2>{t("projectSettings.title")}</h2>
          <button className="proj-close" onClick={onClose}>&times;</button>
        </div>

        <div className="proj-body">
          {/* ERPNext Integration */}
          <div className="proj-section">
            <div className="proj-section-title">
              <label className="proj-toggle">
                <input type="checkbox" checked={erpEnabled} onChange={(e) => setErpEnabled(e.target.checked)} />
                {t("projectSettings.erpNext")}
              </label>
            </div>

            {erpEnabled && (
              <div className="proj-erp-section">
                <div className="proj-field">
                  <label>{t("projectSettings.erpUrl")}</label>
                  <input
                    type="url"
                    value={erpUrl}
                    onChange={(e) => setErpUrl(e.target.value)}
                    placeholder="https://erp.example.com"
                  />
                </div>
                <div className="proj-field proj-erp-search">
                  <label>{t("projectSettings.erpSearch")}</label>
                  <div className="proj-erp-search-row">
                    <input
                      type="text"
                      value={erpSearch}
                      onChange={(e) => setErpSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleErpSearch()}
                      placeholder={t("projectSettings.erpSearchPlaceholder")}
                    />
                    <button className="proj-erp-search-btn" onClick={handleErpSearch} disabled={erpLoading}>
                      {erpLoading ? "..." : t("search")}
                    </button>
                  </div>
                  {erpResults.length > 0 && (
                    <div className="proj-erp-results">
                      {erpResults.map((ep) => (
                        <button key={ep.name} className="proj-erp-result" onClick={() => handleErpSelect(ep)}>
                          <strong>{ep.project_name || ep.name}</strong>
                          <span>{ep.customer} &middot; {ep.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Project Fields */}
          <div className="proj-section">
            <div className="proj-section-title">{t("projectSettings.info")}</div>
            <div className="proj-fields">
              <div className="proj-field">
                <label>{t("projectSettings.name")}</label>
                <input type="text" value={project.name} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="proj-field">
                <label>{t("projectSettings.number")}</label>
                <input type="text" value={project.projectNumber} onChange={(e) => updateField("projectNumber", e.target.value)} />
              </div>
              <div className="proj-row">
                <div className="proj-field">
                  <label>{t("projectSettings.engineer")}</label>
                  <input type="text" value={project.engineer} onChange={(e) => updateField("engineer", e.target.value)} />
                </div>
                <div className="proj-field">
                  <label>{t("projectSettings.company")}</label>
                  <input type="text" value={project.company} onChange={(e) => updateField("company", e.target.value)} />
                </div>
              </div>
              <div className="proj-row">
                <div className="proj-field">
                  <label>{t("projectSettings.date")}</label>
                  <input type="date" value={project.date} onChange={(e) => updateField("date", e.target.value)} />
                </div>
                <div className="proj-field">
                  <label>{t("projectSettings.location")}</label>
                  <input type="text" value={project.location} onChange={(e) => updateField("location", e.target.value)} />
                </div>
              </div>
              <div className="proj-field">
                <label>{t("projectSettings.description")}</label>
                <textarea rows={2} value={project.description} onChange={(e) => updateField("description", e.target.value)} />
              </div>
              <div className="proj-field">
                <label>{t("projectSettings.notes")}</label>
                <textarea rows={2} value={project.notes} onChange={(e) => updateField("notes", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Uitgangspunten — welke normen het project toepast en in welke
              gevolgklasse. Deze keuzes horen bij de start van een project en
              komen als uitgangspunten in het rekenrapport. */}
          <div className="proj-section">
            <div className="proj-section-title">Uitgangspunten</div>
            <div className="proj-fields">
              <div className="proj-field">
                <label id="proj-normen-kop">Toegepaste normen</label>
                {/* Drie standen per norm, geen vinkje. Een vinkje toonde
                    "volgt het model" en "niet vermelden" als hetzelfde lege
                    hokje — twee standen met verschillende uitkomst in het
                    rapport — en kende geen weg terug naar de eerste. De regel
                    onder elke keuzelijst zegt wat de stand voor het rapport
                    betekent, zodat de gebruiker het niet hoeft af te leiden. */}
                <div className="proj-normen" role="group" aria-labelledby="proj-normen-kop">
                  {NORMEN.map(({ sleutel, label, materiaal }) => {
                    const stand = standen[sleutel];
                    const oordeel = oordelen[sleutel];
                    // Alleen als een uitgevoerde toetsing de keuze "niet
                    // vermelden" overrulet staat er iets op het scherm dat de
                    // gebruiker niet verwacht; dat mag hij niet missen.
                    const overruled = oordeel === "getoetst" && stand === "uit";
                    return (
                      <div key={sleutel} className="proj-norm">
                        <div className="proj-norm-regel">
                          <span className="proj-norm-naam">{label}</span>
                          <select
                            className="proj-norm-stand"
                            aria-label={`${label} in het rapport`}
                            value={stand}
                            onChange={(e) => updateNormStand(sleutel, e.target.value as NormStand)}
                          >
                            {STAND_LABEL.map(({ stand: waarde, label: standLabel }) => (
                              <option key={waarde} value={waarde}>{standLabel}</option>
                            ))}
                          </select>
                        </div>
                        <p className={`proj-norm-gevolg${overruled ? " proj-norm-overruled" : ""}`}>
                          {normGevolg(oordeel, stand, materiaal)}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="proj-uitleg">
                  Deze keuze bepaalt alleen wát het rapport bij de uitgangspunten
                  vermeldt; aan de berekening verandert ze niets. Standaard volgt
                  elke norm het model, zodat een zuiver stalen berekening geen
                  hout meldt. Zet een norm op “Altijd vermelden” als u vooruitloopt
                  op wat u nog gaat tekenen — “Volgt het model” neemt die keuze
                  weer terug.
                </p>
              </div>
              <div className="proj-row">
                <div className="proj-field">
                  <label>Gevolgklasse (EN 1990)</label>
                  <select
                    value={uitgangspunten.gevolgklasse}
                    onChange={(e) => updateUitgangspunt("gevolgklasse", e.target.value as Gevolgklasse)}
                  >
                    {(Object.keys(K_FI) as Gevolgklasse[]).map((cc) => (
                      <option key={cc} value={cc}>
                        {cc} — {GEVOLGKLASSE_OMSCHRIJVING[cc]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="proj-field">
                  <label>Nationale bijlage</label>
                  <select value={uitgangspunten.nationaleBijlage} disabled>
                    <option value="NL">Nederland (NB)</option>
                  </select>
                </div>
              </div>
              <div className="proj-field">
                <label>Ontwerplevensduur (EN 1990)</label>
                <select
                  value={uitgangspunten.levensduurklasse}
                  onChange={(e) => updateUitgangspunt("levensduurklasse", e.target.value as Levensduurklasse)}
                >
                  {(Object.keys(LEVENSDUUR_OMSCHRIJVING) as Levensduurklasse[]).map((k) => (
                    <option key={k} value={k}>{LEVENSDUUR_OMSCHRIJVING[k]}</option>
                  ))}
                </select>
              </div>
              <p className="proj-uitleg">
                De gevolgklasse bepaalt de betrouwbaarheidsfactor K<sub>FI</sub> ={" "}
                {K_FI[uitgangspunten.gevolgklasse].toFixed(2).replace(".", ",")} waarmee de
                ongunstige belastingen in de uiterste grenstoestand worden vermenigvuldigd.
              </p>

              {/* Wind — windgebied en terreincategorie horen bij de
                  uitgangspunten van het project; de windbelastinggenerator
                  leest ze hier uit. */}
              <div className="proj-row">
                <div className="proj-field">
                  <label>Windgebied (EN 1991-1-4/NB)</label>
                  <select
                    value={uitgangspunten.windgebied ?? "II"}
                    onChange={(e) => updateUitgangspunt("windgebied", e.target.value as Windgebied)}
                  >
                    {(Object.keys(WINDGEBIEDEN) as Windgebied[]).map((g) => (
                      <option key={g} value={g}>{WINDGEBIEDEN[g].omschrijving}</option>
                    ))}
                  </select>
                </div>
                <div className="proj-field">
                  <label>Terreincategorie (EN 1991-1-4 tabel 4.1)</label>
                  <select
                    value={uitgangspunten.terreincategorie ?? "II"}
                    onChange={(e) => updateUitgangspunt("terreincategorie", e.target.value as TerreinCategorie)}
                  >
                    {(Object.keys(TERREIN_CATEGORIEEN) as TerreinCategorie[]).map((c) => (
                      <option key={c} value={c}>{TERREIN_CATEGORIEEN[c].omschrijving}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="proj-uitleg">
                Windgebied {uitgangspunten.windgebied ?? "II"} geeft een basiswindsnelheid
                v<sub>b,0</sub> = {WINDGEBIEDEN[uitgangspunten.windgebied ?? "II"].vb0
                  .toFixed(1).replace(".", ",")} m/s ({WINDGEBIEDEN[uitgangspunten.windgebied ?? "II"].bron}).
                De terreincategorie levert z<sub>0</sub> ={" "}
                {TERREIN_CATEGORIEEN[uitgangspunten.terreincategorie ?? "II"].z0
                  .toFixed(3).replace(".", ",")} m uit EN 1991-1-4 tabel 4.1 —{" "}
                <strong>niet</strong> uit de terreinsoortentabel van de nationale bijlage.
                Houdt u die tabel aan, voer de stuwdruk dan handmatig in bij de
                windbelastinggenerator.
              </p>
            </div>
          </div>
        </div>

        <div className="proj-footer">
          <button className="proj-btn secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="proj-btn primary" onClick={handleSave}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}
