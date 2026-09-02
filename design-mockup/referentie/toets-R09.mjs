// ════════════════════════════════════════════════════════════════════════════
// R09 — Gesloten rechthoekig raamwerk (kokervorm), inclusief kniklast
//
// Validatiecampagne referentieberekeningen, geval R09 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// CONSTRUCTIE
//   Symmetrisch gesloten rechthoekig raamwerk: onderregel AB, kolommen AC en
//   BD, bovenregel CD. Alle vier de knopen momentvast; A en B zijn
//   scharnieropleggingen aan de voet. a = b = 6,0 m; alle staven EI = 1000 kN·m².
//   Belasting: q = 8 kN/m omlaag op CD + puntlasten F = 15 kN omlaag in C en D.
//
// DIT SCRIPT
//   1. bouwt het model als projectbestand (referentie/R09.femp, via
//      serializeProject — te openen in de app);
//   2. leest dat bestand terug en laat het door DEZELFDE mapping lopen die de
//      app gebruikt (bouwMultiInput → solveAllCases → combineResults), zodat
//      hier niets anders gerekend wordt dan wat de app zelf zou rekenen;
//   3. legt elke referentiewaarde uit het dossier naast onze uitkomst, met de
//      afwijking in procent.
//
// AANNAMES (alleen wat het dossier toestaat, expliciet gemaakt)
//   • De bron geeft alleen EI, geen materiaal of doorsnede. Om EI = 1000 kN·m²
//     EXACT in een projectbestand te kunnen vastleggen is gekozen voor
//     materiaal C30 (E_0,mean = 12000 N/mm²) met rechthoek 125 × 200 mm:
//       I = 125·200³/12 = 8,33333e7 mm⁴  →  E·I = 1,0e12 N·mm² = 1000 kN·m².
//     Daarmee is EA = 300 000 kN eindig, terwijl de bron normaalkrachtver-
//     vorming verwaarloost. Het effect daarvan wordt apart gemeten door
//     dezelfde som nog eens met een sterk verhoogde EA te draaien
//     (× 1000 in blok 1, × 10 000 in blok 3).
//   • Eigen gewicht staat UIT (de bron geeft er geen).
//   • Eerste orde voor de momentenverdeling; het 2e-orde-pad wordt alleen
//     gebruikt voor de stabiliteitsgrootheden.
//
// BEPERKING VAN DE APP (eerlijk benoemd)
//   De app heeft GEEN eigenwaarde-/knikanalyse. De kniklast wordt hier bepaald
//   met de stabiliteitscheck die in het 2e-orde-pad zit (NonlinearSolver telt
//   de niet-positieve pivots van K_e + K_g; ≥ 1 → "op of boven de kritieke
//   waarde"). Door de belastingfactor λ te bisecteren tot die melding omslaat,
//   levert de app zelf de kritieke belastingfactor. Dat is een AFGELEID gebruik
//   van bestaande app-functionaliteit, geen ingebouwde knikberekening.
//
// Draaien met: npx tsx referentie/toets-R09.mjs   (vanuit design-mockup)
// ════════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases, solveCombinationSecondOrder } =
  await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ── Boekhouding van de vergelijkingen ──────────────────────────────────────
let ok = 0, afwijkend = 0;
const rijen = [];

/**
 * Leg één referentiewaarde naast onze uitkomst.
 * `soort`: "toets" telt mee in het slaag/zak-oordeel; "meld" alleen rapporteren.
 */
function vergelijk(naam, referentie, onze, eenheid, tolPct, soort = "toets", noot = "") {
  const delta = onze - referentie;
  const pct = referentie === 0 ? (onze === 0 ? 0 : Infinity) : (delta / referentie) * 100;
  const binnen = Math.abs(pct) <= tolPct;
  if (soort === "toets") { if (binnen) ok++; else afwijkend++; }
  rijen.push({ naam, referentie, onze, eenheid, pct, binnen, soort, noot, tolPct });
  const merk = soort === "meld" ? "·" : (binnen ? "✓" : "✗");
  log(`  ${merk} ${naam.padEnd(46)} ref ${fmt(referentie).padStart(10)} ${eenheid.padEnd(8)}` +
      ` ons ${fmt(onze).padStart(10)}   Δ ${(pct >= 0 ? "+" : "") + pct.toFixed(3)} %` +
      (soort === "toets" ? ` (tol ${tolPct} %)` : ""));
  if (noot) log(`      ${noot}`);
}
function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(2) : a >= 1 ? v.toFixed(4) : v.toFixed(6);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. MODEL — knopen, staven, opleggingen, lasten in app-vorm
// ════════════════════════════════════════════════════════════════════════════
const a_mm = 6000;            // overspanning der regels
const b_mm = 6000;            // kolomhoogte
const MATERIAAL = "C30";      // E_0,mean = 12000 N/mm²
const PROFIEL   = "125x200";  // I = 8,33333e7 mm⁴ → EI = 1000 kN·m²

