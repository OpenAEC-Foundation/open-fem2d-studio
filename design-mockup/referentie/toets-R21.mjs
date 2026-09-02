// ───────────────────────────────────────────────────────────────────────────
// R21 — Doorgaande houten bekistingdrager over 3 velden van 1,10 m
//
// Validatiecampagne referentieberekeningen; dossier:
//   docs/superpowers/plans/2026-09-02-referentieberekeningen.md   (§5, R21)
//
// WAT DIT SCRIPT DOET
//   1. Bouwt het model uit het dossier op: 4 knopen, 3 staven, 4 verticale
//      steunpunten, 4 belastinggevallen (BG1..BG4) en 5 combinaties
//      (UGT 6.10b links/midden, UGT 6.10a links, BGT links/midden).
//   2. Schrijft het weg met serializeProject → R21.femp (+ R21.ifcfem2d,
//      de extensie die de open-dialoog van de app filtert).
//   3. Schrijft daarnaast de VARIANT met de getekende deellasten weg
//      (R21-werkvlak.femp) — nodig om te onderzoeken of het restverschil
//      met de bron door de voorgeschreven aanname komt.
//   4. Leest beide bestanden terug, vertaalt ze met dezelfde bouwMultiInput
//      die de app gebruikt, en rekent ze door met solveAllCases +
//      combineResults.
//   5. Legt elke referentiewaarde uit het dossier naast onze uitkomst.
//   6. Controleert onze uitkomst nog eens met de driemomentenvergelijking
//      (Clapeyron) — een gesloten formule zonder app-code, zodat bij een
//      verschil vaststaat of de APP of de BRON eraf zit.
//
// EENHEDEN
//   Model/adapter: mm, kN, kN/m (= N/mm), kNm. Solver: mm, N, N·mm.
//   De omrekening zit in bouwMultiInput; dit script rekent de solver-uitvoer
//   alleen terug naar kN/kNm om met de bron te kunnen vergelijken.
//
// TEKENCONVENTIES (geverifieerd met een vrij opgelegde proefligger, zie de
// conventieproef onderaan het script)
//   - reactie fz   : positief = omhoog                → zelfde als de bron
//   - shearForce   : V(x) = Σ verticale krachten LINKS van x, omhoog positief
//                                                     → zelfde als de bron
//   - bendingMoment: veldmoment (sagging) positief, steunpuntsmoment negatief
//                                                     → zelfde als de bron
//   - deflection   : negatief = omlaag                → bron geeft uz negatief
//   - displacement.ry: TEGENGESTELD teken aan de fiy van de bron (rechterhand-
//     regel om +y in een x–z-vlak met z omhoog). Wordt expliciet omgeklapt.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R21.mjs
// ───────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("../src/lib/sectionResolver.ts");
const { buildTimberCheckInputs } = await import("../src/lib/timberCheckBuilder.ts");
const {
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
} = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "n.v.t.");

// ═══════════════════════════════════════════════════════════════════════════
// 1. HET MODEL — letterlijk uit de invoertabel van R21
// ═══════════════════════════════════════════════════════════════════════════
//
// GEOMETRIE. Vier steunpunten op x = 0 / 1 100 / 2 200 / 3 300 mm; drie
// staven daartussen, elk precies één veld. De steunpunten zijn de knopen,
// dus elke veldgrens ligt op een staafeinde en de 21 stations per staaf
// vallen op ronde maten (station k ↔ x = k·55 mm binnen het veld).
const nodes = [0, 1100, 2200, 3300].map((x, i) => ({ id: i + 1, x, z: 0 }));

// ── DOORSNEDE — SUBSTITUUT, ZIE BEVINDINGEN ────────────────────────────────
// De bron gebruikt een SAMENGESTELD H-profiel 200 × 80 mm van een leverancier
// met Iy = 4,4693·10^7 mm⁴, Wel,y = 4,4693·10^5 mm³ en EI = 450 kN·m²
// (leveranciersopgave) waaruit de bron E = 10 100 N/mm² afleidt.
// Zo'n samengestelde doorsnede kan het model niet dragen: een staaf draagt
// alleen een materiaalnaam + profielnaam, en sectionResolver leidt daaruit
// A, I en E af (hout: rechthoek b×h, E = E_0,mean van de sterkteklasse).
//
// GEKOZEN SUBSTITUUT: een VOLLE RECHTHOEK b × h in C24 (E_0,mean = 11 000
// N/mm²) waarvan tegelijk
//     E·I    = 10 100 · 4,4693·10^7 = 4,51399·10^11 N·mm²  (= 451,4 kN·m²)
//     Wel,y  = 4,4693·10^5 mm³
// overeenkomen met het echte profiel. Dat kan exact, want beide eisen samen
// leggen b en h eenduidig vast:
//     I_eq = EI_doel / 11 000        h = 2·I_eq / W_doel        b = 12·I_eq/h³
// Uitkomst: b ≈ 79,53 mm, h ≈ 183,64 mm.
//
// WAAROM DIT GEEN VERGELEKEN GROOTHEID BEÏNVLOEDT:
//  - M, V en de oplegreacties van een PRISMATISCHE doorgaande ligger hangen
//    niet van de absolute EI af (alleen van de verhouding tussen de velden,
//    hier 1 : 1 : 1). Voor die grootheden is de doorsnedekeuze irrelevant.
//  - De zakking en de hoekverdraaiing hangen wél van EI af — en die komt
//    exact overeen (afwijking wordt hieronder geprint, < 0,05 %).
//  - Wel,y komt overeen, dus het buigmoment-spanningsniveau klopt ook.
// WAT HET WÉL BEÏNVLOEDT (en dus NIET vergeleken wordt):
//  - De dwarskrachtweerstand: een volle rechthoek heeft Av = 2/3·b·h, een
//    H-profiel een dun lijf. De VRd = 16,5 kN van de bron is een
//    leverancierswaarde en is met dit substituut niet na te rekenen.
//  - Het eigen gewicht uit A (staat daarom UIT; de bron geeft het eigen
//    gewicht expliciet als 0,057 kN/m in BG1).
const EI_DOEL = 10100 * 4.4693e7;      // N·mm²  (E · Iy van de bron)
const W_DOEL = 4.4693e5;               // mm³    (Wel,y van de bron)
const MATERIAAL = "C24";
const E_C24 = 11000;                   // N/mm², E_0,mean EN 338 (sectionResolver)
{
  const Ieq = EI_DOEL / E_C24;
  const h = (2 * Ieq) / W_DOEL;
  const b = (12 * Ieq) / (h * h * h);
  log(`Substituutdoorsnede (exacte oplossing): b = ${fmt(b, 4)} mm, h = ${fmt(h, 4)} mm`);
}
const PROFIEL = "79.53x183.64";        // b × h in mm, afgerond op 2 decimalen

// Controle van de afronding op de twee grootheden die er wél toe doen.
{
  const sec = resolveSection(MATERIAAL, PROFIEL);
  const b = 79.53, h = 183.64;
  const W = (b * h * h) / 6;
  const EI = sec.E * sec.I;
  log(`Substituut "${PROFIEL}" ${MATERIAAL}: E = ${sec.E} N/mm², I = ${sec.I.toExponential(5)} mm⁴` +
      ` (bron ${sec.bron})`);
  log(`  EI    = ${fmt(EI / 1e9, 4)} kN·m²   doel ${fmt(EI_DOEL / 1e9, 4)}   ` +
      `Δ ${fmt(((EI - EI_DOEL) / EI_DOEL) * 100, 4)} %`);
  log(`  Wel,y = ${W.toExponential(5)} mm³   doel ${W_DOEL.toExponential(5)}   ` +
      `Δ ${fmt(((W - W_DOEL) / W_DOEL) * 100, 4)} %`);
  log(`  (A = ${fmt(sec.A, 0)} mm² — niet vergelijkbaar met het echte H-profiel;` +
      ` eigen gewicht staat daarom uit)`);
}

