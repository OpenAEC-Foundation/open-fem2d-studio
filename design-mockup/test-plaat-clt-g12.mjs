// G₁₂ van een KRUISLAAGHOUTEN plaat (issue #14, deel 2): verplichte invoer
// met bron, of bewust de niet-gereduceerde bovengrens met waarschuwing.
//
// WAAROM. De glijdingsmodulus in het vlak van kruislaaghout ligt onder de
// uitgesmeerde G_mean van de lamellen (niet-verlijmde smalle zijden,
// wringing in de kruisingsvlakken). NEN-EN 1995-1-1 en EN 338 geven die
// reductie niet, en er stond geen productnorm, ETA of ontwerp-Eurocode voor
// kruislaaghout op schijf. Dus wordt er niets aangenomen: zie de kop van
// `lib/plaatMateriaal.ts`.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] WEIGERINGEN met reden, langs de bepaling, de MCP-veldpoort
//       (`valideerModel`) en de berekening (`solveAllCases`): geen keuze,
//       cltG12 zonder bron, bron zonder cltG12, beide keuzes tegelijk,
//       cltG12 ≤ 0, de G₁₂-velden bij massief hout of zonder materiaal, en
//       cltG12 naast een handmatige E.
//   [2] BOVENGRENS. `cltG12Bovengrens: true` geeft G₁₂ = Σt·G_mean/Σt = 690
//       (alle lagen C24), bron "bovengrens" en een waarschuwing.
//   [3] DE SCHIJF REKENT MET DE GEKOZEN G₁₂, tegen de hand. Opbouw
//       "CLT C24 40/20/40/20/40": E₁ = 8342,5, E₂ = 3027,5 N/mm², ν₁₂ = 0.
//       Hoofdrichting 45°, horizontale trek σ = 0,5 N/mm² over B = 2000 mm.
//       Een homogene spanningstoestand is exact (rollen laten de schuifrek
//       vrij), en de compliantie in de trekrichting is bij θ = 45°:
//           1/Eₓ = c⁴/E₁ + s⁴/E₂ + (1/G₁₂ − 2ν₁₂/E₁)·s²c²
//                = (1/E₁ + 1/E₂ + 1/G₁₂)/4          (c² = s² = ½, ν₁₂ = 0)
//       dus u = σ·B·(1/E₁ + 1/E₂ + 1/G₁₂)/4:
//           G₁₂ = 690 (bovengrens): u = 1000·(1/8342,5 + 1/3027,5 + 1/690)/4
//                                    = 0,474862… mm
//           G₁₂ = 250 (met bron):  u = 1000·(1/8342,5 + 1/3027,5 + 1/250)/4
//                                    = 1,112543… mm
//       (de getallen rekent de test zelf uit dezelfde formule; hier staan ze
//       ter controle met de hand).
//   [4] cltG12 GROTER DAN DE BOVENGRENS rekent wel, maar met waarschuwing.
//   [5] DOORVOER. De drie velden reizen mee door `bouwMultiInput` (en ontbreken
//       bij een plaat die ze niet draagt), door het projectbestand, en de
//       MCP-poort laat een geldige keuze door.
//   [6] SOORT blijft kruislaaghout zonder G₁₂-keuze: `plaatMateriaalSoort` en
//       het kruipgedrag noemen de wand hout, niet "niet herkend materiaal".
//   [7] BIT-GELIJK: met `cltG12Bovengrens` rekent de plaat met exact de G₁₂
//       van vóór deze keuze (dezelfde uitsmering, `cltVlakStijfheid`).
//
// Uitvoeren: npx tsx test-plaat-clt-g12.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const {
  bepaalPlaatStijfheid, keurPlaatMateriaal, cltVlakStijfheid, ontleedPlaatClt, plaatMateriaalSoort,
} = await import("./src/lib/plaatMateriaal.ts");
const { kruipgedragVanPlaat } = await import("./src/lib/houtEindstijfheid.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * Math.abs(expected);
  checkTrue(name, ok, `${Number(actual).toExponential(12)} ≈ ${Number(expected).toExponential(12)}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}

const CLT = "CLT C24 40/20/40/20/40";
const E1 = 1334800 / 160, E2 = 484400 / 160;     // 8342,5 en 3027,5 N/mm²
const B = 2000, H = 3000, T = 160, S = 500, SIGMA = 0.5;

/** Horizontale trek: linkerrand op rollen (midden scharnier), trek op de rechterrand. */
function trekHorizontaal(plaatExtra = {}) {
  const nz = H / S, nodes = [];
  for (let j = 0; j <= nz; j++) nodes.push({ id: 1 + j, x: 0, z: j * S });
  const br = nz + 2, tr = nz + 3, rm = nz + 4;
  nodes.push({ id: br, x: B, z: 0 }, { id: tr, x: B, z: H }, { id: rm, x: B, z: (nz / 2) * S });
  const midden = 1 + nz / 2;
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nz + 1).map((n) =>
      ({ nodeId: n.id, type: n.id === midden ? "pinned" : "xRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, br, tr, nz + 1], thickness: T, meshSize: S, ...plaatExtra }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "right", p: SIGMA * T, dir: "x" }],
    cases: [{ id: 1, name: "Q" }],
    rechtsMidden: rm,
  };
}
const mcpModel = (plaatExtra) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
  beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
  loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
  plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 160, meshSize: 500, ...plaatExtra }],
});

// ═════════════════════════════════════════════════════════════════════════
log("\n[1] Weigeringen met reden");
{
  const gevallen = [
    ["kruislaaghout zonder G₁₂-keuze", { materiaal: CLT }, /G₁₂ in het vlak ontbreekt/],
    ["cltG12 zonder bron", { materiaal: CLT, cltG12: 250 }, /zonder cltG12Bron/],
    ["cltG12 met lege bron", { materiaal: CLT, cltG12: 250, cltG12Bron: "   " }, /zonder cltG12Bron/],
    ["bron zonder cltG12", { materiaal: CLT, cltG12Bron: "ETA-00/0000" }, /zonder cltG12\./],
    ["cltG12 én bovengrens", { materiaal: CLT, cltG12: 250, cltG12Bron: "ETA", cltG12Bovengrens: true }, /allebei gezet/],
    ["cltG12 = 0", { materiaal: CLT, cltG12: 0, cltG12Bron: "ETA" }, /positief getal/],
    ["cltG12 negatief", { materiaal: CLT, cltG12: -5, cltG12Bron: "ETA" }, /positief getal/],
    ["G₁₂-velden bij massief hout", { materiaal: "C24", cltG12Bovengrens: true }, /alleen bij kruislaaghout/],
    ["G₁₂-velden zonder materiaal", { cltG12: 250, cltG12Bron: "ETA" }, /alleen bij kruislaaghout/],
    ["cltG12 naast handmatige E", { materiaal: CLT, E: 9000, cltG12: 250, cltG12Bron: "ETA" }, /rekent isotroop/],
  ];
  for (const [naam, invoer, patroon] of gevallen) {
    const uit = bepaalPlaatStijfheid(invoer);
    checkTrue(`${naam}: geweigerd`, !uit.ok && patroon.test(uit.reden), uit.ok ? "GEEN weigering" : uit.reden);
    const reden = keurPlaatMateriaal(invoer);
    checkTrue(`${naam}: keurPlaatMateriaal geeft dezelfde reden`, !uit.ok && reden === uit.reden);
  }
  // Alleen de naam keuren: de G₁₂-plicht geldt ook dan.
  checkTrue("keurPlaatMateriaal(naam) van kruislaaghout zonder keuze weigert",
    /G₁₂ in het vlak ontbreekt/.test(keurPlaatMateriaal(CLT) ?? ""));
  // De reden noemt beide uitwegen, zodat de gebruiker niet hoeft te raden.
  const reden = keurPlaatMateriaal(CLT) ?? "";
  checkTrue("de weigering noemt cltG12 met bron én de bovengrens",
    /cltG12 \(N\/mm²\) met cltG12Bron/.test(reden) && /cltG12Bovengrens/.test(reden), reden);

  const poort = valideerModel(mcpModel({ materiaal: CLT }));
  checkTrue("valideerModel weigert kruislaaghout zonder G₁₂-keuze",
    !poort.ok && poort.errors.some((f) => /plates\[0\]\.materiaal/.test(f) && /G₁₂ in het vlak ontbreekt/.test(f)),
    (poort.errors ?? []).join(" | "));
  const poortType = valideerModel(mcpModel({ materiaal: CLT, cltG12: "250", cltG12Bron: 7 }));
  checkTrue("valideerModel weigert verkeerde typen van cltG12 en cltG12Bron",
    !poortType.ok && poortType.errors.some((f) => /cltG12\b/.test(f)) && poortType.errors.some((f) => /cltG12Bron/.test(f)),
    (poortType.errors ?? []).join(" | "));
  const poortBool = valideerModel(mcpModel({ materiaal: CLT, cltG12Bovengrens: "ja" }));
  checkTrue("valideerModel weigert een niet-boolean cltG12Bovengrens",
    !poortBool.ok && poortBool.errors.some((f) => /cltG12Bovengrens/.test(f)), (poortBool.errors ?? []).join(" | "));
  weigert("solveAllCases weigert kruislaaghout zonder G₁₂-keuze",
    () => solveAllCases(trekHorizontaal({ materiaal: CLT })), /Plaat 1: .*G₁₂ in het vlak ontbreekt/);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[2] Bovengrens: uitgesmeerde G_mean met waarschuwing");
{
  const uit = bepaalPlaatStijfheid({ materiaal: CLT, cltG12Bovengrens: true });
  checkTrue("geaccepteerd", uit.ok, uit.ok ? "" : uit.reden);
  const st = uit.stijfheid;
  checkTrue("G₁₂ = 690, bron 'bovengrens'", st.G12 === 690 && st.bronG12 === "bovengrens", `${st.G12} ${st.bronG12}`);
  checkTrue("één waarschuwing die 'ZONDER reductie' en 'bovengrens' noemt",
    st.waarschuwingen.length === 1 && /ZONDER reductie/.test(st.waarschuwingen[0]) && /bovengrens/.test(st.waarschuwingen[0]),
    st.waarschuwingen.join(" | "));
  checkTrue("herkomst zegt BOVENGRENS", /BOVENGRENS/.test(st.herkomst), st.herkomst);
  const poort = valideerModel(mcpModel({ materiaal: CLT, cltG12Bovengrens: true }));
  checkTrue("valideerModel laat de bovengrenskeuze door", poort.ok, (poort.errors ?? []).join(" | "));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[3] De schijf rekent met de gekozen G₁₂ (θ = 45°, eenassige trek)");
{
  const uVerwacht = (g) => SIGMA * B * (1 / E1 + 1 / E2 + 1 / g) / 4;
  const mBoven = trekHorizontaal({ materiaal: CLT, hoofdrichting: 45, cltG12Bovengrens: true });
  const uBoven = solveAllCases(mBoven).perCase.get(1).displacements.get(mBoven.rechtsMidden).ux;
  checkRel("bovengrens G₁₂ = 690: u = σB(1/E₁ + 1/E₂ + 1/G₁₂)/4", uBoven, uVerwacht(690), 1e-9);
  checkRel("  (handwaarde 0,474862 mm)", uVerwacht(690), 0.474862, 1e-6);

  const bron = "ETA-00/0000, tabel 3 (proefwaarde)";
  const uit = bepaalPlaatStijfheid({ materiaal: CLT, cltG12: 250, cltG12Bron: bron });
  checkTrue("cltG12 = 250 met bron: geaccepteerd, bron 'handmatig', geen waarschuwing",
    uit.ok && uit.stijfheid.G12 === 250 && uit.stijfheid.bronG12 === "handmatig" && uit.stijfheid.waarschuwingen.length === 0,
    uit.ok ? JSON.stringify(uit.stijfheid.waarschuwingen) : uit.reden);
  checkTrue("herkomst noemt de bron letterlijk", uit.ok && uit.stijfheid.herkomst.includes(bron), uit.ok ? uit.stijfheid.herkomst : "");
  const m250 = trekHorizontaal({ materiaal: CLT, hoofdrichting: 45, cltG12: 250, cltG12Bron: bron });
  const u250 = solveAllCases(m250).perCase.get(1).displacements.get(m250.rechtsMidden).ux;
  checkRel("G₁₂ = 250: u = σB(1/E₁ + 1/E₂ + 1/G₁₂)/4", u250, uVerwacht(250), 1e-9);
  checkRel("  (handwaarde 1,112543 mm)", uVerwacht(250), 1.112543, 1e-6);

  // Bij θ = 0° doet G₁₂ niet mee in eenassige trek: beide keuzes gelijk.
  const m0a = trekHorizontaal({ materiaal: CLT, cltG12Bovengrens: true });
  const m0b = trekHorizontaal({ materiaal: CLT, cltG12: 250, cltG12Bron: bron });
  checkRel("θ = 0°: u = σB/E₁, onafhankelijk van G₁₂",
    solveAllCases(m0b).perCase.get(1).displacements.get(m0b.rechtsMidden).ux,
    solveAllCases(m0a).perCase.get(1).displacements.get(m0a.rechtsMidden).ux, 1e-9);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[4] cltG12 boven de bovengrens: rekent, met waarschuwing");
{
  const uit = bepaalPlaatStijfheid({ materiaal: CLT, cltG12: 800, cltG12Bron: "ETA-00/0000" });
  checkTrue("geaccepteerd met één waarschuwing die de bovengrens noemt",
    uit.ok && uit.stijfheid.G12 === 800 && uit.stijfheid.waarschuwingen.length === 1
    && /groter dan de uitgesmeerde G_mean/.test(uit.stijfheid.waarschuwingen[0]),
    uit.ok ? uit.stijfheid.waarschuwingen.join(" | ") : uit.reden);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[5] Doorvoer: solverinvoer, projectbestand, MCP-poort");
{
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [
      { id: 1, nodeIds: [1, 2, 3, 4], thickness: 160, meshSize: 500, materiaal: CLT, cltG12: 250, cltG12Bron: "ETA-00/0000" },
      { id: 2, nodeIds: [1, 2, 3, 4], thickness: 160, meshSize: 500, materiaal: CLT, cltG12Bovengrens: true },
      { id: 3, nodeIds: [1, 2, 3, 4], thickness: 20, meshSize: 500, materiaal: "C24" },
    ],
    loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
  };
  const mi = bouwMultiInput(model);
  checkTrue("cltG12 en cltG12Bron staan in de solverinvoer",
    mi.plates[0].cltG12 === 250 && mi.plates[0].cltG12Bron === "ETA-00/0000" && !("cltG12Bovengrens" in mi.plates[0]),
    JSON.stringify(mi.plates[0]));
  checkTrue("cltG12Bovengrens staat in de solverinvoer",
    mi.plates[1].cltG12Bovengrens === true && !("cltG12" in mi.plates[1]), JSON.stringify(mi.plates[1]));
  checkTrue("een plaat zonder G₁₂-velden krijgt ze ook niet",
    !("cltG12" in mi.plates[2]) && !("cltG12Bron" in mi.plates[2]) && !("cltG12Bovengrens" in mi.plates[2]),
    JSON.stringify(mi.plates[2]));

  const tekst = serializeProject({
    nodes: model.nodes, beams: [], supports: model.supports, plates: model.plates, loads: [],
    loadCases: model.loadCases, activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  });
  const terug = deserializeProject(tekst);
  checkTrue("projectbestand: cltG12/cltG12Bron heen en terug",
    terug.plates[0].cltG12 === 250 && terug.plates[0].cltG12Bron === "ETA-00/0000");
  checkTrue("projectbestand: cltG12Bovengrens heen en terug", terug.plates[1].cltG12Bovengrens === true);

  const poort = valideerModel(mcpModel({ materiaal: CLT, cltG12: 250, cltG12Bron: "ETA-00/0000" }));
  checkTrue("valideerModel laat cltG12 met bron door", poort.ok, (poort.errors ?? []).join(" | "));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[6] Soort en kruipgedrag zonder G₁₂-keuze");
{
  checkTrue("plaatMateriaalSoort(kruislaaghout) = clt", plaatMateriaalSoort(CLT) === "clt");
  checkTrue("plaatMateriaalSoort(leeg) = null, (C4) = onbekend",
    plaatMateriaalSoort(undefined) === null && plaatMateriaalSoort("C4") === "onbekend");
  const k = kruipgedragVanPlaat({ id: 1, nodeIds: [1, 2, 3, 4], materiaal: CLT });
  checkTrue("kruipgedrag van een kruislaaghouten wand zonder keuze: hout", k.soort === "hout", JSON.stringify(k));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[7] Bovengrens = de G₁₂ van vóór issue #14");
{
  const uit = ontleedPlaatClt(CLT);
  const oud = cltVlakStijfheid(uit.layup).G12;
  const st = bepaalPlaatStijfheid({ materiaal: CLT, cltG12Bovengrens: true }).stijfheid;
  checkTrue("G₁₂ bit-gelijk aan cltVlakStijfheid", Object.is(st.G12, oud), `${st.G12} vs ${oud}`);
  checkTrue("E₁, E₂, ν₁₂, ρ ongewijzigd",
    Object.is(st.E1, E1) && Object.is(st.E2, E2) && st.nu12 === 0 && st.rho === 420,
    JSON.stringify({ E1: st.E1, E2: st.E2, nu12: st.nu12, rho: st.rho }));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
