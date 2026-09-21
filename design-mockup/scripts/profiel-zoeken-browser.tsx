// Browserkant van test-profiel-zoeken-ui.mjs: de echte ProfielKiezer in
// Chromium, met het zoekveld, de toetsen en "In dit project" (issue #39).
//
// Drie standen, gekozen met het fragment van de URL:
//   (geen)        de interactietests op volle breedte;
//   #smal         de controles die een smal venster nodig hebben (de media
//                 query kijkt naar het venster, niet naar een container);
//   #beeld-…      geen tests: zet één toestand op het scherm voor een
//                 schermafbeelding, bv. #beeld-donker-zoek.
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import commonNl from "../src/i18n/locales/nl/common.json";
import checkNl from "../src/i18n/locales/nl/check.json";
import commonEn from "../src/i18n/locales/en/common.json";
import checkEn from "../src/i18n/locales/en/check.json";
import ProfielKiezer, { type ProfielKeuze, type ProfielInGebruik } from "../src/components/fem/ProfielKiezer";
import { eigenDoorsnedenStore } from "../src/lib/profieleditor/eigenDoorsnedenStore";
import type { EigenDoorsnede } from "../src/lib/profieleditor/types";

const tests: { name: string; error?: string }[] = [];
const host = document.getElementById("test-root")!;
let root = createRoot(host);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function ok(value: unknown, message: string) { if (!value) throw Error(message); }
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); tests.push({ name }); } catch (error) { tests.push({ name, error: String(error) }); }
}

// Wat er "in dit project" staat: staal, hout, beton en een vrij materiaal door
// elkaar, zodat te zien is dat een stap alleen het zijne toont.
const IN_GEBRUIK: ProfielInGebruik[] = [
  { material: "S235", profile: "HEA160", aantal: 4 },
  { material: "S355", profile: "HEB240", aantal: 2 },
  { material: "S235", profile: "IPE300", aantal: 6 },
  { material: "C24", profile: "71x171", aantal: 12 },
  { material: "C30/37", profile: "300x500", aantal: 3 },
];

