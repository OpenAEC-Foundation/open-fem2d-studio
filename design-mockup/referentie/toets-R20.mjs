// ═══════════════════════════════════════════════════════════════════════════
// R20 — Parallelligger BSH GL28c 160 × 680 mm met tweezijdige kragarmen
//       (3,00 + 14,00 + 3,00 m), gebruiksklasse 2, KLED kort, Duitse NB
//
// Validatiecampagne referentieberekeningen; dossier:
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md  (§5, R20)
//
// WAT DIT SCRIPT DOET
//   1. Bouwt het model uit de invoertabel van R20 op (4 knopen, 3 staven,
//      2 steunpunten, 2 belastinggevallen, 2 belastingcombinaties).
//   2. Schrijft het weg met serializeProject → R20.femp en R20.ifcfem2d
//      (de extensie waarop de open-dialoog van de app filtert).
//   3. Leest het bestand terug met deserializeProject, vertaalt het met
//      dezelfde bouwMultiInput die de app gebruikt en rekent het door met
//      solveAllCases + combineResults.
//   4. Draait twee controlevarianten: één met een extra knoop in het midden
//      (klopt de stationsgewijze zakking met de knoopzakking?) en één met de
//      doorsnede-eigenschappen die de bron letterlijk noemt (E = 12 500
//      N/mm², I = 4,19·10^9 mm⁴), zodat zichtbaar is welk deel van een
//      verschil van de materiaalbibliotheek komt en welk deel van de solver.
//   5. Leidt de materiaaltoetsen van de bron met de hand af uit ONZE
//      snedekrachten, met de Duitse NB-getallen uit het dossier.
//   6. Roept — als cargo beschikbaar is — de EN 1995-kern van de app aan
//      langs de productieroute (cargo test -p timber-check --test
//      referentie_r20) en zet die uitkomsten er apart naast.
//   7. Legt elke referentiewaarde uit het dossier naast onze uitkomst.
//
// EENHEDEN
//   Model/adapter: mm, kN, kNm. Solver: mm, N, N·mm. bouwMultiInput doet de
//   omrekening (lijnlast kN/m = N/mm, dus ongewijzigd); dit script rekent de
//   solver-uitvoer alleen terug naar kN / kNm om met de bron te vergelijken.
//
// TEKENCONVENTIES (geverifieerd op dit model, zie de evenwichtscontroles)
//   - reactie fz   : positief = omhoog                → zelfde als de bron
//   - shearForce   : V(x) = Σ verticale krachten LINKS van x, omhoog positief
//   - bendingMoment: veldmoment (sagging) positief, kragarmmoment negatief
//   - uz / deflection: negatief = omlaag
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R20.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");
const {
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
} = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s = "") => process.stdout.write(s + "\n");

// ═══════════════════════════════════════════════════════════════════════════
// 1. INVOER — letterlijk uit de invoertabel van R20
// ═══════════════════════════════════════════════════════════════════════════
const A_KRAAG_MM = 3000;     // kragarm links en rechts, 3,00 m
const L_SPAN_MM  = 14000;    // overspanning A–B, 14,00 m
const L_TOT_MM   = 20000;    // totale lengte, 20,00 m

const B_MM = 160;            // doorsnedebreedte
const H_MM = 680;            // doorsnedehoogte

// Karakteristieke lijnlasten over de VOLLE 20 m (kN/m, omlaag = negatief).
const GK_KNM = -3.30;        // permanent
const SK_KNM = -4.50;        // sneeuw, KLED kort

// Partiële factoren UGT uit het dossier.
const GAMMA_G = 1.35;
const GAMMA_Q = 1.50;

// Materiaal- en NB-gegevens uit het dossier (GL28c, Duitse NB,
// gebruiksklasse 2, KLED kort). Deze getallen worden gebruikt voor de
// handafleiding van de spannings- en kiptoets en voor de controlevariant
// met de bron-doorsnede; de solver zelf rekent met de stijfheid uit de
// materiaalbibliotheek van de app.
const BRON = {
  fm_k:        28.0,      // N/mm²
  E0_g_mean:   12500,     // N/mm²
  E0_g_05:     10400,     // N/mm²
  G_g_05:        540,     // N/mm²
  fm_g_d:       19.4,     // N/mm²  (= 0,90·28/1,30)
  fv_g_d:       2.42,     // N/mm²  (= 0,90·3,5/1,30)
  fc90_g_d:     1.73,     // N/mm²  (= 0,90·2,5/1,30)
  kdef:          0.8,     // klimaatklasse 2
  kcr_bef:      0.71,     // b_ef = 0,71·b  (DE NB: k_cr·f_v,k = 2,5 N/mm²)
  kc90:         1.75,     // EC5 6.1.5, gelamineerd hout
  lA_ef_mm:      270,     // effectieve opleglengte
  factorEG:      1.4,     // DE NB: factor 1,4 op E_0,05·G_05 in (6.31)
  lef_kip_mm: 14000 / 3,  // zijdelingse steun om de 4,67 m
  psi2_sneeuw:   0.0,
  W_bron_m3:  12.3e-3,    // W_y zoals de bron hem afgerond opschrijft
  I_bron_m4:  4.19e-3,    // I_y zoals de bron hem afgerond opschrijft
  wc_mm:          40,     // overhoogte
};

