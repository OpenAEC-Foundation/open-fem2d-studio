// ═══════════════════════════════════════════════════════════════════════════
// R22 — Houten garagebouw: gordingen, hoofdligger met kraagarm, houten kolommen
//
// Validatiecampagne referentieberekeningen, geval R22 uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md (§ 7).
//
// Bron: tentamen Houtbouw met volledige uitwerking van een Duitse hogeschool
// (zomersemester 2011), nationale bijlage: Duitse NB bij EN 1995-1-1.
//
// WAT DIT SCRIPT DOET
//   1. bouwt het model en schrijft het weg als referentie/R22.femp
//      (+ .ifcfem2d, want de openen-dialoog van de app filtert op die extensie);
//   2. LEEST HET BESTAND TERUG en rekent dát door via de gewone app-route
//      (deserializeProject → bouwMultiInput → solveAllCases → combineResults),
//      zodat de gecontroleerde invoer letterlijk het opgeslagen model is;
//   3. legt elke referentiewaarde uit het dossier naast onze uitkomst,
//      met de afwijking in procent.
//
// Draaien vanuit design-mockup/:   npx tsx referentie/toets-R22.mjs
//
// ── WAT WEL EN NIET IN HET REKENMODEL ZIT ─────────────────────────────────
// Het geval bestaat uit drie losse onderdelen. Het dossier staat expliciet toe
// ze niet in één model te zetten ("Kolom 1 en kolom 2 zijn losse kniktoetsen;
// de app hoeft ze niet in hetzelfde model te hebben").
//   • GORDING     — tweeveldsligger 2 × 3,50 m  → in het model (staven 1–4).
//   • HOOFDLIGGER — ligger 4,50 m + kraagarm    → in het model (staven 11–14).
//   • KOLOM 1 / 2 — losse kniktoetsen. Hun enige verbinding met de
//     krachtsverdeling is N_d = de oplegreactie van de hoofdligger; die komt
//     dus wél uit ons model, de kniktoets zelf is een handafleiding.
//
// ── AANNAMES (alleen die het dossier toestaat, plus wat het dossier vraagt
//    om vast te leggen) ───────────────────────────────────────────────────
//  A1. KRAAGARMLENGTE = 1,50 m. Het dossier: "De kraagarmlengte van de
//      hoofdligger en de exacte positie van de kolommen staan alleen in de
//      figuur ... daaruit is de kraagarm terug te rekenen. Leg de gekozen
//      kraagarmlengte vast als aanname en controleer of Ak = 6,30 kN en
//      Bk = 12,60 kN gereproduceerd worden." Terugrekenen: totale last
//      g·(l+c) = Ak+Bk = 18,90 kN → l+c = 18,90/3,15 = 6,00 m → c = 1,50 m.
//      Diezelfde 1,50 m staat in de figuurmaten van het dossier ("lk = 1,5 m").
//      De sluitende controle staat hieronder in de vergelijkingstabel.
//  A2. GL28c ONTBREEKT in de sterkteklassenlijst van de app
//      (sectionResolver.TIMBER_E_MEAN / timberCheckBuilder.SUPPORTED_TIMBER_
//      GRADES kennen GL24h, GL28h, GL32h, GL36h). Het model gebruikt daarom
//      GL28h. Dat is voor de KRACHTSVERDELING EN DE ZAKKING exact goed: in
//      EN 1194 — de norm die in 2011 gold — hebben GL28c én GL28h dezelfde
//      E_0,mean = 12 600 N/mm², en alleen E stuurt de FEM. Voor de
//      STERKTETOETS zijn de klassen niet uitwisselbaar; de toetswaarden in dit
//      script zijn daarom handafleidingen met de rekensterkten van GL28c die
//      het dossier zelf noemt (aangevuld met f_c,90,k = 2,7 N/mm² uit EN 1194,
//      zie de constante GL28), niet met de GL28h-gegevens van de app.
//  A3. Belasting van de hoofdligger als GELIJKMATIG VERDEELDE LIJNLAST, niet
//      als gordingpuntlasten — het dossier schrijft dat voor ("Volg de bron").
//  A4. Eigen gewicht UIT: het dossier geeft g_k al inclusief dakopbouw en
//      noemt het eigen gewicht van de hoofdligger verwaarloosbaar.
//  A5. Geen belastingschikking (afwisselend belaste velden) bij de gording:
//      de referentiewaarde max A = 2,29 kN is 3/8·q_d·L, dus vol belaste
//      velden. Met alleen veld 1 belast zou A = 2,67 kN zijn. Wij volgen de
//      bron en belasten beide velden vol.
//  A6. KRUIP via combinatiefactoren: k_def = 0,80 (massief hout én gelamineerd
//      hout, klimaatklasse 2, EC5 tabel 3.2) en ψ2 = 0 voor sneeuw (Duitse NB,
//      terreinhoogte < 1 000 m). w_fin = (1+k_def)·w_G + w_S volgt dus uit een
//      BGT-combinatie met factoren 1,8 en 1,0 — lineaire superpositie, geen
//      aparte kruipsolver.
//  A7. De grootheid die de bron "w_net,fin" noemt is numeriek gelijk aan
//      (1+k_def)·w_G, dus de quasi-blijvende eindzakking (ψ2,sneeuw = 0).
//      Dat is hier niet gegokt maar AFGELEID uit de bron zelf: dezelfde
//      definitie reproduceert óók de derde benodigde traagheid van de gording
//      (592 cm⁴) exact. Zie de opmerking bij die regel.
//
// ── RAADPLEGING VAN DE BRON ───────────────────────────────────────────────
// Drie punten stonden niet in het dossier en zijn in het brondocument zelf
// nagekeken; er is GEEN referentiewaarde gewijzigd, alleen uitgezocht welke
// rekenregel de bron gebruikt:
//   B1. Kraagarm. De figuur van de bron benoemt l_f = 4,5 m en l_k = 1,5 m —
//       onafhankelijke bevestiging van aanname A1 (die ook al uit Ak/Bk volgt).
//   B2. Benodigd afschuifoppervlak van de gording bij steunpunt B. De bron
//       verhoogt daar f_v,d met een factor 1,3 omdat de plaats meer dan
//       1,50 m van het kopse hout ligt (regel uit de Duitse NB, alleen voor
//       massief hout; bij het gelijmde hout van de hoofdligger past de bron
//       hem expliciet NIET toe). Zonder die verhoging komt er 41,3 cm² uit
//       in plaats van 31,8 cm² — het verschil zat dus in de toetsregel, niet
//       in de dwarskracht.
//   B3. De twee doorbuigingsfactoren. k_w = 5·l⁴/(384·E·I) is de zakking in
//       mm per kN/m lijnlast van de ligger ZONDER kraagarm; k_DLT =
//       1 + 0,6·(M_li + M_re)/M_0 corrigeert die naar het werkelijke systeem
//       (M_0 = q·l²/8). Beide zijn hieronder uit ONS model uitgerekend.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { serializeProject, deserializeProject, combinationsFromFile } =
  await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ═══════════════════════════════════════════════════════════════════════════
