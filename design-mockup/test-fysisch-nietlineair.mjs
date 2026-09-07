// Fysisch niet-lineaire tweede orde: de lus tussen de segmentstijfheden van
// de rekenkern en de raamwerksolver (fase D, stap 11).
//
// WAT DEZE TEST BEWAAKT
//
//   A. De LUS zelf, met een gestuurde kern (geen Rust-binary nodig). Ronde 0
//      levert de indeling, de stijfheden gaan terug de solver in, de krachten
//      komen op het juiste segment terecht, en een geval dat niet convergeert
//      levert een fout en geen getal.
//   B. De FYSICA, met de ECHTE rekenkern via de toetsbrug-binary. Ongescheurd,
//      gescheurd, en een slanke kolom. Ontbreekt de binary, dan worden alleen
//      die controles overgeslagen — luid, met de bouwopdracht erbij.
//
// ── ANALYTISCHE REFERENTIES ────────────────────────────────────────────────
//
// Vrij opgelegde ligger, lengte L, gelijkmatig verdeelde belasting q:
//     M(x)   = q·x·(L − x)/2            M(½L) = qL²/8
//     δ(½L)  = 5qL⁴/(384·EI)            (constante EI)
// Puntlast P op x = a (b = L − a), vrij opgelegd:
//     R_A = P·b/L        M(a) = P·a·b/L
// Uitkragende kolom, hoogte h, kopkracht H, normaaldrukkracht P (2e orde):
//     M_voet ≈ H·h / (1 − P/P_kr)       met P_kr = π²EI/(4h²)
//     (de vergrotingsfactor 1/(1 − P/P_kr) is de standaardbenadering; de test
//      gebruikt hem alleen als grootteorde-controle, niet als exacte eis)
//
// EENHEDEN. Solvergrens: N, mm, N·mm. Kerngrens: kN, kNm, kNm². 1 kNm² =
// 1e9 N·mm². De omrekening staat in `iUitEi` en wordt hier nagerekend.
//
// Draaien met: npx tsx test-fysisch-nietlineair.mjs
//          of: node scripts/run-tests.mjs --filter=fysisch

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const {
  losCombinatieFysischOp,
  betonStavenUitModel,
  krachtenPerSegment,
  schatVrijheidsgraden,
  segmentWaarschuwing,
  geschatSegmentAantal,
  iUitEi,
  STANDAARD_SEGMENTLENGTE_MM,
  DOF_DREMPEL,
  DOF_GEHEUGENPLAFOND,
} = await import("./src/lib/betonStijfheid.ts");
const { solveCombinationSecondOrder, solveAllCasesNonlinear, zetCombinatieResultaat } =
  await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { analysetypeUitBestand, nonlinearVoorBestand } =
  await import("./src/components/fem/femTypes.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve toets; drukt de gemeten afwijking altijd af. */
function check(naam, gemeten, verwacht, tolRel = 1e-9) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  if (rel <= tolRel) {
    passed++;
    log(`  ✓ ${naam}: ${gemeten.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${gemeten.toPrecision(10)} vs ${verwacht.toPrecision(10)} (afw ${rel.toExponential(2)} > ${tolRel.toExponential(0)})`);
  }
  return rel;
}

function checkWaar(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
}

/** Verwacht een fout mét een bepaalde tekst erin — en géén uitkomst. */
async function checkFout(naam, fn, moetBevatten) {
  let uitkomst = null, melding = null;
  try { uitkomst = await fn(); } catch (e) { melding = e instanceof Error ? e.message : String(e); }
  if (uitkomst !== null) {
    failed++;
    log(`  ✗ ${naam}: er kwam een UITKOMST terug in plaats van een fout`);
    return;
  }
  if (!melding || !moetBevatten.every((t) => melding.includes(t))) {
    failed++;
    log(`  ✗ ${naam}: melding "${melding}" mist ${JSON.stringify(moetBevatten)}`);
    return;
  }
  passed++;
  log(`  ✓ ${naam}`);
  log(`      melding: ${melding.slice(0, 160)}${melding.length > 160 ? "…" : ""}`);
}

// ── Model- en korfgegevens ─────────────────────────────────────────────────
const B_MM = 300, H_MM = 500;
const I_C = (B_MM * H_MM ** 3) / 12;          // 3,125e9 mm⁴ (bruto)
const E_CM = 33000;                            // C30/37, tabel 3.1
const A_C = B_MM * H_MM;
const KORF = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  top: { count: 2, diameter_mm: 12 },
  bottom: { count: 3, diameter_mm: 16 },
};

