// ═══════════════════════════════════════════════════════════════════════════
// R10 — Ligger met schuine staaf, twee oplegvarianten
//
// Referentie: uitgewerkte tentamenopgave van een technische universiteit
// (verplaatsingsmethode). Zie het werkdossier
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R10,
// voor bron, invoer en de elf referentiewaarden.
//
// SYSTEEM (maten in m, oorsprong in de inklemming A; z positief omhoog)
//
//                         q = 1140 kN/m ↓↓↓↓↓↓↓↓↓↓↓
//                         ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
//   A(0;0) ══════════════ D(4;0) ═══════════════════ C(8;0)
//     ▓  ← inklemming        ║ momentvaste knoop        ○  ← situatie 1 én 2:
//     ▓                       ╲                             verticale steun,
//                              ╲  staaf DB, 45°,            horizontaal vrij
//                               ╲ L = 4√2 = 5,657 m
//                                ╲
//                            B(0;−4)
//                              situatie 1: scharnieroplegging (x én z vast)
//                              situatie 2: horizontaal VRIJ, verticaal vast
//
//   staaf AD: 2EI = 300 000 kNm²
//   staaf DC: 3EI = 450 000 kNm²
//   staaf DB: EI·√2 = 150 000·√2 = 212 132 kNm²
//   belasting: q = 1140 kN/m verticaal omlaag over DC (4,0 m), beide situaties
//
// Situatie 1 is drievoudig statisch onbepaald met niet-verplaatsbare knopen
// (AD houdt D horizontaal, DB + scharnier B houdt D verticaal, DC houdt C).
// In situatie 2 kan B horizontaal weglopen; D zakt dan mee en er ontstaat een
// mechanisme met chordrotatie θ = δ/a in alle drie de staven.
//
// ── AANNAME (staat zo in het dossier) ──────────────────────────────────────
// De bron VERWAARLOOST normaalkrachtvervorming. Dat is voor dit geval geen
// detail maar de kern van situatie 1: de "niet-verplaatsbare knopen" bestaan
// alléén als de staven onrekbaar zijn. Onze solver rekent mét rekvervorming,
// dus de aanname moet in het model gelegd worden door EA groot te maken
// t.o.v. EI. Dat kan met de profielinvoer van de app alleen via een RECHT-
// HOEK b×h: A/I = 12/h², dus de aanname vraagt een KLEINE h en een grote b.
//
// Daarom krijgen de drie staven een FICTIEVE rechthoek b × 5 mm in C24
// (E = 11 000 N/mm²), waarbij b zo is gekozen dat E·I exact de voorgeschreven
// EI is. Dat levert A·L²/I ≈ 7,7·10⁶ en daarmee een rekvervorming van
// ~4·10⁻⁴ mm — verwaarloosbaar. Variant [E] laat zien dat dit géén cosmetische
// keuze is: met een normaal ogende doorsnede (zelfde EI, realistische h) loopt
// situatie 1 tot 30 % uit de pas. De doorsnede is dus bewust een
// "stijfheidsstaaf", geen echt profiel — het model dient om de referentie na
// te rekenen, niet om te toetsen.
//
// ── TEKENAFSPRAAK ──────────────────────────────────────────────────────────
// De bron rapporteert staafeindmomenten in de klassieke conventie van de
// verplaatsingsmethode: M = het moment dat de STAAF op de KNOOP uitoefent,
// tegen de klok in positief. Daardoor geldt M1 + M2 + M3 = 0 in knoop D.
// Onze solver geeft `bendingMoment` / `M_start` / `M_end` sagging-positief
// (geverifieerd met twee probes in _probe-r10.mjs: uitkraging met puntlast en
// tweezijdig ingeklemde ligger onder q). De omrekening is dan:
//     bij de STARTknoop van een staaf:  M_bron = +M_sagging
//     bij de EINDknoop  van een staaf:  M_bron = −M_sagging
// Variant [D] draait staaf DB om (B→D) en toont dat deze mapping dezelfde
// getallen geeft, dus dat er geen oriëntatie-afhankelijk teken in sluipt.
//
// Draaien met: npx tsx referentie/toets-R10.mjs   (vanuit design-mockup/)
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Vergelijk met een referentiewaarde en druk de afwijking in procent af. */
const afwijkingen = [];
function vergelijk(situatie, naam, onze, referentie, eenheid, tolPct = 0.5) {
  const abs = onze - referentie;
  const pct = referentie === 0 ? (Math.abs(abs) < 1e-6 ? 0 : Infinity)
                               : (abs / Math.abs(referentie)) * 100;
  afwijkingen.push({ situatie, naam, onze, referentie, eenheid, pct });
  const ok = Math.abs(pct) <= tolPct;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(4)} ${eenheid} ` +
      `(ref ${referentie} ${eenheid}, Δ = ${abs >= 0 ? "+" : ""}${abs.toFixed(4)} ${eenheid} = ${pct >= 0 ? "+" : ""}${pct.toFixed(3)} %)`);
}

/** Eigen kruiscontrole (géén bronwaarde) — evenwicht, scharniervoorwaarde, … */
function controle(naam, onze, verwacht, eenheid, tolAbs) {
  const ok = Math.abs(onze - verwacht) <= tolAbs;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(8)} ${eenheid} (verwacht ${verwacht} ${eenheid})`);
}

