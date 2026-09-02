// ═══════════════════════════════════════════════════════════════════════════
// R23 — Statisch bepaald raamwerk met scharnier, pendelstaaf en
//       temperatuurbelasting
//
// Validatiecampagne referentieberekeningen, geval R23 uit
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Dit script:
//   1. bouwt het model precies zoals de invoertabel van R23 het voorschrijft;
//   2. schrijft het weg als referentie/R23.femp (+ .ifcfem2d, de extensie waar
//      het open-dialoog van de app op filtert), zodat het te openen is;
//   3. rekent het door via EXACT de app-route (deserializeProject →
//      bouwMultiInput → solveAllCases), dus inclusief de vertaling
//      materiaal/profiel → E, A, I én de materiaalgebonden α;
//   4. legt elke referentiewaarde uit het dossier naast onze uitkomst, met de
//      afwijking in procent;
//   5. doet een ONAFHANKELIJKE handcontrole van de zakking van g met de
//      arbeidsvergelijking (gesloten M- en M̄-verlopen, exact geïntegreerd),
//      zodat de referentie niet alleen "met onszelf" wordt vergeleken.
//
// Draaien vanuit design-mockup:   npx tsx referentie/toets-R23.mjs
//
// ── HET SYSTEEM ───────────────────────────────────────────────────────────
//   a (0; 0) · b (4; 0) · c (4; 3) · d (4; 6) · f (4; 8) · g (5,5; 8) · e (0; 6)
//   a–b = 4 m ligger, ingeklemd in a, SCHARNIER in b
//   b–c–d–f = doorgaande kolom (3 + 3 + 2 m), f–g = uitkraging 1,5 m
//   e–d = pendelstaaf 4 m, scharnieren aan beide einden
//   EI = 12 000 kNm² voor alle op buiging belaste staven
//   EA = 24 000 kN UITSLUITEND voor e–d; overige staven axiaal (praktisch) star
//   α_T = 1,2·10⁻⁵ /K
//
//   Belastinggeval 1: H = 20 kN → in f · V = 10 kN ↓ in g · H = 30 kN → in c ·
//                     q = 15 kN/m → over de volle hoogte b–d (6 m)
//   Belastinggeval 2: ΔT = +40 K, uitsluitend op staaf a–b
//
// ── ONAFHANKELIJKE HANDCONTROLE VAN DE BRON ───────────────────────────────
// Het systeem is statisch bepaald: 3 reacties in a + 1 pendelkracht = 4
// onbekenden tegen 3 evenwichtsvergelijkingen + 1 scharniervoorwaarde in b.
// M, V, N en de reacties volgen dus zonder enige stijfheid.
//
//   Bovenbouw boven het scharnier b, ΣM om b = 0 (S = trek in e–d):
//     6S = 10·1,5 + 20·8 + 15·6²/2 + 30·3 = 15 + 160 + 270 + 90 = 535
//     S  = 535/6 = 89,166667 kN trek → reactie in e = 89,166667 kN
//   ΣFz (hele systeem):  V_a = 10 kN ↑
//   ΣFx:                 H_a = −(20 + 30 + 90) + S = −50,833333 kN
//   ΣM om a:             M_a = 40 kNm      ( = 10·4, want alleen de 10 kN
//                        passeert het scharnier b verticaal)
//   M in f = 10·1,5 = 15 kNm · M in d = 15 + 20·2 = 55 kNm
//   M in c = 15·6²/8 + 30·6/4 − 55/2 = 67,5 + 45 − 27,5 = 85 kNm
//
//   Zakking van g — arbeidsvergelijking met 1 kN ↓ in g (S̄ = 1,5/6 = 0,25):
//     ∫MM̄/EI over a–b   = 213,3333/EI
//     ∫MM̄/EI over f–g   =  11,2500/EI
//     ∫MM̄/EI over d–f   = 105,0000/EI
//     ∫MM̄/EI over b–d   = −138,7500/EI
//     som                = 190,8333/12 000            = 0,015902778 m
//     pendel  S·S̄·L/EA   = 89,166667·0,25·4/24 000    = 0,003715278 m
//     w_g                                             = 0,019618056 m
//   Dat is EXACT de gepubliceerde 0,019618056 m. De bron is voor dit geval dus
//   onafhankelijk gereproduceerd; er zit geen zetfout in.
//   (Het script rekent deze integralen hieronder nog eens numeriek na, zodat
//   de handafleiding ook echt in de uitvoer staat en niet alleen in commentaar.)
//
//   Temperatuurgeval: statisch bepaald ⇒ geen krachten. a–b rekt α·ΔT·L =
//   1,2e−5·40·4000 = 1,92 mm uit, d wordt horizontaal vastgehouden door de
//   (krachtloze, dus onvervormde) pendel ⇒ de kolom b–d verdraait over
//   1,92/6000 = 3,2·10⁻⁴ rad. Alle knopen van de kolom, dus ook c, verdraaien
//   even veel. Grootte klopt exact met de referentie −0,00032 rad; het teken
//   volgt de tekenafspraak van de bron (zie aanname 4).
//
// ── AANNAMES BIJ HET NABOUWEN ─────────────────────────────────────────────
// 1. EI = 12 000 kNm² met EA → ∞. De app leidt E, A en I af uit
//    (materiaal, profiel) en kent geen directe EI-invoer. Materiaal C22 heeft
//    E₀,mean = 10 000 N/mm² (sectionResolver.TIMBER_E_MEAN) en voor een
//    rechthoek b×h geldt I = b·h³/12, A = b·h. Gekozen:
//      buigstaven : 14400 × 100 → I = 1,2e9 mm⁴ → EI = 12 000 kNm² EXACT,
//                   A = 1,44e6 mm² → EA = 1,44e7 kN = 600 × EA(e–d)
//      pendel e–d :    24 × 100 → A = 2400 mm² → EA = 24 000 kN EXACT
//    De doorsnedematen zijn een REKENTRUC om de voorgeschreven stijfheden in
//    het bestand te krijgen, geen constructieve keuze. Het script toont
//    onderaan expliciet hoe gevoelig de uitkomst voor de resterende (eindige)
//    EA van de buigstaven is.
// 2. Oplegging in e = INKLEMMING, niet scharnier. Node e draagt alleen de
//    pendelstaaf, en die heeft in e een scharnier: de rotatie-DOF van e heeft
//    dan NUL stijfheid en een scharnieroplegging maakt het stelsel singulier
//    (de solver meldt dat netjes — geverifieerd, zie probe-R23.mjs). Een
//    inklemming parkeert die lege DOF zonder het mechanische gedrag te
//    veranderen: het scharnier in de staaf laat toch geen moment door. Het
//    script controleert dat dan ook: M-reactie en V-reactie in e moeten nul
//    zijn, zodat er inderdaad alleen een horizontale reactie overblijft.
// 3. Het scharnier in b zit op ÉÉN staafeinde (het b-einde van a–b). Beide
//    einden lossen zou de rotatie van knoop b stijfheidloos maken. Mechanisch
//    is dat identiek: knoop b verbindt alleen a–b en b–c, dus met M = 0 in de
//    ene staaf is M = 0 in de andere ook afgedwongen door knoopevenwicht.
// 4. Tekens. De bron publiceert de verdraaiing als −0,00032 rad; onze solver
//    hanteert ry linksom-positief bij z omhoog en geeft +0,00032 rad. Dat is
//    dezelfde beweging in een andere tekenafspraak (de bron rekent met z naar
//    beneden / rechtsom-positieve verdraaiing). Er wordt daarom op ABSOLUTE
//    waarde vergeleken; de tekens van onze solver staan er apart bij.
// 5. Eigen gewicht en scheefstand staan uit; eerste orde.
//
// ── BEKENDE BEPERKING VAN DE APP (wordt hieronder GEMETEN, niet verzwegen) ─
// De uitzettingscoëfficiënt is in de app niet vrij instelbaar: hij volgt uit
// het staafmateriaal (lib/thermalAlpha.ts — staal 1,2e−5, hout 5,0e−6). Om
// EI = 12 000 kNm² exact te kunnen instellen is een rechthoekprofiel nodig, en
// een rechthoekprofiel bestaat in de app alleen bij een HOUTmateriaal; dus
// rekent het bestandspad belastinggeval 2 met α = 5,0e−6 in plaats van de
// voorgeschreven 1,2e−5. Het script rapporteert daarom BEIDE:
//   (2a) de zuivere app-route uit het opgeslagen bestand, en
//   (2b) dezelfde geometrie met α = 1,2e−5 rechtstreeks aan de solver gegeven,
// zodat zichtbaar is dat het verschil volledig in de α-koppeling zit en niet
// in de thermische rekenkern.
//
// Én er wordt een TWEEDE modelbestand weggeschreven, R23-hybride.femp: daarin
// krijgt alleen de VERWARMDE staaf a–b een staalmateriaal (S235 / HEB 200 —
// het profiel uit de database dat het dichtst bij EI = 12 000 kNm² ligt), zodat
// α langs de gewone app-route 1,2e−5 wordt. De prijs is 0,25 % op EI van a–b.
// Omdat het systeem STATISCH BEPAALD is blijven alle momenten en reacties van
// BG1 daarin exact; alleen de zakking van g verschuift een beetje. Dat bestand
// dekt dus ALLE ZEVEN referentiewaarden in één model — het script meet hoeveel
// dat op w_g kost, in plaats van dat te schatten.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { thermalAlphaForMaterial } = await import("../src/lib/thermalAlpha.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ── 1. Het model ──────────────────────────────────────────────────────────
// Knopen in mm, z omhoog positief (modelassen van de app).
const A_ = 1, B_ = 2, C_ = 3, D_ = 4, F_ = 5, G_ = 6, E_ = 7;
const nodes = [
  { id: A_, x: 0,    z: 0    },  // a — inklemming
  { id: B_, x: 4000, z: 0    },  // b — scharnier tussen ligger en kolom
  { id: C_, x: 4000, z: 3000 },  // c — halve hoogte b–d
  { id: D_, x: 4000, z: 6000 },  // d — aansluiting pendelstaaf
  { id: F_, x: 4000, z: 8000 },  // f — kolomtop / voet uitkraging
  { id: G_, x: 5500, z: 8000 },  // g — vrij uiteinde uitkraging
  { id: E_, x: 0,    z: 6000 },  // e — oplegging van de pendelstaaf
];

