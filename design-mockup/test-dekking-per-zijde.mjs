// Dekking per zijde — het korfmodel en de tekenmeetkunde van de frontend.
//
// WAAROM DEZE TEST BESTAAT
// 4.4.1.1(1)P meet de betondekking tot "het dichtstbijzijnde betonoppervlak",
// en een balk heeft er meer dan één. Bij het narekenen van een externe
// referentie-berekening bleek dat een van de oorzaken van een verschil in
// momentweerstand: die berekening voert boven en onder een eigen dekking (40
// en 25 mm) en een eigen milieuklasse, terwijl de korf hier één c_nom droeg.
// Bij een plaat met een drukzone van enkele tientallen millimeters ligt de
// bovenwapening daardoor op de verkeerde plaats.
//
// WAT HIER HARD MOET STAAN
//  1. DE HARDE EIS: een korf zonder zijde-gegevens — elk bestaand
//     projectbestand — levert exact dezelfde getallen als vóór deze
//     uitbreiding. Niet "ongeveer": hetzelfde getal.
//  2. Een eigen dekking boven en onder verplaatst de JUISTE wapeningslaag, en
//     alleen die.
//  3. De zijkantdekking stuurt de BREEDTE (staafposities, s_t, vrije
//     staafafstand) en niet de hoogte.
//  4. De frontend en de Rust-kern zeggen hetzelfde: dezelfde d, dezelfde
//     samenvattingsregel, dezelfde weigering.
//
// De getallen zijn met de hand na te rekenen; ze staan bij elke controle.
//
// Draaien met: npx tsx test-dekking-per-zijde.mjs

const wk = await import("./src/components/beton/wapeningskorf.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name} ${extra}`); }
}
function checkEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; log(`  ✓ ${name}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`); }
}

/** De vloerstrook: 1000 × 250, geen beugel, boven 5Ø10 en onder 5Ø12. */
const vloer = wk.rechthoek(1000, 250);
const korfVloer = {
  cover_mm: 30,
  stirrup_diameter_mm: 0,
  top: { count: 5, diameter_mm: 10 },
  bottom: { count: 5, diameter_mm: 12 },
};

/** De balk uit de rest van de tests: 300 × 500, beugel Ø8, tweebenig. */
const balk = wk.rechthoek(300, 500);
const korfBalk = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  stirrup_spacing_mm: 150,
  stirrup_legs: 2,
  top: { count: 2, diameter_mm: 12 },
  bottom: { count: 3, diameter_mm: 16 },
};

// ── 1. De harde eis: zonder zijden verandert er niets ──────────────────────
log("1. Een korf zonder zijde-gegevens rekent precies als vroeger");

checkTrue("de dekking is rondom gelijk", wk.dekkingIsRondomGelijk(korfBalk));
for (const zijde of wk.ZIJDEN) {
  check(`c_nom ${wk.ZIJDE_LABEL[zijde]}`, wk.dekkingVanZijdeMm(korfBalk, zijde), 30);
}
// d = 500 − (30 + 8 + 16/2) = 454 mm; as boven = 30 + 8 + 12/2 = 44 mm.
check("d (onderwapening)", wk.nuttigeHoogteMm(korfBalk, 500), 454);
check("asafstand onder", wk.asAfstandMm(korfBalk, korfBalk.bottom), 46);
check("asafstand boven", wk.asAfstandMm(korfBalk, korfBalk.top), 44);
// De samenvatting leest woordelijk als vroeger — het rapport zet de Rust-versie
// neer en de editor deze; ze moeten gelijk blijven.
checkEq("samenvatting", wk.korfSamenvatting(korfBalk),
  "onder 3Ø16, boven 2Ø12, beugel Ø8 h.o.h. 150 mm, 2-benig, dekking 30 mm");
// s_t = 300 − 2·30 − 8 = 232 mm.
check("s_t afgeleid", wk.beugelDwarsafstandMm(korfBalk, balk).mm, 232);