// 1. Invoer uit het dossier (§ R22, tabel "Invoer")
// ═══════════════════════════════════════════════════════════════════════════
// Geometrie in mm (modeleenheid), lijnlasten in kN/m (= N/mm), omlaag negatief.
const GORDING_VELD_MM   = 3500;   // twee velden van 3,50 m
const LIGGER_SPAN_MM    = 4500;   // overspanning A–B
const LIGGER_KRAAG_MM   = 1500;   // kraagarm voorbij B — AANNAME A1
const KOLOM_H_CM        = 280;    // kolomhoogte 2,80 m (kniklengte)

// Karakteristieke lijnlasten (kN/m), uit het dossier overgenomen.
const G_GORDING = 0.54;    // g_k gording (h.o.h. 0,75 m)
const S_GORDING = 0.675;   // s_k gording
const G_LIGGER  = 3.15;    // g_k hoofdligger
const S_LIGGER  = 3.93;    // s_k hoofdligger

// Partiële factoren (dossier: 1,35 resp. 1,50).
const GAMMA_G = 1.35;
const GAMMA_Q = 1.50;

// Duitse NB, klimaatklasse 2, lastduurklasse kort:  k_mod/γ_M = 0,692.
// Klimaatklasse 3 (kolommen):                       k_mod/γ_M = 0,538.
const KMOD_GAMMA_KK2 = 0.692;
const KMOD_GAMMA_KK3 = 0.538;
const KCR_MASSIEF    = 0.500;   // Duitse NB: 2,0/f_v,k = 2,0/4,0
const KCR_GELIJMD    = 0.714;   // Duitse NB: 2,5/f_v,k = 2,5/3,5
const KDEF           = 0.80;    // EC5 tabel 3.2, klimaatklasse 2
const PSI2_SNEEUW    = 0.0;     // Duitse NB, < 1 000 m boven NN

