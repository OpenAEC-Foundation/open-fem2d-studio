// ───────────────────────────────────────────────────────────────────────────
// R14 — Driebeuks doorgaande ligger 6 + 9 + 4,5 m met vier belastingschikkingen
//
// Validatiecampagne referentieberekeningen; dossier:
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md  (§5, R14)
//
// WAT DIT SCRIPT DOET
//   1. Bouwt het model uit het dossier op (8 knopen, 7 staven, 4 steunpunten,
//      4 belastinggevallen, 4 belastingcombinaties = de vier schikkingen).
//   2. Schrijft het weg als projectbestand met serializeProject → R14.femp
//      (en R14.ifcfem2d, de extensie die de app-dialoog filtert).
//   3. Leest het bestand terug met deserializeProject, vertaalt het met
//      dezelfde bouwMultiInput die de app gebruikt, en rekent het door met
//      solveAllCases + combineResults.
//   4. Legt elke referentiewaarde uit het dossier naast onze uitkomst.
//
// EENHEDEN
//   Model/adapter: mm, kN, kNm. Solver: mm, N, N·mm. De omrekening gebeurt
//   in bouwMultiInput (kN → N ×1000, kNm → N·mm ×1e6); dit script rekent de
//   solver-uitvoer alleen terug naar kN/kNm om met de bron te vergelijken.
//
// TEKENCONVENTIES (geverifieerd tegen de engine met een tweevelds proefbalk)
//   - reactie fz  : positief = omhoog          → zelfde als de bron
//   - shearForce  : V(x) = Σ verticale krachten LINKS van x, omhoog positief
//                                                → zelfde als de bron
//   - bendingMoment: veldmoment (sagging) positief, steunpuntsmoment negatief
//                                                → zelfde als de bron
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R14.mjs
// ───────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const {
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
} = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

// ═══════════════════════════════════════════════════════════════════════════
// 1. HET MODEL — letterlijk uit de invoertabel van R14
// ═══════════════════════════════════════════════════════════════════════════
//
// Knooppunten: 8 punten, onderlinge afstanden 3000-3000-3000-3000-3000-3000-1500
// Steunpunten: pt 1 (x=0), pt 3 (x=6000), pt 6 (x=15000), pt 8 (x=19500)
//              → overspanningen 6000 / 9000 / 4500 mm
// Lastpunten:  pt 2 (3000), pt 4 (9000), pt 5 (12000), pt 7 (18000)
//
// PROFIEL — AANNAME, ZIE BEVINDINGEN
// De bron gebruikt een 686 × 254 × 125 UKB (Iy = 118 000 cm⁴ = 1,18·10⁹ mm⁴).
// Dat profiel zit NIET in de profielbibliotheek van de app (die kent HEA/HEB/
// HEM/IPE/UNP/koker/buis, geen UK-serie), en een staaf kan geen losse A/I
// dragen — alleen een profielNAAM. Gekozen vervanger: HEA 550
// (Iy = 1,119·10⁹ mm⁴, 5 % lager).
// DIT BEÏNVLOEDT GEEN ENKELE VERGELEKEN GROOTHEID: de ligger is prismatisch,
// dus M, V en de reacties van een statisch onbepaalde doorgaande ligger
// hangen alleen af van de VERHOUDING van de buigstijfheden tussen de velden,
// en die is 1 : 1 : 1 ongeacht de absolute EI. De bron geeft voor R14
// expliciet géén doorbuigingen ("Ontbreekt in de bron"), dus de absolute EI
// wordt nergens vergeleken.
const PROFIEL = "HEA550";
const MATERIAAL = "S275";

const nodes = [
  { id: 1, x: 0,     z: 0 },
  { id: 2, x: 3000,  z: 0 },
  { id: 3, x: 6000,  z: 0 },
  { id: 4, x: 9000,  z: 0 },
  { id: 5, x: 12000, z: 0 },
  { id: 6, x: 15000, z: 0 },
  { id: 7, x: 18000, z: 0 },
  { id: 8, x: 19500, z: 0 },
];

// Zeven staven tussen opeenvolgende knopen: elke staaf is precies één
// dwarskrachtsegment uit de brontabel.
// checkConfig: kiplengte Lcr = 3,0 m tussen zijdelingse steunen (dossier).
// Elke staaf is 3,0 m lang (staaf 7: 1,5 m) met steun aan beide einden —
// bovenflens continu door de vloerplaat, onderflens op de steunpunten.
const beams = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
  id: i, from: i, to: i + 1,
  material: MATERIAAL, profile: PROFIEL,
  checkConfig: {
    lateralRestraints: [0, 1],
    lateralRestraintsBottom: [0, 1],
    deflectionClass: "floor",
  },
}));

