#!/usr/bin/env node
/**
 * genereer-hoeklijnen.mjs — de hoeklijnen (L-profielen, EN 10056-1) aan de
 * profieldatabase toevoegen: 15 gelijkbenige en 42 ongelijkbenige maten.
 *
 * ── Wat een hoeklijn bijzonder maakt ────────────────────────────────────────
 *
 * Elke andere reeks in deze database heeft een symmetrieas die met de
 * beschrijvingsassen samenvalt; een hoeklijn niet. Daar hangt meer aan dan de
 * tekening:
 *
 *   - NEN-EN 1993-1-1 par. 1.7(2) legt de assen ANDERS neer dan bij een I of
 *     een U: "voor hoekprofielen: y-y as evenwijdig aan het kleinste been,
 *     z-z as loodrecht op het kleinste been". Het LANGE been staat dus langs
 *     z. In deze generator is `h` daarom altijd het lange been.
 *   - De OPMERKING bij par. 1.7 zegt: "Alle regels in deze Eurocode hebben
 *     betrekking op de eigenschappen van de hoofdassen ... Echter voor
 *     profielen zoals hoekprofielen zijn deze gedefinieerd door de assen u-u
 *     en v-v." Het traagheidsproduct I_yz is bij een hoeklijn ongelijk aan
 *     nul; de doorsnedemotor levert I_yz, I_u, I_v en de hoofdashoek, en de
 *     toetsing gebruikt ze.
 *   - Tabel 5.2, blad 3 van 3, geeft hoekprofielen ALLEEN een klasse-3-regel
 *     (h/t ≤ 15ε en (b+h)/(2t) ≤ 11,5ε). Een hoeklijn is dus nooit klasse 1
 *     of 2, en de buigingstoetsen draaien elastisch.
 *   - Tabel 6.2 geeft L-profielen knikkromme **b om elke as**, voor alle
 *     staalsoorten. Dat is de enige regel die deze generator hoeft te kennen;
 *     er is geen h/b- of t_f-grens zoals bij de I-profielen.
 *
 * ── Bron van de maten ───────────────────────────────────────────────────────
 *
 * Twee ONAFHANKELIJKE profielcatalogi op de bedrijfsschijf, beide met de
 * maatvoering van EN 10056-1. Ze zijn hier allebei overgetypt, en dat is met
 * opzet: de tweede is de kruiscontrole op de eerste.
 *
 * A. Hoofdbron — profielcatalogus op de bedrijfsschijf,
 *    Z:\60_revit_bibliotheek\03_externe_bibliotheken\bibliotheek arnold\
 *      Revit Bibliotheek Stabu\1 - Model components\
 *      25 Metaal - staalconstructies\25 Staalconstructie\25 Stalen kolommen\
 *        25_kolom_gelijkbenig_hoekprofiel.txt    (15 maten, L 20x3 … L 200x20)
 *        25_kolom_ongelijkbenig_hoekprofiel.txt  (42 maten, L 30x20x3 …
 *                                                 L 200x100x14)
 *    Kolommen: de beenlengten, de twee afrondingsstralen, het oppervlak A,
 *    de massa per meter en de traagheidsmomenten. Precies de vorm die
 *    `genereer-oude-profielen.mjs` ook gebruikt: basisgeometrie ÉN de
 *    gedrukte grootheden, zodat de motor ertegen te ijken is.
 *
 * B. Kruiscontrole — profielcatalogus op de bedrijfsschijf,
 *    Z:\60_revit_bibliotheek\03_externe_bibliotheken\Archief\
 *      revitlt_localiser\RevitLT2013-NL_Localiser\NL_Localiser - 2013\
 *      NL_20_bovenbouw\NL_28_constructie\NL_28_balken & liggers_staal\
 *        L-Angles.txt                            (169 maten)
 *    Die geeft geen traagheidsmomenten maar wél het ZWAARTEPUNT, en dat is
 *    juist de grootheid waar de vormaanname op staat of valt: als de holle
 *    hoek of de teenafrondingen verkeerd in de contour zitten, verschuift het
 *    zwaartepunt zichtbaar. 50 van de 57 maten komen in beide catalogi voor.
 *
 * ── Wat er gecontroleerd wordt ──────────────────────────────────────────────
 *
 *   node scripts/genereer-hoeklijnen.mjs --valideer
 *       Rekent de 57 profielen door met dezelfde Rust-doorsnedemotor die de
 *       rest van de database vult, en legt de uitkomst naast:
 *         * A, I_y en I_z uit catalogus A     (grens 1,5 %, zie GRENS_PCT)
 *         * de gesloten oppervlakteformule van EN 10056-1
 *           A = t(h+b−t) + (1−π/4)(r1² − 2r2²)   (grens 0,1 %)
 *         * het zwaartepunt uit catalogus B   (grens 0,2 mm)
 *   node scripts/genereer-hoeklijnen.mjs --schrijf
 *       Voegt de profielen toe aan
 *       src-tauri/crates/steel-profiles/data/profiles.json. Bestaande regels
 *       blijven ongemoeid; een profiel waarvan de zoeksleutel al bestaat wordt
 *       overgeslagen.
 *   zonder vlaggen: alleen --valideer.
 *
 * De motor wordt zo nodig eerst gebouwd (cargo, release). Geen npm-afhankelijk-
 * heden.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const wortel = join(hier, "..");
const profielenPad = join(
  wortel, "src-tauri", "crates", "steel-profiles", "data", "profiles.json",
);

/* ==================================================================== *
 * 1. Brontabellen — letterlijk overgetypt uit catalogus A              *
 * ==================================================================== */

