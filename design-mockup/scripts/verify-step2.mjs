/**
 * Step-2 verification: bundles solver TS via esbuild, then runs 4 regression checks.
 *  1. Default portal under G alone → reactions ~31.4 kN total vertical.
 *  2. Cantilever + zSpring(k=10 kN/mm) + 10 kN tip load → tip deflection ~1 mm.
 *  3. Simply-supported beam (pin+roller) with ΔT=+20K → axial reaction ≈ 0.
 *  4. Pin-pin beam, same ΔT, HEA160 → N ≈ −195 kN.
 *  5. Envelope vs single-LC sanity: envelope |M| ≥ single combo max |M|.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const SRC = resolve(__dirname, "../src/components/fem/solver");

// Bundle the solver entry to a single ESM file in a temp dir.
// Use forward slashes to keep esbuild + node import happy on Windows.
const tmp = mkdtempSync(resolve(tmpdir(), "femverify-"));
const solverPath = resolve(SRC, "solver.ts").replaceAll("\\", "/");
const comboPath  = resolve(SRC, "combinations.ts").replaceAll("\\", "/");
const entry = resolve(tmp, "entry.ts");
writeFileSync(entry,
  `export * from "${solverPath}";
   export * as combinations from "${comboPath}";\n`);

const outFile = resolve(tmp, "out.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: outFile,
  logLevel: "warning",
  loader: { ".ts": "ts" },
});

const mod = await import(pathToFileURL(outFile).href);
const { solve, solveAllCases, combinations: comboMod } = mod;
const { defaultCombinations, combineResults, computeEnvelope } = comboMod;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log("  PASS:", label, detail ?? ""); }
  else      { fail++; console.error("  FAIL:", label, detail ?? ""); }
};

// ── 1. Default portal under G alone ──────────────────────────────────────
{
  console.log("\n[1] Default portal under G (q=-5 kN/m on top beam)");
  const nodes = [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 12000, z: 0 },
    { id: 3, x: 0,     z: 5000 },
    { id: 4, x: 12000, z: 5000 },
  ];
  const beams = [
    { id: 1, from: 1, to: 3 },
    { id: 2, from: 2, to: 4 },
    { id: 3, from: 3, to: 4 },
  ];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "pinned" },
  ];
  // q = -5 kN/m = -5 N/mm
  const loads = [{ beamId: 3, q: -5 }];
  const r = solve({ nodes, beams, supports, loads });
  const r1 = r.reactions.get(1);
  const r2 = r.reactions.get(2);
  const totalFz = (r1?.fz ?? 0) + (r2?.fz ?? 0);
  const totalFzKN = totalFz / 1000;
  // Beam 3 length = 12000 mm; q=5 kN/m → total load = 60 kN, split → 30 kN each.
  console.log(`     R1 fz = ${(r1.fz/1000).toFixed(2)} kN, R2 fz = ${(r2.fz/1000).toFixed(2)} kN, total = ${totalFzKN.toFixed(2)} kN`);
  ok("Default portal vertical reaction ≈ 60 kN (within 5%)",
    Math.abs(totalFzKN - 60) < 3,
    `(expected ~60 kN, got ${totalFzKN.toFixed(2)} kN)`);
}

// ── 2. Cantilever + zSpring + tip load ───────────────────────────────────
{
  console.log("\n[2] Beam with very small bending stiffness, zSpring + 10 kN tip load");
  // To isolate the spring's contribution we make the BEAM essentially zero-
  // stiff in bending (so its 3EI/L³ contribution is negligible) but keep
  // axial stiffness reasonable. Then uz at the spring node should be exactly
  // F / k = 10000 N / 10000 N·mm⁻¹ = 1 mm.
  //
  // Layout: pin at node 1, zSpring at node 2 (3 m apart), tip load -10 kN.
  // A pin only constrains ux+uz at node 1 — node 1's ry stays free, so the
  // bar can't form a moment at the support → degenerates to a 2-pin truss
  // with a vertical spring at one end. The vertical force goes entirely
  // through the spring (no horizontal travel for a horizontal beam).
  const nodes = [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 3000,  z: 0 },
  ];
  const beams = [
    {
      id: 1, from: 1, to: 2,
      E: 210000,
      A: 3877,        // HEA160 axial
      I: 1,           // virtually zero bending stiffness (1 mm⁴ ≈ nothing)
    },
  ];
  const supports = [
    { nodeId: 1, type: "pinned" },                 // ux + uz fixed
    { nodeId: 2, type: "zSpring", k: 10000 },      // 10 kN/mm = 10000 N/mm on uz
  ];
  const pointLoads = [{ nodeId: 2, fz: -10000 /* N */ }];
  const r = solve({ nodes, beams, supports, loads: [], pointLoads });
  const d2 = r.displacements.get(2);
  console.log(`     uz at node 2 = ${d2.uz.toFixed(4)} mm`);
  const r2 = r.reactions.get(2);
  console.log(`     spring reaction fz = ${(r2.fz/1000).toFixed(3)} kN  (expected +10 kN; spring pushes up against down load)`);
  ok("Spring tip deflection ≈ -1 mm (within 1%)",
    Math.abs(d2.uz - (-1)) < 0.01,
    `(expected -1 mm, got ${d2.uz.toFixed(4)} mm)`);
  ok("Spring reaction = +10 kN", Math.abs(r2.fz - 10000) < 10);
}

