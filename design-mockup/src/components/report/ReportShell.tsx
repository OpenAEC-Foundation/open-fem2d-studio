/**
 * ReportShell — het live HTML-rapport als opmaakproef.
 *
 * Rendert de aangezette secties uit de registry (reportSections.ts) en
 * verdeelt die over LOSSE VELLEN op papierformaat: elk vel apart op de grijze
 * bureau-achtergrond, met eigen slagschaduw, onder elkaar — precies zoals een
 * drukproef. Het rapport blijft daarbij één doorlopend document: hoofdstukken
 * sluiten op elkaar aan, niets begint geforceerd op een nieuw vel.
 *
 * De paginering zelf zit in paginate.ts. Hier staat de orkestratie:
 *
 *  - de secties draaien ÉÉN keer, in een onzichtbare meetcontainer
 *    (`.rpt-meet`) die exact zo breed is als de tekstkolom van het vel;
 *  - een MutationObserver + ResizeObserver op die container herpagineert
 *    zodra de inhoud verandert (modelwijziging, resultaten, taal), en een
 *    effect doet hetzelfde bij marges, papierformaat, oriëntatie, sectie
 *    aan/uit en lettergrootte — alles gedebouncet zodat slepen aan een
 *    slider vloeiend blijft;
 *  - de vellen zelf worden als DOM opgebouwd in `.rpt-vellen`; React rendert
 *    daar bewust géén kinderen, zodat er geen conflict met de paginering is.
 *
 * Print: één schermvel = één printpagina (`break-after: page` per vel), en de
 * `@page`-marges hieronder zijn dezelfde marges als op scherm. Wat je ziet
 * komt zo ook uit de printer ("Opslaan als PDF" in de printdialoog).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  useReportStore,
  isSectionEnabled,
  pageDimsMm,
  REPORT_ZOOM_MIN,
  REPORT_ZOOM_MAX,
} from "../../stores/reportStore";
import { REPORT_SECTIONS } from "./reportSections";
import { useProjectInfo } from "./useProjectInfo";
import { useReportData } from "./ReportDataContext";
import { pagineer, koppelBedieningsDoorgifte } from "./paginate";
import "./report.css";

/** Veilige CSS-string (dubbelquoted, met escapes) voor content:-waarden. */
function cssString(s: string): string {
  return JSON.stringify(s);
}

/** Wachttijd voor het herpagineren — houdt slepen aan een slider vloeiend. */
const HERPAGINEER_MS = 150;

const printIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const detachWindowIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="7" width="13" height="13" rx="1.5" />
    <path d="M8 7V4.5A1.5 1.5 0 019.5 3h10A1.5 1.5 0 0121 4.5v10a1.5 1.5 0 01-1.5 1.5H16" />
  </svg>
);

interface ReportShellProps {
  /** Aanwezig in het hoofdvenster: toont de knop "Naast je scherm". */
  onDetach?: () => void;
}

