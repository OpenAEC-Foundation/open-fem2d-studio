// P4.2 — Polygonplaten via de CDT-meshcache: engine-level met een
// VOORGEBOUWDE cache (geen WASM in Node; de cache is bewust platte data,
// dus de test bouwt zelf een randconforme triangulatie van een L-schijf).
//
// Model: L-vormige schijf, hoeken (mm) (0,0)-(2000,0)-(2000,1000)-
// (1000,1000)-(1000,2000)-(0,2000), t = 20 mm, E = 210000 N/mm², ν = 0,3,
// meshSize 500 mm → 21 meshknopen, 24 CST-driehoeken (12 cellen × 2).
// Steunpunten alleen op de UI-hoekknopen: (0,0) pinned + (0,2000) xRoller —
// beide consistent met het exacte patchveld (u_x = 0 op x = 0).
//
// (a) PATCHTEST (< 1e-8 relatief) — geval 1: constante σx = 5 N/mm² via
//     randlasten op de drie verticale randen (rand-index!): links (rand 6,
//     lengte 2 m) p = −σ·t = −100 kN/m in x; rechts-onder (rand 2, 1 m) en
//     rechts-boven (rand 4, 1 m) p = +100 kN/m. De tractieresultante is
//     exact in evenwicht (−100·2 + 100·1 + 100·1 = 0). Tributary-lengte-
//     omzetting = de consistente CST-lastvector voor constante tractie, dus
//     het exacte lineaire veld  u_x = σ/E·x,  u_z = −ν·σ/E·z  moet tot op
//     float-precisie terugkomen (patchtest, constante-rek-elementen):
//     verplaatsingen op de UI-knopen < 1e-8 relatief, σx per element = σ,
//     σy = τxy = 0, en de steunpuntreacties ≈ 0.
// (b) EVENWICHT (0,1%) — geval 2: p = −10 kN/m verticaal op de bovenrand
//     van de L-poot (rand 5, lengte 1 m) → ΣF = −10 kN, dus ΣRz = +10 kN.
//     Geval 1 blijft exact (per belastinggeval gescheiden).
// (c) DOORGEEFLUIK-PAD (App-emulatie): zelfde model, maar de cache en de
//     polygonrandlasten via femTypes-registratie i.p.v. de invoer →
//     identieke verplaatsingen (< 1e-12), want de engine leest dan het
//     register (de App-multi-LC-mapping geeft meshCache/edgeIndex niet door).
// (d) VEROUDERDE CACHE: hoekknoop verplaatst zonder nieuwe cache →
//     nette NL-fout (géén stil verkeerd mesh).
// (e) ROUND-TRIP: serializeProject → deserializeProject behoudt het
//     meshCache-veld bit-exact (JSON-deep-equal) en de n=6 hoekknopen.
//
// Uitvoeren: npx tsx test-plaat-polygoon.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const {
  berekenPlaatMeshSignatuur, registreerPlaatMeshCaches, registreerPolygoonRandlasten,
} = await import("./src/components/fem/femTypes.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${Number(actual).toExponential(6)} ≈ ${Number(expected).toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${Number(actual).toExponential(6)} vs ${Number(expected).toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Voorgebouwde randconforme triangulatie van de L-schijf (meshSize 500 mm)
// ─────────────────────────────────────────────────────────────────────────
const S = 500;                 // mm
const SIGMA = 5;               // N/mm²
const T = 20;                  // mm
const E_PLAAT = 210000;        // N/mm²
const NU = 0.3;

const HOEKEN = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 },
];

function binnenL(x, z) {
  return (x >= 0 && x <= 2000 && z >= 0 && z <= 1000)
      || (x >= 0 && x <= 1000 && z >= 1000 && z <= 2000);
}

function bouwLCache() {
  const points = [];
  const idx = new Map(); // "x,z" → index
  const punt = (x, z) => {
    const k = `${x},${z}`;
    if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); }
    return idx.get(k);
  };
  // Cellen (BL-hoek op raster) die volledig in de L liggen → 2 driehoeken.
  const triangles = [];
  for (let x = 0; x < 2000; x += S) {
    for (let z = 0; z < 2000; z += S) {
      const cx = x + S / 2, cz = z + S / 2;
      if (!binnenL(cx, cz)) continue;
      const bl = punt(x, z), br = punt(x + S, z);
      const tr = punt(x + S, z + S), tl = punt(x, z + S);
      triangles.push([bl, br, tr], [bl, tr, tl]);   // CCW (x rechts, z omhoog)
    }
  }
  // Randknopen per polygonrand, geordend langs de randrichting.
  const rand = (van, naar) => {
    const nStap = Math.round(Math.hypot(naar.x - van.x, naar.z - van.z) / S);
    const lijst = [];
    for (let s = 0; s <= nStap; s++) {
      lijst.push(punt(
        van.x + (s / nStap) * (naar.x - van.x),
        van.z + (s / nStap) * (naar.z - van.z)));
    }
    return lijst;
  };
  const edgeNodeIndices = HOEKEN.map((h, i) => rand(h, HOEKEN[(i + 1) % HOEKEN.length]));
  return {
    signature: berekenPlaatMeshSignatuur(HOEKEN, S),
    points, triangles, edgeNodeIndices,
  };
}

