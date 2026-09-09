// Houten dakconstructie — nagerekend tegen een externe referentie-berekening.
//
// BRON. "3066 5.1 Dakconstructie.pdf" in de map met verificatieberekeningen
// (die map valt buiten git). Alle verwachtingen hieronder staan LETTERLIJK in
// die uitdraai; geen enkel getal is uit onze eigen uitvoer overgenomen.
//
// WAT DIT MODEL BIJZONDER MAAKT — EN WAAROM DE TEST IN TWEEËN VALT
// ----------------------------------------------------------------
// De doorsnede heet in de uitdraai "75 x 175", maar dat IS geen 75 x 175. De
// doorsnedetabel geeft A = 82 840 mm², I_y = 139 045 333 mm⁴,
// S_y = 1 614 200 mm³, W_y;el = 2 317 422 mm³, en uiterste maten y = ±500 mm,
// z = ±60 mm. Deel 1 van deze test laat zien dat dat exact een PLAT GELEGDE
// I-doorsnede is: flenzen 1000 x 40 boven en onder, lijf 71 x 40 ertussen,
// totale hoogte 120 mm.
//
// Die vorm valt buiten wat onze houttoetsing aankan — die neemt een rechthoek
// b x h. Daarom:
//
//   deel 1  de doorsnede zelf: de vormhypothese tegen de zes gepubliceerde
//           doorsnedegrootheden. Zuivere meetkunde.
//   deel 2  de KRACHTSVERDELING: oplegreacties, staafkrachten, veldtoppen en
//           knoopverplaatsingen. Die hangt NIET van de doorsnedevorm af zolang
//           alle staven hetzelfde profiel hebben — bij een statisch onbepaald
//           deel (de doorgaande ligger 6-7-8) valt E·I links en rechts van elk
//           steunpunt tegen elkaar weg. Voor de verplaatsingen telt E·I wél
//           absoluut; daar zijn E = 11 000 N/mm² en I_y uit de doorsnedetabel
//           van de referentie zelf gebruikt, niet uit een eigen aanname.
//   deel 3  de GRENS: welke weg door onze keten deze doorsnede neemt, en
//           hoeveel een rechthoek-vervanging ernaast zit. Dit deel legt een
//           BEPERKING vast, geen goed gedrag. Valt hij om, dan is de beperking
//           vermoedelijk opgeheven en hoort de test bijgewerkt te worden.
//
// TWEEDE ORDE. De referentie rekent geometrisch niet-lineair met scheefstand
// 1/200. Alle staven liggen horizontaal en de uitdraai geeft over de hele
// constructie N = 0,000 kN; zonder normaalkracht doet de tweede orde niets en
// is een eerste-orde-berekening de juiste vergelijking.
//
// EIGEN GEWICHT. De lastentabel noemt 0,341 kN/m. Dat is de AFGERONDE waarde
// van rho·A·g = 420 · 82 840e-6 · 9,81 = 0,34132 kN/m. Met 0,341 wijken twee
// oplegreacties 0,002 kN af, met 0,34132 klopt élk gepubliceerd cijfer. De
// test rekent daarom met de onafgeronde waarde en toont daarmee meteen aan dat
// A = 82 840 mm² en rho = 420 kg/m³ de juiste combinatie zijn.
//
// Draaien met: npx tsx test-dakconstructie-referentie.mjs

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { resolveSection, eigenGewichtPerMeter } = await import("./src/lib/sectionResolver.ts");
const { buildTimberCheckInputs, parseTimberRectMm } = await import("./src/lib/timberCheckBuilder.ts");
const { buildSteelCheckInputs, isSteelProfile } = await import("./src/lib/steelCheckBuilder.ts");