export default function ReportShell({ onDetach }: ReportShellProps) {
  const { t, i18n } = useTranslation("ribbon");
  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const zoom = useReportStore((s) => s.zoom);
  const setZoom = useReportStore((s) => s.setZoom);
  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const margeBoven = useReportStore((s) => s.margeBoven);
  const margeOnder = useReportStore((s) => s.margeOnder);
  const margeBinnen = useReportStore((s) => s.margeBinnen);
  const margeBuiten = useReportStore((s) => s.margeBuiten);
  const basisLettergrootte = useReportStore((s) => s.basisLettergrootte);
  const regelafstand = useReportStore((s) => s.regelafstand);
  const setActieveSectie = useReportStore((s) => s.setActieveSectie);
  const info = useProjectInfo();
  const data = useReportData();

  // R5 — "verouderd"-signaal: er ís een model, maar (nog) geen resultaten.
  // useFemStore nult de solver-uitkomsten bij elke modelwijziging, dus deze
  // balk verschijnt vanzelf zodra het rapport achterloopt — in het hoofd-
  // venster én (via de snapshot-sync) in het losgekoppelde venster. De balk
  // is scherm-chrome en print nooit mee (@media print in report.css).
  const hasModel = data.nodes.length > 0 || data.beams.length > 0;
  const showStale = hasModel && data.combinationResults === null;

  const dims = pageDimsMm(pageSize, orientation);
  const headerText = info.name || t("report.unnamedProject", "Naamloos project");

  // Enkelzijdig drukwerk: binnenmarge = links, buitenmarge = rechts
  // (zie ReportOpmaak in reportStore).
  const margeLinks = margeBinnen;
  const margeRechts = margeBuiten;

  // Dynamische print-regel: formaat/oriëntatie, de ingestelde marges en de
  // voettekst. De koptekst staat als echt kopblok bovenaan élk vel (zie de
  // opmaakproef hieronder); alleen de paginanummers en het app-merk komen uit
  // de @page-margin-boxes (CSS counters kunnen niet in gewone content;
  // Chromium ≥ 131 voor de boxes — oudere runtimes printen de inhoud gewoon
  // zonder die regel).
  const pageCss = `
@page {
  size: ${pageSize} ${orientation};
  margin: ${margeBoven}mm ${margeRechts}mm ${margeOnder}mm ${margeLinks}mm;
  @bottom-left {
    content: "Open FEM2D Studio";
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8pt;
    color: #666;
  }
  @bottom-right {
    content: ${cssString(t("report.pagePrefix", "Pagina") + " ")} counter(page) " / " counter(pages);
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8pt;
    color: #666;
  }
}`;

  // Kopblok in referentiestijl: bedrijfsregel cursief, daaronder het
  // projectblok in twee kolommen, afgesloten met een lijn. Lege velden
  // worden weggelaten. Staat bovenaan élk vel (kloon per vel).
  const kopRegels: Array<[string, string]> = [
    [t("report.kopProjectnummer", "Projectnummer"), info.projectNumber],
    [t("report.kopProject", "Project"), headerText],
    [t("report.kopOmschrijving", "Omschrijving"), info.description],
  ].filter((r): r is [string, string] => !!r[1]);
  const kopRechts: Array<[string, string]> = [
    [t("report.kopDatum", "Datum"), info.date],
    [t("report.kopConstructeur", "Constructeur"), info.engineer],
  ].filter((r): r is [string, string] => !!r[1]);
  const kopBedrijf = info.reportHeader || info.company;

  const sections = REPORT_SECTIONS.filter((s) => isSectionEnabled(hiddenSections, s.id));

  // ─── Opmaak-variabelen: sturen zowel de meetcontainer als de vellen ───
  const shellStyle = {
    "--rpt-page-w": `${dims.w}mm`,
    "--rpt-page-h": `${dims.h}mm`,
    "--rpt-marge-boven": `${margeBoven}mm`,
    "--rpt-marge-onder": `${margeOnder}mm`,
    "--rpt-marge-links": `${margeLinks}mm`,
    "--rpt-marge-rechts": `${margeRechts}mm`,
    "--rpt-basis": `${basisLettergrootte}pt`,
    "--rpt-regelafstand": String(regelafstand),
  } as CSSProperties;

  const zoomStyle = { "--rpt-zoom": String(zoom) } as CSSProperties;

  // ─── Paginering ───
  const meetRef = useRef<HTMLDivElement>(null);
  const kopRef = useRef<HTMLDivElement>(null);
  const inhoudRef = useRef<HTMLDivElement>(null);
  const vellenRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const eersteRef = useRef(true);
  const [aantalVellen, setAantalVellen] = useState(0);

  const paginaLabel = useCallback(
    (nummer: number, totaal: number) =>
      `${t("report.pagePrefix", "Pagina")} ${nummer} ${t("report.pageOf", "van")} ${totaal}`,
    [t],
  );

  const draai = useCallback(() => {
    const meet = meetRef.current;
    const kop = kopRef.current;
    const inhoud = inhoudRef.current;
    const doel = vellenRef.current;
    if (!meet || !kop || !inhoud || !doel) return;
    const n = pagineer({
      meet,
      kop,
      inhoud,
      doel,
      velHoogteMm: dims.h,
      margeBovenMm: margeBoven,
      margeOnderMm: margeOnder,
      merk: "Open FEM2D Studio",
      paginaLabel,
    });
    setAantalVellen(n);
  }, [dims.h, margeBoven, margeOnder, paginaLabel]);

  const plan = useCallback(
    (vertraging: number) => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(draai, vertraging);
    },
    [draai],
  );

  // Herpagineer bij elke wijziging die de opmaak raakt: marges, papier-
  // formaat/oriëntatie, sectie aan/uit, lettergrootte, interlinie en taal.
  // Modeldata loopt via de observers hieronder.
  useEffect(() => {
    plan(eersteRef.current ? 0 : HERPAGINEER_MS);
    eersteRef.current = false;
  }, [
    plan,
    dims.w,
    dims.h,
    margeBoven,
    margeOnder,
    margeLinks,
    margeRechts,
    basisLettergrootte,
    regelafstand,
    hiddenSections,
    i18n.language,
  ]);

  // Inhoudswijzigingen (model, resultaten, toetsing, projectgegevens): de
  // secties rerenderen in de meetcontainer, de observers pikken dat op. Zo
  // hoeft de shell geen enkele datadependency te kennen — dat werkt ook in
  // het losgekoppelde venster, waar de data via reportSync binnenkomt.
  useEffect(() => {
    const meet = meetRef.current;
    if (!meet) return;
    const mo = new MutationObserver(() => plan(HERPAGINEER_MS));
    mo.observe(meet, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(() => plan(HERPAGINEER_MS));
    ro.observe(meet);
    // Webfonts kunnen ná de eerste meting binnenkomen — dan hermeten.
    let levend = true;
    document.fonts?.ready.then(() => {
      if (levend) plan(0);
    });
    return () => {
      levend = false;
      mo.disconnect();
      ro.disconnect();
      window.clearTimeout(timerRef.current);
    };
  }, [plan]);

  // Interactie met de gekloonde bedieningen (koptekst-regel, combinatie-
  // keuze) doorspelen naar het echte React-element in de meetcontainer.
  useEffect(() => {
    const doel = vellenRef.current;
    const meet = meetRef.current;
    if (!doel || !meet) return;
    return koppelBedieningsDoorgifte(doel, meet);
  }, []);

  // Markeer in de zijbalk welke sectie in beeld is (bijzaak — puur navigatie).
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let wacht: number | undefined;
    const bepaal = () => {
      wacht = undefined;
      const doel = vellenRef.current;
      if (!doel) return;
      const secties = doel.querySelectorAll<HTMLElement>("[data-section]");
      if (secties.length === 0) {
        setActieveSectie(null);
        return;
      }
      // De laatste sectie die boven de leesgrens begint is de sectie die je
      // leest; staat er nog niets boven (helemaal bovenaan), dan de eerste.
      const grens = scroll.getBoundingClientRect().top + 80;
      let actief: string | null = secties[0].dataset.section ?? null;
      secties.forEach((el) => {
        if (el.getBoundingClientRect().top <= grens) actief = el.dataset.section ?? null;
      });
      setActieveSectie(actief);
    };
    // Bewust een timer en geen requestAnimationFrame: een verborgen venster
    // (rapport op de achtergrond) krijgt geen frames meer.
    const opScroll = () => {
      if (wacht === undefined) wacht = window.setTimeout(bepaal, 80);
    };
    scroll.addEventListener("scroll", opScroll, { passive: true });
    bepaal();
    return () => {
      scroll.removeEventListener("scroll", opScroll);
      if (wacht !== undefined) window.clearTimeout(wacht);
    };
  }, [setActieveSectie, aantalVellen]);

  return (
    <div className="report-shell" style={shellStyle}>
      <style>{pageCss}</style>

      {/* Scherm-chrome — verdwijnt bij print (@media print in report.css). */}
      <div className="report-shell-toolbar">
        <span className="report-shell-info">
          {pageSize} · {orientation === "portrait"
            ? t("report.portrait", "Staand")
            : t("report.landscape", "Liggend")}
          {aantalVellen > 0 && ` · ${aantalVellen} ${t("report.sheets", "vellen")}`}
          {" · "}{headerText}
        </span>
        <label className="report-zoom-control">
          <span>{t("report.zoom", "Zoom")}</span>
          <input
            type="range"
            min={Math.round(REPORT_ZOOM_MIN * 100)}
            max={Math.round(REPORT_ZOOM_MAX * 100)}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          />
          <span className="report-zoom-pct">{Math.round(zoom * 100)}%</span>
        </label>
        {onDetach && (
          <button
            className="report-detach-btn"
            onClick={onDetach}
            title={t("report.detachHint", "Opent het rapport in een eigen venster dat live met het model meebeweegt.")}
          >
            {detachWindowIcon}
            {t("report.detach", "Naast je scherm")}
          </button>
        )}
        <button
          className="report-print-btn"
          onClick={() => window.print()}
          title={t("report.printHint", "Opent de printdialoog — kies daar 'Opslaan als PDF' voor een PDF.")}
        >
          {printIcon}
          {t("report.print", "Afdrukken / PDF")}
        </button>
      </div>

      {showStale && (
        <div className="report-stale-banner" role="status">
          {t("report.staleBanner", "Model gewijzigd — druk op Berekenen om het rapport bij te werken.")}
        </div>
      )}

      {/* ─── Meetcontainer ───
          Onzichtbaar, maar wél opgemaakt: hier draaien de live secties op
          exact de tekstbreedte van het vel. De paginering meet hier de
          natuurlijke breekpunten en kloont ze naar de vellen. */}
      <div className="rpt-meet" ref={meetRef} aria-hidden="true">
        <div className="rpt-kop" ref={kopRef}>
          {kopBedrijf && <div className="rpt-kop-bedrijf">{kopBedrijf}</div>}
          {(kopRegels.length > 0 || kopRechts.length > 0) && (
            <div className="rpt-kop-grid">
              <div>
                {kopRegels.map(([label, waarde]) => (
                  <div key={label} className="rpt-kop-regel">
                    <span className="rpt-kop-label">{label}</span>
                    <span>: {waarde}</span>
                  </div>
                ))}
              </div>
              <div>
                {kopRechts.map(([label, waarde]) => (
                  <div key={label} className="rpt-kop-regel">
                    <span className="rpt-kop-label">{label}</span>
                    <span>: {waarde}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rpt-meet-inhoud" ref={inhoudRef}>
          {sections.map(({ id, Component }) => (
            <section key={id} className="rpt-hoofdstuk" data-section={id}>
              <Component />
            </section>
          ))}
        </div>
      </div>

      <div className="report-scroll" ref={scrollRef}>
        <div className="report-zoom" style={zoomStyle}>
          {/* De opmaakproef: losse vellen, door paginate.ts opgebouwd. */}
          <div className="rpt-vellen" ref={vellenRef} />
          {sections.length === 0 && (
            <div className="report-no-sections">
              {t("report.noSections", "Alle secties staan uit — zet een sectie aan in de zijbalk.")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
