// Vierhoekmesher (stap 2 van het platenspoor): Quad4- en CST-netten voor
// rechthoeken (raster) en polygonen (CDT-cache met vierhoeken), de
// elementkeuze per plaat, de keuring van een cache met vierhoeken en de
// MCP-route.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] PATCHTEST op het raster: een wand onder gelijkmatige trek (statisch
//       bepaald opgelegd, zodat de dwarscontractie vrij is) heeft in ELK
//       element exact σy = p/t en σx = τxy = 0, en u_top = σ·h/E. Zowel Quad4
//       als CST bevatten het lineaire verplaatsingsveld, dus dit is exact tot
//       op afrondruis (1e-9), niet "binnen een paar procent".
//   [2] PATCHTEST op een ONREGELMATIG GEMENGD net (CDT-pad): een handgemaakte
//       cache met drie verschoven binnenknopen, vervormde vierhoeken links en
//       driehoeken rechts, onder gelijkmatige trek in x → σx = p/t exact in
//       elk element. Dat is de klassieke patchtest voor Quad4: alleen een
//       correct isoparametrisch element reproduceert een constante rek op een
//       vervormd net.
//   [3] ZUIVERE AFSCHUIVING: schuiftracties τ·t op alle vier de randen van een
//       vierkante schijf (zelf in evenwicht; drie steunpunten tegen starre
//       verplaatsing) → τxy = τ exact, σx = σy = 0, reacties 0 — beide typen.
//   [4] HOGE WANDSCHIJF (h/b = 3, ingeklemd, horizontale kopbelasting):
//       verfijning 500 → 250 → 125 mm. Driehoeken (CST, stijver) en
//       vierhoeken convergeren naar elkaar: verschil ≤ 2 % bij 125 mm, en het
//       verschil krimpt bij elke verfijning. Referentie Timoshenko
//       w = P·H³/(3EI) + 1,2·P·H/(G·A): de vierhoeken liggen er bij 125 mm
//       binnen 5 % van (dezelfde eis als test-plaat-mixed).
//   [5] DEZELFDE REACTIES bij dezelfde randlast op beide meshtypen (raster én
//       de L-schijf uit de CDT-cache, waar `koppelTotVierhoeken` de
//       driehoeken tot vierhoeken koppelt): ΣR en het momentevenwicht zijn
//       statica en hangen niet van het elementtype af — gelijk tot 1e-9.
//   [6] KEURING: een niet-convexe vierhoek, een vierhoek met een dubbel
//       hoekpunt en een onbekende elementkeuze worden geweigerd met reden;
//       de poort (valideerModel) weigert een tikfout in `meshType` en keurt
//       een cache met `quads` goed.
//   [7] MCP-route (in-proces sidecar): een rechthoek met `meshType`
//       "driehoeken" geeft dezelfde reacties als de app-route.
//   [8] `rasterLijnen`: zonder dwingende posities de oude indeling
//       lo + (k/n)·(hi−lo); met dwingende posities (openingsranden) worden
//       die gridlijn en wordt elk tussenstuk apart verdeeld.
//
// Uitvoeren: npx tsx test-plaat-vierhoeken.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { berekenPlaatMeshSignatuur } = await import("./src/components/fem/femTypes.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { koppelTotVierhoeken, rasterLijnen, splitsVierhoekenInDriehoeken } =
  await import("./src/core/fem/PlaatMesher.ts");

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
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}
function reactieSom(r, nodes) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  let rx = 0, rz = 0, m = 0;
  for (const [id, re] of r.reactions) {
    const n = pos.get(id);
    rx += re.fx; rz += re.fz; m += n.x * re.fz - n.z * re.fx;
  }
  return { rx, rz, m };
}
const eenGeval = (mi) => solveAllCases(mi).perCase.get(1);
const elementen = (r, plateId = 1) => r.plateElements.find((p) => p.plateId === plateId).elements;
const E = 210000, NU = 0.3, T = 20;   // N/mm², —, mm
const SIGMA = 5;                      // N/mm² → randlast p = σ·t = 100 N/mm (= kN/m)

