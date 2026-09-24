/**
 * Browserkant van test-eigenschappen-ui.mjs (issue #43): het echte
 * eigenschappenpaneel (FemProperties) en de echte staafdialoog
 * (BarPropertiesDialog), met een stalen en een houten ligger.
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=staal-licht`, `#beeld=hout-licht`, `#beeld=staal-donker` of
 * `#beeld=tip-open` wordt alleen het beeld opgebouwd — daarvan maakt de test op
 * verzoek een schermafbeelding.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import "../src/themes.css";
import "../src/App.css";
import FemProperties from "../src/components/fem/FemProperties";
import BarPropertiesDialog from "../src/components/fem/BarPropertiesDialog";
import type { Beam, Node } from "../src/components/fem/femTypes";

const tests: { name: string; error?: string }[] = [];
const container = document.getElementById("root")!;
let root = createRoot(container);
const noop = () => {};
const wacht = (ms = 80) => new Promise((r) => setTimeout(r, ms));
function mount(element: React.ReactNode) {
  flushSync(() => root.unmount());
  root = createRoot(container);
  flushSync(() => root.render(element));
}
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); tests.push({ name }); }
  catch (e) { tests.push({ name, error: e instanceof Error ? e.message : String(e) }); }
}

// ── Het model ──────────────────────────────────────────────────────────────
// Een ligger van 8770 mm, als staal en als hout.
const nodes: Node[] = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8770, z: 0 }];
const staal: Beam = {
  id: 1, from: 1, to: 2, material: "S235", profile: "IPE 300",
  checkConfig: { lateralRestraints: [0.25, 0.5, 0.75], lateralRestraintsBottom: [0.25, 0.5, 0.75] },
};
const hout: Beam = {
  id: 1, from: 1, to: 2, material: "GL24h", profile: "100x400",
  checkConfig: { lateralRestraints: [0.5], ltbSupportSpacing_m: 2 },
};

function Paneel({ beam, update }: { beam: Beam; update?: (id: number, u: Partial<Beam>) => void }) {
  return (
    <aside className="right-panel" style={{ width: 240 }}>
      <div className="right-panel-body">
        <FemProperties
          selection={{ type: "beam", id: beam.id }} nodes={nodes} beams={[beam]} plates={[]}
          supports={[]} loads={[]} updateNode={noop} addSupport={noop} removeSupport={noop}
          results={null} updateBeam={update ?? noop}
        />
      </div>
    </aside>
  );
}
function ok(v: unknown, m: string) { if (!v) throw Error(m); }
function gelijk(a: unknown, b: unknown, m: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
/** De vertaalde tekst van een sleutel, zoals het paneel hem zou tonen. */
const tekst = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(sleutel, { ns: "check", ...opties });
/** De regel (paneel of dialoog) waarvan het label met `label` begint. */
function rij(label: string): HTMLElement {
  const r = [...container.querySelectorAll<HTMLElement>(".fem-prop-row, .bar-props-row")]
    .find((el) => (el.querySelector(".fem-prop-row-label, span")?.textContent ?? "").includes(label));
  if (!r) throw Error(`regel ontbreekt: ${label}`);
  return r;
}
const knopBij = (label: string) => {
  const k = rij(label).querySelector<HTMLButtonElement>(".infotip-knop");
  if (!k) throw Error(`geen InfoTip bij ${label}`);
  return k;
};
const veldBij = (label: string) => rij(label).querySelector<HTMLElement>("input, select")!;
/** De tekst van de tip bij een regel, via aria-describedby van het veld. */
function tipBij(label: string): string {
  const id = veldBij(label)?.getAttribute("aria-describedby");
  if (!id || id !== knopBij(label).getAttribute("aria-describedby")) throw Error(`${label}: veld en knop wijzen niet naar dezelfde tip`);
  return document.getElementById(id)?.textContent ?? "";
}
/** De zichtbare korte statusregels in het paneel. */
const zichtbareHints = () =>
  [...container.querySelectorAll<HTMLElement>(".fem-prop-hint:not(.fem-prop-let-op)")].map((e) => e.textContent ?? "");