// Materiaalgegevens die het dossier noemt of die uit EN 338 / EN 1194 volgen
// en die de bron aantoonbaar gebruikt (gecontroleerd op de bronwaarden zelf).
const C24  = { fm_k: 24, fv_k: 4.0, fc0_k: 21, E_mean: 11000, E05: 7400 };
// f_c,90,k = 2,7 N/mm² hoort bij GL28c volgens EN 1194 (de norm van 2011);
// het dossier noemt deze waarde niet, de bron rekent er wél mee. Onze app
// kent GL28c niet (zie aanname A2), dus deze constante komt uit de norm.
const GL28 = { fm_k: 28, fv_k: 3.5, fc90_k: 2.7, E_mean: 12600 };
// Duitse NB: verhoging van f_v,d voor massief hout op een plaats verder dan
// 1,50 m van het kopse hout (bron B2). Voor gelamineerd hout niet toegestaan.
const FV_VERHOGING_MASSIEF = 1.3;
// EC5 §6.1.5: opleglengte mag met 30 mm worden verlengd; k_c,90 = 1,75 voor
// gelamineerd hout op een tussenoplegging (Duitse NB) — beide uit de bron.
const OPLEG_L_MM = 120, OPLEG_VERLENGING_MM = 30, KC90 = 1.75;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Referentiewaarden uit het dossier — NIET AANPASSEN
// ═══════════════════════════════════════════════════════════════════════════
const REF = {
  // Gording (rekenwaarden, UGT)
  g_A:        2.29,     // kN   max oplegreactie eindsteunpunt
  g_VB:      -3.81,     // kN   dwarskracht links van het middensteunpunt
  g_MB:      -2.67,     // kNm  moment boven het middensteunpunt
  g_Aef_A:    24.8,     // cm²  benodigde oppervlakte oplegging A
  g_Aef_B:    31.8,     // cm²  benodigde oppervlakte oplegging B (maatgevend)
  g_Werf:     160.7,    // cm³  benodigd weerstandsmoment
  g_Ierf_1:   740,      // cm⁴  benodigde traagheid, doorbuigingseis 1
  g_Ierf_2:   669,      // cm⁴  benodigde traagheid, doorbuigingseis 2
  g_Ierf_3:   592,      // cm⁴  benodigde traagheid, doorbuigingseis 3
  // Hoofdligger, karakteristiek permanent (g_k)
  h_Ak_g:     6.30, h_Bk_g: 12.60, h_VB_g: -7.88, h_MB_g: -3.54, h_Mveld_g: 6.30,
  // Hoofdligger, karakteristiek sneeuw (s_k)
  h_Ak_s:     7.86, h_Bk_s: 15.72, h_VB_s: -9.83, h_MB_s: -4.42, h_Mveld_s: 7.86,
  // Hoofdligger, rekenwaarden
  h_Vd:      25.38,     // kN
  h_Md:      20.30,     // kNm
  h_tau:      1.85,     // N/mm²   (grens 2,42 → η = 0,76)
  h_tau_R:    2.42,
  h_tau_eta:  0.76,
  h_sig:     17.62,     // N/mm²   (grens 1,10 × 19,38 → η = 0,83)
  h_sig_R:   19.38,
  h_sig_eta:  0.83,
  h_kDLT:     0.734,    // doorbuigingsfactor van de bron
  h_kw:       3.065,    // tweede factor van de bron — zie de notitie onderaan
  h_winst:   15.9,      // mm   (grens 4500/300 = 15 mm → NIET voldaan)
  h_wfin:    21.6,      // mm   (grens 4500/200 = 22,5 mm)
  h_wnetfin: 12.7,      // mm   (grens 4500/300 = 15 mm)
  // Oplegging A
  o_Aef:    180,        // cm²
  o_Ad:      20.30,     // kN
  o_sig:      1.13,     // N/mm²  (grens 3,27 → η = 0,35)
  o_sig_R:    3.27,
  o_eta:      0.35,
  // Kolom 1 (C24, 12/12 cm, klimaatklasse 3)
  k1_Nd:     20.30, k1_lambda: 80.7, k1_kc: 0.440, k1_sig: 1.41, k1_sig_R: 4.94, k1_eta: 0.28,
  // Kolom 2 (C24, 2 × 8/16 cm, klimaatklasse 3)
  k2_Nd:     40.59, k2_Nd_deel: 20.30, k2_lambda: 121.1, k2_kc: 0.212,
  k2_sig:     1.59, k2_sig_R: 2.40, k2_eta: 0.66,
  // Aansluiting B
  b_Fd:      40.59,     // kN  (weerstand 42,4 kN → η = 0,96)
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. Vergelijkingsadministratie
// ═══════════════════════════════════════════════════════════════════════════
// `soort` zegt WAT er vergeleken wordt — dat bepaalt of een afwijking iets
// over de app zegt:
//   "app"      — rechtstreekse uitvoer van de solver (krachten, reacties,
//                zakkingen). Telt mee voor het eindoordeel.
//   "hand"     — doorsnedetoets met de hand, gevoed door ONZE solverwaarde
//                en de rekensterkten uit het dossier. Telt mee, maar een
//                afwijking wijst op de toetsformule, niet op de solver.
//   "geometrie"— sluitende controle op de aangenomen kraagarmlengte.
//   "onbekend" — de bron geeft de gebruikte formule niet; niet toe te
//                rekenen aan de app. Telt NIET mee voor het eindoordeel.
const rijen = [];
function vergelijk(deel, naam, ons, ref, eenheid, soort = "app", notitie = "") {
  const afw = ref === 0 ? (ons === 0 ? 0 : Infinity) : ((ons - ref) / Math.abs(ref)) * 100;
  rijen.push({ deel, naam, ons, ref, eenheid, afw, soort, notitie });
  return afw;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Model opbouwen
// ═══════════════════════════════════════════════════════════════════════════
// Twee onafhankelijke, elk op zichzelf stabiele draagsystemen in één bestand.
// De hoofdligger ligt in de tekening 2,0 m onder de gording; die verspringing
// is UITSLUITEND voor de leesbaarheid van het canvas — de systemen raken
// elkaar niet en beïnvloeden elkaar niet.
const Z_LIGGER = -2000;

// Gording: extra knoop op halve overspanning van elk veld, zodat de zakking
// exact op het punt wordt uitgelezen waar de bron hem berekent (zie § 6).
// Hoofdligger: extra knopen op x = 2 000 mm (punt waar V = 0, dus het exacte
// veldmoment) en x = 2 250 mm (halve overspanning, de zakking van de bron).
// Extra knopen veranderen de oplossing van een Bernoulli-element niet; § 8
// controleert dat expliciet met een grover model.
const state = {
  nodes: [
    // Gording — tweeveldsligger 2 × 3,50 m
    { id: 1, x: 0,                        z: 0 },   // steunpunt A
    { id: 2, x: GORDING_VELD_MM / 2,      z: 0 },   // halve overspanning veld 1
    { id: 3, x: GORDING_VELD_MM,          z: 0 },   // steunpunt B (midden)
    { id: 4, x: GORDING_VELD_MM * 1.5,    z: 0 },   // halve overspanning veld 2
    { id: 5, x: GORDING_VELD_MM * 2,      z: 0 },   // steunpunt C
    // Hoofdligger — 4,50 m overspanning + 1,50 m kraagarm
    { id: 11, x: 0,                                  z: Z_LIGGER },  // A
    { id: 12, x: 2000,                               z: Z_LIGGER },  // V = 0
    { id: 13, x: LIGGER_SPAN_MM / 2,                 z: Z_LIGGER },  // halve overspanning
    { id: 14, x: LIGGER_SPAN_MM,                     z: Z_LIGGER },  // B
    { id: 15, x: LIGGER_SPAN_MM + LIGGER_KRAAG_MM,   z: Z_LIGGER },  // kraagarmeinde
  ],
  beams: [
    // Gording: C24, b/h = 8/12 cm, klimaatklasse 2, lastduur kort.
    ...[[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 5]].map(([id, from, to]) => ({
      id, from, to, material: "C24", profile: "80x120",
      checkConfig: {
        serviceClass: 2, loadDuration: "short",
        // De Duitse NB toetst w_inst op l/300 en w_fin op l/200; de app kan
        // met één noemer maar één van beide vastleggen. Genoteerd als l/300;
        // dit veld raakt de krachtsverdeling en de zakking niet.
        deflectionClass: "custom", deflectionLimitNumerator: 300,
      },
      loadRole: "dakPlat",
    })),
    // Hoofdligger: GL28c → GL28h (aanname A2), b/h = 12/24 cm.
    ...[[11, 11, 12], [12, 12, 13], [13, 13, 14], [14, 14, 15]].map(([id, from, to]) => ({
      id, from, to, material: "GL28h", profile: "120x240",
      checkConfig: {
        serviceClass: 2, loadDuration: "short",
        // Zijdelings gehouden bij de opleggingen: l_ef = 4,50 m.
        lateralRestraints: [], lateralRestraintsBottom: [],
        deflectionClass: "custom", deflectionLimitNumerator: 300,
      },
      loadRole: "dakPlat",
    })),
  ],
  supports: [
    { nodeId: 1,  type: "pinned"  },  // gording, steunpunt A
    { nodeId: 3,  type: "zRoller" },  // gording, steunpunt B (midden)
    { nodeId: 5,  type: "zRoller" },  // gording, steunpunt C
    { nodeId: 11, type: "pinned"  },  // hoofdligger, oplegging A
    { nodeId: 14, type: "zRoller" },  // hoofdligger, oplegging B
  ],
  plates: [],
  loads: [
    // Belastinggeval 1 — permanent (g_k)
    ...[1, 2, 3, 4].map((b, i) => ({ id: 100 + i, type: "lineLoad", caseId: 1, beamId: b, q: -G_GORDING })),
    ...[11, 12, 13, 14].map((b, i) => ({ id: 110 + i, type: "lineLoad", caseId: 1, beamId: b, q: -G_LIGGER })),
    // Belastinggeval 2 — sneeuw (s_k)
    ...[1, 2, 3, 4].map((b, i) => ({ id: 200 + i, type: "lineLoad", caseId: 2, beamId: b, q: -S_GORDING })),
    ...[11, 12, 13, 14].map((b, i) => ({ id: 210 + i, type: "lineLoad", caseId: 2, beamId: b, q: -S_LIGGER })),
  ],
  loadCases: [
    { id: 1, name: "G — permanent",        type: "dead" },
    { id: 2, name: "S — sneeuw (kort)",    type: "snow" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // aanname A4
  nonlinearEnabled: false,    // eerste orde
  combinations: [
    { id: 1, name: "UGT",                     type: "uls", formula: "1,35·G + 1,50·S",       factors: { 1: GAMMA_G, 2: GAMMA_Q } },
    { id: 2, name: "BGT karakteristiek",      type: "sls", formula: "G + S",                 factors: { 1: 1, 2: 1 } },
    { id: 3, name: "BGT alleen G",            type: "sls", formula: "G",                     factors: { 1: 1 } },
    { id: 4, name: "BGT alleen S",            type: "sls", formula: "S",                     factors: { 2: 1 } },
    // Kruip via superpositie (aanname A6): w_fin = (1+k_def)·w_G + (1+ψ2·k_def)·w_S
    { id: 5, name: "BGT eindzakking w_fin",   type: "sls", formula: "(1+kdef)·G + S",         factors: { 1: 1 + KDEF, 2: 1 + PSI2_SNEEUW * KDEF } },
    // Quasi-blijvende eindzakking; de bron noemt deze grootheid w_net,fin (A7)
    { id: 6, name: "BGT quasi-blijvend eind", type: "sls", formula: "(1+kdef)·G",             factors: { 1: 1 + KDEF } },
  ],
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

const tekst = serializeProject(state);
for (const naam of ["R22.femp", "R22.ifcfem2d"]) {
  writeFileSync(join(HIER, naam), tekst, "utf8");
  log(`geschreven: ${join(HIER, naam)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Het weggeschreven bestand terugrekenen langs de gewone app-route
// ═══════════════════════════════════════════════════════════════════════════
const bestand = deserializeProject(readFileSync(join(HIER, "R22.femp"), "utf8"));
const model = {
  nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
  plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: bestand.scheefstandEnabled ?? false,
  scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
  scheefstandRichting: bestand.scheefstandRichting ?? 1,
};
const combos = combinationsFromFile(bestand.combinations);
const perCase = solveAllCases(bouwMultiInput(model)).perCase;
const R = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
const UGT = R.get(1), BGT = R.get(2), BGT_G = R.get(3), BGT_S = R.get(4),
      BGT_FIN = R.get(5), BGT_QP = R.get(6);

// Doorsneden zoals de app ze uit (materiaal, profiel) afleidt.
const secG = resolveSection("C24", "80x120");
const secH = resolveSection("GL28h", "120x240");
log("");
log("── Doorsneden zoals de app ze oplost ────────────────────────────────────");
log(`  gording      C24  80x120 : E = ${secG.E} N/mm²  A = ${secG.A} mm²  I = ${(secG.I / 1e4).toFixed(0)} cm⁴  (${secG.bron})`);
log(`  hoofdligger  GL28h 120x240: E = ${secH.E} N/mm²  A = ${secH.A} mm²  I = ${(secH.I / 1e4).toFixed(0)} cm⁴  (${secH.bron})`);

// Hulpjes — eenheden: reacties/dwarskrachten N → kN, momenten N·mm → kNm.
const kN  = (v) => v / 1000;
const kNm = (v) => v / 1e6;
const Rz  = (r, id) => kN(r.reactions.get(id).fz);
const uz  = (r, id) => r.displacements.get(id).uz;      // mm, omlaag negatief
const M   = (r, beam, st) => kNm(r.elements.get(beam).bendingMoment[st]);
const V   = (r, beam, st) => kN(r.elements.get(beam).shearForce[st]);
/** Uiterste (met teken) van een stationgrootheid over een reeks staven. */
function uiterste(r, beams, veld, teken) {
  let best = 0;
  for (const b of beams) for (const w of r.elements.get(b)[veld]) {
    if (teken * w > teken * best) best = w;
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. GORDING — vergelijken
// ═══════════════════════════════════════════════════════════════════════════
// Staaf 2 loopt van x = 1 750 naar 3 500 mm; station 20 ligt dus exact links
// van het middensteunpunt.
vergelijk("gording", "max A (rekenwaarde)",        Rz(UGT, 1),      REF.g_A,  "kN");
vergelijk("gording", "V links van B",              V(UGT, 2, 20),   REF.g_VB, "kN");
vergelijk("gording", "M boven B",                  M(UGT, 2, 20),   REF.g_MB, "kNm");

// Benodigd weerstandsmoment: W_erf = M_d / f_m,d met f_m,d = k_mod/γ_M · f_m,k.
// (De bron rekent zónder k_h; met k_h zou W_erf kleiner uitvallen.)
const fm_d_C24 = KMOD_GAMMA_KK2 * C24.fm_k;                 // 16,61 N/mm²
const M_gording_Nmm = Math.abs(M(UGT, 2, 20)) * 1e6;
vergelijk("gording", "benodigd W = M_d/f_m,d",
  M_gording_Nmm / fm_d_C24 / 1e3, REF.g_Werf, "cm³", "hand");

// Doorbuiging: de bron rekent de zakking op HALVE OVERSPANNING van een veld
// (coëfficiënt 5/960 = 0,0052083 · q·l⁴/EI). Dat is aantoonbaar: alleen met
// die coëfficiënt komen alle drie de benodigde traagheden exact uit. Knoop 2
// ligt op x = 1 750 mm, dus precies daar.
// I_erf volgt uit w ∝ 1/I:  I_erf = I_werkelijk · w / w_grens.
const w_g_inst = Math.abs(uz(BGT,     2));
const w_g_fin  = Math.abs(uz(BGT_FIN, 2));
const w_g_qp   = Math.abs(uz(BGT_QP,  2));
const grens300_g = GORDING_VELD_MM / 300;
const grens200_g = GORDING_VELD_MM / 200;
vergelijk("gording", "benodigde I — w_inst ≤ l/300",
  secG.I * w_g_inst / grens300_g / 1e4, REF.g_Ierf_1, "cm⁴", "hand");
vergelijk("gording", "benodigde I — w_fin ≤ l/200",
  secG.I * w_g_fin / grens200_g / 1e4, REF.g_Ierf_2, "cm⁴", "hand");
vergelijk("gording", "benodigde I — w_net,fin ≤ l/300",
  secG.I * w_g_qp / grens300_g / 1e4, REF.g_Ierf_3, "cm⁴", "hand",
  "bevestigt aanname A7: w_net,fin = (1+k_def)·w_G");

// Benodigde oppervlakte bij de opleggingen. Dit is GEEN oplegdruktoets — de
// bron toetst de gording op AFSCHUIVING: erf A = 1,5·V/(k_cr·f_v,d). Bij
// steunpunt B verhoogt de bron f_v,d met 1,3 omdat die plaats meer dan 1,50 m
// van het kopse hout ligt (Duitse NB, bron B2); bij het eindsteunpunt A niet.
const fv_d_C24   = KMOD_GAMMA_KK2 * C24.fv_k;                       // 2,77 N/mm²
const fv_d_C24_B = FV_VERHOGING_MASSIEF * KMOD_GAMMA_KK2 * C24.fv_k; // 3,60 N/mm²
const Aerf = (V_kN, fvd) => 1.5 * Math.abs(V_kN) * 1000 / (KCR_MASSIEF * fvd) / 100; // cm²
vergelijk("gording", "benodigd A oplegging A",
  Aerf(Rz(UGT, 1), fv_d_C24), REF.g_Aef_A, "cm²", "hand",
  `1,5·V/(k_cr·f_v,d) met f_v,d = ${fv_d_C24.toFixed(2)} N/mm²`);
vergelijk("gording", "benodigd A oplegging B",
  Aerf(V(UGT, 2, 20), fv_d_C24_B), REF.g_Aef_B, "cm²", "hand",
  `idem met f_v,d = 1,3·${(KMOD_GAMMA_KK2 * C24.fv_k).toFixed(2)} = ${fv_d_C24_B.toFixed(2)} N/mm² (> 1,50 m van kops hout)`);

// ═══════════════════════════════════════════════════════════════════════════
// 7. HOOFDLIGGER — vergelijken
// ═══════════════════════════════════════════════════════════════════════════
// Staaf 13 loopt van x = 2 250 naar 4 500 mm; station 20 = links van B.
// Staaf 11 loopt van x = 0 naar 2 000 mm; station 20 = het punt waar V = 0,
// dus exact het maximale veldmoment.
for (const [naam, r, ref] of [
  ["g_k", BGT_G, { A: REF.h_Ak_g, B: REF.h_Bk_g, V: REF.h_VB_g, MB: REF.h_MB_g, Mv: REF.h_Mveld_g }],
  ["s_k", BGT_S, { A: REF.h_Ak_s, B: REF.h_Bk_s, V: REF.h_VB_s, MB: REF.h_MB_s, Mv: REF.h_Mveld_s }],
]) {
  vergelijk("hoofdligger", `A_k (${naam})`,        Rz(r, 11),     ref.A,  "kN",
    naam === "g_k" ? "geometrie" : "app",
    naam === "g_k" ? "sluitende controle op de kraagarm van 1,50 m (A1)" : "");
  vergelijk("hoofdligger", `B_k (${naam})`,        Rz(r, 14),     ref.B,  "kN",
    naam === "g_k" ? "geometrie" : "app",
    naam === "g_k" ? "sluitende controle op de kraagarm van 1,50 m (A1)" : "");
  vergelijk("hoofdligger", `V links van B (${naam})`, V(r, 13, 20), ref.V,  "kN");
  vergelijk("hoofdligger", `M boven B (${naam})`,     M(r, 13, 20), ref.MB, "kNm");
  vergelijk("hoofdligger", `M veld (${naam})`,        M(r, 11, 20), ref.Mv, "kNm");
}

const Vd_ligger = uiterste(UGT, [11, 12, 13, 14], "shearForce", -1);   // grootste negatieve
const Md_ligger = uiterste(UGT, [11, 12, 13, 14], "bendingMoment", +1); // grootste positieve
vergelijk("hoofdligger", "max V_d", Math.abs(kN(Vd_ligger)),  REF.h_Vd, "kN");
vergelijk("hoofdligger", "max M_d", kNm(Md_ligger),           REF.h_Md, "kNm");

// Doorsnedetoetsen — handafleiding op ONZE snedekrachten met de rekensterkten
// die het dossier noemt (Duitse NB).
const b_h = 120, h_h = 240;
const W_h = (b_h * h_h * h_h) / 6;                       // 1,152·10⁶ mm³
const fm_d_GL  = KMOD_GAMMA_KK2 * GL28.fm_k;             // 19,38 N/mm²
const fv_d_GL  = KMOD_GAMMA_KK2 * GL28.fv_k;             // 2,42 N/mm²
const kh_GL    = Math.min(Math.pow(600 / h_h, 0.1), 1.1); // 1,096 → de bron rondt op 1,10
const tau_d    = 1.5 * Math.abs(Vd_ligger) / (KCR_GELIJMD * b_h * h_h);
const sigma_md = kNm(Md_ligger) * 1e6 / W_h;
vergelijk("hoofdligger", "τ_d = 1,5·V/(k_cr·b·h)", tau_d,  REF.h_tau,   "N/mm²", "hand");
vergelijk("hoofdligger", "f_v,d",                  fv_d_GL, REF.h_tau_R, "N/mm²", "hand");
vergelijk("hoofdligger", "η afschuiving",          tau_d / fv_d_GL, REF.h_tau_eta, "–", "hand");
vergelijk("hoofdligger", "σ_m,d = M_d/W",          sigma_md, REF.h_sig,   "N/mm²", "hand");
vergelijk("hoofdligger", "f_m,d",                  fm_d_GL,  REF.h_sig_R, "N/mm²", "hand");
vergelijk("hoofdligger", "η buiging",              sigma_md / (kh_GL * fm_d_GL), REF.h_sig_eta, "–", "hand",
  `k_h = ${kh_GL.toFixed(4)} (bron: 1,10)`);

// Zakkingen — knoop 13 ligt op halve overspanning (x = 2 250 mm), waar de bron
// zijn doorbuigingsformule toepast.
const w_h_inst = Math.abs(uz(BGT,     13));
const w_h_fin  = Math.abs(uz(BGT_FIN, 13));
const w_h_qp   = Math.abs(uz(BGT_QP,  13));
vergelijk("hoofdligger", "w_inst (G+S, halve overspanning)", w_h_inst, REF.h_winst,   "mm");
vergelijk("hoofdligger", "w_fin  = (1+k_def)·w_G + w_S",     w_h_fin,  REF.h_wfin,    "mm");
vergelijk("hoofdligger", "w_net,fin = (1+k_def)·w_G",        w_h_qp,   REF.h_wnetfin, "mm", "app", "aanname A7");

// De twee doorbuigingsfactoren van de bron (B3):
//   k_w   = 5·l⁴/(384·E·I)          → zakking in mm per kN/m, ZONDER kraagarm
//   k_DLT = 1 + 0,6·(M_li+M_re)/M_0 → correctie naar het werkelijke systeem
// k_w volgt uit de doorsnede die de app zelf oplost; k_DLT wordt hier met de
// formule van de bron uitgerekend op ONZE momenten (M_re = M_B, M_0 = q·l²/8).
// Daarnaast staat de rechtstreeks gemeten verhouding w_inst/(k_w·q) ernaast:
// die twee horen gelijk te zijn, en dat is meteen de controle dat onze
// zakking op dezelfde plaats hoort als die van de bron.
const q_char = (G_LIGGER + S_LIGGER);                    // kN/m = N/mm
const k_w = 5 * Math.pow(LIGGER_SPAN_MM, 4) / (384 * secH.E * secH.I);   // mm per kN/m
const M0_g = G_LIGGER * Math.pow(LIGGER_SPAN_MM / 1000, 2) / 8;          // kNm
const k_DLT_formule = 1 + 0.6 * (0 + M(BGT_G, 13, 20)) / M0_g;
const k_DLT_gemeten = w_h_inst / (k_w * q_char);
vergelijk("hoofdligger", "k_w = 5l⁴/(384·E·I)", k_w, REF.h_kw, "mm/(kN/m)", "hand");
vergelijk("hoofdligger", "k_DLT = 1+0,6·(M_li+M_re)/M_0", k_DLT_formule, REF.h_kDLT, "–", "hand",
  `M_re = ${M(BGT_G, 13, 20).toFixed(4)} kNm en M_0 = ${M0_g.toFixed(4)} kNm uit ons model`);
vergelijk("hoofdligger", "k_DLT gemeten = w_inst/(k_w·q)", k_DLT_gemeten, REF.h_kDLT, "–", "app");

// ═══════════════════════════════════════════════════════════════════════════
// 8. OPLEGGING A EN DE KOLOMMEN — voeding uit ons model, toets met de hand
// ═══════════════════════════════════════════════════════════════════════════
const Ad = Rz(UGT, 11);   // rekenreactie oplegging A = normaalkracht kolom 1
const Bd = Rz(UGT, 14);   // rekenreactie oplegging B = normaalkracht kolom 2
vergelijk("oplegging A", "A_d (rekenwaarde)", Ad, REF.o_Ad, "kN");
// A_ef = b × l_ef met l_ef = opleglengte + 30 mm (EC5 §6.1.5).
const A_ef_mm2 = 120 * (OPLEG_L_MM + OPLEG_VERLENGING_MM);
const sigma_c90 = Ad * 1000 / A_ef_mm2;
const fc90_d_GL = KMOD_GAMMA_KK2 * GL28.fc90_k;          // 1,87 N/mm²
vergelijk("oplegging A", "A_ef = b·(l+30)",   A_ef_mm2 / 100, REF.o_Aef, "cm²", "hand");
vergelijk("oplegging A", "σ_c,90,d = A_d/A_ef", sigma_c90,      REF.o_sig, "N/mm²", "hand");
vergelijk("oplegging A", "k_c,90·f_c,90,d",   KC90 * fc90_d_GL, REF.o_sig_R, "N/mm²", "hand");
vergelijk("oplegging A", "η oplegdruk", sigma_c90 / (KC90 * fc90_d_GL), REF.o_eta, "–", "hand");

/** Kniktoets EN 1995-1-1 §6.3.2 voor een rechthoekige C24-staaf. */
function knik(N_kN, b_cm, h_cm, kniklengte_cm) {
  const i_cm = Math.min(b_cm, h_cm) / Math.sqrt(12);
  const lambda = kniklengte_cm / i_cm;
  const lambda_rel = (lambda / Math.PI) * Math.sqrt(C24.fc0_k / C24.E05);
  const k = 0.5 * (1 + 0.2 * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
  const kc = 1 / (k + Math.sqrt(k * k - lambda_rel * lambda_rel));
  const sigma = N_kN * 1000 / (b_cm * h_cm * 100);
  const fc0d = KMOD_GAMMA_KK3 * C24.fc0_k;      // klimaatklasse 3
  return { lambda, kc, sigma, weerstand: kc * fc0d, eta: sigma / (kc * fc0d) };
}
const k1 = knik(Ad, 12, 12, KOLOM_H_CM);
vergelijk("kolom 1", "N_d",        Ad,           REF.k1_Nd,    "kN");
vergelijk("kolom 1", "λ_ef",       k1.lambda,    REF.k1_lambda, "–", "hand");
vergelijk("kolom 1", "k_c",        k1.kc,        REF.k1_kc,     "–", "hand");
vergelijk("kolom 1", "σ_c,0,d",    k1.sigma,     REF.k1_sig,    "N/mm²", "hand");
vergelijk("kolom 1", "k_c·f_c,0,d", k1.weerstand, REF.k1_sig_R,  "N/mm²", "hand");
vergelijk("kolom 1", "η",          k1.eta,       REF.k1_eta,    "–", "hand");

const k2 = knik(Bd / 2, 8, 16, KOLOM_H_CM);   // tweedelig: helft van N per deel
vergelijk("kolom 2", "N_d totaal", Bd,          REF.k2_Nd,      "kN");
vergelijk("kolom 2", "N_d per deel", Bd / 2,    REF.k2_Nd_deel, "kN");
vergelijk("kolom 2", "λ_ef",       k2.lambda,   REF.k2_lambda,  "–", "hand");
vergelijk("kolom 2", "k_c",        k2.kc,       REF.k2_kc,      "–", "hand");
vergelijk("kolom 2", "σ_c,0,d",    k2.sigma,    REF.k2_sig,     "N/mm²", "hand");
vergelijk("kolom 2", "k_c·f_c,0,d", k2.weerstand, REF.k2_sig_R,  "N/mm²", "hand");
vergelijk("kolom 2", "η",          k2.eta,      REF.k2_eta,     "–", "hand");

vergelijk("aansluiting B", "F_d", Bd, REF.b_Fd, "kN");

// ═══════════════════════════════════════════════════════════════════════════
// 9. Eigen controles: evenwicht en netverfijning
// ═══════════════════════════════════════════════════════════════════════════
const eigen = [];
function controleer(naam, ons, verwacht, tol = 1e-6) {
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= Math.max(tol, Math.abs(verwacht) * 1e-9);
  eigen.push({ naam, ons, verwacht, ok });
}
// Verticaal evenwicht per systeem (UGT-combinatie).
const qd_gording = GAMMA_G * G_GORDING + GAMMA_Q * S_GORDING;
const qd_ligger  = GAMMA_G * G_LIGGER  + GAMMA_Q * S_LIGGER;
controleer("ΣV gording = q_d·L", Rz(UGT, 1) + Rz(UGT, 3) + Rz(UGT, 5),
  qd_gording * (2 * GORDING_VELD_MM) / 1000, 1e-6);
controleer("ΣV hoofdligger = q_d·L", Rz(UGT, 11) + Rz(UGT, 14),
  qd_ligger * (LIGGER_SPAN_MM + LIGGER_KRAAG_MM) / 1000, 1e-6);
controleer("ΣH = 0", kN(UGT.reactions.get(1).fx + UGT.reactions.get(11).fx), 0, 1e-9);
controleer("M aan kraagarmeinde = 0", M(UGT, 14, 20), 0, 1e-9);
controleer("M in oplegging A = 0", M(UGT, 11, 0), 0, 1e-9);
// Momentevenwicht hoofdligger om A: B·l = q·L²/2
controleer("B_d·l = q_d·L²/2", Rz(UGT, 14) * (LIGGER_SPAN_MM / 1000),
  qd_ligger * Math.pow((LIGGER_SPAN_MM + LIGGER_KRAAG_MM) / 1000, 2) / 2, 1e-6);

// Netverfijning: hetzelfde systeem met alleen de fysieke knopen (dus zonder de
// hulpknopen op x = 2 000 en 2 250) moet dezelfde reacties en dezelfde
// midden-zakking geven. Anders zou de hulpknoop-keuze het antwoord sturen.
const grofModel = {
  ...model,
  nodes: [{ id: 11, x: 0, z: 0 }, { id: 14, x: LIGGER_SPAN_MM, z: 0 },
          { id: 15, x: LIGGER_SPAN_MM + LIGGER_KRAAG_MM, z: 0 }],
  beams: [
    { id: 11, from: 11, to: 14, material: "GL28h", profile: "120x240" },
    { id: 14, from: 14, to: 15, material: "GL28h", profile: "120x240" },
  ],
  supports: [{ nodeId: 11, type: "pinned" }, { nodeId: 14, type: "zRoller" }],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 11, q: -G_LIGGER },
    { id: 2, type: "lineLoad", caseId: 1, beamId: 14, q: -G_LIGGER },
    { id: 3, type: "lineLoad", caseId: 2, beamId: 11, q: -S_LIGGER },
    { id: 4, type: "lineLoad", caseId: 2, beamId: 14, q: -S_LIGGER },
  ],
};
const perCaseGrof = solveAllCases(bouwMultiInput(grofModel)).perCase;
const grofBGT = combineResults(combos.find((c) => c.id === 2), perCaseGrof);
controleer("A_k grof model = fijn model", kN(grofBGT.reactions.get(11).fz),
  Rz(BGT, 11), 1e-6);
// Staaf 11 van het grove model loopt 0 → 4 500 mm; station 10 = x = 2 250 mm.
controleer("w(l/2) grof model = fijn model",
  grofBGT.elements.get(11).deflection[10], -w_h_inst, 1e-6);

// ═══════════════════════════════════════════════════════════════════════════
// 10. Uitvoer
// ═══════════════════════════════════════════════════════════════════════════
log("");
log("── Eigen evenwichts- en verfijningscontroles (bron geeft deze niet) ─────");
let fout = 0;
for (const c of eigen) {
  if (!c.ok) fout++;
  log(`  ${c.ok ? "✓" : "✗"} ${c.naam.padEnd(34)} ons ${c.ons.toFixed(9).padStart(16)}   verwacht ${c.verwacht.toFixed(9)}`);
}

log("");
log("═══ R22 — VERGELIJKING MET DE REFERENTIEWAARDEN ═════════════════════════");
log("");
log("  onderdeel      grootheid                              referentie      onze waarde        Δ [%]  soort");
log("  ─────────────────────────────────────────────────────────────────────────────────────────────────────");
let vorig = "";
for (const r of rijen) {
  const deel = r.deel === vorig ? "" : r.deel;
  vorig = r.deel;
  const merk = r.soort === "onbekend" ? " " : (Math.abs(r.afw) <= 5 ? " " : "!");
  log(`${merk} ${deel.padEnd(14)} ${r.naam.padEnd(38)} ${r.ref.toFixed(3).padStart(11)} ${r.ons.toFixed(4).padStart(16)} ${r.afw.toFixed(3).padStart(12)}  ${r.soort}`);
  if (r.notitie) log(`  ${"".padEnd(14)}   ↳ ${r.notitie}`);
}

const meetellend = ["app", "geometrie", "hand"];
const top = (soorten) => {
  const set = rijen.filter((r) => soorten.includes(r.soort));
  return set.reduce((m, r) => (Math.abs(r.afw) > Math.abs(m.afw) ? r : m), set[0]);
};
const grootsteApp  = top(["app", "geometrie"]);
const grootsteHand = top(["hand"]);
const buiten = rijen.filter((r) => meetellend.includes(r.soort) && Math.abs(r.afw) > 5);

log("");
log(`  Tolerantie voor dit geval (dossier § R22): 5 %`);
log(`  Grootste afwijking op de SOLVERgrootheden (soort app/geometrie): ` +
    `${Math.abs(grootsteApp.afw).toFixed(3)} %  (${grootsteApp.deel} — ${grootsteApp.naam})`);
log(`  Grootste afwijking op de HANDtoetsen op onze snedekrachten:      ` +
    `${Math.abs(grootsteHand.afw).toFixed(3)} %  (${grootsteHand.deel} — ${grootsteHand.naam})`);
log(`  Buiten de tolerantie: ${buiten.length === 0 ? "geen" : buiten.map((r) => `${r.deel}/${r.naam} (${r.afw.toFixed(1)} %)`).join(", ")}`);
log(`  Eigen controles: ${fout === 0 ? "alle in orde" : fout + " FOUT"}`);
log("");
log("  Opmerkingen bij de app (geen rekenafwijkingen, wel beperkingen):");
log("   • GL28c ontbreekt in de sterkteklassenlijst; het model gebruikt GL28h,");
log("     dat toevallig dezelfde E_0,mean = 12 600 N/mm² heeft (aanname A2).");
log("   • De EN 1995-toetsmodule van de app zit in de Rust-kern en is alleen via");
log("     de app zelf aan te roepen — de meegeleverde sidecar biedt uitsluitend");
log("     check_steel_beam. De houttoetsen hierboven zijn daarom handafleidingen");
log("     op ONZE snedekrachten met de rekensterkten van de bron (Duitse NB).");
log("   • De doorbuigingsklasse kent één noemer L/n; de Duitse NB toetst w_inst");
log("     op l/300 én w_fin op l/200. Dat paar is nu niet vast te leggen.");
log("");

process.exit(buiten.length === 0 && fout === 0 ? 0 : 1);
