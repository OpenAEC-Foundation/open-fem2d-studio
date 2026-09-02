/**
 * ReportPreview — het live HTML-rapport achter het ribbon-tabblad "Rapport"
 * (en in het detached venster, view "report").
 *
 * Links een inklapbare zijbalk, rechts de ReportShell: de opmaakproef met
 * losse vellen die direct uit de stores rendert. Geen genereer-stap:
 * modelwijziging → rapport volgt. PDF via de Afdrukken/PDF-knop
 * (webview-printdialoog).
 *
 * De zijbalk heeft twee blokken:
 *  - "Secties" — de registry-gedreven lijst (reportSections.ts). Het vinkje
 *    zet de sectie aan/uit, de NAAM is tegelijk inhoudsopgave: klikken
 *    springt in de opmaakproef naar dat hoofdstuk. De sectie die in beeld is
 *    krijgt een subtiele markering (ReportShell houdt dat bij).
 *  - "Opmaak" — sliders voor marges, lettergrootte en interlinie. Die werken
 *    live door: op scherm via CSS-variabelen op het vel, in print via de
 *    dynamische @page-regel. Elke wijziging herpagineert de proef.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useReportStore,
  isSectionEnabled,
  MARGE_MIN_MM,
  MARGE_MAX_MM,
  LETTER_MIN_PT,
  LETTER_MAX_PT,
  REGELAFSTAND_MIN,
  REGELAFSTAND_MAX,
  type ReportOpmaak,
} from "../../stores/reportStore";
import { REPORT_SECTIONS } from "../report/reportSections";
import ReportShell from "../report/ReportShell";
import { scrollNaarSectie } from "../report/paginate";
import {
  ReportDataProvider,
  EMPTY_REPORT_DATA,
  type ReportData,
} from "../report/ReportDataContext";
import { useDetachedReportSync } from "../report/reportSync";
import "./ReportPreview.css";

/** Eén opmaak-slider met de waarde ernaast (mm/pt), zoals in een drukproef. */
function OpmaakSlider({
  label,
  waarde,
  eenheid,
  min,
  max,
  stap,
  decimalen = 0,
  onChange,
}: {
  label: string;
  waarde: number;
  eenheid: string;
  min: number;
  max: number;
  stap: number;
  decimalen?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="report-opmaak-slider">
      <span className="report-opmaak-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={stap}
        value={waarde}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="report-opmaak-waarde">
        {waarde.toFixed(decimalen).replace(".", ",")}
        {eenheid && ` ${eenheid}`}
      </span>
    </label>
  );
}

interface ReportPreviewProps {
  /**
   * Modelstate uit App.tsx (useFemStore-instantie) voor de invoersecties.
   * Ontbreekt hij (detached venster zonder verbinding), dan rendert het
   * rapport met een leeg model en eerlijke leeg-meldingen.
   */
  data?: ReportData;
  /**
   * Alleen in het hoofdvenster: opent het rapport in een eigen venster
   * ("Naast je scherm"). In het losgekoppelde venster ontbreekt de prop en
   * dus de knop.
   */
  onDetach?: () => void;
}

