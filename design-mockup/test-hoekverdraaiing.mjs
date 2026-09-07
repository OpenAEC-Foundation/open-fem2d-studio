// Hoekverdraaiing θ(x) = dw/dx per station in de staafuitvoer.
//
// Verifieert dat engine.ts per staaf een 21-station `rotation[]`-array (RAD,
// lokaal) levert die de EXACTE Euler-Bernoulli-helling geeft. θ wordt in
// BeamForces.ts ANALYTISCH afgeleid uit dezelfde Hermite-vormfuncties plus
// particuliere oplossing waaruit `deflection` volgt — niet numeriek
// gedifferentieerd — dus de verwachtingen hieronder zijn de gesloten formules
// uit de sterkteleer, met de afleiding in het commentaar.
//
// TEKENCONVENTIE die hier bewezen wordt: w is positief in lokale +y (voor een
// horizontale staaf omhoog), x loopt van "from" naar "to", dus θ = dw/dx is
// positief tegen de klok in. In 2D is de rotatie-DOF invariant onder de
// assentransformatie, waardoor bij een STIJVE aansluiting θ op een staafeind
// gelijk is aan de knooprotatie ry van de aanliggende knoop. Test 5 is die
// sluitcontrole; test 6 toont dat een scharnier de sprong maakt.
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-hoekverdraaiing.mjs

const { solve } = await import("./src/components/fem/solver/engine.ts");

const E = 210000;      // N/mm²
const I = 1e8;         // mm⁴
const A = 3877;        // mm²
const EI = E * I;      // N·mm²
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Grootste relatieve afwijking die deze batterij tegenkwam (voor het verslag). */
let ergsteRel = 0;

