/**
 * Browserkant van test-zichtbaarheid-ui.mjs (issue #47): het echte venster
 * Zichtbaarheid, de echte weergavelijst van de verkenner en het echte
 * tekenvlak, alle drie op DEZELFDE `displayFlags` (zoals App.tsx ze
 * doorgeeft), met het startmodel van de app.
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=venster-licht|venster-donker|nummers|breedte` wordt alleen het beeld
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
import "../src/App.css";
import FemCanvas from "../src/components/fem/FemCanvas";
import { ResultatenTab } from "../src/components/fem/FemProjectTree";
import ZichtbaarheidVenster from "../src/components/fem/ZichtbaarheidVenster";
import InsightsTab from "../src/components/ribbon/InsightsTab";
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "../src/components/fem/FemResultsOverlay";
import { DEFAULT_GRID, DEFAULT_STRUCTURAL_GRID, type Beam } from "../src/components/fem/femTypes";
import { makeInitialSnapshot } from "../src/hooks/useFemStore";
import { ZICHTBAARHEID, WEERGAVE_VOORKEUREN, type AanUitVlag } from "../src/lib/zichtbaarheid";

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

// ── Het model: het startmodel, met een scharnier op staaf 3 ──────────────
const model = makeInitialSnapshot();
const beams: Beam[] = model.beams.map((b) => (b.id === 3 ? { ...b, releases: { startRy: true } } : b));

/** Actuele toestand van de proefopstelling, na elke render. */
let flags: DisplayFlags = DEFAULT_DISPLAY_FLAGS;
let stramien = true;
let geopend = 0;

function Proef({ begin = DEFAULT_DISPLAY_FLAGS, venster = true, lijst = true, tekenvlak = true, breedte = 1180, hoogte = 600 }: {
  begin?: DisplayFlags; venster?: boolean; lijst?: boolean; tekenvlak?: boolean; breedte?: number; hoogte?: number;
}) {
  const [f, setF] = React.useState<DisplayFlags>(begin);
  const [grid, setGrid] = React.useState(DEFAULT_STRUCTURAL_GRID);
  flags = f;
  stramien = grid.enabled;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {lijst && (
        <aside className="fem-verkenner-proef" style={{ width: 240 }}>
          <ResultatenTab
            loadCases={[]} combinations={[]} activeLoadCaseId={1} activeCombinationId={null} envelopeView={false}
            hasResults={false} displayFlags={f} setDisplayFlags={setF}
            onOpenZichtbaarheid={() => { geopend++; }}
          />
        </aside>
      )}
      {tekenvlak && (
        <div className="fem-canvas-wrap" style={{ width: breedte, height: hoogte, position: "relative" }}>
          <FemCanvas
            tool="select" nodes={model.nodes} beams={beams} supports={model.supports} plates={[]} loads={model.loads}
            selection={null} activeLoadCaseId={1} grid={{ ...DEFAULT_GRID, visible: false }}
            setSelection={noop} addNode={() => 0} updateNode={noop} addBeam={() => null}
            addPlate={() => 0} addSupport={noop} addLoad={noop} deleteSelected={noop} splitBeamAt={noop}
            translateSelection={() => false} copySelection={() => false}
            rotateSelection={() => false} mirrorSelection={() => false}
            displayFlags={f} showLoads
            structuralGrid={grid} setStructuralGrid={setGrid}
          />
        </div>
      )}
      <ZichtbaarheidVenster
        open={venster} onClose={noop} displayFlags={f} setDisplayFlags={setF}
        stramienAan={grid.enabled} setStramienAan={(aan) => setGrid((g) => ({ ...g, enabled: aan }))}
      />
    </div>
  );
}

const vensterKnop = (k: string) => document.querySelector<HTMLButtonElement>(`.zichtbaarheid-venster [data-vlag="${k}"]`);
/** De schakelaar in de verkenner met dit label (de verkenner kent geen data-vlag). */
function verkennerKnop(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>(".fem-verkenner-proef .fem-results-toggle")]
    .find((b) => b.querySelector(".fem-results-toggle-label")?.textContent === label) ?? null;
}
const klik = (el: Element) => flushSync(() => (el as HTMLElement).click());
const aantal = (sel: string) => container.querySelectorAll(sel).length;
const zichtbaar = (sel: string) =>
  [...container.querySelectorAll<SVGElement>(sel)].filter((e) => getComputedStyle(e).display !== "none").length;
