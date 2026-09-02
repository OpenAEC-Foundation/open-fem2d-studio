// ═══════════════════════════════════════════════════════════════════════════
// R05 — Driescharnierspant 8 × 3 m met deellast en puntlast
//
// Referentie: hand-out van een technische universiteit over het bepalen van
// oplegreacties van spanten (figuur 3). Zie het werkdossier
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R05,
// voor bron, invoer en de vier referentiewaarden.
//
// SYSTEEM (maten in m, oorsprong in oplegging A)
//
//        q = 2,24 kN/m ↓            F = 112 kN ↓
//     ┌───────────────────┐              │
//     ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼              ▼
//   (0;3)══════════════(5;3)══════════(8;3)      ← ligger, intern scharnier in S(5;3)
//     ║                   S            ║
//     ║                                ║         ← kolommen, hoogte 3,0 m
//     ║                                ║
//    A(0;0)                          B(8;0)      ← beide scharnierend opgelegd
//
//   deellast q over het liggerdeel (0;3)–(5;3)   → 5,0 m
//   puntlast F op x = 6,5 m (= 1,5 m links van B)
//
// Statisch bepaald: 2 scharnieropleggingen (4 reacties) − 3 evenwichts-
// vergelijkingen − 1 scharniervoorwaarde = 0. De krachtsverdeling is dus
// ONAFHANKELIJK van EI; de bron geeft geen profiel of materiaal.
//
// AANNAME (bron geeft dit niet): profiel IPE 500 / S235 voor alle vier de
// staven — gekozen omdat de reacties er toch niet van afhangen én het
// opgeslagen model dan realistische verplaatsingen toont. Variant [C] bewijst
// dat die keuze de reacties niet raakt door hetzelfde model met een volstrekt
// andere doorsnede (hout 200×400 C24, EI ruim 30× kleiner) door te rekenen.
//
// Draaien met: npx tsx referentie/toets-R05.mjs   (vanuit design-mockup/)
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Vergelijk met een referentiewaarde en druk de afwijking in procent af. */
const afwijkingen = [];
function vergelijk(naam, onze, referentie, eenheid, tolPct = 0.5) {
  const abs = onze - referentie;
  const pct = referentie === 0 ? (Math.abs(abs) < 1e-6 ? 0 : Infinity)
                               : (abs / Math.abs(referentie)) * 100;
  afwijkingen.push({ naam, onze, referentie, eenheid, pct });
  const ok = Math.abs(pct) <= tolPct;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(4)} ${eenheid} ` +
      `(ref ${referentie} ${eenheid}, Δ = ${abs >= 0 ? "+" : ""}${abs.toFixed(4)} ${eenheid} = ${pct >= 0 ? "+" : ""}${pct.toFixed(3)} %)`);
}

/** Eigen kruiscontrole (géén bronwaarde) — evenwicht, scharniermoment, etc. */
function controle(naam, onze, verwacht, eenheid, tolAbs) {
  const ok = Math.abs(onze - verwacht) <= tolAbs;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(6)} ${eenheid} (verwacht ${verwacht} ${eenheid})`);
}

// ── Modelbouw ──────────────────────────────────────────────────────────────
// Eenheden van het UI-model: mm voor geometrie, kN voor puntlasten,
// kN/m (= N/mm) voor lijnlasten, z positief omhoog.
const KNOPEN = [
  { id: 1, x: 0,    z: 0    },  // A — scharnieroplegging
  { id: 2, x: 0,    z: 3000 },  // linker hoekpunt (knie)
  { id: 3, x: 5000, z: 3000 },  // S — intern scharnier
  { id: 4, x: 8000, z: 3000 },  // rechter hoekpunt (knie)
  { id: 5, x: 8000, z: 0    },  // B — scharnieroplegging
];

/**
 * Staven. Het interne scharnier in S zit als buigscharnier (`startRy`) op het
 * begin van de rechter liggerhelft; knoop 3 verbindt alleen staaf 2 en 3, dus
 * momentevenwicht in S dwingt daarmee ook het staafeindmoment van staaf 2 op
 * nul. Variant [B] legt het scharnier op de ándere staaf en laat zien dat dat
 * exact hetzelfde geeft.
 */
const STAVEN = (materiaal, profiel) => [
  { id: 1, from: 1, to: 2, material: materiaal, profile: profiel },              // linker kolom
  { id: 2, from: 2, to: 3, material: materiaal, profile: profiel },              // ligger links van S (5,0 m)
  { id: 3, from: 3, to: 4, material: materiaal, profile: profiel,
    releases: { startRy: true } },                                               // ligger rechts van S (3,0 m)
  { id: 4, from: 4, to: 5, material: materiaal, profile: profiel },              // rechter kolom
];

