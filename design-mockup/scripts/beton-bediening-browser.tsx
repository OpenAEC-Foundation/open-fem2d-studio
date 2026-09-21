import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../src/i18n/locales/nl/common.json";
import check from "../src/i18n/locales/nl/check.json";
import BetonStaafVenster from "../src/components/beton/dekking/BetonStaafVenster";
import type { Beam } from "../src/components/fem/femTypes";
import type { ReinforcementZones } from "../src/lib/types/concrete/ReinforcementZones";
import * as zonesModel from "../src/components/beton/dekking/zoneModel";
import MnKappaDialoog, { krachtenOpSnede } from "../src/components/beton/MnKappaDialoog";
import { STANDAARD_KORF } from "../src/components/beton/wapeningskorf";
import { useFemStore } from "../src/hooks/useFemStore";
import { useCheckStore } from "../src/stores/checkStore";
import FemCanvas from "../src/components/fem/FemCanvas";
import { DEFAULT_GRID } from "../src/components/fem/femTypes";

const host = document.getElementById("test-root")!;
let root = createRoot(host);
const tests: { name: string; error?: string }[] = [];
function ok(v: unknown, why: string) { if (!v) throw Error(why); }
function equal(a: unknown, b: unknown) { ok(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
const wait = () => new Promise(r => setTimeout(r, 20));
function click(el: Element | null) { ok(el, "Klikdoel ontbreekt"); flushSync(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
function type(el: HTMLInputElement, value: string) {
  ok(el, "Invoerveld ontbreekt");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  flushSync(() => el.dispatchEvent(new Event("input", { bubbles: true })));
}
function button(text: string) { return [...document.querySelectorAll("button")].find(b => b.textContent?.includes(text)) ?? null; }
function curve() { return document.querySelector<HTMLElement>('.dek-mnkappa'); }
const cage = { cover_mm: 30, stirrup_diameter_mm: 8, bottom: { count: 3, diameter_mm: 16 }, top: { count: 2, diameter_mm: 12 }, stirrup_spacing_mm: 200, stirrup_legs: 2 };
const longitudinal = (count: number, start: number, end: number) => ({ side: "Bottom" as const, row: { count, diameter_mm: 16 }, x_start_mm: start, x_end_mm: end, bar_shape: "Recht" as const, casting_position: "Onderzijde" as const });
const zones: ReinforcementZones = { longitudinal: [longitudinal(3, 0, 2000), longitudinal(5, 2000, 6000)], stirrups: [
  { x_start_mm: 0, x_end_mm: 2000, diameter_mm: 8, spacing_mm: 100, legs: 2 },
  { x_start_mm: 2000, x_end_mm: 6000, diameter_mm: 8, spacing_mm: 200, legs: 2 }] };
let changes: Partial<Beam>[] = [];
let current: Beam;
const requests: any[] = [];
let pending: ((r: Response) => void)[] | null = null;
const linePending = new Map<string, ((r: Response) => void)[]>();
// Alleen de externe kernelgrens wordt vervangen; de editor en zijn model draaien echt.
window.fetch = async (_url, init) => {
  const req = JSON.parse(String(init?.body ?? "{}"));
  requests.push(req);
  if (linePending.has(req.opdracht)) return new Promise(resolve => linePending.get(req.opdracht)!.push(resolve));
  if (pending && req.opdracht === "concrete_mn_kappa") return new Promise(resolve => pending!.push(resolve));
  return new Response(JSON.stringify(req.opdracht === "list_concrete_classes" ? [{ name: "C30/37" }] : { fout: "test-kernantwoord" }), { status: req.opdracht === "list_concrete_classes" ? 200 : 400 });
};
function Fixture({ initial }: { initial: Beam }) {
  const [beam, setBeam] = useState(initial);
  const [actual, setActual] = useState<any>(null); setCurrentResults = setActual;
  current = beam;
  return <BetonStaafVenster beam={beam} nodes={[{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }]} supports={[]} actueleCombinatieResultaten={actual} updateBeam={(_id, patch) => { changes.push(patch); setBeam(b => ({ ...b, ...patch })); }} />;
}
let setCurrentResults: (value: any) => void;
function mount(z: ReinforcementZones | undefined = zones, reverse = false) {
  flushSync(() => root.unmount()); root = createRoot(host); changes = []; requests.length = 0;
  host.style.width = "1100px";
  flushSync(() => root.render(<Fixture initial={{ id: 1, from: reverse ? 2 : 1, to: reverse ? 1 : 2, profile: "300x600", material: "C30/37", checkConfig: { betonKorf: cage, betonZones: z } }} />));
}
function pointer(el: Element, event: string, mm: number) {
  const svg = host.querySelector<SVGSVGElement>(".dek-aanzicht")!;
  const r = svg.getBoundingClientRect(); const w = svg.viewBox.baseVal.width;
  flushSync(() => el.dispatchEvent(new PointerEvent(event, { bubbles: true, pointerId: 1, button: 0, clientX: r.left + (8 + mm / 6000 * (w - 22)) / w * r.width })));
}
function pickZone(kind = "langs", index = 1) { click(host.querySelector(`[data-zone="${kind}-${index}"]`)); }
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
let realStore: ReturnType<typeof useFemStore>;
function UndoFixture({ withCanvas = false }: { withCanvas?: boolean }) {
  const store = useFemStore(); realStore = store;
  useEffect(() => { store.loadProjectState({ nodes, beams: [{ id: 1, from: 1, to: 2, profile: "300x600", material: "C30/37", checkConfig: { betonKorf: cage, betonZones: zones } }], supports: [], plates: [], loads: [], loadCases: [], activeLoadCaseId: 1 }); store.setSelection({ type: "beam", id: 1 }); }, []);
  return <>{withCanvas && <div style={{ height: 180 }}><FemCanvas {...store} tool="select" grid={DEFAULT_GRID} /></div>}
    {store.beams[0] && store.selection ? <BetonStaafVenster beam={store.beams[0]} nodes={store.nodes} supports={[]} updateBeam={store.updateBeam} /> : null}</>;
}
const force = (combo: number, x: number, n: number, m = 10) => ({ combination_id: combo, position_mm: x, forces: { n_ed: n, my_ed: m, vy_ed: 0, vz_ed: 0, mt_ed: 0, mz_ed: 0 } });
function seedRun() {
  const result = { displacements: new Map(), reactions: new Map(), maxDisplacement: 0, elements: new Map([[1, {
    N: -100000, V: 0, M_start: 1e7, M_end: 1e7, L_mm: 6000, stations_mm: [0, 6000], normalForce: [-100000, -200000],
    shearForce: [0, 0], bendingMoment: [1e7, 1e7], deflection: [0, 0], axialDisp: [0, 0] }]]) };
  const map = new Map([[7, result], [8, result]]);
  flushSync(() => { useCheckStore.setState({ lastRunData: { nodes, beams: [current], combinations: [
    { id: 7, type: "uls", name: "UGT", formula: "", factors: {} }, { id: 8, type: "sls", name: "frequent", formula: "", factors: {} }], combinationResults: map } }); setCurrentResults(map); });
  return map;
}
async function test(name: string, run: () => void | Promise<void>) { try { await run(); tests.push({ name }); } catch (e) { tests.push({ name, error: String(e) }); } }
async function run() {
  await i18next.use(initReactI18next).init({ lng: "nl", resources: { nl: { common, check } }, defaultNS: "common", initImmediate: false });
  await test("Gedeelde grens verplaatst beide buren, begrensd, zonder invoermutatie", () => {
    const original = JSON.stringify(zones);
    const move = (zonesModel as any).verplaatsZoneGrens;
    ok(move, "verplaatsZoneGrens ontbreekt");
    const result = move(zones, { soort: "langs", index: 0 }, "end", 3500, 6000);
    equal(result.longitudinal.map((z: any) => [z.x_start_mm, z.x_end_mm]), [[0, 3500], [3500, 6000]]);
    const bounded = move(zones, { soort: "langs", index: 0 }, "end", 99999, 6000);
    equal(bounded.longitudinal.map((z: any) => [z.x_start_mm, z.x_end_mm]), [[0, 5999], [5999, 6000]]);
    equal(JSON.stringify(zones), original);
  });
  await test("Inkorten buitenrand maakt expliciet lege rij zonder basiskorfterugval", () => {
    const move = (zonesModel as any).verplaatsZoneGrens; ok(move, "Grensbewerking ontbreekt");
    const result = move({ longitudinal: [longitudinal(3, 0, 6000)], stirrups: [] }, { soort: "langs", index: 0 }, "start", 1000, 6000);
    equal(zonesModel.korfOpX(cage, result, 500).bottom.count, 0);
    equal(zonesModel.korfOpX(cage, result, 2000).bottom.count, 3);
  });
  await test("Staafcirkel selecteert hele lokale rij; opslaan wijzigt alleen actieve zone", () => {
    mount(); pickZone();
    click(host.querySelector('.dek-doorsnede circle[data-rij="bottom"]'));
    equal(host.querySelectorAll('.dek-doorsnede circle[aria-pressed="true"]').length, 5);
    const input = host.querySelector<HTMLInputElement>('.beton-rijbewerker input')!;
    equal(input?.value, "5"); type(input, "6");
    const form = host.querySelector(".beton-rijbewerker")!;
    flushSync(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    equal(changes.length, 1); equal(current.checkConfig?.betonKorf, cage);
    equal(current.checkConfig?.betonZones?.longitudinal.map(z => z.row.count), [3, 6]);
    ok(host.querySelector('[role="status"]')?.textContent?.includes("2000"), "Geselecteerde zone niet getoond");
  });
  for (const kind of ["langs", "beugel"]) {
    await test(`${kind}: slepen preview, loslaten precies één modelwijziging`, () => {
      mount(); pickZone(kind, 0);
      const handle = host.querySelector('[data-zone-edge="end"]')!; ok(handle, "Eindgreep ontbreekt");
      pointer(handle, "pointerdown", 2000); pointer(handle, "pointermove", 3000);
      equal(changes.length, 0);
      equal(Number(host.querySelector('[data-zone-edge="end"]')?.getAttribute("aria-valuenow")), 3000);
      pointer(handle, "pointerup", 3000); equal(changes.length, 1);
      const list = kind === "langs" ? current.checkConfig!.betonZones!.longitudinal : current.checkConfig!.betonZones!.stirrups;
      equal(list.map(z => [z.x_start_mm, z.x_end_mm]), [[0, 3000], [3000, 6000]]);
    });
  }
  for (const cancel of ["Escape", "pointercancel"]) {
    await test(`${cancel} annuleert zonder modelwijziging`, () => {
      mount(); pickZone("langs", 0); const h = host.querySelector('[data-zone-edge="end"]')!; ok(h, "Greep ontbreekt");
      pointer(h, "pointerdown", 2000); pointer(h, "pointermove", 3500);
      if (cancel === "Escape") flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      else pointer(h, "pointercancel", 3500);
      equal(changes.length, 0);
      equal(Number(host.querySelector('[data-zone-edge="end"]')?.getAttribute("aria-valuenow")), 2000);
    });
  }
  await test("Plusknop gebruikt lokale rij; cursor verplaatst geselecteerde zone", () => {
    mount(); pickZone("langs", 0);
    const svg = host.querySelector<SVGSVGElement>(".dek-aanzicht")!;
    const r = svg.getBoundingClientRect(); const w = svg.viewBox.baseVal.width;
    flushSync(() => svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + (8 + 4500 / 6000 * (w - 22)) / w * r.width })));
    ok(host.querySelector('.dek-selectie')?.textContent?.includes("2000–6000"), "Selectie bleef op oude zone");
    const plus = [...host.querySelectorAll('.dek-doorsnede .beton-rijknop')].find(el => el.querySelector('title')?.textContent?.toLowerCase().includes('onder') && el.textContent?.endsWith('+'));
    click(plus ?? null); equal(current.checkConfig?.betonZones?.longitudinal.map(z => z.row.count), [3, 6]); equal(current.checkConfig?.betonKorf, cage);
  });
  await test("Omgekeerde staaf schrijft gedeelde grens één keer gespiegeld terug", () => {
    mount(zones, true); pickZone("langs", 0);
    const h = host.querySelector('[data-zone-edge="end"]')!;
    pointer(h, "pointerdown", 4000); pointer(h, "pointermove", 3000); pointer(h, "pointerup", 3000);
    equal(changes.length, 1); equal(current.checkConfig?.betonZones?.longitudinal.map(z => [z.x_start_mm, z.x_end_mm, z.row.count]), [[0, 3000, 3], [3000, 6000, 5]]);
  });
  await test("Basiskorf inkorten bewaart lege zone; onbewogen greep maakt geen undo", () => {
    mount({ longitudinal: [], stirrups: [] }); pickZone("langs", 0);
    let h = host.querySelector('[data-zone-edge="start"]')!;
    pointer(h, "pointerdown", 0); pointer(h, "pointerup", 0); equal(changes.length, 0);
    pointer(h, "pointerdown", 0); pointer(h, "pointermove", 1000); pointer(h, "pointerup", 1000);
    equal(changes.length, 1); equal(zonesModel.korfOpX(cage, current.checkConfig?.betonZones, 500).bottom.count, 0);
    equal(zonesModel.korfOpX(cage, current.checkConfig?.betonZones, 2000).bottom.count, 3);
    equal(current.checkConfig?.betonZones?.stirrups, []);
  });
  await test("Echte modelhistorie: preview geen undo, commit één undo, redo herstelt beide buren", async () => {
    flushSync(() => root.unmount()); root = createRoot(host);
    flushSync(() => root.render(<UndoFixture />)); await wait();
    ok(!realStore.canUndo, "Fixture start niet met lege historie");
    pickZone("langs", 0); const h = host.querySelector('[data-zone-edge="end"]')!;
    pointer(h, "pointerdown", 2000); pointer(h, "pointermove", 2500); pointer(h, "pointermove", 3000);
    ok(!realStore.canUndo, "Preview creëert historie"); pointer(h, "pointerup", 3000);
    ok(realStore.canUndo, "Commit ontbreekt"); flushSync(() => realStore.undo());
    equal(realStore.beams[0].checkConfig?.betonZones, zones); ok(!realStore.canUndo, "Meer dan één undo nodig");
    flushSync(() => realStore.redo()); equal(realStore.beams[0].checkConfig?.betonZones?.longitudinal.map(z => [z.x_start_mm, z.x_end_mm]), [[0, 3000], [3000, 6000]]);
  });
  await test("Snedekrachten blijven combinatiegebonden, geen extrapolatie of gemiddelde over sprong", () => {
    equal(krachtenOpSnede([force(1, 0, -100), force(1, 6000, -200), force(2, 0, 300), force(2, 6000, 500)], 3000).map(p => [p.combinatie, p.n]), [[1, -150], [2, 400]]);
    equal(krachtenOpSnede([force(1, 1000, -100), force(1, 6000, -200)], 0), []);
    equal(krachtenOpSnede([force(1, 2000, -100), force(1, 2000, -200)], 2000).map(p => p.n), [-100, -200]);
  });
  await test("M-κ gebruikt expliciete N en exacte lokale korf, geen stille nul", async () => {
    mount(); pickZone(); click(button("M-κ")); await wait();
    const dialog = curve(); ok(dialog, "M-κ dialoog ontbreekt");
    const input = dialog!.querySelector<HTMLInputElement>('input[name="n-ed"]')!;
    equal(input?.value, ""); ok(input.labels?.length, "N heeft geen label");
    equal(requests.filter(r => r.opdracht === "concrete_mn_kappa").length, 0);
    type(input, "-125"); click(button("Berekenen")); await wait();
    const req = requests.find(r => r.opdracht === "concrete_mn_kappa"); ok(req, "Kernel niet aangeroepen");
    equal(req.inputs.n_ed_kn, -125); equal(req.inputs.cage, { ...cage, bottom: { count: 5, diameter_mm: 16 } }); equal(req.inputs.section.h_mm, 600);
    ok(dialog!.textContent?.includes("test-kernantwoord"), "Kernfout niet zichtbaar");
  });
  await test("M-κ vult eenduidige actuele N en rekent direct, maar vraagt keuze bij meerdere combinaties", async () => {
    const show = (forces: ReturnType<typeof force>[]) => {
      flushSync(() => root.unmount()); root = createRoot(host);
      flushSync(() => root.render(<MnKappaDialoog korf={{ ...STANDAARD_KORF, korf: cage }} xMm={3000} forces={forces} bijlage="NL" onSluiten={() => {}} />));
    };
    show([force(7, 0, -100), force(7, 6000, -200)]);
    requests.length = 0;
    await wait();
    equal(curve()?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.value, "-150");
    ok(curve()?.textContent?.includes("geïnterpoleerd"), "Interpolatiebron onzichtbaar");
    ok(requests.some(r => r.opdracht === "concrete_mn_kappa"), "Eenduidige actuele N start geen diagram");
    show([force(7, 3000, -150), force(8, 3000, 250)]);
    equal(curve()?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.value, "");
  });
  await test("M-κ verouderd antwoord na N-wijziging blijft verborgen; sluiten herstelt focus", async () => {
    pending = []; mount(); pickZone(); const opener = button("M-κ")!; opener.focus(); click(opener);
    const n = curve()!.querySelector<HTMLInputElement>('input[name="n-ed"]')!;
    type(n, "-50"); click(button("Berekenen")); await wait(); equal(pending.length, 1);
    type(n, "-100"); pending[0](new Response(JSON.stringify({ fout: "verouderd-diagram" }), { status: 400 })); await wait();
    ok(!curve()?.textContent?.includes("verouderd-diagram"), "Verouderd kernantwoord getoond");
    click(curve()!.querySelector('button'));
    ok(!curve(), "Dialoog niet gesloten"); ok(document.activeElement === opener, "Focus niet hersteld"); pending = null;
  });
  await test("M-κ trekt oude N direct in wanneer actuele rekengeneratie ontbreekt", async () => {
    mount(); seedRun(); pickZone(); click(button("M-κ")); await wait();
    equal(curve()?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.value, String(-100 - 4000 / 6000 * 100));
    flushSync(() => setCurrentResults(null)); await wait();
    equal(curve()?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.value, "");
    useCheckStore.setState({ lastRunData: null });
  });
  for (const action of ["clear", "zones", "unmount"]) {
    await test(`Laat dekkingslijnantwoord na ${action} kan niet terugkomen`, async () => {
      mount(); linePending.set("concrete_dekkingslijn", []); seedRun();
      await new Promise(r => setTimeout(r, 300));
      const queue = linePending.get("concrete_dekkingslijn")!; ok(queue.length > 0, "Geen dekkingslijnverzoek");
      if (action === "clear") flushSync(() => useCheckStore.setState({ lastRunData: null }));
      else if (action === "zones") { pickZone(); click(host.querySelector('.dek-doorsnede circle[data-rij="bottom"]')); type(host.querySelector<HTMLInputElement>('.beton-rijbewerker input')!, "6"); flushSync(() => host.querySelector('form.beton-rijbewerker')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
      else flushSync(() => root.render(<div />));
      for (const resolve of queue) resolve(new Response(JSON.stringify({ fout: "oude-dekkingslijn" }), { status: 400 }));
      await wait(); ok(!host.textContent?.includes("oude-dekkingslijn"), "Verouderde fout teruggekeerd");
      const { useDekkingslijnStore } = await import("../src/stores/dekkingslijnStore");
      ok(useDekkingslijnStore.getState().fout !== "oude-dekkingslijn", "Verouderde uitkomst in gedeelde store");
      linePending.clear(); useCheckStore.setState({ lastRunData: null });
    });
  }
  await test("Scheurlaag uit tijdens berekenen negeert laat antwoord en stopt bezigmeter", async () => {
    mount(); linePending.set("check_concrete_beams", []); seedRun();
    click(button("Scheurwijdte")); await wait();
    const queue = linePending.get("check_concrete_beams")!; ok(queue.length > 0, "Geen scheurverzoek");
    click(button("Scheurwijdte"));
    for (const resolve of queue) resolve(new Response(JSON.stringify({ fout: "oude-scheurlijn" }), { status: 400 }));
    await wait(); ok(!host.textContent?.includes("oude-scheurlijn"), "Verouderde scheurfout getoond");
    ok(!host.querySelector('.dek-bezig'), "Bezigmeter blijft staan"); linePending.clear(); useCheckStore.setState({ lastRunData: null });
  });
  await test("M-κ nieuwe forcebron actualiseert N en weigert oud antwoord zonder remount", async () => {
    flushSync(() => root.unmount()); root = createRoot(host); pending = [];
    const show = (n: number) => flushSync(() => root.render(<MnKappaDialoog korf={{ ...STANDAARD_KORF, korf: cage }} xMm={3000} forces={[force(7, 3000, n)]} bijlage="NL" onSluiten={() => {}} />));
    show(-100); await wait(); equal(pending.length, 1);
    show(-250); await wait();
    equal(curve()?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.value, "-250");
    pending[0](new Response(JSON.stringify({ fout: "oude-forcebron" }), { status: 400 })); await wait();
    ok(!curve()?.textContent?.includes("oude-forcebron"), "Oud antwoord geaccepteerd"); pending = null;
  });
  await test("M-κ ongewijzigde bron blijft geldig bij nieuwe sluitcallback", async () => {
    flushSync(() => root.unmount()); root = createRoot(host); pending = [];
    const show = () => flushSync(() => root.render(<MnKappaDialoog korf={{ ...STANDAARD_KORF, korf: cage }} xMm={3000} forces={[force(7, 3000, -100)]} bijlage="NL" onSluiten={() => {}} />));
    show(); await wait(); equal(pending.length, 1); show();
    pending[0](new Response(JSON.stringify({ fout: "actuele-kernmelding" }), { status: 400 })); await wait();
    ok(curve()?.textContent?.includes("actuele-kernmelding"), "Actueel antwoord ten onrechte verworpen"); pending = null;
  });
  for (const key of ["Delete", "Backspace", "Escape"]) {
    await test(`Echte canvas-hotkey ${key} blijft geblokkeerd binnen M-κ`, async () => {
      flushSync(() => root.unmount()); root = createRoot(host); flushSync(() => root.render(<UndoFixture withCanvas />)); await wait();
      click(button("M-κ")); const close = curve()!.querySelector<HTMLButtonElement>('button')!; close.focus();
      flushSync(() => close.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
      equal(realStore.beams.length, 1); ok(realStore.selection, "Canvasselectie gewist");
      if (key === "Escape") ok(!curve(), "Escape sluit M-κ niet");
    });
  }
  await test("Escape tijdens zonegreep stopt vóór echte canvas-hotkeys", async () => {
    flushSync(() => root.unmount()); root = createRoot(host); flushSync(() => root.render(<UndoFixture withCanvas />)); await wait();
    pickZone("langs", 0); const h = host.querySelector('[data-zone-edge="end"]')!;
    pointer(h, "pointerdown", 2000); pointer(h, "pointermove", 3000);
    flushSync(() => h.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    ok(realStore.selection, "Canvasselectie gewist"); ok(!realStore.canUndo, "Escape maakte modelwijziging");
    equal(Number(host.querySelector('[data-zone-edge="end"]')?.getAttribute('aria-valuenow')), 2000);
  });
}
run().then(() => { document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: null }); }).catch(e => { document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(e) }); });
