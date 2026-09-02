// P2.1 — Plate-datamodel + persist: de vijf plaat-rekenvelden (thickness,
// E, nu, rho, meshSize) reizen mee met het projectbestand en oude bestanden
// zonder die velden laden met de defaults.
//
// Checks (exact — het is pure JSON-serialisatie, geen numeriek werk):
// (a) ROUND-TRIP: serializeProject → deserializeProject behoudt de vijf
//     velden bit-exact (niet-default waarden: 250 mm / 10000 N/mm² / 0,2 /
//     2500 kg/m³ / 250 mm), en het formaat blijft versie 2 (geen bump —
//     de velden zijn optioneel, zelfde patroon als scheefstand).
// (b) OUD BESTAND: een handgemaakt v2-bestand met een kale plaat
//     {id, nodeIds} deserialiseert zonder fout; withPlateDefaults (de
//     normalisatie die loadProjectState toepast) vult exact de defaults
//     20 / 210000 / 0,3 / 7850 / 500 aan en laat id/nodeIds ongemoeid.
// (c) DEFAULTS-BRON: PLATE_DEFAULTS zelf heeft de gedocumenteerde waarden
//     (borgt dat addPlate — dat `...PLATE_DEFAULTS` spreidt — nieuwe platen
//     met precies deze waarden aanmaakt) en withPlateDefaults overschrijft
//     nooit reeds gezette velden.
//
// Uitvoeren: npx tsx test-plaat-project.mjs   (vanuit design-mockup/)

const { serializeProject, deserializeProject, PROJECT_FORMAT_VERSION } =
  await import("./src/io/projectFile.ts");
const { PLATE_DEFAULTS, withPlateDefaults } =
  await import("./src/components/fem/femTypes.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Exacte gelijkheid (JSON round-trip mag niets veranderen). */
function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) { passed++; log(`  ✓ ${name}: ${JSON.stringify(actual)}`); }
  else    { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// (a) Round-trip met niet-default waarden
// ─────────────────────────────────────────────────────────────────────────
log("\n[round-trip] serializeProject → deserializeProject behoudt de rekenvelden");
{
  const plaat = {
    id: 1,
    nodeIds: [1, 2, 4, 3],
    thickness: 250,   // mm   (bewust ≠ default 20)
    E: 10000,         // N/mm² (bewust ≠ default 210000)
    nu: 0.2,
    rho: 2500,
    meshSize: 250,
  };
  const text = serializeProject({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 },
      { id: 3, x: 0, z: 3000 }, { id: 4, x: 3000, z: 3000 },
    ],
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [plaat],
    loads: [],
    loadCases: [{ id: 1, name: "Permanent (G)", type: "dead" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: false,
    nonlinearEnabled: false,
  });
  const terug = deserializeProject(text);
  check("versie blijft 2 (geen bump)", terug.version, 2);
  check("PROJECT_FORMAT_VERSION is 2", PROJECT_FORMAT_VERSION, 2);
  const p = terug.plates[0];
  check("id", p.id, 1);
  check("nodeIds lengte", p.nodeIds.length, 4);
  check("thickness 250", p.thickness, 250);
  check("E 10000", p.E, 10000);
  check("nu 0,2", p.nu, 0.2);
  check("rho 2500", p.rho, 2500);
  check("meshSize 250", p.meshSize, 250);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) Oud bestand zonder rekenvelden → defaults bij laden
// ─────────────────────────────────────────────────────────────────────────
log("\n[oud bestand] kale plaat {id, nodeIds} laadt met de defaults");
{
  // Handgemaakt bestand zoals een pre-P2.1-versie het schreef: de plaat
  // heeft alleen id + nodeIds.
  const oud = JSON.stringify({
    format: "open-fem2d-studio-v2",
    version: 2,
    savedAt: "2026-01-01T00:00:00.000Z",
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 },
      { id: 3, x: 0, z: 3000 }, { id: 4, x: 3000, z: 3000 },
    ],
    beams: [],
    supports: [],
    plates: [{ id: 7, nodeIds: [1, 2, 4, 3] }],
    loads: [],
    loadCases: [{ id: 1, name: "Permanent (G)", type: "dead" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: false,
    nonlinearEnabled: false,
  });
  const terug = deserializeProject(oud);
  const genormaliseerd = terug.plates.map(withPlateDefaults); // = loadProjectState-pad
  const p = genormaliseerd[0];
  check("id blijft 7", p.id, 7);
  check("nodeIds[2] blijft 4", p.nodeIds[2], 4);
  check("thickness default 20 mm", p.thickness, 20);
  check("E default 210000 N/mm²", p.E, 210000);
  check("nu default 0,3", p.nu, 0.3);
  check("rho default 7850 kg/m³", p.rho, 7850);
  check("meshSize default 500 mm", p.meshSize, 500);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) Defaults-bron + geen overschrijven van gezette velden
// ─────────────────────────────────────────────────────────────────────────
log("\n[defaults] PLATE_DEFAULTS-waarden en niet-overschrijven");
{
  check("PLATE_DEFAULTS.thickness", PLATE_DEFAULTS.thickness, 20);
  check("PLATE_DEFAULTS.E", PLATE_DEFAULTS.E, 210000);
  check("PLATE_DEFAULTS.nu", PLATE_DEFAULTS.nu, 0.3);
  check("PLATE_DEFAULTS.rho", PLATE_DEFAULTS.rho, 7850);
  check("PLATE_DEFAULTS.meshSize", PLATE_DEFAULTS.meshSize, 500);

  // Deels gevulde plaat: alleen de ontbrekende velden worden aangevuld.
  const deels = withPlateDefaults({ id: 3, nodeIds: [1, 2, 3, 4], thickness: 120, rho: 600 });
  check("gezette thickness 120 blijft", deels.thickness, 120);
  check("gezette rho 600 blijft", deels.rho, 600);
  check("ontbrekende E → default", deels.E, 210000);
  check("ontbrekende nu → default", deels.nu, 0.3);
  check("ontbrekende meshSize → default", deels.meshSize, 500);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
