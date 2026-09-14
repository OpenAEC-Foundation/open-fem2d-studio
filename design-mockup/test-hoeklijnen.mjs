// Regressiecheck op de hoeklijnen (L-profielen, EN 10056-1) in de
// profieldatabase en in alles wat er in de frontend van afhangt.
//
// De maten komen uit twee profielcatalogi op de bedrijfsschijf; zie
// scripts/genereer-hoeklijnen.mjs voor de bron en voor de validatie met de
// Rust-doorsnedemotor. Die validatie heeft een Rust-toolchain nodig; deze test
// niet, en bewaakt daarom hier wat er ook zonder cargo te bewaken valt:
//
//   - beide reeksen zitten compleet in profiles.json en in de gegenereerde
//     TS-tabellen (15 gelijkbenig, 42 ongelijkbenig)
//   - de hoofdmaten van een steekproef zijn nog die uit de gedrukte tabel,
//     inclusief de TWEEDE straal r2 (de teenafronding) die alleen deze reeks
//     heeft
//   - A, I_y en I_z liggen binnen 1,5 % van de gedrukte waarden — dezelfde
//     grens als het generatiescript hanteert
//   - het lange been staat langs z: I_y > I_z bij een ongelijkbenig profiel.
//     Dat is de as-afspraak van NEN-EN 1993-1-1 1.7(2) en zij bepaalt élke
//     verdere toets; hem omdraaien zou onopgemerkt de zwakke as sterk maken
//   - de hoofdassen staan in de database (I_yz, I_u, I_v, α) en zijn niet nul:
//     zonder die vier kan de toetsing de kolomknik niet om u-u en v-v doen
//   - i_v < i_z, de reden dat die vervanging veilig-zijdig is
//   - knikkromme b om beide assen (tabel 6.2, rij "L-profielen")
//   - de tekening kent de vorm: type "angle" met drie bogen (één holle hoek,
//     twee teenafrondingen)
//   - de reeksen zijn in de profielkiezer te kiezen en sorteren op maat
//
// Uitvoeren: npx tsx test-hoeklijnen.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const profielenPad = join(
  hier, "..", "src-tauri", "crates", "steel-profiles", "data", "profiles.json",
);
const RUW = JSON.parse(readFileSync(profielenPad, "utf8"));

const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { STEEL_SECTIONS } = await import("./src/lib/steelSections.generated.ts");
const { REEKSEN, basisprofielVan, profielLabel, profielenVanReeks, reeksVanProfiel } =
  await import("./src/lib/profieleditor/catalogus.ts");
