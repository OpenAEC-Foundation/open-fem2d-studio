/**
 * LoadCaseTabBar — Excel-style horizontal tab strip at the bottom of the
 * main view. Each tab represents one belastinggeval; click to switch the
 * active load case (drives the canvas overlay + solver-result selection).
 *
 * The bar renders inline between the canvas/content area and the StatusBar.
 * Hidden on full-width views (IFC, report) since those don't use LCs.
 *
 * VEEL GEVALLEN (issue #51). Alleen de gevallen staan in een eigen strook die
 * horizontaal scrolt (muiswiel, touchpad, slepen met de muis, pijltoetsen op
 * een tab); de vaste onderdelen (Model, Resultaten, +, eigen gewicht, analyse,
 * φ, scheefstand) blijven staan. Bij overloop verschijnen pijlknoppen links en
 * rechts van de strook, het actieve geval schuift vanzelf in beeld (ook als
 * het in de verkenner wordt gekozen), en de lijstknop ▾ toont alle gevallen.
 * De rekenregels staan in `lib/tabbalkScroll.ts`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import LengthInput from "../LengthInput";
import { formatLength } from "../../lib/lengthInput";
import type { LoadCase, Load, Analysetype } from "./femTypes";
import { ANALYSETYPEN } from "./femTypes";
import {
  SCHEEFSTAND_BRONNEN, SCHEEFSTAND_BRON_LABEL, type ScheefstandBron,
} from "../../lib/scheefstandNorm";
import {
  CEMENTKLASSEN,
  kruipveldZichtbaar,
  STANDAARD_KRUIPINVOER,
  type KruipInvoerProject,
} from "../../lib/kruipcoefficient";
import type { EigenGewichtOverzicht } from "../../lib/eigenGewichtOverzicht";
import { isEigenGewichtGeval } from "../../lib/eigenGewicht";
import {
  isSleep, MARGE_ACTIEF, naburigGeval, scrollStap, scrollVoorZichtbaar, tabbalkOverloop, wielNaarScroll,
  type ScrollStand,
} from "../../lib/tabbalkScroll";
import "./LoadCaseTabBar.css";

interface Props {
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  setActiveLoadCaseId: (id: number) => void;
  addLoadCase: (name: string) => void;
  /** All loads — used to show count badges per tab. */
  loads: Load[];
  /** Solver toggles — surfaced on the right side of the bar. */
  selfWeightEnabled?: boolean;
  setSelfWeightEnabled?: (v: boolean) => void;
  /**
   * Het automatische eigen gewicht (issue #42), afgeleid in App.tsx uit
   * dezelfde functie als de rekengang. De balk telt en rekent zelf niets: de
   * tab van het geval dat het eigen gewicht krijgt toont dit aantal erbij.
   */
  eigenGewicht?: EigenGewichtOverzicht;
  /**
   * Het aanbod "geef het eigen gewicht een eigen geval". Alleen gezet als het
   * van toepassing is (eigen gewicht aan, nog in het eerste blijvende geval).
   */
  onVerplaatsEigenGewicht?: () => void;
  /** Analysetype: 1e orde, 2e orde (P-Δ) of 2e orde + fysisch niet-lineair. */
  analysetype?: Analysetype;
  setAnalysetype?: (v: Analysetype) => void;
  /** Gewenste segmentlengte in mm (besluit B3) — alleen zichtbaar bij fysisch. */
  betonSegmentLengteMm?: number;
  setBetonSegmentLengteMm?: (v: number) => void;
  /**
   * φ(∞,t₀) van het project, art. 3.1.4; `null` = niet opgegeven. Zichtbaar
   * zodra het model een betonstaaf bevat, bij ELK analysetype: de waarde voedt
   * de BGT-stijfheid (fysisch niet-lineair) én de kolomtoets (altijd). Zie
   * `kruipveldZichtbaar` in lib/kruipcoefficient.ts.
   */
  betonKruipcoefficient?: number | null;
  setBetonKruipcoefficient?: (v: number | null) => void;
  /**
   * De invoer om φ(∞,t₀) volgens bijlage B te laten berekenen (RH, t₀,
   * cementklasse); `null` = bijlage B uit. Een opgegeven φ gaat voor.
   */
  betonKruipInvoer?: KruipInvoerProject | null;
  setBetonKruipInvoer?: (v: KruipInvoerProject | null) => void;
  /** Bevat het model een betonstaaf (met of zonder korf)? */
  heeftBetonstaaf?: boolean;
  /**
   * Aantal betonstaven mét wapeningskorf. Nul betekent dat de fysisch
   * niet-lineaire stand niets te doen heeft; dat hoort de balk te zeggen in
   * plaats van stilzwijgend hetzelfde antwoord te geven als P-Δ.
   */
  aantalBetonstaven?: number;
  /** Waarschuwing over de modelgrootte (besluit B3); null = geen. */
  segmentWaarschuwing?: string | null;
  /** Scheefstand (initiële imperfectie): H = φ·V per verticale last. */
  scheefstandEnabled?: boolean;
  setScheefstandEnabled?: (v: boolean) => void;
  /** Noemer x in φ = 1/x (default 200). */
  scheefstandNoemer?: number;
  setScheefstandNoemer?: (v: number) => void;
  /** Richting van de equivalente horizontale krachten: +1 = +x, −1 = −x. */
  scheefstandRichting?: 1 | -1;
  setScheefstandRichting?: (v: 1 | -1) => void;
  /**
   * Waar φ vandaan komt: `"vast"` (de noemer hierboven, en de stand van elk
   * bestaand project) of een van de drie normen — zie `lib/scheefstandNorm.ts`.
   */
  scheefstandBron?: ScheefstandBron;
  setScheefstandBron?: (v: ScheefstandBron) => void;
  /** Handmatige h in m voor α_h; `null` = de afgeleide waarde tonen. */
  scheefstandHoogteM?: number | null;
  setScheefstandHoogteM?: (v: number | null) => void;
  /** Handmatige m voor α_m; `null` = de afgeleide waarde tonen. */
  scheefstandAantalElementen?: number | null;
  setScheefstandAantalElementen?: (v: number | null) => void;
  /**
   * 1/φ zoals er is GEREKEND. De balk rekent zelf niets uit — App.tsx bepaalt
   * φ op één plek, zodat het scherm nooit iets anders kan tonen dan de motor
   * heeft gekregen.
   */
  scheefstandPhiNoemer?: number;
  /** De uit het model afgeleide h en m — de plaatshouder in de invoervelden. */
  scheefstandAfgeleideHoogteM?: number;
  scheefstandAfgeleidAantal?: number;
  /** De volledige afleiding met alle tussenwaarden, voor de tooltip. */
  scheefstandToelichting?: string;
  /** Wat er mis kan zijn met de afleiding; leeg = niets. */
  scheefstandWaarschuwingen?: string[];
  /** Model-view tab: when false, no LC loads are drawn on the canvas. */
  showLoads?: boolean;
  setShowLoads?: (v: boolean) => void;
  /** Results tab: only visible after the solver has produced output. */
  hasResults?: boolean;
  /** True when the user has clicked the Resultaten-tab — drives styling. */
  resultsActive?: boolean;
  /** Click handler for the Resultaten-tab; supplied by App.tsx. */
  onShowResults?: () => void;
}

