/**
 * Solver verification tests — runs my v2 solver against known analytical
 * solutions (same conventions as v1.0's VerificationTests.ts).
 *
 *   Sign conventions used here for EXPECTED values (matching v1.0):
 *     - q positive UP, negative DOWN (gravity loads are NEGATIVE)
 *     - F_z reaction positive = upward
 *     - M positive = sagging (tension on bottom fiber)
 *     - V positive = CW rotation of element
 *
 *   The solver returns M_start/M_end in LOCAL stiffness convention. To convert
 *   to engineering sagging+: M_eng_start = -ef.M_start, M_eng_end = +ef.M_end.
 *
 * Run:   npx --yes tsx scripts/verify-solver.ts
 */
import { solve } from "../src/components/fem/solver/solver";
import type { SolverInput } from "../src/components/fem/solver/types";

const E = 210000;          // N/mm² — steel
const A = 3877;            // mm²    — HEA 160 area
const I = 1.673e7;         // mm⁴    — HEA 160 Iy

type Expected = Record<string, number>;
type Got      = Record<string, number>;

function fmt(v: number) {
  if (Math.abs(v) < 1e-3) return "0.000";
  return v.toFixed(3);
}

function checkRel(name: string, expected: number, got: number, tol = 0.01) {
  const denom = Math.max(Math.abs(expected), 1e-9);
  const err = Math.abs((got - expected) / denom);
  const pass = err < tol;
  const flag = pass ? "✓" : "✗";
  const errPct = (err * 100).toFixed(2);
  return `  ${flag} ${name.padEnd(28)} expected=${fmt(expected).padStart(14)}  got=${fmt(got).padStart(14)}  err=${errPct.padStart(6)}%`;
}

function header(title: string) {
  console.log("\n" + "═".repeat(78));
  console.log("  " + title);
  console.log("═".repeat(78));
}

// ── Test 1: Pinned + zRoller + UDL (simply supported) ───────────────────────
function test1_simplySupportedUDL() {
  header("TEST 1 — Simply supported beam (pinned + zRoller) + UDL");
  const L = 8000;            // mm
  const q = -5;              // N/mm = -5 kN/m (downward)
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: L, z: 0 },
    ],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { nodeId: 1, type: "pinned"  },
      { nodeId: 2, type: "zRoller" },
    ],
    loads: [{ beamId: 1, q }],
  };
  const r = solve(input);
  const r1 = r.reactions.get(1)!;
  const r2 = r.reactions.get(2)!;
  const ef = r.elements.get(1)!;
  const d_mid_expected = -(5 * 5 * Math.pow(L, 4)) / (384 * E * I);    // 5qL^4/384EI  (negative since q<0 ⇒ sag down)

  // Expected (analytical sagging+):
  //   R_A_z = R_B_z = +qL/2 magnitude = +20000 N upward
  //   M_eng_max at midspan = -q·L²/8 = +40,000,000 N·mm
  //   V_at_A = +qL/2 magnitude = +20000 (CW positive)
  //   V_at_B = -qL/2 = -20000
  //   M_start_eng = 0, M_end_eng = 0
  //   R_A_x = 0 (no horizontal load)
  //   R_B_x = 0 (roller has NO horizontal reaction)
  const M_eng_start = -ef.M_start;
  const M_eng_end   = +ef.M_end;
  const M_eng_mid   = -ef.M_start * 0.5 + ef.M_end * 0.5 - q * L * L / 2 * 0.25 * (-1);
  // Note: M_mid_eng = (-M_start)·(1-ξ) + (+M_end)·ξ + (-qPerp)·L²/2·ξ(1-ξ) at ξ=0.5
  // = M_eng_start·0.5 + M_eng_end·0.5 + (-qPerp)·L²/8
  const M_eng_mid_proper = M_eng_start * 0.5 + M_eng_end * 0.5 + (-q) * L * L / 8;
  const V_at_L = ef.V + q * L;

  const lines = [
    checkRel("R1.Fx",          0,           r1.fx),
    checkRel("R1.Fz",          +20000,      r1.fz),
    checkRel("R2.Fx (roller)", 0,           r2.fx),
    checkRel("R2.Fz",          +20000,      r2.fz),
    checkRel("V_start (CW+)",  +20000,      ef.V),
    checkRel("V_end (CW+)",    -20000,      V_at_L),
    checkRel("M_eng_start",    0,           M_eng_start),
    checkRel("M_eng_end",      0,           M_eng_end),
    checkRel("M_eng_midspan",  +40e6,       M_eng_mid_proper),
    checkRel("uz mid (≈)",     d_mid_expected, r.displacements.get(1)!.uz),  // node 1 uz is 0 (pinned), use disp at some interior… skip
  ];
  console.log(lines.slice(0, 9).join("\n"));
}

