// R08 — Scheef raamwerk met verplaatsbare knopen.
//
// Dossier: docs/superpowers/plans/2026-09-02-referentieberekeningen.md, §R08.
// Bron: TU Delft CT2031, tentamen 21 januari 2013, vraagstuk 2 (uitwerking blz. 9).
//
// CONSTRUCTIE
//   Knopen (m):  A (0; 0) · C (4; 0) · D (8; −3) · B (10; −1,5)
//   Staven:      AC 4,0 m horizontaal · CD 5,0 m (4 →, 3 ↓) · DB 2,5 m (2 →, 1,5 ↑)
//   Opleggingen: A en B scharnier; C en D momentvaste knopen
//   Stijfheid:   alle staven EI = 10 000 kN·m²
//   Belasting:   q = 41 kN/m verticaal omlaag, volle lengte van AC
//
//   Het raamwerk is 1× statisch onbepaald (3m + r − 3j = 9 + 4 − 12 = 1) en
//   heeft verplaatsbare knopen: met onrekbare staven blijft één zijdelingse
//   vrijheidsgraad over naast de twee knooprotaties.
//
// DOORSNEDEKEUZE — waarom een fictief rechthoekprofiel
//   De bron geeft alleen EI, geen doorsnede. Het projectbestand kan geen losse
//   A/I dragen: de app leidt die af uit (materiaal, profiel) via sectionResolver.
//   Gekozen: materiaal "C22" (E_0,mean = 10 000 N/mm²) met profiel "12000x100":
//       I  = 12000 · 100³ / 12 = 1,0e9 mm⁴
//       EI = 10 000 · 1,0e9    = 1,0e13 N·mm² = 10 000 kN·m²   ← exact de bron
//       A  = 12000 · 100       = 1,2e6 mm²  →  EA = 1,2e10 N = 1,2e7 kN
//   Bewust een onmogelijke maat, zodat niemand hem voor een echte balk aanziet.
//   De bron VERWAARLOOST normaalkrachtvervorming; met deze EA is het effect
//   ≈ 0,08 % (zie route B hieronder, die met een 10 000× stijvere A rekent).
//
// TEKENCONVENTIE
//   De bron geeft MC = −208 kN·m en MD = +32 kN·m in de eindmoment-conventie
//   van de verplaatsingsmethode (moment dat de knoop op het staafeinde uitoefent,
//   linksom positief). Onze staafresultaten staan in de zakking-positieve
//   balkconventie: M[0] van staaf CD = +208 kN·m op dezelfde plek. Dat is een
//   conventieverschil, geen afwijking — het dossier schrijft daarom voor op
//   ABSOLUTE waarde te vergelijken.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R08.mjs

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FEMP = join(HIER, "R08.femp");
// Zelfde inhoud onder de extensie waarop de open-dialoog van de app filtert
// (PROJECT_FILE_EXT = "ifcfem2d"), zodat het model daadwerkelijk te openen is.
const FEMP_APP = join(HIER, "R08.ifcfem2d");

let passed = 0, failed = 0, grootsteAfwijking = 0;
const log = (s) => process.stdout.write(s + "\n");

/**
 * Vergelijk één grootheid met de referentie uit het dossier.
 * `tolPct` is de tolerantie uit §1.5; standaard 1 % (numerieke referentie).
 * De afwijking wordt ALTIJD gerapporteerd, ook als hij binnen de tolerantie valt.
 */
function vergelijk(naam, onze, referentie, eenheid, tolPct = 1) {
  const afw = referentie === 0 ? (onze === 0 ? 0 : Infinity)
                               : ((onze - referentie) / Math.abs(referentie)) * 100;
  const ok = Number.isFinite(onze) && Math.abs(afw) <= tolPct;
  if (ok) passed++; else failed++;
  if (Number.isFinite(afw)) grootsteAfwijking = Math.max(grootsteAfwijking, Math.abs(afw));
  log(`  ${ok ? "OK " : "XX "} ${naam.padEnd(34)} ref ${referentie.toPrecision(8).padStart(13)} ${eenheid.padEnd(4)}` +
      ` | onze ${onze.toPrecision(8).padStart(13)} | Δ ${(afw >= 0 ? "+" : "") + afw.toFixed(4)} %`);
}

// ── 1. Model opbouwen en als projectbestand wegschrijven ────────────────────
// Knoop-ids: 1 = A, 2 = C, 3 = D, 4 = B.  Staaf-ids: 1 = AC, 2 = CD, 3 = DB.
const MATERIAAL = "C22";
const PROFIEL   = "12000x100";

