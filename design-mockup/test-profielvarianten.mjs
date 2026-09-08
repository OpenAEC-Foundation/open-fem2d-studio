// Profielvarianten — de keuze van naburige doorsneden, de bepaling van de
// statische onbepaaldheid, de schaling van de doorbuiging en de invoerbouw van
// een variant op een doorgerekend model.
//
// WAT DEZE TEST WÉL BEWIJST: dat de reeksen kloppen met de bronnen (de
// profieldatabase van de rekenkern en de handelsmatenlijst van het kantoor),
// dat er nooit een maat wordt verzonnen die er niet is, dat de graad van
// statische onbepaaldheid overeenkomt met de handberekening, en dat de invoer
// van een variant dezelfde krachtsomhullende draagt als het origineel met
// alléén een andere doorsnede en een geschaalde zakking.
//
// WAT DEZE TEST NIET BEWIJST: de toetsing zelf. Die zit in de Rust-kernen en is
// daar tegen handberekeningen getest. Deze test raakt de kern niet aan.
//
// HANDBEREKENINGEN die hier gecontroleerd worden:
//
//   Statische onbepaaldheid, n = 3m + r − 3j − c (vlak raamwerk):
//     vrij opgelegde ligger      m=1 r=3 j=2 c=0 → n = 3+3−6−0  =  0
//     tweevelds doorgaande ligger m=2 r=4 j=3 c=0 → n = 6+4−9−0  =  1
//     portaal, ingeklemde voeten  m=3 r=6 j=4 c=0 → n = 9+6−12−0 =  3
//     portaal, scharnierende voeten m=3 r=4 j=4 c=0 → n = 9+4−12−0 = 1
//     driescharnierportaal        m=4 r=4 j=5 c=1 → n = 12+4−15−1 = 0
//     uitkraging                  m=1 r=3 j=2 c=0 → n = 3+3−6−0  =  0
//
//   Traagheidsmomenten van rechthoeken (b·h³/12):
//     71 × 171 → 71 · 171³/12 = 71 · 5 000 211 / 12 = 29 584 581,75 mm⁴
//     71 × 196 → 71 · 196³/12 = 71 · 7 529 536 / 12 = 44 549 754,67 mm⁴
//     schaalfactor voor de zakking = 29 584 581,75 / 44 549 754,67 = 0,66407
//
//   Bruto T-doorsnede T 400×450, b_w = 200, h_f = 50 (flens boven):
//     A  = 200·400 + 400·50 = 100 000 mm²
//     z_c = (80 000·200 + 20 000·425)/100 000 = 245 mm
//     I  = 200·400³/12 + 80 000·45² + 400·50³/12 + 20 000·180²
//        = 1 066 666 667 + 162 000 000 + 4 166 667 + 648 000 000
//        = 1 880 833 333 mm⁴
//
//   Wapening die niet past (spiegel van ReinforcementCage::validate):
//     b = 200, c_nom = 30, Ø_beugel = 8 → binnenbreedte 200 − 2·38 = 124 mm
//     4Ø25 = 100 mm  → past;  5Ø25 = 125 mm → past NIET;  4Ø32 = 128 → past NIET
//
// Draaien met: npx tsx test-profielvarianten.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const pv = await import("./src/lib/profielVarianten.ts");
const so = await import("./src/lib/statischeOnbepaaldheid.ts");
const vi = await import("./src/lib/variantInvoer.ts");
const staal = await import("./src/lib/steelCheckBuilder.ts");
const hout = await import("./src/lib/timberCheckBuilder.ts");
const wk = await import("./src/components/beton/wapeningskorf.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual} ≈ ${expected}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}
function checkEq(name, actual, expected) {
  checkTrue(`${name}: ${JSON.stringify(actual)}`, JSON.stringify(actual) === JSON.stringify(expected));
}

/** De profieldatabase van de rekenkern — dezelfde JSON die de Rust-crate leest. */
const PROFIELEN = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../src-tauri/crates/steel-profiles/data/profiles.json", import.meta.url)),
    "utf8",
  ),
);
const namen = (v) => v.voorstellen.map((x) => x.label);

