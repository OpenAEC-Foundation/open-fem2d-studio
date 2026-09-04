/**
 * P03 — stalen dakbalk HEB 160, vrij opgelegd over 3,25 m, met deellasten.
 *
 * Nagebouwd uit een projectberekening uit het eigen archief, gemaakt met het
 * externe raamwerkprogramma (uitdraai als PDF, 11 bladzijden). De bron is
 * geanonimiseerd tot kenmerk P03: hier staan alleen de technische invoer en
 * de gepubliceerde uitkomsten. De verwijzing naar de bron ligt buiten de repo.
 *
 * Norm in de bron: NEN-EN 1993-1-1+C2+A1/NB:2016, gevolgklasse CC1,
 * geometrisch niet-lineaire krachtsverdeling (2e orde).
 *
 * Wat dit script doet:
 *   1. bouwt het model en schrijft het als `P03.femp` (serializeProject);
 *   2. leest dat bestand terug en rekent het via de volledige app-route
 *      (deserializeProject → bouwMultiInput → solveAllCasesNonlinear →
 *      combineResults per combinatie), dus precies wat de app op het scherm zet;
 *   3. haalt de EN 1993-toetsing op via de toetsbrug van de dev-server
 *      (POST /api/toetsing, dezelfde Rust-kern als de app) met de invoer die de
 *      app zelf bouwt (buildSteelCheckInputs);
 *   4. legt elke uitkomst uit de bron naast de onze met de afwijking in %;
 *   5. rekent de statica bovendien met de hand na (gesloten formules en de
 *      eenheidslastmethode) als onafhankelijke derde partij.
 *
 * Draaien vanuit design-mockup (dev-server op poort 1440 moet draaien):
 *   npx tsx referentie-projecten/toets-P03.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AANNAMEN BIJ HET NABOUWEN (expliciet)
 *
 *  - Eigen gewicht: de bron rekent het automatisch mee in BG1 als
 *    q = −0,418 kN/m (42,6 kg/m). Hier staat `selfWeightEnabled: true`, wat
 *    via eigenGewichtPerMeter −0,41797 kN/m geeft (ρ = 7850, A = 5427,5 mm²).
 *    Verschil 0,007 % — verwaarloosbaar, maar wél de app-route.
 *  - Zeeg: de bron rekent de eindzakking met een zeeg van 10 mm
 *    (w_eind = w_z − w_zeeg = −13,6 + 10 = −3,6 mm). In de app is dat
 *    `checkConfig.preCamber_mm = −10` — dezelfde tekenconventie als de zakking,
 *    en dezelfde formule w_fin = w_z − w_zeeg in de kern (deflection.rs).
 *  - Doorbuigingsklasse: de bron toetst w_eind tegen L/250 → klasse "roof".
 *  - Scheefstand: de bron noemt imperfecties (art. 5.3.2), maar toont overal
 *    Nx = 0 en geen Fx-reacties; op een vrij opgelegde ligger zonder kolommen
 *    heeft een scheefstand geen effect. Scheefstand staat hier uit.
 *  - Kipsteunen: 0 (zoals de bron). Kniklengten = systeemlengte.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync } from "node:fs";

const { solveAllCases, solveAllCasesNonlinear } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { buildSteelCheckInputs, profileLookupKey } = await import("../src/lib/steelCheckBuilder.ts");
const { eigenGewichtPerMeter } = await import("../src/lib/sectionResolver.ts");

const log = (s) => process.stdout.write(s + "\n");

// ═══════════════════════════════════════════════════════════════════════════
// 0. INVOER (geanonimiseerd, alleen techniek)
// ═══════════════════════════════════════════════════════════════════════════
const L = 3250;            // mm
const X_KNIK = 1500;       // mm — overgang tussen de twee lastdelen
const PROFIEL = "HEB160";
const MATERIAAL = "S235";
const ZEEG_MM = 10;        // bron: w_zeeg = 10 mm

// Lasten in kN/m (= N/mm), negatief = omlaag. Bron: "vanaf knoop 1, a, L".
const BG1 = [ { q: -38.9, a: 0,      l: 1500 }, { q: -41.2, a: X_KNIK, l: 1750 } ];
const BG2 = [ { q: -7.8,  a: 0,      l: 1500 }, { q: -9.1,  a: X_KNIK, l: 1750 } ];
const Q_EG_BRON = -0.418;  // kN/m, eigen gewicht zoals de bron het meeneemt

// Combinaties zoals de bron ze nummert: factor = ψ × γ (CC1: K_FI = 0,9).
const COMBOS = [
  { id: 1, name: "UGT 6.10a",          type: "uls", formula: "1,22·G + 0,40·1,35·Q", factors: { 1: 1.22, 2: 0.40 * 1.35 } },
  { id: 2, name: "UGT 6.10b",          type: "uls", formula: "1,08·G + 1,35·Q",      factors: { 1: 1.08, 2: 1.35 } },
  { id: 3, name: "BGT blijvend",       type: "sls", formula: "G",                    factors: { 1: 1.0 } },
  { id: 4, name: "BGT quasi-blijvend", type: "sls", formula: "G + 0,30·Q",           factors: { 1: 1.0, 2: 0.30 } },
  { id: 5, name: "BGT karakteristiek", type: "sls", formula: "G + Q",                factors: { 1: 1.0, 2: 1.0 } },
];

// Referentiewaarden LETTERLIJK uit de bron (niet bijstellen).
const REF = {
  // Oplegreacties UGT (kN)
  Fz: { K1: { c1: 86.445, c2: 88.112 }, K2: { c1: 89.279, c2: 91.535 } },
  // Staafkrachten UGT
  N_min: 0, N_max: 0, V_abs_max: 91.535, M_max: 73.199, x_Mmax: 1650.6, M_1625: 73.18,
  // BGT
  w_z: -13.6, w_perm: -11.3, w_bijk: -2.4, w_eind: -3.6,
  Fz_c5: { K1: 78.3, K2: 81.2 }, M_c5_1630: 64.944,
  dz_knoop_max: 0.0, dx_knoop_max: 0.0,
  // Profiel
  A: 5427.5, Iy: 24929151, Iz: 8892613, Wel_y: 311614, Wpl_y: 354113,
  iy: 67.8, iz: 40.5, It: 313664, Iw: 48e9, Av: 1762, G_kgm: 42.6,
  // Weerstanden en unity checks
  Mc_Rd: 83.217, Vpl_Rd: 239.1, Mcr: 221.443, lambda_LT: 0.613, chi_LT: 0.911,
  kc: 0.94, f: 0.972, chi_LT_mod: 0.937, Mb_Rd: 78.0,
  C1: 1.13, C2: -0.461, S: 687, C: 3.309, q_equiv: 55.426, z_a: 80, L_st: 3250,
  UC: { "6.2.5": 0.88, "6.2.6": 0.38, "6.2.8": 0.88, "6.3.2.1": 0.94, w_eind: 0.28, w_bijk: 0.24 },
  UC_max: 0.94, klasse: 1,
  grens_eind: 13, grens_bijk: 9.8,
};

// ═══════════════════════════════════════════════════════════════════════════
// Telwerk
// ═══════════════════════════════════════════════════════════════════════════
let regels = [];
const alleRegels = [];
function vgl(grootheid, ref, ons, eenheid = "", opm = "") {
  const dev = ref === 0
    ? (Math.abs(ons) < 1e-6 ? 0 : NaN)
    : (ons - ref) / Math.abs(ref) * 100;
  const r = { grootheid, ref, ons, dev, eenheid, opm };
  regels.push(r); alleRegels.push(r);
  return dev;
}
function getal(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1e7) return v.toExponential(4);
  if (Math.abs(v) >= 1000) return v.toFixed(1);
  return v.toFixed(Math.abs(v) >= 100 ? 2 : 3);
}
function tabel(titel, rijen) {
  log(`\n${titel}`);
  log("─".repeat(118));
  log("grootheid".padEnd(48) + "bron".padStart(12) + "app".padStart(14) + "Δ".padStart(10) + "  opmerking");
  log("─".repeat(118));
  for (const r of rijen) {
    const dev = Number.isNaN(r.dev) ? "n.v.t." : `${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(2)} %`;
    const vlag = (!Number.isNaN(r.dev) && Math.abs(r.dev) > 2) ? " ⚠" : "  ";
    log(r.grootheid.padEnd(48) + getal(r.ref).padStart(12) + getal(r.ons).padStart(14) +
        dev.padStart(10) + vlag + (r.eenheid ? ` [${r.eenheid}]` : "") + (r.opm ? "  " + r.opm : ""));
  }
  log("─".repeat(118));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MODEL BOUWEN EN OPSLAAN ALS P03.femp
// ═══════════════════════════════════════════════════════════════════════════
const frac = (mm) => mm / L;
const model = {
  nodes: [ { id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 } ],
  beams: [ {
    id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL,
    checkConfig: {
      deflectionClass: "roof",     // bron: w_eind tegen L/250
      preCamber_mm: -ZEEG_MM,      // bron: zeeg 10 mm; kern: w_fin = w_z − w_zeeg
      lateralRestraints: [],       // bron: 0 kipsteunen
    },
  } ],
  supports: [ { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" } ],
  plates: [],
  loads: [
    ...BG1.map((d, i) => ({ id: 1 + i, type: "lineLoad", caseId: 1, beamId: 1, q: d.q, startFrac: frac(d.a), endFrac: frac(d.a + d.l) })),
    ...BG2.map((d, i) => ({ id: 3 + i, type: "lineLoad", caseId: 2, beamId: 1, q: d.q, startFrac: frac(d.a), endFrac: frac(d.a + d.l) })),
  ],
  loadCases: [
    { id: 1, name: "Permanent (incl. eigen gewicht)", type: "dead" },
    { id: 2, name: "Veranderlijk (woonfunctie, ψ0 = 0,40)", type: "live" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: true,     // bron: eigen gewicht automatisch in BG1
  nonlinearEnabled: true,      // bron: geometrisch niet-lineair (2e orde)
  combinations: COMBOS,
  toelichting:
    "Referentiegeval P03 uit het projectarchief (geanonimiseerd): stalen dakbalk " +
    "HEB 160 S235, vrij opgelegd over 3,25 m, deellasten permanent 38,9/41,2 kN/m en " +
    "veranderlijk 7,8/9,1 kN/m (knik op 1,5 m), zeeg 10 mm, eigen gewicht automatisch, " +
    "2e orde. Combinaties conform NB (CC1): 1,22G+0,54Q; 1,08G+1,35Q; BGT G, G+0,3Q, G+Q.",
};

const femp = serializeProject(model);
const pad = new URL("./P03.femp", import.meta.url);
writeFileSync(pad, femp, "utf8");
log("═".repeat(118));
log("P03 — stalen dakbalk HEB 160 S235, vrij opgelegd 3,25 m, deellasten, zeeg 10 mm, 2e orde");
log("═".repeat(118));
log(`Model opgeslagen: ${decodeURIComponent(pad.pathname.replace(/^\//, ""))}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2. APP-ROUTE: bestand terug inlezen en doorrekenen zoals de app dat doet
// ═══════════════════════════════════════════════════════════════════════════
const terug = deserializeProject(femp);
const invoer = {
  nodes: terug.nodes, beams: terug.beams, supports: terug.supports, plates: terug.plates,
  loadCases: terug.loadCases, loads: terug.loads,
  selfWeightEnabled: terug.selfWeightEnabled,
  scheefstandEnabled: terug.scheefstandEnabled ?? false,
  scheefstandNoemer: terug.scheefstandNoemer ?? 200,
  scheefstandRichting: terug.scheefstandRichting ?? 1,
};
const multi = bouwMultiInput(invoer);
const combos = COMBOS.map((c) => ({ ...c, factors: new Map(Object.entries(c.factors).map(([k, v]) => [Number(k), v])) }));

// 2e orde (zoals het bestand zegt) én 1e orde ernaast: zonder normaalkracht
// moeten beide samenvallen — dat is meteen een controle op het 2e-orde-pad.
const perCaseNL = solveAllCasesNonlinear(multi).perCase;
const perCaseL  = solveAllCases(multi).perCase;
const res = new Map(combos.map((c) => [c.id, combineResults(c, perCaseNL)]));
const resL = new Map(combos.map((c) => [c.id, combineResults(c, perCaseL)]));

const el = (cid) => res.get(cid).elements.get(1);
const Fz = (cid, nid) => res.get(cid).reactions.get(nid).fz / 1e3;       // kN
const Mst = (cid, i) => el(cid).bendingMoment[i] / 1e6;                   // kNm
const Vst = (cid, i) => el(cid).shearForce[i] / 1e3;                      // kN
const Nst = (cid, i) => el(cid).normalForce[i] / 1e3;                     // kN
const wMaxMetTeken = (cid) => {
  let w = 0;
  for (const v of el(cid).deflection) if (Math.abs(v) > Math.abs(w)) w = v;
  return w;                                                               // mm, negatief = omlaag
};
const maxAbs = (arr) => Math.max(...arr.map(Math.abs));

// ═══════════════════════════════════════════════════════════════════════════
// 3. HANDAFLEIDING (derde partij): statisch bepaalde ligger, gesloten formules
// ═══════════════════════════════════════════════════════════════════════════
// Lastdelen als (a, b, q) met q in N/mm POSITIEF = omlaag; eigen gewicht zoals
// de bron (0,418 kN/m) zodat deze afleiding volledig los staat van onze code.
function lastdelen(fG, fQ) {
  return [
    { a: 0,      b: L, q: fG * -Q_EG_BRON },
    { a: 0,      b: X_KNIK, q: fG * 38.9 + fQ * 7.8 },
    { a: X_KNIK, b: L, q: fG * 41.2 + fQ * 9.1 },
  ];
}
function handReacties(st) {
  let W = 0, R2 = 0;
  for (const s of st) { const w = s.q * (s.b - s.a); W += w; R2 += w * ((s.a + s.b) / 2) / L; }
  return { R1: W - R2, R2, W };                                           // N
}
function handM(x, st, R1) {                                              // N·mm, doorhangen positief
  let m = R1 * x;
  for (const s of st) {
    if (x <= s.a) continue;
    const xb = Math.min(x, s.b);
    m -= s.q * ((x - s.a) ** 2 - (x - xb) ** 2) / 2;
  }
  return m;
}
function handV(x, st, R1) {                                              // N
  let v = R1;
  for (const s of st) if (x > s.a) v -= s.q * (Math.min(x, s.b) - s.a);
  return v;
}
function handMmax(st, R1) {
  let best = { x: 0, M: -Infinity };
  for (let x = 0; x <= L; x += 0.05) { const m = handM(x, st, R1); if (m > best.M) best = { x, M: m }; }
  return best;
}
// Eenheidslastmethode: w(a) = ∫ M(x)·m(x) dx / EI, m = momentenlijn van een
// eenheidslast in a. Middelpuntsregel met 20 000 stroken (fout ≪ 0,01 %).
const EI = 210000 * REF.Iy;
function handW(a, st, R1) {
  const n = 20000, dx = L / n; let som = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * dx;
    const m = x <= a ? x * (L - a) / L : a * (L - x) / L;
    som += handM(x, st, R1) * m * dx;
  }
  return som / EI;                                                        // mm, positief = omlaag
}
function handWmax(st, R1) {
  let best = { x: 0, w: -Infinity };
  for (let x = 1400; x <= 1900; x += 2) { const w = handW(x, st, R1); if (w > best.w) best = { x, w }; }
  return best;
}
const fac = (cid) => { const c = COMBOS.find((k) => k.id === cid); return [c.factors[1] ?? 0, c.factors[2] ?? 0]; };

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERGELIJKINGEN
// ═══════════════════════════════════════════════════════════════════════════

// ── [1] Interne controles van de app-route ────────────────────────────────
regels = [];
log("\n[1] Interne controles van de app-route");
log("─".repeat(118));
const qEG = eigenGewichtPerMeter(MATERIAAL, PROFIEL);
log(`  eigen gewicht app: ${qEG.toFixed(5)} kN/m   bron: ${Q_EG_BRON} kN/m   Δ ${((qEG - Q_EG_BRON) / Math.abs(Q_EG_BRON) * 100).toFixed(3)} %`);
{
  let maxRel = 0;
  for (const c of combos) {
    const a = res.get(c.id).elements.get(1), b = resL.get(c.id).elements.get(1);
    for (let i = 0; i < 21; i++) {
      for (const k of ["bendingMoment", "shearForce", "deflection"]) {
        const d = Math.abs(a[k][i] - b[k][i]) / Math.max(1e-9, Math.abs(b[k][i]));
        if (Math.abs(b[k][i]) > 1e-6 && d > maxRel) maxRel = d;
      }
    }
  }
  log(`  2e orde t.o.v. 1e orde (N = 0, dus P-Δ = 0): grootste relatieve afwijking ${maxRel.toExponential(2)}`);
  const nAbs = Math.max(...combos.map((c) => maxAbs(el(c.id).normalForce)));
  log(`  normaalkracht in alle combinaties: max |N| = ${(nAbs / 1e3).toExponential(2)} kN (bron: 0)`);
}

// ── [2] Handafleiding naast solver (derde partij) ─────────────────────────
regels = [];
for (const cid of [1, 2, 5]) {
  const [fG, fQ] = fac(cid);
  const st = lastdelen(fG, fQ);
  const { R1, R2 } = handReacties(st);
  const mm = handMmax(st, R1);
  vgl(`c${cid}: R1 solver vs handafleiding`, R1 / 1e3, Fz(cid, 1), "kN");
  vgl(`c${cid}: R2 solver vs handafleiding`, R2 / 1e3, Fz(cid, 2), "kN");
  vgl(`c${cid}: M(1625) solver vs handafleiding`, handM(1625, st, R1) / 1e6, Mst(cid, 10), "kNm");
  vgl(`c${cid}: |V|max solver vs handafleiding`, Math.max(Math.abs(R1), Math.abs(R2)) / 1e3, maxAbs(el(cid).shearForce) / 1e3, "kN");
  if (cid === 5) {
    const wm = handWmax(st, R1);
    vgl(`c${cid}: |w|max solver vs eenheidslastmethode`, wm.w, Math.abs(wMaxMetTeken(cid)), "mm",
        `hand: x = ${wm.x.toFixed(0)} mm`);
  }
  if (cid === 2) log(`  handafleiding c2: M_max = ${(mm.M / 1e6).toFixed(3)} kNm op x = ${mm.x.toFixed(1)} mm (bron 73,199 op 1650,6)`);
}
tabel("[2] Solver naast handafleiding (statisch bepaald, eigen gewicht 0,418 kN/m als in de bron)", regels);
const handRegels = regels;

// ── [3] Oplegreacties UGT ─────────────────────────────────────────────────
regels = [];
vgl("K1 Fz, combinatie 1 (6.10a)", REF.Fz.K1.c1, Fz(1, 1), "kN");
vgl("K1 Fz, combinatie 2 (6.10b)", REF.Fz.K1.c2, Fz(2, 1), "kN");
vgl("K2 Fz, combinatie 1 (6.10a)", REF.Fz.K2.c1, Fz(1, 2), "kN");
vgl("K2 Fz, combinatie 2 (6.10b)", REF.Fz.K2.c2, Fz(2, 2), "kN");
vgl("K1 Fz, BGT karakteristiek (c5)", REF.Fz_c5.K1, Fz(5, 1), "kN", "bron: figuurlabel, 1 decimaal");
vgl("K2 Fz, BGT karakteristiek (c5)", REF.Fz_c5.K2, Fz(5, 2), "kN", "bron: figuurlabel, 1 decimaal");
tabel("[3] Oplegreacties (bron: tabel 2.1.2 en figuur BGT)", regels);
const reactieRegels = regels;

// ── [4] Staafkrachten UGT (omhullende over c1 en c2) ──────────────────────
regels = [];
{
  const Nmin = Math.min(...[1, 2].flatMap((c) => el(c).normalForce)) / 1e3;
  const Nmax = Math.max(...[1, 2].flatMap((c) => el(c).normalForce)) / 1e3;
  const Vabs = Math.max(...[1, 2].map((c) => maxAbs(el(c).shearForce))) / 1e3;
  const Mmax = Math.max(...[1, 2].flatMap((c) => el(c).bendingMoment)) / 1e6;
  const Mmin = Math.min(...[1, 2].flatMap((c) => el(c).bendingMoment)) / 1e6;
  vgl("S1 N min (omhullende UGT)", REF.N_min, Nmin, "kN");
  vgl("S1 N max (omhullende UGT)", REF.N_max, Nmax, "kN");
  vgl("S1 |V| max (omhullende UGT)", REF.V_abs_max, Vabs, "kN");
  vgl("S1 M min (omhullende UGT)", 0, Mmin, "kNm");
  vgl("S1 M op station x = 1625 mm (c2)", REF.M_1625, Mst(2, 10), "kNm", "bron: My,Ed(x = Lst/2)");
  vgl("S1 M max op 21 stations (c2)", REF.M_max, Mmax, "kNm",
      "bron: 73,199 op x = 1650,6; station 1625 ligt 25,6 mm ernaast");
  const [fG, fQ] = fac(2); const st = lastdelen(fG, fQ); const { R1 } = handReacties(st); const mm = handMmax(st, R1);
  vgl("S1 M max exact (handafleiding, zelfde model)", REF.M_max, mm.M / 1e6, "kNm", `op x = ${mm.x.toFixed(1)} mm`);
  vgl("S1 M op x = 1630 mm, BGT c5 (handafleiding)", REF.M_c5_1630,
      handM(1630, lastdelen(...fac(5)), handReacties(lastdelen(...fac(5))).R1) / 1e6, "kNm", "bron: doorbuigingsblok");
}
tabel("[4] Staafkrachten (bron: tabel 2.1.3 en UC-blok)", regels);
const krachtRegels = regels;

// ── [5] BGT-verplaatsingen ────────────────────────────────────────────────
regels = [];
const w_z = wMaxMetTeken(5);           // BGT karakteristiek
const w_perm = wMaxMetTeken(3);        // BGT blijvend
const w_eind = w_z - (-ZEEG_MM);       // w_z − w_zeeg, zeeg −10 (bronconventie)
const w_bijk = w_z - w_perm;
vgl("w_z, BGT karakteristiek (c5), veldmaximum", REF.w_z, w_z, "mm", "bron: 1 decimaal");
vgl("w_BGT blijvend (c3), veldmaximum", REF.w_perm, w_perm, "mm", "bron: 1 decimaal");
vgl("w_eind = w_z − w_zeeg (zeeg 10 mm)", REF.w_eind, w_eind, "mm", "bron: 1 decimaal");
vgl("w_bijk = w_z − w_BGT,blijvend", REF.w_bijk, w_bijk, "mm", "bron: 1 decimaal");
{
  const dz = Math.max(...[3, 4, 5].flatMap((c) => [...res.get(c).displacements.values()].map((d) => Math.abs(d.uz))));
  const dx = Math.max(...[3, 4, 5].flatMap((c) => [...res.get(c).displacements.values()].map((d) => Math.abs(d.ux))));
  vgl("max |dz| knopen BGT", REF.dz_knoop_max, dz, "mm", "beide knopen opgelegd");
  vgl("max |dx| knopen BGT", REF.dx_knoop_max, dx, "mm");
}
tabel("[5] Verplaatsingen BGT (bron: tabel 2.2.2 en doorbuigingsblok)", regels);
const verplRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 5. TOETSING VIA DE BRUG (dezelfde Rust-kern als de app)
// ═══════════════════════════════════════════════════════════════════════════
async function brug(opdracht, inputs) {
  const r = await fetch("http://localhost:1440/api/toetsing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(inputs === undefined ? { opdracht } : { opdracht, inputs }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || (data && typeof data === "object" && "fout" in data)) {
    throw new Error(data?.fout ?? `de toetsbrug antwoordde met status ${r.status}`);
  }
  return data;
}

let profielRegels = [], ucRegels = [], kipRegels = [];
let toetsGedraaid = false;
let toets = null, invoerToets = null;
try {
  const profielen = await brug("list_steel_profiles");
  const profileDb = new Map();
  for (const p of profielen) { const k = profileLookupKey(p.name); if (!profileDb.has(k)) profileDb.set(k, p); }

  // ── [6] Profielgegevens: onze database naast de bron ────────────────────
  regels = [];
  const p = profileDb.get(profileLookupKey(PROFIEL)).properties;
  vgl("HEB 160: A", REF.A, p.area_mm2, "mm²");
  vgl("HEB 160: Iy", REF.Iy, p.iy_mm4, "mm⁴");
  vgl("HEB 160: Iz", REF.Iz, p.iz_mm4, "mm⁴");
  vgl("HEB 160: Wel,y", REF.Wel_y, p.wel_y_mm3, "mm³");
  vgl("HEB 160: Wpl,y", REF.Wpl_y, p.wpl_y_mm3, "mm³");
  vgl("HEB 160: iy", REF.iy, p.iy_radius_mm, "mm");
  vgl("HEB 160: iz", REF.iz, p.iz_radius_mm, "mm");
  vgl("HEB 160: It", REF.It, p.it_mm4, "mm⁴", "bron: Roark geval 26");
  vgl("HEB 160: Iw", REF.Iw, p.iw_mm6, "mm⁶", "bron: (h−tf)²·b³·tf/24");
  vgl("HEB 160: Av,z", REF.Av, p.av_z_mm2, "mm²");
  vgl("HEB 160: gewicht", REF.G_kgm, p.area_mm2 * 7850e-6, "kg/m");
  tabel("[6] Profieldatabase van de kern naast de doorsnedegegevens in de bron", regels);
  profielRegels = regels;

  // ── Toetsinvoer precies zoals de app hem bouwt ──────────────────────────
  const bouw = buildSteelCheckInputs({
    nodes: terug.nodes, beams: terug.beams, combinations: combos, combinationResults: res, profileDb,
  });
  if (bouw.skipped.length) for (const s of bouw.skipped) log(`  overgeslagen: staaf ${s.beamId} — ${s.reason}`);
  invoerToets = bouw.inputs[0];
  [toets] = await brug("check_steel_beams", bouw.inputs);
  toetsGedraaid = true;

  const zoek = (id) => toets.checks.find((c) => c.id === id);
  const ucVan = (id) => zoek(id)?.kind.data.uc?.uc ?? NaN;
  const rdVan = (id) => zoek(id)?.kind.data.uc?.rd ?? NaN;
  const edVan = (id) => zoek(id)?.kind.data.uc?.ed ?? NaN;
  const tussen = (id, sym) => zoek(id)?.kind.data.intermediate_values?.find((v) => v.symbol === sym)?.value ?? NaN;

  log(`\n  toetsinvoer (app): L = ${invoerToets.length_m} m, klasse doorbuiging ${invoerToets.deflection_limit_class}, ` +
      `w = ${invoerToets.deflection_actual_max_mm.toFixed(3)} mm, zeeg ${invoerToets.pre_camber_mm} mm, ` +
      `w_perm ${invoerToets.deflection_permanent_mm} mm, q_equiv ${invoerToets.q_equiv_n_per_mm.toFixed(3)} N/mm, ` +
      `z_a ${invoerToets.z_a_mm} mm, kipsteunen ${JSON.stringify(invoerToets.lateral_bracing.top_flange_positions)}`);
  log(`  kern: doorsnedeklasse ${toets.classification} (bron: klasse ${REF.klasse}), UC max ${toets.uc_max.toFixed(3)} ` +
      `(bron ${REF.UC_max}), maatgevend "${toets.governing_check_id}" (bron 6.3.2.1)`);
  for (const c of toets.checks) {
    const d = c.kind.data;
    log(`    ${c.id.padEnd(22)} UC ${d.uc ? d.uc.uc.toFixed(3) : "—"}   Ed ${d.uc ? getal(d.uc.ed) : "—"}   Rd ${d.uc ? getal(d.uc.rd) : "—"} ${d.unit}` +
        (d.notes?.length ? `   (${d.notes.length} opmerking(en))` : ""));
  }

  // ── [7] Weerstanden en unity checks ─────────────────────────────────────
  regels = [];
  vgl("Mc,Rd = Wpl,y·fy/γM0", REF.Mc_Rd, rdVan("6.2.5_bending_y"), "kNm");
  vgl("UC 6.2.5 buiging (c2)", REF.UC["6.2.5"], ucVan("6.2.5_bending_y"), "-", "bron 2 decimalen (±0,6 %)");
  vgl("Vpl,Rd = Av·fy/√3/γM0", REF.Vpl_Rd, rdVan("6.2.6_shear_z"), "kN");
  vgl("UC 6.2.6 dwarskracht (c2)", REF.UC["6.2.6"], ucVan("6.2.6_shear_z"), "-", "bron 2 decimalen (±1,3 %)");
  vgl("UC 6.2.8 buiging + dwarskracht (c2)", REF.UC["6.2.8"], ucVan("6.2.8_combined_mv"), "-", "V < Vpl,Rd/2 → geen reductie");
  vgl("Mb,Rd (kip)", REF.Mb_Rd, rdVan("6.3.2_ltb"), "kNm", "bron met χ_LT,mod (6.58); kern zonder");
  vgl("UC 6.3.2.1 kip (c2)", REF.UC["6.3.2.1"], ucVan("6.3.2_ltb"), "-", "zie [8]: verschil = vgl. (6.58)");
  vgl("w_eind (kern: w_fin = w_z − w_zeeg)", Math.abs(REF.w_eind), edVan("deflection_w_fin"), "mm");
  vgl("grens w_eind = L/250", REF.grens_eind, rdVan("deflection_w_fin"), "mm");
  vgl("UC doorbuiging w_eind (c5)", REF.UC.w_eind, ucVan("deflection_w_fin"), "-", "bron 2 decimalen (±1,8 %)");
  vgl("UC max", REF.UC_max, toets.uc_max, "-");
  tabel("[7] Weerstanden en unity checks — kern van de app naast de bron", regels);
  ucRegels = regels;

  // ── [8] Kip in detail ───────────────────────────────────────────────────
  regels = [];
  vgl("L_st (kipveld)", REF.L_st, tussen("6.3.2_ltb", "L_{st}"), "mm");
  vgl("q_equiv (voor B*)", REF.q_equiv, invoerToets.q_equiv_n_per_mm, "N/mm", "bron: 55,426 kN/m");
  vgl("B*", 0, tussen("6.3.2_ltb", "B^*"), "-", "eindmomenten 0");
  vgl("C1", REF.C1, tussen("6.3.2_ltb", "C_1"), "-");
  vgl("C2 (gecorrigeerd voor z_a = 80 mm)", REF.C2, tussen("6.3.2_ltb", "C_2"), "-");
  vgl("S = (h/2)·√(E·Iz/(G·It))", REF.S, tussen("6.3.2_ltb", "S"), "mm");
  vgl("C (NB.157)", REF.C, tussen("6.3.2_ltb", "C"), "-");
  vgl("Mcr (NB.148)", REF.Mcr, tussen("6.3.2_ltb", "M_{cr}"), "kNm");
  vgl("λ̄_LT", REF.lambda_LT, tussen("6.3.2_ltb", "\\bar{\\lambda}_{LT}"), "-", "bron 3 decimalen");
  vgl("χ_LT (kromme b, α = 0,34)", REF.chi_LT, tussen("6.3.2_ltb", "\\chi_{LT}"), "-", "bron 3 decimalen");
  // De kern past vgl. (6.58) — χ_LT,mod = χ_LT/f — bewust NIET toe (lambda_chi.rs:
  // "weglaten is veilig-zijdig"). De bron wél, met k_c = 0,94 (tabel 6.6,
  // parabolische momentenlijn). Hieronder de correctie op de kernwaarden, om te
  // laten zien dat dit het volledige verschil in de kip-UC verklaart.
  {
    const lam = tussen("6.3.2_ltb", "\\bar{\\lambda}_{LT}");
    const chi = tussen("6.3.2_ltb", "\\chi_{LT}");
    const f = 1 - 0.5 * (1 - REF.kc) * (1 - 2 * (lam - 0.8) ** 2);
    const chiMod = Math.min(1, chi / f);
    const MbMod = chiMod * REF.Wpl_y * 235 / 1e6;
    vgl("f (vgl. 6.58, k_c = 0,94 uit de bron)", REF.f, f, "-", "nagerekend op de λ̄_LT van de kern");
    vgl("χ_LT,mod = χ_LT/f", REF.chi_LT_mod, chiMod, "-", "NIET in de kern; hier nagerekend");
    vgl("Mb,Rd mét (6.58)", REF.Mb_Rd, MbMod, "kNm", "nagerekend");
    vgl("UC kip mét (6.58)", REF.UC["6.3.2.1"], edVan("6.3.2_ltb") / MbMod, "-", "nagerekend; bron 2 decimalen");
  }
  tabel("[8] Kipstabiliteit in detail (NB.NB.4, figuren NB.33/34)", regels);
  kipRegels = regels;

  // ── [9] Bijkomende doorbuiging: kern versus bron ────────────────────────
  log("\n[9] Bijkomende doorbuiging w_bijk — waar de kern een ANDERE definitie hanteert");
  log("─".repeat(118));
  log(`  bron:  w_bijk = w_z − w_BGT,blijvend = −13,6 + 11,3 = −2,4 mm, grens L/333 = 9,8 mm → UC ${REF.UC.w_bijk}`);
  log(`  kern:  w_add = w_fin − w_perm met w_perm = 0 (steelCheckBuilder: "blijvend BGT-deel niet apart op te lossen → 0")`);
  log(`         en grens L/150 (deflection.rs: W_ADD_NOEMER = 150) → w_add = ${edVan("deflection_w_add").toFixed(2)} mm, ` +
      `grens ${rdVan("deflection_w_add").toFixed(2)} mm, UC ${ucVan("deflection_w_add").toFixed(3)}`);
  log(`  zelfde definitie als de bron op ONZE solverwaarden: w_bijk = ${w_bijk.toFixed(2)} mm, grens L/333 = ${(L / 333).toFixed(2)} mm → ` +
      `UC ${(Math.abs(w_bijk) / (L / 333)).toFixed(3)} (bron ${REF.UC.w_bijk})`);
  log("  → De solver geeft dezelfde zakkingen; het verschil zit in de definitie van w_add in de kern");
  log("    (geen aftrek van het blijvende deel — veilig-zijdig — én grens L/150 in plaats van L/333 — juist ruimer).");
  log("    Niet gerepareerd; gemeld als bevinding.");
  log("─".repeat(118));
  regels = [];
  vgl("UC w_bijk, bron-definitie op onze solverwaarden", REF.UC.w_bijk, Math.abs(w_bijk) / (L / 333), "-", "bron 2 decimalen (±2,1 %)");
  vgl("UC w_add zoals de KERN hem geeft (andere definitie)", REF.UC.w_bijk, ucVan("deflection_w_add"), "-", "niet één-op-één vergelijkbaar");
  tabel("[9] Bijkomende doorbuiging", regels);
} catch (e) {
  log("\n═══ EN 1993-1-1-toetsing NIET gedraaid ═══");
  log(`  reden: ${e.message}`);
  log("  De toetsing loopt via de toetsbrug van de dev-server (http://localhost:1440/api/toetsing).");
  log("  Start de dev-server in design-mockup (npm run dev) en bouw de brug in src-tauri:");
  log("  cargo build --release --bin toetsbrug. Er worden hier BEWUST geen vervangende getallen berekend.");
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
function samenvat(naam, rijen) {
  const met = rijen.filter((r) => Number.isFinite(r.dev));
  if (met.length === 0) { log(`  ${naam}: geen vergelijkingen`); return 0; }
  const grootste = met.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), met[0]);
  const boven2 = met.filter((r) => Math.abs(r.dev) > 2);
  log(`  ${naam.padEnd(34)} ${String(met.length).padStart(2)} vergelijkingen, grootste afwijking ` +
      `${grootste.dev >= 0 ? "+" : ""}${grootste.dev.toFixed(2)} % (${grootste.grootheid}), ${boven2.length} boven 2 %`);
  return Math.max(...met.map((r) => Math.abs(r.dev)));
}
log("\n" + "═".repeat(118));
log("SAMENVATTING P03");
log("═".repeat(118));
const m2 = samenvat("[2] solver vs handafleiding", handRegels);
const m3 = samenvat("[3] oplegreacties", reactieRegels);
const m4 = samenvat("[4] staafkrachten", krachtRegels);
const m5 = samenvat("[5] verplaatsingen BGT", verplRegels);
let m6 = 0, m7 = 0, m8 = 0;
if (toetsGedraaid) {
  m6 = samenvat("[6] profieldata", profielRegels);
  m7 = samenvat("[7] weerstanden en UC's", ucRegels);
  m8 = samenvat("[8] kip in detail", kipRegels);
}
log("");
log(`  Grootste afwijking raamwerk (reacties, krachten, zakkingen): ${Math.max(m3, m4, m5).toFixed(2)} %`);
if (toetsGedraaid) {
  log(`  Grootste afwijking toetsing (profieldata, weerstanden, UC's, kip): ${Math.max(m6, m7, m8).toFixed(2)} %`);
  log("  Bekende oorzaken van afwijkingen > 2 %:");
  log("   - UC kip: de kern past vgl. (6.58) χ_LT,mod = χ_LT/f niet toe (bewust, veilig-zijdig); de bron wél.");
  log("   - UC w_bijk/w_add: andere definitie in de kern (w_perm = 0, grens L/150) — zie [9].");
}
log("═".repeat(118) + "\n");
