// Doorsnedekleur in de miniatuur — wat er ná het samenstellen op het scherm
// staat, niet wat er in het bestand staat.
//
// TWEE materialen hebben een afgesproken vlakkleur die in élk thema gelijk
// hoort te zijn (materiaalkleurenblok in `themes.css`, en
// `beton/tekenkleuren.ts`):
//
//   beton  --theme-beton-vlak  #C0C0C0 = 192-192-192
//   hout   --theme-hout-vlak   #E9DECA = 233-222-202
//
// Die afspraak is niet te bewaken door alleen de `fill` te lezen: de miniatuur
// staat in `.pk-tekening` met `background: var(--theme-bg)`, dus zodra het pad
// een dekking onder 1 heeft mengt de themakleur mee en is de uitkomst zowel
// afwijkend als thema-afhankelijk. Met de dekking op 0,95:
//
//            licht         forge         openaec       blueprint     contrast
//   beton    195-195-195   185-185-185   184-184-184   183-184-185   182-182-182
//   hout     234-223-204   224-214-195   223-213-194   222-212-194   221-211-192
//
// Geen van die tien is de materiaalkleur, en geen twee kolommen zijn gelijk.
// Beton is daarom op dekking 1 gezet; hout bleef staan met als reden dat alleen
// voor beton een exacte RGB-waarde was afgesproken. Dat argument houdt geen
// stand tegen de belofte "in élk thema dezelfde kleur", die over de kleur op het
// SCHERM gaat en niet over de kleur in het bestand — dus staat hout nu ook op 1
// en pint deze test hem net zo hard vast als beton.
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

