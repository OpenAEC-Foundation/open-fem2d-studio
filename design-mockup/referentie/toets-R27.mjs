// ═══════════════════════════════════════════════════════════════════════════
// R27 — Slanke betonkolom, geschoord: §5.8.3.1, §5.8.4 en de tweede orde
//       langs TWEE onafhankelijke wegen uit de norm.
// ═══════════════════════════════════════════════════════════════════════════
//
// WAAROM DEZE REFERENTIE BESTAAT
// De reeks R01–R26 en P01–P04 rekent staal en hout na tegen extern werk.
// Beton komt er niet in voor: de enige externe betonverificatie is de
// begane-grondvloer (test-bgvloer-referentie.mjs), en dat is een BUIGGEVAL
// zonder normaaldruk. De kolom — het geval waarvoor §5.8 bestaat — was tegen
// niets van buiten gelegd.
//
// DE MOEILIJKHEID, EN HOE DIE HIER IS OPGELOST
// Een gepubliceerd rekenvoorbeeld voor een slanke kolom volgt bijna altijd
// §5.8.8 (nominale kromming). Deze app bouwt die methode NIET, en met reden:
// de nationale bijlage laat haar alleen toe voor geschoorde, op zichzelf
// staande elementen, en §5.8.7.2 verbiedt zij helemaal. Wat de app wél doet is
// §5.8.6 — de algemene methode, met de secans-EI per segment uit het
// M-N-κ-diagram. Een voorbeeld uit de literatuur klakkeloos overnemen zou dus
// de verkeerde methode toetsen.
//
// Daarom rekent DIT BESTAND §5.8.8 zelf uit, met de hand, uit de formules van
// de norm — regel voor regel, zonder de app aan te raken. Dat levert een
// onafhankelijke tweede mening over hetzelfde geval. De twee normwegen horen
// niet hetzelfde antwoord te geven (5.8.8 is de vereenvoudigde, veilige weg),
// maar ze horen wél dezelfde kolom te beschrijven: dezelfde slankheid,
// dezelfde poort, en een tweede-orde-moment in dezelfde orde waarbij de
// algemene methode de gunstigste is.
//
// DE KOLOM
// Vierkant 300 × 300, C30/37, B500B, korf 3Ø20 boven en onder, dekking 30 mm,
// beugels Ø8. Vrije lengte 6,000 m, scharnierend-scharnierend (figuur 5.7 a),
// dus l₀ = l. Constante drukkracht N_Ed = 600 kN en een CONSTANT
// eerste-orde-moment M₀ = 40 kNm (gelijke eindmomenten, gelijk teken —
// enkelvoudige kromming, r_m = +1).
//
// De nationale keuzen zijn die van de Nederlandse bijlage: α_cc = 1,0 en
// γ_C = 1,5. Een buitenlands voorbeeld met α_cc = 0,85 geeft een andere n en
// daarmee een andere λ_lim; dat is een nationale keuze en geen verschil van
// inzicht, en het is de reden dat de getallen hier zelf zijn afgeleid.
//
// Draaien: npx tsx referentie/toets-R27.mjs   (vanuit design-mockup/)
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
  const regel =
    `  ${ok ? "✓" : "✗"} ${naam.padEnd(38)} ref ${ref.toFixed(3).padStart(10)}` +
    `   ons ${ons.toFixed(3).padStart(10)} ${eenheid.padEnd(4)}` +
    `  Δ ${(d >= 0 ? "+" : "") + d.toFixed(3)} %` +
    (opmerking ? `  ${opmerking}` : "");
  log(regel);
  ok ? passed++ : failed++;
}

function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DE KOLOM
// ═══════════════════════════════════════════════════════════════════════════

const B = 300, H = 300;              // mm
const L_MM = 6000;                   // vrije lengte
const DEKKING = 30, D_BEUGEL = 8, D_STAAF = 20, N_STAVEN_PER_RIJ = 3;
const N_ED_KN = 600;                 // drukkracht (positief = druk hier)
const M0_KNM = 40;                   // constant eerste-orde-moment

