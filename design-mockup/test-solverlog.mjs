// Het solverlogboek — de keten van kern naar paneel.
//
// De kern MELDT via een callback en bewaart niets; `stores/solverLogStore` is de
// enige plek waar de regels blijven staan. Deze test loopt die keten af:
//
//   NonlinearSolver (onLog)  →  engine.ts (zetSolverLogOpvanger)  →  store
//
// Waarom dit een eigen test verdient: het log is juist het meest waard wanneer
// er GEEN resultaat komt. Divergeert de tweede orde, dan gooit de solver en
// verdwijnt elk resultaatobject — de regels tot en met de laatste iteratie
// moeten er dan nog steeds zijn. Een log dat alleen werkt als alles goed gaat,
// werkt precies dan niet wanneer je het nodig hebt.
//
// Uitvoeren: npx tsx test-solverlog.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { solveNonlinear } = await import("./src/core/solver/NonlinearSolver.ts");
const { solveAllCases, solveAllCasesNonlinear, zetSolverLogOpvanger } =
  await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { useSolverLogStore, maakSolverLogOpvanger } =
  await import("./src/stores/solverLogStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

const E = 210e9, A = 3877e-6, I = 1e-4, L = 4.0;

/** Scharnier-scharnier kolom, druk P op de top, dwarslast H op halve hoogte. */
function kolomMesh({ P = 0, H = 0 } = {}) {
  const mesh = new Mesh();
  const ids = [];
  for (let i = 0; i <= 4; i++) ids.push(mesh.addNode(0, (L / 4) * i).id);
  for (let i = 0; i < 4; i++) mesh.addBeamElement([ids[i], ids[i + 1]], 1, { A, I, h: 0.3 });
  mesh.updateNode(ids[0], { constraints: { x: true, y: true, rotation: false } });
  mesh.updateNode(ids[4], { constraints: { x: true, y: false, rotation: false } });
  if (H) mesh.updateNode(ids[2], { loads: { fx: H, fy: 0, moment: 0 } });
  if (P) mesh.updateNode(ids[4], { loads: { fx: 0, fy: -P, moment: 0 } });
  return mesh;
}

/** Dezelfde kolom als engine-invoer (mm en N, zoals de adapter hem wil). */
function kolomInput({ P = 0, H = 0 } = {}) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: i + 1, x: 0, z: (4000 / 4) * i });
  const beams = [];
  for (let i = 0; i < 4; i++) beams.push({ id: i + 1, from: i + 1, to: i + 2, E: 210000, A: 3877, I: 1e8 });
  const pointLoads = [];
  if (H) pointLoads.push({ nodeId: 3, fx: H, caseId: 1 });
  if (P) pointLoads.push({ nodeId: 5, fz: -P, caseId: 1 });
  return {
    nodes, beams,
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 5, type: "xRoller" }],
    loads: [], pointLoads, cases: [{ id: 1, name: "LC1" }],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// [1] Zonder opvanger meldt de solver niets
//
// De sidecar draait in een kaal Node-proces en zet geen opvanger. Zou de kern
// dan tóch tekst opbouwen, dan betaalt elke MCP-solve daarvoor zonder dat er
// iemand meeleest. `onLog` weglaten moet dus letterlijk niets kosten — en
// vooral niet omvallen.
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zonder opvanger: geen log, geen fout");
{
  const r = solveNonlinear(kolomMesh({ H: 10e3 }), { analysisType: "frame" });
  checkTrue("de solve loopt gewoon door", r.displacements.length > 0,
    `${r.displacements.length} vrijheidsgraden`);
}