// ── 1. Profielnaam → reeks + maat ─────────────────────────────────────────
log("1. ontleedProfielnaam");
checkEq("IPE 240", pv.ontleedProfielnaam("IPE 240"), { voorvoegsel: "IPE", reeks: "IPE", maat: 240 });
checkEq("UNP350 zonder spatie", pv.ontleedProfielnaam("UNP350"), { voorvoegsel: "UNP", reeks: "UNP", maat: 350 });
checkEq("CHS 168.3x8 — reeks op wanddikte", pv.ontleedProfielnaam("CHS 168.3x8"),
  { voorvoegsel: "CHS", reeks: "CHS|8", maat: 168.3 });
checkEq("SHS 200x200x8 — vierkant wordt '='", pv.ontleedProfielnaam("SHS 200x200x8"),
  { voorvoegsel: "SHS", reeks: "SHS|=|8", maat: 200 });
checkEq("RHS 200x100x8 — breedte én wand in de reeks", pv.ontleedProfielnaam("RHS 200x100x8"),
  { voorvoegsel: "RHS", reeks: "RHS|100|8", maat: 200 });
checkTrue("SHS 200 en SHS 250 met wand 8 zitten in dezelfde reeks",
  pv.ontleedProfielnaam("SHS 200x200x8").reeks === pv.ontleedProfielnaam("SHS 250x250x8").reeks);
checkTrue("SHS met wand 8 en wand 10 zitten NIET in dezelfde reeks",
  pv.ontleedProfielnaam("SHS 200x200x8").reeks !== pv.ontleedProfielnaam("SHS 200x200x10").reeks);
checkTrue("een naam zonder maat levert niets op", pv.ontleedProfielnaam("HEA") === null);

// ── 2. Staalvarianten uit de echte profieldatabase ────────────────────────
log("2. staalVarianten — twee hoger en twee lager binnen dezelfde reeks");
const ipe240 = pv.staalVarianten(1, "IPE240", PROFIELEN);
checkEq("IPE 240 → IPE 200/220/270/300", namen(ipe240), ["IPE 200", "IPE 220", "IPE 270", "IPE 300"]);
checkEq("stappen −2/−1/+1/+2", ipe240.voorstellen.map((v) => v.stap), [-2, -1, 1, 2]);
check("I_y van IPE 240 uit de database", ipe240.huidig.iMm4, 38900000, 0.001);
check("I_y van IPE 200 uit de database",
  ipe240.voorstellen.find((v) => v.label === "IPE 200").iMm4, 19400000, 0.001);
check("A van IPE 200 uit de database",
  ipe240.voorstellen.find((v) => v.label === "IPE 200").aMm2, 2850, 0.001);

const shs = pv.staalVarianten(1, "SHS 200x200x8", PROFIELEN);
checkEq("SHS 200x200x8 blijft bij wanddikte 8", namen(shs),
  ["SHS 160x160x8", "SHS 180x180x8", "SHS 220x220x8", "SHS 250x250x8"]);

log("2b. randgevallen — minder varianten in plaats van verzonnen maten");
const ipe80 = pv.staalVarianten(1, "IPE 80", PROFIELEN);
checkEq("IPE 80 (kleinste) → alleen omhoog", namen(ipe80), ["IPE 100", "IPE 120"]);
const ipe100 = pv.staalVarianten(1, "IPE 100", PROFIELEN);
checkEq("IPE 100 (één na kleinste) → drie varianten", namen(ipe100), ["IPE 80", "IPE 120", "IPE 140"]);
const hea1000 = pv.staalVarianten(1, "HEA 1000", PROFIELEN);
checkEq("HEA 1000 (grootste) → alleen omlaag", namen(hea1000), ["HEA 800", "HEA 900"]);
const hfrhs = pv.staalVarianten(1, "HFRHS200X200X16", PROFIELEN);
checkEq("reeks van één → geen varianten", namen(hfrhs), []);
checkTrue("…mét reden", /één maat/.test(hfrhs.reden ?? ""));
const onbekend = pv.staalVarianten(1, "ZZZ999", PROFIELEN);
checkTrue("onbekend profiel → reden", /profieldatabase/.test(onbekend.reden ?? ""));
const eigen = pv.staalVarianten(1, "EIGEN:gelaste ligger", PROFIELEN);
checkTrue("eigen doorsnede → reden", /geen enkele reeks/.test(eigen.reden ?? ""));

// ── 3. Houtvarianten uit de handelsmatenlijst ─────────────────────────────
log("3. houtVarianten — twee hoogtes op en neer binnen dezelfde breedte");
const h71 = pv.houtVarianten(1, "71x171");
checkEq("71x171 → 121/146/196/221", namen(h71), ["71 x 121", "71 x 146", "71 x 196", "71 x 221"]);
checkEq("profielnamen zonder achtervoegsel",
  h71.voorstellen.map((v) => v.profielnaam), ["71x121", "71x146", "71x196", "71x221"]);
