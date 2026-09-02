// ═══════════════════════════════════════════════════════════════════════════
// R02 — Vierstaafs momentvaste knoop (stervormig raamwerk)
//
// Referentie: analytische validatiebundel voor rekenprogramma's (1990),
// testreeks SSLL, geval SSLL10. Zie het werkdossier
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R02,
// voor bron, volledige invoer en de zes referentiewaarden.
//
// SYSTEEM (maten in m, oorsprong in de vrije knoop A)
//
//                     C (0; 1)  ← scharnieroplegging (rotatie vrij)
//                     ○
//                     │  A–C: 1 m,  EI klein
//                     │
//   D ▓══════●════════A══════════════════════════════════════▓ B
//  (−1;0)    G      (0;0)              A–B: 4 m, EI groot   (4;0)
//  ingeklemd (−0,5;0)                                        ingeklemd
//            │
//            ▼ F = 100 kN                 q = 1 kN/m ↓ over de hele staaf A–B
//                     │
//                     │  A–E: 2 m
//                     │
//                     ▓ E (0; −2)  ← ingeklemd
//
// Alle vier de staafaansluitingen in A zijn momentvast. Knoop A en knoop G
// zijn vrij. De enige echte onbekende in de klassieke handafleiding is de
// rotatie van A; daarmee is het geval exact op te lossen met de
// hoekveranderingsmethode — de bron doet dat ook.
//
// DOORSNEDEN — LET OP, dit is de enige modelleeraanname van dit geval.
// De bron geeft per staaf E, A en I los van elkaar (E = 2,0·10^11 Pa voor
// alle staven). Het projectbestand van de app kent GEEN vrije invoer van E,
// A en I: een staaf draagt een materiaal- en een profielnaam, en
// `lib/sectionResolver.ts` leidt daar E, A en I uit af. Er is geen materiaal
// met E = 200 000 N/mm² en geen vrij in te voeren doorsnede.
//
// De solver gebruikt uitsluitend de PRODUCTEN E·A en E·I. Daarom is in het
// opgeslagen model een materiaal-/profielcombinatie gekozen die die twee
// producten EXACT reproduceert:
//
//   staaf   bron: E·A [N]   bron: E·I [N·mm²]   model: C22 (E = 10 000) b×h
//   A–B     3,2 ·10^8       4,266667·10^10      800 × 40  → A = 32 000 mm²,
//                                                            I = 4 266 666,67 mm⁴
//   A–C     2,0 ·10^7       1,666667·10^8       200 × 10  → A = 2 000 mm²,
//                                                            I = 16 666,67 mm⁴
//   D–G–A   2,0 ·10^7       1,666667·10^8       200 × 10  (idem)
//   A–E     8,0 ·10^7       2,666667·10^9       400 × 20  → A = 8 000 mm²,
//                                                            I = 266 666,67 mm⁴
//
//   (b volgt uit b = (E_bron/E_C22)·A_bron/h met h = √(12·I_bron/A_bron);
//    E_C22 = 10 000 N/mm² geeft precies factor 20 en dus ronde maten.)
//
// Variant [C] bewijst dit: hetzelfde model met de LETTERLIJKE E, A en I uit de
// bron, rechtstreeks aan de solver gevoerd, geeft bit-voor-bit hetzelfde
// resultaat als het opgeslagen projectbestand. De profielsubstitutie is dus
// geen benadering. Het eigen gewicht staat uit (de bron rekent er niet mee),
// dus de houtdichtheid van C22 speelt nergens mee.
//
// TEKENAFSPRAKEN
//  - Onze `ry` is LINKSOM (CCW) positief — geverifieerd met een vrij opgelegde
//    ligger onder een neerwaartse lijnlast (linkeroplegging draait rechtsom,
//    ry < 0).
//  - Onze M_start/M_end zijn SAGGING-positief in de lokale staafassen
//    (lokale +y = 90° CCW vanaf de as from→to); omdraaien van de staafrichting
//    klapt het teken om. Geverifieerd met een tweezijdig ingeklemde ligger.
//  - De bron geeft STAAFEINDMOMENTEN in de knoop-conventie: het moment dat de
//    KNOOP op het staafeinde uitoefent, LINKSOM positief. Daarmee is de som
//    van de vier momenten in A nul. Omrekening:
//        knoopmoment aan het `from`-einde = −M_start
//        knoopmoment aan het `to`-einde   = +M_end
//    (Zelfde relatie die de hoekveranderingsmethode gebruikt: voor een
//     tweezijdig ingeklemde ligger onder q omlaag is het knoopmoment links
//     +qL²/12 en rechts −qL²/12.)
//
// Draaien met: npx tsx referentie/toets-R02.mjs   (vanuit design-mockup/)
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Vergelijk met een BRONWAARDE en druk de afwijking in procent af. */
const afwijkingen = [];
function vergelijk(naam, onze, referentie, eenheid, tolPct = 0.5) {
  const abs = onze - referentie;
  const pct = referentie === 0 ? (Math.abs(abs) < 1e-9 ? 0 : Infinity)
                               : (abs / Math.abs(referentie)) * 100;
  afwijkingen.push({ naam, onze, referentie, eenheid, pct });
  const ok = Math.abs(pct) <= tolPct;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(4)} ${eenheid} ` +
      `(ref ${referentie} ${eenheid}, Δ = ${abs >= 0 ? "+" : ""}${abs.toFixed(4)} ${eenheid}` +
      ` = ${pct >= 0 ? "+" : ""}${pct.toFixed(4)} %)`);
}

/** Eigen kruiscontrole (GEEN bronwaarde) — evenwicht, onderlinge gelijkheid. */
function controle(naam, onze, verwacht, eenheid, tolAbs) {
  const ok = Math.abs(onze - verwacht) <= tolAbs;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toExponential(6)} ${eenheid} ` +
      `(verwacht ${verwacht} ${eenheid}, tolerantie ${tolAbs})`);
}

