// Toegepaste normen in de rapportkop — het rapport mag geen materiaal noemen
// dat niet in het model zit.
//
// WAT HIER VASTLIGT
// Een zuiver stalen model meldde bij de uitgangspunten "Eurocode 5 — Hout
// (EN 1995-1-1)", omdat dat vinkje standaard aan stond. Dat is geen keuze van
// de constructeur maar een fabrieksstand, en ze staat in het hoofdstuk dat de
// lezer vertelt waarop de berekening rust.
//
// DE VIER MANIEREN WAAROP DE OPLOSSING MIS KAN GAAN, alle vier hier afgedekt:
//
//  1. De norm verdwijnt te breed. Wie EN 1995 bewust aanvinkt loopt vooruit op
//     wat hij gaat tekenen en moet hem blijven zien, ook in een leeg model.
//  2. De norm verdwijnt terwijl er wél op getoetst is. Een gedraaide toetsing
//     hoort verantwoord te worden; geen enkel vinkje gaat daaroverheen.
//  3. Bestaande projectbestanden breken. Daarin staat alleen `en1995: true` en
//     is niet te achterhalen wie dat zette; ze moeten laden én van de fout af
//     zijn, zonder migratie.
//  4. De wiring wordt vergeten. De defaults en de rapportsectie worden hier op
//     de bron gecontroleerd — de React-bestanden zijn in Node niet te
//     importeren.
//
// Draaien met: npx tsx test-rapportnormen.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

const {
  NORM_SLEUTELS,
  gekozenNormen,
  normVanMateriaal,
  normenInModel,
  normenUitToetsen,
  normenVoorRapport,
} = await import("./src/lib/normenInRapport.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

function checkGelijk(naam, actueel, verwacht) {
  const ok = JSON.stringify(actueel) === JSON.stringify(verwacht);
  if (ok) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actueel)}`); }
  else { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actueel)} vs ${JSON.stringify(verwacht)}`); }
}

// ── Staven zoals de app ze kent; `materiaalVanStaaf` classificeert ze. ──
const staal = (id) => ({ id, from: 1, to: 2, material: "S235", profile: "IPE300" });
const hout = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "100x200" });
const beton = (id) => ({ id, from: 1, to: 2, material: "C30/37", profile: "300x500" });
const clt = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40" });
const vrij = (id) => ({
  id, from: 1, to: 2, profile: "200x200",
  material: "VRIJ: natuursteen E=15000 rho=2400 f=8",
});
const onbekend = (id) => ({ id, from: 1, to: 2, material: "?", profile: "?" });

/** De stand van een nieuw project: niemand heeft een vinkje aangeraakt. */
const STANDAARD = { en1993: false, en1995: false, en1992: false, normenHandmatig: [] };

/** Een bestaand projectbestand van vóór deze wijziging: geen spoor van wie. */
const BESTAAND_BESTAND = { en1993: true, en1995: true, en1992: false };

const NIETS_GETOETST = normenUitToetsen({ steel: false, timber: false, concrete: false });

