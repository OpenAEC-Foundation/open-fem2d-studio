// Modelcontrole + herstelbewerkingen: de drie gebreken die een raamwerk
// stilzwijgend tot een mechanisme maken, en de reparatie ervan.
//
// Regels onder test:
//   - knoop die in het inwendige van een staaf ligt zonder eraan vast te zitten
//   - twee knopen op dezelfde plek zonder verbinding
//   - vrij staafuiteinde zonder oplegging (waarschuwing, geen fout)
//   - verbinden = staaf splitsen op die knoop; deellasten verhuizen mee
//   - samenvoegen = knoop opheffen, alles verhuist naar de blijver
//   - ACCEPTATIEPROEF: een portaal óp een doorgaande ligger met alle drie de
//     gebreken faalt met een singuliere matrix, rekent ná "herstel alles" wél
//     door, en draagt dan exact dezelfde totale belasting als ervoor.
//
// Uitvoeren: npx tsx test-modelcontrole.mjs

const {
  controleerModel, zoekKnopenOpStaaf, zoekDubbeleKnopen, zoekVrijeUiteinden,
  puntOpStaaf, heeftFouten,
} = await import("./src/lib/modelControle.ts");
const {
  computeBeamSplitOpKnoop, computeKnoopMetSplitsing, computeKnopenSamenvoegen,
  computeModelHerstel,
} = await import("./src/hooks/useFemStore.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function bijna(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: puntOpStaaf — inwendig ja, eindknopen en ernaast nee
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] puntOpStaaf: strikt inwendig, met tekentolerantie");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }];
  const b = { from: 1, to: 2 };
  check("midden op de staaf", puntOpStaaf(nodes, b, 1000, 0) !== null);
  check("fractie klopt", bijna(puntOpStaaf(nodes, b, 1000, 0), 0.25, 1e-12));
  check("0,4 mm ernaast telt nog mee", puntOpStaaf(nodes, b, 1000, 0.4) !== null);
  check("3 mm ernaast telt niet mee", puntOpStaaf(nodes, b, 1000, 3) === null);
  check("op de startknoop telt niet", puntOpStaaf(nodes, b, 0, 0) === null);
  check("op de eindknoop telt niet", puntOpStaaf(nodes, b, 4000, 0) === null);
  check("voorbij de staaf telt niet", puntOpStaaf(nodes, b, 5000, 0) === null);
  check("achter de staaf telt niet", puntOpStaaf(nodes, b, -500, 0) === null);
  // Schuine staaf: het loodrechte voetpunt telt, de afstand tot de as beslist.
  const schuin = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 4000 }];
  check("schuine staaf, punt op de as",
    bijna(puntOpStaaf(schuin, b, 1500, 2000), 0.5, 1e-12));
  check("schuine staaf, punt 100 mm ernaast", puntOpStaaf(schuin, b, 1500, 2100) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: knoop op staaf wordt gemeld met knoopnummer + staafnummer
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Knoop op staaf: melding met nummers en een verbind-actie");
{
  const model = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
      { id: 3, x: 2000, z: 0 }, { id: 4, x: 2000, z: 3000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 3, to: 4 }],
    supports: [{ nodeId: 1 }, { nodeId: 2 }],
    plates: [],
  };
  const bev = zoekKnopenOpStaaf(model);
  check("precies één bevinding", bev.length === 1, `${bev.length}`);
  check("noemt knoop 3", bev[0]?.tekst.includes("Knoop 3"), bev[0]?.tekst);
  check("noemt staaf 1", bev[0]?.tekst.includes("staaf 1"), bev[0]?.tekst);
  check("is een fout", bev[0]?.ernst === "fout");
  check("herstel = verbind 3 met 1",
    bev[0]?.herstel?.soort === "verbind" &&
    bev[0].herstel.nodeId === 3 && bev[0].herstel.beamId === 1);

  // Een knoop die WEL aan de staaf vastzit levert geen bevinding op.
  const heel = { ...model, beams: [
    { id: 1, from: 1, to: 3 }, { id: 3, from: 3, to: 2 }, { id: 2, from: 3, to: 4 },
  ] };
  check("aangesloten knoop levert geen bevinding", zoekKnopenOpStaaf(heel).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: dubbele knopen — verbonden en onverbonden
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Dubbele knopen: altijd gemeld, met samenvoeg-actie");
{
  const model = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 },
      { id: 3, x: 3000, z: 0 }, { id: 4, x: 3000, z: 2500 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 3, to: 4 }],
    supports: [{ nodeId: 1 }],
    plates: [],
  };
  const bev = zoekDubbeleKnopen(model);
  check("één paar gemeld", bev.length === 1, `${bev.length}`);
  check("noemt beide knopen",
    bev[0]?.tekst.includes("Knoop 2") && bev[0]?.tekst.includes("knoop 3"), bev[0]?.tekst);
  check("meldt dat ze NIET verbonden zijn", bev[0]?.tekst.includes("NIET"), bev[0]?.tekst);
  check("laagste id blijft bestaan",
    bev[0]?.herstel?.soort === "voegSamen" &&
    bev[0].herstel.bewaarId === 2 && bev[0].herstel.verwijderId === 3);

  // Verbonden door een staaf van lengte nul: óók fout, andere tekst.
  const nul = { ...model, beams: [...model.beams, { id: 3, from: 2, to: 3 }] };
  const bevNul = zoekDubbeleKnopen(nul);
  check("verbonden paar wordt óók gemeld", bevNul.length === 1);
  check("tekst noemt lengte nul", bevNul[0]?.tekst.includes("lengte nul"), bevNul[0]?.tekst);

  // Buiten de tolerantie: geen bevinding.
  const uitElkaar = { ...model, nodes: model.nodes.map(
    n => n.id === 3 ? { ...n, x: 3005 } : n) };
  check("5 mm uit elkaar is geen dubbele knoop", zoekDubbeleKnopen(uitElkaar).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: vrij uiteinde = waarschuwing; oplegging heft hem op
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Vrij uiteinde: waarschuwing, geen fout");
{
  const console_ = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    supports: [{ nodeId: 1 }],
    plates: [],
  };
  const bev = zoekVrijeUiteinden(console_);
  check("de vrije tip wordt gemeld", bev.length === 1 && bev[0].nodeIds[0] === 2);
  check("het is een waarschuwing", bev[0]?.ernst === "waarschuwing");
  check("geen automatische herstelactie", bev[0]?.herstel === undefined);
  check("een uitkraging blokkeert niet", heeftFouten(bev) === false);

  const gesteund = { ...console_, supports: [{ nodeId: 1 }, { nodeId: 2 }] };
  check("met oplegging geen waarschuwing", zoekVrijeUiteinden(gesteund).length === 0);

  // Een knoop die óók al als fout gemeld is levert geen dubbele regel op.
  const dubbel = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
      { id: 3, x: 2000, z: 0 }, { id: 4, x: 2000, z: 3000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 3, to: 4 }],
    supports: [{ nodeId: 1 }, { nodeId: 2 }],
    plates: [],
  };
  const alles = controleerModel(dubbel);
  check("knoop 3 wordt één keer gemeld",
    alles.filter(b => b.nodeIds.includes(3)).length === 1,
    JSON.stringify(alles.map(b => b.tekst)));
  check("fouten staan vóór waarschuwingen",
    alles[0]?.ernst === "fout");
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: computeBeamSplitOpKnoop — bestaande knoop, geen nieuwe erbij
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Splitsen op een bestaande knoop");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 5, x: 1000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S355", profile: "IPE300" }],
    loads: [],
  };
  const r = computeBeamSplitOpKnoop(cur, 1, 5);
  check("resultaat niet null", r !== null);
  check("twee delen", r.beams.length === 2);
  check("deel 1 loopt 1 → 5", r.beams[0].from === 1 && r.beams[0].to === 5);
  check("deel 2 loopt 5 → 2", r.beams[1].from === 5 && r.beams[1].to === 2);
  check("materiaal geërfd", r.beams.every(b => b.material === "S355"));
  check("profiel geërfd", r.beams.every(b => b.profile === "IPE300"));
  check("splitsen op een eigen eindknoop wordt geweigerd",
    computeBeamSplitOpKnoop(cur, 1, 1) === null);
  check("onbekende knoop wordt geweigerd", computeBeamSplitOpKnoop(cur, 1, 99) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: computeKnoopMetSplitsing — één knoop splitst alle staven eronder
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Knoop plaatsen op een kruispunt: één knoop, beide staven gesplitst");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 },
      { id: 3, x: 2000, z: -2000 }, { id: 4, x: 2000, z: 2000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 3, to: 4 }],
    loads: [],
  };
  const r = computeKnoopMetSplitsing(cur, 2000, 0);
  check("precies één nieuwe knoop", r.nodes.length === 5);
  check("beide staven gesplitst", r.gesplitsteStaven.length === 2, `${r.gesplitsteStaven}`);
  check("vier staven over", r.beams.length === 4, `${r.beams.length}`);
  check("alle vier delen raken de nieuwe knoop",
    r.beams.filter(b => b.from === r.nodeId || b.to === r.nodeId).length === 4);
  check("model gewijzigd", r.gewijzigd === true);

  // Bestaande knoop hergebruiken in plaats van een tweede maken.
  const metKnoop = { ...cur, nodes: [...cur.nodes, { id: 9, x: 1000, z: 0 }] };
  const r2 = computeKnoopMetSplitsing(metKnoop, 1000, 0);
  check("bestaande knoop hergebruikt", r2.nodeId === 9);
  check("geen extra knoop aangemaakt", r2.nodes.length === metKnoop.nodes.length);
  check("de staaf eronder is alsnog gesplitst", r2.gesplitsteStaven.includes(1));

  // Vrij veld: gewoon een knoop, geen splitsing.
  const r3 = computeKnoopMetSplitsing(cur, 3000, 3000);
  check("vrij veld splitst niets", r3.gesplitsteStaven.length === 0);
  check("vrij veld voegt wel een knoop toe", r3.nodes.length === 5);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: deellast verhuist mee naar het juiste deel
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Deellast bij splitsen: juiste deel, juiste grootte");
{
  // Ligger 0..4050, deellast q = −10 kN/m over 0 .. 0,8642 (= tot x = 3500).
  const frac = 3500 / 4050;
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4050, z: 0 }, { id: 3, x: 3500, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE200" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, startFrac: 0, endFrac: frac }],
  };
  const r = computeBeamSplitOpKnoop(cur, 1, 3);
  const deel1 = r.beams[0], deel2 = r.beams[1];
  const op1 = r.loads.filter(l => l.beamId === deel1.id);
  const op2 = r.loads.filter(l => l.beamId === deel2.id);
  check("de last staat volledig op het belaste deel", op1.length === 1 && op2.length === 0,
    `deel1=${op1.length} deel2=${op2.length}`);
  check("het deel is volledig belast (geen fracties meer)",
    op1[0]?.startFrac === undefined && op1[0]?.endFrac === undefined,
    JSON.stringify(op1[0]));
  check("de grootte is onveranderd", op1[0]?.q === -10);
  // Resultante vóór en ná: q × belaste lengte.
  const voor = 10 * (frac - 0) * 4050;
  const na = 10 * 3500;
  check("resultante blijft gelijk", bijna(voor, na, 1e-6), `${voor} vs ${na}`);

  // Deellast die de splitsing overspant, wordt over beide delen verdeeld.
  const cur2 = {
    ...cur,
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, startFrac: 0.2, endFrac: 1 }],
  };
  const r2 = computeBeamSplitOpKnoop(cur2, 1, 3);
  const d1 = r2.beams[0], d2 = r2.beams[1];
  const l1 = r2.loads.find(l => l.beamId === d1.id);
  const l2 = r2.loads.find(l => l.beamId === d2.id);
  check("beide delen krijgen een deel van de last", !!l1 && !!l2);
  const t = 3500 / 4050;
  const lengte1 = 3500, lengte2 = 4050 - 3500;
  const belast1 = ((l1.endFrac ?? 1) - (l1.startFrac ?? 0)) * lengte1;
  const belast2 = ((l2.endFrac ?? 1) - (l2.startFrac ?? 0)) * lengte2;
  check("de som van de belaste lengten klopt",
    bijna(belast1 + belast2, (1 - 0.2) * 4050, 1e-6),
    `${belast1} + ${belast2} vs ${(1 - 0.2) * 4050}`);
  void t;
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 8: knopen samenvoegen
// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Knopen samenvoegen: staven, opleggingen en lasten verhuizen mee");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 },
      { id: 3, x: 3000, z: 0 }, { id: 4, x: 3000, z: 2500 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 3, to: 4 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
    plates: [],
    loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 3, fz: -5 }],
  };
  const r = computeKnopenSamenvoegen(cur, 2, 3);
  check("knoop 3 is weg", r.nodes.every(n => n.id !== 3));
  check("staaf 2 hangt nu aan knoop 2",
    r.beams.find(b => b.id === 2)?.from === 2);
  check("de oplegging van 3 verhuisde naar 2",
    r.supports.some(s => s.nodeId === 2 && s.type === "zRoller"),
    JSON.stringify(r.supports));
  check("geen twee opleggingen op één knoop",
    r.supports.filter(s => s.nodeId === 2).length === 1);
  check("de puntlast verhuisde mee", r.loads[0].nodeId === 2);
  check("gelijke knopen worden geweigerd", computeKnopenSamenvoegen(cur, 2, 2) === null);
  check("onbekende knoop wordt geweigerd", computeKnopenSamenvoegen(cur, 2, 99) === null);

  // Bestaande oplegging op de blijver wint.
  const cur2 = { ...cur, supports: [
    { nodeId: 2, type: "fixed" }, { nodeId: 3, type: "zRoller" },
  ] };
  const r2 = computeKnopenSamenvoegen(cur2, 2, 3);
  check("de oplegging van de blijver wint",
    r2.supports.find(s => s.nodeId === 2)?.type === "fixed");

  // Een staaf die door de samenvoeging lengte nul krijgt verdwijnt.
  const cur3 = { ...cur, beams: [...cur.beams, { id: 3, from: 2, to: 3 }] };
  const r3 = computeKnopenSamenvoegen(cur3, 2, 3);
  check("staaf met lengte nul verdwijnt", r3.beams.every(b => b.id !== 3));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 9: ACCEPTATIEPROEF — portaal op een doorgaande ligger
