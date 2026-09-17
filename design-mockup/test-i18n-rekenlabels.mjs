// Labels uit .ts-bestanden lopen via i18n (issue #21).
//
// WAT HIER MISGING
//  De interface is vertaald in vier talen, maar een handvol labels kwam als
//  vaste Nederlandse tekst uit .ts-bestanden: het staaftype en de randnaam van
//  een plaatlast (femTypes), het meervoud van een lastsoort in het
//  contextmenu, de lagen en lanen van het betonvenster (dekkingLagen), de
//  vormaanduiding, snapnamen, lassoorten en gatplaatsen van de profieleditor.
//  In het Engels, Duits en Frans gaf dat gemengde zinnen ("Select all
//  lijnlasten (3)"). test-i18n-vaste-tekst ziet dat niet: die scant alleen
//  letterlijke tekst in JSX, en deze labels kwamen via een constante binnen.
//
// WAT DEZE TEST VASTLEGT
//  [1] Elke sleutel die deze .ts-bestanden teruggeven, bestaat in nl/en/de/fr.
//  [2] De en/de/fr-tekst is geen Nederlands gebleven: niet gelijk aan nl (op
//      korte, taalneutrale woorden na) en zonder Nederlandse vakwoorden.
//  [3] De sleutels werken via i18next zoals de componenten ze gebruiken (met
//      naamruimte-voorvoegsel, ook vanuit een andere naamruimte).
//  [4] De componenten gebruiken de Nederlandse varianten die voor de kern en
//      de IFC-export blijven bestaan (`plaatRandLabel`, `BEAM_LOAD_ROLE_LABEL`)
//      niet meer, en de .ts-bestanden bevatten de oude teksten niet meer.
//  [5] De drie ongebruikte ribbon-sleutels zijn uit alle talen weg.
//
// De rekenkern-bestanden laden zelf GEEN i18n: ze geven een sleutel, de
// component vertaalt. Dat blijft zo omdat femTypes in de sidecarbundel zit.
//
// Uitvoeren: npx tsx test-i18n-rekenlabels.mjs   (vanuit design-mockup/)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(HIER, "src", "i18n", "locales");
const TALEN = ["nl", "en", "de", "fr"];

const {
  BEAM_LOAD_ROLES, BEAM_LOAD_ROLE_SLEUTEL, BEAM_LOAD_ROLE_LABEL, LOAD_SOORT_MEERVOUD,
  plaatRandSleutel, plaatRandTekst, plaatRandLabel,
} = await import("./src/components/fem/femTypes.ts");
const { LAGEN, momentLaan, dwarskrachtLaan } = await import("./src/components/beton/dekking/dekkingLagen.ts");
const { VORM_SLEUTEL } = await import("./src/lib/profieleditor/opslaan.ts");
const { VANG_SLEUTEL } = await import("./src/lib/profieleditor/snappunten.ts");
const { LASSOORT_SLEUTEL, LASSOORT_KORT_SLEUTEL } = await import("./src/lib/profieleditor/lassen.ts");
const { plaatsSleutel } = await import("./src/lib/profieleditor/geometrie.ts");
const { zetTaal, default: i18next } = await import("./scripts/i18n-voor-tests.mjs");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

const cache = {};
const leesNs = (taal, ns) =>
  (cache[`${taal}/${ns}`] ??= JSON.parse(readFileSync(join(LOCALES, taal, `${ns}.json`), "utf8")));
/** "check:profileEditor.snap.hoek" → de tekst in `taal`, of undefined. */
function tekst(taal, sleutel) {
  const [ns, pad] = sleutel.split(":");
  let o = leesNs(taal, ns);
  for (const d of pad.split(".")) o = o?.[d];
  return typeof o === "string" ? o : undefined;
}