check("I van 71 × 171", h71.huidig.iMm4, 29584581.75, 1e-6);
check("I van 71 × 196", h71.voorstellen.find((v) => v.label === "71 x 196").iMm4, 44549754.667, 1e-4);

const sls = pv.houtVarianten(1, "38x89 SLS");
checkEq("38x89 SLS → 73/86/96/100", namen(sls), ["38 x 73", "38 x 86", "38 x 96", "38 x 100"]);
checkEq("achtervoegsel blijft staan",
  sls.voorstellen.map((v) => v.profielnaam), ["38x73 SLS", "38x86 SLS", "38x96 SLS", "38x100 SLS"]);

log("3b. randgevallen hout");
const sls33 = pv.houtVarianten(1, "38x33");
checkEq("38x33 (kleinste van de reeks) → alleen omhoog", namen(sls33), ["38 x 38", "38 x 44"]);
const azobe80 = pv.houtVarianten(1, "80x200");
checkEq("azobe 80x200 — reeks van één hoogte", namen(azobe80), []);
checkTrue("…mét reden", /één hoogte/.test(azobe80.reden ?? ""));
const buitenReeks = pv.houtVarianten(1, "71x172");
checkEq("71x172 staat niet in de lijst → geen varianten", namen(buitenReeks), []);
checkTrue("…mét reden die de beschikbare hoogtes noemt",
  /hoogte 172 mm komt niet voor/.test(buitenReeks.reden ?? ""));
const geenBreedte = pv.houtVarianten(1, "96x450 GL");
checkTrue("96x450: breedte bestaat, hoogte niet → reden noemt de hoogte",
  /hoogte 450 mm komt niet voor/.test(geenBreedte.reden ?? ""));
const geenRechthoek = pv.houtVarianten(1, "HEA200");
checkTrue("geen rechthoek → reden", /herkenbare rechthoek/.test(geenRechthoek.reden ?? ""));

log("3c. de handelsmatenlijst is letterlijk overgenomen");
const reeks38 = pv.HOUT_HANDELSMATEN.find((r) => r.bMm === 38);
checkEq("SLS 38 telt 22 maten", reeks38.hoogtesMm.length, 22);
checkEq("SLS 38 eerste en laatste", [reeks38.hoogtesMm[0], reeks38.hoogtesMm.at(-1)], [33, 286]);
checkEq("breedtes in de lijst",
  pv.HOUT_HANDELSMATEN.map((r) => r.bMm), [38, 46, 71, 96, 50, 80, 100]);

// ── 4. Betonvarianten: hoogte én wapening ─────────────────────────────────
log("4. betonVarianten");
const controleer = (d, k) => wk.controleerKorf({ ...wk.STANDAARD_KORF, doorsnede: d, korf: k });
const rechthoek = wk.rechthoek(300, 500);
const korf = { cover_mm: 30, stirrup_diameter_mm: 8, top: { count: 2, diameter_mm: 12 }, bottom: { count: 3, diameter_mm: 16 } };
const beton = pv.betonVarianten(7, rechthoek, korf, wk.STAAFDIAMETERS, controleer);
checkEq("hoogtevarianten 400/450/550/600",
  beton.voorstellen.filter((v) => v.soort === "maat").map((v) => v.label),
  ["h = 400 mm", "h = 450 mm", "h = 550 mm", "h = 600 mm"]);
checkEq("hoogtevarianten schrijven een geldige profielnaam terug",
  beton.voorstellen.filter((v) => v.soort === "maat").map((v) => v.profielnaam),
  ["300x400", "300x450", "300x550", "300x600"]);
checkEq("wapening: aantal en diameter, allebei",
  beton.voorstellen.filter((v) => v.soort !== "maat").map((v) => v.label),
  ["onder 2Ø16", "onder 4Ø16", "onder 3Ø12", "onder 3Ø20"]);
checkTrue("acht varianten in totaal (vier hoogtes + vier wapeningen)",
  beton.voorstellen.length === 8);
check("bruto I van 300 × 500", beton.huidig.iMm4, 3.125e9, 1e-6);
check("bruto A van 300 × 500", beton.huidig.aMm2, 150000, 1e-6);
check("bruto I van 300 × 550",
  beton.voorstellen.find((v) => v.label === "h = 550 mm").iMm4, (300 * 550 ** 3) / 12, 1e-6);
