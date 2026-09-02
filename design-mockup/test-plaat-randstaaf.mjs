// P2.4 — Staven langs plaatranden: de engine splitst een staaf die exact op
// een plaatrand ligt op de plaatrandknopen (1 UI-staaf → n mesh-staven) en
// rijgt de stationsresultaten weer aaneen tot één staafresultaat. De
// plaattool voegt geen auto-randstaven meer toe (FemCanvas, addPlate-tak).
//
// (1) VERWAARLOOSBARE RANDSTAAF: trekwand 3×3 m t=20 mm (opstelling en
//     tributary-lasten als test-plaat-adapter) + staaf op de bovenrand met
//     E×1e-6 (0,21 N/mm²) ≡ schijf zonder staaf binnen 0,5% (u_top én
//     σy-range). De staaf wordt gesplitst: 6 deelstukken × 21 stations =
//     126 stations, L_mm = 3000, stations monotoon niet-dalend.
// (2) STIJVE LIGGER OP EEN WAND: wand 3×3 m t=50 mm, ligger (HEA160-sectie)
//     op de bovenrand, puntlast P = 100 kN omlaag op het midden:
//     — ΣRz = P binnen 0,1% (evenwicht);
//     — w_mid ligt tussen de analytische grenzen: wand-alleen (stijfst,
//       uniforme spreiding) u = P·h/(E·t·B) = 0,009524 mm en ligger-alleen
//       (slapst, vrij opgelegd) w = P·L³/(48EI) = 16,01 mm;
//     — continuïteit op de naadstations (dubbel station per deelgrens):
//       M en w continu (de plaat grijpt niet op de rotatie aan, dus
//       momentevenwicht loopt door de staafdelen); N en V mógen springen.
// (3) STAAF NÍET OP EEN PLAATRAND: los liggertje (5–8 m, z=0, naast de wand
//     op dezelfde randlijn maar buiten de randspanne) blijft ongesplitst:
//     21 stations, L_mm = 3000. De 16 bestaande solver-tests bewaken de
//     rest (geen platen → geen splitsing, bit-identiek pad).
//
// Uitvoeren: npx tsx test-plaat-randstaaf.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

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

const B = 3000, H = 3000, S = 500;  // mm
const somRz = (r) => { let s = 0; for (const [, re] of r.reactions) s += re.fz; return s; };