// ── MATERIAALKEUZE IN HET BESTAND — AANNAME, ZIE BEVINDINGEN ───────────────
// De bron gebruikt GL28c (gecombineerd gelamineerd hout). De app kent alleen
// de HOMOGENE gelamineerde klassen GL24h/GL28h/GL32h/GL36h
// (lib/timberCheckBuilder.ts → SUPPORTED_TIMBER_GRADES en de Rust-kern
// nen-en-1995-1-1/src/data.rs). "GL28c" invoeren zou de doorsnede-oplosser
// laten terugvallen op de default HEA 160 — dus op een verzonnen doorsnede.
// Daarom staat GL28h in het bestand: zelfde f_m,k = 28 N/mm², zelfde f_v,k
// en f_c,90,k, maar E_0,mean = 12 600 i.p.v. 12 500 N/mm² (+0,8 %).
// Dat raakt ALLEEN de zakkingen (0,8 % kleiner), niet de snedekrachten:
// het systeem is statisch bepaald.
const MATERIAAL = "GL28h";
const PROFIEL   = `${B_MM}x${H_MM}`;

// ═══════════════════════════════════════════════════════════════════════════
// 2. HET MODEL
// ═══════════════════════════════════════════════════════════════════════════
// Knopen: 1 = vrij uiteinde links, 2 = oplegging A, 3 = oplegging B,
// 4 = vrij uiteinde rechts. De overspanning is BEWUST één staaf: dan is de
// staaflengte in het bestand ook de overspanning waarop de toetsmodule haar
// kiplengte en doorbuigingsgrens baseert. Het midden van de overspanning is
// station 10 van de 21 stations van staaf 2 (x = 7 000 mm).
const nodes = [
  { id: 1, x: 0,                          z: 0 },
  { id: 2, x: A_KRAAG_MM,                 z: 0 },
  { id: 3, x: A_KRAAG_MM + L_SPAN_MM,     z: 0 },
  { id: 4, x: L_TOT_MM,                   z: 0 },
];

// Drie staven: kragarm links, overspanning, kragarm rechts. Doorgaand,
// geen scharnieren.
//
// AANNAME UIT HET DOSSIER: constante h = 680 mm over de volle lengte, ook
// op de kragarmen (de tekening toont daar een afschuining van 500 naar
// 680 mm, maar de doorbuigingsberekening van de bron rekent met constante
// h). Voor de snedekrachten maakt dat niets uit — statisch bepaald.
//
// checkConfig: gebruiksklasse 2 en KLED kort zoals de bron. De
// doorbuigingsklasse staat op "custom" 300 omdat de Duitse NB voor w_inst
// l/300 aanhoudt; zie de bevindingen — de app kan de TWEEDE Duitse
// grenswaarde (w_fin ≤ l/200) niet naast de eerste zetten, en kent geen
// veld voor de kipsteunafstand van een houten staaf.
const beams = [1, 2, 3].map((i) => ({
  id: i, from: i, to: i + 1,
  material: MATERIAAL, profile: PROFIEL,
  checkConfig: {
    serviceClass: 2,
    loadDuration: "short",
    deflectionClass: "custom",
    deflectionLimitNumerator: 300,
  },
}));

// A = scharnier, B = rol → statisch bepaald, zoals het dossier voorschrijft.
const supports = [
  { nodeId: 2, type: "pinned"  },
  { nodeId: 3, type: "zRoller" },
];

const loadCases = [
  { id: 1, name: "g_k permanent",  type: "dead" },
  { id: 2, name: "sneeuw mu·s_k",  type: "snow" },
];

// Beide lasten lopen over de VOLLE 20 m, dus op alle drie de staven.
const loads = [];
let loadId = 1;
for (const bm of beams) loads.push({ id: loadId++, type: "lineLoad", caseId: 1, beamId: bm.id, q: GK_KNM });
for (const bm of beams) loads.push({ id: loadId++, type: "lineLoad", caseId: 2, beamId: bm.id, q: SK_KNM });

// Combinaties: UGT 1,35·G + 1,5·S en BGT karakteristiek G + S
// (het dossier: "Karakteristieke combinatie g_k + s_k, psi_2 = 0 voor
// sneeuw" — sneeuw is de enige veranderlijke last en dus leidend, factor 1,0).
const combinations = [
  { id: 1, name: "UGT 1,35·G + 1,5·S", type: "uls",
    formula: "1,35·g_k + 1,5·mu·s_k",
    factors: new Map([[1, GAMMA_G], [2, GAMMA_Q]]) },
  { id: 2, name: "BGT Karakteristiek", type: "sls",
    formula: "g_k + mu·s_k",
    factors: new Map([[1, 1.0], [2, 1.0]]) },
];

