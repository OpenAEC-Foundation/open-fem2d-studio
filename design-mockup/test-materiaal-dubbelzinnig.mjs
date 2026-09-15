// "C30", "C35", "C20", "C16": hout voor de solver, en tot september 2026 óók
// beton voor de betontoets — basisaudit nr 16.
//
// WAAROM DEZE TEST BESTAAT
// Deze namen zijn houtsterkteklassen (EN 338) én de korte vorm van de
// betonklassen C30/37, C35/45, C20/25 en C16/20 (NEN-EN 1992-1-1 tabel 3.1).
// Gemeten met "C30" 300×500 en een wapeningskorf: de solver rekende hout
// (E = 12 000 N/mm², eigen gewicht 0,68 kN/m), de houtbouwer toetste hout, de
// betonbouwer toetste C30/37 en de fysisch niet-lineaire stand nam
// betonstijfheid — vier lezingen van één staaf, zonder melding.
//
// De keuze, en waarom: een korte naam is HOUT, nooit stil beton. Zo verandert
// geen bestaand houtproject (een houten C30-staaf rekende al als hout en blijft
// dat); wat verdwijnt is de spooktoets van de betonbouwer op de houtstijfheid.
// Beton vraagt de volledige naam ("C30/37") — de kiezers in de app schrijven
// die al, en de Rust-kant (`is_betonklasse`) hanteerde die regel al.
// De dubbelzinnigheid zelf wordt gemeld: waarschuwing zonder korf, fout mét
// korf (dan botsen de twee lezingen), in de modelcontrole én de MCP-poort.
//
// Draaien met: npx tsx test-materiaal-dubbelzinnig.mjs