/** Eén betonstaaf zoals de lus hem verwacht. */
const staaf = (beamId, lengteMm) => ({
  beamId,
  doorsnede: {
    shape: "Rectangle",
    b_mm: B_MM,
    h_mm: H_MM,
    b_w_mm: null,
    h_f_mm: null,
    flange_at_bottom: false,
  },
  betonklasse: "C30/37",
  staalsoort: "B500B",
  korf: KORF,
  lengteMm,
  aantalStroken: 50,
  staaltak: "Horizontal",
});

/** Vrij opgelegde ligger als MultiInput, met één belastinggeval. */
function liggerInvoer(L, q, extra = {}) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E_CM, A: A_C, I: I_C, ...(extra.beam ?? {}) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: q === 0 ? [] : [{ beamId: 1, q: -q, caseId: 1 }],
    pointLoads: [],
    beamPointLoads: extra.beamPointLoads ?? [],
    thermalLoads: [],
    edgeLoads: [],
    cases: [{ id: 1, name: "G" }],
  };
}

const COMBO = { id: 1, name: "1,0·G", factors: new Map([[1, 1]]) };

/** Waarde van een stationsreeks op positie x. */
function waardeBijX(el, reeks, x, tol = 1e-6) {
  for (let i = 0; i < el.stations_mm.length; i++) {
    if (Math.abs(el.stations_mm[i] - x) <= tol) return el[reeks][i];
  }
  throw new Error(`geen station op x = ${x}`);
}

// ── Gestuurde kern ─────────────────────────────────────────────────────────
/**
 * Een kern die precies teruggeeft wat de test wil onderzoeken. Bouwt een
 * antwoord in de vorm van `SegmentStiffnessResponse`; alleen de velden die de
 * lus leest zijn ingevuld.
 */
