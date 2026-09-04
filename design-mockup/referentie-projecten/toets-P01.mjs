/**
 * P01 — enkele vrij opgelegde ligger IPE 180 (doorbraak), L = 2 700 mm.
 *
 * Geval P01 uit de reeks projectvalidaties: een bestaande projectberekening
 * uit het eigen archief (uitdraai van het externe raamwerkprogramma,
 * NEN-EN 1993-1-1+C2+A1/NB:2016, gevolgklasse CC1, geometrisch niet-lineair)
 * wordt in Open FEM2D Studio nagebouwd en de gepubliceerde uitkomsten worden
 * naast de onze gelegd. Alleen het technisch noodzakelijke is overgenomen:
 * geometrie, profiel, materiaal, opleggingen, belastingen, combinaties en de
 * gerapporteerde getallen. De referentiewaarden staan LETTERLIJK in `REF`
 * en worden hier NIET bijgesteld.
 *
 * Wat dit script doet:
 *   1. bouwt het model en schrijft het als `P01.femp` (serializeProject);
 *   2. leest het bestand terug en rekent het door via de volledige app-route
 *      (deserializeProject → bouwMultiInput → solveAllCasesNonlinear →
 *      combineResults per combinatie), dus 2e-orde zoals de bron;
 *   3. haalt de normtoetsing op via de dev-brug (POST /api/toetsing op de
 *      dev-server, poort 1440) met exact de invoer die de app zelf bouwt
 *      (buildSteelCheckInputs);
 *   4. legt elke referentiewaarde naast onze uitkomst met de afwijking in %.
 *
 * Draaien vanuit design-mockup:  npx tsx referentie-projecten/toets-P01.mjs
 * (dev-server moet draaien voor de toetsing; zonder brug worden alleen de
 * raamwerkgrootheden vergeleken en wordt dat expliciet gemeld.)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AANNAMES (expliciet)
 *  - Eigen gewicht: de bron voegt het automatisch toe als q = −0,185 kN/m
 *    (18,8 kg/m). Hier staat `selfWeightEnabled: true`, zodat de app-eigen
 *    route (ρ·A·g met A uit onze profieldatabase) getoetst wordt; het
 *    verschil met −0,185 is < 0,5 % en wordt onder [1] apart gemeten.
 *  - Doorbuigingsgrenzen: de bron toetst w_eind op L/250 en w_bijk op L/333.
 *    De app kent per staaf één instelbare noemer (voor w_fin); de noemer
 *    voor w_add ligt in de kern vast op L/150. Het model krijgt daarom
 *    klasse "custom" met noemer 250 voor w_fin; de w_add-toets van de bron
 *    wordt onder [7] met de hand uit onze zakkingen herleid.
 *  - Blijvend BGT-deel: de app geeft `deflection_permanent_mm = 0` door
 *    (w_add = w_fin, veilig-zijdig). Onder [7] draait dezelfde toetsing nóg
 *    een keer mét de zakking onder de blijvende BGT-combinatie ingevuld.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solveAllCases, solveAllCasesNonlinear } =
  await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject, combinationsFromFile } =
  await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { eigenGewichtPerMeter } = await import("../src/lib/sectionResolver.ts");
const { buildSteelCheckInputs, profileLookupKey } =
  await import("../src/lib/steelCheckBuilder.ts");
const { STEEL_SECTIONS } = await import("../src/lib/steelSections.generated.ts");
const { STEEL_SECTION_DIMS } = await import("../src/lib/steelSectionDims.generated.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ═══════════════════════════════════════════════════════════════════════════
// 0. REFERENTIEWAARDEN uit de projectberekening (letterlijk, niet aanpassen)
// ═══════════════════════════════════════════════════════════════════════════
const L_MM = 2700;
const REF = {
  // Eigen gewicht (automatisch in de bron)
  q_eg: -0.185,            // kN/m
  eg_totaal_kg: 50,        // kg (bron rondt af; 18,8 kg/m × 2,7 m = 50,8)
  // Oplegreacties UGT (kN), per combinatie
  Fz_K1_c1: 28.468, Fz_K2_c1: 28.468,
  Fz_K1_c2: 39.562, Fz_K2_c2: 39.562,
  // Omhullende staafkrachten UGT
  N_min: 0.0, N_max: 0.0,  // kN
  V_abs_max: 39.562,       // kN (combinatie 2, x = 0)
  M_min: 0.0, M_max: 26.704, // kNm (combinatie 2, x = 1 350)
  x_Mmax: 1350,            // mm
  // BGT knoopverplaatsingen
  dz_max: 0.0, dx_max: 0.0,            // mm
  ry_K1_c3: 3.5, ry_K1_c5: 7.1,        // mrad (|dr|)
  // Veldzakking (UC-blok, combinatie 5 = G + Q)
  w_c5: -6.0,              // mm ("-6"), limiet 2700/250 = 10,8 → UC 0,56
  w_bijk: -3.1,            // mm (w_c5 − w_c3), limiet 2700/333 = 8,1 → UC 0,38
  // Unity checks (staaf 1, IPE 180, S235, klasse 1)
  uc_625: 0.68, uc_626: 0.26, uc_628: 0.68, uc_6321: 0.99,
  uc_w_eind: 0.56, uc_w_bijk: 0.38, uc_max: 0.99,
  // Tussenwaarden uit de UC-berekening
  Mpl_Rd: 39.131,          // kNm (Wpl,y·fy/γM0)
  Vpl_Rd: 152.8,           // kN  (Av·fy/√3/γM0, Av = 1 126 mm²)
  q_equiv: 29.305,         // kN/m (equivalente belasting in het kipveld)
  Mcr: 36.066,             // kNm
  chi_LT: 0.674, chi_LT_mod: 0.693, kc: 0.94, f_mod: 0.974,
  lambda_LT: 1.042,
  Mb_Rd: 27.1,             // kNm
  z_a: 90,                 // mm (aangrijpingspunt belasting)
  // Profielgegevens IPE 180 zoals de bron ze gebruikt
  prof: { A: 2396, Iy: 13177594, Iz: 1008559, Wel_y: 146418, Wpl_y: 166517,
          Wpl_z: 34607, Av: 1126, It: 48104, Iw: 7.0e9, massa: 18.8 },
};

// ═══════════════════════════════════════════════════════════════════════════
// Telwerk
// ═══════════════════════════════════════════════════════════════════════════
let regels = [];
const alleRegels = [];
/** Vergelijking; ref = 0 → alleen "is onze waarde ook (bijna) nul". */
function vgl(grootheid, ref, ons, eenheid = "", opm = "", telt = true) {
  const dev = ref === 0
    ? (Math.abs(ons) < 1e-6 ? 0 : NaN)
    : ((ons - ref) / Math.abs(ref)) * 100;
  const r = { grootheid, ref, ons, dev, eenheid, opm, telt };
  regels.push(r);
  if (telt) alleRegels.push(r);
  return dev;
}
function getal(v) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1e7) return v.toExponential(4);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
function tabel(titel, rijen) {
  log(`\n${titel}`);
  log("─".repeat(118));
  log("grootheid".padEnd(48) + "referentie".padStart(13) + "onze waarde".padStart(14) +
      "Δ".padStart(10) + "   opmerking");
  log("─".repeat(118));
  for (const r of rijen) {
    const ref = typeof r.ref === "number" ? getal(r.ref) : String(r.ref);
    const ons = getal(r.ons);
    const dev = r.dev === null ? "—"
      : Number.isNaN(r.dev) ? "n.v.t." : `${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(2)} %`;
    const vlag = (r.dev !== null && !Number.isNaN(r.dev) && Math.abs(r.dev) > 2) ? " ⚠" : "  ";
    log(r.grootheid.padEnd(48) + (ref + (r.eenheid ? " " + r.eenheid : "")).padStart(13) +
        ons.padStart(14) + dev.padStart(10) + vlag + " " + r.opm);
  }
  log("─".repeat(118));
}