let geslaagd = 0, gezakt = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Absolute tolerantie — de referentie print op 3 decimalen. */
function check(naam, actueel, verwacht, tol) {
  const ok = Number.isFinite(actueel) && Math.abs(actueel - verwacht) <= tol;
  if (ok) { geslaagd++; log(`  ✓ ${naam}: ${actueel.toFixed(3)} ≈ ${verwacht.toFixed(3)}`); }
  else { gezakt++; log(`  ✗ ${naam}: ${actueel} vs ${verwacht} (Δ = ${(actueel - verwacht).toFixed(4)})`); }
}

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { geslaagd++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { gezakt++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

const kN = (v) => v / 1e3;
const kNm = (v) => v / 1e6;

// ═════════════════════════════════════════════════════════════════════════
// DEEL 1 — de doorsnede: welke vorm hoort bij de gepubliceerde grootheden?
// ═════════════════════════════════════════════════════════════════════════
//
// Hypothese: plat gelegde I. Twee flenzen van b_f x t_f = 1000 x 40 (boven en
// onder) met daartussen een lijf van b_w x h_w = 71 x 40. De kleine
// doorsnedetekening in de uitdraai draagt precies die vier maten: 1000, 120,
// 71 en 40.
//
// In het assenstelsel van de referentie ligt y horizontaal (de flensbreedte,
// -500..+500) en z verticaal (de hoogte, -60..+60). Buiging om y is dus de as
// met de HOOGTE 120 mm erin — de zwakke as van de twee, want I_z is bijna
// vijftig keer groter. De ligger draagt op zijn plat.
log("\n[1] Doorsnede: is \"75 x 175\" de plat gelegde I 1000/71/40?");
const BF = 1000, TF = 40, BW = 71, HW = 40;
const H = 2 * TF + HW;                                   // 120 mm
const A_MM2 = 2 * BF * TF + BW * HW;
const IY_MM4 = 2 * (BF * TF ** 3 / 12 + BF * TF * ((H - TF) / 2) ** 2) + BW * HW ** 3 / 12;
// S_y = statisch moment van de halve doorsnede om de zwaartelijn: de hele
// bovenflens plus de bovenste helft van het lijf.
const SY_MM3 = BF * TF * ((H - TF) / 2) + BW * (HW / 2) * (HW / 4);
const WY_MM3 = IY_MM4 / (H / 2);
const IZ_MM4 = 2 * (TF * BF ** 3 / 12) + HW * BW ** 3 / 12;
const SZ_MM3 = 2 * (TF * BF / 2) * (BF / 4) + (HW * BW / 2) * (BW / 4);
{
  check("hoogte h = 2*t_f + h_w", H, 120, 0);            // z van -60 tot +60
  check("A", A_MM2, 82840, 0.5);
  check("I_y", IY_MM4, 139045333, 1);
  check("S_y", SY_MM3, 1614200, 1);
  check("W_y;el = I_y / (h/2)", WY_MM3, 2317422, 1);
  check("I_z", IZ_MM4, 6667859703, 1);
  check("S_z", SZ_MM3, 10025205, 1);
  check("i_y = sqrt(I_y/A)", Math.sqrt(IY_MM4 / A_MM2), 41.0, 0.05);
  check("i_z = sqrt(I_z/A)", Math.sqrt(IZ_MM4 / A_MM2), 283.7, 0.05);
  // rho_mean = 420 kg/m3 voor C24 (EN 338) — het gewicht sluit de kring.
  check("G = rho*A", 420 * A_MM2 * 1e-6, 34.8, 0.05);
}

// ═════════════════════════════════════════════════════════════════════════
// DEEL 2 — de krachtsverdeling
// ═════════════════════════════════════════════════════════════════════════
//
// Twee LOSSE liggerlijnen, elk met een overstek aan de linkerkant.
//
//   lijn A (z = 0):     1(0) --- 2(300) ========== 3(4500) --- 4(5800)
//                              scharnier        rol
//   lijn B (z = 1437):  5(0) --- 6(1000) ==== 7(2700) ==== 8(3900)
//                              scharnier     rol         rol
//
// LET OP — knoop 8 draagt. De knopentabel geeft hem een verticale oplegging en
// de reactietabel een reactie van 1,704 / 1,935 kN. Lijn B is dus een
// doorgaande ligger over DRIE steunpunten met een uitkraging, niet een enkel
// veld. Zou knoop 8 vrij hangen, dan zou lijn B labiel zijn.
const E_MOD = 11000;                                     // N/mm², C24 E_0,mean
const Q_EG = -(420 * A_MM2 * 1e-6 * 9.81) / 1000;        // kN/m = N/mm, omlaag

const nodes = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: 300, z: 0 },
  { id: 3, x: 4500, z: 0 }, { id: 4, x: 5800, z: 0 },
  { id: 5, x: 0, z: 1437 }, { id: 6, x: 1000, z: 1437 },
  { id: 7, x: 2700, z: 1437 }, { id: 8, x: 3900, z: 1437 },
];
const staaf = (id, from, to) => ({ id, from, to, E: E_MOD, A: A_MM2, I: IY_MM4 });
const beams = [
  staaf(1, 1, 2), staaf(2, 2, 3), staaf(3, 3, 4),
  staaf(4, 5, 6), staaf(5, 6, 7), staaf(6, 7, 8),
];
const supports = [
  { nodeId: 2, type: "pinned" }, { nodeId: 3, type: "zRoller" },
  { nodeId: 6, type: "pinned" }, { nodeId: 7, type: "zRoller" },
  { nodeId: 8, type: "zRoller" },
];
// Belastinggeval 1 = blijvend (eigen gewicht inbegrepen), 2 = veranderlijk
// (categorie A, woonfunctie). q in N/mm, wat gelijk is aan kN/m.
const loads = [
  { beamId: 1, q: -0.290, caseId: 1 },
  { beamId: 2, q: Q_EG, caseId: 1 }, { beamId: 2, q: -0.540, caseId: 1 },
  { beamId: 3, q: Q_EG, caseId: 1 }, { beamId: 3, q: -0.290, caseId: 1 },
  { beamId: 4, q: Q_EG, caseId: 1 }, { beamId: 4, q: -2.100, caseId: 1 },
  { beamId: 5, q: Q_EG, caseId: 1 }, { beamId: 5, q: -2.100, caseId: 1 },
  { beamId: 6, q: Q_EG, caseId: 1 }, { beamId: 6, q: -2.100, caseId: 1 },
  { beamId: 1, q: -1.000, caseId: 2 },
  { beamId: 2, q: -1.000, caseId: 2 },
  { beamId: 4, q: -4.000, caseId: 2 },
];
const perCase = solveAllCases({
  nodes, beams, supports, loads,
  cases: [{ id: 1, name: "Blijvend" }, { id: 2, name: "Veranderlijk" }],
}).perCase;