let toegepast: ProfielKeuze[] = [];
let gesloten = 0;
/** `null` = een staaf zonder keuze: de kiezer begint dan bij de materiaalstap. */
function mount(huidig: Partial<ProfielKeuze> | null = { material: "S235", profile: "HEA160" }) {
  flushSync(() => root.unmount());
  toegepast = [];
  gesloten = 0;
  root = createRoot(host);
  flushSync(() => root.render(
    <ProfielKiezer
      open
      huidig={huidig ?? undefined}
      inGebruik={IN_GEBRUIK}
      onApply={(k) => { toegepast.push(k); }}
      onClose={() => { gesloten += 1; }}
    />,
  ));
}
// De dialoog staat in een portaal op <body>, niet in de testwortel.
const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector);
const qa = <T extends Element = HTMLElement>(selector: string) => [...document.body.querySelectorAll<T>(selector)];
const zoekveld = () => q<HTMLInputElement>(".pk-kopbalk .pk-zoek-invoer")!;
function typ(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  flushSync(() => el.dispatchEvent(new Event("input", { bubbles: true })));
}
function toets(el: Element, key: string) {
  flushSync(() => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
}
const klik = (el: Element | null | undefined, wat: string) => {
  ok(el, `Ontbreekt: ${wat}`);
  flushSync(() => (el as HTMLElement).click());
};
const opties = () => qa(".pk-kolom-maat [role=option]").map((el) => el.textContent ?? "");
const groepen = () => qa(".pk-groep-kop .pk-rij-tekst").map((el) => el.textContent ?? "");
const samenvatting = () => q(".pk-samenvatting")?.textContent ?? "";

async function breed() {
  await test("Opent in de staalstap met de focus in het zoekveld, met label en combobox-rol", () => {
    mount();
    const veld = zoekveld();
    ok(veld, "Zoekveld ontbreekt");
    ok(document.activeElement === veld, `Focus staat op ${document.activeElement?.tagName}.${document.activeElement?.className}`);
    const label = q<HTMLLabelElement>(`label[for="${veld.id}"]`);
    ok(label?.textContent === "Zoek profiel", `Label: ${label?.textContent}`);
    ok(veld.getAttribute("role") === "combobox", "Geen combobox");
    ok(document.getElementById(veld.getAttribute("aria-controls") ?? "")?.getAttribute("role") === "listbox", "aria-controls wijst niet naar de listbox");
  });

  await test("Zonder zoekterm werkt de stap per reeks, zonder tellingen of reekskoppen", () => {
    mount();
    ok(opties().length > 5 && opties().every((n) => n.startsWith("HEA")), `Lijst: ${opties().slice(0, 4).join(", ")}`);
    ok(groepen().length === 0, "Reekskop zonder zoekterm");
    ok(qa(".pk-kolom-reeks .pk-telling").length === 0, "Telling zonder zoekterm");
    ok(q(".pk-zoek-status")?.textContent?.includes("Enter"), "Toetsenhulp ontbreekt");
    klik(qa(".pk-kolom-reeks .pk-rij").find((el) => el.textContent === "IPE"), "reeks IPE");
    ok(opties().every((n) => n.startsWith("IPE")), "Reeksklik wisselt de lijst niet");
  });

  await test("'160' geeft treffers uit alle reeksen, per reeks gegroepeerd, oude reeksen onderaan", () => {
    mount();
    typ(zoekveld(), "160");
    const g = groepen();
    for (const reeks of ["IPE", "HEA", "HEB", "HEM"]) ok(g.includes(reeks), `Reeks ${reeks} ontbreekt in ${g.join(" | ")}`);
    for (const naam of ["IPE 160", "HEA 160", "HEB 160"]) ok(opties().includes(naam), `${naam} ontbreekt`);
    const eersteOud = g.findIndex((x) => x.includes("(oud)"));
    ok(eersteOud > 0, `Geen oude reeks in de treffers: ${g.join(" | ")}`);
    ok(g.slice(eersteOud).every((x) => x.includes("(oud)")), `Gangbare reeks ná een oude: ${g.join(" | ")}`);
    const status = q(".pk-zoek-status")!;
    ok(status.getAttribute("role") === "status", "Status is geen live-regio");
    ok(status.textContent === `${opties().length} treffers`, `Status: ${status.textContent} bij ${opties().length} rijen`);
  });

  await test("De reekskolom telt de treffers; een reeks zonder treffers is niet te kiezen", () => {
    mount();
    typ(zoekveld(), "hea 160");
    const rijen = qa<HTMLButtonElement>(".pk-kolom-reeks .pk-rij");
    ok(rijen[0].textContent?.startsWith("Alle reeksen") && rijen[0].querySelector(".pk-telling")?.textContent === "1", `Eerste rij: ${rijen[0].textContent}`);
    const hea = rijen.find((el) => el.querySelector(".pk-rij-tekst")?.textContent === "HEA")!;
    const ipe = rijen.find((el) => el.querySelector(".pk-rij-tekst")?.textContent === "IPE")!;
    ok(hea.querySelector(".pk-telling")?.textContent === "1" && !hea.disabled, "HEA telt niet 1");
    ok(ipe.querySelector(".pk-telling")?.textContent === "0" && ipe.disabled, "IPE zonder treffers is kiesbaar");
    ok(hea.getAttribute("aria-label") === "HEA: 1 treffer", `aria-label: ${hea.getAttribute("aria-label")}`);
  });

  await test("Hoofdletters en spaties maken geen verschil", () => {
    mount();
    const uitslagen = ["hea160", "HEA 160", "  hEa   160 "].map((term) => { typ(zoekveld(), term); return opties().join(","); });
    ok(uitslagen.every((u) => u === "HEA 160"), uitslagen.join(" / "));
  });

  await test("Een klik op een reeks versmalt de treffers; 'Alle reeksen' zet ze terug", () => {
    mount();
    typ(zoekveld(), "160");
    const alle = opties().length;
    klik(qa(".pk-kolom-reeks .pk-rij").find((el) => el.querySelector(".pk-rij-tekst")?.textContent === "HEB"), "reeks HEB");
    ok(opties().join() === "HEB 160", `Na HEB: ${opties().join()}`);
    ok(q(".pk-zoek-status")?.textContent === "1 treffer", `Status: ${q(".pk-zoek-status")?.textContent}`);
    klik(qa(".pk-kolom-reeks .pk-rij")[0], "Alle reeksen");
    ok(opties().length === alle, "Alle reeksen herstelt de lijst niet");
  });

  await test("Pijltjes lopen door de treffers, Enter kiest, nogmaals Enter past toe", () => {
    // Een staaf met IPE 300: geen van de treffers op "160" is dan al gekozen,
    // zodat de eerste Enter aantoonbaar kiest en niet toepast.
    mount({ material: "S235", profile: "IPE300" });
    const veld = zoekveld();
    typ(veld, "160");
    const eerste = opties()[0];
    const actief = () => document.getElementById(veld.getAttribute("aria-activedescendant") ?? "");
    ok(actief()?.textContent === eerste && actief()?.classList.contains("gemarkeerd"), `Eerste treffer niet gemarkeerd: ${actief()?.textContent}`);
    toets(veld, "ArrowDown");
    ok(actief()?.textContent === opties()[1], `Na omlaag: ${actief()?.textContent}`);
    toets(veld, "ArrowUp");
    toets(veld, "ArrowUp");
    ok(actief()?.textContent === eerste, "Omhoog klemt niet op de eerste");
    toets(veld, "ArrowDown");
    const gekozen = actief()!.textContent!;
    toets(veld, "Enter");
    ok(toegepast.length === 0 && gesloten === 0, "Eerste Enter paste al toe");
    ok(actief()?.getAttribute("aria-selected") === "true", "Enter koos de rij niet");
    ok(samenvatting().includes(gekozen.replace(" ", "")), `Samenvatting: ${samenvatting()}`);
    ok(document.activeElement === veld, "Focus verliet het zoekveld");
    toets(veld, "Enter");
    ok(toegepast.length === 1 && gesloten === 1, `Tweede Enter: ${toegepast.length} toegepast, ${gesloten} gesloten`);
    ok(toegepast[0].profile === gekozen.replace(" ", "") && toegepast[0].material === "S235" && toegepast[0].profileEnd === undefined,
      JSON.stringify(toegepast[0]));
  });

  await test("Esc wist eerst de zoekterm en sluit pas bij een lege term", () => {
    mount();
    const veld = zoekveld();
    typ(veld, "160");
    toets(veld, "Escape");
    ok(gesloten === 0, "Esc sloot het venster terwijl er een zoekterm stond");
    ok(zoekveld().value === "" && groepen().length === 0, "Zoekterm niet gewist");
    ok(document.activeElement === zoekveld(), "Focus verliet het zoekveld na Esc");
    toets(zoekveld(), "Escape");
    ok(gesloten === 1, `Esc bij lege term sloot niet (${gesloten})`);
  });

  await test("Geen treffers: een duidelijke lege toestand met de term en een uitweg", () => {
    mount();
    typ(zoekveld(), "bestaatniet");
    const leeg = q(".pk-kolom-maat .pk-leeg");
    ok(leeg?.textContent?.includes("Geen profiel gevonden voor “bestaatniet”"), `Lege toestand: ${leeg?.textContent}`);
    ok(q(".pk-kolom-maat [role=listbox]")?.hasAttribute("hidden"), "Lege listbox staat nog in beeld");
    ok(getComputedStyle(q(".pk-kolom-maat [role=listbox]")!).display === "none", "hidden wint niet van display:flex");
    ok(q(".pk-zoek-status")?.textContent === "0 treffers", `Status: ${q(".pk-zoek-status")?.textContent}`);
    ok(!zoekveld().hasAttribute("aria-activedescendant"), "aria-activedescendant wijst naar niets");
    toets(zoekveld(), "Enter");
    ok(toegepast.length === 0, "Enter zonder treffer paste toe");
    klik(leeg!.querySelector("button"), "knop Zoekterm wissen");
    ok(zoekveld().value === "" && opties().length > 5, "Wissen herstelt de lijst niet");
  });

  await test("'In dit project' staat in de staalstap met alleen staal; één klik kiest zonder te sluiten", () => {
    mount();
    const chips = qa<HTMLButtonElement>(".pk-kopbalk .pk-gebruikt-knop");
    ok(chips.map((c) => c.querySelector(".pk-gebruikt-naam")?.textContent).join() === "HEA160,HEB240,IPE300", chips.map((c) => c.textContent).join(" | "));
    ok(chips[0].getAttribute("aria-pressed") === "true", "Het huidige profiel is niet als gekozen gemerkt");
    typ(zoekveld(), "unp");
    klik(chips[1], "snelkeuze HEB240");
    ok(toegepast.length === 0 && gesloten === 0, "Snelkeuze in de stap sloot het venster");
    ok(samenvatting().includes("HEB240") && samenvatting().includes("S355"), `Samenvatting: ${samenvatting()}`);
    ok(zoekveld().value === "" && opties().includes("HEB 240"), "De lijst toont de reeks van het gekozen profiel niet");
    ok(q(".pk-kolom-maat [role=option][aria-selected=true]")?.textContent === "HEB 240", "HEB 240 niet geselecteerd in de lijst");
    klik(qa(".pk-voet .pk-knop-primair")[0], "Toepassen");
    ok(toegepast[0]?.profile === "HEB240" && toegepast[0]?.material === "S355", JSON.stringify(toegepast[0]));
  });

  await test("Verlopend profiel: het zoekveld zoekt het BEGINprofiel, de eindkeuze blijft staan", () => {
    mount();
    klik(q(".pk-verloop-schakelaar input"), "schakelaar verlopend");
    ok(q(`label[for="${zoekveld().id}"]`)?.textContent === "Zoek beginprofiel", "Label wisselt niet naar beginprofiel");
    const eind = q<HTMLSelectElement>(".pk-verloop select")!;
    const voor = eind.querySelectorAll("option").length;
    typ(zoekveld(), "ipe 300");
    ok(eind.querySelectorAll("option").length === voor && voor > 50, "De zoekterm filtert de eindprofielen");
    toets(zoekveld(), "Enter");
    ok(q(".pk-kolom-maat [role=option][aria-selected=true]")?.textContent === "IPE 300", "Enter koos het beginprofiel niet");
    toets(zoekveld(), "Enter");
    ok(toegepast.length === 0, "Enter paste een verloop zonder eindprofiel toe");
  });

  await test("Houtstap: 'In dit project' toont alleen hout en vult b, h en klasse; geen zoekveld", () => {
    mount({ material: "GL24h", profile: "90x300" });
    ok(!q(".pk-kopbalk .pk-zoek-invoer"), "Zoekveld in de houtstap");
    const chips = qa<HTMLButtonElement>(".pk-kopbalk .pk-gebruikt-knop");
    ok(chips.length === 1 && chips[0].textContent?.includes("71x171"), chips.map((c) => c.textContent).join(" | "));
    klik(chips[0], "snelkeuze 71x171");
    ok(gesloten === 0 && samenvatting().includes("71×171") && samenvatting().includes("C24"), `Samenvatting: ${samenvatting()}`);
  });

  await test("Eigen doorsneden: zoekveld filtert op naam, Esc wist eerst de term", () => {
    const eigen = (id: string, naam: string) => ({ id, naam, eigenschappen: { area_mm2: 1000, iy_mm4: 1e6 } }) as unknown as EigenDoorsnede;
    eigenDoorsnedenStore.getState().vervangAlles([eigen("a", "Gelaste ligger 600"), eigen("b", "Kokerligger 400"), eigen("c", "Gelaste ligger 800")]);
    mount(null);
    klik(qa(".pk-soort").find((el) => el.textContent?.includes("Eigen doorsnede")), "soort Eigen doorsnede");
    const veld = q<HTMLInputElement>(".pk-eigen .pk-zoek-invoer")!;
    ok(veld && document.activeElement === veld, "Focus niet in het zoekveld van de eigen doorsneden");
    ok(q(`label[for="${veld.id}"]`)?.textContent === "Zoek eigen doorsnede", "Label ontbreekt");
    typ(veld, "LIGGER 6");
    ok(qa(".pk-eigen .pk-rij-naam").map((el) => el.textContent).join() === "Gelaste ligger 600", qa(".pk-eigen .pk-rij-naam").map((el) => el.textContent).join());
    typ(veld, "zzz");
    ok(q(".pk-eigen .pk-leeg")?.textContent?.includes("zzz"), "Lege toestand ontbreekt");
    toets(veld, "Escape");
    ok(gesloten === 0 && veld.value === "" && qa(".pk-eigen .pk-rij-naam").length === 3, "Esc wiste de term niet of sloot het venster");
    eigenDoorsnedenStore.getState().vervangAlles([]);
  });

  await test("Engels: vertaalde teksten, en de vertaalde reeksnaam is een zoekwoord", async () => {
    await i18next.changeLanguage("en");
    try {
      mount();
      ok(q(`label[for="${zoekveld().id}"]`)?.textContent === "Search section", "Label niet vertaald");
      typ(zoekveld(), "hollow 100x100");
      ok(opties().length > 0 && opties().every((n) => n.startsWith("SHS 100x100")), opties().slice(0, 4).join());
      ok(/^\d+ match(es)?$/.test(q(".pk-zoek-status")?.textContent ?? ""), `Status: ${q(".pk-zoek-status")?.textContent}`);
      typ(zoekveld(), "koker");
      ok(q(".pk-leeg")?.textContent?.includes("No section found"), "Nederlands reekswoord vindt iets in het Engels");
    } finally {
      await i18next.changeLanguage("nl");
    }
  });

  await test("Breed venster: zoekveld staat boven de twee lijstkolommen, geen horizontale overloop", () => {
    mount();
    typ(zoekveld(), "160");
    const dialoog = q(".modal-dialog")!;
    ok(dialoog.scrollWidth <= dialoog.clientWidth + 1, `Overloop: ${dialoog.scrollWidth} > ${dialoog.clientWidth}`);
    const zoek = q(".pk-zoek")!.getBoundingClientRect();
    const reeks = q(".pk-kolom-reeks")!.getBoundingClientRect();
    const maat = q(".pk-kolom-maat")!.getBoundingClientRect();
    ok(Math.abs(zoek.left - reeks.left) <= 1 && Math.abs(zoek.right - maat.right) <= 1, `Zoek ${zoek.left}–${zoek.right}, kolommen ${reeks.left}–${maat.right}`);
    ok(zoek.bottom <= reeks.top, "Zoekveld staat niet boven de kolommen");
    const voet = q(".pk-voet")!.getBoundingClientRect();
    ok(voet.bottom <= dialoog.getBoundingClientRect().bottom + 1, "Knoppenbalk valt buiten het venster");
  });
}

async function smal() {
  await test(`Smal venster (${window.innerWidth}px): alles op volle breedte, geen horizontale overloop`, () => {
    mount();
    typ(zoekveld(), "160");
    const dialoog = q(".modal-dialog")!;
    ok(dialoog.getBoundingClientRect().width <= window.innerWidth, "Dialoog breder dan het venster");
    ok(dialoog.scrollWidth <= dialoog.clientWidth + 1, `Overloop dialoog: ${dialoog.scrollWidth} > ${dialoog.clientWidth}`);
    const inhoud = q(".pk-inhoud")!;
    ok(inhoud.scrollWidth <= inhoud.clientWidth + 1, `Overloop inhoud: ${inhoud.scrollWidth} > ${inhoud.clientWidth}`);
    const veld = zoekveld().getBoundingClientRect();
    ok(veld.width >= 240, `Zoekveld te smal: ${veld.width}px`);
    const chips = q(".pk-gebruikt-stap")!.getBoundingClientRect();
    ok(chips.top >= veld.bottom, "Snelkeuzen staan niet onder het zoekveld");
  });
  await test("Smal venster: het zoekveld blijft in beeld terwijl de stap schuift", async () => {
    mount();
    typ(zoekveld(), "1");
    const inhoud = q(".pk-inhoud")!;
    ok(inhoud.scrollHeight > inhoud.clientHeight, "De stap schuift niet; de controle zegt dan niets");
    inhoud.scrollTop = inhoud.scrollHeight;
    await delay(30);
    const veld = zoekveld().getBoundingClientRect();
    const bak = inhoud.getBoundingClientRect();
    ok(veld.top >= bak.top - 1 && veld.bottom <= bak.bottom, `Zoekveld buiten beeld: ${veld.top}–${veld.bottom} in ${bak.top}–${bak.bottom}`);
  });
  await test("Smal venster: pijltje omlaag schuift de gemarkeerde treffer in beeld", async () => {
    mount();
    const veld = zoekveld();
    typ(veld, "1");
    for (let i = 0; i < 40; i += 1) toets(veld, "ArrowDown");
    await delay(30);
    const rij = document.getElementById(veld.getAttribute("aria-activedescendant") ?? "")!.getBoundingClientRect();
    const bak = q(".pk-inhoud")!.getBoundingClientRect();
    ok(rij.bottom <= bak.bottom + 1 && rij.top >= bak.top - 1, `Gemarkeerde rij buiten beeld: ${rij.top}–${rij.bottom} in ${bak.top}–${bak.bottom}`);
  });
}

/** Eén toestand op het scherm zetten voor een schermafbeelding. */
function beeld(naam: string) {
  const [, thema, toestand] = naam.split("-");
  document.documentElement.setAttribute("data-theme", thema === "donker" ? "openaec" : "light");
  mount();
  if (toestand === "zoek" || toestand === "smal") {
    typ(zoekveld(), "160");
    toets(zoekveld(), "ArrowDown");
  } else if (toestand === "leeg") {
    typ(zoekveld(), "hea 165");
  } else if (toestand === "verlopend") {
    klik(q(".pk-verloop-schakelaar input"), "schakelaar verlopend");
    typ(zoekveld(), "heb 2");
  }
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl",
    fallbackLng: "nl",
    resources: { nl: { common: commonNl, check: checkNl }, en: { common: commonEn, check: checkEn } },
    defaultNS: "common",
    initImmediate: false,
  });
  const stand = location.hash.slice(1);
  if (stand.startsWith("beeld-")) { beeld(stand); return; }
  if (stand === "smal") await smal(); else await breed();
  flushSync(() => root.unmount());
}

run()
  .then(() => { if (!location.hash.startsWith("#beeld-")) document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: null }); })
  .catch((error) => { document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(error) }); });