// ── Test 2: Cantilever + end point load ──────────────────────────────────────
function test2_cantileverPointLoad() {
  header("TEST 2 — Cantilever (fixed at left) + end point load");
  const L = 4000;            // mm
  const P = -8000;           // N (downward at end)
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: L, z: 0 },
    ],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: P }],
  };
  const r = solve(input);
  const r1 = r.reactions.get(1)!;
  const ef = r.elements.get(1)!;
  const M_eng_start = -ef.M_start;

  // Expected: at fixed end M = +P·L (sagging if P pulls up, hogging if down)
  //   For P = -8000 (down): M_at_fixed_end_eng = +(+P)·L = P·L = -8000·4000 = -32,000,000 (hogging)
  //   Wait: cantilever with downward end load, M at fixed end is NEGATIVE (hogging top fiber tension)
  //   M_at_fixed_eng = -|P|·L = -32,000,000 N·mm
  //   V at fixed end = +P (upward reaction balances) → solver V_internal = -P = +8000? Let's check.
  //   Reactions: Fz_fixed = -P = +8000 N (UP), My_fixed = +P·L = +(-8000)·4000 = -32e6 N·mm (CCW negative in std convention)
  console.log(checkRel("R1.Fz (= -P up)",   -P,                     r1.fz));
  console.log(checkRel("R1.My (= P·L)",     P * L,                  r1.my));
  console.log(checkRel("M_eng at fixed",   -Math.abs(P) * L,        M_eng_start));
  // Tip deflection: PL³/(3EI). For P = -8000 N, L = 4000 mm:
  const tip_expected = P * Math.pow(L, 3) / (3 * E * I);
  const tip_got = r.displacements.get(2)!.uz;
  console.log(checkRel("u_z at tip",        tip_expected,            tip_got));
}

// ── Test 3: Cantilever + UDL ─────────────────────────────────────────────────
function test3_cantileverUDL() {
  header("TEST 3 — Cantilever (fixed at left) + UDL");
  const L = 5000;
  const q = -6;            // -6 N/mm = -6 kN/m
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: L, z: 0 },
    ],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [{ beamId: 1, q }],
  };
  const r = solve(input);
  const r1 = r.reactions.get(1)!;
  const ef = r.elements.get(1)!;
  const M_eng_start = -ef.M_start;

  // Expected:
  //   Total load = q·L = -30000 N. Reaction Fz = -q·L = +30000 (UP)
  //   Moment at fixed end (eng): M = q·L²/2 = -6·25e6/2 = -75e6 N·mm (hogging)
  //   Reaction My_fixed = -M_at_fixed_eng = +75e6 N·mm
  const M_fixed_eng_expected = q * L * L / 2;
  const tip_expected = q * Math.pow(L, 4) / (8 * E * I);
  console.log(checkRel("R1.Fz",            -q * L,                   r1.fz));
  console.log(checkRel("M_eng at fixed",   M_fixed_eng_expected,     M_eng_start));
  console.log(checkRel("u_z at tip",       tip_expected,             r.displacements.get(2)!.uz));
}

// ── Test 4: Fixed-fixed + central point load ─────────────────────────────────
function test4_fixedFixedPointLoad() {
  header("TEST 4 — Fixed-fixed beam + central point load");
  const L = 6000;
  const P = -12000;
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0,     z: 0 },
      { id: 2, x: L / 2, z: 0 },
      { id: 3, x: L,     z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [
      { nodeId: 1, type: "fixed" },
      { nodeId: 3, type: "fixed" },
    ],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: P }],
  };
  const r = solve(input);
  const r1 = r.reactions.get(1)!;
  const r3 = r.reactions.get(3)!;

  // Expected:
  //   Reactions: Fz_each = -P/2 = +6000 (UP)
  //   Moments at fixed ends (eng): M = -P·L/8 = +12000·6000/8 = +9e6 N·mm
  //     For downward P, M_supports = -|P|·L/8 = -9e6 (hogging in eng).
  //   Tip deflection at midspan: P·L³/(192·EI)
  const M_support_eng_expected = -Math.abs(P) * L / 8;
  const tip_expected = P * Math.pow(L, 3) / (192 * E * I);
  console.log(checkRel("R1.Fz",      -P / 2,                  r1.fz));
  console.log(checkRel("R3.Fz",      -P / 2,                  r3.fz));
  console.log(checkRel("R1.My",      -M_support_eng_expected, r1.my));   // joint applies -M_eng
  console.log(checkRel("u_z midspan", tip_expected,           r.displacements.get(2)!.uz));
}

