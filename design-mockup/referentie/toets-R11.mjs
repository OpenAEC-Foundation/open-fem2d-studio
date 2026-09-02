// ═════════════════════════════════════════════════════════════════════════════
// R11 — Vlak vakwerk met vier staven onder puntlast
//
// Validatiecampagne referentieberekeningen, geval R11 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: validatiehandboek (fascicule v3.01) van een open-source
// eindige-elementenpakket, geval SSLL11; referentie uit fiche SSLL11/89 van
// het Guide VPCS, bepaald met de verplaatsingsmethode. Toegepaste tolerantie
// in de bron zelf: 3,0 · 10^-4 relatief (0,03 %).
//
// GEOMETRIE (m)      A (0; 0) · B (1; 0) · C (0,5; 0,5) · D (2; 1)
// STAVEN             A–C · B–C (A = 2,0·10^-4 m²) · C–D · B–D (A = 1,0·10^-4 m²)
// MATERIAAL          E = 1,962·10^11 Pa, nu = 0,3
// OPLEGGINGEN        A en B scharnierend (u = v = 0)
// BELASTING          verticale puntlast in D: F = −9,81·10^3 N
//
// ── DRIE DINGEN DIE BIJ DIT GEVAL ZIJN OPGEVALLEN ───────────────────────────
//
// (1) EEN VOLLEDIG SCHARNIEREND VAKWERK REKENT DE APP NIET DOOR.
//     Zet je op ALLE staafeinden een buigscharnier — de letterlijke
//     modelleerinstructie uit het dossier — dan hebben de rotatie-DOF's van de
//     vrije knopen nergens meer stijfheid en meldt de kern
//     "Matrix is singular or nearly singular at column 8" (knoop C, rotatie).
//     Dat is niet fout gerekend, maar het is wel een blokkade voor een heel
//     gewone constructiesoort; §5 hieronder laat het zien. Het plaatpad van
//     dezelfde kern (NonlinearSolver.solvePlateOrPlane) klemt zulke
//     nul-stijfheid-DOF's automatisch in en gaat wél door — het raamwerkpad
//     doet dat niet.
//
// (2) DE WERKENDE MODELLERING IS WISKUNDIG EXACT, NIET EEN BENADERING.
//     Laat je per KNOOP precies één staafeind momentvast, dan volgt uit
//     momentevenwicht in die knoop dat dat ene eindmoment nul is. Alle
//     staafeindmomenten zijn dan nul, dus ook alle dwarskrachten (V = ΣM/L),
//     en elke staaf draagt zuiver normaalkracht: exact vakwerkgedrag. §3
//     controleert dat expliciet (|M| ≲ 1e-12 N·mm) en §4 legt de uitkomst
//     naast een eigen, onafhankelijk geprogrammeerde vakwerkmatrix.
//
// (3) HET PROJECTBESTAND KAN DE DOORSNEDE VAN DE BRON NIET DRAGEN.
//     Een staaf in het projectformaat draagt alleen een MATERIAAL- en een
//     PROFIELNAAM; lib/sectionResolver.resolveSection maakt daar E, A en I van.
//     Dat kan twee dingen: een staalprofiel uit de catalogus (altijd
//     E = 210 000 N/mm², kleinste A = 254 mm²) of een houten rechthoek b×h met
//     de E van een sterkteklasse. De combinatie van de bron — E = 196 200
//     N/mm² met A = 200 resp. 100 mm² — is dus niet invoerbaar. Er is geen
//     vrije doorsnede-invoer in de app.
//     Voor een statisch bepaald vakwerk hangen de verplaatsingen uitsluitend
//     van E·A per staaf af, dus is R11.femp opgeslagen met een doorsnede die
//     E·A EXACT reproduceert (zie §2). Het bestand levert daardoor in de app
//     dezelfde verplaatsingen als de bron; de doorsnede zelf is een surrogaat
//     en dat staat ook in de naam van het belastinggeval.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R11.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection, TIMBER_E_MEAN } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ── Invoer uit het dossier, omgerekend naar de adaptereenheden ──────────────
// De bron geeft SI-basis (m, Pa, m²); de solver-adapter werkt in mm, N/mm²,
// mm², mm⁴ en N. Achter elke regel staat de brongrootheid.
const E_Nmm2 = 196200;        // E = 1,962 · 10^11 Pa
const A_dik = 200;            // A = 2,0 · 10^-4 m²  (staven A–C en B–C)
const A_dun = 100;            // A = 1,0 · 10^-4 m²  (staven C–D en B–D)
const R_dik = 7.978845;       // mm — volle ronde doorsnede bij A = 200 mm²
const R_dun = 5.641895;       // mm — volle ronde doorsnede bij A = 100 mm²
// Traagheidsmoment van de ronde doorsnede, I = π·R⁴/4. De bron heeft dit niet
// nodig (vakwerk); de app eist per staaf een I. Dossier-aanwijzing: "kies een
// waarde die past bij de opgegeven ronde doorsnede en noteer die."
const I_dik = Math.PI * Math.pow(R_dik, 4) / 4;   // 3 183,10 mm⁴
const I_dun = Math.PI * Math.pow(R_dun, 4) / 4;   //   795,77 mm⁴
const F_N = -9810;            // F = −9,81 · 10^3 N, verticaal in knoop D
const F_kN = -9.81;           // dezelfde last in de eenheid van het projectbestand

