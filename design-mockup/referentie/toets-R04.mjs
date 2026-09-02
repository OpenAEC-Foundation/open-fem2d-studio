/**
 * toets-R04.mjs — referentiegeval R04 uit het werkdossier
 * (docs/superpowers/plans/2026-09-02-referentieberekeningen.md, §3).
 *
 * GEVAL. Tweescharnier zadeldakportaal 20 × 8/12 m, alle vier de lasten
 * gelijktijdig, met de verticale lijnlast op de HORIZONTALE PROJECTIE van het
 * linker spantbeen. Bron: Franse validatiebundel (AFNOR/SFM 1990), geval
 * SSLL14.
 *
 * Dit script:
 *   1. bouwt het model op, schrijft het als R04.femp (serializeProject);
 *   2. rekent het door met de solver van de app (engine.ts);
 *   3. legt elke referentiewaarde uit het dossier naast onze uitkomst, met de
 *      afwijking in procenten;
 *   4. draait een aantal onafhankelijke controles: globaal evenwicht, de
 *      hand-afleiding van A_y, de door het dossier genoemde fout-variant
 *      (lijnlast op staaflengte → 33 233 N) en de variant zonder
 *      normaalkrachtvervorming.
 *
 * Draaien vanuit design-mockup:  npx tsx referentie/toets-R04.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ─────────────────────────────────────────────────────────────────────────
// INVOER — letterlijk uit het dossier
//
// Knopen (m):  A (0; 0) · A1 (0; 8) · C (10; 12) · B1 (20; 8) · B (20; 0)
// Kolommen A–A1, B–B1 : L = 8 m,  I = 5,0·10⁻⁴ m⁴, A = 7,746·10⁻² m²
// Spantbenen A1–C, C–B1: L = 10,7703 m, I = 2,5·10⁻⁴ m⁴, A = 5,477·10⁻² m²
// E = 2,1·10¹¹ Pa;  A en B scharnierend; A1, B1 en C star.
//
// Eenheden aan de adapterkant: mm, N, N·mm, N/mm² en N/mm (lijnlast).
// ─────────────────────────────────────────────────────────────────────────
const E = 210000;                       // 2,1·10¹¹ Pa = 210 000 N/mm²
const KOLOM = { E, A: 7.746e-2 * 1e6, I: 5.0e-4 * 1e12 };   // 77 460 mm², 5,0·10⁸ mm⁴
const BEEN  = { E, A: 5.477e-2 * 1e6, I: 2.5e-4 * 1e12 };   // 54 770 mm², 2,5·10⁸ mm⁴

const L_BEEN_MM = Math.hypot(10000, 4000);   // 10 770,3296 mm — klopt met "10,7703 m"

// De lijnlast werkt per meter HORIZONTALE PROJECTIE (essentieel volgens het
// dossier). De adapter rekent een globale z-lijnlast per meter STAAFLENGTE af
// — zie types.ts ("q is ALTIJD in kN per meter STAAFLENGTE") en de eigen
// controle onderaan dit script. Omrekenen is exact met cos β = 10/10,7703:
//   q_staaf = q_projectie · projectielengte / staaflengte
// Totaal blijft daarmee exact 3 000 N/m × 10 m = 30 000 N.
const Q_PROJECTIE = -3;                                      // N/mm = kN/m
const Q_STAAF = Q_PROJECTIE * 10000 / L_BEEN_MM;             // −2,785430… N/mm

const NODES = [
  { id: 1, x: 0,     z: 0     },   // A  — scharnier
  { id: 2, x: 0,     z: 8000  },   // A1 — goot links
  { id: 3, x: 10000, z: 12000 },   // C  — nok
  { id: 4, x: 20000, z: 8000  },   // B1 — goot rechts
  { id: 5, x: 20000, z: 0     },   // B  — scharnier
];

const BEAMS = [
  { id: 1, from: 1, to: 2, ...KOLOM },  // kolom links
  { id: 2, from: 2, to: 3, ...BEEN  },  // spantbeen links (belast)
  { id: 3, from: 3, to: 4, ...BEEN  },  // spantbeen rechts
  { id: 4, from: 5, to: 4, ...KOLOM },  // kolom rechts
];

const SUPPORTS = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 5, type: "pinned" },
];

// Alle lasten gelijktijdig, geen partiële factoren.
//  · verticale puntlast in C          : −20 000 N   (zie tegenstrijdigheid hieronder)
//  · horizontale puntlast in A1       : −10 000 N
//  · moment in A1                     : −100 000 N·m = −1·10⁸ N·mm (rechtsom)
//  · verticale lijnlast op A1–C       : −3 000 N/m op de projectie
const DIST_LOADS  = [{ beamId: 2, q: Q_STAAF }];
const POINT_LOADS = [
  { nodeId: 3, fz: -20000 },
  { nodeId: 2, fx: -10000, my: -1e8 },
];

// ─────────────────────────────────────────────────────────────────────────
// MODEL OPSLAAN ALS R04.femp
//
// LET OP — de app kent geen vrije doorsnede-invoer: `Beam` draagt alleen een
// materiaal- en profielnaam, en lib/sectionResolver leidt E, A en I daaruit af
// (stalen profieldatabase, of een houten rechthoek b×h). De doorsneden van dit
// referentiegeval (massieve vierkanten van 278,3 resp. 234,0 mm) staan in geen
// profieldatabase. Ze zijn daarom opgeslagen als houten rechthoek met precies
// de VIERKANTE AFMETINGEN die de bron noemt: A en I komen dan exact goed, maar
// E wordt 11 000 N/mm² (C24) in plaats van 210 000 N/mm².
//
// Gevolg voor wie R04.femp in de app opent: omdat álle staven dezelfde E
// krijgen, zijn alle REACTIES en SNEDEKRACHTEN exact gelijk aan de waarden
// hieronder (een uniforme E valt weg uit de krachtsverdeling van een lineair
// elastisch systeem zonder veren, zettingen of temperatuurlasten). Alleen de
// VERPLAATSINGEN vallen een factor 210 000/11 000 = 19,0909 te groot uit.
// Het rekenwerk in dit script gebruikt de echte E, A en I.
// ─────────────────────────────────────────────────────────────────────────
const PROJECT_STATE = {
  nodes: NODES.map(({ id, x, z }) => ({ id, x, z })),
  beams: [
    { id: 1, from: 1, to: 2, material: "C24", profile: "278.3x278.3" },
    { id: 2, from: 2, to: 3, material: "C24", profile: "234x234" },
    { id: 3, from: 3, to: 4, material: "C24", profile: "234x234" },
    { id: 4, from: 5, to: 4, material: "C24", profile: "278.3x278.3" },
  ],
  supports: SUPPORTS.map((s) => ({ nodeId: s.nodeId, type: s.type })),
  plates: [],
  // UI-eenheden: kN, kNm, kN/m.
  loads: [
    { id: 1, type: "pointForce",  caseId: 1, nodeId: 3, fz: -20 },
    { id: 2, type: "pointForce",  caseId: 1, nodeId: 2, fx: -10 },
    { id: 3, type: "pointMoment", caseId: 1, nodeId: 2, my: -100 },
    { id: 4, type: "lineLoad",    caseId: 1, beamId: 2, q: Q_STAAF, qDir: "z", qCoord: "global" },
  ],
  loadCases: [{ id: 1, name: "R04 — alle lasten gelijktijdig", type: "other" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
};

// Twee keer wegschrijven: R04.femp zoals de campagne het benoemt, en
// R04.ifcfem2d omdat dat de extensie is die het bestandsdialoog van de app
// filtert (PROJECT_FILE_EXT in src/io/projectFile.ts). Zelfde inhoud.
const PROJECT_TEXT = serializeProject(PROJECT_STATE);
const FEMP = join(HIER, "R04.femp");
writeFileSync(FEMP, PROJECT_TEXT, "utf8");
writeFileSync(join(HIER, "R04.ifcfem2d"), PROJECT_TEXT, "utf8");
log(`Model opgeslagen: ${FEMP} (+ R04.ifcfem2d)`);

// ─────────────────────────────────────────────────────────────────────────
// DOORREKENEN
// ─────────────────────────────────────────────────────────────────────────
function rekenDoor({ kolom = KOLOM, been = BEEN, distLoads = DIST_LOADS } = {}) {
  return solve({
    nodes: NODES.map(({ id, x, z }) => ({ id, x, z })),
    beams: [
      { id: 1, from: 1, to: 2, ...kolom },
      { id: 2, from: 2, to: 3, ...been },
      { id: 3, from: 3, to: 4, ...been },
      { id: 4, from: 5, to: 4, ...kolom },
    ],
    supports: SUPPORTS,
    loads: distLoads,
    pointLoads: POINT_LOADS,
  });
}

const r = rekenDoor();

// ─────────────────────────────────────────────────────────────────────────
// VERGELIJKEN met de referentiewaarden uit het dossier
// ─────────────────────────────────────────────────────────────────────────
let ergsteAfwijking = 0;
let aantalBuitenTolerantie = 0;

/**
 * Eén referentiewaarde naast onze uitkomst. `tolPct` is de tolerantie uit
 * §1.5 van het dossier: 1 % voor een numerieke validatiebundel.
 */
