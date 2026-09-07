/**
 * P04 — portaal op een doorgaande ligger (staal S235), nagerekend tegen een
 * externe referentie-uitdraai.
 *
 * Nagebouwd uit een projectberekening uit het eigen archief, gemaakt met een
 * extern raamwerkprogramma (gedetailleerde uitdraai, 25 bladzijden). De bron is
 * geanonimiseerd tot kenmerk P04: hier staan alleen de technische invoer en de
 * gepubliceerde uitkomsten. De verwijzing naar de bron ligt buiten de repo.
 *
 * Norm in de bron: NEN-EN 1993-1-1+C2+A1/NB:2016 nl, gevolgklasse CC1,
 * ontwerplevensduur 50 jaar, geometrisch niet-lineaire krachtsverdeling
 * (2e orde) met de globale scheefstand van art. 5.3.2(a).
 *
 * De constructie: een doorgaande onderligger over drie steunpunten
 * (x = 0, 4050 en 8100 mm) waarop een portaal staat — twee kolommen op
 * x = 3397 en x = 5997, 2400 mm hoog, met daarboven een ligger van 2600 mm.
 * De onderligger is in de bron in drie staven geknipt (IPE 200 — eigen
 * doorsnede "Profiel 4" — IPE 200); het middelste stuk loopt dóór over het
 * tussensteunpunt heen.
 *
 * Wat dit script doet:
 *   1. bouwt het model en schrijft het als `P04.femp` (serializeProject),
 *      inclusief de eigen doorsnede in het veld `eigenDoorsneden`;
 *   2. leest dat bestand terug en rekent het via de volledige app-route
 *      (deserializeProject → bouwMultiInput → solveAllCasesNonlinear →
 *      combineResults per combinatie), dus precies wat de app op het scherm zet;
 *   3. haalt de EN 1993-toetsing op via de toetsbrug van de dev-server
 *      (POST /api/toetsing, dezelfde Rust-kern als de app) met de invoer die de
 *      app zelf bouwt (buildSteelCheckInputs);
 *   4. legt elke uitkomst uit de bron naast de onze met de afwijking in %;
 *   5. rekent de statica bovendien met de hand na (krachtenmethode met één
 *      overtallige en de eenheidslastmethode, met de EI-waarden ván de bron)
 *      als onafhankelijke derde partij, en laat de doorsnedemotor de eigen
 *      doorsnede uit de bron narekenen.
 *
 * Draaien vanuit design-mockup (dev-server op poort 1440 moet draaien):
 *   npx tsx referentie-projecten/toets-P04.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AANNAMEN BIJ HET NABOUWEN (expliciet)
 *
 *  - KNIPPEN OP HET TUSSENSTEUNPUNT. In de bron loopt staaf 2 (de eigen
 *    doorsnede, 2600 mm) van x = 3397 tot x = 5997 en hangt het steunpunt op
 *    x = 4050 MIDDEN OP die staaf; de uitdraai laat er netjes de V-sprong van
 *    163,7 kN zien. In de app hangt een oplegging aan een knoop en loopt een
 *    staaf van knoop naar knoop. Daarom is die ene staaf hier twee staven:
 *    onze 2 = 3397→4050 (653 mm) en onze 3 = 4050→5997 (1947 mm), beide met
 *    dezelfde eigen doorsnede. Voor de krachtsverdeling maakt dat niets uit;
 *    voor de toetsing wél — die is in de app PER STAAF, dus de kiplengte en de
 *    doorbuigingsgrens van de bron (L = 2600) zijn niet één-op-één te
 *    vergelijken. Die regels staan in de tabellen als "niet vergelijkbaar".
 *  - STAAFNUMMERS. bron 1 → onze 1; bron 2 → onze 2 + 3; bron 3 → onze 4;
 *    bron 4 → onze 5; bron 5 → onze 6; bron 6 → onze 7.
 *  - KOLOMMEN ZIJN PENDELSTAVEN. De bron toont voor beide kolommen over de
 *    hele lengte My = 0,000 kNm en Vz = 0,000 kN, terwijl de onderligger ter
 *    plaatse een sprong in de momentenlijn heeft die volledig tussen staaf 1 en
 *    staaf 2 wordt overgedragen. Dat kan alleen als de kolommen aan beide
 *    einden een buigscharnier hebben. Daarom `releases: { startRy, endRy }` op
 *    onze staven 5 en 6. De bron noemt de scharnieren niet apart in de invoer.
 *  - ONGEBRUIKTE KNOPEN. De bron heeft nog twee knopen op z = 295 (op de
 *    kolommen). Die zijn geen staafeinde en dragen niets; ze zijn hier
 *    weggelaten. De kolommen lopen in de bron over de volle 2400 mm.
 *  - EIGEN GEWICHT. De bron noemt BG1 "Dead load Including self-weight" maar
 *    drukt "Total self-weight: 0 kg" af: er zit geen automatisch eigen gewicht
 *    in. Daarom `selfWeightEnabled: false` en alleen de opgegeven lijnlasten.
 *  - SCHEEFSTAND. De bron zet de scheefstand 1/200 als GEOMETRISCHE afwijking
 *    (knopen op z = 2400 schuiven ±12 mm) en rekent elke UGT-combinatie in
 *    beide richtingen. Omdat de onderligger in het vlak van zijn eigen
 *    steunpunten ligt, levert dat alleen een horizontale duw van
 *    N_kolom/200 = 0,162 kN per kolom op — in de bron zichtbaar als
 *    Fx = ±0,324 kN en Nx = ±0,324 kN in de onderligger. De scheefstand van de
 *    app werkt anders: elke VERTICALE last krijgt een horizontale metgezel
 *    H = φ·V, dus ook de lasten die rechtstreeks op de onderligger staan. Dat
 *    zou hier ±1,3 kN geven in plaats van ±0,32 kN. Daarom staat de scheefstand
 *    in het bestand UIT; de gevolgen (alleen Nx, geen invloed op V en M) staan
 *    in blok [10] met een gevoeligheidsrun mét scheefstand ernaast.
 *  - 2e ORDE. `nonlinearEnabled: true`, zoals de bron. Blok [1] laat zien dat
 *    1e en 2e orde hier samenvallen: de enige normaalkracht zit in de
 *    pendelkolommen en die hebben geen dwarsbelasting.
 *  - EIGEN DOORSNEDE "Profiel 4". Niet in de catalogus. De bron beschrijft hem
 *    als een IPE 200 met een UNP 180 ernaast (invoerblok: IPE 200 op u = 0,
 *    UNP 180 op u = 50, beide onder 0°), en publiceert de grootheden ervan.
 *    Hij staat hier in het bestand als `EIGEN:Profiel 4` (`eigenDoorsneden`),
 *    met:
 *      · A, I_y, I_z, W_el, W_pl, i_y, i_z, A_v,z, I_t en I_w LETTERLIJK uit
 *        de bron (I_t en I_w zoals de bron ze in zijn eigen kipblok gebruikt);
 *      · h, b, t_w, t_f en r = de plaatmaten van de IPE 200 (200/100/5,6/8,5/12),
 *        dezelfde maten die de bron zélf voor deze doorsnede in zijn
 *        classificatie- en kipformules invult. Zonder t_w en t_f kan de kern
 *        niet klasseren (h/t_w wordt oneindig);
 *      · A_v,y en de aanvullende velden (zwaartepunt, hoofdassen,
 *        schuifmiddelpunt) uit ONZE doorsnedemotor op dezelfde geometrie —
 *        de bron geeft die niet.
 *    Blok [6b] legt de motor náást de bron: dat is de onafhankelijke controle
 *    op de doorsnedegrootheden. Vormaanduiding "GelasteIMonosymmetrisch": de
 *    doorsnede is symmetrisch om de buigas maar niet om het lijfvlak, dus de
 *    kern klasseert volgens het I-blad van tabel 5.2 en laat de NB-kiproute
 *    voor de dubbelsymmetrische I niet toe (veilig-zijdig).
 *  - DE VIERKANTE BUIS. De bron noemt het kolomprofiel "HFRHS 50x50x5". Onze
 *    profieldatabase kent die naam niet; wel `SHS 50x50x5` — dezelfde
 *    nominale maat, met een iets andere hoekstraal (A = 873,2 tegen 879,0 mm²
 *    in de bron, −0,66 %). Dat profiel is hier gebruikt; blok [6] laat het
 *    verschil per grootheid zien. Zonder die vervanging valt de staaf in de
 *    solver terug op de default HEA 160 en klopt er niets meer van de
 *    kolomverkorting.
 *  - KIPSTEUNEN. De bron geeft per staaf een aantal en de tussenafstanden,
 *    zonder te zeggen wélke flens. AANNAME (zoals in P02): een kipsteun houdt
 *    de staaf zijdelings vast, dus beide flenzen. Posities uit de bron:
 *    staaf 1 vier steunen op 679/1358/2037/2716 mm; staaf 3 drie steunen op
 *    526/1052/1578 mm; staaf 6 twee steunen op 867/1734 mm; staaf 2 twee
 *    steunen op 867/1734 mm vanaf x = 3397 — die vallen na het knippen beide
 *    in onze staaf 3.
 *  - DOORBUIGINGSKLASSE. De bron toetst w_fin tegen L/250 → klasse "roof", en
 *    w_add tegen L/333. De kern hanteert voor w_add een andere definitie
 *    (w_perm = 0 en grens L/150); dat verschil is in P03 al vastgesteld en
 *    staat hier opnieuw apart in blok [9].
 *  - ZEEG: 0 in de bron (w_Pre-camber = 0 bij alle staven).
 *  - KNIKLENGTEN = systeemlengte, zoals de bron (L_cr,y = L_cr,z = 2400 mm
 *    voor de kolommen, en voor staaf 1 L_cr,y = 3397 / L_cr,z = 679 mm; die
 *    laatste is de kipsteunafstand, wat de app niet automatisch doet — zie de
 *    opmerking bij [7]).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync } from "node:fs";

const { solveAllCases, solveAllCasesNonlinear } =
  await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { buildSteelCheckInputs, profileLookupKey } =
  await import("../src/lib/steelCheckBuilder.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");
const { importeer } = await import("../src/lib/profieleditor/eigenDoorsnedenStore.ts");

const log = (s) => process.stdout.write(s + "\n");
const BRUG = "http://localhost:1440/api/toetsing";
const MOTOR = "http://localhost:1440/api/doorsnede";

// ═══════════════════════════════════════════════════════════════════════════
// 0. INVOER (geanonimiseerd, alleen techniek)
// ═══════════════════════════════════════════════════════════════════════════
const X = { K1: 0, K2: 3397, K3: 4050, K4: 5997, K5: 8100 }; // mm, onderligger
const Z_TOP = 2400;                                          // mm, kolomhoogte
const MAT = "S235";
const EIGEN_NAAM = "Profiel 4";
const EIGEN_PROFIEL = `EIGEN:${EIGEN_NAAM}`;

// Lijnlasten per staaf van de BRON, in kN/m (= N/mm), negatief = omlaag.
// BG1 = permanent, BG2 = veranderlijk (A: woonfunctie).
const LASTEN = {
  1: { bg1: [-12.3, -1.5], bg2: [-8.6, -4.3] },  // bron staaf 1 → onze 1
  2: { bg1: [-1.5],        bg2: [-4.3] },        // bron staaf 2 → onze 2 + 3
  3: { bg1: [-12.3, -1.5], bg2: [-8.6, -4.3] },  // bron staaf 3 → onze 4
  6: { bg1: [-12.3],       bg2: [-8.6] },        // bron staaf 6 → onze 7
};

// Kipsteunen uit de bron, in mm vanaf de startknoop van de BRONstaaf.
const KIP_BRON = { 1: [679, 1358, 2037, 2716], 2: [867, 1734], 3: [526, 1052, 1578], 6: [867, 1734] };

// Combinaties zoals de bron ze nummert (CC1 → K_FI = 0,9: 1,35·0,9 = 1,215 ≈
// 1,22 en 1,2·0,9 = 1,08; ψ0 = 0,40 voor A:domestic).
const COMBOS = [
  { id: 1, name: "UGT 1 (6.10a)",        type: "uls", formula: "1,22·BG1 + 0,40·1,35·BG2", factors: { 1: 1.22, 2: 0.40 * 1.35 } },
  { id: 2, name: "UGT 2 (6.10b)",        type: "uls", formula: "1,08·BG1 + 1,35·BG2",      factors: { 1: 1.08, 2: 1.35 } },
  { id: 3, name: "BGT 3 (permanent)",    type: "sls", formula: "1,00·BG1",                 factors: { 1: 1.0 } },
  { id: 4, name: "BGT 4 (quasi-blijvend)", type: "sls", formula: "1,00·BG1 + 0,30·BG2",    factors: { 1: 1.0, 2: 0.30 } },
  { id: 5, name: "BGT 5 karakteristiek", type: "sls", formula: "1,00·BG1 + 1,00·BG2",      factors: { 1: 1.0, 2: 1.0 } },
];

// ═══════════════════════════════════════════════════════════════════════════
// Referentiewaarden LETTERLIJK uit de bron (niet bijstellen, niets bijverzinnen)
// ═══════════════════════════════════════════════════════════════════════════
const REF = {
  // 1.3 PROFILES + de doorsnedebladen
  prof: {
    IPE200:  { A: 2850.7, G: 22.4, Iy: 19449124, Iz: 1423832, Wely: 194491, Welz: 28477,
               Wply: 220838, Wplz: 44629, iy: 82.6, iz: 22.3, Avz: 1403, It: 70157 },
    SHS50X50X5: { A: 879.0, G: 6.9, Iy: 291731, Iz: 291731, Wely: 11669, Welz: 11669,
               Wply: 14659, Wplz: 14659, iy: 18.2, iz: 18.2, Avz: 440, It: null },
    HEA140:  { A: 3143.9, G: 24.7, Iy: 10337922, Iz: 3893360, Wely: 155457, Welz: 55619,
               Wply: 173618, Wplz: 84865, iy: 57.3, iz: 35.2, Avz: 1015, It: 81643 },
    P4:      { A: 5647.9, G: 44.3, Iy: 32991247, Iz: 9334581, Wely: 329912, Welz: 108936,
               Wply: 399997, Wplz: 196419, iy: 76.4, iz: 40.7, Avz: 2868, It: 70157,
               Iw: 6438e6, ymax: 84.3, ymin: -85.7, zmax: 100, zmin: -100,
               Sy: 199998, Sz: 99903 },
  },
  // 2.2.2 Envelope reaction forces (kN); knoopnummers van de BRON
  reactie: {
    1: { Fx: { c1: 0.255, c2: 0.324 }, Fz: { c1: 36.245, c2: 49.058 } },
    3: { Fz: { c1: 120.306, c2: 163.669 } },
    5: { Fz: { c1: 36.245, c2: 49.058 } },
    8: { Fx: { c2: 0.324 } },
  },
  // 2.2.3 Envelope beam forces — per BRONstaaf de uitersten (kN, kNm)
  staaf: {
    1: { Nx: 0.324, Vz: 60.730, My_veld: 37.234, x_veld: 1518, My_eind: -19.827 },
    2: { Nx: 0.162, Vz_max: -97.941, Vz_re: 65.728, My_steun: -82.198, My_K2: 19.826, My_K4: 31.701 },
    3: { Nx: 0.000, Vz: -49.058, My_veld: 37.233, x_veld: 585, My_eind: -31.701 },
    4: { Nx: -32.363, Vz: 0, My: 0 },
    5: { Nx: -32.363, Vz: 0, My: 0 },
    6: { Nx: 0.162, Vz: 32.362, My_veld: 21.036, x_veld: 1300 },
  },
  // 2.3.2 Envelope node displacements (mm); BRON-knoopnummers
  verpl: {
    1: { c3: -0.0, c5: -0.0 }, 2: { c3: -1.4, c5: -2.5 }, 3: { c3: -0.0, c5: -0.0 },
    4: { c3: -3.4, c5: -6.6 }, 5: { c3: -0.0, c5: -0.0 },
    8: { c3: -1.6, c5: -2.9 }, 9: { c3: -3.6, c5: -7.0 },
  },
  dz_min: -7.0,          // "Minimum / maximum values": knoop 9, combinatie 5
  // 2.4 EN1993 CHECKS — unity checks per BRONstaaf
  uc: {
    1: { "6.2.5": 0.72, "6.2.6": 0.32, "6.2.8": 0.72, "6.3.2.1": 0.00, "6.3.3": 0.72, w_fin: 0.62, w_add: 0.39 },
    2: { "6.2.5": 0.87, "6.2.6": 0.25, "6.2.8": 0.87, "6.3.2.1": 0.00, w_fin: 0.39, w_add: 0.24 },
    3: { "6.2.5": 0.72, "6.2.6": 0.26, "6.2.8": 0.72, "6.3.2.1": 0.00, w_fin: 0.41, w_add: 0.26 },
    4: { "6.2.4": 0.16, "6.2.8": 0.00, "6.3.3": 0.38 },
    5: { "6.2.4": 0.16, "6.2.8": 0.00, "6.3.3": 0.38 },
    6: { "6.2.5": 0.52, "6.2.6": 0.24, "6.2.8": 0.52, "6.3.2.1": 0.00, w_fin: 0.55, w_add: 0.30 },
  },
  klasse: 1,
  // 2.5 — weerstanden per BRONstaaf
  Rd: {
    1: { McRd: 51.897, VplRd: 190.3, MyEd: 37.234, VzEd: 60.73 },
    2: { McRd: 93.999, VplRd: 389.2, MyEd: 82.198, VzEd: 97.941 },
    3: { McRd: 51.897, VplRd: 190.3, MyEd: 37.233, VzEd: 49.058 },
    4: { NcRd: 206.569, VplRd: 59.6, NEd: 32.363, MyRk: 3.445 },
    6: { McRd: 40.800, VplRd: 137.7, MyEd: 21.036, VzEd: 32.362 },
  },
  // 2.5 — kip in detail per BRONstaaf
  kip: {
    1: { Lg: 3397, Lst: 679, My2: 25.87, Mmid: 14.799, q: 32.317, Bster: 0.933, C1: 1.636,
         C2: -0.047, Lkip: 951, S: 726, C: 45.675, Mcr: 553.457, lamLT: 0.306, chiLT: 1.00, za: 100 },
    3: { Lg: 2103, Lst: 526, My2: 21.325, Mmid: 11.779, q: 32.317, Bster: 0.95, C1: 1.679,
         C2: -0.035, Lkip: 736, S: 726, C: 47.476, Mcr: 929.255, lamLT: 0.236, chiLT: 1.00, za: 100 },
    6: { Lg: 2600, Lst: 867, My2: 18.697, Mmid: 11.686, q: 24.893, Bster: 0.889, C1: 1.529,
         C2: -0.08, Lkip: 1213, S: 740, C: 20.75, Mcr: 586.013, lamLT: 0.264, chiLT: 1.00, za: 67 },
  },
  // 2.5 — knik van de kolommen (bron staaf 4 en 5)
  knik: { lam: 1.403, chi: 0.417, kyy: 1.301, NRk: 206.6 },
  // 2.5 — doorbuigingsblokken per BRONstaaf (mm)
  doorb: {
    1: { L: 3397, w_fin: -8.5, grens_fin: 13.6, w_add: -4.0, grens_add: 10.2, dz1: -0.0, dz2: -2.5 },
    2: { L: 2600, w_fin: 4.1,  grens_fin: 10.4, w_add: 1.9,  grens_add: 7.8,  dz1: -2.5, dz2: -6.6 },
    3: { L: 2103, w_fin: -3.5, grens_fin: 8.4,  w_add: -1.7, grens_add: 6.3,  dz1: -6.6, dz2: -0.0 },
    6: { L: 2600, w_fin: -5.7, grens_fin: 10.4, w_add: -2.4, grens_add: 7.8,  dz1: -2.9, dz2: -7.0 },
  },
};

// De doorsnedegrootheden van de eigen doorsnede die de bron NIET publiceert,
// uit onze eigen doorsnedemotor op dezelfde geometrie (IPE 200 op y = 0 en
// UNP 180 met zijn zwaartepunt op y = 69,28; zie het aannamenblok). Ze staan
// hier als constante zodat het .femp-bestand deterministisch is; blok [6b]
// roept de motor live aan en controleert ze.
const MOTOR_INVOER = [{
  naam: EIGEN_NAAM, soort: "Samenstelling", lamellen: [],
  catalogusdelen: [
    { soort: "ISection",      h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12,  y_mm: 0,     z_mm: 0, alpha_rad: 0, gespiegeld: false },
    { soort: "ChannelSchuin", h: 180, b: 70,  tw: 8,   tf: 11,  r: 11,  y_mm: 69.28, z_mm: 0, alpha_rad: 0, gespiegeld: false },
  ],
  gesloten_cellen: [],
}];
const MOTOR_AANVULLEND = {
  av_y_mm2: 3240,
  y_c_mm: 34.32191266614208, z_c_mm: 0,
  wel_y_top_mm3: 329707.8501862085, wel_y_bot_mm3: 329707.85018620867,
  wel_z_left_mm3: 110667.42701184971, wel_z_right_mm3: 108921.3456211226,
  iyz_mm4: 0, iu_mm4: 32991247, iv_mm4: 9334581, alpha_hoofdas_rad: 0,
  y_s_mm: 34.32191266614208, z_s_mm: 0,
};

// De eigen doorsnede zoals hij in het projectbestand komt te staan.
const EIGEN_DOORSNEDE = {
  id: "p04-profiel-4",
  naam: EIGEN_NAAM,
  ontwerp: { soort: "samenstelling", lamellen: [], catalogusdelen: [], celMeenemen: false, lassen: [] },
  eigenschappen: {
    // uit de bron
    area_mm2: REF.prof.P4.A,
    iy_mm4: REF.prof.P4.Iy,
    iz_mm4: REF.prof.P4.Iz,
    wel_y_mm3: REF.prof.P4.Wely,
    wel_z_mm3: REF.prof.P4.Welz,
    wpl_y_mm3: REF.prof.P4.Wply,
    wpl_z_mm3: REF.prof.P4.Wplz,
    av_z_mm2: REF.prof.P4.Avz,
    it_mm4: REF.prof.P4.It,
    iw_mm6: REF.prof.P4.Iw,
    iy_radius_mm: REF.prof.P4.iy,
    iz_radius_mm: REF.prof.P4.iz,
    // plaatmaten van het basisprofiel, zoals de bron ze zelf voor deze
    // doorsnede invult (classificatie, k_red, C2-correctie)
    h_mm: 200, b_mm: 100, tw_mm: 5.6, tf_mm: 8.5, r_mm: 12,
    // niet in de bron → onze doorsnedemotor
    ...MOTOR_AANVULLEND,
  },
  vorm: "GelasteIMonosymmetrisch",
  motor: {
    methode: "lamellen", wpl_bepaald: false, iw_bepaald: false,
    schuifmiddelpunt_bepaald: false, it_onzekerheid: 0, a_gaten_mm2: 0,
    y_min_mm: REF.prof.P4.ymin, y_max_mm: REF.prof.P4.ymax,
    z_min_mm: REF.prof.P4.zmin, z_max_mm: REF.prof.P4.zmax,
    delen: [], meldingen: [],
  },
  berekendOp: "2026-09-07T00:00:00.000Z",
};

// ═══════════════════════════════════════════════════════════════════════════
// Telwerk
// ═══════════════════════════════════════════════════════════════════════════
let regels = [];
function vgl(grootheid, ref, ons, eenheid = "", opm = "", vergelijkbaar = true) {
  const dev = ref === null || ons === null || !vergelijkbaar
    ? NaN
    : ref === 0
      ? (Math.abs(ons) < 5e-3 ? 0 : NaN)
      : ((ons - ref) / Math.abs(ref)) * 100;
  const r = { grootheid, ref, ons, dev, eenheid, opm, vergelijkbaar };
  regels.push(r);
  return r;
}
function getal(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1e7) return v.toExponential(4);
  if (Math.abs(v) >= 1000) return v.toFixed(1);
  return v.toFixed(Math.abs(v) >= 100 ? 2 : 3);
}
const BREED = 62;
function tabel(titel, rijen) {
  log(`\n${titel}`);
  log("─".repeat(140));
  log("grootheid".padEnd(BREED) + "bron".padStart(13) + "app".padStart(14) + "Δ".padStart(10) + "  opmerking");
  log("─".repeat(140));
  for (const r of rijen) {
    const dev = !r.vergelijkbaar ? "n.v.t." : Number.isNaN(r.dev) ? "—" : `${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(2)} %`;
    const vlag = r.vergelijkbaar && !Number.isNaN(r.dev) && Math.abs(r.dev) > 2 ? " ⚠" : "  ";
    log(r.grootheid.slice(0, BREED - 1).padEnd(BREED) + getal(r.ref).padStart(13) + getal(r.ons).padStart(14) +
        dev.padStart(10) + vlag + (r.eenheid ? ` [${r.eenheid}]` : "") + (r.opm ? "  " + r.opm : ""));
  }
  log("─".repeat(140));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MODEL BOUWEN EN OPSLAAN ALS P04.femp
// ═══════════════════════════════════════════════════════════════════════════
// Knopen: 1..5 op de onderligger, 6 en 7 op de kolomkoppen.
const NODES = [
  { id: 1, x: X.K1, z: 0 }, { id: 2, x: X.K2, z: 0 }, { id: 3, x: X.K3, z: 0 },
  { id: 4, x: X.K4, z: 0 }, { id: 5, x: X.K5, z: 0 },
  { id: 6, x: X.K2, z: Z_TOP }, { id: 7, x: X.K4, z: Z_TOP },
];
// Onze staven, met de bronstaaf erbij en de lengte.
const STAVEN = [
  { id: 1, from: 1, to: 2, profile: "IPE200",       bron: 1, L: X.K2 - X.K1 },
  { id: 2, from: 2, to: 3, profile: EIGEN_PROFIEL,  bron: 2, L: X.K3 - X.K2 },
  { id: 3, from: 3, to: 4, profile: EIGEN_PROFIEL,  bron: 2, L: X.K4 - X.K3 },
  { id: 4, from: 4, to: 5, profile: "IPE200",       bron: 3, L: X.K5 - X.K4 },
  { id: 5, from: 2, to: 6, profile: "SHS50X50X5", bron: 4, L: Z_TOP, pendel: true },
  { id: 6, from: 4, to: 7, profile: "SHS50X50X5", bron: 5, L: Z_TOP, pendel: true },
  { id: 7, from: 6, to: 7, profile: "HEA140",       bron: 6, L: X.K4 - X.K2 },
];

/** Kipsteunfracties van een onze-staaf uit de bronposities. */
function kipFracties(s) {
  const posities = KIP_BRON[s.bron];
  if (!posities) return [];
  // Beginpositie van onze staaf binnen de BRONstaaf (alleen bron 2 is geknipt).
  const offset = s.bron === 2 ? s.from === 2 ? 0 : X.K3 - X.K2 : 0;
  return posities
    .map((p) => (p - offset) / s.L)
    .filter((f) => f > 0 && f < 1)
    .map((f) => Math.round(f * 1e6) / 1e6);
}