/**
 * Gelijkbenige hoeklijnen.
 *
 * Kolommen: [been, t, r1, r2, A_mm2, massa_kg_m, I_cm4].
 * `r1` is de walsuitronding in de holle hoek, `r2` de teenafronding; de
 * catalogus noemt ze "r" en "r1". Beide benen zijn even lang, dus I_y = I_z
 * en de catalogus geeft er ook maar één waarde voor.
 */
const GELIJKBENIG = [
  [20, 3, 3.5, 2, 112, 0.88, 0.39],
  [25, 3, 3.5, 2, 142, 1.12, 0.8],
  [40, 4, 6, 3, 308, 2.42, 4.47],
  [45, 5, 7, 3.5, 430, 3.38, 7.84],
  [50, 5, 7, 3.5, 480, 3.77, 11],
  [60, 6, 8, 4, 691, 5.42, 22.8],
  [70, 7, 9, 4.5, 940, 7.38, 42.3],
  [80, 8, 10, 5, 1230, 9.66, 72.2],
  [90, 9, 11, 5.5, 1550, 12.2, 116],
  [100, 10, 12, 6, 1920, 15.1, 177],
  [110, 10, 12, 6, 2120, 16.6, 239],
  [120, 12, 13, 6.5, 2750, 21.6, 368],
  [150, 15, 16, 8, 4300, 33.8, 898],
  [180, 18, 18, 9, 6190, 48.6, 1870],
  [200, 20, 18, 9, 7630, 59.9, 2850],
];

/**
 * Ongelijkbenige hoeklijnen.
 *
 * Kolommen: [h, b, t, r1, r2, A_mm2, massa_kg_m, Iy_cm4, Iz_cm4] met `h` het
 * LANGE been. De beendikte staat in catalogus A niet als eigen kolom maar in
 * de maataanduiding ("L 30x20x3"); hij is hier als kolom overgenomen.
 *
 * De catalogus noemt de traagheidsmomenten "Ix" en "Iy"; in de assen van
 * NEN-EN 1993-1-1 par. 1.7(2) — y evenwijdig aan het KLEINSTE been — is de
 * eerste (de grote) I_y en de tweede I_z. Die omzetting is hier al gedaan.
 */