// ── De sleutels die de .ts-bestanden teruggeven ─────────────────────────
const sleutels = new Map(); // sleutel → herkomst
const neem = (herkomst, sleutel) => sleutels.set(sleutel, herkomst);
for (const r of BEAM_LOAD_ROLES) neem("BEAM_LOAD_ROLE_SLEUTEL", BEAM_LOAD_ROLE_SLEUTEL[r.id]);
for (const s of Object.values(LOAD_SOORT_MEERVOUD)) neem("LOAD_SOORT_MEERVOUD", s);
for (const adres of [
  { edge: "bottom" }, { edge: "top" }, { edge: "left" }, { edge: "right" },
  { edgeIndex: 2 }, { openingId: 7, edgeIndex: 2 }, { openingId: 7 }, {},
]) neem("plaatRandSleutel", plaatRandSleutel(adres).sleutel);
for (const l of LAGEN) { neem("LAGEN.label", l.label); neem("LAGEN.hint", l.hint); }
neem("momentLaan", momentLaan({ side: "Bottom", punten: [] }, "").titel);
neem("momentLaan", momentLaan({ side: "Top", punten: [] }, "").titel);
neem("dwarskrachtLaan", dwarskrachtLaan([], null, "").titel);
for (const s of Object.values(VORM_SLEUTEL)) neem("VORM_SLEUTEL", s);
for (const s of Object.values(VANG_SLEUTEL)) neem("VANG_SLEUTEL", s);
for (const s of Object.values(LASSOORT_SLEUTEL)) neem("LASSOORT_SLEUTEL", s);
for (const s of Object.values(LASSOORT_KORT_SLEUTEL)) neem("LASSOORT_KORT_SLEUTEL", s);
const basissen = [{ soort: "ISection" }, { soort: "Shs" }, { soort: "Chs" }, { soort: "Angle" }, { soort: "Rechthoek" }];
for (const b of basissen) {
  for (const plaats of ["lijf", "flensBoven", "flensOnder", "wand", "vlak"]) {
    const k = plaatsSleutel(plaats, b);
    neem("plaatsSleutel", `check:profileEditor.holes.place.${k}`);
    if (plaats !== "vlak") neem("plaatsSleutel (kort)", `check:profileEditor.holes.placeShort.${k}`);
  }
}

log("\n[1] Elke sleutel bestaat in alle vier de talen");
check(`${sleutels.size} sleutels verzameld`, sleutels.size >= 50, String(sleutels.size));
for (const taal of TALEN) {
  const ontbreekt = [...sleutels].filter(([s]) => tekst(taal, s) === undefined).map(([s, h]) => `${h}: ${s}`);
  check(`${taal}: alle sleutels aanwezig`, ontbreekt.length === 0, ontbreekt.slice(0, 6).join("; "));
}

log("\n[2] Engels, Duits en Frans zijn geen Nederlands gebleven");
// Korte woorden die in twee talen gelijk mogen zijn ("Unity checks", "Raster",
// "centre"); een langere tekst gelijk aan nl is vrijwel zeker onvertaald.
const GELIJK_TOEGESTAAN_TOT = 12;
const NEDERLANDS = new RegExp(
  "\\b(" + [
    "onbekend", "gevel", "linkergevel", "rechtergevel", "dak", "hellend", "plat",
    "overstek", "luifel", "vloer", "binnenstaaf", "geen", "windvlak", "lijnlasten", "puntlasten",
    "momenten", "temperatuurlasten", "gelast", "dubbelsymmetrisch", "kip", "toegestaan",
    "koker", "ronde", "buis", "toetsing", "weigert", "hoekpunt", "midden", "hart", "zwaartepunt", "vrij",
    "hoeklas", "enkelzijdig", "dubbelzijdig", "stomp", "volledig", "doorgelast", "enkel", "dubbel",
    "momentendekking", "dwarskrachtdekking", "scheurwijdte", "onder", "boven", "naast", "snede", "per zijde",
    "lijf", "flens", "bovenflens", "onderflens", "buiswand", "linkerwand", "been", "door", "langsgat", "van", "het", "een",
  ].join("|") + ")\\b",
  "i",
);
// Woorden die in een van de andere talen gewoon zo heten: "Rand", "Randlasten"
// en "Wand" zijn Duits, "opening" is Engels. Ze tellen alleen in de talen waar
// ze niet thuishoren.
const OOK_NEDERLANDS = {
  en: /\b(rand|randlasten|wand)\b/i,
  de: /\b(opening)\b/i,
  fr: /\b(rand|randlasten|wand|opening)\b/i,
};
for (const taal of ["en", "de", "fr"]) {
  const gelijk = [];
  const nederlands = [];
  for (const [s] of sleutels) {
    const nl = tekst("nl", s);
    const t = tekst(taal, s);
    if (t === undefined) continue;
    if (t === nl && nl.length > GELIJK_TOEGESTAAN_TOT) gelijk.push(`${s} = "${t}"`);
    const zonder = t.replace(/\{\{[^}]*\}\}/g, "");
    if (NEDERLANDS.test(zonder) || OOK_NEDERLANDS[taal].test(zonder)) nederlands.push(`${s} = "${t}"`);
  }
  check(`${taal}: geen tekst letterlijk gelijk aan nl`, gelijk.length === 0, gelijk.slice(0, 4).join("; "));
  check(`${taal}: geen Nederlandse woorden`, nederlands.length === 0, nederlands.slice(0, 4).join("; "));
}
check("de woordenlijst herkent het Nederlands zelf",
  [...sleutels].filter(([s]) => NEDERLANDS.test(tekst("nl", s) ?? "")).length >= sleutels.size * 0.6);

log("\n[3] Via i18next, zoals de componenten ze gebruiken");
await zetTaal("de");
check("de: plaatRandTekst rand-index → \"Rand 3\"", plaatRandTekst({ edgeIndex: 2 }, i18next.t) === "Rand 3",
  plaatRandTekst({ edgeIndex: 2 }, i18next.t));
