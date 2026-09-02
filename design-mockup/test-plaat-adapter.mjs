// P2.2 — Adapter (engine.ts): platen de engine in, spanningen eruit.
// Test via de publieke engine-API (solveAllCases/solve, UI-eenheden mm/kN),
// niet rechtstreeks op de core — de kern zelf is in P0.1/P1.1 al analytisch
// bewezen.
//
// (a) TREKWAND 3×3 m, t = 20 mm, meshSize 500 mm (6×6 Quad4):
//     UI-knopen op ALLE boven- en onderrand-gridposities (test meteen het
//     knoop-hergebruik via findNodeAt), onderrand opgelegd als in
//     test-plaat-mixed ("opgelegd": alle knopen verticaal vast, middelste ook
//     horizontaal — statisch bepaald, exacte uniforme trekstand), bovenrand
//     puntlasten volgens tributary lengths met σ = 5 N/mm² (hoek 25 kN,
//     tussenknoop 50 kN, totaal 300 kN — ingevoerd in N, de canonieke
//     engine-eenheid; de kN→N-conversie zit in App.tsx):
//     → u_top = σ·h/E = 5·3000/210000 = 0,0714286 mm binnen 1%;
//     → plateElements aanwezig: 36 elementen, σy per element ≈ 5 N/mm²
//       (ranges binnen 1%), ny ≈ σ·t = 100 kN/m;
//     → ΣRz = −300 kN binnen 0,1% (evenwicht).
// (b) DIKTE ×2 (t = 40 mm), zelfde lasten → σ exact ×0,5 binnen 0,1%
//     (membraankracht n blijft gelijk: n = σ·t).
// (c) ZONDER PLATEN BIT-IDENTIEK: een portaalmodel doorloopt solveAllCases
//     met `plates` weggelaten én met `plates: []` — de resultaten zijn
//     Object.is-gelijk per waarde (zelfde codepad, analysisType "frame").
//     De 16 bestaande solver-tests bewaken de rest van de regressie.
// (d) NETTE NL-FOUTEN: gedraaide plaat → "geen asgelijnde rechthoek";
//     steunpunt naast een gridpositie → "rekenknoop"-melding;
//     meshSize 50 mm op 3×3 m (11.163 DOF's) → "te groot"-melding (±4000).
//
// Uitvoeren: npx tsx test-plaat-adapter.mjs   (vanuit design-mockup/)