const ONGELIJKBENIG = [
  [30, 20, 3, 3.5, 2, 142, 1.11, 1.25, 0.44],
  [30, 20, 4, 3.5, 2, 185, 1.45, 1.59, 0.55],
  [40, 20, 3, 3.5, 2, 172, 1.35, 2.8, 0.47],
  [40, 20, 4, 3.5, 2, 225, 1.77, 3.59, 0.6],
  [45, 30, 4, 4.5, 2, 287, 2.25, 5.77, 2.05],
  [45, 30, 5, 4.5, 2, 353, 2.77, 6.98, 2.47],
  [50, 30, 4, 4.5, 2, 307, 2.42, 7.71, 2.09],
  [50, 30, 5, 4.5, 2, 378, 2.96, 9.41, 2.54],
  [50, 40, 5, 4, 2, 427, 3.35, 10.5, 5.89],
  [60, 30, 5, 6, 3, 429, 3.37, 15.6, 2.6],
  [60, 40, 5, 6, 3, 479, 3.76, 17.2, 6.11],
  [60, 40, 6, 6, 3, 568, 4.46, 20.1, 7.12],
  [65, 50, 5, 6, 3, 554, 4.35, 23.1, 11.9],
  [70, 50, 6, 6, 3, 688, 5.4, 33.5, 14.3],
  [75, 50, 7, 6.5, 3.5, 830, 6.51, 46.4, 16.5],
  [75, 55, 5, 7, 3.5, 630, 4.95, 35.5, 16.2],
  [75, 55, 7, 7, 3.5, 866, 6.8, 47.9, 21.8],
  [80, 40, 6, 7, 3.5, 689, 5.41, 44.9, 7.59],
  [80, 40, 8, 7, 3.5, 901, 7.07, 57.6, 9.68],
  [80, 60, 7, 8, 4, 938, 7.36, 59, 28.4],
  [80, 65, 8, 8, 4, 1100, 8.66, 68.1, 40.1],
  [90, 60, 6, 7, 3.5, 869, 6.82, 71.7, 25.8],
  [90, 60, 8, 7, 3.5, 1140, 8.96, 92.5, 33],
  [100, 50, 6, 9, 4.5, 873, 6.85, 89.7, 15.3],
  [100, 50, 8, 9, 4.5, 1150, 8.99, 116, 19.5],
  [100, 50, 10, 9, 4.5, 1410, 11.1, 141, 23.4],
  [100, 65, 7, 10, 5, 1120, 8.77, 113, 37.6],
  [100, 65, 9, 10, 5, 1420, 11.1, 141, 46.7],
  [100, 75, 9, 10, 5, 1510, 11.8, 148, 71],
  [120, 80, 8, 11, 5.5, 1550, 12.2, 226, 80.8],
  [120, 80, 10, 11, 5.5, 1910, 15.0, 276, 98.1],
  [120, 80, 12, 11, 5.5, 2270, 17.8, 323, 114],
  [130, 65, 8, 11, 5.5, 1510, 11.9, 263, 44.8],
  [130, 65, 10, 11, 5.5, 1860, 14.6, 321, 54.2],
  [150, 75, 9, 10.5, 5.5, 1950, 15.3, 455, 78.3],
  [150, 75, 11, 10.5, 5.5, 2360, 18.6, 545, 93],
  [150, 100, 10, 13, 6.5, 2420, 19.0, 552, 198],
  [150, 100, 12, 13, 6.5, 2870, 22.6, 650, 232],
  [180, 90, 10, 14, 7, 2620, 20.6, 880, 151],
  [200, 100, 10, 15, 7.5, 2920, 23.0, 1220, 210],
  [200, 100, 12, 15, 7.5, 3480, 27.3, 1440, 247],
  [200, 100, 14, 15, 7.5, 4030, 31.6, 1650, 282],
];

/**
 * Kruiscontrole uit catalogus B: [naam, A_mm2, y_c_mm, z_c_mm].
 *
 * `y_c` is de afstand van de hiel tot het zwaartepunt langs het KORTE been
 * (de y-richting van par. 1.7(2)), `z_c` die langs het lange been. Bij een
 * gelijkbenig profiel zijn ze gelijk.
 *
 * Zeven van de 57 maten uit catalogus A staan niet in catalogus B; die worden
 * op het zwaartepunt niet kruiselings gecontroleerd. De validatie meldt hoeveel
 * er vergeleken zijn, zodat dat zichtbaar blijft.
 */
