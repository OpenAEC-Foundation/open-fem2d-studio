// Taak A4 — 2e-orde (P-Δ) berekening per belastingcombinatie.
//
// Valideert dat solveAllCasesNonlinear + combineResults een écht geometrisch
// niet-lineair resultaat per COMBINATIE levert (gefactoreerde lasten samen het
// model in; geen superpositie), tegen de analytisch exacte secansoplossing
// voor een scharnier-scharnier kolom met drukkracht P en dwarslast H op halve
// hoogte:
//
//   w_2e = (H / (2·P·k)) · (tan(kL/2) − kL/2),  k² = P/EI
//   w_1e = H·L³ / (48·EI)
//
// Bij P = 0.5·P_E (P_E = π²EI/L²) is de exacte vergrotingsfactor ≈ 1.9816;
// de klassieke benadering 1/(1−P/P_E) geeft 2.0. We toetsen tegen de EXACTE
// secansoplossing met 2% tolerantie (4-elementen-discretisatie + consistente
// KG), en tegen de benadering 2.0 met 5% (documentatie-eis).
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-tweede-orde.mjs

import { execSync } from "node:child_process";

const { solveAllCases, solveAllCasesNonlinear } =
  await import("./src/components/fem/solver/engine.ts");
const { combineResults, computeEnvelope } =
  await import("./src/components/fem/solver/combinations.ts");

const E = 210000;   // N/mm²
const I = 1e8;      // mm⁴
const A = 3877;     // mm²
const L = 4000;     // mm
const EI = E * I;
const P_E = Math.PI * Math.PI * EI / (L * L);   // ≈ 1.2954e7 N

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 1) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected.toFixed(6)} (tol ${tolPct}%)`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected} (tol ${tolPct}%)`); }
}

