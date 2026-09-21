// Zoeken in de profielkiezer (issue #39) — de pure functie achter het zoekveld.
//
// WAT DEZE TEST BEWIJST
//  1. Eén term geeft treffers OVER ALLE REEKSEN HEEN, per reeks gegroepeerd en
//     per reeks geteld; binnen de reeks blijft de catalogusvolgorde (op maat).
//  2. Hoofdletters en spaties maken geen verschil: "hea160", "HEA 160" en
//     " hEa   160 " geven letterlijk dezelfde uitslag. Een komma is een punt en
//     een maalteken een x ("42,5", "100×50").
//  3. Er wordt op de LEESBARE naam gezocht, niet op de databasesleutel: "425"
//     levert DIN 42.5 (sleutel DIN425) niet op, "42.5" wel.
//  4. Een woord zonder cijfer mag de REEKS aanwijzen ("koker 100"); een woord
//     mét cijfer niet — anders zou "102" elke koker opleveren, want de
//     reeksnaam bevat "EN 10210". De rest van de term past als geheel: "heb 2"
//     is op weg naar HEB 2xx en levert geen HEB 120 op.
//  5. Oude reeksen doen mee maar staan onderaan; de rest houdt zijn volgorde.
//  6. Geen treffers en een lege term zijn twee verschillende toestanden: leeg
//     is "niet actief" (de kiezer werkt per reeks zoals altijd), geen treffers
//     is actief met nul groepen — en élke reeks staat dan op nul.
//  7. De pijltjestoetsen klemmen aan de randen van de treffers.
//  8. "In dit project" per stap: staal in de staalstap, hout in de houtstap,
//     beton en vrij materiaal in geen van beide.
//  9. De aansluiting in ProfielKiezer.tsx: zoekveld met label en aria, Esc wist
//     eerst de term, en de vier talen dragen de teksten.
//
// De verwachte aantallen in sectie 1 zijn met de hand uit synthetische reeksen
// afgeleid; de controles tegen de echte catalogus (sectie 2 e.v.) noemen alleen
// profielen waarvan de naam in `steelSectionDims.generated.ts` staat.
//
// Draaien met: npx tsx test-profiel-zoeken.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const z = await import("./src/lib/profielZoeken.ts");
const { REEKSEN, profielLabel } = await import("./src/lib/profieleditor/catalogus.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
// De hoofdmap staat op CRLF; de broncontroles lezen daarom genormaliseerd.
const lees = (pad) => readFileSync(join(HIER, pad), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed += 1; log(`  ok   ${naam}`); }
  else { failed += 1; log(`  FOUT ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
}
function checkEq(naam, gekregen, verwacht) {
  const a = JSON.stringify(gekregen);
  const b = JSON.stringify(verwacht);
  checkTrue(naam, a === b, `kreeg ${a}, verwacht ${b}`);
}

// ── 1. Synthetische reeksen: de regels, met de hand na te tellen ──────────
log("\n1. Treffers per reeks op een kleine, met de hand getelde catalogus");
const p = (label) => ({ sleutel: label.replace(/[ .]/g, "").toUpperCase(), label });
const KLEIN = [
  { id: "IPE", oud: false, zoektekst: "IPE", profielen: ["IPE 160", "IPE 240", "IPE 600"].map(p) },
  { id: "HEA", oud: false, zoektekst: "HEA", profielen: ["HEA 160", "HEA 240", "HEA 1000"].map(p) },
  // Een oude reeks MIDDENIN, zoals in de echte catalogus: hij moet naar onderen.
  { id: "DIN", oud: true, zoektekst: "DIN (oud)", profielen: ["DIN 16", "DIN 24", "DIN 42.5"].map(p) },
  { id: "KOKER", oud: false, zoektekst: "Koker warmvervaardigd (SHS/RHS, EN 10210)", profielen: ["SHS 160x160x8", "RHS 200x100x10"].map(p) },
  { id: "L", oud: false, zoektekst: "L gelijkbenig", profielen: ["L 80x80x8", "L 160x160x15"].map(p) },
];

const u160 = z.zoekProfielen("160", KLEIN);
checkTrue("'160' is een actieve zoekopdracht", u160.actief === true);
checkEq("'160' → IPE, HEA, koker en L — de oude DIN 16 niet (16 ≠ 160)",
  u160.groepen.map((g) => [g.reeksId, g.treffers]),
  [["IPE", ["IPE160"]], ["HEA", ["HEA160"]], ["KOKER", ["SHS160X160X8"]], ["L", ["L160X160X15"]]]);
checkEq("aantal per reeks, ook de reeks zonder treffer", u160.perReeks, { IPE: 1, HEA: 1, DIN: 0, KOKER: 1, L: 1 });
checkEq("totaal = som van de reeksen", u160.totaal, 4);

const u16 = z.zoekProfielen("16", KLEIN);
checkEq("'16' → de oude reeks doet mee maar staat ONDERAAN",
  u16.groepen.map((g) => g.reeksId), ["IPE", "HEA", "KOKER", "L", "DIN"]);
checkTrue("de groep draagt de vlag 'oud'", u16.groepen.at(-1).oud === true && u16.groepen[0].oud === false);

const u24 = z.zoekProfielen("24", KLEIN);
checkEq("'24' → binnen de reeks blijft de catalogusvolgorde",
  u24.groepen.map((g) => [g.reeksId, g.treffers]),
  [["IPE", ["IPE240"]], ["HEA", ["HEA240"]], ["DIN", ["DIN24"]]]);

// ── 2. Hoofdletters, spaties, komma en maalteken ──────────────────────────
log("\n2. Ongevoelig voor hoofdletters, spaties en schrijfwijze");
const basis = JSON.stringify(z.zoekProfielen("HEA 160", KLEIN));
for (const term of ["hea160", "HEA160", "hea 160", " hEa   160 ", "HEA-160", "hea" + String.fromCharCode(9) + "160"]) {
  checkTrue(`"${term}" geeft dezelfde uitslag als "HEA 160"`, JSON.stringify(z.zoekProfielen(term, KLEIN)) === basis);
}
checkEq("'HEA 160' → precies één treffer", z.vlakkeTreffers(z.zoekProfielen("HEA 160", KLEIN)), ["HEA160"]);
checkEq("'hea 1' → HEA 160 én HEA 1000 (deel van de naam volstaat)",
  z.vlakkeTreffers(z.zoekProfielen("hea 1", KLEIN)), ["HEA160", "HEA1000"]);
checkEq("'42,5' (komma) vindt DIN 42.5", z.vlakkeTreffers(z.zoekProfielen("42,5", KLEIN)), ["DIN425"]);
checkEq("'42.5' (punt) ook", z.vlakkeTreffers(z.zoekProfielen("42.5", KLEIN)), ["DIN425"]);
checkEq("'425' NIET: gezocht wordt op de naam, niet op de sleutel DIN425",
  z.vlakkeTreffers(z.zoekProfielen("425", KLEIN)), []);
checkEq("'200×100' (maalteken) vindt de koker", z.vlakkeTreffers(z.zoekProfielen("200×100", KLEIN)), ["RHS200X100X10"]);
checkEq("'200*100' (sterretje) ook", z.vlakkeTreffers(z.zoekProfielen("200*100", KLEIN)), ["RHS200X100X10"]);
checkEq("normaliseerZoektekst", z.normaliseerZoektekst("  HeA  1 60,5 × 3 "), "hea160.5x3");

// ── 3. De reeksnaam als zoekwoord ─────────────────────────────────────────
log("\n3. Een woord zonder cijfer mag in de reeksnaam staan");
checkEq("'koker' → alle kokers", z.vlakkeTreffers(z.zoekProfielen("koker", KLEIN)), ["SHS160X160X8", "RHS200X100X10"]);
checkEq("'koker 160' → alleen de koker van 160", z.vlakkeTreffers(z.zoekProfielen("koker 160", KLEIN)), ["SHS160X160X8"]);
checkEq("'gelijkbenig 80' → de hoeklijn van 80", z.vlakkeTreffers(z.zoekProfielen("gelijkbenig 80", KLEIN)), ["L80X80X8"]);
checkEq("'oud' → de oude reeks", z.zoekProfielen("oud", KLEIN).groepen.map((g) => g.reeksId), ["DIN"]);
checkEq("'102' levert GEEN kokers op, al staat 'EN 10210' in de reeksnaam",
  z.vlakkeTreffers(z.zoekProfielen("102", KLEIN)), []);
checkEq("'L 160' vindt de hoeklijn op zijn naam; een losse letter is geen reekswoord",
  z.vlakkeTreffers(z.zoekProfielen("L 160", KLEIN)), ["L160X160X15"]);
checkEq("'koker 200x100' → de rest van de term past als geheel op de profielnaam",
  z.vlakkeTreffers(z.zoekProfielen("koker 200 x 100", KLEIN)), ["RHS200X100X10"]);
checkEq("'din oud' → 'din' staat in de naam, 'oud' wijst de reeks aan",
  z.vlakkeTreffers(z.zoekProfielen("din oud", KLEIN)), ["DIN16", "DIN24", "DIN425"]);
checkEq("'hea 6' → NIET HEA 160: de woorden passen als geheel ('hea6'), niet los",
  z.vlakkeTreffers(z.zoekProfielen("hea 6", KLEIN)), []);
checkEq("'koker 102' evenmin: het woord met een cijfer moet in de profielnaam staan",
  z.vlakkeTreffers(z.zoekProfielen("koker 102", KLEIN)), []);

// ── 4. Leeg en geen treffers ──────────────────────────────────────────────
log("\n4. Lege term en geen treffers");
for (const leeg of ["", "   ", "\t"]) {
  const u = z.zoekProfielen(leeg, KLEIN);
  checkTrue(`lege term ${JSON.stringify(leeg)} → niet actief, geen groepen`, u.actief === false && u.groepen.length === 0 && u.totaal === 0);
}
const niets = z.zoekProfielen("bestaatniet 999", KLEIN);
checkTrue("geen treffers → wél actief", niets.actief === true);
checkEq("geen treffers → nul groepen en totaal nul", [niets.groepen.length, niets.totaal], [0, 0]);
checkEq("geen treffers → élke reeks staat op nul", niets.perReeks, { IPE: 0, HEA: 0, DIN: 0, KOKER: 0, L: 0 });
checkEq("zoeken in een lege catalogus", z.zoekProfielen("160", []), { actief: true, groepen: [], perReeks: {}, totaal: 0 });

// ── 5. Filter op één reeks en de pijltjestoetsen ──────────────────────────
log("\n5. Reeksfilter tijdens het zoeken en de markering");
checkEq("vlakkeTreffers volgt de schermvolgorde (oud onderaan)",
  z.vlakkeTreffers(u16), ["IPE160", "HEA160", "SHS160X160X8", "L160X160X15", "DIN16"]);
checkEq("met een reeksfilter blijft alleen die reeks over", z.vlakkeTreffers(u16, "HEA"), ["HEA160"]);
checkEq("een reeks zonder treffers geeft een lege lijst", z.vlakkeTreffers(u160, "DIN"), []);
const lijst = ["A", "B", "C"];
checkEq("omlaag zonder markering → de eerste", z.verplaatsMarkering(lijst, null, 1), "A");
checkEq("omhoog zonder markering → de laatste", z.verplaatsMarkering(lijst, null, -1), "C");
checkEq("omlaag vanaf A → B", z.verplaatsMarkering(lijst, "A", 1), "B");
checkEq("omlaag vanaf de laatste klemt", z.verplaatsMarkering(lijst, "C", 1), "C");
checkEq("omhoog vanaf de eerste klemt", z.verplaatsMarkering(lijst, "A", -1), "A");
checkEq("een markering die niet meer in de lijst staat, begint opnieuw", z.verplaatsMarkering(lijst, "Z", 1), "A");
checkEq("lege lijst → geen markering", z.verplaatsMarkering([], "A", 1), null);

// ── 6. De echte catalogus ─────────────────────────────────────────────────
log("\n6. Tegen de staalcatalogus van de app");
const CAT = z.catalogusZoekReeksen();
checkEq("dezelfde reeksen, in dezelfde volgorde, als de catalogus", CAT.map((r) => r.id), REEKSEN.map((r) => r.id));
checkEq("precies de vier oude reeksen dragen de vlag", CAT.filter((r) => r.oud).map((r) => r.id), ["DIE", "DIL", "DIN", "INP"]);
checkTrue("de vlag valt samen met '(oud)' in het Nederlandse label",
  REEKSEN.every((r) => (r.oud === true) === r.label.includes("(oud)")));
checkTrue("elke reeks heeft profielen, met de leesbare naam als label",
  CAT.every((r) => r.profielen.length > 0 && r.profielen.every((x) => x.label === profielLabel(x.sleutel))));

const echt = z.zoekProfielen("HEB 240", CAT);
checkEq("'HEB 240' → één treffer, in HEB", echt.groepen.map((g) => [g.reeksId, g.treffers]), [["HEB", ["HEB240"]]]);
checkTrue("'heb240' geeft hetzelfde", JSON.stringify(z.zoekProfielen("heb240", CAT)) === JSON.stringify(echt));

const heb2 = z.vlakkeTreffers(z.zoekProfielen("heb 2", CAT)).map(profielLabel);
checkTrue("'heb 2' → alleen HEB 2xx, geen HEB 120 of HEB 320",
  heb2.length >= 5 && heb2.every((n) => n.startsWith("HEB 2")), heb2.join(", "));

const e160 = z.zoekProfielen("160", CAT);
for (const [reeks, sleutel] of [["IPE", "IPE160"], ["HEA", "HEA160"], ["HEB", "HEB160"], ["HEM", "HEM160"], ["UNP", "UNP160"]]) {
  checkTrue(`'160' vindt ${sleutel} in de reeks ${reeks}`,
    e160.groepen.find((g) => g.reeksId === reeks)?.treffers.includes(sleutel) === true);
}
checkTrue("'160' → de som per reeks is het totaal",
  Object.values(e160.perReeks).reduce((a, b) => a + b, 0) === e160.totaal && e160.totaal >= 5);
const volgorde = e160.groepen.map((g) => g.oud);
checkTrue("'160' → geen gangbare reeks ná een oude reeks",
  volgorde.every((oud, i) => oud || !volgorde.slice(0, i).some(Boolean)), JSON.stringify(e160.groepen.map((g) => g.reeksId)));
checkTrue("'160' → er doet minstens één oude reeks mee", volgorde.some(Boolean));
checkTrue("elke treffer bevat de term in zijn leesbare naam",
  z.vlakkeTreffers(e160).every((s) => z.normaliseerZoektekst(profielLabel(s)).includes("160")));
checkTrue("UNP-namen zonder spatie in de database ('UNP350') worden met spatie gevonden",
  z.vlakkeTreffers(z.zoekProfielen("UNP 350", CAT)).includes("UNP350"));

const vertaald = z.catalogusZoekReeksen((r) => (r.id === "KOKER" ? "Hollow section, hot-finished" : r.label));
checkTrue("de vertaalde reeksnaam is het zoekwoord ('hollow' vindt de kokers, 'koker' niet meer)",
  z.zoekProfielen("hollow", vertaald).groepen.map((g) => g.reeksId).join() === "KOKER" &&
  z.zoekProfielen("koker", vertaald).totaal === 0);

// ── 7. bevatZoekterm voor lijsten zonder reeksen ──────────────────────────
log("\n7. Eigen doorsneden: zoeken op naam");
checkTrue("lege term past op alles", z.bevatZoekterm("Gelaste ligger 600", "") && z.bevatZoekterm("x", "   "));
checkTrue("hoofdletters en spaties", z.bevatZoekterm("Gelaste ligger 600", "LIGGER600"));
checkTrue("losse woorden in willekeurige volgorde", z.bevatZoekterm("Gelaste ligger 600", "600 gelast"));
checkTrue("geen treffer", !z.bevatZoekterm("Gelaste ligger 600", "koker"));

// ── 8. "In dit project" per stap ──────────────────────────────────────────
log("\n8. 'In dit project' toont per stap alleen wat die stap kan maken");
const GEBRUIKT = [
  { material: "S235", profile: "HEA160", aantal: 3 },
  { material: "S355", profile: "HEB 240", aantal: 1 },
  { material: "C24", profile: "71x171", aantal: 8 },
  { material: "GL24h", profile: "CLT 40/20/40", aantal: 1 },
  { material: "C30/37", profile: "300x500", aantal: 2 },
  { material: "VRIJ:Steen E=5000 rho=1800 f=2", profile: "300x500", aantal: 1 },
  { material: "S235", profile: "EIGEN:abc", aantal: 1 },
  { material: "S235", profile: "bestaat niet", aantal: 1 },
];
checkEq("staalstap: alleen catalogusprofielen in staal (ook 'HEB 240' met spatie)",
  z.inGebruikVoorStap(GEBRUIKT, "staal").map((g) => g.profile), ["HEA160", "HEB 240"]);
checkEq("houtstap: massief b×h en kruislaaghout",
  z.inGebruikVoorStap(GEBRUIKT, "hout").map((g) => g.profile), ["71x171", "CLT 40/20/40"]);
checkEq("het aantal reist ongewijzigd mee", z.inGebruikVoorStap(GEBRUIKT, "staal")[0].aantal, 3);
checkEq("lege lijst blijft leeg", z.inGebruikVoorStap([], "staal"), []);

// ── 9. Aansluiting in de component en de vier talen ───────────────────────
log("\n9. ProfielKiezer.tsx gebruikt de functie; toegankelijkheid en talen");
const tsx = lees("src/components/fem/ProfielKiezer.tsx");
const css = lees("src/components/fem/ProfielKiezer.css");
checkTrue("de component importeert de zoekfunctie uit lib/profielZoeken",
  /from "\.\.\/\.\.\/lib\/profielZoeken"/.test(tsx) && /\bzoekProfielen\(/.test(tsx));
checkTrue("de component zoekt niet zelf (geen eigen toLowerCase-filter op profielnamen)",
  !/profielLabel\([^)]*\)\.toLowerCase\(\)/.test(tsx));
checkTrue("het zoekveld heeft een zichtbaar label dat eraan vastzit (htmlFor = id)",
  /<label[^>]*htmlFor=\{zoekId\}/.test(tsx) && /id=\{zoekId\}/.test(tsx));
checkTrue("het zoekveld is een combobox die naar de lijst wijst",
  /role="combobox"/.test(tsx) && /aria-controls=\{lijstId\}/.test(tsx) && /aria-activedescendant=/.test(tsx));
checkTrue("de treffers staan in een listbox met opties", /role="listbox"/.test(tsx) && /role="option"/.test(tsx));
checkTrue("het aantal treffers wordt voorgelezen (role=status)", /role="status"/.test(tsx));
checkTrue("Esc wist eerst de term en houdt de toets dan weg bij het venster",
  /e\.key === "Escape"[\s\S]{0,200}stopPropagation\(\)/.test(tsx));
checkTrue("'In dit project' staat ook in de profielstap", /inGebruikVoorStap\(/.test(tsx));
checkTrue("focus is zichtbaar op het zoekveld, de rijen en de snelkeuzen",
  /\.pk-zoek-invoer:focus-visible/.test(css) && /\.pk-rij:focus-visible/.test(css) && /\.pk-gebruikt-knop:focus-visible/.test(css));
checkTrue("de gemarkeerde treffer is zichtbaar zonder dat hij de focus heeft", /\.pk-rij\.gemarkeerd/.test(css));

const SLEUTELS = [
  "searchLabel", "searchLabelStart", "searchPlaceholder", "searchClear", "searchHint",
  "searchCount_one", "searchCount_other", "searchNone", "searchNoneHint", "allSeries",
  "seriesHits_one", "seriesHits_other", "inUsePickTitle_one", "inUsePickTitle_other",
  "searchOwnLabel", "searchOwnNone",
];
for (const taal of ["nl", "en", "de", "fr"]) {
  const pp = JSON.parse(lees(`src/i18n/locales/${taal}/check.json`)).profilePicker;
  const mist = SLEUTELS.filter((k) => typeof pp[k] !== "string" || pp[k].trim() === "");
  checkTrue(`${taal}: alle ${SLEUTELS.length} zoekteksten aanwezig`, mist.length === 0, mist.join(", "));
}
const basisSleutels = SLEUTELS.map((k) => k.replace(/_(one|other)$/, ""));
const ongebruikt = [...new Set(basisSleutels)].filter((k) => !tsx.includes(`profilePicker.${k}`));
checkTrue("elke zoektekst wordt in de component gebruikt", ongebruikt.length === 0, ongebruikt.join(", "));

// ── Slot ──────────────────────────────────────────────────────────────────
log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