const OPLEGGINGEN = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 5, type: "pinned" },
];

const BELASTINGGEVALLEN = [{ id: 1, name: "LG1 — deellast + puntlast", type: "other" }];

/**
 * Lasten.
 *  - Deellast 2,24 kN/m verticaal omlaag over het liggerdeel van 5,0 m: dat
 *    deel is in dit model precies staaf 2, dus een lijnlast over de volle
 *    staaflengte. Variant [D] brengt dezelfde last aan als twee ECHTE
 *    deellasten (fracties [0; 0,4] en [0,4; 1]) om het deellastpad te raken.
 *  - Puntlast 112 kN verticaal omlaag op x = 6,5 m: staafgebonden puntlast op
 *    staaf 3 met posFrac = (6500 − 5000)/3000 = 0,5. Variant [E] modelleert
 *    hem als knooplast op een extra knoop.
 */
const LASTEN = [
  { id: 1, type: "lineLoad",   caseId: 1, beamId: 2, q: -2.24 },
  { id: 2, type: "pointForce", caseId: 1, beamId: 3, posFrac: 0.5, fz: -112 },
];

function maakModel({ materiaal = "S235", profiel = "IPE500", lasten = LASTEN, staven } = {}) {
  return {
    nodes: KNOPEN,
    beams: staven ?? STAVEN(materiaal, profiel),
    supports: OPLEGGINGEN,
    plates: [],
    loadCases: BELASTINGGEVALLEN,
    loads: lasten,
    activeLoadCaseId: 1,
    selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
    nonlinearEnabled: false,    // eerste orde
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
}

function reken(model) {
  const r = solveAllCases(bouwMultiInput(model)).perCase.get(1);
  if (!r) throw new Error("solver gaf geen resultaat voor belastinggeval 1");
  return r;
}

// ── Model opslaan als projectbestand ───────────────────────────────────────
const model = maakModel();
mkdirSync(HIER, { recursive: true });
const projectTekst = serializeProject({
  nodes: model.nodes,
  beams: model.beams,
  supports: model.supports,
  plates: model.plates,
  loads: model.loads,
  loadCases: model.loadCases,
  activeLoadCaseId: model.activeLoadCaseId,
  selfWeightEnabled: model.selfWeightEnabled,
  nonlinearEnabled: model.nonlinearEnabled,
  scheefstandEnabled: model.scheefstandEnabled,
  scheefstandNoemer: model.scheefstandNoemer,
  scheefstandRichting: model.scheefstandRichting,
});
// .femp zoals in de campagne-afspraak; .ifcfem2d is de extensie die de
// bestandsdialoog van de app filtert — zelfde inhoud, zodat het model in
// beide gevallen te openen is.
writeFileSync(join(HIER, "R05.femp"), projectTekst, "utf8");
writeFileSync(join(HIER, "R05.ifcfem2d"), projectTekst, "utf8");
log(`Model opgeslagen: ${join(HIER, "R05.femp")} (+ .ifcfem2d)`);

// ── [A] Hoofdmodel: de vier referentiewaarden ──────────────────────────────
log("\n[A] Oplegreacties tegen de referentie (IPE 500 / S235)");
const rA = reken(model);
const RA = rA.reactions.get(1);
const RB = rA.reactions.get(5);

// Tekenafspraak van de solver: fx/fz zijn de krachten die de oplegging OP de
// constructie uitoefent, positief in +x (rechts) resp. +z (omhoog).
// De bron geeft grootten met een richting in woorden; omgezet:
//   Av 28,7 kN omhoog       → fz(A) = +28,7 kN
//   Ah 38,5 kN naar rechts  → fx(A) = +38,5 kN
//   Bv 94,5 kN omhoog       → fz(B) = +94,5 kN
//   Bh 38,5 kN naar links   → fx(B) = −38,5 kN
vergelijk("Av (verticaal in A, omhoog +)", RA.fz / 1000,  28.7, "kN");
vergelijk("Ah (horizontaal in A, rechts +)", RA.fx / 1000,  38.5, "kN");
vergelijk("Bv (verticaal in B, omhoog +)", RB.fz / 1000,  94.5, "kN");
vergelijk("Bh (horizontaal in B, rechts +)", RB.fx / 1000, -38.5, "kN");

// ── Eigen kruiscontroles (geen bronwaarden) ────────────────────────────────
log("\n    Eigen kruiscontroles op hetzelfde resultaat");
const Wq = 2.24 * 5.0;     // 11,2 kN totale deellast
const Wf = 112.0;          // puntlast
controle("ΣFz-reacties = totale belasting", (RA.fz + RB.fz) / 1000, Wq + Wf, "kN", 1e-6);
controle("ΣFx-reacties = 0", (RA.fx + RB.fx) / 1000, 0, "kN", 1e-6);
// Momentevenwicht om A: Bv·8 = 11,2·2,5 + 112·6,5 = 756 kNm.
controle("ΣM om A = 0", (RB.fz / 1000) * 8 - (Wq * 2.5 + Wf * 6.5), 0, "kNm", 1e-6);
// Scharniervoorwaarde: staafeindmoment links én rechts van S is nul.
const el2 = rA.elements.get(2), el3 = rA.elements.get(3);
controle("M in S, staaf 2 (einde)", el2.bendingMoment[20] / 1e6, 0, "kNm", 1e-6);
controle("M in S, staaf 3 (begin)", el3.bendingMoment[0] / 1e6, 0, "kNm", 1e-6);
// Handafleiding kniemomenten (eigen rekenwerk, niet uit de bron):
//   |M| in beide knieën = Ah · h = 38,5 · 3,0 = 115,5 kNm.
const el1 = rA.elements.get(1), el4 = rA.elements.get(4);
controle("|M| linker knie (top linker kolom)", Math.abs(el1.bendingMoment[20]) / 1e6, 115.5, "kNm", 1e-4);
controle("|M| rechter knie (top rechter kolom)", Math.abs(el4.bendingMoment[0]) / 1e6, 115.5, "kNm", 1e-4);

// Extra uitvoer die de bron NIET geeft — puur informatief, niet vergeleken.
log("\n    Aanvullende uitkomsten (bron geeft hier geen waarden voor)");
const maxAbs = (a) => a.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
log(`    M_max staaf 2 (ligger links van S): ${(maxAbs(el2.bendingMoment) / 1e6).toFixed(2)} kNm`);
log(`    M_max staaf 3 (ligger rechts van S): ${(maxAbs(el3.bendingMoment) / 1e6).toFixed(2)} kNm`);
log(`    N linker kolom: ${(el1.N / 1000).toFixed(2)} kN · N rechter kolom: ${(el4.N / 1000).toFixed(2)} kN`);
log(`    Grootste knoopverplaatsing: ${rA.maxDisplacement.toFixed(3)} mm (IPE 500; EI-afhankelijk, niet in de bron)`);

// ── [B] Scharnier op de andere staaf ───────────────────────────────────────
log("\n[B] Variant: intern scharnier als endRy op staaf 2 i.p.v. startRy op staaf 3");
{
  const staven = STAVEN("S235", "IPE500").map(b =>
    b.id === 2 ? { ...b, releases: { endRy: true } } :
    b.id === 3 ? { id: 3, from: 3, to: 4, material: "S235", profile: "IPE500" } : b);
  const r = reken(maakModel({ staven }));
  const a = r.reactions.get(1), b = r.reactions.get(5);
  controle("Av gelijk aan [A]", a.fz / 1000, RA.fz / 1000, "kN", 1e-6);
  controle("Ah gelijk aan [A]", a.fx / 1000, RA.fx / 1000, "kN", 1e-6);
  controle("Bv gelijk aan [A]", b.fz / 1000, RB.fz / 1000, "kN", 1e-6);
  controle("Bh gelijk aan [A]", b.fx / 1000, RB.fx / 1000, "kN", 1e-6);
}

// ── [C] Andere doorsnede: bewijst EI-onafhankelijkheid ─────────────────────
log("\n[C] Variant: hout C24 200×400 i.p.v. IPE 500 (statisch bepaald ⇒ zelfde reacties)");
{
  const r = reken(maakModel({ materiaal: "C24", profiel: "200x400" }));
  const a = r.reactions.get(1), b = r.reactions.get(5);
  vergelijk("Av met andere doorsnede", a.fz / 1000, 28.7, "kN");
  vergelijk("Ah met andere doorsnede", a.fx / 1000, 38.5, "kN");
  vergelijk("Bv met andere doorsnede", b.fz / 1000, 94.5, "kN");
  vergelijk("Bh met andere doorsnede", b.fx / 1000, -38.5, "kN");
}

// ── [D] Deellastpad: dezelfde last als twee partiële lijnlasten ────────────
log("\n[D] Variant: deellast gesplitst in fracties [0; 0,4] en [0,4; 1] van staaf 2");
{
  const lasten = [
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 2, q: -2.24, startFrac: 0,   endFrac: 0.4 },
    { id: 3, type: "lineLoad",   caseId: 1, beamId: 2, q: -2.24, startFrac: 0.4, endFrac: 1   },
    { id: 2, type: "pointForce", caseId: 1, beamId: 3, posFrac: 0.5, fz: -112 },
  ];
  const r = reken(maakModel({ lasten }));
  const a = r.reactions.get(1), b = r.reactions.get(5);
  controle("Av gelijk aan [A]", a.fz / 1000, RA.fz / 1000, "kN", 1e-6);
  controle("Ah gelijk aan [A]", a.fx / 1000, RA.fx / 1000, "kN", 1e-6);
  controle("Bv gelijk aan [A]", b.fz / 1000, RB.fz / 1000, "kN", 1e-6);
  controle("Bh gelijk aan [A]", b.fx / 1000, RB.fx / 1000, "kN", 1e-6);
}