/** Klik op het normtabblad (EN 1993 / EN 1995). */
function naarNorm() {
  const knop = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => /^EN 199[35]$/.test(b.textContent ?? ""));
  if (!knop) throw Error("normtabblad ontbreekt");
  flushSync(() => knop.click());
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common, check } }, defaultNS: "common", initImmediate: false,
  });
  const beeld = /beeld=([\w-]+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld.endsWith("donker") ? "openaec" : "light");
    for (const el of [document.documentElement, document.body, container]) {
      el.style.height = "auto";
      el.style.overflow = "visible";
    }
    document.body.style.background = "var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    mount(<Paneel beam={beeld.startsWith("hout") ? hout : staal} />);
    naarNorm();
    if (beeld === "tip-open") {
      const knop = container.querySelector<HTMLButtonElement>(".infotip-knop");
      if (knop) flushSync(() => knop.focus());
    }
    return;
  }

  // ── #43: uitleg in een InfoTip ──────────────────────────────────────────
  await test("staal: elke voormalige uitleg zit in een tip bij het veld; de korte status blijft staan", () => {
    mount(<Paneel beam={staal} />);
    naarNorm();
    ok(tipBij("L_cr,z").includes(tekst("cfg.bucklingOutOfPlaneHint")), "L_cr,z: uitleg knik uit het vlak");
    ok(tipBij("Posities").includes(tekst("props.beam.bracingFillHint")), "Posities: invulhulp");
    ok(tipBij("Zeeg").includes(tekst("cfg.preCamberHint")), "Zeeg: uitleg");
    const status = zichtbareHints();
    ok(status.includes("Leeg = 8770 mm, staaflengte (terugval)."), `status L_cr,y: ${status}`);
    ok(status.includes("Leeg = 2192.5 mm, uit de kipsteunen aan boven- én onderflens."), `status L_cr,z: ${status}`);
    ok(status.includes("Op 2192.5 · 4385 · 6577.5 mm vanaf de startknoop."), `posities: ${status}`);
    for (const k of ["cfg.bucklingOutOfPlaneHint", "props.beam.bracingFillHint", "cfg.preCamberHint"]) {
      ok(!container.textContent!.includes(tekst(k)), `${k} staat niet meer als doorlopende tekst in het paneel`);
    }
  });

  await test("hout: ook de houtuitleg zit in tips; de kipsteunafstand houdt een korte status", () => {
    mount(<Paneel beam={{ ...hout, checkConfig: { ...hout.checkConfig, performLtbCheck: false } }} />);
    naarNorm();
    const lcrz = tipBij("L_cr,z");
    ok(lcrz.includes(tekst("cfg.bucklingOutOfPlaneHint")) && lcrz.includes(tekst("props.beam.timberLcrzHint")), "L_cr,z hout");
    const pos = tipBij("Posities");
    ok(pos.includes(tekst("props.beam.bracingFillHint")) && pos.includes(tekst("cfg.bracingTimberHint")), "Posities hout");
    ok(tipBij("Kipsteunafstand").includes(tekst("props.beam.ltbSpacingHint", { lengte: "8770" })), "kipsteunafstand");
    ok(tipBij("Scheurfactor").includes(tekst("props.beam.kCrHint")), "k_cr");
    ok(tipBij("Klimaatklasse").includes(tekst("props.beam.climateHint")), "klimaat");
    const status = zichtbareHints();
    ok(status.filter((s) => s === "Leeg = 8770 mm, staaflengte (terugval).").length === 3,
      `L_cr,y, L_cr,z en de kipsteunafstand noemen elk hun terugval: ${status}`);
    // Waarschuwingen blijven in het paneel, niet in een tip.
    const letOp = container.querySelector<HTMLElement>('.fem-prop-let-op[role="note"]');
    ok(letOp && letOp.textContent === tekst("props.beam.ltbOffHint") && letOp.offsetHeight > 0, "kiptoets-uit blijft zichtbaar");
  });

  await test("toetsenbord: focus toont, Esc sluit alleen de tip; aria-describedby op het veld", () => {
    mount(<Paneel beam={staal} />);
    naarNorm();
    const veld = veldBij("L_cr,z");
    const knop = knopBij("L_cr,z");
    const tip = document.getElementById(veld.getAttribute("aria-describedby")!)!;
    ok(tip && tip.getAttribute("role") === "tooltip", "het veld verwijst naar de tip");
    gelijk(knop.getAttribute("aria-describedby"), tip.id, "de knop verwijst er ook naar");
    ok(knop.getAttribute("aria-label") === "Uitleg", "toegankelijke naam");
    ok(tip.hidden, "dicht bij het openen");
    flushSync(() => knop.focus());
    ok(!tip.hidden && knop.getAttribute("aria-expanded") === "true", "focus opent");
    let doorgegeven = 0;
    const teller = () => { doorgegeven++; };
    window.addEventListener("keydown", teller);
    flushSync(() => knop.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    window.removeEventListener("keydown", teller);
    ok(tip.hidden, "Esc sluit");
    gelijk(doorgegeven, 0, "Esc gaat niet door naar het tekenvlak");
    ok(document.activeElement === knop, "de focus blijft op de knop");
    flushSync(() => knop.blur());
    // Enter op een knop is een klik: de tip gaat vast open.
    flushSync(() => knop.focus());
    flushSync(() => knop.click());
    flushSync(() => knop.blur());
    ok(tip.hidden, "focus weg = tip dicht");
  });

  await test("muis en aanraken: hover toont, klik/tik zet vast, tweede klik of klik ernaast sluit", async () => {
    mount(<Paneel beam={staal} />);
    naarNorm();
    const knop = knopBij("Zeeg");
    const tip = document.getElementById(knop.getAttribute("aria-describedby")!)!;
    // Een hover is voor React een doorlopende gebeurtenis: de update komt een
    // tel later, niet binnen flushSync.
    const over = async (type: string, related: EventTarget | null) => {
      knop.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));
      await wacht();
    };
    await over("mouseover", null);
    ok(!tip.hidden, "hover opent");
    await over("mouseout", document.body);
    ok(tip.hidden, "weg met de muis sluit");
    // Een tik: focus en klik.
    flushSync(() => knop.focus());
    flushSync(() => knop.click());
    await over("mouseout", document.body);
    ok(!tip.hidden, "na een tik blijft de tip staan");
    flushSync(() => knop.click());
    ok(tip.hidden, "tweede tik sluit");
    flushSync(() => knop.click());
    ok(!tip.hidden, "weer vast");
    flushSync(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    ok(tip.hidden, "klik ernaast sluit");
  });

  await test("de tip blijft binnen het venster, ook aan de rechterrand van het paneel", () => {
    mount(<div style={{ display: "flex", justifyContent: "flex-end", width: "100vw" }}><Paneel beam={hout} /></div>);
    naarNorm();
    for (const label of ["L_cr,z", "Klimaatklasse", "Scheurfactor"]) {
      const knop = knopBij(label);
      flushSync(() => knop.focus());
      const r = document.getElementById(knop.getAttribute("aria-describedby")!)!.getBoundingClientRect();
      ok(r.width > 100 && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
        `${label}: tip ${JSON.stringify([r.left, r.top, r.right, r.bottom])} in venster ${window.innerWidth}×${window.innerHeight}`);
      flushSync(() => knop.blur());
    }
  });

  await test("thema: de tip volgt licht en donker via de tokens", () => {
    mount(<Paneel beam={staal} />);
    naarNorm();
    const knop = knopBij("L_cr,z");
    flushSync(() => knop.focus());
    const tip = document.getElementById(knop.getAttribute("aria-describedby")!)!;
    document.documentElement.setAttribute("data-theme", "light");
    const licht = getComputedStyle(tip).backgroundColor;
    document.documentElement.setAttribute("data-theme", "openaec");
    const donker = getComputedStyle(tip).backgroundColor;
    document.documentElement.removeAttribute("data-theme");
    flushSync(() => knop.blur());
    gelijk([licht, donker], ["rgb(255, 255, 255)", "rgb(39, 39, 42)"], "achtergrond licht/donker");
  });

  await test("staafdialoog: dezelfde uitleg in tips, de status en de waarschuwing blijven", () => {
    for (const beam of [staal, { ...hout, checkConfig: { ...hout.checkConfig, performLtbCheck: false } }]) {
      const isHout = beam.material === "GL24h";
      mount(<BarPropertiesDialog beam={beam} nodes={nodes} onUpdate={noop} onClose={noop} />);
      const tab = container.querySelector<HTMLButtonElement>(".bar-props-tab:nth-child(2)")!;
      flushSync(() => tab.click());
      const lcrz = tipBij("L_cr,z");
      ok(lcrz.includes(tekst("cfg.bucklingOutOfPlaneHint")) && lcrz.includes(tekst("cfg.bucklingHint")), "L_cr,z");
      ok(tipBij("Klasse").includes(tekst("cfg.deflClassHint")), "doorbuigingsklasse");
      const status = [...container.querySelectorAll(".bar-props-hint")].map((e) => e.textContent);
      ok(status.some((s) => s?.startsWith("Leeg = ")), `status L_cr,z: ${status}`);
      if (isHout) {
        ok(lcrz.includes(tekst("cfg.bucklingHintTimber")), "L_cr,z hout");
        ok(tipBij("Klimaatklasse").includes(tekst("cfg.timberHint")), "klimaat");
        ok(tipBij("Belastingduur").includes(tekst("cfg.durHint")), "duur");
        ok(tipBij("Kipsteunafstand").includes(tekst("cfg.ltbSupportSpacingHint")), "kipsteunafstand");
        ok(tipBij("k_cr").includes(tekst("cfg.kCrHint")), "k_cr");
        const note = container.querySelector<HTMLElement>('.bar-props-hint[role="note"]');
        ok(note && note.offsetHeight > 0, "kiptoets-uit blijft zichtbaar");
      } else {
        ok(tipBij("Posities").includes(tekst("cfg.bracingHint")), "posities");
        ok(tipBij("w_add").includes(tekst("cfg.deflAddNumeratorHint")), "w_add");
        ok(tipBij("Zeeg").includes(tekst("cfg.preCamberHint")), "zeeg");
      }
      for (const k of ["cfg.bucklingOutOfPlaneHint", "cfg.deflClassHint", "cfg.preCamberHint", "cfg.kCrHint"]) {
        ok(!container.textContent!.includes(tekst(k)), `${k} niet meer als doorlopende tekst`);
      }
    }
  });
}

run()
  .then(() => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: null }); })
  .catch((e) => { const el = document.getElementById("uitslag"); if (el) el.textContent = JSON.stringify({ tests, error: String(e?.stack ?? e) }); });