function check(name, actual, expected, tolPct = 0.5) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-12;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  const rel = Math.abs(expected) > 1e-12
    ? Math.abs(actual - expected) / Math.abs(expected)
    : Math.abs(actual - expected);
  if (Number.isFinite(rel) && rel > ergsteRel) ergsteRel = rel;
  if (ok) {
    passed++;
    log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}` +
        `  (rel ${rel.toExponential(2)})`);
  } else {
    failed++;
    log(`  ✗ ${name}: ${actual} vs ${expected.toExponential(6)}`);
  }
}

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: vrij opgelegde ligger L = 6 m onder gelijkmatig verdeelde last.
//
// Handafleiding: EI·w'''' = q met q = −10 N/mm (omlaag), scharnierend
// opgelegd. De klassieke oplossing is
//   w(x) = q·x·(L³ − 2L·x² + x³)/(24EI)
// en dus
//   θ(x) = dw/dx = q·(L³ − 6L·x² + 4x³)/(24EI).
// Daaruit:
//   θ(0)   = q·L³/(24EI)      → met q < 0 (omlaag) NEGATIEF
//   θ(L)   = q·(L³ − 6L³ + 4L³)/(24EI) = −q·L³/(24EI) → POSITIEF
//   θ(L/2) = q·(L³ − 6L·L²/4 + 4L³/8)/(24EI) = q·(L³ − 1,5L³ + 0,5L³)/… = 0
// De opgegeven controle |θ_oplegging| = qL³/24EI en θ_midden = 0.
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrij opgelegd L=6 m + q=10 kN/m ↓  →  θ_opl = ∓qL³/24EI, θ_mid = 0");
let th1 = null;   // bewaard voor de symmetrietest
{
  const L = 6000, q = 10;   // N/mm, magnitude (belasting omlaag)
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const ef = r.elements.get(1);
  checkTrue("rotation[] aanwezig (21 stations)",
    Array.isArray(ef.rotation) && ef.rotation.length === 21);
  if (Array.isArray(ef.rotation) && ef.rotation.length === 21) {
    th1 = ef.rotation;
    const thExp = q * Math.pow(L, 3) / (24 * EI);   // = 1.7857e-3 rad
    check("θ(0) = −qL³/24EI", ef.rotation[0], -thExp);
    check("θ(L) = +qL³/24EI", ef.rotation[20], +thExp);
    check("θ(L/2) = 0", ef.rotation[10], 0);
    // Tussenstation als extra bewijs dat de hele kromme klopt, niet alleen de
    // uiteinden: θ(x) = −q·(L³ − 6Lx² + 4x³)/(24EI) met q de magnitude.
    const x = 0.25 * L;
    const thQ = -q * (Math.pow(L, 3) - 6 * L * x * x + 4 * x * x * x) / (24 * EI);
    check("θ(L/4) exacte kromme", ef.rotation[5], thQ);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: vrij opgelegde ligger L = 6 m met een PUNTLAST in het midden.
//
// Handafleiding: P omlaag in het midden, oplegreacties P/2. Voor 0 ≤ x ≤ L/2
// geldt M(x) = P·x/2 (sagging) en dus EI·w'' = −M. Integreren met w(0) = 0 en
// w'(L/2) = 0 (symmetrie) geeft
//   EI·θ(x) = −P·x²/4 + C,  C = P·L²/16   (uit θ(L/2) = 0)
// zodat θ(0) = P·L²/(16EI) — met P omlaag draait het linkeruiteinde met de
// klok mee, dus in onze conventie θ(0) = −PL²/(16EI) en θ(L) = +PL²/(16EI).
//
// De puntlast grijpt op een tussenknoop aan; de staaf wordt dan door twee
// elementen gevormd en het resultaat aaneengeregen tot één stationsreeks van
// 2 × 21 = 42 punten. Het eerste en het laatste station zijn de staafeinden.
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Vrij opgelegd L=6 m + P=20 kN ↓ in het midden  →  θ_opl = ∓PL²/16EI");
{
  const L = 6000, P = 20000;   // N
  const r = solve({
    nodes: [
      { id: 1, x: 0,     z: 0 },
      { id: 2, x: L / 2, z: 0 },
      { id: 3, x: L,     z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 0, fz: -P }],
  });
  const thExp = P * L * L / (16 * EI);      // = 2.1429e-3 rad
  const e1 = r.elements.get(1);
  const e2 = r.elements.get(2);
  check("θ(0)  = −PL²/16EI", e1.rotation[0], -thExp);
  check("θ(L)  = +PL²/16EI", e2.rotation[e2.rotation.length - 1], +thExp);
  // Onder de last is de helling nul (symmetrie) en θ is daar CONTINU: beide
  // elementen moeten er dezelfde (nul-)waarde geven.
  check("θ(L/2⁻) = 0 (links van de last)", e1.rotation[e1.rotation.length - 1], 0, 0.5);
  check("θ(L/2⁺) = 0 (rechts van de last)", e2.rotation[0], 0, 0.5);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: ingeklemde console L = 4 m met een puntlast aan het eind.
//
// Handafleiding: M(x) = −P·(L − x) (hogging), EI·w'' = −M = P·(L − x).
// Integreren met θ(0) = 0 geeft EI·θ(x) = P·(L·x − x²/2), dus
//   θ(L) = P·L²/(2EI).
// Met P omlaag kantelt de tip met de klok mee → in onze conventie
//   θ(L) = −P·L²/(2EI),  en θ(x) = −P·(L·x − x²/2)/EI.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Console L=4 m + tip P=10 kN ↓  →  θ_eind = ∓PL²/2EI");
{
  const L = 4000, P = 10000;
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fx: 0, fz: -P }],
  });
  const ef = r.elements.get(1);
  const thExp = P * L * L / (2 * EI);       // = 3.8095e-3 rad
  check("θ(0) = 0 (inklemming)", ef.rotation[0], 0);
  check("θ(L) = −PL²/2EI", ef.rotation[20], -thExp);
  // Halverwege: θ(L/2) = −P(L·L/2 − L²/8)/EI = −3PL²/(8EI)
  check("θ(L/2) = −3PL²/8EI", ef.rotation[10], -3 * P * L * L / (8 * EI));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: symmetrie van geval 1 — θ is ONEVEN rond het midden.
// θ(x) = −θ(L − x) volgt direct uit w(x) = w(L − x).
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Antisymmetrie θ(x) = −θ(L−x) van geval 1 (rel. tol 1e-9)");
{
  if (!th1) { failed++; log("  ✗ geen θ-array uit test 1"); }
  else {
    const tMax = Math.max(...th1.map(Math.abs), 1e-18);
    let worst = 0;
    for (let i = 0; i <= 10; i++) {
      const d = Math.abs(th1[i] + th1[20 - i]) / tMax;
      if (d > worst) worst = d;
    }
    checkTrue(`antisymmetrisch (max rel. afwijking ${worst.toExponential(2)} ≤ 1e-9)`,
      worst <= 1e-9);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: SLUITCONTROLE op de tekenconventie — θ op de staafeinden is gelijk
// aan de knooprotatie ry van de aanliggende knoop, ook voor een SCHUINE
// staaf. Dat bewijst dat θ in dezelfde draairichting geteld wordt als ry en
// dat de omrekening van lokale naar modelassen (die er in 2D voor de
// rotatie-DOF geen is) klopt.
//
// Model: een asymmetrisch portaal met een hellende ligger onder verdeelde
// last, zodat elke staaf een andere hoek maakt en geen enkele rotatie nul is.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] θ(staafeind) = ry(knoop) — stijve aansluitingen, ook op schuine staven");
{
  const r = solve({
    nodes: [
      { id: 1, x: 0,    z: 0 },
      { id: 2, x: 0,    z: 4000 },
      { id: 3, x: 6000, z: 5500 },   // hellende ligger
      { id: 4, x: 6000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
      { id: 3, from: 3, to: 4, E, A, I },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "pinned" }],
    loads: [{ beamId: 2, q: -8 }],
    pointLoads: [{ nodeId: 2, fx: 15000, fz: 0 }],
  });
  const beams = [
    { id: 1, from: 1, to: 2 },
    { id: 2, from: 2, to: 3 },
    { id: 3, from: 3, to: 4 },
  ];
  // Referentieschaal: de grootste knooprotatie in het model. Een absolute
  // drempel daarop is eerlijker dan een relatieve tolerantie op een waarde
  // die toevallig bijna nul is.
  let ryMax = 0;
  for (const d of r.displacements.values()) ryMax = Math.max(ryMax, Math.abs(d.ry));
  checkTrue(`knooprotaties niet-triviaal (max |ry| = ${ryMax.toExponential(3)} rad)`,
    ryMax > 1e-5);
  let worst = 0;
  for (const b of beams) {
    const ef = r.elements.get(b.id);
    const th = ef.rotation;
    const dA = r.displacements.get(b.from);
    const dB = r.displacements.get(b.to);
    const eStart = Math.abs(th[0] - dA.ry);
    const eEnd = Math.abs(th[th.length - 1] - dB.ry);
    worst = Math.max(worst, eStart, eEnd);
    check(`staaf ${b.id}: θ(0) = ry(${b.from})`, th[0], dA.ry, 0.01);
    check(`staaf ${b.id}: θ(L) = ry(${b.to})`, th[th.length - 1], dB.ry, 0.01);
  }
  checkTrue(`grootste sluitfout ${worst.toExponential(2)} rad ≤ 1e-9·max|ry|-schaal`,
    worst <= Math.max(1e-12, ryMax * 1e-9));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: een SCHARNIER laat θ springen. Twee staven in lijn, in het midden
// een momentvrije aansluiting: de knoop heeft één ry, maar de twee
// staafeinden draaien verschillend. Dat verschil IS de scharnierrotatie.
//
// Model: doorgaande ligger 2 × 4 m op DRIE steunpunten (scharnier, rol, rol),
// met een momentvrije aansluiting aan het rechteruiteinde van staaf 1; alleen
// staaf 1 is belast.
//
// Handafleiding:
//  • Staaf 1 is dan aan beide einden momentvrij en tussen twee steunpunten
//    opgelegd: een gewone vrij opgelegde ligger onder q. Zijn rechter
//    eindrotatie is dus +q·L³/(24EI) (zelfde formule als test 1).
//  • Staaf 2 is onbelast en heeft aan BEIDE einden nul moment — links omdat de
//    scharnier van staaf 1 er geen moment in kan brengen en er geen andere
//    staaf aangrijpt, rechts omdat de rol geen moment opneemt. Zonder
//    kromming en zonder zakking (beide steunpunten op gelijke hoogte) is
//    θ ≡ 0 over de hele staaf, en dus ook de knooprotatie ry van knoop 2.
// De sprong in θ over het scharnier is daarmee analytisch bekend: q·L³/(24EI).
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Scharnier: θ springt t.o.v. de knooprotatie");
{
  const L = 4000, q = 10;
  const r = solve({
    nodes: [
      { id: 1, x: 0,     z: 0 },
      { id: 2, x: L,     z: 0 },
      { id: 3, x: 2 * L, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I, releases: { endRy: true } },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "zRoller" },
      { nodeId: 3, type: "zRoller" },
    ],
    loads: [{ beamId: 1, q: -q }],
  });
  const e1 = r.elements.get(1);
  const e2 = r.elements.get(2);
  const d2 = r.displacements.get(2);
  const th1Eind = e1.rotation[e1.rotation.length - 1];
  const th2Begin = e2.rotation[0];
  const thScharnier = q * Math.pow(L, 3) / (24 * EI);   // = 1.2698e-3 rad

  // Het moment moet daadwerkelijk uitgeschakeld zijn — anders bewijst de rest
  // niets over scharnieren.
  check("M aan het scharniereind = 0", e1.M_end / 1e6, 0, 0.5);
  // Staaf 2 volgt de knoop (stijve aansluiting aan díe kant).
  check("θ staaf 2 begin = ry(knoop 2) = 0", th2Begin, d2.ry, 0.01);
  // Het scharniereind van staaf 1 volgt de knoop NIET — dat is de sprong.
  check("θ staaf 1 eind = +qL³/24EI (vrij opgelegd gedrag)", th1Eind, thScharnier);
  const sprong = Math.abs(th1Eind - d2.ry);
  check("sprong over het scharnier = qL³/24EI", sprong, thScharnier);
  checkTrue(
    `θ springt: staaf 1 eind ${th1Eind.toExponential(3)} vs ry(knoop 2) ` +
    `${d2.ry.toExponential(3)} rad`,
    sprong > 1e-6,
  );
}

log(`\nGrootste relatieve afwijking in deze batterij: ${ergsteRel.toExponential(2)}`);
log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