// Knopen in mm (id's: 1 = A, 2 = B, 3 = C, 4 = D)
const KNOPEN = [
  { id: 1, x: 0,    z: 0 },      // A (0; 0)
  { id: 2, x: 1000, z: 0 },      // B (1; 0)
  { id: 3, x: 500,  z: 500 },    // C (0,5; 0,5)
  { id: 4, x: 2000, z: 1000 },   // D (2; 1)
];

// ── Referentiewaarden uit het dossier (NIET aanpassen) ──────────────────────
const REF = {
  uC:  2.6517e-4,    // m
  vC:  0.8839e-4,    // m
  uD:  3.47902e-3,   // m
  vD: -5.60084e-3,   // m
};
const TOL_BRON_PCT = 0.03;   // de bron toetst zelf op 3,0 · 10^-4 relatief
const TOL_DOSSIER_PCT = 1.0; // dossier §1.5: numerieke referentie uit een validatiebundel

// ── Vergelijkingsadministratie ──────────────────────────────────────────────
const regels = [];
/**
 * Leg één vergelijking vast. `soort`:
 *  - "vergelijkbaar": onze waarde en de referentie meten hetzelfde;
 *  - "bestand":       zelfde grootheid, maar via het opgeslagen projectbestand;
 *  - "raamwerk":      de momentvaste variant die de bron óók noemt;
 *  - "hand":          eigen handafleiding als derde partij (geen app-uitkomst).
 */
