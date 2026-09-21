import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import FemCanvas, { DimEditForm, PopoverLineLoadForm, PopoverEdgeLoadForm, PopoverPointLoadForm } from "../src/components/fem/FemCanvas";
import { DEFAULT_GRID } from "../src/components/fem/femTypes";
import FemProperties from "../src/components/fem/FemProperties";
import BarPropertiesDialog from "../src/components/fem/BarPropertiesDialog";
import KolomVelden from "../src/components/beton/KolomVelden";
import LoadCaseTabBar from "../src/components/fem/LoadCaseTabBar";
import LengthInput from "../src/components/LengthInput";
import WindGeneratorDialog from "../src/lib/wind/WindGeneratorDialog";
import { genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN } from "../src/lib/wind/windGenerator";

const tests: string[] = [];
const container = document.getElementById("root")!;
let root = createRoot(container);
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}
function ok(value: unknown, message: string) { if (!value) throw Error(message); }
function mount(element: React.ReactNode) {
  flushSync(() => root.unmount());
  root = createRoot(container);
  flushSync(() => root.render(element));
}
function input(selector: string) {
  const el = container.querySelector<HTMLInputElement>(selector);
  if (!el) throw Error("Invoerveld ontbreekt: " + selector);
  return el;
}
function type(el: HTMLInputElement, value: string, blur = false) {
  el.focus();
  // Native setter om hetzelfde input-event als toetsenbordinvoer aan React te geven.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  flushSync(() => el.dispatchEvent(new Event("input", { bubbles: true })));
  if (blur) flushSync(() => el.blur());
}
function click(selector: string) {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw Error("Knop ontbreekt: " + selector);
  flushSync(() => el.click());
}
function rowInput(label: string) {
  const row = [...container.querySelectorAll(".fem-prop-row,.bar-props-row,label.wgd-getal")]
    .find(el => el.textContent?.includes(label) && el.querySelector("input"));
  if (!row) throw Error("Rij ontbreekt: " + label);
  return row.querySelector<HTMLInputElement>("input")!;
}
function key(k: string) {
  flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
}
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 6000, z: 3000 }, { id: 4, x: 0, z: 3000 }];
const beam = { id: 1, from: 1, to: 2, material: "C24", profile: "96x281" };
const plate = { id: 1, nodeIds: [1, 2, 3, 4] };
const noop = () => {};
const propsBase = { nodes, beams: [beam], plates: [plate], supports: [], loads: [], updateNode: noop, addSupport: noop, removeSupport: noop, results: null };