checkTrue("een wapeningsvariant laat de bruto doorsnede ongemoeid",
  beton.voorstellen.filter((v) => v.soort !== "maat").every((v) => v.iMm4 === beton.huidig.iMm4));

log("4b. T-doorsnede");
const tee = { shape: "Tee", b_mm: 400, h_mm: 450, b_w_mm: 200, h_f_mm: 50, flange_at_bottom: false };
check("bruto A van de T", pv.brutoDoorsnede(tee).aMm2, 100000, 1e-6);
check("bruto I van de T", pv.brutoDoorsnede(tee).iMm4, 1880833333.33, 1e-4);
const teeVar = pv.betonVarianten(7, tee, korf, wk.STAAFDIAMETERS, controleer);
checkEq("hoogtevariant houdt lijf en flens vast",
  teeVar.voorstellen.find((v) => v.label === "h = 500 mm").profielnaam,
  "T 400x500 bw=200 hf=50");

log("4c. varianten die niet passen worden getoond mét de reden");
// b = 200 → binnenbreedte 200 − 2·(30 + 8) = 124 mm. 4Ø25 = 100 mm past nog.
const smal = wk.rechthoek(200, 500);
const smalleKorf = { cover_mm: 30, stirrup_diameter_mm: 8, top: { count: 2, diameter_mm: 12 }, bottom: { count: 4, diameter_mm: 25 } };
checkTrue("de uitgangskorf zelf past", controleer(smal, smalleKorf) === null);
const smalVar = pv.betonVarianten(7, smal, smalleKorf, wk.STAAFDIAMETERS, controleer);
const vijfStaven = smalVar.voorstellen.find((v) => v.label === "onder 5Ø25");
checkTrue("5Ø25 wordt getoond", vijfStaven !== undefined);
checkTrue("…met de reden dat hij niet in de breedte past",
  /past niet in de breedte/.test(vijfStaven.onmogelijk ?? ""));
const dikker = smalVar.voorstellen.find((v) => v.label === "onder 4Ø32");
checkTrue("4Ø32 wordt getoond met dezelfde reden",
  dikker !== undefined && /past niet in de breedte/.test(dikker.onmogelijk ?? ""));
const dunner = smalVar.voorstellen.find((v) => v.label === "onder 4Ø20");
checkTrue("4Ø20 past wél", dunner !== undefined && dunner.onmogelijk === null);

// Een hoogtevariant waarin de wapening niet meer past. De korf heeft boven en
// onder samen 44 + 50,5 = 94,5 mm nodig; bij h = 90 mm overlappen de rijen dus.
const laag = pv.betonVarianten(7, wk.rechthoek(300, 190), smalleKorf, wk.STAAFDIAMETERS, controleer);
const h90 = laag.voorstellen.find((v) => v.label === "h = 90 mm");
checkTrue("h = 90 mm wordt getoond met de reden dat de wapening overlapt",
  h90 !== undefined && /overlappen/.test(h90.onmogelijk ?? ""));
checkTrue("h = 290 mm past wél",
  laag.voorstellen.find((v) => v.label === "h = 290 mm").onmogelijk === null);

log("4d. diameters aan de rand van de handelsmaten");
const grofsteKorf = { ...korf, bottom: { count: 3, diameter_mm: 40 } };
const grofste = pv.betonVarianten(7, wk.rechthoek(600, 500), grofsteKorf, wk.STAAFDIAMETERS, controleer);
checkEq("Ø40 is de grootste handelsmaat → alleen een maat kleiner",
  grofste.voorstellen.filter((v) => v.soort === "wapeningDiameter").map((v) => v.label),
  ["onder 3Ø32"]);
const eenStaaf = pv.betonVarianten(7, rechthoek, { ...korf, bottom: { count: 1, diameter_mm: 16 } },
  wk.STAAFDIAMETERS, controleer);
checkEq("bij één staaf komt er geen 'nul staven'-variant",
  eenStaaf.voorstellen.filter((v) => v.soort === "wapeningAantal").map((v) => v.label),
  ["onder 2Ø16"]);

// ── 5. Statische onbepaaldheid ────────────────────────────────────────────
log("5. bepaalOnbepaaldheid — tegen de handberekening in de kop van dit bestand");
const kn = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: i * 1000, z: 0 }));