const beams = STAVEN.map((s) => {
  const kip = kipFracties(s);
  return {
    id: s.id, from: s.from, to: s.to, material: MAT, profile: s.profile,
    ...(s.pendel ? { releases: { startRy: true, endRy: true } } : {}),
    checkConfig: {
      deflectionClass: "roof",   // bron: w_fin tegen L/250
      preCamber_mm: 0,           // bron: w_Pre-camber = 0
      ...(kip.length ? { lateralRestraints: kip, lateralRestraintsBottom: kip } : {}),
    },
  };
});

let lastId = 0;
const lijn = (caseId, beamId, q) => ({ id: ++lastId, type: "lineLoad", caseId, beamId, q, qDir: "z" });
const loads = [];
for (const s of STAVEN) {
  const set = LASTEN[s.bron];
  if (!set) continue;
  for (const q of set.bg1) loads.push(lijn(1, s.id, q));
  for (const q of set.bg2) loads.push(lijn(2, s.id, q));
}

const model = {
  nodes: NODES,
  beams,
  supports: [
    { nodeId: 1, type: "pinned" },   // bron: Tx + Tz
    { nodeId: 3, type: "zRoller" },  // bron: Tz
    { nodeId: 5, type: "zRoller" },  // bron: Tz
    { nodeId: 6, type: "xRoller" },  // bron: Tx op de kolomkop links
  ],
  plates: [],
  loads,
  loadCases: [
    { id: 1, name: "BG1 Permanent", type: "dead" },
    { id: 2, name: "BG2 Veranderlijk (A: woonfunctie, ψ0 = 0,40)", type: "live" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // bron: "Total self-weight: 0 kg"
  nonlinearEnabled: true,     // bron: geometrisch niet-lineair
  combinations: COMBOS,
  scheefstandEnabled: false,  // zie aannamenblok
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
  eigenDoorsneden: [EIGEN_DOORSNEDE],
  toelichting:
    "Referentiegeval P04 uit het projectarchief (geanonimiseerd): portaal op een " +
    "doorgaande onderligger, S235. Onderligger over drie steunpunten (0 / 4050 / 8100), " +
    "IPE 200 — eigen doorsnede 'Profiel 4' — IPE 200; twee pendelkolommen " +
    "SHS 50x50x5 op 3397 en 5997, 2400 mm hoog, met daarboven een HEA 140 van 2600 mm " +
    "en een horizontale steun op de linker kolomkop. Het middelste stuk van de onderligger " +
    "is hier op het tussensteunpunt geknipt omdat een oplegging in de app aan een knoop hangt. " +
    "Eigen gewicht uit (de bron rekent 0 kg), 2e orde aan, scheefstand uit (zie het script). " +
    "Combinaties conform NB (CC1): 1,22G+0,54Q; 1,08G+1,35Q; BGT G, G+0,3Q, G+Q.",
};

const femp = serializeProject(model);
const pad = new URL("./P04.femp", import.meta.url);
writeFileSync(pad, femp, "utf8");
log("═".repeat(140));
log("P04 — portaal op een doorgaande ligger (S235), nagerekend tegen een externe referentie-uitdraai");
log("═".repeat(140));
log(`Model opgeslagen: ${decodeURIComponent(pad.pathname.replace(/^\//, ""))}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2. APP-ROUTE: bestand terug inlezen en doorrekenen zoals de app dat doet
// ═══════════════════════════════════════════════════════════════════════════
const terug = deserializeProject(femp);
// De eigen doorsnede uit het bestand in de store zetten — precies wat de app
// bij het openen van een project doet. Zonder deze stap kent `resolveSection`
// het profiel `EIGEN:…` niet en valt de staaf terug op de solver-default.
importeer(terug.eigenDoorsneden ?? []);

const invoer = (metScheefstand) => ({
  nodes: terug.nodes, beams: terug.beams, supports: terug.supports, plates: terug.plates,
  loadCases: terug.loadCases, loads: terug.loads,
  selfWeightEnabled: terug.selfWeightEnabled,
  scheefstandEnabled: metScheefstand,
  scheefstandNoemer: terug.scheefstandNoemer ?? 200,
  scheefstandRichting: terug.scheefstandRichting ?? 1,
});

const combos = COMBOS.map((c) => ({
  ...c, factors: new Map(Object.entries(c.factors).map(([k, v]) => [Number(k), v])),
}));

const multi = bouwMultiInput(invoer(false));
const perCaseNL = solveAllCasesNonlinear(multi).perCase;
const perCaseL = solveAllCases(multi).perCase;
const res = new Map(combos.map((c) => [c.id, combineResults(c, perCaseNL)]));
const resL = new Map(combos.map((c) => [c.id, combineResults(c, perCaseL)]));

// Gevoeligheidsrun mét scheefstand (alleen voor blok [10]).
const resSch = new Map(combos.map((c) => [c.id, combineResults(c, solveAllCasesNonlinear(bouwMultiInput(invoer(true))).perCase)]));

const el = (cid, bid) => res.get(cid).elements.get(bid);
const Fz = (cid, nid) => (res.get(cid).reactions.get(nid)?.fz ?? 0) / 1e3;   // kN
const Fx = (cid, nid) => (res.get(cid).reactions.get(nid)?.fx ?? 0) / 1e3;   // kN
const uz = (cid, nid) => res.get(cid).displacements.get(nid)?.uz ?? 0;        // mm
const maxAbs = (arr) => Math.max(...arr.map(Math.abs));
const minVan = (arr) => Math.min(...arr);
const maxVan = (arr) => Math.max(...arr);
/**
 * Grootste transversale verplaatsing van een staaf, met teken — precies wat
 * `extractFieldDeflectionMm` de toetsing aanlevert (absoluut, dus inclusief
 * het meezakken van de staafeinden).
 */
const wStaaf = (cid, bid) => {
  let w = 0;
  for (const v of el(cid, bid).deflection) if (Math.abs(v) > Math.abs(w)) w = v;
  return w;
};
/**
 * Dezelfde stations, maar gemeten vanaf de KOORDE tussen de twee staafeinden —
 * de grootheid die de bron w_fin,z noemt en die EN 1990 bijlage A1.4 bedoelt.
 */
const wKoorde = (cid, bid) => {
  const d = el(cid, bid).deflection;
  const n = d.length;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const v = d[i] - (d[0] + ((d[n - 1] - d[0]) * i) / (n - 1));
    if (Math.abs(v) > Math.abs(w)) w = v;
  }
  return w;
};
/**
 * Idem, maar over een REEKS aansluitende horizontale staven samen — nodig voor
 * de staaf die de bron als één stuk van 2600 mm toetst en die hier op het
 * tussensteunpunt is geknipt. De stations dragen de absolute zakking, dus de
 * koorde loopt van het eerste tot het laatste station van de reeks.
 */
const wKoordeSamen = (cid, bids) => {
  const punten = [];
  let x = 0;
  for (const bid of bids) {
    const ef = el(cid, bid);
    for (let i = 0; i < ef.deflection.length; i++) punten.push([x + ef.stations_mm[i], ef.deflection[i]]);
    x += ef.stations_mm.at(-1);
  }
  const [x0, w0] = punten[0], [x1, w1] = punten.at(-1);
  let w = 0;
  for (const [xi, wi] of punten) {
    const v = wi - (w0 + ((w1 - w0) * (xi - x0)) / (x1 - x0));
    if (Math.abs(v) > Math.abs(w)) w = v;
  }
  return w;
};
/** Grootheid over de UGT-combinaties heen (omhullende). */
const overUgt = (fn) => [1, 2].map(fn);

// ═══════════════════════════════════════════════════════════════════════════
// 3. HANDAFLEIDING (onafhankelijke derde partij)
//
// De constructie valt in twee stukken uiteen die met de hand na te rekenen zijn:
//
//  a) De bovenbouw. Twee pendelkolommen dragen een ligger van 2600 mm; die
//     ligger is statisch bepaald, dus elke kolom krijgt exact q·L/2, ongeacht
//     hoeveel de onderligger onder hem zakt.
//  b) De onderligger. Doorgaand over drie steunpunten (0, 4050, 8100), met de
//     verdeelde lasten én de twee kolomkrachten als puntlasten op 3397 en 5997.
//     Eén overtallige: de reactie op x = 4050. Krachtenmethode met de
//     eenheidslastmethode; EI is per stuk anders (IPE 200 — eigen doorsnede —
//     IPE 200) en komt hier uit de BRON, zodat deze afleiding volledig los
//     staat van onze profieldatabase en van onze doorsnedemotor.
// ═══════════════════════════════════════════════════════════════════════════
const E_HAND = 210000;
const L_HAND = X.K5;
const A_MID = X.K3;
const SEG = [
  { x0: X.K1, x1: X.K2, I: REF.prof.IPE200.Iy },
  { x0: X.K2, x1: X.K4, I: REF.prof.P4.Iy },
  { x0: X.K4, x1: X.K5, I: REF.prof.IPE200.Iy },
];
const Ivan = (x) => (SEG.find((s) => x >= s.x0 && x <= s.x1) ?? SEG[2]).I;

/** Factoren (BG1, BG2) van een combinatie. */
const fac = (cid) => {
  const c = COMBOS.find((k) => k.id === cid);
  return [c.factors[1] ?? 0, c.factors[2] ?? 0];
};
/** Kolomkracht (N, druk positief) uit de bovenbouw voor een combinatie. */
function handKolom(fG, fQ) {
  const q = fG * 12.3 + fQ * 8.6;               // N/mm, omlaag positief
  return (q * (X.K4 - X.K2)) / 2;               // N
}
/** Lasten op de onderligger: verdeeld per stuk + de twee kolomkrachten. */
function handLasten(fG, fQ) {
  const qBuiten = fG * 13.8 + fQ * 12.9;        // 12,3 + 1,5 resp. 8,6 + 4,3
  const qMidden = fG * 1.5 + fQ * 4.3;
  const P = handKolom(fG, fQ);
  return [
    { type: "q", a: X.K1, b: X.K2, q: qBuiten },
    { type: "q", a: X.K2, b: X.K4, q: qMidden },
    { type: "q", a: X.K4, b: X.K5, q: qBuiten },
    { type: "P", a: X.K2, P },
    { type: "P", a: X.K4, P },
  ];
}
function ssReacties(lasten, L) {
  let W = 0, Mlinks = 0;
  for (const s of lasten) {
    if (s.type === "q") { const w = s.q * (s.b - s.a); W += w; Mlinks += w * ((s.a + s.b) / 2); }
    else { W += s.P; Mlinks += s.P * s.a; }
  }
  const R2 = Mlinks / L;
  return { R1: W - R2, R2, W };
}
function ssM(x, lasten, R1) {                    // N·mm, doorhangen positief
  let m = R1 * x;
  for (const s of lasten) {
    if (s.type === "q") {
      if (x <= s.a) continue;
      const xb = Math.min(x, s.b);
      m -= (s.q * ((x - s.a) ** 2 - (x - xb) ** 2)) / 2;
    } else if (x > s.a) m -= s.P * (x - s.a);
  }
  return m;
}
function ssV(x, lasten, R1) {                    // N
  let v = R1;
  for (const s of lasten) {
    if (s.type === "q") { if (x > s.a) v -= s.q * (Math.min(x, s.b) - s.a); }
    else if (x > s.a) v -= s.P;
  }
  return v;
}
/** Momentenlijn van een neerwaartse eenheidslast op a (statisch bepaald). */
const mEenheid = (x, a, L) => (x <= a ? ((L - a) / L) * x : (a / L) * (L - x));
/** ∫ f(x) dx met de middelpuntsregel; stap 0,1 mm, dus alle knikken op een stapgrens. */
function integreer(f) {
  const n = 81000, dx = L_HAND / n;
  let som = 0;
  for (let i = 0; i < n; i++) som += f((i + 0.5) * dx) * dx;
  return som;
}
/** Volledige handoplossing van de onderligger voor één combinatie. */
function handOnderligger(cid) {
  const [fG, fQ] = fac(cid);
  const lasten = handLasten(fG, fQ);
  const { R1: R1_0, R2: R2_0 } = ssReacties(lasten, L_HAND);
  const d10 = integreer((x) => (ssM(x, lasten, R1_0) * mEenheid(x, A_MID, L_HAND)) / (E_HAND * Ivan(x)));
  const d11 = integreer((x) => (mEenheid(x, A_MID, L_HAND) ** 2) / (E_HAND * Ivan(x)));
  const Xm = d10 / d11;                                   // N, omhoog
  const M = (x) => ssM(x, lasten, R1_0) - Xm * mEenheid(x, A_MID, L_HAND);
  const vEenheid = (x) => (x < A_MID ? (L_HAND - A_MID) / L_HAND : -A_MID / L_HAND);
  const V = (x) => ssV(x, lasten, R1_0) - Xm * vEenheid(x);
  const w = (b) => integreer((x) => (M(x) * mEenheid(x, b, L_HAND)) / (E_HAND * Ivan(x)));  // mm, omlaag +
  return {
    R1: R1_0 - (Xm * (L_HAND - A_MID)) / L_HAND,
    Rmid: Xm,
    R2: R2_0 - (Xm * A_MID) / L_HAND,
    M, V, w, P: handKolom(fG, fQ),
  };
}
/** Grootste veldmoment van de handoplossing tussen a en b. */
function handMmax(h, a, b) {
  let best = { x: a, M: -Infinity };
  for (let x = a; x <= b; x += 0.5) { const m = h.M(x); if (m > best.M) best = { x, M: m }; }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERGELIJKINGEN
// ═══════════════════════════════════════════════════════════════════════════

// ── [1] Interne controles van de app-route ────────────────────────────────
log("\n[1] Interne controles van de app-route");
log("─".repeat(140));
{
  const secEigen = resolveSection(MAT, EIGEN_PROFIEL);
  log(`  eigen doorsnede via de app-route: bron "${secEigen.bron}", ` +
      `A = ${secEigen.A} mm², I_y = ${secEigen.I} mm⁴, E = ${secEigen.E} N/mm²`);
  if (secEigen.bron !== "eigen") log("  ⚠ de eigen doorsnede is NIET herkend — de solver zou met een default rekenen");
  // 2e orde tegen 1e orde: elke grootheid geschaald op zijn eigen maximum over
  // het HELE model, zodat een staaf met M ≈ 0 (de pendelkolommen) geen
  // relatieve afwijking van 10⁴ opblaast uit twee getallen van 1e−20.
  const schaal = {};
  for (const k of ["bendingMoment", "shearForce", "deflection"]) {
    schaal[k] = Math.max(...combos.flatMap((c) => STAVEN.map((b) => maxAbs(resL.get(c.id).elements.get(b.id)[k]))), 1e-9);
  }
  let maxRel = 0, waar = "";
  for (const c of combos) {
    for (const b of STAVEN) {
      const a = res.get(c.id).elements.get(b.id), d = resL.get(c.id).elements.get(b.id);
      if (!a || !d) continue;
      for (let i = 0; i < a.bendingMoment.length; i++) {
        for (const k of ["bendingMoment", "shearForce", "deflection"]) {
          const rel = Math.abs(a[k][i] - d[k][i]) / schaal[k];
          if (rel > maxRel) { maxRel = rel; waar = `c${c.id} staaf ${b.id} ${k}`; }
        }
      }
    }
  }
  log(`  2e orde t.o.v. 1e orde: grootste afwijking ${maxRel.toExponential(2)} van het modelmaximum (${waar})`);
  const nMax = Math.max(...combos.flatMap((c) => STAVEN.map((b) => maxAbs(el(c.id, b.id).normalForce)))) / 1e3;
  log(`  grootste |N| over alle combinaties: ${nMax.toFixed(3)} kN (bron: 32,363 kN in de kolommen)`);
  for (const b of STAVEN.filter((s) => s.pendel)) {
    const m = Math.max(...combos.map((c) => maxAbs(el(c.id, b.id).bendingMoment))) / 1e6;
    const v = Math.max(...combos.map((c) => maxAbs(el(c.id, b.id).shearForce))) / 1e3;
    log(`  pendelkolom ${b.id}: max |M| = ${m.toExponential(2)} kNm, max |V| = ${v.toExponential(2)} kN (bron: 0 en 0)`);
  }
}

// ── [2] Solver naast de handafleiding ─────────────────────────────────────
regels = [];
for (const cid of [1, 2, 5]) {
  const h = handOnderligger(cid);
  vgl(`c${cid}: kolomkracht (bovenbouw, q·L/2)`, h.P / 1e3, Math.abs(el(cid, 5).normalForce[0]) / 1e3, "kN");
  vgl(`c${cid}: R knoop 1 (hand)`, h.R1 / 1e3, Fz(cid, 1), "kN");
  vgl(`c${cid}: R knoop 3 (hand)`, h.Rmid / 1e3, Fz(cid, 3), "kN");
  vgl(`c${cid}: R knoop 5 (hand)`, h.R2 / 1e3, Fz(cid, 5), "kN");
  vgl(`c${cid}: M op het tussensteunpunt (hand)`, h.M(A_MID) / 1e6, el(cid, 2).bendingMoment.at(-1) / 1e6, "kNm");
  vgl(`c${cid}: zakking knoop 2 (hand)`, -h.w(X.K2), uz(cid, 2), "mm");
  vgl(`c${cid}: zakking knoop 4 (hand)`, -h.w(X.K4), uz(cid, 4), "mm");
}
tabel("[2] Solver naast de handafleiding (krachtenmethode + eenheidslastmethode, EI uit de bron)", regels);
const handRegels = regels;

// ── [3] Oplegreacties ─────────────────────────────────────────────────────
regels = [];
vgl("knoop 1: Fz, combinatie 1", REF.reactie[1].Fz.c1, Fz(1, 1), "kN");
vgl("knoop 1: Fz, combinatie 2", REF.reactie[1].Fz.c2, Fz(2, 1), "kN");
vgl("knoop 3: Fz, combinatie 1", REF.reactie[3].Fz.c1, Fz(1, 3), "kN");
vgl("knoop 3: Fz, combinatie 2", REF.reactie[3].Fz.c2, Fz(2, 3), "kN");
vgl("knoop 5: Fz, combinatie 1", REF.reactie[5].Fz.c1, Fz(1, 5), "kN");
vgl("knoop 5: Fz, combinatie 2", REF.reactie[5].Fz.c2, Fz(2, 5), "kN");
vgl("knoop 1: Fx, combinatie 2", REF.reactie[1].Fx.c2, Fx(2, 1), "kN",
    "bron: scheefstand; in ons model bewust uit — zie [10]", false);
vgl("kolomkop (bron knoop 8): Fx, combinatie 2", REF.reactie[8].Fx.c2, Fx(2, 6), "kN",
    "bron: scheefstand; in ons model bewust uit — zie [10]", false);
vgl("som Fz, combinatie 2", REF.reactie[1].Fz.c2 + REF.reactie[3].Fz.c2 + REF.reactie[5].Fz.c2,
    Fz(2, 1) + Fz(2, 3) + Fz(2, 5), "kN", "verticaal evenwicht");
tabel("[3] Oplegreacties (bron: 2.2.2 Envelope reaction forces)", regels);
const reactieRegels = regels;

// ── [4] Staafkrachten UGT ─────────────────────────────────────────────────
regels = [];
{
  // Bronstaaf 1 → onze staaf 1
  vgl("staaf 1: M veld (omhullende UGT)", REF.staaf[1].My_veld,
      Math.max(...overUgt((c) => maxVan(el(c, 1).bendingMoment))) / 1e6, "kNm",
      `bron: op x = ${REF.staaf[1].x_veld} mm`);
  vgl("staaf 1: M eindknoop (omhullende UGT)", REF.staaf[1].My_eind,
      Math.min(...overUgt((c) => minVan(el(c, 1).bendingMoment))) / 1e6, "kNm");
  vgl("staaf 1: |V| max (omhullende UGT)", Math.abs(REF.staaf[1].Vz),
      Math.max(...overUgt((c) => maxAbs(el(c, 1).shearForce))) / 1e3, "kN");
  // Bronstaaf 2 → onze staven 2 + 3
  vgl("staaf 2 (onze 2+3): M op het steunpunt", REF.staaf[2].My_steun,
      Math.min(...overUgt((c) => Math.min(minVan(el(c, 2).bendingMoment), minVan(el(c, 3).bendingMoment)))) / 1e6, "kNm");
  // De bron drukt de eindmomenten van twee aansluitende staven met tegengesteld
  // teken af (lokale assen per staaf); vandaar hier de absolute waarde.
  vgl("staaf 2 (onze 2+3): |M| bij knoop 2", Math.abs(REF.staaf[2].My_K2),
      Math.max(...overUgt((c) => Math.abs(el(c, 2).bendingMoment[0]))) / 1e6, "kNm", "bron: lokaal teken");
  vgl("staaf 2 (onze 2+3): |M| bij knoop 4", Math.abs(REF.staaf[2].My_K4),
      Math.max(...overUgt((c) => Math.abs(el(c, 3).bendingMoment.at(-1)))) / 1e6, "kNm", "bron: lokaal teken");
  vgl("staaf 2 (onze 2+3): |V| max", Math.abs(REF.staaf[2].Vz_max),
      Math.max(...overUgt((c) => Math.max(maxAbs(el(c, 2).shearForce), maxAbs(el(c, 3).shearForce)))) / 1e3, "kN");
  vgl("staaf 2 (onze 2+3): V rechts van het steunpunt", Math.abs(REF.staaf[2].Vz_re),
      Math.max(...overUgt((c) => Math.abs(el(c, 3).shearForce[0]))) / 1e3, "kN");
  // Bronstaaf 3 → onze staaf 4
  vgl("staaf 3 (onze 4): M veld (omhullende UGT)", REF.staaf[3].My_veld,
      Math.max(...overUgt((c) => maxVan(el(c, 4).bendingMoment))) / 1e6, "kNm",
      `bron: op x = ${REF.staaf[3].x_veld} mm`);
  vgl("staaf 3 (onze 4): |V| max", Math.abs(REF.staaf[3].Vz),
      Math.max(...overUgt((c) => maxAbs(el(c, 4).shearForce))) / 1e3, "kN");
  // Bronstaaf 4/5 → onze staven 5 en 6
  vgl("kolom links (onze 5): N", REF.staaf[4].Nx, minVan(overUgt((c) => minVan(el(c, 5).normalForce))) / 1e3, "kN");
  vgl("kolom rechts (onze 6): N", REF.staaf[5].Nx, minVan(overUgt((c) => minVan(el(c, 6).normalForce))) / 1e3, "kN");
  vgl("kolommen: |M| max", 0, Math.max(...overUgt((c) => Math.max(maxAbs(el(c, 5).bendingMoment), maxAbs(el(c, 6).bendingMoment)))) / 1e6, "kNm");
  // Bronstaaf 6 → onze staaf 7
  vgl("staaf 6 (onze 7): M veld", REF.staaf[6].My_veld,
      Math.max(...overUgt((c) => maxVan(el(c, 7).bendingMoment))) / 1e6, "kNm",
      `bron: op x = ${REF.staaf[6].x_veld} mm`);
  vgl("staaf 6 (onze 7): |V| max", Math.abs(REF.staaf[6].Vz),
      Math.max(...overUgt((c) => maxAbs(el(c, 7).shearForce))) / 1e3, "kN");
  vgl("onderligger: |N| max (omhullende UGT)", REF.staaf[1].Nx,
      Math.max(...overUgt((c) => Math.max(...[1, 2, 3, 4].map((b) => maxAbs(el(c, b).normalForce))))) / 1e3, "kN",
      "bron: scheefstand; in ons model bewust uit — zie [10]", false);
}
tabel("[4] Staafkrachten UGT (bron: 2.2.3 Envelope beam forces)", regels);
const krachtRegels = regels;

// ── [5] Verplaatsingen BGT ────────────────────────────────────────────────
regels = [];
{
  const paar = [[2, 2], [4, 4], [8, 6], [9, 7]];   // [bronknoop, onze knoop]
  for (const [bron, onze] of paar) {
    vgl(`knoop ${bron}: dz, BGT permanent (c3)`, REF.verpl[bron].c3, uz(3, onze), "mm", "bron: 1 decimaal");
    vgl(`knoop ${bron}: dz, BGT karakteristiek (c5)`, REF.verpl[bron].c5, uz(5, onze), "mm", "bron: 1 decimaal");
  }
  const dzMin = Math.min(...[3, 4, 5].flatMap((c) => [...res.get(c).displacements.values()].map((d) => d.uz)));
  vgl("kleinste dz over alle BGT-combinaties", REF.dz_min, dzMin, "mm", "bron: knoop 9, combinatie 5");
  const dxMax = Math.max(...[3, 4, 5].flatMap((c) => [...res.get(c).displacements.values()].map((d) => Math.abs(d.ux))));
  vgl("grootste |dx| over alle BGT-combinaties", 0, dxMax, "mm", "bron: 0,0 bij alle knopen");
}
tabel("[5] Knoopverplaatsingen BGT (bron: 2.3.2 Envelope node displacements)", regels);
const verplRegels = regels;

// ═══════════════════════════════════════════════════════════════════════════
// 5. DOORSNEDEGROOTHEDEN EN TOETSING
// ═══════════════════════════════════════════════════════════════════════════
async function brug(opdracht, inputs) {
  const r = await fetch(BRUG, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(inputs === undefined ? { opdracht } : { opdracht, inputs }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || (data && typeof data === "object" && "fout" in data)) {
    throw new Error(data?.fout ?? `de toetsbrug antwoordde met status ${r.status}`);
  }
  return data;
}

// ── [6b] De eigen doorsnede door onze doorsnedemotor ──────────────────────
regels = [];
try {
  const r = await fetch(MOTOR, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(MOTOR_INVOER),
  });
  const data = await r.json();
  if (data?.fout) throw new Error(data.fout);
  const m = data[0];
  const p4 = REF.prof.P4;
  vgl("Profiel 4: A", p4.A, m.area_mm2, "mm²");
  vgl("Profiel 4: I_y", p4.Iy, m.iy_mm4, "mm⁴");
  vgl("Profiel 4: I_z", p4.Iz, m.iz_mm4, "mm⁴");
  vgl("Profiel 4: W_el,y", p4.Wely, m.wel_y_mm3, "mm³");
  vgl("Profiel 4: W_el,z", p4.Welz, m.wel_z_mm3, "mm³");
  vgl("Profiel 4: i_y", p4.iy, m.iy_radius_mm, "mm");
  vgl("Profiel 4: i_z", p4.iz, m.iz_radius_mm, "mm");
  vgl("Profiel 4: A_v,z", p4.Avz, m.av_z_mm2, "mm²", "bron: uit de dwarskrachttoets");
  vgl("Profiel 4: gewicht", p4.G, m.massa_kg_per_m, "kg/m");
  // De bron telt y positief naar de I-vorm toe, de motor naar de U-vorm toe;
  // de twee uiterste vezels zijn daarom verwisseld.
  vgl("Profiel 4: uiterste vezel aan de I-zijde", p4.ymax, Math.abs(m.y_min_mm - m.y_c_mm), "mm", "bron spiegelt de y-as");
  vgl("Profiel 4: uiterste vezel aan de U-zijde", Math.abs(p4.ymin), Math.abs(m.y_max_mm - m.y_c_mm), "mm", "bron spiegelt de y-as");
  vgl("Profiel 4: W_pl,y", p4.Wply, m.wpl_bepaald ? m.wpl_y_mm3 : null, "mm³",
      "motor bepaalt W_pl niet voor een catalogusdeel", false);
  vgl("Profiel 4: I_t", p4.It, m.it_mm4, "mm⁴",
      "bron neemt alleen de I-vorm (Roark 26); de motor telt beide delen op", false);
  vgl("Profiel 4: I_w", p4.Iw, m.iw_bepaald ? m.iw_mm6 : null, "mm⁶",
      "motor bepaalt I_w niet voor een catalogusdeel", false);
  tabel("[6b] Eigen doorsnede 'Profiel 4' — onze doorsnedemotor naast de bron (onafhankelijke controle)", regels);
} catch (e) {
  log("\n[6b] Doorsnedemotor NIET gedraaid");
  log(`  reden: ${e.message}`);
  log("  Bouwen met: cargo build --release -p section-properties --bin doorsnedemotor (in src-tauri).");
}
const motorRegels = regels;

let profielRegels = [], ucRegels = [], kipRegels = [], doorbRegels = [];
let toetsGedraaid = false;
let toetsen = null;
try {
  const profielen = await brug("list_steel_profiles");
  const profileDb = new Map();
  for (const p of profielen) {
    const k = profileLookupKey(p.name);
    if (!profileDb.has(k)) profileDb.set(k, p);
  }

  // ── [6] Catalogusprofielen: onze database naast de bron ─────────────────
  regels = [];
  for (const [naam, sleutel] of [["IPE 200", "IPE200"], ["koker 50x50x5", "SHS50X50X5"], ["HEA 140", "HEA140"]]) {
    const p = profileDb.get(profileLookupKey(sleutel))?.properties;
    const b = REF.prof[sleutel];
    if (!p) { log(`  ⚠ profiel ${sleutel} niet in de EN 1993-database`); continue; }
    vgl(`${naam}: A`, b.A, p.area_mm2, "mm²");
    vgl(`${naam}: I_y`, b.Iy, p.iy_mm4, "mm⁴");
    vgl(`${naam}: I_z`, b.Iz, p.iz_mm4, "mm⁴");
    vgl(`${naam}: W_el,y`, b.Wely, p.wel_y_mm3, "mm³");
    vgl(`${naam}: W_pl,y`, b.Wply, p.wpl_y_mm3, "mm³");
    vgl(`${naam}: i_y`, b.iy, p.iy_radius_mm, "mm");
    vgl(`${naam}: i_z`, b.iz, p.iz_radius_mm, "mm");
    vgl(`${naam}: A_v,z`, b.Avz, p.av_z_mm2, "mm²");
    if (b.It !== null) vgl(`${naam}: I_t`, b.It, p.it_mm4, "mm⁴", "bron: Roark geval 26");
    vgl(`${naam}: gewicht`, b.G, p.area_mm2 * 7850e-6, "kg/m");
  }
  tabel("[6] Catalogusprofielen van de kern naast de doorsnedegegevens in de bron", regels);
  profielRegels = regels;

  // ── Toetsinvoer precies zoals de app hem bouwt ──────────────────────────
  const bouw = buildSteelCheckInputs({
    nodes: terug.nodes, beams: terug.beams, combinations: combos, combinationResults: res, profileDb,
  });
  for (const s of bouw.skipped) log(`  overgeslagen: staaf ${s.beamId} — ${s.reason}`);
  toetsen = await brug("check_steel_beams", bouw.inputs);
  toetsGedraaid = true;

  const perStaaf = new Map(toetsen.map((t) => [t.beam_id, t]));
  const invoerPer = new Map(bouw.inputs.map((i) => [i.beam_id, i]));
  const vindCheck = (bid, id) => perStaaf.get(bid)?.checks.find((c) => c.id === id);
  const ucVan = (bid, id) => vindCheck(bid, id)?.kind.data.uc?.uc ?? null;
  const rdVan = (bid, id) => vindCheck(bid, id)?.kind.data.uc?.rd ?? null;
  const edVan = (bid, id) => vindCheck(bid, id)?.kind.data.uc?.ed ?? null;
  const tussen = (bid, id, sym) =>
    vindCheck(bid, id)?.kind.data.intermediate_values?.find((v) => v.symbol === sym)?.value ?? null;

  log("\n  Toetsing per staaf zoals de kern hem teruggeeft");
  log("  " + "─".repeat(138));
  for (const s of STAVEN) {
    const t = perStaaf.get(s.id);
    if (!t) { log(`  staaf ${s.id}: niet getoetst`); continue; }
    const i = invoerPer.get(s.id);
    log(`  staaf ${s.id} (bron ${s.bron}, ${s.profile}, L = ${(i.length_m * 1000).toFixed(0)} mm, ` +
        `klasse ${t.classification}, kipsteunen ${JSON.stringify(i.lateral_bracing.top_flange_positions.map((f) => Math.round(f * i.length_m * 1000)))} mm)`);
    for (const c of t.checks) {
      const d = c.kind.data;
      const weigering = !d.uc ? (d.notes?.[0]?.text ?? d.notes?.[0] ?? c.kind.type ?? "geweigerd") : "";
      log(`      ${c.id.padEnd(22)} UC ${d.uc ? d.uc.uc.toFixed(3) : "—"}   ` +
          `Ed ${d.uc ? getal(d.uc.ed) : "—"}   Rd ${d.uc ? getal(d.uc.rd) : "—"} ${d.unit ?? ""}` +
          (weigering ? `   ${String(weigering).slice(0, 78)}` : ""));
    }
    log(`      → UC max ${t.uc_max.toFixed(3)}, maatgevend "${t.governing_check_id}"`);
  }

  // ── [7] Weerstanden en unity checks ─────────────────────────────────────
  regels = [];
  const koppel = [
    { bron: 1, onze: 1, naam: "staaf 1 (IPE 200)" },
    { bron: 3, onze: 4, naam: "staaf 3 (IPE 200) → onze 4" },
    { bron: 6, onze: 7, naam: "staaf 6 (HEA 140) → onze 7" },
  ];
  for (const k of koppel) {
    const r = REF.Rd[k.bron], u = REF.uc[k.bron];
    vgl(`${k.naam}: M_c,Rd`, r.McRd, rdVan(k.onze, "6.2.5_bending_y"), "kNm");
    vgl(`${k.naam}: UC 6.2.5`, u["6.2.5"], ucVan(k.onze, "6.2.5_bending_y"), "-", "bron 2 decimalen");
    vgl(`${k.naam}: V_pl,Rd`, r.VplRd, rdVan(k.onze, "6.2.6_shear_z"), "kN");
    vgl(`${k.naam}: UC 6.2.6`, u["6.2.6"], ucVan(k.onze, "6.2.6_shear_z"), "-", "bron 2 decimalen");
    vgl(`${k.naam}: UC 6.2.8`, u["6.2.8"], ucVan(k.onze, "6.2.8_combined_mv"), "-");
    // De bron zet de kip-UC op 0,00 zodra λ̄_LT < 0,4 (χ_LT = 1 → geen kip);
    // de kern rekent de toets gewoon door en komt dan op M_Ed/M_c,Rd uit,
    // hetzelfde getal als 6.2.5. Zelfde fysica, andere rapportage — de échte
    // vergelijking is χ_LT, en die staat in [8].
    vgl(`${k.naam}: UC 6.3.2.1 (kip)`, u["6.3.2.1"], ucVan(k.onze, "6.3.2_ltb"), "-",
        "bron rapporteert 0,00 zodra χ_LT = 1; zie [8]", false);
    vgl(`${k.naam}: M_b,Rd (kip)`, r.McRd, rdVan(k.onze, "6.3.2_ltb"), "kNm", "χ_LT = 1 → M_b,Rd = M_c,Rd");
  }
  // Eigen doorsnede: alleen de weerstand is vergelijkbaar, de UC niet (geknipt).
  vgl("staaf 2 (eigen doorsnede): M_c,Rd", REF.Rd[2].McRd,
      rdVan(2, "6.2.5_bending_y") ?? rdVan(3, "6.2.5_bending_y"), "kNm", "W_pl,y uit de bron");
  vgl("staaf 2 (eigen doorsnede): V_pl,Rd", REF.Rd[2].VplRd,
      rdVan(2, "6.2.6_shear_z") ?? rdVan(3, "6.2.6_shear_z"), "kN", "A_v,z uit de bron");
  vgl("staaf 2 (eigen doorsnede): UC 6.2.5", REF.uc[2]["6.2.5"],
      Math.max(ucVan(2, "6.2.5_bending_y") ?? 0, ucVan(3, "6.2.5_bending_y") ?? 0), "-",
      "onze 2+3 samen; zelfde M_Ed en zelfde weerstand");
  // Kolommen
  for (const [bron, onze] of [[4, 5], [5, 6]]) {
    vgl(`kolom (bron ${bron}) → onze ${onze}: N_c,Rd`, REF.Rd[4].NcRd, rdVan(onze, "6.2.4_compression"), "kN");
    vgl(`kolom (bron ${bron}) → onze ${onze}: UC 6.2.4`, REF.uc[bron]["6.2.4"], ucVan(onze, "6.2.4_compression"), "-");
    vgl(`kolom (bron ${bron}) → onze ${onze}: χ_y (knik)`, REF.knik.chi, tussen(onze, "6.3.1_buckling", "\\chi_y"), "-");
    vgl(`kolom (bron ${bron}) → onze ${onze}: χ_z (knik)`, REF.knik.chi, tussen(onze, "6.3.1_buckling", "\\chi_z"), "-");
    vgl(`kolom (bron ${bron}) → onze ${onze}: UC 6.3.3 (6.61)`, REF.uc[bron]["6.3.3"], ucVan(onze, "6.3.3_eq_6_61"), "-");
    vgl(`kolom (bron ${bron}) → onze ${onze}: UC 6.3.3 (6.62)`, REF.uc[bron]["6.3.3"], ucVan(onze, "6.3.3_eq_6_62"), "-");
  }
  vgl("staaf 1: UC 6.3.3 (6.61, buiging + druk)", REF.uc[1]["6.3.3"], ucVan(1, "6.3.3_eq_6_61"), "-",
      "bron rekent 6.3.3 met L_cr,z = kipsteunafstand 679 mm; de app met de systeemlengte 3397 mm", false);
  tabel("[7] Weerstanden en unity checks — kern van de app naast de bron", regels);
  ucRegels = regels;

  // ── [8] Kip in detail ───────────────────────────────────────────────────
  regels = [];
  for (const k of [{ bron: 1, onze: 1 }, { bron: 3, onze: 4 }, { bron: 6, onze: 7 }]) {
    const b = REF.kip[k.bron], i = invoerPer.get(k.onze);
    const pre = `staaf ${k.bron} (onze ${k.onze})`;
    vgl(`${pre}: L_st (kipveld)`, b.Lst, tussen(k.onze, "6.3.2_ltb", "L_{st}"), "mm");
    vgl(`${pre}: q_equiv`, b.q, i?.q_equiv_n_per_mm ?? null, "N/mm", "bron: uit de momentenlijn");
    vgl(`${pre}: z_a`, b.za, i?.z_a_mm ?? null, "mm", "aangrijpingspunt van de last");
    vgl(`${pre}: B*`, b.Bster, tussen(k.onze, "6.3.2_ltb", "B^*"), "-");
    vgl(`${pre}: C_1`, b.C1, tussen(k.onze, "6.3.2_ltb", "C_1"), "-");
    vgl(`${pre}: C_2`, b.C2, tussen(k.onze, "6.3.2_ltb", "C_2"), "-");
    vgl(`${pre}: S`, b.S, tussen(k.onze, "6.3.2_ltb", "S"), "mm");
    vgl(`${pre}: C (NB.157)`, b.C, tussen(k.onze, "6.3.2_ltb", "C"), "-");
    vgl(`${pre}: M_cr (NB.148)`, b.Mcr, tussen(k.onze, "6.3.2_ltb", "M_{cr}"), "kNm");
    vgl(`${pre}: λ̄_LT`, b.lamLT, tussen(k.onze, "6.3.2_ltb", "\\bar{\\lambda}_{LT}"), "-");
    vgl(`${pre}: χ_LT`, b.chiLT, tussen(k.onze, "6.3.2_ltb", "\\chi_{LT}"), "-");
  }
  tabel("[8] Kipstabiliteit in detail (NB.NB.4, figuren NB.33/34)", regels);
  kipRegels = regels;

  // ── [9] Doorbuiging ─────────────────────────────────────────────────────
  //
  // Hier zit het enige echte inhoudelijke verschil van P04, en het is de moeite
  // waard om precies te benoemen. De bron drukt bij elke staaf eerst de
  // knoopzakkingen af ("Local node displacements d_z1, d_z2") en dan
  // w_fin,z — de zakking gemeten vanaf de KOORDE tussen de twee staafeinden.
  // Dat is ook wat EN 1990 bijlage A1.4 bedoelt: de doorbuiging van een
  // overspanning telt vanaf de lijn door de steunpunten.
  //
  // De app geeft de toetsing `extractFieldDeflectionMm`: het grootste |w| uit
  // de 21 stations van de staaf. Die stations dragen de VOLLEDIGE transversale
  // verplaatsing, inclusief het meezakken van de staafeinden. Zodra een
  // staafeinde zelf zakt — hier: staaf 4 hangt aan een knoop die 6,7 mm zakt,
  // en staaf 7 staat op twee kolommen die meezakken — telt die starre
  // verplaatsing dus mee in w_fin. Vandaar de afwijkingen hieronder.
  //
  // Onderaan staat dezelfde vergelijking mét de koorde eraf gerekend; dan valt
  // alles binnen een paar procent. Dat isoleert het verschil tot de definitie
  // van w in de toetsinvoer, niet tot de solver.
  regels = [];
  for (const k of [{ bron: 1, onze: 1 }, { bron: 3, onze: 4 }, { bron: 6, onze: 7 }]) {
    const b = REF.doorb[k.bron];
    const pre = `staaf ${k.bron} (onze ${k.onze})`;
    vgl(`${pre}: grens w_fin = L/250`, b.grens_fin, rdVan(k.onze, "deflection_w_fin"), "mm");
    vgl(`${pre}: w_fin zoals de APP hem aanlevert`, Math.abs(b.w_fin), Math.abs(edVan(k.onze, "deflection_w_fin") ?? NaN),
        "mm", "app: absolute zakking, bron: vanaf de koorde");
    vgl(`${pre}: UC w_fin van de app`, REF.uc[k.bron].w_fin, ucVan(k.onze, "deflection_w_fin"), "-",
        "gevolg van dezelfde definitie");
    vgl(`${pre}: w_fin vanaf de KOORDE (zelfde solveruitkomst)`, Math.abs(b.w_fin), Math.abs(wKoorde(5, k.onze)), "mm",
        "bron-definitie op onze stations");
    vgl(`${pre}: UC w_fin vanaf de koorde`, REF.uc[k.bron].w_fin,
        Math.abs(wKoorde(5, k.onze)) / (b.L / 250), "-", "bron-definitie op onze stations");
    vgl(`${pre}: w_add vanaf de koorde (w_c5 − w_c3)`, Math.abs(b.w_add),
        Math.abs(wKoorde(5, k.onze) - wKoorde(3, k.onze)), "mm", "bron-definitie op onze stations");
    vgl(`${pre}: UC w_add vanaf de koorde (grens L/333)`, REF.uc[k.bron].w_add,
        Math.abs(wKoorde(5, k.onze) - wKoorde(3, k.onze)) / (b.L / 333), "-", "bron-definitie op onze stations");
    vgl(`${pre}: UC w_add zoals de KERN hem geeft`, REF.uc[k.bron].w_add, ucVan(k.onze, "deflection_w_add"), "-",
        "kern hanteert een eigen w_add-definitie — niet vergelijkbaar", false);
  }
  {
    // Eigen doorsnede: de bron toetst over 2600 mm, wij over 653 + 1947. De
    // zakking vanaf de koorde over de VOLLE 2600 mm is wél te reconstrueren
    // uit onze stations, en die legt de bronwaarde ernaast.
    const b = REF.doorb[2];
    vgl("staaf 2: w_fin over 2600 mm vanaf de koorde", Math.abs(b.w_fin), Math.abs(wKoordeSamen(5, [2, 3])), "mm",
        "onze staven 2 en 3 samen genomen");
    vgl("staaf 2: w_add over 2600 mm vanaf de koorde", Math.abs(b.w_add),
        Math.abs(wKoordeSamen(5, [2, 3]) - wKoordeSamen(3, [2, 3])), "mm", "onze staven 2 en 3 samen genomen");
    vgl("staaf 2: UC w_fin over 2600 mm", REF.uc[2].w_fin, Math.abs(wKoordeSamen(5, [2, 3])) / (b.L / 250), "-");
    for (const onze of [2, 3]) {
      vgl(`  onze staaf ${onze} apart: w_fin (app)`, null, edVan(onze, "deflection_w_fin"), "mm",
          "eigen kiplengte en eigen grens — niet vergelijkbaar", false);
      vgl(`  onze staaf ${onze} apart: grens L/250`, null, rdVan(onze, "deflection_w_fin"), "mm", "", false);
      vgl(`  onze staaf ${onze} apart: UC w_fin`, null, ucVan(onze, "deflection_w_fin"), "-", "", false);
    }
  }
  tabel("[9] Doorbuiging (bron: doorbuigingsblokken in 2.5)", regels);
  doorbRegels = regels;
  log("  Lezing van [9]: dezelfde solveruitkomst geeft vanaf de KOORDE overal ≤ 1,4 % afwijking van de");
  log("  bron. Wat de app de toetsing aanlevert is de ABSOLUTE zakking van de staaf, en die telt het");
  log("  meezakken van de staafeinden mee. Bij staaf 4 (hangt aan een knoop die 6,7 mm zakt) en staaf 7");
  log("  (staat op twee meezakkende kolommen) loopt dat op tot +121 % resp. +90 %, en komt de UC van");
  log("  staaf 7 zelfs boven 1,0 uit terwijl de bron op 0,55 uitkomt. Niet gerepareerd — gemeld als");
  log("  bevinding op steelCheckBuilder.extractFieldDeflectionMm.");
} catch (e) {
  log("\n═══ EN 1993-1-1-toetsing NIET gedraaid ═══");
  log(`  reden: ${e.message}`);
  log("  De toetsing loopt via de toetsbrug van de dev-server (http://localhost:1440/api/toetsing).");
  log("  Start de dev-server in design-mockup (npm run dev) en bouw de brug in src-tauri:");
  log("  cargo build --release -p toetsbrug. Er worden hier BEWUST geen vervangende getallen berekend.");
}

// ── [10] Scheefstand: wat de bron doet en wat de app ervan maakt ──────────
log("\n[10] Scheefstand — de enige grootheid die het model bewust niet nabouwt");
log("─".repeat(140));
{
  const nBron = REF.staaf[1].Nx;
  const nZonder = Math.max(...overUgt((c) => Math.max(...[1, 2, 3, 4].map((b) => maxAbs(el(c, b).normalForce))))) / 1e3;
  const elS = (cid, bid) => resSch.get(cid).elements.get(bid);
  const nMet = Math.max(...overUgt((c) => Math.max(...[1, 2, 3, 4].map((b) => maxAbs(elS(c, b).normalForce))))) / 1e3;
  const fxMet = Math.abs(resSch.get(2).reactions.get(1)?.fx ?? 0) / 1e3;
  log(`  bron: geometrische scheefstand 1/200 → N in de onderligger ±${nBron} kN, F_x ±${REF.reactie[1].Fx.c2} kN`);
  log(`  app zonder scheefstand: |N| max in de onderligger ${nZonder.toExponential(2)} kN`);
  log(`  app MET scheefstand (φ = 1/200): |N| max ${nMet.toFixed(3)} kN, F_x knoop 1 ${fxMet.toFixed(3)} kN`);
  log(`  → De app hangt H = φ·V aan ELKE verticale last, ook aan de lasten die rechtstreeks op de`);
  log(`    onderligger staan; de bron kantelt alleen de geometrie, en de onderligger ligt in het vlak`);
  log(`    van zijn eigen steunpunten. Vandaar de factor ~${(nMet / Math.abs(nBron)).toFixed(1)}. Op V en M heeft het in beide gevallen`);
  log(`    geen merkbare invloed; het gaat om een normaalkracht van 0,06 N/mm² in de onderligger.`);
}
log("─".repeat(140));

// ═══════════════════════════════════════════════════════════════════════════
// 6. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
function samenvat(naam, rijen) {
  const met = (rijen ?? []).filter((r) => r.vergelijkbaar && Number.isFinite(r.dev));
  if (met.length === 0) { log(`  ${naam.padEnd(40)} geen vergelijkbare regels`); return 0; }
  const grootste = met.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), met[0]);
  const boven2 = met.filter((r) => Math.abs(r.dev) > 2);
  log(`  ${naam.padEnd(40)} ${String(met.length).padStart(3)} vergelijkingen, grootste afwijking ` +
      `${grootste.dev >= 0 ? "+" : ""}${grootste.dev.toFixed(2)} % (${grootste.grootheid}), ${boven2.length} boven 2 %`);
  return { max: Math.max(...met.map((r) => Math.abs(r.dev))), boven2 };
}
log("\n" + "═".repeat(140));
log("SAMENVATTING P04");
log("═".repeat(140));
const s2 = samenvat("[2] solver vs handafleiding", handRegels);
const s3 = samenvat("[3] oplegreacties", reactieRegels);
const s4 = samenvat("[4] staafkrachten", krachtRegels);
const s5 = samenvat("[5] verplaatsingen BGT", verplRegels);
const sM = samenvat("[6b] doorsnedemotor vs bron", motorRegels);
let s6 = 0, s7 = 0, s8 = 0, s9 = 0;
if (toetsGedraaid) {
  s6 = samenvat("[6] catalogusprofielen", profielRegels);
  s7 = samenvat("[7] weerstanden en UC's", ucRegels);
  s8 = samenvat("[8] kip in detail", kipRegels);
  s9 = samenvat("[9] doorbuiging", doorbRegels);
}
const m = (x) => (typeof x === "object" && x ? x.max : 0);
log("");
log(`  Grootste afwijking raamwerk (reacties, krachten, zakkingen): ${Math.max(m(s3), m(s4), m(s5)).toFixed(2)} %`);
log(`  Grootste afwijking handafleiding (derde partij):             ${m(s2).toFixed(2)} %`);
log(`  Grootste afwijking doorsnedegrootheden:                      ${Math.max(m(sM), m(s6)).toFixed(2)} %`);
if (toetsGedraaid) {
  log(`  Grootste afwijking toetsing (weerstanden, UC's, kip, w):     ${Math.max(m(s7), m(s8), m(s9)).toFixed(2)} %`);
}
const alleBoven2 = [s2, s3, s4, s5, sM, s6, s7, s8, s9]
  .filter((x) => typeof x === "object" && x)
  .flatMap((x) => x.boven2);
if (alleBoven2.length) {
  log("\n  Regels boven 2 %:");
  for (const r of alleBoven2) {
    log(`   - ${r.grootheid.padEnd(BREED)} bron ${getal(r.ref).padStart(11)}  app ${getal(r.ons).padStart(11)}  ` +
        `Δ ${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(2)} %${r.opm ? "  — " + r.opm : ""}`);
  }
}
log("\n  Bevindingen:");
log("   1. w_fin: de app levert de toetsing de ABSOLUTE staafzakking aan, de bron (en EN 1990 bijlage");
log("      A1.4) meet vanaf de koorde tussen de staafeinden. Zodra een staafeinde zelf zakt loopt dat");
log("      op tot +121 %; bij de bovenligger komt de UC daardoor op 1,04 in plaats van 0,55.");
log("      Vanaf de koorde gerekend klopt dezelfde solveruitkomst op ≤ 1,4 %.");
log("   2. Kip op een samengestelde eigen doorsnede wordt door de kern geweigerd (monosymmetrie), en");
log("      6.3.3 valt daardoor mee weg. De bron toetst hem wel en komt op χ_LT = 1 uit.");
log("   3. Scheefstand: de app hangt H = φ·V aan élke verticale last, de bron kantelt de geometrie —");
log("      hier een factor ~3 verschil op een normaalkracht die verder nergens invloed op heeft.");
log("   4. 6.3.3 van staaf 1: de bron rekent met L_cr,z = kipsteunafstand, de app met de systeemlengte.");
log("      Dat is de app conservatief in χ_z, maar het maakt de UC's niet vergelijkbaar.");
log("═".repeat(140) + "\n");
