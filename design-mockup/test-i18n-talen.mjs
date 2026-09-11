// De vier talen van de app — Nederlands, Engels, Duits, Frans — dragen per
// naamruimte precies dezelfde sleutels, dezelfde {{plaatshouders}} en geen
// lege of vergeten (nog Nederlandse) teksten.
//
// Waarom dit een test is en geen afspraak: i18next valt bij een ontbrekende
// sleutel stil terug op de fallback-taal, dus een vergeten vertaling valt in
// de app niet op als fout maar als een Engels woord tussen het Duits. Deze
// test maakt dat wél een fout, en meteen, per sleutel.
//
// Uitvoeren: node test-i18n-talen.mjs   (geen tsx nodig, alleen JSON)

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(HIER, "src", "i18n", "locales");
const CONFIG = readFileSync(join(HIER, "src", "i18n", "config.ts"), "utf8");

const REFERENTIE = "nl";
const TALEN = ["nl", "en", "de", "fr"];
const NAAMRUIMTEN = ["common", "ribbon", "backstage", "settings", "feedback", "check"];

let geslaagd = 0;
let gefaald = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(voorwaarde, omschrijving, toelichting = "") {
  if (voorwaarde) {
    geslaagd += 1;
    log(`  ok   ${omschrijving}`);
  } else {
    gefaald += 1;
    log(`  FOUT ${omschrijving}${toelichting ? ` — ${toelichting}` : ""}`);
  }
}

/** Geneste JSON → platte lijst van "pad.naar.sleutel" → tekst. */
function plat(obj, prefix = "", uit = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const pad = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") plat(v, pad, uit);
    else uit.set(pad, v);
  }
  return uit;
}

const plaatshouders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(",");

const lees = (taal, ns) => JSON.parse(readFileSync(join(LOCALES, taal, `${ns}.json`), "utf8"));

/* ── 1. Mappen en registratie ─────────────────────────────────────────── */
log("\n1. Vier talen, geregistreerd en op schijf");
const mappen = readdirSync(LOCALES).sort();
ok(TALEN.every((t) => mappen.includes(t)), `mappen nl/en/de/fr bestaan (gevonden: ${mappen.join(", ")})`);
for (const t of TALEN) {
  ok(/code: "(auto|nl|en|de|fr)"/.test(CONFIG) && CONFIG.includes(`code: "${t}"`), `"${t}" staat in LANGUAGES`);
  ok(new RegExp(`\\b${t}: \\{ common: `).test(CONFIG), `"${t}" heeft alle zes naamruimten in resources`);
}
for (const ns of NAAMRUIMTEN) {
  ok(TALEN.every((t) => CONFIG.includes(`./locales/${t}/${ns}.json`)), `naamruimte "${ns}" wordt voor elke taal geïmporteerd`);
}

/* ── 2. Sleutelpariteit met het Nederlands ────────────────────────────── */
log("\n2. Dezelfde sleutels als het Nederlands, per naamruimte");
const ref = {};
for (const ns of NAAMRUIMTEN) ref[ns] = plat(lees(REFERENTIE, ns));
let totaalSleutels = 0;
for (const ns of NAAMRUIMTEN) totaalSleutels += ref[ns].size;
ok(totaalSleutels > 800, `referentie telt ${totaalSleutels} sleutels`);

for (const taal of TALEN.filter((t) => t !== REFERENTIE)) {
  for (const ns of NAAMRUIMTEN) {
    const eigen = plat(lees(taal, ns));
    const ontbreekt = [...ref[ns].keys()].filter((k) => !eigen.has(k));
    const teveel = [...eigen.keys()].filter((k) => !ref[ns].has(k));
    ok(
      ontbreekt.length === 0 && teveel.length === 0,
      `${taal}/${ns}: ${eigen.size} sleutels, gelijk aan nl`,
      `${ontbreekt.length} ontbreken (${ontbreekt.slice(0, 5).join(", ")}) · ${teveel.length} te veel (${teveel.slice(0, 5).join(", ")})`,
    );
  }
}

/* ── 3. Inhoud: niet leeg, plaatshouders gelijk, geen vergeten Nederlands ── */
log("\n3. Inhoud per vertaling");
// Een korte tekst mag in twee talen gelijk zijn ("Zone", "Datum", "Segment",
// "Help", een normnummer, een symbool). Een hele zin die letterlijk gelijk is
// aan het Nederlands is daarentegen vrijwel zeker niet vertaald; de grens
// ligt daarom op de lengte, niet op een lijst van uitzonderingen.
const GELIJK_TOEGESTAAN_TOT = 25;
// Eigennamen en slogans die in elke taal letterlijk zo horen te staan.
const GELIJK_MAG = new Set(["backstage.aboutPanel.tagline", "backstage.aboutPanel.stichting"]);
// Woorden die in een Duitse of Franse tekst alleen kunnen betekenen dat de
// Nederlandse tekst is blijven staan. Plaatshouders ({{staaf}}) worden eerst
// weggehaald: die heten in elke taal hetzelfde, want de code vult ze.
const NEDERLANDS = /\b(staaf|staven|knoop|knopen|belasting|toetsing|opleggingen|maatgevend|doorsnede|wapening|berekening|bestand|instellingen|weergave|verwijderen|opslaan|annuleren)\b/i;
const zonderPlaatshouders = (s) => String(s).replace(/\{\{[^}]*\}\}/g, "");

for (const taal of TALEN.filter((t) => t !== REFERENTIE)) {
  let leeg = 0;
  let plaatsFout = [];
  let onvertaald = [];
  let nederlands = [];
  for (const ns of NAAMRUIMTEN) {
    const eigen = plat(lees(taal, ns));
    for (const [k, v] of eigen) {
      if (typeof v !== "string" || v.trim() === "") leeg += 1;
      if (plaatshouders(v) !== plaatshouders(ref[ns].get(k))) plaatsFout.push(`${ns}.${k}`);
      const nl = ref[ns].get(k);
      if (v === nl && String(nl).length > GELIJK_TOEGESTAAN_TOT && !GELIJK_MAG.has(`${ns}.${k}`)) onvertaald.push(`${ns}.${k}`);
      if (taal !== "en" && NEDERLANDS.test(zonderPlaatshouders(v))) nederlands.push(`${ns}.${k}`);
    }
  }
  ok(leeg === 0, `${taal}: geen lege teksten`, `${leeg} leeg`);
  ok(plaatsFout.length === 0, `${taal}: {{plaatshouders}} gelijk aan nl`, plaatsFout.slice(0, 6).join(", "));
  ok(onvertaald.length === 0, `${taal}: geen letterlijk gelijk aan nl gebleven teksten`, `${onvertaald.length}: ${onvertaald.slice(0, 8).join(", ")}`);
  ok(nederlands.length === 0, `${taal}: geen Nederlandse kernwoorden blijven staan`, `${nederlands.length}: ${nederlands.slice(0, 8).join(", ")}`);
}

/* ── 4. De taalkeuze zelf ─────────────────────────────────────────────── */
log("\n4. Taalnamen in de eigen taal");
ok(CONFIG.includes('name: "Deutsch"') && CONFIG.includes('name: "Français"'), "Deutsch en Français heten zo in de keuzelijst");

log("");
log(`${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
