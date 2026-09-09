// De betonnen begane-grondvloer uit de externe referentie-berekening,
// nagebouwd met de bouwers van de app en langs de echte rekenkern gelegd.
//
// WAAROM DEZE TEST BESTAAT
// De betonketen bestaat uit veel schakels die elk apart al beproefd zijn:
// de doorsnede-ontleder, de solver, de combinatieselectie, de invoerbouwer en
// de Rust-kern. Wat níét beproefd was, is de keten ALS GEHEEL tegen een
// berekening die iemand anders met een ander programma heeft gemaakt. Zolang
// dat ontbreekt, kan elke schakel op zichzelf kloppen terwijl de uitkomst als
// geheel ernaast zit — een last die twee keer meetelt, een doorsnede die op de
// verkeerde staaf landt, een BGT-combinatie die de scheurtoets niet bereikt.
//
// DE REFERENTIE
// `verificatie calculations/original/3066-5.3 bg-vloer.pdf` (buiten git; de
// map wordt niet meegeleverd). Een plaatstrook van 1000 mm breed, 5000 mm
// lang, met een diktesprong op x = 4000: 280 mm links, 140 mm rechts. Beton
// C20/25, wapening B500B Ø10-150 boven én onder, milieuklasse XC1, dekking
// 25 mm onder en 40 mm boven, korrelafmeting 31,5 mm, kruipcoëfficiënt 2,70.
// Twee belastinggevallen (eigen gewicht en woonbelasting) en twee
// UGT-combinaties. Alle referentiewaarden hieronder zijn LETTERLIJK uit die
// uitdraai overgenomen en worden nergens bijgesteld.
//
// WAT DEZE TEST DOET
//  [a] INVOER      — het nagebouwde model tegen de invoertabellen van de bron:
//                    doorsnede-eigenschappen en het eigen gewicht.
//  [b] STATICA     — bouwMultiInput → solveAllCases → selecteerCombinaties →
//                    combineResults: oplegreacties, het veldmoment en de
//                    snede op de diktesprong, naast de bron én naast een
//                    handafleiding.
//  [c] STIJFHEID   — de bron rekent met een kruipverzwakte E van 6748 N/mm².
//                    Met díé E komen haar zakkingen en hoekverdraaiingen
//                    eruit; en de KRACHTEN veranderen er niet van, want de
//                    strook is statisch bepaald. Beide worden hier gemeten en
//                    niet aangenomen.
//  [d] BGT         — de frequente combinatie: M_k op de twee stations waar de
//                    bron de scheurbeheersing toetst.
//  [e] INVOERBOUW  — buildBetonCheckInputs met de korf uit het model.
//  [f] TOETSING    — de echte kern (toetsbrug als apart proces) en de
//                    uitkomsten naast de bron.
//  [g] VERKLARING  — een handafleiding die BEIDE kanten narekent en laat zien
//                    waar het verschil in M_Rd vandaan komt.
//  [h] TEGENPROEF  — met de wapening die de bron zélf op x = 4006 als
//                    ontwikkeld opgeeft, keurt onze kern daar dezelfde twee
//                    toetsen af als de bron.
//
// [f] en [h] starten de toetsbrug als apart proces en falen LUID als die
// binary ontbreekt: zonder kern is niets aangetoond.
//
// Uitvoeren: npx tsx test-bgvloer-referentie.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=bgvloer

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { resolveSection, eigenGewichtPerMeter } = await import("./src/lib/sectionResolver.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
/** Vergelijking op RELATIEVE afwijking; `ref` is altijd de bron. */
function dicht(naam, ons, ref, tolPct, eenheid = "") {
  const dev = ref === 0 ? (Math.abs(ons) < 1e-9 ? 0 : Infinity) : (ons - ref) / Math.abs(ref) * 100;
  const goed = Math.abs(dev) <= tolPct;
  const tekst = `bron ${fmt(ref)}${eenheid}, ons ${fmt(ons)}${eenheid}, Δ ${dev >= 0 ? "+" : ""}${dev.toFixed(3)} % (grens ${tolPct} %)`;
  if (goed) { passed++; log(`  ✓ ${naam} — ${tekst}`); }
  else      { failed++; log(`  ✗ ${naam} — ${tekst}`); }
  return dev;
}
/** Vergelijking op ABSOLUTE afwijking — voor waarden die de bron afrondt. */
function bijna(naam, ons, ref, tolAbs, eenheid = "") {
  const d = ons - ref;
  const goed = Math.abs(d) <= tolAbs;
  const tekst = `bron ${fmt(ref)}${eenheid}, ons ${fmt(ons)}${eenheid}, Δ ${d >= 0 ? "+" : ""}${fmt(d)}${eenheid} (grens ±${tolAbs}${eenheid})`;
  if (goed) { passed++; log(`  ✓ ${naam} — ${tekst}`); }
  else      { failed++; log(`  ✗ ${naam} — ${tekst}`); }
}
function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1e6) return v.toExponential(4);
  return String(Math.round(v * 1000) / 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// DE BRON — letterlijk overgenomen, nergens bijgesteld
// ═══════════════════════════════════════════════════════════════════════════
const REF = {
  // Doorsnede-eigenschappen uit de profieltabel van de bron.
  profiel: [
    { naam: "1000x280", A: 2.8e5, I: 1.8293e9, W: 1.3067e7, gewicht_kg_m: 700.0 },
    { naam: "1000x140", A: 1.4e5, I: 2.2867e8, W: 3.2667e6, gewicht_kg_m: 350.0 },
  ],
  // De elasticiteitsmodulus die de bron in haar profieltabel afdrukt. Zij is
  // KRUIPVERZWAKT: E_cm/(γ_CE·(1+φ)) met φ = 2,70 uit de invoer. Zie [c].
  E: 6748,
  // Belastinggeval 1 is het eigen gewicht, door de bron zelf uitgerekend.
  q_eg: [-6.867, -3.434],
  q_veranderlijk: -2.550,
  // Oplegreacties per combinatie, kN (bron: envelop oplegreacties).
  Fz: { c1: { k1: 26.538, k3: 22.829 }, c2: { k1: 29.751, k3: 26.455 } },
  // Staafkrachten, kN en kNm (bron: envelop staafkrachten).
  M_veld: 36.681, x_M_veld: 2466,
  V_knik: 18.510, M_knik: 22.483,
  // Van 6.10a drukt de bron alleen de KNOOPwaarden af — een veldmoment staat
  // er voor die combinatie niet, en er wordt er hier dus ook geen verzonnen.
  M_knik_c1: 19.747, V_knik_c1: 16.664,
  // Knoopverplaatsingen, mm en mrad (bron: envelop knoopverplaatsingen).
  // Combinatie 3 = BGT blijvend (G), combinatie 5 = BGT met ψ₁ = 0,50.
  uz_knik: { blijvend: -4.5, frequent: -5.4 },
  ry: { blijvend: { k1: -3.3, k2: 1.7, k3: 5.9 }, frequent: { k1: -3.9, k2: 2.0, k3: 7.1 } },
  // Langswapening UGT: x [mm], M_Ed, M_Rd [kNm], x_u, x_u,max [mm].
  buiging: [
    { x: 2466, sectie: 1, M_Ed: 36.7, M_Rd: 57.5, xu: 34.3, xu_max: 96.9, voldoet: true },
    { x: 4000, sectie: 2, M_Ed: 24.8, M_Rd: 68.7, xu: 40.9, xu_max: 98.3, voldoet: true },
    { x: 4006, sectie: 3, M_Ed: 22.4, M_Rd: 20.0, xu: 31.2, xu_max: 40.8, voldoet: false },
    { x: 5000, sectie: 3, M_Ed: 1.5, M_Rd: 25.6, xu: 34.3, xu_max: 47.2, voldoet: true },
  ],
  // Dwarskracht UGT: x [mm], V_Ed, V_Rd,c, V_Rd,max [kN].
  dwarskracht: [
    { x: 0, V_Ed: 29.8, V_Rdc: 96.4, V_Rdmax: 390.0 },
    { x: 4000, V_Ed: 18.5, V_Rdc: 100.4, V_Rdmax: 390.0 },
    { x: 5000, V_Ed: 26.5, V_Rdc: 53.9, V_Rdmax: 390.0 },
  ],
  // Scheurbeheersing BGT volgens 7.3.3 (de TABELWEG, zonder directe
  // berekening): x [mm], M_k, M_Rk [kNm], staafafstand en staafdiameter met
  // hun maxima. Zie [f]: dit is een ándere weg dan onze 7.3.4.
  scheur: [
    { x: 2458, sectie: 1, M_k: 24.6, M_Rk: 38.4, s: 150.0, s_max: 150.0, phi: 10.0, phi_max: 8.5, voldoet: true },
    { x: 4000, sectie: 2, M_k: 16.5, M_Rk: 41.0, s: 150.0, s_max: 150.0, phi: 10.0, phi_max: 8.5, voldoet: true },
    { x: 4006, sectie: 3, M_k: 14.9, M_Rk: 11.7, s: 150.0, s_max: 150.0, phi: 10.0, phi_max: 4.3, voldoet: false },
    { x: 5000, sectie: 3, M_k: 1.0, M_Rk: 16.8, s: 150.0, s_max: 150.0, phi: 10.0, phi_max: 4.3, voldoet: true },
  ],
  // De wapeningsstaaf onder in de dunne plaat, uit de wapeningstabel van de
  // bron: hij begint op x = 3819 mm en heeft aan die kant een verankerings-
  // lengte van 284 mm. Deze twee getallen verklaren in [g] en [h] het hele
  // verschil in M_Rd op x = 4006.
  staaf3: { begin_mm: 3819, ld_begin_mm: 284 },
};

// De hoeveelheid wapening zoals de BRON haar rekent: Ø10-150 uitgesmeerd over
// een strook van 1000 mm, dus een gebroken aantal staven. Onze korf kent
// alleen een geheel aantal (RebarRow.count is u32) — zie [a].
const AS_BRON_MM2 = (1000 / 150) * Math.PI * 5 ** 2;

// ═══════════════════════════════════════════════════════════════════════════
// HET MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
// DEKKING. De bron voert twee dekkingen in: 25 mm onder en 40 mm boven. Onze
// `ReinforcementCage` draagt één `cover_mm`, want de kern leidt d en d' er
// allebei uit af. Hier staat 25 mm: het moment is over de hele strook
// veldmoment, dus de ONDERwapening is de trekwapening en die bepaalt d. De
// prijs staat in [g]: de bovenwapening ligt bij ons 15 mm hoger dan bij de
// bron, en dat scheelt in M_Rd omdat zij bij deze lage drukzone méé trekt.
//
// AANTAL STAVEN. Ø10-150 in een strook van 1000 mm is meetkundig zeven staven
// (50 + 6×150 + 50 = 1000). Dat is de korf die hier staat. De bron rekent met
// de uitgesmeerde waarde 1000/150 = 6,667 staven; het verschil van +5,0 % in
// A_s komt in [f] en [g] terug.
const KORF = {
  cover_mm: 25,
  // Geen beugels: het is een plaat. De bron toont ook geen beugels en meldt
  // V_Rd,s = 0. §9.2.2 komt daardoor als "niet toetsbaar" terug — terecht,
  // want zonder s en n zijn A_sw/s en ρ_w onbepaald.
  stirrup_diameter_mm: 0,
  top: { count: 7, diameter_mm: 10 },
  bottom: { count: 7, diameter_mm: 10 },
};

const staafConfig = () => ({
  betonKorf: KORF,
  betonMilieuklasse: "XC1",      // bron: XC1 boven én onder
  betonStaalsoort: "B500B",
  betonConstructieklasse: "S4",  // bron: constructieklasse S4
});

function bouwModel({ onderStaven = 7 } = {}) {
  const korf2 = onderStaven === 7
    ? KORF
    : { ...KORF, bottom: { count: onderStaven, diameter_mm: 10 } };
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 5000, z: 0 }],
    beams: [
      // Knoop 2 draagt GEEN oplegging: daar springt alleen de dikte. Dat is de
      // reden dat het model twee staven kent en niet één.
      { id: 1, from: 1, to: 2, material: "C20/25", profile: "1000x280", checkConfig: staafConfig() },
      { id: 2, from: 2, to: 3, material: "C20/25", profile: "1000x140",
        checkConfig: { ...staafConfig(), betonKorf: korf2 } },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    plates: [],
    loadCases: [
      { id: 1, name: "Blijvend (eigen gewicht)", type: "dead" },
      { id: 2, name: "Veranderlijk (A: woonfunctie)", type: "live" },
    ],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: REF.q_eg[0], omschrijving: "eigen gewicht plaat 280 mm" },
      { id: 2, type: "lineLoad", caseId: 1, beamId: 2, q: REF.q_eg[1], omschrijving: "eigen gewicht plaat 140 mm" },
      { id: 3, type: "lineLoad", caseId: 2, beamId: 1, q: REF.q_veranderlijk, omschrijving: "woonbelasting" },
      { id: 4, type: "lineLoad", caseId: 2, beamId: 2, q: REF.q_veranderlijk, omschrijving: "woonbelasting" },
    ],
    // UIT — en dat is geen keuze maar een noodzaak: belastinggeval 1 IS het
    // eigen gewicht. Aan zou het dubbel tellen. [a] toont dat het
    // rekenkundige eigen gewicht exact de q van de bron oplevert.
    selfWeightEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}