const { matchSupportedConcreteClass, buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { matchSupportedTimberGrade, buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const { dubbelzinnigMateriaal } = await import("./src/lib/materiaalDubbelzinnig.ts");
const { materiaalVanStaaf } = await import("./src/lib/variantInvoer.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { controleerModel, heeftFouten } = await import("./src/lib/modelControle.ts");
const { betonStavenUitModel } = await import("./src/lib/betonStijfheid.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults, defaultCombinations } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

const korf = { cover_mm: 30, stirrup_diameter_mm: 8, top: { count: 2, diameter_mm: 12 }, bottom: { count: 3, diameter_mm: 16 } };
function model(mat, metKorf) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: mat, profile: "300x500", ...(metKorf ? { checkConfig: { betonKorf: korf } } : {}) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "Permanent", type: "dead" }, { id: 2, name: "Variabel", type: "live" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -10 }],
    selfWeightEnabled: true, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}

log("\n[1] Herkenning: de korte naam is geen beton, de volledige wel");
{
  ok('"C30" is geen betonklasse meer', matchSupportedConcreteClass("C30") === null);
  ok('"C35", "C20", "C16" evenmin', ["C35", "C20", "C16"].every((m) => matchSupportedConcreteClass(m) === null));
  ok('"C30/37" blijft C30/37', matchSupportedConcreteClass("C30/37") === "C30/37");
  ok('"c30 / 37" (spaties, kleine letters) blijft C30/37', matchSupportedConcreteClass("c30 / 37") === "C30/37");
  ok('"C30" is houtsterkteklasse C30', matchSupportedTimberGrade("C30") === "C30");
  const d = dubbelzinnigMateriaal("C30");
  ok('dubbelzinnigMateriaal("C30") = hout C30 / beton C30/37', d?.hout === "C30" && d?.beton === "C30/37", JSON.stringify(d));
  ok('"C24" is niet dubbelzinnig (geen betonklasse C24/..)', dubbelzinnigMateriaal("C24") === null);
  ok('"C30/37" is niet dubbelzinnig', dubbelzinnigMateriaal("C30/37") === null);
  ok('"S235" is niet dubbelzinnig', dubbelzinnigMateriaal("S235") === null);
  ok("alle vier de botsende namen worden herkend",
    ["C16", "C20", "C30", "C35"].every((m) => dubbelzinnigMateriaal(m) !== null));
}

log("\n[2] Eén lezing door de hele keten: hout");
{
  for (const metKorf of [false, true]) {
    const m = model("C30", metKorf);
    ok(`korf=${metKorf}: materiaalVanStaaf = hout`, materiaalVanStaaf(m.beams[0]) === "hout", materiaalVanStaaf(m.beams[0]));
    const sec = resolveSection("C30", "300x500");
    ok(`korf=${metKorf}: solver E = 12 000 N/mm² (EN 338 C30), ongewijzigd`, sec.E === 12000, String(sec.E));
    const mi = bouwMultiInput(m);
    const eg = mi.loads.find((l) => l.caseId === 1);
    ok(`korf=${metKorf}: eigen gewicht van hout (0,677 kN/m), ongewijzigd`, eg && Math.abs(eg.q + 0.677) < 0.002, eg ? String(eg.q) : "geen");
    const r = solveAllCases(mi);
    const combos = defaultCombinations();
    const cr = new Map(combos.map((c) => [c.id, combineResults(c, r.perCase)]));
    const data = { nodes: m.nodes, beams: m.beams, supports: m.supports, combinations: combos, combinationResults: cr };
    const hout = buildTimberCheckInputs({ ...data });
    ok(`korf=${metKorf}: houtbouwer toetst staaf 1`, hout.inputs.length === 1 && hout.inputs[0].beam_id === 1);
    const korven = new Map(m.beams.filter((b) => b.checkConfig?.betonKorf).map((b) => [b.id, { korf: b.checkConfig.betonKorf }]));
    const beton = buildBetonCheckInputs({ ...data, korven });
    ok(`korf=${metKorf}: betonbouwer toetst NIET (was: spooktoets op C30/37)`, beton.inputs.length === 0, JSON.stringify(beton.inputs.map((i) => i.concrete_class)));
    ok(`korf=${metKorf}: betonbouwer meldt ook geen 'geen korf' meer (geen betonstaaf)`, beton.skipped.length === 0, JSON.stringify(beton.skipped));
    const stijf = betonStavenUitModel({ beams: m.beams, nodes: m.nodes });
    ok(`korf=${metKorf}: fysisch niet-lineair neemt geen betonstijfheid`, stijf.staven.length === 0);
  }
}

log("\n[3] De melding: waarschuwing zonder korf, fout mét korf — MCP-poort");
{
  const zonder = valideerModel(model("C30", false));
  ok("zonder korf: model geldig", zonder.ok === true, JSON.stringify(zonder.errors));
  ok("zonder korf: waarschuwing 'dubbelzinnig' met beide lezingen",
    zonder.warnings.some((w) => /dubbelzinnig/.test(w) && /C30\/37/.test(w) && /EN 338/.test(w) && /HOUT/.test(w)),
    zonder.warnings.join(" | "));
  const met = valideerModel(model("C30", true));
  ok("met korf: model ongeldig", met.ok === false);
  ok("met korf: fout noemt de korf en de botsing", met.errors.some((e) => /dubbelzinnig/.test(e) && /wapeningskorf/.test(e)), met.errors.join(" | "));
  const hout = valideerModel(model("C24", true));
  ok('"C24" met korf: geen dubbelzinnigheid gemeld', !hout.warnings.some((w) => /dubbelzinnig/.test(w)) && !hout.errors.some((e) => /dubbelzinnig/.test(e)));
  const beton = valideerModel(model("C30/37", true));
  ok('"C30/37" met korf: schoon', beton.ok === true && !beton.warnings.some((w) => /dubbelzinnig/.test(w)), JSON.stringify(beton.errors));
}

log("\n[4] De melding in de modelcontrole van de app");
{
  const zonder = controleerModel(model("C30", false));
  const w = zonder.find((b) => b.soort === "dubbelzinnigMateriaal");
  ok("zonder korf: bevinding 'dubbelzinnigMateriaal' als waarschuwing", w?.ernst === "waarschuwing" && w.beamId === 1, JSON.stringify(zonder));
  ok("zonder korf: niet blokkerend", !heeftFouten(zonder));
  const met = controleerModel(model("C30", true));
  const f = met.find((b) => b.soort === "dubbelzinnigMateriaal");
  ok("met korf: bevinding als fout (blokkeert het rekenen)", f?.ernst === "fout" && heeftFouten(met));
  ok("met korf: tekst zegt wat te doen", /Schrijf "C30\/37" voor beton, of haal de korf weg/.test(f?.tekst ?? ""), f?.tekst);
  ok('"C24": geen bevinding', controleerModel(model("C24", false)).length === 0);
  ok('"C30/37": geen bevinding', controleerModel(model("C30/37", true)).length === 0);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