// Zie aanname 1: C22 (E = 10 000 N/mm²) + rechthoek → exact EI resp. EA.
const PROF_BUIG   = "14400x100";  // I = 1,2e9 mm⁴ → EI = 12 000 kNm²
const PROF_PENDEL = "24x100";     // A = 2400 mm² → EA = 24 000 kN

const beams = [
  // a–b: ingeklemd in a, scharnier aan het b-einde (aanname 3).
  { id: 1, from: A_, to: B_, material: "C22", profile: PROF_BUIG,
    releases: { endRy: true } },
  { id: 2, from: B_, to: C_, material: "C22", profile: PROF_BUIG },   // kolom onder
  { id: 3, from: C_, to: D_, material: "C22", profile: PROF_BUIG },   // kolom boven
  { id: 4, from: D_, to: F_, material: "C22", profile: PROF_BUIG },   // kolom tot f
  { id: 5, from: F_, to: G_, material: "C22", profile: PROF_BUIG },   // uitkraging
  // e–d: pendelstaaf, scharnieren aan beide einden.
  { id: 6, from: E_, to: D_, material: "C22", profile: PROF_PENDEL,
    releases: { startRy: true, endRy: true } },
];

const supports = [
  { nodeId: A_, type: "fixed" },  // a volledig ingeklemd
  { nodeId: E_, type: "fixed" },  // e — zie aanname 2
];

