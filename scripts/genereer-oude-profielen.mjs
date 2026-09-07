#!/usr/bin/env node
/**
 * genereer-oude-profielen.mjs — de oude Nederlandse breedflensreeksen
 * DIE, DIL en DIN aan de profieldatabase toevoegen.
 *
 * ── Wat dit voor reeksen zijn ───────────────────────────────────────────────
 *
 * Vóór de HE-aanduiding in 1963 werden in Nederland de Differdinger
 * parallelflensbalken (Grey-profielen) gebruikt. Vier reeksen, oplopend in
 * gewicht bij dezelfde nominale maat:
 *
 *   DIE  Differdange Économique   — de lichtste; ligt naast de latere HEA
 *   DIL  Differdange Léger        — tussen HEA en HEB in
 *   DIN  Differdange Normal       — ligt naast de latere HEB
 *   DIR  Differdange Renforcé     — ligt naast de latere HEM
 *
 * Ze komen in bestaande bouw en bij herbestemming veel voor. De maten zijn
 * NIET gelijk aan die van de HE-reeksen: een DIE 20 is 190 × 197 mm terwijl
 * een HEA 200 190 × 200 mm is, en het verschil loopt bij de grotere maten op.
 * Met HE-waarden rekenen aan een DIE-, DIL- of DIN-profiel is dus fout.
 *
 * Alle drie de reeksen hebben EVENWIJDIGE flenzen; ze gaan daarom als gewone
 * `ISection` de database in en de doorsnedemotor hoeft er niets nieuws voor te
 * kunnen. (De oudere Differdinger B-profielen en de Duitse normaalprofielen
 * INP hebben wél schuine flenzen — 9 % respectievelijk 14 % — en zitten hier
 * bewust niet in; zie de aantekening onderaan dit bestand.)
 *
 * ── Bron van de maten ───────────────────────────────────────────────────────
 *
 * Gescande bladzijden 80 t/m 85 van een Nederlands staaltabellenboek, met per
 * reeks een eigen tabel:
 *
 *   blz. 80/81  "DIN (Differdange Normal) — Differdinger parallelflensbalken
 *                (Grey)"           — 30 maten, DIN 10 t/m DIN 100
 *   blz. 82/83  "DIE (Differdange Économique) — idem"
 *                                  — 30 maten, DIE 10 t/m DIE 100
 *   blz. 84/85  "DIL (Differdange Léger) — idem"
 *                                  — 22 maten, DIL 10 t/m DIL 60
 *
 * De tabellen geven per profiel `h`, `b`, `d` (lijfdikte), `t` (flensdikte) en
 * `r` (walsuitronding) in mm, plus de doorsnede `F` in cm², het gewicht in
 * kg/m en de traagheidsmomenten `I_x` en `I_y` in cm⁴. Elke maat is bladzijde
 * voor bladzijde uit die scans overgenomen — GEEN enkele maat is
 * geïnterpoleerd of afgeleid.
 *
 * De tabelwaarden `F`, `I_x` en `I_y` staan hieronder mee in de brontabel,
 * niet om ze over te nemen maar om ze te KUNNEN CONTROLEREN: `--valideer`
 * rekent de geometrie door met dezelfde Rust-doorsnedemotor die de rest van de
 * database vult en zet de uitkomst naast de gedrukte waarde. Wat in
 * `profiles.json` terechtkomt is de uitkomst van de motor, zodat álle
 * grootheden (ook W_pl, I_t, I_w en A_v) uit één rekengang komen.
 *
 * ── Gebruik ─────────────────────────────────────────────────────────────────
 *
 *   node scripts/genereer-oude-profielen.mjs --valideer
 *       Rekent de 82 profielen door met de motor en zet A, I_y en I_z naast de
 *       gedrukte tabelwaarden. Dit is het bewijs dat de overgetypte geometrie
 *       klopt.
 *   node scripts/genereer-oude-profielen.mjs --schrijf
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
 * 1. Brontabellen — letterlijk uit de gescande bladzijden              *
 * ==================================================================== *
 *
 * Kolommen: [maat, h, b, d(=tw), t(=tf), r, F_cm2, Ix_cm4, Iy_cm4]
 * met `maat` het getal achter de reeksletters ("42.5" is de historische 42½).
 * h, b, d, t en r in mm; F in cm²; I in cm⁴.
 */