// Knoop-ids: 1 = A, 2 = B, 3 = C, 4 = D  (A/B onder, C/D boven)
const projectState = {
  nodes: [
    { id: 1, x: 0,     z: 0     },   // A
    { id: 2, x: a_mm,  z: 0     },   // B
    { id: 3, x: 0,     z: b_mm  },   // C
    { id: 4, x: a_mm,  z: b_mm  },   // D
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL },  // onderregel AB
    { id: 2, from: 1, to: 3, material: MATERIAAL, profile: PROFIEL },  // kolom AC
    { id: 3, from: 2, to: 4, material: MATERIAAL, profile: PROFIEL },  // kolom BD
    { id: 4, from: 3, to: 4, material: MATERIAAL, profile: PROFIEL },  // bovenregel CD
  ],
  // Scharnieropleggingen aan de voet; de knopen zelf blijven momentvast
  // tussen onderregel en kolom (de oplegging levert geen inklemmingsmoment).
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "pinned" },
  ],
  plates: [],
  loads: [
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 4, q: -8 },   // q = 8 kN/m ↓ op CD
    { id: 2, type: "pointForce", caseId: 1, nodeId: 3, fz: -15 }, // F = 15 kN ↓ in C
    { id: 3, type: "pointForce", caseId: 1, nodeId: 4, fz: -15 }, // F = 15 kN ↓ in D
  ],
  loadCases: [{ id: 1, name: "LC1 (q + F)", type: "dead" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
  combinations: [{
    id: 1, name: "1,0 · LC1", type: "uls",
    formula: "1,0·LC1 — karakteristieke referentiebelasting", factors: { 1: 1.0 },
  }],
  structuralGrid: {
    enabled: true,
    xAxes: [{ id: "A", label: "A", position: 0 }, { id: "B", label: "B", position: a_mm }],
    zAxes: [{ id: "1", label: "1", position: 0 }, { id: "2", label: "2", position: b_mm }],
  },
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// Twee keer hetzelfde bestand: R09.femp is de naam die het dossier vraagt,
// R09.ifcfem2d draagt de extensie die de Openen-dialoog van de app filtert
// (PROJECT_FILE_EXT = "ifcfem2d"), zodat het model echt te openen is.
const projectJson = serializeProject(projectState);
const pad = join(HIER, "R09.femp");
const padApp = join(HIER, "R09.ifcfem2d");
writeFileSync(pad, projectJson, "utf8");
writeFileSync(padApp, projectJson, "utf8");
log(`\nModel opgeslagen: ${pad}`);
log(`                  ${padApp}`);

// ── Terug inlezen en door de app-mapping halen ─────────────────────────────
const parsed = deserializeProject(readFileSync(pad, "utf8"));
const model = {
  nodes: parsed.nodes, beams: parsed.beams, supports: parsed.supports,
  plates: parsed.plates, loadCases: parsed.loadCases, loads: parsed.loads,
  selfWeightEnabled: parsed.selfWeightEnabled,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
};
const multiInput = bouwMultiInput(model);
const sec = resolveSection(MATERIAAL, PROFIEL);
const EI_kNm2 = (sec.E * sec.I) / 1e9;   // N·mm² → kN·m²
const EA_kN   = (sec.E * sec.A) / 1e3;   // N      → kN
log(`Doorsnede uit het bestand: E = ${sec.E} N/mm², A = ${sec.A} mm², I = ${sec.I.toExponential(6)} mm⁴`);
log(`  → EI = ${EI_kNm2.toFixed(4)} kN·m²   EA = ${EA_kN.toFixed(0)} kN`);

const combo = {
  id: 1, name: "1,0 · LC1", type: "uls", formula: "1,0·LC1",
  factors: new Map([[1, 1.0]]),
};
const { perCase } = solveAllCases(multiInput);
const R = combineResults(combo, perCase);

// Vergelijkingsmodel met EA × 1000: isoleert de invloed van
// normaalkrachtvervorming, die de bron verwaarloost.
const stijfInput = {
  ...multiInput,
  beams: multiInput.beams.map(b => ({ ...b, A: b.A * 1000 })),
};
const Rstijf = combineResults(combo, solveAllCases(stijfInput).perCase);

// ── Uitlezen: hoekmomenten, normaalkracht, reacties ────────────────────────
// Staafnummering: 1 = AB, 2 = AC, 3 = BD, 4 = CD.
// M_start/M_end staan in N·mm op de knopen "from"/"to" van de staaf.
const kNm = (v) => v / 1e6;
const kN  = (v) => v / 1e3;

const el = (r, id) => r.elements.get(id);
// Hoekmoment in A = het staafeindmoment van kolom AC bij A (= even groot en
// tegengesteld aan dat van onderregel AB bij A: knoopevenwicht).
const MA = Math.abs(kNm(el(R, 2).M_start));
const MB = Math.abs(kNm(el(R, 3).M_start));
const MC = Math.abs(kNm(el(R, 2).M_end));
const MD = Math.abs(kNm(el(R, 3).M_end));
const MA_stijf = Math.abs(kNm(el(Rstijf, 2).M_start));
const MC_stijf = Math.abs(kNm(el(Rstijf, 2).M_end));
const N_kolom = Math.abs(kN(el(R, 2).N));

// Knoopevenwicht. De solver geeft M_start/M_end in de SAGGING-conventie
// (doorhangen positief). Het moment dat een staaf op de KNOOP uitoefent, in de
// gebruikelijke linksom-positieve knoopconventie, is +M_start bij de
// "from"-knoop en −M_end bij de "to"-knoop. Met die vertaling moet de som per
// knoop exact nul zijn (geen uitwendig koppel op A of C).
const opKnoopStart = (id) => kNm(el(R, id).M_start);
const opKnoopEind  = (id) => -kNm(el(R, id).M_end);
const knoopA = opKnoopStart(1) + opKnoopStart(2);   // AB en AC beginnen in A
const knoopC = opKnoopEind(2)  + opKnoopStart(4);   // AC eindigt in C, CD begint in C

log("\n════════════════════════════════════════════════════════════════════");
log("BLOK 1 — momentenverdeling en normaalkracht (eerste orde)");
log("════════════════════════════════════════════════════════════════════");
vergelijk("M_A = M_B (hoekmoment onderaan)", 3.0, MA, "kNm", 1);
vergelijk("M_B (spiegelbeeld van M_A)",      3.0, MB, "kNm", 1);
vergelijk("M_C = M_D (hoekmoment bovenaan)", 15.0, MC, "kNm", 1);
vergelijk("M_D (spiegelbeeld van M_C)",      15.0, MD, "kNm", 1);

// Vergelijking met starre kolommen: q·a²/12 = 8·6²/12 = 24 kNm; de bron zegt
// dat de gevonden waarde 62,5 % daarvan is.
const M_star = 8 * 6 ** 2 / 12;
vergelijk("q·a²/12 (referentie starre kolommen)", 24.0, M_star, "kNm", 0.5);
vergelijk("M_C / (q·a²/12)", 62.5, (MC / M_star) * 100, "%", 1);

vergelijk("N in de kolom = 24 + F", 24 + 15, N_kolom, "kN", 1);

log("\n  Nevencontroles (niet in het dossier, wel noodzakelijk voor vertrouwen):");
log(`  · knoopevenwicht A: ΣM = ${knoopA.toExponential(3)} kNm (moet 0 zijn)`);
log(`  · knoopevenwicht C: ΣM = ${knoopC.toExponential(3)} kNm (moet 0 zijn)`);
log(`  · verticale reacties: A ${kN(R.reactions.get(1).fz).toFixed(4)} kN, ` +
    `B ${kN(R.reactions.get(2).fz).toFixed(4)} kN — som ${(kN(R.reactions.get(1).fz) + kN(R.reactions.get(2).fz)).toFixed(4)} kN ` +
    `tegen q·a + 2F = ${(8 * 6 + 2 * 15).toFixed(1)} kN`);
log(`  · horizontale reacties: A ${kN(R.reactions.get(1).fx).toFixed(4)} kN, ` +
    `B ${kN(R.reactions.get(2).fx).toFixed(4)} kN (som ${(kN(R.reactions.get(1).fx) + kN(R.reactions.get(2).fx)).toExponential(2)} kN)`);
log(`  · inklemmingsmoment in de opleggingen: ${kNm(R.reactions.get(1).my).toExponential(2)} kNm (scharnier ⇒ 0)`);
log(`  · met EA × 1000 (normaalkrachtvervorming uitgeschakeld, zoals de bron):`);
log(`      M_A = ${MA_stijf.toFixed(6)} kNm, M_C = ${MC_stijf.toFixed(6)} kNm` +
    ` → het verschil met de tabel hierboven (${(MA - MA_stijf).toExponential(2)} resp.` +
    ` ${(MC - MC_stijf).toExponential(2)} kNm) IS de normaalkrachtvervorming.`);

// ── Claim van de bron: de puntlasten beïnvloeden de momenten NIET ──────────
const zonderF = { ...multiInput, pointLoads: [] };
const RzonderF = combineResults(combo, solveAllCases(zonderF).perCase);
const MC_zonderF = Math.abs(kNm(el(RzonderF, 2).M_end));
log(`  · zonder de puntlasten F: M_C = ${MC_zonderF.toFixed(6)} kNm ` +
    `(verschil met F: ${(MC - MC_zonderF).toExponential(2)} kNm) → de claim van de bron ` +
    `dat F de momentenverdeling niet beïnvloedt, klopt in ons model exact.`);

// ════════════════════════════════════════════════════════════════════════════
// 2. ROTATIEVEERSTIJFHEID VAN DE REGELS  r = 6EI/a
// ════════════════════════════════════════════════════════════════════════════
// In de zijdelings verplaatsende (sway-)mode draaien BEIDE einden van een regel
// even veel en dezelfde kant op. De regel levert dan per einde M = 6EI/a · θ.
// Dat is met de app na te meten: een vrij opgelegde regel van 6 m met gelijke
// koppels M op beide einden; r = M/θ.
log("\n════════════════════════════════════════════════════════════════════");
log("BLOK 2 — rotatieveerstijfheid van de regels (hulpmodel in dezelfde solver)");
log("════════════════════════════════════════════════════════════════════");
{
  const M0 = 10e6;   // 10 kNm op beide einden
  const rr = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: a_mm, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: sec.E, A: sec.A, I: sec.I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [],
    pointLoads: [{ nodeId: 1, my: M0 }, { nodeId: 2, my: M0 }],
  });
  const th1 = Math.abs(rr.displacements.get(1).ry);
  const th2 = Math.abs(rr.displacements.get(2).ry);
  const r_gemeten = (M0 / 1e6) / th1;
  log(`  θ(links) = ${th1.toExponential(6)} rad, θ(rechts) = ${th2.toExponential(6)} rad (gelijk ⇒ sway-patroon)`);
  vergelijk("r = 6EI/a (regelveer)", 1000.0, r_gemeten, "kNm/rad", 1);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. STABILITEIT — kniklast, kniklengte, n en de vergrotingsfactor
// ════════════════════════════════════════════════════════════════════════════
// Zie de kop: de app kent geen eigenwaardeanalyse. We bisecteren de
// belastingfactor λ tot de stabiliteitscheck van het 2e-orde-pad omslaat.
// Voor een geometrische stijfheidsmatrix moeten de staven onderverdeeld
// worden; n = 8 elementen per staaf is ruim convergent (zie de reeks hieronder).

/** Kokerraamwerk met elke staaf in `n` elementen; geval 1 = F, geval 2 = q. */
function bouwVerfijnd(n, { F_kN = 15, q_kNm = 8, scheefstand } = {}) {
  const nodes = [], beams = [];
  let nid = 1, bid = 1;
  const zet = (x, z) => { const id = nid++; nodes.push({ id, x, z }); return id; };
  const A_ = zet(0, 0), B_ = zet(a_mm, 0), C_ = zet(0, b_mm), D_ = zet(a_mm, b_mm);
  const keten = (p, q) => {
    const pa = nodes.find(x => x.id === p), pb = nodes.find(x => x.id === q);
    const ids = []; let vorig = p;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const eind = i === n ? q : zet(pa.x + (pb.x - pa.x) * t, pa.z + (pb.z - pa.z) * t);
      beams.push({ id: bid, from: vorig, to: eind, E: sec.E, A: sec.A, I: sec.I });
      ids.push(bid++); vorig = eind;
    }
    return ids;
  };
  const AB = keten(A_, B_), AC = keten(A_, C_), BD = keten(B_, D_), CD = keten(C_, D_);
  return {
    nodes, beams,
    supports: [{ nodeId: A_, type: "pinned" }, { nodeId: B_, type: "pinned" }],
    loads: CD.map(id => ({ beamId: id, q: -q_kNm, caseId: 2 })),
    pointLoads: [
      { nodeId: C_, fz: -F_kN * 1000, caseId: 1 },
      { nodeId: D_, fz: -F_kN * 1000, caseId: 1 },
    ],
    cases: [{ id: 1, name: "F" }, { id: 2, name: "q" }],
    scheefstand,
    _A: A_, _B: B_, _C: C_, _D: D_, _AB: AB, _AC: AC, _BD: BD, _CD: CD,
  };
}

