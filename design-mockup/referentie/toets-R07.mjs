// ═══════════════════════════════════════════════════════════════════════════
// R07 — Ongeschoord geknikt raamwerk met twee rolopleggingen
//
// Validatiecampagne referentieberekeningen, geval R07 uit
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Dit script:
//   1. bouwt het model op zoals de invoertabel van R07 het voorschrijft;
//   2. schrijft het weg als referentie/R07.femp (serializeProject), zodat het
//      in de app te openen is;
//   3. rekent het door via EXACT dezelfde route als de app
//      (bouwMultiInput → solveAllCases), dus inclusief de vertaling
//      materiaal/profiel → E, A, I;
//   4. legt elke referentiewaarde uit het dossier naast onze uitkomst, met de
//      afwijking in procent.
//
// Draaien vanuit design-mockup:   npx tsx referentie/toets-R07.mjs
//
// ── HET SYSTEEM ───────────────────────────────────────────────────────────
//   a = 1,5 m
//   A (0; 0)  ·  B (0; 4,5)  ·  C (6; 4,5)  ·  D (12; 4,5)      [m]
//   AB = kolom 4,5 m (EI) · BC = regel 6,0 m (EI) · CD = regel 6,0 m (2EI)
//   EI = 100 000 kNm²
//   A scharnier · C en D rolopleggingen (alleen verticale steun)
//   B en C momentvast; D is een vrij (momentloos) staafeinde op een rol.
//   q1 = 64 kN/m horizontaal op AB, naar de constructie toe  → +x
//   F  = 50 kN horizontaal in B, zelfde richting             → +x
//   q2 = 45 kN/m verticaal omlaag op BC (NIET op CD)         → −z
//
// ── ONAFHANKELIJKE HANDCONTROLE VAN DE BRON (krachtenmethode) ─────────────
// Het systeem is 1× statisch onbepaald (4 oplegreacties, 3 evenwichts-
// vergelijkingen). Met DV als statisch overtollige is alles met de hand na
// te rekenen; dat is hieronder gedaan vóórdat de solver werd aangeroepen.
//
//   Evenwicht (onafhankelijk van de stijfheid):
//     ΣFx : AH = −(64·4,5 + 50) = −338 kN            → AH = 338 kN naar −x
//     M_B (uit de kolom, onder de knoop):
//           M_B = 338·4,5 − 64·4,5²/2 = 1521 − 648 = 873 kNm
//     M_B hangt NIET van de overtollige af (de eenheidsstaat geeft M̄=0 in de
//     kolom en M̄(B)=0 in de regel), dus M_B = 873 kNm is exact.
//
//   Grondsysteem (DV losgelaten):  AV0 = −10,5 kN ; CV0 = 280,5 kN
//     M0(u) op BC, u vanaf B:  M0 = 873 − 10,5u − 22,5u²   (M0(C) = 0)
//     M0 = 0 op CD.
//   Eenheidsstaat X = 1 ↑ in D:  AV1 = 1 ; CV1 = −2 ; AH1 = 0
//     M1(u) op BC = u ;  M1(s) op CD = s (s vanaf D) ;  M1 = 0 in de kolom.
//
//     δ10 = (1/EI)∫₀⁶ (873 − 10,5u − 22,5u²)·u du
//         = (1/EI)[873·18 − 3,5·216 − 5,625·1296] = 7668/EI
//     f11 = (1/EI)∫₀⁶ u² du + (1/2EI)∫₀⁶ s² ds = (72 + 36)/EI = 108/EI
//     X   = −δ10/f11 = −7668/108 = −71,0 kN      → DV = 71 kN OMLAAG
//
//   Daaruit:
//     M_C = 6·X = −426 kNm            (grootte 426 kNm)   ✓ bron
//     CV  = 280,5 + (−71)·(−2) = 422,5 kN ↑               ✓ bron
//     AV  = −10,5 + (−71)·1    = −81,5 kN → 81,5 kN ↓     ✓ bron
//
//   Verplaatsing van B (arbeidsvergelijking, eenheidskracht 1 → +x in B op
//   hetzelfde grondsysteem: AH̄ = −1, AV̄ = −0,75, CV̄ = +0,75):
//     kolom : M̄ = y            , M = 338y − 32y²          (y = 0…4,5)
//     BC    : M̄ = 4,5 − 0,75u  , M = 873 − 81,5u − 22,5u² (u = 0…6)
//     CD    : M̄ = 0
//     δ_B = (1/EI)[6986,25 + 7762,5] = 14 748,75/EI
//         = 14 748,75 / 100 000 = 0,1474875 m
//     θ   = δ_B / 4,5 = 0,0327750 rad                      ✓ bron (exact)
//
//   V-lijn (uit dezelfde M-verlopen, V = dM/ds):
//     kolom : V(A) = 338 kN, V(B) = 338 − 64·4,5 = 50 kN
//     BC    : V(B) = 81,5 kN, V(C) = 81,5 + 45·6 = 351,5 kN
//     CD    : V = 71 kN constant
//   → 81,5 / 50 / 351,5 / 71 / 338 kN                      ✓ bron
//
// CONCLUSIE VAN DE HANDCONTROLE: alle negen referentiewaarden van R07 zijn
// onderling consistent én reproduceerbaar. De bron bevat hier geen zetfout.
//
// ── AANNAMES BIJ HET NABOUWEN ─────────────────────────────────────────────
// 1. Normaalkrachtvervorming is in de handberekening verwaarloosd (dossier).
//    De app kent geen "EA = ∞"-schakelaar, dus is EA kunstmatig groot
//    gemaakt: doorsnede 15000 × 200 mm (AB, BC) resp. 30000 × 200 mm (CD).
//    Die maten zijn NIET willekeurig — ze zijn zo gekozen dat E·I exact de
//    voorgeschreven buigstijfheid oplevert (zie hieronder) en E·A tegelijk
//    zó groot is dat de axiale verkorting van de kolom 0,012 mm bedraagt
//    (0,008 % van de horizontale verplaatsing). Het script toont onderaan de
//    gevoeligheid voor deze aanname expliciet.
// 2. De app leidt E, A en I af uit (materiaal, profiel); een directe
//    EI-invoer bestaat niet. Materiaal C22 heeft E₀,mean = 10 000 N/mm²
//    (sectionResolver.TIMBER_E_MEAN), en voor een rechthoek b×h geldt
//    I = b·h³/12. Dus:
//      AB, BC:  15000 × 200 → I = 15000·200³/12 = 1,0·10¹⁰ mm⁴
//               EI = 10 000 · 1,0e10 = 1,0e14 N·mm² = 100 000 kNm²   ✓ EI
//      CD:      30000 × 200 → I = 2,0·10¹⁰ mm⁴
//               EI = 2,0e14 N·mm² = 200 000 kNm²                     ✓ 2EI
//    De doorsnedematen zijn dus een REKENTRUC om de voorgeschreven EI in het
//    bestand te krijgen, geen constructieve keuze.
// 3. Eigen gewicht en scheefstand staan uit; eerste orde.
// 4. Tekens: de bron geeft alleen groottes (in de uitwerking wordt MB eerst
//    als −873 gevonden en daarna van teken gedraaid). Er wordt daarom op
//    ABSOLUTE waarde vergeleken; de tekens van onze solver staan er apart bij.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ── 1. Het model ──────────────────────────────────────────────────────────
// Knopen in mm, z omhoog positief (modelassen van de app).
const nodes = [
  { id: 1, x: 0,     z: 0    },  // A
  { id: 2, x: 0,     z: 4500 },  // B
  { id: 3, x: 6000,  z: 4500 },  // C
  { id: 4, x: 12000, z: 4500 },  // D
];