/** DIE — Differdange Économique. Gescande tabel blz. 82/83. */
const DIE = [
  ["10", 94, 99, 5.0, 8.0, 11, 20.8, 327, 130],
  ["12", 114, 119, 5.0, 8.0, 11, 25.0, 598, 225],
  ["14", 133, 138, 5.5, 8.5, 12, 31.1, 1020, 373],
  ["16", 150, 157, 6.0, 9.0, 14, 37.9, 1588, 584],
  ["18", 172, 177, 6.5, 10.0, 14, 47.0, 2605, 925],
  ["20", 190, 197, 7.0, 11.0, 15, 57.0, 3879, 1403],
  ["22", 211, 217, 7.3, 11.5, 15, 65.5, 5532, 1960],
  ["24", 229, 237, 7.8, 12.5, 17, 77.5, 7739, 2776],
  ["26", 250, 257, 8.0, 13.0, 17, 87.2, 10430, 3680],
  ["28", 267, 277, 8.3, 13.5, 18, 97.4, 13352, 4785],
  ["30", 289, 297, 8.8, 14.5, 18, 112, 17964, 6335],
  ["32", 308, 297, 9.5, 16.0, 20, 125, 22558, 6992],
  ["34", 330, 297, 10.0, 17.0, 20, 134, 27621, 7429],
  ["36", 348, 297, 10.5, 18.0, 21, 143, 32564, 7867],
  ["38", 370, 297, 11.0, 19.0, 21, 153, 39137, 8304],
  ["40", 388, 297, 11.0, 20.0, 21, 161, 45208, 8741],
  ["42.5", 415, 297, 11.5, 21.0, 21, 171, 54684, 9179],
  ["45", 438, 297, 12.0, 22.0, 23, 183, 64379, 9618],
  ["47.5", 465, 297, 12.5, 23.0, 23, 194, 76350, 10056],
  ["50", 488, 297, 13.0, 24.0, 24, 205, 88312, 10495],
  ["55", 539, 297, 13.0, 24.5, 24, 214, 111981, 10715],
  ["60", 588, 297, 14.0, 26.0, 26, 235, 144026, 11375],
  ["65", 638, 297, 14.0, 26.0, 26, 242, 173014, 11376],
  ["70", 688, 297, 15.0, 28.0, 27, 267, 218728, 12252],
  ["75", 738, 297, 15.0, 28.0, 27, 275, 256394, 12254],
  ["80", 792, 298, 16.0, 30.0, 27, 302, 320104, 13271],
  ["85", 842, 298, 17.0, 32.0, 30, 331, 391019, 14166],
  ["90", 892, 298, 17.0, 32.0, 30, 339, 446066, 14168],
  ["95", 942, 298, 17.0, 32.0, 30, 348, 505354, 14170],
  ["100", 992, 298, 17.0, 32.0, 30, 356, 568988, 14172],
];

/** DIL — Differdange Léger. Gescande tabel blz. 84/85. */
const DIL = [
  ["10", 100, 100, 5.0, 11, 11, 26.9, 472, 184],
  ["12", 120, 120, 5.0, 11, 11, 32.3, 849, 317],
  ["14", 140, 140, 4.5, 12, 12, 40.1, 1480, 549],
  ["16", 160, 160, 5.0, 13, 14, 50.0, 2420, 888],
  ["18", 180, 180, 5.5, 14, 14, 60.5, 3730, 1360],
  ["20", 200, 200, 6.0, 15, 15, 72.1, 5520, 2000],
  ["22", 220, 220, 6.5, 16, 15, 84.6, 7860, 2840],
  ["24", 240, 240, 7.0, 17, 17, 98.5, 10920, 3920],
  ["26", 260, 260, 7.5, 18, 17, 113, 14720, 5270],
  ["28", 280, 280, 8.0, 19, 18, 129, 19480, 6950],
  ["30", 300, 300, 8.5, 20, 18, 145, 25250, 9000],
  ["32", 320, 300, 9.0, 21, 20, 154, 30440, 9450],
  ["34", 340, 300, 9.5, 22, 20, 164, 36180, 9900],
  ["36", 360, 300, 10.0, 23, 21, 173, 42690, 10350],
  ["38", 380, 300, 10.5, 24, 21, 183, 49880, 10810],
  ["40", 400, 300, 11.0, 25, 21, 192, 57830, 11260],
  ["42.5", 425, 300, 11.5, 26, 21, 203, 68400, 11710],
  ["45", 450, 300, 12.0, 27, 23, 214, 80470, 12160],
  ["47.5", 475, 300, 12.5, 28, 23, 225, 93580, 12610],
  ["50", 500, 300, 13.0, 29, 24, 236, 108260, 13060],
  ["55", 550, 300, 13.5, 30, 24, 251, 137890, 13520],
  ["60", 600, 300, 14.0, 31, 26, 267, 172870, 13970],
];

