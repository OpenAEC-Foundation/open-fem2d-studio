// Het venster Zichtbaarheid (issue #47), de pure kant:
//   - lib/zichtbaarheid.ts: welke instellingen in welke groep staan, dat elke
//     rij een bestaande aan/uit-vlag van displayFlags is (één bron met de
//     verkenner), wat per gebruiker onthouden wordt en hoe een bewaarde of
//     beschadigde voorkeur wordt teruggelezen;
//   - lib/staafLabels.ts: profielnaam, staafnummer en profielbreedte op het
//     staafmidden, loodrecht op de staaf gestapeld zodat ze elkaar niet raken;
//   - lib/aanzichtGeometrie.ts: de breedte b die het aanzicht meegeeft, tegen
//     de catalogus en de invoer (IPE 270 → 135, GL24h 160x400 → 160,
//     beton 300x600 → 300, buis CHS 60,3 → 60,3, verlopend 200 → 150).
// Het gedrag in de browser (venster, verkenner, tekenvlak) bewaakt
// test-zichtbaarheid-ui.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const Z = await import("./src/lib/zichtbaarheid.ts");
const L = await import("./src/lib/staafLabels.ts");
const A = await import("./src/lib/aanzichtGeometrie.ts");
const { DEFAULT_DISPLAY_FLAGS } = await import("./src/components/fem/FemResultsOverlay.tsx");
const { STEEL_SECTION_DIMS } = await import("./src/lib/steelSectionDims.generated.ts");
const { makeInitialSnapshot } = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
function test(naam, fn) {
  try { fn(); passed++; console.log(`  ✓ ${naam}`); }
  catch (e) { failed++; console.log(`  ✗ ${naam}\n      ${e.message.split("\n").join("\n      ")}`); }
}
const rijen = (g) => Z.ZICHTBAARHEID[g].map((r) => r.sleutel);
const lees = (taal, ns) => JSON.parse(readFileSync(new URL(`./src/i18n/locales/${taal}/${ns}.json`, import.meta.url), "utf8"));
const pad = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