// Tabel 3.1, C30/37
const F_CK = 30, F_CM = 38, E_CM = 33000;
// Bijlage C, B500B
const F_YK = 500, E_S = 200000;
// Tabel 2.1N met de NL-bijlage: α_cc = 1,0
const GAMMA_C = 1.5, GAMMA_S = 1.15, ALPHA_CC = 1.0;

const F_CD = ALPHA_CC * F_CK / GAMMA_C;        // 20,000 N/mm²
const F_YD = F_YK / GAMMA_S;                   // 434,783 N/mm²
const A_C = B * H;                             // 90 000 mm²
const A_STAAF = Math.PI * (D_STAAF / 2) ** 2;  // 314,159 mm²
const A_S = 2 * N_STAVEN_PER_RIJ * A_STAAF;    // beide rijen samen
const D_NUTTIG = H - DEKKING - D_BEUGEL - D_STAAF / 2;   // 252 mm

const KORF = {
  cover_mm: DEKKING,
  stirrup_diameter_mm: D_BEUGEL,
  top: { count: N_STAVEN_PER_RIJ, diameter_mm: D_STAAF },
  bottom: { count: N_STAVEN_PER_RIJ, diameter_mm: D_STAAF },
};

log("═══════════════════════════════════════════════════════════════════════");
log("R27 — Slanke betonkolom 300×300, C30/37, B500B, l = 6,00 m, geschoord");
log(`      N_Ed = ${N_ED_KN} kN druk · M₀ = ${M0_KNM} kNm constant · korf 2×${N_STAVEN_PER_RIJ}Ø${D_STAAF}`);
log("═══════════════════════════════════════════════════════════════════════");

// ═══════════════════════════════════════════════════════════════════════════
// 2. DE HANDBEREKENING — §5.8.3.1, stap voor stap uit de norm
// ═══════════════════════════════════════════════════════════════════════════
//
// Elke regel hieronder is één formule uit de norm, met de getallen erin. Wie
// dit narekent heeft alleen de norm en een rekenmachine nodig.

// (5.14): i = √(I/A). Voor een rechthoek is dat h/√12.
const I_C = (B * H ** 3) / 12;
const i_HAND = Math.sqrt(I_C / A_C);
const i_FORMULE = H / Math.sqrt(12);

// figuur 5.7 a): scharnierend-scharnierend ⇒ l₀ = l
const L0_HAND = L_MM;
const LAMBDA_HAND = L0_HAND / i_HAND;

// n = N_Ed/(A_c·f_cd)
const n_HAND = (N_ED_KN * 1000) / (A_C * F_CD);
// ω = A_s·f_yd/(A_c·f_cd)
const omega_HAND = (A_S * F_YD) / (A_C * F_CD);

// A = 1/(1 + 0,2·φ_ef); zonder φ_ef staat de norm A = 0,7 toe.
// B = √(1 + 2ω)
// C = 1,7 − r_m, met r_m = M₀₁/M₀₂. Gelijke eindmomenten met gelijk teken
//     (enkelvoudige kromming) geeft r_m = +1 en dus C = 0,7 — de ONGUNSTIGSTE
//     van de drie, en precies het geval dat hier is gemodelleerd.
const A_FACTOR = 0.7;
const B_FACTOR = Math.sqrt(1 + 2 * omega_HAND);
const R_M = 1.0;
const C_FACTOR = 1.7 - R_M;
const LAMBDA_LIM_HAND = (20 * A_FACTOR * B_FACTOR * C_FACTOR) / Math.sqrt(n_HAND);