// De combinaties zoals de bron ze nummert. De naam van de frequente
// combinatie moet "frequent" bevatten: `buildBetonCheckInputs` herkent haar
// dáárop en er is met opzet geen terugval op een andere BGT-combinatie.
const COMBOS = [
  { id: 1, name: "UGT 6.10a", type: "uls", formula: "1,35·G + 1,50·0,40·Q", factors: new Map([[1, 1.35], [2, 0.60]]) },
  { id: 2, name: "UGT 6.10b", type: "uls", formula: "1,20·G + 1,50·Q", factors: new Map([[1, 1.20], [2, 1.50]]) },
  { id: 3, name: "BGT blijvend", type: "sls", formula: "G", factors: new Map([[1, 1.0]]) },
  { id: 4, name: "BGT quasi-blijvend", type: "sls", formula: "G + 0,30·Q", factors: new Map([[1, 1.0], [2, 0.30]]) },
  { id: 5, name: "BGT frequent", type: "sls", formula: "G + 0,50·Q", factors: new Map([[1, 1.0], [2, 0.50]]) },
];

/** De hele app-route van model naar resultaten per combinatie. */
function rekenDoor(model, { E } = {}) {
  let multi = bouwMultiInput(model);
  if (E !== undefined) {
    // Alleen de E vervangen, verder niets: dit isoleert de stijfheid van de
    // rest van de keten. Gebruikt in [c].
    multi = { ...multi, beams: multi.beams.map((b) => ({ ...b, E })) };
  }
  const { actief, overgeslagen } = selecteerCombinaties(COMBOS, model.beams, model.plates);
  const perCase = solveAllCases(multi).perCase;
  const res = new Map(actief.map((c) => [c.id, combineResults(c, perCase)]));
  return { multi, actief, overgeslagen, res };
}

const model = bouwModel();
const { actief, overgeslagen, res } = rekenDoor(model);

const Fz = (cid, nid) => res.get(cid).reactions.get(nid).fz / 1e3;             // kN
const uz = (cid, nid) => res.get(cid).displacements.get(nid).uz;              // mm
const ry = (cid, nid) => res.get(cid).displacements.get(nid).ry * 1000;       // mrad
const staaf = (cid, bid) => res.get(cid).elements.get(bid);
function grootsteM(cid, bid) {
  const ef = staaf(cid, bid);
  let m = 0, x = 0;
  for (let i = 0; i < ef.stations_mm.length; i++) {
    const v = ef.bendingMoment[i] / 1e6;
    if (Math.abs(v) > Math.abs(m)) { m = v; x = ef.stations_mm[i]; }
  }
  return { M: m, x };
}

log("═".repeat(100));
log("Betonnen begane-grondvloer — externe referentie-berekening `3066-5.3 bg-vloer.pdf`");
log("plaatstrook 1000 mm, 5000 mm lang, diktesprong 280 → 140 mm op x = 4000, C20/25, Ø10-150");
log("═".repeat(100));

