// Kruislaaghout — driftcontrole op de standaardopbouwen.
//
// WAAROM DEZE TEST BESTAAT
// ------------------------
// De opbouwen stonden op twee plaatsen: `CLT_VOORINSTELLINGEN` in de frontend
// en `clt_presets()` in de Rust-kern, die alle drie de wegen bedient (het
// command `list_clt_presets`, de toetsbrug en de MCP-server). Ze werden met de
// hand gelijk gehouden en geen enkele test vergeleek ze; wie in de kern een
// laag veranderde, kreeg een app die iets anders in de kiezer toonde dan de
// toetsing rekende. De kern is nu de bron en de TS-lijst wordt gegenereerd —
// deze test bewaakt dat en valt om zodra er één naam, laagdikte of totale
// hoogte uiteenloopt.
//
// De bestaande `test-clt-builder.mjs` controleert alleen dat elke
// voorinstelling een oneven aantal lagen heeft en dat de som klopt; dat blijft
// waar terwijl beide lijsten samen wegdrijven, en vangt drift dus niet.
//
// DRIE ONAFHANKELIJKE INGANGEN, zodat een fout in de lezer zichzelf niet kan
// dekken:
//   1. de gegenereerde lijst zoals de app hem gebruikt (via cltCheckBuilder);
//   2. de lezer van de generator op de Rust-brontekst;
//   3. de RUWE Rust-tekst — voor elke TS-regel bouwen we de `maak(...)`-regel
//      terug en eisen we hem letterlijk in clt.rs, en we tellen de regels.
//
// Draaien met: npx tsx test-clt-voorinstellingen.mjs

import { readFileSync } from "node:fs";

const clt = await import("./src/lib/cltCheckBuilder.ts");
const gen = await import("./scripts/genereer-clt-voorinstellingen.mjs");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}
function checkEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; log(`  ✓ ${name}`); }
  else {
    failed++;
    log(`  ✗ ${name}`);
    log(`      frontend : ${JSON.stringify(actual)}`);
    log(`      kern     : ${JSON.stringify(expected)}`);
  }
}

const ts = clt.CLT_VOORINSTELLINGEN;
const kern = gen.leesKernVoorinstellingen();
const rust = readFileSync(gen.KERN_BRON_PAD, "utf8").replace(/\r\n/g, "\n");

// ── 1. Aantal en volgorde ─────────────────────────────────────────────────
log("1. Aantal en volgorde");
checkTrue(`de kern levert voorinstellingen (${kern.length})`, kern.length > 0);
checkEq("even veel voorinstellingen", ts.length, kern.length);
checkEq("dezelfde namen in dezelfde volgorde",
  ts.map((p) => p.name), kern.map((p) => p.name));

// ── 2. Naam, laagdikten en totale hoogte, per voorinstelling ──────────────
log("2. Naam, laagdikten en totale hoogte per voorinstelling");
for (let i = 0; i < Math.max(ts.length, kern.length); i++) {
  const t = ts[i], k = kern[i];
  if (!t || !k) {
    failed++;
    log(`  ✗ voorinstelling ${i}: staat maar aan één kant ` +
        `(frontend ${t ? JSON.stringify(t.name) : "—"}, kern ${k ? JSON.stringify(k.name) : "—"})`);
    continue;
  }
  checkEq(`${k.name}: naam`, t.name, k.name);
  checkEq(`${k.name}: laagdikten`, t.thicknesses_mm, k.thicknesses_mm);
  checkEq(`${k.name}: totale hoogte`, t.height_mm, k.height_mm);
  // h = Σ t_i moet aan beide kanten kloppen; anders is er hier of daar een
  // laag bijgekomen zonder dat de hoogte meeliep.
  checkTrue(`${k.name}: h = Σ t_i aan beide kanten`,
    t.thicknesses_mm.reduce((a, b) => a + b, 0) === t.height_mm &&
    k.thicknesses_mm.reduce((a, b) => a + b, 0) === k.height_mm);
}

// ── 3. Tegen de ruwe Rust-tekst ───────────────────────────────────────────
// Onafhankelijk van de lezer: we schrijven elke TS-regel terug in de vorm van
// de kern en eisen hem letterlijk. Zo kan een fout in de regex van de lezer
// niet aan beide kanten dezelfde verkeerde uitkomst geven.
log("3. Elke voorinstelling staat letterlijk zo in clt.rs");
const rustGetal = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
for (const p of ts) {
  const regel = `maak("${p.name}", &[${p.thicknesses_mm.map(rustGetal).join(", ")}]),`;
  checkTrue(`clt.rs bevat: ${regel}`, rust.includes(regel));
}
// En andersom: geen enkele maak-regel in de kern mag ontbreken in de lijst.
const aantalMaakRegels = (rust.match(/^\s*maak\("/gm) ?? []).length;
checkEq("even veel maak-regels in clt.rs als voorinstellingen", aantalMaakRegels, ts.length);

// ── 4. Het gegenereerde bestand is bijgewerkt ─────────────────────────────
// Vangt de hand-bewerking van het gegenereerde bestand, én het geval dat
// iemand de kern wijzigt maar de generator niet opnieuw draait.
log("4. Het gegenereerde bestand is bij");
const opSchijf = readFileSync(gen.DOEL_PAD, "utf8").replace(/\r\n/g, "\n");
const verwacht = gen.bouwTsBestand(kern).replace(/\r\n/g, "\n");
checkTrue(
  "cltVoorinstellingen.generated.ts is gelijk aan wat de generator nu schrijft" +
  " (zo niet: node scripts/genereer-clt-voorinstellingen.mjs)",
  opSchijf === verwacht,
);

// ── 5. De lezer weigert een gewijzigde vorm ───────────────────────────────
// Zonder deze controle zou de lezer bij een verbouwde `clt_presets()` stil
// een lege of halve lijst kunnen opleveren, en dan zou "geen verschil"
// betekenen "niets gelezen" in plaats van "niets uiteengelopen".
log("5. De lezer valt luid om bij een onbekende vorm");
let wierp = false;
try {
  gen.leesKernVoorinstellingen(new URL("./package.json", import.meta.url).pathname.replace(/^\//, ""));
} catch { wierp = true; }
checkTrue("een bestand zonder clt_presets() geeft een fout", wierp);

log("");
log(`Geslaagd: ${passed}, gefaald: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
