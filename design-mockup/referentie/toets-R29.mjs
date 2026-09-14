// ═══════════════════════════════════════════════════════════════════════════
// R29 — DUBBELE BUIGING (§5.8.9): de handberekening naast de kern.
// ═══════════════════════════════════════════════════════════════════════════
//
// DE GESCHIEDENIS VAN DEZE REFERENTIE
// R29 is ontstaan als vangnet: een kolom met M_y = 40 kNm en M_z = 35 kNm
// leverde exact dezelfde toetsen als dezelfde kolom met M_z = 0, en nergens
// stond dat een moment om de tweede as buiten beschouwing was gebleven. De
// kern ging dat MELDEN (toets `5.8.9_dubbele_buiging`, status NotApplicable),
// en dit bestand bewaakte die melding en rekende met de hand uit wat §5.8.9
// zou vragen — als ankerpunt voor wie de paragraaf ooit zou bouwen.
//
// Die paragraaf is nu gebouwd. De handberekening van ② is dus niet langer een
// belofte maar een controle: de kern hoort (5.38a), (5.38b), N_Rd en de
// exponent a op dezelfde getallen uit te komen. Wat dit bestand nu bewaakt:
//   ① §5.8.9(3) en (4) met de hand, onafhankelijk van de app;
//   ② de kern geeft voor DEZE kolom dezelfde voorwaarden, dezelfde a en een
//      interactie (5.39) met een unity check — geen "niet uitgevoerd" meer;
//   ③ zonder M_z bestaan de toetsen om de tweede as óók (M_Edz is dan niet nul
//      door de imperfectie van §5.2), maar mag het apart: geen interactie-uc;
//   ④ de M_y-uitkomsten (λ, λ_lim, l₀, de poort) veranderen niet met M_z.
//
// DE KOLOM
// Dezelfde als R27 (300 × 300, C30/37, B500B, 2×3Ø20, l = 6,00 m, geschoord,
// N_Ed = 600 kN, M_y = 40 kNm), met M_z = 35 kNm erbij. Een vierkante kolom,
// zodat λ_y = λ_z en (5.38a) triviaal is: dan hangt alles aan (5.38b).
//
// Draaien: npx tsx referentie/toets-R29.mjs   (vanuit design-mockup/)
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

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DE KOLOM
// ═══════════════════════════════════════════════════════════════════════════

const B = 300, H = 300, L_MM = 6000;
const DEKKING = 30, D_BEUGEL = 8, D_STAAF = 20, N_PER_RIJ = 3;
const N_ED_KN = 600, M_Y_KNM = 40, M_Z_KNM = 35;

const F_CK = 30, F_YK = 500;
const GAMMA_C = 1.5, GAMMA_S = 1.15, ALPHA_CC = 1.0;
const F_CD = ALPHA_CC * F_CK / GAMMA_C;
const F_YD = F_YK / GAMMA_S;
const A_C = B * H;
const A_S = 2 * N_PER_RIJ * Math.PI * (D_STAAF / 2) ** 2;

log("═══════════════════════════════════════════════════════════════════════");
log("R29 — Dubbele buiging: kolom 300×300, N_Ed = 600 kN, M_y = 40 kNm, M_z = 35 kNm");
log("═══════════════════════════════════════════════════════════════════════");