// Zie aanname 2: C22 (E = 10 000 N/mm²) + rechthoek → exact EI resp. 2EI.
const PROF_EI  = "15000x200";   // I = 1,0e10 mm⁴ → EI  = 100 000 kNm²
const PROF_2EI = "30000x200";   // I = 2,0e10 mm⁴ → 2EI = 200 000 kNm²

const beams = [
  { id: 1, from: 1, to: 2, material: "C22", profile: PROF_EI  },  // AB kolom
  { id: 2, from: 2, to: 3, material: "C22", profile: PROF_EI  },  // BC regel
  { id: 3, from: 3, to: 4, material: "C22", profile: PROF_2EI },  // CD regel
];

const supports = [
  { nodeId: 1, type: "pinned"  },  // A scharnier
  { nodeId: 3, type: "zRoller" },  // C rol: alleen verticale steun
  { nodeId: 4, type: "zRoller" },  // D rol: alleen verticale steun
];

const loadCases = [{ id: 1, name: "Referentiebelasting R07", type: "other" }];

const loads = [
  // q1 = 64 kN/m horizontaal op de kolom, naar de constructie toe (+x).
  { id: 1, type: "lineLoad",   caseId: 1, beamId: 1, q: 64, qDir: "x" },
  // F = 50 kN horizontale puntlast in B, zelfde richting (+x).
  { id: 2, type: "pointForce", caseId: 1, nodeId: 2, fx: 50, fz: 0 },
  // q2 = 45 kN/m verticaal omlaag op BC (niet op CD).
  { id: 3, type: "lineLoad",   caseId: 1, beamId: 2, q: -45 },
];