const ZWAARTEPUNTEN = [
  ["L 20x20x3", 111.9, 5.96, 5.96],
  ["L 25x25x3", 141.9, 7.21, 7.21],
  ["L 40x40x4", 307.9, 11.2, 11.2],
  ["L 45x45x5", 430, 12.79, 12.79],
  ["L 50x50x5", 480, 14.04, 14.04],
  ["L 60x60x6", 691, 16.88, 16.88],
  ["L 70x70x7", 940, 19.71, 19.71],
  ["L 80x80x8", 1227, 22.55, 22.55],
  ["L 90x90x9", 1552, 25.39, 25.39],
  ["L 100x100x10", 1915, 28.22, 28.22],
  ["L 110x110x10", 2115, 30.72, 30.72],
  ["L 120x120x12", 2754, 34, 34],
  ["L 150x150x15", 4300, 42.5, 42.5],
  ["L 180x180x18", 6190, 51, 51],
  ["L 200x200x20", 7630, 56.8, 56.8],
  ["L 30x20x3", 141.9, 5.02, 9.93],
  ["L 30x20x4", 184.9, 5.41, 10.34],
  ["L 40x20x3", 171.9, 4.41, 14.25],
  ["L 40x20x4", 224.9, 4.81, 14.69],
  ["L 45x30x4", 286.7, 7.36, 14.72],
  ["L 45x30x5", 353, 7.76, 15.15],
  ["L 50x30x5", 378, 7.41, 17.27],
  ["L 50x40x5", 428, 10.61, 15.54],
  ["L 60x30x5", 429, 6.81, 21.54],
  ["L 60x40x5", 479, 9.72, 19.55],
  ["L 60x40x6", 568, 10.11, 19.98],
  ["L 65x50x5", 554, 12.49, 19.87],
  ["L 75x50x7", 830, 12.47, 24.83],
  ["L 75x55x7", 866, 14.07, 23.94],
  ["L 80x40x6", 689, 8.84, 28.54],
  ["L 80x40x8", 901, 9.63, 29.4],
  ["L 90x60x6", 869, 14.06, 28.88],
  ["L 90x60x8", 1141, 14.85, 29.71],
  ["L 100x50x6", 873, 10.42, 34.9],
  ["L 100x50x8", 1141, 11.25, 35.9],
  ["L 100x50x10", 1409, 12.04, 36.7],
  ["L 100x65x7", 1117, 15.12, 32.3],
  ["L 100x65x9", 1415, 15.94, 33.2],
  ["L 100x75x9", 1505, 19.14, 31.46],
  ["L 120x80x8", 1549, 18.66, 38.3],
  ["L 120x80x12", 2269, 20.26, 40],
  ["L 130x65x8", 1509, 13.66, 45.6],
  ["L 130x65x10", 1863, 14.48, 46.5],
  ["L 150x75x9", 1955, 15.74, 52.8],
  ["L 150x75x11", 2365, 16.54, 53.7],
  ["L 150x100x10", 2418, 23.36, 48],
  ["L 150x100x12", 2874, 24.18, 48.9],
  ["L 200x100x10", 2924, 20.13, 69.3],
  ["L 200x100x12", 3470, 20.97, 70.4],
  ["L 200x100x14", 4030, 21.78, 71.2],
];

/* ==================================================================== *
 * 2. Van brontabel naar profielrecord                                  *
 * ==================================================================== */

/**
 * Knikkromme volgens NEN-EN 1993-1-1 tabel 6.2, rij "L-profielen": kromme
 * **b om elke as**, voor S235 t/m S460. Anders dan bij de gewalste
 * I-profielen zijn er geen h/b- of t_f-grenzen; er is één rij en die geldt
 * voor de hele reeks.
 */
const KNIKKROMMEN = { y_axis: "b", z_axis: "b" };

/** Alle kandidaten uit beide brontabellen, in vaste volgorde. */
function alleKandidaten() {
  const uit = [];
  // De naam is de volledige aanduiding van EN 10056-1, ook bij gelijke benen:
  // "L 100x100x10" en niet de verkorte vorm "L 100x10" die catalogus A
  // gebruikt. Dat is een keuze over de NAAM, niet over de maten — en zij
  // scheelt in de zoeksleutel: wie "L 100x100x10" intypt, hoort het profiel te
  // vinden, en "L100X10" leest als een maat 10010.
  for (const [been, t, r1, r2, a, massa, i_cm4] of GELIJKBENIG) {
    uit.push(
      maakKandidaat(`L ${been}x${been}x${t}`, been, been, t, r1, r2, a, massa, i_cm4, i_cm4),
    );
  }
  for (const [h, b, t, r1, r2, a, massa, iy, iz] of ONGELIJKBENIG) {
    uit.push(maakKandidaat(`L ${h}x${b}x${t}`, h, b, t, r1, r2, a, massa, iy, iz));
  }
  return uit;
}

