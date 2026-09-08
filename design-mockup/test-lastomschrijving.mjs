// Omschrijving op een belasting (`Load.omschrijving`) — het vrije naamveld
// waarmee een constructeur "sneeuw op overstek" of "reactie spant 3" aan een
// last hangt.
//
// WAAROM DEZE TEST BESTAAT
// Een nieuw veld op `Load` raakt vier poorten tegelijk: het projectbestand,
// de strenge modelvalidatie van de MCP-sidecar, de solverinvoer en de
// duplicaatbewaking bij het plakken. Drie daarvan mógen er niets van merken —
// het veld is documentatie en er hoort geen enkel rekengetal door te
// verschuiven. Deze test legt vast dat dat ook zo is, en dat oude bestanden
// zonder het veld gewoon blijven openen.
//
// Checks:
//  (a) ROUND-TRIP  — serializeProject → deserializeProject houdt de tekst
//      bit-exact vast, en het formaat blijft versie 2 (optioneel veld, geen
//      bump). Een last zonder omschrijving krijgt er ook na een round-trip
//      geen sleutel bij.
//  (b) OUD BESTAND — een echt referentiebestand uit `referentie/` (gemaakt
//      vóór dit veld bestond) opent zonder fout, en geen enkele last heeft een
//      omschrijving. Omschrijvingen toevoegen en opnieuw opslaan laat élk
//      ander lastveld exact staan.
//  (c) VALIDATIE   — de sidecar aanvaardt `omschrijving` als tekst, weigert
//      hem als getal, en weigert een tikfout in de veldnaam nog steeds.
//  (d) REKENKUNDIG — hetzelfde portaal mét en zónder omschrijvingen levert
//      identieke reacties en momenten: het veld verschuift geen enkel getal.
//
// Uitvoeren: npx tsx test-lastomschrijving.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=lastomschrijving

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  serializeProject, deserializeProject, PROJECT_FORMAT_VERSION,
} from "./src/io/projectFile.ts";
import { valideerModel } from "./src/mcp/valideerModel.ts";
import { solve } from "./src/components/fem/solver/engine.ts";

const HIER = dirname(fileURLToPath(import.meta.url));
/** Referentiebestand van vóór dit veld — de oud-bestand-proef. */
const OUD_BESTAND = join(HIER, "referentie", "R01.ifcfem2d");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function checkExact(naam, actual, expected) {
  const gelijk = Object.is(actual, expected);
  if (gelijk) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actual)}`); }
  else        { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

/** Minimale, geldige modelromp voor de round-trip. */
const basis = (loads) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE 300" }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  plates: [],
  loads,
  loadCases: [{ id: 1, name: "Permanent", type: "dead" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[a] Round-trip: de omschrijving overleeft opslaan en openen");
{
  const OMSCHRIJVING = "sneeuw op overstek";
  const tekst = serializeProject(basis([
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -8,
      omschrijving: OMSCHRIJVING },
    { id: 2, type: "pointForce", caseId: 1, nodeId: 2, fz: -12 },
  ]));
  const terug = deserializeProject(tekst);
  checkExact("formaatversie blijft ongewijzigd",
    terug.version, PROJECT_FORMAT_VERSION);
  checkExact("de omschrijving komt bit-exact terug",
    terug.loads[0].omschrijving, OMSCHRIJVING);
  ok("een last zonder omschrijving houdt de sleutel niet",
    !("omschrijving" in terug.loads[1]),
    JSON.stringify(terug.loads[1]));

  // Leestekens en niet-ASCII moeten er ongeschonden doorheen — een naam als
  // "gevel — 2ᵉ verdieping" is doodnormale invoer.
  const raar = "gevel — 2ᵉ verdieping, ±3 kN/m²";
  const terug2 = deserializeProject(serializeProject(basis([
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -8, omschrijving: raar },
  ])));
  checkExact("leestekens en accenten blijven intact",
    terug2.loads[0].omschrijving, raar);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[b] Oud bestand zonder het veld opent gewoon");
{
  const rauw = readFileSync(OUD_BESTAND, "utf8");
  const oud = deserializeProject(rauw);
  ok("referentiebestand R01 opent zonder fout", oud.loads.length > 0,
    `${oud.loads.length} lasten, versie ${oud.version}`);
  ok("geen enkele last heeft een omschrijving",
    oud.loads.every((l) => l.omschrijving === undefined));

  // Omschrijvingen toevoegen en opnieuw opslaan mag geen ander lastveld raken.
  const benoemd = {
    ...oud,
    loads: oud.loads.map((l, i) => ({ ...l, omschrijving: `last ${i + 1}` })),
  };
  const opnieuw = deserializeProject(serializeProject(benoemd));
  ok("na benoemen dragen alle lasten hun naam",
    opnieuw.loads.every((l, i) => l.omschrijving === `last ${i + 1}`));
  const zonderNaam = opnieuw.loads.map(({ omschrijving, ...rest }) => {
    void omschrijving;
    return rest;
  });
  ok("elk ander lastveld staat exact zoals het stond",
    JSON.stringify(zonderNaam) === JSON.stringify(oud.loads));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[c] Modelvalidatie van de sidecar kent het veld");
{
  const model = () => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE 300" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loadCases: [{ id: 1, name: "Permanent", type: "dead" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -8 }],
  });

  const met = model();
  met.loads[0].omschrijving = "opslag magazijn";
  const goed = valideerModel(met);
  ok("een model mét omschrijving wordt aanvaard", goed.ok === true,
    (goed.errors ?? [])[0] ?? "");

  const getal = model();
  getal.loads[0].omschrijving = 42;
  const fout = valideerModel(getal);
  ok("een omschrijving die geen tekst is wordt geweigerd",
    fout.ok === false && fout.errors.some((m) => m.includes("omschrijving")),
    (fout.errors ?? [])[0] ?? "");

  const tikfout = model();
  tikfout.loads[0].omschrijvng = "sneeuw";
  const fout2 = valideerModel(tikfout);
  ok("een tikfout in de veldnaam blijft geweigerd, mét hint",
    fout2.ok === false && fout2.errors.some((m) => m.includes("`omschrijving`")),
    (fout2.errors ?? [])[0] ?? "");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[d] Rekenkundig: de omschrijving verschuift geen enkel getal");
{
  const E = 210000, A = 5381, I = 8.356e7;   // IPE 300
  const invoer = (metNaam) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [metNaam
      ? { beamId: 1, q: -8, omschrijving: "sneeuw op overstek" }
      : { beamId: 1, q: -8 }],
    pointLoads: [],
  });

  const zonder = solve(invoer(false));
  const met = solve(invoer(true));
  for (const nodeId of [1, 2]) {
    const a = zonder.reactions.get(nodeId), b = met.reactions.get(nodeId);
    ok(`reactie knoop ${nodeId} identiek`,
      Math.abs(a.fz - b.fz) < 1e-9 && Math.abs(a.fx - b.fx) < 1e-9,
      `${a.fz} vs ${b.fz}`);
  }
  const ma = zonder.elements.get(1).bendingMoment;
  const mb = met.elements.get(1).bendingMoment;
  const grootste = Math.max(...ma.map(Math.abs));
  const afwijking = Math.max(...ma.map((m, i) => Math.abs(m - mb[i])));
  ok(`momentenlijn over alle stations identiek (max |M| = ${(grootste / 1e6).toFixed(2)} kNm)`,
    afwijking < 1e-9, `afwijking ${afwijking}`);
  ok("het proefmodel draagt daadwerkelijk last (geen loze vergelijking)",
    grootste > 1e6);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
