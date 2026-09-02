// ═══════════════════════════════════════════════════════════════════════════
// R03 — Tweescharnier zadeldakportaal 20 × 8/12 m, vier losse belastinggevallen
//
// Dossier: docs/superpowers/plans/2026-09-02-referentieberekeningen.md, § R03.
// Bron:    validatiehandboek (fascicule v3.01) van een open-source eindige-
//          elementenpakket, geval SSLL14 — analytische referentie-oplossing.
//
// Dit script:
//   1. bouwt het model, schrijft het als referentie/R03.femp (serializeProject);
//   2. rekent de VIER belastinggevallen afzonderlijk door (geen combinatie,
//      geen partiële factoren, eerste orde);
//   3. legt elke referentiewaarde uit het dossier naast onze uitkomst en
//      drukt de afwijking in procenten af;
//   4. controleert daarnaast het globale evenwicht per geval als onafhankelijke
//      derde partij (statica, los van solver én bron).
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R03.mjs
//
// ── EENHEDEN ───────────────────────────────────────────────────────────────
// De solver-adapter (engine.ts) rekent in mm, N, N·mm; de kern intern in
// m, Pa, N. De bron geeft m, Pa, N, N·m. Omrekening in dit script:
//   E  2,1e11 Pa      → 210000 N/mm²
//   A  1,0 m²         → 1,0e6  mm²
//   I  5,0e-4 m⁴      → 5,0e8  mm⁴   (kolommen)
//   I  2,5e-4 m⁴      → 2,5e8  mm⁴   (dakliggers)
//   p  -3000 N/m      → -3 N/mm   (lijnlast; kN/m = N/mm)
//   M  -100000 N·m    → -1,0e8 N·mm
// Terug: verplaatsing mm → m (/1000), moment N·mm → N·m (/1000).
//
// ── TEKENCONVENTIES ────────────────────────────────────────────────────────
// De bron rapporteert Mz(C), Fx(A) en Fy(A) als POSITIEVE getallen in alle
// vier de gevallen. Onze solver levert tekens: sagging-positieve momenten en
// reacties in +x/+z. Bij de gevallen p, F1 en F2 vallen de tekens samen; bij
// geval M zijn Mz(C) en Fy(A) bij ons NEGATIEF. Dat onze tekens daar kloppen
// blijkt onafhankelijk uit twee dingen:
//   (a) statisch evenwicht: een koppel M = −100 kN·m in D vraagt om
//       Fy(A) = −5 kN en Fy(B) = +5 kN (ΣM om A: −1e5 + 20·R_B,y = 0);
//   (b) de kruiscontrole die het dossier zelf bij R04 noteert
//       (22 500 + 10 000 + 4 000 − 5 000 = 31 500 N) gebruikt eveneens −5 000.
// De brontabel geeft voor die kolommen dus de GROOTTE. Dit script vergelijkt
// die drie kolommen daarom op grootte en drukt het teken er los bij af;
// verplaatsingen worden mét teken vergeleken.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject } = await import("../src/io/projectFile.ts");

const hier = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ── Geometrie en doorsneden ────────────────────────────────────────────────
const E    = 210000;   // N/mm²   (2,1e11 Pa)
const AX   = 1.0e6;    // mm²     (1,0 m² — bewust zeer groot: axiaal star)
const IKOL = 5.0e8;    // mm⁴     (5,0e-4 m⁴)
const ILIG = 2.5e8;    // mm⁴     (2,5e-4 m⁴)

// A(0;0) · D(0;8) · C(10;12) · E(20;8) · B(20;0)  — in mm
const nodes = [
  { id: 1, x: 0,     z: 0     },  // A — voet links
  { id: 2, x: 0,     z: 8000  },  // D — goot links
  { id: 3, x: 10000, z: 12000 },  // C — nok
  { id: 4, x: 20000, z: 8000  },  // E — goot rechts
  { id: 5, x: 20000, z: 0     },  // B — voet rechts
];
const beams = [
  { id: 1, from: 1, to: 2, E, A: AX, I: IKOL },  // A–D  kolom links
  { id: 2, from: 2, to: 3, E, A: AX, I: ILIG },  // D–C  dakligger links
  { id: 3, from: 3, to: 4, E, A: AX, I: ILIG },  // C–E  dakligger rechts
  { id: 4, from: 4, to: 5, E, A: AX, I: IKOL },  // E–B  kolom rechts
];
// A en B scharnierend: ux = uz = 0, rotatie vrij. D, C en E zijn momentvast.
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 5, type: "pinned" },
];