const loadCases = [
  { id: 1, name: "BG1 — puntlasten + lijnlast", type: "other" },
  { id: 2, name: "BG2 — verwarming a-b, dT = +40 K", type: "other" },
];

const loads = [
  // Belastinggeval 1
  { id: 1, type: "pointForce", caseId: 1, nodeId: F_, fx: 20, fz: 0 },   // 20 kN → in f
  { id: 2, type: "pointForce", caseId: 1, nodeId: G_, fx: 0, fz: -10 },  // 10 kN ↓ in g
  { id: 3, type: "pointForce", caseId: 1, nodeId: C_, fx: 30, fz: 0 },   // 30 kN → in c
  // q = 15 kN/m horizontaal (+x) over de VOLLE hoogte b–d, dus op beide
  // kolomstaven. De staven zijn verticaal, dus staaflengte = hoogte:
  // projectie speelt hier geen rol.
  { id: 4, type: "lineLoad", caseId: 1, beamId: 2, q: 15, qDir: "x" },
  { id: 5, type: "lineLoad", caseId: 1, beamId: 3, q: 15, qDir: "x" },
  // Belastinggeval 2 — uitsluitend staaf a–b verwarmen
  { id: 6, type: "thermal", caseId: 2, beamId: 1, deltaT: 40 },
];

const modelState = {
  nodes, beams, supports, plates: [], loads, loadCases,
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
  structuralGrid: {
    enabled: true,
    xAxes: [
      { id: "A", label: "A", position: 0 },
      { id: "B", label: "B", position: 4000 },
      { id: "C", label: "C", position: 5500 },
    ],
    zAxes: [
      { id: "1", label: "1", position: 0 },
      { id: "2", label: "2", position: 3000 },
      { id: "3", label: "3", position: 6000 },
      { id: "4", label: "4", position: 8000 },
    ],
  },
};