// De combinatiefactoren staan uitgeschreven in de uitdraai:
//   6.10a  belastinggeval 1 x 1,22   belastinggeval 2 x (0,40 x 1,35)
//   6.10b  belastinggeval 1 x 1,08   belastinggeval 2 x (1,00 x 1,35)
// De 0,40 is psi_0 voor categorie A; de reductie op gamma hoort bij CC1.
const combi = (id, naam, type, f) =>
  ({ id, name: naam, type, formula: naam, factors: new Map(f) });
const r610a = combineResults(combi(1, "6.10a", "uls", [[1, 1.22], [2, 0.40 * 1.35]]), perCase);
const r610b = combineResults(combi(2, "6.10b", "uls", [[1, 1.08], [2, 1.35]]), perCase);
const rBgtBlijvend = combineResults(combi(3, "BGT blijvend", "sls", [[1, 1]]), perCase);
const rBgtKarakt = combineResults(combi(5, "BGT karakteristiek", "sls", [[1, 1], [2, 1]]), perCase);

// ── 2a. Oplegreacties ────────────────────────────────────────────────────
log("\n[2a] Oplegreacties F_z [kN] — uitdraai 2.2.2");
{
  // knoop: [6.10a, 6.10b]
  const ref = { 2: [3.515, 5.213], 3: [4.539, 5.840], 6: [9.123, 12.890], 7: [2.949, 0.858], 8: [1.704, 1.935] };
  for (const [id, [a, b]] of Object.entries(ref)) {
    check(`knoop ${id} — 6.10a`, kN(r610a.reactions.get(+id).fz), a, 0.002);
    check(`knoop ${id} — 6.10b`, kN(r610b.reactions.get(+id).fz), b, 0.002);
  }
  // Alle lasten staan loodrecht; er hoort geen horizontale reactie te zijn.
  check("knoop 2 F_x", kN(r610b.reactions.get(2).fx), 0, 1e-6);
  check("knoop 6 F_x", kN(r610b.reactions.get(6).fx), 0, 1e-6);
  // Evenwicht: de som van de reacties van lijn B is de som van de lasten erop.
  const somB = kN(r610b.reactions.get(6).fz + r610b.reactions.get(7).fz + r610b.reactions.get(8).fz);
  const lastB = (1.08 * -Q_EG + 1.35 * 4.0) * 1.0 + (1.08 * -Q_EG + 1.08 * 2.1) * (1.7 + 1.2) + 1.08 * 2.1 * 1.0;
  check("lijn B: som reacties = som lasten", somB, lastB, 0.002);
}