// ─────────────────────────────────────────────────────────────────────────
// Twee kolomvoeten staan ÓP de doorgaande ligger zonder eraan vast te zitten,
// en de dakligger eindigt op een andere knoop dan de rechterkolom, precies op
// dezelfde plek. Drie gebreken, één mechanisme.
log("\n[9] Acceptatieproef: portaal op een doorgaande ligger");

const SCHARNIER = { startRy: true, endRy: true };
/** Het model met alle drie de gebreken erin. */
function portaalMetGebreken() {
  return {
    nodes: [
      { id: 1, x: 0,    z: 0 },
      { id: 2, x: 4050, z: 0 },
      { id: 3, x: 8100, z: 0 },
      { id: 4, x: 3500, z: 0 },      // voet linkerkolom — ligt ÓP staaf 1
      { id: 5, x: 3500, z: 2500 },
      { id: 6, x: 6500, z: 2500 },   // einde dakligger
      { id: 7, x: 6500, z: 0 },      // voet rechterkolom — ligt ÓP staaf 2
      { id: 8, x: 6500, z: 2500 },   // top rechterkolom — valt samen met 6
    ],
    beams: [
      { id: 1, from: 1, to: 2, material: "S235", profile: "IPE200" },
      { id: 2, from: 2, to: 3, material: "S235", profile: "IPE200" },
      { id: 3, from: 4, to: 5, material: "S235", profile: "SHS60X60X4", releases: SCHARNIER },
      { id: 4, from: 5, to: 6, material: "S235", profile: "HEA140" },
      { id: 5, from: 7, to: 8, material: "S235", profile: "SHS60X60X4", releases: SCHARNIER },
    ],
    supports: [
      { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
      { nodeId: 3, type: "zRoller" }, { nodeId: 5, type: "xRoller" },
    ],
    plates: [],
    loads: [
      // Deellasten precies tot/vanaf de plek waar de kolommen staan.
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, startFrac: 0, endFrac: 3500 / 4050 },
      { id: 2, type: "lineLoad", caseId: 1, beamId: 2, q: -10, startFrac: 2450 / 4050, endFrac: 1 },
    ],
  };
}

