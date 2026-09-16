// Geen vaste Nederlandse zinnen in de JSX van de componenten.
//
// Waarom een test: de app kent vier talen (nl/en/de/fr, zie test-i18n-talen),
// maar een component die een zin rechtstreeks in de JSX zet, valt daar buiten
// zonder dat iets faalt — een Duitse gebruiker ziet dan gewoon Nederlands. Deze
// scan leest elke .tsx onder src/ met de TypeScript-parser en meldt zichtbare
// tekst die er Nederlands uitziet:
//   1. tekst tussen JSX-tags,
//   2. de attributen title, aria-label, placeholder, label en alt,
//   3. een letterlijke string als JSX-expressie ({"…"} of {cond ? "…" : "…"}).
// Tekst binnen een t()-aanroep telt niet (dat is een sleutel of terugval).
//
// "Ziet er Nederlands uit" is een eenvoudige woordenlijst: lidwoorden,
// voegwoorden en vakwoorden die in het Engels, Duits en Frans niet voorkomen.
// Eenheden, symbolen en normnummers raken die lijst niet. De scan is bewust
// grof — hij vangt zinnen, geen losse samenstellingen — en wat terecht vast
// blijft, staat in UITZONDERINGEN met een reden.
//
// Uitvoeren: node test-i18n-vaste-tekst.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HIER = dirname(fileURLToPath(import.meta.url));
const SRC = join(HIER, "src");
const ts = createRequire(import.meta.url)("typescript");

let geslaagd = 0;
let gefaald = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(voorwaarde, omschrijving, toelichting = "") {
  if (voorwaarde) {
    geslaagd += 1;
    log(`  ok   ${omschrijving}`);
  } else {
    gefaald += 1;
    log(`  FOUT ${omschrijving}${toelichting ? `\n${toelichting}` : ""}`);
  }
}