// ── 2. Opslaan ────────────────────────────────────────────────────────────
// Twee keer dezelfde inhoud: .femp zoals de campagne het vraagt, en
// .ifcfem2d omdat DAT de extensie is waarop het open-dialoog van de app
// filtert (projectFile.PROJECT_FILE_EXT).
const projectText = serializeProject(modelState);
for (const naam of ["R23.femp", "R23.ifcfem2d"]) {
  const pad = join(HIER, naam);
  writeFileSync(pad, projectText, "utf8");
  log(`Model opgeslagen: ${pad}`);
}

// ── 3. Doorrekenen via de app-route (bestand → model → solver) ────────────
// Bewust NIET het zojuist opgebouwde object, maar het TERUGGELEZEN bestand.
const uitBestand = deserializeProject(projectText);
const multi = bouwMultiInput({
  nodes: uitBestand.nodes,
  beams: uitBestand.beams,
  supports: uitBestand.supports,
  plates: uitBestand.plates,
  loadCases: uitBestand.loadCases,
  loads: uitBestand.loads,
  selfWeightEnabled: uitBestand.selfWeightEnabled,
  scheefstandEnabled: uitBestand.scheefstandEnabled ?? false,
  scheefstandNoemer: uitBestand.scheefstandNoemer ?? 200,
  scheefstandRichting: uitBestand.scheefstandRichting ?? 1,
});
const perCase = solveAllCases(multi).perCase;
const r1 = perCase.get(1);
const r2 = perCase.get(2);
if (!r1 || !r2) throw new Error("Ontbrekend resultaat voor belastinggeval 1 of 2");

log("\nDoorsnede-afleiding (materiaal/profiel → E·I en E·A):");
for (const b of multi.beams) {
  log(`  staaf ${b.id}: E=${b.E} N/mm² · I=${b.I.toExponential(4)} mm⁴ · ` +
      `A=${b.A.toExponential(4)} mm² → EI = ${(b.E * b.I / 1e9).toFixed(1)} kNm² · ` +
      `EA = ${(b.E * b.A / 1e3).toFixed(0)} kN`);
}
const alphaApp = thermalAlphaForMaterial("C22");
log(`\nThermische coëfficiënt langs de app-route: α = ${alphaApp.toExponential(3)} /K ` +
    `(voorgeschreven in het dossier: 1,200e-5 /K)`);

// ── Uitlezen ──────────────────────────────────────────────────────────────
const kNm = (Nmm) => Nmm / 1e6;
const kN  = (N)   => N / 1000;
const el1 = (id) => r1.elements.get(id);

// Staafnummering: 1 = a–b, 2 = b–c, 3 = c–d, 4 = d–f, 5 = f–g, 6 = e–d.
const M_a   = kNm(el1(1).bendingMoment[0]);    // ligger bij de inklemming a
const M_b_l = kNm(el1(1).bendingMoment[20]);   // ligger bij het scharnier b (= 0)
const M_b_k = kNm(el1(2).bendingMoment[0]);    // kolom bij b (= 0)
const M_c_o = kNm(el1(2).bendingMoment[20]);   // kolom b–c bij c
const M_c_b = kNm(el1(3).bendingMoment[0]);    // kolom c–d bij c
const M_d_o = kNm(el1(3).bendingMoment[20]);   // kolom c–d bij d
const M_d_b = kNm(el1(4).bendingMoment[0]);    // kolom d–f bij d
const M_f_k = kNm(el1(4).bendingMoment[20]);   // kolom d–f bij f
const M_f_u = kNm(el1(5).bendingMoment[0]);    // uitkraging bij f
const M_g   = kNm(el1(5).bendingMoment[20]);   // vrij uiteinde g (= 0)

const Re = r1.reactions.get(E_), Ra = r1.reactions.get(A_);
const H_e = kN(Re.fx), V_e = kN(Re.fz), M_e = kNm(Re.my);
const H_a = kN(Ra.fx), V_a = kN(Ra.fz), Ma_reactie = kNm(Ra.my);
const N_pendel = kN(el1(6).N);                 // trek positief

const w_g_m = -r1.displacements.get(G_).uz / 1000;  // zakking (omlaag) in m
const ry_c_app = r2.displacements.get(C_).ry;       // verdraaiing c, app-route

