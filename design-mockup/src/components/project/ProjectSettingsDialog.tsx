import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, setSetting } from "../../store";
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

/** Normen die het project toepast (uitgangspunten van de berekening). */
export interface Uitgangspunten {
  /** EN 1993 — staalconstructies. */
  en1993: boolean;
  /** EN 1995 — houtconstructies. */
  en1995: boolean;
  /** EN 1992 — betonconstructies (nog niet geïmplementeerd; alleen vermelding). */
  en1992: boolean;
  /** Gevolgklasse volgens EN 1990. */
  gevolgklasse: Gevolgklasse;
  /** Ontwerplevensduurklasse volgens EN 1990 tabel 2.1. */
  levensduurklasse: Levensduurklasse;
  /** Nationale bijlage — vandaag alleen de Nederlandse. */
  nationaleBijlage: "NL";
}

export const DEFAULT_UITGANGSPUNTEN: Uitgangspunten = {
  en1993: true,
  en1995: true,
  en1992: false,
  gevolgklasse: "CC2",
  levensduurklasse: "4",
  nationaleBijlage: "NL",
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

export default function ProjectSettingsDialog({ open, onClose }: ProjectSettingsDialogProps) {
  const { t } = useTranslation("common");
  const [project, setProject] = useState<ProjectInfo>(emptyProject);
  const [erpEnabled, setErpEnabled] = useState(false);
  const [erpUrl, setErpUrl] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [erpResults, setErpResults] = useState<ErpProject[]>([]);
  const [erpLoading, setErpLoading] = useState(false);

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
  // uitbreiding gewoon laden (Eurocode staal + hout, gevolgklasse CC2).
  const uitgangspunten: Uitgangspunten = project.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN;
  const updateUitgangspunt = <K extends keyof Uitgangspunten>(
    sleutel: K,
    waarde: Uitgangspunten[K],
  ) => {
    setProject((prev) => ({
      ...prev,
      uitgangspunten: { ...(prev.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN), [sleutel]: waarde },
    }));
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
                <label>Toegepaste normen</label>
                <div className="proj-normen">
                  {([
                    ["en1993", "Eurocode 3 — Staal (EN 1993)", true],
                    ["en1995", "Eurocode 5 — Hout (EN 1995)", true],
                    ["en1992", "Eurocode 2 — Beton (EN 1992)", false],
                  ] as const).map(([sleutel, label, beschikbaar]) => (
                    <label
                      key={sleutel}
                      className={`proj-norm${beschikbaar ? "" : " proj-norm-uit"}`}
                      title={beschikbaar
                        ? "Wordt toegepast bij de normtoetsing"
                        : "Nog niet beschikbaar — betontoetsing volgt later"}
                    >
                      <input
                        type="checkbox"
                        disabled={!beschikbaar}
                        checked={!!uitgangspunten[sleutel]}
                        onChange={(e) => updateUitgangspunt(sleutel, e.target.checked)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
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
