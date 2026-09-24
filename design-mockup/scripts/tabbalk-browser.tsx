/**
 * Browserkant van test-tabbalk-ui.mjs (issue #51): de echte tabbalk met
 * belastinggevallen (LoadCaseTabBar) met twaalf gevallen, lange namen (zoals
 * de windgenerator ze maakt) en alle vaste onderdelen aan (eigen gewicht,
 * analyse, φ met bijlage B, scheefstand), in een venster dat te smal is voor
 * alle gevallen.
 *
 * Zonder `beeld` in de hash draait de testreeks en komt de uitslag als JSON in
 * #uitslag. Met `#beeld=balk|midden|lijst` (en `-donker` erachter) wordt alleen
 * de balk opgebouwd — daarvan maakt de test op verzoek een schermafbeelding.
 */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import nl from "../src/i18n/locales/nl/common.json";
import en from "../src/i18n/locales/en/common.json";
import de from "../src/i18n/locales/de/common.json";
import fr from "../src/i18n/locales/fr/common.json";
import "../src/themes.css";
import "../src/App.css";
import LoadCaseTabBar from "../src/components/fem/LoadCaseTabBar";
import type { LoadCase, Load } from "../src/components/fem/femTypes";

const tests: { name: string; error?: string }[] = [];
const container = document.getElementById("root")!;
container.style.cssText = "height:100vh;display:flex;flex-direction:column;background:var(--theme-bg)";
let root = createRoot(container);
const noop = () => {};
const wacht = (ms = 60) => new Promise((r) => setTimeout(r, ms));
function mount(element: React.ReactNode) {
  flushSync(() => root.unmount());
  root = createRoot(container);
  flushSync(() => root.render(element));
}
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); tests.push({ name }); }
  catch (e) { tests.push({ name, error: e instanceof Error ? e.message : String(e) }); }
}
function ok(v: unknown, m: string): asserts v { if (!v) throw Error(m); }

// ── Twaalf gevallen, zoals na de windgenerator ─────────────────────────────
const NAMEN: Array<[string, LoadCase["type"]]> = [
  ["Permanent (G)", "dead"], ["Veranderlijk (Q)", "live"], ["Sneeuw (S)", "snow"],
  ["Wind van links (c_pi = 0,20)", "wind"], ["Wind van links (c_pi = −0,30)", "wind"],
  ["Wind van rechts (c_pi = 0,20)", "wind"], ["Wind van rechts (c_pi = −0,30)", "wind"],
  ["Wind op de kopgevel, langsrichting van de hal (c_pi = 0,20)", "wind"],
  ["Wind op de kopgevel (c_pi = −0,30)", "wind"], ["Onderhoudslast dak", "live"],
  ["Installaties", "dead"], ["Laatste geval", "other"],
];
const GEVALLEN: LoadCase[] = NAMEN.map(([name, type], i) => ({ id: i + 1, name, type } as LoadCase));
const LASTEN = [{ id: 1, caseId: 1 }, { id: 2, caseId: 4 }] as unknown as Load[];

/** De balk met eigen toestand voor het actieve geval, zoals App.tsx hem voedt. */
let zetActief: (id: number) => void = noop;
let gekozen: number[] = [];
function Balk({ gevallen = GEVALLEN, begin = 1, alles = true }: { gevallen?: LoadCase[]; begin?: number; alles?: boolean }) {
  const [actief, setActief] = useState(begin);
  const [showLoads, setShowLoads] = useState(true);
  zetActief = (id) => flushSync(() => { setActief(id); setShowLoads(true); });
  return (
    <>
      <div style={{ flex: 1, minHeight: 0 }} />
      <LoadCaseTabBar
        loadCases={gevallen} activeLoadCaseId={actief}
        setActiveLoadCaseId={(id) => { gekozen.push(id); setActief(id); }}
        addLoadCase={noop} loads={LASTEN}
        selfWeightEnabled setSelfWeightEnabled={noop}
        {...(alles ? {
          analysetype: "eersteOrde" as const, setAnalysetype: noop,
          heeftBetonstaaf: true, betonKruipcoefficient: 2, setBetonKruipcoefficient: noop,
          betonKruipInvoer: null, setBetonKruipInvoer: noop,
          scheefstandEnabled: false, setScheefstandEnabled: noop,
        } : {})}
        showLoads={showLoads} setShowLoads={setShowLoads}
        hasResults onShowResults={noop}
      />
    </>
  );
}

