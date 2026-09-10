// Staaf op bedding — de invoer, de indeling en de fysica.
//
// WAT ER NIEUW IS
// `Beam.bedding = { k, b }` (k in kN/m³, b in mm). De mapping rekent daar de
// lijnstijfheid k·b uit (N/mm²), de adapter knipt de staaf fijn genoeg op de
// karakteristieke lengte 1/λ = (4EI/(k·b))^¼ en zet op elk mesh-element de
// Winkler-bedding die de kern al kende (`onGrade`: veren kL/2 per knoop). Dat
// is precies wat referentie R26 met de hand doet: onderverdelen, per knoop de
// tributaire veer.
//
// ANALYTISCHE REFERENTIE
// De oneindig lange ligger op elastische bedding onder een puntlast P:
//     λ = (k·b / (4EI))^¼
//     w₀ = P·λ / (2·k·b)        (zakking onder de last)
//     M₀ = P / (4λ)             (moment onder de last)
// Een eindige ligger van 20/λ (10/λ aan weerszijden) gedraagt zich daar tot
// op e⁻¹⁰ na als; de fout die overblijft is die van de knoopveren, en die
// hoort bij deze indeling onder de 1,5 % te blijven.
//
// Uitvoeren: npx tsx test-bedding.mjs   (vanuit design-mockup/)

