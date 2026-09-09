// De UNP-reeks in de profieldatabase tegen de GEPUBLICEERDE profieltabel.
//
// Waarom deze test bestaat, en waarom hij niet hetzelfde doet als
// `node scripts/genereer-profieldata.mjs --valideer`:
//
// Die validatie houdt de database tegen het REKENMODEL in dat script (een
// U-profiel met 8 % flensschuinte, DIN 1026-1). Dat is een goede controle
// zolang het model de reeks beschrijft — maar het is een cirkel op het moment
// dat het model zelf de partij is die ernaast zit. Precies dat gebeurt bij de
// zware UNP-maten. Een eerdere ronde las de uitslag van --valideer als "de
// databaseregel UNP350 is de slechtste van de hele database" en stelde voor
// hem door het model te halen; nameten tegen de gedrukte tabel liet zien dat
// de regel er 1,9 % naast lag en het model 6,5 %.
//
// Deze test meet daarom tegen de gedrukte tabel, niet tegen het model.
//
// BRON van de tabelwaarden hieronder: de UNP-profieltabel uit het
// knowhow-archief (bestand UNP.pdf), kolommen
//   profiel nr. | G kg/m | A mm² | h | b | tw | tf | AL m²/m
//              | Iy ×10⁴ mm⁴ | Wy;el ×10³ mm³ | Iz ×10⁴ mm⁴ | Wz;el ×10³ mm³
// De reeks in die tabel loopt van UNP 80 tot en met UNP 400.
//
// Uitvoeren: npx tsx test-unp-tabel.mjs
//        (of: node scripts/run-tests.mjs --filter=unp-tabel)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const PROFIELEN = resolve(
  HIER, "..", "src-tauri", "crates", "steel-profiles", "data", "profiles.json",
);

const { STEEL_SECTIONS } = await import("./src/lib/steelSections.generated.ts");
const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");

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

/* ══════════════════════════════════════════════════════════════════════════ *
 *  De gedrukte tabel                                                        *
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Eén regel per maat, in de eenheden van de tabelkop:
 * [maat, h, b, tw, tf, A mm², Iy ×10⁴ mm⁴, Wy;el ×10³ mm³,
 *        Iz ×10⁴ mm⁴, Wz;el ×10³ mm³]
 */
const TABEL = [
  [80, 80, 45, 6.0, 8.0, 1102, 106, 26.5, 19.4, 6.35],
  [100, 100, 50, 6.0, 8.5, 1345, 205, 41.1, 29.1, 8.45],
  [120, 120, 55, 7.0, 9.0, 1699, 364, 60.7, 43.1, 11.1],
  [140, 140, 60, 7.0, 10.0, 2037, 605, 86.4, 62.5, 14.7],
  [160, 160, 65, 7.5, 10.5, 2401, 925, 116, 85.0, 18.2],
  [180, 180, 70, 8.0, 11.0, 2797, 1354, 150, 113, 22.4],
  [200, 200, 75, 8.5, 11.5, 3218, 1911, 191, 148, 26.9],
  [220, 220, 80, 9.0, 12.5, 3744, 2691, 245, 196, 33.5],
  [240, 240, 85, 9.5, 13.0, 4231, 3599, 300, 247, 39.5],
  [260, 260, 90, 10.0, 14.0, 4828, 4824, 371, 317, 47.8],
  [280, 280, 95, 10.0, 15.0, 5342, 6276, 448, 398, 57.1],
  [300, 300, 100, 10.0, 16.0, 5876, 8028, 535, 493, 67.6],
  [320, 320, 100, 14.0, 17.5, 7578, 10869, 679, 597, 80.6],
  [350, 350, 100, 14.0, 16.0, 7725, 12845, 734, 571, 75.1],
  [380, 380, 102, 13.5, 16.0, 8035, 15755, 829, 615, 78.7],
  [400, 400, 110, 14.0, 18.0, 9149, 20353, 1018, 851, 102],
];

/** De tabelwaarden omgerekend naar de eenheden van de database (mm). */
const tabelGrootheden = (r) => ({
  area_mm2: r[5],
  iy_mm4: r[6] * 1e4,
  wel_y_mm3: r[7] * 1e3,
  iz_mm4: r[8] * 1e4,
  wel_z_mm3: r[9] * 1e3,
});

/**
 * Marges. De tabel drukt de grootheden op drie significante cijfers af, en die
 * afrondingsstap alleen is bij de kleine maten al aanzienlijk: op
 * Wz;el = 18,2·10³ mm³ (UNP 160) is een halve eenheid in het laatste cijfer
 * ±0,27 %. Wz;el hangt bovendien als enige af van het zwaartepunt y_c, en dat
 * getal staat NIET in de gebruikte kolommen. Vandaar de ruimere marge daar.
 *
 * Gemeten toestand bij het schrijven van deze test (UNP 80 t/m 300):
 * A ≤ 0,085 %, Iy ≤ 0,245 %, Wy;el ≤ 0,295 %, Iz ≤ 0,460 %, Wz;el ≤ 0,538 %.
 */