// ── Invoer uit het dossier ─────────────────────────────────────────────────
const a_m  = 4.0;                       // basismaat in m
const q_kNm = 1140;                     // lijnlast in kN/m, verticaal omlaag
const EI_kNm2 = {                       // buigstijfheden uit het dossier
  AD: 300000,                           // 2EI
  DC: 450000,                           // 3EI
  DB: 150000 * Math.SQRT2,              // EI·√2 = 212 132,03…
};

// ── Fictieve doorsnede die de EA→∞-aanname realiseert ──────────────────────
// C24 → E = 11 000 N/mm² (sectionResolver). Rechthoek b × h met
//   I = b·h³/12  →  b = 12·I/h³ = 12·(EI/E)/h³
// h klein ⇒ A/I = 12/h² groot ⇒ normaalkrachtvervorming verwaarloosbaar.
const MATERIAAL = "C24";
const E_MAT = 11000;                    // N/mm², C24 (EN 338) — zie sectionResolver
const H_MM = 5;                         // mm, fictieve hoogte

/** Profielnaam "b x h" die exact de gevraagde EI (in kNm²) oplevert. */
function profielVoorEI(EI_kNm2waarde) {
  const EI_Nmm2 = EI_kNm2waarde * 1e9;  // 1 kNm² = 1e3 N · 1e6 mm² = 1e9 N·mm²
  const I = EI_Nmm2 / E_MAT;            // mm⁴
  const b = (12 * I) / (H_MM ** 3);     // mm
  return `${b.toFixed(4)}x${H_MM}`;
}
const PROFIEL = {
  AD: profielVoorEI(EI_kNm2.AD),
  DC: profielVoorEI(EI_kNm2.DC),
  DB: profielVoorEI(EI_kNm2.DB),
};

log("Fictieve doorsneden (stijfheidsstaven) — controle op de gerealiseerde EI:");
for (const [naam, prof] of Object.entries(PROFIEL)) {
  const sec = resolveSection(MATERIAAL, prof);
  const EI_gerealiseerd = (sec.E * sec.I) / 1e9;   // N·mm² → kNm²
  const rel = (EI_gerealiseerd - EI_kNm2[naam]) / EI_kNm2[naam];
  const rAxiaal = sec.A / sec.I * (naam === "DB" ? (a_m * Math.SQRT2 * 1000) ** 2 : (a_m * 1000) ** 2);
  controle(`EI ${naam} (${prof})`, EI_gerealiseerd, EI_kNm2[naam], "kNm²", Math.abs(EI_kNm2[naam]) * 1e-9);
  log(`      A = ${sec.A.toExponential(4)} mm² · I = ${sec.I.toExponential(4)} mm⁴ · A·L²/I = ${rAxiaal.toExponential(2)}`);
}

// ── Modelbouw ──────────────────────────────────────────────────────────────
// Eenheden van het UI-model: mm voor geometrie, kN/m (= N/mm) voor lijnlasten,
// z positief omhoog.
const KNOPEN = [
  { id: 1, x: 0,    z: 0     },   // A — volledig ingeklemd
  { id: 2, x: 4000, z: 0     },   // D — momentvaste knoop van de drie staven
  { id: 3, x: 8000, z: 0     },   // C — verticale steun, horizontaal vrij
  { id: 4, x: 0,    z: -4000 },   // B — situatie 1 scharnier / situatie 2 rol
];