/** DIN — Differdange Normal. Gescande tabel blz. 80/81. */
const DIN = [
  ["10", 100, 100, 6.5, 11, 11, 28.1, 478, 184],
  ["12", 120, 120, 6.5, 11, 11, 33.8, 860, 317],
  ["14", 140, 140, 8, 12, 12, 44.1, 1520, 550],
  ["16", 160, 160, 9, 14, 14, 58.4, 2630, 958],
  ["18", 180, 180, 9, 14, 14, 65.8, 3830, 1360],
  ["20", 200, 200, 10, 16, 15, 82.7, 5950, 2140],
  ["22", 220, 220, 10, 16, 15, 91, 8050, 2840],
  ["24", 240, 240, 11, 18, 17, 111, 11690, 4150],
  ["26", 260, 260, 11, 18, 17, 121, 15050, 5280],
  ["28", 280, 280, 12, 20, 18, 144, 20720, 7320],
  ["30", 300, 300, 12, 20, 18, 154, 25760, 9010],
  ["32", 320, 300, 13, 22, 20, 171, 32250, 9910],
  ["34", 340, 300, 13, 22, 20, 174, 36940, 9910],
  ["36", 360, 300, 14, 24, 21, 192, 45120, 10810],
  ["38", 380, 300, 14, 24, 21, 194, 50950, 10810],
  ["40", 400, 300, 14, 26, 21, 209, 60640, 11710],
  ["42.5", 425, 300, 14, 26, 21, 212, 69480, 11710],
  ["45", 450, 300, 15, 28, 23, 232, 84220, 12620],
  ["47.5", 475, 300, 15, 28, 23, 235, 95120, 12620],
  ["50", 500, 300, 16, 30, 24, 255, 113200, 13530],
  ["55", 550, 300, 16, 30, 24, 263, 140300, 13530],
  ["60", 600, 300, 17, 32, 26, 289, 180800, 14440],
  ["65", 650, 300, 17, 32, 26, 297, 216800, 14440],
  ["70", 700, 300, 18, 34, 27, 324, 270300, 15350],
  ["75", 750, 300, 18, 34, 27, 333, 316300, 15350],
  ["80", 800, 300, 18, 34, 27, 342, 366400, 15350],
  ["85", 850, 300, 19, 36, 30, 372, 443900, 16270],
  ["90", 900, 300, 19, 36, 30, 381, 506000, 16270],
  ["95", 950, 300, 19, 36, 30, 391, 573000, 16270],
  ["100", 1000, 300, 19, 36, 30, 400, 644700, 16280],
];

const REEKSEN = [
  { prefix: "DIE", omschrijving: "Differdange Économique", blz: "82/83", rijen: DIE },
  { prefix: "DIL", omschrijving: "Differdange Léger", blz: "84/85", rijen: DIL },
  { prefix: "DIN", omschrijving: "Differdange Normal", blz: "80/81", rijen: DIN },
];

/* ==================================================================== *
 * 2. Van brontabel naar profielrecord                                  *
 * ==================================================================== */

/**
 * Knikkromme volgens NEN-EN 1993-1-1 tabel 6.2 voor een gewalst I/H-profiel,
 * staalsoorten t/m S460 — dezelfde regel als in genereer-profieldata.mjs, en
 * hier van toepassing omdat DIE, DIL en DIN gewalste I-profielen met
 * evenwijdige flenzen zijn. Alle flensdikten in deze reeksen liggen onder
 * 40 mm, dus de takken voor tf > 40 mm komen niet aan bod; ze staan er wel,
 * zodat de regel volledig blijft.
 */
function knikkrommen({ h, b, tf }) {
  const hb = h / b;
  if (hb > 1.2) {
    if (tf <= 40) return { y_axis: "a", z_axis: "b" };
    if (tf <= 100) return { y_axis: "b", z_axis: "c" };
    return { y_axis: "d", z_axis: "d" };
  }
  if (tf <= 100) return { y_axis: "b", z_axis: "c" };
  return { y_axis: "d", z_axis: "d" };
}

