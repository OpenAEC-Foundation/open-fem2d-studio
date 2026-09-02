// P4.3 — Polygonvalidatie + nette foutpaden: exacte checks op de pure
// validatiefuncties in femTypes.ts (gedeeld door tekentool én engine) en op
// het engine-foutpad voor een ongeldige polygoon.
//
// (a) valideerPlaatPolygoon:
//     - convex (vierkant, driehoek) en concaaf (L-vorm) → geaccepteerd,
//       in BEIDE windingsrichtingen (spiegelen mag);
//     - vlinder (zelfsnijdend) → geweigerd;
//     - dubbele hoek (exact én binnen 1 mm) → geweigerd;
//     - collineaire hoeken (geen oppervlakte) → geweigerd;
//     - terugvouwende rand (spike) → geweigerd;
//     - < 3 hoeken → geweigerd.
// (b) isAsgelijndeRechthoek: rechthoek in willekeurige klikvolgorde → true;
//     ruit (gedraaid), degeneraat en n≠4 → false.
// (c) berekenPlaatMeshSignatuur: deterministisch; verandert bij élke
//     coördinaat- of meshSize-wijziging (cache-invalidatie).
// (d) Engine-foutpad: een vlinder-plaat door solve() → NL-melding
//     "snijdt zichzelf", geen half model (throw vóór het meshen).
//     Het WASM-foutpad (triangle.out.wasm hernoemen → melding, model
//     intact) is een HANDMATIGE check in de dev-server: de CDT draait
//     alleen in de browser.
//
// Uitvoeren: npx tsx test-plaat-validatie.mjs   (vanuit design-mockup/)

const {
  valideerPlaatPolygoon, isAsgelijndeRechthoek, berekenPlaatMeshSignatuur,
} = await import("./src/components/fem/femTypes.ts");
const { solve } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
/** Verwacht een afkeuring waarvan de melding op `patroon` matcht. */
function checkAfgekeurd(name, punten, patroon) {
  const fout = valideerPlaatPolygoon(punten);
  checkTrue(name, fout !== null && patroon.test(fout), fout ?? "(geaccepteerd)");
}
/** Verwacht acceptatie (null). */
function checkGoed(name, punten) {
  const fout = valideerPlaatPolygoon(punten);
  checkTrue(name, fout === null, fout ?? "");
}

// ─────────────────────────────────────────────────────────────────────────
// (a) valideerPlaatPolygoon
// ─────────────────────────────────────────────────────────────────────────
log("\n[valideerPlaatPolygoon] accepteren en weigeren");

const vierkant = [
  { x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 0, z: 3000 },
];
const driehoek = [
  { x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 2000, z: 2500 },
];
const lVorm = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 },
];
checkGoed("vierkant (convex, CCW)", vierkant);
checkGoed("vierkant (CW — gespiegeld)", [...vierkant].reverse());
checkGoed("driehoek (convex)", driehoek);
checkGoed("L-vorm (concaaf, CCW)", lVorm);
checkGoed("L-vorm (CW — gespiegeld)", [...lVorm].reverse());

// Vlinder: randen 1 (h1→h2) en 3 (h3→h4) kruisen elkaar.
checkAfgekeurd("vlinder geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 1000 }, { x: 1000, z: 0 }, { x: 0, z: 1000 },
], /snijdt zichzelf/);

// Dubbele hoeken: exact samenvallend en binnen 1 mm.
checkAfgekeurd("dubbele hoek (exact) geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 1000 },
], /vallen \(vrijwel\) samen/);
checkAfgekeurd("dubbele hoek (binnen 1 mm) geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000.4, z: 0.4 }, { x: 0, z: 1000 },
], /vallen \(vrijwel\) samen/);
// Ook NIET-aangrenzende hoeken die samenvallen (zandloper-knik).
checkAfgekeurd("dubbele niet-aangrenzende hoek geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 },
  { x: 0, z: 0.5 }, { x: -1000, z: 1000 }, { x: -1000, z: 0 },
], /vallen \(vrijwel\) samen/);

