// Sectie-doorvoer: bewijst dat per-staaf E/A/I daadwerkelijk in de solver
// aankomen — ook via het multi-LC-pad (solveAllCases). Analytische referentie:
// drie-momentenvergelijking (Clapeyron) voor een tweeveldse doorgaande ligger
// met per veld verschillende buigstijfheid, UDL alleen op veld 1:
//
//   2·M_B·(L/(E1·I1) + L/(E2·I2)) = −q·L³/(4·E1·I1)
//   ⇒  M_B = −q·L² / (8·(1 + (E1·I1)/(E2·I2)))
//
// Limietcontroles van de formule (onafhankelijk van de solver):
//   (E1·I1)/(E2·I2) = 1   → M_B = −qL²/16   (klassieke symmetrische waarde)
//   (E1·I1)/(E2·I2) → ∞   → M_B → 0         (veld 2 kan geen moment leveren)
//   (E1·I1)/(E2·I2) → 0   → M_B → −qL²/8    (veld 2 klemt de rotatie in B)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7; // HEA 160 / S235 (solver-default)
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1;
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(1)} ≈ ${expected.toFixed(1)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toFixed(1)} vs ${expected.toFixed(1)} (Δ=${(actual - expected).toFixed(1)})`); }
}

/** Tweeveldse ligger 2×L, UDL q op veld 1, per staaf eigen E/A/I. */
function tweeVelden({ L, q, E1, I1, E2, I2 }) {
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, E: E1, A: A0, I: I1 },
      { id: 2, from: 2, to: 3, E: E2, A: A0, I: I2 },
    ],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "zRoller" },
      { nodeId: 3, type: "zRoller" },
    ],
    loads: [{ beamId: 1, q, caseId: 1 }],
    cases: [{ id: 1, name: "LC1" }],
  });
  return r.perCase.get(1);
}

/** Steunpuntsmoment in B: eindmoment staaf 1 = beginmoment staaf 2. */
function steunpuntsmoment(res) {
  const b1 = res.elements.get(1), b2 = res.elements.get(2);
  return { M1eind: b1.bendingMoment[20], M2begin: b2.bendingMoment[0] };
}

const L = 6000, q = -10; // mm, N/mm (omlaag)
const Mformule = (ratio) => Math.abs(q) * L * L / (8 * (1 + ratio));

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: verschillende I per staaf (zelfde E) — steunpuntsmoment verschuift
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Tweeveldse ligger 2×6 m, UDL q=-10 N/mm alleen op veld 1 — I per staaf");
{
  // 1a: referentie, gelijke I → |M_B| = qL²/16
  const ra = tweeVelden({ L, q, E1: E0, I1: I0, E2: E0, I2: I0 });
  const { M1eind: Ma1, M2begin: Ma2 } = steunpuntsmoment(ra);
  check("1a gelijke I: |M_B| = qL²/16", Math.abs(Ma1), Mformule(1));
  check("1a continuïteit staaf 1/2", Math.abs(Ma1 - Ma2), 0);

  // 1b: veld 1 stijf (I1 = 10·I2) → |M_B| = qL²/88
  const rb = tweeVelden({ L, q, E1: E0, I1: 10 * I0, E2: E0, I2: I0 });
  const { M1eind: Mb1, M2begin: Mb2 } = steunpuntsmoment(rb);
  check("1b I1=10·I2: |M_B| = qL²/88", Math.abs(Mb1), Mformule(10));
  check("1b continuïteit staaf 1/2", Math.abs(Mb1 - Mb2), 0);

  // 1c: veld 1 slap (I1 = I2/10) → |M_B| = qL²/8.8
  const rc = tweeVelden({ L, q, E1: E0, I1: I0 / 10, E2: E0, I2: I0 });
  check("1c I1=I2/10: |M_B| = qL²/8,8", Math.abs(steunpuntsmoment(rc).M1eind), Mformule(0.1));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2 (A2): verschillende E per staaf (zelfde I) — zelfde verschuiving
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Zelfde ligger — E per staaf (I gelijk): bewijst per-staaf E (A2)");
{
  // 2a: E1 = 10·E2 → |M_B| = qL²/88 (identiek effect als I-ratio 10)
  const ra = tweeVelden({ L, q, E1: E0, I1: I0, E2: E0 / 10, I2: I0 });
  const { M1eind: Ma1, M2begin: Ma2 } = steunpuntsmoment(ra);
  check("2a E1=10·E2: |M_B| = qL²/88", Math.abs(Ma1), Mformule(10));
  check("2a continuïteit staaf 1/2", Math.abs(Ma1 - Ma2), 0);

  // 2b: E1 = E2/10 → |M_B| = qL²/8.8
  const rb = tweeVelden({ L, q, E1: E0 / 10, I1: I0, E2: E0, I2: I0 });
  check("2b E1=E2/10: |M_B| = qL²/8,8", Math.abs(steunpuntsmoment(rb).M1eind), Mformule(0.1));

  // 2c: kruiscontrole — E-ratio 10 en I-ratio 10 geven exact hetzelfde M_B
  const rc = tweeVelden({ L, q, E1: E0, I1: 10 * I0, E2: E0, I2: I0 });
  check("2c E-ratio ≡ I-ratio", Math.abs(Ma1), Math.abs(steunpuntsmoment(rc).M1eind), 0.1);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: resolveSection levert de juiste C24/96x450-grootheden
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] resolveSection(C24, 96x450) — dezelfde route als canvas- en multi-LC-pad");
{
  const sec = resolveSection("C24", "96x450");
  check("E = E_0,mean C24 (EN 338)", sec.E, 11000, 0.01);
  check("A = 96·450", sec.A, 96 * 450, 0.01);
  check("I = 96·450³/12", sec.I, (96 * 450 ** 3) / 12, 0.01);
  log(`  bron: ${sec.bron} (verwacht hout-bxh) ${sec.bron === "hout-bxh" ? "✓" : "✗"}`);
  if (sec.bron === "hout-bxh") passed++; else failed++;
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: statisch bepaald houten raamwerk (voorbeeldgeometrie) —
// krachten stijfheidsONafhankelijk, zakkingen w ∝ 1/(E·I)
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Statisch bepaald raamwerk (houten-raamwerk-geometrie): krachten gelijk, zakking schaalt");
{
  const bouw = (E, A, I) => solveAllCases({
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: 1406, z: 3000 },
      { id: 3, x: 7748, z: 3000 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    loads: [{ beamId: 2, q: -15, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  }).perCase.get(1);

  const sec = resolveSection("C24", "96x450");
  const rDefault = bouw(E0, A0, I0);          // zoals multi-LC-pad vóór A1
  const rC24     = bouw(sec.E, sec.A, sec.I); // zoals multi-LC-pad ná A1

  // Krachten: max|M| en max|V| op staaf 2 identiek (statisch bepaald systeem)
  const maxAbs = (arr) => Math.max(...arr.map(Math.abs));
  const b2d = rDefault.elements.get(2), b2c = rC24.elements.get(2);
  check("max|M| staaf 2 gelijk", maxAbs(b2c.bendingMoment), maxAbs(b2d.bendingMoment), 0.5);
  check("max|V| staaf 2 gelijk", maxAbs(b2c.shearForce), maxAbs(b2d.shearForce), 0.5);
  check("N staaf 1 gelijk", rC24.elements.get(1).N, rDefault.elements.get(1).N, 0.5);

  // Zakkingen: verschillen tussen default- en C24-doorsnede (geen exacte
  // EI-ratio: axiale flexibiliteit ~1/(EA) schaalt anders dan buiging ~1/(EI))
  const wD = Math.abs(rDefault.displacements.get(2).uz);
  const wC = Math.abs(rC24.displacements.get(2).uz);
  log(`  w_default(knoop 2) = ${wD.toFixed(3)} mm, w_C24 = ${wC.toFixed(3)} mm`);
  if (Math.abs(wC - wD) > 0.01 * Math.max(wC, wD)) { passed++; log("  ✓ zakkingen verschillen zoals verwacht"); }
  else { failed++; log("  ✗ zakkingen (vrijwel) identiek — doorsnede komt niet aan"); }

  // Exacte schalingscheck: E → 2·E (A, I gelijk) ⇒ alle verplaatsingen
  // exact gehalveerd (lineair systeem, w ∝ 1/E). Analytisch exact, geen
  // aanname over de verhouding buiging/axiaal.
  const r2E = bouw(2 * sec.E, sec.A, sec.I);
  const w2E = Math.abs(r2E.displacements.get(2).uz);
  check("w(2E) = w(E)/2", w2E, wC / 2, 0.1);
}

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