function gestuurdeKern(regel) {
  const gezien = [];
  const roep = async (opdracht, inputs) => {
    if (opdracht !== "concrete_segment_stiffness") {
      throw new Error(`onverwachte opdracht ${opdracht}`);
    }
    gezien.push(inputs);
    const L = inputs.length_m * 1000;
    const n = Math.max(1, Math.round(L / inputs.target_segment_length_mm));
    const heeftKrachten = inputs.segment_forces.length > 0;
    const segments = Array.from({ length: n }, (_, i) => {
      const x0 = (L * i) / n, x1 = (L * (i + 1)) / n;
      const basis = {
        index: i, x_start_mm: x0, x_end_mm: x1, x_mid_mm: (x0 + x1) / 2,
        length_mm: x1 - x0, m0_knm: null, m_cr_knm: null, kappa_per_m: null,
        ei_raw_knm2: null, ei_knm2: null, ei_previous_knm2: null,
        relative_change: null, cracked: null, zeta: null, basis: inputs.limit_state,
        relaxed: false, clamped: false, beyond_eps_cu1: false, iterations: 0,
        method: null, status: "Layout", message: null,
        n_ed_kn: null, m_ed_knm: null,
      };
      if (!heeftKrachten) return basis;
      const f = inputs.segment_forces[i];
      const ei = regel.ei(i, f, inputs);
      return {
        ...basis,
        n_ed_kn: f.n_ed_kn, m_ed_knm: f.m_ed_knm,
        ei_raw_knm2: ei, ei_knm2: ei, cracked: false,
        status: ei === null ? "Failed" : "Cracked",
        message: ei === null ? "gestuurde storing" : null,
      };
    });
    const mislukt = segments.filter((s) => s.status === "Failed").length;
    return {
      beam_id: inputs.beam_id, section_name: `${B_MM} x ${H_MM}`,
      concrete_class: inputs.concrete_class,
      reinforcement_grade: inputs.reinforcement_grade,
      reinforcement_summary: "gestuurd", length_m: inputs.length_m,
      target_segment_length_mm: inputs.target_segment_length_mm,
      segment_length_mm: L / n, segment_count: n,
      segmentation_rule: "gestuurd", limit_state: inputs.limit_state,
      limit_state_label: "gestuurd", load_duration: inputs.load_duration, beta: 1,
      phi_ef: 0, creep_neglected: true, creep_note: "gestuurd",
      f_c_mpa: 20, e_c_mpa: E_CM, f_ctm_mpa: 2.9,
      ei_uncracked_knm2: regel.ongescheurd,
      min_ei_knm2: 0, relaxation: 1, convergence_tolerance: 0.01,
      has_forces: heeftKrachten, segments,
      converged: heeftKrachten && mislukt === 0 && regel.geconvergeerd(gezien.length),
      max_relative_change: heeftKrachten ? (regel.verandering ?? 0.5) : null,
      governing_segment: heeftKrachten ? 0 : null,
      clamped_count: 0, failed_count: mislukt,
      status: heeftKrachten ? "Converged" : "Layout", notes: [],
    };
  };
  return { roep, gezien };
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] Ronde 0: de ongescheurde stijfheid geeft exact de eerste-ordeoplossing");
// ═══════════════════════════════════════════════════════════════════════════
// De lus zet in ronde 0 de ONGESCHEURDE EI als startwaarde op elk segment.
// Met E_c·I_c = 103 125 kNm² (E_cm = 33 000 N/mm², I_c = 3,125e9 mm⁴) hoort
// de gesegmenteerde staaf exact hetzelfde te doen als één ongesegmenteerde
// staaf met I = I_c — de segmentindeling op zichzelf mag niets veranderen.
// De belasting is zuiver dwars, dus N = 0 en de tweede orde valt samen met de
// eerste: 5qL⁴/(384·EI) is de exacte uitkomst.
{
  const L = 6000, q = 12;                     // mm, N/mm
  const EI_ONGESCHEURD_KNM2 = (E_CM * I_C) / 1e9;    // 103 125 kNm²
  check("EI ongescheurd = E_cm·I_c", EI_ONGESCHEURD_KNM2, 103125, 1e-12);
  check("I terug uit EI is weer I_c", iUitEi(EI_ONGESCHEURD_KNM2, E_CM), I_C, 0);

  const kern = gestuurdeKern({
    ongescheurd: EI_ONGESCHEURD_KNM2,
    ei: () => EI_ONGESCHEURD_KNM2,            // blijft ongescheurd
    geconvergeerd: () => true,                // convergeert in ronde 1
  });
  const invoer = liggerInvoer(L, q);
  const uit = await losCombinatieFysischOp(invoer, COMBO, [staaf(1, L)], { roep: kern.roep });

  checkWaar("ronde 0 leverde 15 segmenten", uit.indeling.get(1).segment_count === 15,
    `L/L_doel = ${L}/${STANDAARD_SEGMENTLENGTE_MM}`);
  checkWaar("ronde 0 stuurde géén krachten mee", kern.gezien[0].segment_forces.length === 0);
  checkWaar("één ronde met krachten", uit.ronden === 1, `ronden = ${uit.ronden}`);

  const el = uit.resultaat.elements.get(1);
  const deltaHand = -(5 * q * L ** 4) / (384 * E_CM * I_C);
  check("δ(½L) = 5qL⁴/384EI", waardeBijX(el, "deflection", L / 2), deltaHand, 1e-9);
  check("M(½L) = qL²/8", waardeBijX(el, "bendingMoment", L / 2), (q * L * L) / 8, 1e-9);
  check("reactie A = qL/2", uit.resultaat.reactions.get(1).fz, (q * L) / 2, 1e-9);
  log(`      handberekening δ = ${deltaHand.toFixed(6)} mm bij EI = ${(E_CM * I_C).toExponential(6)} N·mm²`);

  // En letterlijk hetzelfde als de ongesegmenteerde staaf met I = I_c.
  const zonder = solveCombinationSecondOrder(liggerInvoer(L, q), COMBO);
  check("gelijk aan de ongesegmenteerde staaf",
    waardeBijX(el, "deflection", L / 2),
    waardeBijX(zonder.elements.get(1), "deflection", L / 2), 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] Een model ZONDER betonstaven rekent bit-identiek als voorheen");
// ═══════════════════════════════════════════════════════════════════════════
// Geen betonstaven ⇒ de lus geeft de solverinvoer letterlijk ongewijzigd door
// en er wordt geen enkele kernaanroep gedaan.
{
  const L = 6000, q = 12;
  const kern = gestuurdeKern({ ongescheurd: 1, ei: () => 1, geconvergeerd: () => true });
  const invoer = liggerInvoer(L, q);
  const uit = await losCombinatieFysischOp(invoer, COMBO, [], { roep: kern.roep });
  checkWaar("geen enkele kernaanroep", kern.gezien.length === 0, `${kern.gezien.length} aanroepen`);
  checkWaar("klaar na één oplossing", uit.ronden === 1);

  const recht = solveCombinationSecondOrder(invoer, COMBO);
  const a = JSON.stringify([...uit.resultaat.elements.get(1).bendingMoment,
                            ...uit.resultaat.elements.get(1).deflection,
                            uit.resultaat.maxDisplacement]);
  const b = JSON.stringify([...recht.elements.get(1).bendingMoment,
                            ...recht.elements.get(1).deflection,
                            recht.maxDisplacement]);
  checkWaar("M, w en max|u| zijn bit-identiek", a === b);
  checkWaar("geen `segmenten` in het resultaat", uit.resultaat.elements.get(1).segmenten === undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] Lasten en scharnieren komen op het juiste segment terecht");
// ═══════════════════════════════════════════════════════════════════════════
// Een puntlast op 0,3·L en een buigscharnier aan het staafbegin. Het
// (N, M)-paar dat de lus naar de kern stuurt voor het segment waarin de last
// valt, moet het analytische maximum P·a·b/L zijn — en nergens anders op de
// staaf mag een groter moment opduiken.
{
  const L = 6000, P = 40000, a = 0.3 * L, b = L - a;
  const kern = gestuurdeKern({
    ongescheurd: (E_CM * I_C) / 1e9,
    ei: () => (E_CM * I_C) / 1e9,
    geconvergeerd: () => true,
  });
  const invoer = liggerInvoer(L, 0, {
    beamPointLoads: [{ beamId: 1, posFrac: 0.3, fz: -P, caseId: 1 }],
  });
  const uit = await losCombinatieFysischOp(invoer, COMBO, [staaf(1, L)], { roep: kern.roep });

  const verzoek = kern.gezien[1];             // ronde 1: mét krachten
  checkWaar("15 krachtenparen meegestuurd", verzoek.segment_forces.length === 15);
  const M_hand = (P * a * b) / L / 1e6;       // N·mm → kNm
  const grootste = verzoek.segment_forces.reduce(
    (m, f) => (Math.abs(f.m_ed_knm) > Math.abs(m.m_ed_knm) ? f : m));
  check("grootste M in de krachtenlijst = P·a·b/L", grootste.m_ed_knm, M_hand, 1e-9);
  const index = verzoek.segment_forces.indexOf(grootste);
  checkWaar("dat zit in het segment waarin de last valt",
    index === 4,
    `segment ${index + 1} (x = ${(L * index) / 15}–${(L * (index + 1)) / 15} mm), last op ${a} mm`);
  checkWaar("N is overal nul", verzoek.segment_forces.every((f) => Math.abs(f.n_ed_kn) < 1e-9));

  // Buigscharnier aan het staafBEGIN, op een ingeklemde oplegging. De staaf
  // gedraagt zich daardoor als vrij opgelegd: M(0) = 0 en δ = 5qL⁴/384EI.
  // (Een scharnier op een roloplegging zou de knoopdraaiing nergens meer aan
  // ophangen; dat is een mechanisme en geen scharniertest.)
  const q2 = 12;
  const metScharnier = {
    ...liggerInvoer(L, q2, { beam: { startConnection: "hinge" } }),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "zRoller" }],
  };
  const uit2 = await losCombinatieFysischOp(metScharnier, COMBO, [staaf(1, L)], { roep: kern.roep });
  const el2 = uit2.resultaat.elements.get(1);
  check("M op het scharnier = 0", waardeBijX(el2, "bendingMoment", 0), 0, 1e-9);
  check("δ(½L) = 5qL⁴/384EI (dus werkelijk vrij opgelegd)",
    waardeBijX(el2, "deflection", L / 2), -(5 * q2 * L ** 4) / (384 * E_CM * I_C), 1e-9);
  const bijScharnier = kern.gezien[kern.gezien.length - 1].segment_forces[0];
  const daarnaast = kern.gezien[kern.gezien.length - 1].segment_forces[1];
  checkWaar("het scharniersegment ziet het kleinste moment",
    Math.abs(bijScharnier.m_ed_knm) < Math.abs(daarnaast.m_ed_knm),
    `M_1 = ${bijScharnier.m_ed_knm.toFixed(2)} kNm, M_2 = ${daarnaast.m_ed_knm.toFixed(2)} kNm`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Krachten per segment: overlap wint, grootste |M| telt");
// ═══════════════════════════════════════════════════════════════════════════
{
  const el = {
    stations_mm: [], normalForce: [], shearForce: [], bendingMoment: [],
    deflection: [], axialDisp: [], N: 0, V: 0, M_start: 0, M_end: 0, L_mm: 1000,
    segmenten: [
      { xStart: 0, xEnd: 400, I: 1, segmentIndex: 0, N_start: 0, N_end: 0,
        M_start: 0, M_end: 0, M_max: 10e6, N_bij_M_max: -5000 },
      // Twee records binnen segment 2 (een staafpuntlast knipte het door).
      { xStart: 400, xEnd: 600, I: 1, segmentIndex: 1, N_start: 0, N_end: 0,
        M_start: 0, M_end: 0, M_max: 30e6, N_bij_M_max: -7000 },
      { xStart: 600, xEnd: 800, I: 1, segmentIndex: 1, N_start: 0, N_end: 0,
        M_start: 0, M_end: 0, M_max: -50e6, N_bij_M_max: -9000 },
      { xStart: 800, xEnd: 1200, I: 1, segmentIndex: 2, N_start: 0, N_end: 0,
        M_start: 0, M_end: 0, M_max: 20e6, N_bij_M_max: -3000 },
    ],
  };
  const grenzen = [{ x0: 0, x1: 400 }, { x0: 400, x1: 800 }, { x0: 800, x1: 1200 }];
  const uit = krachtenPerSegment(el, grenzen, 1);
  check("segment 1: M = 10 kNm", uit[0].m_ed_knm, 10, 0);
  check("segment 1: N = −5 kN", uit[0].n_ed_kn, -5, 0);
  check("segment 2: het grootste |M| van twee records (−50 kNm)", uit[1].m_ed_knm, -50, 0);
  check("segment 2: N hoort bij dát station (−9 kN)", uit[1].n_ed_kn, -9, 0);
  check("segment 3: M = 20 kNm", uit[2].m_ed_knm, 20, 0);

  // Zonder segmentuitkomsten: een nette fout, geen stilzwijgende nul.
  await checkFout("geen segmentuitkomsten → nette fout",
    async () => krachtenPerSegment({ ...el, segmenten: undefined }, grenzen, 7),
    ["Staaf 7", "geen segmentuitkomsten"]);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] Niet convergent → een nette fout en géén getal");
// ═══════════════════════════════════════════════════════════════════════════
{
  const L = 6000, q = 12;
  const EI0 = (E_CM * I_C) / 1e9;
  // Een kern die de stijfheid elke ronde halveert en nooit convergeert.
  let ronde = 0;
  const kern = gestuurdeKern({
    ongescheurd: EI0,
    ei: () => EI0 / 2 ** (++ronde / 15),
    geconvergeerd: () => false,
    verandering: 0.42,
  });
  await checkFout("vangnet na maxRonden",
    () => losCombinatieFysischOp(liggerInvoer(L, q), COMBO, [staaf(1, L)],
      { roep: kern.roep, maxRonden: 4 }),
    ["niet geconvergeerd", "4 ronden", "1,0·G", "42.0 %"]);

  // Een segment zonder stijfheid: ook een fout, en niet pas na het vangnet.
  const kapot = gestuurdeKern({
    ongescheurd: EI0,
    ei: (i) => (i === 7 ? null : EI0),
    geconvergeerd: () => true,
  });
  await checkFout("een segment zonder stijfheid → fout in de eerste ronde",
    () => losCombinatieFysischOp(liggerInvoer(L, q), COMBO, [staaf(1, L)],
      { roep: kapot.roep }),
    ["Staaf 1", "geen", "stijfheid"]);
  checkWaar("dat kostte maar één oplossing", kapot.gezien.length === 2,
    `${kapot.gezien.length} kernaanroepen (ronde 0 + ronde 1)`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[6] Het resultaat landt waar combineResults het vindt");
// ═══════════════════════════════════════════════════════════════════════════
// De lus is asynchroon, combinations.ts is dat niet. Het uitgerekende
// combinatieresultaat gaat via zetCombinatieResultaat naar de 2e-orde-cache.
// Deze rondgang bewaakt dat de sleutel aan beide kanten dezelfde is.
{
  const invoer = liggerInvoer(6000, 12);
  const { perCase } = solveAllCasesNonlinear(invoer);
  const gemerkt = { displacements: new Map(), reactions: new Map(), elements: new Map(), maxDisplacement: 12345 };
  const gezet = zetCombinatieResultaat(perCase, COMBO, gemerkt);
  checkWaar("de 2e-orde-status nam het resultaat aan", gezet === true);
  const terug = combineResults({ ...COMBO, type: "uls", formula: "" }, perCase);
  checkWaar("combineResults geeft precies dat resultaat terug", terug === gemerkt,
    `max|u| = ${terug.maxDisplacement}`);

  // Zonder 2e-orde-status (het eerste-ordepad) hoort het luid mis te gaan.
  checkWaar("zonder 2e-orde-status: false", zetCombinatieResultaat(new Map(), COMBO, gemerkt) === false);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] Het analysetype blijft terugleesbaar uit het projectbestand");
// ═══════════════════════════════════════════════════════════════════════════
{
  checkWaar("oud bestand, nonlinearEnabled = true → 2e orde",
    analysetypeUitBestand(undefined, true) === "tweedeOrdeGeometrisch");
  checkWaar("oud bestand, nonlinearEnabled = false → 1e orde",
    analysetypeUitBestand(undefined, false) === "eersteOrde");
  checkWaar("oud bestand zonder het veld → 1e orde",
    analysetypeUitBestand(undefined, undefined) === "eersteOrde");
  checkWaar("nieuw bestand: het veld wint",
    analysetypeUitBestand("tweedeOrdeFysisch", false) === "tweedeOrdeFysisch");
  checkWaar("onbekende waarde valt terug op de booleaan",
    analysetypeUitBestand("derdeOrde", true) === "tweedeOrdeGeometrisch");
  checkWaar("terugschrijven: 1e orde → false", nonlinearVoorBestand("eersteOrde") === false);
  checkWaar("terugschrijven: 2e orde → true", nonlinearVoorBestand("tweedeOrdeGeometrisch") === true);
  checkWaar("terugschrijven: fysisch → true", nonlinearVoorBestand("tweedeOrdeFysisch") === true);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[8] De segmentlengte als knop, met de GEMETEN drempel (besluit B3)");
// ═══════════════════════════════════════════════════════════════════════════
{
  checkWaar("beginwaarde 400 mm", STANDAARD_SEGMENTLENGTE_MM === 400);
  checkWaar("drempel skyline = 10 000 DOF (gemeten)", DOF_DREMPEL.skyline === 10000);
  checkWaar("drempel gauss = 1250 DOF (gemeten)", DOF_DREMPEL.gauss === 1250);
  checkWaar("geheugenplafond = 15 735 DOF (gemeten)", DOF_GEHEUGENPLAFOND === 15735);

  check("indeling: 6000/400 → 15 segmenten", geschatSegmentAantal(6000, 400), 15, 0);
  check("indeling: 599/400 → 1 segment", geschatSegmentAantal(599, 400), 1, 0);
  check("indeling: 601/400 → 2 segmenten", geschatSegmentAantal(601, 400), 2, 0);

  // De vuistregel uit het besluitdocument: DOF ≈ 7,5 × totale staaflengte in m
  // bij 400 mm segmenten. 100 staven van 6 m = 600 m → circa 4500 DOF.
  const honderd = Array.from({ length: 100 }, () => ({ lengteMm: 6000 }));
  const dof = schatVrijheidsgraden(101, honderd, 400);
  check("100 staven van 6 m ≈ 7,5 × 600 m", dof, 7.5 * 600, 0.02);
  checkWaar("daar nog geen waarschuwing", segmentWaarschuwing(dof, 400, "skyline") === null,
    `${dof} DOF`);

  const veel = Array.from({ length: 300 }, () => ({ lengteMm: 6000 }));
  const dofVeel = schatVrijheidsgraden(301, veel, 400);
  const w = segmentWaarschuwing(dofVeel, 400, "skyline");
  checkWaar("boven 10 000 DOF wél een waarschuwing", w !== null, `${dofVeel} DOF`);
  checkWaar("de waarschuwing noemt de segmentlengte als knop",
    w.includes("segmentlengte") && w.includes("mm"));
  checkWaar("de waarschuwing noemt de gemeten drempel", w.includes("10000"));
  checkWaar("een grovere segmentlengte haalt de waarschuwing weg",
    segmentWaarschuwing(schatVrijheidsgraden(301, veel, 1200), 1200, "skyline") === null);
  checkWaar("met de gauss-oplosser ligt de drempel bij 1250",
    segmentWaarschuwing(dof, 400, "gauss") !== null && segmentWaarschuwing(1200, 400, "gauss") === null);
  const enorm = Array.from({ length: 1000 }, () => ({ lengteMm: 6000 }));
  checkWaar("boven het geheugenplafond zegt de melding dat ook",
    segmentWaarschuwing(schatVrijheidsgraden(1001, enorm, 400), 400, "skyline")
      .includes("geheugenplafond"),
    `${schatVrijheidsgraden(1001, enorm, 400)} DOF`);
  log(`      voorbeeldmelding: ${w}`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[9] Betonstaven uit het model: alleen mét wapeningskorf");
// ═══════════════════════════════════════════════════════════════════════════
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
  const beams = [
    { id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500",
      checkConfig: { betonKorf: KORF } },
    { id: 2, from: 1, to: 2, material: "C30/37", profile: "300x500" },      // geen korf
    { id: 3, from: 1, to: 2, material: "C30/37", profile: "HEA 200",
      checkConfig: { betonKorf: KORF } },                                    // staalprofiel
    { id: 4, from: 1, to: 2, material: "S235", profile: "HEA 200" },        // geen beton
  ];
  const { staven, overgeslagen: over } = betonStavenUitModel({ nodes, beams });
  checkWaar("één bruikbare betonstaaf", staven.length === 1 && staven[0].beamId === 1);
  checkWaar("b, h en lengte kloppen",
    staven[0].doorsnede.b_mm === 300 && staven[0].doorsnede.h_mm === 500
    && staven[0].doorsnede.shape === "Rectangle" && staven[0].lengteMm === 6000);
  checkWaar("twee overgeslagen mét reden", over.length === 2);
  checkWaar("de staaf zonder korf wordt met reden genoemd",
    over.some((s) => s.beamId === 2 && s.reason.includes("wapeningskorf")));
  checkWaar("de staalprofiel-staaf wordt met reden genoemd",
    over.some((s) => s.beamId === 3 && s.reason.includes("staalprofiel")));
  checkWaar("de staalstaaf komt er niet in voor",
    !over.some((s) => s.beamId === 4));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[10] Met de ECHTE rekenkern");
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log(`   cargo build --release -p toetsbrug  vanuit src-tauri)`);
} else {
  /** Roep de kern aan als apart proces — dezelfde weg als de dev-brug. */
  const echteKern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", () => {
      let j;
      try { j = JSON.parse(uit); } catch { return rej(new Error(`kern gaf geen JSON: ${uit || fout}`)); }
      if (j && j.fout) return rej(new Error(j.fout));
      res(j);
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  // ── 10a. Ongescheurd (BGT): EI ≈ constant, δ = 5qL⁴/384EI ───────────────
  log("\n  [10a] Ongescheurde ligger (BGT, gemiddelde waarden)");
  {
    const L = 6000, q = 5;                    // M(½L) = qL²/8 = 22,5 kNm
    const uit = await losCombinatieFysischOp(
      liggerInvoer(L, q), COMBO, [staaf(1, L)],
      { roep: echteKern, grenstoestand: "MeanValues" },
    );
    const a = uit.laatsteRonde.get(1);
    const eis = a.segments.map((s) => s.ei_knm2);
    const midden = a.segments[7];
    log(`      M(½L) = ${midden.m_ed_knm.toFixed(2)} kNm, M_cr = ${midden.m_cr_knm.toFixed(2)} kNm`);
    log(`      EI: min ${(Math.min(...eis) * 1e-3).toFixed(1)} MNm², max ${(Math.max(...eis) * 1e-3).toFixed(1)} MNm², E_cm·I_c = ${(a.ei_uncracked_knm2 * 1e-3).toFixed(1)} MNm²`);
    log(`      ronden: ${uit.ronden}`);
    checkWaar("elk segment ongescheurd", a.segments.every((s) => s.cracked === false));
    checkWaar("het moment blijft onder het scheurmoment",
      Math.abs(midden.m_ed_knm) < Math.abs(midden.m_cr_knm));
    checkWaar("EI varieert minder dan 1 % over de staaf",
      (Math.max(...eis) - Math.min(...eis)) / Math.max(...eis) < 0.01,
      `${(100 * (Math.max(...eis) - Math.min(...eis)) / Math.max(...eis)).toFixed(3)} %`);
    const EI = (eis.reduce((s, v) => s + v, 0) / eis.length) * 1e9;   // kNm² → N·mm²
    const deltaHand = -(5 * q * L ** 4) / (384 * EI);
    const el = uit.resultaat.elements.get(1);
    check("δ(½L) = 5qL⁴/384EI met de gemelde EI",
      waardeBijX(el, "deflection", L / 2), deltaHand, 5e-3);
    log(`      gemeten δ = ${waardeBijX(el, "deflection", L / 2).toFixed(3)} mm, handberekening ${deltaHand.toFixed(3)} mm`);
  }

  // ── 10b. Boven het scheurmoment: EI daalt, de ligger zakt meer ──────────
  log("\n  [10b] Gescheurde ligger (UGT, rekenwaarden)");
  {
    const L = 6000, q = 8 * 100000 / (L / 1000) ** 2 / 1000;   // qL²/8 = 100 kNm
    const staven = [staaf(1, L)];
    const uit = await losCombinatieFysischOp(liggerInvoer(L, q), COMBO, staven, { roep: echteKern });
    const a = uit.laatsteRonde.get(1);
    log("       seg   x [mm]   M [kNm]   M_cr [kNm]   EI [MNm²]  gescheurd");
    for (const s of a.segments) {
      log(`      ${String(s.index).padStart(4)} ${s.x_mid_mm.toFixed(0).padStart(8)} ` +
          `${s.m_ed_knm.toFixed(2).padStart(9)} ${s.m_cr_knm.toFixed(2).padStart(12)} ` +
          `${(s.ei_knm2 * 1e-3).toFixed(1).padStart(11)}  ${String(s.cracked).padStart(9)}`);
    }
    log(`      ronden: ${uit.ronden}, grootste verandering in de laatste ronde: ` +
        `${(100 * a.max_relative_change).toFixed(2)} %`);

    checkWaar("de kern noemt de ronde geconvergeerd", a.converged === true);
    checkWaar("niets geklemd, niets mislukt", a.clamped_count === 0 && a.failed_count === 0);
    checkWaar("het middensegment is gescheurd", a.segments[7].cracked === true);
    let daalt = true;
    for (let i = 1; i <= 7; i++) {
      if (!(a.segments[i].ei_knm2 < a.segments[i - 1].ei_knm2)) daalt = false;
    }
    checkWaar("EI daalt monotoon van het steunpunt naar het midden", daalt);
    checkWaar("en het verloop is symmetrisch",
      Math.abs(a.segments[0].ei_knm2 - a.segments[14].ei_knm2) / a.segments[0].ei_knm2 < 1e-6);

    // De gescheurde ligger zakt aantoonbaar meer dan de ongescheurde. De
    // ongescheurde vergelijking is de eerste ronde: E_cd·I_c op elk segment.
    const el = uit.resultaat.elements.get(1);
    const EI_ong = a.ei_uncracked_knm2 * 1e9;
    const deltaOngescheurd = -(5 * q * L ** 4) / (384 * EI_ong);
    const deltaGescheurd = waardeBijX(el, "deflection", L / 2);
    log(`      δ ongescheurd (E_cd·I_c) = ${deltaOngescheurd.toFixed(3)} mm`);
    log(`      δ gescheurd              = ${deltaGescheurd.toFixed(3)} mm  ` +
        `(factor ${(deltaGescheurd / deltaOngescheurd).toFixed(2)})`);
    checkWaar("de gescheurde ligger zakt méér dan de ongescheurde",
      deltaGescheurd < deltaOngescheurd,
      `${deltaGescheurd.toFixed(2)} mm tegen ${deltaOngescheurd.toFixed(2)} mm`);
    check("M(½L) = qL²/8 blijft staan (statisch bepaald)",
      waardeBijX(el, "bendingMoment", L / 2), (q * L * L) / 8, 1e-6);
  }

  // ── 10c. Slanke kolom: groter tweede-ordemoment dan ongescheurd ─────────
  log("\n  [10c] Slanke kolom");
  {
    const h = 6000, H = 12000, N = -350000;   // mm, N zijdelings, N druk
    const kolom = {
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: h }],
      beams: [{ id: 1, from: 1, to: 2, E: E_CM, A: A_C, I: I_C }],
      supports: [{ nodeId: 1, type: "fixed" }],
      loads: [],
      pointLoads: [{ nodeId: 2, fx: H, fz: N, caseId: 1 }],
      beamPointLoads: [], thermalLoads: [], edgeLoads: [],
      cases: [{ id: 1, name: "G" }],
    };
    const uit = await losCombinatieFysischOp(kolom, COMBO, [staaf(1, h)], { roep: echteKern });
    const a = uit.laatsteRonde.get(1);
    const M_fysisch = Math.abs(uit.resultaat.elements.get(1).M_start) / 1e6;

    // Vergelijking: dezelfde kolom, tweede orde, met de ONGESCHEURDE E_cd·I_c
    // op elke doorsnede — de stand van ronde 0.
    const I_ong = iUitEi(a.ei_uncracked_knm2, E_CM);
    const ongescheurd = solveCombinationSecondOrder(
      { ...kolom, beams: [{ ...kolom.beams[0], I: I_ong }] }, COMBO);
    const M_ongescheurd = Math.abs(ongescheurd.elements.get(1).M_start) / 1e6;
    const M_eersteOrde = (H * h) / 1e6;

    log(`      1e orde:                 M_voet = ${M_eersteOrde.toFixed(2)} kNm`);
    log(`      2e orde, ongescheurd:    M_voet = ${M_ongescheurd.toFixed(2)} kNm ` +
        `(vergroting ${(M_ongescheurd / M_eersteOrde).toFixed(3)})`);
    log(`      2e orde, fysisch n.-l.:  M_voet = ${M_fysisch.toFixed(2)} kNm ` +
        `(vergroting ${(M_fysisch / M_eersteOrde).toFixed(3)}), ${uit.ronden} ronden`);
    log(`      EI voetsegment = ${(a.segments[0].ei_knm2 * 1e-3).toFixed(1)} MNm², ` +
        `E_cd·I_c = ${(a.ei_uncracked_knm2 * 1e-3).toFixed(1)} MNm²`);

    checkWaar("de kern noemt de ronde geconvergeerd", a.converged === true);
    checkWaar("het tweede-ordemoment is groter dan het eerste-orde",
      M_ongescheurd > M_eersteOrde);
    checkWaar("fysisch niet-lineair geeft een GROTER 2e-ordemoment dan ongescheurd",
      M_fysisch > M_ongescheurd,
      `${M_fysisch.toFixed(2)} kNm tegen ${M_ongescheurd.toFixed(2)} kNm`);
    checkWaar("de voet is het slapste segment",
      a.segments[0].ei_knm2 < a.segments.at(-1).ei_knm2,
      `voet ${(a.segments[0].ei_knm2 * 1e-3).toFixed(1)} MNm², kop ${(a.segments.at(-1).ei_knm2 * 1e-3).toFixed(1)} MNm²`);
    checkWaar("de normaalkracht komt als druk bij de kern aan",
      a.segments[0].n_ed_kn < 0,
      `N = ${a.segments[0].n_ed_kn.toFixed(1)} kN`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n────────────────────────────────────────────────────────────");
log(`${passed} geslaagd, ${failed} gefaald${overgeslagen ? `, ${overgeslagen} blok overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
