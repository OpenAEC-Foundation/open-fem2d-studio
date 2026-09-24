/**
 * Browserkant van test-aanzicht-ui.mjs (issue #45): het echte tekenvlak, de
 * echte weergavelijst en de echte constructieschets van het rapport, met het
 * startmodel van de app (stalen portaal, houten ligger, betonbalk met korf).
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=licht|donker|knoop|beton|rapport` wordt alleen het beeld opgebouwd —
 * daarvan maakt de test op verzoek een schermafbeelding.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import ribbon from "../src/i18n/locales/nl/ribbon.json";
import "../src/themes.css";
import "../src/components/report/report.css";
import FemCanvas from "../src/components/fem/FemCanvas";
import { ResultatenTab } from "../src/components/fem/FemProjectTree";
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "../src/components/fem/FemResultsOverlay";
import { DEFAULT_GRID, type Selection } from "../src/components/fem/femTypes";
import SchemaSection from "../src/components/report/sections/SchemaSection";
import { EMPTY_REPORT_DATA, ReportDataProvider } from "../src/components/report/ReportDataContext";
import { makeInitialSnapshot } from "../src/hooks/useFemStore";
import { STEEL_SECTION_DIMS } from "../src/lib/steelSectionDims.generated";

const tests: { name: string; error?: string }[] = [];
const container = document.getElementById("root")!;
let root = createRoot(container);
const noop = () => {};
function mount(element: React.ReactNode) {
  flushSync(() => root.unmount());
  root = createRoot(container);
  flushSync(() => root.render(element));
}
const wacht = (ms = 80) => new Promise((r) => setTimeout(r, ms));
function ok(v: unknown, m: string) { if (!v) throw Error(m); }
function gelijk(a: unknown, b: unknown, m: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function bijna(a: number, b: number, tol: number, m: string) {
  if (!(Math.abs(a - b) <= tol)) throw Error(`${m}: ${a} ≠ ${b} (±${tol})`);
}
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); tests.push({ name }); }
  catch (e) { tests.push({ name, error: e instanceof Error ? e.message : String(e) }); }
}

// ── Het model: het startmodel van de app ──────────────────────────────────
// Staaf 1, 2: kolommen IPE 270 (5 m); 3: regel IPE 330 (12 m);
// 4, 5: GL24h 160x400; 6: C30/37 300x600 met korf (4Ø20 / 2Ø12, Ø8-200).
const model = makeInitialSnapshot();
const AAN: DisplayFlags = { ...DEFAULT_DISPLAY_FLAGS, aanzicht: true };

function Tekenvlak({ flags, selection = null, showLoads = false, resultsMode = false, onSelect, hoogte = 640 }: {
  flags: DisplayFlags; selection?: Selection | null; showLoads?: boolean; resultsMode?: boolean;
  onSelect?: (s: Selection) => void; hoogte?: number;
}) {
  return (
    <div className="fem-canvas-wrap" style={{ width: 1180, height: hoogte, position: "relative" }}>
      <FemCanvas
        tool="select" nodes={model.nodes} beams={model.beams} supports={model.supports} plates={[]} loads={model.loads}
        selection={selection as Selection} activeLoadCaseId={1} grid={{ ...DEFAULT_GRID, visible: false }}
        setSelection={onSelect ?? noop} addNode={() => 0} updateNode={noop} addBeam={() => null}
        addPlate={() => 0} addSupport={noop} addLoad={noop} deleteSelected={noop} splitBeamAt={noop}
        translateSelection={() => false} copySelection={() => false}
        rotateSelection={() => false} mirrorSelection={() => false}
        displayFlags={flags} showLoads={showLoads} resultsMode={resultsMode}
      />
    </div>
  );
}
const laag = () => container.querySelector(".fem-aanzicht");
const staafGroep = (id: number) => container.querySelector(`[data-aanzicht-staaf="${id}"]`);
const lijnen = (id: number, soort: string) =>
  [...(staafGroep(id)?.querySelectorAll<SVGLineElement>(`[data-aanzicht-lijn="${soort}"]`) ?? [])];
/** De systeemlijn van de n-de staaf (modelvolgorde). */
const systeemlijn = (n: number) => [...container.querySelectorAll<SVGLineElement>("line.fem-member")][n - 1];
const coords = (l: SVGLineElement) => ({ x1: l.x1.baseVal.value, y1: l.y1.baseVal.value, x2: l.x2.baseVal.value, y2: l.y2.baseVal.value });
/** px per mm, afgelezen aan de systeemlijn van staaf n met lengte L. */
function schaal(n: number, L: number) {
  const c = coords(systeemlijn(n));
  return Math.hypot(c.x2 - c.x1, c.y2 - c.y1) / L;
}
/** Wieltjes op een schermpunt (clientcoördinaten van de svg). */
function zoomOp(px: number, py: number, deltaY: number, n: number) {
  const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!;
  const r = svg.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    flushSync(() => svg.dispatchEvent(new WheelEvent("wheel", {
      deltaY, clientX: r.left + px, clientY: r.top + py, bubbles: true, cancelable: true,
    })));
  }
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common, check, ribbon } }, defaultNS: "common", initImmediate: false,
  });
  const beeld = /beeld=(\w+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld === "donker" ? "openaec" : "light");
    document.body.style.cssText = "margin:0;background:var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    if (beeld === "rapport") {
      document.body.style.background = "#fff";
      mount(
        <div style={{ width: 1000, padding: 20 }}>
          <ReportDataProvider value={{ ...EMPTY_REPORT_DATA, nodes: model.nodes, beams: model.beams, supports: model.supports, aanzichtTonen: true }}>
            <SchemaSection />
          </ReportDataProvider>
        </div>,
      );
      return;
    }
    mount(<Tekenvlak flags={AAN} selection={beeld === "knoop" ? ({ type: "beam", id: 3 } as Selection) : null} />);
    await wacht(150);
    if (beeld === "knoop") {
      // Inzoomen op de knoop linksboven van het portaal (knoop 3).
      const c = coords(systeemlijn(1));
      zoomOp(c.x2, c.y2, -100, 30);
    } else if (beeld === "beton") {
      // Inzoomen op het linkerdeel van de betonbalk: dekking, staven en beugels.
      const c = coords(systeemlijn(6));
      zoomOp(c.x1 + (c.x2 - c.x1) * 0.2, c.y1, -100, 24);
    }
    await wacht(150);
    return;
  }

  await test("laag standaard uit; aan: een aanzicht per staaf, kolommen eerst", async () => {
    gelijk(DEFAULT_DISPLAY_FLAGS.aanzicht, false, "standaardvlag");
    mount(<Tekenvlak flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    ok(!laag(), "de laag staat standaard aan");
    mount(<Tekenvlak flags={AAN} />);
    await wacht();
    ok(laag(), "de laag ontbreekt");
    const volgorde = [...container.querySelectorAll("[data-aanzicht-staaf]")].map((g) => Number(g.getAttribute("data-aanzicht-staaf")));
    gelijk(volgorde, [1, 2, 3, 4, 5, 6], "kolommen 1 en 2 eerst, dan de liggers");
    // De laag ligt ONDER de systeemlijnen.
    const pos = laag()!.compareDocumentPosition(systeemlijn(1));
    ok(pos & Node.DOCUMENT_POSITION_FOLLOWING, "de systeemlijnen komen na de laag");
    ok(systeemlijn(1).classList.contains("systeemlijn"), "de systeemlijn wordt een dunne hartlijn");
  });

  await test("ware hoogte: de contour ligt op ±h/2 van de systeemlijn (IPE 330, GL 400, beton 600)", async () => {
    mount(<Tekenvlak flags={AAN} />);
    await wacht();
    const s = schaal(3, 12000);
    for (const [id, halfMm] of [[3, STEEL_SECTION_DIMS.IPE330.h / 2], [4, 200], [6, 300]] as const) {
      const as = coords(systeemlijn(id)).y1;
      const ys = lijnen(id, "contour").map(coords).filter((c) => Math.abs(c.y1 - c.y2) < 1e-6).map((c) => c.y1).sort((a, b) => a - b);
      gelijk(ys.length, 2, `staaf ${id}: twee langsranden`);
      bijna(as - ys[0], halfMm * s, 0.05, `staaf ${id}: bovenrand`);
      bijna(ys[1] - as, halfMm * s, 0.05, `staaf ${id}: onderrand`);
    }
  });

  await test("inzoomen: het aanzicht groeit mee, de lijndikte niet; flenslijnen en wapening verschijnen", async () => {
    mount(<Tekenvlak flags={AAN} />);
    await wacht();
    const dikte = () => parseFloat(getComputedStyle(lijnen(3, "contour")[0]).strokeWidth);
    const d0 = dikte();
    const s0 = schaal(3, 12000);
    const c = coords(systeemlijn(6));
    zoomOp((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2, -100, 15);
    await wacht();
    const s1 = schaal(3, 12000);
    ok(s1 > s0 * 3, `ingezoomd (${s0} → ${s1})`);
    bijna(dikte(), d0, 1e-6, "contourdikte in px");
    gelijk(lijnen(3, "zichtbaar").length, 2, "flenslijnen van de IPE 330");
    gelijk(lijnen(4, "lamel").length, 9, "lamellen van GL 400 (10 × 40 mm)");
    gelijk(lijnen(6, "wapening").length, 2, "onder- en bovenwapening");
    gelijk(lijnen(6, "beugel").length, 30, "beugels Ø8-200 over 6 m");
    // Onderwapening op 38 mm van de onderrand, bovenwapening op 34 mm van de bovenrand.
    const s6 = schaal(6, 6000);
    const as = coords(systeemlijn(6)).y1;
    const w = lijnen(6, "wapening").map((l) => coords(l).y1).sort((a, b) => a - b);
    bijna(w[0], as - (300 - 34) * s6, 0.05, "bovenwapening");
    bijna(w[1], as + (300 - 38) * s6, 0.05, "onderwapening");
  });

  await test("uitgezoomd: alleen vlak en contour, geen beugels als ze op elkaar vallen", async () => {
    mount(<Tekenvlak flags={AAN} />);
    await wacht();
    const c = coords(systeemlijn(6));
    zoomOp((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2, 100, 10);
    await wacht();
    const s = schaal(6, 6000);
    ok(200 * s < 3 && 600 * s < 6 && 600 * s >= 1.5, `uitgezoomd: ${200 * s} px per beugel, ${600 * s} px hoog`);
    gelijk(lijnen(6, "beugel").length + lijnen(6, "wapening").length, 0, "geen beugels en geen wapening");
    gelijk(lijnen(6, "contour").length, 4, "wel de contour");
    ok(staafGroep(6)!.querySelector(".fem-aanzicht-vlak"), "en het vlak");
  });

  await test("selecteren en dubbelklikken blijven op de systeemlijn werken", async () => {
    let gekozen: Selection | undefined;
    mount(<Tekenvlak flags={AAN} onSelect={(s) => { gekozen = s; }} />);
    await wacht();
    const c = coords(systeemlijn(3));
    const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!.getBoundingClientRect();
    const el = document.elementFromPoint(svg.left + (c.x1 + c.x2) / 2, svg.top + c.y1 + 1)!;
    ok(!el.closest(".fem-aanzicht"), "de laag vangt de muis");
    flushSync(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    gelijk(gekozen, { type: "beam", id: 3 }, "selectie via de systeemlijn");
    mount(<Tekenvlak flags={AAN} selection={{ type: "beam", id: 3 } as Selection} />);
    await wacht();
    ok(staafGroep(3)!.classList.contains("geselecteerd"), "de geselecteerde staaf is gemarkeerd");
  });

  await test("resultaatweergave: geen aanzicht; tab Model en belastinggevallen wel", async () => {
    mount(<Tekenvlak flags={AAN} showLoads resultsMode />);
    await wacht();
    ok(!laag(), "in de tab Resultaten");
    mount(<Tekenvlak flags={AAN} showLoads />);
    await wacht();
    ok(laag(), "bij een belastinggeval (niet gerekend)");
  });

  await test("thema: lijnen in de tekstkleur van het thema, licht en donker verschillend", async () => {
    mount(<Tekenvlak flags={AAN} />);
    await wacht();
    const kleur = () => getComputedStyle(lijnen(3, "contour")[0]).stroke;
    document.documentElement.setAttribute("data-theme", "light");
    const licht = kleur();
    document.documentElement.setAttribute("data-theme", "openaec");
    const donker = kleur();
    document.documentElement.removeAttribute("data-theme");
    ok(licht !== donker, `zelfde kleur in beide thema's: ${licht}`);
  });

  await test("weergavelijst: rij Aanzicht, standaard uit, zet het vinkje", async () => {
    let flags = DEFAULT_DISPLAY_FLAGS;
    const Lijst = () => {
      const [f, setF] = React.useState(DEFAULT_DISPLAY_FLAGS);
      flags = f;
      return (
        <ResultatenTab
          loadCases={[]} combinations={[]} activeLoadCaseId={1} activeCombinationId={null} envelopeView={false}
          hasResults={false} displayFlags={f} setDisplayFlags={setF}
        />
      );
    };
    mount(<Lijst />);
    const knop = [...container.querySelectorAll<HTMLButtonElement>(".fem-results-toggle")].find((b) => b.textContent?.includes("Aanzicht"));
    ok(knop, "de rij Aanzicht ontbreekt");
    ok(!knop!.classList.contains("active"), "de rij staat standaard aan");
    flushSync(() => knop!.click());
    gelijk(flags.aanzicht, true, "aangezet");
  });

  await test("rapport: de constructieschets tekent het aanzicht als de laag aan staat", async () => {
    const Schets = ({ tonen }: { tonen?: boolean }) => (
      <ReportDataProvider value={{ ...EMPTY_REPORT_DATA, nodes: model.nodes, beams: model.beams, supports: model.supports, aanzichtTonen: tonen }}>
        <SchemaSection />
      </ReportDataProvider>
    );
    mount(<Schets tonen />);
    ok(laag(), "geen aanzicht in de schets");
    gelijk(container.querySelectorAll("[data-aanzicht-staaf]").length, 6, "zes staven");
    ok(container.textContent!.includes("in aanzicht op ware grootte"), "de legenda noemt het aanzicht");
    mount(<Schets />);
    ok(!laag(), "zonder veld (ouder hoofdvenster): de standaard, uit");
  });
}

run()
  .then(() => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: null }); })
  .catch((e) => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: String(e?.stack ?? e) }); });
