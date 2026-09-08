// Een UNP is géén UPE — de toelopende flens moet ook op de TEKENING staan.
//
// De doorsnedegrootheden van de UNP-reeks waren altijd al goed; de tekening
// niet. UNP en UPE heten in de profieldatabase allebei "Channel" en kwamen
// daardoor op één tekenvorm met evenwijdige flenzen uit. Een UNP 200 zag er
// dus uit als een UPE 200.
//
// De helling is niet verzonnen maar opgezocht:
//
//  * de oude staaltabel, tabel VII "U-Ijzer (D.N.P.)", noemt in de kop
//    "Helling der flenzen = 8%", met "straal van de binnenste afronding r = t"
//    en "van de buitenste r₁ = t/2";
//  * dezelfde 8 % staat al in deze repo, in
//    src-tauri/crates/section-properties/src/channel.rs
//    (`UNP_FLENSHELLING`) en src/contour.rs (`UNP_SCHUINTE`), met DIN 1026-1
//    als bron.
//
// Waar `tf` geldt is even belangrijk als de helling zelf: bij een toelopende
// flens is de catalogusmaat de dikte op HALVE FLENSBREEDTE (x = b/2 vanaf de
// rug van het lijf), niet de gemiddelde dikte en niet de dikte bij het lijf.
// Deze test toont dat aan uit de catalogus zelf: alleen met die afspraak komt
// het oppervlak van de getekende contour bij de gepubliceerde A uit.
//
// Draaien met: npx tsx test-unp-flenshelling.mjs
//          (of: node scripts/run-tests.mjs --filter=unp-flenshelling)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const PROFIELEN = resolve(
  HIER,
  "..",
  "src-tauri",
  "crates",
  "steel-profiles",
  "data",
  "profiles.json",
);

const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { shapeVanProfiel, shapePath, flensDikte, flensHellingVanProfiel } = await import(
  "./src/components/shared/profielVorm.ts"
);

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

