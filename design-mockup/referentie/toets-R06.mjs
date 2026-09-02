/**
 * toets-R06.mjs — validatiecampagne, geval R06.
 *
 * "Driehoekig raamwerk met roloplegging op de bovenregel."
 * Viervoudig statisch onbepaald raamwerk met niet-verplaatsbare knopen:
 * horizontale bovenregel DC en twee schuine staven AC en CB die in knoop C
 * momentvast samenkomen.
 *
 *   Bron: TU Delft, open onderwijssite Constructiemechanica 3 (CT2031),
 *   tentamen 14 april 2010, vraagstuk 2, met uitgewerkte antwoorden.
 *   Zie docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R06.
 *
 * GEOMETRIE (a = 2,0 m)
 *
 *      D(0;8) ──────── q = 10 kN/m ↓ ──────── C(6;8)   ← F = 40 kN ↓ in C
 *        △ (rol, alleen verticale steun)      ╱ ╲
 *                                            ╱   ╲
 *                                     AC=10 ╱     ╲ CB=10 m
 *                                          ╱       ╲
 *                                    A(0;0)         B(12;0)
 *                                    (inklemming)   (inklemming)
 *
 * BUIGSTIJFHEDEN (EI = 10 000 kN·m²)
 *   DC: 3EI  =  30 000 kN·m²
 *   AC: 5EI  =  50 000 kN·m²
 *   CB: 10EI = 100 000 kN·m²
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AANNAME DIE ER TOE DOET — NORMAALKRACHTVERVORMING
 *
 * De bron geeft ALLEEN buigstijfheden; de klassieke uitwerking (momenten-
 * verdeling met vergeet-mij-nietjes) verwaarloost de normaalkrachtvervorming
 * en gaat uit van niet-verplaatsbare knopen. Dat is te zien aan de antwoorden:
 * de puntlast F = 40 kN in C komt er NIET in voor. Terecht: als de staven
 * axiaal onvervormbaar zijn, gaat F rechtstreeks als normaalkracht naar A en B
 * en veroorzaakt hij geen enkel moment.
 *
 * Onze solver rekent WÉL met normaalkrachtvervorming (EA is eindig). Om de
 * aanname van de bron na te bootsen zijn de doorsneden zo gekozen dat EI exact
 * klopt en EA praktisch star is: rechthoeken b × h met h = 40 mm en een zeer
 * grote b. De verhouding EA·L²/EI is dan 2,7·10⁵ (DC) resp. 7,5·10⁵ (AC/CB),
 * waarmee de normaalkrachtvervorming < 0,06 % op de momenten scheelt.
 * Het zijn dus REKENDOORSNEDEN, geen bestaande profielen — de bron schrijft er
 * ook geen voor. Test [S] hieronder laat zien wat er gebeurt met werkelijke,
 * slanke doorsneden bij dezelfde EI.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ONAFHANKELIJKE HANDCONTROLE (derde partij naast bron en app)
 * Eén draaiende knoop (C); A en B ingeklemd, D een scharnierend staafeinde.
 * Momentenverdeling in één stap:
 *   stijfheden in C:  CD (verre eind scharnierend) 3·(3EI)/6 = 1,5EI
 *                     CA (verre eind ingeklemd)    4·(5EI)/10 = 2,0EI
 *                     CB (verre eind ingeklemd)    4·(10EI)/10 = 4,0EI   Σ = 7,5EI
 *   verdeelfactoren:  CD 0,2000   CA 0,26667   CB 0,53333
 *   inklemmingsmoment DC in C (verre eind scharnierend): q·l²/8 = 45 kN·m
 *   verdeling van de onbalans 45:  CD −9  CA −12  CB −24
 *   → M(DC bij C) = 45 − 9 = 36 ;  M(AC bij C) = −12 ;  M(CB bij C) = −24
 *   doorslag naar de inklemmingen (factor ½): A = −6 ;  B = −12
 * Dit is exact wat de bron als M1/M2/M3 en als M-lijn geeft.
 *
 * Draaien vanuit design-mockup:  npx tsx referentie/toets-R06.mjs
 */

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FEMP = join(HIER, "R06.femp");
// Tweelingbestand met de eigen extensie van de app (PROJECT_FILE_EXT), zodat
// het model ook via het open-dialoog van de app te kiezen is. Zelfde inhoud.
const FEMP_APP = join(HIER, "R06.ifcfem2d");