const ligger = so.bepaalOnbepaaldheid(
  kn(2), [{ id: 1, from: 1, to: 2 }],
  [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
);
check("vrij opgelegde ligger: n = 0", ligger.graad, 0);
checkTrue("…en dus statisch bepaald", ligger.statischBepaald === true);
checkTrue("…met de telling in de toelichting", /3·1 \+ 3 − 3·2 − 0 = 0/.test(ligger.toelichting));

const tweevelds = so.bepaalOnbepaaldheid(
  kn(3), [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
  [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 3, type: "zRoller" }],
);
check("tweevelds doorgaande ligger: n = 1", tweevelds.graad, 1);
checkTrue("…dus NIET statisch bepaald", tweevelds.statischBepaald === false);
checkTrue("…met de waarschuwing dat de krachtsverdeling van de stijfheid afhangt",
  /1-voudig statisch onbepaald/.test(tweevelds.toelichting));

const portaalKnopen = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 },
  { id: 3, x: 5000, z: 3000 }, { id: 4, x: 5000, z: 0 },
];
const portaalStaven = [
  { id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }, { id: 3, from: 3, to: 4 },
];
const portaalVast = so.bepaalOnbepaaldheid(portaalKnopen, portaalStaven,
  [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }]);
check("portaal met ingeklemde voeten: n = 3", portaalVast.graad, 3);
const portaalScharnier = so.bepaalOnbepaaldheid(portaalKnopen, portaalStaven,
  [{ nodeId: 1, type: "pinned" }, { nodeId: 4, type: "pinned" }]);
check("portaal met scharnierende voeten: n = 1", portaalScharnier.graad, 1);

const drieScharnier = so.bepaalOnbepaaldheid(
  [...portaalKnopen, { id: 5, x: 2500, z: 3000 }],
  [
    { id: 1, from: 1, to: 2 },
    { id: 2, from: 2, to: 5 },
    { id: 3, from: 5, to: 3, releases: { startRy: true } },
    { id: 4, from: 3, to: 4 },
  ],
  [{ nodeId: 1, type: "pinned" }, { nodeId: 4, type: "pinned" }],
);
check("driescharnierportaal: n = 0", drieScharnier.graad, 0);
checkTrue("…en dus statisch bepaald", drieScharnier.statischBepaald === true);
check("het scharnier is als één voorwaarde geteld", drieScharnier.c, 1);

const uitkraging = so.bepaalOnbepaaldheid(kn(2), [{ id: 1, from: 1, to: 2 }],
  [{ nodeId: 1, type: "fixed" }]);
check("uitkraging: n = 0", uitkraging.graad, 0);
checkTrue("…en dus statisch bepaald", uitkraging.statischBepaald === true);

log("5b. veren, platen en ontbrekende gegevens vallen naar de veilige kant");
const opVeer = so.bepaalOnbepaaldheid(kn(2), [{ id: 1, from: 1, to: 2 }],
  [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 2, type: "rotSpring", k: 1000 }]);
check("een rotatieveer voegt een reactiecomponent toe: n = 1", opVeer.graad, 1);
checkTrue("…en zet de waarschuwing aan", opVeer.statischBepaald === false);

const zonderOpleggingen = so.bepaalOnbepaaldheid(kn(2), [{ id: 1, from: 1, to: 2 }], undefined);
checkTrue("geen opleggingen meegegeven → geen graad", zonderOpleggingen.graad === null);
checkTrue("…en behandeld als statisch onbepaald", zonderOpleggingen.statischBepaald === false);
checkTrue("…met die reden erbij", /niet aan de toetsing meegegeven/.test(zonderOpleggingen.toelichting));

