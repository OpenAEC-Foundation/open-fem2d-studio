/**
 * Browserkant van test-projectgegevens-ui.mjs (issue #50): het echte venster
 * Projectgegevens (ProjectSettingsDialog).
 *
 * Zonder `beeld` in de hash draait de testreeks en komt de uitslag als JSON in
 * #uitslag; de test start de browser Ã©Ã©n keer op de standaardgrootte en Ã©Ã©n
 * keer smal (`#venster=smal`), zodat "geen horizontale overloop" bij allebei
 * wordt nagemeten. Headless Edge maakt een venster niet smaller dan ruim
 * 500 px; "smal" is daarom een iframe van SMAL px breed met dezelfde pagina
 * erin (srcdoc; de stand gaat mee in `window.name`, want een srcdoc heeft geen
 * hash). Voor het venster is dat een echt smal scherm: `position: fixed` en
 * `vw` gaan over het iframe. De uitslag komt met postMessage terug naar de
 * buitenpagina. Met `#beeld=licht|donker|tip-open` wordt alleen het venster
 * opgebouwd â€” daarvan maakt de test op verzoek een schermafbeelding; met
 * `-onder` erachter (`#beeld=licht-onder`) staat de romp onderaan gescrold,
 * bij de uitgangspunten en de wind.
 */
import React from "react";
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
import ProjectSettingsDialog from "../src/components/project/ProjectSettingsDialog";
import { partieleFactoren } from "../src/components/fem/solver/normcombinaties";
import { STANDAARD_BIJLAGE } from "../src/lib/normAanduidingen";

/** Breedte van het smalle venster in CSS-px (het venster zelf wordt 90vw). */
const SMAL = 360;
const BINNEN = "smal-binnen|";
/** De stand van de pagina: de hash, of in het smalle iframe de doorgegeven hash. */
const HASH = window.name.startsWith(BINNEN) ? window.name.slice(BINNEN.length) : location.hash;
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
function ok(v: unknown, m: string) { if (!v) throw Error(m); }
const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(sleutel, opties);

const dialoog = () => {
  const d = document.querySelector<HTMLElement>(".proj-dialog");
  if (!d) throw Error("venster Projectgegevens niet getoond");
  return d;
};
/** Het veldblok (.proj-field) met de kop die met `label` begint. */
function veldblok(label: string): HTMLElement {
  const f = [...dialoog().querySelectorAll<HTMLElement>(".proj-field")]
    .find((el) => (el.querySelector(":scope > label, :scope > .proj-label")?.textContent ?? "").startsWith(label));
  if (!f) throw Error(`veld ontbreekt: ${label}`);
  return f;
}
/** Het veld (select/input) onder het label dat met `label` begint. */
function veld(label: string): HTMLElement {
  const v = veldblok(label).querySelector<HTMLElement>("select, input");
  if (!v) throw Error(`veld ontbreekt: ${label}`);
  return v;
}
/**
 * De InfoTip bij een veld: knop in de kop, tekst via aria-describedby van het
 * veld (bij de normen: van de groep met de drie keuzelijsten).
 */
function tip(label: string): { knop: HTMLButtonElement; tekst: string; bubbel: HTMLElement } {
  const blok = veldblok(label);
  const beschreven = blok.querySelector<HTMLElement>("[aria-describedby]:not(.infotip-knop)");
  const id = beschreven?.getAttribute("aria-describedby");
  const knop = blok.querySelector<HTMLButtonElement>(":scope > label .infotip-knop, :scope > .proj-label .infotip-knop");
  if (!id || !knop) throw Error(`${label}: geen InfoTip`);
  if (knop.getAttribute("aria-describedby") !== id) throw Error(`${label}: veld en knop wijzen niet naar dezelfde tip`);
  const bubbel = document.getElementById(id);
  if (!bubbel) throw Error(`${label}: tiptekst ontbreekt`);
  return { knop, tekst: bubbel.textContent ?? "", bubbel };
}
/** Kies een waarde in een keuzelijst zoals de gebruiker dat doet. */
function kies(el: HTMLSelectElement, waarde: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, waarde);
  flushSync(() => el.dispatchEvent(new Event("change", { bubbles: true })));
}
/** Zichtbare tekst in het venster zelf (de tips hangen aan document.body). */
const venstertekst = () => dialoog().innerText;

/**
 * Geen horizontale overloop: het venster past in het scherm, de romp heeft
 * niets te schuiven, en geen enkel element steekt rechts of links uit.
 */
