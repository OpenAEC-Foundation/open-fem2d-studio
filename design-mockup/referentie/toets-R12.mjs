// ═════════════════════════════════════════════════════════════════════════════
// R12 — Korte ligger 1,44 m onder lijnlast, met en zonder dwarskrachtvervorming
//
// Validatiecampagne referentieberekeningen, geval R12 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: Franse validatiebundel (AFNOR/SFM 1990), testreeks SSLL, geval SSLL02.
//
// Doel van het geval: de dwarskrachtvervorming (Timoshenko) los toetsen van de
// zuivere buigingsvervorming (Bernoulli). Het is een bewust GEDRONGEN ligger
// (h/L groot), zodat de afschuifbijdrage niet verwaarloosbaar is.
//
// AANNAME (zoals het dossier voorschrijft): Open FEM2D Studio rekent met
// EULER-BERNOULLI-staafelementen — zie src/core/fem/Beam.ts, functie
// calculateBeamLocalStiffness: de 6x6-matrix bevat uitsluitend de klassieke
// EA/L- en EI/L^n-termen, geen afschuifparameter Phi = 12·E·I/(G·A_s·L²).
// Er is nergens in src/ een afschuifoppervlak, een dwarskrachtfactor of een
// Timoshenko-optie. Alleen de referentiewaarde ZONDER dwarskrachtvervorming
// is dus rechtstreeks vergelijkbaar. De afwijking ten opzichte van de waarde
// MET dwarskrachtvervorming is per definitie `AANNAME`, geen solverfout.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R12.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject } = await import("../src/io/projectFile.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ── Invoer uit het dossier, omgerekend naar de adaptereenheden (mm / N / kN) ──
// De bron geeft SI-basis (m, Pa, N/m); de solver-adapter werkt in mm, N/mm²,
// mm², mm⁴ en kN/m. Onder elke regel staat de brongrootheid erbij.
const L_mm = 1440;            // L(AB) = 1,44 m
const E_Nmm2 = 200000;        // E = 2,0 · 10^11 Pa
const NU = 0.3;               // nu = 0,3
const A_mm2 = 3100;           // A  = 31,0 · 10^-4 m²
const I_mm4 = 2.81e7;         // Izz = 2 810,0 · 10^-8 m⁴ (= 2810 cm⁴)
const SRY = 2.42;             // dwarskrachtfactor A / A_afschuiving
const q_kNm = -100;           // q = −1,0 · 10^5 N/m = −100 kN/m (omlaag)
const q_Nmm = -100;           // dezelfde last in N/mm (1 kN/m = 1 N/mm)

// G volgt uit E en nu; de bron noemt hem apart (7,6923 · 10^10 Pa).
const G_Nmm2 = E_Nmm2 / (2 * (1 + NU));   // = 76 923,08 N/mm²

// ── Referentiewaarden uit het dossier (NIET aanpassen) ──────────────────────
const REF = {
  wC_met:    -1.25926e-3,   // m — zakking in C MET dwarskrachtvervorming
  wC_zonder: -0.9962e-3,    // m — zakking in C ZONDER dwarskrachtvervorming
  v1:         9.962e-4,     // m — deelbijdrage buiging  5qL⁴/(384·E·Izz)
  v2:         2.630e-4,     // m — deelbijdrage afschuiving qL²·SRY/(8·A·G)
};

// ── Vergelijkingsadministratie ──────────────────────────────────────────────
const regels = [];
/**
 * Leg één vergelijking vast. `soort`:
 *  - "vergelijkbaar": onze waarde en de referentie meten hetzelfde;
 *  - "aanname": de app kent het verschijnsel niet, verschil is verklaard;
 *  - "hand": eigen handafleiding als derde partij (geen app-uitkomst).
 */