// ═══════════════════════════════════════════════════════════════════════════
log("\n[a] Invoer: het nagebouwde model tegen de invoertabellen van de bron");
// ═══════════════════════════════════════════════════════════════════════════
{
  for (const [i, p] of REF.profiel.entries()) {
    const sec = resolveSection("C20/25", p.naam);
    dicht(`doorsnede ${p.naam}: A`, sec.A, p.A, 0.01, " mm²");
    // De bron drukt I af op vijf cijfers; daar past een ruimere grens bij.
    dicht(`doorsnede ${p.naam}: I_y`, sec.I, p.I, 0.01, " mm⁴");

    // HET EIGEN GEWICHT IS GEEN TOEVAL. De bron rekent het zelf uit en zet het
    // in belastinggeval 1. Onze `eigenGewichtPerMeter` doet dat met dezelfde
    // ρ = 2500 kg/m³ en g = 9,81 m/s². Komt daar iets anders uit, dan is de
    // invoer van dit model niet de invoer van de bron — en dan zegt de rest
    // van deze test niets meer.
    const q = eigenGewichtPerMeter("C20/25", p.naam);
    // De bron drukt drie decimalen af; 3,4335 wordt daar 3,434.
    bijna(`eigen gewicht ${p.naam}`, q, REF.q_eg[i], 0.0006, " kN/m");
    dicht(`massa per meter ${p.naam}`, -q * 1000 / 9.81, p.gewicht_kg_m, 0.02, " kg/m");
  }

  // De korf gaat als GEHEEL het verzoek in; hier ligt vast wat erin zit, want
  // een korf waarin één veld ontbreekt wordt niet als fout gemeld maar als een
  // ánder wapeningsplan doorgerekend.
  const A_s = KORF.bottom.count * Math.PI * (KORF.bottom.diameter_mm / 2) ** 2;
  ok("korf: zeven Ø10 onder én boven, geen beugels",
    KORF.top.count === 7 && KORF.bottom.count === 7 &&
    KORF.top.diameter_mm === 10 && KORF.stirrup_diameter_mm === 0,
    `A_s = ${A_s.toFixed(1)} mm² per strook`);
  // HET GEHELE AANTAL. Ø10-150 in 1000 mm is meetkundig zeven staven; de bron
  // smeert de wapening uit en rekent met 6,667. Dat verschil van +5,0 % is
  // hier VASTGELEGD en niet weggepoetst: het verklaart in [f] een deel van
  // het verschil in M_Rd en V_Rd,c, en het is een eigenschap van ons
  // korfmodel (RebarRow.count is een geheel getal), niet van de norm.
  dicht("A_s: geheel aantal staven tegen de uitgesmeerde waarde van de bron",
    A_s, AS_BRON_MM2, 5.1, " mm²");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[b] Statica: de app-route naast de bron én naast een handafleiding");
// ═══════════════════════════════════════════════════════════════════════════
//
// De handafleiding is een derde partij: een vrij opgelegde strook met twee
// blokvormige lasten. Zij gebruikt alleen de q's van de bron en de
// combinatiefactoren, geen enkel getal uit onze solver.
function handStatica(qG1, qG2, qQ, fG, fQ) {
  const q1 = fG * qG1 + fQ * qQ;   // kN/m op 0..4000 (positief = omlaag)
  const q2 = fG * qG2 + fQ * qQ;   // kN/m op 4000..5000
  const R1 = (q1 * 4 * (5 - 2) + q2 * 1 * (5 - 4.5)) / 5;   // momenten om x = 5 m
  const R3 = q1 * 4 + q2 * 1 - R1;
  const xM = R1 / q1;                                        // waar V = 0
  return {
    R1, R3, xM: xM * 1000,
    M: R1 * xM - q1 * xM ** 2 / 2,
    V4: R1 - q1 * 4,                                         // V vlak vóór de knik
    M4: R1 * 4 - q1 * 8,
    q1, q2,
  };
}
{
  ok("alle vijf combinaties worden doorgerekend",
    actief.length === 5 && overgeslagen.length === 0,
    `actief: ${actief.map((c) => c.name).join(", ")}`);

  const h610a = handStatica(-REF.q_eg[0], -REF.q_eg[1], -REF.q_veranderlijk, 1.35, 0.60);
  const h610b = handStatica(-REF.q_eg[0], -REF.q_eg[1], -REF.q_veranderlijk, 1.20, 1.50);

  // Oplegreacties. De bron drukt drie decimalen af; het verschil zit
  // uitsluitend in haar afgeronde q van 3,434 tegen onze 3,4335.
  dicht("6.10a: oplegreactie knoop 1", Fz(1, 1), REF.Fz.c1.k1, 0.02, " kN");
  dicht("6.10a: oplegreactie knoop 3", Fz(1, 3), REF.Fz.c1.k3, 0.02, " kN");
  dicht("6.10b: oplegreactie knoop 1", Fz(2, 1), REF.Fz.c2.k1, 0.02, " kN");
  dicht("6.10b: oplegreactie knoop 3", Fz(2, 3), REF.Fz.c2.k3, 0.02, " kN");
  dicht("6.10b: oplegreactie knoop 1 tegen de handafleiding", Fz(2, 1), h610b.R1, 0.001, " kN");
  dicht("6.10b: oplegreactie knoop 3 tegen de handafleiding", Fz(2, 3), h610b.R3, 0.001, " kN");

  // Geen horizontale reactie: de strook draagt alleen verticaal, en dat is
  // ook waarom [c] mag stellen dat zij statisch bepaald is.
  bijna("6.10b: geen horizontale oplegreactie", res.get(2).reactions.get(1).fx / 1e3, 0, 1e-6, " kN");

  // HET VELDMOMENT EN DE STATIONSRASTER. Onze envelop draagt de stations van
  // de solver — voor deze staaf 21 stuks, dus om de 200 mm. Het werkelijke
  // maximum ligt op x = 2466 en valt dus TUSSEN twee stations; het dichtstbij
  // gelegen station (2400) geeft een fractie minder. Dat is geen rekenfout
  // maar de resolutie van het raster, en dat wordt hier van twee kanten
  // vastgelegd: de afwijking tegen de bron is klein, én ons stationsgetal is
  // exact de handformule óp dat station.
  const g = grootsteM(2, 1);
  dicht("6.10b: grootste veldmoment op het raster", g.M, REF.M_veld, 0.5, " kNm");
  const M_op_station = h610b.R1 * (g.x / 1000) - h610b.q1 * (g.x / 1000) ** 2 / 2;
  dicht(`6.10b: dat stationsmoment is exact de handformule op x = ${g.x} mm`,
    g.M, M_op_station, 0.001, " kNm");
  bijna("6.10b: het station ligt binnen een halve rastermaat van x = 2466",
    Math.abs(g.x - REF.x_M_veld), 0, 100, " mm");
  dicht("6.10b: het WERKELIJKE maximum uit de handafleiding", h610b.M, REF.M_veld, 0.02, " kNm");
  bijna("6.10b: en de plaats daarvan", h610b.xM, REF.x_M_veld, 1, " mm");

  // De snede op de diktesprong. Die valt WEL op een station (het staafeinde),
  // dus daar is er geen rasterverlies.
  const ef1 = staaf(2, 1), n1 = ef1.stations_mm.length - 1;
  dicht("6.10b: dwarskracht op de diktesprong",
    Math.abs(ef1.shearForce[n1] / 1e3), REF.V_knik, 0.02, " kN");
  dicht("6.10b: moment op de diktesprong",
    ef1.bendingMoment[n1] / 1e6, REF.M_knik, 0.02, " kNm");
  dicht("6.10b: dwarskracht op de diktesprong tegen de handafleiding",
    ef1.shearForce[n1] / 1e3, h610b.V4, 0.001, " kN");

  // Dezelfde snede vanaf de ándere staaf: die moet er exact op aansluiten,
  // anders klopt de overdracht over de knoop niet.
  const ef2 = staaf(2, 2);
  bijna("6.10b: staaf 2 sluit op de diktesprong aan op staaf 1 (M)",
    ef2.bendingMoment[0] / 1e6, ef1.bendingMoment[n1] / 1e6, 1e-6, " kNm");
  bijna("6.10b: en op de dwarskracht",
    ef2.shearForce[0] / 1e3, ef1.shearForce[n1] / 1e3, 1e-6, " kN");

  // 6.10a is de lichtere combinatie; van haar drukt de bron de snede op de
  // diktesprong af (knoop 2), en die ligt hier vast — inclusief de
  // handafleiding als derde partij.
  const efA = staaf(1, 1), nA = efA.stations_mm.length - 1;
  dicht("6.10a: moment op de diktesprong", efA.bendingMoment[nA] / 1e6, REF.M_knik_c1, 0.02, " kNm");
  dicht("6.10a: dwarskracht op de diktesprong",
    Math.abs(efA.shearForce[nA] / 1e3), REF.V_knik_c1, 0.02, " kN");
  dicht("6.10a: moment op de diktesprong tegen de handafleiding",
    efA.bendingMoment[nA] / 1e6, h610a.M4, 0.001, " kNm");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[c] Stijfheid: de kruipverzwakte E van de bron raakt de zakking, niet de krachten");
// ═══════════════════════════════════════════════════════════════════════════
//
// De bron drukt in haar profieltabel E = 6748 N/mm² af. Dat is niet de E_cm
// van C20/25 (tabel 3.1: 30 000 N/mm²) maar een KRUIPVERZWAKTE waarde. Zij is
// terug te rekenen uit de invoer van de bron zelf: neem E_cm uit de
// ANALYTISCHE betrekking van tabel 3.1, E_cm = 22 000·(f_cm/10)^0,3 met
// f_cm = f_ck + 8 = 28, deel door γ_CE = 1,2 (5.8.6(3)) en door 1 + φ met de
// kruipcoëfficiënt φ = 2,70 uit haar invoer. Dat de ONafgeronde E_cm nodig is
// en niet de 30 000 uit de tabelkolom, blijkt uit het laatste cijfer: met
// 30 000 komt er 6757 uit. Hieronder wordt dat nagerekend in plaats van
// beweerd.
//
// Onze solverstijfheid gebruikt E_cm zonder kruip (sectionResolver:
// CONCRETE_E_CM) — een BEWUST andere keuze, want de app verlaagt de stijfheid
// pas in de fysisch niet-lineaire berekening.
//
// Twee dingen moeten daaruit volgen, en die worden hier allebei GEMETEN:
//  1. de krachtsverdeling verandert er niet van, want de strook is statisch
//     bepaald (drie oplegreacties, twee vergelijkingen plus ΣM);
//  2. met de E van de bron komen haar zakkingen en hoekverdraaiingen eruit.
{
  // 0 — waar de 6748 vandaan komt. φ = 2,70 en γ_CE = 1,2 zijn de enige twee
  //     getallen die hier bijkomen; het eerste staat in de invoer van de bron,
  //     het tweede in 5.8.6(3).
  const PHI = 2.70, GAMMA_CE = 1.2;
  const E_cm_analytisch = 22000 * ((20 + 8) / 10) ** 0.3;
  const E_kruip = E_cm_analytisch / GAMMA_CE / (1 + PHI);
  bijna("de E van de bron is E_cm/(γ_CE·(1+φ)) met φ = 2,70",
    Math.round(E_kruip), REF.E, 0, " N/mm²");
  ok("en dat vergt de ONafgeronde E_cm van de analytische betrekking",
    Math.round(30000 / GAMMA_CE / (1 + PHI)) !== REF.E,
    `met de tabelwaarde 30 000 zou er ${Math.round(30000 / GAMMA_CE / (1 + PHI))} N/mm² uitkomen`);

  const metRefE = rekenDoor(model, { E: REF.E });
  const FzRef = (cid, nid) => metRefE.res.get(cid).reactions.get(nid).fz / 1e3;

  // 1 — de krachten. Niet "ongeveer gelijk" maar tot op de laatste bit.
  let grootsteAfwijking = 0;
  for (const c of actief) {
    for (const nid of [1, 3]) {
      grootsteAfwijking = Math.max(grootsteAfwijking, Math.abs(FzRef(c.id, nid) - Fz(c.id, nid)));
    }
    for (const bid of [1, 2]) {
      const a = staaf(c.id, bid), b = metRefE.res.get(c.id).elements.get(bid);
      for (let i = 0; i < a.stations_mm.length; i++) {
        grootsteAfwijking = Math.max(grootsteAfwijking,
          Math.abs((a.bendingMoment[i] - b.bendingMoment[i]) / 1e6),
          Math.abs((a.shearForce[i] - b.shearForce[i]) / 1e3));
      }
    }
  }
  ok("statisch bepaald: E van 30 000 naar 6748 laat álle krachten onveranderd",
    grootsteAfwijking < 1e-9,
    `grootste afwijking over alle combinaties, reacties en stations: ${grootsteAfwijking.toExponential(2)}`);

  // 2 — de zakking. De bron drukt af op 0,1 mm en 0,1 mrad.
  const uzRef = (cid, nid) => metRefE.res.get(cid).displacements.get(nid).uz;
  const ryRef = (cid, nid) => metRefE.res.get(cid).displacements.get(nid).ry * 1000;
  bijna("BGT blijvend: zakking op de diktesprong", uzRef(3, 2), REF.uz_knik.blijvend, 0.06, " mm");
  bijna("BGT frequent: zakking op de diktesprong", uzRef(5, 2), REF.uz_knik.frequent, 0.06, " mm");
  for (const [cid, sleutel] of [[3, "blijvend"], [5, "frequent"]]) {
    for (const [nid, veld] of [[1, "k1"], [2, "k2"], [3, "k3"]]) {
      bijna(`BGT ${sleutel}: hoekverdraaiing knoop ${nid}`,
        ryRef(cid, nid), REF.ry[sleutel][veld], 0.06, " mrad");
    }
  }

  // En de eigen stijfheid van de app ter vergelijking: precies de verhouding
  // van de twee E'en, want de doorsnede is in beide gevallen ongescheurd.
  dicht("onze zakking verhoudt zich tot die van de bron als E_bron tot E_cm",
    uz(3, 2) / uzRef(3, 2), REF.E / 30000, 0.001);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[d] BGT: de frequente combinatie, waar de scheurbeheersing op rust");
// ═══════════════════════════════════════════════════════════════════════════
//
// De bron toetst de scheurbeheersing op x = 2458 en x = 4006 en drukt daar
// M_k af. Dat is de BGT-belasting die ook onze §7.3 nodig heeft, en zij komt
// bij ons langs de combinatie die "frequent" heet. Blijkt M_k anders, dan
// vergelijkt [f] straks twee verschillende belastingen en zegt het niets.
{
  const hFreq = handStatica(-REF.q_eg[0], -REF.q_eg[1], -REF.q_veranderlijk, 1.0, 0.50);
  bijna("frequente combinatie: de plaats van M_k", hFreq.xM, REF.scheur[0].x, 1, " mm");
  dicht("frequente combinatie: M_k in het veld", hFreq.M, REF.scheur[0].M_k, 0.1, " kNm");
  dicht("frequente combinatie: M_k op de diktesprong", hFreq.M4, REF.scheur[2].M_k, 0.5, " kNm");

  // En hetzelfde uit de app-route, op het staafeinde dat exact op x = 4000 ligt.
  const ef1 = staaf(5, 1), n1 = ef1.stations_mm.length - 1;
  dicht("frequente combinatie: M_k op de diktesprong uit de app-route",
    ef1.bendingMoment[n1] / 1e6, REF.scheur[2].M_k, 0.5, " kNm");
  dicht("frequente combinatie: oplegreactie knoop 1 uit de app-route",
    Fz(5, 1), hFreq.R1, 0.001, " kN");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[e] Invoerbouw: buildBetonCheckInputs met de korf uit het model");
// ═══════════════════════════════════════════════════════════════════════════
//
// DRIE VELDEN DIE DE APP NOG NIET VERVOERT. `korvenUitStaven` leest korf,
// staalsoort, stroken, staaltak en milieuklasse van de staaf, maar er is op
// `BeamCheckConfig` geen plaats voor de korrelafmeting d_g (§8.2, §9.2(1)e),
// de werkelijke staafafstand s (7.11 en tabel 7.3N) en de regel uit tabel
// 7.4N. De bron geeft d_g (31,5 mm) en s (150 mm) wél op. Ze worden hier
// daarom náást de map gezet — met deze regel erbij, zodat zichtbaar blijft
// dat de app zelf ze vandaag niet meestuurt.
function bouwInvoer(m, resultaten, combinaties) {
  const korven = korvenUitStaven(m.beams);
  for (const [, cfg] of korven) {
    cfg.korrelafmetingMm = 31.5;   // bron: korreldiameter 31,50 mm
    cfg.staafafstandMm = 150;      // bron: Ø10-150
    // `constructievorm` blijft LEEG. Tabel 7.4N vraagt of de staaf een eind-,
    // een tussenveld of een uitkraging is; onze toetsing is per STAAF en onze
    // staven zijn stukken van één overspanning (4000 en 1000 mm), dus l/d zou
    // met de verkeerde l worden gerekend. De bron toetst 7.4.2 ook niet — zij
    // toont zakkingen. Leeg laten levert een eerlijke "niet uitgevoerd".
  }
  return buildBetonCheckInputs({
    nodes: m.nodes, beams: m.beams, supports: m.supports,
    combinations: combinaties, combinationResults: resultaten, korven,
  });
}
const { inputs, skipped } = bouwInvoer(model, res, actief);
{
  ok("beide staven zijn toetsbaar", inputs.length === 2 && skipped.length === 0,
    skipped.map((s) => `staaf ${s.beamId}: ${s.reason}`).join("; ") || "geen enkele overgeslagen");
  const [i1, i2] = inputs;
  ok("staaf 1: doorsnede 1000 × 280 mm C20/25",
    i1.section.b_mm === 1000 && i1.section.h_mm === 280 && i1.concrete_class === "C20/25");
  ok("staaf 2: doorsnede 1000 × 140 mm C20/25",
    i2.section.b_mm === 1000 && i2.section.h_mm === 140 && i2.concrete_class === "C20/25");
  ok("milieuklasse XC1 komt door", i1.exposure_class === "XC1" && i2.exposure_class === "XC1");
  ok("korrelafmeting 31,5 mm komt door", i1.aggregate_size_mm === 31.5);
  ok("staafafstand 150 mm komt door", i1.bar_spacing_mm === 150);
  ok("wapeningsstaal B500B komt door", i1.reinforcement_grade === "B500B");
  // Zonder de frequente omhullende blijft §7.3 ongedaan zonder dat er iets
  // rood wordt; dat is precies het soort stilte dat deze test moet vangen.
  const freq = new Set(i1.sls_frequent_envelope.map((p) => p.combination_id));
  ok("de frequente BGT-omhullende komt mee en hoort bij combinatie 5",
    i1.sls_frequent_envelope.length > 0 && freq.size === 1 && freq.has(5),
    `${i1.sls_frequent_envelope.length} punten`);
  const uls = new Set(i1.forces_envelope.map((p) => p.combination_id));
  ok("de UGT-omhullende draagt beide UGT-combinaties",
    uls.size === 2 && uls.has(1) && uls.has(2), `${i1.forces_envelope.length} punten`);
}

// ═══════════════════════════════════════════════════════════════════════════
// DE REKENKERN
// ═══════════════════════════════════════════════════════════════════════════
const KERN_AANWEZIG = existsSync(TOETSBRUG);
function kern(opdracht, invoer) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs: invoer }),
    maxBuffer: 256 * 1024 * 1024, encoding: "utf8",
  });
  if (r.error) throw r.error;
  const data = JSON.parse(r.stdout);
  if (data && !Array.isArray(data) && typeof data === "object" && "fout" in data) {
    throw new Error(data.fout);
  }
  return data;
}
function meldKernOntbreekt() {
  failed++;
  log(`  ✗ de rekenkern ontbreekt: ${TOETSBRUG}`);
  log("    bouw hem met  cargo build --release -p toetsbrug  vanuit src-tauri;");
  log("    zonder hem is NIET aangetoond dat deze vloer door onze toetsing komt.");
}
/** Deeltoets uit een kernresultaat; de kern verpakt elke toets in `kind`. */
const toets = (r, id) => {
  const c = (r.checks ?? []).find((x) => x.id === id);
  return c ? (c.kind?.data ?? c) : undefined;
};
const variabele = (r, id, symbool) =>
  (toets(r, id)?.variables ?? []).find((v) => v.symbol === symbool)?.value;

