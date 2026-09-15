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

// ─────────────────────────────────────────────────────────────────────────
// [4] Botsing vanaf 1000 reguliere knopen (basisaudit nr 20)
//
// Tot september 2026 begon de plaatteller altijd op 1000. Had het model 1000
// of meer reguliere knopen, dan overschreef een plaatknoop stil een bestaande
// knoop; de staven wezen dan naar een punt elders. Nu begint de plaatreeks
// boven het hoogste reguliere id en slaat ze bestaande ids over.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Plaatnummering begint boven het hoogste reguliere id");
{
  const mesh = new Mesh();
  for (let i = 0; i < 1023; i++) mesh.addNode(i, 0);
  const voor = mesh.nodes.size;
  const p = mesh.addPlateNode(0, 5);
  checkEq("addPlateNode na 1023 reguliere knopen geeft 1024", p.id, 1024);
  checkEq("geen knoop overschreven", mesh.nodes.size, voor + 1);
  // En andersom: een reguliere knoop slaat een bestaand plaat-id over.
  const r = mesh.addNode(99, 99);
  checkEq("addNode slaat het bezette id 1024 over", r.id, 1025);
  checkEq("nog steeds niets overschreven", mesh.nodes.size, voor + 2);
}

// ─────────────────────────────────────────────────────────────────────────
// [5] Het gemeten faalscenario door de adapter: raamwerk 32 traveeën × 30
// lagen (1023 knopen, 1950 staven) met een losse wandschijf ernaast. Zonder
// de schijf: ΣRx = −300 kN (30 lagen × 10 kN), ux top-rechts 58,33 mm. Met
// de schijf gaf de botsing ΣRx −154,2 kN en ux 4,33 mm (factor 13 te gunstig).
// De schijf hangt aan niets, dus het raamwerk hoort exact hetzelfde te geven.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Raamwerk met 1023 knopen naast een losse wandschijf: geen botsing");
{
  const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
  const NX = 33, NZ = 31, BX = 6000, HZ = 3500;
  const id = (i, j) => 1 + j * NX + i;
  const nodes = [], beams = [], supports = [], pointLoads = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) nodes.push({ id: id(i, j), x: i * BX, z: j * HZ });
  let bid = 1;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (i < NX - 1 && j > 0) beams.push({ id: bid++, from: id(i, j), to: id(i + 1, j), E: 210000, A: 5381, I: 8.356e7 });
    if (j < NZ - 1) beams.push({ id: bid++, from: id(i, j), to: id(i, j + 1), E: 210000, A: 9726, I: 2.517e8 });
  }
  for (let i = 0; i < NX; i++) supports.push({ nodeId: id(i, 0), type: "fixed" });
  for (let j = 1; j < NZ; j++) pointLoads.push({ nodeId: id(0, j), fx: 10000, caseId: 1 });
  for (let i = 0; i < NX; i++) pointLoads.push({ nodeId: id(i, NZ - 1), fz: -50000, caseId: 1 });
  const basis = { nodes, beams, supports, loads: [], pointLoads, cases: [{ id: 1, name: "W" }] };
  const x0 = NX * BX + 10000;
  const metSchijf = {
    ...basis,
    nodes: [...nodes, { id: 9001, x: x0, z: 0 }, { id: 9002, x: x0 + 1000, z: 0 }, { id: 9003, x: x0 + 1000, z: 1000 }, { id: 9004, x: x0, z: 1000 }],
    supports: [...supports, { nodeId: 9001, type: "pinned" }, { nodeId: 9002, type: "zRoller" }],
    plates: [{ id: 1, nodeIds: [9001, 9002, 9003, 9004], thickness: 200, E: 30000, nu: 0.2, rho: 2500, meshSize: 500 }],
  };
  const top = id(NX - 1, NZ - 1);
  const som = (r) => { let sRx = 0; for (const [nid, re] of r.reactions) if (nid < 9000) sRx += re.fx; return sRx; };
  const zonder = solveAllCases(basis).perCase.get(1);
  const met = solveAllCases(metSchijf).perCase.get(1);
  const kNm = (v) => Math.round(v / 1e4) / 100;
  checkTrue("zonder schijf: ΣRx = −300 kN", Math.abs(som(zonder) / 1e3 + 300) < 1e-6, `${(som(zonder) / 1e3).toFixed(6)} kN`);
  checkTrue("met schijf: ΣRx = −300 kN (was −154,2)", Math.abs(som(met) / 1e3 + 300) < 1e-6, `${(som(met) / 1e3).toFixed(6)} kN`);
  checkTrue("zonder schijf: ux top-rechts = 58,33 mm", Math.abs(zonder.displacements.get(top).ux - 58.33) < 0.01, `${zonder.displacements.get(top).ux.toFixed(4)} mm`);
  checkTrue("met schijf: ux top-rechts identiek (was 4,33 mm)",
    Math.abs(met.displacements.get(top).ux - zonder.displacements.get(top).ux) < 1e-9 * 58.33,
    `${met.displacements.get(top).ux.toFixed(6)} mm`);
  checkTrue("met schijf: uz van knoop 1000 identiek",
    Math.abs(met.displacements.get(1000).uz - zonder.displacements.get(1000).uz) < 1e-9,
    `${met.displacements.get(1000).uz.toFixed(6)} mm`);
  const kolom = beams.find((b) => b.from === id(0, 0) && b.to === id(0, 1));
  checkTrue("met schijf: voetmoment kolom 1 identiek",
    Math.abs(met.elements.get(kolom.id).M_start - zonder.elements.get(kolom.id).M_start) < 1,
    `${kNm(met.elements.get(kolom.id).M_start)} kNm`);
}

// ─────────────────────────────────────────────────────────────────────────
// [6] Een dubbel knoopnummer in de invoer is een fout, geen stille overschrijving
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Dubbel knoopnummer wordt geweigerd");
{
  const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
  const inp = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 2, x: 3000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 5381, I: 8.356e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }], pointLoads: [], cases: [{ id: 1, name: "G" }],
  };
  let melding = "";
  try { solveAllCases(inp); } catch (e) { melding = e.message; }
  checkTrue("engine weigert", melding !== "", melding);
  checkTrue("melding noemt het knoopnummer en 'tweemaal'", /Knoop 2/.test(melding) && /tweemaal/.test(melding));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
