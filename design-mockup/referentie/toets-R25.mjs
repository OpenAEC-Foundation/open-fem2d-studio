// ═════════════════════════════════════════════════════════════════════════════
// R25 — Doorgaande ligger 12 m op drie steunpunten, middensteunpunt op een
//       verticale veer
//
// Validatiecampagne referentieberekeningen, geval R25 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Bron: Franse validatiebundel (AFNOR/SFM 1990), testreeks SSLL, geval SSLL03.
//
// Doel van het geval: de VEEROPLEGGING toetsen. De constructie is éénvoudig
// statisch onbepaald; de graad van onbepaaldheid zit volledig in de veer.
// Een fout in de veerstijfheid, in de eenheidsconversie van k, of in het
// aanhaken van de veer aan de juiste vrijheidsgraad valt hier meteen op:
// bij k → 0 zou de veerreactie naar 0 lopen, bij k → ∞ naar 57 750 N.
// De referentie ligt daar precies tussenin (21 000 N).
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R25.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { resolveSection, TIMBER_E_MEAN } = await import("../src/lib/sectionResolver.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ═════════════════════════════════════════════════════════════════════════════
// 0. Invoer uit het dossier, omgerekend naar de adaptereenheden (mm / N / kN)
// ═════════════════════════════════════════════════════════════════════════════
// De bron geeft SI-basis (m, Pa, N, N/m); de solver-adapter werkt in mm, N,
// N/mm², mm², mm⁴ en (in het projectbestand) kN en kN/mm. Achter elke regel
// staat de brongrootheid.
const L_TOT_mm = 12000;        // 4L = 12 m, A op x = 0 · B op x = 6 · C op x = 12
const X_LAST1_mm = 3000;       // eerste puntlast op x = 3 m
const X_MIDDEN_mm = 6000;      // veerknoop B op x = 6 m
const X_LAST2_mm = 9000;       // tweede puntlast op x = 9 m

const E_Nmm2 = 210000;         // E   = 2,1 · 10^11 Pa
const I_mm4 = 6.3e8;           // Izz = 6,3 · 10^-4 m⁴   (1 m⁴ = 10^12 mm⁴)
const A_mm2 = 1.0e4;           // A   = 1,0 · 10^-2 m²   (1 m² = 10^6 mm²)

const KY_Nm = 2.1e6;           // Ky = 2,1 · 10^6 N/m — verticale veer onder B
const KY_Nmm = KY_Nm / 1000;   // → 2 100 N/mm  (adaptereenheid, SolverSupportInput.k)
const KY_kNmm = KY_Nmm / 1000; // → 2,1 kN/mm   (modelbestand-eenheid, Support.k)

const F_N = -42e3;             // F = −42 · 10³ N (42 kN omlaag) op x = 3 en x = 9
const F_kN = F_N / 1000;       // → −42 kN

// Buigstijfheid in beide eenheidsstelsels — voor de handafleiding hieronder.
const EI_Nmm2 = E_Nmm2 * I_mm4;      // 1,323 · 10^14 N·mm²
const EI_Nm2 = EI_Nmm2 / 1e6;        // 1,323 · 10^8  N·m²  (zoals de bron noemt)

// ── Referentiewaarden uit het dossier (NIET aanpassen) ──────────────────────
const REF = {
  wB_m: -0.010,      // m — doorbuiging in B (veerknoop)
  Rveer_N: 21000,    // N — reactiekracht in de veer
};

// ── Vergelijkingsadministratie ──────────────────────────────────────────────
const regels = [];
/**
 * Leg één vergelijking vast. `soort`:
 *  - "vergelijkbaar": onze waarde en de referentie meten hetzelfde;
 *  - "hand": eigen handafleiding als derde partij (geen app-uitkomst).
 */
function vergelijk(naam, ons, ref, soort, eenheid) {
  const dPct = ref === 0 ? (ons === 0 ? 0 : Infinity) : (ons - ref) / Math.abs(ref) * 100;
  regels.push({ naam, ons, ref, dPct, soort, eenheid });
  return dPct;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Model opbouwen
// ═════════════════════════════════════════════════════════════════════════════
// Knopen: A(1) op x = 0 · lastpunt(2) op 3 m · B(3) op 6 m · lastpunt(4) op 9 m
// · C(5) op 12 m. De lastpunten krijgen een eigen knoop, zodat de puntlasten
// gewone knooplasten zijn en de M/V-diagrammen hun knik/sprong op de juiste
// plek tonen.
const KNOPEN = [
  { id: 1, x: 0,           z: 0 },   // A
  { id: 2, x: X_LAST1_mm,  z: 0 },   // lastpunt links
  { id: 3, x: X_MIDDEN_mm, z: 0 },   // B — veerknoop
  { id: 4, x: X_LAST2_mm,  z: 0 },   // lastpunt rechts
  { id: 5, x: L_TOT_mm,    z: 0 },   // C
];

const STAVEN = [
  { id: 1, from: 1, to: 2 },
  { id: 2, from: 2, to: 3 },
  { id: 3, from: 3, to: 4 },
  { id: 4, from: 4, to: 5 },
];

// Opleggingen — de bron: "A en C verticaal ondersteund, rotatie vrij; B:
// verticale veer Ky naar een vast punt; horizontale verplaatsing uitgeschakeld".
// AANNAME: de horizontale onderdrukking wordt met ÉÉN x-vasthouding gedaan
// (A scharnierend, C verticale rol). Er is geen enkele horizontale of axiale
// belasting, dus N = 0 en de keuze tussen "één x vast" en "beide x vast" is
// rekenkundig zonder gevolg — dat wordt in §5 numeriek gecontroleerd (N = 0
// én R_x = 0). Twee x-vasthoudingen zouden de ligger axiaal statisch onbepaald
// maken zonder dat er iets te verdelen valt.
const OPLEGGINGEN = [
  { nodeId: 1, type: "pinned" },                      // A: x + z vast, rotatie vrij
  { nodeId: 3, type: "zSpring", k: KY_Nmm },          // B: verticale veer, k in N/mm
  { nodeId: 5, type: "zRoller" },                      // C: alleen z vast, rotatie vrij
];

const PUNTLASTEN = [
  { nodeId: 2, fz: F_N },
  { nodeId: 4, fz: F_N },
];

// Invoer met de EXACTE doorsnede van de bron — hiermee wordt vergeleken.
const invoerExact = {
  nodes: KNOPEN,
  beams: STAVEN.map(s => ({ ...s, E: E_Nmm2, A: A_mm2, I: I_mm4 })),
  supports: OPLEGGINGEN,
  loads: [],
  pointLoads: PUNTLASTEN,
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Model opslaan als projectbestand (surrogaatdoorsnede met gelijke E·A én E·I)
// ═════════════════════════════════════════════════════════════════════════════
// Bekende beperking van het projectformaat: een staaf draagt geen vrije E/A/I,
// alleen een materiaal- en profielnaam (femTypes.Beam → sectionResolver).
// De bron geeft een FICTIEVE doorsnede (A = 1,0·10^-2 m², I = 6,3·10^-4 m⁴)
// die in geen enkele catalogus voorkomt; het dichtstbijzijnde stalen profiel
// (HEA 450) wijkt 1,1 % in I af — juist op de grootheid waar dit geval om
// draait.
//
// Daarom dezelfde route als bij R11: de houten-rechthoekroute is de enige die
// een VRIJE doorsnede toelaat (A = b·h, I = b·h³/12, E = E_0,mean van de
// sterkteklasse). Met twee vergelijkingen en twee onbekenden zijn b en h zó te
// kiezen dat E·A én E·I allebei exact die van de bron zijn:
//     b·h        = E_bron · A_bron / E_klasse
//     b·h³ / 12  = E_bron · I_bron / E_klasse
// ⇒   h = √(12 · I_bron / A_bron),  b = (E_bron/E_klasse) · A_bron / h
// Het "materiaal" in het bestand is dus een rekentechnisch surrogaat, geen
// uitspraak over de werkelijke materiaalsoort van de bron (die geeft er geen).
const KLASSE = "GL36h";
const E_KLASSE = TIMBER_E_MEAN[KLASSE];                  // 14 700 N/mm²
const h_sur = Math.sqrt(12 * I_mm4 / A_mm2);             // mm — hoogte
const b_sur = (E_Nmm2 / E_KLASSE) * A_mm2 / h_sur;       // mm — breedte
const PROFIEL = `${b_sur.toFixed(6)}x${h_sur.toFixed(6)}`;

const projectState = {
  nodes: KNOPEN,
  beams: STAVEN.map(s => ({ ...s, material: KLASSE, profile: PROFIEL })),
  // In het modelbestand is k van een translatieveer in kN/mm (femTypes.Support).
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 3, type: "zSpring", k: KY_kNmm },
    { nodeId: 5, type: "zRoller" },
  ],
  plates: [],
  loads: [
    { id: 1, type: "pointForce", caseId: 1, nodeId: 2, fx: 0, fz: F_kN },
    { id: 2, type: "pointForce", caseId: 1, nodeId: 4, fx: 0, fz: F_kN },
  ],
  loadCases: [{
    id: 1,
    // De naam draagt de waarschuwing mee: wie het bestand in de app opent,
    // ziet meteen dat de doorsnede een E·A/E·I-surrogaat is.
    name: "2 × F = 42 kN (R25 — doorsnede is E·A/E·I-surrogaat, zie toets-R25.mjs)",
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
const pad = join(HIER, "R25.femp");
writeFileSync(pad, projectTekst, "utf8");
log(`Model opgeslagen: ${pad}`);
// Tweede kopie onder de eigen extensie van de app (PROJECT_FILE_EXT =
// "ifcfem2d"): de open-dialoog filtert daarop, waardoor een .femp-bestand
// niet in de lijst verschijnt. Zelfde inhoud, ander achtervoegsel.
const padApp = join(HIER, "R25.ifcfem2d");
writeFileSync(padApp, projectTekst, "utf8");
log(`Zelfde model voor de open-dialoog van de app: ${padApp}`);

// Controle dat het surrogaat inderdaad dezelfde axiale én buigstijfheid heeft.
const sec = resolveSection(KLASSE, PROFIEL);
const dEA = (sec.E * sec.A) / (E_Nmm2 * A_mm2) - 1;
const dEI = (sec.E * sec.I) / (E_Nmm2 * I_mm4) - 1;
log("");
log("── Surrogaatdoorsnede in het projectbestand ─────────────────────────────");
log(`  profiel   : ${KLASSE} ${PROFIEL}  (b = ${b_sur.toFixed(3)} mm, h = ${h_sur.toFixed(3)} mm)`);
log(`  bron  E·A = ${(E_Nmm2 * A_mm2).toExponential(9)} N     model E·A = ${(sec.E * sec.A).toExponential(9)} N   Δ = ${(dEA * 100).toExponential(2)} %`);
log(`  bron  E·I = ${(E_Nmm2 * I_mm4).toExponential(9)} N·mm²  model E·I = ${(sec.E * sec.I).toExponential(9)} N·mm²  Δ = ${(dEI * 100).toExponential(2)} %`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. Doorrekenen met de EXACTE doorsnede uit de bron
// ═════════════════════════════════════════════════════════════════════════════
const r = solve(invoerExact);
if (!r) throw new Error("solve() gaf geen resultaat");

const wB_mm = r.displacements.get(3)?.uz;      // mm, omlaag negatief
const wB_m = wB_mm / 1000;                      // → m, zoals de bron
const Rveer_N = r.reactions.get(3)?.fz;         // N, omhoog positief

// ═════════════════════════════════════════════════════════════════════════════
// 4. Vergelijken met de referentiewaarden
// ═════════════════════════════════════════════════════════════════════════════
vergelijk("doorbuiging in B (veerknoop)", wB_m, REF.wB_m, "vergelijkbaar", "m");
vergelijk("reactiekracht in de veer", Rveer_N, REF.Rveer_N, "vergelijkbaar", "N");

// ═════════════════════════════════════════════════════════════════════════════
// 5. Onafhankelijke handafleiding als derde partij
// ═════════════════════════════════════════════════════════════════════════════
// Krachtenmethode met de veerkracht R als statisch onbepaalde. Basissysteem:
// vrij opgelegde ligger A–C (overspanning L = 12 m), belast met de twee
// puntlasten F op a = 3 m van elk steunpunt, plus de opwaartse veerkracht R
// in het midden.
//
//   zakking midden door één puntlast P op afstand a (a ≤ L/2) van de oplegging:
//       δ = P · a · (3L² − 4a²) / (48·E·I)
//   zakking midden door een middenlast R:
//       δ = R · L³ / (48·E·I)
//   verenigbaarheid: de zakking van de ligger in B is gelijk aan de indrukking
//   van de veer:      δ_last − δ_R = R / Ky
//
// De getallen komen UIT DE INVOER, niet uit de referentiewaarden.
const L_m = L_TOT_mm / 1000;
const a_m = X_LAST1_mm / 1000;
const P_N = Math.abs(F_N);
const delta_last = 2 * P_N * a_m * (3 * L_m * L_m - 4 * a_m * a_m) / (48 * EI_Nm2);
const flex_R = Math.pow(L_m, 3) / (48 * EI_Nm2);   // zakking per eenheid R
const R_hand = delta_last / (flex_R + 1 / KY_Nm);
const wB_hand = -R_hand / KY_Nm;

vergelijk("R_veer volgens handafleiding", R_hand, REF.Rveer_N, "hand", "N");
vergelijk("w_B volgens handafleiding", wB_hand, REF.wB_m, "hand", "m");

// ═════════════════════════════════════════════════════════════════════════════
// 6. Eigen controles — grootheden die de bron NIET geeft
// ═════════════════════════════════════════════════════════════════════════════
// "Ontbreekt in de bron: momenten- en dwarskrachtenlijn; oplegreacties in A en C."
// Die worden hier tegen de eigen statica gelegd, niet tegen een referentie.
const rA = r.reactions.get(1), rC = r.reactions.get(5);
const RA_hand = (2 * P_N - R_hand) / 2;             // symmetrie → gelijk verdeeld
const M_B_hand = RA_hand * (L_m / 2) - P_N * (L_m / 2 - a_m);   // N·m in B
const M_last_hand = RA_hand * a_m;                                // N·m onder de last

// Momenten uit de solver (N·mm → N·m). Staaf 1 loopt van A naar het lastpunt,
// staaf 2 van het lastpunt naar B; station 20 is het eindpunt van de staaf.
const M_last_ons = (r.elements.get(1)?.bendingMoment?.[20] ?? NaN) / 1000;
const M_B_ons = (r.elements.get(2)?.bendingMoment?.[20] ?? NaN) / 1000;
const V_AB_ons = r.elements.get(1)?.shearForce?.[0] ?? NaN;         // N
const N_ons = r.elements.get(2)?.N ?? NaN;

const eigenControles = [
  ["R_A  = (2F − R_veer)/2 = 31 500 N", rA?.fz ?? NaN, RA_hand, 1e-6],
  ["R_C  = idem (symmetrie)", rC?.fz ?? NaN, RA_hand, 1e-6],
  ["ΣF_z = 0 (R_A + R_B + R_C − 2F)", (rA?.fz ?? 0) + (Rveer_N ?? 0) + (rC?.fz ?? 0) - 2 * P_N, 0, 1e-6],
  ["ΣF_x = 0", (rA?.fx ?? 0) + (rC?.fx ?? 0), 0, 1e-6],
  ["N = 0 (geen axiale last)", N_ons, 0, 1e-6],
  ["V in A = R_A", V_AB_ons, RA_hand, 1e-6],
  ["M onder de last = R_A·a = 94 500 N·m", M_last_ons, M_last_hand, 1e-6],
  ["M in B = 63 000 N·m (VELDmoment, geen steunpuntmoment!)", M_B_ons, M_B_hand, 1e-6],
  ["symmetrie w: w_A-zijde = w_C-zijde", r.displacements.get(2)?.uz ?? NaN, r.displacements.get(4)?.uz ?? NaN, 1e-9],
];

log("");
log("── Eigen statica-controles (bron geeft deze waarden niet) ───────────────");
let eigenFout = 0;
for (const [naam, ons, verwacht, relTol] of eigenControles) {
  const tol = Math.max(Math.abs(verwacht) * relTol, 1e-6);
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= tol;
  if (!ok) eigenFout++;
  log(`  ${ok ? "✓" : "✗"} ${naam}`);
  log(`      onze waarde ${ons.toExponential(9)}   verwacht ${verwacht.toExponential(9)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Werkt de veer écht? — grenswaarden en gevoeligheid
// ═════════════════════════════════════════════════════════════════════════════
// Als de veerstijfheid ergens genegeerd of verkeerd omgerekend zou worden,
// zou de uitkomst niet met k meebewegen. Twee analytisch bekende grenzen:
//   k → 0   : geen middensteunpunt   ⇒ R = 0,      w_B = −15,714 mm
//   k → ∞   : star middensteunpunt   ⇒ R = 57 750 N (twee velden van 6 m,
//             elk met een middenlast: M_B = −3PL/16 = −47 250 N·m)
function metStijfheid(k_Nmm) {
  const rr = solve({
    ...invoerExact,
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 3, type: "zSpring", k: k_Nmm },
      { nodeId: 5, type: "zRoller" },
    ],
  });
  return { R: rr.reactions.get(3)?.fz ?? NaN, w: (rr.displacements.get(3)?.uz ?? NaN) / 1000 };
}

const R_star = 2 * (P_N - (P_N / 2 - (3 * P_N * (L_m / 2) / 16) / (L_m / 2)));  // = 57 750 N
log("");
log("── Gevoeligheid voor de veerstijfheid ───────────────────────────────────");
log("    k [N/mm]        R_veer [N]        w_B [m]");
for (const k of [KY_Nmm / 1000, KY_Nmm / 10, KY_Nmm, KY_Nmm * 10, KY_Nmm * 1000, KY_Nmm * 1e6]) {
  const g = metStijfheid(k);
  log(`  ${k.toExponential(3).padStart(11)}  ${g.R.toFixed(3).padStart(15)}  ${g.w.toExponential(6).padStart(15)}`);
}
const grensStar = metStijfheid(KY_Nmm * 1e6);
const grensLos = metStijfheid(KY_Nmm / 1e6);
const dStar = (grensStar.R - R_star) / R_star * 100;
const w_los_hand = -delta_last;
const dLos = (grensLos.w - w_los_hand) / Math.abs(w_los_hand) * 100;
log(`  k → ∞  : R = ${grensStar.R.toFixed(3)} N   (star twee-velds: ${R_star.toFixed(3)} N, Δ ${dStar.toFixed(4)} %)`);
log(`  k → 0  : w_B = ${grensLos.w.toExponential(6)} m  (zonder middensteun: ${w_los_hand.toExponential(6)} m, Δ ${dLos.toFixed(4)} %)`);

// ═════════════════════════════════════════════════════════════════════════════
// 8. Netverfijning — hangt de uitkomst van de elementindeling af?
// ═════════════════════════════════════════════════════════════════════════════
// Voor Bernoulli-elementen met knooplasten hoort dit exact hetzelfde te geven.
function metVerfijning(perDeel) {
  const nodes = [], beams = [], pl = [];
  const posities = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < perDeel; j++) {
      posities.push((i * 3000) + (j / perDeel) * 3000);
    }
  }
  posities.push(L_TOT_mm);
  posities.forEach((x, i) => nodes.push({ id: i + 1, x, z: 0 }));
  for (let i = 0; i < posities.length - 1; i++) {
    beams.push({ id: i + 1, from: i + 1, to: i + 2, E: E_Nmm2, A: A_mm2, I: I_mm4 });
  }
  const idVoor = (x) => posities.findIndex(p => Math.abs(p - x) < 1e-6) + 1;
  pl.push({ nodeId: idVoor(X_LAST1_mm), fz: F_N }, { nodeId: idVoor(X_LAST2_mm), fz: F_N });
  const rr = solve({
    nodes, beams,
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: idVoor(X_MIDDEN_mm), type: "zSpring", k: KY_Nmm },
      { nodeId: posities.length, type: "zRoller" },
    ],
    loads: [], pointLoads: pl,
  });
  return {
    R: rr.reactions.get(idVoor(X_MIDDEN_mm))?.fz ?? NaN,
    w: (rr.displacements.get(idVoor(X_MIDDEN_mm))?.uz ?? NaN) / 1000,
  };
}
log("");
log("── Netverfijning (moet constant zijn) ───────────────────────────────────");
for (const n of [1, 2, 5, 20]) {
  const g = metVerfijning(n);
  log(`  ${String(n * 4).padStart(3)} elementen: R = ${g.R.toFixed(6)} N,  w_B = ${g.w.toExponential(9)} m`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. De route die de app zelf loopt: projectbestand → mapping → solver
// ═════════════════════════════════════════════════════════════════════════════
// Leest het zojuist weggeschreven bestand terug en laat het door exact dezelfde
// mapping gaan als de app (deserializeProject → bouwMultiInput → resolveSection
// → liftSpringK → solveAllCases). Dit toetst meteen de VOLLEDIGE eenheidsketen
// van de veer: 2,1 kN/mm in het bestand → 2 100 N/mm in de solver-invoer →
// 2,1 · 10^6 N/m in de kern. Zou daar één factor 1000 verkeerd staan, dan wijkt
// de veerreactie hier meteen tientallen procenten af.
const bestand = deserializeProject(readFileSync(pad, "utf8"));
const multi = bouwMultiInput({
  nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
  plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
});
const rBestand = solveAllCases(multi).perCase.get(1);
const wB_app_m = (rBestand.displacements.get(3)?.uz ?? NaN) / 1000;
const R_app = rBestand.reactions.get(3)?.fz ?? NaN;
log("");
log("── Route via het opgeslagen bestand (bestand → mapping → solver) ────────");
log(`  k in het bestand: ${bestand.supports.find(s => s.type === "zSpring").k} kN/mm`);
log(`  k in de solver-invoer: ${multi.supports.find(s => s.type === "zSpring").k} N/mm  (bron: ${KY_Nmm} N/mm)`);
log(`  w_B     = ${wB_app_m.toExponential(9)} m   (Δ t.o.v. referentie ${((wB_app_m - REF.wB_m) / Math.abs(REF.wB_m) * 100).toExponential(3)} %)`);
log(`  R_veer  = ${R_app.toFixed(6)} N          (Δ t.o.v. referentie ${((R_app - REF.Rveer_N) / REF.Rveer_N * 100).toExponential(3)} %)`);

vergelijk("w_B via R25.femp (app-route)", wB_app_m, REF.wB_m, "bestand", "m");
vergelijk("R_veer via R25.femp (app-route)", R_app, REF.Rveer_N, "bestand", "N");

// ═════════════════════════════════════════════════════════════════════════════
// 10. Eindtabel
// ═════════════════════════════════════════════════════════════════════════════
log("");
log("═══ VERGELIJKING MET DE REFERENTIEWAARDEN ═══════════════════════════════");
log("");
log("  soort           grootheid                              referentie        onze waarde       Δ [%]");
log("  ────────────────────────────────────────────────────────────────────────────────────────────────");
for (const g of regels) {
  log(`  ${g.soort.padEnd(14)}  ${g.naam.padEnd(37)}  ${g.ref.toExponential(5).padStart(15)}  ${g.ons.toExponential(5).padStart(15)}  ${g.dPct.toFixed(4).padStart(9)}`);
}

const vergelijkbaar = regels.filter(g => g.soort === "vergelijkbaar");
const maxAfw = Math.max(...vergelijkbaar.map(g => Math.abs(g.dPct)));
const maxAfwHand = Math.max(...regels.filter(g => g.soort === "hand").map(g => Math.abs(g.dPct)));
const maxAfwBestand = Math.max(...regels.filter(g => g.soort === "bestand").map(g => Math.abs(g.dPct)));

log("");
log(`  Grootste afwijking op de VERGELIJKBARE grootheden : ${maxAfw.toExponential(3)} %`);
log(`  Grootste afwijking via het opgeslagen bestand     : ${maxAfwBestand.toExponential(3)} %`);
log(`  Grootste afwijking handafleiding ↔ referentie     : ${maxAfwHand.toExponential(3)} %`);
log(`  Eigen statica-controles                           : ${eigenFout === 0 ? "alle in orde" : eigenFout + " FOUT"}`);
log("");
log("  Tolerantie voor dit geval (numerieke referentie uit een validatiebundel): 1 %");
log(`  Oordeel: ${maxAfw <= 1 ? "KOMT OVEREEN" : "AFWIJKING — uitzoeken"}`);
log("");

process.exit(maxAfw <= 1 && eigenFout === 0 ? 0 : 1);
