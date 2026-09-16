// Belastinggevallen en combinaties — tegen de NB-tabellen en tegen de hand.
//
// WAT HIER VASTLIGT
// De basisaudit van september 2026 mat vier fouten in de combinaties, en de
// groene testbatterij ving er geen:
//   nr 1  een nieuw belastinggeval telde in geen enkele combinatie mee
//         (IPE300 6 m, G = 4 + geval 5 met 10 kN/m: 24,3 kNm waar 85,05 hoort);
//   nr 14 een verwijderd geval liet factoren achter, en het volgende geval
//         erfde die via zijn hergebruikte id (HEA200: UGT 47,25 waar 48,6 hoort);
//   nr 2  de gevolgklasse veranderde niets (ligger G = 10, Q = 5: 87,75 kNm
//         voor CC1, CC2 én CC3);
//   nr 3  de zijdelingse toets nam wind × 0,6 (portaal 6×5 m: 2,260 mm waar
//         de karakteristieke combinatie met wind leidend 3,756 mm geeft).
// Plus de EN-ψ in plaats van de NB-ψ (ruw 6/39), eigen gewicht in het eerste
// geval ongeacht type (ruw 7) en de ψ-tabel van de crate nen-en-1990 (ruw 8/40).
//
// ELK VERWACHT GETAL IS MET DE HAND AFGELEID en staat met zijn afleiding bij de
// controle. Geen opgeslagen uitkomst: een test die alleen de huidige uitkomst
// vastlegt, had de fouten hierboven óók groen gehouden.
//
// Draaien met: npx tsx test-belastingcombinaties.mjs

import { readFileSync } from "node:fs";

const {
  genereerStandaardCombinaties, PARTIELE_FACTOREN, PSI_GEBRUIK, PSI_SNEEUW, PSI_WIND, K_FI,
  MAX_VRIJE_GEVALLEN,
} = await import("./src/components/fem/solver/normcombinaties.ts");
const {
  defaultCombinations, combineResults, computeEnvelope, combinatiesVanSoort,
} = await import("./src/components/fem/solver/combinations.ts");
const {
  voegBelastinggevalToe, wijzigBelastinggeval, verwijderBelastinggeval, zetGevolgklasse,
  vervangDoorStandaard, wijzigCombinatie, voegCombinatieToe, meldingenBelastinggevallen,
  beoordeelCombinatiesBijOpenen, openCombinatieStaat, verwijderCombinatie,
  ontbrekendeStandaardcombinaties, blijvendeFactorAfwijkingen, herstelCombinaties,
} = await import("./src/lib/combinatieBeheer.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { bepaalDoorbuigingsInvoer } = await import("./src/lib/steelCheckBuilder.ts");
const { combinationsToFile, combinationsFromFile, deserializeProject, serializeProject } = await import("./src/io/projectFile.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, actueel, verwacht, tolPct = 0.01) {
  const tol = Math.abs(verwacht) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actueel) && Math.abs(actueel - verwacht) <= tol;
  if (ok) { passed++; log(`  ✓ ${naam}: ${actueel.toFixed(4)} ≈ ${verwacht.toFixed(4)}`); }
  else { failed++; log(`  ✗ ${naam}: ${actueel} vs ${verwacht}`); }
}
function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}
const factoren = (c) => Object.fromEntries([...c.factors].sort((a, b) => a[0] - b[0]));
function checkFactoren(naam, combo, verwacht) {
  const a = JSON.stringify(combo ? factoren(combo) : null);
  const v = JSON.stringify(Object.fromEntries(Object.entries(verwacht).sort((p, q) => p[0] - q[0])));
  if (a === v) { passed++; log(`  ✓ ${naam}: ${a}`); }
  else { failed++; log(`  ✗ ${naam}: ${a} vs ${v}`); }
}

const START = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)", type: "live" },
  { id: 3, name: "Sneeuw (S)", type: "snow" },
  { id: 4, name: "Wind (W)", type: "wind" },
];
const staatVan = (loadCases, gevolgklasse = "CC2") => {
  const combinations = defaultCombinations(loadCases, gevolgklasse);
  return {
    loadCases, combinations, gevolgklasse,
    volgendGevalId: Math.max(...loadCases.map((c) => c.id)) + 1,
    volgendCombinatieId: combinations.length + 1,
  };
};
/** M_max (kNm) van staaf `id` over de combinaties van type `type`. */
const mMax = (combos, perCase, type, id = 1) =>
  computeEnvelope(combos.filter((c) => c.type === type), perCase).elements.get(id).M_max / 1e6;