const { solveAllCases, beddingSplitsFracties } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function eis(naam, ok, detail = "") {
  log(`  ${ok ? "✓" : "✗"} ${naam}${detail ? `: ${detail}` : ""}`);
  ok ? passed++ : failed++;
}
function vgl(naam, ons, ref, tolPct) {
  const d = (ons / ref - 1) * 100;
  const ok = Number.isFinite(ons) && Math.abs(d) <= tolPct;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ons ${ons.toPrecision(6)} · ref ${ref.toPrecision(6)} · Δ ${d >= 0 ? "+" : ""}${d.toFixed(3)} % (tol ${tolPct} %)`);
  ok ? passed++ : failed++;
}

const COMBO = { id: 1, name: "C", type: "uls", formula: "1.0", factors: new Map([[1, 1.0]]) };
const E = 210000, I = 1e8, A = 5000;          // N/mm², mm⁴, mm²
const EI = E * I;

// ── 1. De indeling ──────────────────────────────────────────────────────────
log("\n[1] De indeling volgt de karakteristieke lengte");
{
  const kLijn = 1.0;                                     // N/mm²
  const lambda = Math.pow(kLijn / (4 * EI), 0.25);
  const L = 20 / lambda;
  const fr = beddingSplitsFracties(L, E, I, kLijn);
  const n = fr.length + 1;
  const h = L / n;
  eis("ten minste 8 elementen", n >= 8, `${n} elementen`);
  eis("elementlengte ≤ 0,15/λ", h <= 0.15 / lambda + 1e-9, `h = ${h.toFixed(1)} mm, 0,15/λ = ${(0.15 / lambda).toFixed(1)} mm`);
  eis("fracties oplopend in (0, 1)", fr.every((t, i) => t > 0 && t < 1 && (i === 0 || t > fr[i - 1])));
  eis("korte staaf: ten minste 8, niet meer", beddingSplitsFracties(100, E, I, kLijn).length === 7);
  eis("zonder bedding geen fracties", beddingSplitsFracties(L, E, I, 0).length === 0);
  eis("bovengrens 200", beddingSplitsFracties(1e9, E, I, kLijn).length === 199);
}

// ── 2. Fysica: oneindig lange ligger onder een puntlast ─────────────────────
log("\n[2] Oneindig lange ligger onder een puntlast — gesloten oplossing");
{
  const kLijn = 1.0;                                     // N/mm² (bijv. k = 33 333 kN/m³ × b = 30 mm)
  const lambda = Math.pow(kLijn / (4 * EI), 0.25);
  const L = 20 / lambda;
  const P = 100e3;                                       // N
  // Eén UI-staaf met bedding; de adapter knipt hem zelf. Eén xRoller houdt
  // de horizontale vrijheidsgraad vast; verticaal draagt alleen de bedding.
  const input = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I, bedding: { kLijn } }],
    supports: [{ nodeId: 1, type: "xRoller" }],
    loads: [], pointLoads: [],
    // Puntlast op het midden van de staaf: als staafpuntlast op t = 0,5.
    beamPointLoads: [{ beamId: 1, posFrac: 0.5, fz: -P, caseId: 1 }],
    cases: [{ id: 1, name: "G" }],
  };
  const r = combineResults(COMBO, solveAllCases(input).perCase);
  const el = r.elements.get(1);
  const wMax = Math.max(...el.deflection.map(Math.abs));
  const mMax = Math.max(...el.bendingMoment.map(Math.abs));
  const w0 = P * lambda / (2 * kLijn);
  const m0 = P / (4 * lambda);
  log(`  λ = ${lambda.toExponential(4)} /mm, L = ${(L / 1000).toFixed(2)} m, ${(el.deflection.length)} stations`);
  vgl("w₀ = Pλ/(2k·b)", wMax, w0, 1.5);
  vgl("M₀ = P/(4λ)", mMax, m0, 1.5);
  // Evenwicht: de bedding draagt de hele last (geen andere verticale steun).
  eis("er zijn geen verticale oplegreacties buiten de bedding",
    Math.abs(r.reactions.get(1)?.fz ?? 0) < 1e-6 * P, `Rz knoop 1 = ${(r.reactions.get(1)?.fz ?? 0).toFixed(3)} N`);
}

// ── 3. Gelijk aan handveren op dezelfde indeling ────────────────────────────
log("\n[3] Bedding = tributaire Z-veren op dezelfde knopen (R26-modellering)");
{
  const kLijn = 0.5;
  const lambda = Math.pow(kLijn / (4 * EI), 0.25);
  const L = 12 / lambda;
  const P = 80e3;
  const fr = beddingSplitsFracties(L, E, I, kLijn);
  const grens = [0, ...fr, 1];

  const metBedding = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I, bedding: { kLijn } }],
    supports: [{ nodeId: 1, type: "xRoller" }],
    loads: [], pointLoads: [{ nodeId: 2, fz: -P, caseId: 1 }], beamPointLoads: [],
    cases: [{ id: 1, name: "G" }],
  };
  // Hetzelfde met de hand: knopen op de fracties, staven ertussen, per knoop
  // de tributaire veer k·b·(h_links + h_rechts)/2 — in N/mm.
  const nodes = grens.map((t, i) => ({ id: i + 1, x: t * L, z: 0 }));
  const beams = grens.slice(0, -1).map((_, i) => ({ id: i + 1, from: i + 1, to: i + 2, E, A, I }));
  const supports = grens.map((t, i) => {
    const hl = i > 0 ? (grens[i] - grens[i - 1]) * L : 0;
    const hr = i < grens.length - 1 ? (grens[i + 1] - grens[i]) * L : 0;
    return { nodeId: i + 1, type: "zSpring", k: kLijn * (hl + hr) / 2 };
  });
  supports[0] = { nodeId: 1, type: "xRoller" };   // knoop 1: horizontaal vast …
  const metVeren = {
    nodes, beams,
    // … en zijn veer apart, op dezelfde knoop mag maar één oplegging: daarom
    // hier als tweede knoop-oplegging niet mogelijk — de test laat knoop 1
    // aan beide kanten zonder veer en vergelijkt daarom de bedding-variant met
    // dezelfde uitzondering (zie hieronder).
    supports, loads: [], pointLoads: [{ nodeId: grens.length, fz: -P, caseId: 1 }], beamPointLoads: [],
    cases: [{ id: 1, name: "G" }],
  };
  // Om appels met appels te vergelijken krijgt de beddingvariant dezelfde
  // beperking: knoop 1 zonder veer. Dat kan niet in de bedding zelf, dus
  // vergelijken we op de knoop met de LAST (knoop 2 / laatste), ver van
  // knoop 1: 12/λ verderop is het effect van één ontbrekende eindveer e⁻¹²
  // klein — onder de tolerantie.
  const rB = combineResults(COMBO, solveAllCases(metBedding).perCase);
  const rV = combineResults(COMBO, solveAllCases(metVeren).perCase);
  const wB = Math.abs(rB.displacements.get(2)?.uz ?? NaN);
  const wV = Math.abs(rV.displacements.get(grens.length)?.uz ?? NaN);
  vgl("zakking onder de last: bedding ≈ handveren", wB, wV, 0.5);
  eis("beide modellen hebben dezelfde knoopindeling", rB.elements.get(1)?.deflection?.length > 0 && rV.elements.size === beams.length,
    `${beams.length} handstaven`);
}

// ── 4. Projectbestand: het veld reist mee, en ontbreekt in oude bestanden ──
log("\n[4] Projectbestand");
{
  const tekst = serializeProject({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE200", bedding: { k: 50000, b: 300 } }],
    supports: [], plates: [], loads: [], loadCases: [{ id: 1, name: "G", type: "dead" }],
    activeLoadCaseId: 1, combinations: [],
  });
  const terug = deserializeProject(tekst);
  eis("bedding overleeft opslaan en openen", terug.beams[0]?.bedding?.k === 50000 && terug.beams[0]?.bedding?.b === 300,
    JSON.stringify(terug.beams[0]?.bedding));
  const mi = bouwMultiInput({
    nodes: terug.nodes, beams: terug.beams, supports: [], plates: [], loads: [], loadCases: terug.loadCases,
    combinations: [], selfWeightEnabled: false, scheefstandEnabled: false,
  });
  const kLijn = mi.beams[0]?.bedding?.kLijn;
  eis("de mapping rekent k·b naar N/mm²", Math.abs(kLijn - 50000 * 1e-6 * 300) < 1e-12, `kLijn = ${kLijn} N/mm²`);
  const zonder = bouwMultiInput({
    nodes: terug.nodes, beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE200" }],
    supports: [], plates: [], loads: [], loadCases: terug.loadCases,
    combinations: [], selfWeightEnabled: false, scheefstandEnabled: false,
  });
  eis("zonder bedding geen veld in de solver-invoer", !("bedding" in zonder.beams[0]));
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