// ═══════════════════════════════════════════════════════════════════════════
log("\n[f] De echte toetsing (EN 1992-1-1) naast de bron");
// ═══════════════════════════════════════════════════════════════════════════
let uitkomst = null;
if (!KERN_AANWEZIG) {
  meldKernOntbreekt();
} else {
  uitkomst = kern("check_concrete_beams", inputs);
  const [r1, r2] = uitkomst;

  ok("de kern levert een resultaat per staaf", uitkomst.length === 2);
  // Zestien: de vijftien die er altijd waren, plus de §5.8-regel die er sinds
  // de kolomtoets ALTIJD in staat. Deze vloerplaten dragen geen normaaldruk,
  // dus die regel meldt dat §5.8 niet van toepassing is — met de reden, want
  // een weggelaten toets is niet te onderscheiden van een toets die slaagde.
  ok("staaf 1: zestien deeltoetsen", (r1.checks ?? []).length === 16);
  ok("staaf 2: zestien deeltoetsen", (r2.checks ?? []).length === 16);

  // ── De nuttige hoogte ───────────────────────────────────────────────────
  // d = h − c_nom − Ø/2, met c_nom = 25 mm en Ø = 10 mm: 250 en 110 mm. Dat
  // is exact de d waarmee de bron rekent (haar wapeningstabel zet de staaf op
  // 25 mm van de onderrand). De vraag "telt Ø/2 mee" is daarmee beantwoord:
  // ja, en aan beide kanten hetzelfde.
  bijna("staaf 1: nuttige hoogte d", r1.d_mm, 250, 1e-9, " mm");
  bijna("staaf 2: nuttige hoogte d", r2.d_mm, 110, 1e-9, " mm");

  // ── Buiging ─────────────────────────────────────────────────────────────
  log("\n  Buiging (§6.1) — de bron toetst per station, wij per staaf:");
  const b1 = toets(r1, "6.1_bending_stress_block");
  const b2 = toets(r2, "6.1_bending_stress_block");
  log(`    staaf 1 (1000×280): M_Ed ${b1.uc.ed.toFixed(2)} / M_Rd ${b1.uc.rd.toFixed(2)} kNm  uc ${b1.uc.uc.toFixed(3)}  ${b1.status}`);
  log(`      bron x = 2466   : M_Ed ${REF.buiging[0].M_Ed} / M_Rd ${REF.buiging[0].M_Rd} kNm  x_u ${REF.buiging[0].xu} / ${REF.buiging[0].xu_max}`);
  log(`    staaf 2 (1000×140): M_Ed ${b2.uc.ed.toFixed(2)} / M_Rd ${b2.uc.rd.toFixed(2)} kNm  uc ${b2.uc.uc.toFixed(3)}  ${b2.status}`);
  log(`      bron x = 4006   : M_Ed ${REF.buiging[2].M_Ed} / M_Rd ${REF.buiging[2].M_Rd} kNm  x_u ${REF.buiging[2].xu} / ${REF.buiging[2].xu_max}  (bron: voldoet NIET)`);
  log(`      bron x = 5000   : M_Ed ${REF.buiging[3].M_Ed} / M_Rd ${REF.buiging[3].M_Rd} kNm  x_u ${REF.buiging[3].xu} / ${REF.buiging[3].xu_max}`);

  // DE BELASTINGKANT KLOPT — dat is wat de keten aantoont. M_Ed van staaf 1
  // is het rastermoment uit [b], M_Ed van staaf 2 is de snede op de knik.
  dicht("buiging: M_Ed van staaf 1 tegen de bron op x = 2466",
    b1.uc.ed, REF.buiging[0].M_Ed, 0.5, " kNm");
  // De bron drukt op x = 4006 M_Ed = 22,4 af (haar M-lijn 6 mm voorbij de
  // knik); wij toetsen op de knik zelf, waar M = 22,48. Het verschil is die
  // 6 mm afstand, verder niets.
  dicht("buiging: M_Ed van staaf 2 tegen de bron op x = 4006",
    b2.uc.ed, REF.buiging[2].M_Ed, 0.5, " kNm");

  // DE WEERSTANDKANT VERSCHILT — en dat is het hart van deze test.
  // Staaf 1 tegen de bron op x = 2466: allebei de volle korf, dus hier is het
  // verschil zuiver A_s (+5,0 %) en de dekking van de bovenwapening. Zie [g].
  const dM1 = dicht("buiging: M_Rd van staaf 1 tegen de bron op x = 2466",
    b1.uc.rd, REF.buiging[0].M_Rd, 2.0, " kNm");
  // Staaf 2 tegen de bron op x = 5000 — dáár is de wapening van de bron
  // volledig verankerd en dus met de onze vergelijkbaar. Tegen haar 20,0 op
  // x = 4006 is zij dat NIET; zie [g] en [h].
  const dM2 = dicht("buiging: M_Rd van staaf 2 tegen de bron op x = 5000 (volledig verankerd)",
    b2.uc.rd, REF.buiging[3].M_Rd, 5.0, " kNm");
  log(`    → M_Rd wijkt ${dM1.toFixed(1)} % (staaf 1) en ${dM2.toFixed(1)} % (staaf 2) af; [g] rekent na waar dat vandaan komt.`);

  ok("buiging: beide staven zijn afgerekend (geen stille N/A)",
    b1.status !== "NotApplicable" && b2.status !== "NotApplicable",
    `${b1.status} / ${b2.status}`);
  // ONS OORDEEL WIJKT AF VAN DE BRON, EN DAT IS GEEN FOUT MAAR EEN
  // MODELVERSCHIL. Onze korf loopt over de hele staaf door; de bron kort haar
  // onderwapening af en houdt op x = 4006 rekening met de nog niet
  // ontwikkelde verankering. [h] laat zien dat onze kern dezelfde toetsen
  // afkeurt zodra die verminderde wapening wél in de korf staat.
  ok("buiging: met de doorlopende korf voldoet staaf 2 bij ons wél",
    b2.status === "Ok" && b2.uc.uc < 1,
    `uc = ${b2.uc.uc.toFixed(3)} — de bron keurt op x = 4006 af omdat haar staaf daar pas voor ` +
    `${(((REF.buiging[2].x - REF.staaf3.begin_mm) / REF.staaf3.ld_begin_mm) * 100).toFixed(1)} % is verankerd`);

  // ── Dwarskracht ─────────────────────────────────────────────────────────
  log("\n  Dwarskracht (§6.2):");
  const d1 = toets(r1, "6.2_shear");
  const d2 = toets(r2, "6.2_shear");
  log(`    staaf 1: V_Ed ${d1.uc.ed.toFixed(2)} / V_Rd ${d1.uc.rd.toFixed(2)} kN  uc ${d1.uc.uc.toFixed(3)}  ${d1.status}`);
  log(`      bron x = 0     : V_Ed ${REF.dwarskracht[0].V_Ed} / V_Rd,c ${REF.dwarskracht[0].V_Rdc} / V_Rd,max ${REF.dwarskracht[0].V_Rdmax} kN`);
  log(`    staaf 2: V_Ed ${d2.uc.ed.toFixed(2)} / V_Rd ${d2.uc.rd.toFixed(2)} kN  uc ${d2.uc.uc.toFixed(3)}  ${d2.status}`);
  log(`      bron x = 5000  : V_Ed ${REF.dwarskracht[2].V_Ed} / V_Rd,c ${REF.dwarskracht[2].V_Rdc} kN`);

  dicht("dwarskracht: V_Ed van staaf 1 tegen de bron op x = 0",
    d1.uc.ed, REF.dwarskracht[0].V_Ed, 0.5, " kN");
  dicht("dwarskracht: V_Ed van staaf 2 tegen de bron op x = 5000",
    d2.uc.ed, REF.dwarskracht[2].V_Ed, 0.5, " kN");
  dicht("dwarskracht: V_Rd,c van staaf 1 tegen de bron op x = 0",
    d1.uc.rd, REF.dwarskracht[0].V_Rdc, 7.0, " kN");
  dicht("dwarskracht: V_Rd,c van staaf 2 tegen de bron op x = 5000",
    d2.uc.rd, REF.dwarskracht[2].V_Rdc, 7.0, " kN");

  // WELKE WAPENING TELT ALS A_sl. 6.2.2(1) telt alleen de trekwapening die
  // ten minste (l_bd + d) voorbij de doorsnede doorloopt. Onze kern neemt
  // daarvoor de BOVENwapening van de korf, en zegt dat ook in haar noten.
  // Hier zijn boven en onder gelijk (Ø10-150), dus het maakt voor dit geval
  // niets uit — maar de eigenschap ligt vast, zodat een model met ongelijke
  // rijen niet stilzwijgend de verkeerde rij pakt.
  const Asl1 = variabele(r1, "6.2_shear", "A_{sl}");
  bijna("dwarskracht: A_sl is de doorlopende rij van de korf (hier boven = onder)",
    Asl1, KORF.top.count * Math.PI * 25, 1e-6, " mm²");

  // WAAROM HET VERSCHIL NIET AAN A_s LIGT. Bij staaf 1 is V_Rd,c bij ons de
  // ONDERGRENS v_min·b_w·d van 6.2.2(1) en niet de wortelformule; de +5,0 %
  // in A_s doet daar dus helemaal niet mee. Het verschil met de bron moet dus
  // ergens anders zitten — zie de slotlijst.
  const vmin = variabele(r1, "6.2_shear", "v_{min}");
  const dd = variabele(r1, "6.2_shear", "d");
  bijna("dwarskracht: bij staaf 1 is de ondergrens v_min·b_w·d maatgevend",
    vmin * 1000 * dd / 1000, d1.uc.rd, 1e-6, " kN");
  // Bij staaf 2 is dat andersom: daar wint de wortelformule, en daar telt de
  // A_s van de korf dus wél mee.
  const rho2 = variabele(r2, "6.2_shear", "\\rho_l");
  const k2 = variabele(r2, "6.2_shear", "k");
  const formule2 = 0.12 * k2 * (100 * rho2 * 20) ** (1 / 3) * 1000 * 110 / 1000;
  bijna("dwarskracht: bij staaf 2 wint de wortelformule van 6.2.2(1)",
    formule2, d2.uc.rd, 1e-3, " kN");

  // ── Scheurbeheersing ────────────────────────────────────────────────────
  log("\n  Scheurbeheersing (§7.3) — twee VERSCHILLENDE wegen door de norm:");
  const s1 = toets(r1, "7.3.4_scheurwijdte");
  const s2 = toets(r2, "7.3.4_scheurwijdte");
  log(`    wij : 7.3.4, de DIRECTE berekening — w_k tegen w_max`);
  log(`      staaf 1: w_k ${s1.uc.ed.toFixed(3)} / w_max ${s1.uc.rd.toFixed(2)} mm  uc ${s1.uc.uc.toFixed(3)}  ${s1.status}`);
  log(`      staaf 2: w_k ${s2.uc.ed.toFixed(3)} / w_max ${s2.uc.rd.toFixed(2)} mm  uc ${s2.uc.uc.toFixed(3)}  ${s2.status}`);
  log(`    bron: 7.3.3, de TABELWEG (7.2N/7.3N) — M_k tegen M_Rk, s tegen s,max, Ø tegen Ø,max`);
  for (const r of REF.scheur) {
    log(`      x = ${String(r.x).padStart(4)}: M_k ${r.M_k} / M_Rk ${r.M_Rk} kNm, s ${r.s}/${r.s_max}, Ø ${r.phi}/${r.phi_max}${r.voldoet ? "" : "  (bron: voldoet NIET)"}`);
  }
  log("    7.3.3(2) en 7.3.4 zijn ALTERNATIEVEN — de norm laat beide toe. M_Rk, s,max");
  log("    en Ø,max hebben in 7.3.4 geen tegenhanger, dus die kolommen zijn niet");
  log("    één-op-één te vergelijken. Wat WEL vergelijkbaar is: de BGT-belasting M_k");
  log("    waarop beide wegen staan, en het oordeel.");

  // Dat de belasting dezelfde is, is de vergelijking die wél kan. σ_s en w_k
  // volgen daar bij ons uit; M_Rk en Ø_max volgen daar bij de bron uit. Het
  // moment komt uit de afleiding van de kern zelf: zij drukt in haar noot af
  // met welke M zij σ_s heeft bepaald.
  const M_gebruikt = (s1.notes ?? [])
    .map((n) => /op x = ([\d.]+) mm, M = ([-\d.]+) kNm/.exec(n))
    .find(Boolean);
  ok("scheur: de kern noemt zelf de BGT-belasting waarop zij σ_s bepaalde",
    M_gebruikt !== undefined, M_gebruikt?.[0] ?? "geen noot gevonden");
  if (M_gebruikt) {
    dicht("scheur: die belasting is die van de bron op x = 2458",
      Number(M_gebruikt[2]), REF.scheur[0].M_k, 0.5, " kNm");
  }
  ok("scheur: w_max = 0,40 mm (geamendeerde tabel 7.1N, XC1, betonstaal)",
    Math.abs(s1.uc.rd - 0.40) < 1e-9 && Math.abs(s2.uc.rd - 0.40) < 1e-9);
  ok("scheur: de opgegeven staafafstand van 150 mm is gebruikt in (7.11)",
    (s1.notes ?? []).some((n) => n.includes("(7.11)")),
    (s1.notes ?? []).find((n) => n.includes("(7.11)"))?.slice(0, 80) ?? "—");
  ok("scheur: de kern meldt zelf dat zij de tabelweg van 7.3.3 NIET daarnaast doet",
    (s1.notes ?? []).some((n) => n.includes("7.3.3")),
    "dat is precies het verschil met de bron");
  // Ook hier: ons oordeel is anders dan dat van de bron op x = 4006, en om
  // dezelfde reden als bij de buiging. [h] toont dat.
  ok("scheur: met de doorlopende korf voldoet staaf 2 bij ons wél",
    s2.status === "Ok" && s2.uc.uc < 1, `uc = ${s2.uc.uc.toFixed(3)}`);

  // ── Wat niet kon, en waarom ─────────────────────────────────────────────
  log("\n  Niet uitgevoerd (met reden — geen stilte):");
  for (const r of [r1, r2]) {
    for (const c of r.checks ?? []) {
      const t = c.kind?.data ?? c;
      if (t.status === "NotApplicable") {
        log(`    staaf ${r.beam_id} ${c.id.padEnd(28)} ${String(t.notes?.[0] ?? "").slice(0, 90)}`);
      }
    }
  }
  // Vier van de zes horen bij de ontbrekende beugels — een plaat heeft ze
  // niet, en de bron toont ze ook niet. De vijfde is 7.4.2; zie [e]. De zesde
  // is de slankheidsgrens van 5.8.3.1: deze platen dragen geen normaaldruk, dus
  // §5.8 is er niet op van toepassing en de toets zegt dat.
  const na1 = (r1.checks ?? []).filter((c) => (c.kind?.data ?? c).status === "NotApplicable").map((c) => c.id);
  ok("niet-toetsbaar zijn precies de vier beugeleisen, de slankheid en 5.8",
    na1.length === 6
      && na1.filter((i) => i.startsWith("9.2.2")).length === 4
      && na1.includes("7.4.2_slankheid")
      && na1.includes("5.8.3.1_slankheidsgrens"),
    na1.join(", "));
  // NotOk mag hier niet stilletjes ergens anders opduiken.
  const onverwacht = [...(r1.checks ?? []), ...(r2.checks ?? [])]
    .map((c) => ({ id: c.id, status: (c.kind?.data ?? c).status }))
    .filter((c) => c.status === "NotOk");
  ok("met de doorlopende korf keurt geen enkele deeltoets af",
    onverwacht.length === 0, onverwacht.map((c) => c.id).join(", ") || "—");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[g] Verklaring: dezelfde meetkunde met de hand, van beide kanten");
// ═══════════════════════════════════════════════════════════════════════════
//
// Een onafhankelijke derde partij: krachtenevenwicht in de doorsnede met het
// rechthoekige spanningsblok van 3.1.7(3) en het bilineaire staaldiagram met
// horizontale bovenste tak (3.2.7(2)b). Alle materiaalgetallen komen uit de
// norm, alle maten uit de invoer van de bron.
//
//   C = η·f_cd·b·λ·x ,  σ_s,i = min(E_s·ε_cu3·(d_i − x)/x ; f_yd)  (trek +)
//   x volgt uit ΣF = 0 ,  M_Rd = Σ A_i·σ_i·(d_i − λx/2)
//
// De TWEEDE laag telt hier mee als TREKwapening. Dat is geen truc: de
// drukzone van deze plaatstrook is maar ±27 mm hoog, en de "bovenwapening"
// ligt op 30 mm (onze dekking) of 45 mm (die van de bron) — dus ONDER de
// neutrale lijn, en dus in trek. Dat verklaart meteen waarom de bron een x_u
// van 34,3 mm afdrukt waar een berekening met alleen de onderwapening op
// ±22 mm uitkomt.
const NORM = {
  f_cd: 20 / 1.5,        // C20/25, α_cc = 1,0 (nationale bijlage)
  f_yd: 500 / 1.15,      // B500B
  E_s: 200000,           // 3.2.7(4)
  eps_cu3: 0.0035,       // tabel 3.1, C20/25
  lambda: 0.8, eta: 1.0, // 3.1.7(3), f_ck ≤ 50 N/mm²
  b: 1000,
};
function doorsnede(lagen) {
  const { f_cd, f_yd, E_s, eps_cu3, lambda, eta, b } = NORM;
  const F = (x) => lagen.reduce((som, l) => {
    const sig = Math.max(-f_yd, Math.min(f_yd, E_s * eps_cu3 * (l.d - x) / x));
    return som + l.A * sig;
  }, 0) - eta * f_cd * b * lambda * x;
  let lo = 1e-6, hi = 1000;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (F(mid) > 0) lo = mid; else hi = mid; }
  const x = (lo + hi) / 2;
  const M = lagen.reduce((som, l) => {
    const sig = Math.max(-f_yd, Math.min(f_yd, E_s * eps_cu3 * (l.d - x) / x));
    return som + l.A * sig * (l.d - lambda * x / 2);
  }, 0) / 1e6;
  return { x, M };
}
{
  const A_ons = KORF.bottom.count * Math.PI * 25;

  // ── Onze kant. Dekking 25 mm aan beide zijden: onder op d = h − 30, boven
  //    op d' = 30. Dit hoort de M_Rd van de kern EXACT terug te geven; doet
  //    het dat niet, dan rekent de kern iets anders dan de norm zegt.
  const ons280 = doorsnede([{ A: A_ons, d: 250 }, { A: A_ons, d: 30 }]);
  const ons140 = doorsnede([{ A: A_ons, d: 110 }, { A: A_ons, d: 30 }]);
  log(`  onze doorsnede 1000×280: x = ${ons280.x.toFixed(2)} mm, M_Rd = ${ons280.M.toFixed(2)} kNm`);
  log(`  onze doorsnede 1000×140: x = ${ons140.x.toFixed(2)} mm, M_Rd = ${ons140.M.toFixed(2)} kNm`);
  if (uitkomst) {
    dicht("handafleiding = kern, staaf 1", toets(uitkomst[0], "6.1_bending_stress_block").uc.rd, ons280.M, 0.05, " kNm");
    dicht("handafleiding = kern, staaf 2", toets(uitkomst[1], "6.1_bending_stress_block").uc.rd, ons140.M, 0.05, " kNm");
    bijna("handafleiding = kern, drukzonehoogte x",
      variabele(uitkomst[0], "6.1_bending_stress_block", "x"), ons280.x, 0.01, " mm");
  }

  // ── De kant van de bron. Drie verschillen, alle drie INVOER:
  //    1. A_s = 6,667 Ø10 per meter in plaats van 7 (uitgesmeerd);
  //    2. de bovenwapening ligt op 45 mm (dekking 40 + Ø/2) in plaats van 30;
  //    3. de onderwapening van de dunne plaat is bij de knik nog niet
  //       ontwikkeld: haar staaf begint op x = 3819 met een
  //       verankeringslengte van 284 mm, dus op x = 4006 is daarvan
  //       (4006 − 3819)/284 beschikbaar en op x = 4000 nog iets minder.
  const A_bron = AS_BRON_MM2;
  const ontwikkeld = (x) =>
    Math.max(0, Math.min(1, (x - REF.staaf3.begin_mm) / REF.staaf3.ld_begin_mm));
  const bron = {
    2466: doorsnede([{ A: A_bron, d: 250 }, { A: A_bron, d: 45 }]),
    // Op de knik zelf ligt de doorsnede nog in de dikke plaat en zitten er
    // TWEE onderlagen: de doorlopende staaf op d = 250 en de nieuwe staaf van
    // de dunne plaat op d = 115, die daar pas deels ontwikkeld is.
    4000: doorsnede([
      { A: A_bron, d: 250 },
      { A: A_bron * ontwikkeld(4000), d: 115 },
      { A: A_bron, d: 45 },
    ]),
    4006: doorsnede([{ A: A_bron * ontwikkeld(4006), d: 110 }, { A: A_bron, d: 45 }]),
    5000: doorsnede([{ A: A_bron, d: 110 }, { A: A_bron, d: 45 }]),
  };
  log("");
  log("  de bron nagerekend met HAAR invoer (uitgesmeerde A_s, dekking 40 boven, verankering):");
  log("  " + "x [mm]".padEnd(9) + "x_u bron".padStart(10) + "x_u hand".padStart(10) +
      "M_Rd bron".padStart(11) + "M_Rd hand".padStart(11) + "  verankerd");
  for (const r of REF.buiging) {
    const h = bron[r.x];
    log("  " + String(r.x).padEnd(9) + r.xu.toFixed(1).padStart(10) + h.x.toFixed(1).padStart(10) +
        r.M_Rd.toFixed(1).padStart(11) + h.M.toFixed(1).padStart(11) +
        (r.x >= 4000 ? `  ${(ontwikkeld(r.x) * 100).toFixed(1)} %` : "  n.v.t."));
  }
  // Deze grens is ruim en dat hoort: de bron is een ánder programma en drukt
  // haar tussenstappen niet af. Waar het om gaat is dat haar vier M_Rd's uit
  // HAAR eigen invoer volgen — dus dat het verschil met ons in de invoer zit
  // en niet in een coëfficiënt.
  for (const r of REF.buiging) {
    dicht(`bron nagerekend: M_Rd op x = ${r.x}`, bron[r.x].M, r.M_Rd, 3.0, " kNm");
  }
  for (const r of REF.buiging) {
    dicht(`bron nagerekend: x_u op x = ${r.x}`, bron[r.x].x, r.xu, 4.0, " mm");
  }
  // En daarmee is het verschil op x = 4006 benoemd: niet de norm, niet de
  // kern, maar één invoergegeven dat ons model niet kán dragen.
  const zonderVerankering = doorsnede([{ A: A_bron, d: 110 }, { A: A_bron, d: 45 }]);
  ok("het verschil op x = 4006 is de verankering en niets anders",
    zonderVerankering.M > bron[4006].M * 1.2,
    `met volledig ontwikkelde staaf zou de bron daar ${zonderVerankering.M.toFixed(1)} kNm hebben ` +
    `in plaats van ${REF.buiging[2].M_Rd} kNm — ruim boven M_Ed = ${REF.buiging[2].M_Ed} kNm`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[h] Tegenproef: met de wapening die de bron zélf ontwikkeld noemt, keurt onze kern óók af");
// ═══════════════════════════════════════════════════════════════════════════
//
// De bron keurt op x = 4006 twee dingen af: de buiging (M_Ed 22,4 > M_Rd 20,0)
// en de scheurbeheersing (M_k 14,9 > M_Rk 11,7). Beide hebben één oorzaak: de
// onderwapening van de dunne plaat is daar pas voor ±66 % verankerd. Ons
// korfmodel kent geen afgekorte staven — de korf loopt over de hele staaf —
// dus die 66 % is niet in te voeren. Wat wél kan: de korf zó vullen dat de
// hoeveelheid onderwapening de ontwikkelde hoeveelheid van de bron OMSLUIT,
// en kijken of onze kern daar dezelfde twee toetsen afkeurt. Doet zij dat,
// dan is aangetoond dat het oordeelsverschil aan de invoer ligt en niet aan
// de keten.
//
// Het aantal staven is een geheel getal, dus omsluiten gaat met 4 en 5:
// de bron heeft op x = 4006 (4006 − 3819)/284 × 6,667 ≈ 4,4 staven aan
// ontwikkelde wapening. Er wordt hier geen getal gekozen dat "goed uitkomt" —
// 4 en 5 zijn de twee gehele getallen aan weerszijden van wat de bron zelf
// afdrukt.
if (!KERN_AANWEZIG) {
  meldKernOntbreekt();
} else {
  const staven_bron = ((REF.buiging[2].x - REF.staaf3.begin_mm) / REF.staaf3.ld_begin_mm) * (1000 / 150);
  log(`  de bron heeft op x = 4006 ${staven_bron.toFixed(2)} Ø10 aan ONTWIKKELDE onderwapening beschikbaar`);
  ok("dat aantal ligt tussen 4 en 5", staven_bron > 4 && staven_bron < 5);

  const uitslagen = [];
  for (const n of [7, 5, 4]) {
    const m = bouwModel({ onderStaven: n });
    const { actief: a, res: rr } = rekenDoor(m);
    const { inputs: inv } = bouwInvoer(m, rr, a);
    const r = kern("check_concrete_beams", inv)[1];   // staaf 2
    const bui = toets(r, "6.1_bending_stress_block");
    const scheur = toets(r, "7.3.4_scheurwijdte");
    uitslagen.push({ n, bui, scheur, status: r.status });
    log(`  onder ${n}Ø10 (A_s = ${(n * Math.PI * 25).toFixed(1)} mm²): ` +
        `buiging ${bui.status} uc ${bui.uc.uc.toFixed(3)} (M_Rd ${bui.uc.rd.toFixed(2)} kNm), ` +
        `scheurwijdte ${scheur.status} uc ${scheur.uc.uc.toFixed(3)} (w_k ${scheur.uc.ed.toFixed(3)} mm)`);
  }
  const [v7, v5, v4] = uitslagen;
  ok("met de volle doorlopende korf (7Ø10) voldoet de buiging", v7.bui.status === "Ok");
  ok("met 5Ø10 keurt onze kern de BUIGING af — net als de bron op x = 4006",
    v5.bui.status === "NotOk",
    `uc = ${v5.bui.uc.uc.toFixed(3)}, M_Rd = ${v5.bui.uc.rd.toFixed(2)} kNm tegen ${REF.buiging[2].M_Rd} kNm in de bron`);
  ok("met 4Ø10 keurt onze kern ÓÓK de scheurbeheersing af — dezelfde twee als de bron",
    v4.bui.status === "NotOk" && v4.scheur.status === "NotOk",
    `buiging uc ${v4.bui.uc.uc.toFixed(3)}, scheurwijdte uc ${v4.scheur.uc.uc.toFixed(3)}`);
  // En de M_Rd die onze kern daar berekent ligt om de waarde van de bron
  // heen: 5Ø10 eronder, 7Ø10 erboven. Dat sluit de verklaring.
  ok("de M_Rd van de bron op x = 4006 ligt tussen onze 5Ø10 en onze 7Ø10",
    v5.bui.uc.rd < REF.buiging[2].M_Rd && REF.buiging[2].M_Rd < v7.bui.uc.rd,
    `${v5.bui.uc.rd.toFixed(2)} < ${REF.buiging[2].M_Rd} < ${v7.bui.uc.rd.toFixed(2)} kNm`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n" + "═".repeat(100));
log("DE AFWIJKINGEN, MET HUN VERKLARING");
log("═".repeat(100));
for (const regel of [
  "1. Oplegreacties, dwarskracht en moment: ≤ 0,02 % afwijking. Die rest komt uit de",
  "   afgeronde q van 3,434 kN/m in de bron tegen onze 3,4335 kN/m; het eigen gewicht",
  "   zelf komt met dezelfde ρ en g op hetzelfde uit ([a]).",
  "2. Het VELDMOMENT dat de toetsing in gaat is 36,66 in plaats van 36,68 kNm. Onze",
  "   envelop draagt 21 stations per staaf, dus om de 200 mm; het werkelijke maximum",
  "   op x = 2466 valt daartussen. De handafleiding geeft 36,68 kNm exact ([b]).",
  "3. M_Rd wijkt af omdat A_s verschilt: Ø10-150 is bij ons zeven hele staven per",
  "   strook (549,8 mm²), bij de bron de uitgesmeerde 6,667 (523,6 mm²), +5,0 %.",
  "   Daar tegenover ligt onze bovenwapening op 30 mm in plaats van 45 mm — onze korf",
  "   draagt één dekking, de bron twee (25 onder, 40 boven) — en die laag trekt bij",
  "   deze lage drukzone mee. De twee werken tegen elkaar in ([g]).",
  "4. Op x = 4006 keurt de bron de buiging en de scheurbeheersing af en wij niet. Dat",
  "   is één invoergegeven: haar onderwapening in de dunne plaat begint op x = 3819",
  "   en heeft 284 mm verankeringslengte, dus op x = 4006 is zij pas voor 66 %",
  "   ontwikkeld. Ons korfmodel kent geen afgekorte staven. Vul je de korf met de",
  "   hoeveelheid die de bron daar ontwikkeld noemt, dan keurt onze kern dezelfde",
  "   twee toetsen af ([h]).",
  "5. V_Rd,c wijkt ±6 % af. Bij staaf 1 kán dat niet aan A_s liggen: daar is de",
  "   ondergrens v_min·b_w·d maatgevend, waarin A_s niet voorkomt ([f]). Blijven over:",
  "   de nuttige hoogte die de bron aanhoudt (haar V_Rd,c-kolom staat op de TREK-zijde,",
  "   die per station wisselt) en het feit dat zij een NIEUWERE nationale bijlage",
  "   volgt dan onze kern. Zonder haar tussenstappen is dat niet verder te scheiden;",
  "   er is hier niets bijgesteld om het kloppend te maken.",
  "6. Scheurbeheersing: de bron gebruikt 7.3.3 (de tabelweg, zonder directe",
  "   berekening) en onze kern 7.3.4 (de directe berekening). 7.3.3(2) en 7.3.4 zijn",
  "   alternatieven die de norm allebei toestaat; M_Rk, s,max en Ø,max hebben in",
  "   7.3.4 geen tegenhanger. Vergelijkbaar zijn alleen de BGT-belasting M_k — die",
  "   op 0,1 % gelijk is — en het oordeel ([d], [f]).",
  "7. De E van 6748 N/mm² in de bron is kruipverzwakt (φ = 2,70). Met díé E komen haar",
  "   zakkingen en hoekverdraaiingen op 0,1 mm en 0,1 mrad uit onze solver, en de",
  "   krachten veranderen er tot op de laatste bit niet van: de strook is statisch",
  "   bepaald. Beide zijn gemeten, niet aangenomen ([c]).",
  "8. §7.4.2 (slankheid) is bij ons niet uitgevoerd: de regel uit tabel 7.4N is niet",
  "   opgegeven, en onze toetsing is per staaf terwijl de overspanning 5000 mm is.",
  "   De bron toetst 7.4.2 evenmin; zij toont zakkingen ([e]).",
  "9. §9.2.2 (beugels) is bij ons niet toetsbaar en bij de bron leeg: het is een",
  "   plaat zonder beugels. Dat is geen verschil ([f]).",
]) log(regel);

log("\n" + "─".repeat(100));
log(`bgvloer-referentie: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