function bijna(gemeten, verwacht, marge, omschrijving) {
  const afwijking = Math.abs(gemeten - verwacht);
  ok(
    afwijking <= marge,
    omschrijving,
    `gemeten ${gemeten.toFixed(4)}, verwacht ${verwacht.toFixed(4)} (marge ${marge})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  Gereedschap: een SVG-pad terugrekenen naar een veelhoek en zijn oppervlak *
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Middelpunt-vorm van een SVG-boog met rx = ry = r en zonder asdraaiing.
 * Dit is de omkering uit de SVG-specificatie (endpoint → center parameter-
 * isatie); we hebben hem nodig omdat het pad de bogen in eindpuntvorm schrijft
 * en het oppervlak alleen uit een fijne bemonstering volgt.
 */
function boogPunten(x1, y1, r, grootBoog, sweep, x2, y2, stappen) {
  if (r <= 0) return [[x2, y2]];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  let rr = r;
  const lambda = (dx * dx + dy * dy) / (rr * rr);
  if (lambda > 1) rr *= Math.sqrt(lambda);
  const noemer = rr * rr * (dx * dx + dy * dy);
  const teller = rr * rr * rr * rr - noemer;
  const factor =
    (grootBoog === sweep ? -1 : 1) * Math.sqrt(Math.max(0, teller) / Math.max(noemer, 1e-12));
  const cx = factor * dy + (x1 + x2) / 2;
  const cy = -factor * dx + (y1 + y2) / 2;
  const t1 = Math.atan2(y1 - cy, x1 - cx);
  const t2 = Math.atan2(y2 - cy, x2 - cx);
  let dt = t2 - t1;
  if (sweep === 0 && dt > 0) dt -= 2 * Math.PI;
  if (sweep === 1 && dt < 0) dt += 2 * Math.PI;
  const punten = [];
  for (let i = 1; i <= stappen; i += 1) {
    const t = t1 + (dt * i) / stappen;
    punten.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return punten;
}

/** Pad (alleen M/L/A/Z, zoals shapePath ze voor een U-profiel schrijft) → veelhoek. */
function padNaarVeelhoek(d, stappen = 400) {
  const tk = d.trim().split(/\s+/);
  const punten = [];
  let i = 0;
  let x = 0;
  let z = 0;
  while (i < tk.length) {
    const cmd = tk[i];
    i += 1;
    if (cmd === "M" || cmd === "L") {
      x = Number(tk[i]);
      z = Number(tk[i + 1]);
      i += 2;
      punten.push([x, z]);
    } else if (cmd === "A") {
      const r = Number(tk[i]);
      const grootBoog = Number(tk[i + 3]);
      const sweep = Number(tk[i + 4]);
      const nx = Number(tk[i + 5]);
      const nz = Number(tk[i + 6]);
      i += 7;
      for (const p of boogPunten(x, z, r, grootBoog, sweep, nx, nz, stappen)) punten.push(p);
      x = nx;
      z = nz;
    } else if (cmd === "Z") {
      // sluiten doet de oppervlakteformule zelf
    } else {
      throw new Error(`onbekend padcommando ${cmd} in ${d}`);
    }
  }
  return punten;
}

/** Oppervlak van een gesloten veelhoek (schoenveterformule), altijd positief. */
function veelhoekOppervlak(punten) {
  let tweeA = 0;
  for (let i = 0; i < punten.length; i += 1) {
    const [x1, y1] = punten[i];
    const [x2, y2] = punten[(i + 1) % punten.length];
    tweeA += x1 * y2 - x2 * y1;
  }
  return Math.abs(tweeA) / 2;
}

/**
 * Zwaartepunt van een gesloten veelhoek in x — bij een U-profiel de afstand
 * van de rug van het lijf tot het zwaartepunt, dus precies de `y_c` uit de
 * catalogus.
 */
function veelhoekZwaartepuntX(punten) {
  let tweeA = 0;
  let som = 0;
  for (let i = 0; i < punten.length; i += 1) {
    const [x1, y1] = punten[i];
    const [x2, y2] = punten[(i + 1) % punten.length];
    const kruis = x1 * y2 - x2 * y1;
    tweeA += kruis;
    som += (x1 + x2) * kruis;
  }
  return som / (3 * tweeA);
}

/** Oppervlak van de contour die `shapePath` voor deze vorm tekent (mm²). */
function tekeningOppervlak(shape) {
  return veelhoekOppervlak(padNaarVeelhoek(shapePath(shape, 1, 0, 0).d));
}

const catalogus = JSON.parse(readFileSync(PROFIELEN, "utf8"));
const uitCatalogus = (naam) => catalogus.find((p) => p.name === naam);

/* ══════════════════════════════════════════════════════════════════════════ *
 *  1. De helling staat in de gegevens en komt in de tekenvorm terecht        *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n1. Helling uit de database naar de tekenvorm");

ok(
  STEEL_SECTION_DIMS.UNP200?.flensHelling === 0.08,
  "UNP 200 draagt flensHelling 0,08 (8 %, DIN 1026-1)",
  `gevonden ${STEEL_SECTION_DIMS.UNP200?.flensHelling}`,
);
ok(
  STEEL_SECTION_DIMS.UPE200?.flensHelling === 0,
  "UPE 200 draagt flensHelling 0 (evenwijdige flenzen)",
  `gevonden ${STEEL_SECTION_DIMS.UPE200?.flensHelling}`,
);

const unp = shapeVanProfiel("UNP 200");
const upe = shapeVanProfiel("UPE 200");
ok(unp?.type === "channel" && unp.flensHelling === 0.08, "shapeVanProfiel('UNP 200') → helling 0,08");
ok(upe?.type === "channel" && upe.flensHelling === 0, "shapeVanProfiel('UPE 200') → helling 0");
ok(flensHellingVanProfiel("unp-200") === 0.08, "flensHellingVanProfiel normaliseert de naam");
ok(flensHellingVanProfiel("IPE 300") === 0, "een I-profiel heeft geen flenshelling");
ok(flensHellingVanProfiel(undefined) === 0, "geen profiel → helling 0, geen uitzondering");

/* ══════════════════════════════════════════════════════════════════════════ *
 *  2. Waar de catalogusmaat tf geldt                                         *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n2. tf geldt op halve flensbreedte, niet overal");

// t₀ = tf + s·(b/2 − tw) en t₁ = tf − s·b/2. Voor UNP 200 (h 200, b 75,
// tw 8,5, tf 11,5) geeft dat 13,82 en 8,50 — dezelfde getallen die de
// rekenkern in channel.rs noemt.
bijna(flensDikte(unp, 75 / 2), 11.5, 1e-9, "UNP 200: dikte op b/2 is de catalogusmaat tf = 11,5 mm");
bijna(flensDikte(unp, 8.5), 13.82, 5e-3, "UNP 200: dikte bij het lijf t₀ = 13,82 mm");
bijna(flensDikte(unp, 75), 8.5, 1e-9, "UNP 200: dikte aan de flenspunt t₁ = 8,50 mm");
ok(
  flensDikte(unp, unp.tw) > flensDikte(unp, unp.b),
  "UNP 200: de flens loopt naar de punt toe dunner",
);
ok(
  flensDikte(upe, upe.tw) === flensDikte(upe, upe.b),
  "UPE 200: de flens is overal even dik",
);

/* ══════════════════════════════════════════════════════════════════════════ *
 *  3. De getekende contour tegen het gepubliceerde oppervlak                 *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n3. Oppervlak van de getekende contour tegen de catalogus");

// Waarom dit het bewijs is dat de helling én de meetplaats van tf kloppen:
// het oppervlak van de contour is een onafhankelijk gepubliceerd getal, dat
// niemand bij het tekenen heeft gebruikt. Met de helling én tf op b/2 komt de
// hele reeks er op een paar honderdste procent op uit; zonder de helling zit
// UNP 200 er 2 % naast en het zwaartepunt zelfs 8 % (zie deel 4).
//
// De marges: UPE moet exact uitkomen — de contour is dan precies het model
// waarmee de tabelwaarden zijn opgesteld (drie platen plus twee
// walsuitrondingen). Voor UNP laat de bemonstering van de bogen een paar
// honderdste procent over.
const MARGE_UPE = 0.001; // 0,1 %
const MARGE_UNP = 0.005; // 0,5 %

// UNP350 is de vreemde eend: die regel is niet uit dezelfde tabel overgenomen
// als de reeks 80–300. Zijn eigen grootheden wijken al ~1 % af van de
// gepubliceerde UNP-tabel (A 7665,7 mm² tegen 7725 mm²; Wy;el 725·10³ mm³
// tegen 734·10³ mm³), dus hij kan de contour niet strak vastleggen. Hij wordt
// wel getoetst — een grove tekenfout valt hier nog steeds door de mand — maar
// met een marge die bij zijn eigen onzekerheid past.
const MARGE_AFWIJKENDE_REGEL = 0.01; // 1 %
const AFWIJKENDE_REGELS = new Set(["UNP350"]);

for (const p of catalogus.filter((q) => q.kind === "Channel")) {
  const shape = shapeVanProfiel(p.name);
  if (!shape || shape.type !== "channel") {
    ok(false, `${p.name}: geen tekenvorm gevonden`);
    continue;
  }
  const gemeten = tekeningOppervlak(shape);
  const A = p.properties.area_mm2;
  const rel = Math.abs(gemeten - A) / A;
  const marge = AFWIJKENDE_REGELS.has(p.name)
    ? MARGE_AFWIJKENDE_REGEL
    : shape.flensHelling > 0
      ? MARGE_UNP
      : MARGE_UPE;
  ok(
    rel <= marge,
    `${p.name}: contour ${gemeten.toFixed(1)} mm² tegen catalogus ${A} mm² (${(rel * 100).toFixed(2)} %)`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  4. De fout die dit oplost: UNP mag niet meer als UPE tekenen              *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n4. Regressie: een UNP tekent niet meer als een UPE");

const alsUpeGetekend = { ...unp, flensHelling: 0 };
const padUnp = shapePath(unp, 1, 0, 0).d;
const padVlak = shapePath(alsUpeGetekend, 1, 0, 0).d;
ok(padUnp !== padVlak, "de contour met en zonder helling zijn niet hetzelfde pad");

// Het zwaartepunt is de scherpste maat voor deze fout. Het oppervlak van een
// UNP verandert maar 2 % als je de flens vlak tekent — de gemiddelde
// flensdikte blijft bijna gelijk — maar het zwaartepunt schuift ruim 8 % op,
// want het materiaal zit bij de toelopende flens dichter bij het lijf.
// Catalogus voor UNP 200: y_c = 20,19 mm vanaf de rug van het lijf (genoemd in
// src-tauri/crates/section-properties/src/channel.rs, waar dezelfde 8 %-vorm
// de doorsnedegrootheden levert).
const Y_C_UNP200 = 20.19;
const zwUnp = veelhoekZwaartepuntX(padNaarVeelhoek(padUnp));
const zwVlak = veelhoekZwaartepuntX(padNaarVeelhoek(padVlak));

ok(
  Math.abs(zwUnp - Y_C_UNP200) / Y_C_UNP200 < 0.01,
  `getekende UNP 200: zwaartepunt ${zwUnp.toFixed(2)} mm tegen catalogus ${Y_C_UNP200} mm`,
);
ok(
  Math.abs(zwVlak - Y_C_UNP200) / Y_C_UNP200 > 0.05,
  `als UPE getekend zat het zwaartepunt er ver naast: ${zwVlak.toFixed(2)} mm`,
);

const A200 = uitCatalogus("UNP 200").properties.area_mm2;
const oppVlak = veelhoekOppervlak(padNaarVeelhoek(padVlak));
ok(
  Math.abs(oppVlak - A200) / A200 > 10 * (Math.abs(tekeningOppervlak(unp) - A200) / A200),
  `ook op oppervlak is de vlakke tekening veel slechter: ${oppVlak.toFixed(0)} tegen ` +
    `${tekeningOppervlak(unp).toFixed(0)} mm², catalogus ${A200} mm²`,
);

/* ══════════════════════════════════════════════════════════════════════════ *
 *  5. Het pad blijft welgevormd                                              *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n5. Welgevormdheid van de paden");

for (const p of catalogus.filter((q) => q.kind === "Channel")) {
  const shape = shapeVanProfiel(p.name);
  const d = shapePath(shape, 2, 10, 20).d;
  const getallen = d.split(/\s+/).filter((t) => /^-?[\d.]+$/.test(t)).map(Number);
  ok(
    d.startsWith("M ") && d.endsWith("Z") && getallen.every(Number.isFinite),
    `${p.name}: gesloten pad, alle coördinaten eindig`,
  );
}

// Onmogelijke maatvoering (de flens zou aan de punt door zichzelf heen lopen)
// mag geen omgeklapte tekening geven maar valt terug op evenwijdige flenzen.
const onmogelijk = { type: "channel", h: 200, b: 300, tw: 8, tf: 5, r: 5, flensHelling: 0.08 };
const opp = tekeningOppervlak(onmogelijk);
ok(Number.isFinite(opp) && opp > 0, "onmogelijke maatvoering geeft nog steeds een gesloten vorm");

/* ── uitslag ─────────────────────────────────────────────────────────────── */
log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