const modelState = {
  nodes, beams, supports, plates: [], loads, loadCases,
  activeLoadCaseId: 1,
  selfWeightEnabled: false,
  nonlinearEnabled: false,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
  structuralGrid: {
    enabled: true,
    xAxes: [
      { id: "A", label: "A", position: 0 },
      { id: "B", label: "B", position: 6000 },
      { id: "C", label: "C", position: 12000 },
    ],
    zAxes: [
      { id: "1", label: "1", position: 0 },
      { id: "2", label: "2", position: 4500 },
    ],
  },
};

// ── 2. Opslaan ────────────────────────────────────────────────────────────
// Twee keer dezelfde inhoud: .femp zoals de campagne het vraagt, en
// .ifcfem2d omdat DAT de extensie is waarop het open-dialoog van de app
// filtert (projectFile.PROJECT_FILE_EXT). Een .femp is met de hand ook te
// openen, maar staat niet in de bestandsfilter.
const projectText = serializeProject(modelState);
for (const naam of ["R07.femp", "R07.ifcfem2d"]) {
  const pad = join(HIER, naam);
  writeFileSync(pad, projectText, "utf8");
  log(`Model opgeslagen: ${pad}`);
}

// ── 3. Doorrekenen via de app-route (bestand → model → solver) ────────────
// Bewust NIET het zojuist opgebouwde object, maar het TERUGGELEZEN bestand:
// zo wordt ook gecontroleerd dat het opgeslagen model hetzelfde oplevert.
const uitBestand = deserializeProject(projectText);
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
const r = solveAllCases(multi).perCase.get(1);
if (!r) throw new Error("Geen resultaat voor belastinggeval 1");

// Controle dat de doorsnede-afleiding inderdaad de voorgeschreven EI geeft.
log("\nDoorsnede-afleiding (materiaal/profiel → E·I):");
for (const b of multi.beams) {
  log(`  staaf ${b.id}: E=${b.E} N/mm² · I=${b.I.toExponential(4)} mm⁴ · ` +
      `A=${b.A.toExponential(3)} mm² → EI = ${(b.E * b.I / 1e9).toFixed(1)} kNm²`);
}

// ── Uitlezen ──────────────────────────────────────────────────────────────
const el = (id) => r.elements.get(id);
const kNm = (Nmm) => Nmm / 1e6;
const kN  = (N)   => N / 1000;

const AB = el(1), BC = el(2), CD = el(3);

const M_B_kolom = kNm(AB.bendingMoment[20]);          // kolomtop
const M_B_regel = kNm(BC.bendingMoment[0]);           // regelbegin
const M_C_regel = kNm(BC.bendingMoment[20]);          // BC bij C
const M_C_CD    = kNm(CD.bendingMoment[0]);           // CD bij C
const M_D       = kNm(CD.bendingMoment[20]);          // moet 0 zijn

