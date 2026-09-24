// De staven in aanzicht, op ware grootte (issue #45): `lib/aanzichtGeometrie.ts`
// geeft per staaf de lijnen die het tekenvlak en de constructieschets tekenen.
// Deze test houdt die lijnen tegen de CATALOGUS en de INVOER — niet tegen
// getallen die de module zelf uitrekent:
//
//   IPE 300              h = 300, t_f = 10,7 → contour ±150, flenslijn ±139,3
//   HEA 200 zwakke as    eigen doorsnede, catalogusdeel een kwartslag gedraaid
//                        → hoogte b = 200 (±100), lijf verborgen op ±t_w/2
//   koker RHS 120x60x5   contour ±60, binnenwand verborgen op ±55
//   buis CHS 60.3x4.0    contour ±30,15, binnenwand verborgen op ±26,15
//   GL24h 100x400        contour ±200, lamellen elke 40 mm (schematisch)
//   betonbalk 300x600    korf c = 20, beugel Ø8-200, 4Ø20 onder, 2Ø12 boven:
//                        onder op 20 + 8 + 10 = 38 mm, boven op 600 − 34 = 566,
//                        beugels van 24 tot 576 mm, 30 stuks over 6 m
//
// Plus: zones langs de staaf, de T-balk (zwaartepunt en flens), de richting
// ("boven" is de zijde van de toetsing, ook bij een andersom getekende staaf of
// een kolom), het verloop, kruislaaghout, onbekende doorsneden, de
// tekenvolgorde en het startmodel.
import assert from "node:assert/strict";