// Staaflengte van een dakligger, exact: √(10² + 4²) = 10,770329614 m.
const L_LIGGER_M = Math.hypot(10, 4);

// ── De vier belastinggevallen ──────────────────────────────────────────────
// p  : lijnlast −3000 N/m op D–C, PER METER STAAFLENGTE, globaal verticaal.
//      In de adapter is dat qDir "z" + qCoord "global": de kern projecteert de
//      globale component naar lokaal en integreert over de VOLLE staaflengte,
//      dus totaal 3 N/mm × 10770,33 mm = 32 311 N. (Vergelijk R04, waar de
//      last op de horizontale projectie werkt — daar geldt dit NIET.)
// F1 : verticale puntlast −20 000 N in de nok C. De brontekst noemt −2 000 N,
//      maar dat is een zetfout (dossier § R03): het invoerbestand en de
//      referentiereactie Fy(A) = 10 000 N horen bij −20 000 N.
// F2 : horizontale puntlast −10 000 N (dus naar −x) in de gootknoop D.
// M  : koppel −100 000 N·m om Z in de gootknoop D.
const gevallen = [
  {
    sleutel: "p",
    naam: "p — lijnlast −3 kN/m op dakligger D–C (per m staaflengte)",
    invoer: { loads: [{ beamId: 2, q: -3, qDir: "z", qCoord: "global" }] },
    // Voor de evenwichtscontrole: resultante en aangrijpingspunt (m).
    statica: { Fx: 0, Fz: -3000 * L_LIGGER_M, Mz_om_A: -(-3000 * L_LIGGER_M) * 5 * -1 },
  },
  {
    sleutel: "F1",
    naam: "F1 — verticale puntlast −20 kN in de nok C",
    invoer: { loads: [], pointLoads: [{ nodeId: 3, fz: -20000 }] },
    statica: { Fx: 0, Fz: -20000, Mz_om_A: 10 * -20000 },
  },
  {
    sleutel: "F2",
    naam: "F2 — horizontale puntlast −10 kN in gootknoop D",
    invoer: { loads: [], pointLoads: [{ nodeId: 2, fx: -10000 }] },
    statica: { Fx: -10000, Fz: 0, Mz_om_A: -8 * -10000 },
  },
  {
    sleutel: "M",
    naam: "M — koppel −100 kNm om Z in gootknoop D",
    invoer: { loads: [], pointLoads: [{ nodeId: 2, my: -1.0e8 }] },
    statica: { Fx: 0, Fz: 0, Mz_om_A: -100000 },
  },
];
// Lijnlast p: resultante −32 311 N in het midden van D–C, op x = 5 m.
gevallen[0].statica.Mz_om_A = 5 * (-3000 * L_LIGGER_M);

// ── Referentiewaarden uit het dossier (NIET aanpassen) ─────────────────────
// tekenVast = true  → mét teken vergelijken
// tekenVast = false → op grootte vergelijken (de brontabel geeft daar de
//                     absolute waarde; zie de kop van dit bestand)
const REFERENTIE = {
  p:  [
    { grootheid: "Dx(C)",  ref:  0.0110476,     eenheid: "m",   tekenVast: true  },
    { grootheid: "Dy(C)",  ref: -0.012422374,   eenheid: "m",   tekenVast: true  },
    { grootheid: "Mz(C)",  ref:  18672.994,     eenheid: "N·m", tekenVast: false },
    { grootheid: "Fx(A)",  ref:  5175.37,       eenheid: "N",   tekenVast: false },
    { grootheid: "Fy(A)",  ref:  24233.24,      eenheid: "N",   tekenVast: false },
  ],
  F1: [
    { grootheid: "Dx(C)",  ref:  0.0,           eenheid: "m",   tekenVast: true, nulwaarde: true },
    { grootheid: "Dy(C)",  ref: -0.01497330,    eenheid: "m",   tekenVast: true  },
    { grootheid: "Mz(C)",  ref:  41422.161,     eenheid: "N·m", tekenVast: false },
    { grootheid: "Fx(A)",  ref:  4881.487,      eenheid: "N",   tekenVast: false },
    { grootheid: "Fy(A)",  ref:  10000.00,      eenheid: "N",   tekenVast: false },
  ],
  F2: [
    { grootheid: "Dx(C)",  ref: -0.03000956,    eenheid: "m",   tekenVast: true  },
    { grootheid: "Dy(C)",  ref: -0.00299466,    eenheid: "m",   tekenVast: true  },
    { grootheid: "Mz(C)",  ref:  8284.432,      eenheid: "N·m", tekenVast: false },
    { grootheid: "Fx(A)",  ref:  5976.297,      eenheid: "N",   tekenVast: false },
    { grootheid: "Fy(A)",  ref:  4000.00,       eenheid: "N",   tekenVast: false },
  ],
  M:  [
    { grootheid: "Dx(C)",  ref:  0.0273532,     eenheid: "m",   tekenVast: true  },
    { grootheid: "Dy(C)",  ref: -0.001215646,   eenheid: "m",   tekenVast: true  },
    { grootheid: "Mz(C)",  ref:  4916.724,      eenheid: "N·m", tekenVast: false },
    { grootheid: "Fx(A)",  ref:  4576.394,      eenheid: "N",   tekenVast: false },
    { grootheid: "Fy(A)",  ref:  5000.00,       eenheid: "N",   tekenVast: false },
  ],
};