// ── 3b. Zelfde geometrie, α = 1,2e-5 rechtstreeks aan de solver ───────────
// Isoleert de α-koppeling van de thermische rekenkern (zie de beperking boven).
const rT = solve({
  nodes: multi.nodes,
  beams: multi.beams,
  supports: multi.supports,
  loads: [],
  thermalLoads: [{ beamId: 1, deltaT: 40, alpha: 1.2e-5 }],
});
const ry_c_alfa = rT.displacements.get(C_).ry;
const ux_b_alfa = rT.displacements.get(B_).ux;

// ── 4. Onafhankelijke handcontrole van w_g (arbeidsvergelijking) ──────────
// M en M̄ als gesloten uitdrukkingen per staaf; exacte integratie met Simpson
// (de integranden zijn polynomen van graad ≤ 3, dus Simpson is exact).
function simpson(f, a, b, n = 200) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}
const S_ref = 535 / 6;                      // trek in e–d, kN
const Sb_ref = 1.5 / 6;                     // idem onder de eenheidslast, kN
const EI_ref = 12000, EA_ref = 24000;       // kNm², kN
// a–b, ξ vanaf a (0…4 m)
const I_ab = simpson((x) => (10 * x - 40) * (x - 4), 0, 4);
// b–c, z vanaf b (0…3 m)
const I_bc = simpson((z) => ((140 - S_ref) * z - 7.5 * z * z) * (-0.25 * z), 0, 3);
// c–d, z vanaf b (3…6 m)
const I_cd = simpson((z) => (90 + (110 - S_ref) * z - 7.5 * z * z) * (-0.25 * z), 3, 6);
// d–f, s vanaf d (0…2 m)
const I_df = simpson((s) => (-15 - 20 * (2 - s)) * (-1.5), 0, 2);
// f–g, x vanaf g (0…1,5 m)
const I_fg = simpson((x) => (-10 * x) * (-x), 0, 1.5);
const w_buiging = (I_ab + I_bc + I_cd + I_df + I_fg) / EI_ref;
const w_pendel  = (S_ref * Sb_ref * 4) / EA_ref;
const w_hand    = w_buiging + w_pendel;

// ── 5. Vergelijking met het dossier ───────────────────────────────────────
const rijen = [];
let maxAfw = 0;

function vergelijk(naam, referentie, onze, eenheid, opAbs = true) {
  const ref = opAbs ? Math.abs(referentie) : referentie;
  const ons = opAbs ? Math.abs(onze) : onze;
  const afw = ref === 0 ? (Math.abs(ons) < 1e-6 ? 0 : Infinity)
                        : ((ons - ref) / Math.abs(ref)) * 100;
  if (Number.isFinite(afw)) maxAfw = Math.max(maxAfw, Math.abs(afw));
  rijen.push({ naam, ref, ons, eenheid, afw });
  return afw;
}

// Belastinggeval 1 — de zeven grootheden uit de dossiertabel (BG1)
vergelijk("BG1 horizontale reactie e",   89.166667,    H_e,        "kN");
vergelijk("BG1 buigend moment in a",     40,           M_a,        "kNm");
vergelijk("BG1 buigend moment in d",     55,           M_d_o,      "kNm");
vergelijk("BG1 buigend moment in f",     15,           M_f_k,      "kNm");
vergelijk("BG1 buigend moment in c",     85,           M_c_o,      "kNm");
vergelijk("BG1 zakking van g",           0.019618056,  w_g_m,      "m");
// Belastinggeval 2 — twee routes (zie de beperking bovenaan)
const afwRyApp  = vergelijk("BG2 verdraaiing c (app-route)", 0.00032, ry_c_app,  "rad");
const afwRyAlfa = vergelijk("BG2 verdraaiing c (α=1,2e-5)",  0.00032, ry_c_alfa, "rad");

log("\n╔══════════════════════════════════════════════════════════════════════════╗");
log("║ R23 — vergelijking met het dossier (op absolute waarde, zie aanname 4)  ║");
log("╚══════════════════════════════════════════════════════════════════════════╝");
log(`${"grootheid".padEnd(34)}${"referentie".padStart(13)}${"onze waarde".padStart(15)}` +
    `${"afwijking".padStart(12)}`);
log("─".repeat(74));
for (const rj of rijen) {
  const fmt = (v) => (Math.abs(v) < 1 ? v.toFixed(9) : v.toFixed(4));
  log(`${rj.naam.padEnd(34)}${fmt(rj.ref).padStart(13)}${fmt(rj.ons).padStart(15)}` +
      `${(rj.afw.toFixed(3) + " %").padStart(12)}`);
}
log("─".repeat(74));