function vergelijk(naam, onze, referentie, eenheid, tolPct = 1) {
  const afwPct = referentie === 0
    ? (onze === 0 ? 0 : Infinity)
    : (onze - referentie) / Math.abs(referentie) * 100;
  ergsteAfwijking = Math.max(ergsteAfwijking, Math.abs(afwPct));
  const binnen = Math.abs(afwPct) <= tolPct;
  if (!binnen) aantalBuitenTolerantie++;
  log(
    `  ${binnen ? "✓" : "✗"} ${naam.padEnd(30)} ` +
    `referentie ${String(referentie).padStart(12)} ${eenheid.padEnd(4)} | ` +
    `onze ${onze.toPrecision(9).padStart(14)} | Δ ${afwPct >= 0 ? "+" : ""}${afwPct.toFixed(4)} %`,
  );
}

log("\n═══ R04 — vergelijking met het dossier ═══");
const RA = r.reactions.get(1);
const wC = r.displacements.get(3).uz / 1000;   // mm → m

vergelijk("Oplegreactie A, X-richting", RA.fx, 20239.4, "N");
vergelijk("Oplegreactie A, Y-richting", RA.fz, 31500.0, "N");
vergelijk("Verticale zakking nok C",    wC,    -0.03072, "m");

// ─────────────────────────────────────────────────────────────────────────
// ONAFHANKELIJKE CONTROLES (geen bronwaarden — eigen afleidingen)
// ─────────────────────────────────────────────────────────────────────────
log("\n═══ Onafhankelijke controles ═══");
let controlesOk = 0, controlesFout = 0;
function controle(naam, waar, toelichting = "") {
  if (waar) { controlesOk++;  log(`  ✓ ${naam}${toelichting ? " — " + toelichting : ""}`); }
  else      { controlesFout++; log(`  ✗ ${naam}${toelichting ? " — " + toelichting : ""}`); }
}