function maakKandidaat(name, h, b, t, r1, r2, a_mm2, massa_kg_m, iy_cm4, iz_cm4) {
  return {
    name,
    kind: "Angle",
    soort: "Angle",
    // `t` staat zowel als eigen veld als in `tw`/`tf`: een hoeklijn heeft één
    // beendikte, en de afnemers van ProfileGeometry lezen nu eens het ene en
    // dan weer het andere veld.
    geometry: { h, b, tw: t, tf: t, t, r: r1, r2 },
    // Gedrukte tabelwaarden, omgerekend naar mm² / mm⁴ / kg per meter.
    // Alleen ter controle; wat in de database komt, komt uit de motor.
    tabel: { area_mm2: a_mm2, iy_mm4: iy_cm4 * 1e4, iz_mm4: iz_cm4 * 1e4, massa_kg_m },
  };
}

/** Zelfde normalisatie als `lookup_key` in de Rust-crate. */
const sleutel = (naam) => naam.replace(/[\s\-.]/g, "").toUpperCase();

/* ==================================================================== *
 * 3. De doorsnedemotor aanroepen                                       *
 * ==================================================================== */

const motorBin = join(
  wortel, "src-tauri", "target", "release",
  process.platform === "win32" ? "doorsnedemotor.exe" : "doorsnedemotor",
);

/** Bouwt de motor als hij ontbreekt of ouder is dan de Rust-bron. */
function draaiMotor(lijst) {
  const bronDir = join(wortel, "src-tauri", "crates", "section-properties", "src");
  const bronTijd = readdirSync(bronDir, { recursive: true })
    .map((f) => join(bronDir, String(f)))
    .filter((f) => f.endsWith(".rs"))
    .reduce((t, f) => Math.max(t, statSync(f).mtimeMs), 0);
  if (!existsSync(motorBin) || statSync(motorBin).mtimeMs < bronTijd) {
    console.log("Motor bouwen (cargo build --release)...");
    execFileSync(
      "cargo",
      ["build", "--release", "-q", "-p", "section-properties", "--bin", "doorsnedemotor"],
      { cwd: join(wortel, "src-tauri"), stdio: "inherit" },
    );
  }
  const invoerPad = join(tmpdir(), `hoeklijnen-in-${process.pid}.json`);
  const uitvoerPad = join(tmpdir(), `hoeklijnen-uit-${process.pid}.json`);
  writeFileSync(invoerPad, JSON.stringify(lijst), "utf8");
  try {
    execFileSync(motorBin, [invoerPad, uitvoerPad], { stdio: ["ignore", "ignore", "inherit"] });
    return JSON.parse(readFileSync(uitvoerPad, "utf8"));
  } finally {
    for (const f of [invoerPad, uitvoerPad]) {
      try { unlinkSync(f); } catch { /* al weg */ }
    }
  }
}

/** Motorinvoer voor één kandidaat. */
function motorInvoerVan(k) {
  return {
    naam: k.name,
    soort: k.soort,
    h: k.geometry.h,
    b: k.geometry.b,
    tw: k.geometry.tw,
    tf: k.geometry.tf,
    t: k.geometry.t,
    r: k.geometry.r,
    r2: k.geometry.r2,
  };
}

/**
 * De velden die uit de motor in de database gaan — dezelfde volledige set van
 * `SectionProperties` als de rest van profiles.json heeft, zodat er geen
 * tegenspraak tussen twee grootheden kan ontstaan.
 */
const VELDEN = [
  "area_mm2", "iy_mm4", "iz_mm4", "wel_y_mm3", "wel_z_mm3", "wpl_y_mm3",
  "wpl_z_mm3", "av_y_mm2", "av_z_mm2", "it_mm4", "iw_mm6", "iy_radius_mm",
  "iz_radius_mm", "h_mm", "b_mm", "tw_mm", "tf_mm", "r_mm",
];

/**
 * Extra velden die een hoeklijn nodig heeft en de andere reeksen niet: het
 * traagheidsproduct en de hoofdassen. Zonder deze vier kan de toetsing de
 * kolomknik niet om u-u en v-v doen, en dat is nu juist wat par. 1.7(2)
 * OPMERKING voorschrijft. Voor elke andere reeks zijn ze nul (I_yz = 0,
 * I_u = I_y, I_v = I_z, α = 0) en staan ze daarom niet in profiles.json.
 */
