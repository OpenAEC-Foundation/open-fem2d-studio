// Bescherming van de knoop-id-conventie in Mesh.fromJSON (Mesh.ts):
//   - reguliere knopen: id < 1000 (teller nextNodeId)
//   - plaatknopen:      id >= 1000 (teller nextPlateNodeId, via addPlateNode)
//
// Bug vóór de fix: fromJSON zette nextNodeId op het maximum over ÁLLE knopen,
// inclusief plaatknopen. Na het laden van een model met plaatknopen kregen
// nieuwe reguliere knopen dan id's >= 1000 die botsen met nextPlateNodeId.
// Fix: nextNodeId alleen bepalen over knopen met id < 1000.
//
// Round-trip-test: mesh met reguliere knopen + plaatknopen (via
// generatePlateRegionMesh) → toJSON → fromJSON → addNode geeft een id < 1000
// aansluitend op de reguliere reeks; addPlateNode geeft >= 1000 zonder
// botsing met bestaande ids.
//
// Uitvoeren: npx tsx test-plaat-ids.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkEq(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} (verwacht ${expected})`); }
}

function checkTrue(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// [1] Round-trip: reguliere knopen + plaatknopen
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Round-trip toJSON → fromJSON met reguliere knopen + plaatknopen");
{
  const mesh = new Mesh();
  // Drie reguliere knopen: ids 1, 2, 3
  mesh.addNode(0, 0);
  mesh.addNode(5, 0);
  mesh.addNode(5, 3);
  // Plaatregio los van de reguliere knopen: plaatknopen ids 1000+
  const region = generatePlateRegionMesh(mesh, {
    x: 10, y: 0, width: 2, height: 1,
    divisionsX: 2, divisionsY: 2,
    materialId: 1, thickness: 0.02, elementType: "quad",
  });
  mesh.addPlateRegion(region);

  const plateIdsBefore = [...mesh.nodes.keys()].filter((id) => id >= 1000);
  checkTrue("plaatknopen aangemaakt met id >= 1000", plateIdsBefore.length === 9,
    `ids ${Math.min(...plateIdsBefore)}..${Math.max(...plateIdsBefore)}`);

  // Round-trip via JSON-serialisatie (zoals een projectbestand)
  const json = JSON.parse(JSON.stringify(mesh.toJSON()));
  const mesh2 = Mesh.fromJSON(json);

  checkEq("aantal knopen na round-trip", mesh2.nodes.size, 3 + 9);

  // Nieuwe reguliere knoop: aansluitend op de reguliere reeks (1,2,3 → 4)
  const nieuweKnoop = mesh2.addNode(1, 1);
  checkEq("addNode na laden geeft id 4 (aansluitend)", nieuweKnoop.id, 4);
  checkTrue("addNode geeft id < 1000", nieuweKnoop.id < 1000, `id = ${nieuweKnoop.id}`);

  // Nieuwe plaatknoop: >= 1000, aansluitend op de plaatreeks, geen botsing
  const maxPlateId = Math.max(...plateIdsBefore);
  const nieuwePlaatknoop = mesh2.addPlateNode(11, 0.5);
  checkEq("addPlateNode na laden geeft aansluitend plaat-id", nieuwePlaatknoop.id, maxPlateId + 1);
  checkTrue("addPlateNode geeft id >= 1000", nieuwePlaatknoop.id >= 1000, `id = ${nieuwePlaatknoop.id}`);

  // Geen botsingen: alle ids uniek (Map dwingt dat af, dus check dat de
  // nieuwe ids vóór toevoeging niet bestonden)
  checkTrue("geen id-botsing nieuwe reguliere knoop", !json.nodes.some((n) => n.id === 4));
  checkTrue("geen id-botsing nieuwe plaatknoop", !json.nodes.some((n) => n.id === maxPlateId + 1));
}

// ─────────────────────────────────────────────────────────────────────────
// [2] Alleen plaatknopen: nextNodeId valt terug op 1
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Model met uitsluitend plaatknopen");
{
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: 1, height: 1,
    divisionsX: 1, divisionsY: 1,
    materialId: 1, thickness: 0.02, elementType: "triangle",
  });
  mesh.addPlateRegion(region);

  const json = JSON.parse(JSON.stringify(mesh.toJSON()));
  const mesh2 = Mesh.fromJSON(json);

  const nieuweKnoop = mesh2.addNode(0.5, 0.5);
  checkEq("addNode geeft id 1 (geen reguliere knopen in bestand)", nieuweKnoop.id, 1);
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Alleen reguliere knopen: plaatteller start op 1000
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Model met uitsluitend reguliere knopen");
{
  const mesh = new Mesh();
  mesh.addNode(0, 0);
  mesh.addNode(1, 0);

  const json = JSON.parse(JSON.stringify(mesh.toJSON()));
  const mesh2 = Mesh.fromJSON(json);

  checkEq("addNode geeft id 3", mesh2.addNode(2, 0).id, 3);
  checkEq("addPlateNode geeft id 1000", mesh2.addPlateNode(3, 0).id, 1000);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