// (1) Globaal evenwicht. Uitwendig: ΣFx = −10 000 N, ΣFz = −20 000 − 30 000 N.
{
  const RB = r.reactions.get(5);
  const sFx = RA.fx + RB.fx - 10000;
  const sFz = RA.fz + RB.fz - 50000;
  // ΣM om B (20 000; 0), N·mm, linksom positief.
  const sM =
    (0 - 20000) * RA.fz - (0 - 0) * RA.fx        // reactie A
    + (10000 - 20000) * (-20000)                 // puntlast in C
    - (8000 - 0) * (-10000)                      // horizontale puntlast in A1
    + (-1e8)                                     // moment in A1
    + (5000 - 20000) * (-30000);                 // resultante lijnlast, x_zw = 5 m
  controle("ΣFx = 0", Math.abs(sFx) < 1e-6 * 50000, `rest ${sFx.toExponential(2)} N`);
  controle("ΣFz = 0", Math.abs(sFz) < 1e-6 * 50000, `rest ${sFz.toExponential(2)} N`);
  controle("ΣM om B = 0", Math.abs(sM) < 1e-6 * 6.3e8, `rest ${sM.toExponential(2)} N·mm`);
  controle("geen inklemmingsmoment in A en B",
    Math.abs(RA.my) < 1e-6 && Math.abs(RB.my) < 1e-6);
}

