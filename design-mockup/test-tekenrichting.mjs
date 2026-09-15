// De tekenrichting van een staaf mag geen toetsuitkomst veranderen.
//
// WAAROM DEZE TEST BESTAAT
// De solver levert M, V en w in LOKALE staafassen, en welke knoop het begin
// is volgt uit de klikvolgorde. Tot september 2026 kwam dat lokale teken
// ongewijzigd in de toetskernen, die "positief = trek onder" en "bovenflens"
// in wereldtermen lezen. Gemeten: een rechts→links getekende betonnen
// uitkraging toetste de onderwapening als trekwapening (UC 0,662 "voldoet" waar
// 2,891 hoort), een ligger onder windzuiging telde de bovenflenssteunen als
// steunen van de gedrukte flens (kip-UC 0,547 waar 1,428 hoort), en de zeeg
// vergrootte de zakking. De groene testbatterij ving geen van drieën.
//
// De reparatie is één grens: `lib/referentierichting.ts`, als eerste regel van
// elke toetsbouwer. Deze test stuurt DEZELFDE constructie in BEIDE
// tekenrichtingen door de echte keten (bouwMultiInput → solveAllCases →
// combinaties → bouwer → toetsbrug) en eist gelijke uitkomsten. Gelijk is niet
// genoeg — twee keer hetzelfde foute getal is ook gelijk — dus elk blok legt
// daarnaast de fysisch juiste uitkomst vast met een handberekening.
//
// Checks:
//  [a] SPIEGEL      — de gespiegelde solveruitvoer van een omgekeerd getekende
//                     staaf is gelijk aan die van dezelfde staaf in de
//                     referentierichting doorgerekend: ligger met deellast en
//                     puntlast, kolom met horizontale en verticale last, schuine
//                     staaf. Plus de eigenschappen van de grens zelf.
//  [b] BETON        — vrij opgelegde ligger en uitkraging, beide richtingen:
//                     M_Ed tegen de hand, de getoetste trekwapening, M_Rd uit het
//                     spanningsblok van 3.1.7(3) met de hand nagerekend, en de
//                     dekkingslijn van het betonvenster.
//  [c] KIP          — IPE 330 onder neerwaartse last en onder zuiging, en een
//                     ligger met een inklemming (steunen aan beide flenzen op
//                     ongelijke plaatsen): welke steunen tellen, L_st, UC.
//  [d] DOORBUIGING  — zakking tegen 5qL⁴/(384EI); zeeg omhoog bij een
//                     neerwaartse en bij een opwaartse zakking.
//  [e] KOLOM        — een ingeklemde kolom met een horizontale last aan de kop,
//                     van voet naar kop én van kop naar voet getekend: beton
//                     (trekwapening links) en staal (gedrukte flens rechts), met
//                     de wereldtermen in de afleiding.
//  [f] SPRONG       — een naar links hellende staaf rond 75°, waar "boven" van
//                     het bovenvlak naar het ondervlak springt: aan beide kanten
//                     van de grens en op de randen van de band een waarschuwing
//                     (of juist niet), met de fysieke zijde die de meetkunde
//                     aanwijst; door de kern de getelde steunen, de trekwapening
//                     en de waarschuwing letterlijk in de afleiding.
//
// [b], [c], [e] en delen van [d] en [f] starten de toetsbrug als apart proces en
// worden LUID overgeslagen als die binary ontbreekt.
//
// Uitvoeren: npx tsx test-tekenrichting.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=tekenrichting

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults, defaultCombinations } = await import("./src/components/fem/solver/combinations.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { buildSteelCheckInputs, profileLookupKey } = await import("./src/lib/steelCheckBuilder.ts");
const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { bouwDekkingslijnVerzoeken } = await import("./src/lib/betonDekkingslijnBuilder.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");
const { krachtenPerSegment } = await import("./src/lib/betonStijfheid.ts");
const R = await import("./src/lib/referentierichting.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
/** Relatieve toets met een absolute ondergrens; drukt de afwijking altijd af. */
function dicht(naam, gemeten, verwacht, tol = 1e-9, absoluut = 1e-9) {
  const afw = Math.abs(gemeten - verwacht);
  const goed = afw <= Math.max(absoluut, tol * Math.abs(verwacht));
  ok(naam, goed, `${fmt(gemeten)} tegen ${fmt(verwacht)}`);
}
const fmt = (v) => (typeof v === "number" ? (Math.abs(v) < 1e-12 ? "0" : v.toPrecision(6)) : String(v));

const heeftBrug = existsSync(TOETSBRUG);
function kern(opdracht, inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify(inputs === undefined ? { opdracht } : { opdracht, inputs }),
    encoding: "utf8", maxBuffer: 256e6,
  });
  if (r.error) throw r.error;
  const d = JSON.parse(r.stdout);
  if (d && !Array.isArray(d) && typeof d === "object" && "fout" in d) throw new Error(d.fout);
  return d;
}
function slaOver(blok) {
  overgeslagen++;
  log(`  (overgeslagen: ${blok} heeft de toetsbrug nodig — ${TOETSBRUG}; bouw hem met: cargo build --release -p toetsbrug)`);
}

// ── Modelbouw ─────────────────────────────────────────────────────────────
const LEEG = {
  plates: [],
  loadCases: [{ id: 1, name: "Permanent", type: "dead" }, { id: 2, name: "Variabel", type: "live" }],
  selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
};

/** Doorrekenen met de standaardcombinaties, zoals de toetsstore dat doet. */
function reken(model) {
  const perCase = solveAllCases(bouwMultiInput(model)).perCase;
  const { actief } = selecteerCombinaties(defaultCombinations(), model.beams, model.plates);
  const combinationResults = new Map(actief.map((c) => [c.id, combineResults(c, perCase)]));
  return { perCase, combinations: actief, combinationResults };
}

/** Staaf `id` van `from` naar `to`, of andersom. */
const staaf = (id, a, b, omgekeerd, extra = {}) => ({ id, from: omgekeerd ? b : a, to: omgekeerd ? a : b, ...extra });

/** Een fractie vanaf de beginknoop, voor een staaf die al dan niet is omgekeerd. */
const f = (frac, omgekeerd) => (omgekeerd ? 1 - frac : frac);

/** Omhullende gesorteerd op combinatie en positie, als [comb, x, my, vz, n]. */
const omhullende = (inp) =>
  [...inp.forces_envelope]
    .sort((p, q) => p.combination_id - q.combination_id || p.position_mm - q.position_mm)
    .map((p) => [p.combination_id, p.position_mm, p.forces.my_ed, p.forces.vz_ed, p.forces.n_ed]);

