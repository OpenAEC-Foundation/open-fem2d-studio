import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import FemProperties from "../src/components/fem/FemProperties";
import BetonKorfPaneel from "../src/components/beton/BetonKorfPaneel";
import type { MnKappaResponse } from "../src/lib/types/concrete/MnKappaResponse";

const tests: { name: string; error?: string }[] = [];
const host = document.getElementById("test-root")!;
let root = createRoot(host);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function ok(value: unknown, message: string) { if (!value) throw Error(message); }
function mount(element: React.ReactNode, width = 240) {
  flushSync(() => root.unmount());
  host.style.width = `${width}px`;
  root = createRoot(host);
  flushSync(() => root.render(element));
}
function type(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  ok(el, `Veld ontbreekt: ${selector}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  flushSync(() => el.dispatchEvent(new Event("input", { bubbles: true })));
}
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); tests.push({ name }); } catch (error) { tests.push({ name, error: String(error) }); }
}
const noop = () => {};
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
const props = { nodes, plates: [], supports: [], loads: [], updateNode: noop, addSupport: noop,
  removeSupport: noop, results: null, selection: { type: "beam" as const, id: 1 } };
// Alleen de externe rekenaanroep wordt gestuurd om antwoordvolgordes te testen.
function response(moment: number): MnKappaResponse {
  return { section_name: "300x600", reinforcement_summary: "4Ø20", f_cd_mpa: 20, f_yd_mpa: 435,
    d_mm: 562, a_s_bottom_mm2: 1257, a_s_top_mm2: 226, n_rd_compression_kn: 4193, n_rd_tension_kn: 645,
    interaction_positive: [], interaction_negative: [], diagram: { n_kn: 0, moment_sign: 1,
      points: [{ kappa_per_m: 0, m_knm: 0, eps_top: 0, eps_bottom: 0, x_mm: 0 },
        { kappa_per_m: .02, m_knm: moment, eps_top: .0035, eps_bottom: -.01, x_mm: 100 }],
      kappa_u_per_m: .02, m_u_knm: moment, m_max_knm: moment, kappa_y_per_m: null, m_y_knm: null,
      failure_mode: "ConcreteCrushing", x_u_mm: 100, eps_c_u: .0035, eps_s_u: .01, n_strips: 50 } };
}
async function run() {
  await i18next.use(initReactI18next).init({ lng: "nl", resources: { nl: { common, check } }, defaultNS: "common", initImmediate: false });
  for (const [material, profile, expected] of [["C30/37", "300x600", "33000"], ["C20/25", "300x600", "30000"], ["S235", "HEA160", "210000"],
    ["C30/37", "onbekend", "33000"], ["C30/37", undefined, "33000"], ["C30/37", "EIGEN:niet-bewaard", "33000"]]) {
    await test(`Materiaaleigenschappen ${material}: E = ${expected} N/mm²`, () => {
      mount(<FemProperties {...props} beams={[{ id: 1, from: 1, to: 2, material, profile }]} />);
      const row = [...host.querySelectorAll(".fem-prop-row")].find(el => el.querySelector(".fem-prop-row-label")?.textContent === "E");
      ok(row?.textContent?.includes(`${expected} N/mm²`), `Verkeerde E: ${row?.textContent}`);
    });
  }
  for (const width of [220, 240, 900]) {
    await test(`Dekking per zijde blijft leesbaar binnen ${width}px`, async () => {
      mount(<BetonKorfPaneel initieel={{ milieuklasse: "XC4" }} berekenDiagram={() => new Promise(() => {})} />, width);
      const button = host.querySelector<HTMLButtonElement>(".beton-zijden-knop")!;
      flushSync(() => button.click());
      await delay(20);
      ok(host.scrollWidth <= host.clientWidth + 1, "Zijdevelden lopen buiten het paneel");
      for (const select of host.querySelectorAll<HTMLSelectElement>(".beton-invoer-zijde")) {
        ok(select.getBoundingClientRect().width >= 100, `Milieuklasse onleesbaar: ${select.getBoundingClientRect().width}px`);
      }
    });
  }
  await test("Betonnormtab toont korf en betonstabiliteit zonder ongebruikte staalvelden", () => {
    mount(<FemProperties {...props} beams={[{ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x600" }]} />);
    const button = [...host.querySelectorAll("button")].find(el => el.textContent === "EN 1992")!;
    flushSync(() => button.click());
    ok(host.querySelector("#beton-b"), "Korf ontbreekt");
    ok(!host.textContent?.includes("Kipsteunen"), "Staal-kipsteunen zichtbaar bij beton");
    ok(!host.textContent?.includes("L_cr,y"), "Ongebruikte generieke kniklengte zichtbaar bij beton");
  });
  for (const width of [220, 320, 900]) {
    await test(`Betonpaneel past binnen ${width}px zonder horizontale overloop`, async () => {
      mount(<BetonKorfPaneel berekenDiagram={() => new Promise(() => {})} />, width);
      await delay(20);
      ok(host.scrollWidth <= host.clientWidth + 1, `Overloop: ${host.scrollWidth} > ${host.clientWidth}`);
      const form = host.querySelector(".beton-kolom-invoer")!.getBoundingClientRect();
      const output = host.querySelector(".beton-kolom-uitvoer")!.getBoundingClientRect();
      ok(width < 600 ? output.top >= form.bottom : output.left >= form.right, "Indeling volgt niet de paneelbreedte");
    });
  }
  for (const invalidate of [true, false]) {
    await test(`Lopende berekening bij ${invalidate ? "ongeldige geometrie" : "nieuwe geldige invoer"} maakt oude fout ongeldig`, async () => {
      let rejectOld: (e: Error) => void = noop;
      mount(<BetonKorfPaneel berekenDiagram={() => new Promise((_, reject) => { rejectOld = reject; })} />);
      await delay(400);
      ok(host.querySelector(".beton-bezig"), "Berekening startte niet");
      type("#beton-b", invalidate ? "1" : "400");
      await delay(20);
      if (invalidate) ok(!host.querySelector(".beton-bezig"), "Ongeldige geometrie blijft op berekenen staan");
      rejectOld(Error("verouderde-aanvraag"));
      await delay(20);
      ok(!host.textContent?.includes("verouderde-aanvraag"), "Verouderde fout wordt getoond");
    });
  }
  for (const invalid of [true, false]) {
    await test(`Laat succesvol antwoord overschrijft ${invalid ? "ongeldige invoer" : "nieuwer resultaat"} niet`, async () => {
      const requests: ((r: MnKappaResponse) => void)[] = [];
      mount(<BetonKorfPaneel berekenDiagram={() => new Promise(resolve => requests.push(resolve))} />);
      await delay(400);
      ok(requests.length === 1, "Eerste berekening ontbreekt");
      type("#beton-b", invalid ? "1" : "400");
      if (!invalid) {
        await delay(400);
        ok(requests.length === 2, "Nieuwe berekening ontbreekt");
        requests[1](response(222));
        await delay(20);
        ok(host.querySelector(".beton-grafiek-samenvatting")?.textContent?.includes("222,0"), "Actueel resultaat ontbreekt");
      }
      requests[0](response(111));
      await delay(20);
      const summary = host.querySelector(".beton-grafiek-samenvatting");
      ok(!summary?.textContent?.includes("111,0"), "Oud rekenantwoord overschrijft actuele invoer");
      ok(invalid ? summary === null : summary?.textContent?.includes("222,0"), "Actuele resultaatstatus klopt niet");
    });
  }
  await test("Zichtbaar resultaat verdwijnt direct zodra nieuwe invoer wordt berekend", async () => {
    let count = 0;
    mount(<BetonKorfPaneel berekenDiagram={() => ++count === 1 ? Promise.resolve(response(111)) : new Promise(() => {})} />);
    await delay(400);
    ok(host.querySelector(".beton-grafiek-samenvatting"), "Eerste resultaat ontbreekt");
    type("#beton-b", "400");
    await delay(20);
    ok(!host.querySelector(".beton-grafiek-samenvatting"), "Oud resultaat blijft bij nieuwe invoer staan");
  });
  await test("Betononderpaneel laat ook bij een grote opgeslagen hoogte werkruimte over", () => {
    mount(<aside className="bottom-panel" style={{ height: 900 }}><div className="bottom-panel-body">Beton</div></aside>);
    const height = host.querySelector("aside")!.getBoundingClientRect().height;
    ok(height <= window.innerHeight * .45 + 1, `Onderpaneel slokt werkruimte op: ${height}px`);
    ok(height <= Math.max(120, window.innerHeight - 480) + 1, "Te weinig ruimte over voor model en zijbalk");
  });
  flushSync(() => root.unmount());
}
run().then(() => document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: null }))
  .catch(error => document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(error.stack ?? error) }));
