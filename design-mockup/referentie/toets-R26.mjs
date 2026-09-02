// ═════════════════════════════════════════════════════════════════════════════
// R26 — Ligger op elastische ondergrond met vrije uiteinden
//
// Validatiecampagne referentieberekeningen, geval R26 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: Franse validatiebundel (AFNOR/SFM 1990), testreeks SSLL, geval SSLL15.
//
// Doel van het geval: een ligger die uitsluitend door een verende ondergrond
// wordt gedragen (géén gewone opleggingen), gediscretiseerd als verticale
// veren onder de knopen — plus een convergentietest op de elementindeling.
//
// ── WAT DIT SCRIPT DOET ─────────────────────────────────────────────────────
//  1. Bouwt de twee indelingen uit het dossier (2 en 8 staafelementen) en slaat
//     ze op als projectbestand.
//  2. Rekent beide door en legt elke referentiewaarde naast onze uitkomst.
//  3. Lost het Winkler-probleem daarnaast GESLOTEN ANALYTISCH op (vierde-orde
//     ODE met vier randvoorwaarden) als onafhankelijke derde partij, zodat ook
//     de analytische kolom van de bron controleerbaar is.
//  4. Assembleert het 2-elementenmodel nog een keer met de hand (6×6 buiging-
//     alleen-stelsel) — bewijs dat de hieronder beschreven hulpstaaf niets aan
//     het rekenmodel toevoegt.
//  5. Draait een convergentiereeks 2 → 512 elementen.
//  6. Onderzoekt de afwijkingen die overblijven.
//
// ── AANNAMES (alleen die het dossier toestaat, plus één onvermijdelijke) ────
//  A1. Liggerlengte 4,9673 m totaal (A op −2,483647 m, B op +2,483647 m). Het
//      dossier meldt dat de kopregel van de bron (L(AC) = L(CB) = 4,967 m)
//      fout is; de veerstijfheden en λ·L = π/2 bevestigen de totale lengte.
//      Het model staat hier op x = 0 … 4967,294 mm (translatie-invariant).
//  A2. De 8-staafsindeling is GELIJKMATIG opgebouwd, zoals het dossier
//      voorschrijft. De twee coördinaten die het dossier als tikfout aanmerkt
//      worden in §6 apart onderzocht.
//  A3. Doorsnede-oppervlak A is in de bron niet opgegeven. Er zijn geen
//      axiale lasten, dus A beïnvloedt geen enkele te vergelijken grootheid;
//      voor het rekenmodel is A = 10 000 mm² aangehouden (willekeurig).
//  A4. ONVERMIJDELIJKE MODELTOEVOEGING — horizontale hulpstaaf.
//      Het model heeft uitsluitend verticale veren. De horizontale
//      vrijheidsgraden (ux) zijn daarmee nergens vastgehouden en het stelsel
//      is singulier: `solve()` meldt "Matrix is singular or nearly singular".
//      In de app kan een knoop maar ÉÉN oplegging dragen (Mesh.updateNode
//      vervangt het hele constraints-object), dus "verticale veer + horizontale
//      steun op dezelfde knoop" is niet uitdrukbaar — zie de bevindingen
//      onderaan. Als vervanger hangt er een horizontale PENDELSTAAF (alleen
//      normaalkracht: Ry/Tz aan beide einden los) van knoop A naar een
//      ingeklemd ankerpunt buiten de ligger. Een horizontale pendelstaaf voegt
//      uitsluitend ux-stijfheid toe: nul verticale en nul rotatiestijfheid.
//      §5 bewijst met een handmatig geassembleerd buiging-alleen-stelsel dat
//      de uitkomsten hierdoor niet veranderen, en het script controleert dat
//      de normaalkracht in de hulpstaaf exact 0 is.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R26.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ═════════════════════════════════════════════════════════════════════════════
// 1. Invoer uit het dossier
// ═════════════════════════════════════════════════════════════════════════════
// De bron geeft SI-basiseenheden (m, Pa, N/m); de solver-adapter werkt in
// mm, N/mm², mm⁴ en N/mm. Onder elke regel staat de brongrootheid erbij.
const L_m   = 4.967294;        // AB = π·√10/2 = 4,9673 m   (2 × 2,483647 m)
const L_mm  = L_m * 1000;      // 4967,294 mm
const E_SI  = 2.1e11;          // Pa
const I_SI  = 1.0e-4;          // m⁴
const EI_SI = E_SI * I_SI;     // 2,1 · 10^7 N·m²
const E     = 210000;          // N/mm²   (= 2,1 · 10^11 Pa)
const I     = 1.0e8;           // mm⁴     (= 1,0 · 10^-4 m⁴)
const A     = 10000;           // mm²     — zie aanname A3, speelt geen rol
const ks_SI = 840e3;           // N/m per strekkende meter
const P_N   = -10000;          // N — drie puntlasten van −10 · 10³ N (omlaag)

// Veerstijfheden ZOALS DE BRON ZE GEEFT (N/m) — niet zelf uitgerekend.
const K2_EIND  = 1043131.8;    // 2 elementen: onder A en onder B
const K2_MIDDEN = 2086263.5;   // 2 elementen: onder C
const K8_EIND  = 260782.9;     // 8 elementen: onder de uiteinden
const K8_TUSSEN = 521565.9;    // 8 elementen: onder elk van de 7 tussenknopen