function gelijkeOmhullende(naam, a, b) {
  const A = omhullende(a), B = omhullende(b);
  let max = 0, zelfde = A.length === B.length;
  for (let i = 0; zelfde && i < A.length; i++) {
    if (A[i][0] !== B[i][0]) { zelfde = false; break; }
    for (let k = 1; k < 5; k++) max = Math.max(max, Math.abs(A[i][k] - B[i][k]));
  }
  ok(naam, zelfde && max < 1e-6, `${A.length} punten, grootste verschil ${max.toExponential(2)}`);
}

const ucVan = (c) => c?.kind?.data?.uc?.uc ?? c?.uc?.uc ?? null;

/** Dezelfde kipsteunfracties per flens, op 1e-12 (0,2 tegen 1 − 0,8). */
function zelfdeSteunen(a, b) {
  const zelfde = (p, q) => p.length === q.length && p.every((v, i) => Math.abs(v - q[i]) < 1e-12);
  return zelfde(a.lateral_bracing.top_flange_positions, b.lateral_bracing.top_flange_positions) &&
    zelfde(a.lateral_bracing.bottom_flange_positions, b.lateral_bracing.bottom_flange_positions);
}
const toetsVan = (res, id) => res.checks.find((c) => c.id === id);
const notitiesVan = (c) => c?.kind?.data?.notes ?? [];

// ═════════════════════════════════════════════════════════════════════════
log("\n[a] De spiegel: omgekeerd getekend en gespiegeld = in de referentierichting doorgerekend");
{
  const velden = ["stations_mm", "normalForce", "shearForce", "bendingMoment", "deflection", "axialDisp", "rotation"];
  function vergelijk(naam, bouw) {
    const heen = reken(bouw(false)).perCase.get(2) ?? reken(bouw(false)).perCase.get(1);
    const terug = reken(bouw(true)).perCase.get(2) ?? reken(bouw(true)).perCase.get(1);
    const efHeen = heen.elements.get(1);
    const efTerug = R.spiegelElementKrachten(terug.elements.get(1));
    let max = 0, lengtes = true;
    for (const v of velden) {
      const a = efHeen[v] ?? [], b = efTerug[v] ?? [];
      if (a.length !== b.length) { lengtes = false; continue; }
      // Schaal met een ondergrens van 1 (N, N·mm, mm of rad): een reeks die
      // overal nul is — de normaalkracht in een ligger — meet anders ruis.
      const schaal = Math.max(1, ...a.map(Math.abs));
      for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]) / schaal);
    }
    ok(`${naam}: alle reeksen gelijk (M, V, N, w, u, θ, stations)`, lengtes && max < 1e-9, `grootste relatieve verschil ${max.toExponential(2)}`);
    for (const s of ["N", "V", "M_start", "M_end", "L_mm"]) {
      dicht(`${naam}: ${s}`, efTerug[s], efHeen[s], 1e-9, 1e-6);
    }
    return { efHeen, efTerugLokaal: terug.elements.get(1) };
  }

  // Ligger 6 m, links ingeklemd, rechts een rol; een deellast over de linker
  // 40 % en een puntlast op een kwart. Alles asymmetrisch, zodat een positie
  // die niet wordt gespiegeld opvalt.
  const ligger = (om) => ({
    ...LEEG,
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [staaf(1, 1, 2, om, { material: "S235", profile: "IPE300" })],
    supports: [{ id: 1, nodeId: 1, type: "fixed" }, { id: 2, nodeId: 2, type: "zRoller" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -12, startFrac: om ? 0.6 : 0, endFrac: om ? 1 : 0.4 },
      { id: 2, type: "pointForce", caseId: 2, beamId: 1, posFrac: f(0.25, om), fx: 0, fz: -20 },
    ],
  });
  const { efTerugLokaal } = vergelijk("ligger met deellast", ligger);
  // De meting achter de afspraak: lokaal klapt M om, gespiegeld niet.
  // De inklemming is de linker knoop; bij de omgekeerd getekende staaf is dat
  // het EIND. Lokaal staat daar het tegengestelde teken van links→rechts.
  const mLokaal = efTerugLokaal.bendingMoment[efTerugLokaal.bendingMoment.length - 1];
  ok("lokaal geeft het omgekeerd getekende inklemmingsmoment het andere teken", mLokaal > 0,
    `M bij de inklemming, lokaal = ${fmt(mLokaal / 1e6)} kNm`);

  // Kolom 3 m, voet ingeklemd, aan de kop 10 kN naar rechts en 50 kN omlaag.
  const kolom = (om) => ({
    ...LEEG,
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [staaf(1, 1, 2, om, { material: "S235", profile: "HEA160" })],
    supports: [{ id: 1, nodeId: 1, type: "fixed" }],
    loads: [{ id: 1, type: "pointForce", caseId: 2, nodeId: 2, fx: 10, fz: -50 }],
  });
  const { efHeen: kol } = vergelijk("kolom", kolom);
  // Van voet naar kop wijst lokaal +y naar LINKS. Een last naar rechts trekt de
  // voet aan de linkerkant: M_voet = −H·h = −10·3 = −30 kNm (belastinggeval,
  // zonder factor), en de kop verplaatst naar rechts, dus w < 0.
  dicht("kolom van voet naar kop: M aan de voet = −H·h = −30 kNm (trek LINKS)", kol.bendingMoment[0] / 1e6, -30, 1e-9);
  ok("kolom van voet naar kop: de kop gaat naar rechts, dus w(kop) < 0 (lokaal +y = links)",
    kol.deflection[kol.deflection.length - 1] < 0, `w = ${fmt(kol.deflection[kol.deflection.length - 1])} mm`);

  // Schuine staaf onder 30°, van linksonder naar rechtsboven, verdeelde last.
  const schuin = (om) => ({
    ...LEEG,
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4330.127, z: 2500 }],
    beams: [staaf(1, 1, 2, om, { material: "S235", profile: "IPE240" })],
    supports: [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "xRoller" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -6 }],
  });
  vergelijk("schuine staaf 30°", schuin);

  // De grens zelf.
  const knopen = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }];
  const omgekeerdeStaaf = {
    id: 9, from: 2, to: 1, material: "C30/37", profile: "300x500",
    releases: { startRy: true }, veren: { endTz: 12 },
    checkConfig: {
      lateralRestraints: [0.2], lateralRestraintsBottom: [0.1, 0.5], preCamber_mm: 8,
      betonZones: { longitudinal: [], stirrups: [
        { x_start_mm: 0, x_end_mm: 1000, spacing_mm: 100, legs: 2, diameter_mm: 8 },
        { x_start_mm: 1000, x_end_mm: 5000, spacing_mm: 250, legs: 2, diameter_mm: 8 },
      ] },
    },
  };
  const ref = R.staafInReferentierichting(omgekeerdeStaaf, knopen);
  ok("begin- en eindknoop verwisseld", ref.from === 1 && ref.to === 2);
  ok("scharnier en veer van begin naar eind (en andersom)",
    ref.releases.endRy === true && ref.releases.startRy === undefined && ref.veren.startTz === 12);
  ok("kipsteunfracties f → 1 − f", JSON.stringify(ref.checkConfig.lateralRestraints) === "[0.8]" &&
    JSON.stringify(ref.checkConfig.lateralRestraintsBottom) === "[0.9,0.5]");
  ok("beugelzones [a, b] → [L − b, L − a], oplopend",
    JSON.stringify(ref.checkConfig.betonZones.stirrups.map((z) => [z.x_start_mm, z.x_end_mm, z.spacing_mm])) ===
      "[[0,4000,250],[4000,5000,100]]");
  ok("zeeg is een grootte, geen positie: ongewijzigd", ref.checkConfig.preCamber_mm === 8);
  ok("tweemaal spiegelen geeft de zones terug",
    JSON.stringify(R.spiegelZones(R.spiegelZones(omgekeerdeStaaf.checkConfig.betonZones, 5000), 5000)) ===
      JSON.stringify(omgekeerdeStaaf.checkConfig.betonZones));
  ok("een staaf in de referentierichting komt als hetzelfde object terug",
    R.staafInReferentierichting(ref, knopen) === ref);
  const data = { nodes: kolom(true).nodes, beams: kolom(true).beams, combinationResults: reken(kolom(true)).combinationResults };
  const eenmaal = R.toetsdataInReferentierichting(data);
  ok("de grens is idempotent: op zijn eigen uitkomst verandert er niets", R.toetsdataInReferentierichting(eenmaal) === eenmaal);
  ok("staafstand van een kolom is Staand, van een ligger Liggend",
    R.referentieVanStaaf(kolom(false).beams[0], kolom(false).nodes).staafstand === "Staand" &&
    R.referentieVanStaaf(ligger(true).beams[0], ligger(true).nodes).staafstand === "Liggend");
  // Een staaf onder 74,9° is liggend, onder 75° staand — dezelfde grens als het staaftype.
  const hoek = (graden) => [{ id: 1, x: 0, z: 0 }, { id: 2, x: -1000 * Math.cos((graden * Math.PI) / 180), z: 1000 * Math.sin((graden * Math.PI) / 180) }];
  ok("74,9° van rechtsonder naar linksboven: liggend, en tegen links→rechts in dus gespiegeld",
    JSON.stringify(R.referentieVanStaaf({ id: 1, from: 1, to: 2 }, hoek(74.9))) === '{"gespiegeld":true,"staafstand":"Liggend"}');
  ok("75,1° idem: staand, van voet naar kop getekend dus niet gespiegeld",
    JSON.stringify(R.referentieVanStaaf({ id: 1, from: 1, to: 2 }, hoek(75.1))) === '{"gespiegeld":false,"staafstand":"Staand"}');

  // De segmentkrachten van de fysisch niet-lineaire lus: het moment in de
  // referentierichting, want de korf noemt boven en onder in die richting.
  const ef = { segmenten: [{ xStart: 0, xEnd: 5000, I: 1, segmentIndex: 0, N_start: 0, N_end: 0, M_start: 0, M_end: 0, M_max: -4e7, N_bij_M_max: -1e3 }] };
  const [heen] = krachtenPerSegment(ef, [{ x0: 0, x1: 5000 }], 1);
  const [terug] = krachtenPerSegment(ef, [{ x0: 0, x1: 5000 }], 1, -1);
  ok("segmentkrachten: momentTeken −1 keert alleen het moment om",
    heen.m_ed_knm === -40 && terug.m_ed_knm === 40 && terug.n_ed_kn === heen.n_ed_kn);
}

