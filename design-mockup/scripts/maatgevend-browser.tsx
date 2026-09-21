// Het toetsingspaneel met "wat is maatgevend" in een echte browser (issue #41).
// Gebundeld en gestart door test-maatgevend-ui.mjs. De resultaten zijn een vaste
// uitslag in de vorm van het kernantwoord; de afleiding zelf is getest in
// test-maatgevend.mjs (daar ook tegen de echte kern).
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import CheckPanel from "../src/components/panels/CheckPanel";
import CheckTableSection from "../src/components/report/sections/CheckTableSection";
import MaatgevendMarkering from "../src/components/fem/MaatgevendMarkering";
import { useCheckStore } from "../src/stores/checkStore";
import { useMaatgevendMarkeringStore } from "../src/stores/maatgevendMarkeringStore";
import ribbonNl from "../src/i18n/locales/nl/ribbon.json";
import checkNl from "../src/i18n/locales/nl/check.json";
import commonNl from "../src/i18n/locales/nl/common.json";

declare const THEMA: string;
const host = document.getElementById("test-root")!;
const tests: { name: string; error?: string }[] = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function ok(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); tests.push({ name }); } catch (error) { tests.push({ name, error: String(error) }); }
}

const krachten = { n_ed: 0, vy_ed: 0, vz_ed: 28.4, mt_ed: 0, my_ed: 61.2, mz_ed: 0 };
function toets(id: string, titel: string, artikel: string, uc: number | null, comb: number, x: number,
  extra: { status?: string; notes?: string[]; soort?: string } = {}) {
  return {
    id,
    kind: {
      type: extra.soort ?? "Resistance",
      data: {
        id, title: titel, article: artikel,
        force_state: { combination_id: comb, position_mm: x, forces: krachten },
        formula_latex: "M_{c,Rd} = W_{pl,y} f_y / \\gamma_{M0}", variables: [], intermediate_values: [], deelstappen: [],
        value: 83.2, unit: "kNm",
        uc: uc === null ? null : { ed: uc * 83.2, rd: 83.2, uc, formula_latex: "M_{Ed} / M_{c,Rd}" },
        status: extra.status ?? (uc !== null && uc > 1 ? "NotOk" : "Ok"),
        notes: extra.notes ?? [],
      },
    },
  };
}

const results = [
  {
    beam_id: 1, profile_name: "HEA 200", steel_grade: "S235", classification: "Class1",
    checks: [
      toets("6.2.4_compression", "Druk", "art. 6.2.4 (6.9)", null, 1, 0, { status: "NotApplicable", notes: ["N_Ed is geen drukkracht: de druktoets is hier niet van toepassing."] }),
      toets("6.2.5_bending_y", "Buiging om de y-as", "art. 6.2.5 (6.12)", 0.74, 3, 3000),
      toets("6.2.6_shear_z", "Afschuiving in z-richting", "art. 6.2.6 (6.17)", 0.21, 3, 0),
      toets("6.3.2_ltb", "Kipstabiliteit", "art. 6.3.2 (6.54)", 1.07, 3, 3000, { soort: "Stability" }),
      toets("deflection_w_fin", "Doorbuiging w_fin (BGT)", "NEN-EN 1990 (SLS)", 0.93, 0, 0),
    ],
    uc_max: 1.07, status: "NotOk", governing_check_id: "6.3.2_ltb",
  },
  {
    beam_id: 2, section_name: "96 x 450", strength_class: "C24", service_class: "Sc1", load_duration: "MediumTerm",
    checks: [
      toets("6.1.6_bending", "Buiging", "art. 6.1.6 (6.11)", 0.51, 4, 2400),
      toets("6.1.7_shear", "Afschuiving", "art. 6.1.7 (6.13)", 0.23, 4, 0),
      toets("deflection_w_fin", "Doorbuiging w_fin", "art. 7.2 + NB", 0.64, 0, 0),
    ],
    uc_max: 0.64, status: "Ok", governing_check_id: "deflection_w_fin",
  },
  {
    beam_id: 3, profile_name: "IPE 240", steel_grade: "S355", classification: "Class1",
    checks: [
      toets("6.2.5_bending_y", "Buiging om de y-as", "art. 6.2.5 (6.12)", 2.31, 6, 1800),
      toets("6.2.6_shear_z", "Afschuiving in z-richting", "art. 6.2.6 (6.17)", 0.35, 6, 3600),
    ],
    uc_max: 2.31, status: "NotOk", governing_check_id: "6.2.5_bending_y",
  },
];
const combinations = [
  { id: 3, name: "UGT 6.10b — Variabel (Q) leidend" },
  { id: 4, name: "UGT 6.10b — Sneeuw (S) leidend" },
  { id: 6, name: "UGT 6.10b — Wind (W) leidend" },
];