/** Trekwand-basis (zie test-plaat-adapter): onder 7 knopen opgelegd, boven 7 knopen. */
function trekwandBasis(t, sigma) {
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  for (let i = 0; i <= 6; i++) nodes.push({ id: 8 + i, x: i * S, z: H });
  const supports = nodes.slice(0, 7).map((n) =>
    n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" });
  const fPerMm = sigma * t; // N/mm rand
  const pointLoads = nodes.slice(7).map((n) => {
    const rand = n.x === 0 || n.x === B;
    return { nodeId: n.id, fz: fPerMm * (rand ? S / 2 : S), caseId: 1 };
  });
  return {
    nodes, beams: [], supports, loads: [], pointLoads,
    plates: [{ id: 1, nodeIds: [1, 7, 14, 8], thickness: t, E: 210000, nu: 0.3, rho: 7850, meshSize: S }],
    cases: [{ id: 1, name: "G" }],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// (1) Verwaarloosbare randstaaf ≡ schijf zonder staaf
// ─────────────────────────────────────────────────────────────────────────
log("\n[slappe randstaaf] E×1e-6 op de bovenrand verandert niets (< 0,5%)");
{
  const SIGMA = 5, T = 20;
  const zonder = solveAllCases(trekwandBasis(T, SIGMA)).perCase.get(1);
  const met = (() => {
    const inp = trekwandBasis(T, SIGMA);
    // Randstaaf TL (8) → TR (14) met verwaarloosbare stijfheid.
    inp.beams = [{ id: 1, from: 8, to: 14, E: 210000e-6 }];
    return solveAllCases(inp).perCase.get(1);
  })();

  checkRel("u_top identiek (knoop 11)", met.displacements.get(11).uz, zonder.displacements.get(11).uz, 0.005);
  checkRel("σy-range max identiek", met.plateElements[0].ranges.sigmaY.max, zonder.plateElements[0].ranges.sigmaY.max, 0.005);
  checkRel("σy-range min identiek", met.plateElements[0].ranges.sigmaY.min, zonder.plateElements[0].ranges.sigmaY.min, 0.005);

  // Splitsing zichtbaar in het aaneengeregen staafresultaat.
  const el = met.elements.get(1);
  checkTrue("staafresultaat aanwezig", !!el);
  checkTrue("6 deelstukken × 21 stations = 126", el.stations_mm.length === 126, `${el.stations_mm.length}`);
  checkRel("L_mm totaal = 3000", el.L_mm, 3000, 1e-9);
  checkTrue("stations monotoon niet-dalend",
    el.stations_mm.every((x, i) => i === 0 || x >= el.stations_mm[i - 1] - 1e-9));
  checkRel("laatste station = 3000 mm", el.stations_mm[el.stations_mm.length - 1], 3000, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
// (2) Stijve ligger op een wand met puntlast
// ─────────────────────────────────────────────────────────────────────────
log("\n[ligger op wand] HEA160-ligger op 3×3 m wand t=50 mm, P=100 kN midden");
{
  const T = 50, P = 100000; // N
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  nodes.push({ id: 8, x: 0, z: H });      // TL
  nodes.push({ id: 9, x: B, z: H });      // TR
  nodes.push({ id: 10, x: 1500, z: H });  // midden bovenrand (gridpositie)
  const supports = nodes.slice(0, 7).map((n) =>
    n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" });
  const input = {
    nodes,
    beams: [{ id: 1, from: 8, to: 9, E: 210000, A: 3877, I: 1.673e7 }],
    supports,
    loads: [],
    pointLoads: [{ nodeId: 10, fz: -P, caseId: 1 }],
    plates: [{ id: 1, nodeIds: [1, 7, 9, 8], thickness: T, E: 210000, nu: 0.3, rho: 7850, meshSize: S }],
    cases: [{ id: 1, name: "G" }],
  };
  const r = solveAllCases(input).perCase.get(1);

  checkRel("ΣRz = P (evenwicht)", somRz(r), P, 0.001);

  // Analytische grenzen voor w_mid.
  const wWand = P * H / (210000 * T * B);                    // 0,009524 mm — stijfste
  const wLigger = P * Math.pow(B, 3) / (48 * 210000 * 1.673e7); // 16,01 mm — slapste
  const wMid = Math.abs(r.displacements.get(10).uz);
  checkTrue(`w_mid tussen wand-alleen (${wWand.toFixed(4)}) en ligger-alleen (${wLigger.toFixed(2)})`,
    wMid > wWand && wMid < wLigger, `w_mid = ${wMid.toExponential(4)} mm`);

  // Aaneengeregen resultaat + continuïteit op de deelgrenzen.
  const el = r.elements.get(1);
  checkTrue("126 stations (6 × 21)", el.stations_mm.length === 126, `${el.stations_mm.length}`);
  const maxM = Math.max(...el.bendingMoment.map(Math.abs));
  const maxW = Math.max(...el.deflection.map(Math.abs));
  let mContinu = true, wContinu = true;
  for (let i = 0; i + 1 < el.stations_mm.length; i++) {
    // Naadstation: zelfde x tweemaal (einde deel i, begin deel i+1).
    if (Math.abs(el.stations_mm[i + 1] - el.stations_mm[i]) < 1e-6) {
      if (Math.abs(el.bendingMoment[i + 1] - el.bendingMoment[i]) > 1e-4 * maxM) mContinu = false;
      if (Math.abs(el.deflection[i + 1] - el.deflection[i]) > 1e-6 * Math.max(maxW, 1e-9)) wContinu = false;
    }
  }
  checkTrue("M continu over de naden", mContinu, `max|M| = ${(maxM / 1e6).toFixed(3)} kNm`);
  checkTrue("w continu over de naden", wContinu, `max|w| = ${maxW.toExponential(3)} mm`);
  checkTrue("w_mid < wand + ligger dragen samen (kleiner dan ligger-alleen/100)",
    wMid < wLigger / 100, "de wand draagt vrijwel alles");
}

// ─────────────────────────────────────────────────────────────────────────
// (3) Staaf níet op een plaatrand blijft ongesplitst
// ─────────────────────────────────────────────────────────────────────────
log("\n[los liggertje] zelfde randlijn (z=0) maar buiten de plaatspanne → ongesplitst");
{
  const SIGMA = 5, T = 20;
  const inp = trekwandBasis(T, SIGMA);
  // Losse ligger 5–8 m op z=0 (zelfde lijn als de onderrand, maar de
  // gridposities 0..3000 liggen niet binnen deze staaf) + eigen opleggingen
  // en een q-last zodat hij meedoet in hetzelfde geval.
  inp.nodes.push({ id: 20, x: 5000, z: 0 }, { id: 21, x: 8000, z: 0 });
  inp.supports.push({ nodeId: 20, type: "pinned" }, { nodeId: 21, type: "zRoller" });
  inp.beams = [{ id: 9, from: 20, to: 21, E: 210000, A: 3877, I: 1.673e7 }];
  inp.loads = [{ beamId: 9, q: -5, caseId: 1 }]; // N/mm
  const r = solveAllCases(inp).perCase.get(1);
  const el = r.elements.get(9);
  checkTrue("staafresultaat aanwezig", !!el);
  checkTrue("21 stations (ongesplitst)", el.stations_mm.length === 21, `${el.stations_mm.length}`);
  checkRel("L_mm = 3000", el.L_mm, 3000, 1e-9);
  // Vrij opgelegde ligger onder q: M_mid = q·L²/8 = 5·3000²/8 = 5,625 kNm.
  checkRel("M_mid = q·L²/8", el.bendingMoment[10], 5 * 3000 * 3000 / 8, 0.001);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