// Alle drie de zijden UITDRUKKELIJK op 30 mm is hetzelfde bouwwerk en moet dus
// dezelfde getallen én dezelfde tekst geven — niet een andere samenvatting.
let expliciet = korfBalk;
for (const zijde of wk.ZIJDEN) expliciet = wk.zetZijde(expliciet, zijde, { cover_mm: 30 });
checkTrue("expliciet 30 rondom telt als rondom gelijk", wk.dekkingIsRondomGelijk(expliciet));
checkEq("expliciet 30 rondom: dezelfde samenvatting",
  wk.korfSamenvatting(expliciet), wk.korfSamenvatting(korfBalk));
check("expliciet 30 rondom: dezelfde d", wk.nuttigeHoogteMm(expliciet, 500), 454);
checkEq("expliciet 30 rondom: dezelfde staafposities",
  wk.staafPosities(expliciet, balk), wk.staafPosities(korfBalk, balk));

// ── 2. Boven binnen, onder buiten ──────────────────────────────────────────
log("\n2. Bovenzijde 25 mm (XC1), onderzijde 40 mm (XC4)");

let tweezijdig = wk.zetZijde(korfVloer, "Top", { cover_mm: 25, exposure_class: "XC1" });
tweezijdig = wk.zetZijde(tweezijdig, "Bottom", { cover_mm: 40, exposure_class: "XC4" });

checkTrue("de dekking is niet meer rondom gelijk", !wk.dekkingIsRondomGelijk(tweezijdig));
check("c_nom boven", wk.dekkingVanZijdeMm(tweezijdig, "Top"), 25);
check("c_nom onder", wk.dekkingVanZijdeMm(tweezijdig, "Bottom"), 40);
check("c_nom zijkant volgt het element", wk.dekkingVanZijdeMm(tweezijdig, "Sides"), 30);
// Geen beugel: as = c_nom + Ø/2.
// d       = 250 − (40 + 12/2) = 204 mm
// d(boven)=       25 + 10/2   =  30 mm vanaf de bovenrand → 220 mm vanaf onder
check("d (trek onder)", wk.nuttigeHoogteMm(tweezijdig, 250), 204);
check("d (trek boven)", wk.nuttigeHoogteBovenMm(tweezijdig, 250), 220);
// Met één dekking van 30 mm rondom: 214 en 215 mm — de bovenwapening 5 mm te
// laag, de onderwapening 10 mm te hoog.
check("d met één dekking rondom", wk.nuttigeHoogteMm(korfVloer, 250), 214);
check("d boven met één dekking rondom", wk.nuttigeHoogteBovenMm(korfVloer, 250), 215);

checkTrue("de samenvatting noemt alle drie de dekkingen",
  wk.korfSamenvatting(tweezijdig).includes("dekking boven 25 / onder 40 / opzij 30 mm"),
  wk.korfSamenvatting(tweezijdig));

// De milieuklasse per zijde valt terug op die van het element.
checkEq("klasse boven", wk.milieuklasseVanZijde(tweezijdig, "Top", "XC3"), "XC1");
checkEq("klasse onder", wk.milieuklasseVanZijde(tweezijdig, "Bottom", "XC3"), "XC4");
checkEq("klasse zijkant valt terug", wk.milieuklasseVanZijde(tweezijdig, "Sides", "XC3"), "XC3");
checkEq("zonder klasse op het element blijft de zijkant leeg",
  wk.milieuklasseVanZijde(tweezijdig, "Sides", null), null);

// De staafposities: de z van elke rij volgt zijn eigen rand.
const posities = wk.staafPosities(tweezijdig, vloer);
const onderStaven = posities.filter((p) => p.rij === "onder");
const bovenStaven = posities.filter((p) => p.rij === "boven");
check("z van de onderwapening", onderStaven[0].z, 46);
check("z van de bovenwapening", bovenStaven[0].z, 250 - 30);

// ── 3. De zijkant stuurt de breedte, niet de hoogte ────────────────────────
log("\n3. De zijkantdekking gaat naar de breedte");

