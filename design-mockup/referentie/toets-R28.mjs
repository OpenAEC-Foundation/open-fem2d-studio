// ═══════════════════════════════════════════════════════════════════════════
// R28 — ONGESCHOORDE betonkolom (console): §5.8.3.1 met C = 0,7 voorgeschreven,
//       en de tweede orde langs twee onafhankelijke wegen.
// ═══════════════════════════════════════════════════════════════════════════
//
// WAAROM NAAST R27
// R27 doet de GESCHOORDE kolom. Het verschil tussen geschoord en ongeschoord is
// in §5.8 geen detail maar een tweedeling die op drie plaatsen tegelijk ingrijpt:
//
//   1. l₀ — figuur 5.7 b) geeft de console l₀ = 2l. Bij dezelfde vrije lengte is
//      λ dus TWEEMAAL zo groot als bij vakje a).
//   2. C — voor een ongeschoord element schrijft §5.8.3.1(1) C = 0,7 voor
//      ("voor niet-geschoorde elementen in het algemeen"), terwijl een
//      geschoorde kolom met tegengesteld tekenende eindmomenten C > 1,7 mag
//      halen. Dat scheelt meer dan een factor twee in λ_lim.
//   3. De nationale bijlage laat de nominale-krommingsmethode (§5.8.8) alleen
//      toe voor GESCHOORDE, op zichzelf staande elementen. Voor deze kolom mag
//      zij in Nederland dus niet als ontwerpmethode worden gebruikt — hier
//      dient zij alleen als onafhankelijke tweede mening, en dat staat er
//      hieronder ook bij.
//
// Een fout die geschoord en ongeschoord verwisselt, is aan één getal niet te
// zien; aan R27 en R28 naast elkaar wél.
//
// DE KOLOM
// Vierkant 400 × 400, C30/37, B500B, korf 2×4Ø20, dekking 30 mm, beugels Ø8.
// Vrije lengte 3,500 m, onderaan ingeklemd en bovenaan vrij — figuur 5.7 b),
// de console, dus l₀ = 2l = 7,000 m. Drukkracht N_Ed = 800 kN op de kop en een
// horizontale kopkracht H = 25 kN, die aan de voet M₀ = H·l = 87,5 kNm geeft.
//
// Draaien: npx tsx referentie/toets-R28.mjs   (vanuit design-mockup/)
// Vereist: cargo build --release -p toetsbrug   (in ../src-tauri)

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "..", "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { losCombinatieFysischOp } = await import("../src/lib/betonStijfheid.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function vgl(naam, ons, ref, eenheid, tolPct, opmerking = "") {
  const d = ref === 0 ? ons : (ons / ref - 1) * 100;
  const ok = Math.abs(d) <= tolPct;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(38)} ref ${ref.toFixed(3).padStart(10)}` +
    `   ons ${ons.toFixed(3).padStart(10)} ${eenheid.padEnd(4)}` +
    `  Δ ${(d >= 0 ? "+" : "") + d.toFixed(3)} %` + (opmerking ? `  ${opmerking}` : ""));
  ok ? passed++ : failed++;
}

function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DE KOLOM
// ═══════════════════════════════════════════════════════════════════════════

const B = 400, H = 400;
const L_MM = 3500;                   // VRIJE lengte l
const DEKKING = 30, D_BEUGEL = 8, D_STAAF = 20, N_PER_RIJ = 4;
const N_ED_KN = 800;
const H_KOP_KN = 25;                 // horizontale kopkracht
const M0_KNM = (H_KOP_KN * L_MM) / 1000;   // voetmoment, kNm

const F_CK = 30, E_CM = 33000;
const F_YK = 500, E_S = 200000;
const GAMMA_C = 1.5, GAMMA_S = 1.15, ALPHA_CC = 1.0;

const F_CD = ALPHA_CC * F_CK / GAMMA_C;
const F_YD = F_YK / GAMMA_S;
const A_C = B * H;
const A_STAAF = Math.PI * (D_STAAF / 2) ** 2;
const A_S = 2 * N_PER_RIJ * A_STAAF;
const D_NUTTIG = H - DEKKING - D_BEUGEL - D_STAAF / 2;
const I_C = (B * H ** 3) / 12;

const KORF = {
  cover_mm: DEKKING, stirrup_diameter_mm: D_BEUGEL,
  top: { count: N_PER_RIJ, diameter_mm: D_STAAF },
  bottom: { count: N_PER_RIJ, diameter_mm: D_STAAF },
};

log("═══════════════════════════════════════════════════════════════════════");
log("R28 — ONGESCHOORDE kolom 400×400 (console), C30/37, B500B, l = 3,50 m");
log(`      N_Ed = ${N_ED_KN} kN · H = ${H_KOP_KN} kN op de kop · M₀ = ${M0_KNM} kNm aan de voet`);
log("═══════════════════════════════════════════════════════════════════════");

// ═══════════════════════════════════════════════════════════════════════════
// 2. §5.8.3.1 MET DE HAND — let op l₀ = 2l en C = 0,7
// ═══════════════════════════════════════════════════════════════════════════

const i_HAND = H / Math.sqrt(12);
const L0_HAND = 2 * L_MM;                       // figuur 5.7 b)
const LAMBDA_HAND = L0_HAND / i_HAND;
const n_HAND = (N_ED_KN * 1000) / (A_C * F_CD);
const omega_HAND = (A_S * F_YD) / (A_C * F_CD);
const A_FACTOR = 0.7;
const B_FACTOR = Math.sqrt(1 + 2 * omega_HAND);
const C_FACTOR = 0.7;                            // ONGESCHOORD: voorgeschreven
const LAMBDA_LIM_HAND = (20 * A_FACTOR * B_FACTOR * C_FACTOR) / Math.sqrt(n_HAND);

log("\n─── ① §5.8.3.1 met de hand ─────────────────────────────────────────────");
log(`  i   = h/√12                      = ${i_HAND.toFixed(4)} mm`);
log(`  l₀  = 2·l  (figuur 5.7 b, console) = ${L0_HAND.toFixed(0)} mm`);
log(`  λ   = l₀/i                       = ${LAMBDA_HAND.toFixed(4)}`);
log(`  n   = N_Ed/(A_c·f_cd)            = ${n_HAND.toFixed(6)}`);
log(`  ω   = A_s·f_yd/(A_c·f_cd)        = ${omega_HAND.toFixed(6)}   (A_s = ${A_S.toFixed(1)} mm²)`);
log(`  A = 0,7 · B = ${B_FACTOR.toFixed(6)} · C = 0,7 VOORGESCHREVEN voor ongeschoord`);
log(`  λ_lim = 20·A·B·C/√n              = ${LAMBDA_LIM_HAND.toFixed(4)}`);

// Wat een GESCHOORDE kolom met dezelfde maten zou krijgen — het verschil dat
// deze referentie wil laten zien.
const LAMBDA_GESCHOORD = L_MM / i_HAND;
log(`  (dezelfde kolom geschoord: l₀ = l ⇒ λ = ${LAMBDA_GESCHOORD.toFixed(4)}, dus de helft)`);

eis("de console is tweemaal zo slank als dezelfde kolom geschoord",
  Math.abs(LAMBDA_HAND - 2 * LAMBDA_GESCHOORD) < 1e-9,
  `${LAMBDA_HAND.toFixed(3)} = 2 × ${LAMBDA_GESCHOORD.toFixed(3)}`);
eis("de kolom is slank (λ > λ_lim)", LAMBDA_HAND > LAMBDA_LIM_HAND,
  `λ = ${LAMBDA_HAND.toFixed(2)} tegen λ_lim = ${LAMBDA_LIM_HAND.toFixed(2)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. §5.8.8 MET DE HAND — als tweede mening, niet als ontwerpmethode
// ═══════════════════════════════════════════════════════════════════════════
//
// LET OP. De nationale bijlage laat §5.8.8 alleen toe voor GESCHOORDE, op
// zichzelf staande elementen. Deze kolom is ongeschoord, dus in Nederland mag
// je hier niet mee ontwerpen. Hij staat hier uitsluitend als onafhankelijk
// tweede getal om de algemene methode naast te leggen — dezelfde rol die een
// handberekening in elke andere referentie in deze reeks heeft.
//
// c = 10: §5.8.8.2(4) noemt dat de gebruikelijke waarde (≈π²); de ondergrens 8
// geldt bij een CONSTANT eerste-orde-moment, en dat is hier niet zo — het
// moment loopt driehoekig van nul aan de kop naar M₀ aan de voet.

const EPS_YD = F_YD / E_S;
const KROMMING_0 = EPS_YD / (0.45 * D_NUTTIG);
const N_U = 1 + omega_HAND;
const K_R = Math.min(1, (N_U - n_HAND) / (N_U - 0.4));
const BETA = 0.35 + F_CK / 200 - LAMBDA_HAND / 150;
const K_PHI = Math.max(1, 1 + BETA * 0);
const KROMMING = K_R * K_PHI * KROMMING_0;
const C_KROMMING = 10;
const E2_MM = KROMMING * L0_HAND ** 2 / C_KROMMING;
const M2_KNM = (N_ED_KN * E2_MM) / 1000;
const M_ED_588 = M0_KNM + M2_KNM;      // console: M₀Ed is het voetmoment zelf

log("\n─── ② §5.8.8 met de hand (tweede mening, géén NL-ontwerpmethode) ───────");
log(`  d = ${D_NUTTIG.toFixed(1)} mm · 1/r₀ = ${KROMMING_0.toExponential(6)} /mm`);
log(`  n_u = ${N_U.toFixed(4)} · K_r = ${K_R.toFixed(6)} · β = ${BETA.toFixed(6)} · K_φ = ${K_PHI.toFixed(4)}`);
log(`  e₂ = (1/r)·l₀²/c met c = 10       = ${E2_MM.toFixed(3)} mm`);
log(`  M₂ = N_Ed·e₂                      = ${M2_KNM.toFixed(3)} kNm`);
log(`  M_Ed (§5.8.8) = M₀ + M₂           = ${M_ED_588.toFixed(3)} kNm`);

// ═══════════════════════════════════════════════════════════════════════════
// 4. DE REKENKERN
// ═══════════════════════════════════════════════════════════════════════════

if (!existsSync(TOETSBRUG)) {
  log(`\n  (overgeslagen: ${TOETSBRUG} ontbreekt —`);
  log(`   bouw hem met  cargo build --release -p toetsbrug  vanuit src-tauri)`);
  overgeslagen++;
} else {
  const roepKern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", (code) => {
      if (code !== 0) return rej(new Error(`toetsbrug stopte met ${code}: ${fout}`));
      try {
        const data = JSON.parse(uit);
        if (data && typeof data === "object" && "fout" in data) return rej(new Error(data.fout));
        res(data);
      } catch { rej(new Error(`onleesbaar antwoord: ${uit.slice(0, 200)}`)); }
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  // Het eerste-orde-moment loopt van 0 aan de kop (x = 0) naar M₀ aan de voet.
  const omhullende = [0, 0.5, 1].map((t) => ({
    combination_id: 1,
    position_mm: t * L_MM,
    forces: {
      n_ed: -N_ED_KN, vy_ed: 0, vz_ed: H_KOP_KN,
      mt_ed: 0, my_ed: M0_KNM * t, mz_ed: 0,
    },
  }));

  const verzoek = (extra = {}) => ({
    beam_id: 1,
    section: {
      shape: "Rectangle", b_mm: B, h_mm: H,
      b_w_mm: null, h_f_mm: null, flange_at_bottom: false,
    },
    concrete_class: "C30/37",
    reinforcement_grade: "B500B",
    cage: {
      cover_mm: DEKKING, stirrup_diameter_mm: D_BEUGEL,
      bottom: { count: N_PER_RIJ, diameter_mm: D_STAAF },
      top: { count: N_PER_RIJ, diameter_mm: D_STAAF },
      stirrup_spacing_mm: 200, stirrup_legs: 2,
    },
    length_m: L_MM / 1000,
    column: {
      bracing: "Ongeschoord",
      buckling_length: { soort: "Figuur57", geval: "Console" },
    },
    forces_envelope: omhullende,
    ...extra,
  });

  log("\n─── ③ De rekenkern naast de handberekening ─────────────────────────────");
  const kolom = await roepKern("concrete_column_check", verzoek());

  vgl("l₀ (= 2·l)", kolom.l0_mm, L0_HAND, "mm", 0.01);
  vgl("λ", kolom.lambda, LAMBDA_HAND, "—", 0.01);
  vgl("λ_lim (met C = 0,7)", kolom.lambda_lim, LAMBDA_LIM_HAND, "—", 0.5);
  eis("de kern trekt dezelfde conclusie over de poort",
    kolom.tweede_orde_verwaarloosbaar === (LAMBDA_HAND < LAMBDA_LIM_HAND),
    `kern: ${kolom.tweede_orde_verwaarloosbaar ? "verwaarloosbaar" : "meenemen"}`);

  // ── Geschoord/ongeschoord moet ertoe doen ────────────────────────────────
  //
  // Dezelfde kolom, alleen het ontwerpbesluit anders. Zou de kern `bracing`
  // negeren, dan kwamen hier dezelfde getallen uit — en dat is precies de fout
  // die geen enkel afzonderlijk getal zou verraden.
  const alsGeschoord = await roepKern("concrete_column_check", {
    ...verzoek(),
    column: {
      bracing: "Geschoord",
      buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" },
    },
  });
  log(`  ter vergelijking, dezelfde kolom GESCHOORD: l₀ = ${alsGeschoord.l0_mm} mm, ` +
    `λ = ${alsGeschoord.lambda.toFixed(3)}, λ_lim = ${alsGeschoord.lambda_lim.toFixed(3)}`);
  eis("geschoord geeft de helft van de kniklengte",
    Math.abs(alsGeschoord.l0_mm * 2 - kolom.l0_mm) < 1e-6,
    `${alsGeschoord.l0_mm} × 2 = ${kolom.l0_mm} mm`);
  eis("en daarmee de helft van de slankheid",
    Math.abs(alsGeschoord.lambda * 2 - kolom.lambda) < 1e-9,
    `${alsGeschoord.lambda.toFixed(3)} × 2 = ${kolom.lambda.toFixed(3)}`);

  // ═════════════════════════════════════════════════════════════════════════
  // 5. DE TWEEDE ORDE VIA §5.8.6
  // ═════════════════════════════════════════════════════════════════════════

  const invoer = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L_MM }],
    beams: [{ id: 1, from: 1, to: 2, E: E_CM, A: A_C, I: I_C }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [
      { nodeId: 2, fx: H_KOP_KN * 1000, fz: -N_ED_KN * 1000, caseId: 1 },
    ],
    beamPointLoads: [], thermalLoads: [], edgeLoads: [],
    cases: [{ id: 1, name: "G" }],
  };
  const COMBO = { id: 1, name: "COMB", factors: new Map([[1, 1.0]]) };
  const betonStaaf = {
    beamId: 1,
    doorsnede: {
      shape: "Rectangle", b_mm: B, h_mm: H,
      b_w_mm: null, h_f_mm: null, flange_at_bottom: false,
    },
    betonklasse: "C30/37", staalsoort: "B500B",
    korf: KORF, lengteMm: L_MM, aantalStroken: 50, staaltak: "Horizontal",
  };

  log("\n─── ④ De algemene methode (§5.8.6) naast §5.8.8 ────────────────────────");
  let uit = null, fout = null;
  try {
    uit = await losCombinatieFysischOp(invoer, COMBO, [betonStaaf], { roep: roepKern });
  } catch (e) {
    fout = e instanceof Error ? e.message : String(e);
  }

  if (fout) {
    log(`  (de lus gaf: ${fout.slice(0, 200)})`);
    eis("de lus levert een reden en geen getal", fout.length > 0, fout.slice(0, 120));
  } else {
    const el = uit.resultaat.elements.get(1);
    const mMax = Math.max(...el.bendingMoment.map(Math.abs)) / 1e6;

    log(`  eerste orde (H·l)                 M₀    = ${M0_KNM.toFixed(3)} kNm`);
    log(`  §5.8.8 met de hand                M_Ed  = ${M_ED_588.toFixed(3)} kNm`);
    log(`  §5.8.6 door de app                M_Ed  = ${mMax.toFixed(3)} kNm`);
    log(`  rondes in de lus: ${uit.geschiedenis.length}`);

    eis("de app vindt tweede orde", mMax > M0_KNM * 1.02,
      `${M0_KNM} → ${mMax.toFixed(2)} kNm (×${(mMax / M0_KNM).toFixed(3)})`);
    eis("en niet meer dan §5.8.8", mMax <= M_ED_588 * 1.02,
      `${mMax.toFixed(2)} ≤ ${M_ED_588.toFixed(2)} kNm`);

    // ── Mechanisch verankeren ──────────────────────────────────────────────
    //
    // Voor een console met kopkracht H en drukkracht N is de exacte oplossing
    // van de knikvergelijking
    //
    //     M_voet = H·l · tan(u)/u,   u = l·√(N/EI)
    //
    // (niet sec(u) — dat hoort bij een constant moment, zie R27; en niet
    // 1/(1−N/N_kr), dat hoort bij een sinusvormige verstoring. Het lastgeval
    // bepaalt de formule.) Uit de gemeten vergroting v volgt u door
    // tan(u)/u = v numeriek op te lossen, en daarmee EI = N·l²/u².
    const v = mMax / M0_KNM;
    let lo = 1e-9, hi = Math.PI / 2 - 1e-9;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      (Math.tan(mid) / mid < v) ? (lo = mid) : (hi = mid);
    }
    const u = (lo + hi) / 2;
    const eiAfgeleid = (N_ED_KN * 1000 * L_MM ** 2) / u ** 2 / 1e9;   // kNm²
    const nKr = (Math.PI ** 2 * eiAfgeleid * 1e9) / L0_HAND ** 2 / 1000;

    const laatste = uit.laatsteRonde.get(1) ?? uit.indeling.get(1);
    const eiOngescheurd = laatste?.ei_uncracked_knm2 ?? (E_CM * I_C) / 1e9;
    const eiSegmenten = (laatste?.segments ?? [])
      .map((s) => s.ei_knm2)
      .filter((x) => typeof x === "number" && Number.isFinite(x) && x > 0);
    const eiMin = eiSegmenten.length ? Math.min(...eiSegmenten) : null;

    log(`  vergroting M/M₀ = tan(u)/u        = ${v.toFixed(4)}`);
    log(`  ⇒ u = l·√(N/EI)                   = ${u.toFixed(6)} rad`);
    log(`  ⇒ EI_eff = N·l²/u²                = ${eiAfgeleid.toFixed(1)} kNm²`);
    log(`  ⇒ N_kr = π²·EI/l₀²                = ${nKr.toFixed(1)} kN`);
    log(`  EI ongescheurd (kern)             = ${eiOngescheurd.toFixed(1)} kNm²`);
    log(`  kleinste segment-EI (kern)        = ${eiMin === null ? "—" : eiMin.toFixed(1)} kNm²`);

    eis("de afgeleide EI ligt onder de ongescheurde", eiAfgeleid < eiOngescheurd,
      `${eiAfgeleid.toFixed(0)} < ${eiOngescheurd.toFixed(0)} kNm²`);
    if (eiMin !== null) {
      eis("en niet onder de kleinste segment-EI die de kern meldt",
        eiAfgeleid >= eiMin * 0.95, `${eiAfgeleid.toFixed(0)} ≥ ${eiMin.toFixed(0)} kNm²`);
    }
    eis("de kolom blijft onder de kniklast", nKr > N_ED_KN,
      `N_kr = ${nKr.toFixed(0)} kN tegen N_Ed = ${N_ED_KN} kN`);
  }
}

log("\n═══════════════════════════════════════════════════════════════════════");
log(`R28: ${passed} geslaagd, ${failed} gefaald` +
  (overgeslagen ? `, ${overgeslagen} overgeslagen` : "") + ".");
process.exit(failed === 0 ? 0 : 1);