/** De normen in de rapportkop, gegeven keuze + model + toetsresultaten. */
const inRapport = (keuze, beams, getoetst = NIETS_GETOETST) =>
  NORM_SLEUTELS.filter((s) => normenVoorRapport(keuze, normenInModel(beams), getoetst)[s]);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zuiver stalen model, niets aangeraakt: geen hout in de kop");
{
  const beams = [staal(1), staal(2), staal(3)];
  checkGelijk("toegepaste normen", inRapport(STANDAARD, beams), ["en1993"]);
  checkWaar("EN 1995 wordt niet genoemd",
    !inRapport(STANDAARD, beams).includes("en1995"),
    "dit was de gemelde fout");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Een leeg model noemt geen enkele norm");
{
  checkGelijk("toegepaste normen", inRapport(STANDAARD, []), []);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Elk materiaal brengt zijn eigen norm mee, en alleen die");
{
  checkGelijk("hout", inRapport(STANDAARD, [hout(1)]), ["en1995"]);
  checkGelijk("beton", inRapport(STANDAARD, [beton(1)]), ["en1992"]);
  checkGelijk("kruislaaghout valt onder EN 1995", inRapport(STANDAARD, [clt(1)]), ["en1995"]);
  checkGelijk("gemengd staal + hout", inRapport(STANDAARD, [staal(1), hout(2)]),
    ["en1993", "en1995"]);
  checkGelijk("een vrij materiaal heeft geen norm", inRapport(STANDAARD, [vrij(1)]), []);
  checkGelijk("een onbekend materiaal evenmin", inRapport(STANDAARD, [onbekend(1)]), []);
  checkWaar("de materiaal-naar-normtabel kent geen andere uitzonderingen",
    normVanMateriaal("staal") === "en1993" &&
    normVanMateriaal("hout") === "en1995" &&
    normVanMateriaal("clt") === "en1995" &&
    normVanMateriaal("beton") === "en1992" &&
    normVanMateriaal("vrij") === null &&
    normVanMateriaal("onbekend") === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De gebruiker mag vooruitlopen op wat hij gaat tekenen");
{
  const keuze = { en1993: false, en1995: true, en1992: false, normenHandmatig: ["en1995"] };
  checkGelijk("EN 1995 aangevinkt, leeg model", inRapport(keuze, []), ["en1995"]);
  checkGelijk("EN 1995 aangevinkt, stalen model", inRapport(keuze, [staal(1)]),
    ["en1993", "en1995"]);
  checkWaar("het aanvinken van EN 1995 zet EN 1993 niet uit",
    inRapport(keuze, [staal(1)]).includes("en1993"),
    "en1993 staat in deze keuze op false, maar volgt het model");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Een uitgezet vinkje is óók een keuze — behalve tegen een toetsing in");
{
  const uit = { en1993: false, en1995: false, en1992: false, normenHandmatig: ["en1995"] };
  checkGelijk("hout in het model, EN 1995 bewust uitgezet", inRapport(uit, [hout(1)]), []);
  const houtGetoetst = normenUitToetsen({ steel: false, timber: true, concrete: false });
  checkGelijk("maar er is op getoetst", inRapport(uit, [hout(1)], houtGetoetst), ["en1995"]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Wat getoetst is staat er altijd bij");
{
  // Beton staat standaard uit en zit hier niet in het model; zonder deze regel
  // zou een rapport mét betontoetsing beweren dat EN 1992 niet is toegepast.
  const betonGetoetst = normenUitToetsen({ steel: true, timber: false, concrete: true });
  checkGelijk("betontoetsing zonder betonstaaf in het model",
    inRapport(STANDAARD, [staal(1)], betonGetoetst), ["en1993", "en1992"]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Bestaande projectbestanden: laden, en van de fout af");
{
  checkGelijk("zuiver staal", inRapport(BESTAAND_BESTAND, [staal(1)]), ["en1993"]);
  checkGelijk("hout erin", inRapport(BESTAAND_BESTAND, [hout(1)]), ["en1995"]);
  checkGelijk("leeg model", inRapport(BESTAAND_BESTAND, []), []);
  checkWaar("`en1995: true` zonder spoor telt niet als keuze van de gebruiker",
    gekozenNormen(BESTAAND_BESTAND).en1995 === false,
    "anders toont de dialoog een vinkje dat het rapport negeert");
  const naAanraken = { ...BESTAAND_BESTAND, normenHandmatig: ["en1995"] };
  checkWaar("zodra de gebruiker het vinkje aanraakt telt het weer",
    gekozenNormen(naAanraken).en1995 === true &&
    inRapport(naAanraken, [staal(1)]).includes("en1995"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Het oordeel is afgeleid, niet gemuteerd");
{
  const keuze = { ...STANDAARD };
  const beams = [staal(1), hout(2)];
  const voor = JSON.stringify({ keuze, beams });
  normenVoorRapport(keuze, normenInModel(beams), NIETS_GETOETST);
  checkWaar("keuze en model blijven onaangeraakt",
    JSON.stringify({ keuze, beams }) === voor);

  // Twee aanroepen mogen niet hetzelfde object teruggeven: één per ongeluk
  // gemuteerde uitkomst zou daarna in élk rapport blijven staan.
  const a = normenInModel([staal(1)]);
  const b = normenInModel([]);
  a.en1995 = true;
  checkWaar("elke aanroep levert een eigen vlaggenset", b.en1995 === false);
  checkGelijk("tweede beoordeling geeft hetzelfde",
    inRapport(STANDAARD, beams), inRapport(STANDAARD, beams));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] De uitgangspunten en de rapportsectie zijn gewired zoals hierboven");
{
  // De React-bestanden zijn in Node niet te importeren (CSS, hooks), dus wordt
  // de bron gelezen. Valt een van deze checks om, dan klopt de logica hierboven
  // nog wel maar draait de app er niet meer op.
  const dialoog = readFileSync(
    join(hier, "src/components/project/ProjectSettingsDialog.tsx"), "utf8");
  const start = dialoog.indexOf("export const DEFAULT_UITGANGSPUNTEN");
  const defaults = dialoog.slice(start, dialoog.indexOf("};", start));
  checkWaar("geen enkele norm staat standaard aan",
    /en1993: false/.test(defaults) &&
    /en1995: false/.test(defaults) &&
    /en1992: false/.test(defaults),
    "een stand die de gebruiker niet heeft aangeraakt mag niet onwaar zijn");
  checkWaar("de defaults dragen een (lege) lijst handmatige vinkjes",
    /normenHandmatig: \[\]/.test(defaults));
  checkWaar("de vinkjes tonen alleen de eigen keuze van de gebruiker",
    dialoog.includes("checked={gekozen[sleutel]}"));
  checkWaar("een omgezet vinkje wordt als keuze vastgelegd",
    dialoog.includes("updateNorm(sleutel, e.target.checked)") &&
    dialoog.includes("normenHandmatig: NORM_SLEUTELS.filter"));

  const sectie = readFileSync(
    join(hier, "src/components/report/sections/ProjectSection.tsx"), "utf8");
  checkWaar("de rapportkop laat de regels hier gelden",
    sectie.includes("normenVoorRapport(") &&
    sectie.includes("normenInModel(beams)"));
  checkWaar("de oude 'vinkje OF getoetst'-regel is weg",
    !/u\.en199\d \|\|/.test(sectie),
    "die noemde EN 1995 in elk zuiver stalen rapport");
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