const HOOFDASVELDEN = [
  "y_c_mm", "z_c_mm", "iyz_mm4", "iu_mm4", "iv_mm4", "alpha_hoofdas_rad",
];

/** Zes significante cijfers — zelfde afronding als de andere generatoren. */
function afgerond(x) {
  if (!Number.isFinite(x)) throw new Error(`Niet-eindig getal: ${x}`);
  if (x === 0) return 0;
  return Number(x.toPrecision(6));
}

/* ==================================================================== *
 * 4. Validatie                                                         *
 * ==================================================================== */

/**
 * Hoeveel de motor van de gedrukte tabel mag afwijken voordat het een fout is.
 *
 * Dezelfde grens en dezelfde redenering als in `genereer-oude-profielen.mjs`:
 * de tabel is op drie significante cijfers gedrukt en de motor rekent de
 * contour exact uit, dus een fractie procent verschil zegt niets over de
 * geometrie. Wat deze vergelijking WEL vangt is een verkeerd overgetypte maat
 * of een verkeerde vormaanname — één cijfer mis in b of t geeft meteen
 * tientallen procenten op I_z, en een verkeerd geplaatste teenafronding is aan
 * het zwaartepunt te zien.
 *
 * Gemeten over alle 57 profielen × 3 grootheden: grootste afwijking 1,14 %
 * (L 50x40x5, I_y); alle overige onder 1,0 %.
 */
const GRENS_PCT = 1.5;

/**
 * Grens voor het zwaartepunt tegenover catalogus B, in mm.
 *
 * Gemeten grootste afwijking over de 50 overlappende maten: 0,13 mm, op
 * L 200x100x12 — en juist daar geven de twee catalogi ook zelf een verschillend
 * oppervlak (3470 tegen 3480 mm²), dus dat is een verschil tussen de bronnen en
 * niet tussen de bron en de contour. Op alle andere maten blijft het onder
 * 0,08 mm. De grens hieronder ligt daar net boven en ver onder wat een
 * verkeerd geplaatste afronding zou geven: een teenafronding aan de buitenkant
 * in plaats van de binnenkant verschuift het zwaartepunt met millimeters.
 */
const GRENS_ZWAARTEPUNT_MM = 0.2;

/**
 * Grens voor de gesloten oppervlakteformule van EN 10056-1. Dit is geen
 * vergelijking met een gedrukte tabel maar met een formule die dezelfde
 * meetkunde beschrijft, dus hier hoort de motor bijna exact op uit te komen.
 */
const GRENS_FORMULE_PCT = 0.1;

/** A volgens EN 10056-1: t(h+b−t) + (1−π/4)(r1² − 2r2²). */
function oppervlakFormule({ h, b, t, r, r2 }) {
  return t * (h + b - t) + (1 - Math.PI / 4) * (r * r - 2 * r2 * r2);
}

