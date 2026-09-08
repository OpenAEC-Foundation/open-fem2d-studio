// Doorsnedekleur in de miniatuur — wat er ná het samenstellen op het scherm
// staat, niet wat er in het bestand staat.
//
// Beton heeft één afgesproken vlakkleur: #C0C0C0 = 192-192-192, in élk thema
// gelijk (materiaalkleurenblok in `themes.css`, en `beton/tekenkleuren.ts`).
// Die afspraak is niet te bewaken door alleen de `fill` te lezen: de miniatuur
// staat in `.pk-tekening` met `background: var(--theme-bg)`, dus zodra het pad
// een dekking onder 1 heeft mengt de themakleur mee en is de uitkomst zowel
// afwijkend als thema-afhankelijk. Met de dekking op 0,95 gaf dat
// rgb(195,195,195) in het lichte thema en rgb(184,184,185) in openaec.
//
// Deze test rendert de component werkelijk, plukt vulling en dekking uit de
// SVG, leest de tokens uit `themes.css` en `ProfielKiezer.css`, en stelt de
// kleur samen zoals de browser dat doet: src·α + dst·(1−α), afgerond.
//
// Draaien met: npx tsx test-doorsnede-kleur.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const ProfielMiniatuur = (await import("./src/components/shared/ProfielMiniatuur.tsx")).default;

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, cond, uitleg = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${uitleg ? ": " + uitleg : ""}`); }
}
function checkEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; log(`  ✓ ${name}: ${JSON.stringify(actual)}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`); }
}

// ── Hulpjes: CSS lezen en kleuren rekenen ─────────────────────────────────

// Genormaliseerd naar LF: de CSS in de repo staat in CRLF en een selector die
// over twee regels loopt (`:root,` + `[data-theme="light"]`) is anders niet
// letterlijk terug te vinden.
const lees = (p) => readFileSync(join(hier, p), "utf8").replace(/\r\n/g, "\n");
const themesCss = lees("src/themes.css");
const kiezerCss = lees("src/components/fem/ProfielKiezer.css");

/** Het declaratieblok dat op `selector` volgt (tokenblokken zijn vlak). */
function blok(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`selector niet gevonden: ${selector}`);
  const open = css.indexOf("{", i);
  const dicht = css.indexOf("}", open);
  return css.slice(open + 1, dicht);
}

/** Laatste waarde van `--naam` in een stuk CSS. */
function token(css, naam) {
  const treffers = [...css.matchAll(new RegExp(`--${naam}\\s*:\\s*([^;]+);`, "g"))];
  if (!treffers.length) throw new Error(`token niet gevonden: --${naam}`);
  return treffers[treffers.length - 1][1].trim();
}

function hexNaarRgb(hex) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

/** Zoals de browser samenstelt: bron over achtergrond, per kanaal afgerond. */
function meng(voorgrond, achtergrond, alfa) {
  return voorgrond.map((v, i) => Math.round(v * alfa + achtergrond[i] * (1 - alfa)));
}

/** De `var(--x, #fallback)`-notatie uit de SVG uit elkaar halen. */
function varMetTerugval(waarde) {
  const m = /^var\(\s*(--[\w-]+)\s*,\s*([^)]+)\)$/.exec(waarde.trim());
  if (!m) throw new Error(`geen var() met terugval: ${waarde}`);
  return { naam: m[1], terugval: m[2].trim() };
}

// ── 1. Wat de component werkelijk rendert ─────────────────────────────────
log("1. Vulling en dekking uit de gerenderde SVG");

const RECHTHOEK = { type: "rect", h: 500, b: 300 };

/** Het eerste `<path>` in de SVG is de doorsnedecontour. */
function doorsnedePad(materiaal, shape = RECHTHOEK) {
  const html = renderToStaticMarkup(
    React.createElement(ProfielMiniatuur, { shape, materiaal, maatvoering: false }),
  );
  const m = /<path\b[^>]*>/.exec(html);
  if (!m) throw new Error(`geen <path> in de SVG voor materiaal ${materiaal}`);
  const tag = m[0];
  const attr = (naam) => {
    const t = new RegExp(`${naam}="([^"]*)"`).exec(tag);
    return t ? t[1] : null;
  };
  return { fill: attr("fill"), stroke: attr("stroke"), opacity: attr("opacity") };
}

const beton = doorsnedePad("beton");
const staal = doorsnedePad("staal");
const hout = doorsnedePad("hout");
const vrij = doorsnedePad("vrij");