function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}${extra ? " — " + extra : ""}`); }
  else      { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

/**
 * Scharnier-scharnier kolom (onder: pinned; boven: xRoller = horizontaal
 * gesteund, verticaal vrij), nEl elementen, drukkracht P (N, positief = druk)
 * op de topknoop en dwarslast H (N) op de middenknoop. Alles in geval 1.
 */
function kolomModel({ P = 0, H = 0, nEl = 4 } = {}) {
  const nodes = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: 0, z: (L / nEl) * i });
  const beams = [];
  for (let i = 0; i < nEl; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: nEl + 1, type: "xRoller" },
  ];
  const midNode = nEl / 2 + 1;
  const pointLoads = [];
  if (H !== 0) pointLoads.push({ nodeId: midNode, fx: H, caseId: 1 });
  if (P !== 0) pointLoads.push({ nodeId: nEl + 1, fz: -P, caseId: 1 }); // −z = druk
  return {
    input: {
      nodes, beams, supports, loads: [], pointLoads,
      cases: [{ id: 1, name: "LC1" }],
    },
    midNode,
    topNode: nEl + 1,
  };
}

function combo(factor = 1.0, id = 1) {
  return {
    id, name: `COMBO ${factor}×LC1`, type: "uls",
    formula: `${factor}·LC1`, factors: new Map([[1, factor]]),
  };
}

/** Exacte secans-vergrotingsfactor voor P>0 (druk), dwarslast op L/2. */
function ampExact(P) {
  const k = Math.sqrt(P / EI);
  const u = k * L / 2;
  const w2_over_H = (Math.tan(u) - u) / (2 * P * k);
  const w1_over_H = L * L * L / (48 * EI);
  return w2_over_H / w1_over_H;
}

const H = 10000;         // 10 kN dwars
const P05 = 0.5 * P_E;   // halve Eulerse kniklast

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: P = 0.5·P_E → vergroting ≈ exacte secansfactor (≈1.98; benadering
// 1/(1−P/P_E) = 2.0). DIT IS DE RED-TEST: het oude pad geeft ratio 1.0.
// ─────────────────────────────────────────────────────────────────────────
log(`\n[1] Kolom P=0.5·P_E (${(P05 / 1e3).toFixed(0)} kN druk) + H=10 kN op L/2`);
{
  const { input, midNode } = kolomModel({ P: P05, H });
  const c = combo(1.0);

  const lin = solveAllCases(input);
  const rLin = combineResults(c, lin.perCase);
  const w1 = Math.abs(rLin.displacements.get(midNode).ux);

  const nl = solveAllCasesNonlinear(input);
  const rNl = combineResults(c, nl.perCase);
  const w2 = Math.abs(rNl.displacements.get(midNode).ux);

  const ratio = w2 / w1;
  const exact = ampExact(P05);              // ≈ 1.9816
  log(`  w_1e = ${w1.toFixed(4)} mm, w_2e = ${w2.toFixed(4)} mm, ratio = ${ratio.toFixed(4)}`);
  check("w_1e = HL³/48EI (referentie intern kloppend)", w1, H * L ** 3 / (48 * EI), 0.5);
  check(`w_2e/w_1e = exacte secansfactor ${exact.toFixed(4)}`, ratio, exact, 2);
  check("w_2e/w_1e ≈ 1/(1−P/P_E) = 2.0 (benadering)", ratio, 2.0, 5);

  // Stations komen uit hetzelfde 2e-orde-pad: element 2 eindigt op de
  // middenknoop; |deflection[laatste]| (lokaal transversaal) = |ux(mid)|.
  const ef2 = rNl.elements.get(2);
  checkTrue("stations aanwezig op combinatieresultaat", Array.isArray(ef2?.deflection) && ef2.deflection.length === 21);
  if (ef2?.deflection?.length === 21) {
    check("station-w einde element 2 = knoop-ux midden (2e-orde)", Math.abs(ef2.deflection[20]), w2, 0.1);
  }

  // Momentvergroting (informatief + grove toets): exact M_mid = (H/2k)·tan(kL/2)
  const k = Math.sqrt(P05 / EI);
  const Mexact = (H / (2 * k)) * Math.tan(k * L / 2);
  const Mfe = Math.max(Math.abs(ef2.M_end), Math.abs(ef2.M_start));
  log(`  M_mid 2e-orde: FE=${(Mfe / 1e6).toFixed(3)} kNm, exact=${(Mexact / 1e6).toFixed(3)} kNm (1e-orde ${(H * L / 4 / 1e6).toFixed(3)} kNm)`);
  check("M_mid binnen 15% van exacte secans-M (lineaire recovery, zie beperking)", Mfe, Mexact, 15);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: P = 0 → 2e-orde-pad geeft exact het 1e-orde-resultaat (regressie)
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] P = 0 → 2e-orde ≡ 1e-orde");
{
  const { input, midNode } = kolomModel({ P: 0, H });
  const c = combo(1.0);
  const rLin = combineResults(c, solveAllCases(input).perCase);
  const rNl  = combineResults(c, solveAllCasesNonlinear(input).perCase);
  const w1 = rLin.displacements.get(midNode).ux;
  const w2 = rNl.displacements.get(midNode).ux;
  check("ux(mid) identiek", w2, w1, 1e-6);
  // ook alle stations identiek
  let worst = 0;
  for (let b = 1; b <= 4; b++) {
    const a1 = rLin.elements.get(b).bendingMoment, a2 = rNl.elements.get(b).bendingMoment;
    for (let i = 0; i < a1.length; i++) worst = Math.max(worst, Math.abs(a1[i] - a2[i]));
  }
  checkTrue(`M(x)-stations identiek (max |ΔM| = ${worst.toExponential(2)} N·mm)`, worst < 1);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: trek −P verstijft: w_2e < w_1e (≈ 1/(1+P/P_E) ≈ 0.67 bij P=0.5P_E)
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Trek P=0.5·P_E (omhoog) → verstijving");
{
  const { input, midNode } = kolomModel({ P: -P05, H }); // negatieve druk = trek
  const c = combo(1.0);
  const rLin = combineResults(c, solveAllCases(input).perCase);
  const rNl  = combineResults(c, solveAllCasesNonlinear(input).perCase);
  const w1 = Math.abs(rLin.displacements.get(midNode).ux);
  const w2 = Math.abs(rNl.displacements.get(midNode).ux);
  const ratio = w2 / w1;
  log(`  ratio = ${ratio.toFixed(4)}`);
  checkTrue("w_2e < w_1e", w2 < w1, `ratio ${ratio.toFixed(4)}`);
  checkTrue("ratio in fysisch bereik [0.55, 0.80] (≈1/(1+P/P_E)=0.667)", ratio > 0.55 && ratio < 0.80);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: P = 2·P_E → nette fout ("niet convergent … kritieke"), geen crash;
// de per-geval-1e-orde-weergave blijft wel gewoon beschikbaar.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Divergentie P = 2·P_E → duidelijke fout, geen crash");
{
  const { input, midNode } = kolomModel({ P: 2 * P_E, H });
  const c = combo(1.0);
  let nl = null, perCaseOk = false, threw = null;
  try {
    nl = solveAllCasesNonlinear(input);           // mag NIET gooien (per geval = 1e-orde)
    perCaseOk = Number.isFinite(nl.perCase.get(1)?.displacements.get(midNode)?.ux);
  } catch (e) { threw = e; }
  checkTrue("solveAllCasesNonlinear zelf gooit niet (per-geval-weergave blijft 1e-orde)", threw === null && perCaseOk);

  let comboErr = null;
  try { combineResults(c, nl.perCase); } catch (e) { comboErr = e; }
  checkTrue("combineResults gooit een fout voor de divergente combinatie", comboErr !== null);
  if (comboErr) {
    const msg = String(comboErr.message ?? comboErr);
    log(`  melding: "${msg}"`);
    checkTrue("melding noemt 'niet convergent'", /niet convergent/i.test(msg));
    checkTrue("melding noemt de kritieke (knik)waarde", /kritiek/i.test(msg));
    checkTrue("melding noemt de combinatienaam", msg.includes(c.name));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: envelope over 2e-orde-combinaties = max/min over per-combinatie-
// resultaten, géén superpositie/schaling: combo met factor 0.5 heeft een
// EIGEN (kleinere) vergrotingsfactor, dus w(0.5-combo) ≠ 0.5·w(1.0-combo).
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Envelope + bewijs géén superpositie (factor 0.5-combinatie)");
{
  const { input, midNode } = kolomModel({ P: P05, H });
  const c100 = combo(1.0, 1);
  const c050 = combo(0.5, 2);
  const nl = solveAllCasesNonlinear(input);
  const r100 = combineResults(c100, nl.perCase);
  const r050 = combineResults(c050, nl.perCase);
  const w100 = Math.abs(r100.displacements.get(midNode).ux);
  const w050 = Math.abs(r050.displacements.get(midNode).ux);
  // eigen niet-lineaire oplossing: amp(0.5·P) = exacte secans bij P/4? nee: 0.5·P05 = 0.25·P_E → amp ≈ 1.35
  const expected050 = 0.5 * (H * L ** 3 / (48 * EI)) * ampExact(0.5 * P05);
  log(`  w(1.0) = ${w100.toFixed(4)} mm, w(0.5) = ${w050.toFixed(4)} mm, 0.5·w(1.0) = ${(0.5 * w100).toFixed(4)} mm`);
  check("w(0.5-combo) = eigen 2e-orde-oplossing (0.5H·amp(0.5P))", w050, expected050, 2);
  checkTrue("w(0.5-combo) ≠ 0.5·w(1.0-combo) → geen schaling/superpositie",
    Math.abs(w050 - 0.5 * w100) > 0.02 * w100);

  const env = computeEnvelope([c100, c050], nl.perCase);
  // NB: maxDisplacement omvat ook |uz| (axiale verkorting ≈ 31.8 mm hier),
  // dus vergelijk met de maxDisplacement van het 1.0-combinatieresultaat.
  check("envelope maxDisplacement = maxDisplacement van 1.0-combo", env.maxDisplacement, r100.maxDisplacement, 0.1);
  checkTrue("envelope governing combinatie = 1.0-combo", env.maxDisplacementCombinationId === 1);
  const sp100 = Math.max(Math.abs(r100.elements.get(2).M_start), Math.abs(r100.elements.get(2).M_end));
  const envEl = env.elements.get(2);
  check("envelope M_max element 2 = M van 1.0-combo (geen superpositie)",
    Math.max(Math.abs(envEl.M_min), Math.abs(envEl.M_max)), sp100, 0.1);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5b: gefactoreerde lasten over MEERDERE gevallen: P in geval 1 (γ=1.35),
// H in geval 2 (γ=1.5). Kies P zó dat 1.35·P = 0.5·P_E → verwacht
// w = 1.5·(HL³/48EI)·amp_exact(0.5·P_E).
// ─────────────────────────────────────────────────────────────────────────
log("\n[5b] Combinatie 1.35×LC1(P) + 1.5×LC2(H) — gefactoreerde opbouw");
{
  const Pchar = P05 / 1.35;
  const nEl = 4, midNode = 3, topNode = 5;
  const nodes = [], beams = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: 0, z: (L / nEl) * i });
  for (let i = 0; i < nEl; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
  const input = {
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: topNode, type: "xRoller" }],
    loads: [],
    pointLoads: [
      { nodeId: topNode, fz: -Pchar, caseId: 1 },
      { nodeId: midNode, fx: H, caseId: 2 },
    ],
    cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }],
  };
  const c = {
    id: 9, name: "ULS 1.35G+1.5Q", type: "uls", formula: "1.35G+1.5Q",
    factors: new Map([[1, 1.35], [2, 1.5]]),
  };
  const nl = solveAllCasesNonlinear(input);
  const r = combineResults(c, nl.perCase);
  const w = Math.abs(r.displacements.get(midNode).ux);
  const expected = 1.5 * (H * L ** 3 / (48 * EI)) * ampExact(P05);
  check("w(mid) = 1.5H·amp(1.35P) — factoren per geval correct toegepast", w, expected, 2);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: geometrische stijfheid SAMEN met de scharnieren gecondenseerd
//
// Tot september 2026 werd eerst Ke gecondenseerd en daarna de ongecondenseerde
// Kg opgeteld. Op het losgelaten DOF bleef dan een fictieve rotatiestijfheid
// 2·N·L/15 staan. Gemeten gevolg: een pendelkolom met het scharnier op haar
// top gaf P_cr = 934 kN waar hetzelfde scharnier op het regeleind 1317 kN gaf;
// op de scharnierknoop stond een fictief moment van 56 kNm; het steunmoment
// van een doorgaande ligger boven een gedrukte pendelkolom was 6 % te gunstig.
//
// De referenties hieronder zijn ANALYTISCH, niet uit de motor:
//  (a) Een pendelkolom (scharnier-scharnier) onder P met een zijdelingse veer k
//      op de top: de zwaaivorm is de rechte koorde en de pendel drukt met
//      exact P·Δ/h opzij (EN 1993-1-1 5.2.1(3): de pendel draagt via zijn
//      schuinstand). Dus u = H/(k − P/h) en P_cr = k·h, onafhankelijk van EI en
//      van de plek van het scharnier.
//  (b) Een scharnier op de pendeltop en hetzelfde scharnier op het regeleind
//      zijn fysisch hetzelfde spant: de antwoorden horen gelijk te zijn.
//  (c) Een scharnierende pendel brengt geen moment op de ligger over, en de
//      ligger is horizontaal vastgehouden: het steunmoment van de doorgaande
//      ligger is in tweede orde gelijk aan dat in eerste orde, ongeacht in
//      hoeveel stukken de pendel is geknipt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Kg vóór de scharniercondensatie: pendelkolom, scharnierplaats, steunmoment");
{
  const { solveCombinationSecondOrder } = await import("./src/components/fem/solver/engine.ts");
  const Ep = 210000, Ap = 3877, Ip = 1.673e7, h = 4000, b = 6000;
  const c1 = (f, extra = []) => ({
    id: 1, name: "C", type: "uls", formula: "", factors: new Map([[1, f], ...extra]),
  });

  // (a) pendel + veer. De veer is een horizontale dummystaaf met EA/L = 100 N/mm
  // naar een ingeklemde knoop; haar buigstijfheid werkt verticaal en telt
  // voor de zwaai niet mee: k = 100 N/mm exact. I van de dummy is klein
  // (100 mm⁴): groter koppelt haar buiging de pendelverkorting (knoop 2 zakt
  // ~1 mm) via de topknooprotatie aan een eerste-orde zwaai van de pendel
  // (gemeten 0,4 % bij 1000 mm⁴); kleiner laat de topknooprotatie zo slap dat
  // de stabiliteitscontrole die pivot afkeurt. De variant met het scharnier aan de voet heeft
  // een ingeklemde voetknoop (op een scharnieroplegging zou de knooprotatie
  // zelf vrij zijn en het stelsel terecht singulier).
  {
    const Ad = 100 * 1000 / Ep, Id = 100;
    const k = 100;
    const varianten = [
      ["scharnier op de top, 1 element", [{ id: 1, from: 1, to: 2, E: Ep, A: Ap, I: Ip, releases: { endRy: true } }], [], "pinned"],
      ["scharnier aan de voet, 1 element", [{ id: 1, from: 1, to: 2, E: Ep, A: Ap, I: Ip, releases: { startRy: true } }], [], "fixed"],
      ["scharnier op de top, 4 elementen",
        [1, 2, 3, 4].map((i) => ({ id: i, from: i === 1 ? 1 : 10 + i - 1, to: i === 4 ? 2 : 10 + i, E: Ep, A: Ap, I: Ip,
          ...(i === 4 ? { releases: { endRy: true } } : {}) })),
        [{ id: 11, x: 0, z: 1000 }, { id: 12, x: 0, z: 2000 }, { id: 13, x: 0, z: 3000 }], "pinned"],
    ];
    for (const [naam, beams, extraKnopen, voet] of varianten) {
      const inp = {
        nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: h }, { id: 5, x: 1000, z: h }, ...extraKnopen],
        beams: [...beams, { id: 9, from: 2, to: 5, E: Ep, A: Ad, I: Id }],
        supports: [{ nodeId: 1, type: voet }, { nodeId: 5, type: "fixed" }],
        cases: [{ id: 1, name: "H" }, { id: 2, name: "P" }], loads: [],
        pointLoads: [{ nodeId: 2, fx: 100, caseId: 1 }, { nodeId: 2, fz: -1e5, caseId: 2 }],
      };
      for (const deel of [0.5, 0.75]) {
        const P = deel * k * h;
        const r = solveCombinationSecondOrder(inp, c1(1, [[2, P / 1e5]]));
        check(`(a) ${naam}: u(${deel}·P_cr) = H/(k − P/h)`, r.displacements.get(2).ux, 100 / (k - P / h), 0.1);
      }
    }
  }

  // (b) hallenspant: ingeklemde kolom, regel, pendelkolom; H = 50 N constant,
  // P op de pendeltop. Referentie P_cr = k·h met k de zuivere zwaaistijfheid
  // (alleen H, eerste orde) — gemeten 329,3 N/mm → 1317 kN. De bisectie zoekt
  // de laagste P waarbij de motor het stelsel indefiniet meldt.
  {
    const spant = (scharnierOp, nPendel) => {
      const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: h }, { id: 3, x: b, z: h }, { id: 4, x: b, z: 0 }];
      const regel = { id: 2, from: 2, to: 3, E: Ep, A: Ap, I: Ip };
      if (scharnierOp === "regel") regel.releases = { endRy: true };
      const beams = [{ id: 1, from: 1, to: 2, E: Ep, A: Ap, I: Ip }, regel];
      let vorige = 4, bid = 3, nid = 5;
      for (let i = 1; i <= nPendel; i++) {
        const naar = i === nPendel ? 3 : nid;
        if (i < nPendel) nodes.push({ id: nid++, x: b, z: (h * i) / nPendel });
        const st = { id: bid++, from: vorige, to: naar, E: Ep, A: Ap, I: Ip };
        if (scharnierOp === "pendel" && i === nPendel) st.releases = { endRy: true };
        beams.push(st);
        vorige = naar;
      }
      return {
        nodes, beams, supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "pinned" }],
        cases: [{ id: 1, name: "H" }, { id: 2, name: "P" }], loads: [],
        pointLoads: [{ nodeId: 2, fx: 5000, caseId: 1 }, { nodeId: 3, fz: -1e5, caseId: 2 }],
      };
    };
    const zwaai = spant("pendel", 1);
    const r1 = combineResults(c1(1, [[2, 0]]), solveAllCases(zwaai).perCase);
    const kZwaai = 5000 / r1.displacements.get(2).ux;
    const PcrRef = kZwaai * h;
    check("(b) zuivere zwaaistijfheid van het spant (N/mm)", kZwaai, 329.32, 0.1);

    const pcr = (inp) => {
      let lo = 1, hi = 30;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        let ok = true;
        try { solveCombinationSecondOrder(inp, c1(0.01, [[2, m]])); } catch { ok = false; }
        if (ok) lo = m; else hi = m;
      }
      return lo * 1e5;
    };
    const uit = {};
    for (const [plek, n] of [["pendel", 1], ["regel", 1], ["pendel", 4]]) {
      const inp = spant(plek, n);
      const P = pcr(inp);
      uit[`${plek}${n}`] = P;
      check(`(b) P_cr met scharnier op ${plek}, pendel in ${n} stuk(ken) ≈ k·h`, P, PcrRef, 1);
      // Bij 0,5·P_cr: het moment op de scharnierknoop 3 hoort ~0 (fictief
      // moment weg), en de kolomvoet volgt uit evenwicht.
      const r = solveCombinationSecondOrder(inp, c1(1, [[2, 0.5 * PcrRef / 1e5]]));
      const regel = r.elements.get(2);
      const maxM = Math.max(...regel.bendingMoment.map(Math.abs));
      checkTrue(`(b) geen fictief moment op de scharnierknoop (${plek}, n=${n})`,
        Math.abs(regel.M_end) < 0.005 * maxM, `M_eind = ${(regel.M_end / 1e6).toFixed(3)} kNm bij max|M| ${(maxM / 1e6).toFixed(2)} kNm`);
      uit[`u${plek}${n}`] = r.displacements.get(2).ux;
    }
    check("(b) scharnier op pendeltop en op regeleind: zelfde P_cr", uit.pendel1, uit.regel1, 0.01);
    check("(b) scharnier op pendeltop en op regeleind: zelfde u(0,5·P_cr)", uit.upendel1, uit.uregel1, 0.01);
    check("(b) pendel in 1 of 4 stukken: zelfde u(0,5·P_cr)", uit.upendel4, uit.upendel1, 0.01);
  }

  // (c) doorgaande ligger (6 + 6 m) op een pendelkolom in het midden, alleen
  // het linkerveld belast, P = 1000 kN op de pendel. Steunmoment 1e orde:
  // q·L²/16 = 30·36/16 = 67,5 kNm bij starre steun; met de axiaal verende
  // pendel gemeten 62,72 kNm. In tweede orde hoort exact hetzelfde.
  {
    const ligger = (nPendel) => {
      const L6 = 6000;
      const nodes = [{ id: 1, x: 0, z: h }, { id: 2, x: L6, z: h }, { id: 3, x: 2 * L6, z: h }, { id: 4, x: L6, z: 0 }];
      const beams = [{ id: 1, from: 1, to: 2, E: Ep, A: Ap, I: 5e7 }, { id: 2, from: 2, to: 3, E: Ep, A: Ap, I: 5e7 }];
      let vorige = 4, bid = 10, nid = 100;
      for (let i = 1; i <= nPendel; i++) {
        const naar = i === nPendel ? 2 : nid;
        if (i < nPendel) nodes.push({ id: nid++, x: L6, z: (h * i) / nPendel });
        const st = { id: bid++, from: vorige, to: naar, E: Ep, A: Ap, I: Ip };
        if (i === nPendel) st.releases = { endRy: true };
        beams.push(st);
        vorige = naar;
      }
      return {
        nodes, beams,
        supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }, { nodeId: 4, type: "pinned" }],
        cases: [{ id: 1, name: "LC" }], loads: [{ beamId: 1, q: -30, caseId: 1 }],
        pointLoads: [{ nodeId: 2, fz: -1000000, caseId: 1 }],
      };
    };
    const eerste = combineResults(c1(1), solveAllCases(ligger(1)).perCase).elements.get(1).M_end;
    check("(c) steunmoment 1e orde (kNm)", eerste / 1e6, -62.72, 0.1);
    for (const n of [1, 16]) {
      const r = combineResults(c1(1), solveAllCasesNonlinear(ligger(n)).perCase);
      const links = r.elements.get(1).M_end, rechts = r.elements.get(2).M_start;
      check(`(c) steunmoment 2e orde = 1e orde, pendel in ${n} stuk(ken)`, links, eerste, 0.05);
      checkTrue(`(c) geen momentsprong op de pendelknoop (n=${n})`, Math.abs(links - rechts) < 1e3,
        `sprong ${((links - rechts) / 1e6).toFixed(4)} kNm`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: regressie — bestaande 1e-orde-tests blijven groen
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Regressie: bestaande testsuites");
for (const f of ["test-v2-stations.mjs", "test-sectie-doorvoer.mjs", "test-veldzakking.mjs"]) {
  try {
    const out = execSync(`npx tsx ${f}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const tail = out.trim().split("\n").slice(-2).join(" | ");
    checkTrue(`${f} groen`, true, tail);
  } catch (e) {
    failed++; log(`  ✗ ${f} FAALT:\n${(e.stdout ?? "") + (e.stderr ?? "")}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n════════════════════════════════════`);
log(`RESULTAAT: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
