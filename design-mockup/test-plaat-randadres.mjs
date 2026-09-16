// Plaatrand-adressering, meshcache-randknopen en harde elementfouten — de
// bestaande plaatroute rechtgetrokken (stap 0 van het platenspoor).
//
// WAAROM DEZE TEST BESTAAT
// Gemeten in september 2026, vóór deze wijziging:
//   - een randlast met `edgeIndex` op een polygoonplaat viel via de app en de
//     MCP stil weg (de mapping gaf `edgeIndex` niet door);
//   - een `edgeIndex` op een asgelijnde rechthoek belastte via app en MCP de
//     BOVENrand (de mapping maakte er `edge: "top"` van);
//   - een benoemde rand op een polygoonplaat verdween in elke route;
//   - een meshcache zonder `edgeNodeIndices` kwam door de MCP-poort en liet de
//     engine crashen op `undefined.every`;
//   - een schijfelement dat niet op te bouwen was, werd met een console.warn
//     overgeslagen en de berekening slaagde.
// Elk van die gevallen levert nu een correct getal of een weigering MET reden.
// De verwachte getallen zijn evenwichtsidentiteiten (ΣR = −ΣF) of een
// vergelijking van twee adressen van dezelfde rand; niets is afgelezen uit de
// uitkomst zelf.
//
// Uitvoeren: npx tsx test-plaat-randadres.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bepaalPlaatRand, berekenPlaatMeshSignatuur, plaatRandLabel } =
  await import("./src/components/fem/femTypes.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { controleerVelden, valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  checkTrue(name, ok, `${Number(actual).toExponential(6)} ≈ ${Number(expected).toExponential(6)}`);
}
/** Gooit `f` een fout waarvan de melding aan `patroon` voldoet? */
function weigert(name, f, patroon) {
  try {
    f();
    checkTrue(name, false, "geen fout");
  } catch (e) {
    checkTrue(name, patroon.test(e.message), e.message);
  }
}
const somR = (r, comp) => { let s = 0; for (const [, re] of r.reactions) s += re[comp]; return s; };

// ─────────────────────────────────────────────────────────────────────────
// De pure regel: bepaalPlaatRand
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] bepaalPlaatRand — omzetting en weigeringen");
{
  const rechthoek = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 3000 }, { x: 0, z: 3000 }];
  const boven = bepaalPlaatRand(rechthoek, { edge: "top" });
  checkTrue("bovenrand van een rechthoek: hoek 4 → hoek 3 (van kleinste x)",
    boven.ok && boven.hoekVan === 3 && boven.hoekNaar === 2 && boven.lengte === 2000, JSON.stringify(boven));
  const index2 = bepaalPlaatRand(rechthoek, { edgeIndex: 2 });
  checkTrue("edgeIndex 2 van dezelfde rechthoek: hoek 3 → hoek 4, zijde top",
    index2.ok && index2.hoekVan === 2 && index2.hoekNaar === 3 && index2.naam === "top", JSON.stringify(index2));
  const links = bepaalPlaatRand(rechthoek, { edge: "left" });
  checkTrue("linkerrand: van kleinste z", links.ok && links.van.z === 0 && links.naar.z === 3000);

  // Rechthoek met hoeken buiten omtrekvolgorde (vlinder-klikvolgorde): het
  // gridpad accepteert hem, maar hoek 1 → hoek 2 is een diagonaal.
  const vlinder = [{ x: 0, z: 0 }, { x: 2000, z: 3000 }, { x: 2000, z: 0 }, { x: 0, z: 3000 }];
  const diag = bepaalPlaatRand(vlinder, { edgeIndex: 0 });
  checkTrue("edgeIndex op een diagonaal van een rechthoek: geweigerd",
    !diag.ok && /omtrekvolgorde/.test(diag.reden), diag.reden);
  const vlinderBoven = bepaalPlaatRand(vlinder, { edge: "top" });
  checkTrue("benoemde rand op dezelfde rechthoek werkt wel",
    vlinderBoven.ok && vlinderBoven.van.x === 0 && vlinderBoven.naar.x === 2000);

  const L = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 }, { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 }];
  const naamOpPolygoon = bepaalPlaatRand(L, { edge: "top" });
  checkTrue("benoemde rand op een polygoon: geweigerd met remedie edgeIndex",
    !naamOpPolygoon.ok && /polygoon/.test(naamOpPolygoon.reden) && /edgeIndex/.test(naamOpPolygoon.reden),
    naamOpPolygoon.reden);
  const beide = bepaalPlaatRand(rechthoek, { edge: "top", edgeIndex: 2 });
  checkTrue("edge én edgeIndex: geweigerd", !beide.ok && /zowel/.test(beide.reden), beide.reden);
  const geen = bepaalPlaatRand(rechthoek, {});
  checkTrue("geen randadres: geweigerd", !geen.ok && /geen rand/.test(geen.reden), geen.reden);
  const buiten = bepaalPlaatRand(L, { edgeIndex: 6 });
  checkTrue("edgeIndex buiten bereik: geweigerd", !buiten.ok && /bestaat niet/.test(buiten.reden), buiten.reden);
  checkTrue("label rand-index is 1-based", plaatRandLabel({ edgeIndex: 4 }) === "rand 5");
  checkTrue("label benoemde rand", plaatRandLabel({ edge: "bottom" }) === "onderrand");
}