const betonVul = varMetTerugval(beton.fill);
checkEq("beton vult met de materiaaltoken", betonVul.naam, "--theme-beton-vlak");
checkEq("beton-terugval in de SVG is 192-192-192", hexNaarRgb(betonVul.terugval), [192, 192, 192]);
checkEq("beton tekent volledig dekkend", Number(beton.opacity), 1);

// De verzachting hoort te blijven staan waar de vulling het thema tóch volgt.
checkEq("staal houdt zijn verzachting", Number(staal.opacity), 0.95);
checkEq("vrij materiaal houdt zijn verzachting", Number(vrij.opacity), 0.95);
checkEq("hout ongewijzigd (geen exacte afspraak)", Number(hout.opacity), 0.95);

// ── 2. De tokens waarmee de browser rekent ────────────────────────────────
log("2. Tokens uit themes.css en ProfielKiezer.css");

const betonVlak = token(themesCss, "theme-beton-vlak");
checkEq("--theme-beton-vlak staat op 192-192-192", hexNaarRgb(betonVlak), [192, 192, 192]);

// De miniatuur staat op de paneelachtergrond; als dat ooit een andere token
// wordt, verandert ook de menging en moet deze test opnieuw bekeken worden.
const paneel = blok(kiezerCss, ".pk-tekening {");
checkTrue(
  "paneel .pk-tekening heeft background var(--theme-bg)",
  /background:\s*var\(--theme-bg\)/.test(paneel),
  paneel.trim().slice(0, 120),
);

const THEMAS = {
  light: ':root,\n[data-theme="light"]',
  openaec: '[data-theme="openaec"]',
  blueprint: '[data-theme="blueprint"]',
};
const achtergrond = {};
for (const [naam, selector] of Object.entries(THEMAS)) {
  achtergrond[naam] = hexNaarRgb(token(blok(themesCss, selector), "theme-bg"));
}
log(`  · achtergronden: ${Object.entries(achtergrond).map(([k, v]) => `${k} rgb(${v})`).join(", ")}`);

// ── 3. De kleur die op het scherm belandt ─────────────────────────────────
log("3. Samengestelde betonkleur per thema");

const vulRgb = hexNaarRgb(betonVlak);
const dekking = Number(beton.opacity);

for (const naam of Object.keys(THEMAS)) {
  checkEq(`beton in ${naam}`, meng(vulRgb, achtergrond[naam], dekking), [192, 192, 192]);
}

// Vastleggen wat er stukgaat als de dekking terugkomt: dit is de reden dat
// beton op 1 staat, niet een voorkeur. De laatste bit kan in de browser één
// schelen (de kanalen landen soms precies op ,5), maar dát het afwijkt en dát
// het per thema verschilt is niet afrondingsgevoelig.
log("   (ter vergelijking, dekking 0,95 — de situatie die dit repareerde)");
for (const naam of Object.keys(THEMAS)) {
  const oud = meng(vulRgb, achtergrond[naam], 0.95);
  log(`   · ${naam}: rgb(${oud.join(",")})`);
  checkTrue(
    `dekking 0,95 zou in ${naam} afwijken van 192-192-192`,
    oud.some((v) => v !== 192),
  );
}
// Dezelfde menging was ook thema-afhankelijk — dát is de tweede fout.
const oudeKleuren = Object.keys(THEMAS).map((n) => meng(vulRgb, achtergrond[n], 0.95).join(","));
checkTrue(
  "dekking 0,95 gaf per thema een ándere betonkleur",
  new Set(oudeKleuren).size > 1,
  oudeKleuren.join(" | "),
);

// ── 4. De andere plek waar beton getekend wordt ───────────────────────────
log("4. DoorsnedeTekening tekent beton eveneens dekkend");

const doorsnedeTsx = lees("src/components/beton/DoorsnedeTekening.tsx");
const betonPolygoon = /<polygon[^>]*fill=\{kleuren\.betonVlak\}[^>]*\/>/.exec(doorsnedeTsx);
checkTrue("betonvlak-polygoon gevonden", betonPolygoon !== null);
checkTrue(
  "betonvlak-polygoon heeft geen opacity",
  betonPolygoon !== null && !/opacity/i.test(betonPolygoon[0]),
  betonPolygoon?.[0],
);
checkTrue(
  "geen opacity elders in DoorsnedeTekening",
  !/\bopacity/i.test(doorsnedeTsx),
);

// ── Uitslag ───────────────────────────────────────────────────────────────
log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