// ─────────────────────────────────────────────────────────────────────────
// [2] Een lineaire solve meldt zijn drie stappen
//
// Assembly, randvoorwaarden, oplossen. Geen iteraties — die horen er bij een
// lineaire som niet te zijn, en als ze er tóch staan rekent de solver iets
// anders dan hij zegt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Lineaire solve: info-regels, geen iteraties");
{
  const regels = [];
  solveNonlinear(kolomMesh({ H: 10e3 }), {
    analysisType: "frame",
    onLog: (r) => regels.push(r),
  });

  checkTrue("er komen regels", regels.length >= 4, `${regels.length} regels`);
  checkTrue("géén iteratieregels", regels.every((r) => r.soort !== "iteratie"));
  checkTrue("het model staat erin",
    regels.some((r) => /5 knopen, 4 staven/.test(r.tekst)), regels[0]?.tekst);
  checkTrue("de analysesoort staat erin",
    regels.some((r) => /lineair/.test(r.tekst)));
  checkTrue("de matrixafmeting staat erin",
    regels.some((r) => /Stijfheidsmatrix geassembleerd \(15×15\)/.test(r.tekst)));
  checkTrue("alle regels dragen een soort en een tekst",
    regels.every((r) => typeof r.tekst === "string" && r.tekst.length > 0
      && ["info", "iteratie", "waarschuwing", "fout"].includes(r.soort)));
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Een tweede-orde-solve meldt elke iteratie met beide normen
//
// ‖Δu‖ moet dalen — dat ís convergentie. Een log dat wel iteraties toont maar
// met een norm die niet daalt, verbergt precies het probleem waarvoor je kijkt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Tweede orde: iteraties met dalende ‖Δu‖");
{
  const regels = [];
  solveNonlinear(kolomMesh({ P: 300e3, H: 20e3 }), {
    analysisType: "frame", geometricNonlinear: true,
    maxIterations: 100, tolerance: 1e-6,
    onLog: (r) => regels.push(r),
  });

  const iters = regels.filter((r) => r.soort === "iteratie");
  checkTrue("er zijn iteratieregels", iters.length >= 2, `${iters.length} iteraties`);
  checkTrue("elke iteratie draagt beide normen",
    iters.every((r) => Number.isFinite(r.incrementNorm) && Number.isFinite(r.verplaatsingsNorm)));
  checkTrue("de iteratienummers lopen op vanaf 1",
    iters.every((r, i) => r.iteratie === i + 1), iters.map((r) => r.iteratie).join(","));
  checkTrue("‖Δu‖ daalt monotoon",
    iters.every((r, i) => i === 0 || r.incrementNorm <= iters[i - 1].incrementNorm),
    iters.map((r) => r.incrementNorm.toExponential(1)).join(" → "));
  checkTrue("de convergentie wordt gemeld",
    regels.some((r) => r.soort === "info" && /geconvergeerd/i.test(r.tekst)),
    regels.filter((r) => /geconvergeerd/i.test(r.tekst))[0]?.tekst);
  checkTrue("de stabiliteitscontrole wordt gemeld",
    regels.some((r) => /positief definiet/.test(r.tekst)));
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Bij een divergentie blijven de regels staan
//
// DE KERN VAN DE ZAAK. De solver gooit, er komt geen resultaatobject — en juist
// dan moet het log vertellen wat er gebeurde. Was het log een veld in het
// resultaat geweest, dan was er hier niets te zien.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Bij divergentie: de regels overleven de fout");
{
  const regels = [];
  let gegooid = false;
  try {
    solveNonlinear(kolomMesh({ P: 500e6, H: 20e3 }), {
      analysisType: "frame", geometricNonlinear: true,
      maxIterations: 100, tolerance: 1e-6,
      onLog: (r) => regels.push(r),
    });
  } catch {
    gegooid = true;
  }

  checkTrue("de solver gooit", gegooid);
  checkTrue("er staan tóch regels", regels.length > 0, `${regels.length} regels`);
  checkTrue("de laatste regels bevatten een foutregel",
    regels.some((r) => r.soort === "fout"),
    regels.filter((r) => r.soort === "fout").map((r) => r.tekst).join(" | "));
}

// ─────────────────────────────────────────────────────────────────────────
// [5] De store verzamelt, leegt en kapt af
//
// `maakSolverLogOpvanger` leegt het log bij het begin van elke berekening —
// zonder dat zou het paneel twee berekeningen als één reeks tonen. En boven
// MAX_REGELS vervallen de OUDSTE regels: het einde van de reeks (de
// convergentie of de fout) is wat de lezer zoekt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] De store: verzamelen, legen, afkappen");
{
  const opvanger = maakSolverLogOpvanger();
  opvanger({ soort: "info", tekst: "eerste" });
  opvanger({ soort: "info", tekst: "tweede" });
  let st = useSolverLogStore.getState();
  checkTrue("regels komen binnen", st.regels.length === 2, `${st.regels.length}`);
  checkTrue("de volgnummers lopen op", st.regels[0].nr === 0 && st.regels[1].nr === 1);

  // Een nieuwe berekening begint schoon.
  const tweede = maakSolverLogOpvanger();
  st = useSolverLogStore.getState();
  checkTrue("een nieuwe opvanger leegt het log", st.regels.length === 0);

  // Afkappen: 600 regels in een buffer van 500.
  for (let i = 0; i < 600; i++) tweede({ soort: "info", tekst: `regel ${i}` });
  st = useSolverLogStore.getState();
  checkTrue("er blijven 500 regels over", st.regels.length === 500, `${st.regels.length}`);
  checkTrue("de OUDSTE zijn weggevallen, niet de nieuwste",
    st.regels[st.regels.length - 1].tekst === "regel 599", st.regels[st.regels.length - 1].tekst);
  checkTrue("het aantal verloren regels wordt gemeld",
    st.verlorenRegels === 100, `${st.verlorenRegels}`);
  checkTrue("de eerste bewaarde regel is regel 100",
    st.regels[0].tekst === "regel 100", st.regels[0].tekst);
}

// ─────────────────────────────────────────────────────────────────────────
// [6] Via de engine draagt elke regel zijn belastinggeval of combinatie
//
// Vier gevallen leveren vier assemblies. Zonder voorvoegsel staan die onder
// elkaar zonder dat te zien is welke bij welk geval hoort — en juist bij een
// divergentie is dát de vraag: wélke combinatie liep vast?
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Via de engine: elk regel draagt zijn naam");
{
  zetSolverLogOpvanger(maakSolverLogOpvanger());
  solveAllCases(kolomInput({ H: 10e3 }));
  const regels = useSolverLogStore.getState().regels;

  checkTrue("er komen regels via de engine", regels.length > 0, `${regels.length} regels`);
  checkTrue("elke regel begint met het belastinggeval",
    regels.every((r) => r.tekst.startsWith("[LC1] ")), regels[0]?.tekst);
}

log("\n[7] Via de engine: de combinatienaam bij tweede orde");
{
  zetSolverLogOpvanger(maakSolverLogOpvanger());
  const nl = solveAllCasesNonlinear(kolomInput({ P: 300e3, H: 20e3 }));
  combineResults(
    { id: 1, name: "6.10a", type: "uls", formula: "1.0·LC1", factors: new Map([[1, 1.0]]) },
    nl.perCase,
  );
  const regels = useSolverLogStore.getState().regels;

  checkTrue("de combinatie meldt zich",
    regels.some((r) => r.tekst.startsWith("[6.10a] ")),
    regels.filter((r) => r.tekst.startsWith("[6.10a]"))[0]?.tekst);
  checkTrue("er zitten iteraties bij de combinatie",
    regels.some((r) => r.soort === "iteratie" && r.tekst.startsWith("[6.10a] ")));
  checkTrue("het belastinggeval staat er óók in (de 1e-orde-ronde)",
    regels.some((r) => r.tekst.startsWith("[LC1] ")));
}

// De opvanger weer wissen — anders blijft hij aan de engine hangen voor wie
// deze module later in hetzelfde proces gebruikt.
zetSolverLogOpvanger(undefined);

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