// De grootste afwijking van de gevallen die de app WEL kan uitdrukken:
const maxAfwZonderAlfa = Math.max(
  ...rijen.filter((rj) => !rj.naam.includes("app-route")).map((rj) => Math.abs(rj.afw)),
);
log(`Grootste afwijking incl. de α-beperkte app-route : ${maxAfw.toFixed(3)} %`);
log(`Grootste afwijking excl. die ene rij             : ${maxAfwZonderAlfa.toFixed(3)} %`);

// ── Aanvullende controles die de bron niet publiceert ─────────────────────
log("\nAanvullende controles (bron publiceert deze niet, wél toetsbaar):");
log(`  M in de ligger bij het scharnier b : ${M_b_l.toExponential(2)} kNm (moet 0 zijn)`);
log(`  M in de kolom bij het scharnier b  : ${M_b_k.toExponential(2)} kNm (moet 0 zijn)`);
log(`  M in g (vrij uiteinde)             : ${M_g.toExponential(2)} kNm (moet 0 zijn)`);
log(`  M-continuïteit in c                : ${M_c_o.toFixed(6)} vs ${M_c_b.toFixed(6)} kNm`);
log(`  M-continuïteit in d                : ${M_d_o.toFixed(6)} vs ${M_d_b.toFixed(6)} kNm`);
log(`  M-continuïteit in f                : ${M_f_k.toFixed(6)} vs ${M_f_u.toFixed(6)} kNm`);
log(`  Verticale reactie in e             : ${V_e.toExponential(2)} kN  (aanname 2: moet 0)`);
log(`  Momentreactie in e                 : ${M_e.toExponential(2)} kNm (aanname 2: moet 0)`);
log(`  N in de pendelstaaf e–d            : ${N_pendel.toFixed(6)} kN (trek +)`);
log(`  Reactie a                          : fx = ${H_a.toFixed(6)} kN · ` +
    `fz = ${V_a.toFixed(6)} kN · my = ${Ma_reactie.toFixed(6)} kNm`);

// Evenwicht van ONZE uitkomst, onafhankelijk van de bron.
const sFx = H_a + H_e + 20 + 30 + 15 * 6;
const sFz = V_a + V_e - 10;
// Momentevenwicht om a (linksom positief), met M_a als reactiemoment.
const sM = Ma_reactie
  + (0 * V_e - 6 * H_e)                       // reactie in e op (0; 6)
  - 8 * 20                                    // 20 kN → in f (4; 8)
  + 5.5 * (-10)                               // 10 kN ↓ in g (5,5; 8)
  - 3 * 30                                    // 30 kN → in c (4; 3)
  - 3 * (15 * 6);                             // resultante lijnlast op (4; 3)
log("\nEvenwichtscontrole van ONZE uitkomst (moet ≈ 0 zijn):");
log(`  ΣFx   = ${sFx.toExponential(2)} kN`);
log(`  ΣFz   = ${sFz.toExponential(2)} kN`);
log(`  ΣM(a) = ${sM.toExponential(2)} kNm`);

// ── Onafhankelijke handcontrole ───────────────────────────────────────────
log("\nOnafhankelijke handcontrole van de zakking van g (arbeidsvergelijking):");
log(`  ∫MM̄ a–b = ${I_ab.toFixed(4)} · b–c = ${I_bc.toFixed(4)} · c–d = ${I_cd.toFixed(4)} · ` +
    `d–f = ${I_df.toFixed(4)} · f–g = ${I_fg.toFixed(4)}  [kN²m³]`);
log(`  buigdeel = ${w_buiging.toFixed(9)} m · pendeldeel = ${w_pendel.toFixed(9)} m`);
log(`  w_g (hand) = ${w_hand.toFixed(9)} m   ·   dossier = 0,019618056 m   ` +
    `(Δ = ${(((w_hand - 0.019618056) / 0.019618056) * 100).toFixed(4)} %)`);
log(`  w_g (app)  = ${w_g_m.toFixed(9)} m`);

