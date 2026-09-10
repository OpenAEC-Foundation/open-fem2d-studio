// ═══════════════════════════════════════════════════════════════════════════
// R29 — DUBBELE BUIGING (§5.8.9): wat de kern ervan zegt, en wat de norm
//       ervan zou vragen.
// ═══════════════════════════════════════════════════════════════════════════
//
// WAAROM DEZE REFERENTIE ANDERS IS DAN R27 EN R28
// R27 en R28 leggen een uitkomst van de app naast een handberekening. Dat kan
// hier niet: §5.8.9 is in de kern niet gebouwd. Wat er WEL te toetsen valt —
// en wat vóór deze referentie niet klopte — is of de kern dat ZEGT.
//
// De vondst die tot R29 leidde: een kolom met M_y = 40 kNm en M_z = 35 kNm
// leverde exact dezelfde toetsen, dezelfde statussen en dezelfde λ_lim als
// dezelfde kolom met M_z = 0. Nergens in het antwoord stond dat een moment
// om de tweede as buiten beschouwing was gebleven. Voor een rekenprogramma is
// dat de gevaarlijkste soort fout: niet een verkeerd getal, maar een
// onvolledig antwoord dat er volledig uitziet.
//
// Sinds R29 meldt de kern dat als toets `5.8.9_dubbele_buiging` met status
// NotApplicable en de reden erbij, zodra |M_z| meer dan 5 % van |M_y| is.
// Dit bestand bewaakt drie dingen:
//   ① dat die melding er komt als M_z ertoe doet, en niet als M_z ruis is;
//   ② dat de M_y-uitkomsten er NIET door veranderen — het antwoord is
//      onvolledig, niet fout, en dat verschil moet blijven bestaan;
//   ③ wat §5.8.9 voor deze kolom met de hand zou opleveren: de voorwaarden
//      van 5.8.9(2) die een aparte toetsing per richting toestaan, en — als
//      die niet gelden — de exponent a van de interactie (5.39). Zodat wie de
//      paragraaf ooit bouwt een ankerpunt heeft dat níét uit de app komt.
//
// DE KOLOM
// Dezelfde als R27 (300 × 300, C30/37, B500B, 2×3Ø20, l = 6,00 m, geschoord,
// N_Ed = 600 kN, M_y = 40 kNm), nu met M_z = 35 kNm erbij. Een vierkante
// kolom, zodat λ_y = λ_z en de eerste voorwaarde van 5.8.9(2) triviaal is:
// dan hangt alles aan de tweede, de excentriciteitsvoorwaarde.
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
// 2. §5.8.9 MET DE HAND — wat de norm hier zou vragen
// ═══════════════════════════════════════════════════════════════════════════
//
// 5.8.9(2): de twee richtingen mogen APART worden getoetst als
//   (a) λ_y/λ_z ≤ 2 en λ_z/λ_y ≤ 2, en
//   (b) (e_y/h_eq)/(e_z/b_eq) ≤ 0,2  óf  (e_z/b_eq)/(e_y/h_eq) ≤ 0,2
// met e = M/N de excentriciteit en h_eq = b_eq = i·√12 voor een rechthoek.
// Is aan (a) of (b) niet voldaan, dan geldt de interactie (5.39):
//   (M_Edz/M_Rdz)^a + (M_Edy/M_Rdy)^a ≤ 1
// met a uit de tabel bij N_Ed/N_Rd: 1,0 bij 0,1 · 1,5 bij 0,7 · 2,0 bij 1,0,
// lineair ertussen; N_Rd = A_c·f_cd + A_s·f_yd.

const i_MM = H / Math.sqrt(12);
const LAMBDA_Y = L_MM / i_MM, LAMBDA_Z = L_MM / i_MM;   // vierkant: gelijk
const H_EQ = i_MM * Math.sqrt(12), B_EQ = i_MM * Math.sqrt(12);
const E_Y = (M_Y_KNM * 1e6) / (N_ED_KN * 1e3);         // mm
const E_Z = (M_Z_KNM * 1e6) / (N_ED_KN * 1e3);

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

log("\n─── ① §5.8.9(2) met de hand: mag het per richting apart? ──────────────");
log(`  i = h/√12 = ${i_MM.toFixed(4)} mm · λ_y = λ_z = ${LAMBDA_Y.toFixed(4)} (vierkant)`);
log(`  (a) λ_y/λ_z = ${(LAMBDA_Y / LAMBDA_Z).toFixed(3)} ≤ 2  →  ${VOORW_A ? "voldaan" : "NIET voldaan"}`);
log(`  e_y = M_y/N = ${E_Y.toFixed(3)} mm · e_z = M_z/N = ${E_Z.toFixed(3)} mm · h_eq = b_eq = ${H_EQ.toFixed(1)} mm`);
log(`  (b) (e_y/h_eq)/(e_z/b_eq) = ${VERH_1.toFixed(4)} · omgekeerd ${VERH_2.toFixed(4)}  →  ` +
  `${VOORW_B ? "één ≤ 0,2: voldaan" : "geen van beide ≤ 0,2: NIET voldaan"}`);
log(`  ⇒ aparte toetsing per richting ${APART_TOEGESTAAN ? "TOEGESTAAN" : "NIET toegestaan — (5.39) is verplicht"}`);
log(`  N_Rd = A_c·f_cd + A_s·f_yd = ${N_RD_KN.toFixed(1)} kN · N_Ed/N_Rd = ${VERH_N.toFixed(4)} · a = ${A_EXP.toFixed(4)}`);