let geslaagd = 0, gezakt = 0;
const log = (s) => process.stdout.write(s + "\n");
const regels = [];

/**
 * Vergelijk één grootheid met de referentiewaarde uit het dossier.
 * `tolPct` is de tolerantie uit hoofdstuk 1.5 van het dossier: 1 % voor een
 * numerieke referentie, 2 % voor een uit de figuur afgelezen waarde.
 */
function vergelijk(naam, referentie, onze, tolPct) {
  const afw = referentie === 0 ? 0 : ((onze - referentie) / Math.abs(referentie)) * 100;
  const ok = Math.abs(afw) <= tolPct;
  if (ok) geslaagd++; else gezakt++;
  regels.push({ naam, referentie, onze, afw, tolPct, ok });
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(34)} ref ${referentie.toFixed(3).padStart(9)}  ` +
      `onze ${onze.toFixed(4).padStart(10)}  Δ ${afw.toFixed(3).padStart(8)} %  (tol ${tolPct} %)`);
  return afw;
}

function controle(naam, waarde, verwacht, absTol) {
  const ok = Math.abs(waarde - verwacht) <= absTol;
  if (ok) geslaagd++; else gezakt++;
  log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(34)} ${waarde.toFixed(6)} (verwacht ${verwacht})`);
}

// ── 1. Het model, in UI-eenheden (mm, kN, kN/m) ────────────────────────────
//
// Knoop-ids:  1 = A, 2 = B, 3 = C, 4 = D
// Staaf-ids:  1 = DC (4→3), 2 = AC (1→3), 3 = CB (3→2)
//
// Materiaal C22 heeft E_0,mean = 10 000 N/mm² (sectionResolver/EN 338), waardoor
// de vereiste traagheidsmomenten ronde getallen worden:
//   DC:  I = 30 000 kN·m² / 10 000 N/mm² =  3,0·10⁹ mm⁴  →  562 500 × 40
//   AC:  I = 50 000 / 10 000             =  5,0·10⁹ mm⁴  →  937 500 × 40
//   CB:  I = 100 000 / 10 000            = 10,0·10⁹ mm⁴  → 1 875 000 × 40
// (b·h³/12 met h = 40 mm; zie de toelichting over EA hierboven.)
const MODEL = {
  nodes: [
    { id: 1, x: 0,     z: 0    },   // A
    { id: 2, x: 12000, z: 0    },   // B
    { id: 3, x: 6000,  z: 8000 },   // C
    { id: 4, x: 0,     z: 8000 },   // D
  ],
  beams: [
    { id: 1, from: 4, to: 3, material: "C22", profile: "562500x40"  },  // DC,  3EI
    { id: 2, from: 1, to: 3, material: "C22", profile: "937500x40"  },  // AC,  5EI
    { id: 3, from: 3, to: 2, material: "C22", profile: "1875000x40" },  // CB, 10EI
  ],
  supports: [
    { nodeId: 1, type: "fixed"   },  // A volledig ingeklemd
    { nodeId: 2, type: "fixed"   },  // B volledig ingeklemd
    { nodeId: 4, type: "zRoller" },  // D roloplegging: alleen verticale steun
  ],
  plates: [],
  loads: [
    // q = 10 kN/m verticaal omlaag over de volle 6 m van DC.
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 1, q: -10, qDir: "z" },
    // F = 40 kN verticaal omlaag in knoop C.
    { id: 2, type: "pointForce", caseId: 1, nodeId: 3, fz: -40 },
  ],
  loadCases: [{ id: 1, name: "q + F", type: "other" }],
  activeLoadCaseId: 1,
  selfWeightEnabled: false,   // de bron rekent zonder eigen gewicht
  nonlinearEnabled: false,    // eerste orde
};

// ── 2. Opslaan als projectbestand en weer inlezen ──────────────────────────
// Het bestand is daarmee de bron van de berekening hieronder: wat in de app te
// openen is, is exact wat hier is doorgerekend.
const tekst = serializeProject(MODEL);
writeFileSync(FEMP, tekst, "utf8");
writeFileSync(FEMP_APP, tekst, "utf8");
const uitBestand = deserializeProject(readFileSync(FEMP, "utf8"));
log(`\nModel weggeschreven en teruggelezen: ${FEMP}`);
log(`Zelfde model met app-extensie:        ${FEMP_APP}`);