async function run() {
  document.documentElement.setAttribute("data-theme", THEMA);
  await i18next.use(initReactI18next).init({
    lng: "nl", resources: { nl: { check: checkNl, common: commonNl, ribbon: ribbonNl } }, defaultNS: "common", initImmediate: false,
  });
  useCheckStore.setState({
    results: results as never, lastRunAt: 1_790_000_000_000,
    lastRunData: { combinations } as never,
  });
  const geklikt: unknown[] = [];
  const root = createRoot(host);
  flushSync(() => root.render(<CheckPanel onToonOpTekenvlak={(d) => geklikt.push(d)} />));
  await tick(); await tick();
  const q = <T extends Element>(s: string) => host.querySelector<T>(s);
  const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];

  await test("modeloverzicht noemt de maatgevende staaf van het model: staaf 3, UC 2,31", () => {
    const top = q<HTMLElement>(".cp-model-top");
    ok(top, "modeloverzicht ontbreekt");
    ok(top.textContent!.includes("Staaf 3") && top.textContent!.includes("2,31"), top.textContent!);
    ok(qa(".cp-model-soort").length === 2, "per materiaal: staal en hout");
  });
  await test("elke kaart toont de maatgevende toets met combinatie en positie in mm", () => {
    const regels = qa(".cp-maatgevend");
    ok(regels.length === 3, `drie samenvattingsregels, niet ${regels.length}`);
    // nl-NL: duizendtallen met een punt, dus 3000 mm staat er als "3.000 mm".
    ok(regels[0].textContent!.includes("Kipstabiliteit") && regels[0].textContent!.includes("comb. 3 (UGT 6.10b") &&
      regels[0].textContent!.includes("x = 3.000 mm"), regels[0].textContent!);
    ok(regels[0].querySelector(".cp-maatgevend-label")?.textContent === "maatgevend", "het woord maatgevend staat erbij");
  });
  await test("doorbuiging maatgevend: geen combinatie, geen positie, en geen knop", () => {
    const regel = qa(".cp-maatgevend")[1];
    ok(regel.tagName !== "BUTTON", "zonder combinatie geen knop");
    ok(!regel.textContent!.includes("comb.") && !regel.textContent!.includes("x ="), regel.textContent!);
  });
  await test("klik op de maatgevende regel geeft staaf, combinatie en positie door", () => {
    flushSync(() => (qa(".cp-maatgevend")[0] as HTMLButtonElement).click());
    ok(JSON.stringify(geklikt.at(-1)) === JSON.stringify({ beamId: 1, combinatieId: 3, positieMm: 3000 }), JSON.stringify(geklikt.at(-1)));
  });
  await test("klik in het modeloverzicht klapt die kaart open en geeft het doel door", async () => {
    flushSync(() => q<HTMLButtonElement>(".cp-model-top")!.click());
    await tick(); await tick();
    ok(JSON.stringify(geklikt.at(-1)) === JSON.stringify({ beamId: 3, combinatieId: 6, positieMm: 1800 }), JSON.stringify(geklikt.at(-1)));
    const open = qa(".cp-card-head[aria-expanded='true']");
    ok(open.length === 1 && open[0].textContent!.includes("Staaf 3"), "kaart van staaf 3 open");
    flushSync(() => open[0].click());
  });
  await test("opengeklapt: lijst op UC aflopend, maatgevende rij gelabeld, n.v.t. onderaan met reden", async () => {
    flushSync(() => qa(".cp-card-head")[0].click());
    await tick();
    const rijen = qa(".cp-toetsregel");
    ok(rijen.length === 5, `vijf toetsen, niet ${rijen.length}`);
    ok(rijen[0].classList.contains("cp-toetsregel-maatgevend") && rijen[0].textContent!.includes("Kipstabiliteit"), "maatgevend bovenaan");
    ok(rijen[0].querySelector(".cp-maatgevend-label"), "label maatgevend in de rij");
    const laatste = rijen[4].textContent!;
    ok(laatste.includes("Druk") && laatste.includes("telt niet mee als maatgevend") && laatste.includes("N_Ed is geen drukkracht"), laatste);
    ok(rijen[0].querySelector(".cp-ucbalk-overschreden") && rijen[1].querySelector(".cp-ucbalk-letop") && rijen[2].querySelector(".cp-ucbalk-goed"),
      "balkjes in de drie klassen");
    ok(qa(".check-block")[0].classList.contains("check-block-maatgevend"), "de eerste afleiding is de maatgevende");
  });
  await test("normvolgorde: de lijst en de afleidingen volgen de kern, het label blijft", async () => {
    const knop = qa(".cp-volgorde-knop").find((k) => k.textContent === "normvolgorde");
    ok(knop, "knop normvolgorde ontbreekt");
    flushSync(() => knop.click());
    await tick();
    const rijen = qa(".cp-toetsregel");
    ok(rijen[0].textContent!.includes("Druk") && rijen[3].classList.contains("cp-toetsregel-maatgevend"), rijen.map((r) => r.textContent).join(" | "));
    ok(qa(".check-title")[0].textContent!.includes("Druk"), "afleidingen in normvolgorde");
    ok(knop.getAttribute("aria-pressed") === "true", "aria-pressed op de gekozen volgorde");
    flushSync(() => qa(".cp-volgorde-knop")[0].click());
  });
  await test("het balkje zet UC = 1,0 op twee derde en kapt af boven 1,5", async () => {
    flushSync(() => qa(".cp-card-head")[2].click());
    await tick();
    const balk = qa(".cp-model-top .cp-ucbalk")[0];
    ok(balk.querySelector<HTMLElement>(".cp-ucbalk-grens")!.style.left === "66.7%", "grens op 66,7 %");
    ok(balk.querySelector(".cp-ucbalk-afgekapt"), "UC 2,31 is afgekapt");
    ok(balk.getAttribute("aria-label")!.includes("overschreden"), balk.getAttribute("aria-label")!);
  });

  // ── Het live rapport: dezelfde afleiding, één regel per staaf ──
  const rapportHost = document.createElement("div");
  rapportHost.style.display = "none";
  document.body.appendChild(rapportHost);
  const rapportRoot = createRoot(rapportHost);
  flushSync(() => rapportRoot.render(<CheckTableSection />));
  await tick();
  await test("rapport: combinatie en positie onder de maatgevende toets, niets waar de kern niets levert", () => {
    const rijen = [...rapportHost.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "");
    ok(rijen.length === 3, `drie rijen, niet ${rijen.length}`);
    ok(rijen[0].includes("Kipstabiliteit") && rijen[0].includes("comb. 3") && rijen[0].includes("x = 3.000 mm"), rijen[0]);
    ok(rijen[1].includes("Doorbuiging") && !rijen[1].includes("comb.") && !rijen[1].includes("x ="), rijen[1]);
    ok(rapportHost.textContent!.includes("tellen niet mee als maatgevend"), "toelichting ontbreekt");
  });
  flushSync(() => rapportRoot.unmount());

  // ── De markering op het tekenvlak ──
  const svgHost = document.createElement("div");
  svgHost.style.display = "none";
  document.body.appendChild(svgHost);
  const svgRoot = createRoot(svgHost);
  const tekenvlak = (activeCombinationId: number | null) => {
    flushSync(() => svgRoot.render(
      <svg>
        <MaatgevendMarkering
          nodes={[{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }]}
          beams={[{ id: 1, from: 1, to: 2 }]}
          worldToScreen={(x, z) => ({ x: x / 10, y: z / 10 })}
          activeCombinationId={activeCombinationId}
        />
      </svg>,
    ));
    return svgHost.querySelector("circle");
  };
  await test("tekenvlak: ring op x = 3000 mm, alleen bij combinatie 3 en de lopende toetsronde", () => {
    useMaatgevendMarkeringStore.getState().zet({ beamId: 1, positieMm: 3000, combinatieId: 3, rondeVan: 1_790_000_000_000 });
    const ring = tekenvlak(3);
    ok(ring && ring.getAttribute("cx") === "300" && ring.getAttribute("cy") === "0", "ring op (300, 0)");
    ok(svgHost.textContent!.includes("x = 3.000 mm") && svgHost.textContent!.includes("comb. 3"), svgHost.textContent!);
    ok(tekenvlak(4) === null && tekenvlak(null) === null, "andere combinatie: geen markering");
    useMaatgevendMarkeringStore.getState().zet({ beamId: 1, positieMm: 3000, combinatieId: 3, rondeVan: 1 });
    ok(tekenvlak(3) === null, "markering uit een eerdere toetsronde blijft weg");
    useMaatgevendMarkeringStore.getState().wis();
  });
  flushSync(() => svgRoot.unmount());

  // Eindstand voor de schermafbeelding: kaart 1 open, de rest dicht, bovenaan.
  flushSync(() => qa(".cp-card-head")[2].click());
  await tick();
  q<HTMLElement>(".cp-body")!.scrollTop = 0;
  window.scrollTo(0, 0);

  document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: null });
}
run().catch((error) => {
  document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(error) });
});
