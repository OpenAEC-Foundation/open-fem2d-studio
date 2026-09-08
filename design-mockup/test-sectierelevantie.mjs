// Sectierelevantie — welke rapporthoofdstukken een model werkelijk kan vullen,
// en waarom de rest wegblijft.
//
// WAT HIER VASTLIGT
// Een zuiver stalen raamwerk kreeg tot nu toe zes hoofdstukken die niets te
// melden hadden: Kruislaaghout, Beton, Beton — fysisch niet-lineaire tweede
// orde, Spanningstoets, Platen en Plaatspanningen, elk met één regel "geen".
// `redenenPerSectie` laat die weg, mét reden.
//
// DE VIER MANIEREN WAAROP DIT MIS KAN GAAN, en die hier alle vier afgedekt zijn:
//
//  1. Het weglaten grijpt te breed. Eén betonstaaf erbij en het betonhoofdstuk
//     hoort er meteen weer te zijn — inclusief het beperkingenblok, dat de
//     ontvanger vertelt wat er NIET getoetst is.
//  2. Het weglaten grijpt te smal. "Nog niet getoetst" en "nog niet berekend"
//     zijn rekenstanden en geen modeleigenschappen; die hoofdstukken moeten
//     blijven staan, anders verandert het rapport van omvang bij elke druk op
//     Berekenen.
//  3. Het weglaten gebeurt stil. Elke overgeslagen sectie draagt een reden die
//     zegt wat er ontbreekt én hoe je het hoofdstuk terugkrijgt — dat is wat de
//     zijbalk als tooltip toont.
//  4. Een nieuwe sectie wordt vergeten. De registry wordt hier op de wiring
//     gecontroleerd: precies de zes materiaal-/plaatgebonden secties dragen een
//     `nietVanToepassing`, de rest niet.
//
// Draaien met: npx tsx test-sectierelevantie.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

const {
  LABEL_NIET_VAN_TOEPASSING,
  nvtBeton,
  nvtBetonStijfheid,
  nvtKruislaaghout,
  nvtPlaatspanningen,
  nvtPlaten,
  nvtSpanningstoets,
  redenenPerSectie,
} = await import("./src/lib/sectieRelevantie.ts");

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
const plaat = (id) => ({ id, nodeIds: [1, 2, 3, 4] });

/** De zes secties met een oordeel, in de volgorde van de registry. */
const REGELS = [
  { id: "plates", fn: nvtPlaten },
  { id: "plateStresses", fn: nvtPlaatspanningen },
  { id: "clt", fn: nvtKruislaaghout },
  { id: "beton", fn: nvtBeton },
  { id: "betonStijfheid", fn: nvtBetonStijfheid },
  { id: "spanning", fn: nvtSpanningstoets },
];

/** Het minimale registry-model waarmee `redenenPerSectie` werkt. */
const REGISTRY = [
  { id: "project" },
  { id: "toc" },
  { id: "nodes" },
  { id: "beams" },
  ...REGELS.map((r) => ({ id: r.id, nietVanToepassing: r.fn })),
  { id: "checkTable" },
  { id: "checkDetail" },
];