// Korte functiewoorden die alleen Nederlands kunnen zijn. "is", "of" en "in"
// staan er niet in: die komen ook in het Engels voor. Ze tellen alleen in
// kleine letters of met één hoofdletter vooraan ("De staaf", "Geen …"), niet
// in kapitalen: "EN 1993" is een normnummer en "DE" een taalcode.
const FUNCTIEWOORDEN = [
  "de", "het", "een", "niet", "geen", "wordt", "worden", "werd", "van", "voor", "met", "zijn", "naar",
  "uit", "nog", "alleen", "bij", "en", "op", "kan", "moet", "deze", "dit", "als", "dan", "ook", "wel",
];
const FUNCTIEWOORD = new RegExp(
  "\\b(" + FUNCTIEWOORDEN.map((w) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`).join("|") + ")\\b",
);
// Vakwoorden en UI-werkwoorden, in elke schrijfwijze.
const VAKWOORD = new RegExp(
  "\\b(" +
    [
      "staaf", "staven", "knoop", "knopen", "plaat", "platen", "belasting", "belastingen", "toetsing",
      "oplegging", "opleggingen", "berekening", "doorsnede", "wapening", "kies", "selecteer", "klik",
      "opslaan", "verwijderen", "toevoegen", "annuleren", "sluiten", "bestand", "instellingen", "weergave",
      "mislukt", "gelukt", "ongeldig", "onbekend", "leeg", "geselecteerd", "invoer", "uitvoer", "breedte",
      "hoogte", "lengte", "dikte", "gewicht", "richting", "rand", "hoek", "positie",
    ].join("|") +
    ")\\b",
  "i",
);
const lijktNederlands = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s) && (FUNCTIEWOORD.test(s) || VAKWOORD.test(s));

/**
 * Bewust vaste teksten. Sleutel: pad onder src/ (met /), waarde: Map van de
 * genormaliseerde tekst naar de reden. Een sleutel die op "/" eindigt geldt
 * voor een hele map, met de tekst "*" voor alles erin; zo'n mapuitzondering
 * hoeft geen treffers te hebben, alleen te bestaan. Een uitzondering per
 * tekst moet nog voorkomen, anders is ze verouderd.
 */
const UITZONDERINGEN = new Map([
  [
    "lib/wind/",
    new Map([["*", "de windgenerator (dialoog en schema) wordt in zijn eigen spoor vertaald; lib/wind/ is daar in bewerking"]]),
  ],
]);
const uitzonderingVoor = (rel) =>
  UITZONDERINGEN.get(rel) ?? [...UITZONDERINGEN].find(([k]) => k.endsWith("/") && rel.startsWith(k))?.[1];

const ATTRIBUTEN = new Set(["title", "aria-label", "placeholder", "label", "alt"]);

function bestanden(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) bestanden(pad, uit);
    else if (naam.endsWith(".tsx")) uit.push(pad);
  }
  return uit;
}

const normaal = (s) => s.replace(/\s+/g, " ").trim();

function scan(pad, bron = readFileSync(pad, "utf8")) {
  const sf = ts.createSourceFile(pad, bron, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const treffers = [];
  const regel = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const meld = (n, soort, tekst) => {
    const t = normaal(tekst);
    if (lijktNederlands(t)) treffers.push({ regel: regel(n), soort, tekst: t });
  };
  const isLetterlijk = (e) => e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e));
  /** Letterlijke strings in een JSX-expressie, ook in de takken van ?: en &&/||. */
  const expressie = (e, n, soort) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return expressie(e.expression, n, soort);
    if (isLetterlijk(e)) return meld(n, soort, e.text);
    if (ts.isConditionalExpression(e)) {
      expressie(e.whenTrue, n, soort);
      expressie(e.whenFalse, n, soort);
    } else if (ts.isBinaryExpression(e) && ["&&", "||", "??"].includes(e.operatorToken.getText(sf))) {
      expressie(e.right, n, soort);
    }
  };
  const bezoek = (n) => {
    // Alles binnen t(…) / i18next.t(…) is een sleutel met eventuele terugval.
    if (ts.isCallExpression(n) && /^(t|t[A-Z]\w*|i18n\.t|i18next\.t)$/.test(n.expression.getText(sf))) return;
    if (ts.isJsxText(n)) meld(n, "JSX-tekst", n.text);
    else if (ts.isJsxAttribute(n) && n.initializer && ATTRIBUTEN.has(n.name.getText(sf))) {
      const init = n.initializer;
      if (ts.isStringLiteral(init)) meld(n, `attribuut ${n.name.getText(sf)}`, init.text);
      else if (ts.isJsxExpression(init)) expressie(init.expression, n, `attribuut ${n.name.getText(sf)}`);
    } else if (ts.isJsxExpression(n) && !ts.isJsxAttribute(n.parent)) expressie(n.expression, n, "JSX-expressie");
    ts.forEachChild(n, bezoek);
  };
  bezoek(sf);
  return treffers;
}

log("\n1. Zichtbare tekst in .tsx-componenten loopt via i18n");
const alle = bestanden(SRC).sort();
ok(alle.length > 80, `${alle.length} .tsx-bestanden gevonden onder src/`);

let totaal = 0;
let uitgezonderd = 0;
const gebruikteUitzonderingen = new Set();
for (const pad of alle) {
  const rel = relative(SRC, pad).split(sep).join("/");
  const lijst = uitzonderingVoor(rel);
  const treffers = scan(pad).filter((t) => {
    if (!lijst) return true;
    if (lijst.has("*")) {
      uitgezonderd += 1;
      return false;
    }
    if (lijst.has(t.tekst)) {
      gebruikteUitzonderingen.add(`${rel}|${t.tekst}`);
      uitgezonderd += 1;
      return false;
    }
    return true;
  });
  totaal += treffers.length;
  if (treffers.length > 0) {
    ok(
      false,
      `${rel}: ${treffers.length} vaste Nederlandse tekst(en) buiten i18n`,
      treffers.map((t) => `         r.${t.regel} ${t.soort}: ${JSON.stringify(t.tekst)}`).join("\n") +
        "\n         → zet de tekst in de locales (nl/en/de/fr) en gebruik t(); of, als hij terecht vast is, " +
        "neem hem met reden op in UITZONDERINGEN.",
    );
  }
}
ok(totaal === 0, `geen vaste Nederlandse teksten in JSX (${uitgezonderd} bewust uitgezonderd)`);

log("\n2. De uitzonderingslijst blijft bij de tijd");
const verouderd = [];
for (const [rel, lijst] of UITZONDERINGEN) {
  for (const [tekst, reden] of lijst) {
    if (!reden || reden.length < 20) verouderd.push(`${rel}: "${tekst}" heeft geen reden`);
    if (rel.endsWith("/")) {
      if (!existsSync(join(SRC, rel))) verouderd.push(`${rel}: de map bestaat niet (meer)`);
    } else if (!gebruikteUitzonderingen.has(`${rel}|${tekst}`)) {
      verouderd.push(`${rel}: "${tekst}" komt niet (meer) voor`);
    }
  }
}
ok(verouderd.length === 0, "elke uitzondering heeft een reden en is nog van toepassing", verouderd.map((v) => `         ${v}`).join("\n"));

log("\n3. De scan herkent de bekende patronen");
{
  // Zelfproef op een stukje JSX, zodat een kapotte scan niet stil 0 meldt.
  const proef = [
    "export const A = ({ t, x }: any) => (",
    '  <div title="Kies een staaf">',
    "    Geen staven geselecteerd",
    '    {x ? "Plaat toevoegen" : "Add plate"}',
    '    <input placeholder={t("props.x", "Leeg = de staaflengte")} aria-label="Breedte" />',
    '    <b title="DE">De lijn wordt gesplitst</b>',
    "    kN/m · M_Ed · NEN-EN 1993-1-1 art. 6.3.2 · EN 1995",
    "  </div>",
    ");",
  ].join("\n");
  const treffers = scan("proef.tsx", proef).map((t) => t.tekst);
  ok(treffers.includes("Kies een staaf"), "attribuut title wordt gevonden");
  ok(treffers.includes("Geen staven geselecteerd"), "JSX-tekst wordt gevonden");
  ok(treffers.includes("Plaat toevoegen"), "string in een ?:-tak wordt gevonden");
  ok(treffers.includes("Breedte"), "attribuut aria-label wordt gevonden");
  ok(treffers.includes("De lijn wordt gesplitst"), "functiewoord met hoofdletter vooraan telt");
  ok(!treffers.some((t) => t.includes("staaflengte")), "terugvaltekst binnen t() telt niet");
  ok(
    !treffers.some((t) => t.includes("kN/m") || t === "Add plate" || t === "DE"),
    "eenheden, symbolen, normnummers (EN …), taalcodes en Engels tellen niet",
  );
}

log("");
log(`${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