async function run() {
  await i18next.use(initReactI18next).init({ lng: "nl", resources: { nl: { common, check } }, defaultNS: "common", initImmediate: false });
  for (const enter of [false, true]) {
    let calls = 0;
    mount(<LengthInput required value={3} storedUnit="m" onChange={() => calls++} />);
    const el = input("input");
    type(el, "", !enter);
    if (enter) flushSync(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    equal(el.value, "3000", "Verplicht leeg veld herstelt opgeslagen waarde");
    equal(calls, 0, "Verplicht leeg veld schrijft niets");
    tests.push("LengthInput required: leeg + " + (enter ? "Enter" : "blur") + " herstelt 3000 mm");
  }
  const canvasProps = {
    nodes: [nodes[0]], beams: [], plates: [], supports: [], loads: [], selection: null,
    activeLoadCaseId: 1, grid: DEFAULT_GRID, setSelection: noop, addNode: () => 2,
    updateNode: noop, addBeam: noop, addPlate: noop, addSupport: noop, addLoad: noop,
    deleteSelected: noop, splitBeamAt: noop, translateSelection: noop, copySelection: noop,
    rotateSelection: noop, mirrorSelection: noop,
  };
  for (const raw of ["6000", "6000,5", "6000.5"]) {
    let point: number[] | undefined, added: number[] | undefined;
    mount(<FemCanvas {...canvasProps} tool="addBeam"
      addNode={(x, z) => { point = [x, z]; return 2; }} addBeam={(a, b) => { added = [a, b]; return 1; }} />);
    await new Promise(resolve => setTimeout(resolve, 50));
    const svg = container.querySelector<SVGSVGElement>("svg.fem-canvas-svg")!;
    const node = container.querySelector<SVGCircleElement>(".fem-node")!;
    const rect = svg.getBoundingClientRect();
    const x = rect.left + node.cx.baseVal.value, y = rect.top + node.cy.baseVal.value;
    flushSync(() => svg.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })));
    flushSync(() => svg.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true })));
    flushSync(() => svg.dispatchEvent(new MouseEvent("mousemove", { clientX: x + 500, clientY: y, bubbles: true })));
    for (const c of raw) key(c);
    ok(container.textContent!.includes("mm"), "HUD maat in mm");
    key("Enter");
    equal(point, [raw === "6000" ? 6000 : 6000.5, 0], "Getypte staaflengte in mm");
    equal(added, [1, 2], "Staaf met nieuw eindpunt");
    tests.push("Canvas staaf tekenen " + raw + " mm via muis en toetsenbord");
  }
  for (const [axis, raw, expected] of [["x", "250,5", [250.5, 0]], ["z", "-250.5", [0, -250.5]]]) {
    let moved: unknown;
    mount(<FemCanvas {...canvasProps} tool="select" selection={{ type: "node", id: 1 }}
      translateNodes={(ids, dx, dz) => moved = [ids, dx, dz]} />);
    key("g"); key(axis); for (const c of raw) key(c); key("Enter");
    equal(moved, [[1], ...expected], "G-komma/punt behoudt millimeters en teken");
    tests.push("G verplaatsen " + axis + ": " + raw + " mm");
  }
  for (const axis of ["x", "z"]) {
    let saved: number | undefined;
    mount(<DimEditForm axis={axis} currentMm={6000} onSubmit={v => saved = v} onCancel={noop} />);
    equal(input("input").value, "6000", "Oude maatlijn in mm");
    type(input("input"), "3000"); click(".fem-popover-primary");
    equal(saved, 3000, axis + "-as op 3000 mm");
    type(input("input"), "3000,25"); click(".fem-popover-primary");
    equal(saved, 3000.25, "Decimale maatlijn");
    for (const invalid of ["-1", "0", "abc", "12mm", ""]) {
      saved = undefined; type(input("input"), invalid); click(".fem-popover-primary");
      equal(saved, undefined, "Ongeldige maatlijn");
    }
    tests.push("DimEditForm " + axis + ": 3000 mm, komma, ongeldige en negatieve maten");
  }
  for (const Component of [PopoverLineLoadForm, PopoverEdgeLoadForm]) {
    let saved: unknown;
    mount(<Component beamLenMm={6000} randLenMm={6000} randLabel="rand 1"
      startQ={-5} startP={-5} startDir="z" onthouden={false} onSubmit={(...v) => saved = v} />);
    const fields = () => [...container.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
    equal(fields().map(v => v.value), ["0", "6000"], "Volledige last in mm");
    click(".fem-popover-primary"); equal(saved, [-5, "z", undefined, undefined], "Volle lengte houdt standaardfracties");
    type(fields()[0], "1500,5"); type(fields()[1], "4500.5");
    click(".fem-popover-primary");
    equal(saved, [-5, "z", 1500.5 / 6000, 4500.5 / 6000], "Deellastfracties");
    for (const invalid of ["-1", "6001", "abc", ""]) {
      type(fields()[1], invalid);
      ok(container.querySelector<HTMLButtonElement>("button")!.disabled, "Ongeldig lastbereik geblokkeerd");
    }
    tests.push(Component.name + ": komma/punt naar fracties, lege/negatieve/buitenbereik-invoer geblokkeerd");
  }
  for (const horizontal of [false, true]) {
    for (const edge of [false, true]) {
      let saved: unknown;
      mount(<PopoverPointLoadForm beamLenMm={6000} defaultPosMm={3000} startFx={10} startFz={-10}
        horizontal={horizontal} onthouden={false} positieLabel={edge ? "Randpositie" : undefined} onSubmit={(...v) => saved = v} />);
      equal(input('input[inputmode="decimal"]').value, "3000", "Klikpositie in mm");
      type(input('input[inputmode="decimal"]'), "1500,5"); click(".fem-popover-primary");
      equal(saved, [10, -10, 1500.5 / 6000], "Puntlastfractie");
      type(input('input[inputmode="decimal"]'), "-1");
      ok(container.querySelector<HTMLButtonElement>("button")!.disabled, "Negatieve positie geblokkeerd");
      tests.push("Puntlastpopover " + (horizontal ? "H" : "V") + (edge ? " plaatrand" : " staaf"));
    }
  }
  for (const onPlate of [false, true]) {
    let patch: any;
    const address = onPlate ? { plateId: 1, edgeIndex: 0 } : { beamId: 1 };
    mount(<FemProperties {...propsBase} selection={{ type: "load", id: 1 }}
      loads={[{ id: 1, caseId: 1, type: "pointForce", posFrac: 0.5, ...address }]} updateLoad={(_, p) => patch = p} />);
    equal(rowInput("Positie").value, "3000", "Bestaande puntlastpositie");
    type(rowInput("Positie"), "1500,5", true); equal(patch, { posFrac: 1500.5 / 6000 }, "Puntlast-eigenschappen");
    patch = undefined; type(rowInput("Positie"), "6001", true); equal(patch, undefined, "Puntlast buiten as");
    tests.push("FemProperties puntlast " + (onPlate ? "plaatrand" : "staaf"));

    mount(<FemProperties {...propsBase} selection={{ type: "load", id: 2 }}
      loads={[{ id: 2, caseId: 1, type: onPlate ? "edgeLoad" : "lineLoad", q: -5, startFrac: 0.25, endFrac: 0.75, ...address }]}
      updateLoad={(_, p) => patch = p} />);
    equal(rowInput("Begin").value, "1500", "Bestaande deellast begin");
    equal(rowInput("Eind").value, "4500", "Bestaande deellast einde");
    ok(container.textContent!.includes("-15.00 kN"), "Lastsom blijft -5 kN/m × 3 m = -15 kN");
    type(rowInput("Begin"), "1000,5", true);
    equal(patch, { startFrac: 1000.5 / 6000, endFrac: 0.75 }, "Begin mm naar fractie");
    type(rowInput("Eind"), "5000.5", true);
    equal(patch, { startFrac: 1000.5 / 6000, endFrac: 5000.5 / 6000 }, "Einde mm naar fractie");
    patch = undefined; type(rowInput("Begin"), "-5", true); equal(patch, undefined, "Negatief begin geweigerd");
    tests.push("FemProperties deellast " + (onPlate ? "plaatrand" : "staaf") + ", inclusief lastsom");
  }
  for (const material of ["S235", "C24"]) {
    const b = { ...beam, material, profile: material === "S235" ? "HEA160" : "96x281",
      checkConfig: { bucklingLengthY_m: 3, bucklingLengthZ_m: 2, ltbSupportSpacing_m: 1.5 } };
    let patch: any;
    mount(<FemProperties {...propsBase} beams={[b]} selection={{ type: "beam", id: 1 }} updateBeam={(_, p) => patch = p} />);
    // Normtabblad is een eigen tab in het eigenschappenpaneel.
    const norm = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => /EN 199[35]/.test(el.textContent ?? ""));
    if (norm) flushSync(() => norm.click());
    for (const [label, field, initial] of [["L_cr,y", "bucklingLengthY_m", "3000"], ["L_cr,z", "bucklingLengthZ_m", "2000"],
      ...(material === "C24" ? [["Kipsteunafstand", "ltbSupportSpacing_m", "1500"]] : [])]) {
      equal(rowInput(label).value, initial, "Bestaande meters getoond als mm");
      type(rowInput(label), "2500,5", true);
      equal(patch.checkConfig[field], 2.5005, "Mm opgeslagen als meters");
    }
    tests.push("FemProperties knik/kip " + material + ": oude waarden en kommainvoer");
    mount(<BarPropertiesDialog beam={b} nodes={nodes} onUpdate={p => patch = p} onClose={noop} />);
    ok(container.textContent!.includes("6000 mm"), "Staaflengte naast invoer in mm");
    click(".bar-props-tab:nth-child(2)");
    for (const invalid of ["-1", "0", "12mm"]) {
      type(rowInput("L_cr,y"), invalid);
      ok(container.querySelector<HTMLButtonElement>(".bar-props-btn-primary")!.disabled, "Ongeldige kniklengte blokkeert opslaan");
    }
    type(rowInput("L_cr,y"), "3000,5");
    type(rowInput("L_cr,z"), "2000.5");
    if (material === "C24") type(rowInput("Kipsteunafstand"), "1500,5");
    click(".bar-props-btn-primary");
    equal(patch.checkConfig.bucklingLengthY_m, 3.0005, "Dialoog knik y");
    equal(patch.checkConfig.bucklingLengthZ_m, 2.0005, "Dialoog knik z");
    if (material === "C24") equal(patch.checkConfig.ltbSupportSpacing_m, 1.5005, "Dialoog kip");
    tests.push("BarPropertiesDialog " + material + ": knik/kip in m opgeslagen");
  }
  {
    let saved: any;
    const waarde = { bracing: "Geschoord", buckling_length: { soort: "Opgegeven", l0_m: 3 },
      buckling_length_z: { soort: "Opgegeven", l0_m: 2 } };
    mount(<KolomVelden waarde={waarde} lengteMm={6000} overwegendVerticaal onChange={v => saved = v} />);
    equal(input("#kolom-l0").value, "3000", "l0 oude meters");
    equal(input("#kolom-l0-z").value, "2000", "l0z oude meters");
    type(input("#kolom-l0"), "3200,5", true); equal(saved.buckling_length.l0_m, 3.2005, "l0 naar m");
    type(input("#kolom-l0-z"), "2200.5", true); equal(saved.buckling_length_z.l0_m, 2.2005, "l0z naar m");
    saved = undefined; type(input("#kolom-l0"), "-3", true); equal(saved, undefined, "Negatieve l0");
    tests.push("Beton l0 beide assen: oude meterwaarden, komma/punt en negatieve invoer");
  }
  {
    let saved: unknown;
    mount(<LoadCaseTabBar loadCases={[]} loads={[]} activeLoadCaseId={1} setActiveLoadCaseId={noop}
      addLoadCase={noop} setScheefstandEnabled={noop} scheefstandEnabled scheefstandBron="staal"
      scheefstandHoogteM={3} scheefstandAfgeleideHoogteM={6} setScheefstandHoogteM={v => saved = v} />);
    const h = input('input[inputmode="decimal"]');
    ok(parseFloat(getComputedStyle(h).width) >= 70, "Scheefstandhoogte biedt ruimte voor decimale mm");
    equal(h.value, "3000", "Oude scheefstandhoogte"); equal(h.placeholder, "6000", "Afgeleide hoogte");
    type(h, "4500,5", true); equal(saved, 4.5005, "Hoogte in m opgeslagen");
    type(h, "", true); equal(saved, null, "Leeg = afleiden");
    saved = undefined; type(h, "-1", true); equal(saved, undefined, "Negatieve hoogte geweigerd");
    tests.push("Scheefstandhoogte: mm naar m, leeg en negatief");
  }
  for (const vorm of ["gebouw", "vrijstaandDak"]) {
    let saved: any;
    const instellingen = { ...STANDAARD_WIND_INSTELLINGEN, vorm, positieSpant: "tussenspant",
      hohSpant_m: 5, gebouwlengte_m: 30, afstandTotKopgevel_m: 15, belastingbreedteOverride_m: 4,
      gevelhoogte_m: 3, vrijstaandHoogte_m: 2.5, kolomDoorsnede: "rechthoekig", kolomBreedte_mm: 300, kolomDiepte_mm: 400 };
    const model = {
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 3000, z: 1500 }],
      beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 3, to: 2 }, { id: 3, from: 1, to: 2 }],
      loadCases: [],
    };
    mount(<WindGeneratorDialog open onClose={noop} wind={{
      instellingen, setInstellingen: p => saved = p, modelVersie: 1,
      voorbeeld: () => ({ fouten: [], overige: [], resultaat: genereerWindbelasting(model, instellingen) }),
    }} />);
    ok(container.querySelector(".wgd-schema")?.textContent?.includes("30000 mm"), "Windtekening naast invoer toont gebouwlengte in mm");
    for (const [label, field, old] of [["h.o.h.", "hohSpant_m", "5000"], ["b", "gebouwlengte_m", "30000"],
      [common.wind.distanceShort, "afstandTotKopgevel_m", "15000"], [common.wind.loadWidthShort, "belastingbreedteOverride_m", "4000"],
      ...(vorm === "gebouw" ? [[common.wind.gevelhoogte, "gevelhoogte_m", "3000"]] : [[common.wind.canopyHeight, "vrijstaandHoogte_m", "2500"]])]) {
      const el = rowInput(label);
      ok(parseFloat(getComputedStyle(el).width) >= 80 && parseFloat(getComputedStyle(el).width) < 100,
        "Windlengteveld behoudt compacte vormgeving met ruimte voor mm");
      equal(el.value, old, field + " oude opgeslagen waarde");
      type(el, "6500,5", true); equal(saved[field], 6.5005, field + " mm naar m");
      saved = undefined; type(el, "-1", true); equal(saved, undefined, field + " negatief");
    }
    if (vorm === "vrijstaandDak") {
      const column = [...container.querySelectorAll<HTMLInputElement>("input")].find(el => el.value === "300")!;
      type(column, "350,5", true); equal(saved.kolomBreedte_mm, 350.5, "Kolombreedte blijft mm");
    }
    tests.push("Wind " + vorm + ": alle bouwmaten, oude waarden, negatieve invoer en bestaande mm");
  }
}

run().then(() => {
  document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: null });
}).catch(error => {
  document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(error.stack ?? error) });
});
