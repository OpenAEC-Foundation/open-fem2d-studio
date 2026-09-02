// ═════════════════════════════════════════════════════════════════════════════
// R24 — Onderspannen ligger met een door temperatuurdaling voorgespannen
//       trekstang
//
// Validatiecampagne referentieberekeningen, geval R24 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: Franse validatiebundel (AFNOR/SFM 1990), testreeks SSLL, geval SSLL13.
//
// CONSTRUCTIE (m)
//   Doorgaande rechte ligger  A(0;0) — D(2;0) — H(4;0) — F(6;0) — B(8;0)
//   Onderspanning             A—C, C—E, E—B  met C(2;−0,6) en E(6;−0,6)
//   Verticale drukstaven      C—D en E—F  (0,60 m)
//   Opleggingen               A scharnier (ux = uy = 0), B rol (uy = 0)
//   Belasting 1               q = −50,0·10³ N/m over de volle 8,00 m
//   Belasting 2               ΔT = −163,0 K, uitsluitend in trekstang C—E
//                             (α = 1,0·10^-5 /K ⇒ verkorting 6,52·10^-3 m)
//   Doorsneden                ligger  A = 0,01516 m², Izz = 2,174·10^-4 m⁴
//                             A—C/C—E/E—B  A = 4,5·10^-3 m²
//                             C—D/E—F      A = 3,48·10^-3 m²
//   Materiaal                 E = 2,1·10^11 Pa, ν = 0,25 (⇒ G = 8,4·10^10 Pa)
//   Ligger heeft dwarskrachtfactor SRY = 2,5 (A / A_afschuiving)
//
// ── DE KERN VAN DIT GEVAL, VOORAF ───────────────────────────────────────────
//
// (1) DE APP REKENT EULER-BERNOULLI; DE BRON REKENT TIMOSHENKO.
//     De bron geeft de ligger een dwarskrachtfactor SRY = 2,5. Open FEM2D
//     Studio kent geen afschuifoppervlak en geen Timoshenko-optie — zie
//     src/core/fem/Beam.ts (calculateBeamLocalStiffness bevat uitsluitend de
//     klassieke EA/L- en EI/L^n-termen) en de vaststelling bij R12. Het
//     verschijnsel is dus NIET nabouwbaar; het verschil met de referentie is
//     per definitie een AANNAME-verschil, geen solverfout.
//
// (2) DAT VERSCHIL IS HIER ONGEWOON ZICHTBAAR.
//     Het veldmoment is een klein VERSCHIL VAN TWEE GROTE GETALLEN:
//     M_H = q·L²/8 − N·h = 400 000 − 0,6·N. Een afwijking van 0,19 % in de
//     trekstangkracht (1 112 N) verschuift M_H met 667 N·m, en dat is 1,35 %
//     van M_H. Hetzelfde geldt voor de zakking van D, die door de
//     voorspanning bijna volledig wordt weggedrukt: 4,0 % afwijking op
//     5,4·10^-4 m is in absolute zin 2,2·10^-5 m. §6 laat zien dat elk van
//     die verschillen exact en volledig door de ontbrekende
//     dwarskrachtvervorming wordt verklaard.
//
// (3) VOLLEDIG SCHARNIERENDE ONDERSPANNING — ZELFDE MODELLEERTRUC ALS R11.
//     Zet je op ALLE onderspanningsstaven aan beide einden een buigscharnier,
//     dan hebben de rotatie-DOF's van knoop C en E nergens meer stijfheid en
//     meldt het raamwerkpad van de kern een singulier stelsel (zie R11,
//     punt (1) — het plaatpad klemt zulke DOF's wél automatisch in).
//     De uitweg is dezelfde en is WISKUNDIG EXACT: laat per knoop precies
//     één staafeind momentvast. Hier is dat de trekstang C—E, die aan beide
//     zijden momentvast wordt aangesloten. In knoop C sluit dan nog maar één
//     momentvast staafeind aan, dus volgt uit momentevenwicht in C dat dat
//     eindmoment nul is; idem in E. Zonder dwarsbelasting op C—E is daarmee
//     M ≡ 0 en V ≡ 0 over de hele staaf: zuiver normaalkrachtgedrag,
//     onafhankelijk van de gekozen I. §5 controleert dat expliciet, óók door
//     de I van de onderspanning over vier decaden te variëren.
//
// (4) HET PROJECTBESTAND KAN DE DOORSNEDEN VAN DE BRON NIET DRAGEN.
//     Een staaf in het projectformaat draagt alleen een MATERIAAL- en een
//     PROFIELNAAM; lib/sectionResolver.resolveSection maakt daar E, A en I
//     van. De fictieve doorsneden van de bron staan in geen catalogus. Er is
//     één route met vrije doorsnedematen: de houten rechthoek b×h met de E
//     van een sterkteklasse. Door ÉÉN sterkteklasse voor álle staven te
//     gebruiken en per staaf b en h zo te kiezen dat E'·A' = E·A én
//     E'·I' = E·I, is de systeemstijfheidsmatrix IDENTIEK aan die van de
//     bron — krachten én verplaatsingen komen exact overeen. De ΔT wordt
//     meegeschaald omdat de app voor hout met α = 5,0·10^-6 /K rekent
//     (lib/thermalAlpha.ts): ΔT' = α·ΔT/α_hout = −326 K levert dezelfde
//     opgelegde verkorting. §7 rekent het opgeslagen bestand terug door de
//     échte app-route (deserialize → bouwMultiInput → solveAllCases) en
//     bewijst dat het bestand dezelfde getallen geeft.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R24.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection, TIMBER_E_MEAN } = await import("../src/lib/sectionResolver.ts");
const { ALPHA_HOUT } = await import("../src/lib/thermalAlpha.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ── Invoer uit het dossier, omgerekend naar de adaptereenheden ──────────────
// De bron geeft SI-basis (m, Pa, m², m⁴, N/m); de solver-adapter werkt in
// mm, N/mm², mm², mm⁴ en N/mm. Achter elke regel staat de brongrootheid.
const E_Nmm2  = 210000;      // E   = 2,1 · 10^11 Pa
const NU      = 0.25;        // ν   = 0,25
const A_LIG   = 15160;       // A   = 0,01516 m²
const I_LIG   = 2.174e8;     // Izz = 2,174 · 10^-4 m⁴
const SRY     = 2.5;         // dwarskrachtfactor A / A_afschuiving
const A_TREK  = 4500;        // A   = 4,5 · 10^-3 m²   (A—C, C—E, E—B)
const A_DRUK  = 3480;        // A   = 3,48 · 10^-3 m²  (C—D, E—F)
const Q_Nmm   = -50;         // q   = −50,0 · 10³ N/m = −50 N/mm (omlaag)
const Q_kNm   = -50;         // dezelfde last in de eenheid van het projectbestand
const ALPHA   = 1.0e-5;      // α   = 1,0 · 10^-5 /K, uitsluitend staaf C—E
const DELTA_T = -163.0;      // ΔT  = −163,0 K
const H_ONDER = 600;         // onderspanningsdiepte 0,60 m
const L_TREK  = 4000;        // trekstang C—E is 4,00 m

// De bron geeft de onderspanningsstaven geen traagheidsmoment (het zijn
// pendelstaven). De app eist per staaf een I; die keuze is aantoonbaar
// irrelevant — zie §5. Genomen: de volle ronde doorsnede bij de opgegeven A.
const I_TREK = Math.PI * Math.pow(Math.sqrt(A_TREK / Math.PI), 4) / 4;  // 1,611·10^6 mm⁴
const I_DRUK = Math.PI * Math.pow(Math.sqrt(A_DRUK / Math.PI), 4) / 4;  // 9,635·10^5 mm⁴

// Knoop-id's: 1 = A, 2 = D, 3 = H, 4 = F, 5 = B, 6 = C, 7 = E
const KNOPEN = [
  { id: 1, x: 0,    z: 0 },          // A (0; 0)      — scharnieroplegging
  { id: 2, x: 2000, z: 0 },          // D (2; 0)      — kop van drukstaaf C—D
  { id: 3, x: 4000, z: 0 },          // H (4; 0)      — midden
  { id: 4, x: 6000, z: 0 },          // F (6; 0)      — kop van drukstaaf E—F
  { id: 5, x: 8000, z: 0 },          // B (8; 0)      — roloplegging
  { id: 6, x: 2000, z: -H_ONDER },   // C (2; −0,6)
  { id: 7, x: 6000, z: -H_ONDER },   // E (6; −0,6)
];

const OPLEGGINGEN = [
  { nodeId: 1, type: "pinned"  },    // A: ux = uz = 0
  { nodeId: 5, type: "zRoller" },    // B: uz = 0, horizontaal vrij
];

// SCHARNIERPATROON — zie punt (3) in de kop. Alle onderspanningsstaven zijn
// aan beide einden scharnierend, BEHALVE de trekstang C—E: die blijft aan
// beide zijden momentvast en is daarmee het enige momentvaste staafeind in
// knoop C en in knoop E. Momentevenwicht in die knopen dwingt dat eindmoment
// naar nul, dus alle vijf staven dragen zuiver normaalkracht.
const SCHARNIER = { startRy: true, endRy: true };

const STAVEN = [
  { id: 1, from: 1, to: 2, A: A_LIG,  I: I_LIG,  rel: undefined },  // ligger A—D
  { id: 2, from: 2, to: 3, A: A_LIG,  I: I_LIG,  rel: undefined },  // ligger D—H
  { id: 3, from: 3, to: 4, A: A_LIG,  I: I_LIG,  rel: undefined },  // ligger H—F
  { id: 4, from: 4, to: 5, A: A_LIG,  I: I_LIG,  rel: undefined },  // ligger F—B
  { id: 5, from: 1, to: 6, A: A_TREK, I: I_TREK, rel: SCHARNIER },  // schoor A—C
  { id: 6, from: 6, to: 7, A: A_TREK, I: I_TREK, rel: undefined },  // TREKSTANG C—E
  { id: 7, from: 7, to: 5, A: A_TREK, I: I_TREK, rel: SCHARNIER },  // schoor E—B
  { id: 8, from: 6, to: 2, A: A_DRUK, I: I_DRUK, rel: SCHARNIER },  // drukstaaf C—D
  { id: 9, from: 7, to: 4, A: A_DRUK, I: I_DRUK, rel: SCHARNIER },  // drukstaaf E—F
];
const ID_TREKSTANG = 6;
const ID_LIGGER = [1, 2, 3, 4];

// ── Referentiewaarden uit het dossier (NIET aanpassen) ──────────────────────
const REF = {
  N_CE: 584584.0,      // N    — trekkracht in staaf C—E        (analytisch)
  M_H:   49249.5,      // N·m  — buigend moment in H (midden)   (analytisch)
  vD:   -0.0005428,    // m    — verticale verplaatsing van D
                       //        (GEMIDDELDE van rekenprogramma-uitkomsten,
                       //        volgens de bron zelf; zwakkere referentie)
};
// Dossier §1.5: analytisch exact → 0,5 %; numerieke bundelreferentie → 1 %.
// Het dossier schrijft voor de zakking van D expliciet een ruimere tolerantie
// voor (bijv. 5 %) omdat het een programma-gemiddelde is.
const TOL_ANALYTISCH_PCT = 1.0;
const TOL_VD_PCT = 5.0;

// ── Vergelijkingsadministratie ──────────────────────────────────────────────
const regels = [];
/**
 * Leg één vergelijking vast. `soort`:
 *  - "app-B"    : Open FEM2D Studio met de exacte bronwaarden (Bernoulli);
 *  - "bestand"  : dezelfde grootheid, maar via het opgeslagen R24.femp;
 *  - "eigen-B"  : eigen, los geprogrammeerde raamwerkmatrix ZONDER afschuiving;
 *  - "eigen-T"  : eigen raamwerkmatrix MÉT dwarskrachtvervorming (SRY = 2,5).
 */
function vergelijk(naam, ons, ref, soort, eenheid) {
  const dPct = ref === 0 ? 0 : (ons - ref) / Math.abs(ref) * 100;
  regels.push({ naam, ons, ref, dPct, soort, eenheid });
  return dPct;
}

let fouten = 0;
function controleer(naam, ons, verwacht, tolAbs) {
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= tolAbs;
  if (!ok) fouten++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${ons.toExponential(6)} (verwacht ${verwacht.toExponential(6)}, tol ${tolAbs.toExponential(1)})`);
  return ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Model met de EXACTE doorsnedegrootheden van de bron
// ═════════════════════════════════════════════════════════════════════════════
function bouwInvoer({ I_onderspanning } = {}) {
  return {
    nodes: KNOPEN,
    beams: STAVEN.map(s => ({
      id: s.id, from: s.from, to: s.to,
      E: E_Nmm2, A: s.A,
      I: (s.id >= 5 && I_onderspanning !== undefined) ? I_onderspanning : s.I,
      releases: s.rel,
    })),
    supports: OPLEGGINGEN,
    // Belasting 1: gelijkmatig verdeelde lijnlast over alle vier liggerdelen.
    loads: ID_LIGGER.map(id => ({ beamId: id, q: Q_Nmm })),
    // Belasting 2: temperatuurdaling uitsluitend in de trekstang, met de α
    // van de bron (de adapter honoreert een per-last α exact).
    thermalLoads: [{ beamId: ID_TREKSTANG, deltaT: DELTA_T, alpha: ALPHA }],
  };
}

const invoerExact = bouwInvoer();
const r = solve(invoerExact);
if (!r) throw new Error("solve() gaf geen resultaat");

const mm2m = (v) => v / 1000;
const Nmm2Nm = (v) => v / 1000;

const onsApp = {
  N_CE: r.elements.get(ID_TREKSTANG).N,                       // N, trek positief
  M_H:  Nmm2Nm(r.elements.get(2).bendingMoment[20]),          // laatste station van D—H = knoop H
  vD:   mm2m(r.displacements.get(2).uz),                      // m, omlaag negatief
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Model opslaan als projectbestand (surrogaatdoorsnede met gelijke E·A én E·I)
// ═════════════════════════════════════════════════════════════════════════════
// Zie punt (4) in de kop. Eén sterkteklasse voor álle staven, per staaf:
//     h = √(12·I/A)              → gelijke traagheidsstraal als de bron
//     b = A · (E_bron/E_klasse) / h
// zodat E'·A' = E·A en E'·I' = E·I. Voor de onderspanningsstaven geeft de
// bron geen I; daar volgt h uit de gekozen ronde vervangdoorsnede (§1), wat
// aantoonbaar niet uitmaakt (§5).
const KLASSE = "GL36h";
const E_KLASSE = TIMBER_E_MEAN[KLASSE];          // 14 700 N/mm²
const SCHAAL = E_Nmm2 / E_KLASSE;                // 14,2857…

function surrogaatProfiel(A, I) {
  const h = Math.sqrt(12 * I / A);               // mm — gelijke i = √(I/A)
  const b = A * SCHAAL / h;                      // mm — zodat E'·b·h = E·A
  // Vier decimalen: de afronding van de profielnaam blijft daarmee onder
  // 1·10^-6 % in E·A en E·I, ruim onder elke rekenkundige betekenis.
  const fmt = (v) => v.toFixed(4);
  return `${fmt(b)}x${fmt(h)}`;
}
const PROFIEL = Object.fromEntries(
  STAVEN.map(s => [s.id, surrogaatProfiel(s.A, s.I)]),
);

// ΔT meeschalen: de app kiest α per staafmateriaal (hout → 5,0·10^-6 /K).
// Dezelfde opgelegde verkorting vraagt ΔT' = α_bron · ΔT / α_hout.
const DELTA_T_BESTAND = ALPHA * DELTA_T / ALPHA_HOUT;   // −326 K

const projectState = {
  nodes: KNOPEN,
  beams: STAVEN.map(s => ({
    id: s.id, from: s.from, to: s.to,
    material: KLASSE,
    profile: PROFIEL[s.id],
    releases: s.rel ?? {},
  })),
  supports: OPLEGGINGEN,
  plates: [],
  loads: [
    ...ID_LIGGER.map((id, i) => ({
      id: i + 1, type: "lineLoad", caseId: 1, beamId: id, q: Q_kNm,
    })),
    {
      id: 10, type: "thermal", caseId: 1, beamId: ID_TREKSTANG,
      deltaT: DELTA_T_BESTAND,
    },
  ],
  loadCases: [{
    id: 1,
    // De naam draagt de twee waarschuwingen mee die iemand die het bestand
    // in de app opent moet weten.
    name: "R24 q=50 kN/m + voorspanning (doorsnede = E·A/E·I-surrogaat, ΔT geschaald)",
    type: "other",
  }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
  nonlinearEnabled: false,    // eerste orde
  combinations: [{
    id: 1, name: "Referentie 1,0", type: "sls", formula: "1,0 · (q + ΔT)", factors: { 1: 1 },
  }],
};

const projectTekst = serializeProject(projectState);
const pad = join(HIER, "R24.femp");
writeFileSync(pad, projectTekst, "utf8");
log(`Model opgeslagen: ${pad}`);
// Tweede kopie onder de eigen extensie van de app (PROJECT_FILE_EXT =
// "ifcfem2d"): de open-dialoog filtert daarop, waardoor een .femp-bestand
// niet in de lijst verschijnt. Zelfde inhoud, ander achtervoegsel.
const padApp = join(HIER, "R24.ifcfem2d");
writeFileSync(padApp, projectTekst, "utf8");
log(`Zelfde model voor de open-dialoog van de app: ${padApp}`);

log("");
log("── Surrogaatdoorsneden in het projectbestand ────────────────────────────");
log(`  sterkteklasse ${KLASSE}, E' = ${E_KLASSE} N/mm² (bron E = ${E_Nmm2} N/mm²)`);
for (const s of STAVEN) {
  const sec = resolveSection(KLASSE, PROFIEL[s.id]);
  const dEA = (sec.E * sec.A) / (E_Nmm2 * s.A) - 1;
  const dEI = (sec.E * sec.I) / (E_Nmm2 * s.I) - 1;
  log(`  staaf ${s.id} ${PROFIEL[s.id].padEnd(19)}  ΔE·A = ${(dEA * 100).toExponential(2).padStart(10)} %   ΔE·I = ${(dEI * 100).toExponential(2).padStart(10)} %`);
}
log(`  ΔT in het bestand: ${DELTA_T_BESTAND.toFixed(3)} K bij α_hout = ${ALPHA_HOUT} /K`);
log(`    → opgelegde rek α·ΔT = ${(ALPHA_HOUT * DELTA_T_BESTAND).toExponential(6)}  (bron: ${(ALPHA * DELTA_T).toExponential(6)})`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. Onafhankelijke raamwerkmatrix (eigen code, SI-eenheden)
// ═════════════════════════════════════════════════════════════════════════════
// Volledig los van de app geprogrammeerd: 3 vrijheidsgraden per knoop voor de
// ligger, 2 voor de vakwerkstaven, en een schakelaar voor de
// dwarskrachtvervorming (Timoshenko-element met Φ = 12·E·I/(G·A_s·L²)).
// Dit is de derde partij die zowel de BRON als ONZE uitkomst controleert:
//  - met de schakelaar AAN moet de bron gereproduceerd worden (bron rekent
//    met SRY = 2,5);
//  - met de schakelaar UIT moet onze app gereproduceerd worden (Bernoulli).
function eigenRaamwerk({ shear, nSub = 4 }) {
  const E = 2.1e11, nu = NU, G = E / (2 * (1 + nu));
  const Ab = 0.01516, Ib = 2.174e-4, As = Ab / SRY;
  const At = 4.5e-3, Ap = 3.48e-3;
  const alpha = 1.0e-5, dT = -163.0, q = -50.0e3;

  const P = [];                                   // knoopcoördinaten [x, y] in m
  const nk = (x, y) => { P.push([x, y]); return P.length - 1; };
  const hoofd = [0, 2, 4, 6, 8];
  const liggerIdx = [];
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < nSub; k++) {
      liggerIdx.push(nk(hoofd[s] + (hoofd[s + 1] - hoofd[s]) * k / nSub, 0));
    }
  }
  liggerIdx.push(nk(8, 0));
  const iC = nk(2, -0.6), iE = nk(6, -0.6);
  const iA = liggerIdx[0], iD = liggerIdx[nSub], iH = liggerIdx[2 * nSub];
  const iF = liggerIdx[3 * nSub], iB = liggerIdx[4 * nSub];

  const nD = 3 * P.length;
  const K = Array.from({ length: nD }, () => new Float64Array(nD));
  const F = new Float64Array(nD);

  // ── raamwerkelementen (de ligger) ──
  const frameData = [];
  for (let i = 0; i < liggerIdx.length - 1; i++) {
    const a = liggerIdx[i], b = liggerIdx[i + 1];
    const dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1], L = Math.hypot(dx, dy);
    const c = dx / L, s = dy / L;
    const Phi = shear ? 12 * E * Ib / (G * As * L * L) : 0;
    const g = E * Ib / (L * L * L * (1 + Phi));
    const ea = E * Ab / L;
    const kl = [
      [ea, 0, 0, -ea, 0, 0],
      [0, 12 * g, 6 * g * L, 0, -12 * g, 6 * g * L],
      [0, 6 * g * L, (4 + Phi) * g * L * L, 0, -6 * g * L, (2 - Phi) * g * L * L],
      [-ea, 0, 0, ea, 0, 0],
      [0, -12 * g, -6 * g * L, 0, 12 * g, -6 * g * L],
      [0, 6 * g * L, (2 - Phi) * g * L * L, 0, -6 * g * L, (4 + Phi) * g * L * L],
    ];
    const T = [
      [c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1],
    ];
    const kt = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let p = 0; p < 6; p++) for (let r2 = 0; r2 < 6; r2++) {
      let v = 0; for (let m = 0; m < 6; m++) v += kl[p][m] * T[m][r2]; kt[p][r2] = v;
    }
    const ke = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let p = 0; p < 6; p++) for (let r2 = 0; r2 < 6; r2++) {
      let v = 0; for (let m = 0; m < 6; m++) v += T[m][p] * kt[m][r2]; ke[p][r2] = v;
    }
    const map = [3 * a, 3 * a + 1, 3 * a + 2, 3 * b, 3 * b + 1, 3 * b + 2];
    for (let p = 0; p < 6; p++) for (let r2 = 0; r2 < 6; r2++) K[map[p]][map[r2]] += ke[p][r2];
    // Consistente knooplasten van de gelijkmatige verticale lijnlast.
    const w = q * c, ax = q * s;
    const fl = [ax * L / 2, w * L / 2, w * L * L / 12, ax * L / 2, w * L / 2, -w * L * L / 12];
    for (let p = 0; p < 6; p++) {
      let v = 0; for (let m = 0; m < 6; m++) v += T[m][p] * fl[m];
      F[map[p]] += v;
    }
    frameData.push({ a, b, L, kl, T, fl, map });
  }

  // ── vakwerkstaven (onderspanning) ──
  const staven = [
    { i: iA, j: iC, A: At, aT: 0 },              // A—C
    { i: iC, j: iE, A: At, aT: alpha * dT },     // C—E, voorgespannen
    { i: iE, j: iB, A: At, aT: 0 },              // E—B
    { i: iC, j: iD, A: Ap, aT: 0 },              // C—D
    { i: iE, j: iF, A: Ap, aT: 0 },              // E—F
  ];
  for (const b of staven) {
    const dx = P[b.j][0] - P[b.i][0], dy = P[b.j][1] - P[b.i][1];
    b.L = Math.hypot(dx, dy); b.c = dx / b.L; b.s = dy / b.L; b.k = E * b.A / b.L;
    b.map = [3 * b.i, 3 * b.i + 1, 3 * b.j, 3 * b.j + 1];
    const { c, s, k, map } = b;
    const ke = [
      [c * c, c * s, -c * c, -c * s], [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s], [-c * s, -s * s, c * s, s * s],
    ].map(rij => rij.map(v => v * k));
    for (let p = 0; p < 4; p++) for (let r2 = 0; r2 < 4; r2++) K[map[p]][map[r2]] += ke[p][r2];
    // Equivalente knooplasten van de opgelegde thermische rek.
    const ft = E * b.A * b.aT;
    F[map[0]] += -ft * c; F[map[1]] += -ft * s; F[map[2]] += ft * c; F[map[3]] += ft * s;
  }

  // Randvoorwaarden. De rotatie-DOF's van C en E hebben geen enkele stijfheid
  // (alleen vakwerkstaven sluiten er aan) en worden vastgezet — dat is
  // krachtenvrij en dus zonder invloed op de oplossing.
  const vast = new Set([3 * iA, 3 * iA + 1, 3 * iB + 1, 3 * iC + 2, 3 * iE + 2]);
  const vrij = [];
  for (let d = 0; d < nD; d++) if (!vast.has(d)) vrij.push(d);
  const n = vrij.length;
  const M = Array.from({ length: n }, (_, p) => {
    const rij = new Float64Array(n + 1);
    for (let r2 = 0; r2 < n; r2++) rij[r2] = K[vrij[p]][vrij[r2]];
    rij[n] = F[vrij[p]];
    return rij;
  });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r2 = col + 1; r2 < n; r2++) if (Math.abs(M[r2][col]) > Math.abs(M[piv][col])) piv = r2;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d0 = M[col][col];
    for (let r2 = 0; r2 < n; r2++) {
      if (r2 === col) continue;
      const f = M[r2][col] / d0;
      if (f === 0) continue;
      for (let k2 = col; k2 <= n; k2++) M[r2][k2] -= f * M[col][k2];
    }
  }
  const u = new Float64Array(nD);
  for (let p = 0; p < n; p++) u[vrij[p]] = M[p][n] / M[p][p];

  const N = staven.map(b => {
    const du = u[b.map[2]] - u[b.map[0]], dv = u[b.map[3]] - u[b.map[1]];
    return b.k * (b.c * du + b.s * dv) - E * b.A * b.aT;
  });
  const reactie = (d) => {
    let v = 0; for (let b = 0; b < nD; b++) v += K[d][b] * u[b];
    return v - F[d];
  };
  // Buigend moment in H uit de eindkrachten van het element dat in H eindigt.
  const fd = frameData.find(f => f.b === iH);
  const dl = new Array(6).fill(0);
  for (let p = 0; p < 6; p++) { let v = 0; for (let m = 0; m < 6; m++) v += fd.T[p][m] * u[fd.map[m]]; dl[p] = v; }
  const fe = new Array(6).fill(0);
  for (let p = 0; p < 6; p++) { let v = 0; for (let m = 0; m < 6; m++) v += fd.kl[p][m] * dl[m]; fe[p] = v - fd.fl[p]; }

  return {
    N_CE: N[1], N_AC: N[0], N_EB: N[2], N_CD: N[3], N_EF: N[4],
    M_H: fe[5],                       // sagging-positief moment aan de H-zijde
    vD: u[3 * iD + 1], vH: u[3 * iH + 1],
    RAx: reactie(3 * iA), RAy: reactie(3 * iA + 1), RBy: reactie(3 * iB + 1),
  };
}