const rA = r.reactions.get(1), rC = r.reactions.get(3), rD = r.reactions.get(4);
const AH = kN(rA.fx), AV = kN(rA.fz), CV = kN(rC.fz), DV = kN(rD.fz);

const uB_mm    = r.displacements.get(2).ux;
const uB_m     = uB_mm / 1000;
const theta    = uB_mm / 4500;                        // mechanismerotatie kolom

const V_A  = kN(AB.shearForce[0]);                    // kolomvoet
const V_Bk = kN(AB.shearForce[20]);                   // kolomtop
const V_Br = kN(BC.shearForce[0]);                    // regel bij B
const V_Cr = kN(BC.shearForce[20]);                   // regel bij C
const V_CD = kN(CD.shearForce[10]);                   // CD (constant)

// ── 4. Vergelijking met het dossier ───────────────────────────────────────
const rijen = [];
let maxAfw = 0;

function vergelijk(naam, referentie, onze, eenheid, opAbs = true) {
  const ref = opAbs ? Math.abs(referentie) : referentie;
  const ons = opAbs ? Math.abs(onze) : onze;
  const afw = ref === 0 ? (Math.abs(ons) < 1e-6 ? 0 : Infinity)
                        : ((ons - ref) / Math.abs(ref)) * 100;
  if (Number.isFinite(afw)) maxAfw = Math.max(maxAfw, Math.abs(afw));
  rijen.push({ naam, ref, ons, eenheid, afw });
}

vergelijk("MB",                        873,        M_B_kolom, "kNm");
vergelijk("MB (via regel BC)",         873,        M_B_regel, "kNm");
vergelijk("MC",                        426,        M_C_regel, "kNm");
vergelijk("MC (via regel CD)",         426,        M_C_CD,    "kNm");
vergelijk("Mechanismerotatie theta",   0.0327750,  theta,     "rad");
vergelijk("Horizontale verplaatsing B", 0.147,     uB_m,      "m");
vergelijk("AV",                        81.5,       AV,        "kN");
vergelijk("AH",                        338.0,      AH,        "kN");
vergelijk("CV",                        422.5,      CV,        "kN");
vergelijk("DV",                        71.0,       DV,        "kN");
vergelijk("V-lijn: regel BC bij B",    81.5,       V_Br,      "kN");
vergelijk("V-lijn: kolom bij B",       50.0,       V_Bk,      "kN");
vergelijk("V-lijn: regel BC bij C",    351.5,      V_Cr,      "kN");
vergelijk("V-lijn: staaf CD",          71.0,       V_CD,      "kN");
vergelijk("V-lijn: kolom bij A",       338.0,      V_A,       "kN");

log("\n╔══════════════════════════════════════════════════════════════════════════╗");
log("║ R07 — vergelijking met het dossier (op absolute waarde, zie aanname 4)  ║");
log("╚══════════════════════════════════════════════════════════════════════════╝");
log(`${"grootheid".padEnd(30)}${"referentie".padStart(13)}${"onze waarde".padStart(15)}` +
    `${"afwijking".padStart(12)}`);
log("─".repeat(70));
for (const rj of rijen) {
  const fmt = (v) => Math.abs(v) < 1 ? v.toFixed(7) : v.toFixed(3);
  log(`${rj.naam.padEnd(30)}${fmt(rj.ref).padStart(13)}${fmt(rj.ons).padStart(15)}` +
      `${(rj.afw.toFixed(3) + " %").padStart(12)}`);
}
log("─".repeat(70));
log(`Grootste afwijking: ${maxAfw.toFixed(3)} %`);