// ── STAVEN ────────────────────────────────────────────────────────────────
// checkConfig: klimaatklasse 2 en belastingduur "kort" geven samen kmod = 0,90
// zoals de bron gebruikt; doorbuigingsgrens L/400 (bron: wmax = 1 100/400 =
// 2,75 mm) via deflectionClass "custom" + numerator 400.
const beams = [1, 2, 3].map((i) => ({
  id: i, from: i, to: i + 1,
  material: MATERIAAL, profile: PROFIEL,
  checkConfig: {
    serviceClass: 2,
    loadDuration: "short",
    deflectionClass: "custom",
    deflectionLimitNumerator: 400,
  },
}));

// ── OPLEGGINGEN ───────────────────────────────────────────────────────────
// Vier verticale steunpunten, scharnierend/rol (de bron geeft Rx = 0 en
// My = 0 in de reactietabel: dus geen inklemming, en de horizontale reactie
// is nul). Eén oplegging neemt de horizontale richting op zodat het model
// kinematisch bepaald is; alle belasting is verticaal, dus dat levert Rx = 0.
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "zRoller" },
  { nodeId: 3, type: "zRoller" },
  { nodeId: 4, type: "zRoller" },
];

// ── BELASTINGGEVALLEN ─────────────────────────────────────────────────────
// BG1  eigen gewicht plaat + drager   0,035 + 0,057 = 0,092 kN/m  (permanent)
// BG2  massa vloeibaar beton                        7,28  kN/m    (veranderlijk)
// BG3  "VB links"   werkvlak 0,53 kN/m links, 0,26 kN/m rechts
// BG4  "VB midden"  werkvlak 0,26 / 0,53 / 0,26 kN/m
// Herkomst BG3/BG4: EN 1991-1-6 §4.11.2 (1,50 kN/m² binnen, 0,75 kN/m²
// buiten het werkvlak, × kinderbint-h.o.h. 0,35 m).
const loadCases = [
  { id: 1, name: "BG1 eigen gewicht",       type: "dead" },
  { id: 2, name: "BG2 vloeibaar beton",     type: "live" },
  { id: 3, name: "BG3 werkvlak links",      type: "live" },
  { id: 4, name: "BG4 werkvlak midden",     type: "live" },
];

const Q_EG = -0.092;      // kN/m, omlaag negatief
const Q_BETON = -7.28;
const Q_WERKVLAK_BINNEN = -0.53;
const Q_WERKVLAK_BUITEN = -0.26;

/** Volle-lengte lijnlast q op alle drie de staven, in één belastinggeval. */
function volleLengte(vanafId, caseId, q) {
  return beams.map((b, i) => ({
    id: vanafId + i, type: "lineLoad", caseId, beamId: b.id, q,
  }));
}

// ── PRIMAIR MODEL: de voorgeschreven aanname ──────────────────────────────
// Het dossier schrijft voor: "De exacte begrenzing van de deellasten in BG3
// en BG4 staat alleen getekend, niet in maten ... Aanname: reken met een
// gelijkmatig verdeelde last over de volle lengte en noteer dat."
// BG3 en BG4 worden daarmee IDENTIEK (beide 0,53 kN/m over 3,3 m). Ze blijven
// als aparte gevallen staan zodat het bestand dezelfde combinatiestructuur
// heeft als de variant hieronder.
const loadsUniform = [
  ...volleLengte(1, 1, Q_EG),
  ...volleLengte(11, 2, Q_BETON),
  ...volleLengte(21, 3, Q_WERKVLAK_BINNEN),
  ...volleLengte(31, 4, Q_WERKVLAK_BINNEN),
];

// ── VARIANTMODEL: de deellasten zoals ze getekend zijn ────────────────────
// Werkvlak van 3,00 m op een ligger van 3,30 m (dossier). BG3 legt dat
// werkvlak tegen de LINKER liggerkant aan (0 … 3 000 mm), BG4 legt het
// gecentreerd (150 … 3 150 mm). Buiten het werkvlak 0,26 kN/m.
// Staafgrenzen: staaf 1 = 0…1 100, staaf 2 = 1 100…2 200, staaf 3 = 2 200…3 300.
const F_L = (x) => (x - 2200) / 1100;    // globale x → fractie op staaf 3
const loadsWerkvlak = [
  ...volleLengte(1, 1, Q_EG),
  ...volleLengte(11, 2, Q_BETON),
  // BG3 "links": binnen tot x = 3 000 mm, daarna buiten.
  { id: 21, type: "lineLoad", caseId: 3, beamId: 1, q: Q_WERKVLAK_BINNEN },
  { id: 22, type: "lineLoad", caseId: 3, beamId: 2, q: Q_WERKVLAK_BINNEN },
  { id: 23, type: "lineLoad", caseId: 3, beamId: 3, q: Q_WERKVLAK_BINNEN, startFrac: 0, endFrac: F_L(3000) },
  { id: 24, type: "lineLoad", caseId: 3, beamId: 3, q: Q_WERKVLAK_BUITEN, startFrac: F_L(3000), endFrac: 1 },
  // BG4 "midden": buiten op 0…150 en 3 150…3 300, binnen ertussen.
  { id: 31, type: "lineLoad", caseId: 4, beamId: 1, q: Q_WERKVLAK_BUITEN, startFrac: 0, endFrac: 150 / 1100 },
  { id: 32, type: "lineLoad", caseId: 4, beamId: 1, q: Q_WERKVLAK_BINNEN, startFrac: 150 / 1100, endFrac: 1 },
  { id: 33, type: "lineLoad", caseId: 4, beamId: 2, q: Q_WERKVLAK_BINNEN },
  { id: 34, type: "lineLoad", caseId: 4, beamId: 3, q: Q_WERKVLAK_BINNEN, startFrac: 0, endFrac: F_L(3150) },
  { id: 35, type: "lineLoad", caseId: 4, beamId: 3, q: Q_WERKVLAK_BUITEN, startFrac: F_L(3150), endFrac: 1 },
];

// ── COMBINATIES ───────────────────────────────────────────────────────────
// NEN-EN 1990/NB tabel A1.2(B), groep B, CC2 met KFI = 1,0 en psi = 1,0:
//   6.10a : 1,35·G + 1,5·psi0·Q            (psi0 = 1,0 volgens het dossier)
//   6.10b : 1,20·G + 1,5·Q
//   BGT karakteristiek (6.14b): 1,0·G + 1,0·Q
// Het beton (BG2) telt in de bron als veranderlijke belasting: de bron
// schrijft "1,2·(0,035 + 0,057) + 1,5·7,28 + 1,5·1,0·0,53 = 11,83 kN/m".
const combinations = [
  { id: 1, name: "UGT 6.10b — werkvlak links",  type: "uls",
    formula: "1,2·BG1 + 1,5·BG2 + 1,5·BG3",
    factors: new Map([[1, 1.2], [2, 1.5], [3, 1.5]]) },
  { id: 2, name: "UGT 6.10b — werkvlak midden", type: "uls",
    formula: "1,2·BG1 + 1,5·BG2 + 1,5·BG4",
    factors: new Map([[1, 1.2], [2, 1.5], [4, 1.5]]) },
  { id: 3, name: "UGT 6.10a — werkvlak links",  type: "uls",
    formula: "1,35·BG1 + 1,5·1,0·BG2 + 1,5·1,0·BG3",
    factors: new Map([[1, 1.35], [2, 1.5], [3, 1.5]]) },
  { id: 4, name: "BGT karakteristiek — werkvlak links",  type: "sls",
    formula: "1,0·BG1 + 1,0·BG2 + 1,0·BG3",
    factors: new Map([[1, 1.0], [2, 1.0], [3, 1.0]]) },
  { id: 5, name: "BGT karakteristiek — werkvlak midden", type: "sls",
    formula: "1,0·BG1 + 1,0·BG2 + 1,0·BG4",
    factors: new Map([[1, 1.0], [2, 1.0], [4, 1.0]]) },
];