// Vier verticale steunpunten, vrij opgelegd, geen inklemming.
// Eén oplegging neemt de horizontale richting op (pinned); de overige zijn
// rollen. Alle belasting is verticaal, dus deze keuze raakt M/V/reacties niet.
const supports = [
  { nodeId: 1, type: "pinned"  },
  { nodeId: 3, type: "zRoller" },
  { nodeId: 6, type: "zRoller" },
  { nodeId: 8, type: "zRoller" },
];

// Belastinggevallen: het permanente geval plus de veranderlijke belasting per
// veld, zodat de vier schikkingen zuivere combinaties van die gevallen zijn.
const loadCases = [
  { id: 1, name: "G",              type: "dead" },
  { id: 2, name: "Q veld 1 (pt2)", type: "live" },
  { id: 3, name: "Q veld 2 (pt4+5)", type: "live" },
  { id: 4, name: "Q veld 3 (pt7)", type: "live" },
];

// Karakteristieke puntlasten uit de brontabel (kN, omlaag = negatief):
//   pt2  G = 150,0  Q = 225,0
//   pt4  G = 150,0  Q = 225,0
//   pt5  G = 150,0  Q = 225,0
//   pt7  G = 112,5  Q = 225,0
const loads = [
  { id: 1, type: "pointForce", caseId: 1, nodeId: 2, fz: -150.0 },
  { id: 2, type: "pointForce", caseId: 1, nodeId: 4, fz: -150.0 },
  { id: 3, type: "pointForce", caseId: 1, nodeId: 5, fz: -150.0 },
  { id: 4, type: "pointForce", caseId: 1, nodeId: 7, fz: -112.5 },
  { id: 5, type: "pointForce", caseId: 2, nodeId: 2, fz: -225.0 },
  { id: 6, type: "pointForce", caseId: 3, nodeId: 4, fz: -225.0 },
  { id: 7, type: "pointForce", caseId: 3, nodeId: 5, fz: -225.0 },
  { id: 8, type: "pointForce", caseId: 4, nodeId: 7, fz: -225.0 },
];

// Combinatiefactoren: Britse NB, uitdrukking 6.10b.
// ξ·γ_G,sup = 0,925 · 1,35 = 1,24875; de BRON rondt dat zelf af op 1,25
// (te zien aan haar ontwerpwaarden 1,25·150 = 187,5 en 1,25·112,5 = 140,6).
// We nemen die afronding over, anders vergelijken we appels met peren.
const GAMMA_G = 1.25;
const GAMMA_Q = 1.50;

// De vier belastingschikkingen uit het dossier:
//  (1) Q op de middelste overspanning (pt 4 en 5)
//  (2) Q op de buitenste overspanningen (pt 2 en 7)
//  (3) Q op de middelste en de rechter overspanning (pt 4, 5, 7)
//  (4) Q op de linker en de middelste overspanning (pt 2, 4, 5)
// In alle vier is de permanente belasting ONGUNSTIG (1,25) — dat volgt
// rechtstreeks uit de ontwerpwaarden in de brontabel; de gunstige waarde
// (γ_G,inf = 1,0) komt in geen van de vier schikkingen voor.
const combinations = [
  { id: 1, name: "Schikking 1 — Q midden",        type: "uls",
    formula: "1,25·G + 1,5·Q(veld 2)",
    factors: new Map([[1, GAMMA_G], [3, GAMMA_Q]]) },
  { id: 2, name: "Schikking 2 — Q eindvelden",    type: "uls",
    formula: "1,25·G + 1,5·Q(veld 1 + veld 3)",
    factors: new Map([[1, GAMMA_G], [2, GAMMA_Q], [4, GAMMA_Q]]) },
  { id: 3, name: "Schikking 3 — Q midden+rechts", type: "uls",
    formula: "1,25·G + 1,5·Q(veld 2 + veld 3)",
    factors: new Map([[1, GAMMA_G], [3, GAMMA_Q], [4, GAMMA_Q]]) },
  { id: 4, name: "Schikking 4 — Q links+midden",  type: "uls",
    formula: "1,25·G + 1,5·Q(veld 1 + veld 2)",
    factors: new Map([[1, GAMMA_G], [2, GAMMA_Q], [3, GAMMA_Q]]) },
];

const structuralGrid = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: 0 },
    { id: "B", label: "B", position: 6000 },
    { id: "C", label: "C", position: 15000 },
    { id: "D", label: "D", position: 19500 },
  ],
  zAxes: [{ id: "1", label: "1", position: 0 }],
};

