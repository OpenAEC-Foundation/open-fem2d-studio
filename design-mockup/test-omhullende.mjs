// Omhullende (computeEnvelope) — de extremen moeten over de VOLLEDIGE staaf
// gaan, niet over de eindwaarden.
//
// HET DEFECT DAT DEZE TEST VASTLEGT
// `ElementForces` draagt eindwaarden (N en V aan het startuiteinde, M aan
// beide knopen) én 21-stationsarrays met het werkelijke verloop. De omhullende
// bouwde zich uitsluitend uit de eindwaarden op. Een vrij opgelegde ligger
// onder een gelijkmatig verdeelde last heeft M = 0 aan beide einden, dus de
// omhullende meldde M_max = 0 terwijl het veldmoment qL²/8 is. Dezelfde fout
// trof V (die van +qL/2 naar −qL/2 loopt, maar als één waarde werd genoteerd)
// en N zodra die over de staaf varieert (axiale verdeelde last).
//
// ALLE VERWACHTINGEN ZIJN ANALYTISCH, niet uit de code overgenomen:
//   vrij opgelegd + UDL   M_veld = qL²/8 op L/2,  V = ±qL/2
//   tweevelds doorgaand   M_steun = −qL²/8,  M_veld = 9qL²/128 op 3L/8
//   kolom + axiale q      N(x) lineair van −qL (voet) naar 0 (kop)
//
// Tekenconventie: M sagging-positief, N trek-positief (zie types.ts).

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { computeEnvelope } = await import("./src/components/fem/solver/combinations.ts");

const E = 210000, A = 3877, I = 1.673e7; // HEA 160 / S235
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, actueel, verwacht, tolPct = 1) {
  const tol = Math.abs(verwacht) * tolPct / 100 + 1e-6;
  const ok = Math.abs(actueel - verwacht) <= tol;
  if (ok) { passed++; log(`  ✓ ${naam}: ${actueel.toFixed(3)} ≈ ${verwacht.toFixed(3)}`); }
  else { failed++; log(`  ✗ ${naam}: ${actueel.toFixed(3)} vs ${verwacht.toFixed(3)} (Δ=${(actueel - verwacht).toFixed(3)})`); }
}

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

/** kNm uit N·mm — de logregels lezen prettiger in bouwkundige eenheden. */
const kNm = (v) => v / 1e6;
/** kN uit N. */
const kN = (v) => v / 1e3;

const combo = (id, naam, factoren) => ({
  id, naam, name: naam, type: "uls", formula: naam,
  factors: new Map(factoren),
});