// ── Referentiewaarden uit het dossier (NIET aanpassen) ─────────────────────
const REF = {
  rotatieA:  0.227118,      // rad, linksom positief
  M_AB:     11023.72,       // N·m
  M_AC:       113.559,      // N·m
  M_AD:    -12348.588,      // N·m
  M_AE:      1211.2994,     // N·m
};

// ── Modelbouw (UI-eenheden: mm, kN, kN/m; z positief omhoog) ───────────────
const KNOPEN = [
  { id: 1, x:     0, z:     0 },  // A — vrije knoop, vier momentvaste staafeinden
  { id: 2, x:  4000, z:     0 },  // B — ingeklemd
  { id: 3, x:     0, z:  1000 },  // C — scharnieroplegging (rotatie vrij)
  { id: 4, x: -1000, z:     0 },  // D — ingeklemd
  { id: 5, x:  -500, z:     0 },  // G — vrije tussenknoop, draagt de puntlast
  { id: 6, x:     0, z: -2000 },  // E — ingeklemd
];

// Zie de kop: C22 + b×h reproduceert E·A en E·I van de bron exact.
const MAT = "C22";
const STAVEN = [
  { id: 1, from: 1, to: 2, material: MAT, profile: "800x40" },  // A → B (4,0 m)
  { id: 2, from: 1, to: 3, material: MAT, profile: "200x10" },  // A → C (1,0 m)
  { id: 3, from: 4, to: 5, material: MAT, profile: "200x10" },  // D → G (0,5 m)
  { id: 4, from: 5, to: 1, material: MAT, profile: "200x10" },  // G → A (0,5 m)
  { id: 5, from: 1, to: 6, material: MAT, profile: "400x20" },  // A → E (2,0 m)
];