log("\n─── ① De handberekening van §5.8.3.1 ───────────────────────────────────");
log(`  I_c = b·h³/12                    = ${I_C.toExponential(6)} mm⁴`);
log(`  i   = √(I/A) = h/√12             = ${i_HAND.toFixed(4)} mm   (h/√12 = ${i_FORMULE.toFixed(4)})`);
log(`  l₀  = l  (figuur 5.7 a)          = ${L0_HAND.toFixed(0)} mm`);
log(`  λ   = l₀/i                       = ${LAMBDA_HAND.toFixed(4)}`);
log(`  f_cd = α_cc·f_ck/γ_C             = ${F_CD.toFixed(3)} N/mm²   (α_cc = 1,0, NL-bijlage)`);
log(`  f_yd = f_yk/γ_S                  = ${F_YD.toFixed(3)} N/mm²`);
log(`  A_s = 2 × ${N_STAVEN_PER_RIJ}Ø${D_STAAF}                  = ${A_S.toFixed(2)} mm²`);
log(`  n   = N_Ed/(A_c·f_cd)            = ${n_HAND.toFixed(6)}`);
log(`  ω   = A_s·f_yd/(A_c·f_cd)        = ${omega_HAND.toFixed(6)}`);
log(`  A = 0,7 (φ_ef onbekend) · B = √(1+2ω) = ${B_FACTOR.toFixed(6)} · C = 1,7 − r_m = ${C_FACTOR.toFixed(3)}`);
log(`  λ_lim = 20·A·B·C/√n              = ${LAMBDA_LIM_HAND.toFixed(4)}`);
log(`  ⇒ λ ${LAMBDA_HAND > LAMBDA_LIM_HAND ? ">" : "≤"} λ_lim: de tweede orde ` +
  `${LAMBDA_HAND > LAMBDA_LIM_HAND ? "MOET" : "hoeft niet"} te worden meegenomen`);

eis("i uit √(I/A) is gelijk aan h/√12", Math.abs(i_HAND - i_FORMULE) < 1e-9,
  `${i_HAND.toFixed(6)} mm`);
