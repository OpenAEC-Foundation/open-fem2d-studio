// Randlast en randpuntlast op de rand van een OPENING in een plaat
// (vervolg op stap 2 van het platenspoor, september 2026).
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] RASTERPAD, vierhoeken én driehoeken — wand 4 × 3 m met een
//       rechthoekige opening 1500…2500 × 1000…2000 mm, meshSize 500.
//       De last staat op rand 3 van de opening (edgeIndex 2: van hoek 3
//       (2500, 2000) naar hoek 4 (1500, 2000) — de bovenrand van de sparing,
//       waarop een latei zou dragen). EVENWICHT in drie vergelijkingen:
//       ΣRx, ΣRz en ΣM om de oorsprong moeten precies de uitwendige last
//       tegenhouden. De momentvergelijking is hier de scherpe: zij pint
//       zowel de x- als de z-coördinaat van het aangrijpingspunt vast, en
//       bewijst dus dat de last op de OPENINGSRAND landde en niet stil op de
//       omtrek (z = 0 of z = 3000) of op een andere openingsrand.
//       Gelijkmatig, deellast, trapezium en puntlast, elk met de afleiding
//       van zijn resultante in het commentaar.
//   [2] CDT-PAD — L-vormige plaat 4 × 4 m (kwadrant rechtsboven weg) met een
//       rechthoekige opening, met een handgemaakte meshcache. Hier komen de
//       openingsrandknopen uit `PlaatMeshCache.openingEdgeNodeIndices` in
//       plaats van uit het raster; dezelfde evenwichtscontroles.
//   [3] WEIGERINGEN met reden, langs DEZELFDE regel in engine en
//       MCP-droogloop (`bepaalPlaatlastRand`): een opening die niet
//       bestaat, een plaat zonder openingen, een benoemde rand op een
//       opening, `openingId` zonder `edgeIndex`, een rand-index buiten het
//       aantal openingshoeken, en een dubbel openings-id. Nooit een stille
//       terugval op de omtrek.
//   [4] PLAAT ZONDER OPENINGEN: bit-identiek aan vóór deze wijziging. De
//       referentiegetallen zijn GEMETEN door hetzelfde model te draaien
//       tegen de broncode van master d5e310b ("chore: sidecarbundel herbouwd
//       na verlopende profielen deel 3") en tegen deze tak; de uitvoer van
//       beide was byte-gelijk. Ze staan hieronder voluit (dubbele precisie)
//       en worden met === vergeleken, niet met een tolerantie.
//   [5] DOORVOER: mapping (het veld gaat mee, en ONTBREEKT als de last hem
//       niet heeft — zo blijft de solverinvoer van een omtreklast
//       byte-gelijk), MCP-route, projectbestand en het label van paneel,
//       tabel en rapport.
//   De modelcontrole en de IFC-export vallen buiten de barrel van de
//   sidecarbundel; die staan in test-plaat-opening-randlast-doorvoer.mjs.
//
// Uitvoeren: npx tsx test-plaat-opening-randlast.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { berekenPlaatMeshSignatuur, bepaalPlaatlastRand, plaatRandLabel } =
  await import("./src/components/fem/femTypes.ts");