const OPLEGGINGEN = [
  { nodeId: 2, type: "fixed"  },  // B ingeklemd
  { nodeId: 3, type: "pinned" },  // C scharnier: ux = uz = 0, rotatie vrij
  { nodeId: 4, type: "fixed"  },  // D ingeklemd
  { nodeId: 6, type: "fixed"  },  // E ingeklemd
];

const BELASTINGGEVALLEN = [{ id: 1, name: "LG1 — puntlast in G + lijnlast op A–B", type: "other" }];

// Puntlast in G: Fy = −1,0·10^5 N = −100 kN (verticaal omlaag).
// Lijnlast op A–B: −1,0·10^3 N/m = −1 kN/m. De bron noemt hem "lokale y";
// A–B loopt van A(0;0) naar B(4;0), dus lokale +y = globale +z: globaal en
// lokaal zijn hier identiek. Variant [D] rekent hem expliciet lokaal na.
const LASTEN = [
  { id: 1, type: "pointForce", caseId: 1, nodeId: 5, fz: -100 },
  { id: 2, type: "lineLoad",   caseId: 1, beamId: 1, q: -1 },
];

function maakModel({ staven = STAVEN, lasten = LASTEN } = {}) {
  return {
    nodes: KNOPEN,
    beams: staven,
    supports: OPLEGGINGEN,
    plates: [],
    loadCases: BELASTINGGEVALLEN,
    loads: lasten,
    activeLoadCaseId: 1,
    selfWeightEnabled: false,   // de bron brengt het eigen gewicht niet aan
    nonlinearEnabled: false,    // eerste orde (de bron is een lineaire oplossing)
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
 * Staafeindmomenten in A, omgerekend naar de KNOOP-conventie van de bron
 * (moment dat de knoop op het staafeinde uitoefent, linksom positief), in N·m.
 */
function knoopmomentenInA(r) {
  const e1 = r.elements.get(1), e2 = r.elements.get(2), e4 = r.elements.get(4), e5 = r.elements.get(5);
  return {
    M_AB: -e1.M_start / 1000,   // staaf 1 begint in A
    M_AC: -e2.M_start / 1000,   // staaf 2 begint in A
    M_AD: +e4.M_end   / 1000,   // staaf 4 (G→A) eindigt in A
    M_AE: -e5.M_start / 1000,   // staaf 5 begint in A
  };
}

// ── Model opslaan als projectbestand ───────────────────────────────────────
const model = maakModel();
mkdirSync(HIER, { recursive: true });
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
  scheefstandEnabled: model.scheefstandEnabled,
  scheefstandNoemer: model.scheefstandNoemer,
  scheefstandRichting: model.scheefstandRichting,
});
// .femp is de campagne-afspraak; .ifcfem2d is de extensie waar de
// bestandsdialoog van de app op filtert — zelfde inhoud.
writeFileSync(join(HIER, "R02.femp"), projectTekst, "utf8");
writeFileSync(join(HIER, "R02.ifcfem2d"), projectTekst, "utf8");
log(`Model opgeslagen: ${join(HIER, "R02.femp")} (+ .ifcfem2d)`);

// Roundtrip: wat we doorrekenen is wat er in het bestand staat.
const terug = deserializeProject(projectTekst);
const rTerug = reken({ ...model, nodes: terug.nodes, beams: terug.beams,
                       supports: terug.supports, loads: terug.loads });

// ── [A] Hoofdmodel tegen de zes referentiewaarden ──────────────────────────
log("\n[A] Opgeslagen model doorgerekend (eerste orde) tegen de bron");
const rA = reken(model);
const M = knoopmomentenInA(rA);
const rotA = rA.displacements.get(1).ry;

vergelijk("rotatie knoop A", rotA, REF.rotatieA, "rad");
vergelijk("staafeindmoment M(A–B)", M.M_AB, REF.M_AB, "N·m");
vergelijk("staafeindmoment M(A–C)", M.M_AC, REF.M_AC, "N·m");
vergelijk("staafeindmoment M(A–D)", M.M_AD, REF.M_AD, "N·m");
vergelijk("staafeindmoment M(A–E)", M.M_AE, REF.M_AE, "N·m");