function vergelijk(naam, onsSI, refSI, soort) {
  const dPct = refSI === 0 ? 0 : (onsSI - refSI) / Math.abs(refSI) * 100;
  regels.push({ naam, ons: onsSI, ref: refSI, dPct, soort });
  return dPct;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Model met de EXACTE doorsnedegrootheden van de bron
// ═════════════════════════════════════════════════════════════════════════════
// SCHARNIERPATROON — per knoop precies één momentvast staafeind (zie punt (2)
// in de kop). De verdeling:
//   knoop A: staaf 1 (A–C) momentvast aan de A-zijde
//   knoop B: staaf 2 (B–C) momentvast aan de B-zijde
//   knoop C: staaf 3 (C–D) momentvast aan de C-zijde
//   knoop D: staaf 3 (C–D) momentvast aan de D-zijde
// Alle overige staafeinden zijn buigscharnier. Geen enkele knoop heeft twee
// momentvaste einden, dus nergens kan een moment worden overgedragen.
const SCHARNIEREN = {
  1: { endRy: true },                     // A–C: vast in A, scharnier in C
  2: { endRy: true },                     // B–C: vast in B, scharnier in C
  3: undefined,                           // C–D: vast in C én D (enige staaf daar)
  4: { startRy: true, endRy: true },      // B–D: scharnier aan beide zijden
};

const staafDef = [
  { id: 1, from: 1, to: 3, A: A_dik, I: I_dik },   // A–C
  { id: 2, from: 2, to: 3, A: A_dik, I: I_dik },   // B–C
  { id: 3, from: 3, to: 4, A: A_dun, I: I_dun },   // C–D
  { id: 4, from: 2, to: 4, A: A_dun, I: I_dun },   // B–D
];

const OPLEGGINGEN = [
  { nodeId: 1, type: "pinned" },   // A: u = v = 0
  { nodeId: 2, type: "pinned" },   // B: u = v = 0
];

const invoerExact = {
  nodes: KNOPEN,
  beams: staafDef.map(s => ({
    id: s.id, from: s.from, to: s.to,
    E: E_Nmm2, A: s.A, I: s.I,
    releases: SCHARNIEREN[s.id],
  })),
  supports: OPLEGGINGEN,
  loads: [],
  pointLoads: [{ nodeId: 4, fz: F_N }],
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Model opslaan als projectbestand (surrogaatdoorsnede met gelijke E·A)
// ═════════════════════════════════════════════════════════════════════════════
// Zie punt (3) in de kop: de doorsnede van de bron is niet invoerbaar. Het
// bestand krijgt daarom de houten-rechthoekroute, die als enige een VRIJE
// oppervlakte toelaat: A = b·h met de E van een sterkteklasse. De hoogte is zo
// gekozen dat E·A exact overeenkomt met de bron:
//     b · h = E_bron · A_bron / E_klasse
// Voor een statisch bepaald vakwerk is dat volledig equivalent: de staafkrachten
// volgen uit evenwicht (stijfheidsonafhankelijk) en de verplaatsingen hangen
// alleen van E·A af. I speelt geen rol, want alle eindmomenten zijn nul (§3).
const KLASSE = "GL36h";
const E_KLASSE = TIMBER_E_MEAN[KLASSE];              // 14 700 N/mm²
const h_surrogaat = E_Nmm2 * A_dik / E_KLASSE / 50;  // hoogte bij breedte 50 mm
const PROFIEL_DIK = `50x${h_surrogaat}`;             // A = 2 669,39 mm²
const PROFIEL_DUN = `25x${h_surrogaat}`;             // A = 1 334,69 mm²

const projectState = {
  nodes: KNOPEN,
  beams: staafDef.map(s => ({
    id: s.id, from: s.from, to: s.to,
    material: KLASSE,
    profile: s.A === A_dik ? PROFIEL_DIK : PROFIEL_DUN,
    releases: SCHARNIEREN[s.id] ?? {},
  })),
  supports: OPLEGGINGEN,
  plates: [],
  loads: [
    { id: 1, type: "pointForce", caseId: 1, nodeId: 4, fx: 0, fz: F_kN },
  ],
  loadCases: [{
    id: 1,
    // De naam draagt de waarschuwing mee: wie het bestand in de app opent,
    // ziet meteen dat de doorsnede een E·A-surrogaat is.
    name: "F = 9,81 kN (R11 — doorsnede is E·A-surrogaat, zie toets-R11.mjs)",
    type: "other",
  }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
  nonlinearEnabled: false,    // eerste orde
  combinations: [{
    id: 1, name: "Referentie 1,0·F", type: "sls",
    formula: "1,0 · F", factors: { 1: 1 },
  }],
};

const projectTekst = serializeProject(projectState);
const pad = join(HIER, "R11.femp");
writeFileSync(pad, projectTekst, "utf8");
log(`Model opgeslagen: ${pad}`);
// Tweede kopie onder de eigen extensie van de app (PROJECT_FILE_EXT =
// "ifcfem2d"): de open-dialoog filtert daarop, waardoor een .femp-bestand
// niet in de lijst verschijnt. Zelfde inhoud, ander achtervoegsel.
const padApp = join(HIER, "R11.ifcfem2d");
writeFileSync(padApp, projectTekst, "utf8");
log(`Zelfde model voor de open-dialoog van de app: ${padApp}`);

// Controle dat het surrogaat inderdaad dezelfde axiale stijfheid heeft.
const secDik = resolveSection(KLASSE, PROFIEL_DIK);
const secDun = resolveSection(KLASSE, PROFIEL_DUN);
const dEAdik = (secDik.E * secDik.A) / (E_Nmm2 * A_dik) - 1;
const dEAdun = (secDun.E * secDun.A) / (E_Nmm2 * A_dun) - 1;
log("");
log("── Surrogaatdoorsnede in het projectbestand ─────────────────────────────");
log(`  bron  dik : E·A = ${(E_Nmm2 * A_dik).toExponential(9)} N   (E = ${E_Nmm2} N/mm², A = ${A_dik} mm²)`);
log(`  model dik : E·A = ${(secDik.E * secDik.A).toExponential(9)} N   (${KLASSE} ${PROFIEL_DIK})  Δ = ${(dEAdik * 100).toExponential(2)} %`);
log(`  bron  dun : E·A = ${(E_Nmm2 * A_dun).toExponential(9)} N   (E = ${E_Nmm2} N/mm², A = ${A_dun} mm²)`);
log(`  model dun : E·A = ${(secDun.E * secDun.A).toExponential(9)} N   (${KLASSE} ${PROFIEL_DUN})  Δ = ${(dEAdun * 100).toExponential(2)} %`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. Doorrekenen met de exacte bronwaarden + controle op zuiver vakwerkgedrag
// ═════════════════════════════════════════════════════════════════════════════
const r = solve(invoerExact);
if (!r) throw new Error("solve() gaf geen resultaat");

const mm2m = (v) => v / 1000;
const onsExact = {
  uC: mm2m(r.displacements.get(3).ux),
  vC: mm2m(r.displacements.get(3).uz),
  uD: mm2m(r.displacements.get(4).ux),
  vD: mm2m(r.displacements.get(4).uz),
};

// Zuiver vakwerkgedrag: elk staafeindmoment moet nul zijn. De grootste
// normaalkracht maal een staaflengte geeft de schaal waartegen we "nul" meten.
let maxM = 0;
for (const s of staafDef) {
  const e = r.elements.get(s.id);
  maxM = Math.max(maxM, Math.abs(e.M_start), Math.abs(e.M_end));
}
const schaalM = 20810 * 1581;   // |N|max · L ≈ 3,3·10^7 N·mm
const vakwerkZuiver = maxM / schaalM < 1e-12;

log("");
log("── Zuiver vakwerkgedrag (alle staafeindmomenten moeten nul zijn) ────────");
log(`  grootste |M| over alle staafeinden : ${maxM.toExponential(3)} N·mm`);
log(`  relatief t.o.v. |N|max · L         : ${(maxM / schaalM).toExponential(3)}`);
log(`  ${vakwerkZuiver ? "✓" : "✗"} het model gedraagt zich exact als een vakwerk`);

// ═════════════════════════════════════════════════════════════════════════════
// 4. Onafhankelijke handafleiding als derde partij
// ═════════════════════════════════════════════════════════════════════════════
// Klassieke vakwerkmatrix, 2 vrijheidsgraden per knoop, in SI-eenheden en
// volledig los van de app-code geprogrammeerd. Dit controleert zowel de bron
// als onze uitkomst.
function handVakwerk() {
  const E = 1.962e11;                                     // Pa
  const P = { A: [0, 0], B: [1, 0], C: [0.5, 0.5], D: [2, 1] };   // m
  const staven = [["A", "C", 2.0e-4], ["B", "C", 2.0e-4], ["C", "D", 1.0e-4], ["B", "D", 1.0e-4]];
  const dof = { C: [0, 1], D: [2, 3] };                   // A en B zijn vast
  const K = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const info = [];
  for (const [i, j, A] of staven) {
    const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
    const L = Math.hypot(dx, dy), c = dx / L, s = dy / L, k = E * A / L;
    info.push({ i, j, L, c, s, k });
    const map = [...(dof[i] ?? [-1, -1]), ...(dof[j] ?? [-1, -1])];
    const ke = [
      [c * c, c * s, -c * c, -c * s], [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s], [-c * s, -s * s, c * s, s * s],
    ].map(rij => rij.map(v => v * k));
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      if (map[a] >= 0 && map[b] >= 0) K[map[a]][map[b]] += ke[a][b];
    }
  }
  const M = K.map((rij, i) => [...rij, [0, 0, 0, -9.81e3][i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let q = c + 1; q < 4; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q;
    [M[c], M[p]] = [M[p], M[c]];
    for (let q = 0; q < 4; q++) {
      if (q === c) continue;
      const f = M[q][c] / M[c][c];
      for (let k2 = c; k2 <= 4; k2++) M[q][k2] -= f * M[c][k2];
    }
  }
  const u = M.map((rij, i) => rij[4] / rij[i]);
  const N = {};
  for (const s of info) {
    const ui = dof[s.i] ? [u[dof[s.i][0]], u[dof[s.i][1]]] : [0, 0];
    const uj = dof[s.j] ? [u[dof[s.j][0]], u[dof[s.j][1]]] : [0, 0];
    N[s.i + s.j] = s.k * (s.c * (uj[0] - ui[0]) + s.s * (uj[1] - ui[1]));
  }
  return { uC: u[0], vC: u[1], uD: u[2], vD: u[3], N };
}
const hand = handVakwerk();

// VIERDE, nog onafhankelijker controle op v_D: staafkrachten uit ZUIVER
// EVENWICHT (het vakwerk is statisch bepaald, dus stijfheid speelt geen rol)
// en daarna de eenheidslastmethode  v_D = Σ N·n·L/(E·A). Hier komt geen
// enkele stijfheidsmatrix aan te pas — niet die van de app en niet die van
// handVakwerk hierboven.
function vD_virtueleArbeid() {
  const E = 1.962e11;
  const P = { A: [0, 0], B: [1, 0], C: [0.5, 0.5], D: [2, 1] };
  const staven = [["A", "C", 2.0e-4], ["B", "C", 2.0e-4], ["C", "D", 1.0e-4], ["B", "D", 1.0e-4]];
  const eh = (i, j) => {
    const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], L = Math.hypot(dx, dy);
    return [dx / L, dy / L, L];
  };
  // Knoopevenwicht, eerst D (twee staven), dan C (drie staven, één bekend).
  const krachten = (Fz) => {
    const [ax, ay] = eh("D", "C"), [bx, by] = eh("D", "B");
    const det = ax * by - bx * ay;
    const CD = (bx * Fz) / det, BD = (-ax * Fz) / det;
    const [cx, cy] = eh("C", "A"), [dx, dy] = eh("C", "B"), [ex, ey] = eh("C", "D");
    const det2 = cx * dy - dx * cy;
    const rx = -CD * ex, ry = -CD * ey;
    return { AC: (rx * dy - dx * ry) / det2, BC: (cx * ry - rx * cy) / det2, CD, BD };
  };
  const N = krachten(-9.81e3);   // werkelijke last
  const n = krachten(-1);        // verticale eenheidslast in D
  let v = 0;
  for (const [i, j, A] of staven) {
    const [, , L] = eh(i, j);
    v += N[i + j] * n[i + j] * L / (E * A);
  }
  return -v;   // eenheidslast wees omlaag → uitkomst omzetten naar +z omhoog
}
const vD_arbeid = vD_virtueleArbeid();

// ═════════════════════════════════════════════════════════════════════════════
// 5. Wat gebeurt er bij het letterlijke model uit het dossier?
// ═════════════════════════════════════════════════════════════════════════════
// "Modelleer alle staafeinden als scharnieren (vakwerkgedrag); noteer of onze
// scharnierimplementatie op beide staafeinden tegelijk werkt." — dossier R11.
let allesScharnierendMelding = "";
try {
  solve({
    ...invoerExact,
    beams: invoerExact.beams.map(b => ({ ...b, releases: { startRy: true, endRy: true } })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
  });
  allesScharnierendMelding = "rekent door (verwachtte een singulier stelsel)";
} catch (e) {
  allesScharnierendMelding = e.message;
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. De momentvaste variant die de bron óók noemt
// ═════════════════════════════════════════════════════════════════════════════
// "De bron rekent zowel met scharnierende als met momentvaste
// staafverbindingen; door de slankheid verschillen de uitkomsten nauwelijks."
const rStijf = solve({
  ...invoerExact,
  beams: invoerExact.beams.map(b => ({ ...b, releases: undefined })),
});
const onsStijf = {
  uC: mm2m(rStijf.displacements.get(3).ux), vC: mm2m(rStijf.displacements.get(3).uz),
  uD: mm2m(rStijf.displacements.get(4).ux), vD: mm2m(rStijf.displacements.get(4).uz),
};

// ═════════════════════════════════════════════════════════════════════════════
// 7. De route die de app zelf loopt: projectbestand → mapping → solver
// ═════════════════════════════════════════════════════════════════════════════
// Leest het zojuist weggeschreven bestand terug, laat het door dezelfde
// mapping gaan als de app (bouwMultiInput → resolveSection) en rekent het door.
const bestand = deserializeProject(readFileSync(pad, "utf8"));
const multi = bouwMultiInput({
  nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
  plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
});
const rBestand = solveAllCases(multi).perCase.get(1);
const onsBestand = {
  uC: mm2m(rBestand.displacements.get(3).ux), vC: mm2m(rBestand.displacements.get(3).uz),
  uD: mm2m(rBestand.displacements.get(4).ux), vD: mm2m(rBestand.displacements.get(4).uz),
};

// ═════════════════════════════════════════════════════════════════════════════
// 8. Vergelijkingen vastleggen
// ═════════════════════════════════════════════════════════════════════════════
for (const k of ["uC", "vC", "uD", "vD"]) {
  vergelijk(`${k} — vakwerk, exacte doorsnede`, onsExact[k], REF[k], "vergelijkbaar");
}
for (const k of ["uC", "vC", "uD", "vD"]) {
  vergelijk(`${k} — via R11.femp (E·A-surrogaat)`, onsBestand[k], REF[k], "bestand");
}
for (const k of ["uC", "vC", "uD", "vD"]) {
  vergelijk(`${k} — momentvaste variant`, onsStijf[k], REF[k], "raamwerk");
}
for (const k of ["uC", "vC", "uD", "vD"]) {
  vergelijk(`${k} — eigen vakwerkmatrix`, hand[k], REF[k], "hand");
}
vergelijk("vD — eenheidslastmethode", vD_arbeid, REF.vD, "hand");

// ═════════════════════════════════════════════════════════════════════════════
// 9. Eigen controles — staafkrachten en evenwicht (staan niet in de bron)
// ═════════════════════════════════════════════════════════════════════════════
// "Ontbreekt in de bron: staafkrachten en oplegreacties (wel handmatig af te
// leiden — het vakwerk is statisch bepaald)."
const N_app = {
  AC: r.elements.get(1).N, BC: r.elements.get(2).N,
  CD: r.elements.get(3).N, BD: r.elements.get(4).N,
};
log("");
log("── Staafkrachten (N, trek positief) — bron geeft ze niet ────────────────");
for (const k of ["AC", "BC", "CD", "BD"]) {
  const d = (N_app[k] - hand[`N`][k]) / Math.abs(hand[`N`][k]) * 100;
  log(`  ${k}: app ${N_app[k].toFixed(3).padStart(12)} N   eigen matrix ${hand.N[k].toFixed(3).padStart(12)} N   Δ ${d.toExponential(2)} %`);
}

// Knoopevenwicht met de staafkrachten van de app: Σ N·eenheidsvector + F = 0.
function eenheid(vanId, naarId) {
  const a = KNOPEN.find(n => n.id === vanId), b = KNOPEN.find(n => n.id === naarId);
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  return [dx / L, dz / L];
}
const evenwicht = [];
{
  // Knoop C (id 3): staven A–C (naar A), B–C (naar B), C–D (naar D)
  const [cx1, cz1] = eenheid(3, 1), [cx2, cz2] = eenheid(3, 2), [cx3, cz3] = eenheid(3, 4);
  evenwicht.push(["knoop C  ΣFx", N_app.AC * cx1 + N_app.BC * cx2 + N_app.CD * cx3, 0]);
  evenwicht.push(["knoop C  ΣFz", N_app.AC * cz1 + N_app.BC * cz2 + N_app.CD * cz3, 0]);
  // Knoop D (id 4): staven C–D (naar C), B–D (naar B), plus de puntlast
  const [dx1, dz1] = eenheid(4, 3), [dx2, dz2] = eenheid(4, 2);
  evenwicht.push(["knoop D  ΣFx", N_app.CD * dx1 + N_app.BD * dx2, 0]);
  evenwicht.push(["knoop D  ΣFz", N_app.CD * dz1 + N_app.BD * dz2 + F_N, 0]);
}
const rA = r.reactions.get(1), rB = r.reactions.get(2);
evenwicht.push(["reacties ΣFx", rA.fx + rB.fx, 0]);
evenwicht.push(["reacties ΣFz + F", rA.fz + rB.fz + F_N, 0]);
// Momentevenwicht om A (mm en N): Σ(x·Fz − z·Fx) = 0
evenwicht.push([
  "ΣM om A",
  (1000 * rB.fz - 0 * rB.fx) + (2000 * F_N - 1000 * 0),
  0,
]);
// Oplegmomenten: scharnierende opleggingen mogen geen moment afdragen.
evenwicht.push(["oplegmoment A", rA.my, 0]);
evenwicht.push(["oplegmoment B", rB.my, 0]);

log("");
log("── Evenwichtscontroles op onze eigen uitkomst ───────────────────────────");
let evenwichtFout = 0;
for (const [naam, waarde, verwacht] of evenwicht) {
  const tol = 1e-6 * 9810 + 1e-3;   // ruim onder een miljoenste van de belasting
  const ok = Number.isFinite(waarde) && Math.abs(waarde - verwacht) <= tol;
  if (!ok) evenwichtFout++;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(20)} ${waarde.toExponential(3).padStart(12)}`);
}
log("");
log(`  reactie A: fx = ${rA.fx.toFixed(2)} N, fz = ${rA.fz.toFixed(2)} N`);
log(`  reactie B: fx = ${rB.fx.toFixed(2)} N, fz = ${rB.fz.toFixed(2)} N`);

// ═════════════════════════════════════════════════════════════════════════════
// 10. Het letterlijke dossiermodel (alle staafeinden scharnierend)
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("── Alle staafeinden scharnierend (letterlijk zoals het dossier vraagt) ──");
log(`  ${allesScharnierendMelding}`);
log("  → de rotatie-DOF's van de vrije knopen krijgen dan van geen enkele staaf");
log("    stijfheid. Het raamwerkpad van de kern klemt zulke DOF's niet in (het");
log("    plaatpad doet dat wel) en meldt een singulier stelsel.");

// ═════════════════════════════════════════════════════════════════════════════
// 11. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ═══════════════════════════════");
log("");
log("  soort           grootheid                                referentie        onze waarde       Δ [%]");
log("  ──────────────────────────────────────────────────────────────────────────────────────────────────");
for (const g of regels) {
  log(`  ${g.soort.padEnd(14)}  ${g.naam.padEnd(38)}  ${g.ref.toExponential(5).padStart(15)}  ${g.ons.toExponential(5).padStart(15)}  ${g.dPct.toFixed(4).padStart(9)}`);
}

const maxVan = (soort) => Math.max(...regels.filter(g => g.soort === soort).map(g => Math.abs(g.dPct)));
const maxVergelijkbaar = maxVan("vergelijkbaar");
const maxBestand = maxVan("bestand");
const maxRaamwerk = maxVan("raamwerk");
const maxHand = maxVan("hand");

// ── Consistentie van de referentiewaarden zelf ──────────────────────────────
// Drie van de vier referentiewaarden zijn precies de afronding van de exacte
// oplossing op het aantal gedrukte cijfers. v_D niet: die wijkt méér af dan
// zijn eigen gedrukte precisie toelaat (wel ruim binnen de tolerantie van
// 3,0·10^-4 die de bron zelf hanteert). Het fichegetal draagt dus een
// afrondingsrest uit de handmatige verplaatsingsmethode.
log("");
log("── Consistentie van de referentiewaarden zelf ───────────────────────────");
// Uitgedrukt in eenheden van het LAATSTE GEDRUKTE CIJFER van de bron: ≤ 0,5
// betekent zuivere afronding, meer betekent een echte rest in het brongetal.
for (const [k, cijfers] of [["uC", 5], ["vC", 4], ["uD", 6], ["vD", 6]]) {
  const exact = k === "vD" ? vD_arbeid : hand[k];
  const laatsteCijfer = Math.pow(10, Math.floor(Math.log10(Math.abs(REF[k]))) - (cijfers - 1));
  const ulp = Math.abs(exact - REF[k]) / laatsteCijfer;
  log(`  ${k}: exact ${exact.toExponential(9)}   bron ${REF[k].toExponential(Math.max(0, cijfers - 1))}` +
      `   verschil = ${ulp.toFixed(2)} × het laatste gedrukte cijfer` +
      `${ulp <= 0.5 ? "  (zuivere afronding)" : ulp < 2 ? "  (afkapping i.p.v. afronding)" : "  ← meer dan afronding"}`);
}

log("");
log(`  Grootste afwijking vakwerk met exacte doorsnede   : ${maxVergelijkbaar.toFixed(4)} %`);
log(`  Grootste afwijking via het opgeslagen R11.femp    : ${maxBestand.toFixed(4)} %`);
log(`  Grootste afwijking momentvaste variant            : ${maxRaamwerk.toFixed(4)} %`);
log(`  Grootste afwijking eigen vakwerkmatrix (derde partij): ${maxHand.toFixed(4)} %`);
log(`  Evenwichts- en vakwerkcontroles                   : ${evenwichtFout === 0 && vakwerkZuiver ? "alle in orde" : "FOUT"}`);
log("");
log(`  Tolerantie van de bron zelf : ${TOL_BRON_PCT} %`);
log(`  Tolerantie uit het dossier  : ${TOL_DOSSIER_PCT} % (numerieke referentie uit een validatiebundel)`);
log(`  Oordeel: ${maxVergelijkbaar <= TOL_BRON_PCT ? "KOMT OVEREEN (binnen de eigen tolerantie van de bron)" : maxVergelijkbaar <= TOL_DOSSIER_PCT ? "KOMT OVEREEN (binnen de dossiertolerantie)" : "AFWIJKING — uitzoeken"}`);
log("");

const geslaagd = maxVergelijkbaar <= TOL_DOSSIER_PCT
  && maxBestand <= TOL_DOSSIER_PCT
  && evenwichtFout === 0
  && vakwerkZuiver;
process.exit(geslaagd ? 0 : 1);