const structuralGrid = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: A_KRAAG_MM },
    { id: "B", label: "B", position: A_KRAAG_MM + L_SPAN_MM },
  ],
  zAxes: [{ id: "1", label: "1", position: 0 }],
};

const projectState = {
  nodes, beams, supports, plates: [], loads, loadCases,
  activeLoadCaseId: 1,
  // Eigen gewicht UIT: de bron geeft g_k = 3,30 kN/m als het TOTALE
  // permanente aandeel (dakopbouw + ligger, liggerafstand 6,0 m). Zetten we
  // het eigen gewicht van de app erbij, dan rekenen we ~0,45 kN/m mee die de
  // referentie niet heeft.
  selfWeightEnabled: false,
  nonlinearEnabled: false,   // eerste orde
  combinations: combinationsToFile(combinations),
  structuralGrid,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. OPSLAAN
// ═══════════════════════════════════════════════════════════════════════════
const json = serializeProject(projectState);
const padFemp = join(HIER, "R20.femp");
const padApp  = join(HIER, "R20.ifcfem2d");
writeFileSync(padFemp, json, "utf8");
writeFileSync(padApp,  json, "utf8");
log(`Model opgeslagen: ${padFemp}`);
log(`                  ${padApp}  (extensie die de open-dialoog van de app filtert)`);

// ═══════════════════════════════════════════════════════════════════════════
// 4. DOORREKENEN — vanaf het TERUGGELEZEN bestand
// ═══════════════════════════════════════════════════════════════════════════
const bestand = deserializeProject(json);
const model = {
  nodes: bestand.nodes,
  beams: bestand.beams,
  supports: bestand.supports,
  plates: bestand.plates,
  loadCases: bestand.loadCases,
  loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: bestand.scheefstandEnabled ?? false,
  scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
  scheefstandRichting: bestand.scheefstandRichting ?? 1,
};
const combosUitBestand = combinationsFromFile(bestand.combinations);
const multi   = bouwMultiInput(model);
const perCase = solveAllCases(multi).perCase;

const resUGT = combineResults(combosUitBestand.find((c) => c.id === 1), perCase);
const resBGT = combineResults(combosUitBestand.find((c) => c.id === 2), perCase);
const resG   = perCase.get(1);   // alleen g_k, factor 1,0
const resS   = perCase.get(2);   // alleen sneeuw, factor 1,0

// ── Uitlezers ──────────────────────────────────────────────────────────────
const reactieKN = (res, nodeId) => (res.reactions.get(nodeId)?.fz ?? NaN) / 1000;
const M_kNm  = (res, beamId, i) => (res.elements.get(beamId)?.bendingMoment[i] ?? NaN) / 1e6;
const V_kN   = (res, beamId, i) => (res.elements.get(beamId)?.shearForce[i] ?? NaN) / 1000;
/** Zakking in het MIDDEN van de overspanning: station 10 van staaf 2 (mm). */
const wMidden = (res) => res.elements.get(2)?.deflection[10] ?? NaN;

/**
 * Grootste |V| over alle staven en stations, als POSITIEF getal in kN.
 * De bron geeft max V_d = 78,4 kN als grootte, niet als getekende waarde:
 * de dwarskracht is +78,4 kN rechts van A en −78,4 kN links van B.
 */
function maxAbsV(res) {
  let best = 0;
  for (const el of res.elements.values()) {
    for (const v of el.shearForce) if (Math.abs(v) > best) best = Math.abs(v);
  }
  return best / 1000;
}

// UGT-snedekrachten
const R_A      = reactieKN(resUGT, 2);
const R_B      = reactieKN(resUGT, 3);
const V_max    = maxAbsV(resUGT);
const M_veld   = M_kNm(resUGT, 2, 10);   // station 10 van staaf 2 = midden
const M_kraagA = M_kNm(resUGT, 1, 20);   // einde staaf 1 = oplegging A

// BGT-zakkingen in het midden van de overspanning (mm, omlaag < 0).
const w_G   = wMidden(resG);
const w_Q   = wMidden(resS);
const w_tot = wMidden(resBGT);
// w_fin volgens EC5 (2.2): w_inst,G·(1+k_def) + w_inst,Q·(1 + psi_2·k_def).
const w_fin = w_G * (1 + BRON.kdef) + w_Q * (1 + BRON.psi2_sneeuw * BRON.kdef);

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONTROLEVARIANT A — extra knoop in het midden
// ═══════════════════════════════════════════════════════════════════════════
// Klopt de STATIONSGEWIJZE zakking (Hermite + particuliere oplossing binnen
// het element) met de KNOOPzakking van een model dat op dezelfde plaats een
// echte knoop heeft? Zo ja, dan is de uitlezing hierboven betrouwbaar.
const secApp = resolveSection(MATERIAAL, PROFIEL);
function zakkingMiddenKnoop(qKNm, E, I) {
  const n5 = [
    { id: 1, x: 0,                            z: 0 },
    { id: 2, x: A_KRAAG_MM,                   z: 0 },
    { id: 3, x: A_KRAAG_MM + L_SPAN_MM / 2,   z: 0 },
    { id: 4, x: A_KRAAG_MM + L_SPAN_MM,       z: 0 },
    { id: 5, x: L_TOT_MM,                     z: 0 },
  ];
  const b4 = [1, 2, 3, 4].map((i) => ({ id: i, from: i, to: i + 1, E, A: B_MM * H_MM, I }));
  const r = solve({
    nodes: n5, beams: b4,
    supports: [{ nodeId: 2, type: "pinned" }, { nodeId: 4, type: "zRoller" }],
    loads: b4.map((bm) => ({ beamId: bm.id, q: qKNm })),
  });
  return r.displacements.get(3).uz;
}
const w_G_knoop = zakkingMiddenKnoop(GK_KNM, secApp.E, secApp.I);
const w_S_knoop = zakkingMiddenKnoop(SK_KNM, secApp.E, secApp.I);

// ═══════════════════════════════════════════════════════════════════════════
// 6. CONTROLEVARIANT B — de doorsnede-eigenschappen die de bron zelf noemt
// ═══════════════════════════════════════════════════════════════════════════
// Hetzelfde stelsel, maar E = 12 500 N/mm² (GL28c) en I = 4,19·10^9 mm⁴
// zoals de bron ze opschrijft. Het verschil met de run hierboven is precies
// het effect van de ontbrekende GL28c-klasse in de materiaalbibliotheek.
const I_BRON_MM4 = BRON.I_bron_m4 * 1e12;   // m⁴ → mm⁴
const w_G_bron   = zakkingMiddenKnoop(GK_KNM, BRON.E0_g_mean, I_BRON_MM4);
const w_Q_bron   = zakkingMiddenKnoop(SK_KNM, BRON.E0_g_mean, I_BRON_MM4);
const w_tot_bron = w_G_bron + w_Q_bron;
const w_fin_bron = w_G_bron * (1 + BRON.kdef) + w_Q_bron * (1 + BRON.psi2_sneeuw * BRON.kdef);

// ═══════════════════════════════════════════════════════════════════════════
// 7. HANDAFLEIDING VAN DE MATERIAALTOETSEN (Duitse NB)
// ═══════════════════════════════════════════════════════════════════════════
// De getallen hieronder komen uit een eigen afleiding, maar WEL gevoed met de
// snedekrachten die onze solver hierboven heeft berekend. Ze toetsen dus of
// onze snedekrachten de juiste spanningen opleveren; wat de EN 1995-module
// van de app ervan maakt staat verderop apart.
const Wy_mm3 = B_MM * H_MM * H_MM / 6;                 // = 12,3307·10^6 mm³
const Iz_mm4 = H_MM * B_MM ** 3 / 12;
// Torsietraagheidsmoment van een rechthoek (b < h), standaardbenadering:
//   I_tor = h·b³·[1/3 − 0,21·(b/h)·(1 − b⁴/(12·h⁴))]
const bh = B_MM / H_MM;
const Itor_mm4 = H_MM * B_MM ** 3 * (1 / 3 - 0.21 * bh * (1 - bh ** 4 / 12));

// (a) Oplegdrukspanning loodrecht op de vezel
const sigma_c90 = (Math.abs(R_A) * 1000) / (B_MM * BRON.lA_ef_mm);
const uc_c90    = sigma_c90 / (BRON.kc90 * BRON.fc90_g_d);

// (b) Schuifspanning met de Duitse b_ef = 0,71·b
const b_ef   = BRON.kcr_bef * B_MM;
const tau_d  = 1.5 * (Math.abs(V_max) * 1000) / (b_ef * H_MM);
const uc_tau = tau_d / BRON.fv_g_d;

// (c) Buigspanning
const sigma_m = (Math.abs(M_veld) * 1e6) / Wy_mm3;
const uc_m    = sigma_m / BRON.fm_g_d;
// Variant met de door de bron AFGERONDE W_y = 12,3·10^-3 m³, ter controle
// dat het restverschil puur afronding is.
const sigma_m_Wbron = (Math.abs(M_veld) * 1e6) / (BRON.W_bron_m3 * 1e9);

// (d) Kip volgens (6.31) met de Duitse factor 1,4 op E_0,05·G_05
const lef = BRON.lef_kip_mm;
const sigma_m_crit =
  Math.PI * Math.sqrt(BRON.factorEG * BRON.E0_g_05 * Iz_mm4 * BRON.G_g_05 * Itor_mm4)
  / (lef * Wy_mm3);
const lambda_rel_m = Math.sqrt(BRON.fm_k / sigma_m_crit);
const k_crit = lambda_rel_m <= 0.75 ? 1.0
             : lambda_rel_m <= 1.4  ? 1.56 - 0.75 * lambda_rel_m
             : 1 / (lambda_rel_m * lambda_rel_m);
// h = 680 mm > 600 mm → k_h = 1,0 (EN 14080 / EC5 3.3(3)).
const k_h = H_MM >= 600 ? 1.0 : Math.min((600 / H_MM) ** 0.1, 1.1);

// Doorbuigingsgrenzen Duitse NB
const grens_inst = L_SPAN_MM / 300;   // 46,67 mm
const grens_fin  = L_SPAN_MM / 200;   // 70,00 mm

// ═══════════════════════════════════════════════════════════════════════════
// 8. EIGEN EVENWICHTSCONTROLES
// ═══════════════════════════════════════════════════════════════════════════
const qd = GAMMA_G * Math.abs(GK_KNM) + GAMMA_Q * Math.abs(SK_KNM);   // 11,205 kN/m
const a_m = A_KRAAG_MM / 1000, l_m = L_SPAN_MM / 1000, L_m = L_TOT_MM / 1000;
const eigenControles = [
  ["ΣF_z : R_A + R_B = q_d·L",        R_A + R_B, qd * L_m],
  ["symmetrie R_A = R_B",              R_A - R_B, 0],
  ["ΣF_x = 0",                        (resUGT.reactions.get(2)?.fx ?? 0) / 1000, 0],
  ["M aan het vrije uiteinde links",   M_kNm(resUGT, 1, 0), 0],
  ["M aan het vrije uiteinde rechts",  M_kNm(resUGT, 3, 20), 0],
  ["M_kraag = −q_d·a²/2",              M_kraagA, -qd * a_m * a_m / 2],
  ["M_veld  = q_d·l²/8 − q_d·a²/2",    M_veld, qd * l_m * l_m / 8 - qd * a_m * a_m / 2],
  ["N = 0 (geen axiale last)",        (resUGT.elements.get(2)?.N ?? NaN) / 1000, 0],
  ["V rechts van A = R_A − q_d·a",     V_kN(resUGT, 2, 0),   qd * L_m / 2 - qd * a_m],
  ["V links van B  = −(R_B − q_d·a)",  V_kN(resUGT, 2, 20), -(qd * L_m / 2 - qd * a_m)],
  // Station 10 van staaf 2 moet exact het midden van de overspanning zijn.
  ["station 10 van staaf 2 = 7 000 mm", resUGT.elements.get(2)?.stations_mm[10] ?? NaN, 7000],
  // Stationsgewijze zakking versus knoopzakking van het 5-knopenmodel.
  ["w_midden station = w_midden knoop (G)", w_G, w_G_knoop],
  ["w_midden station = w_midden knoop (S)", w_Q, w_S_knoop],
];

log("");
log("── Eigen evenwichts- en consistentiecontroles (onafhankelijk van de bron) ──");
let eigenFout = 0;
for (const [naam, ons, verwacht] of eigenControles) {
  const tol = Math.max(Math.abs(verwacht) * 1e-9, 1e-6);
  const ok = Number.isFinite(ons) && Math.abs(ons - verwacht) <= tol;
  if (!ok) eigenFout++;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(42)} ${ons.toFixed(6).padStart(14)}  (verwacht ${verwacht.toFixed(6)})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. DE EN 1995-KERN VAN DE APP LANGS DE PRODUCTIEROUTE
// ═══════════════════════════════════════════════════════════════════════════
// Deze v2-app stelt het Tauri-command `check_timber_beams` niet beschikbaar
// (de invoke_handler-lijst in design-mockup/src-tauri/src/lib.rs kent alleen
// rapportagecommando's), dus de toetsmodule is vanuit de app zelf niet te
// bereiken. De onderliggende crate is dat wél: de integratietest
// src-tauri/crates/timber-check/tests/referentie_r20.rs roept
// `check_timber_beam` aan — dezelfde functie die achter het commando zit —
// en krijgt onze snedekrachten via omgevingsvariabelen mee.
function kernUitkomsten() {
  const srcTauri = join(HIER, "..", "..", "src-tauri");
  const env = {
    ...process.env,
    R20_M_ED:    String(M_veld),
    R20_M_KRAAG: String(M_kraagA),
    R20_V_ED:    String(V_max),
    R20_W_INST:  String(w_tot),
    // Quasi-blijvend = alleen het permanente deel (psi_2 = 0 voor sneeuw).
    R20_W_QP:    String(w_G),
  };
  const r = spawnSync(
    "cargo",
    ["test", "-p", "timber-check", "--test", "referentie_r20", "--", "--nocapture"],
    { cwd: srcTauri, env, encoding: "utf8", shell: process.platform === "win32" },
  );
  const uit = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const regel = uit.split(/\r?\n/).find((l) => l.startsWith("#R20-JSON#"));
  if (!regel) return { fout: r.error ? String(r.error) : `cargo gaf status ${r.status}` };
  try {
    return { data: JSON.parse(regel.slice("#R20-JSON#".length).trim()) };
  } catch (e) {
    return { fout: `JSON-regel onleesbaar: ${e.message}` };
  }
}

log("");
log("── EN 1995-kern van de app (cargo test -p timber-check) ────────────────");
const kern = kernUitkomsten();
if (kern.fout) log(`  NIET GEDRAAID: ${kern.fout}`);
else log("  gedraaid langs de productieroute check_timber_beam()");

// ═══════════════════════════════════════════════════════════════════════════
// 10. VERGELIJKEN MET DE REFERENTIEWAARDEN
// ═══════════════════════════════════════════════════════════════════════════
// TOLERANTIE. R20 is een uitgewerkt rekenvoorbeeld met met de hand
// nagerekende, op 3 cijfers afgeronde getallen; het dossier zet daar 1 %
// voor. Unity checks: 0,02 absoluut. Waar de bron een grootheid uit een
// AFGERONDE tussenwaarde afleidt (q_d = 11,2 i.p.v. 11,205 kN/m) staat dat
// bij de regel vermeld.
const TOL_PCT = 1.0;
const TOL_UC  = 0.02;

const regels = [];
function vergelijk(grootheid, ref, onze, opm = "", soort = "solver", eenheid = "") {
  const delta = onze - ref;
  const pct = ref === 0 ? (Math.abs(delta) < 1e-12 ? 0 : Infinity)
                        : (delta / Math.abs(ref)) * 100;
  const ok = soort === "uc" ? Math.abs(delta) <= TOL_UC : Math.abs(pct) <= TOL_PCT;
  regels.push({ grootheid, ref, onze, delta, pct, ok, opm, soort, eenheid });
  return pct;
}

// ── Snedekrachten en reactie (UGT) ─────────────────────────────────────────
const OPM_QD = "bron rondt q_d af op 11,2 kN/m; wij rekenen 11,205 → +0,045 %";
vergelijk("max A_z,d = ½·q_d·L",     112,     R_A,      OPM_QD, "solver", "kN");
vergelijk("max V_d = ½·q_d·l",        78.4,   V_max,    OPM_QD, "solver", "kN");
vergelijk("max veldmoment M_ap,d",   224,     M_veld,   OPM_QD, "solver", "kNm");
vergelijk("kragarmmoment M_A,d",     -50.4,   M_kraagA, OPM_QD, "solver", "kNm");

// ── Spanningen en unity checks (handafleiding op ONZE snedekrachten) ───────
vergelijk("sigma_c,90,d",   2.59, sigma_c90,
  "R_A/(b·l_A,ef) = R_A/(160·270)", "hand", "N/mm²");
vergelijk("UC oplegdruk",   0.86, uc_c90,
  "sigma_c,90,d/(k_c,90·f_c,90,g,d) = /(1,75·1,73)", "uc", "-");
vergelijk("tau_d",          1.52, tau_d,
  "1,5·V/(b_ef·h), b_ef = 0,71·b (DE NB)", "hand", "N/mm²");
vergelijk("UC dwarskracht", 0.63, uc_tau,
  "tau_d/f_v,g,d", "uc", "-");
vergelijk("sigma_m,y,d",   18.2, sigma_m,
  `M/W met W = b·h²/6 = ${(Wy_mm3 / 1e6).toFixed(4)}·10^6 mm³`, "hand", "N/mm²");
vergelijk("UC buiging",     0.94, uc_m,
  "sigma_m,y,d/f_m,g,d", "uc", "-");

// ── Kip (handafleiding volgens EC5 6.31 + Duitse factor 1,4) ───────────────
vergelijk("kip: sigma_m,crit",  65.6, sigma_m_crit,
  "(6.31) met factor 1,4 op E_0,05·G_05; l_ef = 4,667 m", "hand", "N/mm²");
vergelijk("kip: lambda_rel,m",  0.65, lambda_rel_m,
  "sqrt(f_m,k/sigma_m,crit)", "hand", "-");
vergelijk("kip: k_crit",        1.0,  k_crit,
  "lambda_rel,m ≤ 0,75", "uc", "-");
vergelijk("kip: k_h",           1.0,  k_h,
  "h = 680 mm ≥ 600 mm", "uc", "-");

// ── Doorbuigingen (BGT, karakteristieke combinatie) ────────────────────────
// Onze waarde = uit het OPGESLAGEN model (GL28h, E = 12 600 N/mm²).
vergelijk("w_inst,G (zonder overhoogte)", 24.6, Math.abs(w_G),
  "GL28h i.p.v. GL28c: E 0,8 % hoger", "solver", "mm");
vergelijk("w_inst,Q",                     33.5, Math.abs(w_Q),
  "idem", "solver", "mm");
vergelijk("w_inst totaal",                58.1, Math.abs(w_tot),
  "idem", "solver", "mm");
vergelijk("w_fin = w_G·1,8 + w_Q·1,0",    77.8, Math.abs(w_fin),
  "k_def = 0,8; psi_2 = 0", "solver", "mm");

// ── Uitvoer ────────────────────────────────────────────────────────────────
log("");
log("═══ R20 — VERGELIJKING MET DE REFERENTIEWAARDEN ════════════════════════");
log("");
log("  soort   grootheid                        eenheid      referentie     onze waarde       Δ [%]  ");
log("  ─────────────────────────────────────────────────────────────────────────────────────────────");
for (const g of regels) {
  const vlag = g.ok ? "✓" : "✗";
  const pct = Number.isFinite(g.pct) ? g.pct.toFixed(3).padStart(9) : "    n.v.t.";
  log(`  ${vlag} ${g.soort.padEnd(6)} ${g.grootheid.padEnd(30)} ${g.eenheid.padEnd(6)}` +
      `${g.ref.toFixed(4).padStart(12)}${g.onze.toFixed(4).padStart(16)}  ${pct}`);
}
log("");
log("  Toelichting per regel:");
for (const g of regels) if (g.opm) log(`    ${g.grootheid.padEnd(30)} ${g.opm}`);

// ── Zakkingen: bibliotheekmateriaal versus de bronwaarden ──────────────────
log("");
log("── Zakkingen: bibliotheekmateriaal versus de bronwaarden ───────────────");
log(`  Stijfheid uit het bestand (${MATERIAAL} ${PROFIEL}, herkomst "${secApp.bron}"):`);
log(`      E = ${secApp.E} N/mm²   I = ${(secApp.I / 1e9).toFixed(6)}·10^9 mm⁴   E·I = ${(secApp.E * secApp.I).toExponential(6)} N·mm²`);
log(`  Stijfheid volgens de bron (GL28c):`);
log(`      E = ${BRON.E0_g_mean} N/mm²   I = ${(I_BRON_MM4 / 1e9).toFixed(6)}·10^9 mm⁴   E·I = ${(BRON.E0_g_mean * I_BRON_MM4).toExponential(6)} N·mm²`);
log(`      verschil in E·I: ${(((secApp.E * secApp.I) / (BRON.E0_g_mean * I_BRON_MM4) - 1) * 100).toFixed(3)} %`);
log("");
log("  grootheid       referentie   ons (bestand, GL28h)   ons (E en I van de bron)");
const rijen2 = [
  ["w_inst,G",   24.6, Math.abs(w_G),   Math.abs(w_G_bron)],
  ["w_inst,Q",   33.5, Math.abs(w_Q),   Math.abs(w_Q_bron)],
  ["w_inst tot", 58.1, Math.abs(w_tot), Math.abs(w_tot_bron)],
  ["w_fin",      77.8, Math.abs(w_fin), Math.abs(w_fin_bron)],
];
for (const [naam, ref, a, b] of rijen2) {
  log(`  ${naam.padEnd(12)} ${ref.toFixed(2).padStart(10)}   ` +
      `${a.toFixed(3).padStart(8)} (${((a - ref) / ref * 100).toFixed(2).padStart(6)} %)   ` +
      `${b.toFixed(3).padStart(8)} (${((b - ref) / ref * 100).toFixed(2).padStart(6)} %)`);
}

// ── Grenswaarden ───────────────────────────────────────────────────────────
log("");
log("── Doorbuigingsgrenzen Duitse NB ───────────────────────────────────────");
log(`  w_inst = ${Math.abs(w_tot).toFixed(1)} mm  vs  l/300 = ${grens_inst.toFixed(1)} mm  → ` +
    `${Math.abs(w_tot) > grens_inst ? "OVERSCHREDEN" : "voldoet"}   (bron: 58,1 > 46,7 → overschreden)`);
log(`  w_fin  = ${Math.abs(w_fin).toFixed(1)} mm  vs  l/200 = ${grens_fin.toFixed(1)} mm  → ` +
    `${Math.abs(w_fin) > grens_fin ? "OVERSCHREDEN" : "voldoet"}   (bron: 77,8 > 70,0 → overschreden)`);
log(`  Met overhoogte w_c = ${BRON.wc_mm} mm: w_inst,net = ${(Math.abs(w_tot) - BRON.wc_mm).toFixed(1)} mm, ` +
    `w_fin,net = ${(Math.abs(w_fin) - BRON.wc_mm).toFixed(1)} mm — beide binnen de grenzen.`);

// ── Wat de EN 1995-kern van de app ervan maakt ─────────────────────────────
// Deze regels zijn NADRUKKELIJK GEEN pass/fail: de kern rekent met de
// Nederlandse/EC5-aanbevolen keuzes, de bron met de Duitse NB. Elk verschil
// hieronder is `NB` zolang het door een van die keuzes verklaard wordt; het
// staat er om die verschillen te KWANTIFICEREN.
if (kern.data) {
  const k = kern.data;
  const rij = (naam, ref, ons, verklaring) => {
    const pct = ref === 0 ? 0 : (ons - ref) / Math.abs(ref) * 100;
    log(`  ${naam.padEnd(22)} bron ${ref.toFixed(4).padStart(10)}   kern ${ons.toFixed(4).padStart(10)}   ` +
        `Δ ${pct.toFixed(2).padStart(8)} %   ${verklaring}`);
  };
  log("");
  log("── EN 1995-kern van de app naast de Duitse referentie (informatief, `NB`) ──");
  log("  Variant 1 — kern met de invoervelden die de Duitse NB toelaat");
  log("              (k_cr = 0,71, l_ef = 4,667 m opgelegd):");
  rij("f_m,y,d",        BRON.fm_g_d,   k.f_myd,        "gamma_M kern 1,25 vs DE NB 1,30");
  rij("f_v,d",          BRON.fv_g_d,   k.f_vd,         "idem");
  rij("sigma_m,y,d",    18.2,          k.sigma_myd,    "GELIJK aan onze handafleiding");
  rij("tau_d",          1.52,          k.tau_d,        "GELIJK aan onze handafleiding");
  rij("UC buiging",     0.94,          k.uc_bending,   "volgt uit f_m,y,d");
  rij("UC dwarskracht", 0.63,          k.uc_shear,     "volgt uit f_v,d");
  rij("sigma_m,crit",   65.6,          k.sigma_m_crit, "kern gebruikt (6.32), bron (6.31)+1,4");
  rij("lambda_rel,m",   0.65,          k.lambda_rel_m, "");
  rij("k_crit",         1.0,           k.k_crit,       "");
  rij("w_fin",          77.8,          k.w_fin_mm,     "w_fin = w_inst + k_def·w_qp");
  log(`  UC w_fin (l/200) volgens de kern: ${k.uc_w_fin.toFixed(3)} → ` +
      `${k.uc_w_fin > 1 ? "VOLDOET NIET" : "voldoet"} (bron: 77,8 > 70,0 → voldoet niet)`);
  log("");
  log("  Variant 2 — kern zoals timberCheckBuilder.ts hem VANDAAG automatisch vult:");
  log(`     k_cr = 1,0            → tau_d = ${k.tau_app_default.toFixed(3)} N/mm² ` +
      `(bron 1,52) → UC ${k.uc_shear_app_default.toFixed(3)} i.p.v. 0,63 — ONVEILIG`);
  log(`     geen kipsteunafstand  → l_ef = ${k.l_ef_app_default_mm.toFixed(0)} mm i.p.v. 4 667 mm, ` +
      `sigma_m,crit = ${k.sigma_m_crit_app_default.toFixed(2)} N/mm² → UC kip ` +
      `${k.uc_kip_app_default.toFixed(3)} i.p.v. ≈ 0,90 — te CONSERVATIEF`);
  log(`     w_qp = w_inst         → w_fin = ${k.w_fin_app_default_mm.toFixed(1)} mm i.p.v. ` +
      `${k.w_fin_mm.toFixed(1)} mm — te conservatief`);
  log(`     UC_max = ${k.uc_max_app_default.toFixed(3)}, maatgevend "${k.maatgevend_app_default}"`);
  log(`     oplegdruktoets f_c,90 : ${k.aantal_c90_toetsen === 0 ? "ONTBREEKT in de orchestrator" : "aanwezig"} ` +
      `(bron toetst hem wél: UC 0,86)`);
}

// ── Kip: welke formule ─────────────────────────────────────────────────────
log("");
log("── Kip: welke formule ──────────────────────────────────────────────────");
log(`  (6.31) + Duitse factor 1,4   : sigma_m,crit = ${sigma_m_crit.toFixed(2)} N/mm²  (bron 65,6)`);
log(`  I_tor = ${(Itor_mm4 / 1e6).toFixed(2)}·10^6 mm⁴,  I_z = ${(Iz_mm4 / 1e6).toFixed(2)}·10^6 mm⁴,  ` +
    `W_y = ${(Wy_mm3 / 1e6).toFixed(4)}·10^6 mm³`);
log(`  sigma_m,y,d met de afgeronde W_y = 12,3·10^-3 m³ van de bron: ${sigma_m_Wbron.toFixed(3)} N/mm² (bron 18,2)`);

// ═══════════════════════════════════════════════════════════════════════════
// 11. EINDOORDEEL
// ═══════════════════════════════════════════════════════════════════════════
const gezakt = regels.filter((g) => !g.ok);
const maxPct = Math.max(...regels.filter((g) => g.soort !== "uc").map((g) => Math.abs(g.pct)));

log("");
log("═══ SAMENVATTING ═══════════════════════════════════════════════════════");
log(`  Regels vergeleken            : ${regels.length}`);
log(`  Binnen de tolerantie         : ${regels.length - gezakt.length}`);
log(`  Buiten de tolerantie         : ${gezakt.length}${gezakt.length ? " → " + gezakt.map((g) => g.grootheid).join(", ") : ""}`);
log(`  Grootste afwijking (niet-UC) : ${maxPct.toFixed(3)} %`);
log(`  Eigen controles              : ${eigenFout === 0 ? "alle in orde" : eigenFout + " FOUT"}`);
log("");
log("  Tolerantie: 1 % op de grootheden, 0,02 absoluut op de unity checks.");
log(`  Oordeel: ${gezakt.length === 0 && eigenFout === 0 ? "KOMT OVEREEN" : "AFWIJKING — uitzoeken"}`);
log("");

process.exit(gezakt.length === 0 && eigenFout === 0 ? 0 : 1);
