// Een INP is géén IPE — de toelopende flens moet ook op de TEKENING staan.
//
// De INP-reeks (DIN 1025-1, normaalprofielen) staat als "ISection" in de
// profieldatabase, net als IPE en HE; de tekening zou hem dus met evenwijdige
// flenzen laten zien. Het veld `flange_slope: 0.14` in profiles.json onder-
// scheidt hem, precies zoals 0,08 dat voor de UNP doet.
//
// Waar `tf` geldt is even belangrijk als de helling: DIN 1025-1 meet de
// flensdikte op een kwart van de flensbreedte vanaf de tip (b/4). Met `tf` op
// het midden van de uitstek zat de doorsnedemotor over de hele reeks 1,3 %
// boven de gedrukte A en 2,4 % boven I_z; met b/4 niet. Deze test toont
// hetzelfde aan uit de catalogus zelf: alleen met die afspraak komt het
// oppervlak van de GETEKENDE contour bij de gepubliceerde A uit.
//
// Draaien met: npx tsx test-inp-flenshelling.mjs
//          (of: node scripts/run-tests.mjs --filter=inp-flenshelling)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const PROFIELEN = resolve(HIER, "..", "src-tauri", "crates", "steel-profiles", "data", "profiles.json");

const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { shapeVanProfiel, shapePath, flensDikteI, flensHellingVanProfiel } = await import(
  "./src/components/shared/profielVorm.ts"
);
const { basisVorm } = await import("./src/lib/profieleditor/tekening.ts");
const { basisprofielVan } = await import("./src/lib/profieleditor/catalogus.ts");

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
 *  Gereedschap: een SVG-pad terugrekenen naar een veelhoek                   *
 *  (zelfde omkering als in test-unp-flenshelling.mjs)                        *
 * ══════════════════════════════════════════════════════════════════════════ */

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
    } else if (cmd !== "Z") {
      throw new Error(`onbekend padcommando ${cmd} in ${d}`);
    }
  }
  return punten;
}

function veelhoekOppervlak(punten) {
  let tweeA = 0;
  for (let i = 0; i < punten.length; i += 1) {
    const [x1, y1] = punten[i];
    const [x2, y2] = punten[(i + 1) % punten.length];
    tweeA += x1 * y2 - x2 * y1;
  }
  return Math.abs(tweeA) / 2;
}

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

const tekeningOppervlak = (shape) => veelhoekOppervlak(padNaarVeelhoek(shapePath(shape, 1, 0, 0).d));

const catalogus = JSON.parse(readFileSync(PROFIELEN, "utf8"));
const uitCatalogus = (naam) => catalogus.find((p) => p.name === naam);