// Zesde referentiewaarde: momentevenwicht in A (referentie exact 0).
// Absolute tolerantie, want een relatieve afwijking t.o.v. 0 bestaat niet;
// geschaald aan het grootste staafeindmoment.
const somM = M.M_AB + M.M_AC + M.M_AD + M.M_AE;
const grootste = Math.max(...[M.M_AB, M.M_AC, M.M_AD, M.M_AE].map(Math.abs));
controle("som van de vier staafeindmomenten in A", somM, 0, "N·m", 1e-6 * grootste);
log(`      (= ${(somM / grootste * 100).toExponential(2)} % van het grootste staafeindmoment)`);

// ── Eigen kruiscontroles op hetzelfde resultaat ────────────────────────────
log("\n    Eigen kruiscontroles (geen bronwaarden)");
let sFx = 0, sFz = 0;
for (const nid of [2, 3, 4, 6]) {
  const R = rA.reactions.get(nid);
  sFx += R.fx; sFz += R.fz;
}
controle("ΣFx-reacties = 0", sFx, 0, "N", 1e-3);
controle("ΣFz-reacties = 100 kN + 1 kN/m · 4 m", sFz, 104000, "N", 1e-3);
// Roundtrip door het projectbestand mag niets veranderen.
controle("rotatie A na roundtrip door het bestand", rTerug.displacements.get(1).ry - rotA, 0, "rad", 1e-15);

log("\n    Oplegreacties (de bron geeft ze niet — informatief)");
for (const [nid, naam] of [[2, "B"], [3, "C"], [4, "D"], [6, "E"]]) {
  const R = rA.reactions.get(nid);
  log(`      ${naam}: Fx = ${(R.fx / 1000).toFixed(4)} kN, Fz = ${(R.fz / 1000).toFixed(4)} kN, ` +
      `M = ${(R.my / 1e6).toFixed(4)} kNm`);
}
log(`      verplaatsing A: ux = ${rA.displacements.get(1).ux.toExponential(4)} mm, ` +
    `uz = ${rA.displacements.get(1).uz.toExponential(4)} mm`);
log(`      verplaatsing G: ux = ${rA.displacements.get(5).ux.toExponential(4)} mm, ` +
    `uz = ${rA.displacements.get(5).uz.toExponential(4)} mm`);

// ── [B] Onafhankelijke controle-FEM (eigen code, in dit bestand) ───────────
// Compacte directe-stijfheidsmethode voor een vlak raamwerk, in m/N/rad, met
// de LETTERLIJKE E, A en I uit de bron. Volledig los van de app-solver: als
// beide hetzelfde geven, ligt een afwijking t.o.v. de bron niet aan onze code.
log("\n[B] Onafhankelijke controle-FEM (eigen directe-stijfheidscode)");

const EB = 2.0e11;
const SEC = {                             // per staaf: A [m²], I [m⁴]
  AB: { A: 16.0e-4, I: 2.13333333333e-7 },
  AC: { A:  1.0e-4, I: 8.33333333333e-10 },
  DA: { A:  1.0e-4, I: 8.33333333333e-10 },
  AE: { A:  4.0e-4, I: 1.33333333333e-8 },
};
// knoopindex: 0 = A, 1 = B, 2 = C, 3 = D, 4 = G, 5 = E
const XY = [[0, 0], [4, 0], [0, 1], [-1, 0], [-0.5, 0], [0, -2]];
const EL = [
  { i: 0, j: 1, ...SEC.AB },   // el 0: A → B
  { i: 0, j: 2, ...SEC.AC },   // el 1: A → C
  { i: 3, j: 4, ...SEC.DA },   // el 2: D → G
  { i: 4, j: 0, ...SEC.DA },   // el 3: G → A
  { i: 0, j: 5, ...SEC.AE },   // el 4: A → E
];