// ── [E] Puntlast op een echte knoop i.p.v. staafgebonden ───────────────────
log("\n[E] Variant: extra knoop op x = 6,5 m, puntlast als knooplast");
{
  const knopen = [...KNOPEN, { id: 6, x: 6500, z: 3000 }];
  const staven = [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE500" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE500" },
    { id: 3, from: 3, to: 6, material: "S235", profile: "IPE500", releases: { startRy: true } },
    { id: 5, from: 6, to: 4, material: "S235", profile: "IPE500" },
    { id: 4, from: 4, to: 5, material: "S235", profile: "IPE500" },
  ];
  const lasten = [
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 2, q: -2.24 },
    { id: 2, type: "pointForce", caseId: 1, nodeId: 6, fz: -112 },
  ];
  const m = maakModel({ staven, lasten });
  m.nodes = knopen;
  const r = reken(m);
  const a = r.reactions.get(1), b = r.reactions.get(5);
  controle("Av gelijk aan [A]", a.fz / 1000, RA.fz / 1000, "kN", 1e-6);
  controle("Ah gelijk aan [A]", a.fx / 1000, RA.fx / 1000, "kN", 1e-6);
  controle("Bv gelijk aan [A]", b.fz / 1000, RB.fz / 1000, "kN", 1e-6);
  controle("Bh gelijk aan [A]", b.fx / 1000, RB.fx / 1000, "kN", 1e-6);
}