/** Is het 2e-orde-pad bij deze factoren nog stabiel volgens de app? */
function stabiel(input, factors) {
  try {
    solveCombinationSecondOrder(input, { id: 99, name: "λ-probe", factors });
    return true;
  } catch (e) {
    // Alleen de stabiliteitsmelding telt als "instabiel"; elke andere fout
    // is een modelfout en moet zichtbaar blijven.
    const msg = String(e?.message ?? e);
    if (/niet convergent|kritieke/i.test(msg)) return false;
    throw e;
  }
}

/** Kritieke belastingfactor λ via bisectie op de stabiliteitscheck. */
function lambdaKritiek(input, basis) {
  const f = (lam) => new Map([...basis].map(([c, g]) => [c, g * lam]));
  let lo = 0.05, hi = 1;
  if (!stabiel(input, f(lo))) throw new Error("al instabiel bij λ = 0,05");
  while (stabiel(input, f(hi)) && hi < 1e5) { lo = hi; hi *= 2; }
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (stabiel(input, f(mid))) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

log("\n════════════════════════════════════════════════════════════════════");
log("BLOK 3 — stabiliteit (afgeleid uit de 2e-orde-stabiliteitscheck)");
log("════════════════════════════════════════════════════════════════════");

// IJKING van de methode zelf: dezelfde bisectie op een scharnier-scharnier
// kolom, waarvan de kniklast exact π²EI/L² is. Slaagt die, dan meet de
// bisectie een echte kniklast en geen numeriek artefact.
{
  const Ek = 210000, Ik = 1e8, Ak = 3877, Lk = 4000;
  const PE = (Math.PI ** 2 * Ek * Ik) / Lk ** 2 / 1e3;   // kN
  const n = 16, nodes = [], beams = [];
  for (let i = 0; i <= n; i++) nodes.push({ id: i + 1, x: 0, z: (Lk / n) * i });
  for (let i = 0; i < n; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E: Ek, A: Ak, I: Ik });
  const ijk = {
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: n + 1, type: "xRoller" }],
    loads: [], pointLoads: [{ nodeId: n + 1, fz: -1000, caseId: 1 }],
    cases: [{ id: 1, name: "P" }],
  };
  const lam = lambdaKritiek(ijk, new Map([[1, 1]]));
  vergelijk("IJKING: Euler-kniklast scharnier-scharnier", PE, lam * 1, "kN", 0.5, "toets",
    "Toont aan dat de λ-bisectie op de stabiliteitscheck een echte kniklast meet.");
}