const cache = bouwLCache();
checkTrue("voorgebouwde cache: 21 punten", cache.points.length === 21, `${cache.points.length}`);
checkTrue("voorgebouwde cache: 24 driehoeken", cache.triangles.length === 24, `${cache.triangles.length}`);

// ─────────────────────────────────────────────────────────────────────────
// MultiInput: UI-knopen alleen op de 6 polygoonhoeken
// ─────────────────────────────────────────────────────────────────────────
function maakInput({ metCacheInInvoer = true, metRandlastenInInvoer = true } = {}) {
  const nodes = HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  const P_X = SIGMA * T; // 100 kN/m — tractie σ·t per mm randlengte
  const edgeLoads = metRandlastenInInvoer ? [
    // Geval 1 — patchtractie op de drie verticale randen (rand-index 0-based).
    { plateId: 1, edge: "top", edgeIndex: 5, p: -P_X, dir: "x", caseId: 1 }, // links (x=0, normaal −x)
    { plateId: 1, edge: "top", edgeIndex: 1, p: +P_X, dir: "x", caseId: 1 }, // rechts-onder
    { plateId: 1, edge: "top", edgeIndex: 3, p: +P_X, dir: "x", caseId: 1 }, // rechts-boven (x=1000, z>1000)
    // Geval 2 — verticale randlast op de bovenrand van de L-poot.
    { plateId: 1, edge: "top", edgeIndex: 4, p: -10, dir: "z", caseId: 2 },
  ] : [];
  return {
    nodes,
    beams: [],
    supports: [
      { nodeId: 1, type: "pinned" },   // (0,0): u_x = u_z = 0 — exact veld ✓
      { nodeId: 6, type: "xRoller" },  // (0,2000): u_x = 0 — exact veld ✓
    ],
    loads: [],
    edgeLoads,
    plates: [{
      id: 1, nodeIds: [1, 2, 3, 4, 5, 6],
      thickness: T, E: E_PLAAT, nu: NU, rho: 7850, meshSize: S,
      ...(metCacheInInvoer ? { meshCache: cache } : {}),
    }],
    cases: [{ id: 1, name: "Patch (G)" }, { id: 2, name: "Randlast (Q)" }],
  };
}

// Exact patchveld (mm): u_x = σ/E·x, u_z = −ν·σ/E·z (t.o.v. knoop 1).
const uxExact = (x) => (SIGMA / E_PLAAT) * x;
const uzExact = (z) => (-NU * SIGMA / E_PLAAT) * z;
const SCHAAL = uxExact(2000); // 0,047619 mm — referentie voor relatieve fouten

// ─────────────────────────────────────────────────────────────────────────
// (a) Patchtest — geval 1
// ─────────────────────────────────────────────────────────────────────────
log("\n[patchtest] L-schijf, constante σx = 5 N/mm² via rand-index-randlasten");
const { perCase } = solveAllCases(maakInput());
{
  const r = perCase.get(1);
  checkTrue("resultaat geval 1 aanwezig", !!r);
  for (let i = 0; i < HOEKEN.length; i++) {
    const d = r.displacements.get(i + 1);
    checkRel(`u_x knoop ${i + 1}`, d?.ux ?? NaN, uxExact(HOEKEN[i].x), 1e-8, SCHAAL);
    checkRel(`u_z knoop ${i + 1}`, d?.uz ?? NaN, uzExact(HOEKEN[i].z), 1e-8, SCHAAL);
  }
  // Elementspanningen: exact constant σx, σy = τ = 0 (CST-patchtest).
  checkTrue("plateElements aanwezig", Array.isArray(r.plateElements) && r.plateElements.length === 1);
  const pr = r.plateElements[0];
  checkTrue("24 CST-elementen", pr.elements.length === 24, `${pr.elements.length}`);
  checkTrue("3 hoeken per element (CST)", pr.elements.every((e) => e.corners.length === 3));
  checkRel("ranges.sigmaX.min = σ", pr.ranges.sigmaX.min, SIGMA, 1e-8);
  checkRel("ranges.sigmaX.max = σ", pr.ranges.sigmaX.max, SIGMA, 1e-8);
  checkRel("ranges.sigmaY.max = 0", pr.ranges.sigmaY.max, 0, 1e-8, SIGMA);
  checkRel("ranges.tauXY.max = 0", pr.ranges.tauXY.max, 0, 1e-8, SIGMA);
  checkRel("nx = σ·t = 100 kN/m (element 1)", pr.elements[0].nx, SIGMA * T, 1e-8);
  // Zelf-geëquilibreerde tractie → reacties ≈ 0 (tol. t.o.v. 200 kN flanklast).
  let sRx = 0, sRz = 0;
  for (const [, re] of r.reactions) { sRx += re.fx; sRz += re.fz; }
  checkRel("ΣRx ≈ 0", sRx, 0, 1e-6, 200e3);
  checkRel("ΣRz ≈ 0", sRz, 0, 1e-6, 200e3);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) Evenwicht — geval 2 (en scheiding per geval)