function geenOverloop() {
  const d = dialoog();
  const body = d.querySelector<HTMLElement>(".proj-body")!;
  const r = d.getBoundingClientRect();
  ok(r.left >= 0 && r.right <= window.innerWidth + 0.5, `venster buiten beeld: ${r.left.toFixed(1)}â€“${r.right.toFixed(1)} bij ${window.innerWidth}`);
  ok(body.scrollWidth <= body.clientWidth, `romp schuift horizontaal: scrollWidth ${body.scrollWidth} > clientWidth ${body.clientWidth}`);
  ok(d.scrollWidth <= d.clientWidth, `venster schuift horizontaal: ${d.scrollWidth} > ${d.clientWidth}`);
  ok(document.documentElement.scrollWidth <= window.innerWidth, `pagina schuift horizontaal: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
  const b = body.getBoundingClientRect();
  for (const el of body.querySelectorAll<HTMLElement>("*")) {
    const e = el.getBoundingClientRect();
    if (e.width === 0 && e.height === 0) continue;
    ok(e.right <= b.right + 0.5 && e.left >= b.left - 0.5,
      `steekt uit: <${el.tagName.toLowerCase()} class="${el.className}"> ${e.left.toFixed(1)}â€“${e.right.toFixed(1)} buiten ${b.left.toFixed(1)}â€“${b.right.toFixed(1)}`);
  }
}

/** Elke voormalige uitlegtekst en de tip waarin hij nu staat. */
function voormaligeUitleg(): Array<{ veld: string; tekst: string }> {
  const f = partieleFactoren("CC2", STANDAARD_BIJLAGE);
  return [
    { veld: t("projectSettingsDialog.appliedStandards"), tekst: t("projectSettingsDialog.standardsExplanation") },
    { veld: t("projectSettingsDialog.consequenceClass"), tekst: t("projectSettingsDialog.consequenceExplainIntro", { bron: f.bron }) },
    { veld: t("projectSettingsDialog.consequenceClass"), tekst: t("projectSettingsDialog.consequenceExplainFavourable") },
    { veld: t("projectSettingsDialog.consequenceClass"), tekst: t("projectSettingsDialog.consequenceExplainTail") },
    { veld: t("projectSettingsDialog.windRegion"), tekst: t("projectSettingsDialog.windExplainRegion", { gebied: "II" }) },
    { veld: t("projectSettingsDialog.windRegion"), tekst: t("wind.regionSource") },
    { veld: t("projectSettingsDialog.terrainCategory"), tekst: t("projectSettingsDialog.windExplainTerrain") },
    { veld: t("projectSettingsDialog.terrainCategory"), tekst: t("projectSettingsDialog.windExplainFromTable") },
    { veld: t("projectSettingsDialog.terrainCategory"), tekst: t("projectSettingsDialog.windExplainNot") },
    { veld: t("projectSettingsDialog.terrainCategory"), tekst: t("projectSettingsDialog.windExplainNationalAnnex") },
  ];
}

/**
 * Buitenpagina van het smalle venster: zet de pagina in een iframe van SMAL px
 * en geeft door wat die terugmeldt. `true` = de buitenpagina doet verder niets.
 */
function smalInIframe(): boolean {
  if (!HASH.includes("venster=smal") || window.name.startsWith(BINNEN)) return false;
  const uitslag = document.getElementById("uitslag");
  window.addEventListener("message", (e) => {
    if (uitslag && typeof e.data === "string" && e.data.startsWith("{")) uitslag.textContent = e.data;
  });
  document.body.style.margin = "0";
  document.body.style.background = "#888";
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:0;top:0;width:${SMAL}px;height:100vh;border:0`;
  frame.name = BINNEN + location.hash;
  // Relatieve adressen in een srcdoc gaan over het adres van de buitenpagina.
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css">' +
    '</head><body><div id="root"></div><pre id="uitslag"></pre><script src="test.js"></script></body></html>';
  document.body.appendChild(frame);
  return true;
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { common: nl }, en: { common: en }, de: { common: de }, fr: { common: fr } },
    defaultNS: "common", initImmediate: false,
  });
  document.body.style.background = "var(--theme-bg)";
  const beeld = /beeld=([\w-]+)/.exec(HASH)?.[1];
  if (beeld) {
    document.documentElement.setAttribute("data-theme", beeld.startsWith("donker") ? "openaec" : "light");
    document.getElementById("uitslag")!.remove();
    mount(<ProjectSettingsDialog open onClose={noop} />);
    await wacht(200);
    if (beeld.endsWith("-onder")) {
      const romp = dialoog().querySelector<HTMLElement>(".proj-body")!;
      romp.scrollTop = romp.scrollHeight;
    }
    if (beeld === "tip-open") {
      const knop = dialoog().querySelectorAll<HTMLButtonElement>(".infotip-knop")[3];
      if (knop) {
        knop.scrollIntoView({ block: "center" });
        flushSync(() => knop.focus());
      }
    }
    return;
  }
  const smal = HASH.includes("venster=smal");
  const stand = smal ? `smal (${window.innerWidth} px)` : `standaard (${window.innerWidth} px)`;

  mount(<ProjectSettingsDialog open onClose={noop} />);
  await wacht(200);

  await test(`${stand}: geen horizontale overloop`, () => geenOverloop());

  await test(`${stand}: geen overloop met de langste keuzes (CC3, windgebied I, terreincategorie 0)`, () => {
    kies(veld(t("projectSettingsDialog.consequenceClass")) as HTMLSelectElement, "CC3");
    kies(veld(t("projectSettingsDialog.windRegion")) as HTMLSelectElement, "I");
    kies(veld(t("projectSettingsDialog.terrainCategory")) as HTMLSelectElement, "0");
    kies(veld(t("projectSettingsDialog.designWorkingLife")) as HTMLSelectElement, "5");
    geenOverloop();
  });

  await test(`${stand}: geen overloop met ERPNext aan (zoekregel)`, () => {
    const vink = dialoog().querySelector<HTMLInputElement>(".proj-toggle input")!;
    flushSync(() => vink.click());
    ok(dialoog().querySelector(".proj-erp-search-row"), "zoekregel niet getoond");
    geenOverloop();
    flushSync(() => vink.click());
  });

  await test(`${stand}: keuzelijsten passen in hun veld (max-width 100%, ellipsis)`, () => {
    for (const s of dialoog().querySelectorAll<HTMLSelectElement>(".proj-body select")) {
      const cs = getComputedStyle(s);
      ok(cs.maxWidth === "100%", `max-width van keuzelijst ${cs.maxWidth}`);
      ok(cs.textOverflow === "ellipsis", `text-overflow van keuzelijst ${cs.textOverflow}`);
      const ouder = s.parentElement!.getBoundingClientRect();
      ok(s.getBoundingClientRect().right <= ouder.right + 0.5, "keuzelijst breder dan zijn veld");
    }
  });

  mount(<ProjectSettingsDialog open onClose={noop} />);
  await wacht(200);

  for (const taal of ["nl", "en", "de", "fr"]) {
    await test(`${stand}, ${taal}: elke voormalige uitleg staat in een tip bij het veld, niet meer als doorlopende tekst`, async () => {
      await i18next.changeLanguage(taal);
      mount(<ProjectSettingsDialog open onClose={noop} />);
      await wacht(120);
      for (const { veld: label, tekst } of voormaligeUitleg()) {
        ok(tekst && !tekst.startsWith("projectSettingsDialog."), `${taal}: sleutel zonder vertaling (${tekst})`);
        ok(tip(label).tekst.includes(tekst), `${taal}: tip bij "${label}" mist "${tekst.slice(0, 60)}â€¦"`);
        // Korte teksten ("niet") komen ook in gewone woorden voor; alleen de
        // lange uitleg hoort aantoonbaar uit het venster verdwenen te zijn.
        if (tekst.length > 40) ok(!venstertekst().includes(tekst), `${taal}: uitleg staat nog in het venster: "${tekst.slice(0, 60)}â€¦"`);
      }
      ok(!dialoog().querySelector(".proj-uitleg"), `${taal}: er staat nog een uitlegalinea in het venster`);
    });
  }
  await i18next.changeLanguage("nl");
  mount(<ProjectSettingsDialog open onClose={noop} />);
  await wacht(120);

  await test(`${stand}: de korte status blijft als Ã©Ã©n grijze regel zichtbaar`, () => {
    const regels = [...dialoog().querySelectorAll<HTMLElement>(".proj-status")];
    ok(regels.length === 2, `${regels.length} statusregels, verwacht 2 (gevolgklasse en wind)`);
    const [cc, wind] = regels.map((r) => r.textContent ?? "");
    ok(cc.includes("KFI = 1,00"), `status gevolgklasse: ${cc}`);
    ok(wind.includes("vb,0 = 27,0 m/s") && wind.includes("z0 = 0,050 m"), `status wind: ${wind}`);
    for (const r of regels) {
      const lijn = parseFloat(getComputedStyle(r).lineHeight);
      ok(r.getBoundingClientRect().height <= lijn * 1.5 + 1, `statusregel loopt over meer dan Ã©Ã©n regel: ${r.textContent}`);
      ok(getComputedStyle(r).color === getComputedStyle(dialoog().querySelector(".proj-field label")!).color,
        "statusregel niet in de grijze labelkleur");
    }
  });

  await test(`${stand}: status en tip volgen de keuze (CC1, windgebied I, terreincategorie IV)`, () => {
    kies(veld(t("projectSettingsDialog.consequenceClass")) as HTMLSelectElement, "CC1");
    kies(veld(t("projectSettingsDialog.windRegion")) as HTMLSelectElement, "I");
    kies(veld(t("projectSettingsDialog.terrainCategory")) as HTMLSelectElement, "IV");
    const [cc, wind] = [...dialoog().querySelectorAll<HTMLElement>(".proj-status")].map((r) => r.textContent ?? "");
    ok(cc.includes("KFI = 0,90"), `status CC1: ${cc}`);
    ok(wind.includes("vb,0 = 29,5 m/s") && wind.includes("z0 = 1,000 m"), `status wind: ${wind}`);
    ok(tip(t("projectSettingsDialog.consequenceClass")).tekst.includes("KFI = 0,90"), "tip gevolgklasse volgt CC1 niet");
    ok(tip(t("projectSettingsDialog.windRegion")).tekst.includes(t("projectSettingsDialog.windExplainRegion", { gebied: "I" })), "tip windgebied volgt I niet");
    ok(tip(t("projectSettingsDialog.terrainCategory")).tekst.includes("z0 = 1,000 m"), "tip terreincategorie volgt IV niet");
  });

  await test(`${stand}: tip opent op focus binnen het venster, Esc sluit hem`, async () => {
    for (const label of [t("projectSettingsDialog.appliedStandards"), t("projectSettingsDialog.terrainCategory")]) {
      const { knop, bubbel } = tip(label);
      ok(bubbel.hidden, `${label}: tip staat al open`);
      knop.scrollIntoView({ block: "center" });
      flushSync(() => knop.focus());
      await wacht(40);
      ok(!bubbel.hidden, `${label}: tip opent niet op focus`);
      const r = bubbel.getBoundingClientRect();
      ok(r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
        `${label}: tip valt buiten het venster (${r.left.toFixed(0)},${r.top.toFixed(0)}â€“${r.right.toFixed(0)},${r.bottom.toFixed(0)})`);
      // Boven het venster (de overlay heeft zelf een z-index): het midden van
      // de tip is de tip, niet het venster eronder.
      const bovenop = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      ok(bovenop && bubbel.contains(bovenop), `${label}: tip ligt onder het venster`);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await wacht(40);
      ok(bubbel.hidden, `${label}: Esc sluit de tip niet`);
      knop.blur();
    }
  });

  await test(`${stand}: een klik op de labeltekst kiest het veld, niet de tip`, async () => {
    for (const label of [t("projectSettingsDialog.consequenceClass"), t("projectSettingsDialog.windRegion")]) {
      const kop = veldblok(label).querySelector<HTMLLabelElement>(":scope > label")!;
      flushSync(() => kop.click());
      await wacht(40);
      ok(document.activeElement === veld(label), `${label}: klik op het label geeft het veld geen focus`);
      ok(tip(label).bubbel.hidden, `${label}: klik op het label opent de tip`);
      (document.activeElement as HTMLElement).blur();
    }
  });

  await test(`${stand}: de normstanden en hun gevolg blijven staan`, () => {
    ok(dialoog().querySelectorAll(".proj-norm-stand").length === 3, "drie normkeuzes");
    ok(dialoog().querySelectorAll(".proj-norm-gevolg").length === 3, "drie gevolgregels");
    geenOverloop();
  });
}

const uitslag = document.getElementById("uitslag");
/** Uitslag in #uitslag, en vanuit het smalle iframe ook naar de buitenpagina. */
function meld(json: string) {
  if (uitslag) uitslag.textContent = json;
  if (window.parent !== window) window.parent.postMessage(json, "*");
}
if (!smalInIframe()) {
  run()
    .then(() => { if (!/beeld=/.test(HASH)) meld(JSON.stringify({ error: null, tests })); })
    .catch((e) => meld(JSON.stringify({ error: String(e?.stack ?? e), tests })));
}