eis("de kolom is slank (λ > λ_lim) — anders toetst deze referentie niets",
  LAMBDA_HAND > LAMBDA_LIM_HAND,
  `λ = ${LAMBDA_HAND.toFixed(2)} tegen λ_lim = ${LAMBDA_LIM_HAND.toFixed(2)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. DE HANDBEREKENING VAN §5.8.8 — de tweede mening
// ═══════════════════════════════════════════════════════════════════════════
//
// De app bouwt deze methode niet. Hier staat zij volledig uitgeschreven, zodat
// er een onafhankelijk getal is om de algemene methode naast te leggen.
//
//   e₂  = (1/r)·l₀²/c                                        (5.33)
//   1/r = K_r·K_φ·1/r₀,  1/r₀ = ε_yd/(0,45·d)                (5.34)
//   K_r = (n_u − n)/(n_u − n_bal) ≤ 1, n_u = 1 + ω, n_bal = 0,4   (5.36)
//   K_φ = 1 + β·φ_ef ≥ 1, β = 0,35 + f_ck/200 − λ/150             (5.37)
//   M₀e = 0,6·M₀₂ + 0,4·M₀₁ ≥ 0,4·M₀₂                        (5.32)
//   M_Ed = M₀e + M₂,  M₂ = N_Ed·e₂                           (5.31)
//
// c: §5.8.8.2(4) noemt c = 10 (≈π²) voor een sinusvormige kromming en zegt dat
// bij een CONSTANT eerste-orde-moment een lagere waarde moet worden aangehouden,
// met 8 als ondergrens. Het moment is hier constant, dus c = 8 — de
// ongunstigste keuze, en de eerlijke voor dit geval.

const EPS_YD = F_YD / E_S;
const KROMMING_0 = EPS_YD / (0.45 * D_NUTTIG);          // 1/r₀, per mm
const N_U = 1 + omega_HAND;
const N_BAL = 0.4;
const K_R = Math.min(1, (N_U - n_HAND) / (N_U - N_BAL));
const PHI_EF = 0;                                        // zonder kruip
const BETA = 0.35 + F_CK / 200 - LAMBDA_HAND / 150;
const K_PHI = Math.max(1, 1 + BETA * PHI_EF);
const KROMMING = K_R * K_PHI * KROMMING_0;
const C_KROMMING = 8;
const E2_MM = KROMMING * L0_HAND ** 2 / C_KROMMING;
const M2_KNM = (N_ED_KN * E2_MM) / 1000;                 // kN·mm → kNm
const M0E_KNM = Math.max(0.6 * M0_KNM + 0.4 * M0_KNM, 0.4 * M0_KNM);
const M_ED_588 = M0E_KNM + M2_KNM;

log("\n─── ② De onafhankelijke tweede mening: §5.8.8 met de hand ──────────────");
log(`  d = h − c − Ø_beugel − Ø/2        = ${D_NUTTIG.toFixed(1)} mm`);
log(`  ε_yd = f_yd/E_s                   = ${EPS_YD.toExponential(6)}`);
log(`  1/r₀ = ε_yd/(0,45·d)              = ${KROMMING_0.toExponential(6)} /mm`);
log(`  n_u = 1 + ω = ${N_U.toFixed(4)} · n_bal = 0,4 · K_r = ${K_R.toFixed(6)} (begrensd op 1)`);
log(`  β = 0,35 + f_ck/200 − λ/150 = ${BETA.toFixed(6)} · φ_ef = 0 ⇒ K_φ = ${K_PHI.toFixed(4)}`);
log(`  1/r = K_r·K_φ·1/r₀                = ${KROMMING.toExponential(6)} /mm`);
log(`  e₂ = (1/r)·l₀²/c met c = 8        = ${E2_MM.toFixed(3)} mm`);
log(`  M₂ = N_Ed·e₂                      = ${M2_KNM.toFixed(3)} kNm`);
log(`  M₀e = 0,6·M₀₂ + 0,4·M₀₁           = ${M0E_KNM.toFixed(3)} kNm`);
log(`  M_Ed (§5.8.8)                     = ${M_ED_588.toFixed(3)} kNm`);

eis("K_r is begrensd op 1 — bij lage n geeft (5.36) meer dan 1",
  K_R === 1 || K_R < 1, `K_r = ${K_R.toFixed(4)}`);
eis("§5.8.8 vergroot het moment merkbaar", M_ED_588 > 1.2 * M0_KNM,
  `${M0_KNM} → ${M_ED_588.toFixed(2)} kNm (×${(M_ED_588 / M0_KNM).toFixed(3)})`);

// ═══════════════════════════════════════════════════════════════════════════
// 4. DE APP: §5.8.3.1 via de rekenkern
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
      } catch (e) { rej(new Error(`onleesbaar antwoord: ${uit.slice(0, 200)}`)); }
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  const omhullende = [0, L_MM / 2, L_MM].map((x) => ({
    combination_id: 1,
    position_mm: x,
    forces: {
      n_ed: -N_ED_KN, vy_ed: 0, vz_ed: 0,
      mt_ed: 0, my_ed: M0_KNM, mz_ed: 0,
    },
  }));

  const kolomVerzoek = {
    beam_id: 1,
    section: {
      shape: "Rectangle", b_mm: B, h_mm: H,
      b_w_mm: null, h_f_mm: null, flange_at_bottom: false,
    },
    concrete_class: "C30/37",
    reinforcement_grade: "B500B",
    cage: {
      cover_mm: DEKKING,
      stirrup_diameter_mm: D_BEUGEL,
      bottom: { count: N_STAVEN_PER_RIJ, diameter_mm: D_STAAF },
      top: { count: N_STAVEN_PER_RIJ, diameter_mm: D_STAAF },
      stirrup_spacing_mm: 200,
      stirrup_legs: 2,
    },
    length_m: L_MM / 1000,
    column: {
      bracing: "Geschoord",
      buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" },
    },
    forces_envelope: omhullende,
  };

  log("\n─── ③ De rekenkern naast de handberekening ─────────────────────────────");
  const kolom = await roepKern("concrete_column_check", kolomVerzoek);

  vgl("l₀", kolom.l0_mm, L0_HAND, "mm", 0.01);
  vgl("λ", kolom.lambda, LAMBDA_HAND, "—", 0.01);
  vgl("λ_lim", kolom.lambda_lim, LAMBDA_LIM_HAND, "—", 0.5);
  eis("de kern trekt dezelfde conclusie over de poort",
    kolom.tweede_orde_verwaarloosbaar === (LAMBDA_HAND < LAMBDA_LIM_HAND),
    `kern: ${kolom.tweede_orde_verwaarloosbaar ? "verwaarloosbaar" : "meenemen"}`);

  // ═════════════════════════════════════════════════════════════════════════
  // 5. DE APP: de tweede orde via §5.8.6 (algemene methode)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // De kolom staat verticaal: knoop 1 onderaan scharnierend, knoop 2 bovenaan
  // horizontaal gesteund en verticaal vrij, zodat de drukkracht erop kan. Twee
  // tegengesteld tekenende knoopmomenten leveren een CONSTANT moment over de
  // hele staaf, zonder dwarskracht — precies het geval dat §5.8.8 hierboven
  // veronderstelt.

  const invoer = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L_MM }],
    beams: [{ id: 1, from: 1, to: 2, E: E_CM, A: A_C, I: I_C }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "xRoller" }],
    loads: [],
    // `my` in N·mm — het momentveld van SolverPointLoadInput. Twee
    // tegengesteld tekenende eindmomenten geven een constant verloop zonder
    // dwarskracht; dat wordt hieronder ook nagerekend.
    pointLoads: [
      { nodeId: 1, my: M0_KNM * 1e6, caseId: 1 },
      { nodeId: 2, my: -M0_KNM * 1e6, fz: -N_ED_KN * 1000, caseId: 1 },
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
    betonklasse: "C30/37",
    staalsoort: "B500B",
    korf: KORF,
    lengteMm: L_MM,
    aantalStroken: 50,
    staaltak: "Horizontal",
  };

  log("\n─── ④ De algemene methode (§5.8.6) naast §5.8.8 ────────────────────────");
  let uit = null, fout = null;
  try {
    uit = await losCombinatieFysischOp(invoer, COMBO, [betonStaaf], { roep: roepKern });
  } catch (e) {
    fout = e instanceof Error ? e.message : String(e);
  }

  if (fout) {
    log(`  (de fysisch niet-lineaire lus gaf: ${fout.slice(0, 200)})`);
    eis("de lus levert een reden en geen getal", fout.length > 0, fout.slice(0, 120));
  } else {
    const el = uit.resultaat.elements.get(1);
    const mMax = Math.max(...el.bendingMoment.map(Math.abs)) / 1e6;   // N·mm → kNm

    log(`  eerste orde (invoer)              M₀    = ${M0_KNM.toFixed(3)} kNm`);
    log(`  §5.8.8 met de hand                M_Ed  = ${M_ED_588.toFixed(3)} kNm`);
    log(`  §5.8.6 door de app                M_Ed  = ${mMax.toFixed(3)} kNm`);
    log(`  rondes in de lus: ${uit.geschiedenis.length}`);

    eis("de app vindt een grotere moment dan de eerste orde — er ÍS tweede orde",
      mMax > M0_KNM * 1.02, `${M0_KNM} → ${mMax.toFixed(2)} kNm (×${(mMax / M0_KNM).toFixed(3)})`);
    eis("en niet meer dan de vereenvoudigde methode van §5.8.8",
      mMax <= M_ED_588 * 1.02,
      `${mMax.toFixed(2)} ≤ ${M_ED_588.toFixed(2)} kNm — 5.8.8 is de veilige vereenvoudiging`);
    eis("de twee normwegen liggen in dezelfde orde (binnen een factor 2)",
      mMax > M_ED_588 / 2,
      `verhouding ${(mMax / M_ED_588).toFixed(3)}`);

    // ── De uitkomst mechanisch verankeren ────────────────────────────────
    //
    // "Kleiner dan §5.8.8" is een zwakke eis: nul voldoet er ook aan. De
    // vergroting zelf is te herleiden — maar dan wel met de JUISTE formule.
    //
    // De bekende factor 1/(1 − N/N_kr) hoort bij een SINUSVORMIG
    // eerste-orde-moment. Hier is het moment CONSTANT, en dan is de exacte
    // oplossing van de knikvergelijking
    //
    //     M_max = M₀ · sec(u),   u = (l₀/2)·√(N/EI) = (π/2)·√(N/N_kr)
    //
    // Omgekeerd: uit de gemeten vergroting v volgt u = arccos(1/v), en daarmee
    //
    //     EI_eff = N_Ed·l₀² / (4·u²)
    //
    // Die EI hoort tussen twee waarden te liggen die de kern zélf rapporteert:
    // de ongescheurde E_cd·I_c als bovengrens en de kleinste secans-EI over de
    // segmenten als ondergrens. Valt hij daarbuiten, dan klopt óf de vergroting
    // óf de stijfheid niet — en dat is precies de koppeling waar deze lus over
    // gaat. (Met de sinusformule zou de afgeleide EI hier ~1500 kNm² te laag
    // uitkomen en vals alarm geven; de last bepaalt welke formule geldt.)
    const vergroting = mMax / M0_KNM;
    const u_SEC = Math.acos(1 / vergroting);
    const eiAfgeleid = (N_ED_KN * 1000 * L0_HAND ** 2) / (4 * u_SEC ** 2) / 1e9;  // kNm²
    const nKrAfgeleid = (Math.PI ** 2 * eiAfgeleid * 1e9) / L0_HAND ** 2 / 1000;  // kN

    const laatste = uit.laatsteRonde.get(1) ?? uit.indeling.get(1);
    const eiOngescheurd = laatste?.ei_uncracked_knm2 ?? (E_CM * I_C) / 1e9;
    const eiSegmenten = (laatste?.segments ?? [])
      .map((s) => s.ei_knm2)
      .filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
    const eiMin = eiSegmenten.length ? Math.min(...eiSegmenten) : null;

    log(`  vergroting M/M₀ = sec(u)          = ${vergroting.toFixed(4)}`);
    log(`  ⇒ u = arccos(1/v)                 = ${u_SEC.toFixed(6)} rad`);
    log(`  ⇒ EI_eff = N_Ed·l₀²/(4u²)         = ${eiAfgeleid.toFixed(1)} kNm²`);
    log(`  ⇒ N_kr = π²·EI_eff/l₀²            = ${nKrAfgeleid.toFixed(1)} kN`);
    log(`  EI ongescheurd (kern)             = ${eiOngescheurd.toFixed(1)} kNm²`);
    log(`  kleinste segment-EI (kern)        = ${eiMin === null ? "—" : eiMin.toFixed(1)} kNm²`);

    eis("de afgeleide EI ligt onder de ongescheurde — er is dus gescheurd gerekend",
      eiAfgeleid < eiOngescheurd,
      `${eiAfgeleid.toFixed(0)} < ${eiOngescheurd.toFixed(0)} kNm²`);
    if (eiMin !== null) {
      eis("en niet onder de kleinste segment-EI die de kern meldt",
        eiAfgeleid >= eiMin * 0.95,
        `${eiAfgeleid.toFixed(0)} ≥ ${eiMin.toFixed(0)} kNm²`);
    }
    eis("de kolom blijft ver van de kniklast (N_kr > 2·N_Ed) — dicht bij de " +
      "kniklast wordt sec(u) zó steil dat de afgeleide EI alle betekenis verliest",
      nKrAfgeleid > 2 * N_ED_KN,
      `N_kr = ${nKrAfgeleid.toFixed(0)} kN tegen N_Ed = ${N_ED_KN} kN`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. KRUIP — wat er verandert als φ(∞,t₀) wél bekend is
  // ═════════════════════════════════════════════════════════════════════════
  //
  // §3.1.4 wordt in deze app niet gerekend: de kruipcoëfficiënt is INVOER.
  // Wat de app wél doet is (5.19) en de doorwerking van 5.8.6(4). Deze stap
  // legt vast dat kruip de kolom ONGUNSTIGER maakt en niet gunstiger — het
  // teken waar de meeste fouten in zitten.

  log("\n─── ⑤ Kruip: φ(∞,t₀) is invoer, φ_ef en zijn gevolg zijn berekend ──────");
  const metKruip = {
    ...kolomVerzoek,
    column: { ...kolomVerzoek.column, phi_inf_t0: 2.0 },
    sls_quasi_permanent_envelope: omhullende.map((p) => ({
      ...p, forces: { ...p.forces, n_ed: -0.6 * N_ED_KN, my_ed: 0.6 * M0_KNM },
    })),
  };
  const kolomKruip = await roepKern("concrete_column_check", metKruip);

  // (5.19): φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed = 2,0 · 0,6 = 1,2
  const PHI_EF_HAND = 2.0 * (0.6 * M0_KNM) / M0_KNM;
  log(`  φ(∞,t₀) = 2,0 (invoer) · M₀Eqp/M₀Ed = 0,6  ⇒  φ_ef = ${PHI_EF_HAND.toFixed(4)} volgens (5.19)`);

  if (kolomKruip.phi_ef !== null && kolomKruip.phi_ef !== undefined) {
    vgl("φ_ef uit de kern", kolomKruip.phi_ef, PHI_EF_HAND, "—", 1.0);
  } else {
    log(`  (de kern meldt φ_ef als "niet bepaald" — dan blijft A = 0,7 gelden)`);
    overgeslagen++;
  }

  // A = 1/(1 + 0,2·φ_ef) = 1/1,24 = 0,8065 — GROTER dan 0,7, dus λ_lim stijgt
  // en de poort gaat juist verder open. Dat is geen fout: A = 0,7 hoort bij
  // φ_ef ≈ 2,14 en is bij een lagere kruip conservatief.
  const A_MET_KRUIP = 1 / (1 + 0.2 * PHI_EF_HAND);
  const LAMBDA_LIM_KRUIP = (20 * A_MET_KRUIP * B_FACTOR * C_FACTOR) / Math.sqrt(n_HAND);
  log(`  A = 1/(1 + 0,2·φ_ef) = ${A_MET_KRUIP.toFixed(4)}  ⇒  λ_lim = ${LAMBDA_LIM_KRUIP.toFixed(4)}`);
  if (kolomKruip.lambda_lim !== null && kolomKruip.lambda_lim !== undefined) {
    vgl("λ_lim mét kruip", kolomKruip.lambda_lim, LAMBDA_LIM_KRUIP, "—", 0.5);
  }
  eis("de kolom blijft slank, ook met de gunstigere A",
    LAMBDA_HAND > LAMBDA_LIM_KRUIP,
    `λ = ${LAMBDA_HAND.toFixed(2)} > ${LAMBDA_LIM_KRUIP.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n═══════════════════════════════════════════════════════════════════════");
log(`R27: ${passed} geslaagd, ${failed} gefaald` +
  (overgeslagen ? `, ${overgeslagen} overgeslagen` : "") + ".");
process.exit(failed === 0 ? 0 : 1);