// ─────────────────────────────────────────────────────────────────────────
log("\n[evenwicht] p = −10 kN/m op rand 5 (bovenrand L-poot, 1 m)");
{
  const r = perCase.get(2);
  checkTrue("resultaat geval 2 aanwezig", !!r);
  let sRz = 0;
  for (const [, re] of r.reactions) sRz += re.fz;
  checkRel("ΣRz = +10 kN (0,1%)", sRz, 10e3, 0.001);
  // Scheiding: geval 2 bevat géén patchveld (u_x knoop 2 ≪ patchwaarde).
  const d2 = r.displacements.get(2);
  checkTrue("geval 2 zonder patchveld", Math.abs((d2?.ux ?? 0) - uxExact(2000)) > 0.1 * SCHAAL);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) Doorgeefluik-pad (App-emulatie): cache + randlasten via registratie
// ─────────────────────────────────────────────────────────────────────────
log("\n[doorgeefluik] cache + polygonrandlasten via femTypes-register");
{
  registreerPlaatMeshCaches([[1, cache]]);
  registreerPolygoonRandlasten([
    { plateId: 1, edgeIndex: 5, p: -SIGMA * T, dir: "x", caseId: 1 },
    { plateId: 1, edgeIndex: 1, p: +SIGMA * T, dir: "x", caseId: 1 },
    { plateId: 1, edgeIndex: 3, p: +SIGMA * T, dir: "x", caseId: 1 },
    { plateId: 1, edgeIndex: 4, p: -10, dir: "z", caseId: 2 },
  ]);
  const via = solveAllCases(maakInput({ metCacheInInvoer: false, metRandlastenInInvoer: false }));
  const r1 = via.perCase.get(1);
  checkTrue("resultaat geval 1 (register) aanwezig", !!r1);
  for (let i = 0; i < HOEKEN.length; i++) {
    const a = perCase.get(1).displacements.get(i + 1);
    const b = r1.displacements.get(i + 1);
    checkRel(`register ≡ invoer: u_x knoop ${i + 1}`, b?.ux ?? NaN, a?.ux ?? NaN, 1e-12, SCHAAL);
  }
  const r2 = via.perCase.get(2);
  let sRz = 0;
  for (const [, re] of r2.reactions) sRz += re.fz;
  checkRel("register: ΣRz geval 2 = +10 kN", sRz, 10e3, 0.001);
  // Register weer leegmaken zodat vervolgchecks er niet op leunen.
  registreerPlaatMeshCaches([]);
  registreerPolygoonRandlasten([]);
}

// ─────────────────────────────────────────────────────────────────────────
// (d) Verouderde cache → nette NL-fout
// ─────────────────────────────────────────────────────────────────────────
log("\n[verouderde cache] hoek verplaatst zonder nieuwe cache");
{
  const input = maakInput();
  input.nodes[1] = { id: 2, x: 2100, z: 0 };   // hoek 2 verschoven → signatuur klopt niet meer
  try {
    solveAllCases(input);
    checkTrue("verouderde cache geweigerd", false);
  } catch (e) {
    checkTrue("verouderde cache geweigerd", /ontbreekt of is verouderd/.test(e.message), e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (e) Round-trip van het cacheveld door serialize/deserialize
// ─────────────────────────────────────────────────────────────────────────
log("\n[round-trip] meshCache door serializeProject → deserializeProject");
{
  const plaat = {
    id: 1, nodeIds: [1, 2, 3, 4, 5, 6],
    thickness: T, E: E_PLAAT, nu: NU, rho: 7850, meshSize: S,
    meshCache: cache,
  };
  const text = serializeProject({
    nodes: HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z })),
    beams: [], supports: [], plates: [plaat],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edgeIndex: 4, q: -10, qDir: "z" }],
    loadCases: [{ id: 1, name: "Permanent (G)", type: "dead" }],
    activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  });
  const terug = deserializeProject(text);
  const p = terug.plates[0];
  checkTrue("nodeIds n=6 behouden", p.nodeIds.length === 6);
  checkTrue("meshCache aanwezig", !!p.meshCache);
  checkTrue("meshCache bit-exact (JSON-deep-equal)",
    JSON.stringify(p.meshCache) === JSON.stringify(cache));
  checkTrue("signature behouden", p.meshCache.signature === cache.signature);
  checkTrue("edgeIndex op de randlast behouden", terug.loads[0].edgeIndex === 4);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