// ═══════════════════════════════════════════════════════════════════════════
// 2. §5.8.9 MET DE HAND
// ═══════════════════════════════════════════════════════════════════════════
//
// 5.8.9(3): de twee richtingen mogen APART worden getoetst als
//   (5.38a) λ_y/λ_z ≤ 2 en λ_z/λ_y ≤ 2, en
//   (5.38b) (e_y/h_eq)/(e_z/b_eq) ≤ 0,2  óf  (e_z/b_eq)/(e_y/h_eq) ≤ 0,2
// met e_y = M_Edz/N_Ed, e_z = M_Edy/N_Ed en h_eq = b_eq = i·√12 voor een
// vierkant. Is aan (5.38) niet voldaan, dan 5.8.9(4), de interactie (5.39):
//   (M_Edz/M_Rdz)^a + (M_Edy/M_Rdy)^a ≤ 1
// met a uit de tabel bij N_Ed/N_Rd: 1,0 bij 0,1 · 1,5 bij 0,7 · 2,0 bij 1,0,
// lineair ertussen; N_Rd = A_c·f_cd + A_s·f_yd.
//
// LET OP: de kern neemt in M_Edz ook de imperfectie van §5.2 en het
// tweede-orde-deel om z mee (5.8.9: "inclusief tweede-orde-moment"). De
// handberekening hieronder gebruikt het KALE model-M_z = 35 kNm; de kern komt
// daardoor op een grotere e_y uit, en dat maakt (5.38b) hier alleen maar
// duidelijker onvervuld. De exponent a en N_Rd hangen niet van M_z af en
// horen exact overeen te komen.

const i_MM = H / Math.sqrt(12);
const LAMBDA_Y = L_MM / i_MM, LAMBDA_Z = L_MM / i_MM;   // vierkant: gelijk
const H_EQ = i_MM * Math.sqrt(12), B_EQ = i_MM * Math.sqrt(12);
const E_Y = (M_Z_KNM * 1e6) / (N_ED_KN * 1e3);         // mm
const E_Z = (M_Y_KNM * 1e6) / (N_ED_KN * 1e3);

const VOORW_A = LAMBDA_Y / LAMBDA_Z <= 2 && LAMBDA_Z / LAMBDA_Y <= 2;
const VERH_1 = (E_Y / H_EQ) / (E_Z / B_EQ);
const VERH_2 = (E_Z / B_EQ) / (E_Y / H_EQ);
const VOORW_B = VERH_1 <= 0.2 || VERH_2 <= 0.2;
const APART_TOEGESTAAN = VOORW_A && VOORW_B;

const N_RD_KN = (A_C * F_CD + A_S * F_YD) / 1000;
const VERH_N = N_ED_KN / N_RD_KN;
function exponentA(nv) {
  if (nv <= 0.1) return 1.0;
  if (nv <= 0.7) return 1.0 + ((nv - 0.1) / 0.6) * 0.5;
  if (nv <= 1.0) return 1.5 + ((nv - 0.7) / 0.3) * 0.5;
  return 2.0;
}
const A_EXP = exponentA(VERH_N);

// De imperfectie van §5.2 om z, met θ₀ = 1/300 (nationale bijlage):
//   α_h = 2/√6 = 0,8165; α_m = 1; θ_i = 0,8165/300 = 0,0027217
//   e_i = θ_i·l₀/2 = 0,0027217 · 6000/2 = 8,165 mm
const ALPHA_H = Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(L_MM / 1000)));
const THETA_I = ALPHA_H / 300;
const E_I_MM = THETA_I * L_MM / 2;

log("\n─── ① §5.8.9(3) met de hand: mag het per richting apart? ──────────────");
log(`  i = h/√12 = ${i_MM.toFixed(4)} mm · λ_y = λ_z = ${LAMBDA_Y.toFixed(4)} (vierkant)`);
log(`  (a) λ_y/λ_z = ${(LAMBDA_Y / LAMBDA_Z).toFixed(3)} ≤ 2  →  ${VOORW_A ? "voldaan" : "NIET voldaan"}`);
log(`  e_y = M_z/N = ${E_Y.toFixed(3)} mm · e_z = M_y/N = ${E_Z.toFixed(3)} mm · h_eq = b_eq = ${H_EQ.toFixed(1)} mm`);
log(`  (b) (e_y/h_eq)/(e_z/b_eq) = ${VERH_1.toFixed(4)} · omgekeerd ${VERH_2.toFixed(4)}  →  ` +
  `${VOORW_B ? "één ≤ 0,2: voldaan" : "geen van beide ≤ 0,2: NIET voldaan"}`);