const { shapeVanProfiel, shapePath } = await import("./src/components/shared/profielVorm.ts");

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    log(`  ✓ ${name}`);
  } else {
    failed++;
    log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Grens waarbinnen de motor de gedrukte tabelwaarde hoort te halen. */
const GRENS_PCT = 1.5;
const afwijking = (berekend, tabel) => (Math.abs(berekend - tabel) / tabel) * 100;

/**
 * Steekproef uit de gedrukte tabel: de kleinste en de grootste gelijkbenige
 * maat, en drie ongelijkbenige waaronder de maat met de grootste afwijking
 * (L 50x40x5).
 * [sleutel, h, b, t, r1, r2, A_mm2, Iy_cm4, Iz_cm4]
 */
const STEEKPROEF = [
  ["L20X20X3", 20, 20, 3, 3.5, 2, 112, 0.39, 0.39],
  ["L100X100X10", 100, 100, 10, 12, 6, 1920, 177, 177],
  ["L200X200X20", 200, 200, 20, 18, 9, 7630, 2850, 2850],
  ["L50X40X5", 50, 40, 5, 4, 2, 427, 10.5, 5.89],
  ["L100X50X10", 100, 50, 10, 9, 4.5, 1410, 141, 23.4],
  ["L200X100X14", 200, 100, 14, 15, 7.5, 4030, 1650, 282],
];

log("\nHoeklijnen — beide reeksen compleet");
{
  const gelijk = Object.keys(STEEL_SECTION_DIMS).filter((k) => /^L\d+X\d+X\d+$/.test(k) && STEEL_SECTION_DIMS[k].h === STEEL_SECTION_DIMS[k].b);
  const ongelijk = Object.keys(STEEL_SECTION_DIMS).filter((k) => /^L\d+X\d+X\d+$/.test(k) && STEEL_SECTION_DIMS[k].h !== STEEL_SECTION_DIMS[k].b);
  check("15 gelijkbenige maten", gelijk.length === 15, `waren er ${gelijk.length}`);
  check("42 ongelijkbenige maten", ongelijk.length === 42, `waren er ${ongelijk.length}`);
  check(
    "alle 57 dragen kind Angle",
    [...gelijk, ...ongelijk].every((k) => STEEL_SECTION_DIMS[k].kind === "Angle"),
  );
  check(
    "geen enkel ander profiel draagt kind Angle",
    Object.entries(STEEL_SECTION_DIMS)
      .filter(([, d]) => d.kind === "Angle")
      .every(([k]) => /^L\d+X\d+X\d+$/.test(k)),
  );
  check(
    "beide reeksen zijn in de profielkiezer te kiezen",
    REEKSEN.some((r) => r.id === "L") && REEKSEN.some((r) => r.id === "LO") &&
      profielenVanReeks("L").length === 15 && profielenVanReeks("LO").length === 42,
    `${profielenVanReeks("L").length} / ${profielenVanReeks("LO").length}`,
  );
  check('reeks van "L 100x100x10" is L', reeksVanProfiel("L 100x100x10") === "L");
  check('reeks van "L 200x100x14" is LO', reeksVanProfiel("L 200x100x14") === "LO");
}

log("\nHoeklijnen — hoofdmaten en grootheden uit de gedrukte tabel");
for (const [sleutel, h, b, t, r1, r2, a, iyCm4, izCm4] of STEEKPROEF) {
  const d = STEEL_SECTION_DIMS[sleutel];
  const s = STEEL_SECTIONS[sleutel];
  if (!d || !s || !d.props) {
    check(`${sleutel} staat compleet in de database`, false);
    continue;
  }
  check(
    `${sleutel}: ${h} × ${b}, t = ${t}, r = ${r1}, r2 = ${r2}`,
    d.h === h && d.b === b && d.tw === t && d.tf === t && d.r === r1 && d.r2 === r2,
    `${d.h} × ${d.b}, ${d.tw}, ${d.r}, ${d.r2}`,
  );
  const dA = afwijking(s.A, a);
  const dIy = afwijking(s.Iy, iyCm4 * 1e4);
  const dIz = afwijking(d.props.iz, izCm4 * 1e4);
  check(`${sleutel}: A binnen ${GRENS_PCT} %`, dA <= GRENS_PCT, `${dA.toFixed(2)} %`);
  check(`${sleutel}: I_y binnen ${GRENS_PCT} %`, dIy <= GRENS_PCT, `${dIy.toFixed(2)} %`);
  check(`${sleutel}: I_z binnen ${GRENS_PCT} %`, dIz <= GRENS_PCT, `${dIz.toFixed(2)} %`);
}

log("\nHoeklijnen — het lange been staat langs z (NEN-EN 1993-1-1 1.7(2))");
{
  const ongelijk = Object.keys(STEEL_SECTION_DIMS)
    .filter((k) => STEEL_SECTION_DIMS[k].kind === "Angle")
    .map((k) => STEEL_SECTION_DIMS[k])
    .filter((d) => d.h !== d.b);
  check(
    "bij elke ongelijkbenige maat is h het LANGE been",
    ongelijk.every((d) => d.h > d.b),
    ongelijk.filter((d) => d.h <= d.b).map((d) => d.naam).join(", "),
  );
  check(
    "en I_y (om de as evenwijdig aan het korte been) is dan de grootste",
    ongelijk.every((d) => STEEL_SECTIONS[d.naam.replace(/[\s\-.]/g, "").toUpperCase()].Iy > d.props.iz),
  );
}

log("\nHoeklijnen — de hoofdassen staan in de database");
{
  const ruw = new Map(RUW.map((p) => [p.name, p]));
  const namen = ["L 100x100x10", "L 200x100x14", "L 50x40x5"];
  for (const naam of namen) {
    const p = ruw.get(naam);
    if (!p) {
      check(`${naam} staat in profiles.json`, false);
      continue;
    }
    const q = p.properties;
    check(
      `${naam}: I_yz ≠ 0 (y-y en z-z zijn geen hoofdassen)`,
      Math.abs(q.iyz_mm4) > 0.01 * q.iy_mm4,
      `I_yz = ${q.iyz_mm4}`,
    );
    check(
      `${naam}: I_u ≥ I_y en I_v ≤ I_z`,
      q.iu_mm4 >= q.iy_mm4 && q.iv_mm4 <= q.iz_mm4,
      `I_u ${q.iu_mm4}, I_y ${q.iy_mm4}, I_v ${q.iv_mm4}, I_z ${q.iz_mm4}`,
    );
    // De hoofdashoek ligt strikt tussen 0° en 90°: de assen zijn gedraaid.
    const graden = (q.alpha_hoofdas_rad * 180) / Math.PI;
    check(`${naam}: hoofdashoek ${graden.toFixed(1)}° tussen 0 en 90`, graden > 0 && graden < 90);
    // i_v < i_z — de reden dat kolomknik om de hoofdassen veilig-zijdig is.
    const iv = Math.sqrt(q.iv_mm4 / q.area_mm2);
    check(`${naam}: i_v = ${iv.toFixed(1)} mm < i_z = ${q.iz_radius_mm} mm`, iv < q.iz_radius_mm);
    // Zwaartepunt in het beschrijvingsassenstelsel, nodig voor de tekening.
    check(
      `${naam}: zwaartepunt binnen de omhullende`,
      q.y_c_mm > 0 && q.y_c_mm < q.b_mm && q.z_c_mm > 0 && q.z_c_mm < q.h_mm,
      `${q.y_c_mm} / ${q.z_c_mm}`,
    );
  }
  // Exact 45° op de zes significante cijfers waarmee de database bewaart.
  check(
    "gelijkbenig: hoofdashoek 45°",
    Math.abs((ruw.get("L 100x100x10").properties.alpha_hoofdas_rad * 180) / Math.PI - 45) < 1e-3,
    String((ruw.get("L 100x100x10").properties.alpha_hoofdas_rad * 180) / Math.PI),
  );
  check(
    "elke hoeklijn krijgt knikkromme b om beide assen (tabel 6.2)",
    RUW.filter((p) => p.kind === "Angle").every(
      (p) => p.buckling_curves.y_axis === "b" && p.buckling_curves.z_axis === "b",
    ),
  );
}

log("\nHoeklijnen — de tekening kent de vorm");
{
  const vorm = shapeVanProfiel("L 200x100x14");
  check("shapeVanProfiel geeft type angle", vorm?.type === "angle", vorm?.type);
  check(
    "met beide stralen erin",
    vorm?.type === "angle" && vorm.r === 15 && vorm.r2 === 7.5,
    JSON.stringify(vorm),
  );
  const { d } = shapePath(vorm, 1, 0, 0);
  const bogen = (d.match(/ A /g) ?? []).length;
  check("de contour heeft drie bogen (holle hoek + twee teenafrondingen)", bogen === 3, `${bogen}`);
  // De hiel ligt linksonder: in het tekenstelsel loopt y omlaag, dus het pad
  // eindigt op (0, h) en gaat langs (b, h).
  check("het pad loopt langs de hiel op (0, h)", d.includes("L 0.00 200.00"), d);
  // De motorsoort die de profieleditor eruit afleidt.
  check(
    "de motor rekent een hoeklijn als Angle",
    basisprofielVan("L 200x100x14")?.soort === "Angle",
    basisprofielVan("L 200x100x14")?.soort,
  );
  check(
    "en het basisprofiel draagt de teenafronding mee",
    basisprofielVan("L 200x100x14")?.r2 === 7.5,
    String(basisprofielVan("L 200x100x14")?.r2),
  );
  check("een IPE draagt géén tweede straal", basisprofielVan("IPE 300")?.r2 === undefined);
}

log("\nHoeklijnen — sortering en leesbare namen");
{
  const gelijk = profielenVanReeks("L").map(profielLabel);
  check(
    "gelijkbenig loopt van 20 tot 200",
    gelijk[0] === "L 20x20x3" && gelijk[gelijk.length - 1] === "L 200x200x20",
    gelijk.join(", "),
  );
  const ongelijk = profielenVanReeks("LO").map(profielLabel);
  check(
    "ongelijkbenig begint bij L 30x20x3 en eindigt op L 200x100x14",
    ongelijk[0] === "L 30x20x3" && ongelijk[ongelijk.length - 1] === "L 200x100x14",
    ongelijk.join(", "),
  );
  // Binnen dezelfde beenmaten op dikte, numeriek: 6 vóór 8 vóór 10.
  const i6 = ongelijk.indexOf("L 100x50x6");
  const i8 = ongelijk.indexOf("L 100x50x8");
  const i10 = ongelijk.indexOf("L 100x50x10");
  check(
    "L 100x50x6 / x8 / x10 staan op diktevolgorde",
    i6 >= 0 && i8 === i6 + 1 && i10 === i8 + 1,
    `${i6}, ${i8}, ${i10}`,
  );
}

log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