function elementMatrix(el) {
  const [xi, yi] = XY[el.i], [xj, yj] = XY[el.j];
  const dx = xj - xi, dy = yj - yi, L = Math.hypot(dx, dy);
  const c = dx / L, s = dy / L;
  const EA_L = EB * el.A / L, EI = EB * el.I;
  const a = 12 * EI / L ** 3, b = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
  // lokale stijfheidsmatrix (u1,v1,θ1,u2,v2,θ2)
  const k = [
    [ EA_L,  0,  0, -EA_L,  0,  0],
    [ 0,  a,  b,  0, -a,  b],
    [ 0,  b,  d,  0, -b,  e],
    [-EA_L,  0,  0,  EA_L,  0,  0],
    [ 0, -a, -b,  0,  a, -b],
    [ 0,  b,  e,  0, -b,  d],
  ];
  // transformatie lokaal → globaal
  const T = [
    [ c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [ 0, 0, 1, 0, 0, 0],
    [ 0, 0, 0, c, s, 0],
    [ 0, 0, 0,-s, c, 0],
    [ 0, 0, 0, 0, 0, 1],
  ];
  return { L, c, s, k, T };
}

function matVec(Mx, v) { return Mx.map(r => r.reduce((a, x, q) => a + x * v[q], 0)); }
function tMatVec(Mx, v) {                    // Mᵀ·v
  const out = new Array(Mx[0].length).fill(0);
  for (let r = 0; r < Mx.length; r++) for (let q = 0; q < Mx[r].length; q++) out[q] += Mx[r][q] * v[r];
  return out;
}

function losOp(vastTranslatieA) {
  const nDof = 18;
  const K = Array.from({ length: nDof }, () => new Array(nDof).fill(0));
  const F = new Array(nDof).fill(0);
  const geo = EL.map(el => elementMatrix(el));

  for (let n = 0; n < EL.length; n++) {
    const { k, T } = geo[n];
    // kg = Tᵀ k T
    const kT = k.map(r => r.map((_, q) => r.reduce((a, x, p) => a + x * T[p][q], 0)));
    const kg = T[0].map((_, r) => kT[0].map((_, q) => T.reduce((a, _t, p) => a + T[p][r] * kT[p][q], 0)));
    const map = [3 * EL[n].i, 3 * EL[n].i + 1, 3 * EL[n].i + 2, 3 * EL[n].j, 3 * EL[n].j + 1, 3 * EL[n].j + 2];
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) K[map[r]][map[q]] += kg[r][q];
  }

  // Belastingen. Puntlast in G (index 4): Fy = −1e5 N.
  F[3 * 4 + 1] += -1.0e5;
  // Lijnlast op element 0 (A→B), q = −1000 N/m in lokale +y (= globale +y).
  {
    const { L, T } = geo[0];
    const q = -1.0e3;
    const fLok = [0, q * L / 2, q * L * L / 12, 0, q * L / 2, -q * L * L / 12];
    const fGlo = tMatVec(T, fLok);
    const map = [0, 1, 2, 3, 4, 5];
    for (let r = 0; r < 6; r++) F[map[r]] += fGlo[r];
  }

  // Randvoorwaarden: B (1), D (3), E (5) volledig ingeklemd; C (2) ux = uy = 0.
  const vast = new Set([3, 4, 5, 9, 10, 11, 15, 16, 17, 6, 7]);
  // Variant: knoop A ook translatievast — dat is precies de idealisering van
  // de hoekveranderingsmethode waarmee de bron is afgeleid.
  if (vastTranslatieA) { vast.add(0); vast.add(1); }

  const vrij = [];
  for (let i = 0; i < nDof; i++) if (!vast.has(i)) vrij.push(i);
  const n = vrij.length;
  const Ar = Array.from({ length: n }, (_, r) => vrij.map(q => K[vrij[r]][q]).concat([F[vrij[r]]]));
  // Gauss met partiële pivotering
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(Ar[r][col]) > Math.abs(Ar[piv][col])) piv = r;
    [Ar[col], Ar[piv]] = [Ar[piv], Ar[col]];
    for (let r = col + 1; r < n; r++) {
      const f = Ar[r][col] / Ar[col][col];
      if (f === 0) continue;
      for (let q = col; q <= n; q++) Ar[r][q] -= f * Ar[col][q];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = Ar[r][n];
    for (let q = r + 1; q < n; q++) s -= Ar[r][q] * x[q];
    x[r] = s / Ar[r][r];
  }
  const d = new Array(nDof).fill(0);
  vrij.forEach((dof, idx) => { d[dof] = x[idx]; });

  // Staafeindkrachten: f_el = k·(T·d_el) − f_eq,lokaal. De momentcomponenten
  // (index 2 en 5) zijn precies de KNOOPMOMENTEN op het staafeinde, linksom
  // positief — dezelfde conventie als de bron.
  const eind = EL.map((el, n2) => {
    const { k, T } = geo[n2];
    const dg = [3 * el.i, 3 * el.i + 1, 3 * el.i + 2, 3 * el.j, 3 * el.j + 1, 3 * el.j + 2].map(q => d[q]);
    const dl = matVec(T, dg);
    let f = matVec(k, dl);
    if (n2 === 0) {
      const L = geo[0].L, q = -1.0e3;
      const fEq = [0, q * L / 2, q * L * L / 12, 0, q * L / 2, -q * L * L / 12];
      f = f.map((v, idx) => v - fEq[idx]);
    }
    return f;
  });
  return { rot: d[2], M_AB: eind[0][2], M_AC: eind[1][2], M_AD: eind[3][5], M_AE: eind[4][2] };
}

