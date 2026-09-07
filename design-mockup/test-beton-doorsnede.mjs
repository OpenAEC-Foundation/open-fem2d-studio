// Betondoorsnede — de weg van profielnaam naar de doorsnede die de rekenkern
// krijgt, en terug.
//
// Wat hier hard moet staan:
//  1. de profielnaam-grammatica leest rechthoek, T, L en de omgekeerde T, en
//     WEIGERT met een reden wat er niet in past — geen stille afkeur;
//  2. heen en terug (`format` → `parse`) levert dezelfde doorsnede op;
//  3. de solverstijfheid van een T is die van de werkelijke meetkunde en niet
//     b_f·h³/12 — dat is de stijfheid waarmee de eerste ronde begint;
//  4. de korfcontrole en de tekening kijken naar de breedte OP DE HOOGTE van
//     de rij, net als `ReinforcementCage::validate` in de kern;
//  5. de afgeleide meewerkende flensbreedte belandt werkelijk in de
//     doorsnede die het verzoek in gaat.
//
// Handberekening voor de T 400 × 450, flens 50 mm, lijf 200 mm — dezelfde
// doorsnede als `nen-en-1992-1-1/tests/vormen.rs`:
//   A   = 400·50 + 200·400 = 100 000 mm²
//   z_g = (80 000·200 + 20 000·425)/100 000 = 245 mm
//   I   = 200·400³/12 + 80 000·45² + 400·50³/12 + 20 000·180²
//       = 1 066 666 667 + 162 000 000 + 4 166 667 + 648 000 000
//       = 1 880 833 333 mm⁴
// Als rechthoek van 400 × 450 gerekend zou I = 3 037 500 000 mm⁴ zijn: 61 %
// te stijf.
//
// Draaien met: npx tsx test-beton-doorsnede.mjs

const beton = await import("./src/lib/betonCheckBuilder.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");
const korfmodel = await import("./src/components/beton/wapeningskorf.ts");
const { betonStavenUitModel } = await import("./src/lib/betonStijfheid.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.001) {
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
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; log(`  ✓ ${name}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`); }
}

// ── 1. De grammatica van de profielnaam ───────────────────────────────────
log("1. Profielnaam → doorsnede");

const r = beton.parseConcreteSection("300x500");
checkTrue("rechthoek geparsed", r.ok);
checkEq("rechthoek: vorm en maten", [r.doorsnede.shape, r.doorsnede.b_mm, r.doorsnede.h_mm],
  ["Rectangle", 300, 500]);
checkTrue("rechthoek heeft geen flensmaten",
  r.doorsnede.b_w_mm === null && r.doorsnede.h_f_mm === null && r.doorsnede.flange_at_bottom === false);
checkTrue("'300 x 500' met spaties", beton.parseConcreteSection("300 x 500").ok);
checkTrue("'300×500' met maalteken", beton.parseConcreteSection("300×500").ok);

const t = beton.parseConcreteSection("T 400x450 bw=200 hf=50");
checkTrue("T geparsed", t.ok);
checkEq("T: vorm en maten",
  [t.doorsnede.shape, t.doorsnede.b_mm, t.doorsnede.h_mm, t.doorsnede.b_w_mm, t.doorsnede.h_f_mm],
  ["Tee", 400, 450, 200, 50]);
checkTrue("T: flens ligt standaard boven", t.doorsnede.flange_at_bottom === false);

const l = beton.parseConcreteSection("L 400x450 bw=200 hf=50");
checkTrue("L geparsed als Ell", l.ok && l.doorsnede.shape === "Ell");
checkTrue("kleine letters mogen", beton.parseConcreteSection("t 400x450 bw=200 hf=50").ok);
checkTrue("sleutels in willekeurige volgorde",
  beton.parseConcreteSection("T 400x450 hf=50 bw=200").ok);

const omgekeerd = beton.parseConcreteSection("T 400x450 bw=200 hf=50 flens=onder");
checkTrue("omgekeerde T geparsed", omgekeerd.ok && omgekeerd.doorsnede.flange_at_bottom === true);
checkTrue("flens=boven is de standaard, expliciet",
  beton.parseConcreteSection("T 400x450 bw=200 hf=50 flens=boven").ok
  && beton.parseConcreteSection("T 400x450 bw=200 hf=50 flens=boven").doorsnede.flange_at_bottom === false);

// ── 2. Wat NIET parseert, geeft een reden ─────────────────────────────────
log("\n2. Een naam die niet parseert noemt de reden");