// ── 3. Simply-supported beam + ΔT, axially free → axial reaction = 0 ─────
{
  console.log("\n[3] Simply-supported beam (pin+roller), ΔT=+20K → axial reaction ~ 0");
  const nodes = [
    { id: 1, x: 0,    z: 0 },
    { id: 2, x: 5000, z: 0 },
  ];
  const beams = [{ id: 1, from: 1, to: 2 }];
  // pin at left fully restrains ux/uz; xRoller at right blocks uz only → ux free → axial unconstrained.
  // Wait — xRoller in this codebase fixes uz (axis 1). So the right node can still move in ux.
  // That's what we want here: axial free.
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "xRoller" },  // fixes uz, leaves ux free
  ];
  const thermalLoads = [{ beamId: 1, deltaT: 20 }];
  const r = solve({ nodes, beams, supports, loads: [], thermalLoads });
  const r1 = r.reactions.get(1);
  const r2 = r.reactions.get(2);
  const ef = r.elements.get(1);
  console.log(`     R1 = (${(r1.fx/1000).toFixed(2)}, ${(r1.fz/1000).toFixed(2)}) kN`);
  console.log(`     R2 = (${(r2.fx/1000).toFixed(2)}, ${(r2.fz/1000).toFixed(2)}) kN`);
  console.log(`     beam N = ${(ef.N/1000).toFixed(2)} kN`);
  ok("Axial reaction at pin = 0 (no horizontal restraint reaction)",
    Math.abs(r1.fx) < 1,    // 1 N tolerance
    `(R1.fx = ${r1.fx.toFixed(3)} N)`);
  ok("Beam axial N = 0 (no internal axial force when free to expand)",
    Math.abs(ef.N) < 1,
    `(N = ${ef.N.toFixed(3)} N)`);
}

// ── 4. Pin-pin beam + ΔT, HEA160 → N ≈ −195 kN ───────────────────────────
{
  console.log("\n[4] Pin-pin beam, ΔT=+20K, HEA160 → N ≈ -195 kN");
  const nodes = [
    { id: 1, x: 0,    z: 0 },
    { id: 2, x: 5000, z: 0 },
  ];
  const beams = [{ id: 1, from: 1, to: 2 }];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "pinned" },   // both ends fully pinned (ux & uz fixed both sides)
  ];
  const thermalLoads = [{ beamId: 1, deltaT: 20 }];
  const r = solve({ nodes, beams, supports, loads: [], thermalLoads });
  const ef = r.elements.get(1);
  const r1 = r.reactions.get(1);
  const r2 = r.reactions.get(2);
  // Expected N = -E·A·α·ΔT = -210000 · 3877 · 1.2e-5 · 20 = -195400 N = -195.4 kN
  const expectedN = -210000 * 3877 * 1.2e-5 * 20;
  console.log(`     beam N = ${(ef.N/1000).toFixed(2)} kN  (expected ${(expectedN/1000).toFixed(2)} kN)`);
  console.log(`     R1.fx = ${(r1.fx/1000).toFixed(2)} kN, R2.fx = ${(r2.fx/1000).toFixed(2)} kN`);
  ok("Pin-pin thermal axial N ≈ -195 kN (within 1%)",
    Math.abs(ef.N - expectedN) / Math.abs(expectedN) < 0.01,
    `(N = ${(ef.N/1000).toFixed(2)} kN)`);
}

// ── 5. Envelope vs single combo on default portal ────────────────────────
{
  console.log("\n[5] Envelope ≥ any single combo M_max — default portal under all 8 combos");
  const nodes = [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 12000, z: 0 },
    { id: 3, x: 0,     z: 5000 },
    { id: 4, x: 12000, z: 5000 },
  ];
  const beams = [
    { id: 1, from: 1, to: 3 },
    { id: 2, from: 2, to: 4 },
    { id: 3, from: 3, to: 4 },
  ];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "pinned" },
  ];
  const loads = [
    { caseId: 1, beamId: 3, q: -5 },   // G
    { caseId: 2, beamId: 3, q: -3 },   // Q
    { caseId: 3, beamId: 3, q: -2 },   // S
  ];
  const pointLoads = [
    { caseId: 4, nodeId: 3, fx: 5000 }, // W = 5 kN horizontal at the top-left
  ];
  const cases = [
    { id: 1, name: "G" }, { id: 2, name: "Q" },
    { id: 3, name: "S" }, { id: 4, name: "W" },
  ];
  const { perCase } = solveAllCases({
    nodes, beams, supports, loads, pointLoads, cases,
  });
  const combos = defaultCombinations();
  let maxComboM = 0;
  for (const c of combos) {
    const r = combineResults(c, perCase);
    const efTop = r.elements.get(3); // top beam
    const m = Math.max(Math.abs(efTop.M_start), Math.abs(efTop.M_end));
    if (m > maxComboM) maxComboM = m;
    console.log(`     ${c.name.padEnd(28)} top |M| = ${(m/1e6).toFixed(2)} kNm`);
  }
  const env = computeEnvelope(combos, perCase);
  const envTop = env.elements.get(3);
  const envMax = Math.max(Math.abs(envTop.M_max), Math.abs(envTop.M_min));
  console.log(`     Envelope top |M| = ${(envMax/1e6).toFixed(2)} kNm`);
  ok("Envelope ≥ max single-combo |M|", envMax >= maxComboM - 1,
    `(env=${(envMax/1e6).toFixed(2)} kNm, max-combo=${(maxComboM/1e6).toFixed(2)} kNm)`);
}

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