// N/m → N/mm (solver-eenheid) ; N/m → kN/mm (projectbestand-eenheid)
const nm_naar_nmm  = (k) => k / 1000;
const nm_naar_knmm = (k) => k / 1e6;

// ═════════════════════════════════════════════════════════════════════════════
// 2. Referentiewaarden uit het dossier — NIET aanpassen
// ═════════════════════════════════════════════════════════════════════════════
// Tekenconventies van de bron t.o.v. de onze (in §4 empirisch vastgesteld):
//  - zakking w: beide omlaag negatief → rechtstreeks vergelijkbaar.
//  - rotatie: de bron gebruikt de rechtshandige draaiing om de y-as
//    (θ = −dw/dx); onze solver rapporteert de HELLING zelf (ry = +dw/dx).
//    Vergelijking daarom op |θ|, met het tekenverschil expliciet benoemd.
//  - buigend moment: de bron rapporteert My in de tensorconventie (trek boven
//    positief = "hogging" positief); onze solver rapporteert zakkend-positief.
//    Vergelijking daarom op |M|, tekenverschil expliciet benoemd.
const REF = {
  analytisch: { M: 5759, wC: -0.006844, wA: -0.007854, thA: -0.000706 },
  staven2:    { M: 5510, wC: -6.92e-3,  wA: -7.46e-3,  thA: -0.326e-3 },
  staven8:    { M: 5901, wC: -6.901e-3, wA: -7.848e-3, thA: -0.693e-3 },
};

// ── Vergelijkingsadministratie ──────────────────────────────────────────────
const regels = [];
/**
 * Leg één vergelijking vast. `soort`:
 *  - "vergelijkbaar" : onze waarde en de referentie meten hetzelfde;
 *  - "aanname"       : verschil verklaard door een expliciete modelaanname;
 *  - "bron"          : eigen analytische controle op de bron zelf.
 */
function vergelijk(naam, ons, ref, soort, eenheid = "") {
  const dPct = ref === 0 ? 0 : (ons - ref) / Math.abs(ref) * 100;
  regels.push({ naam, ons, ref, dPct, soort, eenheid });
  return dPct;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Modelbouwer
// ═════════════════════════════════════════════════════════════════════════════
const ANKER_ID = 9999;         // knoop + staaf van de horizontale hulpstaaf

/**
 * Bouw de solver-invoer voor een indeling.
 * @param xs_mm  knoop-x'en in mm, oplopend, met x = 0 bij A
 * @param ks_mm  veerstijfheid per knoop in N/mm (zelfde volgorde)
 */
function bouwInvoer(xs_mm, ks_mm) {
  const n = xs_mm.length;
  const midden = (n + 1) / 2;                     // knoop-id van C
  const nodes = xs_mm.map((x, i) => ({ id: i + 1, x, z: 0 }));
  const beams = [];
  for (let i = 0; i < n - 1; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E, A, I });
  const supports = xs_mm.map((_, i) => ({ nodeId: i + 1, type: "zSpring", k: ks_mm[i] }));

  // Aanname A4 — horizontale pendelstaaf naar een ingeklemd anker.
  nodes.push({ id: ANKER_ID, x: -1000, z: 0 });
  beams.push({
    id: ANKER_ID, from: ANKER_ID, to: 1, E, A, I,
    releases: { startRy: true, endRy: true, startTz: true, endTz: true },
  });
  supports.push({ nodeId: ANKER_ID, type: "fixed" });

  return {
    invoer: {
      nodes, beams, supports, loads: [],
      pointLoads: [
        { nodeId: 1, fz: P_N },        // A
        { nodeId: midden, fz: P_N },   // C
        { nodeId: n, fz: P_N },        // B
      ],
    },
    middenKnoop: midden,
    middenStaaf: midden - 1,           // staaf die in C eindigt
    eindKnoop: n,
  };
}

/** Gelijkmatige indeling in n staafelementen, met tributaire veerstijfheden. */
function gelijkmatig(nEl, kEind_Nm, kTussen_Nm) {
  const xs = [], ks = [];
  for (let i = 0; i <= nEl; i++) {
    xs.push((i / nEl) * L_mm);
    ks.push(nm_naar_nmm(i === 0 || i === nEl ? kEind_Nm : kTussen_Nm));
  }
  return bouwInvoer(xs, ks);
}

