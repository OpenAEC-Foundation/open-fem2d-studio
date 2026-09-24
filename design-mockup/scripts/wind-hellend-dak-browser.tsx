/**
 * Browserkant van test-wind-hellend-dak-ui.mjs (issue #49): het echte
 * windvenster (WindGeneratorDialog) op een zadeldak van 20°, met de echte
 * generator en het echte voorbeeld (`windVoorbeeld`). Alleen de store-kant
 * (wegschrijven in het model) is vervangen door een proefopstelling die de
 * instellingen in React-state houdt, zoals `useWindGenerator` dat doet.
 *
 * Zonder hash draait de testreeks en komt de uitslag als JSON in #uitslag. Met
 * `#beeld=auto-licht|auto-donker|ingevuld` wordt alleen het venster opgebouwd
 * — daarvan maakt de test op verzoek een schermafbeelding.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import "../src/themes.css";
import "../src/App.css";
import WindGeneratorDialog from "../src/lib/wind/WindGeneratorDialog";
import { STANDAARD_WIND_INSTELLINGEN, type WindInstellingen } from "../src/lib/wind/windGenerator";
import { windVoorbeeld } from "../src/lib/wind/windVoorbeeld";
import type { WindGeneratorApi } from "../src/stores/windStore";

const tests: { name: string; error?: string }[] = [];
const container = document.getElementById("root")!;
let root = createRoot(container);
function mount(element: React.ReactNode) {
  flushSync(() => root.unmount());
  root = createRoot(container);
  flushSync(() => root.render(element));
}
const wacht = (ms = 60) => new Promise((r) => setTimeout(r, ms));
function ok(v: unknown, m: string) { if (!v) throw Error(m); }
function gelijk(a: unknown, b: unknown, m: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); tests.push({ name }); }
  catch (e) { tests.push({ name, error: e instanceof Error ? e.message : String(e) }); }
}
function typ(el: HTMLInputElement | null, waarde: string) {
  ok(el, "invoerveld ontbreekt");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, waarde);
  flushSync(() => el!.dispatchEvent(new Event("input", { bubbles: true })));
}
function klik(el: Element | null) {
  ok(el, "klikdoel ontbreekt");
  flushSync(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

// ── Het model: zadeldak 12 m breed, goot op 5 m, α = 20° ─────────────────
const zn = 5000 + 6000 * Math.tan(20 * Math.PI / 180);
const model = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 5000 }, { id: 4, x: 6000, z: zn }, { id: 5, x: 12000, z: 5000 }],
  beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }],
  loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" as const }],
};
const START: WindInstellingen = {
  ...STANDAARD_WIND_INSTELLINGEN,
  stuwdrukBron: "handmatig", qpHandmatig_kNm2: 1.0, cpiKeuze: "min",
  richtingRechts: false, richtingHaaks: true,
  hohSpant_m: 5, gebouwlengte_m: 10, afstandTotKopgevel_m: 5,
  cpeDakLoef: null, cpeDakLij: null, cpeDakHaaks: null,
};

/** Actuele instellingen van de proefopstelling, na elke render. */
let inst: WindInstellingen = START;
let gegenereerd = 0;

function Proef({ begin = START }: { begin?: WindInstellingen }) {
  const [i, setI] = React.useState<WindInstellingen>(begin);
  inst = i;
  const api: WindGeneratorApi = {
    instellingen: i,
    setInstellingen: (patch) => setI((p) => ({ ...p, ...patch })),
    actief: false, laatste: null, modelVersie: 1,
    voorbeeld: (x) => windVoorbeeld(model, x),
    genereer: () => { gegenereerd++; return { resultaat: windVoorbeeld(model, i).resultaat, uitkomst: "toegepast" }; },
    wis: () => {},
    statistiek: { regeneraties: 0, toegepast: 0, overgeslagen: 0 },
  };
  return <WindGeneratorDialog open onClose={() => {}} wind={api} />;
}