// (2) A_y is statisch bepaald — handafleiding, onafhankelijk van stijfheid:
//     20·A_y = 200 000 + 80 000 − 100 000 + 450 000 (N·m) → A_y = 31 500 N.
{
  const handAy = (200000 + 80000 - 100000 + 450000) / 20;
  controle("A_y volgt uit handafleiding (31 500 N)",
    Math.abs(RA.fz - handAy) < 1e-6 * handAy, `hand ${handAy} N, solver ${RA.fz.toFixed(3)} N`);
}

// (3) De lijnlast levert exact 30 000 N (projectie, niet staaflengte).
{
  const totaal = Math.abs(Q_STAAF) * L_BEEN_MM;
  controle("lijnlast levert 30 000 N", Math.abs(totaal - 30000) < 1e-6, `${totaal.toFixed(6)} N`);
}

// (4) Fout-variant uit het dossier: lijnlast per meter STAAFLENGTE geeft
//     volgens het dossier 33 233 N in plaats van 31 500 N. Reproduceren we dat,
//     dan is de lastafhandeling van de adapter aantoonbaar de juiste.
{
  const rFout = rekenDoor({ distLoads: [{ beamId: 2, q: -3 }] });
  const ay = rFout.reactions.get(1).fz;
  controle("fout-variant reproduceert de 33 233 N uit het dossier",
    Math.abs(ay - 33233) < 1, `A_y = ${ay.toFixed(1)} N`);
}

// (5) Discretisatie: elke staaf in 4 stukken geeft dezelfde uitkomst
//     (Bernoulli-elementen zijn exact voor een uniforme last).
{
  const nodes = [], beams = [], loads = [];
  let nid = 100, bid = 100;
  const interpoleer = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  for (const n of NODES) nodes.push({ id: n.id, x: n.x, z: n.z });
  for (const b of BEAMS) {
    const a = NODES.find((n) => n.id === b.from), c = NODES.find((n) => n.id === b.to);
    let vorige = b.from;
    for (let k = 1; k <= 4; k++) {
      let volgende;
      if (k === 4) volgende = b.to;
      else { const p = interpoleer(a, c, k / 4); nodes.push({ id: ++nid, x: p.x, z: p.z }); volgende = nid; }
      const nieuw = ++bid;
      beams.push({ id: nieuw, from: vorige, to: volgende, E: b.E, A: b.A, I: b.I });
      if (b.id === 2) loads.push({ beamId: nieuw, q: Q_STAAF });
      vorige = volgende;
    }
  }
  const rFijn = solve({ nodes, beams, supports: SUPPORTS, loads, pointLoads: POINT_LOADS });
  const dAx = Math.abs(rFijn.reactions.get(1).fx - RA.fx);
  const dW  = Math.abs(rFijn.displacements.get(3).uz - r.displacements.get(3).uz);
  controle("verfijning 4× per staaf verandert niets",
    dAx < 1e-6 * Math.abs(RA.fx) && dW < 1e-6 * Math.abs(r.displacements.get(3).uz),
    `ΔA_x = ${dAx.toExponential(2)} N, Δw_C = ${dW.toExponential(2)} mm`);
}