// ─────────────────────────────────────────────────────────────────────────
// Modellen
// ─────────────────────────────────────────────────────────────────────────
/**
 * Trekwand b × h, meshSize s: UI-knopen op alle onderrand-gridposities
 * (zRoller, de middelste pinned — statisch bepaald, dwarscontractie vrij),
 * hoekknopen boven en een middenknoop boven om u_top af te lezen.
 */
function trekwand(b, h, s, meshType, extra = {}) {
  const nodes = [];
  const nx = Math.round(b / s);
  for (let i = 0; i <= nx; i++) nodes.push({ id: 1 + i, x: i * s, z: 0 });
  const tl = nx + 2, tr = nx + 3, tm = nx + 4;
  nodes.push({ id: tl, x: 0, z: h }, { id: tr, x: b, z: h }, { id: tm, x: (nx % 2 === 0 ? nx / 2 : Math.floor(nx / 2)) * s, z: h });
  const midden = 1 + Math.floor(nx / 2);
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nx + 1).map((n) => ({ nodeId: n.id, type: n.id === midden ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, nx + 1, tr, tl], thickness: T, E, nu: NU, rho: 7850, meshSize: s, ...(meshType ? { meshType } : {}) }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: SIGMA * T, dir: "z" }],
    cases: [{ id: 1, name: "Q" }],
    topMidden: tm,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Patchtest raster: gelijkmatige trek, beide elementtypen");
for (const meshType of ["vierhoeken", "driehoeken"]) {
  const mi = trekwand(2000, 3000, 500, meshType);
  const r = eenGeval(mi);
  const els = elementen(r);
  const verwacht = meshType === "vierhoeken" ? 4 * 6 : 2 * 4 * 6;
  checkTrue(`${meshType}: ${verwacht} elementen`, els.length === verwacht, `${els.length}`);
  checkTrue(`${meshType}: elk element ${meshType === "vierhoeken" ? 4 : 3} hoeken`,
    els.every((el) => el.corners.length === (meshType === "vierhoeken" ? 4 : 3)));
  let maxFout = 0;
  for (const el of els) {
    maxFout = Math.max(maxFout, Math.abs(el.sigmaY - SIGMA), Math.abs(el.sigmaX), Math.abs(el.tauXY));
  }
  checkRel(`${meshType}: σy = σ, σx = τxy = 0 in elk element (max afwijking)`, SIGMA + maxFout, SIGMA, 1e-9);
  checkRel(`${meshType}: u_top = σ·h/E`, r.displacements.get(mi.topMidden).uz, SIGMA * 3000 / E, 1e-9);
  const som = reactieSom(r, mi.nodes);
  checkRel(`${meshType}: ΣRz = −p·b`, som.rz, -SIGMA * T * 2000, 1e-9);
}
{
  // Zonder keuze rekent een rechthoek als vóór stap 2: met het Quad4-raster.
  const r = eenGeval(trekwand(2000, 3000, 500, undefined));
  checkTrue("zonder meshType: rechthoek rekent met vierhoeken (24 Quad4, zoals voorheen)",
    elementen(r).length === 24 && elementen(r).every((el) => el.corners.length === 4));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Patchtest op een onregelmatig gemengd net (CDT-pad, handgemaakte cache)");
// Vijfhoek 2000 × 1000 (extra hoek halverwege de rechterrand, zodat het de
// CDT-route neemt): raster 4 × 2 met drie VERSCHOVEN binnenknopen.
// Kolommen 0–1: vervormde vierhoeken; kolommen 2–3: driehoeken.
const P5 = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 500 }, { x: 2000, z: 1000 }, { x: 0, z: 1000 }];
function gemengdeCache(meshType) {
  const points = [], idx = new Map();
  const punt = (x, z) => { const k = `${x},${z}`; if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); } return idx.get(k); };
  const verschoven = { "500,500": [450, 560], "1000,500": [1080, 430], "1500,500": [1520, 540] };
  const knoop = (x, z) => { const v = verschoven[`${x},${z}`]; return v ? punt(v[0], v[1]) : punt(x, z); };
  const quads = [], triangles = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
    const x = i * 500, z = j * 500;
    const lo = knoop(x, z), ro = knoop(x + 500, z), rb = knoop(x + 500, z + 500), lb = knoop(x, z + 500);
    if (i < 2) quads.push([lo, ro, rb, lb]);
    else triangles.push([lo, ro, rb], [lo, rb, lb]);
  }
  const opRand = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    return points.map((p, k) => ({ k, t: ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / L,
      d: Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / L }))
      .filter((q) => q.d < 1e-6 && q.t > -1e-6 && q.t < L + 1e-6).sort((p, q) => p.t - q.t).map((q) => q.k);
  };
  const alleDriehoeken = meshType === "driehoeken" ? [...triangles, ...splitsVierhoekenInDriehoeken(quads)] : triangles;
  return {
    signature: berekenPlaatMeshSignatuur(P5, 500, { openingen: [], meshType }),
    points,
    triangles: alleDriehoeken,
    ...(meshType === "vierhoeken" ? { quads, meshSoort: "gemengd" } : { meshSoort: "driehoeken" }),
    edgeNodeIndices: P5.map((h, i) => opRand(h, P5[(i + 1) % 5])),
  };
}
function vijfhoek(meshType, cache = gemengdeCache(meshType), extra = {}) {
  const nodes = P5.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  nodes.push({ id: 6, x: 0, z: 500 });
  return {
    nodes, beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 5, type: "xRoller" }, { nodeId: 6, type: "xRoller" }],
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType, meshCache: cache }],
    // Trek in x op de rechterrand = rand 1 (hoek 2 → 3) én rand 2 (hoek 3 → 4).
    edgeLoads: [
      { plateId: 1, caseId: 1, edgeIndex: 1, p: SIGMA * T, dir: "x" },
      { plateId: 1, caseId: 1, edgeIndex: 2, p: SIGMA * T, dir: "x" },
    ],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}