const A = await import("./src/lib/aanzichtGeometrie.ts");
const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { eigenDoorsnedenStore } = await import("./src/lib/profieleditor/eigenDoorsnedenStore.ts");
const { makeInitialSnapshot } = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
function test(naam, fn) {
  try { fn(); passed++; console.log(`  ✓ ${naam}`); }
  catch (e) { failed++; console.log(`  ✗ ${naam}\n      ${e.message.split("\n").join("\n      ")}`); }
}
const bijna = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const lijst = (a, b, m, tol = 1e-6) => {
  assert.equal(a.length, b.length, `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  a.forEach((x, i) => bijna(x, b[i], `${m}[${i}]`, tol));
};
const sorteer = (xs) => [...xs].sort((p, q) => p - q);
/** De v-waarden (begin) van de lijnen van één soort die over de hele staaf lopen. */
const langs = (az, soort) => sorteer(az.lijnen.filter((l) => l.soort === soort && l.s0 !== l.s1).map((l) => l.v0));
const soort = (az, s) => az.lijnen.filter((l) => l.soort === s);

const ligger = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
const staaf = (material, profile, extra = {}) =>
  A.staafAanzicht({ id: 1, from: 1, to: 2, material, profile, ...extra }, ligger);

console.log("Staal uit de catalogus");
test("IPE 300: contour op ±h/2, flenslijnen op ±(h/2 − t_f), niets verborgen", () => {
  const d = STEEL_SECTION_DIMS.IPE300;
  assert.deepEqual([d.h, d.tf], [300, 10.7], "catalogus");
  const az = staaf("S235", "IPE 300");
  assert.ok(az, "geen aanzicht");
  lijst(langs(az, "contour"), [-d.h / 2, d.h / 2], "contour");
  lijst(langs(az, "zichtbaar"), [-(d.h / 2 - d.tf), d.h / 2 - d.tf], "flenslijnen");
  assert.equal(soort(az, "verborgen").length, 0, "verborgen");
  assert.equal(az.materiaal, "staal");
  // Kopse einden over de volle hoogte.
  const kop = az.lijnen.filter((l) => l.soort === "contour" && l.s0 === l.s1);
  assert.equal(kop.length, 2);
  kop.forEach((l) => lijst(sorteer([l.v0, l.v1]), [-150, 150], "kop"));
  // In de wereld: een liggende staaf, boven = +z.
  const boven = az.lijnen.find((l) => l.soort === "contour" && l.s0 !== l.s1 && l.v0 > 0);
  lijst([boven.a.x, boven.a.z, boven.b.x, boven.b.z], [0, 150, 6000, 150], "bovenrand in de wereld");
});
test("HEA 200 (sterke as): hoogte h = 190, flenslijnen op ±85", () => {
  const d = STEEL_SECTION_DIMS.HEA200;
  const az = staaf("S235", "HEA 200");
  lijst(langs(az, "contour"), [-d.h / 2, d.h / 2], "contour");
  lijst(langs(az, "zichtbaar"), [-(d.h / 2 - d.tf), d.h / 2 - d.tf], "flenslijnen");
});
test("koker RHS 120x60x5: binnenwand verborgen, geen zichtbare lijn", () => {
  const d = STEEL_SECTION_DIMS.RHS120X60X5;
  const az = staaf("S355", "RHS 120x60x5");
  lijst(langs(az, "contour"), [-60, 60], "contour");
  lijst(langs(az, "verborgen"), [-(d.h / 2 - d.tw), d.h / 2 - d.tw], "binnenwand");
  assert.equal(soort(az, "zichtbaar").length, 0);
});
test("buis CHS 60.3x4.0: buitendiameter en verborgen binnendiameter", () => {
  const d = STEEL_SECTION_DIMS.CHS603X40;
  const az = staaf("S235", "CHS 60.3x4.0");
  lijst(langs(az, "contour"), [-d.h / 2, d.h / 2], "contour");
  lijst(langs(az, "verborgen"), [-(d.h / 2 - d.tw), d.h / 2 - d.tw], "binnenwand", 1e-4);
});
test("U-profiel UPE 200: de flenzen steken uit, dus zichtbaar", () => {
  const d = STEEL_SECTION_DIMS.UPE200;
  const az = staaf("S235", "UPE 200");
  lijst(langs(az, "zichtbaar"), [-(d.h / 2 - d.tf), d.h / 2 - d.tf], "flenslijnen");
});

console.log("Zwakke as: eigen doorsnede met een gedraaid catalogusdeel");
const hea = STEEL_SECTION_DIMS.HEA200;
const eigen = (naam, ontwerp, z_c_mm = 0) => ({
  id: naam, naam, ontwerp,
  eigenschappen: { area_mm2: 1, iy_mm4: 1, y_c_mm: 0, z_c_mm },
  vorm: "Overig", motor: {}, berekendOp: "2026-09-24T00:00:00Z",
});
eigenDoorsnedenStore.getState().bewaar(eigen("HEA 200 zwakke as", {
  soort: "samenstelling", lamellen: [], celMeenemen: false, lassen: [],
  catalogusdelen: [{
    id: "d1", y_mm: 0, z_mm: 0, alphaGraden: 90, gespiegeld: false,
    profiel: { naam: hea.naam, soort: "ISection", h: hea.h, b: hea.b, tw: hea.tw, tf: hea.tf, r: hea.r },
  }],
}));
test("HEA 200 om de zwakke as: hoogte b = 200, lijf verborgen op ±t_w/2", () => {
  const az = staaf("S235", "EIGEN:HEA 200 zwakke as");
  assert.ok(az, "geen aanzicht");
  lijst(langs(az, "contour"), [-hea.b / 2, hea.b / 2], "contour = b");
  lijst(langs(az, "verborgen"), [-hea.tw / 2, hea.tw / 2], "lijf");
  assert.equal(soort(az, "zichtbaar").length, 0, "de flens staat voor het lijf: geen zichtbare lijn");
});
test("eigen gelaste I uit drie platen (lamellen): flenslijnen, zwaartepunt van de motor", () => {
  // Flenzen 200 × 12, lijf 376 × 8, staand; ontwerp met de onderkant op z = 0.
  eigenDoorsnedenStore.getState().bewaar(eigen("Gelaste I 400", {
    soort: "samenstelling", catalogusdelen: [], celMeenemen: false, lassen: [],
    lamellen: [
      { id: "fo", b_mm: 200, t_mm: 12, y_mm: 0, z_mm: 6, alphaGraden: 0 },
      { id: "l", b_mm: 376, t_mm: 8, y_mm: 0, z_mm: 200, alphaGraden: 90 },
      { id: "fb", b_mm: 200, t_mm: 12, y_mm: 0, z_mm: 394, alphaGraden: 0 },
    ],
  }, 200));
  const az = staaf("S235", "EIGEN:Gelaste I 400");
  lijst(langs(az, "contour"), [-200, 200], "contour", 1e-6);
  lijst(langs(az, "zichtbaar"), [-188, 188], "flenslijnen", 1e-6);
});

console.log("Hout");
test("GL24h 100x400: rechthoek op ware hoogte, lamellen elke 40 mm", () => {
  const az = staaf("GL24h", "100x400");
  lijst(langs(az, "contour"), [-200, 200], "contour");
  lijst(langs(az, "lamel"), [-160, -120, -80, -40, 0, 40, 80, 120, 160], "lamellen");
  assert.equal(az.materiaal, "hout");
});
test("massief C24 100x200: geen lamellen", () => {
  const az = staaf("C24", "100x200");
  lijst(langs(az, "contour"), [-100, 100], "contour");
  assert.equal(soort(az, "lamel").length, 0);
});
test("kruislaaghout CLT 40/20/40/20/40: lagen als naden, symmetrisch om de as", () => {
  const az = staaf("C24", "CLT 40/20/40/20/40");
  assert.ok(az, "geen aanzicht");
  lijst(langs(az, "contour"), [-80, 80], "contour");
  lijst(langs(az, "lamel"), [-40, -20, 20, 40], "laaggrenzen");
});

console.log("Beton");
const korf = {
  cover_mm: 20, stirrup_diameter_mm: 8,
  top: { count: 2, diameter_mm: 12 }, bottom: { count: 4, diameter_mm: 20 },
  stirrup_spacing_mm: 200, stirrup_legs: 2,
};
test("betonbalk 300x600 met korf: staven op hun dekking, beugels h.o.h. 200", () => {
  const az = staaf("C30/37", "300x600", { checkConfig: { betonKorf: korf } });
  lijst(langs(az, "contour"), [-300, 300], "contour");
  const w = soort(az, "wapening");
  assert.equal(w.length, 2, "één lijn onder, één boven");
  lijst(sorteer(w.map((l) => l.v0)), [(20 + 8 + 10) - 300, (600 - (20 + 8 + 6)) - 300], "hoogte staafassen");
  // Van c_nom tot c_nom: de staaf stopt voor de kopse kant.
  w.forEach((l) => lijst([l.s0, l.s1], [20, 5980], "lengte"));
  const b = soort(az, "beugel");
  assert.equal(b.length, 30, "6000 / 200");
  lijst(b.slice(0, 3).map((l) => l.s0), [100, 300, 500], "plaats");
  lijst(sorteer([b[0].v0, b[0].v1]), [20 + 4 - 300, 600 - 24 - 300], "hoogte beugel (hart)");
  assert.equal(az.materiaal, "beton");
});
test("zones: onderwapening en beugels wisselen waar de zones wisselen", () => {
  const zones = {
    longitudinal: [
      { side: "Bottom", row: { count: 2, diameter_mm: 16 }, x_start_mm: 0, x_end_mm: 1500, bar_shape: "Recht", casting_position: "Onderzijde" },
      { side: "Bottom", row: { count: 4, diameter_mm: 20 }, x_start_mm: 1500, x_end_mm: 6000, bar_shape: "Recht", casting_position: "Onderzijde" },
    ],
    stirrups: [
      { x_start_mm: 0, x_end_mm: 1000, spacing_mm: 100, legs: 2, diameter_mm: 8 },
      { x_start_mm: 1000, x_end_mm: 6000, spacing_mm: 200, legs: 2, diameter_mm: 8 },
    ],
  };
  const az = staaf("C30/37", "300x600", { checkConfig: { betonKorf: korf, betonZones: zones } });
  const onder = soort(az, "wapening").filter((l) => l.v0 < 0).sort((p, q) => p.s0 - q.s0);
  assert.equal(onder.length, 2, "twee stukken onderwapening");
  lijst([onder[0].s0, onder[0].s1, onder[0].v0], [20, 1500, 20 + 8 + 8 - 300], "2Ø16");
  lijst([onder[1].s0, onder[1].s1, onder[1].v0], [1500, 5980, 20 + 8 + 10 - 300], "4Ø20");
  // Boven zegt geen zone iets: de rij van de korf over de hele staaf.
  const boven = soort(az, "wapening").filter((l) => l.v0 > 0);
  assert.equal(boven.length, 1);
  const b = soort(az, "beugel").map((l) => l.s0);
  assert.equal(b.length, 10 + 25, "10 op 100 en 25 op 200");
  lijst(b.slice(0, 2), [50, 150], "eerste zone");
  lijst(b.slice(10, 12), [1100, 1300], "tweede zone");
});
test("T-balk T 400x450 bw=200 hf=50: gecentreerd op het zwaartepunt, flens aan de bovenzijde", () => {
  // A = 200·400 + 400·50 = 100 000; z_c = (80 000·200 + 20 000·425) / 100 000 = 245.
  const az = staaf("C30/37", "T 400x450 bw=200 hf=50");
  lijst(langs(az, "contour"), [-245, 205], "contour");
  lijst(langs(az, "zichtbaar"), [400 - 245], "onderkant flens");
});
test("betonbalk zonder korf: alleen de contour", () => {
  const az = staaf("C30/37", "300x600");
  assert.equal(soort(az, "wapening").length + soort(az, "beugel").length, 0);
});

console.log("Richting, verloop en randgevallen");
test("andersom getekende betonbalk: de bovenwapening blijft aan de bovenzijde", () => {
  const az = A.staafAanzicht(
    { id: 1, from: 2, to: 1, material: "C30/37", profile: "300x600", checkConfig: { betonKorf: korf } },
    ligger,
  );
  const top = soort(az, "wapening").find((l) => l.v0 > 0);
  bijna(top.a.z, 266, "wereld-z bovenwapening");
  bijna(az.begin.x, 0, "referentierichting van links naar rechts");
});
test("kolom van kop naar voet: 'boven' is links, de staaf wordt staand genoemd", () => {
  const az = A.staafAanzicht(
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE 300" },
    [{ id: 1, x: 0, z: 4000 }, { id: 2, x: 0, z: 0 }],
  );
  assert.equal(az.staand, true);
  assert.deepEqual(az.boven, { x: -1, z: 0 });
  const xs = sorteer(soort(az, "contour").filter((l) => l.s0 !== l.s1).map((l) => l.a.x));
  lijst(xs, [-150, 150], "contour in de wereld");
});
test("verlopend IPE 300 → IPE 200: contour en flenslijnen lopen mee", () => {
  const az = staaf("S235", "IPE 300", { profileEnd: "IPE 200" });
  const top = az.lijnen.find((l) => l.soort === "contour" && l.s0 === 0 && l.s1 === 6000 && l.v0 > 0);
  lijst([top.v0, top.v1], [150, 100], "bovenrand");
  const flens = az.lijnen.find((l) => l.soort === "zichtbaar" && l.v0 > 0);
  lijst([flens.v0, flens.v1], [150 - 10.7, 100 - 8.5], "bovenflens");
});
test("onbekende doorsnede, geen materiaal of een ongeldig verloop: geen aanzicht", () => {
  assert.equal(staaf("S235", "XYZ 123"), null);
  assert.equal(staaf(undefined, "IPE 300"), null);
  assert.equal(staaf("S235", "IPE 300", { profileEnd: "SHS 100x100x5" }), null);
  assert.equal(staaf("S235", "EIGEN:bestaat niet"), null);
});
test("tekenvolgorde: kolommen eerst, liggers erover", () => {
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }, { id: 3, x: 5000, z: 3000 }];
  const lijstje = A.modelAanzicht({
    nodes,
    beams: [
      { id: 7, from: 2, to: 3, material: "S235", profile: "IPE 300" },
      { id: 8, from: 1, to: 2, material: "S235", profile: "HEA 200" },
    ],
  });
  assert.deepEqual(lijstje.map((a) => a.staafId), [8, 7]);
});
test("startmodel: elke staaf een aanzicht, de betonbalk met 30 beugels", () => {
  const m = makeInitialSnapshot();
  const lijstje = A.modelAanzicht(m);
  assert.equal(lijstje.length, m.beams.length);
  assert.deepEqual(lijstje.slice(0, 2).map((a) => a.staafId), [1, 2], "de kolommen van het portaal eerst");
  const beton = lijstje.find((a) => a.materiaal === "beton");
  assert.equal(soort(beton, "beugel").length, 30);
  const regel = lijstje.find((a) => a.staafId === 3);
  const d = STEEL_SECTION_DIMS.IPE330;
  lijst(langs(regel, "contour"), [-d.h / 2, d.h / 2], "IPE 330");
});
test("zijaanzicht rechtstreeks: een hoeklijn heeft zijn zwaartepunt niet in het midden", () => {
  // L 100 × 50 × 10 zonder stralen: A = 10·100 + 40·10 = 1400,
  // z_c = (1000·50 + 400·5) / 1400 = 37,142857.
  const delen = [
    { soort: "veelhoek", punten: [[0, 0], [10, 0], [10, 100], [0, 100]] },
    { soort: "veelhoek", punten: [[10, 0], [50, 0], [50, 10], [10, 10]] },
  ];
  bijna(A.zwaartepuntVanDelen(delen).z, 52000 / 1400, "z_c");
  const za = A.zijaanzicht(delen);
  lijst([za.zMin, za.zMax], [0, 100], "omhullende");
  lijst(za.zichtbaar, [10], "bovenkant van het korte been");
});

console.log("Wanneer de laag in beeld is");
const { aanzichtInBeeld, zonderResultaten } = await import("./src/lib/weergaveModel.ts");
const { DEFAULT_DISPLAY_FLAGS } = await import("./src/components/fem/FemResultsOverlay.tsx");
test("standaard uit; aan in de tab Model en bij een belastinggeval zonder diagram", () => {
  assert.equal(DEFAULT_DISPLAY_FLAGS.aanzicht, false, "standaardvlag");
  const basis = { resultsMode: false, showLoads: false, heeftResultaat: false, omhullende: false };
  assert.equal(aanzichtInBeeld({ ...basis, flags: DEFAULT_DISPLAY_FLAGS }), false, "vinkje uit");
  const aan = { ...DEFAULT_DISPLAY_FLAGS, aanzicht: true };
  assert.equal(aanzichtInBeeld({ ...basis, flags: aan }), true, "tab Model");
  assert.equal(aanzichtInBeeld({ ...basis, flags: aan, showLoads: true }), true, "belastinggeval, niet gerekend");
  // De tab Model zet de resultaatlagen uit; het vinkje blijft staan.
  const naModel = zonderResultaten(aan);
  assert.equal(naModel.aanzicht, true, "de tab Model laat het vinkje staan");
  assert.equal(aanzichtInBeeld({ ...basis, flags: naModel, showLoads: true, heeftResultaat: true }), true,
    "belastinggeval met resultaat maar zonder diagram");
});
test("nooit in de resultaatweergave, en niet onder een resultaatdiagram", () => {
  const aan = { ...DEFAULT_DISPLAY_FLAGS, aanzicht: true };
  const basis = { showLoads: true, heeftResultaat: true, omhullende: false };
  assert.equal(aanzichtInBeeld({ ...basis, flags: aan, resultsMode: true }), false, "tab Resultaten");
  assert.equal(aanzichtInBeeld({ ...basis, flags: aan, resultsMode: false }), false, "M en u staan standaard aan");
  assert.equal(aanzichtInBeeld({ ...basis, flags: { ...zonderResultaten(aan), N: true }, resultsMode: false }), false, "N-lijn");
  assert.equal(aanzichtInBeeld({ ...basis, heeftResultaat: false, omhullende: true, flags: zonderResultaten(aan), resultsMode: false }), false, "omhullende");
  // Reacties en UC-badges zijn geen diagram op de systeemlijn.
  assert.equal(aanzichtInBeeld({ ...basis, flags: { ...zonderResultaten(aan), reactions: true, uc: true }, resultsMode: false }), true, "reacties/UC");
});

console.log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