check("de: meervoud lijnlast → \"Linienlasten\"", i18next.t(LOAD_SOORT_MEERVOUD.lineLoad) === "Linienlasten");
check("de: sleutel met naamruimte werkt vanuit een andere naamruimte",
  i18next.getFixedT("de", "check")(BEAM_LOAD_ROLE_SLEUTEL.vloer) === "Decke",
  i18next.getFixedT("de", "check")(BEAM_LOAD_ROLE_SLEUTEL.vloer));
check("de: contextmenu zonder Nederlands",
  !/lijnlasten/.test(i18next.t("common:canvas.contextMenu.selectAllOfType", { soort: i18next.t(LOAD_SOORT_MEERVOUD.lineLoad), n: 3 })));
await zetTaal("fr");
check("fr: randnaam opening", plaatRandTekst({ openingId: 2, edgeIndex: 0 }, i18next.t) === "bord 1 de l'ouverture 2",
  plaatRandTekst({ openingId: 2, edgeIndex: 0 }, i18next.t));
check("fr: lassoort kort", i18next.t(LASSOORT_KORT_SLEUTEL.StompVolledig) === "bout à bout");
await zetTaal("en");
check("en: vormaanduiding, kort deel vóór \" — \"",
  i18next.t(VORM_SLEUTEL.Onbekend).split(" — ")[0] === "Unknown", i18next.t(VORM_SLEUTEL.Onbekend));
await zetTaal("nl");
check("nl: plaatRandTekst gelijk aan het Nederlandse plaatRandLabel (zelfde indeling)",
  [{ edge: "left" }, { edgeIndex: 4 }, { openingId: 7, edgeIndex: 2 }, { openingId: 7 }, {}]
    .every((a) => plaatRandTekst(a, i18next.t) === plaatRandLabel(a)));
check("nl: staaftype via sleutel gelijk aan het IFC-label",
  BEAM_LOAD_ROLES.every((r) => i18next.t(BEAM_LOAD_ROLE_SLEUTEL[r.id]) === BEAM_LOAD_ROLE_LABEL[r.id]));
check("nl: snapnaam hoek heet 'hoekpunt'", i18next.t(VANG_SLEUTEL.hoek) === "hoekpunt");
check("elke vertaling van de vorm Onbekend houdt \" — \" als scheiding",
  TALEN.every((t) => (tekst(t, VORM_SLEUTEL.Onbekend) ?? "").includes(" — ")));

log("\n[4] Geen Nederlandse labelteksten meer in de interface-aanroepen");
const SRC = join(HIER, "src");
const tsx = [];
(function loop(map) {
  for (const n of readdirSync(map)) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) loop(p);
    else if (n.endsWith(".tsx")) tsx.push(p);
  }
})(SRC);
const gebruiktNl = tsx.filter((p) => /\b(plaatRandLabel|BEAM_LOAD_ROLE_LABEL)\b/.test(readFileSync(p, "utf8")));
check("geen .tsx gebruikt plaatRandLabel of BEAM_LOAD_ROLE_LABEL", gebruiktNl.length === 0,
  gebruiktNl.map((p) => p.slice(SRC.length + 1)).join(", "));
const bron = (rel) => readFileSync(join(SRC, rel), "utf8");
const oud = [
  ["components/fem/femTypes.ts", /"lijnlasten"|"temperatuurlasten"/],
  ["components/beton/dekking/dekkingLagen.ts", /label: "Momentendekking"|titel: "Dwarskrachtdekking"|`Momentendekking /],
  ["lib/profieleditor/opslaan.ts", /"Gelast I, /],
  ["lib/profieleditor/snappunten.ts", /hoek: "hoekpunt"/],
  ["lib/profieleditor/lassen.ts", /"hoeklas, enkelzijdig"/],
  ["lib/profieleditor/geometrie.ts", /"door het lijf"/],
];
for (const [rel, re] of oud) check(`${rel}: oude Nederlandse labeltekst weg`, !re.test(bron(rel)));
check("GatPaneel gebruikt de gedeelde plaatsSleutel (geen eigen kopie)",
  /plaatsSleutel,/.test(bron("components/profieleditor/GatPaneel.tsx")) &&
  !/function plaatsSleutel/.test(bron("components/profieleditor/GatPaneel.tsx")));

log("\n[5] Ongebruikte ribbon-sleutels zijn weg");
for (const taal of TALEN) {
  const r = leesNs(taal, "ribbon").report;
  check(`${taal}: cltFiguurBijschrift, plateKindNote, eisSegmenten bestaan niet meer`,
    r && !("cltFiguurBijschrift" in r) && !("plateKindNote" in r) && !("eisSegmenten" in r));
}

log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} ok, ${failed} fout\n`);
process.exit(failed === 0 ? 0 : 1);