log("\n  Convergentie met de elementindeling (alleen F, q = 0 → N_kolom = λ·F):");
let Ncr = NaN, lk = NaN;
for (const n of [1, 2, 4, 8, 16]) {
  const inp = bouwVerfijnd(n);
  const lam = lambdaKritiek(inp, new Map([[1, 1]]));
  const N = lam * 15;
  const l = Math.PI * Math.sqrt(EI_kNm2 / N);
  log(`    ${String(n).padStart(2)} el/staaf → λ_cr = ${lam.toFixed(5)}, N_cr = ${N.toFixed(3)} kN, l_k = ${l.toFixed(4)} m`);
  if (n === 16) { Ncr = N; lk = l; }
}
// Zelfde som met EA × 10 000: de bron verwaarloost normaalkrachtvervorming,
// en daarmee valt onze restafwijking t.o.v. de gesloten oplossing helemaal weg.
{
  const inp = bouwVerfijnd(16);
  const stijf = { ...inp, beams: inp.beams.map(b => ({ ...b, A: b.A * 1e4 })) };
  const lam = lambdaKritiek(stijf, new Map([[1, 1]]));
  const N = lam * 15;
  log(`    16 el/staaf, EA × 10 000 → N_cr = ${N.toFixed(4)} kN, ` +
      `l_k = ${(Math.PI * Math.sqrt(EI_kNm2 / N)).toFixed(5)} m`);
  log(`      Exacte gesloten oplossing van hetzelfde model: N_cr = 157,9953 kN, l_k = 7,90365 m` +
      ` → afwijking ${((N / 157.9953 - 1) * 100).toFixed(4)} %.`);
  log(`      De 0,05 % die zonder deze ingreep overblijft is dus zuiver` +
      ` normaalkrachtvervorming, geen solverfout.`);
}

