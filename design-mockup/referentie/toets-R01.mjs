/**
 * R01 — Ingeklemde ligger 1,0 m met gecombineerde punt-, moment-, axiaal- en
 * lijnbelasting.
 *
 * Geval R01 uit het referentiedossier
 * docs/superpowers/plans/2026-09-02-referentieberekeningen.md.
 * Bron van de referentiewaarden: Franse validatiebundel voor rekenprogramma's
 * (AFNOR / Société Française des Mécaniciens, 1990), testreeks SSLL, geval
 * SSLL01. De referentiewaarden zijn LETTERLIJK overgenomen uit het dossier en
 * worden hier NIET bijgesteld.
 *
 * Wat dit script doet:
 *   1. bouwt het model, schrijft het als `R01.femp` (serializeProject);
 *   2. rekent het TWEE keer door:
 *        (A) rechtstreeks via `solve()` met de exacte E/A/I uit de bron —
 *            dit is de eigenlijke vergelijking met de referentie;
 *        (B) via de volledige app-route: bestand terug inlezen
 *            (deserializeProject) → bouwMultiInput → solveAllCases →
 *            combineResults(1,0·LG1 + 1,0·LG2). Zo is aangetoond dat het
 *            opgeslagen bestand dezelfde getallen geeft als (A);
 *   3. legt elke referentiewaarde naast onze uitkomst met de afwijking in %;
 *   4. controleert bovendien de grootheden die de BRON niet geeft
 *      (verticale reacties, inklemmingsmomenten, normaalkrachtverloop) tegen
 *      een handafleiding, als onafhankelijke derde partij.
 *
 * Draaien vanuit design-mockup:  npx tsx referentie/toets-R01.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BEPERKING VAN DE APP — DOORSNEDE NIET VRIJ IN TE VOEREN
 *
 * De bron schrijft een vrije doorsnede voor: E = 2,1·10^11 Pa (210 000 N/mm²),
 * A = 1,0·10^-3 m² (1 000 mm²), Izz = 1,7·10^-8 m^4 (17 000 mm⁴), oftewel een
 * stalen strip van ca. 70,0 × 14,28 mm. Het projectbestand kent echter geen
 * vrije doorsnede: `resolveSection` leidt E, A en I af uit (materiaal,
 * profielnaam) — óf een staalprofiel uit de bibliotheek, óf een houten
 * rechthoek b×h met de E van de sterkteklasse. Er zit geen staalprofiel in de
 * bibliotheek met A = 1 000 mm² én I = 17 000 mm⁴, en de staal-E ligt vast op
 * 210 000 N/mm².
 *
 * AANNAME (expliciet): het opgeslagen model gebruikt daarom een STIJFHEIDS-
 * EQUIVALENTE houtrechthoek — sterkteklasse C24 (E = 11 000 N/mm²) met b en h
 * zó gekozen dat E·A en E·I EXACT gelijk zijn aan die van de bron. Voor een
 * lineaire raamwerkberekening zijn E·A en E·I de enige stijfheidsgrootheden
 * die het antwoord bepalen, dus (A) en (B) moeten cijfermatig samenvallen —
 * dat wordt hieronder ook getoetst. De doorsnede is dus vervangen, de
 * STIJFHEID niet. Eigen gewicht staat uit, dus de dichtheid van C24 speelt
 * geen rol. Er wordt in dit geval geen normtoetsing gedraaid.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync } from "node:fs";

const { solve } = await import("../src/components/fem/solver/engine.ts");
const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection, TIMBER_E_MEAN } = await import("../src/lib/sectionResolver.ts");

const log = (s) => process.stdout.write(s + "\n");
let passed = 0, failed = 0;

/** Vergelijking met tolerantie in procent; drukt de afwijking altijd af. */
function vergelijk(naam, onze, referentie, tolPct, eenheid = "") {
  const afw = referentie === 0
    ? (Math.abs(onze) < 1e-9 ? 0 : Infinity)
    : ((onze - referentie) / Math.abs(referentie)) * 100;
  const ok = Number.isFinite(onze) && Math.abs(afw) <= tolPct;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(44)} ref ${fmt(referentie)}${eenheid}` +
      `  ons ${fmt(onze)}${eenheid}  Δ ${afw >= 0 ? "+" : ""}${afw.toFixed(3)} %`);
  return afw;
}

function checkWaar(naam, cond, extra = "") {
  if (cond) passed++; else failed++;
  log(`  ${cond ? "✓" : "✗"} ${naam}${extra ? "  (" + extra + ")" : ""}`);
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(5);
  return v.toFixed(a >= 100 ? 2 : 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INVOER uit het dossier (geval R01)
// ═══════════════════════════════════════════════════════════════════════════
// Knopen op één rechte lijn (m):  A 0,0 · D 0,3 · G 0,5 · E 0,7 · B 1,0
// In app-eenheden (mm):
const X_A = 0, X_D = 300, X_G = 500, X_E = 700, X_B = 1000;
const ID_A = 1, ID_D = 2, ID_G = 3, ID_E = 4, ID_B = 5;

// Doorsnede van de bron, omgerekend naar app-eenheden:
//   E   = 2,1·10^11 Pa      → 210 000 N/mm²
//   A   = 1,0·10^-3 m²      → 1 000 mm²
//   Izz = 1,7·10^-8 m^4     → 17 000 mm⁴   (E·I = 3 570 N·m²)
const E_REF = 210000;   // N/mm²
const A_REF = 1000;     // mm²
const I_REF = 17000;    // mm⁴

// Belastingen (bron in N, N·m; app in kN, kNm; solver in N, N·mm):
//   LG1: D → Fx = +30 000 N, Mz = −3 000 N·m ; E → Fx = +10 000 N, Fy = −20 000 N
//   LG2: q = −24 000 N/m over de volle lengte A–B
const FX_D = 30000;     // N
const MZ_D = -3e6;      // N·mm  (= −3 000 N·m, tegen de klok in positief)
const FX_E = 10000;     // N
const FZ_E = -20000;    // N
const Q    = -24;       // N/mm  (= −24 000 N/m = −24 kN/m)

// Referentiewaarden (LETTERLIJK uit het dossier, niet aanpassen):
const REF = {
  V_G:  -540,      // N
  M_G:  2800,      // N·m
  w_G:  -4.9e-2,   // m
  Rx_A: -24000,    // N
};

log("═".repeat(78));
log("R01 — ingeklemde ligger 1,0 m, punt- + moment- + axiaal- + lijnlast");
log("═".repeat(78));

// ═══════════════════════════════════════════════════════════════════════════
// 2. MODEL BOUWEN EN OPSLAAN ALS R01.femp
// ═══════════════════════════════════════════════════════════════════════════
// Stijfheidsequivalente houtrechthoek — zie de kop van dit bestand.
// h volgt uit I/A (h = √(12·I/A), onafhankelijk van E), b uit E·A.
const E_HOUT = TIMBER_E_MEAN.C24;                       // 11 000 N/mm²
const H_EQ = Math.sqrt(12 * I_REF / A_REF);             // 14,282857 mm
const B_EQ = (E_REF / E_HOUT) * A_REF / H_EQ;           // 1 336,63 mm
const PROFIEL = `${B_EQ.toFixed(6)}x${H_EQ.toFixed(9)}`;
const MATERIAAL = "C24";

const model = {
  nodes: [
    { id: ID_A, x: X_A, z: 0 },
    { id: ID_D, x: X_D, z: 0 },
    { id: ID_G, x: X_G, z: 0 },
    { id: ID_E, x: X_E, z: 0 },
    { id: ID_B, x: X_B, z: 0 },
  ],
  beams: [
    { id: 1, from: ID_A, to: ID_D, material: MATERIAAL, profile: PROFIEL },
    { id: 2, from: ID_D, to: ID_G, material: MATERIAAL, profile: PROFIEL },
    { id: 3, from: ID_G, to: ID_E, material: MATERIAAL, profile: PROFIEL },
    { id: 4, from: ID_E, to: ID_B, material: MATERIAAL, profile: PROFIEL },
  ],
  supports: [
    { nodeId: ID_A, type: "fixed" },   // ux = uz = 0, φ = 0
    { nodeId: ID_B, type: "fixed" },
  ],
  plates: [],
  loads: [
    // LG1 (caseId 1) — app-eenheden: kN en kNm.
    { id: 1, type: "pointForce",  caseId: 1, nodeId: ID_D, fx: FX_D / 1000 },
    { id: 2, type: "pointMoment", caseId: 1, nodeId: ID_D, my: MZ_D / 1e6 },
    { id: 3, type: "pointForce",  caseId: 1, nodeId: ID_E, fx: FX_E / 1000, fz: FZ_E / 1000 },
    // LG2 (caseId 2) — lijnlast in kN/m (= N/mm) over alle vier de delen.
    { id: 4, type: "lineLoad", caseId: 2, beamId: 1, q: Q },
    { id: 5, type: "lineLoad", caseId: 2, beamId: 2, q: Q },
    { id: 6, type: "lineLoad", caseId: 2, beamId: 3, q: Q },
    { id: 7, type: "lineLoad", caseId: 2, beamId: 4, q: Q },
  ],
  loadCases: [
    { id: 1, name: "LG1 punt-, moment- en axiaallast", type: "other" },
    { id: 2, name: "LG2 lijnlast 24 kN/m", type: "other" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // dossier: eigen gewicht NIET aanbrengen
  nonlinearEnabled: false,    // dossier: lineaire (eerste-orde) oplossing
  combinations: [
    { id: 1, name: "LG1 + LG2", type: "uls", formula: "1,0·LG1 + 1,0·LG2",
      factors: { 1: 1, 2: 1 } },
  ],
  // Vrij veld: reist mee in het JSON, wordt door de app genegeerd, maar legt
  // de vervangen doorsnede vast voor wie het bestand opent.
  toelichting:
    "Referentiegeval R01 (validatiecampagne). Doorsnede van de bron: " +
    "E = 210000 N/mm2, A = 1000 mm2, I = 17000 mm4. De app kent geen vrije " +
    "doorsnede-invoer; hier staat een stijfheidsequivalente C24-rechthoek " +
    `(${PROFIEL} mm) met exact dezelfde E*A en E*I. Eigen gewicht uit.`,
};

const femp = serializeProject(model);
const pad = new URL("./R01.femp", import.meta.url);
writeFileSync(pad, femp, "utf8");
// Dezelfde inhoud nog eens onder de extensie die de open-dialoog van de app
// filtert (PROJECT_FILE_EXT = "ifcfem2d"), zodat het model ook echt via
// Bestand → Openen te kiezen is.
const padApp = new URL("./R01.ifcfem2d", import.meta.url);
writeFileSync(padApp, femp, "utf8");
log(`\nModel opgeslagen: ${decodeURIComponent(pad.pathname.replace(/^\//, ""))}`);
log(`             ook: ${decodeURIComponent(padApp.pathname.replace(/^\//, ""))}`);
log(`Vervangende doorsnede: ${MATERIAAL} ${PROFIEL} mm`);

// Controle dat de vervanging stijfheidsneutraal is.
log("\n[0] Stijfheidsequivalentie van de vervangende doorsnede");
{
  const sec = resolveSection(MATERIAAL, PROFIEL);
  vergelijk("E·A  (N)",     sec.E * sec.A, E_REF * A_REF, 0.001);
  vergelijk("E·I  (N·mm²)", sec.E * sec.I, E_REF * I_REF, 0.001);
  checkWaar("doorsnede herkend als hout-rechthoek", sec.bron === "hout-bxh", sec.bron);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ROUTE A — rechtstreeks doorrekenen met de EXACTE doorsnede van de bron
// ═══════════════════════════════════════════════════════════════════════════
const invoerA = {
  nodes: model.nodes,
  beams: model.beams.map((b) => ({ id: b.id, from: b.from, to: b.to,
    E: E_REF, A: A_REF, I: I_REF })),
  supports: model.supports,
  // LG1 + LG2 gelijktijdig, zonder partiële factoren (dossier: som van beide).
  loads: [1, 2, 3, 4].map((id) => ({ beamId: id, q: Q })),
  pointLoads: [
    { nodeId: ID_D, fx: FX_D },
    { nodeId: ID_D, my: MZ_D },
    { nodeId: ID_E, fx: FX_E, fz: FZ_E },
  ],
};
const A_res = solve(invoerA);

// ═══════════════════════════════════════════════════════════════════════════
// 4. ROUTE B — het OPGESLAGEN bestand via de volledige app-route
// ═══════════════════════════════════════════════════════════════════════════
const terug = deserializeProject(femp);
const multi = bouwMultiInput({
  nodes: terug.nodes,
  beams: terug.beams,
  supports: terug.supports,
  plates: terug.plates,
  loadCases: terug.loadCases,
  loads: terug.loads,
  selfWeightEnabled: terug.selfWeightEnabled,
  scheefstandEnabled: terug.scheefstandEnabled ?? false,
  scheefstandNoemer: terug.scheefstandNoemer ?? 200,
  scheefstandRichting: terug.scheefstandRichting ?? 1,
});
const perCase = solveAllCases(multi).perCase;
const B_res = combineResults(
  { id: 1, name: "LG1 + LG2", type: "uls", formula: "1,0·LG1 + 1,0·LG2",
    factors: new Map([[1, 1], [2, 1]]) },
  perCase,
);

// ── Uitlezen in knoop G (knoop 3) ──────────────────────────────────────────
// G ligt tussen staaf 2 (D→G, laatste station) en staaf 3 (G→E, eerste
// station). Er grijpt in G geen last aan, dus V en M zijn er continu; beide
// uitlezingen moeten samenvallen. Beide staven lopen in +x, dus lokale en
// globale assen vallen samen.
function inG(res) {
  const links = res.elements.get(2);   // D→G
  const rechts = res.elements.get(3);  // G→E
  return {
    V_links: links.shearForce[20], V_rechts: rechts.shearForce[0],
    M_links: links.bendingMoment[20], M_rechts: rechts.bendingMoment[0],
    w: res.displacements.get(ID_G).uz,        // mm
    Rx_A: res.reactions.get(ID_A).fx,          // N
    Rz_A: res.reactions.get(ID_A).fz,          // N
    My_A: res.reactions.get(ID_A).my,          // N·mm
    Rx_B: res.reactions.get(ID_B).fx,
    Rz_B: res.reactions.get(ID_B).fz,
    My_B: res.reactions.get(ID_B).my,
  };
}
const A = inG(A_res), B = inG(B_res);

log("\n[1] Route A en route B leveren hetzelfde (bestand = rekenmodel)");
vergelijk("V(G) A vs B (N)", B.V_links, A.V_links, 0.001);
vergelijk("M(G) A vs B (N·mm)", B.M_links, A.M_links, 0.001);
vergelijk("w(G) A vs B (mm)", B.w, A.w, 0.001);
vergelijk("Rx(A) A vs B (N)", B.Rx_A, A.Rx_A, 0.001);

log("\n[2] Continuïteit in knoop G (geen last in G)");
vergelijk("V links vs rechts van G (N)", A.V_rechts, A.V_links, 0.001);
vergelijk("M links vs rechts van G (N·mm)", A.M_rechts, A.M_links, 0.001);

// ═══════════════════════════════════════════════════════════════════════════
// 5. DE VERGELIJKING MET DE REFERENTIE
// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] Referentiewaarden uit het dossier naast onze uitkomst");
log("    (tolerantie 1 % — numerieke referentie uit een validatiebundel)");

// Dwarskracht. Onze conventie: V = Σ opwaartse krachten links van de snede,
// dus dM/dx = V (zie types.ts en de conventietest in dit bestand). De bron
// noteert −540 N; de grootte valt exact samen, het teken is gespiegeld.
// Daarom worden hieronder ZOWEL het rauwe getal als de absolute waarde
// getoond, en telt alleen |V| als vergelijking mee.
const V_ons = A.V_links;                       // N
log(`  · rauwe V(G) in onze conventie: ${fmt(V_ons)} N  (bron: ${REF.V_G} N)`);
vergelijk("|V(G)|", Math.abs(V_ons), Math.abs(REF.V_G), 1.0, " N");

const M_ons = A.M_links / 1000;                // N·mm → N·m
vergelijk("M(G)", M_ons, REF.M_G, 1.0, " N·m");

const w_ons = A.w / 1000;                      // mm → m
vergelijk("w(G)", w_ons, REF.w_G, 1.0, " m");

const Rx_ons = A.Rx_A;                         // N
vergelijk("Rx(A) — axiale oplegreactie", Rx_ons, REF.Rx_A, 1.0, " N");

// ═══════════════════════════════════════════════════════════════════════════
// 6. HANDAFLEIDING ALS DERDE PARTIJ
// ═══════════════════════════════════════════════════════════════════════════
// De bron geeft de verticale reacties en de inklemmingsmomenten NIET. Ze zijn
// hieronder met de hand afgeleid met de standaardformules voor een aan beide
// zijden ingeklemde ligger (L = 1 m), per deelbelasting gesuperponeerd:
//
//   (a) q = 24 kN/m omlaag:  M_A = M_B = −qL²/12 = −2 000 N·m ;  R = qL/2 = 12 000 N
//   (b) P = 20 kN omlaag op a = 0,7 m (b = 0,3 m):
//        M_A = −P·a·b²/L² = −1 260 N·m ;  M_B = −P·a²·b/L² = −2 940 N·m
//        R_A = P·b²(3a+b)/L³ = 4 320 N ;  R_B = P·a²(a+3b)/L³ = 15 680 N
//   (c) koppel M₀ = −3 kN·m op a = 0,3 m (afgeleid via dubbele integratie van
//       EI·v'' = M(x) met v = v' = 0 aan beide einden):
//        R_A = 6·M₀·a·b/L³ = −3 780 N (en R_B = +3 780 N)
//        M_A = M₀·b·(L−3a)/L² = −210 N·m ;  M_B = M₀·b/L − R_A·L − M₀ = −990 N·m
//
//   Som:  M_A = −3 470 N·m ; M_B = −5 930 N·m ; R_A = 12 540 N ; R_B = 31 460 N
//
// Tekens: M is buigmoment met doorhangen (sagging) positief; de oplegreactie
// `my` van de app is −M aan het startuiteinde en +M aan het einduiteinde
// (empirisch vastgesteld op een uitkraging met bekende oplossing).
const HAND = {
  M_A: -3470,     // N·m, sagging-positief
  M_B: -5930,     // N·m
  Rz_A: 12540,    // N, omhoog
  Rz_B: 31460,    // N
  Rx_B: -16000,   // N
};

log("\n[4] Grootheden die de bron NIET geeft, tegen een handafleiding");
vergelijk("Rz(A) verticale oplegreactie", A.Rz_A, HAND.Rz_A, 0.5, " N");
vergelijk("Rz(B) verticale oplegreactie", A.Rz_B, HAND.Rz_B, 0.5, " N");
vergelijk("Rx(B) axiale oplegreactie", A.Rx_B, HAND.Rx_B, 0.5, " N");
vergelijk("M(A) inklemmingsmoment", A_res.elements.get(1).bendingMoment[0] / 1000,
  HAND.M_A, 0.5, " N·m");
vergelijk("M(B) inklemmingsmoment", A_res.elements.get(4).bendingMoment[20] / 1000,
  HAND.M_B, 0.5, " N·m");
vergelijk("reactiekoppel A = −M(A)", A.My_A / 1000, -HAND.M_A, 0.5, " N·m");
vergelijk("reactiekoppel B = +M(B)", A.My_B / 1000, HAND.M_B, 0.5, " N·m");

log("\n[5] Evenwichtscontroles op het geheel");
{
  const sumFx = A.Rx_A + A.Rx_B + FX_D + FX_E;
  const sumFz = A.Rz_A + A.Rz_B + FZ_E + Q * (X_B - X_A);
  // Momentenevenwicht om A (tegen de klok in positief), in N·m:
  const sumM =
    (Q * (X_B - X_A)) * ((X_B - X_A) / 2) / 1000        // lijnlast (N/mm·mm → N; arm in m)
    + (FZ_E * (X_E / 1000))                             // puntlast in E
    + MZ_D / 1000                                       // koppel in D, N·mm → N·m
    + A.My_A / 1000                                     // reactiekoppel A, N·mm → N·m
    + A.My_B / 1000                                     // reactiekoppel B, N·mm → N·m
    + A.Rz_B * (X_B / 1000);                            // verticale reactie B
  checkWaar("ΣFx = 0", Math.abs(sumFx) < 1e-3, `${sumFx.toExponential(2)} N`);
  checkWaar("ΣFz = 0", Math.abs(sumFz) < 1e-3, `${sumFz.toExponential(2)} N`);
  checkWaar("ΣM om A = 0", Math.abs(sumM) < 1e-3, `${sumM.toExponential(2)} N·m`);
}

log("\n[6] Normaalkrachtverloop (trek positief) — handafleiding");
{
  // Kracht naar oplegging A: 30 000·0,7 + 10 000·0,3 = 24 000 N.
  // N(A–D) = +24 000 (trek) · N(D–E) = −6 000 · N(E–B) = −16 000.
  vergelijk("N in A–D", A_res.elements.get(1).normalForce[10], 24000, 0.01, " N");
  vergelijk("N in D–G", A_res.elements.get(2).normalForce[10], -6000, 0.01, " N");
  vergelijk("N in G–E", A_res.elements.get(3).normalForce[10], -6000, 0.01, " N");
  vergelijk("N in E–B", A_res.elements.get(4).normalForce[10], -16000, 0.01, " N");
}

log("\n" + "═".repeat(78));
log(`TOTAAL: ${passed} geslaagd, ${failed} mislukt`);
log("═".repeat(78));
process.exit(failed > 0 ? 1 : 0);