const overlapt = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common, check, ribbon } }, defaultNS: "common", initImmediate: false,
  });
  const t = (k: string) => i18next.t(k);
  const beeld = /beeld=([\w-]+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld.endsWith("donker") ? "openaec" : "light");
    document.body.style.cssText = "margin:0;background:var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    if (beeld.startsWith("venster")) {
      mount(<Proef begin={{ ...DEFAULT_DISPLAY_FLAGS, staafnummers: true, aanzicht: true }} lijst={false} />);
    } else if (beeld === "nummers") {
      mount(<Proef begin={{ ...DEFAULT_DISPLAY_FLAGS, staafnummers: true, knoopnummers: false }} venster={false} lijst={false} />);
    } else {
      mount(<Proef begin={{ ...DEFAULT_DISPLAY_FLAGS, aanzicht: true, aanzichtBreedte: true, staafnummers: true }}
        venster={false} lijst={false} />);
      await wacht(150);
      // Inzoomen op het portaal, zodat de aanzichten een paar px hoog zijn.
      const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!;
      const r = svg.getBoundingClientRect();
      const regel = container.querySelector<SVGTextElement>('[data-staafprofiel="3"]')!.getBoundingClientRect();
      for (let i = 0; i < 6; i++) {
        flushSync(() => svg.dispatchEvent(new WheelEvent("wheel", {
          deltaY: -100, clientX: regel.left + regel.width / 2, clientY: regel.top + 40, bubbles: true, cancelable: true,
        })));
      }
      void r;
    }
    await wacht(150);
    return;
  }

  await test("venster: drie groepen met de rijen uit lib/zichtbaarheid", async () => {
    mount(<Proef />);
    await wacht();
    const groepen = [...document.querySelectorAll(".zichtbaarheid-venster [data-groep]")].map((g) => g.getAttribute("data-groep"));
    gelijk(groepen, ["labels", "geometrie", "resultaten"], "groepen");
    gelijk(document.querySelector(".zichtbaarheid-venster h2")?.textContent, "Zichtbaarheid", "titel");
    for (const g of ["labels", "geometrie"] as const) {
      const knoppen = [...document.querySelectorAll(`.zichtbaarheid-venster [data-groep="${g}"] [data-vlag]`)].map((b) => b.getAttribute("data-vlag"));
      gelijk(knoppen, ZICHTBAARHEID[g].map((r) => r.sleutel), g);
    }
    // Zonder platen geen plaatcontour.
    ok(!vensterKnop("plaatContour"), "plaatcontour zonder platen");
    for (const k of ["knoopnummers", "staafnummers"]) {
      ok(vensterKnop(k)!.getAttribute("aria-checked") === String(DEFAULT_DISPLAY_FLAGS[k as AanUitVlag]), `${k}: standaardstand`);
    }
  });

  await test("elke schakelaar van het venster zet dezelfde vlag als de verkenner, en omgekeerd", async () => {
    mount(<Proef />);
    await wacht();
    // Rijen die in beide staan: dezelfde tekst, dezelfde vlag.
    const gedeeld = [...ZICHTBAARHEID.labels, ...ZICHTBAARHEID.geometrie, ...ZICHTBAARHEID.resultaten]
      .filter((r) => r.sleutel !== "stramien" && r.sleutel !== "EI" && !r.alleenMetPlaten);
    let vergeleken = 0;
    for (const r of gedeeld) {
      const k = r.sleutel as AanUitVlag;
      const label = r.letterlijk ?? t(r.label);
      const vk = vensterKnop(k)!;
      ok(vk, `venster mist ${k}`);
      const voor = flags[k];
      klik(vk);
      ok(flags[k] !== voor, `venster zet ${k} niet`);
      gelijk(vensterKnop(k)!.getAttribute("aria-checked"), String(flags[k] === true || (DEFAULT_DISPLAY_FLAGS[k] && flags[k] !== false)), `${k}: venster toont de vlag`);
      const lk = verkennerKnop(label);
      if (lk) {
        vergeleken++;
        const aanInVenster = vensterKnop(k)!.getAttribute("aria-checked") === "true";
        gelijk(lk.classList.contains("active"), aanInVenster, `${k}: verkenner toont hetzelfde`);
        klik(lk);
        gelijk(flags[k], voor, `${k}: de verkenner zet dezelfde vlag terug`);
        gelijk(vensterKnop(k)!.getAttribute("aria-checked") === "true", lk.classList.contains("active"), `${k}: venster volgt de verkenner`);
      } else {
        klik(vk);
        gelijk(flags[k], voor, `${k}: terug`);
      }
    }
    ok(vergeleken >= 12, `maar ${vergeleken} rijen in beide gevonden`);
    // Het subvinkje Profielbreedte in de verkenner (onder Aanzicht).
    klik(vensterKnop("aanzicht")!);
    const sub = [...container.querySelectorAll<HTMLInputElement>(".fem-verkenner-proef .fem-results-subcheck input")]
      .find((i) => i.parentElement?.textContent?.includes("Profielbreedte"));
    ok(sub, "subvinkje Profielbreedte ontbreekt");
    klik(sub!);
    gelijk(flags.aanzichtBreedte, true, "verkenner zet aanzichtBreedte");
    gelijk(vensterKnop("aanzichtBreedte")!.getAttribute("aria-checked"), "true", "venster volgt");
  });

  await test("knoopnummers uit/aan: de nummers verdwijnen en verschijnen op het tekenvlak", async () => {
    mount(<Proef />);
    await wacht();
    gelijk(aantal(".fem-node-label"), model.nodes.length, "standaard aan");
    klik(vensterKnop("knoopnummers")!);
    await wacht();
    gelijk(aantal(".fem-node-label"), 0, "uit");
    klik(vensterKnop("knoopnummers")!);
    await wacht();
    gelijk(aantal(".fem-node-label"), model.nodes.length, "weer aan");
  });

  await test("staafnummers aan: (1)…(6) op het staafmidden, zonder overlap met de profielnaam", async () => {
    mount(<Proef />);
    await wacht();
    gelijk(aantal("[data-staafnummer]"), 0, "standaard uit");
    klik(vensterKnop("staafnummers")!);
    await wacht();
    const nummers = [...container.querySelectorAll<SVGTextElement>("[data-staafnummer]")];
    gelijk(nummers.map((n) => n.textContent), beams.map((b) => `(${b.id})`), "nummers");
    for (const n of nummers) {
      const id = n.getAttribute("data-staafnummer");
      const profiel = container.querySelector<SVGTextElement>(`[data-staafprofiel="${id}"]`);
      ok(profiel, `profielnaam van staaf ${id}`);
      ok(!overlapt(n.getBoundingClientRect(), profiel!.getBoundingClientRect()), `staaf ${id}: nummer overlapt de profielnaam`);
    }
    // Ook zonder profielnaam staan ze er.
    klik(vensterKnop("profielLabels")!);
    await wacht();
    gelijk(aantal("[data-staafprofiel]"), 0, "profielnaam uit");
    gelijk(aantal("[data-staafnummer]"), beams.length, "nummers blijven");
  });

  await test("overige lagen volgen hun schakelaar: waarden, peilmaten, maatlijnen, opleggingen, scharnieren, stramien", async () => {
    mount(<Proef />);
    await wacht();
    const lagen: [string, string, (n: number) => boolean][] = [
      ["lastWaarden", ".fem-load-text", (n) => n > 0],
      ["peilmaten", "[data-peilmaat]", (n) => n === 4],
      ["maatlijnen", ".fem-dim-line", (n) => n === 2],
      // Een oplegging tekent meerdere vormen; het gaat om aan en uit.
      ["opleggingen", ".fem-support", (n) => n >= model.supports.length],
      ["scharnieren", ".fem-scharnier", (n) => n === 1],
      ["stramien", ".fem-stramien-layer", (n) => n === 1],
    ];
    for (const [k, sel, aan] of lagen) {
      ok(aan(zichtbaar(sel)), `${k}: aan, ${zichtbaar(sel)} × ${sel}`);
      klik(vensterKnop(k)!);
      await wacht();
      gelijk(zichtbaar(sel), 0, `${k}: uit`);
      klik(vensterKnop(k)!);
      await wacht();
      ok(aan(zichtbaar(sel)), `${k}: weer aan`);
    }
    // De lastpijlen blijven staan zonder waarden.
    klik(vensterKnop("lastWaarden")!);
    await wacht();
    ok(aantal(".fem-loads-layer line, .fem-loads-layer path, .fem-loads-layer polygon") > 0, "pijlen weg");
    klik(vensterKnop("stramien")!);
    gelijk(stramien, false, "stramien is de projectinstelling");
  });

  await test("profielbreedte: alleen met het aanzicht, als b = … mm per staaf", async () => {
    mount(<Proef begin={{ ...DEFAULT_DISPLAY_FLAGS, aanzichtBreedte: true }} />);
    await wacht();
    gelijk(aantal("[data-staafbreedte]"), 0, "zonder aanzicht geen breedte");
    ok(document.querySelector(".zichtbaarheid-venster .zichtbaarheid-sub")?.textContent?.includes("Zichtbaar zodra het aanzicht aan staat"), "uitleg bij de subinstelling");
    klik(vensterKnop("aanzicht")!);
    await wacht();
    const bij = (id: number) => container.querySelector(`[data-staafbreedte="${id}"]`)?.textContent;
    gelijk([bij(1), bij(3), bij(4), bij(6)], ["b = 135 mm", "b = 160 mm", "b = 160 mm", "b = 300 mm"], "breedtes");
    // Aan de andere kant dan de profielnaam: het aanzicht ligt ertussen.
    const as = container.querySelectorAll<SVGLineElement>("line.fem-member")[2].getBoundingClientRect();
    const b3 = container.querySelector(`[data-staafbreedte="3"]`)!.getBoundingClientRect();
    const p3 = container.querySelector(`[data-staafprofiel="3"]`)!.getBoundingClientRect();
    ok(p3.bottom <= as.top && b3.top >= as.bottom, `regel: naam boven (${p3.bottom} ≤ ${as.top}), breedte onder (${b3.top} ≥ ${as.bottom})`);
    klik(vensterKnop("aanzichtBreedte")!);
    await wacht();
    gelijk(aantal("[data-staafbreedte]"), 0, "uit");
  });

  await test("Standaard zet Labels en Geometrie terug, resultaten blijven", async () => {
    mount(<Proef begin={{ ...DEFAULT_DISPLAY_FLAGS, knoopnummers: false, staafnummers: true, aanzicht: true, M: false }} />);
    await wacht();
    klik(document.querySelector('.zichtbaarheid-venster [data-actie="standaard"]')!);
    for (const k of WEERGAVE_VOORKEUREN) gelijk(flags[k], DEFAULT_DISPLAY_FLAGS[k], k);
    gelijk(flags.M, false, "resultaatlaag ongemoeid");
  });

  await test("bereikbaar: tandwiel bij Weergave op canvas en de knop Zichtbaarheid in de tab Inzicht", async () => {
    geopend = 0;
    mount(<Proef venster={false} tekenvlak={false} />);
    const tandwiel = container.querySelector('[data-actie="zichtbaarheid"]');
    ok(tandwiel, "tandwiel ontbreekt");
    ok(tandwiel!.closest(".fem-results-section-title")?.textContent?.includes("Weergave op canvas"), "tandwiel niet bij de titel");
    klik(tandwiel!);
    gelijk(geopend, 1, "tandwiel opent het venster");
    let lint = 0;
    mount(<InsightsTab onOpenZichtbaarheid={() => { lint++; }} />);
    const knop = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Zichtbaarheid"));
    ok(knop, "lintknop ontbreekt");
    klik(knop!);
    gelijk(lint, 1, "lintknop opent het venster");
  });

  await test("thema: het venster gebruikt de tokens, licht en donker verschillend", async () => {
    mount(<Proef tekenvlak={false} lijst={false} />);
    await wacht();
    const kleur = () => getComputedStyle(document.querySelector(".zichtbaarheid-venster .modal-body")!).backgroundColor;
    document.documentElement.setAttribute("data-theme", "light");
    const licht = kleur();
    document.documentElement.setAttribute("data-theme", "openaec");
    const donker = kleur();
    document.documentElement.removeAttribute("data-theme");
    ok(licht !== donker, `zelfde achtergrond: ${licht}`);
  });
}

run()
  .then(() => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: null }); })
  .catch((e) => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: String(e?.stack ?? e) }); });