// ── Gevoeligheid voor aanname 1 (eindige EA van de buigstaven) ────────────
// Zelfde model, maar met een 1000× grotere A op de BUIGstaven (de pendel houdt
// zijn voorgeschreven EA = 24 000 kN). Verdwijnt het restverschil daarmee, dan
// is het volledig toe te schrijven aan de niet-oneindige EA en niet aan de app.
const stijfBeams = multi.beams.map((b) => (b.id === 6 ? b : { ...b, A: b.A * 1000 }));
const stijf = solve({
  nodes: multi.nodes, beams: stijfBeams, supports: multi.supports,
  loads: [
    { beamId: 2, q: 15, qDir: "x" },
    { beamId: 3, q: 15, qDir: "x" },
  ],
  pointLoads: [
    { nodeId: F_, fx: 20000, fz: 0 },
    { nodeId: G_, fx: 0, fz: -10000 },
    { nodeId: C_, fx: 30000, fz: 0 },
  ],
});
const w_g_stijf = -stijf.displacements.get(G_).uz / 1000;
log("\nGevoeligheid voor aanname 1 (A van de buigstaven × 1000 ⇒ EA praktisch ∞):");
log(`  w_g : ${w_g_m.toFixed(9)} → ${w_g_stijf.toFixed(9)} m ` +
    `(t.o.v. dossier: ${(((w_g_m - 0.019618056) / 0.019618056) * 100).toFixed(4)} % → ` +
    `${(((w_g_stijf - 0.019618056) / 0.019618056) * 100).toFixed(4)} %)`);
log(`  H_e : ${H_e.toFixed(6)} → ${kN(stijf.reactions.get(E_).fx).toFixed(6)} kN ` +
    `(statisch bepaald: mag niet veranderen)`);

// ── 6. Hybride model: alle zeven referentiewaarden in ÉÉN bestand ────────
// Zelfde geometrie, opleggingen, scharnieren en lasten; alleen de VERWARMDE
// staaf a–b wordt S235 / HEB 200, zodat de app-route α = 1,2e-5 gebruikt
// (thermalAlphaForMaterial). HEB 200 heeft Iy = 5,70e7 mm⁴ → EI = 11 970 kNm²,
// het dichtst bij de voorgeschreven 12 000 kNm² dat de profieldatabase biedt
// (0,25 % laag). De overige buigstaven houden hun exacte EI, de pendel zijn
// exacte EA. Omdat het systeem statisch bepaald is, blijven alle BG1-momenten
// en -reacties EXACT; alleen w_g verschuift, en dat wordt hier gemeten.
const variantState = {
  ...modelState,
  beams: beams.map((b) =>
    b.id === 1 ? { ...b, material: "S235", profile: "HEB200" } : b,
  ),
};
const variantText = serializeProject(variantState);
for (const naam of ["R23-hybride.femp", "R23-hybride.ifcfem2d"]) {
  const pad = join(HIER, naam);
  writeFileSync(pad, variantText, "utf8");
  log(`\nHybride model opgeslagen: ${pad}`);
}
const vBestand = deserializeProject(variantText);
const vMulti = bouwMultiInput({
  nodes: vBestand.nodes, beams: vBestand.beams, supports: vBestand.supports,
  plates: vBestand.plates, loadCases: vBestand.loadCases, loads: vBestand.loads,
  selfWeightEnabled: vBestand.selfWeightEnabled,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
});
const vPerCase = solveAllCases(vMulti).perCase;
const v1 = vPerCase.get(1), v2 = vPerCase.get(2);
const vHe    = kN(v1.reactions.get(E_).fx);
const vMa    = kNm(v1.elements.get(1).bendingMoment[0]);
const vMd    = kNm(v1.elements.get(3).bendingMoment[20]);
const vMf    = kNm(v1.elements.get(4).bendingMoment[20]);
const vMc    = kNm(v1.elements.get(2).bendingMoment[20]);
const vRyC   = v2.displacements.get(C_).ry;
const vWg    = -v1.displacements.get(G_).uz / 1000;
const pct = (ons, ref) => (((Math.abs(ons) - Math.abs(ref)) / Math.abs(ref)) * 100).toFixed(4);
let maxAfwHybride = 0;
const hyb = (naam, ons, ref, extra = "") => {
  const p = ((Math.abs(ons) - Math.abs(ref)) / Math.abs(ref)) * 100;
  maxAfwHybride = Math.max(maxAfwHybride, Math.abs(p));
  log(`  ${naam.padEnd(16)}= ${(typeof ons === "number" && Math.abs(ons) < 0.01
    ? ons.toExponential(6) : ons.toFixed(6)).padStart(14)}  (ref ${ref} · ${p.toFixed(4)} %)${extra}`);
};
log("Hybride model (a–b in S235 / HEB 200) — zelfde app-route uit het bestand:");
log(`  EI(a–b) = ${(vMulti.beams[0].E * vMulti.beams[0].I / 1e9).toFixed(1)} kNm² ` +
    `(voorgeschreven 12 000, dus ${pct(vMulti.beams[0].E * vMulti.beams[0].I / 1e9, 12000)} %) · ` +
    `EA(a–b) = ${(vMulti.beams[0].E * vMulti.beams[0].A / 1e3).toFixed(0)} kN · ` +
    `α = ${thermalAlphaForMaterial("S235").toExponential(3)} /K`);
