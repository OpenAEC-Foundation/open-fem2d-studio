/**
 * Browserkant van test-kipsteunen-ui.mjs (issue #40): het echte tekenvlak, de
 * echte weergavelijst en de echte constructieschets van het rapport, met een
 * model waarin elke soort kipsteun voorkomt.
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=licht`, `#beeld=donker` of `#beeld=rapport` wordt alleen het beeld
 * opgebouwd — daarvan maakt de test op verzoek een schermafbeelding.
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
import { DEFAULT_GRID, type Beam, type Node, type Support, type Selection } from "../src/components/fem/femTypes";
import SchemaSection from "../src/components/report/sections/SchemaSection";
import { EMPTY_REPORT_DATA, ReportDataProvider } from "../src/components/report/ReportDataContext";
import { kipsteunBeelden } from "../src/lib/kipsteunBeeld";

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
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); tests.push({ name }); }
  catch (e) { tests.push({ name, error: e instanceof Error ? e.message : String(e) }); }
}

// ── Het model ──────────────────────────────────────────────────────────────
// 1: stalen ligger 6 m, bovenflens op ¼ ½ ¾, onderflens op ½ (dus ½ = beide).
// 2: houten ligger 6 m met kipsteunafstand 1,2 m.
// 3: stalen kolom 4 m, van kop naar voet getekend, steun "boven" (= links) op
//    1 m onder de kop.
// 4: schuine stalen ligger 3-4-5 (4000 × 3000), van rechts naar links getekend,
//    onderflens op 0,2 vanaf de beginknoop.
// 5: stalen uitkraging 2 m: het vrije eind is geen gaffel.
const nodes: Node[] = [
  { id: 1, x: 0, z: 3000 }, { id: 2, x: 6000, z: 3000 },
  { id: 3, x: 0, z: 0 }, { id: 4, x: 6000, z: 0 },
  { id: 5, x: 8000, z: 4000 }, { id: 6, x: 8000, z: 0 },
  { id: 7, x: 14000, z: 3000 }, { id: 8, x: 10000, z: 0 },
  { id: 9, x: 10000, z: 4500 }, { id: 10, x: 12000, z: 4500 },
];
const beams: Beam[] = [
  { id: 1, from: 1, to: 2, material: "S235", profile: "IPE 300",
    checkConfig: { lateralRestraints: [0.25, 0.5, 0.75], lateralRestraintsBottom: [0.5] } },
  { id: 2, from: 3, to: 4, material: "GL24h", profile: "100x400", checkConfig: { ltbSupportSpacing_m: 1.2 } },
  { id: 3, from: 5, to: 6, material: "S235", profile: "HEA 200", checkConfig: { lateralRestraints: [0.25] } },
  { id: 4, from: 7, to: 8, material: "S355", profile: "IPE 240", checkConfig: { lateralRestraintsBottom: [0.2] } },
  { id: 5, from: 9, to: 10, material: "S235", profile: "IPE 200", checkConfig: { lateralRestraints: [0.5] } },
];
const supports: Support[] = [
  { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
  { nodeId: 3, type: "pinned" }, { nodeId: 4, type: "zRoller" },
  { nodeId: 6, type: "fixed" }, { nodeId: 5, type: "xRoller" },
  { nodeId: 8, type: "pinned" }, { nodeId: 7, type: "zRoller" },
  { nodeId: 9, type: "fixed" },
] as Support[];

function Tekenvlak({ selection, flags, onSelect }: {
  selection: Selection; flags: DisplayFlags; onSelect?: (s: Selection) => void;
}) {
  return (
    <div className="fem-canvas-wrap" style={{ width: 1180, height: 640, position: "relative" }}>
      <FemCanvas
        tool="select" nodes={nodes} beams={beams} supports={supports} plates={[]} loads={[]}
        selection={selection} activeLoadCaseId={1} grid={{ ...DEFAULT_GRID, visible: false }}
        setSelection={onSelect ?? noop} addNode={() => 0} updateNode={noop} addBeam={() => null}
        addPlate={() => 0} addSupport={noop} addLoad={noop} deleteSelected={noop} splitBeamAt={noop}
        translateSelection={() => false} copySelection={() => false}
        rotateSelection={() => false} mirrorSelection={() => false}
        displayFlags={flags}
      />
    </div>
  );
}
/** De brede, onzichtbare raaklijn van de n-de staaf (in modelvolgorde): daar hangt de hover aan. */
const raaklijn = (n: number): Element =>
  [...container.querySelectorAll<SVGLineElement>("line.fem-member")][n - 1].nextElementSibling!;