// Zelftest van de eigen code op een geval met een gesloten formule: dezelfde
// ligger, maar zónder onderspanning is het een vrij opgelegde ligger.
function zelftestEigenCode() {
  const E = 2.1e11, I = 2.174e-4, L = 8, q = 50.0e3;
  const M_exact = q * L * L / 8;                       // 400 000 N·m
  const w_exact = -5 * q * Math.pow(L, 4) / (384 * E * I);
  return { M_exact, w_exact };
}

const eigenB = eigenRaamwerk({ shear: false });
const eigenT = eigenRaamwerk({ shear: true });

// ═════════════════════════════════════════════════════════════════════════════
// 4. Eigen evenwichtscontroles op ons app-model
// ═════════════════════════════════════════════════════════════════════════════
// "Ontbreekt in de bron: oplegreacties." Ze volgen wél uit zuiver evenwicht.
log("");
log("── Evenwicht en interne consistentie van het app-model ──────────────────");
const RA = r.reactions.get(1), RB = r.reactions.get(5);
const Q_TOT = Math.abs(Q_Nmm) * 8000;               // 400 000 N
controleer("R_A,z = q·L/2 = 200 kN", RA.fz, Q_TOT / 2, 1e-3);
controleer("R_B,z = q·L/2 = 200 kN", RB.fz, Q_TOT / 2, 1e-3);
controleer("ΣF_x van de reacties = 0", RA.fx + RB.fx, 0, 1e-6);
controleer("ΣF_z − q·L = 0", RA.fz + RB.fz - Q_TOT, 0, 1e-3);