// ── 2b. Staafkrachten aan de knopen ──────────────────────────────────────
//
// TEKENS. De uitdraai geeft "V_z-local" en "M_y-local" per staafUITEINDE en
// draait het teken om tussen begin- en eindknoop van dezelfde staaf: staaf 1
// meldt bij knoop 2 M = -0,075 en staaf 2 meldt bij diezelfde knoop +0,075.
// Onze conventie is doorlopend zakken-positief (zie solver/types.ts), dus M is
// aan beide zijden van een steunpunt even groot en even negatief. Vergelijken
// gebeurt daarom op GROOTTE; de doorlopendheid zelf wordt apart getoetst.
log("\n[2b] Staafkrachten aan de knopen [kN, kNm] — uitdraai 2.2.3");
{
  // [staaf, "start"|"eind", |V|, |M|] per combinatie
  const refA = [
    [1, "eind", 0.268, 0.040], [2, "start", 3.247, 0.040],
    [2, "eind", 3.537, 0.651], [3, "start", 1.001, 0.651],
    [4, "eind", 5.138, 2.569], [5, "start", 3.984, 2.569],
    [5, "eind", 1.079, 0.100], [6, "start", 1.870, 0.100],
    [6, "eind", 1.704, 0.000],
  ];
  const refB = [
    [1, "eind", 0.499, 0.075], [2, "start", 4.714, 0.075],
    [2, "eind", 4.953, 0.576], [3, "start", 0.886, 0.576],
    [4, "eind", 8.037, 4.018], [5, "start", 4.854, 4.018],
    [5, "eind", 0.371, 0.423], [6, "start", 1.229, 0.423],
    [6, "eind", 1.935, 0.000],
  ];
  for (const [naam, res, rij] of [["6.10a", r610a, refA], ["6.10b", r610b, refB]]) {
    for (const [id, eind, v, m] of rij) {
      const ef = res.elements.get(id);
      const i = eind === "start" ? 0 : ef.shearForce.length - 1;
      check(`${naam} staaf ${id} ${eind}: |V|`, Math.abs(kN(ef.shearForce[i])), v, 0.002);
      check(`${naam} staaf ${id} ${eind}: |M|`, Math.abs(kNm(ef.bendingMoment[i])), m, 0.002);
    }
  }
  // De uitdraai geeft over de hele constructie N = 0,000 kN. Dat is meer dan
  // een detail: het is de reden dat de tweede orde hier niets doet en een
  // eerste-orde-vergelijking geldig is.
  for (const id of [1, 2, 3, 4, 5, 6]) {
    check(`6.10b staaf ${id}: N = 0`, kN(r610b.elements.get(id).N), 0, 1e-6);
  }
  // Momentcontinuïteit over knoop 6: het uitkragingsmoment van staaf 4 gaat
  // ongebroken over in staaf 5. In onze conventie dus hetzelfde getal, terwijl
  // de uitdraai daar van teken wisselt.
  const m4 = r610b.elements.get(4).bendingMoment.at(-1);
  const m5 = r610b.elements.get(5).bendingMoment[0];
  check("6.10b: M staaf 4 eind = M staaf 5 begin", kNm(m4 - m5), 0, 1e-6);
}