// ─────────────────────────────────────────────────────────────────────────
// [1] Vrij opgelegde ligger + UDL — het kerngeval van het defect.
//     L = 6 m, q = −10 N/mm in geval G, combinatie 1,35·G.
//     M_veld = 1,35·q·L²/8 = 1,35 · 10 · 6000²/8 = 60,75 kNm op x = 3000 mm
//     V      = ±1,35·q·L/2 = ±40,5 kN
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Vrij opgelegde ligger + UDL: de omhullende bevat het veldmoment qL²/8");
{
  const L = 6000, q = -10;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q, caseId: 1 }],
    cases: [{ id: 1, name: "Permanent" }],
  });
  const c1 = combo(1, "1,35·G", [[1, 1.35]]);
  const env = computeEnvelope([c1], r.perCase);
  const sp = env.elements.get(1);

  const Mveld = 1.35 * Math.abs(q) * L * L / 8;   // 60,75e6 N·mm
  const Vend = 1.35 * Math.abs(q) * L / 2;        // 40 500 N

  log(`  M_min…M_max = ${kNm(sp.M_min).toFixed(2)}…${kNm(sp.M_max).toFixed(2)} kNm`);
  log(`  V_min…V_max = ${kN(sp.V_min).toFixed(2)}…${kN(sp.V_max).toFixed(2)} kN`);
  check("M_max = qL²/8 (veldmoment, NIET 0)", sp.M_max, Mveld);
  check("M_min = 0 (beide einden momentvrij)", sp.M_min, 0);
  check("V_max = +qL/2", sp.V_max, Vend);
  check("V_min = −qL/2", sp.V_min, -Vend);
  check("N_min = N_max = 0 (geen axiale last)", Math.abs(sp.N_min) + Math.abs(sp.N_max), 0);
  check("governingMAbs = qL²/8", sp.governingMAbs, Mveld);
  check("governingMPos = L/2", sp.governingMPos_mm, L / 2, 0);
  checkWaar("maatgevende combinatie = de enige combinatie",
    sp.governingCombinationId === 1, `id ${sp.governingCombinationId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// [2] Twee combinaties — het VELDmoment bepaalt welke combinatie maatgevend
//     is. Op eindwaarden zijn beide combinaties 0 en blijft de eerste staan;
//     dat is precies de verkeerde uitkomst die deze test uitsluit.
//     G: q = −10, Q: q = −6, L = 6 m
//       c1 = 1,35·G          → q = 13,5  → M = 13,5·6000²/8 = 60,75 kNm
//       c2 = 1,2·G + 1,5·Q   → q = 21    → M = 21·6000²/8   = 94,5  kNm
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Twee combinaties: de maatgevende volgt uit het veldmoment");
{
  const L = 6000;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [
      { beamId: 1, q: -10, caseId: 1 },
      { beamId: 1, q: -6, caseId: 2 },
    ],
    cases: [{ id: 1, name: "Permanent" }, { id: 2, name: "Variabel" }],
  });
  const c1 = combo(1, "1,35·G", [[1, 1.35]]);
  const c2 = combo(2, "1,2·G + 1,5·Q", [[1, 1.2], [2, 1.5]]);
  const env = computeEnvelope([c1, c2], r.perCase);
  const sp = env.elements.get(1);

  const q1 = 1.35 * 10;              // 13,5 N/mm
  const q2 = 1.2 * 10 + 1.5 * 6;     // 21 N/mm
  const M2 = q2 * L * L / 8;         // 94,5e6 N·mm

  check("M_max = grootste veldmoment over de combinaties", sp.M_max, M2);
  check("V_max = q₂·L/2", sp.V_max, q2 * L / 2);
  check("V_min = −q₂·L/2", sp.V_min, -q2 * L / 2);
  check("governingMAbs = M van de zwaarste combinatie", sp.governingMAbs, M2);
  checkWaar("maatgevende combinatie = c2 (niet c1)",
    sp.governingCombinationId === 2,
    `id ${sp.governingCombinationId}; c1 geeft ${kNm(q1 * L * L / 8).toFixed(2)} kNm, ` +
    `c2 geeft ${kNm(M2).toFixed(2)} kNm`);
  check("governingMPos = L/2", sp.governingMPos_mm, L / 2, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Tweevelds doorgaande ligger — M_min én M_max zijn allebei van belang
//     en liggen op verschillende plekken. Twee gelijke velden L, UDL q:
//       steunpuntsmoment  M = −q·L²/8        (op de tussensteun)
//       veldmoment        M = +9·q·L²/128    op x = 3L/8
//     Het 21-stationsraster (stap L/20) bemonstert x = 0,35L en 0,40L en mist
//     de piek op 0,375L met 0,44 % — ruim binnen de tolerantie van 1 %, en
//     onvergelijkbaar met de 100 % die de eindwaarden misten.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Tweevelds doorgaande ligger: steunpuntsmoment én veldmoment");
{
  const L = 5000, q = -8;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "zRoller" },
      { nodeId: 3, type: "zRoller" },
    ],
    loads: [{ beamId: 1, q, caseId: 1 }, { beamId: 2, q, caseId: 1 }],
    cases: [{ id: 1, name: "Permanent" }],
  });
  const env = computeEnvelope([combo(1, "1,0·G", [[1, 1.0]])], r.perCase);
  const sp = env.elements.get(1);

  const Msteun = -Math.abs(q) * L * L / 8;          // −25e6 N·mm
  const Mveld = 9 * Math.abs(q) * L * L / 128;      // +14,0625e6 N·mm

  log(`  staaf 1: M_min…M_max = ${kNm(sp.M_min).toFixed(3)}…${kNm(sp.M_max).toFixed(3)} kNm`);
  check("M_min = −qL²/8 (tussensteunpunt)", sp.M_min, Msteun);
  check("M_max = +9qL²/128 (veld)", sp.M_max, Mveld);
  // Oplegreacties tweevelds: buiten 3qL/8, midden 2·5qL/8. Staaf 1 loopt dus
  // van V = +3qL/8 (buitensteun) naar V = −5qL/8 (tussensteun).
  check("V_max = +3qL/8 (buitensteunpunt)", sp.V_max, 3 * Math.abs(q) * L / 8);
  check("V_min = −5qL/8 (tussensteunpunt)", sp.V_min, -5 * Math.abs(q) * L / 8);
  // |M_steun| = 0,125qL² > |M_veld| = 0,0703qL² → maatgevend punt is de steun.
  check("governingMAbs = |steunpuntsmoment|", sp.governingMAbs, Math.abs(Msteun));
  check("governingMPos = einde van staaf 1 (de tussensteun)", sp.governingMPos_mm, L, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Kolom met axiale verdeelde last (eigen gewicht) — N varieert over de
//     staaf. H = 4 m, q = −5 N/mm verticaal op een verticale staaf:
//       N(voet) = −q·H = −20 kN (druk),  N(kop) = 0
//     Met factor 1,35: N_min = −27 kN, N_max = 0.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Kolom met axiale verdeelde last: N loopt over de staaf");
{
  const H = 4000, q = -5;
  const r = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: H }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [{ beamId: 1, q, qDir: "z", caseId: 1 }],
    cases: [{ id: 1, name: "Permanent" }],
  });
  const env = computeEnvelope([combo(1, "1,35·G", [[1, 1.35]])], r.perCase);
  const sp = env.elements.get(1);

  log(`  N_min…N_max = ${kN(sp.N_min).toFixed(2)}…${kN(sp.N_max).toFixed(2)} kN`);
  check("N_min = −1,35·q·H (voet, druk)", sp.N_min, -1.35 * Math.abs(q) * H);
  check("N_max = 0 (kop, onbelast uiteinde)", sp.N_max, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// [5] Terugval op de eindwaarden zonder stationsarrays. Resultaten van vóór
//     de stationsuitbreiding (of een handmatig gevoerd resultaat) dragen lege
//     arrays; de omhullende mag dan niet leeglopen maar valt terug op N/V/M
//     van de uiteinden — het oude gedrag, nu expliciet als terugvalpad.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Terugval op de eindwaarden wanneer de stationsarrays leeg zijn");
{
  const leegResultaat = {
    displacements: new Map([[1, { ux: 0, uz: -2, ry: 0 }]]),
    reactions: new Map([[1, { fx: 0, fz: 1000, my: 0 }]]),
    elements: new Map([[7, {
      N: -1000, V: 500, M_start: 2e6, M_end: -8e6,
      L_mm: 3000,
      stations_mm: [], normalForce: [], shearForce: [], bendingMoment: [],
      deflection: [], axialDisp: [],
    }]]),
    maxDisplacement: 2,
  };
  const perCase = new Map([[1, leegResultaat]]);
  const env = computeEnvelope([combo(1, "1,0·G", [[1, 1.0]])], perCase);
  const sp = env.elements.get(7);

  checkWaar("staaf komt in de omhullende voor", sp !== undefined);
  check("N_min = N_max = eindwaarde N", sp.N_min + sp.N_max, -2000);
  check("V_min = V_max = eindwaarde V", sp.V_min + sp.V_max, 1000);
  check("M_min = min(M_start, M_end)", sp.M_min, -8e6);
  check("M_max = max(M_start, M_end)", sp.M_max, 2e6);
  check("governingMAbs = grootste eindmoment", sp.governingMAbs, 8e6);
  check("governingMPos = L (het grootste eindmoment zit aan het eind)",
    sp.governingMPos_mm, 3000, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// [6] Samenhang met de rest van de keten: de omhullende mag nooit binnen het
//     krachtsverloop van een afzonderlijke combinatie liggen. Portaal met
//     vier gevallen en twee combinaties; per staaf wordt de omhullende
//     vergeleken met alle stations van alle combinaties.
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Omhullende omsluit elk stationspunt van elke combinatie (portaal)");
{
  const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
  const r = solveAllCases({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 },
      { id: 3, x: 0, z: 5000 }, { id: 4, x: 12000, z: 5000 },
    ],
    beams: [
      { id: 1, from: 1, to: 3, E, A, I },
      { id: 2, from: 3, to: 4, E, A, I },
      { id: 3, from: 4, to: 2, E, A, I },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    loads: [
      { beamId: 2, q: -5, caseId: 1 },
      { beamId: 2, q: -3, caseId: 2 },
      { beamId: 1, q: 1.5, qDir: "x", caseId: 4 },
    ],
    cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }, { id: 4, name: "W" }],
  });
  const combos = [
    combo(1, "1,35·G", [[1, 1.35]]),
    combo(2, "1,2·G + 1,5·Q + 0,9·W", [[1, 1.2], [2, 1.5], [4, 0.9]]),
  ];
  const env = computeEnvelope(combos, r.perCase);

  let omsloten = true, grootsteM = 0, grootsteCombo = 0;
  for (const c of combos) {
    const res = combineResults(c, r.perCase);
    res.elements.forEach((ef, bid) => {
      const sp = env.elements.get(bid);
      for (let i = 0; i < ef.stations_mm.length; i++) {
        const m = ef.bendingMoment[i], v = ef.shearForce[i], n = ef.normalForce[i];
        const marge = 1e-6;
        if (m < sp.M_min - marge || m > sp.M_max + marge) omsloten = false;
        if (v < sp.V_min - marge || v > sp.V_max + marge) omsloten = false;
        if (n < sp.N_min - marge || n > sp.N_max + marge) omsloten = false;
        if (Math.abs(m) > grootsteM) { grootsteM = Math.abs(m); grootsteCombo = c.id; }
      }
    });
  }
  checkWaar("elk N/V/M-stationspunt valt binnen de omhullende", omsloten);

  // De staaf met het absoluut grootste moment moet die combinatie ook als
  // maatgevend aanwijzen — de betekenis van governingCombinationId.
  let maatgevendeStaaf = 0, maatgevendeM = 0;
  env.elements.forEach((sp, bid) => {
    if (sp.governingMAbs > maatgevendeM) { maatgevendeM = sp.governingMAbs; maatgevendeStaaf = bid; }
  });
  check("grootste |M| in de omhullende = grootste |M| over alle stations",
    maatgevendeM, grootsteM, 0.001);
  checkWaar("die staaf wijst de juiste combinatie aan",
    env.elements.get(maatgevendeStaaf).governingCombinationId === grootsteCombo,
    `staaf ${maatgevendeStaaf}: combinatie ${env.elements.get(maatgevendeStaaf).governingCombinationId}, ` +
    `verwacht ${grootsteCombo}`);

  // En governingMAbs = max(|M_min|, |M_max|): de canvaslabel gebruikt die
  // tweede vorm en hoort dezelfde waarde te tonen als de combinatienaam die
  // ernaast staat.
  let labelGelijk = true;
  env.elements.forEach((sp) => {
    const label = Math.max(Math.abs(sp.M_min), Math.abs(sp.M_max));
    if (Math.abs(label - sp.governingMAbs) > 1e-6 * Math.max(1, label)) labelGelijk = false;
  });
  checkWaar("governingMAbs = max(|M_min|,|M_max|) — canvaslabel en combinatienaam horen bijeen",
    labelGelijk);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