const state = {
  nodes: [
    { id: 1, x:     0, z:     0 },  // A
    { id: 2, x:  4000, z:     0 },  // C
    { id: 3, x:  8000, z: -3000 },  // D
    { id: 4, x: 10000, z: -1500 },  // B
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL },  // AC
    { id: 2, from: 2, to: 3, material: MATERIAAL, profile: PROFIEL },  // CD
    { id: 3, from: 3, to: 4, material: MATERIAAL, profile: PROFIEL },  // DB
  ],
  supports: [
    { nodeId: 1, type: "pinned" },  // A
    { nodeId: 4, type: "pinned" },  // B
  ],
  plates: [],
  // q = 41 kN/m omlaag over de VOLLE lengte van AC (globaal verticaal).
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -41, qDir: "z", qCoord: "global" },
  ],
  loadCases: [{ id: 1, name: "q = 41 kN/m op AC", type: "live" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
  nonlinearEnabled: false,    // eerste orde
  structuralGrid: { enabled: false, xAxes: [], zAxes: [] },
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

const projectJson = serializeProject(state);
writeFileSync(FEMP, projectJson, "utf8");
writeFileSync(FEMP_APP, projectJson, "utf8");
log(`\nModel opgeslagen: ${FEMP}`);
log(`             en: ${FEMP_APP}  (extensie van de open-dialoog)`);

const sec = resolveSection(MATERIAAL, PROFIEL);
log(`Doorsnede uit het bestand: E = ${sec.E} N/mm², A = ${sec.A.toExponential(3)} mm², ` +
    `I = ${sec.I.toExponential(3)} mm⁴  →  EI = ${(sec.E * sec.I / 1e9).toFixed(1)} kN·m² (bron: ${sec.bron})`);

// ── 2. Route A — precies zoals de app rekent: bestand → mapping → solver ────
const uitBestand = deserializeProject(readFileSync(FEMP, "utf8"));
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
const routeA = solveAllCases(multi).perCase.get(1);

// ── 3. Route B — de aanname van de bron: normaalkrachtvervorming uitgezet ───
// Zelfde EI, maar A een factor 10 000 groter, zodat de staven praktisch
// onrekbaar zijn. Dit is de variant die één-op-één met de handberekening
// vergelijkbaar is.
const routeB = solve({
  nodes: state.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
  beams: state.beams.map(b => ({ id: b.id, from: b.from, to: b.to, E: sec.E, A: sec.A * 1e4, I: sec.I })),
  supports: state.supports.map(s => ({ nodeId: s.nodeId, type: s.type })),
  loads: [{ beamId: 1, q: -41 }],
});

// ── 4. Grootheden uit een resultaat trekken ────────────────────────────────
/**
 * Alle te vergelijken grootheden in de eenheden van het dossier (kN, kN·m, m, rad).
 *
 * theta is de mechanismerotatie. Uit de kinematica van het onrekbare mechanisme:
 * AC en DB draaien beide over theta, CD over theta/2. Twee onafhankelijke
 * uitdrukkingen — die moeten met elkaar kloppen als de staven onrekbaar zijn:
 *   theta = −u_z,C / L_AC   (zakking van C over de 4 m van AC)
 *   theta =  u_x,D / 1,5    (horizontale uitwijking van D; loodrechte
 *                            verplaatsing van D op DB is theta·2,5, waarvan
 *                            de horizontale component 0,6·2,5·theta = 1,5·theta is)
 */
function grootheden(r) {
  const dC = r.displacements.get(2);
  const dD = r.displacements.get(3);
  const rB = r.reactions.get(4);
  const CD = r.elements.get(2);   // staaf C→D
  const DB = r.elements.get(3);   // staaf D→B
  const AC = r.elements.get(1);   // staaf A→C
  const mCD = CD.bendingMoment.map(v => v / 1e6);   // N·mm → kN·m
  const mDB = DB.bendingMoment.map(v => v / 1e6);
  const mAC = AC.bendingMoment.map(v => v / 1e6);
  return {
    MC:        CD.M_start / 1e6,                  // kN·m, op knoop C, staaf CD
    MD:        CD.M_end   / 1e6,                  // kN·m, op knoop D, staaf CD
    maxCD:     Math.max(...mCD.map(Math.abs)),
    maxDB:     Math.max(...mDB.map(Math.abs)),
    maxAC:     Math.max(...mAC.map(Math.abs)),     // niet in de bron, wel ter info
    thetaC:    -dC.uz / 1000 / 4,                  // rad, uit de zakking van C
    thetaD:     dD.ux / 1000 / 1.5,                // rad, uit de uitwijking van D
    BV:        rB.fz / 1000,                       // kN
    BH:        rB.fx / 1000,                       // kN
    uD:        dD.ux / 1000,                       // m
    // Context (staat NIET in de bron, alleen ter controle van het evenwicht):
    AV:        r.reactions.get(1).fz / 1000,
    AH:        r.reactions.get(1).fx / 1000,
    uzC:       dC.uz / 1000,
    uzD:       dD.uz / 1000,
  };
}

// ── 5. Vergelijken ─────────────────────────────────────────────────────────
// Referentiewaarden LETTERLIJK uit het dossier. 18 2/3 en 19/375 staan daar als
// breuk; die worden hier als breuk gebruikt, niet als afgeronde decimaal.
const REF = {
  MC:    -208,        // kN·m (vergelijken op absolute waarde — zie kop)
  MD:      32,        // kN·m
  maxCD:  208,        // kN·m
  maxDB:   32,        // kN·m
  theta:  19 / 375,   // rad = 0,0506667
  BV:      30,        // kN
  BH:      56 / 3,    // kN = 18 2/3
  uD:      0.076,     // m
};

for (const [naam, r] of [
  ["ROUTE A — model uit R08.femp (app-route, EA eindig)", routeA],
  ["ROUTE B — aanname van de bron: staven axiaal star", routeB],
]) {
  const g = grootheden(r);
  log(`\n${naam}`);
  log("  " + "-".repeat(96));
  vergelijk("MC (staaf CD bij C), absoluut",  Math.abs(g.MC),    Math.abs(REF.MC),  "kNm");
  vergelijk("MD (staaf CD bij D), absoluut",  Math.abs(g.MD),    Math.abs(REF.MD),  "kNm");
  vergelijk("grootste |M| in staaf CD",       g.maxCD,           REF.maxCD,         "kNm");
  vergelijk("grootste |M| in staaf BD",       g.maxDB,           REF.maxDB,         "kNm");
  vergelijk("theta uit u_z,C (mechanisme)",   g.thetaC,          REF.theta,         "rad");
  vergelijk("theta uit u_x,D (mechanisme)",   g.thetaD,          REF.theta,         "rad");
  vergelijk("BV (verticale reactie in B)",    g.BV,              REF.BV,            "kN");
  vergelijk("BH (horizontale reactie in B)",  g.BH,              REF.BH,            "kN",  1);
  // u_D staat in de bron op 3 decimalen (0,076 m) — leesnauwkeurigheid 2 %.
  vergelijk("u_x,D (horizontale verpl. D)",   g.uD,              REF.uD,            "m",   2);

  log("  " + "-".repeat(96));
  log(`  Tekens zoals wij ze leveren: MC = ${g.MC.toFixed(3)} kN·m, MD = ${g.MD.toFixed(3)} kN·m` +
      "  (zakking-positieve balkconventie; de bron gebruikt de eindmoment-conventie)");
  log(`  Niet in de bron, ter controle: AV = ${g.AV.toFixed(3)} kN, AH = ${g.AH.toFixed(3)} kN,` +
      ` u_z,C = ${g.uzC.toFixed(6)} m, u_z,D = ${g.uzD.toFixed(6)} m`);
  log(`  Niet in de bron: grootste |M| in staaf AC = ${g.maxAC.toFixed(2)} kN·m` +
      ` (veldmaximum, analytisch A_V²/2q = ${(134 ** 2 / (2 * 41)).toFixed(2)} kN·m op x = ${(134 / 41).toFixed(3)} m` +
      " — het 21-stationsraster valt daar net naast)");

  // Evenwichtscontrole: ΣFz = 0 en ΣFx = 0 over beide opleggingen.
  const sFz = g.AV + g.BV - 41 * 4;
  const sFx = g.AH + g.BH;
  log(`  Evenwicht: ΣFz = ${sFz.toExponential(2)} kN, ΣFx = ${sFx.toExponential(2)} kN`);
}

log(`\n=== R08: ${passed} binnen tolerantie, ${failed} buiten tolerantie` +
    ` | grootste afwijking ${grootsteAfwijking.toFixed(4)} % ===`);
process.exit(failed > 0 ? 1 : 0);