// ── 2c. Veldtoppen ───────────────────────────────────────────────────────
//
// De uitdraai noemt de plaats van het veldmoment in mm. Onze stationsraster is
// 21 punten per staaf, dus de top valt zelden op een station. Onder een
// gelijkmatig verdeelde last is V lineair en M exact parabolisch: het nulpunt
// van V ligt exact tussen twee stations te interpoleren, en M volgt uit de
// parabool door drie naburige stations. Zo wordt de rasterstap geen fout.
log("\n[2c] Veldmomenten: plaats en grootte — uitdraai 2.2.3");
function veldtop(ef) {
  const V = ef.shearForce, X = ef.stations_mm, M = ef.bendingMoment;
  for (let i = 0; i < V.length - 1; i++) {
    if (V[i] === 0 || (V[i] > 0) !== (V[i + 1] > 0)) {
      const t = V[i] / (V[i] - V[i + 1]);
      const x = X[i] + t * (X[i + 1] - X[i]);
      const j = Math.min(Math.max(i, 1), M.length - 2);
      const [x0, x1, x2] = [X[j - 1], X[j], X[j + 1]];
      const [m0, m1, m2] = [M[j - 1], M[j], M[j + 1]];
      const Mx =
        m0 * (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2)) +
        m1 * (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2)) +
        m2 * (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1));
      return { x, M: Mx };
    }
  }
  return null;
}
{
  // [combinatieresultaat, staaf, x_mm, M_kNm]
  const ref = [
    [r610b, 2, 2048, 4.753],
    [r610a, 5, 1338, 0.096],
    [r610b, 6, 466, 0.710],
  ];
  for (const [res, id, x, m] of ref) {
    const t = veldtop(res.elements.get(id));
    checkWaar(`staaf ${id}: veldtop gevonden`, t !== null);
    if (t) {
      check(`staaf ${id}: x van de veldtop [mm]`, t.x, x, 1.0);
      check(`staaf ${id}: M in de veldtop`, kNm(t.M), m, 0.002);
    }
  }
  // Staaf 5 heeft onder 6.10b GEEN veldtop; de uitdraai noemt er dan ook geen.
  // Het uitkragingsmoment op knoop 6 is dan zo groot dat V nergens door nul
  // gaat en de hele overspanning trek boven houdt.
  checkWaar("6.10b staaf 5: geen veldtop (zoals de uitdraai)", veldtop(r610b.elements.get(5)) === null);
}

// ── 2d. Knoopverplaatsingen ──────────────────────────────────────────────
//
// Hier telt E*I absoluut. De referentie print op 1 decimaal (mm) resp. 1
// decimaal (mrad), dus de tolerantie is de halve printstap plus wat marge.
log("\n[2d] Knoopverplaatsingen — uitdraai 2.3.2");
{
  // knoop: [dz blijvend, dz karakteristiek, dr blijvend, dr karakteristiek]
  const ref = {
    1: [0.5, 1.0, -1.5, -3.5],
    4: [1.5, 4.1, 1.1, 3.1],
    5: [-0.4, -1.3, 0.5, 1.5],
    6: [-0.0, -0.0, 0.2, 0.8],
    7: [0.0, 0.0, -0.0, -0.2],
    8: [0.0, 0.0, 0.1, 0.1],
  };
  for (const [id, [dzP, dzK, drP, drK]] of Object.entries(ref)) {
    const p = rBgtBlijvend.displacements.get(+id);
    const k = rBgtKarakt.displacements.get(+id);
    check(`knoop ${id} dz blijvend [mm]`, p.uz, dzP, 0.06);
    check(`knoop ${id} dz karakteristiek [mm]`, k.uz, dzK, 0.06);
    check(`knoop ${id} dr blijvend [mrad]`, p.ry * 1000, drP, 0.06);
    check(`knoop ${id} dr karakteristiek [mrad]`, k.ry * 1000, drK, 0.06);
  }
  // Knoop 4 gaat OMHOOG terwijl er alleen neerwaartse last staat: het veld
  // 2-3 zakt, kantelt knoop 3 mee, en het overstek 3-4 wipt op. Dat is geen
  // tekenfout maar het bewijs dat het overstek meedraait met het veld.
  checkWaar("knoop 4 wipt op door de rotatie van knoop 3",
    rBgtKarakt.displacements.get(4).uz > 0 && rBgtKarakt.displacements.get(3).ry > 0);
}