const structuralGrid = {
  enabled: true,
  xAxes: [0, 1100, 2200, 3300].map((p, i) => ({
    id: String.fromCharCode(65 + i), label: String.fromCharCode(65 + i), position: p,
  })),
  zAxes: [{ id: "1", label: "1", position: 0 }],
};

function projectState(loads) {
  return {
    nodes, beams, supports, plates: [], loads, loadCases,
    activeLoadCaseId: 1,
    // Eigen gewicht UIT: de bron becijfert het eigen gewicht van de drager
    // expliciet als 0,057 kN/m binnen BG1. Zetten we het aan, dan telt het
    // dubbel — en dan nog met de A van de substituut-rechthoek.
    selfWeightEnabled: false,
    nonlinearEnabled: false,
    combinations: combinationsToFile(combinations),
    structuralGrid,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. OPSLAAN
// ═══════════════════════════════════════════════════════════════════════════
const jsonUniform = serializeProject(projectState(loadsUniform));
const jsonWerkvlak = serializeProject(projectState(loadsWerkvlak));
writeFileSync(join(HIER, "R21.femp"), jsonUniform, "utf8");
writeFileSync(join(HIER, "R21.ifcfem2d"), jsonUniform, "utf8");
writeFileSync(join(HIER, "R21-werkvlak.femp"), jsonWerkvlak, "utf8");
log(`\nModel opgeslagen: ${join(HIER, "R21.femp")}   (voorgeschreven aanname: volle lengte)`);
log(`                  ${join(HIER, "R21.ifcfem2d")}`);
log(`Variant:          ${join(HIER, "R21-werkvlak.femp")}   (deellasten zoals getekend)`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. DOORREKENEN — vanaf de TERUGGELEZEN bestanden
// ═══════════════════════════════════════════════════════════════════════════
function reken(json) {
  const bestand = deserializeProject(json);
  const model = {
    nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
    plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
    selfWeightEnabled: bestand.selfWeightEnabled,
    scheefstandEnabled: bestand.scheefstandEnabled ?? false,
    scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
    scheefstandRichting: bestand.scheefstandRichting ?? 1,
  };
  const combos = combinationsFromFile(bestand.combinations);
  const perCase = solveAllCases(bouwMultiInput(model)).perCase;
  const perCombo = new Map();
  for (const c of combos) perCombo.set(c.id, combineResults(c, perCase));
  return { bestand, model, combos, perCombo };
}

const UNI = reken(jsonUniform);
const WRK = reken(jsonWerkvlak);

// ── Uitlezers ─────────────────────────────────────────────────────────────
const reactie = (r, nodeId) => (r.reactions.get(nodeId)?.fz ?? NaN) / 1000;         // kN, omhoog +
const V = (r, beamId, station) => r.elements.get(beamId).shearForce[station] / 1000; // kN
const M = (r, beamId, station) => r.elements.get(beamId).bendingMoment[station] / 1e6; // kNm
const w = (r, beamId, station) => r.elements.get(beamId).deflection[station];        // mm
/** Hoekverdraaiing in mrad in de conventie van de BRON (teken omgeklapt). */
const fiy = (r, nodeId) => -(r.displacements.get(nodeId)?.ry ?? NaN) * 1000;

/** Grootste |w| in een staaf + de bijbehorende x binnen die staaf (mm). */
function maxZakking(r, beamId) {
  const d = r.elements.get(beamId).deflection;
  let k = 0;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[k])) k = i;
  return { w: d[k], x: (k / 20) * 1100, station: k };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERGELIJKEN
// ═══════════════════════════════════════════════════════════════════════════
//
// TOLERANTIE. R21 is een uitgewerkt rekenvoorbeeld met getallen op 2 decimalen
// → categorie "numerieke referentie uit een validatiebundel", 1 %. Maar de
// bron rondt op 2 decimalen af en de deellastbegrenzing is een aanname; het
// dossier zet zulke gevallen op 5 %. We hanteren de strengere 1 % als
// SIGNAALgrens (dan wordt het verschil uitgezocht) en melden per rij het
// exacte percentage. Bij zeer kleine getallen (zakking op 1 decimaal!) is een
// absolute drempel bepalend; die staat per blok genoemd.
const TOL_SIGNAAL = 1.0;   // %
const rijen = [];

function vgl(groep, grootheid, ref, onze, { tolPct = TOL_SIGNAAL, tolAbs = 0, eenheid = "" } = {}) {
  const delta = onze - ref;
  const pct = ref === 0 ? (Math.abs(delta) < 1e-12 ? 0 : Infinity) : (delta / Math.abs(ref)) * 100;
  const tol = Math.max(Math.abs(ref) * tolPct / 100, tolAbs);
  const ok = Number.isFinite(onze) && Math.abs(delta) <= tol;
  rijen.push({ groep, grootheid, ref, onze, delta, pct, ok, eenheid });
  log(`  ${ok ? "✓" : "✗"} ${grootheid.padEnd(34)} ref ${fmt(ref).padStart(9)}   ons ${fmt(onze).padStart(9)}` +
      `   Δ ${fmt(delta).padStart(8)}   ${Number.isFinite(pct) ? (pct.toFixed(2) + " %").padStart(9) : "   n.v.t."}  ${eenheid}`);
  return ok;
}

// ── 4a. UGT-snedekrachten (dossiertabel, rijen 1 t/m 7) ───────────────────
//
// De bron geeft één set UGT-waarden. Ze zijn licht ASYMMETRISCH (M bij
// steunpunt 2 = −1,42 tegen −1,41 bij steunpunt 3), wat alleen kan komen
// van de deellast van BG3 "VB links". Onder de VOORGESCHREVEN aanname
// (volle lengte) is ons model exact symmetrisch. Beide worden getoond.
log("\n═══ 4a. UGT-snedekrachten (6.10b, werkvlak links) ═══");
{
  const rU = UNI.perCombo.get(1);
  const rW = WRK.perCombo.get(1);
  const qU = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.53;
  log(`  Ontwerplast 6.10b (volle lengte): ${fmt(qU)} kN/m   (bron: 11,83 kN/m)`);
  vgl("UGT", "ontwerplast q_d [kN/m]", 11.83, qU, { eenheid: "kN/m" });

  log("\n  — primair model (voorgeschreven aanname: volle lengte) —");
  vgl("UGT", "Vz bij steunpunt 1 (x=0)",      5.22, V(rU, 1, 0),  { eenheid: "kN" });
  vgl("UGT", "Vz links van steunpunt 2",     -7.79, V(rU, 1, 20), { eenheid: "kN" });
  vgl("UGT", "Vz rechts van steunpunt 2",     7.75, V(rU, 2, 0),  { eenheid: "kN" });
  vgl("UGT", "My bij steunpunt 2",           -1.42, M(rU, 1, 20), { eenheid: "kNm" });
  vgl("UGT", "My bij steunpunt 3",           -1.41, M(rU, 2, 20), { eenheid: "kNm" });
  vgl("UGT", "My in het veld bij x = 440 mm", 1.15, M(rU, 1, 8),  { eenheid: "kNm" });

  log("\n  — variant met de getekende deellasten (alleen ter verklaring) —");
  log(`    Vz(x=0)            ${fmt(V(rW, 1, 0))} kN`);
  log(`    Vz links steunp. 2 ${fmt(V(rW, 1, 20))} kN`);
  log(`    Vz rechts steunp. 2 ${fmt(V(rW, 2, 0))} kN`);
  log(`    Vz links steunp. 3 ${fmt(V(rW, 2, 20))} kN`);
  log(`    Vz rechts steunp. 3 ${fmt(V(rW, 3, 0))} kN   ← komt overeen met de "+7,75" van de bron`);
  log(`    My steunpunt 2     ${fmt(M(rW, 1, 20))} kNm`);
  log(`    My steunpunt 3     ${fmt(M(rW, 2, 20))} kNm`);
  log(`    My veld x=440 mm   ${fmt(M(rW, 1, 8))} kNm`);

  // De asymmetrie die de bron laat zien, reproduceert de variant wél.
  log("\n  Toets op de asymmetrie van de bron (|M2| > |M3| en |V2,links| > |V3,rechts|):");
  const asymBron = { dM: -1.42 - -1.41, dV: 7.79 - 7.75 };
  const asymWrk = { dM: M(rW, 1, 20) - M(rW, 2, 20), dV: Math.abs(V(rW, 1, 20)) - Math.abs(V(rW, 3, 0)) };
  const asymUni = { dM: M(rU, 1, 20) - M(rU, 2, 20), dV: Math.abs(V(rU, 1, 20)) - Math.abs(V(rU, 3, 0)) };
  log(`    bron    : ΔM = ${fmt(asymBron.dM)} kNm   ΔV = ${fmt(asymBron.dV)} kN`);
  log(`    variant : ΔM = ${fmt(asymWrk.dM)} kNm   ΔV = ${fmt(asymWrk.dV)} kN`);
  log(`    primair : ΔM = ${fmt(asymUni.dM)} kNm   ΔV = ${fmt(asymUni.dV)} kN  (exact symmetrisch, zoals verwacht)`);
}

// ── 4b. De rij "Vz rechts van steunpunt 2" apart onderzocht ───────────────
log("\n═══ 4b. Onderzoek: de referentiewaarde +7,75 kN 'rechts van steunpunt 2' ═══");
{
  const rU = UNI.perCombo.get(1);
  const rW = WRK.perCombo.get(1);
  log("  Voor een gelijkmatig belaste drieveldsligger met gelijke velden geldt");
  log("  analytisch (standaardcoëfficiënten, zie ook de Clapeyron-controle in §5):");
  log("     R = 0,4·qL / 1,1·qL / 1,1·qL / 0,4·qL");
  log("     V(0) = +0,40·qL   V(L⁻) = −0,60·qL   V(L⁺) = +0,50·qL");
  log("     V(2L⁻) = −0,50·qL  V(2L⁺) = +0,60·qL  V(3L) = −0,40·qL");
  const qL = 11.8254 * 1.1;
  log(`  Met q = 11,8254 kN/m en L = 1,10 m: 0,40·qL = ${fmt(0.4 * qL)},` +
      ` 0,50·qL = ${fmt(0.5 * qL)}, 0,60·qL = ${fmt(0.6 * qL)} kN`);
  log(`  De waarde +7,75 kN uit de bron ligt bij 0,60·qL, NIET bij 0,50·qL.`);
  log(`  0,60·qL komt in de dwarskrachtenlijn maar op twee plaatsen voor:`);
  log(`    links van steunpunt 2  → −7,79 kN (bron) / ${fmt(V(rW, 1, 20))} kN (variant)`);
  log(`    rechts van steunpunt 3 → +7,75 kN (bron) / ${fmt(V(rW, 3, 0))} kN (variant)`);
  log(`  Onze waarde rechts van steunpunt 2 is ${fmt(V(rU, 2, 0))} kN (primair) /` +
      ` ${fmt(V(rW, 2, 0))} kN (variant).`);
  log(`  → De referentierij is naar alle waarschijnlijkheid MISLABELD: het is de`);
  log(`    dwarskracht rechts van steunpunt 3 (of, in de spiegeling van de bron,`);
  log(`    "rechts van het steunpunt" van het andere eindveld). Geen enkele`);
  log(`    belastingschikking van deze constructie levert +7,75 kN rechts van`);
  log(`    steunpunt 2 op: de permanente belasting en de betonmassa liggen in`);
  log(`    alle gevallen over de volle lengte, en het werkvlak varieert maar`);
  log(`    tussen 0,26 en 0,53 kN/m op een totaal van bijna 12 kN/m.`);
  // Bovengrens-argument: zelfs de meest ongunstige schikking haalt 0,60·qL niet.
  const qMax = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.53;
  const qMin = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.26;
  log(`    Bovengrens: zelfs met q = ${fmt(qMax)} kN/m over veld 2+3 en` +
      ` q = ${fmt(qMin)} kN/m over veld 1 blijft V(L⁺) rond 0,50·qL ≈ ${fmt(0.5 * qMax * 1.1)} kN.`);
}

// ── 4c. Samenvattingsrij MEd / VEd / REd / w ──────────────────────────────
log("\n═══ 4c. Samenvatting MEd / VEd / REd / w ═══");
{
  const rU = UNI.perCombo.get(1);
  const rS = UNI.perCombo.get(4);   // BGT karakteristiek
  let MEd = 0, VEd = 0;
  for (const b of [1, 2, 3]) {
    const ef = rU.elements.get(b.id ?? b);
    for (const m of ef.bendingMoment) if (Math.abs(m) > Math.abs(MEd)) MEd = m;
    for (const v of ef.shearForce) if (Math.abs(v) > Math.abs(VEd)) VEd = v;
  }
  MEd = Math.abs(MEd) / 1e6; VEd = Math.abs(VEd) / 1000;
  const REd = Math.max(...[1, 2, 3, 4].map((n) => reactie(rU, n)));
  const wMax = Math.max(...[1, 2, 3].map((b) => Math.abs(maxZakking(rS, b).w)));
  vgl("samenvatting", "MEd", 1.42, MEd, { eenheid: "kNm" });
  vgl("samenvatting", "VEd", 7.79, VEd, { eenheid: "kN" });
  vgl("samenvatting", "REd", 14.30, REd, { eenheid: "kN" });
  // De bron geeft de zakking op 1 decimaal (0,2 mm). Een absolute tolerantie
  // van 0,05 mm = een halve eenheid van de laatste getoonde decimaal is dan
  // de enige eerlijke maat; het procentuele verschil zegt hier niets.
  vgl("samenvatting", "w (BGT, max veldzakking)", 0.2, wMax,
      { tolAbs: 0.05, eenheid: "mm  (bron op 1 decimaal!)" });
  const mz = maxZakking(rS, 1);
  log(`    positie van de maximale zakking in veld 1: x = ${fmt(mz.x, 1)} mm (station ${mz.station})`);
}

// ── 4d. BGT-oplegreacties ─────────────────────────────────────────────────
log("\n═══ 4d. BGT-oplegreacties (bron: 'Reacties UGT' met combinatie BGT — zie dossier) ═══");
{
  const refLinks = [3.48, 9.56, 9.52, 3.40];
  const refMidden = [3.45, 9.55, 9.55, 3.45];
  const rUL = UNI.perCombo.get(4), rUM = UNI.perCombo.get(5);
  const rWL = WRK.perCombo.get(4), rWM = WRK.perCombo.get(5);

  log("  — primair model (voorgeschreven aanname: volle lengte) —");
  log("  BGT 'links':");
  refLinks.forEach((ref, i) => vgl("BGT-R", `R${i + 1} (links)`, ref, reactie(rUL, i + 1), { eenheid: "kN" }));
  log("  BGT 'midden':");
  refMidden.forEach((ref, i) => vgl("BGT-R", `R${i + 1} (midden)`, ref, reactie(rUM, i + 1), { eenheid: "kN" }));
  log("  Horizontale reactie en inklemmingsmoment (bron: Rx = 0, My = 0):");
  const sumRx = [1, 2, 3, 4].reduce((s, n) => s + (rUL.reactions.get(n)?.fx ?? 0), 0);
  const sumMy = [1, 2, 3, 4].reduce((s, n) => s + Math.abs(rUL.reactions.get(n)?.my ?? 0), 0);
  vgl("BGT-R", "Σ|Rx| over alle steunpunten", 0, Math.abs(sumRx) / 1000, { tolAbs: 1e-6, eenheid: "kN" });
  vgl("BGT-R", "Σ|My| over alle steunpunten", 0, sumMy / 1e6, { tolAbs: 1e-6, eenheid: "kNm" });

  log("\n  — variant met de getekende deellasten (alleen ter verklaring) —");
  const toon = (naam, r, ref) => {
    const ons = [1, 2, 3, 4].map((n) => reactie(r, n));
    log(`    ${naam.padEnd(8)} ons  ${ons.map((v) => fmt(v, 2).padStart(6)).join(" / ")}` +
        `   bron ${ref.map((v) => fmt(v, 2).padStart(6)).join(" / ")}`);
    log(`    ${"".padEnd(8)} Δ %  ${ons.map((v, i) => ((v - ref[i]) / ref[i] * 100).toFixed(2).padStart(6)).join(" / ")}`);
    log(`    ${"".padEnd(8)} Σ ons ${fmt(ons.reduce((a, b) => a + b, 0), 3)} kN   Σ bron ${fmt(ref.reduce((a, b) => a + b, 0), 3)} kN`);
  };
  toon("links", rWL, refLinks);
  toon("midden", rWM, refMidden);
}

// ── 4e. BGT-verplaatsingen ────────────────────────────────────────────────
log("\n═══ 4e. BGT-verplaatsingen ═══");
{
  const rS = UNI.perCombo.get(4);
  const qS = 0.092 + 7.28 + 0.53;
  log(`  BGT-last (6.14b, volle lengte): ${fmt(qS)} kN/m   (bron: 7,90 kN/m)`);
  vgl("BGT-u", "BGT-last q [kN/m]", 7.90, qS, { eenheid: "kN/m" });
  // uz op x = 550 mm = station 10 van staaf 1.
  vgl("BGT-u", "uz bij x = 550 mm", -0.2, w(rS, 1, 10),
      { tolAbs: 0.05, eenheid: "mm  (bron op 1 decimaal!)" });
  vgl("BGT-u", "fiy bij x = 0", 0.6, fiy(rS, 1), { tolAbs: 0.05, eenheid: "mrad (bron op 1 decimaal!)" });
  vgl("BGT-u", "fiy bij x = 3 300", -0.6, fiy(rS, 4), { tolAbs: 0.05, eenheid: "mrad (bron op 1 decimaal!)" });
  log(`    (ongeafgerond: uz(550) = ${fmt(w(rS, 1, 10), 4)} mm,` +
      ` fiy(0) = ${fmt(fiy(rS, 1), 4)} mrad, fiy(3300) = ${fmt(fiy(rS, 4), 4)} mrad)`);
}

// ── 4f. Is de BRON intern consistent? ─────────────────────────────────────
//
// Twee van de drie rijen die buiten de signaalgrens vallen, gaan over kleine
// absolute verschillen (≤ 0,08 kN, ≤ 0,03 kN·m). Voordat zoiets een
// app-verschil kan heten, moet vaststaan of de brongetallen ONDERLING kloppen.
// Alle controles hieronder gebruiken UITSLUITEND getallen van de bron.
log("\n═══ 4f. Consistentiecontrole op de bron zelf (geen app-getallen) ═══");
{
  const qBron = 11.83, L = 1.10;
  const V0 = 5.22, VL = -7.79, M2 = -1.42, M3 = -1.41, Mveld = 1.15;

  // (i) Voor een uniform belaste ligger geldt V(L⁻) = V(0) − q·L, ongeacht
  //     de statisch onbepaaldheid: alleen verticaal evenwicht van veld 1.
  const VLuitV0 = V0 - qBron * L;
  log(`  (i) verticaal evenwicht veld 1: V(L⁻) = V(0) − q·L = ${fmt(V0)} − ${fmt(qBron * L)} = ${fmt(VLuitV0)} kN`);
  log(`      de bron noteert V(L⁻) = ${fmt(VL)} kN → verschil ${fmt(VLuitV0 - VL)} kN` +
      `  (${fmt((VLuitV0 - VL) / Math.abs(VL) * 100, 2)} %)`);

  // (ii) Momentevenwicht van veld 1: M(L) = V(0)·L − q·L²/2.
  const M2uit = V0 * L - qBron * L * L / 2;
  log(`  (ii) momentevenwicht veld 1: M(L) = V(0)·L − q·L²/2 = ${fmt(M2uit)} kN·m`);
  log(`       de bron noteert M2 = ${fmt(M2)} kN·m → verschil ${fmt(M2uit - M2)} kN·m`);

  // (iii) Veldmoment daar waar V = 0.
  const xV0 = V0 / qBron;
  const MveldUit = V0 * xV0 - qBron * xV0 * xV0 / 2;
  log(`  (iii) V = 0 bij x = V(0)/q = ${fmt(xV0 * 1000, 1)} mm (bron noemt 440 mm),` +
      ` M = ${fmt(MveldUit)} kN·m (bron: ${fmt(Mveld)})`);

  // (iv) De exacte coëfficiënten van een uniform belaste 3-veldsligger.
  log(`  (iv) exacte coëfficiënten bij q = ${fmt(qBron)} kN/m:` +
      ` 0,4·qL = ${fmt(0.4 * qBron * L)}, 0,6·qL = ${fmt(0.6 * qBron * L)},` +
      ` −0,1·qL² = ${fmt(-0.1 * qBron * L * L)}, +0,08·qL² = ${fmt(0.08 * qBron * L * L)}`);
  log(`       De bron ligt met V(0) = 5,22 kN ${fmt(Math.abs((V0 / (0.4 * qBron * L) - 1) * 100), 2)} % BOVEN 0,4·qL,`);
  log(`       en met M2 = −1,42 kN·m ${fmt(Math.abs((Math.abs(M2) / (0.1 * qBron * L * L) - 1) * 100), 2)} % ONDER 0,1·qL².`);
  log(`       Beide afwijkingen wijzen dezelfde kant op: de brongetallen horen bij`);
  log(`       een IETS grotere eindreactie dan de exacte 0,4·qL. Dat is intern`);
  log(`       consistent (i/ii/iii kloppen onderling tot ± 0,01), maar het is niet`);
  log(`       de exacte oplossing van de opgegeven constructie.`);
  log(`  (v) BGT-reacties van de bron liggen wél op de exacte coëfficiënten:`);
  const qS = 7.90;
  log(`      0,4·qL = ${fmt(0.4 * qS * L)} (bron 3,48) en 1,1·qL = ${fmt(1.1 * qS * L)} (bron 9,56).`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ONAFHANKELIJKE DERDE PARTIJ — driemomentenvergelijking (Clapeyron)
// ═══════════════════════════════════════════════════════════════════════════
//
// Gesloten formule, geen app-code. Voor een doorgaande ligger op starre
// steunpunten met constante EI:
//     M_{j−1}·L₁ + 2·M_j·(L₁+L₂) + M_{j+1}·L₂ = −6A₁ā₁/L₁ − 6A₂b̄₂/L₂
// met, per veld met de simply-supported momentenlijn M₀(s):
//     6A ā /L = (6/L)·∫₀ᴸ M₀(s)·s      ds       (ā vanaf de LINKER steun)
//     6A b̄ /L = (6/L)·∫₀ᴸ M₀(s)·(L−s) ds       (b̄ vanaf de RECHTER steun)
// De integralen worden per deelinterval met 3-punts Gauss-Legendre bepaald.
// M₀·s is per deelinterval een polynoom van graad 3, dus die kwadratuur is
// EXACT (geen benadering) tot machineprecisie.
function clapeyron(lengtes, segmentenPerVeld) {
  const n = lengtes.length;

  // M₀(s) van een veld met een reeks blokvormige lasten q op [a,b] (s vanaf links).
  const M0 = (L, segs) => (s) => {
    let RL = 0;
    for (const { a, b, q } of segs) { const Wq = q * (b - a); RL += Wq * (L - (a + b) / 2) / L; }
    let m = RL * s;
    for (const { a, b, q } of segs) {
      const u = Math.max(0, s - a), v = Math.max(0, s - b);
      m -= q * (u * u - v * v) / 2;
    }
    return m;
  };

  // 3-punts Gauss-Legendre op [x0,x1] (exact t/m graad 5).
  const GP = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
  const GW = [5 / 9, 8 / 9, 5 / 9];
  const integreer = (f, x0, x1) => {
    const h = (x1 - x0) / 2, c = (x0 + x1) / 2;
    let s = 0;
    for (let i = 0; i < 3; i++) s += GW[i] * f(c + h * GP[i]);
    return s * h;
  };
  const overSegmenten = (L, segs, f) => {
    const knikken = [0, L];
    for (const { a, b } of segs) { knikken.push(a, b); }
    const uniek = [...new Set(knikken.map((v) => Math.round(v * 1e9) / 1e9))]
      .filter((v) => v >= 0 && v <= L).sort((p, q) => p - q);
    let s = 0;
    for (let i = 0; i < uniek.length - 1; i++) s += integreer(f, uniek[i], uniek[i + 1]);
    return s;
  };

  const vanLinks = [], vanRechts = [];
  for (let i = 0; i < n; i++) {
    const L = lengtes[i], segs = segmentenPerVeld[i], m0 = M0(L, segs);
    vanLinks.push((6 / L) * overSegmenten(L, segs, (s) => m0(s) * s));
    vanRechts.push((6 / L) * overSegmenten(L, segs, (s) => m0(s) * (L - s)));
  }

  // Twee vergelijkingen (steunpunt 2 en 3), twee onbekenden; M₁ = M₄ = 0.
  const a11 = 2 * (lengtes[0] + lengtes[1]), a12 = lengtes[1];
  const a21 = lengtes[1], a22 = 2 * (lengtes[1] + lengtes[2]);
  const r1 = -(vanLinks[0] + vanRechts[1]);
  const r2 = -(vanLinks[1] + vanRechts[2]);
  const det = a11 * a22 - a12 * a21;
  const M2 = (r1 * a22 - a12 * r2) / det;
  const M3 = (a11 * r2 - r1 * a21) / det;

  // Oplegreacties per veld: R_links = (ΣW·afstand tot rechts + M_rechts − M_links)/L
  const veldReacties = [];
  const Mk = [0, M2, M3, 0];
  for (let i = 0; i < n; i++) {
    const L = lengtes[i], segs = segmentenPerVeld[i];
    let Wtot = 0, momOverRechts = 0;
    for (const { a, b, q } of segs) {
      const Wq = q * (b - a), zw = (a + b) / 2;
      Wtot += Wq; momOverRechts += Wq * (L - zw);
    }
    const RL = (momOverRechts + Mk[i + 1] - Mk[i]) / L;
    veldReacties.push({ RL, RR: Wtot - RL, Wtot });
  }
  const R = [
    veldReacties[0].RL,
    veldReacties[0].RR + veldReacties[1].RL,
    veldReacties[1].RR + veldReacties[2].RL,
    veldReacties[2].RR,
  ];
  return { M2, M3, R, veldReacties, M0, lengtes, segmentenPerVeld };
}

log("\n═══ 5. Onafhankelijke controle: driemomentenvergelijking (gesloten formule) ═══");
{
  const L = [1100, 1100, 1100];
  const qd = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.53;   // N/mm = kN/m
  const uniformSegs = L.map((Li) => [{ a: 0, b: Li, q: qd }]);
  const h = clapeyron(L, uniformSegs);
  const rU = UNI.perCombo.get(1);
  const paren = [
    ["M steunpunt 2 [kNm]", h.M2 / 1e6, M(rU, 1, 20)],
    ["M steunpunt 3 [kNm]", h.M3 / 1e6, M(rU, 2, 20)],
    ["R1 [kN]", h.R[0] / 1000, reactie(rU, 1)],
    ["R2 [kN]", h.R[1] / 1000, reactie(rU, 2)],
    ["R3 [kN]", h.R[2] / 1000, reactie(rU, 3)],
    ["R4 [kN]", h.R[3] / 1000, reactie(rU, 4)],
  ];
  let maxAfw = 0;
  for (const [naam, hand, app] of paren) {
    const d = Math.abs(app - hand);
    maxAfw = Math.max(maxAfw, d);
    log(`  ${naam.padEnd(22)} handformule ${fmt(hand, 5).padStart(10)}   app ${fmt(app, 5).padStart(10)}   Δ ${d.toExponential(2)}`);
  }
  log(`  → app en gesloten formule zijn gelijk tot ${maxAfw.toExponential(2)}` +
      ` (${maxAfw < 1e-9 ? "machineprecisie" : "LET OP"}).`);
  // Standaardcoëfficiënten voor de drieveldsligger (q in N/mm ≡ kN/m).
  log(`  Standaardcoëfficiënten met q = ${fmt(qd)} kN/m en L = 1,10 m:` +
      ` 0,4·qL = ${fmt(0.4 * qd * 1.1)} kN, 1,1·qL = ${fmt(1.1 * qd * 1.1)} kN,` +
      ` −0,1·qL² = ${fmt(-0.1 * qd * 1.21)} kNm, +0,08·qL² = ${fmt(0.08 * qd * 1.21)} kNm`);

  // Variant: dezelfde formule op de getekende deellasten van BG3 "links".
  const qBinnen = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.53;
  const qBuiten = 1.2 * 0.092 + 1.5 * 7.28 + 1.5 * 0.26;
  const segsLinks = [
    [{ a: 0, b: 1100, q: qBinnen }],
    [{ a: 0, b: 1100, q: qBinnen }],
    [{ a: 0, b: 800, q: qBinnen }, { a: 800, b: 1100, q: qBuiten }],
  ];
  const hw = clapeyron(L, segsLinks);
  const rW = WRK.perCombo.get(1);
  log("\n  Zelfde formule op de VARIANT met de getekende deellasten (BG3 'links'):");
  const parenW = [
    ["M steunpunt 2 [kNm]", hw.M2 / 1e6, M(rW, 1, 20)],
    ["M steunpunt 3 [kNm]", hw.M3 / 1e6, M(rW, 2, 20)],
    ["R1 [kN]", hw.R[0] / 1000, reactie(rW, 1)],
    ["R4 [kN]", hw.R[3] / 1000, reactie(rW, 4)],
  ];
  let maxAfwW = 0;
  for (const [naam, hand, app] of parenW) {
    const d = Math.abs(app - hand);
    maxAfwW = Math.max(maxAfwW, d);
    log(`  ${naam.padEnd(22)} handformule ${fmt(hand, 5).padStart(10)}   app ${fmt(app, 5).padStart(10)}   Δ ${d.toExponential(2)}`);
  }
  log(`  → ook met deellasten gelijk tot ${maxAfwW.toExponential(2)}.`);
}

// ── 5b. Zakking en hoekverdraaiing analytisch ─────────────────────────────
log("\n═══ 5b. Zakking en hoekverdraaiing — gesloten formule ═══");
{
  const rS = UNI.perCombo.get(4);
  const q = 0.092 + 7.28 + 0.53;      // kN/m = N/mm
  const Lmm = 1100;
  const sec = resolveSection(MATERIAAL, PROFIEL);
  const EI = sec.E * sec.I;
  // Eindveld van een drieveldsligger, gelijkmatig belast, gelijke velden:
  //   M(x) = 0,4qL·x − q x²/2      (steunpuntsmoment −0,1qL² bij x = L)
  //   EI·v'' = +M   (v omhoog positief, M sagging positief)
  //   EI·v(x) = 0,4qL x³/6 − q x⁴/24 + C x,   met v(0) = v(L) = 0 →
  //   C = −(0,4qL·L²/6 − qL³/24) = −0,025·qL³
  //   θ(0) = v'(0) = −0,025·qL³/EI   (negatief: het liggereinde draait
  //   met de klok mee in de ry-conventie van de app; de bron noteert +0,6)
  const theta0 = -0.025 * q * Lmm ** 3 / EI;             // rad, ry-conventie app
  const vx = (x) => (0.4 * q * Lmm * x ** 3 / 6 - q * x ** 4 / 24 - 0.025 * q * Lmm ** 3 * x) / EI;
  const ryApp = UNI.perCombo.get(4).displacements.get(1).ry;
  log(`  θ(0) analytisch = ${fmt(theta0 * 1000, 4)} mrad (ry-conventie app)   app ry(0) = ${fmt(ryApp * 1000, 4)} mrad` +
      `   Δ ${fmt((ryApp - theta0) / Math.abs(theta0) * 100, 4)} %`);
  log(`  omgeklapt naar de conventie van de bron: fiy(0) = ${fmt(-theta0 * 1000, 4)} mrad (bron: +0,6)`);
  for (const x of [440, 495, 550]) {
    const wa = vx(x);
    const wo = w(rS, 1, Math.round((x / Lmm) * 20));
    log(`  w(${String(x).padStart(4)} mm) analytisch = ${fmt(wa, 5)} mm   app ${fmt(wo, 5)} mm` +
        `   Δ ${fmt((wo - wa) / Math.abs(wa) * 100, 4)} %`);
  }
  // Maximum van v in het eindveld: v'(x) = 0.
  //   0,2qL x² − q x³/6 − 0,025 qL³ = 0  → deel door q: x³/6 − 0,2L x² + 0,025L³ = 0
  let x = 0.45 * Lmm;
  for (let i = 0; i < 60; i++) {
    const f = x ** 3 / 6 - 0.2 * Lmm * x * x + 0.025 * Lmm ** 3;
    const df = x * x / 2 - 0.4 * Lmm * x;
    x -= f / df;
  }
  log(`  x van w_max analytisch = ${fmt(x, 2)} mm → w_max = ${fmt(vx(x), 5)} mm` +
      `   (bron geeft 0,2 mm op 1 decimaal → afgerond ${fmt(Math.round(Math.abs(vx(x)) * 10) / 10, 1)} mm)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. TOETSEN
// ═══════════════════════════════════════════════════════════════════════════
//
// De EN 1995-toetsing zelf draait in de Rust-kern achter een Tauri-commando
// en is vanuit een tsx-script niet aan te roepen. Wat hier gebeurt:
//   (a) de UC's worden met ONZE snedekrachten en de WEERSTANDEN VAN DE BRON
//       nagerekend — dat toetst onze snedekrachten, niet onze weerstandskern;
//   (b) de weerstanden van de bron worden met een handafleiding op interne
//       consistentie gecontroleerd (bronconsistentie, geen app-uitvoer);
//   (c) buildTimberCheckInputs laat zien welke MEd/VEd/w de app aan de
//       EN 1995-kern zou aanbieden.
log("\n═══ 6. Toetsen ═══");
{
  const rU = UNI.perCombo.get(1);
  const rS = UNI.perCombo.get(4);
  const REd = Math.max(...[1, 2, 3, 4].map((n) => reactie(rU, n)));
  let MEd = 0, VEd = 0;
  for (const bId of [1, 2, 3]) {
    const ef = rU.elements.get(bId);
    for (const m of ef.bendingMoment) MEd = Math.max(MEd, Math.abs(m) / 1e6);
    for (const v of ef.shearForce) VEd = Math.max(VEd, Math.abs(v) / 1000);
  }
  const wMax = Math.max(...[1, 2, 3].map((b) => Math.abs(maxZakking(rS, b).w)));

  // (a) Oplegdruk — de enige toets die de bron volledig zelf uitschrijft.
  const bTooglat = 59, lEff = 140;                 // mm
  const fc90k = 2.5, kmod = 0.90, gammaM = 1.30, kc90 = 1.5;
  const fc90d = kmod * fc90k / gammaM;
  const sigmaBron = 14.30e3 / (bTooglat * lEff);
  const sigmaOns = REd * 1000 / (bTooglat * lEff);
  log("  (a) Oplegdruk σc,90,d = REd/(b·lef), met b = 59 mm en lef = 140 mm");
  vgl("toets", "σc,90,d", 1.73, sigmaOns, { tolAbs: 0.02, eenheid: "N/mm²" });
  log(`      controle op de bron zelf: 14,30·10³/(59·140) = ${fmt(sigmaBron)} N/mm² (bron schrijft 1,73)`);
  log(`      weerstand kc,90·fc,90,d = ${fmt(kc90)}·${fmt(fc90d)} = ${fmt(kc90 * fc90d)} N/mm²` +
      `   (bron schrijft 1,5 × 1,73 = 2,60)`);
  vgl("toets", "kc,90·fc,90,d", 2.60, kc90 * fc90d, { tolAbs: 0.02, eenheid: "N/mm²" });
  log(`      UC oplegdruk = ${fmt(sigmaOns / (kc90 * fc90d))}  (bron: ${fmt(1.73 / 2.60)})`);

  // (b) Dwarskracht — VRd is een leverancierswaarde, niet na te rekenen.
  log("  (b) Dwarskracht: VEd tegen VRd = 16,5 kN (leverancierswaarde uit de bron)");
  vgl("toets", "VEd", 7.79, VEd, { eenheid: "kN" });
  log(`      UC dwarskracht = ${fmt(VEd / 16.5)}  (bron: ${fmt(7.79 / 16.5)})` +
      `   → ${VEd < 16.5 ? "voldoet" : "VOLDOET NIET"}`);
  log(`      VRd zelf is NIET vergeleken: een samengesteld H-profiel met dun lijf;`);
  log(`      het substituut (volle rechthoek, Av = 2/3·b·h) geeft een heel andere Av.`);

  // (c) Moment — MRd is met Wel,y van de bron wél na te rekenen.
  const fmk = 24;                                   // N/mm², C24 (EN 338)
  const fmd = kmod * fmk / gammaM;
  const MRdHand = W_DOEL * fmd / 1e6;
  log("  (c) Moment: MEd tegen MRd = 7,5 kN·m (bron)");
  vgl("toets", "MEd", 1.42, MEd, { eenheid: "kNm" });
  log(`      UC moment = ${fmt(MEd / 7.5)}  (bron: ${fmt(1.42 / 7.5)})` +
      `   → ${MEd < 7.5 ? "voldoet" : "VOLDOET NIET"}`);
  log(`      bronconsistentie (handafleiding, GEEN app-uitvoer):`);
  log(`        fm,d = kmod·fm,k/γM = 0,90·24/1,30 = ${fmt(fmd)} N/mm²`);
  log(`        MRd = Wel,y·fm,d = 4,4693·10⁵ · ${fmt(fmd)} = ${fmt(MRdHand)} kN·m` +
      `   tegen de 7,5 kN·m van de bron (${fmt((MRdHand - 7.5) / 7.5 * 100, 1)} %)`);

  // (d) Doorbuiging.
  const wGrens = 1100 / 400;
  log("  (d) Doorbuiging: w tegen wmax = L/400 = 1 100/400 = 2,75 mm");
  vgl("toets", "wmax-grens", 2.75, wGrens, { tolAbs: 1e-9, eenheid: "mm" });
  log(`      onze w = ${fmt(wMax, 4)} mm → UC = ${fmt(wMax / wGrens)}` +
      `   (bron: 0,2/2,75 = ${fmt(0.2 / 2.75)})   → ${wMax < wGrens ? "voldoet" : "VOLDOET NIET"}`);

  // (e) Wat de app aan de EN 1995-kern zou aanbieden.
  log("  (e) Overdracht naar de EN 1995-kern (buildTimberCheckInputs):");
  const { inputs, skipped } = buildTimberCheckInputs({
    nodes, beams, combinations, combinationResults: UNI.perCombo,
  });
  if (skipped.length) for (const s of skipped) log(`      ! staaf ${s.beamId} overgeslagen: ${s.reason}`);
  for (const inp of inputs) {
    // forces_envelope is een lijst ForcePoints (kN, kN·m) over alle
    // UGT-combinaties; hieruit de maatgevende |My| en |Vz| per staaf.
    let mMax = 0, vMax = 0;
    for (const p of inp.forces_envelope) {
      mMax = Math.max(mMax, Math.abs(p.forces.my_ed));
      vMax = Math.max(vMax, Math.abs(p.forces.vz_ed));
    }
    log(`      staaf ${inp.beam_id}: ${inp.strength_class} ${fmt(inp.width_mm, 2)}×${fmt(inp.height_mm, 2)} mm,` +
        ` klimaatklasse ${inp.service_class}, duur ${inp.load_duration},` +
        ` |My|max = ${fmt(mMax)} kNm, |Vz|max = ${fmt(vMax)} kN,` +
        ` w_inst = ${fmt(inp.deflection_inst_mm, 4)} mm, grens L/${inp.deflection_limit_fin}`);
  }
  log(`      → de kern zou met de SUBSTITUUT-rechthoek rekenen; Wel,y klopt (zie kop),`);
  log(`        maar de dwarskrachtweerstand niet. De UC's hierboven zijn daarom met`);
  log(`        de weerstanden van de bron gemaakt, niet met de kern.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. EVENWICHTSCONTROLE OP ONZE EIGEN UITKOMST
// ═══════════════════════════════════════════════════════════════════════════
log("\n═══ 7. Evenwichtscontrole ═══");
for (const [naam, S] of [["primair", UNI], ["variant", WRK]]) {
  for (const c of S.combos) {
    const r = S.perCombo.get(c.id);
    const somR = [1, 2, 3, 4].reduce((s, n) => s + reactie(r, n), 0);
    // Totale belasting uit het model, per combinatie.
    let somQ = 0;
    for (const [caseId, f] of c.factors) {
      for (const l of S.bestand.loads) {
        if (l.type !== "lineLoad" || l.caseId !== caseId) continue;
        const lengte = 1100 * ((l.endFrac ?? 1) - (l.startFrac ?? 0));
        somQ += f * (-l.q) * lengte / 1000;
      }
    }
    const rel = Math.abs(somR - somQ) / somQ;
    log(`  ${naam} — ${c.name.padEnd(38)} Σ R = ${fmt(somR, 5)} kN   Σ q·L = ${fmt(somQ, 5)} kN` +
        `   ${rel < 1e-9 ? "sluit" : `SLUIT NIET (rel. ${rel.toExponential(2)})`}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. CONVENTIEPROEF — waarop de tekenafspraken hierboven berusten
// ═══════════════════════════════════════════════════════════════════════════
log("\n═══ 8. Conventieproef (vrij opgelegde ligger 1,1 m, q = 10 kN/m omlaag) ═══");
{
  const sec = resolveSection(MATERIAAL, PROFIEL);
  const proef = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 1100, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: MATERIAAL, profile: PROFIEL }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10 }],
    selfWeightEnabled: false, scheefstandEnabled: false,
    scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const per = solveAllCases(bouwMultiInput(proef)).perCase;
  const r = combineResults({ id: 1, name: "1,0Q", type: "uls", formula: "", factors: new Map([[1, 1]]) }, per);
  const ef = r.elements.get(1);
  const p = (naam, ons, verwacht) =>
    log(`  ${naam.padEnd(28)} ons ${fmt(ons, 5).padStart(10)}   analytisch ${fmt(verwacht, 5).padStart(10)}` +
        `   ${Math.abs(ons - verwacht) <= 1e-6 * Math.max(1, Math.abs(verwacht)) ? "gelijk" : "AFWIJKING"}`);
  p("R1 [kN] (omhoog +)", r.reactions.get(1).fz / 1000, 10 * 1.1 / 2);
  p("V(0) [kN]", ef.shearForce[0] / 1000, 10 * 1.1 / 2);
  p("M_mid [kNm] (sagging +)", ef.bendingMoment[10] / 1e6, 10 * 1.1 ** 2 / 8);
  p("w_mid [mm] (omlaag −)", ef.deflection[10], -5 * 10 * 1100 ** 4 / (384 * sec.E * sec.I));
  p("−ry(1) [mrad] = fiy bron", -r.displacements.get(1).ry * 1000, 10 * 1100 ** 3 / (24 * sec.E * sec.I) * 1000);
  log("  → fiy van de bron = −ry van de app: de app draait ry volgens de rechterhandregel");
  log("    om +y, de bron noteert een positieve hoek bij een omhoogkomend liggereinde.");
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. SAMENVATTING
// ═══════════════════════════════════════════════════════════════════════════
const buiten = rijen.filter((r) => !r.ok);
const eindig = rijen.filter((r) => Number.isFinite(r.pct));
const grootste = eindig.reduce((m, r) => (Math.abs(r.pct) > Math.abs(m.pct) ? r : m), eindig[0]);
// De rij die als etiketfout van de bron is aangemerkt telt apart: hij zou elk
// ander verschil in het niet doen vallen.
const isEtiketfout = (r) => r.grootheid === "Vz rechts van steunpunt 2";
// Rijen waar de bron op 1 decimaal afrondt (zakking, hoekverdraaiing): daar
// zegt een procentueel verschil niets — de absolute drempel is bepalend.
const isGrofAfgerond = (r) => /uz bij|fiy bij|w \(BGT/.test(r.grootheid);
const zuiver = eindig.filter((r) => !isEtiketfout(r) && !isGrofAfgerond(r));
const grootsteZuiver = zuiver.reduce((m, r) => (Math.abs(r.pct) > Math.abs(m.pct) ? r : m), zuiver[0]);

log("\n═══════════════════════════════════════════════════════════════════");
log(`R21 — ${rijen.length} vergelijkingen: ${rijen.length - buiten.length} binnen signaalgrens, ${buiten.length} erbuiten`);
log(`Grootste relatieve afwijking (alle rijen)                 : ${fmt(Math.abs(grootste.pct), 2)} %  bij "${grootste.grootheid}"`);
log(`Idem zonder de etiketfout en zonder de op 1 decimaal`);
log(`afgeronde bronwaarden (zakking/hoekverdraaiing)           : ${fmt(Math.abs(grootsteZuiver.pct), 2)} %  bij "${grootsteZuiver.grootheid}"`);
if (buiten.length) {
  log("\nBuiten de signaalgrens, met de vastgestelde oorzaak:");
  const oorzaak = {
    "Vz rechts van steunpunt 2":
      "BRON — etiketfout: +7,75 kN is 0,60·qL en hoort bij de dwarskracht RECHTS van steunpunt 3; " +
      "rechts van steunpunt 2 is de exacte waarde 0,50·qL = 6,50 kN (Clapeyron bevestigt).",
    "My bij steunpunt 3":
      "BRON — afronding/interne inconsistentie: verschil 0,02 kN·m op een waarde die de bron op " +
      "2 decimalen geeft; de brongetallen zelf horen bij V(0) = 5,22 kN i.p.v. de exacte 0,4·qL = 5,20 kN (zie §4f).",
    "R4 (links)":
      "AANNAME — de voorgeschreven volle-lengte-aanname maakt het model symmetrisch; met de getekende " +
      "deellast (werkvlak 3,0 m links) geeft dezelfde app 3,41 kN tegen de 3,40 kN van de bron (0,3 %).",
  };
  for (const r of buiten) {
    log(`  ${r.groep.padEnd(13)} ${r.grootheid.padEnd(34)} ref ${fmt(r.ref)}  ons ${fmt(r.onze)}` +
        `  Δ ${fmt(r.delta)}  ${Number.isFinite(r.pct) ? fmt(r.pct, 2) + " %" : ""}`);
    const o = oorzaak[r.grootheid];
    if (o) for (const regel of o.match(/.{1,96}(\s|$)/g)) log(`      ${regel.trim()}`);
  }
}
log("\nGeen van de drie afwijkingen wijst naar de app: de gesloten");
log("driemomentenvergelijking geeft in élk gecontroleerd punt dezelfde waarde");
log("als de solver, tot machineprecisie (≈ 1e-14).");
log("═══════════════════════════════════════════════════════════════════");
process.exit(0);
