// Regressiecheck op de oude Nederlandse breedflensreeksen DIE, DIL en DIN in
// de profieldatabase (Differdinger parallelflensbalken, "Grey").
//
// De maten komen uit gescande staaltabellen; zie
// scripts/genereer-oude-profielen.mjs voor de bron en voor de validatie met de
// Rust-doorsnedemotor. Die validatie heeft een Rust-toolchain nodig; deze test
// niet, en bewaakt daarom hier wat er ook zonder cargo te bewaken valt:
//
//   - de drie reeksen zitten compleet in de gegenereerde tabellen (30/22/30)
//   - de hoofdmaten van een steekproef zijn nog die uit de gedrukte tabel
//   - A, I_y en I_z liggen binnen 1,5 % van de gedrukte waarden — dezelfde
//     grens als het generatiescript hanteert
//   - de historische halve maten (42½ en 47½) blijven leesbaar EN sorteren op
//     hun plaats: de zoeksleutel "DIN425" mag niet als maat 425 gaan gelden
//   - de reeksen zijn in de profieleditor te kiezen
//
// Uitvoeren: npx tsx test-oude-profielen.mjs

const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { STEEL_SECTIONS } = await import("./src/lib/steelSections.generated.ts");
const { REEKSEN, basisprofielVan, profielLabel, profielenVanReeks, reeksVanProfiel } =
  await import("./src/lib/profieleditor/catalogus.ts");

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

/** Afwijking in procent van de gedrukte waarde. */
const afwijking = (berekend, tabel) => (Math.abs(berekend - tabel) / tabel) * 100;

/**
 * Steekproef uit de gedrukte tabellen: per reeks de kleinste maat, een
 * historische halve maat en de grootste.
 * [sleutel, h, b, tw, tf, r, F_cm2, Ix_cm4, Iy_cm4]
 */
const STEEKPROEF = [
  ["DIE10", 94, 99, 5.0, 8.0, 11, 20.8, 327, 130],
  ["DIE425", 415, 297, 11.5, 21.0, 21, 171, 54684, 9179],
  ["DIE100", 992, 298, 17.0, 32.0, 30, 356, 568988, 14172],
  ["DIL14", 140, 140, 4.5, 12, 12, 40.1, 1480, 549],
  ["DIL60", 600, 300, 14.0, 31, 26, 267, 172870, 13970],
  ["DIN20", 200, 200, 10, 16, 15, 82.7, 5950, 2140],
  ["DIN475", 475, 300, 15, 28, 23, 235, 95120, 12620],
  ["DIN100", 1000, 300, 19, 36, 30, 400, 644700, 16280],
];

log("\nOude profielreeksen — aanwezig en compleet");
for (const [prefix, aantal] of [["DIE", 30], ["DIL", 22], ["DIN", 30]]) {
  const n = Object.keys(STEEL_SECTION_DIMS).filter((k) => k.startsWith(prefix)).length;
  check(`${prefix}: ${aantal} maten`, n === aantal, `waren er ${n}`);
  check(
    `${prefix} is als reeks te kiezen`,
    REEKSEN.some((r) => r.id === prefix) && profielenVanReeks(prefix).length === aantal,
  );
}

log("\nOude profielreeksen — hoofdmaten en grootheden uit de gedrukte tabel");
for (const [sleutel, h, b, tw, tf, r, fCm2, ixCm4, iyCm4] of STEEKPROEF) {
  const d = STEEL_SECTION_DIMS[sleutel];
  const s = STEEL_SECTIONS[sleutel];
  if (!d || !s || !d.props) {
    check(`${sleutel} staat compleet in de database`, false);
    continue;
  }
  check(
    `${sleutel}: ${h} × ${b}, t_w = ${tw}, t_f = ${tf}, r = ${r}`,
    d.h === h && d.b === b && d.tw === tw && d.tf === tf && d.r === r && d.kind === "ISection",
    `${d.h} × ${d.b}, ${d.tw}, ${d.tf}, ${d.r}, ${d.kind}`,
  );
  const dA = afwijking(s.A, fCm2 * 100);
  const dIy = afwijking(s.Iy, ixCm4 * 1e4);
  const dIz = afwijking(d.props.iz, iyCm4 * 1e4);
  check(`${sleutel}: A binnen ${GRENS_PCT} %`, dA <= GRENS_PCT, `${dA.toFixed(2)} %`);
  check(`${sleutel}: I_y binnen ${GRENS_PCT} %`, dIy <= GRENS_PCT, `${dIy.toFixed(2)} %`);
  check(`${sleutel}: I_z binnen ${GRENS_PCT} %`, dIz <= GRENS_PCT, `${dIz.toFixed(2)} %`);
  // Interne consistentie: W_el;y = I_y/(h/2) en W_pl ≥ W_el, ook voor deze
  // reeksen. De database bewaart zes significante cijfers, dus de twee kanten
  // van de gelijkheid mogen daar één afronding uit elkaar liggen.
  check(
    `${sleutel}: W_el,y = I_y/(h/2) en W_pl,y ≥ W_el,y`,
    Math.abs(d.props.welY - s.Iy / (h / 2)) / d.props.welY < 1e-5 && d.props.wplY >= d.props.welY,
    `${d.props.welY} vs ${s.Iy / (h / 2)}`,
  );
}

log("\nOude profielreeksen — de historische halve maten blijven leesbaar");
{
  check('"DIN425" heet "DIN 42.5"', profielLabel("DIN425") === "DIN 42.5", profielLabel("DIN425"));
  check('"DIE475" heet "DIE 47.5"', profielLabel("DIE475") === "DIE 47.5", profielLabel("DIE475"));
  const din = profielenVanReeks("DIN").map(profielLabel);
  const i40 = din.indexOf("DIN 40");
  const i425 = din.indexOf("DIN 42.5");
  const i45 = din.indexOf("DIN 45");
  check(
    "DIN 42.5 staat tussen DIN 40 en DIN 45",
    i40 >= 0 && i425 === i40 + 1 && i45 === i425 + 1,
    `${i40}, ${i425}, ${i45}`,
  );
  check("laatste maat van DIN is 100", din[din.length - 1] === "DIN 100", din[din.length - 1]);
  check('reeks van "DIN 42.5" is DIN', reeksVanProfiel("DIN 42.5") === "DIN");
  const p = basisprofielVan("DIN 42.5");
  check(
    "opzoeken op de leesbare naam vindt h = 425 mm",
    !!p && p.h === 425 && p.b === 300 && p.tw === 14 && p.tf === 26 && p.r === 21,
    JSON.stringify(p),
  );
  check(
    "een oude reeks is een gewoon I-profiel voor de motor",
    basisprofielVan("DIE 30")?.soort === "ISection",
  );
}

log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
