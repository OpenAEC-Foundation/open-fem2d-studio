// Openingen in platen (stap 2 van het platenspoor): het rasterpad met
// rechthoekige openingen, het CDT-pad met een veelhoekige opening, de
// weigeringen (poort, modelcontrole, engine), het projectbestand, de MCP-route
// en de IFC-export.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] RASTERPAD: wand 4 × 3 m met een rechthoekige opening. De gridlijnen
//       lopen door de openingsranden (ook als die niet op een veelvoud van de
//       meshSize liggen), de vakken in de opening vallen weg: het aantal
//       elementen is aftelbaar, geen element heeft zijn zwaartepunt in de
//       opening, elke openingshoek is een meshknoop, en ΣR = de uitwendige
//       last (statica, 1e-9) — voor vierhoeken én driehoeken. De randstaaf
//       langs de bovenrand wordt op de extra gridlijnen gesplitst (dezelfde
//       lijst als de mesher), zodat hij nergens los van de plaat raakt.
//   [2] SPANNINGSCONCENTRATIE: plaat 4 × 4 m met een cirkelvormige opening
//       (16-hoek, R = 200 mm; d/b = 0,1) onder gelijkmatige trek σ. Klassieke
//       oplossing (Kirsch, oneindige plaat): σ_max = 3·σ aan de zijkanten van
//       het gat; voor d/b = 0,1 blijft de factor op de brutodoorsnede ≈ 3,0.
//       Het net is een handgemaakte O-grid-cache (stralen × lagen, lagen
//       geometrisch verdicht naar het gat) op drie verfijningen. Elementen
//       geven zwaartepuntspanningen, dus de piek wordt van onderaf benaderd:
//       Kirsch geeft op de afstand van het eerste elementzwaartepunt
//       σθ/σ = ½·(2 + a²/r² + 3·a⁴/r⁴) ≈ 1,8 / 2,5 / 2,8 voor de drie
//       niveaus. Geëist: de reeks stijgt monotoon, de fijnste waarde ligt
//       tussen 2,5 en 3,3, en de spanning ver van het gat is σ (±5 %).
//       Zowel met vierhoeken als met driehoeken (zelfde knopen, elke
//       vierhoek gesplitst). Reacties nul: de last is in evenwicht.
//   [3] WEIGERINGEN met reden, langs DEZELFDE regel in poort en engine
//       (`valideerPlaatOpeningen`; de modelcontrole en het canvas delen die
//       regel — zie test-plaat-openingen-store.mjs): opening buiten de plaat,
//       rakend aan de omtrek (< 10 mm), twee overlappende openingen, een
//       opening met maar twee punten; een niet-rechthoekige opening zonder
//       cache; een cache met een opening maar zonder `openingEdgeNodeIndices`.
//   [4] PROJECTBESTAND: `openingen` en `meshType` overleven serialize →
//       deserialize bit-exact; een bestand zonder die velden laadt zonder.
//   [5] MCP-ROUTE: de wand met opening rekent via de in-proces sidecar met
//       dezelfde reacties als de app; de poort keurt hem goed.
//   De IFC-export van openingen staat in test-ifc-export.mjs [9b]; de
//   modelcontrole en het meereizen van openingen bij verplaatsen, roteren,
//   spiegelen en kopiëren in test-plaat-openingen-store.mjs.
//
// Uitvoeren: npx tsx test-plaat-openingen.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { berekenPlaatMeshSignatuur, valideerPlaatOpeningen, plaatRekentAlsRaster } =
  await import("./src/components/fem/femTypes.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");
const { splitsVierhoekenInDriehoeken, puntInPolygoon } = await import("./src/core/fem/PlaatMesher.ts");

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
const zwaartepunt = (el) => ({
  x: el.corners.reduce((s, c) => s + c.x, 0) / el.corners.length,
  z: el.corners.reduce((s, c) => s + c.z, 0) / el.corners.length,
});
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const E = 210000, NU = 0.3, T = 20, SIGMA = 5;