for (const meshType of ["vierhoeken", "driehoeken"]) {
  const mi = vijfhoek(meshType);
  const r = eenGeval(mi);
  const els = elementen(r);
  // Kolommen 0–1: 2 × 2 vakken = 4 vierhoeken; kolommen 2–3: 2 × 2 vakken × 2 = 8 driehoeken.
  checkTrue(`${meshType}: ${meshType === "vierhoeken" ? "4 vierhoeken + 8 driehoeken" : "16 driehoeken"}`,
    meshType === "vierhoeken"
      ? els.filter((e) => e.corners.length === 4).length === 4 && els.filter((e) => e.corners.length === 3).length === 8
      : els.length === 16 && els.every((e) => e.corners.length === 3));
  let maxFout = 0;
  for (const el of els) maxFout = Math.max(maxFout, Math.abs(el.sigmaX - SIGMA), Math.abs(el.sigmaY), Math.abs(el.tauXY));
  checkRel(`${meshType}: σx = σ, σy = τxy = 0 in elk element op het vervormde net (max afwijking)`, SIGMA + maxFout, SIGMA, 1e-8);
  checkRel(`${meshType}: u_rechts = σ·L/E`, r.displacements.get(2).ux, SIGMA * 2000 / E, 1e-8);
  checkRel(`${meshType}: ΣRx = −p·h`, reactieSom(r, mi.nodes).rx, -SIGMA * T * 1000, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Zuivere afschuiving: τ·t op vier randen, beide elementtypen");
{
  const TAU = 3;
  for (const meshType of ["vierhoeken", "driehoeken"]) {
    const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 2000 }, { id: 4, x: 0, z: 2000 }];
    const mi = {
      nodes, beams: [],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: [],
      plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType }],
      // Randtracties van een zuivere schuifspanning τ: boven +τ·t in x, onder
      // −τ·t in x, rechts +τ·t in z, links −τ·t in z (in evenwicht).
      edgeLoads: [
        { plateId: 1, caseId: 1, edge: "top", p: TAU * T, dir: "x" },
        { plateId: 1, caseId: 1, edge: "bottom", p: -TAU * T, dir: "x" },
        { plateId: 1, caseId: 1, edge: "right", p: TAU * T, dir: "z" },
        { plateId: 1, caseId: 1, edge: "left", p: -TAU * T, dir: "z" },
      ],
      cases: [{ id: 1, name: "Q" }],
    };
    const r = eenGeval(mi);
    let maxFout = 0;
    for (const el of elementen(r)) maxFout = Math.max(maxFout, Math.abs(el.tauXY - TAU), Math.abs(el.sigmaX), Math.abs(el.sigmaY));
    checkRel(`${meshType}: τxy = τ, σx = σy = 0 in elk element (max afwijking)`, TAU + maxFout, TAU, 1e-9);
    const som = reactieSom(r, nodes);
    checkRel(`${meshType}: reacties nul (lasten in evenwicht)`, TAU * T * 2000 + Math.abs(som.rx) + Math.abs(som.rz), TAU * T * 2000, 1e-9);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Hoge wandschijf: convergentie driehoeken ↔ vierhoeken en Timoshenko");
{
  // Betonwand b = 2 m, H = 6 m, t = 200 mm, E = 30000 N/mm², ν = 0,2;
  // onderrand ingeklemd (alle knopen pinned), kopbelasting P = 20 kN
  // horizontaal als randlast p = 10 N/mm op de bovenrand.
  const B = 2000, H = 6000, TW = 200, EW = 30000, NUW = 0.2, PKOP = 10;
  const P = PKOP * B;
  const I = TW * B ** 3 / 12, A = TW * B, G = EW / (2 * (1 + NUW));
  const wTim = P * H ** 3 / (3 * EW * I) + 1.2 * P * H / (G * A);
  const proef = (s, meshType) => {
    const nodes = [];
    const nx = Math.round(B / s);
    for (let i = 0; i <= nx; i++) nodes.push({ id: 1 + i, x: i * s, z: 0 });
    nodes.push({ id: nx + 2, x: 0, z: H }, { id: nx + 3, x: B, z: H });
    const mi = {
      nodes, beams: [],
      supports: nodes.slice(0, nx + 1).map((n) => ({ nodeId: n.id, type: "pinned" })),
      loads: [],
      plates: [{ id: 1, nodeIds: [1, nx + 1, nx + 3, nx + 2], thickness: TW, E: EW, nu: NUW, rho: 2500, meshSize: s, meshType }],
      edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: PKOP, dir: "x" }],
      cases: [{ id: 1, name: "W" }],
    };
    const r = eenGeval(mi);
    return { u: r.displacements.get(nx + 2).ux, som: reactieSom(r, nodes) };
  };
  const stappen = [500, 250, 125];
  const uQ = stappen.map((s) => proef(s, "vierhoeken"));
  const uD = stappen.map((s) => proef(s, "driehoeken"));
  log(`    Timoshenko w = ${wTim.toFixed(5)} mm`);
  stappen.forEach((s, k) => log(`    meshSize ${s}: vierhoeken ${uQ[k].u.toFixed(5)} mm (${(uQ[k].u / wTim).toFixed(4)}·Tim), driehoeken ${uD[k].u.toFixed(5)} mm (${(uD[k].u / wTim).toFixed(4)}·Tim), verschil ${(100 * Math.abs(uQ[k].u - uD[k].u) / uQ[k].u).toFixed(2)} %`));
  const verschil = stappen.map((_, k) => Math.abs(uQ[k].u - uD[k].u) / Math.abs(uQ[k].u));
  checkTrue("verschil driehoeken ↔ vierhoeken krimpt bij elke verfijning",
    verschil[0] > verschil[1] && verschil[1] > verschil[2], verschil.map((v) => (100 * v).toFixed(2) + " %").join(" → "));
  checkTrue("verschil ≤ 2 % bij meshSize 125", verschil[2] <= 0.02, `${(100 * verschil[2]).toFixed(2)} %`);
  checkTrue("driehoeken (CST) zijn stijver dan vierhoeken op elk niveau", uD.every((d, k) => d.u < uQ[k].u));
  checkTrue("beide reeksen convergeren monotoon (u neemt toe bij verfijning)",
    uQ[0].u < uQ[1].u && uQ[1].u < uQ[2].u && uD[0].u < uD[1].u && uD[1].u < uD[2].u);
  checkRel("vierhoeken 125 mm binnen 5 % van Timoshenko", uQ[2].u, wTim, 0.05);
  // [5] statica: dezelfde reacties op beide typen, en gelijk aan de last.
  for (let k = 0; k < stappen.length; k++) {
    checkRel(`meshSize ${stappen[k]}: ΣRx = −P op beide typen`, uQ[k].som.rx + uD[k].som.rx, -2 * P, 1e-9);
    checkRel(`meshSize ${stappen[k]}: inklemmoment gelijk op beide typen`, uQ[k].som.m, uD[k].som.m, 1e-9, Math.abs(P * H));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] L-schijf uit de CDT-cache: driehoeken → vierhoeken via koppelTotVierhoeken");