const cpeVelden = () => [...container.querySelectorAll<HTMLInputElement>(".wgd-cpe-velden input")];
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>(".wgd-tab")].map((b) => b.textContent ?? "");
const tabelTekst = () => container.querySelector(".wgd-cpe-auto")?.textContent ?? "";

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common } }, defaultNS: "common", initImmediate: false,
  });

  const beeld = /beeld=([\w-]+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld.endsWith("donker") ? "openaec" : "light");
    document.body.style.cssText = "margin:0;background:var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    mount(<Proef begin={beeld === "ingevuld" ? { ...START, cpeDakLoef: -0.5 } : START} />);
    return;
  }

  await test("de c_pe-velden staan leeg met “(automatisch, tabel 7.4a)” en “7.4b”", async () => {
    mount(<Proef />);
    await wacht();
    const v = cpeVelden();
    gelijk(v.length, 3, "loef, lij en haaks");
    gelijk(v.map((x) => x.value), ["", "", ""], "leeg");
    gelijk(v.map((x) => x.placeholder), ["(automatisch, tabel 7.4a)", "(automatisch, tabel 7.4a)", "(automatisch, tabel 7.4b)"], "placeholder");
    ok(v[0].getBoundingClientRect().width >= 150, `veld te smal voor de tekst: ${v[0].getBoundingClientRect().width}px`);
    const kop = container.querySelector(".wgd-section-title .wgd-section-sub")?.textContent ?? "";
    ok(kop.includes("α ≈ 20°") && kop.includes("zadeldak"), `kop: ${kop}`);
  });

  await test("de automatische waarden per zone staan in het venster (α = 20°, lineair tussen 15° en 30°)", async () => {
    mount(<Proef />);
    await wacht();
    const t = tabelTekst();
    for (const stuk of ["θ = 0° · 7.4a", "lineair tussen 15° en 30°", "F −0,77 / +0,37", "G −0,70 / +0,37", "H −0,27 / +0,27",
      "I −0,40 / +0,00", "J −0,83 / +0,00", "θ = 90° · 7.4b", "F −1,23", "G −1,33", "H −0,67", "I −0,50"]) {
      ok(t.includes(stuk), `ontbreekt: ${stuk} in ${t}`);
    }
  });

  await test("geen foutmelding, Genereren aan, vier gevallen van links plus haaks", async () => {
    mount(<Proef />);
    await wacht();
    gelijk(container.querySelectorAll(".wgd-melding.fout").length, 0, "fouten");
    const knop = container.querySelector<HTMLButtonElement>(".wgd-btn.primary");
    ok(knop && !knop.disabled, "Genereren staat uit");
    gelijk(tabs(), [
      "van links (c_pi = -0,30), dak loef −, lij −", "van links (c_pi = -0,30), dak loef −, lij +",
      "van links (c_pi = -0,30), dak loef +, lij −", "van links (c_pi = -0,30), dak loef +, lij +",
      "haaks op het spant (c_pi = -0,30)"], "tabs");
    klik(knop);
    gelijk(gegenereerd, 1, "genereer aangeroepen");
  });

  await test("overschrijven: een ingevulde c_pe loef gaat voor, het lijvlak blijft automatisch", async () => {
    mount(<Proef />);
    await wacht();
    typ(cpeVelden()[0], "-0.5");
    await wacht();
    gelijk(inst.cpeDakLoef, -0.5, "instelling");
    gelijk(cpeVelden()[0].value, "-0.5", "veld toont de waarde");
    gelijk(tabs(), ["van links (c_pi = -0,30), dak lij −", "van links (c_pi = -0,30), dak lij +", "haaks op het spant (c_pi = -0,30)"], "tabs");
    // De tabel per staaf van het eerste geval: het loefvlak als één vlak, ingevuld.
    klik(container.querySelector(".wgd-klap-kop"));
    await wacht();
    const tabel = container.querySelector(".wgd-klap-inhoud .wgd-table")?.textContent ?? "";
    ok(tabel.includes("loefdakvlak") && tabel.includes("door de gebruiker ingevuld"), `tabel: ${tabel.slice(0, 300)}`);
    ok(tabel.includes("J (0,00–0,17 van de staaf)") && tabel.includes("I (0,17–1,00 van de staaf)"), "lijvlak blijft in zones");
  });

  await test("leeg maken: terug naar de tabel", async () => {
    mount(<Proef begin={{ ...START, cpeDakLoef: -0.5 }} />);
    await wacht();
    gelijk(cpeVelden()[0].value, "-0.5", "begint ingevuld");
    typ(cpeVelden()[0], "");
    await wacht();
    gelijk(inst.cpeDakLoef, null, "instelling leeg");
    gelijk(cpeVelden()[0].placeholder, "(automatisch, tabel 7.4a)", "placeholder terug");
    gelijk(tabs().length, 5, "weer vier gevallen plus haaks");
  });

  await test("lessenaarsdak: tabel 7.3a en 7.3b", async () => {
    const les = {
      ...model,
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 5000 }, { id: 4, x: 12000, z: 5000 + 12000 * Math.tan(15 * Math.PI / 180) }],
      beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }],
    };
    function Les() {
      const [i, setI] = React.useState<WindInstellingen>(START);
      const api: WindGeneratorApi = {
        instellingen: i, setInstellingen: (p) => setI((x) => ({ ...x, ...p })), actief: false, laatste: null, modelVersie: 1,
        voorbeeld: (x) => windVoorbeeld(les, x), genereer: () => ({ resultaat: windVoorbeeld(les, i).resultaat, uitkomst: "toegepast" }),
        wis: () => {}, statistiek: { regeneraties: 0, toegepast: 0, overgeslagen: 0 },
      };
      return <WindGeneratorDialog open onClose={() => {}} wind={api} />;
    }
    mount(<Les />);
    await wacht();
    gelijk(cpeVelden().map((x) => x.placeholder), ["(automatisch, tabel 7.3a)", "(automatisch, tabel 7.3a)", "(automatisch, tabel 7.3b)"], "placeholder");
    const t = tabelTekst();
    for (const stuk of ["θ = 0° · 7.3a", "θ = 180° · 7.3a", "θ = 90° · 7.3b", "F_hoog −2,40", "F_laag −1,60"]) ok(t.includes(stuk), `ontbreekt: ${stuk}`);
  });

  await test("thema: licht en donker verschillen, de velden volgen de tokens", async () => {
    mount(<Proef />);
    await wacht();
    const kleur = () => getComputedStyle(cpeVelden()[0]).backgroundColor;
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