const { zoekPuntenOpLijnstuk } = await import("./src/core/fem/PlaatMesher.ts");
const { bouwMultiInput, randlastNaarSolverInput, randpuntlastNaarSolverInput } =
  await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  checkTrue(name, ok, `${Number(actual).toExponential(9)} ≈ ${Number(expected).toExponential(9)}`);
}
function checkEq(name, actual, expected) {
  checkTrue(name, Object.is(actual, expected), `${actual} === ${expected}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}

const T = 20, E = 210000, NU = 0.3;
const rect = (x0, z0, x1, z1) =>
  [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

/**
 * Evenwicht van één opgelost geval: de som van de reacties plus de som van de
 * uitwendige lasten, in kracht (N) en in moment om de oorsprong (N·mm, met
 * M = x·Fz − z·Fx). Beide sommen horen nul te zijn — dat is statica en geldt
 * onafhankelijk van het net, de elementkeuze en de plaats van de last.
 */
function evenwicht(r, nodes, uitwendig) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  let rx = 0, rz = 0, m = 0;
  for (const [id, re] of r.reactions) {
    const n = pos.get(id);
    rx += re.fx; rz += re.fz; m += n.x * re.fz - n.z * re.fx;
  }
  for (const u of uitwendig) {
    rx += u.fx; rz += u.fz; m += u.x * u.fz - u.z * u.fx;
  }
  return { rx, rz, m };
}

// ─────────────────────────────────────────────────────────────────────────
// [1] Rasterpad: wand 4 × 3 m met een rechthoekige opening
// ─────────────────────────────────────────────────────────────────────────
// Onderrand op alle gridposities opgelegd (zRoller, midden pinned), zodat
// het stelsel bepaald is en alle reacties beneden aankomen.
const OPENING = rect(1500, 1000, 2500, 2000);
// De hoeken in deze volgorde: 1 (1500,1000), 2 (2500,1000), 3 (2500,2000),
// 4 (1500,2000). Rand `edgeIndex` j loopt van hoek j+1 naar hoek j+2:
//   0: (1500,1000) → (2500,1000)   onderrand van de sparing
//   1: (2500,1000) → (2500,2000)   rechterrand
//   2: (2500,2000) → (1500,2000)   BOVENRAND, van rechts naar links
//   3: (1500,2000) → (1500,1000)   linkerrand, omlaag
// De test gebruikt rand 2: de fracties tellen daar van x = 2500 naar
// x = 1500, dus een fractie f ligt op x = 2500 − 1000·f, z = 2000.
const OPENING_RAND = 2;
const RAND_VAN = { x: 2500, z: 2000 };
const RAND_L_MM = 1000;
/** Punt (mm) op openingsrand 2 bij fractie f. */
const opRand = (f) => ({ x: RAND_VAN.x - RAND_L_MM * f, z: RAND_VAN.z });

function wand(lasten, meshType = "vierhoeken", opening = OPENING) {
  const nodes = [];
  for (let i = 0; i <= 8; i++) nodes.push({ id: 1 + i, x: i * 500, z: 0 });
  nodes.push({ id: 10, x: 0, z: 3000 }, { id: 11, x: 4000, z: 3000 });
  return {
    nodes, beams: [],
    supports: nodes.slice(0, 9).map((n) => ({ nodeId: n.id, type: n.id === 5 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{
      id: 1, nodeIds: [1, 9, 11, 10], thickness: T, E, nu: NU, rho: 7850,
      meshSize: 500, meshType,
      ...(opening ? { openingen: [{ id: 7, punten: opening }] } : {}),
    }],
    cases: [{ id: 1, name: "Q" }],
    ...lasten,
  };
}
const eenGeval = (mi) => solveAllCases(mi).perCase.get(1);

log("\n[1] Rasterpad: last op de bovenrand van een sparing in een wand 4 × 3 m");
for (const meshType of ["vierhoeken", "driehoeken"]) {
  // (a) GELIJKMATIG p = −10 kN/m over de volle rand van 1,000 m.
  //     F = p·L = −10 kN/m · 1,000 m = −10,000 kN = −10000 N.
  //     Resultante in het midden van de rand: fractie 0,5 → (2000, 2000) mm.
  {
    const mi = wand({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: OPENING_RAND, p: -10, dir: "z" }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opRand(0.5), fx: 0, fz: -10000 }]);
    checkRel(`(a) ${meshType} gelijkmatig: ΣFx = 0`, ev.rx, 0, 1e-9, 10000);
    checkRel(`(a) ${meshType} gelijkmatig: ΣFz = 0 (last −10 kN)`, ev.rz, 0, 1e-9, 10000);
    checkRel(`(a) ${meshType} gelijkmatig: ΣM = 0 om (0,0) (arm x = 2000 mm)`, ev.m, 0, 1e-9, 10000 * 2000);
  }
  // (b) DEELLAST p = −12 kN/m van fractie 0,1 tot 0,6.
  //     Belaste lengte = (0,6 − 0,1)·1,000 m = 0,500 m → F = −6,000 kN.
  //     Resultante in het midden van het belaste deel: fractie 0,35 →
  //     x = 2500 − 350 = 2150 mm, z = 2000 mm.
  {
    const mi = wand({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: OPENING_RAND, p: -12, dir: "z", startFrac: 0.1, endFrac: 0.6 }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opRand(0.35), fx: 0, fz: -6000 }]);
    checkRel(`(b) ${meshType} deellast: ΣFz = 0 (last −6 kN)`, ev.rz, 0, 1e-9, 6000);
    checkRel(`(b) ${meshType} deellast: ΣM = 0 (arm x = 2150 mm)`, ev.m, 0, 1e-9, 6000 * 2150);
  }
  // (c) TRAPEZIUM pStart = −4, pEnd = −16 kN/m van fractie 0,2 tot 1,0.
  //     Belaste lengte ℓ = 0,800 m.
  //     F = ½·(pA + pB)·ℓ = ½·(−20)·0,800 = −8,000 kN.
  //     Zwaartepunt vanaf het begin van het belaste deel:
  //       d = ℓ·(pA + 2·pB)/(3·(pA + pB)) = 0,8·(−4 − 32)/(3·−20)
  //         = 0,8·(−36)/(−60) = 0,8·0,6 = 0,480 m.
  //     Dus fractie 0,2 + 0,48 = 0,68 → x = 2500 − 680 = 1820 mm.
  {
    const mi = wand({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: OPENING_RAND, p: -4, pStart: -4, pEnd: -16, dir: "z", startFrac: 0.2, endFrac: 1 }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opRand(0.68), fx: 0, fz: -8000 }]);
    checkRel(`(c) ${meshType} trapezium: ΣFz = 0 (last −8 kN)`, ev.rz, 0, 1e-9, 8000);
    checkRel(`(c) ${meshType} trapezium: ΣM = 0 (zwaartepunt x = 1820 mm)`, ev.m, 0, 1e-9, 8000 * 1820);
  }
  // (d) PUNTLAST Fx = +3000 N, Fz = −7000 N op fractie 0,3 → (2200, 2000) mm.
  //     Met BEIDE componenten pint de momentvergelijking niet alleen de x-
  //     maar ook de z-coördinaat van het aangrijpingspunt vast: M = x·Fz − z·Fx.
  //     Zou de kracht stil op de omtrek (z = 0 of z = 3000) of op een andere
  //     openingsrand landen, dan klopt ΣM niet meer.
  {
    const mi = wand({ edgePointLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: OPENING_RAND, posFrac: 0.3, fx: 3000, fz: -7000 }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opRand(0.3), fx: 3000, fz: -7000 }]);
    checkRel(`(d) ${meshType} puntlast: ΣFx = 0`, ev.rx, 0, 1e-9, 3000);
    checkRel(`(d) ${meshType} puntlast: ΣFz = 0`, ev.rz, 0, 1e-9, 7000);
    checkRel(`(d) ${meshType} puntlast: ΣM = 0 op (2200, 2000) mm`, ev.m, 0, 1e-9, 7000 * 2200);
  }
}
{
  // (e) DEZELFDE last, één keer op de openingsrand en één keer op omtrekrand 2
  //     (de bovenrand van de wand, van (4000,3000) naar (0,3000)): de
  //     reactieverdeling MOET verschillen. Zonder dit verschil zou een stille
  //     terugval op de omtrek onopgemerkt kunnen blijven — de som van de
  //     reacties is in beide gevallen immers gelijk.
  const last = { plateId: 1, caseId: 1, edgeIndex: OPENING_RAND, posFrac: 0.3, fx: 0, fz: -7000 };
  const opOpening = eenGeval(wand({ edgePointLoads: [{ ...last, openingId: 7 }] }));
  const opOmtrek = eenGeval(wand({ edgePointLoads: [last] }));
  const verschil = Math.max(...[...opOpening.reactions.keys()].map((id) =>
    Math.abs(opOpening.reactions.get(id).fz - opOmtrek.reactions.get(id).fz)));
  checkTrue("(e) openingsrand ≠ omtrekrand: de reacties verdelen anders",
    verschil > 1, `grootste verschil ${verschil.toFixed(1)} N`);
  checkRel("(e) … maar beide houden dezelfde 7 kN tegen", evenwicht(opOmtrek, wand({}).nodes, [{ x: 0, z: 0, fx: 0, fz: -7000 }]).rz, 0, 1e-9, 7000);
}

// ─────────────────────────────────────────────────────────────────────────
// [2] CDT-pad: L-vormige plaat met een rechthoekige opening
// ─────────────────────────────────────────────────────────────────────────
// De L: het kwadrant rechtsboven van een vierkant 4 × 4 m ontbreekt. Hij
// rekent niet via het raster (geen asgelijnde rechthoek) en heeft dus een
// meshcache nodig. Die maken we hier met de hand — een vierkantennet van
// 500 mm waarvan de vakken buiten de L en in de opening wegvallen, dezelfde
// aanpak als de L-schijf in test-plaat-randadres.mjs. De randlijsten komen
// daarna met `zoekPuntenOpLijnstuk` uit diezelfde punten, zodat ze
// gegarandeerd van hoek tot hoek lopen.
const L_HOEKEN = [
  { x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 2000 },
  { x: 2000, z: 2000 }, { x: 2000, z: 4000 }, { x: 0, z: 4000 },
];
const L_OPENING = rect(500, 2500, 1500, 3500);   // in de linkerbovenarm
function bouwLCache(meshType) {
  const S = 500, points = [], idx = new Map();
  const punt = (x, z) => {
    const k = `${x},${z}`;
    if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); }
    return idx.get(k);
  };
  const inL = (x, z) => z <= 2000 || x <= 2000;                  // kwadrant rechtsboven weg
  const inGat = (x, z) => x > 500 && x < 1500 && z > 2500 && z < 3500;
  const triangles = [], quads = [];
  for (let z = 0; z < 4000; z += S) for (let x = 0; x < 4000; x += S) {
    const xc = x + S / 2, zc = z + S / 2;
    if (!inL(xc, zc) || inGat(xc, zc)) continue;
    const lo = punt(x, z), ro = punt(x + S, z), rb = punt(x + S, z + S), lb = punt(x, z + S);
    if (meshType === "vierhoeken") quads.push([lo, ro, rb, lb]);
    else triangles.push([lo, ro, rb], [lo, rb, lb]);
  }
  return {
    signature: berekenPlaatMeshSignatuur(L_HOEKEN, 500, { openingen: [L_OPENING], meshType }),
    points, triangles, quads, meshSoort: meshType,
    edgeNodeIndices: L_HOEKEN.map((h, i) =>
      zoekPuntenOpLijnstuk(points, h, L_HOEKEN[(i + 1) % L_HOEKEN.length], 1e-6)),
    openingEdgeNodeIndices: [L_OPENING.map((h, j) =>
      zoekPuntenOpLijnstuk(points, h, L_OPENING[(j + 1) % L_OPENING.length], 1e-6))],
  };
}
// Rand 2 van de opening loopt van (1500, 3500) naar (500, 3500) — weer de
// bovenrand, van rechts naar links, lengte 1000 mm.
const L_RAND_VAN = { x: 1500, z: 3500 };
const opLRand = (f) => ({ x: L_RAND_VAN.x - 1000 * f, z: L_RAND_VAN.z });

function lModel(lasten, meshType = "vierhoeken", cache = null) {
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  // Extra opleggingsknopen op de onderrand; alle op gridposities, dus ze
  // vallen samen met meshknopen.
  nodes.push({ id: 7, x: 1000, z: 0 }, { id: 8, x: 2000, z: 0 }, { id: 9, x: 3000, z: 0 });
  return {
    nodes, beams: [],
    supports: [1, 7, 8, 9, 2].map((id) => ({ nodeId: id, type: id === 8 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{
      id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: T, E, nu: NU, rho: 7850,
      meshSize: 500, meshType,
      openingen: [{ id: 3, punten: L_OPENING }],
      meshCache: cache ?? bouwLCache(meshType),
    }],
    cases: [{ id: 1, name: "Q" }],
    ...lasten,
  };
}

log("\n[2] CDT-pad: L-vormige plaat, openingsrandknopen uit de meshcache");
for (const meshType of ["vierhoeken", "driehoeken"]) {
  // Het net: 8 × 8 = 64 vakken, min 4 × 4 = 16 voor het weggesneden kwadrant,
  // min 2 × 2 = 4 voor de opening → 44 vakken.
  const cache = bouwLCache(meshType);
  const aantal = meshType === "vierhoeken" ? cache.quads.length : cache.triangles.length;
  checkEq(`${meshType}: 44 vakken in het L-net`, aantal, meshType === "vierhoeken" ? 44 : 88);
  checkEq(`${meshType}: 3 knopen op openingsrand 3 (500 mm net, rand 1000 mm)`,
    cache.openingEdgeNodeIndices[0][2].length, 3);
  // (a) Gelijkmatig −10 kN/m over 1,000 m → F = −10000 N, resultante op
  //     fractie 0,5 → (1000, 3500) mm.
  {
    const mi = lModel({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 3, edgeIndex: 2, p: -10, dir: "z" }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opLRand(0.5), fx: 0, fz: -10000 }]);
    checkRel(`(a) ${meshType} L-plaat gelijkmatig: ΣFz = 0`, ev.rz, 0, 1e-9, 10000);
    checkRel(`(a) ${meshType} L-plaat gelijkmatig: ΣM = 0 (arm x = 1000 mm)`, ev.m, 0, 1e-9, 10000 * 1000);
  }
  // (b) Puntlast Fx = +2000 N, Fz = −5000 N op fractie 0,25 → (1250, 3500) mm.
  {
    const mi = lModel({ edgePointLoads: [{ plateId: 1, caseId: 1, openingId: 3, edgeIndex: 2, posFrac: 0.25, fx: 2000, fz: -5000 }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes, [{ ...opLRand(0.25), fx: 2000, fz: -5000 }]);
    checkRel(`(b) ${meshType} L-plaat puntlast: ΣFx = 0`, ev.rx, 0, 1e-9, 2000);
    checkRel(`(b) ${meshType} L-plaat puntlast: ΣFz = 0`, ev.rz, 0, 1e-9, 5000);
    checkRel(`(b) ${meshType} L-plaat puntlast: ΣM = 0 op (1250, 3500) mm`, ev.m, 0, 1e-9, 5000 * 1250);
  }
  // (c) Trapezium op de LINKERrand van de opening (edgeIndex 3: van
  //     (500, 3500) omlaag naar (500, 2500), lengte 1000 mm), horizontaal.
  //     pStart = +6, pEnd = 0 kN/m over de volle rand:
  //       F = ½·(6 + 0)·1,000 = +3,000 kN in x;
  //       zwaartepunt op ⅓ vanaf het begin → z = 3500 − 333,333… mm.
  {
    const mi = lModel({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 3, edgeIndex: 3, p: 6, pStart: 6, pEnd: 0, dir: "x" }] }, meshType);
    const ev = evenwicht(eenGeval(mi), mi.nodes,
      [{ x: 500, z: 3500 - 1000 / 3, fx: 3000, fz: 0 }]);
    checkRel(`(c) ${meshType} L-plaat trapezium in x: ΣFx = 0`, ev.rx, 0, 1e-9, 3000);
    checkRel(`(c) ${meshType} L-plaat trapezium in x: ΣM = 0 (z = 3166,67 mm)`, ev.m, 0, 1e-9, 3000 * 3167);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Weigeringen met reden — engine, modelcontrole en MCP-droogloop
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Weigeringen: nooit stil op de omtrek");
{
  const randlast = (extra) => wand({ edgeLoads: [{ plateId: 1, caseId: 1, p: -10, dir: "z", ...extra }] });
  weigert("opening die niet bestaat",
    () => eenGeval(randlast({ openingId: 99, edgeIndex: 0 })),
    /opening 99 bestaat niet op deze plaat\. Aanwezig: 7\./);
  weigert("plaat zonder openingen",
    () => eenGeval(wand({ edgeLoads: [{ plateId: 1, caseId: 1, p: -10, dir: "z", openingId: 7, edgeIndex: 0 }] }, "vierhoeken", null)),
    /deze plaat heeft geen openingen/);
  weigert("benoemde rand op een opening",
    () => eenGeval(randlast({ openingId: 7, edge: "top" })),
    /Een opening heeft geen benoemde randen/);
  weigert("openingId zonder edgeIndex",
    () => eenGeval(randlast({ openingId: 7 })),
    /noemt opening 7 maar geen rand daarvan/);
  weigert("rand-index buiten het aantal openingshoeken",
    () => eenGeval(randlast({ openingId: 7, edgeIndex: 4 })),
    /rand-index 4 bestaat niet op opening 7: die opening heeft 4 randen/);
  weigert("puntlast op een opening die niet bestaat",
    () => eenGeval(wand({ edgePointLoads: [{ plateId: 1, caseId: 1, openingId: 99, edgeIndex: 0, posFrac: 0.5, fz: -1000 }] })),
    /een puntlast op de plaatrand — opening 99 bestaat niet/);

  // Dubbel openings-id: dubbelzinnig, dus weigeren. (De plaatpoort meldt het
  // dubbele id ook; de randlast mag er in geen geval een van kiezen.)
  const dubbel = bepaalPlaatlastRand(
    rect(0, 0, 4000, 3000),
    [{ id: 7, punten: OPENING }, { id: 7, punten: rect(3000, 500, 3500, 1000) }],
    { openingId: 7, edgeIndex: 0 });
  checkTrue("dubbel openings-id: dubbelzinnig, geweigerd",
    dubbel.ok === false && /komt 2 keer voor/.test(dubbel.reden), dubbel.reden ?? "");

  // De omtrek-helft van de regel weigert een openingsadres ook: zo kan een
  // lezer die de openingen niet meekrijgt nooit stil op de omtrek uitkomen.
  const { bepaalPlaatRand } = await import("./src/components/fem/femTypes.ts");
  const alleenOmtrek = bepaalPlaatRand(rect(0, 0, 4000, 3000), { openingId: 7, edgeIndex: 0 });
  checkTrue("bepaalPlaatRand (omtrek-helft) weigert een openingsadres",
    alleenOmtrek.ok === false && /alleen de omtrek/.test(alleenOmtrek.reden), alleenOmtrek.reden ?? "");

  // MCP-droogloop: DEZELFDE reden, al vóór het rekenen. (De modelcontrole
  // van het canvas staat in test-plaat-opening-randlast-doorvoer.mjs.)
  const ui = (last) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: T, E, nu: NU, rho: 7850, meshSize: 500,
      openingen: [{ id: 7, punten: OPENING }] }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, q: -10, qDir: "z", ...last }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const dg = valideerModel(ui({ openingId: 99, edgeIndex: 0 }));
  checkTrue("MCP-droogloop weigert met dezelfde reden",
    dg.ok === false && dg.errors.some((e) => /Last 1 op plaat 1: opening 99 bestaat niet/.test(e)),
    JSON.stringify(dg.errors));
  const goed = valideerModel(ui({ openingId: 7, edgeIndex: 2 }));
  checkTrue("MCP-droogloop: geldige openingsrandlast is in orde", goed.ok === true, JSON.stringify(goed.errors));
  const zonderPlaat = valideerModel({
    ...ui({ openingId: 7, edgeIndex: 2 }),
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, q: -10, qDir: "z", openingId: 7, edgeIndex: 2 }],
  });
  checkTrue("openingId zonder plateId: geweigerd (die rand hoort bij niets)",
    zonderPlaat.errors.some((e) => /noemt een plaatrand .*openingId.* maar geen plaat/.test(e)),
    JSON.stringify(zonderPlaat.errors));
  const onbekendVeld = valideerModel({
    ...ui({ openingId: 7, edgeIndex: 2 }),
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, q: -10, qDir: "z", openingIndex: 0 }],
  });
  checkTrue("`openingIndex` bestaat niet: de lastpoort weigert het onbekende veld",
    onbekendVeld.ok === false && onbekendVeld.errors.some((e) => /openingIndex/.test(e)),
    JSON.stringify(onbekendVeld.errors));
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Plaat ZONDER openingen: bit-identiek aan vóór deze wijziging
// ─────────────────────────────────────────────────────────────────────────
// Het model: dezelfde wand 4 × 3 m zonder opening, met alle vier de soorten
// plaatlast op de OMTREK (gelijkmatig, deellast in x, trapezium, en een
// randpuntlast met twee componenten). Gemeten tegen master d5e310b en tegen
// deze tak: byte-gelijke uitvoer. De getallen hieronder zijn die meting,
// voluit; de vergelijking is === en niet een tolerantie — een verschil in de
// laatste bit is hier al een regressie.
const BIT_REACTIES = [
  [1, 4.547473508864641e-13, 3542.144462759922],
  [2, 3.183231456205249e-12, 5926.895976785609],
  [3, -2.0463630789890885e-12, 5901.504295416734],
  [4, -5.002220859751105e-12, 7329.478224577038],
  [5, 15000.000000000067, 7038.170634923026],
  [6, 1.5916157281026244e-12, 7429.912510217519],
  [7, -2.2737367544323206e-12, 11019.641387749374],
  [8, 9.094947017729282e-13, 14636.452719192876],
  [9, -9.947598300641403e-13, 8175.799788378125],
];
const BIT_VERPLAATSINGEN = [
  [10, -0.006931337608207953, -0.007134477729838629],
  [11, 0.007247477129387343, -0.02484686872526894],
];
const BIT_SPANNINGEN = [
  [0, 0.015350886169234957, -0.6441341846613443, -0.02015402570501492],
  [7, -0.07217599911467307, -1.6300552856283146, -0.07781862347230982],
  [23, -0.050148471122052535, -1.7188514783220528, -0.3475283923113966],
  [47, 0.24249003056892174, -0.8465301759499264, -0.3184223635657606],
];

log("\n[4] Plaat zonder openingen: bit-identiek aan master d5e310b");
{
  const mi = wand({
    edgeLoads: [
      { plateId: 1, caseId: 1, edge: "top", p: -10, dir: "z" },
      { plateId: 1, caseId: 1, edgeIndex: 3, p: -12, dir: "x", startFrac: 0.1, endFrac: 0.6 },
      { plateId: 1, caseId: 1, edge: "right", p: -4, pStart: -4, pEnd: -16, dir: "z", startFrac: 0.2, endFrac: 1 },
    ],
    edgePointLoads: [{ plateId: 1, caseId: 1, edgeIndex: 2, posFrac: 0.3, fx: 3000, fz: -7000 }],
  }, "vierhoeken", null);
  const r = eenGeval(mi);
  let gelijk = 0, afwijkend = [];
  for (const [id, fx, fz] of BIT_REACTIES) {
    const re = r.reactions.get(id);
    if (Object.is(re?.fx, fx) && Object.is(re?.fz, fz)) gelijk++;
    else afwijkend.push(`knoop ${id}: ${re?.fx} / ${re?.fz}`);
  }
  checkTrue("9 reacties bit-identiek", gelijk === 9 && afwijkend.length === 0, afwijkend.join("; "));
  for (const [id, ux, uz] of BIT_VERPLAATSINGEN) {
    const d = r.displacements.get(id);
    checkTrue(`verplaatsing knoop ${id} bit-identiek`,
      Object.is(d?.ux, ux) && Object.is(d?.uz, uz), `${d?.ux} / ${d?.uz}`);
  }
  const els = r.plateElements[0].elements;
  checkEq("48 elementen (4×3 m, meshSize 500, vierhoeken)", els.length, 48);
  for (const [i, sx, sy, txy] of BIT_SPANNINGEN) {
    const el = els[i];
    checkTrue(`element ${i} bit-identiek (σx, σy, τxy)`,
      Object.is(el?.sigmaX, sx) && Object.is(el?.sigmaY, sy) && Object.is(el?.tauXY, txy),
      `${el?.sigmaX} / ${el?.sigmaY} / ${el?.tauXY}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [5] Doorvoer: mapping, MCP-route, projectbestand, rapportlabel, IFC
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Doorvoer: mapping, label, app-route, MCP-route en projectbestand");
{
  // Mapping: het veld gaat mee — en ONTBREEKT als de last hem niet heeft.
  const metOpening = randlastNaarSolverInput({ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, openingId: 7, edgeIndex: 2, q: -10, qDir: "z" });
  checkEq("mapping randlast: openingId gaat mee", metOpening.openingId, 7);
  const zonderOpening = randlastNaarSolverInput({ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qDir: "z" });
  checkTrue("mapping randlast op de omtrek: geen openingId-sleutel (byte-gelijke invoer)",
    !("openingId" in zonderOpening), JSON.stringify(zonderOpening));
  const pMet = randpuntlastNaarSolverInput({ id: 2, type: "pointForce", caseId: 1, plateId: 1, openingId: 7, edgeIndex: 2, posFrac: 0.3, fx: 3, fz: -7 });
  checkEq("mapping randpuntlast: openingId gaat mee", pMet.openingId, 7);
  checkTrue("mapping randpuntlast op de omtrek: geen openingId-sleutel",
    !("openingId" in randpuntlastNaarSolverInput({ id: 2, type: "pointForce", caseId: 1, plateId: 1, edge: "top", posFrac: 0.3, fx: 3, fz: -7 })),
    "");

  // Label voor paneel, tabel en rapport.
  checkEq("label: rand 3 van opening 7", plaatRandLabel({ openingId: 7, edgeIndex: 2 }), "rand 3 van opening 7");
  checkEq("label zonder opening ongewijzigd", plaatRandLabel({ edgeIndex: 2 }), "rand 3");

  // Volledig UI-model met de last op de openingsrand: app-route, MCP-route en
  // projectbestand.
  const uiModel = {
    nodes: [
      ...Array.from({ length: 9 }, (_, i) => ({ id: 1 + i, x: i * 500, z: 0 })),
      { id: 10, x: 0, z: 3000 }, { id: 11, x: 4000, z: 3000 },
    ],
    beams: [],
    supports: Array.from({ length: 9 }, (_, i) => ({ nodeId: 1 + i, type: i === 4 ? "pinned" : "zRoller" })),
    plates: [{ id: 1, nodeIds: [1, 9, 11, 10], thickness: T, E, nu: NU, rho: 7850, meshSize: 500,
      openingen: [{ id: 7, punten: OPENING }] }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [
      { id: 1, type: "edgeLoad", caseId: 1, plateId: 1, openingId: 7, edgeIndex: OPENING_RAND, q: -10, qDir: "z" },
      { id: 2, type: "pointForce", caseId: 1, plateId: 1, openingId: 7, edgeIndex: OPENING_RAND, posFrac: 0.3, fx: 3, fz: -7 },
    ],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const app = solveAllCases(bouwMultiInput(uiModel)).perCase.get(1);
  // Uitwendig: de gelijkmatige randlast (−10 kN over 1 m, midden x = 2000) plus
  // de puntlast (+3 kN / −7 kN op (2200, 2000)).
  const ev = evenwicht(app, uiModel.nodes, [
    { ...opRand(0.5), fx: 0, fz: -10000 },
    { ...opRand(0.3), fx: 3000, fz: -7000 },
  ]);
  checkRel("app-route: ΣFx = 0", ev.rx, 0, 1e-9, 3000);
  checkRel("app-route: ΣFz = 0 (−10 kN randlast, −7 kN puntlast)", ev.rz, 0, 1e-9, 17000);
  checkRel("app-route: ΣM = 0", ev.m, 0, 1e-9, 17000 * 2200);

  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: uiModel } });
  checkTrue("MCP-route: solve slaagt", antw.ok === true, antw.error?.melding ?? "");
  const mcpR = antw.result?.per_case?.["1"]?.reactions ?? {};
  let maxAfw = 0;
  for (const [id, re] of app.reactions) {
    maxAfw = Math.max(maxAfw, Math.abs((mcpR[String(id)]?.fz ?? NaN) - re.fz / 1000));
  }
  checkRel("MCP-route: dezelfde reacties als de app (kN)", maxAfw, 0, 1e-9, 17);

  // Projectbestand: het veld overleeft schrijven en lezen.
  const heen = serializeProject({
    nodes: uiModel.nodes, beams: [], supports: uiModel.supports, plates: uiModel.plates,
    loads: uiModel.loads, loadCases: uiModel.loadCases, combinations: [],
  });
  const terug = deserializeProject(heen);
  checkEq("projectbestand: openingId van de randlast", terug.loads[0].openingId, 7);
  checkEq("projectbestand: openingId van de randpuntlast", terug.loads[1].openingId, 7);
  checkEq("projectbestand: versie blijft 2", JSON.parse(heen).version, 2);
  const zonder = JSON.parse(serializeProject({
    nodes: uiModel.nodes, beams: [], supports: uiModel.supports,
    plates: [{ ...uiModel.plates[0], openingen: undefined }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qDir: "z" }],
    loadCases: uiModel.loadCases, combinations: [],
  }));
  checkTrue("een last op de omtrek krijgt GEEN openingId in het bestand",
    !("openingId" in zonder.loads[0]), JSON.stringify(zonder.loads[0]));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