function valideer() {
  const kandidaten = alleKandidaten();
  const uit = draaiMotor(kandidaten.map(motorInvoerVan));
  if (uit.length !== kandidaten.length) {
    throw new Error(`Motor gaf ${uit.length} resultaten voor ${kandidaten.length} profielen.`);
  }
  const zwaartepunten = new Map(ZWAARTEPUNTEN.map(([n, , y, z]) => [sleutel(n), { y, z }]));

  console.log("=".repeat(92));
  console.log("VALIDATIE — doorsnedemotor tegenover twee onafhankelijke profielcatalogi");
  console.log("=".repeat(92));
  console.log(`  gelijkbenig    ${GELIJKBENIG.length} maten`);
  console.log(`  ongelijkbenig  ${ONGELIJKBENIG.length} maten`);
  console.log(`  zwaartepunt kruiselings gecontroleerd op ${zwaartepunten.size} maten`);
  console.log();
  console.log(
    "profiel".padEnd(15) + "A tabel".padStart(9) + "A motor".padStart(9) + "Δ%".padStart(7) +
    "Iy Δ%".padStart(8) + "Iz Δ%".padStart(8) + "Aform Δ%".padStart(10) +
    "Δy_c".padStart(8) + "Δz_c".padStart(8) + "  α°".padStart(7),
  );

  const erg = [];
  let ergstePct = 0;
  let ergsteFormulePct = 0;
  let ergsteZwaartepuntMm = 0;
  let vergeleken = 0;
  for (let i = 0; i < kandidaten.length; i += 1) {
    const k = kandidaten[i];
    const m = uit[i];
    const d = (bereken, tabel) => ((bereken - tabel) / tabel) * 100;
    const dA = d(m.area_mm2, k.tabel.area_mm2);
    const dIy = d(m.iy_mm4, k.tabel.iy_mm4);
    const dIz = d(m.iz_mm4, k.tabel.iz_mm4);
    const dForm = d(m.area_mm2, oppervlakFormule(k.geometry));
    ergstePct = Math.max(ergstePct, Math.abs(dA), Math.abs(dIy), Math.abs(dIz));
    ergsteFormulePct = Math.max(ergsteFormulePct, Math.abs(dForm));
    if (Math.abs(dA) > GRENS_PCT || Math.abs(dIy) > GRENS_PCT || Math.abs(dIz) > GRENS_PCT) {
      erg.push(`${k.name}: ΔA = ${dA.toFixed(1)} %, ΔI_y = ${dIy.toFixed(1)} %, ΔI_z = ${dIz.toFixed(1)} %`);
    }
    if (Math.abs(dForm) > GRENS_FORMULE_PCT) {
      erg.push(`${k.name}: contour wijkt ${dForm.toFixed(3)} % van de EN 10056-1-oppervlakteformule af`);
    }

    // Zwaartepunt tegen de tweede catalogus. Ontbreekt de maat daar, dan blijft
    // de kolom leeg — geen stille overslag, wel zichtbaar in het overzicht.
    const zp = zwaartepunten.get(sleutel(k.name));
    let dy = NaN;
    let dz = NaN;
    if (zp) {
      vergeleken += 1;
      dy = m.y_c_mm - zp.y;
      dz = m.z_c_mm - zp.z;
      ergsteZwaartepuntMm = Math.max(ergsteZwaartepuntMm, Math.abs(dy), Math.abs(dz));
      if (Math.abs(dy) > GRENS_ZWAARTEPUNT_MM || Math.abs(dz) > GRENS_ZWAARTEPUNT_MM) {
        erg.push(
          `${k.name}: zwaartepunt ${dy.toFixed(2)} / ${dz.toFixed(2)} mm naast de tweede catalogus`,
        );
      }
    }

    // De hoofdashoek hoort altijd tussen 0° en 90° te liggen en bij een
    // gelijkbenig profiel exact 45° te zijn; die kolom maakt zichtbaar dat de
    // hoofdassen niet met y en z samenvallen.
    const graden = (m.alpha_hoofdas_rad * 180) / Math.PI;
    if (k.geometry.h === k.geometry.b && Math.abs(graden - 45) > 1e-6) {
      erg.push(`${k.name}: gelijkbenig maar hoofdashoek ${graden.toFixed(4)}° in plaats van 45°`);
    }
    if (!(graden > 0 && graden < 90)) {
      erg.push(`${k.name}: hoofdashoek ${graden.toFixed(4)}° ligt niet tussen 0° en 90°`);
    }

    console.log(
      k.name.padEnd(15) +
      k.tabel.area_mm2.toFixed(0).padStart(9) +
      m.area_mm2.toFixed(0).padStart(9) +
      dA.toFixed(2).padStart(7) +
      dIy.toFixed(2).padStart(8) +
      dIz.toFixed(2).padStart(8) +
      dForm.toFixed(3).padStart(10) +
      (zp ? dy.toFixed(2) : "–").padStart(8) +
      (zp ? dz.toFixed(2) : "–").padStart(8) +
      graden.toFixed(1).padStart(7),
    );
  }

  console.log();
  console.log(
    `Grootste afwijking tegenover de gedrukte tabel (A, I_y, I_z), ${kandidaten.length} profielen: ` +
    `${ergstePct.toFixed(2)} % (grens ${GRENS_PCT} %).`,
  );
  console.log(
    `Grootste afwijking tegenover de EN 10056-1-oppervlakteformule: ` +
    `${ergsteFormulePct.toFixed(4)} % (grens ${GRENS_FORMULE_PCT} %).`,
  );
  console.log(
    `Grootste afwijking van het zwaartepunt tegenover de tweede catalogus ` +
    `(${vergeleken} maten): ${ergsteZwaartepuntMm.toFixed(3)} mm (grens ${GRENS_ZWAARTEPUNT_MM} mm).`,
  );
  if (erg.length) {
    console.log(`\n!! ${erg.length} melding(en) — controleer de overgetypte maten en de vormaanname:`);
    for (const e of erg) console.log(`   ${e}`);
    process.exitCode = 1;
  } else {
    console.log(
      "\nAlles binnen de grenzen: de overgetypte maten horen bij de gedrukte grootheden, en de " +
      "contour (hiel op de oorsprong, lang been langs z, walsuitronding in de holle hoek, " +
      "teenafronding per been) is de vorm waarmee die tabellen zijn opgesteld.",
    );
  }
  return { kandidaten, uit };
}