const STAVEN = [
  { id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL.AD },  // A → D
  { id: 2, from: 2, to: 3, material: MATERIAAL, profile: PROFIEL.DC },  // D → C
  { id: 3, from: 2, to: 4, material: MATERIAAL, profile: PROFIEL.DB },  // D → B
];

// C is in beide situaties een oplegging die de VERTICALE verplaatsing
// tegenhoudt en horizontaal vrij is (in de app: zRoller). Dat is de enige
// lezing waarmee situatie 1 "niet-verplaatsbare knopen" heeft: met een
// horizontaal-vaste/verticaal-vrije rol zou C vrij kunnen zakken en zou DC
// een uitkraging worden (M in D zou dan qL²/2 = 9120 kNm moeten verdelen).
const OPLEGGINGEN = {
  1: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "zRoller" }, { nodeId: 4, type: "pinned"  }],
  2: [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "zRoller" }, { nodeId: 4, type: "zRoller" }],
};

const BELASTINGGEVALLEN = [{ id: 1, name: "LG1 — q op DC", type: "other" }];
const LASTEN = [{ id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -q_kNm }];

function maakModel(situatie, { staven = STAVEN } = {}) {
  return {
    nodes: KNOPEN,
    beams: staven,
    supports: OPLEGGINGEN[situatie],
    plates: [],
    loadCases: BELASTINGGEVALLEN,
    loads: LASTEN,
    activeLoadCaseId: 1,
    selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
    nonlinearEnabled: false,    // eerste orde
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
}

function reken(model) {
  const r = solveAllCases(bouwMultiInput(model)).perCase.get(1);
  if (!r) throw new Error("solver gaf geen resultaat voor belastinggeval 1");
  return r;
}

/**
 * Staafeindmomenten in de conventie van de bron (moment van de staaf op de
 * knoop, tegen de klok in positief), afgeleid uit de sagging-positieve
 * solveruitvoer. `eind` is "start" of "end" en zegt aan wélke kant van de
 * staaf de knoop zit.
 */
function bronMoment(res, beamId, eind) {
  const e = res.elements.get(beamId);
  return eind === "start" ? e.M_start / 1e6 : -e.M_end / 1e6;
}

// ── Modellen opslaan als projectbestand ────────────────────────────────────
mkdirSync(HIER, { recursive: true });
const bestanden = {};
for (const situatie of [1, 2]) {
  const m = maakModel(situatie);
  const tekst = serializeProject({
    nodes: m.nodes, beams: m.beams, supports: m.supports, plates: m.plates,
    loads: m.loads, loadCases: m.loadCases, activeLoadCaseId: m.activeLoadCaseId,
    selfWeightEnabled: m.selfWeightEnabled, nonlinearEnabled: m.nonlinearEnabled,
    scheefstandEnabled: m.scheefstandEnabled, scheefstandNoemer: m.scheefstandNoemer,
    scheefstandRichting: m.scheefstandRichting,
  });
  const naam = situatie === 1 ? "R10a" : "R10b";
  // .femp zoals in de campagne-afspraak; .ifcfem2d is de extensie die de
  // bestandsdialoog van de app filtert — zelfde inhoud.
  writeFileSync(join(HIER, `${naam}.femp`), tekst, "utf8");
  writeFileSync(join(HIER, `${naam}.ifcfem2d`), tekst, "utf8");
  bestanden[situatie] = join(HIER, `${naam}.femp`);
  log(`\nModel opgeslagen: ${bestanden[situatie]} (+ .ifcfem2d)`);
}

// ── [A] Situatie 1 — drievoudig statisch onbepaald, knopen niet verplaatsbaar ─
log("\n[A] Situatie 1 — B scharnieroplegging (niet-verplaatsbare knopen)");
const r1 = reken(maakModel(1));
const M1_s1 = bronMoment(r1, 1, "end");     // staafeind AD bij D  (D = eind van staaf 1)
const M2_s1 = bronMoment(r1, 3, "start");   // staafeind DB bij D  (D = start van staaf 3)
const M3_s1 = bronMoment(r1, 2, "start");   // staafeind DC bij D  (D = start van staaf 2)
const M4_s1 = bronMoment(r1, 1, "start");   // inklemmingsmoment in A

// Referentiewaarden zijn gesloten formules in q en a — hier exact uitgerekend,
// niet overgetypt: q·a²/20, 3q·a²/160, −11q·a²/160, q·a²/40.
const qa2 = q_kNm * a_m * a_m;              // 18 240 kNm
vergelijk(1, "M1 — staafeind AD bij D",  M1_s1,  qa2 / 20,        "kNm");
vergelijk(1, "M2 — staafeind DB bij D",  M2_s1,  3 * qa2 / 160,   "kNm");
vergelijk(1, "M3 — staafeind DC bij D",  M3_s1, -11 * qa2 / 160,  "kNm");
vergelijk(1, "M4 — inklemming in A",     M4_s1,  qa2 / 40,        "kNm");
// Dossierrij "Controle knoopevenwicht M1+M2+M3 = 0" — referentie is exact 0,
// dus als absolute controle (een procentuele afwijking t.o.v. 0 bestaat niet).
controle("Knoopevenwicht D: M1+M2+M3", M1_s1 + M2_s1 + M3_s1, 0, "kNm", 1e-6);

log("\n    Eigen kruiscontroles situatie 1 (geen bronwaarden)");
{
  const RA = r1.reactions.get(1), RB = r1.reactions.get(4), RC = r1.reactions.get(3);
  const W = q_kNm * a_m;                    // 4560 kN totale belasting
  controle("ΣFz-reacties = totale belasting", (RA.fz + RB.fz + RC.fz) / 1000, W, "kN", 1e-3);
  controle("ΣFx-reacties = 0", (RA.fx + RB.fx + RC.fx) / 1000, 0, "kN", 1e-3);
  // Momentevenwicht om A (x naar rechts, z omhoog, moment tegen de klok in +):
  //   ΣM_A = my_A + Σ(x_i·Fz_i − z_i·Fx_i) − last·arm
  const MA = RA.my / 1e6
    + (8 * RC.fz - 0 * RC.fx) / 1e6 * 1000
    + (0 * RB.fz - (-4) * RB.fx) / 1e6 * 1000
    - W * 6.0;                              // zwaartepunt van q op x = 6,0 m
  controle("ΣM om A = 0", MA, 0, "kNm", 1e-3);
  controle("M = 0 in C (roloplegging)",  r1.elements.get(2).M_end / 1e6, 0, "kNm", 1e-6);
  controle("M = 0 in B (scharnier)",     r1.elements.get(3).M_end / 1e6, 0, "kNm", 1e-6);
  controle("uz(D) ≈ 0 (onverplaatsbaar)", r1.displacements.get(2).uz, 0, "mm", 0.01);
  controle("ux(D) ≈ 0 (onverplaatsbaar)", r1.displacements.get(2).ux, 0, "mm", 0.01);
}

// ── [B] Situatie 2 — B horizontaal vrij, mechanisme ────────────────────────
log("\n[B] Situatie 2 — B horizontaal vrij (verplaatsbare knopen)");
const r2 = reken(maakModel(2));
const M1_s2 = bronMoment(r2, 1, "end");
const M2_s2 = bronMoment(r2, 3, "start");
const M3_s2 = bronMoment(r2, 2, "start");
const M4_s2 = bronMoment(r2, 1, "start");
vergelijk(2, "M1 — staafeind AD bij D", M1_s2, -2480, "kNm");
vergelijk(2, "M2 — staafeind DB bij D", M2_s2,  -400, "kNm");
vergelijk(2, "M3 — staafeind DC bij D", M3_s2,  2880, "kNm");
vergelijk(2, "M4 — inklemming in A",    M4_s2, -3360, "kNm");
controle("Knoopevenwicht D: M1+M2+M3", M1_s2 + M2_s2 + M3_s2, 0, "kNm", 1e-6);

// Mechanisme. De bron geeft alleen de GROOTTE van de horizontale verplaatsing
// van B en van de mechanismerotatie; onze uitkomst zegt er ook de richting bij
// (B loopt naar links, D zakt) — die wordt hieronder apart afgedrukt.
const uB_m = r2.displacements.get(4).ux / 1000;     // m
const uzD_m = r2.displacements.get(2).uz / 1000;    // m
const theta = Math.abs(uB_m) / a_m;                 // rad, chordrotatie δ/a
vergelijk(2, "Mechanismerotatie theta", theta, 0.009422, "rad");
vergelijk(2, "Horizontale verplaatsing B (grootte)", Math.abs(uB_m), 0.0377, "m");

log("\n    Eigen kruiscontroles situatie 2 (geen bronwaarden)");
{
  const RA = r2.reactions.get(1), RB = r2.reactions.get(4), RC = r2.reactions.get(3);
  const W = q_kNm * a_m;
  controle("ΣFz-reacties = totale belasting", (RA.fz + RB.fz + RC.fz) / 1000, W, "kN", 1e-3);
  controle("ΣFx-reacties = 0", (RA.fx + RB.fx + RC.fx) / 1000, 0, "kN", 1e-3);
  controle("M = 0 in C (roloplegging)", r2.elements.get(2).M_end / 1e6, 0, "kNm", 1e-6);
  controle("M = 0 in B (roloplegging)", r2.elements.get(3).M_end / 1e6, 0, "kNm", 1e-6);
  // Kinematica van het mechanisme: DB is onrekbaar en B ligt 45° linksonder D,
  // dus |ux(B)| moet gelijk zijn aan |uz(D)|, en beide chordrotaties aan θ.
  controle("|ux(B)| = |uz(D)| (onrekbare staaf DB)", Math.abs(uB_m), Math.abs(uzD_m), "m", 1e-5);
  controle("chordrotatie AD = theta", Math.abs(uzD_m) / a_m, theta, "rad", 1e-6);
  log(`    richting: ux(B) = ${(uB_m * 1000).toFixed(4)} mm (naar links), ` +
      `uz(D) = ${(uzD_m * 1000).toFixed(4)} mm (omlaag)`);
  log(`    reacties: A fz=${(RA.fz / 1000).toFixed(2)} kN my=${(RA.my / 1e6).toFixed(2)} kNm · ` +
      `B fz=${(RB.fz / 1000).toFixed(2)} kN · C fz=${(RC.fz / 1000).toFixed(2)} kN`);
}

// ── [C] Terugleespad: het OPGESLAGEN bestand geeft dezelfde uitkomsten ─────
log("\n[C] Opgeslagen .femp opnieuw inlezen en doorrekenen (bestandspad)");
for (const situatie of [1, 2]) {
  const p = deserializeProject(readFileSync(bestanden[situatie], "utf8"));
  const r = reken({
    nodes: p.nodes, beams: p.beams, supports: p.supports, plates: p.plates,
    loadCases: p.loadCases, loads: p.loads,
    selfWeightEnabled: p.selfWeightEnabled,
    scheefstandEnabled: p.scheefstandEnabled ?? false,
    scheefstandNoemer: p.scheefstandNoemer ?? 200,
    scheefstandRichting: p.scheefstandRichting ?? 1,
  });
  const bron = situatie === 1 ? r1 : r2;
  for (const [naam, id, eind] of [["M1", 1, "end"], ["M2", 3, "start"], ["M3", 2, "start"], ["M4", 1, "start"]]) {
    controle(`sit.${situatie} ${naam} uit bestand`, bronMoment(r, id, eind), bronMoment(bron, id, eind), "kNm", 1e-6);
  }
}

// ── [D] Staaf DB omgekeerd gedefinieerd (B → D) ────────────────────────────
log("\n[D] Variant: staaf DB als B→D ingevoerd — mapping mag niet oriëntatie-afhankelijk zijn");
{
  const staven = [
    STAVEN[0], STAVEN[1],
    { id: 3, from: 4, to: 2, material: MATERIAAL, profile: PROFIEL.DB },  // B → D
  ];
  for (const situatie of [1, 2]) {
    const r = reken(maakModel(situatie, { staven }));
    // D is nu de EINDknoop van staaf 3 ⇒ M_bron = −M_end.
    const M2 = bronMoment(r, 3, "end");
    const ref = situatie === 1 ? M2_s1 : M2_s2;
    controle(`sit.${situatie} M2 met omgekeerde staaf`, M2, ref, "kNm", 1e-6);
  }
}

// ── [E] Gevoeligheid voor de EA-aanname ────────────────────────────────────
// Zelfde EI, maar een normaal ogende doorsnedehoogte. Dit is GEEN vergelijking
// met de bron maar een meting van hoe hard de aanname "normaalkracht-
// vervorming verwaarloosd" in dit geval doorwerkt.
log("\n[E] Gevoeligheid: dezelfde EI met toenemende doorsnedehoogte h (= afnemende EA)");
log("      h [mm]      A·L²/I      M1 sit.1   Δ%      M4 sit.1   Δ%      M4 sit.2   Δ%");
for (const h of [5, 30, 120, 300, 900]) {
  const prof = (EI) => {
    const I = (EI * 1e9) / E_MAT;
    return `${((12 * I) / h ** 3).toFixed(4)}x${h}`;
  };
  const staven = [
    { id: 1, from: 1, to: 2, material: MATERIAAL, profile: prof(EI_kNm2.AD) },
    { id: 2, from: 2, to: 3, material: MATERIAAL, profile: prof(EI_kNm2.DC) },
    { id: 3, from: 2, to: 4, material: MATERIAAL, profile: prof(EI_kNm2.DB) },
  ];
  const a1 = reken(maakModel(1, { staven }));
  const a2 = reken(maakModel(2, { staven }));
  const m1 = bronMoment(a1, 1, "end"), m4 = bronMoment(a1, 1, "start");
  const m4b = bronMoment(a2, 1, "start");
  const rAx = 12 * (4000 ** 2) / (h * h);
  log(`    ${String(h).padStart(6)}  ${rAx.toExponential(2).padStart(10)}  ` +
      `${m1.toFixed(1).padStart(9)} ${((m1 - 912) / 912 * 100).toFixed(2).padStart(7)}  ` +
      `${m4.toFixed(1).padStart(9)} ${((m4 - 456) / 456 * 100).toFixed(2).padStart(7)}  ` +
      `${m4b.toFixed(1).padStart(9)} ${((m4b + 3360) / 3360 * 100).toFixed(2).padStart(7)}`);
}
log("    → situatie 1 is zeer gevoelig voor de EA-aanname, situatie 2 nauwelijks:");
log("      in situatie 2 wordt het antwoord door het mechanisme (buiging) bepaald.");

// ── [F] De oplegging-interpretatie hard maken ──────────────────────────────
// De dossiertermen zijn dubbelzinnig: "verticale roloplegging" (C) en
// "horizontale roloplegging (horizontaal vrij)" (B) kunnen elk twee kanten op
// gelezen worden. Hieronder de drie alternatieve lezingen, doorgerekend, zodat
// de gekozen lezing niet op een aanname maar op de uitkomst berust.
log("\n[F] Alternatieve lezingen van de opleggingen (alleen de gekozen lezing haalt de bron)");
{
  const varianten = [
    ["gekozen  — C z-rol, B scharnier / B z-rol", OPLEGGINGEN[1], OPLEGGINGEN[2]],
    ["alt. C   — C x-rol (verticaal vrij): DC wordt uitkraging",
      [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "xRoller" }, { nodeId: 4, type: "pinned" }],
      [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "xRoller" }, { nodeId: 4, type: "zRoller" }]],
    ["alt. B   — B x-rol in situatie 2 (verticaal vrij)", OPLEGGINGEN[1],
      [{ nodeId: 1, type: "fixed" }, { nodeId: 3, type: "zRoller" }, { nodeId: 4, type: "xRoller" }]],
  ];
  log("      lezing                                                 M4 sit.1   (ref 456)   M4 sit.2  (ref −3360)");
  for (const [naam, sup1, sup2] of varianten) {
    const m1 = maakModel(1); m1.supports = sup1;
    const m2 = maakModel(2); m2.supports = sup2;
    const a = bronMoment(reken(m1), 1, "start");
    const b = bronMoment(reken(m2), 1, "start");
    log(`    ${naam.padEnd(52)} ${a.toFixed(1).padStart(10)}  ${b.toFixed(1).padStart(12)}`);
  }
  log("    → alleen de eerste regel reproduceert de bron; C moet dus verticaal steunen en");
  log("      B in situatie 2 horizontaal vrij zijn — precies wat '(horizontaal vrij)' zegt.");
}

// ── Samenvattende tabel ────────────────────────────────────────────────────
log("\n─── Vergelijking met de referentie ───────────────────────────────────");
log("  sit.  grootheid                                 referentie      onze waarde      afwijking");
for (const a of afwijkingen) {
  log(`   ${a.situatie}    ${a.naam.padEnd(38)} ${String(Number(a.referentie.toFixed(6))).padStart(10)} ${a.eenheid.padEnd(4)} ` +
      `${a.onze.toFixed(6).padStart(13)} ${a.eenheid.padEnd(4)} ${(a.pct >= 0 ? "+" : "") + a.pct.toFixed(3)} %`);
}
const grootste = afwijkingen.reduce((m, a) => Math.max(m, Math.abs(a.pct)), 0);
log(`\n  Grootste afwijking: ${grootste.toFixed(4)} %`);

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
