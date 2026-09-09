// Eigen CLT-vloeropbouwen en eigen doorsneden: de canonieke sleutel van een
// opbouw, de bibliotheek erachter, en het samenvoegen bij het openen van een
// project.
//
// Wat deze test bewaakt en waarom:
//
//  1. `cltOpbouwSleutel` moet de HELE opbouw vergelijken. De profielkiezer
//     vergeleek eerder alleen de laagdikten, en wees "CLT 40D/20L/40D" dan aan
//     als voorinstelling "3-laags 120" — één klik in die keuzelijst gooide
//     richting en per-laag klassen weg zonder dat er iets over veranderde.
//  2. Een project openen moet SAMENVOEGEN en niet vervangen. Vervangen wiste
//     bij het openen van het tweede project de bibliotheek van het eerste.
//     Het project wint bij een gelijke naam, en wat het overschrijft wordt
//     teruggemeld zodat de app het kan melden.
//  3. Een projectbestand draagt alleen wat het project GEBRUIKT. Anders is elk
//     bestand een kopie van de complete persoonlijke bibliotheek.
//
// Draaien met: npx tsx test-clt-opbouwen.mjs

const clt = await import("./src/lib/cltCheckBuilder.ts");
const opbouwen = await import("./src/lib/profieleditor/cltOpbouwenStore.ts");
const doorsneden = await import("./src/lib/profieleditor/eigenDoorsnedenStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(naam, cond) {
  if (cond) { passed++; log(`  ✓ ${naam}`); }
  else      { failed++; log(`  ✗ ${naam}`); }
}
function checkEq(naam, gevonden, verwacht) {
  const ok = JSON.stringify(gevonden) === JSON.stringify(verwacht);
  if (ok) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(gevonden)}`); }
  else    { failed++; log(`  ✗ ${naam}: ${JSON.stringify(gevonden)} vs ${JSON.stringify(verwacht)}`); }
}

/** Korte hulp: profielnaam → opbouw, met "C24" als klasse van de staaf. */
const opbouwVan = (naam, klasse = "C24") => clt.parseCltProfiel(naam, klasse);
/** De bibliotheek zoals hij op dit moment in de winkel staat. */
const bibliotheek = () => opbouwen.cltOpbouwenStore.getState().items;

// ── 1. Canonieke sleutel ──────────────────────────────────────────────────
log("1. cltOpbouwSleutel — de hele opbouw, niet alleen de dikten");

const drieLaags120 = clt.CLT_VOORINSTELLINGEN.find((p) => p.name === "3-laags 120");
checkTrue("voorinstelling '3-laags 120' bestaat", drieLaags120 !== undefined);
const preset120 = clt.cltVanVoorinstelling(drieLaags120, "C24");
// Het voorbeeld uit de foutmelding: dezelfde drie dikten, maar de richtingen
// omgekeerd (dwars/lengte/dwars in plaats van lengte/dwars/lengte).
const omgekeerd = opbouwVan("CLT 40D/40L/40D");
const gemengd = opbouwVan("CLT 40/40:C16/40");

checkEq(
  "dikten van 40D/40L/40D zijn gelijk aan die van de voorinstelling",
  omgekeerd.layers.map((l) => l.thickness_mm),
  [...drieLaags120.thicknesses_mm],
);
// De oude regel in de profielkiezer vergeleek precies dit: het aantal lagen en
// de dikten. Hij zou deze opbouw dus als de voorinstelling aanwijzen — en één
// klik in de keuzelijst gooide de richtingen weg. Dat de oude regel hier
// toeslaat staat er expres in: zonder dat is de volgende controle geen bewijs.
const oudeDikteVergelijking =
  drieLaags120.thicknesses_mm.length === omgekeerd.layers.length &&
  drieLaags120.thicknesses_mm.every((t, i) => t === omgekeerd.layers[i].thickness_mm);
checkTrue("de oude dikte-vergelijking zou hier 'voorinstelling' zeggen", oudeDikteVergelijking);
checkTrue(
  "… en tóch een andere opbouw: de sleutel verschilt (richting)",
  clt.cltOpbouwSleutel(omgekeerd) !== clt.cltOpbouwSleutel(preset120),
);
checkTrue(
  "een afwijkende laagklasse geeft óók een andere sleutel",
  clt.cltOpbouwSleutel(gemengd) !== clt.cltOpbouwSleutel(preset120),
);
checkTrue(
  "een andere strookbreedte geeft een andere sleutel",
  clt.cltOpbouwSleutel({ ...preset120, width_mm: 600 }) !== clt.cltOpbouwSleutel(preset120),
);
// Dezelfde opbouw, twee notaties: expliciet uitgeschreven en zoals hij
// standaard geldt. De sleutel moet ze gelijkstellen, anders komt geen enkele
// voorinstelling ooit als gekozen uit de bus.
checkTrue(
  "dezelfde opbouw expliciet geschreven geeft dezelfde sleutel",
  clt.cltOpbouwSleutel(opbouwVan("CLT 40L:C24/40D:C24/40L:C24")) ===
    clt.cltOpbouwSleutel(preset120),
);
// De klasse van de staaf mag de sleutel niet beïnvloeden zolang de lagen
// dezelfde klasse dragen: de sleutel schrijft élke laag voluit.
checkTrue(
  "de sleutel hangt niet aan de standaardklasse van de staaf",
  clt.cltOpbouwSleutel(opbouwVan("CLT 40/20/40", "C24")) ===
    clt.cltOpbouwSleutel(opbouwVan("CLT 40:C24/20:C24/40:C24", "C18")),
);
// En hij is een echte rondreis: naam → opbouw → naam → opbouw.
const heenEnWeer = opbouwVan(clt.formatCltProfiel(gemengd, "C24"));
checkTrue(
  "naam → opbouw → naam → opbouw houdt dezelfde sleutel",
  clt.cltOpbouwSleutel(heenEnWeer) === clt.cltOpbouwSleutel(gemengd),
);

// ── 2. De bibliotheek van eigen opbouwen ──────────────────────────────────
log("2. cltOpbouwenStore — bewaren, verwijderen, samenvoegen");

const nu = "2026-09-08T10:00:00.000Z";
const vloerBg = { id: "a1", naam: "Vloer BG", layup: opbouwVan("CLT 40/20/40/20/40"), bewaardOp: nu };
const dakLicht = { id: "b2", naam: "Dak licht", layup: opbouwVan("CLT 30/20/30"), bewaardOp: nu };

opbouwen.cltOpbouwenStore.getState().vervangAlles([]);
opbouwen.cltOpbouwenStore.getState().bewaar(vloerBg);
opbouwen.cltOpbouwenStore.getState().bewaar(dakLicht);
checkEq("twee opbouwen bewaard, alfabetisch",
  bibliotheek().map((o) => o.naam), ["Dak licht", "Vloer BG"]);

// Dezelfde naam opnieuw bewaren is een WIJZIGING, geen tweede regel.
opbouwen.cltOpbouwenStore.getState().bewaar({ ...vloerBg, id: "c3", layup: opbouwVan("CLT 40/20/40") });
checkEq("dezelfde naam vervangt de regel", bibliotheek().length, 2);
checkTrue("… met de nieuwe opbouw erin",
  clt.cltOpbouwSleutel(bibliotheek().find((o) => o.naam === "Vloer BG").layup) ===
    clt.cltOpbouwSleutel(opbouwVan("CLT 40/20/40")));

// ── 3. Samenvoegen bij het openen van een project ─────────────────────────
log("3. Openen voegt samen; het project wint bij een gelijke naam");

opbouwen.cltOpbouwenStore.getState().vervangAlles([vloerBg, dakLicht]);
// Project 1 draagt "Vloer BG" met ANDERE lagen, plus een opbouw die lokaal
// niet bestaat.
const uitProject = [
  { id: "z9", naam: "Vloer BG", layup: opbouwVan("CLT 60/40/60"), bewaardOp: nu },
  { id: "z8", naam: "Vloer 1e", layup: opbouwVan("CLT 40/30/40"), bewaardOp: nu },
];
const overschreven = opbouwen.importeer(uitProject);
checkEq("de overschreven naam wordt teruggemeld", overschreven, ["Vloer BG"]);
checkEq("niets is gewist — de lokale 'Dak licht' staat er nog",
  bibliotheek().map((o) => o.naam), ["Dak licht", "Vloer 1e", "Vloer BG"]);
checkTrue("het project wint bij een gelijke naam",
  clt.cltOpbouwSleutel(bibliotheek().find((o) => o.naam === "Vloer BG").layup) ===
    clt.cltOpbouwSleutel(opbouwVan("CLT 60/40/60")));
// Hetzelfde bestand nog eens openen mag niets melden: er verandert niets.
checkEq("hetzelfde project nogmaals openen meldt niets",
  opbouwen.importeer(uitProject), []);
// Een tweede project zonder eigen opbouwen laat de bibliotheek met rust —
// dit is precies wat er misging toen openen de lijst verving.
checkEq("een project zónder opbouwen wist niets",
  opbouwen.importeer([]).length + bibliotheek().length, 3);

// ── 4. Alleen de gebruikte opbouwen in het projectbestand ─────────────────
log("4. exporteer — alleen wat er in dít model staat");

opbouwen.cltOpbouwenStore.getState().vervangAlles([vloerBg, dakLicht]);
const staven = [
  { id: 1, material: "C24", profile: "CLT 40/20/40/20/40" },  // = Vloer BG
  { id: 2, material: "S235", profile: "HEA 200" },
  { id: 3, material: "C24", profile: "96x450" },
];
checkEq("alleen de gebruikte opbouw gaat mee",
  opbouwen.exporteer(staven).map((o) => o.naam), ["Vloer BG"]);
checkEq("een model zonder CLT draagt geen enkele opbouw",
  opbouwen.exporteer([{ id: 1, material: "S235", profile: "IPE 300" }]), []);
// De staaf draagt de opbouw en niet de naam, dus "gebruikt" is een
// opbouwvergelijking: dezelfde opbouw anders geschreven telt óók mee.
checkEq("dezelfde opbouw expliciet geschreven telt ook als gebruikt",
  opbouwen.exporteer([{ id: 1, material: "C18", profile: "CLT 40L:C24/20D:C24/40L:C24/20D:C24/40L:C24" }])
    .map((o) => o.naam),
  ["Vloer BG"]);
// Een opbouw met dezelfde dikten maar een andere richting is een ándere
// opbouw en hoort dus níet mee te reizen.
checkEq("dikten alleen is niet genoeg om als gebruikt te tellen",
  opbouwen.exporteer([{ id: 1, material: "C24", profile: "CLT 40D/20L/40D/20L/40D" }]), []);

// ── 5. Eigen doorsneden: dezelfde twee regels ─────────────────────────────
log("5. eigenDoorsnedenStore — zelfde weg, zelfde regels");

/** Minimale doorsnede; alleen de velden die de winkel zelf leest. */
const doorsnede = (id, naam, area) => ({
  id,
  naam,
  ontwerp: { soort: "samenstelling", lamellen: [], catalogusdelen: [] },
  eigenschappen: { area_mm2: area, iy_mm4: area * 100 },
  vorm: "Onbekend",
  motor: { cel: null },
  berekendOp: nu,
});

doorsneden.eigenDoorsnedenStore.getState().vervangAlles([
  doorsnede("d1", "Koker met gat", 5000),
  doorsnede("d2", "Samengestelde ligger", 9000),
]);
const staafDoorsneden = [
  { id: 1, material: "S235", profile: "EIGEN:Koker met gat" },
  { id: 2, material: "S355", profile: "IPE 300" },
];
checkEq("alleen de doorsnede waarnaar een staaf verwijst gaat mee",
  doorsneden.exporteer(staafDoorsneden).map((d) => d.naam), ["Koker met gat"]);
checkEq("een model zonder EIGEN:-staaf draagt geen doorsneden",
  doorsneden.exporteer([{ id: 1, material: "S235", profile: "HEB 300" }]), []);

// Openen voegt samen en meldt wat het project overschrijft.
const overschrevenD = doorsneden.importeer([
  doorsnede("d9", "Koker met gat", 7500),      // zelfde naam, andere inhoud
  doorsnede("d8", "Kokerkolom", 4000),         // nieuw
]);
checkEq("de overschreven doorsnede wordt teruggemeld", overschrevenD, ["Koker met gat"]);
checkEq("niets gewist: de lokale doorsnede staat er nog",
  doorsneden.eigenDoorsnedenStore.getState().items.map((d) => d.naam),
  ["Koker met gat", "Kokerkolom", "Samengestelde ligger"]);
checkTrue("het project wint bij een gelijke naam",
  doorsneden.eigenDoorsnedenStore.getState().items
    .find((d) => d.naam === "Koker met gat").eigenschappen.area_mm2 === 7500);
// Identieke inhoud onder dezelfde naam is geen overschrijving: `id` en
// `berekendOp` verschillen per machine en mogen geen loze melding opleveren.
checkEq("identieke inhoud onder een andere id meldt niets",
  doorsneden.importeer([{ ...doorsnede("d7", "Kokerkolom", 4000), berekendOp: "2026-01-01T00:00:00.000Z" }]),
  []);

// ── 6. De rondreis waar de rijeneditor op leunt ───────────────────────────
log("6. Rijbewerking → profielnaam → rijen: dezelfde opbouw");

// De rijeneditor houdt geen eigen kopie van de opbouw bij: hij LEEST
// `parseCltProfiel(tekst)` en SCHRIJFT `formatCltProfiel(opbouw)` terug. Dat
// werkt alleen als die twee elkaars omgekeerde zijn voor élke opbouw die een
// rijbewerking kan opleveren — ook de asymmetrische, ook die met gemengde
// klassen. Valt dat om, dan verspringt de opbouw onder de handen van de
// gebruiker zodra hij één rij aanraakt.
const KLASSE = "C24";
function rondreis(naam, layup) {
  const terug = clt.parseCltProfiel(clt.formatCltProfiel(layup, KLASSE), KLASSE);
  checkTrue(
    `${naam} → "${clt.formatCltProfiel(layup, KLASSE)}" → dezelfde opbouw`,
    terug !== null && JSON.stringify(terug) === JSON.stringify(layup),
  );
}

const basis = opbouwVan("CLT 40/20/40/20/40");
rondreis("onaangeraakt", basis);
// Dikte wijzigen (rij 3).
rondreis("dikte gewijzigd", {
  ...basis,
  layers: basis.layers.map((l, i) => (i === 2 ? { ...l, thickness_mm: 60 } : l)),
});
// Richting van één laag omzetten — de opbouw wijkt dan af van "afwisselend".
rondreis("richting omgezet", {
  ...basis,
  layers: basis.layers.map((l, i) => (i === 1 ? { ...l, orientation: "Longitudinal" } : l)),
});
// Klasse van één laag wijzigen.
rondreis("klasse per laag", {
  ...basis,
  layers: basis.layers.map((l, i) => (i === 1 ? { ...l, strength_class: "C16" } : l)),
});
// Laag verplaatsen: de richting reist mee met de laag, dus de opbouw is daarna
// niet meer afwisselend en de naam moet dat uitschrijven.
const verplaatst = { ...basis, layers: [...basis.layers] };
verplaatst.layers.splice(1, 0, verplaatst.layers.splice(0, 1)[0]);
rondreis("laag verplaatst", verplaatst);
// Laag toevoegen en verwijderen.
rondreis("laag toegevoegd", {
  ...basis,
  layers: [...basis.layers, { thickness_mm: 40, orientation: "Transverse", strength_class: KLASSE }],
});
rondreis("laag verwijderd", { ...basis, layers: basis.layers.filter((_, i) => i !== 4) });
// Strookbreedte gewijzigd, en alles tegelijk.
rondreis("strookbreedte 600", { ...basis, width_mm: 600 });
rondreis("asymmetrisch met gemengde klassen", opbouwVan("CLT 40L:C30/20D:C16/60L b750"));

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed === 0 ? 0 : 1);