/** Totale verticale belasting op het model (kN) — vóór/ná-vergelijking. */
function totaleLijnlast(model) {
  let som = 0;
  for (const l of model.loads) {
    if (l.type !== "lineLoad" || l.beamId === undefined) continue;
    const b = model.beams.find(bb => bb.id === l.beamId);
    if (!b) continue;
    const a = model.nodes.find(n => n.id === b.from);
    const c = model.nodes.find(n => n.id === b.to);
    if (!a || !c) continue;
    const len = Math.hypot(c.x - a.x, c.z - a.z) / 1000; // m
    const deel = ((l.endFrac ?? 1) - (l.startFrac ?? 0));
    som += Math.abs(l.q) * len * deel;
  }
  return som;
}

/** Los het model op via dezelfde route als de app; null = solver weigert. */
function reken(model) {
  const invoer = {
    ...model,
    loadCases: [{ id: 1, name: "Permanent", type: "dead" }],
    selfWeightEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  try {
    return solveAllCases(bouwMultiInput(invoer)).perCase.get(1) ?? null;
  } catch (e) {
    return { fout: e instanceof Error ? e.message : String(e) };
  }
}

{
  const kapot = portaalMetGebreken();

  // 9a — de controle meldt precies de drie gebreken, met knoopnummers.
  const bev = controleerModel(kapot);
  const fouten = bev.filter(b => b.ernst === "fout");
  check("er zijn blokkerende bevindingen", heeftFouten(bev));
  check("drie fouten gemeld", fouten.length === 3, JSON.stringify(fouten.map(f => f.tekst)));
  check("knoop 4 ligt op staaf 1",
    fouten.some(f => f.soort === "knoopOpStaaf" && f.nodeIds[0] === 4 && f.beamId === 1),
    JSON.stringify(fouten.map(f => f.tekst)));
  check("knoop 7 ligt op staaf 2",
    fouten.some(f => f.soort === "knoopOpStaaf" && f.nodeIds[0] === 7 && f.beamId === 2));
  check("knoop 6 en 8 vallen samen",
    fouten.some(f => f.soort === "dubbeleKnoop" &&
      f.nodeIds.includes(6) && f.nodeIds.includes(8)));
  check("elke fout draagt een herstelactie", fouten.every(f => f.herstel !== undefined));

  // 9b — zonder reparatie faalt de solver op een singuliere matrix.
  const voor = reken(kapot);
  check("het model rekent NIET door", voor?.fout !== undefined, JSON.stringify(voor)?.slice(0, 120));
  check("de solverfout is een singuliere matrix",
    /singular/i.test(voor?.fout ?? ""), voor?.fout);

  // 9c — herstel alles.
  const lastVoor = totaleLijnlast(kapot);
  const hersteld = computeModelHerstel(kapot);
  check("herstel levert stappen op", hersteld !== null && hersteld.stappen.length === 3,
    JSON.stringify(hersteld?.stappen));
  check("de stappen noemen de knopen",
    hersteld.stappen.some(s => s.includes("Knoop 4")) &&
    hersteld.stappen.some(s => s.includes("Knoop 7")) &&
    hersteld.stappen.some(s => s.includes("Knoop 8")),
    JSON.stringify(hersteld.stappen));
  check("na herstel zijn er geen fouten meer",
    heeftFouten(controleerModel(hersteld)) === false,
    JSON.stringify(controleerModel(hersteld).map(b => b.tekst)));

  // 9d — het herstelde model rekent door.
  const na = reken(hersteld);
  check("het herstelde model rekent WEL door", na?.fout === undefined, na?.fout);
  check("er komt een verplaatsing uit",
    Number.isFinite(na?.maxDisplacement) && na.maxDisplacement > 0,
    String(na?.maxDisplacement));

  // 9e — dezelfde belasting vóór en ná.
  const lastNa = totaleLijnlast(hersteld);
  check("totale lijnlast onveranderd", bijna(lastVoor, lastNa, 1e-6),
    `${lastVoor} vs ${lastNa} kN`);
  check("de belasting is 51 kN", bijna(lastNa, 51, 1e-6), `${lastNa}`);

  // De verticale reacties moeten die 51 kN samen opnemen: dan is er onderweg
  // geen last verdwenen of verdubbeld.
  let somRz = 0;
  for (const [, r] of na.reactions) somRz += r.fz ?? 0;
  check("de verticale reacties dragen de volle 51 kN",
    bijna(somRz / 1000, 51, 1e-6), `${(somRz / 1000).toFixed(6)} kN`);

  // 9f — het herstel is idempotent: nog eens draaien doet niets.
  check("nogmaals herstellen doet niets", computeModelHerstel(hersteld) === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