// ─────────────────────────────────────────────────────────────────────────
// Wand 4 × 3 m, meshSize 500: onderrand op alle gridposities opgelegd
// (zRoller, midden pinned), hoeken boven. Trek op de bovenrand p = σ·t.
// ─────────────────────────────────────────────────────────────────────────
function wandMetOpening(openingen, meshType, extra = {}) {
  const nodes = [];
  for (let i = 0; i <= 8; i++) nodes.push({ id: 1 + i, x: i * 500, z: 0 });
  nodes.push({ id: 10, x: 0, z: 3000 }, { id: 11, x: 4000, z: 3000 });
  return {
    nodes, beams: [],
    supports: nodes.slice(0, 9).map((n) => ({ nodeId: n.id, type: n.id === 5 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, 9, 11, 10], thickness: T, E, nu: NU, rho: 7850, meshSize: 500,
      ...(meshType ? { meshType } : {}),
      ...(openingen.length > 0 ? { openingen: openingen.map((p, i) => ({ id: i + 1, punten: p })) } : {}) }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: SIGMA * T, dir: "z" }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}

log("\n[1] Rasterpad: rechthoekige opening in een wand 4 × 3 m");
{
  // (a) Opening op gridposities: 1500..2500 × 1000..2000 → 8 × 6 = 48 vakken − 4 = 44.
  const opA = rect(1500, 1000, 2500, 2000);
  for (const meshType of ["vierhoeken", "driehoeken"]) {
    const mi = wandMetOpening([opA], meshType);
    const r = eenGeval(mi);
    const els = elementen(r);
    const verwacht = meshType === "vierhoeken" ? 44 : 88;
    checkTrue(`(a) ${meshType}: ${verwacht} elementen (48 vakken − 4 in de opening)`, els.length === verwacht, `${els.length}`);
    checkTrue(`(a) ${meshType}: geen elementzwaartepunt in de opening`,
      els.every((el) => !puntInPolygoon(zwaartepunt(el).x, zwaartepunt(el).z, opA)));
    const knopen = new Set(els.flatMap((el) => el.corners.map((c) => `${Math.round(c.x)},${Math.round(c.z)}`)));
    checkTrue(`(a) ${meshType}: elke openingshoek is een meshknoop`, opA.every((p) => knopen.has(`${p.x},${p.z}`)));
    checkRel(`(a) ${meshType}: ΣRz = −p·b = −400 kN`, reactieSom(r, mi.nodes).rz, -SIGMA * T * 4000, 1e-9);
    // Netto doorsnede naast de opening: 4000 − 1000 = 3000 mm draagt 400 kN →
    // gemiddeld 6,67 N/mm²; de piek naast het gat ligt daarboven, de bovenste
    // rij (ver van het gat) blijft bij σ.
    const naast = els.filter((el) => { const z = zwaartepunt(el); return z.z > 1000 && z.z < 2000; });
    const boven = els.filter((el) => zwaartepunt(el).z > 2500);
    const maxNaast = Math.max(...naast.map((el) => el.sigmaY));
    checkTrue(`(a) ${meshType}: σy naast de opening > netto gemiddelde 6,67 (max ${maxNaast.toFixed(2)})`, maxNaast > SIGMA * 4000 / 3000);
    const gemBoven = boven.reduce((s, el) => s + el.sigmaY, 0) / boven.length;
    checkRel(`(a) ${meshType}: σy in de bovenste rij ≈ σ (±5 %)`, gemBoven, SIGMA, 0.05);
  }
  // (b) Opening NIET op gridposities: 1300..2200 × 900..2100. De opleggings-
  // knopen op x = 0, 500, …, 4000 zijn dwingende gridlijnen (daar hangt iets
  // aan; zonder die regel lagen ze na de opening naast het grid en werd het
  // model geweigerd). Gridlijnen x: 0, 500, 1000, 1300, 1500, 2000, 2200,
  // 2500, 3000, 3500, 4000 → 10 vakken ([1000,1300] en [1300,1500] elk 1 deel,
  // [2000,2200] 1 deel); z: [0,900] 2 delen (450), [900,2100] 2 delen (600),
  // [2100,3000] 2 delen (450) → 6 vakken; 60 vakken − 3 × 2 in de opening = 54.
  const opB = rect(1300, 900, 2200, 2100);
  const rB = eenGeval(wandMetOpening([opB], "vierhoeken"));
  const elsB = elementen(rB);
  checkTrue("(b) opening naast de gridposities: 54 vierhoeken (10 × 6 − 6)", elsB.length === 54, `${elsB.length}`);
  const knopenBx = new Set(elsB.flatMap((el) => el.corners.map((c) => Math.round(c.x))));
  checkTrue("(b) de opleggingsknopen op x = 0, 500, …, 4000 zijn meshknopen gebleven",
    [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000].every((x) => knopenBx.has(x)));
  checkTrue("(b) geen elementzwaartepunt in de opening", elsB.every((el) => !puntInPolygoon(zwaartepunt(el).x, zwaartepunt(el).z, opB)));
  const knopenB = new Set(elsB.flatMap((el) => el.corners.map((c) => `${Math.round(c.x)},${Math.round(c.z)}`)));
  checkTrue("(b) elke openingshoek is een meshknoop", opB.every((p) => knopenB.has(`${p.x},${p.z}`)));
  checkRel("(b) ΣRz = −400 kN", reactieSom(rB, wandMetOpening([opB]).nodes).rz, -SIGMA * T * 4000, 1e-9);
  // (c) Twee openingen, beide typen: dezelfde reacties.
  const twee = [rect(500, 500, 1500, 1500), rect(2500, 1500, 3500, 2500)];
  const rQ = eenGeval(wandMetOpening(twee, "vierhoeken"));
  const rD = eenGeval(wandMetOpening(twee, "driehoeken"));
  checkTrue("(c) twee openingen: 48 − 8 = 40 vierhoeken / 80 driehoeken", elementen(rQ).length === 40 && elementen(rD).length === 80);
  checkRel("(c) twee openingen: ΣRz gelijk op beide typen en = −400 kN", reactieSom(rQ, wandMetOpening(twee).nodes).rz + reactieSom(rD, wandMetOpening(twee).nodes).rz, -2 * SIGMA * T * 4000, 1e-9);
  // (d) Randstaaf langs de bovenrand wordt op ALLE gridlijnen gesplitst — ook
  // de extra lijnen door de openingsranden (1300 en 2200): anders zou de staaf
  // tussen twee plaatknopen los van de plaat lopen. De staaf krijgt 9 delen,
  // en de lasten op de staaf komen als reacties beneden aan (statica).
  const mi = wandMetOpening([opB], "vierhoeken", {
    beams: [{ id: 1, from: 10, to: 11, material: "S235", profile: "HEA160" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }],
    edgeLoads: [],
  });
  const rS = eenGeval(mi);
  const st = rS.elements.get(1);
  // Gridlijnen x: 0, 500, 1000, 1300, 1500, 2000, 2200, 2500, 3000, 3500, 4000 → 10 delen × 21 stations.
  checkTrue("(d) randstaaf op de bovenrand: 10 deelstukken × 21 stations, L = 4000", !!st && st.stations_mm.length === 210 && Math.abs(st.L_mm - 4000) < 1e-9, st ? `${st.stations_mm.length} stations, L = ${st.L_mm}` : "geen staafresultaat");
  checkRel("(d) staaflast −10 kN/m over 4 m → ΣRz = −40 kN", reactieSom(rS, mi.nodes).rz, 40000, 1e-9);
  // Zonder de splitsing op 1300/2200 zou de staaf daar niet aan de plaat
  // hangen; de gridknoop op x = 1300 ligt dan zonder staafknoop. Het bewijs:
  // een puntlast op de staaf op x = 1300 (frac 0,325) komt als plaatlast bij
  // de opleggingen aan met ΣRz = P, en de staafknoop deelt daar de verplaatsing
  // met de plaat (kinematisch gekoppeld of gedeeld — beide geven evenwicht).
  const mi2 = wandMetOpening([opB], "vierhoeken", {
    beams: [{ id: 1, from: 10, to: 11, material: "S235", profile: "HEA160" }],
    beamPointLoads: [{ beamId: 1, posFrac: 0.325, fz: -5000, caseId: 1 }],
    edgeLoads: [],
  });
  checkRel("(d) puntlast op de staaf boven een openingsgridlijn: ΣRz = 5 kN", reactieSom(eenGeval(mi2), mi2.nodes).rz, 5000, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Cirkelvormige opening (16-hoek) onder trek: spanningsconcentratie richting 3");
{
  const B = 4000, C = { x: 2000, z: 2000 }, R = 200;
  const HOEKEN = rect(0, 0, B, B);
  const N16 = 16;
  const gat = Array.from({ length: N16 }, (_, k) => {
    const a = (2 * Math.PI * k) / N16;
    return { x: +(C.x + R * Math.cos(a)).toFixed(6), z: +(C.z + R * Math.sin(a)).toFixed(6) };
  });
  /**
   * O-grid: `m` stralen per gatzijde (N16·m stralen), `lagen` lagen van het
   * gat naar de buitenrand, geometrisch verdicht naar het gat (ratio 1,35).
   * Buitenpunt = snijpunt van de straal met het vierkant. De stralen op
   * 45°, 135°, 225° en 315° raken precies de hoeken van het vierkant.
   */
  function oGrid(m, lagen, meshType) {
    const nRay = N16 * m, ratio = 1.35;
    const s = Array.from({ length: lagen + 1 }, (_, j) => (ratio ** j - 1) / (ratio ** lagen - 1));
    const points = [];
    for (let k = 0; k < nRay; k++) {
      const a = (2 * Math.PI * k) / nRay;
      // Gatpunt: op de zijde van de 16-hoek (lineair tussen twee hoekpunten).
      const v = Math.floor(k / m), t = (k % m) / m;
      const g0 = gat[v], g1 = gat[(v + 1) % N16];
      const h = { x: g0.x + t * (g1.x - g0.x), z: g0.z + t * (g1.z - g0.z) };
      const d = (B / 2) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const o = { x: +(C.x + d * Math.cos(a)).toFixed(6), z: +(C.z + d * Math.sin(a)).toFixed(6) };
      for (let j = 0; j <= lagen; j++) {
        points.push({ x: h.x + s[j] * (o.x - h.x), z: h.z + s[j] * (o.z - h.z) });
      }
    }
    const idx = (k, j) => (k % nRay) * (lagen + 1) + j;
    const quads = [];
    for (let j = 0; j < lagen; j++) for (let k = 0; k < nRay; k++) {
      // Tegen de klok in (x rechts, z omhoog): binnen k → binnen k+1 → buiten k+1 → buiten k.
      quads.push([idx(k, j), idx(k + 1, j), idx(k + 1, j + 1), idx(k, j + 1)]);
    }
    const opRand = (a, b) => {
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      return points.map((p, i) => ({ i, t: ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / L,
        d: Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / L }))
        .filter((q) => q.d < 1e-3 && q.t > -1e-3 && q.t < L + 1e-3).sort((p, q) => p.t - q.t).map((q) => q.i);
    };
    const edgeNodeIndices = HOEKEN.map((h, i) => opRand(h, HOEKEN[(i + 1) % 4]));
    const openingEdgeNodeIndices = [gat.map((g, i) => opRand(g, gat[(i + 1) % N16]))];
    const basis = { points, edgeNodeIndices, openingEdgeNodeIndices,
      signature: berekenPlaatMeshSignatuur(HOEKEN, 500, { openingen: [gat], meshType }) };
    return meshType === "vierhoeken"
      ? { ...basis, triangles: [], quads, meshSoort: "vierhoeken" }
      : { ...basis, triangles: splitsVierhoekenInDriehoeken(quads), meshSoort: "driehoeken" };
  }
  function schijf(cache, meshType, extra = {}) {
    const nodes = HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
    nodes.push({ id: 5, x: 2000, z: 0 }, { id: 6, x: 2000, z: 4000 });
    return {
      nodes, beams: [],
      // Statisch bepaald tegen starre verplaatsing; de trek is zelf in evenwicht.
      supports: [{ nodeId: 5, type: "pinned" }, { nodeId: 6, type: "xRoller" }],
      loads: [],
      plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType,
        openingen: [{ id: 1, punten: gat }], meshCache: cache }],
      edgeLoads: [
        { plateId: 1, caseId: 1, edge: "top", p: SIGMA * T, dir: "z" },
        { plateId: 1, caseId: 1, edge: "bottom", p: -SIGMA * T, dir: "z" },
      ],
      cases: [{ id: 1, name: "Q" }],
      ...extra,
    };
  }
  checkTrue("classificatie: rechthoek met 16-hoek-opening rekent NIET als raster (CDT-pad)", !plaatRekentAlsRaster(HOEKEN, [gat]));
  checkTrue("opening geldig (binnen, los van de rand)", valideerPlaatOpeningen(HOEKEN, [gat]) === null);
  const niveaus = [[1, 6], [2, 10], [4, 14]];
  const uitkomst = {};
  for (const meshType of ["vierhoeken", "driehoeken"]) {
    uitkomst[meshType] = [];
    for (const [m, lagen] of niveaus) {
      const cache = oGrid(m, lagen, meshType);
      const mi = schijf(cache, meshType);
      const r = eenGeval(mi);
      const els = elementen(r);
      // Piek: grootste σy over alle elementen — die ligt naast het gat (θ = 0°, 180°).
      let piek = -Infinity, piekEl = null;
      for (const el of els) if (el.sigmaY > piek) { piek = el.sigmaY; piekEl = el; }
      const zp = zwaartepunt(piekEl);
      // Ver van het gat: de elementen in de buitenste laag boven en onder
      // (z > 3400 of z < 600, dus r ≳ 1400 = 7·R; Kirsch wijkt daar < 1,5 % af).
      const ver = els.filter((el) => zwaartepunt(el).z > 3400 || zwaartepunt(el).z < 600);
      const gemVer = ver.reduce((s, el) => s + el.sigmaY, 0) / ver.length;
      const som = reactieSom(r, mi.nodes);
      const rAfst = Math.hypot(zp.x - C.x, zp.z - C.z);
      // Kirsch op de afstand van het piekzwaartepunt (θ = 90° t.o.v. de trek).
      const kirsch = 0.5 * (2 + (R / rAfst) ** 2 + 3 * (R / rAfst) ** 4);
      uitkomst[meshType].push({ m, lagen, n: els.length, kt: piek / SIGMA, rAfst, kirsch, gemVer, som });
      log(`    ${meshType} ${N16 * m} stralen × ${lagen} lagen (${els.length} el.): σ_max/σ = ${(piek / SIGMA).toFixed(3)} op r = ${rAfst.toFixed(1)} mm (Kirsch daar ${kirsch.toFixed(3)}), ver van het gat σy/σ = ${(gemVer / SIGMA).toFixed(4)}`);
      checkTrue(`${meshType} ${N16 * m}×${lagen}: piek ligt naast het gat (|z − 2000| < R, r < 1,5·R)`,
        Math.abs(zp.z - C.z) < R && rAfst < 1.5 * R, `zwaartepunt (${zp.x.toFixed(0)}, ${zp.z.toFixed(0)})`);
      checkRel(`${meshType} ${N16 * m}×${lagen}: ver van het gat σy = σ (±5 %)`, gemVer, SIGMA, 0.05);
      checkRel(`${meshType} ${N16 * m}×${lagen}: reacties nul (last in evenwicht)`, SIGMA * T * B + Math.abs(som.rx) + Math.abs(som.rz), SIGMA * T * B, 1e-9);
    }
    const kt = uitkomst[meshType].map((u) => u.kt);
    // Trend en richting (niet exact, zie de kop): de reeks stijgt monotoon en
    // eindigt in de buurt van 3. Boven de 3 mag: het gat is een 16-hoek, en
    // een veelhoekshoek (157,5°) concentreert iets meer dan een cirkel; de
    // CST-driehoeken geven bovendien geen zwaartepuntswaarde maar een
    // elementconstante die in een steile gradiënt boven Kirsch op het
    // zwaartepunt kan uitkomen (gemeten: 3,30 bij 64 × 14).
    checkTrue(`${meshType}: σ_max/σ stijgt bij verfijning richting 3`, kt[0] < kt[1] && kt[1] < kt[2], kt.map((v) => v.toFixed(3)).join(" → "));
    checkTrue(`${meshType}: fijnste σ_max/σ tussen 2,5 en 3,5`, kt[2] > 2.5 && kt[2] < 3.5, kt[2].toFixed(3));
    checkTrue(`${meshType}: grofste σ_max/σ ligt duidelijk onder de fijnste (verfijning is nodig, geen schijnpiek)`, kt[0] < 0.85 * kt[2]);
    checkTrue(`${meshType}: vierhoek-elementwaarde ≤ 1,07 × Kirsch op het zwaartepunt (van onderaf benaderd)`,
      meshType !== "vierhoeken" || uitkomst[meshType].every((u) => u.kt < 1.07 * u.kirsch),
      uitkomst[meshType].map((u) => `${u.kt.toFixed(3)}/${u.kirsch.toFixed(3)}`).join(", "));
  }
  // Weigering: cache met een opening maar zonder openingEdgeNodeIndices.
  const zonder = { ...oGrid(1, 6, "vierhoeken") }; delete zonder.openingEdgeNodeIndices;
  weigert("cache zonder openingEdgeNodeIndices bij een plaat met opening: beschadigd",
    () => eenGeval(schijf(zonder, "vierhoeken")), /Plaat 1: de meshcache is beschadigd — `openingEdgeNodeIndices` beschrijft 0 openingen, maar de plaat heeft er 1/);
  const half = oGrid(1, 6, "vierhoeken");
  half.openingEdgeNodeIndices = [half.openingEdgeNodeIndices[0].map((r, j) => (j === 3 ? r.slice(0, 1) : r))];
  weigert("openingsrand met maar één knoop: beschadigd", () => eenGeval(schijf(half, "vierhoeken")), /rand 4 van opening 1 heeft geen geldige lijst randknopen/);
  // MCP-route met de O-grid-cache (UI-model).
  const cache = oGrid(1, 6, "vierhoeken");
  const uiSchijf = {
    nodes: schijf(cache, "vierhoeken").nodes, beams: [],
    supports: [{ nodeId: 5, type: "pinned" }, { nodeId: 6, type: "xRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType: "vierhoeken",
      openingen: [{ id: 1, punten: gat }], meshCache: cache }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [
      { id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: SIGMA * T, qDir: "z" },
      { id: 2, type: "edgeLoad", caseId: 1, plateId: 1, edge: "bottom", q: -SIGMA * T, qDir: "z" },
    ],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const val = valideerModel(uiSchijf);
  checkTrue("poort: 16-hoek-opening met cache is geldig", val.ok === true, JSON.stringify(val.errors));
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: uiSchijf } });
  checkTrue("MCP solve met 16-hoek-opening slaagt", antw.ok === true, antw.error?.melding ?? "");
  const app = solveAllCases(bouwMultiInput(uiSchijf)).perCase.get(1);
  checkRel("MCP: reactie knoop 5 ≡ app", antw.result?.per_case?.["1"]?.reactions?.["5"]?.fz ?? NaN, app.reactions.get(5).fz / 1000, 1e-9, 1);
  const zonderCache = valideerModel({ ...uiSchijf, plates: [{ ...uiSchijf.plates[0], meshCache: undefined }] });
  checkTrue("poort: 16-hoek-opening zonder cache geweigerd (CDT nodig)",
    zonderCache.errors.some((e) => /heeft een opening die geen asgelijnde rechthoek is en rekent daarom via de CDT/.test(e)), JSON.stringify(zonderCache.errors));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Weigeringen: buiten de plaat, rakend, overlappend — poort en engine");
{
  const ui = (openingen, plaat = {}) => ({
    nodes: wandMetOpening([]).nodes, beams: [],
    supports: wandMetOpening([]).supports,
    plates: [{ id: 1, nodeIds: [1, 9, 11, 10], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
      openingen: openingen.map((p, i) => ({ id: i + 1, punten: p })), ...plaat }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qDir: "z" }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const gevallen = [
    { naam: "opening buiten de plaat", op: [rect(4500, 500, 5500, 1500)], re: /Opening 1 ligt niet binnen de plaat: hoek 1 \(4500, 500\)/ },
    { naam: "opening deels buiten (snijdt de omtrek)", op: [rect(3500, 500, 4500, 1500)], re: /Opening 1 (ligt niet binnen de plaat|snijdt rand)/ },
    { naam: "opening raakt de omtrek (5 mm)", op: [rect(500, 5, 1500, 1000)], re: /Opening 1 raakt de omtrek van de plaat: hoek 1 ligt 5 mm van rand 1/ },
    { naam: "opening op de omtrek", op: [rect(500, 0, 1500, 1000)], re: /Opening 1 (ligt niet binnen de plaat|raakt de omtrek)/ },
    { naam: "twee overlappende openingen", op: [rect(500, 500, 1500, 1500), rect(1000, 1000, 2000, 2000)], re: /Opening 1 en opening 2 (overlappen|snijden) elkaar/ },
    { naam: "twee openingen te dicht op elkaar (4 mm)", op: [rect(500, 500, 1500, 1500), rect(1504, 500, 2500, 1500)], re: /Opening 1 en opening 2 raken elkaar \(4 mm tussenruimte\)/ },
    // De veldpoort vangt twee punten al vóór de vormcontrole; modelcontrole en engine melden het via de vormregel.
    { naam: "opening met twee punten", op: [[{ x: 500, z: 500 }, { x: 1500, z: 1500 }]], re: /(Opening 1: Een plaat heeft minstens drie hoeken nodig|openingen\[0\]\.punten: verplichte array van minstens drie punten)/ },
    { naam: "opening zonder oppervlakte", op: [[{ x: 500, z: 500 }, { x: 1500, z: 500 }, { x: 2500, z: 500 }]], re: /Opening 1: De hoeken liggen \(vrijwel\) op één lijn/ },
    { naam: "opening die de hele plaat omsluit", op: [rect(-100, -100, 4100, 3100)], re: /Opening 1 ligt niet binnen de plaat/ },
  ];
  for (const g of gevallen) {
    const model = ui(g.op);
    const poort = valideerModel(model);
    checkTrue(`poort — ${g.naam}`, !poort.ok && poort.errors.some((e) => g.re.test(e)), JSON.stringify(poort.errors));
    weigert(`engine — ${g.naam}`, () => eenGeval(bouwMultiInput(model)), g.re);
  }
  // Geldig: geen bevinding, poort ok, engine rekent.
  const goed = ui([rect(1500, 1000, 2500, 2000)]);
  checkTrue("poort: geldige opening", valideerModel(goed).ok === true, JSON.stringify(valideerModel(goed).errors));
  checkTrue("engine rekent de geldige opening", elementen(eenGeval(bouwMultiInput(goed))).length === 44);
  // Vormfouten in het veld zelf (de veldpoort).
  const veld = valideerModel(ui([], { openingen: [{ id: 1, punten: [{ x: 1, z: 1 }, { x: 2, z: 1 }], vorm: "rond" }] }));
  checkTrue("veldpoort: onbekend veld in een opening geweigerd", veld.errors.some((e) => /openingen\[0\]: onbekend veld `vorm`/.test(e)), JSON.stringify(veld.errors));
  checkTrue("veldpoort: minder dan drie punten geweigerd", veld.errors.some((e) => /openingen\[0\]\.punten: verplichte array van minstens drie punten/.test(e)));
  const dubbelId = valideerModel(ui([rect(500, 500, 1000, 1000), rect(2000, 500, 2500, 1000)], { openingen: [{ id: 7, punten: rect(500, 500, 1000, 1000) }, { id: 7, punten: rect(2000, 500, 2500, 1000) }] }));
  checkTrue("poort: dubbele opening-id geweigerd", dubbelId.errors.some((e) => /opening-id 7 komt meer dan één keer voor/.test(e)), JSON.stringify(dubbelId.errors));
  // Polygoonopening in een rechthoek zonder cache: eerlijk weigeren.
  const drie = ui([[{ x: 1500, z: 1000 }, { x: 2500, z: 1000 }, { x: 2000, z: 2000 }]]);
  const poortDrie = valideerModel(drie);
  checkTrue("poort: driehoekige opening zonder cache → CDT nodig", poortDrie.errors.some((e) => /rekent daarom via de CDT, maar het CDT-rekenmesh ontbreekt/.test(e)), JSON.stringify(poortDrie.errors));
  weigert("engine: driehoekige opening zonder cache → CDT nodig", () => eenGeval(bouwMultiInput(drie)), /heeft een opening die geen asgelijnde rechthoek is en rekent daarom via de CDT/);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Projectbestand: openingen en meshType overleven de round-trip");
{
  const plaat = { id: 1, nodeIds: [1, 9, 11, 10], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
    meshType: "driehoeken", openingen: [{ id: 3, punten: rect(1500, 1000, 2500, 2000) }] };
  const text = serializeProject({
    nodes: wandMetOpening([]).nodes, beams: [], supports: [], plates: [plaat], loads: [],
    loadCases: [{ id: 1, name: "Permanent (G)", type: "dead" }],
    activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  });
  const terug = deserializeProject(text);
  checkTrue("meshType behouden", terug.plates[0].meshType === "driehoeken");
  checkTrue("openingen bit-exact", JSON.stringify(terug.plates[0].openingen) === JSON.stringify(plaat.openingen));
  const zonder = deserializeProject(serializeProject({
    nodes: wandMetOpening([]).nodes, beams: [], supports: [], loads: [],
    plates: [{ id: 1, nodeIds: [1, 9, 11, 10], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500 }],
    loadCases: [{ id: 1, name: "G", type: "dead" }], activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  }));
  checkTrue("bestand zonder de velden laadt zonder de velden", zonder.plates[0].meshType === undefined && zonder.plates[0].openingen === undefined);
  const mi = bouwMultiInput({ ...terug, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1 });
  checkTrue("mapping: openingen en meshType gaan mee naar de solver", mi.plates[0].meshType === "driehoeken" && mi.plates[0].openingen?.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] MCP-route: wand met rechthoekige opening — dezelfde reacties als de app");
{
  const model = {
    nodes: wandMetOpening([]).nodes, beams: [], supports: wandMetOpening([]).supports,
    plates: [{ id: 1, nodeIds: [1, 9, 11, 10], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
      openingen: [{ id: 1, punten: rect(1300, 900, 2200, 2100) }] }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -10, qDir: "z" }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const app = solveAllCases(bouwMultiInput(model)).perCase.get(1);
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model } });
  checkTrue("MCP solve slaagt zonder cache (rasterpad)", antw.ok === true, antw.error?.melding ?? "");
  for (const knoop of [1, 3, 5, 7, 9]) {
    checkRel(`knoop ${knoop}: MCP Rz ≡ app`, antw.result?.per_case?.["1"]?.reactions?.[String(knoop)]?.fz ?? NaN, app.reactions.get(knoop).fz / 1000, 1e-12, 1);
  }
  const som = Object.values(antw.result.per_case["1"].reactions).reduce((s, x) => s + x.fz, 0);
  checkRel("MCP: ΣRz = 40 kN", som, 40, 1e-9);
  const antwFout = verwerkVerzoek({ v: 1, id: 2, op: "solve", payload: { model: { ...model, plates: [{ ...model.plates[0], openingen: [{ id: 1, punten: rect(3500, 500, 4500, 1500) }] }] } } });
  checkTrue("MCP: opening buiten de plaat → INVOER_ONGELDIG met de reden", antwFout.ok === false && /Opening 1/.test(JSON.stringify(antwFout.error)), JSON.stringify(antwFout.error));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