// ── 3. Doorrekenen via het gewone app-pad (model → MultiInput → solver) ────
const multi = bouwMultiInput({
  nodes: uitBestand.nodes,
  beams: uitBestand.beams,
  supports: uitBestand.supports,
  plates: uitBestand.plates,
  loadCases: uitBestand.loadCases,
  loads: uitBestand.loads,
  selfWeightEnabled: uitBestand.selfWeightEnabled,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
});
const res = solveAllCases(multi).perCase.get(1);

// Controle vooraf: zijn de buigstijfheden inderdaad 3EI / 5EI / 10EI?
log("\n[0] Doorsnedecontrole — EI per staaf (kN·m²)");
for (const [id, verwacht] of [[1, 30000], [2, 50000], [3, 100000]]) {
  const b = uitBestand.beams.find((x) => x.id === id);
  const sec = resolveSection(b.material, b.profile);
  const EI = (sec.E * sec.I) / 1e9;         // N·mm² → kN·m²
  const EAL2_EI = (sec.E * sec.A) * (id === 1 ? 6000 : 10000) ** 2 / (sec.E * sec.I);
  controle(`staaf ${id} EI`, EI, verwacht, 1e-6);
  log(`      EA·L²/EI = ${EAL2_EI.toExponential(2)}  (hoe hoger, hoe starder axiaal)`);
}

// ── 4. Snedekrachten uitlezen ─────────────────────────────────────────────
//
// TEKENAFSPRAAK. De solver levert per staaf 21 stations met M(x) in de
// zakkings-positieve conventie (bendingMoment[0] bij de from-knoop,
// bendingMoment[20] bij de to-knoop). De bron geeft STAAFEINDMOMENTEN in de
// knoopevenwichts-conventie: het moment dat de staaf op de knoop uitoefent,
// zodat de drie momenten in knoop C optellen tot nul (M1 + M2 + M3 = 0).
// Omrekening (afgeleid uit de oplegreacties, zie test [E] hieronder):
//   staafeinde = from-knoop  →  moment op de knoop = +bendingMoment[0]
//   staafeinde = to-knoop    →  moment op de knoop = −bendingMoment[20]
const DC = res.elements.get(1);   // 4 → 3, dus C is de to-knoop
const AC = res.elements.get(2);   // 1 → 3, dus C is de to-knoop
const CB = res.elements.get(3);   // 3 → 2, dus C is de from-knoop
const kNm = (v) => v / 1e6;       // N·mm → kN·m

const M1 = -kNm(AC.bendingMoment[20]);   // staafeindmoment AC bij C
const M2 =  kNm(CB.bendingMoment[0]);    // staafeindmoment CB bij C
const M3 = -kNm(DC.bendingMoment[20]);   // staafeindmoment DC bij C

const M_A = kNm(AC.bendingMoment[0]);    // veldmoment-conventie bij A
const M_B = kNm(CB.bendingMoment[20]);   // idem bij B
const M_D = kNm(DC.bendingMoment[0]);    // moet 0 zijn (roloplegging)
const M_veld = kNm(DC.bendingMoment[10]);// station 10/20 = x = 3,0 m = midden DC
// Het "parabooldeel" is de pijl van de parabool ten opzichte van de
// sluitlijn tussen beide staafeindmomenten van DC.
const parabool = M_veld - (M_D + kNm(DC.bendingMoment[20])) / 2;

