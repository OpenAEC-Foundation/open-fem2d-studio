// De peilmaat van een niveau (issue #48): `lib/peilmaat.ts` geeft de tekst,
// de beginwaarde van de invoer en het lezen van het ingetypte niveau in mm.
// Het tekenvlak gebruikt dezelfde functies; test-peilmaat-ui.mjs bewaakt de
// klik, de invoer en de ene undo-stap op het echte tekenvlak.
//
//   +5,00 m  → invoer "5000"; "5500" → 5500 mm; "−1200" en "-1200" → −1200 mm
//   ±0,00 m  → invoer "0"; een hoogte waar al een ander niveau ligt (binnen
//              1 mm, de tolerantie van de stramienmutator) wordt geweigerd,
//              het eigen niveau niet (ongewijzigd bevestigen mag)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const P = await import("./src/lib/peilmaat.ts");
const { STRAMIEN_TOL_MM } = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
function test(naam, fn) {
  try { fn(); passed++; console.log(`  ✓ ${naam}`); }
  catch (e) { failed++; console.log(`  ✗ ${naam}\n      ${e.message.split("\n").join("\n      ")}`); }
}

const niveaus = [{ id: "1", position: 0 }, { id: "2", position: 5000 }];

test("peilmaattekst in m met twee decimalen en bouwkundig teken", () => {
  assert.equal(P.peilmaatTekst(5000), "+5,00 m");
  assert.equal(P.peilmaatTekst(0), "±0,00 m");
  assert.equal(P.peilmaatTekst(-1200), "−1,20 m");
  assert.equal(P.peilmaatTekst(2), "±0,00 m", "onder 5 mm is het nulniveau");
  assert.equal(P.peilmaatTekst(3125), "+3,13 m");
});

test("niveaulabel: eigen naam vóór de peilmaat, volgnummer niet", () => {
  assert.equal(P.niveauLabel("2", 5000), "+5,00 m");
  assert.equal(P.niveauLabel("  ", 5000), "+5,00 m");
  assert.equal(P.niveauLabel("verdieping", 5000), "verdieping  +5,00 m");
});

test("invoer begint met het huidige niveau in mm", () => {
  assert.equal(P.niveauInvoerStart(5000), "5000");
  assert.equal(P.niveauInvoerStart(0), "0");
  assert.equal(P.niveauInvoerStart(-1200), "-1200");
  assert.equal(P.niveauInvoerStart(2750.5), "2750.5");
});

test("geldige invoer in mm, ook negatief, met komma of typografisch minteken", () => {
  assert.deepEqual(P.leesNiveauInvoer("5500", "2", niveaus), { ok: true, mm: 5500 });
  assert.deepEqual(P.leesNiveauInvoer(" 5500 ", "2", niveaus), { ok: true, mm: 5500 });
  assert.deepEqual(P.leesNiveauInvoer("5500,5", "2", niveaus), { ok: true, mm: 5500.5 });
  assert.deepEqual(P.leesNiveauInvoer("-1200", "2", niveaus), { ok: true, mm: -1200 });
  assert.deepEqual(P.leesNiveauInvoer("−1200", "2", niveaus), { ok: true, mm: -1200 });
});

test("ongeldige invoer: leeg, letters, eenheid erachter, twee decimaaltekens", () => {
  for (const t of ["", "abc", "5,5 m", "5.000,0", "5000mm"]) {
    assert.deepEqual(P.leesNiveauInvoer(t, "2", niveaus), { ok: false, fout: "ongeldig" }, JSON.stringify(t));
  }
});

test("hoogte van een ander niveau (binnen de stramientolerantie) wordt geweigerd", () => {
  assert.equal(STRAMIEN_TOL_MM, 1);
  assert.deepEqual(P.leesNiveauInvoer("0", "2", niveaus), { ok: false, fout: "bezet", peil: "±0,00 m" });
  assert.deepEqual(P.leesNiveauInvoer("1", "2", niveaus), { ok: false, fout: "bezet", peil: "±0,00 m" });
  assert.deepEqual(P.leesNiveauInvoer("1.5", "2", niveaus), { ok: true, mm: 1.5 });
  assert.deepEqual(P.leesNiveauInvoer("5000", "1", niveaus), { ok: false, fout: "bezet", peil: "+5,00 m" });
});

test("het eigen niveau telt niet mee: ongewijzigd bevestigen mag", () => {
  assert.deepEqual(P.leesNiveauInvoer("5000", "2", niveaus), { ok: true, mm: 5000 });
});

test("groter dan voorheen: 12,5 px tekst, driehoekje 12 × 8 px, klikvlak 24 px hoog", () => {
  assert.equal(P.PEILMAAT_FONT_PX, 12.5);
  assert.equal(2 * P.PEIL_DRIEHOEK_HALF_PX, 12);
  assert.equal(P.PEIL_DRIEHOEK_HOOGTE_PX, 8);
  assert.ok(P.PEILMAAT_KLIK_HOOGTE_PX >= 1.5 * P.PEILMAAT_FONT_PX);
  // Klikvlak volgt de tekstlengte (monospace).
  assert.equal(P.peilmaatBreedtePx("+5,00 m"), 7 * 12.5 * 0.6);
});

test("de lettergrootte in de CSS is die van de module", () => {
  const css = readFileSync(new URL("./src/components/fem/FemCanvas.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const blok = /\.fem-stramien-elev \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(blok, new RegExp(`${P.PEILMAAT_FONT_PX}px`));
});

console.log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