// Tolerantie: het dossier noemt 1 % voor een numerieke referentie uit een
// validatiebundel; deze bundel geeft een ANALYTISCHE oplossing, dus hanteren
// we hier de scherpere 0,5 %-grens uit dezelfde tabel.
const TOL_PCT = 0.5;

let aantalOk = 0, aantalFout = 0, grootsteAfwijking = 0, grootsteNaam = "";
const regels = [];

function vergelijk(geval, grootheid, onzeWaarde, ref, eenheid, tekenVast, nulwaarde) {
  const gebruikteOnze = tekenVast ? onzeWaarde : Math.abs(onzeWaarde);
  const gebruikteRef  = tekenVast ? ref        : Math.abs(ref);
  const verschil = gebruikteOnze - gebruikteRef;
  let pct, ok;
  if (nulwaarde || Math.abs(gebruikteRef) < 1e-12) {
    // Referentie is nul: procenten hebben geen betekenis; absolute drempel.
    pct = 0;
    ok = Math.abs(gebruikteOnze) < 1e-9;
  } else {
    pct = (verschil / Math.abs(gebruikteRef)) * 100;
    ok = Math.abs(pct) <= TOL_PCT;
  }
  if (ok) aantalOk++; else aantalFout++;
  if (Math.abs(pct) > Math.abs(grootsteAfwijking)) {
    grootsteAfwijking = pct;
    grootsteNaam = `${geval} · ${grootheid}`;
  }
  regels.push({ geval, grootheid, onzeWaarde, ref, eenheid, pct, ok, tekenVast });
  const vlag = ok ? "OK " : "!! ";
  const teken = tekenVast ? "" : "  (op grootte vergeleken)";
  log(`  ${vlag}${grootheid.padEnd(6)} onze ${fmt(onzeWaarde)} ${eenheid.padEnd(4)}` +
      ` · ref ${fmt(ref)} ${eenheid.padEnd(4)} · Δ = ${pct.toFixed(4)} %${teken}`);
}

function fmt(v) {
  if (Math.abs(v) >= 1000 || v === 0) return v.toFixed(3).padStart(14);
  return v.toPrecision(9).padStart(14);
}

// ── Doorrekenen en vergelijken ─────────────────────────────────────────────
log("═══ R03 — tweescharnier zadeldakportaal, vier losse belastinggevallen ═══");
log(`Dakliggerlengte exact: ${L_LIGGER_M.toFixed(9)} m (dossier noemt 10,7703 m)`);