/** De scrollstand van een element, voor de rekenregels van `lib/tabbalkScroll`. */
function standVan(el: HTMLElement): ScrollStand {
  return { scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
}

/** Pijltoets op een tab → welk geval `naburigGeval` moet kiezen. */
const TOETS_STAP: Record<string, "vorige" | "volgende" | "eerste" | "laatste"> = {
  ArrowLeft: "vorige", ArrowRight: "volgende", Home: "eerste", End: "laatste",
};

/** Two-character tag for the load-case type chip. */
function typeTag(type: LoadCase["type"]): string {
  switch (type) {
    case "dead": return "G";
    case "live": return "Q";
    case "snow": return "S";
    case "wind": return "W";
    default:     return "—";
  }
}

export default function LoadCaseTabBar({
  loadCases, activeLoadCaseId, setActiveLoadCaseId, addLoadCase, loads,
  selfWeightEnabled, setSelfWeightEnabled, eigenGewicht, onVerplaatsEigenGewicht,
  analysetype = "eersteOrde", setAnalysetype,
  betonSegmentLengteMm = 400, setBetonSegmentLengteMm,
  betonKruipcoefficient = null, setBetonKruipcoefficient, heeftBetonstaaf = false,
  betonKruipInvoer = null, setBetonKruipInvoer,
  aantalBetonstaven = 0, segmentWaarschuwing = null,
  scheefstandEnabled, setScheefstandEnabled,
  scheefstandNoemer, setScheefstandNoemer,
  scheefstandRichting,
  scheefstandBron = "vast", setScheefstandBron,
  scheefstandHoogteM = null, setScheefstandHoogteM,
  scheefstandAantalElementen = null, setScheefstandAantalElementen,
  scheefstandPhiNoemer, scheefstandAfgeleideHoogteM = 0,
  scheefstandAfgeleidAantal = 1, scheefstandToelichting = "",
  scheefstandWaarschuwingen = [],
  showLoads = true, setShowLoads,
  hasResults = false, resultsActive = false, onShowResults,
}: Props) {
  const { t } = useTranslation("common");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // ── De strook met gevallen (issue #51) ──────────────────────────────────
  const strookRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<number, HTMLButtonElement>());
  const lijstKnopRef = useRef<HTMLButtonElement>(null);
  const lijstRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overloop: false, kanLinks: false, kanRechts: false });
  const [lijst, setLijst] = useState<
    { right: number; bottom: number; maxHeight: number; maxWidth: number } | null
  >(null);
  // Een sleep met de muis: waar hij begon, en of hij de drempel al over is.
  const sleep = useRef<{ x: number; links: number; id: number; bezig: boolean } | null>(null);
  // Na een sleep volgt nog een klik op de tab eronder; die kiest niets.
  const klikNaSleep = useRef(false);

  /** Overloop en pijlen opnieuw bepalen; alleen een echte wijziging rendert. */
  const meet = useCallback(() => {
    const s = strookRef.current;
    if (!s) return;
    const n = tabbalkOverloop(standVan(s));
    setScroll((v) => (v.overloop === n.overloop && v.kanLinks === n.kanLinks && v.kanRechts === n.kanRechts ? v : n));
  }, []);

  // De inhoud verandert (gevallen erbij of eraf, tellers, namen): meten.
  useLayoutEffect(meet, [meet, loadCases, loads, eigenGewicht, hasResults, adding]);

  // Maatveranderingen (venster, lettertype geladen) en het muiswiel. Het wiel
  // hangt er zelf aan: React registreert wheel passief, en dan kan
  // preventDefault de pagina niet tegenhouden.
  useEffect(() => {
    const s = strookRef.current;
    if (!s) return;
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(s);
    for (const kind of s.children) waarnemer.observe(kind);
    const opWiel = (e: WheelEvent) => {
      const d = wielNaarScroll(e.deltaX, e.deltaY, e.deltaMode, s.clientWidth);
      if (d === 0 || !tabbalkOverloop(standVan(s)).overloop) return;
      e.preventDefault();
      s.scrollLeft += d;
      meet();
    };
    s.addEventListener("wheel", opWiel, { passive: false });
    return () => {
      waarnemer.disconnect();
      s.removeEventListener("wheel", opWiel);
    };
  }, [meet, loadCases]);

  // Het actieve geval in beeld, bij elke wissel — via de tab, de lijst, het
  // toetsenbord of de verkenner. Alleen de strook schuift ("nearest"), niet de
  // pagina eromheen, dus geen scrollIntoView.
  useLayoutEffect(() => {
    if (!showLoads) return;
    const s = strookRef.current;
    const tab = tabRefs.current.get(activeLoadCaseId);
    if (!s || !tab) return;
    const doel = scrollVoorZichtbaar({ links: tab.offsetLeft, breedte: tab.offsetWidth }, standVan(s), MARGE_ACTIEF);
    if (Math.abs(doel - s.scrollLeft) > 0.5) s.scrollLeft = doel;
    meet();
  }, [activeLoadCaseId, showLoads, loadCases.length, meet]);

  const kies = (id: number) => {
    setActiveLoadCaseId(id);
    setShowLoads?.(true);    // any LC click leaves model-only view
  };

  /** Pijlknop: het eerstvolgende (deels) verborgen geval helemaal in beeld. */
  const schuif = (richting: 1 | -1) => {
    const s = strookRef.current;
    if (!s) return;
    const plekken = [...tabRefs.current.values()]
      .map((el) => ({ links: el.offsetLeft, breedte: el.offsetWidth }))
      .sort((a, b) => a.links - b.links);
    s.scrollLeft = scrollStap(richting, plekken, standVan(s));
    // Het scroll-event komt pas bij de volgende frame; de pijlen nu al bijwerken.
    meet();
  };

  /** Pijltoetsen, Home en End op een tab kiezen het naburige geval. */
  const opTabToets = (e: ReactKeyboardEvent, id: number) => {
    const stap = TOETS_STAP[e.key];
    if (!stap) return;
    e.preventDefault();
    const doel = naburigGeval(loadCases.map((c) => c.id), id, stap);
    if (doel === undefined) return;
    kies(doel);
    tabRefs.current.get(doel)?.focus({ preventScroll: true });
  };

  // ── De lijst met alle gevallen (▾) ──────────────────────────────────────
  const sluitLijst = useCallback((focusTerug: boolean) => {
    setLijst(null);
    if (focusTerug) lijstKnopRef.current?.focus();
  }, []);

  /** Openen, of bij een andere venstermaat opnieuw plaatsen. */
  const plaatsLijst = useCallback(() => {
    const k = lijstKnopRef.current;
    if (!k) return;
    // Boven de knop (de balk staat onderaan), rechts uitgelijnd, binnen het venster.
    const r = k.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setLijst({
      right,
      bottom: window.innerHeight - r.top + 4,
      maxHeight: Math.max(120, r.top - 8),
      maxWidth: Math.min(360, window.innerWidth - right - 8),
    });
  }, []);

  const lijstOpen = lijst !== null;
  useEffect(() => {
    if (!lijstOpen) return;
    // Focus op het actieve geval (of het eerste) in de lijst.
    const items = [...(lijstRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    (items.find((el) => el.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
    // Esc sluit de lijst, en alleen de lijst: in de vangfase op window, zodat
    // de Esc van het tekenvlak (selectie opheffen) niet ook afgaat.
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      sluitLijst(true);
    };
    const opWijzer = (e: PointerEvent) => {
      const doel = e.target as globalThis.Node | null;
      if (doel && (lijstRef.current?.contains(doel) || lijstKnopRef.current?.contains(doel))) return;
      sluitLijst(false);
    };
    window.addEventListener("keydown", opToets, true);
    document.addEventListener("pointerdown", opWijzer, true);
    window.addEventListener("resize", plaatsLijst);
    return () => {
      window.removeEventListener("keydown", opToets, true);
      document.removeEventListener("pointerdown", opWijzer, true);
      window.removeEventListener("resize", plaatsLijst);
    };
  }, [lijstOpen, sluitLijst, plaatsLijst]);

  /** Pijltoetsen, Home, End en Tab in de lijst. */
  const opLijstToets = (e: ReactKeyboardEvent) => {
    const items = [...(lijstRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const naar = (j: number) => { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, j))]?.focus(); };
    if (e.key === "ArrowDown") naar(i + 1);
    else if (e.key === "ArrowUp") naar(i - 1);
    else if (e.key === "Home") naar(0);
    else if (e.key === "End") naar(items.length - 1);
    else if (e.key === "Tab") sluitLijst(false);
  };

  const handleAdd = () => {
    const name = newName.trim() || t("loadCases.defaultCaseName", { n: loadCases.length + 1 });
    addLoadCase(name);
    setAdding(false);
    setNewName("");
  };

  return (
    <div className="lc-tab-bar" role="tablist" aria-label={t("loadCases.tablistLabel")}>
      {/* Model tab — leftmost, hides loads when active. */}
      <button
        role="tab"
        aria-selected={!showLoads}
        className={`lc-tab lc-tab-model${!showLoads ? " active" : ""}`}
        onClick={() => setShowLoads?.(false)}
        title={t("loadCases.modelTabTitle")}
      >
        <span className="lc-tab-type lc-tab-type-model">M</span>
        <span className="lc-tab-name">{t("loadCases.modelTab")}</span>
      </button>

      {scroll.overloop && (
        <button
          type="button"
          className="lc-tab-scroll lc-tab-scroll-links"
          disabled={!scroll.kanLinks}
          onClick={() => schuif(-1)}
          title={t("loadCases.scrollLeft")}
          aria-label={t("loadCases.scrollLeft")}
        >
          <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
            <path d="M6 1 2 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Alleen deze strook scrolt. Slepen met de muis scrolt ook; een
          aanraakscherm scrolt hem zelf (touch-action: pan-x). */}
      <div
        ref={strookRef}
        className="lc-tab-cases"
        role="presentation"
        onScroll={meet}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          sleep.current = { x: e.clientX, links: e.currentTarget.scrollLeft, id: e.pointerId, bezig: false };
        }}
        onPointerMove={(e) => {
          const d = sleep.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (!d.bezig) {
            if (!isSleep(dx)) return;
            d.bezig = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* wijzer al weg */ }
          }
          e.currentTarget.scrollLeft = d.links - dx;
          meet();
        }}
        onPointerUp={(e) => {
          if (sleep.current?.bezig) {
            klikNaSleep.current = true;
            // De klik volgt direct op pointerup; komt hij niet (losgelaten
            // buiten de balk), dan mag de volgende gewone klik niet sneuvelen.
            window.setTimeout(() => { klikNaSleep.current = false; }, 0);
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* al los */ }
          }
          sleep.current = null;
        }}
        onPointerCancel={() => { sleep.current = null; }}
        onClickCapture={(e) => {
          if (!klikNaSleep.current) return;
          klikNaSleep.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
      {loadCases.map(lc => {
        const isActive = showLoads && lc.id === activeLoadCaseId;
        // De teller telt ook de automatisch gegenereerde lasten van het eigen
        // gewicht mee in het geval dat ze krijgt — het gekenmerkte geval, of
        // (oud project) het eerste blijvende. Zo is een geval dat alleen eigen
        // gewicht draagt zichtbaar NIET leeg.
        const automatisch = eigenGewicht && eigenGewicht.caseId === lc.id ? eigenGewicht.aantalLasten : 0;
        const count = loads.filter(l => l.caseId === lc.id).length + automatisch;
        const isEg = isEigenGewichtGeval(lc);
        return (
          <button
            key={lc.id}
            ref={(el) => {
              if (el) tabRefs.current.set(lc.id, el);
              else tabRefs.current.delete(lc.id);
            }}
            role="tab"
            aria-selected={isActive}
            className={`lc-tab${isActive ? " active" : ""}${isEg ? " lc-tab-auto" : ""}`}
            onClick={() => kies(lc.id)}
            onKeyDown={(e) => opTabToets(e, lc.id)}
            title={isEg
              ? t("loadCases.selfWeightTabTitle", { naam: lc.name, count: automatisch })
              : automatisch > 0
                ? t("loadCases.tabTitleWithSelfWeight", { naam: lc.name, count, automatisch })
                : t("loadCases.tabTitle", { naam: lc.name, count })}
          >
            <span className={`lc-tab-type lc-tab-type-${lc.type}`}>{typeTag(lc.type)}</span>
            <span className="lc-tab-name">{lc.name}</span>
            {isEg && <span className="lc-tab-auto-tag">{t("loadCases.autoTag")}</span>}
            {count > 0 && <span className="lc-tab-count">{count}</span>}
          </button>
        );
      })}
      </div>

      {scroll.overloop && (
        <button
          type="button"
          className="lc-tab-scroll lc-tab-scroll-rechts"
          disabled={!scroll.kanRechts}
          onClick={() => schuif(1)}
          title={t("loadCases.scrollRight")}
          aria-label={t("loadCases.scrollRight")}
        >
          <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
            <path d="M2 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* ▾ — alle gevallen in een lijst, om direct te kiezen. */}
      {loadCases.length > 0 && (
        <button
          ref={lijstKnopRef}
          type="button"
          className={`lc-tab-lijst${lijstOpen ? " open" : ""}`}
          aria-haspopup="menu"
          aria-expanded={lijstOpen}
          aria-label={t("loadCases.listLabel")}
          title={t("loadCases.listTitle")}
          onClick={() => (lijstOpen ? sluitLijst(false) : plaatsLijst())}
        >
          <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
            <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {lijst && createPortal(
        <div
          ref={lijstRef}
          className="lc-tab-lijst-menu"
          role="menu"
          aria-label={t("loadCases.listLabel")}
          style={lijst}
          onKeyDown={opLijstToets}
        >
          {loadCases.map((lc) => {
            const isActive = showLoads && lc.id === activeLoadCaseId;
            return (
              <button
                key={lc.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className="lc-tab-lijst-item"
                title={lc.name}
                onClick={() => {
                  kies(lc.id);
                  sluitLijst(true);
                }}
              >
                <span className={`lc-tab-type lc-tab-type-${lc.type}`}>{typeTag(lc.type)}</span>
                <span className="lc-tab-lijst-naam">{lc.name}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {/* Resultaten-tab — verschijnt aan het einde nadat Bereken is gedraaid. */}
      {hasResults && (
        <button
          role="tab"
          aria-selected={resultsActive}
          className={`lc-tab lc-tab-results${resultsActive ? " active" : ""}`}
          onClick={() => onShowResults?.()}
          title={t("loadCases.resultsTabTitle")}
        >
          <span className="lc-tab-type lc-tab-type-results">R</span>
          <span className="lc-tab-name">{t("loadCases.resultsTab")}</span>
        </button>
      )}

      {adding ? (
        <span className="lc-tab-add-form">
          <input
            type="text"
            className="lc-tab-add-input"
            autoFocus
            placeholder={t("loadCases.defaultCaseName", { n: loadCases.length + 1 })}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              else if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            onBlur={handleAdd}
          />
        </span>
      ) : (
        <button
          className="lc-tab-add"
          onClick={() => setAdding(true)}
          title={t("loadCases.addTitle")}
          aria-label={t("loadCases.addLabel")}
        >
          +
        </button>
      )}

      {/* Flex spacer pushes solver toggles to the right. */}
      <span className="lc-tab-spacer" />

      {setSelfWeightEnabled && (
        <label
          className={`lc-tab-toggle${selfWeightEnabled ? " active" : ""}`}
          title={t("loadCases.selfWeightTitle")}
        >
          <input
            type="checkbox"
            checked={!!selfWeightEnabled}
            onChange={(e) => setSelfWeightEnabled(e.target.checked)}
          />
          <span>{t("loadCases.selfWeight")}</span>
        </label>
      )}

      {/* Het aanbod van issue #42: een ouder project heeft het eigen gewicht
          nog tussen de handmatige lasten van het eerste blijvende geval. Niets
          wordt stil omgezet; deze knop doet het op verzoek, als één undo-stap. */}
      {onVerplaatsEigenGewicht && (
        <button
          type="button"
          className="lc-tab-offer"
          onClick={onVerplaatsEigenGewicht}
          title={t("loadCases.selfWeightOfferTitle")}
        >
          {t("loadCases.selfWeightOffer")}
        </button>
      )}

      {/* Analysetype — drie standen, want de derde (fysisch niet-lineair) past
          niet in de booleaan die hier eerst stond. Zie femTypes.Analysetype. */}
      {setAnalysetype && (
        <span
          className={`lc-tab-phi${analysetype !== "eersteOrde" ? " active" : ""}`}
          title={t(`loadCases.analysisDescription.${analysetype}`)}
        >
          <span className="lc-tab-phi-label">{t("loadCases.analysis")}</span>
          <select
            className="lc-tab-phi-dir"
            value={analysetype}
            onChange={(e) => setAnalysetype(e.target.value as Analysetype)}
          >
            {ANALYSETYPEN.map((a) => (
              <option key={a} value={a}>{t(`loadCases.analysisType.${a}`)}</option>
            ))}
          </select>
        </span>
      )}

      {/* De segmentlengte is de knop die de gebruiker in handen heeft bij een
          fysisch niet-lineaire berekening (besluit B3): instelbaar, 400 mm als
          beginwaarde, geen automatische vergroving. */}
      {setAnalysetype && analysetype === "tweedeOrdeFysisch" && (
        <span
          className="lc-tab-phi"
          title={t("loadCases.segmentTitle")}
        >
          <span className="lc-tab-phi-label">{t("loadCases.segment")}</span>
          <input
            type="number"
            className="lc-tab-phi-input"
            min={50}
            step={50}
            value={betonSegmentLengteMm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setBetonSegmentLengteMm?.(v);
            }}
          />
          <span className="lc-tab-phi-label">mm</span>
        </span>
      )}

      {/* DE KRUIPCOËFFICIËNT van het project, art. 3.1.4. Leeg = niet
          opgegeven, en dat is iets anders dan 0 ("geen kruip"): zonder waarde
          en zonder bijlage B rekent de kern met φ_ef = 0, en dan is de
          buigstijfheid te hoog en de zakking te klein — de onveilige kant.
          Met "bijlage B" aan berekent de kern φ(∞,t₀) per staaf uit RH, t₀ en
          de cementklasse, met h₀ uit de doorsnede; een hier OPGEGEVEN waarde
          gaat daar vóór. Een staaf met een eigen waarde in het §5.8-blok gaat
          vóór allebei.
          ZICHTBAAR BIJ ELK ANALYSETYPE zodra er beton in het model zit: de
          waarde voedt ook de kolomtoets (§5.8.3.1, §5.8.4), die altijd loopt.
          Een verborgen veld dat meerekent is een stille invloed. */}
      {setBetonKruipcoefficient && kruipveldZichtbaar(heeftBetonstaaf, betonKruipcoefficient) && (
        <span
          className={
            betonKruipcoefficient === null && betonKruipInvoer === null
              ? "lc-tab-phi lc-tab-phi-waarschuwing"
              : "lc-tab-phi"
          }
          title={`${t("loadCases.creepTitle")}\n\n${t("loadCases.creepFeedsBoth")}`}
        >
          <span className="lc-tab-phi-label">φ(∞,t₀)</span>
          <input
            type="number"
            className="lc-tab-phi-input"
            min={0}
            step={0.1}
            placeholder={t("loadCases.emptyPlaceholder")}
            value={betonKruipcoefficient ?? ""}
            onChange={(e) => {
              const tekst = e.target.value.trim();
              if (tekst === "") {
                setBetonKruipcoefficient?.(null);
                return;
              }
              const v = Number(tekst);
              if (Number.isFinite(v) && v >= 0) setBetonKruipcoefficient?.(v);
            }}
          />
          {setBetonKruipInvoer && (
            <label className="lc-tab-phi-label" title={t("loadCases.creepAnnexBTitle")}>
              <input
                type="checkbox"
                checked={betonKruipInvoer !== null}
                onChange={(e) =>
                  setBetonKruipInvoer(e.target.checked ? { ...STANDAARD_KRUIPINVOER } : null)
                }
              />{" "}
              {t("loadCases.creepAnnexB")}
            </label>
          )}
          {setBetonKruipInvoer && betonKruipInvoer !== null && (
            <span
              className={
                betonKruipcoefficient !== null ? "lc-tab-phi lc-tab-phi-overstemd" : "lc-tab-phi"
              }
              title={
                betonKruipcoefficient !== null
                  ? t("loadCases.creepAnnexBOverridden")
                  : t("loadCases.creepAnnexBTitle")
              }
            >
              <span className="lc-tab-phi-label">{t("loadCases.creepRh")}</span>
              <input
                type="number"
                className="lc-tab-phi-input"
                min={1}
                max={100}
                step={5}
                value={betonKruipInvoer.rhProcent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0 && v <= 100) {
                    setBetonKruipInvoer({ ...betonKruipInvoer, rhProcent: v });
                  }
                }}
              />
              <span className="lc-tab-phi-label">%</span>
              <span className="lc-tab-phi-label">{t("loadCases.creepT0")}</span>
              <input
                type="number"
                className="lc-tab-phi-input"
                min={0.5}
                step={1}
                value={betonKruipInvoer.t0Dagen}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) {
                    setBetonKruipInvoer({ ...betonKruipInvoer, t0Dagen: v });
                  }
                }}
              />
              <span className="lc-tab-phi-label">{t("loadCases.creepDays")}</span>
              <span className="lc-tab-phi-label">{t("loadCases.creepCement")}</span>
              <select
                className="lc-tab-phi-dir"
                value={betonKruipInvoer.cementklasse}
                onChange={(e) =>
                  setBetonKruipInvoer({
                    ...betonKruipInvoer,
                    cementklasse: e.target.value as KruipInvoerProject["cementklasse"],
                  })
                }
              >
                {CEMENTKLASSEN.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </span>
          )}
        </span>
      )}

      {/* Zonder betonstaven mét korf doet de derde stand niets. Dat hoort
          hier te staan en niet stil te blijven. */}
      {setAnalysetype && analysetype === "tweedeOrdeFysisch" && aantalBetonstaven === 0 && (
        <span
          className="lc-tab-phi"
          title={t("loadCases.noConcreteBarsTitle")}
        >
          <span className="lc-tab-phi-label">{t("loadCases.noConcreteBars")}</span>
        </span>
      )}

      {setAnalysetype && analysetype === "tweedeOrdeFysisch" && segmentWaarschuwing && (
        <span className="lc-tab-phi" title={segmentWaarschuwing}>
          <span className="lc-tab-phi-label">⚠ {t("loadCases.modelLarge")}</span>
        </span>
      )}

      {/* Scheefstand — zelfde toggle-patroon; bij aan verschijnen φ (1/x) en
          de richtingskeuze inline. */}
      {setScheefstandEnabled && (
        <label
          className={`lc-tab-toggle${scheefstandEnabled ? " active" : ""}`}
          title={t("loadCases.swayTitle")}
        >
          <input
            type="checkbox"
            checked={!!scheefstandEnabled}
            onChange={(e) => setScheefstandEnabled(e.target.checked)}
          />
          <span>{t("loadCases.sway")}</span>
        </label>
      )}
      {/* Waar φ vandaan komt. "vast" is de beginstand en de stand van elk
          bestaand projectbestand: de ingetikte noemer, zonder de
          reductiefactoren van de norm. Kiest de gebruiker een norm, dan
          verdwijnt het noemerveld en verschijnen h en m — de twee grootheden
          die (5.5)/(5.1) nodig hebben. */}
      {setScheefstandEnabled && scheefstandEnabled && setScheefstandBron && (
        <span
          className="lc-tab-phi"
          title={t("loadCases.swaySourceTitle")}
        >
          <span className="lc-tab-phi-label">{t("loadCases.phiFrom")}</span>
          <select
            className="lc-tab-phi-dir"
            value={scheefstandBron}
            onChange={(e) => setScheefstandBron(e.target.value as ScheefstandBron)}
          >
            {SCHEEFSTAND_BRONNEN.map((b) => (
              <option key={b} value={b}>
                {b === "vast" || b === "ongunstigste"
                  ? t(`loadCases.swaySource.${b}`)
                  : SCHEEFSTAND_BRON_LABEL[b]}
              </option>
            ))}
          </select>
        </span>
      )}

      {setScheefstandEnabled && scheefstandEnabled && scheefstandBron === "vast" && (
        <span className="lc-tab-phi" title={t("loadCases.swayDenominatorTitle")}>
          <span className="lc-tab-phi-label">φ = 1/</span>
          <input
            type="number"
            className="lc-tab-phi-input"
            min={1}
            step={50}
            value={scheefstandNoemer ?? 200}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setScheefstandNoemer?.(v);
            }}
          />
        </span>
      )}

      {/* Bij een normkeuze: h en m met de AFGELEIDE waarde als plaatshouder,
          de uitkomst van (5.5)/(5.1) ernaast, en de hele afleiding met alle
          tussenwaarden in de tooltip. Leeg laten = de afleiding gebruiken;
          een getal invullen overschrijft haar. */}
      {setScheefstandEnabled && scheefstandEnabled && scheefstandBron !== "vast" && (
        <span className="lc-tab-phi" title={scheefstandToelichting}>
          <span className="lc-tab-phi-label">h =</span>
          <LengthInput className="lc-tab-phi-input" positive storedUnit="m"
            placeholder={formatLength(scheefstandAfgeleideHoogteM, "m")}
            value={scheefstandHoogteM}
            onChange={v => setScheefstandHoogteM?.(v ?? null)}
            title={t("loadCases.swayHeightTitle", { hoogte: formatLength(scheefstandAfgeleideHoogteM, "m") })}
          />
          <span className="lc-tab-phi-label">mm</span>
          <input
            type="number"
            className="lc-tab-phi-input"
            min={1}
            step={1}
            placeholder={String(scheefstandAfgeleidAantal)}
            value={scheefstandAantalElementen ?? ""}
            onChange={(e) => {
              const t = e.target.value.trim();
              if (t === "") { setScheefstandAantalElementen?.(null); return; }
              const v = Number(t);
              if (Number.isFinite(v) && v >= 1) setScheefstandAantalElementen?.(Math.floor(v));
            }}
            title={t("loadCases.swayMembersTitle", { aantal: scheefstandAfgeleidAantal })}
          />
          <span className="lc-tab-phi-label">
            {scheefstandWaarschuwingen.length > 0 ? "⚠ " : ""}
            φ = 1/{scheefstandPhiNoemer !== undefined
              ? scheefstandPhiNoemer.toFixed(0)
              : "—"}
          </span>
        </span>
      )}

      {setScheefstandEnabled && scheefstandEnabled && (
        <span
          className="lc-tab-phi"
          title={t("loadCases.swayDirectionTitle", { richting: (scheefstandRichting ?? 1) === 1 ? "+x" : "−x" })}
        >
          <span className="lc-tab-phi-label">±x</span>
        </span>
      )}
    </div>
  );
}