const laag = () => container.querySelector(".fem-kipsteunen");
const groep = (staaf: number) => container.querySelector(`[data-kipsteun-staaf="${staaf}"]`);
const tel = (staaf: number, soort: string) => groep(staaf)?.querySelectorAll(`[data-kipsteun="${soort}"]`).length ?? 0;
const veldLabels = (staaf: number, zijde: string) =>
  [...(groep(staaf)?.querySelectorAll(`[data-kipveld-ketting="${zijde}"] [data-kipveld]`) ?? [])].map((e) => e.textContent);
/** Zwaartepunt van een symbool ten opzichte van de staaflijn: boven (< 0) of onder (> 0) op het scherm. */
function zijdeOpScherm(el: Element): { dx: number; dy: number } {
  const b = (el as SVGGraphicsElement).getBBox();
  return { dx: b.x + b.width / 2, dy: b.y + b.height / 2 };
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
          <ReportDataProvider value={{ ...EMPTY_REPORT_DATA, nodes, beams, supports, kipsteunenTonen: true }}>
            <SchemaSection />
          </ReportDataProvider>
        </div>,
      );
    } else {
      mount(<Tekenvlak selection={{ type: "beam", id: beeld === "donker" ? 4 : 1 } as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
      await wacht(150);
      // Hover op de houten ligger, zodat ook zijn ketting in beeld staat.
      raaklijn(2).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await wacht();
    }
    return;
  }

  await test("laag standaard aan: symbolen per staaf en per flens", async () => {
    gelijk(DEFAULT_DISPLAY_FLAGS.kipsteunen, true, "standaardvlag");
    mount(<Tekenvlak selection={null as unknown as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    ok(laag(), "de laag ontbreekt");
    gelijk([tel(1, "boven"), tel(1, "beide"), tel(1, "onder"), tel(1, "gaffel")], [2, 1, 0, 2], "staaf 1: ¼ en ¾ boven, ½ beide, twee gaffels");
    gelijk([tel(2, "gedrukt"), tel(2, "gaffel")], [4, 2], "staaf 2 (hout): vier steunen uit ℓ = 1200");
    gelijk([tel(3, "boven"), tel(3, "gaffel")], [1, 2], "staaf 3 (kolom)");
    gelijk([tel(4, "onder"), tel(4, "gaffel")], [1, 2], "staaf 4 (schuin)");
    gelijk([tel(5, "boven"), tel(5, "gaffel")], [1, 1], "staaf 5 (uitkraging): alleen de inklemming is een gaffel");
    gelijk(container.querySelectorAll(".fem-kipveld-ketting").length, 0, "zonder selectie of hover geen maatketting");
  });

  await test("de symbolen staan aan de goede zijde en op de goede plaats", async () => {
    mount(<Tekenvlak selection={null as unknown as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    const lijnen = [...container.querySelectorAll<SVGLineElement>("line.fem-member")];
    const as = (i: number) => {
      const l = lijnen[i];
      return { x1: l.x1.baseVal.value, y1: l.y1.baseVal.value, x2: l.x2.baseVal.value, y2: l.y2.baseVal.value };
    };
    // Staaf 1: ligger; "boven" is omhoog op het scherm (kleinere y).
    const a1 = as(0);
    const boven1 = [...groep(1)!.querySelectorAll('[data-kipsteun="boven"] polygon')].map(zijdeOpScherm);
    ok(boven1.every((p) => p.dy < a1.y1), "bovenflenssymbolen liggen boven de ligger");
    const xs = boven1.map((p) => (p.dx - a1.x1) / (a1.x2 - a1.x1)).sort();
    ok(Math.abs(xs[0] - 0.25) < 0.005 && Math.abs(xs[1] - 0.75) < 0.005, `¼ en ¾ van de staaf: ${xs}`);
    const beide = [...groep(1)!.querySelectorAll('[data-kipsteun="beide"] polygon')].map(zijdeOpScherm);
    ok(beide.length === 2 && beide.some((p) => p.dy < a1.y1) && beide.some((p) => p.dy > a1.y1), "½: een symbool boven én onder");
    // Staaf 3: kolom, van kop naar voet getekend. "Boven" = links; de steun
    // staat op 0,25 vanaf de BEGINknoop (de kop): 1 m onder de kop.
    const a3 = as(2);
    const [k] = [...groep(3)!.querySelectorAll('[data-kipsteun="boven"] polygon')].map(zijdeOpScherm);
    ok(k.dx < a3.x1, "kolom: het symbool staat links van de kolom");
    const fy = (k.dy - a3.y1) / (a3.y2 - a3.y1);
    ok(Math.abs(fy - 0.25) < 0.01, `kolom: op een kwart vanaf de kop (${fy})`);
    // Staaf 4: schuin, van rechts naar links getekend; onderflens op 0,2 vanaf
    // de beginknoop (rechtsboven). Onder = onder de staaflijn ter plaatse.
    const a4 = as(3);
    const [s] = [...groep(4)!.querySelectorAll('[data-kipsteun="onder"] polygon')].map(zijdeOpScherm);
    const f4 = (s.dx - a4.x1) / (a4.x2 - a4.x1);
    const yOpLijn = a4.y1 + (a4.y2 - a4.y1) * f4;
    ok(s.dy > yOpLijn, "schuin: het onderflenssymbool ligt onder de staaflijn");
    ok(Math.abs(f4 - 0.2) < 0.03, `schuin: op 0,2 vanaf de beginknoop (${f4})`);
  });

  await test("selectie toont de kipveldlengtes in mm, per flens", async () => {
    mount(<Tekenvlak selection={{ type: "beam", id: 1 } as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    gelijk(veldLabels(1, "boven"), ["1500", "1500", "1500", "1500"], "ketting bovenflens");
    gelijk(veldLabels(1, "onder"), ["3000", "3000"], "ketting onderflens");
    ok(groep(1)!.textContent!.includes("bovenflens gedrukt") && groep(1)!.textContent!.includes("(mm)"), "bijschrift met eenheid");
    gelijk(groep(2)!.querySelectorAll(".fem-kipveld-ketting").length, 0, "een niet-geselecteerde staaf heeft geen ketting");
    // De getallen zijn die van de gedeelde afleiding.
    const b = kipsteunBeelden({ nodes, beams, supports }).find((x) => x.toetsId === 1)!;
    gelijk(veldLabels(1, "boven"), b.kettingen.find((k) => k.zijde === "boven")!.lengtesMm.map((l) => String(Math.round(l))), "tekening = afleiding");
  });

  await test("hover toont de ketting van hout met de ℓ van de toets, en verdwijnt weer", async () => {
    mount(<Tekenvlak selection={null as unknown as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    const hit = raaklijn(2);
    // Een hover is voor React een doorlopende gebeurtenis: de update komt een
    // tel later, niet binnen flushSync.
    hit.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await wacht();
    gelijk(veldLabels(2, "kip"), ["1200", "1200", "1200", "1200", "1200"], "vijf velden van 1200");
    ok(groep(2)!.textContent!.includes("ℓ = 1200 mm"), "het bijschrift noemt de ℓ van de toets");
    hit.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await wacht();
    gelijk(container.querySelectorAll(".fem-kipveld-ketting").length, 0, "na de hover weg");
  });

  await test("klik op een symbool selecteert de staaf; de tooltip noemt flens en plaats", async () => {
    let gekozen: Selection | undefined;
    mount(<Tekenvlak selection={null as unknown as Selection} flags={DEFAULT_DISPLAY_FLAGS} onSelect={(s) => { gekozen = s; }} />);
    await wacht();
    const symbool = groep(3)!.querySelector('[data-kipsteun="boven"]')!;
    flushSync(() => symbool.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    gelijk(gekozen, { type: "beam", id: 3 }, "selectie");
    const titel = symbool.querySelector("title")!.textContent!;
    ok(titel.includes("linkerflens") && titel.includes("3000 mm vanaf de voet") && titel.includes("staaf 3"), `tooltip: ${titel}`);
    const hout = groep(2)!.querySelector('[data-kipsteun="gedrukt"] title')!.textContent!;
    ok(hout.includes("kipsteunafstand") && hout.includes("gedrukte rand") && hout.includes("1200 mm vanaf links"), `tooltip hout: ${hout}`);
  });

  await test("laag uit: niets getekend; de schakelaar staat in de weergavelijst", async () => {
    mount(<Tekenvlak selection={{ type: "beam", id: 1 } as Selection} flags={{ ...DEFAULT_DISPLAY_FLAGS, kipsteunen: false }} />);
    await wacht();
    ok(!laag(), "de laag staat uit maar is er nog");
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
    const knop = [...container.querySelectorAll<HTMLButtonElement>(".fem-results-toggle")].find((b) => b.textContent?.includes("Kipsteunen"));
    ok(knop, "de rij Kipsteunen ontbreekt");
    ok(knop!.classList.contains("active"), "de rij staat standaard aan");
    flushSync(() => knop!.click());
    gelijk(flags.kipsteunen, false, "uitgezet");
  });

  await test("zoom: de symbolen schalen mee, binnen leesbare grenzen", async () => {
    const hoogte = () => {
      const p = groep(1)!.querySelector('[data-kipsteun="boven"] polygon') as SVGGraphicsElement;
      const b = p.getBBox();
      return b.height;
    };
    mount(<Tekenvlak selection={null as unknown as Selection} flags={DEFAULT_DISPLAY_FLAGS} />);
    await wacht();
    const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!;
    const r = svg.getBoundingClientRect();
    const h0 = hoogte();
    const wiel = (deltaY: number, n: number) => {
      for (let i = 0; i < n; i++) {
        flushSync(() => svg.dispatchEvent(new WheelEvent("wheel", {
          deltaY, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
        })));
      }
    };
    wiel(-100, 12);
    await wacht();
    const hIn = hoogte();
    wiel(100, 30);
    await wacht();
    const uit = groep(1)?.querySelector('[data-kipsteun="boven"] polygon') ? hoogte() : null;
    ok(hIn >= h0 && hIn <= 10.01, `ingezoomd groter, maar hoogstens 10 px (${h0} → ${hIn})`);
    ok(uit === null || (uit >= 5.99 && uit <= h0), `uitgezoomd kleiner, maar minstens 6 px — of weg op een te korte staaf (${uit})`);
  });

  await test("rapport: de constructieschets tekent dezelfde kipsteunen, en volgt de laag", async () => {
    const Schets = ({ tonen }: { tonen?: boolean }) => (
      <ReportDataProvider value={{ ...EMPTY_REPORT_DATA, nodes, beams, supports, kipsteunenTonen: tonen }}>
        <SchemaSection />
      </ReportDataProvider>
    );
    mount(<Schets tonen />);
    gelijk([tel(1, "boven"), tel(1, "beide"), tel(2, "gedrukt"), tel(3, "boven"), tel(4, "onder")], [2, 1, 4, 1, 1], "symbolen in de schets");
    ok(container.textContent!.includes("Kipsteunen zoals de toetsing ze aanhoudt"), "de legenda noemt de kipsteunen");
    mount(<Schets />);
    ok(laag(), "zonder veld (ouder hoofdvenster): de standaard, aan");
    mount(<Schets tonen={false} />);
    ok(!laag() && !container.textContent!.includes("Kipsteunen zoals"), "laag uit: niet in de schets, niet in de legenda");
  });
}

run()
  .then(() => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: null }); })
  .catch((e) => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: String(e?.stack ?? e) }); });