const breed = wk.zetZijde(korfBalk, "Sides", { cover_mm: 45 });
// s_t = 300 − 2·45 − 8 = 202 mm.
check("s_t volgt de zijkant", wk.beugelDwarsafstandMm(breed, balk).mm, 202);
// d blijft ongemoeid: de onderrand is niet veranderd.
check("d blijft gelijk", wk.nuttigeHoogteMm(breed, 500), 454);
check("d boven blijft gelijk", wk.nuttigeHoogteBovenMm(breed, 500), 456);
// De buitenste staaf schuift 15 mm naar binnen: van 30+8+8 = 46 naar 45+8+8 = 61.
const posBasis = wk.staafPosities(korfBalk, balk).filter((p) => p.rij === "onder");
const posBreed = wk.staafPosities(breed, balk).filter((p) => p.rij === "onder");
check("buitenste staaf zonder zijkantdekking", posBasis[0].x, 46);
check("buitenste staaf mét zijkantdekking 45", posBreed[0].x, 61);
// De vrije staafafstand krimpt mee: hij wordt in de BREEDTE gemeten.
const vrijBasis = wk.vrijeStaafafstandMm(korfBalk, korfBalk.bottom, 300);
const vrijBreed = wk.vrijeStaafafstandMm(breed, breed.bottom, 300);
checkTrue("vrije staafafstand krimpt door een grotere zijkantdekking",
  vrijBreed < vrijBasis - 1e-9, `${vrijBreed} vs ${vrijBasis}`);

// ── 4. De controle kijkt naar de juiste zijde ──────────────────────────────
log("\n4. De korfcontrole");

const metKorf = (k, d = balk) => ({ ...wk.STANDAARD_KORF, doorsnede: d, korf: k });
checkTrue("de tweezijdige vloerkorf is geldig",
  wk.controleerKorf(metKorf(tweezijdig, vloer)) === null,
  String(wk.controleerKorf(metKorf(tweezijdig, vloer))));
checkTrue("een negatieve zijdedekking wordt geweigerd met de zijde erbij",
  (wk.controleerKorf(metKorf(wk.zetZijde(korfBalk, "Top", { cover_mm: -5 }))) ?? "")
    .includes("bovenzijde"));
checkTrue("een dekking van 0 aan een zijde mag (de norm keurt hem af, niet dit model)",
  wk.controleerKorf(metKorf(wk.zetZijde(korfBalk, "Sides", { cover_mm: 0 }))) === null);
// 3Ø16 = 48 mm staal; binnenmaat bij zijkantdekking 130 mm is 300 − 2·138 < 0.
checkTrue("een absurde zijkantdekking laat de rij niet meer passen",
  (wk.controleerKorf(metKorf(wk.zetZijde(korfBalk, "Sides", { cover_mm: 130 }))) ?? "")
    .includes("past niet in de breedte"));
// s_t = 232 mm past bij 30 mm zijkantdekking, maar niet meer bij 45 mm
// (daar is de ruimte 202 mm).
checkTrue("s_t 232 mm past niet meer bij zijkantdekking 45 mm",
  (wk.controleerKorf(metKorf({ ...breed, stirrup_leg_spacing_mm: 232 })) ?? "").includes("202"));

// ── 5. Leeg maken herstelt de basis ────────────────────────────────────────
log("\n5. Een zijde leegmaken laat hem het element weer volgen");

const terug = wk.zetZijde(wk.zetZijde(tweezijdig, "Top", { cover_mm: undefined }),
  "Top", { exposure_class: undefined });
checkTrue("de lege zijde verdwijnt als veld", terug.cover_top === undefined);
check("en volgt weer het element", wk.dekkingVanZijdeMm(terug, "Top"), 30);
// De andere zijde blijft staan: leegmaken van de ene raakt de andere niet.
check("de onderzijde blijft 40 mm", wk.dekkingVanZijdeMm(terug, "Bottom"), 40);

// ── Slot ───────────────────────────────────────────────────────────────────
log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