log("═".repeat(118));
log("P01 — vrij opgelegde ligger IPE 180, L = 2,7 m, G = 11,7 kN/m + eigen gewicht, Q = 12,2 kN/m (woonfunctie)");
log("═".repeat(118));

// ═══════════════════════════════════════════════════════════════════════════
// 1. MODEL BOUWEN EN OPSLAAN ALS P01.femp
// ═══════════════════════════════════════════════════════════════════════════
const model = {
  nodes: [
    { id: 1, x: 0, z: 0 },
    { id: 2, x: L_MM, z: 0 },
  ],
  beams: [
    {
      id: 1, from: 1, to: 2, material: "S235", profile: "IPE180",
      checkConfig: {
        // Geen kipsteunen (bron: "Aantal kipsteunen: 0"); kniklengte = L.
        lateralRestraints: [],
        lateralRestraintsBottom: [],
        // Bron toetst w_eind op L/250 (vloer volgens de nationale bijlage).
        deflectionClass: "custom",
        deflectionLimitNumerator: 250,
        preCamber_mm: 0,
      },
    },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },   // K1: Tx + Tz
    { nodeId: 2, type: "zRoller" },  // K2: Tz
  ],
  plates: [],
  loads: [
    // BG1 permanent — het eigen gewicht komt via selfWeightEnabled (zie kop).
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -11.7 },
    // BG2 veranderlijk — A: woonfunctie (ψ0 = 0,4; ψ1 = 0,5; ψ2 = 0,3).
    { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -12.2 },
  ],
  loadCases: [
    { id: 1, name: "BG1 Permanent (incl. eigen gewicht)", type: "dead" },
    { id: 2, name: "BG2 Veranderlijk (A: woonfunctie)", type: "live" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: true,
  nonlinearEnabled: true,   // bron: geometrisch niet-lineaire krachtsverdeling
  combinations: [
    // UGT — factoren zoals de bron ze afdrukt (ψ × γ), CC1: γG = 1,22/1,08, γQ = 1,35
    { id: 1, name: "UGT 6.10a", type: "uls", formula: "1,22·G + 0,40·1,35·Q",
      factors: { 1: 1.22, 2: 0.40 * 1.35 } },
    { id: 2, name: "UGT 6.10b", type: "uls", formula: "1,08·G + 1,35·Q",
      factors: { 1: 1.08, 2: 1.35 } },
    // BGT
    { id: 3, name: "BGT blijvend", type: "sls", formula: "1,0·G",
      factors: { 1: 1.0 } },
    { id: 4, name: "BGT quasi-blijvend", type: "sls", formula: "1,0·G + 0,3·Q",
      factors: { 1: 1.0, 2: 0.3 } },
    { id: 5, name: "BGT karakteristiek", type: "sls", formula: "1,0·G + 1,0·Q",
      factors: { 1: 1.0, 2: 1.0 } },
  ],
  toelichting:
    "Projectvalidatie P01: vrij opgelegde ligger IPE 180 (S235), L = 2700 mm, " +
    "twee steunpunten, verdeelde lasten G = 11,7 kN/m (+ eigen gewicht) en " +
    "Q = 12,2 kN/m. Combinatiefactoren CC1 volgens de nationale bijlage. " +
    "Doorbuigingsgrens w_fin = L/250 (custom).",
};

mkdirSync(HIER, { recursive: true });
const femp = serializeProject(model);
const pad = join(HIER, "P01.femp");
writeFileSync(pad, femp, "utf8");
log(`\nModel opgeslagen: ${pad}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2. DOORREKENEN VIA DE APP-ROUTE (bestand → solver → combinaties)
// ═══════════════════════════════════════════════════════════════════════════
const terug = deserializeProject(femp);
const multi = bouwMultiInput({
  nodes: terug.nodes, beams: terug.beams, supports: terug.supports, plates: terug.plates,
  loadCases: terug.loadCases, loads: terug.loads,
  selfWeightEnabled: terug.selfWeightEnabled,
  scheefstandEnabled: terug.scheefstandEnabled ?? false,
  scheefstandNoemer: terug.scheefstandNoemer ?? 200,
  scheefstandRichting: terug.scheefstandRichting ?? 1,
});
const perCase = (terug.nonlinearEnabled ? solveAllCasesNonlinear : solveAllCases)(multi).perCase;
const combos = combinationsFromFile(terug.combinations);
const res = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
const R = (id) => res.get(id);
const el = (id) => R(id).elements.get(1);

// ── [1] Eigen gewicht ─────────────────────────────────────────────────────
regels = [];
const qEg = eigenGewichtPerMeter("S235", "IPE180");            // kN/m
vgl("Eigen gewicht q (ρ·A·g uit onze profieldata)", REF.q_eg, qEg, "kN/m",
    "bron: 18,8 kg/m × 9,81");
vgl("Totaal eigen gewicht", REF.eg_totaal_kg, Math.abs(qEg) * (L_MM / 1000) / 9.81 * 1000, "kg",
    "bron rondt op hele kg; 18,8 × 2,7 = 50,8 kg", false);
tabel("[1] Eigen gewicht (automatisch, in BG1)", regels);

// ── [2] Oplegreacties UGT ─────────────────────────────────────────────────
regels = [];
for (const [cid, naam] of [[1, "6.10a"], [2, "6.10b"]]) {
  const r1 = R(cid).reactions.get(1), r2 = R(cid).reactions.get(2);
  vgl(`K1 Fz, combinatie ${cid} (${naam})`, REF[`Fz_K1_c${cid}`], r1.fz / 1e3, "kN");
  vgl(`K2 Fz, combinatie ${cid} (${naam})`, REF[`Fz_K2_c${cid}`], r2.fz / 1e3, "kN");
  vgl(`K1 Fx, combinatie ${cid}`, 0, r1.fx / 1e3, "kN", "bron: leeg (0)");
  vgl(`K1 My, combinatie ${cid}`, 0, r1.my / 1e6, "kNm", "bron: leeg (0)");
}
tabel("[2] Oplegreacties UGT per combinatie", regels);

// ── [3] Omhullende staafkrachten UGT ──────────────────────────────────────
regels = [];
{
  let Nmin = Infinity, Nmax = -Infinity, Vabs = 0, Mmin = Infinity, Mmax = -Infinity;
  let xM = 0, cM = 0, cV = 0;
  for (const cid of [1, 2]) {
    const e = el(cid);
    for (let i = 0; i < e.stations_mm.length; i++) {
      Nmin = Math.min(Nmin, e.normalForce[i]); Nmax = Math.max(Nmax, e.normalForce[i]);
      if (Math.abs(e.shearForce[i]) > Vabs) { Vabs = Math.abs(e.shearForce[i]); cV = cid; }
      Mmin = Math.min(Mmin, e.bendingMoment[i]);
      if (e.bendingMoment[i] > Mmax) { Mmax = e.bendingMoment[i]; xM = e.stations_mm[i]; cM = cid; }
    }
  }
  vgl("N min (omhullend)", REF.N_min, Nmin / 1e3, "kN");
  vgl("N max (omhullend)", REF.N_max, Nmax / 1e3, "kN");
  vgl("|V| max (omhullend)", REF.V_abs_max, Vabs / 1e3, "kN", `combinatie ${cV}`);
  vgl("M min (omhullend)", REF.M_min, Mmin / 1e6, "kNm");
  vgl("M max (omhullend)", REF.M_max, Mmax / 1e6, "kNm", `combinatie ${cM}`);
  vgl("x van M max", REF.x_Mmax, xM, "mm", "station 10 van 21");
  // Handformule als derde partij: q₂ = 1,08·(11,7 + |q_eg|) + 1,35·12,2
  const q2 = 1.08 * (11.7 + Math.abs(qEg)) + 1.35 * 12.2;
  vgl("M max handformule q·L²/8 (met ons eigen gewicht)", REF.M_max, q2 * 2.7 * 2.7 / 8, "kNm",
      `q₂ = ${q2.toFixed(4)} kN/m`, false);
}
tabel("[3] Omhullende staafkrachten UGT (over combinaties 1 en 2, 21 stations)", regels);

// ── [4] BGT knoopverplaatsingen ───────────────────────────────────────────
regels = [];
{
  let dzMax = 0, dxMax = 0;
  for (const cid of [3, 4, 5]) {
    for (const nid of [1, 2]) {
      const d = R(cid).displacements.get(nid);
      dzMax = Math.max(dzMax, Math.abs(d.uz)); dxMax = Math.max(dxMax, Math.abs(d.ux));
    }
  }
  vgl("max |dz| knopen (BGT)", REF.dz_max, dzMax, "mm", "opleggingen → exact 0");
  vgl("max |dx| knopen (BGT)", REF.dx_max, dxMax, "mm", "K2 rolt, maar er is geen N → 0");
  const ry = (cid, nid) => Math.abs(R(cid).displacements.get(nid).ry) * 1e3;
  vgl("|dr| K1, combinatie 3 (G)", REF.ry_K1_c3, ry(3, 1), "mrad", "bron rondt op 0,1 mrad");
  vgl("|dr| K1, combinatie 5 (G + Q)", REF.ry_K1_c5, ry(5, 1), "mrad");
  vgl("|dr| K2, combinatie 3 (G)", REF.ry_K1_c3, ry(3, 2), "mrad", "symmetrie");
  vgl("|dr| K2, combinatie 5 (G + Q)", REF.ry_K1_c5, ry(5, 2), "mrad");
}
tabel("[4] BGT knoopverplaatsingen (omhullend over combinaties 3, 4, 5)", regels);

// ── [5] Veldzakking ───────────────────────────────────────────────────────
regels = [];
const wVeld = (cid) => {
  const e = el(cid);
  let w = 0;
  for (const v of e.deflection) if (Math.abs(v) > Math.abs(w)) w = v;
  return w;
};
const w5 = wVeld(5), w3 = wVeld(3);
vgl("w veld, combinatie 5 (G + Q)", REF.w_c5, w5, "mm", "bron: \"-6\" (afgerond op 0,1 mm)");
vgl("w bijkomend = w(5) − w(3)", REF.w_bijk, w5 - w3, "mm", "bron: -6 + 3 = -3,1");
{
  // Handformule 5qL⁴/(384EI) met de E·I uit de bron als derde partij.
  const EI = 210000 * REF.prof.Iy;
  const q5 = 11.7 + Math.abs(qEg) + 12.2;
  vgl("w(5) handformule 5qL⁴/384EI (EI van de bron)", REF.w_c5,
      -(5 * q5 * L_MM ** 4) / (384 * EI), "mm", "controle op de bron zelf", false);
}
tabel("[5] Veldzakking BGT (maximum over de 21 stations)", regels);

// ═══════════════════════════════════════════════════════════════════════════
// 3. NORMTOETSING VIA DE DEV-BRUG (zelfde kern als de app)
// ═══════════════════════════════════════════════════════════════════════════
async function roepKern(opdracht, inputs) {
  let laatste = null;
  for (const host of ["http://localhost:1440", "http://127.0.0.1:1440"]) {
    try {
      const antwoord = await fetch(`${host}/api/toetsing`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opdracht, inputs }),
      });
      const data = await antwoord.json().catch(() => null);
      if (!antwoord.ok || (data && typeof data === "object" && "fout" in data)) {
        throw new Error(data?.fout ?? `De rekenkern antwoordde met status ${antwoord.status}.`);
      }
      return data;
    } catch (e) {
      laatste = e;
    }
  }
  throw laatste;
}

const ucVan = (r, id) => {
  const c = r.checks.find((c) => c.id === id);
  return c?.kind?.data?.uc?.uc ?? NaN;
};
const rdVan = (r, id) => r.checks.find((c) => c.id === id)?.kind?.data?.uc?.rd ?? NaN;
const edVan = (r, id) => r.checks.find((c) => c.id === id)?.kind?.data?.uc?.ed ?? NaN;
const tussen = (r, id, patroon) => {
  const c = r.checks.find((c) => c.id === id);
  const lijst = [
    ...(c?.kind?.data?.intermediate_values ?? []),
    ...(c?.kind?.data?.variables ?? []),
  ];
  const v = lijst.find((v) => patroon.test(v.symbol));
  return v ? v.value : NaN;
};

let toetsOk = false;
let toetsRegels = [];
let varRegels = [];
let toetsFout = "";
try {
  const profielen = await roepKern("list_steel_profiles");
  const profileDb = new Map();
  for (const p of profielen) {
    const k = profileLookupKey(p.name);
    if (!profileDb.has(k)) profileDb.set(k, p);
  }
  const bouw = buildSteelCheckInputs({
    nodes: terug.nodes, beams: terug.beams, combinations: combos,
    combinationResults: res, profileDb,
  });
  if (bouw.skipped.length) {
    for (const s of bouw.skipped) log(`  overgeslagen: staaf ${s.beamId} — ${s.reason}`);
  }
  const invoer = bouw.inputs[0];
  log("\n[6] Toetsinvoer zoals de app hem bouwt (BeamCheckInput)");
  log("─".repeat(118));
  log(`  profiel ${invoer.profile_name}, ${invoer.steel_grade}, L = ${invoer.length_m} m, ` +
      `kipsteunen boven/onder: ${JSON.stringify(invoer.lateral_bracing.top_flange_positions)} / ` +
      `${JSON.stringify(invoer.lateral_bracing.bottom_flange_positions)}`);
  log(`  kniklengten y/z = ${invoer.buckling_length_y_m} / ${invoer.buckling_length_z_m} m, ` +
      `gevolgklasse ${invoer.consequence_class}, doorbuigingsklasse ${invoer.deflection_limit_class} ` +
      `(L/${invoer.deflection_limit_numerator})`);
  log(`  w_max BGT = ${invoer.deflection_actual_max_mm.toFixed(3)} mm, w_perm = ${invoer.deflection_permanent_mm} mm, ` +
      `zeeg = ${invoer.pre_camber_mm} mm, q_equiv = ${invoer.q_equiv_n_per_mm.toFixed(3)} N/mm, z_a = ${invoer.z_a_mm} mm`);
  log(`  omhullende: ${invoer.forces_envelope.length} krachtpunten (combinaties ` +
      `${[...new Set(invoer.forces_envelope.map((p) => p.combination_id))].join(", ")})`);
  log("─".repeat(118));

  const [uit] = await roepKern("check_steel_beams", [invoer]);

  regels = [];
  vgl("Doorsnedeklasse", 1, uit.classification === "Class1" ? 1 : NaN, "", `kern: ${uit.classification}`);
  vgl("UC 6.2.5 buigend moment", REF.uc_625, ucVan(uit, "6.2.5_bending_y"), "",
      `combinatie ${uit.checks.find((c) => c.id === "6.2.5_bending_y")?.kind.data.force_state.combination_id}, ` +
      `x = ${uit.checks.find((c) => c.id === "6.2.5_bending_y")?.kind.data.force_state.position_mm} mm`);
  vgl("  M_pl,Rd", REF.Mpl_Rd, rdVan(uit, "6.2.5_bending_y"), "kNm");
  vgl("UC 6.2.6 dwarskracht", REF.uc_626, ucVan(uit, "6.2.6_shear_z"), "",
      `x = ${uit.checks.find((c) => c.id === "6.2.6_shear_z")?.kind.data.force_state.position_mm} mm`);
  vgl("  V_pl,Rd", REF.Vpl_Rd, rdVan(uit, "6.2.6_shear_z"), "kN");
  vgl("UC 6.2.8 buiging + dwarskracht", REF.uc_628, ucVan(uit, "6.2.8_combined_mv"), "");
  vgl("UC 6.3.2.1 kipstabiliteit", REF.uc_6321, ucVan(uit, "6.3.2_ltb"), "", "maatgevend in de bron");
  vgl("  M_b,Rd", REF.Mb_Rd, rdVan(uit, "6.3.2_ltb"), "kNm");
  vgl("  q_equiv (kipveld)", REF.q_equiv, invoer.q_equiv_n_per_mm, "kN/m", "8·M/L², zelfde afleiding");
  vgl("  z_a (aangrijpingspunt)", REF.z_a, invoer.z_a_mm, "mm", "h/2, bovenflens");
  const mcr = tussen(uit, "6.3.2_ltb", /M_?\{?cr/i);
  const lam = tussen(uit, "6.3.2_ltb", /lambda\}?_\{?LT\}?$/i);
  const chi = tussen(uit, "6.3.2_ltb", /chi\}?_\{?LT\}?$/i);
  const chiMod = tussen(uit, "6.3.2_ltb", /chi\}?_\{?LT,?\s*mod/i);
  vgl("  M_cr", REF.Mcr, mcr, "kNm", Number.isNaN(mcr) ? "symbool niet gevonden — zie dump" : "");
  vgl("  λ̄_LT", REF.lambda_LT, lam, "", Number.isNaN(lam) ? "symbool niet gevonden — zie dump" : "");
  vgl("  χ_LT", REF.chi_LT, chi, "", Number.isNaN(chi) ? "symbool niet gevonden — zie dump" : "");
  vgl("  χ_LT,mod", REF.chi_LT_mod, chiMod, "", Number.isNaN(chiMod) ? "symbool niet gevonden — zie dump" : "");
  vgl("UC doorbuiging w_eind (L/250)", REF.uc_w_eind, ucVan(uit, "deflection_w_fin"), "",
      `w = ${edVan(uit, "deflection_w_fin").toFixed(2)} mm, grens ${rdVan(uit, "deflection_w_fin").toFixed(2)} mm`);
  vgl("UC doorbuiging w_bijk — app-route", REF.uc_w_bijk, ucVan(uit, "deflection_w_add"), "",
      `app: w_perm = 0 én grens L/150 (kern) — niet vergelijkbaar, zie [7]`, false);
  vgl("UC max", REF.uc_max, uit.uc_max, "", `maatgevend: ${uit.governing_check_id}`);
  toetsRegels = regels;
  tabel("[6] Unity checks via de brug (invoer exact zoals de app hem bouwt)", regels);

  // Alle kip-tussenwaarden afdrukken zodat de lezer de keten kan volgen.
  const ltb = uit.checks.find((c) => c.id === "6.3.2_ltb")?.kind.data;
  if (ltb) {
    log("  tussenwaarden kiptoets (kern):");
    for (const v of [...(ltb.variables ?? []), ...(ltb.intermediate_values ?? [])]) {
      log(`    ${v.symbol.padEnd(28)} ${getal(v.value).padStart(14)} ${v.unit}`);
    }
    for (const n of ltb.notes ?? []) log(`    opmerking kern: ${n}`);
  }
  // Volledige lijst van toetsen met UC (ter informatie)
  log("  alle toetsen uit de kern:");
  for (const c of uit.checks) {
    const d = c.kind.data;
    const uc = d.uc ? d.uc.uc.toFixed(3) : "—";
    log(`    ${c.id.padEnd(24)} ${String(d.status).padEnd(14)} UC ${uc.padStart(7)}  ${d.title}`);
  }

  // ── [7] Variant: blijvend BGT-deel ingevuld ────────────────────────────
  // De app geeft w_perm = 0 door; de bron trekt de zakking onder de blijvende
  // BGT-combinatie (3) af. Zelfde kern, alleen dat ene veld gevuld.
  regels = [];
  const invoerVar = { ...invoer, deflection_permanent_mm: w3 };
  const [uitVar] = await roepKern("check_steel_beams", [invoerVar]);
  const wAdd = edVan(uitVar, "deflection_w_add");
  vgl("w_bijk = w_fin − w_perm (kern)", Math.abs(REF.w_bijk), wAdd, "mm", `w_perm = ${w3.toFixed(3)} mm`);
  vgl("UC w_bijk met grens L/333 (bron)", REF.uc_w_bijk, wAdd / (L_MM / 333), "",
      "handmatig: kern houdt L/150 aan");
  vgl("UC w_bijk zoals de kern hem geeft (L/150)", REF.uc_w_bijk, ucVan(uitVar, "deflection_w_add"), "",
      "andere grens → geen fout, wel een conventieverschil", false);
  vgl("UC w_eind (ongewijzigd)", REF.uc_w_eind, ucVan(uitVar, "deflection_w_fin"), "");
  varRegels = regels;
  tabel("[7] Variant: zelfde toetsing mét zakking onder BGT-blijvend als w_perm", regels);
  toetsOk = true;
} catch (e) {
  toetsFout = e instanceof Error ? e.message : String(e);
  log("\n[6] Normtoetsing NIET nagerekend — brug onbereikbaar");
  log("─".repeat(118));
  log(`  ${toetsFout}`);
  log("  Start de dev-server (npm run dev in design-mockup, poort 1440) en draai opnieuw.");
  log("─".repeat(118));
}

// ── [8] Profieldata naast de bron ─────────────────────────────────────────
regels = [];
{
  const s = STEEL_SECTIONS["IPE180"], d = STEEL_SECTION_DIMS["IPE180"].props;
  vgl("IPE 180: A", REF.prof.A, s.A, "mm²");
  vgl("IPE 180: Iy", REF.prof.Iy, s.Iy, "mm⁴");
  vgl("IPE 180: Iz", REF.prof.Iz, d.iz, "mm⁴");
  vgl("IPE 180: Wel,y", REF.prof.Wel_y, d.welY, "mm³");
  vgl("IPE 180: Wpl,y", REF.prof.Wpl_y, d.wplY, "mm³");
  vgl("IPE 180: Wpl,z", REF.prof.Wpl_z, d.wplZ, "mm³");
  vgl("IPE 180: Av,z", REF.prof.Av, d.avZ, "mm²");
  vgl("IPE 180: It", REF.prof.It, d.it, "mm⁴", "bron: Roark geval 26");
  vgl("IPE 180: Iw", REF.prof.Iw, d.iw, "mm⁶", "bron: (h−t)²·b³·t/24 (benadering)");
}
const profielRegels = regels;
tabel("[8] Onze profieldatabase naast de doorsnedegegevens in de bron", regels);

// ═══════════════════════════════════════════════════════════════════════════
// SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
function samenvat(naam, rijen) {
  const met = rijen.filter((r) => r.telt && Number.isFinite(r.dev));
  if (met.length === 0) { log(`  ${naam}: geen vergelijkingen`); return 0; }
  const grootste = met.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), met[0]);
  const boven2 = met.filter((r) => Math.abs(r.dev) > 2);
  log(`  ${naam.padEnd(34)} ${String(met.length).padStart(3)} vergelijkingen, grootste ` +
      `${grootste.dev >= 0 ? "+" : ""}${grootste.dev.toFixed(2)} % (${grootste.grootheid.trim()}), ` +
      `${boven2.length} boven 2 %`);
  return Math.max(...met.map((r) => Math.abs(r.dev)));
}
log("\n" + "═".repeat(118));
log("SAMENVATTING P01");
log("═".repeat(118));
const raamwerk = alleRegels.filter((r) => !toetsRegels.includes(r) && !varRegels.includes(r) && !profielRegels.includes(r));
const m1 = samenvat("raamwerk (reacties, N/V/M, w, φ)", raamwerk);
const m2 = toetsOk ? samenvat("unity checks + tussenwaarden", toetsRegels) : 0;
const m3 = toetsOk ? samenvat("variant w_perm ingevuld", varRegels) : 0;
const m4 = samenvat("profieldata", profielRegels);
const nan = alleRegels.filter((r) => r.telt && Number.isNaN(r.dev));
if (nan.length) log(`  niet-nul waar de bron 0 geeft: ${nan.map((r) => r.grootheid.trim()).join("; ")}`);
if (!toetsOk) log(`  toetsing niet nagerekend: ${toetsFout}`);
log("");
log(`  Grootste afwijking raamwerk + toetsing: ${Math.max(m1, m2, m3).toFixed(2)} %` +
    `   (profieldata apart: ${m4.toFixed(2)} %, grootste bij Iw — benaderingsformule in de bron)`);
log("═".repeat(118) + "\n");