const resultaten = {};
for (const g of gevallen) {
  const r = solve({ nodes, beams, supports, loads: [], ...g.invoer });
  resultaten[g.sleutel] = r;

  const dC = r.displacements.get(3);
  const rA = r.reactions.get(1);
  const rB = r.reactions.get(5);
  // Mz in de nok: het staafeindmoment van dakligger D–C aan de C-zijde. Beide
  // dakliggers moeten daar hetzelfde moment geven (geen uitwendig koppel in C).
  const M_C_links  = r.elements.get(2).M_end;    // N·mm
  const M_C_rechts = r.elements.get(3).M_start;  // N·mm

  const onze = {
    "Dx(C)": dC.ux / 1000,          // mm → m
    "Dy(C)": dC.uz / 1000,          // mm → m
    "Mz(C)": M_C_links / 1000,      // N·mm → N·m
    "Fx(A)": rA.fx,                 // N
    "Fy(A)": rA.fz,                 // N
  };

  log(`\n─── Geval ${g.sleutel}: ${g.naam}`);
  for (const rij of REFERENTIE[g.sleutel]) {
    vergelijk(g.sleutel, rij.grootheid, onze[rij.grootheid], rij.ref,
              rij.eenheid, rij.tekenVast, rij.nulwaarde);
  }

  // Onafhankelijke controles (statica + continuïteit), geen bronwaarden.
  const sprongC = Math.abs(M_C_links - M_C_rechts);
  const sprongOk = sprongC <= 1e-6 * Math.max(1, Math.abs(M_C_links));
  log(`     continuïteit nok: M(D–C|C) = ${(M_C_links / 1000).toFixed(3)} N·m,` +
      ` M(C–E|C) = ${(M_C_rechts / 1000).toFixed(3)} N·m → ${sprongOk ? "gelijk" : "SPRONG"}`);
  if (sprongOk) aantalOk++; else aantalFout++;

  const sFx = rA.fx + rB.fx + g.statica.Fx;
  const sFz = rA.fz + rB.fz + g.statica.Fz;
  // ΣM om A (m, N): reactie B op (20; 0) levert 20·R_B,y; A levert niets.
  const sM  = g.statica.Mz_om_A + 20 * rB.fz;
  const schaal = Math.max(1, Math.abs(g.statica.Fz), Math.abs(g.statica.Fx), Math.abs(rA.fx));
  const evenwichtOk = Math.abs(sFx) < 1e-6 * schaal && Math.abs(sFz) < 1e-6 * schaal
                   && Math.abs(sM)  < 1e-6 * Math.max(1, Math.abs(g.statica.Mz_om_A));
  log(`     evenwicht: ΣFx = ${sFx.toExponential(2)} N · ΣFz = ${sFz.toExponential(2)} N` +
      ` · ΣM(A) = ${sM.toExponential(2)} N·m → ${evenwichtOk ? "sluit" : "SLUIT NIET"}`);
  if (evenwichtOk) aantalOk++; else aantalFout++;
}

// ── Kruiscontrole met R04 (zelfde systeem, andere bron) ────────────────────
// Het dossier noteert bij R04 een eigen kruiscontrole: de verticale reactie
// A(Y) van R04 is de superpositie van de vier R03-gevallen, met de lijnlast
// geschaald naar de horizontale projectie (30 000 N i.p.v. 32 311 N):
//   24 233,24 × 30 000/32 311 + 10 000 + 4 000 − 5 000 = 31 500 N.
// Die 31 500 N is de gepubliceerde R04-referentie. Wij herhalen de som met
// ONZE vier uitkomsten — een controle tegen een tweede, onafhankelijke bron.
log("\n─── Kruiscontrole tegen de R04-referentie (superpositie) ───");
{
  const totaalStaaflengte = 3000 * L_LIGGER_M;   // N, R03-lijnlast
  const totaalProjectie   = 3000 * 10;           // N, R04-lijnlast op projectie
  const Ap = resultaten.p.reactions.get(1).fz * (totaalProjectie / totaalStaaflengte);
  const som = Ap
            + resultaten.F1.reactions.get(1).fz
            + resultaten.F2.reactions.get(1).fz
            + resultaten.M.reactions.get(1).fz;
  const refR04 = 31500.0;
  const pct = ((som - refR04) / refR04) * 100;
  const ok = Math.abs(pct) <= TOL_PCT;
  if (ok) aantalOk++; else aantalFout++;
  if (Math.abs(pct) > Math.abs(grootsteAfwijking)) { grootsteAfwijking = pct; grootsteNaam = "R04-kruiscontrole A(Y)"; }
  log(`  ${ok ? "OK " : "!! "}A(Y) gesuperponeerd = ${som.toFixed(3)} N · R04-referentie ` +
      `${refR04.toFixed(1)} N · Δ = ${pct.toFixed(4)} %`);
  log(`     (deeltermen: p→${Ap.toFixed(2)} · F1→${resultaten.F1.reactions.get(1).fz.toFixed(2)}` +
      ` · F2→${resultaten.F2.reactions.get(1).fz.toFixed(2)}` +
      ` · M→${resultaten.M.reactions.get(1).fz.toFixed(2)})`);
}

// ── Tekenrapport (informatief, telt niet mee als toets) ────────────────────
log("\n─── Tekens van onze uitkomsten (brontabel geeft alleen groottes) ───");
for (const g of gevallen) {
  const r = resultaten[g.sleutel];
  log(`  ${g.sleutel.padEnd(3)} Mz(C) = ${(r.elements.get(2).M_end / 1000).toFixed(3)} N·m ·` +
      ` Fx(A) = ${r.reactions.get(1).fx.toFixed(3)} N ·` +
      ` Fy(A) = ${r.reactions.get(1).fz.toFixed(3)} N ·` +
      ` Fy(B) = ${r.reactions.get(5).fz.toFixed(3)} N`);
}