/* ══════════════════════════════════════════════════════════════════════════ *
 *  1. De helling staat in de gegevens en komt in de tekenvorm terecht        *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n1. Helling uit de database naar de tekenvorm");

ok(uitCatalogus("INP 200")?.geometry.flange_slope === 0.14, "profiles.json: INP 200 heeft flange_slope 0,14");
ok(uitCatalogus("IPE 200")?.geometry.flange_slope === undefined, "profiles.json: IPE 200 heeft géén flange_slope");
ok(STEEL_SECTION_DIMS.INP200?.flensHelling === 0.14, "INP 200 draagt flensHelling 0,14 in de TS-tabel");
ok(!(STEEL_SECTION_DIMS.IPE200?.flensHelling > 0), "IPE 200 draagt geen flenshelling");

const inp = shapeVanProfiel("INP 200");
const ipe = shapeVanProfiel("IPE 200");
ok(inp?.type === "isection" && inp.flensHelling === 0.14, "shapeVanProfiel('INP 200') → I met helling 0,14");
ok(ipe?.type === "isection" && !(ipe.flensHelling > 0), "shapeVanProfiel('IPE 200') → I zonder helling");
ok(flensHellingVanProfiel("inp-200") === 0.14, "flensHellingVanProfiel normaliseert de naam");

const basis = basisprofielVan("INP 200");
ok(basis?.soort === "ISectionSchuin", "de profieleditor stuurt een INP als ISectionSchuin naar de motor", basis?.soort);
const editorVorm = basis ? basisVorm(basis) : null;
ok(
  editorVorm?.type === "isection" && editorVorm.flensHelling === 0.14,
  "de profieleditor tekent hem met dezelfde helling",
  JSON.stringify(editorVorm),
);

/* ══════════════════════════════════════════════════════════════════════════ *
 *  2. Het meetpunt van tf: b/4 vanaf de tip                                  *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n2. Flensdikte volgens DIN 1025-1");
{
  const c = (inp.b - inp.tw) / 2;
  ok(Math.abs(flensDikteI(inp, c - inp.b / 4) - inp.tf) < 1e-12, "tf geldt op b/4 vanaf de tip");
  ok(Math.abs(flensDikteI(inp, c) - (inp.tf - 0.14 * (inp.b / 4))) < 1e-12, "aan de tip is de flens 0,14·b/4 dunner");
  ok(flensDikteI(inp, 0) > inp.tf, "bij het lijf is de flens dikker dan tf");
  ok(Math.abs(flensDikteI(ipe, 0) - ipe.tf) < 1e-12 && Math.abs(flensDikteI(ipe, 40) - ipe.tf) < 1e-12, "zonder helling is de dikte overal tf");
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  3. De getekende contour haalt de gepubliceerde A                          *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n3. Oppervlak van de getekende contour tegen de catalogus");
for (const naam of ["INP 80", "INP 200", "INP 400", "INP 600"]) {
  const p = uitCatalogus(naam);
  const shape = shapeVanProfiel(naam);
  const aTek = tekeningOppervlak(shape);
  const dSchuin = (Math.abs(aTek - p.properties.area_mm2) / p.properties.area_mm2) * 100;
  ok(dSchuin < 0.3, `${naam}: getekende contour binnen 0,3 % van A_catalogus`, `${dSchuin.toFixed(3)} %`);
  // Met evenwijdige flenzen (de oude fout) ligt het oppervlak duidelijk hoger.
  const aRecht = tekeningOppervlak({ ...shape, flensHelling: 0 });
  const dRecht = ((aRecht - p.properties.area_mm2) / p.properties.area_mm2) * 100;
  ok(dRecht > 1.0, `${naam}: evenwijdig getekend zou > 1 % te veel zijn`, `${dRecht.toFixed(2)} %`);
  const punten = padNaarVeelhoek(shapePath(shape, 1, 0, 0).d);
  ok(Math.abs(veelhoekZwaartepuntX(punten) - shape.b / 2) < 1e-6, `${naam}: zwaartepunt op b/2 (spiegelbeeld klopt)`);
  ok(!shapePath(shape, 1, 0, 0).d.includes("NaN"), `${naam}: pad zonder NaN`);
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  4. De hele reeks                                                          *
 * ══════════════════════════════════════════════════════════════════════════ */
log("\n4. Alle 21 maten");
{
  const reeks = catalogus.filter((p) => p.name.startsWith("INP "));
  ok(reeks.length === 21, "21 INP-maten in profiles.json", `${reeks.length}`);
  let ergste = 0;
  for (const p of reeks) {
    const a = tekeningOppervlak(shapeVanProfiel(p.name));
    ergste = Math.max(ergste, (Math.abs(a - p.properties.area_mm2) / p.properties.area_mm2) * 100);
  }
  ok(ergste < 0.3, "grootste afwijking tekening–catalogus over de reeks < 0,3 %", `${ergste.toFixed(3)} %`);
  ok(reeks.every((p) => p.kind === "ISection" && p.geometry.flange_slope === 0.14), "alle als ISection met flange_slope 0,14");
  ok(reeks.every((p) => p.buckling_curves.y_axis === "a" && p.buckling_curves.z_axis === "b"), "knikkrommen a/b (gewalst I, h/b > 1,2, tf ≤ 40)");
}

log("");
log(`${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