eis("de eerste voorwaarde van 5.8.9(2) is voor een vierkant triviaal", VOORW_A);
eis("de tweede voorwaarde is hier NIET vervuld — dit geval vraagt écht om (5.39)",
  !APART_TOEGESTAAN, `verhouding ${VERH_1.toFixed(3)}, niet ≤ 0,2 en niet ≥ 5`);
eis("de exponent a ligt tussen 1,0 en 1,5 (N_Ed/N_Rd tussen 0,1 en 0,7)",
  A_EXP > 1.0 && A_EXP < 1.5, `a = ${A_EXP.toFixed(4)}`);

// Een geval waar 5.8.9(2) WÉL apart toestaat: M_z klein tegenover M_y.
{
  const mzKlein = 5;                                  // kNm
  const ez = (mzKlein * 1e6) / (N_ED_KN * 1e3);
  const verh = (ez / B_EQ) / (E_Y / H_EQ);
  log(`  (ter vergelijking, M_z = ${mzKlein} kNm: verhouding ${verh.toFixed(4)} ≤ 0,2 → apart toegestaan)`);
  eis("bij M_z = 5 kNm staat 5.8.9(2) aparte toetsing wél toe", verh <= 0.2,
    `${verh.toFixed(4)} ≤ 0,2`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DE KERN — zegt hij het, en verandert er verder niets?
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

  const vind = (r) => r.checks.find((c) => c.kind?.data?.id === "5.8.9_dubbele_buiging");
  const ids = (r) => r.checks.map((c) => c.kind?.data?.id).sort();

  const zonder = await roepKern("concrete_column_check", verzoek(0));
  const met = await roepKern("concrete_column_check", verzoek(M_Z_KNM));
  const ruis = await roepKern("concrete_column_check", verzoek(0.01 * M_Y_KNM));

  log("\n─── ② De kern: de melding komt wanneer hij moet ────────────────────────");
  const melding = vind(met);
  eis("mét M_z = 35 kNm staat de toets 5.8.9_dubbele_buiging in het antwoord",
    melding !== undefined);
  if (melding) {
    const d = melding.kind.data;
    eis("met status NotApplicable — niet Ok, want er is niets getoetst; niet " +
      "NotOk, want er is niets afgekeurd", d.status === "NotApplicable", d.status);
    eis("en noemt beide momenten in de reden",
      (d.notes ?? []).some((n) => /M_z = 35,0/.test(n) && /M_y = 40,0/.test(n)),
      (d.notes ?? [])[0]?.slice(0, 120));
    eis("en zegt dat de rest ONVOLLEDIG is, niet fout",
      (d.notes ?? []).some((n) => /ONVOLLEDIG/.test(n)));
    eis("en noemt de interactie (5.39) en de exponent a",
      (d.notes ?? []).some((n) => /\(5\.39\)/.test(n) && /exponent|\^a/.test(n)));
    eis("het krachtenpunt bij de melding is dat met de grootste |M_z|",
      Math.abs(d.force_state?.forces?.mz_ed ?? 0) === M_Z_KNM);
  }

  eis("zonder M_z is er GEEN melding — anders is de melding ruis",
    vind(zonder) === undefined);
  eis("bij M_z = 1 % van M_y (afrondingsruis) óók niet",
    vind(ruis) === undefined, `M_z = ${0.01 * M_Y_KNM} kNm`);

  log("\n─── ③ De kern: de M_y-uitkomsten veranderen niet ───────────────────────");
  // Het antwoord is onvolledig, niet fout: λ, λ_lim en de poort horen
  // bit-identiek te blijven. Zou M_z hier ergens in lekken, dan was het
  // ineens een half-gebouwde §5.8.9, en dat is erger dan geen.
  eis("λ is identiek met en zonder M_z", met.lambda === zonder.lambda,
    `${met.lambda?.toFixed(4)}`);
  eis("λ_lim is identiek", met.lambda_lim === zonder.lambda_lim,
    `${met.lambda_lim?.toFixed(4)}`);
  eis("l₀ is identiek", met.l0_mm === zonder.l0_mm);
  eis("de conclusie over de poort is identiek",
    met.tweede_orde_verwaarloosbaar === zonder.tweede_orde_verwaarloosbaar);

  const idsZonder = ids(zonder);
  const idsMet = ids(met).filter((id) => id !== "5.8.9_dubbele_buiging");
  eis("alle overige toetsen zijn dezelfde — de melding komt erbij, vervangt niets",
    JSON.stringify(idsZonder) === JSON.stringify(idsMet),
    `${idsZonder.length} toetsen`);
  const statusZonder = zonder.checks.map((c) => `${c.kind.data.id}:${c.kind.data.status}`).sort();
  const statusMet = met.checks
    .filter((c) => c.kind.data.id !== "5.8.9_dubbele_buiging")
    .map((c) => `${c.kind.data.id}:${c.kind.data.status}`).sort();
  eis("en hun statussen ook",
    JSON.stringify(statusZonder) === JSON.stringify(statusMet));
}

log("\n═══════════════════════════════════════════════════════════════════════");
log(`R29: ${passed} geslaagd, ${failed} gefaald` +
  (overgeslagen ? `, ${overgeslagen} overgeslagen` : "") + ".");
process.exit(failed === 0 ? 0 : 1);