// (6) Knoopevenwicht in de momentenlijn. In A1 zit het uitwendige moment van
//     100 kNm: het verschil tussen het staafeindmoment van de kolom en het
//     staafbeginmoment van het spantbeen moet exact 100 kNm zijn. In B1 zit
//     geen uitwendig moment, dus daar zijn de twee staafeindmomenten even
//     groot. In C evenmin, en daar sluiten de twee spantbenen op elkaar aan.
{
  const e1 = r.elements.get(1), e2 = r.elements.get(2), e3 = r.elements.get(3), e4 = r.elements.get(4);
  const sprongA1 = Math.abs(e1.M_end) - Math.abs(e2.M_start);
  controle("momentsprong in A1 = het aangebrachte moment van 100 kNm",
    Math.abs(sprongA1 - 1e8) < 1e-6 * 1e8, `${(sprongA1 / 1e6).toFixed(6)} kNm`);
  controle("momenten sluiten aan in de nok C",
    Math.abs(e2.M_end - e3.M_start) < 1e-6 * Math.abs(e2.M_end),
    `${(e2.M_end / 1e6).toFixed(4)} vs ${(e3.M_start / 1e6).toFixed(4)} kNm`);
  controle("momenten in evenwicht in B1 (geen uitwendig moment)",
    Math.abs(Math.abs(e3.M_end) - Math.abs(e4.M_end)) < 1e-6 * Math.abs(e4.M_end),
    `${(e3.M_end / 1e6).toFixed(4)} vs ${(e4.M_end / 1e6).toFixed(4)} kNm`);
}

// (7) Het opgeslagen R04.femp is bruikbaar: inlezen, de doorsneden door de
//     resolver van de app halen en opnieuw doorrekenen.
//
//     Twee bewuste verschillen met het rekenmodel hierboven, allebei gevolg
//     van het ontbreken van vrije doorsnede-invoer in de app:
//      · E is 11 000 (C24) in plaats van 210 000 N/mm². Omdat álle staven
//        dezelfde E krijgen, verandert dat de KRACHTSVERDELING niet en
//        schaalt het alleen de verplaatsingen met 210 000/11 000 = 19,0909.
//      · A en I volgen uit de VIERKANTE afmetingen die de bron noemt
//        (278,3 en 234,0 mm) in plaats van uit de afgeronde tabelwaarden
//        7,746·10⁻²/5,0·10⁻⁴ resp. 5,477·10⁻²/2,5·10⁻⁴. Dat scheelt 0,01 à
//        0,02 % in A en I, en daarmee een fractie in A_x en w_C.
//     De eis is daarom niet "bit-identiek", maar: het opgeslagen bestand
//     reproduceert de referentiewaarden binnen dezelfde 1 %-tolerantie.
{
  const terug = deserializeProject(serializeProject(PROJECT_STATE));
  const secKolom = resolveSection("C24", "278.3x278.3");
  const secBeen  = resolveSection("C24", "234x234");
  controle("A en I van de kolom komen uit het vierkant 278,3 mm",
    Math.abs(secKolom.A - 278.3 ** 2) < 1e-6 && Math.abs(secKolom.I - 278.3 ** 4 / 12) < 1,
    `A = ${secKolom.A.toFixed(1)} mm², I = ${secKolom.I.toExponential(5)} mm⁴`);

  const rFemp = solve({
    nodes: terug.nodes,
    beams: terug.beams.map((b) => {
      const s = resolveSection(b.material, b.profile);
      return { id: b.id, from: b.from, to: b.to, E: s.E, A: s.A, I: s.I };
    }),
    supports: terug.supports,
    loads: terug.loads
      .filter((l) => l.type === "lineLoad")
      .map((l) => ({ beamId: l.beamId, q: l.q, qDir: l.qDir, qCoord: l.qCoord })),
    pointLoads: terug.loads
      .filter((l) => l.type === "pointForce" || l.type === "pointMoment")
      .map((l) => ({
        nodeId: l.nodeId,
        fx: (l.fx ?? 0) * 1000, fz: (l.fz ?? 0) * 1000, my: (l.my ?? 0) * 1e6,
      })),
  });
  const axFemp = rFemp.reactions.get(1).fx;
  const azFemp = rFemp.reactions.get(1).fz;
  // Terugschalen naar E = 210 000 N/mm² om met de referentiezakking te kunnen
  // vergelijken (verplaatsingen zijn omgekeerd evenredig met E).
  const wFemp = rFemp.displacements.get(3).uz / 1000 * (11000 / 210000);
  controle("R04.femp reproduceert A_x binnen 1 %",
    Math.abs(axFemp - 20239.4) / 20239.4 < 0.01,
    `${axFemp.toFixed(2)} N (Δ ${((axFemp / 20239.4 - 1) * 100).toFixed(4)} %)`);
  controle("R04.femp reproduceert A_y binnen 1 %",
    Math.abs(azFemp - 31500) / 31500 < 0.01,
    `${azFemp.toFixed(2)} N (Δ ${((azFemp / 31500 - 1) * 100).toFixed(4)} %)`);
  controle("R04.femp reproduceert w_C binnen 1 % (na terugschalen op E)",
    Math.abs(wFemp + 0.03072) / 0.03072 < 0.01,
    `${wFemp.toFixed(7)} m (Δ ${((wFemp / -0.03072 - 1) * 100).toFixed(4)} %)`);
  const factor = rFemp.displacements.get(3).uz / r.displacements.get(3).uz;
  log(`  · verplaatsingsfactor van het bestand t.o.v. het rekenmodel: ` +
      `${factor.toFixed(4)} (E-verhouding 19,0909 plus het doorsnede-afrondingsverschil)`);
}