const geweigerd = [
  ["lege naam", "", "geen doorsnede opgegeven"],
  ["onzin", "HEA 200", "geen herkenbare betondoorsnede"],
  ["T zonder maten", "T 400", "b×h"],
  ["T zonder lijfbreedte", "T 400x450 hf=50", "lijfbreedte"],
  ["T zonder flensdikte", "T 400x450 bw=200", "flensdikte"],
  ["onbekende sleutel", "T 400x450 bw=200 hf=50 dikte=30", "onbekend"],
  ["geen sleutel=waarde", "T 400x450 200 50", "sleutel=waarde"],
  ["flens=zijkant bestaat niet", "T 400x450 bw=200 hf=50 flens=zijkant", "flens="],
  ["lijf breder dan flens", "T 200x450 bw=400 hf=50", "niet kleiner dan de flensbreedte"],
  ["lijf even breed als flens", "T 400x450 bw=400 hf=50", "niet kleiner dan de flensbreedte"],
  ["flens vult de hoogte", "T 400x450 bw=200 hf=450", "geen lijf over"],
];
for (const [naam, invoer, fragment] of geweigerd) {
  const uit = beton.parseConcreteSection(invoer);
  checkTrue(`${naam} → reden met "${fragment}"`,
    !uit.ok && uit.reden.includes(fragment));
}

// ── 3. Heen en terug ──────────────────────────────────────────────────────
log("\n3. Doorsnede → profielnaam → doorsnede");

for (const naam of [
  "300x500",
  "T 400x450 bw=200 hf=50",
  "L 400x450 bw=200 hf=50",
  "T 400x450 bw=200 hf=50 flens=onder",
]) {
  const heen = beton.parseConcreteSection(naam);
  const tekst = beton.formatConcreteSection(heen.doorsnede);
  const terug = beton.parseConcreteSection(tekst);
  checkEq(`"${naam}" overleeft heen en terug`, terug.doorsnede, heen.doorsnede);
  checkTrue(`"${naam}" schrijft zichzelf: "${tekst}"`, tekst === naam);
}

// ── 4. De naam die de KERN teruggeeft, terug te lezen ─────────────────────
log("\n4. Doorsnedenaam uit een kernresultaat");

checkEq("rechthoek uit de kernnaam", beton.parseSectionNaam("300 x 500"), {
  shape: "Rectangle", b_mm: 300, h_mm: 500, b_w_mm: null, h_f_mm: null, flange_at_bottom: false,
});
checkEq("T uit de kernnaam", beton.parseSectionNaam("T 400 x 450 (flens 400 x 50, lijf 200)"), {
  shape: "Tee", b_mm: 400, h_mm: 450, b_w_mm: 200, h_f_mm: 50, flange_at_bottom: false,
});
checkEq("L uit de kernnaam", beton.parseSectionNaam("L 1450 x 450 (flens 1450 x 50, lijf 200)"), {
  shape: "Ell", b_mm: 1450, h_mm: 450, b_w_mm: 200, h_f_mm: 50, flange_at_bottom: false,
});
checkTrue("omgekeerde T uit de kernnaam",
  beton.parseSectionNaam("T 400 x 450 (flens 400 x 50 onder, lijf 200)")?.flange_at_bottom === true);
checkTrue("onzin levert null", beton.parseSectionNaam("HEA 200") === null);

// ── 5. De solverstijfheid ─────────────────────────────────────────────────
log("\n5. A en I voor de solver");

const rechthoek = resolveSection("C30/37", "300x500");
checkEq("rechthoek: bron", rechthoek.bron, "beton-bxh");
check("rechthoek: A", rechthoek.A, 150000);
check("rechthoek: I", rechthoek.I, (300 * 500 ** 3) / 12);

const tee = resolveSection("C30/37", "T 400x450 bw=200 hf=50");
checkEq("T: bron", tee.bron, "beton-vorm");
check("T: A (handberekening)", tee.A, 100000);
check("T: I (handberekening)", tee.I, 1880833333.3333333);
checkTrue("T is NIET b_f·h³/12", Math.abs(tee.I - (400 * 450 ** 3) / 12) > 1e9);
check("T: hoeveel te stijf zou de rechthoekaanname zijn", (400 * 450 ** 3) / 12 / tee.I, 1.6149, 0.1);
check("T: E blijft E_cm", tee.E, 33000);

// De omgekeerde T heeft hetzelfde oppervlak en hetzelfde traagheidsmoment om
// het EIGEN zwaartepunt; alleen dat zwaartepunt klapt mee.
const omgekeerdeT = resolveSection("C30/37", "T 400x450 bw=200 hf=50 flens=onder");
check("omgekeerde T: zelfde A", omgekeerdeT.A, tee.A);
check("omgekeerde T: zelfde I", omgekeerdeT.I, tee.I);