// ── 5. Vergelijking met de referentiewaarden uit het dossier ──────────────
log("\n[R06] Vergelijking met de referentiewaarden");
log("  ── staafeindmomenten in knoop C (knoopevenwichts-conventie) ──");
const afw = [];
afw.push(vergelijk("M1 — AC bij C (kN·m)",        -12.0, M1, 1));
afw.push(vergelijk("M2 — CB bij C (kN·m)",        -24.0, M2, 1));
afw.push(vergelijk("M3 — DC bij C (kN·m)",         36.0, M3, 1));
log("  ── momentenlijn ──");
// De bron tekent de inklemmingsmomenten als absolute waarden in de M-lijn;
// wij vergelijken daarom de grootte. Ons teken (trekzijde) staat erachter.
afw.push(vergelijk("|M| inklemming A (kN·m)",       6.0, Math.abs(M_A), 2));
afw.push(vergelijk("|M| inklemming B (kN·m)",      12.0, Math.abs(M_B), 2));
afw.push(vergelijk("parabooldeel DC (kN·m)",       45.0, parabool, 1));
afw.push(vergelijk("netto veldmoment DC (kN·m)",   27.0, M_veld, 1));
log(`  (tekens bij ons: M_A = ${M_A.toFixed(4)} kN·m, M_B = ${M_B.toFixed(4)} kN·m ` +
    `— zakkings-positieve conventie, dus beide een trekzijde aan de buitenkant)`);

const grootste = Math.max(...afw.map((a) => Math.abs(a)));
log(`\n  Grootste afwijking over de 7 referentiewaarden: ${grootste.toFixed(3)} %`);

// ── 6. Interne controles (niet in de bron, wel bewijs dat het model klopt) ─
log("\n[E] Evenwichts- en modelcontroles");
controle("M1 + M2 + M3 in knoop C = 0", M1 + M2 + M3, 0, 1e-3);
controle("M bij D = 0 (roloplegging)", M_D, 0, 1e-6);

const rA = res.reactions.get(1), rB = res.reactions.get(2), rD = res.reactions.get(4);
const sumFz = (rA.fz + rB.fz + rD.fz) / 1000;   // N → kN
const sumFx = (rA.fx + rB.fx + rD.fx) / 1000;
controle("ΣFz reacties = q·6 + F = 100 kN", sumFz, 100, 1e-3);
controle("ΣFx reacties = 0 kN", sumFx, 0, 1e-3);
// Momentenevenwicht van het geheel om A (x naar rechts, z omhoog, M linksom +):
//   ΣM_A = Σ(x·Fz − z·Fx) van de reacties − momenten van de belasting
//   belasting: q op DC (60 kN op x = 3 m) + F (40 kN op x = 6 m), beide omlaag
const M_A_tot =
  (0 * rA.fz - 8000 * 0) / 1e6 +                       // reactie A grijpt in A aan
  (12000 * rB.fz) / 1e6 + (0 * rD.fz) / 1e6 +
  (rA.my + rB.my + rD.my) / 1e6 -
  (3000 * 60000) / 1e6 - (6000 * 40000) / 1e6;
controle("ΣM om A = 0 (kN·m)", M_A_tot, 0, 1e-3);
// Reactie in D: uit de M-lijn van DC volgt V_D = q·l/2 − M(C)/l = 30 − 6 = 24 kN.
controle("verticale reactie in D = 24 kN", rD.fz / 1000, 24, 0.05);
// Bewijs voor de tekenomrekening in stap 4: het inklemmingsmoment dat de
// oplegging levert is precies tegengesteld aan het moment dat de staaf op de
// knoop uitoefent.
controle("reactie-my in A = −(moment staaf op knoop A)", rA.my / 1e6, -M_A, 1e-6);
controle("reactie-my in B = −(moment staaf op knoop B)", rB.my / 1e6, M_B, 1e-6);