function vergelijk(naam, onsSI, refSI, soort, eenheid = "m") {
  const dPct = refSI === 0 ? 0 : (onsSI - refSI) / Math.abs(refSI) * 100;
  regels.push({ naam, ons: onsSI, ref: refSI, dPct, soort, eenheid });
  return dPct;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Model opbouwen — knopen A (x=0), C (x=720, midden), B (x=1440)
// ═════════════════════════════════════════════════════════════════════════════
// Beide opleggingen scharnierend: verticaal én horizontaal vast, rotatie vrij
// ("pinned"). Dat maakt het stelsel axiaal statisch onbepaald, maar bij zuiver
// transversale belasting en lineaire theorie is N = 0 — hieronder gecontroleerd.
const invoer = {
  nodes: [
    { id: 1, x: 0,      z: 0 },   // A
    { id: 2, x: L_mm / 2, z: 0 }, // C — midden, waar de zakking gemeten wordt
    { id: 3, x: L_mm,   z: 0 },   // B
  ],
  beams: [
    { id: 1, from: 1, to: 2, E: E_Nmm2, A: A_mm2, I: I_mm4 },
    { id: 2, from: 2, to: 3, E: E_Nmm2, A: A_mm2, I: I_mm4 },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 3, type: "pinned" },
  ],
  // Gelijkmatig verdeelde lijnlast over de VOLLE lengte, dus op beide staven.
  loads: [
    { beamId: 1, q: q_Nmm },
    { beamId: 2, q: q_Nmm },
  ],
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Model opslaan als projectbestand
// ═════════════════════════════════════════════════════════════════════════════
// LET OP — bekende beperking van het projectformaat: een staaf in het
// projectbestand draagt geen vrije E/A/I, alleen een materiaal- en profielnaam
// (femTypes.Beam → lib/sectionResolver.resolveSection). De fictieve doorsnede
// van de bron (A = 3100 mm², I = 2,81·10^7 mm⁴ bij E = 200 000 N/mm²) komt in
// geen enkel catalogusprofiel voor. Het opgeslagen model gebruikt daarom het
// profiel waarvan de BUIGSTIJFHEID E·I die van de bron het dichtst benadert
// (UPE 220 in S235: E·I wijkt 0,23 % af). De cijfermatige vergelijking hieronder
// gebruikt uitsluitend de EXACTE bronwaarden via de solver-API; het bestand is
// bedoeld om het geval in de app te kunnen openen en bekijken.
const PROFIEL = { material: "S235", profile: "UPE220" };
const secApp = resolveSection(PROFIEL.material, PROFIEL.profile);

const projectState = {
  nodes: invoer.nodes,
  beams: [
    { id: 1, from: 1, to: 2, ...PROFIEL },
    { id: 2, from: 2, to: 3, ...PROFIEL },
  ],
  supports: invoer.supports,
  plates: [],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: q_kNm },
    { id: 2, type: "lineLoad", caseId: 1, beamId: 2, q: q_kNm },
  ],
  loadCases: [{ id: 1, name: "q = 100 kN/m", type: "other" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // de bron rekent expliciet zonder eigen gewicht
  nonlinearEnabled: false,    // eerste orde
};
const projectTekst = serializeProject(projectState);
const pad = join(HIER, "R12.femp");
writeFileSync(pad, projectTekst, "utf8");
log(`Model opgeslagen: ${pad}`);
// Tweede kopie onder de eigen extensie van de app (PROJECT_FILE_EXT =
// "ifcfem2d"): de open-dialoog van de app filtert daarop, waardoor een
// .femp-bestand niet in de lijst verschijnt. Zelfde inhoud, ander achtervoegsel.
const padApp = join(HIER, "R12.ifcfem2d");
writeFileSync(padApp, projectTekst, "utf8");
log(`Zelfde model voor de open-dialoog van de app: ${padApp}`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. Doorrekenen met de EXACTE doorsnede uit de bron
// ═════════════════════════════════════════════════════════════════════════════
const r = solve(invoer);
if (!r) throw new Error("solve() gaf geen resultaat");

const wC_mm = r.displacements.get(2)?.uz;          // mm, omlaag negatief
const wC_m = wC_mm / 1000;                          // → m, zoals de bron

// ═════════════════════════════════════════════════════════════════════════════
// 4. Vergelijken met de referentiewaarden
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("── R12 — zakking in C ───────────────────────────────────────────────────");

// (a) ZONDER dwarskrachtvervorming — dit is wat onze Bernoulli-solver berekent.
vergelijk("w_C zonder dwarskrachtvervorming", wC_m, REF.wC_zonder, "vergelijkbaar");

// (b) Deelbijdrage buiging v1 — dezelfde grootheid als (a), maar de bron geeft
//     hem als positieve deelbijdrage. Vergelijk op absolute waarde.
vergelijk("deelbijdrage buiging v1", Math.abs(wC_m), REF.v1, "vergelijkbaar");

// (c) MET dwarskrachtvervorming — NIET nabouwbaar (Euler-Bernoulli).
//     De afwijking is de ontbrekende afschuifbijdrage; verwacht ≈ −21 %.
vergelijk("w_C MET dwarskrachtvervorming", wC_m, REF.wC_met, "aanname");

// (d) Deelbijdrage afschuiving v2 — de app levert hier per definitie 0.
vergelijk("deelbijdrage afschuiving v2", 0, REF.v2, "aanname");

// ═════════════════════════════════════════════════════════════════════════════
// 5. Onafhankelijke handafleiding als derde partij
// ═════════════════════════════════════════════════════════════════════════════
// De gesloten formules staan in het dossier zelf; ze worden hier NIET uit de
// referentiegetallen afgeleid maar uit de INVOER opnieuw uitgerekend, zodat de
// interne consistentie van de bron controleerbaar is.
const q = Math.abs(q_Nmm);
const v1_hand_mm = 5 * q * Math.pow(L_mm, 4) / (384 * E_Nmm2 * I_mm4);
const v2_hand_mm = q * L_mm * L_mm * SRY / (8 * A_mm2 * G_Nmm2);
const vtot_hand_mm = v1_hand_mm + v2_hand_mm;

log("");
log("── Handafleiding uit de invoer (derde partij) ───────────────────────────");
vergelijk("v1 handformule 5qL⁴/(384·E·I)", v1_hand_mm / 1000, REF.v1, "hand");
vergelijk("v2 handformule qL²·SRY/(8·A·G)", v2_hand_mm / 1000, REF.v2, "hand");
vergelijk("v1 + v2 = totale zakking", -vtot_hand_mm / 1000, REF.wC_met, "hand");

// ═════════════════════════════════════════════════════════════════════════════
// 6. Interne controles op ons eigen model (geen referentiewaarden in de bron —
//    "ontbreekt in de bron: momenten, dwarskrachten en oplegreacties")
// ═════════════════════════════════════════════════════════════════════════════
const R_exact = q * L_mm / 2;                    // = 72 000 N
const M_exact = q * L_mm * L_mm / 8;             // = 25,92 · 10^6 N·mm
const rA = r.reactions.get(1), rB = r.reactions.get(3);
const M_mid = r.elements.get(1)?.bendingMoment?.[20];   // laatste station staaf 1 = x = 720 mm
const N_staaf = r.elements.get(1)?.N;

const eigenControles = [
  ["R_A = qL/2 = 72,000 kN", rA?.fz ?? NaN, R_exact],
  ["R_B = qL/2 = 72,000 kN", rB?.fz ?? NaN, R_exact],
  ["M_C = qL²/8 = 25,920 kNm", M_mid ?? NaN, M_exact],
  ["N = 0 (geen axiale last)", N_staaf ?? NaN, 0],
  ["ΣFx-reacties = 0", (rA?.fx ?? 0) + (rB?.fx ?? 0), 0],
];

log("");
log("── Eigen evenwichtscontroles (bron geeft deze waarden niet) ─────────────");
let eigenFout = 0;
for (const [naam, ons, verwacht] of eigenControles) {
  const tol = Math.max(Math.abs(verwacht) * 1e-9, 1e-6);
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= tol;
  if (!ok) eigenFout++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${ons.toExponential(6)} (verwacht ${verwacht.toExponential(6)})`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Meshverfijning — is de zakking netverfijningsonafhankelijk?
// ═════════════════════════════════════════════════════════════════════════════
// Voor een Bernoulli-element met exacte particuliere oplossing hoort dit exact
// hetzelfde te geven; een verschil zou op een fout in de elementbelasting wijzen.
function zakkingMidden(nEl) {
  const nodes = [], beams = [], loads = [];
  for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: (i / nEl) * L_mm, z: 0 });
  for (let i = 0; i < nEl; i++) {
    beams.push({ id: i + 1, from: i + 1, to: i + 2, E: E_Nmm2, A: A_mm2, I: I_mm4 });
    loads.push({ beamId: i + 1, q: q_Nmm });
  }
  const rr = solve({
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: nEl + 1, type: "pinned" }],
    loads,
  });
  return rr.displacements.get(nEl / 2 + 1)?.uz;   // knoop op x = L/2
}
log("");
log("── Netverfijning (moet constant zijn) ───────────────────────────────────");
for (const nEl of [2, 4, 12, 48]) {
  const w = zakkingMidden(nEl);
  const afw = (w - wC_mm) / Math.abs(wC_mm) * 100;
  log(`  ${String(nEl).padStart(2)} elementen: w_C = ${w.toFixed(9)} mm  (Δ ${afw.toExponential(2)} %)`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. Wat het OPGESLAGEN projectbestand oplevert (profiel uit de catalogus)
// ═════════════════════════════════════════════════════════════════════════════
// Transparantiecontrole: het .femp-bestand kan de fictieve doorsnede van de
// bron niet dragen. Hier wordt zichtbaar gemaakt hoeveel het opgeslagen model
// daardoor afwijkt — dit is GEEN referentievergelijking.
const rApp = solve({
  ...invoer,
  beams: invoer.beams.map(b => ({ ...b, E: secApp.E, A: secApp.A, I: secApp.I })),
});
const wApp_m = (rApp.displacements.get(2)?.uz ?? NaN) / 1000;
log("");
log("── Opgeslagen model (S235 / UPE 220, dichtstbijzijnde E·I) ──────────────");
log(`  E·I bron : ${(E_Nmm2 * I_mm4).toExponential(6)} N·mm²`);
const dEIpct = ((secApp.E * secApp.I) / (E_Nmm2 * I_mm4) - 1) * 100;
log(`  E·I model: ${(secApp.E * secApp.I).toExponential(6)} N·mm²  (Δ ${dEIpct.toFixed(3)} %)`);
log(`  w_C model: ${wApp_m.toExponential(6)} m  (Δ t.o.v. referentie zonder afschuiving: ${((wApp_m - REF.wC_zonder) / Math.abs(REF.wC_zonder) * 100).toFixed(3)} %)`);

// ═════════════════════════════════════════════════════════════════════════════
// 9. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ═══════════════════════════════");
log("");
log("  soort            grootheid                             referentie        onze waarde       Δ [%]");
log("  ───────────────────────────────────────────────────────────────────────────────────────────────");
for (const g of regels) {
  const soort = g.soort.padEnd(15);
  log(`  ${soort}  ${g.naam.padEnd(36)}  ${g.ref.toExponential(5).padStart(15)}  ${g.ons.toExponential(5).padStart(15)}  ${g.dPct.toFixed(3).padStart(9)}`);
}

const vergelijkbaar = regels.filter(g => g.soort === "vergelijkbaar");
const maxAfwVergelijkbaar = Math.max(...vergelijkbaar.map(g => Math.abs(g.dPct)));
const aannameRegels = regels.filter(g => g.soort === "aanname");
const maxAfwAanname = Math.max(...aannameRegels.map(g => Math.abs(g.dPct)));

log("");
log(`  Grootste afwijking op de VERGELIJKBARE grootheden : ${maxAfwVergelijkbaar.toFixed(4)} %`);
log(`  Grootste afwijking op de AANNAME-grootheden       : ${maxAfwAanname.toFixed(2)} % (ontbrekende dwarskrachtvervorming)`);
log(`  Eigen evenwichtscontroles                         : ${eigenFout === 0 ? "alle in orde" : eigenFout + " FOUT"}`);
log("");
log("  Tolerantie voor dit geval (numerieke referentie uit een validatiebundel): 1 %");
log(`  Oordeel op de vergelijkbare grootheden: ${maxAfwVergelijkbaar <= 1 ? "KOMT OVEREEN" : "AFWIJKING — uitzoeken"}`);
log("");

process.exit(maxAfwVergelijkbaar <= 1 && eigenFout === 0 ? 0 : 1);