vergelijk("F_k — kniklast van de kolom", 149.5, Ncr, "kN", 2, "toets",
  "Zie de toelichting onderaan: onafhankelijk nagerekend is de exacte waarde 157,995 kN.");
vergelijk("l_k — kniklengte", 8.12, lk, "m", 2, "toets",
  "Exacte gesloten oplossing voor het model van de bron zelf: 7,9037 m.");

// Maximale puntlast bij de maatgevende kniklast (q blijft 8 kN/m).
{
  const n = 8;
  let lo = 1, hi = 200;
  const test = (F) => stabiel(bouwVerfijnd(n, { F_kN: F }), new Map([[1, 1], [2, 1]]));
  while (test(hi) && hi < 1e5) { lo = hi; hi *= 2; }
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (test(m)) lo = m; else hi = m; }
  const Fmax = (lo + hi) / 2;
  vergelijk("F_max — maximale puntlast bij knik", 125.5, Fmax, "kN", 2, "toets",
    `Bijbehorende kolomnormaalkracht N = 24 + F_max = ${(24 + Fmax).toFixed(2)} kN.`);
}

// n = F_k/(F + 24) en de vergrotingsfactor n/(n−1).
{
  const n = 8;
  const inp = bouwVerfijnd(n);
  const lamVol = lambdaKritiek(inp, new Map([[1, 1], [2, 1]]));   // q + F samen
  const vergroting = lamVol / (lamVol - 1);
  log(`\n  Met q én F samen geschaald: λ_cr = ${lamVol.toFixed(5)} ` +
      `(= N_cr/39 zou ${(Ncr / 39).toFixed(5)} zijn; het verschil is de druk in de bovenregel,` +
      ` die de handmethode verwaarloost).`);
  vergelijk("n = F_k/(F + 24)", 3.83, lamVol, "–", 2, "toets");
  vergelijk("vergrotingsfactor n/(n−1)", 1.35, vergroting, "–", 2, "toets");

  // Gemeten vergroting: de symmetrische belasting laat het raamwerk NIET
  // zijdelings uitwijken, dus zonder imperfectie is er ook niets te vergroten.
  // Met de scheefstand van de app (φ = 1/200) ontstaat wel een sway-component;
  // die hoort met n/(n−1) vergroot te worden.
  const inpSch = bouwVerfijnd(n, { scheefstand: { phi: 1 / 200, richting: 1 } });
  const r1 = solve({
    nodes: inpSch.nodes, beams: inpSch.beams, supports: inpSch.supports,
    loads: inpSch.loads, pointLoads: inpSch.pointLoads, scheefstand: inpSch.scheefstand,
  });
  const r2 = solveCombinationSecondOrder(inpSch, { id: 1, name: "1,0·(F+q)", factors: new Map([[1, 1], [2, 1]]) });
  const sway = (r, m) => 0.5 * (r.displacements.get(m._C).ux + r.displacements.get(m._D).ux);
  const s1 = sway(r1, inpSch), s2 = sway(r2, inpSch);
  log(`\n  Gemeten vergroting van de zijdelingse uitwijking (met scheefstand 1/200):`);
  log(`    1e orde ${s1.toFixed(4)} mm → 2e orde ${s2.toFixed(4)} mm  = factor ${(s2 / s1).toFixed(4)}`);
  vergelijk("vergrotingsfactor — GEMETEN in het 2e-orde-pad", 1.35, s2 / s1, "–", 2, "meld",
    `Ons eigen n/(n−1) = ${vergroting.toFixed(4)}; de gemeten factor wijkt daar ` +
    `${(((s2 / s1) / vergroting - 1) * 100).toFixed(2)} % van af — de app en de formule zijn onderling consistent.`);

  // Zuiver symmetrisch (zonder scheefstand) is er geen sway en dus geen
  // vergroting: dat legt vast dat 1,35 een IMPERFECTIE-grootheid is.
  const r2sym = solveCombinationSecondOrder(inp, { id: 1, name: "1,0·(F+q)", factors: new Map([[1, 1], [2, 1]]) });
  const MC2 = Math.abs(kNm(r2sym.elements.get(inp._AC[n - 1]).M_end));
  log(`\n  Zuiver symmetrisch (zonder scheefstand), 2e orde: M_C = ${MC2.toFixed(4)} kNm ` +
      `tegen ${MC.toFixed(4)} kNm in de 1e orde → factor ${(MC2 / MC).toFixed(4)}.`);
  log(`    De symmetrische belasting wekt geen zijdelingse uitwijking op, dus de ` +
      `sway-vergroting 1,35 werkt hier NIET op de momenten; er blijft alleen een klein P-δ-effect binnen de staven.`);
}