log(`  ⇒ aparte toetsing per richting ${APART_TOEGESTAAN ? "TOEGESTAAN" : "NIET toegestaan — (5.39) is verplicht"}`);
log(`  N_Rd = A_c·f_cd + A_s·f_yd = ${N_RD_KN.toFixed(1)} kN · N_Ed/N_Rd = ${VERH_N.toFixed(4)} · a = ${A_EXP.toFixed(4)}`);
log(`  e_i om z (§5.2, θ₀ = 1/300) = ${E_I_MM.toFixed(3)} mm`);

eis("de eerste voorwaarde van 5.8.9(3) is voor een vierkant triviaal", VOORW_A);
eis("de tweede voorwaarde is hier NIET vervuld — dit geval vraagt écht om (5.39)",
  !APART_TOEGESTAAN, `verhouding ${VERH_1.toFixed(3)}, niet ≤ 0,2 en niet ≥ 5`);
eis("de exponent a ligt tussen 1,0 en 1,5 (N_Ed/N_Rd tussen 0,1 en 0,7)",
  A_EXP > 1.0 && A_EXP < 1.5, `a = ${A_EXP.toFixed(4)}`);

// Een geval waar 5.8.9(3) WÉL apart toestaat: M_z klein tegenover M_y.
{
  const mzKlein = 5;                                  // kNm
  const ez = (mzKlein * 1e6) / (N_ED_KN * 1e3);
  const verh = (ez / B_EQ) / (E_Y / H_EQ);
  log(`  (ter vergelijking, M_z = ${mzKlein} kNm: verhouding ${verh.toFixed(4)} ≤ 0,2 → apart toegestaan)`);
  eis("bij M_z = 5 kNm staat 5.8.9(3) aparte toetsing wél toe", verh <= 0.2,
    `${verh.toFixed(4)} ≤ 0,2`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DE KERN
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

  const verzoek = (mz) => ({
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
      bracing: "Geschoord",
      buckling_length: { soort: "Figuur57", geval: "ScharnierendScharnierend" },
    },
    forces_envelope: [0, L_MM / 2, L_MM].map((x) => ({
      combination_id: 1, position_mm: x,
      forces: { n_ed: -N_ED_KN, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: M_Y_KNM, mz_ed: mz },
    })),
  });

  const vind = (r, id) => r.checks.find((c) => c.kind?.data?.id === id)?.kind?.data;
  const variabele = (t, symbool) => t?.variables?.find((v) => v.symbol === symbool)?.value;
  const ids = (r) => r.checks.map((c) => c.kind?.data?.id).sort();
  const dicht = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

  const zonder = await roepKern("concrete_column_check", verzoek(0));
  const met = await roepKern("concrete_column_check", verzoek(M_Z_KNM));

  log("\n─── ② De kern: §5.8.9 op dezelfde getallen als de hand ────────────────");
  const db = vind(met, "5.8.9_dubbele_buiging");
  eis("mét M_z = 35 kNm staat de toets 5.8.9_dubbele_buiging in het antwoord", db !== undefined);
  if (db) {
    eis("en hij is UITGEVOERD — niet meer NotApplicable", db.status !== "NotApplicable", db.status);
    eis("N_Rd = A_c·f_cd + A_s·f_yd zoals met de hand",
      dicht(variabele(db, "N_Rd"), N_RD_KN, 1e-9), `${variabele(db, "N_Rd")} vs ${N_RD_KN}`);
    eis("de exponent a zoals met de hand",
      dicht(variabele(db, "a"), A_EXP, 1e-9), `${variabele(db, "a")} vs ${A_EXP}`);
    eis("(5.38b) is niet vervuld, dus (5.39) is vereist: er is een unity check",
      db.uc != null && db.notes.some((n) => /§5\.8\.9\(3\) is niet vervuld/.test(n)));
    eis("λ_y = λ_z: (5.38a) is triviaal vervuld",
      dicht(variabele(db, "λ_y"), variabele(db, "λ_z"), 1e-12));
    eis("de afleiding noemt (5.38a), (5.38b), N_Rd, a en (5.39)",
      ["voorwaarde_5_38a", "voorwaarde_5_38b", "n_rd", "exponent_a", "interactie_5_39"]
        .every((id) => db.deelstappen.some((d) => d.id === id)));
    // De som van (5.39) is precies de formule met de gerapporteerde delen.
    const som = (variabele(db, "M_Edz") / variabele(db, "M_Rdz")) ** variabele(db, "a")
      + (variabele(db, "M_Edy") / variabele(db, "M_Rdy")) ** variabele(db, "a");
    eis("de unity check is de som van (5.39) met de gerapporteerde M_Ed en M_Rd",
      dicht(db.uc.uc, som, 1e-12), `${db.uc.uc}`);
    eis("M_Edz ligt boven het model-M_z: de imperfectie en de tweede orde om z zitten erin",
      variabele(db, "M_Edz") > M_Z_KNM, `${variabele(db, "M_Edz")} kNm`);
  }
  const mz = vind(met, "5.8.9_moment_z");
  eis("het moment om z heeft een eigen toets met de imperfectie e_i van §5.2",
    mz !== undefined && dicht(variabele(mz, "e_i"), E_I_MM, 1e-9), `${variabele(mz, "e_i")} vs ${E_I_MM}`);
  eis("λ_z ≥ λ_lim,z: e₂ om z is gerekend en groter dan nul",
    met.tweede_orde_verwaarloosbaar_z === false && met.e_2_z_mm > 0, `e₂ = ${met.e_2_z_mm}`);

  log("\n─── ③ De kern zonder M_z: de tweede as bestaat, maar mag apart ─────────");
  const dbZonder = vind(zonder, "5.8.9_dubbele_buiging");
  eis("ook zonder M_z staan de drie toetsen om z in het antwoord",
    ["5.8.3.1_slankheidsgrens_z", "5.8.9_moment_z", "5.8.9_dubbele_buiging"]
      .every((id) => vind(zonder, id) !== undefined));
  eis("M_Edz is zonder M_z NIET nul — de imperfectie en 6.1(4) zorgen daarvoor",
    zonder.m_edz_knm > 0, `${zonder.m_edz_knm} kNm`);
  eis("(5.38b) is dan vervuld: apart toetsen mag, en er is geen interactie-uc",
    dbZonder !== undefined && dbZonder.status === "Ok" && dbZonder.uc == null);

  log("\n─── ④ De M_y-uitkomsten veranderen niet met M_z ─────────────────────────");
  eis("λ is identiek met en zonder M_z", met.lambda === zonder.lambda, `${met.lambda?.toFixed(4)}`);
  eis("λ_lim is identiek", met.lambda_lim === zonder.lambda_lim, `${met.lambda_lim?.toFixed(4)}`);
  eis("l₀ is identiek", met.l0_mm === zonder.l0_mm);
  eis("de conclusie over de poort is identiek",
    met.tweede_orde_verwaarloosbaar === zonder.tweede_orde_verwaarloosbaar);
  eis("de lijst toetsen is dezelfde — M_z verandert de uitkomst, niet het aantal",
    JSON.stringify(ids(zonder)) === JSON.stringify(ids(met)), `${ids(zonder).length} toetsen`);
  const statusZonder = zonder.checks
    .filter((c) => !c.kind.data.id.startsWith("5.8.9"))
    .map((c) => `${c.kind.data.id}:${c.kind.data.status}`).sort();
  const statusMet = met.checks
    .filter((c) => !c.kind.data.id.startsWith("5.8.9"))
    .map((c) => `${c.kind.data.id}:${c.kind.data.status}`).sort();
  eis("en de statussen buiten §5.8.9 ook",
    JSON.stringify(statusZonder) === JSON.stringify(statusMet));
}

log("\n═══════════════════════════════════════════════════════════════════════");
log(`R29: ${passed} geslaagd, ${failed} gefaald` +
  (overgeslagen ? `, ${overgeslagen} overgeslagen` : "") + ".");
process.exit(failed === 0 ? 0 : 1);