console.log("[1] groepen en één bron");
test("drie groepen in de volgorde Labels, Geometrie, Resultaten", () => {
  assert.deepEqual(Z.ZICHTBAARHEID_GROEPEN, ["labels", "geometrie", "resultaten"]);
});
test("Labels: knoopnummers, staafnummers, profielnaam, belastingwaarden, peilmaten, maatlijnen", () => {
  assert.deepEqual(rijen("labels"), ["knoopnummers", "staafnummers", "profielLabels", "lastWaarden", "peilmaten", "maatlijnen"]);
});
test("Geometrie: aanzicht, profielbreedte (onder het aanzicht), kipsteunen, opleggingen, scharnieren, stramien", () => {
  assert.deepEqual(rijen("geometrie"), ["aanzicht", "aanzichtBreedte", "kipsteunen", "opleggingen", "scharnieren", "stramien"]);
  assert.equal(Z.ZICHTBAARHEID.geometrie[1].onder, "aanzicht");
});
test("Resultaten: de bestaande vlaggen van de verkenner", () => {
  const verkenner = readFileSync(new URL("./src/components/fem/FemProjectTree.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const k of rijen("resultaten")) {
    assert.ok(new RegExp(`key: "${k}"|toggle\\("${k}"\\)|${k}: f\\.${k}`).test(verkenner), `${k} staat niet in de verkenner`);
  }
});
test("elke rij (behalve het stramien) is een aan/uit-vlag van displayFlags met een standaardwaarde", () => {
  for (const g of Z.ZICHTBAARHEID_GROEPEN) {
    for (const r of Z.ZICHTBAARHEID[g]) {
      if (r.sleutel === "stramien") continue;
      assert.equal(typeof DEFAULT_DISPLAY_FLAGS[r.sleutel], "boolean", r.sleutel);
    }
  }
});
test("nieuwe vlaggen: knoopnummers aan (zoals altijd), staafnummers en profielbreedte uit, de rest aan", () => {
  const d = DEFAULT_DISPLAY_FLAGS;
  assert.deepEqual(
    [d.knoopnummers, d.staafnummers, d.aanzichtBreedte, d.lastWaarden, d.peilmaten, d.maatlijnen, d.opleggingen, d.scharnieren],
    [true, false, false, true, true, true, true, true]);
});

console.log("\n[2] lezen en zetten");
test("vlagAan: standaard-aan telt als aan tot hij expliciet false is; standaard-uit alleen bij true", () => {
  const oud = { ...DEFAULT_DISPLAY_FLAGS };
  delete oud.knoopnummers; delete oud.staafnummers;
  assert.equal(Z.vlagAan(oud, "knoopnummers"), true, "ontbrekend veld, standaard aan");
  assert.equal(Z.vlagAan(oud, "staafnummers"), false, "ontbrekend veld, standaard uit");
  assert.equal(Z.vlagAan({ ...oud, knoopnummers: false }, "knoopnummers"), false);
  assert.equal(Z.vlagAan({ ...oud, staafnummers: true }, "staafnummers"), true);
});
test("zetVlag wijzigt alleen die vlag en laat het origineel staan", () => {
  const f = Z.zetVlag(DEFAULT_DISPLAY_FLAGS, "knoopnummers", false);
  assert.equal(f.knoopnummers, false);
  assert.equal(DEFAULT_DISPLAY_FLAGS.knoopnummers, true);
  assert.deepEqual({ ...f, knoopnummers: true }, DEFAULT_DISPLAY_FLAGS);
});

console.log("\n[3] onthouden per gebruiker");
test("onthouden: Labels en Geometrie (zonder het stramien), geen resultaatlagen", () => {
  assert.deepEqual(Z.WEERGAVE_VOORKEUREN, [
    "knoopnummers", "staafnummers", "profielLabels", "lastWaarden", "peilmaten", "maatlijnen",
    "aanzicht", "aanzichtBreedte", "kipsteunen", "opleggingen", "scharnieren",
  ]);
  for (const k of ["M", "V", "N", "deflection", "reactions", "uc"]) assert.ok(!Z.WEERGAVE_VOORKEUREN.includes(k), k);
});
test("voorkeurenVan → metVoorkeuren: dezelfde keuze terug", () => {
  const f = { ...DEFAULT_DISPLAY_FLAGS, knoopnummers: false, staafnummers: true, aanzicht: true, M: false };
  const bewaard = JSON.parse(JSON.stringify(Z.voorkeurenVan(f)));
  assert.equal(Object.keys(bewaard).length, 11);
  assert.equal("M" in bewaard, false, "geen resultaatlaag in de voorkeur");
  const terug = Z.metVoorkeuren({ ...DEFAULT_DISPLAY_FLAGS, M: true }, bewaard);
  assert.deepEqual([terug.knoopnummers, terug.staafnummers, terug.aanzicht, terug.M], [false, true, true, true]);
});
test("beschadigde of oude opslag: genegeerd, de standaard blijft", () => {
  for (const x of [null, undefined, 3, "tekst", [true], {}]) {
    assert.deepEqual(Z.metVoorkeuren(DEFAULT_DISPLAY_FLAGS, x), DEFAULT_DISPLAY_FLAGS, JSON.stringify(x));
  }
  const r = Z.metVoorkeuren(DEFAULT_DISPLAY_FLAGS, { knoopnummers: "nee", staafnummers: true, M: false, onbekend: true });
  assert.equal(r.knoopnummers, true, "geen boolean → genegeerd");
  assert.equal(r.staafnummers, true);
  assert.equal(r.M, DEFAULT_DISPLAY_FLAGS.M, "resultaatlaag nooit uit de voorkeur");
  assert.equal("onbekend" in r, false);
});
test("de voorkeur gaat naar de gebruikersvoorkeuren, niet naar het projectbestand", () => {
  const app = readFileSync(new URL("./src/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(app, /getSetting<unknown>\(WEERGAVE_VOORKEUREN_SLEUTEL/);
  assert.match(app, /setSetting\(WEERGAVE_VOORKEUREN_SLEUTEL/);
  const project = readFileSync(new URL("./src/io/projectFile.ts", import.meta.url), "utf8");
  for (const k of ["knoopnummers", "staafnummers", "aanzichtBreedte", "displayFlags"]) {
    assert.ok(!project.includes(k), `${k} in projectFile.ts`);
  }
});

console.log("\n[4] teksten in vier talen");
test("elke label- en toelichtingssleutel bestaat in nl, en, de en fr", () => {
  const sleutels = new Set(["zichtbaarheid.titel", "zichtbaarheid.onthouden", "zichtbaarheid.standaard",
    "zichtbaarheid.groepLabels", "zichtbaarheid.groepGeometrie", "zichtbaarheid.groepResultaten",
    "zichtbaarheid.alleenMetAanzicht", "zichtbaarheid.stramienProject", "zichtbaarheid.resultatenNoot",
    "tree.openZichtbaarheid", "canvas.aanzicht.breedte", "canvas.aanzicht.breedteVerloop"]);
  for (const g of Z.ZICHTBAARHEID_GROEPEN) {
    for (const r of Z.ZICHTBAARHEID[g]) { if (!r.letterlijk) sleutels.add(r.label); sleutels.add(r.hint); }
  }
  for (const taal of ["nl", "en", "de", "fr"]) {
    const c = lees(taal, "common"), rb = lees(taal, "ribbon");
    for (const k of sleutels) assert.equal(typeof pad(c, k), "string", `${taal}: ${k}`);
    for (const k of ["insights.view", "insights.visibility"]) assert.equal(typeof pad(rb, k), "string", `${taal}: ribbon ${k}`);
  }
});

console.log("\n[5] labels op het staafmidden");
const H = { x: 100, y: 300 }, H2 = { x: 500, y: 300 };   // liggend, 400 px
const K = { x: 200, y: 500 }, K2 = { x: 200, y: 100 };   // staand, van voet naar kop
/** Afstand loodrecht op de staaf, + = de kant die op het scherm omhoog wijst. */
test("profielnaam op dezelfde plek als voorheen (9 px, de bovenkant), leesbaar gedraaid", () => {
  const p = L.staafLabelPlaatsen(H, H2, { profiel: "IPE 330" });
  assert.deepEqual([p.profiel.x, p.profiel.y, p.profiel.hoek], [300, 291, 0]);
  const q = L.staafLabelPlaatsen(H2, H, { profiel: "IPE 330" });
  assert.equal(Math.abs(q.profiel.hoek), 0, "andersom getekend: niet ondersteboven");
  assert.equal(q.profiel.y, 291);
  const k = L.staafLabelPlaatsen(K, K2, { profiel: "IPE 270" });
  assert.equal(k.profiel.hoek, -90);
});
test("staafnummer een regel verder naar buiten dan de profielnaam: geen overlap", () => {
  for (const [a, b] of [[H, H2], [H2, H], [K, K2], [K2, K], [{ x: 0, y: 0 }, { x: 300, y: 200 }]]) {
    const p = L.staafLabelPlaatsen(a, b, { profiel: "HEA 200", nummer: "(12)" });
    assert.ok(p.profiel && p.nummer);
    const d = p.nummer.afstand - p.profiel.afstand;
    assert.equal(d, L.NUMMER_STAPEL_PX);
    assert.ok(d > Math.max(L.PROFIEL_LETTER_PX, L.NUMMER_LETTER_PX), "stapel groter dan een letterhoogte");
    // Zelfde draaiing, dus de letterbanden liggen evenwijdig en schuiven d px op.
    assert.equal(p.nummer.hoek, p.profiel.hoek);
    assert.ok(Math.abs(Math.hypot(p.nummer.x - p.profiel.x, p.nummer.y - p.profiel.y) - d) < 1e-9);
  }
});
test("zonder profielnaam staat het staafnummer op diens plek", () => {
  const p = L.staafLabelPlaatsen(H, H2, { nummer: "(3)" });
  assert.equal(p.profiel, null);
  assert.equal(p.nummer.afstand, L.PROFIEL_LABEL_OFFSET_PX);
});
test("te korte staaf: profielnaam vervalt, het korte nummer blijft", () => {
  const p = L.staafLabelPlaatsen({ x: 0, y: 0 }, { x: 40, y: 0 }, { profiel: "IPE 330", nummer: "(3)" });
  assert.equal(p.profiel, null);
  assert.ok(p.nummer);
});
test("aanzicht aan: naam en nummer buiten het aanzicht, de breedte aan de andere kant", () => {
  const half = 20;
  const p = L.staafLabelPlaatsen(H, H2, { profiel: "IPE 330", nummer: "(3)", breedte: "b = 160 mm", aanzichtHalfPx: half });
  assert.equal(p.profiel.afstand, half + L.AANZICHT_MARGE_PX);
  assert.equal(p.nummer.afstand, half + L.AANZICHT_MARGE_PX + L.NUMMER_STAPEL_PX);
  assert.ok(p.breedte.afstand < -(half + L.AANZICHT_MARGE_PX), "breedte aan de onderkant, buiten het aanzicht");
  assert.ok(p.breedte.y > 300, "liggend: onder de staaf");
});
test("breedte alleen met het aanzicht", () => {
  const p = L.staafLabelPlaatsen(H, H2, { breedte: "b = 160 mm" });
  assert.equal(p.breedte, null);
});

console.log("\n[6] de breedte b uit het aanzicht");
const model = makeInitialSnapshot();
const az = new Map(A.modelAanzicht({ nodes: model.nodes, beams: model.beams }).map((a) => [a.staafId, a]));
test("startmodel: IPE 270, IPE 330, GL24h 160x400, beton 300x600", () => {
  assert.deepEqual(az.get(1).breedte, { begin: STEEL_SECTION_DIMS.IPE270.b, eind: STEEL_SECTION_DIMS.IPE270.b });
  assert.equal(STEEL_SECTION_DIMS.IPE270.b, 135);
  assert.equal(az.get(3).breedte.begin, STEEL_SECTION_DIMS.IPE330.b);
  assert.deepEqual(az.get(4).breedte, { begin: 160, eind: 160 });
  assert.deepEqual(az.get(6).breedte, { begin: 300, eind: 300 });
});
test("buis en verlopende houten ligger", () => {
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }];
  const buis = A.staafAanzicht({ id: 1, from: 1, to: 2, material: "S355", profile: "CHS 60.3x4.0" }, nodes);
  assert.ok(Math.abs(buis.breedte.begin - 60.3) < 1e-9, String(buis.breedte.begin));
  const verloop = A.staafAanzicht({ id: 2, from: 1, to: 2, material: "GL24h", profile: "200x600", profileEnd: "150x400" }, nodes);
  assert.deepEqual(verloop.breedte, { begin: 200, eind: 150 });
});
test("doorsnedeBreedte: omhullende in y van veelhoeken en ringen", () => {
  assert.equal(A.doorsnedeBreedte([]), 0);
  assert.equal(A.doorsnedeBreedte([{ soort: "ring", y: 10, z: 0, R: 30, r: 26 }]), 60);
  assert.equal(A.doorsnedeBreedte([
    { soort: "veelhoek", punten: [[0, 0], [100, 0], [100, 10], [0, 10]] },
    { soort: "veelhoek", punten: [[45, 10], [55, 10], [55, 200], [45, 200]] },
  ]), 100);
});

console.log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