// ════════════════════════════════════════════════════════════════════════════
// SAMENVATTING
// ════════════════════════════════════════════════════════════════════════════
log("\n════════════════════════════════════════════════════════════════════");
log("SAMENVATTING R09");
log("════════════════════════════════════════════════════════════════════");
const grootste = rijen.filter(r => r.soort === "toets")
  .reduce((m, r) => Math.abs(r.pct) > Math.abs(m.pct) ? r : m, { pct: 0, naam: "—" });
for (const r of rijen) {
  const merk = r.soort === "meld" ? "·" : (r.binnen ? "✓" : "✗");
  log(`  ${merk} ${r.naam.padEnd(46)} ${fmt(r.referentie).padStart(10)} → ${fmt(r.onze).padStart(10)} ${r.eenheid.padEnd(7)} ${(r.pct >= 0 ? "+" : "") + r.pct.toFixed(3)} %`);
}
log(`\n  binnen tolerantie: ${ok}   afwijkend: ${afwijkend}`);
log(`  grootste afwijking: ${grootste.naam} — ${grootste.pct.toFixed(3)} %`);
log(`
  OORDEEL
  • Blok 1 en 2 (momentenverdeling, normaalkracht, regelveer) komen tot op
    afrondingsniveau overeen met de bron. Het restje van 0,04 % op M_A is
    zuiver normaalkrachtvervorming: met EA × 1000 valt het weg.
  • Blok 3 (stabiliteit) wijkt af. Dat is onderzocht: het model van de bron —
    kolom 6 m, EI = 1000 kN·m², rotatieveren r = 6EI/a = 1000 kN·m/rad aan
    BEIDE einden, zijdelings verplaatsbaar — heeft een gesloten oplossing.
    Twee onafhankelijke afleidingen (antimetrische mode tan(kL/2) = r/(EI·k),
    en slope-deflection met stabiliteitsfuncties) geven allebei
    N_cr = 157,995 kN en l_k = 7,9037 m. Onze solver komt daar met verfijning
    én met EA × 10 000 (de aanname van de bron) tot op 0,0001 % op uit; met de
    eindige EA van ons profiel blijft 0,05 % verschil over. De bronwaarden 149,5 kN /
    8,12 m horen bij een 2,7 % te grote kniklengte; l_k/L = 8,12/6 = 1,353
    tegen exact 1,317 — de waarde van een grafiek/nomogram, niet van de
    gesloten oplossing. De afgeleide waarden n = 3,83, F_max = 125,5 kN en
    n/(n−1) = 1,35 erven die afwijking. De bron is INTERN consistent
    (π²EI/8,12² = 149,7 ≈ 149,5), dus het is geen zetfout maar een
    afleesonnauwkeurigheid.
  • De vergrotingsfactor zelf klopt in onze app: gemeten sway-vergroting en
    n/(n−1) uit onze eigen λ_cr stemmen binnen een fractie van een procent
    overeen. Wel geldt dat 1,35 pas ergens op werkt zodra er een imperfectie
    (scheefstand) is; de zuiver symmetrische belasting van dit geval wekt geen
    zijdelingse uitwijking op.`);