/** Zoals `token`, maar `null` in plaats van een uitzondering als hij ontbreekt. */
function tokenOfNiets(css, naam) {
  const treffers = [...css.matchAll(new RegExp(`--${naam}\\s*:\\s*([^;]+);`, "g"))];
  return treffers.length ? treffers[treffers.length - 1][1].trim() : null;
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

// De twee materialen met een afgesproken kleur: dezelfde eisen voor allebei.
// Hout stond hier tot september 2026 op 0,95 met als reden dat er voor hout
// geen exacte RGB-waarde was afgesproken; die uitzondering is weg, want de
// belofte "in élk thema dezelfde kleur" gaat over de kleur op het scherm.
const VAST = {
  beton: { pad: beton, token: "--theme-beton-vlak", rgb: [192, 192, 192] },
  hout: { pad: hout, token: "--theme-hout-vlak", rgb: [233, 222, 202] },
};
for (const [materiaal, { pad, token: tokenNaam, rgb }] of Object.entries(VAST)) {
  const vul = varMetTerugval(pad.fill);
  checkEq(`${materiaal} vult met de materiaaltoken`, vul.naam, tokenNaam);
  checkEq(`${materiaal}-terugval in de SVG is ${rgb.join("-")}`, hexNaarRgb(vul.terugval), rgb);
  checkEq(`${materiaal} tekent volledig dekkend`, Number(pad.opacity), 1);
}

// De verzachting hoort te blijven staan waar de vulling het thema tóch volgt:
// daar is geen afspraak over de precieze RGB-waarde, en er valt dus ook niets
// van af te wijken.
checkEq("staal houdt zijn verzachting", Number(staal.opacity), 0.95);
checkEq("vrij materiaal houdt zijn verzachting", Number(vrij.opacity), 0.95);

// ── 2. De tokens waarmee de browser rekent ────────────────────────────────
log("2. Tokens uit themes.css en ProfielKiezer.css");

// Het materiaalkleurenblok staat op een KAAL `:root {`, ná de thema's. Dat is
// een andere selector dan de `:root,` van het lichte thema, en er is er maar
// één van.
const materiaalBlok = blok(themesCss, ":root {");
for (const { token: tokenNaam, rgb } of Object.values(VAST)) {
  checkEq(
    `${tokenNaam} staat op ${rgb.join("-")}`,
    hexNaarRgb(token(materiaalBlok, tokenNaam.slice(2))),
    rgb,
  );
}

// De miniatuur staat op de paneelachtergrond; als dat ooit een andere token
// wordt, verandert ook de menging en moet deze test opnieuw bekeken worden.
const paneel = blok(kiezerCss, ".pk-tekening {");
checkTrue(
  "paneel .pk-tekening heeft background var(--theme-bg)",
  /background:\s*var\(--theme-bg\)/.test(paneel),
  paneel.trim().slice(0, 120),
);

// ALLE thema's uit themes.css, niet een greep eruit. Een thema dat later wordt
// toegevoegd en hier niet in staat, wordt niet nagerekend; daarom telt de test
// hieronder ook of het er nog evenveel zijn als er `--theme-bg` in het bestand
// staan.
const THEMAS = {
  light: ':root,\n[data-theme="light"]',
  forge: '[data-theme="forge"]',
  openaec: '[data-theme="openaec"]',
  blueprint: '[data-theme="blueprint"]',
  contrast: '[data-theme="contrast"]',
};
const achtergrond = {};
const themaBlok = {};
for (const [naam, selector] of Object.entries(THEMAS)) {
  themaBlok[naam] = blok(themesCss, selector);
  achtergrond[naam] = hexNaarRgb(token(themaBlok[naam], "theme-bg"));
}
log(`  · achtergronden: ${Object.entries(achtergrond).map(([k, v]) => `${k} rgb(${v})`).join(", ")}`);
checkEq(
  "elk thema in themes.css wordt nagerekend",
  [...themesCss.matchAll(/--theme-bg\s*:/g)].length,
  Object.keys(THEMAS).length,
);

// ── 3. De kleur die op het scherm belandt ─────────────────────────────────
//
// Waarom dit méér is dan `meng(kleur, achtergrond, 1) === kleur` — wat een
// waarheid over `meng` zou zijn en niet over de app: de vulkleur wordt PER
// THEMA opgezocht. Het materiaalkleurenblok staat op `:root` en een thema mag
// hem overschrijven (dat zegt themes.css er zelf bij). Doet een thema dat, dan
// loopt de samengestelde kleur uiteen ook al is de dekking 1, en gaat deze
// sectie om terwijl sectie 1 groen blijft.
log("3. Samengestelde materiaalkleur per thema");

for (const [materiaal, { pad, token: tokenNaam, rgb }] of Object.entries(VAST)) {
  const dekking = Number(pad.opacity);
  const uitkomsten = [];
  for (const naam of Object.keys(THEMAS)) {
    // De token zoals díé zou uitpakken in dit thema: de override van het thema
    // als hij er is, anders de waarde uit het materiaalkleurenblok.
    const inThema = tokenOfNiets(themaBlok[naam], tokenNaam.slice(2));
    const vulRgb = hexNaarRgb(inThema ?? token(materiaalBlok, tokenNaam.slice(2)));
    const opScherm = meng(vulRgb, achtergrond[naam], dekking);
    uitkomsten.push(opScherm.join("-"));
    checkEq(`${materiaal} in ${naam}`, opScherm, rgb);
  }
  checkTrue(
    `${materiaal} heeft in alle ${uitkomsten.length} thema's dezelfde kleur`,
    new Set(uitkomsten).size === 1,
    uitkomsten.join(" | "),
  );
}

// Vastleggen wat er stukgaat als de dekking terugkomt: dát is de reden dat
// beton én hout op 1 staan, niet een voorkeur. De laatste eenheid kan één
// schelen waar een kanaal precies op ,5 landt (bij beton in openaec komt het
// blauwkanaal in exacte rekenkunde op 184,5 en in binary64 op 184,49999…, dus
// naar beneden), maar dát het afwijkt en dát het per thema verschilt is niet
// afrondingsgevoelig.
log("   (ter vergelijking, dekking 0,95 — de situatie die dit repareerde)");
for (const [materiaal, { rgb }] of Object.entries(VAST)) {
  const oudeKleuren = [];
  for (const naam of Object.keys(THEMAS)) {
    const oud = meng(rgb, achtergrond[naam], 0.95);
    oudeKleuren.push(oud.join("-"));
    checkTrue(
      `dekking 0,95 zou ${materiaal} in ${naam} van ${rgb.join("-")} laten afwijken`,
      oud.some((v, i) => v !== rgb[i]),
      oud.join("-"),
    );
  }
  log(`   · ${materiaal}: ${oudeKleuren.join(" | ")}`);
  // Dezelfde menging was ook thema-afhankelijk — dát is de tweede fout.
  checkTrue(
    `dekking 0,95 gaf ${materiaal} per thema een ándere kleur`,
    new Set(oudeKleuren).size > 1,
    oudeKleuren.join(" | "),
  );
}

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
