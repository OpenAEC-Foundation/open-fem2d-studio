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
} = await import("./src/components/fem/solver/normcombinaties.ts");
const {
  defaultCombinations, combineResults, computeEnvelope, combinatiesVanSoort,
} = await import("./src/components/fem/solver/combinations.ts");
const {
  voegBelastinggevalToe, wijzigBelastinggeval, verwijderBelastinggeval, zetGevolgklasse,
  vervangDoorStandaard, wijzigCombinatie, voegCombinatieToe, meldingenBelastinggevallen,
  beoordeelCombinatiesBijOpenen,
} = await import("./src/lib/combinatieBeheer.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { bepaalDoorbuigingsInvoer } = await import("./src/lib/steelCheckBuilder.ts");
const { combinationsToFile, combinationsFromFile } = await import("./src/io/projectFile.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");

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

  // De Rust-crate nen-en-1990 draagt dezelfde tabellen (ruw 8/40: daar weken
  // D, F en EQU af). Gelezen als bronbestand, zodat beide kanten niet uiteen
  // kunnen lopen zonder dat dit rood wordt.
  const rs = readFileSync(new URL("../src-tauri/crates/nen-en-1990/src/lib.rs", import.meta.url), "utf8");
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
  for (const [cc, i610a] of [["CC2", 0], ["CC1", 3], ["CC3", 5]]) {
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
  //  6.10a: 1,35·G + 1,5·0,4·Q = 1,35 G + 0,6 Q   (S, W: 1,5·0 = 0)
  //  6.10b Q leidend: 1,2 G + 1,5 Q;  S leidend: 1,2 G + 1,5 S + 0,6 Q;  W idem
  //  gunstig: 0,9 G + 1,5 × leidend
  //  6.14b: G + leidend + 0,4 Q (als Q begeleidt)
  //  6.15b: G + ψ₁·leidend (0,5 Q; 0,2 S; 0,2 W) + ψ₂·Q = 0,3 Q
  //  6.16b: G + 0,3 Q
  const c = defaultCombinations();
  checkWaar("veertien combinaties, id 1…14", c.length === 14 && c.every((x, i) => x.id === i + 1));
  const verwacht = [
    ["UGT 6.10a", "uls", { 1: 1.35, 2: 0.6 }],
    ["UGT 6.10b — Variabel (Q) leidend", "uls", { 1: 1.2, 2: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend", "uls", { 1: 1.2, 2: 0.6, 3: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend", "uls", { 1: 1.2, 2: 0.6, 4: 1.5 }],
    ["UGT 6.10b — Variabel (Q) leidend, blijvend gunstig", "uls", { 1: 0.9, 2: 1.5 }],
    ["UGT 6.10b — Sneeuw (S) leidend, blijvend gunstig", "uls", { 1: 0.9, 3: 1.5 }],
    ["UGT 6.10b — Wind (W) leidend, blijvend gunstig", "uls", { 1: 0.9, 4: 1.5 }],
    ["BGT karakteristiek 6.14b — Variabel (Q) leidend", "sls", { 1: 1, 2: 1 }],
    ["BGT karakteristiek 6.14b — Sneeuw (S) leidend", "sls", { 1: 1, 2: 0.4, 3: 1 }],
    ["BGT karakteristiek 6.14b — Wind (W) leidend", "sls", { 1: 1, 2: 0.4, 4: 1 }],
    ["BGT frequent 6.15b — Variabel (Q) leidend", "sls", { 1: 1, 2: 0.5 }],
    ["BGT frequent 6.15b — Sneeuw (S) leidend", "sls", { 1: 1, 2: 0.3, 3: 0.2 }],
    ["BGT frequent 6.15b — Wind (W) leidend", "sls", { 1: 1, 2: 0.3, 4: 0.2 }],
    ["BGT quasi-blijvend 6.16b", "sls", { 1: 1, 2: 0.3 }],
  ];
  verwacht.forEach(([naam, type, f], i) => {
    checkWaar(`${i + 1}: naam en type "${naam}"`, c[i]?.name === naam && c[i]?.type === type, c[i]?.name);
    checkFactoren(`${i + 1}: factoren`, c[i], f);
  });
  checkWaar("elke standaardcombinatie draagt haar kenmerk", c.every((x) => x.standaard?.gevolgklasse === "CC2"));
  checkWaar("de formule noemt de vindplaats (NB.4 in de UGT, NB.2 overal)",
    c.filter((x) => x.type === "uls").every((x) => /NB\.4/.test(x.formula)) &&
    c.every((x) => /NB\.2/.test(x.formula)));
  checkWaar("combinatiesVanSoort vindt drie karakteristieke combinaties", combinatiesVanSoort(c, "6.14b").length === 3);

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
log("\n[7] Een oud projectbestand opent met een melding — en er wordt niets overschreven");
{
  const afw = beoordeelCombinatiesBijOpenen({
    combinations: OUDE_STANDAARD, loadCases: START, gevolgklasse: "CC2", eigenCombinatiesBewust: false,
  });
  checkWaar("er is een melding", afw !== null);
  checkWaar("alle acht oude combinaties worden genoemd", afw?.afwijkend.length === 8);
  checkWaar("de nieuwe standaard (14) staat erbij", afw?.standaard.length === 14 && afw?.ontbrekend.length === 14);
  checkWaar("de melding zegt dat er niets is overschreven", /NIETS overschreven/.test(afw?.samenvatting ?? ""));
  checkWaar("en noemt de expliciete actie", /Vervang door standaardcombinaties/.test(afw?.samenvatting ?? ""));

  // Rondgang door het projectbestand: het kenmerk blijft staan.
  const terug = combinationsFromFile(JSON.parse(JSON.stringify(combinationsToFile(defaultCombinations()))));
  checkWaar("het kenmerk overleeft opslaan en openen", terug.every((c) => c.standaard?.sleutel));
  checkWaar("een huidig bestand met standaardcombinaties: geen melding",
    beoordeelCombinatiesBijOpenen({ combinations: terug, loadCases: START, gevolgklasse: "CC2", eigenCombinatiesBewust: true }) === null);
  checkWaar("een CC2-bestand geopend als CC3: de UGT-combinaties worden gemeld, de BGT niet",
    (() => {
      const a = beoordeelCombinatiesBijOpenen({ combinations: terug, loadCases: START, gevolgklasse: "CC3", eigenCombinatiesBewust: true });
      return a && a.afwijkend.length === 7 && a.afwijkend.every((x) => /^UGT/.test(x.naam));
    })());
  const kapot = combinationsFromFile([{ id: 1, name: "x", type: "uls", formula: "", factors: { 1: 1 }, standaard: { sleutel: "6.10a", soort: "onzin", gevolgklasse: "CC2" } }]);
  checkWaar("een onleesbaar kenmerk maakt er een eigen combinatie van", kapot[0].standaard === undefined);

  // De expliciete actie: vervangen, met behoud van de windgenerator.
  const staat = {
    loadCases: START, gevolgklasse: "CC2", volgendGevalId: 5, volgendCombinatieId: 9,
    combinations: [...OUDE_STANDAARD, { id: 20, name: "Wind-gen · UGT x", type: "uls", formula: "…", factors: new Map([[1, 1.2]]) }],
  };
  const vervangen = vervangDoorStandaard(staat);
  checkWaar("vervangen: 14 standaard + 1 windgenerator",
    vervangen.combinations.length === 15 && vervangen.combinations.filter((c) => c.standaard).length === 14);
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
  // G + Q: UGT 6.10a, 6.10b, gunstig; BGT 6.14b, 6.15b, 6.16b. Zuiver staal
  // laat 6.15b en 6.16b weg → vier doorgerekend.
  checkWaar("de standaardset komt uit de gevallen van het model: 4 doorgerekend, 2 overgeslagen",
    Object.keys(cc3.result?.combinations ?? {}).length === 4 && (cc3.result?.combinations_skipped ?? []).length === 2);
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

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