// ─────────────────────────────────────────────────────────────────────────
// Rechthoek: edgeIndex en edge adresseren dezelfde rand → identiek resultaat
// ─────────────────────────────────────────────────────────────────────────
// Wand 2 × 3 m, t = 20 mm, meshSize 500 mm, onderrand op rollen met één
// scharnier in het midden (zelfde opzet als test-plaat-randlast.mjs).
function wand({ randlast, extraPlaat = {} }) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * 500, z: 0 });
  nodes.push({ id: 6, x: 0, z: 3000 }, { id: 7, x: 2000, z: 3000 });
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 3 ? "pinned" : "zRoller" })),
    loads: [],
    edgeLoads: [{ plateId: 1, p: -25, dir: "z", caseId: 1, ...randlast }],
    // Hoeken in omtrekvolgorde, tegen de klok in: 1 (0,0) → 5 (2000,0) →
    // 7 (2000,3000) → 6 (0,3000). Bovenrand = rand-index 2.
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, ...extraPlaat }],
    cases: [{ id: 1, name: "Q" }],
  };
}
log("\n[2] Rechthoek — edgeIndex als bron, edge als alias");
{
  const viaNaam = solveAllCases(wand({ randlast: { edge: "top" } })).perCase.get(1);
  const viaIndex = solveAllCases(wand({ randlast: { edgeIndex: 2 } })).perCase.get(1);
  checkRel("ΣRz = −p·B = +50 kN (edge top)", somR(viaNaam, "fz"), 50e3, 1e-9);
  checkRel("ΣRz = +50 kN (edgeIndex 2) — niet meer stil weg", somR(viaIndex, "fz"), 50e3, 1e-9);
  for (const id of [6, 7]) {
    checkRel(`uz knoop ${id}: edgeIndex ≡ edge`, viaIndex.displacements.get(id).uz, viaNaam.displacements.get(id).uz, 1e-12);
  }
  // Onderrand via edgeIndex 0 mag NIET op de bovenrand terechtkomen: de
  // reacties nemen de last dan direct op (geen vervorming van de wand).
  const onder = solveAllCases(wand({ randlast: { edgeIndex: 0 } })).perCase.get(1);
  checkRel("edgeIndex 0 = onderrand: ΣRz = +50 kN", somR(onder, "fz"), 50e3, 1e-9);
  checkTrue("edgeIndex 0 belast NIET de bovenrand (bovenhoeken vrijwel stil)",
    Math.abs(onder.displacements.get(6).uz) < 1e-6 * Math.abs(viaNaam.displacements.get(6).uz),
    `${onder.displacements.get(6).uz} tegen ${viaNaam.displacements.get(6).uz} mm`);
  weigert("edge én edgeIndex in de solverinvoer: weigering",
    () => solveAllCases(wand({ randlast: { edge: "top", edgeIndex: 2 } })), /zowel/);
  weigert("randlast zonder adres: weigering (geen stille bovenrand meer)",
    () => solveAllCases(wand({ randlast: {} })), /geen rand/);
  weigert("randlast op een plaat die niet bestaat: weigering",
    () => solveAllCases(wand({ randlast: { plateId: 9, edge: "top" } })), /Plaat 9 staat niet in het model/);
}