// De L rekent als de T — dezelfde banden, dus dezelfde A en I.
const ell = resolveSection("C30/37", "L 400x450 bw=200 hf=50");
check("L: zelfde A als de T", ell.A, tee.A);
check("L: zelfde I als de T", ell.I, tee.I);

// ── 6. De meetkunde die de tekening en de korfcontrole delen ──────────────
log("\n6. Breedte op hoogte, banden en omtrek");

const dT = t.doorsnede;
check("onderin het lijf: 200 mm", korfmodel.breedteOpHoogteMm(dT, 0), 200);
check("net onder de flens: 200 mm", korfmodel.breedteOpHoogteMm(dT, 399), 200);
check("op de bandgrens de kleinste: 200 mm", korfmodel.breedteOpHoogteMm(dT, 400), 200);
check("in de flens: 400 mm", korfmodel.breedteOpHoogteMm(dT, 401), 400);
check("bovenrand: 400 mm", korfmodel.breedteOpHoogteMm(dT, 450), 400);
check("buiten de doorsnede: 0", korfmodel.breedteOpHoogteMm(dT, 451), 0);

checkEq("T: twee banden, lijf onder", korfmodel.banden(dT), [
  { z0Mm: 0, z1Mm: 400, bMm: 200 },
  { z0Mm: 400, z1Mm: 450, bMm: 400 },
]);
checkEq("omgekeerde T: flens onder", korfmodel.banden(omgekeerd.doorsnede), [
  { z0Mm: 0, z1Mm: 50, bMm: 400 },
  { z0Mm: 50, z1Mm: 450, bMm: 200 },
]);
checkEq("rechthoek: één band", korfmodel.banden(r.doorsnede), [{ z0Mm: 0, z1Mm: 500, bMm: 300 }]);

// De omtrek is wat de tekening werkelijk tekent. De T staat symmetrisch, de L
// tegen de linkerrand — in de berekening geen verschil, in het beeld wel.
const omtrekT = korfmodel.omtrekPunten(dT);
checkTrue("T: 8 hoekpunten", omtrekT.length === 8);
checkTrue("T: lijf staat symmetrisch (x van 100 tot 300)",
  omtrekT[0][0] === 100 && omtrekT[1][0] === 300);
const omtrekL = korfmodel.omtrekPunten(l.doorsnede);
checkTrue("L: lijf staat tegen de linkerrand (x van 0 tot 200)",
  omtrekL[0][0] === 0 && omtrekL[1][0] === 200);
checkTrue("rechthoek: 4 hoekpunten", korfmodel.omtrekPunten(r.doorsnede).length === 4);

// Bij een L valt het lijf tegen de linkerrand, en dan zouden twee hoekpunten
// samenvallen: een zijde van lengte nul. De vorm tekent daarmee hetzelfde,
// maar een omtrek die je doorgeeft mag zo'n zijde niet dragen.
checkTrue("L: 7 hoekpunten, geen samenvallend paar", omtrekL.length === 7);
const geenDubbele = (punten) =>
  punten.every((p, i) => i === 0 || p[0] !== punten[i - 1][0] || p[1] !== punten[i - 1][1]);
checkTrue("L (flens boven): geen samenvallende hoekpunten", geenDubbele(omtrekL));
const lOnder = beton.parseConcreteSection("L 400x450 bw=200 hf=50 flens=onder");
checkTrue("L (flens onder): geen samenvallende hoekpunten",
  geenDubbele(korfmodel.omtrekPunten(lOnder.doorsnede)));
checkTrue("T: geen samenvallende hoekpunten", geenDubbele(omtrekT));

// ── 7. De korfcontrole kijkt naar de breedte op die hoogte ────────────────
log("\n7. Korfcontrole: de breedte waar de rij ligt");

const korfBasis = { cover_mm: 30, stirrup_diameter_mm: 8 };
const maakKorf = (doorsnede, onder, boven) => ({
  doorsnede,
  betonklasse: "C30/37",
  staalsoort: "B500B",
  korf: { ...korfBasis, bottom: onder, top: boven },
  aantalStroken: 50,
  staaltak: "Horizontal",
});
const grote = beton.parseConcreteSection("T 600x500 bw=200 hf=80").doorsnede;
// Lijf 200 mm → binnenmaat 200 − 2·38 = 124 mm; flens 600 mm → 524 mm.
const past = maakKorf(grote, { count: 5, diameter_mm: 20 }, { count: 8, diameter_mm: 20 });
checkTrue("5Ø20 onder in het lijf en 8Ø20 boven in de flens: in orde",
  korfmodel.controleerKorf(past) === null);