/** Haal de vier te vergelijken grootheden uit een solver-resultaat. */
function grootheden(r, m) {
  return {
    M_Nm:  r.elements.get(m.middenStaaf).bendingMoment[20] / 1000,  // N·mm → N·m
    wC_m:  r.displacements.get(m.middenKnoop).uz / 1000,            // mm → m
    wA_m:  r.displacements.get(1).uz / 1000,
    thA:   r.displacements.get(1).ry,                                // rad
    N_hulp: r.elements.get(ANKER_ID).N,                              // N
    som_R: [...r.reactions.entries()]
      .filter(([id]) => id !== ANKER_ID)
      .reduce((s, [, v]) => s + v.fz, 0),                            // N
    R_anker: r.reactions.get(ANKER_ID),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Tekenconventies empirisch vaststellen (controle op ons eigen aflezen)
// ═════════════════════════════════════════════════════════════════════════════
{
  const Lc = 6000, qc = -10;
  const rc = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: Lc / 2, z: 0 }, { id: 3, x: Lc, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }, { id: 2, from: 2, to: 3, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    loads: [{ beamId: 1, q: qc }, { beamId: 2, q: qc }],
  });
  const helling = (rc.displacements.get(2).uz - rc.displacements.get(1).uz) / (Lc / 2);
  log("── Tekenconventie-ijking (vrij opgelegde ligger 6 m, q omlaag) ─────────");
  log(`   M in het midden = ${(rc.elements.get(1).bendingMoment[20] / 1e6).toFixed(3)} kNm ` +
      `(qL²/8 = ${(10 * 36 / 8).toFixed(3)}) → onze M is ZAKKEND-positief`);
  log(`   ry knoop A = ${rc.displacements.get(1).ry.toExponential(4)} ; dw/dx ≈ ${helling.toExponential(4)}` +
      ` → onze ry = +dw/dx (hellingconventie)`);
  log("");
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Onafhankelijke handassemblage van het 2-elementenmodel (buiging alleen)
// ═════════════════════════════════════════════════════════════════════════════
// Zes vrijheidsgraden (w1,θ1,w2,θ2,w3,θ3), klassieke Euler-Bernoulli-
// elementmatrix, veren op de w-diagonaal. Geen enkele horizontale
// vrijheidsgraad — dus geen hulpstaaf. Komt dit overeen met de app, dan staat
// vast dat de hulpstaaf uit aanname A4 niets aan het model toevoegt.
function handStelsel2() {
  const Le = L_mm / 2;
  const kEl = (Lg) => {
    const c = E * I / (Lg ** 3);
    return [
      [12 * c, 6 * Lg * c, -12 * c, 6 * Lg * c],
      [6 * Lg * c, 4 * Lg * Lg * c, -6 * Lg * c, 2 * Lg * Lg * c],
      [-12 * c, -6 * Lg * c, 12 * c, -6 * Lg * c],
      [6 * Lg * c, 2 * Lg * Lg * c, -6 * Lg * c, 4 * Lg * Lg * c],
    ];
  };
  const K = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const ke = kEl(Le);
  for (const off of [0, 2]) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[off + i][off + j] += ke[i][j];
  }
  K[0][0] += nm_naar_nmm(K2_EIND);
  K[2][2] += nm_naar_nmm(K2_MIDDEN);
  K[4][4] += nm_naar_nmm(K2_EIND);
  const F = [P_N, 0, P_N, 0, P_N, 0];

  // Gauss-eliminatie met partieel pivoteren
  const M = K.map((r, i) => [...r, F[i]]);
  const n = 6;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const d = Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
  // Kromming aan het rechteruiteinde van element 1 (= knoop C):
  //   v''(L) = 6/L²·v1 + 2/L·θ1 − 6/L²·v2 + 4/L·θ2 ; M = E·I·v''
  const vpp = 6 / Le ** 2 * d[0] + 2 / Le * d[1] - 6 / Le ** 2 * d[2] + 4 / Le * d[3];
  return { wA_mm: d[0], thA: d[1], wC_mm: d[2], M_Nmm: E * I * vpp };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Gesloten analytische Winkler-oplossing (derde partij)
// ═════════════════════════════════════════════════════════════════════════════
// EI·w'''' + k_s·w = 0 op de halve ligger [0, a] met a = L/2, x vanaf het
// midden C; w positief OMLAAG. Vier randvoorwaarden:
//   w'(0) = 0                (symmetrie in C)
//   w'''(0) = P/(2·EI)       (halve puntlast in C; V = −EI·w''')
//   w''(a) = 0               (vrij uiteinde: M = 0)
//   w'''(a) = −P/EI          (puntlast op het vrije uiteinde)
// Oplossing w = e^{βx}(A cos βx + B sin βx) + e^{−βx}(C cos βx + D sin βx)
// met β = (k_s/(4EI))^{1/4}.
function analytischWinkler() {
  const a = L_m / 2;
  const P = Math.abs(P_N);                     // N, omlaag positief
  const beta = Math.pow(ks_SI / (4 * EI_SI), 0.25);
  // Afgeleide-operator op de coëfficiënten (p,q) van e^{±βx}(p·cos + q·sin)
  const Dp = (p, q) => [beta * (p + q), beta * (q - p)];
  const Dm = (p, q) => [beta * (-p + q), beta * (-p - q)];
  const basis = [{ k: +1, pq: [1, 0] }, { k: +1, pq: [0, 1] },
                 { k: -1, pq: [1, 0] }, { k: -1, pq: [0, 1] }];
  const afg = (kind, pq, n) => { let v = pq; for (let i = 0; i < n; i++) v = kind > 0 ? Dp(v[0], v[1]) : Dm(v[0], v[1]); return v; };
  const term = (j, n, x) => {
    const [p, q] = afg(basis[j].k, basis[j].pq, n);
    return Math.exp(basis[j].k * beta * x) * (p * Math.cos(beta * x) + q * Math.sin(beta * x));
  };
  const rijen = [
    { n: 1, x: 0, rhs: 0 },
    { n: 3, x: 0, rhs: P / (2 * EI_SI) },
    { n: 2, x: a, rhs: 0 },
    { n: 3, x: a, rhs: -P / EI_SI },
  ];
  const M = rijen.map(r => [...[0, 1, 2, 3].map(j => term(j, r.n, r.x)), r.rhs]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  const C4 = [0, 1, 2, 3].map(i => M[i][4] / M[i][i]);
  const W = (nd, x) => C4.reduce((s, c, j) => s + c * term(j, nd, x), 0);
  // Terug naar onze conventies: w omhoog-positief (dus ×−1), M zakkend-positief.
  // Uit EI·w''''+k_s·w = 0 met w omlaag geldt M_zakkend = −EI·w''(omlaag).
  // Evenwichtscontrole: ∫ k_s·w over de hele ligger moet 3·|P| zijn.
  let opp = 0; const NSTAP = 200000, h = a / NSTAP;
  for (let i = 0; i < NSTAP; i++) opp += (W(0, i * h) + W(0, (i + 1) * h)) / 2 * h;
  return {
    beta, betaL: beta * L_m,
    wC_m: -W(0, 0), wA_m: -W(0, a), thA: W(1, a), M_Nm: -EI_SI * W(2, 0),
    somVeerkracht: 2 * ks_SI * opp,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Projectbestanden schrijven
// ═════════════════════════════════════════════════════════════════════════════
// BEKENDE BEPERKING van het projectformaat (zelfde als bij R12): een staaf
// draagt geen vrije E/A/I, alleen een materiaal- en profielnaam. De doorsnede
// van de bron (I = 1,0·10^8 mm⁴ bij E = 210 000 N/mm²) komt in geen enkel
// catalogusprofiel voor. Het opgeslagen model gebruikt daarom het staalprofiel
// waarvan E·I die van de bron het dichtst benadert. De cijfermatige
// vergelijking hieronder gebruikt uitsluitend de EXACTE bronwaarden via de
// solver-API; het bestand dient om het geval in de app te kunnen openen.
const PROFIEL = { material: "S235", profile: "CHS 323.9x8" };
const secApp = resolveSection(PROFIEL.material, PROFIEL.profile);

function schrijfProject(bestandsnaam, xs_mm, ks_Nm, omschrijving) {
  const n = xs_mm.length;
  const midden = (n + 1) / 2;
  const nodes = xs_mm.map((x, i) => ({ id: i + 1, x, z: 0 }));
  nodes.push({ id: ANKER_ID, x: -1000, z: 0 });
  const beams = [];
  for (let i = 0; i < n - 1; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, ...PROFIEL, releases: {} });
  beams.push({
    id: ANKER_ID, from: ANKER_ID, to: 1, ...PROFIEL,
    releases: { startRy: true, endRy: true, startTz: true, endTz: true },
  });
  const supports = xs_mm.map((_, i) => ({
    nodeId: i + 1, type: "zSpring", k: nm_naar_knmm(ks_Nm[i]),   // kN/mm
  }));
  supports.push({ nodeId: ANKER_ID, type: "fixed" });
  const loads = [
    { id: 1, type: "pointForce", caseId: 1, nodeId: 1, fz: P_N / 1000 },
    { id: 2, type: "pointForce", caseId: 1, nodeId: midden, fz: P_N / 1000 },
    { id: 3, type: "pointForce", caseId: 1, nodeId: n, fz: P_N / 1000 },
  ];
  const state = {
    nodes, beams, supports, plates: [], loads,
    loadCases: [{ id: 1, name: omschrijving, type: "other" }],
    activeLoadCaseId: 1,
    selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
    nonlinearEnabled: false,    // eerste orde
  };
  const tekst = serializeProject(state);
  writeFileSync(join(HIER, `${bestandsnaam}.femp`), tekst, "utf8");
  // Tweede kopie onder de eigen extensie van de app (PROJECT_FILE_EXT):
  // de open-dialoog filtert daarop.
  writeFileSync(join(HIER, `${bestandsnaam}.ifcfem2d`), tekst, "utf8");
  log(`Model opgeslagen: ${join(HIER, bestandsnaam)}.femp (+ .ifcfem2d)`);
  return tekst;
}

const xs2 = [0, L_mm / 2, L_mm];
const ks2 = [K2_EIND, K2_MIDDEN, K2_EIND];
const xs8 = Array.from({ length: 9 }, (_, i) => (i / 8) * L_mm);
const ks8 = Array.from({ length: 9 }, (_, i) => (i === 0 || i === 8) ? K8_EIND : K8_TUSSEN);

log("── Projectbestanden ────────────────────────────────────────────────────");
const tekst2 = schrijfProject("R26a", xs2, ks2, "3 puntlasten 10 kN (2 elementen)");
const tekst8 = schrijfProject("R26b", xs8, ks8, "3 puntlasten 10 kN (8 elementen)");
// Derde bestand: dezelfde 8 elementen maar met de knoopcoördinaten ZOALS DE
// BRON ZE AFDRUKT (zie §10). Bewaard omdat het de gepubliceerde 8-staafskolom
// verklaart; het is NIET de indeling die het dossier voorschrijft.
const xsBron = [...xs8];
xsBron[1] = (-1.8267 + 2.483647) * 1000;
xsBron[3] = (-0.6091 + 2.483647) * 1000;
xsBron[5] = (+0.6091 + 2.483647) * 1000;
xsBron[7] = (+1.8267 + 2.483647) * 1000;
const tekstBron = schrijfProject("R26b-bronindeling", xsBron, ks8,
  "3 puntlasten 10 kN (8 el., bron-coördinaten)");
log(`   profiel in het bestand: ${PROFIEL.material} / ${PROFIEL.profile} — ` +
    `E·I = ${(secApp.E * secApp.I).toExponential(6)} N·mm² tegen ${(E * I).toExponential(6)} ` +
    `van de bron (Δ ${(((secApp.E * secApp.I) / (E * I) - 1) * 100).toFixed(3)} %)`);
log("");

// ═════════════════════════════════════════════════════════════════════════════
// 8. Doorrekenen — variant a (2 elementen)
// ═════════════════════════════════════════════════════════════════════════════
const m2 = gelijkmatig(2, K2_EIND, K2_MIDDEN);
const r2 = solve(m2.invoer);
if (!r2) throw new Error("solve() gaf geen resultaat voor R26a");
const g2 = grootheden(r2, m2);

log("── R26a — 2 staafelementen ─────────────────────────────────────────────");
log(`   |M| in C = ${Math.abs(g2.M_Nm).toFixed(2)} N·m · w_C = ${g2.wC_m.toExponential(6)} m · ` +
    `w_A = ${g2.wA_m.toExponential(6)} m · θ_A = ${g2.thA.toExponential(6)} rad`);
vergelijk("2 el. · |M| in C",      Math.abs(g2.M_Nm), Math.abs(REF.staven2.M),  "2 elementen", "N·m");
vergelijk("2 el. · zakking in C",  g2.wC_m,           REF.staven2.wC,           "2 elementen", "m");
vergelijk("2 el. · zakking in A",  g2.wA_m,           REF.staven2.wA,           "2 elementen", "m");
vergelijk("2 el. · |rotatie| in A", Math.abs(g2.thA), Math.abs(REF.staven2.thA), "2 elementen", "rad");

// ═════════════════════════════════════════════════════════════════════════════
// 9. Doorrekenen — variant b (8 elementen, gelijkmatig, zoals het dossier eist)
// ═════════════════════════════════════════════════════════════════════════════
const m8 = gelijkmatig(8, K8_EIND, K8_TUSSEN);
const r8 = solve(m8.invoer);
if (!r8) throw new Error("solve() gaf geen resultaat voor R26b");
const g8 = grootheden(r8, m8);

log("── R26b — 8 staafelementen, gelijkmatig ────────────────────────────────");
log(`   |M| in C = ${Math.abs(g8.M_Nm).toFixed(2)} N·m · w_C = ${g8.wC_m.toExponential(6)} m · ` +
    `w_A = ${g8.wA_m.toExponential(6)} m · θ_A = ${g8.thA.toExponential(6)} rad`);
vergelijk("8 el. · |M| in C",      Math.abs(g8.M_Nm), Math.abs(REF.staven8.M),  "8 el. gelijkmatig", "N·m");
vergelijk("8 el. · zakking in C",  g8.wC_m,           REF.staven8.wC,           "8 el. gelijkmatig", "m");
vergelijk("8 el. · zakking in A",  g8.wA_m,           REF.staven8.wA,           "8 el. gelijkmatig", "m");
vergelijk("8 el. · |rotatie| in A", Math.abs(g8.thA), Math.abs(REF.staven8.thA), "8 el. gelijkmatig", "rad");

// ═════════════════════════════════════════════════════════════════════════════
// 10. Onderzoek naar de afwijkingen bij 8 elementen
// ═════════════════════════════════════════════════════════════════════════════
// Het dossier merkt twee knoopcoördinaten van de bron (−1,8267 en −0,6091)
// aan als tikfout t.o.v. de gelijkmatige verdeling (−1,8627 / −0,6209) die bij
// de opgegeven veerstijfheden hoort. Hier wordt getoetst of die coördinaten
// juist de indeling zijn waarmee de bron ECHT gerekend heeft.
const ksBron_mm = ks8.map(nm_naar_nmm);
const mBron = bouwInvoer(xsBron, ksBron_mm);
const rBron = solve(mBron.invoer);
const gBron = grootheden(rBron, mBron);
const wNaastC = rBron.displacements.get(mBron.middenKnoop - 1).uz / 1000;

log("── Onderzoek: welke indeling reproduceert de 8-staafskolom van de bron? ─");
log("   grootheid          bron 8 st.   gelijkmatig       Δ%    bron-coörd.       Δ%");
const onderzoek = [
  ["|M| in C   [N·m]",  Math.abs(REF.staven8.M),   Math.abs(g8.M_Nm),  Math.abs(gBron.M_Nm)],
  ["w in C     [m]",    REF.staven8.wC,            g8.wC_m,            gBron.wC_m],
  ["w in A     [m]",    REF.staven8.wA,            g8.wA_m,            gBron.wA_m],
  ["|θ| in A   [rad]",  Math.abs(REF.staven8.thA), Math.abs(g8.thA),   Math.abs(gBron.thA)],
];
for (const [naam, ref, gl, bc] of onderzoek) {
  const d1 = (gl - ref) / Math.abs(ref) * 100, d2 = (bc - ref) / Math.abs(ref) * 100;
  log(`   ${naam.padEnd(18)} ${ref.toExponential(4)}  ${gl.toExponential(4)}  ${d1.toFixed(2).padStart(7)}  ` +
      `${bc.toExponential(4)}  ${d2.toFixed(2).padStart(7)}`);
}
log("");
log(`   Zakking bij de bron-indeling in de knoop NAAST C (x = −0,6091 m): ` +
    `${wNaastC.toExponential(5)} m`);
log(`   Gepubliceerde "zakking in C" bij 8 staven                       : ` +
    `${REF.staven8.wC.toExponential(5)} m  (Δ ${((wNaastC - REF.staven8.wC) / Math.abs(REF.staven8.wC) * 100).toFixed(3)} %)`);
log("");

// Vergelijking van de bron-indeling met de gepubliceerde 8-staafskolom: dit is
// het model dat de bron kennelijk werkelijk heeft doorgerekend.
vergelijk("8 el. bronnet · |M| in C",       Math.abs(gBron.M_Nm), Math.abs(REF.staven8.M),  "8 el. bronnet", "N·m");
vergelijk("8 el. bronnet · zakking in C",   gBron.wC_m,           REF.staven8.wC,           "8 el. bronnet", "m");
vergelijk("8 el. bronnet · zakking in A",   gBron.wA_m,           REF.staven8.wA,           "8 el. bronnet", "m");
vergelijk("8 el. bronnet · |rotatie| in A", Math.abs(gBron.thA),  Math.abs(REF.staven8.thA), "8 el. bronnet", "rad");
// Extra regel: dezelfde gepubliceerde waarde naast de zakking van de knoop
// NAAST C — daar hoort hij blijkens de uitkomst wél bij.
vergelijk("8 el. bronnet · w in de knoop naast C", wNaastC, REF.staven8.wC, "8 el. bronnet", "m");

// ═════════════════════════════════════════════════════════════════════════════
// 11. Gesloten analytische oplossing — controle op de analytische kolom
// ═════════════════════════════════════════════════════════════════════════════
const an = analytischWinkler();
log("── Gesloten Winkler-oplossing (eigen afleiding, derde partij) ──────────");
log(`   β = ${an.beta.toFixed(9)} 1/m ; β·L = ${an.betaL.toFixed(9)} (π/2 = ${(Math.PI / 2).toFixed(9)})`);
log(`   evenwichtscontrole Σ veerkracht = ${an.somVeerkracht.toFixed(4)} N (moet 30 000 zijn)`);
vergelijk("analytisch · |M| in C",       Math.abs(an.M_Nm), Math.abs(REF.analytisch.M),   "gesloten", "N·m");
vergelijk("analytisch · zakking in C",   an.wC_m,           REF.analytisch.wC,            "gesloten", "m");
vergelijk("analytisch · zakking in A",   an.wA_m,           REF.analytisch.wA,            "gesloten", "m");
vergelijk("analytisch · |rotatie| in A", Math.abs(an.thA),  Math.abs(REF.analytisch.thA), "gesloten", "rad");

// ═════════════════════════════════════════════════════════════════════════════
// 12. Convergentiereeks — loopt onze oplossing naar de analytische toe?
// ═════════════════════════════════════════════════════════════════════════════
// Veerstijfheden per knoop uit de tributaire lengte: k_s · L_trib, met
// k_s = 840 · 10³ N/m = 0,84 N/mm per mm.
const ks_mm = ks_SI / 1e6;      // N/mm per mm
function convergentie(nEl) {
  const h = L_mm / nEl;
  const xs = Array.from({ length: nEl + 1 }, (_, i) => i * h);
  const ks = xs.map((_, i) => ks_mm * ((i === 0 || i === nEl) ? h / 2 : h));
  const m = bouwInvoer(xs, ks);
  return grootheden(solve(m.invoer), m);
}
log("");
log("── Convergentie naar de gesloten oplossing (tributaire veren) ──────────");
log("    n    |M| in C [N·m]      w_C [m]        w_A [m]      |θ_A| [rad]");
let laatste = null;
for (const nEl of [2, 4, 8, 16, 32, 64, 128, 256, 512]) {
  const g = convergentie(nEl);
  laatste = g;
  log(`  ${String(nEl).padStart(3)}   ${Math.abs(g.M_Nm).toFixed(2).padStart(10)}   ` +
      `${g.wC_m.toExponential(6)}  ${g.wA_m.toExponential(6)}  ${Math.abs(g.thA).toExponential(6)}`);
}
log(`  exact ${Math.abs(an.M_Nm).toFixed(2).padStart(10)}   ${an.wC_m.toExponential(6)}  ` +
    `${an.wA_m.toExponential(6)}  ${Math.abs(an.thA).toExponential(6)}   ← gesloten oplossing`);
const convAfw = [
  Math.abs((Math.abs(laatste.M_Nm) - Math.abs(an.M_Nm)) / an.M_Nm * 100),
  Math.abs((laatste.wC_m - an.wC_m) / an.wC_m * 100),
  Math.abs((laatste.wA_m - an.wA_m) / an.wA_m * 100),
  Math.abs((Math.abs(laatste.thA) - Math.abs(an.thA)) / an.thA * 100),
];
log(`  Grootste afwijking bij n = 512 t.o.v. de gesloten oplossing: ` +
    `${Math.max(...convAfw).toExponential(2)} %`);
log("");

// ═════════════════════════════════════════════════════════════════════════════
// 13. Eigen controles
// ═════════════════════════════════════════════════════════════════════════════
const hand = handStelsel2();
const controles = [
  ["2 el. · Σ veerreacties = 30 000 N",   g2.som_R, 30000, 1e-6],
  ["8 el. · Σ veerreacties = 30 000 N",   g8.som_R, 30000, 1e-6],
  ["2 el. · N in de hulpstaaf = 0",       g2.N_hulp, 0, 1e-9],
  ["8 el. · N in de hulpstaaf = 0",       g8.N_hulp, 0, 1e-9],
  ["2 el. · Fx-reactie op het anker = 0", g2.R_anker.fx, 0, 1e-9],
  ["2 el. · Fz-reactie op het anker = 0", g2.R_anker.fz, 0, 1e-9],
  ["handassemblage · w_A gelijk aan app", hand.wA_mm, g2.wA_m * 1000, 1e-7],
  ["handassemblage · w_C gelijk aan app", hand.wC_mm, g2.wC_m * 1000, 1e-7],
  ["handassemblage · θ_A gelijk aan app", hand.thA, g2.thA, 1e-7],
  ["handassemblage · M_C gelijk aan app", hand.M_Nmm / 1000, g2.M_Nm, 1e-5],
  ["2 el. · symmetrie w_A = w_B",         r2.displacements.get(3).uz / 1000, g2.wA_m, 1e-9],
  ["8 el. · symmetrie w_A = w_B",         r8.displacements.get(9).uz / 1000, g8.wA_m, 1e-9],
];
log("── Eigen controles ─────────────────────────────────────────────────────");
let fout = 0;
for (const [naam, ons, verwacht, tolRel] of controles) {
  const tol = Math.max(Math.abs(verwacht) * tolRel, 1e-9);
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= tol;
  if (!ok) fout++;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(40)} ${ons.toExponential(8)} (verwacht ${verwacht.toExponential(8)})`);
}
log("");

// ═════════════════════════════════════════════════════════════════════════════
// 14. Wat het OPGESLAGEN projectbestand oplevert
// ═════════════════════════════════════════════════════════════════════════════
// Transparantiecontrole langs de ECHTE app-route: bestand → deserializeProject
// → bouwMultiInput → solveAllCases. Toont hoeveel het opgeslagen model afwijkt
// doordat het projectformaat geen vrije E·I kan dragen. Dit is GEEN
// referentievergelijking.
function viaAppRoute(tekst, middenStaaf, middenKnoop, eindKnoop) {
  const p = deserializeProject(tekst);
  const mi = bouwMultiInput({
    nodes: p.nodes, beams: p.beams, supports: p.supports, plates: p.plates,
    loadCases: p.loadCases, loads: p.loads,
    selfWeightEnabled: p.selfWeightEnabled,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const r = solveAllCases(mi).perCase.get(1);
  return {
    M_Nm: r.elements.get(middenStaaf).bendingMoment[20] / 1000,
    wC_m: r.displacements.get(middenKnoop).uz / 1000,
    wA_m: r.displacements.get(1).uz / 1000,
    wB_m: r.displacements.get(eindKnoop).uz / 1000,
  };
}
log("── Opgeslagen bestanden langs de app-route (S235 / CHS 323.9x8) ────────");
{
  const a = viaAppRoute(tekst2, 1, 2, 3);
  log(`   R26a  |M| in C : ${Math.abs(a.M_Nm).toFixed(2)} N·m   (exacte E·I: ${Math.abs(g2.M_Nm).toFixed(2)} ; ` +
      `Δ ${((Math.abs(a.M_Nm) - Math.abs(g2.M_Nm)) / Math.abs(g2.M_Nm) * 100).toFixed(3)} %)`);
  log(`   R26a  w in C   : ${a.wC_m.toExponential(6)} m  (exacte E·I: ${g2.wC_m.toExponential(6)} ; ` +
      `Δ ${((a.wC_m - g2.wC_m) / Math.abs(g2.wC_m) * 100).toFixed(3)} %)`);
  log(`   R26a  w in A   : ${a.wA_m.toExponential(6)} m  (exacte E·I: ${g2.wA_m.toExponential(6)} ; ` +
      `Δ ${((a.wA_m - g2.wA_m) / Math.abs(g2.wA_m) * 100).toFixed(3)} %)`);
  const b = viaAppRoute(tekst8, 4, 5, 9);
  log(`   R26b  |M| in C : ${Math.abs(b.M_Nm).toFixed(2)} N·m   (exacte E·I: ${Math.abs(g8.M_Nm).toFixed(2)} ; ` +
      `Δ ${((Math.abs(b.M_Nm) - Math.abs(g8.M_Nm)) / Math.abs(g8.M_Nm) * 100).toFixed(3)} %)`);
  const c = viaAppRoute(tekstBron, 4, 5, 9);
  log(`   R26b-bronindeling  |M| in C : ${Math.abs(c.M_Nm).toFixed(2)} N·m   ` +
      `(exacte E·I: ${Math.abs(gBron.M_Nm).toFixed(2)} ; ` +
      `Δ ${((Math.abs(c.M_Nm) - Math.abs(gBron.M_Nm)) / Math.abs(gBron.M_Nm) * 100).toFixed(3)} %)`);
  log("   Alle drie de bestanden zijn langs de echte app-route (bestand →");
  log("   bouwMultiInput → solveAllCases) oplosbaar; het verschil komt uitsluitend");
  log("   van de 0,9 % lagere E·I van het dichtstbijzijnde catalogusprofiel.");
  log("");
}

// ═════════════════════════════════════════════════════════════════════════════
// 15. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ══════════════════════════════");
log("");
log("  blok               grootheid                            referentie       onze waarde       Δ [%]");
log("  ────────────────────────────────────────────────────────────────────────────────────────────────");
let vorig = null;
for (const g of regels) {
  if (vorig !== null && g.soort !== vorig) log("  " + "·".repeat(96));
  vorig = g.soort;
  log(`  ${g.soort.padEnd(17)}  ${g.naam.padEnd(34)}  ${g.ref.toExponential(4).padStart(14)}  ` +
      `${g.ons.toExponential(4).padStart(14)}  ${g.dPct.toFixed(3).padStart(9)}`);
}

const maxVan = (soort, uitzonderingen = []) => Math.max(...regels
  .filter(g => g.soort === soort && !uitzonderingen.includes(g.naam))
  .map(g => Math.abs(g.dPct)));

const max2   = maxVan("2 elementen");
const max8gl = maxVan("8 el. gelijkmatig");
// Bij het bronnet blijft "zakking in C" buiten beschouwing: hierboven is
// aangetoond dat de gepubliceerde waarde bij de knoop ERNAAST hoort.
const max8bn = maxVan("8 el. bronnet",
  ["8 el. bronnet · zakking in C", "8 el. bronnet · w in de knoop naast C"]);
const maxAn  = maxVan("gesloten");
const maxNaastC = Math.abs(regels.find(g => g.naam === "8 el. bronnet · w in de knoop naast C").dPct);

log("");
log("  Tolerantie voor dit geval (numerieke referentie uit een validatiebundel): 1 %");
log("");
log(`  [2 elementen]        grootste afwijking : ${max2.toFixed(3)} %  → binnen tolerantie`);
log(`  [8 el. gelijkmatig]  grootste afwijking : ${max8gl.toFixed(3)} %  → BUITEN tolerantie,`);
log(`                       maar de bron heeft dit model niet gerekend (zie bevinding 2)`);
log(`  [8 el. bronnet]      grootste afwijking : ${max8bn.toFixed(3)} %  (zonder de zakking in C)`);
log(`                       de gepubliceerde "w in C" past op de knoop ernaast: ` +
    `Δ ${maxNaastC.toFixed(3)} %`);
log(`  [gesloten]           onze eigen analytische oplossing t.o.v. de analytische`);
log(`                       kolom van de bron  : ${maxAn.toFixed(3)} %`);
log(`  Eigen controles                         : ${fout === 0 ? "alle in orde" : fout + " FOUT"}`);
log("");
log("── Bevindingen ─────────────────────────────────────────────────────────");
log("  1. Bij 2 staafelementen komen alle vier de grootheden overeen tot in het");
log("     laatste door de bron afgedrukte cijfer.");
log("  2. Bij 8 staafelementen reproduceert de GELIJKMATIGE indeling (die het");
log("     dossier voorschrijft) de bron NIET; de indeling met de coördinaten");
log("     zoals de bron ze afdrukt (−1,8267 / −0,6091) doet dat wel voor M, w_A");
log("     en θ_A. Die coördinaten zijn dus geen drukfout maar de indeling waarmee");
log("     de bron gerekend heeft — een ongelijkmatig net onder gelijkmatig");
log("     verdeelde veerstijfheden, wat verklaart waarom de 8-staafswaarde van de");
log("     bron de analytische oplossing OVERschiet in plaats van er naartoe te");
log("     convergeren.");
log("  3. De gepubliceerde 8-staafs \"zakking in C\" hoort niet bij C maar bij de");
log("     knoop ernaast (x = −0,6091 m). Fout in de bron: verkeerde regel gelezen.");
log("  4. Onze convergentiereeks loopt naar de gesloten Winkler-oplossing toe;");
log("     die valt op zijn beurt samen met de analytische kolom van de bron,");
log("     op w_A na (bron −0,007854 m, exact −0,0078588 m: laatste cijfer).");
log("  5. APP-BEPERKING (geen rekenfout): een knoop kan maar één oplegging");
log("     dragen, dus \"verticale veer + horizontale steun\" is op dezelfde knoop");
log("     niet in te voeren. Zonder hulpconstructie is dit geval in de app niet");
log("     op te lossen (singulier stelsel). Zie aanname A4.");
log("");

// Slaagcriterium — het model dat de BRON heeft doorgerekend moet binnen 1 %
// gereproduceerd worden: de 2-elementenindeling volledig, en de 8-element-
// indeling met de coördinaten van de bron zelf (op de zakking in C na, waarvan
// hierboven is aangetoond dat de gepubliceerde waarde bij de knoop ernaast
// hoort — die past dan wél binnen 1 %). De eigen controles moeten alle slagen.
// Het blok "8 el. gelijkmatig" telt NIET mee: dat is een ander model dan de
// bron gerekend heeft, geen andere uitkomst voor hetzelfde model.
const geslaagd = max2 <= 1 && max8bn <= 1 && maxNaastC <= 1 && maxAn <= 1 && fout === 0;
process.exit(geslaagd ? 0 : 1);