export default function ReportPreview({ data, onDetach }: ReportPreviewProps) {
  const { t } = useTranslation("ribbon");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const setSectionEnabled = useReportStore((s) => s.setSectionEnabled);
  const resetSections = useReportStore((s) => s.resetSections);
  const actieveSectie = useReportStore((s) => s.actieveSectie);
  const setOpmaak = useReportStore((s) => s.setOpmaak);
  const resetOpmaak = useReportStore((s) => s.resetOpmaak);
  const margeBoven = useReportStore((s) => s.margeBoven);
  const margeOnder = useReportStore((s) => s.margeOnder);
  const margeBinnen = useReportStore((s) => s.margeBinnen);
  const margeBuiten = useReportStore((s) => s.margeBuiten);
  const basisLettergrootte = useReportStore((s) => s.basisLettergrootte);
  const regelafstand = useReportStore((s) => s.regelafstand);
  const inhoudsopgaveDiepte = useReportStore((s) => s.inhoudsopgaveDiepte);
  const setInhoudsopgaveDiepte = useReportStore((s) => s.setInhoudsopgaveDiepte);

  const zetOpmaak = (veld: keyof ReportOpmaak) => (v: number) => setOpmaak({ [veld]: v });

  return (
    <div className="report-preview">
      {/* ─── Zijbalk: sectie-toggles (scherm-chrome, print niet mee) ─── */}
      {sidebarOpen ? (
        <aside className="report-sidebar">
          <div className="report-sidebar-header">
            <span className="report-sidebar-title">{t("report.sections", "Secties")}</span>
            <button
              className="report-sidebar-toggle"
              onClick={() => setSidebarOpen(false)}
              title={t("report.collapse", "Inklappen")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          <div className="report-sidebar-body">
            <p className="report-sidebar-hint">
              {t(
                "report.sectionsHint2",
                "Vinkje: in het rapport of niet. Naam: spring ernaartoe.",
              )}
            </p>

            <div className="report-section-list">
              {REPORT_SECTIONS.map(({ id, titleKey, defaultTitle }) => {
                const aan = isSectionEnabled(hiddenSections, id);
                const naam = t(titleKey, defaultTitle);
                return (
                  <div
                    key={id}
                    className={`report-section-toggle${
                      actieveSectie === id ? " is-actief" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={aan}
                      aria-label={naam}
                      onChange={(e) => setSectionEnabled(id, e.target.checked)}
                    />
                    {/* De naam is de sprong-link (inhoudsopgave). Staat de
                        sectie uit, dan valt er niets te bespringen. */}
                    <button
                      type="button"
                      className="report-section-link"
                      disabled={!aan}
                      onClick={() => scrollNaarSectie(id)}
                      title={t("report.jumpTo", "Spring naar dit hoofdstuk")}
                    >
                      {naam}
                    </button>
                  </div>
                );
              })}
            </div>

            <button className="report-reset-btn" onClick={resetSections}>
              {t("report.resetSections", "Alles aan")}
            </button>

            {/* ─── Opmaak: marges, lettergrootte en interlinie ───
                "Binnen/buiten" heet hier links/rechts: het rapport is
                enkelzijdig drukwerk, dus er is geen spiegeling per even/
                oneven pagina (zie ReportOpmaak in reportStore). */}
            <div className="report-sidebar-kop">{t("report.opmaak", "Opmaak")}</div>
            <div className="report-opmaak">
              <OpmaakSlider
                label={t("report.margeBoven", "Marge boven")}
                waarde={margeBoven}
                eenheid="mm"
                min={MARGE_MIN_MM}
                max={MARGE_MAX_MM}
                stap={1}
                onChange={zetOpmaak("margeBoven")}
              />
              <OpmaakSlider
                label={t("report.margeOnder", "Marge onder")}
                waarde={margeOnder}
                eenheid="mm"
                min={MARGE_MIN_MM}
                max={MARGE_MAX_MM}
                stap={1}
                onChange={zetOpmaak("margeOnder")}
              />
              <OpmaakSlider
                label={t("report.margeLinks", "Marge links")}
                waarde={margeBinnen}
                eenheid="mm"
                min={MARGE_MIN_MM}
                max={MARGE_MAX_MM}
                stap={1}
                onChange={zetOpmaak("margeBinnen")}
              />
              <OpmaakSlider
                label={t("report.margeRechts", "Marge rechts")}
                waarde={margeBuiten}
                eenheid="mm"
                min={MARGE_MIN_MM}
                max={MARGE_MAX_MM}
                stap={1}
                onChange={zetOpmaak("margeBuiten")}
              />
              <OpmaakSlider
                label={t("report.lettergrootte", "Lettergrootte")}
                waarde={basisLettergrootte}
                eenheid="pt"
                min={LETTER_MIN_PT}
                max={LETTER_MAX_PT}
                stap={0.5}
                decimalen={1}
                onChange={zetOpmaak("basisLettergrootte")}
              />
              <OpmaakSlider
                label={t("report.regelafstand", "Interlinie")}
                waarde={regelafstand}
                eenheid=""
                min={REGELAFSTAND_MIN}
                max={REGELAFSTAND_MAX}
                stap={0.05}
                decimalen={2}
                onChange={zetOpmaak("regelafstand")}
              />

              {/* Diepte van de inhoudsopgave-sectie in het document. Met
                  subsecties wordt de lijst bij veel staven lang, vandaar de
                  keuze voor "alleen hoofdstukken". */}
              <label className="report-opmaak-keuze">
                <span className="report-opmaak-label">
                  {t("report.tocDiepte", "Inhoudsopgave")}
                </span>
                <select
                  value={inhoudsopgaveDiepte}
                  onChange={(e) =>
                    setInhoudsopgaveDiepte(Number(e.target.value) === 1 ? 1 : 2)
                  }
                >
                  <option value={1}>
                    {t("report.tocDiepte1", "Alleen hoofdstukken")}
                  </option>
                  <option value={2}>
                    {t("report.tocDiepte2", "Met subsecties")}
                  </option>
                </select>
              </label>
            </div>

            <button className="report-reset-btn" onClick={resetOpmaak}>
              {t("report.resetOpmaak", "Standaardopmaak")}
            </button>
          </div>
        </aside>
      ) : (
        <button
          className="report-sidebar-collapsed"
          onClick={() => setSidebarOpen(true)}
          title={t("report.sections", "Secties")}
        >
          <span>{t("report.sections", "Secties")}</span>
        </button>
      )}

      {/* ─── Het rapport zelf ─── */}
      <ReportDataProvider value={data ?? EMPTY_REPORT_DATA}>
        <ReportShell onDetach={onDetach} />
      </ReportDataProvider>
    </div>
  );
}

/**
 * R5 — het rapport in het losgekoppelde venster ("Naast je scherm").
 * Eigen webview/React-root zonder useFemStore: de modelstate komt live
 * binnen via reportSync (snapshot-push vanuit het hoofdvenster). Zolang er
 * nog geen snapshot is, meldt een dunne balk dat we op het hoofdvenster
 * wachten (de secties tonen dan hun eerlijke leeg-meldingen).
 */
export function DetachedReportPreview() {
  const { t } = useTranslation("ribbon");
  const data = useDetachedReportSync();

  return (
    <div className="report-detached-wrap">
      {data === null && (
        <div className="report-sync-waiting">
          {t(
            "report.waitingForMain",
            "Wachten op het hoofdvenster — het rapport verschijnt zodra de verbinding er is.",
          )}
        </div>
      )}
      <ReportPreview data={data ?? undefined} />
    </div>
  );
}
