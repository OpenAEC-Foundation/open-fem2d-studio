/**
 * P02 — doorgaande onderligger HEM 160 (S235) op twee steunpunten, aan beide
 * zijden uitkragend. Nagebouwde projectberekening uit het eigen archief;
 * de referentiewaarden komen uit de uitdraai van het externe
 * raamwerkprogramma (NEN-EN 1993-1-1+C2+A1/NB:2016, CC2, 2e orde).
 *
 * Het geval is geanonimiseerd tot kenmerk P02: alleen geometrie, profiel,
 * materiaal, opleggingen, belastingen en de gepubliceerde uitkomsten. De
 * referentiewaarden zijn LETTERLIJK overgenomen en worden hier niet bijgesteld.
 *
 * Wat dit script doet:
 *   1. bouwt het model en schrijft het als `P02.femp` (serializeProject);
 *   2. rekent het via de volledige app-route door: bestand inlezen →
 *      bouwMultiInput → solveAllCasesNonlinear (2e orde, zoals de bron) →
 *      combineResults per combinatie; ter controle ook 1e orde (N = 0, dus
 *      beide routes horen samen te vallen);
 *   3. haalt de normtoetsing op via de dev-brug (POST /api/toetsing op
 *      localhost:1440, dezelfde Rust-kern als in de app);
 *   4. legt elke uitkomst uit de bron naast de onze met de afwijking in %;
 *   5. controleert de maatgevende getallen bovendien tegen een handafleiding.
 *
 * Draaien vanuit design-mockup:  npx tsx referentie-projecten/toets-P02.mjs
 * (de dev-server met de toetsbrug moet draaien op poort 1440)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODELLEERKEUZES (expliciet)
 *
 * • De bron kent ÉÉN staaf S1 (K1→K4, L = 3 800) met tussensteunpunten in K2
 *   en K3. In de app hangt een oplegging aan een knoop en loopt een staaf van
 *   knoop naar knoop; de engine splitst niet automatisch op tussenknopen.
 *   Daarom drie staven: 1 = K1→K2 (840, uitkraging), 2 = K2→K3 (2 200, veld),
 *   3 = K3→K4 (760, uitkraging). Voor de krachtsverdeling maakt dat niets uit;
 *   voor de normtoetsing wél: die is in de app PER STAAF (kiplengte,
 *   doorbuigingslengte), in de bron per staaf van 3 800.
 * • Opleggingen K2 en K3: Tx+Tz in de bron → "pinned" in de app.
 * • BG1 "Permanent incl. eigen gewicht": de bron somt q = −0,748 kN/m op, en
 *   dat ís het eigen gewicht (76,2 kg/m × 9,81). In de app staat daarom het
 *   automatische eigen gewicht AAN (ρ·A·g met A uit onze profieldatabase:
 *   0,7476 kN/m) en is die q NIET nog eens apart ingevoerd.
 * • Kipsteunen: de bron zegt "2 kipsteunen (1 267 / 1 267 / 1 267)" zonder
 *   flens. AANNAME: een kipsteun houdt de staaf zijdelings vast, dus beide
 *   flenzen op x = 1 267 en 2 534 mm vanaf K1. Die punten liggen beide in
 *   staaf 2 (fracties 0,194 en 0,770). Als gevoeligheid wordt de kiptoets ook
 *   met ALLEEN bovenflenssteunen gedraaid.
 * • Doorbuigingsgrens: de bron toetst op L/250 → klasse "custom", noemer 250,
 *   voor alle drie de staven.
 * • Gevolgklasse CC2 wordt na het bouwen van de toetsinvoer gezet (de builder
 *   zet standaard CC1); de kern past k_FI nog niet toe op de UC's.
 * • 2e orde: de bron rekent GNL. In de app nonlinearEnabled = true. Er is geen
 *   normaalkracht (alleen verticale lasten, beide opleggingen op één hoogte),
 *   dus 1e en 2e orde vallen samen — dat wordt getoetst.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync } from "node:fs";

const { solveAllCases, solveAllCasesNonlinear } =
  await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject, combinationsFromFile } =
  await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { buildSteelCheckInputs, profileLookupKey } =
  await import("../src/lib/steelCheckBuilder.ts");
const { resolveSection, eigenGewichtPerMeter } = await import("../src/lib/sectionResolver.ts");
const { STEEL_SECTION_DIMS } = await import("../src/lib/steelSectionDims.generated.ts");

const log = (s) => process.stdout.write(s + "\n");
const BRUG = "http://localhost:1440/api/toetsing";

// ═══════════════════════════════════════════════════════════════════════════
// 1. INVOER (geanonimiseerd, alleen het technische deel)
// ═══════════════════════════════════════════════════════════════════════════
const X = { K1: 0, K2: 840, K3: 3040, K4: 3800 };   // mm
const PROFIEL = "HEM160", MATERIAAL = "S235";
const KIPSTEUNEN_MM = [1267, 2534];                   // vanaf K1, uit de bron

// Belastingen (kN, negatief = omlaag)
const BG1 = { K1: [-55.4, -47.8], K4: [-56.0] };      // + eigen gewicht (auto)
const BG2 = { K1: [-14.3], K4: [-16.6] };
const Q_EG_BRON = -0.748;                             // kN/m, eigen gewicht in de bron

// Referentiewaarden (LETTERLIJK uit de bron, niet aanpassen)
const REF = {
  // profiel
  A: 9708, Iy: 5.099e7, Wel_y: 5.666e5, massa: 76.2,
  // oplegreacties UGT (kN)
  Rz_K2_c1: 176.801, Rz_K2_c2: 170.714, Rz_K3_c1: 60.494, Rz_K3_c2: 70.084,
  // staafkrachten UGT omhullend
  N_min: 0.0, N_max: 0.0, V_abs_max: 148.75, M_min: -124.59, M_max: 0.0,
  // verplaatsingen BGT (mm)
  dz_K1_c5: -9.4, dz_K4_c5: -6.4, dz_K2: 0.0, dz_K3: 0.0, dx_max: 0.0,
  // unity checks (klasse 1)
  uc_625: 0.79, uc_626: 0.35, uc_628: 0.79, uc_6321: 0.00, uc_doorbuiging: 0.13,
  uc_max: 0.79, klasse: 1,
  // doorbuigingsblok
  w_limiet_L: 3800, w_limiet_n: 250, w_eind: 0.0, w_bijk: 1.9,
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. MODEL BOUWEN EN OPSLAAN ALS P02.femp
// ═══════════════════════════════════════════════════════════════════════════
const L2 = X.K3 - X.K2;
const kipFracties = KIPSTEUNEN_MM.map((x) => (x - X.K2) / L2);
const checkConfig = (extra = {}) => ({
  deflectionClass: "custom",
  deflectionLimitNumerator: REF.w_limiet_n,
  ...extra,
});

let lastId = 0;
const punt = (caseId, nodeId, fz) => ({ id: ++lastId, type: "pointForce", caseId, nodeId, fz });

const model = {
  nodes: [
    { id: 1, x: X.K1, z: 0 },
    { id: 2, x: X.K2, z: 0 },
    { id: 3, x: X.K3, z: 0 },
    { id: 4, x: X.K4, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL, checkConfig: checkConfig() },
    { id: 2, from: 2, to: 3, material: MATERIAAL, profile: PROFIEL,
      checkConfig: checkConfig({ lateralRestraints: kipFracties, lateralRestraintsBottom: kipFracties }) },
    { id: 3, from: 3, to: 4, material: MATERIAAL, profile: PROFIEL, checkConfig: checkConfig() },
  ],
  supports: [
    { nodeId: 2, type: "pinned" },
    { nodeId: 3, type: "pinned" },
  ],
  plates: [],
  loads: [
    ...BG1.K1.map((f) => punt(1, 1, f)),
    ...BG1.K4.map((f) => punt(1, 4, f)),
    ...BG2.K4.map((f) => punt(2, 4, f)),
    ...BG2.K1.map((f) => punt(2, 1, f)),
  ],
  loadCases: [
    { id: 1, name: "BG1 Permanent (incl. eigen gewicht)", type: "dead" },
    { id: 2, name: "BG2 Veranderlijk (A: woonfunctie)", type: "live" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: true,
  nonlinearEnabled: true,
  combinations: [
    { id: 1, name: "UGT 1 (6.10a)", type: "uls", formula: "1,35·BG1 + 0,40·1,50·BG2", factors: { 1: 1.35, 2: 0.6 } },
    { id: 2, name: "UGT 2 (6.10b)", type: "uls", formula: "1,20·BG1 + 1,50·BG2", factors: { 1: 1.2, 2: 1.5 } },
    { id: 3, name: "BGT 3 (permanent)", type: "sls", formula: "1,00·BG1", factors: { 1: 1 } },
    { id: 4, name: "BGT 4 (quasi-blijvend)", type: "sls", formula: "1,00·BG1 + 0,30·BG2", factors: { 1: 1, 2: 0.3 } },
    { id: 5, name: "BGT 5 karakteristiek", type: "sls", formula: "1,00·BG1 + 1,00·BG2", factors: { 1: 1, 2: 1 } },
  ],
  // Vrij veld: reist mee in het JSON, wordt door de app genegeerd.
  toelichting:
    "Referentieproject P02 (geanonimiseerd): doorgaande onderligger HEM 160 S235 " +
    "op twee steunpunten (x = 840 en 3040) met uitkragingen naar x = 0 en x = 3800. " +
    "De ene staaf uit de bron is hier drie staven (K1-K2, K2-K3, K3-K4) omdat een " +
    "oplegging aan een knoop hangt. Eigen gewicht automatisch (bron: 0,748 kN/m). " +
    "Kipsteunen op x = 1267 en 2534 (beide flenzen, aanname). Doorbuigingsgrens L/250. " +
    "Combinaties en psi-factoren zoals in de bron; 2e orde aan (geen normaalkracht).",
};

const femp = serializeProject(model);
const pad = new URL("./P02.femp", import.meta.url);
writeFileSync(pad, femp, "utf8");
log("═".repeat(112));
log("P02 — doorgaande onderligger HEM 160 S235, twee steunpunten, uitkragend aan beide zijden");
log("═".repeat(112));
log(`Model opgeslagen: ${decodeURIComponent(pad.pathname.replace(/^\//, ""))}`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. TELWERK
// ═══════════════════════════════════════════════════════════════════════════
let regels = [];
function vgl(grootheid, ref, ons, eenheid = "", opm = "", vergelijkbaar = true) {
  const dev = (ref === 0)
    ? (Math.abs(ons) < 5e-3 ? 0 : NaN)
    : (ons - ref) / Math.abs(ref) * 100;
  regels.push({ grootheid, ref, ons, dev, eenheid, opm, vergelijkbaar });
  return dev;
}
function getal(v) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1e7) return v.toExponential(4);
  return v.toFixed(Math.abs(v) >= 100 ? 2 : 3);
}
function tabel(titel, rijen) {
  log(`\n${titel}`);
  log("─".repeat(112));
  log("grootheid".padEnd(44) + "referentie".padStart(12) + "onze waarde".padStart(14) +
      "Δ".padStart(10) + "  opmerking");
  log("─".repeat(112));
  for (const r of rijen) {
    const ref = getal(r.ref), ons = getal(r.ons);
    const dev = Number.isNaN(r.dev) ? "n.v.t." : `${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(2)} %`;
    const vlag = !r.vergelijkbaar ? " ≠" : (Number.isNaN(r.dev) || Math.abs(r.dev) > 2) ? " ⚠" : "  ";
    log(r.grootheid.padEnd(44) + ref.padStart(12) + ons.padStart(14) + dev.padStart(10) + vlag + " " + r.opm);
  }
  log("─".repeat(112));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PROFIELDATA EN EIGEN GEWICHT NAAST DE BRON
// ═══════════════════════════════════════════════════════════════════════════
regels = [];
const sec = resolveSection(MATERIAAL, PROFIEL);
const dims = STEEL_SECTION_DIMS[PROFIEL].props;
const qEG = eigenGewichtPerMeter(MATERIAAL, PROFIEL);     // kN/m, negatief
vgl("HEM 160: A", REF.A, sec.A, "mm²", "onze profieldatabase");
vgl("HEM 160: Iy", REF.Iy, sec.I, "mm⁴");
vgl("HEM 160: Wel,y", REF.Wel_y, dims.welY, "mm³");
vgl("HEM 160: massa", REF.massa, 7850 * sec.A * 1e-6, "kg/m", "ρ·A");
vgl("eigen gewicht q (BG1)", Q_EG_BRON, qEG, "kN/m", "app: ρ·A·g automatisch");
tabel("① Profieldata en eigen gewicht", regels);
const profielRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 5. DOORREKENEN VIA DE APP-ROUTE (bestand → bouwMultiInput → solver)
// ═══════════════════════════════════════════════════════════════════════════
const terug = deserializeProject(femp);
const combinaties = combinationsFromFile(terug.combinations);
const multi = bouwMultiInput({
  nodes: terug.nodes, beams: terug.beams, supports: terug.supports, plates: terug.plates,
  loadCases: terug.loadCases, loads: terug.loads,
  selfWeightEnabled: terug.selfWeightEnabled,
  scheefstandEnabled: terug.scheefstandEnabled ?? false,
  scheefstandNoemer: terug.scheefstandNoemer ?? 200,
  scheefstandRichting: terug.scheefstandRichting ?? 1,
});

// 2e orde (zoals de app doet bij nonlinearEnabled) én 1e orde ter controle.
const perCase2 = solveAllCasesNonlinear(multi).perCase;
const perCase1 = solveAllCases(multi).perCase;
const res2 = new Map(combinaties.map((c) => [c.id, combineResults(c, perCase2)]));
const res1 = new Map(combinaties.map((c) => [c.id, combineResults(c, perCase1)]));

const kN = (n) => n / 1e3, kNm = (nmm) => nmm / 1e6;

// ── 1e vs 2e orde ──────────────────────────────────────────────────────────
log("\n② Controle: 1e en 2e orde vallen samen (geen normaalkracht)");
log("─".repeat(112));
{
  let maxRel = 0;
  for (const c of combinaties) {
    const a = res1.get(c.id), b = res2.get(c.id);
    for (const [bid, ea] of a.elements) {
      const eb = b.elements.get(bid);
      for (let i = 0; i < ea.stations_mm.length; i++) {
        for (const k of ["bendingMoment", "shearForce", "normalForce", "deflection"]) {
          const d = Math.abs(ea[k][i] - eb[k][i]);
          const s = Math.max(1, Math.abs(ea[k][i]));
          maxRel = Math.max(maxRel, d / s);
        }
      }
    }
  }
  log(`  grootste relatieve verschil over alle stations en combinaties: ${maxRel.toExponential(2)}`);
}
log("─".repeat(112));

// ═══════════════════════════════════════════════════════════════════════════
// 6. OPLEGREACTIES, STAAFKRACHTEN, VERPLAATSINGEN
// ═══════════════════════════════════════════════════════════════════════════
const c1 = res2.get(1), c2 = res2.get(2), c5 = res2.get(5), c3 = res2.get(3);

regels = [];
vgl("Rz K2, combinatie 1", REF.Rz_K2_c1, kN(c1.reactions.get(2).fz), "kN");
vgl("Rz K2, combinatie 2", REF.Rz_K2_c2, kN(c2.reactions.get(2).fz), "kN");
vgl("Rz K3, combinatie 1", REF.Rz_K3_c1, kN(c1.reactions.get(3).fz), "kN");
vgl("Rz K3, combinatie 2", REF.Rz_K3_c2, kN(c2.reactions.get(3).fz), "kN");
tabel("③ Oplegreacties UGT", regels);
const reactieRegels = regels;

// Omhullende over de UGT-combinaties en alle drie de staven (21 stations elk).
function omhullende(resultaten) {
  let Nmin = Infinity, Nmax = -Infinity, Vabs = 0, Mmin = Infinity, Mmax = -Infinity;
  let Vwaar = "", Mwaar = "";
  for (const [cid, r] of resultaten) {
    for (const [bid, ef] of r.elements) {
      for (let i = 0; i < ef.stations_mm.length; i++) {
        const N = kN(ef.normalForce[i]), V = kN(ef.shearForce[i]), M = kNm(ef.bendingMoment[i]);
        Nmin = Math.min(Nmin, N); Nmax = Math.max(Nmax, N);
        if (Math.abs(V) > Vabs) { Vabs = Math.abs(V); Vwaar = `staaf ${bid}, x = ${ef.stations_mm[i].toFixed(0)} mm, c${cid}`; }
        if (M < Mmin) { Mmin = M; Mwaar = `staaf ${bid}, x = ${ef.stations_mm[i].toFixed(0)} mm, c${cid}`; }
        Mmax = Math.max(Mmax, M);
      }
    }
  }
  return { Nmin, Nmax, Vabs, Mmin, Mmax, Vwaar, Mwaar };
}
const ugt = omhullende(new Map([[1, c1], [2, c2]]));
regels = [];
vgl("N min (omhullend)", REF.N_min, ugt.Nmin, "kN");
vgl("N max (omhullend)", REF.N_max, ugt.Nmax, "kN");
vgl("|V| max (omhullend)", REF.V_abs_max, ugt.Vabs, "kN", ugt.Vwaar);
vgl("M min (omhullend)", REF.M_min, ugt.Mmin, "kNm", ugt.Mwaar);
vgl("M max (omhullend)", REF.M_max, ugt.Mmax, "kNm", "vrije uiteinden");
tabel("④ Staafkrachten UGT (omhullende over c1 en c2, drie staven)", regels);
const krachtRegels = regels;

regels = [];
const d = (r, nid) => r.displacements.get(nid);
vgl("dz K1, combinatie 5", REF.dz_K1_c5, d(c5, 1).uz, "mm");
vgl("dz K4, combinatie 5", REF.dz_K4_c5, d(c5, 4).uz, "mm");
vgl("dz K2 (oplegging)", REF.dz_K2, d(c5, 2).uz, "mm");
vgl("dz K3 (oplegging)", REF.dz_K3, d(c5, 3).uz, "mm");
{
  let dxMax = 0;
  for (const c of combinaties) for (const [, v] of res2.get(c.id).displacements) dxMax = Math.max(dxMax, Math.abs(v.ux));
  vgl("|dx| max (alle BGT/UGT)", REF.dx_max, dxMax, "mm");
}
tabel("⑤ Knoopverplaatsingen BGT (combinatie 5 = karakteristiek)", regels);
const verplRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 7. HANDAFLEIDING (derde partij) — combinatie 1
// ═══════════════════════════════════════════════════════════════════════════
// P_K1 = 1,35·(55,4 + 47,8) + 0,6·14,3 ; P_K4 = 1,35·56,0 + 0,6·16,6 ; q = 1,35·q_EG
// M(K2) = −(P_K1·a + q·a²/2) met a = 0,84 m ; V links van K2 = P_K1 + q·a
// ΣM om K3: R2·2,2 = P_K1·3,04 + q·3,8·(3,04 − 1,9) − P_K4·0,76
regels = [];
{
  const P1 = 1.35 * (BG1.K1[0] + BG1.K1[1]) + 0.6 * BG2.K1[0];   // kN (negatief)
  const P4 = 1.35 * BG1.K4[0] + 0.6 * BG2.K4[0];
  const q = 1.35 * qEG;                                          // kN/m (negatief)
  const a = X.K2 / 1000, b = (X.K4 - X.K3) / 1000, L = X.K4 / 1000, Lv = L2 / 1000;
  const M_K2 = P1 * a + q * a * a / 2;                           // kNm, hogging < 0
  const V_K2 = -(P1 + q * a);                                    // kN, grootte
  const R2 = -(P1 * (X.K3 / 1000) + q * L * (X.K3 / 1000 - L / 2) - P4 * b) / Lv;
  const R3 = -(P1 + P4 + q * L) - R2;
  vgl("hand: M(K2) c1", M_K2, kNm(c1.elements.get(1).bendingMoment[20]), "kNm", "staaf 1, station K2");
  vgl("hand: |V| links van K2 c1", V_K2, Math.abs(kN(c1.elements.get(1).shearForce[20])), "kN");
  vgl("hand: Rz K2 c1", R2, kN(c1.reactions.get(2).fz), "kN");
  vgl("hand: Rz K3 c1", R3, kN(c1.reactions.get(3).fz), "kN");
  vgl("hand: Rz K2 c1 vs bron", REF.Rz_K2_c1, R2, "kN", "handafleiding naast de bron");
}
tabel("⑥ Handafleiding (evenwicht) naast de solver en naast de bron", regels);
const handRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 8. NORMTOETSING VIA DE BRUG (dezelfde Rust-kern als de app)
// ═══════════════════════════════════════════════════════════════════════════
async function roepKern(opdracht, inputs) {
  const antwoord = await fetch(BRUG, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opdracht, inputs }),
  });
  const data = await antwoord.json().catch(() => null);
  if (!antwoord.ok || (data && typeof data === "object" && "fout" in data)) {
    throw new Error(data?.fout ?? `De rekenkern antwoordde met status ${antwoord.status}.`);
  }
  return data;
}

const profielen = await roepKern("list_steel_profiles");
const profileDb = new Map();
for (const p of profielen) {
  const k = profileLookupKey(p.name);
  if (!profileDb.has(k)) profileDb.set(k, p);
}
const bouw = buildSteelCheckInputs({
  nodes: terug.nodes, beams: terug.beams, combinations: combinaties,
  combinationResults: res2, profileDb,
});
for (const s of bouw.skipped) log(`  overgeslagen: staaf ${s.beamId} — ${s.reason}`);
for (const i of bouw.inputs) i.consequence_class = "CC2";          // zoals de bron
const toets = await roepKern("check_steel_beams", bouw.inputs);

// Gevoeligheid: kipsteunen alleen aan de bovenflens.
const inputsBoven = bouw.inputs.map((i) => ({
  ...i, lateral_bracing: { ...i.lateral_bracing, bottom_flange_positions: [] },
}));
const toetsBoven = await roepKern("check_steel_beams", inputsBoven);

const ucVan = (r, id) => {
  const c = r.checks.find((x) => x.id === id);
  return c?.kind?.data?.uc?.uc ?? null;
};
const checkVan = (r, id) => r.checks.find((x) => x.id === id)?.kind?.data ?? null;
const klasseNr = (k) => ({ Class1: 1, Class2: 2, Class3: 3, Class4: 4 })[k] ?? k;

log("\n⑦ Toetsresultaten per staaf (app: per staaf; bron: één staaf van 3 800)");
log("─".repeat(112));
log("staaf".padEnd(8) + "L (mm)".padStart(8) + "klasse".padStart(8) + "6.2.5".padStart(9) + "6.2.6".padStart(9) +
    "6.2.8".padStart(9) + "6.3.2".padStart(9) + "w_fin".padStart(9) + "w_add".padStart(9) + "  UC max (maatgevend)");
for (const r of toets) {
  const L = bouw.inputs.find((i) => i.beam_id === r.beam_id).length_m * 1000;
  log(String(r.beam_id).padEnd(8) + L.toFixed(0).padStart(8) + String(klasseNr(r.classification)).padStart(8) +
      getal(ucVan(r, "6.2.5_bending_y")).padStart(9) + getal(ucVan(r, "6.2.6_shear_z")).padStart(9) +
      getal(ucVan(r, "6.2.8_combined_mv")).padStart(9) + getal(ucVan(r, "6.3.2_ltb")).padStart(9) +
      getal(ucVan(r, "deflection_w_fin")).padStart(9) + getal(ucVan(r, "deflection_w_add")).padStart(9) +
      `  ${r.uc_max.toFixed(3)} (${r.governing_check_id})`);
}
log("─".repeat(112));
{
  const ltb2 = checkVan(toets.find((r) => r.beam_id === 2), "6.3.2_ltb");
  const ltb2b = checkVan(toetsBoven.find((r) => r.beam_id === 2), "6.3.2_ltb");
  const toon = (naam, c) => {
    if (!c) return;
    const iv = (c.intermediate_values ?? []).map((v) => `${v.symbol} = ${getal(v.value)} ${v.unit}`);
    log(`  ${naam}: UC ${getal(c.uc?.uc)} — M_Ed ${getal(c.uc?.ed)} / M_b,Rd ${getal(c.uc?.rd)} kNm`);
    if (iv.length) log(`    ${iv.join(";  ")}`);
    for (const n of c.notes ?? []) log(`    · ${n}`);
  };
  toon("kip staaf 2, kipsteunen beide flenzen (zoals opgeslagen)", ltb2);
  toon("kip staaf 2, kipsteunen alleen bovenflens (gevoeligheid)", ltb2b);
}

// Maatgevend over de drie staven, naast de bron (één staaf).
const maxUc = (id, set = toets) => Math.max(...set.map((r) => ucVan(r, id) ?? 0));
regels = [];
vgl("doorsnedeklasse", REF.klasse, Math.max(...toets.map((r) => klasseNr(r.classification))), "");
vgl("UC 6.2.5 buiging (max over staven)", REF.uc_625, maxUc("6.2.5_bending_y"), "", "bron: c1");
vgl("UC 6.2.6 dwarskracht", REF.uc_626, maxUc("6.2.6_shear_z"), "", "bron: c1");
vgl("UC 6.2.8 buiging + dwarskracht", REF.uc_628, maxUc("6.2.8_combined_mv"), "", "bron: c1");
vgl("UC max (maatgevend artikel)", REF.uc_max, Math.max(...toets.map((r) =>
  Math.max(ucVan(r, "6.2.5_bending_y") ?? 0, ucVan(r, "6.2.6_shear_z") ?? 0,
           ucVan(r, "6.2.8_combined_mv") ?? 0))), "", "over 6.2.5/6.2.6/6.2.8");
vgl("UC 6.3.2 kip", REF.uc_6321, maxUc("6.3.2_ltb"), "",
    "bron meldt 0,00 (kip niet maatgevend); app: χ_LT = 1 → UC = M/Mc,Rd", false);
vgl("UC doorbuiging (bron: w_bijk 1,9 / 15,2)", REF.uc_doorbuiging, maxUc("deflection_w_fin"), "",
    "definitieverschil, zie ⑧", false);
tabel("⑧ Unity checks naast de bron", regels);
const ucRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 9. DOORBUIGING — wat de bron toetst en wat de app toetst
// ═══════════════════════════════════════════════════════════════════════════
log("\n⑨ Doorbuiging: definities naast elkaar");
log("─".repeat(112));
{
  const e1 = c5.elements.get(1), e2 = c5.elements.get(2), e3 = c5.elements.get(3);
  const mx = (arr) => arr.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0);
  const w1 = mx(e1.deflection), w2 = mx(e2.deflection), w3 = mx(e3.deflection);
  const w1p = mx(c3.elements.get(1).deflection), w2p = mx(c3.elements.get(2).deflection), w3p = mx(c3.elements.get(3).deflection);
  log(`  bron:  grens L/250 met L = ${REF.w_limiet_L} → ${(REF.w_limiet_L / REF.w_limiet_n).toFixed(2)} mm; ` +
      `w_eind = ${REF.w_eind} mm, w_bijk = ${REF.w_bijk} mm → UC ${REF.uc_doorbuiging}`);
  log(`  app:   max |w| per staaf onder BGT 5 (karakteristiek), teken: negatief = omlaag`);
  log(`         staaf 1 (uitkraging 840):  w = ${getal(w1)} mm  (BG1 alleen: ${getal(w1p)}; verschil ${getal(w1 - w1p)})  grens 840/250 = ${(840 / 250).toFixed(2)} mm`);
  log(`         staaf 2 (veld 2 200):      w = ${getal(w2)} mm  (BG1 alleen: ${getal(w2p)}; verschil ${getal(w2 - w2p)})  grens 2200/250 = ${(2200 / 250).toFixed(2)} mm`);
  log(`         staaf 3 (uitkraging 760):  w = ${getal(w3)} mm  (BG1 alleen: ${getal(w3p)}; verschil ${getal(w3 - w3p)})  grens 760/250 = ${(760 / 250).toFixed(2)} mm`);
  log(`  NB-lezing uitkraging (l = 2·uitkraging): staaf 1 → ${getal(Math.abs(w1) / (2 * 840 / 250))}, staaf 3 → ${getal(Math.abs(w3) / (2 * 760 / 250))}`);
  log(`  De 9,4 mm aan de tip K1 (1/89 van de uitkraging) komt in de doorbuigings-UC van de bron niet terug;`);
  log(`  de app toetst hem wél en keurt de uitkragingen af. Dat is een verschil in wat er getoetst wordt,`);
  log(`  niet in de berekende zakking (die valt samen, zie ⑤).`);
}
log("─".repeat(112));

// ═══════════════════════════════════════════════════════════════════════════
// 10. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
function samenvat(naam, rijen) {
  const met = rijen.filter((r) => r.vergelijkbaar && Number.isFinite(r.dev));
  if (met.length === 0) { log(`  ${naam}: geen vergelijkbare rijen`); return 0; }
  const grootste = met.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), met[0]);
  const boven2 = met.filter((r) => Math.abs(r.dev) > 2);
  log(`  ${naam}: ${met.length} vergelijkingen, grootste afwijking ` +
      `${grootste.dev >= 0 ? "+" : ""}${grootste.dev.toFixed(2)} % (${grootste.grootheid}), ${boven2.length} boven 2 %`);
  return Math.max(...met.map((r) => Math.abs(r.dev)));
}
log("\n" + "═".repeat(112));
log("SAMENVATTING");
log("═".repeat(112));
const m1 = samenvat("① profieldata          ", profielRegels);
const m3 = samenvat("③ oplegreacties        ", reactieRegels);
const m4 = samenvat("④ staafkrachten        ", krachtRegels);
const m5 = samenvat("⑤ verplaatsingen       ", verplRegels);
const m6 = samenvat("⑥ handafleiding        ", handRegels);
const m8 = samenvat("⑧ unity checks         ", ucRegels);
log("");
log(`  Grootste afwijking over alles wat 1-op-1 vergelijkbaar is: ${Math.max(m1, m3, m4, m5, m6, m8).toFixed(2)} %`);
log("  Niet 1-op-1 vergelijkbaar (≠): UC 6.3.2 kip (bron rapporteert 0,00 als kip niet maatgevend is;");
log("  de app rapporteert M_Ed/M_b,Rd met χ_LT = 1) en UC doorbuiging (bron: één staaf van 3 800 en een");
log("  eigen w_bijk; app: max |w| per staaf, inclusief de uitkragingen).");
log("═".repeat(112) + "\n");
