/**
 * Browserkant van test-peilmaat-ui.mjs (issue #48): het echte tekenvlak met de
 * echte modelstore (useFemStore, startmodel: niveaus ±0,00 en +5,00 m, knopen
 * 3 en 4 op +5,00 m). Klik op de peilmaat → invoer in mm → het niveau en de
 * knopen erop verschuiven → één undo-stap zet alles terug.
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=licht|donker` wordt het tekenvlak opgebouwd met de invoer van
 * +5,00 m open — daarvan maakt de test op verzoek een schermafbeelding.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import "../src/themes.css";
import FemCanvas from "../src/components/fem/FemCanvas";
import { DEFAULT_DISPLAY_FLAGS } from "../src/components/fem/FemResultsOverlay";
import { DEFAULT_GRID } from "../src/components/fem/femTypes";
import { useFemStore } from "../src/hooks/useFemStore";

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

/** Het tekenvlak met de echte store; `store` is na elke render de actuele. */
let store: ReturnType<typeof useFemStore>;
function MetStore() {
  const s = useFemStore();
  store = s;
  return (
    <div className="fem-canvas-wrap" style={{ width: 1180, height: 640, position: "relative" }}>
      <FemCanvas
        tool="select" nodes={s.nodes} beams={s.beams} supports={s.supports} plates={[]} loads={s.loads}
        selection={null} activeLoadCaseId={1} grid={{ ...DEFAULT_GRID, visible: false }}
        setSelection={noop} addNode={() => 0} updateNode={noop} addBeam={() => null}
        addPlate={() => 0} addSupport={noop} addLoad={noop} deleteSelected={noop} splitBeamAt={noop}
        translateSelection={() => false} copySelection={() => false}
        rotateSelection={() => false} mirrorSelection={() => false}
        displayFlags={DEFAULT_DISPLAY_FLAGS} showLoads={false}
        structuralGrid={s.structuralGrid} setStructuralGrid={s.setStructuralGrid}
        verplaatsStramienAs={s.verplaatsStramienAs}
      />
    </div>
  );
}

const peilmaat = (id: string, zijde: "links" | "rechts") =>
  container.querySelector<SVGGElement>(`[data-peilmaat="${id}"][data-zijde="${zijde}"]`);
const invoer = () => document.querySelector<HTMLInputElement>("[data-niveau-invoer] input");
const niveau = (id: string) => store.structuralGrid.zAxes.find((a) => a.id === id)!.position;
const knoopZ = (id: number) => store.nodes.find((n) => n.id === id)!.z;

