/**
 * LibraryDialog — alleen-lezen naslag-dialoog voor de bibliotheek:
 *  - tab "Staalprofielen": doorsnedegrootheden (A, Iy) uit de gegenereerde
 *    profieltabel + hoofdafmetingen (h × b × tw × tf) waar beschikbaar;
 *  - tab "Materialen": staalklassen (fy) en houtsterkteklassen (E₀,mean).
 * Nadrukkelijk géén editor — de data komt uit de gegenereerde tabellen
 * (bron: de Rust-profieldatabase) en normtabellen (EN 338 / EN 14080).
 */
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { STEEL_SECTIONS } from "../../lib/steelSections.generated";
import { STEEL_SECTION_DIMS } from "../../lib/steelSectionDims.generated";
import { STEEL_GRADES } from "../fem/BarPropertiesDialog";
import { STEEL_FY } from "../fem/profileData";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import { TIMBER_E_MEAN, E_STAAL } from "../../lib/sectionResolver";
import "./LibraryDialog.css";

export type LibraryTab = "sections" | "materials";

interface LibraryDialogProps {
  open: boolean;
  onClose: () => void;
  /** Tabblad waarmee de dialoog opent (ribbon: Profielen vs. Materialen). */
  initialTab?: LibraryTab;
}

/** Format een getal compact met NL-notatie (punt = duizendtal, komma = decimaal). */
const fmt = (v: number, decimals = 0) =>
  v.toLocaleString("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function LibraryDialog({ open, onClose, initialTab = "sections" }: LibraryDialogProps) {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState("");

  // Bij (her)openen: gevraagd tabblad tonen en zoekfilter wissen.
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setQuery("");
    }
  }, [open, initialTab]);

  const q = query.trim().toUpperCase();

  // Staalprofielen — volgorde van de gegenereerde tabel (per serie gegroepeerd).
  const sectionRows = useMemo(() =>
    Object.entries(STEEL_SECTIONS)
      .filter(([name]) => !q || name.includes(q))
      .map(([name, sec]) => ({ name, ...sec, dims: STEEL_SECTION_DIMS[name] })),
    [q]);

  // Materialen — staalklassen + houtsterkteklassen, met zoekfilter.
  const steelRows = useMemo(() =>
    STEEL_GRADES.filter((g) => !q || g.toUpperCase().includes(q)),
    [q]);
  const timberRows = useMemo(() =>
    SUPPORTED_TIMBER_GRADES.filter((g) => !q || g.toUpperCase().includes(q)),
    [q]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("library.title")}
      width={640}
      height={520}
      className="library-dialog"
    >
      <div className="library-body">
        <p className="library-subtitle">{t("library.subtitle")}</p>

        <div className="library-toolbar">
          <div className="library-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "sections"}
              className={`library-tab${tab === "sections" ? " active" : ""}`}
              onClick={() => setTab("sections")}
            >
              {t("library.tabSections")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "materials"}
              className={`library-tab${tab === "materials" ? " active" : ""}`}
              onClick={() => setTab("materials")}
            >
              {t("library.tabMaterials")}
            </button>
          </div>
          <input
            type="search"
            className="library-search"
            placeholder={t("library.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="library-scroll">
          {tab === "sections" && (
            sectionRows.length === 0 ? (
              <p className="library-empty">{t("library.noResults")}</p>
            ) : (
              <table className="library-table">
                <thead>
                  <tr>
                    <th>{t("library.colName")}</th>
                    <th className="num">{t("library.colA")}</th>
                    <th className="num">{t("library.colIy")}</th>
                    <th>{t("library.colDims")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map((r) => (
                    <tr key={r.name}>
                      <td className="mono">{r.name}</td>
                      <td className="num">{fmt(r.A)}</td>
                      <td className="num">{fmt(r.Iy / 1e6, 2)}</td>
                      <td className="mono dims">
                        {r.dims
                          ? `${fmt(r.dims.h)} × ${fmt(r.dims.b)} × ${fmt(r.dims.tw, r.dims.tw % 1 ? 1 : 0)} × ${fmt(r.dims.tf, r.dims.tf % 1 ? 1 : 0)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === "materials" && (
            steelRows.length === 0 && timberRows.length === 0 ? (
              <p className="library-empty">{t("library.noResults")}</p>
            ) : (
              <>
                {steelRows.length > 0 && (
                  <>
                    <h4 className="library-group">{t("library.steelGroup")}</h4>
                    <table className="library-table">
                      <thead>
                        <tr>
                          <th>{t("library.colName")}</th>
                          <th className="num">{t("library.colFy")}</th>
                          <th className="num">{t("library.colE")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steelRows.map((g) => (
                          <tr key={g}>
                            <td className="mono">{g}</td>
                            <td className="num">{STEEL_FY[g] !== undefined ? fmt(STEEL_FY[g]) : "—"}</td>
                            <td className="num">{fmt(E_STAAL)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {timberRows.length > 0 && (
                  <>
                    <h4 className="library-group">{t("library.timberGroup")}</h4>
                    <table className="library-table">
                      <thead>
                        <tr>
                          <th>{t("library.colName")}</th>
                          <th className="num">{t("library.colEmean")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timberRows.map((g) => (
                          <tr key={g}>
                            <td className="mono">{g}</td>
                            <td className="num">{TIMBER_E_MEAN[g] !== undefined ? fmt(TIMBER_E_MEAN[g]) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
