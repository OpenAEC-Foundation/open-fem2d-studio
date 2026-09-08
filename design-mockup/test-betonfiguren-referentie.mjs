// DE BEWAKING TEGEN UITEENLOPEN — de TS-kant leest hier de GEDEELDE
// referentie, dezelfde die de Rust-kant leest.
//
// De betondoorsnede wordt twee keer getekend: op het scherm door
// `src/components/beton/wapeningskorf.ts`, en in de PDF door
// `src-tauri/crates/report/src/betonfiguren.rs`. Twee tekeningen van hetzelfde
// ding lopen uit elkaar — daar was al een bewaking voor bedacht, maar die
// bewaakte niets: elke kant droeg zijn EIGEN verwachte getallen, op andere
// bemonsteringspunten, en de staafharten werden hier alleen op een grens
// getoetst ("min >= 200, max <= 400"). Elke verschuiving binnen die grens
// glipte er ongemerkt doorheen.
//
// Nu staan de verwachte punten op één plaats:
//   src-tauri/crates/report/tests/golden/betonfiguren-referentie.json
// De andere lezer is
//   src-tauri/crates/report/tests/betonfiguren_referentie.rs
// Geen van beide tests draagt nog eigen getallen. Verschuift één implementatie
// een omtrekpunt of een staafhart, dan valt die kant om.
//
// Hoe je de referentie BEWUST bijwerkt staat in het JSON-bestand zelf onder
// `bijwerken`; de korte versie:
//
//   npx tsx test-betonfiguren-referentie.mjs --schrijf
//
// schrijft `omtrek_mm`, `staven` en `breedte_op_hoogte` opnieuw uit de TS-kant
// en laat alle tekstvelden staan. Daarna is DEZE test per definitie groen en
// zit het bewijs in `cargo test -p report --test betonfiguren_referentie`.
//
// Draaien met: npx tsx test-betonfiguren-referentie.mjs
//          (of: node scripts/run-tests.mjs --filter=betonfiguren-referentie)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const REFERENTIE = join(
  REPO,
  "src-tauri",
  "crates",
  "report",
  "tests",
  "golden",
  "betonfiguren-referentie.json",
);

const korfmodel = await import("./src/components/beton/wapeningskorf.ts");

const schrijfstand = process.argv.includes("--schrijf");

let passed = 0,
  failed = 0;
const log = (s) => process.stdout.write(s + "\n");

const referentie = JSON.parse(readFileSync(REFERENTIE, "utf8"));
const { absoluut_mm: ABS, relatief: REL } = referentie.tolerantie;

/**
 * Vergelijking op WAARDE met een expliciete marge, niet op een grens. Waarom
 * de marge zo klein mag zijn, staat in het JSON-bestand onder `tolerantie`:
 * Rust f64 en JS number zijn allebei IEEE-754 binary64 en rekenen dezelfde
 * uitdrukking uit dezelfde exacte maten.
 */
const gelijk = (werkelijk, verwacht) =>
  Number.isFinite(werkelijk) && Math.abs(werkelijk - verwacht) <= ABS + REL * Math.abs(verwacht);