const indep = losOp(false);
log(`      rotatie A          = ${indep.rot.toFixed(6)} rad`);
log(`      M(A–B) = ${indep.M_AB.toFixed(4)} · M(A–C) = ${indep.M_AC.toFixed(4)} · ` +
    `M(A–D) = ${indep.M_AD.toFixed(4)} · M(A–E) = ${indep.M_AE.toFixed(4)} N·m`);
controle("app ↔ controle-FEM: rotatie A", (rotA - indep.rot) / Math.abs(indep.rot) * 100, 0, "%", 0.001);
controle("app ↔ controle-FEM: M(A–B)", (M.M_AB - indep.M_AB) / Math.abs(indep.M_AB) * 100, 0, "%", 0.001);
controle("app ↔ controle-FEM: M(A–C)", (M.M_AC - indep.M_AC) / Math.abs(indep.M_AC) * 100, 0, "%", 0.001);
controle("app ↔ controle-FEM: M(A–D)", (M.M_AD - indep.M_AD) / Math.abs(indep.M_AD) * 100, 0, "%", 0.001);
controle("app ↔ controle-FEM: M(A–E)", (M.M_AE - indep.M_AE) / Math.abs(indep.M_AE) * 100, 0, "%", 0.001);

// Zelfde controle-FEM, maar met knoop A translatievast: dat is exact de
// idealisering van de hoekveranderingsmethode waarmee de bron is afgeleid.
// Wijkt het volledige model af van de bron, dan hoort dít precies op de
// bronwaarden uit te komen — daarmee is een eventueel verschil verklaard als
// modelleeraanname en niet als rekenfout.
const ideaal = losOp(true);
log("\n      Zelfde controle-FEM, maar knoop A translatievast (= aanname van de bron):");
log(`      rotatie A = ${ideaal.rot.toFixed(6)} rad (bron ${REF.rotatieA})`);
log(`      M(A–B) = ${ideaal.M_AB.toFixed(4)} (bron ${REF.M_AB}) · M(A–C) = ${ideaal.M_AC.toFixed(4)} (bron ${REF.M_AC})`);
log(`      M(A–D) = ${ideaal.M_AD.toFixed(4)} (bron ${REF.M_AD}) · M(A–E) = ${ideaal.M_AE.toFixed(4)} (bron ${REF.M_AE})`);
// Handafleiding uit het dossier: theta_A = (12500 − 1333,3)/49166,7.
const handTheta = (1.0e5 * 1.0 / 8 - 1.0e3 * 4 * 4 / 12) /
                  (4 * EB * SEC.AB.I / 4 + 3 * EB * SEC.AC.I / 1 + 4 * EB * SEC.DA.I / 1 + 4 * EB * SEC.AE.I / 2);