const L_HOEKEN = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 1000, z: 1000 }, { x: 1000, z: 2000 }, { x: 0, z: 2000 },
];
function lCache(meshType) {
  const S = 500, points = [], idx = new Map();
  const punt = (x, z) => { const k = `${x},${z}`; if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); } return idx.get(k); };
  const binnen = (x, z) => (x <= 2000 && z <= 1000) || (x <= 1000 && z <= 2000);
  const triangles = [];
  for (let x = 0; x < 2000; x += S) for (let z = 0; z < 2000; z += S) {
    if (!binnen(x + S / 2, z + S / 2)) continue;
    const bl = punt(x, z), br = punt(x + S, z), tr = punt(x + S, z + S), tl = punt(x, z + S);
    triangles.push([bl, br, tr], [bl, tr, tl]);
  }
  const rand = (a, b) => { const n = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / S), l = []; for (let s = 0; s <= n; s++) l.push(punt(a.x + (s / n) * (b.x - a.x), a.z + (s / n) * (b.z - a.z))); return l; };
  const edgeNodeIndices = L_HOEKEN.map((h, i) => rand(h, L_HOEKEN[(i + 1) % L_HOEKEN.length]));
  const signature = berekenPlaatMeshSignatuur(L_HOEKEN, S, { openingen: [], meshType });
  if (meshType === "vierhoeken") {
    const k = koppelTotVierhoeken(points, triangles);
    return { signature, points, triangles: k.triangles, quads: k.quads, meshSoort: k.meshSoort, edgeNodeIndices };
  }
  return { signature, points, triangles, meshSoort: "driehoeken", edgeNodeIndices };
}
function lSchijf(meshType, cache = lCache(meshType), extra = {}) {
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  return {
    nodes, beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 6, type: "xRoller" }],
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, ...(meshType ? { meshType } : {}), meshCache: cache }],
    edgeLoads: [{ plateId: 1, caseId: 1, edgeIndex: 4, p: -10, pStart: -6, pEnd: -14, startFrac: 0.2, endFrac: 0.9, dir: "z" }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}
{
  const cQ = lCache("vierhoeken");
  checkTrue("koppeling: 24 driehoeken van het rasternet worden 12 vierhoeken, niets blijft over",
    cQ.quads.length === 12 && cQ.triangles.length === 0 && cQ.meshSoort === "vierhoeken", `${cQ.quads.length} vierhoeken, ${cQ.triangles.length} driehoeken, ${cQ.meshSoort}`);
  const rQ = eenGeval(lSchijf("vierhoeken"));
  const rD = eenGeval(lSchijf("driehoeken"));
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  const sQ = reactieSom(rQ, nodes), sD = reactieSom(rD, nodes);
  // Trapezium −6 → −14 over 0,2–0,9 van rand 4 (lengte 1000): ∫p = (6+14)/2 · 700 = 7000 N.
  checkRel("L vierhoeken: ΣRz = −∫p = 7 kN", sQ.rz, 7000, 1e-9);
  checkRel("L driehoeken: ΣRz gelijk", sD.rz, sQ.rz, 1e-9);
  checkRel("L: momentevenwicht gelijk op beide typen", sQ.m, sD.m, 1e-9, 7000 * 2000);
  checkTrue("L vierhoeken: 12 Quad4-elementen in het resultaat", elementen(rQ).length === 12 && elementen(rQ).every((e) => e.corners.length === 4));
  // Gemengd net: laat één paar driehoeken ongekoppeld → "gemengd" wordt gemeld
  // en rekent gewoon mee.
  const cG = lCache("vierhoeken");
  const [q0, ...rest] = cG.quads;
  const gemengd = { ...cG, quads: rest, triangles: splitsVierhoekenInDriehoeken([q0]), meshSoort: "gemengd" };
  const rG = eenGeval(lSchijf("vierhoeken", gemengd));
  checkTrue("gemengd net (11 vierhoeken + 2 driehoeken) rekent", elementen(rG).length === 13);
  checkRel("gemengd net: ΣRz gelijk", reactieSom(rG, nodes).rz, sQ.rz, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Keuring van vierhoeken en de elementkeuze");
{
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  const basis = lCache("vierhoeken");
  const vlinder = { ...basis, quads: basis.quads.map((q, i) => (i === 0 ? [q[0], q[1], q[3], q[2]] : q)) };
  weigert("niet-convexe vierhoek (vlinder): geweigerd met reden",
    () => eenGeval(lSchijf("vierhoeken", vlinder)), /Plaat 1: de meshcache is beschadigd — vierhoek 1 is niet convex/);
  const dubbel = { ...basis, quads: basis.quads.map((q, i) => (i === 2 ? [q[0], q[1], q[1], q[3]] : q)) };
  weigert("vierhoek met een dubbel hoekpunt: geweigerd",
    () => eenGeval(lSchijf("vierhoeken", dubbel)), /vierhoek 3 heeft twee gelijke hoekpunten/);
  const buiten = { ...basis, quads: basis.quads.map((q, i) => (i === 1 ? [q[0], q[1], q[2], 999] : q)) };
  weigert("vierhoek naar een niet-bestaand punt: geweigerd",
    () => eenGeval(lSchijf("vierhoeken", buiten)), /vierhoek 2 verwijst naar punten die niet bestaan/);
  // Kloksgewijs opgegeven vierhoek: hetzelfde element, omloopzin wordt
  // genormaliseerd — dus geen fout en dezelfde reacties.
  const kloks = { ...basis, quads: basis.quads.map((q) => [q[0], q[3], q[2], q[1]]) };
  const rK = eenGeval(lSchijf("vierhoeken", kloks));
  const rB = eenGeval(lSchijf("vierhoeken", basis));
  checkRel("kloksgewijze vierhoeken: genormaliseerd, zelfde reacties", reactieSom(rK, nodes).rz, reactieSom(rB, nodes).rz, 1e-12);
  checkRel("kloksgewijze vierhoeken: zelfde verplaatsing knoop 5", rK.displacements.get(5).uz, rB.displacements.get(5).uz, 1e-12);
  weigert("onbekende elementkeuze: geweigerd",
    () => eenGeval(trekwand(2000, 3000, 500, "zeshoeken")), /Plaat 1: onbekende elementkeuze "zeshoeken"/);
  // Handtekening: een cache van vóór de keuze (zonder |t…) past niet meer
  // zodra de plaat "vierhoeken" kiest — geen stil hergebruik van driehoeken.
  const oud = lCache("driehoeken");
  weigert("cache zonder elementkeuze bij een plaat mét keuze: verouderd",
    () => eenGeval(lSchijf("vierhoeken", oud)), /CDT-rekenmesh ontbreekt of is verouderd/);
  // De poort.
  const ui = (plaat) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, ...plaat }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qDir: "z" }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const tikfout = valideerModel(ui({ meshType: "vierhoek" }));
  checkTrue("poort: tikfout in meshType geweigerd", !tikfout.ok && tikfout.errors.some((e) => /meshType: "vierhoek" is geen geldige waarde/.test(e)), JSON.stringify(tikfout.errors));
  checkTrue("poort: meshType driehoeken op een rechthoek is geldig", valideerModel(ui({ meshType: "driehoeken" })).ok === true);
  const lUi = {
    nodes, beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 6, type: "xRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, meshType: "vierhoeken", meshCache: basis }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edgeIndex: 4, q: -10, qDir: "z" }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const okL = valideerModel(lUi);
  checkTrue("poort: cache met quads en meshSoort is geldig", okL.ok === true, JSON.stringify(okL.errors));
  const kapot = valideerModel({ ...lUi, plates: [{ ...lUi.plates[0], meshCache: { ...basis, quads: [[0, 1, 2]] } }] });
  checkTrue("poort: quads die geen viertallen zijn geweigerd", kapot.errors.some((e) => /meshCache\.quads: moet een lijst van viertallen/.test(e)), JSON.stringify(kapot.errors));
  const soort = valideerModel({ ...lUi, plates: [{ ...lUi.plates[0], meshCache: { ...basis, meshSoort: "hexa" } }] });
  checkTrue("poort: onbekende meshSoort geweigerd", soort.errors.some((e) => /meshSoort: "hexa" is geen geldige waarde/.test(e)), JSON.stringify(soort.errors));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] MCP-route: meshType reist mee en geeft dezelfde reacties als de app");
{
  const model = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 500, z: 0 }, { id: 3, x: 1000, z: 0 }, { id: 4, x: 1500, z: 0 }, { id: 5, x: 2000, z: 0 },
      { id: 6, x: 0, z: 3000 }, { id: 7, x: 2000, z: 3000 },
    ],
    beams: [],
    supports: [1, 2, 3, 4, 5].map((id) => ({ nodeId: id, type: id === 1 ? "pinned" : "zRoller" })),
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500, meshType: "driehoeken" }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qStart: -4, qEnd: -16, startFrac: 0.1, endFrac: 0.8, qDir: "z" }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const mi = bouwMultiInput(model);
  checkTrue("mapping: meshType gaat mee", mi.plates[0].meshType === "driehoeken");
  checkTrue("mapping zonder meshType: geen sleutel (byte-gelijk aan voorheen)",
    !("meshType" in bouwMultiInput({ ...model, plates: [{ ...model.plates[0], meshType: undefined }] }).plates[0]));
  const app = solveAllCases(mi).perCase.get(1);
  checkTrue("app: 48 CST-elementen", elementen(app).length === 48);
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model } });
  checkTrue("MCP solve slaagt", antw.ok === true, antw.error?.melding ?? "");
  for (const knoop of [1, 2, 3, 4, 5]) {
    const mcp = antw.result?.per_case?.["1"]?.reactions?.[String(knoop)];
    const ref = app.reactions.get(knoop);
    checkRel(`knoop ${knoop}: MCP Rz ≡ app (kN)`, mcp?.fz ?? NaN, ref.fz / 1000, 1e-12, Math.max(1e-9, Math.abs(ref.fz / 1000)));
  }
  // (4+16)/2 · 0,7 · 2000 = 14 kN.
  const som = Object.values(antw.result.per_case["1"].reactions).reduce((s, x) => s + x.fz, 0);
  checkRel("MCP: ΣRz = −∫p = 14 kN", som, 14, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] rasterLijnen");
{
  const oud = rasterLijnen(0, 3000, [], 500);
  checkTrue("zonder dwingende posities: 0, 500, …, 3000", JSON.stringify(oud) === JSON.stringify([0, 500, 1000, 1500, 2000, 2500, 3000]), JSON.stringify(oud));
  const met = rasterLijnen(0, 3000, [1200, 1800], 500);
  // [0,1200] → round(2,4) = 2 delen (600), [1200,1800] → 1 deel, [1800,3000] → 2 delen (600).
  checkTrue("met openingsranden 1200 en 1800: 0, 600, 1200, 1800, 2400, 3000", JSON.stringify(met) === JSON.stringify([0, 600, 1200, 1800, 2400, 3000]), JSON.stringify(met));
  const buiten = rasterLijnen(0, 3000, [-100, 3000, 5000], 1000);
  checkTrue("dwingende posities buiten het interval tellen niet mee", JSON.stringify(buiten) === JSON.stringify([0, 1000, 2000, 3000]), JSON.stringify(buiten));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