// ═════════════════════════════════════════════════════════════════════════
// Handberekening van M_Rd met de rechthoekige spanningsverdeling, NEN-EN
// 1992-1-1 3.1.7(3): λ = 0,8 (3.19) en η = 1,0 (3.21) bij f_ck ≤ 50 MPa;
// ε_cu3 = 3,5 ‰ (tabel 3.1); f_cd = α_cc·f_ck/γ_C met α_cc = 1,0 (NB bij
// 3.1.6(1)P) en γ_C = 1,5; f_yd = f_yk/γ_S met γ_S = 1,15 (tabel 2.1N);
// E_s = 200 GPa (3.2.7(4)); staal bilineair met horizontale tak (3.2.7(2)b).
// `lagen` = [{ A (mm²), d (mm vanaf de GEDRUKTE rand) }], N_Ed = 0.
function mRdHand({ b, h, fck, fyk, lagen }) {
  const fcd = (1.0 * fck) / 1.5, fyd = fyk / 1.15, Es = 200000, eps = 3.5e-3, lam = 0.8, eta = 1.0;
  const krachten = (x) => lagen.map((l) => l.A * Math.max(-fyd, Math.min(fyd, (Es * eps * (x - l.d)) / x)));
  const som = (x) => lam * x * eta * fcd * b + krachten(x).reduce((s, v) => s + v, 0);
  let lo = 1e-6, hi = h;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (som(m) > 0) hi = m; else lo = m; }
  const x = (lo + hi) / 2;
  // Moment om de gedrukte rand; bij ΣF = 0 is het om elk punt hetzelfde.
  const Fc = lam * x * eta * fcd * b;
  const M = Fc * (lam * x) / 2 + krachten(x).reduce((s, F, i) => s + F * lagen[i].d, 0);
  return { x, mRdKnm: Math.abs(M) / 1e6 };
}