// ═════════════════════════════════════════════════════════════════════════
// DEEL 3 — de grens: deze doorsnede komt niet door de houttoetsing
// ═════════════════════════════════════════════════════════════════════════
//
// Dit deel legt vast WAT er nu misgaat, zodat het zichtbaar blijft en zodat
// een latere uitbreiding hier omvalt in plaats van stilletjes te slagen.
log("\n[3] De doorsnede door onze keten");

const PROFIEL_EIGEN = "EIGEN:dakligger I 1000/71/40";
const PROFIEL_RECHT = "1000x120";                        // de rechthoek-vervanging

// ── 3a. Geen enkele bouwer neemt de doorsnede aan ────────────────────────
{
  const nodesB = [{ id: 5, x: 0, z: 1437 }, { id: 6, x: 1000, z: 1437 }];
  const krachten = {
    N: 0, V: 8036.6, M_start: 0, M_end: -4.018e6, L_mm: 1000,
    stations_mm: [0, 500, 1000], normalForce: [0, 0, 0],
    shearForce: [0, -4018.3, -8036.6], bendingMoment: [0, -1.0045e6, -4.018e6],
    deflection: [0, 0, 0], axialDisp: [0, 0, 0],
  };
  const combos = [combi(2, "6.10b", "uls", [[1, 1.08], [2, 1.35]])];
  const uitkomsten = new Map([[2, {
    displacements: new Map(), reactions: new Map(),
    elements: new Map([[4, krachten]]), maxDisplacement: 0,
  }]]);
  const staafC24 = (profile) => ({ id: 4, from: 5, to: 6, material: "C24", profile });

  const hout = buildTimberCheckInputs({
    nodes: nodesB, beams: [staafC24(PROFIEL_EIGEN)],
    combinations: combos, combinationResults: uitkomsten,
  });
  const staal = buildSteelCheckInputs({
    nodes: nodesB, beams: [staafC24(PROFIEL_EIGEN)],
    combinations: combos, combinationResults: uitkomsten, profileDb: new Map(),
  });
  // De houtbouwer wijst hem af omdat `isSteelProfile` élk EIGEN-profiel als
  // staal claimt; de staalbouwer wijst hem af omdat C24 geen staalsoort is.
  // Samen: de staaf wordt door geen van beide getoetst.
  checkWaar("EIGEN-profiel geldt als staalprofiel", isSteelProfile(PROFIEL_EIGEN));
  checkWaar("houttoetsing: geen invoer", hout.inputs.length === 0);
  checkWaar("houttoetsing: overgeslagen met reden", hout.skipped.length === 1,
    hout.skipped[0]?.reason ?? "");
  checkWaar("staaltoetsing: geen invoer", staal.inputs.length === 0);
  checkWaar("staaltoetsing: overgeslagen met reden", staal.skipped.length === 1,
    staal.skipped[0]?.reason ?? "");
  // Een profielnaam is de enige doorsnedebron van de houtbouwer, en die kan
  // alleen b x h uitdrukken — geen I, geen S, geen lijfbreedte.
  checkWaar("EIGEN-naam is geen rechthoek b x h", parseTimberRectMm(PROFIEL_EIGEN) === null);
}

// ── 3b. De solver rekent zo'n staaf met de verkeerde doorsnede ───────────
//
// `resolveSection` bereikt de eigen-doorsnedetak alleen wanneer het materiaal
// GEEN hout en geen beton is. Bij C24 valt de staaf daardoor door naar de
// terugval: HEA 160 in staal. Dat is niet alleen een andere doorsnede maar ook
// een negentien keer zo grote E-modulus.
{
  const eigen = resolveSection("C24", PROFIEL_EIGEN);
  checkWaar("C24 + EIGEN valt terug op de default", eigen.bron === "default");
  check("terugval-E [N/mm2]", eigen.E, 210000, 0);
  checkWaar("terugval-E is niet die van hout", eigen.E !== E_MOD);
  check("terugval-I [mm4]", eigen.I, 1.673e7, 1);
  // Ter vergelijking: met een STAALsoort komt dezelfde profielnaam wél op de
  // eigen-doorsnedetak terecht (daar wordt hij dan wel op naam opgezocht).
  // De tak bestaat dus, hij is alleen voor hout onbereikbaar.
  const staalWeg = resolveSection("S235", PROFIEL_EIGEN);
  checkWaar("de eigen-doorsnedetak zit in de staalroute, niet in de houtroute",
    staalWeg.bron === "default" || staalWeg.bron === "eigen");
}