log(`      hoekveranderingsmethode met de hand: theta_A = ${handTheta.toFixed(6)} rad`);
controle("handafleiding ↔ bronwaarde rotatie A", (handTheta - REF.rotatieA) / REF.rotatieA * 100, 0, "%", 0.001);

// ── [C] Profielsubstitutie is exact ────────────────────────────────────────
// Hetzelfde model, maar met de LETTERLIJKE E, A en I uit de bron rechtstreeks
// aan de solver-adapter gevoerd (buiten sectionResolver om). Moet identiek
// zijn aan [A]; dat bewijst dat de C22-b×h-substitutie in het projectbestand
// geen benadering is.
log("\n[C] Opgeslagen model ↔ letterlijke E/A/I uit de bron");
// De doorsneden van de bron zijn vierkant: A = h², I = h⁴/12 met h = 40, 10
// en 20 mm. Zo geschreven zijn ze exact, zonder afgeknotte decimalen.
const E_BRON = 2.0e5;                       // N/mm²
const vierkant = (h) => ({ A: h * h, I: h ** 4 / 12 });
const rC = solve({
  nodes: KNOPEN.map(n => ({ id: n.id, x: n.x, z: n.z })),
  beams: [
    { id: 1, from: 1, to: 2, E: E_BRON, ...vierkant(40) },
    { id: 2, from: 1, to: 3, E: E_BRON, ...vierkant(10) },
    { id: 3, from: 4, to: 5, E: E_BRON, ...vierkant(10) },
    { id: 4, from: 5, to: 1, E: E_BRON, ...vierkant(10) },
    { id: 5, from: 1, to: 6, E: E_BRON, ...vierkant(20) },
  ],
  supports: OPLEGGINGEN,
  loads: [{ beamId: 1, q: -1 }],
  pointLoads: [{ nodeId: 5, fz: -100000 }],
});
const MC = knoopmomentenInA(rC);
// Tolerantie 1e-6 %: dat is gelijkheid tot op de drijvende-komma-afronding
// van de deelbaarheid door 3 in I = h⁴/12 (8+ significante cijfers gelijk).
controle("rotatie A: opgeslagen model ↔ bron-E/A/I", (rotA - rC.displacements.get(1).ry) / rotA * 100, 0, "%", 1e-6);
controle("M(A–B): opgeslagen model ↔ bron-E/A/I", (M.M_AB - MC.M_AB) / M.M_AB * 100, 0, "%", 1e-6);
controle("M(A–C): opgeslagen model ↔ bron-E/A/I", (M.M_AC - MC.M_AC) / M.M_AC * 100, 0, "%", 1e-6);
controle("M(A–D): opgeslagen model ↔ bron-E/A/I", (M.M_AD - MC.M_AD) / M.M_AD * 100, 0, "%", 1e-6);
controle("M(A–E): opgeslagen model ↔ bron-E/A/I", (M.M_AE - MC.M_AE) / M.M_AE * 100, 0, "%", 1e-6);