const MARGE = {
  area_mm2: 0.5,
  iy_mm4: 0.5,
  wel_y_mm3: 0.5,
  iz_mm4: 0.5,
  wel_z_mm3: 0.6,
};

/**
 * UNP350 is de uitzondering, en dat is een gedocumenteerde uitzondering en
 * geen vrijbrief. Die regel komt niet uit dezelfde bron als de reeks 80–300 en
 * ligt 0,8 tot 2,2 % naast de gedrukte tabel. Hij mag daar blijven omdat het
 * 8 %-model hem NIET beter maakt: dat zet hem op −1,3 % (A) tot −7,5 % (Wz;el).
 *
 * De bovengrens hieronder is dus zo gekozen dat hij de huidige regel toelaat
 * maar de modelwaarden verwerpt. Wie deze regel ooit "herstelt" met
 * berekenUProfielSchuin uit scripts/genereer-profieldata.mjs, ziet deze test
 * omvallen — en dat is de bedoeling.
 */
const UITZONDERING = new Map([["UNP350", 2.5]]);

const afwijking = (berekend, tabel) => ((berekend - tabel) / tabel) * 100;

const catalogus = JSON.parse(readFileSync(PROFIELEN, "utf8"));

/** Zelfde normalisatie als profileLookupKey / Rust `lookup_key`. */
const sleutel = (naam) => naam.replace(/[\s\-.]/g, "").toUpperCase();

const unpRegels = catalogus.filter((p) => sleutel(p.name).startsWith("UNP"));