// ── Test 5: Symmetric portal frame + vertical UDL on top beam ────────────────
function test5_portalFrameUDL() {
  header("TEST 5 — Symmetric portal frame (pinned bases) + UDL on top beam");
  const H = 5000, B = 12000;
  const q = -5;       // -5 kN/m on top beam
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: B, z: 0 },
      { id: 3, x: 0, z: H },
      { id: 4, x: B, z: H },
    ],
    beams: [
      { id: 1, from: 1, to: 3, E, A, I },   // left column
      { id: 2, from: 2, to: 4, E, A, I },   // right column
      { id: 3, from: 3, to: 4, E, A, I },   // top beam
    ],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "pinned" },
    ],
    loads: [{ beamId: 3, q }],
  };
  const r = solve(input);
  const r1 = r.reactions.get(1)!;
  const r2 = r.reactions.get(2)!;

  // Expected:
  //   Total vertical load = |q|·B = 60 kN. Each support takes 30 kN UP.
  //   By symmetry: Fx_1 = -Fx_2 (opposite horizontal reactions to resist beam bending)
  //   For pinned-base portal with rigid corners + vertical load: Fx ≠ 0 (sway resistance)
  //   Sum Fx = 0 (no horizontal applied loads).
  console.log(checkRel("R1.Fz",          30000,                r1.fz));
  console.log(checkRel("R2.Fz",          30000,                r2.fz));
  console.log(checkRel("Fx symmetry",    0, r1.fx + r2.fx, 0.001));   // sum should be 0
  // No analytical expected for Fx magnitude (depends on EI ratio), just symmetry check
  console.log(`  Fx_1 = ${r1.fx.toFixed(2)} N,  Fx_2 = ${r2.fx.toFixed(2)} N  (should be opposite signs, equal magnitude)`);

  // Equilibrium check across all 3 directions
  const sumFz = r1.fz + r2.fz;
  const totalAppliedFz = q * B;
  console.log(checkRel("ΣFz balance",    -totalAppliedFz,      sumFz));
}

// ── Test 6: Roller behavior — zRoller has NO horizontal reaction ─────────────
function test6_rollerBehavior() {
  header("TEST 6 — zRoller has NO horizontal reaction (sym test)");
  const L = 6000;
  const q = -10;
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: L, z: 0 },
    ],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { nodeId: 1, type: "pinned"  },
      { nodeId: 2, type: "zRoller" },
    ],
    loads: [{ beamId: 1, q }],
  };
  const r = solve(input);
  const r2 = r.reactions.get(2)!;
  console.log(checkRel("R2.Fx (zRoller)", 0, r2.fx, 1e-6));
  console.log(checkRel("R2.Fz",           -q * L / 2, r2.fz));
}

// ── Test 7: xRoller has NO vertical reaction ─────────────────────────────────
function test7_xRollerBehavior() {
  header("TEST 7 — xRoller has NO vertical reaction");
  const L = 5000;
  const P = -5000;
  // Vertical beam, horizontal load at top → xRoller at top should only resist horizontal
  const input: SolverInput = {
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: 0, z: L },
    ],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { nodeId: 1, type: "fixed"   },
      { nodeId: 2, type: "xRoller" },
    ],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: P }],
  };
  const r = solve(input);
  const r2 = r.reactions.get(2)!;
  console.log(checkRel("R2.Fz (xRoller)", 0, r2.fz, 1e-6));
  console.log(`  R2.Fx = ${r2.fx.toFixed(2)} N (should be non-zero, resisting horizontal load)`);
}

// ── Run all tests ────────────────────────────────────────────────────────────
test1_simplySupportedUDL();
test2_cantileverPointLoad();
test3_cantileverUDL();
test4_fixedFixedPointLoad();
test5_portalFrameUDL();
test6_rollerBehavior();
test7_xRollerBehavior();
console.log("\n" + "═".repeat(78));
console.log("  Verificatie compleet");
console.log("═".repeat(78) + "\n");
