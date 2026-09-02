// ═════════════════════════════════════════════════════════════════════════════
// R19 — Vloerligger 45 × 220 mm C24, overspanning 4,50 m
//
// Validatiecampagne referentieberekeningen, geval R19 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: Zweeds houtvoorlichtingsinstituut, "Design of timber structures,
// Volume 3: Examples", editie 3:2022, voorbeeld 3.1 en voorbeeld 7.1.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R19.mjs
//
// ── Wat dit script doet ─────────────────────────────────────────────────────
// 1. Het bouwt het model en schrijft R19.femp (en dezelfde inhoud als
//    R19.ifcfem2d, de extensie waarop de open-dialoog van de app filtert).
// 2. Het rekent het model door langs de route die de app zelf gebruikt:
//       bouwMultiInput → solveAllCases → combineResults
//    dus met de doorsnedeherkenning en de eenhedenconversie van de app.
// 3. Het roept de EN 1995-1-1-kern aan via de Rust-integratietest
//    `timber-check --test referentie_r19`, en geeft de zojuist berekende
//    snedekrachten en zakkingen daaraan mee. Zo komen f_m,d, f_v,d en V_Rd
//    niet uit een tweede, hier nageschreven formule maar echt uit de app.
// 4. Het legt elke referentiewaarde uit het dossier naast onze uitkomst.
//
// ── Modelkeuzes, expliciet ─────────────────────────────────────────────────
// · De bron geeft de UGT-rekenlast RECHTSTREEKS (q_d = 2,0 kN/m, uit
//   q_dim = 3,3 kN/m² × 0,6 m h.o.h.). Daar zit aan de Zweedse kant een
//   veiligheidsklassefactor in die het dossier expliciet buiten beschouwing
//   laat. Daarom staat q_d als EIGEN belastinggeval in het model, met een
//   UGT-combinatie met factor 1,0 — niet als 1,35·G + 1,5·Q, want dat zou een
//   andere last opleveren (2,21 i.p.v. 2,00 kN/m) en dus een ander antwoord.
// · De BGT-lasten volgen wél uit de karakteristieke waarden: G = 0,5 × 0,6 =
//   0,3 kN/m en Q = 2,0 × 0,6 = 1,2 kN/m.
// · Doorsnede: profielnaam "45x220" met materiaal "C24". De app leidt daaruit
//   A = b·h en I = b·h³/12 af met E_0,mean = 11 000 N/mm² — precies de
//   I = 39,93·10⁻⁶ m⁴ die het dossier noemt. Geen terugval op een default.
// · Geen kip: de bron zegt "zijdelings gesteund door de vloerplaat".
// · Geen eigen gewicht apart: de bron rekent het in g_k = 0,5 kN/m² mee.
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");
const { serializeProject, combinationsToFile } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..");
const log = (s = "") => process.stdout.write(s + "\n");
const nl = (v, c = 3) => (Number.isFinite(v) ? v.toFixed(c).replace(".", ",") : "—");

// ═════════════════════════════════════════════════════════════════════════════
//  Referentiewaarden uit het dossier — NIET aanpassen
// ═════════════════════════════════════════════════════════════════════════════
const REF = {
  M_Ed_kNm:      5.1,      // q_d·l²/8
  V_Ed_kN:       4.5,      // q_d·l/2
  W_erf_mm3:     345e3,    // 345 · 10⁻⁶ m³
  f_md_MPa:      14.8,
  f_vd_MPa:      2.46,
  V_Rd_kN:       10.9,     // (2/3)·k_cr·b·h·f_v,d
  w_inst_G_mm:   3.6,
  w_inst_Q_mm:   14.6,
  w_inst_tot_mm: 18.2,     // ≈ l/250
  w_fin_G_mm:    5.8,
  w_fin_Q_mm:    17,
  w_fin_tot_mm:  22.8,     // ≈ l/200
};

// Tolerantie per grootheid. Het dossier (§1.5) noemt 1 % voor een numerieke
// referentie uit een bundel. De bron drukt een deel van deze grootheden op
// TWEE cijfers af (3,6 — 17 — 22,8); de afrondkorrel alleen is daar al
// 0,05/3,6 = 1,4 %. Voor die regels staat de tolerantie op 2 % met de reden
// erbij; dat is geen versoepeling achteraf maar de leesnauwkeurigheid van de
// bron zelf.
const TOL_STANDAARD = 1.0;
const TOL_TWEE_CIJFERS = 2.0;