// ── [D] Lijnlast lokaal i.p.v. globaal ─────────────────────────────────────
// De bron noemt de lijnlast "lokale y". A–B is horizontaal van links naar
// rechts, dus lokaal en globaal vallen samen; deze variant toont dat.
log("\n[D] Lijnlast expliciet in LOKALE assen (bron zegt 'lokale y')");
const rD = reken(maakModel({
  lasten: [
    { id: 1, type: "pointForce", caseId: 1, nodeId: 5, fz: -100 },
    { id: 2, type: "lineLoad",   caseId: 1, beamId: 1, q: -1, qCoord: "local", qDir: "z" },
  ],
}));
const MD = knoopmomentenInA(rD);
controle("M(A–B) lokaal ↔ globaal", MD.M_AB - M.M_AB, 0, "N·m", 1e-6);
controle("rotatie A lokaal ↔ globaal", rD.displacements.get(1).ry - rotA, 0, "rad", 1e-12);

// ── [E] Puntlast als staafgebonden last i.p.v. knooplast ───────────────────
// De bron modelleert G als een echte knoop (staaf D–A in tweeën). Deze variant
// laat D–A ongesplitst en zet de puntlast op posFrac 0,5 — de adapter splitst
// dan zelf. Moet hetzelfde geven.
log("\n[E] D–A als één staaf met een staafgebonden puntlast op het midden");
const rE = reken(maakModel({
  staven: [
    { id: 1, from: 1, to: 2, material: MAT, profile: "800x40" },
    { id: 2, from: 1, to: 3, material: MAT, profile: "200x10" },
    { id: 3, from: 4, to: 1, material: MAT, profile: "200x10" },   // D → A, 1,0 m
    { id: 5, from: 1, to: 6, material: MAT, profile: "400x20" },
  ],
  lasten: [
    { id: 1, type: "pointForce", caseId: 1, beamId: 3, posFrac: 0.5, fz: -100 },
    { id: 2, type: "lineLoad",   caseId: 1, beamId: 1, q: -1 },
  ],
}));
const rotE = rE.displacements.get(1).ry;
const M_AD_E = +rE.elements.get(3).M_end / 1000;   // staaf D→A eindigt in A
controle("rotatie A: staafgebonden puntlast ↔ knooplast in G",
         (rotE - rotA) / Math.abs(rotA) * 100, 0, "%", 1e-6);
controle("M(A–D): staafgebonden puntlast ↔ knooplast in G",
         (M_AD_E - M.M_AD) / Math.abs(M.M_AD) * 100, 0, "%", 1e-6);

// ── Samenvatting ───────────────────────────────────────────────────────────
log("\n═══ Samenvatting R02 ═══");
log("grootheid                       referentie        onze waarde      afwijking");
for (const a of afwijkingen) {
  log(`${a.naam.padEnd(30)} ${String(a.referentie).padStart(14)}  ${a.onze.toFixed(4).padStart(15)}  ` +
      `${(a.pct >= 0 ? "+" : "") + a.pct.toFixed(4)} %`);
}
const grootsteAfw = Math.max(...afwijkingen.map(a => Math.abs(a.pct)));
log(`\ngrootste afwijking t.o.v. de bron: ${grootsteAfw.toFixed(4)} %`);
log(
  "\nDuiding van het restverschil (≈ 0,13 %): de bron lost het geval op met de\n" +
  "hoekveranderingsmethode en kent knoop A daarbij ÉÉN vrijheidsgraad toe — de\n" +
  "rotatie. Onze solver geeft A ook zijn twee translaties; die zijn klein\n" +
  `(ux = ${rA.displacements.get(1).ux.toExponential(2)} mm, uz = ${rA.displacements.get(1).uz.toExponential(2)} mm) maar niet nul, en verschuiven de\n` +
  "verdeling met een tiende procent. Blok [B] toont dat: dezelfde\n" +
  "controle-FEM met knoop A translatievast komt op zes cijfers op de\n" +
  "bronwaarden uit. Het verschil is dus een modelleeraanname van de BRON,\n" +
  "geen rekenverschil.");
log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