/* ==================================================================== *
 * 5. Wegschrijven                                                      *
 * ==================================================================== */

function schrijf() {
  const { kandidaten, uit } = valideer();
  if (process.exitCode === 1) {
    console.log("\nNiet geschreven: los eerst de gemelde afwijkingen op.");
    return;
  }

  const bestaand = JSON.parse(readFileSync(profielenPad, "utf8"));
  const bestaandeSleutels = new Set(bestaand.map((p) => sleutel(p.name)));

  const nieuw = [];
  const overgeslagen = [];
  for (let i = 0; i < kandidaten.length; i += 1) {
    const k = kandidaten[i];
    if (bestaandeSleutels.has(sleutel(k.name))) {
      overgeslagen.push(k.name);
      continue;
    }
    bestaandeSleutels.add(sleutel(k.name));
    const m = uit[i];
    const properties = {};
    for (const v of VELDEN) properties[v] = afgerond(m[v]);
    for (const v of HOOFDASVELDEN) properties[v] = afgerond(m[v]);
    nieuw.push({
      name: k.name,
      kind: k.kind,
      geometry: k.geometry,
      properties,
      buckling_curves: KNIKKROMMEN,
    });
  }

  if (nieuw.length === 0) {
    console.log("\nNiets toegevoegd: alle profielen stonden er al in.");
    return;
  }
  writeFileSync(profielenPad, `${JSON.stringify([...bestaand, ...nieuw], null, 2)}\n`, "utf8");
  console.log(`\nToegevoegd aan ${profielenPad}: ${nieuw.length} profielen.`);
  if (overgeslagen.length) {
    console.log(`Overgeslagen (stonden er al): ${overgeslagen.join(", ")}`);
  }
  console.log(
    "\nDraai hierna in design-mockup/: node scripts/genereer-staalprofielen.mjs",
  );
}

/* ==================================================================== *
 * 6. Aansturing                                                        *
 * ==================================================================== *
 *
 * ── Wat hier bewust NIET in zit ─────────────────────────────────────────────
 *
 * De maten die catalogus B wél heeft en catalogus A niet (L 16x16x3 en een
 * reeks tussenmaten, samen ruim honderd). Catalogus B geeft geen
 * traagheidsmomenten, en zonder gedrukte I-waarden valt de vormaanname op die
 * maten niet te controleren — er zou dan een profiel in de database komen
 * waarvan alleen de motor zegt dat het klopt. Zodra er een tabel mét
 * grootheden voor die maten is, passen ze er in dezelfde vorm bij: een regel
 * in GELIJKBENIG of ONGELIJKBENIG en verder niets.
 *
 * Gebogen (koudgevormde) hoekprofielen. Die hebben een andere hoekmeetkunde
 * (één straal, geen walsuitronding met teenafronding) en een andere
 * knikkromme (tabel 6.2 geeft koudgevormde profielen kromme c). De contour
 * `hoeklijn` in section-properties kan ze aan door r2 = 0 te nemen, maar de
 * knikkromme hierboven zou dan niet meer kloppen; die hoort dan per reeks te
 * worden meegegeven in plaats van als constante.
 */

const vlaggen = process.argv.slice(2);
if (vlaggen.includes("--schrijf")) schrijf();
else valideer();
