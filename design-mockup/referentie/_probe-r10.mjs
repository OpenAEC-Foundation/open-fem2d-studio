// Verkenning R10 — vaststellen welke tekenconventie de solver voor M gebruikt.
// Dit is het bewijs onder de omrekening in toets-R10.mjs:
//   solveruitvoer (M_start/M_end/bendingMoment) is SAGGING-positief, dus
//     bij de STARTknoop van een staaf:  M_bron = +M_sagging
//     bij de EINDknoop  van een staaf:  M_bron = −M_sagging
//   waarbij M_bron = het moment dat de staaf op de knoop uitoefent, tegen de
//   klok in positief (de conventie van de verplaatsingsmethode in de bron).
//
// Draaien: npx tsx referentie/_probe-r10.mjs   (vanuit design-mockup/)
const { solve } = await import("../src/components/fem/solver/engine.ts");
const log = (s) => process.stdout.write(s + "\n");

// ── [P1] Uitkraging met puntlast omlaag ────────────────────────────────────
// Inklemming links, last op de tip: het inklemmingsmoment is HOGGING, dus in
// een sagging-positieve conventie negatief.
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 1e6, I: 1e8 }],
    supports: [{ nodeId: 1, type: "fixed" }],
    pointLoads: [{ nodeId: 2, fz: -1000 }],
  });
  const e = r.elements.get(1);
  log(`[P1] uitkraging, P = 1 kN omlaag op de tip, L = 1 m → |M_inklemming| = 1 kNm`);
  log(`     M_start = ${(e.M_start / 1e6).toFixed(4)} kNm   M_end = ${(e.M_end / 1e6).toFixed(4)} kNm`);
  log(`     bendingMoment[0] = ${(e.bendingMoment[0] / 1e6).toFixed(4)}   [20] = ${(e.bendingMoment[20] / 1e6).toFixed(4)}`);
  log(`     oplegreactie my(1) = ${(r.reactions.get(1).my / 1e6).toFixed(4)} kNm`);
  log(`     ⇒ M_start = bendingMoment[0] = −1 kNm: sagging-positief, en het moment`);
  log(`       dat de staaf op knoop 1 uitoefent (tegen de klok in) is +1 kNm = +M_start.`);
}

// ── [P2] Tweezijdig ingeklemde ligger onder q ──────────────────────────────
// Verwacht: steunpuntsmomenten −qL²/12 (hogging), veldmoment +qL²/24.
{
  const q = 10, L = 4000;
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 1e6, I: 1e8 }],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const e = r.elements.get(1);
  log(`\n[P2] tweezijdig ingeklemd, q = 10 kN/m omlaag, L = 4 m`);
  log(`     qL²/12 = ${(q * L * L / 12 / 1e6).toFixed(4)} kNm   qL²/24 = ${(q * L * L / 24 / 1e6).toFixed(4)} kNm`);
  log(`     M_start = ${(e.M_start / 1e6).toFixed(4)}   midden = ${(e.bendingMoment[10] / 1e6).toFixed(4)}   M_end = ${(e.M_end / 1e6).toFixed(4)} kNm`);
  log(`     ⇒ beide staafeinden −qL²/12: bevestigt sagging-positief. Aan de EINDknoop`);
  log(`       is het moment op de knoop dan −M_end.`);
}