const teVeel = maakKorf(grote, { count: 8, diameter_mm: 20 }, { count: 8, diameter_mm: 20 });
const melding = korfmodel.controleerKorf(teVeel);
checkTrue("8Ø20 onder in het lijf: afgekeurd", melding !== null);
checkTrue("de melding noemt de breedte op die hoogte", (melding ?? "").includes("200 mm breed"));
// Diezelfde korf in een RECHTHOEK van 600 mm zou wél passen — dat is precies
// het verschil dat de tekening ook moet laten zien.
checkTrue("in een rechthoek van 600 mm past hij wél",
  korfmodel.controleerKorf(maakKorf(korfmodel.rechthoek(600, 500),
    { count: 8, diameter_mm: 20 }, { count: 8, diameter_mm: 20 })) === null);
// En een T zonder lijfmaat wordt hier al tegengehouden.
checkTrue("T zonder lijfbreedte wordt geweigerd",
  (korfmodel.controleerKorf(maakKorf(
    { shape: "Tee", b_mm: 400, h_mm: 450, b_w_mm: null, h_f_mm: 50, flange_at_bottom: false },
    { count: 3, diameter_mm: 16 }, { count: 2, diameter_mm: 12 })) ?? "").includes("lijfbreedte"));

// De staven van een rij liggen binnen de breedte waar ze horen.
const posities = korfmodel.staafPosities(past.korf, grote);
const onderX = posities.filter((p) => p.rij === "onder").map((p) => p.x);
checkTrue("onderwapening ligt binnen het lijf (200 tot 400 mm)",
  Math.min(...onderX) >= 200 && Math.max(...onderX) <= 400);
const bovenX = posities.filter((p) => p.rij === "boven").map((p) => p.x);
checkTrue("bovenwapening spreidt over de hele flens",
  Math.min(...bovenX) < 100 && Math.max(...bovenX) > 500);

// ── 8. De afgeleide b_eff belandt in de doorsnede ─────────────────────────
log("\n8. De meewerkende flensbreedte in het verzoek");

const vol = beton.parseConcreteSection("T 2000x450 bw=200 hf=50").doorsnede;
check("zonder b_eff blijft de ingevoerde breedte staan",
  beton.metBeff(vol, undefined).b_mm, 2000);
check("mét b_eff gaat die de doorsnede in", beton.metBeff(vol, 1450).b_mm, 1450);
checkEq("de overige maten blijven",
  [beton.metBeff(vol, 1450).b_w_mm, beton.metBeff(vol, 1450).h_f_mm, beton.metBeff(vol, 1450).shape],
  [200, 50, "Tee"]);
check("een b_eff groter dan b wordt niet overgenomen — (5.7) begrenst hem op b",
  beton.metBeff(vol, 2500).b_mm, 2000);
check("een b_eff die geen flens overlaat wordt niet overgenomen",
  beton.metBeff(vol, 200).b_mm, 2000);
check("een rechthoek verandert nooit",
  beton.metBeff(r.doorsnede, 100).b_mm, 300);

// En hij komt ook werkelijk in de segmentstijfheidsstaaf terecht.
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6, z: 0 }];
const beams = [{
  id: 1, from: 1, to: 2, material: "C30/37", profile: "T 2000x450 bw=200 hf=50",
  checkConfig: { betonKorf: { ...korfBasis, top: { count: 2, diameter_mm: 12 }, bottom: { count: 3, diameter_mm: 16 } } },
}];
const zonder = betonStavenUitModel({ nodes, beams });
check("segmentstaaf zonder b_eff: de ingevoerde breedte",
  zonder.staven[0].doorsnede.b_mm, 2000);
const met = betonStavenUitModel({ nodes, beams, bEffPerStaaf: new Map([[1, 1450]]) });
check("segmentstaaf mét b_eff: de afgeleide breedte", met.staven[0].doorsnede.b_mm, 1450);
checkEq("segmentstaaf houdt de vorm", met.staven[0].doorsnede.shape, "Tee");

// Een onparseerbare naam levert een staaf minder én een reden.
const kapot = betonStavenUitModel({
  nodes,
  beams: [{ ...beams[0], id: 2, profile: "T 2000x450 hf=50" }],
});
checkTrue("staaf met onvolledige T wordt overgeslagen", kapot.staven.length === 0);
checkTrue("met de reden erbij", kapot.overgeslagen[0].reason.includes("lijfbreedte"));

// ── Slot ───────────────────────────────────────────────────────────────────
log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
