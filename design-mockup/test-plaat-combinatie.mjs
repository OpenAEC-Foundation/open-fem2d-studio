// Plaatspanningen in combinaties: combineResults superponeert de
// COMPONENTEN (sigma-x/y, tau, nx/ny/nxy) lineair en herberekent de
// afgeleide grootheden (von Mises, hoofdspanningen, hoek) NA combinatie —
// die zijn niet lineair. Referentie: trekwand met twee gescheiden
// belastinggevallen; superpositie is exact (1e orde).
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, actual, expected, tolPct = 0.1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected.toFixed(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(6)} vs ${expected.toFixed(6)}`); }
}

// Wand 1×3 m, t=20 mm, hoekknopen als UI-knopen; randlast p in geval 1 en
// een tweede randlast in geval 2 (zelfde rand — zuiver schaalbaar geval).
const input = {
  nodes: [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 0 },
    { id: 3, x: 0, z: 3000 }, { id: 4, x: 1000, z: 3000 },
  ],
  beams: [],
  plates: [{ id: 1, nodeIds: [1, 2, 4, 3], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 250 }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
  cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }],
  loads: [],
  pointLoads: [],
  edgeLoads: [
    { plateId: 1, edge: "top", p: -10, dir: "z", caseId: 1 },
    { plateId: 1, edge: "top", p: -4, dir: "z", caseId: 2 },
  ],
};

const r = solveAllCases(input);
const p1 = r.perCase.get(1)?.plateElements?.[0];
const p2 = r.perCase.get(2)?.plateElements?.[0];
if (!p1 || !p2) { log("✗ per-geval-plaatspanningen ontbreken"); process.exit(1); }

log("\n[1] Combinatie 1,35·G + 1,5·Q superponeert componenten exact");
const combo = { id: 1, name: "ULS", type: "uls", formula: "1,35G+1,5Q", factors: new Map([[1, 1.35], [2, 1.5]]) };
const c = combineResults(combo, r.perCase);
const pc = c.plateElements?.[0];
if (!pc) { log("  ✗ combinatie heeft geen plateElements"); process.exit(1); }
passed++; log("  ✓ combinatie draagt plateElements");
check("aantal elementen gelijk", pc.elements.length, p1.elements.length, 0);
// Element-voor-element: componenten superponeren exact.
let maxAfw = 0;
for (let i = 0; i < pc.elements.length; i++) {
  for (const veld of ["sigmaX", "sigmaY", "tauXY", "nx", "ny", "nxy"]) {
    const verwacht = 1.35 * p1.elements[i][veld] + 1.5 * p2.elements[i][veld];
    maxAfw = Math.max(maxAfw, Math.abs(pc.elements[i][veld] - verwacht));
  }
}
check("max afwijking componentsuperpositie (N/mm² of kN/m)", maxAfw, 0, 0);

log("\n[2] Afgeleide grootheden herberekend uit de gecombineerde componenten");
const el = pc.elements[0];
const vmVerwacht = Math.sqrt(el.sigmaX ** 2 + el.sigmaY ** 2 - el.sigmaX * el.sigmaY + 3 * el.tauXY ** 2);
check("von Mises = f(gecombineerde componenten)", el.vonMises, vmVerwacht, 1e-6);
const midden = (el.sigmaX + el.sigmaY) / 2;
const straal = Math.hypot((el.sigmaX - el.sigmaY) / 2, el.tauXY);
check("sigma1", el.sigma1, midden + straal, 1e-6);
check("sigma2", el.sigma2, midden - straal, 1e-6);

log("\n[3] Zuiver schaalbaar geval: combinatie == (1,35 + 1,5·0,4)·basis");
// Geval 2 is exact 0,4× geval 1 (p -4 vs -10, zelfde rand) → elke component
// van de combinatie moet (1,35 + 1,5·0,4) = 1,95× geval 1 zijn.
let maxAfw2 = 0;
for (let i = 0; i < pc.elements.length; i++) {
  for (const veld of ["sigmaX", "sigmaY", "tauXY"]) {
    maxAfw2 = Math.max(maxAfw2, Math.abs(pc.elements[i][veld] - 1.95 * p1.elements[i][veld]));
  }
}
check("max afwijking t.o.v. 1,95×basis", maxAfw2, 0, 0);
// Ranges kloppen met de elementen.
const vmMax = Math.max(...pc.elements.map(e => e.vonMises));
check("range vonMises.max == elementmax", pc.ranges.vonMises.max, vmMax, 1e-9);

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