// ── 7. Gevoeligheid voor de normaalkrachtvervorming ───────────────────────
//
// Dezelfde EI, maar nu met SLANKE, realistische doorsneden (h = 600 mm, dus
// b = 167 / 278 / 556 mm — plausibele gelamineerde balken). De momenten
// veranderen dan wél, omdat F = 40 kN de schuine staven indrukt en knoop C
// laat zakken. Dit is geen fout: het is het verschil tussen de klassieke
// aanname van de bron en een berekening mét normaalkrachtvervorming.
log("\n[S] Gevoeligheid: dezelfde EI, maar realistisch slanke doorsneden");
{
  const H = 600;
  const bVoor = (I) => (12 * I) / (H * H * H);
  const slank = {
    ...MODEL,
    beams: [
      { id: 1, from: 4, to: 3, material: "C22", profile: `${bVoor(3.0e9).toFixed(4)}x${H}` },
      { id: 2, from: 1, to: 3, material: "C22", profile: `${bVoor(5.0e9).toFixed(4)}x${H}` },
      { id: 3, from: 3, to: 2, material: "C22", profile: `${bVoor(1.0e10).toFixed(4)}x${H}` },
    ],
  };
  const m2 = bouwMultiInput({
    nodes: slank.nodes, beams: slank.beams, supports: slank.supports,
    plates: [], loadCases: slank.loadCases, loads: slank.loads,
    selfWeightEnabled: false, scheefstandEnabled: false,
    scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const r2 = solveAllCases(m2).perCase.get(1);
  const s1 = -kNm(r2.elements.get(2).bendingMoment[20]);
  const s2 =  kNm(r2.elements.get(3).bendingMoment[0]);
  const s3 = -kNm(r2.elements.get(1).bendingMoment[20]);
  const sA =  kNm(r2.elements.get(2).bendingMoment[0]);
  const sB =  kNm(r2.elements.get(3).bendingMoment[20]);
  const toon = (n, ref, v) =>
    log(`     ${n.padEnd(22)} ${v.toFixed(3).padStart(9)} kN·m  ` +
        `(bron ${ref.toFixed(1)} → ${(((v - ref) / Math.abs(ref)) * 100).toFixed(1)} %)`);
  log(`     doorsneden: ${slank.beams.map((b) => b.profile).join(", ")} mm`);
  toon("M1 — AC bij C", -12, s1);
  toon("M2 — CB bij C", -24, s2);
  toon("M3 — DC bij C",  36, s3);
  toon("M bij A",        -6, sA);
  toon("M bij B",        12, sB);
  log("     → de puntlast F = 40 kN doet hier wél mee; met axiaal starre staven");
  log("       (de aanname van de bron) verdwijnt dit verschil volledig.");
}

// ── 7b. De axiaal starre limiet ───────────────────────────────────────────
//
// Bewijs dat de resterende 0,0x % in stap 5 volledig op het rekening van de
// eindige EA komt en niet op die van de solver: dezelfde EI, maar met een
// duizendmaal grotere A (rechtstreeks via de solver-invoer, buiten de
// profielnamen om). De referentiewaarden komen er dan exact uit.
log("\n[L] Axiaal starre limiet (A × 1000) — de aanname van de bron, tot de bodem");
{
  const grof = { ...multi, beams: multi.beams.map((b) => ({ ...b, A: b.A * 1000 })) };
  const rL = solveAllCases(grof).perCase.get(1);
  const lim = {
    "M1 — AC bij C": [-12, -kNm(rL.elements.get(2).bendingMoment[20])],
    "M2 — CB bij C": [-24,  kNm(rL.elements.get(3).bendingMoment[0])],
    "M3 — DC bij C": [ 36, -kNm(rL.elements.get(1).bendingMoment[20])],
    "M bij A":       [ -6,  kNm(rL.elements.get(2).bendingMoment[0])],
    "M bij B":       [ 12,  kNm(rL.elements.get(3).bendingMoment[20])],
    "veldmoment DC": [ 27,  kNm(rL.elements.get(1).bendingMoment[10])],
  };
  for (const [naam, [ref, v]] of Object.entries(lim)) {
    const d = ((v - ref) / Math.abs(ref)) * 100;
    log(`     ${naam.padEnd(16)} ${v.toFixed(6).padStart(12)} kN·m   Δ ${d.toFixed(5).padStart(9)} %`);
  }
  log("     → de afwijking gaat naar nul: de solver reproduceert de klassieke");
  log("       oplossing exact zodra de normaalkrachtvervorming wegvalt.");
}

// ── 8. Samenvatting ───────────────────────────────────────────────────────
log("\n─── SAMENVATTING R06 ───");
for (const r of regels) {
  log(`  ${r.ok ? "OK  " : "AFW "} ${r.naam.padEnd(34)} ref ${String(r.referentie).padStart(7)}  ` +
      `onze ${r.onze.toFixed(4).padStart(10)}  Δ ${r.afw.toFixed(3).padStart(7)} %`);
}
log(`\n═══ ${geslaagd} geslaagd, ${gezakt} gezakt — grootste afwijking ${grootste.toFixed(3)} % ═══`);
process.exit(gezakt > 0 ? 1 : 0);