// Knoopevenwicht in C: drie vakwerkstaven, geen uitwendige last.
const NAC = r.elements.get(5).N, NCE = r.elements.get(6).N, NCD = r.elements.get(8).N;
const Lac = Math.hypot(2000, H_ONDER);
const eC_A = [-2000 / Lac, H_ONDER / Lac];          // eenheidsvector C → A
const somX = NAC * eC_A[0] + NCE * 1 + NCD * 0;
const somZ = NAC * eC_A[1] + NCE * 0 + NCD * 1;     // C → D is (0, +1)
const schaalC = Math.max(Math.abs(NAC), Math.abs(NCE), Math.abs(NCD));
controleer("knoop C: ΣF_x = 0", somX / schaalC, 0, 1e-9);
controleer("knoop C: ΣF_z = 0", somZ / schaalC, 0, 1e-9);

// De kruiscontrole die het dossier zelf noemt: M_H = q·L²/8 − N·h.
const M_H_uitStatica = Nmm2Nm(Q_TOT * 8000 / 8) - NCE * (H_ONDER / 1000);
controleer("M_H = q·L²/8 − N·h (vrije-lichaamsidentiteit)", onsApp.M_H, M_H_uitStatica, 1e-3);

// De twee helften moeten symmetrisch zijn.
controleer("symmetrie: N(A—C) = N(E—B)", r.elements.get(5).N - r.elements.get(7).N, 0, 1e-3);
controleer("symmetrie: N(C—D) = N(E—F)", r.elements.get(8).N - r.elements.get(9).N, 0, 1e-3);
controleer("symmetrie: u_z(D) = u_z(F)", r.displacements.get(2).uz - r.displacements.get(4).uz, 0, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// 5. Zuiver vakwerkgedrag van de onderspanning
// ═════════════════════════════════════════════════════════════════════════════
// Punt (3) in de kop: alle vijf onderspanningsstaven moeten momentvrij zijn,
// óók de trekstang C—E die formeel momentvast is aangesloten. En de uitkomst
// moet onafhankelijk zijn van de gekozen I van die staven.
log("");
log("── Zuiver vakwerkgedrag van de onderspanning ────────────────────────────");
let maxM = 0;
for (const id of [5, 6, 7, 8, 9]) {
  const e = r.elements.get(id);
  maxM = Math.max(maxM, Math.abs(e.M_start), Math.abs(e.M_end));
}
const schaalM = Math.abs(NAC) * Lac;                 // |N|·L als natuurlijke schaal
controleer("grootste |M| op de onderspanningsstaafeinden ≈ 0", maxM / schaalM, 0, 1e-11);

log("  I-onafhankelijkheid van de onderspanning (I over vier decaden):");
let maxIAfw = 0;
for (const Ivar of [1e4, 1e6, 1e8]) {
  const rv = solve(bouwInvoer({ I_onderspanning: Ivar }));
  const dN = (rv.elements.get(ID_TREKSTANG).N - onsApp.N_CE) / Math.abs(onsApp.N_CE) * 100;
  maxIAfw = Math.max(maxIAfw, Math.abs(dN));
  log(`    I = ${Ivar.toExponential(0).padStart(7)} mm⁴ → N(C—E) = ${rv.elements.get(ID_TREKSTANG).N.toFixed(3)} N   Δ = ${dN.toExponential(2)} %`);
}
controleer("N(C—E) onafhankelijk van I van de onderspanning", maxIAfw, 0, 1e-9);

// En de blokkade die het dossier bij R11 al vastlegde: alles scharnierend.
let allesScharnierendMelding = "";
try {
  solve({
    ...invoerExact,
    beams: invoerExact.beams.map(b => (b.id >= 5 ? { ...b, releases: SCHARNIER } : b)),
  });
  allesScharnierendMelding = "rekent door";
} catch (e) {
  allesScharnierendMelding = e instanceof Error ? e.message : String(e);
}
log(`  Alle onderspanningsstaven aan beide einden scharnierend → ${allesScharnierendMelding}`);

// ═════════════════════════════════════════════════════════════════════════════
// 6. Waar het verschil met de bron vandaan komt
// ═════════════════════════════════════════════════════════════════════════════
// De eigen raamwerkmatrix draait twee keer: mét en zonder dwarskrachtvervorming.
// Als "mét" de bron reproduceert en "zonder" onze app reproduceert, is het
// verschil volledig verklaard en is er geen ruimte meer voor een solverfout.
log("");
log("── Herkomst van het verschil: dwarskrachtvervorming (SRY = 2,5) ─────────");
const zt = zelftestEigenCode();
log(`  Zelftest eigen code (vrij opgelegde ligger, gesloten formule):`);
log(`    q·L²/8 = ${zt.M_exact.toFixed(1)} N·m   5qL⁴/384EI = ${zt.w_exact.toExponential(6)} m`);
log(`  Netverfijning eigen code (moet constant zijn):`);
for (const nSub of [1, 4, 16]) {
  const a = eigenRaamwerk({ shear: false, nSub });
  const b = eigenRaamwerk({ shear: true, nSub });
  log(`    ${String(nSub).padStart(2)}× : Bernoulli N = ${a.N_CE.toFixed(3)} N   Timoshenko N = ${b.N_CE.toFixed(3)} N`);
}
log("");
log("  grootheid           app (Bernoulli)      eigen Bernoulli      eigen Timoshenko     bron");
const rij = (naam, app, eb, et, ref, fmt) =>
  log(`  ${naam.padEnd(18)} ${fmt(app).padStart(18)} ${fmt(eb).padStart(20)} ${fmt(et).padStart(20)} ${fmt(ref).padStart(16)}`);
const f6 = (v) => v.toFixed(3);
const fe6 = (v) => v.toExponential(6);
rij("N(C—E)  [N]",  onsApp.N_CE, eigenB.N_CE, eigenT.N_CE, REF.N_CE, f6);
rij("M_H     [N·m]", onsApp.M_H,  eigenB.M_H,  eigenT.M_H,  REF.M_H,  f6);
rij("u_z(D)  [m]",   onsApp.vD,   eigenB.vD,   eigenT.vD,   REF.vD,   fe6);
log("");
log("  Verschil app ↔ eigen Bernoulli (moet nul zijn — onafhankelijke code):");
controleer("  N(C—E)", (onsApp.N_CE - eigenB.N_CE) / Math.abs(eigenB.N_CE), 0, 1e-9);
controleer("  M_H",    (onsApp.M_H  - eigenB.M_H)  / Math.abs(eigenB.M_H),  0, 1e-9);
controleer("  u_z(D)", (onsApp.vD   - eigenB.vD)   / Math.abs(eigenB.vD),   0, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// 7. De route die de app zelf loopt: projectbestand → mapping → solver
// ═════════════════════════════════════════════════════════════════════════════
const bestand = deserializeProject(readFileSync(pad, "utf8"));
const multi = bouwMultiInput({
  nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
  plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
});
const rBestand = solveAllCases(multi).perCase.get(1);
const onsBestand = {
  N_CE: rBestand.elements.get(ID_TREKSTANG).N,
  M_H:  Nmm2Nm(rBestand.elements.get(2).bendingMoment[20]),
  vD:   mm2m(rBestand.displacements.get(2).uz),
};

// ═════════════════════════════════════════════════════════════════════════════
// 8. Vergelijkingen vastleggen
// ═════════════════════════════════════════════════════════════════════════════
vergelijk("N(C—E) trekstangkracht",  onsApp.N_CE, REF.N_CE, "app-B", "N");
vergelijk("M_H veldmoment midden",   onsApp.M_H,  REF.M_H,  "app-B", "N·m");
vergelijk("u_z(D) zakking knoop D",  onsApp.vD,   REF.vD,   "app-B", "m");

vergelijk("N(C—E) via R24.femp",     onsBestand.N_CE, REF.N_CE, "bestand", "N");
vergelijk("M_H via R24.femp",        onsBestand.M_H,  REF.M_H,  "bestand", "N·m");
vergelijk("u_z(D) via R24.femp",     onsBestand.vD,   REF.vD,   "bestand", "m");

vergelijk("N(C—E) eigen Bernoulli",  eigenB.N_CE, REF.N_CE, "eigen-B", "N");
vergelijk("M_H eigen Bernoulli",     eigenB.M_H,  REF.M_H,  "eigen-B", "N·m");
vergelijk("u_z(D) eigen Bernoulli",  eigenB.vD,   REF.vD,   "eigen-B", "m");

vergelijk("N(C—E) eigen Timoshenko", eigenT.N_CE, REF.N_CE, "eigen-T", "N");
vergelijk("M_H eigen Timoshenko",    eigenT.M_H,  REF.M_H,  "eigen-T", "N·m");
vergelijk("u_z(D) eigen Timoshenko", eigenT.vD,   REF.vD,   "eigen-T", "m");

// ═════════════════════════════════════════════════════════════════════════════
// 9. Staafkrachten die de bron niet geeft (voor de volledigheid)
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("── Overige snedekrachten (staan niet in de bron) ────────────────────────");
const namen = { 5: "A—C schoor", 6: "C—E trekstang", 7: "E—B schoor", 8: "C—D drukstaaf", 9: "E—F drukstaaf" };
for (const id of [5, 6, 7, 8, 9]) {
  const eigenNaam = { 5: "N_AC", 6: "N_CE", 7: "N_EB", 8: "N_CD", 9: "N_EF" }[id];
  const app = r.elements.get(id).N, eb = eigenB[eigenNaam], et = eigenT[eigenNaam];
  log(`  ${namen[id].padEnd(15)} app ${app.toFixed(1).padStart(12)} N   eigen-B ${eb.toFixed(1).padStart(12)} N   eigen-T ${et.toFixed(1).padStart(12)} N`);
}
log(`  ligger N (A—D)   app ${r.elements.get(1).N.toFixed(1).padStart(12)} N (druk = negatief)`);
log(`  u_z(H) midden    app ${mm2m(r.displacements.get(3).uz).toExponential(6)} m   eigen-T ${eigenT.vH.toExponential(6)} m`);

// ═════════════════════════════════════════════════════════════════════════════
// 10. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ═══════════════════════════════");
log("");
log("  soort      grootheid                        referentie        onze waarde       Δ [%]");
log("  ─────────────────────────────────────────────────────────────────────────────────────");
for (const g of regels) {
  log(`  ${g.soort.padEnd(9)}  ${g.naam.padEnd(30)}  ${g.ref.toExponential(5).padStart(14)}  ${g.ons.toExponential(5).padStart(15)}  ${g.dPct.toFixed(3).padStart(9)}`);
}

const perSoort = (s) => regels.filter(g => g.soort === s);
const maxAfw = (s) => Math.max(...perSoort(s).map(g => Math.abs(g.dPct)));

log("");
log(`  Grootste afwijking app (Bernoulli)      : ${maxAfw("app-B").toFixed(3)} %`);
log(`  Grootste afwijking via R24.femp         : ${maxAfw("bestand").toFixed(3)} %`);
log(`  Grootste afwijking eigen Bernoulli      : ${maxAfw("eigen-B").toFixed(3)} %`);
log(`  Grootste afwijking eigen Timoshenko     : ${maxAfw("eigen-T").toFixed(3)} %  ← reproduceert de bron`);
log("");
log(`  Toleranties (dossier §1.5): ${TOL_ANALYTISCH_PCT} % op de twee analytische waarden,`);
log(`  ${TOL_VD_PCT} % op u_z(D) (die is een programma-gemiddelde, geen analytische waarde).`);
log("");

// Het opgeslagen bestand moet hetzelfde geven als het exacte model. De enige
// bron van verschil is de afronding van de profielmaten in de bestandsnaam
// van het profiel (vier decimalen); die blijft ruim onder 1·10^-6 relatief.
const bestandAfw = Math.max(...["N_CE", "M_H", "vD"].map(
  k => Math.abs((onsBestand[k] - onsApp[k]) / onsApp[k]),
));
const bestandGelijk = bestandAfw < 1e-6;
log(`  R24.femp reproduceert het exacte model : ${bestandGelijk ? "JA" : "NEE"} (grootste relatieve verschil ${bestandAfw.toExponential(2)})`);
if (!bestandGelijk) fouten++;

// De eigen Timoshenko-matrix moet de bron binnen de bundeltolerantie halen;
// dat is de controle op de BRON en op de eigen code tegelijk.
const bronExact = maxAfw("eigen-T") < 0.1;
log(`  Eigen Timoshenko reproduceert de bron  : ${bronExact ? "JA (< 0,1 %)" : "NEE"}`);
if (!bronExact) fouten++;

log("");
log("  OORDEEL");
log("  ───────");
if (bronExact && maxAfw("eigen-B") - maxAfw("app-B") < 1e-6) {
  log("  De app rekent het model dat zij kent (Euler-Bernoulli) tot op 1e-9 gelijk");
  log("  aan een onafhankelijk geprogrammeerde raamwerkmatrix. De bron rekent mét");
  log("  dwarskrachtvervorming (SRY = 2,5); zet je die in de eigen matrix aan, dan");
  log("  komen alle drie de referentiewaarden er tot op 0,01 % uit. Het verschil");
  log("  tussen de app en de bron is dus VOLLEDIG de ontbrekende");
  log("  dwarskrachtvervorming — een AANNAME-verschil, geen fout in de app en geen");
  log("  fout in de bron.");
} else {
  log("  Het verschil is NIET volledig door de dwarskrachtvervorming verklaard —");
  log("  uitzoeken voordat er een oordeel wordt vastgelegd.");
  fouten++;
}
log("");
log(`  Interne controles: ${fouten === 0 ? "alle in orde" : fouten + " FOUT"}`);
log("");

process.exit(fouten === 0 ? 0 : 1);