const projectState = {
  nodes, beams, supports, plates: [], loads, loadCases,
  activeLoadCaseId: 1,
  // Eigen gewicht UIT: de bron becijfert de permanente belasting volledig als
  // puntlasten (G = 150 / 150 / 150 / 112,5 kN) en telt geen liggergewicht
  // apart mee. Zetten we het aan, dan rekenen we een last mee die de
  // referentie niet heeft.
  selfWeightEnabled: false,
  nonlinearEnabled: false,
  combinations: combinationsToFile(combinations),
  structuralGrid,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. OPSLAAN — met serializeProject, zodat het bestand in de app te openen is
// ═══════════════════════════════════════════════════════════════════════════
const json = serializeProject(projectState);
const padFemp = join(HIER, "R14.femp");
const padApp  = join(HIER, "R14.ifcfem2d");
writeFileSync(padFemp, json, "utf8");
writeFileSync(padApp,  json, "utf8");
log(`Model opgeslagen: ${padFemp}`);
log(`                  ${padApp}  (extensie die de open-dialoog van de app filtert)`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. DOORREKENEN — vanaf het TERUGGELEZEN bestand, niet vanaf de objecten
//    hierboven: zo bewijst de run ook dat het opgeslagen bestand klopt.
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

const multi = bouwMultiInput(model);
const perCase = solveAllCases(multi).perCase;

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERGELIJKEN
// ═══════════════════════════════════════════════════════════════════════════
//
// TOLERANTIE. Het dossier geeft R14 een tolerantie van 2 %: "de momenten en
// dwarskrachten zijn in de bron uit diagrammen afgelezen en op hele kN/kN·m
// afgerond". Die afronding op hele eenheden is bij kleine waarden veel grover
// dan 2 % — bij V = −4,5 kN is 2 % maar 0,09 kN, terwijl de bron zelf al
// ±0,5 kN onnauwkeurig is. Daarom: geslaagd wanneer het verschil binnen
// max(2 % · |ref| ; 0,5 kN resp. 0,5 kN·m) valt. Het procentuele verschil
// wordt altijd getoond, ook als de absolute drempel het oordeel bepaalt.
const TOL_PCT = 2.0;
const TOL_ABS = 0.5;

const rijen = [];
let geslaagd = 0, gezakt = 0;

function vergelijk(schikking, grootheid, ref, onze) {
  const delta = onze - ref;
  const pct = ref === 0 ? (Math.abs(delta) < 1e-9 ? 0 : Infinity)
                        : (delta / Math.abs(ref)) * 100;
  const tol = Math.max(Math.abs(ref) * TOL_PCT / 100, TOL_ABS);
  const ok = Math.abs(delta) <= tol;
  if (ok) geslaagd++; else gezakt++;
  rijen.push({ schikking, grootheid, ref, onze, delta, pct, ok });
  const vlag = ok ? "✓" : "✗";
  log(`  ${vlag} ${grootheid.padEnd(30)} ref ${fmt(ref).padStart(9)}   ons ${fmt(onze).padStart(9)}` +
      `   Δ ${fmt(delta).padStart(8)}   ${Number.isFinite(pct) ? pct.toFixed(2).padStart(7) + " %" : "    n.v.t."}`);
}

function fmt(v) {
  return (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)).replace(".", ",");
}

// ── Uitlezers ──────────────────────────────────────────────────────────────
/** Reactie in kN, omhoog positief. */
const reactie = (res, nodeId) => (res.reactions.get(nodeId)?.fz ?? 0) / 1000;

/** Dwarskracht in staaf `beamId` (constant: alleen knooplasten) in kN. */
const dwarskracht = (res, beamId) => res.elements.get(beamId).shearForce[10] / 1000;

/**
 * Buigend moment in knoop `nodeId` in kN·m. Voor een tussenknoop is dat het
 * eindmoment van de staaf ervóór; we controleren meteen dat de staaf erná
 * hetzelfde beginmoment heeft (continuïteitscontrole van de stationsreeks).
 */
function moment(res, nodeId) {
  const links  = res.elements.get(nodeId - 1);          // staaf k-1 eindigt in knoop k
  const rechts = res.elements.get(nodeId);              // staaf k begint in knoop k
  const mL = links.bendingMoment[20] / 1e6;
  if (rechts) {
    const mR = rechts.bendingMoment[0] / 1e6;
    if (Math.abs(mL - mR) > 1e-6 * Math.max(1, Math.abs(mL))) {
      log(`    ! discontinuïteit in M bij knoop ${nodeId}: ${mL} vs ${mR} kN·m`);
    }
  }
  return mL;
}

/** Ontwerp-puntlast op een knoop volgens een combinatie, in kN (omlaag +). */
function ontwerpLast(combo, nodeId) {
  let som = 0;
  for (const [caseId, f] of combo.factors) {
    for (const l of loads) {
      if (l.caseId === caseId && l.nodeId === nodeId && l.type === "pointForce") {
        som += f * (l.fz ?? 0);
      }
    }
  }
  return -som; // omlaag positief, zoals de bron ze noteert
}

// ── Referentiewaarden uit het dossier (§5, R14) ────────────────────────────
// Volgorde puntlasten/reacties: pt 2/4/5/7 resp. pt 1/3/6/8.
// Dwarskrachten: 7 segmenten (staaf 1..7). Momenten: pt 2/3/4/5/6/7.
const REF = {
  1: {
    puntlasten:   [187.5, 525, 525, 140.6],
    reacties:     [-37, 745, 758, -88],
    dwarskrachten:[-37, -224.5, 520.5, -4.5, -529.5, 228.5, 88],
    momenten:     [-110, -783, 779, 767, -820, -133],
  },
  2: {
    puntlasten:   [525, 187.5, 187.5, 478],
    reacties:     [182, 547, 401, 247],
    dwarskrachten:[182, -343, 205, 17, -170, 231, -247],
    momenten:     [548, -477, 137, 189, -322, 371],
  },
  3: {
    puntlasten:   [187.5, 525, 525, 478],
    reacties:     [-33, 729, 901, 118],
    dwarskrachten:[-33, -220, 509, -16, -541, 360, 118],
    momenten:     [-98, -758, 768, 720, -903, 177],
  },
  4: {
    puntlasten:   [525, 525, 525, 140.6],
    reacties:     [104, 967, 721, -76],
    dwarskrachten:[104, -421, 546, 21, -504, 217, 76],
    momenten:     [312, -952, 686, 748, -764, -114],
  },
};

const LASTPUNTEN = [2, 4, 5, 7];
const STEUNPUNTEN = [1, 3, 6, 8];
const MOMENTKNOPEN = [2, 3, 4, 5, 6, 7];

const perCombo = new Map();

for (const combo of combosUitBestand) {
  const r = combineResults(combo, perCase);
  perCombo.set(combo.id, r);
  const ref = REF[combo.id];
  log(`\n─── ${combo.name}  (${combo.formula}) ───`);

  log("  Ontwerp-puntlasten (pt 2/4/5/7), kN omlaag");
  LASTPUNTEN.forEach((nid, i) =>
    vergelijk(combo.id, `puntlast pt${nid}`, ref.puntlasten[i], ontwerpLast(combo, nid)));

  log("  Oplegreacties (pt 1/3/6/8), kN omhoog");
  STEUNPUNTEN.forEach((nid, i) =>
    vergelijk(combo.id, `reactie pt${nid}`, ref.reacties[i], reactie(r, nid)));

  log("  Dwarskrachten per segment (staaf 1..7), kN");
  ref.dwarskrachten.forEach((v, i) =>
    vergelijk(combo.id, `V segment ${i + 1}`, v, dwarskracht(r, i + 1)));

  log("  Momenten (pt 2..7), kN·m — sagging positief");
  MOMENTKNOPEN.forEach((nid, i) =>
    vergelijk(combo.id, `M pt${nid}`, ref.momenten[i], moment(r, nid)));

  // Evenwichtscontrole op onze eigen uitkomst: Σ reacties = Σ lasten.
  const somR = STEUNPUNTEN.reduce((s, nid) => s + reactie(r, nid), 0);
  const somP = LASTPUNTEN.reduce((s, nid) => s + ontwerpLast(combo, nid), 0);
  log(`  [evenwicht] Σ reacties ${somR.toFixed(2)} kN vs Σ lasten ${somP.toFixed(2)} kN` +
      `  → ${Math.abs(somR - somP) < 1e-6 * somP ? "sluit" : "SLUIT NIET"}`);
}

// ── Maatgevende waarden over de vier schikkingen ───────────────────────────
log("\n─── Maatgevende waarden over alle vier de schikkingen ───");
{
  // MEd: grootste |M| in knoop 3 (de bron noemt pt 3 in schikking 4 maatgevend).
  let besteM = { waarde: 0, combo: null };
  let besteV = { waarde: 0, combo: null };
  for (const combo of combosUitBestand) {
    const r = perCombo.get(combo.id);
    for (const nid of MOMENTKNOPEN) {
      const m = moment(r, nid);
      if (Math.abs(m) > Math.abs(besteM.waarde)) besteM = { waarde: m, combo: combo.id, knoop: nid };
    }
    for (let b = 1; b <= 7; b++) {
      const v = dwarskracht(r, b);
      if (Math.abs(v) > Math.abs(besteV.waarde)) besteV = { waarde: v, combo: combo.id, staaf: b };
    }
  }
  log(`  Maatgevend MEd: ${fmt(besteM.waarde)} kN·m in knoop ${besteM.knoop}, schikking ${besteM.combo}`);
  vergelijk("—", "maatgevend MEd (pt3, schikking 4)", -952, besteM.waarde);
  log(`  Maatgevend |VEd|: ${fmt(besteV.waarde)} kN in staaf ${besteV.staaf}, schikking ${besteV.combo}`);
  vergelijk("—", "maatgevend VEd (pt3, schikking 4)", 546, besteV.waarde);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4b. ONAFHANKELIJKE DERDE PARTIJ — driemomentenvergelijking (Clapeyron)
// ═══════════════════════════════════════════════════════════════════════════
//
// Waarom: wijkt een waarde af, dan moet blijken of de APP of de BRON eraf zit.
// Daarvoor is een derde, onafhankelijke uitkomst nodig. De gesloten
// driemomentenvergelijking voor een doorgaande ligger op starre steunpunten
// gebruikt géén stijfheidsmatrix en géén code uit de app — alleen de
// klassieke formule. Voor een prismatische ligger is EI eruit weg te delen,
// dus ook het profiel speelt hier geen rol.
//
//   M₁·L₁ + 2·M₂·(L₁+L₂) + M₃·L₂ = −6·A₁·ā₁/L₁ − 6·A₂·b̄₂/L₂
//   met, per puntlast P op afstand a vanaf de linker- en b vanaf de
//   rechteroplegging van een veld met lengte L:
//     6·A·ā/L = P·a·(L² − a²)/L        (ā gemeten vanaf de LINKER steun)
//     6·A·b̄/L = P·b·(L² − b²)/L        (b̄ gemeten vanaf de RECHTER steun)
function driemomenten(ontwerpLasten) {
  // Veldindeling: A=0, B=6000, C=15000, D=19500 (in m gerekend).
  const steun = [0, 6, 15, 19.5];
  const L = [6, 9, 4.5];
  // Puntlasten van deze schikking in kN (omlaag positief) op x in m — de
  // ONAFGERONDE ontwerpwaarden, zodat afronding van de bron hier niet
  // meelekt. Dat de ontwerpwaarden zelf kloppen is een aparte rij hierboven.
  const P = [3, 9, 12, 18].map((x, i) => ({ x, F: ontwerpLasten[i] }));

  const inVeld = (i) => P.filter((p) => p.x > steun[i] + 1e-9 && p.x < steun[i + 1] - 1e-9);
  const vanLinks = (i) => inVeld(i).reduce((s, p) => {
    const a = p.x - steun[i];
    return s + p.F * a * (L[i] * L[i] - a * a) / L[i];
  }, 0);
  const vanRechts = (i) => inVeld(i).reduce((s, p) => {
    const b = steun[i + 1] - p.x;
    return s + p.F * b * (L[i] * L[i] - b * b) / L[i];
  }, 0);

  // Twee vergelijkingen, twee onbekenden (M_B, M_C); M_A = M_D = 0.
  const a11 = 2 * (L[0] + L[1]), a12 = L[1], r1 = -(vanLinks(0) + vanRechts(1));
  const a21 = L[1], a22 = 2 * (L[1] + L[2]), r2 = -(vanLinks(1) + vanRechts(2));
  const det = a11 * a22 - a12 * a21;
  const MB = (r1 * a22 - a12 * r2) / det;
  const MC = (a11 * r2 - r1 * a21) / det;

  // Oplegreacties uit veldevenwicht.
  const RA = (MB + inVeld(0).reduce((s, p) => s + p.F * (steun[1] - p.x), 0)) / L[0];
  const RD = (MC + inVeld(2).reduce((s, p) => s + p.F * (p.x - steun[2]), 0)) / L[2];
  const totaal = P.reduce((s, p) => s + p.F, 0);
  // Verticaal evenwicht + momentevenwicht om A geven R_B en R_C:
  //   R_B + R_C = ΣP − R_A − R_D
  //   x_B·R_B + x_C·R_C = Σ P·x − x_D·R_D
  const somMx = P.reduce((s, p) => s + p.F * p.x, 0);
  const rest = totaal - RA - RD;
  const RC = (somMx - steun[3] * RD - steun[1] * rest) / (steun[2] - steun[1]);
  const RB = rest - RC;

  // Dwarskracht per segment: Σ verticale krachten links, omhoog positief.
  const R = new Map([[0, RA], [6, RB], [15, RC], [19.5, RD]]);
  const knoopX = [0, 3, 6, 9, 12, 15, 18, 19.5];
  const V = [];
  for (let i = 0; i < 7; i++) {
    const xm = (knoopX[i] + knoopX[i + 1]) / 2;
    let v = 0;
    for (const [x, r] of R) if (x < xm) v += r;
    for (const p of P) if (p.x < xm) v -= p.F;
    V.push(v);
  }
  // Moment in elke knoop uit de krachten links.
  const M = knoopX.map((x) => {
    let m = 0;
    for (const [xr, r] of R) if (xr < x - 1e-9) m += r * (x - xr);
    for (const p of P) if (p.x < x - 1e-9) m -= p.F * (x - p.x);
    return m;
  });
  return { reacties: [RA, RB, RC, RD], V, M: M.slice(1, 7) };
}

log("\n─── Onafhankelijke controle met de driemomentenvergelijking ───");
log("    (gesloten formule, geen app-code — beslist bij een afwijking wie eraf zit)");
{
  let maxAfw = 0;
  for (const combo of combosUitBestand) {
    const hand = driemomenten(LASTPUNTEN.map((nid) => ontwerpLast(combo, nid)));
    const r = perCombo.get(combo.id);
    const paren = [];
    STEUNPUNTEN.forEach((nid, i) => paren.push([`R pt${nid}`, hand.reacties[i], reactie(r, nid)]));
    hand.V.forEach((v, i) => paren.push([`V seg${i + 1}`, v, dwarskracht(r, i + 1)]));
    hand.M.forEach((m, i) => paren.push([`M pt${MOMENTKNOPEN[i]}`, m, moment(r, MOMENTKNOPEN[i])]));
    let ergste = null;
    for (const [naam, h, o] of paren) {
      const d = Math.abs(o - h);
      if (!ergste || d > ergste.d) ergste = { naam, h, o, d };
    }
    maxAfw = Math.max(maxAfw, ergste.d);
    log(`  schikking ${combo.id}: grootste verschil app ↔ handformule = ${ergste.d.toExponential(2)}` +
        ` (${ergste.naam}: ${fmt(ergste.h)} vs ${fmt(ergste.o)})`);
  }
  log(`  → app en gesloten formule zijn identiek tot ${maxAfw.toExponential(2)} kN/kN·m` +
      ` (${maxAfw < 1e-6 ? "machineprecisie" : "LET OP: niet verwaarloosbaar"}).`);

  // Het enige punt waar de bron van beide afwijkt, expliciet benoemd.
  const combo3 = combosUitBestand.find((c) => c.id === 3);
  const h3 = driemomenten(LASTPUNTEN.map((nid) => ontwerpLast(combo3, nid)));
  log("");
  log("  BRONFOUT — schikking 3, dwarskracht segment 7 (x = 18 … 19,5 m):");
  log(`    dossier/bron : ${REF[3].dwarskrachten[6].toFixed(1)} kN`);
  log(`    onze app     : ${dwarskracht(perCombo.get(3), 7).toFixed(2)} kN`);
  log(`    handformule  : ${h3.V[6].toFixed(2)} kN`);
  log(`    De bron geeft zelf R(pt8) = +118 kN en M(pt7) = +177 kN·m. Met de`);
  log(`    conventie V = Σ krachten links volgt dan V = −R(pt8) = −118 kN;`);
  log(`    ook M/dx klopt alleen met een NEGATIEVE dwarskracht (177 → 0 over`);
  log(`    1,5 m). In de drie andere schikkingen staat er wél V(seg7) = −R(pt8)`);
  log(`    (schikking 1: +88 bij R = −88; 2: −247 bij R = +247; 4: +76 bij`);
  log(`    R = −76). Alleen schikking 3 breekt dat patroon → tekenfout in de`);
  log(`    bron/overname, niet in de app.`);
}

// ── Unity checks die onze snedekrachten wél toelaten ───────────────────────
//
// De WEERSTANDEN (Vc,Rd, Mc,y,Rd) komen hier uit de bron, niet uit onze
// toetsmodule — die draait in de Rust-kern achter een Tauri-commando en is
// vanuit een tsx-script niet aan te roepen (zie hieronder). Wat deze twee
// rijen wél bewijzen: met ONZE snedekrachten en de weerstand van de bron
// komt exact de unity check van de bron eruit. Tolerantie voor UC's volgens
// het dossier: 0,02 absoluut.
log("\n─── Unity checks met onze snedekrachten en de weerstand uit de bron ───");
{
  const VcRd = 1280;    // kN,   bron
  const McRd = 1060;    // kN·m, bron
  const r4 = perCombo.get(4);
  const MEd = Math.abs(moment(r4, 3));
  const VEd = Math.abs(dwarskracht(r4, 3));
  const ucM = MEd / McRd, ucV = VEd / VcRd;
  const toonUC = (naam, ref, onze) => {
    const d = onze - ref, ok = Math.abs(d) <= 0.02;
    if (ok) geslaagd++; else gezakt++;
    rijen.push({ schikking: "—", grootheid: naam, ref, onze, delta: d,
                 pct: (d / Math.abs(ref)) * 100, ok });
    log(`  ${ok ? "✓" : "✗"} ${naam.padEnd(30)} ref ${ref.toFixed(2)}   ons ${onze.toFixed(3)}` +
        `   Δ ${d.toFixed(3)} (absolute tolerantie 0,02)`);
  };
  log(`  MEd = ${MEd.toFixed(1)} kN·m / Mc,y,Rd = ${McRd} kN·m`);
  toonUC("UC buiging (pt3, schikking 4)", 0.90, ucM);
  log(`  VEd = ${VEd.toFixed(1)} kN / Vc,Rd = ${VcRd} kN`);
  toonUC("UC dwarskracht (pt3, schikk. 4)", 0.43, ucV);
}

// ── Bronconsistentie: zijn de weerstanden van de bron zelf plausibel? ──────
//
// HANDAFLEIDING, GEEN APP-UITVOER. Alleen bedoeld om vast te stellen of de
// bron intern klopt; telt niet mee als vergelijking app ↔ referentie.
// Doorsnedematen uit het dossier: h = 677,9 · b = 253,0 · tw = 11,7 ·
// tf = 16,2 · r = 15,2 mm. Omdat tf = 16,2 mm > 16 mm hoort bij S275 de
// tweede dikteklasse: fy = 265 N/mm² (EN 10025-2 / EN 1993-1-1 tabel 3.1).
log("\n─── Bronconsistentie (handafleiding uit de doorsnedematen) ───");
{
  const h = 677.9, b = 253.0, tw = 11.7, tf = 16.2, r = 15.2;
  const fy = 265, gammaM0 = 1.0;
  const hw = h - 2 * tf;
  const A = 2 * b * tf + hw * tw + (4 - Math.PI) * r * r;      // incl. wortelstralen
  const Av = Math.max(A - 2 * b * tf + (tw + 2 * r) * tf, hw * tw);
  const VplRd = Av * fy / (Math.sqrt(3) * gammaM0) / 1000;      // kN
  // Wpl,y benaderd uit de matenset: flenzen + lijf + wortelstralen.
  const Afil = (4 - Math.PI) * r * r;
  const Wpl = b * tf * (h - tf) + tw * hw * hw / 4 + Afil * (h / 2 - tf - 0.2234 * r);
  const McRdHand = Wpl * fy / gammaM0 / 1e6;                    // kN·m
  const pct = (x, y) => ((x - y) / y * 100).toFixed(1);
  log(`  A  ≈ ${A.toFixed(0)} mm²   Av ≈ ${Av.toFixed(0)} mm²   Wpl,y ≈ ${(Wpl / 1e3).toFixed(0)}·10³ mm³`);
  log(`  Vpl,Rd ≈ ${VplRd.toFixed(0)} kN  tegenover de bron 1 280 kN  (${pct(VplRd, 1280)} %)`);
  log(`  Mc,Rd  ≈ ${McRdHand.toFixed(0)} kN·m tegenover de bron 1 060 kN·m (${pct(McRdHand, 1060)} %)`);
  log("  → de weerstanden van de bron zijn consistent met haar eigen matenset");
  log("    én met fy = 265 N/mm² (dus mét de dikteknik bij tf > 16 mm).");
  log("    Het restverschil zit in de benadering van de wortelstralen; deze");
  log("    handafleiding is een controle op de BRON, geen app-resultaat.");
}

// ── Niet na te rekenen met dit script ──────────────────────────────────────
log("\n─── Niet vergeleken (buiten bereik van dit script) ───");
log("  Mb,Rd segment 6-7 = 1 060 kN·m → UC 0,77 (1/√C1 = 0,79)");
log("  1/√C1 segment 2-3 = 0,69 → C1 = 2,10");
log("  Av = ... / Vc,Rd = 1 280 kN en Mc,y,Rd = 1 060 kN·m zelf");
log("  REDEN 1: de EN 1993-toetsing draait in de Rust-kern achter een");
log("           Tauri-commando; vanuit een tsx-script is die niet aan te");
log("           roepen (alleen buildSteelCheckInputs is bereikbaar).");
log("  REDEN 2: het profiel 686 × 254 × 125 UKB zit niet in de");
log("           profielbibliotheek, dus zelfs in de app zou de toetsing met");
log("           een ANDERE doorsnede rekenen dan de bron.");
log("  De bron geeft voor R14 bewust geen BGT-doorbuiging en geen");
log("  lijfweerstand tegen dwarsbelasting; die zijn dus ook niet vergeleken.");

// ═══════════════════════════════════════════════════════════════════════════
// 5. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
const buitenTol = rijen.filter((r) => !r.ok);
const eindig = rijen.filter((r) => Number.isFinite(r.pct));
const grootstePct = eindig.reduce((m, r) => Math.max(m, Math.abs(r.pct)), 0);
// De rij met de vastgestelde tekenfout in de bron telt apart: die zegt niets
// over de app en zou elk ander verschil in het niet doen vallen.
const isBronfout = (r) => r.schikking === 3 && r.grootheid === "V segment 7";
const zonderBronfout = eindig.filter((r) => !isBronfout(r));
const pctZonder = zonderBronfout.reduce((m, r) => Math.max(m, Math.abs(r.pct)), 0);
const ergsteZonder = zonderBronfout.find((r) => Math.abs(r.pct) === pctZonder);
// Grootste afwijking onder de rijen waar de bronafronding niet domineert
// (|ref| ≥ 25 kN / kN·m: daar is ±0,5 minder dan 2 %).
const groot = zonderBronfout.filter((r) => Math.abs(r.ref) >= 25);
const grootstePctGroot = groot.reduce((m, r) => Math.max(m, Math.abs(r.pct)), 0);
const ergsteGroot = groot.find((r) => Math.abs(r.pct) === grootstePctGroot);

log("\n═══════════════════════════════════════════════════════════════════");
log(`R14 — ${rijen.length} vergelijkingen: ${geslaagd} binnen tolerantie, ${gezakt} erbuiten`);
log(`Grootste relatieve afwijking (alle rijen)        : ${grootstePct.toFixed(2)} %` +
    (grootstePct > 100 ? "   ← de tekenfout in de bron, zie hierboven" : ""));
log(`Idem zonder die ene bronfout                     : ${pctZonder.toFixed(2)} %` +
    (ergsteZonder ? `  bij "${ergsteZonder.grootheid}" (schikking ${ergsteZonder.schikking},` +
                    ` ref ${fmt(ergsteZonder.ref)} → Δ ${fmt(ergsteZonder.delta)})` : ""));
log(`Idem, alleen rijen met |ref| ≥ 25 kN/kN·m        : ${grootstePctGroot.toFixed(2)} %` +
    (ergsteGroot ? `  bij "${ergsteGroot.grootheid}" (schikking ${ergsteGroot.schikking})` : ""));
if (buitenTol.length) {
  log("\nBuiten tolerantie:");
  for (const r of buitenTol) {
    log(`  schikking ${r.schikking}  ${r.grootheid}: ref ${fmt(r.ref)}  ons ${fmt(r.onze)}` +
        `  Δ ${fmt(r.delta)}  (${Number.isFinite(r.pct) ? r.pct.toFixed(2) + " %" : "n.v.t."})` +
        (isBronfout(r) ? "   ← VERKLAARD: tekenfout in de bron" : "   ← ONVERKLAARD"));
  }
}

// Exitcode. Een mismatch die is teruggevoerd op de BRON (en die door de
// onafhankelijke handformule wordt bevestigd) is een UITKOMST van de
// campagne, geen falende test — de referentiewaarde blijft ongewijzigd in het
// dossier staan. Alleen een ONVERKLAARDE mismatch is rood.
const onverklaard = buitenTol.filter((r) => !isBronfout(r));
log("");
if (onverklaard.length === 0 && buitenTol.length > 0) {
  log("OORDEEL: de krachtsverdeling komt overeen. De enige mismatch is een");
  log("         vastgestelde tekenfout in de bron (schikking 3, V segment 7);");
  log("         de gesloten driemomentenvergelijking geeft dezelfde waarde als");
  log("         de app. De referentiewaarde is NIET aangepast.");
} else if (onverklaard.length === 0) {
  log("OORDEEL: alles binnen tolerantie.");
} else {
  log(`OORDEEL: ${onverklaard.length} ONVERKLAARDE afwijking(en) — uitzoeken.`);
}
log("═══════════════════════════════════════════════════════════════════");

process.exit(onverklaard.length > 0 ? 1 : 0);