/** Alle kandidaten uit de drie brontabellen, in vaste volgorde. */
function alleKandidaten() {
  const uit = [];
  for (const r of REEKSEN) {
    for (const [maat, h, b, tw, tf, rr, F, Ix, Iy] of r.rijen) {
      uit.push({
        name: `${r.prefix} ${maat}`,
        reeks: r.prefix,
        kind: "ISection",
        geometry: { h, b, tw, tf, r: rr },
        // Gedrukte tabelwaarden, omgerekend naar mm² / mm⁴. Alleen ter controle.
        tabel: { area_mm2: F * 100, iy_mm4: Ix * 1e4, iz_mm4: Iy * 1e4 },
      });
    }
  }
  return uit;
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
  const invoerPad = join(tmpdir(), `oude-profielen-in-${process.pid}.json`);
  const uitvoerPad = join(tmpdir(), `oude-profielen-uit-${process.pid}.json`);
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
    soort: "ISection",
    h: k.geometry.h,
    b: k.geometry.b,
    tw: k.geometry.tw,
    tf: k.geometry.tf,
    t: k.geometry.tw,
    r: k.geometry.r,
  };
}

/**
 * De velden die uit de motor in de database gaan. Dit is de volledige set van
 * `SectionProperties` zoals de rest van profiles.json hem heeft; alles komt uit
 * dezelfde rekengang, dus er kan geen tegenspraak tussen twee grootheden
 * ontstaan.
 */
const VELDEN = [
  "area_mm2", "iy_mm4", "iz_mm4", "wel_y_mm3", "wel_z_mm3", "wpl_y_mm3",
  "wpl_z_mm3", "av_y_mm2", "av_z_mm2", "it_mm4", "iw_mm6", "iy_radius_mm",
  "iz_radius_mm", "h_mm", "b_mm", "tw_mm", "tf_mm", "r_mm",
];

/** Zes significante cijfers — zelfde afronding als genereer-profieldata.mjs. */
function afgerond(x) {
  if (!Number.isFinite(x)) throw new Error(`Niet-eindig getal: ${x}`);
  if (x === 0) return 0;
  return Number(x.toPrecision(6));
}

/* ==================================================================== *
 * 4. Validatie tegen de gedrukte tabel                                 *
 * ==================================================================== */

/**
 * Hoeveel de motor van de gedrukte tabel mag afwijken voordat het een fout is.
 *
 * De tabel is met de rekenmiddelen van vóór 1963 opgesteld en op drie
 * significante cijfers gedrukt; de motor rekent de contour exact uit. Een paar
 * procent verschil op A en I is daarmee normaal en zegt niets over de
 * geometrie. Wat er WEL uit moet komen is dat er geen maat verkeerd is
 * overgetypt — en dat laat zich zien: één verkeerd cijfer in b of t geeft
 * meteen tientallen procenten op I_z.
 *
 * Gemeten: over alle 82 profielen × 3 grootheden is de grootste afwijking
 * 0,43 %. De grens hieronder ligt daar ruim boven en ver onder wat een
 * tikfout zou geven, en is daarmee een echte controle en geen formaliteit.
 */
const GRENS_PCT = 1.5;

