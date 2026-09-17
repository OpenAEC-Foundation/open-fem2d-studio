// Staafnummers worden hergebruikt — en niets mag daardoor meeverhuizen.
//
// WAT HIER MISGING (issue #18, basisaudit ruw 31)
//  Staafnummers lopen als `Math.max(bestaande) + 1`. Verwijder de staaf met het
//  hoogste nummer en teken een nieuwe, dan krijgt die hetzelfde nummer. Voor
//  geplakte lasten was dat opgelost (test-lasten-kopieren blok [9]); op drie
//  plekken sleutelde de app nog blind op het nummer:
//   - `verborgenToetsStaven` (rapport): de nieuwe staaf ontbrak in "Toetsing per
//     staaf" omdat de OUDE staaf met dat nummer daar was uitgezet;
//   - de focus van het toetsingspaneel: de kaart van de nieuwe staaf klapte na
//     de volgende ronde vanzelf open;
//   - de toetsstore: een ronde die nog liep toen het model veranderde, schreef
//     zijn antwoord ná het wissen alsnog weg — de uitslag van de oude staaf
//     onder het nummer van de nieuwe. Idem een oudere ronde die na een nieuwere
//     binnenkwam.
//
// WAT DEZE TEST VASTLEGT
//  [1] snoeiToetsStaafKeuze: een verdwenen staaf verliest zijn keuze, een
//      bestaande houdt hem; niets te wissen → hetzelfde object.
//  [2] De rapportstore, als scenario: staaf 6 uit het rapport, staaf 6
//      verwijderd, nieuwe staaf 6 → staat AAN.
//  [3] snoeiCheckFocus: dezelfde regel voor de focus.
//  [4] App.tsx roept beide aan bij elke wijziging van de staven. Bronteksttoets:
//      React-effecten draaien hier niet (geen DOM), en de afhankelijkheidslijst
//      IS hier het gedrag.
//  [5]-[7] De toetsstore met een nagebootste, VERTRAAGDE rekenkern: een ronde die na
//      `clear()` terugkomt schrijft niets; een oudere ronde die na een nieuwere
//      terugkomt ook niet [6]; ook niet met een fout [7]; `isRunning` sluit
//      correct af. Elk blok met een tegenproef zonder inhaalslag.
//
// Uitvoeren: npx tsx test-staafnummer-hergebruik.mjs   (vanuit design-mockup/)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));

const { snoeiToetsStaafKeuze, snoeiCheckFocus } = await import("./src/lib/verdwenenStaven.ts");
const { useReportStore, isToetsStaafZichtbaar, rapportSnapshot } =
  await import("./src/stores/reportStore.ts");
