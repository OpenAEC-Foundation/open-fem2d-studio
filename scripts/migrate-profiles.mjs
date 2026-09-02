/**
 * migrate-profiles.mjs
 *
 * Migrate TypeScript SteelSections.ts profile definitions → profiles.json schema.
 *
 * SteelSections.ts uses catalog units:
 *   h, b, tw, tf, r  : mm
 *   A                 : cm²
 *   Iy, Iz            : cm⁴
 *   Wy, Wz            : cm³
 *   Wpl_y, Wpl_z      : cm³
 *   It                : cm⁴
 *   Iw                : cm⁶
 *
 * profiles.json uses SI units:
 *   geometry          : mm
 *   area_mm2          : mm²  (A × 100)
 *   iy_mm4, iz_mm4    : mm⁴  (× 10000)
 *   wel_y_mm3, etc.   : mm³  (× 1000)
 *   it_mm4            : mm⁴  (× 10000)
 *   iw_mm6            : mm⁶  (× 1000000)
 *
 * Run: node scripts/migrate-profiles.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'src-tauri', 'crates', 'steel-profiles', 'data', 'profiles.json');

// ── Seed entries (preserved from hand-crafted JSON) ──────────────────────────
let seeds = [];
try {
  seeds = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
} catch {
  console.warn('Could not read existing profiles.json — starting fresh.');
}
const seedNames = new Set(seeds.map(s => s.name));

// ── Conversion helpers ────────────────────────────────────────────────────────
const cm2_to_mm2 = 100;
const cm4_to_mm4 = 10000;
const cm3_to_mm3 = 1000;
const cm6_to_mm6 = 1000000;

// ── Buckling curve selection (EN 1993-1-1 Tabel 6.2, hot-rolled steel) ───────
function bucklingCurves(name, series) {
  if (series === 'CHS') return { y_axis: 'a', z_axis: 'a' };
  if (series === 'RHS') {
    // SHS and RHS hot-formed: a; cold-formed: c
    // In our TS data all RHS/SHS are hot-formed catalog (Celsius 355 / hot-finished)
    if (name.startsWith('SHS') || name.startsWith('RHS')) return { y_axis: 'a', z_axis: 'a' };
    return { y_axis: 'c', z_axis: 'c' };
  }
  if (series === 'UNP') return { y_axis: 'b', z_axis: 'c' };
  // I-sections (IPE, HEA, HEB, HEM):
  // h/b > 1.2 → y=a, z=b;  h/b ≤ 1.2 → y=b, z=c
  // IPE typically h/b > 1.2 for larger sizes but starts square-ish for small ones.
  // The standard per Tabel 6.2 uses tf ≤ 40 mm (all our profiles):
  //   h/b > 1.2: curves a (y) and b (z)
  //   h/b ≤ 1.2: curves b (y) and c (z)
  return null; // resolved per-profile below
}

function isectionBucklingCurves(h, b) {
  if (h / b > 1.2) return { y_axis: 'a', z_axis: 'b' };
  return { y_axis: 'b', z_axis: 'c' };
}

// ── Profile kind mapping ──────────────────────────────────────────────────────
function profileKind(series, name) {
  if (series === 'CHS') return 'Chs';
  if (series === 'RHS') {
    if (name.startsWith('SHS')) return 'Shs';
    return 'Rhs';
  }
  if (series === 'UNP') return 'Channel';
  return 'ISection';
}

// ── Radii of gyration ────────────────────────────────────────────────────────
function radius(iy_mm4, iz_mm4, area_mm2) {
  return {
    iy_radius_mm: area_mm2 > 0 ? Math.sqrt(iy_mm4 / area_mm2) : 0,
    iz_radius_mm: area_mm2 > 0 ? Math.sqrt(iz_mm4 / area_mm2) : 0,
  };
}

// ── Shear areas (approximate for sections where not in catalog) ───────────────
function shearAreas(series, h, b, tw, tf, r, area_mm2) {
  if (series === 'CHS') {
    // CHS: Av = 2A/π
    const av = (2 * area_mm2) / Math.PI;
    return { av_y_mm2: av, av_z_mm2: av };
  }
  if (series === 'RHS') {
    // RHS/SHS: Av_z ≈ A * h/(h+b), Av_y ≈ A * b/(h+b)
    const av_z = area_mm2 * h / (h + b);
    const av_y = area_mm2 * b / (h + b);
    return { av_y_mm2: av_y, av_z_mm2: av_z };
  }
  // Gewalste I-secties: Av;z per EN 1993-1-1 §6.2.6(3)a
  // (A − 2·b·tf + (tw + 2r)·tf, met ondergrens η·hw·tw, η = 1,2).
  // Gewalste U-profielen (UNP): idem maar met (tw + r)·tf, zonder ondergrens.
  // De oude benadering h·tw zat 14–36% te laag (conservatief maar fout) —
  // zie de databasecorrectie van sept 2026.
  const hw = h - 2 * tf;
  const uitronding = series === 'UNP' ? (tw + r) * tf : (tw + 2 * r) * tf;
  let av_z = area_mm2 - 2 * b * tf + uitronding;
  if (series !== 'UNP') av_z = Math.max(av_z, 1.2 * hw * tw);
  return {
    av_y_mm2: 2 * b * tf,
    av_z_mm2: av_z,
  };
}

// ── Source data (inline — avoids dynamic import of TS) ───────────────────────
// Copied verbatim from src/core/data/SteelSections.ts
// Units: A cm², Iy/Iz/It cm⁴, Wy/Wz/Wpl_y/Wpl_z cm³, Iw cm⁶, h/b/tw/tf/r mm

const SOURCE_PROFILES = [
  // IPE
  { name: 'IPE 80',  series: 'IPE', h: 80,  b: 46,  tw: 3.8, tf: 5.2, r: 5,  A: 7.64,  Iy: 80.1,   Iz: 8.49,   Wy: 20.0,  Wz: 3.69,  Wpl_y: 23.2,  Wpl_z: 5.82,   It: 0.70,   Iw: 118 },
  { name: 'IPE 100', series: 'IPE', h: 100, b: 55,  tw: 4.1, tf: 5.7, r: 7,  A: 10.3,  Iy: 171,    Iz: 15.9,   Wy: 34.2,  Wz: 5.79,  Wpl_y: 39.4,  Wpl_z: 9.15,   It: 1.20,   Iw: 351 },
  { name: 'IPE 120', series: 'IPE', h: 120, b: 64,  tw: 4.4, tf: 6.3, r: 7,  A: 13.2,  Iy: 318,    Iz: 27.7,   Wy: 53.0,  Wz: 8.65,  Wpl_y: 60.7,  Wpl_z: 13.6,   It: 1.74,   Iw: 890 },
  { name: 'IPE 140', series: 'IPE', h: 140, b: 73,  tw: 4.7, tf: 6.9, r: 7,  A: 16.4,  Iy: 541,    Iz: 44.9,   Wy: 77.3,  Wz: 12.3,  Wpl_y: 88.3,  Wpl_z: 19.3,   It: 2.45,   Iw: 1980 },
  { name: 'IPE 160', series: 'IPE', h: 160, b: 82,  tw: 5.0, tf: 7.4, r: 9,  A: 20.1,  Iy: 869,    Iz: 68.3,   Wy: 109,   Wz: 16.7,  Wpl_y: 124,   Wpl_z: 26.1,   It: 3.60,   Iw: 3960 },
  { name: 'IPE 180', series: 'IPE', h: 180, b: 91,  tw: 5.3, tf: 8.0, r: 9,  A: 23.9,  Iy: 1320,   Iz: 101,    Wy: 146,   Wz: 22.2,  Wpl_y: 166,   Wpl_z: 34.6,   It: 4.79,   Iw: 7430 },
  { name: 'IPE 200', series: 'IPE', h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12, A: 28.5,  Iy: 1940,   Iz: 142,    Wy: 194,   Wz: 28.5,  Wpl_y: 221,   Wpl_z: 44.6,   It: 6.98,   Iw: 13000 },
  { name: 'IPE 220', series: 'IPE', h: 220, b: 110, tw: 5.9, tf: 9.2, r: 12, A: 33.4,  Iy: 2770,   Iz: 205,    Wy: 252,   Wz: 37.3,  Wpl_y: 285,   Wpl_z: 58.1,   It: 9.07,   Iw: 22700 },
  { name: 'IPE 240', series: 'IPE', h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15, A: 39.1,  Iy: 3890,   Iz: 284,    Wy: 324,   Wz: 47.3,  Wpl_y: 367,   Wpl_z: 73.9,   It: 12.9,   Iw: 37400 },
  { name: 'IPE 270', series: 'IPE', h: 270, b: 135, tw: 6.6, tf: 10.2, r: 15, A: 45.9, Iy: 5790,   Iz: 420,    Wy: 429,   Wz: 62.2,  Wpl_y: 484,   Wpl_z: 97.0,   It: 15.9,   Iw: 70600 },
  { name: 'IPE 300', series: 'IPE', h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, A: 53.8, Iy: 8360,   Iz: 604,    Wy: 557,   Wz: 80.5,  Wpl_y: 628,   Wpl_z: 125,    It: 20.1,   Iw: 126000 },
  { name: 'IPE 330', series: 'IPE', h: 330, b: 160, tw: 7.5, tf: 11.5, r: 18, A: 62.6, Iy: 11770,  Iz: 788,    Wy: 713,   Wz: 98.5,  Wpl_y: 804,   Wpl_z: 154,    It: 28.2,   Iw: 199000 },
  { name: 'IPE 360', series: 'IPE', h: 360, b: 170, tw: 8.0, tf: 12.7, r: 18, A: 72.7, Iy: 16270,  Iz: 1040,   Wy: 904,   Wz: 123,   Wpl_y: 1020,  Wpl_z: 191,    It: 37.3,   Iw: 314000 },
  { name: 'IPE 400', series: 'IPE', h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21, A: 84.5, Iy: 23130,  Iz: 1320,   Wy: 1160,  Wz: 146,   Wpl_y: 1310,  Wpl_z: 229,    It: 51.1,   Iw: 490000 },
  { name: 'IPE 450', series: 'IPE', h: 450, b: 190, tw: 9.4, tf: 14.6, r: 21, A: 98.8, Iy: 33740,  Iz: 1680,   Wy: 1500,  Wz: 176,   Wpl_y: 1700,  Wpl_z: 276,    It: 66.9,   Iw: 791000 },
  { name: 'IPE 500', series: 'IPE', h: 500, b: 200, tw: 10.2, tf: 16.0, r: 21, A: 116, Iy: 48200,  Iz: 2140,   Wy: 1930,  Wz: 214,   Wpl_y: 2190,  Wpl_z: 336,    It: 89.3,   Iw: 1249000 },
  { name: 'IPE 550', series: 'IPE', h: 550, b: 210, tw: 11.1, tf: 17.2, r: 24, A: 134, Iy: 67120,  Iz: 2670,   Wy: 2440,  Wz: 254,   Wpl_y: 2780,  Wpl_z: 401,    It: 123,    Iw: 1884000 },
  { name: 'IPE 600', series: 'IPE', h: 600, b: 220, tw: 12.0, tf: 19.0, r: 24, A: 156, Iy: 92080,  Iz: 3390,   Wy: 3070,  Wz: 308,   Wpl_y: 3510,  Wpl_z: 486,    It: 165,    Iw: 2846000 },

  // HEA
  { name: 'HEA 100', series: 'HEA', h: 96,  b: 100, tw: 5.0, tf: 8.0, r: 12, A: 21.2, Iy: 349,    Iz: 134,    Wy: 72.8,  Wz: 26.8,  Wpl_y: 83.0,  Wpl_z: 41.1,   It: 5.24,   Iw: 5750 },
  { name: 'HEA 120', series: 'HEA', h: 114, b: 120, tw: 5.0, tf: 8.0, r: 12, A: 25.3, Iy: 606,    Iz: 231,    Wy: 106,   Wz: 38.5,  Wpl_y: 119,   Wpl_z: 58.9,   It: 5.99,   Iw: 13280 },
  { name: 'HEA 140', series: 'HEA', h: 133, b: 140, tw: 5.5, tf: 8.5, r: 12, A: 31.4, Iy: 1030,   Iz: 389,    Wy: 155,   Wz: 55.6,  Wpl_y: 174,   Wpl_z: 85.2,   It: 8.13,   Iw: 28500 },
  { name: 'HEA 160', series: 'HEA', h: 152, b: 160, tw: 6.0, tf: 9.0, r: 15, A: 38.8, Iy: 1670,   Iz: 616,    Wy: 220,   Wz: 77.0,  Wpl_y: 245,   Wpl_z: 118,    It: 12.2,   Iw: 54400 },
  { name: 'HEA 180', series: 'HEA', h: 171, b: 180, tw: 6.0, tf: 9.5, r: 15, A: 45.3, Iy: 2510,   Iz: 925,    Wy: 294,   Wz: 103,   Wpl_y: 325,   Wpl_z: 157,    It: 14.8,   Iw: 94580 },
  { name: 'HEA 200', series: 'HEA', h: 190, b: 200, tw: 6.5, tf: 10.0, r: 18, A: 53.8, Iy: 3690,  Iz: 1340,   Wy: 389,   Wz: 134,   Wpl_y: 430,   Wpl_z: 204,    It: 20.98,  Iw: 155000 },
  { name: 'HEA 220', series: 'HEA', h: 210, b: 220, tw: 7.0, tf: 11.0, r: 18, A: 64.3, Iy: 5410,  Iz: 1950,   Wy: 515,   Wz: 177,   Wpl_y: 569,   Wpl_z: 271,    It: 28.5,   Iw: 267000 },
  { name: 'HEA 240', series: 'HEA', h: 230, b: 240, tw: 7.5, tf: 12.0, r: 21, A: 76.8, Iy: 7760,  Iz: 2770,   Wy: 675,   Wz: 231,   Wpl_y: 745,   Wpl_z: 352,    It: 41.6,   Iw: 449000 },
  { name: 'HEA 260', series: 'HEA', h: 250, b: 260, tw: 7.5, tf: 12.5, r: 24, A: 86.8, Iy: 10450, Iz: 3670,   Wy: 836,   Wz: 282,   Wpl_y: 920,   Wpl_z: 430,    It: 52.4,   Iw: 682000 },
  { name: 'HEA 280', series: 'HEA', h: 270, b: 280, tw: 8.0, tf: 13.0, r: 24, A: 97.3, Iy: 13670, Iz: 4760,   Wy: 1010,  Wz: 340,   Wpl_y: 1110,  Wpl_z: 518,    It: 62.1,   Iw: 1000000 },
  { name: 'HEA 300', series: 'HEA', h: 290, b: 300, tw: 8.5, tf: 14.0, r: 27, A: 112,  Iy: 18260, Iz: 6310,   Wy: 1260,  Wz: 421,   Wpl_y: 1380,  Wpl_z: 641,    It: 85.2,   Iw: 1520000 },
  { name: 'HEA 320', series: 'HEA', h: 310, b: 300, tw: 9.0, tf: 15.5, r: 27, A: 124.4, Iy: 22930, Iz: 6990,  Wy: 1480,  Wz: 466,   Wpl_y: 1630,  Wpl_z: 709,    It: 108,    Iw: 1960000 },
  { name: 'HEA 340', series: 'HEA', h: 330, b: 300, tw: 9.5, tf: 16.5, r: 27, A: 133.5, Iy: 27690, Iz: 7440,  Wy: 1680,  Wz: 496,   Wpl_y: 1850,  Wpl_z: 756,    It: 127,    Iw: 2450000 },
  { name: 'HEA 360', series: 'HEA', h: 350, b: 300, tw: 10.0, tf: 17.5, r: 27, A: 142.8, Iy: 33090, Iz: 7890, Wy: 1890,  Wz: 526,   Wpl_y: 2090,  Wpl_z: 803,    It: 149,    Iw: 2990000 },
  { name: 'HEA 400', series: 'HEA', h: 390, b: 300, tw: 11.0, tf: 19.0, r: 27, A: 159.0, Iy: 45070, Iz: 8560, Wy: 2310,  Wz: 571,   Wpl_y: 2560,  Wpl_z: 873,    It: 189,    Iw: 4320000 },

  // HEB
  { name: 'HEB 100', series: 'HEB', h: 100, b: 100, tw: 6.0, tf: 10.0, r: 12, A: 26.0, Iy: 450,    Iz: 167,    Wy: 89.9,  Wz: 33.5,  Wpl_y: 104,   Wpl_z: 51.4,   It: 9.25,   Iw: 8460 },
  { name: 'HEB 120', series: 'HEB', h: 120, b: 120, tw: 6.5, tf: 11.0, r: 12, A: 34.0, Iy: 864,    Iz: 318,    Wy: 144,   Wz: 53.0,  Wpl_y: 165,   Wpl_z: 81.0,   It: 13.8,   Iw: 22400 },
  { name: 'HEB 140', series: 'HEB', h: 140, b: 140, tw: 7.0, tf: 12.0, r: 12, A: 43.0, Iy: 1510,   Iz: 550,    Wy: 216,   Wz: 78.5,  Wpl_y: 246,   Wpl_z: 120,    It: 20.1,   Iw: 48700 },
  { name: 'HEB 160', series: 'HEB', h: 160, b: 160, tw: 8.0, tf: 13.0, r: 15, A: 54.3, Iy: 2490,   Iz: 889,    Wy: 311,   Wz: 111,   Wpl_y: 354,   Wpl_z: 170,    It: 31.2,   Iw: 93750 },
  { name: 'HEB 180', series: 'HEB', h: 180, b: 180, tw: 8.5, tf: 14.0, r: 15, A: 65.3, Iy: 3830,   Iz: 1360,   Wy: 426,   Wz: 151,   Wpl_y: 481,   Wpl_z: 231,    It: 42.2,   Iw: 167000 },
  { name: 'HEB 200', series: 'HEB', h: 200, b: 200, tw: 9.0, tf: 15.0, r: 18, A: 78.1, Iy: 5700,   Iz: 2000,   Wy: 570,   Wz: 200,   Wpl_y: 642,   Wpl_z: 306,    It: 59.3,   Iw: 283000 },
  { name: 'HEB 220', series: 'HEB', h: 220, b: 220, tw: 9.5, tf: 16.0, r: 18, A: 91.0, Iy: 8090,   Iz: 2840,   Wy: 736,   Wz: 258,   Wpl_y: 827,   Wpl_z: 396,    It: 76.6,   Iw: 466000 },
  { name: 'HEB 240', series: 'HEB', h: 240, b: 240, tw: 10.0, tf: 17.0, r: 21, A: 106, Iy: 11260,  Iz: 3920,   Wy: 938,   Wz: 327,   Wpl_y: 1050,  Wpl_z: 500,    It: 103,    Iw: 753000 },
  { name: 'HEB 260', series: 'HEB', h: 260, b: 260, tw: 10.0, tf: 17.5, r: 24, A: 118, Iy: 14920,  Iz: 5130,   Wy: 1150,  Wz: 395,   Wpl_y: 1280,  Wpl_z: 602,    It: 124,    Iw: 1130000 },
  { name: 'HEB 280', series: 'HEB', h: 280, b: 280, tw: 10.5, tf: 18.0, r: 24, A: 131, Iy: 19270,  Iz: 6590,   Wy: 1380,  Wz: 471,   Wpl_y: 1530,  Wpl_z: 718,    It: 144,    Iw: 1680000 },
  { name: 'HEB 300', series: 'HEB', h: 300, b: 300, tw: 11.0, tf: 19.0, r: 27, A: 149, Iy: 25170,  Iz: 8560,   Wy: 1680,  Wz: 571,   Wpl_y: 1870,  Wpl_z: 871,    It: 185,    Iw: 2530000 },
  { name: 'HEB 320', series: 'HEB', h: 320, b: 300, tw: 11.5, tf: 20.5, r: 27, A: 161.3, Iy: 30820, Iz: 9240,  Wy: 1930,  Wz: 616,   Wpl_y: 2150,  Wpl_z: 940,    It: 225,    Iw: 3260000 },
  { name: 'HEB 340', series: 'HEB', h: 340, b: 300, tw: 12.0, tf: 21.5, r: 27, A: 170.9, Iy: 36660, Iz: 9690,  Wy: 2160,  Wz: 646,   Wpl_y: 2410,  Wpl_z: 986,    It: 257,    Iw: 4060000 },
  { name: 'HEB 360', series: 'HEB', h: 360, b: 300, tw: 12.5, tf: 22.5, r: 27, A: 180.6, Iy: 43190, Iz: 10140, Wy: 2400,  Wz: 676,   Wpl_y: 2680,  Wpl_z: 1030,   It: 293,    Iw: 4970000 },
  { name: 'HEB 400', series: 'HEB', h: 400, b: 300, tw: 13.5, tf: 24.0, r: 27, A: 197.8, Iy: 57680, Iz: 10820, Wy: 2880,  Wz: 721,   Wpl_y: 3230,  Wpl_z: 1100,   It: 356,    Iw: 7160000 },

  // HEM
  { name: 'HEM 100', series: 'HEM', h: 120, b: 106, tw: 12.0, tf: 20.0, r: 12, A: 53.2,  Iy: 1140,  Iz: 399,  Wy: 190, Wz: 75.3, Wpl_y: 235,  Wpl_z: 117,  It: 118,  Iw: 25370 },
  { name: 'HEM 120', series: 'HEM', h: 140, b: 126, tw: 12.5, tf: 21.0, r: 12, A: 66.4,  Iy: 2020,  Iz: 703,  Wy: 288, Wz: 112, Wpl_y: 350,  Wpl_z: 172,  It: 153,  Iw: 60560 },
  { name: 'HEM 140', series: 'HEM', h: 160, b: 146, tw: 13.0, tf: 22.0, r: 12, A: 80.6,  Iy: 3290,  Iz: 1140, Wy: 411, Wz: 156, Wpl_y: 496,  Wpl_z: 241,  It: 193,  Iw: 128400 },
  { name: 'HEM 160', series: 'HEM', h: 180, b: 166, tw: 14.0, tf: 23.0, r: 15, A: 97.1,  Iy: 5100,  Iz: 1760, Wy: 566, Wz: 212, Wpl_y: 675,  Wpl_z: 327,  It: 258,  Iw: 246100 },
  { name: 'HEM 180', series: 'HEM', h: 200, b: 186, tw: 14.5, tf: 24.0, r: 15, A: 113,   Iy: 7480,  Iz: 2580, Wy: 748, Wz: 277, Wpl_y: 884,  Wpl_z: 428,  It: 324,  Iw: 439400 },
  { name: 'HEM 200', series: 'HEM', h: 220, b: 206, tw: 15.0, tf: 25.0, r: 18, A: 131,   Iy: 10640, Iz: 3650, Wy: 967, Wz: 354, Wpl_y: 1140, Wpl_z: 549,  It: 406,  Iw: 727000 },
  { name: 'HEM 220', series: 'HEM', h: 240, b: 226, tw: 15.5, tf: 26.0, r: 18, A: 149,   Iy: 14600, Iz: 5020, Wy: 1220, Wz: 444, Wpl_y: 1430, Wpl_z: 690, It: 495,  Iw: 1160000 },
  { name: 'HEM 240', series: 'HEM', h: 270, b: 248, tw: 18.0, tf: 32.0, r: 21, A: 200,   Iy: 24290, Iz: 8150, Wy: 1800, Wz: 657, Wpl_y: 2120, Wpl_z: 1020, It: 926,  Iw: 2380000 },
  { name: 'HEM 260', series: 'HEM', h: 290, b: 268, tw: 18.0, tf: 32.5, r: 24, A: 220,   Iy: 31310, Iz: 10450, Wy: 2160, Wz: 780, Wpl_y: 2530, Wpl_z: 1210, It: 1030, Iw: 3700000 },
  { name: 'HEM 280', series: 'HEM', h: 310, b: 288, tw: 18.5, tf: 33.0, r: 24, A: 240,   Iy: 39550, Iz: 13160, Wy: 2550, Wz: 914, Wpl_y: 2970, Wpl_z: 1420, It: 1130, Iw: 5590000 },
  { name: 'HEM 300', series: 'HEM', h: 340, b: 310, tw: 21.0, tf: 39.0, r: 27, A: 303,   Iy: 59200, Iz: 19400, Wy: 3480, Wz: 1250, Wpl_y: 4080, Wpl_z: 1950, It: 1930, Iw: 10290000 },

  // RHS (SHS + RHS)
  { name: 'SHS 80x80x4',    series: 'RHS', h: 80,  b: 80,  tw: 4,  tf: 4,  r: 4,  A: 11.7, Iy: 115,   Iz: 115,   Wy: 28.7,  Wz: 28.7,  Wpl_y: 34.1,  Wpl_z: 34.1,  It: 182,  Iw: 0 },
  { name: 'SHS 100x100x5',  series: 'RHS', h: 100, b: 100, tw: 5,  tf: 5,  r: 5,  A: 18.7, Iy: 293,   Iz: 293,   Wy: 58.6,  Wz: 58.6,  Wpl_y: 69.6,  Wpl_z: 69.6,  It: 467,  Iw: 0 },
  { name: 'SHS 120x120x5',  series: 'RHS', h: 120, b: 120, tw: 5,  tf: 5,  r: 5,  A: 22.7, Iy: 518,   Iz: 518,   Wy: 86.3,  Wz: 86.3,  Wpl_y: 102,   Wpl_z: 102,   It: 818,  Iw: 0 },
  { name: 'SHS 150x150x6',  series: 'RHS', h: 150, b: 150, tw: 6,  tf: 6,  r: 6,  A: 33.4, Iy: 1200,  Iz: 1200,  Wy: 160,   Wz: 160,   Wpl_y: 189,   Wpl_z: 189,   It: 1900, Iw: 0 },
  { name: 'SHS 200x200x8',  series: 'RHS', h: 200, b: 200, tw: 8,  tf: 8,  r: 8,  A: 58.8, Iy: 3720,  Iz: 3720,  Wy: 372,   Wz: 372,   Wpl_y: 440,   Wpl_z: 440,   It: 5880, Iw: 0 },
  { name: 'SHS 250x250x10', series: 'RHS', h: 250, b: 250, tw: 10, tf: 10, r: 10, A: 91.0, Iy: 9060,  Iz: 9060,  Wy: 725,   Wz: 725,   Wpl_y: 860,   Wpl_z: 860,   It: 14300, Iw: 0 },
  { name: 'SHS 300x300x10', series: 'RHS', h: 300, b: 300, tw: 10, tf: 10, r: 10, A: 110,  Iy: 15700, Iz: 15700, Wy: 1050,  Wz: 1050,  Wpl_y: 1240,  Wpl_z: 1240,  It: 24700, Iw: 0 },
  { name: 'RHS 100x50x4',   series: 'RHS', h: 100, b: 50,  tw: 4,  tf: 4,  r: 4,  A: 11.0, Iy: 169,   Iz: 55.3,  Wy: 33.8,  Wz: 22.1,  Wpl_y: 41.5,  Wpl_z: 24.6,  It: 122,  Iw: 0 },
  { name: 'RHS 120x60x5',   series: 'RHS', h: 120, b: 60,  tw: 5,  tf: 5,  r: 5,  A: 16.7, Iy: 361,   Iz: 118,   Wy: 60.2,  Wz: 39.4,  Wpl_y: 74.1,  Wpl_z: 43.8,  It: 268,  Iw: 0 },
  { name: 'RHS 150x100x6',  series: 'RHS', h: 150, b: 100, tw: 6,  tf: 6,  r: 6,  A: 28.1, Iy: 1040,  Iz: 548,   Wy: 139,   Wz: 110,   Wpl_y: 165,   Wpl_z: 126,   It: 1130, Iw: 0 },
  { name: 'RHS 200x100x8',  series: 'RHS', h: 200, b: 100, tw: 8,  tf: 8,  r: 8,  A: 43.2, Iy: 2590,  Iz: 883,   Wy: 259,   Wz: 177,   Wpl_y: 316,   Wpl_z: 198,   It: 2260, Iw: 0 },
  { name: 'RHS 250x150x8',  series: 'RHS', h: 250, b: 150, tw: 8,  tf: 8,  r: 8,  A: 58.4, Iy: 6460,  Iz: 2810,  Wy: 517,   Wz: 375,   Wpl_y: 618,   Wpl_z: 432,   It: 6500, Iw: 0 },
  { name: 'RHS 300x200x10', series: 'RHS', h: 300, b: 200, tw: 10, tf: 10, r: 10, A: 91.0, Iy: 14400, Iz: 7220,  Wy: 960,   Wz: 722,   Wpl_y: 1140,  Wpl_z: 831,   It: 15200, Iw: 0 },

  // CHS
  { name: 'CHS 42.4x3.2',  series: 'CHS', h: 42.4,  b: 42.4,  tw: 3.2, tf: 3.2, r: 0, A: 3.94,  Iy: 8.00,   Iz: 8.00,   Wy: 3.77,  Wz: 3.77,  Wpl_y: 5.04,  Wpl_z: 5.04,  It: 16.0,  Iw: 0 },
  { name: 'CHS 48.3x3.2',  series: 'CHS', h: 48.3,  b: 48.3,  tw: 3.2, tf: 3.2, r: 0, A: 4.53,  Iy: 12.2,   Iz: 12.2,   Wy: 5.05,  Wz: 5.05,  Wpl_y: 6.75,  Wpl_z: 6.75,  It: 24.4,  Iw: 0 },
  { name: 'CHS 60.3x4.0',  series: 'CHS', h: 60.3,  b: 60.3,  tw: 4.0, tf: 4.0, r: 0, A: 7.07,  Iy: 29.5,   Iz: 29.5,   Wy: 9.78,  Wz: 9.78,  Wpl_y: 13.1,  Wpl_z: 13.1,  It: 59.0,  Iw: 0 },
  { name: 'CHS 76.1x5.0',  series: 'CHS', h: 76.1,  b: 76.1,  tw: 5.0, tf: 5.0, r: 0, A: 11.2,  Iy: 73.7,   Iz: 73.7,   Wy: 19.4,  Wz: 19.4,  Wpl_y: 26.0,  Wpl_z: 26.0,  It: 147,   Iw: 0 },
  { name: 'CHS 88.9x5.0',  series: 'CHS', h: 88.9,  b: 88.9,  tw: 5.0, tf: 5.0, r: 0, A: 13.2,  Iy: 121,    Iz: 121,    Wy: 27.2,  Wz: 27.2,  Wpl_y: 36.5,  Wpl_z: 36.5,  It: 242,   Iw: 0 },
  { name: 'CHS 114.3x6.3', series: 'CHS', h: 114.3, b: 114.3, tw: 6.3, tf: 6.3, r: 0, A: 21.4,  Iy: 326,    Iz: 326,    Wy: 57.1,  Wz: 57.1,  Wpl_y: 76.5,  Wpl_z: 76.5,  It: 652,   Iw: 0 },
  { name: 'CHS 139.7x8.0', series: 'CHS', h: 139.7, b: 139.7, tw: 8.0, tf: 8.0, r: 0, A: 33.1,  Iy: 766,    Iz: 766,    Wy: 110,   Wz: 110,   Wpl_y: 147,   Wpl_z: 147,   It: 1532,  Iw: 0 },
  { name: 'CHS 168.3x8.0', series: 'CHS', h: 168.3, b: 168.3, tw: 8.0, tf: 8.0, r: 0, A: 40.3,  Iy: 1400,   Iz: 1400,   Wy: 166,   Wz: 166,   Wpl_y: 222,   Wpl_z: 222,   It: 2800,  Iw: 0 },
  { name: 'CHS 219.1x10',  series: 'CHS', h: 219.1, b: 219.1, tw: 10, tf: 10,  r: 0, A: 65.7,  Iy: 3870,   Iz: 3870,   Wy: 353,   Wz: 353,   Wpl_y: 473,   Wpl_z: 473,   It: 7740,  Iw: 0 },
  { name: 'CHS 273x10',    series: 'CHS', h: 273,   b: 273,   tw: 10, tf: 10,  r: 0, A: 82.6,  Iy: 7680,   Iz: 7680,   Wy: 563,   Wz: 563,   Wpl_y: 754,   Wpl_z: 754,   It: 15400, Iw: 0 },
  { name: 'CHS 323.9x12.5', series: 'CHS', h: 323.9, b: 323.9, tw: 12.5, tf: 12.5, r: 0, A: 122, Iy: 15500,  Iz: 15500,  Wy: 957,   Wz: 957,   Wpl_y: 1280,  Wpl_z: 1280,  It: 31000, Iw: 0 },
  { name: 'CHS 406.4x16',  series: 'CHS', h: 406.4, b: 406.4, tw: 16, tf: 16,  r: 0, A: 196,  Iy: 39500,  Iz: 39500,  Wy: 1940,  Wz: 1940,  Wpl_y: 2600,  Wpl_z: 2600,  It: 79000, Iw: 0 },

  // UNP
  { name: 'UNP 80',  series: 'UNP', h: 80,  b: 45,  tw: 6.0, tf: 8.0,  r: 8,    A: 11.0, Iy: 106,  Iz: 19.4, Wy: 26.5,  Wz: 6.36,  Wpl_y: 31.0, Wpl_z: 11.2,  It: 2.95,  Iw: 1120 },
  { name: 'UNP 100', series: 'UNP', h: 100, b: 50,  tw: 6.0, tf: 8.5,  r: 8.5,  A: 13.5, Iy: 206,  Iz: 29.3, Wy: 41.2,  Wz: 8.49,  Wpl_y: 48.4, Wpl_z: 14.8,  It: 3.91,  Iw: 2520 },
  { name: 'UNP 120', series: 'UNP', h: 120, b: 55,  tw: 7.0, tf: 9.0,  r: 9,    A: 17.0, Iy: 364,  Iz: 43.2, Wy: 60.7,  Wz: 11.1,  Wpl_y: 71.9, Wpl_z: 19.3,  It: 5.79,  Iw: 4950 },
  { name: 'UNP 140', series: 'UNP', h: 140, b: 60,  tw: 7.0, tf: 10.0, r: 10,   A: 20.4, Iy: 605,  Iz: 62.7, Wy: 86.4,  Wz: 14.8,  Wpl_y: 103,  Wpl_z: 25.1,  It: 8.46,  Iw: 9120 },
  { name: 'UNP 160', series: 'UNP', h: 160, b: 65,  tw: 7.5, tf: 10.5, r: 10.5, A: 24.0, Iy: 925,  Iz: 85.3, Wy: 116,   Wz: 18.3,  Wpl_y: 138,  Wpl_z: 31.3,  It: 11.0,  Iw: 15400 },
  { name: 'UNP 180', series: 'UNP', h: 180, b: 70,  tw: 8.0, tf: 11.0, r: 11,   A: 28.0, Iy: 1350, Iz: 114,  Wy: 150,   Wz: 22.4,  Wpl_y: 180,  Wpl_z: 38.4,  It: 14.5,  Iw: 24300 },
  { name: 'UNP 200', series: 'UNP', h: 200, b: 75,  tw: 8.5, tf: 11.5, r: 11.5, A: 32.2, Iy: 1910, Iz: 148,  Wy: 191,   Wz: 27.0,  Wpl_y: 228,  Wpl_z: 46.4,  It: 18.4,  Iw: 36700 },
  { name: 'UNP 220', series: 'UNP', h: 220, b: 80,  tw: 9.0, tf: 12.5, r: 12.5, A: 37.4, Iy: 2690, Iz: 197,  Wy: 245,   Wz: 33.6,  Wpl_y: 292,  Wpl_z: 57.4,  It: 24.5,  Iw: 55500 },
  { name: 'UNP 240', series: 'UNP', h: 240, b: 85,  tw: 9.5, tf: 13.0, r: 13,   A: 42.3, Iy: 3600, Iz: 248,  Wy: 300,   Wz: 39.6,  Wpl_y: 358,  Wpl_z: 67.8,  It: 29.4,  Iw: 79000 },
  { name: 'UNP 260', series: 'UNP', h: 260, b: 90,  tw: 10.0, tf: 14.0, r: 14,  A: 48.4, Iy: 4820, Iz: 317,  Wy: 371,   Wz: 47.7,  Wpl_y: 442,  Wpl_z: 81.2,  It: 39.5,  Iw: 109000 },
  { name: 'UNP 280', series: 'UNP', h: 280, b: 95,  tw: 10.0, tf: 15.0, r: 15,  A: 53.3, Iy: 6280, Iz: 399,  Wy: 448,   Wz: 57.2,  Wpl_y: 532,  Wpl_z: 96.9,  It: 51.0,  Iw: 148000 },
  { name: 'UNP 300', series: 'UNP', h: 300, b: 100, tw: 10.0, tf: 16.0, r: 16,  A: 58.8, Iy: 8030, Iz: 495,  Wy: 535,   Wz: 67.8,  Wpl_y: 633,  Wpl_z: 114,   It: 63.0,  Iw: 200000 },
];

// ── Convert each source profile to profiles.json schema ──────────────────────
const migrated = [];
for (const p of SOURCE_PROFILES) {
  // Skip if already in seed entries (preserve hand-tuned catalog values)
  if (seedNames.has(p.name)) continue;

  const area_mm2 = p.A * cm2_to_mm2;
  const iy_mm4   = p.Iy * cm4_to_mm4;
  const iz_mm4   = p.Iz * cm4_to_mm4;
  const it_mm4   = p.It * cm4_to_mm4;

  const kind = profileKind(p.series, p.name);

  // Iw: de Iw-kolom in de brondata bleek voor HEA/HEB/HEM onbruikbaar
  // (+27% tot +154% te hoog — onveilig zodra de kiptoetsing er M_cr mee
  // rekent). Voor dubbelsymmetrische I-secties geldt Iw = Iz·(h − tf)²/4;
  // de tabelwaarde wordt alleen gebruikt als hij daar <5% van afwijkt
  // (IPE-cataloguswaarden zijn nauwkeuriger dan de benadering).
  let iw_mm6 = p.Iw * cm6_to_mm6;
  if (kind === 'ISection') {
    const iw_ref = iz_mm4 * (p.h - p.tf) ** 2 / 4;
    if (!(Math.abs(iw_mm6 - iw_ref) / iw_ref < 0.05)) iw_mm6 = Math.round(iw_ref);
  }

  const { iy_radius_mm, iz_radius_mm } = radius(iy_mm4, iz_mm4, area_mm2);
  const { av_y_mm2, av_z_mm2 } = shearAreas(p.series, p.h, p.b, p.tw, p.tf, p.r, area_mm2);

  let curves = bucklingCurves(p.name, p.series);
  if (curves === null) {
    // I-section: apply h/b rule
    curves = isectionBucklingCurves(p.h, p.b);
  }

  // Geometry: SHS/RHS/CHS use t (uniform thickness), I-sections use tw/tf
  const geom = { h: p.h, b: p.b, tw: p.tw, tf: p.tf, t: p.tw, r: p.r };

  migrated.push({
    name: p.name,
    kind,
    geometry: geom,
    properties: {
      area_mm2,
      iy_mm4,
      iz_mm4,
      wel_y_mm3: p.Wy * cm3_to_mm3,
      wel_z_mm3: p.Wz * cm3_to_mm3,
      wpl_y_mm3: p.Wpl_y * cm3_to_mm3,
      wpl_z_mm3: p.Wpl_z * cm3_to_mm3,
      av_y_mm2,
      av_z_mm2,
      it_mm4,
      iw_mm6,
      iy_radius_mm,
      iz_radius_mm,
      h_mm: p.h,
      b_mm: p.b,
      tw_mm: p.tw,
      tf_mm: p.tf,
      r_mm: p.r,
    },
    buckling_curves: curves,
  });
}

// Combine: seeds first (preserved), then migrated new profiles
const merged = [...seeds, ...migrated];

fs.writeFileSync(OUT_JSON, JSON.stringify(merged, null, 2) + '\n', 'utf8');
console.log(`Wrote ${merged.length} profiles to ${OUT_JSON}`);
console.log(`  Preserved seeds:   ${seeds.length}`);
console.log(`  Migrated from TS:  ${migrated.length}`);