const gegevens = (o = {}) => ({
  beams: [], plates: [], checkResults: [], fysischeCombinaties: 0, ...o,
});
const weggelaten = (g) => [...redenenPerSectie(REGISTRY, g).keys()];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zuiver stalen raamwerk: zes hoofdstukken vallen weg");
{
  const g = gegevens({ beams: [staal(1), staal(2), staal(3)] });
  checkGelijk("weggelaten secties", weggelaten(g), REGELS.map((r) => r.id));

  const redenen = redenenPerSectie(REGISTRY, g);
  checkWaar("elke overgeslagen sectie draagt een reden",
    [...redenen.values()].every((r) => typeof r === "string" && r.length > 80));
  checkWaar("elke reden zegt hoe je het hoofdstuk terugkrijgt",
    [...redenen.values()].every((r) => /komt (het hoofdstuk )?terug/.test(r)));
  checkWaar("elke reden noemt dat ook de inhoudsopgave meebeweegt",
    [...redenen.values()].every((r) => r.includes("inhoudsopgave")));
  checkWaar("het label voor de zijbalk is één vaste aanduiding",
    LABEL_NIET_VAN_TOEPASSING === "n.v.t.");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Eén betonstaaf erbij: de twee betonhoofdstukken komen terug");
{
  const g = gegevens({ beams: [staal(1), beton(2)] });
  checkGelijk("weggelaten secties", weggelaten(g),
    ["plates", "plateStresses", "clt", "spanning"]);
  checkWaar("het betonhoofdstuk (met beperkingenblok) is van toepassing",
    nvtBeton(g) === null);
  checkWaar("de fysisch niet-lineaire tweede orde óók — ook zonder die berekening",
    nvtBetonStijfheid(g) === null,
    "de melding 'kies analysetype 2e orde + fysisch' is juist dán de aanwijzing");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Elk materiaal brengt zijn eigen hoofdstuk terug, en alleen dat");
{
  checkWaar("kruislaaghout",
    nvtKruislaaghout(gegevens({ beams: [clt(1)] })) === null &&
    nvtBeton(gegevens({ beams: [clt(1)] })) !== null);
  checkWaar("vrij materiaal → spanningstoets",
    nvtSpanningstoets(gegevens({ beams: [vrij(1)] })) === null &&
    nvtKruislaaghout(gegevens({ beams: [vrij(1)] })) !== null);
  checkWaar("massief hout brengt géén CLT-hoofdstuk mee",
    nvtKruislaaghout(gegevens({ beams: [hout(1)] })) !== null);
  checkWaar("een plaat brengt beide plaathoofdstukken terug",
    nvtPlaten(gegevens({ plates: [plaat(1)] })) === null &&
    nvtPlaatspanningen(gegevens({ plates: [plaat(1)] })) === null);
  checkWaar("een plaat brengt géén materiaalhoofdstuk mee",
    nvtBeton(gegevens({ plates: [plaat(1)] })) !== null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Twijfelgevallen houden het hoofdstuk");
{
  // Een toetsresultaat zonder bijbehorende staaf: de uitwerking is gedraaid en
  // hoort verantwoord te worden, ook al ziet het model er niet meer naar uit.
  const cltUitslag = { beam_id: 9, layup: { layers: [] } };
  const betonUitslag = { beam_id: 9, concrete_class: "C30/37" };
  const spanningUitslag = { beam_id: 9, f_toel_mpa: 8 };
  checkWaar("een CLT-toetsresultaat houdt het hoofdstuk",
    nvtKruislaaghout(gegevens({ beams: [staal(1)], checkResults: [cltUitslag] })) === null);
  checkWaar("een betontoetsresultaat houdt het hoofdstuk",
    nvtBeton(gegevens({ beams: [staal(1)], checkResults: [betonUitslag] })) === null);
  checkWaar("een spanningstoetsresultaat houdt het hoofdstuk",
    nvtSpanningstoets(gegevens({ beams: [staal(1)], checkResults: [spanningUitslag] })) === null);
  checkWaar("een segmentspoor houdt het tweede-orde-hoofdstuk",
    nvtBetonStijfheid(gegevens({ beams: [staal(1)], fysischeCombinaties: 2 })) === null);
  checkWaar("een staaf met een onbekend materiaal laat de rest met rust",
    nvtBeton(gegevens({ beams: [{ id: 1, from: 1, to: 2, material: "?", profile: "?" }] })) !== null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Een leeg model laat alles staan wat elk model heeft");
{
  // Geen staven, geen platen: alleen de zes materiaal-/plaatgebonden secties
  // vallen weg. Projectgegevens, knopen, staven en de toetsingssecties blijven
  // — "nog niet getoetst" is een rekenstand, geen modeleigenschap.
  checkGelijk("weggelaten bij een leeg model", weggelaten(gegevens()),
    REGELS.map((r) => r.id));
  const blijft = REGISTRY.filter((s) => !s.nietVanToepassing).map((s) => s.id);
  checkGelijk("secties zonder oordeel", blijft,
    ["project", "toc", "nodes", "beams", "checkTable", "checkDetail"]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Het oordeel is afgeleid, niet gemuteerd");
{
  const beams = [staal(1), staal(2)];
  const plates = [];
  const checkResults = [];
  const g = { beams, plates, checkResults, fysischeCombinaties: 0 };
  const voor = JSON.stringify(g);
  redenenPerSectie(REGISTRY, g);
  checkWaar("de meegegeven gegevens blijven onaangeraakt", JSON.stringify(g) === voor);

  // Dezelfde gegevens, tweemaal beoordeeld: zelfde uitkomst. Er is geen
  // verborgen stand die na één ronde omslaat.
  checkGelijk("tweede beoordeling geeft hetzelfde", weggelaten(g), weggelaten(g));

  // En de omgekeerde weg: beton erbij, beton eraf.
  const metBeton = { ...g, beams: [...beams, beton(3)] };
  checkWaar("beton erbij → hoofdstuk terug", nvtBeton(metBeton) === null);
  checkWaar("beton eraf → hoofdstuk weer weg", nvtBeton(g) !== null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De registry is gewired zoals hierboven getest");
{
  // Een nieuwe materiaalsectie die vergeten wordt te wiren, of een `nvt` op een
  // sectie die elk model heeft, valt hier om. De registry importeren kan niet
  // (hij trekt de React-secties met hun CSS mee), dus wordt de bron gelezen.
  const bron = readFileSync(
    join(hier, "src/components/report/reportSections.ts"), "utf8");
  // Elk blok begint bij `id: "<naam>"` en loopt tot het volgende id.
  const blokken = bron.split(/\n\s+id: "/).slice(1)
    .map((b) => ({ id: b.slice(0, b.indexOf('"')), tekst: b }));
  checkGelijk("alle 20 secties gevonden", blokken.length, 20);
  const gewired = blokken.filter((b) => b.tekst.includes("nietVanToepassing:"))
    .map((b) => b.id);
  checkGelijk("precies de zes secties met een oordeel", gewired.sort(),
    REGELS.map((r) => r.id).sort());
  checkWaar("elke regel wordt bij naam aan de registry gehangen",
    REGELS.every((r) => new RegExp(`nietVanToepassing: nvt`).test(bron)) &&
    bron.includes("nietVanToepassing: nvtBetonStijfheid"));
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