const { useCheckStore } = await import("./src/stores/checkStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] snoeiToetsStaafKeuze");
{
  const keuze = { "3": true, "6": true };
  const na = snoeiToetsStaafKeuze(keuze, new Set([1, 2, 3, 4, 5]));
  check("staaf 6 verdwenen → zijn keuze is weg", !("6" in na), JSON.stringify(na));
  check("staaf 3 bestaat nog → zijn keuze blijft", na["3"] === true);
  check("het origineel is niet aangeraakt", keuze["6"] === true);
  check("niets te wissen → hetzelfde object terug",
    snoeiToetsStaafKeuze(keuze, new Set([3, 6, 7])) === keuze);
  check("een lege keuze blijft hetzelfde object",
    (() => { const leeg = {}; return snoeiToetsStaafKeuze(leeg, new Set()) === leeg; })());
  const vreemd = snoeiToetsStaafKeuze({ "abc": true, "2": true }, new Set([2]));
  check("een sleutel die geen staafnummer is, wordt gewist",
    !("abc" in vreemd) && vreemd["2"] === true, JSON.stringify(vreemd));
  check("een leeg model wist alles",
    Object.keys(snoeiToetsStaafKeuze({ "1": true, "2": true }, new Set())).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Scenario rapport: verbergen, verwijderen, nieuwe staaf met hetzelfde nummer");
{
  const r = () => useReportStore.getState();
  r().resetToetsStaven();
  r().setToetsStaafZichtbaar(6, false);
  r().setToetsStaafZichtbaar(2, false);
  check("staaf 6 staat uit", !isToetsStaafZichtbaar(r().verborgenToetsStaven, 6));

  // Het model had staven 1..6; staaf 6 wordt verwijderd.
  r().snoeiToetsStaven(new Set([1, 2, 3, 4, 5]));
  check("na verwijderen staat staaf 6 niet meer in de keuze",
    !("6" in r().verborgenToetsStaven), JSON.stringify(r().verborgenToetsStaven));
  check("staaf 2 (bestaat nog) blijft uit", !isToetsStaafZichtbaar(r().verborgenToetsStaven, 2));

  // Een nieuwe staaf krijgt nummer 6 (max + 1).
  r().snoeiToetsStaven(new Set([1, 2, 3, 4, 5, 6]));
  check("de NIEUWE staaf 6 staat aan in het rapport",
    isToetsStaafZichtbaar(r().verborgenToetsStaven, 6));
  check("en het projectbestand draagt de oude keuze niet meer",
    !("6" in rapportSnapshot().verborgenToetsStaven));

  const voor = r().verborgenToetsStaven;
  r().snoeiToetsStaven(new Set([1, 2, 3, 4, 5, 6]));
  check("een snoei zonder verdwenen staaf laat de store ongemoeid",
    r().verborgenToetsStaven === voor);
  r().resetToetsStaven();
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] snoeiCheckFocus");
{
  const focus = { beamId: 6 };
  check("staaf 6 bestaat → dezelfde focus", snoeiCheckFocus(focus, new Set([6])) === focus);
  check("staaf 6 verdwenen → geen focus", snoeiCheckFocus(focus, new Set([1, 2])) === null);
  check("geen focus blijft geen focus", snoeiCheckFocus(null, new Set([6])) === null);
  // Scenario: badge van staaf 6 aangeklikt, staaf 6 verwijderd, nieuwe staaf 6.
  let f = focus;
  f = snoeiCheckFocus(f, new Set([1, 2, 3, 4, 5]));
  f = snoeiCheckFocus(f, new Set([1, 2, 3, 4, 5, 6]));
  check("de nieuwe staaf 6 erft de focus niet", f === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] App.tsx snoeit bij elke wijziging van de staven");
{
  const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8").replace(/\r\n/g, "\n");
  const effect = /useEffect\(\(\) => \{\n\s*const bestaandeStaven = new Set\(fem\.beams\.map\(\(b\) => b\.id\)\);([\s\S]{0,300}?)\}, \[fem\.beams\]\);/.exec(app);
  check("er is een effect op [fem.beams] dat de bestaande staven verzamelt", effect !== null);
  const lijf = effect?.[1] ?? "";
  check("het effect snoeit de rapportkeuze", /snoeiToetsStaven\(bestaandeStaven\)/.test(lijf));
  check("het effect snoeit de focus van het toetsingspaneel",
    /setCheckFocus\(\(f\) => snoeiCheckFocus\(f, bestaandeStaven\)\)/.test(lijf));
  check("App.tsx wist de toetsuitslag nog steeds bij een modelwijziging",
    /checkClear\(\);[\s\S]{0,4000}?\}, \[fem\.nodes, fem\.beams,/.test(app));
}

// ─────────────────────────────────────────────────────────────────────────
// Een nagebootste dev-brug met een rekenkern die pas antwoordt als de test dat
// zegt. De staven hebben een onbekend materiaal: geen enkele bouwer neemt ze,
// en de toetsstore meldt ze in `skipped` met het materiaal in de reden. Dat
// materiaal is het merkteken dat zegt uit WELKE ronde de uitslag komt.
//
// Elk blok laadt een VERSE toetsstore (eigen module-instantie via de
// zoekparameter): de store onthoudt de lijsten van de kern na het eerste
// antwoord, en dan zou een tweede ronde nergens meer op hoeven te wachten.
/** Openstaande kernvragen; elk element beantwoordt er een. */
let wachtend = [];
/** Staat dit aan op het moment van de VRAAG, dan weigert de kern haar. */
let faalModus = false;
globalThis.fetch = async () => {
  const faal = faalModus;
  await new Promise((los) => wachtend.push(los));
  return faal
    ? { ok: false, status: 503, text: async () => JSON.stringify({ fout: "nagebootste weigering" }) }
    : { ok: true, status: 200, text: async () => "[]" };
};
const stil = () => new Promise((los) => setTimeout(los, 0));
/** Beantwoord de gegeven vragen (standaard: alle openstaande) en wacht tot het stil is. */
async function antwoord(vragen = null) {
  const lijst = vragen ?? wachtend.splice(0);
  for (const los of lijst) los();
  for (let i = 0; i < 20; i++) await stil();
}
let volgnummer = 0;
const verseStore = async () =>
  (await import(`./src/stores/checkStore.ts?blok=${++volgnummer}`)).useCheckStore;
const ronde = (materiaal) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [{ id: 6, from: 1, to: 2, material: materiaal, profile: "—" }],
  supports: [], combinations: [], combinationResults: new Map(),
});
const reden6 = (store) => store.getState().skipped.find((s) => s.beamId === 6)?.reason ?? "";

log("\n[5] Toetsstore: een ronde die na het wissen terugkomt, schrijft niets");
{
  const tegen = await verseStore();
  const gewoon = tegen.getState().run(ronde("proefmateriaal"));
  await stil();
  check("tegenproef: de ronde wacht op de kern", wachtend.length > 0 && tegen.getState().isRunning);
  await antwoord();
  await gewoon;
  check("tegenproef: een ongestoorde ronde levert zijn uitslag",
    reden6(tegen).includes("proefmateriaal") && tegen.getState().lastRunAt !== null, reden6(tegen));

  const store = await verseStore();
  // Ronde op het OUDE model (staaf 6 = betonbalk) vertrekt ...
  const oud = store.getState().run(ronde("oude-betonbalk"));
  await stil();
  check("de ronde wacht op de kern", wachtend.length > 0 && store.getState().isRunning === true);
  // ... staaf 6 wordt verwijderd: het model-effect wist de uitslag ...
  store.getState().clear();
  // ... en dan pas antwoordt de kern.
  await antwoord();
  await oud;
  const s = store.getState();
  check("geen uitslag van de oude staaf 6", s.skipped.length === 0 && s.results.length === 0,
    JSON.stringify(s.skipped));
  check("geen run-tijd, geen modelinvoer", s.lastRunAt === null && s.lastRunData === null);
  check("de ingehaalde ronde is afgesloten", s.isRunning === false);
}

log("\n[6] Toetsstore: een oudere ronde die na een nieuwere terugkomt, schrijft niets");
{
  const store = await verseStore();
  const oud = store.getState().run(ronde("oude-betonbalk"));
  await stil();
  const vragenOud = wachtend.splice(0);           // de oude ronde blijft hangen
  check("de oude ronde wacht op de kern", vragenOud.length > 0);
  const nieuw = store.getState().run(ronde("nieuwe-stalen-staaf"));
  await stil();
  await antwoord();
  await nieuw;
  check("de nieuwe ronde staat er", reden6(store).includes("nieuwe-stalen-staaf"), reden6(store));
  check("isRunning volgt de nieuwste ronde", store.getState().isRunning === false);
  await antwoord(vragenOud);
  await oud;
  check("de oude ronde heeft de nieuwe uitslag NIET overschreven",
    reden6(store).includes("nieuwe-stalen-staaf") && !reden6(store).includes("oude-betonbalk"),
    reden6(store));
  check("er staat maar één regel voor staaf 6",
    store.getState().skipped.filter((x) => x.beamId === 6).length === 1);
  check("de oude ronde zette isRunning niet terug aan", store.getState().isRunning === false);
}

log("\n[7] Toetsstore: een FOUT van een ingehaalde ronde wist de verse uitslag niet");
{
  const store = await verseStore();
  faalModus = true;
  const oud = store.getState().run(ronde("oude-betonbalk"));
  await stil();
  const vragenOud = wachtend.splice(0);
  faalModus = false;
  const nieuw = store.getState().run(ronde("nieuwe-stalen-staaf"));
  await stil();
  await antwoord();
  await nieuw;
  await antwoord(vragenOud);
  await oud;
  const s = store.getState();
  check("geen foutbanner van de ingehaalde ronde", s.error === null, String(s.error));
  check("de verse uitslag staat er nog", reden6(store).includes("nieuwe-stalen-staaf"), reden6(store));

  // Tegenproef: zonder inhaalslag komt dezelfde weigering wél door.
  const tegen = await verseStore();
  faalModus = true;
  const alleen = tegen.getState().run(ronde("x"));
  await stil();
  faalModus = false;
  await antwoord();
  await alleen;
  check("tegenproef: een weigering van de lopende ronde staat er",
    tegen.getState().error === "nagebootste weigering", String(tegen.getState().error));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