// ─────────────────────────────────────────────────────────────────────────
// Polygoon: meshcache met randknopen, benoemde rand geweigerd
// ─────────────────────────────────────────────────────────────────────────
// L-schijf uit test-plaat-polygoon.mjs (meshSize 500, 21 punten, 24 CST).
const HOEKEN = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 },
];
function bouwLCache() {
  const S = 500, points = [], idx = new Map();
  const punt = (x, z) => {
    const k = `${x},${z}`;
    if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); }
    return idx.get(k);
  };
  const binnen = (x, z) => (x <= 2000 && z <= 1000) || (x <= 1000 && z <= 2000);
  const triangles = [];
  for (let x = 0; x < 2000; x += S) for (let z = 0; z < 2000; z += S) {
    if (!binnen(x + S / 2, z + S / 2)) continue;
    const bl = punt(x, z), br = punt(x + S, z), tr = punt(x + S, z + S), tl = punt(x, z + S);
    triangles.push([bl, br, tr], [bl, tr, tl]);
  }
  const rand = (a, b) => {
    const n = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / S), l = [];
    for (let s = 0; s <= n; s++) l.push(punt(a.x + (s / n) * (b.x - a.x), a.z + (s / n) * (b.z - a.z)));
    return l;
  };
  return {
    signature: berekenPlaatMeshSignatuur(HOEKEN, 500),
    points, triangles,
    edgeNodeIndices: HOEKEN.map((h, i) => rand(h, HOEKEN[(i + 1) % HOEKEN.length])),
  };
}
function lModel({ cache = bouwLCache(), load = { edgeIndex: 4 } } = {}) {
  return {
    nodes: HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z })),
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 6, type: "xRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, meshCache: cache }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, q: -10, qDir: "z", ...load }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}
log("\n[3] Polygoon — app-route, weigeringen en de meshcache");
{
  const r = solveAllCases(bouwMultiInput(lModel())).perCase.get(1);
  checkRel("app-route: rand 5 (1 m, −10 kN/m) → ΣRz = +10 kN", somR(r, "fz"), 10e3, 1e-9);
  weigert("benoemde rand op een polygoon: weigering in de engine",
    () => solveAllCases(bouwMultiInput(lModel({ load: { edge: "top" } }))), /polygoon.*edgeIndex/);
  const v1 = valideerModel(lModel({ load: { edge: "top" } }));
  checkTrue("… en in de droogloop, met dezelfde reden",
    !v1.ok && v1.errors.some((e) => /Last 1 op plaat 1: een benoemde rand/.test(e)), JSON.stringify(v1.errors));
  checkTrue("geldig polygoonmodel: droogloop ok", valideerModel(lModel()).ok === true,
    JSON.stringify(valideerModel(lModel()).errors));

  const zonder = bouwLCache(); delete zonder.edgeNodeIndices;
  const vf = controleerVelden(lModel({ cache: zonder }));
  checkTrue("cache zonder edgeNodeIndices: geweigerd door de veldpoort",
    vf.some((e) => /edgeNodeIndices: verplichte array/.test(e)), JSON.stringify(vf));
  weigert("cache zonder edgeNodeIndices: engine weigert in plaats van te crashen",
    () => solveAllCases(bouwMultiInput(lModel({ cache: zonder }))), /meshcache is beschadigd.*edgeNodeIndices. ontbreekt/);

  const teKort = bouwLCache(); teKort.edgeNodeIndices = teKort.edgeNodeIndices.slice(0, 5);
  checkTrue("vijf randlijsten bij zes hoeken: veldpoort meldt het",
    controleerVelden(lModel({ cache: teKort })).some((e) => /beschrijft 5 randen.*6 hoeken/.test(e)));
  weigert("vijf randlijsten bij zes hoeken: engine weigert",
    () => solveAllCases(bouwMultiInput(lModel({ cache: teKort }))), /5 randen.*6 hoeken/);

  const halfRand = bouwLCache(); halfRand.edgeNodeIndices[0] = halfRand.edgeNodeIndices[0].slice(0, 3);
  weigert("randlijst die niet van hoek tot hoek reikt: engine weigert",
    () => solveAllCases(bouwMultiInput(lModel({ cache: halfRand }))), /rand 1 reiken niet van hoek tot hoek/);

  const scheef = bouwLCache();
  const midden = scheef.points.findIndex((p) => p.x === 500 && p.z === 500);
  scheef.edgeNodeIndices[0] = [0, midden, scheef.edgeNodeIndices[0].at(-1)];
  weigert("inwendig punt in een randlijst: engine weigert",
    () => solveAllCases(bouwMultiInput(lModel({ cache: scheef }))), /ligt niet op die rand/);
}