// Collineair: drie hoeken op één lijn → geen oppervlakte.
checkAfgekeurd("collineaire hoeken geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 },
], /geen oppervlakte/);

// Spike: rand loopt terug over zichzelf (hoek 3 ligt óp rand 1).
checkAfgekeurd("terugvouwende rand (spike) geweigerd", [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 },
], /vouwt .* op zichzelf terug/);

// Te weinig hoeken.
checkAfgekeurd("2 hoeken geweigerd", [
  { x: 0, z: 0 }, { x: 1000, z: 0 },
], /minstens drie/);

// ─────────────────────────────────────────────────────────────────────────
// (b) isAsgelijndeRechthoek
// ─────────────────────────────────────────────────────────────────────────
log("\n[isAsgelijndeRechthoek] classificatie grid-pad vs. polygonpad");
checkTrue("rechthoek (volgorde BL-BR-TR-TL)", isAsgelijndeRechthoek(vierkant) === true);
checkTrue("rechthoek (andere klikvolgorde)", isAsgelijndeRechthoek([
  { x: 3000, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 3000 }, { x: 3000, z: 3000 },
]) === true);
checkTrue("ruit (gedraaid 45°) is GEEN rechthoek", isAsgelijndeRechthoek([
  { x: 1500, z: 0 }, { x: 3000, z: 1500 }, { x: 1500, z: 3000 }, { x: 0, z: 1500 },
]) === false);
checkTrue("degeneraat (hoogte 0) is GEEN rechthoek", isAsgelijndeRechthoek([
  { x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 }, { x: 3000, z: 0 },
]) === false);
checkTrue("n=3 is GEEN rechthoek", isAsgelijndeRechthoek(driehoek) === false);
checkTrue("dubbel bezette bbox-hoek is GEEN rechthoek", isAsgelijndeRechthoek([
  { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 3000, z: 3000 }, { x: 0, z: 3000 },
]) === false);

// ─────────────────────────────────────────────────────────────────────────
// (c) berekenPlaatMeshSignatuur — cache-invalidatie
// ─────────────────────────────────────────────────────────────────────────
log("\n[signatuur] deterministisch + gevoelig voor geometrie en meshSize");
{
  const a = berekenPlaatMeshSignatuur(lVorm, 500);
  const b = berekenPlaatMeshSignatuur(lVorm, 500);
  checkTrue("deterministisch (zelfde invoer → zelfde string)", a === b, a);
  const verplaatst = lVorm.map((p, i) => (i === 2 ? { x: p.x + 1, z: p.z } : p));
  checkTrue("hoekverplaatsing wijzigt signatuur",
    berekenPlaatMeshSignatuur(verplaatst, 500) !== a);
  checkTrue("meshSize-wijziging wijzigt signatuur",
    berekenPlaatMeshSignatuur(lVorm, 250) !== a);
}

// ─────────────────────────────────────────────────────────────────────────
// (d) Engine-foutpad: ongeldige polygoon → NL-fout, geen half model
// ─────────────────────────────────────────────────────────────────────────
log("\n[engine-foutpad] vlinder-plaat door solve()");
{
  // LET OP: de hoekenSET mag geen asgelijnde rechthoek zijn — de
  // rechthoekclassificatie is (net als in P2.2/P3.1) klikvolgorde-
  // onafhankelijk, dus een vlinder met rechthoek-hoekposities zou het
  // grid-pad nemen. Daarom een asymmetrische vlinder (x=1200).
  const vlinder = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 1000 },
      { id: 3, x: 1200, z: 0 }, { id: 4, x: 0, z: 1000 },
    ],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }], loads: [],
    pointLoads: [{ nodeId: 2, fz: -1000 }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500 }],
  };
  try {
    solve(vlinder);
    checkTrue("vlinder-plaat geweigerd", false);
  } catch (e) {
    checkTrue("vlinder-plaat geweigerd", /snijdt zichzelf/.test(e.message), e.message);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
