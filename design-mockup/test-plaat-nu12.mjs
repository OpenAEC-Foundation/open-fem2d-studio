// Dwarscontractie ν₁₂ van een houten of kruislaaghouten plaat (issue #14,
// deel 3): standaard 0 als ZICHTBARE aanname, per plaat overschrijfbaar, en
// een onmogelijke waarde geweigerd vóór er gerekend wordt.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] AANNAME ZICHTBAAR. Hout (C24) en kruislaaghout zonder ν-veld: ν₁₂ = 0,
//       bron "aanname" (niet "materiaal"), en de herkomst — die het rapport
//       letterlijk toont — zegt "AANNAME ν₁₂ = 0". Staal en beton houden bron
//       "materiaal" (ν staat daar in de norm).
//   [2] OVERSCHRIJFBAAR. `nu` = 0,3 op C24: ν₁₂ = 0,3, bron "handmatig", de
//       plaat blijft richtingsafhankelijk (E₁ = 11 000, E₂ = 370).
//   [3] DE SCHIJF REKENT ERMEE, tegen de hand. C24, θ = 0°, verticale trek
//       σ = 0,5 N/mm² op een wand 2000 × 3000 mm, onderrand op rollen met een
//       scharnier in het midden (x = 1000). Homogene spanning, dus exact:
//           ε_z = σ/E₂                     → u_z(top) = 0,5·3000/370
//                                                     = 4,054054… mm
//           ε_x = −ν₂₁·σ/E₂ = −ν₁₂·σ/E₁    → u_x(x = 2000) = −0,3·0,5/11000·1000
//                                                          = −0,0136363… mm
//       en met ν₁₂ = 0 is u_x = 0 (tot op afrondruis).
//   [4] WEIGERING. ν₁₂·ν₂₁ ≥ 1 is geen materiaal: bij C24 moet
//       ν₁₂ < √(11000/370) = 5,4525…. ν₁₂ = 6 wordt geweigerd in de bepaling,
//       de MCP-poort en de berekening (met de grens in de reden); ν₁₂ = 5
//       (ν₁₂·ν₂₁ = 25·370/11000 = 0,841) rekent.
//   [5] SPIEGEL / DOORVOER. `nu` reist mee door `bouwMultiInput` en het
//       projectbestand, de MCP-poort kent het veld, en het MCP-schema
//       (`schema_plates` in fem_tools.rs, van schijf gelezen) beschrijft
//       `nu` met de aanname voor hout. Dat de sleutels van schema en poort
//       gelijk zijn, bewaakt de Rust-spiegeltest
//       `schema_plates_en_meshcache_spiegelen_de_plaatpoort_van_de_sidecar`.
//
// Uitvoeren: npx tsx test-plaat-nu12.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { bepaalPlaatStijfheid } = await import("./src/lib/plaatMateriaal.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");
const { readFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");
const { dirname, join } = await import("node:path");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkAbs(name, actual, expected, tol) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  checkTrue(name, ok, `${Number(actual).toExponential(12)} ≈ ${Number(expected).toExponential(12)}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}

const CLT = "CLT C24 40/20/40/20/40";
const B = 2000, H = 3000, T = 20, S = 500, SIGMA = 0.5;

/** Verticale trek: onderrand op rollen (midden scharnier), trek op de bovenrand. */
function trekVerticaal(plaatExtra = {}) {
  const nx = B / S, nodes = [];
  for (let i = 0; i <= nx; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  const tl = nx + 2, tr = nx + 3;
  nodes.push({ id: tl, x: 0, z: H }, { id: tr, x: B, z: H });
  const midden = 1 + nx / 2;
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nx + 1).map((n) =>
      ({ nodeId: n.id, type: n.id === midden ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, nx + 1, tr, tl], thickness: T, meshSize: S, ...plaatExtra }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: SIGMA * T, dir: "z" }],
    cases: [{ id: 1, name: "Q" }],
    rechtsBoven: tr,
  };
}
const mcpModel = (plaatExtra) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
  beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
  loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
  plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, meshSize: 500, ...plaatExtra }],
});

// ═════════════════════════════════════════════════════════════════════════
log("\n[1] ν₁₂ = 0 als zichtbare aanname");
{
  for (const [naam, invoer] of [["C24", { materiaal: "C24" }], ["kruislaaghout", { materiaal: CLT, cltG12Bovengrens: true }]]) {
    const uit = bepaalPlaatStijfheid(invoer);
    checkTrue(`${naam}: ν₁₂ = 0 met bron "aanname"`,
      uit.ok && uit.stijfheid.nu12 === 0 && uit.stijfheid.bronNu === "aanname",
      uit.ok ? `${uit.stijfheid.nu12} ${uit.stijfheid.bronNu}` : uit.reden);
    checkTrue(`${naam}: herkomst zegt "AANNAME ν₁₂ = 0" en noemt NEN-EN 1995-1-1 en EN 338`,
      uit.ok && /AANNAME ν₁₂ = 0/.test(uit.stijfheid.herkomst)
      && /NEN-EN 1995-1-1/.test(uit.stijfheid.herkomst) && /EN 338/.test(uit.stijfheid.herkomst),
      uit.ok ? uit.stijfheid.herkomst : "");
  }
  for (const [naam, materiaal, nu] of [["S355", "S355", 0.3], ["C30/37", "C30/37", 0.2]]) {
    const uit = bepaalPlaatStijfheid({ materiaal });
    checkTrue(`${naam}: ν = ${nu} met bron "materiaal" (normwaarde)`,
      uit.ok && uit.stijfheid.nu12 === nu && uit.stijfheid.bronNu === "materiaal");
  }
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[2] Overschrijfbaar per plaat");
{
  const uit = bepaalPlaatStijfheid({ materiaal: "C24", nu: 0.3 });
  checkTrue("C24 met nu = 0,3: ν₁₂ = 0,3, bron handmatig, nog orthotroop",
    uit.ok && uit.stijfheid.nu12 === 0.3 && uit.stijfheid.bronNu === "handmatig"
    && uit.stijfheid.orthotroop && uit.stijfheid.E1 === 11000 && uit.stijfheid.E2 === 370,
    uit.ok ? JSON.stringify({ nu12: uit.stijfheid.nu12, bron: uit.stijfheid.bronNu }) : uit.reden);
  checkTrue("herkomst noemt de overschrijving van de aanname",
    uit.ok && /in plaats van de aanname ν₁₂ = 0/.test(uit.stijfheid.herkomst), uit.ok ? uit.stijfheid.herkomst : "");
  const clt = bepaalPlaatStijfheid({ materiaal: CLT, cltG12Bovengrens: true, nu: 0.1 });
  checkTrue("kruislaaghout met nu = 0,1: ν₁₂ = 0,1, bron handmatig, nog orthotroop",
    clt.ok && clt.stijfheid.nu12 === 0.1 && clt.stijfheid.bronNu === "handmatig" && clt.stijfheid.orthotroop);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[3] De schijf rekent met ν₁₂ (C24, θ = 0°, verticale trek)");
{
  const m3 = trekVerticaal({ materiaal: "C24", nu: 0.3 });
  const r3 = solveAllCases(m3).perCase.get(1).displacements.get(m3.rechtsBoven);
  checkAbs("ν₁₂ = 0,3: u_z(top) = σH/E₂", r3.uz, SIGMA * H / 370, 1e-9);
  checkAbs("ν₁₂ = 0,3: u_x(x = 2000) = −ν₁₂·σ/E₁·1000", r3.ux, -0.3 * SIGMA / 11000 * 1000, 1e-12);
  checkAbs("  (handwaarde −0,0136363 mm)", -0.3 * SIGMA / 11000 * 1000, -0.0136363, 1e-7);
  const m0 = trekVerticaal({ materiaal: "C24" });
  const r0 = solveAllCases(m0).perCase.get(1).displacements.get(m0.rechtsBoven);
  checkAbs("ν₁₂ = 0 (aanname): u_x = 0", r0.ux, 0, 1e-12);
  checkAbs("ν₁₂ = 0 (aanname): u_z gelijk aan ν₁₂ = 0,3", r0.uz, r3.uz, 1e-9);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[4] Weigering bij ν₁₂·ν₂₁ ≥ 1");
{
  const uit = bepaalPlaatStijfheid({ materiaal: "C24", nu: 6 });
  checkTrue("C24 met ν₁₂ = 6: geweigerd met de grens √(E₁/E₂) ≈ 5,45",
    !uit.ok && /ν₁₂·ν₂₁ ≥ 1/.test(uit.reden) && /√\(E₁\/E₂\) = 5\.45/.test(uit.reden), uit.ok ? "GEEN weigering" : uit.reden);
  const vijf = bepaalPlaatStijfheid({ materiaal: "C24", nu: 5 });
  checkTrue("C24 met ν₁₂ = 5 (ν₁₂·ν₂₁ = 0,841): geaccepteerd", vijf.ok, vijf.ok ? "" : vijf.reden);
  const poort = valideerModel(mcpModel({ materiaal: "C24", nu: 6 }));
  checkTrue("valideerModel weigert ν₁₂ = 6 bij C24",
    !poort.ok && poort.errors.some((f) => /plates\[0\]/.test(f) && /ν₁₂·ν₂₁ ≥ 1/.test(f)), (poort.errors ?? []).join(" | "));
  weigert("solveAllCases weigert ν₁₂ = 6 vóór de assemblage (reden uit de bepaling)",
    () => solveAllCases(trekVerticaal({ materiaal: "C24", nu: 6 })), /Plaat 1: ν₁₂ = 6 is onmogelijk/);
  // Isotroop verandert niet: staal met ν = 0,3 rekent zoals altijd.
  checkTrue("S355 met nu = 0,3: geaccepteerd", bepaalPlaatStijfheid({ materiaal: "S355", nu: 0.3 }).ok);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[5] Spiegel en doorvoer van het ν-veld");
{
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, meshSize: 500, materiaal: "C24", nu: 0.25 }],
    loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
  };
  const mi = bouwMultiInput(model);
  checkTrue("nu staat in de solverinvoer naast het materiaal",
    mi.plates[0].nu === 0.25 && mi.plates[0].materiaal === "C24" && mi.plates[0].E === undefined,
    JSON.stringify(mi.plates[0]));
  const terug = deserializeProject(serializeProject({
    nodes: model.nodes, beams: [], supports: model.supports, plates: model.plates, loads: [],
    loadCases: model.loadCases, activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  }));
  checkTrue("projectbestand: nu heen en terug, E blijft leeg",
    terug.plates[0].nu === 0.25 && terug.plates[0].E === undefined, JSON.stringify(terug.plates[0]));
  const poort = valideerModel(mcpModel({ materiaal: "C24", nu: 0.25 }));
  checkTrue("valideerModel laat nu bij hout door", poort.ok, (poort.errors ?? []).join(" | "));

  const hier = dirname(fileURLToPath(import.meta.url));
  const rs = readFileSync(join(hier, "..", "src-tauri", "crates", "openaec-mcp-server", "src", "fem_tools.rs"), "utf8");
  const start = rs.indexOf("fn schema_plates()");
  const blok = start >= 0 ? rs.slice(start, rs.indexOf("\n}\n", start)) : "";
  const nuRegel = blok.split("\n").find((l) => l.trim().startsWith("\"nu\":")) ?? "";
  checkTrue("MCP-schema: schema_plates kent nu", nuRegel !== "", nuRegel.slice(0, 60));
  checkTrue("MCP-schema: nu noemt de AANNAME nu_12 = 0 voor hout en de weigering",
    /AANNAME/.test(nuRegel) && /hout/.test(nuRegel) && /geweigerd/.test(nuRegel), nuRegel);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