const { solveAllCases, solve } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toExponential(6)} vs ${expected.toExponential(6)} (rel.fout=${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Trekwand-invoer: 3×3 m, meshSize 500 → gridposities x = 0..3000 per 500.
// UI-knopen: 7 onderrand (ids 1..7, z=0) + 7 bovenrand (ids 8..14, z=3000).
// Plaat-hoeken: [1 (BL), 7 (BR), 14 (TR), 8 (TL)].
// ─────────────────────────────────────────────────────────────────────────
const B = 3000, H = 3000, S = 500;         // mm
const SIGMA = 5;                            // N/mm²
const E_PLAAT = 210000;                     // N/mm²

/**
 * `loadThickness` bepaalt de lastgrootte (σ·t_last): default gelijk aan de
 * plaatdikte, maar voor de dikte-×2-proef blijven de LASTEN die van t=20 mm
 * terwijl de plaat t=40 mm krijgt — dan hoort σ exact te halveren.
 * LET OP eenheden: de engine-API is canoniek N en mm (zie solver/types.ts);
 * de kN→N-conversie zit in App.tsx, niet in de engine.
 */
function maakTrekwandInput(thickness, loadThickness = thickness) {
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });      // onderrand
  for (let i = 0; i <= 6; i++) nodes.push({ id: 8 + i, x: i * S, z: H });      // bovenrand
  // Onderrand: alle verticaal opgelegd (zRoller), middelste (id 4) ook x (pinned).
  const supports = nodes.slice(0, 7).map((n) =>
    n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" });
  // Bovenrand: tributary-puntlasten omhoog (trek), σ·t in N per mm rand.
  const fPerMm = SIGMA * loadThickness;     // N per mm randlengte
  const pointLoads = nodes.slice(7).map((n) => {
    const rand = n.x === 0 || n.x === B;
    return { nodeId: n.id, fz: fPerMm * (rand ? S / 2 : S), caseId: 1 };
  });
  return {
    nodes,
    beams: [],
    supports,
    loads: [],
    pointLoads,
    plates: [{
      id: 1, nodeIds: [1, 7, 14, 8],
      thickness, E: E_PLAAT, nu: 0.3, rho: 7850, meshSize: S,
    }],
    cases: [{ id: 1, name: "Permanent (G)" }],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// (a) Trekwand t = 20 mm
// ─────────────────────────────────────────────────────────────────────────
log("\n[trekwand] 3×3 m, t=20 mm, 6×6 Quad4 via solveAllCases");
{
  const input = maakTrekwandInput(20);
  const { perCase } = solveAllCases(input);
  const r = perCase.get(1);
  checkTrue("resultaat voor geval 1 aanwezig", !!r);

  const uTopVerwacht = SIGMA * H / E_PLAAT; // 0,0714286 mm
  // Alle bovenrand-UI-knopen moeten meedoen (bewijst hergebruik: een niet-
  // hergebruikte knoop zou inactief zijn en geen verplaatsing krijgen).
  for (let id = 8; id <= 14; id++) {
    checkTrue(`bovenrandknoop ${id} heeft verplaatsing`, r.displacements.has(id));
  }
  checkRel("u_top = σ·h/E (knoop 11, midden)", r.displacements.get(11)?.uz ?? 0, uTopVerwacht, 0.01);
  checkRel("maxDisplacement ≈ u_top", r.maxDisplacement, uTopVerwacht, 0.01);

  // Plaatspanningen
  checkTrue("plateElements aanwezig", Array.isArray(r.plateElements) && r.plateElements.length === 1);
  const pr = r.plateElements[0];
  checkTrue("plateId = 1", pr.plateId === 1);
  checkTrue("36 elementen (6×6 quads)", pr.elements.length === 36, `${pr.elements.length}`);
  checkRel("ranges.sigmaY.min ≈ σ", pr.ranges.sigmaY.min, SIGMA, 0.01);
  checkRel("ranges.sigmaY.max ≈ σ", pr.ranges.sigmaY.max, SIGMA, 0.01);
  checkRel("ny ≈ σ·t = 100 kN/m (element 1)", pr.elements[0].ny, SIGMA * 20, 0.01);
  checkTrue("hoekcoördinaten: 4 per quad-element", pr.elements.every((e) => e.corners.length === 4));
  const binnenPlaat = pr.elements.every((e) =>
    e.corners.every((c) => c.x >= -1 && c.x <= B + 1 && c.z >= -1 && c.z <= H + 1));
  checkTrue("hoekcoördinaten binnen de plaat (mm)", binnenPlaat);

  // Evenwicht: ΣRz over de opleggingen = −totale trekkracht (N).
  const fTot = SIGMA * B * 20; // 300.000 N
  let sumRz = 0;
  for (const [, re] of r.reactions) sumRz += re.fz;
  checkRel("ΣRz = −ΣF (evenwicht)", sumRz, -fTot, 0.001, fTot);
}

// ─────────────────────────────────────────────────────────────────────────
// (b) Dikte ×2 → σ ×0,5 (binnen 0,1%)
// ─────────────────────────────────────────────────────────────────────────
log("\n[dikte ×2] t=40 mm, zelfde lasten → σ halveert exact");
{
  // Zelfde lasten (die van t=20) op een dubbel zo dikke plaat.
  const r20 = solveAllCases(maakTrekwandInput(20)).perCase.get(1);
  const r40 = solveAllCases(maakTrekwandInput(40, 20)).perCase.get(1);
  const s20 = r20.plateElements[0];
  const s40 = r40.plateElements[0];
  checkRel("σy(40)/σy(20) = 0,5 (ranges.max)", s40.ranges.sigmaY.max / s20.ranges.sigmaY.max, 0.5, 0.001);
  checkRel("σy(40)/σy(20) = 0,5 (element 18)", s40.elements[17].sigmaY / s20.elements[17].sigmaY, 0.5, 0.001);
  checkRel("vonMises(40)/vonMises(20) = 0,5", s40.ranges.vonMises.max / s20.ranges.vonMises.max, 0.5, 0.001);
  // Membraankracht n = σ·t blijft gelijk.
  checkRel("ny(40) = ny(20) (kN/m)", s40.elements[17].ny, s20.elements[17].ny, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// (c) Zonder platen bit-identiek: `plates` weggelaten vs. `plates: []`
// ─────────────────────────────────────────────────────────────────────────
log("\n[zonder platen] plates weggelaten ≡ plates: [] (frame-pad ongewijzigd)");
{
  const portaal = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
      { id: 3, x: 0, z: 3000 }, { id: 4, x: 6000, z: 3000 },
    ],
    beams: [
      { id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "pinned" }],
    loads: [{ beamId: 3, q: -5, caseId: 1 }],
    pointLoads: [{ nodeId: 3, fx: 10, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  };
  const a = solveAllCases(portaal).perCase.get(1);
  const b = solveAllCases({ ...portaal, plates: [] }).perCase.get(1);

  let identiek = true;
  for (const [nid, d] of a.displacements) {
    const d2 = b.displacements.get(nid);
    if (!d2 || !Object.is(d.ux, d2.ux) || !Object.is(d.uz, d2.uz) || !Object.is(d.ry, d2.ry)) identiek = false;
  }
  for (const [bid, e] of a.elements) {
    const e2 = b.elements.get(bid);
    if (!e2) { identiek = false; continue; }
    for (let i = 0; i < e.bendingMoment.length; i++) {
      if (!Object.is(e.bendingMoment[i], e2.bendingMoment[i]) ||
          !Object.is(e.shearForce[i], e2.shearForce[i]) ||
          !Object.is(e.normalForce[i], e2.normalForce[i]) ||
          !Object.is(e.deflection[i], e2.deflection[i])) identiek = false;
    }
  }
  checkTrue("verplaatsingen + stationsresultaten Object.is-gelijk", identiek);
  checkTrue("geen plateElements zonder platen", a.plateElements === undefined && b.plateElements === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
// (d) Nette NL-fouten
// ─────────────────────────────────────────────────────────────────────────
log("\n[foutpaden] gedraaid / steunpunt naast grid / DOF-limiet");
{
  // Gedraaide plaat (ruit): geen asgelijnde rechthoek.
  const ruit = {
    nodes: [
      { id: 1, x: 1500, z: 0 }, { id: 2, x: 3000, z: 1500 },
      { id: 3, x: 1500, z: 3000 }, { id: 4, x: 0, z: 1500 },
    ],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }], loads: [],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500 }],
    cases: [{ id: 1, name: "G" }],
  };
  try {
    solve(ruit);
    checkTrue("gedraaide plaat geweigerd", false);
  } catch (e) {
    checkTrue("gedraaide plaat geweigerd", /asgelijnde rechthoek/.test(e.message), e.message);
  }

  // Steunpunt op een knoop naast een gridpositie (x=250 valt tussen 0 en 500).
  const input = maakTrekwandInput(20);
  input.nodes.push({ id: 99, x: 250, z: 0 });
  input.supports.push({ nodeId: 99, type: "pinned" });
  try {
    solveAllCases(input);
    checkTrue("steunpunt naast gridpositie geweigerd", false);
  } catch (e) {
    checkTrue("steunpunt naast gridpositie geweigerd", /rekenknoop/.test(e.message), e.message);
  }

  // DOF-limiet: meshSize 50 mm op 3×3 m → 61×61 knopen = 11.163 DOF's.
  const teGroot = maakTrekwandInput(20);
  teGroot.plates[0].meshSize = 50;
  try {
    solveAllCases(teGroot);
    checkTrue("DOF-limiet bewaakt", false);
  } catch (e) {
    checkTrue("DOF-limiet bewaakt", /te groot|vrijheidsgraden/.test(e.message), e.message);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