// ── Tekens van onze solver (bron geeft alleen groottes) ───────────────────
log("\nTekens/richtingen zoals onze solver ze geeft:");
log(`  M kolomtop B      = ${M_B_kolom.toFixed(2)} kNm   (regel BC bij B: ${M_B_regel.toFixed(2)} kNm)`);
log(`  M knoop C          = ${M_C_regel.toFixed(2)} kNm  (via CD: ${M_C_CD.toFixed(2)} kNm)`);
log(`  M knoop D          = ${M_D.toFixed(6)} kNm   (moet 0 zijn: vrij staafeinde op rol)`);
log(`  Reactie A          : fx = ${AH.toFixed(2)} kN (−x)  fz = ${AV.toFixed(2)} kN (omlaag)`);
log(`  Reactie C          : fz = ${CV.toFixed(2)} kN (omhoog)`);
log(`  Reactie D          : fz = ${DV.toFixed(2)} kN (omlaag)`);
log(`  Verplaatsing B     : ux = ${uB_mm.toFixed(3)} mm   uz = ${r.displacements.get(2).uz.toFixed(4)} mm`);

// ── Evenwichtscontroles (onafhankelijk van de bron) ───────────────────────
const sFx = AH + 64 * 4.5 + 50;
const sFz = AV + CV + DV - 45 * 6;
// Momentevenwicht om A, tegen de klok in positief.
const sM  = 6 * CV + 12 * DV - (2.25 * (64 * 4.5) + 4.5 * 50 + 3 * (45 * 6));
log("\nEvenwichtscontrole van ONZE uitkomst (moet ≈ 0 zijn):");
log(`  ΣFx = ${sFx.toExponential(2)} kN`);
log(`  ΣFz = ${sFz.toExponential(2)} kN`);
log(`  ΣM(A) = ${sM.toExponential(2)} kNm`);

// ── Gevoeligheid voor aanname 1 (normaalkrachtvervorming) ─────────────────
// Zelfde model, maar met een 1000× grotere A: als de uitkomst niet verandert,
// is de aanname "EA groot genoeg om normaalkrachtvervorming te verwaarlozen"
// gerechtvaardigd.
const stijf = solve({
  nodes,
  beams: multi.beams.map((b) => ({ ...b, A: b.A * 1000 })),
  supports,
  loads: [
    { beamId: 1, q: 64, qDir: "x" },
    { beamId: 2, q: -45 },
  ],
  pointLoads: [{ nodeId: 2, fx: 50000, fz: 0 }],
});
const uB_stijf = stijf.displacements.get(2).ux;
const MB_stijf = kNm(stijf.elements.get(1).bendingMoment[20]);
const DV_stijf = kN(stijf.reactions.get(4).fz);
log("\nGevoeligheid voor de EA-aanname (A × 1000, dus EA praktisch oneindig):");
log(`  ux(B): ${uB_mm.toFixed(4)} → ${uB_stijf.toFixed(4)} mm ` +
    `(${(((uB_stijf - uB_mm) / uB_mm) * 100).toFixed(4)} %)`);
log(`  MB   : ${M_B_kolom.toFixed(4)} → ${MB_stijf.toFixed(4)} kNm ` +
    `(${(((MB_stijf - M_B_kolom) / M_B_kolom) * 100).toFixed(4)} %)`);
log(`  DV   : ${DV.toFixed(4)} → ${DV_stijf.toFixed(4)} kN ` +
    `(${(((DV_stijf - DV) / DV) * 100).toFixed(4)} %)`);

// ── Oordeel ───────────────────────────────────────────────────────────────
// Tolerantie: de bron is een uitgewerkt tentamenantwoord met exacte breuken
// (873, 426, 81,5, 338, 422,5, 71 kN en θ = 0,0327750 rad zijn EXACT), op één
// na: de horizontale verplaatsing is op 3 decimalen afgerond gepubliceerd
// (0,147 m t.o.v. de exacte 0,1474875 m → 0,33 % puur door afronding).
log("");
if (maxAfw <= 0.5) {
  log(`✅ Alle grootheden binnen 0,5 % (grootste ${maxAfw.toFixed(3)} %). ` +
      `De enige niet-nul afwijking is de afronding van de gepubliceerde u_B.`);
} else {
  log(`⚠️  Grootste afwijking ${maxAfw.toFixed(3)} % — uitzoeken volgens de campagne-volgorde.`);
}
process.exit(maxAfw <= 0.5 ? 0 : 1);