// ── [F] Roundtrip: het OPGESLAGEN bestand opnieuw inlezen en doorrekenen ───
// Bewijst dat R05.femp zelf het model bevat waarmee [A] gerekend is — niet
// alleen een object in dit script.
log("\n[F] Opgeslagen R05.femp weer inlezen en doorrekenen");
{
  const bestand = deserializeProject(readFileSync(join(HIER, "R05.femp"), "utf8"));
  const r = reken({
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
  });
  const a = r.reactions.get(1), b = r.reactions.get(5);
  controle("Av uit het bestand", a.fz / 1000, RA.fz / 1000, "kN", 1e-9);
  controle("Ah uit het bestand", a.fx / 1000, RA.fx / 1000, "kN", 1e-9);
  controle("Bv uit het bestand", b.fz / 1000, RB.fz / 1000, "kN", 1e-9);
  controle("Bh uit het bestand", b.fx / 1000, RB.fx / 1000, "kN", 1e-9);
}

// ── Samenvattende tabel ────────────────────────────────────────────────────
log("\n─── Vergelijking met de referentie ───────────────────────────────────");
log("  grootheid                              referentie      onze waarde      afwijking");
for (const a of afwijkingen) {
  log(`  ${a.naam.padEnd(36)} ${String(a.referentie).padStart(9)} ${a.eenheid}  ` +
      `${a.onze.toFixed(4).padStart(12)} ${a.eenheid}  ${(a.pct >= 0 ? "+" : "") + a.pct.toFixed(3)} %`);
}
const grootste = afwijkingen.reduce((m, a) => Math.max(m, Math.abs(a.pct)), 0);
log(`\n  Grootste afwijking: ${grootste.toFixed(4)} %`);

log(`\n═══ TOTAAL: ${passed} pass, ${failed} fail ═══`);
process.exit(failed > 0 ? 1 : 0);