// (8) Verklaring van de restafwijking: de "solution analytique" van de bron
//     verwaarloost normaalkrachtvervorming. Met reklamloze staven (A ×10 000)
//     moeten onze waarden tot op alle gepubliceerde cijfers samenvallen.
{
  const rStijf = rekenDoor({
    kolom: { ...KOLOM, A: KOLOM.A * 1e4 },
    been:  { ...BEEN,  A: BEEN.A  * 1e4 },
  });
  const ax = rStijf.reactions.get(1).fx;
  const w  = rStijf.displacements.get(3).uz / 1000;
  log(`  · zonder normaalkrachtvervorming: A_x = ${ax.toFixed(3)} N (ref 20 239,4) · ` +
      `w_C = ${w.toFixed(7)} m (ref −0,03072)`);
  controle("A_x valt dan samen met de referentie (< 0,01 %)",
    Math.abs(ax - 20239.4) / 20239.4 < 1e-4);
  controle("w_C valt dan samen met de referentie (< 0,05 %)",
    Math.abs(w + 0.03072) / 0.03072 < 5e-4);
}

// ─────────────────────────────────────────────────────────────────────────
// EXTRA UITVOER — grootheden die de bron NIET geeft (momentenlijn,
// staafkrachten, reactie in B). Puur ter documentatie, geen vergelijking.
// ─────────────────────────────────────────────────────────────────────────
log("\n═══ Aanvullend (niet in de bron) ═══");
{
  const RB = r.reactions.get(5);
  log(`  reactie B: fx = ${RB.fx.toFixed(2)} N · fz = ${RB.fz.toFixed(2)} N`);
  const naam = { 1: "kolom links A–A1", 2: "spantbeen links A1–C", 3: "spantbeen rechts C–B1", 4: "kolom rechts B–B1" };
  for (const b of [1, 2, 3, 4]) {
    const e = r.elements.get(b);
    log(`  ${naam[b].padEnd(24)} N = ${(e.N / 1000).toFixed(2)} kN · ` +
        `M_begin = ${(e.M_start / 1e6).toFixed(3)} kNm · M_eind = ${(e.M_end / 1e6).toFixed(3)} kNm`);
  }
  const d2 = r.displacements.get(2), d4 = r.displacements.get(4);
  log(`  ux(A1) = ${d2.ux.toFixed(4)} mm · ux(B1) = ${d4.ux.toFixed(4)} mm · ux(C) = ${r.displacements.get(3).ux.toFixed(4)} mm`);
}

log(`\n═══ TOTAAL: grootste afwijking ${ergsteAfwijking.toFixed(4)} % · ` +
    `${aantalBuitenTolerantie} van 3 buiten de 1 %-tolerantie · ` +
    `controles ${controlesOk} ok / ${controlesFout} fout ═══`);
process.exit(aantalBuitenTolerantie > 0 || controlesFout > 0 ? 1 : 0);