/* ══════════════════════════════════════════════════════════════════════════ *
 *  1. Eén regel per maat — twee schrijfwijzen zijn een stille splitsing      *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n1. Eén databaseregel per UNP-maat");

// De opzoeksleutel haalt spaties eruit, dus "UNP 350" en "UNP350" zijn voor
// `lookup_key` hetzelfde profiel — maar `find()` kijkt EERST op de exacte naam.
// Met beide regels in de database levert "UNP 350" andere doorsnedegrootheden
// dan "UNP350", terwijl de gegenereerde TS-tabellen er (eerste-wint) maar één
// van overhouden. De toetsing en de tekening rekenen dan met verschillende
// getallen voor hetzelfde profiel, zonder dat iets een fout meldt.
const perSleutel = new Map();
for (const p of unpRegels) {
  const k = sleutel(p.name);
  if (!perSleutel.has(k)) perSleutel.set(k, []);
  perSleutel.get(k).push(p.name);
}
for (const [k, namen] of perSleutel) {
  ok(namen.length === 1, `${k}: precies één databaseregel`, `gevonden ${namen.join(" , ")}`);
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  2. Hoofdmaten tegen de tabel                                             *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n2. Hoofdmaten h, b, tw, tf tegen de gedrukte tabel");

const tabelPerMaat = new Map(TABEL.map((r) => [`UNP${r[0]}`, r]));
const gedekt = [];
for (const p of unpRegels) {
  const r = tabelPerMaat.get(sleutel(p.name));
  if (!r) {
    ok(false, `${p.name}: staat niet in de gedrukte tabel`, "onbekende maat");
    continue;
  }
  gedekt.push(p);
  const g = p.geometry;
  ok(
    g.h === r[1] && g.b === r[2] && g.tw === r[3] && g.tf === r[4],
    `${p.name}: h/b/tw/tf = ${r[1]}/${r[2]}/${r[3]}/${r[4]}`,
    `database ${g.h}/${g.b}/${g.tw}/${g.tf}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  3. Doorsnedegrootheden tegen de tabel                                    *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n3. A, Iy, Wy;el, Iz en Wz;el tegen de gedrukte tabel");

for (const p of gedekt) {
  const verwacht = tabelGrootheden(tabelPerMaat.get(sleutel(p.name)));
  const grens = UITZONDERING.get(p.name);
  for (const [k, tabelwaarde] of Object.entries(verwacht)) {
    const d = afwijking(p.properties[k], tabelwaarde);
    const marge = grens ?? MARGE[k];
    ok(
      Math.abs(d) <= marge,
      `${p.name} ${k}: ${d >= 0 ? "+" : ""}${d.toFixed(3)} % (marge ${marge} %)`,
      `database ${p.properties[k]}, tabel ${tabelwaarde}`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  4. Walsuitronding en kniklijnen — die staan NIET in de tabel             *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n4. De twee gegevens die de tabel niet levert");

// De gebruikte kolommen geven h, b, tw en tf, maar geen walsuitronding en geen
// kniklijn. Beide komen uit de vormnorm, niet uit deze tabel:
//
//  * r1 = tf en de flenspuntafronding r2 = r1/2 — dezelfde afspraak die de
//    oude staaltabel in de kop van de U-tabel noemt en die
//    src-tauri/crates/section-properties/src/contour.rs aanhoudt
//    (`u_profiel_schuin(h, b, tw, tf, r, r / 2.0, UNP_SCHUINTE)`);
//  * kniklijn c om beide assen — EN 1993-1-1 tabel 6.2, regel "U-, T- en
//    massieve doorsneden", zonder onderscheid naar maat.
//
// Deze test legt ze vast zodat een nieuwe maat ze niet stilzwijgend anders
// krijgt: dat zijn precies de twee getallen die niemand kan nameten aan de
// tabel.
for (const p of gedekt) {
  ok(p.geometry.r === p.geometry.tf, `${p.name}: walsuitronding r = tf = ${p.geometry.tf} mm`,
    `gevonden r = ${p.geometry.r}`);
  ok(
    p.buckling_curves.y_axis === "c" && p.buckling_curves.z_axis === "c",
    `${p.name}: kniklijn c/c`,
    `gevonden ${p.buckling_curves.y_axis}/${p.buckling_curves.z_axis}`,
  );
  ok(p.geometry.flange_slope === 0.08, `${p.name}: flensschuinte 8 %`,
    `gevonden ${p.geometry.flange_slope}`);
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  5. De gegenereerde TS-tabellen dragen dezelfde getallen                  *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n5. De gegenereerde TS-tabellen zijn bij");

// Als profiles.json is veranderd zonder
// `node scripts/genereer-staalprofielen.mjs`, rekent de solver met de oude
// getallen en de toetsing met de nieuwe. Dat mag niet stil gebeuren.
for (const p of unpRegels) {
  const k = sleutel(p.name);
  const s = STEEL_SECTIONS[k];
  const d = STEEL_SECTION_DIMS[k];
  ok(
    s !== undefined && s.A === p.properties.area_mm2 && s.Iy === p.properties.iy_mm4,
    `${p.name}: STEEL_SECTIONS gelijk aan de database`,
    s ? `A ${s.A} vs ${p.properties.area_mm2}, Iy ${s.Iy} vs ${p.properties.iy_mm4}` : "ontbreekt",
  );
  ok(
    d !== undefined &&
      d.props?.iz === p.properties.iz_mm4 &&
      d.props?.welY === p.properties.wel_y_mm3 &&
      d.props?.welZ === p.properties.wel_z_mm3 &&
      d.flensHelling === p.geometry.flange_slope,
    `${p.name}: STEEL_SECTION_DIMS gelijk aan de database`,
    d ? `iz ${d.props?.iz}, welY ${d.props?.welY}, welZ ${d.props?.welZ}, helling ${d.flensHelling}` : "ontbreekt",
  );
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  6. Wat de tabel wél heeft en de database (nog) niet                      *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n6. Dekking van de reeks");

// De reeks 80–300 moet compleet zijn: die maten zijn met het 8 %-model
// gegenereerd en halen de tabel ruim.
for (const r of TABEL.filter((x) => x[0] <= 300)) {
  ok(perSleutel.has(`UNP${r[0]}`), `UNP ${r[0]} zit in de database`);
}

// De zware maten zijn een BEKEND gat. Ze staan bewust niet in de database: met
// de vormafspraken van de reeks (r1 = tf, r2 = r1/2, schuinte 8 %) komt het
// model bij die maten 1,2 % (A) tot 7,5 % (Wz;el) onder de tabel uit, en de
// twee maten die dat zouden verklaren — de werkelijke schuinte en de werkelijke
// walsuitronding bij de zware maten — staan niet in de gebruikte kolommen.
// Deze lus dwingt niets af; hij maakt het gat zichtbaar in de uitslag. Wie de
// maten alsnog toevoegt, wordt door deel 3 aan de tabel gehouden.
const ontbrekend = TABEL.filter((r) => !perSleutel.has(`UNP${r[0]}`)).map((r) => r[0]);
log(
  ontbrekend.length === 0
    ? "  --   de hele gedrukte reeks 80–400 zit in de database"
    : `  --   nog niet in de database: UNP ${ontbrekend.join(", ")} ` +
      "(zie de brontabel in scripts/genereer-profieldata.mjs voor de reden)",
);

/* ── uitslag ─────────────────────────────────────────────────────────────── */
log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
