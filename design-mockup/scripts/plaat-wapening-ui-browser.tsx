import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import nl from "../src/i18n/locales/nl/check.json";
import en from "../src/i18n/locales/en/check.json";
import de from "../src/i18n/locales/de/check.json";
import fr from "../src/i18n/locales/fr/check.json";
import { PlaatWapeningVenster } from "../src/components/fem/PlaatWapeningVenster";
import type { Plate } from "../src/components/fem/femTypes";
import "../src/themes.css";
import "../src/components/fem/FemProperties.css";

const container = document.getElementById("root")!;
let root = createRoot(container);
let plate: Plate;
let updates: { id: number; patch: Partial<Plate> }[];
const tests: string[] = [], errors: string[] = [];
function ok(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function equal(actual: unknown, expected: unknown, message: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function fixture(): Plate {
  return { id: 17, nodeIds: [1, 2, 3, 4], thickness: 200, materiaal: "C30/37", wapening: {
    staalsoort: "B500B", horizontaal: {
      zijde_1: { diameter_mm: 12, hoh_mm: 100, dekking_mm: 30 },
      zijde_2: { diameter_mm: 10, hoh_mm: 150, dekking_mm: 30 },
    }, verticaal: {
      zijde_1: { diameter_mm: 12, hoh_mm: 100, dekking_mm: 42 },
      zijde_2: { diameter_mm: 10, hoh_mm: 150, dekking_mm: 40 },
    } } };
}
function render() {
  root.render(<PlaatWapeningVenster plate={plate} updatePlate={(id, patch) => {
    updates.push({ id, patch }); plate = { ...plate, ...patch }; render();
  }} />);
}
function mount(value = fixture(), width = 280) {
  flushSync(() => root.unmount()); root = createRoot(container);
  container.style.width = `${width}px`;
  plate = value; updates = []; flushSync(render);
}
function field(label: string, scope: ParentNode = container): HTMLInputElement | HTMLSelectElement {
  const labelElement = [...scope.querySelectorAll<HTMLLabelElement>("label")].find(el => el.textContent === label);
  ok(labelElement?.control, `Gekoppeld label ontbreekt: ${label}`);
  return labelElement.control as HTMLInputElement | HTMLSelectElement;
}
function group(name: string, scope: ParentNode = container) {
  const el = [...scope.querySelectorAll("fieldset")].find(el => el.querySelector(":scope > legend")?.textContent === name);
  ok(el, `Groep ontbreekt: ${name}`); return el;
}
function layer(direction = "Horizontaal", side = "zijde 1") { return group(side, group(direction)); }
function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  flushSync(() => el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })));
}
function description(el: Element) {
  return (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map(id => {
    const message = document.getElementById(id); ok(message, `Ontbrekende fout/hint ${id}`); return message.textContent;
  }).join(" ");
}
function invalid(el: Element, text: RegExp) {
  equal(el.getAttribute("aria-invalid"), "true", "Ongeldig veld is toegankelijk gemarkeerd");
  ok(text.test(description(el)), `Fout bij veld ontbreekt: ${description(el)}`);
}
function test(name: string, run: () => void) {
  try { run(); tests.push(name); } catch (error) { errors.push(`${name}: ${error}`); }
}

async function run() {
  await i18next.use(initReactI18next).init({ lng: "nl", resources: { nl: { check: nl }, en: { check: en }, de: { check: de }, fr: { check: fr } }, defaultNS: "check", initImmediate: false });
  test("alle controls hebben unieke gekoppelde labels, ook bij twee vensters", () => {
    mount();
    flushSync(() => root.render(<><PlaatWapeningVenster plate={plate} /><PlaatWapeningVenster plate={plate} /></>));
    const controls = [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")];
    ok(controls.length > 30, "Vier lagen per venster zichtbaar");
    const ids = controls.map(el => el.id);
    equal(new Set(ids).size, ids.length, "Unieke veld-IDs");
    controls.forEach(el => ok(el.labels?.length && el.labels[0].textContent?.trim(), "Elk veld heeft een zichtbaar label"));
  });
  test("richtingen en zijden schikken naar paneelbreedte zonder horizontale overflow", () => {
    for (const width of [240, 320, 960]) {
      mount(fixture(), width);
      const h = group("Horizontaal").getBoundingClientRect(), v = group("Verticaal").getBoundingClientRect();
      if (width < 600) ok(v.top >= h.bottom, "Richtingen stapelen in zijbalk");
      else ok(Math.abs(v.top - h.top) < 1 && v.left >= h.right, "Richtingen naast elkaar in breed paneel");
      const a = layer().getBoundingClientRect(), b = layer("Horizontaal", "zijde 2").getBoundingClientRect();
      if (width < 600) ok(b.top >= a.bottom, "Zijden stapelen in zijbalk");
      else ok(Math.abs(a.top - b.top) < 1 && b.left >= a.right, "Zijden naast elkaar in breed paneel");
      ok(container.scrollWidth <= width, `Geen overflow bij ${width}px`);
      for (const el of container.querySelectorAll('input[type="number"], select')) {
        const rect = el.getBoundingClientRect();
        ok(rect.width >= 65 && rect.right <= container.getBoundingClientRect().right + 1, "Bruikbare invoerbreedte");
      }
    }
  });
  test("nul en lege staafafstand geven lokale leesbare validatie en herstellen na correctie", () => {
    mount(); change(field("h.o.h. [mm]", layer()), "0");
    invalid(field("h.o.h. [mm]", layer()), /h\.o\.h\..*>\s*0/);
    ok(!container.textContent!.includes("wapening.horizontaal.zijde_1"), "Geen modelpaden zichtbaar");
    ok(!field("h.o.h. [mm]", layer("Verticaal")).hasAttribute("aria-invalid"), "Andere richting blijft geldig");
    change(field("h.o.h. [mm]", layer()), "");
    invalid(field("h.o.h. [mm]", layer()), />\s*0/);
    ok(!("hoh_mm" in plate.wapening!.horizontaal.zijde_1!), "Leeg blijft ontbrekend");
    change(field("h.o.h. [mm]", layer()), "125.5");
    equal(plate.wapening!.horizontaal.zijde_1!.hoh_mm, 125.5, "Millimeters ongewijzigd");
    ok(!container.querySelector('[aria-invalid="true"]'), "Fout verdwijnt");
    equal(updates.at(-1)!.id, 17, "Juiste plaat bijgewerkt");
  });
  test("geometriefouten horen bij de betreffende laag en gekoppelde velden", () => {
    mount(); change(field("h.o.h. [mm]", layer()), "12");
    invalid(field("h.o.h. [mm]", layer()), />.*Ø/);
    ok(!field("h.o.h. [mm]", layer("Verticaal")).hasAttribute("aria-invalid"), "Geen onterechte fout bij andere richting");
    mount(); change(field("Dekking [mm]", layer()), "199");
    invalid(field("Dekking [mm]", layer()), /200/);
    mount(); change(field("Dekking [mm]", layer("Verticaal")), "31");
    invalid(field("Dekking [mm]", layer()), /overlap/i);
    invalid(field("Dekking [mm]", layer("Verticaal")), /overlap/i);
    mount({ ...fixture(), thickness: 100 });
    invalid(field("Dekking [mm]", layer()), /100/);
    invalid(field("Dekking [mm]", layer("Verticaal", "zijde 2")), /100/);
  });
  test("moduswisseling bewaart dekking en andere lagen, en verwijdert oude representatie", () => {
    mount(); const untouched = structuredClone(plate.wapening!.verticaal);
    change(layer().querySelector("select")!, "as");
    equal(plate.wapening!.horizontaal.zijde_1, { dekking_mm: 30, as_mm2_per_m: 0 }, "Geen oppervlakte aangenomen");
    invalid(field("A_s [mm²/m]", layer()), />\s*0/);
    change(field("A_s [mm²/m]", layer()), "850.5");
    equal(plate.wapening!.horizontaal.zijde_1, { dekking_mm: 30, as_mm2_per_m: 850.5 }, "Oppervlak exact");
    change(layer().querySelector("select")!, "staaf");
    equal(plate.wapening!.horizontaal.zijde_1, { dekking_mm: 30 }, "Diameter niet aangenomen");
    invalid(field("Ø [mm]", layer()), />\s*0/);
    invalid(field("h.o.h. [mm]", layer()), />\s*0/);
    change(layer().querySelector("select")!, "geen");
    ok(!plate.wapening!.horizontaal.zijde_1, "Laag verwijderd");
    equal(plate.wapening!.verticaal, untouched, "Andere richting intact");
  });
  test("diktevalidatie bij oppervlakte-invoer suggereert geen onbekende staafdiameter", () => {
    const p = fixture();
    p.wapening!.horizontaal = { zijde_1: { as_mm2_per_m: 800, dekking_mm: 200 } };
    p.wapening!.verticaal = {};
    mount(p);
    invalid(field("Dekking [mm]", layer()), /200/);
    ok(!description(field("Dekking [mm]", layer())).includes("Ø"), "Geen diameter in oppervlakte-invoer aangenomen");
    p.wapening!.horizontaal = {
      zijde_1: { as_mm2_per_m: 800, dekking_mm: 110 },
      zijde_2: { as_mm2_per_m: 800, dekking_mm: 100 },
    };
    mount(p);
    invalid(field("Dekking [mm]", layer()), /200/);
    ok(!description(field("Dekking [mm]", layer())).includes("Ø"), "Beide zijden zonder diameter beoordeeld");
  });
  test("inschakelen en optionele scheurbasis vullen geen normwaarden in", () => {
    mount({ ...fixture(), wapening: undefined });
    flushSync(() => field("Aanwezige wapening").click());
    equal(plate.wapening, { staalsoort: "B500B", horizontaal: {}, verticaal: {} }, "Lege expliciete basis");
    change(field("Milieuklasse"), "XC3"); change(field("Milieuklasse"), "");
    change(field("Belastingsduur"), "false"); equal(plate.wapening!.langdurend, false, "Kortdurend is false");
    change(field("Belastingsduur"), "");
    change(field("Aanhechting"), "true"); change(field("Aanhechting"), "");
    change(field("Treksterkte bij scheuren [N/mm²]"), "-1");
    invalid(field("Treksterkte bij scheuren [N/mm²]"), />\s*0/);
    change(field("Treksterkte bij scheuren [N/mm²]"), "");
    equal(plate.wapening, { staalsoort: "B500B", horizontaal: {}, verticaal: {} }, "Optionele waarden verwijderd");
    flushSync(() => field("Aanwezige wapening").click()); equal(plate.wapening, undefined, "Uitschakelen verwijdert basis");
  });
  for (const [language, labels] of Object.entries({ nl: nl.props.plate.wapening, en: en.props.plate.wapening, de: de.props.plate.wapening, fr: fr.props.plate.wapening })) {
    await i18next.changeLanguage(language);
    test(`${language}: gelokaliseerde labels en veldfouten passen in smal paneel`, () => {
      const p = fixture(); p.wapening!.horizontaal.zijde_1!.hoh_mm = 0; mount(p, 240);
      const face = group(labels.zijde_1, group(labels.horizontaal));
      invalid(field(labels.hoh, face), />\s*0/);
      ok(description(field(labels.hoh, face)).includes(labels.hoh), "Fout gebruikt vertaald veldlabel");
      ok(!/props\.plate\.|wapening\.|zijde_|hoh_mm|positief getal/.test(container.textContent!), "Geen sleutels of Nederlandstalige modelmelding");
      ok(container.scrollWidth <= 240, "Vertaling past");
    });
    test(`${language}: conflicterende opgaven verwijzen naar de invoerkeuze`, () => {
      const p = fixture(); p.wapening!.horizontaal.zijde_1!.as_mm2_per_m = 900; mount(p);
      const face = group(labels.zijde_1, group(labels.horizontaal));
      const choice = face.querySelector("select")!;
      invalid(choice, /mm²\/m/);
      ok(!/profile\.|profilePicker\.|props\./.test(description(choice)), "Keuzehulp volledig vertaald");
      change(choice, "staaf");
      ok(!("as_mm2_per_m" in plate.wapening!.horizontaal.zijde_1!), "Conflicterend oppervlak verwijderd");
    });
  }
}
run().catch(error => errors.push(String(error.stack ?? error))).finally(() => {
  document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, errors });
});