// De standaardset van vóór september 2026, letterlijk zoals hij in
// combinations.ts stond — als fixture voor een oud projectbestand.
const OUDE_STANDAARD = [
  { id: 1, name: "ULS 6.10a", type: "uls", formula: "1.35G + 1.5·ψ₀·Q + 1.5·ψ₀·S + 1.5·ψ₀·W", factors: new Map([[1, 1.35], [2, 1.05], [3, 1.05], [4, 0.9]]) },
  { id: 2, name: "ULS 6.10b (Q leidend)", type: "uls", formula: "1.2G + 1.5Q + 1.5·ψ₀·S + 1.5·ψ₀·W", factors: new Map([[1, 1.2], [2, 1.5], [3, 1.05], [4, 0.9]]) },
  { id: 3, name: "ULS 6.10b (S leidend)", type: "uls", formula: "1.2G + 1.5S + 1.5·ψ₀·Q + 1.5·ψ₀·W", factors: new Map([[1, 1.2], [3, 1.5], [2, 1.05], [4, 0.9]]) },
  { id: 4, name: "ULS 6.10b (W leidend)", type: "uls", formula: "1.2G + 1.5W + 1.5·ψ₀·Q + 1.5·ψ₀·S", factors: new Map([[1, 1.2], [4, 1.5], [2, 1.05], [3, 1.05]]) },
  { id: 5, name: "ULS uplift", type: "uls", formula: "0.9G + 1.5W", factors: new Map([[1, 0.9], [4, 1.5]]) },
  { id: 6, name: "SLS Karakteristiek", type: "sls", formula: "G + Q + ψ₀·S + ψ₀·W", factors: new Map([[1, 1.0], [2, 1.0], [3, 0.7], [4, 0.6]]) },
  { id: 7, name: "SLS Frequent", type: "sls", formula: "G + ψ₁·Q + ψ₂·S", factors: new Map([[1, 1.0], [2, 0.5], [3, 0.2]]) },
  { id: 8, name: "SLS Quasi-permanent", type: "sls", formula: "G + ψ₂·Q", factors: new Map([[1, 1.0], [2, 0.3]]) },
];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De tabellen zijn die van NEN-EN 1990:2002/NB:2019 (pdftotext -raw)");
{
  // NB.4 (CC2) en NB.5 (CC1, CC3): 6.10a γ_G / 6.10b γ_G / γ_Q; γ_G,inf = 0,9.
  for (const [cc, a, b, q] of [["CC1", 1.2, 1.1, 1.35], ["CC2", 1.35, 1.2, 1.5], ["CC3", 1.5, 1.3, 1.65]]) {
    const f = PARTIELE_FACTOREN[cc];
    checkWaar(`${cc}: 6.10a γ_G = ${a}, 6.10b γ_G = ${b}, γ_Q = ${q}, γ_G,inf = 0,9`,
      f.gGsup610a === a && f.gGsup610b === b && f.gQ === q && f.gGinf === 0.9);
  }
  checkWaar("K_FI 0,9 / 1,0 / 1,1 (opmerking bij NB.4)", K_FI.CC1 === 0.9 && K_FI.CC2 === 1.0 && K_FI.CC3 === 1.1);
  // Tabel NB.2–A1.1, rij voor rij.
  const NB2 = {
    A: [0.4, 0.5, 0.3], B: [0.5, 0.5, 0.3], C: [0.4, 0.7, 0.6], "C-menigte": [0.6, 0.7, 0.6],
    D: [0.4, 0.7, 0.6], E: [1.0, 0.9, 0.8], F: [0.7, 0.7, 0.6], G: [0.7, 0.5, 0.3], H: [0, 0, 0],
    "industrie-kort": [0.5, 0.5, 0.3], "industrie-lang": [1.0, 0.9, 0.8],
  };
  for (const [cat, [p0, p1, p2]] of Object.entries(NB2)) {
    const ψ = PSI_GEBRUIK[cat];
    checkWaar(`NB.2 categorie ${cat}: ${p0}/${p1}/${p2}`, ψ.psi0 === p0 && ψ.psi1 === p1 && ψ.psi2 === p2);
  }
  checkWaar("NB.2 sneeuw 0/0,2/0", PSI_SNEEUW.psi0 === 0 && PSI_SNEEUW.psi1 === 0.2 && PSI_SNEEUW.psi2 === 0);
  checkWaar("NB.2 wind 0/0,2/0", PSI_WIND.psi0 === 0 && PSI_WIND.psi1 === 0.2 && PSI_WIND.psi2 === 0);

  // De Rust-kant draagt dezelfde tabellen (ruw 8/40: daar weken D, F en EQU
  // af). Gelezen als bronbestand, zodat beide kanten niet uiteen kunnen lopen
  // zonder dat dit rood wordt.
  //
  // Sinds de normnaad (september 2026) staan die tabellen niet meer in
  // nen-en-1990/src/lib.rs maar in de NL-rij van de crate `nationale-bijlage`;
  // nen-en-1990 leest ze daar uit en heeft zelf geen getallen meer. Dit is
  // hetzelfde bewijs, nu op de bron gericht in plaats van op de doorgeefluik.
  const rs = readFileSync(new URL("../src-tauri/crates/nationale-bijlage/src/ndp_1990.rs", import.meta.url), "utf8");
  const psiRs = [...rs.matchAll(/PsiFactors \{ category: "([^"]+)", description: "[^"]*", psi0: ([\d.]+), psi1: ([\d.]+), psi2: ([\d.]+) \}/g)];
  checkWaar("crate: 13 ψ-rijen gevonden", psiRs.length === 13, String(psiRs.length));
  for (const [, cat, p0, p1, p2] of psiRs) {
    const ts = cat === "Wind" ? PSI_WIND : cat === "Sneeuw" ? PSI_SNEEUW : PSI_GEBRUIK[cat];
    checkWaar(`crate ψ ${cat} = frontend`, ts && ts.psi0 === +p0 && ts.psi1 === +p1 && ts.psi2 === +p2);
  }
  const lfRs = [...rs.matchAll(/LoadFactors \{\s*name: "([^"]+)", gamma_g_sup: ([\d.]+), gamma_g_inf: ([\d.]+), gamma_q: ([\d.]+),?\s*\}/g)]
    .map(([, n, g, gi, q]) => [n, +g, +gi, +q]);
  checkWaar("crate: EQU volgens NB.3 (1,1 / 0,9 / 1,5)",
    lfRs.some(([n, g, gi, q]) => n === "EQU" && g === 1.1 && gi === 0.9 && q === 1.5));
  // De volgorde in de NL-rij is CC1 (6.10a, 6.10b), CC2, CC3, daarna EQU.
  for (const [cc, i610a] of [["CC1", 0], ["CC2", 2], ["CC3", 4]]) {
    const f = PARTIELE_FACTOREN[cc];
    const [, ga, , qa] = lfRs[i610a];
    const [, gb, , qb] = lfRs[i610a + 1];
    checkWaar(`crate ${cc} = frontend (6.10a ${ga}/${qa}, 6.10b ${gb}/${qb})`,
      ga === f.gGsup610a && qa === f.gQ && gb === f.gGsup610b && qb === f.gQ);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De standaardset voor de vier startgevallen, CC2 — met de hand");
{
  // G = 1, Q = 2 (cat. A: ψ 0,4/0,5/0,3), S = 3, W = 4 (ψ 0/0,2/0).
  // Elke uitdrukking in elke opstelling van de veranderlijke gevallen: Q is
  // aan- of afwezig (EN 1991-1-1 6.2.1(1)P, vrije belasting; EN 1990 tabel
  // A1.2(B) opm. 2: γ_Q "0 daar waar gunstig"). S en W begeleiden met
  // 1,5·0 = 0 (NB.2) en variëren dus niet mee; als leidende last zijn ze er altijd.
  //  6.10a: 1,35·G + 1,5·0,4·Q = 1,35 G + 0,6 Q  | zonder Q: 1,35 G
  //  6.10b Q leidend: 1,2 G + 1,5 Q
  //        S leidend: 1,2 G + 1,5 S + 0,6 Q      | zonder Q: 1,2 G + 1,5 S;  W idem
  //  gunstig: 0,9 G + 1,5 × leidend (+ 0,6 Q     | zonder Q, als Q begeleidt)
  //  6.14b: G + leidend (+ 0,4 Q                 | zonder Q, als Q begeleidt)
  //  6.15b: G + ψ₁·leidend (0,5 Q; 0,2 S; 0,2 W) (+ ψ₂·Q = 0,3 Q | zonder Q)
  //  6.16b: G + 0,3 Q                            | zonder Q: G
  // 2 + 5 + 5 (UGT) + 5 + 5 + 2 (BGT) = 24.
  const c = defaultCombinations();
  checkWaar("vierentwintig combinaties, id 1…24", c.length === 24 && c.every((x, i) => x.id === i + 1));
  const verwacht = [
    ["UGT 6.10a", "uls", { 1: 1.35, 2: 0.6 }],
    ["UGT 6.10a — zonder Variabel (Q)", "uls", { 1: 1.35 }],
    ["UGT 6.10b — Variabel (Q) leidend", "uls", { 1: 1.2, 2: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend", "uls", { 1: 1.2, 2: 0.6, 3: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend, zonder Variabel (Q)", "uls", { 1: 1.2, 3: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend", "uls", { 1: 1.2, 2: 0.6, 4: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend, zonder Variabel (Q)", "uls", { 1: 1.2, 4: 1.5 }],
    ["UGT 6.10b — Variabel (Q) leidend, blijvend gunstig", "uls", { 1: 0.9, 2: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend, blijvend gunstig", "uls", { 1: 0.9, 2: 0.6, 3: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend, blijvend gunstig, zonder Variabel (Q)", "uls", { 1: 0.9, 3: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend, blijvend gunstig", "uls", { 1: 0.9, 2: 0.6, 4: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend, blijvend gunstig, zonder Variabel (Q)", "uls", { 1: 0.9, 4: 1.5 }],
    ["BGT karakteristiek 6.14b — Variabel (Q) leidend", "sls", { 1: 1, 2: 1 }],
    ["BGT karakteristiek 6.14b — Sneeuw (S) leidend", "sls", { 1: 1, 2: 0.4, 3: 1 }],
    ["BGT karakteristiek 6.14b — Sneeuw (S) leidend, zonder Variabel (Q)", "sls", { 1: 1, 3: 1 }],
    ["BGT karakteristiek 6.14b — Wind (W) leidend", "sls", { 1: 1, 2: 0.4, 4: 1 }],
    ["BGT karakteristiek 6.14b — Wind (W) leidend, zonder Variabel (Q)", "sls", { 1: 1, 4: 1 }],
    ["BGT frequent 6.15b — Variabel (Q) leidend", "sls", { 1: 1, 2: 0.5 }],
    ["BGT frequent 6.15b — Sneeuw (S) leidend", "sls", { 1: 1, 2: 0.3, 3: 0.2 }],
    ["BGT frequent 6.15b — Sneeuw (S) leidend, zonder Variabel (Q)", "sls", { 1: 1, 3: 0.2 }],
    ["BGT frequent 6.15b — Wind (W) leidend", "sls", { 1: 1, 2: 0.3, 4: 0.2 }],
    ["BGT frequent 6.15b — Wind (W) leidend, zonder Variabel (Q)", "sls", { 1: 1, 4: 0.2 }],
    ["BGT quasi-blijvend 6.16b", "sls", { 1: 1, 2: 0.3 }],
    ["BGT quasi-blijvend 6.16b — zonder Variabel (Q)", "sls", { 1: 1 }],
  ];
  verwacht.forEach(([naam, type, f], i) => {
    checkWaar(`${i + 1}: naam en type "${naam}"`, c[i]?.name === naam && c[i]?.type === type, c[i]?.name);
    checkFactoren(`${i + 1}: factoren`, c[i], f);
  });
  checkWaar("elke standaardcombinatie draagt haar kenmerk", c.every((x) => x.standaard?.gevolgklasse === "CC2"));
  checkWaar("de formule noemt de vindplaats (NB.4 in de UGT, NB.2 overal)",
    c.filter((x) => x.type === "uls").every((x) => /NB\.4/.test(x.formula)) &&
    c.every((x) => /NB\.2/.test(x.formula)));
  checkWaar("combinatiesVanSoort vindt vijf karakteristieke combinaties", combinatiesVanSoort(c, "6.14b").length === 5);
  checkWaar("de volledige opstelling houdt haar sleutel; een opstelling zonder Q krijgt |zonder:2",
    c[3]?.standaard.sleutel === "6.10b|S:3" && c[4]?.standaard.sleutel === "6.10b|S:3|zonder:2");

  // Categorie E (opslag) begeleidt met ψ₀ = 1,0 en is quasi-blijvend met 0,8;
  // tot september 2026 was dat 0,7 en 0,3 (ruw 39, te gunstig voor kruip).
  const e = genereerStandaardCombinaties([{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Opslag", type: "live", categorie: "E" }]);
  checkFactoren("cat. E: 6.10a = 1,35 G + 1,5·1,0 Q", e.find((x) => x.standaard.soort === "6.10a"), { 1: 1.35, 2: 1.5 });
  checkFactoren("cat. E: 6.16b = G + 0,8 Q", e.find((x) => x.standaard.soort === "6.16b"), { 1: 1, 2: 0.8 });

  // Twee windgevallen zijn alternatieven: nooit samen in één combinatie.
  const w2 = genereerStandaardCombinaties([
    { id: 1, name: "G", type: "dead" }, { id: 7, name: "Wind links", type: "wind" }, { id: 8, name: "Wind rechts", type: "wind" },
  ]);
  checkWaar("twee windgevallen staan nooit samen in een combinatie",
    w2.every((x) => !(x.factors.has(7) && x.factors.has(8))));
  checkWaar("elk windgeval leidt in een eigen 6.14b",
    w2.some((x) => x.standaard.sleutel === "6.14b|W:7") && w2.some((x) => x.standaard.sleutel === "6.14b|W:8"));
  // Gegenereerde windgevallen: die combineert de windgenerator zelf.
  const gen = genereerStandaardCombinaties([
    { id: 1, name: "G", type: "dead" }, { id: 9, name: "Wind gen", type: "wind", gegenereerd: { bron: "wind", sleutel: "w" } },
  ]);
  checkWaar("een gegenereerd windgeval staat niet in de standaardset", gen.every((x) => !x.factors.has(9)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Bevinding nr 1 — een nieuw geval telt mee, of er komt een FOUT");
{
  // IPE300 S235, 6 m vrij opgelegd, G = 4 kN/m in geval 1.
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
  const beams = [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }];
  const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
  const lastG = { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -4 };
  const reken = (staat, loads) => {
    const { perCase } = solveAllCases(bouwMultiInput({
      nodes, beams, supports, plates: [], loadCases: staat.loadCases, loads,
      selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
    }));
    return mMax(staat.combinations, perCase, "uls");
  };

  let staat = staatVan([...START]);
  const toegevoegd = voegBelastinggevalToe(staat, "Geval 5");
  staat = toegevoegd.staat;
  checkWaar("het nieuwe geval krijgt id 5 en type overig", toegevoegd.id === 5 && staat.loadCases.at(-1).type === "other");
  const last5 = { id: 2, type: "lineLoad", caseId: 5, beamId: 1, q: -10 };
  const meldingen = meldingenBelastinggevallen({ loadCases: staat.loadCases, combinations: staat.combinations, loads: [lastG, last5] });
  const fout5 = meldingen.find((m) => m.caseId === 5);
  checkWaar("type overig met last → FOUT, geen stille nul", fout5?.niveau === "fout" && /overig/.test(fout5.tekst) && /NUL/.test(fout5.tekst), fout5?.tekst);
  // Zolang de fout staat telt geval 5 niet: 1,35·4·6²/8 = 24,30 kNm.
  check("zonder type: M_max = 1,35·4·6²/8 = 24,30 kNm (en de FOUT hierboven)", reken(staat, [lastG, last5]), 24.3);

  staat = wijzigBelastinggeval(staat, 5, { type: "dead" });
  const ugtMetFactor = staat.combinations.filter((c) => c.type === "uls" && (c.factors.get(5) ?? 0) !== 0);
  checkWaar("na type blijvend: factor ≠ 0 in minstens één UGT-combinatie", ugtMetFactor.length > 0, `${ugtMetFactor.length} combinaties`);
  checkWaar("in elke combinatie dezelfde factor als G", staat.combinations.every((c) => c.factors.get(5) === c.factors.get(1)));
  checkWaar("en geen meldingen meer",
    meldingenBelastinggevallen({ loadCases: staat.loadCases, combinations: staat.combinations, loads: [lastG, last5] }).length === 0);
  // 6.10a: 1,35·(4 + 10) = 18,9 kN/m > 6.10b: 1,2·14 = 16,8 → M = 18,9·36/8 = 85,05 kNm.
  check("M_max = 1,35·14·6²/8 = 85,05 kNm", reken(staat, [lastG, last5]), 85.05);

  // Met het type meteen bij het toevoegen: hetzelfde getal.
  const direct = voegBelastinggevalToe(staatVan([...START]), "Afbouw", "dead").staat;
  check("addLoadCase met type blijvend: 85,05 kNm", reken(direct, [lastG, last5]), 85.05);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Bevinding nr 14 — verwijderen laat nergens een factor achter; ids komen niet terug");
{
  // HEA200 6 m, G = −5 kN/m. Wind (id 4) weg, dan "Permanent afbouw" −3 kN/m.
  const E = 210000, A = 5383, I = 3.692e7, L = 6000;
  let staat = staatVan([...START]);
  staat = voegCombinatieToe(staat, { name: "Eigen met wind", type: "uls", formula: "G + W", factors: new Map([[1, 1], [4, 1]]) });
  staat = verwijderBelastinggeval(staat, 4);
  checkWaar("na verwijderen staat nergens een factor voor id 4", staat.combinations.every((c) => !c.factors.has(4)));
  checkWaar("ook niet in de eigen combinatie", staat.combinations.find((c) => c.name === "Eigen met wind")?.factors.has(4) === false);
  checkWaar("de combinaties met wind leidend zijn weg", staat.combinations.every((c) => !/W:4/.test(c.standaard?.sleutel ?? "")));

  const { staat: na, id } = voegBelastinggevalToe(staat, "Permanent afbouw", "dead");
  checkWaar("het nieuwe geval krijgt id 5, niet het vrijgekomen 4", id === 5, `id ${id}`);
  const perCase = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -5, caseId: 1 }, { beamId: 1, q: -3, caseId: 5 }],
    pointLoads: [], cases: na.loadCases.map((c) => ({ id: c.id, name: c.name })),
  }).perCase;
  // UGT: 6.10a 1,35·(5 + 3) = 10,8 kN/m → 10,8·36/8 = 48,60 kNm (audit: app gaf 47,25).
  check("UGT-omhullende = 1,35·8·6²/8 = 48,60 kNm", mMax(na.combinations, perCase, "uls"), 48.6);
  // BGT: blijvend telt met 1,0 → 8·36/8 = 36,00 kNm (audit: app gaf 30,60 via 0,6 van wind).
  check("BGT-omhullende = 1,0·8·6²/8 = 36,00 kNm", mMax(na.combinations, perCase, "sls"), 36.0);

  // Het hoogste id weghalen en weer toevoegen: de teller loopt niet terug.
  const weg5 = verwijderBelastinggeval(na, 5);
  checkWaar("na verwijderen van 5 krijgt het volgende geval 6", voegBelastinggevalToe(weg5, "X").id === 6);
  checkWaar("het laatste geval is niet te verwijderen",
    verwijderBelastinggeval(staatVan([{ id: 1, name: "G", type: "dead" }]), 1).loadCases.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Bevinding nr 2 — de gevolgklasse kiest de factoren van NB.4/NB.5");
{
  // Ligger 6 m, G = 10 kN/m (geval 1), Q = 5 kN/m (geval 2, cat. A: ψ₀ = 0,4).
  const perCase = solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 5000, I: 1e8 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }, { beamId: 1, q: -5, caseId: 2 }],
    pointLoads: [], cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }],
  }).perCase;
  const gevallen = [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }];
  // CC3: 6.10a 1,5·10 + 1,65·0,4·5 = 18,30; 6.10b 1,3·10 + 1,65·5 = 21,25 → 21,25·36/8 = 95,625
  // CC2: 6.10a 13,5 + 3,0 = 16,50;          6.10b 12 + 7,5 = 19,50       → 87,750
  // CC1: 6.10a 1,2·10 + 1,35·0,4·5 = 14,70; 6.10b 1,1·10 + 1,35·5 = 17,75 → 79,875
  for (const [cc, M] of [["CC3", 95.625], ["CC2", 87.75], ["CC1", 79.875]]) {
    check(`${cc}: M_max UGT`, mMax(defaultCombinations(gevallen, cc), perCase, "uls"), M);
  }
  const cc3 = defaultCombinations(gevallen, "CC3");
  checkFactoren("CC3 6.10b Q leidend = 1,3 G + 1,65 Q", cc3.find((c) => c.name === "UGT 6.10b — Q leidend"), { 1: 1.3, 2: 1.65 });
  checkFactoren("CC3 6.10a = 1,5 G + 0,66 Q", cc3.find((c) => c.name === "UGT 6.10a"), { 1: 1.5, 2: 0.66 });

  // De klasse wijzigen werkt de standaardcombinaties bij, met behoud van id —
  // en laat een eigen combinatie ongemoeid.
  let staat = staatVan(gevallen, "CC2");
  staat = voegCombinatieToe(staat, { name: "Eigen", type: "uls", formula: "1,2G", factors: new Map([[1, 1.2]]) });
  const ids = staat.combinations.map((c) => c.id);
  staat = zetGevolgklasse(staat, "CC3");
  checkWaar("zelfde id's na het wijzigen van de klasse", JSON.stringify(staat.combinations.map((c) => c.id)) === JSON.stringify(ids));
  check("na zetGevolgklasse(CC3): 95,625 kNm", mMax(staat.combinations.filter((c) => c.standaard), perCase, "uls"), 95.625);
  checkFactoren("de eigen combinatie is niet aangepast", staat.combinations.find((c) => c.name === "Eigen"), { 1: 1.2 });

  // Een aangepaste standaardcombinatie wordt een eigen combinatie en volgt niet meer.
  const aangepast = wijzigCombinatie(staatVan(gevallen, "CC2"), 1, { factors: new Map([[1, 1.4], [2, 0.6]]) });
  checkWaar("wijzigen haalt het kenmerk weg", aangepast.combinations.find((c) => c.id === 1).standaard === undefined);
  const naKlasse = zetGevolgklasse(aangepast, "CC3");
  checkFactoren("…en de klasse verandert haar factoren niet", naKlasse.combinations.find((c) => c.id === 1), { 1: 1.4, 2: 0.6 });
  checkWaar("…en de 6.10a komt niet ongevraagd terug", naKlasse.combinations.filter((c) => c.standaard?.sleutel === "6.10a").length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Bevinding nr 3 — de zijdelingse toets envelopt over de karakteristieke combinaties");
{
  // Portaal 6 × 5 m, ingeklemde voeten, E = 210 000, I = 1e8 mm⁴ voor alle
  // staven; G = 5 en Q = 2 kN/m op de regel, wind 10 kN op knoop 2.
  const portaal = (A) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 5000 }, { id: 3, x: 6000, z: 5000 }, { id: 4, x: 6000, z: 0 }],
    beams: [1, 2, 3].map((id) => ({ id, from: id, to: id + 1, E: 210000, A, I: 1e8 })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    loads: [{ beamId: 2, q: -5, caseId: 1 }, { beamId: 2, q: -2, caseId: 2 }],
    pointLoads: [{ nodeId: 2, fx: 10000, fz: 0, caseId: 4 }],
    cases: START.map((c) => ({ id: c.id, name: c.name })),
  });
  const staven = [1, 2, 3].map((id) => ({ id, from: id, to: id + 1 }));
  const kolom = staven[0];
  const invoer = (input, combos) => {
    const { perCase } = solveAllCases(input);
    const combinationResults = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
    return {
      inv: bepaalDoorbuigingsInvoer(kolom, { nodes: input.nodes, beams: staven, supports: input.supports, combinations: combos, combinationResults }),
      perCase,
    };
  };

  const combos = defaultCombinations();
  const { inv, perCase } = invoer(portaal(5000), combos);
  // Referentie: de combinatie die A1.4.3(7) vraagt, G + W + ψ₀,Q·Q = G + W + 0,4·Q.
  const ref = combineResults({ id: 99, name: "ref", type: "sls", formula: "", factors: new Map([[1, 1], [4, 1], [2, 0.4]]) }, perCase);
  const uRef = ref.displacements.get(2).ux - ref.displacements.get(1).ux;
  checkWaar("de eis is de zijdelingse (h/300)", inv.eis === "zijdelings");
  check("u = die van G + W + 0,4·Q (dezelfde combinatie)", inv.wMm, uRef, 1e-6);
  check("u = 3,756 mm (audit: de app gaf 2,260 met W × 0,6)", inv.wMm, 3.756, 0.02);
  checkWaar("de notitie noemt wind leidend als maatgevend",
    inv.notes.some((n) => /Maatgevend is "BGT karakteristiek 6\.14b — Wind \(W\) leidend"/.test(n)));
  checkWaar("en geen LET OP over een ontbrekende leidende last", !inv.notes.some((n) => /^LET OP: belastinggeval/.test(n)));

  // Onafhankelijk: met A → ∞ verdwijnt de normaalkrachtvervorming en geldt de
  // handformule voor een portaal met ingeklemde voeten en stijve hoeken
  // (hoekverdraaiingsmethode, θ_B = θ_C door antisymmetrie):
  //   K = 24·E·I_c/h³ · (1 + 6k)/(4 + 6k),  k = (I_b/L)/(I_c/h) = 5/6
  //     = 24·210000·1e8/5000³ · 6/9 = 4032 · 2/3 = 2688 N/mm
  //   u = H/K = 10 000/2688 = 3,7202 mm
  // De 1,0 % tot 3,756 is de verlenging en verkorting van regel en kolommen
  // bij A = 5000 mm², plus de naar binnen trekkende kolomkop onder G en Q.
  const star = invoer(portaal(1e9), combos).inv;
  check("A → ∞: u = 10 000 / 2688 = 3,7202 mm (handformule)", star.wMm, 10000 / 2688, 0.1);

  // De volgorde van de lijst doet er niet meer toe.
  const omgekeerd = invoer(portaal(5000), [...combos].reverse()).inv;
  check("omgekeerde combinatievolgorde: dezelfde u", omgekeerd.wMm, inv.wMm, 1e-9);

  // Een oud projectbestand (G + Q + 0,7·S + 0,6·W): geen W leidend → LET OP.
  const oud = invoer(portaal(5000), OUDE_STANDAARD).inv;
  check("oude set: u met W × 0,6 = 2,260 mm (de auditwaarde)", oud.wMm, 2.26, 0.05);
  checkWaar("oude set: LET OP dat 3 en 4 nooit leidend zijn",
    oud.notes.some((n) => /^LET OP: belastinggeval 3, 4 /.test(n)), oud.notes.find((n) => /LET OP/.test(n)));

  // Geen enkele karakteristieke combinatie: melden, niet 6.14b claimen.
  const zonder = invoer(portaal(5000), combos.filter((c) => c.type === "uls" || !/karakter/.test(c.name))).inv;
  checkWaar("zonder 6.14b: de notitie zegt dat het GEEN toetsing volgens A1.4.3(7) is",
    zonder.notes.some((n) => /GEEN karakteristieke combinatie/.test(n)));
  checkWaar("en claimt niet dat u uit een karakteristieke combinatie komt",
    !zonder.notes.some((n) => /karakteristieke BGT-combinaties \(6\.14b\) —/.test(n)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Een oud projectbestand: de oude standaardcombinaties worden bij het openen vervangen");
{
  // Besluit van september 2026 (zie de kop van lib/combinatieBeheer): vervangen,
  // met een melding en ongedaan maken. Tot dan gold "melden, niet overschrijven";
  // dat liet langs steeds nieuwe routes stil te lage getallen door. De getallen
  // zelf staan in test-oude-projecten.mjs.
  const o = openCombinatieStaat({ loadCases: START, combinations: OUDE_STANDAARD, gevolgklasse: "CC2" });
  checkWaar("alle acht oude combinaties worden herkend en vervangen", o.vervanging?.oudeStandaard.length === 8);
  checkWaar("de nieuwe standaardset (24, zie [2]) staat ervoor in de plaats",
    o.staat.combinations.length === 24 && o.staat.combinations.every((c) => c.standaard?.gevolgklasse === "CC2"));
  checkWaar("de melding noemt de NB-ψ en de gevolgklasse",
    /ψ uit tabel NB\.2–A1\.1/.test(o.vervanging?.samenvatting ?? "") && /gevolgklasse CC2/.test(o.vervanging?.samenvatting ?? ""),
    o.vervanging?.samenvatting);
  checkWaar("de lijst van ervoor is bewaard, voor ongedaan maken", o.vervanging?.voor.length === 8);
  checkWaar("en er is verder niets te melden", o.afwijking === null);

  // Rondgang door het projectbestand: het kenmerk blijft staan.
  const terug = combinationsFromFile(JSON.parse(JSON.stringify(combinationsToFile(defaultCombinations()))));
  checkWaar("het kenmerk overleeft opslaan en openen", terug.every((c) => c.standaard?.sleutel));
  const inhoudVan = (lijst) => JSON.stringify(lijst.map((c) => [c.id, c.name, c.formula, [...c.factors], c.standaard]));
  checkWaar("een huidig bestand met standaardcombinaties: niets vervangen, geen melding", (() => {
    const r = openCombinatieStaat({ loadCases: START, combinations: terug, gevolgklasse: "CC2" });
    return r.vervanging === null && r.afwijking === null && inhoudVan(r.staat.combinations) === inhoudVan(terug);
  })());
  checkWaar("een CC2-bestand geopend als CC3: de twaalf UGT-combinaties worden bijgewerkt, de BGT niet", (() => {
    // De twaalf UGT-combinaties van [2] hebben onder CC3 andere γ (NB.5); de
    // twaalf BGT-combinaties dezelfde factoren, en tellen dus niet als bijgewerkt.
    const r = openCombinatieStaat({ loadCases: START, combinations: terug, gevolgklasse: "CC3" });
    return r.vervanging !== null && r.vervanging.bijgewerkt.length === 12 &&
      r.vervanging.bijgewerkt.every((x) => /^UGT/.test(x.naam)) &&
      r.staat.combinations.every((c) => c.standaard?.gevolgklasse === "CC3");
  })());
  const kapot = combinationsFromFile([{ id: 1, name: "x", type: "uls", formula: "", factors: { 1: 1 }, standaard: { sleutel: "6.10a", soort: "onzin", gevolgklasse: "CC2" } }]);
  checkWaar("een onleesbaar kenmerk maakt er een eigen combinatie van", kapot[0].standaard === undefined);

  // De expliciete actie: vervangen, met behoud van de windgenerator.
  const staat = {
    loadCases: START, gevolgklasse: "CC2", volgendGevalId: 5, volgendCombinatieId: 9,
    combinations: [...OUDE_STANDAARD, { id: 20, name: "Wind-gen · UGT x", type: "uls", formula: "…", factors: new Map([[1, 1.2]]) }],
  };
  const vervangen = vervangDoorStandaard(staat);
  checkWaar("vervangen: 24 standaard + 1 windgenerator",
    vervangen.combinations.length === 25 && vervangen.combinations.filter((c) => c.standaard).length === 24);
  checkWaar("vervangen: nieuwe id's vanaf de teller, geen hergebruik",
    vervangen.combinations.filter((c) => c.standaard).every((c) => c.id >= 21));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Ruw 7 — eigen gewicht zonder blijvend geval landt niet stil in het eerste geval");
{
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -2 }],
    selfWeightEnabled: true, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  checkWaar("zonder blijvend geval: geen eigengewichtlast in het veranderlijke geval",
    bouwMultiInput(model).loads.length === 1);
  const m = meldingenBelastinggevallen({ loadCases: model.loadCases, combinations: defaultCombinations(model.loadCases), loads: model.loads, selfWeightEnabled: true });
  checkWaar("…en een FOUT die dat zegt", m.some((x) => x.caseId === null && x.niveau === "fout" && /blijvend/.test(x.tekst)));
  const metG = { ...model, loadCases: [{ id: 1, name: "Q", type: "live" }, { id: 2, name: "G", type: "dead" }] };
  const eg = bouwMultiInput(metG).loads.filter((l) => l.caseId === 2);
  checkWaar("met blijvend geval: het eigen gewicht komt dáár", eg.length === 1);
  // IPE300: A = 5381 mm², ρ = 7850 kg/m³ → 5381e-6 m² · 7850 · 9,81 = 414,4 N/m
  // = 0,4144 N/mm (de solver rekent in N en mm). Marge 1,5 % voor de afgeronde
  // A en ρ·g van de profieltabel.
  check("eigen gewicht IPE300 = A·ρ·g = 0,414 N/mm", Math.abs(eg[0]?.q ?? 0), (5381e-6 * 7850 * 9.81) / 1000, 1.5);
  checkWaar("een leeg geval van type overig is een waarschuwing, geen fout",
    meldingenBelastinggevallen({ loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Leeg", type: "other" }], combinations: defaultCombinations([{ id: 1, name: "G", type: "dead" }]), loads: [{ caseId: 1 }] })
      .find((x) => x.caseId === 2)?.niveau === "waarschuwing");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] De MCP-weg: dezelfde standaardset, dezelfde meldingen, de gevolgklasse erbij");
{
  const model = (extraCase) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }, ...(extraCase ? [extraCase] : [])],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -5 },
      ...(extraCase ? [{ id: 3, type: "lineLoad", caseId: extraCase.id, beamId: 1, q: -3 }] : []),
    ],
    selfWeightEnabled: false,
  });
  const solve = (payload) => verwerkVerzoek({ v: 1, id: 1, op: "solve", payload });

  const cc3 = solve({ model: model(), gevolgklasse: "CC3" });
  checkWaar("solve met gevolgklasse CC3 slaagt", cc3.ok === true, JSON.stringify(cc3.error ?? {}));
  // G + Q: UGT 6.10a met en zonder Q, 6.10b Q leidend, gunstig Q leidend (4);
  // BGT 6.14b Q, 6.15b Q, 6.16b met en zonder Q (4). Tot september 2026 liet
  // zuiver staal 6.15b en de volledige 6.16b hier weg (zes doorgerekend, twee
  // overgeslagen). Deze ligger krijgt echter de vloer-/dakeis van NEN-EN 1990
  // A1.4.3(3)/(4), die de frequente en de quasi-blijvende combinatie leest —
  // dus alle acht doorgerekend, niets overgeslagen (issue #10, zie
  // lib/combinatieSelectie.ts).
  checkWaar("de standaardset komt uit de gevallen van het model: 8 doorgerekend, 0 overgeslagen",
    Object.keys(cc3.result?.combinations ?? {}).length === 8 && (cc3.result?.combinations_skipped ?? []).length === 0);
  checkWaar("geen waarschuwing over een aangenomen klasse", !(cc3.result?.warnings ?? []).some((w) => /Geen gevolgklasse/.test(w)));

  const zonder = solve({ model: model() });
  checkWaar("zonder klasse: CC2 en een waarschuwing die dat zegt",
    (zonder.result?.warnings ?? []).some((w) => /Geen gevolgklasse opgegeven/.test(w)));

  const overig = solve({ model: model({ id: 3, name: "Onbekend", type: "other" }) });
  checkWaar("een geval van type overig met last: FOUT in de waarschuwingen",
    (overig.result?.warnings ?? []).some((w) => /^FOUT: Belastinggeval 3/.test(w)), JSON.stringify(overig.result?.warnings));

  const fout = solve({ model: model(), gevolgklasse: "CC4" });
  checkWaar("een ongeldige gevolgklasse wordt geweigerd", fout.ok === false && fout.error?.code === "INVOER_ONGELDIG");

  const validate = verwerkVerzoek({ v: 1, id: 2, op: "validate", payload: { model: model({ id: 3, name: "Onbekend", type: "other" }) } });
  checkWaar("validate: hetzelfde geval is een fout (ok: false)",
    validate.result?.ok === false && validate.result.errors.some((e) => /Belastinggeval 3/.test(e)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Bevinding nr 14 via een OUD projectbestand — wees-factoren gaan eruit, het id komt niet terug");
{
  // Een bestand van 0.3.11: het windgeval (id 4) was verwijderd, maar zes
  // combinaties dragen nog een factor voor 4, en tellers ontbreken. Tot deze
  // correctie kreeg het volgende nieuwe geval id 4 en erfde het die factoren
  // (HEA200: UGT 47,25 en BGT 30,60 kNm waar 48,60 en 36,00 horen).
  // Dezelfde weg als de app: JSON → deserializeProject → combinationsFromFile
  // (App.tsx) → openCombinatieStaat (useFemStore.loadProjectState).
  const gevallen = START.filter((c) => c.id !== 4);
  const tekst = JSON.stringify({
    format: "open-fem2d-studio-v2", version: 2, savedAt: "2026-09-01T00:00:00Z",
    nodes: [], beams: [], supports: [], plates: [], loads: [], activeLoadCaseId: 1, selfWeightEnabled: false,
    loadCases: gevallen, combinations: combinationsToFile(OUDE_STANDAARD),
  });
  const p = deserializeProject(tekst);
  const uitBestand = combinationsFromFile(p.combinations);
  const { staat, afwijking, vervanging } = openCombinatieStaat({
    loadCases: p.loadCases, combinations: uitBestand, gevolgklasse: "CC2", idTellers: p.idTellers,
  });
  checkWaar("na openen draagt geen combinatie nog een factor voor id 4", staat.combinations.every((c) => !c.factors.has(4)));
  checkWaar("de melding noemt de zes combinaties met een wees-factor voor 4",
    afwijking?.weesFactoren.length === 6 && afwijking.weesFactoren.every((w) => JSON.stringify(w.caseIds) === "[4]"));
  checkWaar("de samenvatting zegt dat ze zijn weggehaald",
    /belastinggeval 4, dat in dit project niet \(meer\) bestaat/.test(afwijking?.samenvatting ?? "") &&
    /weggehaald/.test(afwijking?.samenvatting ?? ""),
    afwijking?.samenvatting);
  checkWaar("de acht oude combinaties worden herkend — ook met de wees-factoren eruit — en vervangen",
    vervanging?.oudeStandaard.length === 8 &&
    JSON.stringify(vervanging.voor.map((c) => c.id)) === "[1,2,3,4,5,6,7,8]" &&
    vervanging.voor.every((c) => !c.factors.has(4)));

  // Weghalen verandert geen uitkomst: een factor voor een geval zonder last
  // vermenigvuldigt niets. HEA200 6 m met G = 5, Q = 2, S = 1 kN/m:
  //   ULS 6.10b (Q leidend) 1,2·5 + 1,5·2 + 1,05·1 = 10,05 kN/m
  //   ULS 6.10a             1,35·5 + 1,05·2 + 1,05·1 = 9,90
  //   ULS 6.10b (S leidend) 1,2·5 + 1,5·1 + 1,05·2  = 9,60
  //   → M = 10,05·6²/8 = 45,225 kNm, met en zonder de wees-factoren.
  const hea200 = (loads, cases) => solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 5383, I: 3.692e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads, pointLoads: [], cases: cases.map((c) => ({ id: c.id, name: c.name })),
  }).perCase;
  const pcOud = hea200([{ beamId: 1, q: -5, caseId: 1 }, { beamId: 1, q: -2, caseId: 2 }, { beamId: 1, q: -1, caseId: 3 }], gevallen);
  check("met wees-factoren: M = 10,05·36/8 = 45,225 kNm", mMax(uitBestand, pcOud, "uls"), 45.225);
  check("na weghalen (de lijst van vóór de vervanging): dezelfde 45,225 kNm", mMax(vervanging.voor, pcOud, "uls"), 45.225);
  // Na de vervanging rekent het project met de NB-set voor G, Q en S (CC2, NB.4
  // en NB.2–A1.1; sneeuw begeleidt met ψ₀ = 0, Q cat. A met ψ₀ = 0,4):
  //   6.10b Q leidend: 1,2·5 + 1,5·2         = 9,00 kN/m (maatgevend)
  //   6.10b S leidend: 1,2·5 + 1,5·1 + 0,6·2 = 8,70
  //   6.10a:           1,35·5 + 0,6·2        = 7,95
  //   → M = 9,00·36/8 = 40,50 kNm. Lager dan 45,225: de oude set rekende sneeuw
  //   begeleidend met de door EN 1990 aanbevolen ψ₀ = 0,7, de NB schrijft 0 voor.
  check("na vervangen: de NB-set, 9,00·36/8 = 40,50 kNm", mMax(staat.combinations, pcOud, "uls"), 40.5);

  // De teller: boven het hoogste geval (3) én boven de hoogste factorsleutel (4).
  checkWaar("volgendGevalId = 5, niet 4", staat.volgendGevalId === 5, String(staat.volgendGevalId));
  const { staat: na, id } = voegBelastinggevalToe(staat, "Permanent afbouw", "dead");
  checkWaar("het nieuwe blijvende geval krijgt id 5", id === 5, `id ${id}`);
  checkWaar("en krijgt in elke combinatie dezelfde factor als blijvend geval 1 — nergens een geërfde windfactor",
    na.combinations.every((c) => (c.factors.get(5) ?? 0) === (c.factors.get(1) ?? 0)));
  const pcNa = hea200([{ beamId: 1, q: -5, caseId: 1 }, { beamId: 1, q: -3, caseId: 5 }], na.loadCases);
  // Hand: blijvend 5 + 3 = 8 kN/m; 6.10a 1,35·8 = 10,8 → 10,8·36/8 = 48,60 kNm;
  // BGT 1,0·8 → 36,00 kNm. De auditwaarden 47,25 en 30,60 kwamen van de windfactoren.
  check("na openen en toevoegen: UGT 1,35·8·36/8 = 48,60 kNm", mMax(na.combinations, pcNa, "uls"), 48.6);
  check("en BGT 8·36/8 = 36,00 kNm", mMax(na.combinations, pcNa, "sls"), 36.0);
  // Na ONGEDAAN MAKEN zijn de acht oude combinaties eigen combinaties: de app
  // vult ze niet aan. Dan telt het nieuwe geval nergens mee — en dat is een
  // FOUT, geen stille nul.
  const oudNa = voegBelastinggevalToe(herstelCombinaties(staat, vervanging.voor), "Permanent afbouw", "dead").staat;
  const meld = meldingenBelastinggevallen({
    loadCases: oudNa.loadCases, combinations: oudNa.combinations, loads: [{ caseId: 1 }, { caseId: 5 }],
  }).find((m) => m.caseId === 5);
  checkWaar("na ongedaan maken: een FOUT die naar de standaardcombinaties wijst",
    meld?.niveau === "fout" && /telt in geen enkele UGT-combinatie mee/.test(meld.tekst) && /vervang/.test(meld.tekst), meld?.tekst);
  const vervangen = vervangDoorStandaard(oudNa);
  check("na Vervang door standaardcombinaties: UGT 1,35·8·36/8 = 48,60 kNm", mMax(vervangen.combinations, pcNa, "uls"), 48.6);
  check("en BGT 8·36/8 = 36,00 kNm", mMax(vervangen.combinations, pcNa, "sls"), 36.0);

  // De tweede grendel los: een wees-factor voor 7 in een bestand met gevallen
  // 1…3 zet de teller op 8, ook als de factor een id boven elk geval heeft.
  const zeven = openCombinatieStaat({
    loadCases: gevallen, gevolgklasse: "CC2",
    combinations: [{ id: 1, name: "eigen", type: "uls", formula: "", factors: new Map([[1, 1.2], [7, 1.5]]) }],
  });
  checkWaar("wees-factor voor 7 → volgendGevalId 8", zeven.staat.volgendGevalId === 8, String(zeven.staat.volgendGevalId));
  checkWaar("een teller uit het bestand die hoger is, wint", openCombinatieStaat({
    loadCases: gevallen, gevolgklasse: "CC2", combinations: [], idTellers: { belastinggeval: 12, combinatie: 1 },
  }).staat.volgendGevalId === 12);
  checkWaar("een bestand zonder combinaties krijgt de standaardset van zijn gevallen, zonder melding", (() => {
    const r = openCombinatieStaat({ loadCases: START, gevolgklasse: "CC2" });
    return r.afwijking === null && r.staat.combinations.every((c) => c.standaard) && r.staat.combinations.length === defaultCombinations().length;
  })());
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[11] Een veranderlijk geval mag afwezig zijn — patroonbelasting (EN 1991-1-1 6.2.1(1)P)");
{
  // Doorgaande ligger over n velden van 6 m, EI constant, Q = 10 kN/m per veld
  // in een eigen veranderlijk geval (cat. A), blijvend geval leeg. De
  // gebruiksbelasting is een vrije belasting "ter plaatse van het meest
  // ongunstige deel van de invloedsoppervlakte" (6.2.1(1)P).
  const q = 10, L = 6000;
  const ligger = (n, loads, gevallen) => {
    const nodes = Array.from({ length: n + 1 }, (_, i) => ({ id: i + 1, x: i * L, z: 0 }));
    return solveAllCases({
      nodes,
      beams: Array.from({ length: n }, (_, i) => ({ id: i + 1, from: i + 1, to: i + 2, E: 210000, A: 5381, I: 8.356e7 })),
      supports: nodes.map((k, i) => ({ nodeId: k.id, type: i === 0 ? "pinned" : "zRoller" })),
      loads, pointLoads: [], cases: gevallen.map((c) => ({ id: c.id, name: c.name })),
    }).perCase;
  };
  const momenten = (c, perCase, staaf) => combineResults(c, perCase).elements.get(staaf)?.bendingMoment.map((x) => x / 1e6) ?? [0];
  const maxVeld = (combos, perCase) => Math.max(...combos.filter((c) => c.type === "uls").map((c) => Math.max(...momenten(c, perCase, 1))));

  // Twee velden. Hand (vergelijking van drie momenten, p₁ en p₂ op veld 1 en 2):
  //   M_B = −(p₁ + p₂)·L²/16;  R_A = p₁·L/2 + M_B/L;  M_veld = R_A²/(2·p₁)
  //   alleen veld 1 (p₂ = 0): M_B = −p·L²/16, R_A = 7/16·p·L → M_veld = 49/512·p·L²
  //   beide velden:           M_B = −p·L²/8,  R_A = 3/8·p·L  → M_veld = 9/128·p·L²
  // UGT 6.10b: p = 1,5·10 = 15 kN/m → veld 49/512·15·36 = 51,68 kNm; steunpunt 15·36/8 = 67,50 kNm.
  // Met beide gevallen altijd samen gaf de app 9/128·15·36 = 37,97 (gemeten 37,80): 27 % te laag.
  const twee = [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q veld 1", type: "live" }, { id: 3, name: "Q veld 2", type: "live" }];
  const pc2 = ligger(2, [{ beamId: 1, q: -q, caseId: 2 }, { beamId: 2, q: -q, caseId: 3 }], twee);
  const set2 = defaultCombinations(twee);
  checkFactoren("er is een 6.10b met alleen Q op veld 1",
    set2.find((c) => c.name === "UGT 6.10b — Q cat. A leidend, zonder Q veld 2"), { 1: 1.2, 2: 1.5 });
  // Marge 0,2 %: het maximum ligt tussen twee stations van de staaf (3/8·L of 7/16·L).
  check("veldmoment veld 1 = 1,5·49/512·q·L² = 51,68 kNm", maxVeld(set2, pc2), 1.5 * 49 / 512 * q * 36, 0.2);
  const steun = Math.max(...set2.filter((c) => c.type === "uls").map((c) => Math.abs(momenten(c, pc2, 1).at(-1))));
  check("steunpuntsmoment = 1,5·q·L²/8 = 67,50 kNm (beide velden blijven samen bestaan)", steun, 67.5, 0.01);
  checkWaar("20 combinaties: 6.10a en 6.16b ×4, 6.10b, gunstig, 6.14b en 6.15b ×3", set2.length === 20, String(set2.length));

  // Drie velden: het veldmoment van veld 1 is maximaal met veld 1 én 3 belast —
  // geen enkel veld en ook niet alle velden. Hand: M_B = M_C = −p·L²/20,
  // R_A = p·L/2 − p·L/20 = 0,45·p·L → M_veld = 0,45²/2·p·L² = 0,10125·p·L².
  // p = 15 → 0,10125·15·36 = 54,675 kNm. Dat bewijst dat ÉLKE deelverzameling er is.
  const drie = [{ id: 1, name: "G", type: "dead" }, ...[2, 3, 4].map((id) => ({ id, name: `Q${id - 1}`, type: "live" }))];
  const pc3 = ligger(3, [2, 3, 4].map((caseId, i) => ({ beamId: i + 1, q: -q, caseId })), drie);
  check("3 velden, veld 1 en 3 belast: 1,5·0,10125·q·L² = 54,675 kNm", maxVeld(defaultCombinations(drie), pc3), 54.675, 0.2);

  // Ook een BEGELEIDENDE veranderlijke last mag afwezig zijn. Sneeuw leidend op
  // veld 1 (20 kN/m), Q per veld begeleidend (ψ₀ = 0,4 → 1,5·0,4 = 0,6):
  //   met Q op veld 2:  p₁ = 1,5·20 + 0,6·10 = 36, p₂ = 6 → M_B = −42·36/16 = −94,5;
  //                     R_A = 108 − 15,75 = 92,25 → M_veld = 92,25²/72 = 118,20 kNm
  //   zonder Q veld 2:  p₁ = 36, p₂ = 0 → 49/512·36·36 = 124,03 kNm  (maatgevend)
  const metS = [...twee, { id: 5, name: "S", type: "snow" }];
  const pcS = ligger(2, [{ beamId: 1, q: -q, caseId: 2 }, { beamId: 2, q: -q, caseId: 3 }, { beamId: 1, q: -20, caseId: 5 }], metS);
  check("S leidend, begeleidende Q alleen op veld 1: 49/512·36·6² = 124,03 kNm", maxVeld(defaultCombinations(metS), pcS), 49 / 512 * 36 * 36, 0.2);

  // Gunstig werkende veranderlijke last telt voor 0 (EN 1990 tabel A1.2(B),
  // opmerking 2: "0 daar waar gunstig"). Ligger 6 m, G = 4 omlaag, W = 10
  // omhoog (zuiging), Q = 3 omlaag. Opwaarts maatgevend:
  //   0,9·(−4) + 1,5·10 = 11,4 kN/m → 11,4·36/8 = 51,30 kNm (zonder Q)
  //   met begeleidende Q: 11,4 − 0,6·3 = 9,6 → 43,20 kNm
  const pcW = ligger(1, [{ beamId: 1, q: -4, caseId: 1 }, { beamId: 1, q: 10, caseId: 4 }, { beamId: 1, q: -3, caseId: 2 }], START);
  const opwaarts = Math.max(...defaultCombinations().filter((c) => c.type === "uls").map((c) => Math.max(...momenten(c, pcW, 1).map((x) => -x))));
  check("opwaarts: 0,9·G + 1,5·W zonder Q = 11,4·36/8 = 51,30 kNm", opwaarts, 51.3, 0.01);
  // En een geval dat alleen de nieuwe opstellingen vangen: G = 10 omlaag, Q = 3
  // OMHOOG (een gunstig werkende veranderlijke last), geen S of W.
  //   6.10a zonder Q:     1,35·10         = 13,5 kN/m → 13,5·36/8 = 60,75 kNm (maatgevend)
  //   6.10a met Q:        13,5 − 1,5·0,4·3 = 11,7     → 52,65 kNm (het maximum van vóór deze correctie)
  //   6.10b Q leidend:    1,2·10 − 1,5·3   = 7,5
  const pcGunstig = ligger(1, [{ beamId: 1, q: -10, caseId: 1 }, { beamId: 1, q: 3, caseId: 2 }], START);
  check("gunstige Q telt voor 0: 1,35·10·36/8 = 60,75 kNm (was 52,65)",
    mMax(defaultCombinations(), pcGunstig, "uls"), 60.75, 0.01);

  // Geen dubbele combinaties: opstellingen met dezelfde factoren staan er één keer in.
  for (const [naam, set] of [["START", defaultCombinations()], ["twee velden", set2], ["cat. H", defaultCombinations([{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Dak", type: "live", categorie: "H" }])]]) {
    const sleutels = set.map((c) => `${c.type}|${c.standaard.soort}|${JSON.stringify(factoren(c))}`);
    checkWaar(`${naam}: geen twee combinaties van één soort met dezelfde factoren`, new Set(sleutels).size === sleutels.length);
    checkWaar(`${naam}: geen combinatie zonder factoren`, set.every((c) => c.factors.size > 0));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[12] De grens van MAX_VRIJE_GEVALLEN, en de aanname over wind- en sneeuwgevallen — gemeld");
{
  const metQ = (n) => [{ id: 1, name: "G", type: "dead" }, ...Array.from({ length: n }, (_, i) => ({ id: 10 + i, name: `Q${i + 1}`, type: "live" }))];
  const tel = (set, voorvoegsel) => set.filter((c) => c.standaard.sleutel === voorvoegsel || c.standaard.sleutel.startsWith(voorvoegsel + "|")).length;
  checkWaar("de grens is 4", MAX_VRIJE_GEVALLEN === 4);
  const vier = defaultCombinations(metQ(4));
  // 2⁴ − 1 = 15 opstellingen met Q leidend (minstens één aanwezig), 2⁴ = 16 zonder leidende.
  checkWaar("4 gevallen: 6.10b Q leidend in 2⁴ − 1 = 15 opstellingen", tel(vier, "6.10b|Q:A") === 15, String(tel(vier, "6.10b|Q:A")));
  checkWaar("4 gevallen: 6.10a in 2⁴ = 16 opstellingen", tel(vier, "6.10a") === 16, String(tel(vier, "6.10a")));
  checkWaar("4 gevallen: geen melding over de grens",
    !meldingenBelastinggevallen({ loadCases: metQ(4), combinations: vier }).some((m) => /hoogstens/.test(m.tekst)));
  const vijf = defaultCombinations(metQ(5));
  checkWaar("5 gevallen: de categorie gaat samen — 6.10b Q leidend één keer", tel(vijf, "6.10b|Q:A") === 1, String(tel(vijf, "6.10b|Q:A")));
  checkWaar("5 gevallen: 6.10a met en zonder de hele categorie", tel(vijf, "6.10a") === 2, String(tel(vijf, "6.10a")));
  const grens = meldingenBelastinggevallen({ loadCases: metQ(5), combinations: vijf }).find((m) => /hoogstens 4/.test(m.tekst));
  checkWaar("5 gevallen: een waarschuwing die 6.2.1(1)P noemt", grens?.niveau === "waarschuwing" && /6\.2\.1\(1\)P/.test(grens.tekst), grens?.tekst);

  const tweeWind = [{ id: 1, name: "G", type: "dead" }, { id: 7, name: "Wind links", type: "wind" }, { id: 8, name: "Wind rechts", type: "wind" }];
  const alt = meldingenBelastinggevallen({ loadCases: tweeWind, combinations: defaultCombinations(tweeWind) }).find((m) => /ALTERNATIEVEN/.test(m.tekst));
  checkWaar("twee windgevallen: de aanname 'alternatieven' wordt gemeld", alt?.niveau === "waarschuwing" && /7 \("Wind links"\), 8 \("Wind rechts"\)/.test(alt.tekst), alt?.tekst);
  checkWaar("één windgeval: geen melding",
    !meldingenBelastinggevallen({ loadCases: START, combinations: defaultCombinations() }).some((m) => /ALTERNATIEVEN/.test(m.tekst)));
  const gegenereerd = [{ id: 1, name: "G", type: "dead" }, { id: 7, name: "W1", type: "wind", gegenereerd: { bron: "wind", sleutel: "a" } }, { id: 8, name: "W2", type: "wind", gegenereerd: { bron: "wind", sleutel: "b" } }];
  checkWaar("gegenereerde windgevallen: geen melding (de generator combineert ze zelf)",
    !meldingenBelastinggevallen({ loadCases: gegenereerd, combinations: defaultCombinations(gegenereerd) }).some((m) => /ALTERNATIEVEN/.test(m.tekst)));
  checkWaar("alleen eigen combinaties: geen van beide meldingen (die stelt de gebruiker zelf op)",
    meldingenBelastinggevallen({ loadCases: tweeWind, combinations: [{ id: 1, name: "x", type: "uls", formula: "", factors: new Map([[1, 1.2], [7, 1.5], [8, 1.5]]) }] })
      .every((m) => !/ALTERNATIEVEN|hoogstens/.test(m.tekst)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[13] Nooit stil een deelverzameling — de juiste waarde of een FOUT, nooit een stil lager getal");
{
  // Ligger 6 m vrij opgelegd: M = q·L²/8 = 4,5·q kNm (q in kN/m), onafhankelijk
  // van de doorsnede. Alles langs de weg van de app: projectbestand →
  // deserializeProject → combinationsFromFile → openCombinatieStaat; een nieuw
  // geval zoals de interface het maakt (addLoadCase geeft type overig, daarna
  // updateLoadCase); de actieve selectie van de store; en de meldingen met de
  // volledige lijst en de klasse, zoals useFemStore ze opvraagt.
  const ligger = (lasten, gevallen) => solveAllCases({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 5381, I: 8.356e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: lasten.map((l) => ({ beamId: 1, ...l })), pointLoads: [], cases: gevallen.map((c) => ({ id: c.id, name: c.name })),
  }).perCase;
  const staven = [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }];
  const app = (staat, lasten) => {
    const perCase = ligger(lasten, staat.loadCases);
    const { actief } = selecteerCombinaties(staat.combinations, staven, [], { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse });
    return {
      ugt: mMax(actief, perCase, "uls"),
      bgt: mMax(actief, perCase, "sls"),
      meld: meldingenBelastinggevallen({
        loadCases: staat.loadCases, combinations: actief, alleCombinaties: staat.combinations,
        gevolgklasse: staat.gevolgklasse, loads: lasten,
      }),
    };
  };
  const heeftFout = (meld) => meld.some((m) => m.niveau === "fout");
  /** De eis van dit onderdeel: gelijk aan de hand, of een FOUT. Een afwijkend getal zonder FOUT faalt. */
  function juistOfFout(naam, gemeten, hand, fout) {
    const juist = Number.isFinite(gemeten) && Math.abs(gemeten - hand) <= Math.abs(hand) * 1e-4;
    checkWaar(
      `${naam}: ${gemeten.toFixed(3)} kNm, hand ${hand.toFixed(3)} — ${juist ? "juist" : fout ? "afwijkend, MET FOUT" : "STIL AFWIJKEND"}`,
      juist || fout,
    );
  }
  const oudBestand = (loadCases, combinaties) => JSON.stringify({
    format: "open-fem2d-studio-v2", version: 2, savedAt: "2026-09-01T00:00:00Z",
    nodes: [], beams: [], supports: [], plates: [], loads: [], activeLoadCaseId: 1, selfWeightEnabled: false,
    loadCases, combinations: combinationsToFile(combinaties),
  });
  const openBestand = (tekst) => {
    const p = deserializeProject(tekst);
    return openCombinatieStaat({
      loadCases: p.loadCases, combinations: combinationsFromFile(p.combinations), gevolgklasse: "CC2", idTellers: p.idTellers,
    });
  };
  const nieuwVeranderlijk = (staat, naam) => {
    const t = voegBelastinggevalToe(staat, naam);
    return { staat: wijzigBelastinggeval(t.staat, t.id, { type: "live" }), id: t.id };
  };

  // ── Route 1 ────────────────────────────────────────────────────────────
  // Een oud projectbestand (de acht combinaties van vóór september 2026, geen
  // tellers) krijgt een tweede veranderlijk geval "Q vloer 2" van dezelfde
  // categorie op dezelfde staaf. G = 4, Q = 5, Q vloer 2 = 10 kN/m. Hand, met de
  // standaardset CC2 (Q en Q vloer 2 samen één belasting van cat. A):
  //   UGT 6.10b Q leidend: 1,2·4 + 1,5·(5 + 10) = 27,3 kN/m → 27,3·36/8 = 122,850 kNm
  //       (6.10a: 1,35·4 + 1,5·0,4·15 = 14,4 kN/m → 64,80 kNm)
  //   BGT 6.14b: 4 + 5 + 10 = 19 kN/m → 19·36/8 = 85,500 kNm
  // Gemeten vóór deze correctie: 89,100 en 63,000 kNm, zonder melding.
  // Sinds september 2026 vervangt het openen de acht oude combinaties door de
  // standaardset (besluit van de gebruiker); het nieuwe geval volgt dan vanzelf.
  const geopend1 = openBestand(oudBestand(START, OUDE_STANDAARD));
  const r1 = nieuwVeranderlijk(geopend1.staat, "Q vloer 2");
  const lasten1 = [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: r1.id, q: -10 }];
  {
    const u = app(r1.staat, lasten1);
    check("route 1, UGT: (1,2·4 + 1,5·15)·36/8 = 122,85 kNm", u.ugt, 122.85);
    check("route 1, BGT: 19·36/8 = 85,50 kNm", u.bgt, 85.5);
    checkWaar("route 1: bij het openen vervangen, dus een volledige standaardset en geen FOUT",
      geopend1.vervanging?.oudeStandaard.length === 8 && r1.staat.combinations.every((c) => c.standaard) && !heeftFout(u.meld),
      u.meld.map((m) => m.tekst).join(" | "));
  }
  // Dezelfde handeling na "Ongedaan maken": de acht oude combinaties zijn weer
  // eigen combinaties, en het nieuwe geval telt nergens mee — een FOUT.
  const r1oud = nieuwVeranderlijk(herstelCombinaties(geopend1.staat, geopend1.vervanging.voor), "Q vloer 2");
  {
    const u = app(r1oud.staat, lasten1);
    juistOfFout("route 1 na ongedaan maken, UGT", u.ugt, 122.85, heeftFout(u.meld));
    juistOfFout("route 1 na ongedaan maken, BGT", u.bgt, 85.5, heeftFout(u.meld));
    checkWaar("route 1 na ongedaan maken: er komt geen gedeeltelijke opstelling bij — nog steeds de acht oude combinaties",
      r1oud.staat.combinations.length === 8 && r1oud.staat.combinations.every((c) => !c.standaard), String(r1oud.staat.combinations.length));
    const f = u.meld.find((m) => m.caseId === r1oud.id);
    checkWaar("route 1 na ongedaan maken: FOUT op Q vloer 2, met de verwijzing naar de standaardcombinaties",
      f?.niveau === "fout" && f.vervangAdvies === true && /vervang/i.test(f.tekst), f?.tekst);
    const v = app(vervangDoorStandaard(r1oud.staat), lasten1);
    check("route 1 na Vervang: UGT (1,2·4 + 1,5·15)·36/8 = 122,85 kNm", v.ugt, 122.85);
    check("route 1 na Vervang: BGT 19·36/8 = 85,50 kNm", v.bgt, 85.5);
    checkWaar("route 1 na Vervang: geen FOUT", !heeftFout(v.meld), v.meld.map((m) => m.tekst).join(" | "));
  }

  // Dezelfde handeling voegde in een eerdere versie alleen de NIEUWE
  // "|zonder:"-opstellingen toe aan de acht oude combinaties: 28 combinaties,
  // zonder de volledige 6.10b met beide gevallen op γ_Q. Zo'n set geeft een FOUT
  // via de volledigheidscontrole, en wordt bij het openen vervangen.
  const vorigeSleutels = new Set(genereerStandaardCombinaties([...START, { id: r1.id, name: "Q vloer 2", type: "other" }])
    .map((c) => c.standaard.sleutel));
  const deel = genereerStandaardCombinaties(r1.staat.loadCases)
    .filter((c) => c.standaard.sleutel.includes("|zonder:") && !vorigeSleutels.has(c.standaard.sleutel))
    .map((c, i) => ({ ...c, id: 9 + i }));
  const hybride = { ...r1.staat, combinations: [...OUDE_STANDAARD, ...deel], volgendCombinatieId: 9 + deel.length };
  {
    checkWaar("de vorige versie voegde 28 gedeeltelijke opstellingen toe", deel.length === 28, String(deel.length));
    const u = app(hybride, lasten1);
    // "UGT 6.10b — Q cat. A leidend, zonder Variabel (Q)": (1,2·4 + 1,5·10)·36/8 = 89,10 kNm.
    check("hybride: het gemeten stille getal is 89,10 kNm", u.ugt, 89.1);
    juistOfFout("hybride, UGT", u.ugt, 122.85, heeftFout(u.meld));
    juistOfFout("hybride, BGT", u.bgt, 85.5, heeftFout(u.meld));
    const gevuld = (id) => lasten1.some((l) => l.caseId === id);
    checkWaar("hybride: de volledige 6.10b Q leidend staat bij de ontbrekende combinaties",
      ontbrekendeStandaardcombinaties({ combinations: hybride.combinations, loadCases: hybride.loadCases, gevolgklasse: "CC2", gevuld })
        .some((c) => c.standaard.sleutel === "6.10b|Q:A"));
    const f = u.meld.find((m) => m.caseId === null && m.niveau === "fout");
    checkWaar("hybride: een FOUT op modelniveau die zegt dat standaardcombinaties ontbreken en naar Vervang wijst",
      f?.vervangAdvies === true && /standaardcombinatie\(s\) ontbreken/.test(f.tekst) && /Vervang door standaardcombinaties/.test(f.tekst), f?.tekst);
    const h = openCombinatieStaat({ loadCases: hybride.loadCases, combinations: hybride.combinations, gevolgklasse: "CC2" });
    check("hybride geopend: de oude set en de deelopstellingen vervangen → 122,85 kNm", app(h.staat, lasten1).ugt, 122.85);
  }

  // Variant van dezelfde oorzaak: het nieuwe geval krijgt daarna categorie B
  // (kantoor, ψ₀ = 0,5) — een ANDERE belasting. De combinaties met Kantoor
  // leidend zijn dan nieuw en komen er volledig bij; 6.10b met Q (cat. A)
  // leidend en Kantoor begeleidend niet. Het geval telt dan wél ergens mee, dus
  // de FOUT "telt nergens mee" verdwijnt. G = 4, Q = 10, Kantoor = 5 kN/m:
  //   UGT Q leidend:       1,2·4 + 1,5·10 + 1,5·0,5·5 = 23,55 kN/m → 105,975 kNm (maatgevend)
  //   UGT Kantoor leidend: 1,2·4 + 1,5·5 + 1,5·0,4·10 = 18,30 kN/m →  82,350 kNm
  //   BGT 6.14b Q leidend: 4 + 10 + 0,5·5 = 16,5 kN/m → 74,250 kNm
  // Gemeten zonder volledigheidscontrole: 89,10 kNm, zonder melding.
  {
    const lasten = [{ caseId: 1, q: -4 }, { caseId: 2, q: -10 }, { caseId: 5, q: -5 }];
    const geopend = openBestand(oudBestand(START, OUDE_STANDAARD));
    const r = nieuwVeranderlijk(geopend.staat, "Kantoor");
    const s = wijzigBelastinggeval(r.staat, r.id, { categorie: "B" });
    const u = app(s, lasten);
    check("cat. B, UGT 105,975 kNm", u.ugt, 105.975);
    check("cat. B, BGT 74,25 kNm", u.bgt, 74.25);
    checkWaar("cat. B: geen FOUT — bij het openen vervangen, dus de set volgt het geval", !heeftFout(u.meld),
      u.meld.map((m) => m.tekst).join(" | "));
    // Na ongedaan maken: de oude set als eigen combinaties, en dan de FOUT op modelniveau.
    const ro = nieuwVeranderlijk(herstelCombinaties(geopend.staat, geopend.vervanging.voor), "Kantoor");
    const so = wijzigBelastinggeval(ro.staat, ro.id, { categorie: "B" });
    const uo = app(so, lasten);
    juistOfFout("cat. B na ongedaan maken, UGT", uo.ugt, 105.975, heeftFout(uo.meld));
    juistOfFout("cat. B na ongedaan maken, BGT", uo.bgt, 74.25, heeftFout(uo.meld));
    checkWaar("cat. B na ongedaan maken: het geval telt mee (geen FOUT op het geval), maar er is een FOUT op modelniveau",
      !uo.meld.some((m) => m.caseId === ro.id && m.niveau === "fout") &&
      uo.meld.some((m) => m.caseId === null && m.niveau === "fout" && m.vervangAdvies));
    const v = app(vervangDoorStandaard(so), lasten);
    check("cat. B na Vervang: UGT 105,975 kNm", v.ugt, 105.975);
    check("cat. B na Vervang: BGT 74,25 kNm", v.bgt, 74.25);
  }

  // ── Route 2 ────────────────────────────────────────────────────────────
  // Een project van deze versie. De gebruiker hernoemt "UGT 6.10b — Variabel
  // (Q) leidend" (dan is het een eigen combinatie) en voegt daarna "Q vloer 2"
  // toe. Lasten en hand als route 1: UGT 122,850, BGT 85,500 kNm. Gemeten vóór
  // deze correctie: 117,45 kNm uit "blijvend gunstig", (0,9·4 + 1,5·15)·36/8,
  // zonder melding.
  let r2 = staatVan([...START]);
  r2 = wijzigCombinatie(r2, r2.combinations.find((c) => c.standaard?.sleutel === "6.10b|Q:A").id,
    { name: "UGT 6.10b — Q leidend (mijn naam)" });
  checkWaar("route 2, alleen hernoemd: geen FOUT — de eigen combinatie heeft dezelfde factoren",
    !heeftFout(app(r2, [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }]).meld));
  const r2n = nieuwVeranderlijk(r2, "Q vloer 2");
  const lasten2 = [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: r2n.id, q: -10 }];
  {
    const u = app(r2n.staat, lasten2);
    check("route 2: het gemeten getal zonder de volledige 6.10b is 117,45 kNm", u.ugt, 117.45);
    juistOfFout("route 2, UGT", u.ugt, 122.85, heeftFout(u.meld));
    juistOfFout("route 2, BGT", u.bgt, 85.5, heeftFout(u.meld));
    checkWaar("route 2: geen gedeeltelijke 6.10b Q leidend zonder het geheel",
      !r2n.staat.combinations.some((c) => /^6\.10b\|Q:A\|zonder:/.test(c.standaard?.sleutel ?? "")));
    const f = u.meld.find((m) => m.caseId === null && m.niveau === "fout");
    checkWaar("route 2: FOUT die de ontbrekende volledige 6.10b noemt en naar Vervang wijst",
      f?.vervangAdvies === true && /"UGT 6\.10b — Q cat\. A leidend" \(1,2·G \+ 1,5·Q\)/.test(f.tekst) &&
      /Vervang door standaardcombinaties/.test(f.tekst), f?.tekst);
    check("route 2 na Vervang: UGT 122,85 kNm", app(vervangDoorStandaard(r2n.staat), lasten2).ugt, 122.85);
    const zonder = app(nieuwVeranderlijk(staatVan([...START]), "Q vloer 2").staat, lasten2);
    check("controle, dezelfde handeling zonder hernoemen: 122,85 kNm", zonder.ugt, 122.85);
    checkWaar("controle: zonder hernoemen geen FOUT", !heeftFout(zonder.meld), zonder.meld.map((m) => m.tekst).join(" | "));
  }

  // Een factor voor een LEEG geval telt niet mee in de vergelijking. Verwijdert
  // de gebruiker "UGT 6.10a" terwijl Q leeg is, dan vervangt "UGT 6.10a —
  // zonder Variabel (Q)" haar. G = 4 + afbouw 10 kN/m: 1,35·14·36/8 = 85,05 kNm.
  {
    let s = staatVan([...START]);
    s = verwijderCombinatie(s, s.combinations.find((c) => c.standaard?.sleutel === "6.10a").id);
    const r = voegBelastinggevalToe(s, "Afbouw", "dead");
    const leeg = app(r.staat, [{ caseId: 1, q: -4 }, { caseId: r.id, q: -10 }]);
    check("6.10a verwijderd, Q leeg: 1,35·14·36/8 = 85,05 kNm", leeg.ugt, 85.05);
    checkWaar("6.10a verwijderd, Q leeg: geen FOUT", !heeftFout(leeg.meld), leeg.meld.map((m) => m.tekst).join(" | "));
    // Met Q = 5 kN/m is 6.10b maatgevend (1,2·14 + 1,5·5 = 24,3 tegen 6.10a
    // 1,35·14 + 0,6·5 = 21,9 kN/m), maar bij meer G ten opzichte van Q is
    // 6.10a dat: de set mist een opstelling, dus een FOUT.
    const vol = app(r.staat, [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: r.id, q: -10 }]);
    checkWaar("6.10a verwijderd, Q gevuld: FOUT die UGT 6.10a noemt",
      vol.meld.some((m) => m.caseId === null && m.niveau === "fout" && /"UGT 6\.10a"/.test(m.tekst)));
  }
  {
    const { staat } = openBestand(oudBestand(START, OUDE_STANDAARD));
    const m = app(staat, [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }]).meld;
    checkWaar("een oud bestand zonder erfenis, niets gewijzigd: geen FOUT (bij het openen vervangen door de standaardset)",
      !heeftFout(m), m.map((x) => x.tekst).join(" | "));
    checkWaar("…en geen blijvend geval met factoren die niet passen",
      blijvendeFactorAfwijkingen({ loadCases: staat.loadCases, combinations: staat.combinations }).length === 0);
  }

  // ── Route 3 ────────────────────────────────────────────────────────────
  // Een oud bestand waarin nr 14 al is gebeurd: het windgeval (4) was
  // verwijderd en "Permanent afbouw" (blijvend) kreeg id 4, met de windkolom
  // van de oude combinaties. HEA200 6 m, G = 5 en afbouw 3 kN/m; blijvend
  // samen 8 kN/m. Hand:
  //   UGT 6.10a 1,35·8 = 10,8 kN/m → 48,60 kNm;  BGT 1,0·8 → 36,00 kNm
  // Met de geërfde factoren: "ULS 6.10b (W leidend)" 1,2·5 + 1,5·3 = 10,5 →
  // 47,25 kNm; "SLS Karakteristiek" 5 + 0,6·3 = 6,8 → 30,60 kNm. De melding
  // bij openen zei alleen "8 afwijkend".
  const gevallen3 = [...START.filter((c) => c.id !== 4), { id: 4, name: "Permanent afbouw", type: "dead" }];
  const bestand3 = oudBestand(gevallen3, OUDE_STANDAARD);
  const lasten3 = [{ caseId: 1, q: -5 }, { caseId: 4, q: -3 }];
  {
    const { staat, afwijking, vervanging } = openBestand(bestand3);
    const u = app(staat, lasten3);
    check("route 3 na openen: UGT 1,35·8·36/8 = 48,60 kNm", u.ugt, 48.6);
    check("route 3 na openen: BGT 8·36/8 = 36,00 kNm", u.bgt, 36.0);
    checkWaar("route 3: de oude set met de geërfde windkolom is herkend en vervangen — geen FOUT, niets verder te melden",
      vervanging?.oudeStandaard.length === 8 && !heeftFout(u.meld) && afwijking === null,
      u.meld.map((m) => m.tekst).join(" | "));
    // Na ONGEDAAN MAKEN tellen de geërfde factoren weer, en dan is er een FOUT.
    const oud = herstelCombinaties(staat, vervanging.voor);
    const uo = app(oud, lasten3);
    check("route 3 na ongedaan maken: gemeten UGT met de geërfde factoren 47,25 kNm", uo.ugt, 47.25);
    juistOfFout("route 3 na ongedaan maken, UGT", uo.ugt, 48.6, heeftFout(uo.meld));
    juistOfFout("route 3 na ongedaan maken, BGT", uo.bgt, 36.0, heeftFout(uo.meld));
    const f = uo.meld.find((m) => m.caseId === 4);
    checkWaar("route 3 na ongedaan maken: FOUT op geval 4 — type blijvend, factor 0,6 in de karakteristieke combinatie",
      f?.niveau === "fout" && f.vervangAdvies === true && /is van type blijvend/.test(f.tekst) &&
      /"SLS Karakteristiek" 0,6 \(in de BGT telt een blijvende belasting met 1,0/.test(f.tekst), f?.tekst);
    checkWaar("route 3 na ongedaan maken: de FOUT herkent de windkolom van de oude standaardset",
      /aan belastinggeval 4 gaven, het windgeval \(W\)/.test(f?.tekst ?? ""), f?.tekst);
    checkWaar("route 3 na ongedaan maken: blijvend geval 1 zelf wordt niet aangewezen", !uo.meld.some((m) => m.caseId === 1));
    const a = beoordeelCombinatiesBijOpenen({ combinations: oud.combinations, loadCases: oud.loadCases });
    const s = a?.samenvatting ?? "";
    checkWaar("route 3 na ongedaan maken: de melding noemt geval, type en de factoren die niet passen",
      /belastinggeval 4 \("Permanent afbouw"\) is van type blijvend/.test(s) &&
      /"ULS 6\.10b \(W leidend\)" 1,5 \(blijvend geval 1 heeft daar 1,2\)/.test(s) &&
      /"SLS Karakteristiek" 0,6/.test(s) && /het windgeval \(W\)/.test(s), s);
    checkWaar("route 3 na ongedaan maken: de melding draagt het geval ook als gegeven", a?.blijvend.length === 1 && a.blijvend[0].caseId === 4);
    const v = app(vervangDoorStandaard(oud), lasten3);
    check("route 3 na Vervang: UGT 1,35·8·36/8 = 48,60 kNm", v.ugt, 48.6);
    check("route 3 na Vervang: BGT 8·36/8 = 36,00 kNm", v.bgt, 36.0);
    checkWaar("route 3 na Vervang: geen FOUT", !heeftFout(v.meld), v.meld.map((m) => m.tekst).join(" | "));
  }

  // ── De MCP-weg ─────────────────────────────────────────────────────────
  // Dezelfde routes als projectbestand door de sidecar (`solve` met `project`):
  // route 1 en de hybride zoals een eerdere versie ze met tellers opsloeg (de
  // acht oude combinaties), route 2 van deze versie, route 3 zonder tellers
  // (0.3.11). De sidecar leest het bestand met `openCombinatieStaat`, net als
  // de app. Verwacht: de juiste waarde met de melding dat er is vervangen, of
  // "FOUT:" in `warnings`.
  const projectTekst = (staat, lasten, profiel, combinaties, metTellers) => serializeProject({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: profiel }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [], loads: lasten.map((l, i) => ({ id: i + 1, type: "lineLoad", beamId: 1, ...l })),
    loadCases: staat.loadCases, activeLoadCaseId: 1, selfWeightEnabled: false,
    combinations: combinationsToFile(combinaties),
    ...(metTellers ? { idTellers: { belastinggeval: staat.volgendGevalId, combinatie: staat.volgendCombinatieId } } : {}),
  });
  const viaMcp = (tekst) => {
    const a = verwerkVerzoek({ v: 1, id: 13, op: "solve", payload: { project: { inhoud: tekst }, detail: "stations" } });
    if (!a.ok) return { ugt: NaN, bgt: NaN, warnings: [], fout: JSON.stringify(a.error) };
    // De id's na het inlezen: dezelfde functie als de sidecar, dus dezelfde id's.
    const p = deserializeProject(tekst);
    const combos = openCombinatieStaat({
      loadCases: p.loadCases, combinations: combinationsFromFile(p.combinations), gevolgklasse: "CC2", idTellers: p.idTellers,
    }).staat.combinations;
    const maxM = (t) => Math.max(...combos
      .filter((c) => c.type === t && a.result.combinations[c.id])
      .map((c) => Math.max(...a.result.combinations[c.id].elements["1"].M_x)));
    return { ugt: maxM("uls"), bgt: maxM("sls"), warnings: a.result.warnings };
  };
  const mcpFout = (w) => w.some((x) => x.startsWith("FOUT:"));
  const r3 = openBestand(bestand3).staat;
  const vervangen = /^Bij het openen zijn 8 belastingcombinatie\(s\) van de standaardset van versie 0\.3\.11 en ouder vervangen/;
  const mcpRoutes = [
    ["route 1 (oud bestand met tellers, Q vloer 2 erbij)", projectTekst(r1oud.staat, lasten1, "IPE300", r1oud.staat.combinations, true), 122.85, 85.5, vervangen, false],
    ["hybride van een eerdere versie", projectTekst(hybride, lasten1, "IPE300", hybride.combinations, true), 122.85, 85.5, vervangen, false],
    ["route 2", projectTekst(r2n.staat, lasten2, "IPE300", r2n.staat.combinations, true), 122.85, 85.5, /^FOUT: \d+ standaardcombinatie\(s\) ontbreken.*"UGT 6\.10b — Q cat\. A leidend"/, true],
    ["route 3 (0.3.11, geen tellers)", projectTekst(r3, lasten3, "HEA200", OUDE_STANDAARD, false), 48.6, 36.0, vervangen, false],
  ];
  for (const [naam, tekst, handU, handB, verwacht, foutVerwacht] of mcpRoutes) {
    const r = viaMcp(tekst);
    checkWaar(`MCP ${naam}: solve slaagt`, r.fout === undefined, r.fout);
    juistOfFout(`MCP ${naam}, UGT`, r.ugt, handU, mcpFout(r.warnings));
    juistOfFout(`MCP ${naam}, BGT`, r.bgt, handB, mcpFout(r.warnings));
    if (!foutVerwacht) {
      check(`MCP ${naam}: UGT gelijk aan de hand`, r.ugt, handU);
      check(`MCP ${naam}: BGT gelijk aan de hand`, r.bgt, handB);
      checkWaar(`MCP ${naam}: geen FOUT`, !mcpFout(r.warnings), r.warnings.filter((w) => w.startsWith("FOUT")).join(" | "));
    }
    checkWaar(`MCP ${naam}: de verwachte melding staat in warnings`, r.warnings.some((w) => verwacht.test(w)),
      r.warnings.map((w) => w.slice(0, 160)).join(" | "));
  }
  {
    const v = verwerkVerzoek({ v: 1, id: 14, op: "validate", payload: { project: { inhoud: projectTekst(r2n.staat, lasten2, "IPE300", r2n.staat.combinations, true) } } });
    checkWaar("MCP validate route 2: ok is false, met de ontbrekende standaardcombinaties als fout",
      v.ok === true && v.result.ok === false && v.result.errors.some((e) => /standaardcombinatie\(s\) ontbreken/.test(e)), JSON.stringify(v.result?.errors));
  }
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