hyb("BG1 reactie e", vHe, 89.166667);
hyb("BG1 M in a", vMa, 40);
hyb("BG1 M in d", vMd, 55);
hyb("BG1 M in f", vMf, 15);
hyb("BG1 M in c", vMc, 85);
hyb("BG1 w_g", vWg, 0.019618056);
hyb("BG2 ry(c)", vRyC, 0.00032);
log(`  → grootste afwijking in het hybride bestand: ${maxAfwHybride.toFixed(4)} % ` +
    `over ALLE ZEVEN referentiewaarden`);

// ── Tekens/richtingen zoals onze solver ze geeft ──────────────────────────
log("\nTekens en richtingen zoals onze solver ze geeft:");
log(`  Reactie e            : fx = ${H_e.toFixed(4)} kN (dus naar −x)`);
log(`  N pendelstaaf e–d    : ${N_pendel.toFixed(4)} kN (positief = trek)`);
log(`  M ligger bij a       : ${M_a.toFixed(4)} kNm  · reactiemoment ${Ma_reactie.toFixed(4)} kNm`);
log(`  M kolom bij c        : ${M_c_o.toFixed(4)} kNm`);
log(`  M kolom bij d        : ${M_d_o.toFixed(4)} kNm`);
log(`  M kolom bij f        : ${M_f_k.toFixed(4)} kNm`);
log(`  uz(g)                : ${r1.displacements.get(G_).uz.toFixed(6)} mm (negatief = omlaag)`);
log(`  BG2 ux(b) bij α=1,2e-5: ${ux_b_alfa.toFixed(6)} mm (α·ΔT·L = 1,920000 mm)`);
log(`  BG2 ry(c) bij α=1,2e-5: ${ry_c_alfa.toExponential(6)} rad (ry linksom positief)`);
log(`  BG2 ry(c) app-route   : ${ry_c_app.toExponential(6)} rad (α = ${alphaApp.toExponential(2)})`);
log(`  BG2 N pendel          : ${kN(rT.elements.get(6).N).toExponential(2)} kN ` +
    `(statisch bepaald ⇒ moet 0 zijn)`);

// ── Oordeel ───────────────────────────────────────────────────────────────
// Tolerantie: de bron is een uitgewerkt tentamenantwoord met exacte breuken
// (89,166667 = 535/6 · 40 · 55 · 15 · 85 kNm · 0,019618056 m · 3,2e-4 rad zijn
// alle exact). Analytische referentie ⇒ 0,5 % (dossier §1.5).
log("");
const TOL = 0.5;
if (maxAfwZonderAlfa <= TOL) {
  log(`✅ Alle grootheden die het modelbestand kan uitdrukken vallen binnen ` +
      `${TOL} % (grootste ${maxAfwZonderAlfa.toFixed(3)} %).`);
} else {
  log(`⚠️  Grootste afwijking ${maxAfwZonderAlfa.toFixed(3)} % — uitzoeken volgens de ` +
      `campagne-volgorde.`);
}
if (Math.abs(afwRyApp) > TOL) {
  log(`⚠️  BG2 wijkt in R23.femp ${afwRyApp.toFixed(2)} % af. Oorzaak is GEMETEN en ligt ` +
      `NIET in de rekenkern:`);
  log(`    de app koppelt α aan het staafmateriaal (hout ${alphaApp.toExponential(1)} /K, ` +
      `staal 1,2e-5 /K), en een vrij instelbare EI vereist een rechthoekprofiel,`);
  log(`    dat in de app alleen bij hout bestaat. Met α = 1,2e-5 rechtstreeks aan de ` +
      `solver is de afwijking ${afwRyAlfa.toFixed(3)} %.`);
  log(`    R23-hybride.femp lost dat binnen de app op (a–b in staal) en haalt ALLE ZEVEN ` +
      `referentiewaarden binnen ${maxAfwHybride.toFixed(3)} %.`);
}
// Slagen/zakken op wat de app in ÉÉN bestand kan: het hybride model.
process.exit(maxAfwZonderAlfa <= TOL && maxAfwHybride <= TOL ? 0 : 1);