// ── Model wegschrijven als projectbestand ──────────────────────────────────
// LET OP — het projectbestand kan de doorsnede van dit geval NIET dragen: een
// staaf verwijst naar (materiaal, profiel) en `resolveSection` leidt daar E, A
// en I uit af. A = 1,0 m² met I = 5,0e-4 / 2,5e-4 m⁴ staat in geen enkele
// profieltabel en is ook geen rechthoek b×h met een houtsterkteklasse.
// E = 210000 N/mm² klopt wél via materiaal S235. De profielnaam hieronder
// benoemt daarom expliciet de vereiste doorsnede; opent men het bestand in de
// app, dan valt `resolveSection` met een consolewaarschuwing terug op HEA 160
// (A = 3877 mm², I = 1,673e7 mm⁴ voor ALLE vier de staven, dus ook de
// I-verhouding kolom : ligger = 2 : 1 gaat verloren) en wijken de uitkomsten
// fors af — gemeten langs de bestandsroute voor geval p: Dy(C) = −0,2431 m
// i.p.v. −0,01242 m. Dit script rekent met de EXPLICIETE E/A/I hierboven en
// is dus wél de referentie-invoer; het bestand dient om geometrie,
// opleggingen, belastinggevallen en lasten in de app te kunnen inzien.
const projectTekst = serializeProject({
  nodes: nodes.map((n) => ({ id: n.id, x: n.x, z: n.z })),
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "REF kolom A=1,0e6 mm2 I=5,0e8 mm4", loadRole: "gevelLinks"  },
    { id: 2, from: 2, to: 3, material: "S235", profile: "REF ligger A=1,0e6 mm2 I=2,5e8 mm4", loadRole: "dakHellend" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "REF ligger A=1,0e6 mm2 I=2,5e8 mm4", loadRole: "dakHellend" },
    { id: 4, from: 4, to: 5, material: "S235", profile: "REF kolom A=1,0e6 mm2 I=5,0e8 mm4", loadRole: "gevelRechts" },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 5, type: "pinned" },
  ],
  plates: [],
  // Lasten in projecteenheden: kN, kNm, kN/m (= N/mm).
  loads: [
    { id: 1, type: "lineLoad",    caseId: 1, beamId: 2, q: -3, qDir: "z", qCoord: "global" },
    { id: 2, type: "pointForce",  caseId: 2, nodeId: 3, fz: -20 },
    { id: 3, type: "pointForce",  caseId: 3, nodeId: 2, fx: -10 },
    { id: 4, type: "pointMoment", caseId: 4, nodeId: 2, my: -100 },
  ],
  loadCases: [
    { id: 1, name: "p — lijnlast dak D–C",  type: "other" },
    { id: 2, name: "F1 — puntlast nok C",   type: "other" },
    { id: 3, name: "F2 — H-last goot D",    type: "other" },
    { id: 4, name: "M — koppel goot D",     type: "other" },
  ],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
  // Geen combinaties: de vier gevallen worden los beoordeeld.
  combinations: [],
  structuralGrid: {
    enabled: true,
    xAxes: [
      { id: "A", label: "A", position: 0 },
      { id: "B", label: "B", position: 10000 },
      { id: "C", label: "C", position: 20000 },
    ],
    zAxes: [
      { id: "1", label: "1", position: 0 },
      { id: "2", label: "2", position: 8000 },
      { id: "3", label: "3", position: 12000 },
    ],
  },
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
});
// Twee keer wegschrijven: R03.femp zoals in de campagne afgesproken, en
// R03.ifcfem2d omdat de open-dialoog van de app op die extensie filtert.
for (const bestandsnaam of ["R03.femp", "R03.ifcfem2d"]) {
  const pad = join(hier, bestandsnaam);
  writeFileSync(pad, projectTekst, "utf8");
  log(`\nModel opgeslagen: ${pad}`);
}

// ── Samenvatting ───────────────────────────────────────────────────────────
log(`\n═══ R03: ${aantalOk} goed, ${aantalFout} fout` +
    ` · grootste afwijking ${grootsteAfwijking.toFixed(4)} % (${grootsteNaam})` +
    ` · tolerantie ${TOL_PCT} % ═══`);
process.exit(aantalFout > 0 ? 1 : 0);