/** Klik zoals de gebruiker: op het schermpunt midden op de tekst. */
function klikOpTekst(g: SVGGElement) {
  const r = g.querySelector("text")!.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  ok(el && el.closest(".fem-peilmaat") === g, `het klikvlak vangt de klik niet (${el?.tagName}.${el?.getAttribute("class")})`);
  flushSync(() => el!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
  flushSync(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })));
}
/** Typ een waarde in het (gecontroleerde) invoerveld. */
function typ(el: HTMLInputElement, waarde: string) {
  const zet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  flushSync(() => { zet.call(el, waarde); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
function toets(el: HTMLElement, key: string) {
  flushSync(() => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common, check } }, defaultNS: "common", initImmediate: false,
  });
  const beeld = /beeld=(\w+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld === "donker" ? "openaec" : "light");
    document.body.style.cssText = "margin:0;background:var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    mount(<MetStore />);
    await wacht(150);
    klikOpTekst(peilmaat("2", "links")!);
    await wacht(150);
    return;
  }

  await test("peilmaat groter: 12,5 px tekst, driehoekje 12 px breed, klikvlak 24 px hoog", async () => {
    mount(<MetStore />);
    await wacht();
    const g = peilmaat("2", "links");
    ok(g, "peilmaat van +5,00 m ontbreekt");
    gelijk(g!.querySelector("text")!.textContent, "+5,00 m", "tekst");
    gelijk(getComputedStyle(g!.querySelector("text")!).fontSize, "12.5px", "lettergrootte");
    const d = g!.querySelector("polygon")!.getBBox();
    gelijk([d.width, d.height], [12, 8], "driehoekje");
    const vlak = g!.querySelector("rect")!.getBBox();
    ok(vlak.height >= 24, `klikvlak ${vlak.height} px hoog`);
    ok(vlak.width > g!.querySelector("text")!.getBBox().width, "klikvlak smaller dan de tekst");
    ok(peilmaat("2", "rechts"), "rechter peilmaat ontbreekt");
  });

  await test("hover: handcursor en accentrand", async () => {
    mount(<MetStore />);
    await wacht();
    const g = peilmaat("2", "links")!;
    gelijk(getComputedStyle(g).cursor, "pointer", "cursor");
    ok(g.classList.contains("bewerkbaar"), "niet als bewerkbaar gemarkeerd");
  });

  await test("klik op +5,00 m → invoer met 5000; 5500 + Enter verplaatst niveau en knopen; één undo zet alles terug", async () => {
    mount(<MetStore />);
    await wacht();
    gelijk([niveau("2"), knoopZ(3), knoopZ(4)], [5000, 5000, 5000], "begintoestand");
    const kanTerugVoor = store.canUndo;
    klikOpTekst(peilmaat("2", "links")!);
    await wacht();
    const el = invoer();
    ok(el, "geen invoerveld na de klik");
    gelijk(el!.value, "5000", "voorgevuld met het huidige niveau in mm");
    ok(document.activeElement === el, "de invoer heeft de focus");
    ok(document.querySelector("[data-niveau-invoer]")!.textContent!.includes("2 knopen op dit niveau schuiven mee"), "hint knopen");
    ok(peilmaat("2", "links")!.classList.contains("actief"), "peilmaat niet gemarkeerd terwijl de invoer open is");
    typ(el!, "5500");
    toets(el!, "Enter");
    await wacht();
    ok(!invoer(), "de invoer is na Enter niet dicht");
    gelijk([niveau("2"), knoopZ(3), knoopZ(4)], [5500, 5500, 5500], "niveau en knopen op 5500");
    gelijk([knoopZ(1), knoopZ(2), niveau("1")], [0, 0, 0], "de rest blijft staan");
    gelijk(peilmaat("2", "links")!.querySelector("text")!.textContent, "+5,50 m", "peilmaat volgt");
    ok(store.canUndo, "geen undo-stap");
    flushSync(() => store.undo());
    await wacht();
    gelijk([niveau("2"), knoopZ(3), knoopZ(4)], [5000, 5000, 5000], "na één undo alles terug");
    gelijk(store.canUndo, kanTerugVoor, "precies één stap: de historie staat weer waar hij stond");
  });

  await test("Esc annuleert: niets verandert, invoer dicht", async () => {
    mount(<MetStore />);
    await wacht();
    klikOpTekst(peilmaat("2", "rechts")!);
    await wacht();
    const el = invoer()!;
    typ(el, "6000");
    toets(el, "Escape");
    await wacht();
    ok(!invoer(), "de invoer is na Esc niet dicht");
    gelijk([niveau("2"), knoopZ(3)], [5000, 5000], "ongewijzigd");
    gelijk(store.canUndo, false, "geen undo-stap");
  });

  await test("hoogte van een ander niveau en onzin worden geweigerd met een melding", async () => {
    mount(<MetStore />);
    await wacht();
    klikOpTekst(peilmaat("2", "links")!);
    await wacht();
    const el = invoer()!;
    typ(el, "0");
    toets(el, "Enter");
    await wacht();
    ok(invoer(), "de invoer sloot bij een bezet niveau");
    ok(document.querySelector("[role=alert]")?.textContent?.includes("±0,00 m"), "melding bezet niveau");
    typ(el, "vijf");
    toets(el, "Enter");
    await wacht();
    ok(document.querySelector("[role=alert]")?.textContent?.includes("in mm"), "melding ongeldig");
    gelijk([niveau("2"), knoopZ(3)], [5000, 5000], "ongewijzigd");
  });

  await test("de verticale maatlijn loopt nooit door de rechter peilmaat, ook niet uitgezoomd", async () => {
    mount(<MetStore />);
    await wacht();
    const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!;
    for (const stap of [0, 6]) {
      const r = svg.getBoundingClientRect();
      for (let i = 0; i < stap; i++) {
        flushSync(() => svg.dispatchEvent(new WheelEvent("wheel", {
          deltaY: 100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
        })));
      }
      await wacht();
      const verticaal = [...container.querySelectorAll<SVGLineElement>("line.fem-dim-line")]
        .filter((l) => Math.abs(l.x1.baseVal.value - l.x2.baseVal.value) < 1e-6);
      ok(verticaal.length > 0, "geen verticale maatlijn");
      const lijnX = verticaal[0].getBoundingClientRect().left;
      const peil = peilmaat("2", "rechts")!.getBoundingClientRect();
      const min = peilmaat("2", "rechts")!.parentElement!.querySelector(".fem-stramien-minus")!.getBoundingClientRect();
      ok(lijnX > peil.right && lijnX > min.right, `stap ${stap}: maatlijn op ${lijnX}, peilmaat tot ${peil.right}, −-knop tot ${min.right}`);
    }
  });

  await test("het nulniveau: invoer 0, naar −500 → onder peil", async () => {
    mount(<MetStore />);
    await wacht();
    klikOpTekst(peilmaat("1", "links")!);
    await wacht();
    const el = invoer()!;
    gelijk(el.value, "0", "voorgevuld");
    typ(el, "-500");
    toets(el, "Enter");
    await wacht();
    gelijk([niveau("1"), knoopZ(1), knoopZ(2)], [-500, -500, -500], "nulniveau en voetknopen");
    gelijk(peilmaat("1", "links")!.querySelector("text")!.textContent, "−0,50 m", "peilmaat");
  });
}

run()
  .then(() => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: null }); })
  .catch((e) => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: String(e?.stack ?? e) }); });