// ─────────────────────────────────────────────────────────────────────────
// Elementfout: HARD, niet overslaan
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Schijfelement dat niet op te bouwen is");
{
  // Een extra driehoek met drie punten op één lijn (de onderrand): oppervlakte
  // nul. Vroeger sloeg de assemblage hem met een console.warn over en slaagde
  // de berekening — met hetzelfde getal, want dit element draagt niets. Juist
  // daarom is het een zuivere proef: het enige verschil is of er gemeld wordt.
  // Sinds de vierhoekmesher (stap 2) keurt de engine elk element van een
  // cache al VÓÓR de kern (keurPlatMesh: bereik, dubbele hoeken, oppervlakte,
  // convexiteit); de ontaarde driehoek wordt dus eerder gemeld, met zijn
  // nummer in de cache. De kernmelding blijft bestaan voor wat de keuring
  // niet ziet; beide patronen zijn hier goed — geen van beide is stil.
  const cache = bouwLCache();
  const p0 = cache.points.findIndex((p) => p.x === 0 && p.z === 0);
  const p1 = cache.points.findIndex((p) => p.x === 500 && p.z === 0);
  const p2 = cache.points.findIndex((p) => p.x === 1000 && p.z === 0);
  cache.triangles.push([p0, p1, p2]);
  weigert("ontaarde driehoek: de berekening stopt met plaat- en elementnummer",
    () => solveAllCases(bouwMultiInput(lModel({ cache }))),
    /^Plaat 1: (de meshcache is beschadigd — driehoek 25 heeft geen oppervlakte|schijfelement \d+ met hoeken .* is niet op te bouwen)/);
}

// ─────────────────────────────────────────────────────────────────────────
// De MCP-route (in-proces sidecar) rekent en weigert als de app
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] MCP-route (verwerkVerzoek) — polygoonplaat met meshCache en edgeIndex");
{
  const vraag = (op, model) => verwerkVerzoek({ v: 1, id: 1, op, payload: { model } });
  const val = vraag("validate", lModel());
  checkTrue("validate: polygoon met cache en edgeIndex is geldig", val.ok && val.result.ok === true,
    JSON.stringify(val.result?.errors));
  const opl = vraag("solve", lModel());
  checkTrue("solve slaagt", opl.ok === true, opl.error?.melding ?? "");
  const r = opl.result?.per_case?.["1"]?.reactions ?? {};
  const somFz = Object.values(r).reduce((s, x) => s + x.fz, 0);
  checkRel("MCP ΣRz = +10 kN, gelijk aan de app-route", somFz, 10, 1e-9);
  const appR = solveAllCases(bouwMultiInput(lModel())).perCase.get(1);
  checkRel("MCP-reactie knoop 2 ≡ app-route (kN)", r["2"]?.fz ?? NaN, appR.reactions.get(2).fz / 1000, 1e-12);

  const naam = vraag("solve", lModel({ load: { edge: "top" } }));
  checkTrue("benoemde rand op de polygoon: MODEL_ONOPLOSBAAR met de reden",
    naam.ok === false && naam.error?.code === "MODEL_ONOPLOSBAAR", `${naam.error?.code}: ${naam.error?.melding}`);
  const zonder = bouwLCache(); delete zonder.edgeNodeIndices;
  const inv = vraag("solve", lModel({ cache: zonder }));
  checkTrue("cache zonder edgeNodeIndices: INVOER_ONGELDIG vóór het rekenen",
    inv.ok === false && inv.error?.code === "INVOER_ONGELDIG"
    && JSON.stringify(inv.error?.detail ?? {}).includes("edgeNodeIndices"), `${inv.error?.code}: ${JSON.stringify(inv.error?.detail)}`);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