// ── 3c. Hoeveel zit een rechthoek 1000 x 120 ernaast? ────────────────────
//
// De enige doorsnede die de houttoetsing nu wél aanneemt is een rechthoek. De
// omhullende rechthoek van deze I is 1000 x 120. Daarmee kloppen de buiging en
// de kip toevallig aardig, maar de DWARSKRACHT — juist de maatgevende toets —
// zit er ruim een orde naast, en aan de onveilige kant.
{
  const recht = resolveSection("C24", PROFIEL_RECHT);
  checkWaar("rechthoek 1000x120 wordt wel aangenomen", recht.bron === "hout-bxh");
  check("rechthoek: E is die van C24", recht.E, E_MOD, 0);

  // A: de rechthoek is massief, de I is grotendeels lucht.
  check("A rechthoek / A werkelijk", recht.A / A_MM2, 120000 / 82840, 1e-9);
  checkWaar("A wordt ruim 40 % te groot", recht.A / A_MM2 > 1.4);
  // Het eigen gewicht loopt daar recht in mee: 0,494 in plaats van 0,341 kN/m.
  check("eigen gewicht rechthoek [kN/m]", eigenGewichtPerMeter("C24", PROFIEL_RECHT), -0.4944, 0.001);
  check("eigen gewicht werkelijk [kN/m]", Q_EG, -0.3413, 0.001);

  // I en W: 1000*120^3/12 tegen 139 045 333 — nog geen 4 % verschil, want de
  // flenzen zitten toch al aan de buitenkant.
  check("I rechthoek [mm4]", recht.I, 144000000, 1);
  checkWaar("I wijkt minder dan 4 % af", Math.abs(recht.I / IY_MM4 - 1) < 0.04);

  // Buiging 6.1.6. De referentie rekent sigma = 4,018e6 / 2 317 422 = 1,73
  // N/mm2 tegen f_m,y,d = 15,4 N/mm2 (middellange duur), UC 0,11.
  const M_ED = 4.018e6;                                  // N*mm, staaf 4 knoop 6
  const F_MD = 15.44;                                    // N/mm2, uit de uitdraai
  const sigRef = M_ED / WY_MM3;
  const sigRecht = M_ED / (1000 * 120 ** 2 / 6);
  check("sigma_m,y,d referentie [N/mm2]", sigRef, 1.7, 0.05);
  check("UC 6.1.6 referentie", sigRef / F_MD, 0.11, 0.005);
  check("UC 6.1.6 met de rechthoek", sigRecht / F_MD, 0.11, 0.005);

  // Dwarskracht 6.1.7 — hier breekt het. De referentie rekent
  // tau = V*S_y / (b_lijf * I_y) met b = 71 mm, het LIJF. Onze rechthoek-toets
  // rekent tau = 1,5*V/(b*h) met b = 1000 mm, de volle flensbreedte. Dat is
  // dezelfde formule met de verkeerde breedte én zonder de echte S en I.
  const V_ED = 8036.6;                                   // N
  const F_VD = 2.4615;                                   // N/mm2 = 0,8*4,0/1,3
  const tauRef = V_ED * SY_MM3 / (BW * IY_MM4);
  const tauRecht = 1.5 * V_ED / (1000 * 120);
  check("tau_d referentie [N/mm2]", tauRef, 1.3, 0.02);
  check("UC 6.1.7 referentie (maatgevend)", tauRef / F_VD, 0.53, 0.01);
  check("UC 6.1.7 met de rechthoek", tauRecht / F_VD, 0.04, 0.005);
  checkWaar("de rechthoek onderschat tau met meer dan een factor 10",
    tauRef / tauRecht > 10, `factor ${(tauRef / tauRecht).toFixed(1)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${gezakt === 0 ? "✓ ALLE" : "✗"} ${geslaagd} geslaagd, ${gezakt} gezakt`);
process.exit(gezakt === 0 ? 0 : 1);