const metPlaat = so.bepaalOnbepaaldheid(
  kn(2), [{ id: 1, from: 1, to: 2 }],
  [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  [{ plateElements: [{ plateId: 1, elements: [], ranges: {} }] }],
);
check("de staventelling zelf blijft 0", metPlaat.graad, 0);
checkTrue("maar met wandschijven telt hij niet meer", metPlaat.statischBepaald === false);
checkTrue("…met die reden erbij", /wandschijven/.test(metPlaat.toelichting));

const mechanisme = so.bepaalOnbepaaldheid(kn(2), [{ id: 1, from: 1, to: 2 }], []);
checkTrue("een negatieve telling wordt niet als 'bepaald' gelezen", mechanisme.statischBepaald === false);
checkTrue("…met de melding dat de telling niet klopt", /mechanisme/.test(mechanisme.toelichting));

// ── 6. De waarschuwing bij de getallen ────────────────────────────────────
log("6. afwijkingTekst — richting van de fout");
const huidig = { iMm4: 1000, aMm2: 100 };
const stijverZwaarder = vi.afwijkingTekst({ iMm4: 2000, aMm2: 150 }, huidig, false);
checkTrue("stijver + statisch onbepaald → werkelijke UC hoger",
  /stijver → werkelijke UC hoger/.test(stijverZwaarder.kort));
checkTrue("…en de onveilige kant staat er voluit bij",
  /de onveilige kant/.test(stijverZwaarder.vol));
checkTrue("zwaarder → eigen gewicht hoger", /zwaarder → werkelijke UC hoger/.test(stijverZwaarder.kort));

const slapper = vi.afwijkingTekst({ iMm4: 500, aMm2: 60 }, huidig, false);
checkTrue("slapper → werkelijke UC lager", /slapper → werkelijke UC lager/.test(slapper.kort));
checkTrue("lichter → eigen gewicht lager", /lichter → werkelijke UC lager/.test(slapper.kort));

const bepaald = vi.afwijkingTekst({ iMm4: 2000, aMm2: 150 }, huidig, true);
checkTrue("statisch bepaald: geen stijfheidswaarschuwing", !/stijver/.test(bepaald.kort));
checkTrue("statisch bepaald: het eigen gewicht blijft wél genoemd",
  /zwaarder → werkelijke UC hoger/.test(bepaald.kort));

const wapening = vi.afwijkingTekst({ iMm4: 1000, aMm2: 100 }, huidig, false);
checkTrue("gelijke doorsnede, onbepaald → 'krachtsverdeling niet herrekend'",
  wapening.kort === "krachtsverdeling niet herrekend");
const wapeningBepaald = vi.afwijkingTekst({ iMm4: 1000, aMm2: 100 }, huidig, true);
checkTrue("gelijke doorsnede, bepaald → niets af te wijken", wapeningBepaald.kort === "");

// ── 7. Doorbuiging schalen ────────────────────────────────────────────────
log("7. schaalDoorbuiging");
const factor = 29584581.75 / 44549754.667; // 71×171 → 71×196
const invoer = vi.schaalDoorbuiging(
  { deflection_inst_mm: -12, deflection_quasi_perm_mm: -8, deflection_notes: ["bestaand"] },
  ["deflection_inst_mm", "deflection_quasi_perm_mm"],
  29584581.75, 44549754.667,
);
check("w_inst geschaald met I_huidig/I_variant", invoer.deflection_inst_mm, -12 * factor, 1e-6);
check("w_qp op dezelfde manier", invoer.deflection_quasi_perm_mm, -8 * factor, 1e-6);
checkTrue("de bestaande notities blijven staan", invoer.deflection_notes[0] === "bestaand");
checkTrue("de aanname staat in de notities", /GESCHAALD/.test(invoer.deflection_notes[1]));

const ongeschaald = vi.schaalDoorbuiging(
  { deflection_actual_max_mm: -12, deflection_notes: [] },
  ["deflection_actual_max_mm"], null, 1000,
);
check("zonder traagheid wordt er niets geschaald", ongeschaald.deflection_actual_max_mm, -12);
checkTrue("…maar staat er wél een melding bij",
  /niet worden geschaald/.test(ongeschaald.deflection_notes[0]));

// ── 8. Invoerbouw van een variant op een doorgerekend model ───────────────
log("8. de bestaande toetsbouwer met een variantdoorsnede");
// Vrij opgelegde ligger van 6 m, IPE 240, S235; q = −10 kN/m.
const L = 6000;
const knopen = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
const opleggingen = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
const solverStaven = [{ id: 1, from: 1, to: 2, E: 210000, A: 3910, I: 38900000 }];
const perCase = new Map([[1, solve({ nodes: knopen, beams: solverStaven, supports: opleggingen, loads: [{ beamId: 1, q: -10 }] })]]);
const combinaties = defaultCombinations();
const comboResultaten = new Map(combinaties.map((c) => [c.id, combineResults(c, perCase)]));

const profielDb = new Map();
for (const p of PROFIELEN) {
  const sleutel = staal.profileLookupKey(p.name);
  if (!profielDb.has(sleutel)) profielDb.set(sleutel, p);
}
const basisStaaf = { id: 1, from: 1, to: 2, material: "S235", profile: "IPE 240" };
const gedeeld = {
  nodes: knopen, supports: opleggingen,
  combinations: combinaties, combinationResults: comboResultaten,
};
const origineel = staal.buildSteelCheckInputs({ ...gedeeld, beams: [basisStaaf], profileDb: profielDb }).inputs[0];

const voorstel = ipe240.voorstellen.find((v) => v.label === "IPE 200");
const variantStaaf = vi.staafMetVariant(basisStaaf, voorstel);
checkEq("de variantstaaf draagt het nieuwe profiel", variantStaaf.profile, "IPE 200");
checkEq("en verder niets anders",
  { id: variantStaaf.id, material: variantStaaf.material }, { id: 1, material: "S235" });

const variant = vi.schaalDoorbuiging(
  { ...staal.buildSteelCheckInputs({ ...gedeeld, beams: [variantStaaf], profileDb: profielDb }).inputs[0] },
  ["deflection_actual_max_mm"], ipe240.huidig.iMm4, voorstel.iMm4,
);
checkEq("profielnaam in de invoer", variant.profile_name, "IPE 200");
checkTrue("DEZELFDE krachtsomhullende — er is niets herrekend",
  JSON.stringify(variant.forces_envelope) === JSON.stringify(origineel.forces_envelope));
checkTrue("dezelfde staaflengte", variant.length_m === origineel.length_m);
check("z_a volgt de variant (h/2 van IPE 200 = 100 mm)", variant.z_a_mm, 100, 0.001);
check("z_a van het origineel (h/2 van IPE 240 = 120 mm)", origineel.z_a_mm, 120, 0.001);
check("de zakking is met I_240/I_200 opgeschaald",
  variant.deflection_actual_max_mm,
  origineel.deflection_actual_max_mm * (38900000 / 19400000), 1e-6);
checkTrue("de zakking van de variant is groter dan die van het origineel",
  Math.abs(variant.deflection_actual_max_mm) > Math.abs(origineel.deflection_actual_max_mm));
checkTrue("de schalingsaanname staat in de notities van de variant",
  variant.deflection_notes.some((n) => /GESCHAALD/.test(n)));
checkTrue("het origineel draagt die notitie NIET",
  !origineel.deflection_notes.some((n) => /GESCHAALD/.test(n)));

log("8b. hetzelfde voor hout");
const houtStaaf = { id: 1, from: 1, to: 2, material: "C24", profile: "71x171" };
const houtOrig = hout.buildTimberCheckInputs({ ...gedeeld, beams: [houtStaaf] }).inputs[0];
const houtVoorstel = h71.voorstellen.find((v) => v.label === "71 x 196");
const houtVariant = vi.schaalDoorbuiging(
  { ...hout.buildTimberCheckInputs({ ...gedeeld, beams: [vi.staafMetVariant(houtStaaf, houtVoorstel)] }).inputs[0] },
  ["deflection_inst_mm", "deflection_quasi_perm_mm"],
  h71.huidig.iMm4, houtVoorstel.iMm4,
);
check("hoogte in de invoer", houtVariant.height_mm, 196);
check("breedte ongewijzigd", houtVariant.width_mm, 71);
checkTrue("dezelfde krachtsomhullende",
  JSON.stringify(houtVariant.forces_envelope) === JSON.stringify(houtOrig.forces_envelope));
check("w_inst geschaald", houtVariant.deflection_inst_mm,
  houtOrig.deflection_inst_mm * factor, 1e-6);
checkTrue("de hogere balk buigt minder door",
  Math.abs(houtVariant.deflection_inst_mm) < Math.abs(houtOrig.deflection_inst_mm));

log("8c. materiaalherkenning voor de variantkeuze");
checkEq("staal", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "S235", profile: "IPE 240" }), "staal");
checkEq("hout", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "C24", profile: "71x171" }), "hout");
checkEq("beton", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500" }), "beton");
checkEq("kruislaaghout", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40" }), "clt");
checkEq("vrij materiaal", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "VRIJ:Steen E=1 rho=1 f=1", profile: "300x500" }), "vrij");
checkEq("onbekend", vi.materiaalVanStaaf({ id: 1, from: 1, to: 2, material: "onzin", profile: "onzin" }), "onbekend");

// ── Slot ──────────────────────────────────────────────────────────────────
log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
