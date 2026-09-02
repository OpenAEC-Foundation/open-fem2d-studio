// Verkenning R23 — controleert de modelleerkeuzes vóór het definitieve script:
//  (a) is een scharnierende oplegging in e bruikbaar terwijl de enige staaf
//      daar een dubbel scharnier heeft (rotatie-DOF zonder stijfheid)?
//  (b) leveren de gekozen doorsneden exact EI = 12 000 kNm² en EA_ed = 24 000 kN?
//  (c) welke stationsindex hoort bij welk staafeinde?
const { solve } = await import("../src/components/fem/solver/engine.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const log = (s) => process.stdout.write(s + "\n");

for (const [mat, prof] of [["C22", "14400x100"], ["C22", "24x100"]]) {
  const s = resolveSection(mat, prof);
  log(`${mat} ${prof}: E=${s.E} A=${s.A} I=${s.I.toExponential(4)} ` +
      `EI=${(s.E * s.I / 1e9).toFixed(3)} kNm²  EA=${(s.E * s.A / 1e3).toFixed(0)} kN`);
}

const BUIG = resolveSection("C22", "14400x100");
const PEND = resolveSection("C22", "24x100");

const nodes = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 },
  { id: 4, x: 4000, z: 6000 }, { id: 5, x: 4000, z: 8000 }, { id: 6, x: 5500, z: 8000 },
  { id: 7, x: 0, z: 6000 },
];
const beams = [
  { id: 1, from: 1, to: 2, ...BUIG, endConnection: "hinge" },
  { id: 2, from: 2, to: 3, ...BUIG },
  { id: 3, from: 3, to: 4, ...BUIG },
  { id: 4, from: 4, to: 5, ...BUIG },
  { id: 5, from: 5, to: 6, ...BUIG },
  { id: 6, from: 7, to: 4, ...PEND, startConnection: "hinge", endConnection: "hinge" },
];
const loads = [
  { beamId: 2, q: 15, qDir: "x" },
  { beamId: 3, q: 15, qDir: "x" },
];
const pointLoads = [
  { nodeId: 5, fx: 20000, fz: 0 },
  { nodeId: 6, fx: 0, fz: -10000 },
  { nodeId: 3, fx: 30000, fz: 0 },
];

for (const eType of ["fixed", "pinned"]) {
  log(`\n=== oplegging in e = "${eType}" ===`);
  try {
    const r = solve({
      nodes, beams,
      supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 7, type: eType }],
      loads, pointLoads,
    });
    const kN = (v) => v / 1000, kNm = (v) => v / 1e6;
    log(`  reactie e : fx=${kN(r.reactions.get(7).fx).toFixed(6)} kN  ` +
        `fz=${kN(r.reactions.get(7).fz).toFixed(6)} kN  my=${kNm(r.reactions.get(7).my).toFixed(6)} kNm`);
    log(`  reactie a : fx=${kN(r.reactions.get(1).fx).toFixed(6)} kN  ` +
        `fz=${kN(r.reactions.get(1).fz).toFixed(6)} kN  my=${kNm(r.reactions.get(1).my).toFixed(6)} kNm`);
    log(`  N pendel  : ${kN(r.elements.get(6).N).toFixed(6)} kN`);
    log(`  uz(g)     : ${r.displacements.get(6).uz.toFixed(6)} mm`);
    log(`  M staaf1  : start=${kNm(r.elements.get(1).bendingMoment[0]).toFixed(4)}  ` +
        `eind=${kNm(r.elements.get(1).bendingMoment[20]).toFixed(4)} kNm`);
    log(`  M staaf3  : start=${kNm(r.elements.get(3).bendingMoment[0]).toFixed(4)}  ` +
        `eind=${kNm(r.elements.get(3).bendingMoment[20]).toFixed(4)} kNm`);
    log(`  M staaf4  : start=${kNm(r.elements.get(4).bendingMoment[0]).toFixed(4)}  ` +
        `eind=${kNm(r.elements.get(4).bendingMoment[20]).toFixed(4)} kNm`);
    log(`  M staaf5  : start=${kNm(r.elements.get(5).bendingMoment[0]).toFixed(4)}  ` +
        `eind=${kNm(r.elements.get(5).bendingMoment[20]).toFixed(4)} kNm`);
    log(`  ry(e)     : ${r.displacements.get(7).ry.toExponential(4)} rad`);
  } catch (e) {
    log(`  ✗ solve faalde: ${e instanceof Error ? e.message : e}`);
  }
}

// (d) Kan ÉÉN bestand beide belastinggevallen dekken? Alleen als de verwarmde
//     staaf a-b een STAALmateriaal krijgt (α = 1,2e-5 komt uit het materiaal),
//     maar dan ligt zijn EI vast op een profiel uit de database. HEB 200 ligt
//     het dichtst bij de voorgeschreven 12 000 kNm² (11 970, 0,25 % laag).
//     Hieronder de prijs die dat kost op de zakking van g.
log("\n=== hybride: a-b in S235/HEB 200, overige staven C22 met exacte EI ===");
{
  const HEB = resolveSection("S235", "HEB200");
  log(`  HEB200: E=${HEB.E} A=${HEB.A} I=${HEB.I.toExponential(4)} ` +
      `EI=${(HEB.E * HEB.I / 1e9).toFixed(1)} kNm² EA=${(HEB.E * HEB.A / 1e3).toFixed(0)} kN`);
  const hyb = beams.map((b) => (b.id === 1 ? { ...b, ...HEB } : b));
  const rh = solve({
    nodes, beams: hyb,
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 7, type: "fixed" }],
    loads, pointLoads,
  });
  const wg = -rh.displacements.get(6).uz / 1000;
  log(`  w_g = ${wg.toFixed(9)} m  (dossier 0,019618056 · ` +
      `${(((wg - 0.019618056) / 0.019618056) * 100).toFixed(4)} %)`);
  log(`  H_e = ${(rh.reactions.get(7).fx / 1000).toFixed(6)} kN (statisch bepaald, moet exact blijven)`);
  const rh2 = solve({
    nodes, beams: hyb,
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 7, type: "fixed" }],
    loads: [], thermalLoads: [{ beamId: 1, deltaT: 40, alpha: 1.2e-5 }],
  });
  log(`  ry(c) = ${rh2.displacements.get(3).ry.toExponential(6)} rad (referentie 3,2e-4)`);
}

// Temperatuurgeval, α expliciet op 1,2e-5 (referentiewaarde)
log("\n=== belastinggeval 2: ΔT = +40 K op a-b, α = 1,2e-5 ===");
const rT = solve({
  nodes, beams,
  supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 7, type: "fixed" }],
  loads: [],
  thermalLoads: [{ beamId: 1, deltaT: 40, alpha: 1.2e-5 }],
});
log(`  ux(b) = ${rT.displacements.get(2).ux.toFixed(6)} mm  (verwacht 1,92 mm)`);
log(`  ry(c) = ${rT.displacements.get(3).ry.toExponential(6)} rad  (referentie −3,2e-4)`);
log(`  ry(b) = ${rT.displacements.get(2).ry.toExponential(6)} rad`);
log(`  ry(d) = ${rT.displacements.get(4).ry.toExponential(6)} rad`);
log(`  N pendel = ${(rT.elements.get(6).N / 1000).toExponential(3)} kN (moet ≈ 0)`);
log(`  M a = ${(rT.elements.get(1).bendingMoment[0] / 1e6).toExponential(3)} kNm (moet ≈ 0)`);