function checkTrue(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${toelichting ? `: ${toelichting}` : ""}`);
  }
}

function checkWaarde(naam, werkelijk, verwacht) {
  checkTrue(naam, gelijk(werkelijk, verwacht), `${werkelijk} in plaats van ${verwacht}`);
}

// ── Schrijfstand: de referentie naschrijven uit de TS-kant ────────────────
//
// Bewust GEEN onderdeel van de testronde: naschrijven maakt deze test per
// definitie groen, dus het bewijs verschuift dan naar de Rust-kant. Daarom een
// aparte vlag, en daarom blijven de tekstvelden (`waarom`, `afleiding`) staan —
// die moeten met de hand mee.
if (schrijfstand) {
  for (const geval of referentie.gevallen) {
    geval.omtrek_mm = korfmodel.omtrekPunten(geval.doorsnede).map(([x, z]) => [x, z]);
    geval.staven = korfmodel.staafPosities(geval.korf, geval.doorsnede).map((s) => ({
      x_mm: s.x,
      z_mm: s.z,
      diameter_mm: s.diameter,
      rij: s.rij,
    }));
    geval.breedte_op_hoogte = geval.breedte_op_hoogte.map((p) => ({
      z_mm: p.z_mm,
      breedte_mm: korfmodel.breedteOpHoogteMm(geval.doorsnede, p.z_mm),
      hart_x_mm: korfmodel.hartXMm(geval.doorsnede, p.z_mm),
    }));
  }
  writeFileSync(REFERENTIE, netjes(referentie) + "\n", "utf8");
  log(`Referentie herschreven uit de TS-kant: ${REFERENTIE}`);
  log("Loop nu de `afleiding` van elk geraakt geval na, en draai daarna");
  log("  cargo test -p report --test betonfiguren_referentie");
  log("Blijft die rood, dan is de Rust-kant niet meegegaan.");
  process.exit(0);
}

// ── 1. De omtrek ──────────────────────────────────────────────────────────
//
// De VOLGORDE telt mee: dezelfde punten in een andere volgorde beschrijven een
// andere polygoon, en beide kanten moeten hetzelfde pad lopen.
log(`1. Omtrekpunten tegen de gedeelde referentie (${referentie.gevallen.length} doorsneden)`);

for (const geval of referentie.gevallen) {
  const werkelijk = korfmodel.omtrekPunten(geval.doorsnede);
  const verwacht = geval.omtrek_mm;
  checkTrue(
    `${geval.naam}: ${verwacht.length} omtrekpunten`,
    werkelijk.length === verwacht.length,
    `${werkelijk.length} punten — ${JSON.stringify(werkelijk)}`,
  );
  if (werkelijk.length !== verwacht.length) continue;
  const afwijkend = werkelijk
    .map((p, i) => (gelijk(p[0], verwacht[i][0]) && gelijk(p[1], verwacht[i][1]) ? null : i))
    .filter((i) => i !== null);
  checkTrue(
    `${geval.naam}: elk omtrekpunt op zijn plaats`,
    afwijkend.length === 0,
    afwijkend
      .map((i) => `punt ${i} is (${werkelijk[i]}) in plaats van (${verwacht[i]})`)
      .join("; "),
  );
}

// ── 2. De staafharten ─────────────────────────────────────────────────────
log("\n2. Staafharten tegen de gedeelde referentie");

for (const geval of referentie.gevallen) {
  const werkelijk = korfmodel.staafPosities(geval.korf, geval.doorsnede);
  const verwacht = geval.staven;
  checkTrue(
    `${geval.naam}: ${verwacht.length} staven`,
    werkelijk.length === verwacht.length,
    `${werkelijk.length} staven`,
  );
  if (werkelijk.length !== verwacht.length) continue;
  for (let i = 0; i < verwacht.length; i++) {
    const w = werkelijk[i];
    const v = verwacht[i];
    checkTrue(
      `${geval.naam}: staaf ${i} — ${v.rij} Ø${v.diameter_mm} op (${v.x_mm}, ${v.z_mm})`,
      gelijk(w.x, v.x_mm) &&
        gelijk(w.z, v.z_mm) &&
        gelijk(w.diameter, v.diameter_mm) &&
        w.rij === v.rij,
      `(${w.x}, ${w.z}) Ø${w.diameter} ${w.rij}`,
    );
  }
}

// ── 3. Breedte en hart op de bemonsterde hoogten ──────────────────────────
//
// De twee functies waar al het andere op leunt: schuift `breedteOpHoogteMm` op
// een bandgrens, dan schuift elke staaf mee.
log("\n3. Breedte en hart op hoogte");

let bemonsterd = 0;
for (const geval of referentie.gevallen) {
  for (const punt of geval.breedte_op_hoogte) {
    checkWaarde(
      `${geval.naam}: breedte op z = ${punt.z_mm}`,
      korfmodel.breedteOpHoogteMm(geval.doorsnede, punt.z_mm),
      punt.breedte_mm,
    );
    checkWaarde(
      `${geval.naam}: hart op z = ${punt.z_mm}`,
      korfmodel.hartXMm(geval.doorsnede, punt.z_mm),
      punt.hart_x_mm,
    );
    bemonsterd++;
  }
}
checkTrue(`de referentie bemonstert ${bemonsterd} hoogten`, bemonsterd >= 10);

// ── 4. De referentie zelf ─────────────────────────────────────────────────
//
// Zonder deze controles verdwijnt de bewaking door het weghalen van een geval,
// en blijft alles groen. Dezelfde eisen staan aan de Rust-kant.
log("\n4. Dekking van de referentie");

const gevallen = referentie.gevallen;
const heeft = (f) => gevallen.some(f);
checkTrue(`minstens negen doorsneden (${gevallen.length})`, gevallen.length >= 9);
checkTrue("een rechthoek", heeft((g) => g.doorsnede.shape === "Rectangle"));
checkTrue(
  "een T met de flens boven",
  heeft((g) => g.doorsnede.shape === "Tee" && !g.doorsnede.flange_at_bottom),
);
checkTrue(
  "een omgekeerde T",
  heeft((g) => g.doorsnede.shape === "Tee" && g.doorsnede.flange_at_bottom),
);
// Alle VIER de flensgevallen apart, en niet één losse eis "er is een L". Die
// liet de L met de flens ONDER weg, en juist daar gaan de twee kanten het meest
// verschillend te werk: `omtrekPunten` heeft een eigen sjabloon voor
// `flange_at_bottom` met een `x0` die bij een L op 0 wordt gezet, terwijl de
// Rust-kant de omtrek uit de gespiegelde banden van de kern aflegt.
checkTrue(
  "een L met de flens boven",
  heeft((g) => g.doorsnede.shape === "Ell" && !g.doorsnede.flange_at_bottom),
);
checkTrue(
  "een L met de flens onder",
  heeft((g) => g.doorsnede.shape === "Ell" && g.doorsnede.flange_at_bottom),
);
const zelfdeRij = (a, b) => a.count === b.count && a.diameter_mm === b.diameter_mm;
checkTrue("een symmetrisch gewapend geval", heeft((g) => zelfdeRij(g.korf.top, g.korf.bottom)));
checkTrue("een asymmetrisch gewapend geval", heeft((g) => !zelfdeRij(g.korf.top, g.korf.bottom)));
checkTrue("een rij met één staaf", heeft((g) => g.korf.bottom.count === 1));
// En die ene staaf moet ook ergens ANDERS liggen dan op b/2. In een rechthoek
// vallen "het hart van de doorsnede" en "het hart van de band waar de rij in
// ligt" samen, dus daar blijft het verwisselen van die twee onzichtbaar; in een
// smal lijf onder een brede flens niet.
checkTrue(
  "een rij met één staaf buiten het hart van de omhullende breedte",
  heeft(
    (g) =>
      g.korf.bottom.count === 1 &&
      g.staven.some((s) => s.rij === "onder" && Math.abs(s.x_mm - g.doorsnede.b_mm / 2) > 1e-9),
  ),
);
checkTrue("een geval zonder bovenwapening", heeft((g) => g.korf.top.count === 0));

// Elke korf uit de referentie moet ook door de editorcontrole komen. Een
// proefdoorsnede die de app zou weigeren, bewaakt een tekening die nooit
// getekend wordt.
for (const geval of gevallen) {
  const melding = korfmodel.controleerKorf({
    doorsnede: geval.doorsnede,
    betonklasse: "C30/37",
    staalsoort: "B500B",
    korf: geval.korf,
    milieuklasse: null,
    constructieklasse: null,
    aantalStroken: 50,
    staaltak: "Horizontal",
  });
  checkTrue(`${geval.naam}: is een geldige korf`, melding === null, melding ?? "");
}

// ── Opmaak van het referentiebestand ──────────────────────────────────────

/**
 * `JSON.stringify` met inspringing zet elk getal op een eigen regel; een
 * omtrek van acht punten wordt dan vierentwintig regels en is niet meer te
 * lezen. Korte objecten en getallenparen gaan daarom terug op één regel — dat
 * is precies de opmaak waarin het bestand met de hand is geschreven, zodat
 * `--schrijf` geen opmaakruis in de diff zet.
 */
function netjes(doc) {
  let tekst = JSON.stringify(doc, null, 2);
  const opEenRegel = (m) => {
    if (!m.includes("\n")) return m;
    const een = m.replace(/\s*\n\s*/g, " ");
    return een.length <= 200 ? een : m;
  };
  // 1. Getallenreeksen. Het uitsluiten van het aanhalingsteken houdt de
  //    tekstlijsten (`waarom`, `afleiding`) juist wél meerregelig — die zijn
  //    om te lézen, en één punt per regel is daar geen winst.
  tekst = tekst.replace(/\[[^[\]{}"]*\]/g, (m) => {
    const een = opEenRegel(m);
    return een === m ? m : een.replace(/^\[\s+/, "[").replace(/\s+]$/, "]");
  });
  // 2. Objecten, van binnen naar buiten. De laatste ronde laat objecten toe
  //    die al ingeklapte objecten bevatten — dat is `korf`, met `top` en
  //    `bottom` erin. Te lange objecten (`tolerantie`) blijven meerregelig.
  for (let ronde = 0; ronde < 3; ronde++) {
    tekst = tekst.replace(/\{[^{}[\]]*\}/g, opEenRegel);
  }
  return tekst.replace(/\{(?:[^{}[\]]|\{[^{}[\]\n]*\})*\}/g, opEenRegel);
}

// ── Slot ──────────────────────────────────────────────────────────────────
log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) {
  log("");
  log("Een verschil hier betekent dat de TS-tekening van de gedeelde referentie");
  log("is afgeweken. Is dat BEWUST, pas dan ook betonfiguren.rs aan en werk de");
  log("referentie bij — zie `bijwerken` in");
  log(`  ${REFERENTIE}`);
  process.exit(1);
}