log("\n[b] Beton: dezelfde ligger en dezelfde uitkraging in beide richtingen");
if (!heeftBrug) slaOver("[b]");
else {
  // 300×500 C30/37, korf boven 2Ø12 en onder 4Ø20, dekking 35, beugel Ø8.
  const korf = {
    cover_mm: 35, stirrup_diameter_mm: 8, stirrup_spacing_mm: 150, stirrup_legs: 2,
    top: { count: 2, diameter_mm: 12 }, bottom: { count: 4, diameter_mm: 20 },
  };
  const A = (n, d) => (n * Math.PI * d * d) / 4;
  const dOnder = 500 - 35 - 8 - 10; // 447
  const dBoven = 35 + 8 + 6;        // 49 vanaf de bovenrand

  const gevallen = [
    {
      naam: "vrij opgelegd 6 m",
      L: 6000, systeem: "SimplySupported",
      steunen: [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "zRoller" }],
      // M_Ed = γ_Q·q·L²/8 = 1,5·20·6²/8 = +135 kNm in het veld (trek onder).
      // Een beugelzonegrens op 1500 mm is een rekenknoop, dus het station het
      // dichtst bij het midden kan naast 3000 mm liggen: hand M(x) = 1,5·20·x(L−x)/2.
      mEd: 135, mBij: (x) => (1.5 * 20 * (x / 1000) * ((6000 - x) / 1000)) / 2, xMaatgevend: 3000, xSpeling: 300,
      trekwapening: "onderwapening",
      hand: mRdHand({ b: 300, h: 500, fck: 30, fyk: 500, lagen: [{ A: A(2, 12), d: dBoven }, { A: A(4, 20), d: dOnder }] }),
      // Beugels dichter bij de LINKER oplegging — asymmetrisch, dus een zone
      // die niet wordt gespiegeld komt aan de verkeerde kant.
      zones: (om) => ({ longitudinal: [], stirrups: om
        ? [{ x_start_mm: 0, x_end_mm: 4500, spacing_mm: 250, legs: 2, diameter_mm: 8 }, { x_start_mm: 4500, x_end_mm: 6000, spacing_mm: 100, legs: 2, diameter_mm: 8 }]
        : [{ x_start_mm: 0, x_end_mm: 1500, spacing_mm: 100, legs: 2, diameter_mm: 8 }, { x_start_mm: 1500, x_end_mm: 6000, spacing_mm: 250, legs: 2, diameter_mm: 8 }] }),
    },
    {
      naam: "uitkraging 3 m, links ingeklemd",
      L: 3000, systeem: "Cantilever",
      steunen: [{ id: 1, nodeId: 1, type: "fixed" }],
      // M_Ed = γ_Q·q·L²/2 = 1,5·20·3²/2 = −135 kNm aan de inklemming (trek boven).
      mEd: -135, mBij: (x) => (-1.5 * 20 * ((3000 - x) / 1000) ** 2) / 2, xMaatgevend: 0, xSpeling: 0,
      trekwapening: "bovenwapening",
      hand: mRdHand({ b: 300, h: 500, fck: 30, fyk: 500, lagen: [{ A: A(4, 20), d: 35 + 8 + 10 }, { A: A(2, 12), d: 500 - dBoven }] }),
      zones: () => undefined,
    },
  ];

  for (const g of gevallen) {
    const uit = {};
    for (const om of [false, true]) {
      const model = {
        ...LEEG,
        nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: g.L, z: 0 }],
        beams: [staaf(1, 1, 2, om, {
          material: "C30/37", profile: "300x500",
          ...(g.zones(om) ? { checkConfig: { betonZones: g.zones(om) } } : {}),
        })],
        supports: g.steunen,
        loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -20 }],
      };
      const r = reken(model);
      const data = { nodes: model.nodes, beams: model.beams, combinations: r.combinations, combinationResults: r.combinationResults,
        korven: new Map([[1, { korf, constructievorm: g.systeem, milieuklasse: "XC1" }]]) };
      const bouw = buildBetonCheckInputs(data);
      const inp = bouw.inputs[0];
      const res = kern("check_concrete_beams", [inp])[0];
      const verzoek = bouwDekkingslijnVerzoeken(data).verzoeken[0];
      const lijn = kern("concrete_dekkingslijn", verzoek);
      uit[om ? "terug" : "heen"] = { inp, res, lijn };
    }
    const { heen, terug } = uit;
    log(`  — ${g.naam}`);
    gelijkeOmhullende(`${g.naam}: dezelfde omhullende in beide richtingen`, heen.inp, terug.inp);
    ok(`${g.naam}: dezelfde zones in de toetsinvoer`,
      JSON.stringify(heen.inp.reinforcement_zones) === JSON.stringify(terug.inp.reinforcement_zones));
    for (const [richting, u] of [["links→rechts", heen], ["rechts→links", terug]]) {
      const gov = u.inp.forces_envelope.reduce((a, p) => (Math.abs(p.forces.my_ed) > Math.abs(a.forces.my_ed) ? p : a));
      dicht(`${g.naam}, ${richting}: maatgevend M_Ed = M_hand(x = ${gov.position_mm.toFixed(0)} mm)`, gov.forces.my_ed, g.mBij(gov.position_mm), 1e-6);
      ok(`${g.naam}, ${richting}: maatgevend op x = ${g.xMaatgevend} mm vanaf links (± één stationsafstand)`,
        Math.abs(gov.position_mm - g.xMaatgevend) <= g.xSpeling + 1e-6, `x = ${gov.position_mm.toFixed(3)} mm`);
      dicht(`${g.naam}, ${richting}: en dat is binnen 0,1 % de ${g.mEd} kNm van het midden/de inklemming`, gov.forces.my_ed, g.mEd, 1e-3);
      const blok = toetsVan(u.res, "6.1_bending_stress_block");
      ok(`${g.naam}, ${richting}: de getoetste trekwapening is de ${g.trekwapening}`,
        JSON.stringify(blok).includes(`De trekwapening is hier de ${g.trekwapening}`));
      dicht(`${g.naam}, ${richting}: UC 6.1 = |M_Ed| / M_Rd,hand, M_Rd,hand = ${g.hand.mRdKnm.toFixed(1)} kNm`,
        ucVan(blok), Math.abs(gov.forces.my_ed) / g.hand.mRdKnm, 2e-3);
      ok(`${g.naam}, ${richting}: geen zijdenkanttekening bij een liggende staaf`,
        !notitiesVan(blok).some((n) => n.startsWith("Zijden in wereldtermen")));
    }
    dicht(`${g.naam}: uc_max gelijk`, terug.res.uc_max, heen.res.uc_max, 1e-9);
    ok(`${g.naam}: dezelfde maatgevende toets (${heen.res.governing_check_id})`, terug.res.governing_check_id === heen.res.governing_check_id);
    for (const c of heen.res.checks) {
      const t = toetsVan(terug.res, c.id);
      const a = ucVan(c), b = ucVan(t);
      if (a === null && b === null) continue;
      dicht(`${g.naam}: ${c.id} gelijk`, b, a, 1e-9, 1e-9);
    }
    // Het betonvenster: dezelfde lijn, dezelfde maatgevende plaats vanaf links.
    dicht(`${g.naam}: dekkingslijn — momentdekking UC gelijk`, terug.lijn.uc_moment_max ?? -1, heen.lijn.uc_moment_max ?? -1, 1e-9);
    dicht(`${g.naam}: dekkingslijn — dwarskrachtdekking UC gelijk`, terug.lijn.uc_dwarskracht_max ?? -1, heen.lijn.uc_dwarskracht_max ?? -1, 1e-9);
    const plek = (l) => { const i = l.dwarskracht.maatgevend; return i === null || i === undefined ? -1 : l.dwarskracht.punten[i].x_mm; };
    dicht(`${g.naam}: dekkingslijn — maatgevende dwarskrachtplaats gelijk`, plek(terug.lijn), plek(heen.lijn), 0, 1e-6);
  }
  // De meting van de audit als tegenproef: de omgekeerde uitkraging was 0,662.
  log("  (auditmeting vóór de reparatie: uitkraging rechts→links UC 0,662 — nu gelijk aan links→rechts)");
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[c] Kip: welke steunen aan de gedrukte flens zitten, in beide richtingen");
if (!heeftBrug) slaOver("[c]");
else {
  const profileDb = new Map();
  for (const pr of kern("list_steel_profiles")) {
    const k = profileLookupKey(pr.name);
    if (!profileDb.has(k)) profileDb.set(k, pr);
  }
  const kip = (res) => {
    const c = toetsVan(res, "6.3.2_ltb").kind.data;
    const vars = (c.deelstappen ?? []).flatMap((d) => d.variables ?? []);
    const waarde = (re) => vars.find((v) => re.test(v.symbol))?.value;
    return { uc: c.uc.uc, lSt: waarde(/^L_\{st\}$/), n: waarde(/n_\{kipsteunen\}/), notes: c.notes };
  };
  function ipe330(naam, { om, q, steunen, boven, onder, verwacht }) {
    const model = {
      ...LEEG,
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 9000, z: 0 }],
      beams: [staaf(1, 1, 2, om, { material: "S235", profile: "IPE330",
        checkConfig: { lateralRestraints: boven.map((v) => f(v, om)), lateralRestraintsBottom: onder.map((v) => f(v, om)) } })],
      supports: steunen,
      loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q }],
    };
    const r = reken(model);
    const inp = buildSteelCheckInputs({ nodes: model.nodes, beams: model.beams, supports: model.supports,
      combinations: r.combinations, combinationResults: r.combinationResults, profileDb }).inputs[0];
    const res = kern("check_steel_beams", [inp])[0];
    return { inp, res, k: kip(res) };
  }
  const vrij = [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "zRoller" }];
  const ingeklemd = [{ id: 1, nodeId: 1, type: "fixed" }, { id: 2, nodeId: 2, type: "zRoller" }];
  const gevallen = [
    // M_Ed = 1,5·6·9²/8 = 91,125 kNm. Omlaag: sagging, bovenflens gedrukt, de
    // drie bovenflenssteunen tellen: vier velden van 2250 mm.
    { naam: "last omlaag, steunen boven ¼ ½ ¾", q: -6, steunen: vrij, boven: [0.25, 0.5, 0.75], onder: [], n: 3, lSt: 2250, mEd: 91.125 },
    // Zuiging: hogging, ONDERflens gedrukt, geen enkele steun telt: 9000 mm.
    { naam: "zuiging, steunen boven ¼ ½ ¾", q: 6, steunen: vrij, boven: [0.25, 0.5, 0.75], onder: [], n: 0, lSt: 9000, mEd: -91.125 },
    // Links ingeklemd, rechts een rol, q omlaag: M(x) = q(−L²/8 + 5Lx/8 − x²/2),
    // nul bij x = L/4 = 2250 mm. Op 0,1·L (900 mm) is M < 0 (onderflens
    // gedrukt: de onderflenssteun telt), op 0,2·L (1800 mm) ook (de
    // bovenflenssteun telt NIET). Eén steun, velden 900 en 8100: L_st = 8100.
    { naam: "ingeklemd links, boven 0,2 en onder 0,1", q: -6, steunen: ingeklemd, boven: [0.2], onder: [0.1], n: 1, lSt: 8100, mEd: -91.125 },
  ];
  for (const g of gevallen) {
    const heen = ipe330(g.naam, { om: false, ...g });
    const terug = ipe330(g.naam, { om: true, ...g });
    log(`  — ${g.naam}`);
    gelijkeOmhullende(`${g.naam}: dezelfde omhullende`, heen.inp, terug.inp);
    ok(`${g.naam}: dezelfde kipsteunen naar de kern`, zelfdeSteunen(heen.inp, terug.inp),
      `${JSON.stringify(heen.inp.lateral_bracing)} en ${JSON.stringify(terug.inp.lateral_bracing)}`);
    const gov = heen.inp.forces_envelope.reduce((a, p) => (Math.abs(p.forces.my_ed) > Math.abs(a.forces.my_ed) ? p : a));
    dicht(`${g.naam}: maatgevend M_Ed = ${g.mEd} kNm (hand)`, gov.forces.my_ed, g.mEd, 1e-6);
    for (const [richting, u] of [["links→rechts", heen], ["rechts→links", terug]]) {
      ok(`${g.naam}, ${richting}: ${g.n} steun(en) aan de gedrukte flens`, u.k.n === g.n, `n = ${u.k.n}`);
      dicht(`${g.naam}, ${richting}: L_st = ${g.lSt} mm`, u.k.lSt, g.lSt, 1e-9);
    }
    dicht(`${g.naam}: kip-UC gelijk`, terug.k.uc, heen.k.uc, 1e-9);
    dicht(`${g.naam}: uc_max gelijk`, terug.res.uc_max, heen.res.uc_max, 1e-9);
  }
  log("  (auditmeting vóór de reparatie: zuiging rechts→links telde 3 steunen, UC 0,547 — nu 0 steunen, gelijk aan links→rechts)");
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[d] Doorbuiging en zeeg: in beide richtingen, omlaag en omhoog");
{
  const I = resolveSection("S235", "HEA160").I; // mm⁴, waarmee de solver rekent
  const E = 210000;
  // Karakteristieke BGT-combinatie: q = 3 kN/m = 3 N/mm met factor 1,0.
  const wHand = (5 * 3 * 6000 ** 4) / (384 * E * I);
  const bouw = (om, q, zeeg) => ({
    ...LEEG,
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [staaf(1, 1, 2, om, { material: "S235", profile: "HEA160", ...(zeeg === undefined ? {} : { checkConfig: { preCamber_mm: zeeg } }) })],
    supports: [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "zRoller" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q }],
  });
  const profileDb = new Map([[profileLookupKey("HEA160"), { geometry: { h: 152 } }]]);
  const invoer = (om, q, zeeg) => {
    const m = bouw(om, q, zeeg);
    const r = reken(m);
    return buildSteelCheckInputs({ nodes: m.nodes, beams: m.beams, supports: m.supports,
      combinations: r.combinations, combinationResults: r.combinationResults, profileDb }).inputs[0];
  };
  for (const om of [false, true]) {
    const richting = om ? "rechts→links" : "links→rechts";
    dicht(`${richting}: zakking omlaag = −5qL⁴/(384EI) = −${wHand.toFixed(3)} mm`, invoer(om, -3).deflection_actual_max_mm, -wHand, 1e-6);
    dicht(`${richting}: zakking omhoog (zuiging) = +${wHand.toFixed(3)} mm`, invoer(om, 3).deflection_actual_max_mm, wHand, 1e-6);
    ok(`${richting}: de zeeg gaat onveranderd als grootte omhoog naar de kern`, invoer(om, -3, 10).pre_camber_mm === 10);
  }
  if (!heeftBrug) slaOver("[d] (kern)");
  else {
    const wFin = (om, q, zeeg) => {
      const res = kern("check_steel_beams", [invoer(om, q, zeeg)])[0];
      const fin = toetsVan(res, "deflection_w_fin").kind.data;
      const add = toetsVan(res, "deflection_w_add").kind.data;
      return { w: fin.variables.find((v) => v.symbol === "w").value, uc: fin.uc.uc, addUc: add.uc.uc };
    };
    for (const om of [false, true]) {
      const richting = om ? "rechts→links" : "links→rechts";
      const omlaag = wFin(om, -3, 10);
      // w_fin = w_z + w_zeeg = −14,4 + 10: kleiner in grootte.
      dicht(`${richting}, zakking omlaag, zeeg 10 omhoog: w_fin = −w + 10`, omlaag.w, -wHand + 10, 1e-6);
      ok(`${richting}, zakking omlaag, zeeg omhoog: |w_fin| < |w_z|`, Math.abs(omlaag.w) < wHand);
      dicht(`${richting}: w_add zonder zeeg (A1.4.3(3): w_2 + w_3)`, omlaag.addUc, wFin(om, -3).addUc, 1e-12);
      // Opwaarts: dezelfde zeeg omhoog vergroot de uitslag, +14,4 + 10. Een zeeg
      // OMLAAG (−10) is dan wat de uitslag verkleint.
      const omhoog = wFin(om, 3, 10);
      dicht(`${richting}, zakking omhoog, zeeg 10 omhoog: w_fin = +w + 10 (de ligger stond al hoger)`, omhoog.w, wHand + 10, 1e-6);
      const tegen = wFin(om, 3, -10);
      ok(`${richting}, zakking omhoog, zeeg 10 omlaag: |w_fin| < |w_z|`, Math.abs(tegen.w) < wHand, `w_fin = ${fmt(tegen.w)} mm`);
    }
    dicht("zeeg: UC gelijk in beide richtingen", wFin(true, -3, 10).uc, wFin(false, -3, 10).uc, 1e-9);
  }
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[e] Kolom: van voet naar kop en van kop naar voet, horizontale last aan de kop");
if (!heeftBrug) slaOver("[e]");
else {
  const kolom = (om, material, profile, checkConfig) => ({
    ...LEEG,
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [staaf(1, 1, 2, om, { material, profile, ...(checkConfig ? { checkConfig } : {}) })],
    supports: [{ id: 1, nodeId: 1, type: "fixed" }],
    loads: [{ id: 1, type: "pointForce", caseId: 2, nodeId: 2, fx: 10, fz: 0 }],
  });

  // ── Beton ───────────────────────────────────────────────────────────────
  const korf = {
    cover_mm: 35, stirrup_diameter_mm: 8, stirrup_spacing_mm: 150, stirrup_legs: 2,
    top: { count: 2, diameter_mm: 12 }, bottom: { count: 4, diameter_mm: 20 },
  };
  const beton = {};
  for (const om of [false, true]) {
    const m = kolom(om, "C30/37", "300x500");
    const r = reken(m);
    const inp = buildBetonCheckInputs({ nodes: m.nodes, beams: m.beams, combinations: r.combinations, combinationResults: r.combinationResults,
      korven: new Map([[1, { korf, milieuklasse: "XC1" }]]) }).inputs[0];
    beton[om ? "terug" : "heen"] = { inp, res: kern("check_concrete_beams", [inp])[0] };
  }
  gelijkeOmhullende("beton: dezelfde omhullende", beton.heen.inp, beton.terug.inp);
  for (const [richting, u] of [["voet→kop", beton.heen], ["kop→voet", beton.terug]]) {
    // Van voet naar kop: M_voet = −γ_Q·H·h = −1,5·10·3 = −45 kNm op x = 0 (de
    // voet). Negatief = trek aan de lokale bovenzijde = LINKS: de wind van
    // links trekt de voet aan de linkerkant. Links ligt de bovenwapening.
    const voet = u.inp.forces_envelope.filter((p) => p.position_mm === 0)
      .reduce((a, p) => (Math.abs(p.forces.my_ed) > Math.abs(a.forces.my_ed) ? p : a));
    dicht(`beton, ${richting}: M_Ed aan de voet (x = 0) = −1,5·10·3 = −45 kNm`, voet.forces.my_ed, -45, 1e-6);
    ok(`beton, ${richting}: staafstand Staand in de toetsinvoer`, u.inp.staafstand === "Staand");
    const blok = toetsVan(u.res, "6.1_bending_stress_block");
    ok(`beton, ${richting}: de trekwapening is de bovenwapening`, JSON.stringify(blok).includes("De trekwapening is hier de bovenwapening"));
    const zijden = notitiesVan(blok).find((n) => n.startsWith("Zijden in wereldtermen"));
    ok(`beton, ${richting}: de afleiding zegt dat boven LINKS is en onder RECHTS`,
      !!zijden && zijden.includes("RECHTERzijde") && zijden.includes("LINKERzijde"));
  }
  dicht("beton: UC 6.1 gelijk", ucVan(toetsVan(beton.terug.res, "6.1_bending_stress_block")), ucVan(toetsVan(beton.heen.res, "6.1_bending_stress_block")), 1e-9);
  dicht("beton: uc_max gelijk", beton.terug.res.uc_max, beton.heen.res.uc_max, 1e-9);

  // ── Staal ───────────────────────────────────────────────────────────────
  const profileDb = new Map();
  for (const pr of kern("list_steel_profiles")) {
    const k = profileLookupKey(pr.name);
    if (!profileDb.has(k)) profileDb.set(k, pr);
  }
  const staal = {};
  for (const om of [false, true]) {
    // Een steun aan de ONDERflens (= rechts) op 0,3·h vanaf de voet, en een
    // zeeg die bij een staande staaf niet mag meetellen.
    const m = kolom(om, "S235", "HEA160", { lateralRestraintsBottom: [f(0.3, om)], lateralRestraints: [f(0.6, om)], preCamber_mm: 10 });
    const r = reken(m);
    const inp = buildSteelCheckInputs({ nodes: m.nodes, beams: m.beams, supports: m.supports,
      combinations: r.combinations, combinationResults: r.combinationResults, profileDb }).inputs[0];
    staal[om ? "terug" : "heen"] = { inp, res: kern("check_steel_beams", [inp])[0] };
  }
  gelijkeOmhullende("staal: dezelfde omhullende", staal.heen.inp, staal.terug.inp);
  ok("staal: dezelfde kipsteunen naar de kern", zelfdeSteunen(staal.heen.inp, staal.terug.inp),
    `${JSON.stringify(staal.heen.inp.lateral_bracing)} en ${JSON.stringify(staal.terug.inp.lateral_bracing)}`);
  for (const [richting, u] of [["voet→kop", staal.heen], ["kop→voet", staal.terug]]) {
    const c = toetsVan(u.res, "6.3.2_ltb").kind.data;
    const vars = (c.deelstappen ?? []).flatMap((d) => d.variables ?? []);
    // Over de hele hoogte M ≤ 0 (van −45 aan de voet tot 0 aan de kop): overal
    // is de ONDERflens (rechts) gedrukt. De onderflenssteun op 900 mm telt, de
    // bovenflenssteun op 1800 mm niet: velden 900 en 2100, L_st = 2100 mm.
    ok(`staal, ${richting}: één steun aan de gedrukte flens`, vars.find((v) => /n_\{kipsteunen\}/.test(v.symbol))?.value === 1);
    dicht(`staal, ${richting}: L_st = 2100 mm`, vars.find((v) => v.symbol === "L_{st}")?.value, 2100, 1e-9);
    const zijden = (c.notes ?? []).find((n) => n.startsWith("Flenzen in wereldtermen"));
    ok(`staal, ${richting}: de afleiding zegt dat de bovenflens LINKS en de onderflens RECHTS is`,
      !!zijden && zijden.includes("LINKERflens") && zijden.includes("RECHTERflens"));
    ok(`staal, ${richting}: geen zeeg bij een staande staaf, met een kanttekening`,
      u.inp.pre_camber_mm === 0 && u.inp.deflection_notes.some((n) => n.includes("zeeg van 10 mm is NIET verrekend")));
  }
  dicht("staal: kip-UC gelijk", ucVan(toetsVan(staal.terug.res, "6.3.2_ltb")), ucVan(toetsVan(staal.heen.res, "6.3.2_ltb")), 1e-9);
  dicht("staal: uc_max gelijk", staal.terug.res.uc_max, staal.heen.res.uc_max, 1e-9);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[f] De sprong bij 75°: een naar links hellende staaf dicht bij de grens krijgt een waarschuwing");
{
  // Zie DE SPRONG BIJ 75° in lib/referentierichting.ts. De randen van de band
  // worden uit de constante afgeleid; dat de band 10° is, staat hier apart, zodat
  // een andere band een bewuste wijziging is.
  const BAND = R.SPRONGBAND_GRADEN;
  ok("de band is 10° aan weerszijden van 75°", BAND === 10, `${BAND}°`);
  const WAARSCHUWING = "Richtingssprong nabij";
  const rad = (g) => (g * Math.PI) / 180;
  /** Voet in de oorsprong, kop op lengte L onder `graden`, naar links (−1) of rechts (+1). */
  const knopen = (graden, helling, L = 9000) => [
    { id: 1, x: 0, z: 0 },
    { id: 2, x: helling * L * Math.cos(rad(graden)), z: L * Math.sin(rad(graden)) },
  ];
  /** De wereldrichting van lokaal +y in de referentierichting: waar "boven" fysiek ligt. */
  const bovenNormaal = (beam, nodes) => {
    const ref = R.staafInReferentierichting(beam, nodes);
    const a = nodes.find((n) => n.id === ref.from), b = nodes.find((n) => n.id === ref.to);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    return { nx: -(b.z - a.z) / L, nz: (b.x - a.x) / L };
  };

  // [helling, −1 naar links / +1 naar rechts, waarschuwing verwacht]
  const gevallen = [
    [75 - BAND - 0.1, -1, false],
    [75 - BAND + 0.1, -1, true],
    [74.9, -1, true],
    [75.1, -1, true],
    [75 + BAND - 0.1, -1, true],
    [75 + BAND + 0.1, -1, false],
    // Een staaf die naar rechts helt springt niet: van links naar rechts en van
    // voet naar kop is daar dezelfde richting.
    [74.9, 1, false],
    [75.1, 1, false],
    [90, 1, false],
  ];
  for (const [g, h, verwacht] of gevallen) {
    for (const om of [false, true]) {
      const nodes = knopen(g, h);
      const beam = staaf(1, 1, 2, om);
      const wat = `${g.toFixed(1)}° naar ${h < 0 ? "links" : "rechts"}, ${om ? "kop→voet" : "voet→kop"} getekend`;
      ok(`${wat}: ${verwacht ? "waarschuwing" : "geen waarschuwing"}`, (R.richtingssprongNabij(beam, nodes) !== null) === verwacht);
      const staal = R.richtingssprongNotities(beam, nodes, "staal");
      const beton = R.richtingssprongNotities(beam, nodes, "beton");
      ok(`${wat}: ${verwacht ? "één kanttekening" : "geen kanttekening"} voor staal en beton`,
        staal.length === (verwacht ? 1 : 0) && beton.length === (verwacht ? 1 : 0));
      if (!verwacht) continue;
      // De tekst noemt de fysieke zijde die de MEETKUNDE aanwijst — niet een
      // zijde die bij de hoek is opgeschreven.
      const n = bovenNormaal(beam, nodes);
      const bovenvlak = n.nz > 0 && n.nx > 0;
      const ondervlak = n.nz < 0 && n.nx < 0;
      ok(`${wat}: lokaal +y wijst ${g < 75 ? "rechtsboven" : "linksonder"}`, g < 75 ? bovenvlak : ondervlak,
        `n = (${n.nx.toFixed(3)}, ${n.nz.toFixed(3)})`);
      const zin = bovenvlak
        ? "de BOVENflens is de fysieke BOVENzijde (rechtsboven)"
        : "de BOVENflens ligt aan de linkerzijde: bij deze helling de fysieke ONDERzijde (linksonder), NIET het bovenvlak";
      ok(`${wat}: de kanttekening zegt dat, met de helling en de afstand tot de grens`,
        staal[0].startsWith(WAARSCHUWING) && staal[0].includes(zin) &&
          staal[0].includes(`onder ${R.gradenTekst(g)} met de horizontaal, ${R.gradenTekst(Math.abs(g - 75))}`) &&
          beton[0].includes(zin.replace("BOVENflens", "BOVENwapening")),
        staal[0].slice(0, 200));
    }
  }

  if (!heeftBrug) slaOver("[f] (kern)");
  else {
    const profileDb = new Map();
    for (const pr of kern("list_steel_profiles")) {
      const k = profileLookupKey(pr.name);
      if (!profileDb.has(k)) profileDb.set(k, pr);
    }
    const scharnieren = [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "pinned" }];

    // ── Staal: de meting van de verificatie ────────────────────────────────
    // IPE 330 S235, 9 m, scharnierend, zuiging q = +6 kN/m (globaal omhoog),
    // kipsteunen aan de bovenflens op ¼, ½ en ¾.
    const staalToets = (g, h, om) => {
      const m = {
        ...LEEG, nodes: knopen(g, h), supports: scharnieren,
        beams: [staaf(1, 1, 2, om, { material: "S235", profile: "IPE330", checkConfig: { lateralRestraints: [0.25, 0.5, 0.75] } })],
        loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: 6 }],
      };
      const r = reken(m);
      const inp = buildSteelCheckInputs({ nodes: m.nodes, beams: m.beams, supports: m.supports,
        combinations: r.combinations, combinationResults: r.combinationResults, profileDb }).inputs[0];
      const c = toetsVan(kern("check_steel_beams", [inp])[0], "6.3.2_ltb").kind.data;
      const vars = (c.deelstappen ?? []).flatMap((d) => d.variables ?? []);
      return { inp, n: vars.find((v) => /n_\{kipsteunen\}/.test(v.symbol))?.value, notes: c.notes ?? [], uc: c.uc.uc };
    };
    // Hand. Lokaal +y staat onder 75° naar links rechtsboven (sin θ, cos θ);
    // de zuiging (0, +q) werkt dan naar +y, M < 0, en de ONDERflens is gedrukt:
    // geen enkele bovenflenssteun telt. Vanaf 75° staat +y linksonder
    // (−sin θ, −cos θ); dezelfde zuiging werkt naar −y, M > 0, de BOVENflens —
    // fysiek het ondervlak — is gedrukt: alle drie tellen. Naar rechts hellend
    // staat +y aan beide kanten van 75° linksboven (−sin θ, cos θ): M < 0, 0.
    for (const [g, h, n, waarschuwing] of [[74.9, -1, 0, true], [75.1, -1, 3, true], [74.9, 1, 0, false], [75.1, 1, 0, false]]) {
      const uit = [false, true].map((om) => staalToets(g, h, om));
      const wat = `staal ${g}° naar ${h < 0 ? "links" : "rechts"}`;
      uit.forEach((u, i) => {
        const richting = i ? "kop→voet" : "voet→kop";
        ok(`${wat}, ${richting}: ${n} steun(en) aan de gedrukte flens`, u.n === n, `n = ${u.n}`);
        if (waarschuwing) {
          const inv = u.inp.staafstand_notities ?? [];
          ok(`${wat}, ${richting}: de waarschuwing staat in de toetsinvoer en letterlijk in de afleiding van de kiptoets`,
            inv.length === 1 && inv[0].startsWith(WAARSCHUWING) && u.notes.filter((t) => t === inv[0]).length === 1);
        } else {
          ok(`${wat}, ${richting}: geen waarschuwing in invoer of afleiding`,
            u.inp.staafstand_notities === undefined && !u.notes.some((t) => t.startsWith(WAARSCHUWING)));
        }
      });
      dicht(`${wat}: kip-UC gelijk in beide tekenrichtingen`, uit[1].uc, uit[0].uc, 1e-9);
    }
    for (const g of [75 - BAND - 0.1, 75 + BAND + 0.1]) {
      const u = staalToets(g, -1, false);
      ok(`staal ${g.toFixed(1)}° naar links, buiten de band: geen waarschuwing in invoer of afleiding`,
        u.inp.staafstand_notities === undefined && !u.notes.some((t) => t.startsWith(WAARSCHUWING)));
    }

    // ── Beton: 300×500 C30/37, 6 m, scharnierend, q = −20 kN/m ─────────────
    const korf = {
      cover_mm: 35, stirrup_diameter_mm: 8, stirrup_spacing_mm: 150, stirrup_legs: 2,
      top: { count: 2, diameter_mm: 12 }, bottom: { count: 4, diameter_mm: 20 },
    };
    const betonToets = (g, h, om) => {
      const m = {
        ...LEEG, nodes: knopen(g, h, 6000), supports: scharnieren,
        beams: [staaf(1, 1, 2, om, { material: "C30/37", profile: "300x500" })],
        loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -20 }],
      };
      const r = reken(m);
      const inp = buildBetonCheckInputs({ nodes: m.nodes, beams: m.beams, combinations: r.combinations,
        combinationResults: r.combinationResults, korven: new Map([[1, { korf, milieuklasse: "XC1" }]]) }).inputs[0];
      return { inp, blok: toetsVan(kern("check_concrete_beams", [inp])[0], "6.1_bending_stress_block") };
    };
    // Hand. De last (0, −q) werkt onder 75° naar links naar −y: M > 0, trek aan
    // de onderwapening 4Ø20. Vanaf 75° werkt hij naar +y: M < 0, trek aan de
    // bovenwapening 2Ø12 — die bij deze helling fysiek onder ligt.
    for (const [g, trek] of [[74.9, "onderwapening"], [75.1, "bovenwapening"]]) {
      for (const om of [false, true]) {
        const { inp, blok } = betonToets(g, -1, om);
        const wat = `beton ${g}° naar links, ${om ? "kop→voet" : "voet→kop"}`;
        ok(`${wat}: de trekwapening is de ${trek}`, JSON.stringify(blok).includes(`De trekwapening is hier de ${trek}`));
        const inv = inp.staafstand_notities ?? [];
        ok(`${wat}: de waarschuwing noemt de bovenwapening en staat letterlijk bij 6.1`,
          inv.length === 1 && inv[0].startsWith(WAARSCHUWING) && inv[0].includes("BOVENwapening") &&
            notitiesVan(blok).filter((t) => t === inv[0]).length === 1);
      }
    }
    {
      const { inp, blok } = betonToets(75 + BAND + 0.1, -1, false);
      ok("beton 85,1° naar links, buiten de band: geen waarschuwing",
        inp.staafstand_notities === undefined && !notitiesVan(blok).some((t) => t.startsWith(WAARSCHUWING)));
    }
    log("  (verificatiemeting: zuiging 74,9° 0 steunen, 75,1° 3 steunen — ongewijzigd, maar nu met de waarschuwing erbij)");
  }
}

log(`\n${failed === 0 ? "ALLES GOED" : "MISLUKT"} — ${passed} geslaagd, ${failed} mislukt${overgeslagen ? `, ${overgeslagen} blok(ken) overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