const balk = () => document.querySelector<HTMLElement>(".lc-tab-bar")!;
const strook = () => {
  const s = document.querySelector<HTMLElement>(".lc-tab-cases");
  if (!s) throw Error("geen aparte strook met gevallen (.lc-tab-cases)");
  return s;
};
const tabs = () => [...strook().querySelectorAll<HTMLElement>(".lc-tab[role=tab]")];
const tabVan = (id: number) => tabs()[GEVALLEN.findIndex((c) => c.id === id)];
const pijl = (kant: "links" | "rechts") => document.querySelector<HTMLButtonElement>(`.lc-tab-scroll-${kant}`);
const lijstKnop = () => {
  const k = document.querySelector<HTMLButtonElement>(".lc-tab-lijst");
  if (!k) throw Error("geen lijstknop (.lc-tab-lijst)");
  return k;
};
const lijst = () => document.querySelector<HTMLElement>(".lc-tab-lijst-menu");
/** De stand van de strook en de plaats van een tab, voor foutmeldingen. */
function info(el?: HTMLElement): string {
  const st = strook();
  const s = st.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  return `strook ${s.left.toFixed(0)}–${s.right.toFixed(0)}, scrollLeft ${st.scrollLeft.toFixed(0)}/${st.scrollWidth}-${st.clientWidth}` +
    (r && el ? `, tab ${r.left.toFixed(0)}–${r.right.toFixed(0)} (offsetLeft ${el.offsetLeft}, offsetParent ${(el.offsetParent as HTMLElement | null)?.className})` : "");
}
/** Staat `el` helemaal binnen het zichtbare deel van de strook? */
function inBeeld(el: HTMLElement): boolean {
  const s = strook().getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
}
/** Staat `el` helemaal binnen de balk en het venster, en niet in de strook? */
function vastZichtbaar(el: HTMLElement | null | undefined, naam: string) {
  ok(el, `${naam} ontbreekt`);
  ok(!strook().contains(el), `${naam} scrolt mee met de gevallen`);
  const b = balk().getBoundingClientRect();
  const r = el.getBoundingClientRect();
  ok(r.width > 0, `${naam} heeft geen breedte`);
  ok(r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.right <= window.innerWidth + 0.5,
    `${naam} valt buiten de balk: ${r.left.toFixed(0)}–${r.right.toFixed(0)} (balk ${b.left.toFixed(0)}–${b.right.toFixed(0)})`);
}
const klik = (el: HTMLElement) => flushSync(() => el.click());
function toets(el: HTMLElement, key: string) {
  flushSync(() => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
}
function wijzer(el: HTMLElement, type: string, x: number) {
  const r = el.getBoundingClientRect();
  flushSync(() => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
    clientX: x, clientY: r.top + r.height / 2,
  })));
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common: nl }, en: { common: en }, de: { common: de }, fr: { common: fr } },
    defaultNS: "common", initImmediate: false, interpolation: { escapeValue: false },
  });
  const beeld = /beeld=([\w-]+)/.exec(location.hash)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld.endsWith("donker") ? "openaec" : "light");
    document.body.style.cssText = "margin:0;background:var(--theme-bg)";
    document.getElementById("uitslag")!.remove();
    mount(<Balk begin={beeld.startsWith("midden") || beeld.startsWith("lijst") ? 6 : 1} />);
    await wacht(100);
    if (beeld.startsWith("lijst")) {
      await wacht(200);
      const k = document.querySelector<HTMLButtonElement>(".lc-tab-lijst");
      if (k) klik(k);
    }
    return;
  }

  mount(<Balk />);
  await wacht();

  await test("12 gevallen in een smal venster: alleen de strook met gevallen loopt over", () => {
    ok(tabs().length === 12, `${tabs().length} tabs in de strook`);
    const s = strook();
    ok(s.scrollWidth > s.clientWidth + 1, `strook loopt niet over (${s.scrollWidth} ≤ ${s.clientWidth}); venster te breed voor de test?`);
    const b = balk();
    ok(b.scrollWidth <= b.clientWidth, `de balk zelf schuift: ${b.scrollWidth} > ${b.clientWidth}`);
  });

  await test("de vaste onderdelen blijven zichtbaar en scrollen niet mee", () => {
    const b = balk();
    vastZichtbaar(b.querySelector<HTMLElement>(".lc-tab-model"), "tab Model");
    vastZichtbaar(b.querySelector<HTMLElement>(".lc-tab-results"), "tab Resultaten");
    vastZichtbaar(b.querySelector<HTMLElement>(".lc-tab-add"), "knop +");
    vastZichtbaar(lijstKnop(), "lijstknop ▾");
    const toggles = [...b.querySelectorAll<HTMLElement>(".lc-tab-toggle")];
    vastZichtbaar(toggles.find((el) => el.textContent?.includes(i18next.t("loadCases.selfWeight"))), "Eigen gewicht");
    vastZichtbaar(toggles.find((el) => el.textContent?.includes(i18next.t("loadCases.sway"))), "Scheefstand");
    const phi = [...b.querySelectorAll<HTMLElement>(".lc-tab-phi")];
    vastZichtbaar(phi.find((el) => el.textContent?.includes(i18next.t("loadCases.analysis"))), "Analyse");
    vastZichtbaar(phi.find((el) => el.textContent?.includes("φ(∞,t₀)")), "φ(∞,t₀)");
    vastZichtbaar([...b.querySelectorAll<HTMLElement>("label")].find((el) => el.textContent?.includes(i18next.t("loadCases.creepAnnexB"))), "bijlage B");
  });

  await test("pijlen verschijnen bij overloop; aan het begin kan alleen rechts", () => {
    ok(pijl("links") && pijl("rechts"), "pijlknoppen ontbreken");
    ok(pijl("links")!.disabled, "pijl links is niet uitgeschakeld aan het begin");
    ok(!pijl("rechts")!.disabled, "pijl rechts is uitgeschakeld");
    ok(pijl("links")!.getAttribute("aria-label") && pijl("rechts")!.getAttribute("aria-label"), "pijlen zonder toegankelijke naam");
    ok(!strook().contains(pijl("links")) && !strook().contains(pijl("rechts")), "pijlen scrollen mee");
  });

  await test("het laatste geval is bereikbaar met de pijl rechts", async () => {
    const laatste = tabVan(12);
    ok(!inBeeld(laatste), "laatste geval staat al in beeld");
    for (let i = 0; i < 20 && !pijl("rechts")!.disabled; i++) { klik(pijl("rechts")!); await wacht(30); }
    ok(inBeeld(laatste), `laatste geval niet in beeld na de pijlen: ${info(laatste)}`);
    ok(pijl("rechts")!.disabled, "pijl rechts niet uitgeschakeld aan het eind");
    ok(!pijl("links")!.disabled, "pijl links uitgeschakeld aan het eind");
    klik(laatste);
    ok(gekozen.at(-1) === 12, "klik op het laatste geval kiest het niet");
  });

  await test("de pijl links brengt de strook terug naar het eerste geval", async () => {
    for (let i = 0; i < 20 && !pijl("links")!.disabled; i++) { klik(pijl("links")!); await wacht(30); }
    ok(strook().scrollLeft === 0, `niet terug aan het begin: ${info(tabVan(1))}`);
    ok(inBeeld(tabVan(1)), "eerste geval niet in beeld");
  });

  await test("wisselen van buitenaf (verkenner) schuift het actieve geval in beeld", async () => {
    strook().scrollLeft = 0;
    await wacht();
    zetActief(11);
    await wacht();
    ok(tabVan(11).getAttribute("aria-selected") === "true", "geval 11 niet actief");
    ok(inBeeld(tabVan(11)), `geval 11 niet in beeld geschoven: ${info(tabVan(11))}`);
    const voor = strook().scrollLeft;
    zetActief(10);
    await wacht();
    ok(inBeeld(tabVan(10)), "geval 10 niet in beeld");
    ok(strook().scrollLeft === voor || strook().scrollLeft < voor, "strook schoof verder dan nodig (nearest)");
  });

  await test("toetsenbord: pijltoetsen, Home en End kiezen een geval en schuiven het in beeld", async () => {
    zetActief(1);
    await wacht();
    tabVan(1).focus();
    toets(tabVan(1), "End");
    await wacht();
    ok(gekozen.at(-1) === 12, `End koos ${gekozen.at(-1)}`);
    ok(document.activeElement === tabVan(12), "focus niet op het laatste geval");
    ok(inBeeld(tabVan(12)), "laatste geval niet in beeld na End");
    toets(tabVan(12), "ArrowLeft");
    await wacht();
    ok(gekozen.at(-1) === 11, `ArrowLeft koos ${gekozen.at(-1)}`);
    toets(tabVan(11), "Home");
    await wacht();
    ok(gekozen.at(-1) === 1 && inBeeld(tabVan(1)), "Home kiest het eerste geval niet of schuift het niet in beeld");
    toets(tabVan(1), "ArrowRight");
    await wacht();
    ok(gekozen.at(-1) === 2, `ArrowRight koos ${gekozen.at(-1)}`);
  });

  await test("de lijstknop toont alle gevallen en kiest er één", async () => {
    zetActief(2);
    await wacht();
    strook().scrollLeft = 0;
    await wacht();
    ok(!lijst(), "lijst staat al open");
    klik(lijstKnop());
    await wacht();
    const menu = lijst();
    ok(menu, "lijst gaat niet open");
    ok(lijstKnop().getAttribute("aria-expanded") === "true", "aria-expanded");
    const items = [...menu.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    ok(items.length === 12, `${items.length} gevallen in de lijst`);
    ok(items[1].getAttribute("aria-checked") === "true", "actief geval niet aangevinkt");
    ok(items.every((it, i) => (it.getAttribute("title") ?? "") === GEVALLEN[i].name), "volledige naam niet als title in de lijst");
    const m = menu.getBoundingClientRect();
    ok(m.top >= 0 && m.bottom <= window.innerHeight && m.left >= 0 && m.right <= window.innerWidth,
      `lijst valt buiten het venster (${m.left.toFixed(0)},${m.top.toFixed(0)}–${m.right.toFixed(0)},${m.bottom.toFixed(0)})`);
    ok(document.activeElement === items[1], "focus niet op het actieve geval in de lijst");
    klik(items[8]);
    await wacht();
    ok(gekozen.at(-1) === 9, `lijst koos ${gekozen.at(-1)}`);
    ok(!lijst(), "lijst blijft open na een keuze");
    ok(tabVan(9).getAttribute("aria-selected") === "true", "geval 9 niet actief");
    ok(inBeeld(tabVan(9)), "gekozen geval niet in beeld geschoven");
  });

  await test("de lijst: pijltoetsen verplaatsen de focus, Esc sluit, klik ernaast sluit", async () => {
    klik(lijstKnop());
    await wacht();
    let items = [...lijst()!.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
    ok(document.activeElement === items[8], "focus niet op het actieve geval");
    toets(items[8], "ArrowDown");
    ok(document.activeElement === items[9], "ArrowDown");
    toets(items[9], "End");
    ok(document.activeElement === items[11], "End");
    toets(items[11], "ArrowUp");
    ok(document.activeElement === items[10], "ArrowUp");
    toets(items[10], "Escape");
    await wacht();
    ok(!lijst(), "Esc sluit de lijst niet");
    ok(document.activeElement === lijstKnop(), "focus niet terug op de lijstknop");
    klik(lijstKnop());
    await wacht();
    ok(lijst(), "lijst gaat niet opnieuw open");
    flushSync(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3 })));
    await wacht();
    ok(!lijst(), "klik ernaast sluit de lijst niet");
    items = [];
  });

  await test("muiswiel: een verticaal wiel scrolt de gevallen horizontaal", async () => {
    strook().scrollLeft = 0;
    await wacht();
    const e = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
    strook().dispatchEvent(e);
    await wacht();
    ok(strook().scrollLeft > 0, "wiel scrolt niet");
    ok(e.defaultPrevented, "de pagina scrolt ook mee (wiel niet afgevangen)");
    ok(!pijl("links")!.disabled, "pijl links volgt de scrollstand niet");
    const h = new WheelEvent("wheel", { deltaX: 50, deltaY: 5, bubbles: true, cancelable: true });
    strook().dispatchEvent(h);
    ok(!h.defaultPrevented, "een horizontale touchpadbeweging wordt afgevangen in plaats van aan de browser gelaten");
  });

  await test("slepen met de muis scrolt de gevallen en kiest geen tab", async () => {
    strook().scrollLeft = 0;
    zetActief(1);
    await wacht();
    const aantal = gekozen.length;
    const t3 = tabVan(3);
    const x = t3.getBoundingClientRect().left + 20;
    wijzer(t3, "pointerdown", x);
    wijzer(t3, "pointermove", x - 60);
    wijzer(t3, "pointermove", x - 180);
    wijzer(t3, "pointerup", x - 180);
    klik(t3);
    await wacht();
    ok(Math.abs(strook().scrollLeft - 180) <= 1, `scrollLeft ${strook().scrollLeft} na 180 px slepen`);
    ok(gekozen.length === aantal, "een sleep koos toch een tab");
    klik(tabVan(4));
    ok(gekozen.at(-1) === 4, "een gewone klik na het slepen werkt niet");
  });

  await test("lange namen afgekort met …, volledige naam als title", () => {
    const lang = tabVan(8);
    const naam = lang.querySelector<HTMLElement>(".lc-tab-name")!;
    ok(naam.scrollWidth > naam.clientWidth, "lange naam wordt niet afgekort");
    ok(getComputedStyle(naam).textOverflow === "ellipsis", "geen ellipsis");
    ok((lang.getAttribute("title") ?? "").includes(GEVALLEN[7].name), "volledige naam niet in de title");
    const kort = tabVan(1).querySelector<HTMLElement>(".lc-tab-name")!;
    ok(kort.scrollWidth <= kort.clientWidth, "korte naam wordt afgekort");
  });

  await test("weinig gevallen: geen pijlen, lijstknop wel", async () => {
    mount(<Balk gevallen={GEVALLEN.slice(0, 3)} alles={false} />);
    await wacht();
    ok(!pijl("links") && !pijl("rechts"), "pijlen zonder overloop");
    ok(lijstKnop(), "lijstknop");
  });

  await test("pijlen en lijst in nl/en/de/fr met eigen tekst", async () => {
    mount(<Balk />);
    await wacht();
    for (const taal of ["nl", "en", "de", "fr"]) {
      await i18next.changeLanguage(taal);
      mount(<Balk />);
      await wacht();
      for (const [el, sleutel] of [[pijl("links"), "scrollLeft"], [pijl("rechts"), "scrollRight"], [lijstKnop(), "listLabel"]] as const) {
        const tekst = i18next.t(`loadCases.${sleutel}`);
        ok(tekst && !tekst.startsWith("loadCases."), `${taal}: loadCases.${sleutel} ontbreekt`);
        ok(el?.getAttribute("aria-label") === tekst, `${taal}: aria-label ${sleutel}`);
      }
      const titel = i18next.t("loadCases.listTitle");
      ok(titel && !titel.startsWith("loadCases.") && lijstKnop().title === titel, `${taal}: title van de lijstknop`);
    }
    await i18next.changeLanguage("nl");
  });
}

const uitslag = document.getElementById("uitslag");
run()
  .then(() => { if (uitslag && !/beeld=/.test(location.hash)) uitslag.textContent = JSON.stringify({ error: null, tests }); })
  .catch((e) => { if (uitslag) uitslag.textContent = JSON.stringify({ error: String(e?.stack ?? e), tests }); });