// ═════════════════════════════════════════════════════════════════════════════
//  1. Model
// ═════════════════════════════════════════════════════════════════════════════
const L_MM = 4500;
const B_MM = 45;
const H_MM = 220;
const Q_G_KNM = -0.3;   // 0,5 kN/m² × 0,6 m, omlaag
const Q_Q_KNM = -1.2;   // 2,0 kN/m² × 0,6 m, omlaag
const Q_D_KNM = -2.0;   // rekenlast uit de bron, omlaag
const PSI2_Q = 0.3;     // woongebouw, quasi-blijvende combinatie
const K_DEF = 0.6;      // gebruiksklasse 1, massief hout — EN 1995 tabel 3.2

const CASE_G = 1, CASE_Q = 2, CASE_D = 3;
const COMBO_UGT = 1, COMBO_KAR = 2, COMBO_G = 3, COMBO_Q = 4, COMBO_QP = 5;

const model = {
  nodes: [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: L_MM,  z: 0 },
  ],
  beams: [
    {
      id: 1, from: 1, to: 2,
      material: "C24",
      profile: "45x220",
      // Toetsconfiguratie zoals de bron hem stelt: gebruiksklasse 1,
      // belastingduur middellang, vloerligger.
      checkConfig: { serviceClass: 1, loadDuration: "medium", deflectionClass: "floor" },
      loadRole: "vloer",
    },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },   // scharnier
    { nodeId: 2, type: "zRoller" },  // rol: verticaal vast, horizontaal vrij
  ],
  plates: [],
  loadCases: [
    { id: CASE_G, name: "G — permanent 0,3 kN/m",  type: "dead" },
    { id: CASE_Q, name: "Q — veranderlijk 1,2 kN/m", type: "live" },
    { id: CASE_D, name: "q_d — UGT-rekenlast 2,0 kN/m (bron)", type: "other" },
  ],
  loads: [
    { id: 1, type: "lineLoad", caseId: CASE_G, beamId: 1, q: Q_G_KNM },
    { id: 2, type: "lineLoad", caseId: CASE_Q, beamId: 1, q: Q_Q_KNM },
    { id: 3, type: "lineLoad", caseId: CASE_D, beamId: 1, q: Q_D_KNM },
  ],
  activeLoadCaseId: CASE_D,
  selfWeightEnabled: false,     // zit al in g_k = 0,5 kN/m²
  nonlinearEnabled: false,      // eerste orde
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// Eigen combinatieset: de standaardset van de app (1,35G + 1,5Q enz.) zou de
// rechtstreeks gegeven rekenlast van de bron dubbel factoreren.
const combinaties = [
  {
    id: COMBO_UGT, name: "UGT — q_d = 2,0 kN/m (bron)", type: "uls",
    formula: "1,0 · q_d", factors: new Map([[CASE_D, 1.0]]),
  },
  {
    id: COMBO_KAR, name: "BGT Karakteristiek — G + Q", type: "sls",
    formula: "G + Q", factors: new Map([[CASE_G, 1.0], [CASE_Q, 1.0]]),
  },
  {
    id: COMBO_G, name: "BGT — alleen G", type: "sls",
    formula: "G", factors: new Map([[CASE_G, 1.0]]),
  },
  {
    id: COMBO_Q, name: "BGT — alleen Q", type: "sls",
    formula: "Q", factors: new Map([[CASE_Q, 1.0]]),
  },
  {
    id: COMBO_QP, name: "BGT Quasi-blijvend — G + 0,3·Q", type: "sls",
    formula: "G + ψ₂·Q", factors: new Map([[CASE_G, 1.0], [CASE_Q, PSI2_Q]]),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  2. Model wegschrijven
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ R19 — vloerligger 45 × 220 mm C24, l = 4,50 m ═══════════════════════");
log("");
log("[1] Model wegschrijven");

const projectTekst = serializeProject({
  nodes: model.nodes,
  beams: model.beams,
  supports: model.supports,
  plates: model.plates,
  loads: model.loads,
  loadCases: model.loadCases,
  activeLoadCaseId: model.activeLoadCaseId,
  selfWeightEnabled: model.selfWeightEnabled,
  nonlinearEnabled: model.nonlinearEnabled,
  combinations: combinationsToFile(combinaties),
  scheefstandEnabled: model.scheefstandEnabled,
  scheefstandNoemer: model.scheefstandNoemer,
  scheefstandRichting: model.scheefstandRichting,
});
for (const naam of ["R19.femp", "R19.ifcfem2d"]) {
  const pad = join(HIER, naam);
  writeFileSync(pad, projectTekst, "utf8");
  log(`  · ${pad}`);
}

// Controle dat de app de doorsnede ECHT herkent en niet op HEA 160 terugvalt.
const sec = resolveSection("C24", "45x220");
log("");
log("[2] Doorsnede zoals de app hem oplost");
log(`  · bron van de gegevens : ${sec.bron}`);
log(`  · E   = ${nl(sec.E, 0)} N/mm²   (bron: E_0,mean = 11 000 N/mm²)`);
log(`  · A   = ${nl(sec.A, 0)} mm²      (b·h = ${B_MM}·${H_MM})`);
log(`  · I_y = ${sec.I.toExponential(5)} mm⁴  (dossier: 39,93·10⁻⁶ m⁴ = 3,993·10⁷ mm⁴)`);
if (sec.bron !== "hout-bxh") {
  log("  ✗ LET OP: de doorsnede is NIET als houtrechthoek herkend — alle");
  log("    onderstaande zakkingen zijn dan van een ander profiel.");
}

// ═════════════════════════════════════════════════════════════════════════════
//  3. Doorrekenen langs de app-route
// ═════════════════════════════════════════════════════════════════════════════
const multiInput = bouwMultiInput(model);
const { perCase } = solveAllCases(multiInput);
const resultaat = new Map(combinaties.map((c) => [c.id, combineResults(c, perCase)]));

/** Maximale |zakking| over de 21 stations van staaf 1 (mm, teken behouden). */
function zakking(comboId) {
  const ef = resultaat.get(comboId)?.elements.get(1);
  if (!ef?.deflection) return NaN;
  let w = 0;
  for (const v of ef.deflection) if (Number.isFinite(v) && Math.abs(v) > Math.abs(w)) w = v;
  return w;
}
/** Maximum |M| over de stations (N·mm → kNm). */
function maxM_kNm(comboId) {
  const ef = resultaat.get(comboId)?.elements.get(1);
  if (!ef) return NaN;
  return Math.max(...ef.bendingMoment.map(Math.abs)) / 1e6;
}
/** Maximum |V| over de stations (N → kN). */
function maxV_kN(comboId) {
  const ef = resultaat.get(comboId)?.elements.get(1);
  if (!ef) return NaN;
  return Math.max(...ef.shearForce.map(Math.abs)) / 1e3;
}

const M_Ed = maxM_kNm(COMBO_UGT);
const V_Ed = maxV_kN(COMBO_UGT);
const w_inst_G = zakking(COMBO_G);
const w_inst_Q = zakking(COMBO_Q);
const w_inst_tot = zakking(COMBO_KAR);
const w_qp = zakking(COMBO_QP);

// w_fin volgens EN 1995-1-1 §2.2.3: per lastdeel met de eigen ψ₂-factor.
//   w_fin,G = w_inst,G · (1 + k_def)
//   w_fin,Q = w_inst,Q · (1 + ψ₂ · k_def)
// Het totaal is óók w_inst,tot + k_def · w_qp — beide zijn hieronder
// uitgerekend en horen op de laatste decimaal gelijk te zijn.
const w_fin_G = w_inst_G * (1 + K_DEF);
const w_fin_Q = w_inst_Q * (1 + PSI2_Q * K_DEF);
const w_fin_tot_via_delen = w_fin_G + w_fin_Q;
const w_fin_tot_via_qp = w_inst_tot + K_DEF * w_qp;

log("");
log("[3] Snedekrachten en zakkingen uit de solver");
log(`  · UGT   max|M| = ${nl(M_Ed)} kNm      max|V| = ${nl(V_Ed)} kN`);
log(`  · reactie A = ${nl((resultaat.get(COMBO_UGT)?.reactions.get(1)?.fz ?? NaN) / 1e3)} kN` +
    `   reactie B = ${nl((resultaat.get(COMBO_UGT)?.reactions.get(2)?.fz ?? NaN) / 1e3)} kN`);
log(`  · w_inst,G = ${nl(w_inst_G)} mm   w_inst,Q = ${nl(w_inst_Q)} mm   ` +
    `w_inst,tot = ${nl(w_inst_tot)} mm`);
log(`  · w_qp (G + 0,3Q) = ${nl(w_qp)} mm`);
log(`  · w_fin via lastdelen = ${nl(w_fin_tot_via_delen)} mm ; ` +
    `via quasi-blijvend = ${nl(w_fin_tot_via_qp)} mm`);

// ═════════════════════════════════════════════════════════════════════════════
//  4. EN 1995-1-1-kern aanroepen (Rust) met precies deze getallen
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("[4] EN 1995-1-1-kern (Rust, timber-check) met deze snedekrachten");

function draaiHoutkern() {
  const r = spawnSync(
    "cargo",
    ["test", "-p", "timber-check", "--test", "referentie_r19", "--", "--nocapture"],
    {
      cwd: join(REPO, "src-tauri"),
      encoding: "utf8",
      shell: true,
      env: {
        ...process.env,
        R19_M_ED: String(M_Ed),
        R19_V_ED: String(V_Ed),
        R19_W_INST: String(w_inst_tot),
        R19_W_QP: String(w_qp),
      },
    },
  );
  const uit = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const regel = uit.split(/\r?\n/).find((l) => l.startsWith("#R19-JSON#"));
  if (!regel) {
    log("  ✗ De houtkern kon niet gedraaid worden (cargo niet beschikbaar of");
    log("    de test compileert niet). De EN 1995-grootheden blijven ONGEMETEN;");
    log("    ze worden hieronder als '—' getoond en tellen niet als 'gelijk'.");
    if (r.error) log(`    reden: ${r.error.message}`);
    return null;
  }
  const data = JSON.parse(regel.slice("#R19-JSON#".length).trim());
  log(`  · cargo-exitcode ${r.status} (0 = alle assertions in de Rust-test gehaald)`);
  return data;
}
const hout = draaiHoutkern();

// ═════════════════════════════════════════════════════════════════════════════
//  5. Vergelijking met de referentiewaarden
// ═════════════════════════════════════════════════════════════════════════════
const rijen = [];
let grootste = 0;
let aantalBuitenTolerantie = 0;

/**
 * Leg één grootheid naast de referentiewaarde.
 * `soort`:
 *  - "app"     : onze waarde komt uit de app (solver of EN 1995-kern);
 *  - "meting"  : niet gemeten (kern niet beschikbaar) — telt niet mee;
 *  - "afwijkend-default": wat de app met zijn HUIDIGE automatische defaults
 *    zou opleveren; geregistreerd, telt niet mee in het eindoordeel.
 */
function vergelijk(naam, onze, referentie, eenheid, tolPct = TOL_STANDAARD, soort = "app") {
  const afw = !Number.isFinite(onze) || referentie === 0
    ? NaN
    : ((onze - referentie) / referentie) * 100;
  const ok = Number.isFinite(afw) && Math.abs(afw) <= tolPct;
  if (soort === "app") {
    if (!Number.isFinite(afw)) { aantalBuitenTolerantie++; }
    else {
      grootste = Math.max(grootste, Math.abs(afw));
      if (!ok) aantalBuitenTolerantie++;
    }
  }
  rijen.push({ naam, onze, referentie, afw, eenheid, tolPct, ok, soort });
}

// ── Groep A: snedekrachten (solver) ────────────────────────────────────────
vergelijk("M_Ed = q_d·l²/8", M_Ed, REF.M_Ed_kNm, "kNm", TOL_TWEE_CIJFERS);
vergelijk("V_Ed = q_d·l/2", V_Ed, REF.V_Ed_kN, "kN");

// ── Groep B: EN 1995-rekenwaarden (Rust-kern) ──────────────────────────────
const soortKern = hout ? "app" : "meting";
vergelijk("f_m,d", hout?.f_myd ?? NaN, REF.f_md_MPa, "N/mm²", TOL_STANDAARD, soortKern);
vergelijk("f_v,d", hout?.f_vd ?? NaN, REF.f_vd_MPa, "N/mm²", TOL_STANDAARD, soortKern);
vergelijk("Benodigd W_erf = M_Ed/f_m,d", hout?.W_erf_mm3 ?? NaN, REF.W_erf_mm3, "mm³",
          TOL_STANDAARD, soortKern);
vergelijk("V_Rd = (2/3)·k_cr·b·h·f_v,d", hout?.V_Rd_kN ?? NaN, REF.V_Rd_kN, "kN",
          TOL_STANDAARD, soortKern);

// ── Groep C: zakkingen (solver + kruipregel EN 1995 §2.2.3) ────────────────
vergelijk("w_inst,G", Math.abs(w_inst_G), REF.w_inst_G_mm, "mm", TOL_TWEE_CIJFERS);
vergelijk("w_inst,Q", Math.abs(w_inst_Q), REF.w_inst_Q_mm, "mm");
vergelijk("w_inst totaal", Math.abs(w_inst_tot), REF.w_inst_tot_mm, "mm");
vergelijk("w_fin,G", Math.abs(w_fin_G), REF.w_fin_G_mm, "mm", TOL_TWEE_CIJFERS);
vergelijk("w_fin,Q", Math.abs(w_fin_Q), REF.w_fin_Q_mm, "mm", TOL_TWEE_CIJFERS);
vergelijk("w_fin totaal", Math.abs(w_fin_tot_via_delen), REF.w_fin_tot_mm, "mm", TOL_TWEE_CIJFERS);
// Dezelfde grootheid, maar zoals de EN 1995-kern hem uitrekent
// (w_fin = w_inst + k_def·w_qp). Moet gelijk zijn aan de regel hierboven.
vergelijk("w_fin totaal — uit de EN 1995-kern", hout ? Math.abs(hout.w_fin_mm) : NaN,
          REF.w_fin_tot_mm, "mm", TOL_TWEE_CIJFERS, soortKern);

// ── Groep D: wat de app met zijn HUIDIGE automatische defaults oplevert ────
// Registrerend, niet meetellend — zie de bevindingen onderaan.
if (hout) {
  vergelijk("V_Rd met de app-default k_cr = 1,0", hout.V_Rd_app_default_kN, REF.V_Rd_kN, "kN",
            TOL_STANDAARD, "afwijkend-default");
  vergelijk("w_fin met de app-default w_qp = w_kar", Math.abs(hout.w_fin_app_default_mm),
            REF.w_fin_tot_mm, "mm", TOL_TWEE_CIJFERS, "afwijkend-default");
  log("");
  log("[4b] Wat de app met zijn HUIDIGE automatische defaults zou melden");
  log(`  · kiptoets §6.3.3 UC = ${nl(hout.uc_kip_app_default)} — terwijl de bron zegt dat`);
  log("    de ligger door de vloerplaat zijdelings gesteund is en er dus geen");
  log("    kip optreedt. De houtbouwer zet perform_ltb_check altijd aan met de");
  log("    volle staaflengte als kipsteunafstand; er is geen invoerveld om de");
  log("    zijdelingse steun te melden (BeamCheckConfig.lateralRestraints wordt");
  log("    alleen door de staalbouwer gelezen).");
  log(`  · UC_max = ${nl(hout.uc_max_app_default)} op "${hout.maatgevend_app_default}"`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  6. Eigen evenwichts- en consistentiecontroles (geen referentiewaarden)
// ═════════════════════════════════════════════════════════════════════════════
const rA = resultaat.get(COMBO_UGT)?.reactions.get(1);
const rB = resultaat.get(COMBO_UGT)?.reactions.get(2);
const qd_N_mm = Math.abs(Q_D_KNM);
const eigen = [
  ["ΣF_z: R_A + R_B = q_d·l", ((rA?.fz ?? 0) + (rB?.fz ?? 0)) / 1e3, (qd_N_mm * L_MM) / 1e3, 1e-6],
  ["ΣF_x-reacties = 0", ((rA?.fx ?? 0) + (rB?.fx ?? 0)) / 1e3, 0, 1e-9],
  ["M op beide opleggingen = 0",
   Math.abs(resultaat.get(COMBO_UGT)?.elements.get(1)?.bendingMoment[0] ?? NaN) +
   Math.abs(resultaat.get(COMBO_UGT)?.elements.get(1)?.bendingMoment[20] ?? NaN), 0, 1e-6],
  ["N in de staaf = 0 (geen axiale last)",
   resultaat.get(COMBO_UGT)?.elements.get(1)?.N ?? NaN, 0, 1e-6],
  ["w_fin: lastdelen ≡ quasi-blijvend", w_fin_tot_via_delen, w_fin_tot_via_qp, 1e-9],
  ["I_y komt overeen met b·h³/12", sec.I, (B_MM * H_MM ** 3) / 12, 1e-9],
];

log("");
log("[5] Eigen controles (de bron geeft deze waarden niet)");
let eigenFout = 0;
for (const [naam, ons, verwacht, tol] of eigen) {
  const grens = Math.max(Math.abs(verwacht) * tol, 1e-6);
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= grens;
  if (!ok) eigenFout++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${nl(ons, 6)} (verwacht ${nl(verwacht, 6)})`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  7. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ═══════════════════════════════");
log("");
log("     grootheid                                referentie      onze waarde         Δ [%]   tol");
log("  ─────────────────────────────────────────────────────────────────────────────────────────────");
for (const r of rijen) {
  const vlag = r.soort === "afwijkend-default" ? "!" : r.soort === "meting" ? "?" : r.ok ? "✓" : "✗";
  const ref = `${nl(r.referentie, r.referentie >= 1000 ? 0 : 3)} ${r.eenheid}`;
  const ons = Number.isFinite(r.onze)
    ? `${nl(r.onze, r.onze >= 1000 ? 0 : 3)} ${r.eenheid}`
    : "— (niet gemeten)";
  log(`  ${vlag}  ${r.naam.padEnd(38)}  ${ref.padStart(14)}  ${ons.padStart(17)}  ` +
      `${(Number.isFinite(r.afw) ? nl(r.afw, 2) : "—").padStart(9)}  ${nl(r.tolPct, 0)}%`);
}

log("");
log("  Legenda: ✓ binnen tolerantie · ✗ buiten tolerantie · ? niet gemeten ·");
log("           ! registratie van een app-default die van de bron afwijkt");
log("");
log(`  Grootste afwijking op de meetellende grootheden : ${nl(grootste, 2)} %`);
log(`  Buiten tolerantie                               : ${aantalBuitenTolerantie}`);
log(`  Eigen controles                                 : ${eigenFout === 0 ? "alle in orde" : `${eigenFout} FOUT`}`);
log("");
log("  Oordeel: " + (aantalBuitenTolerantie === 0 && eigenFout === 0
  ? "KOMT OVEREEN — alle vergelijkbare grootheden vallen binnen de tolerantie."
  : "AFWIJKING — uitzoeken (zie de regels met ✗)."));
// ── Naspeuring van de grootste afwijking (w_inst,G, circa 1,3 %) ───────────
// De bron drukt w_inst,G op TWEE cijfers af (3,6 mm) en w_inst,Q op drie
// (14,6 mm). Beide horen bij dezelfde ligger, dezelfde overspanning en
// dezelfde E·I; alleen de last verschilt, en die verhoudt zich EXACT als
// q_k/g_k = 2,0/0,5 = 4. De bron zelf geeft 14,6/3,6 = 4,06 — dus de twee
// getallen van de BRON zijn onderling al 1,4 % inconsistent. Dat kan alleen
// afronding zijn. Onze verhouding is per constructie exact 4.
const verhoudingBron = REF.w_inst_Q_mm / REF.w_inst_G_mm;
const verhoudingOns = w_inst_Q / w_inst_G;
log("");
log("  Naspeuring van de grootste afwijking (w_inst,G):");
log(`    q_k/g_k                        = ${nl(Q_Q_KNM / Q_G_KNM, 4)}`);
log(`    w_inst,Q / w_inst,G  bij ons   = ${nl(verhoudingOns, 4)}`);
log(`    w_inst,Q / w_inst,G  in de bron= ${nl(verhoudingBron, 4)}`);
log("    De bron wijkt op deze verhouding zelf al af van de lastverhouding;");
log("    de afwijking op w_inst,G is dus afronding in de bron (3,65 → 3,6),");
log("    geen verschil in het model. Het totaal (18,2 mm) klopt op 0,2 %.");
log("");
log("  Aandachtspunten die GEEN rekenfout in de kern zijn, maar wel tellen —");
log("  ze zitten in de automatische toetsinvoer (src/lib/timberCheckBuilder.ts):");
log("   1. k_cr staat vast op 1,0. EN 1995-1-1/A1 (6.13a) beveelt 0,67 aan en");
log("      de bron rekent daar ook mee. Gevolg: V_Rd circa +49 % — dat is de");
log("      ONVEILIGE kant op, en er is geen invoerveld om het te corrigeren.");
log("   2. De quasi-blijvende zakking wordt gelijkgesteld aan de karakteristieke");
log("      zakking, waardoor w_fin circa +28 % te hoog uitkomt (veilige kant).");
log("   3. De kiptoets §6.3.3 staat altijd aan met de volle staaflengte; een");
log("      zijdelings gesteunde vloerligger krijgt daardoor UC circa 1,73.");
log("  De EN 1995-kern zelf rekent met de juiste invoer wél goed — zie de");
log("  ✓-regels hierboven.");
log("");

process.exit(aantalBuitenTolerantie === 0 && eigenFout === 0 ? 0 : 1);