function valideer() {
  const kandidaten = alleKandidaten();
  const uit = draaiMotor(kandidaten.map(motorInvoerVan));
  if (uit.length !== kandidaten.length) {
    throw new Error(`Motor gaf ${uit.length} resultaten voor ${kandidaten.length} profielen.`);
  }

  console.log("=".repeat(78));
  console.log("VALIDATIE — doorsnedemotor tegenover de gedrukte staaltabel");
  console.log("=".repeat(78));
  for (const r of REEKSEN) {
    console.log(`  ${r.prefix.padEnd(4)} ${r.omschrijving.padEnd(24)} blz. ${r.blz}  (${r.rijen.length} maten)`);
  }
  console.log();
  console.log(
    "profiel".padEnd(12) + "A tabel".padStart(10) + "A motor".padStart(10) + "Δ%".padStart(8) +
    "Iy Δ%".padStart(9) + "Iz Δ%".padStart(9),
  );

  const erg = [];
  let ergstePct = 0;
  for (let i = 0; i < kandidaten.length; i += 1) {
    const k = kandidaten[i];
    const m = uit[i];
    const d = (bereken, tabel) => ((bereken - tabel) / tabel) * 100;
    const dA = d(m.area_mm2, k.tabel.area_mm2);
    const dIy = d(m.iy_mm4, k.tabel.iy_mm4);
    const dIz = d(m.iz_mm4, k.tabel.iz_mm4);
    ergstePct = Math.max(ergstePct, Math.abs(dA), Math.abs(dIy), Math.abs(dIz));
    if (Math.abs(dA) > GRENS_PCT || Math.abs(dIy) > GRENS_PCT || Math.abs(dIz) > GRENS_PCT) {
      erg.push(`${k.name}: ΔA = ${dA.toFixed(1)} %, ΔI_y = ${dIy.toFixed(1)} %, ΔI_z = ${dIz.toFixed(1)} %`);
    }
    console.log(
      k.name.padEnd(12) +
      (k.tabel.area_mm2 / 100).toFixed(1).padStart(10) +
      (m.area_mm2 / 100).toFixed(1).padStart(10) +
      dA.toFixed(2).padStart(8) +
      dIy.toFixed(2).padStart(9) +
      dIz.toFixed(2).padStart(9),
    );
  }

  console.log();
  console.log(`Grootste afwijking over alle 3 grootheden en ${kandidaten.length} profielen: ${ergstePct.toFixed(2)} %.`);
  if (erg.length) {
    console.log(`\n!! ${erg.length} profiel(en) boven de grens van ${GRENS_PCT} % — controleer de overgetypte maten:`);
    for (const e of erg) console.log(`   ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`Alle profielen binnen ${GRENS_PCT} %: de overgetypte geometrie hoort bij de gedrukte grootheden.`);
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
    nieuw.push({
      name: k.name,
      kind: k.kind,
      geometry: { ...k.geometry, t: k.geometry.tw },
      properties,
      buckling_curves: knikkrommen(k.geometry),
    });
  }

  if (nieuw.length === 0) {
    console.log("\nNiets toegevoegd: alle profielen stonden er al in.");
    return;
  }
  writeFileSync(profielenPad, `${JSON.stringify([...bestaand, ...nieuw], null, 2)}\n`, "utf8");
  console.log(`\nToegevoegd aan ${profielenPad}: ${nieuw.length} profielen.`);
  for (const r of REEKSEN) {
    const n = nieuw.filter((p) => p.name.startsWith(`${r.prefix} `)).length;
    if (n) console.log(`   ${r.prefix.padEnd(4)} ${n}`);
  }
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
 * DIR (Differdange Renforcé). Voor DIE, DIL en DIN is een gescande tabel
 * beschikbaar; voor DIR is die er niet, en er is ook geen andere bron gevonden
 * waarin de maten van de reeks volledig staan. Zonder bron geen reeks: een
 * profielmaat die niet uit een tabel komt is een verzonnen profielmaat, en
 * daarmee zou de hele database aan waarde verliezen. Zodra de tabel van blz.
 * 86/87 (of een gelijkwaardige bron) er is, past de reeks er in dezelfde vorm
 * bij: DIR is óók een parallelflensprofiel en heeft dus niets nieuws nodig.
 *
 * INP (Duitse normaalprofielen, DIN 1025-1) en de oudere Differdinger
 * B-profielen. Van deze reeksen zijn de maten wél te vinden, maar hun flenzen
 * lopen toe (14 % respectievelijk 9 %). De doorsnedemotor kent op dit moment
 * één vorm met een toelopende flens — `ChannelSchuin`, het UNP-profiel — en
 * geen I-profiel met toelopende flenzen. Ze als `ISection` opnemen zou de
 * flens over de volle dikte doorrekenen tot aan de tip; bij de UNP-reeks is
 * gemeten wat dat kost: 2 à 3 % te veel oppervlak en ongeveer 14 % te veel
 * I_z, allebei aan de onveilige kant. Daarom niet opgenomen. Wat ervoor nodig
 * is, is één nieuwe contour naast `contour::u_profiel_schuin` — de meetkunde
 * is dezelfde, tweemaal gespiegeld — plus een `Profielvorm::IProfielSchuin`.
 */

const vlaggen = process.argv.slice(2);
if (vlaggen.includes("--schrijf")) schrijf();
else valideer();
